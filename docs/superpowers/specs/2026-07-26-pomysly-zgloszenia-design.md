# Pomysły — zgłoszenia podopiecznych (design)

Data: 2026-07-26
Status: zatwierdzony do implementacji

## Problem

Podopieczny używa aplikacji codziennie i najszybciej zauważa, czego w niej
brakuje albo co działa źle. Dziś nie ma gdzie tego powiedzieć — uwagi giną w
rozmowie na treningu albo w prywatnej wiadomości i nie docierają do osoby, która
może je zamienić w zmianę. Trener nie ma listy takich sygnałów, więc nie wie,
które bolączki wracają.

## Cel

Dać podopiecznemu miejsce na zgłoszenie pomysłu lub błędu, a trenerowi jedną
skrzynkę ze wszystkimi zgłoszeniami jego podopiecznych — z odpowiedzią wracającą
do autora, żeby pętla się domykała.

## Non-goals

- Brak wspólnej tablicy i głosowania — zgłoszenie widzi tylko autor i jego trener.
- Brak wątku komentarzy. Jedna odpowiedź trenera na zgłoszenie, nie dyskusja.
- Brak załączników (zrzutów ekranu) — zero nowej powierzchni uploadu.
- Brak powiadomień e-mail/push. Sygnałem jest odznaka w nawigacji.
- Brak edycji zgłoszenia przez autora.
- Zgłoszenia nie wychodzą poza parę trener↔podopieczny (żadnego kanału „do
  twórcy aplikacji" — trener jest lejkiem).

## Decyzje

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Widoczność | prywatnie: autor + jego trener | wspólna tablica wymaga moderacji i naraża podopiecznych na siebie nawzajem; nie ma dziś takiej potrzeby |
| Rola trenera | ustawia status **i** może dopisać odpowiedź | bez odpowiedzi zwrotnej ludzie przestają zgłaszać po drugim zignorowanym pomyśle |
| Treść zgłoszenia | tytuł + opis + typ | typ daje trenerowi filtr „pomysły vs błędy" bez kosztu uploadu |
| Miejsce u trenera | jedna lista zbiorcza `/trener/pomysly` | trener czyta zgłoszenia jak skrzynkę, nie krążąc po profilach klientów |
| Usuwanie | autor może usunąć własne, dopóki status = `new` | po odpowiedzi trenera skasowanie zabrałoby rozmowę spod trenera |
| Odpowiedź | jedna kolumna na wierszu, nadpisywalna | historia odpowiedzi to osobna tabela i osobny problem; YAGNI |

## Model danych

Nowa tabela `feature_requests` w `app/lib/db/schema.ts` + dwa enumy.

```
feature_request_kind   = ('idea', 'bug', 'other')
feature_request_status = ('new', 'considering', 'planned', 'done', 'rejected')
```

| Kolumna | Typ | Reguła |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `trainer_id` | uuid NOT NULL → `users.id` ON DELETE CASCADE | denormalizacja tenant-scope, jak w `workout_logs` |
| `trainee_id` | uuid NOT NULL → `users.id` ON DELETE CASCADE | autor zgłoszenia |
| `kind` | `feature_request_kind` NOT NULL | domyślnie `idea` |
| `title` | text NOT NULL | 3–120 znaków (walidacja Zod) |
| `body` | text NOT NULL | 10–2000 znaków |
| `status` | `feature_request_status` NOT NULL DEFAULT `new` | |
| `trainer_response` | text NULL | ≤2000 znaków; NULL = brak odpowiedzi |
| `responded_at` | timestamptz NULL | ustawiane, gdy trener zapisuje niepustą odpowiedź |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | dotykane przy każdej zmianie statusu/odpowiedzi |

Indeksy:
- `feature_requests_trainee_created_idx` na `(trainee_id, created_at)` — lista podopiecznego,
- `feature_requests_trainer_status_idx` na `(trainer_id, status)` — odznaka „nowe" i filtr,
- `feature_requests_trainer_created_idx` na `(trainer_id, created_at)` — lista zbiorcza.

Migracja: edycja `schema.ts` → `npm run db:generate` (uruchamia właściciel w TTY).
Nowa tabela to czysty `CREATE TABLE` + `CREATE TYPE` — brak pytań o rename/drop.

Etykiety PL (jedno źródło prawdy w `feature-request-types.ts`):

- typ: `idea` → „Pomysł", `bug` → „Błąd", `other` → „Inne";
- status: `new` → „Nowe", `considering` → „Rozważamy", `planned` → „Zaplanowane",
  `done` → „Zrobione", `rejected` → „Odrzucone".

## Moduły

### `app/lib/feature-request-types.ts` (czyste, bez DB — cel testów jednostkowych)

- `FeatureRequestFormSchema` — Zod: `kind`, `title` (trim, 3–120), `body` (trim, 10–2000).
- `FeatureRequestResponseSchema` — Zod: `status`, `response` (trim, ≤2000, pusty → `null`).
- `FEATURE_REQUEST_KINDS`, `FEATURE_REQUEST_STATUSES` + `KIND_LABEL`, `STATUS_LABEL`.
- `statusPresentation(status)` → `{ label, tone }` — jedno źródło wyglądu plakietki
  dla obu paneli (wzorem `consultation-status.ts`, żeby status nie wyglądał
  inaczej u trenera niż u podopiecznego).
- `canTraineeDelete(status)` → `status === "new"`.
- Typy `FeatureRequestKind`, `FeatureRequestStatus`, `FeatureRequestTone`.

### `app/lib/feature-requests.ts` (repo, tenant-scope)

Każda funkcja przyjmuje wymagany `trainerId` lub `traineeId` i filtruje po nim;
brak dopasowania → `null`/`0`, trasa zamienia to na 404.

- `listForTrainee(db, traineeId, opts)` — `{ sort?: "newest"|"oldest", status?, limit, offset }`.
- `countForTrainee(db, traineeId, opts)`.
- `createFeatureRequest(db, { trainerId, traineeId, kind, title, body })`.
- `deleteFeatureRequest(db, { traineeId, id })` — kasuje tylko własne i tylko gdy
  `status = 'new'` (warunek w `WHERE`, nie w kodzie po odczycie); brak wiersza →
  `FeatureRequestError`.
- `listForTrainer(db, trainerId, opts)` — `{ sort?: "newest"|"oldest", status?, kind?, q?, limit, offset }`,
  join po autorze zwraca `displayName`.
- `countForTrainer(db, trainerId, opts)`.
- `getForTrainer(db, trainerId, id)` — szczegół + `displayName` autora; `null` gdy obcy.
- `respondToFeatureRequest(db, { trainerId, id, status, response })` — ustawia
  status, odpowiedź, `responded_at` (gdy odpowiedź niepusta) i `updated_at`.
- `countNewForTrainer(db, trainerId)` — odznaka nawigacji.
- `FeatureRequestError` z `userMessage` (konwencja `SkillError`/`ScheduleError`).

## Trasy

Nowe pliki + wpisy w `app/routes.ts`.

| Plik | URL | Eksporty | Zawartość |
|---|---|---|---|
| `app/routes/podopieczny/pomysly.tsx` | `/podopieczny/pomysly` | loader, action, default | Formularz zgłoszenia (typ, tytuł, opis) + lista własnych zgłoszeń jako karty: plakietka typu i statusu, data, treść, blok „Odpowiedź trenera" gdy jest. Sort + filtr statusu przez `<ListControls>` (URL params), paginacja 20. Akcje `create` i `delete`. |
| `app/routes/trener/pomysly._index.tsx` | `/trener/pomysly` | loader, default | Lista zbiorcza wszystkich podopiecznych: autor, typ, tytuł, data, plakietka statusu. Szukajka + sort + filtry `status` i `kind` przez `<ListControls>`, paginacja 20. Wiersz linkuje do szczegółu. |
| `app/routes/trener/pomysly.$requestId.tsx` | `/trener/pomysly/:requestId` | loader, action, default | Pełna treść zgłoszenia + metryczka (autor, data, typ) + formularz odpowiedzi: `<select>` statusu i textarea. Akcja `respond`. 404 gdy zgłoszenie nie należy do trenera. |

Osobna trasa szczegółu, nie rozwijany wiersz: opis ma do 2000 znaków i nie mieści
się w liście, a formularz odpowiedzi w każdym wierszu to n formularzy na stronie.

## Nawigacja

- Sidenav podopiecznego (`app/routes/podopieczny/_layout.tsx`): pozycja „Pomysły"
  po „Konsultacjach", licznik = liczba własnych zgłoszeń (spójnie z „Historia"/
  „Sylwetka", które też pokazują wielkość zbioru).
- Sidenav trenera (`app/routes/trener/_layout.tsx`): pozycja „Pomysły",
  odznaka = `countNewForTrainer` (liczba zgłoszeń w statusie `new`). To jedyny
  sygnał „przyszło coś nowego" — dlatego liczy tylko `new`, nie wszystko.
- Ikona: nowy wpis w `app/components/icons.tsx` (żarówka), jeśli nie ma pasującej.

Widok podopiecznego jest za bramką płatności (`_layout.tsx` odsyła nieopłaconych
na `/podopieczny/aktywuj`) — to zachowanie dziedziczone, nie zmieniamy go.

## Bezpieczeństwo i autoryzacja

- `trainerId` bierzemy z `user.trainerId` podopiecznego przy tworzeniu, nigdy z
  formularza.
- Odczyty i mutacje podopiecznego filtrują po `traineeId` z sesji; odczyty i
  mutacje trenera po `trainerId` z sesji. Obcy identyfikator w URL → 404, nie 403.
- `deleteFeatureRequest` warunkuje status w zapytaniu — wyścig „trener odpowiada
  w tej samej chwili" nie skasuje odpowiedzianego zgłoszenia.
- Treść zgłoszenia renderujemy jako tekst (React escapuje) — brak HTML,
  brak markdown.
- Brak uploadu i podpisanych URL-i. Zmiana dotyka jednak `trainer_id`, więc
  `/security-review` przed handoffem.

## Testy

Jednostkowe (TDD, `npx vitest run app/lib/feature-request-types.test.ts`):
granice Zoda (tytuł 2/3/120/121 znaków, opis 9/10/2000/2001, trim, pusty opis po
trimie), odrzucenie nieznanego `kind`/`status`, pusta odpowiedź trenera → `null`,
`statusPresentation` dla wszystkich pięciu statusów, `canTraineeDelete`.

Integracyjny (napisany, uruchamia właściciel — `tests/feature-requests.itest.ts`):
- trener B nie widzi zgłoszeń podopiecznego trenera A (`listForTrainer`, `getForTrainer`);
- podopieczny nie usunie cudzego zgłoszenia ani własnego po zmianie statusu;
- `createFeatureRequest` zapisuje `trainer_id` autora i status `new`;
- `respondToFeatureRequest` ustawia status, odpowiedź i `responded_at`, a wołane
  z obcym `trainerId` nie zmienia niczego;
- `countNewForTrainer` liczy wyłącznie `new` i wyłącznie w swoim tenancie.

## Dokumentacja do zaktualizowania

`app/lib/README.md` (dwa nowe moduły), `app/lib/db/README.md` (nowa tabela),
`app/routes/podopieczny/README.md`, `app/routes/trener/README.md`,
`tests/README.md` (nowy `*.itest.ts`), `docs/superpowers/specs/README.md`
(ten spec). Mapa w `CLAUDE.md` bez zmian — brak nowych katalogów.

## Kryteria akceptacji

1. Podopieczny wysyła zgłoszenie z `/podopieczny/pomysly` i widzi je na swojej liście ze statusem „Nowe".
2. Zgłoszenie pojawia się na `/trener/pomysly` u jego trenera i tylko u niego, a odznaka w sidenavie rośnie o 1.
3. Trener otwiera szczegół, ustawia status i pisze odpowiedź; podopieczny widzi jedno i drugie przy swoim zgłoszeniu, odznaka trenera maleje.
4. Podopieczny usuwa własne zgłoszenie ze statusem „Nowe"; po odpowiedzi trenera przycisk usuwania znika.
5. Wejście na `/trener/pomysly/:id` z cudzym identyfikatorem daje 404.
6. Bramki zielone: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
