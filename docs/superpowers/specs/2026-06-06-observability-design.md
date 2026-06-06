# Spec: observability (structured logging)

> Data: 2026-06-06. Status: zaakceptowany (brainstorm). Następny krok: plan implementacji.
> Powiązane: pozycja 9 audytu „dobre praktyki SaaS” (brak observability). Pozycja 8
> (rate-limiting) to osobny, ukończony feature.

## Cel

Uczynić ciche awarie widocznymi. Dziś błędy lecą do `console.*` w niespójnym kształcie,
a nieobsłużone błędy loaderów/akcji — do domyślnego logu RR7. Chcemy:

- spójny, **strukturalny (JSON-lines) log do stdout/stderr** (Railway zbiera i pozwala przeszukiwać),
- centralny hook na **nieobsłużone błędy** serwera,
- **bezpieczną redakcję** (zero PII/sekretów — żadnego `Bearer`/refresh tokenu w logach).

Bez nowych zależności i usług zewnętrznych.

## Decyzje (rozstrzygnięte w brainstormie)

| Decyzja | Wybór |
|---|---|
| Backend | **Structured logging JSON-lines → stdout/stderr** (bez Sentry, bez zależności) |
| Instrumentacja | **Migracja wszystkich ~10 `console.*`** na logger **+** centralny `handleError` |
| Redakcja błędów | Domyślnie **tylko `name` + `code`/`status`**, NIGDY `message`/obiektu; opcjonalny jawny `detail` |
| Alerting | Poza zakresem (później: alert na logach w Railway lub osobny sink) |

### Uzasadnienia

- **Bez Sentry:** Railway zbiera stdout — strukturalne logi dają przeszukiwalność bez konta,
  DSN i kosztu. Alerting (proaktywne powiadomienia) to wartość dodana Sentry; odkładamy ją,
  bo dziś potrzebujemy widoczności, nie pagera. Logger ma czysty kształt, więc dołożenie sinka
  (Sentry) później jest tanie.
- **Whitelist `name`+`code` (nie `message`):** SDK Google/Stripe potrafią wstawić do `err.message`
  fragmenty żądania (np. `Authorization: Bearer …`, refresh token). Obecny kod świadomie loguje
  tylko `code`. Logger formalizuje tę zasadę dla całego repo.

## Architektura

### Nowy moduł `app/lib/logger.ts`

Warstwa czysta (formatowanie) oddzielona od I/O (zapis do konsoli):

- **Czysta funkcja formatująca:**
  ```ts
  type LogLevel = "info" | "warn" | "error";
  function formatLogLine(level: LogLevel, event: string, ctx: Record<string, unknown>, ts: string): string;
  // → JSON: {"ts": ts, "level": level, "event": event, ...redactedCtx}
  ```
  Przed serializacją `ctx` przechodzi przez **auto-redakcję**: każda wartość będąca instancją
  `Error` jest zamieniana na `errorMeta(...)` (sieć bezpieczeństwa — nawet przypadkowe podanie
  surowego błędu nie wycieknie `message`).

- **`errorMeta` (czysta):**
  ```ts
  function errorMeta(err: unknown): { name?: string; code?: string | number };
  // err instanceof Error → { name, code? } gdzie code = (err as any).code ?? (err as any).status (jeśli string|number)
  // nie-Error → {} (bez rzucania)
  // NIGDY nie zwraca message
  ```

- **Logger (I/O):**
  ```ts
  export const logger = {
    info(event: string, ctx?: Record<string, unknown>): void; // console.info
    warn(event: string, ctx?: Record<string, unknown>): void; // console.warn
    error(event: string, ctx?: Record<string, unknown>): void; // console.error (stderr)
  };
  ```
  Każda metoda: `console.<level>(formatLogLine(level, event, ctx ?? {}, new Date().toISOString()))`.
  **Nigdy nie rzuca:** formatowanie w try; gdy padnie → surowy `console.error("[logger] format failed", event)`.

- **`logUnhandled` (logika hooka, testowalna bez importu entry.server):**
  ```ts
  function logUnhandled(error: unknown, request: Request): void;
  // if (request.signal.aborted) return;  — nie loguj anulowanych
  // else logger.error("unhandled", { method: request.method, path: new URL(request.url).pathname, ...errorMeta(error) })
  ```
  Dzięki temu cała logika `handleError` żyje w `logger.ts` (testowana ze sztucznym `Request`),
  a `entry.server.tsx` tylko deleguje — testy nie muszą importować `entry.server` (i `react-dom/server`).

### Centralny hook — nowy `app/entry.server.tsx`

Plik wygenerowany kanonicznie dla zainstalowanej wersji RR7 (7.1.0) poleceniem
`npx react-router reveal entry.server` (NIE przepisujemy ręcznie szablonu streamingu/bot-handlingu),
następnie dodajemy eksport:

```ts
import { type HandleErrorFunction } from "react-router";
import { logUnhandled } from "~/lib/logger";

export const handleError: HandleErrorFunction = (error, { request }) => {
  logUnhandled(error, request);
};
```

Cała logika (guard `aborted`, kształt logu) żyje w `logUnhandled` w `logger.ts` — `entry.server.tsx`
pozostaje trywialną delegacją.

`handleError` zastępuje domyślne logowanie RR7. NIE jest wołany dla rzucanych `Response`
(np. 404) ani dla błędów w dalszym strumieniowaniu po wysłaniu powłoki — to świadome ograniczenie
RR7, akceptowalne (interesują nas nieobsłużone wyjątki loaderów/akcji/SSR-shell).

### Migracja `console.*` → logger

| Miejsce | Było | Event |
|---|---|---|
| `app/lib/google/sync.ts` (`logSyncError`) | `console.error("[google-sync] … failed")` | `google_sync.failed` (`{ op, ...errorMeta }`) |
| `app/lib/stripe/subscriptions.ts` (`logCleanupError`) | `console.error("[stripe cleanup] …")` | `stripe_cleanup.failed` (`{ op, ...errorMeta }`) |
| `app/lib/rate-limit.ts` | `console.error("[rate-limit] enforce failed")` | `rate_limit.enforce_failed` (`{ ...errorMeta }`) |
| `app/routes/webhooks.stripe.tsx` | `console.error("[stripe webhook] applyChange failed")` | `stripe_webhook.apply_failed` (`{ type, ...errorMeta }`) |
| `app/routes/webhooks.stripe.tsx` | `console.error("[stripe webhook] marker rollback failed")` | `stripe_webhook.marker_rollback_failed` (`{ eventId, ...errorMeta }`) |
| `app/lib/stripe/webhook.ts` | `console.warn("[stripe webhook] faktura bez metadanych…")` | `stripe_webhook.invoice_no_pair` (`{ invoiceId }`) — `logger.warn` |
| `app/lib/auth/session.ts` | `console.log("[sessions] pruned …")` | `sessions.pruned` (`{ count }`) — `logger.info` |
| `app/lib/auth/session.ts` | `console.error("[sessions] prune failed")` | `sessions.prune_failed` (`{ ...errorMeta }`) |
| `app/routes/zaproszenie.$token.tsx` | `console.error("[onboarding] setMonthlyAmount failed")` | `onboarding.set_amount_failed` (`{ ...errorMeta }`) |
| `app/routes/podopieczny/sylwetka.tsx` | `console.error("[sylwetka] delete failed")` | `body_photo.delete_failed` (`{ ...errorMeta }`) |

Helpery `logSyncError`/`logCleanupError` stają się cienkimi wrapperami nad `logger.error`
(zachowują dotychczasowe miejsca wywołań i redakcję, eliminują zduplikowaną logikę kodu błędu).

## Obsługa błędów / zasady

- Logger **nigdy nie rzuca** (fallback `console.error` przy błędzie formatowania).
- Zero `message`/obiektów błędów w logach — whitelist `name`+`code` + auto-redakcja `Error` w `ctx`.
- `handleError` pomija `request.signal.aborted`.
- Poziomy: `info`/`warn`/`error`. JSON zawsze (także w dev — prostota i testowalność).

## Testy (TDD, bez DB)

- **`app/lib/logger.test.ts`:**
  - `formatLogLine`: zwraca poprawny JSON; zawiera `ts`/`level`/`event`; scala `ctx`; pusty `ctx` OK.
  - `errorMeta`: `Error` → `{name, code?}` (code z `code` albo `status`); **nie zawiera `message`**;
    nie-Error (`null`, `"str"`, `undefined`) → `{}` bez rzucania.
  - auto-redakcja: `formatLogLine(..., { err: new Error("secret bearer") })` NIE zawiera słowa
    z `message` — zamiast tego `name`/`code`.
  - `logger.error("x", {...})` woła `console.error` raz z linią zawierającą `"level":"error"` i `"event":"x"` (vi.spyOn).
  - `logUnhandled`: `request.signal.aborted=true` → `console.error` NIE wołany; nieaborted → wołany raz
    z linią zawierającą `"event":"unhandled"`, `"method"`, `"path"` (vi.spyOn). Sztuczny `Request`
    (z `AbortController` dla wariantu aborted).

## Pliki

| Plik | Zmiana |
|---|---|
| `app/lib/logger.ts` | **nowy** — `formatLogLine`, `errorMeta`, `logger`, `logUnhandled` |
| `app/lib/logger.test.ts` | **nowy** — testy jednostkowe (w tym `logUnhandled`) |
| `app/entry.server.tsx` | **nowy** — wygenerowany przez `react-router reveal` + eksport `handleError` (deleguje do `logUnhandled`) |
| `app/lib/google/sync.ts` | `logSyncError` → wrapper nad `logger.error` |
| `app/lib/stripe/subscriptions.ts` | `logCleanupError` → wrapper nad `logger.error` |
| `app/lib/rate-limit.ts` | `console.error` → `logger.error("rate_limit.enforce_failed", …)` |
| `app/routes/webhooks.stripe.tsx` | 2× `console.error` → `logger.error` |
| `app/lib/stripe/webhook.ts` | `console.warn` → `logger.warn` |
| `app/lib/auth/session.ts` | `console.log`/`console.error` → `logger.info`/`logger.error` |
| `app/routes/zaproszenie.$token.tsx` | `console.error` → `logger.error` |
| `app/routes/podopieczny/sylwetka.tsx` | `console.error` → `logger.error` |
| `app/lib/README.md` | dopisanie `logger.ts` |

## Poza zakresem (YAGNI / osobne)

- Sentry / alerting / pager (logger gotowy na dołożenie sinka później).
- Request-id / korelacja przez `AsyncLocalStorage`.
- Metryki, traces, instrumentacje RR7 (`instrumentations` export), sampling.
- Pretty-print w dev (JSON zawsze).
