# Rozwój — połączenie „Progresji" i „Umiejętności" (design spec)

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-06-01
**Powiązane:**
- [`2026-06-01-progresja-redesign-design.md`](2026-06-01-progresja-redesign-design.md) (silnik wykresów, „jedna definicja postępu" = `best`)
- [`2026-06-01-umiejetnosci-progresja-wariantow-design.md`](2026-06-01-umiejetnosci-progresja-wariantow-design.md) (drabiny wariantów, awanse, sugestia)
- [`2026-06-01-drzewo-umiejetnosci-design.md`](2026-06-01-drzewo-umiejetnosci-design.md) (DAG prerekwizytów, stany węzłów)

---

## 0. Kontekst i decyzje wejściowe

Po wdrożeniu „Progresji" (redesign) i „Umiejętności" (drabiny + drzewo) okazało się,
że dla użytkownika to **dwa nakładające się koncepty trzymane w dwóch silosach
nawigacji**. Rozdzielenie było pierwotnie świadome (spec umiejętności §16:
„Progresja = szereg czasowy, Umiejętności = drabiny wariantów"), ale rozbija
spójną narrację „postępu podopiecznego".

Decyzje ustalone w brainstormie (2026-06-01), na których stoi ten dokument:

- **Co łączymy:** *powierzchnię i nawigację*, nie miary. Dwie miary pozostają
  odrębne (są prostopadłe, nie duplikatywne): oś **ilościowa w obrębie jednego
  ćwiczenia** (rekord w czasie) i oś **jakościowa między wariantami** (drabina/drzewo).
  Zlanie ich w jedną liczbę odtworzyłoby chaos, który redesign Progresji posprzątał.
- **Obiekt-dom:** **drzewo umiejętności**. To wyróżnik produktu; wykres rekordu-w-czasie
  wchodzi jako drill-in w węzeł (przy bieżącym wariancie).
- **Ćwiczenia spoza umiejętności:** równorzędna lista pod drzewem (pełna lista
  Progresji), żeby nowy ekran nie gubił danych (rozgrzewki, akcesoria, core, mobility).
- **Nazwa powierzchni:** **„Rozwój"** — neutralny parasol obejmujący drzewo i liczby.
- **Strategia tras:** nowe poddrzewo `/rozwoj/*`, stare `progresja*`/`umiejetnosci*`
  (per-podopieczny) wygaszone redirectami.
- **Bez zmian w modelu danych.** Czysta przebudowa IA na istniejących repozytoriach.

---

## 1. Cel i nie‑cele

### Cel
Połączyć per‑podopieczny widoki „postępu" w jedną powierzchnię **„Rozwój"**:
drzewo umiejętności jako ekran główny + pełna lista progresji ćwiczeń spoza
umiejętności pod nim + wspólny szczegół węzła (drabina wariantów *i* wykres
rekordu‑w‑czasie bieżącego wariantu w jednym miejscu). Dotyczy obu ról
(podopieczny i trener oglądający podopiecznego).

### Nie‑cele (świadome cięcia)
- **Brak zmian w `schema.ts` i migracjach.** Reuse istniejących repo.
- **Brak scalania miar** w jedną liczbę „postępu" (rekord pozostaje rekordem,
  poziom na drabinie — poziomem).
- **Brak zmian w trenerskim autoringu umiejętności** (`/trener/umiejetnosci*`):
  lista / nowa / edytor wariantów + prerekwizytów zostają jak są (warstwa
  *definicji*, sibling „Biblioteki").
- **Brak nowych przepływów logowania / auth / plików.**
- **Brak porównywania wariantu z „zwykłym" ćwiczeniem** w jednym wykresie
  porównania (porównanie działa w obrębie listy „Pozostałe ćwiczenia"). Roadmapa.
- **Brak stitchowania linii przez warianty** — wykres przy węźle pokazuje tylko
  bieżący wariant (zasada „jedna linia = jeden ruch" z redesignu Progresji).

---

## 2. Słownik

- **Rozwój** — połączona powierzchnia per‑podopieczny (drzewo + lista + szczegóły).
- **Węzeł** — umiejętność na drzewie; ma stan per‑podopieczny i bieżący wariant.
- **Szczegół węzła** — wspólny ekran: drabina wariantów + wykres rekordu‑w‑czasie
  bieżącego wariantu + (trener) akcje awansu.
- **Pozostałe ćwiczenia** — ćwiczenia z logami, które **nie** są wariantem żadnej
  umiejętności; żyją w liście pod drzewem.

---

## 3. Zakres i rozgraniczenie ról

| Obszar | Dziś | Po zmianie |
|---|---|---|
| Podopieczny — postęp | `/podopieczny/progresja*` + `/podopieczny/umiejetnosci*` | `/podopieczny/rozwoj*` |
| Trener — postęp podopiecznego | `…/$traineeId/progresja*` + `…/$traineeId/umiejetnosci*` | `…/$traineeId/rozwoj*` |
| Trener — **autoring** umiejętności | `/trener/umiejetnosci*` (lista/nowa/edytor) | **bez zmian** |

U trenera pozostają więc dwa rozłączne pojęcia: top‑level **„Umiejętności"**
(budowanie drabin i drzewa, warstwa definicji) oraz per‑podopieczny zakładka
**„Rozwój"** (gdzie podopieczny jest + jak rośnie). To rozgraniczenie jest celowe.

---

## 4. Ekrany

### 4.1 Landing „Rozwój"
Trasy: `podopieczny/rozwoj._index.tsx`,
`trener/podopieczni.$traineeId.rozwoj._index.tsx`.

- **Góra — drzewo (bohater):** `SkillTreeView` (`showStates`, kolory per‑podopieczny:
  mastered/in_progress/available/locked). Klik węzła → §4.2.
- **Dół — „Pozostałe ćwiczenia":** dzisiejsza lista Progresji
  (`StatusSummaryBar` + `<ListControls>`: sort / filtr‑tagi / szukajka; wiersze:
  sparkline trendu, odznaka statusu liczona z `best`, „rekord"; tryb porównania),
  **ograniczona do ćwiczeń spoza umiejętności**. Klik wiersza → §4.3.
- **Akcent trenera:** imię podopiecznego w nagłówku; lista z domyślnym sortem
  „Wymaga uwagi" (jak w redesignie Progresji); stany węzłów diagnostyczne.
- **Pusty stan:** brak umiejętności → samo drzewo pokazuje pusty stan; brak
  „pozostałych" → komunikat zamiast listy.

### 4.2 Szczegół węzła
Trasy: `podopieczny/rozwoj.umiejetnosc.$skillId.tsx`,
`trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx`.

Wspólny ekran zlewający oba światy:
- Okruszki: `Rozwój › {nazwa umiejętności}`.
- `VariationLadder` z „TU JESTEŚ" (drabina wariantów + stany).
- **Wykres „rekord w czasie" bieżącego wariantu** — osadzony szczegół Progresji
  ćwiczenia bieżącego wariantu: pasek KPI + `ProgressionLineChart` + `VolumeBars`
  + przełącznik „Okres" (`?zakres=`). Gdy bieżący wariant bez logów →
  „Brak danych — zaloguj trening na tym wariancie".
- Historia awansów (`<details>` oś czasu zdarzeń).
- **Trener:** akcje `set-start` / `advance` / `regress` + sugestia (`entry.suggestion`).
  **Podopieczny:** read‑only (bez akcji, bez sugestii).

### 4.3 Szczegół zwykłego ćwiczenia
Trasy: `podopieczny/rozwoj.cwiczenie.$exerciseId.tsx`,
`trener/podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx`.

Dzisiejszy szczegół Progresji (KPI + `ProgressionLineChart` + `VolumeBars`
+ przełącznik „Okres"), tylko pod nowym URL i z okruszkami `Rozwój › {ćwiczenie}`.
404 gdy ćwiczenie bez logów (jak dziś).

### 4.4 Porównanie
Trasy: `podopieczny/rozwoj.porownanie.tsx`,
`trener/podopieczni.$traineeId.rozwoj.porownanie.tsx`.

Dzisiejszy widok porównania (`ComparisonChart` + `ComparisonChartLegend` + tabelka
„konkretnie", `?ex=`, `?zakres=`), pod nowym URL. Wejście z trybu porównania na
liście (§4.1). Trasy `rozwoj/porownanie`, `rozwoj/cwiczenie/:exerciseId` i
`rozwoj/umiejetnosc/:skillId` mają rozłączne prefiksy — brak kolizji segmentów
(inaczej niż w starym `progresja.porownanie` vs `progresja.$exerciseId`).

---

## 5. Trasy i redirecty

Nowe pliki tras (× podopieczny i × trener), dopisane do `app/routes.ts`
(konwencja `segment.$param.tsx`):

| URL (podopieczny) | URL (trener) | Plik (rola) |
|---|---|---|
| `/podopieczny/rozwoj` | `…/$traineeId/rozwoj` | `rozwoj._index.tsx` |
| `/podopieczny/rozwoj/umiejetnosc/:skillId` | `…/rozwoj/umiejetnosc/:skillId` | `rozwoj.umiejetnosc.$skillId.tsx` |
| `/podopieczny/rozwoj/cwiczenie/:exerciseId` | `…/rozwoj/cwiczenie/:exerciseId` | `rozwoj.cwiczenie.$exerciseId.tsx` |
| `/podopieczny/rozwoj/porownanie` | `…/rozwoj/porownanie` | `rozwoj.porownanie.tsx` |

**Redirecty (301)** ze starych tras per‑podopieczny — cienkie loadery zwracające
`redirect(...)` (zachowują `?zakres=`/`?ex=`), chronią zakładki i cache PWA:

| Stara trasa | Nowa |
|---|---|
| `…/progresja` | `…/rozwoj` |
| `…/progresja/porownanie` | `…/rozwoj/porownanie` |
| `…/progresja/:exerciseId` | `…/rozwoj/cwiczenie/:exerciseId` |
| `…/umiejetnosci` | `…/rozwoj` |
| `…/umiejetnosci/:skillId` | `…/rozwoj/umiejetnosc/:skillId` |

Stare pliki tras zostają jako redirect‑shimy (albo `app/routes.ts` mapuje stary
URL na nowy plik z redirect‑loaderem) — decyzję o formie podejmie plan; ważne, by
żaden zewnętrzny link nie zwracał 404.

---

## 6. Warstwa logiki (reuse, bez zmian w schemacie)

- **Drzewo:** `getSkillTreeForTrainee(db, trainerId, traineeId)` (`skill-tree.ts`).
- **Lista „Pozostałe":** `listProgressionExercises(...)` (`progression.ts`)
  **+ wykluczenie wariantów**. Potrzebny zbiór `exercise_id` będących wariantami
  umiejętności trenera (jedno zapytanie do `skill_variations` per trener). Filtr:
  - **opcja A (preferowana):** czysty helper `partitionSkillVariantIds(...)` /
    filtrowanie listy w loaderze po zbiorze ID — testowalne bez DB (TDD);
  - albo parametr `excludeExerciseIds` w `listProgressionExercises`.
- **Szczegół węzła:** `getSkillMapForTrainee(...)` (wariant bieżący, historia,
  `currentExerciseId`, `currentHasLogs`, sugestia) + `getExerciseProgression(currentExerciseId, …)`.
- **Szczegół ćwiczenia / porównanie:** `getExerciseProgression` / `getProgressionComparison`.
- **Akcje awansu:** `recordAdvancement` / `setStartingLevel` (`skill-progression.ts`).
- **Tenant‑scope:** `findTraineeOfTrainer(...)` → 404 gdy null (wszystkie trasy trenera).

Brak nowych agregacji; brak duplikowania logiki.

---

## 7. Nawigacja, layout, dostępność

- **Menu:** jedna pozycja **„Rozwój"** zamiast „Progresja" + „Umiejętności" —
  w `podopieczny/_layout.tsx` i w pasku zakładek podopiecznego u trenera
  (`trener/podopieczni.$traineeId.tsx`). Trenerskie top‑level „Umiejętności"
  (autoring) **zostaje**.
- **Linki wewnętrzne:** pulpity i banery wskazujące `…/progresja`/`…/umiejetnosci`
  → na `…/rozwoj` (lub konkretny drill‑in). Cross‑link „Zobacz wyniki w czasie →"
  przy wariancie wskazuje teraz wykres w szczególe węzła (ten sam ekran) — można
  go uprościć/usunąć, bo wykres jest tuż obok drabiny.
- **Mobile/PWA (główne ryzyko UX):** drzewo na wąskim ekranie — warstwę wizualną
  prowadzi `frontend-design:frontend-design` (kolory wyłącznie przez tokeny
  `var(--*)`, UI po polsku, nazwy ćwiczeń EN). Weryfikacja `npm run shots`
  (desktop + mobile). Rozważyć kompaktowy/scrollowalny układ drzewa na mobile.
- **Dostępność:** `role="img"` + `aria-label` na wykresach i drzewie (bez zmian
  względem istniejących komponentów).

---

## 8. Autoryzacja i tenant‑scope

Zgodnie z `app/lib/authz.ts` i konwencją repo:
- Trasy trenera: `findTraineeOfTrainer` → **404** gdy podopieczny nie należy do trenera.
- Trasy podopiecznego: `requireUser({ role: "trainee" })`; `user.trainerId` jako scope.
- Podopieczny **read‑only** na całym `/rozwoj*` — żaden POST awansu (→ 404/405).
- Trener A nie widzi/nie awansuje danych podopiecznego trenera B przez bezpośredni URL.

---

## 9. Testy

- **Unit (TDD, bez DB):** nowy helper filtrujący warianty z listy „Pozostałe"
  (partycja ID skill‑variant vs reszta; przypadki: brak umiejętności, ćwiczenie =
  wariant, ćwiczenie spoza). Reszta logiki bez zmian (już pokryta).
- **Integracyjne (`*.itest.ts`, testcontainers — uruchamia właściciel):**
  - tenant‑scope na `/rozwoj*` (trener A → 404 na podopiecznym trenera B);
  - redirecty: stare URL‑e (`progresja*`, `umiejetnosci*`) zwracają 301 na nowe,
    z zachowaniem query (`?zakres=`, `?ex=`);
  - read‑only podopiecznego (POST awansu na `/podopieczny/rozwoj*` → 404);
  - lista „Pozostałe" nie zawiera ćwiczeń będących wariantami umiejętności.
- **Wizualne:** `npm run shots` na `/podopieczny/rozwoj` i trasie trenera
  (desktop + mobile) — czytelność drzewa + listy + szczegółu węzła.

Bramki „done": `npm test` + `npm run typecheck` + `npm run lint` + `npm run build`,
`/code-review` per task, oraz `/security-review` (dotyka tenant‑scope/autoryzacji
na nowych trasach).

---

## 10. Dokumentacja do aktualizacji (część „done")

- `app/routes/podopieczny/README.md` — `progresja*`/`umiejetnosci*` → `rozwoj*` (+ redirecty).
- `app/routes/trener/README.md` — per‑podopieczny `rozwoj*`; zaznaczyć, że
  top‑level `umiejetnosci*` (autoring) zostaje.
- `app/routes/README.md` — opis sekcji, jeśli się zmienia.
- `app/lib/README.md` — jeśli dojdzie helper filtrujący / parametr `listProgressionExercises`.
- `CLAUDE.md` — jeśli zmienia się nazwa pozycji nawigacji (Progresja+Umiejętności → „Rozwój").
- `docs/innovate.md` — ewentualna notka o konsolidacji widoków (kierunek A).

---

## 11. Ryzyka i otwarte kwestie

| Ryzyko | Mitygacja |
|---|---|
| Gęstość drzewa na mobile (PWA, główny ekran podopiecznego) | `frontend-design` + `npm run shots`; kompaktowy/scrollowalny układ; pusty/zwięzły stan. |
| Podwójne listowanie (wariant w drzewie i na liście) | Lista = **tylko spoza umiejętności**; warianty wyłącznie w drzewie. |
| Stare linki/cache PWA na `…/progresja`/`…/umiejetnosci` | Redirecty 301 ze wszystkich starych tras per‑podopieczny. |
| Węzeł, którego bieżący wariant nie ma logów (pusty wykres) | Jawny stan „Brak danych — zaloguj trening". |
| Utrata porównania wariant↔zwykłe ćwiczenie | Świadome cięcie v1; gdyby uwierało → lista „wszystkie z odznaką umiejętności" (alternatywa w §1). |
| Mylenie trenerskiego autoringu „Umiejętności" z per‑podopieczny „Rozwój" | Rozgraniczenie w §3; różne nazwy pozycji menu. |

---

## 12. Kryteria akceptacji

1. Jedna pozycja menu **„Rozwój"** (podopieczny i pasek zakładek u trenera)
   zamiast „Progresja" + „Umiejętności"; trenerski autoring „Umiejętności" działa
   bez zmian.
2. `…/rozwoj` pokazuje drzewo (stany per‑podopieczny) u góry i listę „Pozostałe
   ćwiczenia" (spoza umiejętności) pod nim z paskiem statusów, kontrolkami i trybem
   porównania.
3. Klik węzła → szczegół z drabiną „TU JESTEŚ" **oraz** wykresem rekordu‑w‑czasie
   bieżącego wariantu na jednym ekranie; u trenera akcje awansu, u podopiecznego
   read‑only.
4. Klik wiersza listy → szczegół ćwiczenia (jak dzisiejsza Progresja) pod
   `…/rozwoj/cwiczenie/:exerciseId`.
5. Stare URL‑e (`…/progresja`, `…/progresja/:id`, `…/progresja/porownanie`,
   `…/umiejetnosci`, `…/umiejetnosci/:id`) przekierowują 301 na odpowiedniki
   `…/rozwoj…` z zachowaniem query.
6. Lista „Pozostałe ćwiczenia" nie zawiera ćwiczeń będących wariantami umiejętności.
7. Trener A → 404 na `…/rozwoj*` podopiecznego trenera B; podopieczny nie może
   wywołać awansu — potwierdzone testami integracyjnymi.
8. Bez zmian w `schema.ts`/migracjach.
9. Bramki „done" zielone: `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run build`, `/code-review`, `/security-review`; `npm run shots` potwierdza
   czytelność na desktop + mobile.
