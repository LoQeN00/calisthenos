# Konsultacje: harmonogram cykliczny + integracja Google — design

> Status: zatwierdzony do planowania. Data: 2026-06-01.
> Proces: FEATURE (`kalisthenos-dev-flow`). Następny krok: plan implementacji
> (`superpowers:writing-plans`).
> Rozszerza/przebudowuje moduł z
> [`2026-05-31-modul-konsultacji-design.md`](2026-05-31-modul-konsultacji-design.md).

## Cel i kontekst

Dziś moduł konsultacji **dokumentuje przeszłe** spotkania (data, podsumowanie,
punkty „do poprawy"). Trener chce dodatkowo **planować przyszłe** spotkania:
ustawiać cykliczność (co tydzień / co 2 tygodnie / co miesiąc / nigdy),
podopieczny ma widzieć kalendarz nadchodzących terminów, potwierdzać je i mieć
link do spotkania online. Docelowo — integracja z Google Calendar / Google Meet.

Moduł rozbudowujemy w obrębie istniejącego modelu trener↔podopieczny
(multi-tenant przez `trainer_id`/`trainee_id`, panel trenera desktop-first, panel
podopiecznego mobile-first/PWA).

> **Big bang dozwolony:** nikt jeszcze nie korzysta z modułu konsultacji w
> produkcji, więc przebudowujemy model danych swobodnie, bez troski o migrację
> istniejących wpisów.

## Decyzje produktowe (ustalone w brainstormie)

1. **Źródło prawdy = nasza baza.** Harmonogram i terminy żyją natywnie w
   kalisthenos. Kalendarz zewnętrzny (Google) to **opcjonalny, wychodzący sync
   per trener** — nie zależność rdzenia. Aplikacja działa w pełni bez żadnego
   konta zewnętrznego.
2. **Integracja = Google Calendar / Meet** (nie Calendly). Calendly służy do
   umawiania wolnych slotów i słabo obsługuje narzucony cykl; Google natywnie
   obsługuje cykliczność, generuje link Meet i zaprasza mailem.
3. **Jeden byt „konsultacja" z cyklem życia** (zaplanowana → … → udokumentowana),
   zamiast osobnych bytów „termin" i „zapis". Cykliczność generuje przyszłe
   terminy w stanie `planned`; po spotkaniu trener je dokumentuje.
4. **Termin ma godzinę i czas trwania** (domyślnie 45 min), nie tylko datę —
   wymóg sensownego wydarzenia online / linku Meet.
5. **Podopieczny: podgląd + potwierdzanie.** Może **potwierdzić / odrzucić /
   poprosić o zmianę** terminu. Nie ustawia harmonogramu (to robi trener).
6. **Pojedyncze terminy edytowalne** (wyjątki w serii): trener może przełożyć lub
   odwołać konkretny termin bez ruszania reszty cyklu.
7. **Lekki badge „najbliższy termin"** w UI (bez push/e-mail). Powiadomienia
   mailowe ogarnia Google, gdy sync włączony.
8. **Reprezentacja cyklu = zmaterializowane wiersze (podejście A):** reguła cyklu
   + generowane konkretne wiersze konsultacji na okno w przód, dogenerowywane
   leniwie. Każdy termin ma własny `id`/status/link/`google_event_id`.

## Cykl życia konsultacji

Statusy (`consultation_status`):

- `planned` — utworzona (z cyklu lub ręcznie), czeka na reakcję podopiecznego;
- `confirmed` — podopieczny potwierdził;
- `change_requested` — podopieczny prosi o inny termin (wraca do trenera, który
  przekłada → nowy `planned`);
- `cancelled` — podopieczny odrzucił **lub** trener odwołał; termin się nie odbędzie;
- `documented` — stan końcowy: spotkanie udokumentowane (podsumowanie + punkty
  „do poprawy"); to jest dotychczasowa „konsultacja".

Przejścia:

- *(utworzenie z cyklu lub ad-hoc)* → `planned`
- `planned` → `confirmed` (podopieczny potwierdza)
- `planned`/`confirmed` → `change_requested` (podopieczny prosi o zmianę);
  trener przekłada → `planned` z nową datą
- `planned`/`confirmed` → `cancelled` (podopieczny odrzuca / trener odwołuje)
- `planned`/`confirmed` → `documented` (trener dokumentuje, zwykle po terminie)

„Po godzinie, a niedokumentowane" pokazujemy w UI jako **„do udokumentowania"**
(wyliczane z `scheduled_at < now()`, **nie** osobny status). Pominięcie jednego
terminu w serii = `cancelled` tej jednej instancji.

## Model danych (`app/lib/db/schema.ts`)

Schemat = źródło prawdy; po edycji `npm run db:generate` tworzy migrację (plików w
`migrations/` nie edytujemy ręcznie).

### Nowe enumy

- `consultation_status`: `['planned','confirmed','change_requested','cancelled','documented']`
- `consultation_cadence`: `['weekly','biweekly','monthly']`
  („nigdy" = brak aktywnego harmonogramu, nie wartość enuma)

### Tabela `consultations` — przebudowa

Byt = pojedyncza okazja/termin o cyklu życia jak wyżej.

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `trainer_id` | uuid NN → `users.id` (cascade) | tenant-scope |
| `trainee_id` | uuid NN → `users.id` (cascade) | |
| `scheduled_at` | **timestamptz NN** | data+godzina spotkania (zastępuje `held_on`) |
| `duration_min` | **integer NN default 45** | długość spotkania |
| `status` | **`consultation_status` NN default `planned`** | cykl życia |
| `meeting_url` | **text NULL** | link Meet/Zoom (ręczny lub z Google) |
| `schedule_id` | **uuid NULL → `consultation_schedules.id` (onDelete set null)** | która seria wygenerowała; NULL = ad-hoc |
| `trainee_note` | **text NULL** | treść „prośby o zmianę" od podopiecznego |
| `google_event_id` | **text NULL** | mapowanie 1↔1 na zdarzenie Google |
| `title` | text NN | auto-generowany dla `planned` (np. „Konsultacja — 12.06.2026"), edytowalny |
| `summary` | text NN default `''` | puste do udokumentowania |
| `period_from` | date NULL | okres omówiony — początek (bez zmian) |
| `period_to` | date NULL | okres omówiony — koniec (bez zmian) |
| `created_at` | timestamptz NN defaultNow | |

- **Usuwamy** `held_on` (date). Świadomy breaking change (big bang).
- Indeksy: `consultations_trainee_sched_idx` na `(trainee_id, scheduled_at)`,
  `consultations_trainer_status_idx` na `(trainer_id, status)`,
  `consultations_schedule_idx` na `(schedule_id)`.
- CHECK `consultations_period_check` (bez zmian): `period_from`/`period_to`
  oba-albo-żaden + `period_from <= period_to`.

### Tabela `consultation_schedules` — nowa

Konfiguracja cyklu (jeden aktywny na parę trener-podopieczny).

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `trainer_id` | uuid NN → `users.id` (cascade) | |
| `trainee_id` | uuid NN → `users.id` (cascade) | |
| `cadence` | `consultation_cadence` NN | weekly/biweekly/monthly |
| `weekday` | smallint NULL (0–6) | dla weekly/biweekly |
| `day_of_month` | smallint NULL (1–28) | dla monthly |
| `time_of_day` | time NN | godzina spotkań |
| `duration_min` | integer NN default 45 | |
| `starts_on` | date NN | kotwica serii (pierwsza możliwa data) |
| `default_meeting_url` | text NULL | stały link, gdy bez Google |
| `active` | boolean NN default true | |
| `created_at` | timestamptz NN defaultNow | |
| `updated_at` | timestamptz NN defaultNow | |

- Częściowy unikat: **jeden aktywny harmonogram** na `(trainer_id, trainee_id)`
  gdzie `active = true`.
- CHECK `consultation_schedules_anchor_check`: `weekday` ustawiony ⇔
  `cadence ∈ (weekly,biweekly)`; `day_of_month` ustawiony ⇔ `cadence = monthly`.

### Tabela `google_calendar_connections` — nowa

OAuth per trener.

| kolumna | typ | uwagi |
|---|---|---|
| `trainer_id` | uuid PK → `users.id` (cascade) | jeden trener = jedno połączenie |
| `google_email` | text NN | konto, które podpięto |
| `access_token` | text NN | **szyfrowane at-rest** |
| `refresh_token` | text NN | **szyfrowane at-rest** |
| `token_expiry` | timestamptz NN | |
| `calendar_id` | text NN default `'primary'` | kalendarz docelowy |
| `scope` | text NN | nadane uprawnienia |
| `connected_at` | timestamptz NN defaultNow | |
| `updated_at` | timestamptz NN defaultNow | |

### Tabela `consultation_action_items` — bez zmian

Należą do konsultacji `documented`. Bez zmian względem poprzedniego designu.

### Typy

`Consultation`, `NewConsultation`, `ConsultationStatus`, `ConsultationSchedule`,
`NewConsultationSchedule`, `ConsultationCadence`, `GoogleCalendarConnection`,
`NewGoogleCalendarConnection` eksportowane jak reszta schematu.

## Generowanie terminów (podejście A — materializacja)

- **Czysta funkcja** (`consultation-recurrence.ts`, cel TDD) liczy listę dat
  `scheduled_at` z reguły harmonogramu (cadence + kotwica + `starts_on` +
  `time_of_day`) na okno **~70 dni (ok. 8–10 tygodni)** w przód (stała tunowalna
  w planie).
  Obsługuje weekly/biweekly (kotwica = `weekday`) i monthly (kotwica =
  `day_of_month`, max 28 by uniknąć problemów z końcem miesiąca).
- Repo **materializuje brakujące wiersze** `planned` **idempotentnie** — dedup po
  `(schedule_id, scheduled_at)`. Dogenerowuje **leniwie** przy wejściu trenera/
  podopiecznego na listę/kalendarz.
- Zmiana cyklu (cadence/godzina/dzień) **regeneruje przyszłe `planned`**, ale
  **nie rusza** `confirmed`/`change_requested`/`cancelled`/`documented`.
- Wyłączenie (`active=false`, „nigdy") zatrzymuje generację; istniejące przyszłe
  `planned` mogą zostać odwołane (decyzja UI w planie).

## Walidacja i warstwa repo

### `app/lib/consultation-types.ts` (Zod — czysta logika, cel TDD; rozszerzenie)

- `ScheduleFormSchema`: `cadence` z enuma; `weekday` 0–6 wymagany dla
  weekly/biweekly; `dayOfMonth` 1–28 wymagany dla monthly; `timeOfDay` `HH:MM`;
  `durationMin` > 0; `startsOn` poprawna data; `defaultMeetingUrl` opcjonalny URL.
- `ConsultationFormSchema` (rozszerzenie): `scheduledAt` (data+godzina),
  `durationMin`, opcjonalny `meetingUrl`; pola dokumentacji (`title`, `summary`,
  `items`, okres) jak dotąd.
- Schematy akcji statusów (np. `TraineeResponseSchema`:
  `confirm`/`decline`/`request_change` + opcjonalny `note`).

### `app/lib/consultation-recurrence.ts` (nowy — czyste daty, cel TDD)

- `nextOccurrences(rule, { from, horizonDays })`: lista `Date`/ISO terminów.

### `app/lib/consultations.ts` (repo, tenant-scoped; rozszerzenie)

Jeśli plik urośnie ponad rozsądną wielkość — **wydzielić** repo harmonogramu do
`app/lib/consultation-schedules.ts`.

- Harmonogram: `getSchedule`, `upsertSchedule`, `deactivateSchedule` (tenant-scope
  trainerId; re-weryfikacja własności podopiecznego).
- Materializacja: `ensureOccurrences(db, scheduleId)` — idempotentne tworzenie
  brakujących `planned`; wstrzykuje opcjonalny `syncer` (Google) best-effort.
- Lista/kalendarz: `listOccurrencesForTrainee` (zakres dat, statusy, liczniki),
  `getConsultationDetail` (jak dziś, tenant-scope).
- Przejścia statusów:
  - trener: `rescheduleOccurrence`, `cancelOccurrence`, `documentConsultation`
    (+ punkty), `setActionItemStatus` (jak dziś);
  - podopieczny: `confirmOccurrence`, `declineOccurrence`,
    `requestChange(note)` — tylko własne, tylko z dozwolonego statusu.
- `deleteConsultation` (kaskada punktów) jak dziś.
- `ConsultationError` (jak dziś).
- Każda mutacja Google jest **best-effort**: błąd syncera nie przerywa zapisu
  natywnego; zapisujemy wynik i sygnalizujemy „nie zsynchronizowano".

## Integracja Google Calendar / Meet (Faza 2)

Zweryfikowane w dokumentacji Google Workspace Calendar API (context7).

### Fakty API

- **Link Meet:** `events.insert` z `conferenceData.createRequest` **oraz**
  parametrem zapytania `conferenceDataVersion=1`. Unikalna konferencja na każde
  zdarzenie (dokumentacja odradza współdzielenie).
- **Zaproszenie maila:** `attendees: [{ email }]` + `sendUpdates=all`.
- **OAuth:** scope `https://www.googleapis.com/auth/calendar.events`,
  `access_type=offline` + `prompt=consent` → refresh token. Biblioteki:
  `googleapis` + `google-auth-library`.

### Decyzje architektoniczne

1. **Jedno zdarzenie Google na jeden termin (NIE RRULE).** Cykliczność jest
   natywna; do Google pchamy pojedyncze zdarzenia. 1 wiersz ↔ 1 `google_event_id`
   ↔ 1 unikalny Meet. Reschedule → `events.patch`; cancel/odrzucenie →
   `events.delete`; dokumentowanie → nie rusza Google.
2. **Sync tylko wychodzący (app → Google) w v1.** Potwierdzanie zostaje w
   aplikacji. Brak `watch`/webhooków i sync tokenów (wymagałyby publicznego
   endpointu i odnawiania kanałów). Zmiany po stronie Google **nie** wracają do
   nas (świadomie poza zakresem).
3. **Best-effort, nieblokujące.** Błąd Google (token wygasł, API down) nie
   blokuje zapisu natywnego; ręczny retry, nieblokujący sygnał w UI.
4. **Kiedy pchamy:** zdarzenie tworzymy przy materializacji terminu w oknie
   generowania.
5. **Bezpieczeństwo tokenów:** `access_token`/`refresh_token` szyfrowane at-rest
   (AES-256-GCM, klucz z env); nigdy w logach ani w danych loadera do klienta.

### Przepływ OAuth (trasy trenera)

- `trener/integracje/google` — status połączenia + „Połącz"; loader buduje URL
  zgody i redirypuje.
- `trener/integracje/google/callback` — wymiana `code` → tokeny → zapis
  zaszyfrowany w `google_calendar_connections`.
- Akcja „Rozłącz" — revoke tokenu + usunięcie wiersza.
- Multi-tenant: jeden projekt Google Cloud (aplikacja), każdy trener autoryzuje
  własne konto Google.

### Warstwa kodu (`app/lib/google/`, nowy katalog + README)

- `oauth.ts` — URL zgody, wymiana kodu, odświeżanie tokenów.
- `calendar.ts` — `insertEvent`/`patchEvent`/`deleteEvent` z `conferenceData`
  i `attendees`.
- `crypto.ts` — szyfrowanie/odszyfrowanie tokenów (AES-256-GCM).
- Wstrzykiwany do repo konsultacji jako opcjonalny „syncer" (rdzeń działa bez
  niego).

### Nowe zmienne środowiskowe

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`GOOGLE_TOKEN_ENC_KEY` (klucz AES). Dopisać do `.env.example` i root `README.md`.

## Trasy i UI

Każda nowa/zmieniona trasa = plik + wpis w `app/routes.ts`. Loadery czytają,
akcje mutują; formularze to POST `application/x-www-form-urlencoded`. Warstwę
wizualną prowadzi `frontend-design:frontend-design` zgodnie z
`design-system/README.md` i `app/styles/tokens.css`. UI po polsku.

### Trener (desktop)

- `trener/podopieczni/:traineeId/konsultacje` *(przebudowa)* — panel harmonogramu
  (segment cyklu: co tydzień / co 2 tyg. / co miesiąc / **nigdy** + dzień +
  godzina + czas trwania; akcja `save-schedule`), chip stanu Google, lista
  „Nadchodzące terminy" ze statusami i akcjami **Przełóż / Odwołaj** na pojedynczym
  terminie, sekcja „Do udokumentowania / minione" z akcją **Udokumentuj**.
- `trener/podopieczni/:traineeId/konsultacje/nowa` *(przebudowa)* — termin ad-hoc:
  data+godzina, czas trwania, link; status `planned` lub od razu `documented`.
- `trener/podopieczni/:traineeId/konsultacje/:konsultacjaId` *(przebudowa)* —
  szczegóły/edycja + dokumentowanie + przełóż/odwołaj + toggle punktu.
- `trener/integracje/google` (+ `callback`) *(nowe)* — OAuth połącz/rozłącz.
- Kafelek na stronie podopiecznego u trenera: najbliższy termin + liczba
  oczekujących / próśb o zmianę.

### Podopieczny (mobile-first, PWA)

- `podopieczny/konsultacje` *(przebudowa)* — **kalendarz w układzie „siatka
  miesiąca"** (wariant A): siatka dni z kropkami na dniach z terminem; tap w dzień
  → karta terminu (data+godzina, status, link Meet, akcje **Potwierdzam / Zmiana /
  Odrzuć**). Na górze wyeksponowany „najbliższy termin".
- `podopieczny/konsultacje/:konsultacjaId` *(przebudowa)* — szczegóły read-only
  (podsumowanie + punkty) oraz te same akcje, gdy termin nadchodzący.
- `app/routes/podopieczny/_layout.tsx`: badge „Konsultacje" = liczba terminów
  **do potwierdzenia**.

Ikony w `app/components/icons.tsx` w razie potrzeby (kalendarz, Google/Meet).

## Autoryzacja (tenant-scope)

- Funkcje repo przyjmują wymagany `trainerId`/`traineeId` i filtrują po nim.
- Trener: tylko konsultacje/harmonogramy swoich podopiecznych. Podopieczny: tylko
  własne; akcje confirm/decline/request tylko na własnych terminach i tylko z
  dozwolonego statusu.
- Brak dostępu → **404** (nie 403).
- Mutacje re-weryfikują własność przez `trainerId`/`traineeId` przed zapisem.
- Feature dotyka `trainer_id` **oraz** tokenów OAuth → wymaga **`/security-review`**.

## Testy

### Jednostkowe (TDD, bez DB — piszemy i uruchamiamy `npm test`)

- `consultation-recurrence.ts`: generowanie dat dla weekly/biweekly/monthly,
  kotwica `weekday`/`day_of_month`, okno generowania, strefa czasowa,
  end-of-month (≤28).
- `consultation-types.ts`: `ScheduleFormSchema` (warunkowe wymaganie
  weekday/dayOfMonth), `ConsultationFormSchema`, schematy akcji statusów.
- `google/crypto.ts`: round-trip szyfrowania tokenów (bez sieci).
- Reguły przejść statusów (jeśli wydzielone jako czysta funkcja).

### Integracyjne `*.itest.ts` (testcontainers — PISZEMY, uruchamia właściciel)

- Tenant-scope: obcy trener/podopieczny → 404 (read i write).
- Harmonogram → generacja terminów: poprawne daty, dedup, idempotencja
  `ensureOccurrences`.
- Przejścia statusów: confirm/decline/request_change (podopieczny, tylko własne i
  z dozwolonego statusu), reschedule/cancel/document (trener, tylko własne).
- Regeneracja przy zmianie cyklu nie rusza `confirmed`/`documented`.
- Kaskada: usunięcie konsultacji kasuje punkty; `onDelete set null` dla
  `schedule_id` przy usunięciu harmonogramu (decyzja w planie).
- **Sync Google przez zamockowany klient:** wywołany z właściwymi argumentami
  (conferenceDataVersion, attendees); błąd syncera **nie** blokuje zapisu
  natywnego (best-effort).

## Fazy (jeden spec, implementacja etapami)

- **Faza 1 — rdzeń natywny:** przebudowa schematu (`consultations`,
  `consultation_schedules`, enumy), `consultation-recurrence.ts`, CRUD
  harmonogramu, cykl życia + statusy, UI trenera (panel + lista + dokumentowanie),
  kalendarz podopiecznego (siatka miesiąca) + potwierdzanie, badge, ręczny
  `meeting_url`. **Działa bez Google.**
- **Faza 2 — Google:** tabela `google_calendar_connections`, `app/lib/google/*`,
  OAuth połącz/rozłącz, syncer best-effort wpięty w create/reschedule/cancel,
  nowe env, `/security-review`.

## Dokumentacja (część „done")

- `app/lib/README.md` — `consultation-recurrence.ts`, rozszerzenia
  `consultations.ts`/`consultation-types.ts`, ewentualny `consultation-schedules.ts`.
- `app/lib/google/README.md` — **nowy** (oauth/calendar/crypto).
- `app/routes/trener/README.md` — nowe/zmienione trasy + `integracje/google`.
- `app/routes/podopieczny/README.md` — przebudowa konsultacji + badge.
- `CLAUDE.md` — mapa projektu: nowy katalog `app/lib/google/`.
- `.env.example` + root `README.md` — zmienne i setup Google Cloud.
- `app/routes.ts` — nowe wpisy.

## Świadomy zakres (YAGNI — poza v1)

- **Sync przychodzący z Google** (zmiany w Google wracają do nas: `watch`,
  webhooki, sync tokeny) — poza zakresem. Sync tylko wychodzący.
- **Calendly** — odrzucone (zły model dla narzuconego cyklu).
- **Powiadomienia push/e-mail z aplikacji** — poza zakresem (Google ogarnia, gdy
  sync włączony); w aplikacji tylko badge/sekcja.
- **Podopieczny łączy własny kalendarz** — nie; podopieczny dostaje zaproszenie
  mailem przez zaproszenie trenera, a w aplikacji widzi natywny kalendarz.
- **Strefy czasowe per użytkownik** — v1 zakłada jedną strefę aplikacji (do
  potwierdzenia w planie); pełne TZ per user to późniejszy dodatek.

## Handoff (na końcu implementacji)

Granica gita/Dockera należy do właściciela. Po implementacji: podsumowanie zmian,
proponowany komunikat commita, nota o `npm run db:generate` + `db:migrate`, nowe
env (Google), lista testów integracyjnych do uruchomienia pod Dockerem, ścieżka
ręcznej weryfikacji (Faza 1 bez Google; Faza 2 z kontem testowym Google).
