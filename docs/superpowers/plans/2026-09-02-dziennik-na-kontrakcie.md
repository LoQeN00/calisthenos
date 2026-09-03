# Dziennik treningowy na kontrakcie BE — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przepiąć obszar „dziennik treningowy" — moduł `app/lib/workouts.ts` (14 funkcji) i dwanaście
tras, które go wołają — z Drizzle na `@kalisthenos/api-client`, razem z pulpitem podopiecznego,
listą podopiecznych trenera i wysyłką nagrań serii. Po tym zadaniu trzeci obszar kroku 3 Etapu 2
jest zamknięty w całości: `workouts.ts` nie importuje Drizzle, a oba pulpity i obie powłoki biorą
wszystko z widoków przekrojowych BE.

**Architecture:** Wzorzec ustalony na `categories.ts`, `exercises.ts` i `plans.ts`: pierwszym
parametrem `api: Api` dokładnie tam, gdzie stało `Db`, wnętrze to wywołanie SDK, a własny typ
błędu (`WorkoutSaveError`, `UploadError`) powstaje **wyłącznie** dla statusów, dla których trasa
ma komunikat w formularzu. Nowe wobec planów są cztery rzeczy: (1) kontrakt rozdziela trasy
podopiecznego (`/v1/me/…`) i trenera (`/v1/trainees/{id}/…`), więc jedna funkcja z parametrem
`viewer` rozpada się na dwie; (2) zapis treningu przechodzi na jedno żądanie z kluczem idempotencji
i oddaje pobite rekordy w odpowiedzi; (3) wysyłka nagrania serii idzie dwufazowo przez kontrakt,
ale trasa zasobowa `/upload/wideo` ZOSTAJE, bo `XMLHttpRequest` z paskiem postępu musi wołać
własny origin; (4) pulpit podopiecznego i powłoka trenera biorą pola z widoków (`GET /v1/me/home`,
`GET /v1/trainer/home`) zamiast z siedmiu funkcji trzech modułów — wzorzec B5 z planów.

**Tech Stack:** React Router 7.15.1 (SSR, `v8_middleware`), `@kalisthenos/api-client` 0.3.0
(hey-api), vitest + happy-dom, zod, biome.

**Spec:** [`docs/superpowers/specs/2026-08-29-integracja-fe-be-design.md`](../specs/2026-08-29-integracja-fe-be-design.md)
— §8 krok 3 („moduły `app/lib` obszar po obszarze", kolejność: ćwiczenia i kategorie, plany,
**dziennik treningowy**, …), §8 krok 4 (pliki: „wysyłka przechodzi na dwufazową … odczyt na podpisany
adres BE"), załącznik A, wiersze `workouts.ts` („12 z 14" — dwie pozostałe, lista klientów
i jej licznik, doszły w Etapie 1 jako `GET /v1/trainees`) i `stats.ts` (`hero`, `thisWeek`,
`heatmap`, `effort` w `GET /v1/me/home`; `personalRecords` z `POST /v1/workout-logs`). Wzorzec
i reguły rozstrzygające zostawiły cztery poprzednie plany:
[`2026-08-31-warstwa-klienta-api-fe.md`](2026-08-31-warstwa-klienta-api-fe.md),
[`2026-09-01-uwierzytelnianie-na-tokenach-be.md`](2026-09-01-uwierzytelnianie-na-tokenach-be.md),
[`2026-09-01-cwiczenia-na-kontrakcie.md`](2026-09-01-cwiczenia-na-kontrakcie.md)
i [`2026-09-02-plany-na-kontrakcie.md`](2026-09-02-plany-na-kontrakcie.md) (decyzja B5 —
widoki przekrojowe; ten plan ją kontynuuje).

Kontrakt czytany ze zrzutu `openapi/openapi.json` w `calisthenos-be` oraz z typów
`node_modules/@kalisthenos/api-client/dist/generated/types.gen.d.ts` (wersja 0.3.0), nie z nazw.

## Global Constraints

- **Branch:** cała praca na `be-integration`. `master` jest gałęzią wdrożeniową realnej produkcji —
  nie commituj tam. **Gita prowadzi Właściciel** (`CLAUDE.md`) — komendy `git` w krokach „Bramki
  i commit" są do wykonania przez niego, nie przez agenta.
- **Komunikaty po polsku, identyfikatory w kodzie po angielsku.** Komentarze po polsku, w stylu
  `app/lib/plans.ts`. **Każdy eksportowany symbol, pole interfejsu i nazwa parametru — po
  angielsku.** W testach nazwy `describe`/`it` i zmienne lokalne są po polsku (wzorzec:
  `plans.test.ts`, `views.test.ts`).
- **Testy:** `globals: false` — importuj `describe`/`it`/`expect` z `vitest` jawnie. Komentarz
  w teście tłumaczy **dlaczego** przypadek istnieje, nie co robi kod.
- **Mock `~/lib/env` JEST potrzebny** w `workouts.test.ts` (od Zadania 5 moduł woła `publicFileUrl`,
  a ten czyta `getEnv().API_PUBLIC_URL`) i w `trainees.test.ts` (`trainees.ts` importuje
  `file-uploads.ts`, który czyta `getEnv()` w `maxUploadBytesFor`). Wzorzec mocka — dosłownie
  z `exercises.test.ts:5-16` (`API_URL: "http://be.internal"`, `API_PUBLIC_URL:
  "https://api.kalisthenos.test"`). `views.test.ts` i `wrapped.test.ts` mocka nie potrzebują.
- **Wywołania SDK potrzebujące `data` muszą podać `throwOnError: true` jawnie** — generyk funkcji
  SDK domyślnie schodzi do `false` i `data` typuje się jako `… | undefined`, mimo że klient i tak
  rzuca. Zero zmiany w czasie wykonania. Wzorzec: `plans.ts:76-90`.
- **Reguła wąskiego `catch`:** moduł zamienia na własny typ błędu **wyłącznie** te statusy, dla
  których trasa ma komunikat. Tu: `WorkoutSaveError` z `400`/`404`/`409` w `saveWorkoutLog`
  (formularz logowania pokazuje `userMessage`) i `UploadError` z `400`/`409`/`413` w `uploadSetVideo`
  (jak `uploadExerciseDemo`). Odczyty nie mapują nic. Każdy inny status leci `ApiError`-em
  do granicy błędu. Awaria BE ma zostać awarią.
- **Reguła rozstrzygająca dla `404`:** sygnatura z `| null` łapie `404` przez `orNull`; każda inna
  pozwala mu lecieć. Wyznacza ją sygnatura, nie ocena piszącego. `409 PLAN_NOT_PUBLISHED` przy
  sesji szkicu NIE jest `404` i leci dalej.
- **Parametry zapytań list:** wartość `all` (filtry `video`, `plan`) to **brak parametru**, a puste
  `q` nie wychodzi wcale — dokładnie jak `status`/`q` w `listPlansForTrainer`. Wartości `sort` są
  w kontrakcie identyczne z zakładkowalnymi adresami list (`date_desc`… / `name_asc`…), więc
  **bez słownika** — nie dopisuj go „dla symetrii".
- **`videoUrl` i `demoUrl` z kontraktu są ŚCIEŻKAMI, nie adresami** (`/v1/files/…`). Origin dokłada
  `publicFileUrl` z `~/lib/api/client` **w module**, nigdy w trasie (wzorzec `withPublicDemoUrl`
  w `exercises.ts`). `signFileUrl` znika z trzech tras dziennika.
- **`forbidNonWhitelisted: true` w `ValidationPipe` BE:** pole spoza DTO to `400`. Ciało
  `POST /v1/workout-logs` składaj **jawnie pole po polu** z `SaveWorkoutLogInput` (Zadanie 7),
  nie przez `...spread` — dzisiejsze `SaveWorkoutLogInput` niesie `trainerId`, `traineeId`,
  `planId`, `sessionName`, których `LogWorkoutDto` **nie ma** (BE wyprowadza je z tokenu i sesji).
- **`TraineeHomeView.activePlan` w SDK ma typ `TraineeActivePlanView | null`** — surowy schemat
  opakowuje go w `allOf` + `nullable`, przez co skrót w zrzucie wygląda jak pusty obiekt. Typ
  z `types.gen.d.ts:1024-1032` jest prawdziwy; nie dopisuj własnego.
- **Nie ruszaj** `app/lib/db/`, `app/lib/files.ts`, `app/lib/storage/*`, `app/lib/orphan-files.ts`,
  `app/root.tsx`, `app/lib/onboarding-forms.ts`, `app/lib/stripe/*`, `app/lib/body-photos.ts`,
  `app/lib/consultations*.ts`, `app/lib/progression.ts`, `app/lib/skill-*.ts`, płatności, ani
  żadnego modułu domenowego poza wymienionymi w „Struktura plików". W `stats.ts`, `wrapped.ts`
  i `trainees.ts` wolno **wyłącznie** to, co ten plan wymienia z nazwy.
- **Testy integracyjne znikają razem z funkcjami, które importują** (spec §10, precedens
  `plans-repo.itest.ts`): `lists-sort-filter-tenant-scope.itest.ts` (Zadanie 3),
  `rpe-toggle.itest.ts` (Zadanie 2), `workout-video-ids.itest.ts` (Zadanie 7),
  `upload-wideo.itest.ts` (Zadanie 8) — każdy z odpowiednim wierszem w `tests/README.md`.
  `statystyki-redystrybucja.itest.ts` jest **przycinany**, nie kasowany (Zadanie 2): traci blok
  pulpitu podopiecznego, zachowuje bloki przeglądu klienta trenera, których ten obszar nie rusza.
  Gwarancje bazodanowe (zakres tenanta, filtry, porządek, własność nagrań) są od teraz po stronie BE.
- **Każde zadanie utrzymuje PRAWDZIWOŚĆ wpisów dokumentacji** — wierszy dotkniętych modułów
  w `app/lib/README.md` oraz dotkniętych tras w `app/routes/README.md`,
  `app/routes/trener/README.md` i `app/routes/podopieczny/README.md`. Moduł jest przez osiem zadań
  w stanie mieszanym, więc wpis ma mówić, co już stoi na kontrakcie, a co jeszcze na Drizzle.
  Krótko — jedno–dwa zdania korekty. Pełny, końcowy opis pisze dopiero Zadanie 9.
- **Każde zadanie usuwa importy, które właśnie osierociło.** `workouts.ts` traci funkcje bazodanowe
  po kawałku, więc po każdym zadaniu część importów Drizzle (`gte`, `desc`, `ilike`, `or`, `exists`,
  `not`, `notExists`, `asc`, `count`, `sql`, `inArray`, `and`, `eq`) przestaje mieć użycie. **Nie łapie
  tego żadna bramka** (`noUnusedImports` nie należy do zestawu `recommended` biome 1.9.4). Po
  wymianie ciała funkcji przejrzyj import Drizzle i wyrzuć symbole bez użycia. To samo dotyczy tras:
  `db` z `~/lib/db/client` zostaje w trasie **tylko** wtedy, gdy jakaś funkcja spoza tego obszaru
  nadal go bierze (płatności, formularz startowy, konsultacje, statystyki przeglądu klienta,
  `getTraineeOfTrainer`).
- **Bramki: lekkie, jeden przebieg na zadanie, pełne wyłącznie u Właściciela.** Pełny zestaw
  (`tsc` + cała suita) po każdym kroku dwukrotnie zawiesił maszynę Właściciela (02.09.2026). Dlatego:
  - **TDD bez przebiegu czerwonego:** test powstaje PRZED kodem (krok „Napisz test"), ale
    uruchamiasz go **raz, po implementacji** — krok „Uruchom test" jest ostatnim krokiem
    zadania, nie drugim. Drugi przebieg wyłącznie po czerwonym pierwszym; zero powtórek
    „na wszelki wypadek";
  - **w trakcie zadania** wyłącznie plik(i) testowe wymienione w kroku bramek, jednowątkowo:
    `npx vitest run <plik> --no-file-parallelism`, plus `npx biome format --write <dotknięte pliki>`;
  - **`npm run typecheck`, `npm run lint`, `npx vitest run app --no-file-parallelism`,
    `npm run build` — NIE uruchamia ich agent.** Uruchamia je Właściciel, sam, na checkpointach:
    sugerowane po Zadaniu 5 (odczyty domknięte) i po Zadaniu 9 (koniec obszaru). Każde zadanie
    przenosi funkcję **razem z jej wywołaniami**, więc drzewo po zadaniu jest budowalne, a ryzyko
    ogranicza się do literówek w polach — tanich do naprawienia jedną rundą po checkpoincie.
- Bramka `app/routes/no-direct-db.test.ts` ma zostać zielona przez cały czas — trasy nie zaczynają
  wołać klienta wprost, wołają go przez moduł.
- Do czytania plików używaj Read/Grep/Glob, nie `cat`/`grep -r` w Bash (`CLAUDE.md`).

---

## Decyzje obszaru

Wyprowadzone z odczytu kontraktu (`openapi/openapi.json`, `types.gen.d.ts` klienta 0.3.0,
`libs/workout-log/**`, `libs/analytics/**`, `libs/files/**` w `calisthenos-be`, `docs/03` i `docs/04`)
i obu stron kodu, nie z nazw.

| # | Decyzja | Uzasadnienie |
|---|---|---|
| **C1** | Sygnatury tracą `traineeId`/`trainerId`/`viewer` | zakres tenanta niesie token, BE go egzekwuje (A1 ćwiczeń, B1 planów). `loadLogForViewer(db, id, { role })` nie ma sensu, odkąd rola jest LISTĄ (ADR-0013): kontrakt ma osobne trasy podopiecznego (`/v1/me/workout-logs/{id}`) i trenera (`/v1/trainees/{id}/workout-logs/{id}`), więc powstają **dwie** funkcje: `loadMyLog(api, id)` i `loadTraineeLog(api, traineeId, id)`. Tak samo listy: `listMyLogs` / `listTraineeLogs` |
| **C2** | Listy to jedna strona z kontraktu; `countLogsForTrainee` i `countClientsForTrainer` **znikają** | `WorkoutLogListPage` i `TraineeListPage` niosą `items`, `page`, `totalPages`, `total`; rozmiary stron (20 logów, 30 podopiecznych) i przycięcie `page` spoza zakresu są po stronie BE (`docs/04` §5). Sortowania: pięć wartości dziennika i pięć listy podopiecznych są w kontrakcie DOKŁADNIE te z adresów list — bez słownika. Cudzy podopieczny w `listTraineeLogs` to PUSTA strona, nie `404` (docblock trasy) — o `404` decyduje `getTraineeOfTrainer` wołane wcześniej w tej samej trasie |
| **C3** | `listClientsForTrainer` przechodzi do `trainees.ts` jako `listClientsForTrainer(api, opts)` | zasób to `GET /v1/trainees` (dodany w Etapie 1 dla tej funkcji), po stronie BE model odczytu żyje w `analytics` (przekracza granicę kontekstu — ADR-0009). W FE od początku mieszkał w `workouts.ts` tylko dlatego, że liczył sesje. `trainees.ts` staje się modułem mieszanym (jak `file-uploads.ts`) — obszar „podopieczni" zdejmie resztę. **Widoczna różnica:** `sessionCount` liczy WYŁĄCZNIE treningi u tego trenera (docblock `TrainerClientItem`: legacy grupowało po `trainee_id`, więc po zmianie trenera nowy widział dorobek u poprzedniego — `docs/04` Część V) |
| **C4** | Pulpity i powłoki z widoków przekrojowych (B5, ciąg dalszy) | `views.ts` dostaje `loadTraineeDashboard(api)` (`GET /v1/me/home`). Pulpit trenera bierze z `loadTrainerDashboard` także `clients`, `recentLogs` (6, `performed_on desc`) i `weekSessions` (od `dziś − 7 dni` włącznie — tak samo liczył `countLogsForTrainerSince`, docblock `TrainerHomeView.weekSessions`); powłoka podopiecznego bierze `nav.workoutLogs`. **Znikają bez zamiennika:** `listRecentLogsForTrainer`, `countLogsForTrainerSince`, `loadActivePlanSummaryForTrainee`, `countLogsForTrainee` (workouts); `getHeroStats`, `getThisWeekStats`, `getEffortBalance`, `computeStreak`, `computeLongestStreak`, `detectNewPRsForLog` (stats); `getAvailableWrappedMonths`, `getLatestAvailableWrapped` (wrapped). `getActivityHeatmap` i `HeatmapDay` **zostają** — woła je przegląd klienta trenera (obszar „podopieczni") |
| **C5** | Komponent `trainee-stats.tsx` przechodzi na typy kontraktu; `ThisWeekCard` czyta `sessions` | `TraineeHeroView` i `TraineeEffortView` są polami identyczne z `HeroStats`/`EffortBalance`, ale `TraineeThisWeekView` nazywa licznik `sessions`, nie `thisWeek`. BE nadrzędne — zmienia się komponent, nie moduł (moduły widoków nie mapują: „oddają widok BE takim, jaki przyszedł", `views.test.ts`). `HeatmapDay` zostaje typem z `stats.ts`, bo mapę trenera nadal liczy Drizzle |
| **C6** | Sesja do logowania: `loadSessionForLogging(api, sessionId)` + czysta `toLoggingEntries(session)`; `findActivePlanForTrainee` **znika** | `GET /v1/me/plan/sessions/{sessionId}` oddaje sesję z jednostką, flagą RPE i podpisanym demo per pozycja. Przynależność sesji do planu aktywnego ALBO archiwalnego tej pary rozstrzyga BE (zaległy trening ze starszej wersji planu jest legalny — `docs/01` §D; sesja szkicu: `409 PLAN_NOT_PUBLISHED`; cudza/nieistniejąca: `404`). Trasa przestaje pytać „jaki jest aktywny plan" — pyta „daj mi tę sesję". Spłaszczenie do `LoggingEntry` (dropset: liczba serii z BLOKU, pozycje mają `sets: null`) było dotąd zaszyte w zapytaniu i nie miało testu; teraz jest czystą funkcją. Kształt `LoggingEntry` zostaje — formularz i akcja czytają go bez zmian |
| **C7** | Zapis: `saveWorkoutLog(api, input, { idempotencyKey })` → `CreatedWorkoutLogView`; `assertOwnedUnclaimedVideos`, `findUnusableVideoIds`, `detectNewPRsForLog` **znikają** | jedno żądanie, atomowe po stronie BE, oddaje log RAZEM z `personalRecords` — toast rekordów bierze identyfikatory stamtąd, nie z osobnego zapytania po zapisie. Do BE przeszły: własność i dostępność nagrań (`409 SET_VIDEO_UNAVAILABLE` — jedna odmowa na cztery powody, żeby cudze było nieodróżnialne od nieistniejącego), przynależność ćwiczeń do sesji (`409 EXERCISE_NOT_IN_SESSION`), reguły oceny trudności (`409 DIFFICULTY_*`), data z przyszłości (`400 PERFORMED_ON_IN_FUTURE`, ADR-0027), pusty trening (`409 EMPTY_WORKOUT_LOG`). Walidacja pól formularza w trasie **zostaje pierwszą linią** — jej komunikaty nazywają ćwiczenie i numer serii, czego BE nie składa. Ćwiczenie bez ani jednej serii (pominięte w całości) nadal idzie z `sets: []` — DTO `LogWorkoutExerciseDto.sets` ma `@IsArray()` bez `@ArrayNotEmpty()`, pusta lista jest legalna; `@ArrayNotEmpty()` stoi wyłącznie na `exercises`. Sprawdzenie `user.trainerId` w akcji i trasie wysyłki znika — czy podopieczny bez trenera może logować, rozstrzyga BE |
| **C8** | Klucz idempotencji: loader nadaje `crypto.randomUUID()`, ukryte pole `idempotencyKey`, akcja wysyła nagłówek `Idempotency-Key` | `docs/04` §6: zapis treningu jest TĄ operacją, dla której klucz istnieje — „klient może ponowić po zerwaniu połączenia". FE ma już szkic w `sessionStorage` i przycisk blokowany na czas wysyłki, czyli broni się przed podwójnym zapisem po stronie UI; klucz domyka to po stronie serwera: powtórzenie oddaje pierwotny `201`, nigdy drugi log (`IdempotencyKeyClash` jest sygnałem wewnętrznym BE i do HTTP nie dociera — `libs/workout-log/CLAUDE.md`). Klucz żyje tyle, ile jedno wyświetlenie formularza; po udanym zapisie przekierowanie opuszcza stronę. Nagłówek typuje SDK: `WorkoutLogsControllerCreateData.headers['Idempotency-Key']` |
| **C9** | Szczegół logu bez liczby oczekiwanych serii; pominięte serie z luk w `ordinal`, ogon z `allDone` | `WorkoutLogDetailView` nie niesie `expectedSets`/`expectedReps` (`docs/03` „Trening — szczegół": log z pełnym drzewem serii, nic o planie). Wiersze rysuje się od `0` do najwyższego zalogowanego `ordinal` — luka w środku to „Pominięta" (bez „plan: N powt."). Pominiętych na końcu nie da się policzyć; zamiast „N pominiętych" nagłówek dostaje „nie wszystkie serie wykonane", gdy `allDone === false` — to pole kontrakt niesie właśnie po to. Dzisiejszy kod ma już gałąź „plan info unavailable" (`expectedSets: 0`), więc obraz dla starych logów był identyczny |
| **C10** | Nazwa podopiecznego na ekranie logu trenera z `getTraineeOfTrainer(db, …)` (`trainees.ts`, obszar „podopieczni") | kontrakt nie niesie jej ani w `WorkoutLogDetailView`, ani w `TraineeOverviewView`; jedyne miejsce to lista `GET /v1/trainees`. Do przepięcia obszaru „podopieczni" nazwa idzie z bazy — to jedyny powód, dla którego `db` zostaje w tej trasie. Luka zgłoszona niżej. Dotychczasowe `detail.log.traineeId !== traineeId` w trasie znika: parę (podopieczny, log) sprawdza BE (`404`) |
| **C11** | Wysyłka nagrania serii: `uploadSetVideo(api, file)` w `file-uploads.ts`; trasa `/upload/wideo` zostaje trasą zasobową FE | dwie fazy jak w demo (`POST /v1/files/set-video` → `POST /v1/files/{id}/confirm`), wspólna prywatna ścieżka `uploadThroughContract` zamiast drugiej kopii `uploadExerciseDemo`. Trasa zostaje, bo `VideoUploadField` wysyła `XMLHttpRequest`em z paskiem postępu na ten sam origin, a BE nie ma CORS-u i nie jest wołany z przeglądarki (D3 specu); komponent i jego kontrakt JSON (`{ fileId }` / `{ error }`) nie zmieniają się. **Do BE przechodzą:** bramka formularza startowego (`403 ONBOARDING_FORM_PENDING` — `OnboardingGuard` obejmuje wysyłki, ADR-0025), limit liczby wysyłek (`429` + `Retry-After`, kluczowany tożsamością — ADR-0031) i typ po zawartości. Odmowy BE wracają do XHR jako JSON z komunikatem BE i **tym samym statusem**. Bramka płatności (`hasTraineeAppAccess(db)`) zostaje — płatności są poza zakresem integracji |
| **C12** | `rate-limit.ts` znika razem z testem | `/upload/wideo` był ostatnim konsumentem (`login.tsx` oddał limit prób BE w kroku 2). Spec §8: „`rate-limit` znika bez zamiennika, bo to praca, którą BE wykonuje u siebie" |
| **C13** | `Response` przepuszczany w `catch` trasy zasobowej | `apiMiddleware` kończy martwą sesję rzucając `Response` z przekierowaniem PRZEZ interceptor klienta (`api/client.ts:38-46`). W akcji `/upload/wideo` `catch` musi to przepuścić (`if (err instanceof Response) throw err;`) PRZED mapowaniem `ApiError` — inaczej przekierowanie na `/login` zamieniłoby się w JSON `500` „Nie udało się wgrać nagrania" |
| **C14** | BE nadrzędne: FE kurczy się do kontraktu bez dodatkowych wywołań; osiem widocznych ubytków spisanych niżej | każdy z nich to pole, którego kontrakt nie niesie. Dołożenie go jest **addytywne** po stronie BE (`docs/04` §7) i tanie; dokładanie drugiego wywołania po stronie FE łamałoby „jedno wywołanie na ekran" i utrwalało dług tam, gdzie nie jego miejsce. Precedens: B12 (komunikat stracił liczbę logów), A7 (komunikat stracił nazwę umiejętności) |

## Luki kontraktu — do decyzji Właściciela (wszystkie addytywne po stronie BE)

FE po tym planie pokazuje mniej, niż pokazywał na bazie. Każda pozycja to jedno–dwa pola w DTO
po stronie `calisthenos-be`; po ich dołożeniu FE odzyskuje treść jednym małym zadaniem.

| # | Ekran | Co znika | Skąd by wróciło |
|---|---|---|---|
| L1 | pulpit podopiecznego (`podopieczny/_index`) | w wierszu ostatniego treningu liczba ćwiczeń i średnia trudność | `exerciseCount`, `avgDifficulty` w `TraineeRecentLogItem` |
| L2 | pulpit podopiecznego | w karcie aktywnego planu wersja i data publikacji | `version`, `publishedAt` w `TraineeActivePlanView` |
| L3 | lista sesji (`podopieczny/sesje`) | plakietka „×N"/„nowa" i „Ostatnio N dni temu" per sesja | `logCount`, `lastPerformedOn` w `PlanTreeSessionView` (`GET /v1/me/plan`) — pulpit już je ma w `TraineePlanSessionItem` |
| L4 | lista sesji i szczegół sesji | opis ćwiczenia (`exercises.description`) | `description` w `PlanTreeItemView`/`SessionItemView` |
| L5 | szczegół sesji (`podopieczny/sesje/:id`) | nazwa planu w okruszkach i numer sesji w nagłówku | `planName`, `ordinal` w `SessionDetailView` |
| L6 | lista podopiecznych (`trener/podopieczni`) i pulpit trenera | nazwa aktywnego planu (zostaje plakietka „aktywny plan") i „od <data dołączenia>" | `activePlanName`, `joinedOn` w `TraineeListItem`/`TrainerClientItem` |
| L7 | szczegół logu (oba ekrany) | liczba oczekiwanych serii i „plan: N powt." przy pominiętej serii (C9) | `expectedSets`, `expectedReps` w `WorkoutLogExerciseView` |
| L8 | szczegół logu u trenera | nazwa podopiecznego przychodzi z bazy (C10) | `trainee: { id, displayName }` w `WorkoutLogDetailView` trasy trenera albo w `TraineeOverviewView` |
| L9 | szczegół sesji (`podopieczny/sesje/:id`) | sesja planu ARCHIWALNEGO (osiągalna po id od Zadania 6; `docs/01` §D) rysuje się jak bieżąca — kontrakt przewiduje oznaczenie „sesja ze starszej wersji planu" (`SessionDetailView.planStatus`), FE go nie pokazuje | decyzja produktowa Właściciela: plakietka przy `planStatus === "archived"` (dane już są) — dodatek po stronie FE, nie BE |
| L10 | formularz logowania (`podopieczny/loguj/:id`) | klucz idempotencji (C8) żyje jeden render: chroni drugie kliknięcie i ponowiony `fetch` tego samego formularza, ale NIE ponowienie po przemontowaniu trasy (powrót po `ErrorBoundary` ze szkicem z `sessionStorage` dostaje nowy klucz) — dokładnie scenariusz z `docs/04` §6, który legacy też zakładał drugi log | zapis klucza razem ze szkicem w `sessionStorage` (`app/lib/log-draft.ts`) i użycie go zamiast klucza z loadera przy przywróceniu — dodatek po stronie FE; osobne zadanie po decyzji Właściciela |

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/workouts.ts` (przepisanie) | moduł na kliencie: `listMyLogs`, `listTraineeLogs`, `loadMyLog`, `loadTraineeLog`, `loadMyActivePlan`, `loadSessionForLogging`, `toLoggingEntries`, `saveWorkoutLog`, `WorkoutSaveError`, `LoggingEntry` |
| `app/lib/workouts.test.ts` (przepisanie) | testy modułu przeciw podstawionemu klientowi; blok `findUnusableVideoIds` znika w Zadaniu 7 |
| `app/lib/trainees.ts` (zmiana) | dochodzi `listClientsForTrainer(api, opts)` — pierwszy odczyt tego modułu na kontrakcie; reszta na Drizzle |
| `app/lib/trainees.test.ts` (nowy) | testy listy podopiecznych |
| `app/lib/views.ts` (zmiana) | dochodzi `loadTraineeDashboard(api)` (`GET /v1/me/home`) |
| `app/lib/views.test.ts` (zmiana) | dochodzi test adresu pulpitu podopiecznego |
| `app/lib/stats.ts` (zmiana) | znikają `getHeroStats`, `getThisWeekStats`, `getEffortBalance`, `detectNewPRsForLog` z interfejsami oraz `computeStreak`, `computeLongestStreak`; **`getActivityHeatmap` zostaje** |
| `app/lib/wrapped.ts` (zmiana) | znikają `getAvailableWrappedMonths`, `getLatestAvailableWrapped`, `AvailableMonth`; dochodzi czysta `latestWrappedMonth` |
| `app/lib/wrapped.test.ts` (nowy) | test `latestWrappedMonth` |
| `app/lib/file-uploads.ts` (zmiana) | dochodzi `uploadSetVideo(api, file)`; `uploadExerciseDemo` dzieli z nią prywatną `uploadThroughContract` |
| `app/lib/file-uploads.test.ts` (zmiana) | dochodzi blok `uploadSetVideo` |
| `app/lib/rate-limit.ts`, `app/lib/rate-limit.test.ts` (usunięcie) | ostatni konsument odszedł (C12) |
| `app/components/trainee-stats.tsx` (zmiana) | typy z kontraktu; `ThisWeekCard` czyta `sessions` |
| `app/routes/podopieczny/_layout.tsx` (zmiana) | licznik historii z `nav.workoutLogs` |
| `app/routes/podopieczny/_index.tsx` (zmiana) | cały pulpit z `loadTraineeDashboard`; znika import `db` |
| `app/routes/podopieczny/sesje._index.tsx` (zmiana) | `loadMyActivePlan`; znika import `db` |
| `app/routes/podopieczny/sesje.$sessionId.tsx` (zmiana) | `loadSessionForLogging`; znikają `db` i `signFileUrl` |
| `app/routes/podopieczny/loguj.$sessionId.tsx` (zmiana) | odczyt sesji i zapis przez kontrakt, klucz idempotencji, rekordy z odpowiedzi; znika `db` |
| `app/routes/podopieczny/historia._index.tsx` (zmiana) | `listMyLogs`; znika `db` |
| `app/routes/podopieczny/historia.$logId.tsx` (zmiana) | `loadMyLog`; znikają `db` i `signFileUrl` |
| `app/routes/trener/_index.tsx` (zmiana) | cały pulpit z `loadTrainerDashboard`; znika `db` |
| `app/routes/trener/podopieczni._index.tsx` (zmiana) | lista z `listClientsForTrainer(api)`; `db` zostaje (zaproszenia) |
| `app/routes/trener/podopieczni.$traineeId.tsx` (zmiana) | logi z `listTraineeLogs(api)`; reszta loadera zostaje na bazie (inne obszary) |
| `app/routes/trener/podopieczni.$traineeId.log.$logId.tsx` (zmiana) | `loadTraineeLog`; `db` wyłącznie dla `getTraineeOfTrainer` (C10); znika `signFileUrl` |
| `app/routes/upload.wideo.tsx` (zmiana) | `uploadSetVideo`; znikają bramka formularza, limit wysyłek, `uploadFile` |
| `app/routes/upload.wideo.test.ts` (nowy) | test trasy zasobowej: JSON i statusy dla XHR |
| `tests/lists-sort-filter-tenant-scope.itest.ts`, `tests/rpe-toggle.itest.ts`, `tests/workout-video-ids.itest.ts`, `tests/upload-wideo.itest.ts` (usunięcie) | nie ma czego integrować (spec §10) |
| `tests/statystyki-redystrybucja.itest.ts` (zmiana) | znika blok pulpitu podopiecznego |
| `tests/README.md`, `app/lib/README.md`, `app/routes/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `CLAUDE.md`, `docs/superpowers/plans/README.md` (zmiana) | dokumentacja |

**Kolejność zadań nie jest dowolna:** odczyty idą przed zapisem, a każde zadanie przenosi funkcję
**razem z jej wywołaniami**, żeby drzewo po zadaniu było budowalne. Formularz logowania przechodzi
w dwóch zadaniach: Zadanie 6 przepina odczyt sesji (zapis zostaje na bazie, bo `SessionDetailView`
niesie `planId`), Zadanie 7 przepina zapis. Dzięki temu `findActivePlanForTrainee` i stary
`loadSessionForLogging(db, …)` znikają w Zadaniu 6, a `saveWorkoutLog(db, …)` w Zadaniu 7 — każde
z kompletem wołających.

---

### Zadanie 1: Pulpit trenera i powłoka podopiecznego z widoków

**Files:**
- Modify: `app/lib/views.ts` (dochodzi `loadTraineeDashboard`)
- Modify: `app/lib/views.test.ts` (dochodzi jeden test)
- Modify: `app/routes/trener/_index.tsx`
- Modify: `app/routes/podopieczny/_layout.tsx`
- Modify: `app/lib/workouts.ts` (znikają `RecentLogRow`, `listRecentLogsForTrainer`, `countLogsForTrainerSince`)
- Modify: `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`

**Interfaces:**
- Consumes: `trainerViewsControllerDashboard`, `traineeViewsControllerDashboard`,
  `traineeViewsControllerNavigation` i typy `TrainerHomeView`, `TraineeHomeView`, `TraineeNavView`
  z `@kalisthenos/api-client`; `loadTrainerDashboard`, `loadTraineeNavigation` już istniejące w `views.ts`.
- Produces:
  - `loadTraineeDashboard(api: Api): Promise<TraineeHomeView>` — `{ activePlan: TraineeActivePlanView | null, recentLogs, hero, thisWeek, heatmap, effort, wrappedMonths }` (Zadanie 2 na tym stoi).

To jest decyzja C4 w części trenera: pulpit trenera brał z widoku dwie liczby, a klientów, ostatnie
treningi i sesje tygodnia liczył z bazy „do czasu przepięcia dziennika". Ten czas nadszedł — trzy
funkcje bazodanowe znikają, a trasa przestaje importować `db`. W powłoce podopiecznego migracja
licznika to — jak zapowiedział B5 — **usunięcie** wywołania i wzięcie pola z `nav`.

- [ ] **Krok 1: Napisz test pulpitu podopiecznego w `app/lib/views.test.ts`**

Dopisz import `loadTraineeDashboard` do istniejącego importu z `./views` oraz fikstury i przypadek
na końcu istniejącego `describe`:

```ts
const PULPIT_PODOPIECZNEGO = {
  activePlan: null,
  recentLogs: [],
  hero: {
    totalSessions: 0,
    totalReps: 0,
    totalSecondsUnderTension: 0,
    streakWeeks: 0,
    longestStreakWeeks: 0,
    journeyDayNumber: 0,
    firstSessionOn: null,
  },
  thisWeek: { sessions: 0, avgPerWeek: 0 },
  heatmap: [],
  effort: { easy: 0, mid: 0, hard: 0, total: 0, verdict: "no-data" },
  wrappedMonths: [],
};
```

```ts
  it("pulpit podopiecznego to `GET /v1/me/home`, a brak planu zostaje `null`", async () => {
    // Do integracji ten ekran składał się z ośmiu zapytań; teraz jest jednym
    // widokiem. `activePlan: null` znaczy „trener nic nie opublikował" — moduł
    // nie zamienia go na pusty obiekt, bo pulpit rysuje wtedy inny stan.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, PULPIT_PODOPIECZNEGO);
    });

    const wynik = await loadTraineeDashboard(api);

    expect(wynik.activePlan).toBeNull();
    expect(wynik.thisWeek.sessions).toBe(0);
    expect(sciezka).toBe("/v1/me/home");
  });
```

- [ ] **Krok 2: Dopisz `loadTraineeDashboard` w `app/lib/views.ts`**

Rozszerz oba importy z `@kalisthenos/api-client` o `traineeViewsControllerDashboard` i typ
`TraineeHomeView`. Popraw docblock `loadTrainerDashboard` — zdanie o „cenie jednego pełnego widoku
za dwie liczby" przestaje być prawdą:

```ts
/**
 * Pulpit trenera: klienci (`sessionCount` liczony WYŁĄCZNIE z treningów u tego
 * trenera), sześć ostatnich treningów, liczniki planów i sesje tygodnia — od
 * `dziś − 7 dni` włącznie, tak samo jak liczył dawny `countLogsForTrainerSince`.
 * Jedno wywołanie na ekran; trasa nie dotyka już bazy.
 */
export async function loadTrainerDashboard(api: Api): Promise<TrainerHomeView> {
```

Na końcu pliku:

```ts
/**
 * Pulpit podopiecznego: aktywny plan z liczbą wykonań per sesja, pięć ostatnich
 * treningów, wskaźniki (hero, ten tydzień, mapa aktywności, bilans wysiłku)
 * i miesiące z gotowym podsumowaniem — wszystko, co `podopieczny/_index` do
 * integracji składał z ośmiu zapytań trzech modułów. `activePlan` jest `null`,
 * gdy trener nic nie opublikował; moduł tego nie skleja.
 */
export async function loadTraineeDashboard(api: Api): Promise<TraineeHomeView> {
  const { data } = await traineeViewsControllerDashboard({ client: api, throwOnError: true });
  return data;
}
```

- [ ] **Krok 3: Przepnij `app/routes/trener/_index.tsx`**

Usuń importy `db` (`~/lib/db/client`), `countLogsForTrainerSince`/`listClientsForTrainer`/
`listRecentLogsForTrainer` (`~/lib/workouts` — cały ten import, razem z jego nietypowym miejscem
po stałej `OSOBA_AKTYWNA`) oraz funkcję `isoDaysAgo`. Loader w całości:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });

  // Jedno wywołanie na ekran (B5): klienci, sześć ostatnich treningów i trzy
  // liczniki przychodzą razem. Okno „sesje w 7 dni" liczy BE — od `dziś − 7 dni`
  // włącznie, dokładnie jak liczył `countLogsForTrainerSince`.
  const dashboard = await loadTrainerDashboard(api);

  return {
    user,
    clients: dashboard.clients,
    recentLogs: dashboard.recentLogs,
    stats: {
      activePlans: dashboard.activePlans,
      drafts: dashboard.drafts,
      weekSessions: dashboard.weekSessions,
    },
  };
}
```

W komponencie dwie zmiany w liście klientów (`clients.slice(0, 6).map`):
`{c.activePlanName != null ? c.activePlanName : "brak planu"}` →
`{c.hasActivePlan ? "aktywny plan" : "brak planu"}` (kontrakt nie niesie nazwy planu — luka L6)
oraz `c.lastSession` → `c.lastSessionOn`. `recentLogs` mają w kontrakcie dokładnie te pola, które
komponent czyta (`id`, `performedOn`, `sessionName`, `traineeId`, `traineeName`) — bez zmian.

- [ ] **Krok 4: Przepnij `app/routes/podopieczny/_layout.tsx`**

Usuń import `countLogsForTrainee` (`~/lib/workouts`) i linię `const logCount = await
countLogsForTrainee(db, user.id, {});`. W `tails` zamień `history: logCount` na
`history: nav.workoutLogs`. Popraw komentarz nad `loadTraineeNavigation`: „cztery pozostałe
liczniki zostają na bazie" → „trzy pozostałe liczniki (zdjęcia, konsultacje, zgłoszenia) zostają
na bazie do swoich obszarów". Import `db` **zostaje** — bramki i trzy liczniki innych obszarów.

- [ ] **Krok 5: Usuń trzy osierocone funkcje z `app/lib/workouts.ts`**

Usuń `RecentLogRow`, `listRecentLogsForTrainer` i `countLogsForTrainerSince` (sekcja
„Trainer-side trainee aggregation", wiersze 719–758). Import Drizzle: `gte` miało użycie wyłącznie
w `countLogsForTrainerSince` — usuń je; `desc` zostaje (`listLogsForTrainee` do Zadania 3).

Sprawdź przez Grep w `app/`: `listRecentLogsForTrainer|countLogsForTrainerSince|RecentLogRow`
— Expected: brak wyników poza `app/lib/README.md` (poprawiane w kroku 6).

- [ ] **Krok 6: Korekta dokumentacji**

`app/lib/README.md`: w wierszu `views.ts` dopisz `loadTraineeDashboard(api)` (`GET /v1/me/home`)
i zdanie „pulpit trenera bierze stąd już wszystko: klientów, ostatnie treningi, liczniki". W wierszu
`workouts.ts` usuń zdanie o `listRecentLogsForTrainer(...)` i `countLogsForTrainerSince(...)`, dopisz
na początku: „**Pulpit trenera i licznik historii w powłoce podopiecznego przeszły na `views.ts`**;
reszta jeszcze na Drizzle." `app/routes/trener/README.md`, wiersz `_index.tsx`: „Pulpit: klienci,
6 ostatnich sesji i liczniki (aktywne plany, szkice, sesje 7-dniowe) — wszystko jednym wywołaniem
`loadTrainerDashboard` (`lib/views`); trasa nie dotyka bazy." `app/routes/podopieczny/README.md`,
wiersz `_layout.tsx`: „liczy logi" → „licznik historii z `nav.workoutLogs`"; zostaw resztę.

- [ ] **Krok 7: Bramki i commit**

```bash
npx vitest run app/lib/views.test.ts --no-file-parallelism
npx biome format --write app/lib/views.ts app/lib/views.test.ts app/lib/workouts.ts app/routes/trener/_index.tsx app/routes/podopieczny/_layout.tsx
```

Expected: PASS (cztery przypadki). Commit (Właściciel):

```bash
git add app/lib/views.ts app/lib/views.test.ts app/lib/workouts.ts app/routes/trener/_index.tsx app/routes/podopieczny/_layout.tsx app/lib/README.md app/routes/trener/README.md app/routes/podopieczny/README.md
git commit -m "feat(dziennik): pulpit trenera i licznik historii z widokow BE"
```

---

### Zadanie 2: Pulpit podopiecznego na `GET /v1/me/home`

**Files:**
- Modify: `app/routes/podopieczny/_index.tsx`
- Modify: `app/components/trainee-stats.tsx` (typy z kontraktu, `ThisWeekCard`)
- Modify: `app/lib/stats.ts` (znikają `getHeroStats`, `HeroStats`, `getThisWeekStats`, `ThisWeekStats`, `getEffortBalance`, `EffortBalance`, `computeStreak`, `computeLongestStreak`)
- Modify: `app/lib/wrapped.ts` (znikają `getAvailableWrappedMonths`, `getLatestAvailableWrapped`, `AvailableMonth`; dochodzi `latestWrappedMonth`)
- Create: `app/lib/wrapped.test.ts`
- Modify: `app/lib/workouts.ts` (znika `loadActivePlanSummaryForTrainee`)
- Delete: `tests/rpe-toggle.itest.ts`
- Modify: `tests/statystyki-redystrybucja.itest.ts`, `tests/README.md`
- Modify: `app/lib/README.md`, `app/routes/podopieczny/README.md`

**Interfaces:**
- Consumes: `loadTraineeDashboard(api)` z Zadania 1; typy `TraineeHeroView`, `TraineeThisWeekView`,
  `TraineeEffortView`, `TraineeWrappedMonthItem` z `@kalisthenos/api-client`.
- Produces:
  - `latestWrappedMonth(months: readonly TraineeWrappedMonthItem[]): TraineeWrappedMonthItem | null`
  - komponenty `HeroStatsCard({ hero: TraineeHeroView })`, `ThisWeekCard({ thisWeek: TraineeThisWeekView })`,
    `EffortBalanceCard({ effort: TraineeEffortView })`; `ActivityHeatmapCard({ days: HeatmapDay[] })` bez zmian.

Decyzje C4 (część podopiecznego) i C5. Osiem funkcji trzech modułów zastępuje jeden widok. Trzy
funkcje `stats.ts` i dwie `wrapped.ts` tracą jedynego wołającego — znikają, razem z testami
integracyjnymi, które je importują. `getActivityHeatmap` ZOSTAJE (przegląd klienta trenera).

- [ ] **Krok 1: Napisz `app/lib/wrapped.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { latestWrappedMonth } from "./wrapped";

// `wrapped.ts` importuje schemat i `type Db` — nic, co dotyka bazy przy imporcie,
// więc czysta funkcja testuje się bez mocków.
describe("latestWrappedMonth — najświeższy miesiąc podsumowań", () => {
  it("wybiera najpóźniejszy miesiąc po `ym`, niezależnie od kolejności w liście", () => {
    // Porządek `wrappedMonths` z kontraktu nie jest częścią kontraktu. Baner
    // „świeży wrapped" ma pokazać ostatni zamknięty miesiąc, nie pierwszy
    // element tablicy — inaczej zmiana `ORDER BY` po stronie BE cofnęłaby baner
    // o rok bez żadnego błędu.
    const miesiace = [
      { ym: "2026-06", year: 2026, month: 6, label: "czerwiec 2026", sessions: 4 },
      { ym: "2026-08", year: 2026, month: 8, label: "sierpień 2026", sessions: 9 },
      { ym: "2026-07", year: 2026, month: 7, label: "lipiec 2026", sessions: 2 },
    ];

    expect(latestWrappedMonth(miesiace)?.ym).toBe("2026-08");
  });

  it("pusta lista daje `null` — baner się nie renderuje", () => {
    expect(latestWrappedMonth([])).toBeNull();
  });
});
```

- [ ] **Krok 2: Wymień funkcje miesięcy w `app/lib/wrapped.ts`**

Usuń `AvailableMonth`, `getAvailableWrappedMonths` i `getLatestAvailableWrapped` (sekcja
„Available months", wiersze 63–118). Dodaj `import type { TraineeWrappedMonthItem } from
"@kalisthenos/api-client";` i w miejscu usuniętej sekcji:

```ts
// ============================================================
// Available months — lista przychodzi z kontraktu (`GET /v1/me/home`), tu
// zostaje wyłącznie wybór najświeższego miesiąca pod baner pulpitu.
// ============================================================

/**
 * Najświeższy miesiąc z listy podsumowań — napędza baner „świeży wrapped".
 * Porządek `wrappedMonths` z kontraktu nie jest częścią kontraktu, więc wybór
 * idzie po `ym` (`YYYY-MM` porównuje się leksykograficznie), nie po pozycji.
 */
export function latestWrappedMonth(
  months: readonly TraineeWrappedMonthItem[],
): TraineeWrappedMonthItem | null {
  let latest: TraineeWrappedMonthItem | null = null;
  for (const month of months) {
    if (latest == null || month.ym > latest.ym) latest = month;
  }
  return latest;
}
```

Sprawdź import Drizzle na górze pliku (`and`, `eq`, `gte`, `sql`) — usuń symbole, których nie używa
już żadna z pozostałych funkcji (`getMonthlyWrapped` i jej pomocnicze). `isPastMonth`, `monthLabel`,
`formatYM`, `parseYM` zostają (woła je `wrapped.$ym.tsx` i `getMonthlyWrapped`).

- [ ] **Krok 3: Przepnij `app/components/trainee-stats.tsx` na typy kontraktu**

Zamień import typów:

```ts
import type { TraineeEffortView, TraineeHeroView, TraineeThisWeekView } from "@kalisthenos/api-client";
import type { HeatmapDay } from "~/lib/stats";
```

W sygnaturach: `HeroStatsCard({ hero }: { hero: TraineeHeroView })`,
`ThisWeekCard({ thisWeek }: { thisWeek: TraineeThisWeekView })`,
`EffortBalanceCard({ effort }: { effort: TraineeEffortView })`. W `ThisWeekCard` każde
`thisWeek.thisWeek` (cztery wystąpienia: `aboveAvg` i trzy gałęzie `message`) → `thisWeek.sessions`.
`ActivityHeatmapCard` bez zmian — `TraineeHeatmapDayItem` jest strukturalnie tym samym co `HeatmapDay`,
a mapę trenera nadal liczy `stats.ts`.

- [ ] **Krok 4: Przepnij `app/routes/podopieczny/_index.tsx`**

Importy: usuń `db` (`~/lib/db/client`), cały import z `~/lib/stats`, `listLogsForTrainee`/
`loadActivePlanSummaryForTrainee` (`~/lib/workouts`), `getAvailableWrappedMonths`/
`getLatestAvailableWrapped` (`~/lib/wrapped`) i `fmtDate` (zostają `daysAgo`, `fmtDateShort`). Dodaj
`import { loadTraineeDashboard } from "~/lib/views";` i `import { latestWrappedMonth } from "~/lib/wrapped";`.
Loader w całości:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainee" });

  // Jedno wywołanie na ekran (B5): do integracji ten loader składał pulpit
  // z ośmiu zapytań trzech modułów. `activePlan` niesie liczbę wykonań per
  // sesja, `recentLogs` pięć ostatnich treningów, `wrappedMonths` listę
  // podsumowań; baner „świeży wrapped" bierze z niej najpóźniejszy miesiąc,
  // a klient sam wycisza go po obejrzeniu albo odrzuceniu (localStorage).
  const home = await loadTraineeDashboard(api);

  return {
    user,
    activePlan: home.activePlan,
    recent: home.recentLogs,
    hero: home.hero,
    thisWeek: home.thisWeek,
    heatmap: home.heatmap,
    effort: home.effort,
    wrappedMonths: home.wrappedMonths,
    latestWrapped: latestWrappedMonth(home.wrappedMonths),
  };
}
```

W komponencie `TraineeDashboard`: destrukturyzacja `planSummary` → `activePlan`. Dalej, po kolei:

1. Przycisk „Zarejestruj sesję" w nagłówku i sekcja „Sesje w planie": warunek
   `planSummary != null && planSummary.sessions.length > 0` → `activePlan != null && activePlan.sessions.length > 0`.
2. Karta aktywnego planu (`planSummary == null ? … : …`): warunek na `activePlan == null`; wewnątrz
   usuń cały `<span className="mono" …>v{…}{publishedAt && …}</span>` (kontrakt nie niesie wersji
   ani daty — luka L2); `{planSummary.plan.name}` → `{activePlan.name}`; `{planSummary.sessions.length}`
   → `{activePlan.sessions.length}`.
3. Lista sesji: `planSummary.sessions.map((s, idx) => …)` → `activePlan.sessions.map((s, idx) => …)`;
   `key={s.session.id}` → `key={s.id}`; `{s.session.name}` → `{s.name}`; `s.doneCount` (dwa razy) →
   `s.logCount`; `s.lastPerformedOn` bez zmian; oba `to={…${s.session.id}}` → `${s.id}`.
4. Wiersz historii (`recent.map`): zostaw datę i `log.sessionName`; usuń drugi wiersz
   (`<div className="text-xs muted" …>{log.exerciseCount} ćwiczeń · trudność …</div>`) w całości —
   `TraineeRecentLogItem` niesie tylko `id`, `performedOn`, `sessionName` (luka L1).

`WrappedBanner` nie zmienia się: `NonNullable<…["latestWrapped"]>` to teraz `TraineeWrappedMonthItem`,
który ma `ym`, `label`, `sessions`. `<WrappedListRow months={wrappedMonths} />` też — prop jest
strukturalny.

- [ ] **Krok 5: Usuń osierocone funkcje z `app/lib/stats.ts` i `app/lib/workouts.ts`**

`stats.ts`: usuń `HeroStats`, `getHeroStats`, `computeStreak`, `computeLongestStreak`, `ThisWeekStats`,
`getThisWeekStats`, `EffortBalance`, `getEffortBalance` — razem z docblockami. **Zostają**
`HeatmapDay` i `getActivityHeatmap`. Potem prywatne pomocnicze z góry pliku (np. `mondayOf`,
`isoDaysAgo`): dla każdej sprawdź przez Grep w `app/lib/stats.ts`, czy ma jeszcze użycie; bez użycia —
usuń. Import Drizzle — to samo.

`workouts.ts`: usuń `loadActivePlanSummaryForTrainee` (wiersze 70–117). `findActivePlanForTrainee`
zostaje (do Zadania 6). Import Drizzle bez zmian — `count`, `sql`, `inArray` mają inne użycia.

Sprawdź przez Grep w `app/`: `getHeroStats|getThisWeekStats|getEffortBalance|computeStreak|computeLongestStreak|loadActivePlanSummaryForTrainee|getAvailableWrappedMonths|getLatestAvailableWrapped|AvailableMonth`
— Expected: brak wyników poza `app/lib/README.md` (krok 7).

- [ ] **Krok 6: Testy integracyjne**

Usuń `tests/rpe-toggle.itest.ts` (importuje `saveWorkoutLog`, `listLogsForTrainee`, `getEffortBalance`
— trzecia właśnie zniknęła, dwie pierwsze zmieniają sygnaturę w Zadaniach 3 i 7) i jego wiersz
w `tests/README.md`.

W `tests/statystyki-redystrybucja.itest.ts` usuń cały blok
`describe("podopieczny dashboard: hero / heatmap / effort są powiązane z traineeId", …)` (wiersze
292–~335, do końca pliku włącznie z jego zamknięciem) oraz z importu `~/lib/stats` symbole
`getActivityHeatmap`, `getEffortBalance`, `getHeroStats` (w tym pliku używał ich wyłącznie usunięty
blok; potwierdź Grepem). Bloki `getHealthStats` / `getPlateauExercises` / `getTagDistribution`
i przekierowań zostają nietknięte.

- [ ] **Krok 7: Korekta dokumentacji**

`app/lib/README.md`: wiersz `stats.ts` — z listy usuń `getHeroStats`, `getThisWeekStats`,
`getEffortBalance`, `computeStreak`, `computeLongestStreak` i dopisz „(pulpit podopiecznego bierze
hero/tydzień/mapę/bilans z `views.ts`; `getActivityHeatmap` zostaje dla przeglądu klienta trenera)".
Wiersz `wrapped.ts`: „dostępne miesiące" → „`latestWrappedMonth` (czysty wybór najświeższego
miesiąca z listy kontraktu; sama lista przychodzi w `GET /v1/me/home`)". Wiersz `workouts.ts`:
dopisz `loadActivePlanSummaryForTrainee` do „zniknęły". `app/routes/podopieczny/README.md`, wiersz
`_index.tsx`: „Pulpit — w całości jednym wywołaniem `loadTraineeDashboard` (`lib/views`): hero,
„ten tydzień", heatmapa, bilans wysiłku, aktywny plan z liczbą wykonań per sesja, 5 ostatnich
logów, miesiące Wrapped; trasa nie dotyka bazy."

- [ ] **Krok 8: Bramki i commit**

```bash
npx vitest run app/lib/wrapped.test.ts --no-file-parallelism
npx biome format --write app/lib/wrapped.ts app/lib/wrapped.test.ts app/lib/stats.ts app/lib/workouts.ts app/components/trainee-stats.tsx app/routes/podopieczny/_index.tsx tests/statystyki-redystrybucja.itest.ts
```

```bash
git add app/lib/wrapped.ts app/lib/wrapped.test.ts app/lib/stats.ts app/lib/workouts.ts app/components/trainee-stats.tsx app/routes/podopieczny/_index.tsx tests/rpe-toggle.itest.ts tests/statystyki-redystrybucja.itest.ts tests/README.md app/lib/README.md app/routes/podopieczny/README.md
git commit -m "feat(dziennik): pulpit podopiecznego z widoku GET /v1/me/home"
```

---

### Zadanie 3: Listy logów — jedna strona z kontraktu

**Files:**
- Modify: `app/lib/workouts.ts` (dochodzą `listMyLogs`, `listTraineeLogs`; znikają `WorkoutLogListItem`, `listLogsForTrainee`, `countLogsForTrainee`, stare `LogListOpts`)
- Modify: `app/lib/workouts.test.ts` (nowa część; blok `findUnusableVideoIds` zostaje do Zadania 7)
- Modify: `app/routes/podopieczny/historia._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx` (wyłącznie część logów)
- Delete: `tests/lists-sort-filter-tenant-scope.itest.ts`
- Modify: `tests/README.md`, `app/lib/README.md`, `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`

**Interfaces:**
- Consumes: `myWorkoutLogsControllerMine`, `traineeWorkoutLogsControllerList` i typ `WorkoutLogListPage`
  z `@kalisthenos/api-client`.
- Produces:
  - `type LogSort = "date_desc" | "date_asc" | "hardest" | "easiest" | "sets_desc"` (bez zmian — słownik URL-a, identyczny z kontraktem)
  - `type VideoFilter = "all" | "with" | "without"`
  - `interface LogListOpts { page: number; sort: LogSort; q?: string; video?: VideoFilter }`
  - `listMyLogs(api: Api, opts: LogListOpts): Promise<WorkoutLogListPage>`
  - `listTraineeLogs(api: Api, traineeId: string, opts: LogListOpts): Promise<WorkoutLogListPage>`

Decyzje C1 i C2. `WorkoutLogListItem` z kontraktu ma dokładnie pola dzisiejszego interfejsu
(`id`, `performedOn`, `sessionName`, `note`, `exerciseCount`, `setCount`, `hasVideo`, `avgDifficulty`),
więc komponenty obu list nie zmieniają się wcale — zmienia się wyłącznie loader.

- [ ] **Krok 1: Napisz testy list w `app/lib/workouts.test.ts`**

Na górze pliku, PRZED istniejącym importem `findUnusableVideoIds`, dodaj mock `~/lib/env`
(dosłownie z `exercises.test.ts:5-16`; potrzebny od Zadania 5, ale kładziony raz), importy
i pomocnicze:

```ts
import { describe, expect, it, vi } from "vitest";

// Od Zadania 5 moduł woła `publicFileUrl` (origin dla podpisanych ścieżek nagrań),
// a ten czyta `getEnv().API_PUBLIC_URL`. Wzorzec i uzasadnienie: `exercises.test.ts`.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    MAX_UPLOAD_BYTES: 250_000_000,
    MAX_VIDEO_UPLOAD_BYTES: 30_000_000,
    API_URL: "http://be.internal",
    API_PUBLIC_URL: "https://api.kalisthenos.test",
  }),
}));

import { createApiClient } from "./api/client";
import { findUnusableVideoIds, listMyLogs, listTraineeLogs } from "./workouts";

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

// Koperta błędu BE: `{ error: { code, message, details } }` — to, co rozbiera `parseApiError`.
function odmowa(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, details } });
}

const LOG_LISTY = {
  id: "l-1",
  performedOn: "2026-08-30",
  sessionName: "Push A",
  note: null,
  exerciseCount: 4,
  setCount: 12,
  hasVideo: true,
  avgDifficulty: 6.5,
};

function strona(items: unknown[], page = 1, totalPages = 1, total = items.length) {
  return { items, page, totalPages, total };
}

describe("listMyLogs / listTraineeLogs — historia na kontrakcie", () => {
  it("własna historia idzie pod `/v1/me/workout-logs` z sortowaniem i stroną bez tłumaczenia", async () => {
    // Adresy list są zakładkowalne (`?sort=hardest`), a kontrakt nazywa sortowania
    // DOKŁADNIE tak samo — słownika nie ma i test pilnuje, żeby nikt go nie dopisał.
    let sciezka = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.search;
      return json(200, strona([LOG_LISTY]));
    });

    await listMyLogs(api, { page: 2, sort: "hardest", q: "Push", video: "with" });

    expect(sciezka).toBe("/v1/me/workout-logs");
    expect(zapytanie).toContain("page=2");
    expect(zapytanie).toContain("sort=hardest");
    expect(zapytanie).toContain("q=Push");
    expect(zapytanie).toContain("video=with");
  });

  it("`video: all` i puste `q` nie trafiają do zapytania", async () => {
    // `all` to brak zawężenia, a puste `q=` znaczy „szukaj pustego łańcucha",
    // nie „bez filtra" — ten sam wzorzec co `status`/`q` w planach.
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([LOG_LISTY]));
    });

    await listMyLogs(api, { page: 1, sort: "date_desc", q: "", video: "all" });

    expect(zapytanie).not.toContain("video=");
    expect(zapytanie).not.toContain("q=");
  });

  it("strona wraca z kontraktu nietknięta — liczb stron moduł nie przelicza", async () => {
    // Do integracji trasa liczyła `safePage` z osobnego licznika. Teraz `page`
    // spoza zakresu przycina BE, a `total` przychodzi razem z listą.
    const api = klient(() => json(200, strona([LOG_LISTY], 3, 3, 41)));

    const wynik = await listMyLogs(api, { page: 99, sort: "date_desc" });

    expect(wynik.page).toBe(3);
    expect(wynik.totalPages).toBe(3);
    expect(wynik.total).toBe(41);
    expect(wynik.items).toEqual([LOG_LISTY]);
  });

  it("historia podopiecznego u trenera idzie pod `/v1/trainees/{id}/workout-logs`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, strona([]));
    });

    const wynik = await listTraineeLogs(api, "t-1", { page: 1, sort: "sets_desc" });

    expect(sciezka).toBe("/v1/trainees/t-1/workout-logs");
    // Cudzy podopieczny daje po stronie BE PUSTĄ stronę, nie `404` — moduł oddaje
    // ją jak każdą inną; o `404` decyduje wcześniejszy `getTraineeOfTrainer` w trasie.
    expect(wynik.items).toEqual([]);
  });
});
```

Istniejący `describe("findUnusableVideoIds", …)` zostaje pod spodem bez zmian (znika w Zadaniu 7).

- [ ] **Krok 2: Wymień funkcje list w `app/lib/workouts.ts`**

Na górze pliku, obok dotychczasowych importów Drizzle (te znikną do Zadania 7):

```ts
import {
  myWorkoutLogsControllerMine,
  traineeWorkoutLogsControllerList,
} from "@kalisthenos/api-client";
import type { WorkoutLogListPage } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
```

Zamień `WorkoutLogListItem`, `LogListOpts`, `listLogsForTrainee` i `countLogsForTrainee`
(sekcja „Workout log lists + detail", wiersze 316–486, **bez** `WorkoutLogDetail`/`loadLogForViewer`,
które zostają do Zadania 5) na:

```ts
export type LogSort = "date_desc" | "date_asc" | "hardest" | "easiest" | "sets_desc";
export type VideoFilter = "all" | "with" | "without";

export interface LogListOpts {
  page: number;
  sort: LogSort;
  q?: string;
  /** Domyślnie `all` — wtedy parametr nie idzie do kontraktu. */
  video?: VideoFilter;
}

function logListQuery(opts: LogListOpts) {
  return {
    page: opts.page,
    sort: opts.sort,
    // `all` to BRAK parametru (wzorzec `status` w planach); puste `q=` znaczy
    // „szukaj pustego łańcucha", więc też nie wychodzi. Rozłożone warunkowo, nie
    // przez `q: opts.q`: klucz z `undefined` i brak klucza to dla serializatora
    // zapytań dwie różne rzeczy.
    ...(opts.video != null && opts.video !== "all" ? { video: opts.video } : {}),
    ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
  };
}

/**
 * Własna historia podopiecznego — cała strona z kontraktu (`items`, `page`,
 * `totalPages`, `total`), więc `countLogsForTrainee` znika bez zamiennika, a rozmiar
 * strony (20) i przycięcie `page` spoza zakresu należą do BE (`docs/04` §5).
 * Wartości `sort` są identyczne z zakładkowalnym adresem listy, więc — jak
 * w planach — nie ma słownika. Lista niesie wyłącznie `hasVideo`; podpisany adres
 * nagrania przychodzi dopiero w szczególe.
 */
export async function listMyLogs(api: Api, opts: LogListOpts): Promise<WorkoutLogListPage> {
  const { data } = await myWorkoutLogsControllerMine({
    client: api,
    query: logListQuery(opts),
    throwOnError: true,
  });
  return data;
}

/**
 * Historia podopiecznego oglądana przez trenera — te same filtry. Cudzy
 * podopieczny daje PUSTĄ stronę, nie `404` (tak zdecydował kontrakt), więc
 * o `404` decyduje wcześniejsze `getTraineeOfTrainer` w tej samej trasie.
 */
export async function listTraineeLogs(
  api: Api,
  traineeId: string,
  opts: LogListOpts,
): Promise<WorkoutLogListPage> {
  const { data } = await traineeWorkoutLogsControllerList({
    client: api,
    path: { traineeId },
    query: logListQuery(opts),
    throwOnError: true,
  });
  return data;
}
```

Import Drizzle: `ilike`, `asc` i `desc` miały użycie wyłącznie w usuniętych funkcjach list —
sprawdź Grepem każdy z nich w `app/lib/workouts.ts` i usuń te bez użycia (`count`, `sql`, `inArray`,
`or`, `exists`, `not`, `notExists`, `and`, `eq` mają jeszcze użycia w `listClientsForTrainer`,
`loadLogForViewer`, `assertOwnedUnclaimedVideos`).

- [ ] **Krok 3: Przepnij `app/routes/podopieczny/historia._index.tsx`**

Usuń import `db` i stałą `PAGE_SIZE`. Import z `~/lib/workouts`:
`import { listMyLogs, type LogSort, type VideoFilter } from "~/lib/workouts";`. Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);

  // Jedno żądanie zamiast dwóch: strona przychodzi razem z `total`, a `page`
  // spoza zakresu przycina BE — dawne `safePage` nie ma już czego liczyć.
  const result = await listMyLogs(api, {
    page,
    sort: controls.sort as LogSort,
    q: controls.q,
    video: (controls.filters.video ?? "all") as VideoFilter,
  });

  return {
    logs: result.items,
    spec,
    controls,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  };
}
```

Komponent bez zmian.

- [ ] **Krok 4: Przepnij część logów w `app/routes/trener/podopieczni.$traineeId.tsx`**

Import z `~/lib/workouts`: `import { listTraineeLogs, type LogSort, type VideoFilter } from "~/lib/workouts";`.
Usuń stałą `LOGS_PAGE_SIZE`. W loaderze: z `Promise.all` usuń pierwszy element
(`countLogsForTrainee(db, traineeId, { q: controls.q, video })`) i `totalLogs` z destrukturyzacji;
zmień typ `video` na `VideoFilter`. Blok liczący strony i wołający `listLogsForTrainee`
(wiersze 124–133) zamień na:

```ts
  const logPage = await listTraineeLogs(api, traineeId, {
    page: logsPage,
    sort: controls.sort as LogSort,
    q: controls.q,
    video,
  });
```

W zwracanym obiekcie: `logs: logPage.items`, `logsPage: logPage.page`,
`totalLogPages: logPage.totalPages`, `totalLogs: logPage.total`. Reszta loadera (statystyki,
konsultacje, formularz, `getTraineeOfTrainer`) bez zmian — `db` zostaje. Komponent bez zmian.

- [ ] **Krok 5: Usuń `tests/lists-sort-filter-tenant-scope.itest.ts` i jego wiersz w `tests/README.md`**

Plik importuje `listLogsForTrainee`, `countLogsForTrainee` (właśnie zniknęły)
i `listClientsForTrainer` (zmienia sygnaturę w Zadaniu 4).

- [ ] **Krok 6: Korekta dokumentacji**

`app/lib/README.md`, wiersz `workouts.ts`: „**Listy logów stoją już na kontrakcie**:
`listMyLogs(api, { page, sort, q?, video? })` i `listTraineeLogs(api, traineeId, …)` oddają całą
stronę (`countLogsForTrainee` zniknęło); reszta jeszcze na Drizzle." `app/routes/podopieczny/README.md`,
wiersz `historia._index.tsx`: „paginacja 20" → „stronicowanie po stronie BE, trasa nie dotyka bazy".
`app/routes/trener/README.md`, wiersz `podopieczni.$traineeId.tsx`: „logi z szukajka + sort + filtr
wideo (…, paginacja 20)" → „logi z kontraktu (`listTraineeLogs(api)`, stronicowanie po stronie BE)".

- [ ] **Krok 7: Bramki i commit**

```bash
npx vitest run app/lib/workouts.test.ts --no-file-parallelism
npx biome format --write app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/historia._index.tsx app/routes/trener/podopieczni.\$traineeId.tsx
```

```bash
git add app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/historia._index.tsx app/routes/trener/podopieczni.\$traineeId.tsx tests/lists-sort-filter-tenant-scope.itest.ts tests/README.md app/lib/README.md app/routes/podopieczny/README.md app/routes/trener/README.md
git commit -m "feat(dziennik): listy logow na kontrakcie, jedna strona zamiast listy i licznika"
```

---

### Zadanie 4: Lista podopiecznych trenera z `GET /v1/trainees`

**Files:**
- Modify: `app/lib/trainees.ts` (dochodzi `listClientsForTrainer(api, opts)` z typami)
- Create: `app/lib/trainees.test.ts`
- Modify: `app/lib/workouts.ts` (znikają `ClientStats`, `ClientSort`, `ClientListOpts`, `listClientsForTrainer`, `countClientsForTrainer`)
- Modify: `app/routes/trener/podopieczni._index.tsx`
- Modify: `app/lib/README.md`, `app/routes/trener/README.md`

**Interfaces:**
- Consumes: `traineeListControllerQuery` i typ `TraineeListPage` z `@kalisthenos/api-client`.
- Produces (w `trainees.ts`):
  - `type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest"` (bez zmian)
  - `type PlanFilter = "all" | "with" | "without"`
  - `interface ClientListOpts { page: number; sort: ClientSort; q?: string; plan?: PlanFilter }`
  - `listClientsForTrainer(api: Api, opts: ClientListOpts): Promise<TraineeListPage>` — pozycje
    `{ id, displayName, sessionCount, lastSessionOn, hasActivePlan }`.

Decyzja C3. Funkcja zmienia dom: zasób to podopieczni, nie dziennik. `TraineeListItem` nie niesie
nazwy aktywnego planu ani daty dołączenia (luka L6) — komponent pokazuje plakietkę „aktywny plan"
i traci wiersz „od <data>".

- [ ] **Krok 1: Napisz `app/lib/trainees.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

// `trainees.ts` importuje `file-uploads.ts` (`deleteFileBlob`), a ten czyta `getEnv()`
// w `maxUploadBytesFor`. Bez mocka test wysadza się na braku zmiennych środowiskowych.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    MAX_UPLOAD_BYTES: 250_000_000,
    MAX_VIDEO_UPLOAD_BYTES: 30_000_000,
    API_URL: "http://be.internal",
    API_PUBLIC_URL: "https://api.kalisthenos.test",
  }),
}));

import { createApiClient } from "./api/client";
import { listClientsForTrainer } from "./trainees";

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

const PODOPIECZNY = {
  id: "t-1",
  displayName: "Anna Kowalska",
  sessionCount: 12,
  lastSessionOn: "2026-08-30",
  hasActivePlan: true,
};

function strona(items: unknown[], page = 1, totalPages = 1, total = items.length) {
  return { items, page, totalPages, total };
}

describe("listClientsForTrainer — lista podopiecznych na kontrakcie", () => {
  it("idzie pod `/v1/trainees` z sortowaniem, filtrem planu, szukajką i stroną bez tłumaczenia", async () => {
    // Pięć wartości `sort` i trzy `plan` są w kontrakcie DOKŁADNIE tymi z zakładkowalnego
    // adresu listy — słownika nie ma, test pilnuje, żeby nikt go nie dopisał.
    let sciezka = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.search;
      return json(200, strona([PODOPIECZNY]));
    });

    await listClientsForTrainer(api, { page: 2, sort: "most_sessions", q: "anna", plan: "with" });

    expect(sciezka).toBe("/v1/trainees");
    expect(zapytanie).toContain("page=2");
    expect(zapytanie).toContain("sort=most_sessions");
    expect(zapytanie).toContain("q=anna");
    expect(zapytanie).toContain("plan=with");
  });

  it("`plan: all` i puste `q` nie trafiają do zapytania", async () => {
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([PODOPIECZNY]));
    });

    await listClientsForTrainer(api, { page: 1, sort: "name_asc", q: "", plan: "all" });

    expect(zapytanie).not.toContain("plan=");
    expect(zapytanie).not.toContain("q=");
  });

  it("strona i licznik przychodzą razem — moduł nie liczy stron", async () => {
    // Do integracji trasa robiła dwa zapytania (`countClientsForTrainer` + lista)
    // i liczyła `safePage` sama; rozmiar strony (30) należy teraz do BE.
    const api = klient(() => json(200, strona([PODOPIECZNY], 2, 2, 31)));

    const wynik = await listClientsForTrainer(api, { page: 9, sort: "name_asc" });

    expect(wynik.page).toBe(2);
    expect(wynik.totalPages).toBe(2);
    expect(wynik.total).toBe(31);
    expect(wynik.items[0]?.hasActivePlan).toBe(true);
  });
});
```

- [ ] **Krok 2: Dopisz `listClientsForTrainer` w `app/lib/trainees.ts`**

Na górze pliku, po istniejących importach:

```ts
import { traineeListControllerQuery } from "@kalisthenos/api-client";
import type { TraineeListPage } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
```

Bezpośrednio po klasie `TraineeDeleteError`:

```ts
export type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest";
export type PlanFilter = "all" | "with" | "without";

export interface ClientListOpts {
  page: number;
  sort: ClientSort;
  q?: string;
  /** Domyślnie `all` — wtedy parametr nie idzie do kontraktu. */
  plan?: PlanFilter;
}

/**
 * Lista podopiecznych trenera z liczbą sesji i datą ostatniej — pierwszy odczyt
 * tego modułu na kontrakcie (`GET /v1/trainees`, dodany w Etapie 1 właśnie dla
 * niego). Do integracji mieszkał w `workouts.ts` jako `listClientsForTrainer`
 * + `countClientsForTrainer`; przeszedł tu, bo zasób to podopieczni, a po stronie
 * BE model odczytu żyje w `analytics` (przekracza granicę kontekstu — ADR-0009).
 * Strona (30) i licznik przychodzą razem; `q` obejmuje nazwę ALBO e-mail, jak
 * dotychczasowy `ilike` na `users`.
 *
 * Dwie rzeczy, których kontrakt NIE niesie: nazwy aktywnego planu (jest `hasActivePlan`)
 * i daty dołączenia — dołożenie ich jest addytywne po stronie BE. Trzecia różnica
 * jest celowa: `sessionCount` liczy WYŁĄCZNIE treningi odbyte u tego trenera.
 */
export async function listClientsForTrainer(
  api: Api,
  opts: ClientListOpts,
): Promise<TraineeListPage> {
  const { data } = await traineeListControllerQuery({
    client: api,
    query: {
      page: opts.page,
      sort: opts.sort,
      // `all` to BRAK parametru; puste `q=` znaczy „szukaj pustego łańcucha".
      ...(opts.plan != null && opts.plan !== "all" ? { plan: opts.plan } : {}),
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
    },
    throwOnError: true,
  });
  return data;
}
```

- [ ] **Krok 3: Usuń starą listę z `app/lib/workouts.ts`**

Usuń `ClientStats`, `ClientSort`, `ClientListOpts`, `listClientsForTrainer` (sekcja „Trainer-side
trainee aggregation") oraz `countClientsForTrainer`. Import Drizzle: `or`, `exists`, `not`
i `ilike` (jeśli jeszcze jest) miały użycie wyłącznie tutaj — sprawdź Grepem i usuń; `inArray`,
`sql`, `and`, `eq`, `count`, `notExists` zostają (`loadLogForViewer`, `assertOwnedUnclaimedVideos`,
`loadActivePlanFullForTrainee`, `saveWorkoutLog`).

Sprawdź przez Grep w `app/`: `countClientsForTrainer|ClientStats` — Expected: brak wyników
poza `app/lib/README.md` (krok 5); `listClientsForTrainer` — wyłącznie `trainees.ts`,
`trainees.test.ts` i `podopieczni._index.tsx` (po kroku 4).

- [ ] **Krok 4: Przepnij `app/routes/trener/podopieczni._index.tsx`**

Zamień import `~/lib/workouts` na `import { listClientsForTrainer, type ClientSort, type PlanFilter } from "~/lib/trainees";`.
Usuń stałą `PAGE_SIZE`. Import `db` **zostaje** (akcja: `createInviteWithOnboarding(db, …)`).
Blok loadera od `const plan = …` do `const clients = await listClientsForTrainer(…)` włącznie zamień na:

```ts
  const plan = (controls.filters.plan ?? "all") as PlanFilter;

  // Jedno żądanie zamiast dwóch: strona przychodzi razem z `total`, a `page`
  // spoza zakresu przycina BE — dawne `safePage` nie ma już czego liczyć.
  const result = await listClientsForTrainer(api, {
    page,
    sort: controls.sort as ClientSort,
    q: controls.q,
    plan,
  });
```

W zwracanym obiekcie: `clients: result.items`, `page: result.page`, `totalPages: result.totalPages`,
`total: result.total`. W komponencie, w `clients.map((c) => …)`:

1. Usuń w całości blok `{c.joinedOn && (<div className="text-xs muted" …>od {fmtDate(c.joinedOn)}</div>)}`
   (kontrakt nie niesie daty dołączenia — luka L6). Jeśli `fmtDate` traci przez to ostatnie użycie
   w pliku, usuń je z importu `~/lib/format`.
2. `c.activePlanName != null ? (<span className="badge active">…{c.activePlanName}</span>) : …` →
   `c.hasActivePlan ? (<span className="badge active"><span className="badge-dot" />aktywny plan</span>) : …`.
3. `c.lastSession` (dwa wystąpienia) → `c.lastSessionOn`; `c.totalSessions` (dwa wystąpienia) → `c.sessionCount`.

- [ ] **Krok 5: Korekta dokumentacji**

`app/lib/README.md`: wiersz `trainees.ts` — dopisz na początku „**Lista podopiecznych stoi już na
kontrakcie**: `listClientsForTrainer(api, { page, sort, q?, plan? })` (`GET /v1/trainees`) oddaje
całą stronę; `sessionCount` liczy wyłącznie treningi u tego trenera. Reszta na Drizzle." Wiersz
`workouts.ts`: usuń zdanie o `listClientsForTrainer`/`countClientsForTrainer` i dopisz je do
„zniknęły" (z notą: lista przeszła do `trainees.ts`). `app/routes/trener/README.md`, wiersz
`podopieczni._index.tsx`: „paginacja 30" → „stronicowanie po stronie BE (`listClientsForTrainer(api)`
z `lib/trainees`)".

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/trainees.test.ts --no-file-parallelism
npx biome format --write app/lib/trainees.ts app/lib/trainees.test.ts app/lib/workouts.ts app/routes/trener/podopieczni._index.tsx
```

```bash
git add app/lib/trainees.ts app/lib/trainees.test.ts app/lib/workouts.ts app/routes/trener/podopieczni._index.tsx app/lib/README.md app/routes/trener/README.md
git commit -m "feat(podopieczni): lista podopiecznych z GET /v1/trainees, jedna strona z licznikiem"
```

---

### Zadanie 5: Szczegół logu — dwie trasy, dwie funkcje, podpisane nagrania z kontraktu

**Files:**
- Modify: `app/lib/workouts.ts` (dochodzą `loadMyLog`, `loadTraineeLog`; znikają `WorkoutLogDetail`, `loadLogForViewer`)
- Modify: `app/lib/workouts.test.ts`
- Modify: `app/routes/podopieczny/historia.$logId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.log.$logId.tsx`
- Modify: `app/lib/README.md`, `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`

**Interfaces:**
- Consumes: `myWorkoutLogsControllerById`, `traineeWorkoutLogsControllerById`, typ `WorkoutLogDetailView`
  (`{ id, performedOn, sessionName, note, allDone, exercises: [{ exerciseId, exerciseName, unit, sets: [{ ordinal, reps, difficulty, hasVideo, videoUrl }] }] }`)
  z `@kalisthenos/api-client`; `orNull`, `publicFileUrl` z `~/lib/api/client`; `getTraineeOfTrainer(db, trainerId, traineeId)` z `~/lib/trainees`.
- Produces:
  - `loadMyLog(api: Api, logId: string): Promise<WorkoutLogDetailView | null>` — `videoUrl` już z originem.
  - `loadTraineeLog(api: Api, traineeId: string, logId: string): Promise<WorkoutLogDetailView | null>`.

Decyzje C1, C9, C10. Kontrakt nie niesie liczby oczekiwanych serii ani nazwy podopiecznego —
pominięte serie czyta się z luk w `ordinal`, ogon z `allDone`, a nazwę podopiecznego trener bierze
jeszcze z bazy.

- [ ] **Krok 1: Napisz testy szczegółu w `app/lib/workouts.test.ts`**

Dopisz `ApiError` do importów (`import { ApiError } from "./api/errors";`), `loadMyLog`
i `loadTraineeLog` do importu z `./workouts`, fiksturę i blok:

```ts
const SZCZEGOL_LOGU = {
  id: "l-1",
  performedOn: "2026-08-30",
  sessionName: "Push A",
  note: "Dobrze poszło",
  allDone: false,
  exercises: [
    {
      exerciseId: "e-1",
      exerciseName: "Pull-up",
      unit: "REPS" as const,
      sets: [
        { ordinal: 0, reps: 8, difficulty: 7, hasVideo: true, videoUrl: "/v1/files/f-1?exp=1&partyId=p&trainerId=t&sig=s" },
        { ordinal: 2, reps: 6, difficulty: null, hasVideo: false, videoUrl: null },
      ],
    },
  ],
};

describe("loadMyLog / loadTraineeLog — szczegół z podpisanymi nagraniami", () => {
  it("własny log idzie pod `/v1/me/workout-logs/{id}`, a `videoUrl` dostaje origin z `API_PUBLIC_URL`", async () => {
    // Kontrakt oddaje `videoUrl` jako ŚCIEŻKĘ (`/v1/files/…`). Włożona wprost
    // w `<a href>` rozwiązałaby się względem origin FE, gdzie takiej trasy nie ma —
    // bez błędu, jak brak nagrania. Origin dokłada moduł, nie trasa (jak `demoUrl`
    // w ćwiczeniach), i jest to adres PUBLICZNY BE, nie `API_URL` z sieci prywatnej.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, SZCZEGOL_LOGU);
    });

    const wynik = await loadMyLog(api, "l-1");

    expect(sciezka).toBe("/v1/me/workout-logs/l-1");
    expect(wynik?.exercises[0]?.sets[0]?.videoUrl).toBe(
      "https://api.kalisthenos.test/v1/files/f-1?exp=1&partyId=p&trainerId=t&sig=s",
    );
    expect(wynik?.exercises[0]?.sets[1]?.videoUrl).toBeNull();
    expect(wynik?.allDone).toBe(false);
  });

  it("`404` daje `null` — cudzy log jest nieodróżnialny od nieistniejącego", async () => {
    const api = klient(() => odmowa(404, "WORKOUT_LOG_NOT_FOUND", "Nie znaleziono treningu."));

    expect(await loadMyLog(api, "l-9")).toBeNull();
  });

  it("log podopiecznego u trenera idzie pod `/v1/trainees/{traineeId}/workout-logs/{id}`", async () => {
    // Parę (podopieczny, log) sprawdza BE — dotychczasowe porównanie `traineeId`
    // w trasie trenera znika, bo niezgodna para to po tamtej stronie `404`.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, SZCZEGOL_LOGU);
    });

    await loadTraineeLog(api, "t-1", "l-1");

    expect(sciezka).toBe("/v1/trainees/t-1/workout-logs/l-1");
  });

  it("`500` przechodzi jako ApiError — odczyt nie mapuje niczego poza `404`", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await loadTraineeLog(api, "t-1", "l-1").catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Krok 2: Dopisz funkcje szczegółu w `app/lib/workouts.ts`**

Rozszerz importy: `myWorkoutLogsControllerById`, `traineeWorkoutLogsControllerById`, typ
`WorkoutLogDetailView`; `import { orNull, publicFileUrl } from "~/lib/api/client";`. Zamień
`WorkoutLogDetail` i `loadLogForViewer` (wiersze 488–598) na:

```ts
/**
 * `videoUrl` z kontraktu jest ŚCIEŻKĄ (`/v1/files/…`), nie adresem — origin
 * dokłada moduł, nie trasa (ten sam powód co `demoUrl` w `exercises.ts`).
 * Adres jest podpisany tożsamością PYTAJĄCEGO: trener i podopieczny dostają na
 * to samo nagranie różne adresy, i tak ma być (`docs/04` §Dziennik treningowy).
 */
function withPublicVideoUrls(detail: WorkoutLogDetailView): WorkoutLogDetailView {
  return {
    ...detail,
    exercises: detail.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.videoUrl == null ? set : { ...set, videoUrl: publicFileUrl(set.videoUrl) },
      ),
    })),
  };
}

/**
 * Własny trening z pełnym drzewem serii. `| null` w sygnaturze mapuje `404` przez
 * `orNull` — cudzy log jest po tamtej stronie nieodróżnialny od nieistniejącego.
 * Liczby oczekiwanych serii kontrakt nie niesie: pominięte serie w środku czyta
 * się z luk w `ordinal`, a o ogonie mówi `allDone`.
 */
export async function loadMyLog(api: Api, logId: string): Promise<WorkoutLogDetailView | null> {
  const detail = await orNull(
    myWorkoutLogsControllerById({ client: api, path: { id: logId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
  return detail == null ? null : withPublicVideoUrls(detail);
}

/**
 * Trening podopiecznego oglądany przez trenera. Parę (podopieczny, log) sprawdza
 * BE — niezgodna albo spoza tenanta to `404`, tu `null`. Nazwy podopiecznego ten
 * widok nie niesie; trasa bierze ją jeszcze z bazy (`getTraineeOfTrainer`).
 */
export async function loadTraineeLog(
  api: Api,
  traineeId: string,
  logId: string,
): Promise<WorkoutLogDetailView | null> {
  const detail = await orNull(
    traineeWorkoutLogsControllerById({
      client: api,
      path: { traineeId, id: logId },
      throwOnError: true,
    }).then((r) => r.data),
  );
  return detail == null ? null : withPublicVideoUrls(detail);
}
```

`loadLogForViewer` wołało `loadSessionForLogging(db, …)` — ta funkcja zostaje do Zadania 6
(formularz). Import Drizzle: sprawdź Grepem `inArray`, `eq`, `and` — zostają (inne użycia).

- [ ] **Krok 3: Przepnij `app/routes/podopieczny/historia.$logId.tsx`**

Importy: usuń `db` i `signFileUrl`; `import { loadMyLog } from "~/lib/workouts";`; dodaj
`import type { WorkoutLogExerciseView } from "@kalisthenos/api-client";`. Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainee" });
  const log = await loadMyLog(api, args.params.logId ?? "");
  if (!log) throw new Response("not found", { status: 404 });
  return { log };
}
```

Komponent `TraineeLogDetail`:

```ts
  const { log } = useLoaderData<typeof loader>();
  const exercises = log.exercises;
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const allDiff = exercises
    .flatMap((e) => e.sets.map((s) => s.difficulty))
    .filter((d): d is number => d !== null);
```

(`avgDiff` liczone jak dotąd). W nagłówku `.sub`: zostaje `{exercises.length} ćwiczeń · {totalSets} serii`;
usuń gałąź `totalExpectedSets > 0 ? … : …` i blok `skippedSets > 0 && …`; w ich miejsce:

```tsx
            {!log.allDone && (
              <>
                {" · "}
                <strong style={{ color: "var(--warn)" }}>nie wszystkie serie wykonane</strong>
              </>
            )}
```

Lista kart: `exercises.map((ex, eIdx) => (<ExerciseLogCard key={`${ex.exerciseId}-${eIdx}`} exercise={ex} index={eIdx} />))`
— klucz z indeksem, bo to samo ćwiczenie może wystąpić w sesji dwa razy (dropset).

`usePRToasts`: parametr `exercises: Array<{ exerciseId: string; exerciseName: string }>`;
`new Map(exercises.map((e) => [e.exerciseId, e.exerciseName]))` i `names = ids.map((id) => byId.get(id))`.

Usuń typ `ExWithSigned`. `ExerciseLogCard({ exercise: ex, index }: { exercise: WorkoutLogExerciseView; index: number })`:
`s.log.reps` → `s.reps`, `s.log.difficulty` → `s.difficulty`, `s.log.ordinal` → `s.ordinal`;
`ex.exercise.name/unit` → `ex.exerciseName/unit`; usuń `skippedHere` i plakietkę `{ex.sets.length}/{ex.expectedSets} serii`;
wiersze:

```ts
  // Bez liczby oczekiwanych serii (kontrakt jej nie niesie) wiersze idą od 0 do
  // najwyższego zalogowanego `ordinal` — luka w środku to seria pominięta. Ogona
  // nie widać; mówi o nim `allDone` w nagłówku strony.
  const setsByOrdinal = new Map(ex.sets.map((s) => [s.ordinal, s]));
  const lastLoggedOrdinal = ex.sets.length > 0 ? Math.max(...ex.sets.map((s) => s.ordinal)) : -1;
  const rows = Array.from({ length: lastLoggedOrdinal + 1 }, (_, ordinal) => ({
    ordinal,
    logged: setsByOrdinal.get(ordinal) ?? null,
  }));
```

W `rows.map`: `<SkippedSetRow key={`skip-${ordinal}`} ordinal={ordinal} />` (usuń props
`expectedReps`, `unit` i z komponentu `SkippedSetRow` blok „· plan: N powt."),
`<SetRowDisplay key={`set-${ordinal}`} ordinal={ordinal} reps={logged.reps} difficulty={logged.difficulty} hasRpe={hasRpe} unit={ex.unit} videoUrl={logged.videoUrl} />`.

- [ ] **Krok 4: Przepnij `app/routes/trener/podopieczni.$traineeId.log.$logId.tsx`**

Importy: usuń `signFileUrl`; `import { loadTraineeLog } from "~/lib/workouts";`,
`import { getTraineeOfTrainer } from "~/lib/trainees";`; `db` **zostaje**. Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  // Nazwa podopiecznego: kontrakt nie niesie jej ani w szczególe logu, ani
  // w przeglądzie klienta — do przepięcia obszaru „podopieczni" idzie z bazy.
  // To JEDYNY powód, dla którego `db` zostaje w tej trasie.
  const trainee = await getTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  // Parę (podopieczny, log) sprawdza BE — niezgodna to `404`, tu `null`.
  const log = await loadTraineeLog(api, traineeId, args.params.logId ?? "");
  if (!log) throw new Response("not found", { status: 404 });

  return { log, trainee: { id: trainee.id, displayName: trainee.displayName } };
}
```

Komponent `TrenerWorkoutLogDetail`: `const { log, trainee } = useLoaderData<typeof loader>();
const exercises = log.exercises;`; `totalSets`/`allDiff`/`avgDiff` jak w kroku 3 (pola `s.difficulty`).
Nagłówek: usuń gałąź `totalExpectedSets > 0 ? … : "serii"` (zostaje „{totalSets} serii") i blok
`skippedSets > 0 && …`; w ich miejsce `{!log.allDone && (<span style={{ color: "var(--warn)", fontWeight: 600 }}>· nie wszystkie serie wykonane</span>)}`.
W `exercises.map((ex, eIdx) => …)`: klucz `${ex.exerciseId}-${eIdx}`; `ex.sets` bez `.log`
(`s.reps`, `s.difficulty`, `s.ordinal`); `ex.exercise.name/unit` → `ex.exerciseName/unit`; usuń
`skippedHere` i plakietkę `{setCount}/{ex.expectedSets} serii`; `rows` jak w kroku 3
(`lastLoggedOrdinal + 1`); w wierszu pominiętym usuń blok `ex.expectedReps > 0 && (… plan: …)`;
w wierszu zalogowanym `logged.log.reps/difficulty` → `logged.reps/difficulty`, `logged.videoUrl` bez zmian,
`key={logged.log.id}` → `key={`set-${ordinal}`}`.

Sprawdź przez Grep w `app/routes`: `signFileUrl` — Expected: wyłącznie `podopieczny/sylwetka.tsx`,
`trener/podopieczni.$traineeId.sylwetka.tsx` i `podopieczny/sesje.$sessionId.tsx` (to ostatnie
znika w Zadaniu 6). `loadLogForViewer|WorkoutLogDetail\b` w `app/` — Expected: brak.

- [ ] **Krok 5: Korekta dokumentacji**

`app/lib/README.md`, wiersz `workouts.ts`: dopisz „szczegóły logów na kontrakcie: `loadMyLog(api, id)`
i `loadTraineeLog(api, traineeId, id)` (`| null` mapuje `404`; `videoUrl` ze ścieżki kontraktu na
adres przez `publicFileUrl` W MODULE); `loadLogForViewer` zniknęło". `app/routes/podopieczny/README.md`,
wiersz `historia.$logId.tsx`: „+ podpisane wideo" → „nagrania z podpisanymi adresami BE
(`loadMyLog`); bez liczby oczekiwanych serii — pominięte w środku z luk w `ordinal`, ogon
sygnalizuje `allDone`". `app/routes/trener/README.md`, wiersz `podopieczni.$traineeId.log.$logId.tsx`:
„Szczegóły wpisu treningowego z kontraktu (`loadTraineeLog(api)`), nagrania z podpisanymi adresami
BE; nazwa podopiecznego jeszcze z bazy (`getTraineeOfTrainer`)".

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/workouts.test.ts --no-file-parallelism
npx biome format --write app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/historia.\$logId.tsx app/routes/trener/podopieczni.\$traineeId.log.\$logId.tsx
```

Po tym zadaniu — **checkpoint Właściciela** (odczyty list i szczegółów domknięte):
`npm run typecheck`, `npm run lint`, `npx vitest run app --no-file-parallelism`, `npm run build`,
po kolei. Commit:

```bash
git add app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/historia.\$logId.tsx app/routes/trener/podopieczni.\$traineeId.log.\$logId.tsx app/lib/README.md app/routes/podopieczny/README.md app/routes/trener/README.md
git commit -m "feat(dziennik): szczegol logu na kontrakcie, nagrania z podpisanymi adresami BE"
```

---

### Zadanie 6: Sesje aktywnego planu i sesja do logowania (odczyty)

**Files:**
- Modify: `app/lib/workouts.ts` (dochodzą `loadMyActivePlan`, `loadSessionForLogging(api, sessionId)`, `toLoggingEntries`; znikają `findActivePlanForTrainee`, `PlanSessionView`, `ActivePlanFull`, `loadActivePlanFullForTrainee`, `SessionForLogging`, stare `loadSessionForLogging(db, planId, sessionId)`)
- Modify: `app/lib/workouts.test.ts`
- Modify: `app/routes/podopieczny/sesje._index.tsx`
- Modify: `app/routes/podopieczny/sesje.$sessionId.tsx`
- Modify: `app/routes/podopieczny/loguj.$sessionId.tsx` (loader i odczyt sesji w akcji; zapis zostaje na bazie do Zadania 7)
- Modify: `app/lib/README.md`, `app/routes/podopieczny/README.md`

**Interfaces:**
- Consumes: `myPlanControllerActivePlan`, `myPlanControllerSession`, typy `MyPlanView`
  (`{ id, name, version, publishedAt, sessions: PlanTreeSessionView[] }`), `PlanTreeSessionView`,
  `PlanTreeBlockView`, `SessionDetailView` (`{ id, name, planId, planStatus, blocks: SessionBlockView[] }`),
  `SessionBlockView`, `SessionItemView` z `@kalisthenos/api-client`.
- Produces:
  - `loadMyActivePlan(api: Api): Promise<MyPlanView | null>`
  - `loadSessionForLogging(api: Api, sessionId: string): Promise<SessionDetailView | null>` — `demoUrl` już z originem
  - `toLoggingEntries(session: SessionDetailView): LoggingEntry[]` — czysta; `LoggingEntry` bez zmian kształtu
  - `SaveWorkoutLogInput` bez zmian (do Zadania 7).

Decyzja C6. Lista sesji traci plakietki wykonań (luka L3) i opisy ćwiczeń (L4), szczegół sesji —
nazwę planu i numer sesji (L5). Formularz logowania przestaje pytać o aktywny plan: prosi o sesję,
a BE rozstrzyga, czy wolno ją logować.

- [ ] **Krok 1: Napisz testy w `app/lib/workouts.test.ts`**

Dopisz do importu z `./workouts`: `loadMyActivePlan`, `loadSessionForLogging`, `toLoggingEntries`.
Fikstura i dwa bloki:

```ts
const SESJA = {
  id: "s-1",
  name: "Push A",
  planId: "p-1",
  planStatus: "active" as const,
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
          exerciseName: "Pull-up",
          reps: 8,
          unit: "REPS" as const,
          tracksRpe: true,
          sets: 3,
          restSeconds: 90,
          note: "kontrola na dole",
          demoUrl: "/v1/files/f-1?exp=1&partyId=p&trainerId=t&sig=s",
        },
      ],
    },
    {
      id: "b-2",
      kind: "dropset" as const,
      sets: 2,
      restSeconds: 120,
      items: [
        { id: "i-2", exerciseId: "e-2", exerciseName: "Dip", reps: 10, unit: "REPS" as const, tracksRpe: false, sets: null, restSeconds: null, note: null, demoUrl: null },
        { id: "i-3", exerciseId: "e-3", exerciseName: "Push-up", reps: 15, unit: "REPS" as const, tracksRpe: false, sets: null, restSeconds: null, note: null, demoUrl: null },
      ],
    },
  ],
};

describe("toLoggingEntries — spłaszczenie sesji do wpisów formularza", () => {
  it("w dropsecie liczbę serii niesie BLOK, w single/superset — pozycja", () => {
    // Ta reguła była do integracji zaszyta w zapytaniu Drizzle i nie miała testu.
    // Pomylenie źródła daje formularz z jedną serią zamiast dwóch dla każdego
    // dropu — a podopieczny nie ma jak zauważyć, że brakuje mu wierszy.
    const wpisy = toLoggingEntries(SESJA);

    expect(wpisy.map((w) => [w.exerciseName, w.expectedSets, w.isDropsetItem])).toEqual([
      ["Pull-up", 3, false],
      ["Dip", 2, true],
      ["Push-up", 2, true],
    ]);
  });

  it("przenosi cel, jednostkę, notatkę i flagę RPE per pozycja; brak liczby serii to 1", () => {
    const [pierwszy, drugi] = toLoggingEntries({
      ...SESJA,
      blocks: [{ ...SESJA.blocks[0]!, items: [{ ...SESJA.blocks[0]!.items[0]!, sets: null }] }],
    });

    expect(pierwszy).toMatchObject({
      planItemId: "i-1",
      exerciseId: "e-1",
      unit: "REPS",
      expectedSets: 1,
      expectedReps: 8,
      note: "kontrola na dole",
      tracksRpe: true,
    });
    expect(drugi).toBeUndefined();
  });
});

describe("loadMyActivePlan / loadSessionForLogging — plan i sesja podopiecznego", () => {
  it("aktywny plan idzie pod `/v1/me/plan`, a `404 PLAN_NOT_FOUND` daje `null`", async () => {
    // Brak opublikowanego planu to po stronie BE `404` opisane jako „stan normalny,
    // nie awaria" — sygnatura `| null` włącza `orNull`, a ekran rysuje pusty stan.
    let sciezka = "";
    const zPlanem = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, { id: "p-1", name: "Siła 1", version: 2, publishedAt: "2026-08-01T10:00:00.000Z", sessions: [] });
    });
    const bezPlanu = klient(() => odmowa(404, "PLAN_NOT_FOUND", "Nie masz aktywnego planu."));

    expect((await loadMyActivePlan(zPlanem))?.name).toBe("Siła 1");
    expect(sciezka).toBe("/v1/me/plan");
    expect(await loadMyActivePlan(bezPlanu)).toBeNull();
  });

  it("sesja idzie pod `/v1/me/plan/sessions/{id}`, a `demoUrl` dostaje origin z `API_PUBLIC_URL`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, SESJA);
    });

    const wynik = await loadSessionForLogging(api, "s-1");

    expect(sciezka).toBe("/v1/me/plan/sessions/s-1");
    expect(wynik?.blocks[0]?.items[0]?.demoUrl).toBe(
      "https://api.kalisthenos.test/v1/files/f-1?exp=1&partyId=p&trainerId=t&sig=s",
    );
    expect(wynik?.blocks[1]?.items[0]?.demoUrl).toBeNull();
  });

  it("cudza sesja daje `null`, a sesja szkicu (`409`) leci dalej jako ApiError", async () => {
    // `409 PLAN_NOT_PUBLISHED` NIE jest „nie ma takiej sesji" — sesja istnieje,
    // tylko nie wolno jej logować. Regułę wyznacza sygnatura: `| null` łapie
    // wyłącznie `404`.
    const cudza = klient(() => odmowa(404, "WORKOUT_LOG_SESSION_NOT_FOUND", "Nie znaleziono sesji treningowej."));
    const szkic = klient(() => odmowa(409, "PLAN_NOT_PUBLISHED", "Tej sesji nie da się zalogować — plan nie został opublikowany."));

    expect(await loadSessionForLogging(cudza, "s-9")).toBeNull();
    const blad = await loadSessionForLogging(szkic, "s-1").catch((e) => e);
    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).code).toBe("PLAN_NOT_PUBLISHED");
  });
});
```

- [ ] **Krok 2: Wymień odczyty planu i sesji w `app/lib/workouts.ts`**

Rozszerz importy: `myPlanControllerActivePlan`, `myPlanControllerSession`, typy `MyPlanView`,
`SessionDetailView`. Usuń `SessionForLogging`, `findActivePlanForTrainee`, `PlanSessionView`,
`ActivePlanFull`, `loadActivePlanFullForTrainee` i stare `loadSessionForLogging(db, planId, sessionId)`
(sekcje „Reads" i „Active plan with full nested structure", wiersze 47–310). `LoggingEntry` zostaje
bez zmian. W ich miejsce:

```ts
// ============================================================
// Aktywny plan i sesja podopiecznego — kontrakt
// ============================================================

/**
 * Aktywny plan podopiecznego z pełnym drzewem sesji → bloków → pozycji. Brak
 * planu to po stronie BE `404 PLAN_NOT_FOUND` — „stan normalny, nie awaria"
 * (docblock trasy) — więc `| null` i `orNull`. Liczby wykonań per sesja tu nie ma
 * (`docs/03` „Sesje: pełne drzewo"); niesie je `activePlan` pulpitu (`views.ts`).
 */
export async function loadMyActivePlan(api: Api): Promise<MyPlanView | null> {
  return await orNull(
    myPlanControllerActivePlan({ client: api, throwOnError: true }).then((r) => r.data),
  );
}

/**
 * `demoUrl` z kontraktu jest ŚCIEŻKĄ — origin dokłada moduł (jak `videoUrl` wyżej
 * i `demoUrl` w `exercises.ts`).
 */
function withPublicDemoUrls(session: SessionDetailView): SessionDetailView {
  return {
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      items: block.items.map((item) =>
        item.demoUrl == null ? item : { ...item, demoUrl: publicFileUrl(item.demoUrl) },
      ),
    })),
  };
}

/**
 * Sesja do wykonania — z jednostką, flagą RPE i podpisanym demo per pozycja.
 * Przynależność sesji do planu aktywnego ALBO archiwalnego tej pary rozstrzyga
 * BE (zaległy trening ze starszej wersji planu jest legalny — `docs/01` §D);
 * sesja szkicu to `409 PLAN_NOT_PUBLISHED`, które leci dalej jako `ApiError`,
 * a cudza lub nieistniejąca to `404`, tu `null`. `findActivePlanForTrainee`
 * przestało więc istnieć: trasa nie pyta „jaki jest aktywny plan", tylko
 * „daj mi tę sesję".
 */
export async function loadSessionForLogging(
  api: Api,
  sessionId: string,
): Promise<SessionDetailView | null> {
  const session = await orNull(
    myPlanControllerSession({ client: api, path: { sessionId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
  return session == null ? null : withPublicDemoUrls(session);
}

/**
 * Spłaszczenie sesji do wpisów formularza logowania — jedna pozycja planu = jeden
 * wpis; w dropsecie liczbę serii niesie BLOK, a pozycje mają `sets: null`.
 * Czysta funkcja: do integracji robił to `loadSessionForLogging(db)` po drodze
 * z bazy, więc nie miała testu. Kształt `LoggingEntry` zostaje — formularz
 * i akcja czytają go bez zmian.
 */
export function toLoggingEntries(session: SessionDetailView): LoggingEntry[] {
  const entries: LoggingEntry[] = [];
  for (const block of session.blocks) {
    const isDropset = block.kind === "dropset";
    for (const item of block.items) {
      entries.push({
        planItemId: item.id,
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        unit: item.unit,
        expectedSets: isDropset ? (block.sets ?? 1) : (item.sets ?? 1),
        expectedReps: item.reps,
        note: item.note,
        isDropsetItem: isDropset,
        tracksRpe: item.tracksRpe,
      });
    }
  }
  return entries;
}
```

Import Drizzle: po tym kroku zostają wyłącznie użycia w `assertOwnedUnclaimedVideos`
(`and`, `eq`, `inArray`, `notExists`, `sql`) i `saveWorkoutLog` (bez operatorów) — sprawdź Grepem
`count`, `and`, `eq`, `inArray`, `notExists`, `sql` i usuń te bez użycia (`count` na pewno).

- [ ] **Krok 3: Przepnij `app/routes/podopieczny/sesje._index.tsx`**

Importy: usuń `db`; `import { loadMyActivePlan } from "~/lib/workouts";`; dodaj
`import type { PlanTreeSessionView } from "@kalisthenos/api-client";`; `daysAgo` znika z importu
`~/lib/format` (zostaje `fmtDate`). Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainee" });
  const plan = await loadMyActivePlan(api);
  return { plan };
}
```

Komponent: `planFull` → `plan` (warunek `plan == null`, `plan.version`, `plan.publishedAt`,
`plan.name`, `plan.sessions.length`, `plan.sessions.map((s) => <SessionCard key={s.id} session={s} />)`).
`SessionCard({ session }: { session: PlanTreeSessionView })`: `sessionView.session.id/name` →
`session.id/name`; `blocks = session.blocks`; `b.block.kind/sets/id` → `b.kind/sets/id`;
`refs.map((r) => r.exercise.name)` → `r.exerciseName`; `first?.item.sets/reps` → `first?.sets/reps`;
`first?.exercise.unit` → `first?.unit`. Usuń plakietkę wykonań (`sessionView.doneCount > 0 ? … : …`
z prawej strony nagłówka karty) i lewą część stopki (`sessionView.lastPerformedOn ? … : …`) —
kontrakt listy sesji ich nie niesie (luka L3); stopka zostaje z samym przyciskiem „Zarejestruj"
(`justifyContent: "flex-end"` zamiast klasy `between`).

- [ ] **Krok 4: Przepnij `app/routes/podopieczny/sesje.$sessionId.tsx`**

Importy: usuń `db` i `signFileUrl`; `import { loadSessionForLogging } from "~/lib/workouts";`.
Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainee" });
  // Sesja przychodzi z podpisanym demo per pozycja; cudza albo nieistniejąca to
  // `null` (404), sesja szkicu — `409` z BE do granicy błędu.
  const session = await loadSessionForLogging(api, args.params.sessionId ?? "");
  if (!session) throw new Response("not found", { status: 404 });
  return { session };
}
```

Komponent: `const { session } = useLoaderData<typeof loader>(); const blocks = session.blocks;`;
`totalSets`: `b.block.kind/sets` → `b.kind/sets`, `it.item.sets` → `it.sets`. Okruszki:
`<Link to="/podopieczny/sesje">Sesje</Link>` (kontrakt nie niesie nazwy planu — luka L5) i
`session.name`; eyebrow „Sesja {sessionIdx + 1}" → „Sesja" (numeru nie ma — L5);
`sessionView.session.name/id` → `session.name/id` (nagłówek i oba przyciski). Typ pomocniczy
`LoaderData["blocks"][number]` → `SessionBlockView`, `…["items"][number]` → `SessionItemView`
(oba `import type` z `@kalisthenos/api-client`; usuń `type LoaderData`). W `BlockView`, `DropRow`,
`ExerciseRow`: `b.block.kind/sets/restSeconds/id` → `b.kind/…`; `it.item.id/reps/sets/restSeconds/note`
→ `it.id/…`; `it.exercise.name/unit` → `it.exerciseName/unit`; `it.demoUrl` już jest w pozycji
(z originem). Usuń oba bloki `ex.description.length > 0 && (…)` — `SessionItemView` nie ma opisu
(luka L4); zmienna `ex` przestaje być potrzebna.

- [ ] **Krok 5: Przepnij odczyt sesji w `app/routes/podopieczny/loguj.$sessionId.tsx`**

Importy z `~/lib/workouts`: `assertOwnedUnclaimedVideos, loadSessionForLogging, saveWorkoutLog,
toLoggingEntries, WorkoutSaveError` (znika `findActivePlanForTrainee`). `db` **zostaje** (zapis do
Zadania 7). Loader:

```ts
export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainee" });
  const session = await loadSessionForLogging(api, args.params.sessionId ?? "");
  if (!session) throw new Response("not found", { status: 404 });

  return {
    user,
    session: { id: session.id, name: session.name },
    entries: toLoggingEntries(session),
    // Klient egzekwuje ten sam limit co serwer PRZED wysłaniem — za duże nagranie
    // nie opuszcza urządzenia (unikamy zerwanego uploadu: timeout proxy / OOM).
    maxVideoBytes: maxUploadBytesFor("set_video"),
  };
}
```

W akcji: zamień początek (od `const sessionId` do `if (!detail) { throw … }`) na:

```ts
  const session = await loadSessionForLogging(api, args.params.sessionId ?? "");
  if (!session) throw new Response("not found", { status: 404 });
  const entries = toLoggingEntries(session);
```

(destrukturyzacja `requireUser` → `const { api, user } = …`; sprawdzenie `user.trainerId` zostaje do
Zadania 7, bo `saveWorkoutLog(db)` jeszcze go bierze). Pętla `for (const [eIdx, entry] of
detail.entries.entries())` → `entries.entries()`. W wywołaniu `saveWorkoutLog(db, {...})`:
`planId: session.planId`, `planSessionId: session.id`, `sessionName: session.name`;
`params.set("saved", session.id)`. Usuń gałąź `if (!plan) return { error: "Nie masz aktywnego planu." }`.
Komponent bez zmian (czyta `session.id/name`, `entries`, `maxVideoBytes`).

Sprawdź przez Grep w `app/`: `findActivePlanForTrainee|loadActivePlanFullForTrainee|PlanSessionView|ActivePlanFull|SessionForLogging`
— Expected: brak wyników poza `app/lib/README.md` (krok 6).

- [ ] **Krok 6: Korekta dokumentacji**

`app/lib/README.md`, wiersz `workouts.ts`: dopisz „aktywny plan i sesja na kontrakcie:
`loadMyActivePlan(api)` (`GET /v1/me/plan`, `| null`), `loadSessionForLogging(api, sessionId)`
(`GET /v1/me/plan/sessions/{id}`, `demoUrl` z originem, `409 PLAN_NOT_PUBLISHED` leci dalej),
czysta `toLoggingEntries(session)`; zniknęły `findActivePlanForTrainee`,
`loadActivePlanFullForTrainee`; na Drizzle zostają wyłącznie `saveWorkoutLog` i
`assertOwnedUnclaimedVideos`". `app/routes/podopieczny/README.md`: wiersz `sesje._index.tsx` —
„Lista sesji z aktywnego planu (`loadMyActivePlan`, pełne drzewo bloków/ćwiczeń; bez liczników
wykonań — kontrakt listy ich nie niesie)"; wiersz `sesje.$sessionId.tsx` — „Szczegóły sesji
z podpisanymi adresami demo z BE (`loadSessionForLogging`)"; wiersz `loguj.$sessionId.tsx` —
dopisz „odczyt sesji przez kontrakt (`loadSessionForLogging` + `toLoggingEntries`); zapis jeszcze
na bazie".

- [ ] **Krok 7: Bramki i commit**

```bash
npx vitest run app/lib/workouts.test.ts --no-file-parallelism
npx biome format --write app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/sesje._index.tsx app/routes/podopieczny/sesje.\$sessionId.tsx app/routes/podopieczny/loguj.\$sessionId.tsx
```

```bash
git add app/lib/workouts.ts app/lib/workouts.test.ts app/routes/podopieczny/sesje._index.tsx app/routes/podopieczny/sesje.\$sessionId.tsx app/routes/podopieczny/loguj.\$sessionId.tsx app/lib/README.md app/routes/podopieczny/README.md
git commit -m "feat(dziennik): sesje aktywnego planu i sesja do logowania z kontraktu"
```

---

### Zadanie 7: Zapis treningu przez kontrakt — koniec bazy w `workouts.ts`

**Files:**
- Modify: `app/lib/workouts.ts` (dochodzi `saveWorkoutLog(api, …)`; znikają `assertOwnedUnclaimedVideos`, `findUnusableVideoIds`, `UUID_RE`, stare `saveWorkoutLog(db, …)`, importy Drizzle, `schema`, `type Db`, `logger`)
- Modify: `app/lib/workouts.test.ts` (znika blok `findUnusableVideoIds`, dochodzi blok zapisu)
- Modify: `app/routes/podopieczny/loguj.$sessionId.tsx` (akcja i loader: klucz idempotencji, rekordy z odpowiedzi; znika `db`)
- Modify: `app/lib/stats.ts` (znikają `NewPRForLog`, `detectNewPRsForLog`)
- Delete: `tests/workout-video-ids.itest.ts`
- Modify: `tests/README.md`, `app/lib/README.md`, `app/routes/podopieczny/README.md`

**Interfaces:**
- Consumes: `workoutLogsControllerCreate` i typy `CreatedWorkoutLogView`, `LogWorkoutDto`
  z `@kalisthenos/api-client`; `ApiError` z `~/lib/api/errors`; `loadSessionForLogging`, `toLoggingEntries` z Zadania 6.
- Produces:
  - `interface SaveSetInput { ordinal; reps; difficulty: number | null; videoFileId: string | null }` (bez zmian)
  - `interface SaveExerciseLogInput { exerciseId; sets: SaveSetInput[] }` (bez zmian)
  - `interface SaveWorkoutLogInput { planSessionId: string; performedOn: string; note: string | null; allDone: boolean; exercises: SaveExerciseLogInput[] }` — bez `trainerId`, `traineeId`, `planId`, `sessionName`
  - `interface SaveWorkoutLogOptions { idempotencyKey?: string }`
  - `saveWorkoutLog(api: Api, input: SaveWorkoutLogInput, opts?: SaveWorkoutLogOptions): Promise<CreatedWorkoutLogView>` — `{ id, …, personalRecords: [{ exerciseId, exerciseName, unit, reps }] }`
  - `class WorkoutSaveError` (bez zmian kształtu).

Decyzje C7 i C8. Po tym zadaniu `workouts.ts` nie importuje Drizzle, schematu ani `logger`.

- [ ] **Krok 1: Przepisz testy zapisu w `app/lib/workouts.test.ts`**

Usuń cały `describe("findUnusableVideoIds", …)` razem z jego docblockiem i `findUnusableVideoIds`
z importu. Dopisz `saveWorkoutLog`, `WorkoutSaveError` do importu z `./workouts` oraz:

```ts
const ZAPIS = {
  planSessionId: "s-1",
  performedOn: "2026-09-01",
  note: null,
  allDone: false,
  exercises: [
    {
      exerciseId: "e-1",
      sets: [
        { ordinal: 0, reps: 8, difficulty: 7, videoFileId: "f-1" },
        { ordinal: 1, reps: 7, difficulty: null, videoFileId: null },
      ],
    },
    // Ćwiczenie pominięte w całości idzie z pustą listą — DTO tego nie zabrania
    // (`@ArrayNotEmpty()` stoi wyłącznie na `exercises`), a szczegół nadal je pokaże.
    { exerciseId: "e-2", sets: [] },
  ],
};

const UTWORZONY = {
  id: "l-1",
  performedOn: "2026-09-01",
  sessionName: "Push A",
  note: null,
  allDone: false,
  exercises: [],
  personalRecords: [{ exerciseId: "e-1", exerciseName: "Pull-up", unit: "REPS", reps: 8 }],
};

describe("saveWorkoutLog — zapis przez kontrakt", () => {
  it("wysyła `POST /v1/workout-logs` z kluczem idempotencji i ciałem BEZ pól tożsamości", async () => {
    // BE ma `forbidNonWhitelisted: true`: pole spoza DTO to `400`. Dawne wejście
    // niosło `trainerId`/`traineeId`/`planId`/`sessionName` — BE wyprowadza je
    // z tokenu i z sesji, więc ciało składa się jawnie, pole po polu.
    let metoda = "";
    let sciezka = "";
    let klucz: string | null = null;
    let cialo: Record<string, unknown> = {};
    const api = klient(async (req) => {
      metoda = req.method;
      sciezka = new URL(req.url).pathname;
      klucz = req.headers.get("idempotency-key");
      cialo = (await req.json()) as Record<string, unknown>;
      return json(201, UTWORZONY);
    });

    const wynik = await saveWorkoutLog(api, ZAPIS, { idempotencyKey: "k-1" });

    expect(metoda).toBe("POST");
    expect(sciezka).toBe("/v1/workout-logs");
    expect(klucz).toBe("k-1");
    expect(Object.keys(cialo).sort()).toEqual(["allDone", "exercises", "note", "performedOn", "planSessionId"]);
    expect(wynik.id).toBe("l-1");
    expect(wynik.personalRecords.map((p) => p.exerciseId)).toEqual(["e-1"]);
  });

  it("bez klucza nie wysyła nagłówka", async () => {
    // Pusty nagłówek znaczy dla BE „brak klucza", ale brak nagłówka jest tym samym
    // bez polegania na przycinaniu białych znaków po tamtej stronie.
    let klucz: string | null = "nie sprawdzono";
    const api = klient((req) => {
      klucz = req.headers.get("idempotency-key");
      return json(201, UTWORZONY);
    });

    await saveWorkoutLog(api, ZAPIS);

    expect(klucz).toBeNull();
  });

  it("`409 SET_VIDEO_UNAVAILABLE` zamienia na WorkoutSaveError z komunikatem BE", async () => {
    // Dawne `assertOwnedUnclaimedVideos` przeszło do BE w całości — cudze, złego
    // rodzaju, już podpięte i nieistniejące nagranie dają JEDNĄ odmowę, żeby cudze
    // było nieodróżnialne od nieistniejącego. Formularz pokazuje `userMessage`.
    const api = klient(() =>
      odmowa(409, "SET_VIDEO_UNAVAILABLE", "Któreś z nagrań nie jest już dostępne.", {
        fileIds: ["f-1"],
      }),
    );

    const blad = await saveWorkoutLog(api, ZAPIS).catch((e) => e);

    expect(blad).toBeInstanceOf(WorkoutSaveError);
    expect((blad as WorkoutSaveError).userMessage).toBe("Któreś z nagrań nie jest już dostępne.");
  });

  it("`400 PERFORMED_ON_IN_FUTURE` też trafia do formularza", async () => {
    // Reguła, której FE nie miał (ADR-0027): data nie może wyprzedzać dnia
    // bieżącego w strefie aplikacji o więcej niż dzień. Bierzemy komunikat BE.
    const api = klient(() =>
      odmowa(400, "PERFORMED_ON_IN_FUTURE", "Data treningu 2026-09-05 wyprzedza dzień bieżący (2026-09-01)."),
    );

    const blad = await saveWorkoutLog(api, ZAPIS).catch((e) => e);

    expect(blad).toBeInstanceOf(WorkoutSaveError);
  });

  it("`500` przechodzi jako ApiError — awaria BE ma zostać awarią", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await saveWorkoutLog(api, ZAPIS).catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(WorkoutSaveError);
  });
});
```

- [ ] **Krok 2: Wymień zapis w `app/lib/workouts.ts`**

Usuń importy `drizzle-orm`, `~/lib/db/client`, `~/lib/db/schema`, `~/lib/logger`. Dodaj
`workoutLogsControllerCreate` i typ `CreatedWorkoutLogView` do importów z `@kalisthenos/api-client`
oraz `import { ApiError } from "~/lib/api/errors";`. Usuń `UUID_RE`, `findUnusableVideoIds`,
`assertOwnedUnclaimedVideos` i stare `saveWorkoutLog(db, …)`. Sekcja „Saves" w całości:

```ts
// ============================================================
// Saves
// ============================================================

export class WorkoutSaveError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface SaveSetInput {
  /**
   * Pozycja serii w planie (od 0). Zachowana, nie przenumerowana przy zapisie —
   * dzięki temu szczegół widzi, KTÓRE serie pominięto: brakujący `ordinal`
   * w środku to pominięcie.
   */
  ordinal: number;
  reps: number;
  difficulty: number | null;
  videoFileId: string | null;
}

export interface SaveExerciseLogInput {
  exerciseId: string;
  sets: SaveSetInput[];
}

/**
 * Bez `trainerId`, `traineeId`, `planId` i `sessionName` — BE wyprowadza je z tokenu
 * i z sesji planu. `LogWorkoutDto` nie ma tych pól, a `forbidNonWhitelisted` zamienia
 * każde nadmiarowe w `400`.
 */
export interface SaveWorkoutLogInput {
  planSessionId: string;
  /** `YYYY-MM-DD`; górną granicę (dziś + 1 dzień w strefie aplikacji) egzekwuje BE. */
  performedOn: string;
  note: string | null;
  allDone: boolean;
  exercises: SaveExerciseLogInput[];
}

export interface SaveWorkoutLogOptions {
  /**
   * Klucz idempotencji (`docs/04` §6): powtórzenie z tym samym kluczem oddaje
   * PIERWOTNY wynik zamiast drugiego treningu. Nadaje go loader trasy raz na
   * wyświetlenie formularza — po to, żeby ponowienie po zerwanej sieci (szkic
   * w `sessionStorage`) i drugie kliknięcie nie robiły dwóch logów.
   */
  idempotencyKey?: string;
}

/**
 * Zapis treningu — jedno żądanie, atomowo po stronie BE. Zwraca utworzony log
 * RAZEM z listą pobitych rekordów, więc `detectNewPRsForLog` zniknęło: rekordy
 * są częścią odpowiedzi `201`, nie osobnym zapytaniem po zapisie.
 *
 * Co przestało być sprawą FE: własność i dostępność nagrań (`409
 * SET_VIDEO_UNAVAILABLE`, dawne `assertOwnedUnclaimedVideos`), przynależność
 * ćwiczeń do sesji (`409 EXERCISE_NOT_IN_SESSION`), reguły oceny trudności
 * per ćwiczenie (`409 DIFFICULTY_*`), data z przyszłości (`400
 * PERFORMED_ON_IN_FUTURE`), pusty trening (`409 EMPTY_WORKOUT_LOG`).
 *
 * Wąski `catch`: trasa pokazuje `userMessage` w formularzu, więc własny typ
 * dostają `400`, `404` i `409`. Reszta leci `ApiError`-em — awaria ma zostać awarią.
 */
export async function saveWorkoutLog(
  api: Api,
  input: SaveWorkoutLogInput,
  opts: SaveWorkoutLogOptions = {},
): Promise<CreatedWorkoutLogView> {
  try {
    const { data } = await workoutLogsControllerCreate({
      client: api,
      body: {
        planSessionId: input.planSessionId,
        performedOn: input.performedOn,
        note: input.note,
        allDone: input.allDone,
        exercises: input.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map((set) => ({
            ordinal: set.ordinal,
            reps: set.reps,
            difficulty: set.difficulty,
            videoFileId: set.videoFileId,
          })),
        })),
      },
      ...(opts.idempotencyKey ? { headers: { "Idempotency-Key": opts.idempotencyKey } } : {}),
      throwOnError: true,
    });
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
      throw new WorkoutSaveError(e.code, e.message);
    }
    throw e;
  }
}
```

Sprawdź przez Grep w `app/lib/workouts.ts`: `drizzle-orm|~/lib/db|logger` — Expected: brak.
W `app/`: `assertOwnedUnclaimedVideos|findUnusableVideoIds` — Expected: brak poza README (krok 5).

- [ ] **Krok 3: Przepnij zapis w `app/routes/podopieczny/loguj.$sessionId.tsx`**

Importy: usuń `db` (`~/lib/db/client`) i `detectNewPRsForLog` (`~/lib/stats`); z `~/lib/workouts`
zostają `loadSessionForLogging, saveWorkoutLog, toLoggingEntries, WorkoutSaveError`. W loaderze
dopisz do zwracanego obiektu:

```ts
    // Klucz idempotencji zapisu (`docs/04` §6) — jeden na wyświetlenie formularza.
    // Ponowienie po zerwanej sieci i drugie kliknięcie dostają od BE ten sam log.
    idempotencyKey: crypto.randomUUID(),
```

W akcji: `const { api } = requireUser(…)` (bez `user`); usuń blok `if (!user.trainerId) { return { error: "Konto bez przypisanego trenera." }; }`
— czy podopieczny bez trenera może logować, rozstrzyga BE. Po odczycie `fd` dodaj:

```ts
  const idempotencyKeyRaw = fd.get("idempotencyKey");
  const idempotencyKey =
    typeof idempotencyKeyRaw === "string" && idempotencyKeyRaw.length > 0
      ? idempotencyKeyRaw
      : undefined;
```

W `try`: usuń blok `videoIds` + `await assertOwnedUnclaimedVideos(db, …)` wraz z komentarzem
(własność nagrań sprawdza BE — `409 SET_VIDEO_UNAVAILABLE` wraca jako `WorkoutSaveError`).
Zapis i przekierowanie:

```ts
    const saved = await saveWorkoutLog(
      api,
      {
        planSessionId: session.id,
        performedOn: performedOnParse.data,
        note,
        allDone: allSetsFilled,
        exercises: exercisesPayload,
      },
      { idempotencyKey },
    );

    // Pobite rekordy przychodzą w odpowiedzi `201` — identyfikatory ćwiczeń idą
    // w adresie, żeby strona szczegółu odpaliła toast. Sygnał `saved` każe jej
    // wyczyścić szkic tej sesji z sessionStorage.
    const params = new URLSearchParams();
    if (saved.personalRecords.length > 0) {
      params.set("pr", saved.personalRecords.map((p) => p.exerciseId).join(","));
    }
    params.set("saved", session.id);
    throw redirect(`/podopieczny/historia/${saved.id}?${params.toString()}`);
```

Blok `catch` bez zmian poza komentarzem: „Nie ma już czego sprzątać" → „Nieużyte nagrania sprząta
zamiatacz sierot po stronie BE (24 h karencji)". W komponencie `LogForm`: do destrukturyzacji
`useLoaderData` dopisz `idempotencyKey`, a w `<Form method="post" …>` jako pierwsze dziecko:

```tsx
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
```

- [ ] **Krok 4: Usuń `detectNewPRsForLog` z `app/lib/stats.ts` i test integracyjny nagrań**

W `stats.ts` usuń `NewPRForLog` i `detectNewPRsForLog` (koniec pliku, od wiersza ~1080) razem
z prywatnymi pomocniczymi, które tracą przez to ostatnie użycie (sprawdź Grepem każdą nazwę).
Usuń `tests/workout-video-ids.itest.ts` i jego wiersz w `tests/README.md`.

- [ ] **Krok 5: Korekta dokumentacji**

`app/lib/README.md`, wiersz `workouts.ts` — od tego zadania moduł jest w całości na kontrakcie;
tymczasowe zdanie: „**W całości na kontrakcie** — pełny opis w Zadaniu 9" plus lista funkcji
z „Interfaces" tego i poprzednich zadań; usuń zdania o `assertOwnedUnclaimedVideos`
i `findUnusableVideoIds`. Wiersz `stats.ts`: usuń `detectNewPRsForLog` z listy, dopisz „(rekordy
przychodzą w odpowiedzi `POST /v1/workout-logs`)". `app/routes/podopieczny/README.md`, wiersz
`loguj.$sessionId.tsx`: „zapis przez `saveWorkoutLog`, wykrywanie nowych PR-ów" → „zapis jednym
`POST /v1/workout-logs` (`saveWorkoutLog(api)`) z kluczem idempotencji z loadera; rekordy z odpowiedzi
`201`"; „które akcja weryfikuje przez `assertOwnedUnclaimedVideos`" → „których własność sprawdza BE
(`409 SET_VIDEO_UNAVAILABLE` → komunikat w formularzu)"; usuń zdanie o braku ograniczenia unikalności
w bazie (klucz idempotencji je zastępuje).

- [ ] **Krok 6: Bramki i commit**

```bash
npx vitest run app/lib/workouts.test.ts --no-file-parallelism
npx biome format --write app/lib/workouts.ts app/lib/workouts.test.ts app/lib/stats.ts app/routes/podopieczny/loguj.\$sessionId.tsx
```

```bash
git add app/lib/workouts.ts app/lib/workouts.test.ts app/lib/stats.ts app/routes/podopieczny/loguj.\$sessionId.tsx tests/workout-video-ids.itest.ts tests/README.md app/lib/README.md app/routes/podopieczny/README.md
git commit -m "feat(dziennik): zapis treningu przez kontrakt z kluczem idempotencji, koniec bazy w workouts.ts"
```

---

### Zadanie 8: Wysyłka nagrania serii przez kontrakt

**Files:**
- Modify: `app/lib/file-uploads.ts` (dochodzi `uploadSetVideo`; `uploadExerciseDemo` i ona dzielą prywatną `uploadThroughContract`)
- Modify: `app/lib/file-uploads.test.ts`
- Modify: `app/routes/upload.wideo.tsx`
- Create: `app/routes/upload.wideo.test.ts`
- Delete: `app/lib/rate-limit.ts`, `app/lib/rate-limit.test.ts`, `tests/upload-wideo.itest.ts`
- Modify: `tests/README.md`, `app/lib/README.md`, `app/routes/README.md`

**Interfaces:**
- Consumes: `filesControllerSetVideo`, `filesControllerExerciseDemo`, `filesControllerConfirm`, typ
  `UploadResultDto` z `@kalisthenos/api-client`; `ApiError` (z `retryAfter`) z `~/lib/api/errors`;
  `apiContext`, `AuthUser` z `~/lib/api/context` (test trasy).
- Produces:
  - `uploadSetVideo(api: Api, file: File): Promise<string>` — identyfikator pliku po `confirm`; `UploadError` z `400`/`409`/`413` i dla pustego/za dużego pliku PRZED wysyłką.
  - Trasa `/upload/wideo`: `200 { fileId, bytes }`; odmowy jako `{ error }` ze statusem BE (`403`, `429` + `Retry-After`, `413` → `400` przez `UploadError`), `402` z bramki płatności, `400` bez pliku.

Decyzje C11, C12, C13. `uploadFile(db, …)` zostaje — woła je jeszcze sylwetka (`body_photo`).

- [ ] **Krok 1: Dopisz testy w `app/lib/file-uploads.test.ts`**

Do importu z `./file-uploads` dodaj `uploadSetVideo`. Na końcu pliku, po bloku `uploadExerciseDemo`
(pomocnicze `klientPlikow`, `wideo`, `wideoORozmiarze` już są):

```ts
describe("uploadSetVideo — nagranie serii przez kontrakt", () => {
  it("wysyła multipartem na `/v1/files/set-video` i potwierdza plik", async () => {
    // Rodzaj pliku wynika z użytej operacji, nie z parametru (`docs/04` §8) —
    // ta sama dwufazowa ścieżka co demo, inny adres pierwszej fazy.
    const trafienia: string[] = [];
    const api = klientPlikow((req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/set-video") {
        return new Response(JSON.stringify({ id: "f-2", bytes: 10, mimeType: "video/mp4" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });

    expect(await uploadSetVideo(api, wideo(10))).toBe("f-2");
    expect(trafienia).toEqual(["POST /v1/files/set-video", "POST /v1/files/f-2/confirm"]);
  });

  it("stosuje NIŻSZY limit wideo (30 MB) i odrzuca bez wywołania sieci", async () => {
    // Demo ćwiczenia ma limit ogólny (250 MB), nagranie serii — limit wideo.
    // Wspólna ścieżka musi wziąć limit z rodzaju, nie z jednej stałej.
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    const blad = await uploadSetVideo(api, wideoORozmiarze(30_000_001)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toContain("30 MB");
    expect(wywolan).toBe(0);
  });

  it("`413` z kontraktu wraca jako UploadError z komunikatem BE, a `500` jako ApiError", async () => {
    const zaDuzy = klientPlikow(() =>
      new Response(JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Plik przekracza limit rozmiaru." } }), {
        status: 413,
        headers: { "content-type": "application/json" },
      }),
    );
    const awaria = klientPlikow(() =>
      new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Ups." } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    const odmowa = await uploadSetVideo(zaDuzy, wideo(10)).catch((e: unknown) => e);
    const blad = await uploadSetVideo(awaria, wideo(10)).catch((e: unknown) => e);

    expect(odmowa).toBeInstanceOf(UploadError);
    expect((odmowa as UploadError).userMessage).toBe("Plik przekracza limit rozmiaru.");
    expect(blad).toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Krok 2: Wydziel wspólną ścieżkę w `app/lib/file-uploads.ts`**

Rozszerz import z `@kalisthenos/api-client` o `filesControllerSetVideo` i `import type { UploadResultDto }`.
Zamień `uploadExerciseDemo` (wiersze 312–359, razem z docblockiem) na:

```ts
/**
 * Wspólna, dwufazowa ścieżka wysyłki przez kontrakt (§8 krok 4 specu): limit
 * rozmiaru sprawdzony PRZED wysłaniem (plik jest już w pamięci po
 * `request.formData()`, a `413` po kilkudziesięciu megabajtach nic nie
 * oszczędza), potem `POST /v1/files/{rodzaj}` i `POST /v1/files/{id}/confirm`.
 * Rodzaj wynika z użytej operacji kontraktu, nie z parametru — klient nie
 * decyduje, co wgrywa (`docs/04` §8); `kind` służy tu wyłącznie do wyboru limitu.
 *
 * **Czego tu NIE MA i dlaczego:**
 * - kontroli deklarowanego MIME — BE sprawdza typ PO ZAWARTOŚCI w locie, co jest
 *   mocniejsze niż `file.type` od klienta;
 * - `UploadCleanupQueue` — sprzątanie po nieudanym zapisie przejął BE
 *   (`orphan-files-sweep`, 24 h karencji dla pliku, na który nic nie wskazuje).
 *
 * `confirm` niczego dziś nie zapisuje (`FilesService.confirm` sprawdza istnienie
 * i tenant) — plik przed zamiataczem ratuje dopiero PODPIĘCIE do ćwiczenia albo
 * do serii treningu.
 */
async function uploadThroughContract(
  api: Api,
  file: File,
  kind: UploadKind,
  send: (file: File) => Promise<{ data: UploadResultDto }>,
): Promise<string> {
  if (file.size === 0) {
    throw new UploadError("empty file", "Plik jest pusty.");
  }
  const maxBytes = maxUploadBytesFor(kind);
  if (file.size > maxBytes) {
    throw new UploadError(
      `file too large: ${file.size} > ${maxBytes}`,
      `Plik za duży (limit: ${Math.floor(maxBytes / 1_000_000)} MB).`,
    );
  }

  let fileId: string;
  try {
    const { data } = await send(file);
    fileId = data.id;
  } catch (e) {
    // Wąsko: trzy statusy, dla których BE ma komunikat o SAMYM PLIKU i dla których
    // trasa pokazuje tekst użytkownikowi. `401`/`403`/`404`/`429` to sprawa sesji,
    // tenanta i limitów — te lecą dalej i obsługuje je wołający.
    if (e instanceof ApiError && (e.status === 400 || e.status === 409 || e.status === 413)) {
      throw new UploadError(`upload rejected: ${e.code}`, e.message);
    }
    throw e;
  }

  await filesControllerConfirm({ client: api, path: { id: fileId }, throwOnError: true });
  return fileId;
}

/** Demo ćwiczenia (`exercise_demo`, limit ogólny) — `POST /v1/files/exercise-demo`. */
export async function uploadExerciseDemo(api: Api, file: File): Promise<string> {
  return await uploadThroughContract(api, file, "exercise_demo", (plik) =>
    filesControllerExerciseDemo({ client: api, body: { file: plik }, throwOnError: true }),
  );
}

/**
 * Nagranie serii (`set_video`, niższy limit wideo) — `POST /v1/files/set-video`.
 * Druga z trzech ścieżek na kontrakcie; na bazie zostaje wyłącznie `body_photo`.
 * Zwrócony identyfikator NICZEGO nie uprawnia — własność sprawdza dopiero BE przy
 * zapisie treningu (`409 SET_VIDEO_UNAVAILABLE`).
 */
export async function uploadSetVideo(api: Api, file: File): Promise<string> {
  return await uploadThroughContract(api, file, "set_video", (plik) =>
    filesControllerSetVideo({ client: api, body: { file: plik }, throwOnError: true }),
  );
}
```

- [ ] **Krok 3: Napisz `app/routes/upload.wideo.test.ts`**

```ts
// @vitest-environment node
//
// `node`, nie happy-dom: trasa buduje `Request` z `FormData` i czyta nagłówki
// odpowiedzi — w happy-dom `Request`/`Response` różnią się od Node-owych
// (patrz `wyloguj.test.ts`).
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    API_URL: "http://be.test",
    MAX_UPLOAD_BYTES: 250_000_000,
    MAX_VIDEO_UPLOAD_BYTES: 30_000_000,
  }),
}));
// Bramka płatności zostaje w trasie (obszar poza zakresem integracji) — tu
// przepuszcza, żeby test badał ścieżkę kontraktu, nie Stripe'a.
vi.mock("~/lib/stripe/gate", () => ({
  hasTraineeAppAccess: async () => ({ hasAccess: true, sub: null }),
}));
vi.mock("~/lib/db/client", () => ({ db: {} }));
vi.mock("~/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  errorMeta: () => ({}),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { type AuthUser, apiContext } from "~/lib/api/context";
import { action } from "./upload.wideo";

const PODOPIECZNY: AuthUser = {
  id: "u-1",
  email: "anna@example.pl",
  displayName: "Anna Kowalska",
  roles: ["trainee"],
  trainerId: "t-1",
  trainerName: "Trener",
};

function scenariusz(odpowiedz: (req: Request) => Response, plik: File | null = new File([new Uint8Array(3)], "s.mp4", { type: "video/mp4" })) {
  const trafienia: string[] = [];
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "A1",
      fetch: (async (req: Request) => {
        trafienia.push(`${req.method} ${new URL(req.url).pathname}`);
        return odpowiedz(req);
      }) as unknown as typeof fetch,
    }),
    user: PODOPIECZNY,
  });
  const fd = new FormData();
  if (plik) fd.append("file", plik);
  return {
    trafienia,
    args: {
      request: new Request("https://fe.test/upload/wideo", { method: "POST", body: fd }),
      params: {},
      context,
    },
  };
}

function odmowa(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("upload.wideo — trasa zasobowa nad kontraktem", () => {
  it("wgrywa dwufazowo i oddaje czysty JSON `{ fileId }` ze statusem 200", async () => {
    // Konsumentem jest surowy XHR (`components/video-upload-field.tsx`), który robi
    // `JSON.parse` na `responseText` i czyta `fileId` — kształt odpowiedzi jest
    // kontraktem z komponentem, nie z React Routerem.
    const s = scenariusz((req) =>
      new URL(req.url).pathname === "/v1/files/set-video"
        ? new Response(JSON.stringify({ id: "f-1", bytes: 3, mimeType: "video/mp4" }), {
            status: 201,
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 204 }),
    );

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(await res.text())).toEqual({ fileId: "f-1", bytes: 3 });
    expect(s.trafienia).toEqual(["POST /v1/files/set-video", "POST /v1/files/f-1/confirm"]);
  });

  it("`403 ONBOARDING_FORM_PENDING` z BE wraca jako JSON 403 z komunikatem BE", async () => {
    // Bramka formularza startowego przeszła do BE (`OnboardingGuard` obejmuje
    // wysyłki); trasa nie ma już własnej kopii i nie tłumaczy komunikatu.
    const s = scenariusz(() => odmowa(403, "ONBOARDING_FORM_PENDING", "Najpierw wypełnij formularz startowy."));

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(403);
    expect(JSON.parse(await res.text())).toEqual({ error: "Najpierw wypełnij formularz startowy." });
  });

  it("`429` z BE niesie `Retry-After` dalej do XHR", async () => {
    // Limit wysyłek liczy BE, kluczowany tożsamością (ADR-0031). Sekundy z nagłówka
    // przechodzą przez `ApiError.retryAfter` — bez tego klient nie wie, ile czekać.
    const s = scenariusz(() => odmowa(429, "TOO_MANY_REQUESTS", "Za dużo wysyłek.", { "retry-after": "30" }));

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(JSON.parse(await res.text())).toEqual({ error: "Za dużo wysyłek." });
  });

  it("bez pliku odpowiada 400 bez wołania BE", async () => {
    const s = scenariusz(() => new Response(null, { status: 500 }), null);

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(400);
    expect(s.trafienia).toEqual([]);
  });
});
```

- [ ] **Krok 4: Przepnij `app/routes/upload.wideo.tsx`**

Cały plik:

```ts
import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/api/auth";
import { ApiError } from "~/lib/api/errors";
import { db } from "~/lib/db/client";
import { UploadError, uploadSetVideo } from "~/lib/file-uploads";
import { errorMeta, logger } from "~/lib/logger";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";

/**
 * Zawsze JAWNY `Response`, nigdy goły obiekt ani `data()`.
 *
 * Tę trasę woła surowy XMLHttpRequest (`components/video-upload-field.tsx`), który
 * robi `JSON.parse` na `responseText` — musi dostać czysty JSON, a nie format
 * wewnętrzny React Routera.
 */
function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/**
 * Trasa zasobowa (bez komponentu): JEDNO nagranie serii → `fileId`.
 *
 * Zostaje trasą FE, choć bajty idą dalej do BE: `VideoUploadField` wysyła
 * XMLHttpRequestem z paskiem postępu na TEN SAM origin, a BE nie ma CORS-u
 * i nie jest wołany z przeglądarki (D3 specu). Komponent nie zmienia się.
 *
 * Co przeszło do BE razem z bajtami: typ po zawartości, rodzaj z operacji
 * (`POST /v1/files/set-video`), bramka formularza startowego (`403
 * ONBOARDING_FORM_PENDING` — `OnboardingGuard` obejmuje wysyłki), limit liczby
 * wysyłek (`429` + `Retry-After`, kluczowany tożsamością — ADR-0031) i własność
 * pliku przy zapisie treningu. Bramka płatności zostaje tu, bo płatności są poza
 * zakresem integracji. Odmowy BE wracają do XHR jako JSON z komunikatem BE
 * i tym samym statusem.
 */
export async function action(args: ActionFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainee" });

  const { hasAccess } = await hasTraineeAppAccess(db, user);
  if (!hasAccess) {
    return json({ error: "Subskrypcja nieaktywna. Odśwież stronę." }, 402);
  }

  const fd = await args.request.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "Brak pliku." }, 400);
  }

  try {
    const fileId = await uploadSetVideo(api, file);
    logger.info("upload.set_video.ok", { fileId, bytes: file.size });
    return json({ fileId, bytes: file.size }, 200);
  } catch (err) {
    // Martwa sesja: middleware kończy ją przekierowaniem rzuconym PRZEZ interceptor
    // klienta — to sygnał sterowania, nie błąd danych. Przepuszczony przed
    // `ApiError`, inaczej `/login` zamieniłoby się w JSON 500.
    if (err instanceof Response) throw err;
    if (err instanceof UploadError) {
      // Komunikat już jest po polsku i bezpieczny do pokazania (rozmiar/format).
      return json({ error: err.userMessage }, 400);
    }
    if (err instanceof ApiError) {
      const headers = err.retryAfter != null ? { "Retry-After": String(err.retryAfter) } : undefined;
      return json({ error: err.message }, err.status, headers);
    }
    logger.error("upload.set_video.failed", errorMeta(err));
    return json({ error: "Nie udało się wgrać nagrania. Spróbuj ponownie." }, 500);
  }
}
```

- [ ] **Krok 5: Usuń `rate-limit.ts` i test integracyjny wysyłki**

Usuń `app/lib/rate-limit.ts` i `app/lib/rate-limit.test.ts` (sprawdź Grepem w `app/`:
`rate-limit|enforceRateLimit|RATE_LIMITS` — Expected: wyłącznie komentarz w `login.tsx:38`,
który mówi, że limitu tu nie ma; zostaw go). Usuń `tests/upload-wideo.itest.ts` i jego wiersz
w `tests/README.md`.

- [ ] **Krok 6: Korekta dokumentacji**

`app/lib/README.md`: wiersz `file-uploads.ts` — „**Ścieżka `exercise_demo` teraz na kontrakcie** …
pozostałe dwa rodzaje (`set_video`, `body_photo`) zostają na bazie" → „**Dwie z trzech ścieżek na
kontrakcie** — `uploadExerciseDemo(api, file)` i `uploadSetVideo(api, file)`, obie dwufazowe
(`POST /v1/files/{rodzaj}` → `POST /v1/files/{id}/confirm`) przez wspólną prywatną
`uploadThroughContract` (limit z rodzaju PRZED wysyłką, `UploadError` wąsko z `400`/`409`/`413`);
na bazie zostaje wyłącznie `body_photo`". Usuń wiersz `rate-limit.ts`. `app/routes/README.md`,
wiersz `upload.wideo.tsx`: „JEDNO nagranie serii → `{ fileId, bytes }` przez kontrakt
(`uploadSetVideo`, dwie fazy). Trasa zostaje po stronie FE, bo XHR z paskiem postępu woła własny
origin. Bramka płatności (`hasTraineeAppAccess` → 402) zostaje; bramka formularza startowego
i limit wysyłek przeszły do BE — ich odmowy wracają jako JSON z komunikatem BE i tym samym
statusem (`403`, `429` + `Retry-After`). `kind` wynika z operacji kontraktu. Zwrócony `fileId`
sam w sobie NIC nie uprawnia — własność weryfikuje BE przy zapisie treningu."

- [ ] **Krok 7: Bramki i commit**

```bash
npx vitest run app/lib/file-uploads.test.ts app/routes/upload.wideo.test.ts --no-file-parallelism
npx biome format --write app/lib/file-uploads.ts app/lib/file-uploads.test.ts app/routes/upload.wideo.tsx app/routes/upload.wideo.test.ts
```

```bash
git add app/lib/file-uploads.ts app/lib/file-uploads.test.ts app/routes/upload.wideo.tsx app/routes/upload.wideo.test.ts app/lib/rate-limit.ts app/lib/rate-limit.test.ts tests/upload-wideo.itest.ts tests/README.md app/lib/README.md app/routes/README.md
git commit -m "feat(pliki): nagranie serii przez kontrakt, limit wysylek i bramka formularza w BE"
```

---

### Zadanie 9: Sprzątanie, dokumentacja i domknięcie obszaru

**Files:**
- Modify: `app/lib/README.md` (wiersze `workouts.ts`, `trainees.ts`, `stats.ts`, `wrapped.ts`, `views.ts`, `file-uploads.ts`)
- Modify: `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`, `app/routes/README.md`
- Modify: `CLAUDE.md` (konwencja „Pliki: dwie ścieżki")
- Modify: `docs/superpowers/plans/README.md` (nowy wiersz)

**Interfaces:** bez nowych symboli. To zadanie sprawdza, że obszar jest domknięty, i pisze
końcowe opisy zamiast ośmiu tymczasowych korekt.

- [ ] **Krok 1: Sprawdź domknięcie obszaru**

Każde przez Grep (nie `grep -r` w Bash):

| Wzorzec | Zakres | Expected |
|---|---|---|
| `drizzle-orm\|~/lib/db\|~/lib/logger` | `app/lib/workouts.ts` | brak |
| `from "~/lib/workouts"` | `app/routes/**` | wyłącznie siedem plików (pulpit podopiecznego i pulpit trenera biorą z `views`, nie stąd): `podopieczny/historia._index.tsx`, `podopieczny/historia.$logId.tsx`, `podopieczny/sesje._index.tsx`, `podopieczny/sesje.$sessionId.tsx`, `podopieczny/loguj.$sessionId.tsx`, `trener/podopieczni.$traineeId.tsx`, `trener/podopieczni.$traineeId.log.$logId.tsx` — i w każdym import tylko funkcji z „Interfaces" Zadań 3–7 |
| `~/lib/db/client` | siedem plików wyżej + `trener/_index.tsx`, `podopieczny/_index.tsx`, `upload.wideo.tsx` | obecny WYŁĄCZNIE w `trener/podopieczni.$traineeId.tsx` (statystyki, konsultacje, formularz), `trener/podopieczni.$traineeId.log.$logId.tsx` (`getTraineeOfTrainer`), `podopieczny/_layout.tsx` (bramki, trzy liczniki), `trener/podopieczni._index.tsx` (zaproszenia), `upload.wideo.tsx` (bramka płatności) |
| `signFileUrl` | `app/routes/**` | wyłącznie `podopieczny/sylwetka.tsx`, `trener/podopieczni.$traineeId.sylwetka.tsx` |
| `getHeroStats\|getThisWeekStats\|getEffortBalance\|detectNewPRsForLog\|computeStreak\|getAvailableWrappedMonths\|getLatestAvailableWrapped\|loadLogForViewer\|assertOwnedUnclaimedVideos\|findUnusableVideoIds\|countLogsForTrainee\|countClientsForTrainer\|listRecentLogsForTrainer\|countLogsForTrainerSince\|findActivePlanForTrainee\|loadActivePlanSummaryForTrainee\|loadActivePlanFullForTrainee\|enforceRateLimit` | `app/`, `tests/` | brak (poza komentarzem w `login.tsx` o limicie prób) |
| `lists-sort-filter-tenant-scope\|rpe-toggle\|workout-video-ids\|upload-wideo` | `tests/README.md` | brak |

Każde trafienie poza „Expected" to niedokończone zadanie z listy wyżej — dokończ je tam, nie tutaj.

- [ ] **Krok 2: Końcowy wiersz `workouts.ts` w `app/lib/README.md`**

Zastąp tymczasowe zdania z Zadań 1–7 jednym wierszem:

„`workouts.ts` | **W całości na kontrakcie** (`api: Api`, żadna funkcja nie stoi już na `db`).
Kontrakt rozdziela trasy podopiecznego i trenera, więc jedna dawna funkcja z parametrem `viewer`
to dziś dwie. **Odczyt:** `listMyLogs(api, { page, sort, q?, video? })` i `listTraineeLogs(api,
traineeId, …)` — cała strona z kontraktu (20/stronę, stronę spoza zakresu przycina BE; cudzy
podopieczny to pusta strona, nie `404`); `loadMyLog(api, id)` i `loadTraineeLog(api, traineeId, id)`
— szczegół z pełnym drzewem serii (`| null` mapuje `404`; `videoUrl` ze ścieżki kontraktu na adres
przez `publicFileUrl` W MODULE; bez liczby oczekiwanych serii — pominięte w środku widać z luk
w `ordinal`, o ogonie mówi `allDone`); `loadMyActivePlan(api)` (`GET /v1/me/plan`, `| null` —
brak planu to `404 PLAN_NOT_FOUND`, stan normalny); `loadSessionForLogging(api, sessionId)`
(`GET /v1/me/plan/sessions/{id}`, `demoUrl` z originem; sesja planu archiwalnego przechodzi,
szkicu — `409 PLAN_NOT_PUBLISHED` leci dalej); czysta `toLoggingEntries(session)` spłaszcza sesję
do `LoggingEntry` (dropset: liczba serii z BLOKU). **Zapis:** `saveWorkoutLog(api, input,
{ idempotencyKey? })` → `CreatedWorkoutLogView` z `personalRecords` — jedno żądanie
`POST /v1/workout-logs` z nagłówkiem `Idempotency-Key`, ciało składane jawnie pole po polu (BE
odrzuca pola spoza DTO), `WorkoutSaveError` wąsko z `400`/`404`/`409`. **Trzy rzeczy do
zapamiętania:** (1) własność nagrań, przynależność ćwiczeń do sesji, reguły RPE, data z przyszłości
i pusty trening są regułami BE — moduł tylko niesie ich komunikaty; (2) sortowania i filtry są
identyczne z kontraktem, `all` to brak parametru, słownika nie ma; (3) `videoUrl` jest podpisany
tożsamością PYTAJĄCEGO — trener i podopieczny dostają różne adresy na to samo nagranie. Zniknęły
bez zamiennika: `countLogsForTrainee` (strona niesie `total`), `loadActivePlanSummaryForTrainee`,
`listRecentLogsForTrainer`, `countLogsForTrainerSince` (pulpity z `views.ts`),
`findActivePlanForTrainee`, `loadActivePlanFullForTrainee` (sesję bierze się po id),
`assertOwnedUnclaimedVideos`, `findUnusableVideoIds` (BE), `loadLogForViewer` (dwie funkcje wyżej);
`listClientsForTrainer` przeszła do `trainees.ts`. |"

Sprawdź też, że wiersze `trainees.ts`, `stats.ts`, `wrapped.ts`, `views.ts`, `file-uploads.ts` mówią
to, co po Zadaniach 1–8 jest prawdą, bez zwrotów „jeszcze"/„do Zadania N".

- [ ] **Krok 3: README tras**

`app/routes/podopieczny/README.md` — wiersze `_layout.tsx`, `_index.tsx`, `sesje._index.tsx`,
`sesje.$sessionId.tsx`, `loguj.$sessionId.tsx`, `historia._index.tsx`, `historia.$logId.tsx`: usuń
zwroty tymczasowe („jeszcze z bazy", „do Zadania N") i sprawdź, że każdy nazywa funkcję z kontraktu,
którą woła. Na końcu, w „Główne moduły wołane stąd": `lib/files` zostaje (sylwetka), `lib/stats`
zostaje (sylwetka), dopisz `lib/views`. `app/routes/trener/README.md` — wiersze `_index.tsx`,
`podopieczni._index.tsx`, `podopieczni.$traineeId.tsx`, `podopieczni.$traineeId.log.$logId.tsx`:
to samo; w „Główne moduły wołane stąd" dopisz `lib/views`. `app/routes/README.md` — wiersz
`upload.wideo.tsx` z Zadania 8 bez zmian; sprawdź, że nie wspomina `rate-limit`.

- [ ] **Krok 4: `CLAUDE.md` — konwencja plików**

W „Kluczowe konwencje", punkt „**Pliki: dwie ścieżki, bo migracja jest w toku.**" zamień na:

„**Pliki: dwie ścieżki, bo migracja jest w toku.** Na wolumenie zostały wyłącznie zdjęcia
sylwetki (`body_photo`): nigdy nie serwuj ścieżek z dysku wprost, używaj `signFileUrl`/`verifyFileUrl`
(`app/lib/files.ts`), trasy `files/$fileId` i `uploadFile` z walidacją magic-bytes. **Demo ćwiczeń
(`exercise_demo`) i nagrania serii (`set_video`) chodzą już kontraktem BE:** wysyłka dwufazowa przez
`uploadExerciseDemo`/`uploadSetVideo` (typ sprawdza BE po zawartości, nie FE; trasa `/upload/wideo`
zostaje jako cienka trasa zasobowa dla XHR z paskiem postępu), a odnośnik podpisuje BE i przychodzi
jako ŚCIEŻKA — origin dokłada `publicFileUrl` z `app/lib/api/client.ts` (`API_PUBLIC_URL`)
w module, nigdy w trasie."

W tabeli „Stack", wiersz „Pliki": „Wolumen na dysku …" → „Zdjęcia sylwetki na wolumenie przez
`FileStorage`; demo ćwiczeń i nagrania serii w BE (R2), odczyt po podpisanych adresach BE".

- [ ] **Krok 5: Wiersz w `docs/superpowers/plans/README.md`**

Po wierszu `2026-09-02-plany-na-kontrakcie.md` dopisz:

„| `2026-09-02-dziennik-na-kontrakcie.md` | **Etap 2 krok 3 integracji FE/BE, trzeci obszar**
(spec: [`../specs/2026-08-29-integracja-fe-be-design.md`](../specs/2026-08-29-integracja-fe-be-design.md)):
`app/lib/workouts.ts` przechodzi z Drizzle na kontrakt — kontrakt rozdziela trasy podopiecznego
i trenera, więc `loadLogForViewer` staje się parą `loadMyLog`/`loadTraineeLog`, listy oddają całą
stronę (liczniki znikają), sesję do logowania bierze się po id (`findActivePlanForTrainee` znika,
o dopuszczalności decyduje BE), a zapis to jedno `POST /v1/workout-logs` z kluczem idempotencji
i rekordami w odpowiedzi (`assertOwnedUnclaimedVideos`, `detectNewPRsForLog` znikają — BE).
Pulpit podopiecznego w całości z `GET /v1/me/home` (osiem zapytań trzech modułów → jeden widok;
`getHeroStats`/`getThisWeekStats`/`getEffortBalance` znikają), pulpit trenera domyka B5.
`listClientsForTrainer` przechodzi do `trainees.ts` (`GET /v1/trainees`). Nagranie serii wysyłane
dwufazowo przez kontrakt (`uploadSetVideo`); `/upload/wideo` zostaje trasą zasobową dla XHR,
a bramka formularza i limit wysyłek przechodzą do BE (`rate-limit.ts` znika). Znikają cztery
`tests/*.itest.ts`. Dziesięć widocznych ubytków spisanych jako luki L1–L10 (L1–L8 to pola do dołożenia addytywnie po stronie BE,
L9–L10 to decyzje po stronie FE). 9 zadań. |"

- [ ] **Krok 6: Bramki i commit**

Jeden przebieg wszystkich testów tego obszaru plus bramka szwu:

```bash
npx vitest run app/lib/workouts.test.ts app/lib/trainees.test.ts app/lib/views.test.ts app/lib/wrapped.test.ts app/lib/file-uploads.test.ts app/routes/upload.wideo.test.ts app/routes/no-direct-db.test.ts --no-file-parallelism
```

Expected: PASS. Potem — **checkpoint Właściciela**, po kolei i osobno:
`npm run typecheck`, `npm run lint`, `npx vitest run app --no-file-parallelism`, `npm run build`.
Commit:

```bash
git add app/lib/README.md app/routes/README.md app/routes/podopieczny/README.md app/routes/trener/README.md CLAUDE.md docs/superpowers/plans/README.md docs/superpowers/plans/2026-09-02-dziennik-na-kontrakcie.md
git commit -m "docs(dziennik): domkniecie obszaru dziennika treningowego na kontrakcie BE"
```

---

## Definition of done

- `app/lib/workouts.ts` nie importuje `drizzle-orm`, `~/lib/db/*` ani `~/lib/logger`; każda z jego
  funkcji bierze `api: Api`.
- Dwanaście tras dziennika woła wyłącznie funkcje z „Interfaces" Zadań 1–8; `db` zostaje w pięciu
  z nich wyłącznie dla funkcji innych obszarów (tabela w Zadaniu 9, krok 1).
- Pulpit trenera, pulpit podopiecznego i powłoka podopiecznego nie wołają żadnej funkcji liczącej
  z modułów domenowych — biorą pola z `views.ts`.
- Cztery testy integracyjne usunięte, jeden przycięty; `tests/README.md` bez ich wierszy.
- `app/routes/no-direct-db.test.ts` zielony; testy jednostkowe obszaru zielone w jednym przebiegu.
- Luki L1–L10 spisane w tym planie i wymienione Właścicielowi w podsumowaniu obszaru — decyzja
  o dołożeniu pól po stronie BE jest jego, nie tego planu.
