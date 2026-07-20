# Markowa baza ćwiczeń i umiejętności z dostosowaniem per-trener — design spec

**Status:** Draft — do przeglądu właściciela
**Data:** 2026-06-07
**Epik:** „Platforma marki" — przekształcenie aplikacji w platformę globalnej marki
kalistenicznej (`marka → ambasadorzy → podopieczni`).
**Plasterek:** rozszerzona realizacja #3 („globalne ścieżki umiejętności"). W stosunku
do pierwotnej roadmapy: (1) obejmuje **także ćwiczenia**, nie tylko umiejętności;
(2) złagodzone z „skille tylko od marki" do „**baza od marki + trener może
rozbudowywać i dostosowywać**".
**Bazuje na:** [`2026-06-07-tenancy-marki-fundament-design.md`](2026-06-07-tenancy-marki-fundament-design.md)
(organizacje/regiony/`brand_admin`) oraz [`2026-06-07-i18n-multicurrency-design.md`](2026-06-07-i18n-multicurrency-design.md).

---

## 1. Cel i zakres

### Cel
Każdy trener (ambasador marki) ma od pierwszego dnia widzieć wspólną, „oczywistą"
bazę ~40 ćwiczeń i ~10 umiejętności należącą do marki — bez ręcznego odtwarzania
jej u siebie. Jednocześnie trener może tę bazę **rozbudowywać** (dodawać własne
ćwiczenia/umiejętności) i **dostosowywać** (forkować markowe pozycje na własność,
edytować je u siebie bez wpływu na innych).

### W zakresie
- Przeniesienie własności `exercises` i `skills` (oraz `skill_prerequisites`) z
  „wyłącznie per-trener" na **dwupoziomową**: wiersz **markowy** (`organization_id`)
  albo **trenerski** (`trainer_id`).
- Kolumna `origin_id` (pochodzenie forka) na `exercises` i `skills` — wiązanie klona
  z markowym oryginałem i ukrywanie oryginału w widoku forkującego trenera.
- **Efektywny katalog trenera** = markowe (niesforkowane) ∪ własne — jeden helper
  reużywany przez biblioteki, drzewo umiejętności i progresję.
- Mechanika **copy-on-write** („Dostosuj"): fork ćwiczenia (płytki) i umiejętności
  (głęboki — z drabiną wariantów i krawędziami prerekwizytów).
- UI trenera: badge „Marka" + akcja „Dostosuj" w bibliotece i w authoringu
  umiejętności; markowe pozycje read-only do czasu forka.
- Idempotentny **seed** markowego katalogu + **promocja in-place** istniejącej
  kanonicznej biblioteki/umiejętności obecnego trenera do poziomu marki.

### Poza zakresem (świadome cięcia)
- **Panel prezesa do CRUD katalogu marki** (`/marka`) → plasterek #4. Markowy
  katalog w tym plasterku zasilamy seedem; brand_admin nie edytuje go jeszcze w UI.
- **Ukrywanie/kuracja** markowych pozycji per-trener — odrzucone: wszyscy widzą całą
  bazę (decyzja brainstormu). Brak tabeli ukryć.
- **Lokalizacja treści katalogu (PL/FR)** — nazwy/opisy markowych pozycji to problem
  i18n na treści (plasterek #2/przyszłość), nie problem własności wiersza. Tu nie
  dublujemy wierszy na region. Markowy wiersz pozostaje jednojęzyczny do czasu, aż
  dosypiemy lokalizację treści.
- **Denormalizacja `organization_id` na tabelach domenowych innych niż exercises/
  skills** (plany, logi) — org wyprowadzamy przez `trainer_id`. Bez zmian.
- **Twarde `NOT NULL`** na nowych kolumnach własności (patrz §3, „nullable, nie NOT
  NULL") — odłożony hardening.

### Kryteria sukcesu
1. Nowy trener w organizacji widzi markową bazę ćwiczeń i umiejętności bez setupu.
2. Trener forkuje markowe ćwiczenie/umiejętność („Dostosuj") → powstaje jego własna
   kopia; oryginał znika z JEGO widoku, ale żyje dla innych; plany/logi/awanse
   wskazujące oryginał pozostają ważne.
3. Trener nie może zapisać ani markowego wiersza, ani wiersza innego trenera
   (404/odmowa) — zweryfikowane testem integracyjnym (tenant-scope).
4. Podopieczny widzi w `/rozwoj` efektywny katalog swojego trenera (markowe +
   dostosowane).
5. Seed + promocja idempotentne: dwukrotne uruchomienie nie tworzy duplikatów.
6. Bramki zielone (`npm test`, `typecheck`, `lint`, `build`), `/code-review` per
   task, `/security-review` (dotyka tenant-scope + autoryzacji zapisu).

---

## 2. Model własności i pochodzenia

```
organizations (marka)
   └─ exercises [organization_id]   ← markowe ćwiczenie (kanon)
   └─ skills    [organization_id]   ← markowa umiejętność (kanon)
        └─ users[role=trainer]
             └─ exercises [trainer_id]            ← własne LUB fork (origin_id → markowe)
             └─ skills    [trainer_id]            ← własne LUB fork (origin_id → markowe)
```

Każdy wiersz `exercises`/`skills` ma **dokładnie jednego właściciela**:
- **markowy:** `trainer_id IS NULL`, `organization_id` = marka, `origin_id IS NULL`.
- **trenerski:** `trainer_id` = trener, `organization_id IS NULL` (org wyprowadzana z
  trenera), `origin_id` = NULL (własne od zera) albo = id markowego oryginału (fork).

**Dlaczego org, a nie region/system-global/per-trener-kopia** (z brainstormu):
ćwiczenia i progresje w kalistenice są **uniwersalne** — pull-up i drabina Front
Lever są takie same w PL i FR; region różni język/walutę, nie definicję ruchu.
Per-region dublowałby maintenance uniwersalnej treści i wymuszał per-region także
ćwiczenia pod drabiny. Per-trener-kopia zabija propagację poprawek marki i puchnie
danymi. System-global nie korzysta z bytu „organizacja" i wymagałby migracji przy
multi-brand. **Organizacja** = własność marki, gotowość na multi-brand/white-label
(#5) bez migracji, koszt ≈ system-global.

**Pochodzenie (`origin_id`) i ukrywanie oryginału.** Gdy trener forkuje markowy
wiersz, klon nosi `origin_id` = id oryginału. W widoku tego trenera oryginał jest
ukrywany i **zastępowany** klonem (nie pokazują się oba). Inni trenerzy widzą
oryginał dalej.

**Efektywny katalog trenera** (jedno źródło prawdy, reużywane wszędzie):
```
effective_exercises(trainerId, orgId) =
    ( organization_id = orgId AND trainer_id IS NULL
      AND id NOT IN (SELECT origin_id FROM exercises
                     WHERE trainer_id = trainerId AND origin_id IS NOT NULL) )
  ∪ ( trainer_id = trainerId )
```
Analogicznie dla `skills`. `orgId` bierzemy z `trainer.organizationId`.

---

## 3. Schemat (`app/lib/db/schema.ts`)

### `exercises`
- `trainer_id` uuid → **nullable** (dotychczas NOT NULL). `onDelete: cascade`
  zostaje — odpala się tylko dla wierszy trenerskich (markowe mają NULL).
- `+ organization_id` uuid → `organizations.id`, `onDelete: restrict`, **nullable**.
- `+ origin_id` uuid → `exercises.id` (self-FK), `onDelete: set null`, **nullable**.
- CHECK „dokładnie jeden właściciel":
  ```
  (trainer_id IS NULL AND organization_id IS NOT NULL) OR
  (trainer_id IS NOT NULL AND organization_id IS NULL)
  ```
- CHECK „origin tylko dla forka trenera": `origin_id IS NULL OR trainer_id IS NOT NULL`.
- Indeksy: zostaje `exercises_trainer_idx`, `exercises_tags_gin`; dodać
  `exercises_org_idx` na `organization_id` (filtr markowych) oraz `exercises_origin_idx`
  na `origin_id` (suppression-subquery).

### `skills`
- Analogicznie: `trainer_id` nullable, `+ organization_id`, `+ origin_id`, te same
  dwa CHECK-i, indeks na `organization_id` i `origin_id`.
- `skills_trainer_name_uniq` (partial, `archived_at IS NULL`) → przemyśleć zakres:
  unikalność nazwy ma sens **w obrębie widoku trenera** (markowe + jego własne).
  Markowy „Front Lever" i forkowany „Front Lever" tego samego trenera nie powinny
  współistnieć — fork ukrywa oryginał, więc kolizji nazw w widoku nie ma. Dla
  bazowej unikalności: osobno markowe (`organization_id`, `trainer_id IS NULL`) i
  osobno trenerskie (`trainer_id`). Realizacja: dwa partial unique indexy lub reguła
  w repo. Decyzja implementacyjna w planie; default = egzekwujemy w repo (precedens
  acykliczności).

### `skill_variations`
- **Usunąć globalny `skill_variations_exercise_uniq`** (`UNIQUE(exercise_id)`).
  Powód: markowe ćwiczenie może być wariantem markowej drabiny **i** sforkowanej
  drabiny trenera (różne widoki) — globalny unique to uniemożliwia. Regułę
  „ćwiczenie jest wariantem ≤1 umiejętności **w obrębie efektywnego widoku trenera**"
  egzekwujemy w `addVariation` (precedens: acykliczność prerekwizytów w repo).
- Zostają `skill_variations_skill_ordinal_uniq` i `skill_variations_skill_exercise_uniq`.

### `skill_prerequisites`
- `trainer_id` uuid → **nullable**; `+ organization_id` uuid (restrict, nullable);
  CHECK „dokładnie jeden właściciel" (markowa krawędź vs trenerska). `origin_id`
  niepotrzebny (krawędzie klonujemy przy forku skilla).
- Zostają `edge_uniq`, indeksy, `no_self_loop`.

### Pozostałe
- `skill_advancements` — **bez zmian** (`trainer_id`/`trainee_id` nadal wymagane;
  awanse są zawsze w kontekście pary trener↔podopieczny; `to_variation_id` może
  wskazywać markowy lub forkowany wariant).
- `exercise_categories` — **bez zmian** (per-trener). Markowe tagi nadal filtrowalne:
  chipy filtrów budujemy z tagów obecnych na widocznych (efektywnych) ćwiczeniach.

### Dlaczego nullable, a nie NOT NULL (jak w fundamencie tenancy)
Tabele `exercises`/`skills` są zapełnione. Po zmianie własności (drop NOT NULL +
nowe kolumny) backfill robimy w **seedzie/promocji** (po migracji). Inwariant
„dokładnie jeden właściciel" pilnuje CHECK (działa od razu, bo dotyczy relacji
kolumn, nie ich nie-NULL-owości). Twarde `NOT NULL` na `organization_id` markowych
wierszy nie jest potrzebne — CHECK już wymusza, że gdy `trainer_id IS NULL`, to
`organization_id IS NOT NULL`.

### Uwaga operacyjna — `db:generate` interaktywne
Drop NOT NULL na `trainer_id` + nowe kolumny → drizzle-kit zapyta w TTY. Właściciel
wybiera „create column"/odpowiednie opcje. Plików w `migrations/` nie edytujemy
ręcznie. (Patrz pamięć: `project_db_generate_interactive`.)

---

## 4. Repozytoria i tenant-scope (`app/lib/exercises.ts`, `skills.ts`, `skill-tree.ts`, `progression.ts`)

### Odczyt
- Nowy helper **`effectiveExercisesForTrainer(db, trainerId)`** i
  **`effectiveSkillsForTrainer(db, trainerId)`** (zapytanie z §2; `orgId` z
  `trainer.organizationId`). Reużywane przez:
  - `biblioteka._index` (lista + filtry),
  - `umiejetnosci._index` (lista authoringu),
  - `getSkillTreeForTrainer` / `getSkillTreeForTrainee` (drzewo dla trenera i jego
    podopiecznych),
  - landing/Rozwój progresji (`listProgressionExercises`, `loadProgressionSessions`).
- Podopieczny czyta przez swojego trenera — jego autoryzacja bez zmian; po prostu
  „efektywny katalog trenera" zawiera teraz markowe pozycje.

### Zapis
- Edycja/archiwizacja/usuń/dodanie-wariantu/reorder/prerekwizyty — dozwolone
  **wyłącznie** na wierszach `trainer_id = ja`. Próba zapisu na wierszu markowym lub
  innego trenera → odmowa (404, spójnie z resztą). Markowy wiersz jest dla trenera
  read-only; „Dostosuj" forkuje.
- „Nowe ćwiczenie"/„Nowa umiejętność" → jak dziś, wiersz `trainer_id = ja`.

### `authz.ts`
- Jedyne poszerzenie: **odczyt markowego wiersza** dozwolony dla trenera z tej samej
  organizacji (`exercise.organization_id === user.organizationId`), oraz dla
  podopiecznego, gdy jego trener należy do tej organizacji. **Zapis** na markowym →
  zawsze odmowa. Reguły per-trener (`ownsTrainerScope`) niezmienione dla wierszy
  trenerskich. To miejsce objęte `/security-review`.

---

## 5. Mechanika forka (copy-on-write)

### Ćwiczenie (fork płytki) — `forkExercise(db, { trainerId, exerciseId })`
1. Wczytaj markowy oryginał (musi być markowy + z organizacji trenera; inaczej 404).
2. Wstaw kopię: `trainer_id = ja`, `organization_id = NULL`, `origin_id = oryginał`,
   skopiuj `name`, `unit`, `description`, `tags`, `tracks_rpe`, `demo_file_id`
   (współdzielenie tego samego pliku demo jest OK — `files` są scope'owane osobno;
   alternatywnie nie kopiujemy demo — decyzja w planie, default: kopiuj referencję).
3. Idempotencja: jeśli trener już ma fork tego origin (`origin_id` + `trainer_id`),
   nie twórz drugiego — otwórz istniejący.
4. Zwróć id klona → trasa redirectuje do edytora klona.
Plany/logi wskazujące oryginał **zostają** (RESTRICT, integralność historii). Od
teraz w widoku trenera oryginał ukryty, widać klon.

### Umiejętność (fork głęboki) — `forkSkill(db, { trainerId, skillId })`
1. Wczytaj markową umiejętność (jw. walidacja).
2. Wstaw kopię skilla (`trainer_id = ja`, `origin_id` = oryginał, `name`, `description`).
3. Sklonuj `skill_variations` (ten sam `ordinal`, `exercise_id` referuje **te same**
   markowe ćwiczenia, chyba że trener osobno sforkuje konkretne ćwiczenie później).
4. Sklonuj krawędzie `skill_prerequisites`, w których origin występuje jako `skill_id`
   — wskazując markowe prerekwizyty (lub już sforkowane skille w widoku trenera).
   Krawędzie, w których origin jest `requires_skill_id` innej markowej umiejętności,
   pozostają na markowym poziomie; w widoku trenera fork zastępuje origin, więc
   rozwiązanie „co wymaga czego" liczymy na efektywnym zbiorze skilli.
5. Wszystko w jednej transakcji. Idempotencja jak przy ćwiczeniu (po `origin_id` +
   `trainer_id`).
`skill_advancements` podopiecznych wskazujące stare warianty/skill — nietknięte;
dalsze awanse idą na forku.

### Czyste funkcje (TDD, bez DB)
- `suppressForkedOrigins(brandRows, forkedOriginIds)` → lista efektywna (filtr
  origin-suppression).
- `exerciseInOneSkillWithinView(variationsInView, exerciseId)` → guard dla
  `addVariation`.
- Plan klonowania drabiny: czysta transformacja `(variations, prereqEdges) →
  newRowsToInsert` (bez I/O), testowalna jednostkowo.

---

## 6. UI (przez `frontend-design:frontend-design`, design-system, polski)

### Biblioteka trenera (`/trener/biblioteka/_index`, `biblioteka.$exerciseId`)
- Jedna lista efektywnego katalogu. Markowe wiersze: badge „Marka" + akcja
  „Dostosuj" (POST → `forkExercise` → redirect do edytora klona). Własne wiersze:
  edycja/archiwizacja jak dziś.
- Filtry/sort/szukajka (`<ListControls>`) bez zmian; chipy z tagów efektywnego zbioru.
- Widok edycji markowego (`biblioteka.$exerciseId`) dla wiersza markowego: tryb
  read-only z CTA „Dostosuj" zamiast formularza zapisu.

### Umiejętności trenera (`/trener/umiejetnosci/_index`, `umiejetnosci.$skillId`)
- Lista efektywnych umiejętności; markowe z badge „Marka" + „Dostosuj"
  (POST → `forkSkill`). Edycja nazwy/opisu, wariantów, reorder, prerekwizyty,
  archiwizacja — tylko na własnych/forkach; markowe read-only + CTA „Dostosuj".

### Podopieczny (`/podopieczny/rozwoj` i pod-strony, oraz lustrzane trasy trenera)
- Drzewo umiejętności i lista „Pozostałe ćwiczenia" budują się z efektywnego
  katalogu trenera — markowe + dostosowane, bez dodatkowego UI. Stany węzłów (per
  podopieczny) bez zmian.

UI po polsku; angielskie tylko nazwy ćwiczeń (Pull-up…); brand `kalisthenos` małą
literą.

---

## 7. Seed i migracja danych

### Promocja in-place istniejącej biblioteki trenera (wybrana opcja)
Kanoniczne ćwiczenia/umiejętności obecnego trenera (Adama) stają się bazą markową:
- `UPDATE exercises SET trainer_id = NULL, organization_id = :org WHERE id IN (:canon)`.
  **Bez zmiany `id`** → `plan_items`, `workout_exercise_logs`, `skill_variations`
  pozostają ważne. Analogicznie `skills` i markowe `skill_prerequisites`.
- Które wiersze są kanoniczne → **wymaga wskazania przez właściciela** (lista nazw
  lub flaga). Domyślnie: cała aktualna biblioteka trenera-założyciela (jest dziś
  jedynym realnym trenerem).
- Po promocji wiersze są markowe (widoczne dla wszystkich trenerów org), a Adam
  nadal je widzi (jako markowe), bez duplikatów.

### Seed markowego katalogu (`scripts/seed.ts`, idempotentny)
- Jeśli organizacja nie ma jeszcze markowych ćwiczeń/umiejętności i nie robimy
  promocji — wstaw listę z dostarczonej treści (deterministyczne id po nazwie, jak
  seed V1 ćwiczeń). Idempotencja po `(organization_id, name)` wśród markowych.
- Seed i promocja są wzajemnie idempotentne: drugie uruchomienie nic nie dubluje.

### Env
- **Brak nowych zmiennych** (treść kanonu = dane, nie konfiguracja). Korzystamy z
  istniejącego `BRAND_NAME`/organizacji z fundamentu tenancy.

---

## 8. Plan testów

### Jednostkowe (`*.test.ts`, Vitest, bez DB — pisane test-first i uruchamiane)
- `suppressForkedOrigins`: oryginał z istniejącym forkiem znika; bez forka zostaje;
  własne zawsze.
- `exerciseInOneSkillWithinView`: wykrywa ćwiczenie już użyte w innym skillu widoku.
- Plan klonowania drabiny: `(variations, prereqEdges) → newRows` zachowuje `ordinal`,
  mapuje krawędzie, nie gubi/duplikuje.
- Walidatory forka (Zod/guardy): odmowa forka wiersza nie-markowego / spoza org.

### Integracyjne (`*.itest.ts`, testcontainers — PISANE, uruchamia właściciel)
Krytyczny przepływ: **tenant-scope + autoryzacja zapisu**.
- Efektywny katalog: trener widzi markowe (niesforkowane) + własne; po forku widzi
  klon zamiast oryginału; inny trener tej org wciąż widzi oryginał.
- Trener A **nie** zapisze markowego wiersza ani wiersza trenera B (404/odmowa).
- `forkExercise`/`forkSkill`: tworzą własność A; idempotentne; nie ruszają
  planów/logów/awansów wskazujących oryginał.
- Podopieczny widzi efektywny katalog swojego trenera w `/rozwoj`.
- Promocja in-place: po promocji wiersze są markowe, `id` niezmienione, FK ważne;
  seed/promocja idempotentne (drugie uruchomienie bez duplikatów).
- CHECK „dokładnie jeden właściciel": odrzuca wiersz z `trainer_id` **i**
  `organization_id`, oraz z oboma NULL.

### Bramki
`npm test` + `typecheck` + `lint` + `build`; `/code-review` per task;
`/security-review` (tenant-scope, autoryzacja zapisu, poszerzenie odczytu o org).
Integracyjne/E2E: zaraportować i poprosić właściciela o uruchomienie pod Dockerem.

---

## 9. Kolejność implementacji (jeden spec, plan sekwencyjny: ćwiczenia → umiejętności)

1. **Schemat + migracja** (exercises + skills + skill_variations + skill_prerequisites,
   CHECK-i, indeksy). `db:generate` (właściciel w TTY) → `db:migrate`.
2. **Ćwiczenia markowe:** model własności w repo, `effectiveExercisesForTrainer`,
   `forkExercise`, autoryzacja zapisu, UI biblioteki (badge „Marka" + „Dostosuj").
   Bramki + review. Wdrażalne samodzielnie.
3. **Umiejętności markowe:** `effectiveSkillsForTrainer`, `forkSkill` (głęboki),
   relaks unique + guard w repo, drzewo (`skill-tree`) na efektywnym zbiorze, UI
   authoringu. Bramki + review.
4. **Seed + promocja in-place** (idempotentne) + dokumentacja.

---

## 10. Wpływ na dokumentację (część „done")
- `app/lib/db/README.md` — własność org/trener na exercises/skills, `origin_id`,
  relaks unique, nowe CHECK-i.
- `app/lib/README.md` — `effective*ForTrainer`, `forkExercise`/`forkSkill`, czyste
  helpery.
- `app/routes/trener/README.md` — „Dostosuj" + badge „Marka" w bibliotece i
  umiejętnościach.
- `app/routes/podopieczny/README.md` — wzmianka, że Rozwój obejmuje markowe pozycje.
- `scripts/README.md` — promocja in-place + seed markowego katalogu.
- `CLAUDE.md` — jeśli pojawi się nowy moduł lib (np. `catalog.ts`); konwencja
  „efektywny katalog".

---

## 11. Handoff (granica gita)
Po implementacji: lista zmienionych plików, proponowany komunikat commita, notatka o
`db:generate`/`db:migrate`/`db:seed` (+ promocja in-place — wskazanie kanonicznych
wierszy), komendy testów integracyjnych do odpalenia pod Dockerem, ścieżka ręcznej
weryfikacji (nowy trener widzi markową bazę; „Dostosuj" forkuje; oryginał znika z
jego widoku, zostaje u innych). Git/migrate/seed/deploy prowadzi właściciel.

---

## 12. Ryzyka i decyzje
| Ryzyko / decyzja | Rozstrzygnięcie |
|---|---|
| Dom bazy: region vs org vs global vs per-trener | **Organizacja** — ruch uniwersalny, własność marki, gotowość na multi-brand bez migracji (brainstorm) |
| Dostosowanie: fork vs nakładka różnicowa vs tylko-ukryj | **Copy-on-write fork** — najprostsze, integralność historii; koszt: sforkowany element nie dostaje już poprawek marki |
| Propagacja poprawek marki do forków | Świadomie brak — fork zamraża snapshot; niesforkowane markowe pozycje dostają zmiany żywo |
| Globalny `UNIQUE(exercise_id)` na wariantach | Poluzowany do reguły „≤1 skill w widoku trenera" w repo |
| `trainer_id` NOT NULL → nullable na zapełnionej tabeli | Nullable + CHECK „jeden właściciel"; backfill w seedzie/promocji; twardy NOT NULL niepotrzebny |
| Duplikaty po wprowadzeniu marki | **Promocja in-place** istniejących wierszy (bez zmiany `id`) zamiast świeżego katalogu obok |
| Poszerzenie dostępu przez markowy odczyt | `authz.ts`: odczyt markowych w obrębie org; zapis na markowym zawsze odmowa; objęte `/security-review` |
| Lokalizacja PL/FR markowej treści | Problem i18n na treści, nie własności wiersza; poza zakresem, brak duplikatów per-region |
| Panel prezesa do edycji katalogu | Poza zakresem (#4); teraz seed + promocja |
| Pliki demo markowych ćwiczeń niedostępne cross-tenant (404) | Autoryzacja przy serwowaniu: serve-route wpuszcza odczyt pliku będącego `demo_file_id` markowego ćwiczenia z org użytkownika; bez zmian schematu `files`; objęte `/security-review` |
