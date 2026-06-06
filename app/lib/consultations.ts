import { and, asc, between, eq, gt, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { ConsultationDocForm, TraineeAction } from "~/lib/consultation-types";
import { canDocument, canTraineeAct, canTrainerReschedule } from "~/lib/consultation-types";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class ConsultationError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

const LIVE_STATUSES = ["planned", "confirmed", "change_requested"] as const;

export interface OccurrenceListItem {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: schema.ConsultationStatus;
  title: string;
  meetingUrl: string | null;
  openItemCount: number;
  totalItemCount: number;
}

/**
 * Terminy podopiecznego w zakresie [fromISO, toISO] (ISO datetime) — pod kalendarz.
 * Tenant-scope: traineeId. Pomija `cancelled`.
 */
export async function listOccurrencesForTrainee(
  db: Db,
  traineeId: string,
  range: { fromISO: string; toISO: string },
): Promise<OccurrenceListItem[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      title: schema.consultations.title,
      meetingUrl: schema.consultations.meetingUrl,
    })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        between(
          schema.consultations.scheduledAt,
          new Date(range.fromISO),
          new Date(range.toISO),
        ),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));

  return rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({
      id: r.id,
      scheduledAt:
        typeof r.scheduledAt === "string"
          ? r.scheduledAt
          : (r.scheduledAt as Date).toISOString(),
      durationMin: r.durationMin,
      status: r.status,
      title: r.title,
      meetingUrl: r.meetingUrl,
      openItemCount: 0,
      totalItemCount: 0,
    }));
}

export interface TrainerCalendarItem {
  id: string;
  traineeId: string;
  traineeName: string;
  scheduledAt: string;
  durationMin: number;
  status: schema.ConsultationStatus;
  title: string;
  meetingUrl: string | null;
}

/**
 * Wszystkie terminy trenera ze WSZYSTKIMI podopiecznymi w zakresie [fromISO, toISO]
 * — pod zbiorczy kalendarz trenera (dobór wolnego slotu). Pomija `cancelled`.
 * Tenant-scope: trainerId.
 */
export async function listTrainerOccurrencesInRange(
  db: Db,
  args: { trainerId: string; fromISO: string; toISO: string },
): Promise<TrainerCalendarItem[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      traineeId: schema.consultations.traineeId,
      traineeName: schema.users.displayName,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      title: schema.consultations.title,
      meetingUrl: schema.consultations.meetingUrl,
    })
    .from(schema.consultations)
    .innerJoin(schema.users, eq(schema.users.id, schema.consultations.traineeId))
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        ne(schema.consultations.status, "cancelled"),
        between(
          schema.consultations.scheduledAt,
          new Date(args.fromISO),
          new Date(args.toISO),
        ),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));

  return rows.map((r) => ({
    id: r.id,
    traineeId: r.traineeId,
    traineeName: r.traineeName,
    scheduledAt:
      typeof r.scheduledAt === "string" ? r.scheduledAt : (r.scheduledAt as Date).toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    title: r.title,
    meetingUrl: r.meetingUrl,
  }));
}

/** Terminy podopiecznego widziane przez trenera (wszystkie statusy). Tenant-scope: trainerId+traineeId. */
export async function listOccurrencesForTrainer(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<schema.Consultation[]> {
  return await db
    .select()
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));
}

/** Liczba terminów czekających na reakcję podopiecznego (badge). Tenant-scope: traineeId. */
export async function countPendingForTrainee(db: Db, traineeId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.consultations.id })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        eq(schema.consultations.status, "planned"),
      ),
    );
  return rows.length;
}

/** Najbliższy żywy termin podopiecznego po `nowISO` (lub null). Tenant-scope: traineeId. */
export async function nextUpcomingForTrainee(
  db: Db,
  traineeId: string,
  nowISO: string,
): Promise<schema.Consultation | null> {
  const [row] = await db
    .select()
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        gt(schema.consultations.scheduledAt, new Date(nowISO)),
        inArray(schema.consultations.status, [...LIVE_STATUSES]),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt))
    .limit(1);
  return row ?? null;
}

export interface ConsultationDetail {
  consultation: schema.Consultation;
  items: schema.ConsultationActionItem[];
}

/** Szczegóły. Tenant-scope: podaj trainerId LUB traineeId. Brak dopasowania → null (404). */
export async function getConsultationDetail(
  db: Db,
  args: { consultationId: string; trainerId?: string; traineeId?: string },
): Promise<ConsultationDetail | null> {
  if (!args.trainerId && !args.traineeId) {
    throw new ConsultationError("scope required", "Brak kontekstu dostępu.");
  }
  const conds = [eq(schema.consultations.id, args.consultationId)];
  if (args.trainerId) conds.push(eq(schema.consultations.trainerId, args.trainerId));
  if (args.traineeId) conds.push(eq(schema.consultations.traineeId, args.traineeId));

  const [c] = await db.select().from(schema.consultations).where(and(...conds)).limit(1);
  if (!c) return null;

  const items = await db
    .select()
    .from(schema.consultationActionItems)
    .where(eq(schema.consultationActionItems.consultationId, args.consultationId))
    .orderBy(asc(schema.consultationActionItems.ordinal));
  return { consultation: c, items };
}

async function assertTraineeOwnedBy(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!row) throw new ConsultationError("trainee not owned", "Nie znaleziono podopiecznego.");
}

/** Termin ad-hoc (poza serią): status `planned` albo od razu `documented`. Tenant-scope: trainerId. */
export async function createAdhocConsultation(
  db: Db,
  input: { trainerId: string; traineeId: string; form: ConsultationDocForm; documented: boolean },
): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    const f = input.form;
    const [row] = await tx
      .insert(schema.consultations)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        scheduleId: null,
        scheduledAt: new Date(`${f.scheduledAt}:00.000Z`),
        durationMin: f.durationMin,
        status: input.documented ? "documented" : "planned",
        meetingUrl: f.meetingUrl ?? null,
        title: f.title,
        summary: f.summary ?? "",
        periodFrom: f.periodFrom ?? null,
        periodTo: f.periodTo ?? null,
      })
      .returning({ id: schema.consultations.id });
    const id = row?.id;
    if (!id) throw new ConsultationError("insert failed", "Nie udało się zapisać konsultacji.");
    if (input.documented) await insertItems(tx, id, f.items);
    return id;
  });
}

/** Dokumentuje termin (status → documented; pola + punkty). Tenant-scope: trainerId. */
export async function documentConsultation(
  db: Db,
  input: { trainerId: string; consultationId: string; form: ConsultationDocForm },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: schema.consultations.id, status: schema.consultations.status })
      .from(schema.consultations)
      .where(
        and(
          eq(schema.consultations.id, input.consultationId),
          eq(schema.consultations.trainerId, input.trainerId),
        ),
      )
      .limit(1);
    if (!c) throw new ConsultationError("not owned", "Nie znaleziono konsultacji.");
    if (!canDocument(c.status)) {
      throw new ConsultationError("bad status", "Nie można udokumentować odwołanego terminu.");
    }
    const f = input.form;
    await tx
      .update(schema.consultations)
      .set({
        scheduledAt: new Date(`${f.scheduledAt}:00.000Z`),
        durationMin: f.durationMin,
        meetingUrl: f.meetingUrl ?? null,
        title: f.title,
        summary: f.summary ?? "",
        periodFrom: f.periodFrom ?? null,
        periodTo: f.periodTo ?? null,
        status: "documented",
      })
      .where(eq(schema.consultations.id, input.consultationId));
    await tx
      .delete(schema.consultationActionItems)
      .where(eq(schema.consultationActionItems.consultationId, input.consultationId));
    await insertItems(tx, input.consultationId, f.items);
  });
}

async function insertItems(
  db: Db,
  consultationId: string,
  items: ConsultationDocForm["items"],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(schema.consultationActionItems).values(
    items.map((it, idx) => ({
      consultationId,
      ordinal: idx,
      body: it.body,
      status: it.status,
      resolvedAt: it.status === "resolved" ? new Date() : null,
    })),
  );
}

/** Trener: przełóż pojedynczy termin (nowy czas, status → planned). Tenant-scope: trainerId. */
export async function rescheduleOccurrence(
  db: Db,
  args: {
    trainerId: string;
    consultationId: string;
    scheduledAtLocal: string;
    durationMin?: number;
  },
): Promise<void> {
  const [c] = await db
    .select({ id: schema.consultations.id, status: schema.consultations.status })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!c) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
  if (!canTrainerReschedule(c.status)) {
    throw new ConsultationError("bad status", "Tego terminu nie można przełożyć.");
  }
  await db
    .update(schema.consultations)
    .set({
      scheduledAt: new Date(`${args.scheduledAtLocal}:00.000Z`),
      status: "planned",
      traineeNote: null,
      ...(args.durationMin ? { durationMin: args.durationMin } : {}),
    })
    .where(eq(schema.consultations.id, args.consultationId));
}

/** Trener: odwołaj pojedynczy termin (status → cancelled). Tenant-scope: trainerId. */
export async function cancelOccurrence(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  const rows = await db
    .update(schema.consultations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.consultations.id });
  if (rows.length === 0) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
}

/** Podopieczny: reakcja na termin. Tylko własny i z dozwolonego statusu. Tenant-scope: traineeId. */
export async function respondToOccurrence(
  db: Db,
  args: { traineeId: string; consultationId: string; action: TraineeAction; note?: string },
): Promise<void> {
  const [c] = await db
    .select({ id: schema.consultations.id, status: schema.consultations.status })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.traineeId, args.traineeId),
      ),
    )
    .limit(1);
  if (!c) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
  if (!canTraineeAct(c.status, args.action)) {
    throw new ConsultationError("bad status", "Tego terminu nie można już zmienić.");
  }
  const nextStatus =
    args.action === "confirm"
      ? "confirmed"
      : args.action === "decline"
        ? "cancelled"
        : "change_requested";
  await db
    .update(schema.consultations)
    .set({
      status: nextStatus,
      traineeNote: args.action === "request_change" ? (args.note ?? null) : null,
    })
    .where(eq(schema.consultations.id, args.consultationId));
}

/** Przełącza status punktu „do poprawy" (tylko właściciel-trener). */
export async function setActionItemStatus(
  db: Db,
  args: { trainerId: string; itemId: string; status: schema.ConsultationItemStatus },
): Promise<void> {
  const [owned] = await db
    .select({ id: schema.consultationActionItems.id })
    .from(schema.consultationActionItems)
    .innerJoin(
      schema.consultations,
      eq(schema.consultations.id, schema.consultationActionItems.consultationId),
    )
    .where(
      and(
        eq(schema.consultationActionItems.id, args.itemId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!owned) throw new ConsultationError("item not owned", "Nie znaleziono punktu.");
  await db
    .update(schema.consultationActionItems)
    .set({ status: args.status, resolvedAt: args.status === "resolved" ? new Date() : null })
    .where(eq(schema.consultationActionItems.id, args.itemId));
}

/** Usuwa konsultację (kaskada kasuje punkty). Tenant-scope: trainerId. */
export async function deleteConsultation(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<boolean> {
  const rows = await db
    .delete(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.consultations.id });
  return rows.length > 0;
}

/** Dane jednego terminu potrzebne do zbudowania zdarzenia Google. Tenant-scope: trainerId. */
export interface ConsultationSyncRow {
  id: string;
  title: string;
  summary: string;
  scheduledAtISO: string;
  durationMin: number;
  status: schema.ConsultationStatus;
  googleEventId: string | null;
  attendeeEmail: string;
}

export async function getSyncRow(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<ConsultationSyncRow | null> {
  const [r] = await db
    .select({
      id: schema.consultations.id,
      title: schema.consultations.title,
      summary: schema.consultations.summary,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      googleEventId: schema.consultations.googleEventId,
      attendeeEmail: schema.users.email,
    })
    .from(schema.consultations)
    .innerJoin(schema.users, eq(schema.users.id, schema.consultations.traineeId))
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAt.toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    googleEventId: r.googleEventId,
    attendeeEmail: r.attendeeEmail,
  };
}

/** Żywe (planned/confirmed/change_requested) nadchodzące terminy pary bez google_event_id — do backfillu. Tenant-scope: trainerId. */
export async function listUnsyncedForSync(
  db: Db,
  args: { trainerId: string; traineeId: string; nowISO: string },
): Promise<ConsultationSyncRow[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      title: schema.consultations.title,
      summary: schema.consultations.summary,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      googleEventId: schema.consultations.googleEventId,
      attendeeEmail: schema.users.email,
    })
    .from(schema.consultations)
    .innerJoin(schema.users, eq(schema.users.id, schema.consultations.traineeId))
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
        gt(schema.consultations.scheduledAt, new Date(args.nowISO)),
        // Żywe statusy (planned/confirmed/change_requested) — spójne z `LIVE_STATUSES`
        // i z guardem `syncUpsertOne` (który pomija tylko cancelled/documented).
        inArray(schema.consultations.status, [...LIVE_STATUSES]),
        isNull(schema.consultations.googleEventId),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAt.toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    googleEventId: r.googleEventId,
    attendeeEmail: r.attendeeEmail,
  }));
}

/** Zapisuje google_event_id (i opcjonalnie meetingUrl z Meet). Tenant-scope: trainerId. */
export async function setGoogleEventId(
  db: Db,
  args: {
    trainerId: string;
    consultationId: string;
    googleEventId: string | null;
    meetingUrl?: string | null;
  },
): Promise<void> {
  await db
    .update(schema.consultations)
    .set({
      googleEventId: args.googleEventId,
      ...(args.meetingUrl !== undefined ? { meetingUrl: args.meetingUrl } : {}),
    })
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    );
}

export interface GoogleEventRef {
  consultationId: string;
  googleEventId: string;
}

/**
 * Wszystkie terminy pary mające zdarzenie Google (dowolny status) — do sprzątnięcia
 * zdarzeń przy usuwaniu podopiecznego. Tenant-scope: trainerId+traineeId.
 */
export async function listGoogleEventIdsForPair(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<GoogleEventRef[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      googleEventId: schema.consultations.googleEventId,
    })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
        isNotNull(schema.consultations.googleEventId),
      ),
    );
  return rows.flatMap((r) =>
    r.googleEventId ? [{ consultationId: r.id, googleEventId: r.googleEventId }] : [],
  );
}

/**
 * Nadchodzące, ODWOŁANE terminy pary, które wciąż mają zdarzenie Google — do
 * sprzątnięcia po dezaktywacji/zmianie harmonogramu (terminy stały się `cancelled`
 * w DB, ale zdarzenie w kalendarzu zostało). `fromISO`: YYYY-MM-DD z route.
 * Tenant-scope: trainerId+traineeId.
 */
export async function listCancelledGoogleEventIds(
  db: Db,
  args: { trainerId: string; traineeId: string; fromISO: string },
): Promise<GoogleEventRef[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      googleEventId: schema.consultations.googleEventId,
    })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
        eq(schema.consultations.status, "cancelled"),
        isNotNull(schema.consultations.googleEventId),
        gte(schema.consultations.scheduledAt, new Date(`${args.fromISO}T00:00:00.000Z`)),
      ),
    );
  return rows.flatMap((r) =>
    r.googleEventId ? [{ consultationId: r.id, googleEventId: r.googleEventId }] : [],
  );
}
