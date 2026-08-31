# Warstwa klienta API w FE — `db` staje się `api`

**Data:** 2026-08-31
**Status:** projekt zaakceptowany w brainstormie; czeka na plan wykonania
**Nadrzędny:** [`2026-08-29-integracja-fe-be-design.md`](2026-08-29-integracja-fe-be-design.md) — Etap 2, krok 1

---

## 1. Driver i zakres

Etap 2 integracji wymienia wnętrze 24 modułów `app/lib` — 177 funkcji — z zapytań Drizzle na
wywołania kontraktu. Żeby ta wymiana była mechaniczna, musi wcześniej powstać jedna decyzja:
**czym zastąpić `db: Db`, które te moduły biorą pierwszym parametrem.**

Ten dokument ją rozstrzyga i buduje wszystko, co z niej wynika: warstwę klienta, sesję na
tokenach, jedność odświeżania i konfigurację adresów. Kończy się na `requireUser` i **jednym**
module domenowym przeprowadzonym na wylot jako dowód wzorca.

### Poza zakresem

- **Przepięcie pozostałych modułów** — to krok 3 Etapu 2, wykonywany po tym dokumencie
  i według wzorca, który on ustala.
- **Pliki, płatności, usunięcie bazy** — kroki 4–6 Etapu 2.
- **Zmiana bramki `no-direct-db.test.ts`** — krok 7. Do tego czasu bramka obowiązuje w obecnej
  postaci i przechodzi, bo nowa warstwa nie importuje schematu.

## 2. Stan wyjściowy — zmierzony, nie założony

| Fakt | Wartość | Skąd |
|---|---|---|
| Moduły biorące `db: Db` | **29 plików** | `grep` po `app/lib` |
| Funkcje deklarujące `Promise<… \| null>` | **37** | jw. |
| Miejsca w trasach robiące `throw new Response(…, { status: 404 })` | **40** | `grep` po `app/routes` |
| Wywołania `requireUser` | **77 w 51 plikach tras** | jw. |
| React Router — **zainstalowany** | **7.15.1** (deklaracja to `^7.1.0`) | `node_modules` |
| Klient API | hey-api, **98 funkcji SDK**, `auth` przyjmuje **async callback** | `libs/client/src/generated` |
| Token odświeżający BE | `randomBytes(32).toString('base64url')` — nieprzezroczysty, 43 znaki | `session.service.ts` |
| Repliki FE na Railway | **niedeklarowane** → jeden proces | `railway.toml` |

Dwie rzeczy z tej tabeli zmieniają projekt wobec tego, co zakładał spec nadrzędny.

**React Router jest nowszy, niż mówi `package.json`.** Zainstalowane 7.15.1 daje
`MiddlewareFunction`, `RouterContextProvider`, `createContext` i flagę `v8_middleware`.
`entry.server.tsx` ma nawet gotową zakomentowaną linijkę `loadContext: RouterContextProvider`.
Middleware jest więc dostępne bez podnoszenia zależności.

**BE nie odmawia przegranemu wyścigu — gasi całą sesję.** `SessionService.rotate` rozstrzyga
trzy przypadki, a drugi z nich brzmi dosłownie: „`reused` — `rotated_at` było już niepuste,
czyli **DOWÓD ponownego użycia** → gasimy cały łańcuch i odmawiamy" (`deleteChain(chainId)`).
Spec nadrzędny opisywał to jako „użytkownik wyleci na logowanie bez powodu". W rzeczywistości
wylatuje **wszędzie**, wygrany wyścigu razem z przegranym, a zdarzenie wygląda w logach jak
kradzież tokenu. Ponieważ React Router uruchamia loadery równolegle z założenia, trafiałoby to
każdą nawigację, w której token dostępowy akurat wygasł. Jedność odświeżania nie jest więc
uprzejmością wobec użytkownika, tylko warunkiem poprawności.

## 3. Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D1 | **Włączamy `future: { v8_middleware: true }`; klient i użytkownik jadą przez `context`** | rotacja wymaga zapisania **nowego** tokenu do ciastka, a loader w nawigacji dokumentowej nie ma jak dołożyć `Set-Cookie`. Middleware biegnie raz na żądanie i **wokół** loaderów, więc ma i moment przed nimi, i drogę powrotną. Wariant bez flagi (klient memoizowany na `WeakMap` po obiekcie `Request`) daje serializację, ale zostawia zapis ciastka nierozwiązany — czyli tę połowę, która wylogowuje |
| D2 | **Middleware ładuje też użytkownika — jedno `GET /v1/me` na żądanie** | `requireUser` jest wołane 77 razy, a trasy są zagnieżdżone: jedna nawigacja odpala loader layoutu i loader liścia. Bez tego każde kliknięcie to dwa–trzy identyczne strzały po sieci. Przy okazji `requireUser` przestaje być asynchroniczne, więc przestaje być miejscem, w którym może powstać wyścig |
| D3 | **`throwOnError: true`; `404` łapią wyłącznie funkcje deklarujące `\| null`** | 37 funkcji zwraca dziś `null` dla braku, a 40 miejsc w trasach zamienia to na `404`. Gdyby `404` leciał wyjątkiem z modułu, te 40 miejsc stałoby się martwym kodem i krok 3 przestałby być mechaniczny. Regułę wyznacza **sygnatura**, nie ocena — agent w kroku 3 nie zgaduje, a błędna ścieżka w kliencie nie zamienia się cicho w pusty ekran tam, gdzie brak nie jest przewidziany |
| D4 | **Okno łaski rotacji stoi po stronie FE, nie BE** | zamyka wyścig bez dotykania drugiego repozytorium i bez osłabiania detekcji kradzieży, którą BE zbudował celowo — ta zostaje surowa dla aplikacji mobilnej. Cena: stan w pamięci procesu, ważny dopóki FE biegnie w jednej instancji (§6) |
| D5 | **Dwa adresy bazowe: `API_URL` i `API_PUBLIC_URL`** | BE musi być publiczny dla plików tak czy inaczej, ale przepychanie każdego loadera przez publiczny internet to zbędny TLS, opóźnienie i egress |

## 4. Kształt warstwy

```
app/lib/api/
  client.ts      createApiClient(getToken) → Api          (nowe)
  context.ts     createContext<ApiBundle>()               (nowe)
  middleware.ts  sesja → klient → użytkownik → ciastko    (nowe)
  refresh.ts     jedność odświeżenia                      (nowe)
  errors.ts      ApiError, parseApiError, toRouteResponse  (jest)
  session.ts     ciastko __Host-kth_api, needsRefresh      (jest)
```

`Api` to skonfigurowany klient hey-api wyeksportowany jako **typ o jednej nazwie** — dokładnie
tak, jak dziś `Db` z `app/lib/db/client.ts`. To jest cała odpowiedź na pytanie z §1: nic
koncepcyjnie nowego. Ta sama pozycja w sygnaturze, ta sama konwencja wstrzykiwania, inny typ.

```ts
// moduł — dziś
export async function listClientsForTrainer(db: Db, trainerId: string, opts: ClientListOpts)

// moduł — po
export async function listClientsForTrainer(api: Api, trainerId: string, opts: ClientListOpts) {
  const { data } = await traineesControllerList({ client: api, query: { page, q, sort } });
  return data;
}
```

```ts
// trasa — dziś
const user = await requireUser(request, db, { role: "trainer" });
const rows = await listClientsForTrainer(db, user.id, opts);

// trasa — po
const { api, user } = requireUser(context, { role: "trainer" });   // bez await, bez sieci
const rows = await listClientsForTrainer(api, user.id, opts);
```

Zmiana w trasie to `import { db }` → `context` w argumentach loadera. Zmiana w module to
`Db` → `Api` w imporcie i sygnaturze plus wymiana wnętrza. Jeden wzorzec, zero decyzji
do podjęcia po drodze — dlatego krok 3 nadaje się do rozdania równoległym agentom.

`requireUser` zwraca `{ api, user }`, a nie sam `user`: loader potrzebuje obu, a jedno wywołanie
zamiast dwóch odczytów z `context` zmniejsza liczbę miejsc, w których trasa może o czymś
zapomnieć. Kontrola roli staje się **sprawdzeniem przynależności do listy** (`roles` z `/v1/me`,
ADR-0013), nie równością — zmiana dzieje się w jednym pliku zamiast w 51.

## 5. Cykl życia jednego żądania

Middleware jest **jedynym** miejscem, które dotyka sesji.

1. **Brak ciastka** → do `context` idzie klient anonimowy i `user: null`, `next()`, koniec.
   Na tym działają `/login`, `/zaproszenie/$token` i `/healthz`.
2. **Jest sesja.** Jeśli `needsRefresh` (30 s marginesu przed faktycznym wygaśnięciem) — odśwież
   **teraz**, przed loaderami. To jest mechanizm, który zabija wachlarz: loadery nigdy nie
   odświeżają, bo zastają token świeży.
3. **Buduje klienta** z `auth: () => holder.session.accessToken` i interceptorem odpowiedzi.
   Interceptor na `401` odświeża **raz** i powtarza żądanie — siatka na token, który umarł
   w locie między krokiem 2 a wywołaniem. Interceptor woła tę samą `refreshOnce` co krok 2;
   drugiej drogi do `POST /v1/auth/refresh` nie ma.
4. **`GET /v1/me`** → `user` z `roles` jako listą. Jedno wywołanie na żądanie zamiast 77.
5. `context.set(apiContext, { api, user })`.
6. `const res = await next()` — biegną loadery.
7. **W drodze powrotnej:** jeśli sesja zmieniła się w kroku 2 albo w interceptorze,
   `res.headers.append("Set-Cookie", buildSessionCookie(session))`. Dlatego sesja jest
   **zmiennym uchwytem**, nie wartością — odświeżenie, które zaszło w środku loadera, musi być
   widoczne tutaj.
8. **Porażka odświeżenia albo `401` na `/me` mimo świeżego tokenu** → sesja jest martwa:
   wyczyść ciastko i `redirect("/login")`. Gdy celem już jest `/login`, middleware tylko czyści,
   żeby nie zapętlić przekierowania.

**Gdy odświeżenie padnie wewnątrz loadera**, czyli w interceptorze z kroku 3, sytuacja jest ta
sama, ale miejsce inne — middleware jest już za `next()` i nie ma jak zawrócić. Interceptor
**rzuca wtedy `redirect("/login")` z `Set-Cookie` czyszczącym ciastko**, a nie `ApiError`.
React Router traktuje `Response` rzucony z loadera jako odpowiedź, więc przekierowanie dochodzi
do skutku niezależnie od tego, jak głęboko w stosie wywołań zaszła porażka. Moduł domenowy nic
o tym nie wie i niczego nie łapie — to jest cała różnica między błędem sesji a błędem danych.

## 6. Jedność odświeżenia

Wszystko przechodzi przez `refreshOnce(presented)` w `refresh.ts`. W środku trzy warstwy,
kluczowane **przedstawionym tokenem odświeżającym**, sprawdzane w tej kolejności:

| | Mechanizm | Zamyka przypadek |
|---|---|---|
| 1 | okno łaski — `Map<hash, { session, at }>`, 60 s | nieświeże ciastko: rotacja **już się skończyła**, a żądanie wyszło z przeglądarki wcześniej |
| 2 | mapa w locie — `Map<hash, Promise<ApiSession>>` | równoległe żądania **w trakcie** rotacji, na tej samej instancji |
| 3 | wywołanie `POST /v1/auth/refresh` | pierwszy, który dotarł |

Middleware wołający `refreshOnce` raz przed loaderami jest warstwą zerową — wachlarz loaderów
w ogóle nie dociera do tych map, bo nie odświeża.

Bez okna łaski (warstwa 1) zostaje realna dziura, i to nie egzotyczna: żądanie, które wyszło ze
starym ciastkiem, ale dotarło do FE po zakończeniu rotacji, nie ma czego doczekać — obietnica
jest rozwiązana, mapa w locie pusta, a przedstawiony token zużyty. Dla BE to `reused`, czyli
zgaszenie łańcucha. Trafiają w to: prefetch po najechaniu na link, `useFetcher` wysłany tuż
przed nawigacją, odświeżenie strony w drugiej karcie, powrót do uśpionego laptopa z dwiema
kartami rewalidującymi się naraz.

Szczegóły, które przesądzają, czy to działa:

- **Klucz jest haszowany (sha256), wartość nie może być.** W wartości siedzi nowa para, bo trzeba
  ją wpisać do ciastka. Hasz klucza kosztuje nic i sprawia, że przedstawiony token nie leży
  w pamięci procesu jawnie.
- **Pamięć nie rośnie.** Wygasanie po 60 s sprawdzane **leniwie przy odczycie**, plus twardy limit
  wpisów z wywalaniem najstarszych. Żadnych timerów — timer w procesie serwera trzeba potem
  sprzątać w testach i przy zamykaniu.
- **Restart procesu czyści obie mapy.** Najgorszy skutek to jedno zgaszenie łańcucha przy
  pechowym zbiegu z deployem. Świadomie akceptowane.
- **To stoi na jednym procesie.** `railway.toml` nie deklaruje replik, więc dziś FE biegnie
  w jednej instancji i pamięć procesu jest wiarygodnym miejscem na taki stan. **Zwielokrotnienie
  replik unieważnia warstwy 1 i 2** — wtedy albo sesje przyklejone do instancji, albo okno łaski
  musi przenieść się do BE (odrzucone w D4, bo osłabia detekcję kradzieży dla wszystkich
  klientów). To jest warunek wdrożeniowy, nie przypis.

## 7. Konfiguracja

Dwie pozycje w `EnvSchema` (`app/lib/env.ts`, zod, waliduje już resztę):

- **`API_URL`** — z serwera FE do BE, server-do-serwera. Na Railway może być adresem sieci
  prywatnej.
- **`API_PUBLIC_URL`** — trafia do HTML-a: `src` obrazków i wideo spod podpisanego
  `GET /v1/files/{id}` (ADR-0023), a w kroku 4 Etapu 2 także wysyłka plików.

Gdy `API_PUBLIC_URL` nie jest ustawione, równa się `API_URL`. To zamyka klasę błędu „działa
lokalnie, 502 na produkcji", bo w developmencie i w testach jeden adres wystarcza.

`getEnv()` jest wołane leniwie, wewnątrz fabryki klienta — inaczej niż w `db/client.ts`, gdzie
dzieje się to przy ładowaniu modułu. Dzięki temu import warstwy klienta nie wymaga ustawionego
środowiska, co ma znaczenie dla testów jednostkowych.

## 8. Testy — czym kończy się krok 1

1. **`refresh.ts` jednostkowo, bez sieci.** Trzy przypadki: dwa równoległe wywołania z tym samym
   tokenem → **jedno** trafienie do BE; wywołanie ze starym tokenem po zakończeniu rotacji,
   w oknie łaski → **zero** trafień i ta sama nowa para; to samo po 61 s → idzie do BE.
2. **Test, którego żąda spec nadrzędny — równoległe loadery jednej nawigacji.** Nie na atrapie
   `refresh.ts`, bo wtedy nie bada tego, co ma badać: musi przejść przez middleware. Kształt —
   podstawiony transport, sesja z wygasłym tokenem dostępowym, trasa z layoutem i liściem, oba
   loadery wołają moduł. Asercja: dokładnie **jedno** `POST /v1/auth/refresh` i dokładnie
   **jedno** `Set-Cookie` w odpowiedzi.
3. **Cykl życia ciastka w middleware.** Brak ciastka → anonim. Martwy token odświeżający →
   wyczyszczone ciastko i `redirect("/login")` bez pętli. Udane odświeżenie → `Set-Cookie`
   z nową parą.
4. **Reguła z D3.** `404` z funkcji deklarującej `| null` daje `null`; z każdej innej leci
   `ApiError`. Test pilnuje obu stron reguły, bo sama sygnatura niczego nie wymusza w runtime.
5. **Dowód wzorca:** jeden moduł domenowy przeprowadzony na wylot, z testami przeciw
   podstawionemu klientowi. Kandydat: `categories.ts` — trzy funkcje i pełne pokrycie kontraktem
   (`GET/POST /v1/exercise-categories`, `DELETE {id}`).
6. **Bramki FE:** `npm run typecheck`, `npm run lint`, `npx vitest run app`, `npm run build`.

Testów na testcontainerach ten krok nie dokłada — FE traci bazę, więc `tests/*.itest.ts` znika
w kroku 6, a nowa warstwa nie ma czego integrować poza kontraktem, który jest typowany.

## 9. Ryzyka

| Ryzyko | Waga | Odpowiedź |
|---|---|---|
| Zgaszenie łańcucha sesji przy równoległej rotacji | **wysoka** | trzy warstwy z §6 plus test 8.2; objaw jest losowy i po fakcie nieodróżnialny od kradzieży tokenu |
| Zwielokrotnienie replik FE po cichu unieważnia §6 | **wysoka** | warunek wdrożeniowy zapisany w §6, nie w przypisie; do sprawdzenia przy wdrożeniu Etapu 3 |
| `v8_middleware` to flaga zachowania v8 na aplikacji produkcyjnej | średnia | zmiana jest odwracalna do momentu przepięcia modułów; wchodzi na branchu `be-integration`, nie na `master` |
| Jedno `GET /v1/me` staje się warunkiem wyświetlenia czegokolwiek | niska | praktycznie i tak nim jest — prawie każdy ekran za logowaniem wołałby je sam; bez ciastka middleware nie woła nic |
| Reguła „`\| null` łapie 404" zastosowana mechanicznie tam, gdzie brak nie jest przewidziany | niska | regułę wyznacza sygnatura, a sygnatury pochodzą z działającego kodu, nie z nowej oceny |

## 10. Co przechodzi dalej

Krok 1 zostawia krokowi 2 (uwierzytelnianie) `requireUser` już przeniesione na `context` i rolę
już będącą listą — zostaje `login`, `wyloguj`, `zaproszenie/$token` i wystawienie sesji przy
logowaniu. Krokowi 3 zostawia wzorzec sprowadzony do jednej wymiany typu w sygnaturze
i jednego kształtu wnętrza, potwierdzony na `categories.ts`.

Bramka `no-direct-db.test.ts` przechodzi przez cały ten krok bez zmian — nowa warstwa nie
importuje schematu bazy. Jej zamiana na regułę „trasa nie woła klienta wprost, tylko przez
moduł" należy do kroku 7 i ma sens dopiero wtedy, gdy moduły faktycznie wołają klienta.
