# Markowa baza ćwiczeń i umiejętności — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić markową (organizacyjną) bazę ćwiczeń i umiejętności widoczną dla każdego trenera, z mechaniką copy-on-write („Dostosuj") i swobodą dodawania własnych, bez naruszania tenant-scope i integralności historii.

**Architecture:** Każdy wiersz `exercises`/`skills` ma dokładnie jednego właściciela — markowego (`organization_id`, `trainer_id NULL`) albo trenerskiego (`trainer_id`). Fork klonuje markowy wiersz na własność trenera i nosi `origin_id`, dzięki czemu oryginał znika z widoku forkującego (zastąpiony klonem). Nowy moduł `app/lib/catalog.ts` (+ czysty `catalog-math.ts`) centralizuje „efektywny katalog trenera" i forki; istniejące repo (`skills.ts`, `skill-tree.ts`, trasa biblioteki) przełączają odczyt na ten katalog. Zapis pozostaje dozwolony tylko na wierszach trenerskich.

**Tech Stack:** React Router v7 (loadery/akcje, SSR), Drizzle ORM + Postgres 16, Zod, Vitest (jednostkowe), testcontainers (`*.itest.ts`, uruchamia właściciel), Biome.

**Źródło:** spec `docs/superpowers/specs/2026-06-07-markowa-baza-cwiczen-umiejetnosci-design.md`.

**Reguły-fundamenty (przez cały plan):** nigdy git/docker (handoff na końcu); npm; TDD dla logiki bez DB; review per task; tenant-scope (brak dostępu → 404); schemat = źródło prawdy → `db:generate` (właściciel w TTY), nigdy ręcznie `migrations/`; UI po polsku, brand `kalisthenos` małą literą; UI/UX przez `frontend-design:frontend-design`; dokumentacja = część „done". `db:generate`/`db:migrate`/`db:seed` i testy `*.itest.ts` uruchamia właściciel.

**Bramki po każdym tasku z kodem:** `npx vitest run <wzorzec>` (jednostkowe), `npm run typecheck`, `npm run lint`; `superpowers:requesting-code-review`. Bramki końcowe całości: `npm test` + `typecheck` + `lint` + `build` + `/code-review` + `/security-review` (tenant-scope/autoryzacja).

---

## Mapa plików

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `app/lib/db/schema.ts` | Własność org/trener + `origin_id` + CHECK-i, relaks unique | Modify |
| `app/lib/catalog-math.ts` | Czyste funkcje: suppression origin, guard „≤1 skill w widoku", plan klonowania drabiny | Create |
| `app/lib/catalog-math.test.ts` | Testy jednostkowe powyższego | Create |
| `app/lib/catalog.ts` | Efektywny katalog (exercises+skills), `forkExercise`, `forkSkill`, `promoteTrainerCatalogToBrand` | Create |
| `app/lib/authz.ts` | Odczyt markowych wierszy w obrębie organizacji | Modify |
| `app/lib/skills.ts` | Odczyt efektywny (`listSkillsForTrainer`, `getSkillWithVariations`, `listAssignableExercises`); guard wariantu | Modify |
| `app/lib/skill-tree.ts` | `loadGraph` na efektywnym zbiorze umiejętności + krawędziach | Modify |
| `app/routes/trener/biblioteka._index.tsx` | Lista efektywna + badge „Marka" | Modify |
| `app/routes/trener/biblioteka.$exerciseId.tsx` | Read-only markowego + akcja „Dostosuj" (fork) | Modify |
| `app/routes/trener/umiejetnosci._index.tsx` | Lista efektywna + badge „Marka" | Modify |
| `app/routes/trener/umiejetnosci.$skillId.tsx` | Read-only markowego + akcja „Dostosuj" (fork) | Modify |
| `scripts/seed.ts` | Promocja in-place biblioteki założyciela do marki | Modify |
| `tests/*.itest.ts` | Krytyczne przepływy tenant-scope/fork/promocja | Create (owner runs) |
| README-y + `CLAUDE.md` | Dokumentacja | Modify |

---

## FAZA 0 — Schemat i migracja

### Task 1: Zmiana własności w schemacie (`exercises`, `skills`, `skill_prerequisites`, relaks unique)

**Files:**
- Modify: `app/lib/db/schema.ts`

- [ ] **Step 1: Dodaj kolumny własności i pochodzenia + CHECK-i na `exercises`**

W definicji `exercises` (ok. linii 197–217) zmień `trainerId` na nullable i dołóż kolumny + CHECK-i. Docelowo blok wygląda tak:

```ts
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: wiersz jest albo markowy (organization_id) albo trenerski (trainer_id).
    trainerId: uuid("trainer_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    // Fork: wskazuje markowy oryginał, z którego sklonowano ten wiersz trenera.
    originId: uuid("origin_id").references((): AnyPgColumn => exercises.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    unit: exerciseUnit("unit").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    tracksRpe: boolean("tracks_rpe").notNull().default(true),
    demoFileId: uuid("demo_file_id").references(() => files.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trainerIdx: index("exercises_trainer_idx").on(t.trainerId),
    orgIdx: index("exercises_org_idx").on(t.organizationId),
    originIdx: index("exercises_origin_idx").on(t.originId),
    tagsGin: index("exercises_tags_gin").using("gin", t.tags),
    ownerCheck: check(
      "exercises_owner_check",
      sql`(${t.trainerId} IS NULL AND ${t.organizationId} IS NOT NULL) OR
          (${t.trainerId} IS NOT NULL AND ${t.organizationId} IS NULL)`,
    ),
    originCheck: check(
      "exercises_origin_check",
      sql`${t.originId} IS NULL OR ${t.trainerId} IS NOT NULL`,
    ),
  }),
);
```

- [ ] **Step 2: Analogiczne zmiany na `skills`**

W definicji `skills` (ok. 550–570): `trainerId` nullable, dołóż `organizationId`, `originId` (self-FK do `skills.id`), `orgIdx`, `originIdx`, `ownerCheck`, `originCheck` (identyczny wzorzec jak wyżej, z kolumnami `skills`). Zachowaj istniejący `trainerNameUniq` (partial po `archivedAt IS NULL`) i `trainerIdx`.

- [ ] **Step 3: Zmiany na `skill_prerequisites`**

W definicji `skillPrerequisites` (ok. 633–663): `trainerId` nullable, dołóż `organizationId` (FK restrict), oraz `ownerCheck` (wzorzec jw.). Zachowaj `edgeUniq`, indeksy, `noSelfLoop`.

- [ ] **Step 4: Usuń globalny `UNIQUE(exercise_id)` z `skill_variations`**

W definicji `skillVariations` (ok. 572–595) **usuń** klucz `exerciseUniq: uniqueIndex("skill_variations_exercise_uniq").on(t.exerciseId)`. Zachowaj `skillOrdinalUniq` i `skillExerciseUniq`. Dopisz komentarz, że reguła „ćwiczenie w ≤1 umiejętności w obrębie widoku trenera" jest egzekwowana w `skills.ts:addVariation` (precedens: acykliczność).

- [ ] **Step 5: Weryfikacja typów (bez DB)**

Run: `npm run typecheck`
Expected: PASS (zmiany typów `Exercise`/`Skill` propagują się; ewentualne błędy w `skills.ts`/trasach naprawiamy w kolejnych taskach — jeśli typecheck zgłasza je teraz, zanotuj i przejdź dalej; nie commitujemy połowicznie).

> **Uwaga:** ten task NIE generuje migracji w pętli. Generację (`npm run db:generate`, interaktywna — wybór „create column"/„drop not-null") i `db:migrate` wykonuje właściciel (patrz handoff). Plików w `migrations/` nie edytujemy.

**Plan testów:** brak jednostkowych (czysty DDL); pokrycie przez testy integracyjne w Task 4/8/13. **Reguły projektowe:** schemat = źródło prawdy; nie ruszać `migrations/`. **Krytyczny przepływ:** tak (tenant-scope) — testy integracyjne w kolejnych taskach.

---

## FAZA 1 — Ćwiczenia markowe (wdrażalne samodzielnie)

### Task 2: Czysta logika katalogu — `catalog-math.ts` (TDD)

**Files:**
- Create: `app/lib/catalog-math.ts`
- Test: `app/lib/catalog-math.test.ts`

- [ ] **Step 1: Napisz failujący test `suppressForkedOrigins`**

```ts
import { describe, expect, it } from "vitest";
import { suppressForkedOrigins } from "./catalog-math";

describe("suppressForkedOrigins", () => {
  it("ukrywa markowy oryginał, gdy trener ma jego fork", () => {
    const brand = [{ id: "b1" }, { id: "b2" }];
    const result = suppressForkedOrigins(brand, new Set(["b1"]));
    expect(result.map((r) => r.id)).toEqual(["b2"]);
  });

  it("zwraca wszystkie markowe, gdy brak forków", () => {
    const brand = [{ id: "b1" }, { id: "b2" }];
    expect(suppressForkedOrigins(brand, new Set()).map((r) => r.id)).toEqual(["b1", "b2"]);
  });
});
```

- [ ] **Step 2: Uruchom — ma failować**

Run: `npx vitest run app/lib/catalog-math.test.ts`
Expected: FAIL („suppressForkedOrigins is not a function").

- [ ] **Step 3: Implementuj**

```ts
/** Z markowych wierszy usuwa te, które dany trener już sforkował (po origin_id). */
export function suppressForkedOrigins<T extends { id: string }>(
  brandRows: T[],
  forkedOriginIds: Set<string>,
): T[] {
  return brandRows.filter((r) => !forkedOriginIds.has(r.id));
}

/** Czy ćwiczenie jest już wariantem JAKIEJŚ umiejętności w widoku (zbiór exerciseId wariantów widoku). */
export function exerciseAlreadyVariationInView(
  variationExerciseIdsInView: Set<string>,
  exerciseId: string,
): boolean {
  return variationExerciseIdsInView.has(exerciseId);
}

export interface CloneVariationInput {
  exerciseId: string;
  ordinal: number;
}
export interface ClonePrereqInput {
  skillId: string;
  requiresSkillId: string;
}
/**
 * Plan głębokiego klonu drabiny: przepisuje warianty (ten sam ordinal, to samo
 * exerciseId) i krawędzie prereq, podmieniając stare skillId klonowanego skilla na
 * nowe. Czysta transformacja — bez I/O.
 */
export function planSkillClone(
  newSkillId: string,
  originSkillId: string,
  variations: CloneVariationInput[],
  prereqEdges: ClonePrereqInput[],
): { variations: CloneVariationInput[]; prereqEdges: ClonePrereqInput[] } {
  const swap = (id: string) => (id === originSkillId ? newSkillId : id);
  return {
    variations: variations.map((v) => ({ exerciseId: v.exerciseId, ordinal: v.ordinal })),
    prereqEdges: prereqEdges.map((e) => ({
      skillId: swap(e.skillId),
      requiresSkillId: swap(e.requiresSkillId),
    })),
  };
}
```

- [ ] **Step 4: Dopisz testy `exerciseAlreadyVariationInView` i `planSkillClone`**

```ts
describe("exerciseAlreadyVariationInView", () => {
  it("wykrywa zajęte ćwiczenie", () => {
    expect(exerciseAlreadyVariationInView(new Set(["e1"]), "e1")).toBe(true);
    expect(exerciseAlreadyVariationInView(new Set(["e1"]), "e2")).toBe(false);
  });
});

describe("planSkillClone", () => {
  it("zachowuje ordinale i podmienia skillId krawędzi na nowy", () => {
    const out = planSkillClone(
      "new",
      "orig",
      [{ exerciseId: "e1", ordinal: 1 }, { exerciseId: "e2", ordinal: 2 }],
      [{ skillId: "orig", requiresSkillId: "p1" }],
    );
    expect(out.variations).toEqual([
      { exerciseId: "e1", ordinal: 1 },
      { exerciseId: "e2", ordinal: 2 },
    ]);
    expect(out.prereqEdges).toEqual([{ skillId: "new", requiresSkillId: "p1" }]);
  });
});
```

Dopisz brakujące importy do bloku `import { … } from "./catalog-math";`.

- [ ] **Step 5: Uruchom — ma przejść**

Run: `npx vitest run app/lib/catalog-math.test.ts`
Expected: PASS.

- [ ] **Step 6: Bramki + review**

Run: `npm run typecheck` (PASS), `npm run lint` (PASS). Następnie `superpowers:requesting-code-review`.

**Plan testów:** jednostkowe (powyżej). **Reguły projektowe:** czyste funkcje bez DB/`Date.now`. **Krytyczny przepływ:** nie.

---

### Task 3: Efektywny katalog ćwiczeń + `forkExercise` — `catalog.ts`

**Files:**
- Create: `app/lib/catalog.ts`
- Test (owner runs): `tests/catalog-exercises.itest.ts`

- [ ] **Step 1: Implementuj warunek efektywnego katalogu i loader forków**

```ts
import { and, eq, isNotNull, isNull, notInArray, or, type SQL } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

/** origin_id markowych ćwiczeń, które dany trener już sforkował. */
export async function forkedExerciseOriginIds(db: Db, trainerId: string): Promise<string[]> {
  const rows = await db
    .select({ originId: schema.exercises.originId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNotNull(schema.exercises.originId)));
  return rows.map((r) => r.originId).filter((x): x is string => x != null);
}

/**
 * Warunek WHERE „efektywny katalog ćwiczeń trenera": własne ∪ markowe organizacji,
 * z pominięciem markowych, które trener już sforkował. `forkedOriginIds` = wynik
 * `forkedExerciseOriginIds` (przekazywany, by trasa mogła go policzyć raz).
 */
export function effectiveExerciseWhere(
  organizationId: string | null,
  trainerId: string,
  forkedOriginIds: string[],
): SQL {
  const own = eq(schema.exercises.trainerId, trainerId);
  if (!organizationId) return own;
  const brandConds = [isNull(schema.exercises.trainerId), eq(schema.exercises.organizationId, organizationId)];
  if (forkedOriginIds.length > 0) {
    brandConds.push(notInArray(schema.exercises.id, forkedOriginIds));
  }
  return or(own, and(...brandConds))!;
}

/** Czy ćwiczenie jest markowe (do oznaczania badge „Marka" w UI). */
export function isBrandOwned(row: { trainerId: string | null }): boolean {
  return row.trainerId == null;
}
```

- [ ] **Step 2: Implementuj `forkExercise` (idempotentny copy-on-write)**

```ts
export class CatalogError extends Error {
  constructor(message: string, public readonly userMessage: string) {
    super(message);
  }
}

/**
 * Forkuje markowe ćwiczenie na własność trenera (copy-on-write). Idempotentny:
 * jeśli fork tego origin już istnieje, zwraca jego id. Waliduje, że origin jest
 * markowy i z organizacji trenera (inaczej 404 przez null).
 */
export async function forkExercise(
  db: Db,
  params: { trainerId: string; organizationId: string | null; exerciseId: string },
): Promise<string | null> {
  const { trainerId, organizationId, exerciseId } = params;
  const [origin] = await db
    .select()
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        organizationId
          ? eq(schema.exercises.organizationId, organizationId)
          : isNull(schema.exercises.organizationId),
      ),
    )
    .limit(1);
  if (!origin) return null; // nie markowy / spoza org → 404

  const [existing] = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), eq(schema.exercises.originId, exerciseId)))
    .limit(1);
  if (existing) return existing.id;

  const [clone] = await db
    .insert(schema.exercises)
    .values({
      trainerId,
      organizationId: null,
      originId: origin.id,
      name: origin.name,
      unit: origin.unit,
      description: origin.description,
      tags: origin.tags,
      tracksRpe: origin.tracksRpe,
      demoFileId: origin.demoFileId, // współdzielimy referencję do pliku demo
    })
    .returning({ id: schema.exercises.id });
  return clone!.id;
}
```

- [ ] **Step 3: Napisz test integracyjny (PISZ, NIE uruchamiaj — Docker po stronie właściciela)**

Create `tests/catalog-exercises.itest.ts` (wzoruj się na istniejących `*.itest.ts` co do bootstrapu testcontainers). Pokryj:
```
- effectiveExerciseWhere: trener widzi własne + markowe org; po forku NIE widzi origin (jest w forkedOriginIds), widzi klon; inny trener tej org wciąż widzi origin.
- forkExercise: tworzy wiersz trainer_id=trener, origin_id=origin, organization_id=null; drugie wywołanie zwraca to samo id (idempotencja); origin nietknięty.
- forkExercise zwraca null dla ćwiczenia nie-markowego oraz markowego z innej organizacji.
- CHECK exercises_owner_check: insert z trainer_id I organization_id rzuca; z oboma NULL rzuca.
```

- [ ] **Step 4: Bramki + review**

Run: `npm run typecheck` (PASS), `npm run lint` (PASS). Zaraportuj test integracyjny jako „do uruchomienia przez właściciela". `superpowers:requesting-code-review`.

**Plan testów:** integracyjny (krytyczny tenant-scope/fork). **Reguły projektowe:** repo przyjmuje `trainerId`/`organizationId`; brak dostępu → null→404; pliki bez zmian. **Krytyczny przepływ:** TAK.

---

### Task 4: `authz.ts` — odczyt markowych w obrębie organizacji

**Files:**
- Modify: `app/lib/authz.ts`
- Test: `app/lib/authz.test.ts` (utwórz, jeśli nie istnieje)

- [ ] **Step 1: Napisz failujący test odczytu markowego zasobu**

```ts
import { describe, expect, it } from "vitest";
import { canReadCatalogRow } from "./authz";
import type { AuthUser } from "./auth";

const trainer: AuthUser = {
  id: "tr1", role: "trainer", trainerId: null, organizationId: "org1", regionId: "r1",
  email: "a@a", displayName: "A",
} as AuthUser;

describe("canReadCatalogRow", () => {
  it("trener czyta markowy wiersz swojej organizacji", () => {
    expect(canReadCatalogRow(trainer, { trainerId: null, organizationId: "org1" })).toBe(true);
  });
  it("trener nie czyta markowego wiersza innej organizacji", () => {
    expect(canReadCatalogRow(trainer, { trainerId: null, organizationId: "orgX" })).toBe(false);
  });
  it("własny wiersz trenera nadal czytelny", () => {
    expect(canReadCatalogRow(trainer, { trainerId: "tr1", organizationId: null })).toBe(true);
  });
  it("wiersz innego trenera niewidoczny", () => {
    expect(canReadCatalogRow(trainer, { trainerId: "tr2", organizationId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom — ma failować**

Run: `npx vitest run app/lib/authz.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementuj `canReadCatalogRow` (dopisz do `authz.ts`)**

```ts
export interface CatalogRow {
  trainerId: string | null;
  organizationId: string | null;
}

/**
 * Odczyt wiersza katalogu (exercise/skill): markowy (trainer_id NULL) jest czytelny
 * dla każdego z tej samej organizacji; trenerski tylko dla właściciela (lub jego
 * podopiecznego — przez ownsTrainerScope). Zapis markowego ZAWSZE niedozwolony
 * (osobny guard w repo — fork zamiast zapisu).
 */
export function canReadCatalogRow(user: AuthUser, row: CatalogRow): boolean {
  if (row.trainerId == null) {
    return row.organizationId != null && row.organizationId === user.organizationId;
  }
  return ownsTrainerScope(user, row.trainerId);
}
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `npx vitest run app/lib/authz.test.ts`
Expected: PASS.

- [ ] **Step 5: Bramki + review**

`npm run typecheck`, `npm run lint`, `superpowers:requesting-code-review`.

**Plan testów:** jednostkowe. **Reguły projektowe:** brak poszerzenia ZAPISU; tylko odczyt markowych w org. **Krytyczny przepływ:** TAK (objęte `/security-review`).

---

### Task 4b: Serwowanie plików — odczyt demo markowych ćwiczeń w organizacji

> Dodane po review T3 (luka autoryzacji cross-tenant). Decyzja: autoryzacja przy serwowaniu.

**Files:**
- Modify: `app/lib/catalog.ts` (helper)
- Modify: `app/routes/files.$fileId.tsx`
- Test (owner runs): dopisz do `tests/catalog-exercises.itest.ts`

- [ ] **Step 1: Helper w `catalog.ts`** — `fileIsBrandDemoInOrg(db, fileId, organizationId)`: zwraca `true`, gdy istnieje **markowe** ćwiczenie (`trainer_id IS NULL`) z `demo_file_id = fileId` i `organization_id = organizationId`.
```ts
export async function fileIsBrandDemoInOrg(
  db: Db,
  fileId: string,
  organizationId: string | null,
): Promise<boolean> {
  if (!organizationId) return false;
  const [row] = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.demoFileId, fileId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row != null;
}
```

- [ ] **Step 2: Rozszerz guard w `files.$fileId.tsx`** (linia ~41). Wyznacz efektywną organizację żądającego: `user.organizationId` lub — gdy `null` — org jego trenera (`user.trainerId` → `users.organizationId`). Następnie:
```ts
const allowed =
  ownsTrainerScope(user, file.trainerId) ||
  (await fileIsBrandDemoInOrg(db, file.id, effectiveOrgId));
if (!file || !allowed) {
  throw new Response("not found", { status: 404 });
}
```
(Uważaj na kolejność: najpierw pobierz `file`, potem licz `allowed`; zachowaj 404 zamiast 403 dla braku dostępu.)

- [ ] **Step 3: Test integracyjny (owner runs)** — dopisz: trener B (ta sama org, nie właściciel pliku) ORAZ podopieczny B mogą odczytać plik demo markowego ćwiczenia; trener z INNEJ org dostaje 404; plik nie-demo (np. set_video innego trenera) nadal 404.

- [ ] **Step 4: Bramki + review** — `npm run typecheck`, `npm run lint`. Zaraportuj itest do uruchomienia. `superpowers:requesting-code-review` + objąć `/security-review`.

**Plan testów:** integracyjny (krytyczny — autoryzacja plików). **Reguły projektowe:** brak poszerzenia poza demo markowych w org; 404 nie 403. **Krytyczny przepływ:** TAK.

---

### Task 5: Trasa biblioteki — lista efektywna + badge „Marka"

**Files:**
- Modify: `app/routes/trener/biblioteka._index.tsx`

- [ ] **Step 1: Podmień warunek odczytu na efektywny katalog (loader)**

W `loader` zamień bazowy warunek:
```ts
// było:
const conditions = [eq(schema.exercises.trainerId, user.id), isNull(schema.exercises.archivedAt)];
```
na:
```ts
import { effectiveExerciseWhere, forkedExerciseOriginIds, isBrandOwned } from "~/lib/catalog";
// …
const forkedOrigins = await forkedExerciseOriginIds(db, user.id);
const conditions = [
  effectiveExerciseWhere(user.organizationId, user.id, forkedOrigins),
  isNull(schema.exercises.archivedAt),
];
```
Filtry (q/tag/unit), sort, paginacja, count i drugie zapytanie — bez zmian (operują na `conditions`).

- [ ] **Step 2: Dołóż flagę markowości do `items`**

W mapowaniu `items` (ok. linii 115) dodaj pole `isBrand: isBrandOwned(r.exercise)` (czyli `r.exercise.trainerId == null`).

- [ ] **Step 3: Pokaż badge „Marka" na kafelku (UI — `frontend-design`)**

W komponencie listy, w nagłówku kafelka obok `<span className="badge">{ex.unit}</span>`, dla `ex.isBrand` dodaj badge „Marka" (klasa `.badge`, ton neutralny/akcent zgodny z design-system). Tekst po polsku przez i18n (`biblioteka.brandBadge` w słowniku `trener`). Dodaj klucz do `app/locales/pl/trener.json` i `fr/trener.json` (parytet kluczy — patrz test parytetu w `app/locales/`).

- [ ] **Step 4: Bramki + review**

`npm run typecheck`, `npm run lint`, `npm run build` (render trasy). `superpowers:requesting-code-review`. UI: prowadź przez `frontend-design:frontend-design`.

**Plan testów:** pokrycie odczytu przez `catalog-exercises.itest.ts` (Task 3). **Reguły projektowe:** trasa = istniejący plik (bez zmian w `routes.ts`); UI po polsku; i18n parytet. **Krytyczny przepływ:** tenant-scope (pokryty w Task 3).

---

### Task 6: Edycja ćwiczenia — read-only markowego + „Dostosuj" (fork)

**Files:**
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx`

- [ ] **Step 1: W loaderze rozróżnij własne vs markowe**

W loaderze (po pobraniu ćwiczenia) ustal `isBrand = exercise.trainerId == null`. Dostęp do markowego waliduj `canReadCatalogRow(user, exercise)` (import z `~/lib/authz`); brak → `throw new Response(null, { status: 404 })`. Dotychczasowe pobranie własnego (`eq(trainerId, user.id)`) rozszerz tak, by wczytać też markowy z organizacji (użyj warunku jak w `forkExercise`/`effectiveExerciseWhere` dla pojedynczego id).

- [ ] **Step 2: Dodaj intent `fork` w akcji**

```ts
import { forkExercise } from "~/lib/catalog";
// w action:
if (intent === "fork") {
  const newId = await forkExercise(db, {
    trainerId: user.id,
    organizationId: user.organizationId,
    exerciseId: params.exerciseId!,
  });
  if (!newId) throw new Response(null, { status: 404 });
  return redirect(`/trener/biblioteka/${newId}`);
}
```
Pozostałe intenty zapisu (edycja/archiwizacja/demo) **poprzedź guardem**: jeśli `isBrand` → `throw new Response(null, { status: 404 })` (markowego nie zapisujemy bezpośrednio).

- [ ] **Step 3: UI — tryb read-only dla markowego (frontend-design)**

Dla `isBrand`: zamiast formularza edycji renderuj podgląd (nazwa/opis/demo/tagi read-only) + przycisk `Form method="post"` z `intent=fork` i etykietą „Dostosuj" (i18n `biblioteka.customize` w `trener`, parytet pl/fr). Krótki opis: „Markowe ćwiczenie — dostosuj, by edytować u siebie". Dla własnego: formularz jak dziś.

- [ ] **Step 4: Bramki + review**

`npm run typecheck`, `npm run lint`, `npm run build`. `superpowers:requesting-code-review`. UI przez `frontend-design`.

**Plan testów:** dopisz do `tests/catalog-exercises.itest.ts`: POST `intent=fork` na markowym → redirect do nowego id trenera; POST edycji na markowym → 404; fork markowego z innej org → 404. **Reguły projektowe:** brak zapisu markowego; mutacje przez akcję. **Krytyczny przepływ:** TAK.

---

## FAZA 2 — Umiejętności markowe

### Task 7: Odczyt efektywny umiejętności w `skills.ts`

**Files:**
- Modify: `app/lib/skills.ts`
- Modify: `app/lib/catalog.ts` (analogiczne helpery dla skilli)

- [ ] **Step 1: Dodaj helpery skilli do `catalog.ts`**

```ts
/** origin_id markowych umiejętności, które trener już sforkował. */
export async function forkedSkillOriginIds(db: Db, trainerId: string): Promise<string[]> {
  const rows = await db
    .select({ originId: schema.skills.originId })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNotNull(schema.skills.originId)));
  return rows.map((r) => r.originId).filter((x): x is string => x != null);
}

/** Warunek WHERE „efektywne umiejętności trenera" (analogiczny do ćwiczeń). */
export function effectiveSkillWhere(
  organizationId: string | null,
  trainerId: string,
  forkedOriginIds: string[],
): SQL {
  const own = eq(schema.skills.trainerId, trainerId);
  if (!organizationId) return own;
  const brand = [isNull(schema.skills.trainerId), eq(schema.skills.organizationId, organizationId)];
  if (forkedOriginIds.length > 0) brand.push(notInArray(schema.skills.id, forkedOriginIds));
  return or(own, and(...brand))!;
}
```

- [ ] **Step 2: Przełącz `listSkillsForTrainer` na efektywny zbiór**

Zmień sygnaturę na `listSkillsForTrainer(db, { trainerId, organizationId })` (obiekt — bo potrzebujemy org). Zaktualizuj wszystkich wywołujących (`skill-tree.ts:loadGraph`, trasy authoringu) w tym tasku i Task 9/10. W `where` zamień `eq(skills.trainerId, trainerId)` na `and(effectiveSkillWhere(organizationId, trainerId, await forkedSkillOriginIds(db, trainerId)), isNull(skills.archivedAt))`.

- [ ] **Step 3: Przełącz `getSkillWithVariations` na dostęp efektywny**

Zmień sygnaturę na `(db, { trainerId, organizationId }, skillId)`. Pobierz skill po `id`, potem zweryfikuj `canReadCatalogRow(user-like)` — tu nie mamy `AuthUser`, więc sprawdź ręcznie: `skill.trainerId === trainerId || (skill.trainerId == null && skill.organizationId === organizationId)`; inaczej `null` (→404). Reszta (warianty) bez zmian.

- [ ] **Step 4: Bramki + review**

`npm run typecheck` (poprawiamy wywołujących), `npm run lint`. `superpowers:requesting-code-review`.

**Plan testów:** integracyjne w Task 10. **Reguły projektowe:** repo przyjmuje `trainerId`+`organizationId`; brak dostępu→404. **Krytyczny przepływ:** TAK.

---

### Task 8: Guard wariantu „≤1 umiejętność w widoku" + `listAssignableExercises` na efektywnym katalogu

**Files:**
- Modify: `app/lib/skills.ts`

- [ ] **Step 1: Zaktualizuj `addVariation` — własność tylko trenerska + guard widoku**

Po usunięciu globalnego `UNIQUE(exercise_id)` (Task 1) nie polegamy już na błędzie DB. W `addVariation`:
1. Skill musi być trenerski (`eq(skills.trainerId, trainerId)`) — markowy skill ma `trainer_id NULL`, więc próba dodania wariantu do markowego → „not found" (pożądane; edycja drabiny wymaga forka).
2. Ćwiczenie musi być w efektywnym katalogu trenera i nie zarchiwizowane (pobierz po id z warunkiem `effectiveExerciseWhere(...)`).
3. Guard widoku: policz exerciseId wariantów w **efektywnych umiejętnościach trenera** (innych niż docelowa) i odrzuć, jeśli ćwiczenie już użyte:
```ts
import { exerciseAlreadyVariationInView } from "~/lib/catalog-math";
// zbierz exerciseId wariantów efektywnych skilli trenera (poza skillId) → Set
if (exerciseAlreadyVariationInView(idsInView, exerciseId)) {
  throw new SkillError("exercise taken", "To ćwiczenie jest już wariantem innej umiejętności.");
}
```
Usuń stary `catch` dopasowujący `skill_variations_exercise_uniq` (indeks już nie istnieje); zostaw obsługę `skill_variations_skill_ordinal_uniq` (wyścig ordinali).

- [ ] **Step 2: Zaktualizuj `listAssignableExercises` (efektywny katalog, scope „w widoku")**

Zamiast `eq(exercises.trainerId, trainerId)` + `LEFT JOIN skill_variations IS NULL`, zwróć ćwiczenia z efektywnego katalogu trenera (`effectiveExerciseWhere`, niezarchiwizowane), które NIE są wariantem żadnej **efektywnej umiejętności** tego trenera. Realizacja: pobierz efektywne ćwiczenia, pobierz zbiór exerciseId wariantów efektywnych skilli, odejmij w pamięci (lub `notInArray`). Zmień sygnaturę na `(db, { trainerId, organizationId })`.

- [ ] **Step 3: Zaktualizuj `findSkillForExercise`, `listExerciseSkillMap`** by działały na efektywnych umiejętnościach (markowe + własne) — dziś filtrują `eq(skills.trainerId, trainerId)`. Przyjmij `organizationId` i użyj efektywnego warunku.

- [ ] **Step 4: Bramki + review**

`npm run typecheck`, `npm run lint`. `superpowers:requesting-code-review`.

**Plan testów:** integracyjne w Task 10 (guard „≤1 skill w widoku", picker). Jednostkowy guard pokryty w Task 2. **Reguły projektowe:** zapis tylko na własnych skillach; reguła w repo. **Krytyczny przepływ:** TAK.

---

### Task 9: `forkSkill` (głęboki klon) — `catalog.ts`

**Files:**
- Modify: `app/lib/catalog.ts`
- Test (owner runs): `tests/catalog-skills.itest.ts`

- [ ] **Step 1: Implementuj `forkSkill` w transakcji**

```ts
import { planSkillClone } from "~/lib/catalog-math";

/** Głęboki fork markowej umiejętności (skill + warianty + krawędzie prereq) na własność trenera. Idempotentny. */
export async function forkSkill(
  db: Db,
  params: { trainerId: string; organizationId: string | null; skillId: string },
): Promise<string | null> {
  const { trainerId, organizationId, skillId } = params;
  return await db.transaction(async (tx) => {
    const [origin] = await tx
      .select()
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, skillId),
          isNull(schema.skills.trainerId),
          organizationId
            ? eq(schema.skills.organizationId, organizationId)
            : isNull(schema.skills.organizationId),
        ),
      )
      .limit(1);
    if (!origin) return null;

    const [existing] = await tx
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(eq(schema.skills.trainerId, trainerId), eq(schema.skills.originId, skillId)))
      .limit(1);
    if (existing) return existing.id;

    const [clone] = await tx
      .insert(schema.skills)
      .values({
        trainerId,
        organizationId: null,
        originId: origin.id,
        name: origin.name,
        description: origin.description,
      })
      .returning({ id: schema.skills.id });
    const newSkillId = clone!.id;

    const variations = await tx
      .select({ exerciseId: schema.skillVariations.exerciseId, ordinal: schema.skillVariations.ordinal })
      .from(schema.skillVariations)
      .where(eq(schema.skillVariations.skillId, skillId));
    const prereqs = await tx
      .select({ skillId: schema.skillPrerequisites.skillId, requiresSkillId: schema.skillPrerequisites.requiresSkillId })
      .from(schema.skillPrerequisites)
      .where(eq(schema.skillPrerequisites.skillId, skillId));

    const planned = planSkillClone(newSkillId, skillId, variations, prereqs);
    if (planned.variations.length > 0) {
      await tx.insert(schema.skillVariations).values(
        planned.variations.map((v) => ({ skillId: newSkillId, exerciseId: v.exerciseId, ordinal: v.ordinal })),
      );
    }
    if (planned.prereqEdges.length > 0) {
      await tx.insert(schema.skillPrerequisites).values(
        planned.prereqEdges.map((e) => ({
          trainerId,
          organizationId: null,
          skillId: e.skillId,
          requiresSkillId: e.requiresSkillId,
        })),
      );
    }
    return newSkillId;
  });
}
```

> **Uwaga:** warianty forka referują **te same** markowe `exercise_id` (brak globalnego UNIQUE po Task 1, więc kolizja z markową drabiną nie występuje). Krawędzie prereq, w których origin był `requires_skill_id`, pozostają markowe — efektywne rozwiązanie grafu i tak zastępuje origin forkiem w widoku trenera (skill-tree na efektywnym zbiorze, Task 11).

- [ ] **Step 2: Napisz test integracyjny `tests/catalog-skills.itest.ts` (owner runs)**

```
- forkSkill klonuje skill (trainer_id=trener, origin_id=origin) + warianty (ten sam ordinal/exerciseId) + krawędzie prereq, w transakcji.
- idempotencja: drugie wywołanie zwraca to samo id, bez duplikatów wariantów/krawędzi.
- null dla skilla nie-markowego / z innej org.
- skill_advancements wskazujące warianty origin pozostają ważne (RESTRICT) — fork ich nie rusza.
```

- [ ] **Step 3: Bramki + review**

`npm run typecheck`, `npm run lint`. Zaraportuj itest do uruchomienia. `superpowers:requesting-code-review`.

**Plan testów:** integracyjny (krytyczny). Plan klonowania (czysty) w Task 2. **Reguły projektowe:** transakcja; tenant-scope; integralność awansów. **Krytyczny przepływ:** TAK.

---

### Task 10: Drzewo umiejętności na efektywnym zbiorze (`skill-tree.ts`)

**Files:**
- Modify: `app/lib/skill-tree.ts`

- [ ] **Step 1: `loadGraph` na efektywnych umiejętnościach + krawędziach**

Zmień `loadGraph(db, trainerId)` → `loadGraph(db, { trainerId, organizationId })`. `listSkillsForTrainer` woła się już efektywnie (Task 7). Krawędzie: zamiast `eq(skillPrerequisites.trainerId, trainerId)` pobierz krawędzie, których `skillId` ∈ efektywne id (markowe org + własne), używając `effectiveSkillWhere` na podzapytaniu lub filtrując w pamięci po `activeIds` (zbiór już liczony). Filtr `activeIds.has(from) && activeIds.has(requires)` zostaje — i naturalnie obejmie markowe krawędzie, bo `activeIds` zawiera teraz efektywne skille.

- [ ] **Step 2: Przekaż `organizationId` z `getSkillTreeForTrainer`/`getSkillTreeForTrainee`**

Obie funkcje przyjmują dziś `trainerId` (+`traineeId`). Dołóż `organizationId` do sygnatury i przekaż do `loadGraph`. Zaktualizuj wywołujących w trasach (`rozwoj._index` trenera i podopiecznego) — w loaderach mamy `user.organizationId` (trener) lub trzeba dociągnąć org trenera podopiecznego (podopieczny: `user.organizationId` — trainee ma org ustawione przez seed/inwariant; jeśli null, fallback do org trenera przez zapytanie). Dla podopiecznego użyj `organizationId` jego trenera: dociągnij w loaderze z `users` po `trainerId` (lub użyj `user.organizationId` jeśli niezerowe).

- [ ] **Step 3: Bramki + review**

`npm run typecheck`, `npm run lint`, `npm run build`. `superpowers:requesting-code-review`.

**Plan testów:** integracyjne — podopieczny widzi markowe skille trenera w drzewie (dopisz do `catalog-skills.itest.ts`). **Reguły projektowe:** tenant-scope odczytu przez trenera. **Krytyczny przepływ:** TAK.

---

### Task 11: Trasy authoringu umiejętności — badge „Marka" + „Dostosuj"

**Files:**
- Modify: `app/routes/trener/umiejetnosci._index.tsx`
- Modify: `app/routes/trener/umiejetnosci.$skillId.tsx`

- [ ] **Step 1: `_index` — lista efektywna + flaga markowości**

Przekaż `organizationId` do `listSkillsForTrainer` (nowa sygnatura). Dołóż do wierszy `isBrand` (skill.trainerId == null — dociągnij w zapytaniu listy lub osobnym selectem id markowych). W UI badge „Marka" przy markowych (i18n `umiejetnosci.brandBadge`, parytet pl/fr).

- [ ] **Step 2: `$skillId` — read-only markowego + intent `fork`**

Loader: `getSkillWithVariations(db, { trainerId, organizationId }, skillId)`; ustal `isBrand`. Akcja: dodaj `intent === "fork"` → `forkSkill(...)` → `redirect(/trener/umiejetnosci/<newId>)`; pozostałe intenty zapisu (update/add-variation/remove-variation/reorder/add-prerequisite/remove-prerequisite) poprzedź guardem `if (isBrand) throw new Response(null, { status: 404 })`. UI: dla `isBrand` podgląd read-only drabiny + przycisk „Dostosuj" (i18n `umiejetnosci.customize`); dla własnego edytor jak dziś.

- [ ] **Step 3: Bramki + review**

`npm run typecheck`, `npm run lint`, `npm run build`. UI przez `frontend-design`. `superpowers:requesting-code-review`.

**Plan testów:** dopisz do `catalog-skills.itest.ts`: fork markowego skilla z trasy → redirect; zapis na markowym → 404. **Reguły projektowe:** brak zapisu markowego; UI po polsku; i18n parytet. **Krytyczny przepływ:** TAK.

---

## FAZA 3 — Seed i promocja

### Task 12: Promocja in-place biblioteki założyciela do marki — `catalog.ts`

**Files:**
- Modify: `app/lib/catalog.ts`
- Test (owner runs): dopisz do `tests/catalog-exercises.itest.ts`

- [ ] **Step 1: Implementuj `promoteTrainerCatalogToBrand` (idempotentny)**

```ts
/**
 * Promuje WSZYSTKIE własne (niesforkowane, trainer_id=trainerId) ćwiczenia i
 * umiejętności trenera do poziomu marki (trainer_id=NULL, organization_id=org),
 * BEZ zmiany id → FK z planów/logów/wariantów/awansów pozostają ważne. Idempotentny:
 * wiersze już markowe są pomijane. Krawędzie prereq promowanego trenera również.
 */
export async function promoteTrainerCatalogToBrand(
  db: Db,
  params: { trainerId: string; organizationId: string },
): Promise<{ exercises: number; skills: number; prerequisites: number }> {
  const { trainerId, organizationId } = params;
  return await db.transaction(async (tx) => {
    const ex = await tx
      .update(schema.exercises)
      .set({ trainerId: null, organizationId })
      .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.originId)))
      .returning({ id: schema.exercises.id });
    const sk = await tx
      .update(schema.skills)
      .set({ trainerId: null, organizationId })
      .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.originId)))
      .returning({ id: schema.skills.id });
    const pr = await tx
      .update(schema.skillPrerequisites)
      .set({ trainerId: null, organizationId })
      .where(eq(schema.skillPrerequisites.trainerId, trainerId))
      .returning({ id: schema.skillPrerequisites.id });
    return { exercises: ex.length, skills: sk.length, prerequisites: pr.length };
  });
}
```

> **Uwaga:** promujemy tylko wiersze `origin_id IS NULL` (kanon trenera-założyciela), nie jego ewentualne forki. Jeśli kanon ma być węższy niż „cała biblioteka", właściciel zawęzi listę przy handoffie (np. filtr po nazwach) — patrz §7 specu.

- [ ] **Step 2: Test integracyjny (owner runs)**

```
- po promocji: wiersze mają trainer_id=NULL, organization_id=org, te same id; FK z plan_items/workout_exercise_logs/skill_variations/skill_advancements wciąż ważne (insert referujący przechodzi).
- idempotencja: drugie wywołanie zwraca zera, nie zmienia danych.
- CHECK owner: po promocji każdy wiersz spełnia „dokładnie jeden właściciel".
```

- [ ] **Step 3: Bramki + review**

`npm run typecheck`, `npm run lint`. `superpowers:requesting-code-review`.

**Plan testów:** integracyjny (krytyczny — migracja własności + integralność FK). **Reguły projektowe:** transakcja; tenant-scope. **Krytyczny przepływ:** TAK.

---

### Task 13: Wpięcie promocji w seed

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Po bootstrapie marki, promuj katalog założyciela**

W bloku `if (brandName && brandAdminEmail && brandAdminPassword)` (po `assignUserToOrgRegion` dla trenerów), dla każdego trenera-założyciela wywołaj promocję. Minimalnie: promuj katalog **pierwszego** trenera (jedyny realny dziś) lub wszystkich trenerów org — decyzja właściciela. Domyślnie pierwszy:
```ts
import { promoteTrainerCatalogToBrand } from "../app/lib/catalog";
// po przypisaniu trenerów do org:
const [founder] = await db
  .select({ id: schema.users.id })
  .from(schema.users)
  .where(and(eq(schema.users.role, "trainer"), eq(schema.users.organizationId, orgId)))
  .limit(1);
if (founder) {
  const promoted = await promoteTrainerCatalogToBrand(db, { trainerId: founder.id, organizationId: orgId });
  console.log(`[seed] Promowano do marki: ${promoted.exercises} ćwiczeń, ${promoted.skills} umiejętności, ${promoted.prerequisites} krawędzi.`);
}
```
Idempotencja: druga przebieg → zera (promocja pomija już-markowe).

- [ ] **Step 2: Bramki + review**

`npm run typecheck`, `npm run lint`. `superpowers:requesting-code-review`.

**Plan testów:** integracyjny (idempotencja seeda) — dopisz do istniejącego itestu seeda jeśli jest, inaczej do `catalog-exercises.itest.ts`. **Reguły projektowe:** seed idempotentny; nie uruchamiamy `db:seed` (właściciel). **Krytyczny przepływ:** TAK.

---

## FAZA 4 — Dokumentacja (część „done")

### Task 14: Aktualizacja README i CLAUDE.md

**Files:**
- Modify: `app/lib/db/README.md`, `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `scripts/README.md`, `CLAUDE.md`, `app/locales/README.md` (jeśli dotyczy nowych kluczy)

- [ ] **Step 1: `app/lib/db/README.md`** — opisz własność org/trener na `exercises`/`skills`/`skill_prerequisites`, kolumny `organization_id`/`origin_id`, CHECK „dokładnie jeden właściciel" i „origin tylko dla forka", usunięcie globalnego `UNIQUE(exercise_id)` (reguła „≤1 skill w widoku" w repo).
- [ ] **Step 2: `app/lib/README.md`** — dodaj wpis `catalog.ts` (efektywny katalog, `forkExercise`/`forkSkill`, `promoteTrainerCatalogToBrand`) i `catalog-math.ts` (czyste helpery); zaktualizuj opisy `skills.ts`/`skill-tree.ts` (efektywny zbiór) i `authz.ts` (`canReadCatalogRow`).
- [ ] **Step 3: `app/routes/trener/README.md`** — „Dostosuj" + badge „Marka" w bibliotece i umiejętnościach.
- [ ] **Step 4: `app/routes/podopieczny/README.md`** — wzmianka, że Rozwój/drzewo obejmują markowe pozycje trenera.
- [ ] **Step 5: `scripts/README.md`** — promocja in-place w seedzie.
- [ ] **Step 6: `CLAUDE.md`** — w mapie `app/lib/` dopisz `catalog.ts`/`catalog-math.ts`; w „Kluczowych konwencjach" krótka nota o efektywnym katalogu (markowe ∪ własne; zapis tylko na własnych; fork = copy-on-write).
- [ ] **Step 7: Bramki + review**

`npm run lint` (markdown nie łamie), `superpowers:requesting-code-review`.

**Plan testów:** brak. **Reguły projektowe:** dokumentacja = „done". **Krytyczny przepływ:** nie.

---

## Bramki końcowe (całość — z dowodem)

- [ ] `npm test` (jednostkowe) — zielone.
- [ ] `npm run typecheck` — zielone.
- [ ] `npm run lint` — zielone.
- [ ] `npm run build` — zielone.
- [ ] Dokumentacja zaktualizowana (Task 14).
- [ ] `/code-review` na całości diffu.
- [ ] `/security-review` — dotyka tenant-scope, autoryzacji zapisu, poszerzenia odczytu o organizację.
- [ ] Testy integracyjne (`tests/catalog-*.itest.ts`) — zaraportować i poprosić właściciela o uruchomienie pod Dockerem.

---

## Handoff (granica gita)

- **Zmienione/utworzone pliki:** patrz „Mapa plików".
- **DB:** `npm run db:generate` (INTERAKTYWNE — drop NOT NULL na `trainer_id`, nowe kolumny `organization_id`/`origin_id`, nowe CHECK-i, usunięcie `skill_variations_exercise_uniq`; właściciel wybiera w TTY) → `npm run db:migrate`.
- **Seed:** `npm run db:seed` wykona promocję in-place katalogu założyciela do marki (idempotentne). Jeśli kanon ma być węższy — zawęzić przed uruchomieniem.
- **Env:** brak nowych.
- **Testy do uruchomienia (Docker):** `tests/catalog-exercises.itest.ts`, `tests/catalog-skills.itest.ts` (+ ewentualny itest seeda).
- **Proponowany commit:** `feat: markowa baza ćwiczeń i umiejętności (organizacja) z forkiem copy-on-write per-trener`.
- **Ręczna weryfikacja:** zaloguj trenera → biblioteka i umiejętności pokazują markowe pozycje z badge „Marka"; „Dostosuj" forkuje i wchodzi w edytor klona; oryginał znika z widoku tego trenera, zostaje u innych; podopieczny w `/rozwoj` widzi efektywny katalog.
- Git/migrate/seed/deploy prowadzi właściciel.
