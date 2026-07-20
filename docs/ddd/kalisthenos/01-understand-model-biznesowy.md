# F1 — Understand — model biznesowy kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-05
> **Krok DDD:** 1 Understand · **Zależy od:** —

Rekonstrukcja modelu biznesowego z istniejącego kodu i spec-ów (brownfield),
zwalidowana przez właściciela. Opisujemy stan, który **JEST**; wizję docelową
właściciela oznaczamy `PROPOZYCJA:`.

## Wejście (co przeczytano)

- Główny spec `docs/superpowers/specs/2026-05-23-kalisthenos-fullstack-v1-design.md`
  (§1 Goal & non-goals, §2 Audience & tenancy, §5 model danych, §15 backup/skala, §16 V2).
- Root `README.md`, `CLAUDE.md` (sekcja „Czym jest kalisthenos”).
- Przegląd tytułów wszystkich 26 spec-ów w `docs/superpowers/specs/`; pogłębiona
  lektura klastrów pod kątem modelu biznesowego (fan-out 8 agentów):
  - tożsamość/tenancy/marka: `app/lib/auth/`, `authz.ts`, `ambassadors.ts`,
    `app/routes/marka/`, schema `users/sessions/invites/organizations/regions`,
    specy `2026-06-07-tenancy-marki-fundament`, `2026-06-08-panel-prezesa-ambasadorzy`,
    `2026-06-07-i18n-multicurrency`;
  - katalog/umiejętności/drzewo: `catalog.ts`, `catalog-math.ts`, `brand-catalog.ts`,
    `skills.ts`, `skill-tree(-math).ts`, `skill-progression.ts`, specy `markowa-baza…`,
    `drzewo-umiejetnosci`, `umiejetnosci-progresja-wariantow`, `panel-prezesa-katalog…`;
  - plany/logowanie: `plans.ts`, `plan-types.ts`, `workouts.ts`, spec `toggle-rpe…`;
  - statystyki/Wrapped/progresja: `wrapped.ts`, `stats.ts`, `progression.ts`,
    komponenty `stat-widgets/trainee-stats/progression-*`, specy `modul-progresja`,
    `progresja-redesign`, `statystyki-redystrybucja`, `rozwoj-polaczenie…`;
  - zdjęcia sylwetki: `body-photos.ts`, `file-uploads.ts`, `files.ts`;
  - konsultacje/kalendarz: `consultation-status.ts`, `app/lib/google/`,
    specy `konsultacje-harmonogram-google`, `modul-konsultacji`;
  - płatności: `app/lib/stripe/*` (`connections.ts`, `subscriptions.ts`, `status.ts`,
    `access.ts`, `webhook.ts`), specy `platnosci-stripe`, `…onboarding`, `…redesign`,
    `…obowiazkowa-gating`;
  - przekrojowe/ops: specy `rate-limiting`, `observability`, `mobilna-powloka…`,
    `listy-sortowanie-filtrowanie`, `ai-dev-process`.
- **Silnik jakości:** fan-out czytający → synteza → adwersaryjna weryfikacja
  rekonstrukcji względem kodu/schematu (obalanie wyróżników i modelu przychodowego)
  → checkpoint i walidacja właściciela (odpowiedzi na 8 pytań, 3 potwierdzenia).

## Ustalenia

### Kompas (sens biznesu — kryterium przejścia)

kalisthenos to opinionated, polsko- (i od niedawna francusko-) języczna aplikacja
webowa do współpracy **trener ↔ podopieczny** w kalistenice, która przechodzi z
narzędzia dla jednego trenera w **platformę jednej marki z siecią ambasadorów**
(marka → trenerzy-ambasadorzy → podopieczni). Rdzeniem wartości jest **pętla
coachingowa**: trener autorsko buduje katalog (ćwiczenia, drabiny wariantów,
drzewo/DAG prerekwizytów) i wersjonowane plany; podopieczny loguje trening
seria-po-serii (reps, trudność 1–10/RPE, opcjonalne wideo), wrzuca zdjęcia
sylwetki, ogląda „Rozwój" (drzewo umiejętności + rekord w czasie) i miesięczny
„Wrapped"; trener diagnozuje realizację z cockpitu. Strategicznym wyróżnikiem jest
**kalisteniczny model progresji** (drabiny wariantów + drzewo/DAG prerekwizytów, z
**trenerem w pętli i awansem zawsze ręcznym**) spięty z relacją trener↔podopieczny —
czego nie ma ani generyczny coaching wagowy, ani self-serve apki kalisteniczne.
Monetyzacja jest realna, ale pośrednia względem rdzenia: **podopieczny płaci
trenerowi** cykliczny miesięczny abonament przez Stripe Connect (destination
charges), platforma jest merchant-of-record z **dziś zerową prowizją**, a dostęp
podopiecznego jest **architektonicznie bramkowany opłaconą subskrypcją**. Całość
utrzymywana w posturze **solo-operatora** (jedna instancja Railway, jeden rachunek,
świadoma minimalizacja złożoności).

### Persony i jobs-to-be-done

**1. Prezes marki** — rola `brand_admin`; właściciel marki nad trenerami
(`organization_id`, `region_id NULL`, `trainer_id NULL`). W UI/produkcie „prezes",
w kodzie/enumie `brand_admin`. Przy jednej marce = właściciel produktu (Mateusz).
- Zarządzać siecią **ambasadorów**: dodać trenera linkiem zaproszenia, ocenić wynik
  (aktywni podopieczni, logi 7/30 dni, MRR), wstrzymać/reaktywować — bez dotykania haseł.
- Autorsko utrzymywać **kanon marki** (markowe ćwiczenia/umiejętności/drzewo) org-scoped,
  by ambasadorzy startowali z gotowej bazy „dnia pierwszego”.
- *(dziś operator/seed, nie panel prezesa — „Regiony/Ustawienia wkrótce”):* obsłużyć
  wiele krajów jedną instancją (język+waluta z regionu).

**2. Trener / Ambasador** — rola `trainer`; autor wartości i **odbiorca pieniędzy**;
**faktyczna granica izolacji danych** (`trainer_id` na każdej tabeli domenowej).
W UI „ambasador” pod marką, w kodzie zawsze `trainer`. Główny użytkownik desktop-first.
- Dołączyć do marki samodzielnie linkiem i od razu prowadzić własnych podopiecznych.
- Zamodelować progresję jako drabiny wariantów + drzewo/DAG prerekwizytów; dostać
  markową bazę i forkować ją („Dostosuj”, copy-on-write) bez psucia innym.
- Ułożyć i opublikować **wersjonowany plan** (draft→active→archived), iterować
  v(n+1) z v(n) bez utraty historii.
- Realnie pobierać indywidualny miesięczny abonament (pieniądze wprost na własne
  konto Stripe), łącząc Stripe raz i nie dotykając danych kart.
- Prowadzić cykliczne **konsultacje 1:1** z punktami „do poprawy” (open/resolved),
  opcjonalnie auto-Meet + mailowe zaproszenie.
- Diagnozować podopiecznego z **cockpitu** (gotowość, plateau, adherence planu,
  coverage wideo/zdjęć).

**3. Podopieczny** — rola `trainee`; **płatnik** i jedyny autor danych treningowych;
adresat instalowalnej powłoki PWA (mobile-first). Dziedziczy organizację trenera
(`region_id NULL`), scope po `trainer_id`.
- Zalogować trening seria-po-serii (reps, trudność 1–10, opcjonalne wideo,
  „nie skończyłem”) wygodnie kciukiem z telefonu w gymie.
- Widzieć aktualny plan i co już wykonał; dokumentować progres sylwetki (przód/bok/tył,
  before/after).
- W 2 s wiedzieć „czy rosnę” (rekord w czasie) + drzewo umiejętności + miesięczny „Wrapped”.
- Opłacić abonament kartą i zarządzać nim (portal); reagować na terminy konsultacji.

**4. Właściciel / Operator (Mateusz)** — solo-ops poza produktem: git, docker,
migracje, deploy (Railway); Claude kończy handoffem. Bootstrapuje tenancy przez seed
(organizacja, region PL, konto prezesa, promocja katalogu założyciela do marki).
Jedyny „zespół ops” i odbiorca observability (stdout JSON) oraz backupów.

### Źródła wartości

1. **Rdzeń — pętla trener↔podopieczny**: trener układa wersjonowany plan → podopieczny
   loguje wykonanie seria-po-serii → trener widzi realizację. Bez tego produkt nie ma
   powodu istnieć.
2. **Kalisteniczny model progresji**: drabiny wariantów (tuck→…→full) + drzewo/DAG
   prerekwizytów z **trenerem w pętli** (awans ręczny) — jawnie postawiony rdzeń wyróżnika.
3. **Gamifikacja / retencja podopiecznego**: growe drzewo (4 stany węzła), „Wrapped”
   (silnik 9 archetypów, PR-y, porównanie miesięcy), streak/heatmapa/balans RPE.
4. **„Rozwój”**: scalenie osi **ilościowej** (rekord w czasie) z **jakościową**
   (drabina/drzewo wariantów) w jednej powierzchni.
5. **Narzędzie diagnostyczne trenera**: cockpit gotowości/plateau/adherence/coverage —
   uzasadnia opłacanie platformy i redukuje churn.
6. **Markowa baza „dnia pierwszego”** (~40 ćwiczeń / ~10 umiejętności) — zdejmuje z
   ambasadora koszt ręcznego odtwarzania biblioteki (silnik aktywacji trenerów).
7. **Konsultacje 1:1 + punkty „do poprawy”** + narzucony cykliczny rytm — trwałość
   ustaleń i lepkość relacji.
8. **Zdjęcia sylwetki** (przód/bok/tył, before/after) — widoczny progres wizualny.
9. **Dopracowana mobilna powłoka PWA** (one-thumb, instalowalna) + markowa
   wielojęzyczność/wielowalutowość jako dźwignia ekspansji.

### Model przychodowy (zweryfikowany 1:1 z kodem)

- **Kto komu płaci:** podopieczny → trener; indywidualna miesięczna kwota
  (`amount_grosze`, ustala trener — także z góry przy zaproszeniu).
- **Mechanizm:** Stripe Connect Express, **destination charges** — Customer i Price na
  koncie **platformy**, subskrypcja z `transfer_data.destination` = connected account
  trenera; pieniądze trafiają wprost do trenera.
- **Rola platformy:** **merchant-of-record** (brak `on_behalf_of` w całym `app/`;
  „osobistość trenera” realizowana wyłącznie przez copy „Prowadzenie treningowe — {trener}”).
- **Prowizja platformy = 0** dziś (`application_fee_percent: 0` w `subscriptions.ts:160`,
  komentarz „gotowe na później”) → czysty **pass-through**.
- **Płatność = dostęp:** gating panelu podopiecznego (statusy dające dostęp:
  `active`, `paused`, `past_due`-grace), ale **tylko gdy płatność realnie możliwa**
  (Stripe skonfigurowany + `chargesEnabled` + kwota); inaczej pełny dostęp.
- **Zgodność:** brak danych kart u nas (Checkout/Portal Stripe), SCA/3DS przez Checkout,
  dunning (Smart Retries). Jedna subskrypcja na parę (podopieczny ma jednego trenera).
- **Ograniczenie:** waluta rozliczenia **zahardkodowana na PLN** (`subscriptions.ts:70`
  tworzy Price z `currency:'pln'`); `regions.currency='eur'` / `coaching_subscriptions.currency`
  **nie są spięte** z realnym obciążeniem → billing w EUR nie działa.
- `PROPOZYCJA:` (docelowy przychód platformy) — **prowizja ~5% od trenera**
  (uzasadnienie właściciela: automatyzujemy trenerowi pracę „o ~300%”, więc ~5% z jego
  zarobków nie boli), realizowana przez `application_fee_percent > 0`. Pole jest już w
  kodzie (dziś 0). Właściciel oznaczył to jako **rewidowalne** („mogę się mylić”).

### Cele

**Real:**
- dostarczyć rdzeń współpracy (wersjonowane plany + logowanie seria-po-serii + wgląd trenera);
- uczynić kalisteniczny model progresji czytelnym wyróżnikiem względem coachingu wagowego
  i self-serve apek;
- utrzymać i zaangażować podopiecznego (Wrapped, Rozwój, zdjęcia, konsultacje, PWA one-thumb);
- zmonetyzować przez subskrypcje Stripe Connect z dostępem bramkowanym płatnością;
- (kierunkowo) przekształcić narzędzie 1-trenera w **platformę jednej marki** z siecią
  ambasadorów, z regionami/walutami/językami;
- bezkosztowy onboarding ambasadorów (markowa baza + samodzielne dołączenie linkiem);
- solo-operator SaaS: minimalny koszt i złożoność;
- integralność historyczna jako aktywo (logi nigdy twardo nie kasowane, plany z logami
  tylko archiwizowane).

`PROPOZYCJA:` (część modelu, dziś niezbudowana): monetyzacja platformy (prowizja > 0),
realne obciążanie w EUR (region FR), region jako zarządzalna jednostka organizacyjna.

**Świadome non-goals** (część modelu, nie braki): brak offline-sync, brak automatycznego
awansu i twardych bramek prerekwizytów, brak stref czasowych per użytkownik (v1).

### Wyróżnik vs commodity (po korekcie adwersaryjnej)

| Kandydat | Werdykt | Pewność |
|---|---|---|
| **Kalisteniczny model progresji: drabiny + DAG prerekwizytów, trener w pętli, awans zawsze ręczny** | **rdzeń, w pełni ugruntowany** (awans zawsze `advancedBy: trainerId`) | wysoka |
| „Rozwój”: scalenie osi ilościowej + jakościowej | real, ale **warstwa prezentacji** nad 2 zbiorami danych — słabszy moat | wysoka→średnia |
| Nisza kalistenika + rozdzielony UX (desktop trener / mobile-PWA podopieczny) | real jako stanowisko; „PL-first” **nieaktualne** (już pl/fr); podział ról to konwencja, nie bariera | średnia |
| Growe drzewo umiejętności (gamifikacja) | **ta sama implementacja** co rdzeń, pokazana wizualnie — nie liczyć podwójnie | średnia |
| „Wrapped” (9 archetypów, PR-y, porównanie miesięcy) | dopracowane, ale **gatunkowo standardowy, kopiowalny** mechanizm retencji | średnia |
| Wersjonowany cykl planu + logowanie seria-po-serii | real, egzekwowany w DB — ale bliżej **table-stakes** coachingu niż moatu | średnia |
| Platforma marki (markowy katalog copy-on-write, kaskada dezaktywacji, regiony/waluty) | **maszyneria real, efekt aspiracyjny**: monetyzacja marki = 0, billing EUR niepodpięty, FR region zaseedowany ale pusty | średnia |

**Commodity („musi tylko działać”):** auth/sesje/Argon2id · CRUD samej biblioteki
ćwiczeń · persystencja planu · serwowanie plików (HMAC) · lightbox zdjęć · rdzeń Stripe
(Checkout/Portal/webhooki/dedup/dunning) · integracja Google Calendar/Meet · podstawowe
statystyki (streak/heatmapa) · wykresy visx · cockpit trenera poza plateau · infra ops
(rate-limit fail-open, observability stdout, listy sort/filter) · mechanika i18n ·
prowizja platformy (dziś 0).

### Decyzje właściciela (walidacja F1)

1. **Przychód platformy** → `PROPOZYCJA:` prowizja ~5% od trenera (`application_fee_percent`);
   rewidowalne.
2. **Marka** → **jedna globalna marka (singleton)**; bez white-label/franczyzy.
   Skutek: `brand_admin` tworzony tylko seedem (nie zaproszeniem) — **nie jest luką**,
   bo nigdy nie „zaprasza się” nowej marki.
3. **Tenant = marka** jako **korzeń hierarchii** (właściciel kanonu + docelowy beneficjent
   prowizji). Przy jednej marce marka **nie jest granicą izolacji danych** — izolacja
   między trenerami nadal przez `trainer_id`. „Multi-tenant” w kodzie = realnie
   **multi-*trener* w obrębie jednej marki**; `organization` to korzeń i future-proof.
4. **Podopieczny ma dokładnie jednego trenera** (twardy invariant: jedna para = jeden
   plan/harmonogram/subskrypcja).
5. **Region** dziś = **język + waluta**; `PROPOZYCJA:` może urosnąć w **zarządzalną
   jednostkę organizacyjną per język** (pogłębienie hierarchii marka → region → trenerzy).
6. **~50 użytkowników** = **próg backupu/skalowania plików** (główny spec §15/§16),
   nie sufit biznesowy. Cała rama „2 users / V1” tego spec-u jest nieaktualna (billing,
   marka, i18n dostarczone).
7. **Zdjęcia sylwetki trzymamy u siebie** (FileStorage/wolumen). Obowiązek zgody/retencji/
   gwarantowanego usunięcia zostaje po naszej stronie (administrator + host); serwis 3rd-party
   NIE zdjąłby obowiązku RODO. **Osierocony blob** przy błędzie I/O = otwarty punkt do domknięcia.
8. **Awans na drabinie zawsze ręczny** (decyzja trenera — „trener w pętli” to intencja).
   **Prerekwizyty = miękka podpowiedź**, nie twarda bramka.

### Granica real ↔ aspiracja (kluczowe dla dalszych faz)

- **Real:** rdzeń coachingu (plany/logi/wgląd), model progresji z ręcznym awansem,
  gamifikacja/retencja, monetyzacja podopieczny→trener (destination charges, MoR, gating),
  maszyneria tożsamości/katalogu marki, formatowanie kwot per locale, zaseedowany FR + 20 słowników FR.
- **Aspiracja (`PROPOZYCJA:`, część modelu — nie luka):** prowizja platformy (>0),
  realne obciążanie w EUR (billing niepodpięty, Price hardkoduje PLN), region FR
  zaseedowany-ale-pusty (wszyscy trenerzy → PL), region jako jednostka zarządcza,
  udostępnialny Wrapped/odznaki, `on_behalf_of` (strukturalna „osobistość trenera”).

## Hot-spoty / otwarte pytania

**Rozstrzygnięte w walidacji F1:** tenant=marka-korzeń (nie druga oś izolacji) · jedna
marka (bez white-label) · jeden trener na podopiecznego · awans zawsze ręczny +
prerekwizyty miękkie · region dziś=kraj (może urosnąć) · ~50 to próg backupu · zdjęcia u nas.

**Wciąż otwarte (do faz dalszych / architektury):**
- Dokładny **% prowizji platformy** i moment włączenia (dziś 0; ~5% jako intencja, rewidowalne).
- **Spięcie billingu z walutą** (EUR) — dług przed realnym rozliczaniem w regionie FR.
- **VAT / e-faktury jako MoR w PL/EU** — potwierdzenie z księgową/prawnikiem (poza implementacją).
- **RODO zdjęć sylwetki** — zgoda/retencja/gwarantowane usunięcie + osierocony blob.
- Obietnice spec-ów **niezbudowane**: okno edycji logu 24h + lock, zdenormalizowane liczniki
  sesji (`total_sessions`/`last_session` liczone dziś on-the-fly) — czy nadal cel?
- **Udostępnialny Wrapped/odznaki** jako kanał wzrostu (viralowy) — czy w planach?
- **Metody płatności** poza kartą (BLIK/P24) dla auto-recurring — trwała decyzja karta-only?
- **`on_behalf_of`** w przyszłości (czyj przychód/faktura wobec VAT i zwrotów)?

**Językowe hot-spoty** — **wszystkie 13 ROZSTRZYGNIĘTE 2026-07-05** (interaktywna sesja z
właścicielem). Patrz **Aneks A** niżej + `glosariusz.md` (sekcja „Rozstrzygnięcia kanoniczne”
i statusy w „Hot-spoty językowe”).

## Zmiany w glosariuszu

Do `glosariusz.md` dopisano ~40 terminów ubiquitous language (wprowadzone w F1) oraz
13 hot-spotów językowych. Kluczowe: Marka/Organizacja, Region, Prezes marki=brand_admin,
Trener=ambasador, Tenant-scope (trainer_id), Efektywny katalog, Fork/„Dostosuj”, Umiejętność,
Wariant, Drabina wariantów, Drzewo/DAG prerekwizytów, Stan węzła, Plan/wersja, Status planu,
Blok (single/superset/dropset), RPE/Trudność/tracks_rpe, Log treningu/allDone, Pominięta seria,
Rozwój, Progresja (time-series), best/rekord (PR), Wrapped, Archetyp, Plateau, Sylwetka,
before/after, Podpisany URL, Konsultacja, Harmonogram/Termin, Punkt „do poprawy”,
destination charges, Merchant-of-record, coaching_subscription/amount_grosze, Gating/hasAppAccess,
paused/pause_collection, Lustro statusu, application_fee_percent, PWA/Fail-open, Non-goals/„V2”.

## Stan i następny krok (handoff)

- **Ustalono:** biznes to platforma **jednej marki** dla współpracy trener↔podopieczny w
  kalistenice; rdzeniem i wyróżnikiem jest **kalisteniczny model progresji z trenerem w
  pętli** (awans ręczny); przychód dziś płynie **podopieczny→trener** (Stripe destination
  charges, gating płatnością), a **prowizja platformy jest docelowa (`PROPOZYCJA:` ~5%)**,
  nie zbudowana. Tenant = marka jako korzeń, ale izolacja danych = `trainer_id`.
- **Otwarte:** dokładny model przychodu platformy, billing walutowy, RODO zdjęć, kilka
  niezbudowanych obietnic spec-ów (patrz hot-spoty).
- **Co czyta następna faza (F2 Discover) z tego artefaktu:** persony i ich JTBD (aktorzy osi
  zdarzeń), rdzeń/wyróżnik (gdzie szukać pivotal events), granica real↔aspiracja (nie modeluj
  zdarzeń z niezbudowanych obietnic), **kanoniczny słownik z Aneksu A** (używaj go nazywając zdarzenia).

## Aneks A — kanoniczne terminy (rozstrzygnięcie hot-spotów, 2026-07-05)

Interaktywna sesja z właścicielem rozwiązała wszystkie 13 hot-spotów językowych z F1.
**Polityka nadrzędna:** kod = UI = **jeden termin domenowy**. Pełne uzasadnienia i tabela
w `glosariusz.md` (sekcja „Rozstrzygnięcia kanoniczne”). Skrót dla F2:

- **Marka / brand** (nie „organization”) · **Prezes marki** (nie `brand_admin`) ·
  **Trener** = byt, **„Ambasador”** = relacja trenera z marką (znaczenie per kontekst).
- **Biblioteka ćwiczeń** + **Biblioteka umiejętności** (dwa światy, markowe ∪ własne);
  „katalog” wycofane, „efektywny katalog” → **„efektywna biblioteka”**; **Drzewo umiejętności**
  = struktura nad Biblioteką umiejętności. Bootstrap `promoteTrainerCatalogToBrand` → **do usunięcia**.
- **Sesja** = element planu (dzień, np. Push/Pull/Legs) · **Trening** = zarejestrowane wykonanie
  Sesji (`workout_log`).
- **Progresja** = rekord w czasie (oś ilościowa) · **Awans** = przejście na wyższy wariant/umiejętność
  (oś jakościowa, zawsze ręczny) · **Rekord (PR)** = metryka postępu · **Rozwój** = powierzchnia łącząca obie.
- **Konsultacja** = całe spotkanie 1:1 (cały cykl) · **Harmonogram** = reguła cykliczności ·
  **termin** = data konsultacji.
- **Kwota** → `amount_minor` (walutowo-neutralne) + waluta; „grosze” wycofane. **Subskrypcja =
  źródło prawdy kwoty** (invite = wartość początkowa).
- **Anulowanie rozdzielone:** subskrypcja **anulowana** (ręcznie) vs **wygasła** (po dunningu);
  konsultacja **odrzucona** (podopieczny) / **odwołana** (trener) / **pominięta** (termin w serii).
- **Region** = termin kanoniczny (dziś kraj; `PROPOZYCJA:` docelowo jednostka zarządcza).
- **Stany węzła** = EN enum + zamrożone PL etykiety (opanowane / w toku / gotowe do startu / zablokowane).
- **Prywatność zdjęć sylwetki** = **owner-scoped** (podopieczny-właściciel + jego trener;
  `PROPOZYCJA:` do egzekwowania w reimplementacji).
