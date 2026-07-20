# F3 — Decompose — poddomeny kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-06
> **Krok DDD:** 3 Decompose · **Zależy od:** F2

Rozkład domeny na **17 rozłącznych, spójnych poddomen** przez grupowanie osi
zdarzeń F2 (`02-discover-mapa-zdarzen.md`) wg kohezji i granic językowych. Opisuje
stan, który JEST (brownfield) — NIE projektuje architektury (F5/F6) i NIE zakłada
1:1 poddomena↔bounded context (to ustala się w F5). Test rozłączności: każda
poddomena opisywalna **jednym zdaniem bez „i"** mieszającego dwie odpowiedzialności.

## Wejście (co przeczytano)

- **Główne wejście:** `02-discover-mapa-zdarzen.md` (F2) — 14 procesów, ~101 zdarzeń
  osi, 16 pivotal events, 15 kandydackich granic (szwów), aktorzy, hot-spoty.
- **Kanon językowy:** `glosariusz.md` (rozstrzygnięcia 2026-07-05 + rewizja F2
  „markowe → globalne"; zamrożone: Progresja⊥Awans, „sesja" 4×, trzy intencje
  anulowania).
- **Runbook + zasady:** `00-plan-analizy-strategicznej.md` §9 (F3), §4 (zasady).
- **Silnik jakości (średni, §7 planu):** panel 3 adwersaryjnych krytyków
  (pokrycie / rozłączność / kohezja językowa) nad proponowaną dekompozycją +
  synteza. Wynik: **pokrycie PEŁNE** (0 zdarzeń osieroconych, ~103 pozycje osi mają
  dom); wyłapano i wchłonięto poprawki nazewnicze (ochrona kanonu Progresja/Awans,
  kolizja „dostęp") oraz właścicielskie (pauza subskrypcji ambasadora, polimorficzne
  zaproszenie). Dwie decyzje graniczne (Marka, Analityka) rozstrzygnięte przez
  właściciela → SPLIT w obu.
- Kod czytany punktowo tylko przy wątpliwościach — F2 zebrał zdarzenia z dowodami;
  F3 to praca grupująca.

## Ustalenia

### Lista poddomen (17) — jednozdaniowa odpowiedzialność

Adnotacja **[wyróżnik]** = poddomena wskazana w F2 jako rdzeń kalistenicznego
wyróżnika (typ core/supporting/generic ustala dopiero F4).

| # | Poddomena (PL / EN) | Odpowiedzialność (jedno zdanie, bez „i" mieszającego) |
|---|---|---|
| 1 | **Tożsamość i uwierzytelnianie** (Identity & Authentication) | Ustala i utrzymuje tożsamość zalogowanego użytkownika (konsumpcja zaproszenia → konto/hasło, sesja, wylogowanie, twarde usunięcie konta). |
| 2 | **Tenancy / Bootstrap marki** (Brand Tenancy) | Ustanawia strukturę najemcy: markę-singleton, regiony i przypisanie użytkowników — jednorazowym seedem Operatora poza produktem. |
| 3 | **Ambasadorzy** (Ambassadors) | Zarządza cyklem życia trenerów-ambasadorów w ramach marki (zaproszenie, dezaktywacja, reaktywacja, wgląd MRR). |
| 4 | **Biblioteka ćwiczeń** (Exercise Library) | Utrzymuje słownik ćwiczeń (globalne ∪ własne, kategorie, demo, `tracks_rpe`) używany przez plany, logowanie i umiejętności. |
| 5 | **Umiejętności i drzewo** (Skills & Skill-Tree) | Definiuje strukturę awansu: umiejętności-drabiny wariantów w acyklicznym DAG prerekwizytów (globalne ∪ własne + fork). **[wyróżnik]** |
| 6 | **Awans podopiecznego** (Trainee Advancement) | Śledzi awans i cofnięcie każdego podopiecznego po drabinach umiejętności jako ręczną decyzję trenera. **[wyróżnik]** |
| 7 | **Plany / Programowanie** (Programming) | Autoruje i publikuje wersjonowany plan treningowy per podopieczny (draft→active→archived, forward-only). |
| 8 | **Trening / Logowanie** (Workout Logging) | Rejestruje wykonanie Sesji planu przez podopiecznego, seria po serii (reps/RPE/wideo), jako niezmienny agregat. |
| 9 | **Sylwetka** (Body Photos) | Pozwala podopiecznemu prowadzić zdjęcia sylwetki (owner-scoped, para before/after po `taken_on`). |
| 10 | **Konsultacje i harmonogram** (Consultations & Scheduling) | Prowadzi cykl życia spotkań 1:1 od reguły cyklicznej (harmonogram → generowane terminy) po udokumentowanie z punktami „do poprawy". |
| 11 | **Analityka diagnostyczna** (Diagnostic Analytics) | Prezentuje trenerowi read-only diagnostykę treningową (cockpit, plateau, statystyki, Progresja, Rekord/PR). |
| 12 | **Retencja / Wrapped** (Retention) | Dostarcza podopiecznemu miesięczną retrospektywę-gamifikację (Wrapped, archetyp) napędzającą powroty. |
| 13 | **Płatności / Subskrypcje** (Billing — Stripe Connect) | Obsługuje płatną subskrypcję coachingową per para (onboarding Connect, kwota `amount_minor`, cykl subskrypcji, lustro statusu z webhooków, faktury). |
| 14 | **Bramkowanie dostępu** (Access Gating) | Rozstrzyga, czy podopieczny ma dostęp do panelu, na podstawie statusu subskrypcji i `archived_at` trenera. |
| 15 | **Pliki i podpisane URL** (Files & Signed URLs) | Przechowuje pliki binarne i wydaje krótkotrwałe podpisane URL-e (HMAC) współdzielone przez demo, wideo serii i zdjęcia. |
| 16 | **Integracja Google Calendar/Meet** (Calendar Sync) | Odzwierciedla konsultacje w Kalendarzu Google trenera (zdarzenie + link Meet), jednokierunkowo i best-effort (ACL). |
| 17 | **Notyfikacje / Dostarczanie** (Delivery) | Dostarcza komunikaty krzyżujące granice (token zaproszenia, przypomnienia, dunning/faktury) — **missing capability**, do zbudowania w reimplementacji. |

> „Rozwój" NIE jest poddomeną — to **powierzchnia prezentacyjna** (read-model JOIN
> #6 Awans (drzewo) + #11 Progresja (lista)). Świadomie poza listą.

### Mapowanie zdarzenie → poddomena (pokrycie całej osi F2)

Zapis: `zdarzenie → WŁAŚCICIEL` (dokładnie jeden); `· seam →` / `· wyzwala` =
kaskada/sprzężenie adnotowane, NIE drugie właścicielstwo.

**Proces 1 — Bootstrap marki (Operator)**
- Trener-założyciel zaseedowany → **2 Tenancy** · seam → **1 Tożsamość** (konto poza mechanizmem zaproszeń)
- Marka utworzona · Region utworzony · Użytkownik przypisany do marki/regionu → **2 Tenancy**
- Prezes marki utworzony → **2 Tenancy** · seam → **1 Tożsamość** (konto poza mechanizmem zaproszeń)

**Proces 2 — Onboarding trenera-ambasadora**
- Zaproszenie ambasadora utworzone → **1 Tożsamość** (mechanizm zaproszenia) · wyzwala **3 Ambasadorzy** (treść: org+region)
- Trener-ambasador dołączył · Zaproszenie skonsumowane → **1 Tożsamość**

**Proces 3 — Onboarding podopiecznego**
- Zaproszenie utworzone (trainee + kwota) → **1 Tożsamość** (mechanizm) · seam kwoty → **13 Płatności** · wyzwala trener (roster — hot-spot H)
- Konto podopiecznego utworzone · Konto reaktywowane (zastąpione) → **1 Tożsamość**
- Zaproszenie skonsumowane (best-effort `setMonthlyAmount`) → **1 Tożsamość** · seam → **13 Płatności**

**Proces 4 — Uwierzytelnianie i sesje**
- Sesja utworzona / zrotowana / zniszczona · Wygasłe sesje usunięte → **1 Tożsamość**
- (brak self-service hasła — luka w obrębie **1 Tożsamość**)

**Proces 5 — Autoring biblioteki globalnej (Prezes)**
- Globalne ćwiczenie: utworzone / zmienione / zarchiwizowane / przywrócone → **4 Biblioteka ćwiczeń**
- Demo globalnego ćwiczenia wgrane → **4 Biblioteka ćwiczeń** · seam → **15 Pliki**
- Globalna umiejętność: utworzona / zaktualizowana / zarchiwizowana; wariant dodany/usunięty; drabina przesortowana; prerekwizyt dodany/usunięty → **5 Umiejętności i drzewo**

**Proces 6 — Autoring biblioteki i drzewa trenera**
- Kategoria dodana / usunięta · Własne ćwiczenie: utworzone / zmienione / zarchiwizowane / przywrócone → **4 Biblioteka ćwiczeń**
- Demo własnego ćwiczenia wgrane → **4 Biblioteka ćwiczeń** · seam → **15 Pliki**
- Globalne ćwiczenie sforkowane („Dostosuj") → **4 Biblioteka ćwiczeń** (wewn. szew fork global→trener)
- Umiejętność: utworzona / zaktualizowana / zarchiwizowana; wariant dodany/usunięty; drabina przesortowana; prerekwizyt dodany/usunięty → **5 Umiejętności i drzewo**
- Globalna umiejętność sforkowana („Dostosuj") → **5 Umiejętności i drzewo** (wewn. szew fork)

**Proces 7 — Rozwój i awans podopiecznego**
- Poziom startowy ustawiony · Awans zarejestrowany · Cofnięcie zarejestrowane → **6 Awans podopiecznego**

**Proces 8 — Cykl życia planu**
- Pusty draft utworzony · Draft z aktywnego · Draft zapisany · Plan opublikowany · Poprzedni aktywny zarchiwizowany · Plan zarchiwizowany (z treningami) · Plan usunięty (bez treningów) → **7 Plany**
  *(„Plan opublikowany" = szew brzegowy — handoff wartości do podopiecznego; klasyfikacja relacji w F5, nie osobna poddomena.)*

**Proces 9 — Pętla treningowa**
- Trening zapisany · Seria zalogowana → **8 Logowanie**
- Wideo serii przesłane → **8 Logowanie** · seam → **15 Pliki**

**Proces 10 — Sylwetka**
- Zdjęcie sylwetki zarejestrowane → **9 Sylwetka** · seam → **15 Pliki**
- Zdjęcie sylwetki usunięte → **9 Sylwetka**
- Blob zdjęcia skasowany (post-commit) → **15 Pliki** (generyczna polityka lifecycle bloba) · wyzwala **9 Sylwetka**

**Proces 11 — Konsultacje 1:1 i harmonogram**
- Harmonogram ustawiony · Terminy starej serii pominięte · Termin zaplanowany · Konsultacja potwierdzona · Termin odrzucony · Prośba o zmianę · Termin przełożony · Termin odwołany · Konsultacja udokumentowana · Punkt „do poprawy" przełączony · Konsultacja ad-hoc utworzona · Harmonogram wyłączony · Konsultacja usunięta → **10 Konsultacje**
  *(wewn. szwy: reguła (harmonogram) ↔ instancja (konsultacja); dwuznaczność „terminu" — podopieczny: zaproszenie-do-potwierdzenia vs trener: slot-do-udokumentowania.)*

**Proces 12 — Sync Google Calendar/Meet**
- Kalendarz połączony / rozłączony · Zdarzenie zaktualizowane / usunięte / pary skasowane · Token odświeżony → **16 Google**
- Zdarzenie utworzone + link Meet → **16 Google** · seam write-back → **10 Konsultacje** (utrwala `google_event_id`/`meeting_url` w wierszu konsultacji)

**Proces 13 — Płatności i subskrypcja**
- Konto Stripe Express trenera utworzone → **13 Płatności**
- Status konta Stripe trenera zaktualizowany → **13 Płatności** · seam → **14 Bramkowanie**
- Kwota miesięczna ustalona · Cena aktywnej subskrypcji podmieniona · Klient utworzony · Wynik Checkout powiązany · Webhook przyjęty (dedup) · Faktura zarejestrowana · Konto płatności posprzątane → **13 Płatności**
- Status subskrypcji zaktualizowany (lustro) · Subskrypcja aktywowana · wstrzymana / wznowiona · anulowana (ręcznie) / wygasła (dunning) · Anulowanie na koniec okresu zaplanowane → **13 Płatności** · seam → **14 Bramkowanie**

**Proces 14 — Cykl życia konta / dezaktywacja**
- Ambasador zdezaktywowany → **3 Ambasadorzy** · seam → **14 Bramkowanie** · wyzwala kaskadę pauzy → **13 Płatności**
- Ambasador reaktywowany → **3 Ambasadorzy** · wyzwala kaskadę wznowienia → **13 Płatności**
- Subskrypcja ambasadora wstrzymana / wznowiona → **13 Płatności** (mutacja lustra subskrypcji) · wyzwalacz: **3 Ambasadorzy**
- Podopieczny usunięty (twarde) → **1 Tożsamość** · kaskady CASCADE FK → **6 Awans**, **7 Plany**, **8 Logowanie**, **9 Sylwetka** · cleanup → **13 Płatności** + **16 Google**

**Read-modele (F2: NIE zdarzenia) i generyki**
- Statystyki / cockpit / plateau / Progresja (szereg czasowy) / Rekord (PR) → **11 Analityka diagnostyczna**
- Wrapped / archetyp → **12 Retencja/Wrapped** (konsumuje metrykę „Rekord/PR" z #11)
- Gating / `hasAppAccess` → **14 Bramkowanie**
- „Rozwój" (powierzchnia łącząca) → JOIN prezentacyjny **6 Awans** (drzewo) + **11 Analityka** (Progresja)
- Pliki (`exercise_demo` | `set_video` | `body_photo`) + lifecycle bloba → **15 Pliki**
- Komunikacja out-of-band (token, przypomnienia, dunning) → **17 Notyfikacje**

### Kohezja i luźne sprzężenia

- **Rdzeń wyróżnika (kalisteniczny model progresji)** rozkłada się na parę: **5
  Umiejętności/drzewo** (definicja struktury: drabiny + DAG, autor prezes/trener,
  rytm rzadki) ⊥ **6 Awans** (interpretacja per-para, event-sourced, decyzja
  trenera, rytm treningowy). Graf raz definiowany, raz interpretowany — inny
  właściciel i rytm (szew F2 #5).
- **Łańcuch wartości podopiecznego** (luźno sprzężony przez `plan_id`/`exercise_id`,
  ON DELETE RESTRICT): 4 Biblioteka → 7 Plany →(publikacja)→ 8 Logowanie →(read-only)→
  11 Analityka. Kierunek jednostronny, FK restrict odcina historię od mutowalnego planu.
- **Konstelacja płatności** (silnie sprzężona): 13 Płatności zasila 14 Bramkowanie
  (status→dostęp), a 3 Ambasadorzy i 1 Tożsamość wyzwalają w niej kaskady
  (dezaktywacja, usunięcie konta). Kwota wchodzi seamem z zaproszenia (1→13).
- **Generyki wspierające** (współdzielone, cienki interfejs): 15 Pliki (3 konsumentów:
  4/8/9), 16 Google (ACL nad 10), 17 Notyfikacje (missing, krzyżuje 1/10/13).
- **Fork copy-on-write** to WEWNĘTRZNY szew bibliotek (4/5), nie poddomena —
  mechanizm własności, nie odrębna odpowiedzialność problem-space.

### Decyzje graniczne (A–I) i ich rozstrzygnięcie

| ID | Pytanie | Rozstrzygnięcie | Uzasadnienie |
|---|---|---|---|
| A | Ćwiczenia vs umiejętności/drzewo | **SPLIT** (#4 / #5) | Zamrożony kanon „dwa osobne światy" — granica językowa, nie techniczna. |
| B | Globalne vs własne (autoring) | **FOLD** w #4/#5 + fork jako szew | „Ćwiczenie/umiejętność" = jedno pojęcie; własność = atrybut wiersza, nie zmiana znaczenia. |
| C | Definicja struktury vs awans per-para | **SPLIT** (#5 / #6) | Graf raz definiowany, raz interpretowany — inny właściciel/rytm (F2 #5). |
| D | Marka: tenancy + governance | **SPLIT** (#2 / #3) — *decyzja właściciela* | Tenancy = Operator (seed out-of-band), governance = Prezes (w produkcie); różny aktor/rytm/intencja. Pierwotna przesłanka „jeden właściciel" była błędna. |
| E | Konsultacje + harmonogram | **FOLD** (#10) | Harmonogram = reguła generująca instancje wewnątrz jednego cyklu; szew reguła↔instancja i „termin" odnotowane do F5. |
| F | Analityka + Wrapped | **SPLIT** (#11 / #12) — *decyzja właściciela* | Diagnostyka trenera ⊥ retencja/gamifikacja podopiecznego (różny konsument/cel/rytm); „read-only" to cecha techniczna, nie odpowiedzialność. |
| G | Bramkowanie osobno | **OSOBNA** (#14) | Inaczej Płatności = „pobiera I bramkuje"; #14 przechodzi test jednego zdania czysto. |
| H | Relacja coachingowa trener↔podopieczny | **BEZ poddomeny — hot-spot** | Rozmyta po #1 (`trainer_id`) + #13 (subskrypcja) + zaproszenie; brak dedykowanego bytu w modelu — decyzja w F5. |
| I | Płatności: onboarding Connect vs subskrypcja | **FOLD** (#13) + szew wewn. | Dwa cykle o różnych właścicielach (trener⊥para) w jednym języku billingu; rozcięcie najwcześniej w F5. |

## Hot-spoty / otwarte pytania

Do rozstrzygnięcia w F5 (Connect) — F3 tylko je nazywa, nie projektuje granic:

1. **Shared Kernel: polimorficzne zaproszenie.** Jedna tabela `invites` / funkcja
   `createInvite` jest mechanizmem **1 Tożsamości**, ale niesie treść **3 Ambasadorów**
   (org+region) i **13 Płatności** (kwota trainee). Kandydat Shared Kernel / Published
   Language w F5.
2. **Shared Kernel: `archived_at` / „dezaktywacja".** To samo pole rządzi trzema
   poddomenami: no-op rotacji sesji (**1**), dezaktywacja ambasadora (**3**), gating
   (**14**). Granica dezaktywacji straddluje tożsamość i governance.
3. **Relacja coachingowa (H).** Para trener↔podopieczny (parowanie, roster, kwota
   początkowa) nie ma poddomeny-właściciela. F5 decyduje: osobny kontekst „relacja"
   czy świadome rozmycie po 1 + 13 + zaproszenie.
4. **Wewn. szew #10:** „termin" ma znaczenie zależne od aktora (podopieczny:
   zaproszenie-do-potwierdzenia; trener: slot-do-udokumentowania) — obok reguła↔instancja.
5. **Wewn. szew #13:** onboarding Connect trenera (właściciel: trener) ⊥ subskrypcja
   (właściciel: para) — dwa cykle w jednym języku billingu. Dodatkowo dwie powierzchnie
   zapisu: nasze komendy vs Customer Portal (z F2).
6. **Wewn. szew #5:** drabina wariantów (mikro) ↔ DAG prerekwizytów (makro); fork
   global→trener w #4/#5.
7. **Dom metryki „Progresja / Rekord (PR)":** przypisany do **11 Analityki
   diagnostycznej** (nośnik cockpitu/plateau); konsumują go **12 Retencja/Wrapped** i
   powierzchnia „Rozwój". Rozbieżne definicje PR w kodzie (F2 dług) — do faz architektury.

## Zmiany w glosariuszu

Dopisano blok **„Uzupełnienie — sesja F3 (2026-07-06)"**: (1) „Rozwój" = powierzchnia
prezentacyjna (JOIN Awans + Progresja), NIE poddomena; (2) nazewnictwo poddomen
chroni zamrożone hot-spoty (Progresja zarezerwowana dla #11 → #5 „Umiejętności i
drzewo", #6 „Awans"; „dostęp" rozdzielony: Tożsamość vs Bramkowanie); (3) nowy
hot-spot `archived_at`/„dezaktywacja" jako Shared Kernel 1↔3↔14; (4) dwuznaczność
„terminu" aktorska w #10. F3 nie wprowadza nowych bytów domenowych — reużywa kanonu.

## Stan i następny krok (handoff)

- **Ustalono:** domena pokryta **17 rozłącznymi, nazwanymi poddomenami**, każda z
  jednozdaniową odpowiedzialnością; **pełne pokrycie** osi F2 (0 sierot, zweryfikowane
  panelem krytyków); mapowanie zdarzenie→poddomena kompletne; luźne sprzężenia i
  wewnętrzne szwy odnotowane; 9 decyzji granicznych (A–I) rozstrzygniętych (D, F przez
  właściciela → SPLIT).
- **Otwarte (do F5):** dwa Shared Kernele (zaproszenie, `archived_at`), relacja
  coachingowa bez właściciela (H), wewnętrzne szwy #5/#10/#13 — wszystkie jako
  kandydackie granice kontekstów, nie do rozstrzygnięcia w F3.
- **Co czyta następna faza (F4 Strategize):** listę 17 poddomen + `01-…` (model
  biznesowy, wyróżnik) + glosariusz. F4 nakłada Core Domain Chart (złożoność ×
  różnicowanie), klasyfikuje core/supporting/generic i pisze Domain Vision Statement.
  Wskazani kandydaci na core: **5 Umiejętności/drzewo + 6 Awans** (kalisteniczny model
  progresji); pod rozwagę różnicująca **12 Retencja/Wrapped**.

> Domykając fazę: status w `README.md` (F3 ✅), wpisy w `glosariusz.md` oraz
> przepisanie `next-session-prompt.md` na fazę F4.
