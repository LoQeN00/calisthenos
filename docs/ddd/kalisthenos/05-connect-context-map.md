# F5 — Connect — context map kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-06
> **Krok DDD:** 5 Connect · **Zależy od:** F3, F4

Wyznaczenie **bounded contextów** (przestrzeń rozwiązania — granica modelu/języka)
przez grupowanie 17 poddomen F3 wg wspólnego modelu i spójności agregatu, oraz
opisanie **Context Map** — relacji między kontekstami wzorcami z katalogu
(Partnership, Shared Kernel, Customer/Supplier, Conformist, ACL, OHS, Published
Language, Separate Ways) z kierunkiem U/D. **NIE zakłada 1:1 poddomena↔kontekst.**
Opisuje stan, który JEST (brownfield); zakłady na przyszłość oznaczone `PROPOZYCJA:`.
**Tu ustalono liczbę kontekstów → liczbę rozmów F7: 13.**

## Wejście (co przeczytano)

- **Główne wejścia:** `03-decompose-poddomeny.md` (17 poddomen + decyzje graniczne
  A–I + hot-spoty), `04-strategize-core-domain-chart.md` (typy core/supporting/generic +
  core-aspiracyjne/core-adjacent), `02-discover-mapa-zdarzen.md` (procesy dla message
  flows), `glosariusz.md` (kanon), `00-plan-analizy-strategicznej.md` §9 (F5), §4, §7.
- **Kod pod kątem sprzężeń (ślad audytowy):** `app/lib/db/schema.ts` (graf FK +
  onDelete), importy między `app/lib/*.ts` (+ `stripe/*`, `google/*`, `auth/*`),
  orkiestracja w `app/routes/*` (write-back Google, gating w layoutach, upload w trasach),
  wspólne tabele/typy (`users`, `invites`, `files`, `skill-tree-math`, `SubscriptionStatus`).
  Ścieżki potwierdzone `Glob`/`Grep`.
- **Silnik jakości (ciężki, §7):** **12 czytających agentów** (po jednym na klaster
  kontekstów) wyekstrahowało **130 sprzężeń** z dowodami `file:line` → **3 niezależne
  heurystyki grupowania** (wspólny-model/język · właściciel-aktor-rytm · gęstość-sprzężeń)
  + **rekonsyliacja** → 13 kontekstów + mapowanie + 38 kandydackich relacji +
  rozstrzygnięcia H1–H10. Klasyfikacja wzorców i **adwersaryjna weryfikacja** relacji
  względem realnego kodu: pełny fan-out weryfikatorów uderzył w twardy limit sesji
  (reset 1:20pm) i został **dokończony sceptycznym przeglądem w pętli głównej** —
  każda relacja ugruntowana dowodem z kodu; niezależny wieloagentowy pass-refutacji
  skrócony, zwalidowany przez właściciela (checkpoint 2026-07-06).
- **Walidacja właściciela:** zgoda na zestaw 13 kontekstów, scalenia (#2+#3, #4+#5,
  #10+#16, #13+#14), rozmycie relacji coachingowej w `identity`; **rozstrzygnięcie
  granicy rdzenia H5** — „AS-IS scalone + `PROPOZYCJA:` rozcięcia #5" (patrz Ustalenia §3).

## Ustalenia

### 1. Bounded contexty (13) — mapowanie poddomena→kontekst

Kontekst ≠ poddomena. Kilka poddomen trafia do jednego kontekstu (wspólny model
zapisu), a *typ* kontekstu (F4) to inna oś niż *ważność* poddomeny — supporting
kontekst może hostować rdzeniową poddomenę jako **core-adjacent**.

| Kontekst | Poddomeny | Typ | Sedno (dlaczego jeden kontekst — dowód) |
|---|---|---|---|
| **identity** — Tożsamość, zaproszenia i relacja coachingowa | 1, **H** | generic | Agregat `users` (schema.ts:89) = uniwersalna kotwica tenanta; relacja coachingowa (H3) = self-FK `users.trainer_id` (schema.ts:98-100, restrict) rodząca się przy consume (invite.ts:135), **bez własnej tabeli**; polimorficzne `invites` + `createInvite`/`consumeInvite` = jedyna fabryka kont; sesje sha256, Argon2id. |
| **brand-platform** — Platforma marki (Tenancy + Ambasadorzy) | 2, 3 | core-aspiracyjne | `organizations`+`regions` (schema.ts:62,68) = jedyne własne byty; „Ambasador" = **filtrowana projekcja** `users(role=trainer,org)` (ambassadors.ts:41-44), nie encja; inwarianty org-scope + `archived_at`-jako-dźwignia. |
| **catalog-skill** — Katalog ćwiczeń i drzewo umiejętności | 4, 5 | supporting *(struktura #5 = core-adjacent)* | **Wspólni pisarze tabel:** `catalog.ts:207-295` `forkSkill` pisze `skills`+`skill_variations`+`skill_prerequisites` **i** `exercises`; `brand-catalog.ts` autoruje oba światy; `skill_variations.exercise_id→exercises` (wariant JEST ćwiczeniem); kernel `skill-tree-math` używany przez `skills.ts`+`skill-tree.ts`+`brand-catalog.ts` (wewnętrzny, H4). |
| **advancement** — Awans podopiecznego | 6 | **core** | `skill_advancements` **nigdy nie dzieli wiersza** ze strukturą #5 — `skill-progression.ts` pisze wyłącznie własne zdarzenia, czyta #5 przez FK ids (schema.ts:672-680) i `SkillError`; event-sourced append-only, ręczna decyzja trenera = czysty differentiator. |
| **programming** — Programowanie / plany | 7 | supporting | Wersjonowany agregat `plan→sessions→blocks→items`; `publishPlan` (plans.ts:364-389) = jedyny handoff; **quasi-CQRS** — `workouts.ts` NIE importuje `plans.ts` (osobne moduły zapisu). |
| **workout-logging** — Trening / logowanie | 8 | supporting | Niezmienny append-only agregat 3-poziomowy; jedyny pisarz `saveWorkoutLog` (workouts.ts:753); **single-writer** wystawiony jako surowe tabele (de-facto OHS bez Published Language). |
| **analytics** — Analityka diagnostyczna | 11 | supporting | Read-only kokpit/plateau/Progresja/PR (`stats.ts`, `progression-math.ts`), zero zapisu; **Supplier sygnałów dla rdzenia** advancement (inwersja H7). |
| **retention** — Retencja / Wrapped | 12 | **core** | Moat retencyjny (decyzja właściciela, F4); własne agregaty nad surowymi logami (`wrapped.ts`), silnik reguł `pickArchetype`; **czyta surowe logi RÓWNOLEGLE do #11, zero wspólnego kodu** (wrapped.ts:1-3 tylko drizzle+db+schema). |
| **consultations** — Konsultacje, harmonogram i kalendarz | 10, 16 | supporting | Reguła→termin→dokumentacja; Google wchłonięty jako **wewnętrzny outbound ACL** (`sync.ts`→`consultations.ts`, nie odwrotnie); lustro `google_event_id`/`meeting_url` na `consultations`. |
| **body-photos** — Sylwetka | 9 | supporting | Owner-scoped; własny język before/after + własna tabela; **Customer kontraktu** `files` (`uploadFile`/`deleteFileBlob`), nie współ-zapis. |
| **billing-gating** — Płatności i dostęp | 13, 14 | generic | `stripe_connections`+`coaching_subscriptions`+`subscription_payments`+`processed_webhook_events`; `access.ts` = 3 czyste funkcje **bez tabel**, Conformist do lustra statusu (H9); Stripe za ACL. |
| **files** — Pliki i podpisane URL | 15 | generic | Polimorficzny rejestr blobów (`kind: exercise_demo\|set_video\|body_photo`); wystawia **Published Language** `UploadKind`/`UploadOwner` + protokół podpisu HMAC (`files.$fileId`); `FileStorage` swappable. |
| **delivery** — Dostarczanie / notyfikacje | 17 | **missing** | Zero kodu (grep mailer/webpush = 0); wyodrębniony by **uwidocznić brak**; 3 niewypełnione porty wejścia (H10). |

**Poza granicą systemu (external, za warstwami ACL):** **Google** (Calendar/Meet — w `consultations`), **Stripe** (Connect — w `billing-gating`).

**Liczba rozmów F7 = 13**, kolejność core-first: **advancement (#6) → retention (#12) →
catalog-skill** (struktura #5 z rygorem core — własna kanwa), potem supporting; generyki
(identity, billing-gating, files) i `delivery` (missing) dostają skróconą kanwę.

### 2. Context Map — relacje (wzorzec + kierunek U→D)

#### 2.1 Kręgosłup tenancy (przekrojowy Published Language, H8)

Wszystkie konteksty domenowe są **Conformist do pary `trainer_id`/`trainee_id`**
z `identity` — denormalizowanej w `plans`/`workout_logs`/`body_photos`/`skill_advancements`/
`consultations`/`coaching_subscriptions`. Izolacja = `authz.ts` (`ownsTrainerScope`) +
inline `WHERE trainer_id=?` per repo + **404-nie-403** (nie zdradzać istnienia zasobu).
To nie centralny gateway — **inwariant egzekwowany per-kontekst** jako wspólny język
graniczny. (Dowód: `authz.ts:3-23`; `trainees.ts:148-150`; filtry `workouts.ts:401`,
`plans.ts:33,287`, `skills.ts:151,165`, `files.$fileId.tsx:50`.)

#### 2.2 Relacje niebanalne (SK / C/S / ACL / SW)

| Relacja | Wzorzec | Kierunek | Dowód / uwaga |
|---|---|---|---|
| `identity` ⟷ `brand-platform` | **Shared Kernel** | symetryczny | Wspólny agregat `users`/`invites`: identity trzyma konto/sesję/auth, brand-platform pisze `organization_id`/`region_id`/`archived_at`(ambasador)/`joined_on` na tych samych wierszach. `ambassadors.ts:2` import `createInvite`, `:214/243` write `archived_at`; `organizations.ts:2` import `hashPassword`. (H1, H2) |
| `identity` → `billing-gating` | **Customer/Supplier** | identity=U | Para coachingowa + **kwota-seed** z zaproszenia (`invites.monthly_amount` schema.ts:167 → `setMonthlyAmount`, H1); gating czyta `users.archived_at` (H2, trainee-access.ts:17-25); `subscriptions.ts:55-62` czyta `display_name`/`email` do Stripe. |
| `billing-gating` → `brand-platform` | **Customer/Supplier** | billing=U | brand-platform **komenderuje** billing: `ambassadors.ts:6` import `pause/resumeSubscription`, `:216-231` dezaktywacja→pauza per para (best-effort); `:129-137` SUM(amount) WHERE active = MRR (read-only). |
| `brand-platform` → `catalog-skill` | **Customer/Supplier** | brand-platform=U | Org = kotwica tenancy globalnych wierszy (`exercises/skills.organization_id`→organizations restrict, owner_check XOR); Prezes autoruje treść markową (`brand-catalog.ts` pisze tabele katalogu, wołany z tras `marka/*`) — **aktor spinający** governance⊕autoring (H6). |
| `analytics` → `advancement` | **Customer/Supplier** | **analytics=U (inwersja H7)** | **Rdzeń jest KLIENTEM analityki:** `skill-progression.ts:4` import `getExerciseProgress`/`getEasierAtSameReps`/`getPlateauExercises`, `:127-135` map do `suggestAdvancement` (cienki ACL stats→AdvanceSignals); `skill-progression-math.ts:1` import `ProgressionStatus`. |
| `advancement` → `catalog-skill` (read-model „Rozwój") | **Customer/Supplier** | advancement=U | **Jedyny straddle:** read-model `skill-tree.ts:4,103` `getSkillTreeForTrainee` komponuje strukturę⊕awans (`nodeState` z projekcji awansów) — kierunek odwrotny do zapisu; read-only, więc lżejszy. |
| `body-photos` → `analytics` | **Customer/Supplier** | body-photos=U | analityka czyta `body_photos` (`stats.ts:996-1051` coverage + side-by-side); **smell:** helper parowania before/after fizycznie mieszka w `stats.ts` a służy UI sylwetki (`*/sylwetka.tsx`). |
| `delivery` ← `identity`/`billing-gating`/`consultations` | **Customer/Supplier** | delivery=D (MISSING) | 3 niewypełnione porty: token zaproszenia (`ambassadors.ts:184` surowy token, copy-paste), dunning (`past_due`→tylko badge; `hostedInvoiceUrl` nigdy nie mailowany), przypomnienia (delegacja do Google `sendUpdates:'all'` tylko gdy kalendarz podłączony). (H10) |
| `consultations` ← **Google** (external) | **ACL** | Google=U | `calendar.ts:21-44` `consultationToEvent` (nasz model→`Schema$Event`), events.insert/patch/delete, `sendUpdates:'all'`; OAuth2 auto-refresh; jednokierunkowy best-effort POST-commit; write-back `google_event_id` na `consultations`. |
| `billing-gating` ← **Stripe** (external) | **ACL** | Stripe=U | `webhook.ts:91-163` `mapEvent`, `status.ts:19-33` `mapStripeStatus` (unknown→incomplete), pinned API-version; „paused" rekonstruowany lokalnie z `pause_collection`; dwie powierzchnie zapisu (SDK + Customer Portal) reconcile webhookiem z idempotencją (`processed_webhook_events`). (H9) |
| `retention` ⟺ `analytics` | **Separate Ways** | symetryczny | **Zero wspólnego kodu** (zweryfikowane: `wrapped.ts` nie importuje `stats.ts`/`progression`); oba czytają #8 równolegle; PR zdublowany 3× (smell). |

#### 2.3 Conformist-gwiazda (downstream przyjmuje surowy model dostawcy)

Rdzeń kształtu domeny: kilka kontekstów-dostawców pisze surowe tabele, wielu
downstreamów czyta je **wprost** (bez tłumaczenia). Krawędzie chronione FK `RESTRICT`
(downstream chroni wiersz dostawcy przed usunięciem — odwraca kasowanie na archiwizację).

| Upstream (Supplier) | Downstream (Conformist) | Mechanizm / dowód |
|---|---|---|
| `catalog-skill` | programming, workout-logging, advancement, analytics, retention | `plan_items.exercise_id`→exercises restrict (schema.ts:364); `workout_exercise_logs.exercise_id`→exercises restrict (420); `skill_advancements`→`skill_variations` restrict (672-680); czytają name/unit/tags verbatim |
| `programming` | workout-logging | `workout_logs.plan_id/plan_session_id`→plans/sessions restrict (393-398) → `deletePlan` archiwizuje zamiast usuwać; `publishPlan` = handoff; snapshot `sessionName` (400) = defensywne odcięcie od mutacji planu |
| `workout-logging` | analytics, retention, advancement | join `workout_*` (stats.ts:61, wrapped.ts:229, skill-progression.ts:94 `currentHasLogs`); zero zapisu downstream |
| `files` | catalog-skill, workout-logging, body-photos | kontrakt `UploadKind`/`UploadOwner` + `video_file_id`/`demo_file_id` set null, `body_photos.file_id` restrict; reverse peek `fileIsBrandDemoInOrg` (files czyta regułę katalogu do poszerzenia dostępu org-wide) |
| `consultations` | analytics, identity (nav badge) | `nextUpcomingForTrainee`/`countPendingForTrainee` (kokpit + pull-substytut Delivery) |
| `identity` | wszystkie domenowe | kręgosłup tenancy `trainer_id`/`trainee_id` (§2.1); `brand-platform` czyta `workout_logs` (metryka ambasadora); `files.organization_id`→organizations (brand-platform=U dla `files`) |

### 3. Rozstrzygnięcia hot-spotów F3/F4 (H1–H10)

| # | Hot-spot | Rozstrzygnięcie (stan-JEST) | Dowód |
|---|---|---|---|
| H1 | Polimorficzne zaproszenie | **Shared Kernel/Published Language wewnątrz `identity`** (owner całego lifecycle: token/expiry/single-consume `FOR UPDATE`/budowa konta). Ładunki należą do sąsiadów: org/region→brand-platform, kwota→billing. `invites_target_check` partycjonuje (trainer-invite zakazuje kwoty). Sąsiedzi tylko wypełniają sloty (C/S do identity). | schema.ts:146-181; invite.ts:121-138; ambassadors.ts:176; podopieczni._index.tsx:112-127 |
| H2 | `archived_at` / „dezaktywacja" | Dom strukturalny=identity(`users`), semantyka zapisu=brand-platform(dezaktywacja ambasadora), egzekucja=identity(rotacja sesji no-op), konsumpcja=billing-gating(gating). **Współdzielona flaga bez właściciela = smell** (dwa znaczenia: trener „ambasador dezaktywowany" vs podopieczny „wstrzymany"). | users.archived_at schema.ts:108; ambassadors.ts:214/243; session.ts:44,104; trainee-access.ts:17-25; _layout.tsx:48 |
| H3 | Relacja coachingowa | **NIE osobny kontekst** (zgodne we wszystkich 3 grupowaniach). Rozmyta: narodziny(invite)→dom strukturalny(`users.trainer_id` self-FK, identity)→projekcja ekonomiczna(`coaching_subscriptions` UNIQUE(trainer,trainee), billing)→kręgosłup zdenormalizowany. Brak modułu/tabeli własnej. | schema.ts:98-100,757-775; invite.ts:135; denormalizacja 292,387,456,666 |
| H4 | `skill-tree-math` SK | Kernel **wewnętrzny** `catalog-skill` (nie międzykontekstowy) — po scaleniu #4+#5 wszyscy 3 konsumenci (autoring trenerski, read-model, autoring markowy) w jednym kontekście. | skill-tree-math importowany przez skills.ts:11 + skill-tree.ts:6 + brand-catalog.ts:4 |
| H5 | Granica rdzenia #4/#5/#6 | **AS-IS:** #4+#5 scalone w `catalog-skill`; struktura #5 = **core-adjacent**; #6 = jedyny czysty core BC. Soczewka: „wspólny pisarz→scal; czytelnik-cudzego-modelu→rozszczep". `PROPOZYCJA:` niżej. | catalog.ts:207-333; skill-progression.ts:255-264; schema.ts:672-680 |
| H6 | Platforma marki | **Rozproszona:** governance(#2+#3)=brand-platform; autoring treści markowej=catalog-skill (bo `brand-catalog.ts` pisze tabele katalogu). Prezes = aktor spinający oba. | marka/_layout.tsx:24-40; brand-catalog.ts:1-5; ambassadors.ts:41-44 |
| H7 | Retencja↔rdzeń progresji | Dziś Wrapped czyta **surowe logi #8**, NIE read-model rdzenia (zweryfikowane). #11 i #12 = równoległe downstreamy #8, **Separate Ways** między sobą. Prawdziwa inwersja: **analytics=Supplier rdzenia advancement**. Sprzęgnięcie Wrapped↔rdzeń = `PROPOZYCJA:` (dziś krawędzi NIE ma). | wrapped.ts:1-3; skill-progression.ts:4; skill-progression-math.ts:1 |
| H8 | Izolacja tenantów | Przekrojowy **Published Language** (`trainer_id`, 404-nie-403) egzekwowany per-kontekst, nie centralny gateway. Każdy kontekst = Conformist do `AuthUser` + kręgosłupa pary z identity. | authz.ts:3-23; trainees.ts:148-150; filtry per-repo |
| H9 | Gating↔Billing | #14 = **Conformist** do lustra statusu #13 (kierunek #13→#14) **wewnątrz** `billing-gating` — `access.ts` to 3 czyste funkcje bez tabel. Stripe = ACL upstream. Dwie powierzchnie zapisu reconcile webhookiem. | access.ts:1-26; webhook.ts:91-163; status.ts:19-33; subscriptions.ts:174-189 |
| H10 | Delivery (missing) | Osobny **kontekst-luka**, krzyżujący identity(token)/consultations(przypomnienia)/billing(dunning). Zero kodu dostarczania. Wyodrębniony świadomie by uwidocznić brak; kandydat do zbudowania w F7 (jeden adapter, 3 porty). | grep 0 mailer/webpush; podopieczni._index.tsx:123-138; _layout.tsx:70-74; calendar.ts:59 |

### 4. Domain Message Flow — kluczowe use-case'y

**UC1 — Publikacja planu** (`programming` → `workout-logging`)
1. Trener «Opublikuj plan» → **command** `publishPlan` w `programming` (plans.ts:364, draft→active, `FOR UPDATE`).
2. [**policy**] „Zarchiwizuj poprzedni aktywny" → atomowo w tej samej tx (plans.ts:379).
3. Podopieczny «Otwórz sesję» → **query** `loadSessionForLogging` czyta WYŁĄCZNIE active + rozwija żywy plan w oczekiwane serie.
   *Granica:* CF handoff; FK `RESTRICT` log→plan odwraca kasowanie (deletePlan → archiwizacja).

**UC2 — Zapis treningu → analityka/retencja** (`workout-logging` → `analytics` ‖ `retention`)
1. Podopieczny «Zapisz trening»/«Zaloguj serię» → **command** `saveWorkoutLog` (workouts.ts:753, insert całego drzewa w tx).
2. [**policy**] `detectNewPRsForLog` fire-and-forget post-save (loguj.$sessionId.tsx:187).
3. Trener «Kokpit» → **query** `analytics` czyta surowe logi [CF].
4. Podopieczny «Wrapped» → **query** `retention` czyta surowe logi RÓWNOLEGLE [CF; SW względem analytics].

**UC3 — Webhook Stripe → gating** (**Stripe** →ACL→ `billing-gating` → powłoka)
1. Stripe → **event** `customer.subscription.*` → `webhooks.stripe.tsx`.
2. [**policy**] dedup `processed_webhook_events` (event_id PK, onConflictDoNothing) → 200 jeśli już był.
3. `mapEvent` [**ACL**] → **command** `applySubscriptionUpdate` (lustro statusu; „paused" z `pause_collection`).
4. Podopieczny → żądanie → **query** `access.hasAppAccess` [CF] z **precedencją `archived_at` trenera PRZED bramką płatności** (H2); fail-open gdy płatność nierealna.

**UC4 — Zaproszenie → konto** (polimorficzne `invites`, H1)
1a. Prezes «Zaproś ambasadora» → **command** `inviteAmbassador`→`createInvite(target=trainer, org/region)` [SK identity↔brand-platform].
1b. Trener «Utwórz zaproszenie» → **command** `createInvite(target=trainee, trainer_id + monthly_amount)`.
2. Zaproszony «Przyjmij» → **command** `consumeInvite` (`FOR UPDATE`, single-consume) → INSERT `users` (trainer_id/org z invite) + auto-login.
3. [**policy**, ścieżka trainee] best-effort `setMonthlyAmount` → seed kwoty do `billing-gating` [C/S identity→billing].

### 5. Straddle, smells i długi (do faz architektury; nie blokują F5)

- **Straddle „Rozwój"** (jedyny w mapie): `skill-tree.ts:103` (read-model w `catalog-skill`) czyta `getSkillMapForTrainee` z `advancement` — kompozycja struktura⊕awans; read-only.
- **Brak właściciela `archived_at`** (H2) — flaga na `users` z 3 semantykami bez dedykowanego kontekstu.
- **3 intencje anulowania konsultacji** (odrzucona/odwołana/pominięta) kolapsują do `status='cancelled'` (consultations.ts:356-397) — intencja gubiona.
- **PR/Rekord zdublowany 3×** bez wspólnego modelu: `stats.detectNewPRsForLog` vs `wrapped.loadMonthlyPRs` vs `progression.markPrs`.
- **`skill_advancements.advanced_by` RESTRICT** vs `trainer_id` CASCADE (schema.ts:684) — usunięcie trenera może być zablokowane przez RESTRICT zanim zadziała CASCADE.
- **`ensureOccurrences` read-causes-write** z loadera trenera (brak crona) — horyzont terminów materializuje się dopiero gdy trener otworzy listę.
- **Gating fail-OPEN** (access.ts:24) — brak Stripe/ceny → `hasAppAccess=true` (core-adjacent decyzja security).
- **Helper before/after** fizycznie w `analytics` (`stats.ts`) mimo że służy UI `body-photos` — kod nie tam gdzie język.

## Hot-spoty / otwarte pytania

Przeniesione do faz architektury/reimplementacji (oznaczone jawnie):

- **`PROPOZYCJA:` rozcięcie rdzenia (H5, zwalidowane).** W reimplementacji wydzielić
  **strukturę drzewa #5 jako osobny kontekst `skill-structure` typu core** (czysty kernel
  grafowy) z God-modułu `catalog.ts` (dziś miesza płaski słownik #4 z grafem #5). Rdzeń
  docelowy = dwa sąsiadujące core BC — `skill-structure` (#5) + `advancement` (#6) — spięte
  read-modelem „Rozwój", nad supporting `exercise-catalog` (#4).
- **`PROPOZYCJA:` para coachingowa jako first-class agregat** (H3) — dziś rozmyta po
  self-FK + 6 tabelach; reimpl. mógłby dać jej własny byt (parowanie, roster, migracja historii przy zmianie trenera).
- **`PROPOZYCJA:` materializacja stanu dostępu** (#14, z F2) — dałaby gatingowi własne dane
  → wtedy `access` mógłby stać się osobnym kontekstem zamiast polityki wewnątrz billing.
- **`PROPOZYCJA:` sprzęgnięcie retencji z sygnałami rdzenia** (H7, z F4) — dziś krawędzi NIE ma.
- **`PROPOZYCJA:` zbudowanie kontekstu `delivery`** (H10) — jeden adapter, trzy porty.
- **Smells** z §5 — do rozstrzygnięcia w F7/architekturze, nie na poziomie context mapy.

## Zmiany w glosariuszu

Dopisano blok **„Uzupełnienie — sesja F5 (2026-07-06)"**: (1) 13 **bounded contextów**
z nazwami kanonicznymi + zasada kontekst≠poddomena; (2) termin **core-adjacent
kontekst** (supporting kontekst hostujący rdzeniową poddomenę z rygorem core — tu
struktura #5 w `catalog-skill`); (3) **inwersja H7** (analytics = Supplier rdzenia);
(4) **relacja coachingowa rozmyta** (H3, bez osobnego kontekstu); (5) **izolacja
tenantów = Published Language** (H8); (6) `PROPOZYCJA:` **skill-structure** (rozcięcie
#5 w reimplementacji). F5 nie wprowadza nowych bytów domenowych — nazywa granice.

## Stan i następny krok (handoff)

- **Ustalono:** **13 bounded contextów** (mapowanie wszystkich 17 poddomen + H), każdy
  z typem; **Context Map** z relacjami sklasyfikowanymi wzorcem + kierunkiem U/D
  (SK ×1, C/S ×7, ACL ×2 external, SW ×1, Conformist-gwiazda po kręgosłupie tenancy);
  rozstrzygnięcia H1–H10 z dowodami `file:line`; 4 Domain Message Flows; granica rdzenia
  H5 zamrożona (AS-IS scalone + `PROPOZYCJA:` rozcięcia #5). Zweryfikowane fan-outem
  czytającym (130 sprzężeń) + sceptycznym przeglądem + walidacją właściciela.
- **Otwarte (do architektury):** 5 `PROPOZYCJI` (rozcięcie #5, para coachingowa,
  materializacja dostępu, sprzęgnięcie retencji, budowa delivery) + smells §5.
- **Co czyta następna faza (F6 Organise, LEKKA):** tę Context Map — wyznacza granice
  **własności modułów** (który kontekst = samodzielnie utrzymywalny/wdrażalny moduł),
  tryby zależności (x-as-a-service vs ścisła współpraca), cognitive load; reverse Conway.
  Rdzeń (`advancement`, `retention`, struktura #5) i generyki (`billing-gating`, `files`,
  `identity`) to naturalne kandydatki na różne tryby własności.

> Domykając fazę: status w `README.md` (F5 ✅ 2026-07-06), blok w `glosariusz.md`,
> przepisanie `next-session-prompt.md` na fazę F6 (Organise — własność modułów, LEKKA).
