# Panel prezesa — autorstwo katalogu marki (plasterek #4a) — design spec

**Status:** Draft — do przeglądu właściciela
**Data:** 2026-06-07
**Epik:** „Platforma marki" — `marka → ambasadorzy (trenerzy) → podopieczni`.
**Plasterek:** #4 „panel prezesa". Ten dokument definiuje **pełną wizję** panelu
prezesa, a następnie wykrawa **pierwszy dowieziony plasterek (#4a)**: powłoka
`/marka` + autorstwo markowego katalogu (ćwiczenia, umiejętności, drzewo).
Fundament (#1 tenancy, #2 i18n/EUR, #3 markowy katalog) jest gotowy.

---

## 1. Cel i kontekst

Dziś `/marka` to placeholder „Panel marki — wkrótce". Prezes (`brand_admin`)
loguje się, ma `organization_id`, `region_id = NULL`, `trainer_id = NULL`, ale nie
ma żadnej powierzchni produktu ani dostępu domenowego (`authz.ts` świadomie
nietknięte w #1).

Plasterek #3 przeniósł ćwiczenia i umiejętności na poziom marki (dwupoziomowa
własność katalogu: markowy `trainer_id NULL` + `organization_id` vs trenerski
`trainer_id` + `organization_id NULL`), ale **markowy katalog można dziś zasilić
WYŁĄCZNIE przez `promoteTrainerCatalogToBrand`** (trener „awansuje" swój kanon).
Nie ma UI do tworzenia/edycji markowych pozycji wprost. To realna luka — prezes
przejął odpowiedzialność za kanon marki, ale nie ma jak nim zarządzać. Ten
plasterek tę lukę zamyka.

---

## 2. Pełna wizja panelu prezesa (centrum dowodzenia)

Prezes to **centrum dowodzenia** całej organizacji. Docelowe obszary (zatwierdzone
w brainstormie; budowane w osobnych plasterkach `/feature`):

| Obszar | Charakter | Plasterek |
|---|---|---|
| **A · Analityka sieci** — pulpit metryk org: liczba ambasadorów i podopiecznych, aktywni 7/30 dni, MRR/przychód, nowi w miesiącu, trend; rozbicie per region i per ambasador (ranking); adopcja katalogu; konsultacje w sieci. | read-only | przyszły |
| **B · Autorstwo katalogu marki** — CRUD markowych ćwiczeń i umiejętności (warianty + drzewo prerekwizytów) wprost z poziomu prezesa. | write | **#4a (TEN)** |
| **C · Zarządzanie ambasadorami** — lista/profil trenerów, zapraszanie nowych ambasadorów (`brand_admin` invite), dezaktywacja. | write | przyszły |
| **D · Regiony** — lista/dodawanie regionów (kraj, waluta, locale), przypisywanie ambasadorów. | write | przyszły |
| **E · Ustawienia marki / branding** — nazwa, logo/branding. (White-label + prowizja Stripe → osobny #5.) | write | przyszły |

Wizja jest tłem decyzji projektowych (np. powłoka `/marka` od razu z pełnym
sidenavem, pozostałe pozycje jako „wkrótce"), ale **w zakresie implementacji jest
tylko B**.

---

## 3. Zakres plasterka #4a

### W zakresie
1. **Powłoka `/marka`** z prawdziwą nawigacją (sidenav w stylu panelu trenera):
   pozycje „Pulpit", „Biblioteka ćwiczeń", „Umiejętności" (aktywne) + „Ambasadorzy",
   „Regiony", „Ustawienia marki" jako przygaszone „wkrótce". User menu (motyw,
   wyloguj). Desktop-first, polski UI, design-system.
2. **Lekki pulpit `/marka`** (`_index`): liczniki markowego katalogu (ile ćwiczeń,
   ile umiejętności) + skróty do sekcji. **Nie** pełna analityka (to obszar A).
3. **Autorstwo markowych ćwiczeń** (`/marka/biblioteka*`): lista (sort + szukajka,
   `<ListControls>`, paginacja), nowe ćwiczenie (nazwa, jednostka REPS/SEC, opis,
   „Zbieraj RPE", tagi, **demo wideo**), edycja, podmiana/usuwanie demo,
   archiwizacja/przywracanie (z blokadą gdy ćwiczenie jest wariantem aktywnej
   markowej umiejętności).
4. **Autorstwo markowych umiejętności** (`/marka/umiejetnosci*`): lista + **drzewo
   marki** (`SkillTreeView`, szkielet autora), nowa umiejętność (nazwa, opis),
   edycja (warianty: dodaj/usuń/reorder; prerekwizyty „Wymaga:": dodaj/usuń z
   wykrywaniem cykli), archiwizacja.
5. **Zmiana schematu `files`** — własność marki (patrz §7), by prezes mógł
   uploadować demo.
6. **Tenant-scope prezesa** (org-scope): patrz §6.

### Poza zakresem (#4a) — świadome cięcia
- Obszary A, C, D, E (osobne plasterki).
- Tryb porównania/progresja na markowym katalogu (to widoki per-podopieczny u
  trenera; marka kuruje kanon, nie ogląda postępów w #4a).
- Edycja/branding plików innych niż demo ćwiczeń.
- Zmiana mechanizmu `promoteTrainerCatalogToBrand` (zostaje jako druga, równoległa
  droga zasilania katalogu).

### Kryteria sukcesu
1. Prezes na `/marka` widzi działający sidenav; „Biblioteka ćwiczeń" i
   „Umiejętności" prowadzą do realnych widoków.
2. Prezes **tworzy** markowe ćwiczenie z demo wideo; pojawia się ono u trenera tej
   organizacji jako pozycja markowa (badge „Marka", read-only + „Dostosuj").
3. Prezes **tworzy** markową umiejętność, dodaje warianty (z markowych ćwiczeń) i
   krawędzie prerekwizytów; drzewo marki renderuje się; cykl jest odrzucony.
4. Markowe demo jest czytelne dla członków organizacji (trener/podopieczny) i dla
   prezesa (podpisane URL-e).
5. **Izolacja:** pozycja spoza organizacji prezesa → 404. Trener nie może zapisać
   markowego wiersza (bez zmian w regule trenera).
6. Bramki zielone; `/code-review` per task; `/security-review` (dotyka uploadu,
   podpisanych URL, tenant-scope, nowej powierzchni roli).

---

## 4. Architektura (decyzja brainstormu: osobne repo + trasy, reużyta logika)

**Osobne, cienkie funkcje zapisu/odczytu i trasy marki; złożona logika reużyta z
istniejących czystych modułów. Trenerskie funkcje zapisu — nietknięte.**

- **Nowy moduł `app/lib/brand-catalog.ts`** — brand-scoped repo (właściciel =
  `organizationId`). Patrz §5.
- **Reużyte bez kopiowania logiki:**
  - `app/lib/skill-tree-math.ts` — `wouldCreateCycle`, `assignLayers`,
    `orderWithinLayer`, `nodeState`, `topoOrder`.
  - `app/lib/catalog-math.ts` — czyste transformacje (jeśli potrzebne).
  - `app/lib/exercises.ts` — `normalizeTags`.
  - `app/lib/list-params.ts` + `components/list-controls.tsx`.
  - komponenty prezentacyjne: `exercise-fields`, `skill-tree`
    (`SkillTreeView`/`VariationLadder`), `file-dropzone`, `pagination`, `icons`.
- **Nietknięte (brak ryzyka regresji u trenera):** `app/lib/skills.ts` (zapisy
  trenera), trenerskie odczyty w `app/lib/catalog.ts`, trasy `/trener/*`,
  `app/routes/trener/*`.

Powód: czyste algorytmy (cykle, układ warstw, reorder ordinali) żyją już w
modułach `*-math.ts` bez I/O — `brand-catalog.ts` je woła, więc „osobność" oznacza
tylko cienkie wrappery DB różniące się kolumną właściciela, bez duplikacji trudnej
logiki.

---

## 5. Warstwa danych — `app/lib/brand-catalog.ts`

Wszystkie funkcje przyjmują `organizationId` (z `user.organizationId` prezesa) i
filtrują po `organization_id IS NOT NULL = org AND trainer_id IS NULL`. Pozycja
spoza org → funkcja zwraca null/rzuca → trasa daje **404**.

### Odczyt
- `listBrandExercises(db, organizationId, controls?)` → lista markowych ćwiczeń org
  (sort/szukajka/paginacja przez `list-params`).
- `getBrandExercise(db, organizationId, exerciseId)` → wiersz lub null.
- `listBrandSkills(db, organizationId)` → lista markowych umiejętności + liczba
  wariantów.
- `getBrandSkillWithVariations(db, organizationId, skillId)` → umiejętność +
  warianty (z nazwami ćwiczeń) + prerekwizyty.
- `getBrandSkillTree(db, organizationId)` → `SkillTree` (szkielet autora; układ
  przez `assignLayers`/`orderWithinLayer`).
- `listAssignableBrandExercises(db, organizationId, skillId)` → markowe ćwiczenia
  org **nie** będące wariantem żadnej markowej umiejętności (reguła „≤1
  umiejętność") i nie zarchiwizowane.
- `listAssignableBrandPrereqs(db, organizationId, skillId)` → markowe umiejętności
  org, których dodanie nie utworzy cyklu (`wouldCreateCycle`).

### Zapis
- `createBrandExercise(db, { organizationId, uploadedBy }, input)` →
  insert markowego ćwiczenia (`trainer_id NULL`, `organization_id`); opcjonalny
  `demoFileId`.
- `updateBrandExercise` / `archiveBrandExercise` / `restoreBrandExercise` —
  archiwizacja zablokowana, gdy ćwiczenie jest wariantem aktywnej markowej
  umiejętności (lustro `findSkillForExercise`, ale w obrębie markowych).
- `createBrandSkill` / `updateBrandSkill` / `archiveBrandSkill` (czyści krawędzie
  prerekwizytów w transakcji).
- `addBrandVariation` — odrzuca zarchiwizowane ćwiczenie i ćwiczenie już będące
  wariantem innej markowej umiejętności; `removeBrandVariation` — przepakowuje
  `ordinal` (bez dziur); `reorderBrandVariations`.
- `addBrandPrereq` (anty-selfloop + `wouldCreateCycle` → `CatalogError`) /
  `removeBrandPrereq`.
- Klasa błędu `BrandCatalogError` (komunikaty PL), spójna z `SkillError`/`CatalogError`.

**Reguła własności wariantów/prerekwizytów:** wariant markowej umiejętności musi
być **markowym ćwiczeniem tej org**; prerekwizyt markowej umiejętności musi być
**markową umiejętnością tej org**. Egzekwowane w `add*` (sprawdzenie własności
przed insertem) — żeby trenerska pozycja nie wyciekła do kanonu marki.

---

## 6. Auth / autoryzacja (org-scope prezesa)

- Trasy `/marka/*` pod `_layout.tsx` z `requireUser(..., { role: "brand_admin" })`
  (już istnieje dla layoutu marki).
- **Org-scope:** repo filtruje po `user.organizationId`. Brak/niezgodność org →
  404. Prezes bez `organizationId` (nie powinno się zdarzyć po seedzie #1) →
  traktujemy jak brak dostępu (404), nie 500.
- `authz.ts`: dodać czysty guard `ownsBrandScope(user, organizationId)`
  (`user.role === "brand_admin" && user.organizationId === organizationId`) +
  ewentualnie `canReadBrandCatalogRow`/`canWriteBrandCatalogRow` w stylu istniejących
  predykatów — testowalne jednostkowo. Reguła trenera (markowy = read-only,
  `canReadCatalogRow`) **bez zmian**.
- Trener/podopieczny nadal nie mają dostępu do `/marka` (layout wymaga roli).

---

## 7. Zmiana schematu — `files` (własność marki)

`app/lib/db/schema.ts`:
- `files.trainer_id` → **nullable** (było NOT NULL).
- nowe `files.organization_id` uuid → `organizations.id` (`onDelete: restrict`).
- CHECK `files_owner_check`: dokładnie jeden właściciel —
  `(trainer_id IS NOT NULL AND organization_id IS NULL) OR
   (trainer_id IS NULL AND organization_id IS NOT NULL)` (lustro
  `exercises_owner_check`/`skills_owner_check`).
- `uploaded_by` (NOT NULL) = id prezesa dla plików marki.
- indeks `files_org_kind_idx` na `(organization_id, kind)` (analogicznie do
  `files_trainer_kind_idx`).

`app/lib/file-uploads.ts`:
- `uploadFile` przyjmuje **właściciela** zamiast samego `trainerId`: union
  `{ trainerId } | { organizationId }` (+ `uploadedBy`). Insert wiersza `files`
  ustawia właściwą kolumnę. Walidacja MIME/magic-bytes/limitów + kolejka
  sprzątająca — bez zmian.

`app/routes/files.$fileId.tsx` (serwowanie):
- Markowe demo jest już czytelne dla org przez `fileIsBrandDemoInOrg`
  (`resolveCatalogOrgId` zwraca org także dla `brand_admin` — sprawdzone). **Bez
  zmiany logiki dostępu** poza tym, że pliki org-owned wpadają tą samą ścieżką.
  Potwierdzić w teście integracyjnym.

> Uwaga migracyjna: rozluźnienie NOT NULL + nowa kolumna + CHECK na zapełnionej
> tabeli. Istniejące pliki mają `trainer_id` → CHECK spełniony (org NULL). Bez
> backfillu.

---

## 8. Trasy i powłoka

`app/routes.ts` — pod prefiksem `marka/` (layout istnieje), dodać:

| Plik | URL | Eksporty | Rola |
|---|---|---|---|
| `marka/_index.tsx` (zmiana) | `/marka` | loader, default | Lekki pulpit: liczniki katalogu + skróty (zamiast placeholdera). |
| `marka/biblioteka._index.tsx` | `/marka/biblioteka` | loader, action, default | Lista markowych ćwiczeń (`<ListControls>`, paginacja). Kategorie ćwiczeń są per-trener (`exercise_categories.trainer_id`) — **poza zakresem** markowego katalogu. |
| `marka/biblioteka.nowe.tsx` | `/marka/biblioteka/nowe` | loader, action, default | Nowe markowe ćwiczenie + upload demo. |
| `marka/biblioteka.$exerciseId.tsx` | `/marka/biblioteka/:exerciseId` | loader, action, default | Edycja/demo/archiwizacja markowego ćwiczenia. |
| `marka/umiejetnosci._index.tsx` | `/marka/umiejetnosci` | loader, default | Lista + drzewo marki (`SkillTreeView`). |
| `marka/umiejetnosci.nowa.tsx` | `/marka/umiejetnosci/nowa` | loader, action, default | Nowa markowa umiejętność. |
| `marka/umiejetnosci.$skillId.tsx` | `/marka/umiejetnosci/:skillId` | loader, action, default | Warianty + prerekwizyty + archiwizacja. |

`app/routes/marka/_layout.tsx` — rozbudowa o sidenav (mirror `trener/_layout.tsx`):
liczy `listBrandExercises`/`listBrandSkills` count do odznak; pozycje „wkrótce"
nieaktywne.

**i18n:** rozbudowa namespace `marka` (`app/locales/pl/marka.json` + `fr/`):
nawigacja, etykiety formularzy katalogu, komunikaty akcji. Klucze dynamiczne przez
`tDyn`. **Test parzystości kluczy pl/fr musi przejść.**

**UI/UX:** warstwa wizualna (powłoka, formularze, drzewo) prowadzona skillem
`frontend-design:frontend-design`, zgodnie z `design-system/README.md` i
`app/styles/tokens.css`. Reużycie istniejących komponentów i klas (`list-row`,
`badge`, `mockup` itd.).

---

## 9. Plan testów

### Jednostkowe (`*.test.ts`, Vitest, bez DB — test-first, uruchamiane)
- `authz`: `ownsBrandScope`/`canWriteBrandCatalogRow` — true dla `brand_admin` z
  pasującą org, false dla innej org, false dla trenera/podopiecznego; utrwalenie,
  że trener nie zapisuje markowego wiersza.
- Czyste reguły reużyte w `brand-catalog`: testy dla `wouldCreateCycle`,
  przepakowanie `ordinal` (jeśli wydzielone do czystej funkcji — preferowane),
  walidacja własności wariantu/prereq (czysty predykat).
- Zod inputów formularzy (reużyć `SkillFormSchema` itd.; jeśli markowe wymagają
  innego kształtu — nowy schemat + testy).
- `normalizeTags` — już pokryte.

### Integracyjne (`*.itest.ts`, testcontainers — PISANE, uruchamia właściciel)
Krytyczne przepływy (tenant-scope + zapis katalogu + upload):
- Prezes tworzy markowe ćwiczenie (z demo) → wiersz `trainer_id NULL`,
  `organization_id = org`; plik `files` org-owned (CHECK OK); demo serwowane
  członkom org i prezesowi (podpisany URL), odrzucone bez podpisu.
- Prezes tworzy markową umiejętność + warianty + prereq; cykl odrzucony; reorder i
  remove przepakowują ordinal.
- **Izolacja:** prezes org#1 dostaje 404 na ćwiczenie/umiejętność org#2; trener
  nie zapisuje markowego wiersza (404/forbidden); markowa pozycja widoczna u
  trenera jako read-only.
- `files` po migracji: istniejące pliki trenerskie nadal czytelne (regresja).

### Bramki
`npm test` + `npm run typecheck` + `npm run lint` + `npm run build`;
`/code-review` per task; `/security-review` (upload + podpisane URL + tenant-scope
+ nowa powierzchnia roli). Testy integracyjne: zaraportować i poprosić właściciela
o uruchomienie pod Dockerem.

---

## 10. Migracja, seed, env

- **Migracja:** `npm run db:generate` po edycji `schema.ts` (tabela `files`:
  nullable `trainer_id`, nowa `organization_id`, CHECK, indeks). **Interaktywne** —
  właściciel w TTY wybiera „create column"/„alter" (drizzle-kit pyta o nullability);
  plików w `migrations/` nie edytujemy ręcznie. Potem `npm run db:migrate`.
- **Seed:** bez zmian (prezes + org + region PL już seedowane w #1). Opcjonalnie
  można doseedować przykładowe markowe ćwiczenie do demo — **poza zakresem**, decyzja
  właściciela.
- **Env:** brak nowych zmiennych.

---

## 11. Dokumentacja (część „done")

- `app/lib/README.md` — nowy `brand-catalog.ts`; ewentualne nowe predykaty w `authz.ts`.
- `app/lib/db/README.md` — zmiana w `files` (własność marki, CHECK, indeks).
- `app/routes/README.md` + `app/routes/marka/README.md` — nowe trasy `/marka/*`,
  opis powłoki i autorstwa katalogu (zastępuje wzmiankę „placeholder").
- `app/components/README.md` — jeśli powstaną nowe komponenty marki (raczej reużycie).
- `app/locales/README.md` / namespace `marka` — nowe klucze.
- `CLAUDE.md` — mapa: rozszerzony obszar `/marka`, nowy `app/lib/brand-catalog.ts`.

---

## 12. Handoff (granica gita)

Po implementacji: lista zmienionych plików, proponowany komunikat commita, notatka
o `db:generate`/`db:migrate` (zmiana `files`; interaktywne generate), komendy testów
integracyjnych do odpalenia, ścieżka ręcznej weryfikacji (login prezesa → `/marka`
→ utworzenie markowego ćwiczenia z demo → podgląd u trenera jako read-only →
utworzenie umiejętności + drzewa). Git/migrate/deploy prowadzi właściciel.

---

## 13. Ryzyka i decyzje

| Ryzyko / decyzja | Rozstrzygnięcie |
|---|---|
| Duplikacja złożonej logiki przy „osobnym repo" | Reużycie `skill-tree-math`/`catalog-math` + komponentów; `brand-catalog.ts` to cienkie wrappery DB. |
| Rozluźnienie NOT NULL na `files.trainer_id` | CHECK „dokładnie jeden właściciel"; istniejące pliki spełniają (org NULL); bez backfillu. |
| Wyciek pozycji trenerskiej do kanonu marki | `add*Variation`/`add*Prereq` egzekwują markową własność tej org przed insertem. |
| Poszerzenie dostępu nową powierzchnią roli | Org-scope w repo (404 poza org); `authz` reguła trenera bez zmian; `/security-review`. |
| `db:generate` interaktywne | Właściciel w TTY; migracji nie edytujemy ręcznie. |
| Zakres „centrum dowodzenia" | Wizja A–E w specu; implementacja tylko B (#4a); A/C/D/E to kolejne `/feature`. |
| Markowe demo dla podopiecznego/trenera | Już czytelne przez `fileIsBrandDemoInOrg` + `resolveCatalogOrgId` (obsługuje `brand_admin`); potwierdzić testem. |
