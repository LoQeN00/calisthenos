# kalisthenos — Drzewo umiejętności „Monument" (redesign) — design spec

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-07-25
**Powiązane:**
[`2026-07-24-tiery-umiejetnosci-piramida-design.md`](2026-07-24-tiery-umiejetnosci-piramida-design.md)
(fundament: tier, pasy, ciężar zamiast koloru — ten spec **zastępuje** geometrię
pasów i sposób rysowania krawędzi, model danych zostawia nietknięty) ·
[`2026-06-01-drzewo-umiejetnosci-design.md`](2026-06-01-drzewo-umiejetnosci-design.md)
(graf prerekwizytów, cztery stany węzła) ·
[`../../skill-tree-options.html`](../../skill-tree-options.html)
(makieta czterech kierunków; **kierunek A — Monument — jest wybrany i jest
referencją wizualną tego specu**) ·
[`../../skill-tree.png`](../../skill-tree.png) (stan produkcji przed zmianą).

---

## 0. Kontekst i decyzje wejściowe

Piramida działa i jest poprawna, ale jako ekran przegrywa. Zarzuty właściciela
(2026-07-25), wprost z produkcji:

1. **Skala.** Karta ma 116 px i siedzi na płycie szerokiej na całą planszę —
   drzewo wygląda jak znaczki rozsypane po pustych prostokątach.
2. **Kierunek.** Krzywa łączy dwie karty i nic więcej nie mówi. Patrząc na linię
   między Dipami a Handstandem nie da się orzec, co czego wymaga.
3. **Brak wrażenia.** To ma być ekran, na który podopieczny wchodzi się cieszyć,
   a wygląda jak diagram zależności.

Diagnoza techniczna trzech przyczyn:

- **Rząd jest sortowany alfabetycznie** (`orderWithinLayer` po nazwie). Sąsiedzi
  w rzędzie nie mają ze sobą nic wspólnego, więc każda zależność biegnie skosem
  przez pół planszy i krzyżuje się z innymi. To jest źródło plątaniny — nie sam
  fakt użycia krzywych.
- **Krawędź nie niesie kierunku.** Bezier `M(prereq) C… (zależna)` wygląda tak
  samo z obu stron; kolor koduje stan prereka, nie zwrot.
- **Karta jest mała, bo płyta jest szeroka.** Zawężenie pasów rezerwuje miejsce,
  którego rzędy nie wykorzystują.

Decyzje ustalone przy wyborze kierunku A:

- **Płyty pełnej szerokości zamiast wcinanej piramidy.** Sylwetka schodkowa
  znika; monumentalność bierze się z masy warstwy, rzymskiego numeru wykutego w
  płycie i atramentowej płyty na szczycie. To **świadome wycofanie** reguły
  „pas wcięty względem pasa pod sobą" z `design-system/README.md` (§9).
- **Kierunek kodują znaczniki na karcie, nie na krawędzi.** Karta, z której coś
  wyrasta, dostaje **stopkę** na górnej krawędzi; karta, która czegoś wymaga,
  dostaje **wcięcie z grotem** na dolnej. Każda krawędź wychodzi z górnej
  krawędzi prereka i wchodzi w dolną krawędź zależnej — reguła jest totalna,
  więc dwa znaczniki na kartę wystarczą do odczytania całej planszy.
- **Routing ortogonalny z korytarzami i pasami.** Pion nigdy nie przechodzi przez
  kartę, poziome odcinki w jednej przerwie nigdy się nie nakładają.
- **Układ w kolumnach łańcuchów.** Rzędy porządkuje barycentrum sąsiadów, nie
  alfabet; łańcuch jednego prereka stoi w jednej pionowej kolumnie.
- **Linia szczytu.** Limonkowa hairline na wysokości najwyższego zdobytego tieru,
  z plakietką „TWÓJ SZCZYT · <TIER>".

### Czego ten spec NIE rusza

Modelu danych (`skills`, `skill_variations`, `skill_advancements`,
`skill_prerequisites`), repozytoriów, tras, autoryzacji ani semantyki stanów
węzła. To zmiana wyłącznie prezentacyjna: te same dane, inny rysunek. Brak
migracji, brak nowego endpointu, brak nowej powierzchni autoryzacyjnej.

---

## 1. Cel i nie-cele

### Cel

Przebudować `SkillTreeView` w monument: duże karty, pełnej szerokości płyty
warstw, jawny kierunek zależności i routing bez plątaniny — na obu trasach, które
dziś renderują drzewo (podopieczny i trener oglądający podopiecznego).

### Nie-cele (świadome cięcia)

- **Biblioteka do grafów.** Rozważone i odrzucone: `@dagrejs/dagre` i `elkjs`
  liczą warstwy, a u nas warstwę wyznacza tier — zostaje samo porządkowanie
  wewnątrz warstwy i przydział x, czyli ta mniejsza połowa. `@xyflow/react`
  odpada z innego powodu: jest wyłącznie kliencki i mierzy DOM, więc kosztowałby
  SSR, który dziś mamy za darmo. Zysk nie pokrywa 200 kB zależności i utraty
  czystych testów.
- **Pan/zoom, minimapa, drag węzłów.** Drzewo jest do oglądania, nie do edycji.
- **Zmiana semantyki stanów, sugestii awansu, tierów.** Bez zmian.
- **Osobny układ na mobile.** Ta sama plansza, węższa karta (§5.6).
- **Krzywe Béziera.** Zastąpione ortogonalnymi łamanymi z zaokrąglonym rogiem.

---

## 2. Słownik

- **Płyta / warstwa (strata)** — poziomy blok jednego tieru, pełnej szerokości
  planszy. Renderowana tylko gdy niepusta.
- **Podrząd** — rząd wewnątrz płyty (bez zmian względem poprzedniego specu).
- **Kolumna** — pozycja pozioma węzła w jednostkach szerokości karty. Wynik
  przydziału x, wspólny dla całej planszy (nie per rząd).
- **Stopka** — znacznik na górnej krawędzi karty: „z tej umiejętności coś
  wyrasta". Rysowany, gdy węzeł ma jakąkolwiek zależną.
- **Wcięcie** — znacznik z grotem na dolnej krawędzi karty: „tutaj wchodzą
  prerekwizyty". Rysowany, gdy węzeł ma jakikolwiek prerekwizyt.
- **Korytarz** — pionowy tor, którym biegnie krawędź; wybierany tak, żeby nie
  przecinał żadnej karty.
- **Pas (lane)** — poziomy tor w przerwie między rzędami; krawędzie o
  nachodzących zakresach x dostają różne pasy.
- **Linia szczytu** — pozioma limonkowa linia na górnej krawędzi najwyższej
  warstwy, w której podopieczny ma co najmniej jedną umiejętność `mastered`.

---

## 3. Model współrzędnych (najważniejsza decyzja techniczna)

Makieta rysuje planszę w sztywnych pikselach 1:1. **Produkcja tego nie może
zrobić**: widok podopiecznego jest mobile-first, a karta 240 px na telefonie
oznaczałaby trzy ekrany przewijania w poziomie dla trzykolumnowego drzewa (dziś
trzy kolumny mieszczą się w 312 px).

Zostaje więc **model, który repo ma dziś** i który jest poprawny:

- **Oś X znormalizowana** do `0..VIEW_W` (1000) i rozciągana na szerokość
  planszy; karty pozycjonowane w procentach, SVG z `preserveAspectRatio="none"`.
- **Oś Y w pikselach**, mapowana 1:1.
- Szerokość karty i rozstaw kolumn to wiedza **CSS** (`--pyramid-col`,
  `--pyramid-card-w`, przełączane media query), a `boardCols` z JS mówi, ilu
  szerokości karty żąda najszerszy rząd.

Konsekwencje, które trzeba obsłużyć, bo rozciąganie osi X psuje trzy rzeczy:

| Problem po rozciągnięciu | Rozwiązanie |
|---|---|
| Grubość kreski zmienia się z szerokością ekranu | `vector-effect="non-scaling-stroke"` (już używane dziś) |
| Grot `<marker>` byłby spłaszczony w poziomie | **Nie używamy `<marker>`.** Grot to element DOM na karcie (wcięcie), nigdy nie podlega skali SVG |
| Zaokrąglony róg staje się elipsą | Akceptowane: współczynnik rozciągnięcia w praktyce siedzi blisko 1 (plansza ma `min-width` = szerokość naturalna i sufit `BOARD_SLACK`) |

To jest jedyne miejsce, w którym implementacja świadomie odchodzi od makiety.
Wygląd zostaje ten sam; zmienia się tylko to, czym jest „1000" na osi X.

---

## 4. Czysta logika (TDD, bez DB)

### 4.1 `app/lib/skill-pyramid.ts` — przebudowa układu

`buildPyramid` (pasy i podrzędy) **zostaje bez zmian**. Zmienia się wszystko po
nim: kolejność w rzędzie i geometria.

```ts
/** Kolejność w rzędach + przydział kolumn. Zastępuje sortowanie alfabetyczne. */
export function orderAndPlace(bands: PyramidBand[], edges: Edge[], nameById: Map<string,string>): {
  bands: PyramidBand[];            // te same pasy, rzędy przestawione
  columnOf: Map<string, number>;   // pozycja pozioma w jednostkach kolumny (może być ułamkiem)
  boardCols: number;               // ile szerokości karty musi mieć plansza
};
```

Algorytm (Sugiyama w wersji minimalnej — warstwy mamy z tierów za darmo):

1. **Spłaszczenie do warstw.** Warstwa globalna = numer kolejny pary
   (pas, podrząd), licząc od dołu planszy.
2. **Kolejność w warstwie — barycentrum.** Cztery zamiatania w górę i cztery w
   dół: każdy węzeł dostaje średnią pozycję sąsiadów z warstwy sąsiedniej, potem
   warstwa jest sortowana po tej wartości. Sort **stabilny**, a wejściem jest
   dzisiejsza kolejność alfabetyczna — to daje determinizm przy remisach.
3. **Przydział x — metoda priorytetowa.** Iteracyjnie: docelowe x = średnia x
   sąsiadów; potem rozsunięcie w warstwie do minimum jednej kolumny odstępu z
   zachowaniem kolejności. Węzeł z jednym prerekiem dziedziczy jego x, więc
   łańcuch stoi pionowo.
4. **Normalizacja.** Przesunięcie tak, by `min x = 0`;
   `boardCols = max x + 1`.

**Kryterium, które ten kod ma spełnić (i które jest testem):** łańcuch
Handstand → press do handstand'a → HSPU → 90 degree HSPU dostaje **identyczne
x** na wszystkich czterech poziomach.

Geometria po zmianie:

```ts
export interface PyramidMetrics {
  rowH: number; bandHeaderH: number; bandGap: number;
  /** Wysokość nominalna karty — do zaczepienia krawędzi (§5.3). */
  cardH: number;
}

export interface PyramidLayout {
  totalH: number;
  boardCols: number;
  /** Płyty pełnej szerokości: bez x0/x1. */
  bands: Array<{ tier: SkillTier; y: number; h: number }>;
  centers: Map<string, { x: number; y: number }>;   // x w 0..VIEW_W, y w px
  /** Pół szerokości karty w jednostkach VIEW_W — routing musi wiedzieć, gdzie kończy się karta. */
  cardHalfW: number;
}
```

`insetStep` i `maxInsetFrac` **znikają** z `PyramidMetrics` razem z całą logiką
zawężania i pompowania `boardCols`; `boardCols` bierze się teraz wprost z
przydziału kolumn.

**Plan testów (`skill-pyramid.test.ts` — przepisany):**
- `buildPyramid`: zestaw dzisiejszych testów zostaje bez zmian (pasy, podrzędy,
  krawędź międzypasowa, odwrócona, cykl, determinizm).
- `orderAndPlace`:
  - łańcuch jednego prereka → identyczne x na każdym poziomie (kryterium wyżej);
  - dwie zależne jednego prereka → różne x, obie po jego stronie planszy;
  - żadne dwa węzły w jednej warstwie nie są bliżej niż jedna kolumna;
  - determinizm: dwa wywołania i permutacja wejścia dają ten sam wynik;
  - graf bez krawędzi → kolejność alfabetyczna (locale `pl`) zachowana;
  - liczba skrzyżowań dla grafu produkcyjnego **nie jest większa** niż przy
    kolejności alfabetycznej (funkcja licząca skrzyżowania w teście, nie w kodzie
    produkcyjnym);
  - `boardCols` ≥ liczba węzłów w najszerszym rzędzie.
- `layoutPyramid`: `totalH` jako suma nagłówków, rzędów i odstępów; pasy nie
  nachodzą; pas najwyższego tieru na górze; `centers` ma wpis dla każdego węzła;
  każde `x` w `0..VIEW_W`; węzeł wyższego tieru ma mniejsze `y`; podrząd 0 niżej
  niż podrząd 1.

### 4.2 `app/lib/skill-pyramid-routing.ts` (nowy)

Trasowanie krawędzi. Osobny moduł, bo to osobna odpowiedzialność i osobny zestaw
testów; `skill-pyramid.ts` zostaje o układzie.

```ts
export interface RoutedEdge {
  from: string;      // zależna (wyżej)
  requires: string;  // prerekwizyt (niżej)
  /** Punkty łamanej: start na górnej krawędzi prereka, koniec na dolnej krawędzi zależnej. */
  points: Array<{ x: number; y: number }>;
  /** Prereq leży wyżej niż to, co odblokowuje (możliwe po zmianie tieru). */
  reversed: boolean;
}

export function routeEdges(edges: Edge[], layout: PyramidLayout, m: PyramidMetrics): RoutedEdge[];

/** Łamana → `d` z zaokrąglonymi rogami. Promień przycinany do długości sąsiednich odcinków. */
export function edgePathD(points: Array<{ x: number; y: number }>, radius: number): string;
```

Reguły `routeEdges`:

1. Start: `(prereq.x, prereq.y - cardH/2)` — górna krawędź prereka.
   Koniec: `(dep.x, dep.y + cardH/2)` — dolna krawędź zależnej.
2. Ta sama kolumna (|Δx| poniżej progu) → prosty odcinek pionowy, bez łamania.
3. Inaczej: pion w korytarzu → poziomy przeskok w **pasie** tuż pod celem → pion
   do celu.
4. **Korytarz.** Pion domyślnie w kolumnie prereka. Jeśli przecina kartę
   (prostokąt powiększony o margines), przesuwamy go co pół kolumny naprzemiennie
   w lewo i w prawo, aż będzie wolny. Karty startowa i docelowa nie liczą się
   jako przeszkoda.
5. **Pas.** W jednej przerwie (identyczne `y` celu) krawędzie o nachodzących
   zakresach x dostają kolejne pasy: `laneY = celDół + base + i*step`. Przydział
   zachłanny po pierwszym wolnym pasie.
6. **Krawędź odwrócona** (`reversed`): prereq leży wyżej. Trasa biegnie tak samo
   (od górnej krawędzi prereka do dolnej krawędzi zależnej — czyli w dół),
   komponent rysuje ją stylem ostrzegawczym.

**Plan testów (`skill-pyramid-routing.test.ts`):**
- węzły w jednej kolumnie → dwa punkty, `x` identyczne;
- węzły w różnych kolumnach → cztery punkty, dwa pionowe odcinki i jeden poziomy;
- start dokładnie na górnej krawędzi prereka, koniec na dolnej krawędzi zależnej;
- **żaden pionowy odcinek nie przecina prostokąta karty** — test iterujący po
  wszystkich krawędziach i wszystkich węzłach grafu produkcyjnego (to jest test,
  który pilnuje zarzutu nr 2);
- dwie krawędzie wchodzące do tego samego celu z przeciwnych stron **mogą** dzielić
  pas; dwie o nachodzących zakresach x dostają **różne** pasy;
- `reversed` ustawione wtedy i tylko wtedy, gdy prereq ma mniejsze `y`;
- determinizm;
- `edgePathD`: dwa punkty → `M…L…`; łamana → `Q` w rogach; promień przycięty,
  gdy odcinek jest krótszy niż 2×promień (bez ujemnych długości).

---

## 5. UI

### 5.1 Płyta warstwy

Pełna szerokość planszy, `--surface-2`, hairline, `--radius-lg`. Na płycie:

- **rail** — etykieta tieru (mono, wersalik) po lewej, licznik `4/6` po prawej;
- **rzymski numer** (`I`–`IV`) wykuty w lewym dolnym rogu płyty: Space Grotesk
  700, ~64 px, `--ink` przy kryciu 0,055. To jest środek strukturalny, nie
  ozdoba — numer koduje kolejność warstw, którą i tak trzeba przeczytać.
- Płyta tieru `expert` jest **atramentowa** (`--ink`), jak dziś karta eksperta.
  Etykieta i licznik schodzą na niej do `--muted-2` (ta sama reguła kontrastu, co
  w poprzednim specu).

### 5.2 Linia szczytu

Pozioma linia 1,5 px `--accent` na górnej krawędzi najwyższej warstwy z co
najmniej jedną umiejętnością `mastered`, z plakietką po prawej: mono, wersalik,
`--accent` jako tło, `--accent-ink` jako tekst, treść `TWÓJ SZCZYT · ZAAWANSOWANY`.
Gdy nic nie jest opanowane — linii nie ma (nie ma czego świętować).

To jedyny nowy element ozdobny w tym specu i jedyne miejsce, gdzie limonka
pojawia się poza kartą — nadal w zgodzie z regułą „lime = postęp podopiecznego".

### 5.3 Karta

Nominalna wysokość `cardH` (jedna dla wszystkich viewportów), szerokość z CSS.
Zawartość, od góry:

| element | treść |
|---|---|
| pasek stanu | kropka stanu + mono wersalik (`OPANOWANE`, `W TOKU`, `GOTOWE`, `ZABLOKOWANE`) |
| nazwa | Space Grotesk 600, klamrowana do dwóch linii |
| poziom | mono, `poziom 3/5` albo status, gdy nieprzypisana |
| rowek postępu | jak dziś |

Kafel z inicjałem **znika** — na karcie 240 px nazwa niesie tożsamość lepiej niż
litera, a zwolnione miejsce idzie na pasek stanu, który dziś jest tylko w
`aria-label`.

Tier dalej niesie **ciężar** (płaski → hairline → 1,5 px → inwersja atramentowa),
stan dalej niesie **akcent**. Bez zmian względem poprzedniego specu.

Karta ma `min-height: cardH`, nie sztywne `height` — gdy na wąskim ekranie nazwa
zajmie dwie linie, karta urośnie i wyjdzie symetrycznie poza nominał (jest
wyśrodkowana na rzędzie). Krawędzie celują w nominał, więc w takim wypadku
kończą się kilka pikseli **wewnątrz** karty, czyli pod nią — to jest bezpieczny
kierunek błędu.

### 5.4 Znaczniki kierunku (rdzeń zarzutu nr 2)

Dwa elementy DOM na karcie, oba renderowane warunkowo:

- **Stopka** — prostokąt 7×9 px, `--radius-sm`, wyśrodkowany na **górnej**
  krawędzi karty, kolor: `--ok` gdy umiejętność jest opanowana (czyli jest już
  realnym fundamentem), inaczej `--line-2`. Renderowana, gdy węzeł ma zależne.
- **Wcięcie** — trójkąt/grot 12×7 px wskazujący w górę, osadzony na **dolnej**
  krawędzi karty, w kolorze `--line-2` (albo `--ok`, gdy wszystkie prereki są
  opanowane). Renderowane, gdy węzeł ma prerekwizyty.

Reguła do przeczytania raz i na zawsze, powtórzona w legendzie: **linia wychodzi
ze stopki i wchodzi w grot**. Ponieważ każda krawędź startuje na górnej krawędzi
prereka i kończy na dolnej krawędzi zależnej, dwa znaczniki na kartę opisują
całą planszę — nie trzeba grotu na każdej krawędzi.

Znaczniki są w DOM, nie w SVG, więc rozciągnięcie osi X ich nie deformuje (§3).

### 5.5 Krawędzie

Ortogonalna łamana z rogiem o promieniu 12 (przycinanym do długości odcinków),
`vector-effect="non-scaling-stroke"`.

| przypadek | styl |
|---|---|
| prereq opanowany | pełna `--ok`, 2 px |
| prereq nieopanowany | kreskowana `--line-2`, 1,5 px, `stroke-dasharray: 5 6` |
| krawędź odwrócona | kropkowana `--warn`, `2 6` |

Obie karty opanowane — bez wyróżnienia. Dzisiejsze „droga, którą przeszedłeś"
(grubsza linia dla pary mastered) znika: przy ortogonalnych trasach różnica
grubości czytała się jak błąd renderowania, a informację i tak niesie kolor.

### 5.6 Skala i mobile

| | desktop | ≤880 px |
|---|---|---|
| `--pyramid-col` | 280 px | 128 px |
| `--pyramid-card-w` | 240 px | 116 px |
| nazwa | 16 px | 12,5 px |

Mobilna karta jest wielkości **dzisiejszej desktopowej**, a desktopowa rośnie
ponad dwukrotnie. Trzy kolumny mieszczą się na telefonie w ~384 px, czyli tyle,
co dziś. Plansza dalej: `min-width` z `boardCols`, sufit `BOARD_SLACK`,
`margin: 0 auto`, poziome przewijanie w `.pyramid-scroll`.

`rowH`, `cardH`, `bandHeaderH` i `bandGap` są **wspólne** dla obu viewportów (oś
Y liczy się na serwerze, więc nie może zależeć od szerokości ekranu). Nominał
`cardH` jest dobrany pod przypadek najgorszy, czyli wąską kartę mobilną z nazwą
łamaną do dwóch linii.

### 5.7 Podświetlenie zależności na hover (poza makietą)

Najechanie na kartę wygasza wszystkie krawędzie poza tymi, które jej dotykają, i
podnosi je do pełnego krycia. To najtańsza odpowiedź na „ciężko się połapać, co z
czego wynika" przy większym drzewie: jeden ruch myszą pokazuje sąsiedztwo węzła.

- Stan trzyma komponent (`hoveredSkillId`), SSR renderuje wariant neutralny.
- Reguła wyłącznie pod `@media (hover: hover)` — na telefonie dotyk to nawigacja.
- **To jest dodatek ponad wybraną makietę.** Osobne zadanie na końcu planu, do
  wycofania jednym commitem, jeśli właściciel go nie chce.

---

## 6. Warstwa danych, tras i autoryzacji

Bez zmian. `getSkillTreeForTrainee` zwraca dokładnie to, co dziś; `TreeNode` i
`SkillTree` bez zmian w kształcie. Obie trasy renderują `<SkillTreeView tree
hrefForNode>` — sygnatura komponentu zostaje, więc pliki tras **nie wymagają
edycji**.

Brak nowej powierzchni autoryzacyjnej → **`/security-review` nie jest wymagany**
(zmiana nie dotyka auth, `trainer_id`, podpisanych URL ani uploadu). Brak zmian w
schemacie → **brak migracji**. Brak zmian w repo → **brak nowych testów
integracyjnych**; istniejące (`tests/skill-tree.itest.ts`) muszą dalej
kompilować się bez zmian.

---

## 7. Dostępność

- Karta zostaje linkiem z `aria-label`: `<nazwa> — <tier>, <stan>`.
- Znaczniki kierunku i rzymskie numery: `aria-hidden`.
- Warstwa krawędzi: jeden `role="img"` z `aria-label`, jak dziś.
- Kontrast na płycie atramentowej i karcie eksperta — reguły z poprzedniego
  specu obowiązują bez zmian (`--muted-2`, krycie 0,8 dla zablokowanej inwersji).
- Ruch przy wejściu dalej wyłączany przez `prefers-reduced-motion` (czas trwania
  **i** opóźnienie).
- Fokus klawiatury: karty w kolejności DOM = porządek czytania planszy od dołu do
  góry, rząd po rzędzie.

---

## 8. Testy

**Jednostkowe (test-first, Vitest, bez DB):**
`skill-pyramid.test.ts` (przepisany — §4.1) i `skill-pyramid-routing.test.ts`
(nowy — §4.2). Najważniejsze dwa: „łańcuch stoi w jednej kolumnie" i „żaden pion
nie przecina karty".

**Integracyjne:** brak nowych. Regresja: `tests/skill-tree.itest.ts` bez zmian.

**Weryfikacja wizualna:** ręczna, obie role, oba motywy, 375 px i desktop —
ścieżka w handoffie. `npm run shots` wymaga działającego stacku, więc uruchamia
je właściciel.

**Bramki „done":** `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, `/code-review` per task. Bez `/security-review` (§6).

---

## 9. Dokumentacja do aktualizacji (część „done")

- `app/lib/README.md` — zmieniony `skill-pyramid.ts`, nowy
  `skill-pyramid-routing.ts`.
- `app/components/README.md` — przebudowany `skill-tree.tsx`.
- `design-system/README.md` — sekcja „Piramida umiejętności": **wycofanie** reguły
  o wcinanych pasach, dopisanie płyt pełnej szerokości, rzymskich numerów,
  znaczników kierunku i linii szczytu.
- `docs/README.md` — już zawiera wpis o makiecie.
- `CLAUDE.md` — bez zmian (brak nowego katalogu i nowej konwencji przekrojowej).

---

## 10. Ryzyka i otwarte kwestie

| Ryzyko | Mitygacja |
|---|---|
| Brak podglądu w pętli — implementuję bez widoku przeglądarki | Geometria i routing to czyste funkcje z testami na własnościach (nie na pikselach); makieta jest referencją; ręczna weryfikacja u właściciela przed commitem |
| Rozciągnięcie osi X deformuje róg łamanej | Akceptowane; współczynnik blisko 1 przy `min-width` + `BOARD_SLACK` |
| Karta rośnie ponad nominał przy dwuliniowej nazwie na mobile | Krawędź kończy się wtedy pod kartą (bezpieczny kierunek); nominał dobrany pod ten przypadek |
| Barycentrum daje gorszy układ niż alfabet dla jakiegoś grafu | Test porównujący liczbę skrzyżowań z wariantem alfabetycznym |
| Utrata sylwetki piramidy może rozczarować | Świadoma decyzja właściciela przy wyborze kierunku A; monumentalność przenosi się na masę warstw i rzymskie numery |
| Wysokość planszy rośnie (~1090 px dla pełnego drzewa) | Akceptowane — to ekran do oglądania, przewijany w pionie jak każda strona |

---

## 11. Kryteria akceptacji

1. Karta na desktopie ma 240 px szerokości, na telefonie 116 px; nazwa jest
   czytelna na obu.
2. Płyty warstw są pełnej szerokości, mają rail z etykietą i licznikiem oraz
   rzymski numer; płyta `EKSPERT` jest atramentowa.
3. Każda karta z zależnymi ma stopkę na górnej krawędzi, każda karta z
   prerekwizytami ma grot na dolnej; legenda nazywa tę regułę słowami.
4. Żaden pionowy odcinek krawędzi nie przechodzi przez kartę — potwierdzone
   testem jednostkowym na grafie produkcyjnym.
5. Dwie krawędzie w jednej przerwie o nachodzących zakresach x biegną w różnych
   pasach — potwierdzone testem.
6. Łańcuch prereków stoi w jednej kolumnie — potwierdzone testem.
7. Linia szczytu pojawia się na wysokości najwyższego zdobytego tieru i znika,
   gdy nic nie jest opanowane.
8. Drzewo działa na 375 px (przewijanie poziome, nie ścisk karty) i w obu
   motywach; `prefers-reduced-motion` wyłącza wejście.
9. Trasy nie wymagały edycji; `tests/skill-tree.itest.ts` kompiluje się bez zmian.
10. Bramki zielone: `npm test`, `npm run typecheck`, `npm run lint`,
    `npm run build`, `/code-review` per task.
