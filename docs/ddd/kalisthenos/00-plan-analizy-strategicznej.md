# Plan analizy strategicznej DDD dla kalisthenos

> **Status:** F0 zatwierdzone · **Data:** 2026-07-05
> **Metodyka:** [`../strategic-ddd-flow.md`](../strategic-ddd-flow.md) (kroki 1–7)
> **Ten plik jest instrukcją obsługi całego wysiłku.** Każda kolejna rozmowa
> (faza) zaczyna od przeczytania go razem z [`README.md`](README.md) (tablica
> statusu) i [`glosariusz.md`](glosariusz.md).

---

## 1. Po co to robimy (kontekst i cel)

Obecna aplikacja kalisthenos to bogaty, wysokiej jakości **prototyp „vibe-coded"
w ~5 dni** — pełny produkt (28 tabel, 26 spec-ów projektowych, trzy role,
multi-tenant), ale zbudowany szybko i bez świadomej analizy strategicznej.
Właściciel chce teraz **zbudować system pełnoprawnie** — m.in. oddzielić backend
od frontendu (dziś to fullstack React Router v7, SSR, bez osobnego API).

Ta analiza dostarcza **fundament strategiczny** pod tę reimplementację: nazywa
model domeny, który *już jest* zaszyty w kodzie i spec-ach, i porządkuje go wg
DDD. Istniejący system traktujemy jak **wykonywalną specyfikację / odkrytą
domenę** (brownfield, wejście „Assess the IT Landscape").

**Cel wiodący:** zrozumieć i udokumentować obecny stan strategicznie
(reverse-engineering modelu), z myślą o przyszłej pełnoprawnej implementacji.

## 2. Zakres — co robimy, a czego nie

- **Robimy: kroki 1–7** playbooka (Understand → Discover → Decompose →
  Strategize → Connect → Organise → Define). Koniec na wypełnionych **Bounded
  Context Canvas per kontekst** (krok 7) + syntezie.
- **NIE robimy (osobny, późniejszy wysiłek):**
  - krok 8 / DDD taktyczne (agregaty, encje, value objects, domain events),
  - konkretnej architektury backendu (moduły/serwisy/API) i samego podziału
    BE/FE — to weźmie artefakty tej analizy (zwłaszcza Context Map z F5 i kanwy
    z F7) jako **wejście**, ale jest poza tym planem.

## 3. Kluczowe decyzje (zamrożone w F0)

| Decyzja | Wybór |
|---|---|
| Charakter | Brownfield — reverse-engineering z istniejącego systemu |
| Koniec zakresu | Krok 7 (Bounded Context Canvas per kontekst) + synteza |
| Ziarno faz | **Maksymalnie drobne** — jedna rozmowa na krok; krok 7 = jedna rozmowa NA kontekst |
| Model współpracy | Ja rekonstruuję z kodu+spec-ów → przedstawiam → właściciel waliduje i dokłada osąd biznesowy |
| Lokalizacja artefaktów | `docs/ddd/kalisthenos/` (override domyślnego `docs/superpowers/specs/`) |
| Język | Polski + angielskie terminy DDD (ubiquitous language branży) |

## 4. Zasady prowadzenia (przeczytaj przed KAŻDĄ fazą)

1. **Modeluj z ekspertem, nie o ekspertze.** Warsztaty DDD (EventStorming,
   Domain Storytelling) są kolaboratywne. Nie mamy sali z ekspertami — więc
   **kod + spec-y są „odkrytą domeną", a właściciel jest ekspertem domenowym**,
   który waliduje rekonstrukcję i dokłada intencję, której w kodzie nie widać
   (zwłaszcza w F1 i F4). To adaptacja, nie skrót — nazywaj ją wprost.
2. **Mapuj istniejący teren, zanim zaproponujesz docelowy** (Evans, krok 5.4).
   Opisujemy to, co JEST. Propozycje „jak powinno być" trzymamy osobno i jawnie
   oznaczone jako propozycja, nie ustalenie.
3. **Nie zamrażaj bez walidacji.** Artefakt jest `DRAFT`, dopóki właściciel nie
   powie „OK" → wtedy `ZWALIDOWANY`.
4. **Iteruj.** Jeśli w późniejszej fazie okaże się, że wcześniejszy artefakt jest
   błędny — wróć i popraw go (i odnotuj w tablicy statusu). Flow jest
   ewolucyjne, nie wodospadowe.
5. **Hot-spoty to skarb.** Gdzie kod jest niejednoznaczny, sprzeczny albo gdzie
   „rwie się język" — zapisz jako hot-spot i wynieś do walidacji, nie zamiataj.
6. **Zawsze aktualizuj glosariusz i tablicę statusu** przy zamykaniu fazy.

## 5. Struktura folderu i artefaktów

```
docs/ddd/kalisthenos/
├── README.md                          ← żywy indeks + tablica statusu (czytaj PIERWSZE)
├── 00-plan-analizy-strategicznej.md   ← ten plan
├── glosariusz.md                      ← żywy ubiquitous language (aktualizuj co fazę)
├── SZABLON-artefaktu.md               ← szablon pojedynczego artefaktu fazy
├── 01-understand-model-biznesowy.md
├── 02-discover-mapa-zdarzen.md
├── 03-decompose-poddomeny.md
├── 04-strategize-core-domain-chart.md
├── 05-connect-context-map.md
├── 06-organise-wlasnosc-modulow.md
├── 07-define/
│   ├── README.md                      ← indeks kanw + status per kontekst
│   └── <nazwa-kontekstu>.md           ← jedna Bounded Context Canvas na plik
└── 08-synteza-model-strategiczny.md
```

Każdy artefakt trzyma się [`SZABLON-artefaktu.md`](SZABLON-artefaktu.md):
nagłówek ze statusem i datą, „Wejście" (co przeczytano), „Ustalenia", „Hot-spoty
/ otwarte pytania", „Zmiany w glosariuszu", „Stan i następny krok" (handoff).

## 6. Protokół handoff (jak łączą się rozmowy)

**Pałeczka sztafetowa — [`next-session-prompt.md`](next-session-prompt.md).**
Ten plik zawsze opisuje **najbliższą fazę do zrobienia**. W nowej rozmowie
właściciel **@-wspomina go** (lub wkleja treść) — i to wystarczy, żeby
kontynuować. Utrzymanie tego pliku jest **obowiązkiem Claude**: pod koniec każdej
fazy Claude **sam wykrywa, że faza jest ukończona** (spełniona definicja „done")
i przepisuje `next-session-prompt.md` na fazę następną. Właściciel nie musi nic
komponować.

**Start fazy:**
0. Najprościej: właściciel @-wspomina [`next-session-prompt.md`](next-session-prompt.md)
   — mówi, którą fazę wykonać i co przeczytać. Kroki 1–4 poniżej i tak wykonaj.
1. Przeczytaj [`README.md`](README.md) (tablica statusu — gdzie jesteśmy).
2. Przeczytaj [`glosariusz.md`](glosariusz.md).
3. Przeczytaj artefakty faz, od których zależysz (kolumna „Zależy od" niżej).
4. Doczytaj tylko ten kod/spec, który wskazuje sekcja „Wejście" danej fazy —
   nie całość od zera.

**Koniec fazy (definicja „done"):**
- [ ] Artefakt zapisany wg szablonu, status `DRAFT`.
- [ ] Przedstawiony właścicielowi i **zwalidowany** → status `ZWALIDOWANY`.
- [ ] Glosariusz zaktualizowany o nowe/uściślone terminy.
- [ ] Tablica statusu w `README.md` zaktualizowana (status + data).
- [ ] Sekcja „Stan i następny krok" napisana (co ustalono, co otwarte, co dalej).
- [ ] **[`next-session-prompt.md`](next-session-prompt.md) przepisany na następną
  fazę** (dla F7: na następny kontekst, a po ostatnim — na F8).

## 7. Silnik jakości „bez głupot" (dla cięższych faz: F2, F5, F7)

Wewnątrz cięższych faz używamy orkiestracji wieloagentowej (workflow), by
rekonstrukcja była zweryfikowana, a nie „na oko":

1. **Fan-out czytający** — po jednym agencie na podsystem (patrz mapa niżej);
   każdy zwraca swój wycinek (zdarzenia / relacje / odpowiedzialności) w
   ustrukturyzowanym formacie.
2. **Synteza** — złożenie w jeden artefakt.
3. **Adwersaryjna weryfikacja** — osobni agenci próbują *obalić* rekonstrukcję
   względem faktycznego schematu/kodu (czy to zdarzenie realnie istnieje? czy ta
   relacja to naprawdę ACL, a nie Shared Kernel?). Przechodzi tylko to, co
   przeżyje.
4. **Checkpoint z właścicielem** — przedstawienie, korekta, dopiero potem
   „zamrożenie".

Lekkie fazy (F1, F3, F6) mogą iść bez pełnego fan-outu — liczy się rzetelna
lektura wejścia i walidacja.

## 8. Mapa podsystemów kalisthenos → wejście do lektury

Referencja dla fan-outu i sekcji „Wejście". Ścieżki potwierdź `Glob`/`Grep` w
danej fazie (repo żyje).

| # | Podsystem | Schemat (tabele) | Kod / spec (wskazówki) |
|---|---|---|---|
| 1 | Tożsamość i dostęp | `users`, `sessions`, `invites` | `app/lib/auth/`, `app/lib/authz.ts` |
| 2 | Multi-tenant / marka | `organizations`, `regions` | `app/lib/ambassadors.ts`, `app/routes/marka/`, spec `…tenancy-marki…` |
| 3 | Katalog ćwiczeń | `exercises`, `exerciseCategories` | `app/lib/catalog.ts`, `catalog-math.ts`, `brand-catalog.ts` |
| 4 | Umiejętności + drzewo | `skills`, `skillVariations`, `skillAdvancements`, `skillPrerequisites` | `app/lib/skills.ts`, `skill-tree.ts`, `skill-tree-math.ts` |
| 5 | Plany treningowe | `plans`, `planSessions`, `planBlocks`, `planItems` | spec „Plan editor and versioning", `app/routes/trener/` |
| 6 | Logowanie treningu | `workoutLogs`, `workoutExerciseLogs`, `workoutSetLogs` | spec „Workout logging behavior", `app/routes/podopieczny/` |
| 7 | Zdjęcia sylwetki | `bodyPhotos`, `files` | `app/lib/body-photos.ts`, `file-uploads.ts`, `files.ts` |
| 8 | Statystyki / Wrapped | (widoki nad logami/umiejętnościami) | `app/components/{stat-widgets,trainee-stats,progression-*}`, spec `…statystyki…`, `…progresja…` |
| 9 | Konsultacje + harmonogram | `consultationSchedules`, `consultations`, `consultationActionItems`, `googleCalendarConnections` | `app/lib/consultation-status.ts`, `app/lib/google/`, spec `…konsultacje…` |
| 10 | Płatności | `stripeConnections`, `coachingSubscriptions`, `subscriptionPayments`, `processedWebhookEvents` | `app/lib/stripe/`, spec `…platnosci-stripe…` |

## 9. Fazy — szczegółowy runbook

> Każda faza: **Zależy od · Cel · Wejście · Technika + adaptacja · Silnik
> jakości · Artefakt · Checkpoint · Kryterium przejścia.** To jest instrukcja,
> którą wykonuje rozmowa danej fazy.

### F0 — Plan i szkielet *(ZROBIONE w tej rozmowie)*
Artefakt: ten plan + `README.md` + `glosariusz.md` + `SZABLON-artefaktu.md` +
`07-define/README.md`. Aktualizacja `docs/ddd/README.md` i mapy w `CLAUDE.md`.

### F1 — Understand (zrozum biznes)
- **Zależy od:** —
- **Cel:** zorientować analizę wokół modelu biznesowego, użytkowników, celów i
  ograniczeń; wstępny „kompas" — co jest wyróżnikiem, a co „musi tylko działać".
- **Wejście:** `docs/superpowers/specs/2026-05-23-…-v1-design.md` (sekcje 1–2:
  Goal & non-goals, Audience & tenancy), root `README.md`, `CLAUDE.md` (sekcja
  „Czym jest kalisthenos”). Przegląd tytułów pozostałych spec-ów.
- **Technika + adaptacja:** Business Model Canvas / Wardley (lekko), destylacja
  ze spec-a. **Właściciel dokłada wizję** — model biznesowy w prototypie bywa
  domyślny, nie zapisany.
- **Silnik jakości:** lekki; rzetelna lektura + walidacja.
- **Artefakt:** `01-understand-model-biznesowy.md` — użytkownicy i ich
  „jobs-to-be-done", źródło wartości/przychodu, cele, ograniczenia
  (regulacje/integracje/legacy), wstępny wyróżnik.
- **Checkpoint:** właściciel potwierdza opis biznesu i wskazuje, co jest
  strategicznie ważne.
- **Kryterium przejścia:** jednym akapitem wiadomo, na czym polega biznes i co
  jest w nim ważne.

### F2 — Discover (odkryj domenę)  · CIĘŻKA
- **Zależy od:** F1
- **Cel:** odkryć „wielki obraz" domeny — zdarzenia w czasie, aktorów, procesy,
  hot-spoty i naturalne szwy (kandydackie granice).
- **Wejście:** wszystkie 10 podsystemów (mapa §8) — schemat `schema.ts` +
  odpowiednie `app/lib/*` + spec-y modułów.
- **Technika + adaptacja:** EventStorming Big Picture **zrekonstruowany z kodu**
  (zdarzenia w czasie przeszłym: „Plan opublikowany", „Seria zalogowana",
  „Subskrypcja opłacona"…). Właściciel waliduje i dokłada zdarzenia „ukryte”
  (procesy poza kodem).
- **Silnik jakości:** pełny fan-out (agent/podsystem) → synteza osi zdarzeń →
  adwersaryjna weryfikacja każdego zdarzenia względem schematu/kodu.
- **Artefakt:** `02-discover-mapa-zdarzen.md` — oś zdarzeń end-to-end, aktorzy,
  pivotal events, hot-spoty, kandydackie granice.
- **Checkpoint:** właściciel potwierdza przepływ i granice-kandydatów.
- **Kryterium przejścia:** widać spójny przepływ zdarzeń i „szwy”, gdzie rwie się
  język.

### F3 — Decompose (podziel na poddomeny)
- **Zależy od:** F2
- **Cel:** rozłożyć domenę na luźno powiązane, spójne poddomeny.
- **Wejście:** `02-discover-mapa-zdarzen.md` + glosariusz.
- **Technika + adaptacja:** grupowanie zdarzeń/procesów wg kohezji i granic
  językowych z F2. Test: opisać poddomenę jednym zdaniem bez „i”.
- **Silnik jakości:** średni; ew. weryfikacja rozłączności/pokrycia.
- **Artefakt:** `03-decompose-poddomeny.md` — lista poddomen z jednozdaniową
  odpowiedzialnością każdej; mapowanie zdarzenia → poddomena.
- **Checkpoint:** właściciel akceptuje podział i nazwy.
- **Kryterium przejścia:** domena pokryta rozłącznymi, nazwanymi poddomenami.

### F4 — Strategize (rdzeń / destylacja)
- **Zależy od:** F1, F3
- **Cel:** wskazać core / supporting / generic i strategię inwestycji.
- **Wejście:** `01-…`, `03-…`, glosariusz.
- **Technika + adaptacja:** **Core Domain Chart** (złożoność × różnicowanie).
  **Osąd biznesowy właściciela jest tu niezastąpiony** — co *naprawdę* nas
  wyróżnia (kandydaci: drzewo umiejętności/progresja? katalog markowy? relacja
  trener↔podopieczny?), a co jest generic (auth, płatności, kalendarz).
- **Silnik jakości:** średni; ja szacuję złożoność z kodu, właściciel dostarcza
  różnicowanie — rozmowa jest produktem.
- **Artefakt:** `04-strategize-core-domain-chart.md` — wykres z rozmieszczeniem
  poddomen, jawne core/supporting/generic, Domain Vision Statement (~1 akapit).
- **Checkpoint:** zgoda, co jest rdzeniem.
- **Kryterium przejścia:** każda poddomena ma typ i wynikającą strategię.

### F5 — Connect (context map)  · CIĘŻKA
- **Zależy od:** F3, F4
- **Cel:** wyznaczyć bounded contexty i opisać relacje między nimi.
- **Wejście:** poddomeny (F3) + kod pod kątem sprzężeń (FK w `schema.ts`,
  importy między `app/lib/*`, wspólne tabele/typy).
- **Technika + adaptacja:** procedura Evansa (4 kroki) + Domain Message Flow dla
  kluczowych use-case'ów. Wzorce relacji z katalogu (Partnership, Shared Kernel,
  Customer/Supplier, Conformist, ACL, OHS, Published Language, Separate Ways).
  **Nie zakładaj 1:1 poddomena↔kontekst.**
- **Silnik jakości:** pełny fan-out (agent/para kontekstów) → klasyfikacja
  wzorca → adwersaryjna weryfikacja względem realnego sprzężenia w kodzie.
- **Artefakt:** `05-connect-context-map.md` — lista bounded contextów +
  Context Map (wzorce + kierunek U/D) + diagramy przepływu komunikatów.
  **Tu ustala się liczbę kontekstów → liczbę rozmów F7.**
- **Checkpoint:** właściciel potwierdza konteksty i relacje.
- **Kryterium przejścia:** wszystkie konteksty nazwane, relacje sklasyfikowane.

### F6 — Organise (własność modułów)  · LEKKA, REFRAMED
- **Zależy od:** F5
- **Cel:** *(reframe dla solo/mały zespół)* — nie „zespoły ludzi”, lecz
  **granice własności modułów i cognitive load**: które konteksty to
  samodzielnie utrzymywalne/wdrażalne moduły, gdzie „x-as-a-service” vs ścisła
  współpraca. Wprost zasila przyszły podział backendu.
- **Wejście:** `05-connect-context-map.md`.
- **Technika + adaptacja:** Team Topologies zredukowane do granic modułów;
  reverse Conway jako „ustaw moduły, architektura podąży”.
- **Artefakt:** `06-organise-wlasnosc-modulow.md` — mapa kontekst → moduł +
  tryby zależności + uwagi o cognitive load i kandydatach na niezależne
  wdrożenie.
- **Checkpoint:** właściciel potwierdza granice własności.
- **Kryterium przejścia:** każdy kontekst ma właściciela-moduł i tryb zależności.

### F7 — Define (Bounded Context Canvas per kontekst)  · CIĘŻKA, WIELE ROZMÓW
- **Zależy od:** F4, F5, F6
- **Cel:** zaprojektować/udokumentować pojedynczy bounded context.
- **Zasada rozbicia:** **jedna rozmowa = jeden kontekst.** Kolejność: najpierw
  **core** (najwięcej uwagi), potem supporting; generic często dostają skróconą
  kanwę (bo je „kupujemy”). Lista i kolejność powstają po F5.
- **Wejście (per kontekst):** ten kontekst w Context Map (F5), jego klasyfikacja
  (F4), jego kod/tabele/spec-y.
- **Technika + adaptacja:** Bounded Context Canvas (Strategic Classification,
  model domenowy/ubiquitous language, odpowiedzialności, komunikaty
  in/out — komendy/zdarzenia/zapytania, zależności) — **wypełniana z kodu**,
  walidowana przez właściciela.
- **Silnik jakości:** agent wypełnia kanwę z kodu → adwersaryjna weryfikacja
  odpowiedzialności i interfejsu względem tras/repozytoriów.
- **Artefakt:** `07-define/<nazwa-kontekstu>.md` (jeden na kontekst) +
  aktualizacja `07-define/README.md`.
- **Checkpoint:** właściciel potwierdza kanwę danego kontekstu.
- **Kryterium przejścia:** dla każdego istotnego kontekstu istnieje kanwa.

### F8 — Synteza
- **Zależy od:** F1–F7
- **Cel:** spiąć całość w jeden spójny model strategiczny; kontrola spójności
  (czy klasyfikacje z F4 zgadzają się z kanwami F7, czy Context Map pokrywa
  wszystkie konteksty, czy glosariusz jest kompletny).
- **Wejście:** wszystkie artefakty.
- **Silnik jakości:** completeness-critic — agent szuka luk (nierozstrzygnięty
  hot-spot, kontekst bez kanwy, termin bez definicji).
- **Artefakt:** `08-synteza-model-strategiczny.md` — zwięzły „executive”
  przegląd modelu + lista otwartych decyzji przekazywanych do fazy architektury.
- **Checkpoint:** finalny review właściciela.
- **Kryterium przejścia:** model spójny i kompletny w zakresie kroków 1–7.

## 10. Powiązania

- Metodyka źródłowa: [`../strategic-ddd-flow.md`](../strategic-ddd-flow.md).
- Wejście domenowe: `docs/superpowers/specs/` (główny spec + 25 modułowych),
  `app/lib/db/schema.ts`, `app/lib/*`.
- Zasady utrzymania dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
