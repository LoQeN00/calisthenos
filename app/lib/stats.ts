import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// ============================================================
// Shared statistics aggregations used by both the trainee
// (/podopieczny/statystyki) and trainer (/trener/podopieczni/:id/statystyki)
// views. Every function takes `traineeId` — authorization happens at the
// route layer (trainee = self, trainer = own client).
// ============================================================

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function mondayOf(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc;
}

// ============================================================
// Hero numbers
// ============================================================

export interface HeroStats {
  totalSessions: number;
  totalReps: number;
  totalSecondsUnderTension: number;
  streakWeeks: number;
  longestStreakWeeks: number;
  journeyDayNumber: number; // 0 when no sessions
  firstSessionOn: string | null;
}

export async function getHeroStats(db: Db, traineeId: string): Promise<HeroStats> {
  // Totals: count sessions, sum reps separately for REPS-unit and SEC-unit
  // exercises (a "rep" of a SEC exercise is a second, not a count).
  const [totalsRow] = await db
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${schema.workoutLogs.id})::int`,
      reps: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'REPS' THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      secs: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'SEC'  THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      first: sql<string | null>`MIN(${schema.workoutLogs.performedOn})`,
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
    .leftJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(eq(schema.workoutLogs.traineeId, traineeId));

  const totalSessions = Number(totalsRow?.sessions ?? 0);
  const totalReps = Number(totalsRow?.reps ?? 0);
  const totalSecondsUnderTension = Number(totalsRow?.secs ?? 0);
  const firstSessionOn = totalsRow?.first ?? null;

  // Streak: count consecutive ISO weeks (Mon–Sun) ending with this week.
  const weekRows = await db
    .select({
      weekStart: sql<string>`date_trunc('week', ${schema.workoutLogs.performedOn})::date`,
    })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .groupBy(sql`date_trunc('week', ${schema.workoutLogs.performedOn})`)
    .orderBy(sql`date_trunc('week', ${schema.workoutLogs.performedOn}) DESC`);

  const allWeeks = weekRows.map((r) => r.weekStart);
  const streakWeeks = computeStreak(allWeeks);
  const longestStreakWeeks = computeLongestStreak(allWeeks);

  const journeyDayNumber =
    firstSessionOn == null
      ? 0
      : Math.max(
          1,
          Math.floor(
            (new Date(isoDate(new Date())).getTime() - new Date(firstSessionOn).getTime()) /
              (24 * 60 * 60 * 1000),
          ) + 1,
        );

  return {
    totalSessions,
    totalReps,
    totalSecondsUnderTension,
    streakWeeks,
    longestStreakWeeks,
    journeyDayNumber,
    firstSessionOn,
  };
}

export function computeStreak(weekStarts: string[]): number {
  if (weekStarts.length === 0) return 0;
  const unique = Array.from(new Set(weekStarts)).sort().reverse();
  const currentMondayMs = mondayOf(new Date()).getTime();
  const week = 7 * 24 * 60 * 60 * 1000;
  const newestActivityMs = new Date(unique[0]!).getTime();
  if (newestActivityMs < currentMondayMs - week) return 0;
  let streak = 0;
  let expectedMs = newestActivityMs === currentMondayMs ? currentMondayMs : currentMondayMs - week;
  for (const ws of unique) {
    const ms = new Date(ws).getTime();
    if (ms === expectedMs) {
      streak += 1;
      expectedMs -= week;
    } else if (ms < expectedMs) {
      break;
    }
  }
  return streak;
}

export function computeLongestStreak(weekStarts: string[]): number {
  if (weekStarts.length === 0) return 0;
  const unique = Array.from(new Set(weekStarts)).sort();
  const week = 7 * 24 * 60 * 60 * 1000;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]!).getTime();
    const here = new Date(unique[i]!).getTime();
    if (here - prev === week) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

// ============================================================
// This week vs 8-week average
// ============================================================

export interface ThisWeekStats {
  thisWeek: number;
  avgPerWeek: number;
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
    avgPerWeek: round1(past / 8),
  };
}

// ============================================================
// Health-check tiles for trainer
// ============================================================

export interface HealthStats {
  daysSinceLastSession: number | null;
  sessionsLast7: number;
  sessionsLast30: number;
  avgIntervalDays: number | null;
  recentAvgRpe: number;
  historicalAvgRpe: number;
  rpeTrend: "up" | "flat" | "down";
  redZonePct: number;
  allDonePct: number;
  hasAnyLog30d: boolean;
}

export async function getHealthStats(db: Db, traineeId: string): Promise<HealthStats> {
  const today = isoDate(new Date());
  const sevenDaysAgo = isoDaysAgo(7);
  const thirtyDaysAgo = isoDaysAgo(30);

  // Last + first session, total count for interval calculation.
  const [boundsRow] = await db
    .select({
      last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`,
      first: sql<string | null>`MIN(${schema.workoutLogs.performedOn})`,
      c: sql<number>`COUNT(*)::int`,
    })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId));
  const last = boundsRow?.last ?? null;
  const first = boundsRow?.first ?? null;
  const total = Number(boundsRow?.c ?? 0);

  const daysSinceLastSession =
    last == null
      ? null
      : Math.max(
          0,
          Math.floor(
            (new Date(today).getTime() - new Date(last).getTime()) / (24 * 60 * 60 * 1000),
          ),
        );
  const avgIntervalDays =
    last == null || first == null || total < 2
      ? null
      : round1(
          (new Date(last).getTime() - new Date(first).getTime()) /
            (24 * 60 * 60 * 1000) /
            (total - 1),
        );

  const [s7Row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, sevenDaysAgo),
      ),
    );
  const [s30Row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, thirtyDaysAgo),
      ),
    );

  // Recent avg RPE: last 5 sessions.
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
        avg: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
      })
      .from(schema.workoutSetLogs)
      .innerJoin(
        schema.workoutExerciseLogs,
        eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
      )
      .where(inArray(schema.workoutExerciseLogs.workoutLogId, recentLogIds));
    recentAvgRpe = r?.avg == null ? 0 : round1(Number(r.avg));
  }

  const [histRpeRow] = await db
    .select({
      avg: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
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
  const historicalAvgRpe = histRpeRow?.avg == null ? 0 : round1(Number(histRpeRow.avg));

  // 0 oznacza „brak ocenionych serii w oknie” (skala to 1–10), nie realne RPE.
  // Trend liczymy tylko gdy OBA okna mają oceny — inaczej (np. ostatnie sesje bez
  // RPE, a historia z RPE) delta sfabrykowałaby „spadek/wzrost”. Brak danych → flat.
  const delta = recentAvgRpe - historicalAvgRpe;
  const rpeTrend: HealthStats["rpeTrend"] =
    recentAvgRpe === 0 || historicalAvgRpe === 0
      ? "flat"
      : delta > 0.3
        ? "up"
        : delta < -0.3
          ? "down"
          : "flat";

  const [redRow] = await db
    .select({
      red: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSetLogs.difficulty} >= 9 THEN 1 ELSE 0 END), 0)::int`,
      total: sql<number>`COUNT(${schema.workoutSetLogs.difficulty})::int`,
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
    sessionsLast30: Number(s30Row?.c ?? 0),
    avgIntervalDays,
    recentAvgRpe,
    historicalAvgRpe,
    rpeTrend,
    redZonePct,
    allDonePct,
    hasAnyLog30d: adTotal > 0,
  };
}

// ============================================================
// Activity heatmap (per-day session counts, last N weeks)
// ============================================================

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Returns one entry per day going back `weeks` ISO weeks (Mon-anchored).
 * Days with no sessions get count = 0. The array is ordered chronologically.
 */
export async function getActivityHeatmap(
  db: Db,
  traineeId: string,
  weeks: number,
): Promise<HeatmapDay[]> {
  const startMonday = new Date(
    mondayOf(new Date()).getTime() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      date: schema.workoutLogs.performedOn,
      c: sql<number>`COUNT(*)::int`,
    })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, isoDate(startMonday)),
      ),
    )
    .groupBy(schema.workoutLogs.performedOn);
  const byDate = new Map(rows.map((r) => [r.date, Number(r.c)]));

  const out: HeatmapDay[] = [];
  const days = weeks * 7;
  for (let i = 0; i < days; i++) {
    const d = new Date(startMonday.getTime() + i * 24 * 60 * 60 * 1000);
    const key = isoDate(d);
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

// ============================================================
// Exercise progress (PR + delta of last 4 vs prior 4) + plateau + sparklines
// ============================================================

export interface ExerciseProgress {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  pr: number;
  prAchievedOn: string;
  recentAvgReps: number;
  priorAvgReps: number;
  recentAvgRpe: number;
  priorAvgRpe: number;
  deltaPct: number | null;
  status: "up" | "flat" | "down" | "new";
  sessionCount: number;
}

interface PerExerciseRow {
  exerciseId: string;
  workoutLogId: string;
  performedOn: string;
  createdAt: Date;
  avgReps: number;
  maxReps: number;
  avgRpe: number | null;
  exerciseName: string;
  unit: "REPS" | "SEC";
}

async function loadPerExerciseHistory(
  db: Db,
  traineeId: string,
): Promise<Map<string, PerExerciseRow[]>> {
  const rows = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      workoutLogId: schema.workoutLogs.id,
      performedOn: schema.workoutLogs.performedOn,
      createdAt: schema.workoutLogs.createdAt,
      avgReps: sql<number>`AVG(${schema.workoutSetLogs.reps})::float`,
      maxReps: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
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
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .groupBy(
      schema.workoutExerciseLogs.exerciseId,
      schema.workoutLogs.id,
      schema.workoutLogs.performedOn,
      schema.workoutLogs.createdAt,
      schema.exercises.name,
      schema.exercises.unit,
    );

  const byExercise = new Map<string, PerExerciseRow[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push({
      exerciseId: r.exerciseId,
      workoutLogId: r.workoutLogId,
      performedOn: r.performedOn,
      createdAt: r.createdAt,
      avgReps: Number(r.avgReps),
      maxReps: Number(r.maxReps),
      avgRpe: r.avgRpe == null ? null : Number(r.avgRpe),
      exerciseName: r.exerciseName,
      unit: r.unit,
    });
    byExercise.set(r.exerciseId, list);
  }
  // Sort each group desc (newest first).
  for (const list of byExercise.values()) {
    list.sort((a, b) => {
      if (a.performedOn !== b.performedOn) {
        return a.performedOn < b.performedOn ? 1 : -1;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }
  return byExercise;
}

export async function getExerciseProgress(db: Db, traineeId: string): Promise<ExerciseProgress[]> {
  const byExercise = await loadPerExerciseHistory(db, traineeId);
  const result: ExerciseProgress[] = [];

  for (const group of byExercise.values()) {
    const first = group[0]!;
    let pr = 0;
    let prAchievedOn = first.performedOn;
    for (const r of group) {
      if (r.maxReps > pr) {
        pr = r.maxReps;
        prAchievedOn = r.performedOn;
      }
    }

    const recent = group.slice(0, 4);
    const prior = group.slice(4, 8);
    const recentAvg = avg(recent.map((r) => r.avgReps));
    const priorAvg = avg(prior.map((r) => r.avgReps));
    const ratedRecent = recent.map((r) => r.avgRpe).filter((x): x is number => x != null);
    const ratedPrior = prior.map((r) => r.avgRpe).filter((x): x is number => x != null);
    const recentRpe = avg(ratedRecent);
    const priorRpe = avg(ratedPrior);

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
      exerciseId: first.exerciseId,
      exerciseName: first.exerciseName,
      unit: first.unit,
      pr,
      prAchievedOn,
      recentAvgReps: round1(recentAvg),
      priorAvgReps: round1(priorAvg),
      recentAvgRpe: round1(recentRpe),
      priorAvgRpe: round1(priorRpe),
      deltaPct,
      status,
      sessionCount: group.length,
    });
  }

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

// ============================================================
// Plateau detector: ≥3 recent sessions with flat/declining reps AND non-falling RPE
// ============================================================

export interface PlateauExercise {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  sessionsConsidered: number;
  recentAvgReps: number;
  recentAvgRpe: number;
  pr: number;
}

export async function getPlateauExercises(db: Db, traineeId: string): Promise<PlateauExercise[]> {
  const byExercise = await loadPerExerciseHistory(db, traineeId);
  const out: PlateauExercise[] = [];

  for (const group of byExercise.values()) {
    if (group.length < 3) continue;
    const window = group.slice(0, Math.min(4, group.length));

    // Reps: not increasing across the window (sorted desc means values stay
    // flat or get lower going back in time → "not increasing" means newest
    // value ≤ oldest in window).
    const newestReps = window[0]!.avgReps;
    const oldestReps = window[window.length - 1]!.avgReps;
    const repsStuck = newestReps <= oldestReps + 0.5; // tolerate noise

    // RPE: not decreasing (struggling at least as much as before).
    const newestRpeRaw = window[0]!.avgRpe;
    const oldestRpeRaw = window[window.length - 1]!.avgRpe;
    if (newestRpeRaw == null || oldestRpeRaw == null) continue; // brak RPE → brak sygnału plateau
    const newestRpe = newestRpeRaw;
    const oldestRpe = oldestRpeRaw;
    const rpeNonFalling = newestRpe >= oldestRpe - 0.3;

    if (repsStuck && rpeNonFalling) {
      let pr = 0;
      for (const r of group) if (r.maxReps > pr) pr = r.maxReps;
      out.push({
        exerciseId: group[0]!.exerciseId,
        exerciseName: group[0]!.exerciseName,
        unit: group[0]!.unit,
        sessionsConsidered: window.length,
        recentAvgReps: round1(newestReps),
        recentAvgRpe: round1(newestRpe),
        pr,
      });
    }
  }

  out.sort((a, b) => b.recentAvgRpe - a.recentAvgRpe);
  return out;
}

// ============================================================
// "Easier at the same reps" — same reps now, lower RPE than historically
// ============================================================

export interface EasierExercise {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  reps: number;
  recentRpe: number;
  priorRpe: number;
  recentDate: string;
  priorDate: string;
}

export async function getEasierAtSameReps(db: Db, traineeId: string): Promise<EasierExercise[]> {
  const byExercise = await loadPerExerciseHistory(db, traineeId);
  const out: EasierExercise[] = [];

  // For each exercise, look at the most-recent session's rounded avgReps.
  // Find an older session (>= 30 days earlier) with the same rounded reps
  // and a higher avg RPE (≥ 1.0 difference for signal).
  for (const group of byExercise.values()) {
    if (group.length < 2) continue;
    const recent = group[0]!;
    if (recent.avgRpe == null) continue;
    const recentRoundedReps = Math.round(recent.avgReps);
    if (recentRoundedReps === 0) continue;
    const recentDateMs = new Date(recent.performedOn).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    let best: PerExerciseRow | null = null;
    let bestRpe = 0;
    for (let i = 1; i < group.length; i++) {
      const prev = group[i]!;
      if (prev.avgRpe == null) continue;
      if (Math.round(prev.avgReps) !== recentRoundedReps) continue;
      if (recentDateMs - new Date(prev.performedOn).getTime() < thirtyDays) continue;
      if (prev.avgRpe - recent.avgRpe < 1) continue;
      if (best == null || prev.avgRpe > bestRpe) {
        best = prev;
        bestRpe = prev.avgRpe;
      }
    }
    if (best != null) {
      out.push({
        exerciseId: recent.exerciseId,
        exerciseName: recent.exerciseName,
        unit: recent.unit,
        reps: recentRoundedReps,
        recentRpe: round1(recent.avgRpe),
        priorRpe: round1(bestRpe),
        recentDate: recent.performedOn,
        priorDate: best.performedOn,
      });
    }
  }

  out.sort((a, b) => b.priorRpe - b.recentRpe - (a.priorRpe - a.recentRpe));
  return out;
}

// ============================================================
// Effort balance (last 30d)
// ============================================================

export interface EffortBalance {
  easy: number;
  mid: number;
  hard: number;
  total: number;
  verdict: "balanced" | "too-hard" | "too-easy" | "no-data";
}

export async function getEffortBalance(db: Db, traineeId: string): Promise<EffortBalance> {
  const thirtyDaysAgo = isoDaysAgo(30);
  const sessions = await db
    .select({
      id: schema.workoutLogs.id,
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
    })
    .from(schema.workoutLogs)
    .innerJoin(
      schema.workoutExerciseLogs,
      eq(schema.workoutExerciseLogs.workoutLogId, schema.workoutLogs.id),
    )
    .innerJoin(
      schema.workoutSetLogs,
      eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
    )
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, thirtyDaysAgo),
      ),
    )
    .groupBy(schema.workoutLogs.id);

  // Buckets aligned with the UI legend (Lekkie ≤ 4 / Umiarkowane 5–7 / Ciężkie ≥ 8).
  // Session avg RPE is a float, so we treat [<5, <8, ≥8] as the integer-bucket
  // equivalents — an avg of 4.x still feels "light", an avg of 7.x still feels
  // "moderate".
  let easy = 0;
  let mid = 0;
  let hard = 0;
  for (const s of sessions) {
    if (s.avgRpe == null) continue; // sesja bez żadnej oceny RPE nie wchodzi do bilansu wysiłku
    const rpe = Number(s.avgRpe);
    if (rpe < 5) easy++;
    else if (rpe < 8) mid++;
    else hard++;
  }
  const total = easy + mid + hard;
  let verdict: EffortBalance["verdict"];
  if (total === 0) verdict = "no-data";
  else if (hard / total > 0.5) verdict = "too-hard";
  else if (easy / total > 0.5) verdict = "too-easy";
  else verdict = "balanced";

  return { easy, mid, hard, total, verdict };
}

// ============================================================
// Tag distribution (last 30d) — % per category from exercises.tags
// ============================================================

export interface TagShare {
  tag: string;
  count: number;
  pct: number;
}

export async function getTagDistribution(
  db: Db,
  traineeId: string,
  days = 30,
): Promise<{ shares: TagShare[]; untagged: number; totalExerciseLogs: number }> {
  const cutoff = isoDaysAgo(days);

  // One row per exercise-log occurrence in the window, with that exercise's tags.
  const rows = await db
    .select({
      tags: schema.exercises.tags,
    })
    .from(schema.workoutExerciseLogs)
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(
      and(eq(schema.workoutLogs.traineeId, traineeId), gte(schema.workoutLogs.performedOn, cutoff)),
    );

  const counts = new Map<string, number>();
  let untagged = 0;
  for (const r of rows) {
    if (!r.tags || r.tags.length === 0) {
      untagged += 1;
      continue;
    }
    // Each tag on the exercise gets one "credit" per occurrence.
    for (const t of r.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const totalCredits = Array.from(counts.values()).reduce((a, b) => a + b, 0) + untagged;
  const shares: TagShare[] = Array.from(counts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      pct: totalCredits === 0 ? 0 : Math.round((count / totalCredits) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return { shares, untagged, totalExerciseLogs: rows.length };
}

// ============================================================
// Plan session usage — how often each plan_session was performed (active plan)
// ============================================================

export interface PlanSessionUsage {
  sessionId: string;
  sessionName: string;
  ordinal: number;
  doneCount: number;
  lastPerformedOn: string | null;
}

export async function getActivePlanSessionUsage(
  db: Db,
  traineeId: string,
): Promise<{ planName: string | null; sessions: PlanSessionUsage[] }> {
  const [plan] = await db
    .select({ id: schema.plans.id, name: schema.plans.name })
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, traineeId), eq(schema.plans.status, "active")))
    .limit(1);
  if (!plan) return { planName: null, sessions: [] };

  const sessions = await db
    .select({
      id: schema.planSessions.id,
      name: schema.planSessions.name,
      ordinal: schema.planSessions.ordinal,
    })
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, plan.id))
    .orderBy(asc(schema.planSessions.ordinal));
  if (sessions.length === 0) return { planName: plan.name, sessions: [] };

  const counts = await db
    .select({
      sessionId: schema.workoutLogs.planSessionId,
      c: sql<number>`COUNT(*)::int`,
      last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`,
    })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        eq(schema.workoutLogs.planId, plan.id),
        inArray(
          schema.workoutLogs.planSessionId,
          sessions.map((s) => s.id),
        ),
      ),
    )
    .groupBy(schema.workoutLogs.planSessionId);
  const byId = new Map(counts.map((r) => [r.sessionId, r]));

  return {
    planName: plan.name,
    sessions: sessions.map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      ordinal: s.ordinal,
      doneCount: Number(byId.get(s.id)?.c ?? 0),
      lastPerformedOn: byId.get(s.id)?.last ?? null,
    })),
  };
}

// ============================================================
// Current plan totals (reps / seconds-under-tension / sets)
// ============================================================

export interface CurrentPlanTotals {
  planName: string | null;
  publishedAt: string | null;
  totalSets: number;
  totalReps: number;
  totalSeconds: number;
  totalSessionsOnPlan: number;
}

export async function getCurrentPlanTotals(db: Db, traineeId: string): Promise<CurrentPlanTotals> {
  const [plan] = await db
    .select({
      id: schema.plans.id,
      name: schema.plans.name,
      publishedAt: schema.plans.publishedAt,
    })
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, traineeId), eq(schema.plans.status, "active")))
    .limit(1);
  if (!plan) {
    return {
      planName: null,
      publishedAt: null,
      totalSets: 0,
      totalReps: 0,
      totalSeconds: 0,
      totalSessionsOnPlan: 0,
    };
  }

  const [row] = await db
    .select({
      sets: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`,
      reps: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'REPS' THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      secs: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'SEC'  THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      sessions: sql<number>`COUNT(DISTINCT ${schema.workoutLogs.id})::int`,
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
    .leftJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(
      and(eq(schema.workoutLogs.traineeId, traineeId), eq(schema.workoutLogs.planId, plan.id)),
    );

  return {
    planName: plan.name,
    publishedAt: plan.publishedAt ? plan.publishedAt.toISOString() : null,
    totalSets: Number(row?.sets ?? 0),
    totalReps: Number(row?.reps ?? 0),
    totalSeconds: Number(row?.secs ?? 0),
    totalSessionsOnPlan: Number(row?.sessions ?? 0),
  };
}

// ============================================================
// Video coverage (% sets with a video, last 30d)
// ============================================================

export interface VideoCoverage {
  pct: number;
  withVideo: number;
  total: number;
}

export async function getVideoCoverage(
  db: Db,
  traineeId: string,
  days = 30,
): Promise<VideoCoverage> {
  const cutoff = isoDaysAgo(days);
  const [row] = await db
    .select({
      withVideo: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSetLogs.videoFileId} IS NOT NULL THEN 1 ELSE 0 END), 0)::int`,
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
      and(eq(schema.workoutLogs.traineeId, traineeId), gte(schema.workoutLogs.performedOn, cutoff)),
    );
  const total = Number(row?.total ?? 0);
  const withVideo = Number(row?.withVideo ?? 0);
  return {
    total,
    withVideo,
    pct: total === 0 ? 0 : Math.round((withVideo / total) * 100),
  };
}

// ============================================================
// Body photo coverage
// ============================================================

export interface BodyPhotoCoverage {
  totalPhotos: number;
  daysSinceLast: number | null;
  views: { front: boolean; side: boolean; back: boolean };
}

export async function getBodyPhotoCoverage(db: Db, traineeId: string): Promise<BodyPhotoCoverage> {
  const rows = await db
    .select({
      view: schema.bodyPhotos.view,
      takenOn: schema.bodyPhotos.takenOn,
    })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, traineeId));

  const views = { front: false, side: false, back: false };
  let lastIso: string | null = null;
  for (const r of rows) {
    if (r.view === "front") views.front = true;
    else if (r.view === "side") views.side = true;
    else if (r.view === "back") views.back = true;
    if (lastIso == null || r.takenOn > lastIso) lastIso = r.takenOn;
  }
  const daysSinceLast =
    lastIso == null
      ? null
      : Math.max(
          0,
          Math.floor(
            (new Date(isoDate(new Date())).getTime() - new Date(lastIso).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        );
  return { totalPhotos: rows.length, daysSinceLast, views };
}

// ============================================================
// Side-by-side body photos (first vs latest per view)
// ============================================================

export interface SideBySidePhotoPair {
  view: schema.BodyPhotoView;
  first: { id: string; fileId: string; takenOn: string } | null;
  latest: { id: string; fileId: string; takenOn: string } | null;
  hasPair: boolean;
  daysBetween: number | null;
}

export async function getSideBySidePhotoPairs(
  db: Db,
  traineeId: string,
): Promise<SideBySidePhotoPair[]> {
  const rows = await db
    .select({
      id: schema.bodyPhotos.id,
      fileId: schema.bodyPhotos.fileId,
      view: schema.bodyPhotos.view,
      takenOn: schema.bodyPhotos.takenOn,
    })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, traineeId))
    .orderBy(asc(schema.bodyPhotos.takenOn));

  const views: schema.BodyPhotoView[] = ["front", "side", "back"];
  return views.map((view) => {
    const ofView = rows.filter((r) => r.view === view);
    const first = ofView[0] ?? null;
    const latest = ofView[ofView.length - 1] ?? null;
    const isSame = first && latest && first.id === latest.id;
    const daysBetween =
      first && latest && !isSame
        ? Math.floor(
            (new Date(latest.takenOn).getTime() - new Date(first.takenOn).getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;
    return {
      view,
      first,
      latest,
      hasPair: !!(first && latest && !isSame),
      daysBetween,
    };
  });
}

// ============================================================
// PR detection after a workout save (used by logging route → toast)
// ============================================================

export interface NewPRForLog {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  reps: number;
}

export async function detectNewPRsForLog(
  db: Db,
  traineeId: string,
  workoutLogId: string,
): Promise<NewPRForLog[]> {
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
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(eq(schema.workoutExerciseLogs.workoutLogId, workoutLogId))
    .groupBy(schema.workoutExerciseLogs.exerciseId, schema.exercises.name, schema.exercises.unit);

  if (thisLog.length === 0) return [];

  const exerciseIds = thisLog.map((r) => r.exerciseId);

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
