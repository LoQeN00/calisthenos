# Rozbicie kalisthenos na FE i BE — analiza DDD i projekt docelowy

**Data:** 2026-07-28
**Status:** zaakceptowany (etap 0 — analiza; nie zawiera planu implementacji)
**Metodyka:** [`docs/ddd.md`](../../ddd.md)

---

## 1. Driver i kryterium rozstrzygające

Rozbicie ma trzy powody, w tej kolejności ważności:

1. **Jedno stabilne API dla wielu klientów.** W ciągu roku powstaje aplikacja mobilna
   (React Native / Expo, iOS + Android). Web i mobile muszą jeść z tego samego talerza.
2. **Granice w kodzie.** Utrzymaniem zajmą się 2–3 osoby z podziałem FE / BE. Kontrakt
   między nimi staje się granicą organizacyjną, nie tylko techniczną — musi być formalny
   i wersjonowany.
3. **Niezależne skalowanie.** Horyzont 12–24 mies.: kilkudziesięciu trenerów, ~1000
   podopiecznych.

**Poza zakresem:** warstwa marki / organizacji. Model tenancy zostaje `trener → podopieczni`;
trener jest tenantem i nie przynależy do żadnej firmy ani marki.

**Kryterium rozstrzygające spory:** przy tej skali i tym zespole wygrywa rozwiązanie
prostsze w utrzymaniu. Eskalacja złożoności wyłącznie na dowód — konkretna reguła,
konkretny bug ze spójności, konkretne wymaganie. Nigdy „bo to core".

**Target: modularny monolit backendowy.** Jeden deployowalny backend z twardymi granicami
modułów. Mikroserwisy odrzucone — przy ~1000 użytkowników i 2–3 osobach koszt operacyjny
przewyższa zwrot, a dwie kluczowe transakcje w systemie (tworzenie zaproszenia z formularzem,
konsumpcja zaproszenia) są wielotabelowe i w monolicie zostają zwykłymi transakcjami zamiast
sag.

---

## 2. Inwentaryzacja (materiał wejściowy)

Stan wyjściowy — gałąź `feature/skill-tiers`:

| Wymiar | Stan |
|---|---|
| Trasy RR7 | **68 plików** (`app/routes.ts`), z czego 10 to przekierowania 301 (shimy po zmianach nawigacji) |
| Podział tras | 36 trener (`/trener/*`, desktop-first), 25 podopieczny (`/podopieczny/*`, mobile-first/PWA), 7 wspólnych |
| Tabele | **28** (`app/lib/db/schema.ts`), wszystkie domenowe niosą `trainer_id` |
| Migracje | 18, generowane przez Drizzle Kit |
| Warstwa domenowa | ~90 plików w `app/lib/` — repozytoria (dostęp do DB) oddzielone od czystej logiki (`*-math.ts`, `*-types.ts`, guardy) |
| Integracje wychodzące | Stripe Connect (Express, destination charges) + webhook; Google Calendar (OAuth2, sync best-effort) |
| Pliki | Wolumen na dysku za interfejsem `FileStorage`, URL-e podpisywane HMAC, streaming z obsługą `Range` |
| Auth | Własna: sesje w tabeli `sessions`, cookie `__Host-`, hasła Argon2id |

**Kluczowe odkrycie inwentaryzacji:** logika nie siedzi wyłącznie w `app/lib/`.
Konwencją repo jest wstrzykiwanie — trasa importuje `db` i przekazuje je jako pierwszy
argument funkcji `lib/*` — i to zostaje bez zmian. Przeciekiem jest co innego:
**43 zapytania budowane inline w 23 plikach tras** (m.in.
`trener/biblioteka.$exerciseId.tsx` — 4, `trener/_index.tsx` — 4,
`podopieczny/_layout.tsx` — 4, `trener/plany._index.tsx` — 3 wraz z CTE) oraz
**trzy transakcje otwierane bezpośrednio w akcjach** (`biblioteka.nowe.tsx`,
`biblioteka.$exerciseId.tsx`, `podopieczni._index.tsx`). Transakcje są tu istotniejsze niż
zapytania: transakcji nie da się rozciągnąć przez granicę HTTP, więc w fazie C nie miałyby
na co się przełożyć. To są miejsca, w których nie da się podmienić implementacji repozytorium
na klienta API bez wcześniejszego wydobycia kodu. Stąd faza A w rozdziale 12.

**Uwaga metodyczna:** loader/action nie jest 1:1 use case'em biznesowym. Loader RR7
zwykle agreguje dane z kilku miejsc — to model odczytu, nie endpoint domenowy. Ta
obserwacja jest fundamentem projektu kontraktu (rozdział 8).

---

## 3. Konteksty ograniczone, klasyfikacja subdomen i styl per moduł

Dwanaście kontekstów. Kolumna „styl" jest wiążąca — odstępstwo wymaga nowego ADR-a.

| # | Kontekst | Koszyk | Tabele | Styl |
|---|---|---|---|---|
| 1 | Tożsamość i dostęp | generic | `users`, `sessions` | transaction script |
| 2 | Biblioteka ćwiczeń | supporting | `exercises`, `exercise_categories` | CRUD |
| 3 | Plany treningowe | **core** | `plans`, `plan_sessions`, `plan_blocks`, `plan_items` | DDD taktyczne — agregat `Plan` |
| 4 | Dziennik treningowy | **core** | `workout_logs`, `workout_exercise_logs`, `workout_set_logs` | DDD taktyczne — agregat `WorkoutLog` |
| 5 | Umiejętności | **core (moat)** | `skills`, `skill_variations`, `skill_prerequisites`, `skill_advancements` | DDD taktyczne; postęp na strumieniu zdarzeń |
| 6 | Postęp i analityka | supporting | — (czyta 3, 4, 5) | CQRS — wyłącznie model odczytu |
| 7 | Konsultacje | supporting | `consultation_schedules`, `consultations`, `consultation_action_items` | DDD taktyczne — agregaty `Schedule` i `Occurrence` |
| 8 | Płatności | generic | `stripe_connections`, `coaching_subscriptions`, `subscription_payments`, `processed_webhook_events` | transaction script |
| 9 | Pliki i media | generic | `files` | transaction script + infrastruktura |
| 10 | Rejestracja i onboarding | supporting | `invites`, `onboarding_forms`, `onboarding_form_items` | transaction script |
| 11 | Zgłoszenia („Pomysły") | supporting | `feature_requests` | CRUD |
| 12 | Integracja Google | generic | `google_calendar_connections` | ACL |

### Uzasadnienia stylów

**Agregat `Plan` (3).** Maszyna stanów `draft → active → archived`, niezmiennik „jeden
aktywny plan na parę", tworzenie draftu jako deep-clone aktywnego, publikacja jako
operacja atomowa na całym drzewie. Cztery tabele zmieniają się wyłącznie razem — to
definicja agregatu, nie preferencja stylistyczna.

**Agregat `WorkoutLog` (4).** Atomowy zapis drzewa serii razem z przejęciem nagrań
(`assertOwnedUnclaimedVideos`) i detekcją nowych rekordów. Najgorętsza ścieżka zapisu
w systemie.

**Umiejętności (5) — kontekst rozdzielony na dwie części o różnych wymaganiach:**
- *Definicje* (`skills`, `skill_variations`, `skill_prerequisites`) — zwykły stan.
  Niezmienniki: acykliczność DAG prerekwizytów, „prerekwizyt nie z wyższego tieru",
  `UNIQUE(exercise_id)`. Wszystkie sprawdza się na stanie; przy event sourcingu trzeba by
  odtwarzać projekcję przed każdą walidacją, nic nie zyskując.
- *Postęp podopiecznego* (`skill_advancements`) — **event sourcing**. Uzasadnienie w
  rozdziale 6.

**Analityka (6) nie ma własnych tabel.** `stats.ts`, `progression.ts`, `wrapped.ts`,
`skill-progression.ts` to wyłącznie agregacje — zero zapisów, ciężkie zapytania, wiele
widoków tych samych danych. Podręcznikowa strona odczytu w CQRS.

**Konsultacje (7) — dwa agregaty.** `Schedule` (reguła cyklu + materializacja terminów,
idempotentna po `(schedule_id, scheduled_at)`) i `Occurrence` (maszyna stanów
`planned → confirmed / declined / change_requested → documented / cancelled`, z guardami
przejść). Guardy istnieją już jako czyste funkcje w `consultation-types.ts` i przenoszą
się do BE bez zmian.

**Siedem kontekstów świadomie dostaje CRUD albo transaction script.** To jest decyzja,
nie zaniedbanie — patrz ADR-007. Bez niej ktoś (człowiek albo agent) „poprawi" to
później na agregaty.

---

## 4. Ubiquitous language — miejsca, w których kod i język się rozjeżdżają

Najcenniejszy wynik event stormingu na istniejącym systemie.

**„Sesja" znaczy trzy różne rzeczy:**
- `sessions` — sesja logowania (kontekst 1),
- `plan_sessions` — jednostka treningowa w planie (kontekst 3),
- „sesja" potocznie = odbyty trening, czyli `workout_logs` (kontekst 4).

To granica kontekstu wykrzyczana wprost. W BE muszą to być trzy różne nazwy —
proponowane: `AuthSession` / `PlannedSession` / `WorkoutLog`. Ta dwuznaczność **nie może**
przeciec do kontraktu API, bo wtedy odziedziczy ją także aplikacja mobilna.

**„Konsultacja"** to raz reguła cyklu, raz pojedynczy termin. Kontrakt rozróżnia
`Schedule` i `Occurrence`.

**„Podopieczny"** to `User` w kontekście 1, `trainee_id` w kontekstach 3–7 i **płatnik**
w kontekście 8. Trzy modele tej samej osoby — granica Billing wobec reszty to ACL.

**„Rozwój"** to pojęcie UI, które scala dwa modele: progresję ćwiczeń (kontekst 6) i
umiejętności (kontekst 5). Model trzyma je osobno i tak zostaje; scalanie jest zadaniem
modelu odczytu, nie domeny.

**`trainer_id` pełni dwie role naraz:** jest granicą tenanta i domenowym kluczem obcym.
W `workout_logs` i `feature_requests` jest zdenormalizowany dla wydajności zapytań
trenera. W BE wyrażamy to jako jawny `TenantContext` wstrzykiwany przez guard, a nie jako
kolejny argument funkcji, o którym można zapomnieć.

---

## 5. Context map — relacje między kontekstami

| Od | Do | Typ relacji | Forma |
|---|---|---|---|
| Wszystkie | 1 Tożsamość | conformist | sync — `TenantContext` z guarda |
| 3 Plany | 2 Biblioteka | customer–supplier | sync — pozycje planu wskazują ćwiczenia |
| 4 Dziennik | 3 Plany | customer–supplier | sync — log powstaje z sesji planu |
| 4 Dziennik | 9 Pliki | customer–supplier | sync — przejęcie nagrania przy zapisie |
| 5 Umiejętności | 2 Biblioteka | customer–supplier | sync — wariant umiejętności to ćwiczenie |
| 2 Biblioteka | 5 Umiejętności | conformist | sync — blokada archiwizacji ćwiczenia będącego wariantem |
| 6 Analityka | 3, 4, 5 | conformist (read-only) | sync — zapytania odczytowe |
| 6 Analityka | 4 Dziennik | — | **zdarzenie domenowe** `WorkoutLogged` (unieważnienie cache) |
| 7 Konsultacje | 12 Google | **ACL** | async best-effort — nigdy nie blokuje operacji domenowej |
| 10 Onboarding | 2 Biblioteka | customer–supplier | sync — snapshot jednostki ćwiczenia |
| 10 Onboarding | 8 Płatności | customer–supplier | sync best-effort — kwota z zaproszenia |
| 8 Płatności | 1, 10 | **ACL** (bramka dostępu) | sync — `hasTraineeAppAccess` |
| Stripe (zewn.) | 8 Płatności | open host + published language | async — webhook z weryfikacją podpisu, idempotentny po `event.id` |

**Transakcje przecinające konteksty** — obie zostają w granicach jednego modułu dzięki
scaleniu zaproszeń i formularza startowego w kontekst 10:
- `createInvite` + `createOnboardingForm` — jedna transakcja,
- `consumeInvite` + `attachFormToTrainee` + ustawienie kwoty subskrypcji — jedna
  transakcja (kwota best-effort, poza transakcją, bo dotyka Stripe).

Nie ma potrzeby sagi ani outboxa między kontekstami domenowymi. Outbox rezerwujemy na
integracje zewnętrzne, jeśli best-effort okaże się niewystarczający.

---

## 6. Event sourcing — zakres i uzasadnienie

**Objęty: wyłącznie postęp podopiecznego w umiejętnościach** (`skill_advancements`).
Wszystko inne trzyma zwykły stan.

**Dlaczego akurat to.** `skill_advancements` już dziś jest strumieniem zdarzeń:
wiersz mówi „z wariantu A na wariant B, wtedy-a-wtedy", a bieżący poziom nie jest nigdzie
zapisany — `currentLevelFromEvents` wylicza go z najświeższego zdarzenia. `ON DELETE
RESTRICT` na `to_variation_id` już chroni historię. Formalizacja tego stanu rzeczy kosztuje
niemal nic i daje dokładnie to, czego wymaga produkt: odpowiedź na pytania „jaki był poziom
na dzień D" (filtr po znaczniku czasu) i „jak do tego doszedł" (odczyt strumienia).

**Reguły:**
- tabela **append-only** — żadnego `UPDATE` ani `DELETE`; wymuszone w BE **oraz**
  uprawnieniami w bazie,
- cofnięcie awansu to **zdarzenie kompensujące**, nie usunięcie wiersza,
- stan bieżący to projekcja liczona ze strumienia; zapis zdarzenia i odświeżenie projekcji
  mieszczą się w **jednej transakcji Postgresa**, więc nie wchodzi tu spójność ostateczna,
- **schemat zdarzeń wersjonowany od pierwszego dnia**: wolno dopisywać pola, nie wolno
  zmieniać znaczenia istniejących — przeszłości nie da się przepisać.

**Świadomie nieobjęte:**
- *definicje umiejętności* — „jak drzewo doszło do tego kształtu" nie ma wartości
  biznesowej; gdyby kiedyś pojawiła się potrzeba „kto zmienił drzewo", odpowiedzią jest
  zwykły audit log, nie przebudowa modelu;
- *dziennik treningowy* — już jest niezmiennym zapisem faktów; trening się wydarzył i się
  nie zmienia, więc temporal queries działają bez dodatkowej maszynerii;
- *reszta systemu* — globalny event sourcing wprowadziłby spójność ostateczną wszędzie,
  wymusił wersjonowanie schematów zdarzeń w każdym module i odebrał doraźny SQL do
  diagnostyki. Przy tym zespole i tej skali to koszt bez pokrycia.

**Zdarzenia domenowe to osobna sprawa od event sourcingu.** Wprowadzamy je szerzej — jako
sposób komunikacji między modułami NestJS (np. `WorkoutLogged`, `SkillAdvanced`,
`PlanPublished`). W monolicie mogą być in-process i synchroniczne w ramach transakcji;
tam, gdzie potrzebna jest niezawodność wobec systemu zewnętrznego — przez outbox.

---

## 7. Co realnie skaluje się niezależnie

Z drivera „niezależne skalowanie" wynikają dokładnie dwa miejsca:

1. **Pliki i media (9)** — po przejściu na Cloudflare R2 bajty w ogóle nie przechodzą
   przez backend (rozdział 9), więc problem przestaje istnieć zamiast być skalowany.
2. **Analityka (6)** — ciężkie agregacje, wiele widoków tych samych danych. Moduł ma być
   napisany tak, by dał się odpiąć jako osobny proces bez zmiany kontraktu: własne
   kontrolery, zero współdzielonego stanu w pamięci, wyłącznie odczyty.

Reszta systemu to lekkie zapytania OLTP i skaluje się przez zwiększenie liczby instancji
backendu — pod warunkiem spełnienia dwóch warunków z rozdziału 10 (Redis, storage obiektowy).

---

## 8. Kontrakt API

**Źródło prawdy: DTO z `class-validator` → OpenAPI → generowany klient TypeScript.**
Spec OpenAPI powstaje z dekoratorów (`@nestjs/swagger` + plugin CLI). Z niego generujemy
typowanego klienta publikowanego jako prywatny pakiet npm — ten sam dla weba i dla mobile.

*Konsekwencja przyjęta świadomie:* istniejące schematy Zod z `app/lib/*-types.ts`
przepisujemy na klasy DTO, a FE zachowuje własną walidację formularzy. Reguły wartości
(„tytuł 3–120 znaków") żyją więc w dwóch miejscach i mogą się rozjechać. Łagodzimy to tak,
że **typy** dla FE i mobile pochodzą wyłącznie z wygenerowanego klienta — kształty rozjechać
się nie mogą, a granice wartości i tak zawsze weryfikuje serwer.

**Dwie warstwy endpointów, jawnie rozróżnione w kontrakcie:**

- **Zasoby domenowe** — komendy i odczyty w granicach jednego kontekstu.
  Przykłady: `POST /v1/plans/{id}/publish`, `POST /v1/workout-logs`,
  `POST /v1/skills/{id}/prerequisites`, `PATCH /v1/consultations/{id}`.
  Wąskie, stabilne, zmieniane rzadko.
- **Modele odczytu pod ekran** — wolno im agregować przez konteksty i wolno im się zmieniać
  częściej. Przykłady: `GET /v1/trainees/{id}/dashboard`,
  `GET /v1/trainees/{id}/development`, `GET /v1/me/home`.

*Dlaczego modele odczytu są pełnoprawnym obywatelem kontraktu, a nie obejściem:* loader RR7
składa dziś ekran jednym zapytaniem do bazy. Gdyby po rozbiciu składał go z sześciu wywołań
REST, SSR dostałby sześć round-tripów — rozbicie pogorszyłoby wydajność, którą miało
poprawić. Mobile ma dokładnie ten sam problem, tylko na gorszej sieci.

**Prezentacja statusów należy do BE.** `consultation-status.ts` i `feature-request-types.ts`
mówią dziś, jaką etykietę i jaki „ton" ma mieć plakietka. Przy trzech repozytoriach
zostawienie tego w FE oznacza, że mobile zaimplementuje regułę drugi raz i statusy zaczną
wyglądać inaczej w aplikacji niż na webie. Modele odczytu zwracają gotowe `statusLabelKey`
+ `tone`; reguła żyje raz.

**Wersjonowanie:** `/v1` w ścieżce. Zmiany wyłącznie addytywne. Okno wycofania liczone
w miesiącach — aplikacja na cudzym telefonie żyje w starej wersji tak długo, jak użytkownik
zechce.

**Autoryzacja:** reguła „brak dostępu → **404**, nie 403" zostaje bez zmian (nie zdradzamy
istnienia zasobu). Tenant egzekwowany przez guard, nie przez dyscyplinę wywołań.

---

## 9. Uwierzytelnianie, sesja i pliki

### JWT z rotacją refresh tokenów

Backend jest właścicielem uwierzytelniania. Model:

- **Access token** — JWT, krótki czas życia (10–15 min).
- **Refresh token** — rotowany przy każdym użyciu, z **wykrywaniem ponownego użycia**
  (użycie zużytego tokenu unieważnia całą rodzinę). Przechowywany po stronie serwera
  (Redis + baza). Tabela `sessions` zmienia rolę: z magazynu sesji na magazyn refresh
  tokenów.
- **Rewokacja** — wylogowanie unieważnia refresh; „wyloguj ze wszystkich urządzeń"
  realizuje licznik wersji na użytkowniku, sprawdzany przy odświeżaniu.
- **Web:** oba tokeny w cookie `__Host-`, ustawianych przez BFF. RR7 czyta je na serwerze
  i woła API server-to-server — tokeny **nie trafiają do JavaScriptu w przeglądarce**.
- **Mobile:** SecureStore, nagłówek `Authorization: Bearer`.

*Koszt przyjęty świadomie:* natychmiastowa rewokacja, którą dziś daje sesja w bazie, znika
na czas życia access tokenu. Krótki TTL sprowadza okno do minut.

Hasła zostają na Argon2id, logowanie zachowuje dummy-hash (stały czas odpowiedzi).

### Pliki na Cloudflare R2

R2 jest zgodne z S3, więc podpisane URL-e wystawia sam storage: **bajty nie przechodzą
przez backend ani przy wysyłce, ani przy odczycie.**

- **Wysyłka:** klient prosi API o presigned PUT i wysyła plik prosto do R2. Backend nie
  widzi ani jednego bajtu wideo. Znika dzisiejsze wąskie gardło `/upload/wideo` i cała
  obsługa `Range` z `files/$fileId`.
- **Walidacja magic-bytes** przestaje być możliwa w locie. Rozwiązanie: po wysyłce klient
  woła `POST /v1/files/{id}/confirm`, backend pobiera z R2 pierwsze kilkaset bajtów
  obiektu (`Range`), sprawdza sygnaturę i dopiero wtedy oznacza plik jako potwierdzony.
  Niepotwierdzone obiekty sprząta ten sam mechanizm, który dziś zamiata sieroty
  (`orphan-files.ts`).
- **Odczyt:** presigned GET o krótkim TTL. Dzisiejsze kubełkowanie `exp`
  (`FILE_URL_BUCKET_SECONDS`) przenosimy jako regułę generowania URL-i, żeby adres pliku był
  stabilny w oknie i cache przeglądarki nadal działał.
- Interfejs `FileStorage` (`app/lib/storage/interface.ts`) już istnieje — to podmiana
  implementacji, nie przebudowa.

### Integracje zewnętrzne przenoszą się w całości do BE

- **Webhook Stripe** — weryfikacja podpisu na surowym body musi być tam, gdzie logika
  subskrypcji. Idempotencja po `event.id` (`processed_webhook_events`) bez zmian.
- **Callback OAuth Google** — zmiana `redirect_uri` w Google Console. Do checklisty
  wdrożenia.
- **Sekret HMAC** podpisywania URL-i plików — do BE.

---

## 10. Decyzje przekrojowe

**Redis jest wymagany, nie opcjonalny.** Rate limiting działa dziś w pamięci procesu
(`InMemoryRateLimitStore`). W momencie uruchomienia drugiej instancji backendu — czyli
w momencie realizacji drivera „niezależne skalowanie" — limit 10 prób logowania na 15 minut
staje się limitem 10 × liczba instancji. Redis przejmuje rate limiting oraz magazyn refresh
tokenów.

**Storage obiektowy jest warunkiem koniecznym skalowania poziomego**, nie ulepszeniem na
później: lokalny wolumen nie jest widoczny dla drugiej instancji.

**Wymuszanie granic modułów w CI.** Granice, których nie pilnuje narzędzie, są sugestią.
Konfiguracja reguł zależności (dependency-cruiser albo odpowiednik) w pipeline repo API:
moduł domenowy nie importuje wewnętrznych elementów innego modułu — wyłącznie jego publiczny
interfejs.

**Obserwowalność.** `logger.ts` (JSON-lines, whitelist pól błędu, nigdy `message`) przenosi
się do BE jako punkt wyjścia. Dochodzi identyfikator korelacji przekazywany z BFF do API,
żeby żądanie dało się prześledzić przez oba procesy.

**Idempotencja.** Dzisiejsze zabezpieczenia zostają i są warunkiem kontraktu: webhook Stripe
po `event.id`, materializacja terminów po `(schedule_id, scheduled_at)`, wysłanie formularza
startowego przez `SELECT … FOR UPDATE` + warunek w `WHERE`. Endpointy mutujące, które klient
może ponowić po zerwaniu sieci (zapis treningu), dostają nagłówek klucza idempotencji.

---

## 11. Repozytoria i pakiety

| Repo / pakiet | Zawartość |
|---|---|
| `kalisthenos-api` | NestJS, moduły domenowe, schemat i migracje (Drizzle), integracje: Stripe, Google, R2, Redis. **Jedyny właściciel bazy danych.** |
| `kalisthenos-web` | React Router v7 — SSR, PWA, warstwa BFF. Po cięciu zero dostępu do bazy. |
| `kalisthenos-mobile` | React Native / Expo (iOS + Android), EAS Build. |
| `@kalisthenos/api-client` | Pakiet publikowany z CI repo API: typy i klient wygenerowane z OpenAPI. Konsumowany przez web i mobile. |

**ORM zostaje Drizzle.** NestJS nie ma z nim problemu, a alternatywa oznacza przepisanie
28 tabel i porzucenie 18 istniejących migracji — czyli utratę historii schematu bazy
produkcyjnej przy okazji migracji, która i tak jest ryzykowna. `schema.ts` przenosi się do
repo API praktycznie bez zmian.

**Cena trzech repozytoriów, przyjęta świadomie:** zmiana kontraktu wymaga skoordynowanego
wydania dwóch (docelowo trzech) repozytoriów i publikacji pakietu. Nie ma narzędzia, które
to wymusi — pilnuje tego proces wydawniczy.

---

## 12. Fazy migracji

Konstrukcja przyrostowa, **wydanie jednym cięciem** (big bang cutover).

**Dlaczego szew, a nie odwaga.** Ryzyko big banga nie leży w tym, że backend powstaje naraz,
tylko w tym, że dziesiątki tras FE zmieniają się jednocześnie i nie ma czego wycofać po
kawałku. `app/lib/*` jest już naturalnym szwem — loadery wołają funkcje repozytoriów, nie
SQL. Jeśli te funkcje zostaną w FE jako fasady o **niezmienionych sygnaturach**, a podmienimy
wyłącznie ich ciała (Drizzle → klient API), cięcie staje się mechaniczne i sprawdzalne.

### Faza A — uszczelnienie szwu (obecne repo)

23 trasy przestają budować zapytania i otwierać transakcje — wszystko idzie przez fasady
`app/lib/*`. **Zero zmian zachowania** — chronione istniejącymi testami jednostkowymi,
integracyjnymi i Playwrightem. Bez tej fazy cięcie dotyka 23 tras, których nikt wcześniej
nie przećwiczył. Plan:
[`docs/superpowers/plans/2026-07-28-faza-a-uszczelnienie-szwu.md`](../plans/2026-07-28-faza-a-uszczelnienie-szwu.md).

### Faza B — budowa API (nowe repo)

Moduł po module, każdy z testami integracyjnymi na testcontainers (mechanizm już w projekcie
jest). Kolejność — od fundamentów, potem rosnąco po liczbie zależności:

1. **Platforma** — guard tenanta, auth (JWT + rotacja refresh), moduł plików (R2 +
   presigned + `confirm`), Redis, przeniesione migracje, szyna zdarzeń domenowych.
2. **Katalog ćwiczeń** — najprostszy CRUD; służy do przećwiczenia całej mechaniki
   end-to-end: kontrakt → generowany klient → test.
3. **Zgłoszenia „Pomysły"** — najmniej zależności w systemie, drugi przebieg mechaniki.
4. **Rejestracja i onboarding** — zaproszenia + formularz startowy; obie transakcje
   wielotabelowe wewnątrz modułu.
5. **Plany** (agregat).
6. **Dziennik treningowy** (agregat; zależy od planów i plików).
7. **Umiejętności** — definicje (DAG, niezmienniki) oraz osobno postęp (strumień zdarzeń
   + projekcja).
8. **Konsultacje** + ACL Google.
9. **Płatności** + webhook + bramka dostępu.
10. **Analityka i modele odczytu pod ekrany** — na końcu, bo czytają wszystko powyższe.

### Faza C — cięcie

Ciała fasad w `kalisthenos-web` zamieniają się w wywołania klienta API; auth przechodzi na
JWT; upload na presigned R2; migracja plików z wolumenu do R2; wydanie web + API razem.

### Faza D — mobile

Aplikacja Expo na ustabilizowanym API.

---

## 13. ADR-y do spisania

Każdy jako osobny dokument w repo API. Szczególnie ważne są te, w których świadomie
wybraliśmy prostotę — bez zapisanego uzasadnienia ktoś je później „poprawi".

| ADR | Decyzja |
|---|---|
| 001 | Modularny monolit backendowy zamiast mikroserwisów |
| 002 | Trzy repozytoria + publikowany pakiet kontraktu |
| 003 | NestJS z `class-validator`; OpenAPI z dekoratorów |
| 004 | Drizzle zostaje; migracje przenoszone bez przepisywania |
| 005 | JWT + rotacja refresh tokenów z wykrywaniem ponownego użycia; mechanizm rewokacji |
| 006 | Event sourcing wyłącznie dla postępu w umiejętnościach; wersjonowanie zdarzeń |
| 007 | **CRUD i transaction script dla siedmiu kontekstów — świadomie**, eskalacja tylko na dowód |
| 008 | Modele odczytu jako pełnoprawny obywatel kontraktu API |
| 009 | Cloudflare R2 + presigned upload + walidacja magic-bytes po fakcie |
| 010 | Redis wymagany dla rate-limitu i refresh tokenów |
| 011 | Prezentacja statusów (`labelKey` + `tone`) należy do BE |
| 012 | Big bang cutover na szwie fasad `app/lib/*` |
| 013 | Wymuszanie granic modułów w CI |
| 014 | Rozdzielenie nazw: `AuthSession` / `PlannedSession` / `WorkoutLog` |

---

## 14. Ryzyka

| Ryzyko | Waga | Ograniczenie |
|---|---|---|
| Cięcie jednym wydaniem — brak wycofania po kawałku | wysoka | Faza A (szew fasad), pełny przebieg e2e przed wydaniem, plan wycofania na poziomie całego wydania |
| Migracja plików z wolumenu do R2 | wysoka | Kopiowanie przed cięciem, weryfikacja liczby i sum kontrolnych, wolumen kasowany dopiero po okresie karencji |
| Rozjazd reguł walidacji FE ↔ BE (`class-validator` vs Zod) | średnia | Typy wyłącznie z generowanego klienta; serwer jest jedynym autorytetem walidacji |
| Modele odczytu jako worek na wszystko | średnia | Jawne oznaczenie w kontrakcie; wolno im agregować, nie wolno mutować |
| Koordynacja wydań trzech repozytoriów | średnia | Kontrakt addytywny, wersjonowanie `/v1`, okno wycofania liczone w miesiącach |
| Utrata natychmiastowej rewokacji sesji (JWT) | niska | Access token 10–15 min, rotacja refresh z wykrywaniem ponownego użycia |
| Przepisanie ~10 plików schematów Zod na DTO | niska | Praca mechaniczna, objęta testami kontraktowymi |

---

## 15. Poza zakresem

- Warstwa marki / organizacji (tenancy zostaje `trener → podopieczni`).
- Mikroserwisy i wydzielanie osobnych deploymentów poza opisaną gotowością modułu analityki.
- Globalny event sourcing.
- Zmiana frameworka frontendowego (React Router v7 zostaje; Angular rozważony i odrzucony —
  NestJS nie narzuca frontendu, a przepisanie UI to najdroższa możliwa zmiana o najmniejszym
  zwrocie).
- Offline-sync w PWA i w aplikacji mobilnej.

---

## 16. Następny krok

Plan implementacji **fazy A** (uszczelnienie szwu w obecnym repo) — jedyna faza, którą można
zaplanować bez dodatkowych rozstrzygnięć. Fazy B–D dostają własne specy i plany, każda po
zamknięciu poprzedniej.
