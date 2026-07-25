# Tiery umiejętności i piramida drzewa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać umiejętnościom `tier` (4 stopnie trudności) i przebudować drzewo umiejętności w piramidę pasów tierów — fundament na dole, ekspert na górze.

**Architecture:** Nowa kolumna `skills.tier` (pgEnum). Dwa nowe czyste moduły: `skill-tier.ts` (słownik + porównania) i `skill-pyramid.ts` (przypisanie pasów/podrzędów + geometria) — oba testowane jednostkowo bez DB. Warstwa repo dokłada `tier` do odczytów i twardo waliduje „prerekwizyt nie z wyższego tieru" w `addPrerequisite`. `SkillTreeView` przepisany na absolutne pozycjonowanie kart nad SVG-em krawędzi, z geometrią liczoną z czystych funkcji (zero pomiaru DOM, SSR-clean).

**Tech Stack:** React Router v7 (framework mode, SSR), TypeScript strict, Drizzle ORM + PostgreSQL 16, Zod, Vitest, Biome, CSS z tokenami `var(--*)`.

**Spec:** [`docs/superpowers/specs/2026-07-24-tiery-umiejetnosci-piramida-design.md`](../specs/2026-07-24-tiery-umiejetnosci-piramida-design.md)

## Global Constraints

Każde zadanie dziedziczy poniższe. Łamanie ich to błąd implementacji, nie kwestia gustu.

- **NIGDY git.** Zero `git add`/`commit`/`branch`/`push`. Proces kończy się handoffem (Task 9). Właściciel commituje.
- **NIGDY docker.** Nie uruchamiaj `docker compose` ani `npm run test:itest` — testy integracyjne PISZESZ, uruchamia je właściciel.
- **Komendy powłoki tylko z allowlisty i tylko pojedynczo.** Bez łańcuchowania (`;`, `&&`), bez potoków (`| tail`), bez przekierowań (`>/dev/null`). Dozwolone: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:generate`, `npx vitest run <wzorzec>`, `npx biome format --write <plik>`. **Nie** `npm test` (to watch).
- Do czytania plików używaj Read/Grep/Glob, **nie** `cat`/`grep` w powłoce.
- **npm**, nie pnpm.
- **UI po polsku.** Brand `kalisthenos` zawsze małą literą. Nazwy ćwiczeń zostają po angielsku (Pull-up, Front Lever).
- **Zero emoji** w warstwie produktu (`design-system/README.md`).
- **Kolory wyłącznie przez `var(--*)`** z `app/styles/tokens.css`. Żadnych literałów hex w komponentach.
- **Tenant-scope:** funkcje repo przyjmują wymagany `trainerId`; brak dopasowania → **404**, nie 403.
- **Schemat = źródło prawdy.** Zmiana modelu = edycja `app/lib/db/schema.ts` + `npm run db:generate`. **Nigdy** ręcznie w `app/lib/db/migrations/`.
- **Dokumentacja jest częścią „done".** README katalogu aktualizujesz w tym samym zadaniu, które zmienia kod.
- **Review per task.** Każde zadanie kończy się bramką (typecheck + lint + testy zadania) i przeglądem `superpowers:requesting-code-review` przed kolejnym.
- Wartości enum tieru w bazie: `basic` · `intermediate` · `advanced` · `expert`. Polskie etykiety: `Podstawowy` · `Średnio zaawansowany` · `Zaawansowany` · `Ekspert`.

---

## File Structure

**Tworzone:**

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/skill-tier.ts` | Słownik tierów: kolejność, etykiety, ranking, reguła prerekwizytu, najwyższy zdobyty tier. Zero zależności. |
| `app/lib/skill-tier.test.ts` | Testy jednostkowe powyższego. |
| `app/lib/skill-pyramid.ts` | Układ piramidy: przypisanie pasów i podrzędów (`buildPyramid`) + geometria planszy (`layoutPyramid`). |
| `app/lib/skill-pyramid.test.ts` | Testy jednostkowe powyższego. |
| `app/components/tier-badge.tsx` | Plakietka tieru — jeden mały komponent prezentacyjny używany na 4 powierzchniach. |
| `tests/skill-tier.itest.ts` | Test integracyjny: zapis/odczyt tieru, tenant-scope, walidacja prereka. |

**Modyfikowane:**

| Plik | Zmiana |
|---|---|
| `app/lib/db/schema.ts` | `pgEnum` `skill_tier` + kolumna `skills.tier` |
| `app/lib/db/migrations/00NN_*.sql` | **generowany** przez `npm run db:generate` |
| `app/lib/skill-types.ts` | `tier` w `SkillFormSchema` |
| `app/lib/skills.ts` | `tier` w odczytach, `createSkill`/`updateSkill`, walidacja w `addPrerequisite`, nowe `listConflictingPrerequisites` |
| `app/lib/skill-tree.ts` | `TreeNode.tier` zamiast `layer`/`orderInLayer` |
| `app/lib/skill-progression.ts` | `SkillMapEntry.tier` |
| `app/components/skill-tree.tsx` | przebudowa `SkillTreeView` w piramidę + nagłówek postępu; usunięcie propa `showStates` |
| `app/styles/tokens.css` | sekcja „PIRAMIDA UMIEJĘTNOŚCI" |
| `app/routes/trener/umiejetnosci.nowa.tsx` | select tieru |
| `app/routes/trener/umiejetnosci.$skillId.tsx` | select tieru, plakietka, ostrzeżenie o kolizjach |
| `app/routes/trener/umiejetnosci._index.tsx` | sekcje po tierze + `<ListControls>` |
| `app/routes/podopieczny/rozwoj._index.tsx` | usunięcie propa `showStates` |
| `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx` | jw. |
| `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx` | plakietka tieru |
| `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` | plakietka tieru |
| README: `app/lib/`, `app/lib/db/`, `app/components/`, `app/routes/trener/`, `app/routes/podopieczny/`, `tests/`, `design-system/` | zgodnie z zadaniami |

**Nietykane:** `app/routes.ts` (brak nowych tras), `app/lib/skill-tree-math.ts` (bez zmian), `app/lib/authz.ts`, `scripts/seed.ts`.

---

## Kolejność zadań i zależności

```
Task 1 (skill-tier)  ──┬──> Task 3 (skill-pyramid) ──┐
                       │                              ├──> Task 7 (piramida UI) ──> Task 8 (plakietki drill-in) ──> Task 9 (bramki)
Task 2 (schemat)  ─────┴──> Task 4 (repo) ──> Task 5 (drzewo+mapa) ──┘
                                      └──> Task 6 (UI trenera) ───────┘
```

Każde zadanie zostawia repo w stanie zielonym (`npm run typecheck` + `npm run lint` przechodzą).

---

### Task 1: Słownik tierów

**Files:**
- Create: `app/lib/skill-tier.ts`
- Test: `app/lib/skill-tier.test.ts`
- Modify: `app/lib/README.md`

**Interfaces:**
- Consumes: nic (moduł bez zależności).
- Produces: `SKILL_TIERS: readonly ["basic","intermediate","advanced","expert"]`, `type SkillTier`, `TIER_LABEL: Record<SkillTier, string>`, `tierRank(tier: SkillTier): number`, `canBePrerequisite(prereqTier: SkillTier, skillTier: SkillTier): boolean`, `highestEarnedTier(nodes: Array<{ tier: SkillTier; mastered: boolean }>): SkillTier | null`.

- [ ] **Step 1: Napisz failujący test**

Utwórz `app/lib/skill-tier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SKILL_TIERS,
  TIER_LABEL,
  canBePrerequisite,
  highestEarnedTier,
  tierRank,
  type SkillTier,
} from "./skill-tier";

describe("TIER_LABEL", () => {
  it("ma niepustą etykietę dla każdego tieru", () => {
    for (const t of SKILL_TIERS) {
      expect(TIER_LABEL[t]).toBeTruthy();
    }
  });
  it("etykiety są unikalne", () => {
    const labels = SKILL_TIERS.map((t) => TIER_LABEL[t]);
    expect(new Set(labels).size).toBe(SKILL_TIERS.length);
  });
  // Etykiety są wiążącą wartością ze specu — dwa testy wyżej przepuściłyby
  // zamianę Ekspert↔Zaawansowany (nadal niepuste i unikalne). Ten je przypina.
  it("ma dokładnie te etykiety, których wymaga specyfikacja", () => {
    expect(TIER_LABEL).toEqual({
      basic: "Podstawowy",
      intermediate: "Średnio zaawansowany",
      advanced: "Zaawansowany",
      expert: "Ekspert",
    });
  });
});

describe("tierRank", () => {
  it("rośnie ściśle monotonicznie w kolejności SKILL_TIERS", () => {
    for (let i = 1; i < SKILL_TIERS.length; i++) {
      expect(tierRank(SKILL_TIERS[i]!)).toBeGreaterThan(tierRank(SKILL_TIERS[i - 1]!));
    }
  });
  it("basic jest najniższy, expert najwyższy", () => {
    expect(tierRank("basic")).toBe(0);
    expect(tierRank("expert")).toBe(SKILL_TIERS.length - 1);
  });
});

describe("canBePrerequisite", () => {
  it("dopuszcza równy i niższy tier, odrzuca wyższy — wszystkie pary", () => {
    for (const prereq of SKILL_TIERS) {
      for (const skill of SKILL_TIERS) {
        expect(canBePrerequisite(prereq, skill)).toBe(tierRank(prereq) <= tierRank(skill));
      }
    }
  });
  it("PODSTAWOWY nie może wymagać EKSPERTA", () => {
    expect(canBePrerequisite("expert", "basic")).toBe(false);
  });
  it("ten sam tier jest dozwolony (podrzędy w pasie)", () => {
    expect(canBePrerequisite("intermediate", "intermediate")).toBe(true);
  });
});

describe("highestEarnedTier", () => {
  it("pusta lista → null", () => {
    expect(highestEarnedTier([])).toBeNull();
  });
  it("brak opanowanych → null", () => {
    expect(highestEarnedTier([{ tier: "expert", mastered: false }])).toBeNull();
  });
  it("ignoruje nieopanowane wyższe tiery", () => {
    expect(
      highestEarnedTier([
        { tier: "intermediate", mastered: true },
        { tier: "expert", mastered: false },
      ]),
    ).toBe("intermediate");
  });
  it("wybiera najwyższy spośród opanowanych niezależnie od kolejności wejścia", () => {
    const nodes: Array<{ tier: SkillTier; mastered: boolean }> = [
      { tier: "advanced", mastered: true },
      { tier: "basic", mastered: true },
    ];
    expect(highestEarnedTier(nodes)).toBe("advanced");
  });
});
```

- [ ] **Step 2: Uruchom test — musi paść**

Run: `npx vitest run app/lib/skill-tier.test.ts`
Expected: FAIL — `Failed to resolve import "./skill-tier"`.

- [ ] **Step 3: Zaimplementuj moduł**

Utwórz `app/lib/skill-tier.ts`:

```ts
/**
 * Słownik tierów umiejętności (stopień trudności). Czysta logika — bez DB i bez Reacta.
 * Kolejność tablicy JEST semantyką: indeks = ranga trudności.
 */

export const SKILL_TIERS = ["basic", "intermediate", "advanced", "expert"] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];

/**
 * Etykiety w pisowni zdaniowej — `<select>` w formularzu ma być czytelny.
 * Wersalik dokłada CSS tam, gdzie wymaga tego design-system (plakietka, rail pasa).
 */
export const TIER_LABEL: Record<SkillTier, string> = {
  basic: "Podstawowy",
  intermediate: "Średnio zaawansowany",
  advanced: "Zaawansowany",
  expert: "Ekspert",
};

/** 0 (basic) … 3 (expert). Wartość spoza słownika → 0 (defensywnie — dane z DB). */
export function tierRank(tier: SkillTier): number {
  const i = SKILL_TIERS.indexOf(tier);
  return i < 0 ? 0 : i;
}

/**
 * Czy `prereqTier` wolno użyć jako prerekwizytu umiejętności o `skillTier`.
 * Reguła piramidy: prerekwizyt nigdy nie jest trudniejszy od tego, co odblokowuje.
 */
export function canBePrerequisite(prereqTier: SkillTier, skillTier: SkillTier): boolean {
  return tierRank(prereqTier) <= tierRank(skillTier);
}

/**
 * Najwyższy tier, w którym podopieczny ma co najmniej jedną opanowaną umiejętność.
 * `null` gdy nie opanował jeszcze niczego. Bierze `mastered: boolean`, a nie `NodeState`,
 * żeby ten moduł nie zależał od semantyki grafu — mapowanie robi wołający.
 */
export function highestEarnedTier(
  nodes: Array<{ tier: SkillTier; mastered: boolean }>,
): SkillTier | null {
  let best: SkillTier | null = null;
  for (const n of nodes) {
    if (!n.mastered) continue;
    if (best === null || tierRank(n.tier) > tierRank(best)) best = n.tier;
  }
  return best;
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npx vitest run app/lib/skill-tier.test.ts`
Expected: PASS — 11 testów zielonych.

- [ ] **Step 5: Zaktualizuj dokumentację**

W `app/lib/README.md` dopisz do tabeli plików wiersz (zachowaj alfabetyczne/istniejące uporządkowanie tabeli):

```markdown
| `skill-tier.ts` | Słownik tierów umiejętności (`basic`/`intermediate`/`advanced`/`expert`): `SKILL_TIERS`, `TIER_LABEL` (etykiety PL), `tierRank`, `canBePrerequisite` (prereq nie może być trudniejszy), `highestEarnedTier`. Czysta logika, bez DB. |
```

- [ ] **Step 6: Bramka zadania**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: `Checked N files … No fixes applied.` bez błędów.

Następnie przegląd: `superpowers:requesting-code-review` na zmianach tego zadania.

---

### Task 2: Schemat i migracja

**Files:**
- Modify: `app/lib/db/schema.ts`
- Create (generowany): `app/lib/db/migrations/00NN_<nazwa>.sql`
- Modify: `app/lib/db/README.md`

**Interfaces:**
- Consumes: `SKILL_TIERS` z Task 1 — **tylko jako źródło prawdy o wartościach**; `schema.ts` wypisuje je literalnie, bo `pgEnum` musi dostać literały (import runtime'owy do schematu DB byłby zbędnym sprzężeniem).
- Produces: `schema.skillTier` (pgEnum), `schema.skills.tier`, typ `Skill` rozszerzony o `tier: "basic" | "intermediate" | "advanced" | "expert"`.

- [ ] **Step 1: Dodaj enum do schematu**

W `app/lib/db/schema.ts`, w bloku deklaracji enumów (obok `planStatus`, `blockKind` — okolice linii 30–50), dopisz:

```ts
export const skillTier = pgEnum("skill_tier", ["basic", "intermediate", "advanced", "expert"]);
```

- [ ] **Step 2: Dodaj kolumnę do tabeli `skills`**

W `app/lib/db/schema.ts` w definicji `skills` (okolice linii 511–531), pod polem `description`, dopisz:

```ts
    // Stopień trudności — steruje pasem piramidy w drzewie umiejętności.
    // DEFAULT + NOT NULL backfilluje istniejące wiersze w tym samym ALTER TABLE.
    tier: skillTier("tier").notNull().default("basic"),
```

- [ ] **Step 3: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: `drizzle-kit` wypisuje nowy plik, np. `app/lib/db/migrations/0016_<losowa_nazwa>.sql`.

Jeśli drizzle-kit zada pytanie interaktywne (nie powinien — nic nie usuwamy ani nie zmieniamy nazwy) — **przerwij i zgłoś właścicielowi**, żeby odpalił komendę w TTY.

- [ ] **Step 4: Przeczytaj i zweryfikuj wygenerowany SQL**

Odczytaj nowy plik przez Read. Oczekiwana treść (kolejność linii może się różnić):

```sql
CREATE TYPE "public"."skill_tier" AS ENUM('basic', 'intermediate', 'advanced', 'expert');
ALTER TABLE "skills" ADD COLUMN "tier" "skill_tier" DEFAULT 'basic' NOT NULL;
```

**Bramka akceptacji:** w linii `ADD COLUMN` muszą wystąpić **i** `DEFAULT 'basic'`, **i** `NOT NULL`. To one backfillują istniejące wiersze — bez nich nie ma migracji danych.

Jeśli `DEFAULT` nie ma: **nie edytuj wygenerowanego pliku**. Utwórz kolejny plik migracji ręcznie w tym samym katalogu z `UPDATE "skills" SET "tier" = 'basic' WHERE "tier" IS NULL;` i zgłoś rozbieżność w handoffie.

- [ ] **Step 5: Zaktualizuj dokumentację**

W `app/lib/db/README.md` w opisie tabeli `skills` dopisz kolumnę:

```markdown
- `tier` (`skill_tier`: `basic`/`intermediate`/`advanced`/`expert`, NOT NULL, DEFAULT `basic`) — stopień trudności; steruje pasem piramidy w drzewie umiejętności. Migracja nadaje wszystkim istniejącym umiejętnościom `basic`.
```

Jeśli README ma sekcję z listą enumów — dopisz tam też `skill_tier`.

- [ ] **Step 6: Bramka zadania**

Run: `npm run typecheck`
Expected: brak błędów (kolumna z `.default()` nie łamie istniejących insertów — `NewSkill.tier` jest opcjonalne).

Run: `npm run lint`
Expected: brak błędów.

Przegląd: `superpowers:requesting-code-review`.

---

### Task 3: Układ piramidy

**Files:**
- Create: `app/lib/skill-pyramid.ts`
- Test: `app/lib/skill-pyramid.test.ts`
- Modify: `app/lib/README.md`

**Interfaces:**
- Consumes: `SKILL_TIERS`, `SkillTier` (Task 1); `Edge`, `orderWithinLayer` z `~/lib/skill-tree-math` (istnieją, bez zmian).
- Produces:
  - `interface PyramidNodeInput { id: string; name: string; tier: SkillTier }`
  - `interface PyramidBand { tier: SkillTier; rows: string[][] }`
  - `buildPyramid(nodes: PyramidNodeInput[], edges: Edge[]): PyramidBand[]`
  - `VIEW_W: 1000`, `interface PyramidMetrics { rowH; bandHeaderH; bandGap; insetStep; maxInsetFrac }`, `DEFAULT_METRICS`
  - `interface PyramidBandBox { tier: SkillTier; x0: number; x1: number; y: number; h: number }`
  - `interface PyramidLayout { totalH: number; boardCols: number; bands: PyramidBandBox[]; centers: Map<string, { x: number; y: number }> }`
  - `layoutPyramid(bands: PyramidBand[], m?: PyramidMetrics): PyramidLayout`

- [ ] **Step 1: Napisz failujący test**

Utwórz `app/lib/skill-pyramid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METRICS,
  VIEW_W,
  buildPyramid,
  layoutPyramid,
  type PyramidMetrics,
  type PyramidNodeInput,
} from "./skill-pyramid";
import type { Edge } from "./skill-tree-math";

const M: PyramidMetrics = {
  rowH: 100,
  bandHeaderH: 20,
  bandGap: 10,
  insetStep: 60,
  maxInsetFrac: 0.28,
};

function n(id: string, tier: PyramidNodeInput["tier"], name = id): PyramidNodeInput {
  return { id, name, tier };
}

describe("buildPyramid — pasy", () => {
  it("węzeł bez krawędzi trafia do pasa swojego tieru, podrząd 0", () => {
    const bands = buildPyramid([n("a", "advanced")], []);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.tier).toBe("advanced");
    expect(bands[0]!.rows).toEqual([["a"]]);
  });

  it("pomija puste pasy i zwraca je rosnąco od basic", () => {
    const bands = buildPyramid([n("x", "expert"), n("y", "basic")], []);
    expect(bands.map((b) => b.tier)).toEqual(["basic", "expert"]);
  });

  it("każdy niepusty tier dostaje własny pas", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    expect(bands.map((b) => b.tier)).toEqual(["basic", "intermediate", "advanced", "expert"]);
  });
});

describe("buildPyramid — podrzędy", () => {
  it("krawędź wewnątrz pasa tworzy podrząd (prereq niżej)", () => {
    const nodes = [n("dip", "intermediate", "Dip"), n("pull", "intermediate", "Pull-up")];
    const edges: Edge[] = [{ from: "dip", requires: "pull" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows).toEqual([["pull"], ["dip"]]);
  });

  it("łańcuch trzech w jednym pasie daje trzy podrzędy", () => {
    const nodes = [n("c", "basic"), n("b", "basic"), n("a", "basic")];
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "c", requires: "b" },
    ];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows).toEqual([["a"], ["b"], ["c"]]);
  });

  it("krawędź międzypasowa NIE tworzy podrzędu", () => {
    const nodes = [n("front", "advanced"), n("pull", "basic")];
    const edges: Edge[] = [{ from: "front", requires: "pull" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands.find((b) => b.tier === "basic")!.rows).toEqual([["pull"]]);
    expect(bands.find((b) => b.tier === "advanced")!.rows).toEqual([["front"]]);
  });

  it("krawędź odwrócona (prereq z wyższego tieru) nie wybucha i nie tworzy podrzędu", () => {
    const nodes = [n("push", "basic"), n("planche", "expert")];
    const edges: Edge[] = [{ from: "push", requires: "planche" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands.find((b) => b.tier === "basic")!.rows).toEqual([["push"]]);
    expect(bands.find((b) => b.tier === "expert")!.rows).toEqual([["planche"]]);
  });

  it("węzeł z dwoma prerekami w pasie bierze max głębokości", () => {
    const nodes = [n("a", "basic"), n("b", "basic"), n("d", "basic")];
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "d", requires: "a" },
      { from: "d", requires: "b" },
    ];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows[2]).toEqual(["d"]);
  });

  it("cykl wewnątrz pasa nie zapętla", () => {
    const nodes = [n("a", "basic"), n("b", "basic")];
    const edges: Edge[] = [
      { from: "a", requires: "b" },
      { from: "b", requires: "a" },
    ];
    expect(() => buildPyramid(nodes, edges)).not.toThrow();
  });

  it("krawędź do węzła spoza wejścia jest ignorowana", () => {
    const bands = buildPyramid([n("a", "basic")], [{ from: "a", requires: "nieistnieje" }]);
    expect(bands[0]!.rows).toEqual([["a"]]);
  });
});

describe("buildPyramid — kolejność", () => {
  it("sortuje rząd po nazwie z locale pl", () => {
    const nodes = [n("1", "basic", "Łokieć"), n("2", "basic", "Antagonista"), n("3", "basic", "Zwis")];
    expect(buildPyramid(nodes, [])[0]!.rows[0]).toEqual(["2", "1", "3"]);
  });

  it("jest deterministyczny — dwa wywołania dają ten sam wynik", () => {
    const nodes = [n("b", "basic", "Beta"), n("a", "basic", "Alfa")];
    expect(buildPyramid(nodes, [])).toEqual(buildPyramid(nodes, []));
  });
});

describe("layoutPyramid — wymiary", () => {
  it("pusta piramida ma zerową wysokość", () => {
    const l = layoutPyramid([], M);
    expect(l.totalH).toBe(0);
    expect(l.centers.size).toBe(0);
  });

  it("totalH = suma (nagłówek + rzędy) wszystkich pasów + odstępy między nimi", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "expert")], []);
    const l = layoutPyramid(bands, M);
    // dwa pasy po (20 + 1*100) + jeden odstęp 10
    expect(l.totalH).toBe(20 + 100 + 10 + 20 + 100);
  });

  it("pasy nie nachodzą na siebie i idą od góry w dół", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "intermediate"), n("c", "expert")], []);
    const l = layoutPyramid(bands, M);
    for (let i = 1; i < l.bands.length; i++) {
      expect(l.bands[i]!.y).toBeGreaterThanOrEqual(l.bands[i - 1]!.y + l.bands[i - 1]!.h);
    }
  });

  it("pasy zwracane są od najwyższego tieru (góra planszy) do najniższego", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "expert")], []);
    const l = layoutPyramid(bands, M);
    expect(l.bands.map((b) => b.tier)).toEqual(["expert", "basic"]);
  });

  it("płaska piramida: boardCols równa się liczbie węzłów w rzędzie", () => {
    // Jeden pas → zerowe zawężenie → plansza dokładnie tak szeroka jak rząd.
    const bands = buildPyramid([n("a", "basic"), n("b", "basic"), n("c", "basic")], []);
    expect(layoutPyramid(bands, M).boardCols).toBeCloseTo(3, 6);
  });

  it("boardCols nigdy nie jest mniejsze niż najszerszy rząd", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "basic"), n("c", "basic"), n("d", "expert")],
      [],
    );
    expect(layoutPyramid(bands, M).boardCols).toBeGreaterThanOrEqual(3);
  });
});

describe("layoutPyramid — zawężenie (sylwetka piramidy)", () => {
  it("wyższy pas jest węższy, gdy pasy mają tyle samo węzłów", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "intermediate")], []);
    const l = layoutPyramid(bands, M);
    const top = l.bands.find((b) => b.tier === "intermediate")!;
    const bottom = l.bands.find((b) => b.tier === "basic")!;
    expect(top.x1 - top.x0).toBeLessThan(bottom.x1 - bottom.x0);
  });

  it("najniższy pas zajmuje pełną szerokość", () => {
    const bands = buildPyramid([n("a", "basic")], []);
    const l = layoutPyramid(bands, M);
    expect(l.bands[0]!.x0).toBe(0);
    expect(l.bands[0]!.x1).toBe(VIEW_W);
  });

  it("zatłoczony górny pas poszerza planszę zamiast ściskać karty", () => {
    // Dół: 1 węzeł. Góra: 4 węzły w zawężonym pasie. Zawężenie ZOSTAJE
    // (sylwetka piramidy jest nienaruszalna), a koszt bierze na siebie
    // szerokość planszy — karta nigdy nie chudnie.
    const bands = buildPyramid(
      [n("d", "basic"), n("a", "expert"), n("b", "expert"), n("c", "expert")],
      [],
    );
    const l = layoutPyramid(bands, M);
    const top = l.bands.find((b) => b.tier === "expert")!;
    expect(top.x1 - top.x0).toBeLessThan(VIEW_W); // zawężenie nie zniknęło
    expect(l.boardCols).toBeGreaterThan(3); // plansza szersza niż 3 karty
  });

  it("zawężenie nie przekracza twardego limitu maxInsetFrac", () => {
    // Duży insetStep przy czterech pasach zwęziłby szczyt do paska —
    // limit musi to zatrzymać.
    const wide: PyramidMetrics = { ...M, insetStep: 400 };
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    const top = layoutPyramid(bands, wide).bands.find((b) => b.tier === "expert")!;
    expect(top.x1 - top.x0).toBeCloseTo(VIEW_W * (1 - 2 * wide.maxInsetFrac), 6);
  });

  it("pas nigdy nie ma ujemnej ani zerowej szerokości", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    for (const b of layoutPyramid(bands, M).bands) {
      expect(b.x1).toBeGreaterThan(b.x0);
    }
  });
});

describe("layoutPyramid — środki węzłów", () => {
  it("każdy węzeł dostaje środek", () => {
    const nodes = [n("a", "basic"), n("b", "intermediate"), n("c", "expert")];
    const l = layoutPyramid(buildPyramid(nodes, []), M);
    for (const node of nodes) expect(l.centers.get(node.id)).toBeDefined();
  });

  it("pojedynczy węzeł w rzędzie siedzi w środku swojego pasa", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic")], []), M);
    expect(l.centers.get("a")!.x).toBe(VIEW_W / 2);
  });

  it("węzły w rzędzie mają rosnące x i są symetryczne względem środka pasa", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic", "A"), n("b", "basic", "B")], []), M);
    const xa = l.centers.get("a")!.x;
    const xb = l.centers.get("b")!.x;
    expect(xa).toBeLessThan(xb);
    expect(xa + xb).toBeCloseTo(VIEW_W, 6);
  });

  it("podrząd 0 leży NIŻEJ (większe y) niż podrząd 1 w tym samym pasie", () => {
    const nodes = [n("dip", "basic", "Dip"), n("pull", "basic", "Pull-up")];
    const edges: Edge[] = [{ from: "dip", requires: "pull" }];
    const l = layoutPyramid(buildPyramid(nodes, edges), M);
    expect(l.centers.get("pull")!.y).toBeGreaterThan(l.centers.get("dip")!.y);
  });

  it("węzeł z wyższego tieru leży wyżej (mniejsze y) niż z niższego", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic"), n("z", "expert")], []), M);
    expect(l.centers.get("z")!.y).toBeLessThan(l.centers.get("a")!.y);
  });

  it("wszystkie środki mieszczą się w planszy", () => {
    const nodes = [n("a", "basic"), n("b", "intermediate"), n("c", "expert")];
    const l = layoutPyramid(buildPyramid(nodes, []), M);
    for (const c of l.centers.values()) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(VIEW_W);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(l.totalH);
    }
  });
});

describe("DEFAULT_METRICS", () => {
  it("ma dodatnie wymiary", () => {
    expect(DEFAULT_METRICS.rowH).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.bandHeaderH).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.insetStep).toBeGreaterThan(0);
  });
  it("maxInsetFrac trzyma pas z dala od zera szerokości", () => {
    // Przy 0.5 pas zwinąłby się do linii; poniżej 0.5 zawsze coś zostaje.
    expect(DEFAULT_METRICS.maxInsetFrac).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.maxInsetFrac).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Uruchom test — musi paść**

Run: `npx vitest run app/lib/skill-pyramid.test.ts`
Expected: FAIL — `Failed to resolve import "./skill-pyramid"`.

- [ ] **Step 3: Zaimplementuj moduł**

Utwórz `app/lib/skill-pyramid.ts`:

```ts
import { SKILL_TIERS, type SkillTier } from "~/lib/skill-tier";
import { orderWithinLayer, type Edge } from "~/lib/skill-tree-math";

/**
 * Układ piramidy umiejętności: przypisanie pasów/podrzędów + geometria planszy.
 * Wszystko czyste i deterministyczne — bez DOM, bez DB, bezpieczne w SSR.
 *
 * MODEL WSPÓŁRZĘDNYCH
 * -------------------
 * Oś X jest znormalizowana do 0..VIEW_W i rozciągana na szerokość planszy
 * (SVG z preserveAspectRatio="none", karty pozycjonowane w procentach).
 * Oś Y jest w PIKSELACH i mapuje się 1:1 — dzięki temu końce beziera zawsze
 * trafiają w środki kart, niezależnie od szerokości ekranu.
 */

export interface PyramidNodeInput {
  id: string;
  name: string;
  tier: SkillTier;
}

export interface PyramidBand {
  tier: SkillTier;
  /** Od dołu pasa: rows[0] = podrząd 0. Każdy rząd posortowany po nazwie (locale pl). */
  rows: string[][];
}

/** Mapa: węzeł → jego prereki leżące w TYM SAMYM pasie (tylko one tworzą podrzędy). */
function sameBandPrereqs(nodes: PyramidNodeInput[], edges: Edge[]): Map<string, string[]> {
  const tierById = new Map(nodes.map((n) => [n.id, n.tier]));
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const fromTier = tierById.get(e.from);
    const reqTier = tierById.get(e.requires);
    // Krawędź dotykająca węzła spoza wejścia (np. zarchiwizowanego) — pomijamy.
    if (fromTier === undefined || reqTier === undefined) continue;
    // Międzypasowa (w tym odwrócona) — nie tworzy podrzędu, patrz spec §4.2.
    if (fromTier !== reqTier) continue;
    const arr = m.get(e.from) ?? [];
    arr.push(e.requires);
    m.set(e.from, arr);
  }
  return m;
}

/** Głębokość w obrębie pasa: bez prereków w pasie = 0, inaczej max(prereq) + 1. */
function subRowDepths(ids: string[], prereqs: Map<string, string[]>): Map<string, number> {
  const inScope = new Set(ids);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function d(id: string): number {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // guard na nieoczekiwany cykl
    visiting.add(id);
    let best = 0;
    for (const p of prereqs.get(id) ?? []) {
      if (!inScope.has(p)) continue;
      best = Math.max(best, d(p) + 1);
    }
    visiting.delete(id);
    depth.set(id, best);
    return best;
  }
  for (const id of ids) d(id);
  return depth;
}

/** Pasy piramidy — tylko niepuste, rosnąco od `basic`. */
export function buildPyramid(nodes: PyramidNodeInput[], edges: Edge[]): PyramidBand[] {
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  const prereqs = sameBandPrereqs(nodes, edges);

  const out: PyramidBand[] = [];
  for (const tier of SKILL_TIERS) {
    const ids = nodes.filter((n) => n.tier === tier).map((n) => n.id);
    if (ids.length === 0) continue; // pusty pas nie jest renderowany
    const depths = subRowDepths(ids, prereqs);
    const maxDepth = Math.max(...ids.map((id) => depths.get(id) ?? 0));
    const rows: string[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      rows.push(orderWithinLayer(ids.filter((id) => (depths.get(id) ?? 0) === d), nameById));
    }
    out.push({ tier, rows });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export const VIEW_W = 1000;

export interface PyramidMetrics {
  /** Wysokość jednego rzędu wizualnego, px. */
  rowH: number;
  /** Wysokość paska z nazwą tieru i licznikiem, px. */
  bandHeaderH: number;
  /** Odstęp między płytami pasów, px. */
  bandGap: number;
  /** Zawężenie pasa na stronę, w jednostkach VIEW_W, na każdy pas w górę. */
  insetStep: number;
  /**
   * Twardy limit zawężenia na stronę, jako ułamek VIEW_W. Bez niego wysoka
   * piramida zwinęłaby szczyt do paska. Musi być < 0.5.
   */
  maxInsetFrac: number;
}

export const DEFAULT_METRICS: PyramidMetrics = {
  rowH: 118,
  bandHeaderH: 30,
  bandGap: 14,
  insetStep: 64,
  maxInsetFrac: 0.28,
};

export interface PyramidBandBox {
  tier: SkillTier;
  /** Lewa/prawa krawędź płyty w jednostkach VIEW_W. */
  x0: number;
  x1: number;
  /** Górna krawędź płyty i jej wysokość, px. */
  y: number;
  h: number;
}

export interface PyramidLayout {
  totalH: number;
  /**
   * Ile szerokości karty musi mieć plansza, żeby ŻADEN pas nie ściskał swoich kart
   * poniżej pełnej szerokości — liczba zmiennoprzecinkowa. CSS używa jej jako
   * `calc(var(--pyramid-col) * boardCols)`.
   */
  boardCols: number;
  /** Od góry planszy (najwyższy tier) w dół. */
  bands: PyramidBandBox[];
  /** x w jednostkach VIEW_W, y w px. */
  centers: Map<string, { x: number; y: number }>;
}

/**
 * KLUCZOWA ZASADA: zawężenie pasów jest nienaruszalne — sylwetka piramidy to
 * cały sens tego widoku. Gdy przez zawężenie kolumny w wyższym pasie zrobiłoby
 * się ciasno, koszt bierze na siebie SZEROKOŚĆ PLANSZY (`boardCols`), a nie
 * szerokość karty. Wcześniejsza wersja robiła odwrotnie — przycinała zawężenie —
 * przez co piramida z jednym węzłem na pas spłaszczała się w prostokąt.
 */
export function layoutPyramid(
  bands: PyramidBand[],
  m: PyramidMetrics = DEFAULT_METRICS,
): PyramidLayout {
  const insetCap = m.maxInsetFrac * VIEW_W;
  const boxes: PyramidBandBox[] = [];
  const centers = new Map<string, { x: number; y: number }>();
  let y = 0;
  let boardCols = 1;

  // `bands` rośnie od basic, więc iteracja od końca idzie od góry planszy w dół,
  // a indeks `i` jest jednocześnie numerem pasa liczonym OD DOŁU (steruje zawężeniem).
  for (let i = bands.length - 1; i >= 0; i--) {
    const band = bands[i]!;
    const inset = Math.min(i * m.insetStep, insetCap);
    const x0 = inset;
    const x1 = VIEW_W - inset;
    const span = x1 - x0;
    const widestInBand = Math.max(1, ...band.rows.map((r) => r.length));
    // Ten pas mieści `widestInBand` kolumn na `span` jednostkach zamiast na
    // pełnych VIEW_W — więc żąda od planszy odpowiednio większej szerokości.
    boardCols = Math.max(boardCols, (widestInBand * VIEW_W) / span);

    const h = m.bandHeaderH + band.rows.length * m.rowH;
    boxes.push({ tier: band.tier, x0, x1, y, h });

    // Podrząd 0 na dole pasa → iterujemy rzędy od końca (najwyższy podrząd u góry).
    for (let r = 0; r < band.rows.length; r++) {
      const row = band.rows[band.rows.length - 1 - r]!;
      const rowCenterY = y + m.bandHeaderH + r * m.rowH + m.rowH / 2;
      row.forEach((id, j) => {
        centers.set(id, {
          x: x0 + ((j + 0.5) / row.length) * span,
          y: rowCenterY,
        });
      });
    }

    y += h + m.bandGap;
  }

  return { totalH: Math.max(0, y - m.bandGap), boardCols, bands: boxes, centers };
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npx vitest run app/lib/skill-pyramid.test.ts`
Expected: PASS — wszystkie testy zielone.

- [ ] **Step 5: Uruchom cały pakiet jednostkowy (regresja)**

Run: `npx vitest run app`
Expected: PASS — w tym istniejące `skill-tree-math.test.ts` i `skill-progression-math.test.ts`.

- [ ] **Step 6: Zaktualizuj dokumentację**

W `app/lib/README.md` dopisz wiersz:

```markdown
| `skill-pyramid.ts` | Układ piramidy umiejętności: `buildPyramid` (pas = tier, podrzędy z krawędzi wewnątrz pasa) i `layoutPyramid` (geometria planszy: zawężenie pasów, środki węzłów, wysokość). Czysta logika, bez DOM/DB — SSR-clean. |
```

- [ ] **Step 7: Bramka zadania**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów.

Przegląd: `superpowers:requesting-code-review`.

> **Po wykonaniu — rozbieżność plan↔kod.** Recenzja tego zadania dołożyła sześć
> poprawek, których powyższy kod nie zawiera: filtr pustych podrzędów po guardzie
> antycyklowym, `.sort()` na `ids` domykający determinizm przy równych nazwach,
> wzmocniony test cyklu, literał zamiast wzoru w teście limitu, test determinizmu
> na permutacji wejścia oraz test pustego środkowego tieru. **Źródłem prawdy są
> pliki `app/lib/skill-pyramid.ts` i `app/lib/skill-pyramid.test.ts`, nie ten
> blok kodu.**

---

### Task 4: Repo — tier w odczycie/zapisie i walidacja prerekwizytu

**Files:**
- Modify: `app/lib/skill-types.ts`
- Modify: `app/lib/skills.ts`
- Create: `tests/skill-tier.itest.ts`
- Modify: `app/lib/README.md`, `tests/README.md`

**Interfaces:**
- Consumes: `SkillTier`, `SKILL_TIERS`, `TIER_LABEL`, `canBePrerequisite` (Task 1); `schema.skills.tier` (Task 2).
- Produces:
  - `SkillListRow` + `tier: SkillTier`
  - `SkillDetail` + `tier: SkillTier`
  - `createSkill(db, trainerId, name, description, tier: SkillTier): Promise<schema.Skill>`
  - `updateSkill(db, trainerId, skillId, name, description, tier: SkillTier): Promise<void>`
  - `listPrerequisitesForSkill(...): Promise<Array<{ id: string; name: string; tier: SkillTier }>>`
  - `listAssignablePrerequisites(...): Promise<Array<{ id: string; name: string; tier: SkillTier }>>`
  - `listConflictingPrerequisites(db, trainerId, skillId): Promise<Array<{ id: string; name: string; tier: SkillTier }>>`
  - `SkillFormSchema` z polem `tier`

- [ ] **Step 1: Dodaj `tier` do schematu formularza**

W `app/lib/skill-types.ts` dopisz import i pole:

```ts
import { z } from "zod";
import { SKILL_TIERS } from "~/lib/skill-tier";
```

```ts
export const SkillFormSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  description: z.string().max(2000).default(""),
  tier: z.enum(SKILL_TIERS).default("basic"),
});
```

- [ ] **Step 2: Rozszerz odczyty w `app/lib/skills.ts`**

Dopisz import na górze pliku:

```ts
import { TIER_LABEL, canBePrerequisite, type SkillTier } from "~/lib/skill-tier";
```

W `SkillListRow` dodaj `tier: SkillTier;` i dołóż kolumnę do selecta w `listSkillsForTrainer`:

```ts
      tier: schema.skills.tier,
```

W `SkillDetail` dodaj `tier: SkillTier;`, a w `getSkillWithVariations` zwróć je w obiekcie wynikowym:

```ts
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tier: skill.tier,
    variations,
  };
```

W `listPrerequisitesForSkill` dodaj `tier` do selecta i do typu zwrotnego:

```ts
export async function listPrerequisitesForSkill(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string; tier: SkillTier }>> {
  return await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      tier: schema.skills.tier,
    })
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
```

- [ ] **Step 3: Przyjmij `tier` w zapisach**

W `app/lib/skills.ts` zmień sygnatury:

```ts
export async function createSkill(
  db: Db,
  trainerId: string,
  name: string,
  description: string,
  tier: SkillTier,
): Promise<schema.Skill> {
  try {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId, name, description, tier })
      .returning();
    return row!;
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function updateSkill(
  db: Db,
  trainerId: string,
  skillId: string,
  name: string,
  description: string,
  tier: SkillTier,
): Promise<void> {
  try {
    await db
      .update(schema.skills)
      .set({ name, description, tier })
      .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)));
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}
```

**Uwaga:** `updateSkill` celowo **nie** waliduje kolizji tieru z istniejącymi krawędziami — zmiana tieru zawsze przechodzi (spec §6.2). Ostrzeżenie pokazuje edytor (Task 6).

- [ ] **Step 4: Zastąp `bothSkillsOwned` wersją zwracającą tiery**

W `app/lib/skills.ts` **usuń** całą funkcję `bothSkillsOwned` i wstaw w jej miejsce:

```ts
interface OwnedSkillRow {
  id: string;
  name: string;
  tier: SkillTier;
}

/**
 * Zwraca obie umiejętności, gdy OBIE należą do trenera i są aktywne; inaczej null.
 * Musi być wołane PRZED porównaniem tierów — inaczej komunikat błędu zdradzałby
 * tier cudzej umiejętności.
 */
async function loadPairForPrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<{ skill: OwnedSkillRow; requires: OwnedSkillRow } | null> {
  const rows = await db
    .select({ id: schema.skills.id, name: schema.skills.name, tier: schema.skills.tier })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.trainerId, trainerId),
        isNull(schema.skills.archivedAt),
        inArray(schema.skills.id, [skillId, requiresSkillId]),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const skill = byId.get(skillId);
  const requires = byId.get(requiresSkillId);
  if (!skill || !requires) return null;
  return { skill, requires };
}
```

- [ ] **Step 5: Dołóż twardą walidację do `addPrerequisite`**

Zastąp ciało `addPrerequisite` w `app/lib/skills.ts`:

```ts
/** Dodaje krawędź „skillId wymaga requiresSkillId". Odrzuca obce, samopętlę, wyższy tier, cykl, duplikat. */
export async function addPrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  if (skillId === requiresSkillId) {
    throw new SkillError("self loop", "Umiejętność nie może wymagać samej siebie.");
  }
  const pair = await loadPairForPrerequisite(db, trainerId, skillId, requiresSkillId);
  if (!pair) {
    throw new SkillError("not found", "Nie znaleziono umiejętności.");
  }
  // Reguła piramidy: prerekwizyt nie może być trudniejszy od tego, co odblokowuje.
  if (!canBePrerequisite(pair.requires.tier, pair.skill.tier)) {
    throw new SkillError(
      "tier order",
      `Prerekwizyt nie może być trudniejszy od umiejętności, która go wymaga: „${pair.requires.name}” to ${TIER_LABEL[pair.requires.tier].toUpperCase()}, a „${pair.skill.name}” to ${TIER_LABEL[pair.skill.tier].toUpperCase()}.`,
    );
  }
  const edges = await listEdgesForTrainer(db, trainerId);
  if (wouldCreateCycle(edges, skillId, requiresSkillId)) {
    throw new SkillError("cycle", "To połączenie utworzyłoby cykl w drzewie.");
  }
  try {
    await db.insert(schema.skillPrerequisites).values({ trainerId, skillId, requiresSkillId });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_prerequisites_edge_uniq")) {
      throw new SkillError("duplicate", "Ten prerekwizyt jest już dodany.");
    }
    throw e;
  }
}
```

- [ ] **Step 6: Odfiltruj kandydatów z wyższego tieru w pickerze**

Zastąp `listAssignablePrerequisites` w `app/lib/skills.ts`:

```ts
/**
 * Umiejętności trenera, które MOŻNA dodać jako prereq danej: bez siebie, bez już
 * dodanych, bez wyższego tieru i bez tych, które domknęłyby cykl. Aktywne.
 * Picker musi zgadzać się z walidacją w `addPrerequisite` — inaczej UI proponuje
 * coś, co akcja odrzuci.
 */
export async function listAssignablePrerequisites(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string; tier: SkillTier }>> {
  const all = await db
    .select({ id: schema.skills.id, name: schema.skills.name, tier: schema.skills.tier })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .orderBy(asc(schema.skills.name));
  const self = all.find((s) => s.id === skillId);
  // Nie nasza / zarchiwizowana umiejętność — nie proponujemy niczego.
  if (!self) return [];
  const edges = await listEdgesForTrainer(db, trainerId);
  const existing = new Set(edges.filter((e) => e.from === skillId).map((e) => e.requires));
  return all.filter(
    (s) =>
      s.id !== skillId &&
      !existing.has(s.id) &&
      canBePrerequisite(s.tier, self.tier) &&
      !wouldCreateCycle(edges, skillId, s.id),
  );
}
```

- [ ] **Step 7: Dodaj wykrywanie kolizji po zmianie tieru**

Dopisz na końcu `app/lib/skills.ts`:

```ts
/**
 * Prereki danej umiejętności o WYŻSZYM tierze. Niemożliwe do utworzenia przez
 * `addPrerequisite`, ale osiągalne przez późniejszą zmianę tieru (spec §6.2) —
 * edytor pokazuje je jako ostrzeżenie, drzewo rysuje wyróżnionym stylem.
 */
export async function listConflictingPrerequisites(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string; tier: SkillTier }>> {
  const [skill] = await db
    .select({ tier: schema.skills.tier })
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) return [];
  const prereqs = await listPrerequisitesForSkill(db, trainerId, skillId);
  return prereqs.filter((p) => !canBePrerequisite(p.tier, skill.tier));
}
```

- [ ] **Step 8: Napraw wołających `createSkill`/`updateSkill`**

Run: `npm run typecheck`
Expected: FAIL — brakujący argument w `app/routes/trener/umiejetnosci.nowa.tsx` i `app/routes/trener/umiejetnosci.$skillId.tsx` oraz w `tests/skills.itest.ts` / `tests/skill-tree.itest.ts` / `tests/rozwoj.itest.ts`.

W obu trasach przekaż `parsed.data.tier` jako ostatni argument (pełne UI dochodzi w Task 6):

```ts
    const skill = await createSkill(
      db,
      user.id,
      parsed.data.name,
      parsed.data.description,
      parsed.data.tier,
    );
```

```ts
      await updateSkill(
        db,
        user.id,
        skillId,
        parsed.data.name,
        parsed.data.description,
        parsed.data.tier,
      );
```

W plikach `tests/*.itest.ts` znajdź przez Grep wszystkie wywołania `createSkill(` i dopisz piąty argument `"basic"`. Nie zmieniaj niczego innego w tych testach.

- [ ] **Step 9: Napisz test integracyjny (NIE uruchamiaj — Docker)**

Utwórz `tests/skill-tier.itest.ts`:

```ts
// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  SkillError,
  addPrerequisite,
  createSkill,
  getSkillWithVariations,
  listAssignablePrerequisites,
  listConflictingPrerequisites,
  updateSkill,
} from "~/lib/skills";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@skill-tier.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@skill-tier.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("zapis i odczyt tieru", () => {
  it("createSkill zapisuje podany tier", async () => {
    const s = await createSkill(db, trainerA, "Planche tier", "", "expert");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("expert");
  });

  it("updateSkill zmienia tier", async () => {
    const s = await createSkill(db, trainerA, "Dip tier", "", "basic");
    await updateSkill(db, trainerA, s.id, "Dip tier", "", "advanced");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("advanced");
  });

  it("kolumna ma DEFAULT 'basic' — insert bez tieru daje basic", async () => {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId: trainerA, name: "Bez tieru", description: "" })
      .returning({ id: schema.skills.id, tier: schema.skills.tier });
    expect(row!.tier).toBe("basic");
    await db.delete(schema.skills).where(eq(schema.skills.id, row!.id));
  });

  it("tenant-scope: trener B nie odczyta umiejętności trenera A", async () => {
    const s = await createSkill(db, trainerA, "Tenant tier skill", "", "advanced");
    expect(await getSkillWithVariations(db, trainerB, s.id)).toBeNull();
  });

  it("tenant-scope: updateSkill trenera B nie zmienia tieru umiejętności trenera A", async () => {
    const s = await createSkill(db, trainerA, "Tenant tier skill 2", "", "basic");
    await updateSkill(db, trainerB, s.id, "Przejęte", "", "expert");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("basic");
    expect(detail?.name).toBe("Tenant tier skill 2");
  });
});

describe("walidacja prerekwizytu wg tieru", () => {
  it("odrzuca prereq z WYŻSZEGO tieru", async () => {
    const low = await createSkill(db, trainerA, "Push-up reguła", "", "basic");
    const high = await createSkill(db, trainerA, "Planche reguła", "", "expert");
    await expect(addPrerequisite(db, trainerA, low.id, high.id)).rejects.toThrow(SkillError);
    await expect(addPrerequisite(db, trainerA, low.id, high.id)).rejects.toMatchObject({
      message: "tier order",
    });
  });

  it("przyjmuje prereq z NIŻSZEGO tieru", async () => {
    const base = await createSkill(db, trainerA, "Pull-up niższy", "", "basic");
    const top = await createSkill(db, trainerA, "Front Lever wyższy", "", "advanced");
    await expect(addPrerequisite(db, trainerA, top.id, base.id)).resolves.toBeUndefined();
  });

  it("przyjmuje prereq z RÓWNEGO tieru (podrzędy w pasie)", async () => {
    const a = await createSkill(db, trainerA, "Równy A", "", "intermediate");
    const b = await createSkill(db, trainerA, "Równy B", "", "intermediate");
    await expect(addPrerequisite(db, trainerA, a.id, b.id)).resolves.toBeUndefined();
  });

  it("listAssignablePrerequisites nie proponuje kandydata z wyższego tieru", async () => {
    const low = await createSkill(db, trainerA, "Picker niski", "", "basic");
    const high = await createSkill(db, trainerA, "Picker wysoki", "", "expert");
    const options = await listAssignablePrerequisites(db, trainerA, low.id);
    expect(options.some((o) => o.id === high.id)).toBe(false);
  });

  it("listAssignablePrerequisites dla obcej umiejętności zwraca pustą listę", async () => {
    const s = await createSkill(db, trainerA, "Picker obcy", "", "basic");
    expect(await listAssignablePrerequisites(db, trainerB, s.id)).toEqual([]);
  });
});

describe("kolizja po zmianie tieru", () => {
  it("podniesienie tieru prereka zostawia krawędź i raportuje kolizję", async () => {
    const base = await createSkill(db, trainerA, "Kolizja baza", "", "basic");
    const top = await createSkill(db, trainerA, "Kolizja szczyt", "", "advanced");
    await addPrerequisite(db, trainerA, top.id, base.id);

    // Bez kolizji na starcie.
    expect(await listConflictingPrerequisites(db, trainerA, top.id)).toEqual([]);

    // Prereq staje się trudniejszy niż to, co odblokowuje — zmiana MUSI przejść.
    await updateSkill(db, trainerA, base.id, "Kolizja baza", "", "expert");

    const conflicts = await listConflictingPrerequisites(db, trainerA, top.id);
    expect(conflicts.map((c) => c.id)).toEqual([base.id]);
  });

  it("tenant-scope: listConflictingPrerequisites trenera B zwraca pustą listę", async () => {
    const s = await createSkill(db, trainerA, "Kolizja tenant", "", "basic");
    expect(await listConflictingPrerequisites(db, trainerB, s.id)).toEqual([]);
  });
});
```

- [ ] **Step 10: Zaktualizuj dokumentację**

W `app/lib/README.md` w wierszu `skills.ts` dopisz do opisu: `listConflictingPrerequisites` (prereki z wyższego tieru), walidację tieru w `addPrerequisite`, `tier` w `createSkill`/`updateSkill` i w odczytach.

W `tests/README.md` dodaj wiersz do tabeli:

```markdown
| `skill-tier.itest.ts` | Tier umiejętności (`app/lib/skills.ts`): zapis/odczyt tieru, `DEFAULT 'basic'` z migracji, tenant-scope (obcy trener nie odczyta ani nie nadpisze), twarda walidacja „prereq nie z wyższego tieru" w `addPrerequisite` (równy i niższy przechodzą), filtr pickera `listAssignablePrerequisites`, oraz kolizja po zmianie tieru — `updateSkill` przechodzi, a `listConflictingPrerequisites` ją raportuje. |
```

- [ ] **Step 11: Bramka zadania**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów.

Run: `npx vitest run app`
Expected: PASS (testy jednostkowe bez regresji).

**Nie uruchamiaj** `npm run test:itest` — zgłoś właścicielowi w handoffie.

Przegląd: `superpowers:requesting-code-review`.

---

### Task 5: Tier w drzewie i mapie umiejętności

**Files:**
- Modify: `app/lib/skill-tree.ts`
- Modify: `app/lib/skill-progression.ts`
- Modify: `app/lib/README.md`

**Interfaces:**
- Consumes: `SkillTier` (Task 1), `listSkillsForTrainer` z `tier` (Task 4).
- Produces: `TreeNode` z polem `tier: SkillTier` (pola `layer` i `orderInLayer` **zostają na razie**, żeby komponent dalej się kompilował — usuwa je Task 7); `SkillMapEntry` z polem `tier: SkillTier`.

- [ ] **Step 1: Dodaj `tier` do `TreeNode`**

W `app/lib/skill-tree.ts` dopisz import:

```ts
import type { SkillTier } from "~/lib/skill-tier";
```

W interfejsie `TreeNode` dodaj pole:

```ts
  tier: SkillTier;
```

- [ ] **Step 2: Przenieś `tier` przez `loadGraph`**

W `app/lib/skill-tree.ts` zmień typ i mapowanie w `loadGraph`:

```ts
async function loadGraph(
  db: Db,
  trainerId: string,
): Promise<{
  skills: Array<{ id: string; name: string; tier: SkillTier; variationCount: number }>;
  edges: Edge[];
}> {
```

```ts
  return {
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      variationCount: s.variationCount,
    })),
    edges,
  };
```

Zmień też sygnaturę `layoutNodes`, żeby przyjmowała nowy kształt (ciało bez zmian — dalej używa `assignLayers`, bo `layer`/`orderInLayer` znikają dopiero w Task 7):

```ts
function layoutNodes(
  skills: Array<{ id: string; name: string; tier: SkillTier; variationCount: number }>,
  edges: Edge[],
): Map<string, { layer: number; orderInLayer: number }> {
```

- [ ] **Step 3: Wypełnij `tier` w obu konstruktorach drzewa**

W `getSkillTreeForTrainer` w obiekcie węzła dodaj `tier: s.tier,`.
W `getSkillTreeForTrainee` w obiekcie węzła również dodaj `tier: s.tier,`.

- [ ] **Step 4: Dodaj `tier` do mapy umiejętności**

W `app/lib/skill-progression.ts`:

Dopisz import:

```ts
import type { SkillTier } from "~/lib/skill-tier";
```

W `SkillMapEntry` dodaj pole:

```ts
  tier: SkillTier;
```

W `getSkillMapForTrainee` rozszerz select o kolumnę:

```ts
  const skills = await db
    .select({ id: schema.skills.id, name: schema.skills.name, tier: schema.skills.tier })
```

i w zwracanym obiekcie dopisz:

```ts
      tier: skill.tier,
```

- [ ] **Step 5: Weryfikacja**

Run: `npm run typecheck`
Expected: brak błędów — komponent dalej używa `layer`/`orderInLayer`, które nie zniknęły.

Run: `npm run lint`
Expected: brak błędów.

Run: `npx vitest run app`
Expected: PASS.

- [ ] **Step 6: Zaktualizuj dokumentację**

W `app/lib/README.md` w wierszach `skill-tree.ts` i `skill-progression.ts` dopisz, że `TreeNode` / `SkillMapEntry` niosą `tier`.

- [ ] **Step 7: Bramka zadania**

Przegląd: `superpowers:requesting-code-review`.

---

### Task 6: UI trenera — plakietka, select tieru, lista z sekcjami

**Files:**
- Create: `app/components/tier-badge.tsx`
- Modify: `app/routes/trener/umiejetnosci.nowa.tsx`
- Modify: `app/routes/trener/umiejetnosci.$skillId.tsx`
- Modify: `app/routes/trener/umiejetnosci._index.tsx`
- Modify: `app/components/README.md`, `app/routes/trener/README.md`

**Interfaces:**
- Consumes: `SKILL_TIERS`, `TIER_LABEL`, `SkillTier` (Task 1); `listConflictingPrerequisites`, `SkillListRow.tier`, `SkillDetail.tier` (Task 4); `parseListControls`, `ListControlsSpec` z `~/lib/list-params`; `<ListControls>` z `~/components/list-controls`.
- Produces: `<TierBadge tier={...} />`.

**Skill do użycia:** warstwę wizualną prowadź przez `frontend-design:frontend-design` (zmiana dotyka widoków i stylowania).

- [ ] **Step 1: Utwórz komponent plakietki**

Utwórz `app/components/tier-badge.tsx`:

```tsx
import { TIER_LABEL, type SkillTier } from "~/lib/skill-tier";

/**
 * Plakietka tieru — mono wersalik w idiomie `.badge` (klasa nadaje uppercase i mono).
 * Celowo BEZ koloru per tier: w piramidzie tier niesie ciężar, nie barwę, a lime
 * jest zarezerwowany dla postępu podopiecznego (design-system → „Piramida umiejętności").
 */
export function TierBadge({ tier }: { tier: SkillTier }): React.JSX.Element {
  return (
    <span className="badge" aria-label={`Poziom trudności: ${TIER_LABEL[tier]}`}>
      {TIER_LABEL[tier]}
    </span>
  );
}
```

- [ ] **Step 2: Dodaj select tieru do formularza nowej umiejętności**

W `app/routes/trener/umiejetnosci.nowa.tsx` dopisz import:

```ts
import { SKILL_TIERS, TIER_LABEL } from "~/lib/skill-tier";
```

W akcji przekaż `tier` do parsera. `fd.has` zamiast `?? "basic"` jest celowe:
gdy pole naprawdę nie przyszło, chcemy trafić w default schematu, a nie udawać,
że formularz przysłał `basic` — inaczej przyszły formularz bez tego pola po cichu
skasowałby tier umiejętności.

```ts
  const parsed = SkillFormSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    description: String(fd.get("description") ?? ""),
    tier: fd.has("tier") ? String(fd.get("tier")) : undefined,
  });
```

W formularzu, pod polem „Nazwa", dodaj:

```tsx
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Poziom trudności</span>
          <select name="tier" className="input" defaultValue="basic">
            {SKILL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="text-xs muted">
            Decyduje, na którym pasie piramidy stanie ta umiejętność. Zmienisz w każdej chwili.
          </span>
        </label>
```

- [ ] **Step 3: Dodaj select, plakietkę i ostrzeżenie do edytora**

W `app/routes/trener/umiejetnosci.$skillId.tsx`:

Dopisz importy:

```ts
import { TierBadge } from "~/components/tier-badge";
import { SKILL_TIERS, TIER_LABEL } from "~/lib/skill-tier";
```

oraz `listConflictingPrerequisites` do istniejącego importu z `~/lib/skills`.

W loaderze dołóż zapytanie do `Promise.all`:

```ts
  const [prerequisites, assignablePrereqs, conflicts] = await Promise.all([
    listPrerequisitesForSkill(db, user.id, skillId),
    listAssignablePrerequisites(db, user.id, skillId),
    listConflictingPrerequisites(db, user.id, skillId),
  ]);
  return { skill, assignable, prerequisites, assignablePrereqs, conflicts };
```

W akcji, w gałęzi `intent === "save"`, dopisz `tier` do parsera:

```ts
      const parsed = SkillFormSchema.safeParse({
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
        tier: fd.has("tier") ? String(fd.get("tier")) : undefined,
      });
```

**Dlaczego `<select name="tier">` w tym formularzu jest obowiązkowy, a nie kosmetyczny:**
`updateSkill` zapisuje `tier` bezwarunkowo. Dopóki formularz zapisu nie niesie tego
pola, każdy zapis nazwy lub opisu sprowadza tier z powrotem do `basic`. Select z
kroku niżej jest jedyną rzeczą, która to zamyka — nie wolno go pominąć ani odłożyć.

W komponencie odbierz `conflicts` z `useLoaderData`, a w okruszkach obok nazwy pokaż plakietkę:

```tsx
      <div className="crumbs">
        <Link to="/trener/umiejetnosci">Umiejętności</Link>
        <span className="sep">›</span>
        <span className="current">{skill.name}</span>
        <TierBadge tier={skill.tier} />
      </div>
```

W formularzu zapisu, pod polem „Nazwa", dodaj select z `defaultValue={skill.tier}`:

```tsx
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Poziom trudności</span>
          <select name="tier" className="input" defaultValue={skill.tier}>
            {SKILL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
```

W sekcji „Wymaga (prerekwizyty)", **nad** listą prereków, dodaj ostrzeżenie o kolizjach:

```tsx
        {conflicts.length > 0 && (
          <div className="alert alert-error" role="alert">
            {conflicts.length === 1
              ? "Jeden prerekwizyt jest trudniejszy od tej umiejętności:"
              : `${conflicts.length} prerekwizyty są trudniejsze od tej umiejętności:`}{" "}
            {conflicts.map((c) => `${c.name} (${TIER_LABEL[c.tier].toUpperCase()})`).join(", ")}.
            {" "}Podnieś tier tej umiejętności albo usuń te połączenia — w drzewie rysują się
            odwrotnie do kierunku piramidy.
          </div>
        )}
```

Przy każdym prereku na liście pokaż jego tier — zastąp zawartość wiersza:

```tsx
              <div key={p.id} className="card row between" style={{ padding: "10px 14px", gap: 10 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <TierBadge tier={p.tier} />
                </span>
```

(reszta wiersza — formularz usuwania — bez zmian).

- [ ] **Step 4: Przebuduj listę umiejętności na sekcje + filtr**

Zastąp `app/routes/trener/umiejetnosci._index.tsx` w całości:

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { TierBadge } from "~/components/tier-badge";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { SKILL_TIERS, TIER_LABEL, type SkillTier } from "~/lib/skill-tier";
import { listSkillsForTrainer } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const all = await listSkillsForTrainer(db, user.id);

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "name", label: "Nazwa" },
      { key: "variations", label: "Liczba wariantów" },
    ],
    defaultSort: "name",
    filterGroups: [
      {
        param: "tier",
        label: "Poziom trudności",
        options: [
          { value: "all", label: "Wszystkie" },
          ...SKILL_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })),
        ],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);

  const tier = controls.filters.tier ?? "all";
  const filtered = tier === "all" ? all : all.filter((s) => s.tier === tier);
  const sorted = [...filtered].sort((a, b) =>
    controls.sort === "variations"
      ? b.variationCount - a.variationCount || a.name.localeCompare(b.name, "pl")
      : a.name.localeCompare(b.name, "pl"),
  );

  // Sekcje od podstaw w górę — lista czyta się jak program, nie jak piramida.
  const sections = SKILL_TIERS.map((t) => ({
    tier: t,
    skills: sorted.filter((s) => s.tier === t),
  })).filter((s) => s.skills.length > 0);

  return { sections, total: all.length, shown: sorted.length, spec, controls };
}

export default function UmiejetnosciList() {
  const { sections, total, shown, spec, controls } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Umiejętności</h1>
          <div className="sub">
            {total === 0
              ? "Brak umiejętności."
              : shown === total
                ? `${total} umiejętności.`
                : `${shown} z ${total} umiejętności.`}
          </div>
        </div>
        <Link to="/trener/umiejetnosci/nowa" className="btn btn-primary">
          <Icons.Plus /> Nowa umiejętność
        </Link>
      </div>

      {total > 0 && <ListControls spec={spec} state={controls} />}

      {total === 0 ? (
        <div className="empty">
          <h3>Brak umiejętności</h3>
          <div>Utwórz pierwszą drabinę wariantów (np. Front Lever), by śledzić progresję.</div>
        </div>
      ) : sections.length === 0 ? (
        <div className="empty">
          <h3>Brak umiejętności na tym poziomie</h3>
          <div>Zmień filtr, by zobaczyć pozostałe.</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 26 }}>
          {sections.map((section) => (
            <TierSection key={section.tier} tier={section.tier} skills={section.skills} />
          ))}
        </div>
      )}
    </div>
  );
}

function TierSection({
  tier,
  skills,
}: {
  tier: SkillTier;
  skills: Array<{ id: string; name: string; description: string; variationCount: number }>;
}) {
  return (
    <section>
      <div
        className="row between"
        style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}
      >
        <h2 className="uppercase-label" style={{ margin: 0 }}>
          {TIER_LABEL[tier]}
        </h2>
        <span className="mono text-xs muted">{skills.length}</span>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
      >
        {skills.map((s) => (
          <Link
            key={s.id}
            to={`/trener/umiejetnosci/${s.id}`}
            className="card card-hover"
            style={{ padding: 14 }}
          >
            <h3 style={{ margin: 0 }}>{s.name}</h3>
            <div className="text-xs muted" style={{ marginTop: 8 }}>
              {s.variationCount} wariantów
            </div>
            {s.description && (
              <div className="text-sm muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
                {s.description}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
```

**Uwaga:** karta w sekcji nie powtarza plakietki tieru — nagłówek sekcji już go niesie. `TierBadge` na tej trasie jest importowany tylko wtedy, gdy faktycznie użyty; jeśli po implementacji okaże się nieużywany, **usuń import** (Biome zgłosi go jako błąd).

- [ ] **Step 5: Weryfikacja**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów. Jeśli zgłosi nieużywany import `TierBadge` w `umiejetnosci._index.tsx` — usuń go.

Run: `npx biome format --write app/routes/trener/umiejetnosci._index.tsx`
Expected: plik sformatowany.

- [ ] **Step 6: Zaktualizuj dokumentację**

W `app/components/README.md` dodaj wiersz:

```markdown
| `tier-badge.tsx` | `TierBadge` — plakietka poziomu trudności umiejętności w idiomie `.badge` (mono, wersalik). Bez koloru per tier. |
```

W `app/routes/trener/README.md` zaktualizuj opisy tras `umiejetnosci._index.tsx` (sekcje po tierze + filtr `<ListControls>`), `umiejetnosci.nowa.tsx` (wybór tieru) i `umiejetnosci.$skillId.tsx` (edycja tieru, plakietka, ostrzeżenie o prerekach z wyższego tieru).

- [ ] **Step 7: Bramka zadania**

Przegląd: `superpowers:requesting-code-review`.

---

### Task 7: Piramida — przebudowa `SkillTreeView`

**Files:**
- Modify: `app/components/skill-tree.tsx`
- Modify: `app/styles/tokens.css`
- Modify: `app/lib/skill-tree.ts`
- Modify: `app/routes/podopieczny/rozwoj._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx`
- Modify: `app/components/README.md`, `design-system/README.md`

**Interfaces:**
- Consumes: `buildPyramid`, `layoutPyramid`, `DEFAULT_METRICS`, `VIEW_W`, `PyramidBandBox` (Task 3); `TIER_LABEL`, `highestEarnedTier`, `SkillTier` (Task 1); `TreeNode.tier` (Task 5).
- Produces: `SkillTreeView({ tree, hrefForNode })` — **bez** propa `showStates`. `VariationLadder` zostaje bez zmian.

**Skill do użycia:** `frontend-design:frontend-design` prowadzi warstwę wizualną. Stałe wymiarowe (`DEFAULT_METRICS`, szerokości kart, wcięcia) wolno stroić — ale **tylko** przez wartości, nie przez zmianę modelu współrzędnych, i po zmianie `DEFAULT_METRICS` uruchom ponownie `npx vitest run app/lib/skill-pyramid.test.ts`.

- [ ] **Step 1: Dodaj style piramidy**

Na końcu `app/styles/tokens.css`, **przed** blokiem `@media (max-width: 880px)`, dopisz:

```css
/* ============== PIRAMIDA UMIEJĘTNOŚCI ============== */
/* Szerokość kolumny steruje min-width planszy — plansza przewija się w poziomie
   dopiero, gdy najszerszy rząd nie mieści się na ekranie. Wiedza o rozmiarze
   karty jest tu, nie w JS. */
:root {
  --pyramid-col: 132px;
  --pyramid-card-w: 116px;
}

.pyramid-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 4px;
}

.pyramid-board {
  position: relative;
  margin: 0 auto;
}

/* Płyta pasa — well z hairline'em; wcięcie liczy layoutPyramid. */
.pyramid-band {
  position: absolute;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}

.pyramid-band-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 14px 0;
}

.pyramid-node {
  position: absolute;
  transform: translate(-50%, -50%);
  width: var(--pyramid-card-w);
  padding: 10px 8px;
  text-align: center;
}

/* Tier = CIĘŻAR karty, nie kolor. Lime zostaje zarezerwowany dla postępu. */
.pyramid-node[data-tier="intermediate"] {
  border-color: var(--line-2);
}
.pyramid-node[data-tier="advanced"] {
  border-color: var(--line-2);
  border-width: 1.5px;
}
.pyramid-node[data-tier="expert"] {
  background: var(--ink);
  border-color: transparent;
  color: var(--bg);
}
/* Na atramentowej karcie tekst drugorzędny musi zejść z --muted (za słaby kontrast). */
.pyramid-node[data-tier="expert"] .pyramid-node-sub {
  color: var(--muted-2);
}

.pyramid-node-locked {
  opacity: 0.6;
}

/* Wejście: pasy wynurzają się od dołu do góry. Globalna reguła
   prefers-reduced-motion w tym pliku neutralizuje to automatycznie. */
@keyframes pyramid-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes pyramid-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Płyta nie ma własnego transformu, więc może się wynurzyć. */
.pyramid-band {
  animation: pyramid-rise 0.22s ease backwards;
  animation-delay: calc(var(--reveal, 0) * 40ms);
}

/* Karta ma translate(-50%,-50%), a SVG ma inset:0 — animacja transformu
   nadpisałaby jedno i drugie i rozjechałaby końce krawędzi względem kart.
   Dlatego tu animujemy WYŁĄCZNIE krycie. */
.pyramid-node,
.pyramid-edges {
  animation: pyramid-fade 0.22s ease backwards;
  animation-delay: calc(var(--reveal, 0) * 40ms);
}
```

W bloku `@media (max-width: 880px)` (ten sam plik) dopisz w środku:

```css
  :root {
    --pyramid-col: 104px;
    --pyramid-card-w: 92px;
  }
```

- [ ] **Step 2: Przepisz `SkillTreeView`**

W `app/components/skill-tree.tsx` zastąp **wszystko od początku pliku do końca funkcji `StateLegend`** (czyli cały blok `SkillTreeView` + `NodeCard` + `levelText` + `barFill` + `StatePill` + `StateLegend`, do komentarza `// VariationLadder`) poniższym kodem. **Sekcję `VariationLadder` zostaw nietkniętą.**

```tsx
import { Link } from "react-router";
import { Icons } from "~/components/icons";
import {
  DEFAULT_METRICS,
  VIEW_W,
  buildPyramid,
  layoutPyramid,
  type PyramidBandBox,
} from "~/lib/skill-pyramid";
import { TIER_LABEL, highestEarnedTier, type SkillTier } from "~/lib/skill-tier";
import type { SkillTree, TreeNode } from "~/lib/skill-tree";
import type { NodeState } from "~/lib/skill-tree-math";

// ============================================================
// SkillTreeView — piramida umiejętności. Fundament (PODSTAWOWY) na dole,
// EKSPERT na szczycie; każdy wyższy pas jest węższy.
//
// Dwa kodowania na jednej karcie, na różnych warstwach:
//   • TIER → ciężar karty (płaski well → hairline → 1.5px → inwersja atramentowa)
//   • STAN → akcent (kafel z inicjałem, linia poziomu, pasek postępu)
// Lime jest zarezerwowany dla postępu podopiecznego — nigdy nie oznacza tieru.
//
// Karta w piramidzie jest węższa niż w dawnym układzie warstwowym, więc pigułka
// stanu nad kartą znika: przy czterech kartach w rzędzie na telefonie napis
// „gotowe do startu" i tak by się nie zmieścił. Stan niesie kolor kafla, linia
// poziomu, pasek postępu i legenda pod planszą; pełną nazwę stanu dostaje
// czytnik ekranu przez aria-label.
//
// MODEL WSPÓŁRZĘDNYCH
// -------------------
// Geometrię liczy `layoutPyramid` (czysta funkcja, testowana jednostkowo):
// oś X w jednostkach 0..VIEW_W (rozciągana na szerokość planszy), oś Y w px 1:1.
// Karty pozycjonowane absolutnie w procentach X i pikselach Y; SVG krawędzi ma
// viewBox 0 0 VIEW_W totalH z preserveAspectRatio="none". Dzięki temu końce
// beziera trafiają w środki kart przy każdej szerokości — bez pomiaru DOM,
// bez useEffect, bezpiecznie w SSR.
// ============================================================

const STATE_LABEL: Record<NodeState, string> = {
  mastered: "opanowane",
  in_progress: "w toku",
  available: "gotowe do startu",
  locked: "zablokowane",
};

/** Token-based accent color for a node state (no hardcoded hex, no glow). */
function stateColor(state: NodeState): string {
  switch (state) {
    case "mastered":
      return "var(--ok)";
    case "in_progress":
      return "var(--accent)";
    case "available":
      return "var(--accent)";
    case "locked":
      return "var(--muted-2)";
  }
}

export function SkillTreeView({
  tree,
  hrefForNode,
}: {
  tree: SkillTree;
  /** Link docelowy drill-in (zależny od roli). */
  hrefForNode: (skillId: string) => string;
}): React.JSX.Element {
  if (tree.nodes.length === 0) {
    return (
      <div className="empty">
        <h3>Brak umiejętności w drzewie.</h3>
        <p className="muted text-sm" style={{ margin: 0 }}>
          Dodaj umiejętności i połącz je prerekwizytami, aby zobaczyć piramidę.
        </p>
      </div>
    );
  }

  const bands = buildPyramid(
    tree.nodes.map((n) => ({ id: n.skillId, name: n.name, tier: n.tier })),
    tree.edges,
  );
  const layout = layoutPyramid(bands, DEFAULT_METRICS);

  const nodeById = new Map(tree.nodes.map((n) => [n.skillId, n]));
  const stateById = new Map(tree.nodes.map((n) => [n.skillId, n.state ?? "locked"]));

  // Liczniki per pas — „4/6" na railu płyty.
  const countsByTier = new Map<SkillTier, { total: number; mastered: number }>();
  for (const n of tree.nodes) {
    const c = countsByTier.get(n.tier) ?? { total: 0, mastered: 0 };
    c.total += 1;
    if ((n.state ?? "locked") === "mastered") c.mastered += 1;
    countsByTier.set(n.tier, c);
  }

  // `layout.bands` idzie od góry planszy; opóźnienie animacji ma rosnąć OD DOŁU.
  const revealOf = (i: number) => layout.bands.length - 1 - i;

  return (
    <div className="col" style={{ gap: 18 }}>
      <PyramidProgress nodes={tree.nodes} />

      <div className="pyramid-scroll">
        <div
          className="pyramid-board"
          style={{
            height: layout.totalH,
            minWidth: `calc(var(--pyramid-col) * ${layout.boardCols})`,
          }}
        >
          {layout.bands.map((box, i) => (
            <BandPlate
              key={box.tier}
              box={box}
              counts={countsByTier.get(box.tier) ?? { total: 0, mastered: 0 }}
              reveal={revealOf(i)}
            />
          ))}

          <svg
            className="pyramid-edges"
            viewBox={`0 0 ${VIEW_W} ${layout.totalH}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Połączenia prerekwizytów między umiejętnościami"
            style={
              {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: layout.totalH,
                pointerEvents: "none",
                zIndex: 1,
                // Krawędzie pojawiają się po wszystkich pasach.
                "--reveal": layout.bands.length,
              } as React.CSSProperties
            }
          >
            {tree.edges.map((e) => {
              const from = layout.centers.get(e.from); // węzeł zależny (wyżej)
              const req = layout.centers.get(e.requires); // prerekwizyt (niżej)
              if (!from || !req) return null;

              // Krawędź odwrócona: prereq leży WYŻEJ na planszy (mniejsze y) niż to,
              // co odblokowuje. Wystarczy porównać y — w obrębie pasa podrząd liczy
              // się z tych samych krawędzi, więc fałszywy alarm jest niemożliwy.
              const reversed = req.y < from.y;

              const sourceMastered = stateById.get(e.requires) === "mastered";
              const bothMastered = sourceMastered && stateById.get(e.from) === "mastered";

              const midY = (req.y + from.y) / 2;
              const d = `M${req.x},${req.y} C${req.x},${midY} ${from.x},${midY} ${from.x},${from.y}`;

              const stroke = reversed
                ? "var(--warn)"
                : sourceMastered
                  ? "var(--ok)"
                  : "var(--line)";
              const dash = reversed ? "2 6" : sourceMastered ? undefined : "6 7";

              return (
                <path
                  key={`${e.from}->${e.requires}`}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={bothMastered ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  opacity={bothMastered ? 1 : sourceMastered ? 0.85 : 0.7}
                />
              );
            })}
          </svg>

          {[...layout.centers].map(([skillId, c]) => {
            const node = nodeById.get(skillId);
            if (!node) return null;
            const bandIndex = layout.bands.findIndex((b) => b.tier === node.tier);
            return (
              <NodeCard
                key={skillId}
                node={node}
                href={hrefForNode(skillId)}
                x={c.x}
                y={c.y}
                reveal={revealOf(bandIndex < 0 ? 0 : bandIndex)}
              />
            );
          })}
        </div>
      </div>

      <StateLegend />
    </div>
  );
}

// ============================================================
// PyramidProgress — nagłówek dumy: ile zdobyte, jak wysoko, ile w toku.
// ============================================================

function PyramidProgress({ nodes }: { nodes: TreeNode[] }) {
  const total = nodes.length;
  const mastered = nodes.filter((n) => (n.state ?? "locked") === "mastered").length;
  const inProgress = nodes.filter((n) => (n.state ?? "locked") === "in_progress").length;
  const top = highestEarnedTier(
    nodes.map((n) => ({ tier: n.tier, mastered: (n.state ?? "locked") === "mastered" })),
  );

  return (
    <div className="card row wrap" style={{ gap: 32, padding: 16 }}>
      <div className="stat">
        <div className="v mono">
          {mastered}/{total}
        </div>
        <div className="k">Opanowane</div>
      </div>
      <div className="stat">
        <div className="v" style={{ fontSize: 18, lineHeight: 1.4 }}>
          {top === null ? "—" : TIER_LABEL[top]}
        </div>
        <div className="k">Najwyższy zdobyty tier</div>
      </div>
      <div className="stat">
        <div className="v mono">{inProgress}</div>
        <div className="k">W toku</div>
      </div>
    </div>
  );
}

// ============================================================
// BandPlate — płyta jednego pasa: well + rail z nazwą tieru i licznikiem.
// ============================================================

function BandPlate({
  box,
  counts,
  reveal,
}: {
  box: PyramidBandBox;
  counts: { total: number; mastered: number };
  reveal: number;
}) {
  return (
    <div
      className="pyramid-band"
      style={
        {
          left: `${(box.x0 / VIEW_W) * 100}%`,
          width: `${((box.x1 - box.x0) / VIEW_W) * 100}%`,
          top: box.y,
          height: box.h,
          "--reveal": reveal,
        } as React.CSSProperties
      }
    >
      <div className="pyramid-band-head">
        <span className="uppercase-label">{TIER_LABEL[box.tier]}</span>
        <span className="mono text-xs muted">
          {counts.mastered}/{counts.total}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// NodeCard — jedna umiejętność, link do drabiny wariantów.
// ============================================================

function NodeCard({
  node,
  href,
  x,
  y,
  reveal,
}: {
  node: TreeNode;
  href: string;
  x: number;
  y: number;
  reveal: number;
}) {
  const state: NodeState = node.state ?? "locked";
  const color = stateColor(state);
  const isLocked = state === "locked";
  const isInProgress = state === "in_progress";
  const isExpert = node.tier === "expert";

  return (
    <Link
      to={href}
      data-tier={node.tier}
      className={`card card-hover pyramid-node${isLocked ? " pyramid-node-locked" : ""}`}
      style={
        {
          left: `${(x / VIEW_W) * 100}%`,
          top: y,
          zIndex: 2,
          "--reveal": reveal,
        } as React.CSSProperties
      }
      aria-label={`${node.name} — ${TIER_LABEL[node.tier]}, ${STATE_LABEL[state]}`}
    >
      {/* Kafel z inicjałem — bez emoji (reguła design-systemu). */}
      <div
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          margin: "0 auto 7px",
          borderRadius: "var(--radius)",
          display: "grid",
          placeItems: "center",
          background: isExpert ? "transparent" : "var(--surface-2)",
          border: `1px solid ${isLocked ? "var(--line)" : color}`,
          color: isLocked ? "var(--muted)" : color,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        {node.name.charAt(0).toUpperCase()}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 12.5,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {node.name}
      </div>

      <div className="mono pyramid-node-sub" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
        {levelText(node)}
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 5,
          borderRadius: "var(--radius-pill)",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          overflow: "hidden",
          marginTop: 7,
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: "var(--radius-pill)",
            width: barFill(state, node),
            background: isInProgress ? "var(--accent)" : color,
          }}
        />
      </div>
    </Link>
  );
}

/** Linia poziomu: "poziom n/m" albo status, gdy umiejętność nieprzypisana. */
function levelText(node: TreeNode): string {
  const state: NodeState = node.state ?? "locked";
  if (state === "available") return "gotowe";
  if (state === "locked") return "zablokowane";
  if (node.variationCount === 0) return "brak wariantów";
  return node.currentOrdinal != null
    ? `poziom ${node.currentOrdinal}/${node.variationCount}`
    : `${node.variationCount} poziomów`;
}

/** Wypełnienie paska wg stanu. mastered = pełny, available/locked = pusty. */
function barFill(state: NodeState, node: TreeNode): string {
  if (state === "mastered") return "100%";
  if (state === "in_progress") {
    if (node.currentOrdinal != null && node.variationCount > 0) {
      return `${Math.round((node.currentOrdinal / node.variationCount) * 100)}%`;
    }
    return "40%";
  }
  return "0%";
}

// ============================================================
// StateLegend — klucz kolorów stanu + legenda krawędzi.
// ============================================================

function StateLegend() {
  const items: NodeState[] = ["mastered", "in_progress", "available", "locked"];
  return (
    <div
      className="row wrap"
      style={{ gap: 16, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}
    >
      {items.map((state) => (
        <span key={state} className="row" style={{ gap: 6, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: stateColor(state),
            }}
          />
          <span>{STATE_LABEL[state]}</span>
        </span>
      ))}
      <span className="row" style={{ gap: 6, alignItems: "center" }}>
        <svg width={22} height={10} aria-hidden="true" style={{ display: "block" }}>
          <line x1={1} y1={5} x2={21} y2={5} stroke="var(--line)" strokeWidth={2} strokeDasharray="4 4" />
        </svg>
        <span>prowadzi do zablokowanej</span>
      </span>
    </div>
  );
}
```

**Uwaga:** `Icons` przestaje być używane w górnej części pliku, ale `VariationLadder` (niżej) dalej go potrzebuje — **nie usuwaj tego importu**.

- [ ] **Step 3: Usuń `showStates` z obu tras**

W `app/routes/podopieczny/rozwoj._index.tsx` i `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx` usuń linię `showStates` z użycia `<SkillTreeView …>`:

```tsx
      <SkillTreeView
        tree={tree}
        hrefForNode={(skillId) => `/podopieczny/rozwoj/umiejetnosc/${skillId}`}
      />
```

(analogicznie w trasie trenera, ze swoim `hrefForNode`).

- [ ] **Step 4: Usuń nieużywane pola układu z `TreeNode`**

W `app/lib/skill-tree.ts`:
- z interfejsu `TreeNode` usuń `layer: number;` i `orderInLayer: number;`,
- usuń całą funkcję `layoutNodes`,
- usuń import `assignLayers` i `orderWithinLayer` z `~/lib/skill-tree-math` (zostaw `nodeState`, `topoOrder`, typy `Edge`, `NodeState`),
- w `getSkillTreeForTrainer` i `getSkillTreeForTrainee` usuń wywołanie `const pos = layoutNodes(...)` oraz pola `layer:` i `orderInLayer:` z konstruowanych węzłów.

`getSkillTreeForTrainer` **zostaje** — używa go `tests/skill-tree.itest.ts` (6 asercji: autoring, tenant-scope, archiwizacja).

- [ ] **Step 5: Weryfikacja**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów.

Run: `npx vitest run app`
Expected: PASS.

Run: `npm run build`
Expected: build SSR + klient bez błędów.

- [ ] **Step 6: Zaktualizuj dokumentację**

W `app/components/README.md` przepisz opis `skill-tree.tsx`: piramida pasów tierów zamiast warstw, nagłówek postępu, brak propa `showStates`.

W `design-system/README.md` dodaj sekcję (po „Motifs to avoid"):

```markdown
### Piramida umiejętności (rozszerzenie systemu)

Drzewo umiejętności to jedyne miejsce, gdzie system dostaje własny, nazwany zestaw środków — bo to ekran, na który podopieczny patrzy, żeby zobaczyć swoje osiągnięcia. Rozszerzenie jest wąskie i obowiązuje wyłącznie tutaj:

- **Tier niesie ciężar, nie kolor.** Cztery poziomy trudności różnią się wypełnieniem i grubością karty: płaski well (podstawowy) → hairline → ramka 1.5px → **inwersja atramentowa** (`background: var(--ink)`, `color: var(--bg)`) na szczycie. To ten sam środek, co `.nav-item.active` i `.brand-mark`, więc dark mode odwraca się sam.
- **Lime pozostaje zarezerwowany dla postępu.** Akcent nigdy nie oznacza tieru — tylko stan podopiecznego (opanowane / w toku). Na atramentowej karcie eksperta lime ma najmocniejszy kontrast w całej aplikacji i to jest zamierzone.
- **Pasy jako płyty.** Każdy tier to well `--surface-2` z hairline'em, wcięty względem pasa pod sobą — sylwetka schodkowej piramidy powstaje z geometrii, nie z gradientu ani cienia.
- **Ruch przy wejściu.** Pasy wynurzają się od dołu do góry: `translateY(6px)` + fade, 0.22 s, 40 ms przesunięcia między pasami. Mieści się w rejestrze `slidein`/`rise`; globalna reguła `prefers-reduced-motion` neutralizuje to automatycznie.

Nadal obowiązuje reszta systemu: zero emoji, zero gradientów, zero glow, zero kolorowych cieni.
```

- [ ] **Step 7: Bramka zadania**

Przegląd: `superpowers:requesting-code-review`. Poproś o osobne spojrzenie na kontrast tekstu drugorzędnego na karcie eksperta w obu motywach.

---

### Task 8: Plakietka tieru na drill-inach

**Files:**
- Modify: `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx`
- Modify: `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`

**Interfaces:**
- Consumes: `<TierBadge>` (Task 6), `SkillMapEntry.tier` (Task 5).
- Produces: nic dla dalszych zadań.

- [ ] **Step 1: Dodaj plakietkę w drill-inie podopiecznego**

W `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx` dopisz import:

```ts
import { TierBadge } from "~/components/tier-badge";
```

W `pagehead` pod nagłówkiem zamień blok tytułu na:

```tsx
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <h1>{entry.skillName}</h1>
            <TierBadge tier={entry.tier} />
          </div>
          <div className="sub">Twoja pozycja na drabinie i wyniki bieżącego wariantu.</div>
        </div>
```

- [ ] **Step 2: Dodaj plakietkę w drill-inie trenera**

Otwórz `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` przez Read, znajdź `pagehead` z nazwą umiejętności i zastosuj ten sam wzorzec: import `TierBadge`, opakowanie `<h1>` w `<div className="row" style={{ gap: 10, alignItems: "center" }}>` z `<TierBadge tier={entry.tier} />` obok. Nie zmieniaj loadera — `getSkillMapForTrainee` już niesie `tier` (Task 5).

- [ ] **Step 3: Weryfikacja**

Run: `npm run typecheck`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów.

- [ ] **Step 4: Zaktualizuj dokumentację**

W `app/routes/podopieczny/README.md` i `app/routes/trener/README.md` dopisz w opisach tras drill-in, że pokazują plakietkę tieru; w opisach tras `rozwoj._index` — że drzewo jest piramidą pasów tierów z nagłówkiem postępu.

- [ ] **Step 5: Bramka zadania**

Przegląd: `superpowers:requesting-code-review`.

---

### Task 9: Bramki końcowe i handoff

**Files:** brak zmian kodu (chyba że bramki coś wykażą).

- [ ] **Step 1: Testy jednostkowe**

Run: `npx vitest run app`
Expected: PASS — wszystkie pliki `app/**/*.test.ts`, w tym nowe `skill-tier.test.ts` i `skill-pyramid.test.ts`.

- [ ] **Step 2: Typy**

Run: `npm run typecheck`
Expected: brak błędów.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: brak błędów.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build SSR + klient bez błędów.

- [ ] **Step 5: Przegląd całości diffu**

Uruchom `/code-review` na pełnym diffie feature'a.

- [ ] **Step 6: Przegląd bezpieczeństwa**

Zmiana dotyka `trainer_id` i autoryzacji odczytu/zapisu umiejętności → uruchom `/security-review`. Zwróć szczególną uwagę na: kolejność `loadPairForPrerequisite` przed porównaniem tierów (komunikat błędu nie może zdradzać tieru cudzej umiejętności) oraz na `listAssignablePrerequisites` zwracające `[]` dla obcej umiejętności.

- [ ] **Step 7: Handoff**

Wypisz właścicielowi (bez wykonywania czegokolwiek w gicie):
- podsumowanie zmiany i listę zmienionych/dodanych plików,
- **proponowany komunikat commita** (tekst),
- notatkę o migracji: `npm run db:migrate` wymagany; nowa kolumna `skills.tier` z `DEFAULT 'basic' NOT NULL` backfilluje istniejące wiersze,
- komendę do testów integracyjnych: `npm run test:itest` (Docker) — nowy `tests/skill-tier.itest.ts` plus regresja `tests/skills.itest.ts`, `tests/skill-tree.itest.ts`, `tests/rozwoj.itest.ts` (zmienione sygnatury `createSkill`),
- ścieżkę ręcznej weryfikacji: `/trener/umiejetnosci` (sekcje + filtr) → nowa umiejętność z tierem → edytor (zmiana tieru, próba dodania prereka z wyższego tieru) → `/podopieczny/rozwoj` (piramida, nagłówek, mobile ~375 px, dark mode, `prefers-reduced-motion`).

---

## Self-Review

**Pokrycie specu:**

| Sekcja specu | Zadanie |
|---|---|
| §3 Model danych | Task 2 |
| §4.1 `skill-tier.ts` | Task 1 |
| §4.2 `skill-pyramid.ts` | Task 3 |
| §4.3 `skill-tree-math.ts` bez zmian | — (jawnie nietykane) |
| §5.1 Nagłówek postępu | Task 7 (`PyramidProgress`) |
| §5.2 Geometria | Task 3 + Task 7 |
| §5.3 Pasy jako płyty | Task 7 |
| §5.4 Węzły i krawędzie | Task 7 |
| §5.5 Ruch i mobile | Task 7 (tokens.css) |
| §5.6 Plakietka tieru | Task 6 (komponent) + Task 8 (drill-iny) |
| §5.7 Usunięcie `showStates` | Task 7 |
| §6.1 Odczyt `tier` | Task 4 (skills.ts) + Task 5 (drzewo, mapa) |
| §6.2 Zapis i walidacja | Task 4 |
| §6.3 Trasy | Task 6, 7, 8 |
| §7 Autoryzacja | Task 4 (kolejność walidacji) + Task 9 (`/security-review`) |
| §8 Testy | Task 1, 3 (jednostkowe), Task 4 (itest) |
| §9 Dokumentacja | rozdzielona po zadaniach |

**Spójność typów:** `SkillTier` pochodzi wyłącznie z `~/lib/skill-tier` i jest tak importowany w `skills.ts`, `skill-tree.ts`, `skill-progression.ts`, `skill-pyramid.ts` i komponentach. `TreeNode.tier` (Task 5) jest konsumowane przez `buildPyramid` (Task 3) w Task 7 pod nazwą pola `tier` w `PyramidNodeInput`. `PyramidBandBox` z Task 3 jest importowany po nazwie w Task 7. `TierBadge` z Task 6 jest używany w Task 8.

**Kolejność bezpieczna:** Task 5 zostawia `layer`/`orderInLayer` w `TreeNode`, żeby stary komponent dalej się kompilował; usuwa je dopiero Task 7 razem z przepisaniem komponentu. Dzięki temu każde zadanie kończy się zielonym `npm run typecheck`.
