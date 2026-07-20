# Glosariusz — ubiquitous language kalisthenos

> **Żywy dokument.** Aktualizowany w KAŻDEJ fazie analizy (patrz
> [`00-plan-analizy-strategicznej.md`](00-plan-analizy-strategicznej.md) §4).
> Zapisuje słownik, którego *naprawdę* używa domena — słowa z kodu, spec-ów i
> rozmów z właścicielem.
>
> **Zasada:** ten sam termin może znaczyć co innego w różnych bounded contextach.
> Gdy tak jest — notuj znaczenie **per kontekst** (kolumna „Kontekst”). Zmiana
> znaczenia słowa wyznacza granicę kontekstu.

## Rozstrzygnięcia kanoniczne (sesja z właścicielem, 2026-07-05)

Interaktywne rozwiązanie wszystkich hot-spotów językowych z F1. **Polityka
nadrzędna:** kod = UI = **jeden termin domenowy** (kod używa angielskiego
odpowiednika, UI polskiego) — reimplementacja usuwa rozjazdy. Decyzje:

1. **Marka / brand** (kod `brand`, UI „Marka”) — `organization` **wycofane**.
2. **Prezes marki** (UI „Prezes marki”, kod `brand_owner`/`president`) — `brand_admin` **wycofane**.
3. **Trener** = byt (prowadzi trening); **„Ambasador”** = relacja/rola trenera względem
   marki (to samo słowo, znaczenie **per kontekst**).
4. **Biblioteka ćwiczeń** + **Biblioteka umiejętności** — **dwa osobne światy**, każda =
   predefiniowane (markowe) ∪ własne trenera. **„Katalog” wycofane**; „efektywny katalog”
   → „efektywna biblioteka”. **Drzewo umiejętności** = osobna struktura NAD Biblioteką umiejętności.
5. **Sesja** = element planu (`plan_session`; dzień treningowy w szablonie, np. Push/Pull/Legs).
   **Trening** = zarejestrowane wykonanie Sesji (`workout_log` → kod `workout`).
6. **Progresja** = rekord/postęp w czasie w jednym ćwiczeniu (oś ILOŚCIOWA).
   **Awans** = przejście na wyższy wariant/umiejętność na drabinie (oś JAKOŚCIOWA, ręczna
   decyzja trenera). „Rozwój” = powierzchnia łącząca obie.
7. **Rekord (PR)** = kanoniczna metryka postępu (kod `record`/`best`).
8. **Konsultacja** = całe spotkanie 1:1 (cały cykl życia). **Harmonogram** = reguła
   cykliczności. **termin** = data konsultacji (nie osobny byt).
9. **Kwota** → `amount_minor` (walutowo-neutralne minor-units + pole waluty); **„grosze”
   wycofane**. **Subskrypcja = źródło prawdy kwoty**; kwota w zaproszeniu = tylko wartość początkowa.
10. **Region** = kanoniczny termin (pojemny: dziś kraj, docelowo może urosnąć w jednostkę zarządczą).
11. **Stany węzła** → EN enum w kodzie + **zamrożone** PL etykiety (opanowane / w toku /
    gotowe do startu / zablokowane).
12. **Anulowanie — rozdzielone intencje:** subskrypcja: **anulowana** (ręcznie) vs
    **wygasła** (po dunningu); konsultacja: **odrzucona** (podopieczny) vs **odwołana**
    (trener) vs **pominięta** (termin w serii).
13. `promoteTrainerCatalogToBrand` → **do usunięcia** (bootstrap nieistotny w reimplementacji;
    prezes autoruje bibliotekę marki wprost).
14. **Prywatność zdjęć sylwetki** → **owner-scoped**: widzi tylko podopieczny (właściciel)
    + JEGO trener; żaden inny podopieczny (do egzekwowania w reimplementacji).

## Rewizja kanonu — sesja F2 (2026-07-06)

Podczas walidacji F2 (mapa zdarzeń) właściciel zrewidował/uzupełnił kanon:

1. **„markowe" → „globalne".** Nie ma „markowych ćwiczeń/umiejętności". Jest **globalna,
   ogólnodostępna biblioteka ćwiczeń i umiejętności zarządzana przez prezesa marki** — by
   trener/ambasador nie dodawał oczywistych pozycji (pompka, podciągnięcie, muscle-up).
   Efektywna biblioteka = **globalne ∪ własne**. Zastępuje „markowy/markowe" wszędzie w
   kontekście biblioteki (w kodzie dziś org-scoped `organization_id`; przy 1 marce globalne ≈ na poziomie marki).
2. **Globalne używa się WPROST** (przypisanie do planu, awans podopiecznego); **fork („Dostosuj")
   jest OPCJONALNY** — tylko do modyfikacji własnej kopii (odcina od ulepszeń globalnych).
   Dzisiejsze 404 przy awansie na globalnej umiejętności = **bug do naprawy**.
3. **Promocja biblioteki założyciela do marki NIE istnieje** w modelu (`promoteTrainerCatalogToBrand`
   = do usunięcia — było #13 F1; F2 potwierdza brak jakiegokolwiek zdarzenia promocji).
4. **Awans vs Cofnięcie** = dwa osobne zdarzenia domenowe (wspólna tabela `skill_advancements`).
5. **Trzecia intencja anulowania subskrypcji**: „na koniec okresu" (`cancel_at_period_end`) obok
   „anulowana" (ręcznie) i „wygasła" (dunning).
6. **Gating dostępu → materializować** stan (zdarzeniowo), nie liczyć co żądanie.
7. Długi do domknięcia: twarde kasowanie konsultacji/podopiecznego, `replacesUserId` bez
   weryfikacji e-maila, brak self-service hasła, niepełne odwrócenie dezaktywacji ambasadora,
   migracja historii przy zmianie trenera. **„Cofnij publikację" planu = zamierzone** (forward-only).

## Uzupełnienie — sesja F3 (2026-07-06)

Dekompozycja na poddomeny (`03-decompose-poddomeny.md`) NIE wprowadza nowych bytów
domenowych — reużywa kanonu. Uściślenia językowe utrwalone w F3:

1. **„Rozwój" = powierzchnia prezentacyjna, NIE poddomena.** Read-model łączący oś
   jakościową (**Awans podopiecznego** — poddomena) i ilościową (**Progresja** — w
   Analityce diagnostycznej). Nazwy poddomen celowo NIE używają słowa „Rozwój".
2. **Nazewnictwo poddomen chroni zamrożone hot-spoty.** „Progresja" zarezerwowana
   wyłącznie dla szeregu czasowego (Analityka), więc poddomena struktury nosi nazwę
   **Umiejętności i drzewo** (nie „…progresji"), a per-para — **Awans podopiecznego**
   (nie „Rozwój/Progression"). Słowo „dostęp" rozdzielone: **Tożsamość i
   uwierzytelnianie** (kto zalogowany) vs **Bramkowanie dostępu** (wpuścić do panelu).
3. **Nowy hot-spot: `archived_at` / „dezaktywacja" jako Shared Kernel.** To samo pole
   rządzi trzema poddomenami: no-op rotacji sesji (Tożsamość), dezaktywacja ambasadora
   (Ambasadorzy) i gating (Bramkowanie dostępu) — granica do rozcięcia w F5.
4. **„termin" (konsultacja) — dwuznaczność aktorska:** dla podopiecznego = zaproszenie
   do potwierdzenia; dla trenera = slot do udokumentowania (wewn. szew poddomeny
   Konsultacje, obok reguła↔instancja).

## Uzupełnienie — sesja F4 (2026-07-06)

Strategiczna destylacja (`04-strategize-core-domain-chart.md`) NIE wprowadza nowych
bytów domenowych — nadaje 17 poddomenom typ (core/supporting/generic) i strategię.
Terminy strategiczne utrwalone w F4:

1. **Rdzeń (core domain) kalisthenos** = **kalisteniczny model progresji z trenerem w
   pętli** (#5 Umiejętności i drzewo + #6 Awans) — jedyny obszar łączący wysoką złożoność
   grafową ze zwalidowanym różnicowaniem. Decyzją właściciela do rdzenia dołącza
   **#12 Retencja/Wrapped** (retencja jako moat).
2. **Core-aspiracyjne** — typ poddomeny o **niskim różnicowaniu DZIŚ, budowanej wzorcami
   core zawczasu** jako zakład strategiczny. Dotyczy **platformy marki** (#2 Tenancy +
   #3 Ambasadorzy + maszyneria forka katalogu #4). Firmowe dla *inwestycji*, `PROPOZYCJA:`
   dla *dzisiejszego moatu* (monetyzacja marki = 0, billing EUR niepodpięty, FR pusty).
3. **Core-adjacent** — **fragment poddomeny supporting z rygorem rdzenia**, bo jego błąd
   podkopuje rdzeń: **fork/dwuwłasność katalogu** (#4), **heurystyka plateau** (#11, most
   do Awansu), inwarianty security (fail-open #14, owner-scoped signed URL #15, izolacja tenantów).
4. **Retencja jako moat** — decyzja F4: #12 Wrapped podniesione do core; `PROPOZYCJA:` by
   z „gatunkowo kopiowalnego" mechanizmu stał się realnym moatem, archetypy sprzęgnąć z
   **sygnałami rdzenia progresji** (dziś `wrapped.ts` czyta tylko surowe logi).
5. **„Rozwój" i growe drzewo NIE są osobnymi poddomenami ani osobnym różnicowaniem** —
   powierzchnia prezentacyjna (JOIN #6+#11) / ta sama implementacja co #5/#6. Moat liczony
   raz (potwierdzenie kanonu F1/F3 na poziomie strategii).

## Uzupełnienie — sesja F5 (2026-07-06)

Mapa kontekstów (`05-connect-context-map.md`) NIE wprowadza nowych bytów domenowych —
**nazywa granice modelu** (przestrzeń rozwiązania). Uściślenia utrwalone w F5:

1. **13 bounded contextów** (kontekst ≠ poddomena — kilka poddomen może dzielić jeden
   kontekst, gdy dzielą model/język zapisu). Nazwy kanoniczne:
   `identity` (Tożsamość, zaproszenia i relacja coachingowa — #1+H) ·
   `brand-platform` (Platforma marki: Tenancy + Ambasadorzy — #2+#3) ·
   `catalog-skill` (Katalog ćwiczeń i drzewo umiejętności — #4+#5) ·
   `advancement` (Awans podopiecznego — #6, **core**) ·
   `programming` (Programowanie / plany — #7) ·
   `workout-logging` (Trening / logowanie — #8) ·
   `analytics` (Analityka diagnostyczna — #11) ·
   `retention` (Retencja / Wrapped — #12, **core**) ·
   `consultations` (Konsultacje, harmonogram i kalendarz — #10+#16) ·
   `body-photos` (Sylwetka — #9) ·
   `billing-gating` (Płatności i dostęp — #13+#14) ·
   `files` (Pliki i podpisane URL — #15) ·
   `delivery` (Dostarczanie / notyfikacje — #17, **missing capability**).
   Poza granicą (external, za ACL): **Google**, **Stripe**.
2. **core-adjacent kontekst** — *supporting* kontekst hostujący rdzeniową poddomenę
   z rygorem rdzenia. Tu: struktura drzewa **#5 wewnątrz `catalog-skill`** (typ, oś
   ważności F4, jest ortogonalny do granicy modelu, oś F5). „Rdzeń zostaje rdzeniem"
   mimo że *granica kontekstu* biegnie inaczej niż *waga inwestycji*.
3. **Inwersja H7** — `analytics` jest **Supplier/upstream dla rdzenia** `advancement`
   (`skill-progression` czyta sygnały plateau/progresja do sugestii awansu). Read-model
   NAPĘDZA core, nie odwrotnie. Wrapped (`retention`) czyta surowe logi RÓWNOLEGLE do
   `analytics` — **Separate Ways** (zero wspólnego kodu).
4. **Relacja coachingowa rozmyta (H3)** — NIE osobny kontekst; self-FK `users.trainer_id`
   (dom w `identity`) + projekcja ekonomiczna `coaching_subscriptions` (w `billing-gating`)
   + kręgosłup zdenormalizowany `trainer_id`/`trainee_id`.
5. **Izolacja tenantów = Published Language (H8)** — `trainer_id`, 404-nie-403, egzekwowany
   PER-KONTEKST (`authz.ts` + inline `WHERE`), nie centralny gateway.
6. **`PROPOZYCJA:` skill-structure** — w reimplementacji rozciąć strukturę drzewa **#5**
   jako osobny kontekst **core** (`skill-structure`, czysty kernel grafowy) z God-modułu
   `catalog.ts`; rdzeń docelowy = `skill-structure` (#5) + `advancement` (#6) nad supporting
   `exercise-catalog` (#4). Stan-JEST: scalone w `catalog-skill`.

## Uzupełnienie — sesja F6 (2026-07-07)

Mapa własności modułów (`06-organise-wlasnosc-modulow.md`) NIE wprowadza nowych bytów
domenowych — dodaje słownik **własności/wdrażalności modułów** (oś ortogonalna do granic
kontekstów F5). Terminy utrwalone w F6:

1. **Tryb zależności** — pięć trybów per krawędź (jeden kontekst może nosić kilka):
   `x-as-a-service` (izolowany adapter, niezależnie wdrażalny), `kup/integruj` (cienka warstwa
   nad rynkiem), `ścisła współpraca` (wspólny model zapisu, wysoki koszt koordynacji),
   `moduł-dostawca` (Conformist-star: właściciel modelu wystawia kontrakt czytany wprost),
   `owned-core` (u siebie, najwyższy rygor). Wyprowadzone WPROST z wzorców relacji F5.
2. **Węzeł ścisłej współpracy (⛓)** — para modułów nierozdzielna bez refaktoru. **Jedyny**
   w kalisthenos: `identity`↔`brand-platform` (SK `users`/`invites`).
3. **Punkt kolaboracji aktora** — lżejsza od ⛓ zależność, gdzie jeden AKTOR spina dwa moduły,
   ale każdy pisze **własne** tabele. Tu: autoring markowy (Prezes spina governance `brand-platform`
   z autoringiem `catalog-skill`; `brand-catalog.ts` ∈ `catalog-skill`, H6) — **nie** cross-write.
4. **Moduł-dostawca vs owned-core** — dwie klasy własności: dostawcy (`catalog-skill`, `programming`,
   `workout-logging`, `files` — kontrakt na zewnątrz, downstream Conformist) vs owned-core
   (`advancement`, `retention`, struktura #5 — nie oddawać na zewnątrz).
5. **CL agregacja modułowa** — moduł HIGH przez złożenie kilku poddomen medium + integracja
   stateful (`consultations` = #10+#16+OAuth), odróżnione od HIGH F4-anchored (pojedyncza
   poddomena high: `catalog-skill`/#5, `billing-gating`/#13).
6. `PROPOZYCJA:` **nazwy modułów reimplementacji**: `skill-structure` (#5 core), `exercise-catalog`
   (#4 supporting), współdzielony kernel `users`/`invites`. Rekomendacja topologii: **modularny
   monolit** z gotowymi-do-odcięcia modułami x-as-a-service (do decyzji właściciela — otwarte).

## Uzupełnienie — sesja F7 · kontekst `advancement` (2026-07-08)

Bounded Context Canvas rdzenia `advancement` (`07-define/advancement.md`, ZWALIDOWANY) **nie wprowadza
nowych bytów** — potwierdza i uściśla istniejące. Uściślenia utrwalone (zweryfikowane fan-outem +
adwersaryjną weryfikacją per twierdzenie, 0 REFUTED):

1. **Write-seam (owned-core).** `insertAdvancement` jest **jedynym domenowym zapisem** awansu/cofnięcia/
   poziomu startowego (`advancedBy` zawsze = `trainerId`). Jedyny wyjątek od „append-only" to **DB-level
   `DELETE`** przy kasowaniu konta (`trainees.ts:96-98`, `WHERE advanced_by`), który **omija** write-seam —
   konkretna twarz smellu `advanced_by` RESTRICT vs `trainer_id` CASCADE.
2. **Bieżący poziom = last-write-wins (doprecyzowanie).** Wyliczany z historii: `advancedOn` (kolumna `date`,
   porównanie stringów YYYY-MM-DD leksykograficznie poprawne) → tie-break `createdAt` (numeryczny, epoch ms),
   **NIE** max `ordinal`. Istotne dla **Cofnięcia** (niższy wariant o nowszej dacie = bieżący poziom).
3. **Sugestie tylko dla trenera (zamierzone — decyzja właściciela).** Read-model podopiecznego woła
   `withSuggestions:false` i **nie odpytuje** analityki; podpowiedź awansu/regresu to wsparcie decyzji trenera.
4. **Krawędź `advancement → workout-logging` potwierdzona** (Conformist): read-model liczy `currentHasLogs`
   z joinu surowych logów — obok znanych `catalog-skill` (struktura) i `analytics` (sygnały, inwersja H7).
5. **Długi zaksięgowane (decyzja właściciela):** bug **404 przy awansie na globalnej umiejętności**
   (`getSkillMapForTrainee` filtruje `skills.trainer_id`) i **martwe API `listAssignedSkillIds`** (eksport bez
   konsumenta) → dług reimplementacji, bez zmian w kodzie teraz. Sprzęgnięcie retencji (H7) zostaje otwartą
   `PROPOZYCJA:` (do fazy architektury).

## Uzupełnienie — sesja F7 · kontekst `retention` (2026-07-08)

Bounded Context Canvas `retention` (`07-define/retention.md`, ZWALIDOWANY) **nie wprowadza nowych bytów** —
potwierdza i uściśla istniejące (Wrapped, Archetyp, Rekord). Uściślenia utrwalone (zweryfikowane fan-outem +
adwersaryjną weryfikacją per twierdzenie: **93 CONFIRMED, 21 PARTIAL, 0 REFUTED**):

1. **Czysty read-model bez własnej tabeli (owned-core / read-over-logs).** Grep `wrapped|retention` w `schema.ts` = 0;
   `wrapped.ts` liczy wszystko on-the-fly z surowych logów #8 (`workout_logs`/`workout_exercise_logs`/`workout_set_logs`)
   + `exercises` (name/unit). 0 zapisów do DB; jedyny trwały stan to **kliencki `localStorage`** (`wrapped-viewed-*`/
   `wrapped-dismissed-*`), tłumik banera — nie stan domenowy.
2. **Separate Ways ⟺ `analytics` — doprecyzowanie „zero wspólnego kodu".** Brak wzajemnego importu (dwustronnie),
   ale współdzielona jest **infrastruktura persystencji** (`db/schema`/`db/client`/`drizzle`) — to nie punkt integracji,
   lecz właśnie mechanizm „czytania surowych logów #8 równolegle". „Izolacja" jest prawdą na poziomie importów modułów,
   nie danych (retention czyta 4 tabele 2 innych kontekstów przez `import * as schema`).
3. **Odblokowanie Wrapped** — miesiąc dostępny gdy **ściśle przeszły (UTC)** (`isPastMonth`) **I** ma ≥1 Trening
   (`hasData = core.sessions>0`); naruszenie → **404** (nie 403). Odblokowuje się 1. dnia następnego miesiąca UTC —
   `PROPOZYCJA:` ryzyko off-by-one dla PL/FR (unlock ~1–2 h po lokalnej północy; dług reimplementacji).
4. **Archetyp — doprecyzowanie.** `pickArchetype` = **8 gałęzi `if` + 1 bezwarunkowy fallback** (`explorer`),
   first-match-wins; teksty PL w `wrapped.ts`, ale trasa **re-lokalizuje po stabilnym `key`** (tylko `power-user`/
   `specialist` re-interpolują liczby).
5. **Rekord w retencji ≠ Rekord w analytics (granica językowa).** `MonthlyPR` = max reps w oknie **kalendarzowego
   miesiąca** vs cała historia sprzed miesiąca — inne okno niż `stats.detectNewPRsForLog` (pojedynczy log) czy
   `progression`. **Smell dedupu ≥4–5 miejsc** (2 detektory SQL + running-high + inline) → dług reimplementacji.
6. **redZone `RPE≥9` per-seria vs `≥8`-na-średniej** — dwie granulacje rozłożone na obie domeny (Wrapped Maksymalista +
   trenerska Czerwona strefa używają `≥9` per-seria; effort-balance + regres w advancement używają `≥8` na średniej).
7. **Self-scope po `traineeId`.** Izolacja retencji przez tożsamość sesji (`user.id`, `role=trainee`), NIE przez parę
   `trainer_id`/`trainee_id` (kolumna `trainer_id` zdenormalizowana, tu nieużywana) — dług do rozstrzygnięcia.
8. **Decyzje właściciela:** sprzęgnięcie archetypów z rdzeniem progresji (**H7**) i wystawienie „Awansu" do retencji
   (realnie: `wrapped` czyta `skill_advancements` jak dziś czyta logi) → **otwarte `PROPOZYCJE` do fazy architektury**
   (dziś krawędzi NIE ma; archetypy są w 100% log-derived). Reszta hot-spotów → **dług reimplementacji, bez zmian w kodzie.**

## Uzupełnienie — sesja F7 · kontekst `catalog-skill` (2026-07-10)

Bounded Context Canvas `catalog-skill` (`07-define/catalog-skill.md`, ZWALIDOWANY) **nie wprowadza nowych bytów** —
potwierdza i uściśla istniejące (Biblioteka ćwiczeń/umiejętności, Efektywna biblioteka, Fork/origin_id, Umiejętność,
Wariant, Drabina, Drzewo/DAG, Stan węzła). Uściślenia utrwalone (zweryfikowane fan-outem + adwersaryjną weryfikacją
per twierdzenie: **167 CONFIRMED, 55 PARTIAL, 0 REFUTED**; 8 twierdzeń granicznych + 4 krytyków padło na limit sesji →
zweryfikowane ręcznie z kodu, wszystkie potwierdzone):

1. **Dwa światy SPRZĘGNIĘTE, nie rozłączne.** #4 płaski słownik `exercises` ⟂ #5 graf DAG `skills` mają różne
   KSZTAŁTY, ale `skill_variations.exercise_id → exercises` **RESTRICT** (wariant = ćwiczenie zaczepione na ordinalu)
   twardo je sprzęga — graf umiejętności stoi NA słowniku ćwiczeń. „⟂" dotyczy struktury, nie niezależności.
2. **God-moduł `catalog.ts`** (343 linie) scala oba światy + oba forki + org-resolve + regułę brand-demo → najwyższy
   cognitive load w mapie. `PROPOZYCJA:` (H5, zwalidowana F5) rozcięcie na **`skill-structure`** (#5 core, kernel
   grafowy) + **`exercise-catalog`** (#4 supporting) — opiera się na `catalog.ts` (`catalog-math.ts` w prod niesie
   tylko logikę #5; `suppressForkedOrigins` martwy). **Decyzja właściciela (2026-07-10): otwarta `PROPOZYCJA:`.**
3. **Kernel wewnętrzny `skill-tree-math` (H4).** Importowany **runtime** tylko przez `skills.ts`+`skill-tree.ts`+
   `brand-catalog.ts` (wszystkie ∈ catalog-skill); 4. importer `components/skill-tree.tsx` bierze wyłącznie
   `type NodeState` (wymazywany). Nie przecina granic kontekstu.
4. **Write-seam: STRUKTURA ⟂ ZDARZENIA.** catalog-skill definiuje STRUKTURĘ (`exercises`/`skills`/`skill_variations`/
   `skill_prerequisites`); `advancement` zapisuje ZDARZENIA — jedyny `insert(skill_advancements)` żyje w
   `skill-progression.ts:255`. Doprecyzowanie onDelete: `skill_advancements → skills` **CASCADE** (usunięcie skilla
   kasuje awanse), `→ skill_variations` **RESTRICT** (wariant użyty w historii jest niekasowalny). Dwa sprzężenia
   zwrotne po NAZWIE tabeli (`skills.ts:339`, `brand-catalog.ts:513` łapią błąd FK `skill_advancements`) — reakcja na
   blokadę, nie odczyt danych.
5. **Efektywna biblioteka — precyzja.** DWA równoległe buildery WHERE (`effectiveExerciseWhere` #4,
   `effectiveSkillWhere` #5), reużywane przez zapytania LISTOWE; single-row fetch-by-id (`getSkillWithVariations`)
   omija helper i robi własny inline check scope. Globalne READ-ONLY dla trenera: mutacje filtrują `eq(trainer_id)`
   (markowe = cichy no-op w `update/archiveSkill`, `SkillError` w `addVariation/reorderVariations`); fork OPCJONALNY
   (markowe ćwiczenie można wprost dodać jako wariant), wymagany tylko do MODYFIKACJI globalnej pozycji in-place.
6. **Fork zamraża snapshot, ale `demo_file_id` jest WSPÓŁDZIELONĄ referencją** (`catalog.ts:169`) — podmiana medium
   demo origin odbija się na forku. `forkSkill` (głęboki klon w jednej tx) klonuje tylko **wychodzące** krawędzie
   prereq i wskazuje ORYGINALNE (globalne) ćwiczenia/umiejętności (bez kaskadowego forka sąsiadów).
7. **H6 autoring globalny Prezesa** = własna powierzchnia catalog-skill: `brand-catalog.ts` pisze WŁASNE tabele
   katalogu jako wiersze markowe (`trainer_id NULL` + `organization_id`), reużywa `skill-tree-math`, wołany z 6 tras
   `marka/*` — **nie** cross-write do brand-platform (punkt kolaboracji aktora). Acykliczność DAG egzekwowana w
   **DWÓCH** repo (trener `skills.ts` + marka `brand-catalog.ts`).
8. **Ordinal 1..n bez dziur** utrzymuje REPO (dwufazowe przepakowanie przez ujemne), nie DB (UNIQUE(skill_id,ordinal)
   zabrania tylko duplikatów). Globalny `UNIQUE(exercise_id)` **nie istnieje** (byłby błędny przy katalogu markowym +
   forkach); reguła „≤1 umiejętność/ćwiczenie" egzekwowana guardem repo. Markowe umiejętności **bez** unikatu nazwy;
   unikat nazwy umiejętności trenera **częściowy** (`WHERE archived_at IS NULL`).
9. **Martwy / bez-konsumenta produkcyjnego kod (dług):** `normalizeTags` (`exercises.ts:2`, 0 importerów),
   `suppressForkedOrigins` (`catalog-math.ts:4`, tylko test), `getSkillTreeForTrainer` (tylko testy — trener widzi
   umiejętności LISTĄ), przestarzały docstring `listExerciseSkillMap` (realnie WYKLUCZA warianty z listy Progresji).
   Asymetria #4↔#5: #5 ma repo `skills.ts`, #4 CRUD ćwiczeń jest INLINE w trasach.
10. **Decyzje właściciela (2026-07-10):** rozcięcie God-modułu (H5) → **otwarta `PROPOZYCJA:`** do fazy architektury;
    bug 404 na globalnej umiejętności (dług advancement — `getSkillMapForTrainee` filtruje `skills.trainer_id`),
    God-moduł, martwy kod, `promoteTrainerCatalogToBrand` do usunięcia (etykieta żyje w tym glosariuszu, nie w kodzie),
    write-seam po nazwie tabeli, asymetria #4↔#5 → **dług reimplementacji, bez zmian w kodzie teraz.**

## Terminy

> Adnotacja **KANON** = termin kanoniczny ustalony 2026-07-05. „(wycofane)” = termin
> historyczny, którego reimplementacja ma nie używać.

| Termin (PL/EN) | Kontekst | Znaczenie | Źródło | Wprowadzono w |
|---|---|---|---|---|
| kalisthenos | branding | Nazwa marki/produktu; ZAWSZE pisana małą literą. | `CLAUDE.md`; `README.md` | F1 |
| **Marka / brand** | multi-tenant | **KANON.** Najwyższy poziom hierarchii — globalna marka kalisteniczna (singleton). Nosi branding, kanon biblioteki, docelową prowizję. Kod `brand`, UI „Marka”. `organization` (wycofane). | `schema.ts organizations`; spec `tenancy-marki §2` | F1 |
| **Region** | i18n / wielowaluta | **KANON.** Pojemny byt pod marką: dziś **kraj** (PL, FR) z walutą (pln/eur) i locale; `PROPOZYCJA:` docelowo zarządzalna jednostka organizacyjna per język. | `schema.ts regions`; spec `tenancy-marki §9` | F1 |
| **Prezes marki** | rola | **KANON.** Właściciel marki nad wszystkimi trenerami. UI „Prezes marki”, kod `brand_owner`/`president`. `brand_admin` (wycofane). Przy 1 marce = właściciel produktu. | `schema.ts userRole`; `app/routes/marka` | F1 |
| **Trener** (+ „Ambasador” = relacja) | rola / kontekst | **KANON.** Byt = „Trener” (prowadzi trening; faktyczna granica izolacji `trainer_id`). **„Ambasador”** = jego relacja/rola względem marki — to samo słowo, znaczenie per kontekst (marka↔trener). | `schema.ts userRole`; spec `ambasadorzy §1` | F1 |
| Podopieczny (trainee) | użytkownik | Klient trenera; dziedziczy organizację trenera (`region_id NULL`), scope po `trainer_id`. Płatnik i jedyny autor danych treningowych. | `schema.ts users_role_check`; spec `v1 §2` | F1 |
| Tenant-scope (trainer_id) | autoryzacja | FAKTYCZNA granica izolacji: każda tabela domenowa nosi `trainer_id`, brak dostępu → **404**. Organizacja/marka WYPROWADZANA z `trainer_id` (przy 1 marce nie jest osobną granicą izolacji). | `CLAUDE.md`; `authz.ts`; spec `tenancy-marki §2` | F1 |
| Zaproszenie / target_role (invite) | onboarding | Uogólnione zaproszenie linkiem: `invite_target_role ∈ {trainee,trainer}`. Prezes/trener nie dotyka haseł. Prezes NIE jest zapraszalny (tylko seed — akceptowalne przy 1 marce). | `schema.ts invites`; `auth/invite.ts` | F1 |
| Dezaktywacja / wstrzymanie (archived_at) | cykl życia konta | MIĘKKA blokada (nie usunięcie). Własny `archived_at` blokuje logowanie; podopieczny wstrzymanego trenera (własny `archived_at=NULL`) jest tylko BRAMKOWANY. Pauza subskrypcji best-effort. | `schema.ts users.archivedAt`; spec `ambasadorzy §3,§5` | F1 |
| MRR (ambasadora) | wgląd prezesa | Suma `amount_minor` AKTYWNYCH subskrypcji par danego trenera. Służy wglądowi — marka nie pobiera dziś prowizji. | `ambassadors.ts getAmbassadorProfile` | F1 |
| **Biblioteka ćwiczeń** | biblioteka | **KANON.** Zbiór ćwiczeń trenera: predefiniowane (**globalne**) ∪ własne. Każdy trener ma *swoją* (efektywną) bibliotekę ćwiczeń. | spec `markowa-baza §6`; `catalog.ts` | F1 |
| **Biblioteka umiejętności** | biblioteka | **KANON.** Zbiór umiejętności (skille, na które się awansuje): predefiniowane (**globalne**) ∪ własne trenera. Drzewo umiejętności to struktura NAD nią. | spec `umiejetnosci-progresja`; `skills.ts` | F1 |
| **Efektywna biblioteka** (dawniej „efektywny katalog”) | biblioteka | **KANON.** globalne (predefiniowane) ∪ własne trenera — jedno źródło prawdy dla biblioteki, drzewa i progresji. Trener WIDZI globalne, ZAPISUJE tylko własne (globalne read-only, używane WPROST — fork opcjonalny). „katalog” (wycofane). | `catalog.ts effectiveExerciseWhere/effectiveSkillWhere` | F1 |
| Globalny vs własny (trenerski) wiersz | biblioteka | **Globalny** (dawniej „markowy"): `trainer_id NULL` + `organization_id`. Własny: `trainer_id` + `organization_id NULL`. CHECK `ownerCheck` pilnuje dokładnie jednego właściciela. | `schema.ts exercises/skills ownerCheck` | F1→F2 |
| Fork / „Dostosuj” / origin_id | biblioteka | **Opcjonalny** copy-on-write kopii **globalnej** pozycji na własność trenera; `origin_id`→oryginał (znika z widoku forkującego). Fork zamraża snapshot — nie dostaje poprawek globalnej biblioteki. Tylko do MODYFIKACJI — globalne używa się wprost bez forka. | `catalog.ts forkExercise/forkSkill` | F1 |
| ~~Promocja in-place~~ (do usunięcia) | bootstrap | **DO USUNIĘCIA** w reimplementacji — jednorazowy seed „zrób z biblioteki założyciela kanon marki”. Prezes autoruje bibliotekę marki wprost, więc operacja znika. | `catalog.ts promoteTrainerCatalogToBrand` | F1 |
| Umiejętność (skill) | biblioteka / drzewo | Nazwana DRABINA wariantów (np. Front Lever); węzeł drzewa. Część Biblioteki umiejętności. Globalna albo własna trenera. | `schema.ts skills`; spec `umiejetnosci-progresja §2` | F1 |
| Wariant (skill variation) | biblioteka / drzewo | Szczebel drabiny mapujący się 1:1 na istniejące ćwiczenie; niesie tylko `ordinal`. „Obciążeniem w kalistenice jest to, KTÓRY wariant się wykonuje”. | `schema.ts skillVariations` | F1 |
| Drabina wariantów | drzewo (mikro) | Uporządkowana po `ordinal` (1..n, bez dziur) sekwencja wariantów wewnątrz umiejętności; reorder = dwufazowe przepakowanie ordinali. | `skills.ts addVariation/reorderVariations` | F1 |
| Drzewo / DAG prerekwizytów | drzewo (makro) | Skierowany graf ACYKLICZNY między umiejętnościami; struktura NAD Biblioteką umiejętności. Krawędź = „X wymaga Y”. Acykliczność egzekwowana w repo, nie w DB. | spec `drzewo §2`; `skill-tree-math.ts` | F1 |
| Stan węzła | drzewo (per podopieczny) | **KANON.** EN enum w kodzie (`mastered/in_progress/available/locked`) + **zamrożone** PL etykiety: opanowane / w toku / gotowe do startu / zablokowane. Liczony w porządku topologicznym. | `skill-tree-math.ts nodeState`; spec `drzewo §2` | F1 |
| Plan (treningowy) / wersja / basedOnVersion | plany | Wersjonowany program per podopieczny; **składa się z Sesji**. Tożsamość = (`traineeId`, `version`); `basedOnVersion` = z której active wyprowadzono draft. | `schema.ts plans`; `plans.ts createDraftFromActive` | F1 |
| Status planu: draft / active / archived | plany | Draft = szkic (≤1). Active = obowiązujący (≤1). Archived = poprzednia wersja (read-only). Publikacja: draft→active, archiwizując poprzedni active. Podopieczny widzi tylko active. | `schema.ts planStatus + partial unique` | F1 |
| **Sesja** (plan_session) | plany | **KANON.** Dzień treningowy w szablonie planu (np. Push / Pull / Legs); zawiera ćwiczenia, serie, bloki. Plan składa się z Sesji. | `schema.ts planSessions`; `plan-types.ts` | F1 |
| Blok (plan_block): single/superset/dropset | plany | Grupa itemów w Sesji. single=1 ćwiczenie; superset=≥2 (każde z własnym sets/rest); dropset=≥2 „dropy”, gdzie sets/rest należą do BLOKU a itemy mają tylko reps. | `schema.ts plan_blocks_kind_check` | F1 |
| RPE / Trudność / difficulty / tracks_rpe | logowanie / statystyki | Ocena wysiłku 1–10 per seria (kolumna `difficulty`, UI „Trudność”, domenowo RPE). `tracks_rpe` (per ćwiczenie) decyduje czy logowanie pyta; gdy false → `difficulty NULL`. Metryki liczą `AVG` pomijając NULL. | `schema.ts workout_set_logs.difficulty + exercises.tracks_rpe` | F1 |
| **Trening** (dawniej workout_log) + allDone | logowanie | **KANON.** Zarejestrowane WYKONANIE Sesji planu (kod `workout`, dziś `workout_log`): podopieczny, plan, Sesja, `performedOn`, notatka. `allDone=false` = niedokończony („nie skończyłem”). Treningi nigdy twardo nie kasowane. | `schema.ts workout_logs`; `workouts.ts saveWorkoutLog` | F1 |
| Pominięta seria (skipped set) / ordinal | logowanie | Seria z `[0, expectedSets)`, dla której nie zapisano wiersza — `ordinal` ZACHOWANY (nie re-indeksowany), by odróżnić skip od serii wykonanej. Kruchy kontrakt pozycyjny. | `workouts.ts SaveSetInput.ordinal` | F1 |
| Rozwój | statystyki / drzewo | Połączona powierzchnia per-podopieczny: drzewo umiejętności (bohater) + lista progresji ćwiczeń spoza drzewa („Pozostałe”). Łączy oś ilościową (Progresja) i jakościową (Awans). | spec `rozwoj-polaczenie §2` | F1 |
| **Progresja** (time-series) | statystyki | **KANON.** Szereg czasowy postępu w JEDNYM ćwiczeniu — „rekord w czasie”, oś ILOŚCIOWA. Read-only. Prostopadła do **Awansu** (drabina). | `progression.ts getExerciseProgression` | F1 |
| **Awans** (na drabinie) | drzewo / umiejętności | **KANON.** Przejście na wyższy wariant/umiejętność — oś JAKOŚCIOWA, **zawsze ręczna decyzja trenera** (`advancedBy: trainerId`). Prostopadły do Progresji. | `skill-progression.ts insertAdvancement` | F1 |
| **Rekord (PR)** | statystyki | **KANON.** Max liczba powtórzeń/sekund w NAJLEPSZEJ serii sesji — jedyna definicja postępu we wszystkich widokach. Kod `record`/`best`. „best/PR/najlepsza seria” zbiegają się w „Rekord”. | `progression.ts loadProgressionSessions` | F1 |
| Wrapped | retencja / gamifikacja | Miesięczna retrospektywa Spotify-style dla podopiecznego; odblokowuje się 1. dnia następnego miesiąca (miesiące przeszłe z ≥1 Treningiem). Trener nie ma Wrapped. | `wrapped.ts getMonthlyWrapped` | F1 |
| Archetyp | retencja / gamifikacja | Miesięczna „osobowość treningowa” wybierana regułowo (pierwsza pasująca reguła) z 9 wariantów. Serce warstwy motywacyjnej Wrapped. | `wrapped.ts pickArchetype` | F1 |
| Plateau | cockpit trenera | Ćwiczenie, gdzie reps stoją a RPE nie spada → flaga „rozważ zmianę wariantu”. Sygnał diagnostyczny, most do Awansu. | `stats.ts getPlateauExercises` | F1 |
| Sylwetka (body photo) | zdjęcia | Obszar „zdjęcia sylwetki” (physique). Ujęcie: przód/bok/tył. Trzymane u nas (decyzja F1). **KANON prywatności:** owner-scoped — tylko podopieczny (właściciel) + JEGO trener. | `*/sylwetka.tsx`; `schema.ts bodyPhotoView` | F1 |
| before/after (first vs latest) | zdjęcia | Para porównawcza per ujęcie: `first`=NAJSTARSZE wg `takenOn`, `latest`=NAJNOWSZE; `daysBetween`=różnica dni. Dwa kafle otwierające lightbox. | `stats.ts getSideBySidePhotoPairs` | F1 |
| Podpisany URL (signed file URL) | pliki / bezpieczeństwo | Krótkotrwały (24h) URL `/files/{id}?exp&sig` z HMAC-SHA256; jedyny sposób pobrania pliku. `PROPOZYCJA:` autoryzacja owner-scoped (podopieczny-właściciel + jego trener), nie tenant-scoped jak dziś. | `files.ts`; `files.$fileId.tsx` | F1 |
| Konsultacja (consultation) | konsultacje | **KANON.** Jeden byt = całe spotkanie 1:1 o cyklu `planned→confirmed→change_requested→cancelled→documented`. NIE tylko udokumentowane minione. | spec `konsultacje decyzja 3`; `schema consultations` | F1 |
| Harmonogram / termin / Cadence | konsultacje | **KANON.** Harmonogram = reguła cyklu (weekly/biweekly/monthly + kotwica + godzina + link), ≤1 aktywny na parę. „termin” = data konsultacji (nie osobny byt). „Nigdy” = brak aktywnego harmonogramu. | `schema consultationSchedules/consultations` | F1 |
| Punkt „do poprawy” / action item | konsultacje | Uporządkowany (`ordinal`) wpis udokumentowanej konsultacji, status `open/resolved`. „(stan) do udokumentowania” to WYLICZANY stan (planned + po terminie), nie osobny status. | `schema consultationActionItems`; `consultation-status.ts` | F1 |
| Konsultacja: odrzucona / odwołana / pominięta | konsultacje | **KANON (rozdzielone intencje):** „odrzucona” = podopieczny nie przyjął terminu; „odwołana” = trener odwołał; „pominięta” = termin w serii bez realizacji. Nie jedno „anulowane”. | spec `konsultacje`; `consultation-status.ts` | F1 |
| destination charges / connected account | płatności | Wzorzec Connect: Customer i Price na koncie PLATFORMY, subskrypcja z `transfer_data.destination` = connected account TRENERA (Express). Pieniądze do trenera. | `stripe/connections.ts, subscriptions.ts` | F1 |
| Merchant-of-record (MoR) = platforma | płatności / prawne | Prawnym sprzedawcą jest PLATFORMA (brak `on_behalf_of`). „Osobistość trenera” tylko przez copy „Prowadzenie treningowe — {trener}”. Istotne przy VAT/zwrotach. | spec `platnosci-redesign`; `subscriptions.ts` | F1 |
| coaching_subscription (para) / amount_minor | płatności | **KANON.** Jedna relacja płatnicza na parę (UNIQUE `trainer_id+trainee_id`): `amount_minor` (walutowo-neutralne minor-units + waluta) = **ŹRÓDŁO PRAWDY kwoty**. „grosze” (wycofane). Kwota w zaproszeniu = tylko wartość początkowa. | `schema coachingSubscriptions`; `money.ts` | F1 |
| Subskrypcja: anulowana / wygasła | płatności | **KANON (rozdzielone intencje):** „anulowana” = zakończona ręcznie (trener/klient) — churn dobrowolny; „wygasła” = zakończona po nieudanym dunningu — churn przymusowy. Nie jedno „canceled”. | `stripe/status.ts`; `webhook.ts` | F1 |
| Gating / hasAppAccess / ACCESS_STATUSES | płatności / dostęp | Ciągłe bramkowanie panelu podopiecznego: dostęp wymaga statusu ∈ {active, paused, past_due}, ale TYLKO gdy płatność realnie możliwa (Stripe + `chargesEnabled` + cena); inaczej pełny dostęp. „Płatność = dostęp”. | `stripe/access.ts`; `podopieczny/_layout.tsx` | F1 |
| paused / pause_collection | płatności | Wstrzymanie pobierania (behavior „void”). Stripe NIE zmienia `subscription.status` → status „paused” liczymy sami. Pauza ZACHOWUJE dostęp. | `subscriptions.ts pauseSubscription` | F1 |
| Lustro statusu / processed_webhook_events | płatności | Nasza kopia statusu subskrypcji/płatności w bazie, aktualizowana webhookami (idempotencja po `event.id`). Nasz enum = statusy Stripe + „none” + „paused”. | `webhook.ts`; `status.ts` | F1 |
| application_fee_percent = 0 (prowizja platformy) | płatności / przychód | Prowizja platformy z przepływu, dziś 0 (pass-through); gotowa do włączenia. `PROPOZYCJA:` docelowo >0 (~5% od trenera). Przychód trenera=real, przychód platformy=aspiracyjny. | `subscriptions.ts:160`; spec `platnosci §Decyzje 8` | F1 |
| Właściciel / Operator | ops | Człowiek prowadzący git, docker, migracje, deploy (Railway) — granica, której Claude nie przekracza (handoff). Jedyny „zespół ops”. | `CLAUDE.md` | F1 |
| PWA / powłoka podopiecznego / Fail-open | mobile / ops | Instalowalna, mobile-first powłoka (tabbar + bottom sheet, one-thumb; service worker cache'uje TYLKO statyki). Fail-open = usterka rate-limitera nie blokuje (świadoma degradacja). | spec `v1 §9`; `mobilna-powloka` | F1 |
| Non-goals / „V2” | zakres / brownfield | Świadome cięcia V1 z „migration path” — ale billing, i18n pl/fr + wielowaluta, model marki są JUŻ zaimplementowane. „V2” to fikcja porządkująca: dostawa przyrostowa przez osobne specy. | spec `v1 §1/§16` vs `README` + `schema` | F1 |
| **Globalne ćwiczenie / umiejętność** (dawniej „markowe") | biblioteka | **KANON (rewizja F2).** Predefiniowana pozycja globalnej biblioteki (`trainer_id NULL` + `organization_id`), zarządzana przez prezesa marki, read-only dla trenera, używana WPROST (fork opcjonalny). | `brand-catalog.ts`; `schema.ts ownerCheck` | F2 |
| Cofnięcie (regres na drabinie) | drzewo / umiejętności | Zdarzenie przejścia na NIŻSZY wariant (`recordAdvancement` to.ordinal<from.ordinal) — osobna intencja domenowa obok Awansu, wspólna tabela `skill_advancements`. | `skill-progression.ts:281` | F2 |
| Poziom startowy (setStartingLevel) | drzewo / umiejętności | Pierwsze zdarzenie awansu podopiecznego na umiejętności (`fromVariationId = NULL`) — kotwica strumienia event-sourcingu. „Przypisany do umiejętności" = ma ≥1 zdarzenie. | `skill-progression.ts:267-278` | F7 |
| Zdarzenie webhooka Stripe przyjęte (dedup) | płatności | Utrwalony fakt idempotencji: wiersz w `processed_webhook_events` (event_id PK) onConflictDoNothing PRZED przetworzeniem; ponowne dostarczenie pomijane (200). Przy błędzie handlera marker cofany (recovery). | `webhooks.stripe.tsx:35-39` | F2 |
| Anulowanie na koniec okresu (cancel_at_period_end) | płatności | **TRZECIA** intencja anulowania: `cancel_at_period_end` false→true, ustawiane wyłącznie webhookiem (Stripe Customer Portal); podopieczny zachowuje dostęp DO current_period_end. Różne od anulowania natychmiastowego i wygaśnięcia po dunningu. | `schema.ts:770`; `subscriptions.ts:268` | F2 |
| Customer Portal (druga powierzchnia zapisu billingu) | płatności | Hostowany panel self-service (`createPortalSession`): podopieczny anuluje/zmienia kartę/pobiera faktury BEZ lokalnej komendy; skutki wracają wyłącznie webhookiem. Write-side billingu ma DWÓCH właścicieli (nasze komendy + portal). | `subscriptions.ts:173-189` | F2 |
| Terminy starej serii pominięte | konsultacje | Reakcja przy PODMIANIE harmonogramu: przyszłe `planned` starej serii → `cancelled` + dezaktywacja starego schedule; ten sam persisted fakt „POMINIĘTE” co przy „Harmonogram wyłączony”. Pierwsze ustawienie nie wyzwala. | `consultation-schedules.ts:136-151` | F2 |
| Specjalizacja intencyjna (intent-specialization) | modelowanie | Dwa zdarzenia osi („Subskrypcja aktywowana” i „Status subskrypcji zaktualizowany”) pokrywają się dowodem 1:1 (ta sama linia/UPDATE), ale różnią intencją. Oznaczane jawnie, by nie liczyć jednego zapisu dwa razy. | `subscriptions.ts:266` | F2 |
| Notyfikacje / Dostarczanie (Delivery) | dostarczanie | Kontekst wspierający NIEOBECNY (missing capability): brak wysyłki e-mail/powiadomień/kolejki. Komunikacja krzyżująca granice (tokeny zaproszeń, przypomnienia konsultacji, dunning) zrzucona out-of-band (link surowy, Google, Stripe). Kandydat na kontekst w F5. | — (brak kodu) | F2 |

## Hot-spoty językowe

Legenda statusu: 🟡 otwarty · ✅ rozstrzygnięty (data + decyzja).

| Hot-spot | Na czym polega niejasność | Status |
|---|---|---|
| trainer/„ambasador”, brand_admin/„prezes”, organization/„marka”/„brand” | Systematyczny rozjazd słownika kod↔produkt. | ✅ 2026-07-05 — polityka **kod=UI**; Marka/brand, Prezes marki, Trener (byt) + Ambasador (relacja). |
| „sesja / session” przeciążona 4× | `plan_session` / `workout_log` / termin konsultacji / sesja auth. | ✅ 2026-07-05 — **Sesja** = element planu; **Trening** = wykonanie; konsultacja=„termin”; auth=osobny kontekst. |
| „Progresja” (ilość) vs „awans” (drabina) | Dwa prostopadłe koncepty pod jednym słowem. | ✅ 2026-07-05 — **Progresja** (oś ilościowa) vs **Awans** (oś jakościowa). |
| „best”/„rekord”/„PR”/„najlepsza seria” | Brak kanonu dla metryki postępu. | ✅ 2026-07-05 — **Rekord (PR)**; usunąć martwe `avgReps`. |
| „Biblioteka” (UI) vs „katalog” (kod) | Dwa słowa na tę samą powierzchnię. | ✅ 2026-07-05 — dwa światy: **Biblioteka ćwiczeń** + **Biblioteka umiejętności**; „katalog” wycofane. |
| „grosze”/`amount_grosze` jako minor-units dla EUR | Nazwa PLN-centryczna użyta generycznie. | ✅ 2026-07-05 — **`amount_minor`** (walutowo-neutralne) + waluta; „grosze” wycofane. |
| Stan węzła: EN kod ↔ PL UI | Ryzyko dryfu przy i18n. | ✅ 2026-07-05 — **EN enum + zamrożone PL etykiety**. |
| „promote/promocja” (biblioteki) vs „awans” (umiejętności) | Kolizja słowa. | ✅ 2026-07-05 — operacja **do usunięcia** (bootstrap nieistotny). |
| „canceled”/„cancelled” łączy różne intencje | Subskrypcja i konsultacja mieszają dobrowolne/przymusowe zakończenia. | ✅ 2026-07-05 — **rozdzielone**: anulowana/wygasła (subskrypcja); odrzucona/odwołana/pominięta (konsultacja). |
| Właściciel zdjęcia (trainee) vs kto pobiera blob (tenant) | Model prywatności danych wrażliwych. | ✅ 2026-07-05 — **owner-scoped**: podopieczny (właściciel) + jego trener (do egzekwowania w reimpl.). |
| „Region” = kraj czy jednostka zarządcza | Znaczenie może się rozszerzyć. | ✅ 2026-07-05 — termin **Region** (dziś kraj; `PROPOZYCJA:` docelowo jednostka zarządcza). |
| „Konsultacja” — termin przyszły vs udokumentowane minione | Znaczenie przesunęło się między specami. | ✅ 2026-07-05 — **Konsultacja = całe spotkanie** (cały cykl); Harmonogram=reguła; termin=data. |
| Kwota w dwóch miejscach: `invite` vs `coaching_subscription` | Źródło prawdy kwoty przed vs po rejestracji. | ✅ 2026-07-05 — **subskrypcja = źródło prawdy**; invite = wartość początkowa. |
| „markowe" (biblioteka) vs koncept „globalne" | Nazwa „markowe" myląca — chodzi o ogólnodostępną bibliotekę, nie branding. | ✅ 2026-07-06 (F2) — **„markowe" → „globalne"**; globalna biblioteka zarządzana przez prezesa marki, używana wprost, fork opcjonalny. |
