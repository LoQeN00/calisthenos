# Progresja — przeprojektowanie (design spec)

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-06-01
**Dotyczy:** modułu „Progresja" (podopieczny + trener)

---

## 1. Problem

Obecna zakładka „Progresja" jest dla użytkownika niezrozumiała. Zdiagnozowane
przyczyny:

1. **Trzy konkurujące definicje „postępu" na jednym ekranie.** Wykres główny
   liczy MAX powtórzeń w sesji (`best`), odznaka statusu na liście liczy *średnie*
   powtórzenia z 4 sesji (`avgReps`, `statusFromSessions`), a „Zmiana w okresie"
   liczy jeszcze inaczej (`computePeriodChangePct` na `best`). Liczby potrafią się
   wykluczać.
2. **Wykresy bez skali i kontekstu.** Brak osi Y i wartości na punktach; tylko
   punkt PR ma podpis. Kolor kropek (RPE) bez legendy na ekranie. Nie wiadomo,
   jakie dane prezentują.
3. **Przełącznik zakresu (`4 tyg / 3 mies / 6 mies / cały`) bez etykiety** — nie
   wiadomo, że to zakres czasu.
4. **Brak interaktywności.** Wartości siedzą w `<title>` SVG — na telefonie
   (główny ekran podopiecznego) tooltipy nie pokażą się po dotknięciu.
5. **Sekcja „Siła = lżej" nieczytelna** — kryptyczny tytuł, dwie linie na dwóch
   różnych, niepodpisanych osiach (powtórzenia vs RPE).

## 2. Cel i nie-cele

### Cel
Przeprojektować Progresję tak, by w 2 sekundy odpowiadała na jedno jasne pytanie:
**„czy rosnę w tym ćwiczeniu?"** — z czytelnymi, interaktywnymi wykresami i jedną,
spójną definicją postępu. Dotyczy obu ról (podopieczny + trener).

### Nie-cele
- Brak zmian w modelu danych (`schema.ts`) i migracjach. Pracujemy na istniejących
  zapisach treningów.
- Brak zmian w przepływie logowania treningu, auth, plikach.
- Brak nowych tras — przebudowa istniejących widoków.
- Brak migracji istniejących wykresów spoza Progresji (`stat-widgets.tsx`) na nowy
  silnik — to ewentualny późniejszy krok, nie ten.

## 3. Decyzje fundamentalne

| Decyzja | Wybór |
|---|---|
| Główna miara postępu | **Najlepsza seria / rekord** (`best` = max powtórzeń/sekund w sesji). Wszędzie ta sama. |
| Miary wspierające | Objętość (suma powtórzeń) i wysiłek (RPE) — pomocnicze, nie równorzędne. |
| Odbiorcy | **Oba** widoki współdzielą wykresy; podopieczny = ton motywacyjny, trener = ton diagnostyczny. |
| Silnik wykresów | **visx** (Airbnb) — niskopoziomowe prymitywy d3+React → czysty SVG. |

### Dlaczego visx (a nie Recharts / dalej ręczny SVG)
- **Czysty SSR** (React Router v7 renderuje na serwerze) — visx to czysty SVG, brak
  migotania/hydration-mismatch. Recharts mierzy szerokość po stronie klienta
  (`ResponsiveContainer`) → ryzyko „skoku".
- **Spójność stylu** — pełna kontrola nad SVG pozwala trzymać idiom `stat-widgets`
  (kolory przez `var(--*)`, liczby w `var(--font-mono)`, `role="img"` + `aria-label`).
- **Interaktywność na dotyk** — `@visx/tooltip` + `@visx/event` `localPoint`
  (hover ORAZ `onTouchMove`); to rozwiązuje pkt 4.
- **Lekkość** — tree-shakeable, bierzemy tylko potrzebne pakiety; lepsze dla PWA niż
  monolityczny Recharts.
- Koszt: trochę więcej kodu niż gotowiec oraz **drugi wzorzec wykresów obok
  ręcznego `stat-widgets`** (świadomy, zaakceptowany kompromis).

## 4. Ekrany

### 4.1 Lista Progresji (wejście do zakładki)
Trasy: `podopieczny/progresja._index.tsx`,
`trener/podopieczni.$traineeId.progresja._index.tsx`.

- **Pasek podsumowania na górze**: „▲ N rośnie · = N stabilnie · ▼ N spadek ·
  N nowe" (źródło: `summarizeStatuses`). Na obu widokach.
- Wiersz ćwiczenia: nazwa + jednostka **po polsku** (`powt.` / `sek.`),
  „N sesji · ostatnio …", **sparkline kolorowany trendem** (zielony rośnie /
  czerwony spadek / szary za mało danych) + kropka „teraz", odznaka statusu,
  liczba z podpisem **„rekord"**.
- **Odznaka statusu liczona z `best`** (nie `avgReps`) — spójna ze szczegółem.
- Kontrolki (sort / kategoria / Porównaj) i tryb porównania — jak dziś
  (client-side toggle, zaznaczenie ≥2 → przejście do porównania).
- **Akcent trenera**: domyślny sort „Wymaga uwagi" (spadki/plateau na górze),
  diagnostyczny opis paska, imię podopiecznego w nagłówku.

### 4.2 Szczegół ćwiczenia
Trasy: `podopieczny/progresja.$exerciseId.tsx`,
`trener/podopieczni.$traineeId.progresja.$exerciseId.tsx`.

- **Przełącznik zakresu z etykietą „Okres"** (`4 tyg / 3 mies / 6 mies / cały`).
- **Pasek KPI** spójny z miarą rekordu: Rekord (+ data), Zmiana w okresie (%),
  sesje w okresie + śr. RPE. (Ostatnia sesja + delta — opcjonalnie, do upakowania.)
- **Wykres główny „Rekord w czasie"** (visx): najlepsza seria każdej sesji.
  - oś Y z wartościami + gridlines, oś X z datami;
  - linia + kropki **kolorowane wg RPE** (łatwo/średnio/ciężko) z **legendą** na karcie;
  - punkt PR wyróżniony i podpisany;
  - **interaktywny tooltip** (hover + dotyk): data, powtórzenia/sekundy, RPE, liczba
    serii, znacznik nowego rekordu;
  - podtytuł mówiący wprost, co widać.
- **Druga karta „Łączna praca w sesji"** (objętość = suma powtórzeń) — słupki visx z
  podpisaną osią. Zostaje widoczna (nie chowana).
- **Sekcja „Siła = lżej" usunięta.** Efekt „lżej" niesie kolor kropek na wykresie
  głównym. *(Stretch, opcjonalnie):* jednozdaniowy wniosek typu „przy ~10 powt. RPE
  spadło 9 → 7".
- Ujęcie tygodniowe dla długich zakresów (`shouldAggregateWeekly`) — jak dziś.

### 4.3 Porównanie ćwiczeń
Trasy: `podopieczny/progresja.porownanie.tsx`,
`trener/podopieczni.$traineeId.progresja.porownanie.tsx`.

- **Zdanie „po co to"** u góry: linie = % wzrostu rekordu od początku okresu;
  wspólna oś % pozwala zestawić różne jednostki.
- **Etykieta „Okres"**.
- Wykres wielu linii (visx): oś % z wartościami, **mocna linia 0%**, daty na osi X,
  legenda (nazwy ćwiczeń + kolory).
- **Interaktywny tooltip z pionową prowadnicą** — wartości wszystkich linii dla
  wskazanej daty.
- **Tabelka „konkretnie w tym okresie"** pod wykresem: surowe wartości start → teraz
  (np. „Pull-up: 8 → 12 powt. +33%") — bo samo „%" bywa abstrakcyjne.
- Lista „Pominięte" (za mało danych) — jak dziś.

## 5. Zmiany w warstwie logiki (`app/lib/`)

Wszystko czyste, testowalne bez DB → **TDD**.

- **`progression-math.ts`**
  - `statusFromSessions` / `classifyStatus`: przejście z `avgReps` na **`best`** jako
    bazę statusu (recent-k vs prior-k na `best`). To kluczowy fix „jednej definicji".
    Testy jednostkowe: rośnie/spadek/stabilnie/nowe na seriach `best`.
  - `summarizeStatuses` — już istnieje; użyć w pasku podsumowania.
  - `normalizeToPctFromStart`, `computePeriodChangePct`, `aggregateToWeeks`, `markPrs`
    — bez zmian logiki (już na `best`); ewentualnie dorzucić surowe start/teraz do
    danych porównania dla tabelki.
  - Helper jednostki po polsku (`powt.`/`sek.`) — w `progression-math.ts` lub
    `format.ts` (czysty, testowalny).
- **`progression.ts`**
  - `getProgressionComparison`: dołożyć do serii surowe `startValue`/`endValue`
    (do tabelki „konkretnie"). Tenant-scope bez zmian (`traineeId`,
    `findTraineeOfTrainer` → 404).
  - Reszta sygnatur bez zmian.

## 6. Komponenty (`app/components/`)

- **`progression-charts.tsx`** — przepisanie z ręcznego SVG na **visx**:
  `ProgressionLineChart` (hero, tooltip+legenda+osie), `VolumeBars` (oś, tooltip),
  `ComparisonChart` (+ prowadnica/tooltip, oś %), `ComparisonChartLegend`,
  `ProgressionStatusBadge` (bez zmian wizualnych). Czysta prezentacja — bez fetchowania.
- Tooltipy: `@visx/tooltip` (`useTooltipInPortal`, `TooltipWithBounds`) renderowane
  **poza `<svg>`**; obsługa `onMouseMove` + `onTouchMove` (`localPoint`).
- Responsywność: `@visx/responsive` (`ParentSize`) — z rozsądnym `debounceTime`.
- Stylowanie wyłącznie przez tokeny (`var(--ink)`, `var(--accent)`, `var(--ok)`,
  `var(--warn)`, `var(--danger)`, `var(--line)`, `var(--font-mono)`).
- Dostępność: `role="img"` + `aria-label` na wykresach, czytelne kontrasty.
- Sparkline trendowy na liście: rozszerzyć `Sparkline` (`stat-widgets.tsx`) o kolor
  trendu albo dodać wariant w `progression-charts.tsx` (decyzja w planie — preferencja:
  nie ruszać `stat-widgets`, dodać lekki wariant po stronie Progresji).

## 7. Zależności

Dodać pakiety visx (npm): `@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/group`,
`@visx/grid`, `@visx/tooltip`, `@visx/event`, `@visx/responsive`, `@visx/curve`
(dokładny zestaw doprecyzuje plan — bierzemy tylko realnie używane). `npm install`
→ aktualizacja `package.json` + `package-lock.json` (część handoffu).

## 8. Testy

- **Jednostkowe (TDD, bez DB)**: zmiana `statusFromSessions`/`classifyStatus` na
  `best`; helper jednostki PL; ewentualne start/teraz w danych porównania. Plik(i)
  `progression-math.test.ts` (rozszerzyć).
- **Komponenty wykresów**: prezentacyjne — weryfikacja wizualna przez `npm run shots`
  (desktop + mobile) na realnych trasach Progresji.
- **Integracyjne**: brak nowych krytycznych przepływów (loadery read-only, auth bez
  zmian). Istniejący `tests/progression-tenant-scope.itest.ts` musi pozostać zielony —
  uruchamia właściciel (Docker).

## 9. Dokumentacja do aktualizacji

- `app/components/README.md` — opis `progression-charts.tsx` (visx, tooltipy, osie).
- `app/lib/README.md` — jeśli zmienią się opisy `progression-math.ts` /
  `progression.ts` (status na `best`, start/teraz w porównaniu, helper jednostki).
- `CLAUDE.md` — tabela „Stack": dopisać visx jako bibliotekę wykresów (warstwa wykresy).
- README katalogów tras — jeśli zmieni się opis zachowania.

## 10. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| visx + SSR React Router v7 — niespodzianki przy hydracji | visx to czysty SVG; `ParentSize` mierzy po stronie klienta tylko rozmiar kontenera. Zweryfikować `npm run build` + `npm run shots`. |
| Dwa wzorce wykresów (visx + ręczny `stat-widgets`) | Świadomy kompromis; ewentualna migracja `stat-widgets` to osobny, późniejszy krok. |
| Zmiana statusu z `avgReps` na `best` zmienia odznaki na istniejących danych | To celowe (spójność). Pokryte testami jednostkowymi. |
| Tooltip na dotyk a przewijanie strony | `onTouchMove` + `TooltipWithBounds` z `scroll: true`; sprawdzić na realnym telefonie w ręcznej weryfikacji. |

## 11. Kryteria akceptacji

1. Otwierając ćwiczenie, użytkownik od razu czyta wartości z wykresu (osie, podpisy)
   i rozumie, co pokazuje (tytuł/podtytuł/legenda).
2. Przełącznik zakresu ma etykietę „Okres".
3. Tooltip działa na hover i na dotyk (telefon) na wszystkich trzech wykresach.
4. Jedna definicja postępu (rekord/`best`) — odznaka na liście, status i KPI są
   spójne między listą a szczegółem.
5. „Siła = lżej" nie istnieje; wysiłek czytelny przez kolor kropek + legendę.
6. Lista ma pasek podsumowania statusów; widok trenera ma akcent diagnostyczny.
7. Porównanie tłumaczy „po co", ma oś %, linię 0%, tooltip z prowadnicą i tabelkę
   surowych wartości.
8. `npm test` + `npm run typecheck` + `npm run lint` + `npm run build` zielone;
   `npm run shots` potwierdza czytelność na desktop + mobile.
