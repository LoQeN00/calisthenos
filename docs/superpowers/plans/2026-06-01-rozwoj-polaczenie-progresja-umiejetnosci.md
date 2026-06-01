# Rozwój — połączenie „Progresji" i „Umiejętności" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Połączyć per-podopieczny widoki „Progresja" i „Umiejętności" w jedną powierzchnię **„Rozwój"** (drzewo jako dom + lista ćwiczeń spoza umiejętności pod nim + wspólny szczegół węzła: drabina wariantów *i* wykres rekordu-w-czasie bieżącego wariantu), bez zmian w modelu danych.

**Architecture:** Nowe poddrzewo tras `/rozwoj/*` (oba role), stare `progresja*`/`umiejetnosci*` (per-podopieczny) zamienione na cienkie loadery-redirecty (301). Reuse istniejących repozytoriów (`skill-tree.ts`, `skill-progression.ts`, `progression.ts`). Dwa wyodrębnione komponenty prezentacyjne (`ExerciseProgressionPanel`, `ProgressionList`) eliminują 4× duplikację między rolami i ekranami. Jeden czysty helper filtrujący (TDD). **Schemat bez zmian — brak migracji.**

**Tech Stack:** React Router v7 (framework mode, SSR), Drizzle ORM + Postgres, visx, Zod, Vitest (testcontainers dla `*.itest.ts`), Biome.

**Spec:** [`docs/superpowers/specs/2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci-design.md`](../specs/2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci-design.md)

---

## Reguły projektowe (OBOWIĄZUJĄ w każdym tasku)

- **Nigdy git, nigdy docker, nigdy `db:migrate`.** Po każdym tasku:
  `superpowers:requesting-code-review` (`/code-review`) na zmianach — **bez commita**.
  Git/migracje/Docker robi właściciel (handoff = Task 18).
- **Brak zmian w `schema.ts` i migracjach** — to przebudowa IA na istniejących danych.
- **npm**, nie pnpm. Komendy pojedynczo (allowlista), nie łańcuchuj/nie potokuj:
  `npm run typecheck`, `npm run lint`, `npm run build`, `npx vitest run <wzorzec>`,
  `npx biome format --write <plik>`. **Nie** `npm test` (to watch).
- **TDD** dla logiki bez DB (helper filtrujący, Task 1). Integracyjne (`*.itest.ts`)
  PISZ, **nie uruchamiaj** (Docker — właściciel, Task 18).
- **Tenant-scope:** trasy trenera przez `findTraineeOfTrainer` → **404**; podopieczny
  scope = `user.trainerId`/`user.id`; podopieczny read-only na całym `/rozwoj*`.
- **Frontend/UI → `frontend-design:frontend-design`.** Każdy task dotykający warstwy
  wizualnej idzie przez ten skill; kolory wyłącznie przez tokeny `var(--*)`
  (`app/styles/tokens.css`), UI po polsku, nazwy ćwiczeń EN. Weryfikacja wizualna
  `npm run shots` (jeśli stack działa; inaczej zgłoś do ręcznej weryfikacji).
- **Trasa = plik + wpis w `app/routes.ts`.**
- **Dokumentacja** (README katalogów / `CLAUDE.md` / `innovate.md`) to część „done" — Task 17.

## Mapa plików

| Plik | Akcja | Odpowiedzialność |
|---|---|---|
| `app/lib/progression-math.ts` | modyfikacja | `excludeByExerciseId` (czysty filtr) |
| `app/lib/progression-math.test.ts` | modyfikacja | testy helpera |
| `app/components/exercise-progression-panel.tsx` | utworzenie | KPI + przełącznik „Okres" + wykres rekordu + objętość (prezentacja) |
| `app/components/progression-list.tsx` | utworzenie | lista progresji + tryb porównania (prezentacja, role-agnostyczna) |
| `app/routes/podopieczny/rozwoj._index.tsx` | utworzenie | landing: drzewo + lista „Pozostałe" |
| `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx` | utworzenie | szczegół węzła (drabina + panel), read-only |
| `app/routes/podopieczny/rozwoj.cwiczenie.$exerciseId.tsx` | utworzenie | szczegół zwykłego ćwiczenia (z `ExerciseProgressionPanel`) |
| `app/routes/podopieczny/rozwoj.porownanie.tsx` | utworzenie | porównanie (relokacja) |
| `app/routes/podopieczny/progresja._index.tsx` | przebudowa | redirect → `/podopieczny/rozwoj` |
| `app/routes/podopieczny/progresja.$exerciseId.tsx` | przebudowa | redirect → `…/rozwoj/cwiczenie/:id` |
| `app/routes/podopieczny/progresja.porownanie.tsx` | przebudowa | redirect → `…/rozwoj/porownanie` |
| `app/routes/podopieczny/umiejetnosci.tsx` | przebudowa | redirect → `/podopieczny/rozwoj` |
| `app/routes/podopieczny/umiejetnosci.$skillId.tsx` | przebudowa | redirect → `…/rozwoj/umiejetnosc/:id` |
| `app/routes/podopieczny/_layout.tsx` | modyfikacja | nawigacja: „Progresja"+„Umiejętności" → „Rozwój" |
| `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx` | utworzenie | landing trenera |
| `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` | utworzenie | szczegół węzła + akcje awansu |
| `app/routes/trener/podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx` | utworzenie | szczegół ćwiczenia (relokacja) |
| `app/routes/trener/podopieczni.$traineeId.rozwoj.porownanie.tsx` | utworzenie | porównanie (relokacja) |
| `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx` | przebudowa | redirect |
| `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx` | przebudowa | redirect |
| `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx` | przebudowa | redirect |
| `app/routes/trener/podopieczni.$traineeId.umiejetnosci.tsx` | przebudowa | redirect |
| `app/routes/trener/podopieczni.$traineeId.umiejetnosci.$skillId.tsx` | przebudowa | redirect |
| `app/routes/trener/podopieczni.$traineeId.tsx` | modyfikacja | przyciski „Progresja"+„Umiejętności" → „Rozwój" |
| `app/routes.ts` | modyfikacja | rejestracja nowych tras (stare zostają jako shimy) |
| `tests/rozwoj.itest.ts` | utworzenie | testy integracyjne (PISZ, nie uruchamiaj) |

> **Uwaga o relokacjach:** „przebudowa redirect" i „relokacja" oznaczają konkretne
> transformacje opisane w taskach (pełny kod shima; dla relokowanych ekranów —
> dokładne podmiany ścieżek). Nie zostawiaj żadnego starego URL zwracającego 404.

---

## Task 1: Czysty helper `excludeByExerciseId` (TDD)

**Files:**
- Modify: `app/lib/progression-math.ts` (dodaj funkcję na końcu)
- Modify: `app/lib/progression-math.test.ts` (dodaj blok testów)

- [ ] **Step 1: Dopisz failujący test** do `app/lib/progression-math.test.ts` (dół pliku):

```ts
import { excludeByExerciseId } from "./progression-math";
import type { ProgressionListRow } from "./progression-math";

describe("excludeByExerciseId", () => {
  const row = (exerciseId: string): ProgressionListRow => ({
    exerciseId,
    name: exerciseId,
    unit: "REPS",
    tags: [],
    sessionCount: 1,
    lastPerformedOn: "2026-06-01",
    pr: 10,
    prAchievedOn: "2026-06-01",
    sparkline: [10],
    status: "new",
  });

  it("usuwa wiersze, których exerciseId jest w zbiorze", () => {
    const rows = [row("a"), row("b"), row("c")];
    const out = excludeByExerciseId(rows, new Set(["b"]));
    expect(out.map((r) => r.exerciseId)).toEqual(["a", "c"]);
  });

  it("pusty zbiór = brak zmian", () => {
    const rows = [row("a"), row("b")];
    expect(excludeByExerciseId(rows, new Set())).toHaveLength(2);
  });

  it("nie mutuje wejścia", () => {
    const rows = [row("a"), row("b")];
    excludeByExerciseId(rows, new Set(["a"]));
    expect(rows).toHaveLength(2);
  });
});
```

(Jeśli `describe`/`it`/`expect` nie są jeszcze zaimportowane na górze pliku, dodaj
`import { describe, expect, it } from "vitest";`.)

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npx vitest run app/lib/progression-math.test.ts`
Expected: FAIL — „excludeByExerciseId is not a function" / brak eksportu.

- [ ] **Step 3: Zaimplementuj** w `app/lib/progression-math.ts` (na końcu pliku):

```ts
/** Czysty filtr: zwraca nową listę bez wierszy, których exerciseId jest w `ids`. */
export function excludeByExerciseId(
  rows: ProgressionListRow[],
  ids: Set<string>,
): ProgressionListRow[] {
  if (ids.size === 0) return [...rows];
  return rows.filter((r) => !ids.has(r.exerciseId));
}
```

(`ProgressionListRow` jest już typem w tym pliku — nie dubluj importu.)

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/lib/progression-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + format**

Run: `npx biome format --write app/lib/progression-math.ts`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 6: Review per task** — `/code-review`. Bez commita.

---

## Task 2: Komponent `ExerciseProgressionPanel` (frontend-design)

Wyodrębniony z dzisiejszego `progresja.$exerciseId.tsx`: przełącznik „Okres" + KPI +
wykres rekordu + objętość. Używany przez szczegół ćwiczenia **i** szczegół węzła
(oba role).

**Files:**
- Create: `app/components/exercise-progression-panel.tsx`

> **UI → `frontend-design:frontend-design`.** Czysta prezentacja, kolory przez tokeny.

- [ ] **Step 1: Utwórz `app/components/exercise-progression-panel.tsx`:**

```tsx
import { Link } from "react-router";
import { ProgressionLineChart, VolumeBars } from "~/components/progression-charts";
import { fmtDate } from "~/lib/format";
import type { ExerciseProgressionView } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGE_LABELS: Array<{ value: ProgressionRange; label: string }> = [
  { value: "4w", label: "4 tyg" },
  { value: "3m", label: "3 mies" },
  { value: "6m", label: "6 mies" },
  { value: "all", label: "cały" },
];

/** Format a value by unit ("12" vs "30 s"). */
function fmtByUnit(value: number, unit: "REPS" | "SEC"): string {
  return unit === "SEC" ? `${value} s` : `${value}`;
}

/**
 * Pełny panel progresji jednego ćwiczenia: przełącznik „Okres", KPI, wykres
 * rekordu-w-czasie i objętość. Przełącznik używa względnych linków `?zakres=`
 * (działa pod każdą trasą; opcjonalny `rangeHrefExtra` dokleja inne paramy, np. ?ex=).
 * Czysta prezentacja — bez fetchowania.
 */
export function ExerciseProgressionPanel({
  view,
  range,
  rangeHrefExtra = "",
}: {
  view: ExerciseProgressionView;
  range: ProgressionRange;
  rangeHrefExtra?: string;
}) {
  const { exercise, kpis, points, granularity } = view;
  const { unit } = exercise;

  return (
    <div>
      {/* Range switcher — loader-driven via ?zakres= */}
      <div
        className="row"
        style={{ gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}
      >
        <span
          className="text-xs muted"
          style={{ textTransform: "uppercase", letterSpacing: ".04em" }}
        >
          Okres
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {RANGE_LABELS.map((r) => {
            const active = r.value === range;
            return (
              <Link
                key={r.value}
                to={`?zakres=${r.value}${rangeHrefExtra}`}
                preventScrollReset
                className="btn btn-sm"
                aria-pressed={active}
                style={
                  active
                    ? {
                        background: "var(--accent-soft)",
                        color: "var(--accent-ink)",
                        borderColor: "transparent",
                        fontWeight: 600,
                        textDecoration: "none",
                      }
                    : { textDecoration: "none" }
                }
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* KPI strip */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <KpiTile label="Rekord (PR)">
          <div className="stat-num">{fmtByUnit(kpis.pr, unit)}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            {fmtDate(kpis.prAchievedOn)}
          </div>
        </KpiTile>

        <KpiTile label="Ostatnia sesja">
          <div className="stat-num">{fmtByUnit(kpis.lastBest, unit)}</div>
          <div style={{ marginTop: 6 }}>
            <Delta delta={kpis.lastDelta} />
          </div>
        </KpiTile>

        <KpiTile label="Zmiana w okresie">
          <div
            className="stat-num"
            style={{
              color:
                kpis.periodChangePct == null
                  ? "var(--ink)"
                  : kpis.periodChangePct > 0
                    ? "var(--ok)"
                    : kpis.periodChangePct < 0
                      ? "var(--danger)"
                      : "var(--ink)",
            }}
          >
            {kpis.periodChangePct == null
              ? "—"
              : `${kpis.periodChangePct > 0 ? "+" : ""}${kpis.periodChangePct}%`}
          </div>
        </KpiTile>

        <KpiTile label="Sesje w okresie">
          <div className="stat-num">{kpis.sessionsInRange}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            śr. RPE {kpis.avgRpeInRange ?? "—"}
          </div>
        </KpiTile>
      </div>

      {/* Hero chart */}
      <section style={{ marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 4, gap: 8 }}>
            <h2 style={{ fontSize: 16 }}>Rekord w czasie</h2>
            {granularity === "week" && <span className="text-xs muted">ujęcie tygodniowe</span>}
          </div>
          <div className="text-xs muted" style={{ marginBottom: 12 }}>
            Najlepsza seria każdej sesji.
          </div>
          <ProgressionLineChart points={points} unit={unit} />
        </div>
      </section>

      {/* Volume */}
      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 2 }}>Łączna praca w sesji</h2>
        <div className="text-xs muted" style={{ marginBottom: 12 }}>
          Suma powtórzeń ze wszystkich serii.
        </div>
        <VolumeBars points={points} />
      </div>
    </div>
  );
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card stat" style={{ padding: 16 }}>
      <div className="k">{label}</div>
      {children}
    </div>
  );
}

/** Colored ▲/▼ delta vs the previous session; "—" when 0 or null. */
function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="text-xs muted">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className="mono"
      style={{ fontSize: 13, fontWeight: 600, color: up ? "var(--ok)" : "var(--danger)" }}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {delta}
    </span>
  );
}
```

- [ ] **Step 2: Format + typecheck + lint**

Run: `npx biome format --write app/components/exercise-progression-panel.tsx`
Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 3: Komponent `ProgressionList` (frontend-design)

Wyodrębniona, role-agnostyczna lista progresji + tryb porównania. Linki i tytuł
wstrzykiwane przez propsy. Bez chipu „część umiejętności" (warianty nie trafiają na
listę — są w drzewie).

**Files:**
- Create: `app/components/progression-list.tsx`

> **UI → `frontend-design:frontend-design`.** Idiom 1:1 z dzisiejszą listą Progresji.

- [ ] **Step 1: Utwórz `app/components/progression-list.tsx`:**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import {
  ProgressionStatusBadge,
  StatusSummaryBar,
  sparkStrokeForStatus,
} from "~/components/progression-charts";
import { Sparkline } from "~/components/stat-widgets";
import { daysAgo, fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import type { ListControlsSpec, ListControlsState } from "~/lib/list-params";
import type { ProgressionListRow } from "~/lib/progression-math";
import { unitLabelPl } from "~/lib/progression-math";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

type Summary = React.ComponentProps<typeof StatusSummaryBar>["summary"];

/**
 * Lista progresji ćwiczeń + opcjonalny tryb porównania. Czysta prezentacja:
 * trasa-rodzic przekazuje już posortowane/odfiltrowane wiersze, podsumowanie,
 * spec/state kontrolek oraz buildery linków (rola-zależne).
 */
export function ProgressionList({
  title,
  rows,
  summary,
  spec,
  controls,
  hrefForExercise,
  buildCompareHref,
}: {
  title: string;
  rows: ProgressionListRow[];
  summary: Summary;
  spec: ListControlsSpec;
  controls: ListControlsState;
  hrefForExercise: (exerciseId: string) => string;
  buildCompareHref: (selectedIds: string[]) => string;
}) {
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function exitCompare() {
    setCompare(false);
    setSelected([]);
  }

  return (
    <div>
      <div className="row between" style={{ alignItems: "center", margin: "10px 0 12px", gap: 8 }}>
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        <div className="row" style={{ gap: 8 }}>
          {compare ? (
            <>
              <button type="button" className="btn btn-sm" onClick={exitCompare}>
                Anuluj
              </button>
              {selected.length < 2 ? (
                <button type="button" className="btn btn-sm btn-primary" disabled>
                  Porównaj{selected.length > 0 ? ` (${selected.length})` : ""}
                </button>
              ) : (
                <Link to={buildCompareHref(selected)} className="btn btn-sm btn-primary">
                  Porównaj ({selected.length})
                </Link>
              )}
            </>
          ) : (
            rows.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => setCompare(true)}>
                <Icons.Trend />
                Porównaj
              </button>
            )
          )}
        </div>
      </div>

      <StatusSummaryBar summary={summary} />
      <ListControls spec={spec} state={controls} />

      {compare && (
        <div className="text-xs muted" style={{ marginBottom: 12 }}>
          Zaznacz co najmniej 2 ćwiczenia, aby je porównać.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <h3>Brak ćwiczeń poza umiejętnościami</h3>
          <div>Tu pojawią się ćwiczenia z logów, które nie są wariantem umiejętności.</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {rows.map((row) => {
            const subtitle = `${row.sessionCount} ${pluralizePl(
              row.sessionCount,
              SESJA,
            )} · ostatnio: ${daysAgo(row.lastPerformedOn)} (${fmtDate(row.lastPerformedOn)})`;
            const prText = `${row.pr}${row.unit === "SEC" ? " s" : ""}`;
            const isSelected = selected.includes(row.exerciseId);

            const inner = (
              <>
                <div className="row" style={{ gap: 10, minWidth: 0, flex: 1 }}>
                  {compare && (
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
                        border: `2px solid ${isSelected ? "var(--accent)" : "var(--line-2)"}`,
                        background: isSelected ? "var(--accent)" : "transparent",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent-ink)",
                      }}
                    >
                      {isSelected && <Icons.Check />}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{row.name}</span>
                      <span className="badge">{unitLabelPl(row.unit)}</span>
                    </div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {subtitle}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 14, alignItems: "center" }}>
                  <Sparkline
                    values={row.sparkline}
                    width={96}
                    height={30}
                    stroke={sparkStrokeForStatus(row.status)}
                    fill="transparent"
                  />
                  <ProgressionStatusBadge status={row.status} />
                  <div style={{ textAlign: "right", minWidth: 56 }} title="Rekord osobisty">
                    <div className="text-xs muted">rekord</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                      {prText}
                    </div>
                  </div>
                </div>
              </>
            );

            return compare ? (
              <button
                key={row.exerciseId}
                type="button"
                onClick={() => toggleSelected(row.exerciseId)}
                aria-pressed={isSelected}
                className="card card-hover row between"
                style={{
                  gap: 14,
                  padding: "12px 16px",
                  flexWrap: "wrap",
                  width: "100%",
                  textAlign: "left",
                  background: isSelected ? "var(--accent-soft)" : undefined,
                  borderColor: isSelected ? "transparent" : undefined,
                }}
              >
                {inner}
              </button>
            ) : (
              <Link
                key={row.exerciseId}
                to={hrefForExercise(row.exerciseId)}
                className="card card-hover row between"
                style={{
                  gap: 14,
                  padding: "12px 16px",
                  flexWrap: "wrap",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Format + typecheck + lint**

Run: `npx biome format --write app/components/progression-list.tsx`
Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto. (Jeśli typ `Summary` przez `React.ComponentProps` nie zadziała,
zaimportuj jawny typ podsumowania z `~/lib/progression-math` — `summarizeStatuses`
zwraca go; dopasuj nazwę typu do realnego eksportu.)

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 4: Podopieczny — landing `rozwoj._index.tsx`

**Files:**
- Create: `app/routes/podopieczny/rozwoj._index.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: Utwórz trasę:**

```tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ProgressionList } from "~/components/progression-list";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { listProgressionExercises } from "~/lib/progression";
import {
  excludeByExerciseId,
  sortProgressionRows,
  summarizeStatuses,
} from "~/lib/progression-math";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import { listExerciseSkillMap } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const url = new URL(args.request.url);

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(db, user.trainerId, user.id),
    listProgressionExercises(db, user.id),
    listExerciseSkillMap(db, user.trainerId),
  ]);

  // Ćwiczenia będące wariantem dowolnej umiejętności — wyłączone z listy (żyją w drzewie).
  const variantIds = new Set(skillMap.map((s) => s.exerciseId));
  const rows = excludeByExerciseId(allRows, variantIds);
  const summary = summarizeStatuses(rows);

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  const tagOptions = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "recent", label: "Ostatnio trenowane" },
      { key: "attention", label: "Wymaga uwagi" },
    ],
    defaultSort: "recent",
    filterGroups: [
      {
        param: "tag",
        label: "Kategoria",
        options: [
          { value: "all", label: "Wszystkie" },
          ...tagOptions.map((t) => ({ value: t, label: t })),
        ],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);
  const tag = controls.filters.tag ?? "all";
  const filtered = tag === "all" ? rows : rows.filter((r) => r.tags.includes(tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { tree, rows: visible, summary, spec, controls };
}

export default function PodopiecznyRozwoj() {
  const { tree, rows, summary, spec, controls } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Rozwój</h1>
          <div className="sub">Twoje drzewo umiejętności i postęp w ćwiczeniach.</div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/podopieczny/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title="Pozostałe ćwiczenia"
          rows={rows}
          summary={summary}
          spec={spec}
          controls={controls}
          hrefForExercise={(id) => `/podopieczny/rozwoj/cwiczenie/${id}`}
          buildCompareHref={(ids) => `/podopieczny/rozwoj/porownanie?ex=${ids.join(",")}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Zarejestruj trasę w `app/routes.ts`** — w bloku `podopieczny` (patrz Task 8, gdzie rejestrujemy cały komplet `rozwoj*`). Tu tylko utwórz plik; rejestracja w Task 8.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto. (Pełny build po rejestracji tras — Task 8.)

- [ ] **Step 4: Review per task** — `/code-review`. Bez commita.

---

## Task 5: Podopieczny — szczegół węzła `rozwoj.umiejetnosc.$skillId.tsx`

Wspólny ekran: drabina wariantów + `ExerciseProgressionPanel` bieżącego wariantu.
Read-only.

**Files:**
- Create: `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: Utwórz trasę:**

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { VariationLadder } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";
import { getSkillMapForTrainee } from "~/lib/skill-progression";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const skillId = args.params.skillId ?? "";
  const map = await getSkillMapForTrainee(db, user.trainerId, user.id, { withSuggestions: false });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view =
    entry.currentHasLogs && entry.currentExerciseId
      ? await getExerciseProgression(db, user.id, entry.currentExerciseId, range)
      : null;

  return { entry, view, range };
}

export default function PodopiecznyRozwojWezel() {
  const { entry, view, range } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/rozwoj">Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{entry.skillName}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>{entry.skillName}</h1>
          <div className="sub">Twoja pozycja na drabinie i wyniki bieżącego wariantu.</div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <VariationLadder variations={entry.variations} />
        {entry.lastAdvancedOn && (
          <div className="text-xs muted" style={{ marginTop: 10 }}>
            Ostatni awans: {fmtDate(entry.lastAdvancedOn)}
          </div>
        )}
      </div>

      {view ? (
        <ExerciseProgressionPanel view={view} range={range} />
      ) : (
        <div className="card" style={{ padding: 18 }}>
          <div className="muted text-sm">
            {entry.currentVariationId
              ? "Brak danych — zaloguj trening na tym wariancie, aby zobaczyć wyniki w czasie."
              : "Trener nie ustawił jeszcze Twojego poziomu na tej umiejętności."}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 6: Podopieczny — szczegół ćwiczenia `rozwoj.cwiczenie.$exerciseId.tsx`

Relokacja dzisiejszego `progresja.$exerciseId.tsx`, z użyciem `ExerciseProgressionPanel`.

**Files:**
- Create: `app/routes/podopieczny/rozwoj.cwiczenie.$exerciseId.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: Utwórz trasę:**

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
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
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view = await getExerciseProgression(db, user.id, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { view, range };
}

export default function PodopiecznyRozwojCwiczenie() {
  const { view, range } = useLoaderData<typeof loader>();
  const { exercise } = view;
  const { unit } = exercise;
  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/rozwoj">Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny · Rozwój
          </div>
          <h1 className="row" style={{ gap: 10, alignItems: "center" }}>
            {exercise.name}
            <span className={`badge ${unit === "REPS" ? "reps" : "sec"}`}>{unit}</span>
          </h1>
          <div className="sub">Najlepsza seria, objętość i wysiłek w czasie.</div>
        </div>
      </div>

      <ExerciseProgressionPanel view={view} range={range} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 7: Podopieczny — porównanie `rozwoj.porownanie.tsx`

Relokacja `progresja.porownanie.tsx` — identyczna logika, podmienione tylko ścieżki
linków (`/podopieczny/progresja` → `/podopieczny/rozwoj`).

**Files:**
- Create: `app/routes/podopieczny/rozwoj.porownanie.tsx`

- [ ] **Step 1: Skopiuj zawartość** `app/routes/podopieczny/progresja.porownanie.tsx` do nowego pliku, po czym wykonaj **dokładnie te podmiany** (5 wystąpień):
  - `<Link to="/podopieczny/progresja">Progresja</Link>` → `<Link to="/podopieczny/rozwoj">Rozwój</Link>` (3×: dwa w crumbs + jeden w przycisku „Wróć…").
  - Tekst przycisku `Wróć do Progresji` → `Wróć do Rozwoju`.
  - W komunikacie „Wybierz co najmniej 2 ćwiczenia na liście **Progresji**…" → „…na liście **Rozwoju**…".
  - Eyebrow `Podopieczny · Progresja` → `Podopieczny · Rozwój`.
  - Nazwa funkcji komponentu `TraineeProgresjaPorownanie` → `PodopiecznyRozwojPorownanie`.

Reszta (loader, `?ex=`/`?zakres=`, wykres, tabelka, pominięte) **bez zmian**.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 8: Podopieczny — redirecty starych tras + rejestracja w `routes.ts`

**Files:**
- Modify: `app/routes/podopieczny/progresja._index.tsx` (→ shim)
- Modify: `app/routes/podopieczny/progresja.$exerciseId.tsx` (→ shim)
- Modify: `app/routes/podopieczny/progresja.porownanie.tsx` (→ shim)
- Modify: `app/routes/podopieczny/umiejetnosci.tsx` (→ shim)
- Modify: `app/routes/podopieczny/umiejetnosci.$skillId.tsx` (→ shim)
- Modify: `app/routes.ts`

- [ ] **Step 1: Zastąp CAŁĄ zawartość** `progresja._index.tsx`:

```tsx
import { redirect } from "react-router";

export async function loader() {
  return redirect("/podopieczny/rozwoj");
}
```

- [ ] **Step 2: Zastąp CAŁĄ zawartość** `progresja.$exerciseId.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/podopieczny/rozwoj/cwiczenie/${params.exerciseId ?? ""}${url.search}`);
}
```

- [ ] **Step 3: Zastąp CAŁĄ zawartość** `progresja.porownanie.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/podopieczny/rozwoj/porownanie${url.search}`);
}
```

- [ ] **Step 4: Zastąp CAŁĄ zawartość** `umiejetnosci.tsx`:

```tsx
import { redirect } from "react-router";

export async function loader() {
  return redirect("/podopieczny/rozwoj");
}
```

- [ ] **Step 5: Zastąp CAŁĄ zawartość** `umiejetnosci.$skillId.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/podopieczny/rozwoj/umiejetnosc/${params.skillId ?? ""}`);
}
```

- [ ] **Step 6: W `app/routes.ts`** — w bloku `podopieczny` (layout), **dodaj** nowe
trasy tuż przed istniejącą linią `route("progresja", …)`:

```ts
      route("rozwoj", "routes/podopieczny/rozwoj._index.tsx"),
      route("rozwoj/umiejetnosc/:skillId", "routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx"),
      route("rozwoj/cwiczenie/:exerciseId", "routes/podopieczny/rozwoj.cwiczenie.$exerciseId.tsx"),
      route("rozwoj/porownanie", "routes/podopieczny/rozwoj.porownanie.tsx"),
```

Pozostaw istniejące wpisy `progresja`, `progresja/:exerciseId`, `progresja/porownanie`,
`umiejetnosci`, `umiejetnosci/:skillId` bez zmian — teraz wskazują pliki-shimy (redirecty).

- [ ] **Step 7: Typecheck + lint + build** (build wyłapie błędy rejestracji tras)

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 8: Weryfikacja wizualna** (jeśli stack działa):

Run: `npm run shots -- /podopieczny/rozwoj`
Expected: drzewo + lista „Pozostałe ćwiczenia" czytelne (desktop+mobile). Jeśli stack
nie działa — zgłoś do ręcznej weryfikacji w handoffie.

- [ ] **Step 9: Review per task** — `/code-review`. Bez commita.

---

## Task 9: Trener — landing `podopieczni.$traineeId.rozwoj._index.tsx`

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: Utwórz trasę:**

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ProgressionList } from "~/components/progression-list";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { findTraineeOfTrainer, listProgressionExercises } from "~/lib/progression";
import {
  excludeByExerciseId,
  sortProgressionRows,
  summarizeStatuses,
} from "~/lib/progression-math";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import { listExerciseSkillMap } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const url = new URL(args.request.url);

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(db, user.id, traineeId),
    listProgressionExercises(db, traineeId),
    listExerciseSkillMap(db, user.id),
  ]);

  const variantIds = new Set(skillMap.map((s) => s.exerciseId));
  const rows = excludeByExerciseId(allRows, variantIds);
  const summary = summarizeStatuses(rows);

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  const tagOptions = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "recent", label: "Ostatnio trenowane" },
      { key: "attention", label: "Wymaga uwagi" },
    ],
    defaultSort: "attention",
    filterGroups: [
      {
        param: "tag",
        label: "Kategoria",
        options: [
          { value: "all", label: "Wszystkie" },
          ...tagOptions.map((t) => ({ value: t, label: t })),
        ],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);
  const tag = controls.filters.tag ?? "all";
  const filtered = tag === "all" ? rows : rows.filter((r) => r.tags.includes(tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { trainee, tree, rows: visible, summary, spec, controls };
}

export default function TrenerRozwoj() {
  const { trainee, tree, rows, summary, spec, controls } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Rozwój</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Rozwój</h1>
          <div className="sub">Drzewo umiejętności i postęp w ćwiczeniach. Klik węzeł, by zarządzać poziomem.</div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/trener/podopieczni/${trainee.id}/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title="Pozostałe ćwiczenia"
          rows={rows}
          summary={summary}
          spec={spec}
          controls={controls}
          hrefForExercise={(id) => `/trener/podopieczni/${trainee.id}/rozwoj/cwiczenie/${id}`}
          buildCompareHref={(ids) =>
            `/trener/podopieczni/${trainee.id}/rozwoj/porownanie?ex=${ids.join(",")}`
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint** (rejestracja tras w Task 13)

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 10: Trener — szczegół węzła `…rozwoj.umiejetnosc.$skillId.tsx` (drabina + panel + akcje)

Łączy dzisiejszy drill-in trenera (akcje awans/start + historia) z osadzonym
`ExerciseProgressionPanel` bieżącego wariantu.

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: Utwórz trasę:**

```tsx
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { Icons } from "~/components/icons";
import { VariationLadder } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { findTraineeOfTrainer, getExerciseProgression, todayIso } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";
import {
  getSkillMapForTrainee,
  recordAdvancement,
  setStartingLevel,
} from "~/lib/skill-progression";
import { SkillError } from "~/lib/skills";
import { AdvancementFormSchema } from "~/lib/skill-types";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const skillId = args.params.skillId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const map = await getSkillMapForTrainee(db, user.id, traineeId, { withSuggestions: true });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view =
    entry.currentHasLogs && entry.currentExerciseId
      ? await getExerciseProgression(db, traineeId, entry.currentExerciseId, range)
      : null;

  return { trainee, entry, view, range, today: todayIso() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const skillId = args.params.skillId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent !== "advance" && intent !== "set-start") return null;

  const parsed = AdvancementFormSchema.safeParse({
    toVariationId: String(fd.get("toVariationId") ?? ""),
    advancedOn: String(fd.get("advancedOn") ?? ""),
    note: fd.get("note") ? String(fd.get("note")) : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  const { toVariationId, advancedOn, note } = parsed.data;
  try {
    if (intent === "set-start") {
      await setStartingLevel(db, user.id, traineeId, skillId, toVariationId, advancedOn, note ?? null);
    } else {
      await recordAdvancement(db, user.id, traineeId, skillId, toVariationId, advancedOn, note ?? null);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerRozwojWezel() {
  const { trainee, entry, view, range, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const intent = entry.currentVariationId ? "advance" : "set-start";
  const submitLabel = entry.currentVariationId ? "Zapisz zmianę" : "Ustaw poziom";
  const selectLabel = entry.currentVariationId ? "Zmień na" : "Poziom startowy";

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/rozwoj`}>Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{entry.skillName}</span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="text-xs muted" style={{ marginBottom: 4 }}>
          {trainee.displayName}
        </div>
        <h1 style={{ margin: "0 0 4px" }}>{entry.skillName}</h1>
        <div className="text-sm muted">Drabina wariantów, awanse i wyniki bieżącego wariantu.</div>
      </div>

      {actionData != null && "error" in actionData && actionData.error != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
          {actionData.error}
        </p>
      )}

      {entry.suggestion === "advance" && (
        <span
          className="badge active"
          style={{ marginBottom: 12, display: "inline-flex", gap: 4, alignItems: "center" }}
        >
          <Icons.Trend /> rozważ awans
        </span>
      )}
      {entry.suggestion === "regress" && (
        <span
          className="badge"
          style={{ color: "var(--danger)", marginBottom: 12, display: "inline-block" }}
        >
          rozważ cofnięcie
        </span>
      )}

      <div style={{ marginBottom: 12 }}>
        <VariationLadder variations={entry.variations} />
      </div>

      {entry.lastAdvancedOn && (
        <div className="text-xs muted" style={{ marginBottom: 16 }}>
          Ostatni awans: {fmtDate(entry.lastAdvancedOn)}
        </div>
      )}

      {entry.variations.length > 0 && (
        <Form
          method="post"
          className="card"
          style={{ padding: 16, display: "grid", gap: 12, marginBottom: 22 }}
        >
          <input type="hidden" name="intent" value={intent} />

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">{selectLabel}</span>
            <select name="toVariationId" className="input" required defaultValue="">
              <option value="" disabled>
                Wybierz wariant…
              </option>
              {entry.variations.map((v) => (
                <option key={v.id} value={v.id} disabled={v.isCurrent}>
                  {v.ordinal}. {v.exerciseName}
                </option>
              ))}
            </select>
          </label>

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">Data</span>
            <input type="date" name="advancedOn" className="input" defaultValue={today} required />
          </label>

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">Notatka</span>
            <input
              type="text"
              name="note"
              className="input"
              maxLength={2000}
              placeholder="np. czysto 3×5×20 s"
            />
          </label>

          <button type="submit" className="btn btn-primary">
            {submitLabel}
          </button>
        </Form>
      )}

      {view ? (
        <ExerciseProgressionPanel view={view} range={range} />
      ) : (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="muted text-sm">
            {entry.currentVariationId
              ? "Brak danych — podopieczny nie zalogował jeszcze treningu na bieżącym wariancie."
              : "Ustaw poziom startowy, aby śledzić wyniki w czasie."}
          </div>
        </div>
      )}

      {entry.history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="text-sm" style={{ cursor: "pointer", marginBottom: 8 }}>
            Historia awansów ({entry.history.length})
          </summary>
          <ul className="text-xs muted" style={{ margin: 0, paddingLeft: 16 }}>
            {entry.history.map((h, i) => (
              <li key={`${h.advancedOn}-${i}`}>
                {fmtDate(h.advancedOn)} — {h.fromVariationId ? "awans" : "poziom startowy"}
                {h.note ? ` · „${h.note}"` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 11: Trener — szczegół ćwiczenia `…rozwoj.cwiczenie.$exerciseId.tsx`

Relokacja `…progresja.$exerciseId.tsx` z użyciem `ExerciseProgressionPanel`.

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx`

> **UI → `frontend-design:frontend-design`.** Wzór: trasa z Task 6, ale z guardem trenera i crumbs.

- [ ] **Step 1: Utwórz trasę:**

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
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
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view = await getExerciseProgression(db, traineeId, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { trainee, view, range };
}

export default function TrenerRozwojCwiczenie() {
  const { trainee, view, range } = useLoaderData<typeof loader>();
  const { exercise } = view;
  const { unit } = exercise;
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/rozwoj`}>Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName} · Rozwój
          </div>
          <h1 className="row" style={{ gap: 10, alignItems: "center" }}>
            {exercise.name}
            <span className={`badge ${unit === "REPS" ? "reps" : "sec"}`}>{unit}</span>
          </h1>
          <div className="sub">Najlepsza seria, objętość i wysiłek w czasie.</div>
        </div>
      </div>

      <ExerciseProgressionPanel view={view} range={range} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 12: Trener — porównanie `…rozwoj.porownanie.tsx`

Relokacja `…progresja.porownanie.tsx` z podmianą ścieżek.

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.rozwoj.porownanie.tsx`

- [ ] **Step 1: Skopiuj zawartość** `app/routes/trener/podopieczni.$traineeId.progresja.porownanie.tsx` do nowego pliku i wykonaj podmiany:
  - Wszystkie ścieżki `…/progresja…` w linkach (crumbs, „Wróć…", przełącznik zakresu) → `…/rozwoj…`. W szczególności bazowy segment `progresja/porownanie` → `rozwoj/porownanie`, a powroty na listę `…/progresja` → `…/rozwoj`.
  - Etykiety „Progresja" widoczne dla użytkownika (crumbs/eyebrow/„Wróć do Progresji") → „Rozwój".
  - Nazwa funkcji komponentu → `TrenerRozwojPorownanie`.

Loader, tenant-scope (`findTraineeOfTrainer`), `?ex=`/`?zakres=`, wykres/tabelka/pominięte — **bez zmian logiki**.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 13: Trener — redirecty starych tras + rejestracja w `routes.ts`

**Files:**
- Modify: `…progresja._index.tsx`, `…progresja.$exerciseId.tsx`, `…progresja.porownanie.tsx`, `…umiejetnosci.tsx`, `…umiejetnosci.$skillId.tsx` (→ shimy)
- Modify: `app/routes.ts`

- [ ] **Step 1: Zastąp CAŁĄ zawartość** `podopieczni.$traineeId.progresja._index.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/trener/podopieczni/${params.traineeId ?? ""}/rozwoj`);
}
```

- [ ] **Step 2: Zastąp CAŁĄ zawartość** `podopieczni.$traineeId.progresja.$exerciseId.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(
    `/trener/podopieczni/${params.traineeId ?? ""}/rozwoj/cwiczenie/${params.exerciseId ?? ""}${url.search}`,
  );
}
```

- [ ] **Step 3: Zastąp CAŁĄ zawartość** `podopieczni.$traineeId.progresja.porownanie.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/trener/podopieczni/${params.traineeId ?? ""}/rozwoj/porownanie${url.search}`);
}
```

- [ ] **Step 4: Zastąp CAŁĄ zawartość** `podopieczni.$traineeId.umiejetnosci.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/trener/podopieczni/${params.traineeId ?? ""}/rozwoj`);
}
```

- [ ] **Step 5: Zastąp CAŁĄ zawartość** `podopieczni.$traineeId.umiejetnosci.$skillId.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";

export async function loader({ params }: LoaderFunctionArgs) {
  return redirect(
    `/trener/podopieczni/${params.traineeId ?? ""}/rozwoj/umiejetnosc/${params.skillId ?? ""}`,
  );
}
```

- [ ] **Step 6: W `app/routes.ts`** — w bloku `trener` (layout), **dodaj** nowe trasy
tuż przed istniejącą linią `route("podopieczni/:traineeId/progresja", …)`:

```ts
      route(
        "podopieczni/:traineeId/rozwoj",
        "routes/trener/podopieczni.$traineeId.rozwoj._index.tsx",
      ),
      route(
        "podopieczni/:traineeId/rozwoj/umiejetnosc/:skillId",
        "routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx",
      ),
      route(
        "podopieczni/:traineeId/rozwoj/cwiczenie/:exerciseId",
        "routes/trener/podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx",
      ),
      route(
        "podopieczni/:traineeId/rozwoj/porownanie",
        "routes/trener/podopieczni.$traineeId.rozwoj.porownanie.tsx",
      ),
```

Pozostaw istniejące wpisy `…/progresja`, `…/progresja/:exerciseId`,
`…/progresja/porownanie`, `…/umiejetnosci`, `…/umiejetnosci/:skillId` — teraz to shimy.

- [ ] **Step 7: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 8: Weryfikacja wizualna** (jeśli stack działa):

Run: `npm run shots -- /trener/podopieczni`
Expected: brak regresji; (ręcznie sprawdź `…/rozwoj` na realnym traineeId, bo shots
nie zna ID). Jeśli stack nie działa — zgłoś do ręcznej weryfikacji.

- [ ] **Step 9: Review per task** — `/code-review`. Bez commita.

---

## Task 14: Nawigacja — „Progresja"+„Umiejętności" → „Rozwój"

**Files:**
- Modify: `app/routes/podopieczny/_layout.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx`

> **UI → `frontend-design:frontend-design`.**

- [ ] **Step 1: W `app/routes/podopieczny/_layout.tsx`** — w tablicy `NAV_ITEMS`
zastąp **dwa** wpisy (`/podopieczny/progresja` „Progresja" oraz
`/podopieczny/umiejetnosci` „Umiejętności") **jednym**:

```ts
  {
    to: "/podopieczny/rozwoj",
    label: "Rozwój",
    end: false,
    icon: "Trend" as const,
    tailKey: null,
  },
```

(Wstaw w miejsce pierwszego z usuwanych, zachowując kolejność po „Statystyki".)

- [ ] **Step 2: W `app/routes/trener/podopieczni.$traineeId.tsx`** — w `pagehead`
zastąp **dwa** linki-przyciski (Progresja + Umiejętności) **jednym**:

```tsx
          <Link to={`/trener/podopieczni/${trainee.id}/rozwoj`} className="btn">
            <Icons.Trend /> Rozwój
          </Link>
```

(Usuń linki `…/progresja` i `…/umiejetnosci`; wstaw powyższy w ich miejsce, między
„Statystyki" a „Sylwetka".)

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 4: Review per task** — `/code-review`. Bez commita.

---

## Task 15: Czyszczenie martwych cross-linków (opcjonalny ogon)

Po przebudowie listy (warianty wykluczone) chip „część umiejętności" zniknął — ale
w bazie mogą zostać inne linki do starych ścieżek. To zadanie tylko **weryfikuje**.

**Files:**
- Sprawdź (Grep): `app/routes/**`, `app/components/**`

- [ ] **Step 1: Wyszukaj pozostałe twarde linki** do starych ścieżek (mają już działać
przez redirecty, ale lepiej wskazać wprost na nowe):

Grep (narzędzie Grep, nie bash): wzorzec `/(progresja|umiejetnosci)\b` w `app/`.
Dla każdego trafienia **spoza** plików-shimów i tras autoringu trenera
(`trener/umiejetnosci*` — te zostają!) podmień na odpowiednik `…/rozwoj…`.
Typowe miejsca: pulpit podopiecznego (`podopieczny/_index.tsx`), pulpit trenera,
banery. Jeśli brak trafień poza shimami/autoringiem — nic nie rób.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 16: Testy integracyjne (PISZ, nie uruchamiaj — Docker u właściciela)

**Files:**
- Create: `tests/rozwoj.itest.ts`

> Wzoruj się na `tests/progression-tenant-scope.itest.ts` i innych `tests/*.itest.ts`
> (testcontainers, setup migracji, helpery tworzenia trenera/podopiecznego/logów/umiejętności).
> **NIE uruchamiaj** — zgłoś w handoffie.

- [ ] **Step 1: Napisz testy** pokrywające:
  - **Tenant-scope:** trener A → 404 na `/trener/podopieczni/:bId/rozwoj`,
    `…/rozwoj/umiejetnosc/:skillId`, `…/rozwoj/cwiczenie/:exId`, `…/rozwoj/porownanie`
    podopiecznego trenera B.
  - **Redirecty (301) z zachowaniem query:**
    - `/podopieczny/progresja` → `/podopieczny/rozwoj`;
    - `/podopieczny/progresja/:id?zakres=6m` → `/podopieczny/rozwoj/cwiczenie/:id?zakres=6m`;
    - `/podopieczny/progresja/porownanie?ex=a,b` → `/podopieczny/rozwoj/porownanie?ex=a,b`;
    - `/podopieczny/umiejetnosci` → `/podopieczny/rozwoj`;
    - `/podopieczny/umiejetnosci/:skillId` → `/podopieczny/rozwoj/umiejetnosc/:skillId`;
    - analogiczne mirrory trenera `/trener/podopieczni/:tid/...`.
  - **Read-only podopiecznego:** POST na `/podopieczny/rozwoj/umiejetnosc/:skillId`
    (próba awansu) → 404/405 (brak `action`).
  - **Lista „Pozostałe":** loader `…/rozwoj` zwraca w `rows` ćwiczenia z logami, ale
    **bez** tych będących wariantem umiejętności; po dodaniu ćwiczenia jako wariantu
    znika ono z listy, a pojawia się jako węzeł w `tree`.
  - **Szczegół węzła z wykresem:** dla przypisanego wariantu z logami loader zwraca
    `view != null` (KPI/punkty); bez logów `view == null`.

- [ ] **Step 2: Typecheck** (kompilacja testów)

Run: `npm run typecheck`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. **Zaznacz: testy integracyjne do uruchomienia przez właściciela.**

---

## Task 17: Dokumentacja

**Files (modyfikacja):**
- `app/components/README.md` — dopisz `exercise-progression-panel.tsx`, `progression-list.tsx`.
- `app/lib/README.md` — dopisz `excludeByExerciseId` w opisie `progression-math.ts`.
- `app/routes/podopieczny/README.md` — `progresja*`/`umiejetnosci*` → `rozwoj*` (+ redirecty).
- `app/routes/trener/README.md` — per-podopieczny `rozwoj*`; zaznacz, że top-level `umiejetnosci*` (autoring) **zostaje**.
- `app/routes/README.md` — jeśli zmienia się opis sekcji.
- `CLAUDE.md` — jeśli wymieniono pozycje nawigacji „Progresja"/„Umiejętności" → „Rozwój".
- `docs/innovate.md` — notka: konsolidacja widoków „Progresja"+„Umiejętności" w „Rozwój" (kierunek A), z linkiem do spec/plan.

- [ ] **Step 1: Zaktualizuj powyższe README** zgodnie z faktycznym stanem (zwięźle, faktycznie).
- [ ] **Step 2: Review per task** — `/code-review` (lub przegląd treści). Bez commita.

---

## Task 18: Bramki końcowe + handoff

- [ ] **Step 1: Pełne bramki** (wszystkie zielone):

Run: `npx vitest run` (lub `npm run test:unit`) — jednostkowe zielone (w tym nowy `excludeByExerciseId`)
Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: wszystko zielone (dowód — `superpowers:verification-before-completion`).

- [ ] **Step 2: `/code-review`** na pełnym diffie.
- [ ] **Step 3: `/security-review`** — zmiana dotyka tenant-scope/autoryzacji na nowych trasach `/rozwoj*` (per-podopieczny graf + szereg czasowy).
- [ ] **Step 4: Handoff** (granica gita — NIE commituj). Wypisz:
  - podsumowanie + lista zmienionych/utworzonych plików,
  - **proponowany komunikat commita** (tekst),
  - **migracja:** brak (schemat bez zmian),
  - **testy do uruchomienia pod Dockerem:** `npm run test:itest` (w tym nowy `tests/rozwoj.itest.ts`),
  - **ręczna weryfikacja:** `/podopieczny/rozwoj` (drzewo + lista + klik węzła → drabina+wykres; klik wiersza → szczegół ćwiczenia; tryb porównania); `/trener/podopieczni/:id/rozwoj` (jw. + awans/cofnięcie w węźle); stare URL-e (`/podopieczny/progresja`, `…/progresja/:id?zakres=6m`, `…/progresja/porownanie?ex=…`, `…/umiejetnosci`, `…/umiejetnosci/:id`) i mirrory trenera → 301 na `…/rozwoj…`; menu pokazuje „Rozwój" zamiast dwóch pozycji; trenerski autoring „Umiejętności" działa bez zmian; `npm run shots` na obu trasach (desktop+mobile),
  - brak nowych env/zależności.

---

## Self-review planu

- **Pokrycie spec:** §1 zakres→T1–T14 + rozgraniczenie autoringu (T13/T17 — `trener/umiejetnosci*` nietknięte); §4.1 landing→T4/T9; §4.2 węzeł→T5/T10; §4.3 ćwiczenie→T6/T11; §4.4 porównanie→T7/T12; §5 trasy+redirecty→T8/T13; §6 logika reuse + filtr→T1 (helper), loadery T4/T9; §7 nawigacja→T14, mobile/shots→T8/T13; §8 tenant-scope/read-only→T5/T10/T16; §9 testy→T1 (unit) + T16 (itest); §10 docs→T17; §12 kryteria→T18 bramki. ✅ brak luk.
- **Bez zmian w schemacie:** potwierdzone — żaden task nie dotyka `schema.ts`/`migrations/`; `db:generate` nie występuje.
- **Typy spójne:** `ExerciseProgressionView`/`ProgressionRange`/`ProgressionListRow` (z `~/lib/progression` i `~/lib/progression-math`), `SkillMapEntry` (z `~/lib/skill-progression`), `ListControlsSpec`/`ListControlsState` (z `~/lib/list-params`); `excludeByExerciseId(rows, Set)` użyte spójnie w T1/T4/T9; `ExerciseProgressionPanel({view, range, rangeHrefExtra?})` i `ProgressionList({title, rows, summary, spec, controls, hrefForExercise, buildCompareHref})` użyte spójnie w T4–T11.
- **Reuse istniejących funkcji:** `getSkillTreeForTrainee`, `getSkillMapForTrainee`, `getExerciseProgression`, `getProgressionComparison`, `listProgressionExercises`, `listExerciseSkillMap`, `findTraineeOfTrainer`, `recordAdvancement`/`setStartingLevel`, `summarizeStatuses`/`sortProgressionRows` — wszystkie istnieją (zweryfikowane w `progression.ts`/`skill-progression.ts`/`skills.ts`).
- **Placeholdery:** brak — relokacje (T7/T12) mają jawne listy podmian; shimy mają pełny kod.
- **Ryzyko, na które uwaga przy wykonaniu:** typ `summary` w `ProgressionList` (Task 3 Step 2 ma fallback, gdy `React.ComponentProps` nie złapie); kolejność tras statyczne vs dynamiczne (RR7 ogarnia, ale trzymamy `rozwoj/porownanie` jako osobny segment — brak kolizji z `cwiczenie/:id`).
