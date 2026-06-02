import { and, eq, gte } from "drizzle-orm";
import { type RecurrenceRule, nextOccurrences } from "~/lib/consultation-recurrence";
import type { ScheduleForm } from "~/lib/consultation-types";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class ScheduleError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/** Okno materializacji terminów (dni w przód). */
export const HORIZON_DAYS = 70;

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
  if (!row) throw new ScheduleError("trainee not owned", "Nie znaleziono podopiecznego.");
}

/** Aktywny harmonogram pary trener-podopieczny (lub null). Tenant-scope: trainerId. */
export async function getActiveSchedule(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<schema.ConsultationSchedule | null> {
  const [row] = await db
    .select()
    .from(schema.consultationSchedules)
    .where(
      and(
        eq(schema.consultationSchedules.trainerId, args.trainerId),
        eq(schema.consultationSchedules.traineeId, args.traineeId),
        eq(schema.consultationSchedules.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

function ruleFromSchedule(s: schema.ConsultationSchedule): RecurrenceRule {
  return {
    cadence: s.cadence,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    timeOfDay: s.timeOfDay.slice(0, 5), // "HH:MM:SS" -> "HH:MM"
    startsOn: s.startsOn,
  };
}

/** Tytuł domyślny dla zaplanowanego terminu, np. "Konsultacja — 11.06.2026". */
export function defaultTitle(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `Konsultacja — ${dd}.${mm}.${d.getUTCFullYear()}`;
}

/**
 * Materializuje brakujące terminy `planned` dla harmonogramu w oknie HORIZON_DAYS.
 * Idempotentne dzięki unikatowi (schedule_id, scheduled_at) + onConflictDoNothing.
 * `fromISO` (YYYY-MM-DD) podawane z route (np. todayISO()) — repo nie woła Date.now bezpośrednio.
 */
export async function ensureOccurrences(
  db: Db,
  scheduleId: string,
  fromISO: string,
): Promise<void> {
  const [s] = await db
    .select()
    .from(schema.consultationSchedules)
    .where(eq(schema.consultationSchedules.id, scheduleId))
    .limit(1);
  if (!s || !s.active) return;

  const dates = nextOccurrences(ruleFromSchedule(s), { from: fromISO, horizonDays: HORIZON_DAYS });
  if (dates.length === 0) return;

  await db
    .insert(schema.consultations)
    .values(
      dates.map((iso) => ({
        trainerId: s.trainerId,
        traineeId: s.traineeId,
        scheduleId: s.id,
        scheduledAt: new Date(iso),
        durationMin: s.durationMin,
        status: "planned" as const,
        meetingUrl: s.defaultMeetingUrl ?? null,
        title: defaultTitle(iso),
      })),
    )
    .onConflictDoNothing({
      target: [schema.consultations.scheduleId, schema.consultations.scheduledAt],
    });
}

export interface UpsertScheduleInput {
  trainerId: string;
  traineeId: string;
  form: ScheduleForm;
  fromISO: string;
}

/**
 * Ustawia harmonogram pary (jeden aktywny). Dezaktywuje poprzedni, tworzy nowy,
 * regeneruje przyszłe terminy. Niepotwierdzone `planned` ze STAREGO harmonogramu
 * są odpinane (anulowane), `confirmed`/`documented` zostają. Tenant-scope: trainerId.
 */
export async function upsertSchedule(db: Db, input: UpsertScheduleInput): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    // Anuluj przyszłe, niepotwierdzone terminy z dotychczasowych aktywnych serii.
    const old = await tx
      .select({ id: schema.consultationSchedules.id })
      .from(schema.consultationSchedules)
      .where(
        and(
          eq(schema.consultationSchedules.trainerId, input.trainerId),
          eq(schema.consultationSchedules.traineeId, input.traineeId),
          eq(schema.consultationSchedules.active, true),
        ),
      );
    for (const o of old) {
      await tx
        .update(schema.consultations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.consultations.scheduleId, o.id),
            eq(schema.consultations.status, "planned"),
            gte(schema.consultations.scheduledAt, new Date(`${input.fromISO}T00:00:00.000Z`)),
          ),
        );
      await tx
        .update(schema.consultationSchedules)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(schema.consultationSchedules.id, o.id));
    }

    const f = input.form;
    const [row] = await tx
      .insert(schema.consultationSchedules)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        cadence: f.cadence,
        weekday: f.cadence === "monthly" ? null : (f.weekday ?? null),
        dayOfMonth: f.cadence === "monthly" ? (f.dayOfMonth ?? null) : null,
        timeOfDay: f.timeOfDay,
        durationMin: f.durationMin,
        startsOn: f.startsOn,
        defaultMeetingUrl: f.defaultMeetingUrl ?? null,
        active: true,
      })
      .returning({ id: schema.consultationSchedules.id });
    const id = row?.id;
    if (!id) throw new ScheduleError("insert failed", "Nie udało się zapisać harmonogramu.");
    await ensureOccurrences(tx, id, input.fromISO);
    return id;
  });
}

/**
 * Wyłącza harmonogram („nigdy"): dezaktywuje + anuluje przyszłe niepotwierdzone
 * `planned`. Tenant-scope: trainerId.
 */
export async function deactivateSchedule(
  db: Db,
  args: { trainerId: string; traineeId: string; fromISO: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.consultationSchedules)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.consultationSchedules.trainerId, args.trainerId),
          eq(schema.consultationSchedules.traineeId, args.traineeId),
          eq(schema.consultationSchedules.active, true),
        ),
      )
      .returning({ id: schema.consultationSchedules.id });
    for (const r of rows) {
      await tx
        .update(schema.consultations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.consultations.scheduleId, r.id),
            eq(schema.consultations.status, "planned"),
            gte(schema.consultations.scheduledAt, new Date(`${args.fromISO}T00:00:00.000Z`)),
          ),
        );
    }
  });
}
