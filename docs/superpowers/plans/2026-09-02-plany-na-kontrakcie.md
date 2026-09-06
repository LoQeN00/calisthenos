# Plany na kontrakcie BE — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przepiąć obszar „plany" — moduł `app/lib/plans.ts` i siedem tras, które go wołają — z Drizzle
na `@kalisthenos/api-client`, razem z licznikami nawigacji i pulpitu, które ten obszar dziś zasila.
Po tym zadaniu drugi obszar kroku 3 Etapu 2 jest zamknięty w całości, a powłoka obu ról bierze
swoje liczniki z jednego wywołania na ekran.

**Architecture:** Wzorzec ustalony na `categories.ts` i `exercises.ts`: pierwszym parametrem
`api: Api` dokładnie tam, gdzie stało `Db`, wnętrze to wywołanie SDK, a własny typ błędu powstaje
**wyłącznie** dla statusów, dla których trasa ma komunikat w formularzu. Nowe wobec ćwiczeń są trzy
rzeczy: zapis drzewa planu przechodzi przez jawne mapowanie formularza na DTO kontraktu
(`toSavePlanDto`), bo BE odrzuca pola spoza DTO; stan „para ma już szkic" przestaje być osobnym
zapytaniem, bo kontrakt oddaje `draftId` w szczególe i wskazuje istniejący szkic w `409`; oraz
powstaje `app/lib/views.ts` — moduł widoków przekrojowych (nawigacja, pulpit), który zastępuje
liczniki liczone dziś po jednym na moduł.

**Tech Stack:** React Router 7.15.1 (SSR, `v8_middleware`), `@kalisthenos/api-client` 0.3.0
(hey-api), vitest + happy-dom, zod, biome.

**Spec:** [`docs/superpowers/specs/2026-08-29-integracja-fe-be-design.md`](../specs/2026-08-29-integracja-fe-be-design.md)
— §8 krok 3 („moduły `app/lib` obszar po obszarze", kolejność: ćwiczenia i kategorie, **plany**, …)
oraz załącznik A, wiersz `plans.ts` („14 z 15" — piętnasta, liczniki zakładek, doszła w Etapie 1
jako `counts` w `GET /v1/plans`). Wzorzec i reguły rozstrzygające zostawiły trzy poprzednie plany:
[`2026-08-31-warstwa-klienta-api-fe.md`](2026-08-31-warstwa-klienta-api-fe.md),
[`2026-09-01-uwierzytelnianie-na-tokenach-be.md`](2026-09-01-uwierzytelnianie-na-tokenach-be.md)
i [`2026-09-01-cwiczenia-na-kontrakcie.md`](2026-09-01-cwiczenia-na-kontrakcie.md) (wzorzec listy
z kontraktu, decyzja A5 o liczniku nawigacji — **ten plan ją wycofuje**, patrz B5).

## Global Constraints

- **Branch:** cała praca na `be-integration`. `master` jest gałęzią wdrożeniową realnej produkcji —
  nie commituj tam. **Gita prowadzi Właściciel** (`CLAUDE.md`) — komendy `git` w krokach „Bramki
  i commit" są do wykonania przez niego, nie przez agenta.
- **Komunikaty po polsku, identyfikatory w kodzie po angielsku.** Komentarze po polsku, w stylu
  `app/lib/categories.ts`. **Każdy eksportowany symbol, pole interfejsu i nazwa parametru — po
  angielsku.** W testach nazwy `describe`/`it` i zmienne lokalne są po polsku (wzorzec:
  `categories.test.ts`, `exercises.test.ts`).
- **Testy:** `globals: false` — importuj `describe`/`it`/`expect` z `vitest` jawnie. Komentarz
  w teście tłumaczy **dlaczego** przypadek istnieje, nie co robi kod.
- **Mock `~/lib/env` NIE jest potrzebny** w `plans.test.ts` ani `views.test.ts`: żaden z tych
  modułów nie importuje `env`, a `createApiClient` czyta `getEnv()` wyłącznie wtedy, gdy nie dostał
  `baseUrl` — testy podają go zawsze (wzorzec: `categories.test.ts`, który mocka nie ma).
  `exercises.test.ts` mock ma i zostaje, bo tamten moduł importuje `file-uploads.ts`.
- **Wywołania SDK potrzebujące `data` muszą podać `throwOnError: true` jawnie** — generyk funkcji
  SDK domyślnie schodzi do `false` i `data` typuje się jako `… | undefined`, mimo że klient i tak
  rzuca. Zero zmiany w czasie wykonania. Wzorzec: `categories.ts:29`.
- **Reguła wąskiego `catch`:** moduł zamienia na własny typ błędu (`PlanError`) **wyłącznie** te
  statusy, dla których trasa ma komunikat. W tym obszarze są to `400`, `404` i `409` na
  **zapisach** (trasy pokazują `userMessage` w formularzu albo w pasku akcji). Odczyty nie mapują
  nic. Każdy inny status leci `ApiError`-em do granicy błędu. Awaria BE ma zostać awarią.
- **Reguła rozstrzygająca dla `404`:** sygnatura z `| null` łapie `404` przez `orNull`; każda inna
  pozwala mu lecieć (albo, na zapisie, zamienia na `PlanError`). Wyznacza ją sygnatura, nie ocena
  piszącego.
- **`forbidNonWhitelisted: true` w `ValidationPipe` BE** (`apps/api/src/app/app.module.ts:165`):
  pole spoza DTO to `400`, nie ciche pominięcie. Formularz edytora niesie w każdej sesji, bloku
  i pozycji pole `id` (tymczasowe `tmp-…` albo stary identyfikator wiersza), którego `SavePlanDto`
  **nie ma**. Mapowanie `toSavePlanDto` musi je zdjąć — to jedyna pułapka tego obszaru, która
  milczy przy typach, bo `PlanForm` jest strukturalnie „szerszy" i TypeScript przepuści nadmiar.
- **Nie ruszaj** `app/lib/db/`, `app/lib/workouts.ts`, `app/lib/trainees.ts`,
  `app/lib/feature-requests.ts`, `app/lib/stats.ts`, `app/lib/plan-types.ts` (czysta prezentacja
  wg załącznika A specu — `PlanFormSchema` zostaje pierwszą linią walidacji formularza), płatności,
  ani żadnego modułu domenowego poza `plans.ts`, `views.ts` (nowy) i `exercises.ts` (wyłącznie
  usunięcie `countActiveExercisesForTrainer`, Zadanie 3).
- **`tests/plans-repo.itest.ts` znika w Zadaniu 1** — importuje osiem funkcji, które ten plan
  usuwa albo zmienia, więc czerwieni `npm run typecheck` od pierwszego zadania. Spec §8 krok 6
  kasuje cały zestaw `tests/*.itest.ts` razem z bazą, a §10 mówi wprost, że po jej utracie „nie ma
  czego integrować"; zamiennikiem jest `app/lib/plans.test.ts` przeciw podstawionemu klientowi.
  Gwarancje bazodanowe (zakres tenanta, filtry, porządek, „jeden szkic na parę") są od teraz po
  stronie BE. Żadnego innego pliku w `tests/` nie ruszamy.
- **Każde zadanie utrzymuje PRAWDZIWOŚĆ wpisów dokumentacji** — wiersza `plans.ts` (od Zadania 3
  także `views.ts` i `exercises.ts`) w `app/lib/README.md` oraz wierszy dotkniętych tras
  w `app/routes/trener/README.md` i `app/routes/podopieczny/README.md`. `CLAUDE.md` czyni to
  obowiązkiem („zaktualizuj dokumentację w tym samym kroku… jeśli opis przestał być prawdziwy"),
  a moduł jest przez sześć zadań w stanie mieszanym, więc wpis ma mówić, co już stoi na kontrakcie,
  a co jeszcze na Drizzle. Krótko — jedno–dwa zdania korekty. Pełny, końcowy opis pisze dopiero
  Zadanie 7.
- **Każde zadanie usuwa importy, które właśnie osierociło.** `plans.ts` traci funkcje bazodanowe
  po kawałku, więc po każdym zadaniu część importów Drizzle (`ilike`, `inArray`, `max`, `or`,
  `sql`, …) przestaje mieć użycie. **Nie łapie tego żadna bramka** — `noUnusedImports` nie należy
  do zestawu `recommended` biome 1.9.4 (sprawdzone w poprzednim obszarze). Po wymianie ciała
  funkcji przejrzyj import Drizzle i wyrzuć symbole, których nie używa już żadna z pozostałych
  funkcji pliku. To samo dotyczy tras: `db` z `~/lib/db/client` zostaje w trasie **tylko** wtedy,
  gdy jakaś funkcja spoza tego obszaru nadal go bierze.
- **Bramki: lekkie po zadaniu, pełne raz na końcu.** Pełny zestaw (`tsc` + cała suita
  w równoległych workerach) po każdym zadaniu wysycał pamięć maszyny Właściciela w poprzednim
  obszarze. Dlatego:
  - **w trakcie zadania** wyłącznie test dotkniętego pliku, jednowątkowo:
    `npx vitest run app/lib/plans.test.ts --no-file-parallelism` (Zadanie 3 dodatkowo
    `app/lib/views.test.ts` i `app/lib/exercises.test.ts`);
  - **na końcu, po Zadaniu 7**, raz i po kolei: `npm run typecheck`, `npm run lint`,
    `npx vitest run app --no-file-parallelism`, `npm run build`.

  Cena: błąd typów przechodzący przez granicę pliku wyjdzie dopiero na końcu. Każde zadanie
  przenosi funkcję **razem z jej wywołaniami**, więc drzewo po zadaniu jest budowalne, a ryzyko
  ogranicza się do literówek w polach — tanich do naprawienia jedną rundą.
- Bramka `app/routes/no-direct-db.test.ts` ma zostać zielona przez cały czas — trasy nie zaczynają
  wołać klienta wprost, wołają go przez moduł.

---

## Decyzje obszaru

Wyprowadzone z odczytu kontraktu (`openapi/openapi.json`, `libs/plans/**`, `libs/analytics/**`
w `calisthenos-be`) i obu stron kodu, nie z nazw.

| # | Decyzja | Uzasadnienie |
|---|---|---|
| **B1** | Sygnatury tracą `trainerId` | zakres tenanta niesie token, BE go egzekwuje; argument podtrzymywałby złudzenie, że FE czegokolwiek pilnuje (wzorzec: `categories.ts:26-31`, decyzja A1 ćwiczeń) |
| **B2** | Lista to jedno żądanie; `countPlansForTrainer` i `countPlansByStatusForTrainer` **znikają** | `GET /v1/plans` oddaje `{ items, page, totalPages, total, counts }` — `counts` policzone niezależnie od `status` i `q`, zawsze bez zarchiwizowanych (`docs/04` §Plany), dokładnie jak dzisiejsze `countPlansByStatusForTrainer`. Stronę spoza zakresu przycina BE (`paginate`). Rozmiar strony zgadza się co do wartości (`PAGE_SIZE = 20` w trasie, `PAGE_SIZE.plans = 20` w BE) — po przepięciu liczy wyłącznie BE. Szukajka `q` obejmuje po tamtej stronie **nazwę planu ALBO nazwę podopiecznego** (`p.name ilike ? or u.display_name ilike ?`), tak jak dzisiejszy `innerJoin` na `users` — parytet potwierdzony w `plan-list.read-model.ts:151`, nie założony |
| **B3** | **Bez słownika sortowań**; `status: "all"` to brak parametru | wartości `sort` w kontrakcie (`newest` · `oldest` · `name_asc` · `published`) są DOKŁADNIE te, które stoją w zakładkowalnych adresach list — inaczej niż w ćwiczeniach nie ma czego tłumaczyć. `status` w kontrakcie zawęża do jednego stanu, a lista i tak nigdy nie niesie zarchiwizowanych, więc `all` znaczy „nie wysyłaj parametru" |
| **B4** | `PlanRepoError` → `PlanError`, ten sam kształt (`userMessage`) | moduł przestaje być repozytorium, więc nazwa kłamie; kształt zostaje, bo trzy trasy łapią `e.userMessage` i pokazują go w formularzu (precedens: `CategoryError`, `ExerciseError`). Źródłem `userMessage` jest od teraz `message` z koperty BE — po polsku i dla użytkownika (`docs/04` §4). Dwa dzisiejsze zdania FE **przestają istnieć**: „Plan nie istnieje albo nie należy do Ciebie." (BE: `404`, komunikat BE) i „Plan nie jest w trybie draft." (BE: `409 PLAN_NOT_DRAFT`, „Zmieniać można wyłącznie szkic planu.") |
| **B5** | **Nowy moduł `app/lib/views.ts`** — nawigacja i pulpit z widoków przekrojowych BE; decyzja A5 ćwiczeń wycofana | `GET /v1/trainer/nav`, `GET /v1/me/nav` i `GET /v1/trainer/home` to widoki na EKRAN (ADR-0009: modele odczytu przekraczające konteksty mieszkają w `analytics`). A5 odłożyła zwinięcie `_layout.tsx` na ostatni obszar, żeby cztery funkcje modułów nie wołały `nav` czterokrotnie. Wołanie **z layoutu, raz na żądanie**, tego problemu nie ma — a od tej chwili każdy kolejny obszar migruje swój licznik przez **usunięcie** funkcji bazodanowej i wzięcie pola z już pobranego widoku. Cena dziś: pulpit trenera ściąga `home` (klienci, ostatnie treningi) po to, żeby odczytać dwie liczby, dopóki obszar dziennika nie przepnie reszty — ten sam rodzaj ceny, co A5, tylko krótszy, bo dziennik jest następny w kolejce. `countActiveExercisesForTrainer` (stopgap A5) traci jedynego wołającego i znika |
| **B6** | Licznik „Plany" w powłoce trenera **przestaje liczyć zarchiwizowane** | `countPlansForTrainerByStatus(db, id, null)` liczy dziś wszystkie, także `archived`; `TrainerNavView.plans` liczy `status <> 'archived'` (`trainer-nav.read-model.ts`, „decyzja D4 specu" po stronie BE; `docs/03` mówi wprost, że licznik powłoki ma liczyć tak samo jak zakładka „wszystkie"). Spec: „ustalenia po stronie BE są nadrzędne". Jedyna widoczna zmiana liczby w tym obszarze |
| **B7** | Szkic pary czyta się z `draftId`, nie osobnym zapytaniem; `findAnyDraftFor` i `findDraftBasedOn` **znikają** | `PlanDetailView.draftId` („`docs/03` Plan — edytor: czy para ma już szkic") zastępuje obie funkcje w edytorze. Jedyne miejsce bez szczegółu pod ręką — odbicie w loaderze `plany.nowy.tsx` przy `?traineeId=` — bierze szkic z `GET /v1/trainees/{id}/plans` (`findDraftForTrainee`); cudzy podopieczny daje tam pustą listę, więc `null`, nie `404` |
| **B8** | `createBlankPlan` zamienia `409 PLAN_DRAFT_EXISTS` na `{ id: details.planId, created: false }` | kontrakt „wskazuje istniejący" (`plan.errors.ts:37-43`, `details.planId`) właśnie po to, żeby klient miał dokąd przekierować. Dzisiejszy pre-check `findAnyDraftFor` w akcji znika — wyścig „dwa szkice naraz" domyka partial unique index po stronie BE, nie FE. Znika też `findTraineeOfTrainer(db)` z akcji: cudzy podopieczny to `404` z BE, mapowane na `PlanError` do formularza. Wynik niesie `created`, bo funkcja o nazwie „utwórz" zwracająca cudzy identyfikator bez słowa wprowadzałaby czytelnika w błąd |
| **B9** | `createDraftFromActive` oddaje `{ id, created }` z kodu odpowiedzi (`201` powstał / `200` istniejący) | BE sprawdza po kolei: cudzy → `404`, para ma szkic → `200` istniejący, źródło nie `active` → `409 PLAN_NOT_ACTIVE`. Gałąź „użyj istniejącego szkicu" z dzisiejszej akcji edytora jest więc **zbędna** — jedno wywołanie robi obie rzeczy. Akcja czyta status planu z pełnego szczegółu (`loadPlanForTrainer`), bo lżejszego odczytu kontrakt nie ma; liczba żądań na zapis z aktywnego zostaje ta sama, co dziś (szczegół → szkic → zapis → publikacja) |
| **B10** | Zapis idzie przez jawne `toSavePlanDto`; `PlanFormSchema` zostaje pierwszą linią | mapowanie robi trzy rzeczy, które dziś robił `saveDraftPlan` w transakcji: zdejmuje `id` (patrz Global Constraints), normalizuje tempo per rodzaj bloku (dropset: tempo na bloku, pozycje `null`; single/superset: odwrotnie) i zamienia `undefined` na `null`, bo `PlanItemDto` wymaga kluczy `sets`/`restSeconds`/`note`. Zod zostaje, bo daje komunikat **per pole** (`ścieżka: treść`), a `400` z BE za regułę drzewa (`PLAN_BLOCK_CARDINALITY_INVALID`, `PLAN_ITEM_OUT_OF_RANGE`, …) to jedno zdanie bez ścieżki — mapowane do formularza jako druga linia, nie pierwsza |
| **B11** | Publikacja dostaje od BE regułę, której FE nie miał: `409 PLAN_EMPTY` / `PLAN_SESSION_EMPTY` | dzisiejszy `publishPlan` sprawdza wyłącznie status; BE odmawia publikacji planu bez sesji i z pustą sesją. Bierzemy to bez dyskusji (spec: ustalenia BE nadrzędne), komunikat BE trafia do formularza edytora jak każdy inny `409` |
| **B12** | Usuwanie oddaje `outcome` bez `logCount`; komunikat traci liczbę | `PlanDeletedView` to `{ outcome: "deleted" \| "archived" }` — liczby logów kontrakt nie niesie, a dokładanie jej byłoby dodatkiem po stronie BE. „Plan zarchiwizowany — ma N zapisanych sesji…" staje się „Plan zarchiwizowany — historia treningów została zachowana.". Znikają też dwa mechanizmy FE: dopasowanie po nazwie constraintu FK przy wyścigu (BE) i własny komunikat „już zarchiwizowany z logami" (BE: `409 PLAN_NOT_ARCHIVABLE`, „Archiwizować można wyłącznie plan aktywny.") |

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/plans.ts` (przepisanie) | moduł na kliencie: lista ze `counts`, plany podopiecznego, szkic pary, szczegół, tworzenie, szkic z aktywnego, `toSavePlanDto` + zapis, publikacja, usuwanie, `PlanError` |
| `app/lib/plans.test.ts` (nowy) | testy modułu przeciw podstawionemu klientowi |
| `app/lib/views.ts` (nowy) | widoki przekrojowe BE: `loadTrainerNavigation`, `loadTrainerDashboard`, `loadTraineeNavigation` |
| `app/lib/views.test.ts` (nowy) | testy trzech wywołań |
| `app/lib/exercises.ts` (zmiana) | znika `countActiveExercisesForTrainer` (stopgap A5) |
| `app/lib/exercises.test.ts` (zmiana) | znika blok testów licznika |
| `app/routes/trener/plany._index.tsx` (zmiana) | lista jednym wywołaniem, etykiety zakładek z `counts`, usuwanie przez kontrakt; znika import `db` |
| `app/routes/trener/plany.nowy.tsx` (zmiana) | odbicie do szkicu i tworzenie przez kontrakt; `listTraineesOfTrainer(db)` zostaje (obszar „podopieczni") |
| `app/routes/trener/plany.$planId.tsx` (zmiana) | szczegół, tryb z `draftId`, zapis/szkic/publikacja/usuwanie; znika import `db` |
| `app/routes/trener/podopieczni.$traineeId.tsx` (zmiana) | plany pary i usuwanie przez kontrakt; reszta loadera zostaje na bazie (inne obszary) |
| `app/routes/trener/_layout.tsx` (zmiana) | liczniki `plans` i `exercises` z `nav`; `trainees` i `ideas` zostają na bazie |
| `app/routes/trener/_index.tsx` (zmiana) | `activePlans` i `drafts` z `home`; reszta pulpitu zostaje na bazie (obszar „dziennik") |
| `app/routes/podopieczny/_layout.tsx` (zmiana) | licznik sesji z `nav`; cztery pozostałe zostają na bazie |
| `tests/plans-repo.itest.ts` (usunięcie) | nie ma czego integrować (spec §10) |
| `tests/README.md` (zmiana) | znika wiersz `plans-repo.itest.ts` |
| `app/lib/README.md` (zmiana) | wiersze `plans.ts`, `exercises.ts`, nowy wiersz `views.ts` |
| `app/routes/trener/README.md`, `app/routes/podopieczny/README.md` (zmiana) | opisy tras, jeśli mówią o bazie |

**Kolejność zadań nie jest dowolna:** każde zadanie przenosi funkcję **razem z jej wywołaniami**,
żeby `npm run typecheck` był zielony po każdym z nich. `deletePlan` ma trzech wołających w trzech
trasach — dlatego jest osobnym zadaniem, a nie częścią listy. Sygnatura zmieniona bez wywołań
(albo odwrotnie) zostawia drzewo, którego nie da się zbudować — a wtedy bramka po zadaniu niczego
nie dowodzi.

---

### Zadanie 1: Lista planów — jedno żądanie zamiast trzech

**Files:**
- Modify: `app/lib/plans.ts` (wymiana funkcji listy; stare funkcje zapisu zostają do swoich zadań)
- Modify: `app/routes/trener/plany._index.tsx`
- Modify: `app/routes/trener/plany.$planId.tsx`, `app/routes/trener/podopieczni.$traineeId.tsx`
  (wyłącznie nazwa `PlanRepoError` → `PlanError`)
- Delete: `tests/plans-repo.itest.ts`
- Modify: `tests/README.md`
- Test: `app/lib/plans.test.ts` (nowy)

**Interfaces:**
- Consumes: `Api` z `~/lib/api/client`, `plansControllerList` i typy `PlanListPage`,
  `PlanStatusCounts` z `@kalisthenos/api-client`.
- Produces:
  - `type PlanSort = "newest" | "oldest" | "name_asc" | "published"` (bez zmian — słownik URL-a,
    identyczny z kontraktem)
  - `type PlanStatusFilter = "all" | "active" | "draft"` (bez zmian)
  - `interface PlanListFilter { status: PlanStatusFilter; q?: string }`
  - `listPlansForTrainer(api: Api, opts: PlanListFilter & { sort: PlanSort; page: number }): Promise<PlanListPage>`
    — zwraca **całą stronę** z kontraktu (`items`, `page`, `totalPages`, `total`, `counts`).
  - `class PlanError extends Error { constructor(message: string, readonly userMessage: string) }`
    — dawny `PlanRepoError`, ten sam kształt.

Dzisiejsza trójka `countPlansByStatusForTrainer` + `countPlansForTrainer` + `listPlansForTrainer`
to trzy zapytania i własne liczenie `safePage`. Kontrakt oddaje wszystko w jednej odpowiedzi,
a stronę spoza zakresu przycina sam. Obie funkcje liczące **znikają bez zamiennika** (B2).

- [ ] **Krok 1: Usuń `tests/plans-repo.itest.ts` i jego wiersz w `tests/README.md`**

Plik importuje `countPlansByStatusForTrainer`, `countPlansForTrainer`, `listPlansForTrainer`
w sygnaturach, które ten krok zmienia — od tego kroku nie da się go zbudować. Usuń plik i wiersz
`| \`plans-repo.itest.ts\` | …` z tabeli w `tests/README.md`.

- [ ] **Krok 2: Napisz failujące testy**

Plik `app/lib/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { listPlansForTrainer } from "./plans";

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

const PLAN_LISTY = {
  id: "p-1",
  name: "Siła 1",
  status: "active" as const,
  version: 2,
  traineeId: "t-1",
  traineeName: "Anna Kowalska",
  sessionCount: 3,
  publishedAt: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-07-20T10:00:00.000Z",
};

const LICZNIKI = { all: 5, active: 3, draft: 2 };

function strona(
  items: unknown[],
  page = 1,
  totalPages = 1,
  total = items.length,
  counts = LICZNIKI,
) {
  return { items, page, totalPages, total, counts };
}

describe("listPlansForTrainer — lista planów na kontrakcie", () => {
  it("sortowanie i strona idą do kontraktu bez tłumaczenia", async () => {
    // Adresy list są zakładkowalne (`?sort=published`), a kontrakt nazywa
    // sortowania DOKŁADNIE tak samo — słownika, jaki mają ćwiczenia, tu nie ma
    // i test pilnuje, żeby nikt go nie dopisał „dla symetrii".
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([PLAN_LISTY]));
    });

    await listPlansForTrainer(api, { status: "all", sort: "published", page: 2 });

    expect(zapytanie).toContain("sort=published");
    expect(zapytanie).toContain("page=2");
  });

  it("`all` nie wysyła parametru `status`, a puste `q` nie trafia do zapytania", async () => {
    // Lista nigdy nie niesie zarchiwizowanych, więc `all` to brak zawężenia —
    // a `status=all` kontrakt by zignorował jako nieznaną wartość. Puste `q=`
    // znaczy z kolei „szukaj pustego łańcucha", nie „bez filtra".
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([PLAN_LISTY]));
    });

    await listPlansForTrainer(api, { status: "all", q: "", sort: "newest", page: 1 });

    expect(zapytanie).not.toContain("status=");
    expect(zapytanie).not.toContain("q=");
  });

  it("filtr statusu i szukajka idą do kontraktu, gdy są ustawione", async () => {
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([PLAN_LISTY]));
    });

    await listPlansForTrainer(api, { status: "draft", q: "Anna", sort: "newest", page: 1 });

    expect(zapytanie).toContain("status=draft");
    expect(zapytanie).toContain("q=Anna");
  });

  it("liczniki zakładek i liczby stron przychodzą z kontraktu, moduł ich nie przelicza", async () => {
    // Do integracji trasa robiła trzy zapytania i liczyła `safePage` sama.
    // Teraz `counts` przychodzą z tą samą odpowiedzią, a stronę spoza zakresu
    // przycina BE — dwa niezależne liczenia rozjechałyby się przy pierwszej
    // zmianie rozmiaru strony po tamtej stronie.
    const api = klient(() => json(200, strona([PLAN_LISTY], 3, 3, 41)));

    const wynik = await listPlansForTrainer(api, { status: "all", sort: "newest", page: 99 });

    expect(wynik.page).toBe(3);
    expect(wynik.totalPages).toBe(3);
    expect(wynik.total).toBe(41);
    expect(wynik.counts).toEqual(LICZNIKI);
    expect(wynik.items).toEqual([PLAN_LISTY]);
  });
});
```

- [ ] **Krok 3: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: FAIL — `listPlansForTrainer` ma dziś sygnaturę `(db, trainerId, opts)` i pierwszy
argument nie jest klientem.

- [ ] **Krok 4: Wymień funkcje listy w `app/lib/plans.ts`**

Na górze pliku, obok dotychczasowych importów Drizzle (te znikną do Zadania 7):

```ts
import { plansControllerList } from "@kalisthenos/api-client";
import type { PlanListPage } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
```

Zamień dotychczasowe `PlanListRow`, `countPlansByStatusForTrainer`, prywatne `planConditions`,
`countPlansForTrainer` i `listPlansForTrainer` (pozostaw `PlanSort` i `PlanStatusFilter`) na:

```ts
export type PlanSort = "newest" | "oldest" | "name_asc" | "published";
export type PlanStatusFilter = "all" | "active" | "draft";

export interface PlanListFilter {
  status: PlanStatusFilter;
  q?: string;
}

/**
 * Jedno żądanie zamiast trzech: kontrakt oddaje stronę RAZEM z `total` i z
 * licznikami zakładek `counts` — policzonymi niezależnie od `status` i `q`,
 * zawsze bez zarchiwizowanych (`docs/04` §Plany) — więc `countPlansForTrainer`
 * i `countPlansByStatusForTrainer` znikają bez zamiennika. Stronę spoza zakresu
 * przycina BE (`paginate`), dokładnie tak, jak robiła to `safePage` w trasie.
 *
 * Wartości `sort` są w kontrakcie DOKŁADNIE te, które stoją w zakładkowalnych
 * adresach list, więc — inaczej niż w ćwiczeniach — nie ma tu słownika.
 * Szukajka `q` obejmuje po tamtej stronie nazwę planu ALBO nazwę podopiecznego,
 * tak jak dotychczasowy `innerJoin` na `users`.
 */
export async function listPlansForTrainer(
  api: Api,
  opts: PlanListFilter & { sort: PlanSort; page: number },
): Promise<PlanListPage> {
  const { data } = await plansControllerList({
    client: api,
    query: {
      page: opts.page,
      sort: opts.sort,
      // `all` to BRAK parametru: lista i tak nigdy nie niesie zarchiwizowanych,
      // a `status` w kontrakcie zawęża wyłącznie do jednego stanu.
      ...(opts.status !== "all" ? { status: opts.status } : {}),
      // Rozłożone warunkowo, nie przez `q: opts.q`: klucz z wartością `undefined`
      // i BRAK klucza to dla serializatora zapytań dwie różne rzeczy, a puste
      // `q=` znaczy w kontrakcie „szukaj pustego łańcucha", nie „bez filtra".
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
    },
    throwOnError: true,
  });
  return data;
}
```

W tym samym pliku zmień nazwę klasy `PlanRepoError` na `PlanError` (kształt bez zmian) i popraw
wszystkie `throw new PlanRepoError(` w pozostałych, jeszcze bazodanowych funkcjach na
`throw new PlanError(`. Nad klasą:

```ts
/**
 * Własny typ błędu obszaru, bo trzy trasy pokazują `userMessage` w formularzu
 * albo w pasku akcji (precedens: `CategoryError`, `ExerciseError`). Od tego
 * obszaru źródłem `userMessage` jest `message` z koperty BE — po polsku i dla
 * użytkownika. Dawny `PlanRepoError`: nazwa kłamała, odkąd moduł przestał być
 * repozytorium.
 */
export class PlanError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}
```

Po tym kroku sprawdź import Drizzle: `ilike`, `or`, `sql`, `asc` i `ne` miały użycie wyłącznie
w usuniętych funkcjach listy — usuń je. `count` zostaje (liczniki do Zadania 3), `desc` zostaje
(`listPlansForTrainee` do Zadania 4).

- [ ] **Krok 5: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 6: Przemianuj `PlanRepoError` w trzech trasach**

W `app/routes/trener/plany._index.tsx`, `app/routes/trener/plany.$planId.tsx`
i `app/routes/trener/podopieczni.$traineeId.tsx` zamień w imporcie z `~/lib/plans` oraz
w `instanceof` nazwę `PlanRepoError` na `PlanError`. Nic poza nazwą — logika `catch` zostaje.

- [ ] **Krok 7: Przepnij loader `plany._index.tsx`**

Z importu `~/lib/plans` usuń `countPlansByStatusForTrainer` i `countPlansForTrainer`. Dodaj
`import type { PlanStatusCounts } from "@kalisthenos/api-client";`. Import `db` **zostaje** —
akcja `delete` woła jeszcze `deletePlan(db, …)` do Zadania 2. Usuń stałą `const PAGE_SIZE = 20;`
— rozmiar strony należy teraz do BE.

Nad loaderem dodaj specyfikację kontrolek bez liczb i funkcję dekorującą etykiety:

```ts
// Etykiety zakładek dostają liczby dopiero PO odpowiedzi — `counts` przychodzą
// razem z listą. Parsowanie kontrolek liczb nie potrzebuje: zna wyłącznie wartości.
const PLAN_LIST_SPEC: ListControlsSpec = {
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

function specWithCounts(counts: PlanStatusCounts): ListControlsSpec {
  return {
    ...PLAN_LIST_SPEC,
    filterGroups: PLAN_LIST_SPEC.filterGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        // Wartości filtra to dokładnie klucze `counts` (`all` · `active` · `draft`).
        label: `${option.label} (${counts[option.value as keyof PlanStatusCounts]})`,
      })),
    })),
  };
}
```

Zamień loader w całości na:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, PLAN_LIST_SPEC);

  const result = await listPlansForTrainer(api, {
    status: (controls.filters.status ?? "all") as PlanStatusFilter,
    q: controls.q.length > 0 ? controls.q : undefined,
    sort: controls.sort as PlanSort,
    page,
  });

  const items = result.items.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    status: p.status,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    trainee: { id: p.traineeId, displayName: p.traineeName },
    sessionCount: p.sessionCount,
  }));

  return {
    items,
    spec: specWithCounts(result.counts),
    controls,
    counts: result.counts,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  };
}
```

Komponent nie zmienia się: `counts`, `spec`, `items[].trainee.displayName`, `p.publishedAt`
(`fmtDate(p.publishedAt.toString())` działa dla napisu tak samo jak dla `Date`) i `StatusBadge`
(`PlanListItem.status` jest w kontrakcie unią `draft | active | archived`) mają ten sam kształt.

- [ ] **Krok 8: Korekta dokumentacji**

W `app/lib/README.md`, wiersz `plans.ts`: dopisz na początku jedno zdanie — „**Lista trenera
stoi już na kontrakcie** (`listPlansForTrainer(api, …)` oddaje całą stronę razem z `counts`;
`countPlansForTrainer` i `countPlansByStatusForTrainer` zniknęły bez zamiennika; `PlanRepoError`
nazywa się `PlanError`), reszta funkcji jeszcze na Drizzle." W `app/routes/trener/README.md`,
wiersz `plany._index.tsx`: „paginacja 20" → „stronicowanie po stronie BE".

- [ ] **Krok 9: Bramki i commit**

```bash
npx vitest run app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/plans.ts app/lib/plans.test.ts app/routes/trener/plany._index.tsx app/routes/trener/plany.\$planId.tsx app/routes/trener/podopieczni.\$traineeId.tsx tests/plans-repo.itest.ts tests/README.md app/lib/README.md app/routes/trener/README.md
git commit -m "feat(plany): lista planow na kontrakcie, liczniki zakladek razem ze strona"
```

---

### Zadanie 2: Usuwanie planu — jedna funkcja, trzy trasy

**Files:**
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/plany._index.tsx`, `app/routes/trener/plany.$planId.tsx`,
  `app/routes/trener/podopieczni.$traineeId.tsx`
- Test: `app/lib/plans.test.ts`

**Interfaces:**
- Consumes: `plansControllerRemove`, typ `PlanDeletedView` z `@kalisthenos/api-client`; `ApiError`
  z `~/lib/api/errors`; `PlanError` z Zadania 1.
- Produces:
  - `type PlanDeleteOutcome = "deleted" | "archived"`
  - `deletePlan(api: Api, planId: string): Promise<PlanDeleteOutcome>` — `404`/`409` → `PlanError`.

`deletePlan` ma trzech wołających (lista, edytor, widok podopiecznego), więc sygnatura zmienia
się w jednym zadaniu dla wszystkich. Dzisiejszy `DeletePlanResult` z `logCount` znika (B12).

- [ ] **Krok 1: Dopisz failujące testy**

W `app/lib/plans.test.ts` rozszerz import: `import { deletePlan, listPlansForTrainer, PlanError } from "./plans";`
oraz `import { ApiError } from "./api/errors";`. Dodaj:

```ts
// Koperta błędu BE: `{ error: { code, message, details } }` — dokładnie to, co
// rozbiera `parseApiError`. Nazwa `odmowa`, bo `blad` jest w tym pliku zmienną
// lokalną na złapany wyjątek (idiom z `exercises.test.ts`).
function odmowa(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, details } });
}

describe("deletePlan — usuwanie przez kontrakt", () => {
  it("oddaje `outcome` z odpowiedzi, bez liczby logów", async () => {
    // O wyniku decydują logi po stronie BE. Liczby logów kontrakt nie niesie —
    // komunikat trasy przestał ją pokazywać (decyzja B12), więc moduł nie ma
    // skąd jej wziąć i nie udaje, że ma.
    let sciezka = "";
    let metoda = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      metoda = req.method;
      return json(200, { outcome: "archived" });
    });

    const wynik = await deletePlan(api, "p-1");

    expect(wynik).toBe("archived");
    expect(metoda).toBe("DELETE");
    expect(sciezka).toBe("/v1/plans/p-1");
  });

  it("`409` zamienia na PlanError z komunikatem BE", async () => {
    // Plan już zarchiwizowany, mający logi — dziś FE składał to zdanie sam,
    // teraz zdanie należy do BE. Trasa pokazuje `userMessage` w pasku akcji.
    const api = klient(() =>
      odmowa(409, "PLAN_NOT_ARCHIVABLE", "Archiwizować można wyłącznie plan aktywny.", {
        status: "archived",
      }),
    );

    const blad = await deletePlan(api, "p-1").catch((e) => e);

    expect(blad).toBeInstanceOf(PlanError);
    expect((blad as PlanError).userMessage).toBe("Archiwizować można wyłącznie plan aktywny.");
  });

  it("`500` przechodzi jako ApiError — awaria BE ma zostać awarią", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await deletePlan(api, "p-1").catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(PlanError);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: FAIL — `deletePlan` bierze dziś `(db, planId, trainerId)`.

- [ ] **Krok 3: Wymień `deletePlan` w `app/lib/plans.ts`**

Do importów dołóż `plansControllerRemove` (obok `plansControllerList`), `import type { PlanDeletedView }`
oraz `import { ApiError } from "~/lib/api/errors";`. Zamień `DeletePlanResult` i całe
dotychczasowe `deletePlan` na:

```ts
export type PlanDeleteOutcome = PlanDeletedView["outcome"];

/**
 * O wyniku decydują logi, nie status (`docs/04` §Plany): plan bez logów znika
 * trwale, plan z logami trafia do archiwum. Liczby logów kontrakt nie oddaje,
 * więc komunikat trasy przestał ją nieść. Plan już zarchiwizowany, mający logi,
 * daje `409 PLAN_NOT_ARCHIVABLE`. Wyścig z równolegle dopisanym treningiem jest
 * od teraz sprawą BE — dotychczasowe dopasowanie po nazwie constraintu FK znika.
 */
export async function deletePlan(api: Api, planId: string): Promise<PlanDeleteOutcome> {
  try {
    const { data } = await plansControllerRemove({
      client: api,
      path: { id: planId },
      throwOnError: true,
    });
    return data.outcome;
  } catch (e) {
    // Wąsko: trasa pokazuje `userMessage` w pasku akcji, więc własny typ dostają
    // wyłącznie odmowy z treścią dla użytkownika. Awaria BE ma zostać awarią.
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
      throw new PlanError(e.code, e.message);
    }
    throw e;
  }
}
```

Import Drizzle: `count` ma jeszcze użycie w `countPlansForTrainerByStatus` i `countSessionsInPlan`
(znikną w Zadaniu 3) — zostaje. Sprawdź resztę.

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 5: Przepnij akcję `plany._index.tsx`**

```ts
export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent !== "delete") return null;
  const planId = String(fd.get("planId") ?? "");
  if (!planId) return { error: "Brak id planu." };
  try {
    const outcome = await deletePlan(api, planId);
    return outcome === "deleted"
      ? { success: "Plan usunięty." }
      : { success: "Plan zarchiwizowany — historia treningów została zachowana." };
  } catch (e) {
    if (e instanceof PlanError) return { error: e.userMessage };
    throw e;
  }
}
```

Usuń z tej trasy import `db` (`~/lib/db/client`) — po tym kroku nic go tu nie używa. Trasa listy
jest w całości na kontrakcie.

- [ ] **Krok 6: Przepnij intent `delete` w akcji `plany.$planId.tsx`**

W akcji zmień destrukturyzację na `const { api, user } = requireUser(args.context, { role: "trainer" });`
(`user` jest jeszcze potrzebny funkcjom bazodanowym do Zadania 6) i zamień gałąź:

```ts
    if (intent === "delete") {
      await deletePlan(api, planId);
      throw redirect("/trener/plany");
    }
```

- [ ] **Krok 7: Przepnij intent `delete-plan` w akcji `podopieczni.$traineeId.tsx`**

W akcji (ok. linii 160) zmień destrukturyzację na `const { api, user } = requireUser(…)` — `user`
jest nadal używany przy `delete-trainee`. Zamień blok od `try {` po `deletePlan` na:

```ts
  try {
    const outcome = await deletePlan(api, planId);
    return outcome === "deleted"
      ? { success: "Plan usunięty." }
      : { success: "Plan zarchiwizowany — historia treningów została zachowana." };
  } catch (e) {
    if (e instanceof PlanError) return { error: e.userMessage };
    throw e;
  }
```

Import `db` w tej trasie **zostaje** — loader woła z niego jeszcze kilkanaście funkcji innych
obszarów.

- [ ] **Krok 8: Korekta dokumentacji**

`app/lib/README.md`, wiersz `plans.ts`: do zdania z Zadania 1 dopisz `deletePlan(api, planId)`
oddające `outcome` bez liczby logów. `app/routes/trener/README.md`, wiersze `plany._index.tsx`
i `podopieczni.$traineeId.tsx`: przy akcji usuwania usuń wzmianki o liczbie sesji, jeśli są.

- [ ] **Krok 9: Bramki i commit**

```bash
npx vitest run app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/plans.ts app/lib/plans.test.ts app/routes/trener/plany._index.tsx app/routes/trener/plany.\$planId.tsx app/routes/trener/podopieczni.\$traineeId.tsx app/lib/README.md app/routes/trener/README.md
git commit -m "feat(plany): usuwanie planu przez kontrakt w trzech trasach"
```

---

### Zadanie 3: Widoki powłoki i pulpitu — jedno wywołanie na ekran

**Files:**
- Create: `app/lib/views.ts`
- Create: `app/lib/views.test.ts`
- Modify: `app/lib/plans.ts` (znikają `countPlansForTrainerByStatus`, `countSessionsInPlan`)
- Modify: `app/lib/exercises.ts`, `app/lib/exercises.test.ts` (znika `countActiveExercisesForTrainer`)
- Modify: `app/routes/trener/_layout.tsx`, `app/routes/trener/_index.tsx`,
  `app/routes/podopieczny/_layout.tsx`

**Interfaces:**
- Consumes: `trainerViewsControllerNavigation`, `trainerViewsControllerDashboard`,
  `traineeViewsControllerNavigation` i typy `TrainerNavView`, `TrainerHomeView`, `TraineeNavView`
  z `@kalisthenos/api-client`.
- Produces:
  - `loadTrainerNavigation(api: Api): Promise<TrainerNavView>` — `{ trainees, activeExercises, plans, newFeatureRequests }`
  - `loadTrainerDashboard(api: Api): Promise<TrainerHomeView>` — `{ clients, recentLogs, activePlans, drafts, weekSessions }`
  - `loadTraineeNavigation(api: Api): Promise<TraineeNavView>` — `{ activePlanSessions: number | null, workoutLogs, bodyPhotos, pendingConsultations, featureRequests }`

To jest decyzja B5: liczniki przestają być funkcjami modułów, a stają się polami widoku na ekran.
Trzy funkcje bazodanowe znikają (`countPlansForTrainerByStatus`, `countSessionsInPlan` w `plans.ts`,
`countActiveExercisesForTrainer` w `exercises.ts`). Pozostałe liczniki layoutów (`trainees`,
`ideas`; `history`, `photos`, `consultations`, `ideas`) zostają na bazie do swoich obszarów — tam
migracja to od teraz **usunięcie** funkcji i wzięcie pola z `nav`.

- [ ] **Krok 1: Napisz failujące testy**

Plik `app/lib/views.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { loadTraineeNavigation, loadTrainerDashboard, loadTrainerNavigation } from "./views";

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

const NAW_TRENERA = { trainees: 4, activeExercises: 12, plans: 3, newFeatureRequests: 1 };
const PULPIT_TRENERA = { clients: [], recentLogs: [], activePlans: 2, drafts: 1, weekSessions: 5 };
const NAW_PODOPIECZNEGO = {
  activePlanSessions: null,
  workoutLogs: 7,
  bodyPhotos: 2,
  pendingConsultations: 0,
  featureRequests: 1,
};

// Trzy widoki, jeden wzorzec: moduł nie liczy, nie sumuje i nie mapuje — oddaje
// widok BE takim, jaki przyszedł. Test pilnuje ADRESU, bo to jedyne, co tu może
// się rozjechać w ciszy (zła ścieżka to `404` zamieniony przez interceptor na
// ApiError, ale dopiero w czasie wykonania).
describe("views — widoki przekrojowe BE", () => {
  it("nawigacja trenera to `GET /v1/trainer/nav`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, NAW_TRENERA);
    });

    expect(await loadTrainerNavigation(api)).toEqual(NAW_TRENERA);
    expect(sciezka).toBe("/v1/trainer/nav");
  });

  it("pulpit trenera to `GET /v1/trainer/home`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, PULPIT_TRENERA);
    });

    expect(await loadTrainerDashboard(api)).toEqual(PULPIT_TRENERA);
    expect(sciezka).toBe("/v1/trainer/home");
  });

  it("nawigacja podopiecznego to `GET /v1/me/nav`, a brak planu zostaje `null`", async () => {
    // `activePlanSessions: null` znaczy „nie ma aktywnego planu", a `0` — „plan
    // bez sesji". Kontrakt rozróżnia te stany celowo; moduł ich nie skleja,
    // robi to dopiero powłoka, która pokazuje w obu przypadkach zero.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, NAW_PODOPIECZNEGO);
    });

    const wynik = await loadTraineeNavigation(api);

    expect(wynik.activePlanSessions).toBeNull();
    expect(sciezka).toBe("/v1/me/nav");
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/views.test.ts --no-file-parallelism`
Expected: FAIL — moduł `./views` nie istnieje.

- [ ] **Krok 3: Napisz `app/lib/views.ts`**

```ts
import {
  traineeViewsControllerNavigation,
  trainerViewsControllerDashboard,
  trainerViewsControllerNavigation,
} from "@kalisthenos/api-client";
import type { TraineeNavView, TrainerHomeView, TrainerNavView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

/**
 * Widoki przekrojowe BE — nawigacja i pulpit obu ról. Po tamtej stronie mieszkają
 * w `analytics` (ADR-0009: model odczytu przekraczający granicę kontekstu), po tej
 * są jednym wywołaniem NA EKRAN, nie na licznik.
 *
 * Wzorzec migracji layoutów: obszar, który przepina swój moduł, USUWA z layoutu
 * funkcję liczącą i bierze pole z już pobranego widoku. Nic więcej — widok jest
 * pobrany od tego obszaru (plany), niezależnie od tego, ile pól layout już czyta.
 * To wycofanie decyzji A5 z obszaru ćwiczeń (wołanie `nav` z czterech funkcji
 * modułów dałoby cztery żądania; wołanie z layoutu daje jedno).
 */
export async function loadTrainerNavigation(api: Api): Promise<TrainerNavView> {
  const { data } = await trainerViewsControllerNavigation({ client: api, throwOnError: true });
  return data;
}

/**
 * Pulpit trenera: klienci, ostatnie treningi, liczniki. Do czasu przepięcia
 * obszaru dziennika pulpit czyta stąd wyłącznie `activePlans` i `drafts`, a resztę
 * nadal z bazy — cena jednego pełnego widoku za dwie liczby, przyjęta świadomie,
 * bo dziennik jest następny w kolejce i zdejmie ją, biorąc pozostałe pola stąd.
 */
export async function loadTrainerDashboard(api: Api): Promise<TrainerHomeView> {
  const { data } = await trainerViewsControllerDashboard({ client: api, throwOnError: true });
  return data;
}

/**
 * `activePlanSessions` jest `null`, gdy nie ma aktywnego planu, a `0`, gdy plan
 * jest, ale bez sesji — kontrakt rozróżnia te stany celowo. Moduł ich nie skleja;
 * powłoka pokazuje w obu przypadkach zero, ale decyzja należy do niej.
 */
export async function loadTraineeNavigation(api: Api): Promise<TraineeNavView> {
  const { data } = await traineeViewsControllerNavigation({ client: api, throwOnError: true });
  return data;
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/views.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 5: Przepnij `app/routes/trener/_layout.tsx`**

Usuń importy `countActiveExercisesForTrainer` (`~/lib/exercises`) i `countPlansForTrainerByStatus`
(`~/lib/plans`). Dodaj `import { loadTrainerNavigation } from "~/lib/views";`. Import `db` zostaje
(`countTraineesOfTrainer`, `countNewForTrainer`). Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });

  // Jedno wywołanie na ekran. `trainees` i `ideas` zostają na bazie do swoich
  // obszarów — tam migracja to usunięcie funkcji i wzięcie pola z `nav`.
  const nav = await loadTrainerNavigation(api);
  const traineeCount = await countTraineesOfTrainer(db, user.id);
  const newIdeas = await countNewForTrainer(db, user.id);

  return {
    user,
    tails: {
      trainees: traineeCount,
      exercises: nav.activeExercises,
      // Bez zarchiwizowanych — tak liczy BE (`docs/03`: licznik powłoki liczy
      // jak zakładka „wszystkie" na liście). Do integracji liczył także archiwum.
      plans: nav.plans,
      ideas: newIdeas,
    },
  };
}
```

- [ ] **Krok 6: Przepnij `app/routes/trener/_index.tsx`**

Usuń import `countPlansForTrainerByStatus` (`~/lib/plans`). Dodaj
`import { loadTrainerDashboard } from "~/lib/views";`. W loaderze zmień destrukturyzację na
`const { api, user } = requireUser(…)` i zamień dwie linie liczników na:

```ts
  // Z pulpitu BE bierzemy dziś dwie liczby; klienci, ostatnie treningi i sesje
  // tygodnia przejdą na ten sam widok w obszarze dziennika.
  const dashboard = await loadTrainerDashboard(api);
  const activePlans = dashboard.activePlans;
  const drafts = dashboard.drafts;
```

Reszta loadera (`listClientsForTrainer`, `listRecentLogsForTrainer`, `countLogsForTrainerSince`
na `db`) bez zmian.

- [ ] **Krok 7: Przepnij `app/routes/podopieczny/_layout.tsx`**

Usuń import `countSessionsInPlan` (`~/lib/plans`) i `findActivePlanForTrainee` z importu
`~/lib/workouts` (zostaje `countLogsForTrainee`). Dodaj `import { loadTraineeNavigation } from "~/lib/views";`.
W loaderze zmień destrukturyzację na `const { api, user } = requireUser(…)`. Bramki płatności
i formularza zostają **przed** wywołaniem widoku (to one odsyłają podopiecznego, zanim cokolwiek
policzymy — i zanim BE odpowiedziałby `403 ONBOARDING_FORM_PENDING`). Zamień dwie linie
`activePlan`/`sessionsCount` na:

```ts
  // Jedno wywołanie na ekran; cztery pozostałe liczniki zostają na bazie do
  // swoich obszarów. `null` (brak planu) i `0` (plan bez sesji) powłoka pokazuje
  // tak samo — jak do integracji.
  const nav = await loadTraineeNavigation(api);
  const sessionsCount = nav.activePlanSessions ?? 0;
```

- [ ] **Krok 8: Usuń trzy osierocone funkcje**

W `app/lib/plans.ts` usuń `countPlansForTrainerByStatus` i `countSessionsInPlan`. Import Drizzle:
`count` traci tu ostatnie użycie (`deletePlan` jest już na kontrakcie od Zadania 2) — usuń go;
potwierdź `grep -n "count(" app/lib/plans.ts` (Expected: brak wyników).

W `app/lib/exercises.ts` usuń `countActiveExercisesForTrainer` razem z jej docblockiem.
W `app/lib/exercises.test.ts` usuń `countActiveExercisesForTrainer` z importu oraz cały blok
`describe("countActiveExercisesForTrainer — licznik nawigacji", …)`.

```bash
grep -rn "countActiveExercisesForTrainer\|countPlansForTrainerByStatus\|countSessionsInPlan" app/
```
Expected: brak wyników.

- [ ] **Krok 9: Korekta dokumentacji**

`app/lib/README.md`: nowy wiersz `views.ts` po wierszu `exercises.ts` — „Widoki przekrojowe BE,
jedno wywołanie na ekran: `loadTrainerNavigation(api)` (`GET /v1/trainer/nav`),
`loadTrainerDashboard(api)` (`GET /v1/trainer/home`), `loadTraineeNavigation(api)`
(`GET /v1/me/nav`). Layouty biorą stąd liczniki obszarów już przepiętych; obszar przepinający
swój moduł USUWA z layoutu funkcję liczącą i bierze pole stąd." W wierszu `exercises.ts` usuń
`countActiveExercisesForTrainer(api)` z listy odczytu i dopisz do „zniknęły bez zamiennika"
(z notą: licznik nawigacji przeszedł do `views.ts`). W wierszu `plans.ts` dopisz, że
`countPlansForTrainerByStatus` i `countSessionsInPlan` zniknęły na rzecz `views.ts`.
`app/routes/trener/README.md`, wiersze `_layout.tsx` i `_index.tsx`, oraz
`app/routes/podopieczny/README.md`, wiersz `_layout.tsx`: dopisz, że liczniki planów/ćwiczeń
(trener) i sesji (podopieczny) przychodzą z `views.ts`, reszta jeszcze z bazy.

- [ ] **Krok 10: Bramki i commit**

```bash
npx vitest run app/lib/views.test.ts app/lib/exercises.test.ts app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/views.ts app/lib/views.test.ts app/lib/plans.ts app/lib/exercises.ts app/lib/exercises.test.ts app/routes/trener/_layout.tsx app/routes/trener/_index.tsx app/routes/podopieczny/_layout.tsx app/lib/README.md app/routes/trener/README.md app/routes/podopieczny/README.md
git commit -m "feat(views): nawigacja i pulpit z widokow przekrojowych BE, jedno wywolanie na ekran"
```

---

### Zadanie 4: Nowy plan i plany podopiecznego

**Files:**
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/plany.nowy.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx` (loader)
- Test: `app/lib/plans.test.ts`

**Interfaces:**
- Consumes: `plansControllerCreate`, `traineePlansControllerTraineePlans`, typ `TraineePlanItemView`
  z `@kalisthenos/api-client`.
- Produces:
  - `listPlansForTrainee(api: Api, traineeId: string): Promise<TraineePlanItemView[]>` — wszystkie
    plany pary łącznie z zarchiwizowanymi, malejąco po wersji; cudzy podopieczny → pusta lista.
  - `findDraftForTrainee(api: Api, traineeId: string): Promise<TraineePlanItemView | null>`
  - `interface CreateBlankPlanInput { traineeId: string; name: string }` (bez `trainerId`)
  - `interface CreatePlanResult { id: string; created: boolean }`
  - `createBlankPlan(api: Api, input: CreateBlankPlanInput): Promise<CreatePlanResult>` —
    `409 PLAN_DRAFT_EXISTS` → `{ id: istniejący, created: false }`; `404` → `PlanError`.

Dzisiejsze `findAnyDraftFor` zostaje jeszcze w pliku — wołają je loader i akcja edytora, które
przepina Zadanie 5 i 6. `findDraftBasedOn` również (znika w Zadaniu 6).

- [ ] **Krok 1: Dopisz failujące testy**

Rozszerz import w `app/lib/plans.test.ts` o `createBlankPlan`, `findDraftForTrainee`,
`listPlansForTrainee`. Dodaj:

```ts
const PLAN_PARY = {
  id: "p-2",
  name: "Siła 2",
  status: "draft" as const,
  version: 3,
  basedOnVersion: 2,
  sessionCount: 0,
  publishedAt: null,
  createdAt: "2026-08-20T10:00:00.000Z",
};

describe("listPlansForTrainee / findDraftForTrainee — plany pary", () => {
  it("lista pary idzie pod `/v1/trainees/{id}/plans` i wraca nietknięta", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, [PLAN_PARY, { ...PLAN_LISTY, basedOnVersion: null }]);
    });

    const wynik = await listPlansForTrainee(api, "t-1");

    expect(sciezka).toBe("/v1/trainees/t-1/plans");
    expect(wynik).toHaveLength(2);
  });

  it("szkic pary to pozycja ze statusem `draft`, a jej brak to `null`", async () => {
    // Cudzy podopieczny daje po stronie BE PUSTĄ listę, nie `404` — więc `null`
    // bierze się stąd naturalnie, bez `orNull`. Test pilnuje obu gałęzi.
    const zeSzkicem = klient(() => json(200, [PLAN_PARY, { ...PLAN_LISTY, basedOnVersion: null }]));
    const bezSzkicu = klient(() => json(200, [{ ...PLAN_LISTY, basedOnVersion: null }]));

    expect((await findDraftForTrainee(zeSzkicem, "t-1"))?.id).toBe("p-2");
    expect(await findDraftForTrainee(bezSzkicu, "t-1")).toBeNull();
  });
});

describe("createBlankPlan — nowy pusty plan", () => {
  it("wysyła wyłącznie `traineeId` i `name`, oddaje identyfikator i `created: true`", async () => {
    // `trainerId` w ciele byłoby polem spoza DTO, czyli `400` (forbidNonWhitelisted).
    let cialo: unknown;
    const api = klient(async (req) => {
      cialo = await req.json();
      return json(201, { id: "p-9" });
    });

    const wynik = await createBlankPlan(api, { traineeId: "t-1", name: "Nowy plan" });

    expect(cialo).toEqual({ traineeId: "t-1", name: "Nowy plan" });
    expect(wynik).toEqual({ id: "p-9", created: true });
  });

  it("`409 PLAN_DRAFT_EXISTS` oddaje istniejący szkic zamiast błędu", async () => {
    // Kontrakt „wskazuje istniejący" (`details.planId`) właśnie po to, żeby
    // trasa miała dokąd przekierować — dzisiejszy pre-check w akcji znika, a
    // wyścig „dwa szkice naraz" domyka unikat po stronie BE.
    const api = klient(() =>
      odmowa(409, "PLAN_DRAFT_EXISTS", "Ten podopieczny ma już szkic planu.", { planId: "p-2" }),
    );

    const wynik = await createBlankPlan(api, { traineeId: "t-1", name: "Nowy plan" });

    expect(wynik).toEqual({ id: "p-2", created: false });
  });

  it("`404` (cudzy podopieczny) zamienia na PlanError do formularza", async () => {
    const api = klient(() => odmowa(404, "RESOURCE_NOT_FOUND", "Nie znaleziono podopiecznego."));

    const blad = await createBlankPlan(api, { traineeId: "t-x", name: "Nowy plan" }).catch(
      (e) => e,
    );

    expect(blad).toBeInstanceOf(PlanError);
    expect((blad as PlanError).userMessage).toBe("Nie znaleziono podopiecznego.");
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: FAIL — `findDraftForTrainee` nie istnieje, `createBlankPlan` bierze `db`.

- [ ] **Krok 3: Dopisz i wymień funkcje w `app/lib/plans.ts`**

Do importów dołóż `plansControllerCreate`, `traineePlansControllerTraineePlans` oraz
`import type { TraineePlanItemView }`. Zamień dotychczasowe `listPlansForTrainee`,
`CreateBlankPlanInput` i `createBlankPlan` na:

```ts
/**
 * Wszystkie plany pary, łącznie z zarchiwizowanymi, malejąco po numerze wersji
 * (`docs/04`: bez stronicowania — zasób nie ma rozmiaru strony). Cudzy
 * podopieczny daje PUSTĄ listę, nie `404` — tak zdecydował kontrakt.
 */
export async function listPlansForTrainee(
  api: Api,
  traineeId: string,
): Promise<TraineePlanItemView[]> {
  const { data } = await traineePlansControllerTraineePlans({
    client: api,
    path: { traineeId },
    throwOnError: true,
  });
  return data;
}

/**
 * Jedyne miejsce, które pyta o szkic pary bez szczegółu planu pod ręką, to
 * odbicie w loaderze `plany.nowy.tsx` przy `?traineeId=`. Edytor bierze szkic
 * z `PlanDetailView.draftId`, a tworzenie — z `409 PLAN_DRAFT_EXISTS`.
 */
export async function findDraftForTrainee(
  api: Api,
  traineeId: string,
): Promise<TraineePlanItemView | null> {
  const plans = await listPlansForTrainee(api, traineeId);
  return plans.find((p) => p.status === "draft") ?? null;
}

export interface CreateBlankPlanInput {
  traineeId: string;
  name: string;
}

export interface CreatePlanResult {
  id: string;
  /** `false`, gdy para miała już szkic — `id` wskazuje wtedy ten istniejący. */
  created: boolean;
}

/**
 * Pusty szkic dla podopiecznego. „Jeden szkic na parę" pilnuje unikat po stronie
 * BE: `409 PLAN_DRAFT_EXISTS` niesie w `details.planId` istniejący szkic (`docs/04`:
 * „odpowiedź wskazuje istniejący"), więc nie ma pre-checku i nie ma wyścigu.
 * Funkcja o nazwie „utwórz" oddająca cudzy identyfikator bez słowa wprowadzałaby
 * w błąd — stąd `created` w wyniku.
 */
export async function createBlankPlan(
  api: Api,
  input: CreateBlankPlanInput,
): Promise<CreatePlanResult> {
  try {
    const { data } = await plansControllerCreate({
      client: api,
      body: { traineeId: input.traineeId, name: input.name },
      throwOnError: true,
    });
    return { id: data.id, created: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.code === "PLAN_DRAFT_EXISTS") {
      const existingId = e.details?.planId;
      if (typeof existingId === "string") return { id: existingId, created: false };
    }
    // Cudzy albo nieistniejący podopieczny — do formularza, komunikatem BE.
    if (e instanceof ApiError && e.status === 404) {
      throw new PlanError(e.code, e.message);
    }
    throw e;
  }
}
```

`nextVersionFor` ma jeszcze wołającego (`createDraftFromActive`, Zadanie 6) — zostaje.

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 5: Przepnij `plany.nowy.tsx`**

Import z `~/lib/plans`: `import { createBlankPlan, type CreatePlanResult, findDraftForTrainee, PlanError } from "~/lib/plans";`.
Z importu `~/lib/trainees` usuń `findTraineeOfTrainer` (zostaje `listTraineesOfTrainer`). Import
`db` zostaje — dla listy podopiecznych, do obszaru „podopieczni".

Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const preselectId = url.searchParams.get("traineeId");

  const trainees = await listTraineesOfTrainer(db, user.id);

  // Preselect the trainee from the query string when it points at one of ours.
  const preselected =
    preselectId != null && trainees.some((t) => t.id === preselectId) ? preselectId : null;

  // Para z istniejącym szkicem — od razu do niego, żeby trener nie próbował
  // tworzyć drugiego (unikat po stronie BE i tak by odmówił).
  if (preselected) {
    const existingDraft = await findDraftForTrainee(api, preselected);
    if (existingDraft) {
      throw redirect(`/trener/plany/${existingDraft.id}`);
    }
  }

  return { trainees, preselected };
}
```

Akcja:

```ts
export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = NewPlanSchema.safeParse({
    traineeId: fd.get("traineeId"),
    name: fd.get("name"),
  });
  if (!parsed.success) {
    return { error: "Sprawdź pola formularza." };
  }

  // Przynależność podopiecznego i „jeden szkic na parę" sprawdza BE: cudzy
  // podopieczny to `404` (komunikat do formularza), istniejący szkic wraca
  // jako `created: false` i prowadzi tam, gdzie prowadził dotychczasowy pre-check.
  let result: CreatePlanResult;
  try {
    result = await createBlankPlan(api, parsed.data);
  } catch (e) {
    if (e instanceof PlanError) return { error: e.userMessage };
    throw e;
  }
  throw redirect(`/trener/plany/${result.id}`);
}
```

`redirect` stoi **poza** `try` — gdyby stał w środku, `catch` musiałby go przepuszczać osobną
gałęzią (pułapka opisana w domknięciu obszaru ćwiczeń).

- [ ] **Krok 6: Przepnij loader `podopieczni.$traineeId.tsx`**

W loaderze (ok. linii 78) zmień destrukturyzację na `const { api, user } = requireUser(…)`
i zamień `const plans = await listPlansForTrainee(db, user.id, traineeId);` na
`const plans = await listPlansForTrainee(api, traineeId);`. `activePlan`/`draftPlan` liczone
z listy bez zmian — `TraineePlanItemView` niesie `id`, `name`, `version`, `basedOnVersion`,
`publishedAt`, `status`, których używa JSX.

- [ ] **Krok 7: Korekta dokumentacji**

`app/lib/README.md`, wiersz `plans.ts`: dopisz `listPlansForTrainee(api, traineeId)`,
`findDraftForTrainee`, `createBlankPlan(api, { traineeId, name })` z `{ id, created }`.
`app/routes/trener/README.md`, wiersz `plany.nowy.tsx`: „odbija do istniejącego draftu" —
dopisz, że przez kontrakt (`409` wskazuje szkic), a przynależność podopiecznego sprawdza BE.

- [ ] **Krok 8: Bramki i commit**

```bash
npx vitest run app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/plans.ts app/lib/plans.test.ts app/routes/trener/plany.nowy.tsx app/routes/trener/podopieczni.\$traineeId.tsx app/lib/README.md app/routes/trener/README.md
git commit -m "feat(plany): nowy plan i plany podopiecznego na kontrakcie"
```

---

### Zadanie 5: Szczegół planu i tryb edytora z `draftId`

**Files:**
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/plany.$planId.tsx` (loader)
- Test: `app/lib/plans.test.ts`

**Interfaces:**
- Consumes: `plansControllerDetail`, typ `PlanDetailView` z `@kalisthenos/api-client`; `orNull`
  z `~/lib/api/client`.
- Produces:
  - `loadPlanForTrainer(api: Api, planId: string): Promise<PlanDetailView | null>` — pełne drzewo
    z `trainee`, `draftId`, `editable`; cudzy albo nieistniejący → `null`.

Dzisiejszy `PlanDetail` (`{ plan, trainee, sessions[{ session, blocks[{ block, items }] }] }`)
znika razem ze starą funkcją — kontrakt oddaje drzewo **płaskie** (`sessions[].blocks[].items[]`,
każdy węzeł z własnymi polami), a jedynym konsumentem jest loader edytora.

- [ ] **Krok 1: Dopisz failujące testy**

Rozszerz import o `loadPlanForTrainer`. Dodaj:

```ts
const SZCZEGOL = {
  id: "p-1",
  name: "Siła 1",
  status: "active",
  version: 2,
  basedOnVersion: 1,
  publishedAt: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-07-20T10:00:00.000Z",
  trainee: { id: "t-1", displayName: "Anna Kowalska" },
  draftId: "p-2",
  editable: false,
  sessions: [
    {
      id: "s-1",
      name: "Dzień A",
      blocks: [
        {
          id: "b-1",
          kind: "single" as const,
          sets: null,
          restSeconds: null,
          items: [
            {
              id: "i-1",
              exerciseId: "e-1",
              exerciseName: "Podciąganie",
              reps: 8,
              unit: "REPS" as const,
              sets: 3,
              restSeconds: 90,
              note: null,
            },
          ],
        },
      ],
    },
  ],
};

describe("loadPlanForTrainer — szczegół planu", () => {
  it("oddaje drzewo z kontraktu razem z `draftId` pary", async () => {
    // `draftId` zastępuje osobne zapytanie „czy para ma już szkic" — loader
    // edytora przekierowuje na nie przy `?edit=1` planu aktywnego.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, SZCZEGOL);
    });

    const wynik = await loadPlanForTrainer(api, "p-1");

    expect(sciezka).toBe("/v1/plans/p-1");
    expect(wynik?.draftId).toBe("p-2");
    expect(wynik?.sessions[0]?.blocks[0]?.items[0]?.exerciseName).toBe("Podciąganie");
  });

  it("`404` daje `null` — sygnatura z `| null` łapie brak zasobu", async () => {
    const api = klient(() => odmowa(404, "PLAN_NOT_FOUND", "Nie znaleziono planu."));

    expect(await loadPlanForTrainer(api, "p-x")).toBeNull();
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: FAIL — `loadPlanForTrainer` bierze `(db, planId, trainerId)`.

- [ ] **Krok 3: Wymień `loadPlanForTrainer` w `app/lib/plans.ts`**

Do importów dołóż `plansControllerDetail`, `import type { PlanDetailView }` oraz
`import { orNull } from "~/lib/api/client";` (obok `import type { Api }`). Usuń interfejs
`PlanDetail` i całą dotychczasową funkcję. W ich miejsce:

```ts
/**
 * Pełne drzewo planu z nazwą podopiecznego i nazwami ćwiczeń, `draftId` pary
 * i `editable` wyliczonym ze stanu (`docs/03` „Plan — edytor"). Cudzy plan jest
 * nieodróżnialny od nieistniejącego — `404`, tu `null`.
 */
export async function loadPlanForTrainer(
  api: Api,
  planId: string,
): Promise<PlanDetailView | null> {
  return await orNull(
    plansControllerDetail({ client: api, path: { id: planId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}
```

Import Drizzle: `inArray` traci użycie w tej funkcji, ale ma jeszcze w `saveDraftPlan` (Zadanie 6) —
sprawdź `grep -n "inArray\|schema.planSessions\|schema.planBlocks\|schema.planItems" app/lib/plans.ts`
i usuń wyłącznie to, co bez użycia.

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 5: Przepnij loader `plany.$planId.tsx`**

Z importu `~/lib/plans` usuń na razie nic poza tym, co loader przestaje wołać (`findAnyDraftFor`
zostaje dla akcji do Zadania 6). Loader w całości:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const planId = args.params.planId ?? "";
  const url = new URL(args.request.url);
  const wantsEdit = url.searchParams.get("edit") === "1";

  const detail = await loadPlanForTrainer(api, planId);
  if (!detail) throw new Response("not found", { status: 404 });

  let mode: PlanRouteMode;
  if (detail.status === "active") {
    if (wantsEdit) {
      // Para ma najwyżej jeden szkic, a kontrakt mówi o nim wprost w `draftId` —
      // edycja aktywnego, gdy szkic istnieje, to praca na tamtym szkicu.
      if (detail.draftId != null) {
        throw redirect(`/trener/plany/${detail.draftId}`);
      }
      mode = "edit-active";
    } else {
      mode = "view-active";
    }
  } else if (detail.status === "draft") {
    mode = "edit-draft";
  } else {
    mode = "view-archived";
  }

  // Exercise library — loaded always; views use it for display names, the
  // editor uses it for the picker.
  const exercises = await listActiveExercisesForTrainer(api);

  // Drzewo z kontraktu jest płaskie (każdy węzeł niesie własne pola), więc
  // mapowanie na `PlanForm` to przepisanie pól — `id` zostają dla edytora
  // (klucze React, śledzenie zmian), a zdejmie je `toSavePlanDto` przy zapisie.
  const initial: PlanForm = {
    name: detail.name,
    sessions: detail.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        kind: b.kind,
        sets: b.sets,
        restSeconds: b.restSeconds,
        items: b.items.map((it) => ({
          id: it.id,
          exerciseId: it.exerciseId,
          sets: it.sets,
          restSeconds: it.restSeconds,
          reps: it.reps,
          unit: it.unit,
          note: it.note,
        })),
      })),
    })),
  };

  return {
    // Komponenty czytają `id`, `name`, `version`, `basedOnVersion`, `publishedAt`
    // — dokładnie te pola, więc kształt dla nich się nie zmienia.
    plan: {
      id: detail.id,
      name: detail.name,
      version: detail.version,
      basedOnVersion: detail.basedOnVersion,
      publishedAt: detail.publishedAt,
    },
    trainee: detail.trainee,
    initial,
    exercises,
    mode,
  };
}
```

Komponenty `PlanEditor` i `PlanView` nie zmieniają się (`plan.publishedAt.toString()` działa dla
napisu).

- [ ] **Krok 6: Korekta dokumentacji**

`app/lib/README.md`, wiersz `plans.ts`: dopisz `loadPlanForTrainer(api, planId)` oddające
`PlanDetailView` z `draftId` (`| null` → `404`); zaznacz, że zapis, szkic z aktywnego i publikacja
są jeszcze na Drizzle. `app/routes/trener/README.md`, wiersz `plany.$planId.tsx`: „leniwe
tworzenie draftu z aktywnego" zostaje; dopisz, że odczyt i tryb idą z kontraktu (`draftId`).

- [ ] **Krok 7: Bramki i commit**

```bash
npx vitest run app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/plans.ts app/lib/plans.test.ts app/routes/trener/plany.\$planId.tsx app/lib/README.md app/routes/trener/README.md
git commit -m "feat(plany): szczegol planu z kontraktu, tryb edytora z draftId"
```

---

### Zadanie 6: Zapis, szkic z aktywnego i publikacja — koniec bazy w edytorze

**Files:**
- Modify: `app/lib/plans.ts`
- Modify: `app/routes/trener/plany.$planId.tsx` (akcja)
- Test: `app/lib/plans.test.ts`

**Interfaces:**
- Consumes: `plansControllerSave`, `plansControllerDraft`, `plansControllerPublish`, typ
  `SavePlanDto` z `@kalisthenos/api-client`; `PlanForm` z `~/lib/plan-types`;
  `loadPlanForTrainer` z Zadania 5.
- Produces:
  - `toSavePlanDto(form: PlanForm): SavePlanDto` — czysta, eksportowana dla testów.
  - `saveDraftPlan(api: Api, planId: string, form: PlanForm): Promise<void>` — `400`/`404`/`409` → `PlanError`.
  - `interface DraftResult { id: string; created: boolean }`
  - `createDraftFromActive(api: Api, sourcePlanId: string): Promise<DraftResult>` — `created`
    z kodu odpowiedzi (`201`/`200`); `404`/`409` → `PlanError`.
  - `publishPlan(api: Api, planId: string): Promise<void>` — `404`/`409` → `PlanError`.

Po tym zadaniu `findAnyDraftFor`, `findDraftBasedOn`, `findPlanStatusForTrainer` i `nextVersionFor`
tracą ostatnich wołających i **znikają**. Edytor nie importuje `db`.

- [ ] **Krok 1: Dopisz failujące testy**

Rozszerz import o `createDraftFromActive`, `publishPlan`, `saveDraftPlan`, `toSavePlanDto`
oraz `import type { PlanForm } from "./plan-types";`. Dodaj:

```ts
function pusto(status: number): Response {
  return new Response(null, { status });
}

const FORMULARZ: PlanForm = {
  name: "Siła 1",
  sessions: [
    {
      id: "tmp-1",
      name: "Dzień A",
      blocks: [
        {
          id: "tmp-2",
          kind: "single",
          sets: 5,
          restSeconds: 120,
          items: [
            {
              id: "tmp-3",
              exerciseId: "e-1",
              reps: 8,
              unit: "REPS",
              sets: 3,
              restSeconds: 90,
              note: undefined,
            },
          ],
        },
        {
          id: "tmp-4",
          kind: "dropset",
          sets: 4,
          restSeconds: 60,
          items: [
            { id: "tmp-5", exerciseId: "e-1", reps: 10, unit: "REPS", sets: 3, restSeconds: 30 },
            { id: "tmp-6", exerciseId: "e-2", reps: 6, unit: "REPS", note: "wolno" },
          ],
        },
      ],
    },
  ],
};

describe("toSavePlanDto — formularz na DTO kontraktu", () => {
  const dto = toSavePlanDto(FORMULARZ);

  it("zdejmuje `id` z sesji, bloków i pozycji", () => {
    // `forbidNonWhitelisted: true` po stronie BE: pole spoza DTO to `400`, nie
    // ciche pominięcie. `PlanForm` jest strukturalnie szerszy niż `SavePlanDto`,
    // więc TypeScript nadmiaru NIE zgłosi — tylko ten test go pilnuje.
    expect(JSON.stringify(dto)).not.toContain('"id"');
  });

  it("single/superset: tempo na pozycjach, blok ma `null`", () => {
    const blok = dto.sessions[0]?.blocks[0];
    expect(blok).toMatchObject({ kind: "single", sets: null, restSeconds: null });
    expect(blok?.items[0]).toEqual({
      exerciseId: "e-1",
      reps: 8,
      unit: "REPS",
      sets: 3,
      restSeconds: 90,
      note: null,
    });
  });

  it("dropset: tempo na bloku, pozycje mają `null`", () => {
    // Ta sama normalizacja, którą do integracji robił `saveDraftPlan` w transakcji
    // — reguła rodzaju bloku nie zmienia właściciela, zmienia tylko miejsce.
    const blok = dto.sessions[0]?.blocks[1];
    expect(blok).toMatchObject({ kind: "dropset", sets: 4, restSeconds: 60 });
    expect(blok?.items.map((i) => [i.sets, i.restSeconds, i.note])).toEqual([
      [null, null, null],
      [null, null, "wolno"],
    ]);
  });
});

describe("saveDraftPlan / createDraftFromActive / publishPlan — zapisy edytora", () => {
  it("zapis to `PUT /v1/plans/{id}` z ciałem po `toSavePlanDto`", async () => {
    let sciezka = "";
    let metoda = "";
    let cialo: unknown;
    const api = klient(async (req) => {
      sciezka = new URL(req.url).pathname;
      metoda = req.method;
      cialo = await req.json();
      return pusto(204);
    });

    await saveDraftPlan(api, "p-2", FORMULARZ);

    expect(metoda).toBe("PUT");
    expect(sciezka).toBe("/v1/plans/p-2");
    expect(cialo).toEqual(toSavePlanDto(FORMULARZ));
  });

  it("zapis: `409 PLAN_NOT_DRAFT` i `400` reguły drzewa idą do formularza jako PlanError", async () => {
    // Trasa pokazuje `userMessage` w formularzu edytora. `400` mapujemy, choć
    // Zod stoi pierwszy — reguły drzewa po stronie BE mogą być ostrzejsze,
    // a jedno zdanie w formularzu jest lepsze niż granica błędu.
    const nieSzkic = klient(() =>
      odmowa(409, "PLAN_NOT_DRAFT", "Zmieniać można wyłącznie szkic planu.", { status: "active" }),
    );
    const drzewo = klient(() =>
      odmowa(
        400,
        "PLAN_BLOCK_CARDINALITY_INVALID",
        "Liczba ćwiczeń w bloku nie pasuje do jego rodzaju.",
      ),
    );

    const bladStatusu = await saveDraftPlan(nieSzkic, "p-1", FORMULARZ).catch((e) => e);
    const bladDrzewa = await saveDraftPlan(drzewo, "p-2", FORMULARZ).catch((e) => e);

    expect(bladStatusu).toBeInstanceOf(PlanError);
    expect((bladStatusu as PlanError).userMessage).toBe("Zmieniać można wyłącznie szkic planu.");
    expect(bladDrzewa).toBeInstanceOf(PlanError);
    expect((bladDrzewa as PlanError).userMessage).toBe(
      "Liczba ćwiczeń w bloku nie pasuje do jego rodzaju.",
    );
  });

  it("szkic z aktywnego: `201` to nowy szkic, `200` to istniejący — jedno wywołanie robi obie rzeczy", async () => {
    // BE sprawdza po kolei: cudzy → 404, para ma szkic → 200 istniejący, źródło
    // nie `active` → 409. Gałąź „użyj istniejącego szkicu" z dawnej akcji
    // edytora jest przez to zbędna.
    let sciezka = "";
    const nowy = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(201, { id: "p-3" });
    });
    const istniejacy = klient(() => json(200, { id: "p-2" }));

    expect(await createDraftFromActive(nowy, "p-1")).toEqual({ id: "p-3", created: true });
    expect(sciezka).toBe("/v1/plans/p-1/draft");
    expect(await createDraftFromActive(istniejacy, "p-1")).toEqual({ id: "p-2", created: false });
  });

  it("szkic z aktywnego: `409 PLAN_NOT_ACTIVE` to PlanError", async () => {
    const api = klient(() =>
      odmowa(409, "PLAN_NOT_ACTIVE", "Szkic można utworzyć wyłącznie z planu aktywnego.", {
        status: "archived",
      }),
    );

    const blad = await createDraftFromActive(api, "p-9").catch((e) => e);

    expect(blad).toBeInstanceOf(PlanError);
    expect((blad as PlanError).userMessage).toBe(
      "Szkic można utworzyć wyłącznie z planu aktywnego.",
    );
  });

  it("publikacja to `POST /v1/plans/{id}/publish`, a `409 PLAN_EMPTY` idzie do formularza", async () => {
    // Reguła, której FE nie miał: BE odmawia publikacji planu bez sesji.
    // Bierzemy komunikat BE dosłownie — ustalenia po tamtej stronie są nadrzędne.
    let sciezka = "";
    const ok = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return pusto(204);
    });
    const pusty = klient(() =>
      odmowa(409, "PLAN_EMPTY", "Nie można opublikować planu bez ani jednej sesji."),
    );

    await publishPlan(ok, "p-2");
    expect(sciezka).toBe("/v1/plans/p-2/publish");

    const blad = await publishPlan(pusty, "p-2").catch((e) => e);

    expect(blad).toBeInstanceOf(PlanError);
    expect((blad as PlanError).userMessage).toBe(
      "Nie można opublikować planu bez ani jednej sesji.",
    );
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: FAIL — `toSavePlanDto` nie istnieje, pozostałe biorą `db`.

- [ ] **Krok 3: Wymień funkcje zapisu w `app/lib/plans.ts`**

Do importów dołóż `plansControllerDraft`, `plansControllerPublish`, `plansControllerSave` oraz
`import type { SavePlanDto }`. Import `import type { PlanForm } from "~/lib/plan-types";` już jest.
Usuń `findDraftBasedOn`, `findAnyDraftFor`, `findPlanStatusForTrainer`, `nextVersionFor` oraz
dotychczasowe `createDraftFromActive`, `saveDraftPlan`, `publishPlan`. W ich miejsce:

```ts
/**
 * Formularz edytora → `SavePlanDto`. Trzy rzeczy, które do integracji robił
 * `saveDraftPlan` w transakcji:
 * 1. zdejmuje `id` sesji, bloków i pozycji — BE ma `forbidNonWhitelisted: true`,
 *    więc pole spoza DTO to `400`; a `PlanForm` jest strukturalnie szerszy niż
 *    DTO, więc TypeScript nadmiaru nie zgłosi;
 * 2. normalizuje tempo per rodzaj bloku: dropset niesie `sets`/`restSeconds` na
 *    bloku, a pozycje mają `null`; single/superset odwrotnie;
 * 3. `undefined` → `null`, bo `PlanItemDto` WYMAGA kluczy `sets`, `restSeconds`,
 *    `note` (nullable, nie opcjonalne).
 */
export function toSavePlanDto(form: PlanForm): SavePlanDto {
  return {
    name: form.name,
    sessions: form.sessions.map((session) => ({
      name: session.name,
      blocks: session.blocks.map((block) => {
        const isDropset = block.kind === "dropset";
        return {
          kind: block.kind,
          sets: isDropset ? (block.sets ?? null) : null,
          restSeconds: isDropset ? (block.restSeconds ?? null) : null,
          items: block.items.map((item) => ({
            exerciseId: item.exerciseId,
            reps: item.reps,
            unit: item.unit,
            sets: isDropset ? null : (item.sets ?? null),
            restSeconds: isDropset ? null : (item.restSeconds ?? null),
            note: item.note ?? null,
          })),
        };
      }),
    })),
  };
}

/**
 * Wąski `catch` zapisów edytora. Trasa pokazuje `userMessage` w formularzu, więc
 * własny typ dostają: `400` (reguły drzewa po stronie BE — Zod stoi pierwszy,
 * ale tamte bywają ostrzejsze), `404` (plan albo ćwiczenie spoza biblioteki —
 * §2 `docs/04` rozciąga „cudzy = nieistniejący" na identyfikatory w ciele) oraz
 * `409` (nie szkic, pusty plan, pusta sesja, nie aktywny). Reszta leci dalej.
 */
function toPlanError(e: unknown): never {
  if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
    throw new PlanError(e.code, e.message);
  }
  throw e;
}

/**
 * Zapis całego drzewa szkicu — wipe & rewrite po stronie BE, identyfikatory sesji
 * nadawane od nowa. Dozwolone wyłącznie dla `draft` (`409 PLAN_NOT_DRAFT`).
 * Zakres tenanta ćwiczeń w drzewie sprawdza BE (`404`), nie ten moduł.
 */
export async function saveDraftPlan(api: Api, planId: string, form: PlanForm): Promise<void> {
  try {
    await plansControllerSave({
      client: api,
      path: { id: planId },
      body: toSavePlanDto(form),
      throwOnError: true,
    });
  } catch (e) {
    toPlanError(e);
  }
}

export interface DraftResult {
  id: string;
  /** `false`, gdy para miała już szkic — BE oddał go zamiast tworzyć drugi. */
  created: boolean;
}

/**
 * Głęboka kopia planu aktywnego jako nowy szkic. BE sprawdza po kolei: cudzy →
 * `404`; para ma szkic → `200` z istniejącym; źródło nie `active` → `409
 * PLAN_NOT_ACTIVE`. Jedno wywołanie zastępuje więc dawną parę
 * `findAnyDraftFor` + `createDraftFromActive`; `created` czyta się z kodu odpowiedzi.
 */
export async function createDraftFromActive(api: Api, sourcePlanId: string): Promise<DraftResult> {
  try {
    const { data, response } = await plansControllerDraft({
      client: api,
      path: { id: sourcePlanId },
      throwOnError: true,
    });
    return { id: data.id, created: response.status === 201 };
  } catch (e) {
    return toPlanError(e);
  }
}

/**
 * Publikacja szkicu; poprzedni aktywny trafia do archiwum atomowo po stronie BE.
 * BE odmawia planowi bez sesji i z pustą sesją (`PLAN_EMPTY`, `PLAN_SESSION_EMPTY`)
 * — reguła, której FE nie miał; komunikat idzie do formularza jak każdy `409`.
 */
export async function publishPlan(api: Api, planId: string): Promise<void> {
  try {
    await plansControllerPublish({ client: api, path: { id: planId }, throwOnError: true });
  } catch (e) {
    toPlanError(e);
  }
}
```

Po tym kroku w pliku nie powinno zostać ani jedno użycie `schema.`, `db.`, `Db` ani importu
z `drizzle-orm` — sprawdź `grep -n "drizzle-orm\|lib/db\|schema\." app/lib/plans.ts` i usuń
importy, które zostały bez użycia (`and`, `count`, `desc`, `eq`, `inArray`, `max`, `type Db`,
`* as schema`). Jeśli grep znajdzie użycie — jest to przeoczona funkcja i Zadanie 7 musi ją
zobaczyć; nie ukrywaj jej usuwaniem importu.

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/plans.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Krok 5: Przepnij akcję `plany.$planId.tsx`**

Import z `~/lib/plans` ma od teraz brzmieć:

```ts
import {
  createDraftFromActive,
  deletePlan,
  loadPlanForTrainer,
  PlanError,
  publishPlan,
  saveDraftPlan,
} from "~/lib/plans";
```

Usuń import `db` (`~/lib/db/client`) — po tym kroku nic w trasie go nie używa. Akcja w całości:

```ts
export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const planId = args.params.planId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "delete") {
      await deletePlan(api, planId);
      throw redirect("/trener/plany");
    }

    // save / publish both need the JSON-encoded plan body.
    const raw = fd.get("plan");
    if (typeof raw !== "string") {
      return { error: "Brak danych formularza." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "Niepoprawny format danych." };
    }
    const validated = PlanFormSchema.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      const path = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
      return {
        error: `${path}${issue?.message ?? "Niektóre pola planu są niepoprawne."}`,
      };
    }

    // Status planu czytamy z pełnego szczegółu — lżejszego odczytu kontrakt nie
    // ma. Edycja aktywnego (leniwy szkic): jedno wywołanie oddaje istniejący
    // szkic pary ALBO tworzy nowy — BE rozstrzyga, nie ta akcja.
    const detail = await loadPlanForTrainer(api, planId);
    if (detail == null) throw new Response("not found", { status: 404 });

    let targetPlanId = planId;
    let wasPromoted = false;

    if (detail.status === "active") {
      const draft = await createDraftFromActive(api, planId);
      targetPlanId = draft.id;
      wasPromoted = true;
    } else if (detail.status === "archived") {
      return { error: "Nie można edytować zarchiwizowanego planu." };
    }

    await saveDraftPlan(api, targetPlanId, validated.data);

    if (intent === "publish") {
      await publishPlan(api, targetPlanId);
      throw redirect("/trener/plany");
    }

    // If we just promoted from active, redirect to the draft URL so subsequent
    // saves operate on the right plan.
    if (wasPromoted) {
      throw redirect(`/trener/plany/${targetPlanId}`);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof PlanError) {
      return { error: e.userMessage };
    }
    throw e;
  }
}
```

`throw redirect(…)` i `throw new Response(…)` stoją wewnątrz `try` tak jak dotychczas — `catch`
przechwytuje **wyłącznie** `PlanError`, wszystko inne rzuca dalej, więc sygnały sterowania
przechodzą. Nie zmieniaj tego na łapanie `Error`.

- [ ] **Krok 6: Potwierdź, że edytor i moduł nie znają bazy**

```bash
grep -rn "drizzle-orm\|lib/db" app/lib/plans.ts app/routes/trener/plany.\$planId.tsx app/routes/trener/plany._index.tsx
```
Expected: brak wyników.

```bash
grep -rn "findAnyDraftFor\|findDraftBasedOn\|findPlanStatusForTrainer\|nextVersionFor\|PlanRepoError\|PlanDetail\b\|PlanListRow\|DeletePlanResult" app/ tests/
```
Expected: brak wyników.

- [ ] **Krok 7: Korekta dokumentacji**

`app/lib/README.md`, wiersz `plans.ts`: zamień zdania o stanie mieszanym na „**w całości na
kontrakcie**" — pełny opis pisze Zadanie 7, tu wystarczy usunąć zdania, które przestały być
prawdziwe (transakcje, wipe-and-rewrite w FE, `PlanRepoError`). `app/routes/trener/README.md`,
wiersz `plany.$planId.tsx`: akcje `save`/`publish`/`delete` przez kontrakt, leniwy szkic jednym
wywołaniem `POST …/draft`.

- [ ] **Krok 8: Bramki i commit**

```bash
npx vitest run app/lib/plans.test.ts --no-file-parallelism
```

```bash
git add app/lib/plans.ts app/lib/plans.test.ts app/routes/trener/plany.\$planId.tsx app/lib/README.md app/routes/trener/README.md
git commit -m "feat(plany): zapis, szkic z aktywnego i publikacja przez kontrakt"
```

---

### Zadanie 7: Sprzątanie, dokumentacja i domknięcie obszaru

**Files:**
- Modify: `app/lib/plans.ts` (ostatnie porządki)
- Modify: `app/lib/README.md`
- Modify: `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`

- [ ] **Krok 1: Ostatni przegląd `app/lib/plans.ts`**

Plik ma zawierać wyłącznie: importy z `@kalisthenos/api-client`, `~/lib/api/client`,
`~/lib/api/errors`, `~/lib/plan-types`; typy `PlanSort`, `PlanStatusFilter`, `PlanListFilter`,
`PlanDeleteOutcome`, `CreateBlankPlanInput`, `CreatePlanResult`, `DraftResult`; klasę `PlanError`;
funkcje `listPlansForTrainer`, `listPlansForTrainee`, `findDraftForTrainee`, `loadPlanForTrainer`,
`createBlankPlan`, `toSavePlanDto`, `saveDraftPlan`, `createDraftFromActive`, `publishPlan`,
`deletePlan` oraz prywatne `toPlanError`. Uporządkuj kolejność: odczyty, potem zapisy, jak
dotychczas. Usuń komentarze sekcji `// ---------------- Reads ----------------`, jeśli zostały
bez sensu po przestawieniu.

```bash
grep -rn "drizzle-orm\|lib/db\|schema\." app/lib/plans.ts app/lib/views.ts
```
Expected: brak wyników.

```bash
grep -rn "countPlansForTrainer\b\|countPlansByStatusForTrainer\|countPlansForTrainerByStatus\|countSessionsInPlan\|countActiveExercisesForTrainer" app/ tests/
```
Expected: brak wyników.

- [ ] **Krok 2: Zaktualizuj `app/lib/README.md`**

Wiersz `plans.ts` opisuje dziś repozytorium Drizzle z transakcjami, `innerJoin` na `users`,
trzema zakresami archiwizacji i wyścigiem na constraincie — po przepięciu **żadne z tych zdań nie
jest prawdziwe**. Zastąp go opisem modułu na kontrakcie:

- **Odczyt:** `listPlansForTrainer(api, { status, q?, sort, page })` — cała strona z kontraktu
  razem z `counts` (liczniki zakładek, zawsze bez zarchiwizowanych, niezależne od filtra
  i szukajki); `listPlansForTrainee(api, traineeId)` — wszystkie plany pary łącznie
  z zarchiwizowanymi, cudzy podopieczny to pusta lista; `findDraftForTrainee`;
  `loadPlanForTrainer(api, planId)` — `PlanDetailView` z `draftId` i `editable`, `| null` mapuje
  `404` przez `orNull`.
- **Zapis:** `createBlankPlan(api, { traineeId, name })` → `{ id, created }` (`409 PLAN_DRAFT_EXISTS`
  wraca jako `created: false` z identyfikatorem istniejącego); `createDraftFromActive(api, id)` →
  `{ id, created }` z kodu odpowiedzi; `saveDraftPlan(api, id, form)` przez `toSavePlanDto`;
  `publishPlan`; `deletePlan(api, id)` → `"deleted" | "archived"` bez liczby logów; `PlanError`
  (`userMessage` z koperty BE).
- **Trzy rzeczy do zapamiętania:** (1) `toSavePlanDto` ZDEJMUJE `id` z drzewa formularza — BE
  odrzuca pola spoza DTO, a typy tego nie zgłoszą; (2) sortowania są identyczne z kontraktem, więc
  nie ma słownika i nie należy go dopisywać; (3) reguły „jeden szkic na parę", „tylko szkic można
  zmieniać", „nie publikuj pustego planu" i wyścig przy usuwaniu mieszkają w BE — moduł tylko
  przekazuje ich komunikaty.
- **Zniknęły bez zamiennika:** `countPlansForTrainer`, `countPlansByStatusForTrainer` (oba
  w `counts` listy), `countPlansForTrainerByStatus` i `countSessionsInPlan` (liczniki przeszły do
  `views.ts`), `findDraftBasedOn`, `findAnyDraftFor`, `findPlanStatusForTrainer` (szczegół niesie
  `draftId` i status), `PlanDetail`, `PlanListRow`, `DeletePlanResult` z `logCount`.

Wiersz `views.ts` (z Zadania 3) — sprawdź, czy nadal prawdziwy. Wiersz `exercises.ts` — bez
`countActiveExercisesForTrainer`.

- [ ] **Krok 3: Zaktualizuj `app/routes/trener/README.md` i `app/routes/podopieczny/README.md`**

Popraw opisy `_layout.tsx`, `_index.tsx`, `plany._index.tsx`, `plany.nowy.tsx`,
`plany.$planId.tsx`, `podopieczni.$traineeId.tsx` (trener) oraz `_layout.tsx` (podopieczny)
wszędzie tam, gdzie mówią o bazie, liczeniu stron w trasie, liczbie logów przy archiwizacji,
pre-checku szkicu albo o licznikach liczonych po jednym na moduł.

- [ ] **Krok 4: Pełne bramki — jedyny raz w całym planie**

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

- [ ] **Krok 5: Commit**

```bash
git add app/lib/plans.ts app/lib/README.md app/routes/trener/README.md app/routes/podopieczny/README.md
git commit -m "chore(plany): usuniecie martwego kodu i aktualizacja dokumentacji obszaru"
```

---

## Domknięcie

Po Zadaniu 7 **drugi obszar kroku 3 Etapu 2 jest zamknięty**: `plans.ts` stoi w całości na
kontrakcie, lista i edytor planów nie znają bazy, a oba layouty i pulpit trenera biorą liczniki
z `views.ts` — jednym wywołaniem na ekran.

**Do sprawdzenia w działającej aplikacji** (Właściciel, Docker — bramki tego nie pokrywają, bo
żadna z nich nie przepuszcza żądania przez prawdziwy router ani przez prawdziwe BE):

1. lista `/trener/plany` — zakładki z licznikami, szukajka po nazwie planu **i** po podopiecznym,
   cztery sortowania, stronicowanie;
2. `/trener/plany/nowy?traineeId=…` dla pary ze szkicem odbija do szkicu; utworzenie nowego
   planu dla pary bez szkicu prowadzi do edytora; próba dla pary ze szkicem (drugie okno) też
   prowadzi do istniejącego szkicu, bez błędu;
3. edycja planu aktywnego (`?edit=1`) → zapis tworzy szkic i przekierowuje; publikacja szkicu
   archiwizuje poprzedni aktywny; **publikacja pustego planu pokazuje komunikat BE w formularzu**
   (nowa reguła, B11);
4. usunięcie planu bez logów kasuje, z logami archiwizuje; komunikat bez liczby sesji (B12);
5. licznik „Plany" w nawigacji trenera **nie liczy zarchiwizowanych** (B6) — dla trenera
   z archiwum liczba spadnie względem stanu sprzed integracji; to zamierzone.

**Co ten obszar zostawia następnym:**

- **`views.ts` jest od teraz miejscem liczników powłoki.** Obszar przepinający swój moduł
  (zgłoszenia, podopieczni; dziennik, sylwetka, konsultacje) USUWA z layoutu funkcję liczącą
  i bierze pole z już pobranego `nav`. Decyzja A5 ćwiczeń jest wycofana — nie odtwarzaj jej.
- **Pulpit trenera** ściąga `GET /v1/trainer/home` po dwie liczby, a klientów, ostatnie treningi
  i sesje tygodnia liczy jeszcze z bazy. Obszar dziennika (następny) zdejmuje te trzy wywołania
  i bierze pola z tego samego widoku; wtedy dochodzi `loadTraineeDashboard` dla pulpitu
  podopiecznego (`GET /v1/me/home`).
- **`plany.nowy.tsx` zostaje mieszany** (`listTraineesOfTrainer(db)` do obszaru „podopieczni"),
  podobnie `podopieczni.$traineeId.tsx` (statystyki, logi, konsultacje, formularz) — kilka
  obszarów po kolei.
- **Wzorzec mapowania formularz → DTO** (`toSavePlanDto`, czysta funkcja, testowana osobno)
  powtórzy się wszędzie tam, gdzie klient edytuje drzewo z tymczasowymi identyfikatorami:
  dziennik treningowy (`POST /v1/workout-logs` z seriami) i harmonogram konsultacji.
- **Wzorzec `{ id, created }`** dla zapisów, które BE potrafi rozstrzygnąć jako „już istnieje"
  (`200`/`201`, `409` ze wskazaniem) — zamiast pre-checków w akcjach tras.
- **Jedyne różnice zachowania wobec stanu sprzed integracji**, wszystkie po stronie BE i wszystkie
  przyjęte świadomie: licznik planów bez archiwum (B6), komunikaty `404`/`409` w brzmieniu BE
  (B4), brak liczby logów przy archiwizacji (B12), odmowa publikacji pustego planu (B11). Razem
  z B4 znikają też trzy inne zdania FE zastąpione brzmieniem BE: „Tylko draft można opublikować."
  (dawny `publishPlan` → `409 PLAN_NOT_DRAFT`), „Niektóre ćwiczenia w planie nie są z Twojej
  biblioteki." (dawny tenant-check w `saveDraftPlan` → `404` z BE) oraz „Podopieczny nie istnieje
  albo nie należy do Ciebie." (dawny pre-check w `plany.nowy.tsx` → `404` z BE).
