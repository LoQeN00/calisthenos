import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  aggregateToWeeks,
  computePeriodChangePct,
  markPrs,
  normalizeToPctFromStart,
  rangeStartIso,
  shouldAggregateWeekly,
  statusFromSessions,
  type ChartPoint,
  type ProgressionListRow,
  type ProgressionRange,
  type SessionPoint,
} from "./progression-math";

/** Today as YYYY-MM-DD (UTC). Isolated so callers/tests can reason about it. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RawSession extends SessionPoint {
  exerciseId: string;
  createdAt: Date;
  name: string;
  unit: "REPS" | "SEC";
  tags: string[];
}

/**
 * Per-session aggregates for one trainee (optionally one exercise), newest-first
 * within each exercise group. Mirrors the join pattern in stats.ts.
 */
async function loadProgressionSessions(
  db: Db,
  traineeId: string,
  exerciseId?: string,
): Promise<Map<string, RawSession[]>> {
  const base = exerciseId
    ? and(
        eq(schema.workoutLogs.traineeId, traineeId),
        eq(schema.workoutExerciseLogs.exerciseId, exerciseId),
      )
    : eq(schema.workoutLogs.traineeId, traineeId);
  // Zarchiwizowane ćwiczenia znikają z Rozwoju (lista „Pozostałe ćwiczenia" oraz
  // szczegół ćwiczenia → 404) — pełna symetria z biblioteką i pickerami.
  const where = and(base, isNull(schema.exercises.archivedAt));

  const rows = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      performedOn: schema.workoutLogs.performedOn,
      createdAt: schema.workoutLogs.createdAt,
      best: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
      avgReps: sql<number>`AVG(${schema.workoutSetLogs.reps})::float`,
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
      volume: sql<number>`COALESCE(SUM(${schema.workoutSetLogs.reps}), 0)::int`,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
      tags: schema.exercises.tags,
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
    .where(where)
    .groupBy(
      schema.workoutExerciseLogs.exerciseId,
      schema.workoutLogs.id,
      schema.workoutLogs.performedOn,
      schema.workoutLogs.createdAt,
      schema.exercises.name,
      schema.exercises.unit,
      schema.exercises.tags,
    );

  const byExercise = new Map<string, RawSession[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push({
      exerciseId: r.exerciseId,
      performedOn: r.performedOn,
      createdAt: r.createdAt,
      best: Number(r.best),
      avgReps: Number(r.avgReps),
      avgRpe: r.avgRpe == null ? null : Number(r.avgRpe),
      volume: Number(r.volume),
      name: r.name,
      unit: r.unit,
      tags: r.tags ?? [],
    });
    byExercise.set(r.exerciseId, list);
  }
  // newest-first within each exercise
  for (const list of byExercise.values()) {
    list.sort((a, b) =>
      a.performedOn !== b.performedOn
        ? a.performedOn < b.performedOn
          ? 1
          : -1
        : a.createdAt < b.createdAt
          ? 1
          : -1,
    );
  }
  return byExercise;
}

/** Landing-list rows (unsorted; caller sorts by role). Only exercises with ≥1 logged set appear. */
export async function listProgressionExercises(
  db: Db,
  traineeId: string,
): Promise<ProgressionListRow[]> {
  const byExercise = await loadProgressionSessions(db, traineeId);
  const rows: ProgressionListRow[] = [];
  for (const group of byExercise.values()) {
    const first = group[0]!;
    let pr = 0;
    let prAchievedOn = first.performedOn;
    for (const r of group) {
      if (r.best > pr) {
        pr = r.best;
        prAchievedOn = r.performedOn;
      }
    }
    const chrono = [...group].reverse();
    const sparkline = chrono.slice(-12).map((r) => r.best);
    rows.push({
      exerciseId: first.exerciseId,
      name: first.name,
      unit: first.unit,
      tags: first.tags,
      sessionCount: group.length,
      lastPerformedOn: first.performedOn,
      pr,
      prAchievedOn,
      sparkline,
      status: statusFromSessions(group),
    });
  }
  return rows;
}

/** Returns the trainee {id, displayName} iff it belongs to this trainer; otherwise null (caller → 404). */
export async function findTraineeOfTrainer(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<{ id: string; displayName: string } | null> {
  const rows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Re-export for routes/sibling tasks that only need the loader-facing pieces.
export { loadProgressionSessions, markPrs };

export interface ProgressionKpis {
  pr: number;
  prAchievedOn: string;
  lastBest: number;
  lastDelta: number | null; // vs previous session (all-history)
  periodChangePct: number | null;
  sessionsInRange: number;
  avgRpeInRange: number | null;
}

export interface ExerciseProgressionView {
  exercise: { id: string; name: string; unit: "REPS" | "SEC" };
  granularity: "session" | "week";
  points: ChartPoint[]; // chronological, ready for charts
  kpis: ProgressionKpis;
}

/** Full timeline for one exercise within a range. null when the exercise has no logs (→ 404). */
export async function getExerciseProgression(
  db: Db,
  traineeId: string,
  exerciseId: string,
  range: ProgressionRange,
): Promise<ExerciseProgressionView | null> {
  const byExercise = await loadProgressionSessions(db, traineeId, exerciseId);
  const group = byExercise.get(exerciseId);
  if (!group || group.length === 0) return null;

  // All-history PR + chronological order.
  let pr = 0;
  let prAchievedOn = group[group.length - 1]!.performedOn;
  for (const r of group) {
    if (r.best > pr) {
      pr = r.best;
      prAchievedOn = r.performedOn;
    }
  }
  const chronoAll: SessionPoint[] = [...group].reverse();
  const lastBest = group[0]!.best;
  const lastDelta = group.length >= 2 ? group[0]!.best - group[1]!.best : null;

  // Filter to range (session-level).
  const start = rangeStartIso(range, todayIso());
  const inRange = start ? chronoAll.filter((p) => p.performedOn >= start) : chronoAll;

  const periodChangePct = computePeriodChangePct(inRange);
  const ratedInRange = inRange.map((p) => p.avgRpe).filter((x): x is number => x != null);
  const avgRpeInRange =
    ratedInRange.length === 0
      ? null
      : Math.round((ratedInRange.reduce((a, b) => a + b, 0) / ratedInRange.length) * 10) / 10;

  // Aggregate for display when the range is long.
  const aggregate = shouldAggregateWeekly(range);
  const series = aggregate ? aggregateToWeeks(inRange) : inRange;
  const points = markPrs(series);

  return {
    exercise: { id: group[0]!.exerciseId, name: group[0]!.name, unit: group[0]!.unit },
    granularity: aggregate ? "week" : "session",
    points,
    kpis: {
      pr,
      prAchievedOn,
      lastBest,
      lastDelta,
      periodChangePct,
      sessionsInRange: inRange.length,
      avgRpeInRange,
    },
  };
}

export interface ComparisonSeries {
  exerciseId: string;
  name: string;
  unit: "REPS" | "SEC";
  startValue: number; // best na początku okresu (surowo)
  endValue: number; // best na końcu okresu (surowo)
  points: Array<{ performedOn: string; pct: number }>;
}

export interface ComparisonView {
  series: ComparisonSeries[];
  skipped: Array<{ exerciseId: string; name: string; reason: string }>;
}

/** Normalized (% from start) overlay for several exercises. Mixed units OK. */
export async function getProgressionComparison(
  db: Db,
  traineeId: string,
  exerciseIds: string[],
  range: ProgressionRange,
): Promise<ComparisonView> {
  const start = rangeStartIso(range, todayIso());
  const series: ComparisonSeries[] = [];
  const skipped: ComparisonView["skipped"] = [];

  for (const id of exerciseIds) {
    const byExercise = await loadProgressionSessions(db, traineeId, id);
    const group = byExercise.get(id);
    if (!group || group.length === 0) {
      skipped.push({ exerciseId: id, name: id, reason: "brak danych" });
      continue;
    }
    const chrono: SessionPoint[] = [...group].reverse();
    const inRange = start ? chrono.filter((p) => p.performedOn >= start) : chrono;
    const pct = normalizeToPctFromStart(inRange.map((p) => p.best));
    if (pct === null) {
      skipped.push({ exerciseId: id, name: group[0]!.name, reason: "za mało danych do porównania" });
      continue;
    }
    series.push({
      exerciseId: id,
      name: group[0]!.name,
      unit: group[0]!.unit,
      startValue: inRange[0]!.best,
      endValue: inRange[inRange.length - 1]!.best,
      points: inRange.map((p, i) => ({ performedOn: p.performedOn, pct: pct[i]! })),
    });
  }
  return { series, skipped };
}
