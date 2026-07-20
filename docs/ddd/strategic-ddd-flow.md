# Analiza strategiczna Domain-Driven Design — pełne flow

> **Czym jest ten dokument.** Generyczna, niezależna od konkretnego projektu
> metodyka przeprowadzania **analizy strategicznej DDD** — od zrozumienia
> biznesu, przez dekompozycję domeny i destylację rdzenia, po mapę kontekstów i
> ustawienie zespołów. To *playbook procesu*, nie opis konkretnego systemu.
> Warstwa **taktyczna** (agregaty, encje, value objects, repozytoria) jest tu
> tylko naszkicowana jako punkt styku — patrz sekcja [12](#12-pomost-do-ddd-taktycznego).
>
> **Prowenancja.** Szkielet flow opiera się na **DDD Starter Modelling Process**
> zespołu *DDD Crew*, spiętym z kanonem: Eric Evans (*DDD*, 2003 / *DDD
> Reference*, 2015), Martin Fowler (bliki), Vaughn Vernon (*DDD Distilled*),
> Alberto Brandolini (*EventStorming*), Nick Tune & Scott Millett (*Designing
> Autonomous Teams and Services*), Team Topologies. Kluczowe twierdzenia były
> weryfikowane wieloźródłowo — pełna lista w sekcji [Źródła](#źródła).
> Artefakty DDD Crew to *żywe* dokumenty (kanwy mają wersje v2/v3), więc
> dokładne etykiety pól mogą z czasem driftować — traktuj je jako wzorzec, nie
> literę.

---

## Spis treści

1. [Po co strategiczne DDD i dlaczego najpierw](#1-po-co-strategiczne-ddd-i-dlaczego-najpierw)
2. [Fundamenty pojęciowe (słownik)](#2-fundamenty-pojęciowe-słownik)
3. [Charakter procesu: iteracyjny, nie liniowy](#3-charakter-procesu-iteracyjny-nie-liniowy)
4. [Flow w pigułce (mapa 8 kroków)](#4-flow-w-pigułce-mapa-8-kroków)
5. [Krok 1 — Understand (zrozum biznes)](#5-krok-1--understand-zrozum-biznes)
6. [Krok 2 — Discover (odkryj domenę)](#6-krok-2--discover-odkryj-domenę)
7. [Krok 3 — Decompose (podziel na poddomeny)](#7-krok-3--decompose-podziel-na-poddomeny)
8. [Krok 4 — Strategize (zidentyfikuj rdzeń / destylacja)](#8-krok-4--strategize-zidentyfikuj-rdzeń--destylacja)
9. [Krok 5 — Connect (połącz konteksty — context mapping)](#9-krok-5--connect-połącz-konteksty--context-mapping)
10. [Krok 6 — Organise (ustaw zespoły)](#10-krok-6--organise-ustaw-zespoły)
11. [Krok 7 — Define (zdefiniuj pojedynczy kontekst)](#11-krok-7--define-zdefiniuj-pojedynczy-kontekst)
12. [Pomost do DDD taktycznego](#12-pomost-do-ddd-taktycznego)
13. [Przybornik technik warsztatowych](#13-przybornik-technik-warsztatowych)
14. [Katalog wzorców context mappingu](#14-katalog-wzorców-context-mappingu)
15. [Heurystyki i anty-wzorce](#15-heurystyki-i-anty-wzorce)
16. [Artefakty — tabela zbiorcza](#16-artefakty--tabela-zbiorcza)
17. [Źródła](#źródła)

---

## 1. Po co strategiczne DDD i dlaczego najpierw

**Domain-Driven Design** dzieli się na dwie warstwy:

- **Strategiczne DDD** — *duży obraz*: jak wygląda domena biznesowa, na jakie
  części się dzieli, która część jest naprawdę ważna, jak te części się ze sobą
  komunikują i kto (który zespół) je posiada. Operuje w **przestrzeni problemu**
  i na granicach między modelami.
- **Taktyczne DDD** — *wnętrze pojedynczego modelu*: agregaty, encje, value
  objects, domain events, repozytoria, serwisy domenowe. Operuje w **przestrzeni
  rozwiązania**, wewnątrz jednego bounded contextu.

**Dlaczego strategiczne idzie pierwsze.** Zanim zaczniesz projektować klasy,
musisz wiedzieć, *ile* modeli budujesz, *gdzie* przebiegają między nimi granice
i *które* z nich zasługują na Twój najlepszy wysiłek. Evans stawia to wprost:
**całkowite ujednolicenie modelu domeny dla dużego systemu jest niewykonalne lub
nieopłacalne** — próba zrobienia „jednego modelu na wszystko" kończy się
sprzecznościami i **Big Ball of Mud**. Strategiczna analiza wyznacza granice, w
obrębie których taktyczne modelowanie w ogóle ma sens. Odwrócenie kolejności
(najpierw encje, potem „jakoś to poskładamy") to najczęstszy błąd — patrz
[sekcja 15](#15-heurystyki-i-anty-wzorce).

**Kto powinien to robić.** Analiza strategiczna jest z definicji
**współtworzona**: eksperci domenowi / biznes + inżynierowie + product,
w jednym pomieszczeniu (fizycznym lub wirtualnym). To nie jest zadanie architekta
w izolacji — wiedza domenowa jest u ekspertów, a wykonalność u inżynierów, i
dopiero ich rozmowa daje dobry model.

---

## 2. Fundamenty pojęciowe (słownik)

Żeby flow było czytelne, ustalmy pojęcia. Terminy DDD zostają po angielsku (są
częścią *ubiquitous language* branży).

### Problem space vs solution space

| | **Problem space** (przestrzeń problemu) | **Solution space** (przestrzeń rozwiązania) |
|---|---|---|
| Odpowiada na | *Co* robi biznes i *dlaczego* | *Jak* to realizujemy w oprogramowaniu |
| Mieszkają tu | **Domena** i **poddomeny** (subdomains) | **Bounded contexts** i ich modele |
| Charakter | *Odkrywane* — istnieją w rzeczywistości biznesowej | *Projektowane* — świadoma decyzja architektoniczna |

To rozróżnienie jest kluczowe: poddomeny **odkrywasz** (są, czy chcesz czy nie),
bounded contexty **decydujesz**.

### Domena i poddomeny

- **Domain (domena)** — całość obszaru działania organizacji (np. „platforma
  e-commerce", „opieka zdrowotna").
- **Subdomain (poddomena)** — spójny wycinek domeny (np. „katalog produktów",
  „płatności", „wysyłka"). Poddomeny klasyfikujemy strategicznie na trzy typy:

| Typ | Co to | Sygnały rozpoznawcze | Strategia budowy | Kto to robi |
|---|---|---|---|---|
| **Core** (rdzeniowa) | Serce biznesu, wyróżnik rynkowy, przewaga konkurencyjna, najwyższe ROI | „za *to* płaci klient", „tu *musimy* być lepsi od konkurencji", wysoka złożoność **i** wysoka różnicowość | Buduj sam, *custom*; inwestuj najwięcej | Najlepsi ludzie, in-house |
| **Supporting** (wspierająca) | Potrzebna, by core działał, ale sama nie jest wyróżnikiem; specyficzna dla firmy | Niezbędna, ale „nikt nas za nią nie pochwali"; średnia różnicowość | Buduj prosto lub zleć; minimum wysiłku | Zespół pomocniczy / dostawca |
| **Generic** (generyczna) | Rozwiązany, uniwersalny problem (auth, płatności, e-mail, księgowość) | Istnieje dojrzałe gotowe rozwiązanie; niska różnicowość | **Kup / zintegruj gotowe** — nie buduj | Integracja off-the-shelf |

Heurystyki rozróżniania (zadaj je każdej poddomenie): *Czy klient płaci właśnie
za to? Czy to nas wyróżnia? Czy istnieje gotowy produkt, który to robi? Jak
złożone jest to modelowo?* Operacjonalizuje to **Core Domain Chart**
([krok 4](#8-krok-4--strategize-zidentyfikuj-rdzeń--destylacja)).

### Ubiquitous Language

**Ubiquitous Language** to jeden, wspólny język biznes ↔ dev, używany
konsekwentnie w rozmowach, modelu, kodzie i testach. Nie ma tłumaczenia „z
biznesowego na techniczne" — jest jeden słownik.

- **Jak się go odkrywa:** w warsztatach (EventStorming, Domain Storytelling) —
  wyłapując słowa, których *naprawdę* używają eksperci, i prostując
  niejednoznaczności na bieżąco.
- **Jak się go zapisuje:** jako **glosariusz per bounded context**. To istotne:
  ten sam termin znaczy co innego w różnych kontekstach (np. „Customer" w Sales
  to lead z pipeline'u, a w Support to konto z historią zgłoszeń). Jeden globalny
  słownik jest niemożliwy — i to właśnie zmiana znaczenia słowa **wyznacza
  granicę kontekstu**.

### Bounded Context

**Bounded Context** to centralny wzorzec DDD strategicznego: **granica, wewnątrz
której obowiązuje jeden spójny, wewnętrznie niesprzeczny model** i jeden
ubiquitous language. To „focus strategicznej części DDD, która dotyczy radzenia
sobie z dużymi modelami i zespołami" (Fowler).

- **Granica jest przede wszystkim językowa** (Vernon: „a Bounded Context is a
  linguistic boundary"): nowy model / nowy kontekst jest potrzebny tam, gdzie
  zmienia się słownictwo. Fowler zaznacza, że język to *dominujący*, ale nie
  jedyny czynnik (granicą bywa też np. technologia czy zespół).
- **Poddomena ≠ bounded context.** Poddomena jest w przestrzeni problemu, bounded
  context w przestrzeni rozwiązania. Ideałem jest odwzorowanie 1:1, ale realnie
  relacja bywa **wiele-do-wielu** (jedna poddomena może rozłożyć się na kilka
  kontekstów, kilka poddomen może zmieścić się w jednym). Traktowanie 1:1 jako
  dogmatu to anty-wzorzec.

### Context Map

**Context Map** to artefakt opisujący **relacje między bounded contextami i
zespołami** za pomocą ustalonego katalogu wzorców (patrz
[sekcja 14](#14-katalog-wzorców-context-mappingu)). Służy zarówno do **analizy
istniejącego krajobrazu** systemów, jak i do **projektowania od zera**.

---

## 3. Charakter procesu: iteracyjny, nie liniowy

**To najważniejsze zastrzeżenie do całego playbooka.** DDD Starter Modelling
Process jest z założenia **dla początkujących** i **nie jest liniową sekwencją
kroków, którą należy usztywnić jako „best practice"**. DDD to *ewolucyjny* proces
projektowy, który wymaga ciągłej iteracji nad każdym aspektem wiedzy i projektu.

W praktyce:

- **Skaczesz między krokami** w tę i z powrotem, w miarę jak zdobywasz (albo
  potrzebujesz zdobyć) nowe informacje.
- **Są różne punkty wejścia**, zależnie od sytuacji, m.in.:
  - *Start with Collaborative Modelling* — zacznij od warsztatu (greenfield, mało
    wiedzy skodyfikowanej).
  - *Start by Assessing IT Landscape* — zacznij od inwentaryzacji istniejących
    systemów (brownfield, legacy).
  - *Code Before Confirming Architecture and Team Boundaries* — czasem trzeba
    napisać kod eksploracyjnie, zanim zamrozi się granice.
- **Powtarzaj kroki 2–6**, zanim przejdziesz do definiowania i kodu.

Traktuj sekwencję poniżej jako *domyślną kolejność uczenia się*, nie jako
wodospad.

---

## 4. Flow w pigułce (mapa 8 kroków)

```
   PRZESTRZEŃ PROBLEMU  ────────────────────────────►  PRZESTRZEŃ ROZWIĄZANIA
  (co i dlaczego)                                       (jak)

  1. Understand → 2. Discover → 3. Decompose → 4. Strategize → 5. Connect → 6. Organise → 7. Define → 8. Code
                                └──────────────── RDZEŃ STRATEGICZNY ────────────────┘         └── taktyczne ──┘

        ◄────────────  iteracyjnie, nieliniowo — wraca się do wcześniejszych kroków  ────────────►
```

| # | Krok | Cel (jednym zdaniem) | Domyślna technika | Główny artefakt |
|---|---|---|---|---|
| 1 | **Understand** | Zorientuj się wokół modelu biznesowego i użytkowników | Business Model Canvas, Wardley Mapping | Zrozumienie kontekstu biznesowego |
| 2 | **Discover** | Odkryj domenę i jej zdarzenia wspólnie z ekspertami | **EventStorming** (Big Picture), Domain Storytelling | Model wielkiego obrazu (oś zdarzeń) |
| 3 | **Decompose** | Podziel domenę na luźno powiązane poddomeny | (na bazie granic z kroku 2) | Lista poddomen |
| 4 | **Strategize** | Wskaż rdzeń — gdzie ROI jest największe | **Core Domain Chart**, Wardley Mapping | Core Domain Chart |
| 5 | **Connect** | Połącz konteksty w luźno powiązaną architekturę end-to-end | **Domain Message Flow Modelling** | Context Map + przepływy komunikatów |
| 6 | **Organise** | Ustaw autonomiczne zespoły wyrównane do granic | **Team Topologies** | Mapa zespół ↔ kontekst |
| 7 | **Define** | Zaprojektuj i udokumentuj pojedynczy bounded context | **Bounded Context Canvas** | Wypełniona kanwa per kontekst |
| 8 | **Code** | Zaimplementuj model (już taktycznie) | Aggregate Design Canvas | Kod modelu (poza zakresem tego dok.) |

Strategiczny rdzeń analizy to **kroki 3–6: Decompose → Strategize → Connect →
Organise**. Kroki 1–2 to wsad (zrozumienie i odkrycie), krok 7 to pomost do
definicji pojedynczego kontekstu, krok 8 to już taktyka.

Poniżej każdy krok w strukturze: **Cel · Kto uczestniczy · Technika · Artefakt
wyjściowy · Pytania i heurystyki · Kryterium przejścia dalej.**

---

## 5. Krok 1 — Understand (zrozum biznes)

- **Cel.** Zorientować cały zespół wokół modelu biznesowego, użytkowników i
  celów, zanim zacznie się modelować domenę. Wspólny kontekst „po co to robimy".
- **Kto.** Biznes / sponsorzy, product, kluczowi eksperci domenowi, inżynierowie.
- **Technika.** *Business Model Canvas*, *Wardley Mapping*, rozmowy z
  interesariuszami, przegląd celów produktu.
- **Artefakt.** Zwięzły opis modelu biznesowego: kto są użytkownicy, jaką wartość
  dostarczamy, jak zarabiamy, jakie są cele i ograniczenia.
- **Pytania i heurystyki.** Kto jest użytkownikiem i jaką ma „pracę do
  wykonania"? Skąd bierze się przychód? Co jest tu przewagą, a co „musi po prostu
  działać"? Jakie są ograniczenia (regulacje, integracje, legacy)?
- **Kryterium przejścia.** Zespół potrafi jednym akapitem opowiedzieć, na czym
  polega biznes i co jest w nim strategicznie ważne.

---

## 6. Krok 2 — Discover (odkryj domenę)

- **Cel.** Wspólnie z ekspertami odkryć, *jak naprawdę* działa domena — jej
  zdarzenia, procesy, aktorów, punkty bólu i naturalne szwy (granice).
- **Kto.** Eksperci domenowi (obowiązkowo!), product, inżynierowie, facylitator.
  Im szersza reprezentacja, tym lepiej — to moment na „głupie pytania".
- **Technika.** **EventStorming — poziom Big Picture** (naklejki *domain events*
  na osi czasu; patrz [sekcja 13](#13-przybornik-technik-warsztatowych)),
  alternatywnie / uzupełniająco **Domain Storytelling** (opowieści aktor →
  czynność → obiekt).
- **Artefakt.** „Wielki obraz" domeny: strumień zdarzeń w czasie, zaznaczone
  *hot-spoty* (problemy, niewiedza, konflikty), *pivotal events* (zdarzenia
  przełomowe) i kandydackie granice.
- **Pytania i heurystyki.** Jakie zdarzenia zachodzą w domenie (w czasie
  przeszłym: „Zamówienie złożone", „Płatność zaksięgowana")? Gdzie zmienia się
  słownictwo? Gdzie następuje przekazanie odpowiedzialności między ludźmi/działami?
  Gdzie eksperci się nie zgadzają (hot-spot = złoto)?
- **Kryterium przejścia.** Widać spójny przepływ zdarzeń end-to-end i pojawiają
  się naturalne „szwy", w których rwie się język — kandydaci na granice poddomen.

---

## 7. Krok 3 — Decompose (podziel na poddomeny)

- **Cel.** Rozłożyć domenę na **luźno powiązane poddomeny** — spójne wewnętrznie,
  słabo sprzężone między sobą części przestrzeni problemu.
- **Kto.** Product + inżynierowie + eksperci; decyzja wspólna.
- **Technika.** Analiza granic wyłonionych z EventStormingu (pivotal events,
  zmiany języka, przekazania). Grupowanie zdarzeń/procesów w spójne obszary.
- **Artefakt.** Lista poddomen z krótkim opisem odpowiedzialności każdej.
- **Pytania i heurystyki.** Gdzie kończy się jeden spójny język, a zaczyna inny?
  Które zdarzenia „trzymają się razem" (wysoka kohezja) i które są od siebie
  niezależne (niskie sprzężenie)? Czy da się opisać poddomenę jednym zdaniem bez
  „i")? Granica językowa > granica organizacyjna.
- **Kryterium przejścia.** Domena jest pokryta rozłącznymi, nazwanymi
  poddomenami, a nazwy weszły do ubiquitous language.

> **Uwaga o kolejności.** Dekompozycja (problem space) i późniejsze wyznaczanie
> bounded contextów (solution space) to dwie różne czynności. Tu dzielimy
> *problem*; kontekst jako jednostkę *rozwiązania* domykasz w kroku 7. Nie zakładaj
> z góry 1:1.

---

## 8. Krok 4 — Strategize (zidentyfikuj rdzeń / destylacja)

To **serce strategicznego DDD** — moment **destylacji (distillation)**.

- **Cel.** Wskazać **core domain(s)** — poddomeny o największym potencjale
  różnicowania biznesowego i najwyższym ROI — i świadomie zdecydować, gdzie
  koncentrujemy wysiłek, a gdzie kupujemy/upraszczamy.
- **Kto.** **Wspólnie inżynierowie i product/biznes** — i to jest cała soczystość
  tej techniki: inżynierowie oceniają **złożoność**, a product/biznes dostarcza
  ocenę **różnicowania biznesowego**. Rozmowa między dyscyplinami jest produktem.
- **Technika.** **Core Domain Chart** (DDD Crew) — każda poddomena / bounded
  context / capability nanoszona na dwie osie: **złożoność modelu (Y)** ×
  **różnicowanie biznesowe (X)**. Uzupełniająco **Wardley Mapping** (ewolucja
  komponentów: genesis → custom → product → commodity).
- **Artefakt.** Core Domain Chart z rozmieszczonym portfelem poddomen; jawne
  oznaczenie core / supporting / generic. Opcjonalnie **Domain Vision Statement**
  — krótki (~1 akapit) opis rdzenia i wartości, jaką wnosi; wspólny „kompas"
  utrzymywany przez cały czas.
- **Zasada destylacji (Evans, dosłownie sparafrazowane).**
  - *Core Domain:* „**boil the model down**" — wydziel rdzeń tak, by łatwo odróżnić
    go od masy modelu wspierającego; **trzymaj rdzeń mały**; **przydziel do niego
    najlepszych ludzi** (i rekrutuj pod to); **każdą inną inwestycję uzasadniaj
    tym, jak wspiera zdestylowany rdzeń**.
  - *Generic Subdomains:* wydziel generyczne poddomeny do osobnych modułów, nadaj
    im **niższy priorytet** niż rdzeniowi, **nie sadzaj na nich swoich core
    developerów** i **rozważ gotowe / publikowane rozwiązania**.
- **Pytania i heurystyki.** Gdzie jest największe ROI? Co nas różnicuje, a co
  „musi tylko działać"? Czego *nie wolno* nam oddać na zewnątrz? Co spokojnie
  kupimy? Czy trzymamy rdzeń wystarczająco *mały*?
- **Kryterium przejścia.** Każda poddomena ma przypisany typ (core/supporting/
  generic) i wynikającą z niego strategię inwestycji; zespół zgadza się, co jest
  rdzeniem.

---

## 9. Krok 5 — Connect (połącz konteksty — context mapping)

- **Cel.** Połączyć konteksty w **luźno powiązaną architekturę, która realizuje
  end-to-end przypadki użycia biznesu**, i jawnie opisać relacje między nimi.
- **Kto.** Architekci / inżynierowie + product; osoby znające istniejące systemy.
- **Technika.** **Domain Message Flow Modelling** (DDD Crew) — modelowanie
  przepływu komend / zdarzeń / zapytań między kontekstami dla konkretnych
  scenariuszy; oraz sporządzenie **Context Map** z wzorcami relacji.
- **Artefakt.** **Context Map** — bounded contexty + typ relacji między każdą
  parą (patrz katalog w [sekcji 14](#14-katalog-wzorców-context-mappingu)) — plus
  diagramy przepływu komunikatów dla kluczowych use-case'ów.
- **Procedura Evansa dla Context Map** (kanoniczne 4 kroki):
  1. **Zidentyfikuj każdy model w grze** i zdefiniuj jego bounded context (także
     ukryte modele podsystemów nie-obiektowych / legacy).
  2. **Nazwij każdy bounded context** i wprowadź te nazwy do ubiquitous language.
  3. **Opisz punkty styku** między modelami: jawne tłumaczenie każdej komunikacji,
     zaznacz współdzielenie, mechanizmy izolacji i **poziomy wpływu** (influence).
  4. **Najpierw zmapuj istniejący teren**, transformacje odłóż na później (nie
     projektuj docelowego stanu, zanim nie zrozumiesz obecnego).
- **Pytania i heurystyki.** Kto jest *upstream*, a kto *downstream* (czyj sukces
  zależy od czyjego)? Czy chronimy własny model **ACL**-em? Czy publikujemy
  **OHS/Published Language**? Gdzie sprzężenie jest tak wysokie, że to
  **Partnership/Shared Kernel**? Gdzie *nie integrować się wcale* (**Separate
  Ways**)?
- **Kryterium przejścia.** Istnieje mapa: wszystkie konteksty nazwane, wszystkie
  istotne relacje sklasyfikowane wzorcem i kierunkiem wpływu.

---

## 10. Krok 6 — Organise (ustaw zespoły)

- **Cel.** Ustawić **autonomiczne zespoły zoptymalizowane pod szybki przepływ
  (fast flow) i wyrównane do granic kontekstów**.
- **Kto.** Liderzy techniczni + zarządzanie + same zespoły (patrz niżej).
- **Technika.** **Team Topologies** — dopasowanie typów zespołów (stream-aligned,
  platform, enabling, complicated-subsystem) i trybów interakcji do mapy
  kontekstów; minimalizacja *cognitive load*.
- **Artefakt.** Mapa „zespół ↔ bounded context(y)" wraz z trybami współpracy.
- **Zasada kluczowa.** „Organizacja to **nie** coś, co się *robi zespołom* —
  zespoły powinny **współuczestniczyć** w definiowaniu swoich granic, interakcji i
  odpowiedzialności." To socjotechniczny wymiar metodyki.
- **Reverse Conway Maneuver.** Prawo Conwaya mówi, że architektura systemu
  odzwierciedla strukturę komunikacji organizacji. *Reverse Conway* to celowe
  ukształtowanie struktury zespołów tak, by **wymusić pożądaną architekturę** —
  zamiast walczyć z Conwayem, wyprzedź go: ustaw zespoły wzdłuż granic
  kontekstów, a architektura podąży za nimi.
- **Pytania i heurystyki.** Czy jeden zespół może posiadać kontekst end-to-end
  bez ciągłego oczekiwania na innych? Czy *cognitive load* zespołu mieści się w
  jego pojemności? Gdzie relacja upstream/downstream z kroku 5 wymaga trybu
  współpracy (collaboration) vs „x-as-a-service"?
- **Kryterium przejścia.** Każdy istotny kontekst ma właściciela (zespół), a
  tryby współpracy wynikają z mapy relacji.

> **Sprzężenie zwrotne 5 ↔ 6.** Czasem najpierw ustawia się zespoły, a potem pod
> nie domyka granice kontekstów (wariant *Organise Teams Before Designing
> Contexts*). Kroki 5 i 6 iterują parami.

---

## 11. Krok 7 — Define (zdefiniuj pojedynczy kontekst)

- **Cel.** Zaprojektować i udokumentować projekt **pojedynczego bounded contextu**
  — od nazwy, przez odpowiedzialności, po publiczny interfejs i zależności.
- **Kto.** Zespół posiadający kontekst: developerzy, analitycy biznesowi, eksperci
  domenowi, product managerowie.
- **Technika.** **Bounded Context Canvas** (DDD Crew) — kanwa prowadząca przez
  kluczowe decyzje projektowe jednego kontekstu.
- **Artefakt.** Wypełniona kanwa, zawierająca m.in. **Strategic Classification**:
  - **znaczenie** (core / supporting / generic) — wprost linkuje do Core Domain
    Chart z kroku 4,
  - **rola w modelu biznesowym** (revenue generator / engagement creator /
    compliance enforcer),
  - **etap ewolucji** (genesis / custom-built / product / commodity),

  a dalej: model domenowy (ubiquitous language, kluczowe pojęcia),
  odpowiedzialności, komunikaty przychodzące/wychodzące (komendy, zdarzenia,
  zapytania), zależności.
- **Pytania i heurystyki.** Jak nazywa się kontekst i jaka jest jego jedna,
  zwięzła odpowiedzialność? Jaki jest jego publiczny interfejs? Od czego zależy i
  co udostępnia? Czy klasyfikacja strategiczna zgadza się z Core Domain Chart?
- **Kryterium przejścia.** Dla każdego istotnego kontekstu istnieje kanwa; zespół
  wie, co jest wewnątrz, a co na styku.

> Krok 7 iteruje per kontekst. Zwykle zaczyna się od **core** (najwięcej uwagi),
> a konteksty generic często w ogóle nie przechodzą pełnej kanwy — bo je kupujemy.

---

## 12. Pomost do DDD taktycznego

Tu kończy się warstwa strategiczna. **Krok 8 — Code** i to, co go poprzedza na
poziomie projektowym, należą już do **DDD taktycznego** i są poza zakresem tego
dokumentu. Dla ciągłości — punkty styku:

- **EventStorming – poziom Design** (najgłębszy z trzech) schodzi z granic
  kontekstu do **agregatów, komend i zdarzeń** — to naturalny most między
  odkryciem a kodem.
- **Aggregate Design Canvas** (DDD Crew) to rekomendowany artefakt kroku Code:
  projekt pojedynczego agregatu wewnątrz kontekstu.
- Dopiero **wewnątrz** ustalonego bounded contextu sięgasz po taktyczne klocki:
  **Aggregate, Entity, Value Object, Domain Event, Repository, Domain Service,
  Factory**. Każdy z nich obowiązuje *lokalnie* — w granicy jednego kontekstu i
  jednego ubiquitous language.

Zasada spinająca obie warstwy: **strategiczne DDD mówi, ile modeli budujesz i
gdzie są granice; taktyczne DDD mówi, jak zbudować wnętrze jednego z nich.**

---

## 13. Przybornik technik warsztatowych

Techniki, którymi *wykonuje się* analizę. Każda ma miejsce w flow (kolumna
„Krok").

### EventStorming (Alberto Brandolini)

Warsztat na ścianie/tablicy z kolorowymi karteczkami, w trzech poziomach
szczegółowości:

| Poziom | Kiedy | O czym | Miejsce w flow |
|---|---|---|---|
| **Big Picture** | Na starcie, szeroki krąg uczestników | Zdarzenia całej linii biznesowej na osi czasu; hot-spoty, granice | Krok 2 (Discover) |
| **Process Level** | Po odkryciu wielkiego obrazu | Jeden proces: zdarzenia + komendy + aktorzy + polityki + read models | Krok 2–3 (uszczegółowienie) |
| **Design Level** | Przy przejściu do kodu | Agregaty, komendy, zdarzenia — pomost do taktyki | Krok 8 (już taktyczne) |

Kanoniczna notacja karteczek (kolory bywają lokalnie modyfikowane):

| Kolor | Element |
|---|---|
| pomarańczowy | **Domain Event** (zdarzenie, czas przeszły) |
| niebieski | **Command** (komenda / intencja) |
| żółty (duży) | **Aggregate** |
| jasnożółty (mały) | **Actor** (aktor/rola) |
| różowy | **External System** |
| fioletowy | **Policy / Process** („zawsze gdy…") |
| zielony | **Read Model** (widok, na podstawie którego ktoś decyduje) |
| czerwony | **Hot-spot** (problem, konflikt, niewiedza) |

Wartość: hot-spoty i miejsca, gdzie *rwie się język*, to kandydaci na granice
poddomen/kontekstów.

### Domain Storytelling

Opowiadanie i rysowanie historii domenowych w notacji **aktor → czynność →
obiekt roboczy**, numerowanych w kolejności. Świetne do odkrycia języka i
przepływu pracy. Miejsce: krok 2 (alternatywa/uzupełnienie EventStormingu).

### Core Domain Chart

Dwuosiowy wykres **złożoność × różnicowanie biznesowe** do klasyfikacji
poddomen i wyznaczenia rdzenia. Jego siła to **rozmowa między dyscyplinami**
(inżynier = złożoność, product = różnicowanie). Miejsce: krok 4 (Strategize).

### Domain Message Flow Modelling

Diagram przepływu komunikatów (komend/zdarzeń/zapytań) między kontekstami dla
konkretnego scenariusza — pokazuje, czy architektura obsługuje use-case
end-to-end. Miejsce: krok 5 (Connect).

### Bounded Context Canvas

Kanwa projektu **jednego** kontekstu (nazwa, klasyfikacja strategiczna,
odpowiedzialności, interfejs, zależności). Miejsce: krok 7 (Define).

### Wardley Mapping

Mapa łańcucha wartości wg widoczności dla użytkownika i **ewolucji** komponentów
(genesis → custom-built → product → commodity). Pomaga odróżnić to, co warto
budować, od tego, co jest już „commodity" (kandydat na generic). Miejsce: krok 1
(Understand) i 4 (Strategize).

---

## 14. Katalog wzorców context mappingu

Relacje między kontekstami klasyfikujemy według **kierunku wpływu**. DDD Crew
wyróżnia trzy kategorie relacji zespołów:

- **Mutually Dependent** (współzależne) — dwa konteksty stoją i padają razem.
- **Upstream / Downstream** (U/D) — **asymetryczne**: działania *upstream* wpływają
  na sukces *downstream*, ale nie odwrotnie („upstream może odnieść sukces
  niezależnie od losu downstream"; analogia rzeki — górny bieg zanieczyszcza
  dolny, nie na odwrót). Strzałka wpływu zawsze biegnie **upstream → downstream**.
- **Free** (wolne) — kontekst jest *wolny*, jeśli zmiany w innych kontekstach nie
  wpływają na jego sukces lub porażkę.

Pełny katalog wzorców:

| Wzorzec | Kategoria wpływu | Kier. | Na czym polega |
|---|---|:---:|---|
| **Partnership** | Współzależne | ↔ | Dwa konteksty/zespoły osiągają sukces lub porażkę **razem**; wspólne planowanie, skoordynowane wydania, wspólne rozwiązywanie integracji. |
| **Shared Kernel** | Współzależne | ↔ | Jawnie wydzielony, **współdzielony** podzbiór modelu/kodu (np. biblioteka). Tania integracja, ale każda zmiana wymaga uzgodnienia — wysokie sprzężenie, używać oszczędnie. |
| **Customer / Supplier** | Upstream/Downstream | U→D | Upstream (dostawca) uwzględnia potrzeby downstream (klient) w swoim backlogu; klient ma **realny głos**. |
| **Conformist** | Upstream/Downstream | U→D | Downstream **ślepo przyjmuje model upstream**, rezygnując z własnego tłumaczenia — świadomie eliminuje koszt translacji (kosztem własnej czystości modelu). |
| **Anticorruption Layer (ACL)** | Upstream/Downstream | U→D | Downstream buduje **warstwę izolująco-tłumaczącą**, chroniącą własny model przed (obcym/brzydkim) modelem upstream. Defensywna; zalecana wobec legacy i Big Ball of Mud. |
| **Open-Host Service (OHS)** | Upstream/Downstream | U→D | Upstream udostępnia **stabilny, zdefiniowany protokół/API** dla *wielu* klientów naraz, zamiast integrować się z każdym osobno. |
| **Published Language** | Upstream/Downstream | U→D | Dobrze udokumentowany, **wspólny język wymiany** (schema/standard), w którym odbywa się komunikacja; często razem z OHS. |
| **Separate Ways** | Wolne | ∅ | Świadoma decyzja o **braku integracji** — taniej rozwiązać potrzebę osobno niż łączyć konteksty. |
| **Big Ball of Mud** | (anty-wzorzec) | — | Obszar bez wyraźnych granic i spójnego modelu. Strategia: **otoczyć ACL-em**, nie wpuszczać jego bałaganu do własnego kontekstu. |

Praktyka: na Context Map rysujesz konteksty jako pudełka, a między nimi
oznaczasz U/D oraz wzorzec (np. `[Billing]—OHS/PL→ACL—[Reporting]`). To samo
narzędzie działa dla systemów istniejących (analiza) i projektowanych (design).

---

## 15. Heurystyki i anty-wzorce

**Heurystyki (rób tak):**

- **Zacznij od języka, nie od bazy danych.** Granice biegną tam, gdzie rwie się
  słownictwo.
- **Trzymaj rdzeń mały i broń go.** Najlepsi ludzie na core; generic kupuj.
- **Mapuj istniejący teren, zanim zaprojektujesz docelowy.** (Evans, krok 5.4).
- **Iteruj.** Wracaj do wcześniejszych kroków, gdy pojawia się nowa wiedza.
- **Modeluj z ekspertami, nie o ekspertach.** Warsztat > dokument.
- **Hot-spoty to skarb.** Tam, gdzie eksperci się kłócą, jest granica lub ważna
  wiedza.
- **Zaangażuj zespoły w wyznaczanie ich granic** (krok 6).

**Anty-wzorce (pułapki):**

- **Taktyka przed strategią** — projektowanie encji/agregatów, zanim wiadomo, ile
  jest modeli i gdzie granice.
- **Jeden model na wszystko (total unification)** — Evans: niewykonalne i
  nieopłacalne; prowadzi do sprzeczności.
- **Dogmat 1:1 poddomena ↔ bounded context** — realnie relacja bywa
  wiele-do-wielu; to decyzja projektowa, nie automat.
- **Traktowanie flow jako wodospadu** — to proces ewolucyjny; usztywnienie
  sekwencji jako „best practice" jest wprost odradzane przez autorów.
- **Big Ball of Mud** — brak granic; wszystko zależy od wszystkiego.
- **Rozpraszanie najlepszych ludzi na generic/supporting** zamiast na rdzeniu.
- **Narzucanie struktury zespołów odgórnie** zamiast współprojektowania granic.
- **Przedwczesna mikroserwisacja** — rozdrobnienie na zbyt wiele kontekstów, zanim
  granice są zrozumiane; koszt integracji przewyższa korzyść.
- **Modelowanie w izolacji od ekspertów domenowych** — architekt „wie lepiej".

---

## 16. Artefakty — tabela zbiorcza

| Krok | Cel | Kto uczestniczy | Technika (domyślna) | Artefakt wyjściowy |
|---|---|---|---|---|
| 1. Understand | Zorientować wokół biznesu | Biznes, product, eksperci, inż. | Business Model Canvas, Wardley | Opis modelu biznesowego |
| 2. Discover | Odkryć domenę | **Eksperci domenowi**, product, inż. | EventStorming Big Picture, Domain Storytelling | Model wielkiego obrazu (oś zdarzeń) |
| 3. Decompose | Podzielić na poddomeny | Product, inż., eksperci | Analiza granic z kroku 2 | Lista poddomen |
| 4. Strategize | Wskazać rdzeń (destylacja) | **Inżynierowie + product** | Core Domain Chart, Wardley | Core Domain Chart, (Domain Vision Statement) |
| 5. Connect | Połączyć konteksty | Architekci, inż., product | Domain Message Flow Modelling | Context Map + przepływy komunikatów |
| 6. Organise | Ustawić zespoły | Liderzy + zarząd + **zespoły** | Team Topologies | Mapa zespół ↔ kontekst |
| 7. Define | Zaprojektować 1 kontekst | Dev, BA, eksperci, PM | Bounded Context Canvas | Wypełniona kanwa per kontekst |
| 8. Code *(taktyczne)* | Zaimplementować model | Zespół kontekstu | Aggregate Design Canvas | Kod modelu |

---

## Źródła

Kluczowe twierdzenia szkieletu (8 kroków, mapowanie technik, wzorce context-map,
osie Core Domain Chart, sekcje Bounded Context Canvas, powiązanie z Team
Topologies) były weryfikowane wieloźródłowo względem źródeł pierwotnych.

**Źródła pierwotne (kanon):**

- DDD Crew — **DDD Starter Modelling Process** — <https://github.com/ddd-crew/ddd-starter-modelling-process>
  (oraz strona: <https://ddd-crew.github.io/ddd-starter-modelling-process/>)
- DDD Crew — **Context Mapping** (cheat sheet wzorców) — <https://github.com/ddd-crew/context-mapping>
- DDD Crew — **Bounded Context Canvas** — <https://github.com/ddd-crew/bounded-context-canvas>
- DDD Crew — **Core Domain Charts** — <https://github.com/ddd-crew/core-domain-charts>
- DDD Crew — **Domain Message Flow Modelling** — <https://github.com/ddd-crew/domain-message-flow-modelling>
- Eric Evans — **Domain-Driven Design Reference** (2015) — <https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf>
  (definicje: Bounded Context, Context Map, Core Domain, Generic Subdomains, kategorie wpływu U/D)
- Martin Fowler — **BoundedContext** (bliki, 2014) — <https://martinfowler.com/bliki/BoundedContext.html>
- Alberto Brandolini — **EventStorming** (Introducing EventStorming; artykuł źródłowy) — <https://medium.com/@ziobrando/collaborative-process-modelling-with-eventstorming-17ed363650c0>
- **Domain Storytelling** (Hofer & Schwentner) — <https://domainstorytelling.org/book>

**Źródła uzupełniające:**

- Nick Tune & Scott Millett — *Designing Autonomous Teams and Services* (O'Reilly) — <https://www.oreilly.com/library/view/designing-autonomous-teams/9781491994320/>
- Nick Tune — *Modelling Bounded Contexts with the Bounded Context Canvas: A Workshop Recipe* — <https://medium.com/nick-tune-tech-strategy-blog/modelling-bounded-contexts-with-the-bounded-context-design-canvas-a-workshop-recipe-1f123e592ab>
- Mathias Verraes — *Domain and Bounded Contexts Don't Map One on One* (2025) — <https://verraes.net/2025/08/domain-and-bounded-contexts-dont-map-one-on-one/>
- Eric Evans — *Domain-Driven Design: Tackling Complexity in the Heart of Software* (Addison-Wesley, 2003) — książka źródłowa
- Vaughn Vernon — *Domain-Driven Design Distilled* (Addison-Wesley, 2016)
- Matthew Skelton & Manuel Pais — *Team Topologies* (IT Revolution, 2019) — dla kroku Organise / reverse Conway

> **Zastrzeżenia (świadome luki).** Artefakty DDD Crew są *żywymi* dokumentami
> (kanwy mają wersje v2/v3) — etykiety pól mogą się zmieniać; sprawdzaj aktualne
> README. Fundamenty Evansa (2003/2015), Fowlera (2014) i Brandoliniego są
> stabilne. Notacja EventStormingu (kolory) i szczegóły warsztatów bywają
> lokalnie adaptowane — traktuj je jako punkt startu, nie sztywny standard.
