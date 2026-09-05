# Zgoda Google przez dwa hosty — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przenieść przepływ „Połącz z Google" z FE na kontrakt BE, wiążąc ciastko nonce'a z domeną nadrzędną, tak żeby z FE zniknął cały katalog `app/lib/google/`.

**Architecture:** BE dostaje opcjonalną `CALENDAR_COOKIE_DOMAIN` i asercję startową pilnującą, że przeglądarka zdoła wysłać ciastko z hosta aplikacji na host callbacku. FE woła `POST /v1/calendar/connection/authorize` serwer-do-serwera, przekazuje `Set-Cookie` z tej odpowiedzi na własnym przekierowaniu do ekranu zgody, a przeglądarka wraca prosto na callback BE. Kontrakt OpenAPI się nie zmienia.

**Tech Stack:** BE — NestJS 11, MikroORM 7, Zod 4, Jest, Nx, pnpm. FE — React Router v7 (SSR, `v8_middleware`), `@kalisthenos/api-client@0.3.0`, Vitest, Biome, npm.

**Spec:** [`../specs/2026-09-04-zgoda-google-przez-dwa-hosty-design.md`](../specs/2026-09-04-zgoda-google-przez-dwa-hosty-design.md)

## Global Constraints

- **Dwa repozytoria, dwie polityki gita.** Zadania 1–3 są w `calisthenos-be` (gałąź robocza od `main`, commit normalnie). Zadania 4–8 są w `calisthenos-fe`, gałąź `be-integration` — **git prowadzi Właściciel**. W zadaniach FE krok „commit" znaczy: zatrzymaj się i zdaj raport, nie wywołuj `git`.
- **Menedżery są różne i nie wolno ich mieszać:** `pnpm` i `npx nx` wyłącznie w `calisthenos-be`, `npm` wyłącznie w `calisthenos-fe`. Żadna komenda nie działa z katalogu nadrzędnego.
- **Jeden przebieg testów na zadanie.** Pełne bramki (`npm run typecheck`, `lint`, `build`, `pnpm verify`) uruchamia wyłącznie koordynator na polecenie Właściciela — ciężkie przebiegi zamrażają tę maszynę.
- **`npm install` jest zakazane.** Zadanie 7 edytuje `package.json`; instalację robi Właściciel.
- **`app/lib/db/schema.ts` jest nietykalny** i **`npm run db:generate` jest zakazane** — dwudziesta migracja po stronie FE unieważnia baseline MikroORM w BE w ciszy.
- **Kontrakt OpenAPI się nie zmienia.** Żadne zadanie nie dotyka `openapi/openapi.json`, `libs/client/` ani changesetów. Jeśli któreś by tego wymagało, zatrzymaj się i zgłoś — to znaczy, że plan się mylił.
- Komunikaty dla użytkownika po polsku, identyfikatory w kodzie po angielsku. Nazwy publiczne w warstwie klienta FE po angielsku, nazwy testów i komentarze po polsku.
- **Dostawca jest wartością pola `provider`, nigdy częścią nazwy** (ADR-0012). Nowy moduł FE nazywa się `calendar.ts`, nie `google.ts`.

---

## Struktura plików

### `calisthenos-be`

| Plik | Odpowiedzialność |
|---|---|
| `libs/shared/config/src/lib/env.schema.ts` | deklaracja `CALENDAR_COOKIE_DOMAIN` i asercja zgodności hostów |
| `libs/shared/config/src/lib/app-config.service.ts` | wystawienie `cookieDomain` w kształcie `calendar` |
| `libs/consultations/src/lib/calendar/oauth-callback.ts` | `nonceCookieOptions` z domeną — jedna definicja dla ustawienia i wyczyszczenia |
| `libs/consultations/src/lib/calendar/calendar.controller.ts` | przekazanie domeny w obu wywołaniach (ustawienie i wyczyszczenie) |
| `docs/adr/0036-domena-ciastka-nonce-przy-dwoch-hostach.md` | decyzja i jej granica |

### `calisthenos-fe`

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/calendar.ts` | jedyne wejście FE do kalendarza zewnętrznego: stan, rozpoczęcie zgody, rozłączenie |
| `app/routes/trener/integracje.google.tsx` | ekran integracji — czyta stan, przekazuje ciastko, rozłącza |
| `app/routes/_index.tsx` | przechwycenie powrotu z callbacku i skierowanie go na ekran integracji |
| `app/routes/no-google-lib.test.ts` | bramka: nic w `app/` nie importuje usuniętego katalogu |

---

## Task 1: `CALENDAR_COOKIE_DOMAIN` i asercja zgodności hostów (BE)

**Files:**
- Modify: `libs/shared/config/src/lib/env.schema.ts`
- Test: `libs/shared/config/src/lib/env.schema.spec.ts`

**Interfaces:**
- Consumes: nic
- Produces: `Env['CALENDAR_COOKIE_DOMAIN']: string | undefined` — czytane przez zadanie 2

**Kontekst.** `env.schema.ts` ma już `superRefine` z regułą „komplet pięciu zmiennych kalendarza albo żadna" (stała `CALENDAR_KEYS`). Nowa zmienna **nie wchodzi do tej listy**: wdrożenie jednohostowe jest poprawne i ma zostać poprawne, a lista wymaga kompletu albo zera.

**Uwaga na fikstury.** `GOOGLE_FULL` w pliku testowym ma `GOOGLE_REDIRECT_URI: 'https://api.example/…'` i `WEB_APP_URL: 'https://app.example'` — **różne hosty**. Po dołożeniu asercji ta fikstura przestaje być poprawna i trzeba dopisać jej `CALENDAR_COOKIE_DOMAIN: 'example'`. Używają jej trzy miejsca (linie 179, 185, 195). Fikstury e2e (`apps/api-e2e/src/support/env.ts`) zmiany **nie potrzebują** — tam oba hosty to `localhost`.

- [ ] **Step 1: Dopisz `CALENDAR_COOKIE_DOMAIN` do fikstury `GOOGLE_FULL`**

W `libs/shared/config/src/lib/env.schema.spec.ts`, w literale `GOOGLE_FULL` (linia ~92):

```ts
const GOOGLE_FULL = {
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_REDIRECT_URI: 'https://api.example/v1/calendar/connection/callback',
  GOOGLE_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  WEB_APP_URL: 'https://app.example',
  // Dwa hosty pod jedną domeną — bez tego ciastko nonce'a nie dojdzie
  // z `app.example` na `api.example`, a asercja niżej to zgłasza.
  CALENDAR_COOKIE_DOMAIN: 'example',
};
```

- [ ] **Step 2: Napisz testy asercji**

Dopisz na końcu `describe('validateEnv', …)` w `libs/shared/config/src/lib/env.schema.spec.ts`:

```ts
describe('domena ciastka nonce a hosty zgody', () => {
  it('jeden host bez domeny ciastka przechodzi', () => {
    // Wdrożenie jednohostowe (i dev na localhost): przeglądarka wyśle
    // ciastko hosta bez żadnego `Domain`.
    const env = {
      ...MINIMAL,
      ...GOOGLE_FULL,
      GOOGLE_REDIRECT_URI: 'https://app.example/v1/calendar/connection/callback',
      CALENDAR_COOKIE_DOMAIN: '',
    };

    expect(() => validateEnv(env)).not.toThrow();
  });

  it('dwa hosty bez domeny ciastka są odrzucone', () => {
    // To jest awaria, którą ta asercja istnieje żeby złapać: bez `Domain`
    // ciastko zostaje na `app.example` i KAŻDA zgoda kończy się
    // `reason=state` — nieodróżnialnie od prawdziwej odmowy CSRF.
    const env = { ...MINIMAL, ...GOOGLE_FULL, CALENDAR_COOKIE_DOMAIN: '' };

    expect(() => validateEnv(env)).toThrow(/CALENDAR_COOKIE_DOMAIN/);
  });

  it('domena, która nie jest przyrostkiem hosta callbacku, jest odrzucona', () => {
    const env = {
      ...MINIMAL,
      ...GOOGLE_FULL,
      CALENDAR_COOKIE_DOMAIN: 'inna.example',
    };

    expect(() => validateEnv(env)).toThrow(/GOOGLE_REDIRECT_URI/);
  });

  it('wiodąca kropka jest normalizowana, nie odrzucana', () => {
    // `Domain=.example` i `Domain=example` znaczą w RFC 6265 to samo,
    // a naiwne porównanie przyrostka na pierwszym wywróciłoby się
    // na podwójnej kropce. Normalizacja stoi na granicy, jak ucięcie
    // ukośnika w `APP_PUBLIC_URL`.
    const env = { ...MINIMAL, ...GOOGLE_FULL, CALENDAR_COOKIE_DOMAIN: '.example' };

    expect(validateEnv(env).CALENDAR_COOKIE_DOMAIN).toBe('example');
  });

  it('wyłączona integracja nie wymaga niczego', () => {
    // Zero zmiennych kalendarza = integracja wyłączona. Asercja nie ma
    // wtedy czego sprawdzać i nie może blokować startu.
    expect(() => validateEnv({ ...MINIMAL })).not.toThrow();
  });
});
```

- [ ] **Step 3: Uruchom testy — mają paść**

Run: `npx nx test shared-config`
Expected: FAIL — cztery nowe przypadki padają, bo `CALENDAR_COOKIE_DOMAIN` nie istnieje w schemacie (nieznany klucz jest pomijany, więc żadna asercja nie zachodzi i `validateEnv` nie rzuca).

- [ ] **Step 4: Zadeklaruj zmienną**

W `libs/shared/config/src/lib/env.schema.ts`, tuż pod deklaracją `WEB_APP_URL` (linia ~174):

```ts
  /**
   * Domena ciastka nonce'a, gdy aplikacja webowa i API stoją na dwóch hostach.
   *
   * Pusta znaczy „bez atrybutu `Domain`", czyli ciastko hosta API — tak działa
   * dev, gdzie oba serwery siedzą na `localhost` (ciastka ignorują port),
   * i tak działa każde wdrożenie jednohostowe.
   *
   * **Celowo POZA grupą `CALENDAR_KEYS`**: tamta wymaga kompletu albo zera,
   * a ta zmienna jest opcjonalna także przy włączonej integracji.
   *
   * **Musi być domeną REJESTROWALNĄ** (`kalisthenos.pl`), nie domeną dostawcy
   * hostingu (`up.railway.app`). Nazwy z Public Suffix List przeglądarka
   * odrzuca, a asercja niżej tego NIE wykrywa — sprawdza zgodność hostów,
   * nie przynależność do listy, której to repozytorium nie zna.
   *
   * Wiodąca kropka odpada tutaj, a nie u wołającego: `.example` i `example`
   * znaczą w RFC 6265 to samo, ale porównanie przyrostka na pierwszym dałoby
   * podwójną kropkę i ciche odrzucenie poprawnej konfiguracji.
   */
  CALENDAR_COOKIE_DOMAIN: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(1)
      .transform((value) => value.replace(/^\.+/, ''))
      .optional(),
  ),
```

- [ ] **Step 5: Przebuduj `superRefine`**

W `libs/shared/config/src/lib/env.schema.ts` zamień całe ciało `superRefine` (linia ~236) na:

```ts
  .superRefine((env, ctx) => {
    const missing = CALENDAR_KEYS.filter((k) => !env[k]);
    // Zero → integracja wyłączona. Nie ma czego sprawdzać.
    if (missing.length === CALENDAR_KEYS.length) return;

    // Cokolwiek pomiędzy to literówka albo niedokończone wdrożenie, i jedno,
    // i drugie lepiej wykryć na starcie niż przy pierwszej próbie połączenia
    // kalendarza. Wychodzimy tu: bez kompletu nie ma z czego liczyć hostów.
    if (missing.length > 0) {
      for (const key of missing) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'Integracja kalendarza wymaga kompletu zmiennych albo żadnej. Brakuje tej.',
        });
      }
      return;
    }

    // Komplet. Zgoda przechodzi przez DWA hosty: przeglądarka dostaje ciastko
    // z nonce'em od aplikacji webowej (`WEB_APP_URL`, przekazane przez FE),
    // a odsyła je na callback (`GOOGLE_REDIRECT_URI`). Gdy nie dojdzie, każda
    // zgoda kończy się `reason=state` — objawem nieodróżnialnym od prawdziwej
    // odmowy CSRF i niedającym się odtworzyć po fakcie. Stąd błąd startu.
    const hostOf = (value: string): string | null => {
      try {
        return new URL(value).hostname;
      } catch {
        return null;
      }
    };

    const callbackHost = hostOf(env.GOOGLE_REDIRECT_URI as string);
    const appHost = hostOf(env.WEB_APP_URL as string);
    // `null` znaczy, że `z.url()` już to zgłosiło — bez dublowania błędu.
    if (callbackHost === null || appHost === null) return;

    const domain = env.CALENDAR_COOKIE_DOMAIN;

    if (!domain) {
      if (appHost !== callbackHost) {
        ctx.addIssue({
          code: 'custom',
          path: ['CALENDAR_COOKIE_DOMAIN'],
          message:
            `Aplikacja webowa (${appHost}) i callback zgody (${callbackHost}) ` +
            'stoją na różnych hostach — ciastko nonce\'a nie dojdzie. Ustaw ' +
            'wspólną domenę nadrzędną (rejestrowalną, nie domenę hostingu).',
        });
      }
      return;
    }

    for (const [key, host] of [
      ['GOOGLE_REDIRECT_URI', callbackHost],
      ['WEB_APP_URL', appHost],
    ] as const) {
      if (host !== domain && !host.endsWith(`.${domain}`)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            `Host ${host} nie leży pod CALENDAR_COOKIE_DOMAIN=${domain}, ` +
            'więc przeglądarka nie wyśle tam ciastka nonce\'a.',
        });
      }
    }
  })
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx nx test shared-config`
Expected: PASS, łącznie z dotychczasowymi przypadkami „komplet albo nic" (linie 179–195).

- [ ] **Step 7: Commit**

```bash
git add libs/shared/config/src/lib/env.schema.ts libs/shared/config/src/lib/env.schema.spec.ts
git commit -m "feat(config): CALENDAR_COOKIE_DOMAIN i asercja zgodnosci hostow zgody"
```

---

## Task 2: Domena w ciastku nonce'a (BE)

**Files:**
- Modify: `libs/shared/config/src/lib/app-config.service.ts:192-214`
- Modify: `libs/consultations/src/lib/calendar/oauth-callback.ts`
- Modify: `libs/consultations/src/lib/calendar/calendar.controller.ts`
- Test: `libs/consultations/src/lib/calendar/oauth-callback.spec.ts`

**Interfaces:**
- Consumes: `Env['CALENDAR_COOKIE_DOMAIN']` z zadania 1
- Produces: `AppConfig['calendar']` z polem `cookieDomain: string | null`; `nonceCookieOptions(isProduction: boolean, cookieDomain?: string | null): NonceCookieOptions`

**Pułapka, na którą trzeba uważać.** `nonceCookieOptions` ma **jedną** definicję dla ustawienia i wyczyszczenia ciastka, i to nie jest estetyka: przeglądarka dopasowuje ciastko do skasowania po trójce (nazwa, ścieżka, **domena**). Przekazanie domeny tylko w `authorize`, a pominięcie jej w `callback`, zostawiłoby w przeglądarce nonce, który przeżył swoją zgodę. Oba wywołania muszą dostać tę samą wartość.

- [ ] **Step 1: Napisz testy `nonceCookieOptions`**

Dopisz w `libs/consultations/src/lib/calendar/oauth-callback.spec.ts`, do `describe` obejmującego dotychczasowe przypadki `nonceCookieOptions` (linia ~238):

```ts
  it('bez domeny cechy cookie nie zawierają atrybutu Domain', () => {
    // Wdrożenie jednohostowe i dev: ciastko zostaje przy hoście API.
    expect(nonceCookieOptions(true)).not.toHaveProperty('domain');
    expect(nonceCookieOptions(true, null)).not.toHaveProperty('domain');
    expect(nonceCookieOptions(true, '')).not.toHaveProperty('domain');
  });

  it('z domeną dokłada ją niezależnie od środowiska', () => {
    // Ta sama wartość MUSI wyjść przy ustawieniu i przy wyczyszczeniu —
    // przeglądarka dopasowuje ciastko do skasowania po (nazwa, ścieżka,
    // domena), więc rozjazd zostawiłby nonce, który przeżył swoją zgodę.
    for (const produkcja of [true, false]) {
      expect(nonceCookieOptions(produkcja, 'kalisthenos.pl')).toMatchObject({
        domain: 'kalisthenos.pl',
        sameSite: 'lax',
        httpOnly: true,
      });
    }
  });
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `npx nx test consultations`
Expected: FAIL — `nonceCookieOptions` przyjmuje dziś jeden argument, więc `tsc` zgłasza nadmiarowy parametr, a `domain` nigdy nie powstaje.

- [ ] **Step 3: Rozszerz `nonceCookieOptions`**

W `libs/consultations/src/lib/calendar/oauth-callback.ts` zamień interfejs i funkcję:

```ts
export interface NonceCookieOptions {
  readonly httpOnly: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly secure: boolean;
  /**
   * Domena nadrzędna, gdy aplikacja webowa i API stoją na dwóch hostach.
   * Nieobecna przy wdrożeniu jednohostowym — a nie pusta, bo `Domain=`
   * bez wartości nie jest tym samym, co brak atrybutu.
   */
  readonly domain?: string;
}

/**
 * Domyślne `null` w drugim parametrze jest po to, żeby wywołania sprzed tej
 * zmiany zachowywały się dokładnie tak, jak dotąd — brak domeny to nie jest
 * przypadek szczególny, tylko wdrożenie jednohostowe.
 */
export function nonceCookieOptions(
  isProduction: boolean,
  cookieDomain: string | null = null,
): NonceCookieOptions {
  return {
    // Poza zasięgiem skryptów: nonce jest jedyną rzeczą, której napastnik
    // z podpisanym `state` jeszcze potrzebuje.
    httpOnly: true,
    // `lax`, nie `strict`: powrót od dostawcy jest nawigacją najwyższego
    // poziomu z cudzej witryny, a `strict` cookie'a wtedy NIE wyśle — każda
    // zgoda kończyłaby się odmową.
    sameSite: 'lax',
    path: CALENDAR_CALLBACK_PATH,
    // Poza produkcją API bywa na `http://localhost`, gdzie `Secure` odcięłoby
    // cookie zupełnie — i wtedy nie dałoby się połączyć kalendarza lokalnie.
    secure: isProduction,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}
```

- [ ] **Step 4: Wystaw `cookieDomain` w konfiguracji**

W `libs/shared/config/src/lib/app-config.service.ts` rozszerz getter `calendar` (linia ~192):

```ts
  get calendar(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    tokenEncKey: string;
    webAppUrl: string;
    cookieDomain: string | null;
  } | null {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!clientId) return null;
    return {
      clientId,
      clientSecret: this.config.get('GOOGLE_CLIENT_SECRET', {
        infer: true,
      }) as string,
      redirectUri: this.config.get('GOOGLE_REDIRECT_URI', {
        infer: true,
      }) as string,
      tokenEncKey: this.config.get('GOOGLE_TOKEN_ENC_KEY', {
        infer: true,
      }) as string,
      webAppUrl: this.config.get('WEB_APP_URL', { infer: true }) as string,
      // `null`, nie `undefined`: brak domeny to wdrożenie jednohostowe,
      // czyli decyzja, a nie brak informacji. Komplet zmiennych pilnuje
      // schemat, ale TA jest opcjonalna także przy komplecie.
      cookieDomain:
        (this.config.get('CALENDAR_COOKIE_DOMAIN', { infer: true }) as
          | string
          | undefined) ?? null,
    };
  }
```

- [ ] **Step 5: Przekaż domenę w obu wywołaniach kontrolera**

W `libs/consultations/src/lib/calendar/calendar.controller.ts` dopisz pole do lokalnego interfejsu `CookieOptions` (linia ~70):

```ts
interface CookieOptions {
  readonly httpOnly: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly secure: boolean;
  /** Obecna wyłącznie przy wdrożeniu na dwóch hostach. */
  readonly domain?: string;
  /** Wyłącznie przy ustawianiu; `clearCookie` wygaszenie ustawia samo. */
  readonly maxAge?: number;
}
```

W metodzie `authorize` zamień wywołanie `res.cookie`:

```ts
    res.cookie(NONCE_COOKIE, nonce, {
      ...nonceCookieOptions(this.config.isProduction, calendar.cookieDomain),
      maxAge: NONCE_COOKIE_MAX_AGE_MS,
    });
```

W metodzie `callback` zamień wywołanie `res.clearCookie`:

```ts
    // Ta sama trójka (nazwa, ścieżka, domena), co przy ustawieniu — inaczej
    // przeglądarka zostawia nonce, który przeżył swoją zgodę.
    res.clearCookie(
      NONCE_COOKIE,
      nonceCookieOptions(this.config.isProduction, calendar.cookieDomain),
    );
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx nx test consultations`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/config/src/lib/app-config.service.ts libs/consultations/src/lib/calendar/oauth-callback.ts libs/consultations/src/lib/calendar/oauth-callback.spec.ts libs/consultations/src/lib/calendar/calendar.controller.ts
git commit -m "feat(calendar): domena ciastka nonce a przy wdrozeniu na dwoch hostach"
```

---

## Task 3: ADR i dokumentacja BE

**Files:**
- Create: `docs/adr/0036-domena-ciastka-nonce-przy-dwoch-hostach.md`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: decyzje z zadań 1–2
- Produces: nic (artefakt dokumentacyjny)

- [ ] **Step 1: Odczytaj szablon ADR i sąsiada**

Run: `cat docs/adr/TEMPLATE.md && head -40 docs/adr/0035-kasowanie-podmiotu-przez-granice-kontekstow.md`
Cel: zachować dokładnie ten sam układ nagłówków i stylistykę, co pozostałe 35 rekordów.

- [ ] **Step 2: Napisz ADR-0036**

Treść ma rozstrzygać dokładnie te punkty (proza, nie lista — zgodnie z szablonem):

- **Kontekst:** FE po integracji woła BE serwer-do-serwera (D3 specu integracji), więc `Set-Cookie` z `authorize` ląduje u serwera FE, nie w przeglądarce. Zgoda OAuth stoi na dwóch niezależnych bramkach, z których druga wymaga ciastka w przeglądarce.
- **Decyzja:** ciastko nonce'a dostaje `Domain` z `CALENDAR_COOKIE_DOMAIN`; FE przekazuje nagłówek dalej; przeglądarka wraca prosto na callback BE. Kontrakt bez zmian.
- **Odrzucone:** callback wracający do FE (mechanika OAuth zostaje w powłoce, nowa trasa w kontrakcie, klient natywny bez drogi); drugi sekret w `state` (wiąże zgodę z serwerem, nie z przeglądarką — druga bramka przestaje istnieć); przeglądarka wołająca `authorize` wprost (CORS i token w przeglądarce, sprzeczne z D3).
- **Konsekwencje:** działanie funkcji zależy od topologii DNS; ciastko rozszerza zasięg z hosta na domenę nadrzędną (wstrzyknięcie z poddomeny nadal nic nie daje, bo wiążący jest podpisany `state`); asercja startowa zamienia ciszę w błąd konfiguracji, ale **nie wykrywa domen z Public Suffix List** — to jest znana granica, nie przeoczenie.

- [ ] **Step 3: Dopisz zmienną do `.env.example`**

W `calisthenos-be/.env.example`, przy pozostałych zmiennych kalendarza:

```bash
# Domena ciastka nonce'a, gdy aplikacja webowa i API stoją na dwóch hostach
# (np. app.kalisthenos.pl + api.kalisthenos.pl → kalisthenos.pl).
# Pusta = jeden host; tak działa dev, gdzie oba serwery to localhost.
# MUSI być domeną rejestrowalną — nazwy z Public Suffix List (up.railway.app)
# przeglądarka odrzuca, a walidacja startowa tego nie wykryje.
CALENDAR_COOKIE_DOMAIN=
```

- [ ] **Step 4: Dopisz wiersz do tabeli zmiennych w `README.md`**

Znajdź tabelę opisującą zmienne kalendarza (`grep -n "WEB_APP_URL" README.md`) i dopisz `CALENDAR_COOKIE_DOMAIN` z tym samym opisem, co w `.env.example`, skróconym do jednego zdania.

- [ ] **Step 5: Dopisz ADR do rejestru**

W `docs/adr/README.md` dopisz wiersz `0036` do tabeli, wzorem `0035`.

- [ ] **Step 6: Weryfikacja**

Run: `npx nx test shared-config`
Expected: PASS (bez zmian — to zadanie nie rusza kodu; przebieg potwierdza, że edycje dokumentacji niczego nie zepsuły).

- [ ] **Step 7: Commit**

```bash
git add docs/adr .env.example README.md
git commit -m "docs(adr): 0036 domena ciastka nonce a przy dwoch hostach"
```

---

## Task 4: `app/lib/calendar.ts` — warstwa klienta (FE)

**Files:**
- Create: `app/lib/calendar.ts`
- Test: `app/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `Api` z `~/lib/api/client`; funkcje SDK `calendarConnectionControllerGet`, `…Authorize`, `…Disconnect` z `@kalisthenos/api-client`
- Produces:
  - `interface CalendarAuthorization { readonly url: string; readonly setCookie: string[] }`
  - `getCalendarConnection(api: Api): Promise<CalendarConnectionView>`
  - `startCalendarAuthorization(api: Api): Promise<CalendarAuthorization>`
  - `disconnectCalendar(api: Api): Promise<void>`

**Kontekst.** `CalendarConnectionView` ma pola `status: 'disconnected' | 'connected' | 'broken'`, `provider: string | null`, `accountLabel: string | null`. `CalendarAuthorizeResponse` ma jedno pole `url`. `runConsultationSync` **już jest** w `consultations.ts` — nie przenoś go tutaj.

- [ ] **Step 1: Napisz testy**

Utwórz `app/lib/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import {
  disconnectCalendar,
  getCalendarConnection,
  startCalendarAuthorization,
} from "./calendar";

function klient(reguly: (req: Request) => Response) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown, naglowki: [string, string][] = []): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: [["content-type", "application/json"], ...naglowki],
  });
}

describe("calendar — kalendarz zewnętrzny na kontrakcie", () => {
  it("stan połączenia przychodzi z kontraktu bez identyfikatora trenera", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, { status: "connected", provider: "google", accountLabel: "a@b.pl" });
    });

    const wynik = await getCalendarConnection(api);

    expect(sciezka).toBe("/v1/calendar/connection");
    expect(wynik.status).toBe("connected");
    expect(wynik.accountLabel).toBe("a@b.pl");
  });

  it("rozpoczęcie zgody oddaje adres RAZEM z ciastkiem", async () => {
    // To jest sedno całego projektu. Ciastko z nonce'em powstaje w odpowiedzi
    // na to wywołanie i wiąże je ze `state` w adresie zgody; przy wołaniu
    // serwer-do-serwera trafia do serwera FE, a nie do przeglądarki. Moduł
    // wydobywa je, żeby trasa mogła podać je dalej.
    const api = klient(() =>
      json(200, { url: "https://accounts.google.test/o/oauth2/auth?state=S" }, [
        ["set-cookie", "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback"],
      ]),
    );

    const wynik = await startCalendarAuthorization(api);

    expect(wynik.url).toContain("accounts.google.test");
    expect(wynik.setCookie).toEqual([
      "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback",
    ]);
  });

  it("dwa nagłówki Set-Cookie przechodzą oba", async () => {
    // `getSetCookie()` jest jedynym czytnikiem, który nie skleja powtórzonego
    // nagłówka w jeden napis. Gdyby moduł sięgnął po `headers.get`, drugie
    // ciastko zniknęłoby po cichu.
    const api = klient(() =>
      json(200, { url: "https://accounts.google.test/o/oauth2/auth" }, [
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]),
    );

    const wynik = await startCalendarAuthorization(api);

    expect(wynik.setCookie).toEqual(["a=1", "b=2"]);
  });

  it("brak ciastka daje pustą listę, nie wyjątek", async () => {
    // Odpowiedź bez `Set-Cookie` jest błędem konfiguracji po stronie BE,
    // ale trasa ma się wtedy wywrócić na odmowie zgody, a nie na `undefined`
    // w miejscu, w którym nikt się tego nie spodziewa.
    const api = klient(() => json(200, { url: "https://accounts.google.test/o/oauth2/auth" }));

    expect((await startCalendarAuthorization(api)).setCookie).toEqual([]);
  });

  it("rozłączenie idzie metodą DELETE", async () => {
    let metoda = "";
    let sciezka = "";
    const api = klient((req) => {
      metoda = req.method;
      sciezka = new URL(req.url).pathname;
      return new Response(null, { status: 204 });
    });

    await disconnectCalendar(api);

    expect(metoda).toBe("DELETE");
    expect(sciezka).toBe("/v1/calendar/connection");
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `npx vitest run app/lib/calendar.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module './calendar'`.

- [ ] **Step 3: Napisz moduł**

Utwórz `app/lib/calendar.ts`:

```ts
import {
  calendarConnectionControllerAuthorize,
  calendarConnectionControllerDisconnect,
  calendarConnectionControllerGet,
} from "@kalisthenos/api-client";
import type { CalendarConnectionView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

/**
 * Kalendarz zewnętrzny — jedyne wejście FE do tego obszaru.
 *
 * **Nie `google.ts`**: dostawca jest WARTOŚCIĄ pola `provider`, nigdy częścią
 * nazwy (ADR-0012 po stronie BE). Kontrakt typuje `provider` jako `string`,
 * a nie enum, dokładnie po to, żeby drugi dostawca był zmianą addytywną.
 */

/** Adres ekranu zgody wraz z ciastkiem, które musi trafić do przeglądarki. */
export interface CalendarAuthorization {
  readonly url: string;
  readonly setCookie: string[];
}

export async function getCalendarConnection(api: Api): Promise<CalendarConnectionView> {
  // `throwOnError: true` jawnie, choć klient ma je w konfiguracji: generyk
  // funkcji SDK domyślnie schodzi do `false`, więc bez tego `data` typuje się
  // jako `… | undefined`. Zero zmiany w czasie wykonania.
  const { data } = await calendarConnectionControllerGet({ client: api, throwOnError: true });
  return data;
}

/**
 * Rozpoczyna zgodę i wydobywa ciastko, które BE ustawił przy tej odpowiedzi.
 *
 * **Jedyne miejsce w tej warstwie, które przenosi ciastko BE dalej**, i jest to
 * wyjątek świadomy. Reguła („token w ciele, nie w ciastku") istnieje, bo FE woła
 * BE serwer-do-serwera i ciastka BE do niczego mu się nie przydają. Tutaj jest
 * odwrotnie: ciastko z nonce'em jest przeznaczone dla PRZEGLĄDARKI, a serwer FE
 * jest po drodze. Rozdzielenie adresu zgody od ciastka nie wchodzi w grę —
 * wiąże je ze sobą `state`, a docblock `CalendarAuthorizeResponse.url` w
 * kontrakcie mówi to wprost.
 *
 * `getSetCookie()`, nie `headers.get("set-cookie")`: tylko ono nie skleja
 * powtórzonego nagłówka w jeden napis.
 */
export async function startCalendarAuthorization(api: Api): Promise<CalendarAuthorization> {
  const { data, response } = await calendarConnectionControllerAuthorize({
    client: api,
    throwOnError: true,
  });
  return { url: data.url, setCookie: response.headers.getSetCookie() };
}

export async function disconnectCalendar(api: Api): Promise<void> {
  await calendarConnectionControllerDisconnect({ client: api, throwOnError: true });
}
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npx vitest run app/lib/calendar.test.ts --no-file-parallelism`
Expected: PASS, 5 przypadków.

- [ ] **Step 5: Sformatuj**

Run: `npx biome format --write app/lib/calendar.ts app/lib/calendar.test.ts`

- [ ] **Step 6: Zdaj raport (bez commita — git prowadzi Właściciel)**

Wypisz: utworzone pliki, liczbę przypadków, wynik przebiegu.

---

## Task 5: Powrót z callbacku przez korzeń aplikacji (FE)

**Files:**
- Modify: `app/routes/_index.tsx`
- Test: `app/routes/_index.test.tsx`

**Interfaces:**
- Consumes: nic
- Produces: nic (zmiana zachowania trasy)

**Kontekst.** BE odsyła przeglądarkę na `WEB_APP_URL` z `?calendar=ok` albo `?calendar=error&reason=denied|state|exchange` — czyli na **korzeń**, bo nie zna polskich nazw tras powłoki. Dziś `_index.tsx` (21 linii) zawsze przekierowuje: anonim na `/login`, zalogowany na sekcję wynikającą z roli.

- [ ] **Step 1: Napisz testy**

Utwórz `app/routes/_index.test.tsx`:

```tsx
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { apiContext } from "~/lib/api/context";
import { loader } from "./_index";

function wywolaj(url: string, user: unknown) {
  const context = new RouterContextProvider();
  context.set(apiContext, { api: null as never, user: user as never });
  try {
    loader({ request: new Request(url), params: {}, context } as never);
  } catch (e) {
    return e as Response;
  }
  throw new Error("loader miał przekierować, a nie zwrócić wartość");
}

const TRENER = {
  id: "u-1",
  email: "t@example.pl",
  displayName: "Trener",
  roles: ["trainer"],
  trainerId: null,
  trainerName: null,
};

describe("korzeń — powrót z callbacku kalendarza", () => {
  it("odsyła na ekran integracji z zachowanymi parametrami", () => {
    const res = wywolaj("https://fe.test/?calendar=error&reason=state", TRENER);

    expect(res.headers.get("Location")).toBe(
      "/trener/integracje/google?calendar=error&reason=state",
    );
  });

  it("powodzenie zgody trafia tam samo", () => {
    const res = wywolaj("https://fe.test/?calendar=ok", TRENER);

    expect(res.headers.get("Location")).toBe("/trener/integracje/google?calendar=ok");
  });

  it("martwa sesja nie jest przypadkiem szczególnym", () => {
    // Gałąź nie patrzy na użytkownika, a ekran integracji i tak wymaga
    // trenera — więc anonim kończy na `/login` tak samo, jak skończyłby
    // bez tej gałęzi. Sprawdzenie tożsamości stoi w JEDNYM miejscu.
    const res = wywolaj("https://fe.test/?calendar=ok", null);

    expect(res.headers.get("Location")).toBe("/trener/integracje/google?calendar=ok");
  });

  it("bez parametru zachowanie się nie zmienia", () => {
    expect(wywolaj("https://fe.test/", TRENER).headers.get("Location")).toBe("/trener");
    expect(wywolaj("https://fe.test/", null).headers.get("Location")).toBe("/login");
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `npx vitest run app/routes/_index.test.tsx --no-file-parallelism`
Expected: FAIL — dwa pierwsze przypadki dostają `/trener` zamiast ekranu integracji, trzeci `/login`.

- [ ] **Step 3: Dodaj gałąź**

Zamień `loader` w `app/routes/_index.tsx`:

```tsx
import { redirect, type LoaderFunctionArgs } from "react-router";
import { optionalUser, sectionFor } from "~/lib/api/auth";

/**
 * Root index — always redirects.
 * - Powrót z callbacku kalendarza → /trener/integracje/google
 * - Logged in as trainer → /trener
 * - Logged in as trainee → /podopieczny
 * - Anonymous → /login
 */
export function loader({ request, context }: LoaderFunctionArgs) {
  // BE odsyła przeglądarkę po zgodzie na `WEB_APP_URL`, czyli tutaj: nie zna
  // polskich nazw tras powłoki i znać ich nie ma. Przekierowanie na ekran,
  // który te parametry umie odczytać, jest więc pracą FE.
  //
  // PRZED sprawdzeniem tożsamości i to jest świadome: ekran docelowy i tak
  // wymaga trenera, więc sesja wygasła w trakcie rundy po zgodę kończy na
  // `/login` tak samo, jak skończyłaby bez tej gałęzi. Dublowanie tu kontroli
  // dawałoby drugie miejsce, w którym ta sama reguła może się rozjechać.
  const { searchParams } = new URL(request.url);
  if (searchParams.has("calendar")) {
    throw redirect(`/trener/integracje/google?${searchParams}`);
  }

  const { user } = optionalUser(context);
  if (!user) throw redirect("/login");
  // Regułę „rola → sekcja" zna wyłącznie `sectionFor` — rola jest LISTĄ
  // (ADR-0013), więc to przynależność, nie równość, a trener wygrywa przy obu.
  throw redirect(sectionFor(user));
}

export default function Index() {
  // Loader always throws a redirect; this component never renders.
  return null;
}
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npx vitest run app/routes/_index.test.tsx --no-file-parallelism`
Expected: PASS, 4 przypadki.

- [ ] **Step 5: Sformatuj i zdaj raport**

Run: `npx biome format --write app/routes/_index.tsx app/routes/_index.test.tsx`
Raport: zmienione pliki, wynik przebiegu. Bez commita.

---

## Task 6: Ekran integracji na kontrakcie; usunięcie trasy callbacku (FE)

**Files:**
- Modify: `app/routes/trener/integracje.google.tsx`
- Delete: `app/routes/trener/integracje.google.callback.tsx`
- Modify: `app/routes.ts:29`
- Test: `app/routes/trener/integracje.google.test.tsx`

**Interfaces:**
- Consumes: `getCalendarConnection`, `startCalendarAuthorization`, `disconnectCalendar`, `CalendarAuthorization` z zadania 4
- Produces: nic

**Trzy zmiany semantyczne, których nie wolno przeoczyć.**

1. **`googleConfigured()` znika bez zamiennika.** BE celowo mówi o wyłączonej integracji **jedną historią**: `GET /v1/calendar/connection` zwraca wtedy `disconnected`, a `POST …/authorize` odmawia `409 CALENDAR_NOT_CONFIGURED`. FE nie ma jak odróżnić „niepodłączone" od „niewłączone" przed kliknięciem — i nie ma potrzeby. Komunikat przychodzi z `409`, a `message` z kontraktu jest już po polsku i dla użytkownika.
2. **Status ma trzy wartości, nie dwie.** `disconnected | connected | broken`. Dzisiejsze FE liczy `connected = Boolean(wiersz)`, więc zachowanie zachowuje mapowanie `status !== "disconnected"` → jest połączenie. `broken` pokazuje ten sam ekran z przyciskiem „Rozłącz", bo rozłączenie jest jedyną drogą wyjścia z zepsutego połączenia.
3. **Nazwy parametrów zwrotnych się zmieniają**: `?ok=1` → `?calendar=ok`, `?error=X` → `?calendar=error&reason=X`. Zbiór powodów zostaje ten sam.

- [ ] **Step 1: Napisz test trasy**

Utwórz `app/routes/trener/integracje.google.test.tsx`:

```tsx
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./integracje.google";

const TRENER = {
  id: "u-1",
  email: "t@example.pl",
  displayName: "Trener",
  roles: ["trainer"] as const,
  trainerId: null,
  trainerName: null,
};

function scenariusz(odpowiedz: (req: Request) => Response) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: (async (req: Request) => odpowiedz(req)) as unknown as typeof fetch,
    }),
    user: TRENER as never,
  });
  return context;
}

function formularz(intent: string): Request {
  const body = new URLSearchParams({ intent });
  return new Request("https://fe.test/trener/integracje/google", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe("integracje.google — ekran na kontrakcie", () => {
  it("loader oddaje stan połączenia z kontraktu", async () => {
    const context = scenariusz(() =>
      new Response(
        JSON.stringify({ status: "connected", provider: "google", accountLabel: "a@b.pl" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const wynik = (await loader({
      request: new Request("https://fe.test/trener/integracje/google"),
      params: {},
      context,
    } as never)) as { connection: { accountLabel: string | null } };

    expect(wynik.connection.accountLabel).toBe("a@b.pl");
  });

  it("Połącz przekierowuje na zgodę i PRZEKAZUJE oba ciastka", async () => {
    // Bez tego przekazania ciastko z nonce'em zostaje u serwera FE, a każda
    // zgoda kończy się `reason=state` — objawem nieodróżnialnym od poprawnie
    // zadziałanej bramki CSRF. To jest jedyny test, który tego pilnuje.
    const context = scenariusz(() =>
      new Response(JSON.stringify({ url: "https://accounts.google.test/auth?state=S" }), {
        status: 200,
        headers: [
          ["content-type", "application/json"],
          ["set-cookie", "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback"],
          ["set-cookie", "drugie=2"],
        ],
      }),
    );

    const res = (await action({
      request: formularz("connect"),
      params: {},
      context,
    } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://accounts.google.test/auth?state=S");
    expect(res.headers.getSetCookie()).toEqual([
      "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback",
      "drugie=2",
    ]);
  });

  it("wyłączona integracja wraca komunikatem z kontraktu, nie granicą błędu", async () => {
    const context = scenariusz(() =>
      new Response(
        JSON.stringify({
          error: {
            code: "CALENDAR_NOT_CONFIGURED",
            message: "Integracja kalendarza nie jest włączona na tym serwerze.",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

    const wynik = (await action({
      request: formularz("connect"),
      params: {},
      context,
    } as never)) as { error: string };

    expect(wynik.error).toContain("nie jest włączona");
  });

  it("Rozłącz woła DELETE i wraca komunikatem", async () => {
    let metoda = "";
    const context = scenariusz((req) => {
      metoda = req.method;
      return new Response(null, { status: 204 });
    });

    const wynik = (await action({
      request: formularz("disconnect"),
      params: {},
      context,
    } as never)) as { success: string };

    expect(metoda).toBe("DELETE");
    expect(wynik.success).toContain("odłączone");
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `npx vitest run app/routes/trener/integracje.google.test.tsx --no-file-parallelism`
Expected: FAIL — trasa stoi dziś na Drizzle i `getEnv` zamockowany bez zmiennych Google.

- [ ] **Step 3: Przepnij loader i akcję**

W `app/routes/trener/integracje.google.tsx` zamień górę pliku (importy, `nonceCookie`, `loader`, `action`) na:

```tsx
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { requireUser } from "~/lib/api/auth";
import { ApiError, toRouteResponse } from "~/lib/api/errors";
import {
  disconnectCalendar,
  getCalendarConnection,
  startCalendarAuthorization,
} from "~/lib/calendar";

export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  return { connection: await getCalendarConnection(api) };
}

export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "connect") {
      const { url, setCookie } = await startCalendarAuthorization(api);
      // `Headers.append`, nie literał obiektu: ciastek bywa więcej niż jedno,
      // a obiekt zostawiłby ostatnie. To ciastko wiąże zgodę z przeglądarką —
      // zgubione znaczy odmowę przy powrocie od dostawcy.
      const headers = new Headers();
      for (const cookie of setCookie) headers.append("Set-Cookie", cookie);
      return redirect(url, { headers });
    }
    if (intent === "disconnect") {
      await disconnectCalendar(api);
      return { success: "Konto Google odłączone." };
    }
    return null;
  } catch (e) {
    // `409` to wyłączona integracja na serwerze. `message` z kontraktu jest
    // już po polsku i dla użytkownika, więc idzie na ekran bez tłumaczenia —
    // a granica błędu pokazałaby zamiast tego zupełnie inny ekran.
    if (e instanceof ApiError && e.status === 409) return { error: e.message };
    if (e instanceof ApiError) throw toRouteResponse(e);
    throw e;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Anulowałeś autoryzację lub odmówiłeś dostępu.",
  state: "Żądanie wygasło lub zostało zmodyfikowane — spróbuj ponownie.",
  exchange: "Nie udało się wymienić kodu autoryzacji na tokeny — spróbuj ponownie.",
};
```

- [ ] **Step 4: Przepnij komponent**

W tym samym pliku zamień początek komponentu i gałąź stanu:

```tsx
export default function IntegracjeGoogle() {
  const { connection } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  // Nazwy parametrów pochodzą od BE (`callbackRedirect`), nie od FE.
  const calendarParam = searchParams.get("calendar");
  const okParam = calendarParam === "ok";
  const errorParam = calendarParam === "error" ? searchParams.get("reason") : null;

  // `broken` to jest połączenie — zepsute, ale istniejące, a jedyną drogą
  // wyjścia z niego jest „Rozłącz". Ten sam podział, co przed integracją,
  // gdzie decydowała obecność wiersza.
  const polaczone = connection.status !== "disconnected";
```

Trójczłonową gałąź `{!configured ? (…) : status.connected ? (…) : (…)}` zamień na dwuczłonową. Człon „niezskonfigurowane" znika — o wyłączonej integracji mówi teraz `409` z akcji, wyświetlany banerem błędu, który już w tym komponencie stoi:

```tsx
        {polaczone ? (
          <div>
            <p style={{ margin: "0 0 16px" }}>
              Połączone konto: <strong>{connection.accountLabel ?? "(połączone)"}</strong>
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
                Rozłącz
              </button>
            </Form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              Brak połączonego konta Google. Kliknij poniżej, aby autoryzować dostęp do kalendarza.
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                Połącz z Google
              </button>
            </Form>
          </div>
        )}
```

Reszta komponentu — nagłówek strony i cztery banery — zostaje bez zmian.

- [ ] **Step 5: Usuń trasę callbacku i jej wpis**

```bash
rm app/routes/trener/integracje.google.callback.tsx
```

W `app/routes.ts` usuń linię 29 (`route("integracje/google/callback", …)`).

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/routes/trener/integracje.google.test.tsx --no-file-parallelism`
Expected: PASS, 4 przypadki.

- [ ] **Step 7: Sformatuj i zdaj raport**

Run: `npx biome format --write app/routes/trener/integracje.google.tsx app/routes/trener/integracje.google.test.tsx app/routes.ts`
Raport: zmienione i usunięte pliki, wynik przebiegu. Bez commita.

---

## Task 7: Usunięcie `app/lib/google/` wraz z ostatnim czytelnikiem (FE)

**Files:**
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx:17,33,44,59`
- Delete: `app/lib/google/` — sześć plików: `connections.ts`, `oauth.ts`, `oauth.test.ts`, `crypto.ts`, `crypto.test.ts`, `README.md`
- Modify: `app/lib/env.ts:37-41,73-78`
- Modify: `app/lib/format.ts:9`
- Modify: `package.json:26,42`
- Create: `app/routes/no-google-lib.test.ts`

**Interfaces:**
- Consumes: `getCalendarConnection` z zadania 4
- Produces: nic

**Pułapka osieroconego importu — obowiązkowa, nie opcjonalna.** Linia 59 tej trasy jest **jedynym** użyciem `db` w całym pliku. Usunięcie jej bez usunięcia importu z linii 33 przechodzi `tsc` bez słowa i **wywraca `npm run build`**: `app/lib/db/client.ts` tworzy połączenie w zasięgu modułu, więc Rollup nie może go wyciąć mimo nieużywanej nazwy, sterownik postgres ląduje w bundlu przeglądarki i przewraca się na `perf_hooks`. Komunikat nie wskazuje winnej trasy.

- [ ] **Step 1: Napisz bramkę**

Utwórz `app/routes/no-google-lib.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KORZEN = join(process.cwd(), "app");
const USUNIETY_KATALOG = "~/lib/google";

function pliki(katalog: string): string[] {
  return readdirSync(katalog).flatMap((wpis) => {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) return pliki(sciezka);
    return /\.(ts|tsx)$/.test(wpis) ? [sciezka] : [];
  });
}

/**
 * Komentarze wycięte PRZED szukaniem — zakaz dotyczy importów, nie zdań
 * tłumaczących, dokąd ten katalog poszedł. Bramka wymuszająca kasowanie
 * takich zdań kupowałaby zieloność za cenę wiedzy. Ten sam wzorzec, co
 * w `no-stara-sesja.test.ts`.
 */
function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("kalendarz zewnętrzny — nic w app/ nie sięga po usunięty katalog", () => {
  it("znajduje pliki źródłowe", () => {
    // Bez tej asercji bramka przechodziłaby PUSTA, gdyby skan przestał
    // cokolwiek widzieć — dokładnie tak, jak stało się bramce skanującej
    // `.claude/skills` po przeniesieniu katalogu: zero plików, zielono
    // i bez żadnej ochrony.
    expect(pliki(KORZEN).length).toBeGreaterThan(100);
  });

  it("import z ~/lib/google nie występuje w KODZIE", () => {
    const winowajcy = pliki(KORZEN).filter((p) =>
      bezKomentarzy(readFileSync(p, "utf8")).includes(USUNIETY_KATALOG),
    );

    expect(winowajcy).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom bramkę — ma paść**

Run: `npx vitest run app/routes/no-google-lib.test.ts --no-file-parallelism`
Expected: FAIL — lista winowajców zawiera `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`.

- [ ] **Step 3: Przepnij ostatniego czytelnika**

W `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx` cztery zmiany, wszystkie konieczne razem:

Linia 17 — zamień import:
```tsx
import { getCalendarConnection } from "~/lib/calendar";
```
(zamiast `import { isGoogleSyncActive } from "~/lib/google/connections";`)

Linia 33 — **usuń** (to jedyne miejsce, gdzie `db` w tym pliku występuje poza linią 59):
```tsx
import { db } from "~/lib/db/client";
```

Linia 44 — **`user` przestaje być używane**. Linia 59 jest jego jedynym konsumentem w całym pliku, więc zostawienie go w destrukturyzacji zapala `noUnusedVariables` w Biome:
```tsx
  const { api } = requireUser(args.context, { role: "trainer" });
```

Linia 59 — zamień:
```tsx
  // `broken` liczy się jako aktywne, tak samo jak przed integracją, gdzie
  // decydowała sama obecność wiersza połączenia. Chip zostaje widoczny,
  // a o tym, czy synchronizacja przejdzie, rozstrzyga `runConsultationSync`
  // (`connected: false` → komunikat zamiast mylącego „0/0").
  const googleActive = (await getCalendarConnection(api)).status !== "disconnected";
```

- [ ] **Step 4: Usuń katalog**

```bash
rm -rf app/lib/google
```

- [ ] **Step 5: Uruchom bramkę — ma przejść**

Run: `npx vitest run app/routes/no-google-lib.test.ts --no-file-parallelism`
Expected: PASS, 2 przypadki.

- [ ] **Step 6: Wyczyść zmienne środowiskowe**

W `app/lib/env.ts` usuń cztery deklaracje (linie 36–41, wraz z komentarzem „Integracja Google (opcjonalna…)" i komentarzem o kluczu AES) oraz całą funkcję `googleConfigured()` (linie 72–78). **Nie ruszaj** `stripeConfigured()` ani niczego niżej.

- [ ] **Step 7: Popraw martwy odsyłacz**

W `app/lib/format.ts:9` odsyłacz `Patrz \`lib/google/calendar.ts\`.` wskazuje plik usunięty w S3. Zamień na:
```
 * zinterpretowany jako UTC i przesunięty o offset. Strefę podaje jawnie BE
 * przy wypychaniu terminu do kalendarza zewnętrznego.
```

- [ ] **Step 8: Zdejmij zależności**

W `package.json` usuń dwie linie:
```
    "@googleapis/calendar": "^9.7.0",
    "google-auth-library": "^9.14.0",
```

**NIE uruchamiaj `npm install`.** Instalację i `package-lock.json` prowadzi Właściciel.

- [ ] **Step 9: Sprawdź pułapkę osieroconych importów**

```bash
for f in $(grep -rl 'from "~/lib/db/client"' app --include=*.ts --include=*.tsx | grep -v "\.test\."); do
  n=$(grep -v '^import' "$f" | grep -c '\bdb\b'); [ "$n" = "0" ] && echo "NIEUZYWANY: $f";
done
```
Expected: brak wyjścia. Każdy wypisany plik ma import `db` bez użycia — usuń import, inaczej `npm run build` się wywróci.

- [ ] **Step 10: Uruchom testy dotkniętych modułów**

Run: `npx vitest run app/routes/no-google-lib.test.ts app/lib/env.test.ts app/lib/format.test.ts app/routes/no-direct-db.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 11: Sformatuj i zdaj raport**

Run: `npx biome format --write app/lib/env.ts app/lib/format.ts "app/routes/trener/podopieczni.\$traineeId.konsultacje._index.tsx" app/routes/no-google-lib.test.ts`
Raport: usunięte pliki, zmienione pliki, wynik przebiegu, wynik sprawdzenia z kroku 9. Bez commita.

---

## Task 8: Dokumentacja FE i domknięcie LK1

**Files:**
- Modify: `README.md:160-172`
- Modify: `.env.example:28-35`
- Modify: `app/lib/README.md:10,21,68`
- Modify: `app/routes/trener/README.md:28,42,43,50`
- Modify: `docs/superpowers/specs/README.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `docs/superpowers/plans/2026-09-03-reszta-app-lib-na-kontrakcie.md` (sekcja §7, wiersz LK1)

**Interfaces:**
- Consumes: stan drzewa po zadaniach 4–7
- Produces: nic

- [ ] **Step 1: Zmienne środowiskowe**

W `README.md` usuń tabelę czterech zmiennych `GOOGLE_*` (linie 166–170) wraz z akapitem „Bez tych zmiennych aplikacja działa normalnie…". W jej miejsce jedno zdanie: integracja kalendarza jest konfigurowana **po stronie BE** (`GOOGLE_*` i `CALENDAR_COOKIE_DOMAIN` w `calisthenos-be`), a FE nie zna żadnego sekretu Google. Instrukcję zakładania projektu w Google Cloud przenieś odsyłaczem do README backendu.

W `.env.example` usuń linie 28–35 (blok komentarza i cztery zmienne).

- [ ] **Step 2: `app/lib/README.md`**

- linia 10 — z listy „na Drizzle" wykreśl `google/{connections,oauth,crypto}.ts (luka LK1)`; zostaje samo `payments.ts` (S6);
- linia 21 — z opisu `env.ts` usuń zdanie o kluczach `GOOGLE_*` i `googleConfigured()`;
- linia 68 — wiersz `google/` zamień na wiersz `calendar.ts` opisujący trzy funkcje i **wyjątek przekazywania `Set-Cookie`** (jedyne miejsce w warstwie, które przenosi ciastko BE, i dlaczego);
- dopisz `calendar.ts` w porządku alfabetycznym tabeli, jeśli tam należy.

- [ ] **Step 3: `app/routes/trener/README.md`**

- linia 28 — z opisu trasy konsultacji usuń ostatnie zdanie („Predykat `isGoogleSyncActive` … jedyny powód, dla którego `db` tu jeszcze jest") i zastąp je zdaniem, że stan chipa czyta `getCalendarConnection`, a `db` z tej trasy zniknęło;
- linia 42 — przepisz opis `integracje.google.tsx`: stan z `GET /v1/calendar/connection`, `connect` przekazuje `Set-Cookie` z `authorize` i przekierowuje na zgodę, `disconnect` woła `DELETE`, banery czytają `?calendar` i `?reason`, wyłączona integracja daje `409` z komunikatem kontraktu;
- linia 43 — **usuń cały wiersz** `integracje.google.callback.tsx`;
- linia 50 — z listy zależności usuń `lib/google/connections`, `lib/google/oauth`, dopisz `lib/calendar`.

- [ ] **Step 4: Rejestry dokumentacji**

- `docs/superpowers/specs/README.md` — wiersz o `2026-09-04-zgoda-google-przez-dwa-hosty-design.md`, wzorem sąsiadów: co rozstrzyga, sześć decyzji, granica asercji;
- `docs/superpowers/plans/README.md` — wiersz o tym planie.

- [ ] **Step 5: Domknij LK1**

W `docs/superpowers/plans/2026-09-03-reszta-app-lib-na-kontrakcie.md` §7 oznacz wiersz **LK1** jako zamkniętą, dokładnie tym wzorcem, którego użyto dla `L S3-2`: `~~**LK1**~~ **ZAMKNIĘTA**`, treść przekreślona, w kolumnie propozycji odsyłacz do specu z 2026-09-04 i jednozdaniowe „jak".

Sprawdź też warunek wejścia S6 zapisany w §S6 („Grep `~/lib/db` w `app/` zwraca zero trafień poza `app/lib/db/` i `google/*` (LK1)") — wyjątek na `google/*` przestał być potrzebny, więc usuń go z warunku.

- [ ] **Step 6: Weryfikacja warunku wejścia S6**

```bash
grep -rn '~/lib/db' app --include=*.ts --include=*.tsx | grep -v '^app/lib/db/'
```
Expected: trafienia wyłącznie w Stripe (`app/lib/stripe/*`, `payments.ts`), tożsamości (`auth/invite.ts`, `auth/users.ts`) i tras płatności/formularza. **Ani jednego trafienia w kalendarzu.** Wypisz wynik w raporcie — to jest dowód, że S6 da się zacząć.

- [ ] **Step 7: Zdaj raport**

Raport: zmienione pliki dokumentacji, wynik grepa z kroku 6. Bez commita.

---

## Domknięcie (koordynator, po zadaniu 8)

1. **Checkpoint Właściciela** — pełne bramki FE, jeden przebieg każda, sekwencyjnie:
   `npm run typecheck`, `npm run lint`, `npx vitest run app`, `npm run build`.
2. Po stronie BE: `pnpm verify` na gałęzi roboczej, potem scalenie do `main`.
3. Commit FE — po stronie Właściciela.
4. **Do zrobienia poza repozytorium przed cutoverem** (nie jest to zadanie planu, ale bez tego zgoda nie zadziała na produkcji): zmiana `GOOGLE_REDIRECT_URI` w konsoli Google Cloud na adres callbacku **BE**, ustawienie `CALENDAR_COOKIE_DOMAIN` na domenę rejestrowalną i ręczna próba połączenia kalendarza.
