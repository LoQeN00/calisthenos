# Zgoda Google przez dwa hosty — ciastko nonce'a na domenie nadrzędnej

**Data:** 2026-09-04
**Status:** projekt zaakceptowany w brainstormie; czeka na plan wykonania
**Poprzednik:** [`2026-08-29-integracja-fe-be-design.md`](2026-08-29-integracja-fe-be-design.md)
**Zamyka:** lukę **LK1** z [`../plans/2026-09-03-reszta-app-lib-na-kontrakcie.md`](../plans/2026-09-03-reszta-app-lib-na-kontrakcie.md) §7

---

## 1. Driver i zakres

Etap 2 integracji przepiął na kontrakt wszystkie obszary `app/lib` poza jednym. Przepływ „Połącz
z Google" został na Drizzle, bo przy FE wołającym BE **serwer-do-serwera** ciastko z nonce'em
ustawiane przez `POST /v1/calendar/connection/authorize` ląduje u serwera FE, a nie w przeglądarce
— więc callback, na który Google odsyła przeglądarkę, nie ma czego porównać ze `state`.

Ten projekt przenosi ostatni obszar. Po nim kalendarz zewnętrzny należy w całości do BE, a FE nie
zna ani protokołu OAuth, ani szyfrowania tokenów, ani tabeli połączeń.

**Jest to jednocześnie warunek cutoveru, nie tylko sprzątania.** `Migration20260801120000` po
stronie BE przemianowuje `google_calendar_connections` na `calendar_connections` i podmienia klucz
główny. Baza jest jedna i ta sama, więc w chwili, gdy migracje BE pójdą na żywą bazę w Etapie 3,
kod Google w FE przestaje działać — tabeli pod tą nazwą już nie ma. „Zostawić Google na Drizzle
i zrobić cutover" nie jest wariantem.

### Poza zakresem

- **Usunięcie `app/lib/db/`, Drizzle i reszty bazy z FE.** To segment S6; ten projekt jest jego
  warunkiem wejścia, nie jego częścią.
- **Zmiana adresu trasy** `/trener/integracje/google` na neutralny wobec dostawcy. Dostawca jest
  wartością pola `provider` (ADR-0012), więc nazwa trasy jest dziś niezgodna z tą zasadą — ale
  integracja nie zmienia funkcji ani adresów, a zmiana adresu jest widoczna dla użytkownika.
- **Public Suffix List.** Patrz §4, gdzie granica asercji jest opisana wprost.

## 2. Stan wyjściowy

| | FE (`be-integration`) | BE (`main`) |
|---|---|---|
| Kto trzyma połączenie | `google_calendar_connections` przez Drizzle | `calendar_connections` przez MikroORM |
| Kto podpisuje `state` | `SESSION_SECRET` | `clientSecret` integracji |
| Co jest w `state` | `{ nonce, exp }` — **nonce wprost** | `{ trainerId, nonce: skrót, exp }` |
| Ciastko nonce'a | `goauth_nonce`, host FE, `Path=/trener/integracje/google` | `kal_calendar_nonce`, host BE, `Path=/v1/calendar/connection/callback` |
| `GOOGLE_REDIRECT_URI` | `${BASE_URL}/trener/integracje/google/callback` — **trasa FE** | trasa BE |
| Kto wymienia `code` | `app/lib/google/oauth.ts` | `CALENDAR_TOKEN_EXCHANGE` |

Wersja BE jest mocniejsza w jednym konkretnym miejscu i to jest własność do zachowania: w `state`
siedzi **skrót** nonce'a, nie sam nonce. `state` wycieka — do historii przeglądarki, do nagłówka
`Referer`, domyślnie do logu żądania — więc nonce włożony do niego wprost przestaje być sekretem,
a druga bramka przestaje cokolwiek znaczyć.

Kontrakt wystawia cztery trasy i klient `0.3.0` ma je wszystkie:
`calendarConnectionControllerGet`, `…Authorize`, `…Callback`, `…Disconnect`.

## 3. Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| **D1** | **Ciastko nonce'a dostaje `Domain` z konfiguracji BE; przeglądarka wraca prosto na callback BE** | jedyny wariant, w którym cały przepływ zgody zostaje w kontekście, który nim włada, a kontrakt OpenAPI nie zmienia się ani o pole. Przeglądarka i tak musi widzieć BE — spec integracji §4 przyjął to dla podpisanych odnośników do plików |
| **D2** | **FE przekazuje `Set-Cookie` z odpowiedzi `authorize` na własnej odpowiedzi przekierowującej** | ciastko powstaje w odpowiedzi, której ciało niesie adres zgody, i wiąże je ze sobą `state`; rozdzielenie tych dwóch rzeczy znaczyłoby wystawienie drugiej trasy. Jest to **jedyny** wyjątek od reguły „warstwa klienta nie przenosi ciastek BE" i jako wyjątek jest opisany i przypięty testem |
| **D3** | **Odrzucone: callback wracający do FE** (nonce w ciastku FE, `code` dosyłany serwer-do-serwera) | działa i jest niezależny od topologii wdrożenia, ale zostawia mechanikę OAuth w powłoce — wbrew tezie specu integracji „w FE zostają trasy, komponenty, system designu, PWA i tłumaczenie błędów; nic poza tym" — oraz wymaga nowej trasy w kontrakcie, changesetu i wydania klienta. Klient natywny, który jest driverem całego rozbicia, trafiłby wtedy na callback przez web, którego nie ma |
| **D4** | **Odrzucone: BE przyjmuje callback bez ciastka, gdy `state` niesie drugi sekret znany tylko FE** (wariant (c) planu) | sekret dzielony między dwa serwery wiąże zgodę z **serwerem**, nie z przeglądarką. Druga bramka przestaje istnieć, a jej celem jest dokładnie to, czego ten wariant nie robi |
| **D5** | **Odrzucone: przeglądarka woła `authorize` wprost** (wariant (b) planu) | wymaga CORS-u i tokenu dostępowego w przeglądarce — wprost sprzeczne z D3 specu integracji |
| **D6** | **Cicha zależność od DNS zamieniona w błąd startu** | konfiguracja BE ma **obie** wartości potrzebne do sprawdzenia (`redirectUri` i `webAppUrl`), więc rozjazd hostów da się wykryć przy walidacji środowiska. Bez tego objawem jest `reason=state` przy każdej zgodzie — nieodróżnialne od prawdziwej odmowy CSRF |

## 4. Konfiguracja i asercja startowa (BE)

**Nowa zmienna `CALENDAR_COOKIE_DOMAIN`, opcjonalna.** Pusta znaczy „bez atrybutu `Domain`", czyli
dzisiejsze zachowanie: ciastko hosta BE. Tak działa dev, gdzie FE stoi na `localhost:3000`,
a BE na `localhost:3001` — ciastka ignorują port, więc jeden host obsługuje oba.

**Zmienna NIE wchodzi do `CALENDAR_KEYS`** (`env.schema.ts`). Ta lista mówi „komplet albo nic",
a domena ciastka jest opcjonalna także przy włączonej integracji — wdrożenie jednohostowe jest
poprawne i ma zostać poprawne.

`nonceCookieOptions(isProduction)` dostaje drugi parametr; `domain` doklejane wyłącznie, gdy
niepuste. Zmiana dotyka `NonceCookieOptions` w `oauth-callback.ts`, `CookieOptions`
w `calendar.controller.ts` (oba pola opcjonalne) i kształtu `calendar` w `AppConfig`.

**Asercja** trafia do istniejącego `superRefine` w `env.schema.ts`, obok reguły „komplet albo nic".
Przy włączonej integracji przeglądarka musi umieć wysłać ciastko z hosta `WEB_APP_URL` do hosta
`GOOGLE_REDIRECT_URI`:

- `CALENDAR_COOKIE_DOMAIN` pusta → **hosty muszą być identyczne**;
- ustawiona → musi być przyrostkiem domenowym obu (`host === d` albo `host` kończy się na `.` + `d`).

**Czego ta asercja nie łapie, powiedziane wprost:** domeny publicznej. `railway.app` jest
przyrostkiem `api.up.railway.app`, więc przejdzie sprawdzenie — a przeglądarka ciastko z takim
`Domain` odrzuci, bo nazwa jest na Public Suffix List. Wciąganie PSL do repozytorium za jedną
zmienną środowiskową jest złą wymianą: lista żyje własnym cyklem i wymaga aktualizacji, której
nikt nie będzie robił. Zamiast tego dokumentacja mówi wprost, że domena musi być **rejestrowalna**
(`kalisthenos.pl`), a nie domeną dostawcy hostingu (`up.railway.app`). Asercja łapie dwa z trzech
sposobów zepsucia tego: literówkę i rozjazd hostów.

## 5. Warstwa klienta (FE)

Nowy moduł `app/lib/calendar.ts`. **Nie `google/`** — dostawca jest wartością pola `provider`,
nie częścią nazwy (ADR-0012), a `CalendarConnectionView.provider` jest już `string`, nie enumem,
właśnie po to, żeby drugi dostawca był zmianą addytywną.

Trzy funkcje, nie cztery: `runConsultationSync` przeszła na kontrakt razem z konsultacjami w S3
i zostaje w `consultations.ts`.

```ts
/** Adres ekranu zgody wraz z ciastkiem, które przeglądarka musi dostać razem z nim. */
export interface CalendarAuthorization {
  readonly url: string;
  readonly setCookie: string[];
}

export async function getCalendarConnection(api: Api): Promise<CalendarConnectionView>
export async function startCalendarAuthorization(api: Api): Promise<CalendarAuthorization>
export async function disconnectCalendar(api: Api): Promise<void>
```

Sedno projektu siedzi w środkowej:

```ts
const { data, response } = await calendarConnectionControllerAuthorize({
  client: api,
  throwOnError: true,
});
return { url: data.url, setCookie: response.headers.getSetCookie() };
```

`throwOnError: true` przy domyślnym `responseStyle: 'fields'` daje `{ data, request, response }`,
więc surowa `Response` jest osiągalna bez schodzenia do gołego `fetch` — warstwa klienta zostaje
jednym wejściem do BE.

Akcja „Połącz" w `integracje.google.tsx` przekierowuje na `data.url`, doklejając te nagłówki do
własnej odpowiedzi. Nagłówków może być więcej niż jeden, więc budowane są przez `Headers.append`,
nie literałem obiektu — obiekt zgubiłby wszystkie poza ostatnim.

Kontrakt sam mówi, dlaczego inaczej się nie da; docblock `CalendarAuthorizeResponse.url`:
„Klient ma na niego **przekierować**, a nie pobrać go w tle: zgoda jest nawigacją użytkownika,
a `state` wiąże ją z cookie ustawionym przy tej samej odpowiedzi".

## 6. Powrót z callbacku

BE odsyła przeglądarkę na `WEB_APP_URL` z `?calendar=ok` albo z `?calendar=error` i `reason`
o wartości `denied`, `state` lub `exchange` — czyli na **korzeń aplikacji**. Dziś użytkownik
wraca wprost na `/trener/integracje/google`.

`app/routes/_index.tsx` (21 linii, zawsze przekierowuje) dostaje jedną gałąź **przed**
rozgałęzieniem na rolę: obecność `?calendar` przekierowuje na ekran integracji z zachowanymi
parametrami. Ekran czyta `calendar` i `reason` zamiast dzisiejszych `ok` i `error`; mapa
komunikatów zostaje ta sama, bo powody są te same trzy.

Sesja, która wygasła w trakcie rundy po zgodę, **nie potrzebuje tu przypadku szczególnego**:
gałąź przekierowuje bez patrzenia na użytkownika, a ekran integracji i tak wymaga trenera, więc
martwa sesja kończy na `/login` — tak samo, jak skończyłaby bez tej gałęzi. Sprawdzenie
tożsamości stoi w jednym miejscu i ma tam zostać.

**Odrzucone: wskazanie `WEB_APP_URL` na ekran integracji.** Zmienna jest ogólna i ma dziś jednego
konsumenta, ale wciśnięcie w nią ścieżki jednej funkcji psuje ją dla następnego. BE nie ma się
uczyć polskich nazw tras powłoki — to jest własność FE i ma nią zostać.

## 7. Co znika z FE

| Co | Ile |
|---|---|
| `app/lib/google/` w całości — `connections.ts`, `oauth.ts`, `crypto.ts` + dwa testy | 307 linii kodu, 62 testu |
| `app/routes/trener/integracje.google.callback.tsx` + wpis w `app/routes.ts` | 53 linie |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENC_KEY` i `googleConfigured()` z `env.ts` | 5 wpisów |
| zależności `@googleapis/calendar` i `google-auth-library` z `package.json` | 2 |
| martwy odsyłacz w `format.ts:9` do `lib/google/calendar.ts`, usuniętego w S3 | komentarz |

**Edycja `package.json` bez `npm install`** — instalację prowadzi Właściciel, tak samo jak git.

**`app/lib/db/schema.ts` zostaje nietknięty**, choć `googleCalendarConnections` traci ostatniego
czytelnika. Powód jest konkretny: edycja schematu kusi do `npm run db:generate`, a dwudziesta
migracja po stronie FE unieważnia baseline MikroORM w ciszy (`CLAUDE.md` korzenia). Plik znika
w całości w S6 — niech usunie go ten, kto usuwa też migracje.

## 8. Testy

**BE.** Trzy przypadki asercji w `env.schema.spec.ts`: domena pusta i hosty równe → przechodzi;
domena pusta i hosty różne → błąd; domena ustawiona, nie jest przyrostkiem jednego z hostów → błąd.
Dwa przypadki na `nonceCookieOptions` w `oauth-callback.spec.ts` — z domeną i bez. Plik już
istnieje i jest tam, gdzie ta logika mieszka poza pomiarem kontrolera (odchylenie D27).

**FE.** `app/lib/calendar.test.ts` przeciw podstawionemu klientowi. Przypadek najważniejszy:
**przekazanie `Set-Cookie`**, w tym wariant z dwoma nagłówkami. To jedyna rzecz w tym projekcie,
która może zgnić po cichu — jej awaria wygląda jak zwykła odmowa CSRF, czyli jak poprawne
działanie bramki.

**Bramka.** „Nic w `app/` nie importuje `~/lib/google`" — bliźniak istniejącego
`app/routes/no-stara-sesja.test.ts`, ten sam wzorzec i to samo uzasadnienie: katalog usunięty
z drzewa wraca przez `git revert` albo przez nieuważne scalenie, a wtedy milczy do wdrożenia.

## 9. Ryzyka

| Ryzyko | Waga | Odpowiedź |
|---|---|---|
| Domena ciastka na Public Suffix List — przeglądarka odrzuca ciastko, każda zgoda kończy się `reason=state` | **wysoka** | asercja tego nie łapie (§4); dokumentacja mówi wprost o domenie rejestrowalnej, a próba połączenia jest pozycją listy kontrolnej cutoveru |
| `GOOGLE_REDIRECT_URI` w konsoli Google nie zgadza się z nowym adresem BE | średnia | wartość zmienia się razem z topologią wdrożenia; pozycja w Etapie 3 specu integracji, do zrobienia przed pierwszą próbą |
| Przekazanie `Set-Cookie` zgubione przy refaktoryzacji warstwy klienta | średnia | wyjątek opisany w module i przypięty testem z dwoma nagłówkami |
| Utrata parametrów zwrotnych przy przejściu przez korzeń | niska | gałąź w `_index.tsx` przed rozgałęzieniem na rolę, pokryta testem trasy |

## 10. Dokumentacja

- **ADR po stronie BE** — „domena ciastka nonce'a przy dwóch hostach". Decyzja trudno odwracalna:
  wiąże działanie funkcji z topologią DNS wdrożenia, a jej złamanie jest ciche. Numer kolejny
  po ADR-0035.
- `README.md` i `.env.example` **obu** repozytoriów; tabela zmiennych Railway w FE.
- `app/lib/README.md`, `app/routes/trener/README.md`, `app/lib/google/README.md` (znika razem
  z katalogiem).
- `docs/superpowers/specs/README.md` i `docs/superpowers/plans/README.md` — wpis o tym projekcie.
- Luka **LK1** w `../plans/2026-09-03-reszta-app-lib-na-kontrakcie.md` §7 — oznaczona jako
  zamknięta, wzorem `L S3-2`.

---

## Załącznik A — inwentarz dotykanych plików

### `calisthenos-be`

| Plik | Zmiana |
|---|---|
| `libs/shared/config/src/lib/env.schema.ts` | `CALENDAR_COOKIE_DOMAIN`; asercja zgodności hostów w `superRefine` |
| `libs/shared/config/src/lib/env.schema.spec.ts` | trzy przypadki asercji |
| `libs/shared/config/src/lib/app-config.service.ts` | `cookieDomain` w kształcie `calendar` |
| `libs/consultations/src/lib/calendar/oauth-callback.ts` | `nonceCookieOptions` z domeną; `NonceCookieOptions.domain` |
| `libs/consultations/src/lib/calendar/oauth-callback.spec.ts` | dwa przypadki |
| `libs/consultations/src/lib/calendar/calendar.controller.ts` | `CookieOptions.domain`; przekazanie domeny w dwóch wywołaniach |
| `docs/adr/0036-domena-ciastka-nonce-przy-dwoch-hostach.md` | nowy |
| `.env.example`, `README.md` | nowa zmienna |

**Kontrakt OpenAPI się nie zmienia** — `pnpm oasdiff` zostaje zielony, nie ma changesetu ani
wydania klienta.

### `calisthenos-fe`

| Plik | Zmiana |
|---|---|
| `app/lib/calendar.ts` | **nowy** — trzy funkcje |
| `app/lib/calendar.test.ts` | **nowy** |
| `app/routes/trener/integracje.google.tsx` | loader z `GET /v1/calendar/connection`; akcje przez kontrakt; nowe nazwy parametrów zwrotnych |
| `app/routes/trener/integracje.google.callback.tsx` | **usunięty** |
| `app/routes.ts` | wpis callbacku usunięty |
| `app/routes/_index.tsx` | gałąź `?calendar` |
| `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx` | `isGoogleSyncActive(db, …)` → stan z kontraktu (jedna linia loadera) |
| `app/lib/google/` | **usunięty w całości** |
| `app/lib/env.ts` | cztery zmienne i `googleConfigured()` |
| `app/lib/format.ts` | martwy odsyłacz w komentarzu |
| `package.json` | dwie zależności (**bez `npm install`**) |
| `app/routes/no-google-lib.test.ts` | **nowy** — bramka |
