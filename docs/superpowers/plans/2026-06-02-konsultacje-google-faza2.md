# Konsultacje: integracja Google Calendar / Meet — Faza 2 — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać opcjonalny, wychodzący sync terminów konsultacji do Google Calendar (z linkiem Google Meet i zaproszeniem mailowym podopiecznego) — per trener, OAuth, tokeny szyfrowane at-rest — bez naruszania działania rdzenia bez Google.

**Architecture:** Źródłem prawdy zostaje nasza baza (Faza 1). Każdy trener może podpiąć **jedno** konto Google (OAuth2, `access_type=offline`). Pojedynczy termin ↔ jedno zdarzenie Google (`google_event_id`), **bez RRULE** — cykliczność liczymy natywnie. Sync jest **wyłącznie wychodzący**, **best-effort** i **post-commit** (żadnych wywołań sieciowych wewnątrz transakcji DB): repo mutuje stan natywny w transakcji, a po jej zatwierdzeniu warstwa `app/lib/google/sync.ts` próbuje wypchnąć zmianę do Google i zapisuje/aktualizuje `google_event_id`. Błąd Google nie przerywa zapisu natywnego. Czytanie (loadery) **nigdy** nie dzwoni do Google — backfill nieзsynchronizowanych terminów odbywa się przy mutacjach trenera oraz przez jawny przycisk „Synchronizuj".

**Tech Stack:** React Router v7 (SSR, loadery/akcje), Drizzle ORM + PostgreSQL 16, `google-auth-library` (OAuth2Client), `@googleapis/calendar` (klient Calendar v3), Node `crypto` (AES-256-GCM), Zod, Vitest (unit + testcontainers itest), Biome.

Pełny spec: [`docs/superpowers/specs/2026-06-01-konsultacje-harmonogram-google-design.md`](../specs/2026-06-01-konsultacje-harmonogram-google-design.md) (sekcja „Integracja Google Calendar / Meet (Faza 2)").

---

## Zasady procesu (kalisthenos-dev-flow) — obowiązują w każdym tasku

- **Nigdy git, nigdy docker.** Zamiast „Commit" każdy task kończy się **review** (`/code-review`); commit/branch/push robi właściciel na końcu (handoff).
- **TDD** dla logiki bez DB (`npm run test:unit`). Testy integracyjne `*.itest.ts` w `tests/` — **piszemy, NIE uruchamiamy** (`npm run test:itest` odpala właściciel pod Dockerem).
- **`npm run db:generate`** po zmianie schematu (generuje SQL z `schema.ts`; **nie** edytujemy `migrations/` ręcznie). `db:migrate` odpala właściciel. Task 3 dodaje **tylko nową tabelę** (bez rename/drop) — `db:generate` jest nieinteraktywny.
- **`npm install`** (dla `@googleapis/calendar`, `google-auth-library`) odpala **właściciel** — w planie tylko edytujemy `package.json` i sygnalizujemy to w handoffie. Kod importujący te paczki nie skompiluje się typecheckiem, dopóki właściciel nie zainstaluje — to oczekiwane i odnotowane przy odpowiednich taskach.
- **Frontend/UI** prowadzi skill `frontend-design:frontend-design` (Task 9): kod tras to funkcjonalny szkielet (loadery/akcje wiążące — logika i autoryzacja), polish wizualny i zgodność z `design-system/README.md` + `app/styles/tokens.css` przez ten skill. UI po polsku.
- **Bezpieczeństwo:** feature dotyka `trainer_id` **oraz** tokenów OAuth → **`/security-review`** jest wymagany (Taski 2, 3, 5, 9). Tokeny **nigdy** w logach ani w danych loadera do klienta.
- **Context7 (MCP)** po aktualne API (`google-auth-library`, `@googleapis/calendar`, RR7), gdy coś niepewne.

Komendy testów (z `package.json`):
- Unit: `npm run test:unit` (vitest run, wyklucza `*.itest.ts`). Pliki: `app/**/*.test.ts`. `globals: false` → importuj `{ describe, it, expect } from "vitest"`.
- Integ: `npm run test:itest` (testcontainers). Pliki: `tests/**/*.itest.ts`. **Nie uruchamiamy.**

**Założenie TZ (v1):** instanty `scheduled_at` są w **UTC** (jedna strefa aplikacji). Zdarzenia Google wysyłamy z czasem UTC (pole `dateTime` z offsetem `Z` + `timeZone: "Etc/UTC"`), spójnie z `fmtDateTime`/generatorem z Fazy 1.

> ⚠️ **Errata (2026-07-26):** to założenie było błędne i wywołało buga „18:30 w aplikacji,
> 20:30 w Google". `scheduled_at` nie niesie instantu UTC, tylko **czas ścienny zapisany w
> komponentach UTC** — etykieta `Etc/UTC` kazała Google przesunąć go o offset strefy
> kalendarza. Obecnie wysyłamy `dateTime` bez `Z` + `timeZone: APP_TIME_ZONE`
> (`Europe/Warsaw`). Nie kopiuj wzorca z tego planu — patrz `app/lib/google/calendar.ts`.
>
> Uwaga na przyszłość: `APP_TIME_ZONE` jest jedną stałą globalną, więc dla trenera
> spoza Polski da zły wynik. Naturalny następny krok (poza zakresem fixa) to strefa
> **per trener** — kolumna w `google_calendar_connections` albo odczyt strefy kalendarza
> przez `calendars.get`. Repo już modeluje lokalizację per trener w `stripe_connections`.

**Stan wyjściowy (zweryfikowany w repo 2026-06-02):**
- Kolumna `consultations.google_event_id` (`text NULL`) **już istnieje** (dodana przyszłościowo w Fazie 1) — Task 3 jej nie dotyka.
- Tabela `google_calendar_connections` — **nie istnieje** (tworzy Task 3).
- `@googleapis/calendar` / `google-auth-library` — **brak** w `package.json` (Task 1).
- `app/lib/google/` — **nie istnieje** (Taski 2, 4–7).
- Zmienne `GOOGLE_*` — **brak** w `app/lib/env.ts` i `.env.example` (Task 1).

---

## Decyzje architektoniczne domknięte w tym planie (poza spec)

1. **Post-commit, nie w transakcji.** Wywołania Google są I/O sieciowym — nigdy wewnątrz `db.transaction`. Repo (Faza 1) mutuje natywnie i wraca; route po sukcesie woła `sync.*` best-effort.
2. **Loadery bez Google.** `ensureOccurrences` na ścieżce czytania **nie** dzwoni do Google. Świeżo zmaterializowane terminy dostają `google_event_id` przy najbliższej mutacji trenera lub przez intent `sync-google` (przycisk „Synchronizuj"). **Świadome odejście od spec (Faza 2, decyzja 4 „pchamy przy materializacji"):** robienie I/O sieciowego w loaderze (zwł. na ścieżce podopiecznego) byłoby wolne i kruche; sync przenosimy na mutacje trenera + jawny backfill. Skutek: termin zmaterializowany leniwie wejściem podopiecznego trafia do Google dopiero po akcji trenera/„Synchronizuj".
3. **`GOOGLE_*` opcjonalne w env.** Aplikacja działa bez nich (`googleConfigured()` zwraca false → UI pokazuje „integracja niedostępna", brak prób syncu).
4. **CSRF OAuth przez `state` z nonce związanym z cookie + TTL.** „Połącz" generuje losowy `nonce`, zapisuje go w cookie `goauth_nonce` (HttpOnly, SameSite=Lax, krótki Max-Age) i koduje w `state = base64url({nonce,exp}).hmac` (HMAC-SHA256 na `SESSION_SECRET`). Callback weryfikuje podpis + TTL **oraz** `state.nonce === cookie.nonce` (atakujący nie ustawi cudzego cookie → blokada login-CSRF/przejęcia konta). Połączenie zapisujemy zawsze dla zalogowanego trenera. (Sam deterministyczny `HMAC(trainerId)` byłby powtarzalny — odrzucone.)
5. **Token enc-key z `process.env` bezpośrednio** w `crypto.ts` (nie przez `getEnv()`), żeby test jednostkowy round-tripu nie wymagał pełnego env (DATABASE_URL itd.). `env.ts` deklaruje `GOOGLE_TOKEN_ENC_KEY` jako opcjonalny — dla `.env.example` i walidacji formatu w runtime.
6. **Mapper `consultationToEvent` jest czysty** (cel TDD) i oddzielony od wywołań sieciowych (`insertEvent`/`patchEvent`/`deleteEvent`).
7. **Test integracyjny mockuje moduł SDK** (`vi.mock("@googleapis/calendar")`), nie wstrzykiwany interfejs — `sync.ts` woła `insertEvent`/`patchEvent`/`deleteEvent` wprost, a izolacja od sieci następuje na granicy modułu.

---

## Struktura plików

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `package.json` | dodanie `@googleapis/calendar`, `google-auth-library` | Modify |
| `app/lib/env.ts` | opcjonalne `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI/TOKEN_ENC_KEY` + `googleConfigured()` | Modify |
| `.env.example` | przykładowe zmienne Google | Modify |
| `app/lib/google/crypto.ts` | AES-256-GCM encrypt/decrypt tokenów | Create |
| `app/lib/google/crypto.test.ts` | round-trip szyfrowania (TDD) | Create |
| `app/lib/google/oauth.ts` | OAuth2Client: URL zgody, wymiana kodu, podpis `state` | Create |
| `app/lib/google/oauth.test.ts` | podpis/weryfikacja `state` (TDD, bez sieci) | Create |
| `app/lib/google/calendar.ts` | `consultationToEvent` (czysty) + `insertEvent/patchEvent/deleteEvent` + typ `CalendarSyncer` | Create |
| `app/lib/google/calendar.test.ts` | `consultationToEvent` mapuje pola (TDD) | Create |
| `app/lib/google/connections.ts` | repo `google_calendar_connections` (tenant-scope trainerId, szyfrowanie, authed client) | Create |
| `app/lib/google/sync.ts` | orkiestracja best-effort: create/reschedule/cancel/backfill | Create |
| `app/lib/google/README.md` | dokumentacja katalogu (nowy) | Create |
| `app/lib/db/schema.ts` | tabela `google_calendar_connections` + typy | Modify |
| `app/lib/db/migrations/XXXX_*.sql` | migracja (generowana) | Create (`db:generate`) |
| `app/lib/consultations.ts` | `setGoogleEventId`, `listUnsyncedForSync`, `getSyncRow` | Modify |
| `tests/google-sync.itest.ts` | sync przez mock: argumenty + best-effort | Create (PISZEMY/nie uruchamiamy) |
| `app/routes/trener/integracje.google.tsx` | status + Połącz/Rozłącz | Create |
| `app/routes/trener/integracje.google.callback.tsx` | wymiana `code` → tokeny | Create |
| `app/routes.ts` | wpisy 2 nowych tras | Modify |
| `app/routes/trener/_layout.tsx` | link „Integracje" w nawigacji | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx` | wpięcie sync: save-schedule, intent `sync-google`, chip stanu | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx` | sync po utworzeniu `planned` | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` | sync po reschedule/cancel | Modify |
| `app/routes/podopieczny/konsultacje._index.tsx` + `konsultacje.$konsultacjaId.tsx` | sync (delete) po odrzuceniu przez podopiecznego | Modify |
| `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `CLAUDE.md`, `README.md` (root) | dokumentacja | Modify |
| `app/components/icons.tsx` | ikona `Google`/`Link` (jeśli brak) | Modify (opcjonalnie) |

---

## Task 1: Zależności + zmienne środowiskowe

**Files:**
- Modify: `package.json`
- Modify: `app/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Dodaj zależności do `package.json`**

W sekcji `"dependencies"` (zachowaj porządek alfabetyczny sąsiadów) dodaj:

```json
    "@googleapis/calendar": "^9.7.0",
    "google-auth-library": "^9.14.0",
```

> Wersje przykładowe (aktualne na 2026-06); właściciel zweryfikuje przy `npm install`. `@googleapis/calendar` to scoped pakiet tylko dla Calendar v3 (lekki, typowany), `google-auth-library` daje `OAuth2Client`.

- [ ] **Step 2: Rozszerz `EnvSchema` o opcjonalne zmienne Google**

W `app/lib/env.ts` w `EnvSchema` dodaj (po `NODE_ENV`):

```ts
  // Integracja Google (opcjonalna — aplikacja działa bez niej).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  // base64 32 bajtów (klucz AES-256-GCM do szyfrowania tokenów at-rest).
  GOOGLE_TOKEN_ENC_KEY: z.string().optional(),
```

Na końcu pliku (po `export const env = ...`) dodaj helper:

```ts
/** True, gdy wszystkie sekrety integracji Google są ustawione (OAuth + klucz szyfrujący). */
export function googleConfigured(): boolean {
  const e = getEnv();
  return Boolean(
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI && e.GOOGLE_TOKEN_ENC_KEY,
  );
}
```

- [ ] **Step 3: Dopisz przykładowe zmienne do `.env.example`**

Na końcu `.env.example` dodaj blok:

```
# --- Integracja Google Calendar / Meet (OPCJONALNA) ---
# Pozostaw puste, aby wyłączyć integrację (aplikacja działa bez Google).
# Utwórz projekt w Google Cloud Console → OAuth consent screen (External) +
# OAuth client (Web application). Scope: https://www.googleapis.com/auth/calendar.events
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/trener/integracje/google/callback
# Klucz AES-256-GCM, base64 z 32 losowych bajtów:  openssl rand -base64 32
GOOGLE_TOKEN_ENC_KEY=
```

- [ ] **Step 4: Typecheck (env)**

Run: `npm run typecheck`
Expected: PASS dla `env.ts` (importy `@googleapis/*` jeszcze nigdzie nie używane). Jeśli `tsc` zgłosi brak modułów Google — to dotyczy plików z Tasków 4–7, jeszcze nieistniejących; tu nie powinno wystąpić.

- [ ] **Step 5: Lint** — `npm run lint`. Expected: PASS.

- [ ] **Step 6: Review** — `/code-review` + `/security-review` (nowe sekrety, klucz szyfrujący, opcjonalność). Po akceptacji → kolejny task.

---

## Task 2: Szyfrowanie tokenów `app/lib/google/crypto.ts` — TDD

**Files:**
- Create: `app/lib/google/crypto.ts`
- Test: `app/lib/google/crypto.test.ts`

- [ ] **Step 1: Napisz failujący test**

Create `app/lib/google/crypto.test.ts`:

```ts
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Klucz testowy MUSI być ustawiony zanim crypto.ts go odczyta (lazy w key()).
beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
});

import { decryptToken, encryptToken } from "~/lib/google/crypto";

describe("token crypto (AES-256-GCM)", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const secret = "1//0gFsecret-refresh-token-value";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("dwa szyfrogramy tej samej wartości różnią się (losowy IV)", () => {
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same");
    expect(decryptToken(b)).toBe("same");
  });

  it("manipulacja szyfrogramem rzuca (tag GCM)", () => {
    const blob = encryptToken("tamper-me");
    const [iv, tag, data] = blob.split(".");
    const broken = `${iv}.${tag}.${Buffer.from("zzzz").toString("base64")}`;
    expect(() => decryptToken(broken)).toThrow();
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module "~/lib/google/crypto"`.

- [ ] **Step 3: Zaimplementuj**

Create `app/lib/google/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

/**
 * Klucz AES-256 z `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bajty).
 * Czytany z `process.env` bezpośrednio (nie przez getEnv), by testy round-tripu
 * nie wymagały pełnego env. Rzuca, gdy klucz nieobecny lub złej długości.
 */
function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_ENC_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY must decode to exactly 32 bytes (base64)");
  }
  return k;
}

/** Szyfruje sekret do formatu "ivB64.tagB64.cipherB64". */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Odszyfrowuje format "ivB64.tagB64.cipherB64". Rzuca przy naruszeniu integralności. */
export function decryptToken(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed token blob");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (3 testy crypto zielone).

- [ ] **Step 5: Lint + typecheck** — `npm run lint`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Review** — `/code-review` + `/security-review` (AES-GCM, IV losowy, tag weryfikowany, klucz z env). Po akceptacji → kolejny task.

---

## Task 3: Schemat — tabela `google_calendar_connections` + migracja

**Files:**
- Modify: `app/lib/db/schema.ts`
- Create (generowana): migracja w `app/lib/db/migrations/`

- [ ] **Step 1: Dodaj tabelę po `consultationActionItems`**

W `app/lib/db/schema.ts`, w sekcji `// ---------------- Consultations ----------------`, **po** definicji `consultationActionItems` dodaj:

```ts
export const googleCalendarConnections = pgTable("google_calendar_connections", {
  trainerId: uuid("trainer_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull(),
  // access_token i refresh_token szyfrowane at-rest (AES-256-GCM, patrz lib/google/crypto.ts).
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  scope: text("scope").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

> `trainerId` jest PK (jeden trener = jedno połączenie). Nazwy kolumn `*_token_enc` celowo podkreślają, że trzymamy szyfrogram, nie surowy token.

- [ ] **Step 2: Dodaj typy**

W sekcji `// ---------------- Types ----------------`, przy typach konsultacji, dodaj:

```ts
export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type NewGoogleCalendarConnection = typeof googleCalendarConnections.$inferInsert;
```

- [ ] **Step 3: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: nowy plik `app/lib/db/migrations/XXXX_*.sql` z `CREATE TABLE "google_calendar_connections" (...)` i kluczem obcym do `users` (`ON DELETE CASCADE`). Snapshot w `migrations/meta/` zaktualizowany. To **tylko dodanie tabeli** — Drizzle Kit nie zada pytań o rename/drop (nieinteraktywne). **Nie edytuj SQL ręcznie.**

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS dla `schema.ts`. (Pliki `app/lib/google/connections.ts` itd. powstaną w kolejnych taskach.)

- [ ] **Step 5: Review** — `/code-review` + `/security-review` (nowa tabela tokenów, tenant-scope `trainer_id`, cascade). Po akceptacji → kolejny task.

---

## Task 4: OAuth `app/lib/google/oauth.ts` — TDD (podpis `state`)

**Files:**
- Create: `app/lib/google/oauth.ts`
- Test: `app/lib/google/oauth.test.ts`

- [ ] **Step 1: Napisz failujący test (czysta logika `state`, bez sieci/SDK)**

Create `app/lib/google/oauth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signState, verifyState } from "~/lib/google/oauth";

const SECRET = "test-session-secret-at-least-32-bytes-long!!";

describe("OAuth state (CSRF: nonce + TTL)", () => {
  it("verify(sign) zwraca nonce dla ważnego state", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    expect(verifyState(s, SECRET, 0)?.nonce).toBe("nonce-abc");
  });

  it("wygasły state → null", () => {
    const s = signState("nonce-abc", 1000, SECRET);
    expect(verifyState(s, SECRET, 2000)).toBeNull();
  });

  it("zła sygnatura → null", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    const tampered = `${s.split(".")[0]}.deadbeef`;
    expect(verifyState(tampered, SECRET, 0)).toBeNull();
  });

  it("inny sekret → null", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    expect(verifyState(s, "different-secret-different-secret-xx", 0)).toBeNull();
  });

  it("malformed → null", () => {
    expect(verifyState("garbage", SECRET, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — brak eksportów `signState`/`verifyState`.

- [ ] **Step 3: Zaimplementuj**

Create `app/lib/google/oauth.ts`:

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getEnv } from "~/lib/env";

/** Scope: tworzenie/edycja zdarzeń (Meet) + odczyt e-maila konta (etykieta w UI). */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, "openid", "email"];

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export interface OAuthState {
  nonce: string;
  exp: number; // ms epoch — TTL state (anty-replay)
}

/** Wysokoentropijny nonce wiązany z cookie przeglądarki (anty-CSRF / login-CSRF). */
export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** Podpisuje `state` = base64url({nonce,exp}).hmac. */
export function signState(nonce: string, expMs: number, secret: string): string {
  const payload = b64url(JSON.stringify({ nonce, exp: expMs }));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Weryfikuje podpis HMAC + TTL; zwraca {nonce,exp} albo null.
 * Porównanie `nonce` z cookie (anty-CSRF) robi callback — sam podpis nie wystarcza.
 */
export function verifyState(state: string, secret: string, nowMs: number): OAuthState | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.nonce || typeof parsed.exp !== "number" || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Buduje OAuth2Client z env. Rzuca, gdy integracja nieskonfigurowana. */
export function oauthClient(): OAuth2Client {
  const e = getEnv();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET || !e.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth env not configured");
  }
  return new OAuth2Client(e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET, e.GOOGLE_REDIRECT_URI);
}

/** URL zgody (offline + wymuszony consent → refresh token). */
export function consentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // ms epoch
  scope: string;
  email: string | null; // z id_token — etykieta podpiętego konta
}

/** Dekoduje payload id_token (JWT z zaufanej odpowiedzi getToken; bez weryfikacji podpisu). */
function decodeIdTokenEmail(idToken: string | null | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Wymienia `code` na tokeny. Rzuca, gdy brak refresh_token (re-consent) LUB gdy
 * użytkownik nie nadał scope `calendar.events` (granularna zgoda Google).
 */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error("Google did not return a refresh token (re-consent required)");
  }
  const scope = tokens.scope ?? "";
  if (!scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new Error("Brak zgody na kalendarz (scope calendar.events) — połączenie odrzucone.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scope,
    email: decodeIdTokenEmail(tokens.id_token),
  };
}
```

> Uwaga: importy `OAuth2Client`/`getEnv` są używane przez `oauthClient`/`consentUrl`/`exchangeCode`, ale **test** dotyka tylko `signState`/`verifyState`/`newNonce` (czyste, bez SDK). Jeśli `npm install` jeszcze nie wykonano, `npm run test:unit` może zgłosić brak `google-auth-library` przy ładowaniu modułu — patrz Step 4. `state` jest świadomie **bezstanowy po stronie serwera, ale związany z cookie** (`nonce`) — patrz Task 9 (połącz ustawia cookie, callback je porównuje).

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (4 testy `state`).
**Jeśli FAIL z „Cannot find module 'google-auth-library'":** zależność z Tasku 1 nie jest jeszcze zainstalowana. Odnotuj w handoffie „test:unit Tasku 4 zielony po `npm install`"; logika `state` jest czysta i poprawna. (Opcjonalnie właściciel uruchamia `npm install`, wtedy ponów.)

- [ ] **Step 5: Lint + typecheck** — `npm run lint`; `npm run typecheck` (typecheck wymaga zainstalowanego `google-auth-library` — patrz nota wyżej). Expected: PASS po instalacji zależności.

- [ ] **Step 6: Review** — `/code-review` + `/security-review` (HMAC `state`, `timingSafeEqual`, wymóg refresh_token, brak tokenów w logach). Po akceptacji → kolejny task.

---

## Task 5: Repo połączeń `app/lib/google/connections.ts`

**Files:**
- Create: `app/lib/google/connections.ts`

> Brak osobnego unit-testu (warstwa DB + sieć); pokrycie przez itest (Task 8) i ścieżkę ręczną. Czyste fragmenty (crypto, state) testowane osobno.

- [ ] **Step 1: Zaimplementuj repo**

Create `app/lib/google/connections.ts`:

```ts
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { getEnv } from "~/lib/env";
import { decryptToken, encryptToken } from "~/lib/google/crypto";
import { GOOGLE_CALENDAR_SCOPE } from "~/lib/google/oauth";
import type { ExchangedTokens } from "~/lib/google/oauth";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export interface ConnectionStatus {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
}

/** Status połączenia trenera (bez sekretów — bezpieczny do loadera). Tenant-scope: trainerId. */
export async function getConnectionStatus(db: Db, trainerId: string): Promise<ConnectionStatus> {
  const [row] = await db
    .select({
      googleEmail: schema.googleCalendarConnections.googleEmail,
      calendarId: schema.googleCalendarConnections.calendarId,
    })
    .from(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .limit(1);
  return {
    connected: Boolean(row),
    googleEmail: row?.googleEmail ?? null,
    calendarId: row?.calendarId ?? "primary",
  };
}

/** Zapisuje/aktualizuje połączenie (tokeny szyfrowane). Tenant-scope: trainerId. */
export async function upsertConnection(
  db: Db,
  args: { trainerId: string; googleEmail: string; tokens: ExchangedTokens },
): Promise<void> {
  const values = {
    trainerId: args.trainerId,
    googleEmail: args.googleEmail,
    accessTokenEnc: encryptToken(args.tokens.accessToken),
    refreshTokenEnc: encryptToken(args.tokens.refreshToken),
    tokenExpiry: new Date(args.tokens.expiryDate),
    scope: args.tokens.scope,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.googleCalendarConnections)
    .values(values)
    .onConflictDoUpdate({
      target: schema.googleCalendarConnections.trainerId,
      set: {
        googleEmail: values.googleEmail,
        accessTokenEnc: values.accessTokenEnc,
        refreshTokenEnc: values.refreshTokenEnc,
        tokenExpiry: values.tokenExpiry,
        scope: values.scope,
        updatedAt: values.updatedAt,
      },
    });
}

/** Usuwa połączenie (rozłącz). Tenant-scope: trainerId. Zwraca odszyfrowany refresh token do revoke (lub null). */
export async function deleteConnection(db: Db, trainerId: string): Promise<string | null> {
  const [row] = await db
    .delete(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .returning({ refreshTokenEnc: schema.googleCalendarConnections.refreshTokenEnc });
  if (!row) return null;
  try {
    return decryptToken(row.refreshTokenEnc);
  } catch {
    return null;
  }
}

export interface AuthedCalendar {
  client: OAuth2Client;
  calendarId: string;
}

/**
 * Zwraca uwierzytelniony OAuth2Client trenera (lub null gdy brak połączenia).
 * Auto-refresh access tokenu jest obsługiwany przez bibliotekę; nasłuch 'tokens'
 * persystuje odświeżony token (zaszyfrowany). Tenant-scope: trainerId.
 */
export async function getAuthedClient(db: Db, trainerId: string): Promise<AuthedCalendar | null> {
  const [row] = await db
    .select()
    .from(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .limit(1);
  if (!row) return null;

  const e = getEnv();
  const client = new OAuth2Client(e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET, e.GOOGLE_REDIRECT_URI);
  client.setCredentials({
    access_token: decryptToken(row.accessTokenEnc),
    refresh_token: decryptToken(row.refreshTokenEnc),
    expiry_date: row.tokenExpiry.getTime(),
    scope: row.scope || GOOGLE_CALENDAR_SCOPE,
  });

  // Persystuj odświeżony access_token (i ewentualnie rotowany refresh_token).
  client.on("tokens", (tokens) => {
    void persistRefreshed(db, trainerId, tokens.access_token, tokens.expiry_date, tokens.refresh_token);
  });

  return { client, calendarId: row.calendarId };
}

async function persistRefreshed(
  db: Db,
  trainerId: string,
  accessToken: string | null | undefined,
  expiryDate: number | null | undefined,
  refreshToken: string | null | undefined,
): Promise<void> {
  try {
    // Szyfrowanie WEWNĄTRZ try — błąd encryptToken nie może uciec jako unhandled
    // rejection z listenera 'tokens' (który woła tę funkcję jako fire-and-forget).
    const set: Partial<typeof schema.googleCalendarConnections.$inferInsert> = { updatedAt: new Date() };
    if (accessToken) set.accessTokenEnc = encryptToken(accessToken);
    if (expiryDate) set.tokenExpiry = new Date(expiryDate);
    if (refreshToken) set.refreshTokenEnc = encryptToken(refreshToken);
    await db
      .update(schema.googleCalendarConnections)
      .set(set)
      .where(eq(schema.googleCalendarConnections.trainerId, trainerId));
  } catch {
    // best-effort: nieudany zapis/szyfrowanie odświeżonego tokenu nie może wywrócić żądania.
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS (wymaga zainstalowanego `google-auth-library`). Jeśli `onConflictDoUpdate` ma inną sygnaturę — sprawdź Context7 „drizzle-orm postgres on conflict do update".

- [ ] **Step 3: Review** — `/code-review` + `/security-review` (szyfrowanie przy zapisie, brak sekretów w `getConnectionStatus`, persystencja refreshed tokenu best-effort, tenant-scope). Po akceptacji → kolejny task.

---

## Task 6: Klient Calendar `app/lib/google/calendar.ts` — TDD (czysty mapper)

**Files:**
- Create: `app/lib/google/calendar.ts`
- Test: `app/lib/google/calendar.test.ts`

- [ ] **Step 1: Napisz failujący test (czysty `consultationToEvent`)**

Create `app/lib/google/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { consultationToEvent } from "~/lib/google/calendar";

describe("consultationToEvent", () => {
  const base = {
    id: "c-1",
    title: "Konsultacja — 11.06.2026",
    summary: "Notatki",
    scheduledAtISO: "2026-06-11T18:00:00.000Z",
    durationMin: 45,
    attendeeEmail: "podopieczny@example.com",
  };

  it("ustawia start/end w UTC wg durationMin", () => {
    const ev = consultationToEvent(base);
    expect(ev.start).toEqual({ dateTime: "2026-06-11T18:00:00.000Z", timeZone: "Etc/UTC" });
    expect(ev.end).toEqual({ dateTime: "2026-06-11T18:45:00.000Z", timeZone: "Etc/UTC" });
  });

  it("dodaje uczestnika (zaproszenie mailowe)", () => {
    const ev = consultationToEvent(base);
    expect(ev.attendees).toEqual([{ email: "podopieczny@example.com" }]);
  });

  it("żąda konferencji Meet z unikalnym requestId", () => {
    const ev = consultationToEvent(base);
    expect(ev.conferenceData?.createRequest?.conferenceSolutionKey).toEqual({ type: "hangoutsMeet" });
    expect(ev.conferenceData?.createRequest?.requestId).toBe("kalisthenos-c-1");
  });

  it("summary zdarzenia = tytuł terminu, description = podsumowanie", () => {
    const ev = consultationToEvent(base);
    expect(ev.summary).toBe("Konsultacja — 11.06.2026");
    expect(ev.description).toBe("Notatki");
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — brak `~/lib/google/calendar`.

- [ ] **Step 3: Zaimplementuj**

Create `app/lib/google/calendar.ts`:

```ts
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";

export interface ConsultationEventInput {
  id: string;
  title: string;
  summary: string;
  scheduledAtISO: string;
  durationMin: number;
  attendeeEmail: string;
}

/** Czysty mapper konsultacji → ciało zdarzenia Google Calendar (z prośbą o Meet). */
export function consultationToEvent(input: ConsultationEventInput): calendar_v3.Schema$Event {
  const start = new Date(input.scheduledAtISO);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  return {
    summary: input.title,
    description: input.summary,
    start: { dateTime: start.toISOString(), timeZone: "Etc/UTC" },
    end: { dateTime: end.toISOString(), timeZone: "Etc/UTC" },
    attendees: [{ email: input.attendeeEmail }],
    conferenceData: {
      createRequest: {
        requestId: `kalisthenos-${input.id}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

function api(auth: OAuth2Client): calendar_v3.Calendar {
  return calendar({ version: "v3", auth });
}

/** Tworzy zdarzenie z Meet + zaproszeniem. Zwraca { eventId, meetUrl }. */
export async function insertEvent(
  auth: OAuth2Client,
  calendarId: string,
  input: ConsultationEventInput,
): Promise<{ eventId: string; meetUrl: string | null }> {
  const res = await api(auth).events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: consultationToEvent(input),
  });
  const eventId = res.data.id;
  if (!eventId) throw new Error("Google did not return an event id");
  const meetUrl =
    res.data.hangoutLink ??
    res.data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
    null;
  return { eventId, meetUrl };
}

/** Aktualizuje termin/godzinę istniejącego zdarzenia (po reschedule). */
export async function patchEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
  input: ConsultationEventInput,
): Promise<void> {
  await api(auth).events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: {
      summary: input.title,
      description: input.summary,
      start: { dateTime: new Date(input.scheduledAtISO).toISOString(), timeZone: "Etc/UTC" },
      end: {
        dateTime: new Date(
          new Date(input.scheduledAtISO).getTime() + input.durationMin * 60_000,
        ).toISOString(),
        timeZone: "Etc/UTC",
      },
    },
  });
}

/** Usuwa zdarzenie (po cancel/odrzuceniu). Idempotentne wobec 404/410. */
export async function deleteEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await api(auth).events.delete({ calendarId, eventId, sendUpdates: "all" });
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
    if (code === 404 || code === 410) return; // już usunięte — OK
    throw err;
  }
}
```

> Test integracyjny (Task 8) mockuje **moduł** `@googleapis/calendar` przez `vi.mock`, więc nie potrzebujemy osobnego interfejsu syncera — `insertEvent`/`patchEvent`/`deleteEvent` są wołane wprost przez `sync.ts`.

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (4 testy mappera). (Wymaga zainstalowanego `@googleapis/calendar` dla importu typów — jeśli FAIL z „Cannot find module", patrz nota o `npm install` z Tasku 4; logika mappera czysta.)

- [ ] **Step 5: Lint + typecheck** — `npm run lint`, `npm run typecheck` (po `npm install`). Expected: PASS.

- [ ] **Step 6: Review** — `/code-review` (poprawność `conferenceDataVersion`, `sendUpdates`, idempotentny delete). Po akceptacji → kolejny task.

---

## Task 7: Orkiestracja `app/lib/google/sync.ts` + helpery repo

**Files:**
- Create: `app/lib/google/sync.ts`
- Modify: `app/lib/consultations.ts` (helpery `setGoogleEventId`, `getSyncRow`, `listUnsyncedForSync`)

- [ ] **Step 1: Dodaj helpery do `app/lib/consultations.ts`**

Na końcu `app/lib/consultations.ts` (przed ostatnim `}` pliku NIE — to top-level funkcje; dodaj jako nowe eksporty na końcu pliku) dodaj:

```ts
/** Dane jednego terminu potrzebne do zbudowania zdarzenia Google. Tenant-scope: trainerId. */
export interface ConsultationSyncRow {
  id: string;
  title: string;
  summary: string;
  scheduledAtISO: string;
  durationMin: number;
  status: schema.ConsultationStatus;
  googleEventId: string | null;
  attendeeEmail: string;
}

export async function getSyncRow(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<ConsultationSyncRow | null> {
  const [r] = await db
    .select({
      id: schema.consultations.id,
      title: schema.consultations.title,
      summary: schema.consultations.summary,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      googleEventId: schema.consultations.googleEventId,
      attendeeEmail: schema.users.email,
    })
    .from(schema.consultations)
    .innerJoin(schema.users, eq(schema.users.id, schema.consultations.traineeId))
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAt.toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    googleEventId: r.googleEventId,
    attendeeEmail: r.attendeeEmail,
  };
}

/** Żywe (planned/confirmed/change_requested) nadchodzące terminy pary bez google_event_id — do backfillu. Tenant-scope: trainerId. */
export async function listUnsyncedForSync(
  db: Db,
  args: { trainerId: string; traineeId: string; nowISO: string },
): Promise<ConsultationSyncRow[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      title: schema.consultations.title,
      summary: schema.consultations.summary,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      googleEventId: schema.consultations.googleEventId,
      attendeeEmail: schema.users.email,
    })
    .from(schema.consultations)
    .innerJoin(schema.users, eq(schema.users.id, schema.consultations.traineeId))
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
        gt(schema.consultations.scheduledAt, new Date(args.nowISO)),
        // Żywe statusy (planned/confirmed/change_requested) — spójne z `LIVE_STATUSES`
        // i z guardem `syncUpsertOne` (który pomija tylko cancelled/documented).
        inArray(schema.consultations.status, [...LIVE_STATUSES]),
        isNull(schema.consultations.googleEventId),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAt.toISOString(),
    durationMin: r.durationMin,
    status: r.status,
    googleEventId: r.googleEventId,
    attendeeEmail: r.attendeeEmail,
  }));
}

/** Zapisuje google_event_id (i opcjonalnie meetingUrl z Meet). Tenant-scope: trainerId. */
export async function setGoogleEventId(
  db: Db,
  args: { trainerId: string; consultationId: string; googleEventId: string | null; meetingUrl?: string | null },
): Promise<void> {
  await db
    .update(schema.consultations)
    .set({
      googleEventId: args.googleEventId,
      ...(args.meetingUrl !== undefined ? { meetingUrl: args.meetingUrl } : {}),
    })
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    );
}
```

W imporcie drizzle na górze pliku dodaj brakujące operatory — zmień pierwszą linię na:

```ts
import { and, asc, between, eq, gt, inArray, isNull, ne } from "drizzle-orm";
```

- [ ] **Step 2: Zaimplementuj orkiestrację**

Create `app/lib/google/sync.ts`:

```ts
import type { Db } from "~/lib/db/client";
import { getAuthedClient, getConnectionStatus } from "~/lib/google/connections";
import { deleteEvent, insertEvent, patchEvent } from "~/lib/google/calendar";
import type { ConsultationEventInput } from "~/lib/google/calendar";
import {
  getSyncRow,
  listUnsyncedForSync,
  setGoogleEventId,
  type ConsultationSyncRow,
} from "~/lib/consultations";

/**
 * Loguje WYŁĄCZNIE kod/status błędu i stały komunikat — nigdy `err.message`/całego
 * obiektu z SDK, bo google-auth-library/@googleapis/calendar potrafią umieścić tam
 * nagłówek `Authorization: Bearer …` lub treść z refresh_token.
 */
function logSyncError(label: string, err: unknown): void {
  const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
  console.error(`[google-sync] ${label} failed`, code ? `(code ${code})` : "(no code)");
}

function toEventInput(r: ConsultationSyncRow): ConsultationEventInput {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    scheduledAtISO: r.scheduledAtISO,
    durationMin: r.durationMin,
    attendeeEmail: r.attendeeEmail,
  };
}

/**
 * Best-effort: jeśli trener ma podpięty Google, wypycha JEDEN termin (create albo patch)
 * i zapisuje google_event_id + meetingUrl z Meet. Każdy błąd jest połykany (logowany),
 * nigdy nie przerywa żądania. Wołać POST-commit (poza transakcją). Tenant-scope: trainerId.
 */
export async function syncUpsertOne(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return; // brak połączenia — no-op
    const row = await getSyncRow(db, { trainerId: args.trainerId, consultationId: args.consultationId });
    if (!row) return;
    if (row.status === "cancelled" || row.status === "documented") return;

    if (row.googleEventId) {
      await patchEvent(authed.client, authed.calendarId, row.googleEventId, toEventInput(row));
    } else {
      const { eventId, meetUrl } = await insertEvent(
        authed.client,
        authed.calendarId,
        toEventInput(row),
      );
      await setGoogleEventId(db, {
        trainerId: args.trainerId,
        consultationId: row.id,
        googleEventId: eventId,
        meetingUrl: meetUrl ?? undefined,
      });
    }
  } catch (err) {
    logSyncError("upsert", err);
  }
}

/**
 * Best-effort delete zdarzenia po cancel/odrzuceniu. Czyści google_event_id.
 * Tenant-scope: trainerId.
 */
export async function syncCancelOne(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return;
    const row = await getSyncRow(db, { trainerId: args.trainerId, consultationId: args.consultationId });
    if (!row?.googleEventId) return;
    await deleteEvent(authed.client, authed.calendarId, row.googleEventId);
    await setGoogleEventId(db, {
      trainerId: args.trainerId,
      consultationId: row.id,
      googleEventId: null,
    });
  } catch (err) {
    logSyncError("cancel", err);
  }
}

/**
 * Backfill: wypycha wszystkie nadchodzące, niezsynchronizowane terminy pary.
 * Wołane przy save-schedule i przez intent „sync-google". Best-effort, bounded
 * liczbą terminów w oknie HORIZON. Tenant-scope: trainerId.
 */
export async function syncBackfillPair(
  db: Db,
  args: { trainerId: string; traineeId: string; nowISO: string },
): Promise<{ attempted: number; synced: number }> {
  let attempted = 0;
  let synced = 0;
  try {
    const authed = await getAuthedClient(db, args.trainerId);
    if (!authed) return { attempted, synced };
    const rows = await listUnsyncedForSync(db, args);
    for (const row of rows) {
      attempted += 1;
      try {
        const { eventId, meetUrl } = await insertEvent(
          authed.client,
          authed.calendarId,
          toEventInput(row),
        );
        await setGoogleEventId(db, {
          trainerId: args.trainerId,
          consultationId: row.id,
          googleEventId: eventId,
          meetingUrl: meetUrl ?? undefined,
        });
        synced += 1;
      } catch (err) {
        logSyncError(`backfill item ${row.id}`, err);
      }
    }
  } catch (err) {
    logSyncError("backfill", err);
  }
  return { attempted, synced };
}

/** Czy integracja jest dostępna dla danego trenera (do UI). */
export async function isGoogleSyncActive(db: Db, trainerId: string): Promise<boolean> {
  return (await getConnectionStatus(db, trainerId)).connected;
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS (po `npm install`). `console.error` jest dozwolony (warstwa serwera) — jeśli Biome zgłosi `noConsole`, sprawdź `biome.json`; w repo logujemy błędy serwera tym kanałem.

- [ ] **Step 4: Review** — `/code-review` + `/security-review` (best-effort nie przecieka wyjątków, brak tokenów w logach, tenant-scope na każdej funkcji). Po akceptacji → kolejny task.

---

## Task 8: Test integracyjny sync przez mock (`tests/google-sync.itest.ts`)

**Files:**
- Create: `tests/google-sync.itest.ts` (PISZEMY, **nie uruchamiamy**)

> Cel: udowodnić, że (a) sync woła Calendar z właściwymi argumentami i zapisuje `google_event_id`, (b) błąd Google **nie** przerywa zapisu natywnego (best-effort). Mockujemy `@googleapis/calendar` (zero sieci), używamy realnego Postgresa (testcontainers, jak reszta `tests/`).

- [ ] **Step 1: Napisz test (wzór — dopasuj do helperów `tests/`)**

Create `tests/google-sync.itest.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Klucz szyfrujący tokeny przed importem modułów google/*.
process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/trener/integracje/google/callback";

// Mock SDK Calendar — łapiemy wywołania events.insert/patch/delete bez sieci.
const insertMock = vi.fn(async () => ({
  data: { id: "evt-123", hangoutLink: "https://meet.google.com/abc-defg-hij" },
}));
vi.mock("@googleapis/calendar", () => ({
  calendar: () => ({ events: { insert: insertMock, patch: vi.fn(), delete: vi.fn() } }),
}));

// Mock OAuth2Client — setCredentials/on no-op (brak realnego refresh).
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    setCredentials() {}
    on() {}
    generateAuthUrl() {
      return "https://accounts.google.com/o/oauth2/auth";
    }
  },
}));

// ⇩ standardowy bootstrap testcontainers z tego repo (patrz inne *.itest.ts):
//   - wstań Postgres, odpal migracje, zwróć `db`
//   - seed: trener + podopieczny (z emailem), aktywny harmonogram + 1 termin `planned`
//   - zapis google_calendar_connections dla trenera (tokeny zaszyfrowane encryptToken)
// import { setupTestDb, seedPair } from "./helpers"; // ← użyj realnych helperów repo

import { syncUpsertOne } from "~/lib/google/sync";

describe("google sync (best-effort, mock Calendar)", () => {
  // const ctx = ... (db, trainerId, traineeId, consultationId) z bootstrapu

  beforeAll(async () => {
    /* setupTestDb + seedPair + insert connection */
  });
  afterAll(async () => {
    /* teardown */
  });

  it("create: woła events.insert z conferenceDataVersion=1 i sendUpdates=all, zapisuje google_event_id", async () => {
    // await syncUpsertOne(ctx.db, { trainerId: ctx.trainerId, consultationId: ctx.consultationId });
    // expect(insertMock).toHaveBeenCalledTimes(1);
    // const arg = insertMock.mock.calls[0][0];
    // expect(arg.conferenceDataVersion).toBe(1);
    // expect(arg.sendUpdates).toBe("all");
    // expect(arg.requestBody.attendees[0].email).toBe(ctx.traineeEmail);
    // const [row] = await ctx.db.select().from(schema.consultations).where(eq(schema.consultations.id, ctx.consultationId));
    // expect(row.googleEventId).toBe("evt-123");
    // expect(row.meetingUrl).toContain("meet.google.com");
    expect(true).toBe(true); // ← zastąp asercjami po podpięciu helperów bootstrapu
  });

  it("best-effort: błąd Calendar NIE przerywa (zapis natywny nietknięty, brak rzutu)", async () => {
    // insertMock.mockRejectedValueOnce(new Error("Google 500"));
    // await expect(
    //   syncUpsertOne(ctx.db, { trainerId: ctx.trainerId, consultationId: ctx.consultationId2 }),
    // ).resolves.toBeUndefined();
    // const [row] = await ctx.db.select()... ; expect(row.googleEventId).toBeNull();
    expect(true).toBe(true);
  });
});
```

> **Implementator:** podłącz realny bootstrap testcontainers używany w `tests/consultations.itest.ts` (ten sam helper wstawania DB + migracji + seed) i odkomentuj asercje. Placeholdery `expect(true)` są celowo widoczne, by test nie udawał pokrycia, którego jeszcze nie ma — **zastąp je** realnymi asercjami przed oznaczeniem tasku jako gotowy. Test **uruchamia właściciel** (`npm run test:itest`).

- [ ] **Step 2: Typecheck (test się kompiluje)**

Run: `npm run typecheck`
Expected: PASS (plik kompiluje się; nie uruchamiamy itest).

- [ ] **Step 3: Review** — `/code-review`. Po akceptacji → kolejny task.

---

## Task 9: Trasy OAuth + wpięcie syncu w akcje + UI (frontend-design)

**Files:**
- Create: `app/routes/trener/integracje.google.tsx`
- Create: `app/routes/trener/integracje.google.callback.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/_layout.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`
- Modify: `app/routes/podopieczny/konsultacje._index.tsx`
- Modify: `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx`

> **Warstwę wizualną prowadzi `frontend-design:frontend-design`** zgodnie z `design-system/README.md` + `app/styles/tokens.css`. Kod poniżej to wiążący szkielet loaderów/akcji (logika + autoryzacja). UI po polsku, spójne z Fazą 1 (karty, `.badge`, chip stanu).

- [ ] **Step 1: Trasa statusu/połączenia `integracje.google.tsx`**

Create `app/routes/trener/integracje.google.tsx`:

```tsx
import { type ActionFunctionArgs, Form, type LoaderFunctionArgs, redirect, useLoaderData } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getEnv, googleConfigured } from "~/lib/env";
import { deleteConnection, getConnectionStatus } from "~/lib/google/connections";
import { consentUrl, newNonce, oauthClient, signState } from "~/lib/google/oauth";

/** Cookie z nonce wiążącym przepływ OAuth z przeglądarką (anty login-CSRF). */
function nonceCookie(nonce: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `goauth_nonce=${nonce}; HttpOnly; SameSite=Lax; Path=/trener/integracje/google; Max-Age=600${secure}`;
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const status = await getConnectionStatus(db, user.id);
  return { configured: googleConfigured(), status };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "connect") {
    if (!googleConfigured()) return { error: "Integracja Google nie jest skonfigurowana na serwerze." };
    const nonce = newNonce();
    const state = signState(nonce, Date.now() + 10 * 60_000, getEnv().SESSION_SECRET);
    // Set-Cookie z nonce; callback porówna go z nonce ze `state`.
    return redirect(consentUrl(state), { headers: { "Set-Cookie": nonceCookie(nonce) } });
  }
  if (intent === "disconnect") {
    const refreshToken = await deleteConnection(db, user.id);
    if (refreshToken) {
      try {
        await oauthClient().revokeToken(refreshToken);
      } catch {
        // best-effort revoke
      }
    }
    return { success: "Konto Google odłączone." };
  }
  return null;
}

export default function IntegracjeGoogle() {
  const { configured, status } = useLoaderData<typeof loader>();
  // UI: stan (configured? connected?), przycisk „Połącz z Google" (intent=connect)
  // lub „Rozłącz" (intent=disconnect) + e-mail konta. Polish: frontend-design.
  return (
    <div>
      <h1>Integracje</h1>
      {!configured && <p>Integracja Google nie jest skonfigurowana na tym serwerze.</p>}
      {configured && status.connected ? (
        <Form method="post">
          <input type="hidden" name="intent" value="disconnect" />
          <button type="submit">Rozłącz {status.googleEmail}</button>
        </Form>
      ) : (
        configured && (
          <Form method="post">
            <input type="hidden" name="intent" value="connect" />
            <button type="submit">Połącz z Google</button>
          </Form>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Trasa callback `integracje.google.callback.tsx`**

Create `app/routes/trener/integracje.google.callback.tsx`:

```tsx
import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getEnv } from "~/lib/env";
import { upsertConnection } from "~/lib/google/connections";
import { exchangeCode, verifyState } from "~/lib/google/oauth";

const DEST = "/trener/integracje/google";
// Klucze i wartości query WYŁĄCZNIE ASCII — polskie znaki w nagłówku Location
// rzucają w undici/Node fetch Headers ("Invalid character in header content").
const CLEAR_NONCE = "goauth_nonce=; HttpOnly; SameSite=Lax; Path=/trener/integracje/google; Max-Age=0";

function readNonceCookie(request: Request): string | null {
  const m = (request.headers.get("Cookie") ?? "").match(/(?:^|;\s*)goauth_nonce=([^;]+)/);
  return m ? m[1] : null;
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieNonce = readNonceCookie(args.request);

  const fail = (reason: string) =>
    redirect(`${DEST}?error=${reason}`, { headers: { "Set-Cookie": CLEAR_NONCE } });

  if (url.searchParams.get("error") || !code || !state) return fail("denied");

  // Anty-CSRF: podpisany `state` z ważnym TTL + `nonce` zgodny z cookie ustawionym
  // przy „Połącz" (atakujący nie może podstawić cudzego cookie).
  const parsed = verifyState(state, getEnv().SESSION_SECRET, Date.now());
  if (!parsed || !cookieNonce || parsed.nonce !== cookieNonce) return fail("state");

  try {
    const tokens = await exchangeCode(code); // rzuca, gdy brak scope calendar.events / refresh
    await upsertConnection(db, {
      trainerId: user.id, // połączenie zawsze zapisujemy dla ZALOGOWANEGO trenera
      googleEmail: tokens.email ?? "(połączone)",
      tokens,
    });
    return redirect(`${DEST}?ok=1`, { headers: { "Set-Cookie": CLEAR_NONCE } });
  } catch {
    return fail("exchange");
  }
}
```

- [ ] **Step 3: Zarejestruj trasy w `app/routes.ts`**

W bloku `prefix("trener", [ layout(... [ ... ]) ])`, **przed** `route("podopieczni", ...)` dodaj:

```ts
      route("integracje/google", "routes/trener/integracje.google.tsx"),
      route("integracje/google/callback", "routes/trener/integracje.google.callback.tsx"),
```

- [ ] **Step 4: Link „Integracje" w nawigacji trenera**

W `app/routes/trener/_layout.tsx` do tablicy `NAV_ITEMS` dodaj wpis **w tym samym kształcie co istniejące** elementy. Render robi `const Icon = Icons[item.icon]` — `icon` jest **kluczem-stringiem**, NIE elementem JSX. Wzór (dopasuj nazwy pól do realnych w `NAV_ITEMS`, np. `end`/`tailKey`):

```tsx
{ to: "/trener/integracje/google", label: "Integracje", end: false, icon: "Link", tailKey: null },
```

> `Icons.Link` istnieje (zweryfikowane). Gdyby brakowało — dodaj ikonę w `app/components/icons.tsx` i zaktualizuj `app/components/README.md`. **Nie** przekazuj JSX jako `icon` — to złamie typ tablicy i render.

- [ ] **Step 5: Wepnij backfill przy zapisie harmonogramu + intent „sync-google"**

W `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`:

(a) dodaj import:

```ts
import { isGoogleSyncActive, syncBackfillPair } from "~/lib/google/sync";
```

(b) w `loader`, po wyliczeniu `occurrences`, dołóż stan integracji do zwrotki:

```ts
  const googleActive = await isGoogleSyncActive(db, user.id);
  return { trainee, schedule, occurrences, googleActive };
```

(c) w `action`, w gałęzi `save-schedule` **po** `upsertSchedule(...)` (poza transakcją repo — `upsertSchedule` już zwrócił) dodaj best-effort backfill, oraz nowy intent:

```ts
    if (intent === "save-schedule") {
      const parsed = ScheduleFormSchema.safeParse(parseScheduleFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await upsertSchedule(db, { trainerId: user.id, traineeId, form: parsed.data, fromISO: todayISO() });
      const r = await syncBackfillPair(db, { trainerId: user.id, traineeId, nowISO: new Date().toISOString() });
      return { success: `Harmonogram zapisany.${r.attempted ? ` Zsynchronizowano z Google: ${r.synced}/${r.attempted}.` : ""}` };
    }
    if (intent === "sync-google") {
      const r = await syncBackfillPair(db, { trainerId: user.id, traineeId, nowISO: new Date().toISOString() });
      return { success: r.attempted ? `Zsynchronizowano: ${r.synced}/${r.attempted}.` : "Brak terminów do synchronizacji." };
    }
```

(d) w komponencie, gdy `googleActive`, dodaj chip stanu Google + przycisk „Synchronizuj" (`<Form method="post">` z `intent=sync-google`). Polish: frontend-design.

- [ ] **Step 6: Sync po utworzeniu terminu ad-hoc**

W `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`, w akcji **po** `createAdhocConsultation(...)` (gdy utworzono `planned`, nie `documented`) i **przed** redirectem dodaj:

```ts
import { syncUpsertOne } from "~/lib/google/sync";
// ...
const id = await createAdhocConsultation(db, { trainerId: user.id, traineeId, form: parsed.data, documented });
if (!documented) {
  await syncUpsertOne(db, { trainerId: user.id, consultationId: id });
}
```

- [ ] **Step 7: Sync po reschedule/cancel (szczegóły terminu — trener)**

W `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`, w akcji:

```ts
import { syncCancelOne, syncUpsertOne } from "~/lib/google/sync";
// po rescheduleOccurrence(...):
await syncUpsertOne(db, { trainerId: user.id, consultationId });
// po cancelOccurrence(...):
await syncCancelOne(db, { trainerId: user.id, consultationId });
```

> `documentConsultation` **nie** rusza Google (zgodnie ze spec: dokumentowanie nie zmienia zdarzenia). `deleteConsultation` — opcjonalnie `syncCancelOne` przed usunięciem, jeśli chcemy sprzątnąć zdarzenie (rekomendowane): wywołać `syncCancelOne` **przed** `deleteConsultation`.

- [ ] **Step 8: Sync (delete) po odrzuceniu przez podopiecznego**

**Polityka `change_requested` vs `decline` (domknięta w tym planie):**
- **`decline`** → status `cancelled` → **usuwamy** zdarzenie Google (spotkanie się nie odbędzie).
- **`request_change`** → status `change_requested` → **NIE** usuwamy zdarzenia (stan przejściowy; trener przełoży → `rescheduleOccurrence` → `syncUpsertOne` zrobi `patchEvent`). Usuwanie tutaj kasowałoby Meet/zaproszenie, choć termin wciąż istnieje.

Podopieczny nie ma połączenia Google (to konto **trenera**), więc sync robimy w kontekście trenera terminu. **`trainerId` bierzemy z rekordu zwróconego przez zapytanie tenant-scoped po `traineeId`** (`getConsultationDetail` zwróci `null` dla cudzego terminu) — **nigdy** z danych żądania. W `app/routes/podopieczny/konsultacje._index.tsx` i `konsultacje.$konsultacjaId.tsx`, w akcji `respond` **po** `respondToOccurrence(...)`:

```ts
import { getConsultationDetail } from "~/lib/consultations";
import { syncCancelOne } from "~/lib/google/sync";
// ...
await respondToOccurrence(db, { traineeId: user.id, consultationId, action, note });
if (action === "decline") {
  // Termin doczytany w scope podopiecznego → trainerId jest zaufany (nie z requestu).
  const detail = await getConsultationDetail(db, { consultationId, traineeId: user.id });
  if (detail?.consultation.googleEventId) {
    await syncCancelOne(db, { trainerId: detail.consultation.trainerId, consultationId });
  }
}
```

> Ten wariant nie zmienia sygnatury `respondToOccurrence` (zostaje `Promise<void>`) — żadnych zmian w istniejących wywołaniach/testach. (Alternatywa: rozszerzyć `respondToOccurrence`, by zwracała `{ trainerId, googleEventId }` i pominąć dodatkowy `SELECT` — ale wtedy trzeba zaktualizować jej testy/wywołania; w tym planie wybieramy wariant nieinwazyjny.)

- [ ] **Step 9: Typecheck + lint + build**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: PASS (po `npm install`). Build SSR + klient bez błędów.

- [ ] **Step 10: Review** — `/code-review` + `/security-review` (CSRF `state`, redirecty, brak sekretów w loaderach/HTML, tenant-scope sync w kontekście trenera przy akcjach podopiecznego). Po akceptacji → kolejny task.

---

## Task 10: Dokumentacja (część „done")

**Files:**
- Create: `app/lib/google/README.md`
- Modify: `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `CLAUDE.md`, `README.md` (root), `app/components/README.md` (jeśli dodano ikonę)

- [ ] **Step 1: `app/lib/google/README.md` (nowy)**

Utwórz README katalogu (liść) w konwencji repo: tabela plików `crypto.ts`/`oauth.ts`/`calendar.ts`/`connections.ts`/`sync.ts` z rolą i kluczowymi eksportami; nota o best-effort/post-commit, tenant-scope `trainerId`, szyfrowaniu tokenów, sync tylko wychodzącym. Stopka: link do `../../../CLAUDE.md`.

- [ ] **Step 2: `app/lib/README.md`**

Dodaj wiersz `env.ts` (rozszerzony o `GOOGLE_*` + `googleConfigured()`), wiersze helperów w `consultations.ts` (`getSyncRow`, `listUnsyncedForSync`, `setGoogleEventId`), oraz wpis o podkatalogu `google/` w tabeli „Podkatalogi".

- [ ] **Step 3: `app/routes/trener/README.md`**

Dodaj wiersze tras `integracje/google` i `integracje/google/callback`; zaktualizuj opisy tras konsultacji (sync best-effort wpięty w save-schedule/ad-hoc/reschedule/cancel + intent `sync-google`); dopisz `lib/google/*` do „Główne moduły".

- [ ] **Step 4: `app/routes/podopieczny/README.md`**

Zaktualizuj opisy `konsultacje._index`/`konsultacje.$konsultacjaId` o usuwanie zdarzenia Google (best-effort, w kontekście trenera) przy `decline`/`request_change`.

- [ ] **Step 5: `CLAUDE.md`**

W „Mapie projektu" pod `app/lib/` dodaj wpis `app/lib/google/` → [`app/lib/google/README.md`]. W razie potrzeby dopisz notę o opcjonalnej integracji Google w sekcji stack/konwencje.

- [ ] **Step 6: `README.md` (root)**

Dodaj sekcję „Integracja Google (opcjonalna)": utworzenie projektu Google Cloud, OAuth consent screen (External, scope `calendar.events`, ewentualnie `email`), OAuth client (Web), redirect URI = `${BASE_URL}/trener/integracje/google/callback`, generowanie `GOOGLE_TOKEN_ENC_KEY` (`openssl rand -base64 32`), oraz że bez tych zmiennych aplikacja działa bez Google.

- [ ] **Step 7: Lint dokumentacji + finalne bramki**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8: Review** — `/code-review` (kompletność i prawdziwość dokumentacji). Po akceptacji → handoff.

---

## Bramki „done" (całość Fazy 2)

- `npm run test:unit` (crypto, oauth-state, calendar-mapper zielone) — **po** `npm install`.
- `npm run typecheck`, `npm run lint`, `npm run build` — zielone po `npm install`.
- `tests/google-sync.itest.ts` — **napisany**; uruchamia właściciel (`npm run test:itest`).
- `/code-review` per task; `/security-review` dla Tasków 1, 2, 3, 4, 5, 7, 9.
- Dokumentacja zaktualizowana (Task 10).

## Handoff (na końcu implementacji)

Granica gita/Dockera/npm-install należy do właściciela. Po implementacji podaj:
1. **`npm install`** — nowe zależności `@googleapis/calendar`, `google-auth-library` (typecheck/test/build wymagają instalacji).
2. **`npm run db:generate`** (już w Task 3) + **`npm run db:migrate`** — nowa tabela `google_calendar_connections`.
3. **Nowe env** (`.env`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENC_KEY` (`openssl rand -base64 32`). Bez nich integracja jest wyłączona (rdzeń działa).
4. **Setup Google Cloud**: projekt + OAuth consent (External) + OAuth client (Web) + redirect URI; opis w root `README.md`.
5. **Testy do uruchomienia pod Dockerem**: `npm run test:itest` (w tym `google-sync.itest.ts`).
6. **Ścieżka ręcznej weryfikacji**: (a) bez env Google — UI „Integracje" pokazuje „niedostępne", konsultacje działają; (b) z kontem testowym Google — Połącz → callback → zapis terminu/harmonogramu tworzy zdarzenie z linkiem Meet i zaproszeniem mailowym podopiecznego; reschedule patchuje; cancel/odrzucenie usuwa; Rozłącz revokuje.
7. **Proponowany komunikat commita**: `feat(konsultacje): opcjonalna integracja Google Calendar/Meet (OAuth per trener, sync wychodzący best-effort, tokeny AES-256-GCM)`.

## Świadomy zakres (YAGNI — poza Fazą 2)

- Sync przychodzący z Google (`watch`/webhooki/sync tokeny) — poza zakresem.
- Push/e-mail z aplikacji — Google ogarnia zaproszenia (`sendUpdates=all`); w aplikacji tylko badge/sekcja.
- Strefy czasowe per użytkownik — v1 jedna strefa (UTC).
- Podopieczny łączący własny kalendarz — nie; dostaje zaproszenie mailem.
