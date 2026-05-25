import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// ============================================================
// Shared statistics aggregations used by both the trainee
// (/podopieczny/statystyki) and trainer (/trener/podopieczni/:id/statystyki)
// views. Every function takes `traineeId` — authorization happens at the
// route layer (trainee = self, trainer = own client).
// ============================================================

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// ============================================================
// Trainee: hero numbers (total sessions, streak, total reps).
// ============================================================

export interface HeroStats {
  totalSessions: number;
  totalReps: number;
  streakWeeks: number;
}

export async function getHeroStats(db: Db, traineeId: string): Promise<HeroStats> {
  const [totalsRow] = await db
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${schema.workoutLogs.id})::int`,
      reps: sql<number>`COALESCE(SUM(${schema.workoutSetLogs.reps}), 0)::bigint`,
    })
    .from(schema.workoutLogs)
    .leftJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.workoutLogId, schema.workoutLogs.id),
    )
    .leftJoin(
      schema.workoutSetLogs,
      eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
    )
    .where(eq(schema.workoutLogs.traineeId, traineeId));

  const totalSessions = Number(totalsRow?.sessions ?? 0);
  const totalReps = Number(totalsRow?.reps ?? 0);

  // Streak: count consecutive ISO weeks (Mon–Sun) ending with this week.
  // We treat the current week as "in progress" — if it has 0 sessions we
  // don't break the streak yet (anchor on last week with activity).
  const weekRows = await db
    .select({
      // date_trunc('week', ...) in Postgres returns Monday 00:00 UTC.
      weekStart: sql<string>`date_trunc('week', ${schema.workoutLogs.performedOn})::date`,
    })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .groupBy(sql`date_trunc('week', ${schema.workoutLogs.performedOn})`)
    .orderBy(sql`date_trunc('week', ${schema.workoutLogs.performedOn}) DESC`);

  const streakWeeks = computeStreak(weekRows.map((r) => r.weekStart));

  return { totalSessions, totalReps, streakWeeks };
}

/**
 * Given an unsorted list of ISO date strings (YYYY-MM-DD) each pinned to a
 * Monday, count the streak of consecutive weeks ending with either the
 * current week or the most recent week with activity. If the most recent
 * activity is older than 1 week beyond "current week minus N", streak ends.
 *
 * Exported for unit testing.
 */
export function computeStreak(weekStarts: string[]): number {
  if (weekStarts.length === 0) return 0;

  const unique = Array.from(new Set(weekStarts)).sort().reverse(); // newest first
  const currentMondayMs = mondayOf(new Date()).getTime();
  const week = 7 * 24 * 60 * 60 * 1000;

  // Find the anchor: current week if it has activity, otherwise allow the
  // previous week (current week is "in progress" — not yet broken).
  const newestActivityMs = new Date(unique[0]!).getTime();
  if (newestActivityMs < currentMondayMs - week) {
    // The newest activity is older than last week → streak is broken.
    return 0;
  }

  // Count back: each step must be exactly `week` apart.
  let streak = 0;
  let expectedMs =
    newestActivityMs === currentMondayMs ? currentMondayMs : currentMondayMs - week;
  for (const ws of unique) {
    const ms = new Date(ws).getTime();
    if (ms === expectedMs) {
      streak += 1;
      expectedMs -= week;
    } else if (ms < expectedMs) {
      // Gap.
      break;
    }
    // ms > expectedMs shouldn't happen given sorted-desc input.
  }
  return streak;
}

function mondayOf(d: Date): Date {
  // Returns the Monday of the week containing `d`, at UTC midnight, to align
  // with Postgres `date_trunc('week', ...)` which uses ISO weeks.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

// ============================================================
// Trainee: this week vs 8-week average.
// ============================================================

export interface ThisWeekStats {
  thisWeek: number;
  avgPerWeek: number; // last 8 completed weeks (excluding current)
}

export async function getThisWeekStats(db: Db, traineeId: string): Promise<ThisWeekStats> {
  const currentMonday = mondayOf(new Date());
  const eightWeeksAgo = new Date(currentMonday.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

  const [thisWeekRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, isoDate(currentMonday)),
      ),
    );

  const [pastRow] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, isoDate(eightWeeksAgo)),
        sql`${schema.workoutLogs.performedOn} < ${isoDate(currentMonday)}`,
      ),
    );

  const past = Number(pastRow?.c ?? 0);
  return {
    thisWeek: Number(thisWeekRow?.c ?? 0),
    avgPerWeek: Math.round((past / 8) * 10) / 10,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ============================================================
// Trainee + Trainer: personal records per exercise.
// ============================================================

export interface PRRecord {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  pr: number;
  prAchievedOn: string; // ISO date
  isFresh: boolean; // achieved in last 7 days
}

export async function getPersonalRecords(
  db: Db,
  traineeId: string,
  opts: { limit?: number } = {},
): Promise<PRRecord[]> {
  // Per exercise: MAX reps + the date of (one of) the workouts that hit it.
  // We use a window function — `RANK() OVER (PARTITION BY exercise_id ORDER BY reps DESC, performed_on DESC)`
  // — to grab a single canonical row per exercise. Recent ties win.
  const sub = db.$with("ranked").as(
    db
      .select({
        exerciseId: schema.workoutExerciseLogs.exerciseId,
        reps: schema.workoutSetLogs.reps,
        performedOn: schema.workoutLogs.performedOn,
        rnk: sql<number>`RANK() OVER (
          PARTITION BY ${schema.workoutExerciseLogs.exerciseId}
          ORDER BY ${schema.workoutSetLogs.reps} DESC,
                   ${schema.workoutLogs.performedOn} DESC
        )`.as("rnk"),
      })
      .from(schema.workoutSetLogs)
      .innerJoin(
        schema.workoutExerciseLogs,
        eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
      )
      .innerJoin(
        schema.workoutLogs,
        eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
      )
      .where(eq(schema.workoutLogs.traineeId, traineeId)),
  );

  const rows = await db
    .with(sub)
    .select({
      exerciseId: sub.exerciseId,
      reps: sub.reps,
      performedOn: sub.performedOn,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(sub)
    .innerJoin(schema.exercises, eq(schema.exercises.id, sub.exerciseId))
    .where(eq(sub.rnk, 1))
    .orderBy(desc(sub.performedOn))
    .limit(opts.limit ?? 50);

  const freshCutoff = isoDaysAgo(7);
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    exerciseName: r.name,
    unit: r.unit,
    pr: r.reps,
    prAchievedOn: r.performedOn,
    isFresh: r.performedOn >= freshCutoff,
  }));
}

// ============================================================
// Trainer: 4 health-check tiles + exercise progress table.
// ============================================================

export interface HealthStats {
  daysSinceLastSession: number | null;
  sessionsLast7: number;
  recentAvgRpe: number; // last 5 sessions
  historicalAvgRpe: number; // all-time
  rpeTrend: "up" | "flat" | "down";
  redZonePct: number; // % sets with difficulty >= 9 in last 30 days
  allDonePct: number; // % sessions with allDone=true in last 30 days
  hasAnyLog30d: boolean;
}

export async function getHealthStats(db: Db, traineeId: string): Promise<HealthStats> {
  const today = isoDate(new Date());
  const sevenDaysAgo = isoDaysAgo(7);
  const thirtyDaysAgo = isoDaysAgo(30);

  // Last session date.
  const [lastRow] = await db
    .select({ last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})` })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId));
  const last = lastRow?.last ?? null;
  const daysSinceLastSession =
    last == null
      ? null
      : Math.max(
          0,
          Math.floor(
            (new Date(today).getTime() - new Date(last).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        );

  // Sessions in last 7 days.
  const [s7Row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, sevenDaysAgo),
      ),
    );

  // Recent avg RPE: last 5 sessions (by performedOn desc, then createdAt).
  const recentLogs = await db
    .select({ id: schema.workoutLogs.id })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .orderBy(desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt))
    .limit(5);
  const recentLogIds = recentLogs.map((r) => r.id);

  let recentAvgRpe = 0;
  if (recentLogIds.length > 0) {
    const [r] = await db
      .select({
        avg: sql<number>`COALESCE(AVG(${schema.workoutSetLogs.difficulty}), 0)::float`,
      })
      .from(schema.workoutSetLogs)
      .innerJoin(
        schema.workoutExerciseLogs,
        eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
      )
      .where(inArray(schema.workoutExerciseLogs.workoutLogId, recentLogIds));
    recentAvgRpe = round1(Number(r?.avg ?? 0));
  }

  // Historical avg RPE.
  const [histRpeRow] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${schema.workoutSetLogs.difficulty}), 0)::float`,
    })
    .from(schema.workoutSetLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
    )
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .where(eq(schema.workoutLogs.traineeId, traineeId));
  const historicalAvgRpe = round1(Number(histRpeRow?.avg ?? 0));

  // Trend: ±0.3 is "flat".
  const delta = recentAvgRpe - historicalAvgRpe;
  const rpeTrend: HealthStats["rpeTrend"] =
    delta > 0.3 ? "up" : delta < -0.3 ? "down" : "flat";

  // Red zone (RPE >= 9) in last 30d.
  const [redRow] = await db
    .select({
      red: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSetLogs.difficulty} >= 9 THEN 1 ELSE 0 END), 0)::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(schema.workoutSetLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
    )
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, thirtyDaysAgo),
      ),
    );
  const redTotal = Number(redRow?.total ?? 0);
  const redZonePct = redTotal === 0 ? 0 : Math.round((Number(redRow!.red) / redTotal) * 100);

  // % sesji allDone in last 30d.
  const [adRow] = await db
    .select({
      done: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutLogs.allDone} THEN 1 ELSE 0 END), 0)::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, thirtyDaysAgo),
      ),
    );
  const adTotal = Number(adRow?.total ?? 0);
  const allDonePct = adTotal === 0 ? 0 : Math.round((Number(adRow!.done) / adTotal) * 100);

  return {
    daysSinceLastSession,
    sessionsLast7: Number(s7Row?.c ?? 0),
    recentAvgRpe,
    historicalAvgRpe,
    rpeTrend,
    redZonePct,
    allDonePct,
    hasAnyLog30d: adTotal > 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ============================================================
// Trainer: exercise progress (PR + delta of last 4 vs prior 4).
// ============================================================

export interface ExerciseProgress {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  pr: number;
  prAchievedOn: string;
  recentAvgReps: number; // avg across most recent 4 workouts of this exercise
  priorAvgReps: number; // avg across previous 4 (positions 5–8)
  deltaPct: number | null; // null when prior has no data
  status: "up" | "flat" | "down" | "new"; // "new" when fewer than 5 sessions
  sessionCount: number; // distinct workout logs that include this exercise
}

export async function getExerciseProgress(
  db: Db,
  traineeId: string,
): Promise<ExerciseProgress[]> {
  // Per (exercise, workout_log) compute average reps for that exercise on that day.
  // Then for each exercise, sort by performedOn desc and split top-4 vs next-4.
  const rows = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      workoutLogId: schema.workoutLogs.id,
      performedOn: schema.workoutLogs.performedOn,
      createdAt: schema.workoutLogs.createdAt,
      avgReps: sql<number>`AVG(${schema.workoutSetLogs.reps})::float`,
      maxReps: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.workoutSetLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
    )
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .innerJoin(
      schema.exercises,
      eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId),
    )
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .groupBy(
      schema.workoutExerciseLogs.exerciseId,
      schema.workoutLogs.id,
      schema.workoutLogs.performedOn,
      schema.workoutLogs.createdAt,
      schema.exercises.name,
      schema.exercises.unit,
    );

  // Group by exercise; sort each group by performedOn DESC, createdAt DESC.
  type Row = (typeof rows)[number];
  const byExercise = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }

  const result: ExerciseProgress[] = [];
  for (const [exerciseId, group] of byExercise) {
    group.sort((a, b) => {
      if (a.performedOn !== b.performedOn) {
        return a.performedOn < b.performedOn ? 1 : -1;
      }
      return (a.createdAt < b.createdAt ? 1 : -1);
    });
    const first = group[0]!;

    // PR: max(maxReps) + the date when it happened (newest tie wins).
    let pr = 0;
    let prAchievedOn = first.performedOn;
    for (const r of group) {
      if (Number(r.maxReps) > pr) {
        pr = Number(r.maxReps);
        prAchievedOn = r.performedOn;
      }
    }

    const recent = group.slice(0, 4);
    const prior = group.slice(4, 8);
    const recentAvg = recent.length === 0 ? 0 : avg(recent.map((r) => Number(r.avgReps)));
    const priorAvg = prior.length === 0 ? 0 : avg(prior.map((r) => Number(r.avgReps)));

    let status: ExerciseProgress["status"];
    let deltaPct: number | null;
    if (group.length < 5) {
      status = "new";
      deltaPct = null;
    } else {
      deltaPct = priorAvg === 0 ? 0 : Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
      status = deltaPct > 5 ? "up" : deltaPct < -5 ? "down" : "flat";
    }

    result.push({
      exerciseId,
      exerciseName: first.exerciseName,
      unit: first.unit,
      pr,
      prAchievedOn,
      recentAvgReps: round1(recentAvg),
      priorAvgReps: round1(priorAvg),
      deltaPct,
      status,
      sessionCount: group.length,
    });
  }

  // Sort: "down" first (needs attention), then "flat", "up", "new" last.
  const order: Record<ExerciseProgress["status"], number> = {
    down: 0,
    flat: 1,
    up: 2,
    new: 3,
  };
  result.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.exerciseName.localeCompare(b.exerciseName, "pl");
  });

  return result;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ============================================================
// PR detection after a workout save — used by the logging route to drive
// the "Pobiłeś rekord!" toast.
// ============================================================

export interface NewPRForLog {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  reps: number;
}

/**
 * Given a freshly-saved workoutLogId for this trainee, return the list of
 * exercises whose PR was set or tied in *that* log (i.e. the max reps in
 * this log is ≥ all prior logs' max for that exercise).
 *
 * Ties with prior count as "fresh PR" too — same logical reason as
 * `getPersonalRecords` favouring the newest date.
 */
export async function detectNewPRsForLog(
  db: Db,
  traineeId: string,
  workoutLogId: string,
): Promise<NewPRForLog[]> {
  // Max reps per exercise in this log.
  const thisLog = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      maxReps: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.workoutSetLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
    )
    .innerJoin(
      schema.exercises,
      eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId),
    )
    .where(eq(schema.workoutExerciseLogs.workoutLogId, workoutLogId))
    .groupBy(
      schema.workoutExerciseLogs.exerciseId,
      schema.exercises.name,
      schema.exercises.unit,
    );

  if (thisLog.length === 0) return [];

  const exerciseIds = thisLog.map((r) => r.exerciseId);

  // Prior max per exercise across all OTHER logs for this trainee.
  const priors = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      priorMax: sql<number>`COALESCE(MAX(${schema.workoutSetLogs.reps}), 0)::int`,
    })
    .from(schema.workoutSetLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
    )
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        sql`${schema.workoutLogs.id} <> ${workoutLogId}`,
        inArray(schema.workoutExerciseLogs.exerciseId, exerciseIds),
      ),
    )
    .groupBy(schema.workoutExerciseLogs.exerciseId);
  const priorByEx = new Map(priors.map((p) => [p.exerciseId, Number(p.priorMax)]));

  const out: NewPRForLog[] = [];
  for (const r of thisLog) {
    const prior = priorByEx.get(r.exerciseId) ?? 0;
    const thisMax = Number(r.maxReps);
    if (thisMax > prior) {
      // Strict greater: first-time exercise (prior=0) always qualifies if any
      // reps were logged.
      out.push({
        exerciseId: r.exerciseId,
        exerciseName: r.name,
        unit: r.unit,
        reps: thisMax,
      });
    }
  }
  return out;
}
