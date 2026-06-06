# Rate-limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo-specific:** NIE wykonujesz operacji git ani docker. Zamiast `git commit` na końcu zadania → review per task (`/code-review`) i finalny handoff. Komendy tylko z allowlisty: `npx vitest run <wzorzec>`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx biome format --write <plik>`.

**Goal:** Dodać in-memory, per-IP rate-limiting (fixed-window) do `POST /login` i `POST /zaproszenie/:token`, zwracający HTTP 429 + `Retry-After` + komunikat PL, fail-open przy błędzie limitera.

**Architecture:** Brak warstwy middleware (`react-router-serve`), więc rate-limit to wspólny helper w `app/lib/rate-limit.ts` wołany na początku akcji. Czysta funkcja okna (testowalna bez DB/timerów) oddzielona od store'a in-memory za interfejsem `RateLimitStore` (otwarta droga do Postgresa). Licznik kluczowany per-IP (`X-Forwarded-For`), czyszczony po sukcesie.

**Tech Stack:** TypeScript (strict), React Router v7 (`data()` do statusu+nagłówków), Vitest, Zod (istniejące), Biome.

**Spec:** `docs/superpowers/specs/2026-06-06-rate-limiting-design.md`.

---

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/rate-limit.ts` | **nowy** — `fixedWindowHit` (czysta), `InMemoryRateLimitStore`, `clientIp`, `enforceRateLimit`/`resetRateLimit`/`rateLimited`, `RATE_LIMITS` |
| `app/lib/rate-limit.test.ts` | **nowy** — testy jednostkowe czystej logiki + store + helperów |
| `app/routes/login.tsx` | integracja limitera (przed parsowaniem/DB) + reset po sukcesie |
| `app/routes/login.test.ts` | **nowy** — test akcji z mockowanym db/auth: 429 na (limit+1)-szej próbie |
| `app/routes/zaproszenie.$token.tsx` | integracja limitera + reset po udanej rejestracji |
| `app/lib/README.md` | dopisanie `rate-limit.ts` do tabeli modułów |

---

## Task 1: Czysta logika fixed-window

**Files:**
- Create: `app/lib/rate-limit.ts`
- Test: `app/lib/rate-limit.test.ts`

- [ ] **Step 1: Napisz failujący test**

W `app/lib/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fixedWindowHit } from "~/lib/rate-limit";

const WIN = 15 * 60_000; // 15 min

describe("fixedWindowHit", () => {
  it("pierwsze trafienie otwiera okno i przepuszcza", () => {
    const r = fixedWindowHit(undefined, 1000, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 1, windowStartMs: 1000 });
    expect(r.retryAfterSec).toBe(0);
  });

  it("w granicy limitu przepuszcza, zachowuje windowStart", () => {
    const r = fixedWindowHit({ count: 9, windowStartMs: 1000 }, 5000, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 10, windowStartMs: 1000 });
  });

  it("po przekroczeniu blokuje i liczy retryAfter do końca okna", () => {
    const start = 1000;
    const now = start + 60_000; // 1 min w oknie
    const r = fixedWindowHit({ count: 10, windowStartMs: start }, now, 10, WIN);
    expect(r.allowed).toBe(false);
    // pozostało 14 min = 840 s
    expect(r.retryAfterSec).toBe(840);
    expect(r.state.windowStartMs).toBe(start); // okno się NIE przesuwa
  });

  it("po wygaśnięciu okna otwiera nowe i przepuszcza", () => {
    const start = 1000;
    const r = fixedWindowHit({ count: 999, windowStartMs: start }, start + WIN, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 1, windowStartMs: start + WIN });
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: FAIL — `fixedWindowHit` nie istnieje / brak modułu.

- [ ] **Step 3: Zaimplementuj `fixedWindowHit`**

Utwórz `app/lib/rate-limit.ts` z:

```ts
import { data } from "react-router";

export interface WindowState {
  count: number;
  windowStartMs: number;
}

export interface HitResult {
  state: WindowState;
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Czysta logika fixed-window (bez Date.now — `nowMs` wstrzykiwane). Nowe okno gdy
 * brak stanu lub poprzednie wygasło; inaczej inkrement. Okno NIE przesuwa się przy
 * zablokowanych próbach (fixed, nie sliding).
 */
export function fixedWindowHit(
  prev: WindowState | undefined,
  nowMs: number,
  limit: number,
  windowMs: number,
): HitResult {
  if (!prev || nowMs - prev.windowStartMs >= windowMs) {
    return { state: { count: 1, windowStartMs: nowMs }, allowed: true, retryAfterSec: 0 };
  }
  const count = prev.count + 1;
  const allowed = count <= limit;
  const retryAfterSec = allowed
    ? 0
    : Math.ceil((prev.windowStartMs + windowMs - nowMs) / 1000);
  return { state: { count, windowStartMs: prev.windowStartMs }, allowed, retryAfterSec };
}
```

- [ ] **Step 4: Uruchom test — ma PRZEJŚĆ**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: PASS (4 testy `fixedWindowHit`).

- [ ] **Step 5: Review tasku** — `/code-review` (lub przegląd diffu). Właściciel commituje.

---

## Task 2: Ekstrakcja IP klienta (`clientIp`)

**Files:**
- Modify: `app/lib/rate-limit.ts`
- Test: `app/lib/rate-limit.test.ts`

- [ ] **Step 1: Napisz failujący test**

Dopisz w `app/lib/rate-limit.test.ts`:

```ts
import { clientIp } from "~/lib/rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/login", { method: "POST", headers });
}

describe("clientIp", () => {
  it("bierze leftmost IP z X-Forwarded-For", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("przycina białe znaki", () => {
    expect(clientIp(req({ "x-forwarded-for": "  198.51.100.2  " }))).toBe("198.51.100.2");
  });
  it("obsługuje IPv6", () => {
    expect(clientIp(req({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }))).toBe("2001:db8::1");
  });
  it("brak nagłówka → 'unknown'", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: FAIL — `clientIp` nie istnieje.

- [ ] **Step 3: Zaimplementuj `clientIp`**

Dopisz w `app/lib/rate-limit.ts`:

```ts
/**
 * Adres klienta z `X-Forwarded-For` (Railway ustawia zaufany XFF za swoim proxy —
 * bierzemy leftmost wpis = oryginalny klient). Brak nagłówka → "unknown" (wspólny
 * bucket; w dev/bez proxy). Jeśli deployment przestanie być za zaufanym proxy,
 * tę funkcję trzeba zrewidować (XFF jest wtedy podrabialny).
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const first = xff.split(",")[0]?.trim();
  return first || "unknown";
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 3: Store in-memory + helpery tras

**Files:**
- Modify: `app/lib/rate-limit.ts`
- Test: `app/lib/rate-limit.test.ts`

- [ ] **Step 1: Napisz failujący test**

Dopisz w `app/lib/rate-limit.test.ts`:

```ts
import { InMemoryRateLimitStore, RATE_LIMITS, rateLimited } from "~/lib/rate-limit";

describe("InMemoryRateLimitStore", () => {
  it("przepuszcza do limitu, potem blokuje; reset czyści", () => {
    let now = 0;
    const store = new InMemoryRateLimitStore(() => now);
    for (let i = 0; i < 10; i++) {
      expect(store.hit("login:1.1.1.1", 10, 1000).allowed).toBe(true);
    }
    const blocked = store.hit("login:1.1.1.1", 10, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    store.reset("login:1.1.1.1");
    expect(store.hit("login:1.1.1.1", 10, 1000).allowed).toBe(true);
  });

  it("różne klucze są niezależne", () => {
    const store = new InMemoryRateLimitStore(() => 0);
    for (let i = 0; i < 10; i++) store.hit("login:A", 10, 1000);
    expect(store.hit("login:A", 10, 1000).allowed).toBe(false);
    expect(store.hit("login:B", 10, 1000).allowed).toBe(true);
  });

  it("sweep usuwa wygasłe wpisy po przekroczeniu progu", () => {
    let now = 0;
    const store = new InMemoryRateLimitStore(() => now, 2); // sweepThreshold=2
    store.hit("a", 10, 1000);
    store.hit("b", 10, 1000);
    now = 2000; // wszystkie wygasły (> windowMs i > MAX_WINDOW? patrz impl)
    store.hit("c", 10, 1000); // size>2 → sweep
    expect(store.size).toBeLessThanOrEqual(2);
  });
});

describe("rateLimited", () => {
  it("zwraca 429 + Retry-After + komunikat PL", () => {
    const r = rateLimited(120) as { data: { error: string }; init: ResponseInit };
    expect(r.init.status).toBe(429);
    expect((r.init.headers as Record<string, string>)["Retry-After"]).toBe("120");
    expect(r.data.error).toContain("2 min");
  });
});

describe("RATE_LIMITS", () => {
  it("login i invite: 10 prób / 15 min", () => {
    expect(RATE_LIMITS.login).toMatchObject({ limit: 10, windowMs: 15 * 60_000 });
    expect(RATE_LIMITS.invite).toMatchObject({ limit: 10, windowMs: 15 * 60_000 });
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: FAIL — brak `InMemoryRateLimitStore`/`RATE_LIMITS`/`rateLimited`.

- [ ] **Step 3: Zaimplementuj store + helpery**

Dopisz w `app/lib/rate-limit.ts`:

```ts
export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number): HitResult;
  reset(key: string): void;
}

// Najdłuższe skonfigurowane okno — używane do sweepu (konserwatywnie; przedwczesny
// sweep tylko „wybacza" wpis, nigdy nie blokuje dłużej).
const MAX_WINDOW_MS = 15 * 60_000;
const DEFAULT_SWEEP_THRESHOLD = 5000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, WindowState>();

  constructor(
    private now: () => number = () => Date.now(),
    private sweepThreshold: number = DEFAULT_SWEEP_THRESHOLD,
  ) {}

  get size(): number {
    return this.map.size;
  }

  hit(key: string, limit: number, windowMs: number): HitResult {
    const nowMs = this.now();
    if (this.map.size > this.sweepThreshold) this.sweep(nowMs);
    const result = fixedWindowHit(this.map.get(key), nowMs, limit, windowMs);
    this.map.set(key, result.state);
    return result;
  }

  reset(key: string): void {
    this.map.delete(key);
  }

  private sweep(nowMs: number): void {
    for (const [k, v] of this.map) {
      if (nowMs - v.windowStartMs >= MAX_WINDOW_MS) this.map.delete(k);
    }
  }
}

export const RATE_LIMITS = {
  login: { bucket: "login", limit: 10, windowMs: 15 * 60_000 },
  invite: { bucket: "invite", limit: 10, windowMs: 15 * 60_000 },
} as const;

// Singleton procesu (in-memory). Świadomie resetuje się przy redeployu — patrz spec.
const store: RateLimitStore = new InMemoryRateLimitStore();

/**
 * Zwraca `retryAfterSec` gdy żądanie ma być zablokowane, inaczej `null`.
 * FAIL-OPEN: każdy błąd wewnętrzny → `null` (+log), by usterka limitera nie
 * zablokowała logowania wszystkim.
 */
export function enforceRateLimit(
  request: Request,
  opts: { bucket: string; limit: number; windowMs: number },
): number | null {
  try {
    const key = `${opts.bucket}:${clientIp(request)}`;
    const r = store.hit(key, opts.limit, opts.windowMs);
    return r.allowed ? null : r.retryAfterSec;
  } catch (err) {
    console.error("[rate-limit] enforce failed", (err as Error)?.name ?? "");
    return null;
  }
}

/** Czyści licznik klucza (po udanej akcji). Best-effort. */
export function resetRateLimit(bucket: string, request: Request): void {
  try {
    store.reset(`${bucket}:${clientIp(request)}`);
  } catch {
    // best-effort
  }
}

/**
 * Wynik akcji RR7 dla przekroczenia: HTTP 429 + Retry-After (s) + komunikat PL w
 * kształcie `{ error }` (czytany przez useActionData). `data()` z 4xx NIE wyzwala
 * ErrorBoundary — route renderuje się normalnie z actionData.error.
 */
export function rateLimited(retryAfterSec: number) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return data(
    { error: `Za dużo prób. Spróbuj ponownie za ${mins} min.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/lib/rate-limit.test.ts`
Expected: PASS (wszystkie bloki).

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 4: Integracja w `login.tsx` + test akcji

**Files:**
- Modify: `app/routes/login.tsx`
- Test: `app/routes/login.test.ts`

- [ ] **Step 1: Napisz failujący test akcji (mockowane db/auth)**

Utwórz `app/routes/login.test.ts`:

```ts
import { vi } from "vitest";

// Mock DB: select().from().where().limit() → [] (użytkownik nie istnieje → ścieżka generic error).
vi.mock("~/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  },
}));

// Mock auth: verify zawsze false; reszta nieistotna dla ścieżki blokady.
vi.mock("~/lib/auth", () => ({
  buildSetCookie: () => "cookie",
  createSession: async () => ({ id: "s", expiresAt: new Date() }),
  getDummyPasswordHash: async () => "$dummy$",
  parseSessionId: () => null,
  readSession: async () => null,
  verifyPassword: async () => false,
}));

import { afterEach, describe, expect, it } from "vitest";
import { action } from "~/routes/login";

function loginReq(ip: string): Request {
  const body = new URLSearchParams({ email: "a@b.com", password: "x" });
  return new Request("http://localhost/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function call(ip: string) {
  return action({ request: loginReq(ip), params: {}, context: {} } as never);
}

describe("login action — rate limit", () => {
  it("11. próba z tego samego IP zwraca 429 + Retry-After", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 10; i++) {
      const r = (await call(ip)) as { data?: unknown; init?: ResponseInit };
      // pierwsze 10: zwykła ścieżka (generic error), bez 429
      expect((r as { init?: ResponseInit }).init?.status ?? 200).not.toBe(429);
    }
    const blocked = (await call(ip)) as { init: ResponseInit };
    expect(blocked.init.status).toBe(429);
    expect((blocked.init.headers as Record<string, string>)["Retry-After"]).toBeDefined();
  });

  it("inne IP nie jest zablokowane", async () => {
    const r = (await call("198.51.100.99")) as { init?: ResponseInit };
    expect(r.init?.status ?? 200).not.toBe(429);
  });
});
```

> Uwaga: testy współdzielą singleton store'a w procesie — dlatego użyto UNIKALNYCH IP per test, by liczniki się nie nakładały.

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/routes/login.test.ts`
Expected: FAIL — akcja nie zwraca 429 (brak integracji).

- [ ] **Step 3: Zintegruj limiter w `login.tsx`**

W `app/routes/login.tsx` dodaj import:

```ts
import { enforceRateLimit, RATE_LIMITS, rateLimited, resetRateLimit } from "~/lib/rate-limit";
```

Na początku `action` (PRZED `const formData = ...`):

```ts
export async function action(args: ActionFunctionArgs) {
  const retry = enforceRateLimit(args.request, RATE_LIMITS.login);
  if (retry !== null) return rateLimited(retry);

  const formData = await args.request.formData();
  // ... (reszta bez zmian)
```

Tuż przed udanym redirectem (po `createSession`) wyczyść licznik:

```ts
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  resetRateLimit("login", args.request);
  return redirect(user.role === "trainer" ? "/trener" : "/podopieczny", {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/routes/login.test.ts`
Expected: PASS (2 testy).

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 5: Integracja w `zaproszenie.$token.tsx`

**Files:**
- Modify: `app/routes/zaproszenie.$token.tsx`

- [ ] **Step 1: Dodaj import limitera**

W `app/routes/zaproszenie.$token.tsx`:

```ts
import { enforceRateLimit, RATE_LIMITS, rateLimited, resetRateLimit } from "~/lib/rate-limit";
```

- [ ] **Step 2: Limiter na początku `action`**

Na samym początku `action` (przed `const fd = await args.request.formData();`):

```ts
export async function action(args: ActionFunctionArgs) {
  const retry = enforceRateLimit(args.request, RATE_LIMITS.invite);
  if (retry !== null) return rateLimited(retry);

  const token = args.params.token ?? "";
  const fd = await args.request.formData();
  // ... (reszta bez zmian)
```

> Uwaga: obecny kod ma `const token = ...` i `const fd = ...` na początku — wstaw limiter PRZED nimi, zachowując istniejące linie.

- [ ] **Step 3: Reset po udanej rejestracji**

Po udanym `consumeInvite` (gdy mamy `user`/`resultKind`), przed/po `createSession`, dodaj reset. Wstaw tuż po linii `const { id, expiresAt } = await createSession(...)`:

```ts
  resetRateLimit("invite", args.request);
```

- [ ] **Step 4: Bramki typów/lintu**

Run: `npm run typecheck`
Expected: brak błędów.
Run: `npm run lint`
Expected: brak błędów.

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 6: Dokumentacja + bramki końcowe + handoff

**Files:**
- Modify: `app/lib/README.md`

- [ ] **Step 1: Dopisz `rate-limit.ts` do README**

W `app/lib/README.md` w tabeli „Pliki w tym katalogu" dodaj wiersz:

```
| `rate-limit.ts` | In-memory rate-limiting (fixed-window, per-IP) dla tras wrażliwych: `fixedWindowHit` (czysta), `InMemoryRateLimitStore` (za interfejsem `RateLimitStore`), `clientIp` (X-Forwarded-For), `enforceRateLimit`/`resetRateLimit`/`rateLimited`, stała `RATE_LIMITS` (login/invite: 10/15min). Fail-open. Używane w `routes/login.tsx` i `routes/zaproszenie.$token.tsx`. |
```

- [ ] **Step 2: Format dotkniętych plików**

Run: `npx biome format --write app/lib/rate-limit.ts`
Run: `npx biome format --write app/routes/login.tsx`
Run: `npx biome format --write app/routes/zaproszenie.$token.tsx`

- [ ] **Step 3: Bramki końcowe (wszystkie zielone)**

Run: `npx vitest run app` (jednostkowe — w tym rate-limit + login)
Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: wszystkie PASS.

- [ ] **Step 4: Handoff**

Zatrzymaj się przed gitem. Wypisz: zmienione/nowe pliki, proponowany komunikat commita, brak nowych migracji/env, listę testów (jednostkowe — uruchamiane automatycznie; brak itestu/Dockera), ścieżkę ręcznej weryfikacji (11 nieudanych logowań z tego samego IP → 429 + komunikat; poprawne logowanie resetuje; nowa karta/inny IP działa).

---

## Self-Review (autor planu)

**Spec coverage:**
- Store in-memory za interfejsem → Task 3 (`RateLimitStore`, `InMemoryRateLimitStore`). ✅
- Fixed-window + lockout → Task 1 (`fixedWindowHit`). ✅
- Per-IP, XFF leftmost, brak → "unknown" → Task 2 (`clientIp`). ✅
- Reset po sukcesie → Task 4 (login) + Task 5 (invite). ✅
- Progi login/invite 10/15min → Task 3 (`RATE_LIMITS`). ✅
- 429 + Retry-After + komunikat PL → Task 3 (`rateLimited`). ✅
- Fail-open → Task 3 (`enforceRateLimit` try/catch). ✅
- Eviction/sweep + cap → Task 3 (`sweep`, `sweepThreshold`). ✅
- Integracja w login/zaproszenie przed DB → Task 4/5. ✅
- Testy: unit (czysta logika + store + helpery) Task 1–3; test akcji login Task 4. ✅
- README → Task 6. ✅

**Odstępstwo od spec (świadome):** spec wspominał `tests/rate-limit.itest.ts` (testcontainers). Rate-limiter NIE ma zależności od DB, więc itest nic by nie dodał ponad testy jednostkowe — zastąpiony testem akcji `login` z mockowanym db/auth (`app/routes/login.test.ts`), który realnie weryfikuje wiring „limiter przed DB" bez Dockera. Do odnotowania w handoffie; zaktualizować sekcję „Testy/Pliki" w spec przy okazji.

**Placeholder scan:** brak TBD/TODO; każdy krok z kodem ma kompletny kod. ✅

**Type consistency:** `WindowState`/`HitResult`/`RateLimitStore` spójne między Task 1 i 3; `RATE_LIMITS.{login,invite}` mają pola `{bucket,limit,windowMs}` zgodne z sygnaturą `enforceRateLimit`; `rateLimited`/`enforceRateLimit`/`resetRateLimit` wołane w Task 4/5 zgodnie z definicją w Task 3. ✅
