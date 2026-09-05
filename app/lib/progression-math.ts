export type ProgressionRange = "4w" | "3m" | "6m" | "all";
export type ProgressionStatus = "up" | "flat" | "down" | "new";

/** One logged session for a single exercise. Chronological order is caller's responsibility. */
export interface SessionPoint {
  performedOn: string; // YYYY-MM-DD
  best: number; // max reps/sec across sets in the session
  avgReps: number; // mean reps across sets (used for status, mirrors stats.ts)
  avgRpe: number | null; // mean difficulty 1–10; null gdy żadna seria nie ma oceny
  volume: number; // sum of reps/sec across sets
}

/** A point ready to render on the hero/volume/effort charts. */
export interface ChartPoint {
  key: string; // unique x key (date or week-start)
  label: string; // short x label "DD.MM"
  best: number;
  avgRpe: number | null; // mean difficulty 1–10; null gdy żadna seria nie ma oceny
  volume: number;
  isPr: boolean; // true where a new running-high was reached within the series
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Mean over non-null values; null when every value is null (no rated sets). */
function meanRpe(xs: Array<number | null>): number | null {
  const present = xs.filter((x): x is number => x != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function shortLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/** Cutoff ISO date for a range given "today" (ISO). null = no lower bound ("all"). */
export function rangeStartIso(range: ProgressionRange, todayIso: string): string | null {
  if (range === "all") return null;
  const days = range === "4w" ? 28 : range === "3m" ? 90 : 182;
  const t = new Date(`${todayIso}T00:00:00Z`).getTime();
  return new Date(t - days * DAY_MS).toISOString().slice(0, 10);
}

export function shouldAggregateWeekly(range: ProgressionRange): boolean {
  return range === "6m" || range === "all";
}

/** Monday (UTC) of the week containing the given ISO date. */
export function weekStartIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

/** Collapse same-week sessions into one point (best=max, volume=sum, reps/rpe=mean). Returns chronological asc. */
export function aggregateToWeeks(points: SessionPoint[]): SessionPoint[] {
  const byWeek = new Map<string, SessionPoint[]>();
  for (const p of points) {
    const k = weekStartIso(p.performedOn);
    const arr = byWeek.get(k) ?? [];
    arr.push(p);
    byWeek.set(k, arr);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, ps]) => ({
      performedOn: week,
      best: Math.max(...ps.map((p) => p.best)),
      avgReps: round1(mean(ps.map((p) => p.avgReps))),
      avgRpe: ((): number | null => {
        const m = meanRpe(ps.map((p) => p.avgRpe));
        return m === null ? null : round1(m);
      })(),
      volume: ps.reduce((a, p) => a + p.volume, 0),
    }));
}

/**
 * Wybiera serię punktów do wykresu dla danego okresu. Dla długich zakresów
 * (6m/all) stosuje ujęcie tygodniowe, ALE jeśli zwinęłoby ono dane do <2 punktów
 * (np. gdy wszystkie sesje wpadają w jeden tydzień), wraca do ujęcia per-sesja.
 * Dzięki temu szerszy okres nigdy nie pokazuje MNIEJ punktów niż węższy — inaczej
 * „6 mies." potrafiło wyświetlić „za mało danych", choć „4 tyg." rysowało wykres.
 * Zakłada `inRange` już przefiltrowane do okresu, chronologicznie rosnąco.
 */
export function seriesForRange(
  inRange: SessionPoint[],
  range: ProgressionRange,
): { series: SessionPoint[]; granularity: "session" | "week" } {
  if (!shouldAggregateWeekly(range)) {
    return { series: inRange, granularity: "session" };
  }
  const weekly = aggregateToWeeks(inRange);
  if (weekly.length < 2) {
    return { series: inRange, granularity: "session" };
  }
  return { series: weekly, granularity: "week" };
}

/** Map chronological sessions to chart points, flagging each new running-high. */
export function markPrs(pointsChrono: SessionPoint[]): ChartPoint[] {
  let running = Number.NEGATIVE_INFINITY;
  return pointsChrono.map((p) => {
    const isPr = p.best > running;
    if (isPr) running = p.best;
    return {
      key: p.performedOn,
      label: shortLabel(p.performedOn),
      best: p.best,
      avgRpe: p.avgRpe === null ? null : round1(p.avgRpe),
      volume: p.volume,
      isPr,
    };
  });
}

// internal re-exports for sibling functions in later tasks
export { mean as _mean, round1 as _round1 };

/** Row shown on the Progresja landing list. */
export interface ProgressionListRow {
  exerciseId: string;
  name: string;
  unit: "REPS" | "SEC";
  tags: string[];
  sessionCount: number;
  lastPerformedOn: string;
  pr: number;
  prAchievedOn: string;
  sparkline: number[]; // chronological best values, capped length
  status: ProgressionStatus;
}

export interface StatusSummary {
  up: number;
  flat: number;
  down: number;
  new: number;
}

/**
 * Progi statusu: <5 sesji → "new"; pasmo ±5%. Lustrzanym odbiciem był dawny
 * `getExerciseProgress` ze `stats.ts` — ta funkcja zniknęła razem z resztą
 * agregacji, więc progi żyją już tylko tutaj.
 */
export function classifyStatus(
  recentAvg: number,
  priorAvg: number,
  totalSessions: number,
): ProgressionStatus {
  if (totalSessions < 5) return "new";
  const deltaPct = priorAvg === 0 ? 0 : ((recentAvg - priorAvg) / priorAvg) * 100;
  return deltaPct > 5 ? "up" : deltaPct < -5 ? "down" : "flat";
}

/** sessions newest-first → status z best (rekordu) recent 4 vs prior 4. */
export function statusFromSessions(sessionsNewestFirst: SessionPoint[]): ProgressionStatus {
  const recent = sessionsNewestFirst.slice(0, 4).map((s) => s.best);
  const prior = sessionsNewestFirst.slice(4, 8).map((s) => s.best);
  return classifyStatus(mean(recent), mean(prior), sessionsNewestFirst.length);
}

/**
 * % change of best from start to end of the in-range period: avg of first k vs
 * last k sessions, where k = min(3, floor(length/2)) so the two windows never
 * overlap (otherwise a 2–3 session period would always report 0%).
 */
export function computePeriodChangePct(pointsChrono: SessionPoint[]): number | null {
  if (pointsChrono.length < 2) return null;
  const k = Math.min(3, Math.floor(pointsChrono.length / 2));
  const startAvg = mean(pointsChrono.slice(0, k).map((p) => p.best));
  const endAvg = mean(pointsChrono.slice(-k).map((p) => p.best));
  if (startAvg === 0) return null;
  return Math.round(((endAvg - startAvg) / startAvg) * 100);
}

/** Each value as integer % change from the first value. null if <2 values or first is 0. */
export function normalizeToPctFromStart(values: number[]): number[] | null {
  if (values.length < 2) return null;
  const start = values[0]!;
  if (start === 0) return null;
  return values.map((v) => Math.round((v / start - 1) * 100));
}

export function sortProgressionRows(
  rows: ProgressionListRow[],
  mode: "recent" | "attention",
): ProgressionListRow[] {
  const copy = [...rows];
  if (mode === "recent") {
    copy.sort((a, b) =>
      a.lastPerformedOn === b.lastPerformedOn
        ? a.name.localeCompare(b.name, "pl")
        : a.lastPerformedOn < b.lastPerformedOn
          ? 1
          : -1,
    );
  } else {
    const order: Record<ProgressionStatus, number> = { down: 0, flat: 1, up: 2, new: 3 };
    copy.sort((a, b) =>
      order[a.status] !== order[b.status]
        ? order[a.status] - order[b.status]
        : a.name.localeCompare(b.name, "pl"),
    );
  }
  return copy;
}

export function summarizeStatuses(rows: Array<{ status: ProgressionStatus }>): StatusSummary {
  const out: StatusSummary = { up: 0, flat: 0, down: 0, new: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** Polski skrót jednostki ćwiczenia do etykiet UI. */
export function unitLabelPl(unit: "REPS" | "SEC"): string {
  return unit === "SEC" ? "sek." : "powt.";
}

/** Czysty filtr: zwraca nową listę bez wierszy, których exerciseId jest w `ids`. */
export function excludeByExerciseId(
  rows: ProgressionListRow[],
  ids: Set<string>,
): ProgressionListRow[] {
  if (ids.size === 0) return [...rows];
  return rows.filter((r) => !ids.has(r.exerciseId));
}
