import type { Db } from "~/lib/db/client";
import { getAuthedClient, getConnectionStatus } from "~/lib/google/connections";
import { deleteEvent, insertEvent, patchEvent } from "~/lib/google/calendar";
import type { ConsultationEventInput } from "~/lib/google/calendar";
import {
  getSyncRow,
  listCancelledGoogleEventIds,
  listGoogleEventIdsForPair,
  listSyncedForRepair,
  listUnsyncedForSync,
  setGoogleEventId,
  type ConsultationSyncRow,
} from "~/lib/consultations";
import { errorMeta, logger } from "~/lib/logger";

/**
 * Loguje WYŁĄCZNIE kod/status błędu i stały komunikat — nigdy `err.message`/całego
 * obiektu z SDK, bo google-auth-library/@googleapis/calendar potrafią umieścić tam
 * nagłówek `Authorization: Bearer …` lub treść z refresh_token.
 */
function logSyncError(label: string, err: unknown): void {
  logger.error("google_sync.failed", { op: label, ...errorMeta(err) });
}

function toEventInput(r: ConsultationSyncRow): ConsultationEventInput {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAtISO,
    durationMin: r.durationMin,
    attendeeEmail: r.attendeeEmail,
  };
}

/**
 * Best-effort: jeśli trener ma podpięty Google, wypycha JEDEN termin (create albo patch)
 * i zapisuje google_event_id + meetingUrl z Meet. Każdy błąd jest połykany (logowany),
 * nigdy nie przerywa żądania. Wołać POST-commit (poza transakcją). Tenant-scope: trainerId.
 */
export async function syncUpsertOne(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return; // brak połączenia — no-op
    const row = await getSyncRow(db, {
      trainerId: args.trainerId,
      consultationId: args.consultationId,
    });
    if (!row) return;
    if (row.status === "cancelled" || row.status === "documented") return;

    if (row.googleEventId) {
      await patchEvent(authed.client, authed.calendarId, row.googleEventId, toEventInput(row));
    } else {
      const { eventId, meetUrl } = await insertEvent(
        authed.client,
        authed.calendarId,
        toEventInput(row),
      );
      await setGoogleEventId(db, {
        trainerId: args.trainerId,
        consultationId: row.id,
        googleEventId: eventId,
        meetingUrl: meetUrl ?? undefined,
      });
    }
  } catch (err) {
    logSyncError("upsert", err);
  }
}

/**
 * Best-effort delete zdarzenia po cancel/odrzuceniu. Czyści google_event_id.
 * Tenant-scope: trainerId.
 */
export async function syncCancelOne(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return;
    const row = await getSyncRow(db, {
      trainerId: args.trainerId,
      consultationId: args.consultationId,
    });
    if (!row?.googleEventId) return;
    await deleteEvent(authed.client, authed.calendarId, row.googleEventId);
    await setGoogleEventId(db, {
      trainerId: args.trainerId,
      consultationId: row.id,
      googleEventId: null,
    });
  } catch (err) {
    logSyncError("cancel", err);
  }
}

/**
 * Best-effort: kasuje WSZYSTKIE zdarzenia Google pary (przy usuwaniu podopiecznego).
 * No-op gdy trener bez połączenia. Nie czyści `google_event_id` (wiersze i tak zaraz
 * znikną w kaskadzie DB). Wołać PRZED usunięciem podopiecznego (potem join po trainee
 * w `getSyncRow` by nie zadziałał). Każdy błąd połykany. Tenant-scope: trainerId.
 */
export async function syncCancelAllForPair(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return;
    const refs = await listGoogleEventIdsForPair(db, args);
    for (const ref of refs) {
      try {
        await deleteEvent(authed.client, authed.calendarId, ref.googleEventId);
      } catch (err) {
        logSyncError(`cancel-all item ${ref.consultationId}`, err);
      }
    }
  } catch (err) {
    logSyncError("cancel-all", err);
  }
}

/**
 * Best-effort: kasuje zdarzenia Google nadchodzących, ODWOŁANYCH terminów pary i
 * czyści ich `google_event_id`. Używane po dezaktywacji/zmianie harmonogramu, gdzie
 * terminy stały się `cancelled` w DB, ale zdarzenia w kalendarzu zostały. Wiersze tu
 * POZOSTAJĄ (w przeciwieństwie do usuwania podopiecznego), więc czyścimy referencję.
 * No-op gdy trener bez połączenia. `fromISO`: YYYY-MM-DD. Tenant-scope: trainerId.
 */
export async function syncCancelStaleSchedule(
  db: Db,
  args: { trainerId: string; traineeId: string; fromISO: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return;
    const refs = await listCancelledGoogleEventIds(db, args);
    for (const ref of refs) {
      try {
        await deleteEvent(authed.client, authed.calendarId, ref.googleEventId);
        await setGoogleEventId(db, {
          trainerId: args.trainerId,
          consultationId: ref.consultationId,
          googleEventId: null,
        });
      } catch (err) {
        logSyncError(`cancel-stale item ${ref.consultationId}`, err);
      }
    }
  } catch (err) {
    logSyncError("cancel-stale", err);
  }
}

/**
 * Backfill + naprawa: wypycha nadchodzące terminy pary bez zdarzenia Google ORAZ
 * wyrównuje (`patch`) te, które zdarzenie już mają — dzięki czemu terminy wysłane
 * przed poprawką stref same wracają na właściwą godzinę. Wołane przy save-schedule
 * i przez intent „sync-google". Best-effort, bounded liczbą terminów w oknie HORIZON.
 * Tenant-scope: trainerId.
 */
export async function syncBackfillPair(
  db: Db,
  args: { trainerId: string; traineeId: string; nowISO: string },
): Promise<{ attempted: number; synced: number }> {
  let attempted = 0;
  let synced = 0;
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return { attempted, synced };
    // Oba zbiory czytamy PRZED zapisami — inaczej terminy właśnie wstawione miałyby
    // już `google_event_id` i zostałyby od razu niepotrzebnie zpatchowane (dubel maila).
    const missing = await listUnsyncedForSync(db, args);
    const present = await listSyncedForRepair(db, args);

    for (const row of missing) {
      attempted += 1;
      try {
        const { eventId, meetUrl } = await insertEvent(
          authed.client,
          authed.calendarId,
          toEventInput(row),
        );
        await setGoogleEventId(db, {
          trainerId: args.trainerId,
          consultationId: row.id,
          googleEventId: eventId,
          meetingUrl: meetUrl ?? undefined,
        });
        synced += 1;
      } catch (err) {
        logSyncError(`backfill item ${row.id}`, err);
      }
    }

    for (const row of present) {
      if (!row.googleEventId) continue; // niemożliwe wg zapytania — zawężenie typu
      attempted += 1;
      try {
        await patchEvent(authed.client, authed.calendarId, row.googleEventId, toEventInput(row));
        synced += 1;
      } catch (err) {
        logSyncError(`repair item ${row.id}`, err);
      }
    }
  } catch (err) {
    logSyncError("backfill", err);
  }
  return { attempted, synced };
}

/** Czy integracja jest dostępna dla danego trenera (do UI). */
export async function isGoogleSyncActive(db: Db, trainerId: string): Promise<boolean> {
  return (await getConnectionStatus(db, trainerId)).connected;
}
