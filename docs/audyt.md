# Audyt: wydajność, niezawodność i obserwowalność

**Data:** 2026-07-22
**Zakres:** cała aplikacja (`app/`, konfiguracja deployu, Dockerfile, railway.toml)
**Kontekst:** 7 użytkowników produkcyjnych, Railway (1 instancja app + Postgres + Volume)
**Cel:** system ma działać szybko i niezawodnie; potrzebny lepszy system logów do diagnostyki incydentów

## Metoda

8 równoległych audytorów po wymiarach (zapytania DB, loadery/trasy, obserwowalność,
integracje zewnętrzne, infrastruktura/runtime, frontend, obsługa błędów, projekt logów)
→ **110 zgłoszonych znalezisk** → adwersaryjna weryfikacja każdego z osobna (każdy
weryfikator miał *obalić* znalezisko, domyślnie odrzucać przy wątpliwości) →
**94 potwierdzone, 16 odrzuconych jako fałszywe** → krytyk kompletności (+14 luk)
i krytyk priorytetów.

Pięć najcięższych zarzutów zweryfikowano dodatkowo ręcznie w kodzie. Jeden z nich
(webhook Stripe) okazał się przesadzony i został obniżony — patrz sekcja
[Co odrzucono](#co-odrzucono).

---

## Co jest zrobione dobrze

Punkt wyjścia jest dobry — to nie jest zaniedbany kod:

- **`app/lib/stats.ts` agreguje w SQL, nie w JS.** `COUNT`/`SUM`/`CASE WHEN` po stronie
  bazy zamiast ściągania tabel do pamięci. Najczęstszy grzech w takich projektach — tu go nie ma.
- **Schemat jest solidnie zaindeksowany** — 45 indeksów na 26 tabel, w tym trafne
  composite (`workout_logs_trainee_date_idx`, `consultations_trainer_status_idx`)
  i unikalne chroniące niezmienniki domenowe (`plans_trainee_active_uniq`).
- **Upload plików jest przemyślany** (`app/lib/file-uploads.ts`) — streamowanie chunkami,
  walidacja magic-bytes, `UploadCleanupQueue`, obsługa `ENOSPC`/`EACCES` z komunikatem
  po polsku, blob kasowany dopiero po commicie transakcji.
- **Rotacja sesji w transakcji z `SELECT ... FOR UPDATE`** (`app/lib/auth/session.ts:94`),
  obsługa `Range requests` dla wideo (`app/routes/files.$fileId.tsx`), świadoma redakcja
  błędów SDK w loggerze chroniąca przed wyciekiem tokenów.

Problem nie polega na tym, że kod jest zły — tylko na tym, że **nie widać, co robi**.

---

## A. Logi

### Stan faktyczny

**11 wywołań loggera w ~25 000 linii kodu**, w 9 plikach na ~160.
`app/lib/logger.ts` jest dobrze napisany: JSON w jednej linii (parsowalny w Railway),
nigdy nie rzuca, redaguje błędy SDK. Problem w tym, że **prawie nikt go nie woła**.

Gdy dziś zgłoszony zostanie błąd „nie mogę zapisać treningu", dostępne dane to **zero**:
nie wiadomo kto, kiedy, na jakim URL-u, jak długo trwało żądanie ani czym się skończyło.

### Sześć luk, w kolejności ważności

| # | Luka | Gdzie | Skutek |
|---|---|---|---|
| 1 | Brak access logu | brak w ogóle | `react-router-serve` nie loguje żądań. Nie wiadomo, że cokolwiek się wydarzyło. |
| 2 | Brak request ID | `app/lib/logger.ts:37` | Nawet istniejących 11 logów nie da się połączyć w jedno żądanie. |
| 3 | Logger nigdy nie zapisuje `message` ani `stack` | `app/lib/logger.ts:8-14` | `errorMeta` zwraca tylko `name` + `code`. Przy błędzie w logu jest `{"event":"unhandled","name":"Error"}` — bezużyteczne. Ochrona przed wyciekiem tokenów jest słuszna, ale objęła też własne, bezpieczne klasy błędów. |
| 4 | Zero logów zdarzeń domenowych | `plans.ts:364`, `workouts.ts:753`, `login.tsx` | Publikacja planu, zapis treningu, logowanie, upload — żadne nie zostawia śladu. |
| 5 | Brak `ErrorBoundary` w `root.tsx` | `app/root.tsx:87` | Użytkownik dostaje **angielski** ekran React Routera, bez ID zgłoszenia. Nie ma czego podać przy zgłoszeniu. |
| 6 | Zero alertingu i zero retencji | `railway.toml` | O awarii wiadomo dopiero od użytkownika. Railway trzyma logi krótko, brak log drainu. |

### Rekomendowany kształt

Proporcjonalnie do skali — bez OpenTelemetry, bez płatnego APM. Cztery elementy:

1. **`AsyncLocalStorage` z kontekstem żądania** (`node:async_hooks`, wbudowane, zero nowych
   zależności) — `requestId` + `userId` + `role` wstrzykiwane automatycznie do każdej linii
   loggera, bez przekazywania przez kilkanaście funkcji.
2. **Access log przez `unstable_middleware` RR7** — jedna linia na żądanie:
   `method, path, status, durationMs, userId, requestId`. RR7 v7 ma middleware, więc nie
   trzeba porzucać `react-router-serve` na rzecz własnego serwera Express/Hono.
3. **`errorMeta` rozszerzone o `message` i `stack` dla własnych klas błędów**
   (`UploadError`, `ConsultationError`) plus allowlista pól dla `PostgresError`
   (`table`, `constraint`, `detail`). Redakcja zostaje wyłącznie dla SDK Google/Stripe —
   tam była uzasadniona (patrz komentarz w `logger.ts:3-7`).
4. **`ErrorBoundary` w `root.tsx` po polsku + krótki kod incydentu** = pierwsze 8 znaków
   `requestId`. Użytkownik podaje kod, właściciel grepuje log.

Dodatkowo: **log drain do Better Stack / Axiom** (darmowy tier obsłuży 7 użytkowników)
oraz alert na `level:error` na maila. Szacunkowo ~2 dni roboty; całkowicie zmienia pozycję
przy incydencie.

---

## B. Niezawodność

### 1. `railway.toml` omija migracje

```toml
startCommand = "npm run start"                                                   # railway.toml:12
```
```dockerfile
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec npm run start"]  # Dockerfile:69
```

Railway `startCommand` **nadpisuje** `CMD` obrazu. Komentarz w `railway.toml:4-5` twierdzi,
że oba są „intentionally kept in sync" — **nie są**. Migracje i seed nie wykonują się przy
deployu.

Obecnie `db:migrate` uruchamiany jest ręcznie przez właściciela, więc to nie boli. Ale jest
to mina: pierwszy raz, gdy migracja zostanie pominięta, aplikacja wstanie na starym
schemacie i posypie się runtime'owymi błędami SQL. Naprawić należy albo `startCommand`,
albo komentarz — obecnie dokumentacja aktywnie wprowadza w błąd.

### 2. `password_hash` trafia do HTML przeglądarki

```ts
const traineeRows = await db.select().from(schema.users)   // podopieczni.$traineeId.tsx:79
...
return { trainee, ... };                                   // :138
```

`select()` bez projekcji zwraca **cały wiersz**, z `passwordHash` (Argon2id) i adresem
e-mail. RR7 serializuje dane loadera do HTML strony, więc hash hasła podopiecznego ląduje
w źródle strony trenera — w cache przeglądarki, w DevTools, w każdym proxy po drodze.

Nie jest to natychmiastowa katastrofa (Argon2id jest odporny na złamanie), ale to wyciek
danych uwierzytelniających. **Naprawa: jawna projekcja kolumn.** Wzorzec `select()` bez
projekcji występuje w 34 miejscach — warto przejrzeć wszystkie, których wynik trafia
do `return` loadera.

### 3. Brak timeoutów

```ts
const client = postgres(DATABASE_URL, { max: 10, idle_timeout: 20 });  // app/lib/db/client.ts:11
```

Brak `connect_timeout`, brak `statement_timeout`. Klient Stripe (`app/lib/stripe/client.ts`)
i Google Calendar (`app/lib/google/calendar.ts`) również są bez timeoutu — domyślny timeout
Stripe to **80 s × 2 retry ≈ 4 minuty**. Akcja może wisieć bez górnej granicy, trzymając
slot z puli 10 połączeń.

Trzy linijki konfiguracji. Najtańszy zysk niezawodności w całym audycie.

### 4. Brak graceful shutdown

Zero `process.on('SIGTERM')` w repo. Przy każdym redeployu Railway ubija proces — żądania
w locie są ucinane, połączenia DB nie są zamykane. Przy 7 użytkownikach trafienie w to jest
rzadkie, ale w trakcie zapisu treningu oznacza utratę wpisanych serii.

### Pozostałe potwierdzone

- **Sesje twardo umierają po 30 dniach.** `refreshIfNearExpiry` (`app/lib/auth/session.ts:94`)
  jest napisane, przetestowane i wyeksportowane w barrelu (`app/lib/auth/index.ts:61`) —
  ale **nigdy nie wywołane**. Wszyscy użytkownicy wylatują co 30 dni bez odnowienia sesji.
  Martwy kod, gotowy do podpięcia.
- **Konsultacje: czas lokalny zapisywany jako UTC.**
  `new Date(\`${f.scheduledAt}:00.000Z\`)` — `app/lib/consultations.ts:245, 286, 347`.
  Trener wpisuje 14:00, do Google Calendar leci 14:00 UTC = **16:00 czasu polskiego**.
  W samej aplikacji wygląda spójnie (wszędzie ten sam błąd), więc łatwo to przeoczyć —
  ale zaproszenia Google i linki Meet są o 2h obok.
- **Podwójne kliknięcie „Zapisz sesję"** (`app/routes/podopieczny/loguj.$sessionId.tsx:467`)
  tworzy dwa treningi i dwa komplety wideo. Brak blokady przycisku i brak ograniczenia
  unikalności w bazie.
- **Healthcheck `/` nie dotyka bazy.** Railway odpytuje bez cookie → `getOptionalUser`
  wraca od razu → 302 na `/login`. Healthcheck jest zielony nawet przy leżącym Postgresie.
- **Brak backupu wolumenu.** Zdjęcia sylwetki i wideo istnieją w jednej kopii. Baza na
  Railway ma backupy, wolumen — nie.
- **Walidacyjny `return` w akcji logowania treningu porzuca już wgrane wideo**
  (`loguj.$sessionId.tsx:118`) — trwały wyciek plików i wierszy na wolumenie.

---

## C. Wydajność

Przy 7 użytkownikach wydajność **nie jest głównym problemem** — krytyk priorytetów obniżył
tu wagę kilku znalezisk i miał rację. Trzy rzeczy warto jednak zrobić, bo są tanie:

1. **Layout podopiecznego robi 8 sekwencyjnych zapytań na każdą nawigację**
   (`app/routes/podopieczny/_layout.tsx:15-68`) — same liczniki do nawigacji, żadne nie jest
   w `Promise.all`, mimo że reszta repo używa go rutynowo. Jeden `Promise.all` → 2 rundy
   zamiast 8. To ~15 ms dziś, ale dotyczy **każdego kliknięcia w aplikacji**.
   Analogicznie layout trenera (4 zapytania) i pulpit trenera (`trener/_index.tsx:23`, 5 zapytań).
2. **Zdjęcia sylwetki bez miniatur.** Kafelek 180 px pobiera oryginał z aparatu
   (`app/components/photo-card.tsx:49`). Limit klienta to `MAX_UPLOAD_BYTES` = **250 MB**
   — dla zdjęcia. Dodatkowo podpisany URL ma ruchome `exp` (`app/lib/files.ts:12`), więc
   cache przeglądarki **nigdy nie trafia** i przy każdym wejściu na `/podopieczny/sylwetka`
   telefon ściąga oryginały od nowa. To jedyna pozycja z sekcji wydajności, którą podopieczny
   realnie odczuwa na słabszym łączu.
3. **Service worker nigdy się nie rejestruje.** `build/client/sw.js` i `registerSW.js` się
   budują, ale nie ma `app/entry.client.tsx`, a `injectRegister: "auto"` nie ma do czego
   wstrzyknąć skryptu przy SSR. Grep po bundlach klienta: zero odwołań do `registerSW`.
   **Cała konfiguracja PWA w `vite.config.ts` jest martwa.** Dotyczy instalowalności,
   nie szybkości — ale skoro PWA było w założeniach, warto wiedzieć, że nie działa.

Pozycje w rodzaju CTE bez filtra podopiecznego (`app/lib/workouts.ts:327`) czy braku
`shouldRevalidate` **odłożono** — przy obecnej skali to setki wierszy i ~200 ms, a koszt
naprawy przewyższa zysk.

---

## Co odrzucono

Weryfikatorzy obalili 16 znalezisk. Dodatkowo skorygowano jedno z „krytycznych":

**Webhook Stripe NIE gubi zdarzeń.** Audytor zgłosił to jako krytyczne, ale
`app/routes/webhooks.stripe.tsx:49-60` pokazuje, że marker idempotencji **jest wycofywany**
w bloku `catch`, a endpoint zwraca 500, więc Stripe ponawia dostarczenie. Jedyne realne okno
to twardy kill procesu (OOM/SIGKILL) między commitem markera a `applyChange` — wąskie
i mało prawdopodobne. Nie jest to pilne.

Inne odrzucone: `key={Math.random()}` w wykresach (nie jest antywzorcem w tym kontekście),
rzekomy problem z `navigateFallback` (martwy kod, bo SW i tak się nie rejestruje), rzekomy
brak tabeli audytowej (historia biznesowa jest w tabelach domenowych).

---

## Proponowana kolejność

**Tydzień 1 — zobaczyć, co się dzieje** *(bez tego reszta to zgadywanie)*
`AsyncLocalStorage` + requestId → access log przez middleware RR7 → `errorMeta`
z `message`/`stack` dla własnych błędów → `ErrorBoundary` po polsku z ID incydentu →
logi zdarzeń auth i domenowych.

**Tydzień 2 — przestać tracić dane i czas**
Timeouty (DB + Stripe + Google) → projekcja kolumn zamiast `select()` → `railway.toml`
vs migracje → graceful shutdown → log drain + alert na maila.

**Tydzień 3 — jakość życia**
`refreshIfNearExpiry` podpięte → strefa czasowa konsultacji → blokada double-submit →
`Promise.all` w layoutach → miniatury zdjęć + stabilne `exp` w URL-ach.

**Odłożone do ~50 użytkowników:** CTE bez filtrów, `shouldRevalidate`, indeksy trigramowe
do wyszukiwania (`ILIKE '%…%'`), CDN na media, rozdzielenie obrazu produkcyjnego
od `devDependencies`.

---

## Załącznik: pełna lista potwierdzonych znalezisk

108 pozycji (94 z audytu głównego + 14 od krytyka kompletności), posortowane wg wagi.

**Uwaga:** wagi w tabeli są takie, jakie nadali audytorzy. Korekty z sekcji
[Co odrzucono](#co-odrzucono) mają pierwszeństwo — w szczególności pozycja
o markerze idempotencji webhooka Stripe została obniżona z „krytyczny" do „niski".

Kolumna „N" = szacowany nakład (S/M/L).

| Waga | Kategoria | N | Plik | Znalezisko | Kierunek naprawy |
|---|---|---|---|---|---|
| krytyczny | niezawodnosc | S | `app/routes/webhooks.stripe.tsx:35` | Marker idempotencji webhooka commitowany przed przetworzeniem — crash gubi zdarzenie na zawsze | Objąć oba kroki jedną transakcją: `await db.transaction(async (tx) => { const ins = await tx.insert(processedWebhookEvents)...onConflictDoNothing().returning(); if (in… |
| krytyczny | niezawodnosc | S | `railway.toml:12` | railway.toml startCommand nadpisuje CMD — migracje NIE wykonują się przy deployu | Wybrać JEDNO źródło prawdy. Najprościej: usunąć `startCommand` z railway.toml (zostaje CMD z Dockerfile) albo ustawić `startCommand = "npm run db:migrate && npm run st… |
| krytyczny | niezawodnosc | S | `app/root.tsx:87` | Brak ErrorBoundary w root.tsx — każdy błąd i 404 pokazuje angielską stronę React Routera | Dodaj w `app/root.tsx` `export function ErrorBoundary()` z `useRouteError()` + `isRouteErrorResponse()`: gałąź 404 („Nie znaleziono strony” + link do `/`), gałąź 4xx/5… |
| krytyczny | obserwowalnosc | M | `app/lib/logger.ts:40` | Brak request ID — nie da się powiązać logów jednego żądania | Rozszerzyć istniejący `app/lib/logger.ts` o `AsyncLocalStorage` z `node:async_hooks` (wbudowane, zero nowych zależności): `const als = new AsyncLocalStorage<{reqId:str… |
| krytyczny | obserwowalnosc | M | `package.json:11` | Brak access logu w JSON — nie odpowiesz „kto, co, kiedy, jak długo, z jakim skutkiem” | Dwie opcje, obie proporcjonalne. (A) Bez nowej zależności: w `app/entry.server.tsx` opakować `handleRequest` pomiarem `performance.now()` i po `resolve()` emitować `lo… |
| wysoki | niezawodnosc | S | `app/lib/db/client.ts:11` | Brak `statement_timeout` i `connect_timeout` na puli postgres-js (max 10) | `postgres(DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 10, connection: { statement_timeout: 15000, idle_in_transaction_session_timeout: 30000 } })`. Tim… |
| wysoki | niezawodnosc | M | `app/routes/podopieczny/loguj.$sessionId.tsx:68` | Brak łącznego limitu multipart — jeden zapis sesji może zbuforować setki MB w RAM | Dwie tanie warstwy: (1) klient — w komponencie zsumować rozmiary wybranych plików i blokować submit powyżej progu łącznego (np. 60 MB) z czytelnym komunikatem „wyślij … |
| wysoki | niezawodnosc | S | `railway.toml:14` | healthcheckPath = "/" nie sprawdza ani bazy, ani dysku | Dodać trasę `app/routes/healthz.tsx` (wpis w `app/routes.ts`) z loaderem, który robi `await db.execute(sql\`select 1\`)` i `await stat(getEnv().DATA_DIR)` z timeoutem … |
| wysoki | niezawodnosc | S | `app/lib/stripe/client.ts:15` | Klient Stripe bez timeoutu — akcja może wisieć ~4 minuty | `new Stripe(key, { apiVersion: STRIPE_API_VERSION, timeout: 8000, maxNetworkRetries: 1 })`. 8 s to z zapasem więcej niż realny p99 Stripe, a użytkownik dostaje szybki … |
| wysoki | niezawodnosc | S | `app/lib/google/calendar.ts:42` | Wywołania Google Calendar bez timeoutu — akcja bez górnej granicy czasu | Przekazać opcje żądania w każdym wywołaniu: `api(auth).events.insert(params, { timeout: 10_000 })` (analogicznie patch/delete). Dodatkowo `.limit(50)` w `listUnsyncedF… |
| wysoki | niezawodnosc | S | `app/lib/stripe/subscriptions.ts:277` | Ciche no-opy w webhooku: aktualizacja statusu bez dopasowanego wiersza nic nie robi i nic nie loguje | Dodać `logger.warn("stripe_webhook.subscription_unmatched", { stripeSubscriptionId, stripeStatus })` przed wyjściem w gałęzi bez dopasowania oraz analogiczny warn w `a… |
| wysoki | niezawodnosc | S | `railway.toml:14` | Healthcheck `/` nie dotyka bazy — jest zielony nawet gdy Postgres leży | Dodać trasę `app/routes/healthz.tsx` z loaderem, który robi `await db.execute(sql\`select 1\`)` i zwraca JSON `{ok:true, node:process.version, uptime, dataDirWritable}… |
| wysoki | niezawodnosc | M | `app/routes/podopieczny/loguj.$sessionId.tsx:68` | Brak limitu rozmiaru ciała żądania — formData() buforuje wszystkie wideo w RAM przed jakąkolwiek walidacją | Trzy tanie kroki: (1) na początku akcji odczytać `request.headers.get("content-length")` i przy przekroczeniu progu (np. 120 MB) zwrócić 413 z komunikatem PL, zanim wy… |
| wysoki | niezawodnosc | S | `app/routes/podopieczny/loguj.$sessionId.tsx:118` | Walidacja w środku pętli logowania zwraca się bez cleanup — trwały wyciek plików i wierszy | Zamienić trzy `return { error: ... }` (linie 118, 127, 136) na rzucanie wyjątku łapanego przez istniejący `catch` (np. `throw new WorkoutSaveError(msg, msg)`), albo do… |
| wysoki | niezawodnosc | M | `railway.toml:11` | Brak jakiegokolwiek backupu wolumenu — zdjęcia i wideo istnieją w jednej kopii | Proporcjonalnie do 7 użytkowników: `scripts/backup-volume.ts` robiący `tar czf` z `DATA_DIR` + `pg_dump` do jednego archiwum i wysyłający je na tanie zewnętrzne miejsc… |
| wysoki | niezawodnosc | M | `app/routes/podopieczny/loguj.$sessionId.tsx:839` | Logowanie treningu wysyła do kilkudziesięciu nagrań w JEDNYM POST, bez limitu zbiorczego i bez progresu | Trzy tanie kroki: 1) kliencka walidacja sumy rozmiarów przed submitem (podnieś stan wybranych plików do formularza i blokuj > np. 80 MB z czytelnym komunikatem); 2) `C… |
| wysoki | niezawodnosc | S | `app/routes/podopieczny/_layout.tsx:128` | Layouty trenera i podopiecznego bez ErrorBoundary — błąd w podwidoku kasuje całą powłokę | Wyeksportuj `ErrorBoundary` w obu layoutach: renderuje tę samą powłokę (topbar + sidenav, dane z `useRouteLoaderData`) i wstawia komunikat po polsku tylko w `<main>`. … |
| wysoki | niezawodnosc | S | `app/routes/podopieczny/loguj.$sessionId.tsx:118` | Walidacyjny `return` w akcji logowania treningu porzuca już wgrane wideo (wyciek plików) | Dwie opcje, obie tanie: (a) najprościej — zamień wczesne `return { error }` wewnątrz `try` na `throw new ValidationError(msg)` i obsłuż go w istniejącym `catch` (który… |
| wysoki | niezawodnosc | M | `app/lib/consultations.ts:245` | Konsultacje: godzina wpisana przez trenera zapisywana jako UTC — Google Calendar pokazuje +2h | Ustal JEDNĄ strefę aplikacji (Europe/Warsaw) i trzymaj ją w jednym helperze: przy zapisie konwertuj wpisaną godzinę lokalną → instant UTC (offset z `Intl.DateTimeForma… |
| wysoki | niezawodnosc | M | `app/lib/auth/session.ts:94` | refreshIfNearExpiry nigdy nie jest wywoływane — sesja twardo umiera po 30 dniach | Wywołać `refreshIfNearExpiry` w loaderze roota (`app/root.tsx`) albo w `requireUser`, i przy zwróconym nowym id ustawić ciasteczko przez `buildSetCookie`. Uwaga: `requ… |
| wysoki | niezawodnosc | S | `app/lib/storage/local-volume.ts:43` | LocalVolumeStorage.write ignoruje backpressure — cały plik ląduje w buforze Readable | Zastąpić ręczny `Readable` + IIFE jedną linią: `await pipeline(Readable.from(source), createWriteStream(abs))` i liczyć bajty transformacją (`new Transform`) albo odcz… |
| wysoki | niezawodnosc | M | `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx:60` | Terminy konsultacji materializują się tylko przy wizycie trenera — brak jakiegokolwiek procesu w tle | Proporcjonalnie do skali: to samo leniwe podejście co `maybePruneExpiredSessions` — w loaderze roota (albo w loaderze `/trener/konsultacje`, który trener odwiedza częs… |
| wysoki | obserwowalnosc | S | `app/root.tsx:87` | root.tsx nie ma ErrorBoundary — użytkownik dostaje angielski ekran RR7 bez ID zgłoszenia | Dodać do `app/root.tsx` eksport `ErrorBoundary` używający `useRouteError` + `isRouteErrorResponse`: dla 404 polski komunikat „Nie znaleziono", dla reszty „Coś poszło n… |
| wysoki | obserwowalnosc | S | `app/routes/login.tsx:67` | Zero logów zdarzeń auth — brak śladu po logowaniach, blokadach i odrzuconych podpisach | Dołożyć 5 wywołań istniejącego `logger`: `logger.info("auth.login_ok", {userId, role})` po `createSession` (login.tsx:72); `logger.warn("auth.login_failed", {reason: "… |
| wysoki | obserwowalnosc | S | `app/lib/logger.ts:43` | Brak jakiegokolwiek alertowania — o awarii dowiesz się od użytkownika | Dodać do `app/lib/logger.ts` opcjonalny sink webhookowy: nowa zmienna env `ALERT_WEBHOOK_URL` (opcjonalna, w `app/lib/env.ts` obok STRIPE_*), a w `emit()` — dla `level… |
| wysoki | obserwowalnosc | S | `app/lib/logger.ts:8` | Logger nigdy nie zapisuje `message` — także dla WŁASNYCH, bezpiecznych klas błędów | Wprowadzić w `app/lib/logger.ts` bazową klasę `export class AppError extends Error {}` (albo marker `readonly safeMessage = true`), po której dziedziczą istniejące kla… |
| wysoki | obserwowalnosc | S | `app/routes/trener/integracje.google.callback.tsx:43` | Callback Google OAuth połyka błąd wymiany kodu bez śladu w logach | `catch (err) { logger.error("google_oauth.exchange_failed", { trainerId: user.id, ...errorMeta(err) }); return fail("exchange"); }`. Dodatkowo rozdzielić try na dwa bl… |
| wysoki | obserwowalnosc | S | `app/routes/webhooks.stripe.tsx:29` | Nieudana weryfikacja podpisu webhooka nie zostawia żadnego śladu w logach | W catchu: `logger.warn("stripe_webhook.bad_signature", { hasPlatformSecret: Boolean(env.STRIPE_WEBHOOK_SECRET), hasConnectSecret: Boolean(env.STRIPE_CONNECT_WEBHOOK_SE… |
| wysoki | obserwowalnosc | S | `app/routes/trener/integracje.google.callback.tsx:43` | Błąd wymiany kodu OAuth Google połykany bez logu — zgłoszenie „nie mogę połączyć" jest niediagnozowalne | `catch (err) { logger.error("google_oauth.exchange_failed", { trainerId: user.id, ...errorMeta(err) }); return fail("exchange"); }`. `errorMeta` i tak nie loguje `mess… |
| wysoki | obserwowalnosc | S | `app/lib/file-uploads.ts:216` | Awarie wolumenu (ENOSPC/EACCES) nie zostawiają ŻADNEGO śladu w logach | W `uploadFile` przed każdym `throw new UploadError(...)` wstawić `logger.error("upload.failed", { kind, code, bytes: file.size, storagePath, ...errorMeta(err) })` (dla… |
| wysoki | obserwowalnosc | S | `app/lib/logger.ts:76` | Log błędu nieobsłużonego nie zawiera ani message, ani stacku — po incydencie nie da się nic ustalić | Rozdziel politykę: w `errorMeta` zostaw redakcję dla błędów SDK, ale w `logUnhandled` dołóż `stack: err.stack?.split("\n").slice(0, 12).join("\n")` oraz `message` dla … |
| wysoki | obserwowalnosc | M | `app/lib/logger.ts:40` | Brak request ID — logi jednego żądania są nie do połączenia | Nowy plik `app/lib/log-context.ts` na `node:async_hooks`: ```ts export interface RequestLogContext { requestId: string; method: string; route: string; userId?: string;… |
| wysoki | obserwowalnosc | M | `app/root.tsx:8` | Brak access logu — nie wiadomo, co i jak długo się działo | REKOMENDACJA: middleware trasy roota, NIE własny serwer Express/Hono. Nowy `app/lib/access-log.ts`: ```ts export const accessLogMiddleware: MiddlewareFunction = async … |
| wysoki | obserwowalnosc | S | `app/routes/login.tsx:68` | Logowanie i wylogowanie nie zostawiają żadnego śladu | Dodaj eventy w `login.tsx` (i `wyloguj.tsx`, `zaproszenie.$token.tsx`): - `auth.login.ok` `{ userId, role }` — po `createSession` (login.tsx:72) - `auth.login.failed` … |
| wysoki | obserwowalnosc | S | `app/routes/webhooks.stripe.tsx:30` | Webhook Stripe: odrzucone i zduplikowane zdarzenia znikają bez śladu | Dodaj w `webhooks.stripe.tsx`: - linia 16: `logger.warn("stripe.webhook.rejected", { reason: "no_signature" })` - linia 22: `logger.error("stripe.webhook.rejected", { … |
| wysoki | obserwowalnosc | M | `app/root.tsx:87` | Brak ID incydentu dla użytkownika i brak globalnego ErrorBoundary | 1) Access-log middleware ustawia `X-Request-Id` na odpowiedzi (patrz znalezisko o access logu) — widoczne w devtools i w `curl -I`. 2) `app/root.tsx:8` — loader zwraca… |
| wysoki | obserwowalnosc | M | `railway.toml:11` | Logi żyją tylko w Railway i znikają — brak log drainu | Ocena realnych opcji dla 7 użytkowników: - **(a) Sam panel Railway** — koszt 0, wysiłek 0, ale krótka retencja i brak alertów po treści. Niewystarczające jako jedyne r… |
| wysoki | obserwowalnosc | S | `app/lib/env.ts:29` | Brak alertingu — o każdym błędzie właściciel dowiaduje się od użytkownika | Trzy warstwy, od najtańszej: 1) **Alert w narzędziu drainu (0 linii kodu)** — po wdrożeniu drainu ustaw dwa alerty: `level:"error"` ≥ 1 wystąpienie / 5 min → e-mail + … |
| wysoki | obserwowalnosc | M | `app/lib/logger.ts:22` | Bezpieczeństwo logów: token zaproszenia w ścieżce + redakcja tylko na pierwszym poziomie | CZEGO NIGDY NIE LOGOWAĆ: haseł i hashy, tokenów (zaproszenia, Google refresh/access, Stripe `sk_`/`whsec_`), nagłówka `Cookie`/`Authorization`, podpisów `sig`, `err.me… |
| wysoki | skala-pozniejsza | S | `app/lib/workouts.ts:327` | CTE `log_stats` agreguje CAŁĄ tabelę workout_exercise_logs/set_logs bez filtra podopiecznego | Dodać `where` do CTE, żeby agregat liczył się tylko dla logów tego podopiecznego: podzapytanie `log_stats` powinno mieć `innerJoin(workoutLogs, ...)` + `eq(workoutLogs… |
| wysoki | wydajnosc-db | S | `app/routes/podopieczny/_layout.tsx:17` | Layout podopiecznego: 8 sekwencyjnych zapytań przy KAŻDEJ nawigacji | Owinąć niezależne zapytania w jeden `Promise.all` (liczniki logów/zdjęć/pending + subskrypcja + connection równolegle; tylko count sesji planu zależy od `activePlan`).… |
| wysoki | wydajnosc-db | M | `app/lib/skill-progression.ts:127` | Sugestie awansu liczą trzy razy to samo ciężkie zapytanie historii | Wyciągnąć `loadPerExerciseHistory` przed blok `if (opts.withSuggestions)`, wywołać RAZ i przekazać gotową mapę do trzech funkcji czystych (rozbić `getExerciseProgress`… |
| wysoki | wydajnosc-db | S | `app/lib/auth/index.ts:18` | Brak memoizacji sesji per-żądanie — to samo zapytanie JOIN 2-3× na każdą nawigację | Dodać memoizację per-żądanie: `WeakMap<Request, Promise<AuthUser|null>>` w `getOptionalUser` (Request jest stabilną referencją dla wszystkich loaderów jednego żądania)… |
| wysoki | wydajnosc-frontend | S | `app/routes/trener/podopieczni.$traineeId.tsx:81` | Pełny wiersz `users` (z `password_hash`) serializowany do klienta w loaderze | Zamienić `.select()` na jawną projekcję: `.select({ id: schema.users.id, displayName: schema.users.displayName, joinedOn: schema.users.joinedOn })`. To jedyne miejsce … |
| wysoki | wydajnosc-frontend | S | `vite.config.ts:16` | Service worker NIGDY nie jest rejestrowany — cała konfiguracja PWA jest martwa | Dodać rejestrację ręcznie — najprościej `<script src="/registerSW.js" defer />` w `<head>` w app/root.tsx (CSP `script-src 'self'` już to dopuszcza), albo utworzyć `ap… |
| wysoki | wydajnosc-frontend | M | `app/components/photo-card.tsx:49` | Zdjęcia sylwetki bez miniatur — kafelek 180 px pobiera oryginał z aparatu | Generować miniaturę przy uploadzie: w `addBodyPhoto` obok oryginału zapisać wariant ~600 px WebP (np. `sharp`, ~1 zależność, kilkanaście linii) i dodać kolumnę `thumb_… |
| wysoki | wydajnosc-frontend | S | `app/lib/files.ts:12` | Podpisany URL pliku zmienia się co sekundę — cache przeglądarki nigdy nie trafia | Zaokrąglić `exp` do koszyka czasowego, żeby URL był stabilny w oknie: `const bucket = Math.floor(Date.now()/1000/3600)*3600; const exp = bucket + URL_TTL_SECONDS;`. We… |
| wysoki | wydajnosc-frontend | S | `app/components/progression-list.tsx:9` | /podopieczny/rozwoj ściąga 113 KB visx, mimo że nie renderuje żadnego wykresu visx | Wydzielić trzy helpery do nowego pliku `app/components/progression-status.tsx` (przenieść `StatusSummaryBar`, `sparkStrokeForStatus`, `ProgressionStatusBadge` + `STATU… |
| wysoki | wydajnosc-runtime | S | `app/routes/podopieczny/_layout.tsx:17` | Loader layoutu podopiecznego: 7 sekwencyjnych zapytań na KAŻDE żądanie | Zawinąć niezależne zapytania w `Promise.all` (logCount, photoCount, activePlan, pending, sub, conn), a `sessionsCount` policzyć w tym samym zapytaniu co activePlan (jo… |
| wysoki | wydajnosc-runtime | M | `app/routes/trener/plany.$planId.tsx:201` | Zero `shouldRevalidate` w repo — po każdej akcji przeładowuje się całe drzewo loaderów | Dodać `export function shouldRevalidate({ formMethod, actionResult })` w `plany.$planId.tsx` — pomijać rewalidację, gdy akcja zwróciła `{ok:true}` (redirect po publish… |
| sredni | niezawodnosc | S | `app/lib/db/client.ts:11` | Brak statement_timeout — jedno wolne zapytanie może zjeść całą pulę 10 połączeń | Ustawić limit po stronie sesji: `postgres(DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 10, connection: { statement_timeout: 15000 } })` i zalogować błąd… |
| sredni | niezawodnosc | S | `app/lib/trainees.ts:123` | Ciche połknięcia przy kasowaniu blobów — sierocenie plików na wolumenie bez żadnego sygnału | W każdym z 4 miejsc zamienić puste `catch {}` na `catch (err) { logger.warn("file.blob_delete_failed", { op: "<gdzie>", ...errorMeta(err) }); }` — nadal best-effort, n… |
| sredni | niezawodnosc | S | `app/lib/stripe/status.ts:30` | Nieznany status Stripe cicho mapowany na 'incomplete' → utrata dostępu bez śladu | W `applySubscriptionUpdate` przed mapowaniem: `if (!(stripeStatus in KNOWN)) logger.warn("stripe.unknown_status", { stripeStatus, stripeSubscriptionId })` (eksportując… |
| sredni | niezawodnosc | S | `app/routes/trener/integracje.stripe.tsx:32` | Brak łagodnej degradacji: awaria Stripe w akcji „Połącz" daje surową stronę błędu | Owinąć obie akcje w try/catch zwracający `{ error: "Stripe chwilowo niedostępny — spróbuj ponownie za chwilę." }` + `logger.error("stripe_connect.failed", { trainerId,… |
| sredni | niezawodnosc | M | `app/lib/stripe/subscriptions.ts:101` | Zmiana kwoty: rozjazd DB↔Stripe, gdy podmiana Price na subskrypcji padnie | Ująć krok podmiany w try/catch: przy błędzie `logger.error("stripe.price_swap_failed", { trainerId, traineeId, priceId, ...stripeErrorMeta(err) })` i zwrócić rozróżnia… |
| sredni | niezawodnosc | S | `app/lib/db/client.ts:11` | Brak statement_timeout i limitu kolejki — pojedyncze wolne zapytanie wiesza żądania bez końca | Jedna linia: `postgres(DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 10, connection: { statement_timeout: 15000, idle_in_transaction_session_timeout: 150… |
| sredni | niezawodnosc | S | `app/lib/env.ts:9` | Brak limitu i monitoringu zajętości wolumenu — dysk da się zapchać kilkoma plikami | (1) Obniżyć domyślne `MAX_UPLOAD_BYTES` do ~15 MB — zdjęcie z telefonu ma 3–8 MB, 250 MB nie ma uzasadnienia. (2) Dodać do trasy `/healthz` (z drugiego znaleziska) odc… |
| sredni | niezawodnosc | S | `app/routes/podopieczny/loguj.$sessionId.tsx:467` | Podwójne kliknięcie „Zapisz sesję” tworzy dwa treningi — brak blokady i brak unikalności w bazie | Minimum: `const nav = useNavigation(); disabled={entries.length === 0 || nav.state !== "idle"}` + zmiana etykiety na „Zapisuję…”. Twardo (i tanio): dodaj częściowy uni… |
| sredni | niezawodnosc | S | `app/routes/podopieczny/loguj.$sessionId.tsx:341` | Szkic treningu żyje tylko w sessionStorage — zabicie karty/PWA kasuje wpisane serie | Zamień `sessionStorage` na `localStorage` (API identyczne — zmiana w dwóch miejscach w `loguj.$sessionId.tsx` i w jednym w `historia.$logId.tsx`). Żeby nie zaśmiecać: … |
| sredni | niezawodnosc | S | `app/lib/db/client.ts:11` | Brak timeoutów na połączeniu i zapytaniach Postgresa — jedno zawieszone zapytanie może zablokować całą aplikację | Dopisz w opcjach klienta: `connect_timeout: 10` oraz `connection: { statement_timeout: 15000 }` (wartości w sekundach / milisekundach zgodnie z API postgres-js). Wtedy… |
| sredni | niezawodnosc | S | `railway.toml:12` | railway.toml pomija migracje mimo komentarza, że jest zsynchronizowany z Dockerfile | Zdecyduj i zapisz: albo `startCommand = "npm run db:migrate && npm run start"` (jeden proces, migracje przy starcie — przy 1 instancji nie ma wyścigu), albo zostaw ręc… |
| sredni | niezawodnosc | S | `app/lib/storage/local-volume.ts:50` | Zapis pliku na wolumen jest nieatomowy i bez fsync — crash zostawia obcięty plik uznawany za poprawny | Zapisywać do `${abs}.tmp-${randomUUID()}`, po `pipeline` zrobić `fh.sync()` (albo pominąć fsync i zaakceptować ryzyko), a następnie `rename` na docelową ścieżkę — rena… |
| sredni | niezawodnosc | S | `Dockerfile:69` | Brak graceful shutdown — SIGTERM przy redeployu ucina żądania w locie | W `app/entry.server.tsx` (moduł ładowany raz na proces) dodać handler SIGTERM/SIGINT: zalogować `process.shutdown`, poczekać krótką chwilę na dokończenie żądań, wywoła… |
| sredni | niezawodnosc | S | `app/lib/rate-limit.ts:91` | Rate limiting obejmuje tylko logowanie i zaproszenia — upload, /files i webhook są bez limitu | Dodać bucket `upload` (np. 20 zapisów / 15 min per użytkownik — kluczem `user.id`, nie IP, bo mobilne IP się zmienia) i użyć go w akcjach uploadu. Istniejący `InMemory… |
| sredni | niezawodnosc | M | `playwright.config.ts:4` | Brak CI i zerowe pokrycie e2e mimo skonfigurowanego Playwrighta | Minimalny workflow GitHub Actions na push: `npm ci && npm run typecheck && npm run lint && npm run test:unit && npm run build`. Testy integracyjne (testcontainers) zos… |
| sredni | obserwowalnosc | S | `app/entry.server.tsx:82` | Jedyny surowy console.error w kodzie serwera — poza JSON i poza polityką redakcji | Zamienić na `logger.error("ssr.stream_error", { path: new URL(request.url).pathname, ...errorMeta(error) })` (import `logger`, `errorMeta` już częściowo jest — `logUnh… |
| sredni | obserwowalnosc | S | `app/lib/workouts.ts:753` | Zero logów zdarzeń domenowych — publikacja planu, zapis treningu, upload, usunięcie podopiecznego | Dołożyć ~6 wywołań `logger.info` na udanych ścieżkach, z tenant-scope w kontekście (przy request-id z findingu #1 wpina się to automatycznie): `workout.logged {trainee… |
| sredni | obserwowalnosc | M | `app/lib/db/client.ts:12` | Zero pomiaru czasu — ani zapytań SQL, ani loaderów | Dwa tanie kroki. (1) Podpiąć `debug` postgres-js w `app/lib/db/client.ts:11`: `postgres(DATABASE_URL, {max:10, idle_timeout:20, debug: (_c, query, _p, _t) => {...}})` … |
| sredni | obserwowalnosc | S | `app/lib/google/connections.ts:130` | Google: nieudany zapis odświeżonego tokenu i nieudane odszyfrowanie giną bez śladu | `persistRefreshed`: `catch (err) { logger.error("google_token.persist_failed", { trainerId, rotated: Boolean(refreshToken), ...errorMeta(err) }); }` — `rotated` rozróż… |
| sredni | obserwowalnosc | S | `app/lib/logger.ts:8` | errorMeta gubi statusCode i requestId Stripe — najważniejsze dane do diagnostyki | Dodać obok `errorMeta` funkcję `stripeErrorMeta(err)` wyciągającą `type`, `code`, `statusCode`, `requestId` (te pola są bezpieczne — nie zawierają treści żądania) i uż… |
| sredni | obserwowalnosc | S | `app/lib/google/sync.ts:20` | Logi błędów synchronizacji Google i sprzątania Stripe bez identyfikatorów | Zmienić sygnaturę na `logSyncError(op, ctx, err)` i logować `{ op, trainerId, consultationId, ...errorMeta(err) }` (w pętlach `consultationId` jako pole, nie w nazwie … |
| sredni | obserwowalnosc | S | `app/lib/google/connections.ts:130` | Pusty catch przy zapisie odświeżonego tokenu Google + wyścig równoległych odświeżeń | Zalogować: `catch (err) { logger.warn("google_token.persist_failed", { trainerId, ...errorMeta(err) }); }`. Wyścig przy 7 użytkownikach jest nieszkodliwy (Google nie r… |
| sredni | obserwowalnosc | S | `app/entry.server.tsx:11` | Brak logu startu procesu — po restarcie nie wiadomo, co i kiedy wstało | Dodać w `app/entry.server.tsx` (moduł, jednorazowo przy imporcie) `logger.info("app.boot", { node: process.version, env: getEnv().NODE_ENV, dataDir: getEnv().DATA_DIR,… |
| sredni | obserwowalnosc | S | `app/lib/logger.ts:8` | errorMeta gubi całą diagnostykę błędów Postgresa (nie wiadomo która tabela/ograniczenie) | Dodać w `errorMeta` gałąź: jeśli `err.name === "PostgresError"`, dopisać whitelistę bezpiecznych pól (`table_name`, `column_name`, `constraint_name`, `schema_name`, `r… |
| sredni | obserwowalnosc | M | `app/lib/logger.ts:68` | Brak korelacji w logach — nie da się połączyć błędu z użytkownikiem ani z sekwencją żądań | Tanio i bez nowych usług: w `handleError` dołóż `userId` (odczytany z ciasteczka sesji, bez zapytania do DB wystarczy `parseSessionId` → prefiks id) i `requestId` = `c… |
| sredni | obserwowalnosc | M | `app/lib/db/client.ts:12` | Zero widoczności zapytań DB — nie wiadomo, które zapytanie zwalnia | 1) Zdejmij `logger: NODE_ENV === "development"` (nigdy nie chcemy parametrów w logach) i wstaw własny pomiar. Drizzle woła WYŁĄCZNIE `client.unsafe(query, params)` (zw… |
| sredni | obserwowalnosc | M | `app/lib/plans.ts:364` | Kluczowe operacje domenowe (publikacja planu, zapis treningu, upload) nie mają logów | Katalog zdarzeń do dołożenia (konwencja `domena.akcja.wynik`; `rid`/`userId`/`role` dokłada logger automatycznie): - **plan**: `plan.published.ok` `{planId, traineeId}… |
| sredni | obserwowalnosc | S | `app/lib/google/sync.ts:119` | Taksonomia: brak stałego zestawu pól, brak typowania eventów, ID w polu o niskiej kardynalności | 1) **Poziomy: 3 wystarczą.** `info`/`warn`/`error` (logger.ts:1) pokrywają potrzeby jednej instancji; NIE dodawaj `debug` (w produkcji byłby wyłączony, lokalnie wystar… |
| sredni | obserwowalnosc | S | `app/lib/logger.ts:69` | logUnhandled milcząco porzuca błędy przerwanych żądań — najczęstszy przypadek na mobile | Nie odrzucać przerwanych żądań, tylko logować je na innym poziomie i z flagą: `logger.warn("request_aborted", { method, path, ...errorMeta(error) })`. Odróżnienie w po… |
| sredni | skala-pozniejsza | S | `app/lib/workouts.ts:614` | CTE `client_stats` grupuje całą tabelę workout_logs bez filtra trenera | Dodać do CTE `where(eq(workoutLogs.trainerId, trainerId))` — kolumna jest zdenormalizowana właśnie w tym celu i pokryta indeksem `workout_logs_trainer_created_idx`. Je… |
| sredni | skala-pozniejsza | S | `app/lib/db/schema.ts:337` | Brak indeksów na workout_exercise_logs.exercise_id i workout_logs.plan_id | Dodać `index("workout_exercise_logs_exercise_idx").on(t.exerciseId)` oraz `index("workout_logs_plan_idx").on(t.planId)` (a przy okazji `plan_items(exercise_id)`), wyge… |
| sredni | skala-pozniejsza | M | `app/lib/workouts.ts:327` | CTE `log_stats` agreguje CAŁĄ tabelę serii, bez filtra podopiecznego | Wciągnąć filtr tenanta do CTE: dodać join `workout_exercise_logs → workout_logs` i `WHERE workout_logs.trainee_id = $1` wewnątrz `statsSub` (analogicznie w `countLogsF… |
| sredni | skala-pozniejsza | S | `app/lib/workouts.ts:614` | CTE `client_stats` agreguje wszystkie `workout_logs` wszystkich trenerów | Dodać do `statsSub` join z `users` (albo bezpośrednio `WHERE workout_logs.trainer_id = $trainerId`, kolumna już istnieje w `workout_logs`) — filtr tenanta wchodzi do a… |
| sredni | skala-pozniejsza | M | `app/lib/google/sync.ts:177` | Wywołania Google Calendar w pętli, w środku akcji, bez timeoutu | Krótkoterminowo (S): ustawić `new Stripe(key, { apiVersion, timeout: 10_000, maxNetworkRetries: 1 })` i przekazać `{ signal: AbortSignal.timeout(10_000) }` do wywołań … |
| sredni | skala-pozniejsza | S | `app/lib/workouts.ts:405` | Wyszukiwanie na wszystkich listach to ILIKE '%fraza%' bez indeksu trigramowego | Gdy jakakolwiek lista przekroczy ~10 tys. wierszy: `CREATE EXTENSION pg_trgm` + `CREATE INDEX ... USING gin (kolumna gin_trgm_ops)` na `workout_logs.session_name`, `ex… |
| sredni | skala-pozniejsza | S | `docker-entrypoint.sh:24` | Rekurencyjny chown całego wolumenu przy każdym starcie kontenera | Zamienić na warunkowy jednorazowy chown: sprawdzić właściciela samego `$DATA_DIR` (`stat -c %u`) i tylko przy niezgodności zrobić `chown -R`, dodatkowo zostawiając pli… |
| sredni | wydajnosc-db | M | `app/lib/stats.ts:212` | getHealthStats: 8 zapytań jedno po drugim, w tym trzy prawie identyczne COUNT-y | Scalić `s7`/`s30`/`adRow`/`bounds` w jedno zapytanie z agregatami warunkowymi (`COUNT(*) FILTER (WHERE performed_on >= ...)`), a pozostałe niezależne zapytania (histRp… |
| sredni | wydajnosc-db | S | `app/lib/progression.ts:272` | getProgressionComparison: zapytanie w pętli po ćwiczeniach (klasyczne N+1) | Rozszerzyć `loadProgressionSessions` o wariant przyjmujący listę id (`inArray(workoutExerciseLogs.exerciseId, ids)`) i wywołać ją raz — funkcja i tak zwraca `Map<exerc… |
| sredni | wydajnosc-db | M | `app/lib/plans.ts:206` | createDraftFromActive klonuje plan ~70 osobnymi zapytaniami wewnątrz jednej transakcji | Odczytać całe źródłowe drzewo trzema zapytaniami (sesje, bloki po `inArray(sessionIds)`, pozycje po `inArray(blockIds)` — dokładnie tak, jak robi to już `loadPlanForTr… |
| sredni | wydajnosc-db | S | `app/lib/db/schema.ts:138` | Kolumny FK do plików bez indeksów — usunięcie podopiecznego to seq scan na każdy plik | Dodać indeksy: `files(uploaded_by)`, `workout_set_logs(video_file_id)`, `exercises(demo_file_id)`, `body_photos(file_id)`. Cztery linie w schema.ts + jedna migracja. Z… |
| sredni | wydajnosc-db | S | `app/routes/podopieczny/_index.tsx:139` | Pulpit podopiecznego liczy tę samą agregację miesięcy dwa razy | Usunąć `getLatestAvailableWrapped` z `Promise.all` i wyliczyć banner z już pobranej listy: `const latestWrapped = wrappedMonths[0] ?? null;`. Jedna linia mniej w loade… |
| sredni | wydajnosc-db | S | `app/routes/podopieczny/historia._index.tsx:45` | Każdy loader listy robi COUNT i SELECT sekwencyjnie zamiast równolegle | Zamienić na `const [total, rows] = await Promise.all([count..., list...])`, licząc offset ze strony żądanej, a clamp `safePage` stosować dopiero po otrzymaniu obu wyni… |
| sredni | wydajnosc-frontend | S | `app/lib/files.ts:12` | Podpisane URL-e plików mają zmienne `exp` — cache przeglądarki nigdy nie trafia | Zaokrąglić `exp` do stabilnego kubełka, np. `const exp = (Math.floor(Date.now()/1000/3600) + 24) * 3600` — URL jest wtedy identyczny przez godzinę, cache przeglądarki … |
| sredni | wydajnosc-frontend | S | `app/routes/trener/podopieczni.$traineeId.sylwetka.tsx:34` | Widok sylwetki u trenera ładuje 500 pełnowymiarowych zdjęć bez paginacji | Użyć tego samego mechanizmu co u podopiecznego: `parsePage` + `PAGE_SIZE` + `countBodyPhotosForTrainee` + `<Pagination>` (wszystko już istnieje w repo). Filtr ujęcia p… |
| sredni | wydajnosc-frontend | S | `app/routes/trener/biblioteka._index.tsx:290` | Biblioteka ćwiczeń: 24 elementy <video preload="metadata"> odpalane naraz przy wejściu | Zmienić na `preload="none"` i pokazywać istniejący placeholder `.video-tile` (`scanlines` + `label DEMO` + ikona Play) jako domyślny stan, ładując metadane dopiero po … |
| sredni | wydajnosc-frontend | S | `app/lib/money.ts:23` | Cała biblioteka Zod (12 KB gzip) trafia do bundla klienta przez app/lib/money.ts | Rozdzielić moduł: `fmtMoney`/`parsePlnToGrosze` (czyste, bez zależności) zostają w `app/lib/money.ts`, a `MonthlyAmountSchema` przenieść do `app/lib/money.server.ts` (… |
| sredni | wydajnosc-frontend | S | `vite.config.ts:22` | Precache PWA obejmie wszystko (~360 KB) — łącznie z trasami trenera i visx — gdy tylko SW zostanie włączony | Zawęzić precache do rzeczy współdzielonych i naprawdę potrzebnych: `globPatterns: ["**/*.{css,woff2,svg,ico}"]`, a chunki JS obsłużyć runtime'owo — dopisać do `runtime… |
| sredni | wydajnosc-frontend | M | `app/routes/podopieczny/sylwetka.tsx:265` | Brak zmniejszania zdjęcia po stronie klienta — telefon wysyła oryginał, limit klienta to 250 MB | Zmniejszać w przeglądarce przed wysyłką: w `FileDropzone` dla `kind === "image"` przepuścić plik przez `createImageBitmap` + `OffscreenCanvas`/`canvas` do max 1600 px … |
| sredni | wydajnosc-runtime | S | `app/routes/trener/_index.tsx:23` | Pulpit trenera: 5 niezależnych zapytań sekwencyjnie zamiast Promise.all | `const [clients, recentLogs, activePlansRow, draftsRow, weekSessionsRow] = await Promise.all([...])`. Trzy COUNT-y na `plans`/`workout_logs` można dodatkowo zbić do je… |
| sredni | wydajnosc-runtime | M | `app/lib/stats.ts:218` | `getHealthStats` robi 8 zapytań sekwencyjnie w środku Promise.all — serializuje najcięższą stronę trenera | Zamknąć niezależne zapytania w `Promise.all` wewnątrz `getHealthStats` (bounds, s7, s30, recentLogs, histRpe, redZone, allDone), a `recentRpe` policzyć w drugiej fali … |
| niski | obserwowalnosc | S | `app/lib/env.ts:35` | Brak logu startowego — nie wiadomo z jaką konfiguracją wstał proces | Dodać w `app/lib/env.ts` na końcu `getEnv()` (przy pierwszym parsowaniu, więc raz na proces): `logger.info("boot", {nodeEnv: parsed.NODE_ENV, dataDir: parsed.DATA_DIR,… |
| niski | obserwowalnosc | S | `app/routes/webhooks.stripe.tsx:62` | Webhook nie loguje sukcesu, a log błędu nie niesie event.id | Po udanym `applyChange`: `logger.info("stripe_webhook.processed", { eventId: event.id, type: event.type, kind: change?.kind ?? "ignored" })`. Dopisać `eventId` do `app… |
| niski | skala-pozniejsza | L | `app/routes/files.$fileId.tsx:67` | Cały ruch mediów idzie przez proces aplikacji na jednej instancji, bez CDN | Na teraz nic nie zmieniać — architektura jest proporcjonalna do skali. Gdy pojawi się realny ruch, w tej kolejności: (1) miniatury (osobne znalezisko) zdejmują 90% baj… |
| niski | skala-pozniejsza | M | `Dockerfile:40` | Obraz produkcyjny instaluje wszystkie devDependencies (vitest, playwright, testcontainers, vite) | W etapie runtime: `npm ci --omit=dev`, a `drizzle-kit` uruchamiać w osobnym kroku deployu (Railway pre-deploy command) albo skopiować z etapu build tylko potrzebne bin… |
| niski | wydajnosc-db | S | `app/routes/podopieczny/_index.tsx:136` | Dashboard podopiecznego wykonuje to samo zapytanie o miesiące wrapped dwa razy | Zostawić w `Promise.all` tylko `getAvailableWrappedMonths`, a `latestWrapped` wyliczyć jako `wrappedMonths[0] ?? null` po rozwiązaniu obietnic. |
| niski | wydajnosc-frontend | S | `app/root.tsx:64` | Fonty (139 KB, 6 plików) odkrywane dopiero po pobraniu i sparsowaniu CSS | Dodać w `<head>` w app/root.tsx dwa preloady dla fontu tekstowego: `<link rel="preload" href="/fonts/DMSans-latin.woff2" as="font" type="font/woff2" crossOrigin="anony… |
| niski | wydajnosc-frontend | S | `app/lib/format.ts:25` | fmtDate miesza parsowanie UTC z lokalnymi getterami — data o dzień w tył i rozjazd hydracji | Zamień w `fmtDate` i `fmtDateShort` gettery na `getUTCDate()`/`getUTCMonth()`/`getUTCFullYear()` — spójnie z `fmtDateTime`. Dwie linie. Docelowo (razem z poprzednim zn… |
| niski | wydajnosc-frontend | S | `app/routes/trener/konsultacje.tsx:26` | Date.now() wywoływane w trakcie renderu widoków konsultacji — rozjazd SSR ↔ hydracja | Wyliczać `nowMs` w loaderze i przekazywać przez dane trasy (loader działa tylko na serwerze, więc SSR i hydracja dostają tę samą liczbę) — analogicznie do tego, jak `t… |
