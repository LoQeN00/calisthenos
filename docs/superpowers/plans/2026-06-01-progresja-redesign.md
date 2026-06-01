# Progresja — przeprojektowanie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Granica gita (kalisthenos):** Claude NIE wykonuje operacji git ani Dockera. „Commit" w tym planie = **punkt review + logiczna granica commita dla właściciela**, nie polecenie do uruchomienia. Testy integracyjne pisze Claude, uruchamia właściciel.

**Goal:** Przebudować moduł „Progresja" (podopieczny + trener) w czytelną zakładkę z jedną definicją postępu (rekord/`best`) i interaktywnymi wykresami visx (osie, wartości, legendy, tooltipy hover+dotyk).

**Architecture:** Bez zmian w schemacie i trasach. Czysta logika w `progression-math.ts`/`progression.ts` (TDD), prezentacja w `progression-charts.tsx` przepisana na visx. Trasy reużywają zmienionych komponentów; pasek podsumowania statusów wyniesiony do wspólnego komponentu.

**Tech Stack:** React Router v7 (SSR), TypeScript strict, visx (`@visx/*`), Vitest, Biome.

**Reguły projektowe (pilnuj w każdym tasku):** tenant-scope bez zmian (loadery read-only, `findTraineeOfTrainer` → 404); brak nowych tras → `app/routes.ts` bez zmian; brak zmian `schema.ts`/migracji; UI po polsku; warstwę wizualną implementuj zgodnie z `design-system/README.md` i tokenami `app/styles/tokens.css` (przez skill `frontend-design:frontend-design`); dokumentacja katalogu = część „done".

---

## File Structure

| Plik | Zmiana | Odpowiedzialność |
|---|---|---|
| `package.json` | Modify | Zależności visx |
| `app/lib/progression-math.ts` | Modify | Status z `best`; helper `unitLabelPl` |
| `app/lib/progression-math.test.ts` | Modify | Testy statusu na `best` + `unitLabelPl` |
| `app/lib/progression.ts` | Modify | `ComparisonSeries` + `startValue`/`endValue` |
| `app/components/progression-charts.tsx` | Modify | Wykresy visx; `StatusSummaryBar`; usun. `RepsVsEffortChart` |
| `app/routes/podopieczny/progresja._index.tsx` | Modify | Pasek podsumowania, jednostka PL, „rekord", sparkline wg statusu |
| `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx` | Modify | Użycie wspólnego `StatusSummaryBar`, jednostka PL, sparkline wg statusu |
| `app/routes/podopieczny/progresja.$exerciseId.tsx` | Modify | Etykieta „Okres", usun. „Siła = lżej" |
| `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx` | Modify | jw. |
| `app/routes/podopieczny/progresja.porownanie.tsx` | Modify | Etykieta „Okres", tabela „konkretnie" |
| `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx` | Modify | jw. |
| `app/components/README.md`, `app/lib/README.md`, `CLAUDE.md` | Modify | Dokumentacja |

---

## Task 1: Zależności visx

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Dodaj zależności**

Dodaj do `dependencies` w `package.json` (wersje aktualne z npm w momencie instalacji):

```
"@visx/axis", "@visx/curve", "@visx/event", "@visx/grid",
"@visx/group", "@visx/responsive", "@visx/scale", "@visx/shape", "@visx/tooltip"
```

Zainstaluj (to dobierze wersje i zaktualizuje lockfile):

Run: `npm install @visx/axis @visx/curve @visx/event @visx/grid @visx/group @visx/responsive @visx/scale @visx/shape @visx/tooltip`
Expected: instalacja bez błędów; `package-lock.json` zaktualizowany.

- [ ] **Step 2: Weryfikacja**

Run: `npm run typecheck`
Expected: PASS (brak nowych błędów; pakiety dostarczają własne typy).

**Critical-flow:** NIE. **Unit-test:** brak (zmiana zależności). **Review:** granica commita.

---

## Task 2: Status postępu liczony z `best` + helper jednostki PL (TDD)

Cel: jedna definicja postępu. `statusFromSessions` ma liczyć z `best` (rekord), nie `avgReps`. Dodaj polski helper jednostki używany przez listy.

**Files:**
- Modify: `app/lib/progression-math.ts`
- Test: `app/lib/progression-math.test.ts`

- [ ] **Step 1: Napisz failujące testy**

Dopisz w `app/lib/progression-math.test.ts` (import `unitLabelPl` dodaj do listy importów u góry):

```ts
describe("statusFromSessions liczy z best (nie avgReps)", () => {
  it("rośnie, gdy best ostatnich 4 > poprzednich 4, mimo płaskiego avgReps", () => {
    // avgReps stałe = 5, ale best rośnie z 8 → 12
    const mk = (best: number): SessionPoint => sp("2026-01-01", best, 5, 7, best * 3);
    const rows = [mk(12), mk(12), mk(12), mk(12), mk(8), mk(8), mk(8), mk(8)];
    expect(statusFromSessions(rows)).toBe("up");
  });
  it("spada, gdy best ostatnich 4 < poprzednich 4", () => {
    const mk = (best: number): SessionPoint => sp("2026-01-01", best, 5, 7, best * 3);
    const rows = [mk(8), mk(8), mk(8), mk(8), mk(12), mk(12), mk(12), mk(12)];
    expect(statusFromSessions(rows)).toBe("down");
  });
});

describe("unitLabelPl", () => {
  it("mapuje jednostki na polskie skróty", () => {
    expect(unitLabelPl("REPS")).toBe("powt.");
    expect(unitLabelPl("SEC")).toBe("sek.");
  });
});
```

Zaktualizuj też opis istniejącego testu z linii „averages recent 4 vs prior 4 of avgReps" na „best" (treść asercji zostaje — tam `best === avgReps`).

- [ ] **Step 2: Uruchom — ma failować**

Run: `npm run test:unit -- progression-math`
Expected: FAIL (`unitLabelPl` nie istnieje; nowy test statusu czerwony).

- [ ] **Step 3: Implementacja**

W `app/lib/progression-math.ts` zmień `statusFromSessions`, by używała `best`:

```ts
/** sessions newest-first → status z best (rekordu) recent 4 vs prior 4. */
export function statusFromSessions(sessionsNewestFirst: SessionPoint[]): ProgressionStatus {
  const recent = sessionsNewestFirst.slice(0, 4).map((s) => s.best);
  const prior = sessionsNewestFirst.slice(4, 8).map((s) => s.best);
  return classifyStatus(mean(recent), mean(prior), sessionsNewestFirst.length);
}
```

Dodaj na końcu pliku helper:

```ts
/** Polski skrót jednostki ćwiczenia do etykiet UI. */
export function unitLabelPl(unit: "REPS" | "SEC"): string {
  return unit === "SEC" ? "sek." : "powt.";
}
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `npm run test:unit -- progression-math`
Expected: PASS (wszystkie, łącznie z nowymi).

**Critical-flow:** NIE. **Unit-test:** TAK (powyżej). **Review:** granica commita.

---

## Task 3: Surowe wartości start→teraz w porównaniu

Cel: tabela „konkretnie" potrzebuje surowych `best` na starcie i końcu okresu (np. „8 → 12 powt.").

**Files:**
- Modify: `app/lib/progression.ts`

- [ ] **Step 1: Rozszerz typ `ComparisonSeries`**

W `app/lib/progression.ts` w `interface ComparisonSeries` dodaj dwa pola:

```ts
export interface ComparisonSeries {
  exerciseId: string;
  name: string;
  unit: "REPS" | "SEC";
  startValue: number; // best na początku okresu (surowo)
  endValue: number;   // best na końcu okresu (surowo)
  points: Array<{ performedOn: string; pct: number }>;
}
```

- [ ] **Step 2: Wypełnij pola w `getProgressionComparison`**

W pętli, w gałęzi sukcesu (po wyliczeniu `pct`), zmień `series.push({...})` na:

```ts
series.push({
  exerciseId: id,
  name: group[0]!.name,
  unit: group[0]!.unit,
  startValue: inRange[0]!.best,
  endValue: inRange[inRange.length - 1]!.best,
  points: inRange.map((p, i) => ({ performedOn: p.performedOn, pct: pct[i]! })),
});
```

- [ ] **Step 3: Weryfikacja typów**

Run: `npm run typecheck`
Expected: PASS (komponent `ComparisonChart` używa tylko `points`/`exerciseId`/`name`; nowe pola nie psują wywołań).

**Critical-flow:** NIE (loader read-only, tenant-scope `traineeId` bez zmian). **Unit-test:** brak (funkcja DB; pokryta `tests/progression-tenant-scope.itest.ts` — pozostaje zielona). **Review:** granica commita.

---

## Task 4: Wspólny `StatusSummaryBar` + sparkline wg statusu (helpery prezentacji)

Cel: jeden pasek podsumowania dla obu list (dziś tylko u trenera, inline). Wynieś do `progression-charts.tsx`.

**Files:**
- Modify: `app/components/progression-charts.tsx`

- [ ] **Step 1: Dodaj eksporty do `progression-charts.tsx`**

Na górze pliku dodaj import typu:

```ts
import type { ProgressionStatus, StatusSummary } from "~/lib/progression-math";
```

Dodaj komponent i helper (przenosząc logikę z trasy trenera):

```tsx
/** Pasek podsumowania statusów nad listą Progresji (obie role). */
export function StatusSummaryBar({ summary }: { summary: StatusSummary }) {
  const items: Array<{ label: string; value: number; color: string }> = [
    { label: "▲ rośnie", value: summary.up, color: "var(--ok)" },
    { label: "= stabilnie", value: summary.flat, color: "var(--muted)" },
    { label: "▼ spada", value: summary.down, color: "var(--danger)" },
    { label: "nowe", value: summary.new, color: "var(--muted)" },
  ];
  return (
    <div
      className="row wrap"
      style={{
        gap: 16,
        marginBottom: 18,
        padding: "10px 14px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
      }}
    >
      {items.map((it) => (
        <span key={it.label} className="row" style={{ gap: 6, alignItems: "baseline" }}>
          <span className="text-xs" style={{ color: it.color, fontWeight: 600 }}>
            {it.label}
          </span>
          <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: it.color }}>
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Kolor linii sparkline wg statusu trendu (zielony/czerwony/szary). */
export function sparkStrokeForStatus(status: ProgressionStatus): string {
  if (status === "up") return "var(--ok)";
  if (status === "down") return "var(--danger)";
  return "var(--muted)"; // flat / new
}
```

- [ ] **Step 2: Weryfikacja**

Run: `npm run typecheck`
Expected: PASS.

**Critical-flow:** NIE. **Unit-test:** brak (czysta prezentacja; weryfikacja przez `npm run shots` w Tasku 8). **Frontend-design:** trzymaj tokeny/spójność. **Review:** granica commita.

---

## Task 5: Przepisz wykres główny `ProgressionLineChart` na visx (interaktywny)

Cel: oś Y z wartościami + gridlines, oś X z datami, linia + kropki kolorowane wg RPE, punkt PR podpisany, **legenda RPE** w karcie, **tooltip hover+dotyk** (data, wartość, RPE, znacznik PR). Responsywny przez `ParentSize`.

**Files:**
- Modify: `app/components/progression-charts.tsx`

- [ ] **Step 1: Importy visx**

Dodaj na górze `progression-charts.tsx`:

```tsx
import { useMemo, useCallback } from "react";
import { Group } from "@visx/group";
import { scalePoint, scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import { localPoint } from "@visx/event";
```

- [ ] **Step 2: Zastąp ciało `ProgressionLineChart`**

Zachowaj istniejące helpery `NotEnough`, `rpeColor`, `fmtBest`. Podmień komponent `ProgressionLineChart` na wersję visx (render-prop responsywny + wewnętrzny `LineChartInner`):

```tsx
export function ProgressionLineChart({
  points,
  unit,
  height = 240,
}: {
  points: ChartPoint[];
  unit: Unit;
  height?: number;
}) {
  if (points.length < 2) return <NotEnough />;
  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ParentSize debounceTime={30}>
          {({ width }) =>
            width > 0 ? (
              <LineChartInner width={width} height={height} points={points} unit={unit} />
            ) : null
          }
        </ParentSize>
      </div>
      <RpeLegend />
    </div>
  );
}

const MARGIN = { top: 22, right: 16, bottom: 26, left: 34 };

function LineChartInner({
  width,
  height,
  points,
  unit,
}: {
  width: number;
  height: number;
  points: ChartPoint[];
  unit: Unit;
}) {
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const innerH = Math.max(height - MARGIN.top - MARGIN.bottom, 1);

  const bests = points.map((p) => p.best);
  const min = Math.min(...bests);
  const max = Math.max(...bests);
  const span = Math.max(max - min, 1);

  const xScale = useMemo(
    () => scalePoint<string>({ domain: points.map((p) => p.key), range: [0, innerW], padding: 0.5 }),
    [points, innerW],
  );
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [min - span * 0.12, max + span * 0.12], range: [innerH, 0], nice: true }),
    [min, max, span, innerH],
  );

  const prIndex = bests.indexOf(max);

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<ChartPoint>();
  const { containerRef, TooltipInPortal } = useTooltipInPortal({ detectBounds: true, scroll: true });

  // Nearest-point detection — działa dla myszy (move) i dotyku (touchmove).
  const handleMove = useCallback(
    (event: React.PointerEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
      const coords = localPoint(event.nativeEvent);
      if (!coords) return;
      const xInner = coords.x - MARGIN.left;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      points.forEach((p, i) => {
        const px = xScale(p.key) ?? 0;
        const d = Math.abs(px - xInner);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      const p = points[nearest]!;
      showTooltip({
        tooltipData: p,
        tooltipLeft: MARGIN.left + (xScale(p.key) ?? 0),
        tooltipTop: MARGIN.top + yScale(p.best),
      });
    },
    [points, xScale, yScale, showTooltip],
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg width={width} height={height} role="img" aria-label="Wykres rekordu w czasie">
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={yScale} width={innerW} numTicks={4} stroke="var(--line)" strokeDasharray="4 4" opacity={0.5} />
          <AxisLeft
            scale={yScale}
            numTicks={4}
            hideAxisLine
            hideTicks
            tickFormat={(v) => `${v}`}
            tickLabelProps={() => ({ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)", textAnchor: "end", dy: "0.33em", dx: "-2" })}
          />
          <AxisBottom
            top={innerH}
            scale={xScale}
            tickValues={[points[0]!.key, points[Math.floor((points.length - 1) / 2)]!.key, points[points.length - 1]!.key]}
            hideTicks
            stroke="var(--line)"
            tickFormat={(k) => points.find((p) => p.key === k)?.label ?? ""}
            tickLabelProps={() => ({ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)", textAnchor: "middle" })}
          />
          <LinePath
            data={points}
            x={(p) => xScale(p.key) ?? 0}
            y={(p) => yScale(p.best)}
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => {
            const isPr = i === prIndex;
            const cx = xScale(p.key) ?? 0;
            const cy = yScale(p.best);
            return (
              <g key={p.key}>
                <circle cx={cx} cy={cy} r={isPr ? 6 : 3.5} fill={rpeColor(p.avgRpe)} stroke={isPr ? "#fff" : "none"} strokeWidth={isPr ? 1.5 : 0} />
                {isPr && (
                  <text x={cx} y={cy - 11} fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink)" fontWeight={600} textAnchor="middle">
                    {fmtBest(p.best, unit)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Warstwa przechwytująca wskaźnik/dotyk */}
          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={hideTooltip}
            onTouchMove={handleMove}
            onTouchEnd={hideTooltip}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipInPortal
          key={Math.random()}
          top={tooltipTop}
          left={tooltipLeft}
          style={{ background: "var(--ink)", color: "var(--surface)", fontSize: 11, padding: "6px 8px", borderRadius: 6, lineHeight: 1.4, fontFamily: "var(--font-mono)" }}
        >
          <div style={{ fontWeight: 700 }}>
            {tooltipData.label} · {fmtBest(tooltipData.best, unit)}
          </div>
          <div>RPE {tooltipData.avgRpe ?? "—"}</div>
          {tooltipData.isPr && <div style={{ color: "var(--accent)" }}>nowy rekord ★</div>}
        </TooltipInPortal>
      )}
    </div>
  );
}

/** Legenda kolorów RPE pod wykresem rekordu. */
function RpeLegend() {
  const items = [
    { c: "var(--ok)", t: "łatwo" },
    { c: "var(--warn)", t: "średnio" },
    { c: "var(--danger)", t: "ciężko" },
  ];
  return (
    <div className="row wrap" style={{ gap: 12, fontSize: 11, marginTop: 8 }}>
      <span className="muted">kolor = jak ciężko (RPE):</span>
      {items.map((it) => (
        <span key={it.t} className="row" style={{ gap: 6, alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: it.c }} />
          <span className="muted">{it.t}</span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Weryfikacja typów + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS (komponent renderuje się w SSR; `ParentSize` zwraca `null` przy width 0 — brak crash na serwerze).

**Critical-flow:** NIE. **Unit-test:** brak (prezentacja; weryfikacja wizualna w Tasku 8). **Frontend-design:** TAK — implementuj przez `frontend-design:frontend-design`, trzymaj tokeny. **Review:** granica commita.

---

## Task 6: Przepisz `VolumeBars` na visx + usuń `RepsVsEffortChart`

**Files:**
- Modify: `app/components/progression-charts.tsx`

- [ ] **Step 1: Podmień `VolumeBars`**

```tsx
export function VolumeBars({ points, height = 110 }: { points: ChartPoint[]; height?: number }) {
  if (points.length === 0) return <NotEnough />;
  return (
    <div style={{ width: "100%", height }}>
      <ParentSize debounceTime={30}>
        {({ width }) => (width > 0 ? <VolumeBarsInner width={width} height={height} points={points} /> : null)}
      </ParentSize>
    </div>
  );
}

const VB_MARGIN = { top: 8, right: 8, bottom: 20, left: 30 };

function VolumeBarsInner({ width, height, points }: { width: number; height: number; points: ChartPoint[] }) {
  const innerW = Math.max(width - VB_MARGIN.left - VB_MARGIN.right, 1);
  const innerH = Math.max(height - VB_MARGIN.top - VB_MARGIN.bottom, 1);
  const max = Math.max(...points.map((p) => p.volume), 1);
  const x = useMemo(
    () => scaleBand<string>({ domain: points.map((p) => p.key), range: [0, innerW], padding: 0.2 }),
    [points, innerW],
  );
  const y = useMemo(() => scaleLinear<number>({ domain: [0, max], range: [innerH, 0], nice: true }), [max, innerH]);
  const lastKey = points[points.length - 1]!.key;
  return (
    <svg width={width} height={height} role="img" aria-label="Łączna praca w sesji">
      <Group left={VB_MARGIN.left} top={VB_MARGIN.top}>
        <AxisLeft scale={y} numTicks={3} hideAxisLine hideTicks
          tickLabelProps={() => ({ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)", textAnchor: "end", dy: "0.33em", dx: "-2" })} />
        {points.map((p) => {
          const bx = x(p.key) ?? 0;
          const by = y(p.volume);
          const h = innerH - by;
          return (
            <Bar key={p.key} x={bx} y={by} width={x.bandwidth()} height={Math.max(h, p.volume > 0 ? 2 : 0)} rx={3}
              fill={p.key === lastKey ? "#9bbf2e" : "var(--accent)"}>
              <title>{p.label}: {p.volume}</title>
            </Bar>
          );
        })}
      </Group>
    </svg>
  );
}
```

Do importów dodaj `Bar` (z `@visx/shape`) i `scaleBand` (z `@visx/scale`):

```tsx
import { Bar, LinePath } from "@visx/shape";
import { scalePoint, scaleLinear, scaleBand } from "@visx/scale";
```

- [ ] **Step 2: Usuń `RepsVsEffortChart` i `LegendDot` jeśli nieużywany**

Usuń z `progression-charts.tsx` całą funkcję `RepsVsEffortChart`. `LegendDot` jest używany przez `ComparisonChartLegend` — zostaw. (Po Tasku 7 trasy nie będą już importować `RepsVsEffortChart`.)

- [ ] **Step 3: Weryfikacja**

Run: `npm run typecheck`
Expected: chwilowo MOŻE zgłosić nieużywany lub brakujący import w trasach detalu — naprawiamy w Tasku 7. Najpierw dokończ Task 7, potem wspólnie:
Run: `npm run build` (po Tasku 7) → PASS.

**Critical-flow:** NIE. **Frontend-design:** TAK. **Review:** wspólny z Taskiem 7.

---

## Task 7: Trasy szczegółu (podopieczny + trener)

Cel: etykieta „Okres", usunięcie sekcji „Siła = lżej" i importu `RepsVsEffortChart`, dopisany podtytuł wykresu.

**Files:**
- Modify: `app/routes/podopieczny/progresja.$exerciseId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx`

- [ ] **Step 1: Popraw importy w obu plikach**

Zmień import komponentów na (bez `RepsVsEffortChart`):

```tsx
import { ProgressionLineChart, VolumeBars } from "~/components/progression-charts";
```

- [ ] **Step 2: Dodaj etykietę „Okres" przy przełączniku (oba pliki)**

Owiń istniejący `div.row.wrap` z przełącznikiem w wiersz z etykietą — zamień otwarcie bloku przełącznika na:

```tsx
<div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
  <span className="text-xs muted" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>
    Okres
  </span>
  <div className="row wrap" style={{ gap: 6 }}>
    {RANGE_LABELS.map((r) => {
      /* ...bez zmian... */
    })}
  </div>
</div>
```

(Usuń poprzedni `marginBottom: 18` z wewnętrznego diva, bo przeniesiony na wrapper.)

- [ ] **Step 3: Zmień tytuł hero i usuń sekcję „Siła = lżej" (oba pliki)**

Zmień nagłówek karty hero i dodaj podtytuł:

```tsx
<div className="row between" style={{ alignItems: "baseline", marginBottom: 4, gap: 8 }}>
  <h2 style={{ fontSize: 16 }}>Rekord w czasie</h2>
  {granularity === "week" && <span className="text-xs muted">ujęcie tygodniowe</span>}
</div>
<div className="text-xs muted" style={{ marginBottom: 12 }}>
  Najlepsza seria każdej sesji.
</div>
<ProgressionLineChart points={points} unit={unit} />
```

Zamień dolny grid (objętość + „Siła = lżej") na pojedynczą kartę objętości:

```tsx
<div className="card" style={{ padding: 18 }}>
  <h2 style={{ fontSize: 16, marginBottom: 2 }}>Łączna praca w sesji</h2>
  <div className="text-xs muted" style={{ marginBottom: 12 }}>Suma powtórzeń ze wszystkich serii.</div>
  <VolumeBars points={points} />
</div>
```

- [ ] **Step 4: Weryfikacja**

Run: `npm run typecheck`
Expected: PASS (brak referencji do `RepsVsEffortChart`).
Run: `npm run build`
Expected: PASS.

**Critical-flow:** NIE (loader read-only; trener: `findTraineeOfTrainer` → 404 bez zmian). **Unit-test:** brak. **Frontend-design:** TAK. **Review:** granica commita (wspólnie z Taskiem 6).

---

## Task 8: Trasy list (podopieczny + trener)

Cel: podopieczny dostaje `StatusSummaryBar`; obie listy: jednostka PL (`powt./sek.`), podpis „rekord", sparkline kolorowany wg statusu. Trener: użyj wspólnego `StatusSummaryBar` zamiast lokalnego.

**Files:**
- Modify: `app/routes/podopieczny/progresja._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx`

### 8a. Podopieczny — `progresja._index.tsx`

- [ ] **Step 1: Loader — policz podsumowanie**

W loaderze dodaj `summarizeStatuses` i zwróć `summary` liczone z PEŁNEJ listy (przed filtrem kategorii, by pasek był stabilny):

Import:
```tsx
import { ProgressionStatusBadge, StatusSummaryBar, sparkStrokeForStatus } from "~/components/progression-charts";
import { sortProgressionRows, summarizeStatuses, unitLabelPl } from "~/lib/progression-math";
```

W loaderze, po `const rows = await listProgressionExercises(...)`:
```tsx
const summary = summarizeStatuses(rows);
```
i dodaj `summary` do zwracanego obiektu: `return { rows: visible, summary, spec, controls, hasAny: rows.length > 0 };`

- [ ] **Step 2: Render — pasek, jednostka PL, „rekord", kolor sparkline**

W komponencie pobierz `summary` z `useLoaderData`. **Nad** `<ListControls .../>` dodaj (gdy są wiersze, dla spójności z trenerem — patrz 8b):
```tsx
<StatusSummaryBar summary={summary} />
<ListControls spec={spec} state={controls} />
```

W wierszu: zamień `prText` i badge jednostki oraz sparkline:
```tsx
const prText = `${row.pr}${row.unit === "SEC" ? " s" : ""}`;
// badge jednostki:
<span className="badge">{unitLabelPl(row.unit)}</span>
// sparkline:
<Sparkline values={row.sparkline} width={96} height={30} stroke={sparkStrokeForStatus(row.status)} fill="transparent" />
// liczba rekordu z podpisem:
<div style={{ textAlign: "right", minWidth: 56 }} title="Rekord osobisty">
  <div className="text-xs muted">rekord</div>
  <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{prText}</div>
</div>
```

- [ ] **Step 3: Weryfikacja**

Run: `npm run typecheck`
Expected: PASS.

### 8b. Trener — `podopieczni.$traineeId.progresja._index.tsx`

- [ ] **Step 4: Użyj wspólnego `StatusSummaryBar`**

Zmień import:
```tsx
import { ProgressionStatusBadge, StatusSummaryBar, sparkStrokeForStatus } from "~/components/progression-charts";
import { sortProgressionRows, summarizeStatuses, unitLabelPl, type StatusSummary } from "~/lib/progression-math";
```
Usuń lokalną definicję `function StatusSummaryBar(...)` z dołu pliku (linie z komponentem). `StatusSummary` zostaje w imporcie tylko jeśli używany w sygnaturze loadera; jeśli nie — usuń z importu.

- [ ] **Step 5: Jednostka PL, „rekord", kolor sparkline**

Analogicznie do 8a:
```tsx
<span className="badge">{unitLabelPl(row.unit)}</span>
<Sparkline values={row.sparkline} width={96} height={30} stroke={sparkStrokeForStatus(row.status)} fill="transparent" />
<div style={{ textAlign: "right", minWidth: 56 }} title="Rekord osobisty">
  <div className="text-xs muted">rekord</div>
  <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{prText}</div>
</div>
```

- [ ] **Step 6: Weryfikacja + zrzuty**

Run: `npm run typecheck` → PASS
Run: `npm run build` → PASS
Run (po wstaniu stacku, właściciel/Claude lokalnie): `npm run shots -- /podopieczny/progresja` oraz `/trener` odpowiedniki — sprawdź czytelność desktop+mobile.

**Critical-flow:** NIE. **Unit-test:** logika statusu/jednostki pokryta w Tasku 2. **Frontend-design:** TAK. **Review:** granica commita.

---

## Task 9: Trasy porównania (podopieczny + trener)

Cel: etykieta „Okres" + tabela „konkretnie w tym okresie" (start→teraz). Wykres staje się interaktywny dzięki Taskowi 10.

**Files:**
- Modify: `app/routes/podopieczny/progresja.porownanie.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx`

- [ ] **Step 1: Etykieta „Okres" (oba pliki)**

Tak jak w Tasku 7 Step 2 — owiń przełącznik zakresu w wiersz z etykietą „Okres" (zachowaj istniejące `to={...}` z `?ex=...`).

- [ ] **Step 2: Tabela „konkretnie" pod wykresem (oba pliki)**

Pod kartą wykresu (przed/po „Pominięte") dodaj, gdy `comparison.series.length >= 1`:

```tsx
<div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
  <div className="k" style={{ marginBottom: 8 }}>Konkretnie w tym okresie</div>
  <div className="col" style={{ gap: 4 }}>
    {comparison.series.map((s) => {
      const pct = s.startValue === 0 ? null : Math.round((s.endValue / s.startValue - 1) * 100);
      const u = s.unit === "SEC" ? " s" : "";
      const color = pct == null ? "var(--muted)" : pct > 0 ? "var(--ok)" : pct < 0 ? "var(--danger)" : "var(--muted)";
      return (
        <div key={s.exerciseId} className="row between" style={{ fontSize: 13 }}>
          <span>{s.name}</span>
          <span className="muted">
            {s.startValue}{u} → {s.endValue}{u}{" "}
            <b className="mono" style={{ color }}>{pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}</b>
          </span>
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Doprecyzuj podtytuł (oba pliki)**

Zmień `div.sub` pod `<h1>` na:
```tsx
<div className="sub">
  Każda linia to o ile % urósł rekord od początku okresu — wspólna oś % zestawia różne jednostki (powt. i sek.).
</div>
```

- [ ] **Step 4: Weryfikacja**

Run: `npm run typecheck` → PASS
Run: `npm run build` → PASS

**Critical-flow:** NIE (loader read-only; trener guard 404 bez zmian). **Unit-test:** brak. **Frontend-design:** TAK. **Review:** granica commita.

---

## Task 10: Przepisz `ComparisonChart` na visx (interaktywny, oś %)

Cel: oś %, mocna linia 0%, daty na osi X, tooltip z pionową prowadnicą pokazujący wartości wszystkich linii dla danej daty.

**Files:**
- Modify: `app/components/progression-charts.tsx`

- [ ] **Step 1: Podmień `ComparisonChart`**

Zachowaj `COMPARE_COLORS` i `ComparisonChartLegend`. Podmień `ComparisonChart` na wersję visx z `scaleTime`:

```tsx
import { scalePoint, scaleLinear, scaleBand, scaleTime } from "@visx/scale";

const CMP_MARGIN = { top: 12, right: 14, bottom: 24, left: 40 };

export function ComparisonChart({ series, height = 240 }: { series: ComparisonSeries[]; height?: number }) {
  if (series.length === 0) return <NotEnough text="wybierz co najmniej 2 ćwiczenia do porównania" />;
  const hasPoints = series.some((s) => s.points.length > 0);
  if (!hasPoints) return <NotEnough text="brak punktów do porównania" />;
  return (
    <div style={{ width: "100%", height }}>
      <ParentSize debounceTime={30}>
        {({ width }) => (width > 0 ? <ComparisonInner width={width} height={height} series={series} /> : null)}
      </ParentSize>
    </div>
  );
}

function ComparisonInner({ width, height, series }: { width: number; height: number; series: ComparisonSeries[] }) {
  const innerW = Math.max(width - CMP_MARGIN.left - CMP_MARGIN.right, 1);
  const innerH = Math.max(height - CMP_MARGIN.top - CMP_MARGIN.bottom, 1);

  const allTimes: number[] = [];
  const allPct: number[] = [];
  for (const s of series) for (const pt of s.points) { allTimes.push(new Date(pt.performedOn).getTime()); allPct.push(pt.pct); }

  const xScale = useMemo(
    () => scaleTime<number>({ domain: [Math.min(...allTimes), Math.max(...allTimes)], range: [0, innerW] }),
    [allTimes, innerW],
  );
  const pMin = Math.min(0, ...allPct);
  const pMax = Math.max(0, ...allPct);
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [pMin, pMax], range: [innerH, 0], nice: true }),
    [pMin, pMax, innerH],
  );

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } =
    useTooltip<{ dateMs: number; rows: Array<{ name: string; pct: number; color: string }> }>();
  const { containerRef, TooltipInPortal } = useTooltipInPortal({ detectBounds: true, scroll: true });

  const handleMove = useCallback(
    (event: React.PointerEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
      const coords = localPoint(event.nativeEvent);
      if (!coords) return;
      const tMs = xScale.invert(coords.x - CMP_MARGIN.left).getTime();
      const rows = series.map((s, si) => {
        let nearest = s.points[0];
        let bestD = Number.POSITIVE_INFINITY;
        for (const pt of s.points) {
          const d = Math.abs(new Date(pt.performedOn).getTime() - tMs);
          if (d < bestD) { bestD = d; nearest = pt; }
        }
        return { name: s.name, pct: nearest?.pct ?? 0, color: COMPARE_COLORS[si % COMPARE_COLORS.length]! };
      });
      showTooltip({ tooltipData: { dateMs: tMs, rows }, tooltipLeft: coords.x, tooltipTop: CMP_MARGIN.top });
    },
    [series, xScale, showTooltip],
  );

  const fmtPct = (pct: number) => `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg width={width} height={height} role="img" aria-label="Porównanie progresji ćwiczeń">
        <Group left={CMP_MARGIN.left} top={CMP_MARGIN.top}>
          <GridRows scale={yScale} width={innerW} numTicks={4} stroke="var(--line)" opacity={0.4} />
          <AxisLeft scale={yScale} numTicks={4} hideAxisLine hideTicks tickFormat={(v) => fmtPct(Number(v))}
            tickLabelProps={() => ({ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)", textAnchor: "end", dy: "0.33em", dx: "-2" })} />
          <AxisBottom top={innerH} scale={xScale} numTicks={3} hideTicks stroke="var(--line)"
            tickFormat={(d) => { const dt = d as Date; return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}`; }}
            tickLabelProps={() => ({ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)", textAnchor: "middle" })} />
          {/* mocna linia 0% */}
          <line x1={0} x2={innerW} y1={yScale(0)} y2={yScale(0)} stroke="var(--line-2)" strokeWidth={1.5} />
          {series.map((s, si) => {
            const color = COMPARE_COLORS[si % COMPARE_COLORS.length]!;
            if (s.points.length === 0) return null;
            const last = s.points[s.points.length - 1]!;
            return (
              <g key={s.exerciseId}>
                <LinePath data={s.points} x={(pt) => xScale(new Date(pt.performedOn).getTime())} y={(pt) => yScale(pt.pct)}
                  stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={xScale(new Date(last.performedOn).getTime())} cy={yScale(last.pct)} r={3} fill={color} />
              </g>
            );
          })}
          {tooltipOpen && tooltipData && (
            <line x1={tooltipLeft - CMP_MARGIN.left} x2={tooltipLeft - CMP_MARGIN.left} y1={0} y2={innerH} stroke="var(--line-2)" strokeDasharray="3 3" />
          )}
          <rect width={innerW} height={innerH} fill="transparent"
            onPointerMove={handleMove} onPointerLeave={hideTooltip} onTouchMove={handleMove} onTouchEnd={hideTooltip} />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipInPortal key={Math.random()} top={tooltipTop} left={tooltipLeft}
          style={{ background: "var(--ink)", color: "var(--surface)", fontSize: 11, padding: "6px 8px", borderRadius: 6, lineHeight: 1.5, fontFamily: "var(--font-mono)" }}>
          {tooltipData.rows.map((r) => (
            <div key={r.name} className="row" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: r.color }} />
              <span>{r.name}: {r.pct > 0 ? "+" : ""}{Math.round(r.pct)}%</span>
            </div>
          ))}
        </TooltipInPortal>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Weryfikacja**

Run: `npm run typecheck` → PASS
Run: `npm run build` → PASS

**Critical-flow:** NIE. **Frontend-design:** TAK. **Review:** granica commita.

---

## Task 11: Dokumentacja

**Files:**
- Modify: `app/components/README.md`
- Modify: `app/lib/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `app/components/README.md`** — zaktualizuj wiersz `progression-charts.tsx`: dopisz, że wykresy używają **visx** (osie, gridy, tooltipy hover+dotyk, legenda RPE), że dodano `StatusSummaryBar` i `sparkStrokeForStatus`, oraz że usunięto `RepsVsEffortChart`.

- [ ] **Step 2: `app/lib/README.md`** — w wierszu `progression-math.ts` dopisz `unitLabelPl` i że status liczony jest z `best`; w `progression.ts` dopisz `startValue`/`endValue` w `ComparisonSeries`.

- [ ] **Step 3: `CLAUDE.md`** — w tabeli „Stack" dodaj wiersz: `Wykresy | **visx** (SVG, SSR-friendly, tree-shakeable)`.

- [ ] **Step 4: Weryfikacja** — przejrzyj, czy opisy są prawdziwe po zmianach.

**Critical-flow:** NIE. **Review:** granica commita.

---

## Task 12: Bramki końcowe + handoff

- [ ] **Step 1: Komplet bramek**

Run: `npm test` (lub `npm run test:unit`) → PASS
Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS
Run: `npm run build` → PASS

- [ ] **Step 2: `/code-review`** na całości diffu; nanieś poprawki (`superpowers:receiving-code-review`).

- [ ] **Step 3: Weryfikacja wizualna** — `npm run shots` na trasach Progresji (podopieczny + trener: lista, szczegół, porównanie), desktop + mobile; sprawdź osie/legendy/tooltipy.

- [ ] **Step 4: `/security-review`** — POMIŃ, jeśli diff nie dotyka auth / `trainer_id` / podpisanych URL / uploadu (ten plan nie dotyka — potwierdź).

- [ ] **Step 5: Handoff** (granica gita):
  - lista zmienionych plików + proponowany komunikat commita,
  - **`npm install`** wykonany (nowe zależności visx — `package.json` + `package-lock.json` w commicie),
  - brak `db:generate`/`db:migrate`/seed/nowych env,
  - testy do uruchomienia pod Dockerem przez właściciela: `npm run test:itest` (potwierdź zielony `tests/progression-tenant-scope.itest.ts`),
  - ścieżka ręcznej weryfikacji: zaloguj jako podopieczny → Progresja → ćwiczenie z ≥2 sesjami → sprawdź osie/legendę/tooltip (też na telefonie/responsywnie) → porównaj ≥2 ćwiczenia; powtórz jako trener.

---

## Self-review (pokrycie specu)

- §1/§4.2 nieczytelny szczegół → Task 5,6,7 (hero visx + legenda + „Okres" + usun. „Siła = lżej"). ✓
- §3 „Okres" bez etykiety → Task 7, 9. ✓
- §4 wykresy bez skali/interakcji → Task 5,6,10 (osie, wartości, tooltipy hover+dotyk). ✓
- §3/§5 jedna definicja postępu → Task 2 (`statusFromSessions` na `best`). ✓
- §4.1 pasek podsumowania na obu listach → Task 4 (wspólny) + Task 8a. ✓
- §4.1 jednostka PL / „rekord" / sparkline trendu → Task 2 (`unitLabelPl`) + Task 8. ✓
- §4.3 „po co"/oś %/0%/tooltip/tabela → Task 9 (tekst+tabela) + Task 10 (wykres). ✓
- §3 silnik = visx → Task 1 + komponenty. ✓
- §9 dokumentacja → Task 11. ✓
- §8 testy/bramki → Task 12. ✓

Brak placeholderów; nazwy spójne (`StatusSummaryBar`, `sparkStrokeForStatus`, `unitLabelPl`, `ComparisonSeries.startValue/endValue`) między taskami.
