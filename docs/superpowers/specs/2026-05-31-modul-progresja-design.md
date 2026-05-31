# Moduł Progresja w kalisthenos — projekt (design spec)

**Status:** zaakceptowany w sesji brainstormingu (2026-05-31), czeka na review pliku
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-05-31

> Ten dokument jest **źródłem prawdy** dla nowego modułu **Progresja** — widoku,
> w którym podopieczny i trener oglądają postęp w konkretnych ćwiczeniach
> w perspektywie czasu. Następnym krokiem jest plan implementacyjny w
> `docs/superpowers/plans/`. Przy każdej zmianie zachowania modułu — aktualizuj
> ten plik oraz README dotkniętych katalogów (reguła utrzymania dokumentacji
> z `CLAUDE.md`).

---

## 1. Cel i kontekst

Aplikacja ma już rozbudowaną stronę **Statystyki** (osobno dla podopiecznego i
trenera) — pełni rolę **pulpitu-przeglądu**: dużo kafelków, migawka „tu i teraz"
(hero, heatmapa, rekordy, sparkline top 5, plateau, bilans wysiłku, rozkład
tagów, Wrapped). Brakuje natomiast jednego: **drążenia w głąb pojedynczego
ćwiczenia w czasie** — pełnej trajektorii „jak rosnę w Pull-upach przez ostatnie
miesiące".

**Progresja** wypełnia tę lukę. To NIE kolejny pulpit ani przebudowa Statystyk —
Statystyki zostają bez zmian. Progresja to **szkło powiększające**: wybierasz
ćwiczenie i widzisz jego oś czasu; opcjonalnie zestawiasz kilka ćwiczeń obok
siebie.

Decyzje z sesji brainstormingu:

| Wymiar | Decyzja |
|---|---|
| Pozycjonowanie | Dedykowany widok **drążenia jednego ćwiczenia w czasie**; Statystyki zostają jako pulpit. |
| Główny wykres | **A (linia rekordów + RPE)** jako bohater + **B (objętość)** i **C (siła = lżej)** jako karty pod spodem. |
| Wejście | **Lista ćwiczeń** z mini-trendem; klik → szczegół. |
| Sortowanie listy | **Różne wg roli**: podopieczny → „ostatnio trenowane"; trener → „uwaga" (spadki/plateau na górze). |
| Wiersz listy | nazwa + jednostka, mini-sparkline, status ▲=▼/nowe, aktualny rekord (PR), filtr po tagach. |
| Oś czasu (X) | **Punkt = sesja**, z **auto-agregacją do tygodni** przy zakresach „6 mies" i „cały". |
| Pasek KPI | **Rekord (PR)** · **Ostatnia sesja** · **Zmiana % w okresie** · **Sesje + śr. RPE**. |
| Tryb trenera | **Lustro** widoku + sort „uwaga" + **pasek podsumowania** (ile ćwiczeń rośnie / stabilnych / spada). Read-only. |
| Porównanie | **W v1.** Oś Y = **% zmiany od startu okresu** (miesza powt. i sekundy). Wejście: zaznacz pozycje na liście → „Porównaj". |
| Nawigacja | Podopieczny: pozycja „Progresja" w menu bocznym. Trener: zakładka „Progresja" na stronie podopiecznego. |
| Wykresy | Ręczny **SVG** w rozbudowanym `app/components/stat-widgets.tsx` — **zero nowych zależności**. |

---

## 2. Zasady-fundamenty (obowiązują)

Zgodnie z `CLAUDE.md` i skillem `kalisthenos-dev-flow`:

- **Multi-tenant przez `trainerId`/`traineeId`.** Funkcje repo przyjmują wymagany
  identyfikator i filtrują po nim; brak autoryzacji → **404** (nie 403).
- **Trasa = plik + wpis w `app/routes.ts`.**
- **Loadery czytają, akcje mutują.** Progresja jest w całości **read-only**
  (same loadery) — brak mutacji w v1.
- **Schemat to źródło prawdy.** Moduł **nie zmienia schematu** — czyta istniejące
  tabele. (Patrz §4: ewentualny indeks wspierający to osobna decyzja.)
- **UI po polsku**; brand `kalisthenos` małą literą; nazwy ćwiczeń zostają po
  angielsku (Pull-up, Front Lever…).
- **TDD** dla logiki bez DB; **review per task**; **git/docker prowadzi
  właściciel** (handoff na końcu).
- Warstwę wizualną prowadzi `frontend-design:frontend-design` zgodnie z
  `design-system/README.md` i `app/styles/tokens.css`.

---

## 3. Powierzchnie modułu (UX)

### 3.1. Lista ćwiczeń (wejście)

Pełnoekranowa lista ćwiczeń, które mają **co najmniej jedną zalogowaną serię**.
Każdy wiersz:

- **Nazwa** + odznaka jednostki (`REPS` / `SEC`).
- **Mini-sparkline** trendu najlepszej serii.
- **Status** ▲ rośnie / = stabilnie / ▼ spadek / „nowe" (liczony jak w
  istniejącym `getExerciseProgress`: ostatnie ~4 vs poprzednie ~4 sesje).
- **Aktualny rekord (PR)** po prawej.
- **Podtytuł**: liczba sesji + „ostatnio N dni temu".

Nad listą: **filtr po tagach** (z pola `exercises.tags` — Pull/Push/Core…) oraz
tryb **wielozaznaczenia** → przycisk **„Porównaj"**.

**Domyślne sortowanie różni się wg roli:**
- Podopieczny → **ostatnio trenowane** (najnowsze u góry).
- Trener → **„uwaga"**: spadki → plateau → rośnie → nowe (najpierw to, co
  wymaga reakcji). Nad listą trenera dodatkowo **pasek podsumowania**: ile
  ćwiczeń rośnie / stabilnych / spada.

Użytkownik może przełączyć sortowanie ręcznie (kontrolka sortowania). Pusta lista
(brak jakichkolwiek logów) → przyjazny komunikat zachęcający do zalogowania
treningu.

### 3.2. Szczegół ćwiczenia (oś czasu)

Najważniejszy ekran. Układ od góry:

1. **Nagłówek**: nazwa ćwiczenia + jednostka, powrót do listy.
2. **Przełącznik zakresu**: `4 tyg` / `3 mies` / `6 mies` / `cały`.
3. **Pasek 4 KPI**:
   - **Rekord (PR)** — najlepszy wynik + kiedy osiągnięty.
   - **Ostatnia sesja** — wynik najlepszej serii z ostatniej sesji + delta vs
     poprzednia.
   - **Zmiana % w okresie** — patrz §4.4.
   - **Sesje w okresie** + **średnie RPE**.
4. **Wykres-bohater A — „Najlepsza seria w sesji"**: linia max powtórzeń/sekund
   per punkt, **kropki barwione wg RPE** (≤6 zielony / 7–8 bursztyn / 9–10
   czerwony), wyróżniony znacznik PR. Oś X wg §4.3 (sesja lub tydzień).
5. **Karta B — „Objętość pracy"**: słupki sumy powtórzeń/sekund per tydzień.
6. **Karta C — „Siła = lżej"**: dwie linie — powtórzenia (↑) i średnie RPE (↓);
   ilustruje przyrost siły (więcej przy mniejszym koszcie).

### 3.3. Porównanie (tryb)

Wejście: na liście zaznaczasz kilka ćwiczeń → **„Porównaj"** (id-ki ćwiczeń lecą
w query stringu trasy, np. `?ex=<uuid>,<uuid>`).

- Jeden wykres wieloliniowy; **oś Y = % zmiany od startu okresu** — każda linia
  startuje od 0%, dzięki czemu **powtórzenia i sekundy mieszają się** na jednej
  osi. Odpowiada na pytanie „co rośnie najszybciej".
- Legenda z kolorami + możliwość dołożenia/usunięcia ćwiczenia.
- Wspólny **przełącznik zakresu** jak w szczególe.
- Ćwiczenie, którego wartość startowa w okresie = 0 (np. „nowe"), nie da się
  znormalizować do % → oznaczamy „za mało danych do porównania" i pomijamy
  z osi (lub pokazujemy jako wartość bezwzględną poza skalą — decyzja
  implementacyjna w planie; domyślnie: pomiń + komunikat).

### 3.4. Dwie role, ta sama mechanika

| | Podopieczny | Trener |
|---|---|---|
| Wejście | menu boczne → „Progresja" | zakładka „Progresja" na stronie podopiecznego |
| Zakres danych | własne logi | logi konkretnego podopiecznego (per `traineeId`) |
| Sort domyślny | ostatnio trenowane | „uwaga" + pasek podsumowania |
| Tryb | read-only | read-only |

Mechanika wykresów, KPI i porównania jest **identyczna**; różni się tylko źródło
danych (scope) i domyślny sort/podsumowanie.

---

## 4. Architektura techniczna

### 4.1. Trasy (każda = plik + wpis w `app/routes.ts`)

**Podopieczny** (`app/routes/podopieczny/`):
- `/podopieczny/progresja` → `progresja._index.tsx` — lista.
- `/podopieczny/progresja/:exerciseId` → `progresja.$exerciseId.tsx` — szczegół.
- `/podopieczny/progresja/porownanie` → `progresja.porownanie.tsx` — porównanie
  (ćwiczenia z `?ex=`).

**Trener** (`app/routes/trener/`), zagnieżdżone pod podopiecznym:
- `/trener/podopieczni/:traineeId/progresja` →
  `podopieczni.$traineeId.progresja._index.tsx`.
- `/trener/podopieczni/:traineeId/progresja/:exerciseId` →
  `podopieczni.$traineeId.progresja.$exerciseId.tsx`.
- `/trener/podopieczni/:traineeId/progresja/porownanie` →
  `podopieczni.$traineeId.progresja.porownanie.tsx`.

Wszystkie trasy mają **tylko loadery** (read-only). Linki w nawigacji:
pozycja „Progresja" w menu bocznym podopiecznego oraz zakładka na stronie
podopiecznego u trenera (obok Statystyki / Sylwetka / Konsultacje).

### 4.2. Warstwa logiki — nowy `app/lib/progression.ts`

Funkcje przyjmują wymagany scope i filtrują po nim (404 przy braku dostępu):

- **`listProgressionExercises(db, { traineeId, trainerId? })`** → tablica wierszy
  listy: `{ exerciseId, name, unit, tags, sessionCount, lastPerformedOn, pr,
  prAchievedOn, sparkline: number[], status: "up"|"flat"|"down"|"new" }`.
- **`getExerciseProgression(db, { traineeId, trainerId?, exerciseId, range })`** →
  `{ exercise: {id,name,unit}, points: ProgressionPoint[], kpis: ProgressionKpis }`,
  gdzie `ProgressionPoint = { label, performedOn|weekStart, bestReps, avgRpe,
  volume, isPr }` (granularność wg §4.3), a `kpis` zawiera PR + datę, ostatnią
  sesję + deltę, zmianę % (§4.4), liczbę sesji i średnie RPE.
- **`getProgressionComparison(db, { traineeId, trainerId?, exerciseIds[], range })`**
  → `{ series: Array<{ exerciseId, name, unit, points: {label, pctFromStart}[] }>,
  skipped: Array<{ exerciseId, reason }> }`.

**Autoryzacja:** gdy podany `trainerId`, funkcja najpierw weryfikuje, że
`traineeId` należy do tego trenera (re-użycie istniejącego helpera autoryzacji,
`app/lib/authz.ts`); brak relacji → **404**.

**Czyste helpery (testowalne bez DB) — wydzielone, cele TDD:**
- `aggregateToWeeks(points)` — sesje → tygodnie (max powt., suma objętości,
  śr. RPE) dla długich zakresów.
- `normalizeToPctFromStart(points)` — seria wartości → % zmiany od pierwszego
  punktu; obsługa start=0 (sygnał „pomiń").
- `classifyStatus(recent, prior)` — `up|flat|down|new` na bazie ostatnich vs
  poprzednich sesji (spójne progowo z `getExerciseProgress`).
- `computePeriodChangePct(points)` — „zmiana % w okresie" (§4.4).
- `bestSetOf(sets, unit)` / sumy objętości — z poprawną obsługą `REPS` vs `SEC`.

Funkcje czytające DB budują na surowych zapytaniach do `workoutSetLogs`
→ `workoutExerciseLogs` → `workoutLogs` (po `traineeId`, `exerciseId`,
`performedOn`), wykorzystując istniejący indeks
`workout_logs_trainee_date_idx (traineeId, performedOn)`.

### 4.3. Granularność osi X

- Zakres `4 tyg` / `3 mies` → **punkt = pojedyncza sesja** (pełen szczegół,
  każdy PR widoczny).
- Zakres `6 mies` / `cały` → **auto-agregacja do tygodni** (`aggregateToWeeks`),
  by uniknąć tłoku. Próg/strategia jest czystą funkcją i podlega testom.

### 4.4. „Zmiana % w okresie" (KPI)

Definicja na potrzeby v1: porównanie **średniej najlepszej serii z pierwszych
~3 sesji w okresie** vs **ostatnich ~3 sesji w okresie** (mniej wrażliwe na
pojedynczy odstający wynik niż „pierwsza vs ostatnia sesja"). Przy <2 sesjach
w okresie → KPI puste („—"). Dokładne progi (ile sesji do średniej) ustala plan;
funkcja jest czysta i testowana.

### 4.5. Wykresy — rozbudowa `app/components/stat-widgets.tsx`

Bez nowej biblioteki (spójnie z istniejącymi `Heatmap`, `Sparkline`,
`SegmentedBar`). Nowe komponenty SVG:

- **`ProgressionLineChart`** — linia + kropki barwione wg RPE + osie + znacznik
  PR. Bohater szczegółu.
- **`VolumeBars`** — słupki objętości per tydzień.
- **`RepsVsEffortChart`** — dwie linie (powt. ↑ / RPE ↓).
- **`ComparisonChart`** — wiele znormalizowanych linii + legenda.

Wszystkie kolory, typografia i odstępy z `app/styles/tokens.css` (lime `--accent`,
`--ok`/`--warn`/`--danger` dla RPE, monospace dla liczb). Mobile-first dla
podopiecznego; sensowne skalowanie na desktopie trenera.

### 4.6. Schemat / migracje

Moduł **nie zmienia modelu danych** — czyta istniejące tabele. Jeśli profilowanie
zapytań listy/szczegółu wykaże potrzebę dodatkowego indeksu (np. po
`exerciseId`), traktujemy to jako **osobną, świadomą decyzję**: edycja
`app/lib/db/schema.ts` → `npm run db:generate` (nigdy ręcznie `migrations/`).
Domyślnie v1 zakłada brak nowej migracji.

---

## 5. Stany brzegowe

- **0 sesji w całości** → ćwiczenie nie pojawia się na liście; pusta lista →
  przyjazny komunikat.
- **1 sesja** → kropka bez linii, status „nowe"; KPI zmiany % puste.
- **Brak danych w wybranym zakresie** (były logi dawniej) → komunikat „brak
  danych w tym okresie" + podpowiedź zmiany zakresu.
- **Porównanie ze startem = 0** → ćwiczenie oznaczone „za mało danych",
  pominięte z osi % (lista `skipped`).
- **Trener bez relacji do podopiecznego** → **404** (nie zdradzamy istnienia).
- **REPS vs SEC** — wszystkie agregaty i etykiety respektują `exercise.unit`
  (np. „12 s" vs „10 powt.").

---

## 6. Testy

### 6.1. Jednostkowe (TDD, w pętli — `npm test`)

Pisane **test-first** dla czystych helperów z `progression.ts`:
- `aggregateToWeeks` — poprawne grupowanie sesji do tygodni (granice ISO-tygodnia,
  max/suma/średnia).
- `normalizeToPctFromStart` — % od startu; obsługa start=0 (oznaczenie „pomiń”).
- `classifyStatus` — `up/flat/down/new` na danych granicznych.
- `computePeriodChangePct` — średnie z pierwszych vs ostatnich sesji; przypadki
  <2 sesji.
- `bestSetOf` / objętość — poprawność dla `REPS` i `SEC`.

### 6.2. Integracyjny (`*.itest.ts`, testcontainers — uruchamia właściciel)

Krytyczny przepływ **tenant-scope**:
- Trener **A** próbuje otworzyć progresję podopiecznego trenera **B** → **404**.
- `getExerciseProgression`/`listProgressionExercises` zwracają tylko dane
  właściwego `traineeId`.

`*.itest.ts` **piszemy**, ale **nie uruchamiamy** (Docker) — oznaczamy „do
uruchomienia przez właściciela".

---

## 7. Zakres v1 i co poza nim

**W v1:** lista (z filtrem/sortem wg roli), szczegół (A+B+C, 4 KPI, zakresy),
porównanie (% od startu), obie role, pasek podsumowania u trenera.

**Poza v1 (potencjalne v2):** notatki/komentarze trenera do progresu ćwiczenia
(wymaga mutacji), eksport danych, kamienie milowe/cele (target reps), korelacja
ze zdjęciami sylwetki, powiadomienia o plateau.

---

## 8. Aktualizacja dokumentacji (część „done")

- `app/routes/podopieczny/README.md` i `app/routes/trener/README.md` — nowe trasy.
- `app/lib/README.md` — nowy `progression.ts`.
- `app/components/README.md` — nowe komponenty wykresów w `stat-widgets.tsx`.
- `app/routes.ts` — wpisy tras.
- Mapa w `CLAUDE.md` — jeśli pojawią się nowe pliki w istniejących katalogach
  (README katalogu wystarcza; mapa `CLAUDE.md` linkuje do README, więc zmiana
  zwykle nie jest konieczna, chyba że dodamy nowy katalog).
