# Sortowanie i filtrowanie na listach — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać spójne sortowanie, filtrowanie i (gdzie sensowne) wyszukiwanie na wszystkich listach danych w obu panelach, jednym współdzielonym mechanizmem server-side / URL params.

**Architecture:** Czysty parser/walidator parametrów (`lib/list-params.ts`, TDD) + współdzielony komponent paska kontrolek (`components/list-controls.tsx`). Loadery czytają `?q=&sort=&<filtr>=`, repo dostaje te wartości i buduje WHERE/ORDER BY (tenant-scope zostaje pierwszym argumentem). Każda zmiana kontrolki resetuje `page`. Progresja zostaje ujednolicona z client-side `useState` na ten sam wzorzec URL.

**Tech Stack:** React Router v7 (framework mode, `useSubmit`/`Form`/`useSearchParams`), Drizzle ORM + PostgreSQL, Zod (już używane), Vitest (unit), testcontainers (`*.itest.ts`, uruchamia właściciel), Biome.

**Zasady tego repo (nadrzędne):** Claude **nie wykonuje gita ani Dockera**. Kroki „Review/Commit" → po implementacji każdego tasku robimy `/code-review`; commit/branch/push i uruchomienie testów integracyjnych pod Dockerem wykonuje właściciel (handoff na końcu). Każda zmiana UI idzie przez skill `frontend-design:frontend-design` i design-system. UI po polsku.

**Spec:** `docs/superpowers/specs/2026-05-31-listy-sortowanie-filtrowanie-design.md`

---

## Mapa plików

**Nowe:**
- `app/lib/list-params.ts` — typy `ListControlsSpec`/`ListControlsState`, `parseListControls`, `buildControlHref` (czyste).
- `app/lib/list-params.test.ts` — testy jednostkowe powyższego.
- `app/components/list-controls.tsx` — komponent `<ListControls>` (szukajka + sort `<select>` + chipy filtrów).
- `tests/lists-sort-filter-tenant-scope.itest.ts` — integracyjny test tenant-scope filtrów/sortu (PISZE Claude, uruchamia właściciel).

**Modyfikowane (repo):**
- `app/lib/workouts.ts` — `listLogsForTrainee`/`countLogsForTrainee` (przebudowa na podzapytanie agregatów: sort po trudności, filtr wideo, search po nazwie sesji); `listClientsForTrainer`/`countClientsForTrainer` (search + sort, w tym po sesjach przez podzapytanie).
- `app/lib/consultations.ts` — `listConsultationsForTrainee` (search po tytule, sort, filtr otwartych punktów).
- `app/lib/body-photos.ts` — `listBodyPhotosForTrainee` (kierunek sortu).
- `app/lib/progression.ts` — bez zmian SQL (filtr/sort w loaderze).

**Modyfikowane (trasy):**
- `app/routes/trener/biblioteka._index.tsx`
- `app/routes/trener/plany._index.tsx`
- `app/routes/trener/podopieczni._index.tsx`
- `app/routes/trener/podopieczni.$traineeId.tsx` (sekcja logów)
- `app/routes/podopieczny/historia._index.tsx`
- `app/routes/podopieczny/sylwetka.tsx`
- `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`
- `app/routes/podopieczny/konsultacje._index.tsx`
- `app/routes/podopieczny/progresja._index.tsx`
- `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx`

**Dokumentacja:** README katalogów `app/lib/`, `app/components/`, `app/routes/trener/`, `app/routes/podopieczny/`, `tests/`; ew. `CLAUDE.md`.

---

## Task 1: Fundament — `lib/list-params.ts` (parser + helper hrefów, TDD)

**Files:**
- Create: `app/lib/list-params.ts`
- Test: `app/lib/list-params.test.ts`

- [ ] **Step 1: Napisz failujący test**

`app/lib/list-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildControlHref,
  parseListControls,
  type ListControlsSpec,
} from "./list-params";

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "name_asc", label: "Nazwa A–Z" },
  ],
  defaultSort: "newest",
  filterGroups: [
    {
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "active", label: "Aktywne" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

describe("parseListControls", () => {
  it("zwraca wartości domyślne dla pustych params", () => {
    const s = parseListControls(new URLSearchParams(), spec);
    expect(s).toEqual({ sort: "newest", filters: { status: "all" }, q: "" });
  });

  it("akceptuje poprawne wartości", () => {
    const sp = new URLSearchParams("sort=name_asc&status=active&q=  pull  ");
    const s = parseListControls(sp, spec);
    expect(s.sort).toBe("name_asc");
    expect(s.filters.status).toBe("active");
    expect(s.q).toBe("pull"); // przycięte
  });

  it("odrzuca nieznany sort i filtr do wartości domyślnej", () => {
    const sp = new URLSearchParams("sort=bogus&status=bogus");
    const s = parseListControls(sp, spec);
    expect(s.sort).toBe("newest");
    expect(s.filters.status).toBe("all");
  });

  it("ignoruje q gdy lista nie jest searchable", () => {
    const s = parseListControls(
      new URLSearchParams("q=abc"),
      { ...spec, searchable: false },
    );
    expect(s.q).toBe("");
  });
});

describe("buildControlHref", () => {
  it("ustawia parametr i zawsze resetuje page", () => {
    const cur = new URLSearchParams("page=4&status=all&sort=newest");
    expect(buildControlHref(cur, { sort: "name_asc" })).toBe(
      "?status=all&sort=name_asc",
    );
  });

  it("usuwa parametr przy wartości pustej/null i czyści page", () => {
    const cur = new URLSearchParams("status=active&page=2");
    expect(buildControlHref(cur, { status: null })).toBe(".");
  });

  it("zachowuje pozostałe parametry", () => {
    const cur = new URLSearchParams("q=pull&sort=newest");
    expect(buildControlHref(cur, { status: "active" })).toBe(
      "?q=pull&sort=newest&status=active",
    );
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm test -- list-params`
Expected: FAIL („Cannot find module './list-params'" / brak eksportów).

- [ ] **Step 3: Implementacja minimalna**

`app/lib/list-params.ts`:

```ts
export interface SortOption {
  key: string;
  label: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  /** Nazwa parametru URL, np. "status", "tag", "video". */
  param: string;
  /** Etykieta grupy (a11y / opis). */
  label: string;
  /** Dozwolone opcje — mogą być budowane dynamicznie z danych loadera. */
  options: FilterOption[];
  /** Wartość traktowana jako „brak filtra" (usuwana z URL), zwykle "all". */
  defaultValue: string;
}

export interface ListControlsSpec {
  sortOptions: SortOption[];
  defaultSort: string;
  filterGroups: FilterGroup[];
  searchable: boolean;
}

export interface ListControlsState {
  sort: string;
  /** param -> zwalidowana wartość (zawsze ustawiona, choćby domyślna). */
  filters: Record<string, string>;
  /** Przycięte zapytanie; "" gdy brak lub lista !searchable. */
  q: string;
}

/** Parsuje i waliduje stan kontrolek z URLSearchParams. Nie ufa wejściu. */
export function parseListControls(
  sp: URLSearchParams,
  spec: ListControlsSpec,
): ListControlsState {
  const rawSort = sp.get("sort");
  const sort = spec.sortOptions.some((o) => o.key === rawSort)
    ? (rawSort as string)
    : spec.defaultSort;

  const filters: Record<string, string> = {};
  for (const g of spec.filterGroups) {
    const raw = sp.get(g.param);
    filters[g.param] = g.options.some((o) => o.value === raw)
      ? (raw as string)
      : g.defaultValue;
  }

  const q = spec.searchable ? (sp.get("q") ?? "").trim() : "";

  return { sort, filters, q };
}

/**
 * Buduje querystring z `current`, nadpisując/usuwając podane parametry i ZAWSZE
 * resetując `page`. Pusty/`null` => parametr usunięty. Zwraca wartość gotową
 * dla <Link to>: "?a=b" albo "." gdy querystring pusty.
 */
export function buildControlHref(
  current: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const params = new URLSearchParams(current);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  params.delete("page");
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : ".";
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- list-params`
Expected: PASS (wszystkie przypadki).

- [ ] **Step 5: Review**

`/code-review` na zmianach. Nanieś uwagi. (Bez commita — git robi właściciel.)

---

## Task 2: Komponent `<ListControls>` (UI, przez frontend-design)

> **UI:** ten task implementuj przez skill `frontend-design:frontend-design` — trzymaj się design-systemu (`design-system/README.md`, `app/styles/tokens.css`) i istniejących klas (`btn`, `btn-sm`, `btn-dark`, `input-search`, `row`, `wrap`). Wzorzec szukajki z auto-submit skopiuj z `app/routes/trener/biblioteka._index.tsx:125-183`.

**Files:**
- Create: `app/components/list-controls.tsx`

- [ ] **Step 1: Implementacja komponentu**

`app/components/list-controls.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Form, Link, useSearchParams, useSubmit } from "react-router";
import { Icons } from "./icons";
import {
  buildControlHref,
  type ListControlsSpec,
  type ListControlsState,
} from "~/lib/list-params";

interface ListControlsProps {
  spec: ListControlsSpec;
  state: ListControlsState;
  /** Placeholder szukajki (gdy spec.searchable). */
  searchPlaceholder?: string;
}

/**
 * Współdzielony pasek kontrolek listy: szukajka (opcjonalnie) + dropdown sortu
 * + chipy filtrów. Sterowany URL search params (server-side). Każda zmiana
 * resetuje `page` (formularz GET nie zawiera page; chipy budują href przez
 * buildControlHref). Działa bez JS (natywny submit + <noscript>).
 */
export function ListControls({ spec, state, searchPlaceholder }: ListControlsProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSubmit = (form: HTMLFormElement) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      submit(form, { method: "get", replace: true });
    }, 300);
  };
  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    },
    [],
  );

  // Aktywne (nie-domyślne) filtry niosiemy jako ukryte pola, by przetrwały
  // submit szukajki/sortu. `page` celowo pomijamy => reset do strony 1.
  const hiddenFilters = spec.filterGroups
    .filter((g) => state.filters[g.param] !== g.defaultValue)
    .map((g) => (
      <input key={g.param} type="hidden" name={g.param} value={state.filters[g.param]} />
    ));

  return (
    <div className="col" style={{ gap: 10, marginBottom: 16 }}>
      <Form
        method="get"
        className="row wrap"
        style={{ gap: 8, alignItems: "center" }}
        onChange={(e) => scheduleAutoSubmit(e.currentTarget)}
      >
        {spec.searchable && (
          <div className="input-search" style={{ flex: 1, minWidth: 220 }}>
            <Icons.Search />
            <input
              name="q"
              defaultValue={state.q}
              placeholder={searchPlaceholder ?? "Szukaj…"}
              className="input"
              type="search"
              autoComplete="off"
            />
          </div>
        )}

        {hiddenFilters}

        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className="text-xs muted">Sortuj</span>
          <select name="sort" defaultValue={state.sort} className="input" style={{ width: "auto" }}>
            {spec.sortOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <noscript>
          <button type="submit" className="btn btn-sm">
            Zastosuj
          </button>
        </noscript>
      </Form>

      {spec.filterGroups.map((g) => (
        <div key={g.param} className="row wrap" style={{ gap: 6 }} aria-label={g.label}>
          {g.options.map((opt) => {
            const isActive = state.filters[g.param] === opt.value;
            const href = buildControlHref(searchParams, {
              [g.param]: opt.value === g.defaultValue ? null : opt.value,
            });
            return (
              <Link
                key={opt.value}
                to={href}
                className={isActive ? "btn btn-sm btn-dark" : "btn btn-sm"}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck/build (komponent nie jest jeszcze użyty)**

Run: `npm run typecheck`
Expected: PASS (brak błędów typów; `Icons.Search` i klasy istnieją).

- [ ] **Step 3: Review**

`/code-review` na zmianach. (Komponent zostanie zweryfikowany wizualnie w Tasku 3, gdy podepniemy go do Biblioteki.)

---

## Task 3: Biblioteka — pierwszy odbiorca (sort + filtr jednostki), dowód end-to-end

> Biblioteka już ma szukajkę i filtr kategorii (inline). Tu: (a) podmieniamy ręczne kontrolki na `<ListControls>`, (b) dodajemy sort i filtr jednostki REPS/SEC. UI przez `frontend-design`.

**Files:**
- Modify: `app/routes/trener/biblioteka._index.tsx`

- [ ] **Step 1: W loaderze zbuduj spec i sparsuj stan**

W `loader` (po `listCategoriesForTrainer`) dołóż budowę specyfikacji i parsowanie. Zastąp ręczne czytanie `q`/`tag`:

```ts
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { asc, desc } from "drizzle-orm";

// ...wewnątrz loadera, po pobraniu categories:
const spec: ListControlsSpec = {
  sortOptions: [
    { key: "name_asc", label: "Nazwa A–Z" },
    { key: "name_desc", label: "Nazwa Z–A" },
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
  ],
  defaultSort: "name_asc",
  filterGroups: [
    {
      param: "tag",
      label: "Kategoria",
      options: [
        { value: "all", label: "Wszystkie" },
        ...categories.map((c) => ({ value: c.name, label: c.name })),
      ],
      defaultValue: "all",
    },
    {
      param: "unit",
      label: "Jednostka",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "REPS", label: "Powtórzenia" },
        { value: "SEC", label: "Czas" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};
const controls = parseListControls(url.searchParams, spec);
```

- [ ] **Step 2: Zastosuj filtry i sort w zapytaniu**

Zamień blok `conditions`/`orderBy`. `q` z `controls.q`, `tag` z `controls.filters.tag`, dodaj `unit`:

```ts
const conditions = [
  eq(schema.exercises.trainerId, user.id),
  isNull(schema.exercises.archivedAt),
];
if (controls.q.length > 0) conditions.push(ilike(schema.exercises.name, `%${controls.q}%`));
if (controls.filters.tag !== "all" && categoryNames.has(controls.filters.tag)) {
  conditions.push(arrayContains(schema.exercises.tags, [controls.filters.tag]));
}
if (controls.filters.unit === "REPS" || controls.filters.unit === "SEC") {
  conditions.push(eq(schema.exercises.unit, controls.filters.unit));
}

const orderBy =
  controls.sort === "name_desc"
    ? [desc(schema.exercises.name)]
    : controls.sort === "newest"
      ? [desc(schema.exercises.createdAt)]
      : controls.sort === "oldest"
        ? [asc(schema.exercises.createdAt)]
        : [asc(schema.exercises.name)];
```

Użyj `orderBy` w obu miejscach zapytania listy (`.orderBy(...orderBy)`), a `conditions` jak dotąd (count + select). Z loadera zwróć `spec` i `controls` zamiast `q`/`tag` (`categories` zostaje do panelu zarządzania kategoriami).

> Wymaga `schema.exercises.createdAt` i `unit` — zweryfikuj w `app/lib/db/schema.ts`; jeśli `createdAt` ma inną nazwę, użyj istniejącej kolumny czasu utworzenia.

- [ ] **Step 3: Podmień kontrolki w komponencie**

Usuń ręczny `<Form>` szukajki i blok `FilterChip` (oraz pomocniczy komponent `FilterChip` na dole pliku). W ich miejsce:

```tsx
import { ListControls } from "~/components/list-controls";
// ...
const { items, spec, controls, categories, page, totalPages, total } =
  useLoaderData<typeof loader>();
// ...w JSX, zamiast starego Form+chipów:
<ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po nazwie…" />
```

Panel „Zarządzaj kategoriami" (`<details>`) zostaje bez zmian.

- [ ] **Step 4: Bramki**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. (Brak testów jednostkowych dla tej trasy — logika DB; weryfikacja wizualna niżej.)

- [ ] **Step 5: Weryfikacja wizualna (frontend-design)**

`npm run shots` (jeśli stack działa lokalnie) lub ręcznie: `/trener/biblioteka` — sort zmienia kolejność, chipy kategorii/jednostki filtrują, szukajka auto-submit, zmiana kontrolki wraca na stronę 1, paginacja zachowuje parametry.

- [ ] **Step 6: Review**

`/code-review` na zmianach. Nanieś uwagi.

---

## Task 4: Plany — szukajka + sort (ma już filtr statusu)

**Files:**
- Modify: `app/routes/trener/plany._index.tsx`

- [ ] **Step 1: Spec + parsowanie w loaderze**

Zachowaj istniejącą logikę zakładek `status` z licznikami (badge), ale przełóż walidację `status` na spec/`controls`. Dodaj szukajkę (nazwa planu LUB nazwa podopiecznego) i sort:

```ts
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
    { key: "name_asc", label: "Nazwa A–Z" },
    { key: "published", label: "Ostatnio opublikowane" },
  ],
  defaultSort: "newest",
  filterGroups: [
    {
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "active", label: "Aktywne" },
        { value: "draft", label: "Drafty" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};
const controls = parseListControls(url.searchParams, spec);
const status = controls.filters.status; // "all" | "active" | "draft"
```

- [ ] **Step 2: WHERE (status + search) i ORDER BY**

Search dotyka nazwy planu i nazwy podopiecznego (jest `innerJoin` z `users`). Dodaj do `conditions`:

```ts
const conditions = [eq(schema.plans.trainerId, user.id), ne(schema.plans.status, "archived")];
if (status !== "all") conditions.push(eq(schema.plans.status, status));
if (controls.q.length > 0) {
  conditions.push(
    or(
      ilike(schema.plans.name, `%${controls.q}%`),
      ilike(schema.users.displayName, `%${controls.q}%`),
    )!,
  );
}

const orderBy =
  controls.sort === "oldest"
    ? [asc(schema.plans.createdAt)]
    : controls.sort === "name_asc"
      ? [asc(schema.plans.name)]
      : controls.sort === "published"
        ? [sql`${schema.plans.publishedAt} DESC NULLS LAST`]
        : [desc(schema.plans.createdAt)];
```

> Uwaga: licznik `total` na zakładki dziś bazuje na `counts[status]`. Po dodaniu szukajki `total` listy musi uwzględniać `q`. Policz `total` osobnym `count()` z pełnym `and(...conditions)` (jak w Bibliotece), a liczniki zakładek (`counts`) zostaw jako liczby globalne bez `q` (to są etykiety zakładek, nie total strony). Zwróć z loadera `spec`, `controls`, `total` (z filtrem), `counts` (do badge), `page`, `totalPages`.

Zastosuj `q` do count listy. Zastosuj `orderBy` w zapytaniu wierszy. Search łączy się z `users` — `innerJoin` już jest w zapytaniu wierszy; dla count też dołącz `innerJoin(users)` gdy `q` niepuste (albo zawsze, jest tani).

- [ ] **Step 3: Podmień kontrolki w komponencie**

Usuń ręczny blok zakładek statusu (`STATUS_TABS.map(...)`). W jego miejsce `<ListControls>`. Liczniki zakładek (badge) były miłym dodatkiem — odwzoruj je w etykietach opcji filtra statusu (np. `Aktywne (${counts.active})`) budując `options` z licznikami w loaderze:

```ts
options: [
  { value: "all", label: `Wszystkie (${counts.all})` },
  { value: "active", label: `Aktywne (${counts.active})` },
  { value: "draft", label: `Drafty (${counts.draft})` },
],
```

(Policz `counts` przed budową spec.) Render: `<ListControls spec={spec} state={controls} searchPlaceholder="Szukaj planu lub podopiecznego…" />`.

- [ ] **Step 4: Bramki + wizualka + review**

Run: `npm run typecheck && npm run lint && npm test` → PASS.
Ręcznie `/trener/plany`: filtr statusu (z licznikami), sort 4 opcje, szukajka po nazwie/podopiecznym, reset page. `/code-review`.

---

## Task 5: Repo — przebudowa `listLogsForTrainee`/`countLogsForTrainee` (agregaty przed paginacją)

> Sort „najtrudniejsze/najłatwiejsze", filtr „z wideo/bez", search po nazwie sesji wymagają agregatów (avg difficulty, has video) i nazwy sesji **przed** `limit/offset`. Dziś agregaty liczone są po paginacji. Przebudowujemy na jedno zapytanie z podzapytaniem CTE. Funkcja obsłuży zarówno Historię, jak i widok trenera.

**Files:**
- Modify: `app/lib/workouts.ts` (`listLogsForTrainee`, `countLogsForTrainee`)
- Test (integ.): `tests/lists-sort-filter-tenant-scope.itest.ts` (rozbudowywany w Tasku 11)

- [ ] **Step 1: Rozszerz sygnatury o opcje sort/filtr/q**

```ts
export type LogSort = "date_desc" | "date_asc" | "hardest" | "easiest";
export interface LogListOpts {
  limit?: number;
  offset?: number;
  sort?: LogSort;          // domyślnie "date_desc"
  q?: string;              // search po nazwie sesji
  video?: "all" | "with" | "without"; // domyślnie "all"
}
```

- [ ] **Step 2: Przebuduj `listLogsForTrainee` na CTE agregatów**

```ts
export async function listLogsForTrainee(
  db: Db,
  traineeId: string,
  opts: LogListOpts = {},
): Promise<WorkoutLogListItem[]> {
  const statsSub = db.$with("log_stats").as(
    db
      .select({
        logId: schema.workoutExerciseLogs.workoutLogId,
        exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExerciseLogs.id})::int`.as("exercise_count"),
        setCount: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`.as("set_count"),
        avgDifficulty: sql<number>`COALESCE(AVG(${schema.workoutSetLogs.difficulty}), 0)::float`.as("avg_difficulty"),
        hasVideo: sql<boolean>`bool_or(${schema.workoutSetLogs.videoFileId} IS NOT NULL)`.as("has_video"),
      })
      .from(schema.workoutExerciseLogs)
      .leftJoin(
        schema.workoutSetLogs,
        eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
      )
      .groupBy(schema.workoutExerciseLogs.workoutLogId),
  );

  const conditions = [eq(schema.workoutLogs.traineeId, traineeId)];
  if (opts.q && opts.q.length > 0) {
    conditions.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
  }
  if (opts.video === "with") conditions.push(sql`COALESCE(${statsSub.hasVideo}, false) = true`);
  if (opts.video === "without") conditions.push(sql`COALESCE(${statsSub.hasVideo}, false) = false`);

  const orderBy =
    opts.sort === "date_asc"
      ? [asc(schema.workoutLogs.performedOn), asc(schema.workoutLogs.createdAt)]
      : opts.sort === "hardest"
        ? [sql`COALESCE(${statsSub.avgDifficulty}, 0) DESC`, desc(schema.workoutLogs.performedOn)]
        : opts.sort === "easiest"
          ? [sql`COALESCE(${statsSub.avgDifficulty}, 0) ASC`, desc(schema.workoutLogs.performedOn)]
          : [desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt)];

  const rows = await db
    .with(statsSub)
    .select({
      log: schema.workoutLogs,
      exerciseCount: sql<number>`COALESCE(${statsSub.exerciseCount}, 0)::int`,
      setCount: sql<number>`COALESCE(${statsSub.setCount}, 0)::int`,
      avgDifficulty: sql<number>`COALESCE(${statsSub.avgDifficulty}, 0)::float`,
      hasVideo: sql<boolean>`COALESCE(${statsSub.hasVideo}, false)`,
    })
    .from(schema.workoutLogs)
    .leftJoin(statsSub, eq(statsSub.logId, schema.workoutLogs.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.log.id,
    performedOn: r.log.performedOn,
    sessionName: r.log.sessionName,
    note: r.log.note,
    exerciseCount: Number(r.exerciseCount),
    setCount: Number(r.setCount),
    hasVideo: Boolean(r.hasVideo),
    avgDifficulty: Math.round(Number(r.avgDifficulty) * 10) / 10,
  }));
}
```

Usuń teraz nieużywaną pomocniczą `statsForLogs`, jeśli nigdzie indziej nie jest wołana (sprawdź `Grep`). Jeśli jest — zostaw.

- [ ] **Step 3: `countLogsForTrainee` z tymi samymi filtrami**

```ts
export async function countLogsForTrainee(
  db: Db,
  traineeId: string,
  opts: { q?: string; video?: "all" | "with" | "without" } = {},
): Promise<number> {
  // Filtr wideo wymaga agregatu — gdy aktywny, policz przez podzapytanie.
  if (opts.video === "with" || opts.video === "without") {
    const statsSub = db.$with("log_stats").as(
      db
        .select({
          logId: schema.workoutExerciseLogs.workoutLogId,
          hasVideo: sql<boolean>`bool_or(${schema.workoutSetLogs.videoFileId} IS NOT NULL)`.as("has_video"),
        })
        .from(schema.workoutExerciseLogs)
        .leftJoin(
          schema.workoutSetLogs,
          eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
        )
        .groupBy(schema.workoutExerciseLogs.workoutLogId),
    );
    const conds = [eq(schema.workoutLogs.traineeId, traineeId)];
    if (opts.q && opts.q.length > 0) conds.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
    conds.push(
      opts.video === "with"
        ? sql`COALESCE(${statsSub.hasVideo}, false) = true`
        : sql`COALESCE(${statsSub.hasVideo}, false) = false`,
    );
    const [row] = await db
      .with(statsSub)
      .select({ c: count() })
      .from(schema.workoutLogs)
      .leftJoin(statsSub, eq(statsSub.logId, schema.workoutLogs.id))
      .where(and(...conds));
    return Number(row?.c ?? 0);
  }

  const conds = [eq(schema.workoutLogs.traineeId, traineeId)];
  if (opts.q && opts.q.length > 0) conds.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
  const [row] = await db.select({ c: count() }).from(schema.workoutLogs).where(and(...conds));
  return Number(row?.c ?? 0);
}
```

Upewnij się, że importy `asc`, `ilike` są obecne w `workouts.ts` (dodaj do `import { ... } from "drizzle-orm"`).

- [ ] **Step 4: Bramki**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Zachowanie SQL zweryfikujemy integracyjnie w Tasku 11; jednostkowo brak — to logika DB.)

- [ ] **Step 5: Review**

`/code-review` (dotyka konstrukcji zapytań — zwróć uwagę na poprawność CTE i NULLS przy braku serii).

---

## Task 6: Historia (podopieczny) + Logi (trener) — podpięcie kontrolek

> Obie trasy używają `listLogsForTrainee`/`countLogsForTrainee` z Tasku 5. UI przez `frontend-design`.

**Files:**
- Modify: `app/routes/podopieczny/historia._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx` (sekcja logów)

- [ ] **Step 1: Historia — spec, parsowanie, przekazanie do repo**

```ts
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { ListControls } from "~/components/list-controls";

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "date_desc", label: "Najnowsze" },
    { key: "date_asc", label: "Najstarsze" },
    { key: "hardest", label: "Najtrudniejsze" },
    { key: "easiest", label: "Najłatwiejsze" },
  ],
  defaultSort: "date_desc",
  filterGroups: [
    {
      param: "video",
      label: "Wideo",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "with", label: "Z wideo" },
        { value: "without", label: "Bez wideo" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};
const controls = parseListControls(url.searchParams, spec);

const total = await countLogsForTrainee(db, user.id, {
  q: controls.q,
  video: controls.filters.video as "all" | "with" | "without",
});
// ...paginacja jak dziś...
const logs = await listLogsForTrainee(db, user.id, {
  limit: PAGE_SIZE,
  offset,
  sort: controls.sort as LogSort,
  q: controls.q,
  video: controls.filters.video as "all" | "with" | "without",
});
return { logs, spec, controls, page: safePage, totalPages, total };
```

> Spec wymaga „najwięcej serii" w Historii (wg spec). Dodaj opcję sortu `{ key: "sets_desc", label: "Najwięcej serii" }` i w Tasku 5 dołóż gałąź `opts.sort === "sets_desc" → [sql\`COALESCE(${statsSub.setCount},0) DESC\`, desc(performedOn)]` oraz typ `LogSort` o ten wariant. (Jeśli pomijasz — usuń z tabeli spec; nie zostawiaj rozbieżności.)

W JSX dołóż nad listą: `<ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po nazwie sesji…" />`.

- [ ] **Step 2: Widok trenera — to samo na sekcji logów**

W `app/routes/trener/podopieczni.$traineeId.tsx` loader: zbuduj identyczny `spec` (sort bez „najwięcej serii" lub z — spójnie z Historią), sparsuj `controls`, przekaż do `countLogsForTrainee`/`listLogsForTrainee` z `traineeId`. Zwróć `spec`/`controls`. Render `<ListControls>` nad sekcją „Historia logów". Parametry URL (`q`,`sort`,`video`,`page`) współdzielą tę stronę — to jedyna lista tutaj, więc bez kolizji.

- [ ] **Step 3: Bramki + wizualka + review**

Run: `npm run typecheck && npm run lint && npm test` → PASS.
Ręcznie `/podopieczny/historia` i `/trener/podopieczni/:id`: sort po dacie/trudności, filtr wideo, szukajka po sesji, reset page, paginacja OK. `/code-review`.

---

## Task 7: Podopieczni — szukajka + sort (w tym po sesjach, podzapytanie)

**Files:**
- Modify: `app/lib/workouts.ts` (`listClientsForTrainer`, `countClientsForTrainer`)
- Modify: `app/routes/trener/podopieczni._index.tsx`

- [ ] **Step 1: Repo — rozszerz `listClientsForTrainer` o sort/q (agregat przed paginacją)**

```ts
export type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest";
export interface ClientListOpts {
  limit?: number;
  offset?: number;
  sort?: ClientSort; // domyślnie "name_asc"
  q?: string;        // search po displayName lub email
}
```

Przebuduj zapytanie `clients` tak, by sort po sesjach działał przed `limit/offset`: dołącz podzapytanie agregujące logi i `leftJoin` przed `orderBy`:

```ts
const statsSub = db.$with("client_stats").as(
  db
    .select({
      traineeId: schema.workoutLogs.traineeId,
      sessionCount: count().as("session_count"),
      lastSession: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`.as("last_session"),
    })
    .from(schema.workoutLogs)
    .groupBy(schema.workoutLogs.traineeId),
);

const conditions = [eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")];
if (opts.q && opts.q.length > 0) {
  conditions.push(
    or(
      ilike(schema.users.displayName, `%${opts.q}%`),
      ilike(schema.users.email, `%${opts.q}%`),
    )!,
  );
}

const orderBy =
  opts.sort === "name_desc"
    ? [desc(schema.users.displayName)]
    : opts.sort === "last_session"
      ? [sql`${statsSub.lastSession} DESC NULLS LAST`, asc(schema.users.displayName)]
      : opts.sort === "most_sessions"
        ? [sql`COALESCE(${statsSub.sessionCount}, 0) DESC`, asc(schema.users.displayName)]
        : opts.sort === "newest"
          ? [sql`${schema.users.joinedOn} DESC NULLS LAST`, asc(schema.users.displayName)]
          : [asc(schema.users.displayName)];

const clients = await db
  .with(statsSub)
  .select({
    id: schema.users.id,
    displayName: schema.users.displayName,
    joinedOn: schema.users.joinedOn,
    totalSessions: sql<number>`COALESCE(${statsSub.sessionCount}, 0)::int`,
    lastSession: sql<string | null>`${statsSub.lastSession}`,
  })
  .from(schema.users)
  .leftJoin(statsSub, eq(statsSub.traineeId, schema.users.id))
  .where(and(...conditions))
  .orderBy(...orderBy)
  .limit(opts.limit ?? 200)
  .offset(opts.offset ?? 0);
```

Potem (jak dziś) dociągnij aktywne plany dla `ids` i złóż `ClientStats` z już policzonymi `totalSessions`/`lastSession` (nie nadpisuj ich osobnym `counts`-Map — usuń stary blok `counts`/`statsByTrainee`, bo agregaty masz teraz w `clients`).

`countClientsForTrainer` rozszerz o `q`:

```ts
export async function countClientsForTrainer(
  db: Db,
  trainerId: string,
  opts: { q?: string } = {},
): Promise<number> {
  const conds = [eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")];
  if (opts.q && opts.q.length > 0) {
    conds.push(or(ilike(schema.users.displayName, `%${opts.q}%`), ilike(schema.users.email, `%${opts.q}%`))!);
  }
  const [row] = await db.select({ c: count() }).from(schema.users).where(and(...conds));
  return Number(row?.c ?? 0);
}
```

Dodaj importy `asc`, `desc`, `ilike`, `or` w `workouts.ts` jeśli brak. Zweryfikuj, że `schema.users.email` istnieje.

- [ ] **Step 2: Trasa — spec, parsowanie, przekazanie**

```ts
const spec: ListControlsSpec = {
  sortOptions: [
    { key: "name_asc", label: "Nazwisko A–Z" },
    { key: "name_desc", label: "Nazwisko Z–A" },
    { key: "last_session", label: "Ostatnia sesja" },
    { key: "most_sessions", label: "Najwięcej sesji" },
    { key: "newest", label: "Najnowszy podopieczny" },
  ],
  defaultSort: "name_asc",
  filterGroups: [], // brak filtra kategorialnego; opcjonalnie „z planem/bez" — patrz niżej
  searchable: true,
};
const controls = parseListControls(url.searchParams, spec);
const total = await countClientsForTrainer(db, user.id, { q: controls.q });
// paginacja...
const clients = await listClientsForTrainer(db, user.id, {
  limit: PAGE_SIZE, offset, sort: controls.sort as ClientSort, q: controls.q,
});
return { clients, spec, controls, page: safePage, totalPages, total, deletedName };
```

> Filtr „z aktywnym planem / bez" (ze spec): wymaga dołączenia statusu aktywnego planu do warunku. Jeśli wchodzi — dodaj `filterGroups: [{ param: "plan", label: "Plan", options: [{value:"all",label:"Wszyscy"},{value:"with",label:"Z aktywnym planem"},{value:"without",label:"Bez planu"}], defaultValue:"all" }]` i w repo dołącz `EXISTS (active plan)` do `conditions` + count. Jeśli pomijasz w tej iteracji — usuń ten filtr z tabeli spec, by nie było rozbieżności.

W JSX: `<ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po nazwisku lub emailu…" />` nad listą.

- [ ] **Step 3: Bramki + wizualka + review**

Run: `npm run typecheck && npm run lint && npm test` → PASS.
Ręcznie `/trener/podopieczni`: sort po nazwisku/sesjach/dacie ostatniej sesji/dołączeniu, szukajka. **Szczególnie** sprawdź, że sort „najwięcej sesji"/„ostatnia sesja" działa POPRAWNIE przez wiele stron (agregat przed paginacją). `/code-review`.

---

## Task 8: Sylwetka — sort (kierunek)

**Files:**
- Modify: `app/lib/body-photos.ts` (`listBodyPhotosForTrainee`)
- Modify: `app/routes/podopieczny/sylwetka.tsx`

- [ ] **Step 1: Repo — kierunek sortu**

```ts
export async function listBodyPhotosForTrainee(
  db: Db,
  traineeId: string,
  opts: { limit?: number; offset?: number; sort?: "newest" | "oldest" } = {},
): Promise<BodyPhotoRow[]> {
  const order =
    opts.sort === "oldest"
      ? [asc(schema.bodyPhotos.takenOn), asc(schema.bodyPhotos.createdAt)]
      : [desc(schema.bodyPhotos.takenOn), desc(schema.bodyPhotos.createdAt)];
  const rows = await db
    .select({ photo: schema.bodyPhotos, mimeType: schema.files.mimeType })
    .from(schema.bodyPhotos)
    .innerJoin(schema.files, eq(schema.files.id, schema.bodyPhotos.fileId))
    .where(eq(schema.bodyPhotos.traineeId, traineeId))
    .orderBy(...order)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
  // ...reszta bez zmian
}
```

Dodaj `asc` do importów drizzle w `body-photos.ts`.

- [ ] **Step 2: Trasa — spec (tylko sort), parsowanie, przekazanie**

```ts
const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
  ],
  defaultSort: "newest",
  filterGroups: [],
  searchable: false,
};
const controls = parseListControls(url.searchParams, spec);
// ...do listBodyPhotosForTrainee przekaż sort: controls.sort as "newest" | "oldest"
```

W JSX: `<ListControls spec={spec} state={controls} />`. Sekcja `add`/`delete` (akcje, upload) bez zmian.

- [ ] **Step 3: Bramki + wizualka + review**

`npm run typecheck && npm run lint && npm test` → PASS. Ręcznie `/podopieczny/sylwetka`: przełączanie najnowsze/najstarsze, paginacja zachowuje sort. `/code-review`.

---

## Task 9: Konsultacje (trener + podopieczny) — szukajka + sort + filtr otwartych

> Bez paginacji (limit 200 zostaje). Filtr/sort działają w obrębie limitu.

**Files:**
- Modify: `app/lib/consultations.ts` (`listConsultationsForTrainee`)
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`
- Modify: `app/routes/podopieczny/konsultacje._index.tsx`

- [ ] **Step 1: Repo — sort/q/filtr otwartych**

```ts
export type ConsultationSort = "date_desc" | "date_asc" | "most_open";
export interface ConsultationListOpts {
  limit?: number;
  offset?: number;
  sort?: ConsultationSort;          // domyślnie "date_desc"
  q?: string;                       // search po tytule
  open?: "all" | "with_open";       // domyślnie "all"
}
```

W `listConsultationsForTrainee` dołóż WHERE na tytuł, ORDER BY wg sortu, a filtr „z otwartymi" jako `HAVING` (bo `open` to agregat):

```ts
const where = [eq(schema.consultations.traineeId, traineeId)];
if (opts.q && opts.q.length > 0) where.push(ilike(schema.consultations.title, `%${opts.q}%`));

const openExpr = sql<number>`count(*) filter (where ${schema.consultationActionItems.status} = 'open')`;
const orderBy =
  opts.sort === "date_asc"
    ? [asc(schema.consultations.heldOn), asc(schema.consultations.createdAt)]
    : opts.sort === "most_open"
      ? [sql`${openExpr} DESC`, desc(schema.consultations.heldOn)]
      : [desc(schema.consultations.heldOn), desc(schema.consultations.createdAt)];

let query = db
  .select({ /* ...jak dziś, open: openExpr.as? — zostaw jak jest... */ })
  .from(schema.consultations)
  .leftJoin(schema.consultationActionItems, eq(schema.consultationActionItems.consultationId, schema.consultations.id))
  .where(and(...where))
  .groupBy(schema.consultations.id);

if (opts.open === "with_open") {
  query = query.having(sql`count(*) filter (where ${schema.consultationActionItems.status} = 'open') > 0`);
}

const rows = await query.orderBy(...orderBy).limit(opts.limit ?? 100).offset(opts.offset ?? 0);
```

Dodaj `asc`, `ilike` do importów (są już `and, asc, count, desc, eq, sql`; dołóż `ilike`).

- [ ] **Step 2: Obie trasy — spec, parsowanie, render**

Wspólny spec (identyczny dla trenera i podopiecznego):

```ts
const spec: ListControlsSpec = {
  sortOptions: [
    { key: "date_desc", label: "Najnowsze" },
    { key: "date_asc", label: "Najstarsze" },
    { key: "most_open", label: "Najwięcej otwartych" },
  ],
  defaultSort: "date_desc",
  filterGroups: [
    {
      param: "open",
      label: "Punkty",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "with_open", label: "Z otwartymi" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};
const controls = parseListControls(url.searchParams, spec);
const items = await listConsultationsForTrainee(db, traineeId, {
  sort: controls.sort as ConsultationSort,
  q: controls.q,
  open: controls.filters.open as "all" | "with_open",
});
```

(Trener: `traineeId` z `findTraineeOfTrainer`/istniejącego authz; podopieczny: `user.id`.) Render `<ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po tytule…" />` nad listą. Zwróć `spec`/`controls` z loaderów.

- [ ] **Step 3: Bramki + wizualka + review**

`npm run typecheck && npm run lint && npm test` → PASS. Ręcznie obie listy konsultacji: sort, filtr „z otwartymi", szukajka po tytule. `/code-review`.

---

## Task 10: Progresja (podopieczny + trener) — ujednolicenie na URL params

> Przenosimy `tag`/`sort` z `useState` do loadera (URL params). Tryb „Porównaj" zostaje stanem klienta. `sortProgressionRows` już istnieje i jest przetestowany. UI przez `frontend-design`.

**Files:**
- Modify: `app/routes/podopieczny/progresja._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.progresja._index.tsx`

- [ ] **Step 1: Loader — sparsuj sort/tag, filtruj+sortuj po stronie serwera**

Dla podopiecznego (`defaultSort: "recent"`):

```ts
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { sortProgressionRows } from "~/lib/progression-math";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const rows = await listProgressionExercises(db, user.id);

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
        options: [{ value: "all", label: "Wszystkie" }, ...tagOptions.map((t) => ({ value: t, label: t }))],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);

  const filtered =
    controls.filters.tag === "all" ? rows : rows.filter((r) => r.tags.includes(controls.filters.tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { rows: visible, spec, controls };
}
```

Trener: analogicznie, `requireUser({role:"trainer"})` + `findTraineeOfTrainer` (404), `defaultSort: "attention"`, zwróć też `trainee` i `summary` (z pełnego `rows` przed filtrem — `summarizeStatuses(rows)` policz na nieprzefiltrowanym zbiorze, by pasek statusów pokazywał całość).

- [ ] **Step 2: Komponent — usuń `useState` sort/tag, użyj `<ListControls>` + loader data**

Usuń `useState` dla `tag` i `sort` oraz `useMemo` `tags`/`visible` i lokalny `SORT_OPTIONS`/`FilterChip`. Zostaw `useState` dla `compare`/`selected` (tryb porównania). Renderuj wiersze wprost z `rows` (już przefiltrowane/posortowane przez loader). Nad listą:

```tsx
import { ListControls } from "~/components/list-controls";
// ...
const { rows, spec, controls } = useLoaderData<typeof loader>(); // trener: + trainee, summary
// ...w miejscu starego bloku „Controls: tag filter + sort":
<ListControls spec={spec} state={controls} />
```

Empty-state „Brak ćwiczeń w tej kategorii" zostaw (gdy `rows.length === 0` a był aktywny filtr). Pełny empty-state (`listProgressionExercises` pusta) — sprawdzaj osobno: dodaj do loadera flagę `hasAny: rows.length > 0` PRZED filtrem albo policz w loaderze i zwróć, by odróżnić „brak danych w ogóle" od „brak w tej kategorii".

> Tryb „Porównaj": linki `compareHref` z `selected` zostają client-side (`?ex=` na trasie porównania) — bez zmian.

- [ ] **Step 3: Bramki + wizualka + review**

`npm run typecheck && npm run lint && npm test` → PASS (w tym istniejący `progression-math.test.ts`).
Ręcznie `/podopieczny/progresja` i `/trener/podopieczni/:id/progresja`: sort i filtr tagów teraz w URL (odświeżenie/link zachowuje stan), tryb „Porównaj" działa, pasek statusów (trener) pokazuje całość. `/code-review`.

---

## Task 11: Testy integracyjne tenant-scope + dokumentacja + bramki końcowe

**Files:**
- Create: `tests/lists-sort-filter-tenant-scope.itest.ts`
- Modify: README katalogów + ew. `CLAUDE.md`

- [ ] **Step 1: Napisz test integracyjny tenant-scope (NIE uruchamiaj — Docker)**

Wzoruj się na istniejących `tests/*.itest.ts` (testcontainers, seed dwóch trenerów/podopiecznych). Pokryj:
- `listLogsForTrainee(db, traineeA, { q, video, sort })` zwraca **wyłącznie** logi traineeA, dla różnych kombinacji sort/filtr (w tym „hardest" i „video: with").
- `listClientsForTrainer(db, trainerA, { sort: "most_sessions" })` zwraca tylko klientów trainerA i poprawną kolejność wg liczby sesji **przez granicę paginacji** (seed >limit klientów o różnej liczbie sesji; sprawdź pierwszą i drugą stronę).
- `listConsultationsForTrainee(db, traineeA, { open: "with_open", q })` — tylko traineeA, tylko z otwartymi punktami.

```ts
// szkic — uzupełnij wg konwencji istniejących itestów (setup db, seed, afterAll)
import { describe, expect, it } from "vitest";
// import { withTestDb, seed... } from "./helpers"; // użyj istniejących helperów
import { listClientsForTrainer, listLogsForTrainee } from "~/lib/workouts";
import { listConsultationsForTrainee } from "~/lib/consultations";

describe("listy: tenant-scope + sort/filtr (integracyjny)", () => {
  it("logi: sort/filtr nie przeciekają między podopiecznymi", async () => {
    // seed: traineeA z logami (część z wideo, różne trudności), traineeB z logami
    // expect: listLogsForTrainee(db, A, { sort: "hardest", video: "with" }) ⊆ logi A
  });
  it("klienci: most_sessions sortuje poprawnie przez paginację i tylko trener A", async () => {
    // seed: trainerA z >30 klientami o różnej liczbie sesji
    // expect: pierwsza strona zwraca klientów A o najwyższej liczbie sesji, malejąco
  });
  it("konsultacje: with_open + q tylko dla podopiecznego A", async () => {});
});
```

Oznacz w pliku komentarzem: „Uruchamia właściciel: `npm run test:integration` (Docker)".

- [ ] **Step 2: Aktualizacja dokumentacji**

- `app/lib/README.md`: dopisz `list-params.ts` (parser/walidacja kontrolek listy) do tabeli; zaktualizuj opisy `workouts.ts`/`consultations.ts`/`body-photos.ts` o nowe opcje sort/filtr/q.
- `app/components/README.md`: dopisz `list-controls.tsx`.
- `app/routes/trener/README.md` i `app/routes/podopieczny/README.md`: zaktualizuj opisy list, które dostały sort/filtr/szukajkę (biblioteka, plany, podopieczni, podopieczni.$id logi, historia, sylwetka, konsultacje×2, progresja×2). Odnotuj, że Konsultacje nadal bez paginacji.
- `tests/README.md`: dopisz `lists-sort-filter-tenant-scope.itest.ts`.
- `CLAUDE.md`: jeśli uznać kontrolki list za konwencję przekrojową — dopisz krótką notkę w „Kluczowe konwencje" (opcjonalnie).

- [ ] **Step 3: Bramki końcowe (z dowodem)**

Run kolejno i potwierdź zielone:
```
npm test
npm run typecheck
npm run lint
npm run build
```
- [ ] `/code-review` na pełnym diffie.
- [ ] `/security-review` — zmiana dotyka konstrukcji zapytań tenant-scope (filtry/sort budowane z parametrów URL). Sprawdź: brak interpolacji surowego `q` poza parametryzowanym `ilike` (Drizzle parametryzuje `%${q}%` jako wartość — potwierdź), tenant-scope zachowany we wszystkich nowych gałęziach WHERE.

- [ ] **Step 4: Handoff**

Przygotuj podsumowanie dla właściciela (patrz sekcja „Handoff" w skillu `kalisthenos-dev-flow`): lista plików, brak migracji (zmiany czysto zapytań), komendy testów integracyjnych do uruchomienia pod Dockerem, ścieżka ręcznej weryfikacji.

---

## Self-review (pokrycie spec)

- ✅ `lib/list-params.ts` + testy — Task 1.
- ✅ `components/list-controls.tsx` — Task 2.
- ✅ Biblioteka (sort + unit) — Task 3.
- ✅ Plany (search + sort) — Task 4.
- ✅ Logi/Historia (search + sort + video; restrukturyzacja agregatów) — Task 5–6.
- ✅ Podopieczni (search + sort, agregat przed paginacją) — Task 7.
- ✅ Sylwetka (sort) — Task 8.
- ✅ Konsultacje ×2 (search + sort + open) — Task 9.
- ✅ Progresja ×2 (ujednolicenie URL) — Task 10.
- ✅ Integ. tenant-scope + sort-klientów + docs + bramki — Task 11.
- ⚠️ Rozbieżności do rozstrzygnięcia w trakcie (oznaczone w tasku): „najwięcej serii" w Historii (Task 6/Task 5) oraz filtr „z aktywnym planem/bez" w Podopiecznych (Task 7) — albo zaimplementuj, albo usuń z tabeli spec. Reszta spec pokryta 1:1.
