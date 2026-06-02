import type { Db } from "~/lib/db/client";
import { getAuthedClient, getConnectionStatus } from "~/lib/google/connections";
import { deleteEvent, insertEvent, patchEvent } from "~/lib/google/calendar";
import type { ConsultationEventInput } from "~/lib/google/calendar";
import {
  getSyncRow,
  listUnsyncedForSync,
  setGoogleEventId,
  type ConsultationSyncRow,
} from "~/lib/consultations";

/**
 * Loguje WYŁĄCZNIE kod/status błędu i stały komunikat — nigdy `err.message`/całego
 * obiektu z SDK, bo google-auth-library/@googleapis/calendar potrafią umieścić tam
 * nagłówek `Authorization: Bearer …` lub treść z refresh_token.
 */
function logSyncError(label: string, err: unknown): void {
  const code =
    (err as { code?: number; status?: number }).code ??
    (err as { status?: number }).status;
  console.error(`[google-sync] ${label} failed`, code ? `(code ${code})` : "(no code)");
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
 * Backfill: wypycha wszystkie nadchodzące, niezsynchronizowane terminy pary.
 * Wołane przy save-schedule i przez intent „sync-google". Best-effort, bounded
 * liczbą terminów w oknie HORIZON. Tenant-scope: trainerId.
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
    const rows = await listUnsyncedForSync(db, args);
    for (const row of rows) {
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
  } catch (err) {
    logSyncError("backfill", err);
  }
  return { attempted, synced };
}

/** Czy integracja jest dostępna dla danego trenera (do UI). */
export async function isGoogleSyncActive(db: Db, trainerId: string): Promise<boolean> {
  return (await getConnectionStatus(db, trainerId)).connected;
}
