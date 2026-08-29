# Faza A — uszczelnienie szwu `app/lib/*` (plan implementacji)

> **Dla agentów:** WYMAGANY SUB-SKILL: użyj `superpowers:subagent-driven-development`
> (zalecane) albo `superpowers:executing-plans` do wykonania zadanie-po-zadaniu.
> Kroki mają składnię checkboxów (`- [ ]`).

**Cel:** Usunąć z `app/routes/**` wszystkie zapytania budowane inline (43 wystąpienia
w 23 plikach) i trzy transakcje otwierane w trasach, tak by każdy dostęp do bazy szedł
przez funkcję z `app/lib/*` — czyli by szew, na którym w fazie C wykonamy cięcie do API,
był szczelny.

**Architektura:** Trasy zachowują dzisiejszą konwencję wstrzykiwania (`db` importowane
w trasie i przekazywane jako pierwszy argument funkcji `lib/*`) — to **nie jest** przeciek
i nie zmieniamy tego. Zmieniamy wyłącznie to, że trasa przestaje sama składać zapytania
Drizzle i otwierać transakcje. Każda wydobyta funkcja trafia do modułu odpowiadającego
kontekstowi z analizy DDD i przyjmuje wymagany `trainerId`/`traineeId`, po którym filtruje.

**Stack:** TypeScript (strict), Drizzle ORM, React Router v7, Vitest, testcontainers, Biome.

## Global Constraints

- **Zero zmian zachowania.** Każde wydobyte zapytanie zachowuje identyczne warunki `WHERE`,
  `ORDER BY`, `LIMIT` i kształt zwracanego obiektu. Jedyny wyjątek jest jawny i opisany
  w Zadaniu 3 (dopisanie `trainer_id` do `WHERE` przy archiwizacji ćwiczenia).
- **Sygnatura repozytorium:** `(db: Db, ...)` — `Db` z `~/lib/db/client`. Argument
  `trainerId`/`traineeId` jest wymagany i wchodzi do `WHERE`, nigdy nie jest opcjonalny.
- **Po zakończeniu fazy żaden plik w `app/routes/**` nie importuje `~/lib/db/schema`**
  ani nie wywołuje `db.select(` / `.insert(` / `.update(` / `.delete(` / `.$with(` /
  `db.transaction(`. Pilnuje tego test z Zadania 10.
- **Testy:** jednostkowe (bez DB) leżą przy kodzie jako `app/**/*.test.ts`; integracyjne
  jako `tests/*.itest.ts`. **Integracyjne uruchamia właściciel** (`npm run test:itest`,
  wymaga Dockera) — agent ich nie odpala.
- **Komendy dozwolone agentowi, pojedynczo, bez potoków i łańcuchów:**
  `npm run typecheck`, `npm run lint`, `npm run build`, `npx vitest run app`,
  `npx vitest run <ścieżka pliku>`, `npx biome format --write <plik>`.
  Uwaga: `npx vitest run <wzorzec>` z ogólnym słowem łapie też `tests/*.itest.ts`
  i uruchomi Dockera — używaj dokładnie `app` albo pełnej ścieżki pliku.
- **Agent nie dotyka gita.** Każde zadanie kończy się propozycją treści commita —
  wykonuje go właściciel.
- **Dokumentacja jest częścią „gotowe":** każde zadanie, które dodaje funkcję do modułu
  `app/lib/*`, aktualizuje wiersz tego modułu w [`app/lib/README.md`](../../../app/lib/README.md).
- **Review per task:** po każdym zadaniu przegląd (`/code-review`) przed kolejnym.

**Spec:** [`docs/superpowers/specs/2026-07-28-rozbicie-fe-be-analiza-ddd-design.md`](../specs/2026-07-28-rozbicie-fe-be-analiza-ddd-design.md), rozdział 12, faza A.

---

## Struktura plików

| Plik | Rola po fazie A |
|---|---|
| `app/lib/trainees.ts` | + repozytorium odczytu podopiecznych trenera (dziś tylko usuwanie) |
| `app/lib/exercises.ts` | + repozytorium ćwiczeń (dziś tylko `normalizeTags`) |
| `app/lib/plans.ts` | + listy/liczniki planów obok istniejącego zapisu |
| `app/lib/workouts.ts` | + pulpit trenera (ostatnie logi, licznik tygodnia) |
| `app/lib/auth/users.ts` | **nowy** — wyszukiwanie użytkownika po e-mailu i nazwy wyświetlanej |
| `app/lib/auth/invite.ts` | + wyszukiwanie zaproszenia po tokenie |
| `app/lib/file-uploads.ts` | + odczyt wiersza pliku po id (celowo tu, nie w `files.ts` — patrz Zadanie 8) |
| `app/lib/stripe/webhook.ts` | + zajęcie/zwolnienie identyfikatora zdarzenia (dedup) |
| `app/routes/no-direct-db.test.ts` | **nowy** — test strażnik szwu |

---

## Zadanie 1: Repozytorium podopiecznych — `findTraineeOfTrainer` do właściwego modułu

Pięć tras trenera powiela **znak w znak** zapytanie, które już istnieje jako
`findTraineeOfTrainer` w `app/lib/progression.ts:151`. Funkcja nie ma nic wspólnego
z progresją — przenosimy ją do `trainees.ts` i podmieniamy pięć duplikatów.

**Files:**
- Modify: `app/lib/trainees.ts` (dodanie funkcji)
- Modify: `app/lib/progression.ts:150-168` (usunięcie funkcji + import z `trainees.ts`)
- Modify: `app/routes/trener/podopieczni.$traineeId.sylwetka.tsx:19-29`
- Modify: `app/routes/trener/podopieczni.$traineeId.platnosci.tsx:31-41`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx:39-49`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx:43-53`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx:24-34`
- Modify: `app/routes/trener/podopieczni.$traineeId.formularz.tsx:24-28`
- Test: `tests/progression-tenant-scope.itest.ts` (aktualizacja importu)

**Interfaces:**
- Produces:
  ```ts
  export async function findTraineeOfTrainer(
    db: Db, trainerId: string, traineeId: string,
  ): Promise<{ id: string; displayName: string } | null>
  ```
- Consumes: nic z wcześniejszych zadań.

- [ ] **Krok 1: Przenieś funkcję do `app/lib/trainees.ts`**

Wklej na koniec `app/lib/trainees.ts` (ciało kopiowane bez zmian z `progression.ts:151-168`):

```ts
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
```

- [ ] **Krok 2: Usuń oryginał z `app/lib/progression.ts` i re-eksportuj**

Skasuj `app/lib/progression.ts:150-168` i dopisz na górze pliku, przy pozostałych importach:

```ts
import { findTraineeOfTrainer } from "~/lib/trainees";
```

a przy istniejącej linii re-eksportu (`export { loadProgressionSessions, markPrs };`) dopisz
`findTraineeOfTrainer`, żeby dotychczasowi importerzy nie musieli się zmieniać w tym zadaniu:

```ts
// Re-export for routes/sibling tasks that only need the loader-facing pieces.
export { loadProgressionSessions, markPrs, findTraineeOfTrainer };
```

- [ ] **Krok 3: Sprawdź, że nic się nie rozjechało typami**

Uruchom: `npm run typecheck`
Oczekiwane: brak błędów.

- [ ] **Krok 4: Podmień pięć duplikatów w trasach trenera**

W każdym z pięciu plików usuń blok `await db.select(...)` i zastąp wywołaniem. Wzorzec —
`podopieczni.$traineeId.sylwetka.tsx`, gdzie było:

```ts
  const traineeRows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
```

wstaw:

```ts
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
```

i zamień dalsze użycia `traineeRows[0]` / `traineeRows.length === 0` na `trainee` /
`trainee == null`. Dodaj import `import { findTraineeOfTrainer } from "~/lib/trainees";`
i usuń z pliku import `* as schema` oraz nieużywane już `and`/`eq` z `drizzle-orm`
(jeśli plik nie używa ich gdzie indziej).

Analogicznie w: `podopieczni.$traineeId.platnosci.tsx` (zmienna `[trainee]` → `trainee`),
`podopieczni.$traineeId.konsultacje._index.tsx` (zmienna `[t]` → `t`),
`podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` (`[trainee]` → `trainee`),
`podopieczni.$traineeId.konsultacje.nowa.tsx` (`[trainee]` → `trainee`).

W `podopieczni.$traineeId.formularz.tsx:24-28` zapytanie **nie ma** warunku tenanta (bo linię
wyżej stoi `assertTraineeOwnedBy`). Podmiana na `findTraineeOfTrainer(db, user.id, traineeId)`
jest bezpieczna i zwraca ten sam `displayName`; zostaw `assertTraineeOwnedBy` na miejscu —
to on odpowiada za 404.

- [ ] **Krok 5: Zaktualizuj import w teście integracyjnym**

W `tests/progression-tenant-scope.itest.ts` zmień import `findTraineeOfTrainer`
z `~/lib/progression` na `~/lib/trainees`. Reszta testu bez zmian — zachowanie jest identyczne.

- [ ] **Krok 6: Bramki**

Uruchom kolejno, każde jako osobne wywołanie:
`npm run typecheck` → brak błędów
`npm run lint` → brak błędów
`npx vitest run app` → wszystkie zielone
`npm run build` → sukces

- [ ] **Krok 7: Aktualizacja dokumentacji**

W `app/lib/README.md`: do wiersza `trainees.ts` dopisz `findTraineeOfTrainer` (tenant-scope
guard → 404 gdy `null`); z wiersza `progression.ts` usuń wzmiankę o `findTraineeOfTrainer`
i zastąp ją notką, że funkcja przeniosła się do `trainees.ts` i jest stamtąd re-eksportowana.

- [ ] **Krok 8: Handoff commita** (wykonuje właściciel)

```
refactor(faza-a): przenieś findTraineeOfTrainer do trainees.ts i usuń 6 duplikatów w trasach
```

**Do uruchomienia przez właściciela:** `npm run test:itest` — w szczególności
`tests/progression-tenant-scope.itest.ts`.

---

## Zadanie 2: Repozytorium podopiecznych — pozostałe odczyty

**Files:**
- Modify: `app/lib/trainees.ts`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx:81-91` oraz `:176-186`
- Modify: `app/routes/trener/plany.nowy.tsx:27-37` oraz `:67-77`
- Modify: `app/routes/trener/_layout.tsx:13-16`
- Test: `tests/trainees-repo.itest.ts` (nowy)

**Interfaces:**
- Consumes: `findTraineeOfTrainer` z Zadania 1.
- Produces:
  ```ts
  export async function getTraineeOfTrainer(
    db: Db, trainerId: string, traineeId: string,
  ): Promise<schema.User | null>

  export async function listTraineesOfTrainer(
    db: Db, trainerId: string,
  ): Promise<Array<{ id: string; displayName: string }>>

  export async function countTraineesOfTrainer(db: Db, trainerId: string): Promise<number>
  ```

- [ ] **Krok 1: Napisz test integracyjny**

Utwórz `tests/trainees-repo.itest.ts`. Wzoruj układ (start kontenera, migracje, seed pary
trener↔podopieczny) na `tests/progression-tenant-scope.itest.ts` — skopiuj z niego blok
`beforeAll`/`afterAll` i helper tworzący użytkowników.

```ts
it("getTraineeOfTrainer zwraca pełny wiersz tylko własnemu trenerowi", async () => {
  expect(await getTraineeOfTrainer(db, trainerA, traineeA1)).toMatchObject({
    id: traineeA1,
    role: "trainee",
  });
  expect(await getTraineeOfTrainer(db, trainerB, traineeA1)).toBeNull();
});

it("listTraineesOfTrainer pomija zarchiwizowanych i sortuje po nazwie", async () => {
  await db
    .update(schema.users)
    .set({ archivedAt: new Date() })
    .where(eq(schema.users.id, traineeA2));
  const rows = await listTraineesOfTrainer(db, trainerA);
  expect(rows.map((r) => r.id)).toEqual([traineeA1]);
});

it("countTraineesOfTrainer liczy również zarchiwizowanych", async () => {
  expect(await countTraineesOfTrainer(db, trainerA)).toBe(2);
});
```

Ostatni przypadek jest istotny: `trener/_layout.tsx` liczy **wszystkich** podopiecznych,
a `plany.nowy.tsx` listuje **tylko aktywnych**. Test utrwala tę różnicę, żeby nikt jej
przypadkiem nie „ujednolicił".

- [ ] **Krok 2: Zgłoś właścicielowi, że test czeka na uruchomienie**

Agent nie odpala Dockera. Zanotuj w handoffie: `npm run test:itest` — nowy plik
`tests/trainees-repo.itest.ts` musi być **czerwony** przed krokiem 3 (funkcje nie istnieją).

- [ ] **Krok 3: Zaimplementuj trzy funkcje w `app/lib/trainees.ts`**

```ts
/** Pełny wiersz podopiecznego, tylko w obrębie tenanta trenera; null → 404 po stronie trasy. */
export async function getTraineeOfTrainer(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<schema.User | null> {
  const rows = await db
    .select()
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

/** Aktywni podopieczni trenera (bez zarchiwizowanych) — do pickerów. */
export async function listTraineesOfTrainer(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; displayName: string }>> {
  return await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
        isNull(schema.users.archivedAt),
      ),
    )
    .orderBy(schema.users.displayName);
}

/** Licznik do nawigacji — celowo LICZY zarchiwizowanych, jak dotychczas w layoucie. */
export async function countTraineesOfTrainer(db: Db, trainerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")));
  return Number(row?.c ?? 0);
}
```

Dopisz do importów w `trainees.ts`: `count`, `isNull` z `drizzle-orm` (jeśli jeszcze ich nie ma).

- [ ] **Krok 4: Podmień wywołania w trasach**

`trener/podopieczni.$traineeId.tsx:81-91` → `const trainee = await getTraineeOfTrainer(db, user.id, traineeId);`
(dalsze użycia `traineeRows[0]` → `trainee`, `traineeRows.length === 0` → `trainee == null`).

`trener/podopieczni.$traineeId.tsx:176-186` (akcja `delete-trainee`) → `const trainee = await findTraineeOfTrainer(db, user.id, traineeId);`
— tu wystarczy sprawdzenie istnienia, nie potrzeba pełnego wiersza.

`trener/plany.nowy.tsx:27-37` → `const trainees = await listTraineesOfTrainer(db, user.id);`

`trener/plany.nowy.tsx:67-77` → `const trainee = await findTraineeOfTrainer(db, user.id, parsed.data.traineeId);`
(`traineeRows.length === 0` → `trainee == null`).

`trener/_layout.tsx:13-16` → `const traineeCount = await countTraineesOfTrainer(db, user.id);`
(dalej `Number(traineeCountRow?.c ?? 0)` → `traineeCount`).

- [ ] **Krok 5: Bramki**

`npm run typecheck` → brak błędów
`npm run lint` → brak błędów
`npx vitest run app` → zielone
`npm run build` → sukces

- [ ] **Krok 6: Dokumentacja**

`app/lib/README.md`, wiersz `trainees.ts`: dopisz `getTraineeOfTrainer`,
`listTraineesOfTrainer` (bez zarchiwizowanych), `countTraineesOfTrainer` (z zarchiwizowanymi).
`tests/README.md`: dodaj wiersz dla `trainees-repo.itest.ts`.

- [ ] **Krok 7: Handoff commita**

```
refactor(faza-a): wydobądź odczyty podopiecznych z tras trenera do trainees.ts
```

---

## Zadanie 3: Repozytorium ćwiczeń — odczyty proste i archiwizacja

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/podopieczni._index.tsx:93-101`
- Modify: `app/routes/trener/plany.$planId.tsx:80-88`
- Modify: `app/routes/trener/_layout.tsx:17-20`
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx:43-48`, `:76-80`, `:96-99`, `:104-107`
- Test: `tests/exercises-repo.itest.ts` (nowy)

**Interfaces:**
- Produces:
  ```ts
  export interface ExerciseWithDemo { exercise: schema.Exercise; demoFile: schema.File | null }

  export async function listActiveExercisesForTrainer(
    db: Db, trainerId: string,
  ): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>>

  export async function countActiveExercisesForTrainer(db: Db, trainerId: string): Promise<number>

  export async function getExerciseWithDemoForTrainer(
    db: Db, trainerId: string, exerciseId: string,
  ): Promise<ExerciseWithDemo | null>

  export async function getExerciseForTrainer(
    db: Db, trainerId: string, exerciseId: string,
  ): Promise<schema.Exercise | null>

  export async function setExerciseArchived(
    db: Db, trainerId: string, exerciseId: string, archived: boolean,
  ): Promise<void>
  ```

**UWAGA — jedyne świadome odstępstwo od „zero zmian zachowania" w całej fazie A.**
Dzisiejsze `UPDATE` archiwizacji (`biblioteka.$exerciseId.tsx:96` i `:104`) mają w `WHERE`
wyłącznie `eq(exercises.id, exerciseId)` — bez `trainer_id`. Dla legalnych przepływów jest to
bez znaczenia, bo dwadzieścia linii wyżej stoi sprawdzenie własności. `setExerciseArchived`
dopisuje `trainer_id` do `WHERE`. Dla poprawnych żądań zachowanie jest identyczne; dla
żądania spoza tenanta `UPDATE` staje się no-opem zamiast trafienia w cudzy wiersz.
To utwardzenie, nie zmiana funkcjonalna — ale musi być wymienione w opisie commita.

**Nie używaj `listAssignableExercises` z `app/lib/skills.ts` jako zamiennika.** Ta funkcja
dodatkowo odfiltrowuje ćwiczenia będące już wariantem umiejętności (`isNull(skillVariations.id)`)
— podstawiona pod picker edytora planów po cichu okroiłaby listę.

- [ ] **Krok 1: Napisz test integracyjny**

Utwórz `tests/exercises-repo.itest.ts` (układ jak w Zadaniu 2):

```ts
it("listActiveExercisesForTrainer zwraca aktywne ćwiczenia trenera po nazwie", async () => {
  const rows = await listActiveExercisesForTrainer(db, trainerA);
  expect(rows.map((r) => r.name)).toEqual(["Dip", "Pull-up"]);
});

it("listActiveExercisesForTrainer NIE odfiltrowuje wariantów umiejętności", async () => {
  // Regresja: podmiana na listAssignableExercises okroiłaby picker edytora planów.
  await addVariation(db, trainerA, skillA, pullUpId);
  const rows = await listActiveExercisesForTrainer(db, trainerA);
  expect(rows.map((r) => r.name)).toContain("Pull-up");
});

it("getExerciseWithDemoForTrainer nie przecieka między tenantami", async () => {
  expect(await getExerciseWithDemoForTrainer(db, trainerB, pullUpId)).toBeNull();
});

it("setExerciseArchived jest no-opem dla obcego trenera", async () => {
  await setExerciseArchived(db, trainerB, pullUpId, true);
  const still = await getExerciseForTrainer(db, trainerA, pullUpId);
  expect(still?.archivedAt).toBeNull();
});
```

- [ ] **Krok 2: Zanotuj w handoffie, że test ma być czerwony przed implementacją**

- [ ] **Krok 3: Zaimplementuj w `app/lib/exercises.ts`**

Plik ma dziś tylko `normalizeTags` i nie importuje bazy — dopisz na górze:

```ts
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
```

i dalej:

```ts
export interface ExerciseWithDemo {
  exercise: schema.Exercise;
  demoFile: schema.File | null;
}

/**
 * Aktywne ćwiczenia trenera do pickerów (edytor planu, formularz startowy).
 * Celowo BEZ filtra wariantów umiejętności — to robi `listAssignableExercises` w `skills.ts`
 * i jest to inna lista.
 */
export async function listActiveExercisesForTrainer(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  return await db
    .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.archivedAt)))
    .orderBy(asc(schema.exercises.name));
}

export async function countActiveExercisesForTrainer(
  db: Db,
  trainerId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.archivedAt)));
  return Number(row?.c ?? 0);
}

/** Ćwiczenie razem z wierszem pliku demo (LEFT JOIN) — do widoku edycji. */
export async function getExerciseWithDemoForTrainer(
  db: Db,
  trainerId: string,
  exerciseId: string,
): Promise<ExerciseWithDemo | null> {
  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Sam wiersz ćwiczenia, bez demo — do akcji, które tylko sprawdzają stan. */
export async function getExerciseForTrainer(
  db: Db,
  trainerId: string,
  exerciseId: string,
): Promise<schema.Exercise | null> {
  const rows = await db
    .select()
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Archiwizacja / przywrócenie. `trainer_id` JEST w WHERE — dla obcego tenanta to no-op,
 * mimo że wywołanie i tak stoi za sprawdzeniem własności (obrona w głąb).
 */
export async function setExerciseArchived(
  db: Db,
  trainerId: string,
  exerciseId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)));
}
```

- [ ] **Krok 4: Podmień wywołania w trasach**

`trener/podopieczni._index.tsx:93-101` → `const exercises = await listActiveExercisesForTrainer(db, user.id);`
`trener/plany.$planId.tsx:80-88` → `const exercises = await listActiveExercisesForTrainer(db, user.id);`
`trener/_layout.tsx:17-20` → `const exerciseCount = await countActiveExercisesForTrainer(db, user.id);`
`trener/biblioteka.$exerciseId.tsx:43-48` → `const row = await getExerciseWithDemoForTrainer(db, user.id, exerciseId);`
(dalsze `rows[0]` → `row`, `rows.length === 0` → `row == null`).
`trener/biblioteka.$exerciseId.tsx:76-80` → `const existing = await getExerciseForTrainer(db, user.id, exerciseId);`
(`existing[0]` → `existing`, `existing.length === 0` → `existing == null`).
`trener/biblioteka.$exerciseId.tsx:96-99` → `await setExerciseArchived(db, user.id, exerciseId, true);`
`trener/biblioteka.$exerciseId.tsx:104-107` → `await setExerciseArchived(db, user.id, exerciseId, false);`

- [ ] **Krok 5: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build` — wszystkie zielone.

- [ ] **Krok 6: Dokumentacja**

`app/lib/README.md`, wiersz `exercises.ts`: rozszerz opis z „normalizacja tagów" na
repozytorium ćwiczeń, wymieniając nowe funkcje i **notując wprost różnicę wobec
`listAssignableExercises` ze `skills.ts`**. `tests/README.md`: wiersz dla `exercises-repo.itest.ts`.

- [ ] **Krok 7: Handoff commita**

```
refactor(faza-a): wydobądź repozytorium ćwiczeń z tras; setExerciseArchived filtruje po trainer_id
```

---

## Zadanie 4: Repozytorium ćwiczeń — lista biblioteki z sortowaniem i filtrami

Najbardziej złożone zapytanie w tej fazie. Wzoruj kształt API na istniejących
`listLogsForTrainee`/`countLogsForTrainee` z `app/lib/workouts.ts` — obiekt opcji, ta sama
konwencja nazw.

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/biblioteka._index.tsx:75-111`
- Test: `tests/exercises-repo.itest.ts` (rozszerzenie)

**Interfaces:**
- Consumes: `ExerciseWithDemo` z Zadania 3.
- Produces:
  ```ts
  export type ExerciseSort = "name_asc" | "name_desc" | "newest" | "oldest";

  export interface ExerciseFilter {
    q?: string;
    tag?: string;                 // nazwa kategorii; wywołujący podaje TYLKO znaną kategorię
    unit?: "REPS" | "SEC";
  }

  export async function countExercisesForTrainer(
    db: Db, trainerId: string, filter: ExerciseFilter,
  ): Promise<number>

  export async function listExercisesForTrainer(
    db: Db, trainerId: string,
    opts: ExerciseFilter & { sort: ExerciseSort; limit: number; offset: number },
  ): Promise<ExerciseWithDemo[]>
  ```

- [ ] **Krok 1: Dopisz przypadki testowe do `tests/exercises-repo.itest.ts`**

```ts
it("listExercisesForTrainer filtruje po szukajce, tagu i jednostce", async () => {
  const rows = await listExercisesForTrainer(db, trainerA, {
    q: "pull", sort: "name_asc", limit: 24, offset: 0,
  });
  expect(rows.map((r) => r.exercise.name)).toEqual(["Pull-up"]);

  const byUnit = await listExercisesForTrainer(db, trainerA, {
    unit: "SEC", sort: "name_asc", limit: 24, offset: 0,
  });
  expect(byUnit.every((r) => r.exercise.unit === "SEC")).toBe(true);

  const byTag = await listExercisesForTrainer(db, trainerA, {
    tag: "plecy", sort: "name_asc", limit: 24, offset: 0,
  });
  expect(byTag.map((r) => r.exercise.name)).toEqual(["Pull-up"]);
});

it("countExercisesForTrainer liczy z tym samym filtrem co lista", async () => {
  expect(await countExercisesForTrainer(db, trainerA, { q: "pull" })).toBe(1);
});

it("lista i licznik nie przeciekają między tenantami", async () => {
  expect(await countExercisesForTrainer(db, trainerB, {})).toBe(0);
});
```

- [ ] **Krok 2: Zanotuj w handoffie, że test ma być czerwony przed implementacją**

- [ ] **Krok 3: Zaimplementuj w `app/lib/exercises.ts`**

Dopisz do importów `arrayContains`, `desc`, `ilike` z `drizzle-orm`.

```ts
export type ExerciseSort = "name_asc" | "name_desc" | "newest" | "oldest";

export interface ExerciseFilter {
  q?: string;
  /** Nazwa kategorii. Wywołujący podaje wyłącznie kategorię znaną trenerowi. */
  tag?: string;
  unit?: "REPS" | "SEC";
}

function exerciseConditions(trainerId: string, filter: ExerciseFilter) {
  const conditions = [
    eq(schema.exercises.trainerId, trainerId),
    isNull(schema.exercises.archivedAt),
  ];
  if (filter.q != null && filter.q.length > 0) {
    conditions.push(ilike(schema.exercises.name, `%${filter.q}%`));
  }
  if (filter.tag != null) {
    conditions.push(arrayContains(schema.exercises.tags, [filter.tag]));
  }
  if (filter.unit === "REPS" || filter.unit === "SEC") {
    conditions.push(eq(schema.exercises.unit, filter.unit));
  }
  return conditions;
}

export async function countExercisesForTrainer(
  db: Db,
  trainerId: string,
  filter: ExerciseFilter,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(...exerciseConditions(trainerId, filter)));
  return Number(row?.c ?? 0);
}

export async function listExercisesForTrainer(
  db: Db,
  trainerId: string,
  opts: ExerciseFilter & { sort: ExerciseSort; limit: number; offset: number },
): Promise<ExerciseWithDemo[]> {
  const orderBy =
    opts.sort === "name_desc"
      ? [desc(schema.exercises.name)]
      : opts.sort === "newest"
        ? [desc(schema.exercises.createdAt)]
        : opts.sort === "oldest"
          ? [asc(schema.exercises.createdAt)]
          : [asc(schema.exercises.name)];

  return await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(...exerciseConditions(trainerId, opts)))
    .orderBy(...orderBy)
    .limit(opts.limit)
    .offset(opts.offset);
}
```

- [ ] **Krok 4: Przepisz loader `trener/biblioteka._index.tsx`**

Usuń bloki `conditions` (linie 75-84), `orderBy` (86-93) oraz oba zapytania (95-111).
Zostaw budowanie `spec` i `parseListControls` — to warstwa prezentacji, zostaje w trasie.
Wstaw w ich miejsce:

```ts
  const filterTag = controls.filters.tag ?? "all";
  const filterUnit = controls.filters.unit ?? "all";
  // Nieznana kategoria z URL-a jest ignorowana — tak samo jak dotychczas.
  const filter = {
    q: controls.q.length > 0 ? controls.q : undefined,
    tag: filterTag !== "all" && categoryNames.has(filterTag) ? filterTag : undefined,
    unit: filterUnit === "REPS" || filterUnit === "SEC" ? filterUnit : undefined,
  };

  const total = await countExercisesForTrainer(db, user.id, filter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const rows = await listExercisesForTrainer(db, user.id, {
    ...filter,
    sort: controls.sort as ExerciseSort,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });
```

Mapowanie `rows` na `items` (linie 113-126) zostaje bez zmian — kształt wierszy jest ten sam.
Usuń z pliku importy `and`, `arrayContains`, `asc`, `count`, `desc`, `eq`, `ilike`, `isNull`
z `drizzle-orm` oraz `* as schema`, jeśli nie są już używane.

- [ ] **Krok 5: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 6: Dokumentacja**

`app/lib/README.md`, wiersz `exercises.ts`: dopisz `listExercisesForTrainer` /
`countExercisesForTrainer` z opisem opcji. `tests/README.md`: rozszerz wiersz
`exercises-repo.itest.ts` o sort/filtr/szukajkę.

- [ ] **Krok 7: Handoff commita**

```
refactor(faza-a): wydobądź listę biblioteki ćwiczeń (sort/filtr/szukajka) do exercises.ts
```

---

## Zadanie 5: Repozytorium planów — lista, liczniki i odczyty punktowe

**Files:**
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/plany._index.tsx:29-127`
- Modify: `app/routes/trener/plany.$planId.tsx:163-170`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx:99-103`
- Modify: `app/routes/trener/_layout.tsx:21-24`
- Modify: `app/routes/trener/_index.tsx:38-45`
- Test: `tests/plans-repo.itest.ts` (nowy)

**Interfaces:**
- Produces:
  ```ts
  export type PlanSort = "newest" | "oldest" | "name_asc" | "published";
  export type PlanStatusFilter = "all" | "active" | "draft";

  export interface PlanListRow {
    plan: schema.Plan;
    trainee: { id: string; displayName: string };
    sessionCount: number;
  }

  export async function countPlansByStatusForTrainer(
    db: Db, trainerId: string,
  ): Promise<{ all: number; active: number; draft: number }>

  export async function countPlansForTrainer(
    db: Db, trainerId: string, filter: { status: PlanStatusFilter; q?: string },
  ): Promise<number>

  export async function listPlansForTrainer(
    db: Db, trainerId: string,
    opts: { status: PlanStatusFilter; q?: string; sort: PlanSort; limit: number; offset: number },
  ): Promise<PlanListRow[]>

  export async function listPlansForTrainee(
    db: Db, trainerId: string, traineeId: string,
  ): Promise<schema.Plan[]>

  export async function findPlanStatusForTrainer(
    db: Db, planId: string, trainerId: string,
  ): Promise<{ status: schema.Plan["status"]; traineeId: string } | null>

  export async function countPlansForTrainerByStatus(
    db: Db, trainerId: string, status: "active" | "draft" | null,
  ): Promise<number>
  ```

`countPlansForTrainerByStatus` z `status: null` liczy **wszystkie** plany (łącznie
z zarchiwizowanymi) — dokładnie to robi dziś `trener/_layout.tsx:21`.

- [ ] **Krok 1: Napisz test integracyjny `tests/plans-repo.itest.ts`**

```ts
it("countPlansByStatusForTrainer pomija zarchiwizowane", async () => {
  expect(await countPlansByStatusForTrainer(db, trainerA)).toEqual({
    all: 2, active: 1, draft: 1,
  });
});

it("listPlansForTrainer szuka po nazwie planu I nazwie podopiecznego", async () => {
  const byPlan = await listPlansForTrainer(db, trainerA, {
    status: "all", q: "Masa", sort: "newest", limit: 20, offset: 0,
  });
  expect(byPlan).toHaveLength(1);

  const byTrainee = await listPlansForTrainer(db, trainerA, {
    status: "all", q: "Anna", sort: "newest", limit: 20, offset: 0,
  });
  expect(byTrainee).toHaveLength(1);
});

it("listPlansForTrainer zwraca liczbę sesji planu", async () => {
  const rows = await listPlansForTrainer(db, trainerA, {
    status: "active", sort: "newest", limit: 20, offset: 0,
  });
  expect(rows[0].sessionCount).toBe(3);
});

it("listPlansForTrainer nie pokazuje planów innego trenera", async () => {
  expect(await countPlansForTrainer(db, trainerB, { status: "all" })).toBe(0);
});

it("findPlanStatusForTrainer zwraca null dla obcego trenera", async () => {
  expect(await findPlanStatusForTrainer(db, planA, trainerB)).toBeNull();
});
```

Przypadek z sesjami jest ważny: `sessionCount` liczy CTE, a plan bez sesji musi dać `0`,
nie zniknąć z listy (`LEFT JOIN` + `COALESCE`). Dodaj drugi plan bez sesji i sprawdź,
że jest na liście z `sessionCount === 0`.

- [ ] **Krok 2: Zanotuj w handoffie, że test ma być czerwony przed implementacją**

- [ ] **Krok 3: Zaimplementuj w `app/lib/plans.ts`**

```ts
export type PlanSort = "newest" | "oldest" | "name_asc" | "published";
export type PlanStatusFilter = "all" | "active" | "draft";

export interface PlanListRow {
  plan: schema.Plan;
  trainee: { id: string; displayName: string };
  sessionCount: number;
}

/** Liczniki zakładek — zawsze bez zarchiwizowanych, niezależnie od filtra listy. */
export async function countPlansByStatusForTrainer(
  db: Db,
  trainerId: string,
): Promise<{ all: number; active: number; draft: number }> {
  const rows = await db
    .select({ status: schema.plans.status, c: count() })
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, trainerId), ne(schema.plans.status, "archived")))
    .groupBy(schema.plans.status);

  const counts = { all: 0, active: 0, draft: 0 };
  for (const r of rows) {
    if (r.status === "active" || r.status === "draft") {
      counts[r.status] = Number(r.c);
      counts.all += Number(r.c);
    }
  }
  return counts;
}

function planConditions(trainerId: string, filter: { status: PlanStatusFilter; q?: string }) {
  // Zarchiwizowane są ukryte w UI trenera — powstają automatycznie przy publikacji
  // i nie niosą akcji.
  const conditions = [
    eq(schema.plans.trainerId, trainerId),
    ne(schema.plans.status, "archived"),
  ];
  if (filter.status !== "all") {
    conditions.push(eq(schema.plans.status, filter.status));
  }
  if (filter.q != null && filter.q.length > 0) {
    conditions.push(
      or(
        ilike(schema.plans.name, `%${filter.q}%`),
        ilike(schema.users.displayName, `%${filter.q}%`),
      )!,
    );
  }
  return conditions;
}

export async function countPlansForTrainer(
  db: Db,
  trainerId: string,
  filter: { status: PlanStatusFilter; q?: string },
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .where(and(...planConditions(trainerId, filter)));
  return Number(row?.c ?? 0);
}

export async function listPlansForTrainer(
  db: Db,
  trainerId: string,
  opts: { status: PlanStatusFilter; q?: string; sort: PlanSort; limit: number; offset: number },
): Promise<PlanListRow[]> {
  const orderBy =
    opts.sort === "oldest"
      ? [asc(schema.plans.createdAt)]
      : opts.sort === "name_asc"
        ? [asc(schema.plans.name)]
        : opts.sort === "published"
          ? [sql`${schema.plans.publishedAt} DESC NULLS LAST`]
          : [desc(schema.plans.createdAt)];

  const sessionCountSub = db.$with("session_counts").as(
    db
      .select({ planId: schema.planSessions.planId, c: count().as("c") })
      .from(schema.planSessions)
      .groupBy(schema.planSessions.planId),
  );

  return await db
    .with(sessionCountSub)
    .select({
      plan: schema.plans,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
      sessionCount: sql<number>`COALESCE(${sessionCountSub.c}, 0)::int`,
    })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .leftJoin(sessionCountSub, eq(sessionCountSub.planId, schema.plans.id))
    .where(and(...planConditions(trainerId, opts)))
    .orderBy(...orderBy)
    .limit(opts.limit)
    .offset(opts.offset);
}

/** Wszystkie plany pary (łącznie z zarchiwizowanymi) — widok klienta. */
export async function listPlansForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<schema.Plan[]> {
  return await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, trainerId), eq(schema.plans.traineeId, traineeId)))
    .orderBy(desc(schema.plans.createdAt));
}

export async function findPlanStatusForTrainer(
  db: Db,
  planId: string,
  trainerId: string,
): Promise<{ status: schema.Plan["status"]; traineeId: string } | null> {
  const rows = await db
    .select({ status: schema.plans.status, traineeId: schema.plans.traineeId })
    .from(schema.plans)
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/** `status: null` liczy WSZYSTKIE plany trenera, także zarchiwizowane (licznik nawigacji). */
export async function countPlansForTrainerByStatus(
  db: Db,
  trainerId: string,
  status: "active" | "draft" | null,
): Promise<number> {
  const conditions = [eq(schema.plans.trainerId, trainerId)];
  if (status != null) conditions.push(eq(schema.plans.status, status));
  const [row] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(and(...conditions));
  return Number(row?.c ?? 0);
}
```

Uzupełnij importy `plans.ts` o `asc`, `count`, `desc`, `ilike`, `ne`, `or`, `sql` z `drizzle-orm`.

- [ ] **Krok 4: Przepisz trasy**

`trener/plany._index.tsx`: usuń linie 29-43 (`statusCounts` + pętla) i wstaw
`const counts = await countPlansByStatusForTrainer(db, user.id);`. Usuń bloki `conditions`
(73-84), `orderBy` (86-93), zapytanie `totalRow` (96-101), CTE (107-112) i zapytanie `rows`
(114-127), a w ich miejsce:

```ts
  const filter = {
    status: (controls.filters.status ?? "all") as PlanStatusFilter,
    q: controls.q.length > 0 ? controls.q : undefined,
  };
  const total = await countPlansForTrainer(db, user.id, filter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = await listPlansForTrainer(db, user.id, {
    ...filter,
    sort: controls.sort as PlanSort,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });
```

Mapowanie `rows` → `items` (129-138) zostaje bez zmian.

`trener/plany.$planId.tsx:163-170` → `const plan = await findPlanStatusForTrainer(db, planId, user.id);`
(`planRows[0]` → `plan`, `planRows.length === 0` → `plan == null`).

`trener/podopieczni.$traineeId.tsx:99-103` → `const plans = await listPlansForTrainee(db, user.id, traineeId);`

`trener/_layout.tsx:21-24` → `const planCount = await countPlansForTrainerByStatus(db, user.id, null);`

`trener/_index.tsx:38-45` → dwa wywołania:
```ts
  const activePlans = await countPlansForTrainerByStatus(db, user.id, "active");
  const drafts = await countPlansForTrainerByStatus(db, user.id, "draft");
```

- [ ] **Krok 5: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 6: Dokumentacja**

`app/lib/README.md`, wiersz `plans.ts`: dopisz sześć nowych funkcji, z notką że
`countPlansForTrainerByStatus(…, null)` liczy także zarchiwizowane, a listy i liczniki
zakładek — nie. `tests/README.md`: wiersz dla `plans-repo.itest.ts`.

- [ ] **Krok 7: Handoff commita**

```
refactor(faza-a): wydobądź listy i liczniki planów z tras trenera do plans.ts
```

---

## Zadanie 6: Pulpit trenera i nawigacja podopiecznego

Ostatnie zapytania inline w layoutach i na pulpicie. Część z nich ma już gotowe
odpowiedniki w `lib/` — sprawdź przed pisaniem nowych.

**Files:**
- Modify: `app/lib/workouts.ts`
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/_index.tsx:25-34`, `:46-54`
- Modify: `app/routes/podopieczny/_layout.tsx:23-43`
- Test: `tests/plans-repo.itest.ts` (rozszerzenie)

**Interfaces:**
- Consumes: `countPlansForTrainerByStatus` z Zadania 5.
- Produces:
  ```ts
  // app/lib/workouts.ts
  export interface RecentLogRow {
    log: schema.WorkoutLog;
    trainee: { id: string; displayName: string };
  }
  export async function listRecentLogsForTrainer(
    db: Db, trainerId: string, limit: number,
  ): Promise<RecentLogRow[]>

  export async function countLogsForTrainerSince(
    db: Db, trainerId: string, sinceIso: string,
  ): Promise<number>

  // app/lib/plans.ts
  export async function countSessionsInPlan(db: Db, planId: string): Promise<number>
  ```

- [ ] **Krok 1: Użyj funkcji, które już istnieją — nie pisz ich drugi raz**

Zweryfikowane w kodzie; wszystkie trzy mają pasującą sygnaturę i nie trzeba ich dopisywać:

| Zapytanie w trasie | Istniejący zamiennik |
|---|---|
| `podopieczny/_layout.tsx:23-26` (licznik logów) | `countLogsForTrainee(db, traineeId, opts = {})` — `app/lib/workouts.ts:440`, opcje mają wartość domyślną, więc `countLogsForTrainee(db, user.id)` daje licznik wszystkich |
| `podopieczny/_layout.tsx:27-30` (licznik zdjęć) | `countBodyPhotosForTrainee(db, traineeId)` — `app/lib/body-photos.ts:55` |
| `podopieczny/_layout.tsx:33-37` (aktywny plan) | `findActivePlanForTrainee(db, traineeId): Promise<schema.Plan \| null>` — `app/lib/workouts.ts:57` |

Nowe w tym zadaniu są wyłącznie `listRecentLogsForTrainer`, `countLogsForTrainerSince`
i `countSessionsInPlan`.

- [ ] **Krok 2: Dopisz przypadki testowe do `tests/plans-repo.itest.ts`**

```ts
it("listRecentLogsForTrainer zwraca logi wszystkich podopiecznych trenera, najnowsze pierwsze", async () => {
  const rows = await listRecentLogsForTrainer(db, trainerA, 6);
  expect(rows).toHaveLength(2);
  expect(rows[0].log.performedOn >= rows[1].log.performedOn).toBe(true);
  expect(rows[0].trainee.displayName).toBeTruthy();
});

it("countLogsForTrainerSince liczy tylko od podanej daty i tylko własnych", async () => {
  expect(await countLogsForTrainerSince(db, trainerA, "2026-07-21")).toBe(1);
  expect(await countLogsForTrainerSince(db, trainerB, "2026-07-21")).toBe(0);
});

it("countSessionsInPlan zwraca 0 dla planu bez sesji", async () => {
  expect(await countSessionsInPlan(db, planWithoutSessions)).toBe(0);
});
```

- [ ] **Krok 3: Zaimplementuj**

W `app/lib/workouts.ts`:

```ts
export interface RecentLogRow {
  log: schema.WorkoutLog;
  trainee: { id: string; displayName: string };
}

/** Ostatnie treningi wszystkich podopiecznych trenera — pulpit. */
export async function listRecentLogsForTrainer(
  db: Db,
  trainerId: string,
  limit: number,
): Promise<RecentLogRow[]> {
  return await db
    .select({
      log: schema.workoutLogs,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
    })
    .from(schema.workoutLogs)
    .innerJoin(schema.users, eq(schema.users.id, schema.workoutLogs.traineeId))
    .where(eq(schema.workoutLogs.trainerId, trainerId))
    .orderBy(desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt))
    .limit(limit);
}

/** Liczba treningów trenera od podanej daty włącznie (`performedOn >= sinceIso`). */
export async function countLogsForTrainerSince(
  db: Db,
  trainerId: string,
  sinceIso: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.trainerId, trainerId),
        gte(schema.workoutLogs.performedOn, sinceIso),
      ),
    );
  return Number(row?.c ?? 0);
}
```

W `app/lib/plans.ts`:

```ts
export async function countSessionsInPlan(db: Db, planId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, planId));
  return Number(row?.c ?? 0);
}
```

- [ ] **Krok 4: Przepisz trasy**

`trener/_index.tsx:25-34` → `const recentLogs = await listRecentLogsForTrainer(db, user.id, 6);`
`trener/_index.tsx:46-54` → `const weekSessions = await countLogsForTrainerSince(db, user.id, sevenDaysAgo);`
(dalej `Number(weekSessionsRow?.c ?? 0)` → `weekSessions`).

`podopieczny/_layout.tsx:23-43` → cztery podmiany zgodnie z ustaleniami z Kroku 1:
```ts
  const logCount = await countLogsForTrainee(db, user.id, {});
  const photoCount = await countBodyPhotosForTrainee(db, user.id);
  const activePlan = await findActivePlanForTrainee(db, user.id);
  const sessionCount = activePlan != null ? await countSessionsInPlan(db, activePlan.id) : 0;
```
Zachowaj dotychczasowy warunek — licznik sesji liczy się tylko, gdy aktywny plan istnieje.

- [ ] **Krok 5: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 6: Dokumentacja**

`app/lib/README.md`: wiersz `workouts.ts` — dopisz `listRecentLogsForTrainer`
i `countLogsForTrainerSince`; wiersz `plans.ts` — `countSessionsInPlan`.

- [ ] **Krok 7: Handoff commita**

```
refactor(faza-a): wydobądź zapytania pulpitu trenera i nawigacji podopiecznego
```

---

## Zadanie 7: Tożsamość — logowanie, zaproszenie, nazwa trenera

**Files:**
- Create: `app/lib/auth/users.ts`
- Modify: `app/lib/auth/invite.ts`
- Modify: `app/lib/auth/index.ts` (re-eksport)
- Modify: `app/routes/login.tsx:57`
- Modify: `app/routes/zaproszenie.$token.tsx:27-31`, `:57-61`
- Modify: `app/routes/podopieczny/aktywuj.tsx:39-43`
- Modify: `app/routes/podopieczny/formularz.tsx:47-52`
- Modify: `app/routes/podopieczny/platnosci.tsx:35-39`
- Test: `tests/auth-repo.itest.ts` (nowy)

**Interfaces:**
- Produces:
  ```ts
  // app/lib/auth/users.ts
  export async function findUserByEmail(db: Db, email: string): Promise<schema.User | null>
  export async function findDisplayName(db: Db, userId: string): Promise<string | null>

  // app/lib/auth/invite.ts
  export async function findInviteByToken(db: Db, token: string): Promise<schema.Invite | null>
  ```

`findInviteByToken` **sama** haszuje token (`hashToken`) — trasa przestaje się tym zajmować.
Obie trasy w `zaproszenie.$token.tsx` robią dziś dokładnie to samo, tylko raz przez zmienną
`hash`, a raz przez wywołanie `hashToken(token)` w miejscu.

- [ ] **Krok 1: Napisz test integracyjny `tests/auth-repo.itest.ts`**

```ts
it("findUserByEmail znajduje po dokładnym adresie", async () => {
  expect(await findUserByEmail(db, "trener@example.com")).toMatchObject({ role: "trainer" });
  expect(await findUserByEmail(db, "nie-ma@example.com")).toBeNull();
});

it("findInviteByToken haszuje token i zwraca zaproszenie", async () => {
  const invite = await findInviteByToken(db, plainToken);
  expect(invite?.trainerId).toBe(trainerA);
  expect(await findInviteByToken(db, "zmyslony-token")).toBeNull();
});

it("findDisplayName zwraca null dla nieistniejącego użytkownika", async () => {
  expect(await findDisplayName(db, trainerA)).toBe("Trener A");
  expect(await findDisplayName(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
});
```

- [ ] **Krok 2: Zanotuj w handoffie, że test ma być czerwony przed implementacją**

- [ ] **Krok 3: Utwórz `app/lib/auth/users.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

/** Użytkownik po adresie e-mail (logowanie). Null → trasa i tak liczy dummy-hash. */
export async function findUserByEmail(db: Db, email: string): Promise<schema.User | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

/** Sama nazwa wyświetlana — do framingu trenera na ekranach podopiecznego. */
export async function findDisplayName(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.name ?? null;
}
```

- [ ] **Krok 4: Dopisz `findInviteByToken` do `app/lib/auth/invite.ts`**

```ts
/** Zaproszenie po SUROWYM tokenie z URL-a — haszowanie siedzi tutaj, nie w trasie. */
export async function findInviteByToken(
  db: Db,
  token: string,
): Promise<schema.Invite | null> {
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  return rows[0] ?? null;
}
```

W `app/lib/auth/index.ts` dopisz re-eksport `findUserByEmail`, `findDisplayName`
i `findInviteByToken`, zgodnie z tym, jak plik re-eksportuje pozostałe funkcje auth.

- [ ] **Krok 5: Przepisz trasy**

`login.tsx:57` → `const found = await findUserByEmail(db, email);`
(`rows[0]` → `found`; **nie ruszaj** logiki dummy-hash i stałego czasu odpowiedzi).

`zaproszenie.$token.tsx:27-31` → `const invite = await findInviteByToken(db, token);`
(`rows[0]` → `invite`). To samo w `:57-61` (`inviteRows[0]` → `invite`). Usuń zmienną `hash`
i import `hashToken`, jeśli nie są już używane.

`podopieczny/aktywuj.tsx:39-43` → `const trainerName = await findDisplayName(db, user.trainerId!);`
(dalej `trainerRow[0]?.name` → `trainerName`).

`podopieczny/formularz.tsx:47-52` → zachowaj warunek na `user.trainerId`:
```ts
  const trainerName =
    user.trainerId != null ? await findDisplayName(db, user.trainerId) : null;
```

`podopieczny/platnosci.tsx:35-39` — zapytanie stoi w `Promise.all`; podmień element tablicy na
`findDisplayName(db, trainerId)` i zaktualizuj destrukturyzację wyniku (było `[{ name }]`,
jest `string | null`).

- [ ] **Krok 6: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.
Uwaga: `app/routes/login.test.ts` mockuje `~/lib/db/client` — sprawdź, czy mock nadal
pokrywa to, czego trasa używa, i popraw go, jeśli test padnie.

- [ ] **Krok 7: Dokumentacja**

`app/lib/auth/README.md`: dodaj wiersz dla nowego pliku `users.ts` i dopisz
`findInviteByToken` do opisu `invite.ts`. `tests/README.md`: wiersz dla `auth-repo.itest.ts`.
Ponieważ powstał **nowy plik** w katalogu z README — to wymóg z `CLAUDE.md`, nie opcja.

- [ ] **Krok 8: Handoff commita**

```
refactor(faza-a): wydobądź odczyty tożsamości i zaproszeń z tras do lib/auth
```

---

## Zadanie 8: Pliki i webhook Stripe

**Files:**
- Modify: `app/lib/file-uploads.ts`
- Modify: `app/lib/stripe/webhook.ts`
- Modify: `app/routes/files.$fileId.tsx:38`
- Modify: `app/routes/webhooks.stripe.tsx:35-39`, `:52-54`
- Test: `tests/stripe-webhook.itest.ts` (rozszerzenie)

**Interfaces:**
- Produces:
  ```ts
  // app/lib/file-uploads.ts
  export async function findFileById(db: Db, fileId: string): Promise<schema.File | null>

  // app/lib/stripe/webhook.ts
  export async function claimWebhookEvent(
    db: Db, eventId: string, type: string,
  ): Promise<boolean>   // true = pierwsze wystąpienie, false = duplikat
  export async function releaseWebhookEvent(db: Db, eventId: string): Promise<void>
  ```

`findFileById` trafia do `file-uploads.ts`, **nie** do `files.ts`. Powód: `files.ts` zawiera
czyste funkcje podpisywania URL-i i jest bezpieczny do zaimportowania z komponentu; dodanie
tam dostępu do bazy wciągnęłoby Drizzle do bundla klienta przy pierwszym nieostrożnym imporcie.
`file-uploads.ts` już jest server-only i już dotyka bazy.

- [ ] **Krok 1: Dopisz przypadki do `tests/stripe-webhook.itest.ts`**

```ts
it("claimWebhookEvent zwraca true raz, potem false dla tego samego id", async () => {
  expect(await claimWebhookEvent(db, "evt_1", "invoice.paid")).toBe(true);
  expect(await claimWebhookEvent(db, "evt_1", "invoice.paid")).toBe(false);
});

it("releaseWebhookEvent pozwala ponowić zdarzenie po błędzie handlera", async () => {
  await claimWebhookEvent(db, "evt_2", "invoice.paid");
  await releaseWebhookEvent(db, "evt_2");
  expect(await claimWebhookEvent(db, "evt_2", "invoice.paid")).toBe(true);
});
```

Drugi przypadek utrwala istotną własność: gdy handler rzuci, zwalniamy identyfikator,
żeby ponowienie ze strony Stripe faktycznie doszło do skutku.

- [ ] **Krok 2: Zaimplementuj**

W `app/lib/file-uploads.ts`:

```ts
/** Wiersz pliku po identyfikatorze. Autoryzację (podpis + scope trenera) robi trasa. */
export async function findFileById(db: Db, fileId: string): Promise<schema.File | null> {
  const rows = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .limit(1);
  return rows[0] ?? null;
}
```

W `app/lib/stripe/webhook.ts`:

```ts
/**
 * Zajmuje identyfikator zdarzenia (dedup). `true` → to pierwsze wystąpienie i wolno
 * je przetworzyć; `false` → duplikat, trasa odpowiada 200 bez efektów ubocznych.
 */
export async function claimWebhookEvent(
  db: Db,
  eventId: string,
  type: string,
): Promise<boolean> {
  const inserted = await db
    .insert(schema.processedWebhookEvents)
    .values({ eventId, type })
    .onConflictDoNothing()
    .returning({ eventId: schema.processedWebhookEvents.eventId });
  return inserted.length > 0;
}

/** Zwalnia identyfikator po błędzie handlera, żeby ponowienie Stripe'a miało co przetworzyć. */
export async function releaseWebhookEvent(db: Db, eventId: string): Promise<void> {
  await db
    .delete(schema.processedWebhookEvents)
    .where(eq(schema.processedWebhookEvents.eventId, eventId));
}
```

- [ ] **Krok 3: Przepisz trasy**

`files.$fileId.tsx:38` → `const file = await findFileById(db, fileId);`
(`rows[0]` → `file`, `rows.length === 0` → `file == null`).

`webhooks.stripe.tsx:35-39` → `const first = await claimWebhookEvent(db, event.id, event.type);`
(warunek `inserted.length === 0` → `!first`).
`webhooks.stripe.tsx:52-54` → `await releaseWebhookEvent(db, event.id);`
**Nie zmieniaj** kodów odpowiedzi ani kolejności: 400 przy złym podpisie, 500 przy błędzie
handlera (Stripe ponawia), 200 w pozostałych.

- [ ] **Krok 4: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 5: Dokumentacja**

`app/lib/README.md`: wiersz `file-uploads.ts` — dopisz `findFileById` **wraz z powodem**,
dla którego nie leży w `files.ts`. `app/lib/stripe/README.md`: dopisz
`claimWebhookEvent`/`releaseWebhookEvent` do opisu `webhook.ts`.

- [ ] **Krok 6: Handoff commita**

```
refactor(faza-a): wydobądź odczyt pliku i dedup zdarzeń webhooka z tras
```

---

## Zadanie 9: Trzy transakcje otwierane w trasach

Transakcja otwarta w trasie jest tym fragmentem szwu, którego w fazie C **nie da się**
przełożyć na wywołanie HTTP — transakcji nie ma jak rozciągnąć przez granicę sieci.
Wszystkie trzy przenosimy do `lib/`.

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/lib/auth/invite.ts` *(korekta z 2026-07-28: pierwotnie planowano `app/lib/onboarding-forms.ts`, ale `auth/invite.ts` już importuje z niego `attachFormToTrainee`, więc import w drugą stronę dałby cykl. `consumeInvite` — symetryczny odpowiednik tej funkcji — też mieszka w `invite.ts`.)*
- Modify: `app/routes/trener/biblioteka.nowe.tsx:58-…`
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx:128-…`
- Modify: `app/routes/trener/podopieczni._index.tsx:152-…`
- Test: `tests/onboarding-forms.itest.ts` (rozszerzenie)

**Interfaces:**
- Consumes: `UploadCleanupQueue`, `uploadFile` z `app/lib/file-uploads.ts`;
  `createInvite` z `app/lib/auth/invite.ts`; `createOnboardingForm` z `app/lib/onboarding-forms.ts`.
- Produces:
  ```ts
  // app/lib/exercises.ts
  export async function createExerciseWithDemo(
    db: Db,
    input: {
      trainerId: string;
      name: string;
      unit: "REPS" | "SEC";
      description: string | null;
      tags: string[];
      tracksRpe: boolean;
      demo: File | null;
    },
  ): Promise<void>

  export async function updateExerciseWithDemo(
    db: Db,
    input: {
      trainerId: string;
      exerciseId: string;
      currentDemoFileId: string | null;   // z wiersza wczytanego przy sprawdzeniu własności
      name: string;
      unit: "REPS" | "SEC";
      description: string | null;
      tags: string[];
      tracksRpe: boolean;
      demo: File | null;       // null = zostaw dotychczasowe demo bez zmian
    },
  ): Promise<void>

  // app/lib/auth/invite.ts
  export async function createInviteWithOnboarding(
    db: Db,
    input: {
      trainerId: string;
      displayName: string;
      email: string | null;
      monthlyAmountGrosze: number | null;
      template: { exerciseIds: string[]; note: string | null } | null;
    },
  ): Promise<{ token: string }>
  ```

- [ ] **Krok 1: Przeczytaj trzy akcje w całości przed pisaniem czegokolwiek**

Read: `app/routes/trener/biblioteka.nowe.tsx` (cała `action`),
`app/routes/trener/biblioteka.$exerciseId.tsx` (cała `action`, linie ~66-200),
`app/routes/trener/podopieczni._index.tsx` (cała `action`, linie ~140-190).

Te transakcje mają obsługę rollbacku plików (`UploadCleanupQueue`, usuwanie starego bloba
**dopiero po** commicie) i tej sekwencji nie wolno zmienić. Przenosisz kod, nie projektujesz
go od nowa.

- [ ] **Krok 2: Dopisz przypadek testowy do `tests/onboarding-forms.itest.ts`**

```ts
it("createInviteWithOnboarding jest atomowe — złe ćwiczenie cofa całe zaproszenie", async () => {
  await expect(
    createInviteWithOnboarding(db, {
      trainerId: trainerA,
      displayName: "Nowy",
      email: null,
      monthlyAmountGrosze: null,
      template: { exerciseIds: [exerciseOfTrainerB], note: null },
    }),
  ).rejects.toThrow();

  const invites = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.trainerId, trainerA));
  expect(invites).toHaveLength(0);
});
```

To jest sedno tej transakcji: nigdy nie może powstać link do zaproszenia, do którego
formularz nie doszedł.

- [ ] **Krok 3: Przenieś transakcje ćwiczeń do `app/lib/exercises.ts`**

```ts
/**
 * Tworzy ćwiczenie razem z opcjonalnym demo w JEDNEJ transakcji.
 * `UploadCleanupQueue` żyje wewnątrz — rollback transakcji musi też sprzątnąć blob.
 */
export async function createExerciseWithDemo(
  db: Db,
  input: {
    trainerId: string;
    name: string;
    unit: "REPS" | "SEC";
    description: string | null;
    tags: string[];
    tracksRpe: boolean;
    demo: File | null;
  },
): Promise<void> {
  const cleanup = new UploadCleanupQueue(db);
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = null;
      if (input.demo != null) {
        const uploaded = await uploadFile(
          tx,
          {
            file: input.demo,
            kind: "exercise_demo",
            trainerId: input.trainerId,
            uploadedBy: input.trainerId,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await tx.insert(schema.exercises).values({
        trainerId: input.trainerId,
        name: input.name,
        unit: input.unit,
        description: input.description,
        tracksRpe: input.tracksRpe,
        tags: input.tags,
        demoFileId,
      });
    });
    cleanup.commit();
  } catch (e) {
    await cleanup.cleanup();
    throw e;
  }
}

/**
 * Zapis edycji ćwiczenia z opcjonalną PODMIANĄ demo. Wiersz starego pliku znika w tej samej
 * transakcji, ale blob kasujemy DOPIERO po commicie — inaczej rollback zostawiłby wiersz
 * przywrócony, a plik już usunięty z dysku.
 */
export async function updateExerciseWithDemo(
  db: Db,
  input: {
    trainerId: string;
    exerciseId: string;
    currentDemoFileId: string | null;
    name: string;
    unit: "REPS" | "SEC";
    description: string | null;
    tags: string[];
    tracksRpe: boolean;
    demo: File | null;
  },
): Promise<void> {
  const cleanup = new UploadCleanupQueue(db);
  let oldDemoStoragePathToDelete: string | null = null;
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = input.currentDemoFileId;
      const oldDemoFileId = input.currentDemoFileId;

      if (input.demo != null) {
        const uploaded = await uploadFile(
          tx,
          {
            file: input.demo,
            kind: "exercise_demo",
            trainerId: input.trainerId,
            uploadedBy: input.trainerId,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }

      await tx
        .update(schema.exercises)
        .set({
          name: input.name,
          unit: input.unit,
          description: input.description,
          tracksRpe: input.tracksRpe,
          tags: input.tags,
          demoFileId,
        })
        .where(
          and(
            eq(schema.exercises.id, input.exerciseId),
            eq(schema.exercises.trainerId, input.trainerId),
          ),
        );

      if (input.demo != null && oldDemoFileId) {
        oldDemoStoragePathToDelete = await deleteFileRow(tx, oldDemoFileId);
      }
    });
    cleanup.commit();
    if (oldDemoStoragePathToDelete) {
      // Best-effort po commicie (jak w deleteBodyPhoto / trainees): podmiana jest już
      // zatwierdzona, więc błąd usunięcia starego blobu nie może dać 500.
      try {
        await deleteFileBlob(oldDemoStoragePathToDelete);
      } catch {
        // Swallow — osierocony blob zamiast wywrócenia udanej operacji.
      }
    }
  } catch (e) {
    await cleanup.cleanup();
    throw e;
  }
}
```

Dwie rzeczy, które zmieniły się względem oryginału i są zamierzone:

1. `UPDATE` dostaje `trainer_id` w `WHERE` (dziś `biblioteka.$exerciseId.tsx:162` filtruje
   tylko po `id`) — to samo utwardzenie co w Zadaniu 3.
2. `UploadError` **nie** jest łapany w `lib/` — leci dalej, a trasa mapuje go na
   `{ error: e.userMessage }` dokładnie jak dziś. Warstwa domenowa nie zna komunikatów UI.

`currentDemoFileId` przekazuje trasa z wiersza, który i tak wczytuje do sprawdzenia własności
(`getExerciseForTrainer` z Zadania 3) — dzięki temu funkcja nie robi drugiego `SELECT`-a.

- [ ] **Krok 4: Przenieś transakcję zaproszenia do `app/lib/auth/invite.ts`**

```ts
/**
 * Zaproszenie + opcjonalny formularz startowy w JEDNEJ transakcji: albo jedno i drugie,
 * albo nic. Inaczej dałoby się wysłać link do zaproszenia, któremu formularz nie doszedł.
 * `inviteId` bierze się WYŁĄCZNIE z wiersza utworzonego w tej transakcji — nigdy z requestu.
 */
export async function createInviteWithOnboarding(
  db: Db,
  input: {
    trainerId: string;
    displayName: string;
    email: string | null;
    monthlyAmountGrosze: number | null;
    template: { exerciseIds: string[]; note: string | null } | null;
  },
): Promise<{ token: string }> {
  const token = await db.transaction(async (tx) => {
    const created = await createInvite(tx, {
      trainerId: input.trainerId,
      displayName: input.displayName,
      email: input.email,
      monthlyAmountGrosze: input.monthlyAmountGrosze,
    });
    if (input.template) {
      await createOnboardingForm(tx, {
        trainerId: input.trainerId,
        inviteId: created.invite!.id,
        exerciseIds: input.template.exerciseIds,
        note: input.template.note,
      });
    }
    return created.token;
  });
  return { token };
}
```

`OnboardingFormError` przechodzi na zewnątrz — mapuje go trasa, tak jak dziś.

- [ ] **Krok 5: Przepisz trzy akcje na jedno wywołanie**

W trasach zostaje: parsowanie `FormData`, walidacja Zodem, mapowanie błędów domenowych
(`UploadError`, `OnboardingFormError`) na komunikaty i redirect. Znika `db.transaction`,
znika `UploadCleanupQueue`, znika import `* as schema`.

- [ ] **Krok 6: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 7: Dokumentacja**

`app/lib/README.md`: wiersze `exercises.ts` i `onboarding-forms.ts` — dopisz nowe funkcje
transakcyjne z notką o kolejności sprzątania blobów.
`app/routes/trener/README.md`: zaktualizuj opisy trzech tras (nie otwierają już transakcji).

- [ ] **Krok 8: Handoff commita**

```
refactor(faza-a): przenieś trzy transakcje z tras do lib (ćwiczenia + zaproszenie z formularzem)
```

**Do uruchomienia przez właściciela:** `npm run test:itest` — całość, bo to zadanie rusza
ścieżki uploadu i zaproszeń.

---

## Zadanie 10: Test strażnik — szew zostaje szczelny

Bez tego kroku faza A rozszczelni się przy pierwszym pośpiechu. Test czyta pliki tras
z dysku i sprawdza dwie rzeczy naraz.

**Files:**
- Create: `app/routes/no-direct-db.test.ts`
- Modify: `CLAUDE.md` (sekcja „Kluczowe konwencje")
- Modify: `app/routes/README.md`

**Interfaces:**
- Consumes: nic — test operuje na plikach źródłowych.
- Produces: nic dla kodu produkcyjnego.

- [ ] **Krok 1: Napisz test**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = join(process.cwd(), "app", "routes");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("szew app/lib — trasy nie sięgają do bazy bezpośrednio", () => {
  const files = routeFiles(ROUTES_DIR);

  it("znajduje pliki tras", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("żadna trasa nie importuje schematu bazy", () => {
    const offenders = files.filter((f) => /from\s+"~\/lib\/db\/schema"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("żadna trasa nie buduje zapytania ani nie otwiera transakcji", () => {
    // `db` wolno przekazywać do funkcji z lib/ — to konwencja wstrzykiwania.
    // Nie wolno na nim wołać budowniczych zapytań ani transakcji.
    const forbidden = /\bdb\s*\)?\s*\.\s*(select|insert|update|delete|transaction|\$with)\s*\(/;
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Krok 2: Uruchom test — musi być ZIELONY**

Uruchom: `npx vitest run app/routes/no-direct-db.test.ts`
Oczekiwane: PASS. Jeśli któryś przypadek jest czerwony, znaczy że Zadania 1–9 czegoś nie
domknęły — wróć i dokończ, zamiast rozluźniać wzorzec w teście.

- [ ] **Krok 3: Sprawdź, że test faktycznie łapie naruszenie**

Tymczasowo dopisz w dowolnej trasie linię `await db.select();`, uruchom
`npx vitest run app/routes/no-direct-db.test.ts`, potwierdź FAIL, po czym **usuń** tę linię
i potwierdź ponowny PASS. Test, którego nie widziało się na czerwono, nie jest testem.

- [ ] **Krok 4: Bramki**

`npm run typecheck` · `npm run lint` · `npx vitest run app` · `npm run build`.

- [ ] **Krok 5: Zapisz regułę w dokumentacji**

W `CLAUDE.md`, w sekcji „Kluczowe konwencje", dodaj punkt:

> - **Trasy nie sięgają do bazy bezpośrednio.** W loaderze/akcji wolno przekazać `db` do
>   funkcji z `app/lib/*`, ale nie wolno budować zapytań (`db.select/insert/update/delete/$with`)
>   ani otwierać transakcji (`db.transaction`) — to zadanie modułu w `app/lib/`. Pilnuje tego
>   `app/routes/no-direct-db.test.ts`. Powód: to szew, na którym warstwa danych zostanie
>   przełożona na wywołania API — patrz spec rozbicia FE/BE.

W `app/routes/README.md` dopisz zdanie o tej samej regule i wskaż plik testu.

- [ ] **Krok 6: Handoff commita**

```
test(faza-a): strażnik szwu — trasy nie budują zapytań ani nie otwierają transakcji
```

---

## Bramki końcowe fazy A

Po Zadaniu 10, przed uznaniem fazy za zamkniętą:

- [ ] `npm run typecheck` — zielone
- [ ] `npm run lint` — zielone
- [ ] `npx vitest run app` — zielone
- [ ] `npm run build` — zielone
- [ ] **Właściciel:** `npm run test:itest` — cały pakiet, nie tylko nowe pliki
- [ ] **Właściciel:** `npm run e2e` (Playwright) na działającym stacku — faza A nie ma prawa
      zmienić ani jednego ekranu, więc każda różnica to regresja do zbadania
- [ ] `/code-review` na całości zmian fazy
- [ ] `/security-review` — faza dotyka tenant-scope (`trainer_id` w `WHERE`), autoryzacji
      plików i dedupu webhooka, więc przegląd bezpieczeństwa jest obowiązkowy, nie opcjonalny

---

## Czego ta faza świadomie NIE robi

- Nie zmienia konwencji wstrzykiwania `db` do funkcji `lib/*` — to zostaje do fazy C.
- Nie zmienia ani jednego ekranu, tekstu ani stylu.
- Nie wprowadza NestJS, R2, Redisa, JWT ani klienta API — to fazy B i C.
- Nie porządkuje modułów `lib/` poza przeniesieniem `findTraineeOfTrainer` do właściwego
  pliku (Zadanie 1), które jest po drodze i usuwa sześć duplikatów.
