# 03 — Modele odczytu

Ekran po ekranie: jakich danych potrzebuje każdy widok. Dokument istnieje po to, żeby odczytowa
strona API nie powstawała przez zgadywanie.

---

## Dlaczego to osobna warstwa

Ekran rzadko odpowiada jednemu zasobowi domenowemu. Pulpit podopiecznego to dziś **jedno**
zapytanie do danych składające sześć różnych agregatów. Gdyby po rozbiciu na osobne usługi każdy
ekran składał się z sześciu wywołań sieciowych, wydajność by spadła, a nie wzrosła — i to samo
dotyczy aplikacji mobilnej, tylko na gorszej sieci.

Dlatego warto traktować modele odczytu jako **pełnoprawną część kontraktu**, a nie obejście:
wolno im agregować przez konteksty, wolno im się zmieniać częściej niż zasobom domenowym, ale
**nie wolno im niczego zmieniać** w danych.

Konwencja zapisu poniżej: *(A)* = agregat wyliczany, *(L)* = lista, *(1)* = pojedynczy byt.

---

## Panel trenera

| Ekran | Potrzebne dane |
|---|---|
| **Powłoka / nawigacja** | Liczba podopiecznych *(A, **łącznie z zarchiwizowanymi**)* · liczba aktywnych ćwiczeń *(A)* · liczba wszystkich planów *(A, łącznie z zarchiwizowanymi)* · liczba zgłoszeń w stanie `new` *(A)* — celowo nie wszystkich, to sygnał „przyszło coś nowego” |
| **Pulpit** | Lista klientów *(L)* · 6 ostatnich treningów wszystkich podopiecznych z nazwą podopiecznego *(L)* · liczba planów aktywnych *(A)* · liczba szkiców *(A)* · liczba treningów z ostatnich 7 dni *(A)* |
| **Biblioteka — lista** | Ćwiczenia z podpisanym odnośnikiem do demo *(L, 24/stronę)* · kategorie trenera *(L)* · liczniki do filtrów · stan kontrolek (sort, filtr kategorii, filtr jednostki, szukajka) |
| **Ćwiczenie — formularz** | Kategorie trenera *(L)* · limit rozmiaru pliku **z serwera**, nie stała w kliencie · przy edycji: ćwiczenie *(1)* z odnośnikiem do demo, informacja czy jest wariantem umiejętności (blokada archiwizacji) |
| **Plany — lista** | Plany z nazwą podopiecznego i liczbą sesji *(L, 20/stronę)* · liczniki zakładek: wszystkie / aktywne / szkice *(A, **zawsze bez zarchiwizowanych**)* · stan kontrolek |
| **Plan — edytor** | Pełne drzewo planu: sesje → bloki → pozycje *(1)* · lista aktywnych ćwiczeń trenera do wyboru *(L)* · tryb widoku wynikający ze stanu planu · informacja, czy istnieje już szkic dla tej pary |
| **Nowy plan** | Aktywni podopieczni trenera *(L, **bez zarchiwizowanych**)* · informacja o istniejącym szkicu dla wybranej pary |
| **Umiejętności — lista** | Umiejętności pogrupowane w warstwy po stopniu trudności *(L)* · liczba wariantów każdej · liczba umiejętności w warstwie |
| **Umiejętność — edycja** | Umiejętność *(1)* · uporządkowane warianty *(L)* · prerekwizyty *(L)* wraz ze stopniem każdego · kandydaci na prerekwizyt *(L, odfiltrowane z wyższego stopnia)* · **konflikty stopni** powstałe po zmianie stopnia *(L)* · ćwiczenia dostępne jako wariant *(L, bez tych już przypisanych gdzie indziej)* |
| **Kalendarz zbiorczy** | Wszystkie terminy trenera w miesiącu, ze wszystkich par, z nazwą podopiecznego *(L, bez odwołanych)* · nawigacja miesiącami |
| **Skrzynka zgłoszeń** | Zgłoszenia wszystkich podopiecznych z nazwą autora *(L, 20/stronę)* · stan kontrolek (szukajka po tytule, treści i autorze; filtry stanu i rodzaju) |
| **Zgłoszenie — szczegół** | Zgłoszenie *(1)* z pełną treścią, autorem, rodzajem, datą i dotychczasową odpowiedzią |
| **Integracje** | Stan połączenia kalendarza zewnętrznego *(1)* · stan połączenia konta rozliczeniowego *(1)* wraz z informacją, czy onboarding jest dokończony |
| **Podopieczni — lista** | Podopieczni *(L, 30/stronę)* · stan kontrolek (sort, filtr „ma plan / nie ma planu”, szukajka) · przy tworzeniu zaproszenia: ćwiczenia do wyboru do formularza startowego *(L)* |

### Widok pojedynczego klienta

| Ekran | Potrzebne dane |
|---|---|
| **Klient — przegląd** | Wskaźniki kondycji współpracy *(A)* · mapa aktywności *(A)* · ćwiczenia w stagnacji *(A)* · wykorzystanie sesji z planu i sumy *(A)* · pokrycie nagraniami i zdjęciami *(A)* · rozkład tagów *(A)* · plan aktywny i szkic *(1+1)* · logi *(L, 20/stronę, sort + filtr nagrania + szukajka)* · **stan formularza startowego** — odnośnik pojawia się tylko wtedy, gdy formularz w ogóle był dołączony |
| **Klient — trening** | Log *(1)* z pełnym drzewem serii i **podpisanymi odnośnikami do nagrań per seria** |
| **Klient — sylwetka** | Zdjęcia *(L)* z podpisanymi odnośnikami · pary „przed / po” *(A)* |
| **Klient — formularz startowy** | Notatka trenera · pozycje z nazwą ćwiczenia, wynikiem **opisanym zgodnie z zamrożoną jednostką** i komentarzem *(L)* · notatka podopiecznego · data wypełnienia |
| **Klient — płatności** | Stan subskrypcji i bieżąca kwota *(1)* · historia faktur z odnośnikami *(L)* · informacja, czy zmiana kwoty wejdzie dopiero od następnego odnowienia |
| **Klient — rozwój** | Drzewo umiejętności ze stanem każdego węzła dla tego podopiecznego *(A)* · nagłówek postępu: opanowane, najwyższy zdobyty stopień, w toku *(A)* · lista pozostałych ćwiczeń z miniwykresem, statusem i oznaczeniem rekordu *(L, sort + filtr tagów)* |
| **Klient — umiejętność** | Umiejętność *(1)* ze stopniem · drabina wariantów z zaznaczonym bieżącym *(L)* · historia awansów *(L)* · wykres i wskaźniki bieżącego wariantu *(A)* · **sugestia awansu**, jeśli sygnały ją uzasadniają |
| **Klient — ćwiczenie** | Progresja ćwiczenia w wybranym zakresie: wykres, rekord, data rekordu, ostatni wynik, status, zmiana procentowa *(A)* |
| **Klient — porównanie** | Serie kilku ćwiczeń znormalizowane do procentu zmiany od początku okresu *(A)* · wartości brzegowe każdego · lista pominiętych (bez danych) |
| **Klient — konsultacje** | Harmonogram *(1)* · terminy nadchodzące i minione ze statusami *(L)* · stan połączenia kalendarza zewnętrznego (do komunikatu o zepsutej integracji zamiast mylącego „0 z 0”) |
| **Klient — termin** | Termin *(1)*: status, moment, odnośnik, notatka prośby o zmianę, podsumowanie i punkty akcji |

---

## Panel podopiecznego

| Ekran | Potrzebne dane |
|---|---|
| **Powłoka / nawigacja** | **Najpierw obie bramki** (dostęp płatniczy, potem formularz startowy), dopiero potem liczniki · liczba treningów *(A)* · liczba zdjęć *(A)* · liczba sesji w aktywnym planie *(A, tylko gdy plan istnieje)* · liczba terminów do potwierdzenia *(A)* · liczba własnych zgłoszeń *(A)* · odznaka płatności, gdy stan wymaga reakcji |
| **Pulpit** | Seria nieprzerwanych tygodni, łączna liczba sesji, „ten tydzień” *(A)* · mapa aktywności *(A)* · bilans wysiłku z ocen RPE *(A)* · aktywny plan *(1)* · 5 ostatnich treningów *(L)* · lista dostępnych podsumowań miesięcznych *(L)* |
| **Sesje** | Pełne drzewo sesji aktywnego planu *(L)* |
| **Sesja — szczegół** | Sesja z blokami i pozycjami *(1)* · podpisane odnośniki do demo ćwiczeń |
| **Logowanie treningu** | Sesja do wypełnienia *(1)* z jednostką i flagą oceny wysiłku **per ćwiczenie** · limit rozmiaru nagrania **z serwera** |
| **Historia** | Treningi *(L, 20/stronę, sort + filtr nagrania + szukajka)* |
| **Trening — szczegół** | Log *(1)* z podpisanymi nagraniami · informacja o pobitych rekordach po świeżym zapisie |
| **Rozwój** | To samo co „Klient — rozwój”, ale **tylko do odczytu** — podopieczny nie zmienia poziomów |
| **Umiejętność / ćwiczenie / porównanie** | Jak w panelu trenera, bez operacji zapisu i bez sugestii awansu |
| **Sylwetka** | Własne zdjęcia *(L, 60/stronę, sort)* · limit rozmiaru **z serwera** |
| **Konsultacje** | Najbliższy termin *(1)* · siatka miesiąca *(L)* · agenda nadchodzących i minionych *(L)* · dozwolone akcje wynikające ze statusu |
| **Zgłoszenia** | Własne zgłoszenia z odpowiedziami trenera *(L, 20/stronę, sort + filtr stanu)* |
| **Płatności** | Stan subskrypcji i kwota *(1)* · historia faktur *(L)* · dostępne akcje zależne od stanu · informacja, czy trener w ogóle ustalił cenę |
| **Podsumowanie miesięczne** | Komplet danych miesiąca *(A)*: archetyp, porównanie z poprzednim miesiącem, wyróżnione osiągnięcia · dostępne tylko dla miesięcy z danymi |
| **Ekran aktywacji** | Kwota subskrypcji *(1)* · nazwa trenera · dostępność akcji opłacenia |
| **Ekran formularza startowego** | Notatka trenera · pozycje z nazwą ćwiczenia i **zamrożoną jednostką** *(L)* |

---

## Reguły wspólne dla odczytów

1. **Nazwa trenera** pojawia się na kilku ekranach podopiecznego (aktywacja, płatności, formularz).
   Podopieczny bez przypisanego trenera musi być obsłużony — to nie jest przypadek niemożliwy.
2. **Odnośniki do plików są podpisane i wygasające.** Model odczytu zwraca gotowy odnośnik, nie
   surowy identyfikator — inaczej każdy klient musiałby powtórzyć logikę podpisywania.
3. **Limity rozmiaru plików pochodzą z serwera.** Klient, który trzyma je jako stałą, przepuści
   plik odrzucony potem przez serwer — po zbuforowaniu go w całości.
4. **Prezentacja statusu należy do serwera**, nie do klienta. Model odczytu zwraca gotowy klucz
   etykiety i „ton” plakietki. Inaczej aplikacja mobilna zaimplementuje regułę drugi raz i statusy
   zaczną wyglądać inaczej niż na webie.
5. **Sortowanie, filtrowanie i szukajka są po stronie serwera**, sterowane parametrami zapytania.
   Klient nie pobiera całości, żeby przefiltrować u siebie.
6. **Licznik i lista muszą używać tego samego zestawu warunków.** Rozjazd daje stronicowanie
   pokazujące „stronę 3” bez wyników.
7. **Zakresy dat są liczone w strefie czasowej aplikacji**, nie w strefie klienta — inaczej „ten
   tydzień” znaczy co innego dla każdego użytkownika.
