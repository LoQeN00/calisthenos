# System płatności (subskrypcje Stripe Connect) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Podopieczny płaci trenerowi cykliczną, miesięczną subskrypcję przez Stripe (Connect Express, destination charges), trener ustala kwotę; status i historia płatności widoczne w obu panelach (bez gatingu dostępu).

**Architecture:** Marketplace od początku — każdy trener ma własne *connected account* (Express), customer i Price żyją na koncie **platformy**, subskrypcja tworzona na platformie z `transfer_data.destination` = konto trenera (`application_fee_percent` = 0, gotowe na później). UI płatności jest **hostowane przez Stripe** (Checkout do subskrypcji, Customer Portal do zarządzania); my trzymamy **lustro statusu** w bazie, aktualizowane **webhookami**. Brak danych karty u nas. Wzór połączenia per-trener naśladuje istniejące `google_calendar_connections` / `app/lib/google/`.

**Tech Stack:** React Router v7 (SSR, loadery/akcje), Drizzle ORM + PostgreSQL 16, `stripe` (oficjalny SDK Node), Zod, Vitest (unit + testcontainers itest), Biome.

Pełny spec: [`docs/superpowers/specs/2026-06-06-platnosci-stripe-design.md`](../specs/2026-06-06-platnosci-stripe-design.md).

---

## Zasady procesu (kalisthenos-dev-flow) — obowiązują w każdym tasku

- **Nigdy git, nigdy docker.** Zamiast „Commit" każdy task kończy się **review** (`/code-review`); commit/branch/push robi właściciel na końcu (handoff).
- **TDD** dla logiki bez DB (`npm run test:unit`). Testy integracyjne `*.itest.ts` w `tests/` — **piszemy, NIE uruchamiamy** (`npm run test:itest` odpala właściciel pod Dockerem).
- **`npm run db:generate`** po zmianie schematu (generuje SQL z `schema.ts`; **nie** edytujemy `migrations/` ręcznie). `db:migrate` odpala właściciel. Task 4 dodaje **tylko nowe tabele + nowy enum** (bez rename/drop) — `db:generate` jest wtedy nieinteraktywny.
- **`npm install stripe`** odpala **właściciel** — w planie tylko edytujemy `package.json` i sygnalizujemy w handoffie. Kod importujący `stripe` nie skompiluje się typecheckiem, dopóki właściciel nie zainstaluje — to oczekiwane i odnotowane przy taskach 1, 5–8.
- **Frontend/UI** prowadzi skill `frontend-design:frontend-design` (Task 9): kod tras to funkcjonalny szkielet (loadery/akcje — logika i autoryzacja), polish wizualny i zgodność z `design-system/README.md` + `app/styles/tokens.css` przez ten skill. UI po polsku.
- **Bezpieczeństwo:** feature dotyka `trainer_id`, sekretów Stripe i webhooka (podpis) → **`/security-review`** wymagany (Taski 4–9, finalnie Task 9). Sekrety **nigdy** w logach ani w danych loadera do klienta. Brak danych karty u nas.
- **Context7 (MCP)** po aktualne API (`stripe` Node SDK, Connect, Billing, RR7), gdy coś niepewne.

Komendy testów (z `package.json`):
- Unit: `npm run test:unit` (`vitest run app`). Pliki: `app/**/*.test.ts`. `globals: false` → importuj `{ describe, it, expect } from "vitest"`.
- Integ: `npm run test:itest` (`vitest run tests`, testcontainers). Pliki: `tests/**/*.itest.ts`. **Nie uruchamiamy.**

**Założenie TZ (v1):** instanty są w **UTC** (jedna strefa aplikacji), spójnie z resztą systemu (`fmtDateTime`).

**Stan wyjściowy (zweryfikowany w repo 2026-06-06):**
- `stripe` — **brak** w `package.json` (Task 1).
- `app/lib/stripe/` — **nie istnieje** (Taski 1, 3, 5, 6, 8).
- Tabele `stripe_connections` / `coaching_subscriptions` / `subscription_payments` i enum `subscription_status` — **nie istnieją** (Task 4).
- Zmienne `STRIPE_*` — **brak** w `app/lib/env.ts` i `.env.example` (Task 1).
- W env **są** już: `BASE_URL` (do URL-i powrotu Stripe), `SESSION_SECRET`.
- Wzór do naśladowania: `app/lib/google/connections.ts`, `app/routes/trener/integracje.google.tsx`, `app/lib/google/README.md`.

---

## Decyzje architektoniczne domknięte w tym planie (poza spec)

1. **Wywołania Stripe poza transakcją DB.** Stripe to I/O sieciowe — nigdy wewnątrz `db.transaction`. Repo mutuje natywnie; orkiestracja Stripe dzieje się w funkcjach repo sekwencyjnie (najpierw Stripe, potem zapis id-ków), z tolerancją na rollback.
2. **Powiązanie pary ↔ Stripe trzymamy redundantnie:** w `metadata` Checkout Session / Subscription (`trainerId`, `traineeId`) **oraz** przez zapis `stripe_customer_id`/`stripe_subscription_id` w naszej tabeli. Webhook potrafi odnaleźć parę po dowolnym z nich.
3. **Klient Stripe za cienkim getterem `getStripe()`** (jak `getEnv`), żeby itesty mogły go zamockować (`vi.mock("~/lib/stripe/client")`). Repo i webhook wołają `getStripe()`, nie konstruują klienta same.
4. **`apiVersion` przypięta** w `client.ts` (stała w kodzie) — przewidywalność mapowania pól.
5. **Webhook: jeden endpoint, jeden sekret na start.** `webhooks/stripe` przyjmuje eventy platformy (`invoice.*`, `customer.subscription.*`, `checkout.session.completed`) **oraz** eventy Connect (`account.updated`). W Stripe Dashboard endpoint skonfigurujemy jako nasłuchujący też eventów Connect; podpis weryfikujemy jednym `STRIPE_WEBHOOK_SECRET`. (Gdyby Dashboard wymusił osobny endpoint Connect → dodamy `STRIPE_CONNECT_WEBHOOK_SECRET` i drugą trasę; odnotowane w handoffie.)
6. **Status pary `none` przy samej ustalonej kwocie** — `setMonthlyAmount` bez aktywnej subskrypcji tylko zapisuje `amount_grosze`/`stripe_price_id`. Subskrypcja powstaje dopiero po Checkout podopiecznego.
7. **Mapper eventu webhooka → zamierzona zmiana jest czysty** (`mapEvent`, cel TDD), oddzielony od zapisu DB (`applyChange`).
8. **`STRIPE_*` opcjonalne w env** — aplikacja działa bez nich (`stripeConfigured()` false → UI „płatności niedostępne", brak prób wywołań).

---

## Struktura plików

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `package.json` | dodanie `stripe` | Modify |
| `app/lib/env.ts` | opcjonalne `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` + `stripeConfigured()` | Modify |
| `.env.example` | przykładowe zmienne Stripe | Modify |
| `app/lib/stripe/client.ts` | leniwy `getStripe()` z przypiętą `apiVersion` | Create |
| `app/lib/money.ts` | `fmtMoney`, `parsePlnToGrosze`, `MonthlyAmountSchema` | Create |
| `app/lib/money.test.ts` | TDD `money.ts` | Create |
| `app/lib/stripe/status.ts` | czyste mapowanie status Stripe → etykieta/ton | Create |
| `app/lib/stripe/status.test.ts` | TDD `status.ts` | Create |
| `app/lib/db/schema.ts` | enum + 3 tabele + typy | Modify |
| `app/lib/db/migrations/XXXX_*.sql` | migracja (generowana) | Create (`db:generate`) |
| `app/lib/stripe/connections.ts` | repo `stripe_connections` (tenant-scope trainerId) + Express onboarding | Create |
| `app/lib/stripe/subscriptions.ts` | repo `coaching_subscriptions` + orkiestracja Checkout/Portal/Price | Create |
| `app/lib/payments.ts` | księga `subscription_payments` (tenant-scope) | Create |
| `app/lib/stripe/webhook.ts` | `verifyAndParse` + czysty `mapEvent` + `applyChange` | Create |
| `app/lib/stripe/webhook.test.ts` | TDD czystego `mapEvent` | Create |
| `app/lib/stripe/README.md` | dokumentacja katalogu (nowy) | Create |
| `app/routes/trener/integracje.stripe.tsx` | status połączenia + Połącz/return/refresh | Create |
| `app/routes/trener/podopieczni.$traineeId.platnosci.tsx` | ustaw kwotę, status, historia, zakończ | Create |
| `app/routes/podopieczny/platnosci.tsx` | subskrybuj (Checkout), zarządzaj (Portal), status, historia | Create |
| `app/routes/webhooks.stripe.tsx` | endpoint webhooka (action POST, bez sesji) | Create |
| `app/routes.ts` | wpisy 4 nowych tras | Modify |
| `app/routes/trener/_layout.tsx` | link „Integracje"/„Płatności" w nawigacji (jeśli brak) | Modify |
| `app/routes/podopieczny/_layout.tsx` | link „Płatności" + badge `past_due`/`none` | Modify |
| `tests/stripe-subscriptions.itest.ts` | tenant-scope + `setMonthlyAmount` (PISZEMY/nie uruchamiamy) | Create |
| `tests/stripe-webhook.itest.ts` | idempotencja księgi (PISZEMY/nie uruchamiamy) | Create |
| `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `app/routes/README.md`, `CLAUDE.md`, `README.md` (root) | dokumentacja | Modify |
| `app/components/icons.tsx` | ikona `Card`/`Payments` (jeśli brak) | Modify (opcjonalnie) |

---

## Task 1: Zależności + zmienne środowiskowe + klient Stripe

**Files:**
- Modify: `package.json`
- Modify: `app/lib/env.ts`
- Modify: `.env.example`
- Create: `app/lib/stripe/client.ts`

- [ ] **Step 1: Dodaj zależność do `package.json`**

W sekcji `"dependencies"` (zachowaj porządek alfabetyczny sąsiadów) dodaj:

```json
    "stripe": "^19.1.0",
```

> Wersja przykładowa (aktualna linia SDK na 2026-06); właściciel zweryfikuje przy `npm install`. Oficjalny SDK Node Stripe.

- [ ] **Step 2: Rozszerz `EnvSchema` o opcjonalne zmienne Stripe**

W `app/lib/env.ts` w `EnvSchema` dodaj (po blokach Google):

```ts
  // Płatności Stripe (opcjonalne — aplikacja działa bez nich).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
```

Na końcu pliku (po `googleConfigured`) dodaj helper:

```ts
/** True, gdy sekrety Stripe są ustawione (klucz API + sekret webhooka). */
export function stripeConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET);
}
```

- [ ] **Step 3: Dopisz zmienne do `.env.example`**

```dotenv
# Płatności Stripe (opcjonalne). Klucz platformy + sekret podpisu webhooka.
# Lokalnie webhook: `stripe listen --forward-to localhost:3000/webhooks/stripe`
# (sekret z outputu `stripe listen` wpisz do STRIPE_WEBHOOK_SECRET).
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

- [ ] **Step 4: Utwórz leniwy klient `app/lib/stripe/client.ts`**

```ts
import Stripe from "stripe";
import { getEnv } from "~/lib/env";

// Przypięta wersja API — przewidywalne mapowanie pól w webhooku/orkiestracji.
export const STRIPE_API_VERSION = "2025-09-30.clover" as const;

let cached: Stripe | null = null;

/** Leniwy klient Stripe (platforma). Rzuca, gdy brak STRIPE_SECRET_KEY. */
export function getStripe(): Stripe {
  if (!cached) {
    const key = getEnv().STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY nie jest ustawiony");
    cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return cached;
}
```

> Wartość `STRIPE_API_VERSION` zweryfikuj context7 (`/stripe/stripe-node`) przy implementacji — wpisz wersję zgodną z zainstalowanym SDK.

- [ ] **Step 5: Typecheck (oczekiwany błąd importu `stripe` do czasu `npm install`)**

Run: `npm run typecheck`
Expected: błędy tylko o braku modułu `stripe` (właściciel doinstaluje). Reszta zielona.

- [ ] **Step 6: Review**

`/code-review` na zmianach. Handoff-nota: **nowa zależność `stripe`** (właściciel: `npm install`).

---

## Task 2: `app/lib/money.ts` — formatowanie i walidacja kwoty (TDD)

**Files:**
- Create: `app/lib/money.ts`
- Test: `app/lib/money.test.ts`

- [ ] **Step 1: Napisz failujący test**

```ts
import { describe, it, expect } from "vitest";
import { fmtMoney, parsePlnToGrosze, MonthlyAmountSchema } from "~/lib/money";

describe("fmtMoney", () => {
  it("formatuje grosze jako PLN po polsku", () => {
    expect(fmtMoney(12345, "pln")).toBe("123,45 zł");
    expect(fmtMoney(20000, "pln")).toBe("200,00 zł");
    expect(fmtMoney(0, "pln")).toBe("0,00 zł");
  });
});

describe("parsePlnToGrosze", () => {
  it("zamienia złotówki (string) na grosze", () => {
    expect(parsePlnToGrosze("200")).toBe(20000);
    expect(parsePlnToGrosze("200,50")).toBe(20050);
    expect(parsePlnToGrosze("200.50")).toBe(20050);
  });
  it("odrzuca śmieci jako null", () => {
    expect(parsePlnToGrosze("abc")).toBeNull();
    expect(parsePlnToGrosze("")).toBeNull();
  });
});

describe("MonthlyAmountSchema", () => {
  it("przyjmuje kwotę w groszach w dozwolonym zakresie", () => {
    expect(MonthlyAmountSchema.parse(20000)).toBe(20000);
  });
  it("odrzuca poniżej minimum (200 gr = 2 zł) i wartości niecałkowite", () => {
    expect(MonthlyAmountSchema.safeParse(100).success).toBe(false);
    expect(MonthlyAmountSchema.safeParse(199).success).toBe(false);
    expect(MonthlyAmountSchema.safeParse(1.5).success).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm run test:unit -- money`
Expected: FAIL („is not a function" / brak eksportu).

- [ ] **Step 3: Implementacja `app/lib/money.ts`**

```ts
import { z } from "zod";

const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
});

/** Formatuje kwotę w groszach na polski zapis waluty, np. 12345 → "123,45 zł". */
export function fmtMoney(grosze: number, _currency: "pln" = "pln"): string {
  //   (twarda spacja z Intl) → zwykła spacja dla stabilnych testów/sygnatur.
  return PLN.format(grosze / 100).replace(/ /g, " ");
}

/** "200,50" | "200.50" | "200" → grosze (20050). Null gdy nie-liczba. */
export function parsePlnToGrosze(input: string): number | null {
  const norm = input.trim().replace(",", ".");
  if (norm === "" || !/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}

// Minimum 2 zł (200 gr), maksimum 100 000 zł — sanity przeciw literówkom.
export const MonthlyAmountSchema = z
  .number()
  .int("Kwota musi być liczbą całkowitą groszy.")
  .min(200, "Minimalna kwota to 2 zł.")
  .max(10_000_000, "Maksymalna kwota to 100 000 zł.");
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit -- money`
Expected: PASS.

- [ ] **Step 5: Format + review**

`npx biome format --write app/lib/money.ts app/lib/money.test.ts`, potem `/code-review`.

---

## Task 3: `app/lib/stripe/status.ts` — prezentacja statusu (TDD)

**Files:**
- Create: `app/lib/stripe/status.ts`
- Test: `app/lib/stripe/status.test.ts`

- [ ] **Step 1: Napisz failujący test**

```ts
import { describe, it, expect } from "vitest";
import { subscriptionPresentation, mapStripeStatus } from "~/lib/stripe/status";

describe("mapStripeStatus", () => {
  it("mapuje znane statusy Stripe na nasz enum", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("trialing")).toBe("active");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
  it("nieznany status → 'incomplete' (bezpieczny domyślny)", () => {
    expect(mapStripeStatus("future_status_xyz")).toBe("incomplete");
  });
});

describe("subscriptionPresentation", () => {
  it("daje polską etykietę i ton dla statusu", () => {
    expect(subscriptionPresentation("active")).toEqual({ label: "Aktywna", tone: "ok" });
    expect(subscriptionPresentation("past_due")).toEqual({ label: "Zaległość", tone: "warn" });
    expect(subscriptionPresentation("none")).toEqual({ label: "Brak subskrypcji", tone: "neutral" });
    expect(subscriptionPresentation("canceled")).toEqual({ label: "Anulowana", tone: "neutral" });
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm run test:unit -- status`
Expected: FAIL.

- [ ] **Step 3: Implementacja `app/lib/stripe/status.ts`**

```ts
// Nasz enum statusu (lustro Stripe + 'none'). Trzymany też w schema.ts.
export type SubscriptionStatus =
  | "none"
  | "incomplete"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type StatusTone = "ok" | "warn" | "neutral";
export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const KNOWN: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "paused",
};

/** Stripe `Subscription.status` (string) → nasz enum. Nieznane → 'incomplete' (logujemy w callerze). */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  return KNOWN[stripeStatus] ?? "incomplete";
}

const PRESENTATION: Record<SubscriptionStatus, StatusPresentation> = {
  none: { label: "Brak subskrypcji", tone: "neutral" },
  incomplete: { label: "Nieukończona", tone: "warn" },
  active: { label: "Aktywna", tone: "ok" },
  past_due: { label: "Zaległość", tone: "warn" },
  unpaid: { label: "Nieopłacona", tone: "warn" },
  canceled: { label: "Anulowana", tone: "neutral" },
  paused: { label: "Wstrzymana", tone: "neutral" },
};

export function subscriptionPresentation(status: SubscriptionStatus): StatusPresentation {
  return PRESENTATION[status];
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit -- status`
Expected: PASS.

- [ ] **Step 5: Format + review**

`npx biome format --write app/lib/stripe/status.ts app/lib/stripe/status.test.ts`, potem `/code-review`.

---

## Task 4: Schemat — enum + 3 tabele + typy

**Files:**
- Modify: `app/lib/db/schema.ts`
- Create: `app/lib/db/migrations/XXXX_*.sql` (przez `db:generate`)

- [ ] **Step 1: Dodaj enum (sekcja Enums)**

```ts
export const subscriptionStatus = pgEnum("subscription_status", [
  "none",
  "incomplete",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
```

- [ ] **Step 2: Dodaj tabelę `stripe_connections`** (po sekcji Consultations/Skills)

```ts
export const stripeConnections = pgTable("stripe_connections", {
  trainerId: uuid("trainer_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  detailsSubmitted: boolean("details_submitted").notNull().default(false),
  country: text("country"),
  defaultCurrency: text("default_currency"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Dodaj tabelę `coaching_subscriptions`**

```ts
export const coachingSubscriptions = pgTable(
  "coaching_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountGrosze: integer("amount_grosze").notNull(),
    currency: text("currency").notNull().default("pln"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: subscriptionStatus("status").notNull().default("none"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairUniq: uniqueIndex("coaching_subscriptions_pair_uniq").on(t.trainerId, t.traineeId),
    subUniq: uniqueIndex("coaching_subscriptions_sub_uniq")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} IS NOT NULL`),
    trainerStatusIdx: index("coaching_subscriptions_trainer_status_idx").on(t.trainerId, t.status),
    amountCheck: check("coaching_subscriptions_amount_check", sql`${t.amountGrosze} >= 0`),
  }),
);
```

- [ ] **Step 4: Dodaj tabelę `subscription_payments`**

```ts
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    amountGrosze: integer("amount_grosze").notNull(),
    currency: text("currency").notNull().default("pln"),
    status: text("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceUniq: uniqueIndex("subscription_payments_invoice_uniq").on(t.stripeInvoiceId),
    traineeCreatedIdx: index("subscription_payments_trainee_created_idx").on(t.traineeId, t.createdAt),
  }),
);
```

- [ ] **Step 5: Dodaj typy (sekcja Types, koniec pliku)**

```ts
export type StripeConnection = typeof stripeConnections.$inferSelect;
export type NewStripeConnection = typeof stripeConnections.$inferInsert;
export type CoachingSubscription = typeof coachingSubscriptions.$inferSelect;
export type NewCoachingSubscription = typeof coachingSubscriptions.$inferInsert;
export type SubscriptionStatusDb = (typeof subscriptionStatus.enumValues)[number];
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
export type NewSubscriptionPayment = typeof subscriptionPayments.$inferInsert;
```

> `boolean`, `integer`, `check`, `index`, `uniqueIndex`, `sql` są już importowane w `schema.ts` — nie dodawaj duplikatów.

- [ ] **Step 6: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: nowy plik `app/lib/db/migrations/XXXX_*.sql` z `CREATE TYPE subscription_status` i `CREATE TABLE` ×3. **Tylko nowe obiekty** → brak pytań interaktywnych. **Nie edytuj** wygenerowanego SQL.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: zielono (poza znanym brakiem `stripe` z Taska 1, jeśli właściciel jeszcze nie zainstalował).

- [ ] **Step 8: Review**

`/code-review`. Handoff-nota: **migracja do uruchomienia** (`npm run db:migrate` — właściciel).

---

## Task 5: Połączenie Connect — repo + trasa + onboarding

**Files:**
- Create: `app/lib/stripe/connections.ts`
- Create: `app/routes/trener/integracje.stripe.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/_layout.tsx` (link, jeśli brak)
- Create: `tests/stripe-subscriptions.itest.ts` (część tenant-scope połączeń; PISZEMY/nie uruchamiamy)

Wzór: `app/lib/google/connections.ts` + `app/routes/trener/integracje.google.tsx`.

- [ ] **Step 1: Implementacja `app/lib/stripe/connections.ts`**

```ts
import { eq } from "drizzle-orm";
import { getStripe } from "~/lib/stripe/client";
import { getEnv } from "~/lib/env";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export interface ConnectionStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

/** Status połączenia trenera (bezpieczny do loadera). Tenant-scope: trainerId. */
export async function getConnectionStatus(db: Db, trainerId: string): Promise<ConnectionStatus> {
  const [row] = await db
    .select()
    .from(schema.stripeConnections)
    .where(eq(schema.stripeConnections.trainerId, trainerId))
    .limit(1);
  return {
    connected: Boolean(row),
    stripeAccountId: row?.stripeAccountId ?? null,
    chargesEnabled: row?.chargesEnabled ?? false,
    detailsSubmitted: row?.detailsSubmitted ?? false,
  };
}

/** Pobiera surowy wiersz połączenia (do orkiestracji — zawiera account id). Tenant-scope. */
export async function getConnectionRow(db: Db, trainerId: string) {
  const [row] = await db
    .select()
    .from(schema.stripeConnections)
    .where(eq(schema.stripeConnections.trainerId, trainerId))
    .limit(1);
  return row ?? null;
}

/**
 * Zwraca istniejące connected account trenera albo tworzy nowe (Express) i zapisuje.
 * Tenant-scope: trainerId. Zwraca stripeAccountId.
 */
export async function ensureExpressAccount(db: Db, trainerId: string, email: string): Promise<string> {
  const existing = await getConnectionRow(db, trainerId);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email,
    metadata: { trainerId },
  });
  await db.insert(schema.stripeConnections).values({
    trainerId,
    stripeAccountId: account.id,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
  });
  return account.id;
}

/** Tworzy Account Link do onboardingu Express. */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const base = getEnv().BASE_URL.replace(/\/$/, "");
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${base}/trener/integracje/stripe?refresh=1`,
    return_url: `${base}/trener/integracje/stripe?return=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Aktualizuje flagi z eventu account.updated. Tenant-scope: po stripe_account_id. */
export async function applyAccountUpdate(
  db: Db,
  account: { id: string; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean },
): Promise<void> {
  await db
    .update(schema.stripeConnections)
    .set({
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      updatedAt: new Date(),
    })
    .where(eq(schema.stripeConnections.stripeAccountId, account.id));
}
```

> Sygnatury metod SDK (`accounts.create`, `accountLinks.create`) zweryfikuj context7 (`/websites/stripe` — „Connect Express onboarding") przy implementacji.

- [ ] **Step 2: Trasa `app/routes/trener/integracje.stripe.tsx`** (loader/action — szkielet, UI w Tasku 9)

Loader: `requireUser({role:"trainer"})`, zwraca `{ configured: stripeConfigured(), status, email: user.email }`.
Action intencje:
- `connect`: jeśli `!stripeConfigured()` → `{ error }`; inaczej `ensureExpressAccount(db, user.id, user.email)` → `createOnboardingLink(accountId)` → `redirect(url)`.
- (return/refresh obsługiwane są przez query params w loaderze — status odświeża się sam; `account.updated` aktualizuje flagi w tle.)

```tsx
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  if (fd.get("intent") === "connect") {
    if (!stripeConfigured()) return { error: "Płatności nie są skonfigurowane na serwerze." };
    const accountId = await ensureExpressAccount(db, user.id, user.email);
    return redirect(await createOnboardingLink(accountId));
  }
  return null;
}
```

UI (szkielet, polish w Tasku 9): baner `?return=1`/`?refresh=1`, status („Połączone, płatności aktywne" gdy `chargesEnabled`; „Dokończ konfigurację" gdy `detailsSubmitted=false`), przycisk „Połącz ze Stripe"/„Dokończ konfigurację" (Form POST `intent=connect`).

- [ ] **Step 3: Wpis w `app/routes.ts`** (w bloku `prefix("trener", [...])`, przy `integracje/google`)

```ts
route("integracje/stripe", "routes/trener/integracje.stripe.tsx"),
```

- [ ] **Step 4: Link w nawigacji `_layout.tsx`** — dodaj pozycję „Integracje/Płatności" jeśli sekcja integracji jeszcze jej nie zawiera (sprawdź; integracja Google już dodała „Integracje").

- [ ] **Step 5: Itest tenant-scope (PISZEMY, nie uruchamiamy) — `tests/stripe-subscriptions.itest.ts`**

Mock klienta: `vi.mock("~/lib/stripe/client", () => ({ getStripe: () => fakeStripe, STRIPE_API_VERSION: "x" }))`.
Test: dwóch trenerów; `getConnectionRow(db, trainerA)` nie widzi połączenia trenera B; `applyAccountUpdate` aktualizuje właściwy wiersz po `stripe_account_id`.

- [ ] **Step 6: Typecheck + lint + review**

Run: `npm run typecheck`; `npm run lint`. Expected: zielono (poza znanym `stripe` przed `npm install`).
`/code-review`. **`/security-review`** (dotyka `trainer_id` + Connect).

---

## Task 6: Cennik — repo subskrypcji + `setMonthlyAmount` + trasa trenera

**Files:**
- Create: `app/lib/stripe/subscriptions.ts`
- Create: `app/lib/payments.ts`
- Create: `app/routes/trener/podopieczni.$traineeId.platnosci.tsx`
- Modify: `app/routes.ts`
- Modify: `tests/stripe-subscriptions.itest.ts` (dopisz `setMonthlyAmount`)

- [ ] **Step 1: `app/lib/payments.ts` — księga (tenant-scope)**

```ts
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export interface InvoiceRecord {
  trainerId: string;
  traineeId: string;
  stripeInvoiceId: string;
  amountGrosze: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  hostedInvoiceUrl: string | null;
}

/** Upsert faktury po stripe_invoice_id (idempotencja webhooka). */
export async function recordInvoice(db: Db, rec: InvoiceRecord): Promise<void> {
  await db
    .insert(schema.subscriptionPayments)
    .values(rec)
    .onConflictDoUpdate({
      target: schema.subscriptionPayments.stripeInvoiceId,
      set: {
        amountGrosze: rec.amountGrosze,
        status: rec.status,
        paidAt: rec.paidAt,
        periodStart: rec.periodStart,
        periodEnd: rec.periodEnd,
        hostedInvoiceUrl: rec.hostedInvoiceUrl,
      },
    });
}

export async function listPaymentsForTrainee(db: Db, traineeId: string, limit = 24) {
  return db
    .select()
    .from(schema.subscriptionPayments)
    .where(eq(schema.subscriptionPayments.traineeId, traineeId))
    .orderBy(desc(schema.subscriptionPayments.createdAt))
    .limit(limit);
}

export async function listPaymentsForPair(db: Db, trainerId: string, traineeId: string, limit = 24) {
  return db
    .select()
    .from(schema.subscriptionPayments)
    .where(
      and(
        eq(schema.subscriptionPayments.trainerId, trainerId),
        eq(schema.subscriptionPayments.traineeId, traineeId),
      ),
    )
    .orderBy(desc(schema.subscriptionPayments.createdAt))
    .limit(limit);
}
```

- [ ] **Step 2: `app/lib/stripe/subscriptions.ts` — repo + orkiestracja**

Klucze funkcji (tenant-scope `trainerId`/`traineeId`; brak dostępu → caller robi 404):

```ts
import { and, eq } from "drizzle-orm";
import { getStripe } from "~/lib/stripe/client";
import { mapStripeStatus } from "~/lib/stripe/status";
import { getConnectionRow } from "~/lib/stripe/connections";
import { getEnv } from "~/lib/env";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class SubscriptionError extends Error {}

/** Wiersz pary trener+podopieczny (lub null). Tenant-scope. */
export async function getSubscriptionForPair(db: Db, trainerId: string, traineeId: string) {
  const [row] = await db
    .select()
    .from(schema.coachingSubscriptions)
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, trainerId),
        eq(schema.coachingSubscriptions.traineeId, traineeId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Ustala miesięczną kwotę. Tworzy/aktualizuje Stripe Price (na koncie platformy)
 * i upsertuje wiersz pary. Gdy subskrypcja aktywna — podmienia item na nowy Price
 * (proration_behavior: 'none', od następnego cyklu). Gdy brak — tylko zapis.
 */
export async function setMonthlyAmount(
  db: Db,
  trainerId: string,
  traineeId: string,
  amountGrosze: number,
): Promise<void> {
  const stripe = getStripe();
  const existing = await getSubscriptionForPair(db, trainerId, traineeId);

  // Price są niemutowalne — tworzymy nowy przy każdej zmianie kwoty.
  const price = await stripe.prices.create({
    currency: "pln",
    unit_amount: amountGrosze,
    recurring: { interval: "month" },
    product_data: { name: "Prowadzenie treningowe" },
    metadata: { trainerId, traineeId },
  });

  if (!existing) {
    await db.insert(schema.coachingSubscriptions).values({
      trainerId,
      traineeId,
      amountGrosze,
      stripePriceId: price.id,
      status: "none",
    });
    return;
  }

  await db
    .update(schema.coachingSubscriptions)
    .set({ amountGrosze, stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, existing.id));

  // Gdy subskrypcja aktywna — podmień item na nowy Price od następnego cyklu.
  if (existing.stripeSubscriptionId && (existing.status === "active" || existing.status === "past_due")) {
    const sub = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        items: [{ id: itemId, price: price.id }],
        proration_behavior: "none",
      });
    }
  }
}

/** Tworzy (lub zwraca) customer podopiecznego na koncie PLATFORMY. */
export async function ensureCustomer(
  db: Db,
  row: typeof schema.coachingSubscriptions.$inferSelect,
  traineeEmail: string,
  traineeName: string,
): Promise<string> {
  if (row.stripeCustomerId) return row.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email: traineeEmail,
    name: traineeName,
    metadata: { trainerId: row.trainerId, traineeId: row.traineeId },
  });
  await db
    .update(schema.coachingSubscriptions)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
  return customer.id;
}

/**
 * Checkout Session (mode: subscription) z destination charges do konta trenera.
 * application_fee_percent = 0 (gotowe na później). Zwraca URL do redirectu.
 */
export async function createCheckoutSession(
  db: Db,
  args: { trainerId: string; traineeId: string; traineeEmail: string; traineeName: string },
): Promise<string> {
  const row = await getSubscriptionForPair(db, args.trainerId, args.traineeId);
  if (!row || !row.stripePriceId) throw new SubscriptionError("Trener nie ustalił jeszcze kwoty.");
  const conn = await getConnectionRow(db, args.trainerId);
  if (!conn || !conn.chargesEnabled) throw new SubscriptionError("Trener nie ma aktywnych płatności.");

  const customerId = await ensureCustomer(db, row, args.traineeEmail, args.traineeName);
  const base = getEnv().BASE_URL.replace(/\/$/, "");

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: row.stripePriceId, quantity: 1 }],
    subscription_data: {
      transfer_data: { destination: conn.stripeAccountId },
      application_fee_percent: 0,
      metadata: { trainerId: args.trainerId, traineeId: args.traineeId },
    },
    metadata: { trainerId: args.trainerId, traineeId: args.traineeId },
    success_url: `${base}/podopieczny/platnosci?ok=1`,
    cancel_url: `${base}/podopieczny/platnosci?canceled=1`,
  });
  if (!session.url) throw new SubscriptionError("Nie udało się utworzyć sesji płatności.");
  return session.url;
}

/** Billing Customer Portal (zmiana karty, anulowanie, faktury). Zwraca URL. */
export async function createPortalSession(db: Db, trainerId: string, traineeId: string): Promise<string> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeCustomerId) throw new SubscriptionError("Brak konta płatności.");
  const base = getEnv().BASE_URL.replace(/\/$/, "");
  const portal = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${base}/podopieczny/platnosci`,
  });
  return portal.url;
}

/** Trener kończy subskrypcję (anuluje od razu). */
export async function cancelSubscription(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) throw new SubscriptionError("Brak aktywnej subskrypcji.");
  await getStripe().subscriptions.cancel(row.stripeSubscriptionId);
  // Status zaktualizuje webhook customer.subscription.deleted; ustawiamy też lokalnie defensywnie.
  await db
    .update(schema.coachingSubscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}

/** Setter statusu używany przez webhook (z mapStripeStatus). */
export async function applySubscriptionUpdate(
  db: Db,
  args: {
    stripeSubscriptionId: string;
    stripeStatus: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
): Promise<void> {
  await db
    .update(schema.coachingSubscriptions)
    .set({
      status: mapStripeStatus(args.stripeStatus),
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(schema.coachingSubscriptions.stripeSubscriptionId, args.stripeSubscriptionId));
}

/** Powiązanie po Checkout: zapisuje customer + subscription id na parze (z metadanych sesji). */
export async function linkCheckoutResult(
  db: Db,
  args: { trainerId: string; traineeId: string; customerId: string; subscriptionId: string },
): Promise<void> {
  await db
    .update(schema.coachingSubscriptions)
    .set({
      stripeCustomerId: args.customerId,
      stripeSubscriptionId: args.subscriptionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, args.trainerId),
        eq(schema.coachingSubscriptions.traineeId, args.traineeId),
      ),
    );
}
```

> Wszystkie wywołania SDK (`prices.create`, `checkout.sessions.create` z `subscription_data.transfer_data`, `billingPortal.sessions.create`, `subscriptions.update/cancel/retrieve`) zweryfikuj context7 (`/websites/stripe` — „Connect subscriptions destination charges", „Customer Portal") przy implementacji. Wzorzec destination charges potwierdzony w spec.

- [ ] **Step 3: Trasa trenera `podopieczni.$traineeId.platnosci.tsx`** (loader/action — szkielet, UI w Tasku 9)

Loader: `requireUser({role:"trainer"})` → `assertTraineeOwnedBy(db, user.id, traineeId)` (z `~/lib/trainees`; brak → 404) → zwraca `{ sub: getSubscriptionForPair, payments: listPaymentsForPair, presentation }`.
Action intencje:
- `set-amount`: `parsePlnToGrosze(fd.amount)` → `MonthlyAmountSchema.safeParse` → `setMonthlyAmount(...)`; błąd walidacji → `{ error }`.
- `cancel`: `cancelSubscription(db, user.id, traineeId)`.

```tsx
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId!;
  await assertTraineeOwnedBy(db, user.id, traineeId); // rzuca 404 przy obcym
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent === "set-amount") {
    const grosze = parsePlnToGrosze(String(fd.get("amount") ?? ""));
    const parsed = grosze === null ? null : MonthlyAmountSchema.safeParse(grosze);
    if (!parsed || !parsed.success) return { error: "Podaj poprawną kwotę (min. 2 zł)." };
    await setMonthlyAmount(db, user.id, traineeId, parsed.data);
    return { success: "Kwota zapisana." };
  }
  if (intent === "cancel") {
    await cancelSubscription(db, user.id, traineeId);
    return { success: "Subskrypcja zakończona." };
  }
  return null;
}
```

> Sprawdź dokładną sygnaturę `assertTraineeOwnedBy` w `app/lib/trainees.ts` (README wymienia ją jako guard). Jeśli zwraca wartość zamiast rzucać — opakuj w 404 (`throw new Response(null,{status:404})`).

- [ ] **Step 4: Wpis w `app/routes.ts`** (w bloku podopiecznych trenera)

```ts
route("podopieczni/:traineeId/platnosci", "routes/trener/podopieczni.$traineeId.platnosci.tsx"),
```

- [ ] **Step 5: Dopisz itest `setMonthlyAmount` (PISZEMY/nie uruchamiamy)**

W `tests/stripe-subscriptions.itest.ts` (mock `getStripe`): `setMonthlyAmount` bez wiersza tworzy `none` + `amount_grosze`; ponowne wywołanie aktualizuje kwotę; tenant-scope (`getSubscriptionForPair` obcego trenera → null).

- [ ] **Step 6: Typecheck + lint + review + security**

`npm run typecheck`; `npm run lint`; `/code-review`; **`/security-review`** (tenant-scope, pieniądze).

---

## Task 7: Subskrypcja po stronie podopiecznego — trasa (Checkout/Portal)

**Files:**
- Create: `app/routes/podopieczny/platnosci.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/podopieczny/_layout.tsx` (link „Płatności" + badge)

- [ ] **Step 1: Trasa `app/routes/podopieczny/platnosci.tsx`** (loader/action — szkielet, UI w Tasku 9)

Loader: `requireUser({role:"trainee"})`; `trainerId = user.trainerId`; zwraca `{ sub: getSubscriptionForPair(db, trainerId, user.id), payments: listPaymentsForTrainee(db, user.id), presentation }`.
Action intencje:
- `subscribe`: `createCheckoutSession({ trainerId, traineeId:user.id, traineeEmail:user.email, traineeName:user.displayName })` → `redirect(url)`. Błąd `SubscriptionError` → `{ error: e.message }`.
- `portal`: `createPortalSession(db, trainerId, user.id)` → `redirect(url)`.

```tsx
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const trainerId = user.trainerId!;
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "subscribe") {
      const url = await createCheckoutSession(db, {
        trainerId,
        traineeId: user.id,
        traineeEmail: user.email,
        traineeName: user.displayName,
      });
      return redirect(url);
    }
    if (intent === "portal") {
      return redirect(await createPortalSession(db, trainerId, user.id));
    }
  } catch (e) {
    if (e instanceof SubscriptionError) return { error: e.message };
    throw e;
  }
  return null;
}
```

> Potwierdź pola `AuthUser` (`trainerId`, `email`, `displayName`) w `app/lib/auth/index.ts`. Jeśli `email`/`displayName` nie są w `AuthUser`, dociągnij z `users` w loaderze/akcji.

UI (szkielet, polish w Tasku 9): karta z kwotą (`fmtMoney(sub.amountGrosze)`) i statusem (`subscriptionPresentation`), baner `?ok=1`/`?canceled=1`; gdy `status==='none'` i jest kwota → przycisk „Subskrybuj" (`intent=subscribe`); gdy aktywna → „Zarządzaj płatnościami" (`intent=portal`) + `current_period_end`; gdy brak ustalonej kwoty → „Trener nie ustalił jeszcze kwoty"; lista historii (`payments`, `hosted_invoice_url`).

- [ ] **Step 2: Wpis w `app/routes.ts`** (w bloku `prefix("podopieczny", [...])`)

```ts
route("platnosci", "routes/podopieczny/platnosci.tsx"),
```

- [ ] **Step 3: Nawigacja + badge w `podopieczny/_layout.tsx`**

Dodaj pozycję „Płatności". W loaderze layoutu policz status pary (`getSubscriptionForPair`) i pokaż badge gdy `status` ∈ {`past_due`,`unpaid`,`none`} (akcja wymagana) — wzór licznika „Konsultacje" (`countPendingForTrainee`).

- [ ] **Step 4: Typecheck + lint + review + security**

`npm run typecheck`; `npm run lint`; `/code-review`; **`/security-review`** (podopieczny działa tylko na swojej subskrypcji; redirecty Stripe).

---

## Task 8: Webhook — weryfikacja podpisu, czysty mapper (TDD), zapis

**Files:**
- Create: `app/lib/stripe/webhook.ts`
- Test: `app/lib/stripe/webhook.test.ts`
- Create: `app/routes/webhooks.stripe.tsx`
- Modify: `app/routes.ts`
- Create: `tests/stripe-webhook.itest.ts` (idempotencja; PISZEMY/nie uruchamiamy)

- [ ] **Step 1: Napisz failujący test czystego `mapEvent`**

```ts
import { describe, it, expect } from "vitest";
import { mapEvent } from "~/lib/stripe/webhook";

describe("mapEvent", () => {
  it("invoice.paid → wpis do księgi ze statusem paid", () => {
    const change = mapEvent({
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          amount_paid: 20000,
          currency: "pln",
          status: "paid",
          status_transitions: { paid_at: 1_700_000_000 },
          period_start: 1_699_000_000,
          period_end: 1_701_000_000,
          hosted_invoice_url: "https://pay/x",
          subscription_details: { metadata: { trainerId: "t1", traineeId: "u1" } },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "invoice",
      trainerId: "t1",
      traineeId: "u1",
      stripeInvoiceId: "in_1",
      amountGrosze: 20000,
      currency: "pln",
      status: "paid",
      paidAt: new Date(1_700_000_000 * 1000),
      periodStart: new Date(1_699_000_000 * 1000),
      periodEnd: new Date(1_701_000_000 * 1000),
      hostedInvoiceUrl: "https://pay/x",
    });
  });

  it("customer.subscription.updated → zmiana statusu", () => {
    const change = mapEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          cancel_at_period_end: false,
          current_period_end: 1_701_000_000,
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "subscription",
      stripeSubscriptionId: "sub_1",
      stripeStatus: "past_due",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
    });
  });

  it("typ nieobsługiwany → null", () => {
    expect(mapEvent({ type: "ping", data: { object: {} } } as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm run test:unit -- webhook`
Expected: FAIL.

- [ ] **Step 3: Implementacja `app/lib/stripe/webhook.ts`**

`verifyAndParse` (cienka otoczka `stripe.webhooks.constructEvent`), `mapEvent` (czysty), `applyChange` (zapis przez `recordInvoice`/`applySubscriptionUpdate`/`linkCheckoutResult`/`applyAccountUpdate`).

```ts
import type Stripe from "stripe";
import { getStripe } from "~/lib/stripe/client";
import { getEnv } from "~/lib/env";
import type { Db } from "~/lib/db/client";
import { recordInvoice } from "~/lib/payments";
import { applySubscriptionUpdate, linkCheckoutResult } from "~/lib/stripe/subscriptions";
import { applyAccountUpdate } from "~/lib/stripe/connections";

/** Weryfikuje podpis i zwraca event. Rzuca, gdy podpis zły (caller → 400). */
export function verifyAndParse(rawBody: string, signature: string): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET nie jest ustawiony");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

export type Change =
  | {
      kind: "invoice";
      trainerId: string | null;
      traineeId: string | null;
      stripeInvoiceId: string;
      amountGrosze: number;
      currency: string;
      status: string;
      paidAt: Date | null;
      periodStart: Date | null;
      periodEnd: Date | null;
      hostedInvoiceUrl: string | null;
    }
  | {
      kind: "subscription";
      stripeSubscriptionId: string;
      stripeStatus: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
    }
  | { kind: "checkout"; trainerId: string; traineeId: string; customerId: string; subscriptionId: string }
  | {
      kind: "account";
      accountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
    };

const secs = (s: number | null | undefined): Date | null =>
  typeof s === "number" ? new Date(s * 1000) : null;

/** Czysta funkcja: event Stripe → zamierzona zmiana (lub null gdy nieobsługiwany). */
export function mapEvent(event: Stripe.Event): Change | null {
  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const inv = event.data.object as Record<string, unknown> & {
        id: string;
        amount_paid?: number;
        amount_due?: number;
        currency: string;
        status: string;
        status_transitions?: { paid_at?: number | null };
        period_start?: number;
        period_end?: number;
        hosted_invoice_url?: string | null;
        subscription_details?: { metadata?: Record<string, string> };
      };
      const meta = inv.subscription_details?.metadata ?? {};
      return {
        kind: "invoice",
        trainerId: meta.trainerId ?? null,
        traineeId: meta.traineeId ?? null,
        stripeInvoiceId: inv.id,
        amountGrosze: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency,
        status: inv.status,
        paidAt: secs(inv.status_transitions?.paid_at ?? null),
        periodStart: secs(inv.period_start),
        periodEnd: secs(inv.period_end),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      };
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Record<string, unknown> & {
        id: string;
        status: string;
        cancel_at_period_end?: boolean;
        current_period_end?: number;
      };
      return {
        kind: "subscription",
        stripeSubscriptionId: sub.id,
        stripeStatus: sub.status,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        currentPeriodEnd: secs(sub.current_period_end),
      };
    }
    case "checkout.session.completed": {
      const s = event.data.object as Record<string, unknown> & {
        customer?: string;
        subscription?: string;
        metadata?: Record<string, string>;
      };
      const meta = s.metadata ?? {};
      if (!meta.trainerId || !meta.traineeId || !s.customer || !s.subscription) return null;
      return {
        kind: "checkout",
        trainerId: meta.trainerId,
        traineeId: meta.traineeId,
        customerId: String(s.customer),
        subscriptionId: String(s.subscription),
      };
    }
    case "account.updated": {
      const a = event.data.object as Record<string, unknown> & {
        id: string;
        charges_enabled?: boolean;
        payouts_enabled?: boolean;
        details_submitted?: boolean;
      };
      return {
        kind: "account",
        accountId: a.id,
        chargesEnabled: Boolean(a.charges_enabled),
        payoutsEnabled: Boolean(a.payouts_enabled),
        detailsSubmitted: Boolean(a.details_submitted),
      };
    }
    default:
      return null;
  }
}

/** Zapisuje zmianę do DB (idempotentnie). */
export async function applyChange(db: Db, change: Change): Promise<void> {
  switch (change.kind) {
    case "invoice":
      if (!change.trainerId || !change.traineeId) return; // brak powiązania → pomiń (log w callerze)
      await recordInvoice(db, {
        trainerId: change.trainerId,
        traineeId: change.traineeId,
        stripeInvoiceId: change.stripeInvoiceId,
        amountGrosze: change.amountGrosze,
        currency: change.currency,
        status: change.status,
        paidAt: change.paidAt,
        periodStart: change.periodStart,
        periodEnd: change.periodEnd,
        hostedInvoiceUrl: change.hostedInvoiceUrl,
      });
      return;
    case "subscription":
      await applySubscriptionUpdate(db, change);
      return;
    case "checkout":
      await linkCheckoutResult(db, change);
      return;
    case "account":
      await applyAccountUpdate(db, {
        id: change.accountId,
        charges_enabled: change.chargesEnabled,
        payouts_enabled: change.payoutsEnabled,
        details_submitted: change.detailsSubmitted,
      });
      return;
  }
}
```

> Nazwy pól na obiektach Stripe (`subscription_details.metadata`, `current_period_end`, `status_transitions.paid_at`) zweryfikuj context7 (`/stripe/stripe-node` — typy `Invoice`/`Subscription`) i dostosuj, gdy SDK różni się od założeń. Test `mapEvent` chroni przed regresją mapowania.

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit -- webhook`
Expected: PASS.

- [ ] **Step 5: Trasa `app/routes/webhooks.stripe.tsx`** (tylko action, bez sesji)

```tsx
import type { ActionFunctionArgs } from "react-router";
import { db } from "~/lib/db/client";
import { applyChange, mapEvent, verifyAndParse } from "~/lib/stripe/webhook";

export async function action({ request }: ActionFunctionArgs) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const raw = await request.text(); // SUROWY body — wymagany do weryfikacji podpisu
  let event;
  try {
    event = verifyAndParse(raw, sig);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  const change = mapEvent(event);
  if (change) {
    try {
      await applyChange(db, change);
    } catch (err) {
      // Log po stronie serwera; zwracamy 500, by Stripe ponowił.
      console.error("[stripe webhook] applyChange failed", event.type, err);
      return new Response("handler error", { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
```

> Upewnij się, że RR7 nie parsuje body przed akcją (używamy `request.text()`, nie `formData()`) — surowy body jest konieczny dla `constructEvent`.

- [ ] **Step 6: Wpis w `app/routes.ts`** (poza prefiksami, przy `files/:fileId`)

```ts
route("webhooks/stripe", "routes/webhooks.stripe.tsx"),
```

- [ ] **Step 7: Itest idempotencji (PISZEMY/nie uruchamiamy) — `tests/stripe-webhook.itest.ts`**

Dwa razy `applyChange` z tą samą zmianą `invoice` (ten sam `stripeInvoiceId`) → jeden wiersz w `subscription_payments` (UNIQUE + upsert). `applySubscriptionUpdate` dwa razy → ostatni stan, brak duplikatów.

- [ ] **Step 8: Typecheck + lint + review + security**

`npm run typecheck`; `npm run lint`; `/code-review`; **`/security-review`** (weryfikacja podpisu, trasa bez sesji, idempotencja).

---

## Task 9: Frontend polish + dokumentacja + bramki końcowe + handoff

**Files:**
- Modify: trasy z Tasków 5–7 (polish UI)
- Create: `app/lib/stripe/README.md`
- Modify: `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `app/routes/README.md`, `CLAUDE.md`, `README.md` (root)
- Modify: `app/components/icons.tsx` (ikona płatności, jeśli brak)

- [ ] **Step 1: UI/UX przez `frontend-design:frontend-design`**

Dopracuj 3 widoki (`integracje.stripe`, trener `…/platnosci`, podopieczny `platnosci`) zgodnie z `design-system/README.md` i `app/styles/tokens.css`: karty statusu z `subscriptionPresentation` (ton → kolor), banery `?ok/?canceled/?return/?refresh`, formularz kwoty (PLN), historia płatności (tabela/lista z `fmtMoney` + link do faktury), stany puste („Trener nie ustalił kwoty", „Połącz Stripe, aby przyjmować płatności"). Mobile-first dla panelu podopiecznego. UI po polsku.

- [ ] **Step 2: `app/lib/stripe/README.md`** — opis `client.ts`, `connections.ts`, `subscriptions.ts`, `status.ts`, `webhook.ts` (sygnatury + tenant-scope + best-effort/destination charges).

- [ ] **Step 3: Aktualizacja README/CLAUDE**

- `app/lib/README.md`: wiersze `payments.ts`, `money.ts` + podkatalog `stripe/`.
- `CLAUDE.md`: mapa — nowy `app/lib/stripe/`; w tabeli „Stack" dopisz Stripe (płatności); nowe trasy w sekcji mapy.
- `app/routes/trener/README.md`: wiersze `integracje.stripe.tsx`, `podopieczni.$traineeId.platnosci.tsx`.
- `app/routes/podopieczny/README.md`: wiersz `platnosci.tsx` (+ badge w `_layout`).
- `app/routes/README.md`: wiersz `webhooks/stripe`.
- root `README.md`: env `STRIPE_*`, lokalny webhook (Stripe CLI `stripe listen --forward-to localhost:3000/webhooks/stripe`), nota o Connect (test mode), posture bezpieczeństwa (brak danych karty).

- [ ] **Step 4: Bramki końcowe (z dowodem)**

Run kolejno (każda osobno):
- `npm run test:unit` → PASS (money, status, webhook).
- `npm run typecheck` → zielono.
- `npm run lint` → zielono.
- `npm run build` → sukces.

> Jeśli `npm install stripe` jeszcze nie wykonane przez właściciela — typecheck/build zgłoszą brak modułu `stripe`. Odnotuj w handoffie i poproś właściciela o instalację przed bramką build.

- [ ] **Step 5: `/code-review` całości + `/security-review`**

Pełny przegląd diffa + przegląd bezpieczeństwa (auth/`trainer_id`/webhook/sekrety/brak danych karty/redirecty Stripe scoped do właściwego customera).

- [ ] **Step 6: Handoff (granica gita)**

Wypisz: podsumowanie + zmienione pliki; proponowany komunikat commita; notatki (nowa zależność `stripe` → `npm install`; `db:migrate`; nowe env `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`; konfiguracja webhooka i Connect w Stripe Dashboard / `stripe listen` lokalnie); lista itestów do odpalenia pod Dockerem (`npm run test:itest`); ścieżka ręcznej weryfikacji (połącz Connect w test mode → ustaw kwotę → Checkout testową kartą `4242…` → sprawdź status `active` i wpis w historii → Portal → anulowanie).

---

## Self-review (spójność planu ze spec)

- **Realne procesowanie / Stripe / Connect Express / destination charges** → Taski 1,4,5,6 (account Express, `transfer_data.destination`, `application_fee_percent:0`). ✅
- **Subskrypcja auto-kartą (Billing)** → Task 6 (`checkout.sessions` mode `subscription`, `prices.recurring.interval:month`). ✅
- **UI Stripe-hosted (Checkout + Portal)** → Task 6/7 (`createCheckoutSession`, `createPortalSession`). ✅
- **Trener ustala kwotę** → Task 6 (`setMonthlyAmount` + trasa trenera). ✅
- **Status tylko widoczny, bez gatingu** → Taski 3,7 (prezentacja + badge, brak blokad funkcji). ✅
- **Prowizja 0, gotowa na później** → `application_fee_percent:0` w Checkout (Task 6). ✅
- **PLN/grosze** → `money.ts` (Task 2), `currency:'pln'`, `unit_amount` w groszach. ✅
- **Zmiana kwoty od następnego cyklu, bez proracji** → `setMonthlyAmount` (`proration_behavior:'none'`). ✅
- **Anulowanie: Portal (podopieczny) + trener `cancel`** → Task 6 (`cancelSubscription`), Task 7 (`portal`). ✅
- **Model danych: enum + 3 tabele** → Task 4. ✅
- **Webhooki + idempotencja po `stripe_invoice_id`** → Task 8 + itest. ✅
- **Tenant-scope, 404** → repo przyjmują `trainerId`/`traineeId`; trasa trenera `assertTraineeOwnedBy` (Task 6); podopieczny działa po `user.id` (Task 7). ✅
- **Bezpieczeństwo: podpis webhooka, brak danych karty, sekrety w env** → Task 8 (`verifyAndParse`), Task 1 (env), `/security-review` w 5–9. ✅
- **Dokumentacja** → Task 9. ✅
- **Testy: unit (money/status/webhook) + itest (tenant-scope/setMonthlyAmount/idempotencja)** → Taski 2,3,8,5,6. ✅
- **Otwarty detal (jeden vs dwa endpointy webhooka)** → decyzja architektoniczna #5 + handoff. ✅

Spójność typów: `SubscriptionStatus`/`mapStripeStatus` (status.ts) używane w `applySubscriptionUpdate` (subscriptions.ts) i schema enum (Task 4) — zgodne. `Change` (webhook.ts) konsumuje `recordInvoice`/`applySubscriptionUpdate`/`linkCheckoutResult`/`applyAccountUpdate` o pasujących sygnaturach (payments.ts/subscriptions.ts/connections.ts). Brak placeholderów „TBD/TODO".

## Poza zakresem (świadomie)

Zwroty w aplikacji, trial, kupony, proracja, prowizja >0, gating dostępu,
auto-płatności BLIK/P24, powiadomienia e-mail spoza Stripe, wiele subskrypcji na parę.
