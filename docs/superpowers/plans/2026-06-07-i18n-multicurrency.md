# i18n (pl/fr) + multi-currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Kroki: checkboxy `- [ ]`.
>
> **Reguły repo (NADRZĘDNE):** nigdy `git`/`docker`; **brak kroków commit** (review per task, handoff na końcu). `npm install` / `db:seed` / `test:itest` = **właściciel**. npm nie pnpm. Po API i18next/remix-i18next sięgaj przez **context7**. Brand `kalisthenos` małą literą.

**Goal:** Pełne i18n (pl/fr) + formatowanie waluty/dat zależne od regionu, na bazie i18next + react-i18next + remix-i18next (klasyczny server-helper, RR 7.15.1).

**Architecture:** Locale rozwiązywane per-request (region usera / region zapraszającego trenera / Accept-Language → fallback `pl`); serwerowa instancja i18next per-request w `entry.server.tsx`, klient w nowym `entry.client.tsx`, oba przez `I18nextProvider`; `<html lang>` z root loadera. Etykiety serwerowe zwracają klucze, UI tłumaczy. Waluta/daty przez `Intl`.

**Tech Stack:** i18next, react-i18next, remix-i18next, Intl, Vitest, Drizzle (seed FR), Biome.

**Spec:** `docs/superpowers/specs/2026-06-07-i18n-multicurrency-design.md`

---

## Mapa plików

| Plik | Rola | Akcja |
|---|---|---|
| `package.json` | dep: i18next, react-i18next, remix-i18next | Modyfikacja (**npm install = handoff**) |
| `app/i18n/config.ts` | SUPPORTED_LANGS, FALLBACK_LANG, namespaces, langToIntlLocale, localeToLang | Utworzenie |
| `app/i18n/pick-lang.ts` (+`.test.ts`) | czysta funkcja decyzyjna locale | Utworzenie |
| `app/i18n/resources.ts` | import JSON → resources + typowanie modułu i18next | Utworzenie |
| `app/locales/{pl,fr}/*.json` | słowniki per namespace | Utworzenie (przyrostowo) |
| `app/locales/parity.test.ts` | test parzystości kluczy pl/fr | Utworzenie |
| `app/i18n.server.ts` | RemixI18Next + resolveLang (sesja→region, invite→trener) + cookie `lng` | Utworzenie |
| `app/entry.server.tsx` | per-request instancja + I18nextProvider | Modyfikacja |
| `app/entry.client.tsx` | klient i18next + I18nextProvider | Utworzenie |
| `app/root.tsx` | root loader `locale` + `<html lang>` | Modyfikacja |
| `app/lib/money.ts` (+test) | `fmtMoney(minor,locale,currency)`, `parseMoneyToMinor` | Modyfikacja |
| `app/lib/format.ts` (+test) | `fmtDate(value, locale)` | Modyfikacja |
| `app/lib/stripe/status.ts` (+test) | etykiety → klucze | Modyfikacja |
| `app/lib/consultation-status.ts` (+test) | etykiety → klucze | Modyfikacja |
| `app/lib/list-params.ts`, `app/lib/wrapped.ts` | etykiety → klucze/Intl | Modyfikacja |
| `scripts/seed.ts`, `.env.example` | seed region FR | Modyfikacja |
| `app/routes/**` | ekstrakcja stringów (per obszar) | Modyfikacja |
| `tests/i18n-locale.itest.ts` | resolveLang end-to-end (PISANY, nie uruchamiany) | Utworzenie |
| README-e / `CLAUDE.md` | dokumentacja | Modyfikacja |

---

# CZĘŚĆ A — FUNDAMENT

## Task 1: Zależności + konfiguracja i18n

**Files:** Modify `package.json`; Create `app/i18n/config.ts`.

- [ ] **Step 1 — dodaj zależności do `package.json`** (sekcja `dependencies`, wersje sprawdź context7/npm — użyj aktualnych stabilnych):
```
"i18next": "^23",
"react-i18next": "^15",
"remix-i18next": "^7"
```
> **HANDOFF:** właściciel uruchomi `npm install`. W tym tasku NIE instalujemy. Kolejne kroki (typecheck/testy zależne od tych paczek) mogą do `npm install` czekać — oznacz w raporcie, jeśli typecheck nie przejdzie z powodu braku modułów (to oczekiwane do `npm install`).

- [ ] **Step 2 — utwórz `app/i18n/config.ts`:**
```ts
export const SUPPORTED_LANGS = ["pl", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const FALLBACK_LANG: Lang = "pl";
export const DEFAULT_NS = "common";

/** Namespace'y i18next — dokładane wraz z ekstrakcją kolejnych obszarów. */
export const NAMESPACES = ["common", "auth"] as const;

/** Język i18next → pełny tag BCP-47 do Intl (waluta/daty/liczby). */
export const langToIntlLocale: Record<Lang, string> = {
  pl: "pl-PL",
  fr: "fr-FR",
};

/** BCP-47 (np. z regions.locale "pl-PL") → język i18next ("pl"). */
export function localeToLang(locale: string | null | undefined): Lang | null {
  if (!locale) return null;
  const base = locale.split("-")[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(base) ? (base as Lang) : null;
}
```

- [ ] **Step 3 — lint:** `npx biome format --write app/i18n/config.ts`
- [ ] **Step 4 — review per task** (`/code-review`).

**Test:** brak (czysta konfiguracja; `localeToLang` przetestujemy pośrednio w Task 3 lub dodaj 1 trywialny test jeśli chcesz). **Krytyczny przepływ:** nie.

---

## Task 2: Czysta resolucja języka `pickLang` (TDD)

**Files:** Create `app/i18n/pick-lang.ts`, `app/i18n/pick-lang.test.ts`.

- [ ] **Step 1 — failujący test** `app/i18n/pick-lang.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pickLang } from "./pick-lang";

describe("pickLang", () => {
  it("priorytet 1: region zalogowanego usera", () => {
    expect(pickLang({ regionLocale: "fr-FR", acceptLanguage: "pl,en" })).toBe("fr");
  });
  it("priorytet 2: region zapraszającego trenera (strona zaproszenia)", () => {
    expect(pickLang({ inviteTrainerRegionLocale: "fr-FR", acceptLanguage: "pl" })).toBe("fr");
  });
  it("priorytet 3: Accept-Language dopasowany do wspieranych", () => {
    expect(pickLang({ acceptLanguage: "fr-CH,fr;q=0.9,en;q=0.8" })).toBe("fr");
  });
  it("fallback pl gdy nic nie pasuje", () => {
    expect(pickLang({ acceptLanguage: "en-US,de" })).toBe("pl");
    expect(pickLang({})).toBe("pl");
  });
  it("region ma pierwszeństwo nad Accept-Language", () => {
    expect(pickLang({ regionLocale: "pl-PL", acceptLanguage: "fr" })).toBe("pl");
  });
});
```

- [ ] **Step 2 — uruchom, ma FAILOWAĆ:** `npx vitest run app/i18n/pick-lang.test.ts`

- [ ] **Step 3 — implementacja `app/i18n/pick-lang.ts`:**
```ts
import { FALLBACK_LANG, type Lang, localeToLang, SUPPORTED_LANGS } from "./config";

export interface PickLangInput {
  regionLocale?: string | null;
  inviteTrainerRegionLocale?: string | null;
  acceptLanguage?: string | null;
}

/** Pierwszy wspierany język z nagłówka Accept-Language, albo null. */
function fromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    const lang = localeToLang(tag);
    if (lang) return lang;
  }
  return null;
}

export function pickLang(input: PickLangInput): Lang {
  return (
    localeToLang(input.regionLocale) ??
    localeToLang(input.inviteTrainerRegionLocale) ??
    fromAcceptLanguage(input.acceptLanguage) ??
    FALLBACK_LANG
  );
}
```

- [ ] **Step 4 — uruchom, ma PRZEJŚĆ:** `npx vitest run app/i18n/pick-lang.test.ts`
- [ ] **Step 5 — typecheck + format:** `npm run typecheck`; `npx biome format --write app/i18n/pick-lang.ts app/i18n/pick-lang.test.ts`
- [ ] **Step 6 — review per task.**

**Krytyczny przepływ:** logika decyzyjna locale — pokryta unit; I/O w Task 4 (integ).

---

## Task 3: Słowniki `common`+`auth` + test parzystości (TDD)

**Files:** Create `app/locales/pl/common.json`, `app/locales/fr/common.json`, `app/locales/pl/auth.json`, `app/locales/fr/auth.json`, `app/i18n/resources.ts`, `app/locales/parity.test.ts`.

- [ ] **Step 1 — failujący test parzystości** `app/locales/parity.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resources } from "~/i18n/resources";
import { NAMESPACES, SUPPORTED_LANGS } from "~/i18n/config";

function keysDeep(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keysDeep(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("parzystość kluczy locale", () => {
  for (const ns of NAMESPACES) {
    it(`ns "${ns}": fr ma dokładnie te same klucze co pl`, () => {
      const plKeys = keysDeep(resources.pl[ns]).sort();
      const frKeys = keysDeep(resources.fr[ns]).sort();
      expect(frKeys).toEqual(plKeys);
    });
  }
  it("każdy wspierany język ma każdy namespace", () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const ns of NAMESPACES) {
        expect(resources[lang][ns]).toBeDefined();
      }
    }
  });
});
```

- [ ] **Step 2 — uruchom, ma FAILOWAĆ** (brak `resources`): `npx vitest run app/locales/parity.test.ts`

- [ ] **Step 3 — utwórz słowniki.** `app/locales/pl/common.json`:
```json
{
  "app": { "name": "kalisthenos" },
  "nav": { "logout": "Wyloguj" },
  "action": { "save": "Zapisz", "cancel": "Anuluj", "back": "Wróć" }
}
```
`app/locales/fr/common.json`:
```json
{
  "app": { "name": "kalisthenos" },
  "nav": { "logout": "Se déconnecter" },
  "action": { "save": "Enregistrer", "cancel": "Annuler", "back": "Retour" }
}
```
`app/locales/pl/auth.json`:
```json
{
  "login": {
    "eyebrow": "Logowanie",
    "title": "Wróć do treningu",
    "email": "Email",
    "password": "Hasło",
    "submit": "Zaloguj",
    "error": "Niepoprawne dane logowania."
  }
}
```
`app/locales/fr/auth.json`:
```json
{
  "login": {
    "eyebrow": "Connexion",
    "title": "Reprends l'entraînement",
    "email": "E-mail",
    "password": "Mot de passe",
    "submit": "Se connecter",
    "error": "Identifiants invalides."
  }
}
```

- [ ] **Step 4 — utwórz `app/i18n/resources.ts`:**
```ts
import plCommon from "~/locales/pl/common.json";
import plAuth from "~/locales/pl/auth.json";
import frCommon from "~/locales/fr/common.json";
import frAuth from "~/locales/fr/auth.json";

export const resources = {
  pl: { common: plCommon, auth: plAuth },
  fr: { common: frCommon, auth: frAuth },
} as const;

// Typowanie `t` — pl jako źródło prawdy kluczy.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["pl"];
  }
}
```
> Wymaga `resolveJsonModule` w tsconfig (sprawdź; RR7/vite zwykle ma). Jeśli brak — dodaj `"resolveJsonModule": true` do `tsconfig.json`.

- [ ] **Step 5 — uruchom, ma PRZEJŚĆ:** `npx vitest run app/locales/parity.test.ts`
- [ ] **Step 6 — typecheck + format.** (typecheck może wymagać `npm install` — patrz Task 1.)
- [ ] **Step 7 — review per task.**

**Krytyczny przepływ:** nie.

---

## Task 4: `i18n.server.ts` — RemixI18Next + resolveLang (sesja/region/invite)

**Files:** Create `app/i18n.server.ts`. (Czyta sesję/region — sprawdź realne API: `app/lib/auth/session.ts` `readSession`, `parseSessionId` z `~/lib/auth`; `app/lib/db/client` `db`; `schema.users`/`schema.regions`; `app/lib/auth/invite.ts` `hashToken` + tabela `invites`.)

- [ ] **Step 1 — przeczytaj** `app/lib/auth/session.ts`, `app/lib/auth/cookie.ts`, `app/lib/auth/invite.ts`, `app/lib/db/schema.ts` (users.regionId/trainerId, regions.locale, invites.trainerId/tokenHash), by poznać dokładne sygnatury.

- [ ] **Step 2 — utwórz `app/i18n.server.ts`** (klasyczny `RemixI18Next` z `findLocale`):
```ts
import { createCookie } from "react-router";
import { RemixI18Next } from "remix-i18next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { parseSessionId } from "~/lib/auth";
import { hashToken } from "~/lib/auth";
import { FALLBACK_LANG, NAMESPACES, SUPPORTED_LANGS } from "~/i18n/config";
import { resources } from "~/i18n/resources";
import { pickLang } from "~/i18n/pick-lang";

export const localeCookie = createCookie("lng", {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
});

/** Region locale (BCP-47) zalogowanego usera: trener→własny, podopieczny→region trenera. */
async function regionLocaleForRequest(request: Request): Promise<string | null> {
  const sid = parseSessionId(request.headers.get("cookie"));
  if (!sid) return null;
  const rows = await db
    .select({ regionId: schema.users.regionId, role: schema.users.role, trainerId: schema.users.trainerId })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  // Podopieczny dziedziczy region trenera; trener ma własny; brand_admin → null.
  const regionId = u.role === "trainee" && u.trainerId
    ? (await db.select({ regionId: schema.users.regionId }).from(schema.users).where(eq(schema.users.id, u.trainerId)).limit(1))[0]?.regionId ?? null
    : u.regionId;
  if (!regionId) return null;
  const r = await db.select({ locale: schema.regions.locale }).from(schema.regions).where(eq(schema.regions.id, regionId)).limit(1);
  return r[0]?.locale ?? null;
}

/** Region locale zapraszającego trenera dla trasy /zaproszenie/:token. */
async function inviteTrainerRegionLocale(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/zaproszenie\/([^/]+)$/);
  if (!m) return null;
  const token = decodeURIComponent(m[1]);
  const inv = await db
    .select({ trainerId: schema.invites.trainerId })
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  const trainerId = inv[0]?.trainerId;
  if (!trainerId) return null;
  const t = await db.select({ regionId: schema.users.regionId }).from(schema.users).where(eq(schema.users.id, trainerId)).limit(1);
  const regionId = t[0]?.regionId;
  if (!regionId) return null;
  const r = await db.select({ locale: schema.regions.locale }).from(schema.regions).where(eq(schema.regions.id, regionId)).limit(1);
  return r[0]?.locale ?? null;
}

export const i18nServer = new RemixI18Next({
  detection: {
    supportedLanguages: [...SUPPORTED_LANGS],
    fallbackLanguage: FALLBACK_LANG,
    cookie: localeCookie,
    // WAŻNE: findLocale uruchamia się TYLKO gdy "custom" jest w order (domyślnie go nie ma).
    // "custom" pierwszy → nasza logika region-based jest nadrzędna; pickLang i tak zwraca
    // zawsze wspierany język (region/invite/Accept-Language/fallback), więc to wystarcza.
    order: ["custom", "cookie", "header"],
    async findLocale(request) {
      const [regionLocale, inviteTrainerRegionLoc] = await Promise.all([
        regionLocaleForRequest(request),
        inviteTrainerRegionLocale(request),
      ]);
      return pickLang({
        regionLocale,
        inviteTrainerRegionLocale: inviteTrainerRegionLoc,
        acceptLanguage: request.headers.get("accept-language"),
      });
    },
  },
  i18next: { resources, defaultNS: "common", ns: [...NAMESPACES] },
});
```
> **Weryfikacja API:** potwierdź w context7 (`/sergiodxa/remix-i18next`) sygnaturę `RemixI18Next`, `findLocale`, `getLocale`, `getRouteNamespaces` dla wersji z `package.json`. Jeśli `findLocale` musi zwracać kod z `supportedLanguages` — `pickLang` zwraca `"pl"|"fr"`, co tam jest. Dostosuj, jeśli API się różni.

- [ ] **Step 3 — typecheck + format** (po `npm install`).
- [ ] **Step 4 — review per task** → następnie `/security-review` w bramkach (resolver czyta sesję).

**Krytyczny przepływ:** TAK (czyta sesję, tenant) → integ w Task 12.

---

## Task 5: Wpięcie SSR/klient — `entry.server.tsx`, `entry.client.tsx`, `root.tsx`

**Files:** Modify `app/entry.server.tsx`, `app/root.tsx`; Create `app/entry.client.tsx`.

- [ ] **Step 1 — `entry.server.tsx`:** przed `renderToPipeableStream` utwórz per-request instancję i owiń `ServerRouter`:
```ts
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { i18nServer } from "~/i18n.server";
import { resources } from "~/i18n/resources";
import { DEFAULT_NS, NAMESPACES } from "~/i18n/config";
```
W `handleRequest` (przed renderem):
```ts
  const lng = await i18nServer.getLocale(request);
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    lng,
    resources,
    fallbackLng: "pl",
    defaultNS: DEFAULT_NS,
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
  });
```
i render:
```tsx
    <I18nextProvider i18n={instance}>
      <ServerRouter context={routerContext} url={request.url} />
    </I18nextProvider>
```
> Uwaga: `handleRequest` jest synchroniczne i zwraca Promise — `await i18nServer.getLocale` wymaga, by funkcja była `async` lub by locale rozwiązać przed `new Promise(...)`. Najprościej: zrób `handleRequest` `async` i `await` locale + init NA POCZĄTKU, potem istniejący `return new Promise(...)`.

- [ ] **Step 2 — utwórz `app/entry.client.tsx`:**
```tsx
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { resources } from "~/i18n/resources";
import { DEFAULT_NS, NAMESPACES } from "~/i18n/config";

async function main() {
  const lng = document.documentElement.lang || "pl";
  await i18next.use(initReactI18next).init({
    lng,
    resources,
    fallbackLng: "pl",
    defaultNS: DEFAULT_NS,
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
  });
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <I18nextProvider i18n={i18next}>
          <HydratedRouter />
        </I18nextProvider>
      </StrictMode>,
    );
  });
}
main();
```
> Sprawdź, czy w RR7 trzeba „odsłonić" entry.client (`npx react-router reveal`); tu po prostu tworzymy plik — RR7 użyje go zamiast domyślnego.

- [ ] **Step 3 — `root.tsx`:** root `loader` zwraca locale + ustawia cookie; `Layout` ustawia `<html lang>` z i18n:
```ts
import { useTranslation } from "react-i18next";
import { i18nServer, localeCookie } from "~/i18n.server";
```
loader (zachowaj istniejący prune):
```ts
export async function loader({ request }: { request: Request }) {
  maybePruneExpiredSessions(db);
  const lng = await i18nServer.getLocale(request);
  return data({ lng }, { headers: { "Set-Cookie": await localeCookie.serialize(lng) } });
}
```
(import `data` z `react-router`.) W `Layout` zamień `<html lang="pl">` na:
```tsx
  const { i18n } = useTranslation();
  // ...
  <html lang={i18n.language}>
```

- [ ] **Step 4 — build + typecheck:** `npm run typecheck`; `npm run build` (po `npm install`). Build wykryje błędy SSR/entry.
- [ ] **Step 5 — review per task.**

**Krytyczny przepływ:** SSR/hydratacja — weryfikacja: build + ręczny smoke (handoff).

---

## Task 6: `money.ts` + `format.ts` na Intl (TDD)

**Files:** Modify `app/lib/money.ts`, `app/lib/format.ts`; Tests `app/lib/money.test.ts` (istnieje — rozszerz), `app/lib/format.test.ts`.

- [ ] **Step 1 — przeczytaj** obecne `app/lib/money.ts`, `app/lib/money.test.ts`, `app/lib/format.ts` (dokładne sygnatury, callery `fmtMoney`/`parsePlnToGrosze`/`fmtDate` przez Grep).

- [ ] **Step 2 — failujące testy** (dopisz do `app/lib/money.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { fmtMoney, parseMoneyToMinor } from "./money";

describe("fmtMoney (Intl, multi-currency)", () => {
  it("PLN/pl-PL", () => {
    expect(fmtMoney(12345, "pl-PL", "pln")).toMatch(/123,45/);
  });
  it("EUR/fr-FR", () => {
    const s = fmtMoney(12345, "fr-FR", "eur");
    expect(s).toMatch(/123,45/);
    expect(s).toMatch(/€/);
  });
});
describe("parseMoneyToMinor", () => {
  it("przecinek i kropka", () => {
    expect(parseMoneyToMinor("123,45")).toBe(12345);
    expect(parseMoneyToMinor("123.45")).toBe(12345);
  });
  it("śmieci → null", () => {
    expect(parseMoneyToMinor("abc")).toBeNull();
  });
});
```

- [ ] **Step 3 — uruchom, FAIL:** `npx vitest run app/lib/money.test.ts`

- [ ] **Step 4 — refaktor `money.ts`:** `fmtMoney(minorUnits, locale, currency)` →
```ts
export function fmtMoney(minorUnits: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minorUnits / 100);
}
```
Dodaj `parseMoneyToMinor` (przenieś logikę z `parsePlnToGrosze`, zachowaj zachowanie). **Zostaw `parsePlnToGrosze` jako cienki alias** wołający `parseMoneyToMinor` (żeby nie zepsuć callerów w jednym tasku) ALBO zaktualizuj wszystkich callerów — sprawdź Grep i wybierz mniej-ryzykowne; udokumentuj w raporcie. `MonthlyAmountSchema` bez zmian.

- [ ] **Step 5 — `format.ts`:** `fmtDate(value, locale = "pl-PL")` przez `Intl.DateTimeFormat(locale, …)`; zachowaj domyślny `pl-PL` dla istniejących callerów (przejściowo). Dodaj test do `app/lib/format.test.ts` dla fr-FR.

- [ ] **Step 6 — uruchom, PASS** + typecheck + format.
- [ ] **Step 7 — review per task.**

> **Stripe nietknięty:** nie zmieniaj `app/lib/stripe/*` ani kolumn DB. `fmtMoney` dostanie `currency` od callera (subskrypcja/region) w taskach UI.

**Krytyczny przepływ:** nie (czysta logika).

---

## Task 7: Etykiety serwerowe → klucze (TDD)

**Files:** Modify `app/lib/stripe/status.ts` (+`status.test.ts`), `app/lib/consultation-status.ts` (+test), `app/lib/list-params.ts`, `app/lib/wrapped.ts`. Dodaj klucze do `app/locales/{pl,fr}/*.json`.

- [ ] **Step 1 — przeczytaj** te pliki + ich testy + callerów (Grep), by nie zgubić `tone` i kształtu zwracanego obiektu.

- [ ] **Step 2 — zmień sygnatury na klucze.** Przykład `consultation-status.ts`:
  - z `consultationPresentation(...) → { label: "do potwierdzenia", tone }`
  - na `consultationPresentation(...) → { labelKey: "konsultacje.status.pending", tone }`
  Zaktualizuj testy (`status.test.ts`, `consultation-status.test.ts`) by asercje sprawdzały `labelKey` zamiast polskiego `label`. Analogicznie `subscriptionPresentation`/`invoiceStatusLabel` (`platnosci.status.*`), opcje sortowania w `list-params` (`common.sort.*`), miesiące w `wrapped` (użyj `Intl.DateTimeFormat(locale,{month:"long"})` w komponencie zamiast klucza). Dodaj odpowiednie klucze do słowników + namespace do `NAMESPACES`/`resources` (`konsultacje`, `platnosci`).

- [ ] **Step 3 — uruchom testy jednostkowe** (FAIL→PASS), parzystość, typecheck, format.
- [ ] **Step 4 — review per task.**

> Callerzy (komponenty) tych funkcji zaczną wołać `t(labelKey)` — to robimy w taskach ekstrakcji obszaru (Część B), ale **w tym tasku** zaktualizuj bezpośrednich callerów tak, by build przeszedł (np. tymczasowo `t(labelKey)` jeśli komponent ma `useTranslation`, albo przekaż `labelKey` i przetłumacz w miejscu). Zadbaj, by `npm run build` był zielony na końcu.

**Krytyczny przepływ:** nie.

---

## Task 8: Seed regionu FR

**Files:** Modify `scripts/seed.ts`, `.env.example`, `scripts/README.md`.

- [ ] **Step 1 — w bloku bootstrapu marki** (po `ensureRegion` PL) dodaj:
```ts
    await ensureRegion(db, {
      organizationId: orgId,
      name: "France",
      country: "FR",
      currency: "eur",
      locale: "fr-FR",
    });
```
- [ ] **Step 2 — `.env.example`/`scripts/README.md`:** odnotuj, że seed tworzy też region FR (idempotentnie). (Demo-konto FR — opcjonalne, pomiń w tym tasku; YAGNI dopóki nie potrzebne.)
- [ ] **Step 3 — typecheck + format + review.**

> **HANDOFF:** `npm run db:seed` uruchamia właściciel.

**Krytyczny przepływ:** nie (idempotentny seed; pokryty wzorcem z #1).

---

## Task 9: Plasterek dowodowy — przetłumacz `auth` (login + zaproszenie) end-to-end

**Files:** Modify `app/routes/login.tsx`, `app/routes/zaproszenie.$token.tsx`.

- [ ] **Step 1 — `login.tsx`:** w komponencie `const { t } = useTranslation("auth")`; podmień twarde stringi na `t("login.eyebrow")`, `t("login.title")`, `t("login.email")`, `t("login.password")`, `t("login.submit")`. Komunikat błędu (`GENERIC_ERROR`) wraca z `action` jako **klucz** `"login.error"`, a komponent renderuje `t(actionData.error)` (albo trzyma klucz). Zaktualizuj, by nie wstawiać polskiego tekstu w JSX.
- [ ] **Step 2 — `zaproszenie.$token.tsx`:** analogicznie dla widocznych stringów (dodaj klucze do `auth.json` pl+fr; rozszerz parity test obejmie je automatycznie).
- [ ] **Step 3 — build + typecheck + parity + format.**
- [ ] **Step 4 — review per task.**

> To jest **dowód end-to-end**: po `npm install` + `db:seed` (region FR) właściciel zweryfikuje, że trener FR widzi francuski login/zaproszenie, PL — polski.

**Krytyczny przepływ:** nie (UI), ale waliduje cały fundament.

---

# CZĘŚĆ B — EKSTRAKCJA PER OBSZAR (wzorzec powtarzalny)

**Wzorzec dla każdego taska obszaru (stosuj identycznie):**
1. Dodaj namespace obszaru do `NAMESPACES` (config.ts) i do `resources.ts` (+ puste pliki `pl/<ns>.json`, `fr/<ns>.json`).
2. W każdym pliku trasy/komponentu obszaru: `const { t } = useTranslation("<ns>")`.
3. Każdy **widoczny dla użytkownika** polski string → `t("<klucz>")`; klucz opisowy (np. `historia.empty`, `loguj.saveSet`). Nazwy ćwiczeń (Pull-up…) zostają.
4. Daty/liczby/waluta przez `Intl`/`fmtMoney(…, locale, currency)`/`fmtDate(…, locale)` — `locale` z `useTranslation().i18n` (`langToIntlLocale[i18n.language]`) lub z loadera.
5. Etykiety z funkcji serwerowych: `t(labelKey)`.
6. Dodaj komplet kluczy do `pl/<ns>.json` ORAZ `fr/<ns>.json` (tłumaczenie FR).
7. **Bramka tasku:** `npm run test:unit` (parity przechodzi), `typecheck`, `lint`, `build`; oraz **grep braku polskich stringów** w plikach obszaru:
   `Grep` wzorzec `[A-Za-zżźćńółęąśŻŹĆĄŚĘŁÓŃ]` w literałach JSX/`>...<` — przejrzyj wynik, potwierdź brak widocznych polskich tekstów (poza nazwami ćwiczeń).
8. Frontend-design: tylko jeśli zmieniasz układ; samo podmienianie stringów nie wymaga.
9. Review per task.

> **Przykład konkretny (wzorcowy fragment)** — `historia._index.tsx`:
> `<h1>Historia</h1>` → `<h1>{t("historia.title")}</h1>`; klucz w `pl/podopieczny.json`: `"historia": { "title": "Historia" }`, w `fr`: `"historia": { "title": "Historique" }`.

## Task 10: Ekstrakcja obszaru `common` + nawigacja + layouty
**Files:** `app/components/*` (user-menu, list-controls, pagination, nawigacja w `*/_layout.tsx`), wspólne przyciski. Namespace `common`. Wg wzorca B.

## Task 11: Ekstrakcja obszaru `podopieczny`
**Files:** `app/routes/podopieczny/**` (pulpit, sesje, loguj, historia, rozwoj.*, sylwetka, konsultacje*, platnosci, wrapped, aktywuj) + komponenty używane tylko tam. Namespace `podopieczny` (+ współdzielone `konsultacje`/`platnosci`/`rozwoj` jeśli wspólne z trenerem). Wg wzorca B. **Uwaga:** to duży obszar — w razie potrzeby implementer może zaraportować DONE_WITH_CONCERNS i zaproponować rozbicie na pod-trasy; kontroler wtedy dzieli na mniejsze taski (sesje/loguj, historia/rozwoj, konsultacje/platnosci, wrapped/aktywuj).

## Task 12: Ekstrakcja obszaru `trener` + `marka` + test integracyjny locale
**Files:** `app/routes/trener/**`, `app/routes/marka/**`. Namespace `trener`, `marka`. Wg wzorca B. **Uwaga:** duży — analogiczna możliwość rozbicia (biblioteka/plany, umiejetnosci, podopieczni+poddrzewa, konsultacje/integracje/platnosci).

- [ ] **Dodatkowo w tym tasku — test integracyjny** `tests/i18n-locale.itest.ts` (PISANY, NIE uruchamiany; wzorzec z `tests/*.itest.ts` — testcontainers + migrate):
  Scenariusze `resolveLang`/`i18nServer.getLocale(request)` z realną bazą: trener PL→`pl`, trener FR→`fr`, podopieczny dziedziczy region trenera, brand_admin (Accept-Language `fr` → `fr`; brak → `pl`), zaproszenie tokenem trenera FR→`fr`, anonim Accept-Language. Buduj `Request` z cookie sesji utworzonej przez `createSession`.
  Dopisz wiersz do `tests/README.md`.

---

## Bramki końcowe (po wszystkich taskach — z dowodem)
1. `npm run test:unit` (NIE `npm test`) → zielone
2. `npm run typecheck` → zielone
3. `npm run lint` → zielone
4. `npm run build` → zielone
5. dokumentacja: `CLAUDE.md` (nowy `app/i18n/`, `app/locales/`, `app/i18n.server.ts`, `entry.client.tsx`), `app/lib/README.md`, `app/README.md`, root `README.md` (zależności i18n), `scripts/README.md`
6. `/code-review` na całości
7. `/security-review` — **wymagane** (resolver czyta sesję)
8. testy integ: zaraportuj, właściciel uruchamia `npm run test:itest`

## Handoff (granica gita)
- Lista plików + proponowany commit.
- **`npm install`** (nowe zależności i18next/react-i18next/remix-i18next) — właściciel.
- **`npm run db:seed`** (region FR; z env BRAND_*) — właściciel.
- **`npm run test:itest`** (w tym `tests/i18n-locale.itest.ts`) — właściciel.
- Ręczna weryfikacja: przełącz region trenera PL↔FR (lub zaloguj konto z regionu FR) → UI i waluta zmieniają język/format; login/zaproszenie respektują reguły.

---

## Self-review (pokrycie specu)
- §2 Architektura → Task 1 (config) + Task 4 (server) + Task 5 (entry/root) ✔
- §3 Pliki/format/typowanie/parzystość → Task 1, 3 ✔
- §4 Resolucja locale (pickLang + resolveLang + cookie) → Task 2, 4 ✔; integ → Task 12 ✔
- §5 money/format/Intl + etykiety→klucze → Task 6, 7 ✔
- §6 Konwencja + zakres ekstrakcji → Część B (Task 10–12, wzorzec) ✔; auth dowód → Task 9 ✔
- §7 Seed FR + testy → Task 8 + testy w Task 2/3/6/7/12 ✔
- Placeholdery: foundation ma realny kod; taski ekstrakcji to świadomie wzorzec+przykład+bramka (literalne setki stringów niewykonalne i bezużyteczne w planie) — granularność zaznaczona, z opcją rozbicia.
- Spójność nazw: `pickLang`, `localeToLang`, `langToIntlLocale`, `i18nServer`, `localeCookie`, `fmtMoney(minor,locale,currency)`, `parseMoneyToMinor`, `labelKey` — użyte spójnie.
- **Zależność od `npm install`:** taski 2–9 z typecheck/build mogą wymagać zainstalowanych paczek; implementerzy oznaczają, gdy blokuje brak modułów (oczekiwane do handoffu/instalacji).
