# F6 — Organise — własność modułów kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-07
> **Krok DDD:** 6 Organise · **Zależy od:** F5

Reframe kroku Organise dla **solo / małego zespołu**: nie „zespoły ludzi", lecz
**granice własności modułów i cognitive load**. Bierzemy 13 bounded contextów z F5
i pytamy o każdy: czy to **samodzielnie utrzymywalny/wdrażalny moduł**, jaki jest
**tryb zależności** na jego krawędziach (x-as-a-service vs ścisła współpraca vs
kup/integruj vs owned-core), i **gdzie skupia się złożoność**. Zasada: **reverse
Conway** — „ustaw moduły, architektura podąży". To wejście do przyszłego podziału
backendu (oddzielenie BE/FE, moduły/serwisy). Opisujemy stan, który **JEST**
(tryby wyprowadzone WPROST z wzorców relacji F5); zakłady na przyszłość →
`PROPOZYCJA:`.

## Wejście (co przeczytano)

- **Główne wejście:** `05-connect-context-map.md` (F5 — 13 bounded contextów + typy,
  Context Map z wzorcami relacji + kierunkiem U/D, kręgosłup tenancy, rozstrzygnięcia
  H1–H10, straddle/smells §5, 5 `PROPOZYCJI`).
- **Typy → strategia:** `04-strategize-core-domain-chart.md` (F4 — core/supporting/generic
  + core-aspiracyjne/core-adjacent; strategia buduj/kup-integruj mapuje się na tryb własności).
- **Kanon:** `glosariusz.md` (blok F5: 13 kontekstów, core-adjacent, inwersja H7, relacja
  coachingowa rozmyta, izolacja=Published Language, `PROPOZYCJA:` skill-structure).
- **Runbook + zasady:** `00-plan-analizy-strategicznej.md` §9 (F6 — LEKKA, REFRAMED), §4.
- **Kod punktowo (F6 jest lekka — tylko granice modułów tam, gdzie F5 zostawił straddle/smell):**
  - `authz.ts:3-59` — potwierdzony **cienki, czysty kernel izolacji** współdzielony przez
    wszystkie konteksty (`ownsTrainerScope` + `canRead/canWrite` + read/write autoryzacja
    wiersza katalogu markowy vs trenerski). Low complexity, security-krytyczny.
  - `stripe/access.ts:1-26` — potwierdzone **3 czyste predykaty bez tabel** (fail-open
    `if (!paymentRequired) return true`); gating = polityka wewnątrz `billing-gating`, nie własny moduł danych.
  - `skill-tree.ts:4-5,103` — potwierdzony **straddle „Rozwój"**: importuje `getSkillMapForTrainee`
    (z `advancement`) **i** `listSkillsForTrainer` (z `catalog-skill`), komponuje strukturę⊕awans; read-only.
  - `catalog.ts` (343 l.) — potwierdzony **God-moduł**: `effectiveExerciseWhere` (#4) +
    `effectiveSkillWhere` (#5) + `forkExercise`/`forkSkill` (fork obu światów, `forkSkill` ~100 l.
    głębokiego klonu grafu) + `resolveCatalogOrgId` (org-resolution przekrojowa) +
    `fileIsBrandDemoInOrg` (czyta **własną** tabelę `exercises`, by demo markowe było widoczne org-wide —
    wołany PRZEZ trasę `files.$fileId.tsx:51`, więc kierunek to `files`→`catalog-skill`, nie odwrotnie) +
    bootstrap-owy `promoteTrainerCatalogToBrand` (żywy: `seed.ts:124` + itest; `do usunięcia` w reimpl. wg glosariusza).
    Cały klaster catalog-skill ≈ 1 800 l. (`catalog.ts`+`skills.ts`+`skill-tree-math.ts`+`brand-catalog.ts`) na jednym właścicielu.

## Ustalenia

### 0. Taksonomia trybów zależności (wzorzec F5 → tryb własności)

Cztery tryby, wyprowadzone z wzorców relacji F5 i strategii F4. Jeden kontekst może
nosić **różne tryby na różnych krawędziach** (np. `billing-gating`: kup/integruj wobec
Stripe, x-as-a-service wewnętrznie jako adapter, C/S wobec `identity`).

| Tryb (skrót) | Znaczenie operacyjne | Wzorzec F5 źródłowy | Strategia F4 |
|---|---|---|---|
| **x-as-a-service** | Izolowany adapter za czystym kontraktem; **niezależnie wdrażalny**; downstream nie zna wnętrza. | ACL/external; OHS+Published Language; read-only projekcja | generic / read-model |
| **kup/integruj** | Problem rozwiązany na rynku; cienka własna warstwa kleju + idempotencji. | ACL do external SaaS/lib | generic (buy) |
| **ścisła współpraca** | Wspólny model **zapisu** / współdzielony agregat; wysoki koszt koordynacji; **nierozdzielne bez refaktoru**. | Shared Kernel; cross-context write | (koszt, nie strategia) |
| **moduł-dostawca** (Conformist-star) | Właściciel modelu wystawia kontrakt; wielu downstreamów czyta go **wprost**; krawędź chroniona FK `RESTRICT`. | Conformist-gwiazda; Customer/Supplier | supporting |
| **owned-core** | Własność „u siebie", najwyższy rygor testowy, **nie oddawać na zewnątrz**. | core BC (F4 buduj) | core |

### 1. Mapa: kontekst → moduł własności + tryb zależności + cognitive load

`▲` = kandydat na **niezależne wdrożenie / x-as-a-service**. `⛓` = **węzeł ścisłej
współpracy** (nierozdzielny bez refaktoru). CL = cognitive load (H/M/L).

| # | Kontekst (F5) | Typ F4 | Moduł własności | Tryb(y) zależności (per krawędź, z F5) | CL | Niezależne wdrożenie? |
|---|---|---|---|---|---|---|
| 1 | **identity** | generic | Kernel platformy `identity` + współdzielony podmoduł `users`/`invites` | **kup/integruj** prymitywy (Argon2id, sesje) · **⛓ ścisła współpraca** z `brand-platform` (SK `users`/`invites`) · **dostawca** kręgosłupa tenancy (Published Language `trainer_id`, H8) dla wszystkich | M | ⛓ **Nie** — SK z `brand-platform` blokuje |
| 2 | **brand-platform** | core-aspiracyjne | Moduł `brand-platform` (governance; autoring markowy przez powierzchnię catalog-skill, H6) | **⛓ ścisła współpraca** z `identity` (SK `users`/`invites`) · **U/Supplier** dla `catalog-skill`/`files` (org=kotwica tenancy) · autoring markowy = `brand-catalog.ts` ∈ `catalog-skill` (wołany z `marka/*`; Prezes=aktor spinający, H6 — **nie** cross-write) · **Customer/D** komenderuje `billing-gating` (billing=Supplier/U; pause/resume) | L–M | ⛓ **Nie** — 1 krawędź ⛓ (SK z identity) |
| 3 | **catalog-skill** | supporting (*hostuje rdzeniową #5 → core-adjacent*) | **Moduł-dostawca** `catalog-skill` (God-moduł `catalog.ts`); kernel wewn. `skill-tree-math` (H4) | **moduł-dostawca** (Conformist-star, catalog-skill=U) dla programming/workout-logging/advancement/analytics/retention · autoring markowy = własna powierzchnia `brand-catalog.ts` (wołana z `marka/*`, reużywa `skill-tree-math`, H6) · **konsument read-modelu „Rozwój"** (`skill-tree.ts` czyta `advancement`=U) · **konsumowany przez trasę `files`** (reverse-peek `fileIsBrandDemoInOrg`) | **H** | ▲ jako dostawca — ale wewnętrznie **przeciążony** |
| 4 | **advancement** | **core** | **owned-core** `advancement` (event-sourced, czysty write-seam) | **owned-core** · **Conformist/D** czyta strukturę `catalog-skill` (FK ids + `SkillError`; catalog-skill=U) · **Supplier/U** dla read-modelu „Rozwój" (żyje w `catalog-skill/skill-tree.ts`, czyta awanse; read-only) · **Customer/D** wobec `analytics` (**inwersja H7** — analytics=Supplier/U sygnałów plateau/progresja) | M–H | ▲ Tak — czysty szew zapisu (nigdy nie dzieli wiersza z #5) |
| 5 | **programming** | supporting | **Moduł-dostawca** `programming` (quasi-CQRS) | **moduł-dostawca** (Conformist U) dla `workout-logging` (handoff `publishPlan`, FK RESTRICT); `workouts.ts` NIE importuje `plans.ts` | M | ▲ Tak — de-facto już osobny moduł zapisu |
| 6 | **workout-logging** | supporting | **Moduł-dostawca** `workout-logging` (single-writer) | **moduł-dostawca** (OHS bez Published Language — surowe tabele) dla analytics/retention/advancement | M | ▲ Tak — ale surowe tabele = ryzyko sprzężenia (`PROPOZYCJA:` kontrakt) |
| 7 | **analytics** | supporting (*plateau core-adjacent*) | **Moduł read-model** `analytics` (zero zapisu) | **x-as-a-service** (read-only projekcja) · **Supplier/U dla rdzenia** `advancement` (H7) → rygor core-adjacent (plateau) · czyta workout-logging/body-photos/consultations · gości helper before/after (smell — służy `body-photos`) | M | ▲ Tak — czysta projekcja czytająca |
| 8 | **retention** | **core** | **owned-core** `retention` (Wrapped) | **owned-core** · **Separate Ways** wobec `analytics` (zero wspólnego kodu) · czyta surowe logi #8 RÓWNOLEGLE | M | ▲ Tak — read-over-logs, brak sprzężenia z analytics |
| 9 | **consultations** | supporting | Moduł `consultations` + **izolowany adapter ACL Google** | **dostawca** (nav badge, analytics czyta) · zawiera **x-as-a-service** adapter Google (outbound ACL, `sync.ts`→`consultations.ts`) | M–H | ▲ Adapter Google — czysty izolat; domena osobno |
| 10 | **body-photos** | supporting | Cienki moduł `body-photos` (owner-scoped) | **Customer/D** kontraktu `files` (files=Supplier/U, x-as-a-service) · **konsument `analytics`**: helper before/after (`getSideBySidePhotoPairs`) fizycznie w `stats.ts` (smell, F5 §5); własny = owner-scoped CRUD | **L** | ▲ Tak — najprostszy moduł (zależny od analytics po helper) |
| 11 | **billing-gating** | generic | Moduł `billing-gating` (adapter Stripe + webhook + polityka gating) | **kup/integruj** Stripe za **ACL** (x-as-a-service) · gating = 3 czyste predykaty (Conformist do lustra statusu, H9) · **Customer/D** wobec `identity` (para+kwota-seed; identity=U) · **Supplier/U** komenderowany przez `brand-platform` (pause/resume) | **H** | ▲ Tak — adapter+webhook = naturalny osobny serwis |
| 12 | **files** | generic | Moduł `files` (rejestr blobów + podpis HMAC) | **kup/integruj** storage/CDN (S3/R2) za **cienką własną warstwą podpisów** HMAC (x-as-a-service) · **dostawca/U** (Conformist) dla catalog-skill/workout-logging/body-photos · **ale konsument `catalog-skill`**: trasa `files.$fileId.tsx:46,51` woła `resolveCatalogOrgId`+`fileIsBrandDemoInOrg` w ścieżce autoryzacji (reverse-peek, F5 §2.3) | M | ▲ Tak, **nie „czysto podręcznikowo"** — autoryzacja sięga w `catalog-skill` (`PROPOZYCJA:` wynieść regułę brand-demo) |
| 13 | **delivery** | **missing** | Moduł `delivery` **do zbudowania** (1 adapter, 3 porty, H10) | **kup/integruj** klocki (Resend/Postmark + kolejka + outbox); **Downstream (D)** identity/billing/consultations; in-house tylko orkiestracja | — (grow) | ▲ Tak — greenfield, naturalny osobny moduł |
| — | **Google** (external) | — | Za ACL w `consultations` | **x-as-a-service** (poza granicą systemu) | — | ▲ (external) |
| — | **Stripe** (external) | — | Za ACL w `billing-gating` | **x-as-a-service** (poza granicą systemu) | — | ▲ (external) |

### 2. Grupowanie własności (reverse Conway — „ustaw moduły")

Trzy klasy modułów wg trybu, plus jeden węzeł ścisłej współpracy. To jest szkielet
przyszłego podziału backendu.

**A. Węzeł ⛓ ścisłej współpracy (NIE rozdzielaj bez refaktoru) — 1 krawędź:**
- **`identity` ⟷ `brand-platform`** — Shared Kernel na agregacie `users`/`invites`
  (identity: konto/sesja/auth; brand-platform: `organization_id`/`region_id`/`archived_at`/`joined_on`
  na tych samych wierszach). Najwyższe sprzężenie w całej mapie; muszą być **współwłasne**
  albo dzielić podmoduł `users`/`invites`. `PROPOZYCJA:` wydzielić współdzieloną bibliotekę
  kernela `users`/`invites` → zamienia SK na zależność-bibliotekę (spada koszt koordynacji).

**Punkt kolaboracji aktora (NIE ⛓ knot): autoring markowy.** `brand-catalog.ts`
**należy do `catalog-skill`** (reużywa jego kernela `skill-tree-math`, H4/H6) i pisze
**własne** tabele katalogu — wołany z tras `marka/*`. To Customer/Supplier (brand-platform=U
jako kotwica org), z **Prezesem jako aktorem spinającym** governance (brand-platform) i autoring
(catalog-skill) — nie współdzielona własność zapisu. Lżejsze niż SK; do świadomości przy podziale
(`PROPOZYCJA:` autoring komenderuje `catalog-skill` przez kontrakt zamiast wołać jego repo wprost).

**B. Moduły-dostawcy (własny model, kontrakt na zewnątrz, downstream Conformist):**
`catalog-skill` (najcięższy — patrz cognitive load), `programming`, `workout-logging`,
`files`. Krawędzie chronione FK `RESTRICT` (odwracają kasowanie na archiwizację). Ryzyko:
downstream czyta **surowy model** dostawcy (zwłaszcza `workout-logging` = OHS bez Published
Language) → BE/FE split to moment na nadanie im **kontraktu czytania** zamiast surowych tabel.

**C. owned-core (u siebie, najwyższy rygor, nie oddawać):**
`advancement` (#6, czysty write-seam — genuinely separable), **struktura #5** (F4 **core**;
dziś wewnątrz supporting `catalog-skill`, co czyni go kontekstem *core-adjacent* — `PROPOZYCJA:`
wydzielić jako `skill-structure`), `retention` (#12, read-over-logs, Separate Ways).

**D. x-as-a-service / niezależnie wdrażalne (adaptery + generyki + projekcje):**
`files`, `billing-gating`, `analytics`, adapter Google (w `consultations`), `delivery`,
external Google/Stripe. Cienki, jasny kontrakt; wchłaniają zmienność zewnętrzną.

**E. Cienki konsument:** `body-photos` (Customer `files`; najprostszy).

### 3. Cognitive load — gdzie skupia się złożoność

| Poziom | Moduły | Napęd złożoności |
|---|---|---|
| **HIGH (F4-anchored)** | `catalog-skill` · `billing-gating` | catalog-skill: God-moduł `catalog.ts` = **szerokość** (#4 słownik ⊕ #5 fork/filtr ⊕ oba forki ⊕ org-resolve ⊕ reguła brand-demo wołana przez `files`); **głębia** grafowa #5 (DAG cykl/topo/warstwy/4-stany) w kernelu `skill-tree-math` (F4 #5=high). billing-gating: rozproszona idempotencja Stripe, wyścigi webhooków, lustro 7 stanów, dwie powierzchnie zapisu (F4 #13=high) |
| **HIGH (agregacja modułowa)** | `consultations` | **Nie** pojedyncza poddomena high w F4 (#10=medium, #16=medium) — wysokie dopiero jako moduł: automat stanów per aktor + silnik cykliczności ≈RRULE + **stateful OAuth/sync Google**. Uwaga: `analytics` (MEDIUM) jest porównywalnie duża LOC-owo — CL = trudność utrzymania modułu „w głowie", nie sama wielkość |
| **MEDIUM** | `advancement` · `programming` · `workout-logging` · `analytics` · `retention` · `files` · `identity` | event-sourcing z tie-break + propagacja po DAG · 4-poziomowe drzewo planu · kontrakt pozycyjny ordinal · ~kilkanaście heurystyk (analytics: szerokość, nie głębia) · rule-engine 9 archetypów · HMAC+magic-bytes+dwufazowa spójność · cykl zaproszeń + rotacja sesji |
| **LOW** | `body-photos` · `brand-platform` (governance) · `authz` (kernel) | jednoencjowy owner-scoped CRUD · odczyt/agregacja metryk + soft-archive toggle · cienki czysty predykat (ale security-krytyczny) |

**Kluczowa obserwacja reverse-Conway:** God-moduł `catalog.ts` **przeciąża jednego
właściciela** — miesza supporting #4 z **forkiem/filtrem rdzeniowej #5** + org-resolve + regułę
brand-demo (czytaną przez trasę `files`). (Sam **graf** #5 to osobny kernel `skill-tree-math`;
`catalog.ts` przeciąża *szerokością*, nie grafową *głębią*.) To najsilniejszy argument za
`PROPOZYCJA:` rozcięciem rdzeniowej #5 (`skill-structure`, **F4 core**) od supporting #4
(`exercise-catalog`): rozkłada cognitive load i oddziela rygor core od substratu.

### 4. Zaczep o przyszły podział BE/FE (reverse Conway)

Ta mapa = **lista szwów** do wyodrębnienia API backendu. Kolejność peel-off wg trybu:

1. **Najpierw x-as-a-service** (najczystszy kontrakt, najmniej sprzężeń): `billing-gating`
   (+webhook) → `delivery` (greenfield) → adapter Google → `analytics` (read-only) → `files`
   (**po wyniesieniu reguły brand-demo** z trasy serwującej — dziś reverse-peek w `catalog-skill`).
   To pierwsze „serwisy" do odcięcia.
2. **Potem moduły-dostawcy** z nadaniem **Published Language** zamiast surowych tabel:
   `catalog-skill`, `programming`, `workout-logging` — BE/FE split to moment, w którym
   Conformist-star (dziś raw-table) dostaje kontrakt czytania.
3. **owned-core** (`advancement`, `retention`, `skill-structure`) — zostaje in-house,
   najwyższy rygor; nie serwisy do outsourcingu, lecz jądro własnego backendu.
4. **Węzeł ⛓** (`identity`↔`brand-platform`) — **najtrudniejszy do rozcięcia**; NIE dwa
   serwisy, lecz **wspólny moduł kernela** `users`/`invites` (albo współwłasność). Adresować
   jako pierwszy dług przy projektowaniu granicy BE.

Domyślna rekomendacja topologii: **modularny monolit** z powyższymi granicami modułów
(nie mikroserwisy od razu) — bo jedyny „zespół ops" to właściciel (glosariusz), a węzeł ⛓
i moduły-dostawcy na surowych tabelach czynią pełne rozcięcie na serwisy przedwczesnym.
x-as-a-service moduły (D) są jednak gotowe do odcięcia niezależnie, kiedy zajdzie potrzeba.
**To jest `PROPOZYCJA:` topologiczna — do walidacji intencji właściciela** (patrz Hot-spoty).

## Hot-spoty / otwarte pytania

- **Docelowa granularność wdrożenia (KLUCZOWE do walidacji).** F6 mapuje własność i tryby
  **AS-IS**; intencja właściciela co do topologii (modularny monolit vs stopniowe wydzielanie
  serwisów, jak agresywnie ciąć) to osąd biznesowo-architektoniczny, którego nie ma w kodzie.
  Domyślna rekomendacja: modularny monolit + gotowe do odcięcia moduły x-as-a-service.
- **Węzeł ⛓ `identity`↔`brand-platform`.** Zaakceptować współwłasność, czy zainwestować w
  wydzielenie wspólnej biblioteki `users`/`invites` już w reimplementacji (`PROPOZYCJA:` §2A)?
- **`archived_at` bez właściciela (H2, dług z F5).** Flaga o 3 semantykach krzyżuje granice
  modułów `identity`/`brand-platform`/`billing-gating` — **który moduł ją POSIADA?** Kandydat:
  `identity` jako dom strukturalny, z jawnymi zdarzeniami czytanymi przez pozostałe.
- **Rozcięcie God-modułu `catalog.ts` (`PROPOZYCJA:` H5).** Potwierdzić wydzielenie
  `skill-structure` (#5, core) od `exercise-catalog` (#4, supporting) w reimplementacji jako
  ruch reverse-Conway rozkładający cognitive load.
- **Kontrakt `workout-logging` (OHS→Published Language).** Czy w BE/FE split dostawca surowych
  logów dostaje kontrakt czytania (dziś raw-table Conformist)?

## Zmiany w glosariuszu

F6 **nie wprowadza nowych bytów domenowych** — dodaje słownik **własności modułów**
(do dopisania do `glosariusz.md` po walidacji właściciela):
1. **Tryb zależności** — `x-as-a-service` / `kup-integruj` / `ścisła współpraca` / `moduł-dostawca`
   (Conformist-star) / `owned-core` (§0).
2. **Węzeł ścisłej współpracy (⛓)** — para modułów nierozdzielna bez refaktoru (`identity`↔`brand-platform`, SK `users`/`invites`).
3. **Moduł-dostawca (provider module)** — właściciel modelu wystawiający kontrakt czytany
   wprost przez downstream (catalog-skill/programming/workout-logging/files).
4. **owned-core moduł** — kontekst core utrzymywany in-house z najwyższym rygorem (advancement/retention/skill-structure).
5. `PROPOZYCJA:` nazwy modułów reimplementacji: `skill-structure`, `exercise-catalog`,
   współdzielony kernel `users`/`invites`.

## Stan i następny krok (handoff)

- **Ustalono:** każdy z **13 kontekstów** ma **moduł własności** i **tryb(y) zależności** per
  krawędź (wyprowadzone z wzorców F5); **kandydaci na niezależne wdrożenie/x-as-a-service**:
  `billing-gating`, `analytics`, adapter Google, `delivery`, + external (i `files` — z jednym
  reverse-peek w `catalog-skill` do rozcięcia); **1 krawędź ⛓ ścisłej współpracy**
  (`identity`↔`brand-platform` SK) + 1 punkt kolaboracji aktora (autoring markowy `brand-catalog.ts`
  ∈ catalog-skill, H6); **3 owned-core** (`advancement`, `retention`, struktura #5); **4 moduły-dostawcy**;
  mapa cognitive load (HIGH: catalog-skill/billing-gating F4-anchored, consultations przez agregację)
  z God-modułem `catalog.ts` jako punktem przeciążenia; zaczep BE/FE (kolejność peel-off + domyślnie
  modularny monolit).
- **Walidacja:** właściciel zaakceptował mapę 2026-07-07 („ok"). Poniższe 5 pytań pozostaje
  **świadomie otwartych** — decyzje fazy architektury, NIE blokują F6.
- **Otwarte (do architektury):** docelowa granularność wdrożenia (topologia); los węzła ⛓; właściciel
  `archived_at` (H2); potwierdzenie rozcięcia `catalog.ts` (H5); kontrakt `workout-logging`.
  `PROPOZYCJE` **F6-nowe:** współdzielony kernel `users`/`invites`; autoring markowy komenderuje
  `catalog-skill` przez kontrakt (zamiast wołać jego repo); wyniesienie reguły brand-demo z trasy
  `files`; kontrakt czytania dla `workout-logging`. **Przeniesione z F5:** rozcięcie #5→`skill-structure`,
  para coachingowa first-class, materializacja gatingu, sprzęgnięcie retencji z sygnałami rdzenia, budowa `delivery`.
- **Co czyta następna faza (F7 Define — kanwa per kontekst, CIĘŻKA, WIELE ROZMÓW):** tę mapę
  własności (który moduł, jaki tryb) razem z typem F4 i relacjami F5 — jako wejście do Bounded
  Context Canvas. Kolejność **core-first**: pierwszy `advancement` (#6), potem `retention` (#12),
  `catalog-skill`/struktura #5, supporting, na końcu generyki i `delivery` (skrócona kanwa).

> Domykając fazę (po walidacji): status w `README.md` (F6 ✅ + data), blok w `glosariusz.md`,
> przepisanie `next-session-prompt.md` na fazę F7 (Define — pierwszy kontekst `advancement`).
