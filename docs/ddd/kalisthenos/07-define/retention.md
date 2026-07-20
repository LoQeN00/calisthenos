# F7 — Define — Bounded Context Canvas: `retention` (Retencja / Wrapped)

> **Status:** ZWALIDOWANY · **Data:** 2026-07-08 (walidacja właściciela: 2026-07-08)
> **Krok DDD:** 7 Define · **Zależy od:** F4, F5, F6 · **Kontekst F7:** #2 (core-first, po `advancement`)
> **Typ (F4):** core (**aspiracyjny** — differentiator z DECYZJI właściciela, nie z dzisiejszej złożoności)
> **Moduł własności (F6):** owned-core (**read-over-logs**, Separate Ways wobec `analytics`)

Bounded Context Canvas kontekstu **`retention`** (poddomena #12 „Retencja / Wrapped") — drugi
kontekst F7, pierwszy o rdzeniowości **aspiracyjnej**. Kanwa jest **zrekonstruowana z kodu**: każda
odpowiedzialność i każdy komunikat IN/OUT ma dowód `file:line`. Stan opisuje to, **co JEST**; zakłady na
przyszłość oznaczone `PROPOZYCJA:`. Ponieważ rdzeniowość tu jest aspiracyjna (differentiator z decyzji F4,
nie z dzisiejszego kodu), kanwa szczególnie pilnuje granicy **stan-JEST ⟂ `PROPOZYCJA`**.

## Wejście (co przeczytano)

**Artefakty poprzednich faz (priory zweryfikowane w kodzie, nie kopiowane na wiarę):**
- `04-strategize-core-domain-chart.md` — #12 = **core (decyzja właściciela)**, complexity medium, differentiation
  `high*` (gwiazdka = osąd właściciela); `PROPOZYCJA:` sprzęgnąć archetypy z sygnałami rdzenia progresji (DVS).
- `05-connect-context-map.md` — `retention` §1 (własne agregaty nad surowymi logami, silnik `pickArchetype`,
  `wrapped.ts:1-3` tylko drizzle+db+schema); §2.2 **Separate Ways ⟺ `analytics`** (symetryczny, zero wspólnego
  kodu); §2.3 Conformist-gwiazda (czyta surowe logi #8 i katalog #4); rozstrzygnięcie **H7** (Wrapped czyta
  surowe logi #8, NIE read-model rdzenia); smell §5 „PR/Rekord zdublowany 3×".
- `06-organise-wlasnosc-modulow.md` — wiersz `retention`: **owned-core**, Separate Ways wobec analytics,
  czyta surowe logi #8 równolegle, CL medium, kandydat na niezależne wdrożenie.
- `07-define/advancement.md` (sąsiad-rdzeń, ZWALIDOWANY) — Komunikaty OUT (advancement **nie emituje**
  zdarzenia „Awans") + hot-spot #4 (H7): sprzęgnięcie retencji = otwarta `PROPOZYCJA:`.
- `glosariusz.md` — **Wrapped**, **Archetyp**, **Rekord (PR)**, **Progresja**, blok „Uzupełnienie F7 · advancement".
- `SZABLON-artefaktu.md`, `07-define/README.md` (kolejność core-first).

**Kod (rdzeń czytany dokładnie, z dowodami `file:line`):**
- `app/lib/wrapped.ts` (686 linii) — cały moduł domenowy: `getMonthlyWrapped` (:580-663), `pickArchetype`
  (:494-574), `loadMonthCore` (:211-256), `loadTopExercise` (:262-309), `loadMonthlyPRs` (:315-399),
  `loadHeaviestDay` (:405-450), `loadWeeksActive` (:456-477), `getAvailableWrappedMonths` (:79-106),
  `getLatestAvailableWrapped` (:112-118), helpery kalendarza `isPastMonth`/`parseYM`/`monthBounds`/`currentYM`
  (:29-61), `weeksOverlappingMonth` (:670-685). Importy `:1-3`.
- `app/routes/podopieczny/wrapped.$ym.tsx` — trasa (loader :24-40: `requireUser` role=trainee →
  `assertTrainerActive` → `parseYM`/`isPastMonth`/`hasData` → 404; deck kart UI: `Card`/`buildCards`/`CardDeck`
  :100-328; `localizeArchetype` :709-763; `ShareBar` :928-985).
- `app/routes/podopieczny/_index.tsx` — pulpit: `WrappedBanner` (:26-124, render :176), loader woła
  `getAvailableWrappedMonths`/`getLatestAvailableWrapped` (:138,141), `WrappedListRow` (:401).
- `app/components/trainee-stats.tsx` — `WrappedListRow` (:255-308, link do `/podopieczny/wrapped/:ym` :277).
- `app/lib/trainee-access.ts` — `assertTrainerActive` (:17-25, czyta `users.archivedAt` trenera).
- `app/lib/db/schema.ts` — tabele logów #8: `workoutLogs` (:382-410), `workoutExerciseLogs` (:412-427),
  `workoutSetLogs` (:429-448, `reps` :437, `difficulty` :438 + CHECK 1..10 :443-446); `exercises.unit`
  (enum `exerciseUnit` :31, :234); `skillAdvancements` (:662-696). **Grep `wrapped|retention|retencj` = 0** (brak tabeli).
- `app/routes.ts` — rejestracja `wrapped/:ym` **POZA** layoutem podopiecznego (:114-115).
- Do weryfikacji Separate Ways + smellu PR: `app/lib/stats.ts` (`detectNewPRsForLog` :1087-1150,
  `redZonePct` :322/341, effort-balance :732-744), `app/lib/progression.ts` / `progression-math.ts`
  (`markPrs` :111-125), `app/lib/skill-progression-math.ts` (`HIGH_RPE=8` :27) — **retention ICH NIE importuje**.

**Silnik jakości (CIĘŻKA, §7 planu):** fan-out 8 agentów wypełnił osiem pól kanwy z kodu z dowodami →
**adwersaryjna weryfikacja per twierdzenie** (jeden sceptyk na każde twierdzenie, każdy MUSIAŁ otworzyć cytowany
plik; twierdzenia o *braku* — „nie importuje", „brak tabeli", „brak trasy trenera" — sprawdzane grepem) → przeżyło
to, co ugruntowane w kodzie. **122 agentów łącznie** (pierwszy przebieg przerwany limitem sesji, wznowiony z cache).
Wynik: **93 CONFIRMED, 21 PARTIAL** (doprecyzowania wchłonięte niżej), **0 REFUTED**. Kluczowe doprecyzowania z
weryfikacji: „izolowany read-model" jest prawdą tylko na poziomie importów modułów — na poziomie danych istnieje
**sprzężenie przez współdzieloną bazę** (czyta 4 tabele dwóch innych kontekstów przez `import * as schema`);
„zero wspólnego kodu" = brak wspólnej logiki read-modeli (współdzielona jest tylko infrastruktura `db/schema`);
smell PR jest **szerszy niż ×3** (≥4-5 miejsc, dwa różne algorytmy); prymitywy walidacji miesiąca (`parseYM`/
`isPastMonth`) żyją w module, ale **decyzje 404 gating** — w warstwie trasy; próg RPE red-zone (≥9 per-seria) to
**inna granulacja**, nie „retencja vs statystyki".

---

## Ustalenia — Bounded Context Canvas

### 1. Strategic Classification

| Wymiar | Wartość (dowód) |
|---|---|
| **Typ domeny** | **CORE aspiracyjny** (F4 #12, decyzja właściciela — „retencja jako moat"). Rdzeniowość NIE wynika z dzisiejszej złożoności (CL medium wg F6), lecz z zakładu strategicznego. Silnik archetypów (`pickArchetype`, `wrapped.ts:494-574`) liczony z **generycznych agregatów logów** (`ArchetypeInputs` `:484-492`) — mechanizm dziś **kopiowalny**. |
| **Model biznesowy** | **Retencja / gamifikacja motywacyjna dla PODOPIECZNEGO.** Comiesięczna retrospektywa „Wrapped" w stylu Spotify (nagłówek `wrapped.ts:5-8`): odblokowanie 1. dnia następnego miesiąca, baner nagabujący na pulpicie (`_index.tsx:176`), wiralowy „Udostępnij" (`wrapped.$ym.tsx:928-985`). Trener **nie ma** Wrapped. |
| **Ewolucja / dojrzałość** | **Czysty read-model nad surowymi logami #8, BEZ własnej tabeli** (grep `wrapped\|retention` w `schema.ts` = 0; wszystkie zapytania to `db.select` — `wrapped.ts:83-476`). Własność (F6): **owned-core / read-over-logs**. **Separate Ways** wobec `analytics` (brak wspólnej logiki domenowej). |

**Dlaczego to rdzeń — i dlaczego rdzeń ASPIRACYJNY (dowody):**
- **Differentiator z decyzji, nie z kodu.** `pickArchetype` (`wrapped.ts:494-574`) to 9 archetypów wybieranych
  **pierwszą pasującą regułą**, a wszystkie wejścia (`ArchetypeInputs` `:484-492`) to generyczne agregaty logów
  treningu (objętość, RPE, tygodnie, PR-y, dywersyfikacja). Żaden input nie pochodzi z domeny progresji/awansów —
  mechanizm jest odtwarzalny z dowolnego schematu logowania, więc dziś **kopiowalny**. Realny moat wymaga
  `PROPOZYCJI` sprzęgnięcia z rdzeniem progresji (H7, niżej).
- **Izolacja tylko na poziomie importów, nie danych** *(doprecyzowanie z weryfikacji).* `wrapped.ts:1-3` importuje
  **wyłącznie** `drizzle-orm`, typ `Db`, `* as schema` — zero importu innego modułu domenowego. ALE przez
  `import * as schema` czyta **4 tabele należące do innych kontekstów** (`workoutLogs`/`workoutExerciseLogs`/
  `workoutSetLogs` — workout-logging; `exercises` — catalog-skill). To **integracja przez współdzieloną bazę** —
  realne sprzężenie danych, choć nie importów. „Kandydat na niezależne wdrożenie" (F6) jest więc prawdą tylko z
  zastrzeżeniem: bez dostępu do danych tych dwóch kontekstów wdrożyć się nie da.
- **Bezstanowy w warstwie backendu.** Brak `insert/update/delete` w całym `wrapped.ts` (grep = 0); reguła
  odblokowania liczona on-the-fly (`isPastMonth`), nie materializowana. Jedyny trwały stan to **kliencki
  localStorage** (`wrapped-viewed-{ym}` `wrapped.$ym.tsx:55`, `wrapped-dismissed-{ym}` `_index.tsx:48`) — tłumik
  banera, nie stan domenowy w DB.

### 2. Ubiquitous Language / model domenowy

| Pojęcie (PL) | Reprezentacja w kodzie | Dowód |
|---|---|---|
| **Wrapped** (miesięczna retrospektywa) | `WrappedSummary` (15 pól: year/month/ym/label/hasData/sessions/totalReps/totalSeconds/totalSets/weeksActive/topExercise/prs/heaviestDay/archetype/vsPrevious); orkiestrator `getMonthlyWrapped` składa je z 6 zapytań przez `Promise.all` | `wrapped.ts:179-195,580-663` |
| **Archetyp** („osobowość treningowa" miesiąca) | `Archetype{key,label,description,emoji}`; domknięta unia `ArchetypeKey` = **9 wartości**; `pickArchetype` = **8 gałęzi `if` + 1 bezwarunkowy fallback** (`explorer`), „first matching rule wins" | `wrapped.ts:124-140,479-574` |
| **Rekord miesięczny** (`MonthlyPR`) | max reps ćwiczenia W miesiącu > max reps PRZED miesiącem (cała historia); `previousBest` (0 = pierwszy raz); sort po przyroście | `wrapped.ts:142-148,315-399` |
| **Odblokowanie / miesiąc dostępny** (`AvailableMonth`) | miesiąc **przeszły** (`isPastMonth` = ściśle przed bieżącym miesiącem **UTC**) **I** ma ≥1 log; `getAvailableWrappedMonths` filtruje + sortuje newest-first | `wrapped.ts:67-73,47-50,79-106` |
| **Retrospektywa / deck kart** | koncept **UI w trasie** (nie w module): `Card` (9 rodzajów), `buildCards`, `CardDeck` (pasek postępu, klawiatura, strefy dotyku) | `wrapped.$ym.tsx:264-328,100-258` |
| **Porównanie m/m** (`VsPrevious`) | delty do poprzedniego kalendarzowego miesiąca (drugi `loadMonthCore`); `hasPrevious = prevCore.sessions>0` | `wrapped.ts:166-177,586-644` |
| **Najcięższy dzień** (`HeaviestDay`) | pojedynczy Trening o max `SUM(reps)` (LIMIT 1); **sumuje `reps` niezależnie od jednostki** — miesza powtórzenia z sekundami | `wrapped.ts:150-156,405-450` |
| **Top ćwiczenie** (`TopExercise`) | ćwiczenie w **najwięcej SESJACH** (`COUNT DISTINCT`), nie po objętości; `pctOfSessions` przeliczany w `getMonthlyWrapped` (`loadTopExercise` wołane z `totalSessions=0`) | `wrapped.ts:158-164,262-309,601-611` |
| **`MonthCore`** (agregat miesiąca) | sessions/totalReps/totalSeconds/totalSets/avgRpe/redZoneSets/ratedSets; `reps` vs `secs` rozdzielane `CASE` po `exercises.unit` na tej samej kolumnie `workoutSetLogs.reps` | `wrapped.ts:201-209,211-256` |
| **redZone** (seria „na maksa") | `difficulty >= 9` per-seria; materializuje się w archetypie **Maksymalista** (`redZoneSets/ratedSets > 0.4`) | `wrapped.ts:226,522-530` |
| **Tygodnie aktywne vs w miesiącu** | `weeksActive` = distinct `date_trunc('week', performedOn)` (poniedziałkowy, ISO); `weeksInMonth` = `weeksOverlappingMonth` (czysto kalendarzowo) | `wrapped.ts:456-477,670-685` |
| **Jednostka REPS/SEC, RPE** | zapożyczone z katalogu (`exercises.unit` enum) i logów (`difficulty` = RPE 1–10); retention nie definiuje własnych | `schema.ts:31,234,438-446`; `wrapped.ts:223-225` |

> **Uwaga językowa — granica „Rekord/PR".** Termin **współdzielony z `analytics` tylko nominalnie**: to ten sam
> pomysł (pobicie dotychczasowego max reps), ale liczony w **INNYM oknie** i **ODRĘBNYM kodem**. retention:
> okno = kalendarzowy miesiąc, prior = `performedOn < start` (`wrapped.ts:354-375`). analytics
> `detectNewPRsForLog`: okno = pojedynczy log, prior = wszystkie inne logi (`stats.ts:1087-1150`). analytics
> `ExerciseProgress.pr`: bieżący all-time max (wartość, `stats.ts:520`). `progression-math.markPrs`: running-high
> w serii wykresu (`:111-125`). **≥4 reprezentacje tej samej idei** — utrwala smell dedupu (§7 R10).

### 3. Odpowiedzialności

1. **Liczy miesięczny read-model Wrapped** — `getMonthlyWrapped` orkiestruje 6 zapytań `Promise.all`
   (`loadMonthCore` bieżący + poprzedni, `loadTopExercise`, `loadMonthlyPRs`, `loadHeaviestDay`, `loadWeeksActive`)
   i składa `WrappedSummary`. — `wrapped.ts:580-599,646-662`
2. **Wybiera archetyp regułowo** — `pickArchetype`, 9 archetypów, pierwsza pasująca reguła, od najbardziej
   wyróżniającego do fallbacku. — `wrapped.ts:494-574`
3. **Wykrywa Rekordy miesiąca względem CAŁEJ wcześniejszej historii** — `loadMonthlyPRs` (max miesiąca vs
   `COALESCE(MAX,0)` sprzed pierwszego dnia; `newExercises` gdy prior=0). — `wrapped.ts:315-399`
4. **Liczy rdzeniowe metryki miesiąca** — `loadMonthCore` (objętość REPS/SEC, `avgRpe`, red-zone, `ratedSets`),
   dla bieżącego i poprzedniego miesiąca. — `wrapped.ts:211-256,589-591`
5. **Wyłania top ćwiczenie** (po liczbie sesji) i **najcięższy dzień** (po `SUM(reps)`). — `wrapped.ts:262-309,405-450`
6. **Liczy tygodnie aktywne** i zestawia z `weeksOverlappingMonth` (archetyp Konsekwentny). — `wrapped.ts:456-477,670-685`
7. **Porównuje miesiąc do poprzedniego** (`VsPrevious`). — `wrapped.ts:586-644`
8. **Wystawia listę dostępnych miesięcy + banner najnowszego** (`getAvailableWrappedMonths`/
   `getLatestAvailableWrapped`, gating past+hasData wbudowany). — `wrapped.ts:79-118`

**Świadomie NIE są odpowiedzialnością tego kontekstu** (dowód granicy):
- **Nic nie ZAPISUJE do DB** — czysty read-model (7× `db.select`, 0× insert/update/delete, `wrapped.ts`);
  jedyny „zapis" to kliencki localStorage (znacznik obejrzenia/odrzucenia banera). — `wrapped.$ym.tsx:55`, `_index.tsx:48`
- **Nie liczy progresji time-series ani plateau** (→ `analytics`; brak importu `stats`/`progression`). — `wrapped.ts:1-3`
- **Nie zna awansu na drzewie umiejętności** (→ `advancement`; grep `advancement\|awans` w `wrapped.ts` = 0). — `wrapped.ts`
- **Nie służy trenerowi** — brak trasy trenerskiej (grep w `app/routes/trener` = 0 plików).
- **Prymitywy walidacji miesiąca żyją w module** (`parseYM`/`isPastMonth`, `wrapped.ts:47,53`), ale **decyzje 404
  gating** i orkiestracja `assertTrainerActive` — w **warstwie trasy** (`getMonthlyWrapped` nie rzuca, tylko wystawia
  `hasData`). — `wrapped.$ym.tsx:29-38`; `wrapped.ts:651`

### 4. Komunikaty IN (kto woła → co)

**Komendy:** **BRAK.** Kontekst nic nie mutuje: żadna trasa nie eksportuje `action`, moduł nie ma funkcji zapisu
(grep `insert/update/delete/.set(` = 0). — `wrapped.$ym.tsx` (tylko `loader`), `_index.tsx` (tylko `loader`), `wrapped.ts`

**Zapytania** (read-model wołany z zewnątrz):

| Zapytanie | Wywołujący (dowód) |
|---|---|
| `getMonthlyWrapped(db, traineeId, year, month)` → `WrappedSummary` | **jedyny caller:** loader trasy deck `wrapped.$ym.tsx:35` (`user.id`) |
| `getAvailableWrappedMonths(db, traineeId)` → `AvailableMonth[]` | loader pulpitu `_index.tsx:138` → prop do `WrappedListRow` (`_index.tsx:401`, `trainee-stats.tsx:255-308`) |
| `getLatestAvailableWrapped(db, traineeId)` → `AvailableMonth\|null` | loader pulpitu `_index.tsx:141` → steruje `WrappedBanner` (`_index.tsx:176`) |
| pomocnicze czyste: `parseYM`, `isPastMonth` | loader `wrapped.$ym.tsx:30,32` jako bramki (→ 404). `formatYM`/`monthLabel` używane tylko wewnętrznie |

**Powierzchnia wąska:** funkcje cząstkowe (`loadMonthCore`, `loadTopExercise`, `loadMonthlyPRs`, `loadHeaviestDay`,
`loadWeeksActive`, `pickArchetype`, `weeksOverlappingMonth`) **nie są eksportowane** — read-model nie ujawnia kroków
składowych. **Konsumenci kompletni:** tylko **2 pliki** importują `~/lib/wrapped` (obie trasy podopiecznego) — grep
potwierdza brak konsumenta w `lib/*`, `routes/trener/*`, `routes/marka/*`. — `wrapped.ts:211-476`; `_index.tsx:18`; `wrapped.$ym.tsx:10-17`

**Koperta dostępu** (wołana w loaderze PRZED read-modelem): `requireUser(role:"trainee")` + `assertTrainerActive`
(jawny gate wstrzymania, bo trasa poza layoutem) + `isPastMonth` + `hasData`. — `wrapped.$ym.tsx:24-40`; `trainee-access.ts:17-25`

**Zdarzenia IN:** **BRAK.** Brak subskrypcji jakiejkolwiek szyny; `wrapped.ts` importuje tylko drizzle/Db/schema.
Kontekst uruchamia się reaktywnie **na żądanie loadera (pull)**, nie na push zdarzenia. — `wrapped.ts:1-3`

### 5. Komunikaty OUT (co → do kogo)

**Zapytania OUT** (kontekst jako Conformist/Customer czytający sąsiadów, wprost na ich tabelach — bez API/ACL):

| Zapytanie OUT | Odbiorca (kontekst) | Warunek / dowód |
|---|---|---|
| surowy join `workoutLogs` ⋈ `workoutExerciseLogs` ⋈ `workoutSetLogs` | **`workout-logging` (#8)** (Conformist/D) | 4 z 6 funkcji ładujących; konsumuje kolumny wprost (`difficulty` jako RPE, `reps` dla REPS i SEC) — `wrapped.ts:229-237,277-281,331-338,421-429` |
| join `exercises` → `name`, `unit` | **`catalog-skill` (#4)** (Conformist/D) | tylko name/unit; nigdy nie pisze/forkuje — `wrapped.ts:238,282,340`; `schema.ts:233-234` |
| `assertTrainerActive` → odczyt `users.archivedAt` **trenera** | **`identity`** (Conformist/D) | jawny w loaderze, bo trasa poza layoutem; redirect gdy trener zdezaktywowany — `wrapped.$ym.tsx:28`; `trainee-access.ts:17-25` |

**Dane wystawiane** (kontekst jako **Supplier/U**): dwa kształty read-modelu — `WrappedSummary` i `AvailableMonth` —
konsumowane **wyłącznie przez własne trasy/komponenty UI podopiecznego** (`wrapped.$ym.tsx`, `_index.tsx`,
`WrappedListRow`); **żaden inny BC ich nie czyta**. — `wrapped.ts:67-73,179-195`

**Zdarzenia OUT:** **BRAK.** Read-only, nic nie publikuje (0 emisji, 0 zapisu, 0 outbox — grep całego `app/` na
`eventBus/emit/publish/outbox` = brak szyny). — `wrapped.ts:83-476`

> **BRAK krawędzi OUT do rdzenia `advancement`/progresji (kontrast do H7).** `wrapped.ts` nie importuje
> `skill-progression*` ani `stats.ts`; `pickArchetype` liczy archetyp **wyłącznie z sygnałów z surowych logów**.
> Wrapped czyta logi #8 **RÓWNOLEGLE** do `analytics`, bez wspólnego kodu (**Separate Ways potwierdzony dwustronnie**:
> `stats.ts`/`progression.ts` też nie znają `wrapped`). To m.in. źródło `PROPOZYCJI` H7. — `wrapped.ts:1-3,198`; `stats.ts`; `progression.ts`

### 6. Zależności + tryb (per krawędź, z F5/F6, potwierdzony kierunek w kodzie)

| Sąsiad | Wzorzec | Kierunek | Mechanizm (dowód) |
|---|---|---|---|
| **`analytics`** (#11) | **Separate Ways** | **symetryczny** | ZERO wzajemnego importu; jedyny współdzielony moduł to `~/lib/db/schema` (+ `db/client`, `drizzle-orm`) = **infrastruktura persystencji**, nie punkt integracji. Oba czytają #8 równolegle własnym SQL — `wrapped.ts:1-3`; `stats.ts`/`progression.ts` grep `wrapped` = 0 |
| **`workout-logging`** (#8) | Conformist (Conformist-gwiazda F5 §2.3) | retention=**D**, wl=**U** | surowy join logów po `traineeId`; brak warstwy tłumaczącej (difficulty→RPE to tylko alias) — `wrapped.ts:229-245,324-375` |
| **`catalog-skill`** (#4) | Conformist | retention=**D**, cs=**U** | `innerJoin exercises`, czyta tylko `name`/`unit`; wartości enuma `'REPS'/'SEC'` zaszyte wprost w SQL — `wrapped.ts:272-282,329-340` |
| **`identity`** (kręgosłup tenancy, Published Language H8) | Conformist | retention=**D** | **scope wyłącznie po `traineeId`** (`user.id` zalogowanego podopiecznego), **NIE po `trainer_id`** (kolumna zdenormalizowana, tu nieużywana); trasa ma param tylko `:ym` → nie da się zażądać cudzego Wrapped (self-scope, nie luka). Gate wstrzymania `assertTrainerActive` czyta `users.archivedAt` trenera. — `wrapped.ts:90,241`; `schema.ts:386-392`; `wrapped.$ym.tsx:25,28,35` |

**Tryb własności (F6):** **owned-core / read-over-logs** — kontekst **nie pisze do żadnej tabeli** i **nie ma
własnej tabeli**; wszystkie krawędzie to **odczyt** cudzego modelu (Conformist) albo **wystawienie** własnego
read-modelu (Supplier). Kandydat na niezależne wdrożenie *z zastrzeżeniem* sprzężenia danych (§1).

### 7. Reguły / decyzje (z dowodem)

- **R1. Czysty read-model bez własnej tabeli.** Grep `wrapped\|retention` w `schema.ts` = 0; wszystkie zapytania
  to `db.select` nad `workoutLogs/workoutExerciseLogs/workoutSetLogs/exercises`. — `schema.ts`; `wrapped.ts:83-476`
- **R2. Separate Ways wobec `analytics`** — `wrapped.ts` nie importuje `stats.ts`/`progression*`; jedyne trafienie
  `stats` to komentarz (`:198`). — `wrapped.ts:1-3`
- **R3. Odblokowanie = 1. dnia następnego miesiąca UTC + ≥1 Trening.** `isPastMonth` (ściśle przed bieżącym
  miesiącem UTC, `currentYM` z `getUTC*`) **I** `hasData = core.sessions>0`; naruszenie → **404 (nie 403)**,
  zgodnie z konwencją ukrywania zasobu. — `wrapped.ts:47-50,651`; `wrapped.$ym.tsx:29-38`
- **R4. Jawny gate wstrzymania.** Trasa jest **POZA** layoutem podopiecznego (`routes.ts:114-115`), więc loader
  sam woła `assertTrainerActive` → redirect na `/podopieczny/wstrzymane` gdy `trainer.archivedAt`. — `wrapped.$ym.tsx:28`; `trainee-access.ts:17-25`
- **R5. Trener nie ma Wrapped.** Jedyna trasa `wrapped/:ym` jest w prefiksie `podopieczny`, loader wymusza
  `role="trainee"`; grep w `routes/trener` = 0. — `routes.ts:115`; `wrapped.$ym.tsx:25`
- **R6. Archetyp = pierwsza pasująca z 9 reguł** (8 `if` + fallback `explorer`), progi zaszyte: `prCount≥3`
  (power-user) → `newExercises≥2` (experimenter) → `weeksActive≥4 && ≥weeksInMonth-1` (consistent) →
  `redZoneSets/ratedSets>0.4` (maximalist) → `topPct>50` (specialist) → `totalSeconds>totalReps` (endurance) →
  `distinctExercises≥5 && topPct≤35` (all-rounder) → `weeksActive≥3` (patient) → `explorer`. Teksty PL w
  `wrapped.ts`, ale trasa **re-lokalizuje po stabilnym `key`** (`localizeArchetype`). — `wrapped.ts:479-574`; `wrapped.$ym.tsx:709-763`
- **R7. Objętość dzielona REPS/SEC** przez `CASE` na `exercises.unit`, na **tej samej** kolumnie `reps` (dla ćwiczeń
  czasowych `reps` fizycznie trzyma sekundy). `avgRpe = AVG(difficulty)`. — `wrapped.ts:223-225`; `schema.ts:437`
- **R8. redZone = `difficulty >= 9` per-seria** (archetyp Maksymalista). **Próg NIESPÓJNY** z resztą domen:
  `advancement` i effort-balance używają **8 na ŚREDNIEJ** (`HIGH_RPE=8`, „Ciężkie ≥ 8"). *Doprecyzowanie:* to nie
  „retencja vs statystyki" — ten sam `≥9` per-seria używa też trenerska „Czerwona strefa" (`stats.redZonePct`); to
  **dwie granulacje** (pojedyncza seria `≥9` vs średnia sesji `≥8`) rozłożone na obie domeny. — `wrapped.ts:226,523`;
  `stats.ts:322,732-744`; `skill-progression-math.ts:27`
- **R9. Rekord liczony LOKALNIE** (`loadMonthlyPRs`): max reps miesiąca vs `COALESCE(MAX,0)` z całej historii sprzed
  miesiąca; PR gdy `thisMax > prior`; `previousBest = prior`. Bez persystencji. — `wrapped.ts:315-399`
- **R10. Smell: detekcja Rekordu zdublowana ≥4× (nie 3×)** *(doprecyzowanie).* Dwa bliźniacze detektory **SQL**
  „okno-MAX vs prior-MAX": `wrapped.loadMonthlyPRs` (`:386`) i `stats.detectNewPRsForLog` (`:1140`). Trzeci algorytm
  (inny): `progression-math.markPrs` = running-high w serii (`:114`, już współdzielony/testowany). Dodatkowo **inline**
  running-high w `progression.ts:124-131,201-209` i `stats.ts:520,617`. Brak wspólnego helpera detekcji.
- **R11. Kalendarz UTC.** `monthBounds` (`Date.UTC`, przedział półotwarty `[start, nextStart)`), `currentYM` (`getUTC*`),
  `weeksOverlappingMonth` (`Date.UTC`/`getUTC*`); filtr logów `performedOn >= start && < nextStart`. — `wrapped.ts:34-50,670-685`
- **R12. Tygodnie ISO.** `weeksActive` = distinct `date_trunc('week', performedOn)` (poniedziałek); `consistent` ma
  dodatkowy floor `weeksActive≥4` obok `≥weeksInMonth-1`. — `wrapped.ts:465,475,514`
- **Quirk (decyzja proceduralna).** `loadTopExercise` wołane z `totalSessions=0` → wewnętrzny `pct=0`; `getMonthlyWrapped`
  **przelicza** `pctOfSessions` po poznaniu `core.sessions`, i to `topPctFinal` (nie surowy) idzie do `pickArchetype`;
  `.then(async r => r)` jest no-opem. — `wrapped.ts:592-595,601-611,621`

### 8. Założenia

- **Z1.** `performedOn` to kolumna **DATE** (Drizzle w trybie string); przynależność do miesiąca przez porównania
  ISO `YYYY-MM-DD` (leksykograficznie = chronologicznie, więc poprawne). — `schema.ts:401`; `wrapped.ts:242-243`
- **Z2.** Wszystkie granice czasowe liczone w **UTC** (serwer), także `timeZone:"UTC"` w formatowaniu nazwy miesiąca. — `wrapped.ts:34-50,670-685`; `wrapped.$ym.tsx:93-94`
- **Z3.** Progi 9 archetypów i próg red-zone (`≥9`) to **magic-numbery** zaszyte w kodzie; brak tabeli/konfiguracji
  progów. Ten sam `≥9` zduplikowany w `stats.ts:322`. — `wrapped.ts:494-574,226`
- **Z4.** Teksty archetypów po polsku w `wrapped.ts`, **re-lokalizowane po `key`** w trasie; tylko `power-user`
  (`count`) i `specialist` (`pct`) re-interpolują liczby — `experimenter`/`all-rounder` używają kopii bez liczb, bo
  `newExercises`/`distinctExercises` nie są w `WrappedSummary` (tylko w wewnętrznym `ArchetypeInputs`). — `wrapped.$ym.tsx:702-763`
- **Z5.** Izolacja tenanta = **self-scope po `traineeId`** (tożsamość sesji), nie para `trainer_id+trainee`. — `wrapped.ts:90`; `wrapped.$ym.tsx:35`

---

## Hot-spoty / otwarte pytania

> **Decyzje właściciela (checkpoint 2026-07-08):** #1 (H7) i #2 („Awans" do retention) → **otwarte
> `PROPOZYCJE`, rozstrzygnięcie należy do fazy architektury** (jak w `advancement`; kanwa niczego nie
> przesądza). #3–#6 (dedup PR, próg RPE, self-scope, off-by-one UTC) oraz #7 (serwerowe „obejrzano") →
> **dług reimplementacji — bez zmian w kodzie teraz.**

1. **`PROPOZYCJA:` sprzęgnięcie archetypów z sygnałami rdzenia progresji (H7).** Dziś krawędzi **NIE ma** — inputy
   `pickArchetype` pochodzą wyłącznie z agregatów logów; retention **nie czyta** `skillAdvancements` ani sygnałów
   plateau/„łatwiej" z `analytics`. Rdzeniowość jest **aspiracyjna**; realny moat wymagałby archetypu/karty opartej o
   awans w drzewie umiejętności. *Doprecyzowanie:* archetypy już dziś używają **więcej niż reps/sec/RPE** (PR-y, nowe
   ćwiczenia, kadencja, dywersyfikacja) — brakuje konkretnie **sygnału awansu/umiejętności**. **Decyzja właściciela
   (F4/F5): do fazy architektury; kanwa niczego nie przesądza.** — `wrapped.ts:484-574`; `skillAdvancements` `schema.ts:662-696`
2. **`PROPOZYCJA:` wystawienie „Awansu" z `advancement` do retention.** *Doprecyzowanie z weryfikacji:* źródłem
   „Awansu" jest **`skill-progression.ts` + tabela `skillAdvancements`** (NIE `progression.ts`), a „Awans" **już dziś
   jest zdarzeniem** — append-only wierszem. W repo **nie ma szyny pub/sub**, więc najbliższą istniejącemu wzorcowi
   (Separate Ways / read-over-logs) realizacją byłoby, aby **`wrapped` odczytał tabelę `skillAdvancements`** — tak jak
   dziś czyta `workoutLogs` — a nie „progression emituje zdarzenie". `prs` (MonthlyPR) to już kamień milowy (rekordy
   powtórzeń); brakuje kamieni milowych **awansu**. Spójne z hot-spotem #4 kanwy `advancement`.
3. **`PROPOZYCJA:` konsolidacja detekcji Rekordu (smell R10).** Bliźniacze detektory SQL (`wrapped.loadMonthlyPRs`
   ⟺ `stats.detectNewPRsForLog`) warto rozstrzygnąć świadomie: albo wspólny **czysty helper matematyczny** (à la
   `catalog-math`; `progression-math` jest po części takim helperem po stronie analytics), albo **jawnie udokumentować**,
   że każdy kontekst liczy PR w innym oknie. **Uwaga na trade-off:** współdzielenie kodu retention↔analytics przecięłoby
   **Separate Ways**; realnie współdzielna jest tylko trywialna reguła `thisMax > prior` — ciężar leży w SQL (różne
   `WHERE`) i kształcie wyjścia. Dziś rozjazd jest **niejawny** (smell), nie decyzja.
4. **`PROPOZYCJA:` ujednolicić próg RPE „ciężkiej" serii lub udokumentować rozbieżność.** `≥9` per-seria (Wrapped
   Maksymalista + trenerska Czerwona strefa) vs `≥8` na średniej sesji (effort-balance + regres w `advancement`) —
   „maksymalista" i „za ciężko" nie zapalają się na tych samych danych. To **dwie granulacje**, nie podział domenowy.
5. **Otwarte pytanie: self-scope po `traineeId` vs `trainer_id` — świadoma decyzja czy dług?** Dziś bezpieczne (trasa
   ma param tylko `:ym`, `user.id` z sesji, `role=trainee`), ale odbiega od kręgosłupa `trainer_id`/`trainee_id` reszty
   kontekstów (H8). Do rozstrzygnięcia w reimplementacji. — `wrapped.ts:90`; `wrapped.$ym.tsx:35`
6. **Ryzyko: off-by-one strefy czasowej (UTC).** Granice „bieżący/przeszły miesiąc" z serwerowego `new Date()` w UTC;
   podopieczny w PL/FR (UTC+1/+2) → Wrapped odblokowuje się **~1–2 h PO** lokalnej północy 1. dnia (zawsze późno, nigdy
   przedwcześnie). Przynależność logu do miesiąca **bezpieczna** (DATE). Do decyzji: świadoma tolerancja czy naprawa. — `wrapped.ts:41-50`
7. **`PROPOZYCJA:` serwerowa persystencja „obejrzano Wrapped".** Dziś stan żyje tylko w kliencie (`localStorage`
   `wrapped-viewed-`/`wrapped-dismissed-`); przeniesienie na serwer utworzyłoby **pierwszą KOMENDĘ IN** kontekstu +
   wymóg tabeli. Komentarz `_index.tsx:40-41` („marks it server-side") jest **nieaktualny/mylący** — do poprawy. — `wrapped.$ym.tsx:53-59`; `_index.tsx:36-48`

---

## Zmiany w glosariuszu

Kanwa **nie wprowadza** nowych bytów domenowych — potwierdza i uściśla istniejące (**Wrapped**, **Archetyp**,
**Rekord (PR)**). Kandydaci do dopisania/uściślenia w `glosariusz.md` **po walidacji**:
- **Odblokowanie Wrapped** — 1. dnia następnego miesiąca UTC + ≥1 Trening; naruszenie → 404 (`isPastMonth`+`hasData`).
- **Archetyp** — doprecyzowanie: 8 gałęzi `if` + 1 fallback (`explorer`), first-match-wins; teksty PL w module,
  re-lokalizacja po `key` w trasie.
- **Rekord miesięczny (MonthlyPR)** — PR w oknie kalendarzowego miesiąca vs cała historia sprzed miesiąca; **inny
  koncept niż PR w `analytics`** (inne okno) — granica językowa retention⟂analytics.
- **Separate Ways (retention ⟺ analytics)** — brak wspólnej logiki read-modeli; współdzielona wyłącznie
  infrastruktura persystencji (`db/schema`/`db/client`/`drizzle`).
- **Dedup detekcji PR (≥4-5 miejsc, 2 algorytmy)** — do rejestru długów (smell, nie decyzja).
- **redZone RPE≥9 per-seria vs ≥8 na średniej** — rozbieżność progów jako dwie granulacje.
- **Self-scope po `traineeId`** — izolacja retencji przez tożsamość sesji, nie parę `trainer_id`.

## Stan i następny krok (handoff)

- **Ustalono (DRAFT):** kompletna Bounded Context Canvas `retention` — klasyfikacja strategiczna (core **aspiracyjny**,
  owned-core / read-over-logs), ubiquitous language (11 pojęć + granica „Rekord/PR"), 8 odpowiedzialności, komunikaty IN
  (3 zapytania + 2 czyste helpery; 0 komend; 0 zdarzeń), komunikaty OUT (3 odczyty zależności + 2 wystawione read-modele;
  0 zdarzeń; **brak krawędzi do rdzenia advancement — H7**), 4 krawędzie zależności z trybem (**Separate Ways** vs
  analytics, Conformist workout-logging/catalog-skill, self-scope tenancy), 12 reguł + quirk, 5 założeń — każde z dowodem
  `file:line`. Zweryfikowane fan-outem + adwersaryjną weryfikacją per twierdzenie (**93 CONFIRMED, 21 PARTIAL, 0 REFUTED**;
  PARTIAL to doprecyzowania, wchłonięte).
- **Zwalidowane przez właściciela (2026-07-08):** kanwa oddaje stan-JEST → status **ZWALIDOWANY**. Decyzje
  checkpointu: H7 (#1) i „Awans do retention" (#2) → **otwarte `PROPOZYCJE`** do fazy architektury (kanwa nic nie
  przesądza); dedup PR (#3), próg RPE (#4), self-scope po `traineeId` (#5), off-by-one UTC (#6), serwerowe „obejrzano"
  (#7) → **dług reimplementacji** (bez zmian w kodzie teraz).
- **Co czyta następna faza (F7 · kontekst #3 `catalog-skill`):** ten kontekst jako **downstream Conformist** —
  `retention` czyta `exercises` (name/unit) wprost jako Conformist/D, więc `catalog-skill` jest jednym z jego upstreamów
  (Conformist-gwiazda F5 §2.3). Nie ma sprzężenia struktury drzewa #5 z retencją (archetypy nie znają umiejętności) —
  potwierdza rozłączność `catalog-skill` (struktura) od `retention` (log-derived).

> Domykając ten kontekst **po walidacji**: `07-define/README.md` → `retention` ✅ + data; główny `README.md` → F7 🟡;
> wpisy w `glosariusz.md`; przepisanie `next-session-prompt.md` na F7 · kontekst #3 `catalog-skill`.
