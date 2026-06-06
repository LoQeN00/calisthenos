# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Repo-specific:** NIGDY git ani docker. Kroki „commit" POMIŃ → review per task (`/code-review`) + handoff na końcu. Komendy tylko: `npx vitest run <wzorzec>`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx biome format --write <plik>`, oraz JEDNORAZOWO `npx react-router reveal entry.server` (Task 5, codegen — niedestrukcyjne).

**Goal:** Strukturalne logowanie (JSON-lines → stdout/stderr) z bezpieczną redakcją + centralny hook na nieobsłużone błędy serwera; migracja wszystkich `console.*` na wspólny logger.

**Architecture:** Nowy `app/lib/logger.ts`: czyste `formatLogLine`/`errorMeta` (testowalne), `logger.{info,warn,error}` piszący JSON przez `console.*`, oraz `logUnhandled(error, request)` (logika hooka RR7). `app/entry.server.tsx` (wygenerowany przez `react-router reveal`) eksportuje `handleError` delegujący do `logUnhandled`. 10 miejsc `console.*` przechodzi na logger.

**Tech Stack:** TypeScript (strict), React Router v7.1 (`handleError`/`entry.server`), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-06-06-observability-design.md`.

---

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `app/lib/logger.ts` | **nowy** — `errorMeta`, `formatLogLine` (+ redakcja), `logger`, `logUnhandled` |
| `app/lib/logger.test.ts` | **nowy** — testy jednostkowe |
| `app/entry.server.tsx` | **nowy** — kanoniczny entry RR7 + `handleError` |
| `app/lib/google/sync.ts` | `logSyncError` → wrapper `logger.error` |
| `app/lib/stripe/subscriptions.ts` | `logCleanupError` → wrapper `logger.error` |
| `app/lib/rate-limit.ts` | `console.error` → `logger.error` |
| `app/routes/webhooks.stripe.tsx` | 2× `console.error` → `logger.error` |
| `app/lib/stripe/webhook.ts` | `console.warn` → `logger.warn` |
| `app/lib/auth/session.ts` | `console.log`/`console.error` → `logger.info`/`logger.error` |
| `app/routes/zaproszenie.$token.tsx` | `console.error` → `logger.error` |
| `app/routes/podopieczny/sylwetka.tsx` | `console.error` → `logger.error` |
| `app/lib/README.md` | dopisanie `logger.ts` |

---

## Task 1: `errorMeta` — bezpieczne metadane błędu

**Files:**
- Create: `app/lib/logger.ts`
- Test: `app/lib/logger.test.ts`

- [ ] **Step 1: Napisz failujący test**

`app/lib/logger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { errorMeta } from "~/lib/logger";

describe("errorMeta", () => {
  it("z Error zwraca name", () => {
    expect(errorMeta(new Error("boom"))).toEqual({ name: "Error" });
  });
  it("dołącza code (string)", () => {
    const e = Object.assign(new Error("x"), { code: "resource_missing" });
    expect(errorMeta(e)).toEqual({ name: "Error", code: "resource_missing" });
  });
  it("dołącza status jako code gdy brak code (number)", () => {
    const e = Object.assign(new Error("x"), { status: 500 });
    expect(errorMeta(e)).toEqual({ name: "Error", code: 500 });
  });
  it("NIGDY nie zwraca message", () => {
    const meta = errorMeta(new Error("Bearer super-secret-token"));
    expect(JSON.stringify(meta)).not.toContain("Bearer");
    expect("message" in meta).toBe(false);
  });
  it("nie-Error → puste, bez rzucania", () => {
    expect(errorMeta(null)).toEqual({});
    expect(errorMeta("oops")).toEqual({});
    expect(errorMeta(undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: FAIL — brak modułu/`errorMeta`.

- [ ] **Step 3: Zaimplementuj `errorMeta`**

Utwórz `app/lib/logger.ts`:

```ts
export type LogLevel = "info" | "warn" | "error";

/**
 * Bezpieczne metadane błędu do logów: TYLKO `name` + `code`/`status`. NIGDY `message`
 * ani całego obiektu — SDK (Google/Stripe) potrafią umieścić w message fragmenty żądania
 * (Bearer/refresh token).
 */
export function errorMeta(err: unknown): { name?: string; code?: string | number } {
  if (!(err instanceof Error)) return {};
  const out: { name?: string; code?: string | number } = { name: err.name };
  const raw = (err as { code?: unknown }).code ?? (err as { status?: unknown }).status;
  if (typeof raw === "string" || typeof raw === "number") out.code = raw;
  return out;
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: PASS (5 testów).

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 2: `formatLogLine` + auto-redakcja `Error` w ctx

**Files:**
- Modify: `app/lib/logger.ts`
- Test: `app/lib/logger.test.ts`

- [ ] **Step 1: Napisz failujący test**

Dopisz w `app/lib/logger.test.ts`:

```ts
import { formatLogLine } from "~/lib/logger";

describe("formatLogLine", () => {
  it("zwraca poprawny JSON z ts/level/event", () => {
    const line = formatLogLine("error", "x.failed", {}, "2026-06-06T00:00:00.000Z");
    const obj = JSON.parse(line);
    expect(obj).toEqual({ ts: "2026-06-06T00:00:00.000Z", level: "error", event: "x.failed" });
  });
  it("scala ctx", () => {
    const obj = JSON.parse(formatLogLine("info", "e", { a: 1, b: "z" }, "T"));
    expect(obj).toMatchObject({ level: "info", event: "e", a: 1, b: "z" });
  });
  it("auto-redaguje wartości Error w ctx (bez message)", () => {
    const line = formatLogLine("error", "e", { err: new Error("Bearer leak") }, "T");
    expect(line).not.toContain("Bearer");
    const obj = JSON.parse(line);
    expect(obj.err).toEqual({ name: "Error" });
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: FAIL — brak `formatLogLine`.

- [ ] **Step 3: Zaimplementuj `formatLogLine` + `redactCtx`**

Dopisz w `app/lib/logger.ts`:

```ts
/** Zamienia wartości będące Error na errorMeta — sieć bezpieczeństwa przed wyciekiem message. */
function redactCtx(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = v instanceof Error ? errorMeta(v) : v;
  }
  return out;
}

/** Czysta funkcja: linia JSON `{ts, level, event, ...redactedCtx}`. */
export function formatLogLine(
  level: LogLevel,
  event: string,
  ctx: Record<string, unknown>,
  ts: string,
): string {
  return JSON.stringify({ ts, level, event, ...redactCtx(ctx) });
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: PASS.

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 3: `logger` + `logUnhandled`

**Files:**
- Modify: `app/lib/logger.ts`
- Test: `app/lib/logger.test.ts`

- [ ] **Step 1: Napisz failujący test**

Dopisz w `app/lib/logger.test.ts`:

```ts
import { afterEach, beforeEach, vi } from "vitest";
import { logger, logUnhandled } from "~/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("logger.error pisze przez console.error jedną linią JSON", () => {
    logger.error("pay.failed", { op: "cancel" });
    expect(console.error).toHaveBeenCalledTimes(1);
    const line = (console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    const obj = JSON.parse(line);
    expect(obj).toMatchObject({ level: "error", event: "pay.failed", op: "cancel" });
    expect(typeof obj.ts).toBe("string");
  });

  it("logger.warn/info trafiają na właściwe strumienie", () => {
    logger.warn("w.evt");
    logger.info("i.evt");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
  });
});

describe("logUnhandled", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  function req(aborted: boolean): Request {
    const c = new AbortController();
    if (aborted) c.abort();
    return new Request("http://localhost/trener/podopieczni", {
      method: "POST",
      signal: c.signal,
    });
  }

  it("pomija żądania anulowane", () => {
    logUnhandled(new Error("x"), req(true));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("loguje nieobsłużony błąd z method+path", () => {
    logUnhandled(new Error("x"), req(false));
    expect(console.error).toHaveBeenCalledTimes(1);
    const obj = JSON.parse(
      (console.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    expect(obj).toMatchObject({
      level: "error",
      event: "unhandled",
      method: "POST",
      path: "/trener/podopieczni",
      name: "Error",
    });
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: FAIL — brak `logger`/`logUnhandled`.

- [ ] **Step 3: Zaimplementuj `logger` + `logUnhandled`**

Dopisz w `app/lib/logger.ts`:

```ts
function emit(level: LogLevel, event: string, ctx?: Record<string, unknown>): void {
  try {
    const line = formatLogLine(level, event, ctx ?? {}, new Date().toISOString());
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  } catch {
    // Logger NIGDY nie rzuca — fallback bez formatowania.
    console.error("[logger] format failed", event);
  }
}

export const logger = {
  info(event: string, ctx?: Record<string, unknown>): void {
    emit("info", event, ctx);
  },
  warn(event: string, ctx?: Record<string, unknown>): void {
    emit("warn", event, ctx);
  },
  error(event: string, ctx?: Record<string, unknown>): void {
    emit("error", event, ctx);
  },
};

/**
 * Logika hooka `handleError` RR7 (wydzielona, by testy nie importowały entry.server).
 * Pomija żądania anulowane przez RR7. Loguje method+path+errorMeta jako `unhandled`.
 */
export function logUnhandled(error: unknown, request: Request): void {
  if (request.signal.aborted) return;
  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = request.url;
  }
  logger.error("unhandled", { method: request.method, path, ...errorMeta(error) });
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/lib/logger.test.ts`
Expected: PASS (wszystkie bloki).

- [ ] **Step 5: Review tasku** — `/code-review`.

---

## Task 4: Migracja `console.*` → logger (8 plików)

**Files:** modify (każdy plik niżej). Brak nowych testów — istniejące + typecheck/lint są bramką.

- [ ] **Step 1: `app/lib/google/sync.ts`**

Dodaj import (obok istniejących):
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp ciało `logSyncError`:
```ts
function logSyncError(label: string, err: unknown): void {
  logger.error("google_sync.failed", { op: label, ...errorMeta(err) });
}
```

- [ ] **Step 2: `app/lib/stripe/subscriptions.ts`**

Dodaj import:
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp ciało `logCleanupError`:
```ts
function logCleanupError(label: string, err: unknown): void {
  logger.error("stripe_cleanup.failed", { op: label, ...errorMeta(err) });
}
```

- [ ] **Step 3: `app/lib/rate-limit.ts`**

Dodaj import (na górze pliku, po imporcie `data`):
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp linię w `enforceRateLimit`:
```ts
    console.error("[rate-limit] enforce failed", (err as Error)?.name ?? "");
```
na:
```ts
    logger.error("rate_limit.enforce_failed", errorMeta(err));
```

- [ ] **Step 4: `app/routes/webhooks.stripe.tsx`**

Dodaj import:
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp:
```ts
        console.error("[stripe webhook] marker rollback failed", event.id, cleanupErr);
```
na:
```ts
        logger.error("stripe_webhook.marker_rollback_failed", {
          eventId: event.id,
          ...errorMeta(cleanupErr),
        });
```
Zastąp:
```ts
      console.error("[stripe webhook] applyChange failed", event.type, err);
```
na:
```ts
      logger.error("stripe_webhook.apply_failed", { type: event.type, ...errorMeta(err) });
```

- [ ] **Step 5: `app/lib/stripe/webhook.ts`**

Dodaj import:
```ts
import { logger } from "~/lib/logger";
```
Zastąp blok `console.warn(...)` (faktura bez metadanych pary):
```ts
        console.warn(
          "[stripe webhook] faktura bez metadanych pary — pomijam",
          change.stripeInvoiceId,
        );
```
na:
```ts
        logger.warn("stripe_webhook.invoice_no_pair", { invoiceId: change.stripeInvoiceId });
```

- [ ] **Step 6: `app/lib/auth/session.ts`**

Dodaj import:
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp:
```ts
      if (n > 0) console.log(`[sessions] pruned ${n} expired session(s)`);
```
na:
```ts
      if (n > 0) logger.info("sessions.pruned", { count: n });
```
Zastąp:
```ts
      console.error("[sessions] prune failed:", err);
```
na:
```ts
      logger.error("sessions.prune_failed", errorMeta(err));
```

- [ ] **Step 7: `app/routes/zaproszenie.$token.tsx`**

Dodaj import:
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp:
```ts
      console.error("[onboarding] setMonthlyAmount failed", err);
```
na:
```ts
      logger.error("onboarding.set_amount_failed", errorMeta(err));
```

- [ ] **Step 8: `app/routes/podopieczny/sylwetka.tsx`**

Dodaj import:
```ts
import { errorMeta, logger } from "~/lib/logger";
```
Zastąp:
```ts
      console.error("[sylwetka] delete failed:", e);
```
na:
```ts
      logger.error("body_photo.delete_failed", errorMeta(e));
```

- [ ] **Step 9: Bramki migracji**

Run: `npm run typecheck`
Expected: czysto.
Run: `npm run lint`
Expected: czysto (brak nieużywanych importów, brak pozostałych `console.*` w zmienionych plikach — poza fallbackiem w `logger.ts`).
Run: `npx vitest run app`
Expected: PASS (istniejące testy + logger).

- [ ] **Step 10: Review tasku** — `/code-review`.

---

## Task 5: `entry.server.tsx` + `handleError`

**Files:**
- Create: `app/entry.server.tsx` (wygenerowany)

- [ ] **Step 1: Wygeneruj kanoniczny entry serwera**

Run: `npx react-router reveal entry.server`
Expected: utworzony `app/entry.server.tsx` (domyślny szablon RR7 7.1: `renderToPipeableStream`, `isbot`, `streamTimeout`). NIE edytuj wygenerowanego `handleRequest`.

> Fallback (gdyby `reveal` był niedostępny) — utwórz `app/entry.server.tsx` z poniższą treścią:
> ```tsx
> import { PassThrough } from "node:stream";
> import type { AppLoadContext, EntryContext } from "react-router";
> import { createReadableStreamFromReadable } from "@react-router/node";
> import { ServerRouter } from "react-router";
> import { isbot } from "isbot";
> import type { RenderToPipeableStreamOptions } from "react-dom/server";
> import { renderToPipeableStream } from "react-dom/server";
>
> export const streamTimeout = 5_000;
>
> export default function handleRequest(
>   request: Request,
>   responseStatusCode: number,
>   responseHeaders: Headers,
>   routerContext: EntryContext,
>   _loadContext: AppLoadContext,
> ) {
>   return new Promise((resolve, reject) => {
>     let shellRendered = false;
>     const userAgent = request.headers.get("user-agent");
>     const readyOption: keyof RenderToPipeableStreamOptions =
>       (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
>     const { pipe, abort } = renderToPipeableStream(
>       <ServerRouter context={routerContext} url={request.url} />,
>       {
>         [readyOption]() {
>           shellRendered = true;
>           const body = new PassThrough();
>           const stream = createReadableStreamFromReadable(body);
>           responseHeaders.set("Content-Type", "text/html");
>           resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
>           pipe(body);
>         },
>         onShellError(error: unknown) {
>           reject(error);
>         },
>         onError(error: unknown) {
>           responseStatusCode = 500;
>           if (shellRendered) console.error(error);
>         },
>       },
>     );
>     setTimeout(abort, streamTimeout + 1000);
>   });
> }
> ```

- [ ] **Step 2: Dodaj eksport `handleError`**

Na końcu `app/entry.server.tsx` dodaj:

```tsx
import { type HandleErrorFunction } from "react-router";
import { logUnhandled } from "~/lib/logger";

export const handleError: HandleErrorFunction = (error, { request }) => {
  logUnhandled(error, request);
};
```

> Uwaga: `import { type HandleErrorFunction } from "react-router"` dołącz do istniejącego importu z `react-router` w wygenerowanym pliku albo zostaw osobno — Biome to znormalizuje.

- [ ] **Step 3: Bramki**

Run: `npm run typecheck`
Expected: czysto.
Run: `npm run build`
Expected: build przechodzi (SSR entry zbudowany; brak błędu importu `isbot`/`react-dom/server`).

- [ ] **Step 4: Review tasku** — `/code-review`.

---

## Task 6: Dokumentacja + bramki końcowe + handoff

**Files:**
- Modify: `app/lib/README.md`

- [ ] **Step 1: Dopisz `logger.ts` do README**

W `app/lib/README.md` (tabela „Pliki w tym katalogu") dodaj wiersz:

```
| `logger.ts` | Structured logging (JSON-lines → stdout/stderr): `logger.{info,warn,error}(event, ctx?)`, czysta `formatLogLine` + `errorMeta` (whitelist `name`+`code`, NIGDY `message`/sekretów; auto-redakcja wartości `Error` w ctx), `logUnhandled(error, request)` (logika hooka `handleError` z `entry.server.tsx`). Logger nigdy nie rzuca. |
```

- [ ] **Step 2: Format dotkniętych plików**

Run: `npx biome format --write app/lib/logger.ts`
Run: `npx biome format --write app/lib/logger.test.ts`
Run: `npx biome format --write app/entry.server.tsx`

- [ ] **Step 3: Bramki końcowe (wszystkie zielone)**

Run: `npx vitest run app`
Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run build`
Expected: wszystkie PASS.

- [ ] **Step 4: Handoff**

Zatrzymaj się przed gitem. Wypisz: zmienione/nowe pliki, proponowany commit, brak migracji/env, listę testów (jednostkowe — auto), ścieżkę ręcznej weryfikacji (wywołaj błąd w loaderze → log JSON `event:"unhandled"` w stdout; usuń podopiecznego bez Stripe → log `stripe_cleanup.failed` redagowany).

---

## Self-Review (autor planu)

**Spec coverage:**
- `errorMeta` (whitelist name+code, bez message) → Task 1. ✅
- `formatLogLine` + auto-redakcja Error w ctx → Task 2. ✅
- `logger.{info,warn,error}` JSON na stdout/stderr, nigdy nie rzuca → Task 3. ✅
- `logUnhandled` (guard aborted, method+path) → Task 3. ✅
- `entry.server.tsx` + `handleError` deleguje do `logUnhandled` → Task 5. ✅
- Migracja wszystkich 10 `console.*` (8 plików) → Task 4 (sync, subscriptions, rate-limit, webhooks.stripe ×2, stripe/webhook, session ×2, zaproszenie, sylwetka). ✅
- README → Task 6. ✅
- Testy TDD bez DB → Task 1–3. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok edytujący kod ma kompletny before/after. Fallback entry.server podany w całości. ✅

**Type consistency:** `LogLevel`/`errorMeta`/`formatLogLine`/`logger`/`logUnhandled` zdefiniowane w Task 1–3 i używane spójnie w Task 4–5; `HandleErrorFunction` z `react-router` (zweryfikowane context7, RR 7.1). `errorMeta` zwraca `{name?,code?}` — spread `...errorMeta(err)` daje płaskie pola w ctx, zgodnie z użyciem w migracjach. ✅

**Uwaga wykonawcza:** Task 4 usuwa `console.*` z plików — po migracji jedyny dozwolony `console.error` to fallback w `logger.ts` (Task 3) i ewentualny `onError` w wygenerowanym `entry.server.tsx` (Task 5, część szablonu RR7 — NIE migrujemy go, to ścieżka po wysłaniu powłoki poza zakresem handleError). Lint nie ma reguły zakazującej `console`, więc to konwencja, nie twardy błąd.
