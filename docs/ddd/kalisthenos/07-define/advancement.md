# F7 — Define — Bounded Context Canvas: `advancement` (Awans podopiecznego)

> **Status:** ZWALIDOWANY · **Data:** 2026-07-08 (walidacja właściciela: 2026-07-08)
> **Krok DDD:** 7 Define · **Zależy od:** F4, F5, F6 · **Kontekst F7:** #1 (core-first)
> **Typ (F4):** core · **Moduł własności (F6):** owned-core (czysty write-seam)

Bounded Context Canvas kontekstu **`advancement`** (poddomena #6 „Awans podopiecznego") —
pierwszy i najbardziej rdzeniowy kontekst F7. Kanwa jest **zrekonstruowana z kodu**: każda
odpowiedzialność i każdy komunikat IN/OUT ma dowód `file:line`. Stan opisuje to, **co JEST**;
zakłady na przyszłość oznaczone `PROPOZYCJA:`.

## Wejście (co przeczytano)

**Artefakty poprzednich faz (priory zweryfikowane w kodzie, nie kopiowane na wiarę):**
- `04-strategize-core-domain-chart.md` — #6 = core, high differentiation, event-sourcing z tie-break.
- `05-connect-context-map.md` — `advancement` = jedyny czysty core BC; §2.2 (analytics=Supplier/U, inwersja
  H7; straddle „Rozwój"), §2.3 (Conformist-gwiazda: catalog-skill i workout-logging = U), §2.1 (kręgosłup
  tenancy), H5/H7, smell `advanced_by` RESTRICT vs `trainer_id` CASCADE (§5).
- `06-organise-wlasnosc-modulow.md` — owned-core, tryby zależności per krawędź.
- `glosariusz.md` — Awans vs Progresja vs Rekord, Cofnięcie (regres na drabinie), oś jakościowa/ręczna decyzja.
- `SZABLON-artefaktu.md`, `07-define/README.md` (kolejność core-first).

**Kod (rdzeń czytany dokładnie, z dowodami `file:line`):**
- `app/lib/skill-progression.ts` — `insertAdvancement` (:214-265), `setStartingLevel` (:267-278),
  `recordAdvancement` (:281-328), `getSkillMapForTrainee` (:46-193), `listAssignedSkillIds` (:196-211).
- `app/lib/skill-progression-math.ts` — `currentLevelFromEvents` (:11-22, tie-break), `suggestAdvancement`
  (:41-62), `AdvanceSignals`/`AdvancementEvent` (:4-37), stałe `MIN_SESSIONS_FOR_SUGGESTION=4` (:25), `HIGH_RPE=8` (:27).
- `app/lib/db/schema.ts:662-696` — tabela `skill_advancements` (FK-e, indeksy).
- `app/routes/trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` — trasa ZAPISU (action, intencje
  `set-start`/`advance`) + loader read-modelu.
- `app/routes/trener/podopieczni.$traineeId.rozwoj._index.tsx`, `app/routes/podopieczny/rozwoj._index.tsx`,
  `app/routes/podopieczny/rozwoj.umiejetnosc.$skillId.tsx` — konsumenci read-modelu.
- `app/lib/skill-tree.ts` — straddle read-modelu „Rozwój" (`getSkillTreeForTrainee` → `getSkillMapForTrainee`).
- `app/lib/stats.ts` (sygnały H7), `app/lib/skills.ts` (`SkillError`), `app/lib/skill-types.ts`
  (`AdvancementFormSchema`), `app/lib/trainees.ts:74-113` (kasowanie konta — DELETE omijający write-seam).
- Testy jako dowód intencji: `app/lib/skill-progression-math.test.ts`.

**Silnik jakości (CIĘŻKA, §7 planu):** fan-out 6 agentów wypełnił sześć pól kanwy z kodu z dowodami →
**adwersaryjna weryfikacja per twierdzenie** (115 agentów łącznie, po jednym sceptyku na każdą
odpowiedzialność/komunikat, każdy MUSIAŁ otworzyć cytowany plik) → przeżyło to, co ugruntowane w kodzie.
Wynik: **~60 twierdzeń CONFIRMED, 9 PARTIAL** (doprecyzowania, wchłonięte niżej), **0 REFUTED**. Poprawki
z weryfikacji: append-only ma jeden wyjątek DELETE (kasowanie konta); „404-nie-403" jest egzekwowane w
warstwie trasy (repo rzuca `SkillError`→błąd formularza); stany węzłów drzewa liczy lokalnie `skill-tree.ts`,
nie czyta ich z mapy; `advancedOn` porównywany jako string (YYYY-MM-DD), tie-break `createdAt` numerycznie.

---

## Ustalenia — Bounded Context Canvas

### 1. Strategic Classification

| Wymiar | Wartość (dowód) |
|---|---|
| **Typ domeny** | **CORE** (F4 #6). Jedyny czysty core bounded context — reszta rdzenia (#5 struktura) mieszka jako core-adjacent w `catalog-skill` (H5). |
| **Model biznesowy** | **Differentiator.** Kalisteniczny model progresji po osi **JAKOŚCIOWEJ** (przejście na trudniejszy wariant), z **trenerem w pętli**. Prostopadły do osi ilościowej (Rekord/PR = `analytics`). Brak analogu w coachingu wagowym (obciążenie ↑) i w self-serve (brak trenera-decydenta). |
| **Ewolucja / dojrzałość** | **Custom-built, dojrzały, izolowany.** Event-sourcing na append-only strumieniu; **czysty write-seam** — nigdy nie dzieli wiersza ze strukturą #5 (`app/lib/skill-progression.ts:224-253` czyta ją tylko przez FK-id). Własność (F6): **owned-core** — nie oddawać na zewnątrz, najwyższy rygor testowy. |

**Dlaczego to rdzeń (dowody):**
- **Brak kolumny „bieżący poziom" — poziom jest ODTWARZANY z historii.** Nie ma `current_variation_id`;
  aktualny wariant liczy `currentLevelFromEvents(events)` przez redukcję zdarzeń
  (`app/lib/skill-progression-math.ts:11-22`, wołane `app/lib/skill-progression.ts:147`). To definicyjny
  event-sourcing, nie snapshot.
- **Awans = ZAWSZE ręczna decyzja trenera.** Insert twardo ustawia `advancedBy: trainerId`
  (`app/lib/skill-progression.ts:262`; kolumna NOT NULL `schema.ts:682-684`); jedyny produkcyjny zapis to
  akcja trasy trenera chroniona `requireUser(..., { role: "trainer" })`
  (`.../umiejetnosc.$skillId.tsx:54`). Podopieczny **nie ma żadnej akcji zapisu** — obie trasy
  `podopieczny/rozwoj*` eksportują tylko `loader` (`podopieczny/rozwoj._index.tsx:35`,
  `podopieczny/rozwoj.umiejetnosc.$skillId.tsx:14`). Self-serve wykluczony konstrukcyjnie.
- **Sugestia jest tylko podpowiedzią.** `suggestAdvancement` (opisane w kodzie: „Awans i tak jest ręczny —
  to tylko podpowiedź dla trenera", `app/lib/skill-progression-math.ts:41-44`) zwraca `advance/regress/null`
  bez konfigurowalnych progów; steruje wyłącznie **badge** w UI (`.../umiejetnosc.$skillId.tsx:141-156`) i
  **nie jest czytana** przez ścieżkę zapisu.

### 2. Ubiquitous Language / model domenowy

| Pojęcie (PL) | Reprezentacja w kodzie | Dowód |
|---|---|---|
| **Awans** (na wyższy wariant, oś jakościowa) | `recordAdvancement(...)`: `from`=bieżący, `to`=wybrany; intencja `advance`; etykieta „advance" gdy `fromVariationId != null` | `skill-progression.ts:281-328`; `.../umiejetnosc.$skillId.tsx:62,84,233-235` |
| **Cofnięcie / regres** (na niższy wariant, `to.ordinal < from.ordinal`) | ten sam `recordAdvancement` (bez walidacji kierunku); sugestia `regress`; osobne zdarzenie na WSPÓLNEJ tabeli | `skill-progression.ts:281-328`; reguła `skill-progression-math.ts:52-59`; test `skill-progression-math.test.ts:35-38` |
| **Poziom startowy** (pierwsze zdarzenie, `fromVariationId = NULL`) | `setStartingLevel(...)` → `insertAdvancement(..., from=null)`; intencja `set-start`; etykieta „startingLevel" | `skill-progression.ts:267-278`; `.../umiejetnosc.$skillId.tsx:73-82,234-235` |
| **Bieżący poziom** | `currentLevelFromEvents(events)` — najświeższe po `advancedOn`, tie-break `createdAt` (last-write-wins, **nie** max ordinal) | `skill-progression-math.ts:11-22`; `skill-progression.ts:147,311` |
| **Zdarzenie awansu** (rekord append-only) | wiersz `skill_advancements` (`from/toVariationId`, `advancedOn`, `advancedBy`, `note`, `createdAt`); tylko `INSERT` | `schema.ts:662-696`; `skill-progression.ts:255-264` |
| **`AdvancementEvent`** (kształt zredukowany do wyliczeń) | `{ toVariationId, toOrdinal, advancedOn, createdAt }` | `skill-progression-math.ts:4-9`; mapowanie `skill-progression.ts:141-146` |
| **Sugestia** (`advance`/`regress`/`null`) | `AdvancementSuggestion`; `suggestAdvancement(signals)` | `skill-progression-math.ts:29-62`; render `.../umiejetnosc.$skillId.tsx:141-156` |
| **Sygnały awansu** (`AdvanceSignals`) | `{ sessionsOnCurrent, status, easierAtSameReps, inPlateau, recentAvgRpe, hasHigherVariant, hasLowerVariant }` | `skill-progression-math.ts:29-37` |
| **Drabina wariantów** | `skill_variations` sortowane po `ordinal`; read-model niesie `SkillMapVariation{ordinal,exerciseName,unit,isCurrent}` | `skill-progression.ts:13-20,60-72` |
| **Mapa umiejętności** (`SkillMapEntry`) | read-model 1 umiejętności/podopieczny: `currentVariationId/ExerciseId`, `lastAdvancedOn`, `suggestion`, `history`, `currentHasLogs` | `skill-progression.ts:29-42` |
| **Przypisanie do umiejętności** | = ma ≥1 zdarzenie (DISTINCT `skillId`); `listAssignedSkillIds` (dziś bez konsumenta) | `skill-progression.ts:195-211` |

> **Uwaga językowa:** w tym kontekście **„Progresja" i „Rekord/PR" NIE żyją** — należą do `analytics` (oś
> ilościowa). Kontekst ich nie liczy, tylko **konsumuje** jako sygnały (patrz Komunikaty OUT). Utrwala to
> kanoniczny rozdział Awans⊥Progresja z glosariusza.

### 3. Odpowiedzialności

1. **Rejestruje zdarzenia poziomu startowego / awansu / cofnięcia** jako append-only wiersze
   `skill_advancements` przez wspólny `insertAdvancement` (`advancedBy` zawsze = `trainerId`), wystawiane
   jako `setStartingLevel` i `recordAdvancement`. — `skill-progression.ts:214-265,268-278,281-328`
2. **Waliduje integralność i tenant-scope przy każdym zapisie:** umiejętność należy do trenera; podopieczny
   należy do trenera i ma rolę `trainee`; wariant(y) `to`/opcjonalny `from` należą do tej umiejętności —
   inaczej `SkillError`. — `skill-progression.ts:224-253`
3. **Wylicza bieżący poziom podopiecznego** z event-sourcingu z tie-break (`advancedOn`, potem `createdAt`).
   — `skill-progression-math.ts:11-22`; `skill-progression.ts:147`
4. **Egzekwuje guardy domenowe przejścia:** `no start` (awans bez poziomu startowego), `same level` (wybrany
   wariant == bieżący). — `skill-progression.ts:311-317`
5. **Dostarcza read-model per podopieczny** (`getSkillMapForTrainee`): warianty z `isCurrent`, historia,
   `lastAdvancedOn`, `currentHasLogs`, opcjonalnie `suggestion`. — `skill-progression.ts:46-193`
6. **Generuje MIĘKKĄ sugestię awansu/regresu** z sygnałów analityki (`suggestAdvancement`), bez
   konfigurowalnych progów; decyzja i tak ręczna. — `skill-progression-math.ts:41-62`; `skill-progression.ts:158-166`

**Świadomie NIE są odpowiedzialnością tego kontekstu** (dowód granicy): definiowanie struktury
umiejętności/wariantów/prerekwizytów (→ `catalog-skill`, czytane tylko przez FK); liczenie
progresji/rekordów (→ `analytics`, tylko konsumowane); komponowanie drzewa „Rozwój" ze stanami węzłów
(→ `skill-tree.ts` ∈ `catalog-skill`); walidacja formularza + mapowanie 404/`SkillError.userMessage`
(→ warstwa trasy).

### 4. Komunikaty IN (kto woła → co)

**Komendy** (obie wyłącznie z akcji trasy trenera, `role=trainer`, `.../umiejetnosc.$skillId.tsx:53-99`):

| Komenda | Wywołujący | Intencja | Dowód |
|---|---|---|---|
| `setStartingLevel(db, trainerId, traineeId, skillId, toVariationId, advancedOn, note)` | akcja trasy trenera | `set-start` (gdy brak bieżącego poziomu) | wywołanie `.../umiejetnosc.$skillId.tsx:74` (gałąź :73) |
| `recordAdvancement(db, trainerId, traineeId, skillId, toVariationId, advancedOn, note)` | akcja trasy trenera | `advance` (awans **lub** cofnięcie — ta sama ścieżka) | wywołanie `.../umiejetnosc.$skillId.tsx:84` (gałąź else) |

Intencje formularza rozstrzyga komponent: `advance` gdy istnieje bieżący wariant, inaczej `set-start`
(`.../umiejetnosc.$skillId.tsx:107`); akcja odrzuca (`return null`) każdą inną intencję (`:62`).

**Zapytania** (read-model wołany z zewnątrz):

| Zapytanie | Wywołujący (dowód) |
|---|---|
| `getSkillMapForTrainee(db, trainerId, traineeId, {withSuggestions})` | trasa trenera (węzeł) `withSuggestions:true` — `.../umiejetnosc.$skillId.tsx:36`; trasa podopiecznego (węzeł) `withSuggestions:false` — `podopieczny/rozwoj.umiejetnosc.$skillId.tsx:18`; read-model „Rozwój" — `skill-tree.ts:103` |
| `listAssignedSkillIds(db, trainerId, traineeId)` | **BRAK konsumenta** — eksportowane, ale grep w całym repo znajduje tylko definicję (`skill-progression.ts:196`). **Martwe API** (patrz Otwarte pytania). |

**Zdarzenia IN:** **brak.** Kontekst nie subskrybuje żadnej szyny (grep `EventEmitter|eventBus|subscribe` =
0 w `app/**`); inwersja H7 jest realizowana **synchronicznym odczytem**, nie subskrypcją zdarzenia
(`skill-progression.ts:126-136`).

### 5. Komunikaty OUT (co → do kogo)

**Zapytania OUT** (kontekst jako Customer/Conformist czytający sąsiadów):

| Zapytanie OUT | Odbiorca (kontekst) | Warunek / dowód |
|---|---|---|
| `getExerciseProgress` / `getEasierAtSameReps` / `getPlateauExercises` | **`analytics`** (Customer/D, **inwersja H7**) | tylko pod `if(opts.withSuggestions)` — `skill-progression.ts:126,127,134,135`; definicje `stats.ts:514,592,649` |
| odczyt `skills` ⋈ `skill_variations` ⋈ `exercises` (name/unit/ordinal) | **`catalog-skill`** (Conformist/D) | read-model `skill-progression.ts:52-72`; walidacja `:224-253` |
| join `workout_exercise_logs` ⋈ `workout_logs` → `currentHasLogs` | **`workout-logging`** (Conformist/D) | `skill-progression.ts:94-104,190` |

**Dane wystawiane** (kontekst jako **Supplier/U**): `getSkillMapForTrainee` konsumowane przez read-model
`skill-tree.ts` (∈ `catalog-skill`) — **straddle „Rozwój"**: kompozycja struktura⊕awans; `skill-tree.ts`
czyta stąd bieżący wariant/ordinal, a stany węzłów (`locked/available/mastered`) **liczy lokalnie**
(`nodeState`), nie z mapy. — `skill-tree.ts:4,103`

**Zdarzenia OUT:** **brak.** Ścieżka zapisu kończy się na `db.insert(skillAdvancements)` bez żadnej emisji
po insercie (`skill-progression.ts:255-264`); publiczne mutatory zwracają `Promise<void>` (komunikacja
wyłącznie synchroniczna request/response, brak push/outbox/notyfikacji). To m.in. źródło `PROPOZYCJI` H7
(brak zdarzenia „Awans" do sprzęgnięcia z retencją).

### 6. Zależności + tryb (per krawędź, z F5/F6, potwierdzony kierunek w kodzie)

| Sąsiad | Wzorzec | Kierunek | Mechanizm (dowód) |
|---|---|---|---|
| **`catalog-skill`** (#5 struktura) | Conformist | advancement=**D**, catalog-skill=**U** | FK `from/toVariationId → skill_variations` **RESTRICT** (`schema.ts:675-680`), `skillId → skills` **CASCADE** (`:672-674`); czyta name/unit/ordinal wprost; błędy przez `SkillError` (`skills.ts:13-20`) |
| **`workout-logging`** (#8) | Conformist (Conformist-gwiazda F5 §2.3) | advancement=**D**, workout-logging=**U** | surowy join logów po `trainerId+traineeId` dla `currentHasLogs` (`skill-progression.ts:94-104`) |
| **`analytics`** (#11) | Customer/Supplier (**inwersja H7**) | advancement=**D**, analytics=**U** | import z `~/lib/stats` (`skill-progression.ts:4`), warunkowy odczyt sygnałów → `suggestAdvancement` |
| **read-model „Rozwój"** (`skill-tree.ts` ∈ `catalog-skill`) | Customer/Supplier (straddle) | advancement=**U**, konsument=**D** | `skill-tree.ts:103` woła `getSkillMapForTrainee`; kierunek **odwrotny** do zapisu, read-only |
| **kręgosłup tenancy** (`identity`, Published Language H8) | Conformist | advancement=**D** | filtry `WHERE trainer_id/trainee_id` w read-modelu (`skill-progression.ts:86-88`) + rewalidacja własności w insercie (`:224-242`); **404-nie-403** w warstwie trasy (`.../umiejetnosc.$skillId.tsx:35,38,58`), a repo rzuca `SkillError`→błąd formularza (`:95-97`) |
| **kasowanie konta** (`trainees.ts`, ∈ `identity`) | coupling na poziomie DB (**smell**) | — | `deleteTrainee...` robi bezpośredni `DELETE FROM skill_advancements WHERE advanced_by=?` (`trainees.ts:96-98`), **omijając** write-seam `insertAdvancement`; wiersze, gdzie podopieczny jest podmiotem, znikają przez CASCADE (`schema.ts:669-674`) |

**Tryb własności (F6):** owned-core na własnej tabeli; wszystkie zależne krawędzie to **odczyt** cudzego
modelu (Conformist) albo **wystawienie** własnego read-modelu (Supplier) — kontekst **nie pisze** do żadnej
tabeli spoza `skill_advancements`.

### 7. Reguły / decyzje (z dowodem)

- **R1. Awans = zawsze ręczna decyzja trenera.** `advancedBy = trainerId` (NOT NULL) + trasa `role=trainer`;
  podopieczny nie ma akcji zapisu. — `skill-progression.ts:262`; `schema.ts:682-684`; `.../umiejetnosc.$skillId.tsx:54`
- **R2. Bieżący poziom = last-write-wins** po `advancedOn` (porównanie stringów YYYY-MM-DD, poprawne
  leksykograficznie dzięki zero-paddingowi), tie-break `createdAt` **numerycznie** (epoch ms) — **nie** max
  ordinal. — `skill-progression-math.ts:11-22`
- **R3. Append-only w przepływach domenowych.** Jedyny zapis to `INSERT`; **brak `UPDATE`** w całym repo.
  Jedyny `DELETE` to defensywne czyszczenie przy kasowaniu konta (R7). — `skill-progression.ts:255`;
  `trainees.ts:96-98`
- **R4. Awans i Cofnięcie to jeden kod na wspólnej tabeli.** `recordAdvancement` **nie** porównuje ordinali
  (`toOrdinal=0` placeholder); kierunek rozstrzyga się dopiero w warstwie **sugestii**. — `skill-progression.ts:304-317`;
  `skill-progression-math.ts:48-59`
- **R5. Guardy przejścia:** `no start` i `same level` przed zapisem; `bad variation` gdy wariant spoza
  umiejętności. — `skill-progression.ts:311-317,244-253`
- **R6. Sugestia miękka, progi zaszyte:** `MIN_SESSIONS_FOR_SUGGESTION=4`, `HIGH_RPE=8`; awans sugerowany
  gdy jest wyższy wariant, brak plateau i (status `up` lub „łatwiej"); regres gdy status `down`, jest niższy
  wariant i `recentAvgRpe ≥ 8`. — `skill-progression-math.ts:25,27,45-62`
- **R7. Integralność historii ważniejsza od kasowania.** FK `to/fromVariationId → skill_variations`
  **RESTRICT**: nie da się usunąć wariantu użytego w historii (tłumaczone na przyjazny błąd,
  `skills.ts:339-345`); `advanced_by → users` **RESTRICT** blokuje usunięcie autora — stąd obejście R3/R7 w
  `trainees.ts`. — `schema.ts:675-684`
- **R8. Brak `UNIQUE` poza PK** — DB dopuszcza dwa zdarzenia na tej samej parze wariantów (append-only log,
  nie stan). — `schema.ts:688-695`
- **R9. Sugestie liczone tylko dla trenera (zamierzone, potwierdzone 2026-07-08).** Read-model dla
  podopiecznego woła `withSuggestions:false` → analityka i `suggestAdvancement` nie są uruchamiane; sugestia
  to wsparcie decyzji trenera, podopieczny widzi drabinę i historię, ale nie sugestię. — trener
  `.../umiejetnosc.$skillId.tsx:36` (`true`) vs podopieczny `podopieczny/rozwoj.umiejetnosc.$skillId.tsx:18` (`false`)

### 8. Założenia

- **Z1.** Drabina wariantów ma spójne `ordinal` (kolejność z `catalog-skill`); kontekst czyta ordinal, nie
  weryfikuje ciągłości.
- **Z2.** Wariant należy do dokładnie jednej umiejętności — założenie egzekwowane przy zapisie
  (`skill-progression.ts:244-253`), ale integralność struktury pochodzi z `catalog-skill`.
- **Z3.** `advancedOn` przychodzi jako `YYYY-MM-DD` (Zod, `AdvancementFormSchema`), co czyni porównanie
  stringowe w R2 poprawnym; złamanie formatu złamałoby porządek zdarzeń.
- **Z4.** `toOrdinal=0` w `recordAdvancement` jest bezpieczne, bo `currentLevelFromEvents` wybiera po
  dacie/`createdAt`, nie po ordinalu (`skill-progression.ts:304-310`).

---

## Hot-spoty / otwarte pytania

1. **Bug: 404 przy awansie na GLOBALNEJ umiejętności.** `getSkillMapForTrainee` filtruje
   `skills.trainerId = trainerId` (`skill-progression.ts:55`), więc umiejętności globalne (`trainer_id NULL`)
   nie trafiają do mapy → trasa węzła robi `map.find(skillId)` = `undefined` → **404** (`.../umiejetnosc.$skillId.tsx:38`).
   Zgodne z kanonem F2 („dzisiejsze 404 przy awansie na globalnej umiejętności = bug do naprawy"). `PROPOZYCJA:`
   read-model i insert muszą uwzględniać efektywną bibliotekę (globalne ∪ własne), nie tylko `trainer_id`.
   **Właściciel (2026-07-08): dług reimplementacji — bez zmian w kodzie teraz.**
2. **Martwe API `listAssignedSkillIds`.** Eksportowane bez konsumenta (`skill-progression.ts:196-211`).
   Do usunięcia albo do podpięcia (kandydat: filtr „przypisane umiejętności" w reimplementacji).
   **Właściciel (2026-07-08): dług reimplementacji.**
3. **Smell `advanced_by` RESTRICT vs `trainer_id` CASCADE** (F5 §5). Usunięcie użytkownika-autora byłoby
   zablokowane przez RESTRICT zanim zadziała CASCADE — dziś obchodzone bezpośrednim `DELETE ... WHERE
   advanced_by` w `trainees.ts:96-98`, który **omija write-seam** `insertAdvancement` (coupling na poziomie
   DB). `PROPOZYCJA:` ujednolicić onDelete albo modelować kasowanie jako komendę kontekstu.
4. **`PROPOZYCJA:` sprzęgnięcie retencji z sygnałami rdzenia (H7).** Kontekst **nie emituje** zdarzenia
   „Awans"; `retention` (Wrapped) czyta surowe logi równolegle (Separate Ways). Realny moat retencji
   wymagałby wystawienia zdarzenia/read-modelu awansu do `retention` — dziś krawędzi NIE ma
   (`skill-progression.ts:255-264`, brak emisji). **Decyzja właściciela (2026-07-08): zostawić jako otwartą
   `PROPOZYCJA:` — rozstrzygnięcie należy do fazy architektury; kanwa niczego nie przesądza.**
5. **`PROPOZYCJA:` rozcięcie rdzenia (H5).** Po wydzieleniu `skill-structure` (#5) z `catalog.ts`, krawędź
   Conformist/D `advancement → catalog-skill` rozpadłaby się na `advancement → skill-structure` (struktura) +
   niezależny `exercise-catalog` (#4). Read-model „Rozwój" spinałby wtedy dwa sąsiadujące core BC
   (`skill-structure` + `advancement`).
6. **Sugestie tylko dla trenera — POTWIERDZONE (właściciel, 2026-07-08).** Sygnały są warunkowe
   (`withSuggestions`): trasa trenera woła `withSuggestions:true`, podopieczny `withSuggestions:false` i nie
   odpytuje analityki. Podopieczny widzi drabinę i historię, ale **nie** sugestię — podpowiedź decyzyjna
   należy do trenera. Rozstrzygnięte jako **zamierzona reguła stanu-JEST** (R9), nie dług.

---

## Zmiany w glosariuszu

Kanwa **nie wprowadza** nowych bytów domenowych — potwierdza i uściśla istniejące. Kandydaci do dopisania w
`glosariusz.md` po walidacji:
- **Write-seam (owned-core)** — `insertAdvancement` jako jedyny domenowy zapis; wyjątek to DB-level DELETE
  przy kasowaniu konta (`trainees.ts`).
- **Last-write-wins po dacie** — doprecyzowanie „bieżącego poziomu": `advancedOn` (string) → tie-break
  `createdAt` (numeryczny), **nie** max ordinal (istotne dla Cofnięcia).
- **Martwe API `listAssignedSkillIds`** — do rejestru długów (usunąć/podpiąć).
- Potwierdzenie krawędzi **`advancement → workout-logging`** (Conformist, `currentHasLogs`) — była w F5 §2.3,
  kanwa ją utrwala jako komunikat OUT.

## Stan i następny krok (handoff)

- **Ustalono (DRAFT):** kompletna Bounded Context Canvas `advancement` — klasyfikacja strategiczna (core,
  owned-core), ubiquitous language (11 pojęć), 6 odpowiedzialności, komunikaty IN (2 komendy + 1 aktywne
  zapytanie + 1 martwe; 0 zdarzeń), komunikaty OUT (3 odczyty zależności + 1 wystawiony read-model; 0
  zdarzeń), 6 krawędzi zależności z trybem, 8 reguł, 4 założenia — każde z dowodem `file:line`.
  Zweryfikowane fan-outem + adwersaryjną weryfikacją per twierdzenie (0 REFUTED, 9 PARTIAL wchłonięte).
- **Zwalidowane przez właściciela (2026-07-08):** kanwa oddaje stan-JEST → status **ZWALIDOWANY**. Decyzje
  checkpointu: bug 404 na globalnej (#1) i martwe API (#2) → **dług reimplementacji** (bez zmian w kodzie);
  sprzęgnięcie retencji (H7, #4) → zostaje **otwartą `PROPOZYCJA:`**; sugestie tylko dla trenera (#6) →
  **zamierzone** (R9). Pozostałe (smell RESTRICT/CASCADE #3, rozcięcie #5) → do fazy architektury.
- **Co czyta następna faza (F7 · kontekst #2 `retention`):** tę kanwę jako sąsiada — zwłaszcza sekcję
  Komunikaty OUT (brak zdarzenia „Awans") i hot-spot #4 (Separate Ways vs `PROPOZYCJA:` sprzęgnięcia).

> Domykając ten kontekst **po walidacji**: `07-define/README.md` → `advancement` ✅ + data; główny
> `README.md` → F7 🟡; wpisy w `glosariusz.md`; przepisanie `next-session-prompt.md` na F7 · kontekst #2
> `retention`.
