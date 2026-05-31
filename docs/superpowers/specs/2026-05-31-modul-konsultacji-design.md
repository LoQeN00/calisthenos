# Moduł konsultacji — design

> Status: zatwierdzony do planowania. Data: 2026-05-31.
> Proces: FEATURE (`kalisthenos-dev-flow`). Następny krok: plan implementacji
> (`superpowers:writing-plans`).

## Cel i kontekst

Trener i podopieczny odbywają okresowe rozmowy (konsultacje), na których omawiają
treningi z minionego okresu — technikę, powtórzenia, RPE — a trener przekazuje
rady, poprawki i ustala zmiany w planie. Dziś te ustalenia nigdzie nie żyją w
systemie. Moduł konsultacji ma je **dokumentować**, żeby podopieczny mógł się do
nich cofać i przeczytać, co robił nie tak oraz co ma do poprawy.

Wpisuje się w istniejący model trener↔podopieczny (multi-tenant przez
`trainer_id`/`trainee_id`, panel trenera desktop-first, panel podopiecznego
mobile-first/PWA).

## Decyzje produktowe (ustalone w brainstormie)

1. **Autorstwo:** trener pisze, podopieczny **czyta** (read-only). Podopieczny nie
   komentuje ani nie edytuje.
2. **Struktura konsultacji:** wydzielone pola (data, okres, tytuł, podsumowanie) +
   osobna lista punktów „do poprawy".
3. **Punkty „do poprawy":** każdy ma treść i **status** `open`/`resolved`
   (otwarte / poprawione). Status zmienia trener (np. na kolejnej konsultacji),
   dzięki czemu widać, co jeszcze wisi do poprawy.
4. **Powiązanie z treningami:** tylko **zakres dat** (okres od–do) jako kontekst
   omówiony na spotkaniu. Bez podpinania konkretnych logów.

## Model danych (`app/lib/db/schema.ts`)

Podejście: dwie znormalizowane tabele (spójne z `plans`→`plan_sessions`,
`workout_logs`→`workout_exercise_logs`). Schemat = źródło prawdy; po edycji
`npm run db:generate` tworzy migrację (plików w `migrations/` nie edytujemy ręcznie).

### Enum

`consultation_item_status`: `['open', 'resolved']`.

### Tabela `consultations`

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `trainer_id` | uuid NN → `users.id` (onDelete cascade) | tenant-scope; denormalizacja jak w `workout_logs` |
| `trainee_id` | uuid NN → `users.id` (onDelete cascade) | |
| `held_on` | date NN | data spotkania |
| `period_from` | date NULL | okres omówiony — początek |
| `period_to` | date NULL | okres omówiony — koniec |
| `title` | text NN | tytuł konsultacji |
| `summary` | text NN default `''` | podsumowanie / uwagi (wolny tekst) |
| `created_at` | timestamptz NN defaultNow | |

- Indeksy: `consultations_trainee_date_idx` na `(trainee_id, held_on desc)`,
  `consultations_trainer_created_idx` na `(trainer_id, created_at)`.
- CHECK `consultations_period_check`: `period_from` i `period_to` oba NULL albo
  oba ustawione **i** `period_from <= period_to`.

### Tabela `consultation_action_items`

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `consultation_id` | uuid NN → `consultations.id` (onDelete cascade) | |
| `ordinal` | integer NN | kolejność; uniq `(consultation_id, ordinal)` |
| `body` | text NN | treść punktu „do poprawy" |
| `status` | `consultation_item_status` NN default `'open'` | |
| `resolved_at` | timestamptz NULL | ustawiane gdy status → `resolved`, zerowane gdy wraca do `open` |

Typy `Consultation`, `NewConsultation`, `ConsultationActionItem`,
`NewConsultationActionItem`, `ConsultationItemStatus` eksportowane jak reszta
schematu.

## Walidacja i warstwa repo

### `app/lib/consultation-types.ts` (Zod — czysta logika, cel TDD)

- `ConsultationFormSchema`: `title` wymagany (niepusty po trim), `summary`
  opcjonalny (default `''`), `heldOn` poprawna data, `periodFrom`/`periodTo`
  oba-albo-żaden + `periodFrom <= periodTo`, `items` to tablica obiektów z
  niepustym `body` i statusem z enuma.
- Eksport typów wywnioskowanych ze schematu.

### `app/lib/consultations.ts` (repo, wszystko tenant-scoped)

- `listConsultationsForTrainee(db, traineeId, { limit, offset })` → wpisy listy +
  `openItemCount` / `totalItemCount`.
- `countConsultationsForTrainee(db, traineeId)`.
- `getConsultationDetail(db, { consultationId, trainerId?, traineeId? })` →
  konsultacja + uporządkowane punkty; brak dopasowania scope → **404**.
- `createConsultation(db, { trainerId, traineeId, ...pola, items })`.
- `updateConsultation(db, { trainerId, consultationId, ...pola, items })` — edycja
  pól i punktów (tylko trener).
- `setActionItemStatus(db, { trainerId, itemId, status })` — przełącza
  `open`/`resolved`, ustawia/zeruje `resolved_at` (tylko trener; re-weryfikacja
  własności przez `trainerId`).
- `deleteConsultation(db, { trainerId, consultationId })`.
- `ConsultationError` (wzorem `WorkoutSaveError` / `PlanRepoError`).

## Trasy i UI

Każda nowa trasa = plik + wpis w `app/routes.ts`. Loadery czytają, akcje mutują;
formularze to zwykły POST (`application/x-www-form-urlencoded`, brak plików).
Warstwę wizualną prowadzi `frontend-design:frontend-design` zgodnie z
`design-system/README.md` i `app/styles/tokens.css`. UI po polsku.

### Trener (autor) — pod podopiecznym, wzorem `sylwetka`/`statystyki`

- `trener/podopieczni/:traineeId/konsultacje` — lista + przycisk „Nowa konsultacja".
- `trener/podopieczni/:traineeId/konsultacje/nowa` — formularz: data spotkania,
  okres od–do (opcjonalny), tytuł, podsumowanie, dynamiczna lista punktów „do poprawy".
- `trener/podopieczni/:traineeId/konsultacje/:konsultacjaId` — szczegóły + edycja
  + przełączanie statusu punktu (open/resolved) + usuwanie konsultacji.
- Na stronie podopiecznego u trenera (`podopieczni.$traineeId.tsx`) dodać
  kafelek/link „Konsultacje" z liczbą.

### Podopieczny (czytelnik, read-only) — nowy element sidenav „Konsultacje"

- `podopieczny/konsultacje` — lista konsultacji; w sidenav badge = liczba
  otwartych punktów „do poprawy".
- `podopieczny/konsultacje/:konsultacjaId` — szczegóły tylko do odczytu
  (podsumowanie + punkty z oznaczeniem statusu).
- Aktualizacja `app/routes/podopieczny/_layout.tsx`: nowy `NAV_ITEM` +
  policzenie badge w loaderze.

Nowa ikona „Konsultacje" w `app/components/icons.tsx`.

## Autoryzacja (tenant-scope)

- Każda funkcja repo przyjmuje wymagany `trainerId`/`traineeId` i filtruje po nim.
- Trener: dostęp tylko do konsultacji swoich podopiecznych. Podopieczny: tylko
  własne, read-only.
- Brak dostępu → **404** (nie 403), by nie zdradzać istnienia zasobu.
- Mutacje (`create`/`update`/`setActionItemStatus`/`delete`) re-weryfikują
  własność przez `trainerId` przed zapisem.
- Feature dotyka `trainer_id` → wymaga `/security-review`.

## Testy

### Jednostkowe (TDD, bez DB — piszemy i uruchamiamy `npm test`)

- `consultation-types.ts`: pola wymagane, reguła period „oba-albo-żaden" +
  `from <= to`, walidacja punktów (niepuste `body`), status z enuma.
- Ewentualne czyste helpery (np. liczenie otwartych punktów do badge'a).

### Integracyjne `*.itest.ts` (testcontainers — PISZEMY, uruchamia właściciel)

Krytyczne przepływy:
- Tenant-scope: obcy trener / obcy podopieczny → 404 (read i write).
- `createConsultation` z punktami — poprawny zapis i kolejność `ordinal`.
- `setActionItemStatus` — ustawia/zeruje `resolved_at`, tylko właściciel.
- Kaskadowe usuwanie: usunięcie konsultacji kasuje punkty.

## Dokumentacja (część „done")

- `app/lib/README.md` — dopisać `consultations.ts` i `consultation-types.ts`.
- `app/routes/trener/README.md` — nowe trasy konsultacji + mapa URL.
- `app/routes/podopieczny/README.md` — nowe trasy + element nawigacji.
- Nowych katalogów źródłowych nie ma → mapa w `CLAUDE.md` bez zmian.

## Świadomy zakres (YAGNI — poza v1)

- Bez załączników (wideo/zdjęć) do konsultacji.
- Bez wersji roboczej — konsultacja widoczna dla podopiecznego od razu po utworzeniu.
- Bez filtra dat w historii treningów — okres pokazujemy jako tekst informacyjny;
  przefiltrowany link do historii to ewentualny późniejszy dodatek (dziś
  `listLogsForTrainee` nie filtruje po datach).
- Podopieczny nie komentuje (read-only). Brak powiadomień.

## Handoff (na końcu implementacji)

Granica gita/Dockera należy do właściciela. Po implementacji: podsumowanie zmian,
proponowany komunikat commita, nota o `npm run db:generate` + `db:migrate`, lista
testów integracyjnych do uruchomienia pod Dockerem, ścieżka ręcznej weryfikacji.
