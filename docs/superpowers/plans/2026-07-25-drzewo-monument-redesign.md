# Drzewo umiejętności „Monument" (redesign) — Implementation Plan

> **Dla wykonawcy:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Kroki mają
> checkboxy (`- [ ]`). Warstwę wizualną prowadzi `frontend-design:frontend-design`.
>
> **Ten plan podaje sygnatury, reguły i plany testów — nie pełne ciała funkcji.**
> Poprzedni plan (tiery) wpisywał kod wprost i skończyło się notatką
> „rozbieżność plan↔kod". Źródłem prawdy są pliki; plan mówi *co* ma powstać i
> *czym to udowodnimy*.

**Goal:** Przebudować `SkillTreeView` w monument: duże karty, płyty warstw pełnej
szerokości, jawny kierunek zależności (stopka/grot na karcie) i routing
ortogonalny bez plątaniny.

**Spec:** [`docs/superpowers/specs/2026-07-25-drzewo-monument-redesign-design.md`](../specs/2026-07-25-drzewo-monument-redesign-design.md)
**Referencja wizualna:** [`docs/skill-tree-options.html`](../../skill-tree-options.html), kierunek **A**.

> **Status: wykonane 2026-07-25.** Bramki zielone (`npx vitest run app` — 301 testów,
> `npm run typecheck`, `npm run lint`, `npm run build`). Rozbieżności wobec szkicu,
> **źródłem prawdy są pliki**:
> - **Task 1.** Reguła prostowania łańcucha to nie „krawędź 1:1", tylko „**dziedzic**":
>   kolumnę prereka przejmuje ta z jego zależnych, która ma dokładnie jednego prereka
>   i nad którą rozwój biegnie najdalej (remis → id). Wersja 1:1 rozcinała kręgosłup
>   produkcyjny na `press` (ma dwie zależne: HSPU i planche). Dołożony próg
>   `MIN_SEGMENT = 3` — rozwidlenie bez kontynuacji zostaje symetryczne.
> - **Task 3.** Krawędź odwrócona nie jest trasowana ortogonalnie: łączy najbliższe
>   krawędzie kart prostym odcinkiem. Reguła „z góry karty w dół karty" dałaby przy
>   odwróconej pętlę.
> - **Task 4 i 5** wykonane jako jedna zmiana (komponent i CSS są nierozdzielne).
> - Rzymski numer i etykiety railu dostały tło płyty — warstwa krawędzi leży w DOM
>   po płytach, więc bez tego pion wchodzący do niższej warstwy przechodziłby przez napis.

**Architecture:** Zero zmian w DB, repo i trasach. Cała praca w trzech miejscach:
`app/lib/skill-pyramid.ts` (układ: kolejność + kolumny + geometria bez wcięć),
nowy `app/lib/skill-pyramid-routing.ts` (trasowanie krawędzi), oraz warstwa
wizualna `app/components/skill-tree.tsx` + sekcja PIRAMIDA w `app/styles/tokens.css`.
Oś X zostaje znormalizowana `0..VIEW_W` i rozciągana (mobile-first — spec §3),
oś Y w px 1:1. Groty kierunku są elementami DOM, nie `<marker>`, więc nie
deformują się przy rozciąganiu.

## Global Constraints

- **NIGDY git, NIGDY docker.** Proces kończy się handoffem (Task 7).
- **Komendy tylko z allowlisty i pojedynczo**: `npm run typecheck`, `npm run lint`,
  `npm run build`, `npx vitest run <wzorzec>`, `npx biome format --write <plik>`.
  **Nie** `npm test` (to watch). Bez łańcuchowania, potoków i przekierowań.
- **npm**, nie pnpm. Pliki czytaj przez Read/Grep/Glob.
- **UI po polsku**, brand `kalisthenos` małą literą, **zero emoji**.
- **Kolory wyłącznie przez `var(--*)`** z `app/styles/tokens.css`.
- **Dokumentacja w tym samym zadaniu**, które zmienia kod.
- **Review per task** (`superpowers:requesting-code-review`) przed kolejnym.
- Bez migracji, bez `/security-review` (spec §6).

---

## File Structure

**Tworzone:**

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/skill-pyramid-routing.ts` | Trasowanie krawędzi: korytarze, pasy, łamana → `d`. |
| `app/lib/skill-pyramid-routing.test.ts` | Testy powyższego. |

**Modyfikowane:**

| Plik | Zmiana |
|---|---|
| `app/lib/skill-pyramid.ts` | `orderAndPlace` (nowe), `layoutPyramid` bez wcięć, `cardHalfW` w wyniku |
| `app/lib/skill-pyramid.test.ts` | testy układu przepisane, testy `buildPyramid` zostają |
| `app/components/skill-tree.tsx` | przebudowa `SkillTreeView` (płyty, linia szczytu, karty, znaczniki, legenda) |
| `app/styles/tokens.css` | sekcja „PIRAMIDA UMIEJĘTNOŚCI" przepisana + zmienne mobile |
| `app/lib/README.md`, `app/components/README.md`, `design-system/README.md` | zgodnie z zadaniami |

**Nietykane:** `app/lib/skill-tree.ts`, `app/lib/skill-tree-math.ts`, `app/lib/skills.ts`,
`app/lib/skill-tier.ts`, `app/routes.ts`, oba pliki tras drzewa, `tests/*.itest.ts`.

---

## Kolejność zadań

```
Task 1 (kolejność+kolumny) ──> Task 2 (geometria) ──> Task 3 (routing) ──┐
                                                                         ├─> Task 4 (plansza)
                                                                         └─> Task 5 (karta)
                                          Task 4 + Task 5 ──> Task 6 (hover, opcjonalny) ──> Task 7 (bramki+handoff)
```

Każde zadanie zostawia repo zielone (`npm run typecheck` + `npm run lint`).

---

### Task 1: Kolejność w rzędach i przydział kolumn

**Files:** Modify `app/lib/skill-pyramid.ts`, `app/lib/skill-pyramid.test.ts`, `app/lib/README.md`

**Produces:**
```ts
export interface Placement {
  bands: PyramidBand[];             // te same pasy, rzędy posortowane po x
  columnOf: Map<string, number>;    // pozycja pozioma w jednostkach karty (ułamki dozwolone)
  boardCols: number;                // ile szerokości karty żąda plansza
}
export function orderAndPlace(bands: PyramidBand[], edges: Edge[], nameById: Map<string,string>): Placement;
```

**Reguły:**
1. Spłaszczenie pasów do warstw globalnych: od dołu planszy (`bands[0].rows[0]`) w górę.
2. Start: x = indeks w warstwie po dzisiejszej kolejności alfabetycznej (`orderWithinLayer`, locale `pl`) — to domyka determinizm przy remisach.
3. Sześć iteracji „w górę po prerekach, w dół po zależnych". W każdej warstwie: docelowe x = średnia x sąsiadów (brak sąsiadów → bieżące x), sort stabilny po docelowym, przejście w przód wymuszające odstęp ≥ 1 kolumny, na końcu przesunięcie bloku tak, by jego środek wrócił na średnią docelową.
4. Normalizacja: `min x = 0`, `boardCols = max x + 1`, x zaokrąglone do 3 miejsc (bez dryfu zmiennoprzecinkowego).
5. Rzędy zwracane w kolejności rosnącego x.

- [ ] **Step 1: Testy (test-first)** w `app/lib/skill-pyramid.test.ts`:
  - łańcuch A→B→C→D (jeden prereq każdy, ten sam pas) → **identyczne x na czterech poziomach**;
  - dwie zależne jednego prereka → różne x, średnia równa x prereka (symetria);
  - żadne dwa węzły w jednej warstwie nie są bliżej niż 1;
  - graf bez krawędzi → kolejność alfabetyczna z locale `pl` (`Łokieć` po `Antagonista`) zachowana;
  - determinizm: to samo wejście i permutacja wejścia → ten sam wynik;
  - `boardCols` ≥ najszerszy rząd;
  - liczba skrzyżowań na grafie produkcyjnym (§ dane niżej) **nie większa** niż przy kolejności alfabetycznej — licznik skrzyżowań mieszka w teście;
  - `columnOf` ma wpis dla każdego węzła; `min x = 0`.
- [ ] **Step 2:** `npx vitest run app/lib/skill-pyramid.test.ts` → **FAIL** (brak eksportu).
- [ ] **Step 3:** implementacja `orderAndPlace`.
- [ ] **Step 4:** `npx vitest run app/lib/skill-pyramid.test.ts` → PASS.
- [ ] **Step 5:** wiersz `skill-pyramid.ts` w `app/lib/README.md` uzupełniony o `orderAndPlace`.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, review.

**Graf produkcyjny do testów** (ten sam co w makiecie): pasy
`basic[Podciąganie, Dipy, Hollow body]`,
`intermediate[muscle up, Dragon flag, Handstand | press do handstand'a | HSPU]`,
`advanced[Frontlever, planche, 90 degree HSPU]`, `expert[One arm handstand]`;
krawędzie: muscle up←(Podciąganie, Dipy), Dragon flag←Hollow body,
Handstand←Hollow body, press←Handstand, HSPU←press, Frontlever←(Podciąganie,
Dragon flag), planche←(Dipy, press), 90 degree HSPU←HSPU, One arm handstand←90 degree HSPU.

---

### Task 2: Geometria bez wcięć

**Files:** Modify `app/lib/skill-pyramid.ts`, `app/lib/skill-pyramid.test.ts`, `app/lib/README.md`

**Produces:**
```ts
export interface PyramidMetrics { rowH: number; bandHeaderH: number; bandGap: number; cardH: number }
export const DEFAULT_METRICS: PyramidMetrics;   // rowH 150, bandHeaderH 34, bandGap 18, cardH 112
export interface PyramidBandBox { tier: SkillTier; y: number; h: number }   // bez x0/x1
export interface PyramidLayout {
  totalH: number; boardCols: number;
  bands: PyramidBandBox[];                       // od góry planszy
  centers: Map<string, { x: number; y: number }>;// x w 0..VIEW_W, y w px
  cardHalfW: number;                             // pół szerokości karty w jednostkach VIEW_W
}
export function layoutPyramid(placement: Placement, m?: PyramidMetrics): PyramidLayout;
```

**Reguły:** slot = `VIEW_W / boardCols`; `x = (col + 0.5) * slot`;
`cardHalfW = 0.43 * slot` (najwęższy realny stosunek karty do rozstawu z CSS,
z zapasem — patrz Task 5); `insetStep`, `maxInsetFrac`, `x0`, `x1` **usunięte**.

- [ ] **Step 1: Testy** — przepisz blok „layoutPyramid" w `skill-pyramid.test.ts`:
  `totalH` = suma nagłówków, rzędów i odstępów; pasy nie nachodzą i idą od
  najwyższego tieru; `centers` ma wpis dla każdego węzła; każde `x` w `0..VIEW_W`;
  jednoelementowy rząd na jednokolumnowej planszy → `x = VIEW_W/2`; węzeł
  wyższego tieru ma mniejsze `y`; podrząd 0 ma większe `y` niż podrząd 1;
  `cardHalfW` < `slot/2`; pusta piramida → `totalH = 0`.
  **Usuń** testy wcięcia i pompowania `boardCols` (reguła wycofana specem §0).
- [ ] **Step 2:** vitest → FAIL. **Step 3:** implementacja. **Step 4:** vitest → PASS.
- [ ] **Step 5:** `npx vitest run app` — regresja całego pakietu (`skill-tree-math`, `skill-tier` bez zmian).
- [ ] **Step 6:** `app/lib/README.md`, potem `npm run typecheck` (komponent jeszcze nie skompiluje się do końca — jeśli tak, dokończ dopiero w Task 4; zanotuj to w review), `npm run lint`, review.

> **Uwaga o kolejności:** Task 2 zmienia kształt `PyramidLayout`, którego używa
> dziś `skill-tree.tsx`. Żeby nie zostawiać repo czerwonego, w tym samym zadaniu
> zrób **minimalną** adaptację komponentu (płyty pełnej szerokości zamiast
> `x0/x1`), bez reszty redesignu. Pełna przebudowa jest w Task 4–5.

---

### Task 3: Trasowanie krawędzi

**Files:** Create `app/lib/skill-pyramid-routing.ts` + `.test.ts`, Modify `app/lib/README.md`

**Produces:**
```ts
export interface Pt { x: number; y: number }
export interface RoutedEdge { from: string; requires: string; points: Pt[]; reversed: boolean }
export function routeEdges(edges: Edge[], layout: PyramidLayout, m?: PyramidMetrics): RoutedEdge[];
export function edgePathD(points: Pt[], rx: number, ry: number): string;
```

**Reguły:**
1. Start `(prereq.x, prereq.y - cardH/2)`, koniec `(dep.x, dep.y + cardH/2)`.
2. |Δx| < 0.5 px → dwa punkty (prosty pion).
3. Inaczej cztery punkty: pion w korytarzu → poziom w pasie → pion do celu.
4. Korytarz: domyślnie x prereka; przy kolizji próbuj `±0.5·slot, ±1·slot, …`
   (naprzemiennie w lewo i prawo, limit 6 kroków). Kolizja = |x − węzeł.x| <
   `cardHalfW + 0.04·slot` **i** zakresy y się nachodzą (karta ± `cardH/2`).
   Węzły startowy i docelowy nie są przeszkodą.
5. Pas: `laneY = dep.y + cardH/2 + 12 + i·9`, `i` = pierwszy wolny pas w grupie
   krawędzi o tym samym `dep.y`; zajętość liczona po nachodzeniu zakresów x.
   Maks. 3 pasy (przerwa `rowH − cardH` = 38 px); przy przepełnieniu wraca 2.
6. Gdy korytarz ≠ x prereka, pierwszy punkt zostaje na karcie
   (`prereq.x, prereq.y − cardH/2`), a drugi to zejście do korytarza — łamana ma
   wtedy pięć punktów. Stopka na karcie (Task 5) zawsze siedzi w `prereq.x`.
7. `reversed` = `prereq.y < dep.y` (prereq wyżej na planszy).

- [ ] **Step 1: Testy** w `skill-pyramid-routing.test.ts`:
  - ta sama kolumna → 2 punkty, `x` identyczne, start/koniec dokładnie na krawędziach karty;
  - różne kolumny → wszystkie odcinki poziome **albo** pionowe (brak skosów poza zejściem do korytarza);
  - **żaden pionowy odcinek nie przecina prostokąta karty** — pętla po grafie produkcyjnym × wszystkich węzłach (kryterium akceptacji nr 4);
  - dwie krawędzie o nachodzących zakresach x w tej samej przerwie → różne `laneY`;
  - dwie krawędzie o rozłącznych zakresach x → ten sam `laneY`;
  - `reversed` dokładnie wtedy, gdy prereq wyżej;
  - determinizm;
  - `edgePathD`: 2 punkty → `M…L…` bez `Q`; 4 punkty → dwa `Q`; promień przycięty przy krótkim odcinku (brak cofania się ścieżki); brak `NaN` w wyniku.
- [ ] **Step 2:** vitest → FAIL. **Step 3:** implementacja. **Step 4:** vitest → PASS.
- [ ] **Step 5:** wiersz w `app/lib/README.md`.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, review.

---

### Task 4: Plansza — płyty, linia szczytu, krawędzie

**Files:** Modify `app/components/skill-tree.tsx`, `app/styles/tokens.css`, `app/components/README.md`

- [ ] **Step 1:** `SkillTreeView` liczy `buildPyramid` → `orderAndPlace` → `layoutPyramid` → `routeEdges`; plansza dostaje `min-width: calc(var(--pyramid-col) * boardCols)` i sufit `BOARD_SLACK` (jak dziś).
- [ ] **Step 2:** płyta warstwy: pełna szerokość, rail (etykieta + licznik `4/6`), rzymski numer `I–IV` (`aria-hidden`, Space Grotesk 700, krycie 0,055; na płycie eksperta `--bg` przy 0,12). Płyta `expert` atramentowa, etykieta i licznik `--muted-2`.
- [ ] **Step 3:** linia szczytu — 1,5 px `--accent` na górnej krawędzi najwyższej warstwy z ≥1 `mastered`, plakietka `TWÓJ SZCZYT · <TIER>`; brak `mastered` → brak linii.
- [ ] **Step 4:** krawędzie z `routeEdges` + `edgePathD`, `vector-effect="non-scaling-stroke"`; style wg spec §5.5 (opanowany `--ok` 2 px; nieopanowany `--line-2` 1,5 px `5 6`; odwrócony `--warn` `2 6`). Warstwa SVG dalej `role="img"` + `aria-label`.
- [ ] **Step 5:** animacja wejścia bez zmian w regułach (`pyramid-rise` dla płyt, `pyramid-fade` dla kart i krawędzi, `--reveal` od dołu, `prefers-reduced-motion` zeruje też opóźnienie).
- [ ] **Step 6:** `app/components/README.md`; `npm run typecheck`, `npm run lint`, `npx vitest run app`; review.

---

### Task 5: Karta i znaczniki kierunku

**Files:** Modify `app/components/skill-tree.tsx`, `app/styles/tokens.css`, `design-system/README.md`

- [ ] **Step 1:** nowa treść karty: pasek stanu (kropka + mono wersalik), nazwa (Space Grotesk 600, klamra 2 linie), linia poziomu, rowek postępu. Kafel z inicjałem usunięty. `min-height: cardH`, wyśrodkowanie na rzędzie bez zmian.
- [ ] **Step 2:** **stopka** (górna krawędź, 7×9, `--ok` gdy węzeł opanowany, inaczej `--line-2`) tylko gdy węzeł ma zależne; **grot** (dolna krawędź, 12×7, `--ok` gdy wszystkie prereki opanowane, inaczej `--line-2`) tylko gdy węzeł ma prereki. Oba `aria-hidden`, oba w DOM (nie w SVG).
- [ ] **Step 3:** rozmiary: `--pyramid-col: 280px` / `--pyramid-card-w: 240px`, mobile (≤880 px) `128px` / `116px`, nazwa 16 px / 12,5 px. `cardHalfW` w JS (0,43·slot) musi zostać **mniejsze** od realnego pół-stosunku na obu viewportach — sprawdź arytmetykę i zapisz ją w komentarzu.
- [ ] **Step 4:** legenda: stany bez zmian + nowy wiersz „linia wychodzi ze stopki prerekwizytu i wchodzi w grot tego, co odblokowuje" oraz wiersz o krawędzi odwróconej.
- [ ] **Step 5:** `design-system/README.md` — sekcja „Piramida umiejętności": wycofanie reguły o wcinanych pasach, dopisanie płyt pełnej szerokości, rzymskich numerów, znaczników kierunku i linii szczytu.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, `npm run build`; review.

---

### Task 6: Podświetlenie zależności na hover (dodatek ponad makietę)

**Files:** Modify `app/components/skill-tree.tsx`, `app/styles/tokens.css`, `app/components/README.md`

- [ ] **Step 1:** `hoveredSkillId` w stanie komponentu; `onMouseEnter/onMouseLeave` + `onFocus/onBlur` na karcie.
- [ ] **Step 2:** krawędzie niedotykające węzła schodzą do krycia 0,15; dotykające do 1 i +0,5 px grubości. Reguła tylko pod `@media (hover: hover)`; SSR renderuje wariant neutralny.
- [ ] **Step 3:** `npm run typecheck`, `npm run lint`; review. **To zadanie jest do wycofania jednym commitem, jeśli właściciel go nie chce** — zaznacz to w handoffie.

---

### Task 7: Bramki końcowe i handoff

- [ ] **Step 1:** `npx vitest run app` → PASS.
- [ ] **Step 2:** `npm run typecheck` → bez błędów.
- [ ] **Step 3:** `npm run lint` → bez błędów.
- [ ] **Step 4:** `npm run build` → SSR + klient bez błędów.
- [ ] **Step 5:** `/code-review` na pełnym diffie.
- [ ] **Step 6:** handoff: podsumowanie, lista plików, proponowany komunikat commita, **brak migracji**, brak nowych itestów (regresja: `tests/skill-tree.itest.ts`), ścieżka ręcznej weryfikacji: `/podopieczny/rozwoj` i `/trener/podopieczni/:id/rozwoj` × motyw jasny/ciemny × 375 px/desktop × `prefers-reduced-motion`.

---

## Self-Review

**Pokrycie specu:** §3 model współrzędnych → Task 2+3 · §4.1 → Task 1+2 ·
§4.2 → Task 3 · §5.1–5.2 → Task 4 · §5.3–5.4 → Task 5 · §5.5 → Task 4 ·
§5.6 → Task 5 · §5.7 → Task 6 · §7 dostępność → Task 4+5 · §8 testy → Task 1–3 ·
§9 dokumentacja → rozdzielona po zadaniach.

**Spójność typów:** `Placement` (Task 1) jest wejściem `layoutPyramid` (Task 2);
`PyramidLayout` + `PyramidMetrics` (Task 2) są wejściem `routeEdges` (Task 3);
`RoutedEdge.points` + `edgePathD` (Task 3) konsumuje komponent (Task 4).
`Edge` i `SkillTier` bez zmian, z dzisiejszych modułów.

**Kolejność bezpieczna:** Task 2 psułby kompilację komponentu, więc niesie
minimalną adaptację; pełna przebudowa dopiero w Task 4–5, gdy routing już
istnieje.
