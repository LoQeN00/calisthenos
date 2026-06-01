# kalisthenos — Drzewo umiejętności (gamifikacja modelu progresji) — design spec

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-06-01
**Powiązane:**
[`2026-06-01-umiejetnosci-progresja-wariantow-design.md`](2026-06-01-umiejetnosci-progresja-wariantow-design.md)
(fundament: umiejętności = drabiny wariantów; to spec dokłada warstwę grafu nad
umiejętnościami) · [`../../innovate.md`](../../innovate.md) (pozycja „Drzewo
prerekwizytów (DAG)" z ogona roadmapy A).

---

## 0. Kontekst i decyzje wejściowe

Kontynuacja kierunku A. Cel produktowy: **lekka gamifikacja** modelu progresji —
żeby umiejętności układały się w **growe drzewo** („jak z gry komputerowej"):
mam cel (np. *Front Lever*) i widzę drzewo wszystkiego, co trzeba odblokować, by
do niego dojść. Decyzje ustalone w brainstormie (2026-06-01):

- **Struktura:** pełne **rozgałęzione drzewo celów** — graf (DAG) między
  umiejętnościami.
- **Węzeł = umiejętność** (dwa poziomy): makro-drzewo łączy umiejętności; w środku
  każdego węzła zostaje istniejąca **drabina wariantów**. Reużywamy
  `skills`/`skill_variations`/`skill_advancements` bez zmian.
- **Odblokowanie ręczne** (trener) — spójne z dzisiejszą filozofią „awans zawsze
  ręczny". Krawędzie prerekwizytów są strukturą + miękką podpowiedzią
  („gotowe do startu"), **nie** twardą bramką blokującą akcję trenera.
- **Drzewo zastępuje** dzisiejszą płaską mapę Umiejętności (trener per-podopieczny
  i read-only podopieczny). Klik węzła → drabina wariantów danej umiejętności.
- **Autoring krawędzi:** lista **„Wymaga:"** w edytorze umiejętności (picker innych
  umiejętności). **Bez** wizualnego canvasu drag&drop — układ liczony automatycznie
  (warstwy wg głębokości topologicznej).
- **Render:** własny warstwowy układ + ręczny SVG/CSS (idiom `stat-widgets`), bez
  nowej zależności grafowej. Logika układu w czystych funkcjach (TDD).

### Dlaczego to wyróżnik (kontynuacja)

A dał model progresji przez warianty z trenerem w pętli. Drzewo dokłada to, czego
nie ma ani u generycznych platform coachingowych, ani u self-serve apek
kalistenicznych: **trenersko-autorską mapę zależności umiejętności** z growym
feedbackiem postępu dla podopiecznego. Nadal: trener w pętli, awans ręczny.

---

## 1. Cel i nie-cele

### Cel
Wprowadzić **graf prerekwizytów między umiejętnościami** (per trener), pokazać go
jako **growe drzewo** z czterema stanami węzła per-podopieczny, dać trenerowi
**autoring krawędzi** („Wymaga:") z blokadą cykli, i zastąpić dzisiejszą mapę
Umiejętności drzewem (z drill-in do drabiny wariantów).

### Nie-cele (świadome cięcia)
- Wizualny canvas drag&drop do autoringu grafu (lista „Wymaga:" wystarcza; canvas =
  ewentualny późniejszy spec).
- Konfigurowalne progi/bramki awansu (sets/reps/sek/RPE per wariant). Start zostaje
  ręczny; „gotowe do startu" to miękka podpowiedź.
- Twarde blokowanie akcji trenera przez prerekwizyty (trener może ustawić start
  zablokowanego węzła — to jego decyzja; stan „zablokowane" jest informacyjny).
- Auto-podmiana pozycji aktywnego planu przy awansie.
- Mastery 0–100% (zostają dyskretne poziomy = warianty).
- Prerekwizyty z pojedynczych ćwiczeń/warunków spoza umiejętności (węzeł = wyłącznie
  umiejętność; rozważane „mieszane" odrzucone).
- Biblioteka/fork drzew między trenerami.

---

## 2. Słownik

- **Węzeł** — umiejętność trenera (`skills`). Niesie wewnętrzną drabinę wariantów.
- **Krawędź / prerekwizyt** — skierowana zależność „umiejętność X **wymaga**
  umiejętności Y" (`Y → X`). Graf jest **acykliczny** (DAG).
- **Warstwa** — głębokość topologiczna węzła: korzeń (bez prerekwizytów) = 0;
  węzeł = max(warstwa prerekwizytów) + 1. Steruje pionowym układem.
- **Stan węzła (per-podopieczny):**
  - **mastered (opanowane)** — bieżący wariant = najwyższy `ordinal` umiejętności.
  - **in_progress (w toku)** — umiejętność przypisana (≥1 zdarzenie awansu), nie na
    szczycie.
  - **available (gotowe do startu)** — nieprzypisana, ale **wszystkie** prerekwizyty
    `mastered`.
  - **locked (zablokowane)** — nieprzypisana i co najmniej jeden prerekwizyt nie jest
    `mastered`.

---

## 3. Model danych

Jedna nowa tabela; reszta (`skills`, `skill_variations`, `skill_advancements`) bez
zmian. Schemat = źródło prawdy (`app/lib/db/schema.ts`); migracja przez
`npm run db:generate` — **bez ręcznej edycji `migrations/`**.

### 3.1 `skill_prerequisites`
```
skill_prerequisites (
  id                uuid PK default gen_random_uuid(),
  trainer_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- denormalizacja (tenant-scope, jak workout_logs/skill_advancements)
  skill_id          uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE, -- umiejętność, która MA prerekwizyt
  requires_skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE, -- prerekwizyt
  created_at        timestamptz NOT NULL DEFAULT now()
)
UNIQUE (skill_id, requires_skill_id);          -- brak zdublowanych krawędzi
CHECK  (skill_id <> requires_skill_id);        -- brak pętli własnej
INDEX  ON skill_prerequisites (trainer_id);
INDEX  ON skill_prerequisites (skill_id);
INDEX  ON skill_prerequisites (requires_skill_id);
```

**Niezmienniki (walidacja w repo + testy):**
- `skill_id` i `requires_skill_id` należą do tego samego trenera (`trainer_id`).
- Graf **acykliczny** — dodanie krawędzi, które domknęłoby cykl, jest odrzucane
  (`SkillError`), zanim trafi do DB.
- `ON DELETE CASCADE` na obu FK: usunięcie/archiwizacja umiejętności sprząta jej
  krawędzie (archiwizacja jest soft, więc krawędzie archiwizowanej umiejętności po
  prostu nie wchodzą do drzewa — patrz §4).

**Dlaczego acykliczność w repo, nie w DB:** Postgres nie ma wbudowanego constraintu
„DAG"; egzekwujemy w warstwie repo czystą funkcją `wouldCreateCycle` (testowalną),
co i tak daje przyjazny komunikat zamiast błędu bazy.

---

## 4. Czysta logika — `app/lib/skill-tree-math.ts` (TDD, bez DB)

Wszystko czyste i testowalne jednostkowo. Typy wejściowe minimalne (id + ordinale +
zdarzenia), żeby nie wciągać DB.

- `wouldCreateCycle(edges: Edge[], from: string, requires: string): boolean`
  — czy dodanie krawędzi `requires → from` domyka cykl (DFS po istniejących
  krawędziach; `from` osiągalny z `requires`? lub `requires === from`).
- `assignLayers(nodeIds: string[], edges: Edge[]): Map<string, number>`
  — głębokość topologiczna (najdłuższa ścieżka od korzenia). Zakłada DAG.
- `topoOrder(nodeIds, edges): string[]` — porządek topologiczny; guard/util.
- `nodeState(input: { hasEvents: boolean; atTopVariation: boolean; prereqStates: NodeState[] }): NodeState`
  — `"mastered" | "in_progress" | "available" | "locked"` wg §2. (`atTopVariation`
  liczone z bieżącego wariantu vs max `ordinal`; gdy umiejętność ma 0 wariantów →
  nigdy `mastered`.)
- `orderWithinLayer(nodeIds, byName): string[]` — deterministyczna kolejność w
  warstwie (po nazwie, locale `pl`), żeby układ był stabilny między renderami.

Typy: `type NodeState = "mastered" | "in_progress" | "available" | "locked"`,
`interface Edge { from: string; requires: string }`.

**Plan testów (`skill-tree-math.test.ts`):**
- `wouldCreateCycle`: brak krawędzi → false; krawędź wprost zwrotna (Y→X gdy jest
  X→Y) → true; cykl pośredni A→B→C, dodaj C→A → true; samopętla → true; gałąź bez
  domknięcia → false.
- `assignLayers`: łańcuch (0,1,2,…), zbieżność (węzeł z dwoma prerekwizytami na
  różnych głębokościach bierze max), rozgałęzienie, izolowany węzeł = 0.
- `nodeState`: każdy z 4 stanów; `available` tylko gdy wszystkie prereki `mastered`;
  jeden `in_progress`/`locked` prereq → `locked`; przypisana nie-na-szczycie →
  `in_progress`; brak wariantów → nie `mastered`.
- `orderWithinLayer`: stabilność, sort `pl`.

---

## 5. Warstwa DB / repo

### 5.1 `app/lib/skills.ts` (rozszerzenie) — autoring krawędzi
- `addPrerequisite(db, trainerId, skillId, requiresSkillId)` — waliduje, że obie
  umiejętności są trenera; odrzuca samopętlę, duplikat (`UNIQUE`) i cykl
  (`wouldCreateCycle` na bieżących krawędziach) → `SkillError` z `userMessage`.
- `removePrerequisite(db, trainerId, skillId, requiresSkillId)`.
- `listPrerequisitesForSkill(db, trainerId, skillId)` — do edytora („Wymaga:").
- `listAssignablePrerequisites(db, trainerId, skillId)` — umiejętności trenera, które
  można dodać jako prereq (bez siebie, bez już dodanych, bez tych, które
  domykałyby cykl — filtr przez `wouldCreateCycle`).

### 5.2 `app/lib/skill-tree.ts` (nowy) — składanie drzewa
- `getSkillTreeForTrainer(db, trainerId)` → `{ nodes: TreeNode[]; edges: Edge[] }`
  z warstwami (`assignLayers`) i kolejnością w warstwie. Widok autora (bez stanów
  per-podopieczny). Tylko **aktywne** umiejętności (archiwizowane pomijane; ich
  krawędzie również).
- `getSkillTreeForTrainee(db, trainerId, traineeId)` → jw. + `state: NodeState` na
  węzeł. Reużywa `getSkillMapForTrainee` (bieżący wariant/zdarzenia per umiejętność),
  liczy `atTopVariation` i propaguje stany w porządku topologicznym, by `available`
  /`locked` zależały od `mastered` prerekwizytów.
- Tenant-scope: każda funkcja z wymaganym `trainerId`; `traineeId` re-weryfikowany
  jako podopieczny tego trenera (→ null → 404 w trasie).

`TreeNode`: `{ skillId, name, layer, orderInLayer, currentVariationId?, currentExerciseId?, state? }`.

---

## 6. Trasy, URL-e i nawigacja

Drzewo **zastępuje** dotychczasową mapę. Każdą trasę dopisać/zmienić w
`app/routes.ts`.

| URL | Plik | Zmiana | Rola |
|---|---|---|---|
| `/trener/umiejetnosci/$skillId` | `trener/umiejetnosci.$skillId.tsx` | **rozszerzenie** | edytor wariantów + sekcja „Wymaga:" (dodaj/usuń prereq, komunikat o cyklu) |
| `/trener/podopieczni/$traineeId/umiejetnosci` | `trener/podopieczni.$traineeId.umiejetnosci.tsx` | **przebudowa** | drzewo (stany per-podopieczny) zamiast płaskiej mapy |
| `/trener/podopieczni/$traineeId/umiejetnosci/$skillId` | `trener/podopieczni.$traineeId.umiejetnosci.$skillId.tsx` | **nowa** | drill-in: drabina wariantów + akcje start/awans/cofnij (treść dzisiejszej mapy per-umiejętność) |
| `/podopieczny/umiejetnosci` | `podopieczny/umiejetnosci.tsx` | **przebudowa** | drzewo read-only |
| `/podopieczny/umiejetnosci/$skillId` | `podopieczny/umiejetnosci.$skillId.tsx` | **nowa** | drill-in read-only: drabina wariantów |

Drill-in to osobny sub-widok (nie modal) — lepszy na mobile (podopieczny) i daje
własny URL (deep-link, back). Akcje awansu (POST) zostają jak w kierunku A, tylko
przeniesione na trasę drill-in.

Nawigacja bez zmian (pozycja „Umiejętności" już istnieje); etykieta może zmienić się
na „Drzewo umiejętności" (do ustalenia w UI).

---

## 7. UI / komponent prezentacyjny

- Nowy `app/components/skill-tree.tsx` — **czysta prezentacja** (bez fetchowania):
  - układ warstwowy z `layer`/`orderInLayer` (siatka CSS), krawędzie jako ścieżki
    SVG (beziery), kolor krawędzi wg stanu źródła (od `mastered` = akcent „ok",
    inaczej przygaszona/przerywana);
  - węzeł: ikona/inicjał, nazwa, mini-pasek poziomu (wariant n/N), „pill" stanu;
    cztery stany przez tokeny (`var(--ok)`/akcent/`var(--muted)`/`var(--danger)`),
    `role="img"` + `aria-label`, responsywność (mobile: warstwy w pionie);
  - klik węzła → link do drill-in.
- Render zgodny z `frontend-design:frontend-design` i design-systemem
  (`design-system/README.md`, `app/styles/tokens.css`); kolory **wyłącznie** przez
  `var(--*)` (bez hardkodów hex). UI po polsku; nazwy ćwiczeń EN zostają.
- Stany pokazywane tylko w widokach per-podopieczny; widok autora (edytor) pokazuje
  sam szkielet (struktura + krawędzie).

---

## 8. Autoryzacja i tenant-scope

Zgodnie z `app/lib/authz.ts` i konwencją repo:
- Każda funkcja repo z wymaganym `trainerId` (+ `traineeId` gdzie dotyczy); brak
  dopasowania → **404** (nie 403).
- Trener: pełny dostęp do swoich umiejętności/krawędzi i drzewa swoich
  podopiecznych; nie widzi/nie edytuje grafu trenera B.
- Podopieczny: **read-only** własne drzewo i drill-in; brak akcji autoringu i awansu;
  brak dostępu do innych podopiecznych.
- Dotyka `trainer_id`/autoryzacji → bramka `/security-review` na końcu.

---

## 9. Testy (TDD)

**Jednostkowe (test-first, Vitest, bez DB)** — `skill-tree-math.test.ts`: zakres z §4
(cykle, warstwy, stany, kolejność).

**Integracyjne (`*.itest.ts`, testcontainers — PISZ, uruchamia właściciel)** —
`tests/skill-tree.itest.ts`:
- Tenant-scope: trener A dostaje 404 na drzewie/edytorze prereków trenera B; nie doda
  krawędzi między umiejętnościami trenera B.
- Autoring: dodaj krawędź → widoczna w drzewie; odmowa cyklu (A→B→C, próba C→A);
  odmowa duplikatu; usunięcie krawędzi; kaskada — archiwizacja/usunięcie umiejętności
  usuwa jej krawędzie.
- Stany per-podopieczny: korzeń `mastered` → następnik `available`; dopóki prereq
  nie `mastered` → następnik `locked`; przypisanie startu → `in_progress`.
- Read-only podopiecznego: brak akcji autoringu/awansu (404/forbidden na POST).

**Bramki „done":** `npm test` + `npm run typecheck` + `npm run lint` +
`npm run build`, `/code-review` per task, `/security-review` (tenant-scope), oraz
zgłoszenie testów integracyjnych właścicielowi do uruchomienia (Docker).

---

## 10. Migracja danych i seed

- Migracja schematu: `npm run db:generate` (nowy plik w `migrations/`).
- Brak migracji istniejących danych — umiejętności/warianty/awansy bez zmian; brak
  krawędzi = drzewo płaskie (każdy węzeł korzeniem) — zachowanie degraduje się do
  dzisiejszej „listy umiejętności jako oddzielne korzenie".
- Seed (opcjonalnie, dogfooding): kilka przykładowych krawędzi między istniejącymi
  umiejętnościami trenera, jeśli są. Idempotentnie w `scripts/seed.ts`. Nieblokujące.

---

## 11. Dokumentacja do aktualizacji (część „done")

- `app/lib/README.md` — `skill-tree.ts`, `skill-tree-math.ts`, nowe eksporty w
  `skills.ts`.
- `app/lib/db/README.md` — nowa tabela `skill_prerequisites`.
- `app/routes/README.md`, `app/routes/trener/README.md`,
  `app/routes/podopieczny/README.md` — nowe/zmienione trasy (drzewo + drill-in).
- `app/components/README.md` — `skill-tree.tsx`.
- `CLAUDE.md` — jeśli zmieni się etykieta nawigacji „Umiejętności" → „Drzewo".
- `docs/innovate.md` — status pozycji „Drzewo prerekwizytów (DAG)" (z ⬜ na 🚧/✅).

---

## 12. Ryzyka i otwarte kwestie

| Ryzyko | Mitygacja |
|---|---|
| Krzyżujące się krawędzie przy gęstym grafie (ręczny SVG) | Akceptujemy w v1 (drzewa per-trener płytkie); warstwowanie ogranicza chaos; ewentualnie dagre w osobnym kroku. |
| „Zastąpienie mapy" = regresja istniejących tras Umiejętności | Testy integracyjne + ręczna weryfikacja (`npm run shots`) na obu rolach. |
| Drill-in na mobile (podopieczny) | Osobny sub-widok z własnym URL zamiast modala. |
| Trener tworzy „zablokowany" start mimo prereków | Świadome: prereki są podpowiedzią, nie twardą bramką; trener decyduje. |
| Reorder wariantów zmienia „atTopVariation" | `mastered` liczone z aktualnego max `ordinal`; spójne z kierunkiem A (id wariantu stabilne, historia trzyma referencje). |
| Archiwizowana umiejętność w grafie | Pomijana w drzewie i jego warstwach; krawędzie do/z niej nie wchodzą. |

---

## 13. Kryteria akceptacji

1. Trener dodaje w edytorze umiejętności prerekwizyty („Wymaga:"), nie może utworzyć
   cyklu ani duplikatu; usunięcie umiejętności sprząta jej krawędzie.
2. Widok per-podopieczny pokazuje **drzewo** umiejętności w warstwach z czterema
   stanami węzła; kolory/krawędzie odzwierciedlają postęp podopiecznego.
3. Węzeł bez przypisania, którego wszystkie prereki są `mastered`, ma stan
   **available** („gotowe do startu"); z niespełnionym prereq — **locked**.
4. Klik węzła prowadzi do drill-in z drabiną wariantów; trener ma tam akcje
   start/awans/cofnij, podopieczny widzi read-only.
5. Drzewo zastąpiło dotychczasową płaską mapę na obu trasach (`/trener/podopieczni/
   $traineeId/umiejetnosci`, `/podopieczny/umiejetnosci`).
6. Trener A nie ma dostępu (404) do drzewa/prereków trenera B — potwierdzone testem
   integracyjnym.
7. Bramki „done" zielone: `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run build`, `/code-review`, `/security-review`; testy integracyjne zgłoszone
   właścicielowi.
