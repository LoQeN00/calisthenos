# 01 — Zakres funkcjonalny

Co system robi, widziane od strony produktu. Bez technologii.

---

## Aktorzy

| Aktor | Opis |
|---|---|
| **Trener** | Właściciel danych. Prowadzi bibliotekę ćwiczeń, układa plany, definiuje umiejętności, umawia konsultacje, wystawia rozliczenia, ogląda postępy swoich podopiecznych. |
| **Podopieczny** | Należy do **dokładnie jednego** trenera. Loguje treningi, wrzuca zdjęcia sylwetki, ogląda własne statystyki, reaguje na terminy konsultacji, płaci abonament, zgłasza pomysły. |

Nie ma innych ról. Nie ma administratora aplikacji, nie ma użytkownika należącego do wielu
trenerów, nie ma współdzielenia danych między trenerami.

**Konta trenerów nie powstają w aplikacji** — nie ma rejestracji samoobsługowej. Trener jest
zakładany operacyjnie. Podopieczni powstają wyłącznie z zaproszenia wystawionego przez trenera.

---

## Granica izolacji

Wszystkie dane domenowe należą do trenera. Podopieczny widzi wyłącznie własne dane oraz te
zasoby swojego trenera, które są mu udostępnione (plan, biblioteka ćwiczeń w zakresie, w jakim
występuje w planie, drzewo umiejętności).

**Próba sięgnięcia po cudzy zasób musi być nieodróżnialna od sięgnięcia po zasób nieistniejący.**
To reguła produktowa, nie tylko techniczna: trener nie ma prawa dowiedzieć się, że dany
identyfikator w ogóle istnieje u kogoś innego.

---

## A. Dostęp do konta

- Logowanie adresem e-mail i hasłem. Wylogowanie.
- Adres e-mail jest **niewrażliwy na wielkość liter**.
- Odpowiedź na nieudane logowanie nie może zdradzać, czy konto istnieje — ani treścią, ani
  czasem odpowiedzi.
- **Zaproszenie podopiecznego**: trener generuje jednorazowy odnośnik ważny **14 dni**.
  Zaproszenie niesie nazwę wyświetlaną, opcjonalny e-mail, opcjonalną kwotę miesięczną
  i opcjonalny formularz startowy. Przyjęcie zaproszenia zakłada konto i ustawia hasło.
- Zaproszenie może też **odnowić dostęp istniejącemu kontu** (np. po utracie hasła) — wtedy nie
  powstaje nowy podopieczny, tylko podmieniane są dane dostępowe istniejącego.
- Zaproszenie jest jednorazowe: po zużyciu i po wygaśnięciu odnośnik przestaje działać.
- Logowanie i przyjmowanie zaproszeń podlega ograniczeniu liczby prób (patrz *Limity*).

### Dwie bramki wejścia dla podopiecznego

Kolejność jest istotna i nie wolno jej odwrócić:

1. **Bramka płatnicza** — brak aktywnego dostępu kieruje na ekran aktywacji subskrypcji.
2. **Bramka formularza startowego** — niewypełniony formularz kieruje na ekran formularza.

Dopiero po przejściu obu podopieczny widzi aplikację. Obie bramki muszą działać także dla
żądań kierowanych wprost do zasobów, nie tylko przy wejściu na ekran — inaczej wystarczy
ominąć ekran, żeby ominąć regułę.

---

## B. Biblioteka ćwiczeń (trener)

- Ćwiczenie ma: **nazwę**, **jednostkę pomiaru**, opis, listę tagów, flagę zbierania oceny
  wysiłku, opcjonalne **wideo demonstracyjne**.
- **Jednostka pomiaru** to `REPS` (powtórzenia) albo `SEC` (czas). Determinuje, co zapisuje się
  w logu treningu i jak opisuje wynik.
- **Flaga zbierania oceny wysiłku** (RPE) steruje tym, czy przy logowaniu serii pyta się
  o trudność 1–10. Gdy wyłączona, ocena jest pusta — nie zero.
- **Kategorie** są definiowane per trener (dodaj / usuń). Tagi ćwiczenia mogą pochodzić
  **wyłącznie** ze znanych kategorii tego trenera; nieznane są odrzucane po cichu.
- **Archiwizacja** zamiast usuwania — ćwiczenie może występować w historycznych planach i logach.
  Archiwizację można cofnąć.
- **Archiwizacja jest zablokowana**, gdy ćwiczenie jest wariantem aktywnej umiejętności. Powód:
  w drzewie umiejętności wisiałby węzeł wskazujący na nieistniejące ćwiczenie. Trener musi je
  najpierw odpiąć od umiejętności.
- Lista: sortowanie (nazwa rosnąco/malejąco, najnowsze, najstarsze), filtr kategorii, filtr
  jednostki, szukajka po nazwie. Stronicowanie po **24**.

---

## C. Plany treningowe (trener)

Struktura czteropoziomowa:

```
Plan  →  Sesja  →  Blok  →  Pozycja
```

- **Plan** należy do pary trener↔podopieczny i ma **numer wersji**.
- **Sesja** to jedna jednostka treningowa (np. „Push A”), z nazwą i kolejnością.
- **Blok** ma rodzaj: `single` (pojedyncze ćwiczenie), `superset` (naprzemiennie), `dropset`
  (schodzące obciążenie). Rodzaj jest informacją dla podopiecznego o sposobie wykonania.
- **Pozycja** wskazuje ćwiczenie i niesie zakładane: liczbę serii, powtórzenia lub czas, przerwę,
  notatkę.

### Cykl życia planu

```
draft  ──publikacja──►  active  ──publikacja nowej wersji──►  archived
```

- **Najwyżej jeden plan `active` na parę** trener↔podopieczny.
- **Najwyżej jeden plan `draft` na parę.**
- Utworzenie draftu z planu aktywnego to **głęboka kopia** całego drzewa (sesje, bloki, pozycje).
  Draft powstaje leniwie — dopiero przy pierwszej próbie edycji planu aktywnego.
- Publikacja draftu: draft staje się aktywny, dotychczasowy aktywny trafia do `archived`
  z zachowaniem numeru wersji.
- **Plany zarchiwizowane są ukryte w interfejsie trenera.** Powstają automatycznie, nie niosą
  żadnej akcji, a zaśmiecają listę. Historia pozostaje dostępna z poziomu widoku podopiecznego.
- **Usuwanie**: draft bez powiązanych logów jest usuwany trwale (pełni też rolę „odrzuć
  zmiany”); plan z logami jest archiwizowany, nigdy usuwany.
- Lista: sortowanie (najnowsze, najstarsze, nazwa, ostatnio opublikowane), filtr statusu
  (wszystkie / aktywne / drafty), szukajka po **nazwie planu ALBO nazwie podopiecznego**.
  Stronicowanie po **20**.

---

## D. Logowanie treningu (podopieczny)

- Podopieczny wybiera sesję ze swojego **aktywnego** planu i zapisuje wykonanie **seria po serii**.
- Każda seria niesie: wynik (powtórzenia albo czas, zgodnie z jednostką ćwiczenia), opcjonalną
  **ocenę trudności 1–10**, opcjonalną notatkę, opcjonalne **nagranie wideo**.
- Ocena trudności jest zbierana tylko dla ćwiczeń z włączoną flagą; dla pozostałych zostaje pusta.
- Log jest zapisywany **atomowo** — albo cały trening, albo nic.
- **Nagrania są wysyłane osobno, przed zapisem treningu.** Formularz zapisu niesie wyłącznie
  identyfikatory nagrań. Powód: pojedynczy trening może nieść kilkanaście nagrań po kilkadziesiąt
  megabajtów; wysyłanie ich razem z zapisem czyniło żądanie kruchym i pamięciożernym.
- Wskutek powyższego **identyfikator nagrania przychodzi od klienta i musi być zweryfikowany**
  przy zapisie. Nagranie musi być: wgrane przez **tego samego** użytkownika, właściwego rodzaju,
  w granicach tenanta i **jeszcze niepodpięte** do żadnego treningu. Sam tenant nie wystarcza —
  podopieczni jednego trenera go współdzielą.
- Przy zapisie wykrywane są **nowe rekordy** (PR) i pokazywane podopiecznemu.
- Nagranie wgrane, ale nigdy niepodpięte do treningu, jest po czasie karencji sprzątane.
- Historia: sortowanie, filtr „z nagraniem / bez nagrania”, szukajka. Stronicowanie po **20**.
- Trener widzi historię i szczegóły treningów swoich podopiecznych (tylko do odczytu).

---

## E. Sylwetka

- Zdjęcie sylwetki niesie **ujęcie**: `front`, `side` albo `back`, oraz datę wykonania.
- Podopieczny dodaje i usuwa własne zdjęcia. Trener ogląda galerię podopiecznego.
- Galeria: sortowanie (najnowsze / najstarsze), stronicowanie po **60**.
- System zestawia **pary „przed / po”** — najstarsze i najnowsze zdjęcie w tym samym ujęciu.

---

## F. Rozwój — progresja ćwiczeń

Odpowiada na pytanie „czy robię postęp w tym ćwiczeniu”.

- Dla każdego ćwiczenia, w którym są logi: seria pomiarów w czasie, rekord życiowy, data rekordu,
  ostatni wynik.
- **Status** wyliczany z ostatnich sesji: postęp / stagnacja (plateau) / regres. Wyliczany
  z rekordu, nie ze średniej.
- **Zakresy czasowe** do wyboru; dla szerokich okresów dane są zwijane tygodniowo, ale **z
  zabezpieczeniem**: jeśli zwinięcie dałoby mniej niż dwa punkty, pokazywane są pojedyncze sesje.
  Powód: bez tego szerszy zakres potrafił pokazywać mniej niż węższy.
- Lista ćwiczeń: sortowanie, filtr tagów, miniwykres, status, oznaczenie rekordu.
- **Porównanie** dwóch lub więcej ćwiczeń na jednej osi, znormalizowane do „procent zmiany od
  początku okresu” — inaczej ćwiczenie mierzone w sekundach i w powtórzeniach są nieporównywalne.
- Ćwiczenia zarchiwizowane są wykluczone z progresji.

---

## G. Rozwój — umiejętności

Rdzeń wyróżniający produkt. Odpowiada na pytanie „jak daleko jestem do opanowania ruchu”.

- **Umiejętność** (np. „Front Lever”) definiuje trener: nazwa, opis, **stopień trudności**.
- **Stopnie trudności**: `basic`, `intermediate`, `advanced`, `expert`. Porządkują drzewo
  w warstwy — od fundamentu do szczytu.
- **Warianty** to uporządkowana drabina ćwiczeń z biblioteki, od najłatwiejszego do najtrudniejszego
  (np. Tuck → Advanced Tuck → Straddle → Full).
- **Ćwiczenie może być wariantem najwyżej jednej umiejętności.**
- Usunięcie wariantu przepakowuje kolejność pozostałych — bez dziur.
- **Prerekwizyty** tworzą graf skierowany między umiejętnościami („żeby zacząć X, opanuj Y”).
  Dwie twarde reguły:
  - **graf musi pozostać acykliczny**,
  - **prerekwizyt nie może być trudniejszy niż umiejętność, której dotyczy** (nie można wymagać
    umiejętności eksperckiej jako wstępu do podstawowej).
- Zmiana stopnia trudności istniejącej umiejętności **nie jest blokowana**, nawet jeśli tworzy
  konflikt z istniejącymi prerekwizytami — konflikt jest raportowany trenerowi jako ostrzeżenie.
  Powód: blokada uniemożliwiałaby porządkowanie drzewa.

### Postęp podopiecznego

- Trener ustawia **poziom startowy** podopiecznego w umiejętności, a potem rejestruje **awanse**
  i **cofnięcia**.
- **Historia jest nienaruszalna.** Bieżący poziom nie jest przechowywany — jest wyliczany
  z najświeższego zdarzenia. Cofnięcie awansu jest **nowym zdarzeniem**, nie usunięciem
  poprzedniego. Dzięki temu można odpowiedzieć na pytanie „jaki był poziom w dniu X” i „jak do
  tego doszedł”.
- Nie można zarejestrować awansu bez ustawionego poziomu startowego ani awansu na ten sam poziom.
- System **sugeruje** awans na podstawie sygnałów (liczba sesji na bieżącym wariancie, oceny
  wysiłku). Sugestia jest miękka — decyduje trener.
- Podopieczny widzi drzewo i własny postęp, ale **niczego nie zmienia**.

---

## H. Statystyki i podsumowania

**Pulpit podopiecznego**: seria nieprzerwanych tygodni, łączna liczba sesji, „ten tydzień”,
mapa aktywności, bilans wysiłku z ocen RPE, aktywny plan, ostatnie treningi, dostępne
podsumowania miesięczne.

**Pulpit trenera**: lista klientów, ostatnie treningi wszystkich podopiecznych, liczniki planów
aktywnych i szkiców, liczba sesji z ostatnich siedmiu dni.

**Widok klienta u trenera**: wskaźniki kondycji współpracy, mapa aktywności, ćwiczenia w stagnacji,
wykorzystanie sesji z planu, pokrycie treningów nagraniami, pokrycie zdjęciami sylwetki, rozkład
tagów.

**Podsumowanie miesięczne („Wrapped”)**: pełnoekranowe podsumowanie miesiąca, przypisany archetyp,
porównanie z miesiącem poprzednim, lista miesięcy z danymi. Dostępne tylko dla miesięcy, w których
są dane.

---

## I. Konsultacje

- **Harmonogram** definiuje cykl spotkań dla pary: częstotliwość `weekly` / `biweekly` / `monthly`,
  dzień, godzina, czas trwania, opcjonalny odnośnik do spotkania.
  **Najwyżej jeden aktywny harmonogram na parę.**
- Z harmonogramu **materializowane są terminy** w horyzoncie czasowym. Materializacja jest
  idempotentna — ponowne wywołanie nie tworzy duplikatów.
- Zmiana harmonogramu odtwarza przyszłe terminy jeszcze niepotwierdzone i anuluje stare.
- Można też utworzyć **termin poza serią** (ad-hoc), od razu zaplanowany albo od razu
  udokumentowany jako odbyty.

### Statusy terminu

```
planned ──► confirmed ──► documented
   │  │
   │  └──► change_requested ──► (trener przekłada) ──► planned
   └──► cancelled            (odrzucony przez podopiecznego lub odwołany przez trenera)
```

- **Podopieczny** może: potwierdzić, poprosić o zmianę (z notatką), odrzucić.
- **Trener** może: przełożyć, odwołać, udokumentować, usunąć.
- **Dokumentacja** terminu to podsumowanie plus lista **punktów akcji** ze statusem `open` /
  `resolved`. Status punktu może zmieniać zarówno trener, jak i podopieczny.
- Ten sam status musi wyglądać identycznie w panelu trenera i podopiecznego — prezentacja statusu
  jest wspólną regułą, nie decyzją widoku. Termin `planned`, który już minął, prezentuje się
  inaczej niż przyszły.
- Trener ma **zbiorczy kalendarz miesięczny** ze wszystkimi terminami wszystkich podopiecznych
  (bez odwołanych) — do wyszukiwania wolnego okienka.
- **Synchronizacja z zewnętrznym kalendarzem** jest opcjonalna, jednokierunkowa (na zewnątrz)
  i „best effort”: jej awaria **nigdy** nie może przerwać operacji domenowej. System nie czyta
  zmian z zewnątrz.

---

## J. Płatności

- Trener łączy **konto rozliczeniowe** (proces onboardingu u dostawcy płatności) — dopóki tego
  nie zrobi, nie może pobierać opłat.
- Trener ustala **kwotę miesięczną per para**. Zmiana kwoty przy aktywnej subskrypcji wchodzi
  w życie **od następnego odnowienia**, o czym trener musi być poinformowany.
- Kwota może być przekazana już w zaproszeniu — wtedy podopieczny widzi ją przy aktywacji.
- **Statusy subskrypcji**: `none`, `incomplete`, `active`, `past_due`, `canceled`, `unpaid`, `paused`.
- Operacje podopiecznego: rozpocznij subskrypcję, przejdź do portalu płatności (zmiana karty),
  wstrzymaj, wznów.
- Operacje trenera: ustal kwotę, wstrzymaj, wznów, zakończ subskrypcję podopiecznego.
- **Historia płatności** (faktury z kwotą, datą i odnośnikiem) widoczna dla obu stron.
- **Bramka dostępu**: brak aktywnego dostępu odcina podopiecznego od całej aplikacji poza ekranem
  aktywacji. Wyjątek: podsumowania miesięczne pozostają dostępne (świadoma decyzja — to materiał
  marketingowy, nie funkcja).
- **Zdarzenia od dostawcy płatności** (webhook) aktualizują stan subskrypcji i księgę faktur.
  Muszą być **idempotentne** — ten sam identyfikator zdarzenia nie może zadziałać dwa razy —
  i muszą sygnalizować dostawcy potrzebę ponowienia, gdy przetwarzanie się nie powiodło.
- Danych kart nie przechowujemy w żadnej postaci.

---

## K. Formularz startowy

- Trener może dołączyć do zaproszenia **formularz startowy**: od 1 do **12** ćwiczeń z własnej
  biblioteki plus opcjonalna notatka.
- **Zaproszenie i formularz powstają razem albo wcale.** Nie może istnieć odnośnik do zaproszenia,
  któremu formularz nie doszedł.
- Formularz przypina się do podopiecznego w chwili przyjęcia zaproszenia.
- **Najwyżej jeden oczekujący formularz na podopiecznego.**
- Podopieczny podaje dla każdej pozycji wynik (liczba) i opcjonalny komentarz, plus opcjonalną
  notatkę ogólną. **Musi wypełnić komplet pozycji.**
- Puste pole wyniku to brak odpowiedzi, **nie zero**.
- **Jednostka pomiaru jest zamrażana** w chwili tworzenia formularza — późniejsza zmiana jednostki
  ćwiczenia w bibliotece nie zmienia znaczenia już zapisanego wyniku.
- Powtórne wysłanie wypełnionego formularza musi zostać odrzucone.
- Trener ogląda wyniki: notatkę własną, pozycje z wynikami i komentarzami, notatkę podopiecznego,
  datę wypełnienia.

---

## L. Zgłoszenia („Pomysły”)

- Podopieczny zgłasza: **rodzaj** (`idea` / `bug` / `other`), tytuł (3–120 znaków), opis
  (10–2000 znaków).
- **Statusy**: `new`, `considering`, `planned`, `done`, `rejected`. Ustawia je trener.
- Trener może dołączyć odpowiedź widoczną dla podopiecznego. Sama zmiana statusu, bez treści
  odpowiedzi, **nie** stempluje daty odpowiedzi.
- **Autor może usunąć zgłoszenie tylko dopóki ma status `new`** — po reakcji trenera przycisk
  znika. Reguła musi być egzekwowana na poziomie zapisu, nie tylko interfejsu: trener
  odpowiadający w tej samej chwili nie może przegrać wyścigu i stracić odpowiedzi.
- Widoczność jest prywatna: zgłoszenie widzi autor i jego trener. Nikt więcej.
- Trener ma skrzynkę ze wszystkimi zgłoszeniami: szukajka po tytule, treści i nazwie autora, filtry
  statusu i rodzaju, stronicowanie po **20**, oraz licznik **nowych** (nie wszystkich) jako sygnał
  „przyszło coś świeżego”.

---

## M. Pliki

Trzy rodzaje, każdy o innej roli i innym limicie:

| Rodzaj | Do czego | Kto wgrywa |
|---|---|---|
| `exercise_demo` | Wideo demonstracyjne ćwiczenia | Trener |
| `set_video` | Nagranie pojedynczej serii treningu | Podopieczny |
| `body_photo` | Zdjęcie sylwetki | Podopieczny |

- **Typ pliku jest weryfikowany po zawartości**, nie po nazwie ani deklarowanym typie.
- Dostęp do pliku wyłącznie przez **odnośnik ograniczony czasowo i związany z tenantem**. Nigdy
  po samym identyfikatorze, nigdy po ścieżce.
- Adres pliku powinien być **stabilny w oknie czasowym**, żeby pamięć podręczna przeglądarki
  w ogóle mogła zadziałać — inaczej każde odświeżenie pobiera nagranie od nowa.
- Rodzaj pliku i właściciel są ustalane po stronie serwera, **nigdy z danych przysłanych przez
  klienta**.

---

## Limity

| Co | Wartość | Uwaga |
|---|---|---|
| Ważność zaproszenia | 14 dni | |
| Próby logowania | 10 / 15 min | Na podmiot; dla żądań uwierzytelnionych kluczem jest użytkownik, nie adres IP — podopieczni potrafią dzielić łącze, a jeden użytkownik przeskakuje między sieciami |
| Próby przyjęcia zaproszenia | 10 / 15 min | |
| Wysyłki plików | 100 / 15 min | |
| Rozmiar wideo serii | ~30 MB | Osobny, niższy limit niż ogólny |
| Rozmiar pozostałych plików | ~250 MB | Strojony konfiguracją |
| Pozycji w formularzu startowym | 1–12 | Limit **górny** też jest istotny — bez niego jedno żądanie z tysiącami powtórzeń rozkręcało pętlę zapisów |
| Wynik pozycji formularza | 0–10000 | |
| Ocena trudności serii | 1–10 lub brak | |
| Kwota miesięczna | od 2 zł do 100 000 zł | Trzymana w groszach, całkowita |
| Stronicowanie | 20 (logi, plany, zgłoszenia) · 24 (ćwiczenia) · 30 (podopieczni) · 60 (zdjęcia) | |

---

## Poza zakresem

- Rejestracja trenerów w aplikacji.
- Warstwa marki / organizacji nad trenerem. Model tenancy pozostaje `trener → podopieczni`.
- Praca offline i synchronizacja po odzyskaniu łącza.
- Wielojęzyczność — produkt jest dziś w całości polskojęzyczny; angielskie pozostają wyłącznie
  nazwy ćwiczeń.
- Komunikator, powiadomienia push, kanał wiadomości między trenerem a podopiecznym.
- Import/eksport danych, integracje z urządzeniami pomiarowymi.
