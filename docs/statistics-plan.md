# Plan statystyk — kalisthenos

Dokument zbiera propozycje statystyk do wyświetlenia trenerowi (o podopiecznym)
oraz podopiecznemu (o samym sobie). Każda pozycja jest oceniona pod kątem
**realnej wartości** — nie wszystko, co da się policzyć, warto pokazywać.

Bazuje na obecnym schemacie:
- `workout_set_logs.reps + difficulty (1-10) + videoFileId`
- `workout_logs.performedOn + allDone + sessionName + planId + planSessionId`
- `exercises.tags` (kategorie typu push/pull/legs)
- `body_photos.takenOn + view + note`
- `plans` (version, basedOnVersion, publishedAt, status)

---

## Statystyki TRENERA o podopiecznym

**Cel**: szybko zobaczyć, czy ten podopieczny potrzebuje uwagi i czy plan
działa.

### Wysoka wartość — "health check" na pierwszy rzut oka

- **Status aktywności**: dni od ostatniej sesji, sesji w 7/30 dni, średni
  interwał między sesjami. Kolor-koder na karcie podopiecznego
  (zielony / żółty / czerwony).
- **% sesji ukończonych w całości** — bezpośrednio z `allDone`. Jeśli spada
  → albo plan za ciężki, albo demotywacja.
- **Średnie RPE z ostatnich 5 sesji + trend** vs średnia historyczna. Trend
  rosnący = ostrzeżenie o przeciążeniu / formie psującej się ze zmęczenia.
- **% serii w "czerwonej strefie" (RPE 9-10)** w ostatnich 4 tyg. Jeśli > 40%
  → plan za ostry. Jeśli < 5% → za lekki.
- **Sparkline aktywności** (heatmapa 12 tyg) — jeden widget pokazuje
  regularność lepiej niż 5 liczb.

### Wysoka wartość — czy plan działa

- **Progresja per ćwiczenie**: PR reps + data PR, śr. reps z ostatnich 4 sesji
  vs śr. z 4 poprzednich (delta %). Wizualnie zielona strzałka / czerwona
  / kreska.
- **Plateau detector**: lista ćwiczeń bez wzrostu śr. reps przez 3+ wykonania
  **przy stałym lub rosnącym RPE** (czyli się męczy bez efektu). To kandydaci
  do regresji lub zmiany.
- **Lista "rośnie / stoi / cofa się"** — top 5 w każdej kategorii. Trener od
  razu wie, gdzie wzmacniać, gdzie odpuścić.
- **Wykorzystanie sesji z planu**: ile razy każda sesja z `planSessions`
  została wykonana. Wykrywa "robi tylko push, nigdy legs".

### Średnia wartość — kontekst

- **Tag distribution** (% sesji per kategoria z `exercises.tags`) w ostatnich
  30 dniach — balans push/pull/legs.
- **Liczby kumulatywne**: łączne powtórzenia, łączne sekundy pod tension,
  łączna liczba serii **na obecnym planie**. Pokazuje, ile zainwestował
  w obecny program.
- **Coverage wideo**: % serii z nagraniem w ostatnim miesiącu — czy ma co
  recenzować.
- **Sylwetka**: dni od ostatniego zdjęcia, pokrycie ujęć (front/side/back
  checkbox).

### Niska wartość — pominąć

- "Najdłuższa sesja" / czas trwania — nie mamy duration, tylko `performedOn`
  (data). Bez timestampu start/koniec — fałszywa precyzja.
- Compliance vs zaplanowany harmonogram tygodniowy — plan nie ma kalendarza,
  więc nie ma "miało być 3, było 2".
- Średnia trudność per blok superset/dropset — za szczegółowe na poziom
  dashboardu.

---

## Statystyki PODOPIECZNEGO o sobie

**Cel**: motywacja + poczucie progresu. Tu statystyki mają sprawiać
przyjemność i pokazywać kierunek.

### Wysoka wartość — to, na co warto wchodzić codziennie

- **Streak**: tygodnie z rzędu z ≥1 sesją + "najdłuższy w historii". Klasyczna
  mechanika retencji, działa.
- **Heatmapa kalendarza** (GitHub-style, 6–12 miesięcy) — jeden rzut oka i
  widać regularność.
- **PR (Personal Records) per ćwiczenie**: max reps + data + opcjonalnie
  confetti gdy pobity świeżo. "Pobiłeś rekord w pull-upach" w karcie po
  zapisie sesji = ogromny boost.
- **Sparkline progresu na ćwiczenie** (mini wykres reps × data) — pokaż 3-5
  głównych ćwiczeń. "3 miesiące temu robiłeś 5 pull-upów, teraz 9" to
  motywuje bardziej niż liczby w tabeli.
- **Trudność spada przy stałych reps** — wykryta automatycznie ("Pull-up: te
  same 8 powtórzeń, ale 2 lata temu RPE 9, teraz RPE 6"). Subtelne, ale to
  dowód postępu, którego inaczej nie widać.

### Wysoka wartość — "duże liczby"

- **Łączne powtórzenia / sekundy pod tension lifetime** — pojedyncza
  imponująca cyfra ("23 847 powtórzeń"). Pasywnie rośnie, satysfakcjonuje.
- **Sesji łącznie** + **dzień #X swojej drogi** (od pierwszej sesji).
- **Ten tydzień vs średnia**: "3 sesje w tym tygodniu, twoja średnia to 2.4".
  Konkretne, pozytywne porównanie ze sobą.

### Średnia wartość — przegląd miesiąca

- **Podsumowanie tygodnia/miesiąca** (np. niedzielne): liczba sesji, PR-y
  pobite w tym tygodniu, top ćwiczenie. Można jako kartę na pulpicie, można
  jako push.
- **Effort balance**: dni "ciężkie" (śr. RPE ≥ 8), "umiarkowane" (5-7),
  "lekkie" (≤ 4) w ostatnim miesiącu. Ramka: "trenujesz mądrze" / "może warto
  zwolnić".
- **Tag distribution per miesiąc** — wizualnie pasek
  "push 40% / pull 35% / legs 25%". Wychwytuje "znowu omijam legs day".

### Wysoka wartość — sylwetka

- **Side-by-side z auto-wyborem**: pierwsze zdjęcie z tego ujęcia vs
  najnowsze. Jeden tap, ogromny "wow" jeśli jest progres.
- **Timeline po ujęciach**: oś czasu przód / bok / tył równolegle.

### Mniej istotne — można pominąć

- "Najdłuższa seria bez przerwy" / "najcięższy dzień" — gimmick, mało
  użytecznego sygnału.
- Globalne rankingi vs inni — appka jest 1-trener/N-podopiecznych, nie social.
  Skomplikowane prywatnie, mało wartości.
- Predykcje ("za 3 mies. zrobisz 15 pull-upów") — łatwo się ośmieszyć przy
  małej próbce.

---

## Minimum viable dashboard — rekomendacja

### Trener (karta `/trener/podopieczni/:id`)

4 kafelki na górze:
1. Status: dni od ostatniej sesji + sesji w 7 dniach + kolor health
2. Średnie RPE ostatnich 5 sesji + trend strzałka
3. % serii w czerwonej strefie (30 dni)
4. % sesji `allDone` (30 dni)

Pod tym sekcja **"Ćwiczenia"**: tabela z PR + delta śr. reps + status
(rośnie / stoi / cofa się), sortowalna. Plus rozwijany szczegół = sparkline
per ćwiczenie.

### Podopieczny (osobna zakładka `Statystyki` lub karta na pulpicie)

1. Hero numbers: sesji łącznie, streak, łączne powtórzenia
2. Heatmapa kalendarza
3. Lista PR-ów (z datą) + wyróżnienie świeżych
4. Sparkline'y 3–5 top ćwiczeń
5. Karta "ten tydzień" (sesje, PR-y, krótkie podsumowanie)

---

## Czego brakuje w danych

Warto rozważyć, jeśli serio idziemy w statystyki:

- **Timestamp początku i końca sesji** → czas trwania, sesje na minutę, sesje
  w danej porze dnia.
- **Pole `body_weight` przy zdjęciu sylwetki** (jako structured number, nie
  tylko w `note`) → wykres masy ciała w czasie. Dziś to jest, ale schowane
  w wolnym tekście.
- **Cel/intent przy planie albo sesji** (np. "siła" / "wytrzymałość"
  / "deload") → pozwala zinterpretować RPE w kontekście. Bez tego "RPE 9"
  wygląda groźnie, choć może to był zaplanowany top set.
