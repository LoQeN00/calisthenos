# MVP statystyk — kalisthenos

Pełna lista propozycji + uzasadnienia: [`statistics-plan.md`](./statistics-plan.md).

Ten dokument zawęża listę do **MVP** — rzeczy, które są:
- relatywnie łatwe do zaimplementowania na obecnym schemacie (proste agregacje
  SQL, brak nowych tabel, brak komponentów wykresów),
- dają **największą wartość** odpowiednio trenerowi i podopiecznemu.

Świadomie pomijamy w MVP: heatmapę kalendarza, sparkline'y, side-by-side zdjęć,
plateau detector z korelacją RPE, tag distribution, coverage wideo — wszystko to
wymaga albo komponentów wizualizacji, albo bardziej złożonej logiki. Wrócimy do
nich po MVP.

---

## MVP dla TRENERA

Lokalizacja: nowa pod-trasa
`/trener/podopieczni/:traineeId/statystyki` (plik:
`app/routes/trener/podopieczni.$traineeId.statystyki.tsx`).

Wejście: przycisk **"Statystyki"** w `pagehead` na
`/trener/podopieczni/:traineeId`, obok istniejących "Sylwetka" / "Nowy plan".
Crumbs: `Podopieczni › {imię} › Statystyki`.

Zawartość: **4 kafelki** "health check" na górze + sekcja **"Ćwiczenia"**
z tabelą progresji.

> **Uwaga**: widok trenera i podopiecznego pokazują **te same dane** o tym
> samym podopiecznym. Logika agregacji powinna żyć w jednym module (np.
> `app/lib/stats.ts`) wołanym przez oba loadery z odpowiednim `traineeId`
> (i autoryzacją: trainee tylko swoje, trener tylko swoich podopiecznych).

### 1. Kafelki status (4 sztuki, w jednym wierszu)

| Kafelek | Dane źródłowe | Zachowanie |
|---|---|---|
| **Aktywność** | `MAX(performedOn)` + `COUNT(*) WHERE performedOn >= today-7` | Dni od ostatniej sesji + sesji w 7 dniach. Kolor: zielony (≤7 dni i ≥2 sesje/tydz.), żółty (8–14 dni), czerwony (>14 dni). |
| **Średnie RPE** | `AVG(difficulty)` z ostatnich 5 sesji vs średnia historyczna | Liczba + strzałka trendu (↑ / → / ↓). Trend rosnący sygnalizuje przeciążenie. |
| **Czerwona strefa** | `COUNT(difficulty >= 9) / COUNT(*)` z ostatnich 30 dni | % serii ekstremalnie trudnych. > 40% = plan za ostry, < 5% = za lekki. |
| **Ukończone w całości** | `COUNT(allDone=true) / COUNT(*)` z ostatnich 30 dni | % sesji domkniętych do końca. Spadek = demotywacja albo plan za ciężki. |

### 2. Tabela "Ćwiczenia" (sortowalna)

Per ćwiczenie wykonane przez podopiecznego (z `workout_exercise_logs` +
`workout_set_logs`):

| Kolumna | Dane |
|---|---|
| Ćwiczenie | `exercises.name` |
| PR | `MAX(reps)` |
| Data PR | `performedOn` z loga zawierającego PR |
| Śr. reps (4 ost.) | `AVG(reps)` z ostatnich 4 wystąpień ćwiczenia |
| Δ vs poprzednie 4 | różnica % vs śr. z poprzednich 4 wystąpień |
| Status | badge: **rośnie** (Δ > 5%) / **stoi** (-5% ≤ Δ ≤ 5%) / **cofa się** (Δ < -5%) |

Domyślne sortowanie: "cofa się" najpierw (wymaga uwagi), potem "stoi",
"rośnie" na końcu.

### Czego nie ma w MVP trenera (i dlaczego)

- Heatmapa aktywności 12 tyg → potrzebuje komponentu wykresu.
- Tag distribution push/pull/legs → join przez `exercises.tags` (text[]) +
  agregacja per kategoria — robialne, ale to osobny widget.
- Wykorzystanie sesji z planu → wymaga osobnej sekcji UI.
- Coverage wideo → low-traffic stat.

---

## MVP dla PODOPIECZNEGO

Lokalizacja: **nowa zakładka "Statystyki"** w sidenav podopiecznego
(`app/routes/podopieczny/_layout.tsx` — dopisać piątą pozycję między
"Historia" a "Sylwetka" lub na końcu, ikona np. `Icons.Chart` / nowa).
Trasa: `/podopieczny/statystyki` (plik:
`app/routes/podopieczny/statystyki.tsx`).

Ogon (`tail`) w sidenav: liczba PR-ów (max reps per ćwiczenie), żeby było
widać, że coś się dzieje — opcjonalne, można pominąć w pierwszej iteracji.

### 1. Hero — 3 liczby w jednym kafelku

| Statystyka | Skąd |
|---|---|
| **Sesji łącznie** | `COUNT(workout_logs WHERE traineeId)` |
| **Streak** | liczba kolejnych **tygodni** z ≥1 sesją, licząc wstecz od bieżącego tygodnia |
| **Łączne powtórzenia** | `SUM(reps)` ze wszystkich `workout_set_logs` jego sesji |

Uwaga do streak: tydzień = poniedziałek–niedziela (ISO). Jeśli bieżący tydzień
ma 0 sesji, streak nadal się liczy do końca tygodnia (nie zrywamy w środę).

### 2. Karta "Ten tydzień"

- Liczba sesji w bieżącym tygodniu (pon–niedz.)
- Średnia tygodniowa z ostatnich 8 tygodni
- Krótki komunikat: **"3 sesje w tym tygodniu — twoja średnia to 2.4 ✓"**
  / **"1 sesja — średnio robisz 2.4. Dasz radę nadrobić?"**

### 3. Lista PR-ów

- Per ćwiczenie: nazwa, max reps, data, jednostka (REPS/SEC)
- Świeży PR (z ostatnich 7 dni) wyróżniony badge "świeży"
- Sortowanie: najświeższe daty na górze
- Limit: top 10 ostatnio aktualizowanych

### 4. Toast po zapisie sesji "Pobiłeś rekord!"

Już mamy `ToastProvider` w `root.tsx`. Logika:
- W akcji `loguj.$sessionId.tsx` po zapisie loga, dla każdego ćwiczenia z
  sesji sprawdź czy `MAX(reps)` z tego ćwiczenia historycznie wzrósł.
- Jeśli tak — zwróć do clienta listę nowych PR-ów i pokaż jako toast na
  ekranie szczegółu loga ("🔥 Nowy rekord w Pull-up: 12 powtórzeń!").
- Jeśli kilka — pokaż wszystkie albo jeden zbiorczy.

### Czego nie ma w MVP podopiecznego (i dlaczego)

- Heatmapa kalendarza GitHub-style → potrzebuje komponentu.
- Sparkline progresu per ćwiczenie → komponent wykresu, można zrobić jako
  inline SVG, ale to oddzielny commit.
- "Trudność spada przy stałych reps" → smart detection, wymaga przemyślenia
  algorytmu i progu istotności.
- Effort balance (RPE distribution) → bardziej kontekstowy, mniej
  motywacyjny.
- Side-by-side zdjęć sylwetki → to feature do `/podopieczny/sylwetka`, nie
  statystyka.
- Tag distribution → join przez `exercises.tags`.

---

## Kolejność implementacji (sugerowana)

1. **Wspólny moduł `app/lib/stats.ts`** — funkcje agregujące (statsForTrainee,
   prRecordsForTrainee, exerciseProgressForTrainee). Jeden plik, dwie trasy
   konsumują.
2. **Trasa podopiecznego `/podopieczny/statystyki`** — hero + "Ten tydzień"
   + lista PR-ów + dodanie zakładki w sidenav.
3. **Toast "Pobiłeś rekord!" po zapisie sesji** — kluczowy moment "wow",
   niezależny od trasy `/statystyki`.
4. **Trasa trenera `/trener/podopieczni/:id/statystyki`** — 4 kafelki
   health-check + tabela "Ćwiczenia" + przycisk wejścia z karty
   podopiecznego.

Po MVP wracamy do `statistics-plan.md` po heatmapy, sparkline'y i resztę.
