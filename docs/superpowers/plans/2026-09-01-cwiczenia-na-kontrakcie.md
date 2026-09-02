# Ćwiczenia na kontrakcie BE — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przepiąć obszar „ćwiczenia" — moduł `app/lib/exercises.ts` i sześć tras, które go
wołają — z Drizzle na `@kalisthenos/api-client`, razem ze ścieżką wysyłki wideo demo. Po tym
zadaniu pierwszy obszar kroku 3 Etapu 2 jest zamknięty w całości (kategorie przeszły wcześniej).

**Architecture:** Wzorzec ustalony na `categories.ts`: pierwszym parametrem `api: Api` dokładnie
tam, gdzie stało `Db`, wnętrze to wywołanie SDK, a własny typ błędu powstaje **wyłącznie** dla
statusów, dla których trasa ma komunikat w formularzu. Nowe wobec kategorii są trzy rzeczy:
stronicowanie przechodzi na stronę BE (`ExercisePage` zamiast pary `count` + `list`), odczyt
demo przestaje być podpisywaniem URL-a w FE (`ExerciseView.demoUrl` przychodzi podpisany
z kontraktu), a zapis z plikiem rozpada się z jednej transakcji na sekwencję żądań.

**Tech Stack:** React Router 7.15.1 (SSR, `v8_middleware`), `@kalisthenos/api-client` 0.3.0
(hey-api), vitest + happy-dom, zod, biome.

**Spec:** [`docs/superpowers/specs/2026-08-29-integracja-fe-be-design.md`](../specs/2026-08-29-integracja-fe-be-design.md)
— §8 krok 3 („moduły `app/lib` obszar po obszarze", kolejność: **ćwiczenia i kategorie** jako
pierwsze) oraz załącznik A, wiersz `exercises.ts`. Wzorzec i regułę rozstrzygającą zostawiły
dwa poprzednie plany: [`2026-08-31-warstwa-klienta-api-fe.md`](2026-08-31-warstwa-klienta-api-fe.md)
(Domknięcie) i [`2026-09-01-uwierzytelnianie-na-tokenach-be.md`](2026-09-01-uwierzytelnianie-na-tokenach-be.md)
(Domknięcie: moduł może mieć własny typ błędu, gdy trasa pokazuje komunikat w formularzu).

## Global Constraints

- **Branch:** cała praca na `be-integration`. `master` jest gałęzią wdrożeniową realnej produkcji —
  nie commituj tam. **Gita prowadzi Właściciel** (`CLAUDE.md`) — komendy `git` w krokach „Bramki
  i commit" są do wykonania przez niego, nie przez agenta.
- **Komunikaty po polsku, identyfikatory w kodzie po angielsku.** Komentarze po polsku, w stylu
  `app/lib/categories.ts`. **Każdy eksportowany symbol, pole interfejsu i nazwa parametru — po
  angielsku.** Na tej gałęzi złamano to już dwa razy i dwa razy wyłapał to przegląd. W testach
  nazwy `describe`/`it` i zmienne lokalne są po polsku (wzorzec: `categories.test.ts`).
- **Testy:** `globals: false` — importuj `describe`/`it`/`expect` z `vitest` jawnie. Komentarz
  w teście tłumaczy **dlaczego** przypadek istnieje, nie co robi kod.
- **Pliki testowe wołające kod, który czyta `getEnv()`, muszą go zamockować.** `exercises.ts`
  importuje `file-uploads.ts`, a ten woła `getEnv()` w `maxUploadBytesFor`:
  `vi.mock("~/lib/env", () => ({ getEnv: () => ({ MAX_UPLOAD_BYTES: 250_000_000, MAX_VIDEO_UPLOAD_BYTES: 30_000_000 }) }))`.
  Mock musi stać **przed** importem modułu (wzorzec: `auth-session.test.ts`, `file-uploads.test.ts:16-18`).
- **Wywołania SDK potrzebujące `data` muszą podać `throwOnError: true` jawnie** — generyk funkcji
  SDK domyślnie schodzi do `false` i `data` typuje się jako `… | undefined`, mimo że klient i tak
  rzuca. Zero zmiany w czasie wykonania. Wzorzec: `categories.ts:29`.
- **Reguła wąskiego `catch`:** moduł zamienia na własny typ błędu **wyłącznie** te statusy/kody,
  dla których trasa ma komunikat. Każdy inny leci `ApiError`-em do granicy błędu. Awaria BE ma
  zostać awarią, a nie zamienić się w „plik za duży".
- **Reguła rozstrzygająca dla `404`:** sygnatura z `| null` łapie `404` przez `orNull`; każda inna
  pozwala mu lecieć. Wyznacza ją sygnatura, nie ocena piszącego.
- **`demoFileId: null` w `PATCH /v1/exercises/{id}` ODPINA demo.** „Zostaw dotychczasowe" znaczy
  **brak klucza** w ciele, nie `null`. To jedyna pułapka tego obszaru, która milczy przy typach.
- **Nie ruszaj** `app/lib/db/`, modułów domenowych innych niż `exercises.ts` i `file-uploads.ts`,
  płatności, ani ścieżek wysyłki `set_video` i `body_photo` (te idą krokiem 4).
- **`tests/exercises-repo.itest.ts` znika w Zadaniu 1** — importuje siedem funkcji, które ten plan
  usuwa, więc czerwieni `npm run typecheck` od pierwszego zadania. Spec §8 krok 6 kasuje cały
  zestaw `tests/*.itest.ts` razem z bazą, a §10 mówi wprost, że po jej utracie „nie ma czego
  integrować"; zamiennikiem jest `app/lib/exercises.test.ts` przeciw podstawionemu klientowi.
  Gwarancje bazodanowe (zakres tenanta, filtry, porządek) są od teraz po stronie BE. Żadnego
  innego pliku w `tests/` nie ruszamy — kolejne obszary spotkają ten sam problem u siebie.
- **Każde zadanie utrzymuje PRAWDZIWOŚĆ dwóch wpisów dokumentacji** — wiersza `exercises.ts`
  (oraz `file-uploads.ts`, od Zadania 4) w `app/lib/README.md` i wierszy trzech tras biblioteki
  w `app/routes/trener/README.md`. `CLAUDE.md` czyni to obowiązkiem („zaktualizuj dokumentację
  w tym samym kroku… jeśli opis przestał być prawdziwy"), a moduł jest przez siedem zadań
  w stanie mieszanym, więc wpis ma mówić, co już stoi na kontrakcie, a co jeszcze na Drizzle.
  Krótko — jedno–dwa zdania korekty. Pełny, końcowy opis pisze dopiero Zadanie 8.
- **Każde zadanie usuwa importy, które właśnie osierociło.** `exercises.ts` traci funkcje
  bazodanowe po kawałku, więc po każdym zadaniu część importów Drizzle (`ilike`, `arrayContains`,
  `count`, `desc`, `asc`, `isNull`, …) przestaje mieć użycie. **Nie łapie tego żadna bramka** —
  `biome.json` tego repozytorium nadpisuje tylko `style`/`suspicious`/`a11y`, a `noUnusedImports`
  nie należy do zestawu `recommended` biome 1.9.4 (sprawdzone uruchomieniem przy Zadaniu 3, gdzie
  `lint` przeszedł mimo dwóch martwych importów). Zostaje ręczne sprawdzenie: po wymianie ciała
  funkcji przejrzyj import Drizzle i wyrzuć symbole, których nie używa już żadna z pozostałych
  funkcji pliku.
- **Bramki: lekkie po zadaniu, pełne raz na końcu.** Pełny zestaw (`tsc` + 47 plików testowych
  w równoległych workerach) po każdym zadaniu wysycał pamięć maszyny Właściciela — przy Zadaniu 5
  `npm run typecheck` przerwał się czterokrotnie brakiem pamięci, bez zmiany kodu między próbami.
  Dlatego:
  - **w trakcie zadania** wyłącznie test dotkniętego pliku, jednowątkowo:
    `npx vitest run app/lib/exercises.test.ts --no-file-parallelism`;
  - **na końcu, po Zadaniu 8**, raz i po kolei: `npm run typecheck`, `npm run lint`,
    `npx vitest run app --no-file-parallelism`, `npm run build`.

  Cena: błąd typów przechodzący przez granicę pliku wyjdzie dopiero na końcu. Przy trzech
  pozostałych zadaniach, dotykających tych samych dwóch–trzech plików, to ryzyko małe i tanie
  do naprawienia jedną rundą.
- Bramka `app/routes/no-direct-db.test.ts` ma zostać zielona przez cały czas — trasy nie zaczynają
  wołać klienta wprost, wołają go przez moduł.

---

## Decyzje obszaru

Wyprowadzone z odczytu kontraktu (`openapi/openapi.json`, `libs/exercises/src/lib/exercises.service.ts`)
i obu stron kodu, nie z nazw.

| # | Decyzja | Uzasadnienie |
|---|---|---|
| **A1** | Sygnatury tracą `trainerId` | zakres tenanta niesie token, BE go egzekwuje; argument podtrzymywałby złudzenie, że FE czegokolwiek pilnuje (wzorzec: `categories.ts:26-31`) |
| **A2** | `ExerciseWithDemo` znika, zostaje `demoUrl` | `ExerciseView.demoUrl` jest **podpisanym** odnośnikiem prosto z kontraktu, na liście i w szczególe. `signFileUrl` w FE znika z tego obszaru. `mime` z wiersza pliku było **martwe** — oba `<video>` (lista i szczegół) nie mają atrybutu `type` |
| **A3** | Sortowanie tłumaczy słownik FE→kontrakt | URL-e list są zakładkowalne (`?sort=name_asc`); kontrakt ma `name\|-name\|newest\|oldest`. Zmienia się moduł, nie adres |
| **A4** | Stronicowanie przechodzi do BE; `countExercisesForTrainer` **znika** | `GET /v1/exercises` oddaje `{ items, page, totalPages, total }` jednym żądaniem, a `paginate` w BE przycina nadmiarową stronę tak samo jak dzisiejsze `safePage`. Rozmiar strony zgadza się co do wartości: `PAGE_SIZE = 24` w trasie FE, `PAGE_SIZE.exercises = 24` w BE — zgodność jest przypadkowa i po przepięciu przestaje mieć znaczenie, bo liczy wyłącznie BE |
| **A5** | Licznik nawigacji bierze `total` z pierwszej strony aktywnych | `GET /v1/trainer/nav` niesie `activeExercises` **razem z** `trainees`, `plans` i `newFeatureRequests` — to jedno wywołanie na EKRAN, nie na licznik. Wołanie go z każdej z czterech funkcji dałoby cztery identyczne żądania. Do zwinięcia `_layout.tsx` w jedno `nav` wracamy w ostatnim obszarze („podopieczni"), gdy migrują pozostałe trzy liczniki. Cena do tego czasu: jedna strona (24 pozycje) ściągana po to, żeby odczytać liczbę |
| **A6** | Picker skleja strony pętlą | kontrakt nie ma parametru „bez stronicowania", a picker potrzebuje pełnej listy. Pętla po `totalPages`, sekwencyjnie. Ryzyko przyjęte świadomie: wstawienie ćwiczenia **w trakcie** przewijania stron może przesunąć jedną pozycję — picker jest listą doradczą, a alternatywą jest dodatek do kontraktu |
| **A7** | Bramka „wariant umiejętności" przechodzi do BE | `POST /v1/exercises/{id}/archive` sam sprawdza `activeVariationOf` i oddaje `409 EXERCISE_IS_SKILL_VARIATION`. Z trasy znika `findSkillForExercise(db, …)` — a razem z nim **ostatnia zależność tego obszaru od `skills.ts`**, modułu jeszcze nieprzepiętego. **Komunikat BE nie nazywa umiejętności**, dzisiejszy FE nazywa. Bierzemy komunikat BE dosłownie (spec: „ustalenia po stronie BE są nadrzędne"; `message` jest już po polsku i dla użytkownika). `details.skillName` jest w odpowiedzi — wzbogacenie zdania jest zmianą treści po stronie BE, nie obejściem w FE |
| **A8** | Zapis z demo to sekwencja żądań, nie transakcja | `CreateExerciseDto` **nie ma** `demoFileId` (ma go dopiero `UpdateExerciseDto`), więc tworzenie z demo to `POST /v1/files/exercise-demo` → `POST /v1/exercises` → `PATCH /v1/exercises/{id}`. Kolejność: **wysyłka pierwsza**, bo to krok najbardziej podatny na odmowę (`413`), a jego porażka ma nie zostawić niczego — tak jak dziś rollback. Nowe okno: gdy padnie `POST` albo `PATCH` **po** udanej wysyłce, ćwiczenie może powstać bez demo (albo nie powstać wcale, a plik zostaje niepodpięty). `UploadCleanupQueue` nie ma zamiennika w FE — sprząta `orphan-files-sweep` w BE: pliki starsze niż **24 h**, na które nie wskazuje żadna z trzech tabel |
| **A9** | `confirm` wołamy, ale to **nie on** ratuje plik | `FilesService.confirm` sprawdza dziś wyłącznie istnienie i tenant — udokumentowany no-op, idempotentny. Plik przed zamiataczem ratuje `PATCH` (podpięcie), nie potwierdzenie. Wołamy je, bo kontrakt tak deklaruje drugą fazę i bo weryfikacja wraca do życia przy wysyłce prosto do magazynu. Kto tego nie wie, ten wyciągnie z kodu fałszywy wniosek — stąd ten wiersz |
| **A10** | Lokalna kontrola MIME znika, kontrole rozmiaru zostają | BE sprawdza typ **po zawartości** w locie (`detectContent`), co jest mocniejsze niż deklarowany `file.type`, a źródło stałych (`ALLOWED_VIDEO_MIME` w `app/lib/files.ts`) znika w kroku 4. Rozmiar i pusty plik sprawdzamy dalej w FE: plik jest już w pamięci po `request.formData()`, więc odrzucenie na miejscu oszczędza wysłanie kilkudziesięciu megabajtów po to, żeby usłyszeć `413` |

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/exercises.ts` (przepisanie) | moduł na kliencie: lista, pickery, licznik, szczegół, zapis, archiwizacja, `ExerciseError` |
| `app/lib/exercises.test.ts` (nowy) | testy modułu przeciw podstawionemu klientowi |
| `app/lib/file-uploads.ts` (zmiana) | `uploadExerciseDemo(api, file)` — ścieżka `exercise_demo` na kontrakcie, obok dotychczasowych funkcji bazodanowych |
| `app/lib/file-uploads.test.ts` (zmiana) | testy nowej ścieżki wysyłki |
| `app/routes/trener/biblioteka._index.tsx` (zmiana) | lista biblioteki jednym wywołaniem, `demoUrl` zamiast podpisywania |
| `app/routes/trener/_layout.tsx` (zmiana) | licznik aktywnych ćwiczeń z kontraktu |
| `app/routes/trener/plany.$planId.tsx` (zmiana) | picker edytora planu |
| `app/routes/trener/podopieczni._index.tsx` (zmiana) | picker formularza startowego |
| `app/routes/trener/biblioteka.nowe.tsx` (zmiana) | tworzenie ćwiczenia z demo |
| `app/routes/trener/biblioteka.$exerciseId.tsx` (zmiana) | szczegół, archiwizacja, zapis; znika import `db` |
| `app/lib/README.md` (zmiana) | wiersze `exercises.ts` i `file-uploads.ts` przestają być prawdziwe |
| `app/routes/trener/README.md` (zmiana) | opisy tras biblioteki, jeśli mówią o bazie |

**Kolejność zadań nie jest dowolna:** każde zadanie przenosi funkcję **razem z jej wywołaniami**,
żeby `npm run typecheck` był zielony po każdym z nich. Sygnatura zmieniona bez wywołań (albo
odwrotnie) zostawia drzewo, którego nie da się zbudować — a wtedy bramka po zadaniu niczego nie
dowodzi.

---

### Zadanie 1: Lista biblioteki — jedno żądanie zamiast dwóch

**Files:**
- Modify: `app/lib/exercises.ts` (dopisanie; stare funkcje zostają do Zadania 8)
- Modify: `app/routes/trener/biblioteka._index.tsx`
- Test: `app/lib/exercises.test.ts` (nowy)

**Interfaces:**
- Consumes: `Api` z `~/lib/api/client`, `exercisesControllerList` i typ `ExercisePage`
  z `@kalisthenos/api-client`.
- Produces:
  - `type ExerciseSort = "name_asc" | "name_desc" | "newest" | "oldest"` (bez zmian — słownik URL-a)
  - `interface ExerciseFilter { q?: string; tag?: string; unit?: "REPS" | "SEC" }` (bez zmian)
  - `listExercisesForTrainer(api: Api, opts: ExerciseFilter & { sort: ExerciseSort; page: number }): Promise<ExercisePage>`
    — zwraca **całą stronę** z kontraktu (`items`, `page`, `totalPages`, `total`), nie samą listę.

Dzisiejsza para `countExercisesForTrainer` + `listExercisesForTrainer` to dwa zapytania i własne
liczenie `safePage`. Kontrakt oddaje jedno i drugie w jednej odpowiedzi, a stronę spoza zakresu
przycina sam (`paginate` w `libs/shared/http`). `countExercisesForTrainer` **znika bez zamiennika** —
to nie jest przeoczenie, tylko skutek tego, że `total` przychodzi razem z listą.

- [ ] **Krok 1: Napisz failujące testy**

Plik `app/lib/exercises.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// `exercises.ts` importuje `file-uploads.ts`, a ten czyta `getEnv()` w `maxUploadBytesFor`.
// Bez mocka test wysadza się na braku zmiennych środowiskowych, zanim dojdzie do asercji.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({ MAX_UPLOAD_BYTES: 250_000_000, MAX_VIDEO_UPLOAD_BYTES: 30_000_000 }),
}));

import { createApiClient } from "./api/client";
import { listExercisesForTrainer } from "./exercises";

// `Promise<Response>` w sygnaturze jest konieczne: część przypadków niżej czyta
// ciało żądania (`await req.json()`), więc reguła bywa funkcją asynchroniczną.
function klient(reguly: (req: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CWICZENIE = {
  id: "e-1",
  name: "Podciąganie",
  unit: "REPS" as const,
  description: "",
  tags: ["plecy"],
  tracksRpe: true,
  archivedAt: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  demoUrl: null,
};

function strona(items: unknown[], page = 1, totalPages = 1, total = items.length) {
  return { items, page, totalPages, total };
}

describe("listExercisesForTrainer — lista biblioteki na kontrakcie", () => {
  it("sortowanie z URL-a tłumaczy się na słownik kontraktu", async () => {
    // Adresy list są zakładkowalne, więc `?sort=name_desc` musi przeżyć integrację.
    // Kontrakt nazywa to samo `-name` — tłumaczenie jest zadaniem modułu, nie trasy.
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([CWICZENIE]));
    });

    await listExercisesForTrainer(api, { sort: "name_desc", page: 2 });

    expect(zapytanie).toContain("sort=-name");
    expect(zapytanie).toContain("page=2");
    // Biblioteka pokazuje wyłącznie aktywne — zarchiwizowane są osiągalne
    // tylko adresem szczegółu. Bez tego parametru kontrakt oddałby domyślny zbiór.
    expect(zapytanie).toContain("status=active");
  });

  it("filtry nieustawione nie trafiają do zapytania", async () => {
    // Puste `q=` znaczy w kontrakcie co innego niż brak `q` — pierwsze jest
    // szukaniem pustego łańcucha, drugie brakiem filtra.
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([CWICZENIE]));
    });

    await listExercisesForTrainer(api, { sort: "name_asc", page: 1 });

    expect(zapytanie).not.toContain("q=");
    expect(zapytanie).not.toContain("tag=");
    expect(zapytanie).not.toContain("unit=");
  });

  it("wszystkie trzy filtry idą do kontraktu, gdy są ustawione", async () => {
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([CWICZENIE]));
    });

    await listExercisesForTrainer(api, {
      sort: "newest",
      page: 1,
      q: "pod",
      tag: "plecy",
      unit: "REPS",
    });

    expect(zapytanie).toContain("q=pod");
    expect(zapytanie).toContain("tag=plecy");
    expect(zapytanie).toContain("unit=REPS");
  });

  it("liczby stron przychodzą z kontraktu, moduł ich nie przelicza", async () => {
    // Do integracji `safePage` liczyła trasa z `total / PAGE_SIZE`. Teraz przycina
    // BE (`paginate`), a FE ma pokazać to, co dostał — dwa niezależne liczenia
    // rozjechałyby się przy pierwszej zmianie rozmiaru strony po tamtej stronie.
    const api = klient(() => json(200, strona([CWICZENIE], 3, 3, 60)));

    const wynik = await listExercisesForTrainer(api, { sort: "name_asc", page: 99 });

    expect(wynik.page).toBe(3);
    expect(wynik.totalPages).toBe(3);
    expect(wynik.total).toBe(60);
    expect(wynik.items).toEqual([CWICZENIE]);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: FAIL — `listExercisesForTrainer` ma dziś sygnaturę `(db, trainerId, opts)` i pierwszy
argument nie jest klientem.

- [ ] **Krok 3: Dopisz nową funkcję w `app/lib/exercises.ts`**

Na górze pliku, obok dotychczasowych importów Drizzle (te znikną w Zadaniu 8):

```ts
import { exercisesControllerList } from "@kalisthenos/api-client";
import type { ExercisePage } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
```

Zamień dotychczasowe `countExercisesForTrainer`, `listExercisesForTrainer` i prywatne
`exerciseConditions` na:

```ts
export type ExerciseSort = "name_asc" | "name_desc" | "newest" | "oldest";

export interface ExerciseFilter {
  q?: string;
  /** Nazwa kategorii. Nieznaną u tego trenera kontrakt ignoruje sam. */
  tag?: string;
  unit?: "REPS" | "SEC";
}

/**
 * Słownik FE→kontrakt. Wartości po lewej są w ZAKŁADKOWALNYCH adresach list
 * (`?sort=name_desc`), więc zostają; kontrakt nazywa to samo inaczej i to on
 * jest nadrzędny. Tłumaczy moduł — trasa nie zna nazw z kontraktu.
 */
const CONTRACT_SORT: Record<ExerciseSort, "name" | "-name" | "newest" | "oldest"> = {
  name_asc: "name",
  name_desc: "-name",
  newest: "newest",
  oldest: "oldest",
};

/**
 * Jedno żądanie zamiast dwóch: kontrakt oddaje `total` RAZEM z listą, więc
 * `countExercisesForTrainer` znika bez zamiennika. Stronę spoza zakresu przycina
 * BE (`paginate`) — dokładnie tak, jak robiła to `safePage` w trasie.
 *
 * `status: "active"` jest jawny: biblioteka pokazuje wyłącznie aktywne, a
 * zarchiwizowane są osiągalne wyłącznie adresem szczegółu (tam widnieją z odznaką).
 */
export async function listExercisesForTrainer(
  api: Api,
  opts: ExerciseFilter & { sort: ExerciseSort; page: number },
): Promise<ExercisePage> {
  const { data } = await exercisesControllerList({
    client: api,
    query: {
      page: opts.page,
      sort: CONTRACT_SORT[opts.sort],
      status: "active",
      // Rozłożone warunkowo, nie przez `q: opts.q`: klucz z wartością `undefined`
      // i BRAK klucza to dla serializatora zapytań dwie różne rzeczy, a puste
      // `q=` znaczy w kontrakcie „szukaj pustego łańcucha", nie „bez filtra".
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
      ...(opts.tag != null ? { tag: opts.tag } : {}),
      ...(opts.unit != null ? { unit: opts.unit } : {}),
    },
    throwOnError: true,
  });
  return data;
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij trasę `biblioteka._index.tsx`**

Usuń importy `db` (`~/lib/db/client`), `signFileUrl` (`~/lib/files`) oraz `countExercisesForTrainer`
z importu `~/lib/exercises`. Usuń stałą `const PAGE_SIZE = 24;` — rozmiar strony należy teraz do BE.

Zamień w loaderze fragment od `const total = await countExercisesForTrainer(...)` do `return`:

```ts
  // Nazwa po angielsku, jak reszta identyfikatorów w kodzie — polskie nazewnictwo
  // obowiązuje w testach i komentarzach, nie w kodzie produkcyjnym.
  const result = await listExercisesForTrainer(api, {
    ...filter,
    sort: controls.sort as ExerciseSort,
    page,
  });

  const items = result.items.map((e) => ({
    id: e.id,
    name: e.name,
    unit: e.unit,
    description: e.description,
    tags: e.tags,
    // Podpisany odnośnik przychodzi z kontraktu (ADR-0023) — FE go nie składa
    // i nie proxuje bajtów. Atrybutu `type` przy `<video>` nigdy tu nie było,
    // więc `mimeType` z wiersza pliku odpada bez straty.
    demoUrl: e.demoUrl,
  }));

  return {
    items,
    spec,
    controls,
    categories,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  };
```

W JSX (kafelek listy) zamień warunek na `demoUrl`:

```tsx
              <div className="video-tile" style={{ marginBottom: 12 }}>
                {ex.demoUrl != null ? (
                  <video
                    src={ex.demoUrl}
                    preload="metadata"
                    muted
                    playsInline
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                ) : (
```

`user` zostaje w destrukturyzacji `requireUser` tylko wtedy, gdy jest jeszcze używany w tym
pliku — po usunięciu `signFileUrl(…, user.id)` sprawdź to i zostaw `const { api } = …`, jeśli nie.

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/biblioteka._index.tsx
git commit -m "feat(cwiczenia): lista biblioteki na kontrakcie, stronicowanie po stronie BE"
```

---

### Zadanie 2: Licznik nawigacji

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/_layout.tsx`
- Test: `app/lib/exercises.test.ts`

**Interfaces:**
- Consumes: `exercisesControllerList` (jak w Zadaniu 1).
- Produces: `countActiveExercisesForTrainer(api: Api): Promise<number>`

- [ ] **Krok 1: Dopisz failujący test**

Do `app/lib/exercises.test.ts`, po imporcie dopisz `countActiveExercisesForTrainer`, a na końcu
pliku dopisz blok:

```ts
describe("countActiveExercisesForTrainer — licznik nawigacji", () => {
  it("bierze `total` z pierwszej strony aktywnych", async () => {
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([CWICZENIE], 1, 2, 42));
    });

    const wynik = await countActiveExercisesForTrainer(api);

    expect(wynik).toBe(42);
    expect(zapytanie).toContain("status=active");
    expect(zapytanie).toContain("page=1");
  });
});
```

- [ ] **Krok 2: Uruchom test i potwierdź, że failuje**

Run: `npx vitest run app/lib/exercises.test.ts -t "licznik nawigacji"`
Expected: FAIL — dzisiejsza funkcja bierze `(db, trainerId)`.

- [ ] **Krok 3: Zamień implementację w `app/lib/exercises.ts`**

```ts
/**
 * `GET /v1/trainer/nav` niesie `activeExercises` RAZEM z trzema pozostałymi
 * licznikami powłoki trenera — i to jest wywołanie na EKRAN, nie na licznik.
 * Gdyby każda z czterech funkcji wołała `nav`, jedna nawigacja robiłaby cztery
 * identyczne żądania. Do zwinięcia `_layout.tsx` w jedno `nav` wracamy w ostatnim
 * obszarze kroku 3, gdy migrują `trainees`, `plans` i `feature-requests`.
 *
 * Do tego czasu płacimy jedną stroną listy (24 pozycje) ściąganą po to, żeby
 * odczytać jedną liczbę. Kontrakt nie ma tańszego sposobu — `page` bez `items`
 * nie istnieje.
 */
export async function countActiveExercisesForTrainer(api: Api): Promise<number> {
  const { data } = await exercisesControllerList({
    client: api,
    query: { page: 1, status: "active" },
    throwOnError: true,
  });
  return data.total;
}
```

- [ ] **Krok 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij `_layout.tsx`**

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });

  const traineeCount = await countTraineesOfTrainer(db, user.id);
  const exerciseCount = await countActiveExercisesForTrainer(api);
  const planCount = await countPlansForTrainerByStatus(db, user.id, null);
  const newIdeas = await countNewForTrainer(db, user.id);
```

Reszta pliku bez zmian; `db` zostaje, bo trzy pozostałe liczniki są jeszcze na bazie.

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/_layout.tsx
git commit -m "feat(cwiczenia): licznik aktywnych cwiczen z kontraktu"
```

---

### Zadanie 3: Picker aktywnych ćwiczeń

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/plany.$planId.tsx`
- Modify: `app/routes/trener/podopieczni._index.tsx`
- Test: `app/lib/exercises.test.ts`

**Interfaces:**
- Produces: `listActiveExercisesForTrainer(api: Api): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>>`
  — kształt wyniku **bez zmian** wobec dzisiejszego, żeby dwa pickery i ich komponenty zostały nietknięte.

- [ ] **Krok 1: Dopisz failujące testy**

Do importu z `./exercises` w `app/lib/exercises.test.ts` dopisz `listActiveExercisesForTrainer`,
a na końcu pliku dopisz blok:

```ts
describe("listActiveExercisesForTrainer — picker", () => {
  it("skleja wszystkie strony i oddaje trzy pola", async () => {
    // Kontrakt nie ma „bez stronicowania", a picker potrzebuje pełnej listy:
    // urwanie jej na pierwszej stronie okroiłoby edytor planu po cichu.
    const strony: Record<string, unknown> = {
      "1": strona([{ ...CWICZENIE, id: "e-1" }], 1, 3, 3),
      "2": strona([{ ...CWICZENIE, id: "e-2" }], 2, 3, 3),
      "3": strona([{ ...CWICZENIE, id: "e-3" }], 3, 3, 3),
    };
    const zadania: string[] = [];
    const api = klient((req) => {
      const nr = new URL(req.url).searchParams.get("page") ?? "1";
      zadania.push(nr);
      return json(200, strony[nr]);
    });

    const wynik = await listActiveExercisesForTrainer(api);

    expect(zadania).toEqual(["1", "2", "3"]);
    expect(wynik).toEqual([
      { id: "e-1", name: "Podciąganie", unit: "REPS" },
      { id: "e-2", name: "Podciąganie", unit: "REPS" },
      { id: "e-3", name: "Podciąganie", unit: "REPS" },
    ]);
  });

  it("jedna strona to jedno żądanie", async () => {
    let wywolan = 0;
    const api = klient(() => {
      wywolan += 1;
      return json(200, strona([CWICZENIE], 1, 1, 1));
    });

    await listActiveExercisesForTrainer(api);

    expect(wywolan).toBe(1);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/exercises.test.ts -t "picker"`
Expected: FAIL.

- [ ] **Krok 3: Zamień implementację w `app/lib/exercises.ts`**

```ts
/**
 * Aktywne ćwiczenia trenera do pickerów (edytor planu, formularz startowy).
 * Celowo BEZ filtra wariantów umiejętności — to robi `listAssignableExercises`
 * w `skills.ts` i jest to inna lista.
 *
 * Kontrakt stronicuje po 24 i nie ma parametru „wszystko", więc moduł skleja
 * strony sam, sekwencyjnie (`totalPages` z pierwszej odpowiedzi jest granicą,
 * więc pętla nie może się rozbiec). Wstawienie ćwiczenia MIĘDZY żądaniami może
 * przesunąć jedną pozycję — picker jest listą doradczą, a jedyną alternatywą
 * byłby dodatek do kontraktu.
 */
export async function listActiveExercisesForTrainer(
  api: Api,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  const first = await activeExercisePage(api, 1);
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await activeExercisePage(api, page);
    items.push(...next.items);
  }
  return items.map((e) => ({ id: e.id, name: e.name, unit: e.unit }));
}

async function activeExercisePage(api: Api, page: number): Promise<ExercisePage> {
  const { data } = await exercisesControllerList({
    client: api,
    query: { page, sort: "name", status: "active" },
    throwOnError: true,
  });
  return data;
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij oba pickery**

W `app/routes/trener/plany.$planId.tsx`, loader (linia ~50 i ~80):

```ts
  const { api, user } = requireUser(args.context, { role: "trainer" });
```
```ts
  const exercises = await listActiveExercisesForTrainer(api);
```

W `app/routes/trener/podopieczni._index.tsx`, loader (linia ~70 i ~93) — tak samo.
`db` zostaje w obu plikach: reszta ich modułów jest jeszcze na bazie.

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/plany.\$planId.tsx app/routes/trener/podopieczni._index.tsx
git commit -m "feat(cwiczenia): picker aktywnych cwiczen na kontrakcie"
```

---

### Zadanie 4: `uploadExerciseDemo` — wysyłka demo przez kontrakt

**Files:**
- Modify: `app/lib/file-uploads.ts`
- Test: `app/lib/file-uploads.test.ts`

**Interfaces:**
- Consumes: `Api` z `~/lib/api/client`, `ApiError` z `~/lib/api/errors`,
  `filesControllerExerciseDemo` i `filesControllerConfirm` z `@kalisthenos/api-client`,
  istniejące `UploadError` i `maxUploadBytesFor` z tego samego pliku.
- Produces: `uploadExerciseDemo(api: Api, file: File): Promise<string>` — zwraca `fileId`
  gotowy do podpięcia przez `PATCH /v1/exercises/{id}`.

To zadanie **nie ma jeszcze wywołań** — dokłada funkcję, której użyją Zadania 5 i 7. Dzięki temu
jest w całości testowalne osobno i nie rusza żadnej trasy.

- [ ] **Krok 1: Dopisz failujące testy**

Trzy importy poniżej dopisz do **bloku importów na górze** `app/lib/file-uploads.test.ts`
(`uploadExerciseDemo` dołóż do istniejącego importu z `./file-uploads` — biome pilnuje
porządku importów, więc drugi import z tego samego modułu na końcu pliku zapali lint).
Resztę bloku dopisz **na końcu pliku**. Mocki `~/lib/env`, `~/lib/storage`, `file-type`
i `~/lib/logger` są już na górze — nie dubluj ich:

```ts
import { createApiClient } from "./api/client";
import { ApiError } from "./api/errors";
import { uploadExerciseDemo } from "./file-uploads";

function klientPlikow(reguly: (req: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function wideo(bajtow: number): File {
  return new File([new Uint8Array(bajtow)], "demo.mp4", { type: "video/mp4" });
}

describe("uploadExerciseDemo — wysyłka demo przez kontrakt", () => {
  it("pusty plik odrzuca bez wywołania sieci", async () => {
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    await expect(uploadExerciseDemo(api, wideo(0))).rejects.toBeInstanceOf(UploadError);
    expect(wywolan).toBe(0);
  });

  it("plik ponad limit odrzuca bez wywołania sieci", async () => {
    // Plik jest już w pamięci po `request.formData()`, więc sprawdzenie tutaj
    // oszczędza wysłanie kilkudziesięciu megabajtów po to, żeby usłyszeć `413`.
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    const blad = await uploadExerciseDemo(api, wideo(30_000_001)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toContain("Plik za duży");
    expect(wywolan).toBe(0);
  });

  it("wysyła multipartem i potwierdza plik", async () => {
    // Druga faza (`confirm`) jest dziś po stronie BE udokumentowanym no-opem —
    // wołamy ją, bo kontrakt tak deklaruje protokół, a weryfikacja wraca do życia
    // przy wysyłce prosto do magazynu. Pliku przed zamiataczem sierot broni
    // podpięcie (`PATCH`), nie to wywołanie.
    const trafienia: string[] = [];
    let typZawartosci = "";
    const api = klientPlikow((req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/exercise-demo") {
        typZawartosci = req.headers.get("content-type") ?? "";
        return new Response(JSON.stringify({ id: "f-1", bytes: 10, mimeType: "video/mp4" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });

    const wynik = await uploadExerciseDemo(api, wideo(10));

    expect(wynik).toBe("f-1");
    expect(trafienia).toEqual([
      "POST /v1/files/exercise-demo",
      "POST /v1/files/f-1/confirm",
    ]);
    expect(typZawartosci).toContain("multipart/form-data");
  });

  it("413 z kontraktu wraca jako UploadError z komunikatem BE", async () => {
    const api = klientPlikow(() =>
      new Response(
        JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Plik jest za duży." } }),
        { status: 413, headers: { "content-type": "application/json" } },
      ),
    );

    const blad = await uploadExerciseDemo(api, wideo(10)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toBe("Plik jest za duży.");
  });

  it("awaria BE NIE zamienia się w UploadError", async () => {
    // Ta sama wąskość co przy `CategoryError`: gdyby moduł łykał każdy błąd,
    // awaria serwera pokazałaby się w formularzu jako problem z plikiem —
    // komunikat kierujący użytkownika na fałszywy trop i ukrywający usterkę.
    const api = klientPlikow(() =>
      new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Ups." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const blad = await uploadExerciseDemo(api, wideo(10)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(UploadError);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/file-uploads.test.ts -t "wysyłka demo"`
Expected: FAIL — `uploadExerciseDemo` nie istnieje.

- [ ] **Krok 3: Dopisz implementację w `app/lib/file-uploads.ts`**

Do importów:

```ts
import { filesControllerConfirm, filesControllerExerciseDemo } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
```

Na końcu pliku:

```ts
/**
 * Ścieżka `exercise_demo` **na kontrakcie**: dwie fazy z §8 kroku 4 specu —
 * `POST /v1/files/exercise-demo` (bajty idą przez serwer BE) i `POST /v1/files/{id}/confirm`.
 * Pozostałe dwa rodzaje (`set_video`, `body_photo`) zostają na bazie do kroku 4.
 *
 * **Czego tu NIE MA i dlaczego:**
 * - kontroli deklarowanego MIME — BE sprawdza typ PO ZAWARTOŚCI w locie, co jest
 *   mocniejsze niż `file.type` od klienta, a źródło stałych (`app/lib/files.ts`)
 *   znika w kroku 4;
 * - `UploadCleanupQueue` — sprzątanie po nieudanym zapisie przejął BE
 *   (`orphan-files-sweep`, 24 h karencji dla pliku, na który nic nie wskazuje).
 *
 * `confirm` niczego dziś nie zapisuje (`FilesService.confirm` sprawdza istnienie
 * i tenant) — plik przed zamiataczem ratuje dopiero PODPIĘCIE do ćwiczenia.
 */
export async function uploadExerciseDemo(api: Api, file: File): Promise<string> {
  if (file.size === 0) {
    throw new UploadError("empty file", "Plik jest pusty.");
  }
  const maxBytes = maxUploadBytesFor("exercise_demo");
  if (file.size > maxBytes) {
    throw new UploadError(
      `file too large: ${file.size} > ${maxBytes}`,
      `Plik za duży (limit: ${Math.floor(maxBytes / 1_000_000)} MB).`,
    );
  }

  let fileId: string;
  try {
    const { data } = await filesControllerExerciseDemo({
      client: api,
      body: { file },
      throwOnError: true,
    });
    fileId = data.id;
  } catch (e) {
    // Wąsko: trzy statusy, dla których BE ma komunikat o SAMYM PLIKU i dla których
    // trasa pokazuje tekst w formularzu. `401`/`403`/`404` to sprawa sesji i tenanta —
    // te lecą dalej i obsługuje je warstwa klienta.
    if (e instanceof ApiError && (e.status === 400 || e.status === 409 || e.status === 413)) {
      throw new UploadError(`upload rejected: ${e.code}`, e.message);
    }
    throw e;
  }

  await filesControllerConfirm({ client: api, path: { id: fileId }, throwOnError: true });
  return fileId;
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/file-uploads.test.ts`
Expected: PASS (razem z dotychczasowymi testami `uploadFile`, które zostają nietknięte).

- [ ] **Krok 5: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/file-uploads.ts app/lib/file-uploads.test.ts
git commit -m "feat(pliki): wysylka demo cwiczenia przez kontrakt, dwie fazy"
```

---

### Zadanie 5: Tworzenie ćwiczenia

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/biblioteka.nowe.tsx`
- Test: `app/lib/exercises.test.ts`

**Interfaces:**
- Consumes: `uploadExerciseDemo` z `~/lib/file-uploads` (Zadanie 4), `exercisesControllerCreate`
  i `exercisesControllerUpdate` z `@kalisthenos/api-client`.
- Produces:
  - `createExercise(api: Api, input: { name: string; unit: "REPS" | "SEC"; description: string; tags: string[]; tracksRpe: boolean; demo: File | null }): Promise<void>`
  - prywatne `patchExercise(api, exerciseId, body)` — **jedyne** miejsce, w którym `demoFileId`
    trafia do kontraktu; używa go też Zadanie 7.

- [ ] **Krok 1: Dopisz failujące testy**

```ts
describe("createExercise — tworzenie na kontrakcie", () => {
  it("bez demo to jedno żądanie", async () => {
    const trafienia: string[] = [];
    let cialo: unknown = null;
    const api = klient(async (req) => {
      trafienia.push(`${req.method} ${new URL(req.url).pathname}`);
      cialo = await req.json();
      return json(201, CWICZENIE);
    });

    await createExercise(api, {
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: ["plecy"],
      tracksRpe: true,
      demo: null,
    });

    expect(trafienia).toEqual(["POST /v1/exercises"]);
    expect(cialo).toEqual({
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: ["plecy"],
      tracksRpe: true,
    });
  });

  it("z demo: najpierw wysyłka, potem utworzenie, na końcu podpięcie", async () => {
    // Kolejność jest decyzją, nie stylem (A8): wysyłka jest krokiem najbardziej
    // podatnym na odmowę, a jej porażka ma nie zostawić ćwiczenia — tak jak dziś
    // rollback transakcji. `CreateExerciseDto` nie przyjmuje `demoFileId`, więc
    // podpięcie musi być osobnym `PATCH`-em.
    const trafienia: string[] = [];
    const api = klient(async (req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/exercise-demo") {
        return json(201, { id: "f-1", bytes: 10, mimeType: "video/mp4" });
      }
      if (sciezka === "/v1/files/f-1/confirm") return new Response(null, { status: 204 });
      return json(201, { ...CWICZENIE, id: "e-9" });
    });

    await createExercise(api, {
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: [],
      tracksRpe: true,
      demo: new File([new Uint8Array(10)], "demo.mp4", { type: "video/mp4" }),
    });

    expect(trafienia).toEqual([
      "POST /v1/files/exercise-demo",
      "POST /v1/files/f-1/confirm",
      "POST /v1/exercises",
      "PATCH /v1/exercises/e-9",
    ]);
  });

  it("odmowa podpięcia demo wraca jako UploadError", async () => {
    // Dla użytkownika to problem z plikiem, a trasa ma dla niego miejsce
    // w formularzu — inaczej `409` z podpięcia wywaliłby granicę błędu.
    const api = klient((req) => {
      const sciezka = new URL(req.url).pathname;
      if (sciezka === "/v1/files/exercise-demo") {
        return json(201, { id: "f-1", bytes: 10, mimeType: "video/mp4" });
      }
      if (sciezka === "/v1/files/f-1/confirm") return new Response(null, { status: 204 });
      if (req.method === "POST") return json(201, { ...CWICZENIE, id: "e-9" });
      return json(409, {
        error: {
          code: "EXERCISE_DEMO_FILE_UNAVAILABLE",
          message: "Ten plik nie jest już dostępny do podpięcia jako demo.",
        },
      });
    });

    const blad = await createExercise(api, {
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: [],
      tracksRpe: true,
      demo: new File([new Uint8Array(10)], "demo.mp4", { type: "video/mp4" }),
    }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toBe(
      "Ten plik nie jest już dostępny do podpięcia jako demo.",
    );
  });
});
```

Dopisz do importów testu: `createExercise` z `./exercises` oraz `UploadError` z `./file-uploads`.

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/exercises.test.ts -t "tworzenie na kontrakcie"`
Expected: FAIL.

- [ ] **Krok 3: Zamień `createExerciseWithDemo` na `createExercise`**

Do importów `app/lib/exercises.ts`:

```ts
import { exercisesControllerCreate, exercisesControllerUpdate } from "@kalisthenos/api-client";
import type { UpdateExerciseDto } from "@kalisthenos/api-client";
import { ApiError } from "~/lib/api/errors";
import { UploadError, uploadExerciseDemo } from "~/lib/file-uploads";
```

```ts
/**
 * Tworzy ćwiczenie razem z opcjonalnym demo. Do integracji była to JEDNA
 * transakcja; teraz to sekwencja żądań, bo `CreateExerciseDto` nie przyjmuje
 * `demoFileId` — podpięcie jest osobnym `PATCH`-em.
 *
 * **Kolejność jest decyzją:** wysyłka idzie PIERWSZA, bo to krok najbardziej
 * podatny na odmowę (`413`), a jego porażka ma nie zostawić po sobie ćwiczenia —
 * tak jak dziś rollback. Cena nowego układu: gdy padnie `POST` albo `PATCH` PO
 * udanej wysyłce, plik zostaje niepodpięty (sprzątnie go `orphan-files-sweep`
 * w BE po 24 h), a ćwiczenie może istnieć bez demo. Trener widzi wtedy błąd
 * i uzupełnia demo edycją — to jedyne miejsce w tym obszarze, gdzie zachowanie
 * różni się od stanu sprzed integracji.
 */
export async function createExercise(
  api: Api,
  input: {
    name: string;
    unit: "REPS" | "SEC";
    /** Kolumna po tamtej stronie jest NOT NULL DEFAULT '' — brak opisu to pusty string. */
    description: string;
    tags: string[];
    tracksRpe: boolean;
    demo: File | null;
  },
): Promise<void> {
  const demoFileId = input.demo != null ? await uploadExerciseDemo(api, input.demo) : null;

  const { data: created } = await exercisesControllerCreate({
    client: api,
    body: {
      name: input.name,
      unit: input.unit,
      description: input.description,
      tags: input.tags,
      tracksRpe: input.tracksRpe,
    },
    throwOnError: true,
  });

  if (demoFileId != null) {
    await patchExercise(api, created.id, { demoFileId });
  }
}

/**
 * Jedyne miejsce, w którym `demoFileId` trafia do kontraktu — razem z jedynym
 * mapowaniem odmowy podpięcia. Odmowa jest dla użytkownika problemem z PLIKIEM,
 * a nie z ćwiczeniem, więc niesie ją `UploadError`: trasa ma dla niego miejsce
 * w formularzu, a `ApiError` poszedłby na granicę błędu, czyli na inny ekran.
 */
async function patchExercise(
  api: Api,
  exerciseId: string,
  body: UpdateExerciseDto,
): Promise<void> {
  try {
    await exercisesControllerUpdate({
      client: api,
      path: { id: exerciseId },
      body,
      throwOnError: true,
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === "EXERCISE_DEMO_FILE_UNAVAILABLE") {
      throw new UploadError(`demo not attachable: ${body.demoFileId}`, e.message);
    }
    throw e;
  }
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij trasę `biblioteka.nowe.tsx`**

Usuń import `db` (`~/lib/db/client`) i zamień wywołanie w akcji:

```ts
  try {
    await createExercise(api, {
      name: parsed.data.name,
      unit: parsed.data.unit,
      description: parsed.data.description,
      tags,
      tracksRpe: parsed.data.tracksRpe,
      demo,
    });
  } catch (e) {
    if (e instanceof UploadError) return { error: e.userMessage };
    throw e;
  }
  throw redirect("/trener/biblioteka");
```

Import zmienia się z `createExerciseWithDemo` na `createExercise`. `user` przestaje być używany
w akcji — zostaw `const { api } = requireUser(args.context, { role: "trainer" });`, jeśli lint
zgłosi nieużywaną zmienną.

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/biblioteka.nowe.tsx
git commit -m "feat(cwiczenia): tworzenie cwiczenia z demo przez kontrakt"
```

---

### Zadanie 6: Szczegół i archiwizacja

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx` (loader + intencje `archive`/`unarchive`)
- Test: `app/lib/exercises.test.ts`

**Interfaces:**
- Consumes: `orNull` z `~/lib/api/client`, `exercisesControllerGet`, `exercisesControllerArchive`,
  `exercisesControllerRestore` z `@kalisthenos/api-client`.
- Produces:
  - `getExerciseDetail(api: Api, exerciseId: string): Promise<ExerciseDetail | null>` — nazwa
    zmieniona świadomie: to nie jest już „wiersz z LEFT JOIN-em", tylko szczegół z kontraktu,
    niosący `demoUrl`. Zastępuje **obie** dzisiejsze funkcje (`getExerciseWithDemoForTrainer`
    i `getExerciseForTrainer`).
  - `class ExerciseError extends Error` z `readonly userMessage: string`
  - `setExerciseArchived(api: Api, exerciseId: string, archived: boolean): Promise<void>`

- [ ] **Krok 1: Dopisz failujące testy**

```ts
describe("getExerciseDetail — szczegół z kontraktu", () => {
  it("404 mapuje się na null, bo sygnatura deklaruje `| null`", async () => {
    // Reguła D3 warstwy klienta: rozstrzyga sygnatura, nie ocena piszącego.
    // Cudze ćwiczenie jest w BE nieodróżnialne od nieistniejącego — oba dają 404,
    // oba mają dać ten sam ekran co dziś.
    const api = klient(() =>
      json(404, { error: { code: "NOT_FOUND", message: "Nie znaleziono." } }),
    );

    await expect(getExerciseDetail(api, "e-1")).resolves.toBeNull();
  });

  it("oddaje szczegół razem z podpisanym odnośnikiem demo", async () => {
    const api = klient(() =>
      json(200, { ...CWICZENIE, demoUrl: "http://be.test/v1/files/f-1?sig=abc" }),
    );

    const wynik = await getExerciseDetail(api, "e-1");

    expect(wynik?.demoUrl).toBe("http://be.test/v1/files/f-1?sig=abc");
  });
});

describe("setExerciseArchived — archiwizacja i przywrócenie", () => {
  it("archiwizacja i przywrócenie to dwie różne trasy", async () => {
    const trafienia: string[] = [];
    const api = klient((req) => {
      trafienia.push(`${req.method} ${new URL(req.url).pathname}`);
      return json(200, CWICZENIE);
    });

    await setExerciseArchived(api, "e-1", true);
    await setExerciseArchived(api, "e-1", false);

    expect(trafienia).toEqual([
      "POST /v1/exercises/e-1/archive",
      "POST /v1/exercises/e-1/restore",
    ]);
  });

  it("wariant aktywnej umiejętności wraca jako ExerciseError z komunikatem BE", async () => {
    // Bramkę trzymał do integracji FE (`findSkillForExercise` przed archiwizacją);
    // teraz trzyma ją BE i to on ma treść komunikatu. Trasa pokazuje `userMessage`
    // w formularzu — `ApiError` dałby granicę błędu, czyli inny ekran.
    const api = klient(() =>
      json(409, {
        error: {
          code: "EXERCISE_IS_SKILL_VARIATION",
          message:
            "Ćwiczenie jest wariantem aktywnej umiejętności — najpierw odepnij je od umiejętności.",
          details: { skillId: "s-1", skillName: "Muscle-up" },
        },
      }),
    );

    const blad = await setExerciseArchived(api, "e-1", true).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ExerciseError);
    expect((blad as ExerciseError).userMessage).toBe(
      "Ćwiczenie jest wariantem aktywnej umiejętności — najpierw odepnij je od umiejętności.",
    );
  });

  it("inny 409 leci dalej jako ApiError", async () => {
    // Wąsko po KODZIE, nie po statusie: `409` na tym zasobie może kiedyś znaczyć
    // coś innego, a wtedy komunikat o wariancie umiejętności byłby kłamstwem.
    const api = klient(() =>
      json(409, { error: { code: "SOMETHING_ELSE", message: "Konflikt." } }),
    );

    const blad = await setExerciseArchived(api, "e-1", true).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(ExerciseError);
  });
});
```

Dopisz do importów testu: `ExerciseError`, `getExerciseDetail`, `setExerciseArchived` z `./exercises`
oraz `ApiError` z `./api/errors`.

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/exercises.test.ts -t "szczegół"`
Expected: FAIL.

- [ ] **Krok 3: Zamień implementacje w `app/lib/exercises.ts`**

Do importów dopisz `exercisesControllerArchive`, `exercisesControllerGet`,
`exercisesControllerRestore`, typ `ExerciseDetail` oraz `orNull` z `~/lib/api/client`.
Usuń `getExerciseWithDemoForTrainer`, `interface ExerciseWithDemo` i dotychczasowe
`setExerciseArchived`. **`getExerciseForTrainer` (wersja na `Db`) ZOSTAJE do Zadania 7** — gałąź
zapisu wciąż potrzebuje z niej `currentDemoFileId` (Krok 5 niżej). W miejsce usuniętych:

```ts
/**
 * Szczegół ćwiczenia do widoku edycji. Zastępuje OBIE dotychczasowe funkcje:
 * `getExerciseWithDemoForTrainer` (LEFT JOIN z plikiem) i `getExerciseForTrainer`
 * (sam wiersz do sprawdzenia własności) — kontrakt oddaje jedno i drugie jedną
 * trasą, a `demoUrl` jest już PODPISANY (ADR-0023), więc FE niczego nie składa.
 *
 * `| null` w sygnaturze jest tym, co włącza mapowanie `404` (`orNull`): cudze
 * ćwiczenie jest po tamtej stronie nieodróżnialne od nieistniejącego i oba mają
 * dać ten sam ekran co dziś.
 */
export async function getExerciseDetail(
  api: Api,
  exerciseId: string,
): Promise<ExerciseDetail | null> {
  return await orNull(
    exercisesControllerGet({ client: api, path: { id: exerciseId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}

/**
 * Własny typ błędu obszaru — powstaje wyłącznie dla tych odmów, dla których
 * trasa ma komunikat w formularzu (precedens: `CategoryError`, `AuthError`).
 */
export class ExerciseError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Archiwizacja / przywrócenie. Bramka „ćwiczenie jest wariantem aktywnej
 * umiejętności" przeszła do BE — z trasy znika `findSkillForExercise`, a razem
 * z nim ostatnia zależność tego obszaru od `skills.ts`.
 *
 * Komunikat bierzemy z kontraktu DOSŁOWNIE. Jest krótszy od dotychczasowego:
 * nie nazywa umiejętności, choć `details.skillName` przychodzi w odpowiedzi.
 * To świadoma strata — treść komunikatów należy teraz do BE (spec: „ustalenia
 * po stronie BE są nadrzędne"), a wzbogacenie zdania jest zmianą TAM, nie tutaj.
 */
export async function setExerciseArchived(
  api: Api,
  exerciseId: string,
  archived: boolean,
): Promise<void> {
  try {
    if (archived) {
      await exercisesControllerArchive({
        client: api,
        path: { id: exerciseId },
        throwOnError: true,
      });
    } else {
      await exercisesControllerRestore({
        client: api,
        path: { id: exerciseId },
        throwOnError: true,
      });
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === "EXERCISE_IS_SKILL_VARIATION") {
      throw new ExerciseError("archiving an active skill variation", e.message);
    }
    throw e;
  }
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij loader i obie intencje archiwizacji w `biblioteka.$exerciseId.tsx`**

Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";

  const exercise = await getExerciseDetail(api, exerciseId);
  if (exercise == null) {
    throw new Response("not found", { status: 404 });
  }

  const categories = await listCategoriesForTrainer(api);

  return {
    exercise,
    categories,
    // Ten sam limit co na serwerze — patrz komentarz w biblioteka.nowe.tsx.
    maxVideoBytes: maxUploadBytesFor("exercise_demo"),
  };
}
```

W akcji usuń pre-odczyt (`const existing = await getExerciseForTrainer(db, …)` razem z rzuceniem
`404`) i cały import `findSkillForExercise` z `~/lib/skills`. Obie intencje:

```ts
  if (intent === "archive") {
    try {
      await setExerciseArchived(api, exerciseId, true);
    } catch (e) {
      if (e instanceof ExerciseError) return { error: e.userMessage };
      if (e instanceof ApiError) throw toRouteResponse(e);
      throw e;
    }
    throw redirect("/trener/biblioteka");
  }

  if (intent === "unarchive") {
    try {
      await setExerciseArchived(api, exerciseId, false);
    } catch (e) {
      if (e instanceof ApiError) throw toRouteResponse(e);
      throw e;
    }
    throw redirect(`/trener/biblioteka/${exerciseId}`);
  }
```

`throw redirect(...)` stoi **poza** blokiem `try` świadomie: `redirect` zwraca `Response`, więc
rzucony w środku wpadłby we własny `catch`. `toRouteResponse` zamienia `404` z kontraktu na
`Response 404` — to samo, co robił tu wcześniej pre-odczyt. **To jego pierwsze użycie w trasie**;
importuj z `~/lib/api/errors` razem z `ApiError`.

W komponencie zamień blok `{demo && …}` na `demoUrl` ze szczegółu:

```tsx
      {exercise.demoUrl != null && (
        <div style={{ marginBottom: 18 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Aktualne demo
          </div>
          <video
            src={exercise.demoUrl}
            controls
            preload="metadata"
            playsInline
            style={{
              width: "100%",
              maxWidth: 480,
              borderRadius: 8,
              background: "var(--surface-2)",
              display: "block",
            }}
          />
        </div>
      )}
```

i usuń `demo` z destrukturyzacji `useLoaderData`.

Zapis (gałąź domyślna akcji) zostaje na razie na `updateExerciseWithDemo(db, …)` — idzie
Zadaniem 7. Zostaw więc chwilowo import `db`, `user` w destrukturyzacji akcji i **przenieś**
pre-odczyt na początek gałęzi zapisu, razem z jego dotychczasowym `404`:

```ts
  // Znika w Zadaniu 7 — zapis potrzebuje jeszcze `currentDemoFileId`.
  const existing = await getExerciseForTrainer(db, user.id, exerciseId);
  if (existing == null) {
    throw new Response("not found", { status: 404 });
  }
```

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/biblioteka.\$exerciseId.tsx
git commit -m "feat(cwiczenia): szczegol i archiwizacja na kontrakcie, bramka wariantu w BE"
```

---

### Zadanie 7: Zapis edycji — koniec bazy w trasach biblioteki

**Files:**
- Modify: `app/lib/exercises.ts`
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx` (gałąź zapisu)
- Test: `app/lib/exercises.test.ts`

**Interfaces:**
- Consumes: `patchExercise` (prywatne, Zadanie 5), `uploadExerciseDemo` (Zadanie 4).
- Produces: `updateExercise(api: Api, input: { exerciseId: string; name: string; unit: "REPS" | "SEC"; description: string; tags: string[]; tracksRpe: boolean; demo: File | null }): Promise<void>`
  — **bez** `currentDemoFileId`: podmianą i skasowaniem starego pliku zarządza teraz BE.

- [ ] **Krok 1: Dopisz failujące testy**

Do importu z `./exercises` w `app/lib/exercises.test.ts` dopisz `updateExercise`, a na końcu
pliku dopisz blok:

```ts
describe("updateExercise — zapis edycji na kontrakcie", () => {
  it("brak nowego pliku NIE odpina istniejącego demo", async () => {
    // To jest pułapka tego obszaru i jedyna, przy której typy milczą:
    // `demoFileId: null` w kontrakcie ODPINA demo. „Zostaw dotychczasowe"
    // musi znaczyć BRAK KLUCZA w ciele, nie `null`.
    let cialo: Record<string, unknown> = {};
    const api = klient(async (req) => {
      cialo = (await req.json()) as Record<string, unknown>;
      return json(200, CWICZENIE);
    });

    await updateExercise(api, {
      exerciseId: "e-1",
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: [],
      tracksRpe: true,
      demo: null,
    });

    expect("demoFileId" in cialo).toBe(false);
  });

  it("nowy plik idzie jednym PATCH-em po wysyłce", async () => {
    const trafienia: string[] = [];
    let cialo: Record<string, unknown> = {};
    const api = klient(async (req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/exercise-demo") {
        return json(201, { id: "f-2", bytes: 10, mimeType: "video/mp4" });
      }
      if (sciezka === "/v1/files/f-2/confirm") return new Response(null, { status: 204 });
      cialo = (await req.json()) as Record<string, unknown>;
      return json(200, CWICZENIE);
    });

    await updateExercise(api, {
      exerciseId: "e-1",
      name: "Podciąganie",
      unit: "REPS",
      description: "",
      tags: [],
      tracksRpe: true,
      demo: new File([new Uint8Array(10)], "demo.mp4", { type: "video/mp4" }),
    });

    expect(trafienia).toEqual([
      "POST /v1/files/exercise-demo",
      "POST /v1/files/f-2/confirm",
      "PATCH /v1/exercises/e-1",
    ]);
    expect(cialo.demoFileId).toBe("f-2");
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/exercises.test.ts -t "zapis edycji"`
Expected: FAIL.

- [ ] **Krok 3: Zamień `updateExerciseWithDemo` na `updateExercise`**

```ts
/**
 * Zapis edycji z opcjonalną PODMIANĄ demo — jednym `PATCH`-em, bo `UpdateExerciseDto`
 * przyjmuje `demoFileId` razem z polami.
 *
 * **`currentDemoFileId` znika z sygnatury.** Do integracji wywołujący podawał je
 * z wiersza wczytanego przy sprawdzeniu własności, a moduł kasował wiersz starego
 * pliku w transakcji i blob po commicie. Całą tę ostrożność — łącznie z kolejnością
 * „najpierw dane, potem zawartość" — trzyma teraz BE (`ExercisesService.update`
 * oddaje `staleStoragePath` i kasuje po zatwierdzeniu).
 *
 * **`demo === null` znaczy „zostaw dotychczasowe", nie „odepnij".** W kontrakcie
 * odpina `demoFileId: null`, więc przy braku nowego pliku klucza w ciele nie ma
 * w ogóle. Rozłożenie warunkowe niżej jest jedynym miejscem, w którym ta różnica
 * jest widoczna — typy jej nie pilnują.
 */
export async function updateExercise(
  api: Api,
  input: {
    exerciseId: string;
    name: string;
    unit: "REPS" | "SEC";
    description: string;
    tags: string[];
    tracksRpe: boolean;
    /** `null` = zostaw dotychczasowe demo bez zmian. */
    demo: File | null;
  },
): Promise<void> {
  const demoFileId = input.demo != null ? await uploadExerciseDemo(api, input.demo) : undefined;

  await patchExercise(api, input.exerciseId, {
    name: input.name,
    unit: input.unit,
    description: input.description,
    tags: input.tags,
    tracksRpe: input.tracksRpe,
    ...(demoFileId !== undefined ? { demoFileId } : {}),
  });
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/exercises.test.ts`
Expected: PASS.

- [ ] **Krok 5: Przepnij gałąź zapisu w `biblioteka.$exerciseId.tsx`**

```ts
  try {
    await updateExercise(api, {
      exerciseId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      description: parsed.data.description,
      tags,
      tracksRpe: parsed.data.tracksRpe,
      demo,
    });
  } catch (e) {
    if (e instanceof UploadError) return { error: e.userMessage };
    if (e instanceof ApiError) throw toRouteResponse(e);
    throw e;
  }
  throw redirect("/trener/biblioteka");
```

Usuń z trasy: import `db` (`~/lib/db/client`), import `getExerciseForTrainer`, pre-odczyt
przeniesiony tam w Zadaniu 6 oraz import `signFileUrl` (`~/lib/files`), jeśli jeszcze został.

Usuń też **z modułu** `app/lib/exercises.ts` samą funkcję `getExerciseForTrainer` (wersję na `Db`,
zostawioną tam Zadaniem 6) — po tym kroku nie ma już wywołań.

Po tym kroku **żadna z trzech tras biblioteki nie importuje bazy**.

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/exercises.test.ts --no-file-parallelism
```

```bash
git add app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/biblioteka.\$exerciseId.tsx
git commit -m "refactor(cwiczenia): zapis edycji przez kontrakt, trasy biblioteki bez bazy"
```

---

### Zadanie 8: Sprzątanie, dokumentacja i domknięcie obszaru

**Files:**
- Modify: `app/lib/exercises.ts` (usunięcie martwego kodu)
- Modify: `app/lib/README.md`
- Modify: `app/routes/trener/README.md`

- [ ] **Krok 1: Usuń martwy kod z `app/lib/exercises.ts`**

Do usunięcia — sprawdzone `grep`-em przed pisaniem planu, nie z domysłu:

- wszystkie importy Drizzle (`and`, `arrayContains`, `asc`, `count`, `desc`, `eq`, `ilike`,
  `isNull`), `type Db`, `* as schema`, oraz import z `~/lib/file-uploads` obejmujący
  `deleteFileBlob`, `deleteFileRow`, `UploadCleanupQueue`, `uploadFile` (z tego pliku zostaje
  wyłącznie `UploadError` i `uploadExerciseDemo`);
- **`normalizeTags`** — funkcja nie ma dziś ani jednego wywołania poza tym plikiem
  (jedyne, co filtruje tagi na wejściu, to `filterToKnownCategoryNames` z `categories.ts`,
  a po tamtej stronie robi to `keepKnownTags`).

Po tym kroku plik nie importuje niczego z `~/lib/db`.

- [ ] **Krok 2: Potwierdź, że nic nie zostało**

```bash
grep -rn "drizzle-orm\|lib/db" app/lib/exercises.ts app/routes/trener/biblioteka*.tsx
```
Expected: brak wyników.

```bash
grep -rn "normalizeTags\|ExerciseWithDemo\|createExerciseWithDemo\|updateExerciseWithDemo\|getExerciseWithDemoForTrainer\|getExerciseForTrainer\|countExercisesForTrainer" app/
```
Expected: brak wyników.

- [ ] **Krok 3: Zaktualizuj `app/lib/README.md`**

Wiersz `exercises.ts` opisuje dziś repozytorium Drizzle z transakcjami i kolejką sprzątającą —
po przepięciu **żadne z tych zdań nie jest prawdziwe**. Zastąp go opisem modułu na kontrakcie:
funkcje (`listExercisesForTrainer` oddające całą stronę, `listActiveExercisesForTrainer` sklejające
strony, `countActiveExercisesForTrainer`, `getExerciseDetail`, `createExercise`, `updateExercise`,
`setExerciseArchived`, `ExerciseError`), trzy rzeczy warte zapamiętania (słownik `CONTRACT_SORT`,
zakaz wysyłania `demoFileId: null` bez intencji odpięcia, bramka wariantu umiejętności po stronie BE)
oraz nota, że `countExercisesForTrainer` i `normalizeTags` zniknęły bez zamiennika.

W wierszu `file-uploads.ts` dopisz `uploadExerciseDemo` — z zaznaczeniem, że to **jedyna** ścieżka
wysyłki na kontrakcie, a `set_video` i `body_photo` zostają na bazie do kroku 4.

- [ ] **Krok 4: Zaktualizuj `app/routes/trener/README.md`**

Popraw opisy `biblioteka._index.tsx`, `biblioteka.nowe.tsx` i `biblioteka.$exerciseId.tsx` wszędzie
tam, gdzie mówią o bazie, podpisywaniu URL-i albo o sprawdzaniu wariantu umiejętności w trasie.

- [ ] **Krok 5: Pełne bramki — jedyny raz w całym planie**

Cztery komendy, **każda osobno i dopiero po zakończeniu poprzedniej** (nie równolegle, nie
w jednym wywołaniu): to jedyne miejsce, w którym uruchamiamy `tsc`, całą suitę i build, więc
przebieg jest z założenia najcięższy. Suita jednowątkowo, żeby nie wysycić pamięci maszyny.

```bash
npm run typecheck
```
```bash
npm run lint
```
```bash
npx vitest run app --no-file-parallelism
```
```bash
npm run build
```

- [ ] **Krok 6: Commit**

```bash
git add app/lib/exercises.ts app/lib/README.md app/routes/trener/README.md
git commit -m "chore(cwiczenia): usuniecie martwego kodu i aktualizacja dokumentacji obszaru"
```

---

## Domknięcie

Po Zadaniu 8 **pierwszy obszar kroku 3 Etapu 2 jest zamknięty**: `categories.ts` i `exercises.ts`
stoją w całości na kontrakcie, a trzy trasy biblioteki nie znają bazy.

**Do sprawdzenia w działającej aplikacji** (Właściciel, Docker — bramki tego nie pokrywają, bo
żadna z nich nie przepuszcza żądania przez prawdziwy router ani przez prawdziwe BE):

1. lista `/trener/biblioteka` — stronicowanie, wyszukiwanie, oba filtry i cztery sortowania;
2. **wideo demo renderuje się w przeglądarce z adresu `API_PUBLIC_URL`**, nie z serwera FE. To
   jedyne miejsce w tym obszarze, które wymaga, żeby BE był publicznie osiągalny dla przeglądarki
   (spec §4, „Pliki") — na środowisku, gdzie `API_URL` jest siecią prywatną Railway, a
   `API_PUBLIC_URL` nie jest ustawione, kafelki będą puste mimo zielonych testów;
3. utworzenie ćwiczenia z demo i podmiana demo w edycji — trzy i dwa żądania zamiast transakcji;
4. próba archiwizacji ćwiczenia będącego wariantem aktywnej umiejętności — komunikat ma się pokazać
   **w formularzu**, nie jako granica błędu, i będzie **krótszy niż dotychczasowy** (nie nazywa
   umiejętności — decyzja A7).

**Co ten obszar zostawia następnym:**

- **`toRouteResponse` ma pierwsze użycie w trasie** (`biblioteka.$exerciseId.tsx`) — wzorzec
  mapowania `ApiError` na `Response` w akcji jest od teraz do skopiowania, razem z pułapką
  `throw redirect(...)` wewnątrz `try`.
- **Wzorzec listy z kontraktu**: moduł oddaje całą stronę, trasa nie liczy `safePage` ani nie zna
  rozmiaru strony. Powtórzy się w planach, ćwiczeniach dziennika, zgłoszeniach i podopiecznych.
- **Wzorzec sekwencji z plikiem** (wysyłka → zapis → podpięcie) — powtórzy się przy `set_video`
  (dziennik treningowy) i `body_photo` (sylwetka) w kroku 4.
- **`_layout.tsx` czeka na zwinięcie w jedno `GET /v1/trainer/nav`** — do zrobienia w ostatnim
  obszarze („podopieczni"), gdy migrują pozostałe trzy liczniki. Do tego czasu licznik ćwiczeń
  ściąga stronę listy po to, żeby odczytać jedną liczbę (decyzja A5).
- **Jedyna różnica w zachowaniu wobec stanu sprzed integracji**: nieudany zapis po udanej wysyłce
  demo może zostawić ćwiczenie bez demo, zamiast nie zostawić niczego (decyzja A8). Zamknięcie tego
  okna wymagałoby `demoFileId` w `CreateExerciseDto`, czyli dodatku do kontraktu po stronie BE.
