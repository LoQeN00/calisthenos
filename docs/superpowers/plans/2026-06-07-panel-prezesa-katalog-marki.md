# Panel prezesa — autorstwo katalogu marki (#4a) — plan implementacji

> **Dla wykonawców (agentów):** WYMAGANY SUB-SKILL: użyj
> `superpowers:subagent-driven-development` (rekomendowane) lub
> `superpowers:executing-plans` do realizacji task-po-tasku. Kroki używają
> checkboxów (`- [ ]`).
>
> **Reguły-fundamenty tego repo (NADRZĘDNE):** nigdy git/docker (handoff na końcu);
> npm; komendy powłoki pojedynczo z allowlisty (`npm run typecheck`,
> `npm run lint`, `npm run build`, `npm run db:generate`,
> `npx vitest run <wzorzec>`, `npx biome format --write <plik>`); **NIE** `npm test`
> (watch). `db:generate`/`db:migrate` uruchamia właściciel (interaktywne). Testy
> integracyjne (`*.itest.ts`) tylko PISZEMY — uruchamia właściciel pod Dockerem.
> Warstwę wizualną prowadzi `frontend-design:frontend-design`. **Review per task**
> (`/code-review`) zamiast commitów — git robi właściciel.

**Goal:** Dać prezesowi (`brand_admin`) powłokę `/marka` z nawigacją oraz pełne
autorstwo markowego katalogu (ćwiczenia z demo, umiejętności + warianty, drzewo
prerekwizytów) zapisywanego jako markowy (`trainer_id NULL` + `organization_id`).

**Architecture:** Nowe, brand-scoped repo `app/lib/brand-catalog.ts` + cienkie
trasy `/marka/*`; złożona logika (cykle, układ warstw, reorder) reużyta z
`skill-tree-math.ts` i komponentów prezentacyjnych. Tabela `files` zyskuje własność
marki (nullable `trainer_id` + `organization_id` + CHECK), by prezes mógł
uploadować demo. Trenerskie funkcje zapisu (`skills.ts`, trasy `/trener/*`) —
nietknięte. Org-scope prezesa: niezgodna org → 404.

**Tech Stack:** React Router v7 (SSR, loadery/akcje), Drizzle ORM + Postgres, Zod,
Vitest, i18next (namespace `marka`, pl+fr), Biome.

**Spec:** `docs/superpowers/specs/2026-06-07-panel-prezesa-katalog-marki-design.md`.

---

## Mapa plików

**Tworzone:**
- `app/lib/brand-catalog.ts` — brand-scoped repo (odczyt + zapis katalogu marki).
- `app/routes/marka/biblioteka._index.tsx`, `…/biblioteka.nowe.tsx`, `…/biblioteka.$exerciseId.tsx`
- `app/routes/marka/umiejetnosci._index.tsx`, `…/umiejetnosci.nowa.tsx`, `…/umiejetnosci.$skillId.tsx`
- `app/lib/brand-catalog.itest.ts` — testy integracyjne (PISANE, uruchamia właściciel).

**Modyfikowane:**
- `app/lib/db/schema.ts` — tabela `files` (własność marki).
- `app/lib/authz.ts` + `app/lib/authz.test.ts` — predykaty brand-scope (TDD).
- `app/lib/file-uploads.ts` — `uploadFile` przyjmuje właściciela (trener|marka).
- `app/routes/trener/biblioteka.nowe.tsx`, `…/biblioteka.$exerciseId.tsx` — aktualizacja wywołań `uploadFile`.
- `app/routes/marka/_layout.tsx` — sidenav + liczniki.
- `app/routes/marka/_index.tsx` — lekki pulpit (liczniki katalogu).
- `app/routes.ts` — wpięcie nowych tras `/marka/*`.
- `app/locales/pl/marka.json`, `app/locales/fr/marka.json` — nowe klucze.
- README katalogów + `CLAUDE.md` (Task dokumentacyjny).

---

## Task 1: Schemat — własność marki w `files`

**Files:**
- Modify: `app/lib/db/schema.ts` (tabela `files`, ~`170-193`)
- Modify: `app/lib/db/README.md`

- [ ] **Step 1: Edytuj definicję `files`**

W `app/lib/db/schema.ts` zamień obecną definicję `files` na (zmiany: `trainerId`
staje się nullowalne — usuń `.notNull()`; dodaj `organizationId`; dodaj indeks
org; dodaj CHECK właściciela mirrorujący `exercises_owner_check`):

```ts
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: plik jest albo trenerski (trainer_id) albo markowy (organization_id).
    trainerId: uuid("trainer_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: fileKind("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    storagePath: text("storage_path").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storagePathUniq: uniqueIndex("files_storage_path_uniq").on(t.storagePath),
    trainerKindIdx: index("files_trainer_kind_idx").on(t.trainerId, t.kind),
    orgKindIdx: index("files_org_kind_idx").on(t.organizationId, t.kind),
    ownerCheck: check(
      "files_owner_check",
      sql`(${t.trainerId} IS NULL AND ${t.organizationId} IS NOT NULL) OR
          (${t.trainerId} IS NOT NULL AND ${t.organizationId} IS NULL)`,
    ),
  }),
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (jeśli błąd „możliwe null" przy `files.trainerId` w istniejącym
kodzie — to oczekiwane miejsca naprawimy w Tasku 3; jeśli typecheck pada teraz,
zanotuj i kontynuuj — Task 3 domknie).
Uwaga: dopuszczalne jest, że typecheck przejdzie tu (Drizzle typ kolumny staje się
`string | null`, a istniejące ins-erty podają `trainerId`, więc kompiluje).

- [ ] **Step 3: Zaktualizuj `app/lib/db/README.md`**

W wierszu `schema.ts` opisz zmianę: `files` ma teraz dwupoziomową własność
(`trainer_id` nullable LUB `organization_id`), CHECK `files_owner_check`, indeks
`files_org_kind_idx`. Markowe pliki (demo markowych ćwiczeń tworzonych przez
prezesa) niosą `organization_id`, trenerskie — `trainer_id`.

- [ ] **Step 4: Handoff-nota migracji (NIE uruchamiaj)**

Zanotuj w sekcji handoff: po tym tasku właściciel uruchomi `npm run db:generate`
(interaktywne — drizzle-kit zapyta o nullability `trainer_id` i nową kolumnę;
wybrać „create column"/alter) → `npm run db:migrate`. Migracji nie edytujemy ręcznie.

- [ ] **Step 5: Review**

`/code-review` na zmianie schematu + README. Zastosuj uwagi.

---

## Task 2: authz — predykaty brand-scope (TDD)

**Files:**
- Modify: `app/lib/authz.ts`
- Test: `app/lib/authz.test.ts`

- [ ] **Step 1: Napisz failujący test**

Dopisz w `app/lib/authz.test.ts` (zaimportuj nowe funkcje w istniejącym imporcie z
`./authz`). Helper budujący `AuthUser` — jeśli w pliku już jest podobny, użyj go;
inaczej dodaj:

```ts
import { ownsBrandScope, canWriteBrandCatalogRow } from "./authz";
import type { AuthUser } from "./auth";

function user(p: Partial<AuthUser>): AuthUser {
  return {
    id: "u1",
    email: "e@e.pl",
    displayName: "U",
    role: "trainer",
    trainerId: null,
    organizationId: null,
    regionId: null,
    ...p,
  };
}

describe("ownsBrandScope", () => {
  it("true dla brand_admin z pasującą organizacją", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: "org1" }), "org1")).toBe(true);
  });
  it("false dla brand_admin z inną organizacją", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: "org1" }), "org2")).toBe(false);
  });
  it("false dla brand_admin bez organizacji", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: null }), "org1")).toBe(false);
  });
  it("false dla trenera/podopiecznego nawet z tą organizacją", () => {
    expect(ownsBrandScope(user({ role: "trainer", organizationId: "org1" }), "org1")).toBe(false);
    expect(ownsBrandScope(user({ role: "trainee", organizationId: "org1" }), "org1")).toBe(false);
  });
});

describe("canWriteBrandCatalogRow", () => {
  it("true gdy brand_admin pisze markowy wiersz swojej org", () => {
    const u = user({ role: "brand_admin", organizationId: "org1" });
    expect(canWriteBrandCatalogRow(u, { trainerId: null, organizationId: "org1" })).toBe(true);
  });
  it("false gdy wiersz markowy innej org", () => {
    const u = user({ role: "brand_admin", organizationId: "org1" });
    expect(canWriteBrandCatalogRow(u, { trainerId: null, organizationId: "org2" })).toBe(false);
  });
  it("false gdy wiersz trenerski (markowy autor nie pisze trenerskich)", () => {
    const u = user({ role: "brand_admin", organizationId: "org1" });
    expect(canWriteBrandCatalogRow(u, { trainerId: "t1", organizationId: null })).toBe(false);
  });
  it("false gdy nie-prezes", () => {
    const u = user({ role: "trainer", organizationId: "org1" });
    expect(canWriteBrandCatalogRow(u, { trainerId: null, organizationId: "org1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `npx vitest run app/lib/authz.test.ts`
Expected: FAIL — „ownsBrandScope is not a function" (lub błąd importu).

- [ ] **Step 3: Implementacja w `app/lib/authz.ts`**

Dopisz na końcu pliku:

```ts
/**
 * Czy użytkownik jest prezesem (brand_admin) działającym w obrębie danej
 * organizacji. Jedyna ścieżka autoryzacji do zapisu/odczytu markowego katalogu
 * z poziomu marki. Brak organizationId → false (nie wpuszczamy „globalnego" prezesa
 * bez przypisanej marki).
 */
export function ownsBrandScope(user: AuthUser, organizationId: string): boolean {
  return user.role === "brand_admin" && user.organizationId === organizationId;
}

/**
 * Czy prezes może ZAPISAĆ ten wiersz katalogu marki: musi być markowy
 * (trainer_id NULL) i należeć do organizacji prezesa. Trenerskie wiersze są
 * niedostępne z poziomu marki (i odwrotnie — markowe są read-only dla trenera,
 * patrz canReadCatalogRow).
 */
export function canWriteBrandCatalogRow(user: AuthUser, row: CatalogRow): boolean {
  if (row.trainerId != null || row.organizationId == null) return false;
  return ownsBrandScope(user, row.organizationId);
}
```

- [ ] **Step 4: Uruchom test — ma PRZEJŚĆ**

Run: `npx vitest run app/lib/authz.test.ts`
Expected: PASS (wszystkie nowe + istniejące).

- [ ] **Step 5: Lint + format**

Run: `npx biome format --write app/lib/authz.ts`
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Review**

`/code-review`. Zastosuj uwagi.

---

## Task 3: `uploadFile` — właściciel parametryczny (trener | marka)

**Files:**
- Modify: `app/lib/file-uploads.ts` (`UploadFileInput` ~`25-30`, insert ~`183-194`)
- Modify: `app/routes/trener/biblioteka.nowe.tsx` (wywołanie ~`65-74`)
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx` (wywołanie ~`180-189`)

> Brak unit-testu (DB I/O); pokryte testem integracyjnym w Tasku 12. Bramka: typecheck+build.

- [ ] **Step 1: Zmień typ wejścia i insert w `file-uploads.ts`**

Zamień `UploadFileInput` (usuń `trainerId: string`, dodaj union właściciela):

```ts
export type UploadOwner = { trainerId: string } | { organizationId: string };

export interface UploadFileInput {
  file: File;
  kind: UploadKind;
  owner: UploadOwner;
  uploadedBy: string;
}
```

W `uploadFile` zmień destrukturyzację i insert. Zamień linię
`const { file, kind, trainerId, uploadedBy } = input;` na:

```ts
  const { file, kind, owner, uploadedBy } = input;
```

oraz w `.values({...})` zamień `trainerId,` na rozbicie właściciela:

```ts
      .values({
        id: fileId,
        trainerId: "trainerId" in owner ? owner.trainerId : null,
        organizationId: "organizationId" in owner ? owner.organizationId : null,
        uploadedBy,
        kind,
        mimeType: mime,
        bytes,
        storagePath,
      })
```

- [ ] **Step 2: Zaktualizuj wywołania w trasach trenera**

W `app/routes/trener/biblioteka.nowe.tsx` i `app/routes/trener/biblioteka.$exerciseId.tsx`
zamień w obiekcie przekazywanym do `uploadFile`:

```ts
            // było:
            trainerId: user.id,
            uploadedBy: user.id,
            // ma być:
            owner: { trainerId: user.id },
            uploadedBy: user.id,
```

(`kind: "exercise_demo"` i `file` bez zmian.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — wszystkie wywołania `uploadFile` używają nowego kształtu. Jeśli
typecheck wskaże inne wywołania (np. upload zdjęć sylwetki / wideo serii), zaktualizuj
je analogicznie (`owner: { trainerId: … }`). Wyszukaj wszystkie miejsca:
Run: (Grep narzędziem) `uploadFile(` w `app/` — popraw każde wywołanie.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Lint/format zmienionych plików + review**

Run: `npx biome format --write app/lib/file-uploads.ts`
Run: `npm run lint`
`/code-review` (dotyka uploadu — zwróć uwagę na pełną listę zaktualizowanych wywołań).

---

## Task 4: `brand-catalog.ts` — ćwiczenia marki (odczyt + zapis)

**Files:**
- Create: `app/lib/brand-catalog.ts`

> Repo brand-scoped. Wzorzec: `app/lib/skills.ts` (uproszczony — brak forków i
> efektywnego widoku; markowy wiersz = `trainer_id IS NULL AND organization_id = org`).
> Pokrycie: integracja (Task 12). Bramka tu: typecheck + build.

- [ ] **Step 1: Utwórz `app/lib/brand-catalog.ts` z bazą + ćwiczeniami**

```ts
// Importy rosną wraz z kolejnymi taskami: Task 4 używa and/asc/eq/isNull;
// Task 5 dołoży `or, sql`; Task 6 dołoży `inArray`. Trzymaj import zsynchronizowany
// z użyciem, bo biome/tsc oznaczy nieużywane (bramka padnie).
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class BrandCatalogError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

// ---------- Ćwiczenia marki ----------

export interface BrandExerciseRow {
  id: string;
  name: string;
  unit: "REPS" | "SEC";
  tracksRpe: boolean;
  tags: string[];
  demoFileId: string | null;
  archivedAt: Date | null;
}

/** Wszystkie markowe ćwiczenia organizacji (aktywne + zarchiwizowane), po nazwie. */
export async function listBrandExercises(
  db: Db,
  organizationId: string,
): Promise<BrandExerciseRow[]> {
  return await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
      tracksRpe: schema.exercises.tracksRpe,
      tags: schema.exercises.tags,
      demoFileId: schema.exercises.demoFileId,
      archivedAt: schema.exercises.archivedAt,
    })
    .from(schema.exercises)
    .where(
      and(
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .orderBy(asc(schema.exercises.name));
}

/** Pojedyncze markowe ćwiczenie org (z wierszem demo). null → 404. */
export async function getBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<{ exercise: schema.Exercise; demoFile: schema.FileRow | null } | null> {
  const [row] = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(eq(schema.exercises.id, exerciseId))
    .limit(1);
  if (!row) return null;
  if (row.exercise.trainerId != null || row.exercise.organizationId !== organizationId) {
    return null;
  }
  return { exercise: row.exercise, demoFile: row.demoFile };
}

export interface BrandExerciseInput {
  name: string;
  unit: "REPS" | "SEC";
  description: string;
  tracksRpe: boolean;
  tags: string[];
  demoFileId: string | null;
}

/** Wstawia markowe ćwiczenie (trainer_id NULL + organization_id). */
export async function createBrandExercise(
  db: Db,
  organizationId: string,
  input: BrandExerciseInput,
): Promise<schema.Exercise> {
  const [row] = await db
    .insert(schema.exercises)
    .values({
      trainerId: null,
      organizationId,
      name: input.name,
      unit: input.unit,
      description: input.description,
      tracksRpe: input.tracksRpe,
      tags: input.tags,
      demoFileId: input.demoFileId,
    })
    .returning();
  return row!;
}

/** Aktualizuje markowe ćwiczenie org (scope w WHERE → obce nie ruszone). */
export async function updateBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
  input: Omit<BrandExerciseInput, "demoFileId"> & { demoFileId: string | null },
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({
      name: input.name,
      unit: input.unit,
      description: input.description,
      tracksRpe: input.tracksRpe,
      tags: input.tags,
      demoFileId: input.demoFileId,
    })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}

export async function archiveBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}

export async function restoreBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: null })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}
```

> Uwaga typy: jeśli `schema.FileRow` nie istnieje, użyj `typeof schema.files.$inferSelect`.
> Sprawdź eksporty typów w `schema.ts` (są `Exercise`, `Skill` itd.); jeśli brak
> `FileRow`, zastąp adnotację `demoFile` przez `typeof schema.files.$inferSelect | null`.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck`
Run: `npm run build`
Expected: PASS. (Funkcje nieużywane jeszcze — to OK; trasy w Task 9.)

- [ ] **Step 3: Lint/format + review**

Run: `npx biome format --write app/lib/brand-catalog.ts`
Run: `npm run lint`
`/code-review`.

---

## Task 5: `brand-catalog.ts` — umiejętności + warianty marki

**Files:**
- Modify: `app/lib/brand-catalog.ts`

> Mirror `skills.ts` (createSkill/updateSkill/archiveSkill/addVariation/removeVariation/
> reorderVariations/findSkillForExercise/listAssignableExercises), brand-scoped i bez
> efektywnego widoku. Reguła „ćwiczenie ≤1 markowej umiejętności w org" egzekwowana tu.

- [ ] **Step 1: Dopisz funkcje umiejętności/wariantów**

```ts
// ---------- Umiejętności marki ----------

export interface BrandSkillListRow {
  id: string;
  name: string;
  description: string;
  variationCount: number;
}

export async function listBrandSkills(
  db: Db,
  organizationId: string,
): Promise<BrandSkillListRow[]> {
  const rows = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      description: schema.skills.description,
      variationCount: sql<number>`COUNT(${schema.skillVariations.id})::int`,
    })
    .from(schema.skills)
    .leftJoin(schema.skillVariations, eq(schema.skillVariations.skillId, schema.skills.id))
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .groupBy(schema.skills.id)
    .orderBy(asc(schema.skills.name));
  return rows.map((r) => ({ ...r, variationCount: Number(r.variationCount) }));
}

export interface BrandVariationRow {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
}

export interface BrandSkillDetail {
  id: string;
  name: string;
  description: string;
  variations: BrandVariationRow[];
}

export async function getBrandSkillWithVariations(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<BrandSkillDetail | null> {
  const [skill] = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.id, skillId))
    .limit(1);
  if (!skill || skill.trainerId != null || skill.organizationId !== organizationId) return null;
  const variations = await db
    .select({
      id: schema.skillVariations.id,
      exerciseId: schema.skillVariations.exerciseId,
      ordinal: schema.skillVariations.ordinal,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(eq(schema.skillVariations.skillId, skillId))
    .orderBy(asc(schema.skillVariations.ordinal));
  return { id: skill.id, name: skill.name, description: skill.description, variations };
}

export async function createBrandSkill(
  db: Db,
  organizationId: string,
  name: string,
  description: string,
): Promise<schema.Skill> {
  try {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId: null, organizationId, name, description })
      .returning();
    return row!;
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_org_name_uniq")) {
      throw new BrandCatalogError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}
```

> UWAGA — unikalność nazwy: trenerska `createSkill` łapie `skills_trainer_name_uniq`.
> Sprawdź w `schema.ts`, czy istnieje analogiczny unikalny indeks dla markowych
> (`skills_org_name_uniq` lub podobny). Jeśli **nie istnieje**, NIE wymyślaj nazwy —
> pomiń blok `catch` dla duplikatu (zwracaj surowy błąd) i zanotuj w handoffie, że
> ewentualny markowy unikat nazwy to przyszła decyzja. Dostosuj `updateBrandSkill`
> tak samo.

```ts
export async function updateBrandSkill(
  db: Db,
  organizationId: string,
  skillId: string,
  name: string,
  description: string,
): Promise<void> {
  await db
    .update(schema.skills)
    .set({ name, description })
    .where(
      and(
        eq(schema.skills.id, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    );
}

export async function archiveBrandSkill(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.skills)
      .set({ archivedAt: sql`now()` })
      .where(
        and(
          eq(schema.skills.id, skillId),
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, organizationId),
        ),
      );
    await tx
      .delete(schema.skillPrerequisites)
      .where(
        and(
          isNull(schema.skillPrerequisites.trainerId),
          eq(schema.skillPrerequisites.organizationId, organizationId),
          or(
            eq(schema.skillPrerequisites.skillId, skillId),
            eq(schema.skillPrerequisites.requiresSkillId, skillId),
          ),
        ),
      );
  });
}

/** Markowe ćwiczenie org jest wariantem AKTYWNEJ markowej umiejętności? (blokada archiwizacji) */
export async function findBrandSkillForExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<{ skillId: string; skillName: string } | null> {
  const [row] = await db
    .select({ skillId: schema.skills.id, skillName: schema.skills.name })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.exerciseId, exerciseId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Markowe ćwiczenia org nieprzypisane do żadnej markowej umiejętności (picker wariantu). */
export async function listAssignableBrandExercises(
  db: Db,
  organizationId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  const [exercises, taken] = await Promise.all([
    db
      .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
      .from(schema.exercises)
      .where(
        and(
          isNull(schema.exercises.trainerId),
          eq(schema.exercises.organizationId, organizationId),
          isNull(schema.exercises.archivedAt),
        ),
      )
      .orderBy(asc(schema.exercises.name)),
    db
      .select({ exerciseId: schema.skillVariations.exerciseId })
      .from(schema.skillVariations)
      .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
      .where(and(isNull(schema.skills.trainerId), eq(schema.skills.organizationId, organizationId))),
  ]);
  const takenSet = new Set(taken.map((r) => r.exerciseId));
  return exercises.filter((e) => !takenSet.has(e.id));
}

/** Dodaje wariant na koniec drabiny markowej umiejętności. Waliduje markową własność obu. */
export async function addBrandVariation(
  db: Db,
  organizationId: string,
  skillId: string,
  exerciseId: string,
): Promise<void> {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.id, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!skill) throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");

  const [exercise] = await db
    .select({ id: schema.exercises.id, archivedAt: schema.exercises.archivedAt })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!exercise) throw new BrandCatalogError("not found", "Nie znaleziono ćwiczenia.");
  if (exercise.archivedAt != null) {
    throw new BrandCatalogError("archived", "Nie można dodać zarchiwizowanego ćwiczenia jako wariantu.");
  }

  // Reguła „≤1 markowa umiejętność w org": ćwiczenie nie może już być wariantem innej.
  const existing = await findBrandSkillForExercise(db, organizationId, exerciseId);
  if (existing && existing.skillId !== skillId) {
    throw new BrandCatalogError("exercise taken", "To ćwiczenie jest już wariantem innej umiejętności.");
  }

  const [maxRow] = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.skillVariations.ordinal}), 0)::int` })
    .from(schema.skillVariations)
    .where(eq(schema.skillVariations.skillId, skillId));
  const nextOrdinal = Number(maxRow?.m ?? 0) + 1;
  try {
    await db.insert(schema.skillVariations).values({ skillId, exerciseId, ordinal: nextOrdinal });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_variations_skill_ordinal_uniq")) {
      throw new BrandCatalogError("ordinal race", "Nie udało się dodać wariantu — spróbuj ponownie.");
    }
    if (e instanceof Error && e.message.includes("skill_variations_skill_exercise")) {
      throw new BrandCatalogError("exercise taken", "To ćwiczenie jest już wariantem tej umiejętności.");
    }
    throw e;
  }
}

/** Usuwa wariant markowej umiejętności + przepakowuje ordinale (dwufazowo). */
export async function removeBrandVariation(
  db: Db,
  organizationId: string,
  skillId: string,
  variationId: string,
): Promise<void> {
  const [v] = await db
    .select({ id: schema.skillVariations.id })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.id, variationId),
        eq(schema.skillVariations.skillId, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!v) throw new BrandCatalogError("not found", "Nie znaleziono wariantu.");
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.skillVariations).where(eq(schema.skillVariations.id, variationId));
      const remaining = await tx
        .select({ id: schema.skillVariations.id })
        .from(schema.skillVariations)
        .where(eq(schema.skillVariations.skillId, skillId))
        .orderBy(asc(schema.skillVariations.ordinal));
      for (let i = 0; i < remaining.length; i++) {
        await tx
          .update(schema.skillVariations)
          .set({ ordinal: -(i + 1) })
          .where(eq(schema.skillVariations.id, remaining[i]!.id));
      }
      for (let i = 0; i < remaining.length; i++) {
        await tx
          .update(schema.skillVariations)
          .set({ ordinal: i + 1 })
          .where(eq(schema.skillVariations.id, remaining[i]!.id));
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_advancements")) {
      throw new BrandCatalogError(
        "referenced",
        "Nie można usunąć — ten wariant jest użyty w historii awansów. Zarchiwizuj umiejętność zamiast tego.",
      );
    }
    throw e;
  }
}

/** Ustawia kolejność wariantów markowej umiejętności wg listy id (dwufazowo). */
export async function reorderBrandVariations(
  db: Db,
  organizationId: string,
  skillId: string,
  variationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const [skill] = await tx
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, skillId),
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!skill) throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");
    const current = await tx
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .where(eq(schema.skillVariations.skillId, skillId));
    const currentIds = new Set(current.map((c) => c.id));
    if (currentIds.size !== variationIds.length || variationIds.some((id) => !currentIds.has(id))) {
      throw new BrandCatalogError("mismatch", "Lista wariantów nie zgadza się z umiejętnością.");
    }
    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: -(i + 1) })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: i + 1 })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
  });
}
```

> Rozszerz import z `drizzle-orm` o `or, sql` (Task 4 miał `and, asc, eq, isNull`;
> `sql` używane w `listBrandSkills`/`addBrandVariation`/`archiveBrandSkill`, `or` w
> `archiveBrandSkill`).
> Sprawdź dokładną nazwę UNIQUE wariantu w `schema.ts` (mirror `skills.ts` używa
> `skill_variations_skill_ordinal_uniq`); jeśli istnieje też unikat
> `(skill_id, exercise_id)`, dopasuj podłańcuch w `catch` do jego realnej nazwy
> (sprawdź w `schema.ts`) — inaczej usuń ten gałąź catch.

- [ ] **Step 2: Typecheck + build + lint**

Run: `npm run typecheck`
Run: `npm run build`
Run: `npx biome format --write app/lib/brand-catalog.ts`
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Review**

`/code-review`.

---

## Task 6: `brand-catalog.ts` — prerekwizyty + drzewo marki

**Files:**
- Modify: `app/lib/brand-catalog.ts`

> Mirror `skills.ts` (addPrerequisite/removePrerequisite/listPrerequisitesForSkill/
> listAssignablePrerequisites) + `skill-tree.ts` (getSkillTreeForTrainer), brand-scoped.
> Reuse `wouldCreateCycle`, `assignLayers`, `orderWithinLayer` z `skill-tree-math.ts`.

- [ ] **Step 1: Dopisz prerekwizyty + budowę drzewa**

Dodaj do importów na górze pliku (rozszerz też `drizzle-orm` o `inArray` — używane w
`bothBrandSkillsActive`):

```ts
import { assignLayers, orderWithinLayer, wouldCreateCycle, type Edge } from "~/lib/skill-tree-math";
import type { SkillTree, TreeNode } from "~/lib/skill-tree";
// drizzle-orm: dodaj `inArray` → `import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";`
```

Funkcje:

```ts
// ---------- Prerekwizyty marki (DAG) ----------

/** Wszystkie krawędzie markowe org (do cykli i drzewa). */
async function listBrandEdges(db: Db, organizationId: string): Promise<Edge[]> {
  const rows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
      ),
    );
  return rows.map((r) => ({ from: r.from, requires: r.requires }));
}

/** Czy obie umiejętności są markowe w tej org i aktywne? */
async function bothBrandSkillsActive(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
        inArray(schema.skills.id, [skillId, requiresSkillId]),
      ),
    );
  return new Set(rows.map((r) => r.id)).size === 2;
}

export async function addBrandPrerequisite(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  if (skillId === requiresSkillId) {
    throw new BrandCatalogError("self loop", "Umiejętność nie może wymagać samej siebie.");
  }
  if (!(await bothBrandSkillsActive(db, organizationId, skillId, requiresSkillId))) {
    throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");
  }
  const edges = await listBrandEdges(db, organizationId);
  if (wouldCreateCycle(edges, skillId, requiresSkillId)) {
    throw new BrandCatalogError("cycle", "To połączenie utworzyłoby cykl w drzewie.");
  }
  try {
    await db
      .insert(schema.skillPrerequisites)
      .values({ trainerId: null, organizationId, skillId, requiresSkillId });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_prerequisites_edge_uniq")) {
      throw new BrandCatalogError("duplicate", "Ten prerekwizyt jest już dodany.");
    }
    throw e;
  }
}

export async function removeBrandPrerequisite(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  await db
    .delete(schema.skillPrerequisites)
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
        eq(schema.skillPrerequisites.skillId, skillId),
        eq(schema.skillPrerequisites.requiresSkillId, requiresSkillId),
      ),
    );
}

export async function listBrandPrerequisitesForSkill(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  return await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skillPrerequisites)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillPrerequisites.requiresSkillId))
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
        eq(schema.skillPrerequisites.skillId, skillId),
      ),
    )
    .orderBy(asc(schema.skills.name));
}

export async function listAssignableBrandPrerequisites(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  const all = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .orderBy(asc(schema.skills.name));
  const edges = await listBrandEdges(db, organizationId);
  const existing = new Set(edges.filter((e) => e.from === skillId).map((e) => e.requires));
  return all.filter(
    (s) => s.id !== skillId && !existing.has(s.id) && !wouldCreateCycle(edges, skillId, s.id),
  );
}

/** Drzewo markowych umiejętności org (szkielet autora — bez stanów per-podopieczny). */
export async function getBrandSkillTree(db: Db, organizationId: string): Promise<SkillTree> {
  const skills = await listBrandSkills(db, organizationId);
  const activeIds = new Set(skills.map((s) => s.id));
  const allEdges = await listBrandEdges(db, organizationId);
  const edges = allEdges.filter((e) => activeIds.has(e.from) && activeIds.has(e.requires));

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
    orderWithinLayer(group, nameById).forEach((id, i) => pos.set(id, { layer: l, orderInLayer: i }));
  }
  const nodes: TreeNode[] = skills.map((s) => ({
    skillId: s.id,
    name: s.name,
    layer: pos.get(s.id)?.layer ?? 0,
    orderInLayer: pos.get(s.id)?.orderInLayer ?? 0,
    variationCount: s.variationCount,
    currentVariationId: null,
    currentExerciseId: null,
    currentOrdinal: null,
  }));
  return { nodes, edges };
}
```

- [ ] **Step 2: Typecheck + build + lint**

Run: `npm run typecheck`
Run: `npm run build`
Run: `npx biome format --write app/lib/brand-catalog.ts`
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Review**

`/code-review` (cały `brand-catalog.ts` jest teraz kompletny — przejrzyj spójność scope'u org we wszystkich funkcjach).

---

## Task 7: i18n — namespace `marka` (pl + fr)

**Files:**
- Modify: `app/locales/pl/marka.json`
- Modify: `app/locales/fr/marka.json`

> Test parzystości kluczy pl/fr MUSI przejść. Dodaj te same klucze do obu plików
> (fr — tłumaczenia francuskie). Klucze poniżej są minimalne; warstwa wizualna
> (Task 8–10) może dorzucić kolejne — utrzymuj parzystość.

- [ ] **Step 1: Rozszerz `pl/marka.json`**

Zamień zawartość `app/locales/pl/marka.json` na (zachowaj `pulpit`, dostosuj treść):

```json
{
  "pulpit": {
    "eyebrow": "Panel marki",
    "title": "Pulpit marki",
    "exercisesCard": "Markowe ćwiczenia",
    "skillsCard": "Markowe umiejętności",
    "manageExercises": "Zarządzaj ćwiczeniami",
    "manageSkills": "Zarządzaj umiejętnościami"
  },
  "nav": {
    "section": "Marka",
    "dashboard": "Pulpit",
    "library": "Biblioteka ćwiczeń",
    "skills": "Umiejętności",
    "ambassadors": "Ambasadorzy",
    "regions": "Regiony",
    "settings": "Ustawienia marki",
    "soon": "wkrótce"
  },
  "biblioteka": {
    "title": "Markowe ćwiczenia",
    "eyebrow": "Katalog marki",
    "new": "Nowe ćwiczenie",
    "empty": "Brak markowych ćwiczeń. Dodaj pierwsze.",
    "searchPlaceholder": "Szukaj ćwiczenia…"
  },
  "bibliotekaForm": {
    "eyebrow": "Katalog marki",
    "newTitle": "Nowe markowe ćwiczenie",
    "crumbsLibrary": "Biblioteka ćwiczeń",
    "crumbNew": "Nowe",
    "fieldName": "Nazwa",
    "namePlaceholder": "np. Pull-up",
    "fieldUnit": "Jednostka",
    "unitReps": "Powtórzenia",
    "unitSec": "Sekundy",
    "fieldDescription": "Opis",
    "descriptionPlaceholder": "Wskazówki techniczne…",
    "rpeTitle": "Zbieraj RPE",
    "rpeHint": "Podopieczny oceni trudność serii 1–10.",
    "demoLabel": "Demo wideo",
    "demoReplaceLabel": "Podmień demo wideo",
    "currentDemo": "Bieżące demo",
    "saveNew": "Dodaj ćwiczenie",
    "saveEdit": "Zapisz zmiany",
    "cancel": "Anuluj",
    "archive": "Archiwizuj",
    "unarchive": "Przywróć",
    "archived": "Zarchiwizowane",
    "archiveConfirmTitle": "Zarchiwizować ćwiczenie?",
    "archiveConfirmMessage": "Ćwiczenie zniknie z aktywnego katalogu marki.",
    "archiveConfirmText": "Archiwizuj",
    "errors": {
      "nameRequired": "Podaj nazwę ćwiczenia.",
      "formInvalid": "Formularz zawiera błędy.",
      "exerciseIsVariant": "Nie można zarchiwizować — ćwiczenie jest wariantem umiejętności „{{skill}}”."
    }
  },
  "umiejetnosci": {
    "title": "Markowe umiejętności",
    "eyebrow": "Katalog marki",
    "new": "Nowa umiejętność",
    "empty": "Brak markowych umiejętności. Dodaj pierwszą.",
    "variationsCount": "{{count}} wariant(ów)",
    "treeTitle": "Drzewo umiejętności marki"
  },
  "umiejetnosciForm": {
    "newTitle": "Nowa markowa umiejętność",
    "crumbs": "Umiejętności",
    "crumbNew": "Nowa",
    "fieldName": "Nazwa",
    "fieldDescription": "Opis",
    "save": "Zapisz",
    "cancel": "Anuluj",
    "variations": "Warianty",
    "addVariation": "Dodaj wariant",
    "removeVariation": "Usuń",
    "moveUp": "W górę",
    "moveDown": "W dół",
    "prereqs": "Wymaga",
    "addPrereq": "Dodaj prerekwizyt",
    "removePrereq": "Usuń",
    "archive": "Archiwizuj umiejętność",
    "archiveConfirmTitle": "Zarchiwizować umiejętność?",
    "archiveConfirmMessage": "Umiejętność i jej powiązania prerekwizytów zostaną odpięte.",
    "archiveConfirmText": "Archiwizuj",
    "errors": {
      "nameRequired": "Podaj nazwę umiejętności.",
      "formInvalid": "Formularz zawiera błędy.",
      "generic": "Operacja nie powiodła się."
    }
  }
}
```

- [ ] **Step 2: Dodaj te same klucze do `fr/marka.json`** (tłumaczenia FR; struktura identyczna).

- [ ] **Step 3: Test parzystości kluczy**

Run: `npx vitest run app/locales`
Expected: PASS (test parzystości pl/fr zielony). Jeśli nazwa pliku testu inna,
uruchom `npx vitest run` z wzorcem wskazującym test parzystości locale (sprawdź
`app/locales/README.md`).

- [ ] **Step 4: Review**

`/code-review` (parzystość + sensowność FR).

---

## Task 8: Powłoka `/marka` — sidenav + lekki pulpit

**Files:**
- Modify: `app/routes/marka/_layout.tsx`
- Modify: `app/routes/marka/_index.tsx`
- Modify: `app/routes.ts`

> Warstwa wizualna → `frontend-design:frontend-design`. Wzorzec powłoki:
> `app/routes/trener/_layout.tsx` (sidenav, NavLink, Icons, liczniki). Pozycje
> „Ambasadorzy/Regiony/Ustawienia marki" renderuj jako nieaktywne (span z etykietą
> „wkrótce"), nie NavLink.

- [ ] **Step 1: Wepnij trasy w `app/routes.ts`**

Zamień wpis `marka` na:

```ts
  ...prefix("marka", [
    layout("routes/marka/_layout.tsx", [
      index("routes/marka/_index.tsx"),
      route("biblioteka", "routes/marka/biblioteka._index.tsx"),
      route("biblioteka/nowe", "routes/marka/biblioteka.nowe.tsx"),
      route("biblioteka/:exerciseId", "routes/marka/biblioteka.$exerciseId.tsx"),
      route("umiejetnosci", "routes/marka/umiejetnosci._index.tsx"),
      route("umiejetnosci/nowa", "routes/marka/umiejetnosci.nowa.tsx"),
      route("umiejetnosci/:skillId", "routes/marka/umiejetnosci.$skillId.tsx"),
    ]),
  ]),
```

> Trasy z Tasków 9–10 jeszcze nie istnieją — utwórz w tym tasku puste szkielety
> (placeholder `export default`), żeby `routes.ts` się kompilował, a wypełnij je w
> Taskach 9–10. ALBO wykonaj Task 8 po 9–10. Rekomendacja: utwórz minimalne stuby
> teraz (loader zwraca `{}`, default renderuje nagłówek), pełna treść w 9–10.

- [ ] **Step 2: Rozbuduj `_layout.tsx` o sidenav + liczniki**

Zaimplementuj loader liczący markowe ćwiczenia i umiejętności org prezesa (404-safe
gdy brak org), mirrorując `trener/_layout.tsx`. Loader:

```ts
import { and, count, eq, isNull } from "drizzle-orm";
import { NavLink, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  let exercises = 0;
  let skills = 0;
  if (orgId) {
    const [ex] = await db
      .select({ c: count() })
      .from(schema.exercises)
      .where(
        and(
          isNull(schema.exercises.trainerId),
          eq(schema.exercises.organizationId, orgId),
          isNull(schema.exercises.archivedAt),
        ),
      );
    const [sk] = await db
      .select({ c: count() })
      .from(schema.skills)
      .where(
        and(
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, orgId),
          isNull(schema.skills.archivedAt),
        ),
      );
    exercises = Number(ex?.c ?? 0);
    skills = Number(sk?.c ?? 0);
  }
  return { user, tails: { exercises, skills } };
}
```

Default: topbar (jak obecnie) + `<div className="layout">` z `<nav className="sidenav">`
(pozycje aktywne: Pulpit `/marka` end, Biblioteka `/marka/biblioteka` z tail
`exercises`, Umiejętności `/marka/umiejetnosci` z tail `skills`; nieaktywne:
Ambasadorzy/Regiony/Ustawienia jako `<span className="nav-item disabled">` z
`nav.soon`) + `<main className="main view-fade"><Outlet/></main>`. Etykiety z
namespace `marka` (`nav.*`). Ikony z `Icons` (Library, Trend, Dashboard, Users,
Card/…); dobór ikon i finalny wygląd → frontend-design.

- [ ] **Step 3: Lekki pulpit `_index.tsx`**

Loader liczy te same liczniki (lub czyta z layoutu — prościej policzyć ponownie via
`listBrandExercises`/`listBrandSkills` length). Default: dwie karty KPI (liczba
markowych ćwiczeń / umiejętności) z linkami do sekcji. Treść z `marka:pulpit.*`.
Wygląd → frontend-design (karty w stylu dashboardu trenera).

```ts
export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) return { exercises: 0, skills: 0 };
  const [exercises, skills] = await Promise.all([
    listBrandExercises(db, orgId),
    listBrandSkills(db, orgId),
  ]);
  return { exercises: exercises.length, skills: skills.length };
}
```

- [ ] **Step 4: Bramki**

Run: `npm run typecheck`
Run: `npm run build`
Run: `npm run lint`
Expected: PASS. Wizualnie sprawdź przez `npm run shots` jeśli stack działa (opcjonalnie, właściciel).

- [ ] **Step 5: Review**

`/code-review` + (UI) zgodność z design-system.

---

## Task 9: Trasy `/marka/biblioteka*` — autorstwo markowych ćwiczeń

**Files:**
- Modify/Create: `app/routes/marka/biblioteka._index.tsx`
- Modify/Create: `app/routes/marka/biblioteka.nowe.tsx`
- Modify/Create: `app/routes/marka/biblioteka.$exerciseId.tsx`

> Warstwa wizualna → `frontend-design:frontend-design`. Wzorce (czytaj jako
> szablon, NIE kopiuj 1:1): `app/routes/trener/biblioteka._index.tsx`,
> `…/biblioteka.nowe.tsx`, `…/biblioteka.$exerciseId.tsx`. Różnice obowiązkowe:
> rola `brand_admin`; `orgId = user.organizationId` (gdy null → `throw new
> Response("not found", { status: 404 })`); BEZ kategorii (`CategoryPicker`/
> `listCategoriesForTrainer` — pomiń; `tags` = `[]`); repo = `brand-catalog`;
> `uploadFile` z `owner: { organizationId: orgId }`; redirecty na `/marka/biblioteka`;
> namespace i18n `marka`; brak forka/badge „Marka" (to JEST marka).

- [ ] **Step 1: `biblioteka.nowe.tsx` (akcja create)**

Loader: `requireUser({role:"brand_admin"})`, zwróć `{}` (brak kategorii). Akcja:
walidacja Zod (jak `ExerciseSchema` w trenerze, bez kategorii), upload demo w
transakcji z `owner: { organizationId: orgId }`, potem `createBrandExercise(tx,
orgId, { name, unit, description, tracksRpe, tags: [], demoFileId })`,
`UploadCleanupQueue`, redirect `/marka/biblioteka`. Komponent: formularz jak w
trenerze MINUS `CategoryPicker`. Pełny szkielet akcji:

```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const fd = await args.request.formData();
  const parsed = ExerciseSchema.safeParse({
    name: fd.get("name"),
    unit: fd.get("unit"),
    description: fd.get("description") ?? "",
    tracksRpe: fd.get("tracksRpe") === "on",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    return {
      errorKey:
        issue === "nameRequired"
          ? ("bibliotekaForm.errors.nameRequired" as const)
          : ("bibliotekaForm.errors.formInvalid" as const),
    };
  }
  const demoBlob = fd.get("demo");
  const hasDemo = demoBlob instanceof File && demoBlob.size > 0;
  const cleanup = new UploadCleanupQueue(db);
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = null;
      if (hasDemo) {
        const uploaded = await uploadFile(
          tx,
          { file: demoBlob as File, kind: "exercise_demo", owner: { organizationId: orgId }, uploadedBy: user.id },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await createBrandExercise(tx, orgId, {
        name: parsed.data.name,
        unit: parsed.data.unit,
        description: parsed.data.description,
        tracksRpe: parsed.data.tracksRpe,
        tags: [],
        demoFileId,
      });
    });
    cleanup.commit();
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError)
      return { errorKey: "bibliotekaForm.errors.formInvalid" as const, errorMessage: e.userMessage };
    throw e;
  }
  throw redirect("/marka/biblioteka");
}
```

- [ ] **Step 2: `biblioteka._index.tsx` (lista)**

Loader: `listBrandExercises(db, orgId)`; zastosuj sort/szukajkę in-memory przez
`parseListControls`/`buildControlHref` z `~/lib/list-params` (dataset mały — filtr
w loaderze jest OK) + prostą paginację (mirror `pagination.tsx`/`parsePage`).
Komponent: nagłówek + `<ListControls>` (sort: nazwa A–Z/Z–A; szukajka po nazwie) +
lista `list-row` linkująca do `/marka/biblioteka/:id` + przycisk „Nowe ćwiczenie".
Bez filtra jednostki/kategorii (lub zostaw filtr jednostki jeśli prosty). Stan pusty:
`marka:biblioteka.empty`.

- [ ] **Step 3: `biblioteka.$exerciseId.tsx` (edycja/demo/archiwizacja)**

Loader: `getBrandExercise(db, orgId, exerciseId)`; null → 404; podpisz URL demo
`signFileUrl(demoFile.id, user.id)`. Akcja (intencje `archive`/`unarchive`/save):
`archive` woła `findBrandSkillForExercise` — jeśli wariant aktywnej umiejętności,
zwróć błąd `bibliotekaForm.errors.exerciseIsVariant`; inaczej `archiveBrandExercise`.
`unarchive` → `restoreBrandExercise`. Save: walidacja, podmiana demo w transakcji
(mirror trenera: `deleteFileRow` starego, blob po commit; `owner: { organizationId:
orgId }`), `updateBrandExercise`. Komponent: jak trenerska gałąź „nie-brand"
(formularz + osobny `<Form>` archiwizacji), BEZ gałęzi brand/fork i BEZ
`CategoryPicker`. Pełny szkielet akcji save+archive:

```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const exerciseId = args.params.exerciseId ?? "";
  const current = await getBrandExercise(db, orgId, exerciseId);
  if (!current) throw new Response("not found", { status: 404 });
  const exercise = current.exercise;
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "archive") {
    const skill = await findBrandSkillForExercise(db, orgId, exerciseId);
    if (skill) {
      return {
        errorKey: "bibliotekaForm.errors.exerciseIsVariant" as const,
        errorValues: { skill: skill.skillName },
      };
    }
    await archiveBrandExercise(db, orgId, exerciseId);
    throw redirect("/marka/biblioteka");
  }
  if (intent === "unarchive") {
    await restoreBrandExercise(db, orgId, exerciseId);
    throw redirect(`/marka/biblioteka/${exerciseId}`);
  }

  const parsed = EditSchema.safeParse({
    name: fd.get("name"),
    unit: fd.get("unit"),
    description: fd.get("description") ?? "",
    tracksRpe: fd.get("tracksRpe") === "on",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    return {
      errorKey:
        issue === "nameRequired"
          ? ("bibliotekaForm.errors.nameRequired" as const)
          : ("bibliotekaForm.errors.formInvalid" as const),
    };
  }
  const demoBlob = fd.get("demo");
  const hasNewDemo = demoBlob instanceof File && demoBlob.size > 0;
  const cleanup = new UploadCleanupQueue(db);
  let oldDemoStoragePathToDelete: string | null = null;
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = exercise.demoFileId;
      const oldDemoFileId = exercise.demoFileId;
      if (hasNewDemo) {
        const uploaded = await uploadFile(
          tx,
          { file: demoBlob as File, kind: "exercise_demo", owner: { organizationId: orgId }, uploadedBy: user.id },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await updateBrandExercise(tx, orgId, exerciseId, {
        name: parsed.data.name,
        unit: parsed.data.unit,
        description: parsed.data.description,
        tracksRpe: parsed.data.tracksRpe,
        tags: [],
        demoFileId,
      });
      if (hasNewDemo && oldDemoFileId) {
        oldDemoStoragePathToDelete = await deleteFileRow(tx, oldDemoFileId);
      }
    });
    cleanup.commit();
    if (oldDemoStoragePathToDelete) {
      try { await deleteFileBlob(oldDemoStoragePathToDelete); } catch {}
    }
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError)
      return { errorKey: "bibliotekaForm.errors.formInvalid" as const, errorMessage: e.userMessage };
    throw e;
  }
  throw redirect("/marka/biblioteka");
}
```

(`EditSchema`/`ExerciseSchema` skopiuj z trenerskiej trasy — to lokalne stałe trasy,
nie współdzielone; powtórzenie między trasami jest tu akceptowalne.)

- [ ] **Step 4: Bramki**

Run: `npm run typecheck`
Run: `npm run build`
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Review**

`/code-review` (org-scope w loaderach/akcjach: każde 404 na braku org / obcym wierszu) + UI.

---

## Task 10: Trasy `/marka/umiejetnosci*` — autorstwo umiejętności + drzewo

**Files:**
- Modify/Create: `app/routes/marka/umiejetnosci._index.tsx`
- Modify/Create: `app/routes/marka/umiejetnosci.nowa.tsx`
- Modify/Create: `app/routes/marka/umiejetnosci.$skillId.tsx`

> Warstwa wizualna → `frontend-design:frontend-design`. Wzorce: trenerskie
> `umiejetnosci._index.tsx` (lista + `SkillTreeView`), `umiejetnosci.nowa.tsx`
> (create → redirect do edycji), `umiejetnosci.$skillId.tsx` (warianty + prereq +
> archiwizacja). Różnice: rola `brand_admin`; `orgId` (null → 404); repo
> `brand-catalog`; bez badge „Marka"/forka; hrefy `/marka/umiejetnosci*`; namespace
> `marka`. `SkillTreeView` z `showStates={false}`, `hrefForNode = (id) =>
> /marka/umiejetnosci/${id}`.

- [ ] **Step 1: `umiejetnosci.nowa.tsx`**

Loader `requireUser({role:"brand_admin"})`. Akcja: Zod (name min 1, description),
`createBrandSkill(db, orgId, name, description)`, redirect
`/marka/umiejetnosci/:id`. Formularz nazwa+opis.

```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const fd = await args.request.formData();
  const name = (fd.get("name") ?? "").toString().trim();
  const description = (fd.get("description") ?? "").toString();
  if (name.length === 0) return { errorKey: "umiejetnosciForm.errors.nameRequired" as const };
  try {
    const skill = await createBrandSkill(db, orgId, name, description);
    throw redirect(`/marka/umiejetnosci/${skill.id}`);
  } catch (e) {
    if (e instanceof BrandCatalogError) return { errorKey: "umiejetnosciForm.errors.generic" as const, errorMessage: e.userMessage };
    throw e;
  }
}
```

> `throw redirect` wewnątrz `try` — pamiętaj, że redirect rzuca `Response`; nie łap go
> jako `BrandCatalogError`. Powyższy `catch` łapie tylko `BrandCatalogError`, więc
> redirect przechodzi (Response nie jest instancją BrandCatalogError). OK.

- [ ] **Step 2: `umiejetnosci._index.tsx` (lista + drzewo)**

Loader: `listBrandSkills(db, orgId)` + `getBrandSkillTree(db, orgId)`. Komponent:
nagłówek + przycisk „Nowa umiejętność" + `<SkillTreeView tree={tree}
hrefForNode={(id)=>`/marka/umiejetnosci/${id}`} showStates={false} />` + lista
umiejętności (link do edycji, `variationsCount`). Stan pusty `marka:umiejetnosci.empty`.

- [ ] **Step 3: `umiejetnosci.$skillId.tsx` (edytor)**

Loader: `getBrandSkillWithVariations(db, orgId, skillId)` (null→404) +
`listAssignableBrandExercises` + `listBrandPrerequisitesForSkill` +
`listAssignableBrandPrerequisites`. Akcja — intencje (mirror trenera):
`save` → `updateBrandSkill`; `add-variation` → `addBrandVariation`;
`remove-variation` → `removeBrandVariation`; `move` (reorder: zbuduj nową kolejność
id i wołaj `reorderBrandVariations`); `add-prereq` → `addBrandPrerequisite`;
`remove-prereq` → `removeBrandPrerequisite`; `archive` → `archiveBrandSkill` +
redirect `/marka/umiejetnosci`. Każdą `BrandCatalogError` mapuj na
`{ errorKey, errorMessage: e.userMessage }`. Komponent: mirror trenerskiego edytora
(sekcje: dane, warianty z dodaj/usuń/strzałki, „Wymaga:" prereq), z
`VariationLadder`/`SkillTreeView` jeśli trener ich używa — dobór i wygląd przez
frontend-design. Szkielet dispatchera akcji:

```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const skillId = args.params.skillId ?? "";
  const fd = await args.request.formData();
  const intent = (fd.get("intent") ?? "").toString();
  try {
    if (intent === "save") {
      const name = (fd.get("name") ?? "").toString().trim();
      const description = (fd.get("description") ?? "").toString();
      if (name.length === 0) return { errorKey: "umiejetnosciForm.errors.nameRequired" as const };
      await updateBrandSkill(db, orgId, skillId, name, description);
      return { ok: true as const };
    }
    if (intent === "add-variation") {
      await addBrandVariation(db, orgId, skillId, (fd.get("exerciseId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "remove-variation") {
      await removeBrandVariation(db, orgId, skillId, (fd.get("variationId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "move") {
      const ids = fd.getAll("variationIds").map((v) => v.toString());
      await reorderBrandVariations(db, orgId, skillId, ids);
      return { ok: true as const };
    }
    if (intent === "add-prereq") {
      await addBrandPrerequisite(db, orgId, skillId, (fd.get("requiresSkillId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "remove-prereq") {
      await removeBrandPrerequisite(db, orgId, skillId, (fd.get("requiresSkillId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "archive") {
      await archiveBrandSkill(db, orgId, skillId);
      throw redirect("/marka/umiejetnosci");
    }
    return { errorKey: "umiejetnosciForm.errors.generic" as const };
  } catch (e) {
    if (e instanceof BrandCatalogError)
      return { errorKey: "umiejetnosciForm.errors.generic" as const, errorMessage: e.userMessage };
    throw e;
  }
}
```

> „move" — sposób budowy `variationIds`: mirror trenerskiej trasy (czy wysyła pełną
> nową kolejność, czy przesuwa jeden element). Sprawdź `trener/umiejetnosci.$skillId.tsx`
> i odwzoruj jego format formularza reorder, by `reorderBrandVariations` dostał pełną
> listę bieżących wariantów.

- [ ] **Step 4: Bramki**

Run: `npm run typecheck`
Run: `npm run build`
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Review**

`/code-review` (scope org we wszystkich intencjach; cykl/duplikat/own-rules) + UI.

---

## Task 11: Testy integracyjne (PISANE — uruchamia właściciel)

**Files:**
- Create: `app/lib/brand-catalog.itest.ts`

> NIE uruchamiaj (Docker/testcontainers — właściciel). Wzorzec setupu: istniejące
> `*.itest.ts` w repo (`tests/` lub `app/lib/*.itest.ts` — sprawdź konwencję,
> np. helper podnoszący kontener Postgres + migracje + seed org/prezes/trener).

- [ ] **Step 1: Napisz scenariusze** (każdy jako `it`):
  1. Prezes tworzy markowe ćwiczenie z demo → wiersz `trainer_id NULL`,
     `organization_id = org`; plik `files` ma `organization_id` (CHECK OK),
     `trainer_id NULL`; `signFileUrl`/`verifyFileUrl` dla prezesa działa; bez podpisu 404.
  2. Markowe demo czytelne dla TRENERA tej org (przez `fileIsBrandDemoInOrg` w
     `files.$fileId` loaderze) i dla PODOPIECZNEGO; nieczytelne dla użytkownika z innej org.
  3. Prezes tworzy umiejętność, dodaje 2 warianty (markowe ćwiczenia) → ordinale 1,2;
     `removeBrandVariation` przepakowuje do 1; `reorderBrandVariations` zmienia kolejność.
  4. `addBrandVariation` odrzuca ćwiczenie już będące wariantem innej markowej umiejętności;
     odrzuca zarchiwizowane.
  5. `addBrandPrerequisite` odrzuca self-loop i cykl (A→B, potem B→A); `getBrandSkillTree`
     układa warstwy.
  6. **Izolacja:** funkcje brand-catalog z `organizationId` org#1 zwracają null/404 dla
     wiersza org#2; trener NIE może edytować markowego wiersza (markowy read-only —
     `addVariation` trenera nie obejmuje markowych).
  7. **Regresja `files`:** istniejący trenerski upload (`owner: { trainerId }`) nadal
     działa i jest czytelny dla trenera po migracji.
  8. `archiveBrandExercise` zablokowane gdy ćwiczenie jest wariantem aktywnej markowej
     umiejętności (przez trasę/`findBrandSkillForExercise`).

- [ ] **Step 2: Typecheck (kompilacja testu)**

Run: `npm run typecheck`
Expected: PASS (test się kompiluje).

- [ ] **Step 3: Handoff-nota**

Zanotuj komendę do uruchomienia przez właściciela (mirror innych itestów, np.
`npm run test:itest` lub `npx vitest run --config vitest.itest.config.ts` — sprawdź
`package.json`/`tests/README.md`).

- [ ] **Step 4: Review**

`/code-review` testów (czy asercje pokrywają tenant-scope i CHECK).

---

## Task 12: Dokumentacja

**Files:**
- Modify: `app/lib/README.md`, `app/routes/README.md`, `app/routes/marka/README.md`,
  `app/locales/README.md` (jeśli dotyczy), `CLAUDE.md`

- [ ] **Step 1:** `app/lib/README.md` — dodaj wiersz `brand-catalog.ts` (brand-scoped
  repo katalogu marki: ćwiczenia/umiejętności/warianty/prereq/drzewo; `BrandCatalogError`)
  oraz nowe predykaty w `authz.ts` (`ownsBrandScope`, `canWriteBrandCatalogRow`).
- [ ] **Step 2:** `app/routes/marka/README.md` — zastąp opis „placeholder" tabelą
  nowych tras (`_index` pulpit, `biblioteka.*`, `umiejetnosci.*`) + nota o org-scope (404).
- [ ] **Step 3:** `app/routes/README.md` — zaktualizuj wiersz `/marka/*` (z „placeholder"
  na „powłoka + autorstwo katalogu marki").
- [ ] **Step 4:** `CLAUDE.md` — mapa projektu: `app/lib/brand-catalog.ts` + rozszerzony
  obszar `/marka`. Jeśli zmienił się opis `files` — już zrobione w Tasku 1 (db README).
- [ ] **Step 5:** `/code-review` dokumentacji (czy nic nie wprowadza w błąd).

---

## Task 13: Bramki końcowe + handoff

- [ ] **Step 1: Pełne bramki**

Run: `npx vitest run` (wszystkie unit; NIE watch)
Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: wszystko PASS. Zacytuj wyniki (verification-before-completion — bez
dowodu nie twierdź „gotowe").

- [ ] **Step 2: `/security-review`**

Uruchom `/security-review` — zmiana dotyka uploadu, podpisanych URL, własności plików,
tenant-scope i nowej powierzchni roli. Zaadresuj findings.

- [ ] **Step 3: Handoff (granica gita)**

Wypisz: podsumowanie + lista zmienionych/utworzonych plików; proponowany komunikat
commita; nota: **wymagane** `npm run db:generate` (interaktywne — `files`:
nullable `trainer_id`, nowa `organization_id`, CHECK `files_owner_check`, indeks
`files_org_kind_idx`) → `npm run db:migrate`; brak nowych env; brak zmian seeda;
komenda uruchomienia `brand-catalog.itest.ts` pod Dockerem; ścieżka ręcznej
weryfikacji: login prezesa → `/marka` → utwórz markowe ćwiczenie z demo → sprawdź u
trenera (badge „Marka", read-only, demo gra) → utwórz umiejętność + warianty +
prereq → drzewo renderuje, cykl odrzucony. Git/migrate/deploy prowadzi właściciel.

---

## Notatki dla wykonawcy

- **Org-scope to inwariant bezpieczeństwa:** każda funkcja repo i każdy loader/akcja
  filtruje po `organizationId` prezesa; brak org lub obcy wiersz → **404** (nie 403).
- **Nie dotykaj** `skills.ts`, trenerskich odczytów w `catalog.ts` ani tras `/trener/*`
  (poza aktualizacją wywołań `uploadFile` w Tasku 3).
- **Reużywaj** czyste moduły (`skill-tree-math.ts`) i komponenty — nie duplikuj logiki.
- Przy niezgodności nazw indeksów/typów (`schema.ts`) — sprawdź realną nazwę w pliku,
  nie zgaduj; dostosuj podłańcuchy w `catch`.
- UI: trzymaj się design-system; brand `kalisthenos` małą literą; UI po polsku.
