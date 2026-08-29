# Integracja FE z BE — FE traci bazę i staje się klientem kontraktu

**Data:** 2026-08-29
**Status:** projekt zaakceptowany w brainstormie; czeka na plan wykonania
**Poprzednik:** [`2026-07-28-rozbicie-fe-be-analiza-ddd-design.md`](2026-07-28-rozbicie-fe-be-analiza-ddd-design.md)

---

## 1. Driver i zakres

`calisthenos-fe` jest dziś aplikacją fullstackową: FE, backend i baza w jednym. `calisthenos-be`
powstał, żeby te światy rozdzielić i napisać backend porządnie — i jest gotowy na tyle, że
wystawia 80 endpointów pokrywających prawie całą powierzchnię produktu.

Ten projekt domyka rozdzielenie: **FE traci własną bazę i całą logikę backendową, a dane bierze
wyłącznie z endpointów BE.** Po integracji w FE zostają trasy, komponenty, system designu, PWA,
formatowanie po polsku i tłumaczenie błędów HTTP na ekrany. Nic poza tym.

**Ustalenia po stronie BE są nadrzędne.** Gdziekolwiek FE robi coś inaczej — nazwy, reguły,
kształt kontraktu — zmienia się FE. FE jest kodem MVP, z którego BE został wyprowadzony
i świadomie poprawiony.

### Poza zakresem

- **Płatności.** BE zdjął ten kontekst świadomie (ADR-0024: model płatności jest nierozstrzygnięty).
  Z FE znikają cztery trasy Stripe'a, webhook, bramka `/podopieczny/aktywuj` i cztery tabele.
  Decyzja o powrocie płatności to osobny projekt z własnym specem.
- **Aplikacja mobilna.** Jest driverem rozbicia, ale nie tego etapu.
- **Zmiany produktowe.** Integracja nie dokłada ani nie zmienia funkcji; jedynym świadomym
  ubytkiem są płatności.

## 2. Stan wyjściowy

| | FE | BE |
|---|---|---|
| Stack | React Router v7 (SSR), Drizzle, PostgreSQL | NestJS + MikroORM w Nx, Postgres, Redis, R2 |
| Menedżer | npm | pnpm |
| Zdalne | `github.com/LoQeN00/calisthenos` | **brak** |
| CI | — | napisane, **nigdy nieuruchomione** |
| Wdrożenie | Railway (app + Postgres + wolumen) | brak |

Baza jest jedna i ta sama: BE ma migracje przejmujące ją **w miejscu**.
`Migration20260802120000` wykonuje `ALTER TABLE users RENAME TO parties` — 29 kluczy obcych
z dziesięciu kontekstów przeżywa przemianowanie, bo Postgres wiąże je po OID — i backfilluje
`credentials` oraz `party_relationships`. `Migration20260801120000` przemianowuje
`google_calendar_connections` na `calendar_connections`, ręcznie, żeby nie skasować
zaszyfrowanych tokenów. Z 29 tabel FE 22 mają w BE tę samą nazwę, tożsamość jest przebudowana
migracją, a cztery tabele Stripe'a wypadają z zakresu.

## 3. Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D1 | **Płatności wypadają z zakresu** | ADR-0024; bramka dostępu wymaga jednoczesnego spełnienia trzech warunków (`stripeConfigured`, `chargesEnabled`, `hasPrice`), więc bez skonfigurowanego Stripe'a nikogo nie zatrzymuje |
| D2 | **BE przechodzi na argon2id** | produkcyjne hasze są argon2id, `PasswordHasher` używa bcrypta, a migracja tożsamości kopiuje `password_hash` dosłownie — bez tej zmiany po cutoverze nie zaloguje się nikt. Argon2id jest przy tym mocniejszy od bcrypta |
| D3 | **FE zostaje serwerem SSR i woła BE server-do-serwera** | zachowuje cały UI, trasy i PWA; BE nie ma włączonego CORS-u, a ciastko odświeżające jest `sameSite: 'strict'` — wariant z przeglądarką wołającą BE wprost wymagałby zmian po obu stronach i przepisania wszystkich tras |
| D4 | **Klient API jest publikowanym, wersjonowanym pakietem** | kontrakt między dwiema osobno wdrażanymi usługami musi mieć wersję, żeby dało się wycofać jedną stronę niezależnie od drugiej. Wektorowana kopia źródła tego nie daje |
| D5 | **Praca na branchu `be-integration`, odbitym od `master` po merge'u `feature/skill-tiers`** | `master` jest gałęzią wdrożeniową realnej produkcji |

## 4. Architektura docelowa FE

**Szew, który już istnieje.** FE ma regułę, że trasy nie sięgają do bazy — pilnuje jej
`app/routes/no-direct-db.test.ts`, a jej uzasadnienie w kodzie brzmi wprost: „to szew, na którym
warstwa danych zostanie przełożona na wywołania API". Ten szew wykorzystujemy zamiast wymyślać
nowy. Moduły w `app/lib/*.ts` zachowują sygnatury tam, gdzie to możliwe, a w środku zamiast
zapytania Drizzle wołają klienta. Bramka zmienia sens, nie kształt: trasa nadal nie wywołuje
niczego sieciowego sama.

**Warstwa klienta** (`app/lib/api/`) odpowiada za trzy rzeczy i tylko za nie: adres bazowy
z konfiguracji, token dostępowy z sesji, oraz zamianę odpowiedzi błędnej na `Response`
albo `redirect` Reacta Routera.

**Sesja i tokeny.** BE zwraca token odświeżający w ciastku `sameSite: 'strict'` **oraz w ciele
odpowiedzi**, jawnie „dla klientów bez ciastek" — FE serwer-do-serwera jest właśnie takim
klientem. Bierze oba tokeny z ciała i chowa we własnym ciastku `__Host-`. Token dostępowy żyje
15 minut.

**Pułapka rotacji — to jest rzecz do zaprojektowania, nie do odkrycia na produkcji.** ADR-0016
rotuje token odświeżający przez porównaj-i-zamień, a React Router uruchamia loadery jednej
nawigacji **równolegle**. Gdy token dostępowy wygaśnie, kilka loaderów naraz pójdzie odświeżać
tym samym tokenem: jeden wygra, reszcie BE odmówi, a użytkownik wyleci na logowanie bez powodu.
**Odświeżanie musi być zserializowane raz na żądanie HTTP, nie raz na loader.**

**Rola przestaje być pojedyncza.** `GET /v1/me` zwraca `roles` jako **listę** — ADR-0013 uczynił
rolę faktem z okresem i dopuścił `trainer` oraz `trainee` naraz. `requireUser` traci parametr `db`,
a kontrola roli staje się sprawdzeniem przynależności do listy, nie równości. Osoba będąca
jednocześnie trenerem i podopiecznym przestaje być przypadkiem niemożliwym — to zmiana
semantyczna, nie kosmetyczna, i dotyczy każdego miejsca, które dziś porównuje `user.role`.

**Pliki.** `GET /v1/files/{id}` jest w BE trasą publiczną chronioną podpisem HMAC związanym
z tenantem (ADR-0023), czyli sam w sobie jest podpisanym odnośnikiem. FE nie proxuje bajtów,
tylko wstawia ten adres do `<img>`/`<video>`. Znikają `app/lib/files.ts`, `signFileUrl`,
`verifyFileUrl`, `app/lib/storage/*` i trasa `files/$fileId`. Cena: BE musi być publicznie
osiągalny dla przeglądarki, nie tylko dla serwera FE.

**Błędy.** Kontrakt BE to `{ error: { code, message, details } }`, gdzie `message` jest już po
polsku i dla użytkownika, a `code` stabilny dla logiki. Dwie bramki przenoszą się z zapytań
do bazy na kody HTTP: `403 ONBOARDING_FORM_PENDING` → przekierowanie na `/podopieczny/formularz`,
a `404` zostaje `404` — obie strony mają już tę samą zasadę, że cudzy zasób jest nieodróżnialny
od nieistniejącego.

## 5. Cztery etapy

| Etap | Repozytorium | Zawartość |
|---|---|---|
| **0 — kontrakt jako artefakt** | `calisthenos-be` | zdalne repo, zielone CI, build pakietu klienta, publikacja |
| **1 — domknięcie BE** | `calisthenos-be` | argon2id, cztery brakujące endpointy |
| **2 — przepięcie FE** | `calisthenos-fe`, branch `be-integration` | wymiana wnętrza modułów `app/lib`, sesja na tokenach, usunięcie bazy i Stripe'a |
| **3 — cutover** | produkcja | migracje na żywej bazie, pliki na R2, wdrożenie obu usług |

Kolejność nie jest dowolna: Etap 2 nie ma z czym rozmawiać bez 1, a 1 nie ma jak trafić do FE
bez 0. Etapy 0 i 1 to commity w `calisthenos-be`, gdzie git prowadzimy normalnie; Etap 2 to
`calisthenos-fe`, gdzie git prowadzi Właściciel.

## 6. Etap 0 — kontrakt jako artefakt

Zamyka pozycję czekającą w kolejce `docs/adr/README.md` („Rejestr dla `@kalisthenos/api-client`").

1. **Zdalne repozytorium dla `calisthenos-be`**, prywatne. Konieczne niezależnie od klienta —
   bez niego nie da się wdrożyć backendu ani uruchomić jego CI.
2. **CI przechodzi po raz pierwszy.** Napisane, nigdy nieuruchomione. Ryzyko czasowe:
   pipeline, który nigdy nie biegł, potrafi zająć dzień.
3. **Target `build` dla `libs/client`.** Dziś projekt ma wyłącznie `typecheck`, a pakiet ma
   `main: ./src/index.ts` — publikowałby surowy TypeScript. Potrzebna kompilacja i `exports`.
   Wygenerowany klient nie importuje **ani jednego pakietu zewnętrznego**, więc build jest
   czystym `tsc`, bez bundlera.
4. **Publikacja do GitHub Packages** jako pakiet prywatny — ten sam token co repozytorium,
   bez drugiego dostawcy. `publishConfig`, `access` w Changesets, sekret w CI, krok publikujący
   w `release-client.yml`, który dziś świadomie kończy się na wersjonowaniu.
5. **ADR** rozstrzygający wybór rejestru.

## 7. Etap 1 — domknięcie BE

### 7.1 Argon2id zamiast bcrypta (D2)

Wymiana `PasswordHasher` na `@node-rs/argon2` — ten sam, którego używa FE, więc produkcyjne
hasze weryfikują się natywnie i nie ma migracji danych. Do zrobienia razem z tym:

- wpis w `allowBuilds` w `pnpm-workspace.yaml` — bez tego pnpm 11 przerywa instalację błędem
  `ERR_PNPM_IGNORED_BUILDS`;
- przeliczenie `DUMMY_HASH`, który chroni przed rozróżnieniem „konto nie istnieje" od „złe hasło"
  po czasie odpowiedzi — musi być poprawnym hashem argon2 o tych samych parametrach, inaczej
  porównanie z atrapą kosztuje inny czas niż porównanie prawdziwe i cała ochrona znika;
- seeder (`dev.seeder.ts`) i fikstury (`test-party.ts`, `party.factory.ts`), które wołają
  `bcryptjs` wprost.

### 7.2 Cztery brakujące endpointy

Zakres wyprowadzony z pełnego mapowania (załącznik A), nie z domysłu.

**`GET /v1/trainees` — lista podopiecznych trenera.** Zastępuje `listClientsForTrainer`
i `countClientsForTrainer`. Parametry: `page`, `q` (nazwa albo e-mail), filtr
`plan` = `all|with|without`, `sort` = `name_asc|name_desc|last_session|most_sessions|newest`.
Wiersz niesie liczbę sesji i datę ostatniej, czyli łączy `parties` z `workout_logs` i `plans` —
**model odczytu przekraczający granicę kontekstu, więc mieszka w `analytics` (ADR-0009)**.
Zbiór wartości `sort` deklarowany własnym `@ApiProperty` przy trasie (ADR-0029/0030),
a porządek zakończony kluczem rozstrzygającym.

**`DELETE /v1/trainees/{traineeId}` — usunięcie podopiecznego z zawartością.** Zastępuje
`deleteTraineeFully`, które dziś kasuje w jednej transakcji dane ze wszystkich obszarów oraz
pliki i zwraca `{ displayName, deletedFiles }`. BE ma dziś tylko
`DELETE /v1/trainees/{id}/invites`. **Zapis przez granice kontekstów → zdarzenia integracyjne
w outboxie, wzorem ADR-0021.** Największa pozycja etapu; kandydat na własny ADR.

**`GET /v1/trainees/{traineeId}/overview` — rozszerzenie o pięć bloków.** Ekran
`trener/podopieczni/$traineeId` woła ze `stats.ts` siedem funkcji, ale **dwie z nich są już
pokryte**: `ActivePlanUsageView` niesie `totals` (`getCurrentPlanTotals`) oraz `sessions`
z użyciem ćwiczeń (`getActivePlanSessionUsage`). Brakuje pięciu:
`getHealthStats`, `getPlateauExercises`, `getTagDistribution`, `getVideoCoverage`,
`getBodyPhotoCoverage`.

**Liczniki zakładek listy planów.** `GET /v1/plans` zwraca `total` dla bieżącego filtra;
ekran ma zakładki z osobnymi licznikami `{ all, active, draft }`. Bez tego FE wołałby trzy razy.

Każdy z tych endpointów jest **dodatkiem** do kontraktu, więc bramka addytywności (`pnpm oasdiff`)
zostaje zielona. Po każdej zmianie kontraktu — regeneracja klienta i changeset.

## 8. Etap 2 — przepięcie FE

Kolejność wewnątrz etapu wynika z zależności, nie z wygody: uwierzytelnianie jest pierwsze,
bo bez niego żaden inny loader nie ma tokenu.

1. **Warstwa klienta i konfiguracja** — adres BE, klient z `@kalisthenos/api-client`,
   mapowanie błędów, serializacja odświeżania tokenu.
2. **Uwierzytelnianie** — `login`, `wyloguj`, `zaproszenie/$token`, ciastko sesji na tokenach BE,
   `requireUser` po `GET /v1/me` z listą ról.
3. **Moduły `app/lib` obszar po obszarze** — każdy osobno, z testami przeciw podstawionemu
   klientowi, w kolejności: ćwiczenia i kategorie, plany, dziennik treningowy, umiejętności,
   progresja i rozwój, sylwetka, konsultacje i kalendarz, zgłoszenia, formularz startowy,
   podopieczni.
4. **Pliki** — wysyłka przechodzi na dwufazową (`POST /v1/files/{rodzaj}` → `POST /v1/files/{id}/confirm`),
   odczyt na podpisany adres BE. Znika trasa `files/$fileId`.
5. **Usunięcie płatności** — cztery trasy, webhook, bramka `aktywuj`, `app/lib/stripe/*`,
   `app/lib/payments.ts`.
6. **Usunięcie bazy** — `app/lib/db/`, Drizzle, `drizzle.config.ts`, skrypty `db:*`
   w `package.json`, `tests/*.itest.ts`, wolumen w `railway.toml`, `docker-compose.yml`.
7. **Zamiana bramki** — `no-direct-db.test.ts` przestaje mieć czego pilnować w dotychczasowej
   postaci; jej miejsce zajmuje reguła „trasa nie woła klienta wprost, tylko przez moduł".

Jedenaście modułów znika bez zamiennika, bo to praca, którą BE wykonuje u siebie: cały
`google/*`, `orphan-files`, `storage/*`, `files`, pruning sesji, hashowanie tokenu zaproszenia,
`rate-limit`, `stripe/*` i `payments`.

## 9. Etap 3 — cutover

1. **Próba generalna na kopii produkcji.** Migracje MikroORM na zrzucie żywej bazy, weryfikacja,
   że dane po `parties`/`credentials`/`party_relationships` zgadzają się z oryginałem
   i że logowanie działa na produkcyjnych haszach argon2.
2. **Przeniesienie plików na R2.** BE wiąże `FileStoragePort` wyłącznie z `R2FileStorage` —
   nie ma implementacji dyskowej. Zawartość wolumenu Railway trafia do kubełka pod tymi samymi
   kluczami, które niesie tabela `files`.
3. **Wdrożenie BE** — dwa obrazy (`api`, `worker`), Postgres, Redis, R2. Migracje wykonuje
   osobne wejście `node migrate.js`, **raz, przed rolloutem** — nie przy starcie aplikacji,
   bo trzy repliki startujące naraz wykonałyby je równolegle. `/health/ready` odpowiada `503`,
   dopóki schemat jest starszy niż kod.
4. **Okno serwisowe, migracje na żywej bazie, wdrożenie FE.**

**Wycofanie: kopia zapasowa i odtworzenie, nie `migration:down`.** Docblock migracji tożsamości
wylicza **cztery** warunki, przy których wycofanie przestaje być bezstratne albo w ogóle się nie
wykona — drugie połączenie kalendarza, puste `account_label`, skasowanie wszystkich odwzorowań
zdarzeń, oraz rozszczepienie `archived_at`, którego danych sprzed migracji nie da się rozróżnić.
Plan wycofania musi to zakładać.

## 10. Testy

FE traci bazę, więc traci też zestaw `tests/*.itest.ts` na testcontainerach — nie ma czego
integrować. W zamian:

- **testy modułów `app/lib` przeciw podstawionemu klientowi.** Kontrakt jest typowany, więc
  atrapa nie rozjedzie się z prawdą w ciszy — zmiana kształtu odpowiedzi w BE zapala typy w FE;
- **Playwright przeciw prawdziwemu BE** dla przepływów, które muszą przejść przez sieć:
  logowanie z rotacją tokenu, publikacja planu, zapis treningu, zakres tenanta, bramka
  formularza startowego;
- po stronie BE zwykłe bramki: `pnpm verify`, `pnpm oasdiff`, e2e na supertest.

Test, którego dziś nie ma, a musi powstać: **równoległe odświeżanie tokenu przez wiele loaderów
jednej nawigacji** (§4). To defekt objawiający się losowym wylogowaniem, nie do odtworzenia
przy pojedynczym żądaniu.

## 11. Ryzyka

| Ryzyko | Waga | Odpowiedź |
|---|---|---|
| CI BE nigdy nie biegło | średnia | Etap 0 jest osobny i domknięty przed integracją |
| Rotacja tokenu w równoległych loaderach | **wysoka** | zserializowane odświeżanie i test; objaw jest losowy i trudny do odtworzenia po fakcie |
| Wycofanie cutoveru nie jest bezstratne | **wysoka** | kopia zapasowa przed oknem serwisowym, próba generalna na zrzucie |
| Pliki produkcyjne na wolumenie | średnia | przeniesienie na R2 przed cutoverem, klucze bez zmian |
| Rozjazd wersji klienta między repozytoriami | średnia | pakiet z wersją i changelogiem (D4), przypięcie wersji w FE |
| Ubytek płatności zauważony przez użytkownika | niska | bramka wymaga trzech warunków naraz; do potwierdzenia przed cutoverem, czy Stripe jest realnie włączony na produkcji |

## 12. Warunek wstępny

Przed odbiciem `be-integration`: 52 niezacommitowane pliki w FE (~+942/−786 — sortowanie
i filtrowanie list, trasy trenera, testy) wchodzą commitem na `feature/skill-tiers`, branch idzie
merge'em do `master`, a `be-integration` odbija się od `master`. Merge do `master` **wdraża
skill-tiers na produkcję**, więc ta praca musi wcześniej przejść bramki FE: `npm run typecheck`,
`npm run lint`, `npx vitest run app`, `npm run build`.

---

## Załącznik A — mapowanie FE → BE

Jednostką mapowania jest **moduł `app/lib`**, nie trasa: reguła „trasy nie sięgają do bazy"
sprawia, że cały dostęp do danych przechodzi przez tę warstwę. Strona FE: **68 plików tras**.
Strona BE: **80 endpointów**.

Z 65 plików `app/lib` bazy albo Drizzle dotykają **34**; pozostałe 31 to czysta prezentacja
(`format`, `list-params`, `money`, `*-math`, `*-types`, `skill-pyramid`, `skill-tier`,
`log-draft`) i zostają nietknięte. Te 34 dzielą się na:

- **24 moduły dostępu do danych** z **177 eksportowanymi funkcjami** — to jest przedmiot
  mapowania niżej;
- 2 pliki infrastruktury Drizzle (`db/client.ts`, `db/schema.ts`);
- 3 pliki typów i reguł konsultacji, które sięgają po typy schematu, a nie po bazę;
- 5 plików płatności, znikających razem z zakresem (D1).

### Pokryte kontraktem

| Moduł FE | Endpointy BE |
|---|---|
| `auth/index.ts` | `GET /v1/me` |
| `auth/session.ts` | `POST /v1/auth/login`, `/refresh`, `/logout`, `/logout-all` |
| `auth/invite.ts` | `POST /v1/invites` (niesie `onboardingForm`), `GET /v1/invites/{token}`, `POST /v1/invites/{token}/accept` |
| `body-photos.ts` | `GET/POST /v1/me/body-photos`, `DELETE /v1/me/body-photos/{id}`, `GET /v1/trainees/{id}/body-photos` |
| `categories.ts` | `GET/POST /v1/exercise-categories`, `DELETE {id}` |
| `consultation-schedules.ts` | `GET/PUT/DELETE /v1/trainees/{id}/consultation-schedule` |
| `consultations.ts` (13 z 19) | `/v1/consultations`, `{id}`, `respond`, `reschedule`, `cancel`, `document`, `action-items` |
| `exercises.ts` | `GET /v1/exercises` (page, q, sort, tag, unit, status), POST, `{id}` GET/PATCH, `archive`, `restore` |
| `feature-requests.ts` | `/v1/me/feature-requests`, `/v1/feature-requests`, `{id}/response`, licznik w `/v1/trainer/nav` |
| `file-uploads.ts` | `POST /v1/files/set-video`, `/body-photo`, `/exercise-demo`, `POST /v1/files/{id}/confirm` |
| `google/connections.ts` | `GET/DELETE /v1/calendar/connection`, `POST .../authorize`, `GET .../callback` |
| `onboarding-forms.ts` | `GET/POST /v1/me/onboarding-form`, `GET /v1/trainees/{id}/onboarding-form`, bramka `403 ONBOARDING_FORM_PENDING` |
| `plans.ts` (14 z 15) | `GET /v1/plans`, POST, `{id}` GET/PUT/DELETE, `publish`, `draft`, `GET /v1/trainees/{id}/plans`, `GET /v1/me/plan` |
| `progression.ts` | `/v1/me/progression/{exerciseId}`, `/comparison` i warianty `trainees/{id}` |
| `skill-progression.ts` | `GET /v1/me/skill-progress`, `/v1/trainees/{id}/skill-progress`, `starting-level`, `advancements`, `history` |
| `skill-tree.ts` | `tree` w `GET /v1/me/development` |
| `skills.ts` (16 z 16) | `/v1/skills`, `{id}` GET/PATCH, `archive`, `variations`, `prerequisites` |
| `stats.ts` (12 z 17) | `hero`, `thisWeek`, `heatmap`, `effort` w `GET /v1/me/home`; `totals` i `sessions` w `activePlan` z `GET /v1/trainees/{id}/overview`; `personalRecords` z `POST /v1/workout-logs`; `getExerciseProgress`, `getEasierAtSameReps` i `getPlateauExercises` jako pomocnicze odczyty progresji umiejętności — w `/v1/me/skill-progress` i `/v1/me/development`; `getSideBySidePhotoPairs` liczone w FE. **Pozostaje 5 bloków** — patrz §7.2 |
| `workouts.ts` (12 z 14) | `/v1/me/plan`, `/v1/me/plan/sessions/{id}`, `GET /v1/me/workout-logs`, `POST /v1/workout-logs`, `/v1/trainees/{id}/workout-logs` |
| `wrapped.ts` | `GET /v1/me/wrapped`, `/v1/me/wrapped/{ym}` |

### Luki

Cztery, opisane w §7.2.

### Rozstrzygnięte jako NIE-luki

Sprawdzone w schematach `openapi.json`, nie wywnioskowane z nazw:

- `detectNewPRsForLog` → `POST /v1/workout-logs` zwraca `personalRecords`
- `createInviteWithOnboarding` → `POST /v1/invites` przyjmuje `onboardingForm`
- pomocnicze odczyty edytora umiejętności (`listAssignableExercises`, `listAssignablePrerequisites`,
  `listConflictingPrerequisites`) → są w `GET /v1/skills/{id}`
- drzewo umiejętności i lista ćwiczeń z progresją → `GET /v1/me/development`
- ekran `podopieczny/statystyki` → dziś sam `redirect`, nie ma czego przenosić
- `getSideBySidePhotoPairs` → parowanie zdjęć po widoku i dacie liczy się w FE z listy;
  to prezentacja, nie dane

### Znikają bez zamiennika

`db/client.ts`, `db/schema.ts`, `auth/password.ts`, pruning w `auth/session.ts`, `hashToken`
w `auth/invite.ts`, `google/oauth.ts`, `google/crypto.ts`, `google/calendar.ts`, `google/sync.ts`,
sześć funkcji synchronizacji w `consultations.ts`, `orphan-files.ts`, `storage/*`, `files.ts`,
`stripe/*`, `payments.ts`, `rate-limit.ts`.
