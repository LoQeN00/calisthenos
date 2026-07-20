# F4 — Strategize — Core Domain Chart kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-06
> **Krok DDD:** 4 Strategize · **Zależy od:** F1, F3

Destylacja rdzenia: klasyfikacja **17 poddomen** z F3 jako **core / supporting /
generic** na **Core Domain Chart** (oś złożoności modelu × oś różnicowania) i
wynikająca z typu **strategia inwestycji** (buduj / buduj-prosto / kup-integruj).
Podział pracy zgodnie z runbookiem F4: **złożoność szacowana z kodu**, **różnicowanie
dostarczone przez właściciela** (priory F1 + trzy decyzje strategiczne tej sesji).
Opisuje stan, który JEST; zakłady na przyszłość oznaczone `PROPOZYCJA:`. NIE zakłada
1:1 poddomena↔bounded context (to F5).

## Wejście (co przeczytano)

- **Główne wejścia:** `03-decompose-poddomeny.md` (F3 — 17 poddomen, odpowiedzialności,
  mapowanie zdarzeń, decyzje graniczne A–I, hot-spoty) + `01-understand-model-biznesowy.md`
  (F1 — wyróżnik, tabela „Wyróżnik vs commodity", źródła wartości/przychodu, JTBD).
- **Kanon językowy:** `glosariusz.md` (rozstrzygnięcia 2026-07-05 + rewizje F2/F3).
- **Runbook + zasady:** `00-plan-analizy-strategicznej.md` §9 (F4), §4 (zasady), §7 (silnik jakości).
- **Silnik jakości (średni, adaptacja do „z kodu × osąd właściciela"):**
  1. **Fan-out czytający (17 agentów)** — po jednym na poddomenę, każdy oszacował
     **złożoność MODELU** z kodu z dowodami (plik:koncept), rozróżniając ją od ważności
     biznesowej. Kod czytany punktowo per poddomena (wskaźniki z §8 planu + F3).
  2. **Synteza** — złożenie osi złożoności (z kodu) z osią różnicowania (priory F1,
     NIE wymyślane od nowa) → propozycja typów + strategii + Domain Vision Statement.
  3. **Adwersaryjny krytyk** — próba obalenia klasyfikacji względem kanonu F1/F3 i logiki
     Core Domain Chart (czy core naprawdę różnicuje? czy generic nie niesie moatu? czy
     nie liczymy różnicowania podwójnie? czy aspiracja nie jest mylona z dzisiejszym
     moatem?). Werdykt: **zero blockerów, rdzeń zidentyfikowany poprawnie**; wchłonięto
     3 poprawki (patrz „Poprawki z krytyki").
- **Walidacja właściciela:** trzy decyzje różnicowania nadpisujące domyślny prior F1
  (patrz „Decyzje właściciela") + zgoda na zamrożenie całości.

## Ustalenia

### Oś złożoności modelu (rekonstrukcja z kodu — ślad audytowy)

Złożoność MODELU = jak trudno POPRAWNIE zamodelować/zaimplementować (algorytmy,
automaty stanów, inwarianty, liczba sprzężonych encji, przypadki brzegowe), **nie**
ważność biznesowa. Wynik: tylko **dwie** poddomeny `high` — #5 (bespoke, rdzeń) i #13
(saas-shaped, kupujemy).

| # | Poddomena | Złoż. | Główny napęd złożoności (dowód z kodu) | Natura |
|---|---|---|---|---|
| 1 | Tożsamość i uwierzytelnianie | medium | Cykl zaproszeń create→consume(created\|replaced), idempotencja `FOR UPDATE`+recheck, rotacja sesji; ~3 encje, brak algo grafowych (`invite.ts`, `session.ts`) | bespoke |
| 2 | Tenancy / Bootstrap marki | low | 2 encje + idempotentny seed (singleton, unique region); brak automatów/grafów (`organizations.ts`, `seed.ts`) | bespoke |
| 3 | Ambasadorzy | low | Odczyt/agregacja metryk + soft-archive toggle; jedyny niuans: best-effort pauza subskrypcji fire-and-forget (`ambassadors.ts`) | bespoke |
| 4 | Biblioteka ćwiczeń | medium | Dwuwłasność (`owner_check`), fork copy-on-write idempotentny+race-safe, głęboki klon umiejętności (`catalog.ts`, `catalog-math.ts`) | bespoke |
| **5** | **Umiejętności i drzewo** | **high** | **Algorytmy grafowe DAG: DFS cyklu, Kahn topo-sort, warstwy najdłuższej ścieżki, automat 4 stanów węzła, kruchy ordinal drabiny** (`skill-tree-math.ts`, `skills.ts`) | bespoke |
| 6 | Awans podopiecznego | medium | Event-sourcing z tie-break, automat stanu węzła sprzężony z propagacją prereq po DAG, inwarianty przejść w repo (`skill-progression*.ts`) | bespoke |
| 7 | Plany / Programowanie | medium | 4-poziomowe drzewo encji, draft→active→archived (partial unique), polimorfizm bloku, atomowa publikacja FOR UPDATE (`plans.ts`) | bespoke |
| 8 | Trening / Logowanie | medium | Niemutowalny agregat 3-poziomowy, kontrakt pozycyjny ordinal (skipped set), rekonstrukcja widoku 1:1 (`workouts.ts`) | bespoke |
| 9 | Sylwetka | low | Jednoencjowy owner-scoped CRUD, before/after = sort po `takenOn`; złożoność w infra plików (`body-photos.ts`) | library-shaped |
| 10 | Konsultacje i harmonogram | medium | Automat stanów per aktor + silnik cykliczności (≈RRULE) + idempotentna materializacja terminów (`consultation-*.ts`) | bespoke |
| 11 | Analityka diagnostyczna | medium | ~kilkanaście autorskich heurystyk (plateau, „łatwiej"), kruche progi, obsługa null-RPE, tygodnie ISO (`stats.ts`, `progression-math.ts`) | bespoke |
| 12 | Retencja / Wrapped | medium | Uporządkowany rule-engine 9 archetypów (first-match-wins), detekcja PR vs historia, matematyka kalendarza (`wrapped.ts`) | bespoke |
| **13** | **Płatności / Subskrypcje** | **high** | **Idempotencja rozproszona w 3 warstwach, wyścigi kolejności webhooków, lustro 7 stanów, dwie powierzchnie zapisu, kruche kontrakty pól API** (`stripe/*`) | saas-shaped |
| 14 | Bramkowanie dostępu | low | 3 czyste predykaty; waga w inwariantach: fail-open + precedencja wstrzymania trenera (`stripe/access.ts`) | bespoke |
| 15 | Pliki i podpisane URL | medium | HMAC sign/verify, magic-bytes, dwufazowa spójność blob↔wiersz, Range requests (`files.ts`, `file-uploads.ts`) | library-shaped |
| 16 | Integracja Google Calendar/Meet | medium | Cykl tokenów OAuth2, szyfrowanie at-rest, HMAC state, best-effort sync lustrzany (`google/*`) | library-shaped |
| 17 | Notyfikacje / Dostarczanie | medium | *(model docelowy — missing capability)* outbox + idempotencja + scheduling + automat stanu wiadomości | library-shaped |

### Oś różnicowania (z F1 + osąd właściciela)

Przeniesiona z zwalidowanej tabeli F1 „Wyróżnik vs commodity". **Wysokie różnicowanie
wg F1: tylko #5+#6** (kalisteniczny model progresji z trenerem w pętli). Właściciel w
tej sesji **podniósł** dwa dodatkowe obszary (patrz „Decyzje właściciela"). Reszta = niska.

### Core Domain Chart

```
RÓŻNICOWANIE
  high │            #12          #6          #5          ╮
       │         (Wrapped)   (Awans)   (Umiej./drzewo)   │ RDZEŃ
       │            ↑ decyzja właściciela                │ (buduj)
       │        retencja = moat                          ╯
       │        ⇡ ⇡ ⇡  core-aspiracyjne (buduj zawczasu)
       │      #2 Tenancy · #3 Ambasadorzy · (fork/#4)
  ─────┼─────────────────────────────────────────────────────
       │  #9 #14      #1 #4 #7 #8 #10 #11 #15 #16 #17       #13
  low  │  ················ SUPPORTING / GENERIC ·············  (KUP)
       └─────────────────────────────────────────────────────
          low                medium                  high
                       ZŁOŻONOŚĆ MODELU (z kodu)
```

Kluczowy odczyt: rdzeń (#5) łączy **najwyższą złożoność** z **najwyższym różnicowaniem**
→ buduj. #13 (Stripe) też jest `high` complexity, ale zerowe różnicowanie → **tym
bardziej kupuj**. To podręcznikowy rozkład Core Domain Chart.

### Klasyfikacja 17 poddomen (typ + strategia)

| # | Poddomena | Złoż. | Różnic. | **Typ** | Strategia inwestycji |
|---|---|---|---|---|---|
| 5 | Umiejętności i drzewo | high | high | **core** | **buduj** (rdzeń moatu, pełne pokrycie testowe czystej logiki) |
| 6 | Awans podopiecznego | medium | high | **core** | **buduj** (z #5 = jeden model progresji) |
| 12 | Retencja / Wrapped | medium | high\* | **core** | **buduj** (\*decyzja właściciela; `PROPOZYCJA:` sprzęgnąć z sygnałami progresji) |
| 2 | Tenancy / Bootstrap marki | low | low→high | **core-aspiracyjne** | **buduj zawczasu** (zakład strategiczny na markę) |
| 3 | Ambasadorzy | low | low→high | **core-aspiracyjne** | **buduj zawczasu** |
| 4 | Biblioteka ćwiczeń | medium | low | supporting | buduj-prosto; **fork/dwuwłasność = core-adjacent** (rygor rdzenia — substrat #5/#6 + aspiracja marki) |
| 7 | Plany / Programowanie | medium | low | supporting | buduj-prosto (automat stanów deklaratywnie) |
| 8 | Trening / Logowanie | medium | low | supporting | buduj-prosto (uwaga na kontrakty pozycyjne) |
| 9 | Sylwetka | low | low | supporting | buduj-prosto (reużyj FileStorage) |
| 10 | Konsultacje i harmonogram | medium | low | supporting | buduj-prosto (rozważ bibliotekę RRULE) |
| 11 | Analityka diagnostyczna | medium | low | supporting | buduj-prosto; **plateau = core-adjacent** (most do #6, test-first) |
| 14 | Bramkowanie dostępu | low | low | supporting | buduj-prosto; **fail-open = inwariant security** (rygor rdzenia) |
| 1 | Tożsamość i uwierzytelnianie | medium | low | generic | kup/integruj prymitywy; **cykl zaproszeń/ról = rygor supporting** |
| 13 | Płatności / Subskrypcje | high | low | generic | kup/integruj (high complexity → tym bardziej NIE buduj) |
| 15 | Pliki i podpisane URL | medium | low | generic | kup/integruj (storage/CDN → S3/R2); in-house cienka warstwa podpisów |
| 16 | Integracja Google Calendar/Meet | medium | low | generic | kup/integruj (google-auth-library); opcjonalna, best-effort |
| 17 | Notyfikacje / Dostarczanie | medium | low | generic | kup/integruj klocki (Resend/Postmark + kolejka + outbox); in-house tylko orkiestracja |

**Cross-cutting commodity (poza 17, zaksięgowane jako generic):** mechanika i18n (PL/FR),
`rate-limit.ts` (fail-open).

### Strategia inwestycji per typ

- **core → buduj:** autorsko, najlepszymi wzorcami, najwyższa akceptowalna złożoność,
  pełne pokrycie testowe czystej logiki, najwięcej uwagi. Źródło przewagi.
- **core-aspiracyjne → buduj zawczasu:** buduj maszynerię platformy marki wzorcami core
  **mimo braku dzisiejszego moatu**, bo to przyszły model przychodu (zakład strategiczny
  właściciela). Różnicowanie firmowe dla *inwestycji*, `PROPOZYCJA:` dla *dzisiejszego moatu*.
- **supporting → buduj-prosto:** potrzebne i specyficzne dla nas, bez przeinwestowania;
  inwarianty deklaratywnie w DB (partial unique, CHECK); CRUD z kontraktem pozycyjnym
  zamiast wynajdywania algorytmów. **Fragmenty core-adjacent** (fork #4, plateau #11)
  dostają rygor rdzenia, bo ich błąd podkopuje rdzeń.
- **generic → kup/integruj:** problem rozwiązany na rynku; dojrzała biblioteka/SaaS
  (Stripe Connect, Google APIs, @node-rs/argon2, FileStorage→S3/R2, Resend/Postmark),
  in-house tylko cienka warstwa kleju i idempotencji.

### Cross-cutting: inwarianty bezpieczeństwa (rygor rdzenia niezależnie od pudełka)

Niezależnie od pozycji na wykresie, trzy inwarianty są **security-krytyczne** i dostają
rygor testowy jak rdzeń (bo złamanie = wyciek/utrata dostępu):
- **Izolacja tenantów** — `trainer_id` jako granica, **404 nie 403**, `resolveCatalogOrgId`
  (dziedziczenie org podopiecznego). Przekrojowa po wszystkich poddomenach domenowych,
  nie tylko #2 (który pokrywa sam bootstrap).
- **Fail-open gating** (#14) — gdy Stripe nierealnie skonfigurowany → pełny dostęp
  (inaczej blokada wszystkich); precedencja: wstrzymanie trenera PRZED bramką płatności.
- **Owner-scoped signed URL** (#15) — podpisany URL + zakres właściciela dla danych
  wrażliwych (zdjęcia sylwetki).

### Domain Vision Statement

> Rdzeniem kalisthenos jest **kalisteniczny model progresji z trenerem w pętli**: drabiny
> wariantów w DAG prerekwizytów (#5) + zawsze ręczny, event-sourcowany awans autoryzowany
> przez trenera (#6) — jedyne połączenie wysokiej złożoności grafowej ze zwalidowanym
> różnicowaniem, którego nie daje ani coaching wagowy, ani self-serve apki. Wokół tego
> rdzenia właściciel stawia dwa świadome zakłady inwestycyjne: **retencję (#12 Wrapped)**
> podniesioną do moatu przez sprzęgnięcie gamifikacji z sygnałami progresji, oraz
> **platformę marki (#2/#3)** budowaną wzorcami core zawczasu jako przyszły model
> przychodu. Wszystko pozostałe to substrat budowany prosto in-house (plany, logowanie,
> analityka, konsultacje) albo problem rozwiązany na rynku, który integrujemy (auth,
> Stripe, pliki, Google, dostarczanie). Zasada: bronić i pogłębiać rdzeń + dwa zakłady,
> resztę utrzymywać tanio i niezawodnie, nie przeinwestowując w commodity.

### Decyzje właściciela (walidacja F4)

Trzy rozstrzygnięcia różnicowania — osąd biznesowy nadpisujący domyślny prior F1:

1. **#12 Retencja/Wrapped → CORE** (nie supporting, jak sugerował prior F1). Jawny konflikt
   F1↔F3 rozstrzygnięty na korzyść F3: retencja to strategiczny wyróżnik. `PROPOZYCJA:`
   by z „gatunkowo kopiowalnego" mechanizmu stał się realnym moatem, archetypy trzeba
   **sprzęgnąć z sygnałami rdzenia progresji** (dziś `wrapped.ts` czyta tylko surowe logi).
2. **Platforma marki (#2 Tenancy + #3 Ambasadorzy + maszyneria forka #4) → CORE-ASPIRACYJNE**.
   Różnicowanie DZIŚ niskie (monetyzacja marki = 0, billing EUR niepodpięty, FR pusty),
   ale to deklarowany kierunek strategiczny → buduj wzorcami core zawczasu.
3. **#11 Plateau → CORE-ADJACENT** (cała #11 zostaje supporting, ale heurystyka plateau
   dostaje rygor rdzenia jako most decyzyjny trenera do Awansu #6). Spójne z traktowaniem
   forka #4; nie fragmentuje wykresu.

### Poprawki z adwersaryjnej krytyki (wchłonięte)

- **Spójność #1↔#14:** #1 = generic (prymitywy się kupuje), ale cykl zaproszeń/ról oznaczony
  rygorem supporting; #14 zostaje supporting (czysty bespoke predykat — nie ma czego kupić).
- **Odrzucono „#10 jako pod-core":** oś wykresu to różnicowanie (dlaczego klient WYBIERA),
  nie lepkość (dlaczego zostaje). Moat relacji trener↔podopieczny jest już zaksięgowany w #6;
  liczenie go drugi raz przez scheduling to błąd. #10 = twardo supporting.
- **Dodano notę cross-cutting security** (izolacja tenantów niedowartościowana etykietą
  „low" na #2).
- **DVS przycięty** do 3 zdań o moacie (inwentarz przeniesiony do strategii per typ).
- **Atrybucja:** `nodeState`/propagacja po DAG = `skill-tree-math` (#5); event-sourcing
  awansu z tie-break = `skill-progression-math` (#6) — jeden model rdzenia, bez dublowania.

### „Rozwój" i growe drzewo — świadomie NIE osobne placementy

Zapisane wprost, by nikt nie dodał 18. poddomeny: **„Rozwój"** = powierzchnia prezentacyjna
(JOIN #6 Awans + #11 Progresja), **growe drzewo** = ta sama implementacja co #5/#6 pokazana
wizualnie. Kanon F1 zakazuje liczyć je jako osobne różnicowanie (moat zaksięgowany raz w #5/#6).

## Hot-spoty / otwarte pytania

Do rozstrzygnięcia w F5 (Connect) i fazach architektury — F4 tylko je nazywa:

1. **Sprzęgnięcie #12 z rdzeniem progresji** (`PROPOZYCJA` z decyzji 1). Dziś Wrapped czyta
   tylko logi; realny moat retencji wymaga wpięcia sygnałów awansu/drzewa. Decyzja modelarska
   — czy #12 czyta read-model rdzenia, czy dostaje własne. F5/architektura.
2. **Granica bounded contextu rdzenia progresji vs katalog (#4).** Fork/dwuwłasność jest
   core-adjacent — WEWNĄTRZ czy NA ZEWNĄTRZ core BC? Decyzja istotniejsza niż sam poziom
   inwestycji; należy do F5 (nie zakładać 1:1 poddomena↔kontekst).
3. **Bounded context platformy marki (#2/#3/#4-fork).** Skoro core-aspiracyjne, F5 rozstrzyga,
   czy to jeden kontekst „platforma marki", czy rozproszone.
4. **Izolacja tenantów jako przekrojowy inwariant** — F5 decyduje, czy modelować jako osobny
   cross-cutting concern / Published Language, czy egzekwować per kontekst.
5. **Dziedziczone z F3 (bez zmian):** dwa Shared Kernele (polimorficzne zaproszenie 1↔3↔13;
   `archived_at`/dezaktywacja 1↔3↔14), relacja coachingowa bez właściciela (hot-spot H),
   wewnętrzne szwy #5/#10/#13.

## Zmiany w glosariuszu

Dopisano blok **„Uzupełnienie — sesja F4 (2026-07-06)"**: (1) definicja **rdzenia** kalisthenos
(kalisteniczny model progresji #5+#6 + retencja #12); (2) termin **core-aspiracyjne**
(platforma marki #2/#3 — niska różnica dziś, inwestycja core zawczasu); (3) termin
**core-adjacent** (fragment supporting z rygorem rdzenia: fork #4, plateau #11, inwarianty
security #14/#15/izolacja); (4) **retencja jako moat** (#12 podniesione, `PROPOZYCJA`
sprzęgnięcia z progresją). F4 nie wprowadza nowych bytów domenowych — nadaje im typ i strategię.

## Stan i następny krok (handoff)

- **Ustalono:** wszystkie 17 poddomen mają **typ** (core/supporting/generic + core-aspiracyjne)
  i wynikającą **strategię inwestycji**; złożoność ugruntowana z kodu (tylko #5 i #13 = high);
  różnicowanie z F1 + trzy decyzje właściciela (retencja→core, marka→core-aspiracyjne,
  plateau→core-adjacent); Domain Vision Statement zwalidowany; cross-cutting security nazwane;
  „Rozwój"/growe drzewo świadomie poza listą. Zweryfikowane adwersaryjnym krytykiem (0 blockerów).
- **Otwarte (do F5):** granice bounded contextów rdzenia vs katalog i platformy marki;
  sprzęgnięcie #12↔progresja; izolacja tenantów jako concern; Shared Kernele i relacja
  coachingowa z F3 — wszystkie jako wejście do context mappingu, nie do rozstrzygnięcia tutaj.
- **Co czyta następna faza (F5 Connect):** poddomeny (F3) + **klasyfikację F4** (core dostaje
  najwięcej uwagi w kolejności F7) + kod pod kątem sprzężeń (FK w `schema.ts`, importy między
  `app/lib/*`, wspólne tabele/typy). F5 wyznacza bounded contexty + Context Map (wzorce
  relacji) i **ustala liczbę kontekstów → liczbę rozmów F7**.

> Domykając fazę: status w `README.md` (F4 ✅), blok w `glosariusz.md` oraz przepisanie
> `next-session-prompt.md` na fazę F5 (Connect — context map, CIĘŻKA).
