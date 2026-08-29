# 02 — Domena, konteksty i zasoby

Podział domeny, granice kontekstów, słownik i zasoby domenowe wraz z niezmiennikami.
Bez technologii i bez wskazówek implementacyjnych.

---

## 1. Subdomeny

Podział na trzy koszyki mówi, gdzie warto inwestować w bogaty model, a gdzie byłaby to strata.

| Koszyk | Znaczenie | Które obszary |
|---|---|---|
| **Core** | Przewaga konkurencyjna. Złożone i zmienne reguły, warto modelować starannie. | Umiejętności · Plany treningowe · Dziennik treningowy |
| **Supporting** | Specyficzne dla produktu, ale proste. Wystarczy prosty model. | Biblioteka ćwiczeń · Postęp i analityka · Konsultacje · Sylwetka · Rejestracja i onboarding · Zgłoszenia |
| **Generic** | Rozwiązany problem. Nie wymyślać własnego modelu. | Tożsamość i dostęp · Płatności · Pliki i media · Integracja z kalendarzem zewnętrznym |

**Umiejętności są jądrem produktu.** To jedyny obszar, który odróżnia ten system od dowolnej
aplikacji do zapisywania treningów, i jedyny, w którym reguły są naprawdę nietrywialne.

---

## 2. Konteksty

Dwanaście kontekstów. Granica biegnie tam, gdzie zmienia się znaczenie pojęć albo profil
zmienności.

| # | Kontekst | Koszyk | Odpowiada za |
|---|---|---|---|
| 1 | **Tożsamość i dostęp** | generic | Konta, uwierzytelnianie, sesje |
| 2 | **Biblioteka ćwiczeń** | supporting | Katalog ćwiczeń trenera i kategorie |
| 3 | **Plany treningowe** | core | Wersjonowane plany i ich publikacja |
| 4 | **Dziennik treningowy** | core | Zapis wykonanych treningów |
| 5 | **Umiejętności** | core | Definicje umiejętności, graf prerekwizytów, postęp podopiecznych |
| 6 | **Postęp i analityka** | supporting | Wszystkie agregacje i podsumowania. **Nie posiada własnych danych** |
| 7 | **Konsultacje** | supporting | Harmonogramy i terminy spotkań |
| 8 | **Płatności** | generic | Subskrypcje, faktury, bramka dostępu |
| 9 | **Pliki i media** | generic | Wgrywanie, walidacja i udostępnianie plików |
| 10 | **Rejestracja i onboarding** | supporting | Zaproszenia i formularz startowy |
| 11 | **Zgłoszenia** | supporting | Pomysły i błędy od podopiecznych |
| 12 | **Kalendarz zewnętrzny** | generic | Warstwa ochronna wokół integracji z kalendarzem |

**Dlaczego zaproszenia leżą przy formularzu startowym, a nie przy tożsamości.** Zaproszenie
i formularz mają jeden cykl życia: powstają razem, przypinają się razem, razem stanowią bramkę
wejścia. Logowanie i sesje mają zupełnie inny profil zmienności. Dzięki temu podziałowi obie
operacje wielotabelowe w systemie mieszczą się **wewnątrz jednego kontekstu**.

---

## 3. Mapa relacji

| Od | Do | Charakter zależności |
|---|---|---|
| Wszystkie | 1 Tożsamość | Zgodność — każdy kontekst przyjmuje tożsamość i przynależność do tenanta jako dane |
| 3 Plany | 2 Biblioteka | Dostawca–odbiorca: pozycja planu wskazuje ćwiczenie |
| 4 Dziennik | 3 Plany | Dostawca–odbiorca: log powstaje z sesji planu |
| 4 Dziennik | 9 Pliki | Dostawca–odbiorca: log przejmuje nagrania serii |
| 5 Umiejętności | 2 Biblioteka | Dostawca–odbiorca: wariant umiejętności **jest** ćwiczeniem |
| 2 Biblioteka | 5 Umiejętności | Zgodność w drugą stronę: biblioteka pyta, czy ćwiczenie wolno zarchiwizować |
| 6 Analityka | 3, 4, 5 | Tylko odczyt |
| 7 Konsultacje | 12 Kalendarz | **Warstwa ochronna** — awaria integracji nie może przerwać operacji domenowej |
| 10 Onboarding | 2 Biblioteka | Dostawca–odbiorca: formularz zamraża jednostkę ćwiczenia w chwili utworzenia |
| 10 Onboarding | 8 Płatności | Best effort: kwota z zaproszenia zasila subskrypcję |
| 8 Płatności | 1, 10 | **Bramka dostępu** — decyduje, czy podopieczny w ogóle widzi aplikację |
| Dostawca płatności | 8 Płatności | Publikowany kontrakt zewnętrzny: zdarzenia przychodzące, idempotentne |

### Dwie operacje przecinające tabele

Obie muszą być **atomowe** i obie mieszczą się wewnątrz kontekstu 10:

1. **Utworzenie zaproszenia z formularzem startowym** — albo powstaje jedno i drugie, albo nic.
2. **Przyjęcie zaproszenia** — założenie lub odnowienie konta, zużycie zaproszenia i przypięcie
   formularza do podopiecznego.

Identyfikator zaproszenia przekazywany do tworzenia formularza musi pochodzić **wyłącznie
z rekordu utworzonego w tej samej operacji** — nigdy z danych przysłanych przez klienta.

---

## 4. Słownik i pułapki językowe

Najważniejsza sekcja tego dokumentu. Poniższe dwuznaczności istnieją w obecnym systemie
i **nie mogą przeciec do kontraktu API** — bo wtedy odziedziczy je także aplikacja mobilna.

### „Sesja” znaczy trzy różne rzeczy

| Znaczenie | Kontekst | Sugerowana nazwa w kontrakcie |
|---|---|---|
| Sesja logowania użytkownika | Tożsamość | `AuthSession` |
| Jednostka treningowa w planie („Push A”) | Plany | `PlannedSession` |
| Odbyty trening — potocznie „sesja” | Dziennik | `WorkoutLog` |

To jest granica kontekstów wykrzyczana wprost. Trzy różne byty, jedno słowo.

### Pozostałe

| Pojęcie | Pułapka |
|---|---|
| **Konsultacja** | Raz oznacza **regułę cyklu**, raz **pojedynczy termin**. Kontrakt musi rozróżniać `Schedule` i `Occurrence`. |
| **Podopieczny** | W tożsamości to konto, w treningu odbiorca planu, w płatnościach **płatnik**. Trzy modele tej samej osoby. |
| **Rozwój** | Pojęcie interfejsu, które scala dwa modele: progresję ćwiczeń i umiejętności. Domena trzyma je osobno i tak ma zostać — scalanie jest zadaniem warstwy odczytu. |
| **Wariant** | Ćwiczenie pełniące rolę szczebla w drabinie umiejętności. To ta sama encja co ćwiczenie z biblioteki, w innej roli. |
| **Blok** | Grupa ćwiczeń w sesji planu, nie „blok treningowy” w sensie okresu. |
| **Postęp / awans** | „Postęp” to progresja liczbowa w ćwiczeniu; „awans” to przejście na kolejny wariant umiejętności. Różne rzeczy. |
| **Ocena trudności (RPE)** | Wartość 1–10 **albo jej brak**. Brak to nie zero. |

---

## 5. Zasoby domenowe

Dla każdego kontekstu: byty, niezmienniki (reguły, które muszą być prawdziwe zawsze) i operacje.

### Kontekst 1 — Tożsamość i dostęp

**Byty:** Użytkownik (rola `trainer` albo `trainee`), Sesja logowania.

**Niezmienniki**
- Adres e-mail jest unikalny, niewrażliwy na wielkość liter.
- Podopieczny ma **dokładnie jednego** trenera. Trener nie ma trenera.
- Konto zarchiwizowane nie może się zalogować.

**Operacje:** zaloguj · wyloguj · odczytaj bieżącego użytkownika

---

### Kontekst 2 — Biblioteka ćwiczeń

**Byty:** Ćwiczenie, Kategoria.

**Niezmienniki**
- Ćwiczenie należy do dokładnie jednego trenera.
- Jednostka pomiaru to `REPS` albo `SEC` i **determinuje znaczenie wyniku** we wszystkich logach.
- Tagi ćwiczenia są podzbiorem kategorii jego trenera.
- Ćwiczenie będące wariantem **aktywnej** umiejętności nie może zostać zarchiwizowane.
- Nazwa kategorii jest unikalna w obrębie trenera.

**Operacje:** utwórz · zaktualizuj · zarchiwizuj · przywróć · dodaj kategorię · usuń kategorię

---

### Kontekst 3 — Plany treningowe

**Byt spójny:** `Plan` wraz z całym drzewem (sesje → bloki → pozycje). Cztery poziomy zmieniają
się wyłącznie razem i razem stanowią jedną całość transakcyjną.

**Stany:** `draft` → `active` → `archived`

**Niezmienniki**
- Najwyżej jeden plan `active` na parę trener↔podopieczny.
- Najwyżej jeden plan `draft` na parę.
- Publikacja jest atomowa: draft staje się aktywny, poprzedni aktywny trafia do archiwum.
- Numer wersji rośnie monotonicznie w obrębie pary.
- Draft utworzony z aktywnego jest jego **pełną, głęboką kopią**.
- Pozycja planu wskazuje ćwiczenie **tego samego trenera**.
- Plan z powiązanymi logami nie może zostać usunięty — tylko zarchiwizowany.

**Operacje:** utwórz pusty · utwórz szkic z aktywnego · zapisz szkic · opublikuj · usuń

---

### Kontekst 4 — Dziennik treningowy

**Byt spójny:** `WorkoutLog` wraz z zapisami ćwiczeń i serii. Zapisywany i odczytywany w całości.

**Niezmienniki**
- Log wskazuje sesję z planu, który był aktywny dla tego podopiecznego.
- Wynik serii jest interpretowany zgodnie z jednostką ćwiczenia.
- Ocena trudności mieści się w 1–10 **albo jest pusta**; pusta jest wymagana dla ćwiczeń
  z wyłączoną flagą zbierania oceny.
- Nagranie podpięte do serii musi być: wgrane przez **tego samego użytkownika**, rodzaju
  „nagranie serii”, w granicach tenanta i **niepodpięte** nigdzie indziej.
- Zapis jest atomowy — cały trening albo nic.
- Log jest **niezmiennym zapisem faktu**. Trening się wydarzył i nie podlega edycji.

**Operacje:** zapisz trening · odczytaj log · wykryj nowe rekordy

---

### Kontekst 5 — Umiejętności

Kontekst ma **dwie części o różnych wymaganiach**.

#### 5a. Definicje (stan bieżący)

**Byty:** Umiejętność, Wariant, Krawędź prerekwizytu.

**Niezmienniki**
- Umiejętność ma stopień trudności: `basic` < `intermediate` < `advanced` < `expert`.
- **Ćwiczenie jest wariantem najwyżej jednej umiejętności.**
- Kolejność wariantów jest ciągła — bez dziur po usunięciu.
- Wariantem nie może zostać ćwiczenie zarchiwizowane.
- **Graf prerekwizytów jest acykliczny.**
- **Prerekwizyt nie może mieć wyższego stopnia trudności** niż umiejętność, której dotyczy.
- Zmiana stopnia trudności **nie jest blokowana** przez istniejące krawędzie; powstały konflikt
  jest raportowany, nie odrzucany.
- Archiwizacja umiejętności czyści jej krawędzie prerekwizytów.

**Operacje:** utwórz · zaktualizuj · zarchiwizuj · dodaj/usuń/przestaw wariant · dodaj/usuń
prerekwizyt · wypisz konflikty stopni

#### 5b. Postęp podopiecznego (strumień zdarzeń)

**Byt:** strumień zdarzeń awansu, osobny dla każdej pary (podopieczny × umiejętność).

**Niezmienniki**
- **Strumień jest tylko dopisywany.** Zdarzenia nie są modyfikowane ani usuwane.
- Bieżący poziom **nie jest przechowywany** — jest wyliczany z najświeższego zdarzenia.
- Pierwsze zdarzenie to poziom startowy (bez wariantu źródłowego).
- Cofnięcie awansu to **zdarzenie kompensujące**, nie usunięcie poprzedniego.
- Nie można awansować bez ustawionego poziomu startowego.
- Nie można awansować na poziom, na którym się już jest.
- Wariant, do którego prowadzi zdarzenie, nie może zostać usunięty z umiejętności.

**Dlaczego tak:** produkt wymaga odpowiedzi na pytania „jaki był poziom w dniu X” i „jak do tego
doszedł”. Przy przechowywaniu wyłącznie stanu bieżącego te pytania są bez odpowiedzi.

**Operacje:** ustaw poziom startowy · zarejestruj awans · zarejestruj cofnięcie · odczytaj
bieżący poziom i historię · zaproponuj awans (miękka sugestia)

---

### Kontekst 6 — Postęp i analityka

**Nie posiada własnych danych.** Wyłącznie odczytuje konteksty 3, 4 i 5 i przekształca je
w podsumowania. Zero operacji zapisu.

Rodziny odczytów: wskaźniki pulpitu · mapa aktywności · bilans wysiłku · serie nieprzerwanych
tygodni · progresja pojedynczego ćwiczenia · lista ćwiczeń ze statusem · porównanie ćwiczeń ·
wykrywanie stagnacji · wykorzystanie planu · pokrycie nagraniami i zdjęciami · rozkład tagów ·
podsumowanie miesięczne · pary zdjęć „przed / po”.

**Reguły odczytowe, które są decyzją produktową, nie techniczną**
- Status progresji liczy się z **rekordu**, nie ze średniej.
- Dane zwijane tygodniowo, ale przy mniej niż dwóch punktach następuje powrót do pojedynczych
  sesji — inaczej szerszy zakres czasowy pokazuje mniej niż węższy.
- Porównanie ćwiczeń jest normalizowane do procentu zmiany od początku okresu, bo jednostki
  są nieporównywalne.
- Ćwiczenia zarchiwizowane są wykluczone z progresji.
- Sesje bez ocen wysiłku są pomijane w bilansie wysiłku, nie liczone jako zero.

---

### Kontekst 7 — Konsultacje

**Dwa byty spójne:** `Schedule` (reguła cyklu) i `Occurrence` (pojedynczy termin wraz z punktami
akcji).

**Stany terminu:** `planned` · `confirmed` · `change_requested` · `cancelled` · `documented`

**Dozwolone przejścia**

| Z | Do | Kto |
|---|---|---|
| `planned` | `confirmed`, `change_requested`, `cancelled` | Podopieczny |
| `planned`, `confirmed`, `change_requested` | `planned` (nowy termin) | Trener — przełożenie |
| dowolny poza `documented` | `cancelled` | Trener — odwołanie |
| `planned`, `confirmed` | `documented` | Trener — udokumentowanie |

**Niezmienniki**
- Najwyżej jeden **aktywny** harmonogram na parę.
- Materializacja terminów jest **idempotentna** — para (harmonogram, moment) występuje raz.
- Termin odwołany nie wraca do obiegu.
- Podsumowanie i punkty akcji istnieją tylko dla terminu udokumentowanego.
- Częstotliwość: `weekly` i `biweekly` kotwiczą się dniem tygodnia; `monthly` dniem miesiąca
  **nie większym niż 28** — inaczej termin znika w lutym.
- Prezentacja statusu jest **wspólna dla obu ról** — ten sam termin nie może wyglądać inaczej
  u trenera i u podopiecznego. Termin `planned`, który już minął, prezentuje się inaczej niż
  przyszły.

**Operacje:** zapisz harmonogram · wyłącz harmonogram · zmaterializuj terminy · utwórz termin
poza serią · odpowiedz na termin · przełóż · odwołaj · udokumentuj · zmień status punktu akcji ·
usuń

---

### Kontekst 8 — Płatności

**Byty:** Połączenie konta rozliczeniowego trenera, Subskrypcja (para trener↔podopieczny),
Faktura, Rejestr przetworzonych zdarzeń.

**Stany subskrypcji:** `none` · `incomplete` · `active` · `past_due` · `canceled` · `unpaid` ·
`paused`

**Niezmienniki**
- Najwyżej jedna subskrypcja na parę.
- Kwota jest liczbą całkowitą groszy, w zakresie 200 – 10 000 000.
- Zmiana kwoty przy aktywnej subskrypcji obowiązuje **od następnego odnowienia**.
- Trener bez połączonego konta rozliczeniowego nie może pobierać opłat.
- **Zdarzenia zewnętrzne są idempotentne** — ten sam identyfikator zdarzenia przetwarzany jest
  najwyżej raz; nieudane przetworzenie musi zwolnić identyfikator, żeby ponowienie miało co robić.
- Faktura jest zapisywana z zachowaniem idempotencji po identyfikatorze faktury.
- Stan prawdziwy jest u dostawcy płatności; nasza kopia jest lustrem, nie źródłem prawdy.
- **Bramka dostępu** jest jedną, wspólną regułą — nie wolno jej powielać w wielu miejscach,
  bo rozjazd kopii daje pętlę przekierowań albo dziurę w dostępie.

**Operacje:** połącz konto rozliczeniowe · ustal kwotę · rozpocznij subskrypcję · otwórz portal
płatności · wstrzymaj · wznów · zakończ · przyjmij zdarzenie zewnętrzne · sprawdź dostęp

---

### Kontekst 9 — Pliki i media

**Byt:** Plik (rodzaj, właściciel, wgrywający, typ zawartości, rozmiar).

**Niezmienniki**
- Rodzaj i właściciel ustala serwer, **nigdy klient**.
- Typ jest weryfikowany po **zawartości** pliku, nie po nazwie ani deklaracji.
- Rozmiar mieści się w limicie **właściwym dla rodzaju**.
- Dostęp wyłącznie przez odnośnik ograniczony czasowo i związany z tenantem.
- Plik rodzaju „nagranie serii”, niepodpięty do żadnego treningu po okresie karencji, jest
  usuwany wraz z zawartością.
- Usunięcie zawartości pliku następuje **po** potwierdzeniu operacji na danych, nigdy przed —
  inaczej wycofanie operacji zostawia rekord wskazujący na nieistniejącą zawartość.

**Operacje:** wgraj · potwierdź · pobierz metadane · usuń · posprzątaj sieroty

---

### Kontekst 10 — Rejestracja i onboarding

**Byty:** Zaproszenie, Formularz startowy wraz z pozycjami.

**Niezmienniki**
- Zaproszenie jest jednorazowe i wygasa po 14 dniach.
- Zaproszenie i formularz powstają **razem albo wcale**.
- Najwyżej jeden **oczekujący** formularz na podopiecznego.
- Formularz ma od 1 do 12 **unikalnych** ćwiczeń, wszystkie należące do trenera i **aktywne**.
- Jednostka pomiaru pozycji jest **zamrożona** w chwili utworzenia formularza.
- Wypełnienie wymaga **kompletu** odpowiedzi; brak odpowiedzi to nie zero.
- Powtórne wysłanie wypełnionego formularza jest odrzucane **na poziomie zapisu**, nie sprawdzenia
  w kodzie — inaczej dwa równoległe żądania przechodzą oba.

**Operacje:** utwórz zaproszenie (opcjonalnie z formularzem) · przyjmij zaproszenie · sprawdź
oczekujący formularz · wyślij odpowiedzi · odczytaj wyniki

---

### Kontekst 11 — Zgłoszenia

**Byt:** Zgłoszenie.

**Stany:** `new` · `considering` · `planned` · `done` · `rejected`
**Rodzaje:** `idea` · `bug` · `other`

**Niezmienniki**
- Zgłoszenie widzi wyłącznie autor i jego trener.
- Autor usuwa własne zgłoszenie **tylko w stanie `new`**; warunek musi być częścią operacji
  zapisu, nie sprawdzeniem po odczycie.
- Data odpowiedzi jest stemplowana **wyłącznie** przy niepustej treści odpowiedzi.
- Trener ustawia stan zgłoszeń **własnych** podopiecznych.

**Operacje:** utwórz · usuń (autor, stan `new`) · odpowiedz i ustaw stan (trener) · wypisz ·
policz nowe

---

### Kontekst 12 — Kalendarz zewnętrzny

**Byt:** Połączenie kalendarza trenera.

**Niezmienniki**
- Integracja jest **opcjonalna** — system musi działać w pełni bez niej.
- Synchronizacja jest **jednokierunkowa, na zewnątrz**. Zmiany dokonane w kalendarzu zewnętrznym
  nie wracają.
- Awaria integracji **nigdy** nie przerywa operacji domenowej ani nie zwraca błędu użytkownikowi
  wykonującemu operację w konsultacjach.
- Poświadczenia dostępu są przechowywane w postaci zaszyfrowanej.
- Rozłączenie usuwa poświadczenia i, w miarę możliwości, unieważnia je u dostawcy.

**Operacje:** połącz · rozłącz · sprawdź stan · wypchnij termin · zaktualizuj termin · usuń
termin · uzupełnij zaległości

---

## 6. Zdarzenia domenowe

Fakty, które zaszły i mogą zainteresować inne konteksty. Lista funkcjonalna — sposób ich
przekazywania jest decyzją implementacyjną.

| Zdarzenie | Powstaje w | Kto jest zainteresowany |
|---|---|---|
| `PodopiecznyDolaczyl` | Onboarding | Płatności (kwota z zaproszenia), Analityka |
| `PlanOpublikowany` | Plany | Dziennik (zmiana dostępnych sesji), Analityka |
| `TreningZapisany` | Dziennik | Analityka (nieaktualne agregaty), Umiejętności (sygnały do sugestii awansu) |
| `RekordPobity` | Dziennik | Powiadomienie podopiecznego |
| `AwansZarejestrowany` | Umiejętności | Analityka |
| `TerminZaplanowany` / `TerminPrzelozony` / `TerminOdwolany` | Konsultacje | Kalendarz zewnętrzny |
| `TerminUdokumentowany` | Konsultacje | Analityka |
| `SubskrypcjaZmienilaStan` | Płatności | Bramka dostępu |
| `FakturaZarejestrowana` | Płatności | Historia płatności |
| `PlikPrzejety` | Dziennik | Pliki (koniec okresu sieroctwa) |

---

## 7. Świadome uproszczenia

Zapisane, żeby nie zostały „poprawione” przez pomyłkę:

- **Siedem z dwunastu kontekstów nie potrzebuje bogatego modelu.** Biblioteka ćwiczeń i zgłoszenia
  to zwykłe operacje na danych. Płatności, pliki, tożsamość i onboarding to procedury. Modelowanie
  ich jako bogatych bytów byłoby kosztem bez pokrycia.
- **Tylko postęp w umiejętnościach wymaga strumienia zdarzeń.** Reszta systemu trzyma stan bieżący.
  Dziennik treningowy jest już niezmiennym zapisem faktów i nie potrzebuje dodatkowej maszynerii.
- **Analityka nie posiada danych.** Jeśli kiedykolwiek zacznie je posiadać, będzie to decyzja
  wydajnościowa wymagająca uzasadnienia, a nie naturalny rozwój.
- **Integracja z kalendarzem jest jednokierunkowa i zawodna z założenia.** Próba uczynienia jej
  niezawodną albo dwukierunkową to zmiana zakresu produktu.
