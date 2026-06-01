# Statystyki — rozwiązanie zakładki i redystrybucja (design spec)

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-06-01
**Powiązane:**
- [`2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci-design.md`](2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci-design.md) (Rozwój przejął per-ćwiczeniowy postęp)
- [`2026-06-01-progresja-redesign-design.md`](2026-06-01-progresja-redesign-design.md) (definicja postępu = `best`)

---

## 0. Kontekst i decyzje wejściowe

Po wchłonięciu per-ćwiczeniowej progresji przez „Rozwój" osobna zakładka
**„Statystyki"** jako pasywny cel nawigacji wnosi mało: część jej treści dubluje
„Rozwój" (a robi to na starej metryce `avgReps`, sprzecznej z `best`), a reszta to
agregaty, które mają naturalniejszy **dom kontekstowy** — u podopiecznego pulpit,
u trenera widok konkretnego podopiecznego (cockpit klienta).

Decyzje z brainstormu (2026-06-01):
- **Zakładka „Statystyki" znika** w obu rolach; jej unikalne sekcje przenosimy.
- **Redystrybucja kuratorska, nie przeszczep 1:1.** Wciągamy sekcje wysokiego
  sygnału; reszta odpada.
- **Sekcje per-ćwiczeniowe USUWAMY (nie przenosimy):** lista PR, tabela
  „Ćwiczenia/status", sparkline top-5. „Rozwój" je pokrywa lepiej (na `best`).
  To kasuje duplikację **i** niespójność `avgReps` vs `best`.
- **Pulpit podopiecznego = curated high-signal** (mobile-first, krótko).
- Bez zmian w modelu danych. Reuse `app/lib/stats.ts` + `components/stat-widgets.tsx`.

---

## 1. Cel i nie-cele

### Cel
Usunąć zakładkę „Statystyki" w obu rolach i przenieść jej **wartościowe, nie-duplikujące**
sekcje do istniejących ekranów: pulpit podopiecznego (`/podopieczny`) i widok
podopiecznego u trenera (`/trener/podopieczni/$traineeId`). Stare URL-e → redirect 301.

### Nie-cele
- Brak zmian w `schema.ts`/migracjach.
- Brak nowych metryk/agregacji — tylko relokacja istniejących z `stats.ts`.
- Brak ruszania „Rozwoju" ani trenerskiego autoringu „Umiejętności".
- Brak przenoszenia sekcji per-ćwiczeniowych (są usuwane).

---

## 2. Mapa redystrybucji — podopieczny

Źródło: `app/routes/podopieczny/statystyki.tsx`. Cel: `app/routes/podopieczny/_index.tsx`
(pulpit ma już: baner Wrapped, nagłówek + „Zarejestruj sesję", mini-pasek liczników
[tydzień/łącznie/ostatnia], kartę aktywnego planu, grid „Sesje w planie" + „Historia").

| Sekcja (dzisiejsze Statystyki) | Funkcja `stats.ts` | Decyzja |
|---|---|---|
| Hero (streak, najdłuższy streak, dzień podróży, łączne powt., sek. pod tension) | `getHeroStats` | **Przenieść** — zastępuje/rozszerza obecny mini-pasek liczników |
| „Ten tydzień vs średnia" | `getThisWeekStats` | **Przenieść** (komunikat motywacyjny) |
| Heatmapa „Twój rok" (26 tyg.) | `getActivityHeatmap` | **Przenieść** |
| Balans intensywności RPE (30 dni) | `getEffortBalance` | **Przenieść** |
| Lista Wrapped (dostępne miesiące) | `getAvailableWrappedMonths` | **Przenieść zwięźle** — kompaktowy rząd linków (jedyny punkt dostępu do starszych wrappedów; baner pokazuje tylko najnowszy) |
| Rozkład kategorii (30 dni) | `getTagDistribution` | **Usunąć** z pulpitu (trzymamy krótko; pozostaje u trenera) |
| „Łatwiej Ci niż kiedyś" | `getEasierAtSameReps` | **Usunąć** z pulpitu (nice-to-have; sygnał i tak żyje w sugestiach awansu) |
| „Ten miesiąc" (sesje/PR/top) | `getMonthSummary` | **Usunąć** (pokrywa Wrapped + hero) |
| Progresja ulubionych (sparkline top-5) | `getTopExerciseSparklines` | **Usunąć** → „Rozwój" |
| Rekordy osobiste (lista) | `getPersonalRecords` | **Usunąć** → „Rozwój" (rekord per wiersz na liście) |

Pulpit po zmianie (kolejność): baner Wrapped → nagłówek + CTA → **hero (rozszerzony
pasek)** → karta aktywnego planu → **„ten tydzień"** → **heatmapa** → **balans RPE** →
grid „Sesje w planie" + „Historia" → **kompaktowy rząd Wrapped**. Stany puste jak dziś
(gdy 0 sesji — hero/heatmapa się nie pokazują).

## 3. Mapa redystrybucji — trener

Źródło: `app/routes/trener/podopieczni.$traineeId.statystyki.tsx`. Cel:
`app/routes/trener/podopieczni.$traineeId.tsx` (ma już: crumbs, pagehead z przyciskami,
karty planów [aktywny/draft/brak], „Historia treningów" z `ListControls`+paginacją,
„Strefa niebezpieczna").

| Sekcja | Funkcja `stats.ts` | Decyzja |
|---|---|---|
| **Health tiles** (dni od sesji, 7/30d, interwał, RPE-trend, czerwona strefa %, ukończone %) | `getHealthStats` | **Przenieść — na górę** (readiness od razu po wejściu w klienta) |
| Heatmapa (12 tyg.) | `getActivityHeatmap` | **Przenieść** |
| **Plateau** (reps stoją + RPE nie spada) | `getPlateauExercises` | **Przenieść** (flaga „rozważ zmianę wariantu" — spina się z drzewem) |
| Wykorzystanie planu + sumy | `getActivePlanSessionUsage`, `getCurrentPlanTotals` | **Przenieść** (adherence) |
| Coverage: wideo + zdjęcia | `getVideoCoverage`, `getBodyPhotoCoverage` | **Przenieść** |
| Rozkład kategorii (30 dni) | `getTagDistribution` | **Przenieść** (balans push/pull — coaching) |
| „Ćwiczenia" (tabela PR/śr./delta/status) | `getExerciseProgress` | **Usunąć** → „Rozwój" |
| Podsumowanie „Rośnie/Stoi/Cofa/Plateau" | `getExerciseProgress` | **Usunąć** (status per-ćwiczenie jest w „Rozwoju"; licznik plateau zostaje przy sekcji Plateau) |
| Sparkline top-5 | `getTopExerciseSparklines` | **Usunąć** → „Rozwój" |
| Mini-lista PR | `getPersonalRecords` | **Usunąć** → „Rozwój" |

Układ widoku podopiecznego po zmianie: crumbs → pagehead (przyciski **bez „Statystyki"**)
→ **health tiles** → komunikaty akcji → karty planów → **blok: heatmapa · plateau ·
wykorzystanie planu · coverage · kategorie** → „Historia treningów" → „Strefa
niebezpieczna". Cross-link „Zobacz progresję →" do `…/rozwoj` przy bloku statystyk.

## 4. Trasy, nawigacja, redirecty

- **Usunąć z nawigacji:** pozycja „Statystyki" w `podopieczny/_layout.tsx` (`NAV_ITEMS`)
  oraz przycisk „Statystyki" w pasku `trener/podopieczni.$traineeId.tsx`.
- **Trasy `statystyki` → redirect-shimy 301:**
  - `app/routes/podopieczny/statystyki.tsx` → `redirect("/podopieczny", 301)`
  - `app/routes/trener/podopieczni.$traineeId.statystyki.tsx` → `redirect(\`/trener/podopieczni/${traineeId}\`, 301)`
  Wpisy w `app/routes.ts` zostają (wskazują shimy).
- Brak nowych tras.

## 5. Warstwa logiki (`stats.ts`) — sprzątanie martwego kodu

Funkcje pozostają tam, gdzie nadal mają konsumenta. Po relokacji:
- **Nadal używane:** `getHeroStats`, `getThisWeekStats`, `getActivityHeatmap`,
  `getEffortBalance`, `getHealthStats`, `getPlateauExercises`,
  `getActivePlanSessionUsage`, `getCurrentPlanTotals`, `getVideoCoverage`,
  `getBodyPhotoCoverage`, `getTagDistribution`, `getAvailableWrappedMonths` (wrapped.ts).
- **`getExerciseProgress`** — NIE usuwać: używa go `getSkillMapForTrainee` (sugestie awansu).
- **Kandydaci do usunięcia, jeśli po zmianie nie mają żadnego konsumenta** (zweryfikować
  Grepem przed usunięciem): `getTopExerciseSparklines`, `getMonthSummary` (+ stała
  `MONTH_NAMES`), oraz `getPersonalRecords`/`getEasierAtSameReps` **tylko jeśli** nic
  innego ich nie woła. Uwaga: `getMonthSummary` woła `getPersonalRecords`, a
  `getEasierAtSameReps` jest wejściem do sugestii w `skill-progression.ts` — **`getEasierAtSameReps` zostaje**. `getPersonalRecords` może mieć innych konsumentów
  (np. `getMonthSummary`, `detectNewPRsForLog` jest osobny) — usuwać wyłącznie po
  potwierdzeniu zerowego użycia. **Zasada: nie usuwaj funkcji, której Grep pokazuje
  użycie.** Gdy wątpliwość — zostaw (martwy eksport jest mniejszym złem niż błąd builda).

## 6. Komponenty

Sekcje prezentacyjne z usuwanych plików `statystyki.tsx` (HeroCard, ThisWeekCard,
EffortCard, HealthTiles, PlateauSection, PlanSection, CoverageSection,
TagDistributionCard, heatmapa) **przenieść do komponentów współdzielonych**, by trasy
docelowe (pulpit / widok podopiecznego) zostały zwięzłe:
- `app/components/trainee-stats.tsx` — karty pulpitu podopiecznego (hero, ten tydzień,
  heatmapa, balans RPE, kompaktowy Wrapped).
- `app/components/trainee-health.tsx` — karty cockpitu trenera (health tiles, plateau,
  wykorzystanie planu, coverage, kategorie, heatmapa).
Czysta prezentacja, kolory przez tokeny `var(--*)`, UI po polsku. Dokładny podział
i sygnatury doprecyzuje plan. (Bazują na `components/stat-widgets.tsx`.)

## 7. Autoryzacja / tenant-scope

Bez nowych przepływów. Loadery docelowe już mają scope (pulpit: `user.id`; widok
trenera: weryfikacja własności podopiecznego → 404). Funkcje `stats.ts` przyjmują
`traineeId`; autoryzacja w warstwie trasy bez zmian.

## 8. Testy

- **Jednostkowe:** brak nowej czystej logiki (relokacja prezentacji). Istniejące testy
  `stats`/`progression-math` zostają zielone.
- **Integracyjne (`*.itest.ts`, właściciel uruchamia):** dopisać do istniejącego
  zestawu: redirecty 301 `…/statystyki` → pulpit / widok podopiecznego; widok trenera
  zwraca health/plateau/plan/coverage dla własnego podopiecznego i 404 dla obcego.
- **Wizualne:** `npm run shots` na `/podopieczny` i `/trener/podopieczni` (desktop+mobile)
  — pulpit nie może urosnąć w nieczytelny scroll na mobile (kryterium curated).

## 9. Dokumentacja

- `app/routes/podopieczny/README.md`, `app/routes/trener/README.md` — usunąć wiersze
  `statystyki` (→ shim 301), zaktualizować opis pulpitu / widoku podopiecznego.
- `app/components/README.md` — dopisać `trainee-stats.tsx`, `trainee-health.tsx`.
- `app/lib/README.md` — jeśli usunięto funkcje z `stats.ts`, zaktualizować opis.
- `CLAUDE.md` — jeśli wymieniono „Statystyki" jako pozycję nawigacji.

## 10. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Pulpit podopiecznego za długi na mobile | Zakres **curated** (hero/tydzień/heatmapa/RPE + zwięzły Wrapped); reszta usunięta; `npm run shots`. |
| Widok trenera za długi | Akceptowalne dla cockpitu (desktop); health na górze, reszta w jednym bloku przed historią. |
| Usunięcie funkcji `stats.ts` z ukrytym konsumentem (np. sugestie awansu) | Grep przed usunięciem; `getExerciseProgress`/`getEasierAtSameReps` zostają; build jako bramka. |
| Utrata dostępu do starszych Wrapped (był na Statystykach) | Kompaktowy rząd Wrapped na pulpicie zostaje. |
| Stare linki/cache do `/statystyki` | Redirect 301 w obu rolach. |

## 11. Kryteria akceptacji

1. Brak pozycji/zakładki „Statystyki" w nawigacji obu ról; `/podopieczny/statystyki`
   i `/trener/podopieczni/:id/statystyki` → **301** na pulpit / widok podopiecznego.
2. Pulpit podopiecznego pokazuje (curated): hero (streak/journey/total/SUT), „ten
   tydzień", heatmapę, balans RPE, kompaktowy Wrapped — i nie zawiera sekcji
   per-ćwiczeniowych ani „ten miesiąc/kategorie/łatwiej".
3. Widok podopiecznego u trenera pokazuje: health tiles (na górze), heatmapę, plateau,
   wykorzystanie planu + sumy, coverage, rozkład kategorii — i nie zawiera tabeli
   ćwiczeń/sparkline/PR (są w „Rozwoju").
4. Żadna metryka per-ćwiczenie nie jest już liczona na `avgReps` poza „Rozwojem"
   (sprzeczność `avgReps` vs `best` zlikwidowana przez usunięcie tych sekcji).
5. Bez zmian w `schema.ts`/migracjach; `npm test` + `typecheck` + `lint` + `build`
   zielone; `npm run shots` potwierdza czytelność (mobile pulpit nie przerasta).
6. `stats.ts` bez funkcji bez konsumenta (zweryfikowane Grepem) — lub świadomie
   zostawione z adnotacją; build zielony.
