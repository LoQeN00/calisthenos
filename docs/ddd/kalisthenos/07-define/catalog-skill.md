# F7 — Define — Bounded Context Canvas: `catalog-skill` (Katalog ćwiczeń i drzewo umiejętności)

> **Status:** ZWALIDOWANY · **Data:** 2026-07-10 (walidacja właściciela: 2026-07-10)
> **Krok DDD:** 7 Define · **Zależy od:** F4, F5, F6 · **Kontekst F7:** #3 (core-first, po `advancement` i `retention`)
> **Typ (F4):** supporting — **hostuje rdzeniową poddomenę #5 (Umiejętności i drzewo) jako core-adjacent**
> **Moduł własności (F6):** moduł-dostawca (Conformist-gwiazda) + kernel wewnętrzny `skill-tree-math` (H4) + własna powierzchnia autoringu globalnego Prezesa (H6)

Bounded Context Canvas kontekstu **`catalog-skill`** (poddomeny **#4 Biblioteka ćwiczeń** + **#5 Umiejętności
i drzewo**) — trzeci kontekst F7 i pierwszy **supporting hostujący rdzeń**. Kanwa jest **zrekonstruowana z
kodu**: każda odpowiedzialność i każdy komunikat IN/OUT ma dowód `file:line`. Stan opisuje to, **co JEST**;
zakłady na przyszłość oznaczone `PROPOZYCJA:`. Kontekst mieści **DWA KSZTAŁTY** — płaski słownik ćwiczeń (#4)
i graf umiejętności (#5) — **sprzęgnięte** relacją *wariant = ćwiczenie*; kanwa jawnie je rozdziela, bo os
inwestycji (rdzeń = #5) biegnie inaczej niż granica kontekstu (God-moduł `catalog.ts` scala oba).

## Wejście (co przeczytano)

**Artefakty poprzednich faz (priory zweryfikowane w kodzie, nie kopiowane na wiarę):**
- `04-strategize-core-domain-chart.md` — #5 = **core** (high complexity grafowa + zwalidowane różnicowanie),
  #4 = **supporting**; fork/dwuwłasność katalogu (#4) = **core-adjacent** (błąd podkopuje rdzeń).
- `05-connect-context-map.md` — `catalog-skill` §2.3 (**Conformist-gwiazda**: Supplier/U dla programming,
  workout-logging, advancement, analytics, retention); **core-adjacent** (§2, struktura #5 z rygorem rdzenia);
  **straddle „Rozwój"** (skill-tree.ts czyta read-model advancement); `PROPOZYCJA:` skill-structure (§6, H5).
- `06-organise-wlasnosc-modulow.md` — **moduł-dostawca**; kernel wewnętrzny (H4); **punkt kolaboracji aktora**
  (Prezes spina `brand-platform` z autoringiem `catalog-skill`, H6 — nie cross-write); struktura #5 = owned-core.
- `07-define/advancement.md` (sąsiad-rdzeń, ZWALIDOWANY) — Komunikaty OUT + hot-spot #1 (bug 404 na globalnej
  umiejętności = dług advancement), hot-spot #5 (rozcięcie H5). `07-define/retention.md` (ZWALIDOWANY) —
  `catalog-skill` jako downstream upstream (retention czyta `exercises.name/unit` jako Conformist/D).
- `glosariusz.md` — Biblioteka ćwiczeń/umiejętności, Efektywna biblioteka, Globalne vs własne, Fork/„Dostosuj",
  Umiejętność, Wariant, Drabina wariantów, Drzewo/DAG, Stan węzła, `promoteTrainerCatalogToBrand` (do usunięcia).
- `SZABLON-artefaktu.md`, `07-define/README.md` (kolejność core-first).

**Kod (czytany dokładnie, z dowodami `file:line`):**
- `app/lib/catalog.ts` (God-moduł, 343 linie) — `effectiveExerciseWhere` (:29), `effectiveSkillWhere` (:66),
  `resolveCatalogOrgId` (:89), `fileIsBrandDemoInOrg` (:108), `forkExercise` (:133), `forkSkill` (:207, deep
  clone), `promoteTrainerCatalogToBrand` (:309, bootstrap), `forkedExerciseOriginIds` (:16),
  `forkedSkillOriginIds` (:53), `isBrandOwned` (:48), `CatalogError` (:6).
- `app/lib/catalog-math.ts` — `suppressForkedOrigins` (:4, martwy w prod), `exerciseAlreadyVariationInView`
  (:12), `planSkillClone` (:32).
- `app/lib/skills.ts` (#5 CRUD trenera) — `listSkillsForTrainer` (:31), `getSkillWithVariations` (:81),
  `createSkill` (:120), `updateSkill` (:140), `archiveSkill` (:160), `findSkillForExercise` (:190),
  `addVariation` (:218), `removeVariation` (:292), `reorderVariations` (:354), `listAssignableExercises` (:404),
  `listExerciseSkillMap` (:433), `addPrerequisite` (:495), `removePrerequisite` (:522), `SkillError` (:13).
- `app/lib/skill-tree.ts` — read-model drzewa: `getSkillTreeForTrainer` (:74, bez konsumenta produkcyjnego),
  `getSkillTreeForTrainee` (:94, **straddle** → `getSkillMapForTrainee` :103); `loadGraph` (:33).
- `app/lib/skill-tree-math.ts` — kernel grafowy (H4): `NodeState` (:3), `wouldCreateCycle` (:25),
  `assignLayers` (:41), `nodeState` (:73), `layoutNodes` (:84), `topoOrder` Kahn (:106).
- `app/lib/brand-catalog.ts` (autoring globalny Prezesa, H6) — pełny CRUD ćwiczeń/umiejętności/wariantów/prereków
  markowych + `getBrandSkillTree` (:668); reużywa `skill-tree-math` (:4); `BrandCatalogError` (:7).
- `app/lib/categories.ts` (#4 kategorie) — `normalizeCategoryName` (:8), `listCategoriesForTrainer` (:14),
  `addCategory` (:34), `deleteCategory` (:58), `filterToKnownCategoryNames` (:70).
- `app/lib/exercises.ts` — **wyłącznie** `normalizeTags` (:2) — trener CRUD ćwiczeń jest INLINE w trasach.
- `app/lib/db/schema.ts` — `exercises` (:220-261), `exerciseCategories` (:269-284), `skills` (:594-635),
  `skillVariations` (:637-660), `skillPrerequisites` (:698-735); FK-e do `skillAdvancements` (:662-696,
  należy do advancement).
- Trasy: `trener/biblioteka.{_index,nowe,$exerciseId}.tsx`, `trener/umiejetnosci.{_index,nowa,$skillId}.tsx`,
  `marka/biblioteka.{_index,nowe,$exerciseId}.tsx`, `marka/umiejetnosci.{_index,nowa,$skillId}.tsx`,
  konsumenci `trener/podopieczni.$traineeId.rozwoj._index.tsx`, `podopieczny/rozwoj._index.tsx`,
  `components/skill-tree.tsx`; reverse-peek `files.$fileId.tsx`. `app/lib/authz.ts` (`canReadCatalogRow`).

**Silnik jakości (CIĘŻKA, §7 planu):** fan-out **10 agentów** wypełniło dziesięć pól kanwy z kodu z dowodami →
**adwersaryjna weryfikacja per twierdzenie** (jeden sceptyk na każde twierdzenie, każdy MUSIAŁ otworzyć cytowany
plik; twierdzenia o *braku* sprawdzane grepem) + krytycy kompletności. **244 agentów łącznie** (pierwszy przebieg
przerwany limitem sesji, wznowiony z cache). Wynik: **167 CONFIRMED, 55 PARTIAL, 0 REFUTED**; 8 twierdzeń
GRANICZNYCH + 4 krytyków padło na limit sesji — **zweryfikowane ręcznie przez bezpośrednie czytanie kodu i grep
(wszystkie 8 potwierdzone)**. Kluczowe doprecyzowania z weryfikacji (wchłonięte niżej): dwa światy są
**SPRZĘGNIĘTE** (wariant=ćwiczenie, `skill_variations.exercise_id → exercises` RESTRICT), nie rozłączne;
`skill_advancements → skills` to **CASCADE**, `→ skill_variations` **RESTRICT**; H4 jest prawdą dla importów
**runtime** (4. importer `skill-tree.tsx` bierze tylko `type NodeState`); zapis do `exercises` **nie** jest w
całości inline w trasach (fork w `catalog.ts`, autoring markowy w `brand-catalog.ts`); `normalizeTags`,
`suppressForkedOrigins`, `getSkillTreeForTrainer` są **martwe/bez konsumenta produkcyjnego**; etykieta
`promoteTrainerCatalogToBrand` „do usunięcia" żyje w **glosariuszu DDD**, nie w kodzie.

---

## Ustalenia — Bounded Context Canvas

### 1. Strategic Classification

| Wymiar | Wartość (dowód) |
|---|---|
| **Typ domeny** | **SUPPORTING hostujący CORE-ADJACENT.** Granica kontekstu obejmuje płaski słownik #4 (supporting) i graf umiejętności #5 (**core** wg F4, tu z rygorem rdzenia). Etykieta supporting/core-adjacent pochodzi z **osądu strategicznego F4/F5** (waga inwestycji), nie z samych linii kodu — kod dowodzi *rygoru inżynierskiego* struktury #5, nie taksonomii. |
| **Model biznesowy** | **Brak BEZPOŚREDNIEGO moatu — SUBSTRAT rdzenia + nośnik aspiracji marki.** Kontekst definiuje wyłącznie **STRUKTURĘ**; wartościowe ZDARZENIA awansu (`skill_advancements`) należą do `advancement` i FK-ują W GÓRĘ do `skills`/`skill_variations` (`schema.ts:672-680`). Nosi aspirację marki przez autoring globalnego katalogu Prezesa (`brand-catalog.ts`, H6). Struktura #5 dostaje **rygor rdzenia**. |
| **Ewolucja / dojrzałość** | **Custom-built.** God-moduł `catalog.ts` łączy oba światy; ręcznie napisany kernel grafowy `skill-tree-math` w czystym TS (0 bibliotek grafowych — `package.json` grep `graphlib\|dagre\|d3-dag\|elkjs\|cytoscape` = 0); bespoke schemat Drizzle (owner-check XOR, partial-unique, self-FK). Własność (F6): **moduł-dostawca**. |

**Dlaczego core-adjacent (rygor rdzenia struktury #5) — dowody:**
- **Kernel grafowy wysokiego rzędu.** `skill-tree-math` implementuje 4-stanową maszynę węzła `nodeState`
  (`skill-tree-math.ts:73`, typ 4-wartościowy `:3`), iteracyjny **DFS cycle-guard** `wouldCreateCycle` (`:25`),
  **sort topologiczny Kahna** `topoOrder` (`:106`) i **warstwy = najdłuższa ścieżka** `assignLayers`/`layoutNodes`
  (`:41`/`:84`). To nietrywialna algorytmika, nie CRUD.
- **Nietrywialne inwarianty DB + repo.** owner-check XOR (`schema.ts:625`), acykliczność DAG w repo (Postgres
  nie ma constraintu DAG — `schema.ts:723`), fork idempotentny+race-safe (`catalog.ts:289`), głęboki klon
  drabiny w jednej transakcji (`catalog.ts:207-283`).

**Dlaczego NIE czysty core — dowody:**
- **Granica biegnie przez God-moduł.** `catalog.ts` operuje jednocześnie na płaskim #4 (`effectiveExerciseWhere`
  :29, `forkExercise` :133) i grafowym #5 (`effectiveSkillWhere` :66, `forkSkill` :207); `promoteTrainerCatalogToBrand`
  (:309) mutuje `exercises`+`skills`+`skill_prerequisites` w jednej transakcji. → `PROPOZYCJA:` rozcięcia H5.
- **Świat #4 to commodity słownik.** Płaski wiersz `exercises` (name/unit/description/tags/tracks_rpe/demo_file_id
  — `schema.ts:233-238`) bez algorytmiki; rozcieńcza rdzeniowość kontekstu jako całości. *(Uwaga: `catalog-math.ts`
  NIE scala obu światów — w produkcji konsumowane są tylko helpery #5, `planSkillClone` :32 i
  `exerciseAlreadyVariationInView` :12; `suppressForkedOrigins` :4 jest martwy.)*

### 2. Ubiquitous Language / model domenowy

> Kanwa rozdziela **dwa światy**. „Globalne" = kanoniczny termin F2 (kod: markowe, `trainer_id NULL` +
> `organization_id`); „markowe" pozostaje w cytatach kodu jako stan-JEST.

**Świat #4 — Biblioteka ćwiczeń (płaski słownik):**

| Pojęcie (PL) | Reprezentacja w kodzie | Dowód |
|---|---|---|
| **Biblioteka ćwiczeń** | tabela `exercises` — płaski wiersz, bez grafu, bez kolejności | `schema.ts:220,233`; brak `ordinal` w bloku `:223-240` |
| **Ćwiczenie** | wiersz globalny albo trenerski (owner XOR) | `schema.ts:224`; `exercises_owner_check` `:251-255` |
| **Jednostka REPS/SEC** | enum `exerciseUnit`; dla SEC kolumna `reps` fizycznie trzyma sekundy | `schema.ts:31,234`; downstream `wrapped.ts:223-224` |
| **`tracks_rpe`** (bool, default true) | czy logowanie serii prosi o ocenę trudności RPE | `schema.ts:237`; konsument logowania `podopieczny/loguj.$sessionId.tsx:118` |
| **Kategoria / tag** (dwoistość) | swobodny `exercises.tags` (text[] + GIN) na poziomie schematu, ALE zapis kuruje do znanych kategorii; osobna tabela `exercise_categories` per-trener zasila picker + chipy filtra | `schema.ts:236,250,269`; `categories.ts:8,70`; `biblioteka.$exerciseId.tsx:164` |
| **Demo** (`demo_file_id`) | opcjonalna (nullable) referencja do pliku pokazowego; usunięcie pliku zeruje referencję (SET NULL), nie kasuje ćwiczenia | `schema.ts:238` (`onDelete: set null`) |

**Świat #5 — Umiejętności i drzewo (graf DAG):**

| Pojęcie (PL) | Reprezentacja w kodzie | Dowód |
|---|---|---|
| **Biblioteka umiejętności / Umiejętność** | wiersz `skills` (drabina wariantów), byt odrębny od ćwiczenia; globalny albo trenerski | `schema.ts:594,607`; owner XOR `:625-629` |
| **Wariant** (= ćwiczenie na drabinie) | `skill_variations` (skill_id, exercise_id, ordinal); `exercise_id → exercises` **RESTRICT** — wariant JEST ćwiczeniem zaczepionym na ordinalu | `schema.ts:644-646`; UNIQUE(skill_id,exercise_id) `:655` |
| **Drabina wariantów** | uporządkowana sekwencja `ordinal` **1..n bez dziur**; add = MAX+1; usuwanie/reorder = dwufazowe przepakowanie przez ordinale ujemne (bo UNIQUE(skill_id,ordinal) zabrania duplikatów) | `skills.ts:274-278,316-334,383-394`; UNIQUE `schema.ts:654` |
| **Drzewo / DAG prerekwizytów** | skierowany graf **acykliczny** między umiejętnościami; krawędź `skill_id → requires_skill_id` „X wymaga Y" | `schema.ts:709,713`; acykliczność w repo `skill-tree-math.ts:25` |
| **Krawędź „X wymaga Y"** | wiersz `skill_prerequisites`; zdenormalizowany tenant-scope; CHECK `no_self_loop` (tylko pętla własna) | `schema.ts:698,725`; owner XOR `:729` |
| **Stan węzła** (4, per-podopieczny) | EN enum `mastered/in_progress/available/locked` + zamrożone PL etykiety; liczony w porządku **topologicznym** | `skill-tree-math.ts:3,73`; `skill-tree.ts:115-125` |
| **Warstwa** (`layer`) | pozycja = najdłuższa ścieżka w DAG (`assignLayers`) | `skill-tree-math.ts:41,51,84` |
| **Read-model `SkillTree`** | `{ nodes: TreeNode[], edges: Edge[] }` — layout warstw + stany | `skill-tree.ts:27,74,94` |

**Wspólne dla obu światów:**

| Pojęcie (PL) | Reprezentacja w kodzie | Dowód |
|---|---|---|
| **Efektywna biblioteka** | własne ∪ globalne org, **minus** globalne origin już sforkowane (`notInArray`); osobny builder WHERE na świat | `catalog.ts:29-45,66-82`; `skills.ts:48` |
| **Globalne vs własne** | globalne: `trainer_id NULL` + `organization_id`; własne: `trainer_id` + `organization_id NULL`; owner XOR pilnuje jednego właściciela | `schema.ts:251-255,625-629,729-733` |
| **Fork / „Dostosuj" / `origin_id`** | opcjonalny copy-on-write globalnej pozycji na własność trenera; `origin_id → oryginał` (onDelete set null); zamraża snapshot | `catalog.ts:133,207`; `origin_check` `schema.ts:256-259` |
| **Brand-demo** | plik demo globalnego ćwiczenia widoczny dla CAŁEJ organizacji (nie tylko właściciela pliku) — `fileIsBrandDemoInOrg` czytana w autoryzacji serwowania plików | `catalog.ts:108-126`; `files.$fileId.tsx:51` |
| **Bootstrap promocji** (`promote…`) | in-place UPDATE `trainer_id → NULL` własnego niesforkowanego kanonu foundera; żywy w seed/itest; w **glosariuszu DDD** oznaczony „do usunięcia" (nie w kodzie) | `catalog.ts:309-333`; `scripts/seed.ts:124`; `glosariusz.md:41` |

### 3. Odpowiedzialności

**Świat #4 (biblioteka ćwiczeń):**
1. **CRUD ćwiczeń trenera — INLINE w akcjach tras** (asymetria wobec `skills.ts`): create
   (`biblioteka.nowe.tsx:77`), save/archive/unarchive własnego wiersza (`biblioteka.$exerciseId.tsx:194,133,141`);
   repo `exercises.ts` ma tylko `normalizeTags` (:2, w dodatku nieimportowany → martwy).
2. **Kategorie ćwiczeń** (per-trener): dodawanie/usuwanie/normalizacja/filtr do znanych — `categories.ts:34,58,8,70`.
3. **Inwariant biblioteka↔drzewo:** blokuje archiwizację ćwiczenia będącego wariantem AKTYWNEJ umiejętności
   (`findSkillForExercise`/`findBrandSkillForExercise`) — `skills.ts:190`, `brand-catalog.ts:335`; call-site
   trenera `biblioteka.$exerciseId.tsx:120`, marki `marka/biblioteka.$exerciseId.tsx:67`.

**Świat #5 (umiejętności i drzewo):**
4. **CRUD umiejętności/wariantów/prereków trenera** (pełne repo): `createSkill`/`updateSkill`/`archiveSkill`
   (`skills.ts:120,140,160`), `addVariation`/`removeVariation`/`reorderVariations` (`:218,292,354`),
   `addPrerequisite`/`removePrerequisite` (`:495,522`).
5. **Egzekwuje ACYKLICZNOŚĆ DAG w repo** (`wouldCreateCycle` DFS, bo Postgres nie ma constraintu DAG) — przy
   dodaniu krawędzi i przy liście przypisywalnych; **w DWÓCH repo**: `skills.ts:508,575` i `brand-catalog.ts:578,658`.
6. **Utrzymuje ciągłość ordinali 1..n** (dwufazowe przepakowanie) — `skills.ts:316-334,383-394`.
7. **Guard „≤1 umiejętność/ćwiczenie w EFEKTYWNYM widoku"** (w repo, nie globalny UNIQUE) —
   `skills.ts:251-272` (`exerciseAlreadyVariationInView` `catalog-math.ts:12`).
8. **Read-model drzewa** (layout warstw + stany węzłów w topo) — `skill-tree.ts:74,94` (`getSkillTreeForTrainer`
   bez konsumenta produkcyjnego, pokryty tylko testami).

**Wspólne:**
9. **Oblicza EFEKTYWNĄ bibliotekę** (własne ∪ globalne org minus sforkowane origin) — dwa buildery WHERE
   `effective*Where` + listy `forked*OriginIds` — `catalog.ts:29,66,16,53`.
10. **Fork copy-on-write obu światów** — `forkExercise` (shallow #4, `catalog.ts:133`), `forkSkill` (deep #5:
    skill + warianty + krawędzie prereq w jednej tx przez `planSkillClone`, `catalog.ts:207-283`).
11. **Autoring GLOBALNY Prezesa (H6)** — pełny CRUD obu światów + drzewo dla katalogu markowego org —
    `brand-catalog.ts` (oba światy, `getBrandSkillTree` :668).
12. **Reguła brand-demo dla plików** (`fileIsBrandDemoInOrg`, `catalog.ts:108`) i **org-resolve podopiecznego**
    (`resolveCatalogOrgId`, `catalog.ts:89`) — obie czytane spoza kontekstu (files, trasy Rozwoju).

**Świadomie NIE są odpowiedzialnością tego kontekstu** (dowód granicy):
- **Zapis ZDARZEŃ awansu** (`skill_advancements`) → `advancement`; jedyny `insert(skillAdvancements)` żyje w
  `skill-progression.ts:255`, nigdzie w plikach catalog-skill (write-seam).
- **Progresja / Rekord / plateau** → `analytics` (tylko czyta strukturę katalogu po FK).
- **Kompozycja planu** → `programming` (`plan_items.exercise_id → exercises` RESTRICT, `schema.ts:364`; struktura
  jest tylko upstream, `skill_variations` NIE jest FK-czytana przez plany).
- **Przechowywanie blobów / podpis URL** → `files` (katalog trzyma tylko `demo_file_id` + regułę widoczności).
- **Walidacja formularza + mapowanie null→404** → warstwa trasy (repo zwraca null / rzuca `CatalogError`/`SkillError`).

### 4. Komunikaty IN (kto woła → co)

**Komendy #4 — trener (akcje tras, `role=trainer`):**

| Komenda | Intencja / dowód |
|---|---|
| create ćwiczenia (**inline** `tx.insert(exercises)`) | `biblioteka.nowe.tsx:77` (action) |
| save ćwiczenia (**inline** `update`) | `biblioteka.$exerciseId.tsx:194` (default intent) |
| archive / unarchive (**inline**) | `biblioteka.$exerciseId.tsx:133`/`:141` (intent `archive`/`unarchive`) |
| `forkExercise` („Dostosuj") | intent `fork` — `biblioteka.$exerciseId.tsx:92` |
| `addCategory` / `deleteCategory` | trasa biblioteki (`categories.ts:34,58`) |

> **Read-only globalnych egzekwowane w trasie:** `biblioteka.$exerciseId.tsx:103` — każdy zapisujący intent na
> wierszu markowym (`target.trainerId == null`) → **404**; edycja tylko przez fork. Odczyt autoryzuje
> `canReadCatalogRow` (`authz.ts`, `:56`).

**Komendy #5 — trener (`skills.ts`, `role=trainer`):** `createSkill`/`updateSkill`/`archiveSkill`,
`addVariation`/`removeVariation`/`reorderVariations`, `addPrerequisite`/`removePrerequisite`, `forkSkill` —
wołane z `umiejetnosci.{nowa,$skillId}.tsx`.

**Komendy — Prezes / marka (H6, `role=brand_admin`, org-scoped):** `createBrandExercise`/`updateBrandExercise`/
`archiveBrandExercise`/`restoreBrandExercise` (`marka/biblioteka.{nowe,$exerciseId}.tsx:69,…,78`),
`createBrandSkill`/`updateBrandSkill`/`archiveBrandSkill`, `addBrandVariation`/`removeBrandVariation`/
`reorderBrandVariations` (`marka/umiejetnosci.$skillId.tsx:79`), `addBrandPrerequisite`/`removeBrandPrerequisite`.
Koperta: `requireUser(role: brand_admin)` na każdym loaderze/akcji CZYTAJĄCEJ/PISZĄCEJ katalog + guard
`user.organizationId → 404` (`marka/*`), a `brand-catalog.ts` pisze **własne** tabele katalogu jako wiersze
markowe (`trainer_id NULL` + `organization_id`: `brand-catalog.ts:91,269,447,582`) — **nie** tabele brand-platform.

**Zapytania (read-model wołany z zewnątrz):** `listSkillsForTrainer`, `getSkillWithVariations`,
`listAssignableExercises`, `listExerciseSkillMap` *(używany do WYKLUCZANIA wariantów z listy Progresji; docstring
o „chipie" jest przestarzały — `skills.ts:433`)*, `listAssignablePrerequisites`/`listPrerequisitesForSkill`,
`getSkillTreeForTrainee` (konsumowany), `getSkillTreeForTrainer` (**bez konsumenta produkcyjnego**), biblioteka
list (efektywna, `biblioteka._index.tsx:80`); po stronie marki: `getBrandExercise`, `listBrandExercises`,
`getBrandSkillWithVariations`, `listBrandSkills`, `listAssignableBrandExercises`, `getBrandSkillTree`.

**Zdarzenia IN:** **brak.** Trasy katalogowe nie subskrybują żadnej szyny; brak prymitywów zdarzeń w `app/`
(`eventBus\|domainEvent\|EventEmitter\|.subscribe(` = 0). Tylko loadery/akcje RR7 (pull).

### 5. Komunikaty OUT (co → do kogo)

**(A) `catalog-skill` jako Supplier/U — Conformist-gwiazda (kto czyta jego tabele WPROST po FK-id, bez ACL):**

| Odbiorca (kontekst) | Co czyta / dowód |
|---|---|
| **`programming`** (#7) | `plan_items.exercise_id → exercises` RESTRICT (`schema.ts:364`); `plans.ts` waliduje tenant-scope po `exercises.trainer_id` (`:301-303`) *(w `saveDraftPlan`, nie publish; tylko wiersze WŁASNE trenera)* |
| **`workout-logging`** (#8) | `workout_exercise_logs.exercise_id → exercises` RESTRICT (`schema.ts:420-422`); `workouts.ts` czyta name/unit (`:521-526`) i name/unit/tracks_rpe z planu (`:259-264`) |
| **`advancement`** (#6) | `skill_advancements.skill_id → skills` **CASCADE**, `from/to_variation_id → skill_variations` **RESTRICT** (`schema.ts:674-680`); read-model czyta name/unit z `skills⋈skill_variations⋈exercises` (`skill-progression.ts:65-70`) |
| **`analytics`** (#11) | `stats.ts`/`progression.ts` innerJoin `exercises` → name/unit/tags (`stats.ts:463,475,776,1096`; `progression.ts:58,71`) |
| **`retention`** (#12) | `wrapped.ts` innerJoin `exercises` → name/unit + agregaty reps/sec po `exercises.unit` (`:223,273,282`) |

Krawędzie chronione **FK RESTRICT** — struktura jest niekasowalna spod konsumenta (`schema.ts:366,422,646,677`).

**(B) STRADDLE „Rozwój" — `catalog-skill` jako Customer/D wobec `advancement`:** `getSkillTreeForTrainee`
(∈ catalog-skill) importuje i woła `getSkillMapForTrainee` z `skill-progression` (advancement) — `skill-tree.ts:4,103`.
To **jedyna** krawędź READ-u read-modelu w drugą stronę. *(Poza read-modelem istnieją dwa dodatkowe sprzężenia
zwrotne po NAZWIE tabeli w handlerach FK RESTRICT: `skills.ts:339` i `brand-catalog.ts:513` łapią błąd
`skill_advancements` — reakcja na blokadę, nie odczyt danych.)*

**(C) `files` reverse-peek — files WOŁA catalog-skill:** `files.$fileId.tsx:6,46,51` importuje i woła
`resolveCatalogOrgId` + `fileIsBrandDemoInOrg` (def `catalog.ts:89,108`) w ścieżce autoryzacji dostępu do pliku.

**(D) Dane wystawiane (Supplier):** read-model `SkillTree` (`getSkillTreeForTrainer`/`getSkillTreeForTrainee`,
`skill-tree.ts:74,94`) konsumowany przez trasy Rozwoju (`podopieczni.$traineeId.rozwoj._index.tsx:44`,
`podopieczny/rozwoj._index.tsx:48`) i komponent prezentacyjny `skill-tree.tsx` (tylko typy).

**Zdarzenia OUT:** **brak.** Żaden plik catalog-skill nie emituje zdarzeń (grep `emit\|outbox\|eventBus\|
dispatchEvent\|domainEvent\|EventEmitter` w 8 plikach = 0). Komunikacja OUT WYŁĄCZNIE przez współdzieloną DB (FK)
i synchroniczne wywołania.

### 6. Zależności + tryb (per krawędź, z F5/F6, potwierdzony kierunek w kodzie)

| Sąsiad | Wzorzec | Kierunek | Mechanizm (dowód) |
|---|---|---|---|
| **`brand-platform`** (#2+#3) | Customer/Supplier (**punkt kolaboracji aktora**, H6) | catalog-skill=**D** (org=kotwica) / autoring=własna powierzchnia | globalne wiersze kotwiczą org: `organization_id → organizations` **RESTRICT** (`schema.ts:226,600,705`); Prezes spina governance z autoringiem, `brand-catalog.ts` ∈ catalog-skill (wołany z 6 tras `marka/*`) — **nie** cross-write |
| **`files`** (#15) | Customer/Supplier (dwukierunkowa) | catalog-skill=**D** dla demo / **U** dla reguły brand-demo | `demo_file_id → files` set null (`schema.ts:238`); ORAZ `files.$fileId.tsx` woła `fileIsBrandDemoInOrg` (reverse-peek, `:51`) |
| **`advancement`** (#6) | Conformist (DWIE krawędzie) | catalog-skill=**U** (struktura) / **D** (straddle) | struktura czytana przez FK (`schema.ts:674-680`); straddle: `skill-tree.ts:103` woła `getSkillMapForTrainee` |
| **`programming`/`workout-logging`/`analytics`/`retention`** | Conformist-gwiazda | catalog-skill=**U**, downstream=**D** | czytają `exercises`/`skills`/`skill_variations` WPROST po FK-id; RESTRICT chroni krawędź (§5-A) |
| **kręgosłup tenancy** (`identity`, Published Language H8) | Conformist | catalog-skill=**D** | `exercises`/`skills`/`skill_prerequisites`: `trainer_id → users` cascade (nullable) + `organization_id → organizations` restrict + owner XOR (`schema.ts:225,599,704`); `skill_variations` dziedziczy scope tranzytywnie (brak własnych kolumn tenant); `exercise_categories` trainer-only bez org. **404-nie-403** (fork zwraca null → trasa 404, `catalog.ts:151`; `files.$fileId.tsx:53`) |

**Tryb własności (F6):** **moduł-dostawca** — kontrakt na zewnątrz czytany wprost przez downstream Conformist;
**kernel wewnętrzny** `skill-tree-math` (H4 — importowany **runtime** tylko przez `skills.ts:11`, `skill-tree.ts:12`,
`brand-catalog.ts:4`; `skill-tree.tsx:6` bierze tylko `type NodeState`; NIE przecina granic kontekstu); **własna
powierzchnia autoringu markowego** (H6). Kontekst **nie pisze** do żadnej tabeli spoza własnych
(exercises/skills/skill_variations/skill_prerequisites/exercise_categories).

### 7. Reguły / decyzje (z dowodem)

- **R1. Owner XOR.** Każdy wiersz (`exercises`/`skills`/`skill_prerequisites`) ma DOKŁADNIE jednego właściciela:
  globalny (`trainer_id NULL ∧ org NOT NULL`) albo trenerski (`trainer_id NOT NULL ∧ org NULL`). —
  `schema.ts:251-255,625-629,729-733`
- **R2. Fork tylko na wierszu trenerskim.** `*_origin_check`: `origin_id IS NULL OR trainer_id IS NOT NULL` —
  globalny oryginał nie może być forkiem. — `schema.ts:256-259,630-633`
- **R3. Efektywna biblioteka** = własne ∪ globalne org **minus** sforkowane origin (`notInArray`); współdzielony
  builder WHERE (osobny na świat) reużywany przez zapytania listowe; single-row fetch-by-id ma własny inline check
  scope (`getSkillWithVariations`). — `catalog.ts:29-45,66-82`; `skills.ts:81-96`
- **R4. Globalne READ-ONLY dla trenera, fork OPCJONALNY.** Mutacje umiejętności filtrują `eq(trainer_id)` (markowe
  nie wpadną: cicho no-op w `updateSkill:151`/`archiveSkill:165`, rzucają `SkillError` w `addVariation:231`); a
  markowe ćwiczenie można WPROST dodać jako wariant własnej umiejętności bez forka (`skills.ts:240`). Fork
  wymagany tylko do MODYFIKACJI globalnej pozycji in-place. — `skills.ts:151,224-231,240`
- **R5. Fork idempotentny i race-safe.** unikat `(trainer_id, origin_id)` + szybka ścieżka `findForkId`; po kolizji
  23505 klasyfikacja po nazwie indeksu i ponowny odczyt kanonicznego forka. — `schema.ts:249,624`;
  `catalog.ts:179-182,289-292`
- **R6. Fork zamraża snapshot.** Klon kopiuje pola treści, WSPÓŁDZIELI `demo_file_id` (referencja, nie kopia —
  `catalog.ts:169`), `origin_id` onDelete **set null** (usunięcie oryginału osieroca fork, nie kasuje). —
  `catalog.ts:160-169`; `schema.ts:230-232,604-606`
- **R7. `forkSkill` = GŁĘBOKI klon w jednej transakcji.** Klonuje warianty (te same ordinale/ćwiczenia) i
  **wychodzące** krawędzie prereq (origin jako zależny), podmieniając origin skillId → nowe id (`planSkillClone`);
  klony wskazują ORYGINALNE (globalne) ćwiczenia i wymagane umiejętności (bez kaskadowego forka sąsiadów). —
  `catalog.ts:207-283`; `catalog-math.ts:32-47`
- **R8. Ordinale 1..n bez dziur.** Nowy = MAX+1; usuwanie/reorder dwufazowo przez ordinale ujemne (by nie złamać
  UNIQUE(skill_id,ordinal)). Ciągłość utrzymuje repo, nie DB (UNIQUE zabrania tylko duplikatów). —
  `skills.ts:274-278,316-334,383-394`; `schema.ts:654`
- **R9. Acykliczność DAG w REPO, nie w DB.** `wouldCreateCycle` (DFS) przy dodaniu krawędzi i liście
  przypisywalnych, w DWÓCH repo (`skills.ts:508,575`; `brand-catalog.ts:578,658`); Postgres pilnuje tylko
  `no_self_loop`. — `skill-tree-math.ts:25`; `schema.ts:723-728`
- **R10. Guard „≤1 umiejętność/ćwiczenie w EFEKTYWNYM widoku"** egzekwowany w repo (`exerciseAlreadyVariationInView`),
  bo globalny `UNIQUE(exercise_id)` **NIE ISTNIEJE** (byłby błędny przy katalogu markowym + forkach); tylko ścieżka
  trenera. — `skills.ts:251-272`; `catalog-math.ts:12`; `schema.ts:651-653`
- **R11. Brak globalnego `UNIQUE(exercise_id)`** na `skill_variations` — jedyne unikaty to `(skill_id, ordinal)` i
  `(skill_id, exercise_id)`. — `schema.ts:654-658`
- **R12. Wariant = ćwiczenie:** `skill_variations.exercise_id → exercises` onDelete **RESTRICT**. —
  `schema.ts:644-646`
- **R13. 4 stany węzła w porządku TOPO:** `available/locked` zależą od tego, czy WSZYSTKIE bezpośrednie prereki
  są `mastered`. — `skill-tree-math.ts:73-77,106-131`; `skill-tree.ts:115-125`
- **R14. Archiwizacja umiejętności USUWA krawędzie prereq** (jako zależnej i jako prereka) w tej samej transakcji —
  `skills.ts:160-181`; `brand-catalog.ts:297-329`.
- **R15. Wariant użyty w historii awansów jest niekasowalny** (FK RESTRICT `skill_advancements.from/to_variation_id`)
  → przyjazny błąd „zarchiwizuj umiejętność zamiast tego". — `schema.ts:675-680`; `skills.ts:339-345`;
  `brand-catalog.ts:513-518`
- **R16. Globalne umiejętności BEZ unikatu nazwy** (brak indeksu `(organization_id, name)`) — `createBrandSkill`
  celowo pomija catch duplikatu (przyszła decyzja). — `brand-catalog.ts:257-259,261-272`
- **R17. Unikat nazwy umiejętności trenera jest CZĘŚCIOWY** (`WHERE archived_at IS NULL`) — po archiwizacji nazwa
  wraca do puli. — `schema.ts:613-617`; `skills.ts:133-137`
- **R18. `promoteTrainerCatalogToBrand` = jednorazowy BOOTSTRAP** (in-place UPDATE `trainer_id → NULL` bez zmiany
  id; ćwiczenia/umiejętności tylko `origin_id IS NULL`, krawędzie prereq WSZYSTKIE); żywy w seed/itest; w
  glosariuszu DDD „do usunięcia". — `catalog.ts:309-333`; `scripts/seed.ts:124`; `glosariusz.md:41`
- **R19. Efektywne krawędzie drzewa** = własne (∪ markowe org, gdy `organizationId≠null`) → filtr do `activeIds`
  (odrzuca zarchiwizowane i markowe nadpisane forkiem). — `skill-tree.ts:51-65`
- **R20. Podopieczny dziedziczy org (a więc katalog markowy) trenera** — `resolveCatalogOrgId`. — `catalog.ts:89-101`
- **R21. Brand-demo widoczne dla całej org** (`fileIsBrandDemoInOrg`; `null` org → false). — `catalog.ts:108-126`
- **R22. Wariantem nie może zostać ćwiczenie zarchiwizowane** (akcja waliduje `archivedAt` niezależnie od pickera).
  — `skills.ts:247-249`; `brand-catalog.ts:424-429`
- **R23. Nie da się zarchiwizować ćwiczenia będącego wariantem AKTYWNEJ umiejętności** (`findSkillForExercise` →
  nazwa blokującej). — `skills.ts:190-209`; wiring `biblioteka.$exerciseId.tsx:120`
- **R24. `addVariation` wymaga WŁASNEJ umiejętności** (markowe `trainer_id NULL` nie wpadną). — `skills.ts:224-231`
- **R25. Duplikat krawędzi prereq** blokowany unikatem `(skill_id, requires_skill_id)` → przyjazny błąd. —
  `schema.ts:719`; `skills.ts:514-516`; `brand-catalog.ts:589-591`
- **R26. Wyścig na ordinalu** (dwa równoległe `addVariation`) wykrywany kolizją UNIQUE → przyjazny błąd „spróbuj
  ponownie", nie 500. — `skills.ts:280-288`; `brand-catalog.ts:446-465`
- **R27. `skill_prerequisites` niesie ZDENORMALIZOWANY tenant-scope** (jak `skill_advancements`/`workout_logs`) —
  scope krawędzi bez joinu do `skills`. — `schema.ts:702-707`; `skill-tree.ts:51-61`
- **R28. Krawędź prereq wymaga OBU umiejętności własnych/aktywnych markowych tej samej org** (`bothSkillsOwned`/
  `bothBrandSkillsActive`, Set.size===2). — `skills.ts:474-492`; `brand-catalog.ts:543-562`

### 8. Założenia

- **Z1.** Podopieczny w bieżącym modelu danych powstaje **bez własnej org** (`invite.ts:131-138`), a jego efektywny
  katalog markowy = org trenera, bo `resolveCatalogOrgId` (przy pustej własnej org) dogania org po `trainer_id`
  (`catalog.ts:95-100`); trasa Rozwoju dodatkowo wymusza to jawnie (`organizationId: null`, `rozwoj._index.tsx:42-45`).
- **Z2.** „Globalne/markowe" jest w istocie ograniczone do organizacji (`organization_id NOT NULL`), nie prawdziwie
  globalne — przy 1 marce zbiega się w to samo, ale kod zawsze zawęża po `organizationId`. — `schema.ts:226`;
  `catalog.ts:37-38`
- **Z3.** Wariant należy do dokładnie jednej umiejętności w EFEKTYWNYM widoku — założenie egzekwowane guardem repo
  (`skills.ts:251-272`), nie globalnym constraintem DB.
- **Z4.** Integralność ordinali/struktury pochodzi z TEGO kontekstu; downstream (`advancement`) tylko **czyta**
  ordinal, nie weryfikuje ciągłości.
- **Z5.** `demo_file_id` jest współdzieloną referencją między origin a forkiem (referencja, nie kopia) — podmiana
  medium demo origin odbija się na forku. — `catalog.ts:169`; `dep-files-1`
- **Z6.** Idempotencja ≤1-fork-na-origin: composite unique `(trainer_id, origin_id)` odpala na wierszach-forkach
  (oba pola NOT NULL), a catch-and-reread daje idempotencję; rozróżnialność NULL-i (brak `NULLS NOT DISTINCT`)
  chroni ten indeks przed nadmiernym ograniczaniem wierszy nie-forkowych/markowych. — `schema.ts:246-249,621`;
  `catalog.ts:179-182`
- **Z7.** `organizationId` przekazany do `promote*`/autoringu musi być realną org — odpowiedzialność wołającego
  (repo nie egzekwuje aktora Prezes; rola pochodzi z tras `marka/*`).
- **Z8.** Layout drzewa zakłada DAG; `assignLayers` broni się przed nieoczekiwanym cyklem (guard). —
  `skill-tree-math.ts:41`

---

## Hot-spoty / otwarte pytania

> **Decyzje właściciela (checkpoint 2026-07-10):** #1 (rozcięcie God-modułu, H5) → **otwarta `PROPOZYCJA:`,
> rozstrzygnięcie należy do fazy architektury** (jak w `advancement`/`retention`; kanwa niczego nie przesądza).
> #2–#7 (bug-404 = dług advancement; God-moduł; martwy/bez-konsumenta kod; `promoteTrainerCatalogToBrand` do
> usunięcia; write-seam po nazwie tabeli; asymetria #4↔#5) → **dług reimplementacji — bez zmian w kodzie teraz.**

1. **`PROPOZYCJA:` rozcięcie God-modułu (H5).** `catalog.ts` fizycznie scala świat #4 (`effectiveExerciseWhere`,
   `forkExercise`) i #5 (`effectiveSkillWhere`, `forkSkill`), a `promoteTrainerCatalogToBrand` mutuje obie w jednej
   tx. `PROPOZYCJA:` (F5 §6) wydzielić **`skill-structure`** (#5, czysty core z kernelem grafowym) od
   **`exercise-catalog`** (#4, supporting). Proposal opiera się na `catalog.ts` (NIE na `catalog-math.ts`, który
   w prod niesie tylko logikę #5). — `catalog.ts:29,207,309`
2. **Bug 404 przy awansie na GLOBALNEJ umiejętności — DŁUG advancement (potwierdzony, NIE naprawiać tutaj).**
   `getSkillMapForTrainee` filtruje `skills.trainer_id = trainerId` (`skill-progression.ts:55`), więc globalne
   (`trainer_id NULL`) umiejętności nie trafiają do read-modelu awansu wołanego przez `skill-tree` → 404. Filtr
   leży w `advancement`, nie w `catalog-skill` — spójne z hot-spotem #1 kanwy `advancement` (zaksięgowane jako dług).
3. **God-moduł `catalog.ts` = najwyższy cognitive load w mapie** — 343 linie, oba światy, oba forki, org-resolve,
   reguła brand-demo, bootstrap promocji. Kandydat #1 do refaktoru przy rozcięciu H5.
4. **Martwy / bez konsumenta produkcyjnego kod (dług dokumentacyjny/porządkowy):** `normalizeTags` (`exercises.ts:2`,
   0 importerów — trasy używają `filterToKnownCategoryNames`); `suppressForkedOrigins` (`catalog-math.ts:4`, tylko
   test); `getSkillTreeForTrainer` (`skill-tree.ts:74`, tylko testy — trener widzi umiejętności LISTĄ, nie drzewem);
   przestarzały docstring `listExerciseSkillMap` („chip część umiejętności" — realnie WYKLUCZA warianty z listy
   Progresji, pole `skillName` martwe w call-site'ach). — `skills.ts:433`
5. **`promoteTrainerCatalogToBrand` = do usunięcia** (kanon glosariusza #13/F2) — bootstrap seed, w reimplementacji
   Prezes autoruje bibliotekę marki wprost. Żywy w `scripts/seed.ts:124` + itest. Potwierdzić usunięcie w reimpl.
6. **`PROPOZYCJA:` write-seam po nazwie tabeli.** `skills.ts:339` i `brand-catalog.ts:513` twardo kodują string
   `skill_advancements` w handlerze błędu FK RESTRICT (reakcja na blokadę advancement) — kruchy coupling po nazwie.
   Do rozważenia w reimplementacji (nie odczyt danych, więc nie łamie write-seam, ale wiąże po literale).
7. **Asymetria #4↔#5 (obserwacja, nie bug):** #5 ma pełne repo `skills.ts`, #4 CRUD ćwiczeń jest INLINE w trasach
   (`exercises.ts` = tylko `normalizeTags`), a zapis do `exercises` rozproszony: forma trenera (trasy),
   fork/suppression (`catalog.ts:159,316`), autoring markowy (`brand-catalog.ts`). Do ujednolicenia przy rozcięciu H5.

---

## Zmiany w glosariuszu

Kanwa **nie wprowadza** nowych bytów domenowych — potwierdza i uściśla istniejące (Biblioteka ćwiczeń/umiejętności,
Efektywna biblioteka, Fork/origin_id, Umiejętność, Wariant, Drabina, Drzewo/DAG, Stan węzła). Kandydaci do
dopisania/uściślenia w `glosariusz.md` **po walidacji**:
- **Dwa światy SPRZĘGNIĘTE (nie rozłączne)** — #4 płaski słownik ⟂ #5 graf DAG, ale `skill_variations.exercise_id →
  exercises` RESTRICT sprzęga je (wariant = ćwiczenie); graf umiejętności stoi NA słowniku ćwiczeń.
- **God-moduł `catalog.ts`** — najwyższy cognitive load; `PROPOZYCJA:` rozcięcie `skill-structure` (#5) od
  `exercise-catalog` (#4).
- **Kernel wewnętrzny `skill-tree-math` (H4)** — importowany **runtime** tylko wewnątrz catalog-skill (4. importer
  `skill-tree.tsx` = `type NodeState`).
- **Write-seam struktura ⟂ zdarzenia** — catalog-skill definiuje STRUKTURĘ (exercises/skills/skill_variations/
  skill_prerequisites); advancement zapisuje ZDARZENIA; jedyny `insert(skill_advancements)` = `skill-progression.ts:255`.
- **`skill_advancements → skills` CASCADE, `→ skill_variations` RESTRICT** — doprecyzowanie onDelete (istotne dla
  niekasowalności wariantu użytego w historii, R15).
- **Martwy/bez-konsumenta kod** (`normalizeTags`, `suppressForkedOrigins`, `getSkillTreeForTrainer`, docstring
  `listExerciseSkillMap`) — do rejestru długów.

## Stan i następny krok (handoff)

- **Ustalono (DRAFT):** kompletna Bounded Context Canvas `catalog-skill` — klasyfikacja strategiczna (supporting
  hostujący core-adjacent #5, moduł-dostawca), ubiquitous language (dwa światy + wspólne, ~24 pojęcia),
  12 odpowiedzialności + granice, komunikaty IN (trener #4 inline + #5 repo + Prezes/marka H6; ~20 komend + zapytania;
  0 zdarzeń), komunikaty OUT (Conformist-gwiazda Supplier/U do 5 kontekstów + straddle Customer/D + files reverse-peek;
  0 zdarzeń), 5 krawędzi zależności z trybem, 28 reguł, 8 założeń — każde z dowodem `file:line`. Zweryfikowane
  fan-outem + adwersaryjną weryfikacją per twierdzenie (**167 CONFIRMED, 55 PARTIAL, 0 REFUTED**; 8 twierdzeń
  granicznych + 4 krytyków padło na limit sesji → **zweryfikowane ręcznie z kodu, wszystkie potwierdzone**). PARTIAL
  to doprecyzowania (wchłonięte).
- **Zwalidowane przez właściciela (2026-07-10):** kanwa oddaje stan-JEST → status **ZWALIDOWANY**. Decyzje
  checkpointu: rozcięcie God-modułu (#1, H5) → **otwarta `PROPOZYCJA:`** do fazy architektury (kanwa nic nie
  przesądza); bug-404 (#2, dług advancement), God-moduł (#3), martwy/bez-konsumenta kod (#4), `promote` do usunięcia
  (#5), write-seam po nazwie tabeli (#6), asymetria #4↔#5 (#7) → **dług reimplementacji, bez zmian w kodzie teraz.**
- **Co czyta następna faza (F7 · kontekst #4 `brand-platform`):** tę kanwę jako sąsiada — zwłaszcza **H6** (autoring
  globalnego katalogu przez Prezesa żyje w `brand-catalog.ts` ∈ catalog-skill, **punkt kolaboracji aktora**, nie
  cross-write) oraz krawędź **org=kotwica tenancy** (`organization_id → organizations` RESTRICT). `brand-platform`
  wystawia governance/tożsamość org; autoring katalogu NIE jest jego odpowiedzialnością.

> Domykając ten kontekst **po walidacji**: `07-define/README.md` → `catalog-skill` ✅ + data; główny `README.md` →
> F7 🟡; wpisy w `glosariusz.md`; przepisanie `next-session-prompt.md` na F7 · kontekst #4 `brand-platform`.
