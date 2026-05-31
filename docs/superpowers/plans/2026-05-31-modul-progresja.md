# Moduł Progresja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować read-only moduł „Progresja" — wybór ćwiczenia i oglądanie jego trajektorii w czasie (linia rekordów + RPE, objętość, „siła = lżej"), z listą-wejściem i trybem porównania, dla podopiecznego (menu boczne) i trenera (zakładka na stronie podopiecznego).

**Architecture:** Czysta logika agregacji/normalizacji wydzielona do `app/lib/progression-math.ts` (testowana jednostkowo, TDD). Zapytania DB w `app/lib/progression.ts` (re-używają wzorca join `workoutSetLogs→workoutExerciseLogs→workoutLogs→exercises` z `stats.ts`). Wykresy jako ręczny SVG w `app/components/progression-charts.tsx` (zero nowych zależności). Sześć tras RR7 (3 podopieczny, 3 trener), wyłącznie loadery. Tenant-scope: trener przez `findTraineeOfTrainer` → brak relacji = 404.

**Tech Stack:** React Router v7 (framework mode, SSR), Drizzle ORM + PostgreSQL, TypeScript strict, Vitest (jednostkowe), testcontainers (`*.itest.ts`, uruchamia właściciel), Biome.

**Reguły-fundamenty (cały plan):** nigdy git/docker (handoff na końcu); npm; UI po polsku, brand `kalisthenos` małą literą, nazwy ćwiczeń po angielsku; review per task; warstwę wizualną tras prowadzi `frontend-design:frontend-design` zgodnie z `design-system/README.md` i `app/styles/tokens.css`; aktualizacja README katalogów = część „done".

**Spec źródłowy:** `docs/superpowers/specs/2026-05-31-modul-progresja-design.md`.

---

## Struktura plików

**Tworzone:**
- `app/lib/progression-math.ts` — czyste typy + funkcje (zakresy, agregacja tygodniowa, PR-y, status, zmiana %, normalizacja %, sortowanie listy, podsumowanie statusów). **Cały testowany jednostkowo.**
- `app/lib/progression-math.test.ts` — testy jednostkowe powyższego (Vitest).
- `app/lib/progression.ts` — zapytania DB: `loadProgressionSessions`, `listProgressionExercises`, `getExerciseProgression`, `getProgressionComparison`, `findTraineeOfTrainer`, `todayIso`.
- `app/components/progression-charts.tsx` — `ProgressionLineChart`, `VolumeBars`, `RepsVsEffortChart`, `ComparisonChart`, `ProgressionStatusBadge`.
- `app/routes/podopieczny/progresja._index.tsx` — lista (podopieczny).
- `app/routes/podopieczny/progresja.$exerciseId.tsx` — szczegół (podopieczny).
- `app/routes/podopieczny/progresja.porownanie.tsx` — porównanie (podopieczny).
- `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx` — lista (trener).
- `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx` — szczegół (trener).
- `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx` — porównanie (trener).
- `tests/progression-tenant-scope.itest.ts` — integracyjny tenant-scope (PISZ, nie uruchamiaj).

**Modyfikowane:**
- `app/routes.ts` — 6 wpisów tras.
- `app/routes/podopieczny/_layout.tsx` — pozycja „Progresja" w menu bocznym.
- `app/routes/trener/podopieczni.$traineeId.tsx` — zakładka/link „Progresja".
- `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`, `app/lib/README.md`, `app/components/README.md` — dokumentacja.

---

## Task 1: progression-math — zakresy, tygodnie, PR-y

**Files:**
- Create: `app/lib/progression-math.ts`
- Test: `app/lib/progression-math.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/progression-math.test.ts
import { describe, it, expect } from "vitest";
import {
  rangeStartIso,
  shouldAggregateWeekly,
  weekStartIso,
  aggregateToWeeks,
  markPrs,
  type SessionPoint,
} from "./progression-math";

const sp = (performedOn: string, best: number, avgReps = best, avgRpe = 7, volume = best * 3): SessionPoint => ({
  performedOn,
  best,
  avgReps,
  avgRpe,
  volume,
});

describe("rangeStartIso", () => {
  it("returns null for 'all'", () => {
    expect(rangeStartIso("all", "2026-05-31")).toBeNull();
  });
  it("subtracts 28 days for '4w'", () => {
    expect(rangeStartIso("4w", "2026-05-31")).toBe("2026-05-03");
  });
  it("subtracts 90 days for '3m'", () => {
    expect(rangeStartIso("3m", "2026-05-31")).toBe("2026-03-02");
  });
});

describe("shouldAggregateWeekly", () => {
  it("aggregates only for 6m and all", () => {
    expect(shouldAggregateWeekly("4w")).toBe(false);
    expect(shouldAggregateWeekly("3m")).toBe(false);
    expect(shouldAggregateWeekly("6m")).toBe(true);
    expect(shouldAggregateWeekly("all")).toBe(true);
  });
});

describe("weekStartIso", () => {
  it("maps any day to its Monday (UTC)", () => {
    // 2026-05-31 is a Sunday → Monday is 2026-05-25
    expect(weekStartIso("2026-05-31")).toBe("2026-05-25");
    expect(weekStartIso("2026-05-25")).toBe("2026-05-25");
  });
});

describe("aggregateToWeeks", () => {
  it("groups sessions in the same week: best=max, volume=sum, rpe=mean", () => {
    const out = aggregateToWeeks([
      sp("2026-05-25", 5, 5, 8, 15),
      sp("2026-05-27", 7, 6, 6, 18),
      sp("2026-06-01", 8, 8, 7, 24),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ performedOn: "2026-05-25", best: 7, volume: 33, avgRpe: 7 });
    expect(out[1]).toMatchObject({ performedOn: "2026-06-01", best: 8, volume: 24 });
  });
});

describe("markPrs", () => {
  it("flags each new running-high (chronological)", () => {
    const out = markPrs([sp("2026-01-01", 5), sp("2026-01-08", 5), sp("2026-01-15", 7)]);
    expect(out.map((p) => p.isPr)).toEqual([true, false, true]);
    expect(out[0].label).toBe("01.01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progression-math`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/progression-math.ts

export type ProgressionRange = "4w" | "3m" | "6m" | "all";
export type ProgressionStatus = "up" | "flat" | "down" | "new";

/** One logged session for a single exercise. Chronological order is caller's responsibility. */
export interface SessionPoint {
  performedOn: string; // YYYY-MM-DD
  best: number;        // max reps/sec across sets in the session
  avgReps: number;     // mean reps across sets (used for status, mirrors stats.ts)
  avgRpe: number;      // mean difficulty 1–10
  volume: number;      // sum of reps/sec across sets
}

/** A point ready to render on the hero/volume/effort charts. */
export interface ChartPoint {
  key: string;   // unique x key (date or week-start)
  label: string; // short x label "DD.MM"
  best: number;
  avgRpe: number;
  volume: number;
  isPr: boolean; // true where a new running-high was reached within the series
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
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
      avgRpe: round1(mean(ps.map((p) => p.avgRpe))),
      volume: ps.reduce((a, p) => a + p.volume, 0),
    }));
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
      avgRpe: round1(p.avgRpe),
      volume: p.volume,
      isPr,
    };
  });
}

// internal re-exports for sibling functions in later tasks
export { mean as _mean, round1 as _round1 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- progression-math`
Expected: PASS (all Task 1 cases green).

- [ ] **Step 5: Review per task**

Use `superpowers:requesting-code-review` on the diff; apply feedback via `superpowers:receiving-code-review`. Hand off git to owner (no commit by Claude).

---

## Task 2: progression-math — status, zmiana %, normalizacja, sort, podsumowanie

**Files:**
- Modify: `app/lib/progression-math.ts`
- Test: `app/lib/progression-math.test.ts`

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// append to app/lib/progression-math.test.ts
import {
  classifyStatus,
  statusFromSessions,
  computePeriodChangePct,
  normalizeToPctFromStart,
  sortProgressionRows,
  summarizeStatuses,
  type ProgressionListRow,
} from "./progression-math";

describe("classifyStatus", () => {
  it("is 'new' below 5 sessions", () => {
    expect(classifyStatus(10, 5, 4)).toBe("new");
  });
  it("is 'up' when recent beats prior by >5%", () => {
    expect(classifyStatus(11, 10, 8)).toBe("up");
  });
  it("is 'down' when recent below prior by >5%", () => {
    expect(classifyStatus(9, 10, 8)).toBe("down");
  });
  it("is 'flat' within ±5%", () => {
    expect(classifyStatus(102, 100, 8)).toBe("flat");
  });
  it("treats prior 0 as flat (no divide-by-zero)", () => {
    expect(classifyStatus(5, 0, 8)).toBe("flat");
  });
});

describe("statusFromSessions (newest-first)", () => {
  it("averages recent 4 vs prior 4 of avgReps", () => {
    const mk = (avgReps: number): SessionPoint => sp("2026-01-01", avgReps, avgReps);
    const rows = [mk(10), mk(10), mk(10), mk(10), mk(8), mk(8), mk(8), mk(8)];
    expect(statusFromSessions(rows)).toBe("up");
  });
});

describe("computePeriodChangePct (chronological)", () => {
  it("returns null below 2 points", () => {
    expect(computePeriodChangePct([sp("2026-01-01", 5)])).toBeNull();
  });
  it("compares first up-to-3 vs last up-to-3 best", () => {
    const pts = [sp("a", 5), sp("b", 5), sp("c", 5), sp("d", 10), sp("e", 10), sp("f", 10)];
    expect(computePeriodChangePct(pts)).toBe(100);
  });
});

describe("normalizeToPctFromStart", () => {
  it("returns null when start is 0", () => {
    expect(normalizeToPctFromStart([0, 5, 10])).toBeNull();
  });
  it("returns null below 2 values", () => {
    expect(normalizeToPctFromStart([5])).toBeNull();
  });
  it("expresses each value as % change from first", () => {
    expect(normalizeToPctFromStart([5, 6, 10])).toEqual([0, 20, 100]);
  });
});

describe("sortProgressionRows", () => {
  const row = (name: string, status: ProgressionListRow["status"], lastPerformedOn: string): ProgressionListRow => ({
    exerciseId: name,
    name,
    unit: "REPS",
    tags: [],
    sessionCount: 6,
    lastPerformedOn,
    pr: 10,
    prAchievedOn: lastPerformedOn,
    sparkline: [1, 2],
    status,
  });
  it("'recent' sorts by lastPerformedOn desc", () => {
    const out = sortProgressionRows([row("a", "up", "2026-01-01"), row("b", "up", "2026-02-01")], "recent");
    expect(out.map((r) => r.name)).toEqual(["b", "a"]);
  });
  it("'attention' puts down → flat → up → new", () => {
    const out = sortProgressionRows(
      [row("a", "up", "x"), row("b", "down", "x"), row("c", "new", "x"), row("d", "flat", "x")],
      "attention",
    );
    expect(out.map((r) => r.status)).toEqual(["down", "flat", "up", "new"]);
  });
});

describe("summarizeStatuses", () => {
  it("counts statuses", () => {
    expect(summarizeStatuses([{ status: "up" }, { status: "up" }, { status: "down" }, { status: "new" }])).toEqual({
      up: 2,
      flat: 0,
      down: 1,
      new: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progression-math`
Expected: FAIL — new exports not defined.

- [ ] **Step 3: Write minimal implementation (append to `progression-math.ts`)**

```ts
// append to app/lib/progression-math.ts

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

/** Mirrors stats.ts getExerciseProgress thresholds: <5 sessions → "new"; ±5% band. */
export function classifyStatus(recentAvg: number, priorAvg: number, totalSessions: number): ProgressionStatus {
  if (totalSessions < 5) return "new";
  const deltaPct = priorAvg === 0 ? 0 : ((recentAvg - priorAvg) / priorAvg) * 100;
  return deltaPct > 5 ? "up" : deltaPct < -5 ? "down" : "flat";
}

/** sessions newest-first → status from avgReps of recent 4 vs prior 4. */
export function statusFromSessions(sessionsNewestFirst: SessionPoint[]): ProgressionStatus {
  const recent = sessionsNewestFirst.slice(0, 4).map((s) => s.avgReps);
  const prior = sessionsNewestFirst.slice(4, 8).map((s) => s.avgReps);
  return classifyStatus(mean(recent), mean(prior), sessionsNewestFirst.length);
}

/** % change of best from start to end of the in-range period (avg of first vs last up-to-3 sessions). */
export function computePeriodChangePct(pointsChrono: SessionPoint[]): number | null {
  if (pointsChrono.length < 2) return null;
  const k = Math.min(3, pointsChrono.length);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- progression-math`
Expected: PASS (Task 1 + Task 2 cases green).

- [ ] **Step 5: Review per task** (as Task 1, Step 5).

---

## Task 3: progression.ts — zapytanie bazowe, lista ćwiczeń, tenant-scope helper

**Files:**
- Create: `app/lib/progression.ts`

DB functions nie mają testów jednostkowych w pętli (wymagają DB) — opierają się na testach `progression-math` + teście integracyjnym z Task 13. Implementacja wprost.

- [ ] **Step 1: Implement `app/lib/progression.ts`**

```ts
// app/lib/progression.ts
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import {
  markPrs,
  statusFromSessions,
  type ProgressionListRow,
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
  const where = exerciseId
    ? and(eq(schema.workoutLogs.traineeId, traineeId), eq(schema.workoutExerciseLogs.exerciseId, exerciseId))
    : eq(schema.workoutLogs.traineeId, traineeId);

  const rows = await db
    .select({
      exerciseId: schema.workoutExerciseLogs.exerciseId,
      performedOn: schema.workoutLogs.performedOn,
      createdAt: schema.workoutLogs.createdAt,
      best: sql<number>`MAX(${schema.workoutSetLogs.reps})::int`,
      avgReps: sql<number>`AVG(${schema.workoutSetLogs.reps})::float`,
      avgRpe: sql<number>`AVG(${schema.workoutSetLogs.difficulty})::float`,
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
    .innerJoin(schema.workoutLogs, eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId))
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
      avgRpe: Number(r.avgRpe),
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
export async function listProgressionExercises(db: Db, traineeId: string): Promise<ProgressionListRow[]> {
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

// Re-export for routes that only need the loader-facing pieces.
export { loadProgressionSessions };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors; confirms `Db` import path and Drizzle usage).

- [ ] **Step 3: Review per task** (as Task 1, Step 5).

> Note: verify `Db` type is exported from `~/lib/db/client` (used across `stats.ts`); if the canonical import differs, match `stats.ts`'s `import type { Db }`.

---

## Task 4: progression.ts — szczegół ćwiczenia (getExerciseProgression)

**Files:**
- Modify: `app/lib/progression.ts`

- [ ] **Step 1: Add types and `getExerciseProgression`**

```ts
// add to app/lib/progression.ts
import {
  aggregateToWeeks,
  computePeriodChangePct,
  rangeStartIso,
  shouldAggregateWeekly,
  type ChartPoint,
  type ProgressionRange,
} from "./progression-math";

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
  const avgRpeInRange =
    inRange.length === 0
      ? null
      : Math.round((inRange.reduce((a, p) => a + p.avgRpe, 0) / inRange.length) * 10) / 10;

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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Review per task** (as Task 1, Step 5).

---

## Task 5: progression.ts — porównanie (getProgressionComparison)

**Files:**
- Modify: `app/lib/progression.ts`

- [ ] **Step 1: Add types and `getProgressionComparison`**

```ts
// add to app/lib/progression.ts
import { normalizeToPctFromStart } from "./progression-math";

export interface ComparisonSeries {
  exerciseId: string;
  name: string;
  unit: "REPS" | "SEC";
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
      points: inRange.map((p, i) => ({ performedOn: p.performedOn, pct: pct[i]! })),
    });
  }
  return { series, skipped };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Review per task** (as Task 1, Step 5).

---

## Task 6: progression-charts.tsx — komponenty SVG

**Files:**
- Create: `app/components/progression-charts.tsx`

Warstwa wizualna — **prowadź przez `frontend-design:frontend-design`** (design-system, tokeny `app/styles/tokens.css`, mobile-first). Wzoruj się na istniejących `Sparkline`/`Heatmap` w `app/components/stat-widgets.tsx` (ręczny SVG, `var(--*)` kolory, `role="img"`, `<title>` dla hoveru). Brak nowych zależności.

- [ ] **Step 1: Implement components**

Wymagane eksporty i kontrakty (sygnatury muszą zgadzać się z użyciem w trasach):

```tsx
// app/components/progression-charts.tsx
import type { ChartPoint, ComparisonSeries, ProgressionStatus } from "~/lib/progression-math";
// (ComparisonSeries faktycznie importuj z "~/lib/progression"; ChartPoint/ProgressionStatus z "~/lib/progression-math")

// 1) Bohater: linia max-serii + kropki barwione wg RPE + znacznik PR
export function ProgressionLineChart(props: {
  points: ChartPoint[];
  unit: "REPS" | "SEC";
  height?: number;
}): JSX.Element;

// 2) Słupki objętości per punkt
export function VolumeBars(props: { points: ChartPoint[]; height?: number }): JSX.Element;

// 3) Dwie linie: best (↑) i avgRpe (↓), dwie osie
export function RepsVsEffortChart(props: { points: ChartPoint[]; height?: number }): JSX.Element;

// 4) Wiele znormalizowanych linii (% od startu), oś czasu wspólna po dacie
export function ComparisonChart(props: {
  series: ComparisonSeries[];
  height?: number;
}): JSX.Element;

// 5) Mała odznaka statusu
export function ProgressionStatusBadge(props: { status: ProgressionStatus }): JSX.Element;
```

Wskazówki implementacyjne (bez placeholderów — to są konkretne reguły renderu):
- **Kolory RPE** (kropki w `ProgressionLineChart`): RPE ≤ 6 → `var(--ok)`, 7–8 → `var(--warn)`, ≥ 9 → `var(--danger)`. Linia: `var(--ink)`. Znacznik PR: największa kropka + etykieta wartości; użyj `point.isPr` i wyróżnij ostatni/najwyższy.
- **Pusty stan**: `points.length < 2` → ten sam tekst-zastępnik co `Sparkline` („za mało danych", `className="muted text-xs"`).
- **Skala Y**: min/max po `best` (lub `volume`), padding jak w `Sparkline`. **Mieszane jednostki w `ComparisonChart`**: oś Y w `%`, etykiety `+50%`/`+100%`; X mapowane po czasie (min..max `performedOn` ze wszystkich serii, parsowane `new Date(iso).getTime()`).
- **Kolory serii porównania**: paleta z tokenów — `var(--ink)`, `var(--accent)` (a właściwie ciemniejszy wariant dla kontrastu na jasnym tle, np. `#3f6212`/`var(--ok)`), `var(--warn)`, `var(--muted)` — kolejne serie cyklicznie. Legenda z nazwą + kolorem (wzór `SegmentedBarLegend`).
- **Status badge**: ▲ rośnie (`--ok`), = stabilnie (`--muted`), ▼ spadek (`--danger`), „nowe" (`--accent`). Teksty po polsku.
- **A11y**: każdy `<svg role="img" aria-label="…">`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Review per task** — `frontend-design` self-check + `superpowers:requesting-code-review`. Hand off git to owner.

---

## Task 7: Trasa podopieczny — lista + link w menu

**Files:**
- Create: `app/routes/podopieczny/progresja._index.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/podopieczny/_layout.tsx`

- [ ] **Step 1: Add route entry to `app/routes.ts`**

W bloku `prefix("podopieczny", [ layout(..., [ ... ]) ])`, po wpisie `route("statystyki", …)` dodaj:

```ts
      route("progresja", "routes/podopieczny/progresja._index.tsx"),
      route("progresja/:exerciseId", "routes/podopieczny/progresja.$exerciseId.tsx"),
      route("progresja/porownanie", "routes/podopieczny/progresja.porownanie.tsx"),
```

> Uwaga kolejności: `progresja/porownanie` to literał — RR7 dopasowuje literały przed `:exerciseId`, więc kolejność wpisów nie powoduje konfliktu, ale trzymaj `porownanie` w planie świadomie (nie jest `:exerciseId`).

- [ ] **Step 2: Implement the list loader + view**

Loader (read-only). UI — **prowadź przez `frontend-design`**, używając `ProgressionStatusBadge`, `Sparkline` (z `stat-widgets`) i layoutu listy zgodnego z design-systemem.

```tsx
// app/routes/podopieczny/progresja._index.tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { listProgressionExercises } from "~/lib/progression";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const rows = await listProgressionExercises(db, user.id);
  return { rows, defaultSort: "recent" as const };
}

export default function ProgresjaLista() {
  const { rows, defaultSort } = useLoaderData<typeof loader>();
  // Klient: useState dla filtra po tagach + sortowania (sortProgressionRows z progression-math).
  // Domyślny sort = defaultSort ("recent" dla podopiecznego).
  // Każdy wiersz linkuje do `/podopieczny/progresja/${row.exerciseId}`.
  // Tryb zaznaczania → przycisk „Porównaj" → `/podopieczny/progresja/porownanie?ex=ID1,ID2`.
  // Pusta lista → komunikat zachęcający do zalogowania treningu.
  return null; // zastąp realnym UI (frontend-design)
}
```

Wymagania UI (z analizy: wiersz = nazwa+unit, mini-sparkline, status, PR, podtytuł „N sesji · X dni temu"; filtr po tagach z `row.tags`; wielozaznaczenie → „Porównaj"). Import `sortProgressionRows` z `~/lib/progression-math`.

- [ ] **Step 3: Add sidenav link in `app/routes/podopieczny/_layout.tsx`**

Znajdź istniejący link do „Statystyki" w menu bocznym i dodaj analogiczny tuż obok:

```tsx
<NavLink to="/podopieczny/progresja">{/* ikona */}Progresja</NavLink>
```

Dopasuj dokładnie do istniejącego wzorca linków (ten sam komponent/klasy/ikona co sąsiednie pozycje).

- [ ] **Step 4: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS (trasa rejestruje się, brak błędów typów).

- [ ] **Step 5: Review per task** (`frontend-design` + `superpowers:requesting-code-review`).

---

## Task 8: Trasa podopieczny — szczegół ćwiczenia

**Files:**
- Create: `app/routes/podopieczny/progresja.$exerciseId.tsx`

- [ ] **Step 1: Implement loader + view**

```tsx
// app/routes/podopieczny/progresja.$exerciseId.tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const exerciseId = args.params.exerciseId ?? "";
  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "") ? (raw as ProgressionRange) : "3m";

  const view = await getExerciseProgression(db, user.id, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { view, range };
}

export default function ProgresjaSzczegol() {
  const { view, range } = useLoaderData<typeof loader>();
  // UI (frontend-design): nagłówek (nazwa+unit), przełącznik zakresu (linki ?zakres=…),
  // pasek 4 KPI (view.kpis), ProgressionLineChart (bohater), VolumeBars + RepsVsEffortChart (karty).
  // Liczby formatuj wg unit ("12 s" vs "10 powt.").
  return null; // zastąp realnym UI
}
```

Komponenty: `ProgressionLineChart`, `VolumeBars`, `RepsVsEffortChart` z `~/components/progression-charts`. Zakres jako linki nawigacyjne `?zakres=4w|3m|6m|all` (loader-driven, SSR-friendly).

- [ ] **Step 2: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Review per task** (`frontend-design` + review).

---

## Task 9: Trasa podopieczny — porównanie

**Files:**
- Create: `app/routes/podopieczny/progresja.porownanie.tsx`

- [ ] **Step 1: Implement loader + view**

```tsx
// app/routes/podopieczny/progresja.porownanie.tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getProgressionComparison } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const ids = (url.searchParams.get("ex") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "") ? (raw as ProgressionRange) : "3m";

  const comparison = await getProgressionComparison(db, user.id, ids, range);
  return { comparison, range, ids };
}

export default function ProgresjaPorownanie() {
  const { comparison, range } = useLoaderData<typeof loader>();
  // UI (frontend-design): ComparisonChart(series) + legenda, lista „skipped" z powodem,
  // przełącznik zakresu, możliwość usunięcia ćwiczenia (zmiana ?ex=).
  // Pusty ids lub puste series → komunikat „wybierz co najmniej 2 ćwiczenia".
  return null; // zastąp realnym UI
}
```

- [ ] **Step 2: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Review per task** (`frontend-design` + review).

---

## Task 10: Trasa trener — lista + zakładka + pasek podsumowania

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx`

- [ ] **Step 1: Add route entries to `app/routes.ts`**

W bloku trenera, po wpisie `podopieczni/:traineeId/statystyki`, dodaj:

```ts
      route(
        "podopieczni/:traineeId/progresja",
        "routes/trener/podopieczni.$traineeId.progresja._index.tsx",
      ),
      route(
        "podopieczni/:traineeId/progresja/:exerciseId",
        "routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx",
      ),
      route(
        "podopieczni/:traineeId/progresja/porownanie",
        "routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx",
      ),
```

- [ ] **Step 2: Implement loader + view (z tenant-scope i podsumowaniem)**

```tsx
// app/routes/trener/podopieczni.$traineeId.progresja._index.tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer, listProgressionExercises } from "~/lib/progression";
import { summarizeStatuses } from "~/lib/progression-math";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const rows = await listProgressionExercises(db, traineeId);
  const summary = summarizeStatuses(rows);
  return { trainee, rows, summary, defaultSort: "attention" as const };
}

export default function TrenerProgresjaLista() {
  const { trainee, rows, summary, defaultSort } = useLoaderData<typeof loader>();
  // UI (frontend-design): jak lista podopiecznego, ale:
  //  - domyślny sort = "attention",
  //  - pasek podsumowania nad listą: rośnie {summary.up} / stabilnych {summary.flat} / spada {summary.down},
  //  - linki do `/trener/podopieczni/${trainee.id}/progresja/${row.exerciseId}`,
  //  - „Porównaj" → `…/progresja/porownanie?ex=…`.
  return null; // zastąp realnym UI
}
```

- [ ] **Step 3: Add „Progresja" tab/link in `app/routes/trener/podopieczni.$traineeId.tsx`**

Znajdź zestaw linków do podstron podopiecznego (Statystyki / Sylwetka / Konsultacje) i dodaj analogiczny:

```tsx
<Link to={`/trener/podopieczni/${traineeId}/progresja`}>Progresja</Link>
```

Dopasuj do istniejącego wzorca (ten sam komponent/klasy co sąsiednie zakładki).

- [ ] **Step 4: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Review per task** (`frontend-design` + review).

---

## Task 11: Trasa trener — szczegół ćwiczenia

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx`

- [ ] **Step 1: Implement loader + view (mirror Task 8 + tenant-scope)**

```tsx
// app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer, getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const exerciseId = args.params.exerciseId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "") ? (raw as ProgressionRange) : "3m";

  const view = await getExerciseProgression(db, traineeId, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { trainee, view, range };
}

export default function TrenerProgresjaSzczegol() {
  const { view, range } = useLoaderData<typeof loader>();
  // UI identyczne jak Task 8 (te same komponenty wykresów), tylko nagłówek z imieniem podopiecznego.
  return null; // zastąp realnym UI
}
```

- [ ] **Step 2: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Review per task** (`frontend-design` + review).

---

## Task 12: Trasa trener — porównanie

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx`

- [ ] **Step 1: Implement loader + view (mirror Task 9 + tenant-scope)**

```tsx
// app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer, getProgressionComparison } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const ids = (url.searchParams.get("ex") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "") ? (raw as ProgressionRange) : "3m";

  const comparison = await getProgressionComparison(db, traineeId, ids, range);
  return { trainee, comparison, range, ids };
}

export default function TrenerProgresjaPorownanie() {
  const { comparison, range } = useLoaderData<typeof loader>();
  // UI identyczne jak Task 9.
  return null; // zastąp realnym UI
}
```

- [ ] **Step 2: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Review per task** (`frontend-design` + review).

---

## Task 13: Test integracyjny — tenant-scope (PISZ, nie uruchamiaj)

**Files:**
- Create: `tests/progression-tenant-scope.itest.ts`

Krytyczny przepływ: trener nie widzi progresji cudzego podopiecznego. Wzoruj się na istniejących `tests/*.itest.ts` (setup testcontainers, helpery seedujące, import schematu/klienta). **Nie uruchamiaj** — Docker prowadzi właściciel; oznacz „do uruchomienia".

- [ ] **Step 1: Write the integration test**

```ts
// tests/progression-tenant-scope.itest.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
// Dopasuj importy do wzorca istniejących *.itest.ts w repo:
//   - uruchomienie kontenera Postgres + migracje
//   - klient `db`
//   - helpery do seedowania użytkowników/ćwiczeń/logów
import { findTraineeOfTrainer, getExerciseProgression, listProgressionExercises } from "~/lib/progression";

describe("progresja — tenant scope", () => {
  // Seed: trener A z podopiecznym P_A (kilka logów Pull-up); trener B bez relacji do P_A.
  // (użyj helperów seedujących z istniejących itestów)

  it("trener B nie znajduje podopiecznego trenera A (→ null → 404 w loaderze)", async () => {
    const found = await findTraineeOfTrainer(db, TRAINER_B_ID, TRAINEE_OF_A_ID);
    expect(found).toBeNull();
  });

  it("trener A znajduje swojego podopiecznego", async () => {
    const found = await findTraineeOfTrainer(db, TRAINER_A_ID, TRAINEE_OF_A_ID);
    expect(found?.id).toBe(TRAINEE_OF_A_ID);
  });

  it("listProgressionExercises zwraca tylko dane właściwego podopiecznego", async () => {
    const rowsA = await listProgressionExercises(db, TRAINEE_OF_A_ID);
    expect(rowsA.length).toBeGreaterThan(0);
    // żaden wiersz nie pochodzi z logów innego podopiecznego (sprawdź po znanym PR/nazwie)
  });

  it("getExerciseProgression liczony jest w obrębie jednego podopiecznego", async () => {
    const view = await getExerciseProgression(db, TRAINEE_OF_A_ID, PULLUP_ID, "all");
    expect(view).not.toBeNull();
    expect(view?.kpis.sessionsInRange).toBeGreaterThan(0);
  });
});
```

> Stałe `TRAINER_A_ID` itd. pochodzą z kroku seedującego — uzupełnij wg wzorca istniejących itestów (te same helpery, ten sam styl asercji). Trzymaj plik samodzielnym i deterministycznym.

- [ ] **Step 2: Typecheck (bez uruchamiania)**

Run: `npm run typecheck`
Expected: PASS — test się kompiluje. **Nie** uruchamiaj `*.itest.ts` (Docker = właściciel).

- [ ] **Step 3: Review per task** (`superpowers:requesting-code-review`).

---

## Task 14: Dokumentacja + bramki końcowe + security review

**Files:**
- Modify: `app/lib/README.md`, `app/components/README.md`, `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`

- [ ] **Step 1: Update directory READMEs**

- `app/lib/README.md` — dodaj `progression.ts` (zapytania DB modułu Progresja) i `progression-math.ts` (czyste helpery: zakresy, agregacja tygodniowa, status, zmiana %, normalizacja %, sort).
- `app/components/README.md` — dodaj `progression-charts.tsx` (ProgressionLineChart, VolumeBars, RepsVsEffortChart, ComparisonChart, ProgressionStatusBadge).
- `app/routes/podopieczny/README.md` — dodaj 3 trasy `progresja*` z mapą URL→plik.
- `app/routes/trener/README.md` — dodaj 3 trasy `podopieczni/:traineeId/progresja*`.

Sprawdź, czy mapa w `CLAUDE.md` nadal prawdziwa (linkuje do README katalogów — nowy katalog nie powstał, więc zwykle bez zmian).

- [ ] **Step 2: Final gates (z dowodem — `superpowers:verification-before-completion`)**

Run i potwierdź zielone:
```
npm test
npm run typecheck
npm run lint
npm run build
```
Expected: wszystkie PASS. Cytuj wynik, nie twierdź „gotowe" bez zielonego outputu.

- [ ] **Step 3: Security review**

Uruchom `/security-review` — moduł dotyka `trainer_id`/autoryzacji (tenant-scope, 404). Zweryfikuj: brak wycieku danych między podopiecznymi, brak IDOR na `:traineeId`/`:exerciseId`, parametry `?ex=` sanityzowane (split/filter).

- [ ] **Step 4: Handoff (granica gita)**

Wypisz: podsumowanie + lista plików, proponowany commit message, brak migracji (moduł nie zmienia schematu), brak nowych env, komendy testów integracyjnych do odpalenia pod Dockerem (`*.itest.ts`), oraz ścieżkę ręcznej weryfikacji (zaloguj treningi → otwórz `/podopieczny/progresja` i widok trenera). Właściciel: branch/commit/push.

---

## Self-Review (autora planu)

**Spec coverage:**
- Lista (wiersz, status, sparkline, PR, filtr tagów) → Task 7 (+ math Task 1–2). ✓
- Sort różny wg roli → `defaultSort` w loaderach (Task 7 „recent", Task 10 „attention") + `sortProgressionRows`. ✓
- Szczegół (4 KPI, bohater A, karty B/C, zakresy, auto-agregacja) → Task 4 (`getExerciseProgression`, `granularity`) + Task 6 (wykresy) + Task 8. ✓
- Porównanie (% od startu, mieszane jednostki, „za mało danych", wejście „Porównaj") → Task 5 + Task 6 (`ComparisonChart`) + Task 9. ✓
- Trener: lustro + sort uwaga + pasek podsumowania → Task 10 (`summarizeStatuses`). ✓
- Nawigacja: menu boczne + zakładka → Task 7 Step 3, Task 10 Step 3. ✓
- Tenant-scope 404 → `findTraineeOfTrainer` (Task 3) używany w Task 10–12; test Task 13. ✓
- Stany brzegowe (0/1 sesja, brak w zakresie, start=0) → `markPrs`/`statusFromSessions`/`computePeriodChangePct`/`normalizeToPctFromStart` (Task 1–2) + puste stany w trasach. ✓
- REPS vs SEC → `unit` w widokach; formatowanie liczb w UI (Task 8/11). ✓
- Brak migracji → potwierdzone (Task 14 handoff). ✓
- Dokumentacja → Task 14. ✓

**Placeholder scan:** komentarze `// zastąp realnym UI` w trasach są świadomym delegowaniem warstwy wizualnej do `frontend-design` (logika loaderów jest kompletna i konkretna) — nie są placeholderami logiki. Brak „TBD/TODO" w kodzie testowanym.

**Type consistency:** `SessionPoint`, `ChartPoint`, `ProgressionRange`, `ProgressionStatus`, `ProgressionListRow` zdefiniowane raz w `progression-math.ts`; `ComparisonSeries`/`ExerciseProgressionView`/`ProgressionKpis` w `progression.ts`. Nazwy funkcji spójne między definicją (Task 1–5) a użyciem w trasach (Task 7–12): `listProgressionExercises`, `getExerciseProgression`, `getProgressionComparison`, `findTraineeOfTrainer`, `sortProgressionRows`, `summarizeStatuses`. ✓
