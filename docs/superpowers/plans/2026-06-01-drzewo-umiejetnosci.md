# Drzewo umiejętności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać growe drzewo umiejętności — graf prerekwizytów (DAG) między umiejętnościami trenera, z czterema stanami węzła per-podopieczny, zastępujące dotychczasową płaską mapę Umiejętności (z drill-in do drabiny wariantów).

**Architecture:** Jedna nowa tabela `skill_prerequisites` (krawędzie DAG). Czysta, testowalna logika (`skill-tree-math.ts`: cykle, warstwowanie, stany) odseparowana od DB. Repo (`skill-tree.ts` + rozszerzenie `skills.ts`) składa drzewo i liczy stany. Render własnym warstwowym SVG/CSS (`skill-tree.tsx`, idiom `stat-widgets`, bez nowej zależności). Trasy mapy przebudowane na drzewo + nowe trasy drill-in.

**Tech Stack:** React Router v7 (framework mode, SSR), Drizzle ORM + Postgres, Zod, Vitest (testcontainers dla `*.itest.ts`), Biome.

---

## Reguły projektowe (OBOWIĄZUJĄ w każdym tasku)

- **Nigdy git, nigdy docker.** Po każdym tasku: `superpowers:requesting-code-review` (`/code-review`) na zmianach — **bez commita**. Git/migracje/Docker robi właściciel (handoff na końcu).
- **npm**, nie pnpm. Komendy pojedynczo (allowlista): `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:generate`, `npx vitest run <wzorzec>`, `npx biome format --write <plik>`.
- **TDD** dla logiki bez DB (`skill-tree-math.ts`, Zod). Integracyjne (`*.itest.ts`) PISZ, **nie uruchamiaj** (Docker — właściciel).
- **Tenant-scope:** każda funkcja repo z wymaganym `trainerId`; brak dostępu → **404**.
- **Schemat = źródło prawdy:** edycja `schema.ts` → `npm run db:generate`; **nigdy ręcznie** `migrations/`.
- **Frontend/UI → `frontend-design:frontend-design`.** Każdy task dotykający warstwy wizualnej (komponent/widok/stylowanie) idzie przez ten skill; kolory wyłącznie przez tokeny `var(--*)` (`app/styles/tokens.css`), UI po polsku, nazwy ćwiczeń EN zostają.
- **Trasa = plik + wpis w `app/routes.ts`.**
- **Dokumentacja** (README katalogu / `CLAUDE.md` / `innovate.md`) to część „done" — Task 12.

## Mapa plików

| Plik | Akcja | Odpowiedzialność |
|---|---|---|
| `app/lib/db/schema.ts` | modyfikacja | tabela `skillPrerequisites` + typy |
| `app/lib/skill-tree-math.ts` | utworzenie | czysta logika: cykle, warstwy, stany, topo |
| `app/lib/skill-tree-math.test.ts` | utworzenie | testy jednostkowe powyższego |
| `app/lib/skill-types.ts` | modyfikacja | `PrerequisiteFormSchema` |
| `app/lib/skill-types.test.ts` | modyfikacja | test schematu prereka |
| `app/lib/skills.ts` | modyfikacja | CRUD prereków + `listAssignablePrerequisites` |
| `app/lib/skill-tree.ts` | utworzenie | `getSkillTreeForTrainer/ForTrainee` |
| `app/components/skill-tree.tsx` | utworzenie | prezentacja drzewa (SVG/CSS) |
| `app/routes/trener/umiejetnosci.$skillId.tsx` | modyfikacja | sekcja „Wymaga:" |
| `app/routes/trener/podopieczni.$traineeId.umiejetnosci.tsx` | przebudowa | drzewo (stany per-podopieczny) |
| `app/routes/trener/podopieczni.$traineeId.umiejetnosci.$skillId.tsx` | utworzenie | drill-in trenera (drabina + akcje) |
| `app/routes/podopieczny/umiejetnosci.tsx` | przebudowa | drzewo read-only |
| `app/routes/podopieczny/umiejetnosci.$skillId.tsx` | utworzenie | drill-in read-only |
| `app/routes.ts` | modyfikacja | rejestracja 2 nowych tras |
| `tests/skill-tree.itest.ts` | utworzenie | testy integracyjne (PISZ, nie uruchamiaj) |

---

## Task 1: Schemat — tabela `skill_prerequisites` + migracja

**Files:**
- Modify: `app/lib/db/schema.ts` (sekcja „Skills", po `skillAdvancements`)
- Generate: `app/lib/db/migrations/` (przez `db:generate`)

- [ ] **Step 1: Dodaj tabelę w `schema.ts`** (po definicji `skillAdvancements`, przed sekcją `// ---- Types ----`):

```ts
export const skillPrerequisites = pgTable(
  "skill_prerequisites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalizacja tenant-scope (jak skill_advancements/workout_logs).
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Umiejętność, która MA prerekwizyt.
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    // Prerekwizyt (musi być opanowany, by odblokować skillId).
    requiresSkillId: uuid("requires_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    edgeUniq: uniqueIndex("skill_prerequisites_edge_uniq").on(t.skillId, t.requiresSkillId),
    trainerIdx: index("skill_prerequisites_trainer_idx").on(t.trainerId),
    skillIdx: index("skill_prerequisites_skill_idx").on(t.skillId),
    requiresIdx: index("skill_prerequisites_requires_idx").on(t.requiresSkillId),
    // Acykliczność egzekwujemy w repo (Postgres nie ma constraintu DAG);
    // tu blokujemy tylko trywialną pętlę własną.
    noSelfLoop: check(
      "skill_prerequisites_no_self_loop",
      sql`${t.skillId} <> ${t.requiresSkillId}`,
    ),
  }),
);
```

- [ ] **Step 2: Dodaj typy** w sekcji `// ---- Types ----` (na końcu):

```ts
export type SkillPrerequisite = typeof skillPrerequisites.$inferSelect;
export type NewSkillPrerequisite = typeof skillPrerequisites.$inferInsert;
```

- [ ] **Step 3: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: nowy plik `app/lib/db/migrations/0009_*.sql` z `CREATE TABLE "skill_prerequisites"` + snapshot w `meta/`. **Nie edytuj ręcznie.**

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: brak błędów.

- [ ] **Step 5: Review per task** — `/code-review` na zmianach (`schema.ts` + migracja). Bez commita.

---

## Task 2: Czysta logika `skill-tree-math.ts` (TDD)

**Files:**
- Create: `app/lib/skill-tree-math.ts`
- Test: `app/lib/skill-tree-math.test.ts`

- [ ] **Step 1: Napisz failujący test** `app/lib/skill-tree-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assignLayers,
  nodeState,
  orderWithinLayer,
  topoOrder,
  wouldCreateCycle,
  type Edge,
} from "./skill-tree-math";

describe("wouldCreateCycle", () => {
  it("blokuje pętlę własną", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });
  it("pozwala na pierwszą krawędź", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });
  it("blokuje krawędź zwrotną (b wymaga a, gdy a wymaga b)", () => {
    const edges: Edge[] = [{ from: "a", requires: "b" }];
    expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
  });
  it("blokuje cykl pośredni a->b->c, dodanie c->a", () => {
    const edges: Edge[] = [
      { from: "a", requires: "b" },
      { from: "b", requires: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });
  it("pozwala na gałąź bez domknięcia", () => {
    const edges: Edge[] = [
      { from: "a", requires: "b" },
      { from: "a", requires: "c" },
    ];
    expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
  });
});

describe("assignLayers", () => {
  it("łańcuch dostaje rosnące warstwy", () => {
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "c", requires: "b" },
    ];
    const layers = assignLayers(["a", "b", "c"], edges);
    expect(layers.get("a")).toBe(0);
    expect(layers.get("b")).toBe(1);
    expect(layers.get("c")).toBe(2);
  });
  it("węzeł z dwoma prerekami na różnych głębokościach bierze max", () => {
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "d", requires: "a" },
      { from: "d", requires: "b" },
    ];
    const layers = assignLayers(["a", "b", "d"], edges);
    expect(layers.get("d")).toBe(2); // max(layer a=0, layer b=1) + 1
  });
  it("izolowany węzeł jest korzeniem", () => {
    expect(assignLayers(["x"], []).get("x")).toBe(0);
  });
});

describe("nodeState", () => {
  it("mastered gdy ma zdarzenia i na szczycie", () => {
    expect(nodeState({ hasEvents: true, atTopVariation: true, prereqStates: [] })).toBe("mastered");
  });
  it("in_progress gdy ma zdarzenia, nie na szczycie", () => {
    expect(nodeState({ hasEvents: true, atTopVariation: false, prereqStates: [] })).toBe(
      "in_progress",
    );
  });
  it("available gdy brak zdarzeń i wszystkie prereki mastered", () => {
    expect(
      nodeState({ hasEvents: false, atTopVariation: false, prereqStates: ["mastered", "mastered"] }),
    ).toBe("available");
  });
  it("locked gdy brak zdarzeń i jakiś prereq nie-mastered", () => {
    expect(
      nodeState({ hasEvents: false, atTopVariation: false, prereqStates: ["mastered", "in_progress"] }),
    ).toBe("locked");
  });
  it("korzeń bez zdarzeń jest available (brak prereków)", () => {
    expect(nodeState({ hasEvents: false, atTopVariation: false, prereqStates: [] })).toBe(
      "available",
    );
  });
});

describe("orderWithinLayer", () => {
  it("sortuje po nazwie locale pl", () => {
    const names = new Map([
      ["1", "Łokieć"],
      ["2", "Antagonista"],
      ["3", "Zwis"],
    ]);
    expect(orderWithinLayer(["1", "2", "3"], names)).toEqual(["2", "1", "3"]);
  });
});

describe("topoOrder", () => {
  it("prerekwizyty przed zależnymi", () => {
    const edges: Edge[] = [
      { from: "c", requires: "a" },
      { from: "c", requires: "b" },
    ];
    const order = topoOrder(["a", "b", "c"], edges);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npx vitest run app/lib/skill-tree-math.test.ts`
Expected: FAIL — „Cannot find module './skill-tree-math'".

- [ ] **Step 3: Zaimplementuj `app/lib/skill-tree-math.ts`:**

```ts
/** Czysta logika drzewa umiejętności (bez DB). Krawędź: `from` wymaga `requires`. */

export type NodeState = "mastered" | "in_progress" | "available" | "locked";
export interface Edge {
  from: string; // umiejętność, która ma prerekwizyt
  requires: string; // prerekwizyt
}

/** Mapa: węzeł → lista jego prerekwizytów (requires). */
function prereqAdjacency(edges: Edge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const arr = m.get(e.from) ?? [];
    arr.push(e.requires);
    m.set(e.from, arr);
  }
  return m;
}

/**
 * Czy dodanie krawędzi `from → requires` (from wymaga requires) domknęłoby cykl?
 * Cykl powstaje, gdy `requires` już (tranzytywnie) zależy od `from`. Idziemy po
 * prerekwizytach startując z `requires`; jeśli dotrzemy do `from` — cykl.
 */
export function wouldCreateCycle(edges: Edge[], from: string, requires: string): boolean {
  if (from === requires) return true;
  const adj = prereqAdjacency(edges);
  const stack = [requires];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const p of adj.get(n) ?? []) stack.push(p);
  }
  return false;
}

/** Warstwa = najdłuższa ścieżka od korzenia: korzeń=0, węzeł=max(prereki)+1. Zakłada DAG. */
export function assignLayers(nodeIds: string[], edges: Edge[]): Map<string, number> {
  const adj = prereqAdjacency(edges);
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // guard na nieoczekiwany cykl
    visiting.add(id);
    let d = 0;
    for (const p of adj.get(id) ?? []) d = Math.max(d, depth(p) + 1);
    visiting.delete(id);
    layer.set(id, d);
    return d;
  }
  for (const id of nodeIds) depth(id);
  return layer;
}

/** Deterministyczna kolejność węzłów w warstwie (po nazwie, locale pl). */
export function orderWithinLayer(nodeIds: string[], nameById: Map<string, string>): string[] {
  return [...nodeIds].sort((a, b) =>
    (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "", "pl"),
  );
}

export interface NodeStateInput {
  hasEvents: boolean; // umiejętność przypisana podopiecznemu (≥1 zdarzenie awansu)
  atTopVariation: boolean; // bieżący wariant = najwyższy ordinal
  prereqStates: NodeState[]; // stany bezpośrednich prerekwizytów
}

export function nodeState(input: NodeStateInput): NodeState {
  if (input.hasEvents) return input.atTopVariation ? "mastered" : "in_progress";
  const allMastered = input.prereqStates.every((s) => s === "mastered");
  return allMastered ? "available" : "locked";
}

/** Porządek topologiczny (prerekwizyty przed zależnymi). Stabilny (sort id). */
export function topoOrder(nodeIds: string[], edges: Edge[]): string[] {
  const adj = prereqAdjacency(edges);
  const dependents = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodeIds) indeg.set(id, (adj.get(id) ?? []).length);
  for (const e of edges) {
    const arr = dependents.get(e.requires) ?? [];
    arr.push(e.from);
    dependents.set(e.requires, arr);
  }
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  const out: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    out.push(n);
    for (const d of dependents.get(n) ?? []) {
      const next = (indeg.get(d) ?? 0) - 1;
      indeg.set(d, next);
      if (next === 0) {
        queue.push(d);
        queue.sort();
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npx vitest run app/lib/skill-tree-math.test.ts`
Expected: PASS (wszystkie bloki).

- [ ] **Step 5: Lint + format**

Run: `npx biome format --write app/lib/skill-tree-math.ts`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 6: Review per task** — `/code-review`. Bez commita.

---

## Task 3: Repo — CRUD prerekwizytów w `skills.ts`

**Files:**
- Modify: `app/lib/skills.ts` (dodaj funkcje na końcu; import `wouldCreateCycle`, typ `Edge`)

- [ ] **Step 1: Dodaj importy** na górze `skills.ts`:

```ts
import { wouldCreateCycle, type Edge } from "~/lib/skill-tree-math";
```

- [ ] **Step 2: Dodaj funkcje** na końcu `skills.ts`:

```ts
/** Wszystkie krawędzie prerekwizytów trenera (do wykrywania cykli i budowy drzewa). */
async function listEdgesForTrainer(db: Db, trainerId: string): Promise<Edge[]> {
  const rows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(eq(schema.skillPrerequisites.trainerId, trainerId));
  return rows.map((r) => ({ from: r.from, requires: r.requires }));
}

/** Czy obie umiejętności należą do trenera? (walidacja własności). */
async function bothSkillsOwned(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.trainerId, trainerId),
        inArray(schema.skills.id, [skillId, requiresSkillId]),
      ),
    );
  return new Set(rows.map((r) => r.id)).size === 2;
}

/** Dodaje krawędź „skillId wymaga requiresSkillId". Odrzuca obce, samopętlę, cykl, duplikat. */
export async function addPrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  if (skillId === requiresSkillId) {
    throw new SkillError("self loop", "Umiejętność nie może wymagać samej siebie.");
  }
  if (!(await bothSkillsOwned(db, trainerId, skillId, requiresSkillId))) {
    throw new SkillError("not found", "Nie znaleziono umiejętności.");
  }
  const edges = await listEdgesForTrainer(db, trainerId);
  if (wouldCreateCycle(edges, skillId, requiresSkillId)) {
    throw new SkillError("cycle", "To połączenie utworzyłoby cykl w drzewie.");
  }
  try {
    await db
      .insert(schema.skillPrerequisites)
      .values({ trainerId, skillId, requiresSkillId });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_prerequisites_edge_uniq")) {
      throw new SkillError("duplicate", "Ten prerekwizyt jest już dodany.");
    }
    throw e;
  }
}

/** Usuwa krawędź (jeśli należy do trenera). */
export async function removePrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  await db
    .delete(schema.skillPrerequisites)
    .where(
      and(
        eq(schema.skillPrerequisites.trainerId, trainerId),
        eq(schema.skillPrerequisites.skillId, skillId),
        eq(schema.skillPrerequisites.requiresSkillId, requiresSkillId),
      ),
    );
}

/** Prerekwizyty danej umiejętności (do edytora „Wymaga:"). */
export async function listPrerequisitesForSkill(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  return await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skillPrerequisites)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillPrerequisites.requiresSkillId))
    .where(
      and(
        eq(schema.skillPrerequisites.trainerId, trainerId),
        eq(schema.skillPrerequisites.skillId, skillId),
      ),
    )
    .orderBy(asc(schema.skills.name));
}

/**
 * Umiejętności trenera, które MOŻNA dodać jako prereq danej (bez siebie, bez już
 * dodanych, bez tych, które domknęłyby cykl). Aktywne (nie zarchiwizowane).
 */
export async function listAssignablePrerequisites(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  const all = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .orderBy(asc(schema.skills.name));
  const edges = await listEdgesForTrainer(db, trainerId);
  const existing = new Set(
    edges.filter((e) => e.from === skillId).map((e) => e.requires),
  );
  return all.filter(
    (s) =>
      s.id !== skillId &&
      !existing.has(s.id) &&
      !wouldCreateCycle(edges, skillId, s.id),
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto. (Walidacja zachowań — w testach integracyjnych Task 11.)

- [ ] **Step 4: Review per task** — `/code-review`. Bez commita.

---

## Task 4: Repo — składanie drzewa `skill-tree.ts`

**Files:**
- Create: `app/lib/skill-tree.ts`

- [ ] **Step 1: Utwórz `app/lib/skill-tree.ts`:**

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getSkillMapForTrainee } from "~/lib/skill-progression";
import { listSkillsForTrainer } from "~/lib/skills";
import {
  assignLayers,
  nodeState,
  orderWithinLayer,
  topoOrder,
  type Edge,
  type NodeState,
} from "~/lib/skill-tree-math";

export interface TreeNode {
  skillId: string;
  name: string;
  layer: number;
  orderInLayer: number;
  variationCount: number;
  currentVariationId: string | null;
  currentExerciseId: string | null;
  state?: NodeState; // tylko w widoku per-podopieczny
}

export interface SkillTree {
  nodes: TreeNode[];
  edges: Edge[];
}

/** Aktywne umiejętności trenera + ich krawędzie. Współdzielone przez oba widoki. */
async function loadGraph(
  db: Db,
  trainerId: string,
): Promise<{
  skills: Array<{ id: string; name: string; variationCount: number }>;
  edges: Edge[];
}> {
  // Reuse: listSkillsForTrainer daje aktywne umiejętności + variationCount (patrz skills.ts).
  const skills = await listSkillsForTrainer(db, trainerId);
  const activeIds = new Set(skills.map((s) => s.id));

  const edgeRows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(eq(schema.skillPrerequisites.trainerId, trainerId));
  // Pomijamy krawędzie dotykające zarchiwizowanych umiejętności.
  const edges = edgeRows.filter((e) => activeIds.has(e.from) && activeIds.has(e.requires));

  return {
    skills: skills.map((s) => ({ id: s.id, name: s.name, variationCount: s.variationCount })),
    edges,
  };
}

function layoutNodes(
  skills: Array<{ id: string; name: string; variationCount: number }>,
  edges: Edge[],
): Map<string, { layer: number; orderInLayer: number }> {
  const ids = skills.map((s) => s.id);
  const layers = assignLayers(ids, edges);
  const nameById = new Map(skills.map((s) => [s.id, s.name]));
  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const l = layers.get(id) ?? 0;
    const arr = byLayer.get(l) ?? [];
    arr.push(id);
    byLayer.set(l, arr);
  }
  const pos = new Map<string, { layer: number; orderInLayer: number }>();
  for (const [l, group] of byLayer) {
    const ordered = orderWithinLayer(group, nameById);
    ordered.forEach((id, i) => pos.set(id, { layer: l, orderInLayer: i }));
  }
  return pos;
}

/** Drzewo dla autora (trener) — sam szkielet, bez stanów per-podopieczny. */
export async function getSkillTreeForTrainer(db: Db, trainerId: string): Promise<SkillTree> {
  const { skills, edges } = await loadGraph(db, trainerId);
  const pos = layoutNodes(skills, edges);
  const nodes: TreeNode[] = skills.map((s) => ({
    skillId: s.id,
    name: s.name,
    layer: pos.get(s.id)?.layer ?? 0,
    orderInLayer: pos.get(s.id)?.orderInLayer ?? 0,
    variationCount: s.variationCount,
    currentVariationId: null,
    currentExerciseId: null,
  }));
  return { nodes, edges };
}

/** Drzewo dla podopiecznego — ze stanami węzłów liczonymi w porządku topologicznym. */
export async function getSkillTreeForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<SkillTree> {
  const { skills, edges } = await loadGraph(db, trainerId);
  const pos = layoutNodes(skills, edges);

  // Bieżący wariant + czy są zdarzenia + max ordinal → z mapy umiejętności (kierunek A).
  const map = await getSkillMapForTrainee(db, trainerId, traineeId, { withSuggestions: false });
  const mapBySkill = new Map(map.map((m) => [m.skillId, m]));

  // Stany w porządku topologicznym, by available/locked zależały od mastered prereków.
  const adjPrereqs = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adjPrereqs.get(e.from) ?? [];
    arr.push(e.requires);
    adjPrereqs.set(e.from, arr);
  }
  const state = new Map<string, NodeState>();
  for (const id of topoOrder(skills.map((s) => s.id), edges)) {
    const m = mapBySkill.get(id);
    const hasEvents = m?.currentVariationId != null;
    const maxOrd = m ? Math.max(0, ...m.variations.map((v) => v.ordinal)) : 0;
    const curOrd = m?.variations.find((v) => v.id === m.currentVariationId)?.ordinal ?? 0;
    const atTop = hasEvents && m!.variations.length > 0 && curOrd === maxOrd;
    const prereqStates = (adjPrereqs.get(id) ?? []).map((p) => state.get(p) ?? "locked");
    state.set(id, nodeState({ hasEvents, atTopVariation: atTop, prereqStates }));
  }

  const nodes: TreeNode[] = skills.map((s) => {
    const m = mapBySkill.get(s.id);
    return {
      skillId: s.id,
      name: s.name,
      layer: pos.get(s.id)?.layer ?? 0,
      orderInLayer: pos.get(s.id)?.orderInLayer ?? 0,
      variationCount: s.variationCount,
      currentVariationId: m?.currentVariationId ?? null,
      currentExerciseId: m?.currentExerciseId ?? null,
      state: state.get(s.id) ?? "locked",
    };
  });
  return { nodes, edges };
}
```

> Uwaga: `skills.ts` **nie** importuje `skill-tree.ts` (zależność jednokierunkowa), więc statyczny import `listSkillsForTrainer` nie tworzy cyklu. `npm run build` to potwierdzi.

- [ ] **Step 2: Typecheck + lint + build** (build wyłapie ewentualny cykl importów)

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 5: Zod — `PrerequisiteFormSchema` (TDD)

**Files:**
- Modify: `app/lib/skill-types.ts`
- Modify: `app/lib/skill-types.test.ts`

- [ ] **Step 1: Dopisz failujący test** do `app/lib/skill-types.test.ts`:

```ts
import { PrerequisiteFormSchema } from "./skill-types";

describe("PrerequisiteFormSchema", () => {
  it("przyjmuje dwa poprawne uuid", () => {
    const r = PrerequisiteFormSchema.safeParse({
      skillId: "11111111-1111-1111-1111-111111111111",
      requiresSkillId: "22222222-2222-2222-2222-222222222222",
    });
    expect(r.success).toBe(true);
  });
  it("odrzuca nie-uuid", () => {
    const r = PrerequisiteFormSchema.safeParse({ skillId: "x", requiresSkillId: "y" });
    expect(r.success).toBe(false);
  });
});
```

(Jeśli `describe`/`expect`/`it` nie są jeszcze zaimportowane w tym pliku — dodaj `import { describe, expect, it } from "vitest";` na górze.)

- [ ] **Step 2: Uruchom — fail**

Run: `npx vitest run app/lib/skill-types.test.ts`
Expected: FAIL — brak `PrerequisiteFormSchema`.

- [ ] **Step 3: Dodaj schemat** w `app/lib/skill-types.ts`:

```ts
export const PrerequisiteFormSchema = z.object({
  skillId: z.string().uuid("Niepoprawna umiejętność."),
  requiresSkillId: z.string().uuid("Niepoprawny prerekwizyt."),
});
export type PrerequisiteForm = z.infer<typeof PrerequisiteFormSchema>;
```

- [ ] **Step 4: Uruchom — pass**

Run: `npx vitest run app/lib/skill-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Review per task** — `/code-review`. Bez commita.

---

## Task 6: Komponent `skill-tree.tsx` (frontend-design)

**Files:**
- Create: `app/components/skill-tree.tsx`

> **UI/UX → użyj `frontend-design:frontend-design`.** Idiom jak `app/components/stat-widgets.tsx` i `progression-charts.tsx`: czysty SVG/CSS, kolory **wyłącznie** przez tokeny, `role="img"`+`aria-label`, responsywność. Wizualna weryfikacja przez `npm run shots` na realnych trasach (Task 8/10). Referencja wyglądu: makiety w `.superpowers/brainstorm/*/content/skill-tree-v2.html`.

- [ ] **Step 1: Zaprojektuj i zaimplementuj komponent** — czysta prezentacja (bez fetchowania, bez importów routera poza `Link`):

Interfejs (props):
```ts
import type { SkillTree, TreeNode } from "~/lib/skill-tree";
export function SkillTreeView(props: {
  tree: SkillTree;
  hrefForNode: (skillId: string) => string; // link do drill-in (rola-zależny)
  showStates: boolean; // true: koloruj stany (per-podopieczny); false: szkielet (autor)
}): JSX.Element;
```

Wymagania renderu:
- Układ warstwowy: węzły grupowane po `node.layer` (rzędy), w rzędzie wg `orderInLayer`. Mobile: warstwy w pionie (CSS grid `repeat(auto-fit, …)`), desktop: poziome rzędy.
- Krawędzie: SVG `<path>` (bezier) między węzłem-prerekiem a zależnym; kolor wg stanu źródła (od `mastered` → `var(--ok)`/akcent; inaczej `var(--line)` przerywany). Warstwa SVG `position:absolute` pod węzłami (jak w makiecie).
- Węzeł = karta: nazwa, mini-pasek poziomu (`currentVariation ordinal / variationCount` gdy `showStates`), „pill" stanu. Cztery stany przez tokeny: `mastered`→`var(--ok)`, `in_progress`→akcent (`var(--accent)`), `available`→`var(--accent)`/info, `locked`→`var(--muted)`/przygaszony. Brak hardkodów hex.
- Cała karta to `Link` do `props.hrefForNode(node.skillId)`.
- Pusty stan: gdy `tree.nodes.length === 0` → komunikat „Brak umiejętności…".

- [ ] **Step 2: Build + shots (weryfikacja wizualna następuje w Task 8/10 na realnych trasach)**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita.

---

## Task 7: Trener — sekcja „Wymaga:" w edytorze umiejętności

**Files:**
- Modify: `app/routes/trener/umiejetnosci.$skillId.tsx`

- [ ] **Step 1: Rozszerz loader** — dołóż prereki + przypisywalne:

```ts
import {
  // …istniejące…
  addPrerequisite,
  removePrerequisite,
  listPrerequisitesForSkill,
  listAssignablePrerequisites,
} from "~/lib/skills";
import { PrerequisiteFormSchema } from "~/lib/skill-types";
```

W `loader`, po `assignable`:
```ts
  const [prerequisites, assignablePrereqs] = await Promise.all([
    listPrerequisitesForSkill(db, user.id, skillId),
    listAssignablePrerequisites(db, user.id, skillId),
  ]);
  return { skill, assignable, prerequisites, assignablePrereqs };
```

- [ ] **Step 2: Dodaj intenty w `action`** (wewnątrz `try`, przed `return null;`):

```ts
    if (intent === "add-prereq") {
      const parsed = PrerequisiteFormSchema.safeParse({
        skillId,
        requiresSkillId: String(fd.get("requiresSkillId") ?? ""),
      });
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await addPrerequisite(db, user.id, skillId, parsed.data.requiresSkillId);
      return { ok: true };
    }
    if (intent === "remove-prereq") {
      const requiresSkillId = String(fd.get("requiresSkillId") ?? "");
      if (requiresSkillId) await removePrerequisite(db, user.id, skillId, requiresSkillId);
      return { ok: true };
    }
```

- [ ] **Step 3: Dodaj sekcję UI** (frontend-design) — po liście wariantów, przed blokiem archiwizacji. Lista bieżących prereków z przyciskiem „×" (Form `remove-prereq`, hidden `requiresSkillId`) + `<select name="requiresSkillId">` z `assignablePrereqs` i przyciskiem „Dodaj" (Form `add-prereq`). Nagłówek „Wymaga (prerekwizyty)". Pusty stan gdy brak. Błąd cyklu/duplikatu pokaże istniejący `actionData.error`. Idiom jak sekcja wariantów wyżej (Form method="post", hidden `intent`).

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 5: Review per task** — `/code-review`. Bez commita.

---

## Task 8: Trener — przebudowa mapy na drzewo

**Files:**
- Modify: `app/routes/trener/podopieczni.$traineeId.umiejetnosci.tsx`

> Akcje awansu/start przenoszą się do Task 9 (drill-in). Ten widok = **tylko** drzewo (loader read-only).

- [ ] **Step 1: Zastąp loader i komponent** (usuń `action` i formularze awansu — przejdą do drill-in):

```ts
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer } from "~/lib/progression";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const tree = await getSkillTreeForTrainee(db, user.id, traineeId);
  return { trainee, tree };
}

export default function TrenerDrzewoUmiejetnosci() {
  const { trainee, tree } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Umiejętności</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{trainee.displayName}</div>
          <h1>Drzewo umiejętności</h1>
          <div className="sub">Postęp na drzewie. Klik węzeł, by zarządzać poziomem.</div>
        </div>
      </div>
      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/trener/podopieczni/${trainee.id}/umiejetnosci/${skillId}`}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 3: Weryfikacja wizualna** (wymaga stacku — jeśli właściciel uruchomił dev/Postgres):

Run: `npm run shots -- /trener/podopieczni`
Expected: zrzuty drzewa desktop+mobile czytelne. (Jeśli stack nie działa — zgłoś do ręcznej weryfikacji w handoffie.)

- [ ] **Step 4: Review per task** — `/code-review`. Bez commita.

---

## Task 9: Trener — drill-in (drabina + akcje)

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.umiejetnosci.$skillId.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Utwórz trasę** — przenieś tu logikę awansu/start/historii z dawnej mapy (Task 8 ją usunął). Loader ładuje pojedynczą umiejętność z mapy + dane trenera:

```ts
import {
  Form, Link, useActionData, useLoaderData,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { findTraineeOfTrainer, todayIso } from "~/lib/progression";
import { getSkillMapForTrainee, recordAdvancement, setStartingLevel } from "~/lib/skill-progression";
import { SkillError } from "~/lib/skills";
import { AdvancementFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const skillId = args.params.skillId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const map = await getSkillMapForTrainee(db, user.id, traineeId, { withSuggestions: true });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });
  return { trainee, entry, today: todayIso() };
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
```

Komponent (frontend-design): crumbs `Podopieczni › {imię} › Umiejętności (link do drzewa) › {skillName}`. Renderuje drabinę wariantów (`entry.variations` z „TU JESTEŚ"), sugestię (`entry.suggestion`), datę ostatniego awansu, link „Zobacz wyniki w czasie →" (gdy `entry.currentHasLogs && entry.currentExerciseId`), formularz awansu/startu (hidden `intent` = `entry.currentVariationId ? "advance" : "set-start"`, select wariantów, data=`today`, notatka) oraz `<details>` z historią. **To dokładnie treść dawnej karty z mapy** — przenieś 1:1, zmieniając tylko nagłówki/crumbs i odbierając `skillId` z params zamiast z mapy. Błąd z `actionData.error`.

- [ ] **Step 2: Zarejestruj trasę w `app/routes.ts`** — w bloku `trener`, zaraz po wpisie `podopieczni/:traineeId/umiejetnosci`:

```ts
      route(
        "podopieczni/:traineeId/umiejetnosci/:skillId",
        "routes/trener/podopieczni.$traineeId.umiejetnosci.$skillId.tsx",
      ),
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: czysto.

- [ ] **Step 4: Review per task** — `/code-review`. Bez commita.

---

## Task 10: Podopieczny — drzewo read-only + drill-in

**Files:**
- Modify: `app/routes/podopieczny/umiejetnosci.tsx`
- Create: `app/routes/podopieczny/umiejetnosci.$skillId.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Przebuduj `podopieczny/umiejetnosci.tsx`** na drzewo read-only:

```ts
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const tree = await getSkillTreeForTrainee(db, user.trainerId, user.id);
  return { tree };
}

export default function PodopiecznyDrzewo() {
  const { tree } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Podopieczny</div>
          <h1>Drzewo umiejętności</h1>
          <div className="sub">Odblokowuj kolejne cele. Klik węzeł, by zobaczyć warianty.</div>
        </div>
      </div>
      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/podopieczny/umiejetnosci/${skillId}`}
      />
    </div>
  );
}
```

- [ ] **Step 2: Utwórz `podopieczny/umiejetnosci.$skillId.tsx`** (read-only drill-in):

```ts
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { getSkillMapForTrainee } from "~/lib/skill-progression";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const skillId = args.params.skillId ?? "";
  const map = await getSkillMapForTrainee(db, user.trainerId, user.id, { withSuggestions: false });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });
  return { entry };
}
```

Komponent (frontend-design): crumbs `Umiejętności (link do drzewa) › {skillName}`, drabina wariantów read-only z „TU JESTEŚ" (idiom jak dawny `podopieczny/umiejetnosci.tsx`), data ostatniego awansu, link „Zobacz wyniki w czasie →" gdy `entry.currentHasLogs && entry.currentExerciseId`. Bez akcji.

- [ ] **Step 3: Zarejestruj trasę w `app/routes.ts`** — w bloku `podopieczny`, po `umiejetnosci`:

```ts
      route("umiejetnosci/:skillId", "routes/podopieczny/umiejetnosci.$skillId.tsx"),
```

- [ ] **Step 4: Typecheck + lint + build + shots**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Run: `npm run shots -- /podopieczny/umiejetnosci` (jeśli stack działa; inaczej zgłoś do ręcznej weryfikacji)
Expected: czysto; zrzuty czytelne na mobile.

- [ ] **Step 5: Review per task** — `/code-review`. Bez commita.

---

## Task 11: Testy integracyjne (PISZ, nie uruchamiaj — Docker u właściciela)

**Files:**
- Create: `tests/skill-tree.itest.ts`

> Wzoruj się na istniejących `tests/*.itest.ts` (testcontainers, setup migracji, helpery tworzenia trenera/podopiecznego). NIE uruchamiaj — zgłoś w handoffie.

- [ ] **Step 1: Napisz testy** pokrywające:
  - **Tenant-scope:** trener A → 404 na `/trener/podopieczni/:bId/umiejetnosci` podopiecznego trenera B; `addPrerequisite` z umiejętnością trenera B → `SkillError`/404.
  - **Autoring:** `addPrerequisite` → krawędź w `getSkillTreeForTrainer`; cykl A→B→C + próba C→A → `SkillError("cycle")`; duplikat → `SkillError("duplicate")`; `removePrerequisite` usuwa; usunięcie/archiwizacja umiejętności sprząta/pomija krawędzie.
  - **Stany per-podopieczny:** korzeń `mastered` (start na najwyższym wariancie) → następnik `available`; dopóki prereq nie-`mastered` → następnik `locked`; po `setStartingLevel` na następniku → `in_progress`.
  - **Read-only podopiecznego:** brak `action` na `podopieczny/umiejetnosci*` (POST → 405/404); drill-in trenera wymaga roli trener.

- [ ] **Step 2: Typecheck** (kompilacja testów)

Run: `npm run typecheck`
Expected: czysto.

- [ ] **Step 3: Review per task** — `/code-review`. Bez commita. **Zaznacz: testy integracyjne do uruchomienia przez właściciela.**

---

## Task 12: Dokumentacja

**Files (modyfikacja):**
- `app/lib/README.md` — dopisz `skill-tree.ts`, `skill-tree-math.ts`, nowe eksporty w `skills.ts` (prereki).
- `app/lib/db/README.md` — wzmianka o `skill_prerequisites`.
- `app/components/README.md` — `skill-tree.tsx`.
- `app/routes/trener/README.md` — drzewo zamiast mapy + drill-in `umiejetnosci/$skillId`.
- `app/routes/podopieczny/README.md` — drzewo + drill-in.
- `app/routes/README.md` — jeśli zmienia się opis sekcji Umiejętności.
- `docs/innovate.md` — pozycja „Drzewo prerekwizytów (DAG)": ⬜ → ✅ (z linkami do spec/plan).
- `CLAUDE.md` — tylko jeśli zmienia się nazwa pozycji nawigacji (domyślnie zostaje „Umiejętności").

- [ ] **Step 1: Zaktualizuj powyższe README** zgodnie z faktycznym stanem (zwięźle, faktycznie).
- [ ] **Step 2: Review per task** — `/code-review` (lub przegląd treści). Bez commita.

---

## Task 13: Bramki końcowe + handoff

- [ ] **Step 1: Pełne bramki** (wszystkie zielone):

Run: `npx vitest run` (lub `npm run test:unit`) — jednostkowe zielone
Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: wszystko zielone (dowód — `superpowers:verification-before-completion`).

- [ ] **Step 2: `/code-review`** na pełnym diffie.
- [ ] **Step 3: `/security-review`** — zmiana dotyka `trainer_id`/tenant-scope (graf per-trener, drzewo per-podopieczny).
- [ ] **Step 4: Handoff** (granica gita — NIE commituj). Wypisz:
  - podsumowanie + lista zmienionych/utworzonych plików,
  - **proponowany komunikat commita** (tekst),
  - **migracja:** `npm run db:generate` utworzył `0009_*.sql` → właściciel uruchamia `npm run db:migrate`,
  - **testy do uruchomienia pod Dockerem:** `npm run test:itest` (w tym nowy `tests/skill-tree.itest.ts`),
  - **ręczna weryfikacja:** edytor umiejętności → dodaj „Wymaga:", sprawdź odmowę cyklu; `/trener/podopieczni/:id/umiejetnosci` (drzewo + klik węzła → drill-in + awans); `/podopieczny/umiejetnosci` (drzewo read-only + drill-in); `npm run shots` na obu trasach,
  - brak nowych env; seed opcjonalny (nieblokujący).

---

## Self-review planu (wypełnij przed startem)

- **Pokrycie spec:** §3 schemat→T1; §4 logika→T2; §5 repo→T3/T4; Zod→T5; §7 komponent→T6; §6 trasy→T7/T8/T9/T10; §9 testy→T2/T5/T11; §8 tenant-scope→T3/T4/T11; §11 docs→T12; bramki→T13. ✅ brak luk.
- **Typy spójne:** `Edge {from,requires}`, `NodeState`, `TreeNode`, `SkillTree`, `getSkillTreeForTrainer/ForTrainee`, `addPrerequisite/removePrerequisite/listPrerequisitesForSkill/listAssignablePrerequisites`, `PrerequisiteFormSchema` — używane spójnie między T2–T10.
- **Bez placeholderów:** kod podany wprost; UI-taski mają konkretny loader/action + opis JSX z idiomem do skopiowania z istniejących plików.
