# Spec: przełącznik RPE (trudności) per ćwiczenie

> Data: 2026-05-31 · Status: zaakceptowany do planowania

## Problem

Trener i podopieczny ustalili, że ocena trudności (RPE 1–10, logowana przy każdej
serii) nie ma sensu dla części ćwiczeń. Dziś pole jest wymagane globalnie dla
każdej serii. Chcemy, by **trener mógł per ćwiczenie wyłączyć zbieranie RPE** —
wtedy logowanie tego ćwiczenia nie pyta o trudność, a metryki zależne od RPE go
pomijają.

W tej aplikacji „RPE” = istniejące pole `workout_set_logs.difficulty`
(integer 1–10), w UI prezentowane jako „Trudność 1–10”. Nie wprowadzamy nowego
parametru — togglujemy istniejący.

## Decyzje (zatwierdzone w brainstormie)

1. **Granularność:** flaga na poziomie ćwiczenia (biblioteka trenera). Domyślnie
   włączona dla istniejących i nowych ćwiczeń (zachowuje dzisiejsze zachowanie).
   Nie ma trybu globalnego ani per-podopieczny.
2. **Dane historyczne:** nic nie kasujemy. Po wyłączeniu RPE stare logi zachowują
   swoje `difficulty` i nadal je pokazują (historia, wykresy). Wyłączenie wpływa
   tylko na **nowe** serie danego ćwiczenia.
3. **Metryki zależne od RPE dla ćwiczenia bez ocen:** panele „śr. RPE” i wykres
   „reps-vs-RPE” są **ukrywane**; agregaty liczą tylko serie z RPE. Pozostałe
   metryki (objętość, PR, najmocniejsza seria, status progresji) działają
   normalnie — nie zależą od RPE.

## Wybrane podejście

**Nullowalne `difficulty` + flaga `tracks_rpe` na ćwiczeniu.**

- Warstwa **zapisu** (UI biblioteki, logowanie, walidacja) używa flagi
  `exercises.tracks_rpe`.
- Warstwa **odczytu** (statystyki, progresja, wrapped) opiera się o nullowalne
  `avgRpe: number | null`. SQL `AVG(difficulty)` z natury pomija `NULL`, więc
  „brak RPE” samoczynnie wypada z agregatów — nie trzeba przeciągać flagi przez
  całą warstwę odczytu. `avgRpe === null` ⇔ brak ocenionych serii w agregacie.

Odrzucone alternatywy:
- *Sentinel zamiast NULL* (np. `difficulty = 0`): psuje `CHECK`, fałszuje
  średnie, wymaga `WHERE` wszędzie.
- *Flaga tylko w UI, statystyki bez zmian*: niewykonalne — seria i tak musi coś
  zapisać; bez nullowalności się nie da.

## Zmiany w schemacie (`app/lib/db/schema.ts` → `npm run db:generate`)

- `exercises`: nowa kolumna `tracksRpe` (`tracks_rpe`) `boolean NOT NULL DEFAULT true`.
- `workoutSetLogs.difficulty`: zmiana na **nullowalne** (`integer`, bez `.notNull()`).
- `workout_set_logs_difficulty_check`: rozluźnienie do
  `difficulty IS NULL OR difficulty BETWEEN 1 AND 10`.

Migracja generowana przez Drizzle Kit — nigdy nie edytujemy plików w
`migrations/` ręcznie. Istniejące wiersze: `tracks_rpe` przyjmie `true` z
`DEFAULT`; istniejące `difficulty` pozostają nietknięte.

## Warstwa zapisu

- `app/lib/workouts.ts`
  - `LoggingEntry`: dodaj `tracksRpe: boolean`.
  - `loadSessionForLogging`: dołącz `exercises.tracksRpe` do selecta i wypełnij
    pole w `entries`.
  - `SaveSetInput.difficulty`: `number | null`.
  - `saveWorkoutLog`: zapisuje `difficulty` jako `null` gdy nie podano.
- `app/routes/podopieczny/loguj.$sessionId.tsx`
  - Gdy `entry.tracksRpe === false`: nie renderuj radia „Trudność 1–10”.
  - Logika „wypełnienia” serii dla ćwiczeń bez RPE opiera się o same powtórzenia
    (wideo nadal opcjonalne). „Skopiuj jak #1” kopiuje tylko reps.
  - Akcja: dla `tracksRpe === false` nie wymaga `diff`; zapisuje `difficulty = null`.
    Dla `tracksRpe === true` walidacja bez zmian (reps + trudność razem).

## Warstwa odczytu — reguła `avgRpe: number | null`

`null` = brak ocenionych serii w danym agregacie. UI chowa panele RPE gdy `null`.

- `app/lib/progression-math.ts`
  - `SessionPoint.avgRpe` i `ChartPoint.avgRpe`: `number | null`.
  - `aggregateToWeeks`: uśrednia tylko po nie-`null` wartościach (gdy wszystkie
    `null` → `null`).
  - `markPrs`: przepuszcza `avgRpe` (w tym `null`) bez zmian; `isPr` liczone z `best`.
- `app/lib/progression.ts`
  - `loadProgressionSessions`: `avgRpe` = `null` gdy `AVG(difficulty) IS NULL`.
  - `getExerciseProgression`: `avgRpeInRange` = `null` gdy brak ocen w zakresie;
    KPI „śr. RPE” i wykres reps-vs-RPE ukrywane w widoku gdy `null`. Status, PR,
    objętość, periodChange — bez zmian (zależą od reps/best).
- `app/lib/stats.ts`
  - `loadPerExerciseHistory`: `avgRpe` jako `number | null`.
  - `getEffortBalance`: pomija sesje, których `avgRpe` jest `null`.
  - `getPlateauExercises`, `getEasierAtSameReps`: pomijają grupy/sesje bez RPE
    (brak sygnału RPE → nie kwalifikują).
  - `getHealthStats` (recent/historical avg RPE, redZonePct): liczone tylko po
    ocenionych seriach; gdy brak ocen → `0`/neutralny trend jak dziś.
- `app/lib/wrapped.ts`: agregaty RPE liczone po ocenionych seriach; brak ocen →
  sekcja RPE pomijana/neutralna (do potwierdzenia przy implementacji wg obecnego
  kształtu wrapped).

## UI (warstwa wizualna → skill `frontend-design`)

- `app/routes/trener/biblioteka.nowe.tsx`, `biblioteka.$exerciseId.tsx`:
  checkbox „Zbieraj ocenę trudności (RPE 1–10) przy logowaniu” (domyślnie
  zaznaczony) + krótki opis. Zod waliduje, akcja zapisuje `tracksRpe`.
- Szczegóły logu: `app/routes/podopieczny/historia.$logId.tsx`,
  `app/routes/trener/podopieczni.$traineeId.log.$logId.tsx` — render
  `difficulty === null` jako brak (np. „—”), bez błędów układu.
- `app/components/progression-charts.tsx` (reps-vs-RPE): bezpieczne pominięcie
  punktów/wykresu bez RPE.
- UI po polsku; trzymać design-system (`design-system/README.md`, tokeny CSS).

## Testy

**Jednostkowe (TDD, bez DB; `npm test`):**
- `progression-math`: `aggregateToWeeks` i `markPrs` z `avgRpe: null`
  (mieszane/null-only), brak wpływu na `best`/`volume`/`isPr`; `computePeriodChangePct`
  niewrażliwe na RPE.
- helper liczenia `avgRpe` pomijający `null` (jeśli wydzielony).
- ewentualna czysta funkcja parsująca flagę formularza (Zod).

**Integracyjne (`*.itest.ts`, pisane — uruchamia właściciel pod Dockerem):**
- zapis logu ćwiczenia z `tracksRpe = false` → `difficulty IS NULL`.
- sesja mieszana (ćwiczenie z RPE + bez) → poprawny `avgDifficulty`/agregaty
  (liczone tylko po ocenionych seriach).
- tenant-scope niezmieniony (brak autoryzacji → 404).

## Poza zakresem (YAGNI)

- Masowa edycja flagi, tryb globalny / per-podopieczny.
- Migracja/backfill istniejących danych (flaga domyślnie `true`).
- Zmiana semantyki PR i statusu progresji (świadomie niezależne od RPE).

## Reguły projektowe do pilnowania

- Tenant-scope: funkcje repo wymagają `trainerId`/`traineeId`; brak autoryzacji → 404.
- Trasa zmieniona = plik + wpis w `app/routes.ts` (tu nie dodajemy nowych tras).
- Schemat = źródło prawdy → `db:generate`, nigdy ręcznie `migrations/`.
- Dokumentacja katalogów / `CLAUDE.md` aktualizowana w tym samym kroku.
