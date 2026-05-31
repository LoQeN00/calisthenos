import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// ============================================================
// Monthly "Wrapped" — Spotify-style retrospective for the trainee.
// Unlocks on the 1st of the month following the month it covers.
// ============================================================

const MONTH_NAMES = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First-day-of-month (inclusive) and first-day-of-next-month (exclusive), ISO. */
function monthBounds(year: number, month: number): { start: string; nextStart: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const nextStart = new Date(Date.UTC(year, month, 1));
  return { start: isoDate(start), nextStart: isoDate(nextStart) };
}

/** Now's year+month (1-12) in UTC. */
function currentYM(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Is the given (year, month) strictly before the current UTC month? */
export function isPastMonth(year: number, month: number): boolean {
  const { year: cy, month: cm } = currentYM();
  return year < cy || (year === cy && month < cm);
}

/** Parse "YYYY-MM" → {year, month} or null. */
export function parseYM(raw: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function formatYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ============================================================
// Available months
// ============================================================

export interface AvailableMonth {
  year: number;
  month: number;
  ym: string; // "YYYY-MM"
  label: string;
  sessions: number;
}

/**
 * Return every past month (≤ last completed month) that has at least one
 * workout log for this trainee, newest first.
 */
export async function getAvailableWrappedMonths(
  db: Db,
  traineeId: string,
): Promise<AvailableMonth[]> {
  const rows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${schema.workoutLogs.performedOn})::int`,
      month: sql<number>`EXTRACT(MONTH FROM ${schema.workoutLogs.performedOn})::int`,
      c: sql<number>`COUNT(*)::int`,
    })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .groupBy(
      sql`EXTRACT(YEAR FROM ${schema.workoutLogs.performedOn})`,
      sql`EXTRACT(MONTH FROM ${schema.workoutLogs.performedOn})`,
    );

  return rows
    .map((r) => ({
      year: Number(r.year),
      month: Number(r.month),
      ym: formatYM(Number(r.year), Number(r.month)),
      label: monthLabel(Number(r.year), Number(r.month)),
      sessions: Number(r.c),
    }))
    .filter((m) => isPastMonth(m.year, m.month))
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
}

/**
 * The newest available (= past + has data) month for this trainee, or null.
 * Used to drive the "fresh wrapped" banner on the dashboard.
 */
export async function getLatestAvailableWrapped(
  db: Db,
  traineeId: string,
): Promise<AvailableMonth | null> {
  const all = await getAvailableWrappedMonths(db, traineeId);
  return all[0] ?? null;
}

// ============================================================
// Wrapped summary
// ============================================================

export type ArchetypeKey =
  | "power-user"
  | "experimenter"
  | "consistent"
  | "maximalist"
  | "specialist"
  | "endurance"
  | "all-rounder"
  | "patient"
  | "explorer";

export interface Archetype {
  key: ArchetypeKey;
  label: string;
  description: string;
  emoji: string;
}

export interface MonthlyPR {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  reps: number;
  previousBest: number; // 0 if first time
}

export interface HeaviestDay {
  date: string;
  sessionName: string;
  setCount: number;
  totalReps: number;
  avgRpe: number | null;
}

export interface TopExercise {
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  sessionsInvolved: number;
  pctOfSessions: number;
}

export interface VsPrevious {
  hasPrevious: boolean;
  sessionsThis: number;
  sessionsPrev: number;
  sessionsDelta: number;
  repsThis: number;
  repsPrev: number;
  repsDeltaPct: number | null;
  avgRpeThis: number | null;
  avgRpePrev: number | null;
  rpeDelta: number | null;
}

export interface WrappedSummary {
  year: number;
  month: number;
  ym: string;
  label: string;
  hasData: boolean;
  sessions: number;
  totalReps: number;
  totalSeconds: number;
  totalSets: number;
  weeksActive: number; // ISO weeks of this month with ≥1 session
  topExercise: TopExercise | null;
  prs: MonthlyPR[];
  heaviestDay: HeaviestDay | null;
  archetype: Archetype;
  vsPrevious: VsPrevious;
}

// ----------------------------------------------------------------
// Internal: lightweight stats for a month (used for current + previous).
// ----------------------------------------------------------------

interface MonthCore {
  sessions: number;
  totalReps: number;
  totalSeconds: number;
  totalSets: number;
  avgRpe: number | null;
  redZoneSets: number;
  ratedSets: number;
}

async function loadMonthCore(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
): Promise<MonthCore> {
  const { start, nextStart } = monthBounds(year, month);

  const [row] = await db
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${schema.workoutLogs.id})::int`,
      sets: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`,
      reps: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'REPS' THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      secs: sql<number>`COALESCE(SUM(CASE WHEN ${schema.exercises.unit} = 'SEC' THEN ${schema.workoutSetLogs.reps} ELSE 0 END), 0)::bigint`,
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
      red: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSetLogs.difficulty} >= 9 THEN 1 ELSE 0 END), 0)::int`,
      ratedSets: sql<number>`COUNT(${schema.workoutSetLogs.difficulty})::int`,
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
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, start),
        sql`${schema.workoutLogs.performedOn} < ${nextStart}`,
      ),
    );

  return {
    sessions: Number(row?.sessions ?? 0),
    totalSets: Number(row?.sets ?? 0),
    totalReps: Number(row?.reps ?? 0),
    totalSeconds: Number(row?.secs ?? 0),
    avgRpe: row?.avgRpe == null ? null : Math.round(Number(row.avgRpe) * 10) / 10,
    redZoneSets: Number(row?.red ?? 0),
    ratedSets: Number(row?.ratedSets ?? 0),
  };
}

// ----------------------------------------------------------------
// Internal: top exercise (by # sessions involving it) within month.
// ----------------------------------------------------------------

async function loadTopExercise(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
  totalSessions: number,
): Promise<{ top: TopExercise | null; distinctExercises: number; topPct: number }> {
  const { start, nextStart } = monthBounds(year, month);
  const rows = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
      sessions: sql<number>`COUNT(DISTINCT ${schema.workoutLogs.id})::int`,
    })
    .from(schema.workoutExerciseLogs)
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, start),
        sql`${schema.workoutLogs.performedOn} < ${nextStart}`,
      ),
    )
    .groupBy(schema.workoutExerciseLogs.exerciseId, schema.exercises.name, schema.exercises.unit)
    .orderBy(sql`COUNT(DISTINCT ${schema.workoutLogs.id}) DESC`);

  if (rows.length === 0) {
    return { top: null, distinctExercises: 0, topPct: 0 };
  }
  const topRow = rows[0]!;
  const pct = totalSessions === 0 ? 0 : Math.round((Number(topRow.sessions) / totalSessions) * 100);
  return {
    top: {
      exerciseId: topRow.exerciseId,
      exerciseName: topRow.name,
      unit: topRow.unit,
      sessionsInvolved: Number(topRow.sessions),
      pctOfSessions: pct,
    },
    distinctExercises: rows.length,
    topPct: pct,
  };
}

// ----------------------------------------------------------------
// Internal: PRs achieved in this month.
// ----------------------------------------------------------------

async function loadMonthlyPRs(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
): Promise<{ prs: MonthlyPR[]; newExercises: number }> {
  const { start, nextStart } = monthBounds(year, month);

  // Max reps per exercise IN this month.
  const thisMonth = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
      maxReps: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
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
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, start),
        sql`${schema.workoutLogs.performedOn} < ${nextStart}`,
      ),
    )
    .groupBy(schema.workoutExerciseLogs.exerciseId, schema.exercises.name, schema.exercises.unit);

  if (thisMonth.length === 0) {
    return { prs: [], newExercises: 0 };
  }

  // Max reps per exercise BEFORE this month (across all of trainee's history).
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
        sql`${schema.workoutLogs.performedOn} < ${start}`,
      ),
    )
    .groupBy(schema.workoutExerciseLogs.exerciseId);
  const priorByEx = new Map(priors.map((p) => [p.exerciseId, Number(p.priorMax)]));

  const prs: MonthlyPR[] = [];
  let newExercises = 0;
  for (const r of thisMonth) {
    const prior = priorByEx.get(r.exerciseId) ?? 0;
    const thisMax = Number(r.maxReps);
    if (prior === 0) {
      newExercises += 1;
    }
    if (thisMax > prior) {
      prs.push({
        exerciseId: r.exerciseId,
        exerciseName: r.name,
        unit: r.unit,
        reps: thisMax,
        previousBest: prior,
      });
    }
  }
  // Order by improvement (delta), then by reps desc.
  prs.sort((a, b) => b.reps - b.previousBest - (a.reps - a.previousBest) || b.reps - a.reps);
  return { prs, newExercises };
}

// ----------------------------------------------------------------
// Internal: heaviest day (max total reps in a single workout) this month.
// ----------------------------------------------------------------

async function loadHeaviestDay(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
): Promise<HeaviestDay | null> {
  const { start, nextStart } = monthBounds(year, month);
  const rows = await db
    .select({
      logId: schema.workoutLogs.id,
      performedOn: schema.workoutLogs.performedOn,
      sessionName: schema.workoutLogs.sessionName,
      setCount: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`,
      totalReps: sql<number>`COALESCE(SUM(${schema.workoutSetLogs.reps}), 0)::bigint`,
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
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
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, start),
        sql`${schema.workoutLogs.performedOn} < ${nextStart}`,
      ),
    )
    .groupBy(schema.workoutLogs.id, schema.workoutLogs.performedOn, schema.workoutLogs.sessionName)
    .orderBy(sql`COALESCE(SUM(${schema.workoutSetLogs.reps}), 0) DESC`)
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    date: r.performedOn,
    sessionName: r.sessionName,
    setCount: Number(r.setCount),
    totalReps: Number(r.totalReps),
    avgRpe: r.avgRpe == null ? null : Math.round(Number(r.avgRpe) * 10) / 10,
  };
}

// ----------------------------------------------------------------
// Internal: weeks active in this month.
// ----------------------------------------------------------------

async function loadWeeksActive(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
): Promise<number> {
  const { start, nextStart } = monthBounds(year, month);
  const rows = await db
    .select({
      week: sql<string>`date_trunc('week', ${schema.workoutLogs.performedOn})::date`,
    })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        gte(schema.workoutLogs.performedOn, start),
        sql`${schema.workoutLogs.performedOn} < ${nextStart}`,
      ),
    )
    .groupBy(sql`date_trunc('week', ${schema.workoutLogs.performedOn})`);
  return rows.length;
}

// ----------------------------------------------------------------
// Archetype selector — first matching rule wins. Priority list ordered
// from most "distinctive" to most "default".
// ----------------------------------------------------------------

interface ArchetypeInputs {
  core: MonthCore;
  prCount: number;
  newExercises: number;
  weeksActive: number;
  weeksInMonth: number;
  topPct: number;
  distinctExercises: number;
}

function pickArchetype(i: ArchetypeInputs): Archetype {
  // 1) ≥3 PR-y → Power user (rare, celebratory)
  if (i.prCount >= 3) {
    return {
      key: "power-user",
      label: "Power user",
      description: `Pobiłeś ${i.prCount} rekordy w jednym miesiącu. To miesiąc dla książek.`,
      emoji: "🚀",
    };
  }
  // 2) Wykonał nowe ćwiczenia (≥2) → Eksperymentator
  if (i.newExercises >= 2) {
    return {
      key: "experimenter",
      label: "Eksperymentator",
      description: `Wypróbowałeś ${i.newExercises} nowe ćwiczenia. Komfort to nie Twoje.`,
      emoji: "🧪",
    };
  }
  // 3) Aktywność w każdym tygodniu miesiąca (>=4 tyg) → Konsekwentny
  if (i.weeksActive >= 4 && i.weeksActive >= i.weeksInMonth - 1) {
    return {
      key: "consistent",
      label: "Konsekwentny",
      description: "Trenowałeś co tydzień. Bez gadania, bez przerw.",
      emoji: "🧱",
    };
  }
  // 4) >40% serii z RPE ≥ 9 → Maksymalista
  if (i.core.ratedSets > 0 && i.core.redZoneSets / i.core.ratedSets > 0.4) {
    return {
      key: "maximalist",
      label: "Maksymalista",
      description: "Większość serii na maksa. Trener pewnie się o Ciebie martwi.",
      emoji: "🔥",
    };
  }
  // 5) Top exercise to >50% sesji → Specjalista
  if (i.topPct > 50) {
    return {
      key: "specialist",
      label: "Specjalista",
      description: `Jedno ćwiczenie — ${i.topPct}% Twoich sesji. Bezkompromisowy fokus.`,
      emoji: "🎯",
    };
  }
  // 6) >50% objętości w SEC → Wytrzymałościowiec
  if (i.core.totalSeconds > i.core.totalReps && i.core.totalSeconds > 0) {
    return {
      key: "endurance",
      label: "Wytrzymałościowiec",
      description: "Twój żywioł to czas. Wytrzymujesz tam, gdzie inni odpadają.",
      emoji: "⏱️",
    };
  }
  // 7) ≥5 różnych ćwiczeń, top ≤ 35% → Wszechstronny
  if (i.distinctExercises >= 5 && i.topPct <= 35) {
    return {
      key: "all-rounder",
      label: "Wszechstronny",
      description: `${i.distinctExercises} różnych ćwiczeń, dobrze rozłożone. Trener marzy o takich.`,
      emoji: "🌀",
    };
  }
  // 8) Min. 3 aktywne tygodnie z rzędu w miesiącu → Cierpliwy
  if (i.weeksActive >= 3) {
    return {
      key: "patient",
      label: "Cierpliwy",
      description: "Tydzień po tygodniu, krok po kroku. Tak buduje się formę.",
      emoji: "🌱",
    };
  }
  // 9) Fallback
  return {
    key: "explorer",
    label: "Eksplorator",
    description: "Każdy trening to inwestycja. Trzymaj rytm.",
    emoji: "🧭",
  };
}

// ----------------------------------------------------------------
// Public: full monthly wrapped.
// ----------------------------------------------------------------

export async function getMonthlyWrapped(
  db: Db,
  traineeId: string,
  year: number,
  month: number,
): Promise<WrappedSummary> {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const [core, prevCore, topInfo, prInfo, heaviest, weeksActive] = await Promise.all([
    loadMonthCore(db, traineeId, year, month),
    loadMonthCore(db, traineeId, prevYear, prevMonth),
    loadTopExercise(db, traineeId, year, month, 0).then(async (r) => {
      // re-resolve pct now that we know sessions
      return r;
    }),
    loadMonthlyPRs(db, traineeId, year, month),
    loadHeaviestDay(db, traineeId, year, month),
    loadWeeksActive(db, traineeId, year, month),
  ]);

  // Recompute pctOfSessions now that we have core.sessions.
  const topExercise: TopExercise | null = topInfo.top
    ? {
        ...topInfo.top,
        pctOfSessions:
          core.sessions === 0
            ? 0
            : Math.round((topInfo.top.sessionsInvolved / core.sessions) * 100),
      }
    : null;
  const topPctFinal = topExercise?.pctOfSessions ?? 0;

  const weeksInMonth = weeksOverlappingMonth(year, month);

  const archetype = pickArchetype({
    core,
    prCount: prInfo.prs.length,
    newExercises: prInfo.newExercises,
    weeksActive,
    weeksInMonth,
    topPct: topPctFinal,
    distinctExercises: topInfo.distinctExercises,
  });

  const repsDeltaPct =
    prevCore.totalReps === 0
      ? null
      : Math.round(((core.totalReps - prevCore.totalReps) / prevCore.totalReps) * 100);
  const rpeDelta =
    core.avgRpe == null || prevCore.avgRpe == null
      ? null
      : Math.round((core.avgRpe - prevCore.avgRpe) * 10) / 10;
  const vsPrevious: VsPrevious = {
    hasPrevious: prevCore.sessions > 0,
    sessionsThis: core.sessions,
    sessionsPrev: prevCore.sessions,
    sessionsDelta: core.sessions - prevCore.sessions,
    repsThis: core.totalReps,
    repsPrev: prevCore.totalReps,
    repsDeltaPct,
    avgRpeThis: core.avgRpe,
    avgRpePrev: prevCore.avgRpe,
    rpeDelta,
  };

  return {
    year,
    month,
    ym: formatYM(year, month),
    label: monthLabel(year, month),
    hasData: core.sessions > 0,
    sessions: core.sessions,
    totalReps: core.totalReps,
    totalSeconds: core.totalSeconds,
    totalSets: core.totalSets,
    weeksActive,
    topExercise,
    prs: prInfo.prs,
    heaviestDay: heaviest,
    archetype,
    vsPrevious,
  };
}

/**
 * Number of ISO weeks that overlap with the given calendar month. Used to know
 * whether `weeksActive` covers "every week of the month" for the Konsekwentny
 * archetype.
 */
function weeksOverlappingMonth(year: number, month: number): number {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day of month
  const weekStart = (d: Date) => {
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const m = new Date(d.getTime());
    m.setUTCDate(m.getUTCDate() + diff);
    m.setUTCHours(0, 0, 0, 0);
    return m;
  };
  const a = weekStart(start).getTime();
  const b = weekStart(end).getTime();
  const week = 7 * 24 * 60 * 60 * 1000;
  return Math.round((b - a) / week) + 1;
}
