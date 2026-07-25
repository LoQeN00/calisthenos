# kalisthenos — Tiery umiejętności i piramida drzewa — design spec

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-07-24
**Powiązane:**
[`2026-06-01-drzewo-umiejetnosci-design.md`](2026-06-01-drzewo-umiejetnosci-design.md)
(fundament: graf prerekwizytów, cztery stany węzła, warstwy z głębokości
topologicznej — ten spec **zastępuje** warstwowanie piramidą i dokłada wymiar
trudności) ·
[`2026-06-01-umiejetnosci-progresja-wariantow-design.md`](2026-06-01-umiejetnosci-progresja-wariantow-design.md)
(drabina wariantów wewnątrz węzła — bez zmian) ·
[`../../../design-system/README.md`](../../../design-system/README.md)
(rejestr wizualny — ten spec dopisuje do niego sekcję).

---

## 0. Kontekst i decyzje wejściowe

Drzewo umiejętności istnieje i działa, ale układ pionowy bierze się wyłącznie z
głębokości prerekwizytów (`assignLayers`), przez co: korzenie siedzą **na górze**,
a rozwój spływa w dół (odwrotnie do intuicji „wspinaczki"); umiejętność bez
prerekwizytów ląduje w rzędzie 0 niezależnie od tego, czy to Push-up czy Planche;
a trener nie ma jak wyrazić „jak ciężka" jest umiejętność.

Cel produktowy: **drzewo ma być powodem do dumy**. To ekran, na który podopieczny
patrzy, żeby zobaczyć, ile zdobył — a nie diagram zależności.

Decyzje ustalone w brainstormie (2026-07-24):

- **Tier** — czterostopniowa skala trudności na umiejętności, ustawiana ręcznie
  przez trenera: `PODSTAWOWY` · `ŚREDNIO ZAAWANSOWANY` · `ZAAWANSOWANY` ·
  `EKSPERT`. Ustawiany przy tworzeniu, edytowalny w każdej chwili.
- **Układ = pasy tierów + podrzędy.** Tier wyznacza pas piramidy (fundament na
  dole, ekspert na górze). Wewnątrz pasa węzły dzielą się na podrzędy według
  prerekwizytów **w obrębie tego samego pasa** — dzięki temu każda linia biegnie
  w górę, nigdy w bok.
- **Rejestr wizualny: system + wąskie, nazwane rozszerzenie.** Tier różnicujemy
  **ciężarem** karty (płaski → hairline → ramka 1.5px → inwersja atramentowa), nie
  kolorem. Lime zostaje zarezerwowany wyłącznie dla postępu podopiecznego. Bez
  glow, gradientów i emoji.
- **Walidacja: twardo przy prerekwizycie, miękko przy tierze.** Dodanie prereka z
  wyższego tieru — zablokowane. Zmiana tieru — zawsze przechodzi, edytor pokazuje
  ostrzeżenie z listą kolizji.
- **Migracja** przypisuje wszystkim istniejącym umiejętnościom `PODSTAWOWY`.

### Dlaczego to nie kłóci się z istniejącym modelem

Tier jest **czysto porządkujący**. Nie wchodzi do wyliczania stanu węzła
(`mastered` / `in_progress` / `available` / `locked`), który dalej liczy się
wyłącznie z awansów i prerekwizytów. Zmiana tieru **nigdy** nie odblokuje ani nie
zablokuje niczego podopiecznemu i nie unieważnia historii awansów — przebudowuje
tylko układ piramidy.

---

## 1. Cel i nie-cele

### Cel

Wprowadzić `skills.tier`, przebudować drzewo w **piramidę pasów tierów**
(fundament na dole), dołożyć nagłówek postępu i plakietki tieru, oraz wymusić
regułę „prerekwizyt nie z wyższego tieru" w miejscu deklarowania zależności.

### Nie-cele (świadome cięcia)

- **Automatyczne wnioskowanie tieru** z liczby wariantów, głębokości grafu czy
  statystyk. Tier jest decyzją trenera.
- **Wpływ tieru na stany węzła, sugestie awansu i statystyki.** Tier nie bramkuje
  niczego.
- **Osobny układ drzewa na mobile.** Ta sama piramida na obu ekranach (§5.5).
- **Pokazywanie pustych pasów.** Pas bez umiejętności nie jest renderowany —
  biblioteka z samymi podstawami to jeden pas, nie cztery, z czego trzy puste.
- **Twarda blokada zmiany tieru** przy istniejącej kolizyjnej krawędzi (§6.2).
- **Snapshot „najwyższego zdobytego tieru"** w bazie. Liczony na bieżąco, więc po
  przetierowaniu umiejętności w dół może się cofnąć — nagłówek pokazuje stan
  dzisiejszej piramidy, nie historię.
- **Tiery per-podopieczny.** Tier należy do umiejętności trenera, jest wspólny dla
  wszystkich jego podopiecznych.

---

## 2. Słownik

- **Tier** — stopień trudności umiejętności. Cztery wartości, uporządkowane.
- **Pas (band)** — poziomy segment piramidy odpowiadający jednemu tierowi.
  Renderowany tylko gdy niepusty.
- **Podrząd (row in band)** — rząd wewnątrz pasa. Podrząd 0 leży najniżej w pasie
  i skupia węzły bez prerekwizytów **w tym samym pasie**.
- **Rząd wizualny** — para (pas, podrząd); jednostka układu pionowego.
- **Krawędź odwrócona** — prerekwizyt z wyższego tieru niż umiejętność, która go
  wymaga. Niemożliwa do utworzenia przez „dodaj prerekwizyt", ale osiągalna przez
  późniejszą zmianę tieru. Renderowana wyróżnionym stylem (§5.4).

---

## 3. Model danych

Jedna nowa kolumna i jeden nowy typ enum; żadnych nowych tabel. Schemat = źródło
prawdy (`app/lib/db/schema.ts`); migracja przez `npm run db:generate` — **bez
ręcznej edycji `migrations/`**.

```ts
export const skillTier = pgEnum("skill_tier", [
  "basic", "intermediate", "advanced", "expert",
]);

// w tabeli skills:
tier: skillTier("tier").notNull().default("basic"),
```

Wartości w bazie po angielsku — spójnie z `user_role`, `plan_status`,
`consultation_status`. Polskie etykiety żyją wyłącznie w warstwie prezentacji
(§4.1).

**Oczekiwany SQL migracji:**

```sql
CREATE TYPE "public"."skill_tier" AS ENUM('basic', 'intermediate', 'advanced', 'expert');
ALTER TABLE "skills" ADD COLUMN "tier" "skill_tier" DEFAULT 'basic' NOT NULL;
```

`DEFAULT ... NOT NULL` backfilluje istniejące wiersze w tym samym `ALTER TABLE` —
osobny `UPDATE` nie jest potrzebny. **Wygenerowany plik trzeba przeczytać i
potwierdzić**, że tak właśnie wygląda, zanim uznamy migrację za załatwioną; gdyby
Drizzle wygenerował wariant bez `DEFAULT`, dopisujemy `UPDATE skills SET tier =
'basic'` w nowym pliku migracji (nie edytując starych).

Bez indeksu na `tier` — filtrowanie i grupowanie dzieje się na garści wierszy
jednego trenera, już pobieranych zapytaniem listy.

---

## 4. Czysta logika (TDD, bez DB)

### 4.1 `app/lib/skill-tier.ts` (nowy)

Słownik tierów i porównania. Zero zależności od DB i Reacta.

```ts
export const SKILL_TIERS = ["basic", "intermediate", "advanced", "expert"] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];

/** Etykieta w pisowni zdaniowej; wersalik robi CSS tam, gdzie design-system tego wymaga. */
export const TIER_LABEL: Record<SkillTier, string>;
  // basic → "Podstawowy"
  // intermediate → "Średnio zaawansowany"
  // advanced → "Zaawansowany"
  // expert → "Ekspert"

/** 0 (basic) … 3 (expert). */
export function tierRank(tier: SkillTier): number;

/** Czy `prereqTier` wolno użyć jako prerekwizytu umiejętności o `skillTier`. */
export function canBePrerequisite(prereqTier: SkillTier, skillTier: SkillTier): boolean;
  // rank(prereqTier) <= rank(skillTier)

/** Najwyższy tier z ≥1 opanowaną umiejętnością; null gdy brak. */
export function highestEarnedTier(
  nodes: Array<{ tier: SkillTier; mastered: boolean }>,
): SkillTier | null;
```

`highestEarnedTier` przyjmuje `mastered: boolean`, a nie `NodeState`, żeby moduł
słownika tierów nie zależał od semantyki grafu — mapowanie `state === "mastered"`
robi wołający.

Etykiety w pisowni zdaniowej, bo `<select>` w formularzu ma być czytelny;
plakietka i rail pasa dostają `text-transform: uppercase` z design-systemu.

**Plan testów (`skill-tier.test.ts`):**
- `TIER_LABEL` ma wpis dla każdej wartości `SKILL_TIERS` (test przez iterację, nie
  przez wypisanie czterech asercji — łapie zapomniany wpis przy rozszerzaniu).
- `tierRank` rośnie ściśle monotonicznie w kolejności `SKILL_TIERS`.
- `canBePrerequisite`: równy tier → true; niższy → true; wyższy → false;
  wszystkie 16 par przez iterację po `SKILL_TIERS × SKILL_TIERS`.
- `highestEarnedTier`: pusta lista → null; brak `mastered` → null; jedna
  `mastered` w `intermediate` przy `in_progress` w `expert` → `intermediate`;
  wiele opanowanych → najwyższy.

### 4.2 `app/lib/skill-pyramid.ts` (nowy)

Układ piramidy: przypisanie rzędów **i** geometria. Jeden moduł, bo to jedna
odpowiedzialność („jak leży piramida"); semantyka grafu (cykle, stany, topologia)
zostaje w `skill-tree-math.ts` bez zmian.

```ts
export interface PyramidNodeInput { id: string; name: string; tier: SkillTier }

export interface PyramidBand {
  tier: SkillTier;
  /** Od dołu pasa do góry: rows[0] = podrząd 0. Każdy rząd posortowany po nazwie (locale pl). */
  rows: string[][];
}

/** Tylko niepuste pasy, rosnąco od `basic`. */
export function buildPyramid(nodes: PyramidNodeInput[], edges: Edge[]): PyramidBand[];
```

Reguły `buildPyramid`:
1. Pas węzła = jego `tier`.
2. Podrząd = najdłuższy łańcuch liczony **wyłącznie po krawędziach, których oba
   końce leżą w tym samym pasie**. Krawędzie międzypasowe (w tym odwrócone) nie
   tworzą podrzędów — inaczej pojedyncza zależność rozciągnęłaby pas na wysokość
   całego drzewa.
3. Kolejność w rzędzie: po nazwie, locale `pl` (reużycie `orderWithinLayer`) —
   determinizm dla SSR.
4. Guard na nieoczekiwany cykl w obrębie pasa (jak w `assignLayers`): głębokość 0,
   bez pętli nieskończonej.

Geometria — deterministyczna, bez pomiaru DOM (§5.2):

```ts
export const VIEW_W = 1000;

export interface PyramidMetrics {
  rowH: number;         // wysokość rzędu wizualnego w px
  bandHeaderH: number;  // pasek z nazwą tieru i licznikiem, w px
  bandGap: number;      // odstęp między pasami, w px
  insetStep: number;    // zawężenie pasa na stronę, w jednostkach VIEW_W, na każdy pas w górę
  maxInsetFrac: number; // twardy limit zawężenia na stronę (ułamek VIEW_W, < 0.5)
}

export interface PyramidLayout {
  totalH: number;                 // px — wysokość planszy i viewBox SVG
  boardCols: number;              // ile szerokości karty musi mieć plansza (→ min-width)
  bands: Array<{ tier: SkillTier; x0: number; x1: number; y: number; h: number }>;
  centers: Map<string, { x: number; y: number }>; // x w 0..VIEW_W, y w px
}

export function layoutPyramid(bands: PyramidBand[], m: PyramidMetrics): PyramidLayout;
```

Reguły `layoutPyramid`:
- Pasy układane od góry (najwyższy tier) w dół; wewnątrz pasa podrzędy od
  najwyższego do 0. Wynik: fundament na dole planszy.
- **Zawężenie:** pas o indeksie `i` (licząc od dołu, 0 = najniższy renderowany)
  ma wcięcie `min(i * insetStep, maxInsetFrac * VIEW_W)` na stronę. Limit
  `maxInsetFrac` istnieje po to, żeby wysoka piramida nie zwinęła szczytu do
  paska; poza nim **zawężenie jest nienaruszalne** — sylwetka piramidy to cały
  sens tego widoku.
- **Koszt zawężenia bierze plansza, nie karta.** Pas mieści swoje kolumny na
  zawężonym `span` zamiast na pełnych `VIEW_W`, więc żąda od planszy szerokości
  `widestRowInBand * VIEW_W / span`; `boardCols` to maksimum tych żądań i steruje
  `min-width` planszy. Karta nigdy nie chudnie — szersza robi się plansza (czyli
  na wąskim ekranie dochodzi trochę przewijania).

  Odrzucony wariant: przycinanie zawężenia tak, by kolumna nigdy nie zeszła
  poniżej `VIEW_W / widestRow`. Przy jednym węźle na pas daje to `widestRow = 1`,
  minimalną kolumnę równą pełnej szerokości i zawężenie ścięte do zera — piramida
  spłaszcza się w prostokąt, łamiąc kryterium akceptacji nr 3. Biblioteka z dwiema
  umiejętnościami trafia w ten przypadek od razu.
- Węzły rozkładają się równomiernie w zakresie pasa:
  `x = x0 + ((i + 0.5) / n) * (x1 - x0)`.
- `y` = środek rzędu wizualnego w px.

**Plan testów (`skill-pyramid.test.ts`):**
- `buildPyramid`: węzeł bez krawędzi → pas swojego tieru, podrząd 0; łańcuch
  wewnątrz pasa (A wymaga B, oba `intermediate`) → B w podrzędzie 0, A w 1;
  krawędź międzypasowa (`advanced` wymaga `basic`) → oba w podrzędzie 0 swoich
  pasów; krawędź odwrócona (`basic` wymaga `expert`) → nie tworzy podrzędu, nic
  nie wybucha; pas bez węzłów pominięty; kolejność w rzędzie po nazwie z `ł`/`ż`
  (locale pl); dwa wywołania na tym samym wejściu → identyczny wynik; cykl w pasie
  → brak zapętlenia.
- `layoutPyramid`: `totalH` = suma nagłówków, rzędów i odstępów; pasy nie nachodzą
  na siebie (`y + h <= y` następnego); zawężenie monotoniczne w górę przy pasach
  o równej liczbie węzłów (to jest test, który złapał odrzucony wariant klamry);
  zatłoczony górny pas **poszerza planszę** zamiast tracić zawężenie; twardy limit
  `maxInsetFrac` przy dużym `insetStep`; `centers` ma wpis dla każdego węzła;
  środki w rzędzie rosnące i symetryczne względem środka pasa; jednoelementowy
  rząd → `x` w środku pasa; `boardCols` ≥ liczba węzłów w najszerszym rzędzie.

### 4.3 `app/lib/skill-tree-math.ts` — bez zmian

`wouldCreateCycle`, `nodeState`, `topoOrder`, `orderWithinLayer` zostają — wszystkie
są dalej używane (walidacja krawędzi, stany węzłów, kolejność w rzędzie).

`assignLayers` przestaje mieć wołającego. **Zostaje** — inaczej niż gałąź
`showStates` (§5.7), bo tamto cięcie realnie zdejmuje pracę z tego feature'a
(dwa warianty rampy ciężaru do zaprojektowania), a tutaj usunięcie nie oszczędza
niczego: to czysta, przetestowana funkcja, której nie dotykamy. Uporządkowanie
jej to osobna decyzja, nie okazja przy okazji.

---

## 5. UI

### 5.1 Nagłówek postępu (tylko widok per-podopieczny)

Pasek nad piramidą, karta w idiomie `.stat` (bez nowych prymitywów):

| wartość | etykieta |
|---|---|
| `8/24` | OPANOWANE |
| `ZAAWANSOWANY` | NAJWYŻSZY ZDOBYTY TIER |
| `3` | W TOKU |

„Najwyższy zdobyty tier" = najwyższy tier z co najmniej jedną umiejętnością w
stanie `mastered` (`highestEarnedTier`); gdy brak — kreska w miejscu wartości.
Nagłówek dostają obie żywe trasy drzewa: podopieczny ogląda własną piramidę,
trener ogląda piramidę konkretnego podopiecznego — w obu przypadkach stany są
policzone (§5.7).

### 5.2 Plansza i geometria

Dzisiejsze krawędzie trafiają w karty, bo wszystkie rzędy są równe, a SVG jest
rozciągany `preserveAspectRatio="none"` na wysokość kontenera. Przy pasach o
różnej liczbie podrzędów i nagłówkach to przestaje działać, więc model staje się
jawny:

- Stała `rowH`, `bandHeaderH`, `bandGap` w px → `totalH` z `layoutPyramid`.
- Karty **pozycjonowane absolutnie**: `left: (x / VIEW_W * 100)%`, `top: y px`,
  `transform: translate(-50%, -50%)`.
- SVG krawędzi: `viewBox="0 0 1000 {totalH}"`, `preserveAspectRatio="none"`,
  `width: 100%`, `height: {totalH}px`. Pion mapuje się 1:1, poziom rozciąga na
  szerokość planszy — więc końce beziera zawsze lądują w środkach kart.
- Zero `useEffect`, zero pomiarów DOM, czysty SSR (jak dziś).
- Karta ma stałą szerokość i klamruje nazwę do dwóch linii — przy pozycjonowaniu
  absolutnym wysokość karty nie wpływa na układ.

### 5.3 Pasy jako płyty

Każdy pas to well: `background: var(--surface-2)`, `1px solid var(--line)`,
`border-radius: var(--radius-lg)`, wcięty względem pasa pod sobą → sylwetka
schodkowej piramidy. Na płycie rail: mono wersalik z nazwą tieru po lewej,
licznik po prawej (`4/6` w widoku podopiecznego, `6` w widoku autora).

### 5.4 Węzły i krawędzie

**Tier = ciężar karty, stan = akcent.** Dwa kodowania nie kolidują, bo siedzą na
różnych warstwach karty.

| tier | karta |
|---|---|
| `basic` | `--surface` + hairline `--line` |
| `intermediate` | `--surface` + `--line-2` |
| `advanced` | ramka 1.5px `--line-2` |
| `expert` | inwersja: `background: var(--ink)`, `color: var(--bg)` |

Inwersja nie jest nowym środkiem — dokładnie tak działa już `.nav-item.active` i
`.brand-mark`, więc w dark mode odwraca się poprawnie sama.

Stan zostaje tam, gdzie jest dziś: pigułka stanu, kafel z inicjałem, pasek
postępu — wszystko przez `var(--ok)` / `var(--accent)` / `var(--muted-2)`. Na
karcie eksperta trzeba sprawdzić kontrast tekstu drugorzędnego (`--muted` na
`--ink` jest za słaby → `--muted-2` albo `--bg` z obniżoną nieprzezroczystością;
do rozstrzygnięcia przy implementacji, na obu motywach).

**Krawędzie:** bezier z prereka (niżej) do zależnej (wyżej).

| przypadek | styl |
|---|---|
| oba końce `mastered` | pełna `--ok`, mocniejsza — „droga, którą przeszedłeś" |
| źródło `mastered` | pełna `--ok` |
| pozostałe | kreskowany hairline `--line` |
| krawędź odwrócona | kropkowana `--warn` |

### 5.5 Ruch i mobile

**Ruch** — jednorazowy, przy wejściu: pasy pojawiają się od dołu do góry,
`translateY(6px)` + fade, 40 ms przesunięcia między pasami, całość poniżej 450 ms;
linie dorysowują się przez `stroke-dasharray`. Mieści się w rejestrze
`slidein`/`rise` z design-systemu. `prefers-reduced-motion` neutralizuje to
automatycznie — reguła globalna jest już w `tokens.css`.

**Mobile** — ta sama piramida, węższe karty. Plansza w `overflow-x: auto` z
`min-width: calc(var(--pyramid-col) * {boardCols})`, gdzie `--pyramid-col` ustawia
media query (desktop ~132px, mobile ~104px). Gdy się mieści — wyśrodkowana; gdy
nie — przewijalna w poziomie razem z płytami i krawędziami (to jeden element).
Szerokość kolumny jest więc wiedzą CSS, a `boardCols` — liczbą kolumn, której
żąda najciaśniejszy pas — wiedzą JS.

### 5.6 Plakietka tieru

`TierBadge` — mono wersalik w idiomie `.badge`, bez koloru per tier (spójnie z
regułą „tier to ciężar, nie kolor"). Miejsca: strona umiejętności u trenera
(nagłówek edytora), drill-in podopiecznego i trenera, karty na liście
umiejętności trenera.

### 5.7 Usunięcie martwej gałęzi „widoku autora" w komponencie

Rozpoznanie kodu wykazało, że **żadna trasa nie renderuje drzewa bez stanów** —
obie żywe trasy (`podopieczny/rozwoj._index.tsx`,
`trener/podopieczni.$traineeId.rozwoj._index.tsx`) przekazują `showStates`. Cała
gałąź `showStates === false` w `SkillTreeView` (szkielet bez stanów, licznik
wariantów zamiast poziomu, brak paska postępu i legendy) nigdy się nie renderuje.

Decyzja: **usuwamy prop `showStates` wraz z jego gałęzią**; komponent zawsze
koloruje wg stanu. Bez tego rampa ciężaru tieru, płyty pasów i traktowanie stanów
musiałyby powstać w dwóch wariantach, z czego jeden byłby niewidoczny —
podwojenie powierzchni wizualnej do zaprojektowania i przetestowania w
feature'ze, który i tak przepisuje cały komponent.

**`getSkillTreeForTrainer` zostaje.** Jest wołane sześciokrotnie w
`tests/skill-tree.itest.ts` jako uchwyt do surowego grafu — testuje przez nie
autoring krawędzi, tenant-scope (drzewo trenera B nie zawiera węzłów ani krawędzi
trenera A) i archiwizację. Usunięcie oznaczałoby przepisanie tych asercji w
teście, którego nie da się uruchomić w pętli developerskiej (Docker), i to w
zamian za skasowanie piętnastu linii. Funkcja dalej musi się kompilować po zmianie
kształtu `TreeNode` (§6.1) — zwraca `tier`, a `state` zostaje `undefined`.

To jedyne cięcie poza zakresem tieru i jest celowo ograniczone do kodu, który ten
feature i tak przepisuje.

---

## 6. Warstwa DB / repo i akcje

### 6.1 Odczyt — `tier` w istniejących funkcjach

| funkcja | zmiana |
|---|---|
| `listSkillsForTrainer` | `SkillListRow` + `tier` |
| `getSkillWithVariations` | `SkillDetail` + `tier` |
| `getSkillMapForTrainee` | `SkillMapEntry` + `tier` (dla plakietki na drill-inie) |
| `listPrerequisitesForSkill` | + `tier` (do wykrycia kolizji w edytorze) |
| `listAssignablePrerequisites` | + `tier`; **filtruje** kandydatów z wyższego tieru |
| `getSkillTreeForTrainee` | `TreeNode`: `layer`/`orderInLayer` → `tier`; układ liczony dopiero w prezentacji przez `buildPyramid` |
| `getSkillTreeForTrainer` | zostaje (używane przez `tests/skill-tree.itest.ts`, §5.7); wypełnia `tier`, `state` dalej `undefined` |

`TreeNode` traci `layer` i `orderInLayer` na rzecz `tier` — pozycję liczy dopiero
warstwa prezentacji przez `buildPyramid`/`layoutPyramid`. Dzięki temu loader
zwraca dane domenowe, nie współrzędne.

### 6.2 Zapis i walidacja

- `createSkill` / `updateSkill` przyjmują `tier`.
- `SkillFormSchema` (`app/lib/skill-types.ts`) dostaje
  `tier: z.enum(SKILL_TIERS)` z domyślnym `"basic"`.
- **`addPrerequisite` — twarda blokada.** Gdy `!canBePrerequisite(prereqTier,
  skillTier)` → `SkillError` z komunikatem po polsku nazywającym oba tiery
  (np. „Prerekwizyt nie może być trudniejszy od umiejętności, która go wymaga:
  *Front Lever* to ZAAWANSOWANY, a *Planche* to EKSPERT."). Walidacja **w
  repozytorium**, nie tylko w trasie — akcja to jedyna bramka, a bezpośredni POST
  mógłby ominąć picker (ten sam wzorzec, co `addVariation` i zarchiwizowane
  ćwiczenie).
- **`updateSkill` — bez blokady.** Zmiana tieru zawsze przechodzi.
- Nowa `listConflictingPrerequisites(db, trainerId, skillId)` → prereki z wyższego
  tieru niż dana umiejętność. Zasila ostrzeżenie w edytorze i wykrywanie krawędzi
  odwróconych w drzewie.

Tenant-scope bez zmian: każda funkcja z wymaganym `trainerId`, brak dopasowania →
404.

### 6.3 Trasy

Bez nowych tras — `app/routes.ts` nie wymaga zmian. Modyfikacje:

| plik | zmiana |
|---|---|
| `trener/umiejetnosci.nowa.tsx` | `<select name="tier">` w formularzu |
| `trener/umiejetnosci.$skillId.tsx` | `<select>` w formularzu zapisu; plakietka; ostrzeżenie o kolizyjnych prerekach; komunikat błędu z `addPrerequisite` |
| `trener/umiejetnosci._index.tsx` | sekcje po tierze (od podstaw w górę — czyta się jak program) + filtr przez `<ListControls>` wg konwencji z `CLAUDE.md`; plakietka na karcie |
| `podopieczny/rozwoj._index.tsx` | nagłówek postępu nad piramidą |
| `trener/podopieczni.$traineeId.rozwoj._index.tsx` | jw. (trener ogląda piramidę podopiecznego, więc nagłówek też) |
| `podopieczny/rozwoj.umiejetnosc.$skillId.tsx` | plakietka tieru |
| `trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` | plakietka tieru |

`<ListControls>` wymaga `sortOptions` i `defaultSort` — lista umiejętności dostaje
sortowanie „po nazwie" (domyślne) i „po tierze", plus grupę filtrów `tier` z
opcją `all`.

---

## 7. Autoryzacja i tenant-scope

Bez nowych powierzchni: tier to kolumna w istniejącej, już tenant-scopowanej
tabeli. Reguły bez zmian:

- Trener edytuje tier wyłącznie swoich umiejętności (`trainerId` w `WHERE`); obcy
  skill → 404.
- Podopieczny widzi tier **read-only**; brak akcji zapisu.
- Walidacja prereka porównuje tiery dwóch umiejętności **tego samego trenera** —
  `bothSkillsOwned` już to gwarantuje i musi zostać uruchamiane **przed**
  porównaniem tierów (inaczej komunikat błędu zdradzałby tier obcej umiejętności).

Zmiana dotyka `trainer_id` → bramka `/security-review` na końcu.

---

## 8. Testy

**Jednostkowe (test-first, Vitest, bez DB):** `skill-tier.test.ts` (§4.1) i
`skill-pyramid.test.ts` (§4.2).

**Integracyjny (`*.itest.ts`, testcontainers — PISZ, uruchamia właściciel)** —
`tests/skill-tier.itest.ts`:
- `createSkill` zapisuje tier; `updateSkill` go zmienia; trener B dostaje 404 na
  umiejętności trenera A.
- Migracja/domyślna wartość: umiejętność wstawiona bez `tier` ma `basic`.
- `addPrerequisite` odrzuca prereq z wyższego tieru; przyjmuje równy i niższy.
- `listAssignablePrerequisites` nie zwraca kandydatów z wyższego tieru.
- Po podniesieniu tieru prereka (`updateSkill`) krawędź **zostaje**, a
  `listConflictingPrerequisites` ją raportuje.

**Bramki „done":** `npm test` + `npm run typecheck` + `npm run lint` +
`npm run build`, `/code-review` per task, `/security-review`, oraz zgłoszenie
testów integracyjnych właścicielowi do uruchomienia (Docker).

---

## 9. Dokumentacja do aktualizacji (część „done")

- `app/lib/README.md` — nowe `skill-tier.ts`, `skill-pyramid.ts`, zmienione
  sygnatury w `skills.ts` / `skill-tree.ts` / `skill-progression.ts`.
- `app/lib/db/README.md` — enum `skill_tier` i kolumna `skills.tier`.
- `app/components/README.md` — przebudowany `skill-tree.tsx`, `TierBadge`.
- `app/routes/trener/README.md`, `app/routes/podopieczny/README.md` — zmienione
  zachowanie tras (piramida, nagłówek, filtr po tierze).
- `design-system/README.md` — **nowa sekcja** „Piramida umiejętności": tier jako
  ciężar zamiast koloru, inwersja atramentowa na szczycie, płyty pasów, ruch przy
  wejściu. To jedyne rozszerzenie rejestru wizualnego w tym feature'ze i musi być
  zapisane, żeby nie wyglądało na wyjątek bez uzasadnienia.
- `CLAUDE.md` — bez zmian (brak nowego katalogu i nowej konwencji przekrojowej).

---

## 10. Ryzyka i otwarte kwestie

| Ryzyko | Mitygacja |
|---|---|
| Kontrast tekstu drugorzędnego na atramentowej karcie eksperta | Sprawdzić na obu motywach przy implementacji; `--muted-2` zamiast `--muted`, ewentualnie `--bg` z obniżoną nieprzezroczystością. |
| Zatłoczony górny pas psuje sylwetkę piramidy | Zawężenie przycinane do szerokości kolumny (§4.2); w skrajnym przypadku pas jest pełnej szerokości — brzydziej, ale czytelnie. |
| Krawędzie odwrócone po edycji tieru | Świadomie dozwolone; wyróżniony styl w drzewie + ostrzeżenie w edytorze. Układ jest totalny — działa dla dowolnego wejścia. |
| Poziomy scroll planszy na mobile koliduje z pionowym scrollem strony | Plansza to wyraźnie wydzielony, obramowany blok; `overscroll-behavior-x: contain`. Do weryfikacji na urządzeniu. |
| Migracja bez `DEFAULT` przy nietypowym wyjściu Drizzle Kit | Przeczytać wygenerowany SQL przed handoffem; w razie czego dopisać `UPDATE` w **nowym** pliku migracji. |
| `db:generate` jest interaktywny (pytania o rename/drop) | Nic nie usuwamy ani nie zmieniamy nazwy, więc diff powinien być czysty; komendę odpala właściciel w TTY. |
| Regresja istniejącego drzewa (przepisujemy cały układ) | Testy jednostkowe układu przed implementacją widoku + ręczna weryfikacja obu ról (`npm run shots`). |
| Nagłówek „najwyższy zdobyty tier" cofa się po przetierowaniu | Świadome: nagłówek opisuje dzisiejszą piramidę, nie historię. |

---

## 11. Kryteria akceptacji

1. Trener ustawia tier przy tworzeniu umiejętności i zmienia go w edytorze; obie
   ścieżki walidują wartość przez `SkillFormSchema`.
2. Istniejące umiejętności po migracji mają `PODSTAWOWY`, bez ręcznego backfillu.
3. Drzewo renderuje się jako piramida: `PODSTAWOWY` na dole, `EKSPERT` na górze,
   puste pasy pominięte, każdy pas zawężony względem pasa pod sobą.
4. Prerekwizyt wewnątrz jednego pasa tworzy podrząd — linia biegnie w górę, nie
   w bok.
5. Karta różnicuje tier ciężarem (płaska → hairline → 1.5px → inwersja), a stan
   podopiecznego akcentem; lime nie pojawia się jako oznaczenie tieru.
6. Nad piramidą podopiecznego widać `opanowane X/Y`, najwyższy zdobyty tier i
   liczbę w toku; każdy pas ma własny licznik.
7. Dodanie prereka z wyższego tieru jest odrzucone z polskim komunikatem, a
   picker takiego kandydata nie proponuje. Zmiana tieru przechodzi zawsze, a
   kolizja jest zaraportowana w edytorze.
8. Lista umiejętności trenera grupuje po tierze i daje filtr przez
   `<ListControls>`; plakietka tieru jest widoczna w widokach szczegółowych obu
   ról.
9. Piramida działa na mobile: przewijana w poziomie gdy szersza niż ekran,
   wyśrodkowana gdy się mieści; ruch przy wejściu wyłącza się pod
   `prefers-reduced-motion`.
10. Trener A nie ma dostępu (404) do umiejętności trenera B — potwierdzone testem
    integracyjnym.
11. Prop `showStates` zniknął z `SkillTreeView`; obie trasy drzewa dalej działają,
    a `tests/skill-tree.itest.ts` kompiluje się bez zmian.
12. Bramki „done" zielone: `npm test`, `npm run typecheck`, `npm run lint`,
    `npm run build`, `/code-review`, `/security-review`; testy integracyjne
    zgłoszone właścicielowi.
