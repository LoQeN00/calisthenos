# Warstwa klienta API w FE — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić `db: Db` przez `api: Api` na tej samej pozycji w sygnaturach modułów `app/lib`, wstrzykując klienta i użytkownika przez middleware React Routera, z odświeżaniem tokenu gwarantowanym jako pojedyncze.

**Architecture:** Middleware serwera biegnie raz na żądanie: czyta ciastko, w razie potrzeby odświeża token **przed** loaderami, woła `GET /v1/me`, wkłada `{ api, user }` do `context`, a w drodze powrotnej dopisuje `Set-Cookie`. Cała rotacja przechodzi przez jedną funkcję `refreshOnce`, chronioną oknem łaski i mapą odświeżeń w locie. Moduły domenowe dostają `api` tam, gdzie dziś dostają `db`, i nie obsługują błędów — poza mapowaniem `404` na `null` tam, gdzie sygnatura to deklaruje.

**Tech Stack:** React Router 7.15.1 (SSR, flaga `v8_middleware`), `@kalisthenos/api-client` (generowany hey-api, GitHub Packages), vitest + happy-dom, biome, zod.

**Spec:** [`docs/superpowers/specs/2026-08-31-warstwa-klienta-api-fe-design.md`](../specs/2026-08-31-warstwa-klienta-api-fe-design.md)

## Global Constraints

- **Branch:** cała praca na `be-integration`, odbitym od `master`. `master` jest gałęzią wdrożeniową realnej produkcji — nie commituj tam.
- **Git prowadzi Właściciel** (`calisthenos-fe/CLAUDE.md`). Kroki „Punkt commita" podają gotową komendę i komunikat; wykonuje je Właściciel, nie agent.
- **Komunikaty po polsku, identyfikatory w kodzie po angielsku.** Komentarze w kodzie po polsku, zgodnie z `app/lib/api/errors.ts` i `session.ts`.
- **Testy:** `globals: false` — importuj `describe/it/expect` z `vitest` jawnie. Nazwy `describe`/`it` po polsku. Komentarz w teście tłumaczy **dlaczego** przypadek istnieje, nie co robi kod.
- **Bramki po każdym zadaniu:** `npm run typecheck`, `npm run lint`, `npx vitest run app`.
- **Nie ruszaj** `app/lib/db/`, modułów domenowych innych niż `categories.ts`, płatności ani plików. To kroki 3–6 Etapu 2.
- **`no-direct-db.test.ts` musi przechodzić przez cały plan** — nowa warstwa nie importuje schematu bazy.
- **Reguła D3 specu:** funkcja deklarująca `Promise<… | null>` mapuje `404` na `null`; każda inna pozwala `ApiError` lecieć. Moduł zachowuje też własne typy błędów, jeśli je dziś rzuca (np. `CategoryError`).

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `.npmrc` (nowy) | rejestr i token dla zakresu `@kalisthenos` |
| `app/lib/env.ts` (zmiana) | `API_URL`, `API_PUBLIC_URL` w `EnvSchema` |
| `app/lib/api/client.ts` (nowy) | typ `Api`, fabryka klienta, mapowanie odpowiedzi błędnej na `ApiError` |
| `app/lib/api/refresh.ts` (nowy) | `refreshOnce` — okno łaski, mapa w locie, wywołanie BE |
| `app/lib/api/context.ts` (nowy) | `apiContext` — jedyny klucz kontekstu tej warstwy |
| `app/lib/api/middleware.ts` (nowy) | cykl życia sesji w jednym żądaniu |
| `app/lib/api/auth.ts` (nowy) | `requireUser`/`optionalUser` czytające `context` |
| `app/lib/api/errors.ts`, `session.ts` (istnieją) | bez zmian |
| `app/lib/categories.ts` (zmiana) | dowód wzorca: `Db` → `Api` |
| `react-router.config.ts`, `app/root.tsx`, `app/entry.server.tsx` (zmiany) | włączenie i podpięcie middleware |
| `Dockerfile` (zmiana) | dostęp do prywatnego rejestru w obu etapach budowania |

---

### Zadanie 1: Pakiet klienta i konfiguracja adresów

**Files:**
- Create: `.npmrc`
- Modify: `package.json`, `app/lib/env.ts`, `Dockerfile`
- Test: `app/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv().API_URL: string`, `getEnv().API_PUBLIC_URL: string`; pakiet `@kalisthenos/api-client` rozwiązywalny z `node_modules`.

- [ ] **Krok 1: Sprawdź, czy pakiet jest naprawdę opublikowany**

Publikacja jest krokiem Etapu 0 i mogła się nie powieść mimo zielonego wersjonowania.

```bash
npm view @kalisthenos/api-client versions --registry=https://npm.pkg.github.com
```

Oczekiwane: lista zawierająca `0.2.0`. Jeśli `404` albo `E401` — **zatrzymaj się**: publikacja nie doszła do skutku i trzeba wrócić do `release-client.yml` w `calisthenos-be`. Reszta planu nie ma bez tego sensu.

- [ ] **Krok 2: Utwórz `.npmrc`**

Token nie leży w pliku — npm podstawia go ze zmiennej środowiskowej, więc plik może iść do repozytorium.

```
@kalisthenos:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

- [ ] **Krok 3: Zainstaluj pakiet**

```bash
GITHUB_TOKEN=<token z uprawnieniem read:packages> npm install @kalisthenos/api-client@0.2.0
```

Oczekiwane: `package.json` ma `"@kalisthenos/api-client": "0.2.0"` w `dependencies` (wersja dokładna, bez `^` — kontrakt między osobno wdrażanymi usługami przypina się co do wersji, D4 specu nadrzędnego).

- [ ] **Krok 4: Napisz failujący test konfiguracji**

Plik `app/lib/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

const BAZA = {
  DATABASE_URL: "postgres://localhost:5432/test",
  SESSION_SECRET: "x".repeat(32),
  FILE_SIGNING_SECRET: "x".repeat(32),
  BASE_URL: "https://example.test",
};

afterEach(() => {
  delete process.env.API_URL;
  delete process.env.API_PUBLIC_URL;
});

describe("EnvSchema — adresy BE", () => {
  it("wymaga API_URL", async () => {
    const { EnvSchema } = await import("./env");
    expect(() => EnvSchema.parse({ ...BAZA })).toThrow();
  });

  it("bez API_PUBLIC_URL przyjmuje adres wewnętrzny", async () => {
    // Lokalnie i w testach jeden adres wystarcza. Wymuszanie dwóch tworzyłoby
    // klasę błędu „działa lokalnie, 502 na produkcji" w drugą stronę: rozjazd
    // konfiguracji między środowiskami, którego nikt nie zauważa do wdrożenia.
    const { EnvSchema } = await import("./env");
    const env = EnvSchema.parse({ ...BAZA, API_URL: "http://api.internal:3000" });
    expect(env.API_PUBLIC_URL).toBe("http://api.internal:3000");
  });

  it("gdy oba są ustawione, zachowuje je rozdzielnie", async () => {
    const { EnvSchema } = await import("./env");
    const env = EnvSchema.parse({
      ...BAZA,
      API_URL: "http://api.internal:3000",
      API_PUBLIC_URL: "https://api.kalisthenos.pl",
    });
    expect(env.API_URL).toBe("http://api.internal:3000");
    expect(env.API_PUBLIC_URL).toBe("https://api.kalisthenos.pl");
  });
});
```

- [ ] **Krok 5: Uruchom test i potwierdź, że failuje**

Run: `npx vitest run app/lib/env.test.ts`
Expected: FAIL — `EnvSchema` nie jest eksportowane, a `API_PUBLIC_URL` nie istnieje.

- [ ] **Krok 6: Rozszerz `app/lib/env.ts`**

Dodaj do `EnvSchema` (po `BASE_URL`) i wyeksportuj sam schemat, żeby dało się go testować bez `process.env`:

```ts
  /** Adres BE z serwera FE, server-do-serwera. Na Railway może być siecią prywatną. */
  API_URL: z.string().url(),
  /**
   * Adres BE trafiający do HTML-a: `src` obrazków i wideo spod podpisanego
   * `GET /v1/files/{id}`. Domyślnie równy wewnętrznemu — w developmencie
   * i w testach jeden adres wystarcza.
   */
  API_PUBLIC_URL: z.string().url().optional(),
```

Zamień `export type Env = z.infer<typeof EnvSchema>;` na wariant z domyślną wartością wyliczaną po parsowaniu:

```ts
export const EnvSchema = BaseEnvSchema.transform((env) => ({
  ...env,
  API_PUBLIC_URL: env.API_PUBLIC_URL ?? env.API_URL,
}));
```

gdzie `BaseEnvSchema` to dotychczasowy `z.object({...})`. Reszta pliku (`getEnv`, `env`, `googleConfigured`) bez zmian.

- [ ] **Krok 7: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/lib/env.test.ts`
Expected: PASS, 3 testy.

- [ ] **Krok 8: Dodaj dostęp do rejestru w `Dockerfile`**

Obie warstwy budujące wołają `npm ci`, więc obie potrzebują `.npmrc` i tokenu. W **obu** miejscach zamień:

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
```

na:

```dockerfile
ARG GITHUB_TOKEN
COPY package.json package-lock.json .npmrc ./
RUN npm ci
```

`ARG` nie jest utrwalany w warstwie obrazu jako `ENV`, ale **jest widoczny w metadanych budowania** — to świadomy kompromis wobec BuildKit-owego `--mount=type=secret`, którego builder Railway nie gwarantuje. Obraz jest prywatny.

- [ ] **Krok 9: Odnotuj zmienne wdrożeniowe w `railway.toml`**

Do komentarza „Required environment variables" dopisz:

```
#   API_URL               → adres BE (sieć prywatna Railway, jeśli dostępna)
#   API_PUBLIC_URL        → publiczny adres BE (dla <img>/<video>); domyślnie = API_URL
#   GITHUB_TOKEN          → build-time, read:packages (prywatny @kalisthenos/api-client)
```

- [ ] **Krok 10: Bramki i punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

Komunikat dla Właściciela:

```bash
git add .npmrc package.json package-lock.json app/lib/env.ts app/lib/env.test.ts Dockerfile railway.toml
git commit -m "feat(api): pakiet klienta i adresy BE w konfiguracji"
```

---

### Zadanie 2: Fabryka klienta i mapowanie błędów

**Files:**
- Create: `app/lib/api/client.ts`
- Test: `app/lib/api/client.test.ts`

**Interfaces:**
- Consumes: `getEnv()` z zadania 1; `ApiError`, `parseApiError` z `app/lib/api/errors.ts`.
- Produces:
  - `type Api = Client` (z `@kalisthenos/api-client`)
  - `createApiClient(options: ApiClientOptions): Api`
  - `interface ApiClientOptions { baseUrl?: string; getToken: () => string | undefined; fetch?: typeof fetch }`
  - `orNull<T>(wywolanie: Promise<T>): Promise<T | null>` — narzędzie reguły D3, używane 37 razy w kroku 3 Etapu 2

- [ ] **Krok 1: Napisz failujący test**

Klient hey-api z `throwOnError: true` rzuca **surowe ciało błędu**, nie wyjątek. Interceptor błędu jest miejscem, w którym zamienia się je na `ApiError` — raz, dla wszystkich 98 funkcji SDK.

Plik `app/lib/api/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exerciseCategoriesControllerList } from "@kalisthenos/api-client";
import { ApiError } from "./errors";
import { createApiClient } from "./client";

function odpowiedz(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("dokłada token do nagłówka przy każdym wywołaniu", async () => {
    let widziany: string | null = null;
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "TOKEN-A",
      fetch: async (req) => {
        widziany = (req as Request).headers.get("authorization");
        return odpowiedz(200, []);
      },
    });

    await exerciseCategoriesControllerList({ client: api });

    expect(widziany).toBe("Bearer TOKEN-A");
  });

  it("czyta token przy KAŻDYM wywołaniu, nie przy tworzeniu klienta", async () => {
    // Klient powstaje raz na żądanie, a token może się w jego trakcie zmienić
    // (odświeżenie w interceptorze). Gdyby fabryka domknęła wartość zamiast
    // funkcji, ponowione żądanie poszłoby ze starym, właśnie unieważnionym
    // tokenem — i pętla 401 → odśwież → 401 nigdy by się nie zamknęła.
    let biezacy = "STARY";
    const widziane: (string | null)[] = [];
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => biezacy,
      fetch: async (req) => {
        widziane.push((req as Request).headers.get("authorization"));
        return odpowiedz(200, []);
      },
    });

    await exerciseCategoriesControllerList({ client: api });
    biezacy = "NOWY";
    await exerciseCategoriesControllerList({ client: api });

    expect(widziane).toEqual(["Bearer STARY", "Bearer NOWY"]);
  });

  it("zamienia kopertę błędu na ApiError", async () => {
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: async () =>
        odpowiedz(409, {
          error: { code: "CATEGORY_NAME_TAKEN", message: "Kategoria o tej nazwie już istnieje." },
        }),
    });

    const blad = await exerciseCategoriesControllerList({ client: api }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).status).toBe(409);
    expect((blad as ApiError).code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("awarię sieci zamienia na ApiError 502, nie na surowy TypeError", async () => {
    // Bez tego zerwane połączenie do BE wychodzi z modułu jako `TypeError:
    // fetch failed` i granica błędu trasy pokazuje komunikat, którego nie
    // napisał nikt po polsku.
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const blad = await exerciseCategoriesControllerList({ client: api }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).status).toBe(502);
  });
});

describe("orNull — reguła D3", () => {
  it("404 zamienia na null", async () => {
    // 37 funkcji w `app/lib` deklaruje `Promise<… | null>`, a 40 miejsc w trasach
    // robi z tego `404`. Gdyby `404` leciał wyjątkiem, te 40 miejsc stałoby się
    // martwym kodem — i krok 3 Etapu 2 przestałby być mechaniczny.
    const wynik = await orNull(
      Promise.reject(new ApiError(404, "NOT_FOUND", "Nie znaleziono.")),
    );

    expect(wynik).toBeNull();
  });

  it("każdy inny status przepuszcza", async () => {
    // Reguła ma być wąska. `orNull` łykający wszystko zamieniałby błędną ścieżkę
    // w kliencie i awarię BE w pusty ekran bez śladu, co się stało.
    await expect(
      orNull(Promise.reject(new ApiError(500, "SERVER", "Awaria."))),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("wartość przepuszcza bez zmian", async () => {
    expect(await orNull(Promise.resolve({ id: "x" }))).toEqual({ id: "x" });
  });
});
```

Dopisz `orNull` do importu z `./client` na początku pliku testowego.

- [ ] **Krok 2: Uruchom test i potwierdź, że failuje**

Run: `npx vitest run app/lib/api/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Krok 3: Napisz `app/lib/api/client.ts`**

```ts
import { createClient, createConfig } from "@kalisthenos/api-client";
import type { Client } from "@kalisthenos/api-client";
import { getEnv } from "~/lib/env";
import { ApiError, parseApiError } from "./errors";

/**
 * Nazwa, którą moduły `app/lib` biorą pierwszym parametrem — dokładnie tam,
 * gdzie do integracji stało `Db`. Konwencja wstrzykiwania zostaje ta sama;
 * zmienia się wyłącznie to, co po drugiej stronie odpowiada na pytanie.
 */
export type Api = Client;

export interface ApiClientOptions {
  /** Domyślnie `API_URL` z konfiguracji. Jawny wyłącznie w testach. */
  baseUrl?: string;
  /**
   * **Funkcja, nie wartość.** Klient powstaje raz na żądanie, a token może się
   * w jego trakcie zmienić — odświeżenie w interceptorze podmienia go w uchwycie
   * sesji. Domknięta wartość sprawiłaby, że ponowienie idzie ze starym tokenem.
   */
  getToken: () => string | undefined;
  /** Podstawiany wyłącznie w testach; produkcyjnie `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export function createApiClient({ baseUrl, getToken, fetch: transport }: ApiClientOptions): Api {
  const api = createClient(
    createConfig({
      baseUrl: baseUrl ?? getEnv().API_URL,
      // Moduły domenowe nie rozbierają `{ data, error }`. Błąd leci wyjątkiem
      // do trasy, gdzie `toRouteResponse` zamienia go na `Response`.
      throwOnError: true,
      auth: () => getToken(),
      ...(transport ? { fetch: transport } : {}),
    }),
  );

  api.interceptors.error.use((error, response) => {
    // Już zamieniony — ścieżka ponowienia po odświeżeniu przechodzi tędy drugi raz.
    if (error instanceof ApiError) return error;

    // `response` jest niezdefiniowane, gdy `fetch` w ogóle nie doszedł do skutku.
    // `502` zamiast `0`, bo `0` nie jest poprawnym statusem `Response` i wysadziłby
    // `toRouteResponse` w miejscu, które ma ratować sytuację, a nie ją pogarszać.
    return parseApiError(response?.status ?? 502, error);
  });

  return api;
}

/**
 * Reguła D3 specu: **funkcja deklarująca `Promise<… | null>` łapie `404`;
 * każda inna pozwala mu lecieć.**
 *
 * Regułę wyznacza sygnatura, nie ocena piszącego — dzięki temu przepięcie
 * 24 modułów nie wymaga decyzji przy żadnym z nich. Wąska celowo: `orNull`
 * łykający wszystko zamieniałby błędną ścieżkę w kliencie i awarię BE w pusty
 * ekran, czyli w objaw nie do odróżnienia od „nic tu nie ma".
 */
export async function orNull<T>(wywolanie: Promise<T>): Promise<T | null> {
  try {
    return await wywolanie;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
```

- [ ] **Krok 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/lib/api/client.test.ts`
Expected: PASS, 7 testów.

- [ ] **Krok 5: Bramki i punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/client.ts app/lib/api/client.test.ts
git commit -m "feat(api): fabryka klienta z mapowaniem bledow na ApiError"
```

---

### Zadanie 3: Jedność odświeżania

**Files:**
- Create: `app/lib/api/refresh.ts`
- Test: `app/lib/api/refresh.test.ts`

**Interfaces:**
- Consumes: `ApiSession`, `ApiTokens`, `sessionFromTokens` z `./session`; `ApiError` z `./errors`.
- Produces:
  - `refreshOnce(refreshToken: string, deps: RefreshDeps): Promise<ApiSession>`
  - `interface RefreshDeps { exchange: (refreshToken: string) => Promise<ApiTokens>; now: () => Date }`
  - `resetRefreshState(): void` — wyłącznie dla testów, zeruje obie mapy.

To jest serce planu. `refreshOnce` jest **jedyną** drogą do `POST /v1/auth/refresh`; woła ją i middleware, i interceptor `401`.

- [ ] **Krok 1: Napisz failujące testy**

Plik `app/lib/api/refresh.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiTokens } from "./session";
import { refreshOnce, resetRefreshState, graceWindowSize } from "./refresh";

const TERAZ = new Date("2026-08-31T10:00:00Z");

function tokeny(n: number): ApiTokens {
  return { accessToken: `A${n}`, refreshToken: `R${n}`, expiresIn: 900 };
}

/** Wymiana, która liczy wywołania i rozwiązuje się dopiero na żądanie. */
function wolnaWymiana() {
  let odblokuj!: () => void;
  const gotowa = new Promise<void>((res) => (odblokuj = res));
  let wywolan = 0;
  return {
    get wywolan() {
      return wywolan;
    },
    odblokuj,
    async exchange(): Promise<ApiTokens> {
      wywolan += 1;
      await gotowa;
      return tokeny(2);
    },
  };
}

beforeEach(() => resetRefreshState());

describe("refreshOnce — jedność odświeżania", () => {
  it("dwa równoległe wywołania tym samym tokenem trafiają do BE raz", async () => {
    // BE przy ponownym użyciu tokenu nie odmawia przegranemu — GASI CAŁY
    // ŁAŃCUCH SESJI (`SessionService.rotate`, przypadek `reused`). Drugie
    // wywołanie nie jest więc marnotrawstwem, tylko wylogowaniem ze wszystkiego.
    const w = wolnaWymiana();

    const a = refreshOnce("R1", { exchange: w.exchange, now: () => TERAZ });
    const b = refreshOnce("R1", { exchange: w.exchange, now: () => TERAZ });
    w.odblokuj();

    const [sa, sb] = await Promise.all([a, b]);

    expect(w.wywolan).toBe(1);
    expect(sa).toEqual(sb);
    expect(sa.refreshToken).toBe("R2");
  });

  it("wywołanie po zakończeniu rotacji, w oknie łaski, nie dotyka BE", async () => {
    // Żądanie wysłane przez przeglądarkę ZANIM dotarło nowe ciastko: prefetch,
    // fetcher, druga karta. Mapa w locie jest już pusta, bo obietnica się
    // rozwiązała — bez okna łaski to jest zgaszenie łańcucha.
    let wywolan = 0;
    const deps = {
      exchange: async () => {
        wywolan += 1;
        return tokeny(2);
      },
      now: () => TERAZ,
    };

    const pierwsza = await refreshOnce("R1", deps);
    const druga = await refreshOnce("R1", deps);

    expect(wywolan).toBe(1);
    expect(druga).toEqual(pierwsza);
  });

  it("po wygaśnięciu okna łaski idzie do BE ponownie", async () => {
    let wywolan = 0;
    let zegar = TERAZ;
    const deps = {
      exchange: async () => {
        wywolan += 1;
        return tokeny(wywolan + 1);
      },
      now: () => zegar,
    };

    await refreshOnce("R1", deps);
    zegar = new Date(TERAZ.getTime() + 61_000);
    await refreshOnce("R1", deps);

    expect(wywolan).toBe(2);
  });

  it("porażka nie zostaje w pamięci — kolejna próba znów pyta BE", async () => {
    // Zapamiętana porażka zamieniłaby jednorazowy błąd sieci w minutę
    // niedostępności aplikacji dla zalogowanego użytkownika.
    let wywolan = 0;
    const deps = {
      exchange: async () => {
        wywolan += 1;
        throw new Error("sieć");
      },
      now: () => TERAZ,
    };

    await expect(refreshOnce("R1", deps)).rejects.toThrow();
    await expect(refreshOnce("R1", deps)).rejects.toThrow();

    expect(wywolan).toBe(2);
  });

  it("różne tokeny nie dzielą wpisu", async () => {
    let wywolan = 0;
    const deps = {
      exchange: async () => {
        wywolan += 1;
        return tokeny(wywolan + 1);
      },
      now: () => TERAZ,
    };

    await refreshOnce("R1", deps);
    await refreshOnce("INNY", deps);

    expect(wywolan).toBe(2);
  });

  it("pamięć nie rośnie w nieskończoność", async () => {
    // Klucze pochodzą z ciastek, czyli z zewnątrz. Bez limitu wystarczy
    // strumień żądań z losowymi ciastkami, żeby wyczerpać pamięć procesu.
    const deps = { exchange: async () => tokeny(2), now: () => TERAZ };

    for (let i = 0; i < 1200; i += 1) await refreshOnce(`R-${i}`, deps);

    expect(graceWindowSize()).toBe(1000);
  });
});
```

- [ ] **Krok 2: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/api/refresh.test.ts`
Expected: FAIL — `Cannot find module './refresh'`.

- [ ] **Krok 3: Napisz `app/lib/api/refresh.ts`**

```ts
import { createHash } from "node:crypto";
import { type ApiSession, type ApiTokens, sessionFromTokens } from "./session";

/**
 * Ile trzymamy odwzorowanie „stary token → nowa para".
 *
 * Pokrywa prefetch po najechaniu na link, fetcher wysłany tuż przed nawigacją
 * i drugą kartę rewalidującą się po powrocie do laptopa. Nie pokrywa niczego,
 * co wyglądałoby na realne użycie skradzionego tokenu z opóźnieniem.
 */
const OKNO_LASKI_MS = 60_000;

/**
 * Klucze pochodzą z ciastek, czyli z zewnątrz — bez limitu wystarczyłby
 * strumień żądań z losowymi ciastkami, żeby wyczerpać pamięć procesu.
 */
const MAX_WPISOW = 1_000;

interface WpisLaski {
  session: ApiSession;
  at: number;
}

const wLocie = new Map<string, Promise<ApiSession>>();
const oknoLaski = new Map<string, WpisLaski>();

export interface RefreshDeps {
  /** Woła `POST /v1/auth/refresh`. Wstrzykiwane, żeby test nie potrzebował sieci. */
  exchange: (refreshToken: string) => Promise<ApiTokens>;
  now: () => Date;
}

/**
 * Jedyna droga do rotacji tokenu. Woła ją middleware (ścieżka wyprzedzająca)
 * i interceptor `401` (ścieżka reaktywna) — drugiej nie ma i nie może być.
 *
 * Powód jest twardszy niż oszczędność wywołań: `SessionService.rotate` w BE
 * przy ponownym użyciu tokenu wykonuje `deleteChain`, czyli **gasi całą sesję**
 * — wygranego wyścigu razem z przegranym. Dwa odświeżenia tym samym tokenem to
 * nie marnotrawstwo, tylko wylogowanie ze wszystkich urządzeń.
 */
export async function refreshOnce(
  refreshToken: string,
  { exchange, now }: RefreshDeps,
): Promise<ApiSession> {
  const klucz = hash(refreshToken);
  const teraz = now();

  const zapamietana = odczytajLaske(klucz, teraz.getTime());
  if (zapamietana) return zapamietana;

  const biezaca = wLocie.get(klucz);
  if (biezaca) return biezaca;

  const obietnica = exchange(refreshToken)
    .then((tokens) => {
      const session = sessionFromTokens(tokens, teraz);
      zapiszLaske(klucz, session, teraz.getTime());
      return session;
    })
    .finally(() => {
      // Porażka NIE trafia do okna łaski: zapamiętana zamieniłaby jednorazowy
      // błąd sieci w minutę niedostępności aplikacji dla zalogowanego.
      wLocie.delete(klucz);
    });

  wLocie.set(klucz, obietnica);
  return obietnica;
}

function odczytajLaske(klucz: string, teraz: number): ApiSession | null {
  const wpis = oknoLaski.get(klucz);
  if (!wpis) return null;

  // Wygasanie leniwe, przy odczycie. Timer w procesie serwera trzeba potem
  // sprzątać przy zamykaniu i w testach — a nie ma tu czego pilnować na czas.
  if (teraz - wpis.at > OKNO_LASKI_MS) {
    oknoLaski.delete(klucz);
    return null;
  }

  return wpis.session;
}

function zapiszLaske(klucz: string, session: ApiSession, teraz: number): void {
  if (oknoLaski.size >= MAX_WPISOW) {
    // `Map` zachowuje kolejność wstawiania, więc pierwszy klucz jest najstarszy.
    const najstarszy = oknoLaski.keys().next();
    if (!najstarszy.done) oknoLaski.delete(najstarszy.value);
  }
  oknoLaski.set(klucz, { session, at: teraz });
}

/**
 * Klucz jest haszowany, wartość nie może być — w wartości siedzi nowa para,
 * bo trzeba ją wpisać do ciastka. Hasz kosztuje nic i sprawia, że przedstawiony
 * token nie leży w pamięci procesu jawnie.
 */
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Wyłącznie dla testów: stan jest modułowy, więc przecieka między przypadkami. */
export function resetRefreshState(): void {
  wLocie.clear();
  oknoLaski.clear();
}

/** Wyłącznie dla testów: dowód, że limit wpisów działa. */
export function graceWindowSize(): number {
  return oknoLaski.size;
}
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api/refresh.test.ts`
Expected: PASS, 6 testów.

- [ ] **Krok 5: Bramki i punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/refresh.ts app/lib/api/refresh.test.ts
git commit -m "feat(api): jednosc odswiezania tokenu - okno laski i mapa w locie"
```

---

### Zadanie 4: Kontekst, middleware i włączenie flagi

**Files:**
- Create: `app/lib/api/context.ts`, `app/lib/api/middleware.ts`
- Modify: `react-router.config.ts`, `app/root.tsx`, `app/entry.server.tsx`
- Test: `app/lib/api/middleware.test.ts`

**Interfaces:**
- Consumes: `createApiClient`, `Api` (zadanie 2); `refreshOnce` (zadanie 3); `readSessionCookie`, `buildSessionCookie`, `clearSessionCookie`, `needsRefresh`, `ApiSession` z `./session`.
- **Kontrakt `exchange`, wymuszony przez zadanie 3:** callback przekazywany do `refreshOnce` **musi się rozstrzygnąć** i musi nieść własny `AbortSignal.timeout(...)`. Mapa odświeżeń w locie usuwa wpis wyłącznie w `.finally()`, więc wywołanie, które nigdy nie wraca, przypina wpis na stałe — a wtedy każde kolejne żądanie tego użytkownika dostaje tę samą wiszącą obietnicę. Bez timeoutu awaria jednego żądania zamienia się w niedostępność całego konta.
- Produces:
  - `apiContext: RouterContext<ApiBundle>` z `./context`
  - `interface ApiBundle { api: Api; user: AuthUser | null }`
  - `interface AuthUser { id: string; email: string; displayName: string; roles: Role[]; trainerId: string | null; trainerName: string | null }`
  - `type Role = "trainer" | "trainee"`
  - `apiMiddleware: MiddlewareFunction<Response>` z `./middleware`

- [ ] **Krok 1: Włącz flagę i podepnij middleware**

`react-router.config.ts`:

```ts
export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: "build",
  future: { v8_middleware: true },
} satisfies Config;
```

`app/entry.server.tsx` — podmień typ `loadContext` (linia jest już w pliku, zakomentowana):

```ts
  loadContext: RouterContextProvider,
```

i dopisz `RouterContextProvider` do importu typów z `react-router`, usuwając `AppLoadContext`.

`app/root.tsx` — dopisz eksport (middleware roota biegnie dla każdego żądania obsługiwanego przez router):

```ts
import { apiMiddleware } from "~/lib/api/middleware";

export const middleware = [apiMiddleware];
```

- [ ] **Krok 2: Napisz `app/lib/api/context.ts`**

```ts
import { createContext } from "react-router";
import type { Api } from "./client";

export type Role = "trainer" | "trainee";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /**
   * LISTA, nie pojedyncza wartość. ADR-0013 uczynił rolę faktem z okresem
   * i dopuścił `trainer` oraz `trainee` naraz, więc kontrola roli jest
   * sprawdzeniem przynależności, nie równością.
   */
  roles: Role[];
  trainerId: string | null;
  /** Z `MeDto.coach.displayName` — oszczędza osobne zapytanie o nazwę trenera. */
  trainerName: string | null;
}

export interface ApiBundle {
  api: Api;
  user: AuthUser | null;
}

/** Jedyny klucz kontekstu tej warstwy. */
export const apiContext = createContext<ApiBundle>();
```

- [ ] **Krok 3: Napisz failujące testy middleware**

Plik `app/lib/api/middleware.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { apiContext } from "./context";
import { resetRefreshState } from "./refresh";
import { buildSessionCookie, type ApiSession } from "./session";
import { apiMiddleware } from "./middleware";

const TERAZ = new Date("2026-08-31T10:00:00Z");

const ME = {
  partyId: "p-1",
  displayName: "Anna Kowalska",
  email: "anna@example.pl",
  roles: ["trainer"],
  coach: null,
};

function sesja(nadpisz: Partial<ApiSession> = {}): ApiSession {
  return {
    accessToken: "A1",
    refreshToken: "R1",
    accessExpiresAt: TERAZ.getTime() + 900_000,
    ...nadpisz,
  };
}

function zadanie(session: ApiSession | null): Request {
  const naglowki = new Headers();
  if (session) naglowki.set("cookie", buildSessionCookie(session).split(";")[0]!);
  return new Request("https://fe.test/trener", { headers: naglowki });
}

/** Serwer atrapowy: liczy wywołania i odpowiada wg ścieżki. */
function serwer(reguly: (url: string, req: Request) => Response) {
  const trafienia: string[] = [];
  return {
    trafienia,
    fetch: async (req: Request) => {
      const url = new URL(req.url).pathname;
      trafienia.push(url);
      return reguly(url, req);
    },
  };
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => resetRefreshState());

describe("apiMiddleware — cykl życia sesji w jednym żądaniu", () => {
  it("bez ciastka nie woła BE i wpuszcza anonima", async () => {
    const s = serwer(() => json(200, {}));
    const context = new RouterContextProvider();

    await apiMiddleware(
      { request: zadanie(null), context },
      async () => new Response("ok"),
      { fetch: s.fetch, now: () => TERAZ },
    );

    expect(s.trafienia).toEqual([]);
    expect(context.get(apiContext).user).toBeNull();
  });

  it("ze świeżym tokenem woła /v1/me raz i nie odświeża", async () => {
    const s = serwer(() => json(200, ME));
    const context = new RouterContextProvider();

    const res = await apiMiddleware(
      { request: zadanie(sesja()), context },
      async () => new Response("ok"),
      { fetch: s.fetch, now: () => TERAZ },
    );

    expect(s.trafienia).toEqual(["/v1/me"]);
    expect(context.get(apiContext).user?.roles).toEqual(["trainer"]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("token bliski wygaśnięcia odświeża PRZED loaderami i dopisuje ciastko", async () => {
    const s = serwer((url) =>
      url === "/v1/auth/refresh"
        ? json(200, { accessToken: "A2", refreshToken: "R2", expiresIn: 900 })
        : json(200, ME),
    );
    const context = new RouterContextProvider();
    // 10 s do wygaśnięcia — wewnątrz 30-sekundowego marginesu.
    const bliska = sesja({ accessExpiresAt: TERAZ.getTime() + 10_000 });

    const res = await apiMiddleware(
      { request: zadanie(bliska), context },
      async () => new Response("ok"),
      { fetch: s.fetch, now: () => TERAZ },
    );

    expect(s.trafienia).toEqual(["/v1/auth/refresh", "/v1/me"]);
    expect(res.headers.get("set-cookie")).toContain("__Host-kth_api=");
  });

  it("martwy token odświeżający czyści ciastko i odsyła na logowanie", async () => {
    const s = serwer(() => json(401, { error: { code: "INVALID_REFRESH", message: "Zaloguj się ponownie." } }));
    const context = new RouterContextProvider();
    const bliska = sesja({ accessExpiresAt: TERAZ.getTime() - 1 });

    const res = await apiMiddleware(
      { request: zadanie(bliska), context },
      async () => new Response("ok"),
      { fetch: s.fetch, now: () => TERAZ },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
```

- [ ] **Krok 4: Uruchom testy i potwierdź, że failują**

Run: `npx vitest run app/lib/api/middleware.test.ts`
Expected: FAIL — `Cannot find module './middleware'`.

- [ ] **Krok 5: Napisz `app/lib/api/middleware.ts`**

```ts
import { redirect } from "react-router";
import type { RouterContextProvider } from "react-router";
import { authControllerRefresh, meControllerMe } from "@kalisthenos/api-client";
import type { MeDto } from "@kalisthenos/api-client";
import { getEnv } from "~/lib/env";
import { type Api, createApiClient } from "./client";
import { type AuthUser, apiContext } from "./context";
import { ApiError } from "./errors";
import { refreshOnce } from "./refresh";
import {
  type ApiSession,
  buildSessionCookie,
  clearSessionCookie,
  needsRefresh,
  readSessionCookie,
} from "./session";

/** Wstrzykiwane wyłącznie w testach; produkcyjnie wartości domyślne. */
export interface MiddlewareDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

interface MiddlewareArgs {
  request: Request;
  context: RouterContextProvider;
}

/**
 * Jedyne miejsce, które dotyka sesji.
 *
 * Biegnie raz na żądanie HTTP i **wokół** loaderów: ma moment przed nimi
 * (odświeżenie wyprzedzające) i drogę powrotną (`Set-Cookie`). Loader tego
 * drugiego nie ma — dlatego rotacja tokenu nie mogła zamieszkać w loaderze.
 */
export async function apiMiddleware(
  { request, context }: MiddlewareArgs,
  next: () => Promise<Response>,
  deps: MiddlewareDeps = {},
): Promise<Response> {
  const transport = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date());
  const baseUrl = getEnv().API_URL;

  const zapisana = readSessionCookie(request.headers.get("cookie"));

  if (!zapisana) {
    context.set(apiContext, {
      api: createApiClient({ baseUrl, getToken: () => undefined, fetch: transport }),
      user: null,
    });
    return next();
  }

  /**
   * UCHWYT, nie wartość. Odświeżenie, które zajdzie w interceptorze w środku
   * loadera, musi być widoczne tutaj, w drodze powrotnej — inaczej nowy token
   * odświeżający nie trafi do ciastka, a stary jest już po tamtej stronie zużyty.
   */
  const uchwyt = { session: zapisana, zmieniona: false };

  const odswiez = async (): Promise<void> => {
    const swieza = await refreshOnce(uchwyt.session.refreshToken, {
      exchange: async (refreshToken) => {
        const { data } = await authControllerRefresh({
          client: createApiClient({ baseUrl, getToken: () => undefined, fetch: transport }),
          body: { refreshToken },
        });
        return data;
      },
      now,
    });
    uchwyt.session = swieza;
    uchwyt.zmieniona = true;
  };

  const api: Api = createApiClient({
    baseUrl,
    getToken: () => uchwyt.session.accessToken,
    fetch: transport,
  });

  // Siatka na token, który umarł w locie między sprawdzeniem niżej a wywołaniem.
  // Ponowienie idzie przez `refreshOnce`, więc N loaderów naraz to nadal jedna
  // rotacja. Ponowione żądanie leci przez `transport`, czyli z pominięciem
  // interceptorów — druga runda jest niemożliwa z konstrukcji, nie z flagi.
  api.interceptors.response.use(async (response, request_) => {
    if (response.status !== 401) return response;

    try {
      await odswiez();
    } catch (blad) {
      // Middleware jest już za `next()` i nie ma jak zawrócić, więc odpowiedź
      // trzeba **rzucić** stąd. React Router traktuje `Response` rzucony
      // z loadera jako odpowiedź, więc przekierowanie dochodzi do skutku
      // niezależnie od tego, jak głęboko w stosie zaszła porażka. Moduł
      // domenowy nic o tym nie wie — to jest granica między błędem sesji
      // a błędem danych.
      if (blad instanceof ApiError && blad.status === 401) throw wyloguj(request);
      throw blad;
    }

    return transport(
      new Request(request_, { headers: naglowkiZTokenem(request_, uchwyt.session) }),
    );
  });

  try {
    if (needsRefresh(uchwyt.session, now())) await odswiez();

    const { data } = await meControllerMe({ client: api });
    context.set(apiContext, { api, user: zUzytkownika(data) });
  } catch (blad) {
    // WYŁĄCZNIE `401`: odświeżenie odrzucone albo `/me` odmawia mimo świeżego
    // tokenu. Jedno i drugie znaczy dla użytkownika „sesja się skończyła".
    // Awaria BE (`502`, `500`) NIE jest wylogowaniem — odesłanie na logowanie
    // kazałoby użytkownikowi wpisywać hasło w odpowiedzi na cudzą usterkę,
    // a po zalogowaniu i tak nie zadziałałoby nic.
    if (blad instanceof ApiError && blad.status === 401) return wyloguj(request);
    throw blad;
  }

  const response = await next();

  if (uchwyt.zmieniona) {
    response.headers.append("Set-Cookie", buildSessionCookie(uchwyt.session));
  }

  return response;
}

function naglowkiZTokenem(request_: Request, session: ApiSession): Headers {
  const naglowki = new Headers(request_.headers);
  naglowki.set("authorization", `Bearer ${session.accessToken}`);
  return naglowki;
}

function zUzytkownika(me: MeDto): AuthUser {
  return {
    id: me.partyId,
    email: me.email,
    displayName: me.displayName,
    roles: me.roles.filter((r): r is "trainer" | "trainee" => r === "trainer" || r === "trainee"),
    trainerId: me.coach?.partyId ?? null,
    trainerName: me.coach?.displayName ?? null,
  };
}

/** Bez pętli: gdy celem już jest `/login`, samo czyszczenie wystarczy. */
function wyloguj(request: Request): Response {
  const naglowki = { "Set-Cookie": clearSessionCookie() };

  if (new URL(request.url).pathname === "/login") {
    return new Response(null, { status: 200, headers: naglowki });
  }

  return redirect("/login", { headers: naglowki });
}
```

- [ ] **Krok 6: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api/middleware.test.ts`
Expected: PASS, 4 testy.

- [ ] **Krok 7: Potwierdź, że aplikacja nadal się buduje z flagą**

Run: `npm run typecheck && npm run build`
Expected: oba zielone. Jeśli `typecheck` zgłasza `context` w istniejących loaderach — **to jest oczekiwane tylko tam, gdzie loader deklaruje typ `context`**; żaden dzisiejszy loader tego nie robi, więc błędów być nie powinno.

- [ ] **Krok 8: Punkt commita**

```bash
npm run lint && npx vitest run app
```

```bash
git add app/lib/api/context.ts app/lib/api/middleware.ts app/lib/api/middleware.test.ts react-router.config.ts app/root.tsx app/entry.server.tsx
git commit -m "feat(api): middleware sesji i kontekst klienta"
```

---

### Zadanie 5: Dowód — równoległe loadery jednej nawigacji

**Files:**
- Test: `app/lib/api/rownolegle-loadery.test.ts`

**Interfaces:**
- Consumes: wszystko z zadań 2–4. Nie produkuje nowego kodu produkcyjnego.

To jest test, którego żąda spec nadrzędny (§10) i który zamyka najwyżej wyceniony wiersz tabeli ryzyk. Osobne zadanie, bo osobna bramka: może zapalić się bez winy poprzednich zadań, jeśli któreś z nich rozwiązało swój problem lokalnie zamiast wspólnie.

- [ ] **Krok 1: Napisz test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { exerciseCategoriesControllerList } from "@kalisthenos/api-client";
import { apiContext } from "./context";
import { resetRefreshState } from "./refresh";
import { buildSessionCookie } from "./session";
import { apiMiddleware } from "./middleware";

const TERAZ = new Date("2026-08-31T10:00:00Z");
const ME = { partyId: "p-1", displayName: "Anna", email: "a@e.pl", roles: ["trainer"], coach: null };

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => resetRefreshState());

describe("równoległe loadery jednej nawigacji", () => {
  it("token wygasły w locie: pięć loaderów, JEDNA rotacja, JEDNO ciastko", async () => {
    // To jest defekt objawiający się losowym wylogowaniem ze WSZYSTKICH
    // urządzeń — `SessionService.rotate` przy ponownym użyciu tokenu woła
    // `deleteChain`. React Router uruchamia loadery jednej nawigacji
    // równolegle Z ZAŁOŻENIA, więc bez tej gwarancji trafiałoby to każdą
    // nawigację, w której token akurat wygasł. Nie do odtworzenia przy
    // pojedynczym żądaniu, więc musi stać tutaj.
    const trafienia: string[] = [];
    let tokenWazny = false;

    const fetchAtrapa = async (req: Request) => {
      const url = new URL(req.url).pathname;
      trafienia.push(url);

      if (url === "/v1/auth/refresh") {
        tokenWazny = true;
        return json(200, { accessToken: "A2", refreshToken: "R2", expiresIn: 900 });
      }
      if (url === "/v1/me") return json(200, ME);

      // Zasoby domenowe odmawiają, dopóki token nie zostanie wymieniony.
      return tokenWazny
        ? json(200, [])
        : json(401, { error: { code: "TOKEN_EXPIRED", message: "Token wygasł." } });
    };

    const context = new RouterContextProvider();
    const cookie = buildSessionCookie({
      accessToken: "A1",
      refreshToken: "R1",
      // Dalej niż margines: middleware NIE odświeża wyprzedzająco, więc
      // odświeżenie musi zajść w interceptorze, w pięciu loaderach naraz.
      accessExpiresAt: TERAZ.getTime() + 900_000,
    }).split(";")[0]!;

    const res = await apiMiddleware(
      {
        request: new Request("https://fe.test/trener/biblioteka", {
          headers: new Headers({ cookie }),
        }),
        context,
      },
      async () => {
        const { api } = context.get(apiContext);
        // Pięć loaderów jednej nawigacji: layout, liść i trzy fetchery.
        await Promise.all(
          Array.from({ length: 5 }, () => exerciseCategoriesControllerList({ client: api })),
        );
        return new Response("ok");
      },
      { fetch: fetchAtrapa, now: () => TERAZ },
    );

    const rotacje = trafienia.filter((t) => t === "/v1/auth/refresh");
    expect(rotacje).toHaveLength(1);

    const ciastka = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
    expect(ciastka).toHaveLength(1);
    expect(ciastka[0]).toContain("__Host-kth_api=");
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź wynik**

Run: `npx vitest run app/lib/api/rownolegle-loadery.test.ts`
Expected: PASS.

Jeśli `rotacje` ma długość 5 — interceptor omija `refreshOnce`. Jeśli 2 — `refreshOnce` jest wołane z różnymi tokenami, bo uchwyt sesji został skopiowany zamiast współdzielony. Jeśli `ciastka` ma 5 wpisów — `uchwyt.zmieniona` jest ustawiane po stronie klienta zamiast raz w middleware.

- [ ] **Krok 3: Punkt commita**

```bash
git add app/lib/api/rownolegle-loadery.test.ts
git commit -m "test(api): jedna rotacja tokenu na nawigacje z wieloma loaderami"
```

---

### Zadanie 6: `requireUser` na kontekście

**Files:**
- Create: `app/lib/api/auth.ts`
- Test: `app/lib/api/auth.test.ts`

**Interfaces:**
- Consumes: `apiContext`, `ApiBundle`, `AuthUser`, `Role` z `./context`.
- Produces:
  - `requireUser(context, opts?: { role?: Role }): { api: Api; user: AuthUser }`
  - `optionalUser(context): { api: Api; user: AuthUser | null }`
  - `hasRole(user: AuthUser, role: Role): boolean`

- [ ] **Krok 1: Napisz failujące testy**

```ts
import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { type AuthUser, apiContext } from "./context";
import { hasRole, optionalUser, requireUser } from "./auth";

function kontekst(user: AuthUser | null) {
  const context = new RouterContextProvider();
  context.set(apiContext, { api: {} as never, user });
  return context;
}

function osoba(roles: AuthUser["roles"]): AuthUser {
  return {
    id: "p-1",
    email: "a@e.pl",
    displayName: "Anna",
    roles,
    trainerId: null,
    trainerName: null,
  };
}

describe("requireUser — kontrola roli przez przynależność", () => {
  it("bez użytkownika przekierowuje na logowanie", () => {
    try {
      requireUser(kontekst(null));
      expect.unreachable("miało rzucić przekierowanie");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).headers.get("location")).toBe("/login");
    }
  });

  it("wpuszcza osobę mającą wymaganą rolę wśród wielu", () => {
    // ADR-0013 dopuścił `trainer` i `trainee` naraz. Do integracji rola była
    // pojedyncza i porównanie przez równość odsyłałoby taką osobę z każdej
    // trasy trenera — objaw wyglądający jak zepsute uprawnienia.
    const { user } = requireUser(kontekst(osoba(["trainee", "trainer"])), { role: "trainer" });
    expect(user.roles).toContain("trainer");
  });

  it("bez wymaganej roli odsyła do właściwej sekcji", () => {
    try {
      requireUser(kontekst(osoba(["trainee"])), { role: "trainer" });
      expect.unreachable("miało rzucić przekierowanie");
    } catch (e) {
      expect((e as Response).headers.get("location")).toBe("/podopieczny");
    }
  });

  it("osoba z obiema rolami przy braku wymagania trafia do sekcji trenera", () => {
    // Rozstrzygnięcie musi być deterministyczne — inaczej ta sama osoba ląduje
    // raz tu, raz tam, zależnie od kolejności ról w odpowiedzi BE.
    expect(hasRole(osoba(["trainee", "trainer"]), "trainer")).toBe(true);
  });

  it("optionalUser oddaje null zamiast przekierowania", () => {
    expect(optionalUser(kontekst(null)).user).toBeNull();
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź, że failują**

Run: `npx vitest run app/lib/api/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Krok 3: Napisz `app/lib/api/auth.ts`**

```ts
import { redirect } from "react-router";
import type { RouterContextProvider } from "react-router";
import type { Api } from "./client";
import { type AuthUser, type Role, apiContext } from "./context";

export interface RequireOptions {
  role?: Role;
}

/**
 * **Synchroniczne i bez sieci.** Użytkownika załadował middleware, raz na
 * żądanie. Do integracji każde z 77 wywołań tej funkcji było odczytem z bazy;
 * gdyby zostało wywołaniem HTTP, jedna nawigacja płaciłaby za nie tyle razy,
 * ile loaderów odpala — layout i liść to już dwa.
 */
export function requireUser(
  context: RouterContextProvider,
  { role }: RequireOptions = {},
): { api: Api; user: AuthUser } {
  const { api, user } = context.get(apiContext);

  if (!user) throw redirect("/login");
  if (role && !hasRole(user, role)) throw redirect(sekcjaDla(user));

  return { api, user };
}

export function optionalUser(context: RouterContextProvider): { api: Api; user: AuthUser | null } {
  const { api, user } = context.get(apiContext);
  return { api, user };
}

/** Przynależność do listy, nie równość — ADR-0013. */
export function hasRole(user: AuthUser, role: Role): boolean {
  return user.roles.includes(role);
}

/**
 * Trener wygrywa przy obu rolach. Rozstrzygnięcie musi być deterministyczne:
 * zależne od kolejności ról w odpowiedzi BE odsyłałoby tę samą osobę raz tu,
 * raz tam.
 */
function sekcjaDla(user: AuthUser): string {
  return hasRole(user, "trainer") ? "/trener" : "/podopieczny";
}
```

- [ ] **Krok 4: Uruchom i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/api/auth.test.ts`
Expected: PASS, 5 testów.

- [ ] **Krok 5: Punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app
```

```bash
git add app/lib/api/auth.ts app/lib/api/auth.test.ts
git commit -m "feat(api): requireUser na kontekscie, rola jako lista"
```

---

### Zadanie 7: Przepięcie tras na nowy `requireUser`

**Files:**
- Modify: 51 plików w `app/routes/**` (77 wywołań), `app/lib/auth/index.ts`
- Test: `npm run typecheck` jest tu testem — sygnatura się zmienia, więc kompilator wskazuje każde niedokończone miejsce.

**Interfaces:**
- Consumes: `requireUser`, `optionalUser` z `app/lib/api/auth.ts` (zadanie 6).
- Produces: żadne trasy nie wołają już `requireUser(request, db, …)`.

Zmiana mechaniczna, ale rozległa. Wykonuj ją **plikami**, nie globalnym `sed` — dwa wzorce wywołań różnią się obecnością opcji.

- [ ] **Krok 1: Zbierz listę plików do zmiany**

```bash
grep -rl "requireUser(" app/routes --include=*.tsx | sort | tee trasy-do-przepiecia.txt | wc -l
```

Plik roboczy trzymaj poza repozytorium albo skasuj przed commitem.

Oczekiwane: 51 plików.

- [ ] **Krok 2: Przepnij pierwszy plik i sprawdź wzorzec na nim**

Weź `app/routes/trener/podopieczni._index.tsx`. Zmiany są trzy:

```ts
// import — było
import { createInviteWithOnboarding, requireUser } from "~/lib/auth";
// import — jest
import { createInviteWithOnboarding } from "~/lib/auth";
import { requireUser } from "~/lib/api/auth";

// loader — było
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainer" });
// loader — jest
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user } = requireUser(context, { role: "trainer" });
```

`db` **zostaje** we wszystkich pozostałych wywołaniach tego pliku — moduły domenowe przechodzą na `api` dopiero w kroku 3 Etapu 2. Jeśli po usunięciu `requireUser` z pliku nie zostaje żadne użycie `db`, usuń też `import { db }`.

Run: `npm run typecheck`
Expected: liczba błędów spada dokładnie o wywołania z tego pliku.

- [ ] **Krok 3: Przepnij pozostałe 50 plików tym samym wzorcem**

Po każdych ~10 plikach: `npm run typecheck`. Nie zostawiaj `await` przed `requireUser` — funkcja jest synchroniczna, a `await` na nie-obietnicy przechodzi typecheck i po cichu zostaje w kodzie jako fałszywy sygnał, że coś tu chodzi po sieci.

- [ ] **Krok 4: Usuń stary `requireUser` i `getOptionalUser`**

Z `app/lib/auth/index.ts` skasuj `getOptionalUser`, `requireUser`, `RequireOptions`, `Role`, `AuthUser` oraz import `Db`, `parseSessionId` i `readSession`, jeśli nic ich już nie używa. Reszta eksportów (`createInvite`, `hashPassword`, `findUserByEmail`, …) zostaje — znika w krokach 2 i 6 Etapu 2.

Run: `npm run typecheck`
Expected: zielone. Każdy błąd tutaj to pominięte wywołanie.

- [ ] **Krok 5: Potwierdź, że szew bazy nadal jest pilnowany**

Run: `npx vitest run app/routes/no-direct-db.test.ts`
Expected: PASS — nowa warstwa nie importuje schematu, więc bramka nie ma się o co zaczepić.

- [ ] **Krok 6: Punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app && npm run build
```

```bash
git add app/routes app/lib/auth/index.ts
git commit -m "refactor(routes): requireUser z kontekstu zamiast z bazy"
```

---

### Zadanie 8: `categories.ts` na klienta — dowód wzorca

**Files:**
- Modify: `app/lib/categories.ts`, `app/routes/trener/biblioteka._index.tsx`, `app/routes/trener/biblioteka.nowe.tsx`, `app/routes/trener/biblioteka.$exerciseId.tsx`
- Test: `app/lib/categories.test.ts`

**Interfaces:**
- Consumes: `Api` (zadanie 2), `ApiError` z `./api/errors`.
- Produces:
  - `listCategoriesForTrainer(api: Api): Promise<ExerciseCategoryView[]>`
  - `addCategory(api: Api, rawName: string): Promise<ExerciseCategoryView>`
  - `deleteCategory(api: Api, categoryId: string): Promise<void>`
  - `normalizeCategoryName`, `filterToKnownCategoryNames`, `CategoryError` — bez zmian w zachowaniu

Ten moduł jest dowodem, że wzorzec działa, i wzorcem dla kroku 3 Etapu 2. Trzy rzeczy, które demonstruje: znika parametr `trainerId` (tenant niesie token), `409` staje się `CategoryError` (moduł zachowuje własny typ błędu, żeby trasa się nie zmieniła), a typ wiersza przechodzi ze schematu Drizzle na widok kontraktu.

- [ ] **Krok 1: Napisz failujące testy**

```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import {
  CategoryError,
  addCategory,
  deleteCategory,
  filterToKnownCategoryNames,
  listCategoriesForTrainer,
} from "./categories";

function klient(reguly: (req: Request) => Response) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: async (req) => reguly(req as Request),
  });
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const KATEGORIA = { id: "k-1", name: "nogi", ordinal: 0, exerciseCount: 3 };

describe("categories — moduł na kliencie kontraktu", () => {
  it("lista nie przekazuje już identyfikatora trenera", async () => {
    // Zakres tenanta niesie token, nie argument. Zostawienie `trainerId`
    // w sygnaturze podtrzymywałoby złudzenie, że FE go egzekwuje.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, [KATEGORIA]);
    });

    const wynik = await listCategoriesForTrainer(api);

    expect(sciezka).toBe("/v1/exercise-categories");
    expect(wynik).toEqual([KATEGORIA]);
  });

  it("pustą nazwę odrzuca bez wywołania sieci", async () => {
    let wywolan = 0;
    const api = klient(() => {
      wywolan += 1;
      return json(201, KATEGORIA);
    });

    await expect(addCategory(api, "   ")).rejects.toBeInstanceOf(CategoryError);
    expect(wywolan).toBe(0);
  });

  it("409 z kontraktu wraca jako CategoryError z komunikatem BE", async () => {
    // Trasa łapie `CategoryError` i pokazuje `userMessage`. Gdyby moduł
    // przepuścił `ApiError`, formularz zamiast komunikatu dostałby granicę
    // błędu — a to jest inny ekran, nie inny tekst.
    const api = klient(() =>
      json(409, {
        error: { code: "CATEGORY_NAME_TAKEN", message: "Kategoria o tej nazwie już istnieje." },
      }),
    );

    const blad = await addCategory(api, "nogi").catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(CategoryError);
    expect((blad as CategoryError).userMessage).toBe("Kategoria o tej nazwie już istnieje.");
  });

  it("usunięcie woła DELETE z identyfikatorem w ścieżce", async () => {
    let opis = "";
    const api = klient((req) => {
      opis = `${req.method} ${new URL(req.url).pathname}`;
      return new Response(null, { status: 204 });
    });

    await deleteCategory(api, "k-1");

    expect(opis).toBe("DELETE /v1/exercise-categories/k-1");
  });

  it("filtrowanie nazw pozostaje czyste — bez sieci", () => {
    const wynik = filterToKnownCategoryNames([KATEGORIA], ["Nogi", "brzuch", "nogi"]);
    expect(wynik).toEqual(["nogi"]);
  });
});
```

- [ ] **Krok 2: Uruchom i potwierdź, że failują**

Run: `npx vitest run app/lib/categories.test.ts`
Expected: FAIL — moduł nadal importuje Drizzle i bierze `db`.

- [ ] **Krok 3: Przepisz `app/lib/categories.ts`**

```ts
import {
  exerciseCategoriesControllerCreate,
  exerciseCategoriesControllerList,
  exerciseCategoriesControllerRemove,
} from "@kalisthenos/api-client";
import type { ExerciseCategoryView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

const MAX_NAME_LEN = 32;

/** Normalize a raw category name. Returns null when it's empty or too long. */
export function normalizeCategoryName(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return null;
  return trimmed;
}

/**
 * Bez `trainerId`: zakres tenanta niesie token dostępowy, a BE go egzekwuje.
 * Argument zostawiony dla symetrii ze starą sygnaturą podtrzymywałby złudzenie,
 * że FE cokolwiek tu pilnuje.
 */
export async function listCategoriesForTrainer(api: Api): Promise<ExerciseCategoryView[]> {
  const { data } = await exerciseCategoriesControllerList({ client: api });
  return data;
}

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export async function addCategory(api: Api, rawName: string): Promise<ExerciseCategoryView> {
  const name = normalizeCategoryName(rawName);
  if (name == null) {
    throw new CategoryError("invalid name", "Nazwa kategorii jest pusta lub za długa.");
  }

  try {
    const { data } = await exerciseCategoriesControllerCreate({ client: api, body: { name } });
    return data;
  } catch (e) {
    // Moduł zachowuje własny typ błędu, choć źródło się zmieniło: do integracji
    // był nim kod `23505` z Postgresa, teraz `409` z kontraktu. Trasa łapie
    // `CategoryError` i pokazuje `userMessage` — gdyby przeszedł `ApiError`,
    // formularz zamiast komunikatu dostałby granicę błędu, czyli inny ekran.
    if (e instanceof ApiError && e.status === 409) {
      throw new CategoryError("duplicate", e.message);
    }
    throw e;
  }
}

export async function deleteCategory(api: Api, categoryId: string): Promise<void> {
  await exerciseCategoriesControllerRemove({ client: api, path: { id: categoryId } });
}

/** Filter an incoming list of category names down to those that are known for this trainer. */
export function filterToKnownCategoryNames(
  categories: ExerciseCategoryView[],
  names: string[],
): string[] {
  const known = new Set(categories.map((c) => c.name));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const norm = normalizeCategoryName(raw);
    if (norm == null) continue;
    if (!known.has(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(norm);
  }
  return result;
}
```

- [ ] **Krok 4: Uruchom i potwierdź, że przechodzą**

Run: `npx vitest run app/lib/categories.test.ts`
Expected: PASS, 5 testów.

- [ ] **Krok 5: Przepnij trzy trasy**

W `biblioteka._index.tsx`, `biblioteka.nowe.tsx`, `biblioteka.$exerciseId.tsx` zamień wywołania:

```ts
// było
const categories = await listCategoriesForTrainer(db, user.id);
await addCategory(db, user.id, name);
await deleteCategory(db, user.id, categoryId);
// jest
const categories = await listCategoriesForTrainer(api);
await addCategory(api, name);
await deleteCategory(api, categoryId);
```

`api` bierz z tego samego wywołania, które daje `user`:

```ts
const { api, user } = requireUser(context, { role: "trainer" });
```

`CategoryPicker` i `ListControls` dostają teraz `ExerciseCategoryView[]` zamiast `schema.ExerciseCategory[]`. Oba czytają wyłącznie `id` i `name`, więc jedyne, co trzeba zmienić, to typ propsa w `app/components/exercise-fields.tsx` — jeśli deklaruje typ ze schematu, podmień go na `ExerciseCategoryView`.

Run: `npm run typecheck`
Expected: zielone.

- [ ] **Krok 6: Bramki i punkt commita**

```bash
npm run typecheck && npm run lint && npx vitest run app && npm run build
```

```bash
git add app/lib/categories.ts app/lib/categories.test.ts app/routes/trener/biblioteka._index.tsx app/routes/trener/biblioteka.nowe.tsx app/routes/trener/biblioteka.\$exerciseId.tsx app/components/exercise-fields.tsx
git commit -m "refactor(categories): modul na kliencie kontraktu - dowod wzorca"
```

---

## Domknięcie

Po zadaniu 8 krok 1 Etapu 2 jest zamknięty. Krok 3 (przepięcie 23 pozostałych modułów) ma wtedy:

- **wzorzec** — `Db` → `Api` w sygnaturze, jedna linia wnętrza, `409`/`404` mapowane wyłącznie tam, gdzie moduł już dziś ma dla nich własny kształt;
- **regułę rozstrzygającą bez uznaniowości** — sygnatura z `| null` łapie `404`, każda inna przepuszcza;
- **dowód** na `categories.ts`, do skopiowania jako wzór testu przeciw podstawionemu klientowi.

Do zapisania w `docs/setup-deviations.md` po stronie BE albo w README FE — zależnie od tego, gdzie Właściciel trzyma warunki wdrożeniowe: **jedność odświeżania stoi na tym, że FE biegnie w jednym procesie.** Zwielokrotnienie replik unieważnia okno łaski i mapę w locie.
