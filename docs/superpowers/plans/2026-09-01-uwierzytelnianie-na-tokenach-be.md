# Uwierzytelnianie na tokenach BE — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprawić, żeby gałąź `be-integration` dała się zalogować: `login`, `wyloguj`
i `zaproszenie/$token` przechodzą na kontrakt BE, a stara sesja bazodanowa znika z drzewa.

**Architecture:** Krok 1 zbudował warstwę, która **czyta** tożsamość (`apiMiddleware` → `context` →
`requireUser`). Ten plan dokłada stronę **zapisującą**: nowy moduł `app/lib/api/auth-session.ts`
woła `POST /v1/auth/login`, `POST /v1/invites/{token}/accept` i `POST /v1/auth/logout`, a trasy
tylko go wołają i budują ciastko `__Host-kth_api` przez istniejące `buildSessionCookie`. Nic
w warstwie klienta nie zmienia się poza dołożeniem `retryAfter` do `ApiError`.

**Tech Stack:** React Router 7.15.1 (SSR, `v8_middleware`), `@kalisthenos/api-client` 0.3.0
(hey-api), vitest + happy-dom, zod, biome.

**Spec:** [`docs/superpowers/specs/2026-09-01-uwierzytelnianie-na-tokenach-be-design.md`](../specs/2026-09-01-uwierzytelnianie-na-tokenach-be-design.md)

## Global Constraints

- **Branch:** cała praca na `be-integration`. `master` jest gałęzią wdrożeniową realnej produkcji —
  nie commituj tam.
- **Komunikaty po polsku, identyfikatory w kodzie po angielsku.** Komentarze po polsku, w stylu
  `app/lib/api/errors.ts` i `session.ts`. **Każdy eksportowany symbol, pole interfejsu i nazwa
  parametru — po angielsku.** Na tej gałęzi złamano to już dwa razy i dwa razy wyłapał to przegląd.
- **Testy:** `globals: false` — importuj `describe`/`it`/`expect` z `vitest` jawnie. Nazwy
  `describe`/`it` po polsku. Komentarz w teście tłumaczy **dlaczego** przypadek istnieje, nie co
  robi kod.
- **Pliki testowe dotykające ciastka muszą mieć `// @vitest-environment node`** — domyślne
  `happy-dom` usuwa nagłówek `cookie` w konstruktorze `Request`, więc bez tego test cicho bada
  gałąź anonima. Wzorzec: `app/lib/api/middleware.test.ts:1-9`.
- **Pliki testowe wołające kod, który czyta `getEnv()`, muszą go zamockować:**
  `vi.mock("~/lib/env", () => ({ getEnv: () => ({ API_URL: "http://be.test" }) }))`. Wzorzec:
  `middleware.test.ts:18-20`.
- **Wywołania SDK potrzebujące `data` muszą podać `throwOnError: true` jawnie** — generyk funkcji
  SDK domyślnie schodzi do `false` i `data` typuje się jako `… | undefined`, mimo że klient i tak
  rzuca. Zero zmiany w czasie wykonania. Wzorzec: `categories.ts:29`.
- **Nie ruszaj** `app/lib/db/`, modułów domenowych innych niż wymienione, płatności ani plików.
- **Bramki po każdym zadaniu:** `npm run typecheck`, `npm run lint`, `npx vitest run app`.
  Przed ostatnim commitem także `npm run build`.
- **Reguła wąskiego `catch`:** moduł zamienia na własny typ błędu **wyłącznie** te statusy, dla
  których trasa ma komunikat. Każdy inny leci `ApiError`-em do granicy błędu. Awaria BE ma zostać
  awarią, a nie zamienić się w „niepoprawne dane logowania".

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/api/errors.ts` (zmiana) | `ApiError` dostaje pole `retryAfter` |
| `app/lib/api/client.ts` (zmiana) | interceptor błędu czyta nagłówek `Retry-After` |
| `app/lib/api/auth-session.ts` (nowy) | `startSession`, `acceptInvite`, `endSession`, `AuthError` |
| `app/routes/login.tsx` (zmiana) | loader z `optionalUser`, akcja przez `startSession` |
| `app/routes/zaproszenie.$token.tsx` (zmiana) | podgląd i przyjęcie zaproszenia przez kontrakt |
| `app/routes/wyloguj.tsx` (zmiana) | `endSession` + wyczyszczenie ciastka |
| `app/root.tsx` (zmiana) | znika `maybePruneExpiredSessions` |
| `app/lib/auth/{session,password,cookie}.ts` (usunięcie) | martwe po przepięciu |
| `app/lib/auth/index.ts` (zmiana) | fasada traci usunięte re-eksporty |
| `app/lib/auth/invite.ts` (zmiana) | znikają `consumeInvite` i `findInviteByToken` |
| `app/lib/rate-limit.ts` (zmiana) | znikają `RATE_LIMITS.login` i `.invite` |
| `app/routes/no-stara-sesja.test.ts` (nowy) | bramka: nic w `app/` nie dotyka `__Host-kth_session` |

---

### Zadanie 1: `retryAfter` w `ApiError`

**Files:**
- Modify: `app/lib/api/errors.ts`, `app/lib/api/client.ts`
- Test: `app/lib/api/errors.test.ts`, `app/lib/api/client.test.ts`

**Interfaces:**
- Produces: `ApiError` z dodatkowym polem `readonly retryAfter?: number` (sekundy) oraz
  `parseApiError(status: number, payload: unknown, retryAfter?: number): ApiError`.
- Zadanie 2 czyta `blad.retryAfter` przy mapowaniu `429`.

Powód (D3 specu): BE ustawia `Retry-After` przy limicie prób, ale `ApiError` niesie dziś tylko
status, kod, komunikat i `details`, więc liczba minut przepada. Bez niej użytkownik zablokowany na
15 minut dostaje „spróbuj za chwilę", próbuje od razu i dostaje to samo.

- [ ] **Krok 1: Napisz failujące testy**

Do `app/lib/api/errors.test.ts` dopisz:

```ts
  it("niesie Retry-After, gdy wywołujący go poda", () => {
    // Nagłówek jest jedynym miejscem, gdzie BE podaje czas oczekiwania —
    // koperta błędu go nie zawiera. Bez tego pola komunikat traci minuty.
    const blad = parseApiError(429, { error: { code: "RATE_LIMITED", message: "Za dużo." } }, 900);

    expect(blad.status).toBe(429);
    expect(blad.retryAfter).toBe(900);
  });

  it("bez nagłówka zostawia retryAfter pustym, nie zerowym", () => {
    // `0` znaczyłoby „próbuj teraz" — czyli co innego niż „nie wiem".
    expect(parseApiError(500, {}).retryAfter).toBeUndefined();
  });
```

Do `app/lib/api/client.test.ts` dopisz:

```ts
  it("odczytuje Retry-After z odpowiedzi i wkłada go do ApiError", async () => {
    // Interceptor jest jedynym miejscem, które widzi nagłówki: `parseApiError`
    // dostaje samo ciało. Bez tego przejścia pole zostałoby na zawsze puste.
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: (async () =>
        new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Za dużo." } }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "900" },
        })) as unknown as typeof fetch,
    });

    const blad = await api.get({ url: "/v1/cokolwiek" }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).retryAfter).toBe(900);
  });

  it("nagłówek nieliczbowy nie psuje błędu", async () => {
    // `Retry-After` dopuszcza też datę HTTP, a proxy potrafi wstawić śmieć.
    // Błąd ma wtedy dojść bez czasu, a nie wywrócić się na `NaN`.
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: (async () =>
        new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Za dużo." } }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
        })) as unknown as typeof fetch,
    });

    const blad = await api.get({ url: "/v1/cokolwiek" }).catch((e: unknown) => e);

    expect((blad as ApiError).status).toBe(429);
    expect((blad as ApiError).retryAfter).toBeUndefined();
  });
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/api/errors.test.ts app/lib/api/client.test.ts`
Expected: FAIL — `retryAfter` nie istnieje na `ApiError` (błąd typu przy `tsc`, a w runtime
`undefined` zamiast `900`).

- [ ] **Krok 3: Rozszerz `app/lib/api/errors.ts`**

W klasie `ApiError` dopisz czwarty parametr **po** `details`, żeby nie przestawiać istniejących
wywołań:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetails,
    /**
     * Sekundy z nagłówka `Retry-After`. Nagłówek, nie koperta — BE podaje czas
     * oczekiwania wyłącznie tam, a `parseApiError` widzi samo ciało, więc
     * wartość musi przyjść od wywołującego (interceptor w `client.ts`).
     */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

Sygnatura `parseApiError` dostaje trzeci parametr i przekazuje go do obu gałęzi:

```ts
export function parseApiError(status: number, payload: unknown, retryAfter?: number): ApiError {
  const koperta = kopertaZ(payload);

  if (!koperta) return new ApiError(status, UNKNOWN, FALLBACK_MESSAGE, undefined, retryAfter);

  const { code, message, details } = koperta;

  return new ApiError(
    status,
    typeof code === "string" && code !== "" ? code : UNKNOWN,
    typeof message === "string" && message !== "" ? message : FALLBACK_MESSAGE,
    typeof details === "object" && details !== null ? (details as ApiErrorDetails) : undefined,
    retryAfter,
  );
}
```

- [ ] **Krok 4: Odczytaj nagłówek w `app/lib/api/client.ts`**

W interceptorze błędu, w gałęzi wywołującej `parseApiError`:

```ts
    // `Retry-After` dopuszcza sekundy ALBO datę HTTP. Bierzemy tylko pierwszy
    // kształt: data wymagałaby zegara i strefy, a jedyny nasz wystawca
    // (throttler BE) podaje sekundy. Śmieć od proxy ma dać brak wartości,
    // nigdy `NaN` — `NaN` przeciekłby do komunikatu jako „za NaN min".
    const sekundy = Number(response?.headers.get("retry-after"));
    const retryAfter = Number.isFinite(sekundy) && sekundy >= 0 ? sekundy : undefined;

    return parseApiError(response?.status ?? 502, error, retryAfter);
```

- [ ] **Krok 5: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api`
Expected: PASS.

- [ ] **Krok 6: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/errors.ts app/lib/api/errors.test.ts app/lib/api/client.ts app/lib/api/client.test.ts
git commit -m "feat(api): ApiError niesie Retry-After z naglowka"
```

---

### Zadanie 2: `startSession` — logowanie przez kontrakt

**Files:**
- Create: `app/lib/api/auth-session.ts`
- Test: `app/lib/api/auth-session.test.ts`

**Interfaces:**
- Consumes: `Api` z `./client`, `ApiError` z `./errors`, `ApiSession`/`sessionFromTokens`
  z `./session`, `AuthUser`/`Role` z `./context`.
- Produces:
  - `class AuthError extends Error` z `readonly userMessage: string`
  - `startSession(api: Api, credentials: { email: string; password: string }, now?: () => Date): Promise<{ session: ApiSession; user: AuthUser }>`
    — `now` ma wartość domyślną i istnieje **wyłącznie** dla testów: `sessionFromTokens` przelicza
    `expiresIn` na moment, więc bez ustalonego zegara asercja na `accessExpiresAt` byłaby wyścigiem
    z zegarem maszyny. Trasy wołają dwuargumentowo.

`LoginResponseDto` niesie `{ accessToken, expiresIn, refreshToken, profile: MeDto }`, więc
logowanie **nie potrzebuje osobnego `GET /v1/me`** — profil przychodzi w tej samej odpowiedzi,
a `MeDto.roles` jest już wąskie (`Array<'trainer' | 'trainee'>`).

- [ ] **Krok 1: Napisz failujące testy**

Plik `app/lib/api/auth-session.test.ts`:

```ts
// @vitest-environment node
//
// Ten plik buduje ciastko przez `sessionFromTokens`, a nie parsuje żądań —
// ale trzyma się środowiska `node` wspólnie z resztą testów tej warstwy,
// żeby `Request`/`Response` zachowywały się jak na serwerze.
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { createApiClient } from "./client";
import { ApiError } from "./errors";
import { AuthError, startSession } from "./auth-session";

const PROFIL = {
  partyId: "p-1",
  displayName: "Anna Kowalska",
  email: "anna@example.pl",
  roles: ["trainer"],
  coach: null,
};

const TERAZ = new Date("2026-09-01T10:00:00Z");

function klient(reguly: (req: Request) => Response) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => undefined,
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown, naglowki: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json", ...naglowki },
  });
}

describe("startSession — wystawienie sesji na tokenach BE", () => {
  it("jedno wywołanie daje i sesję, i użytkownika", async () => {
    // Kontrakt oddaje profil RAZEM z tokenami, więc logowanie nie potrzebuje
    // osobnego `/v1/me`. Gdyby ktoś je dołożył, ten test nadal by przeszedł —
    // dlatego asercja jest na liczbie trafień, nie na samym wyniku.
    const trafienia: string[] = [];
    const api = klient((req) => {
      trafienia.push(new URL(req.url).pathname);
      return json(200, { accessToken: "A1", refreshToken: "R1", expiresIn: 900, profile: PROFIL });
    });

    const { session, user } = await startSession(
      api,
      { email: "anna@example.pl", password: "tajne123" },
      () => TERAZ,
    );

    expect(trafienia).toEqual(["/v1/auth/login"]);
    expect(session.refreshToken).toBe("R1");
    expect(session.accessExpiresAt).toBe(TERAZ.getTime() + 900_000);
    expect(user.id).toBe("p-1");
    expect(user.roles).toEqual(["trainer"]);
  });

  it("401 daje JEDEN komunikat, niezależnie od kształtu odmowy", async () => {
    // Trasa nie może odróżnić „nie ma konta" od „złe hasło" — BE ich nie
    // odróżnia i to jest celowe. Dwa różne kształty odpowiedzi, jedno wyjście.
    const bezKoperty = klient(() => json(401, {}));
    const zKopertą = klient(() =>
      json(401, { error: { code: "UNAUTHENTICATED", message: "Zły adres albo hasło." } }),
    );

    for (const api of [bezKoperty, zKopertą]) {
      const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch(
        (e: unknown) => e,
      );
      expect(blad).toBeInstanceOf(AuthError);
      expect((blad as AuthError).userMessage).toBe("Niepoprawne dane logowania.");
    }
  });

  it("429 niesie liczbę minut z nagłówka", async () => {
    // 900 s to 15 min — dokładnie okno throttlera BE. Bez `retryAfter`
    // komunikat mówiłby „za chwilę", a użytkownik próbowałby od razu.
    const api = klient(() =>
      json(429, { error: { code: "RATE_LIMITED", message: "Za dużo prób." } }, { "retry-after": "900" }),
    );

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(AuthError);
    expect((blad as AuthError).userMessage).toBe("Za dużo prób. Spróbuj ponownie za 15 min.");
  });

  it("429 bez nagłówka mówi ogólnie, nie „za NaN min”", async () => {
    const api = klient(() => json(429, { error: { code: "RATE_LIMITED", message: "Za dużo." } }));

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch((e: unknown) => e);

    expect((blad as AuthError).userMessage).toBe("Za dużo prób. Spróbuj ponownie za chwilę.");
  });

  it("awaria BE NIE jest błędem poświadczeń", async () => {
    // Gdyby moduł łykał każdy status, awaria backendu pokazałaby się jako
    // „niepoprawne dane logowania" — czyli kazałaby użytkownikowi sprawdzać
    // hasło w odpowiedzi na cudzą usterkę, ukrywając usterkę przed nami.
    const api = klient(() => json(500, { error: { code: "INTERNAL", message: "Ups." } }));

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(AuthError);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/api/auth-session.test.ts`
Expected: FAIL — `Failed to resolve import "./auth-session"`.

- [ ] **Krok 3: Napisz `app/lib/api/auth-session.ts`**

```ts
import { authControllerLogin } from "@kalisthenos/api-client";
import type { Api } from "./client";
import type { AuthUser } from "./context";
import { ApiError } from "./errors";
import { type ApiSession, sessionFromTokens } from "./session";

const NIEPOPRAWNE_DANE = "Niepoprawne dane logowania.";

/**
 * Błąd, który trasa pokazuje **w formularzu**, a nie na granicy błędu.
 *
 * Ten sam wzorzec co `CategoryError` w `categories.ts`: moduł zachowuje własny
 * typ dla tych statusów, dla których trasa ma komunikat, a każdy inny puszcza
 * dalej jako `ApiError`. Granica jest tu ostra, bo po jednej jej stronie stoi
 * „popraw to, co wpisałeś", a po drugiej „to nie twoja wina".
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Wspólne dla logowania i przyjęcia zaproszenia — oba mają ten sam limit w BE. */
function limitPrzekroczony(retryAfter: number | undefined): AuthError {
  if (retryAfter === undefined) {
    return new AuthError("rate limited", "Za dużo prób. Spróbuj ponownie za chwilę.");
  }
  const minuty = Math.max(1, Math.ceil(retryAfter / 60));
  return new AuthError("rate limited", `Za dużo prób. Spróbuj ponownie za ${minuty} min.`);
}

/**
 * Wystawia sesję. **Jedno wywołanie**, nie dwa: kontrakt oddaje `profile` razem
 * z tokenami, więc `GET /v1/me` byłoby tu zbędnym nawrotem po dane, które już
 * przyszły.
 *
 * `now` jest wstrzykiwane wyłącznie dla testów — `sessionFromTokens` przelicza
 * `expiresIn` na moment i bez ustalonego zegara asercja na `accessExpiresAt`
 * byłaby wyścigiem z zegarem maszyny.
 */
export async function startSession(
  api: Api,
  credentials: { email: string; password: string },
  now: () => Date = () => new Date(),
): Promise<{ session: ApiSession; user: AuthUser }> {
  try {
    const { data } = await authControllerLogin({
      client: api,
      body: credentials,
      throwOnError: true,
    });

    return {
      session: sessionFromTokens(data, now()),
      user: {
        id: data.profile.partyId,
        email: data.profile.email,
        displayName: data.profile.displayName,
        roles: data.profile.roles,
        trainerId: data.profile.coach?.partyId ?? null,
        trainerName: data.profile.coach?.displayName ?? null,
      },
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Komunikat WŁASNY, nie z BE: jedno zdanie dla nieistniejącego konta
      // i dla złego hasła. Przepuszczenie treści z tamtej strony groziłoby
      // tym, że kiedyś zacznie się różnić i stanie się wyrocznią.
      throw new AuthError("invalid credentials", NIEPOPRAWNE_DANE);
    }
    if (e instanceof ApiError && e.status === 429) throw limitPrzekroczony(e.retryAfter);
    throw e;
  }
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api/auth-session.test.ts`
Expected: PASS, 5 testów.

- [ ] **Krok 5: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/auth-session.ts app/lib/api/auth-session.test.ts
git commit -m "feat(api): startSession - logowanie przez kontrakt"
```

---

### Zadanie 3: `acceptInvite` i `endSession`

**Files:**
- Modify: `app/lib/api/auth-session.ts`
- Test: `app/lib/api/auth-session.test.ts`

**Interfaces:**
- Consumes: wszystko z zadania 2.
- Produces:
  - `acceptInvite(api: Api, token: string, input: { email: string; displayName: string; password: string }, now?: () => Date): Promise<ApiSession>`
  - `endSession(api: Api, session: ApiSession): Promise<void>`

`acceptInvite` oddaje **samą sesję**, bez użytkownika — to jest D4 specu. Powód: kontrakt typuje
`AcceptedProfileResponse.roles` jako `Array<string>`, szerzej niż `MeDto.roles`. Wyprowadzenie
z tego sekcji wymagałoby albo zawężenia filtrem (czyli cichego wyrzucania nieznanej roli, przed
czym krok 1 świadomie się bronił), albo zaufania szerokiemu typowi. Trasa przekierowuje na `/`,
a `_index.tsx` rozstrzyga sekcję na **wąskim** `MeDto` z następnego żądania.

- [ ] **Krok 1: Napisz failujące testy**

Do `app/lib/api/auth-session.test.ts` dopisz import i dwa bloki:

```ts
import { acceptInvite, AuthError, endSession, startSession } from "./auth-session";
```

```ts
describe("acceptInvite — przyjęcie zaproszenia", () => {
  it("wystawia sesję i nie interpretuje ról z odpowiedzi", async () => {
    // Kontrakt typuje tu `roles` jako `Array<string>`, szerzej niż w `MeDto`.
    // Moduł świadomie NIE buduje z tego `AuthUser` — o sekcji rozstrzyga `/`
    // na podstawie wąskiego `/v1/me` z następnego żądania (D4 specu).
    let opis = "";
    const api = klient((req) => {
      opis = `${req.method} ${new URL(req.url).pathname}`;
      return json(200, {
        accessToken: "A1",
        refreshToken: "R1",
        expiresIn: 900,
        profile: { partyId: "p-2", displayName: "Ola", email: "ola@e.pl", roles: ["cokolwiek"], coach: null },
      });
    });

    const session = await acceptInvite(
      api,
      "tok-1",
      { email: "ola@e.pl", displayName: "Ola", password: "tajne123" },
      () => TERAZ,
    );

    expect(opis).toBe("POST /v1/invites/tok-1/accept");
    expect(session.refreshToken).toBe("R1");
    expect(session.accessExpiresAt).toBe(TERAZ.getTime() + 900_000);
  });

  it("404 znaczy nieprawidłowe zaproszenie, bez rozróżniania dlaczego", async () => {
    // BE zwraca jeden kod dla nieistniejącego, zużytego, wygasłego i takiego,
    // przy którym nie zgadza się adres — osobne kody byłyby wyrocznią
    // pozwalającą dobierać adres serią prób (ADR-0032).
    const api = klient(() => json(404, { error: { code: "RESOURCE_NOT_FOUND", message: "Brak." } }));

    const blad = await acceptInvite(api, "tok-1", {
      email: "ola@e.pl",
      displayName: "Ola",
      password: "tajne123",
    }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(AuthError);
    expect((blad as AuthError).userMessage).toBe("Zaproszenie nieprawidłowe lub już wykorzystane.");
  });

  it("409 znaczy adres zajęty", async () => {
    const api = klient(() =>
      json(409, { error: { code: "EMAIL_ALREADY_TAKEN", message: "Zajęty." } }),
    );

    const blad = await acceptInvite(api, "tok-1", {
      email: "ola@e.pl",
      displayName: "Ola",
      password: "tajne123",
    }).catch((e: unknown) => e);

    expect((blad as AuthError).userMessage).toBe("Ten adres e-mail jest już zajęty.");
  });
});

describe("endSession — wylogowanie", () => {
  it("podaje token odświeżający w ciele", async () => {
    // FE trzyma token we WŁASNYM ciastku, nie w tym, którego szuka BE, więc
    // musi go podać jawnie — `RefreshDto.refreshToken` jest opcjonalny
    // wyłącznie dla klientów mających ciastko BE.
    let cialo = "";
    const api = klient(async (req) => {
      cialo = await req.text();
      return new Response(null, { status: 204 });
    });

    await endSession(api, { accessToken: "A1", refreshToken: "R1", accessExpiresAt: 0 });

    expect(JSON.parse(cialo)).toEqual({ refreshToken: "R1" });
  });

  it("nie rzuca, gdy BE odmawia", async () => {
    // D5 specu: wylogowanie, które nie wylogowuje, bo backend akurat nie
    // odpowiada, jest gorsze niż osierocona sesja po tamtej stronie.
    // Czyszczenie ciastka w trasie NIE MOŻE zależeć od tego wywołania.
    const api = klient(() => json(503, {}));

    await expect(
      endSession(api, { accessToken: "A1", refreshToken: "R1", accessExpiresAt: 0 }),
    ).resolves.toBeUndefined();
  });
});
```

> Uwaga dla wykonawcy: atrapa `klient` z zadania 2 przyjmuje `(req) => Response`. Test
> `endSession` potrzebuje `async`, więc zmień typ reguły na
> `(req: Request) => Response | Promise<Response>` i dodaj `await` przy jej wywołaniu.

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/api/auth-session.test.ts`
Expected: FAIL — `acceptInvite`/`endSession` nie są eksportowane.

- [ ] **Krok 3: Dopisz obie funkcje do `app/lib/api/auth-session.ts`**

Dopisz import SDK do istniejącej linii:

```ts
import {
  authControllerLogin,
  authControllerLogout,
  invitesControllerAccept,
} from "@kalisthenos/api-client";
```

i dwie funkcje:

```ts
/**
 * Przyjmuje zaproszenie i oddaje **samą sesję**, bez użytkownika.
 *
 * Nie z lenistwa: `AcceptedProfileResponse.roles` jest w kontrakcie typowane
 * jako `Array<string>`, szerzej niż `MeDto.roles`. Zbudowanie z tego `AuthUser`
 * wymagałoby zawężenia filtrem — czyli cichego wyrzucenia roli, której nie
 * znamy — a to jest dokładnie ten kształt błędu, przed którym broni się reguła
 * z kroku 1 („trzecia rola ma zapalić `typecheck`, nie zniknąć"). Trasa
 * przekierowuje na `/`, gdzie sekcję rozstrzyga wąskie `/v1/me`.
 */
export async function acceptInvite(
  api: Api,
  token: string,
  input: { email: string; displayName: string; password: string },
  now: () => Date = () => new Date(),
): Promise<ApiSession> {
  try {
    const { data } = await invitesControllerAccept({
      client: api,
      path: { token },
      body: input,
      throwOnError: true,
    });
    return sessionFromTokens(data, now());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      // Jeden komunikat dla nieistniejącego, zużytego, wygasłego i takiego,
      // przy którym nie zgadza się adres — BE nie rozróżnia ich celowo.
      throw new AuthError("invite unusable", "Zaproszenie nieprawidłowe lub już wykorzystane.");
    }
    if (e instanceof ApiError && e.status === 409) {
      throw new AuthError("email taken", "Ten adres e-mail jest już zajęty.");
    }
    if (e instanceof ApiError && e.status === 429) throw limitPrzekroczony(e.retryAfter);
    throw e;
  }
}

/**
 * Gasi sesję po stronie BE. **Best-effort i to jest decyzja, nie niedbałość**
 * (D5 specu): wywołujący ma wyczyścić ciastko niezależnie od wyniku, bo
 * wylogowanie, które nie wylogowuje przez chwilową awarię backendu, jest
 * gorsze niż sesja osierocona po tamtej stronie — tę zamknie wygaśnięcie.
 *
 * Token idzie w ciele jawnie: `RefreshDto.refreshToken` jest opcjonalny tylko
 * dla klientów, którzy mają ciastko BE. FE trzyma go we własnym.
 */
export async function endSession(api: Api, session: ApiSession): Promise<void> {
  try {
    await authControllerLogout({
      client: api,
      body: { refreshToken: session.refreshToken },
      throwOnError: true,
    });
  } catch {
    // Świadomie połknięty — patrz wyżej.
  }
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api/auth-session.test.ts`
Expected: PASS, 10 testów.

- [ ] **Krok 5: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/auth-session.ts app/lib/api/auth-session.test.ts
git commit -m "feat(api): acceptInvite i endSession przez kontrakt"
```

---

### Zadanie 4: `login.tsx` na kontrakt

**Files:**
- Modify: `app/routes/login.tsx`
- Test: `app/routes/login.test.ts`

**Interfaces:**
- Consumes: `startSession`, `AuthError` z `~/lib/api/auth-session`; `optionalUser` z
  `~/lib/api/auth`; `buildSessionCookie` z `~/lib/api/session`; `hasRole` z `~/lib/api/auth`.
- Produces: żadna trasa nie woła już `createSession`, `verifyPassword` ani `enforceRateLimit`.

Znika `enforceRateLimit` i cała ścieżka stałego czasu (dummy-hash): **BE ma oba**, sprawdzone
w kodzie — limit w `apps/api/src/app/throttling.module.ts` (klucz to znormalizowany e-mail
z ciała, nie IP), stały czas w `libs/iam/src/lib/auth.service.ts:58`. Zostawienie kopii w FE
znaczyłoby tę samą ochronę w dwóch miejscach z dwoma różnymi kluczami.

- [ ] **Krok 1: Przepisz loader i akcję**

Nowa górna część `app/routes/login.tsx` (komponent poniżej **bez zmian**):

```tsx
import {
  redirect,
  Form,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { hasRole, optionalUser } from "~/lib/api/auth";
import { AuthError, startSession } from "~/lib/api/auth-session";
import { buildSessionCookie } from "~/lib/api/session";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});

const GENERIC_ERROR = "Niepoprawne dane logowania." as const;

export function loader({ context }: LoaderFunctionArgs) {
  const { user } = optionalUser(context);
  if (user) return redirect(hasRole(user, "trainer") ? "/trener" : "/podopieczny");
  return null;
}

export async function action(args: ActionFunctionArgs) {
  const { api } = optionalUser(args.context);
  const formData = await args.request.formData();
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // Bez dummy-hash: BE liczy pełny hasz także dla nieistniejącego konta
  // (`auth.service.ts`), więc czas odpowiedzi nie zdradza już istnienia adresu
  // i podtrzymywanie tego po stronie FE nic by nie chroniło.
  if (!parsed.success) return { error: GENERIC_ERROR };

  try {
    const { session, user } = await startSession(api, parsed.data);
    return redirect(hasRole(user, "trainer") ? "/trener" : "/podopieczny", {
      headers: { "Set-Cookie": buildSessionCookie(session) },
    });
  } catch (e) {
    // Wąsko: `AuthError` to komunikat w formularzu, wszystko inne (awaria BE)
    // leci do granicy błędu. Limit prób pilnuje BE, nie ta trasa.
    if (e instanceof AuthError) return { error: e.userMessage };
    throw e;
  }
}
```

- [ ] **Krok 2: Napraw `app/routes/login.test.ts`**

Ten plik mockuje dziś `~/lib/auth` i woła akcję z `context: {}`. Przepisz go na atrapę
kontekstu z `apiContext` oraz podstawiony transport. Nowy plik w całości:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./login";

const PROFIL = {
  partyId: "p-1",
  displayName: "Anna",
  email: "anna@e.pl",
  roles: ["trainer"],
  coach: null,
};

function kontekst(reguly: (req: Request) => Response) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => undefined,
      fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
    }),
    user: null,
  });
  return context;
}

function zadanie(pola: Record<string, string>): Request {
  const body = new URLSearchParams(pola);
  return new Request("https://fe.test/login", { method: "POST", body });
}

describe("login — akcja na kontrakcie", () => {
  it("udane logowanie wystawia ciastko sesji i odsyła do sekcji", async () => {
    const context = kontekst(() =>
      new Response(
        JSON.stringify({ accessToken: "A1", refreshToken: "R1", expiresIn: 900, profile: PROFIL }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const res = (await action({
      request: zadanie({ email: "anna@e.pl", password: "tajne123" }),
      params: {},
      context,
    } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/trener");
    expect(res.headers.get("set-cookie")).toContain("__Host-kth_api=");
  });

  it("odmowa BE wraca jako komunikat formularza, nie wyjątek", async () => {
    const context = kontekst(
      () => new Response(JSON.stringify({}), { status: 401, headers: { "content-type": "application/json" } }),
    );

    const wynik = await action({
      request: zadanie({ email: "anna@e.pl", password: "zle" }),
      params: {},
      context,
    } as never);

    expect(wynik).toEqual({ error: "Niepoprawne dane logowania." });
  });

  it("zalogowany nie widzi formularza", () => {
    // Loader jest teraz synchroniczny i nie dotyka sieci — użytkownika
    // załadował middleware raz na żądanie.
    const context = new RouterContextProvider();
    context.set(apiContext, {
      api: createApiClient({ baseUrl: "http://be.test", getToken: () => undefined }),
      user: {
        id: "p-1",
        email: "anna@e.pl",
        displayName: "Anna",
        roles: ["trainer"],
        trainerId: null,
        trainerName: null,
      },
    });

    const res = loader({ request: new Request("https://fe.test/login"), params: {}, context } as never);

    expect((res as Response).headers.get("location")).toBe("/trener");
  });
});
```

- [ ] **Krok 3: Uruchom testy**

Run: `npx vitest run app/routes/login.test.ts`
Expected: PASS, 3 testy.

- [ ] **Krok 4: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/routes/login.tsx app/routes/login.test.ts
git commit -m "refactor(login): logowanie przez kontrakt BE"
```

---

### Zadanie 5: `zaproszenie.$token.tsx` na kontrakt

**Files:**
- Modify: `app/routes/zaproszenie.$token.tsx`
- Test: `app/routes/zaproszenie.test.ts` (nowy)

**Interfaces:**
- Consumes: `acceptInvite`, `AuthError` z `~/lib/api/auth-session`; `optionalUser`
  z `~/lib/api/auth`; `buildSessionCookie` z `~/lib/api/session`; `invitesControllerPreview`
  z `@kalisthenos/api-client`.
- Produces: trasa nie woła już `findInviteByToken`, `consumeInvite`, `hashPassword`
  ani `setMonthlyAmount`.

**Trzy zmiany zachowania, wszystkie zamierzone:**
1. Adres e-mail leci w ciele żądania (pole `email` w formularzu jest `readOnly`, więc już dziś się
   wysyła). BE sprawdza go wobec zaproszenia przy odnowieniu (ADR-0032) i przyjmuje przy nowym
   koncie — kontrakt dopuszcza zaproszenia bez adresu (`InvitePreviewResponse.email: string | null`).
2. Przekierowanie idzie na `/`, nie do sekcji — D4 specu.
3. **Znika `setMonthlyAmount`** — BE zapisuje kwotę u siebie, zdarzeniem `TraineeJoined` niosącym
   `monthlyAmountGrosze`. Cena zapisana w specu: FE-owa księga płatności przestaje ją dostawać
   i pozostaje rozjechana do kroku 5.

- [ ] **Krok 1: Przepisz loader i akcję**

Górna część pliku (komponent **bez zmian** — nadal czyta `loaderData.displayName`
i `loaderData.emailHint`):

```tsx
import {
  redirect,
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { invitesControllerPreview } from "@kalisthenos/api-client";
import { z } from "zod";
import { optionalUser } from "~/lib/api/auth";
import { AuthError, acceptInvite } from "~/lib/api/auth-session";
import { ApiError } from "~/lib/api/errors";
import { buildSessionCookie } from "~/lib/api/session";

const AcceptSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(1024),
});

export async function loader(args: LoaderFunctionArgs) {
  const { api } = optionalUser(args.context);
  const token = args.params.token ?? "";

  try {
    const { data } = await invitesControllerPreview({
      client: api,
      path: { token },
      throwOnError: true,
    });
    return { displayName: data.displayName, emailHint: data.email };
  } catch (e) {
    // Nieistniejące, zużyte i wygasłe zaproszenie dają w BE jeden kod — i tu
    // też jeden `404`, żeby sonda nie odróżniła „zły token" od „dobry, ale
    // już użyty".
    if (e instanceof ApiError && e.status === 404) {
      throw new Response("invite not found", { status: 404 });
    }
    throw e;
  }
}

export async function action(args: ActionFunctionArgs) {
  const { api } = optionalUser(args.context);
  const token = args.params.token ?? "";
  const fd = await args.request.formData();
  const parsed = AcceptSchema.safeParse({
    email: fd.get("email"),
    displayName: fd.get("displayName"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { error: "Sprawdź pola formularza." };

  try {
    const session = await acceptInvite(api, token, parsed.data);
    // Na `/`, nie do sekcji: `_index.tsx` rozstrzyga ją na wąskim `/v1/me`
    // z następnego żądania. Odpowiedź przyjęcia typuje `roles` szerzej.
    return redirect("/", { headers: { "Set-Cookie": buildSessionCookie(session) } });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.userMessage };
    throw e;
  }
}
```

- [ ] **Krok 2: Napisz test trasy**

Plik `app/routes/zaproszenie.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./zaproszenie.$token";

function kontekst(reguly: (req: Request) => Response) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => undefined,
      fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
    }),
    user: null,
  });
  return context;
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("zaproszenie — podgląd i przyjęcie przez kontrakt", () => {
  it("podgląd oddaje nazwę i podpowiedź adresu", async () => {
    const context = kontekst(() => json(200, { displayName: "Ola", email: "ola@e.pl" }));

    const dane = await loader({
      request: new Request("https://fe.test/zaproszenie/tok-1"),
      params: { token: "tok-1" },
      context,
    } as never);

    expect(dane).toEqual({ displayName: "Ola", emailHint: "ola@e.pl" });
  });

  it("nieznane zaproszenie daje 404, nie wyjątek techniczny", async () => {
    // Jeden kształt odpowiedzi dla nieistniejącego, zużytego i wygasłego —
    // inaczej sonda odróżniłaby „zły token" od „dobry, ale już użyty".
    const context = kontekst(() => json(404, { error: { code: "RESOURCE_NOT_FOUND", message: "Brak." } }));

    const blad = await loader({
      request: new Request("https://fe.test/zaproszenie/tok-1"),
      params: { token: "tok-1" },
      context,
    } as never).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(Response);
    expect((blad as Response).status).toBe(404);
  });

  it("przyjęcie wystawia ciastko i odsyła na / (nie do sekcji)", async () => {
    // D4 specu: odpowiedź przyjęcia typuje `roles` jako `Array<string>`, więc
    // o sekcji rozstrzyga `_index.tsx` na wąskim `/v1/me`, nie ta trasa.
    const context = kontekst(() =>
      json(200, {
        accessToken: "A1",
        refreshToken: "R1",
        expiresIn: 900,
        profile: { partyId: "p-2", displayName: "Ola", email: "ola@e.pl", roles: ["trainee"], coach: null },
      }),
    );

    const res = (await action({
      request: new Request("https://fe.test/zaproszenie/tok-1", {
        method: "POST",
        body: new URLSearchParams({ email: "ola@e.pl", displayName: "Ola", password: "tajne123" }),
      }),
      params: { token: "tok-1" },
      context,
    } as never)) as Response;

    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("__Host-kth_api=");
  });
});
```

- [ ] **Krok 3: Uruchom testy**

Run: `npx vitest run app/routes/zaproszenie.test.ts`
Expected: PASS, 3 testy.

- [ ] **Krok 4: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/routes/zaproszenie.\$token.tsx app/routes/zaproszenie.test.ts
git commit -m "refactor(zaproszenie): przyjecie zaproszenia przez kontrakt BE"
```

---

### Zadanie 6: `wyloguj.tsx` na kontrakt

**Files:**
- Modify: `app/routes/wyloguj.tsx`
- Test: `app/routes/wyloguj.test.ts` (nowy)

**Interfaces:**
- Consumes: `endSession` z `~/lib/api/auth-session`; `optionalUser` z `~/lib/api/auth`;
  `clearSessionCookie`, `readSessionCookie` z `~/lib/api/session`.
- Produces: trasa nie woła już `destroySession` ani `parseSessionId`.

- [ ] **Krok 1: Przepisz trasę**

Cały `app/routes/wyloguj.tsx`:

```tsx
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { optionalUser } from "~/lib/api/auth";
import { endSession } from "~/lib/api/auth-session";
import { clearSessionCookie, readSessionCookie } from "~/lib/api/session";

async function performLogout(args: LoaderFunctionArgs | ActionFunctionArgs) {
  const { api } = optionalUser(args.context);
  const session = readSessionCookie(args.request.headers.get("cookie"));

  // Kolejność jest istotna: gaszenie po stronie BE jest best-effort i nie
  // rzuca (D5 specu), a czyszczenie ciastka dzieje się BEZWARUNKOWO. Odwrotna
  // zależność znaczyłaby, że chwilowa awaria backendu zostawia użytkownika
  // zalogowanego w przeglądarce mimo kliknięcia „wyloguj".
  if (session) await endSession(api, session);

  return redirect("/login", { headers: { "Set-Cookie": clearSessionCookie() } });
}

export const loader = performLogout;
export const action = performLogout;
```

- [ ] **Krok 2: Napisz test**

Plik `app/routes/wyloguj.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { buildSessionCookie } from "~/lib/api/session";
import { loader } from "./wyloguj";

function scenariusz(odpowiedz: () => Response) {
  const trafienia: string[] = [];
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => undefined,
      fetch: (async (req: Request) => {
        trafienia.push(new URL(req.url).pathname);
        return odpowiedz();
      }) as unknown as typeof fetch,
    }),
    user: null,
  });
  const cookie = buildSessionCookie({
    accessToken: "A1",
    refreshToken: "R1",
    accessExpiresAt: Date.now() + 900_000,
  }).split(";")[0]!;
  return {
    trafienia,
    context,
    request: new Request("https://fe.test/wyloguj", { headers: { cookie } }),
  };
}

describe("wyloguj — gasi sesję po obu stronach", () => {
  it("woła BE i czyści ciastko", async () => {
    const s = scenariusz(() => new Response(null, { status: 204 }));

    const res = (await loader({ request: s.request, params: {}, context: s.context } as never)) as Response;

    expect(s.trafienia).toEqual(["/v1/auth/logout"]);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("czyści ciastko TAKŻE gdy BE odmawia", async () => {
    // Sedno D5: wylogowanie, które nie wylogowuje przez chwilową awarię
    // backendu, zostawia użytkownika zalogowanego wbrew jego kliknięciu.
    const s = scenariusz(() => new Response(null, { status: 503 }));

    const res = (await loader({ request: s.request, params: {}, context: s.context } as never)) as Response;

    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
```

- [ ] **Krok 3: Uruchom testy**

Run: `npx vitest run app/routes/wyloguj.test.ts`
Expected: PASS, 2 testy.

- [ ] **Krok 4: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/routes/wyloguj.tsx app/routes/wyloguj.test.ts
git commit -m "refactor(wyloguj): gaszenie sesji przez kontrakt BE"
```

---

### Zadanie 7: Usunięcie starej sesji i bramka szwu

**Files:**
- Delete: `app/lib/auth/session.ts`, `app/lib/auth/password.ts`, `app/lib/auth/cookie.ts`
- Modify: `app/lib/auth/index.ts`, `app/lib/auth/invite.ts`, `app/lib/rate-limit.ts`,
  `app/root.tsx`, `app/lib/auth/README.md`, `app/lib/README.md`
- Test: `app/routes/no-stara-sesja.test.ts` (nowy)

**Interfaces:**
- Consumes: nic. To zadanie tylko usuwa.
- Produces: **żaden kod w `app/` nie czyta ani nie zapisuje `__Host-kth_session`.**

Sprawdzone przed napisaniem planu: `auth/invite.ts` nie importuje niczego z tych trzech plików
(tylko `node:crypto`, drizzle, schemat i `../onboarding-forms`), a `refreshIfNearExpiry`
i `ARGON2_OPTS` nie mają dziś żadnego konsumenta poza fasadą.

- [ ] **Krok 1: Napisz bramkę, zanim skasujesz cokolwiek**

Plik `app/routes/no-stara-sesja.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KORZEN = join(process.cwd(), "app");
const STARE_CIASTKO = "__Host-kth_session";

function pliki(katalog: string): string[] {
  return readdirSync(katalog).flatMap((wpis) => {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) return pliki(sciezka);
    return /\.(ts|tsx)$/.test(wpis) ? [sciezka] : [];
  });
}

describe("szew starej sesji — nic w app/ jej już nie dotyka", () => {
  it("znajduje pliki źródłowe", () => {
    // Bez tej asercji test przechodziłby pusty, gdyby skan przestał
    // cokolwiek widzieć — dokładnie tak, jak stało się to bramce skanującej
    // `.claude/skills` po przeniesieniu katalogu.
    expect(pliki(KORZEN).length).toBeGreaterThan(100);
  });

  it("nazwa starego ciastka nie występuje nigdzie w app/", () => {
    // Krok 2 Etapu 2 usuwa starą sesję bazodanową. „Usunęliśmy" jest
    // twierdzeniem; ta bramka czyni je faktem — i pilnuje, żeby nie wróciła
    // tylnymi drzwiami przy przepinaniu kolejnych modułów.
    const winowajcy = pliki(KORZEN).filter(
      (p) => !p.endsWith("no-stara-sesja.test.ts") && readFileSync(p, "utf8").includes(STARE_CIASTKO),
    );

    expect(winowajcy).toEqual([]);
  });
});
```

- [ ] **Krok 2: Uruchom bramkę i potwierdź, że failuje**

Run: `npx vitest run app/routes/no-stara-sesja.test.ts`
Expected: FAIL — winowajcą jest `app/lib/auth/cookie.ts` (`COOKIE_NAME`).

- [ ] **Krok 3: Skasuj trzy pliki**

```bash
rm app/lib/auth/session.ts app/lib/auth/password.ts app/lib/auth/cookie.ts
rm app/lib/auth/session.test.ts app/lib/auth/password.test.ts app/lib/auth/cookie.test.ts
```

Jeśli któregoś pliku testowego nie ma, pomiń go — `rm` bez `-f` zgłosi to głośno i to jest
w porządku.

- [ ] **Krok 4: Oczyść fasadę `app/lib/auth/index.ts`**

Zostaw wyłącznie dwa bloki re-eksportu; usuń bloki `./cookie`, `./session` i `./password`
oraz `consumeInvite`/`findInviteByToken` z bloku `./invite`:

```ts
export {
  createInvite,
  createInviteWithOnboarding,
  hashToken,
  type CreateInviteInput,
} from "./invite";
export { findUserByEmail, findDisplayName } from "./users";
```

Nagłówkowy komentarz pliku zaktualizuj — dziś mówi „fasada nad hasłami, ciastkiem sesji
i zaproszeniami", a hasła i ciastko właśnie zniknęły.

- [ ] **Krok 5: Usuń `consumeInvite` i `findInviteByToken` z `app/lib/auth/invite.ts`**

Obie funkcje straciły jedynego wywołującego (`zaproszenie.$token.tsx`, zadanie 5) — przyjęcie
zaproszenia robi teraz BE, w swojej transakcji, razem ze stemplem formularza startowego. Usuń
też typy `ConsumeInviteInput` i `ConsumeInviteResult` oraz import `attachFormToTrainee`
z `../onboarding-forms`, jeśli nic go już nie używa.

`app/lib/onboarding-forms.ts` ma **komentarze** odwołujące się do `consumeInvite` (linie ~157
i ~160). Popraw je: transakcja przeniosła się do BE, a `attachFormToTrainee` zostaje bez
wywołującego do kroku 3 — powiedz to wprost zamiast zostawiać odesłanie do funkcji, której nie ma.

- [ ] **Krok 6: Usuń pruning z `app/root.tsx`**

Usuń import `maybePruneExpiredSessions` i jego wywołanie z loadera. Loader zostaje:

```ts
export async function loader() {
  // Sprzątanie nagrań serii wgranych, ale nigdy niepodpiętych do treningu
  // (porzucona sesja logowania) — inaczej wolumen rósłby o każdy taki plik.
  maybeSweepOrphanSetVideos(db);
  return null;
}
```

- [ ] **Krok 7: Usuń dwa wpisy z `app/lib/rate-limit.ts`**

Skasuj `login` i `invite` z `RATE_LIMITS`. **Zostaw `upload`** — woła go `upload.wideo.tsx`
do kroku 4. Zostaw też cały mechanizm (`fixedWindowHit`, `InMemoryRateLimitStore`,
`enforceRateLimit`, `rateLimited`, `resetRateLimit`) z tego samego powodu.

- [ ] **Krok 8: Uruchom bramkę i potwierdź, że przechodzi**

Run: `npx vitest run app/routes/no-stara-sesja.test.ts`
Expected: PASS, 2 testy.

- [ ] **Krok 9: Zaktualizuj dokumentację**

`app/lib/auth/README.md`: usuń wiersze `session.ts`, `cookie.ts`, `password.ts`; **usuń też
ostrzeżenie o kolizji `clearSessionCookie`** — kolizja właśnie przestała istnieć, więc
ostrzeżenie przed nią stałoby się nieprawdą. Nagłówek katalogu przestaje mówić o sesjach
serwerowych i hasłach.

`app/lib/README.md`: wiersz `authz.ts` bez zmian; wiersz katalogu `auth/` opisuje teraz wyłącznie
zaproszenia i odczyty użytkowników.

`app/lib/api/README.md`: dopisz wiersz `auth-session.ts` do tabeli plików i **usuń ostrzeżenie
„ta gałąź nie uwierzytelnia jeszcze nikogo od początku do końca"** — przestało być prawdą i to
jest cel tego kroku.

- [ ] **Krok 10: Bramki i commit**

```bash
npm run typecheck && npm run lint && npx vitest run app && npm run build
```

```bash
git add -A app docs
git commit -m "refactor(auth): usuniecie starej sesji bazodanowej i bramka szwu"
```

---

## Domknięcie

Po zadaniu 7 krok 2 Etapu 2 jest zamknięty i gałąź `be-integration` **daje się zalogować** —
pierwszy raz od rozpoczęcia Etapu 2.

To odblokowuje jedyną uwagę z przeglądu kroku 1, której żadna bramka nie zastąpi: **uruchomienie
gałęzi jako aplikacji**. Cztery bramki nie przepuszczają ani jednego żądania przez prawdziwy
router, więc złe podpięcie middleware'u dałoby `Error: No value found for context` na każdej trasie
za logowaniem i nic by tego nie złapało. Do wykonania przez Właściciela (Docker): `npm run dev`,
`/login` musi się wyrenderować, `/healthz` oddać `200`, a ścieżka logowanie → panel przejść przeciw
prawdziwemu BE.

Krokowi 3 (23 moduły `app/lib`) ten plan zostawia jeden precedens: moduł warstwy klienta może mieć
**własny typ błędu**, gdy trasa pokazuje komunikat w formularzu zamiast granicy błędu.
`categories.ts` pokazał to na `409`, `auth-session.ts` powtarza na `401`, `404`, `409` i `429`.

Do przekazania Właścicielowi razem z warunkami wdrożeniowymi z kroku 1 (`API_URL` wymagane,
jedna replika FE): **od tego kroku FE-owa księga płatności nie dostaje kwoty miesięcznej przy
nowym podopiecznym** — zapisuje ją BE zdarzeniem `TraineeJoined`. Rozjazd trwa do kroku 5, w którym
płatności znikają z FE.
