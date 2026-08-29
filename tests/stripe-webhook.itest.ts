/**
 * Testy integracyjne webhooka Stripe: idempotencja KSIĘGI płatności i aktualizacji
 * statusu subskrypcji na realnym Postgresie (testcontainers). Wołamy bezpośrednio
 * mapEvent + applyChange (oraz applyChange z gotowymi obiektami Change) — NIE
 * przechodzimy przez verifyAndParse (podpis), więc klient Stripe jest mockowany
 * tylko po to, by import modułów aplikacji się nie wysypał (zero sieci).
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { vi } from "vitest";

// ---- Mock klienta Stripe (PRZED importami aplikacji) ----
// Webhook itest nie dotyka sieci; mock istnieje, by import ~/lib/stripe/client
// (pociągany pośrednio przez webhook.ts → subscriptions/connections) nie próbował
// konstruować realnego klienta.
vi.mock("~/lib/stripe/client", () => ({
  getStripe: () => ({}),
  STRIPE_API_VERSION: "x",
}));

// ---- Importy aplikacji (po vi.mock) ----
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { and, eq } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import {
  applyChange,
  claimWebhookEvent,
  mapEvent,
  releaseWebhookEvent,
  type Change,
} from "~/lib/stripe/webhook";

// ---- Bootstrapping (identyczny wzorzec z stripe-subscriptions.itest.ts) ----

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeId = "";
const subscriptionId = "sub_webhook_itest";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [trainer] = await db
    .insert(schema.users)
    .values({
      email: "trainer-webhook@example.com",
      displayName: "Trainer Webhook",
      role: "trainer",
    })
    .returning({ id: schema.users.id });
  trainerId = trainer!.id;

  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "trainee-webhook@example.com",
      displayName: "Trainee Webhook",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeId = trainee!.id;

  // Para z subskrypcją (FK + tenant-scope dla applySubscriptionUpdate po sub id).
  await db.insert(schema.coachingSubscriptions).values({
    trainerId,
    traineeId,
    amountGrosze: 20000,
    stripeSubscriptionId: subscriptionId,
    status: "incomplete",
  });
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---- Testy ----

describe("webhook — idempotencja księgi płatności (subscription_payments)", () => {
  it("dwa razy applyChange(invoice) z tym samym stripeInvoiceId → dokładnie jeden wiersz (upsert)", async () => {
    const change: Change = {
      kind: "invoice",
      trainerId,
      traineeId,
      stripeInvoiceId: "in_idem_1",
      amountGrosze: 20000,
      currency: "pln",
      status: "paid",
      paidAt: new Date(1_700_000_000 * 1000),
      periodStart: new Date(1_699_000_000 * 1000),
      periodEnd: new Date(1_701_000_000 * 1000),
      hostedInvoiceUrl: "https://pay/x",
    };

    await applyChange(db, change);
    // Drugie dostarczenie tego samego eventu (Stripe ponawia) — z INNYM statusem,
    // by potwierdzić, że upsert aktualizuje SET clause (last-write-wins), nie tworzy nowego wiersza.
    await applyChange(db, { ...change, status: "void" });

    const rows = await db
      .select()
      .from(schema.subscriptionPayments)
      .where(eq(schema.subscriptionPayments.stripeInvoiceId, "in_idem_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trainerId).toBe(trainerId);
    expect(rows[0]!.traineeId).toBe(traineeId);
    expect(rows[0]!.amountGrosze).toBe(20000);
    expect(rows[0]!.status).toBe("void");
  });

  it("invoice bez powiązanej pary (brak trainerId/traineeId) → pomijane, brak wiersza", async () => {
    const change: Change = {
      kind: "invoice",
      trainerId: null,
      traineeId: null,
      stripeInvoiceId: "in_no_meta",
      amountGrosze: 20000,
      currency: "pln",
      status: "paid",
      paidAt: null,
      periodStart: null,
      periodEnd: null,
      hostedInvoiceUrl: null,
    };
    await applyChange(db, change);

    const rows = await db
      .select()
      .from(schema.subscriptionPayments)
      .where(eq(schema.subscriptionPayments.stripeInvoiceId, "in_no_meta"));
    expect(rows).toHaveLength(0);
  });
});

describe("webhook — idempotencja aktualizacji statusu subskrypcji", () => {
  it("applyChange(subscription) wielokrotnie → ostatni stan wygrywa, bez duplikatów wiersza", async () => {
    // Pierwszy event: active.
    await applyChange(db, {
      kind: "subscription",
      stripeSubscriptionId: subscriptionId,
      stripeStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
      paused: false,
      trainerId: null,
      traineeId: null,
    });
    // Powtórka tego samego + kolejny event: past_due (ostatni wygrywa).
    await applyChange(db, {
      kind: "subscription",
      stripeSubscriptionId: subscriptionId,
      stripeStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
      paused: false,
      trainerId: null,
      traineeId: null,
    });
    await applyChange(db, {
      kind: "subscription",
      stripeSubscriptionId: subscriptionId,
      stripeStatus: "past_due",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1_702_000_000 * 1000),
      paused: false,
      trainerId: null,
      traineeId: null,
    });

    const rows = await db
      .select()
      .from(schema.coachingSubscriptions)
      .where(
        and(
          eq(schema.coachingSubscriptions.trainerId, trainerId),
          eq(schema.coachingSubscriptions.traineeId, traineeId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("past_due");
    expect(rows[0]!.cancelAtPeriodEnd).toBe(true);
    expect(rows[0]!.currentPeriodEnd?.getTime()).toBe(1_702_000_000 * 1000);
  });

  it("mapEvent + applyChange end-to-end (customer.subscription.updated) aktualizuje status", async () => {
    const change = mapEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: subscriptionId,
          status: "canceled",
          cancel_at_period_end: false,
          items: { data: [{ id: "si_1", current_period_end: 1_703_000_000 }] },
        },
      },
    } as never);
    expect(change).not.toBeNull();
    await applyChange(db, change!);

    const [row] = await db
      .select()
      .from(schema.coachingSubscriptions)
      .where(eq(schema.coachingSubscriptions.stripeSubscriptionId, subscriptionId));
    expect(row!.status).toBe("canceled");
    expect(row!.currentPeriodEnd?.getTime()).toBe(1_703_000_000 * 1000);
  });
});

describe("webhook — dedup po event.id (processed_webhook_events)", () => {
  // Odwzorowanie kontraktu, na którym opiera się trasa routes/webhooks.stripe.tsx:
  // insert-first / on-conflict-skip; przy błędzie applyChange marker jest usuwany,
  // by Stripe mógł ponowić.
  it("pierwsze dostarczenie zapisuje marker; powtórka jest pomijana (returning pusty)", async () => {
    const eventId = "evt_dedup_1";

    const first = await db
      .insert(schema.processedWebhookEvents)
      .values({ eventId, type: "invoice.paid" })
      .onConflictDoNothing()
      .returning({ eventId: schema.processedWebhookEvents.eventId });
    expect(first).toHaveLength(1); // przetwarzamy

    const second = await db
      .insert(schema.processedWebhookEvents)
      .values({ eventId, type: "invoice.paid" })
      .onConflictDoNothing()
      .returning({ eventId: schema.processedWebhookEvents.eventId });
    expect(second).toHaveLength(0); // duplikat — pomijamy
  });

  it("po usunięciu markera (rollback przy błędzie) event może być przetworzony ponownie", async () => {
    const eventId = "evt_dedup_2";

    const first = await db
      .insert(schema.processedWebhookEvents)
      .values({ eventId, type: "account.updated" })
      .onConflictDoNothing()
      .returning({ eventId: schema.processedWebhookEvents.eventId });
    expect(first).toHaveLength(1);

    // applyChange „rzuca" → trasa cofa marker.
    await db
      .delete(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.eventId, eventId));

    const retry = await db
      .insert(schema.processedWebhookEvents)
      .values({ eventId, type: "account.updated" })
      .onConflictDoNothing()
      .returning({ eventId: schema.processedWebhookEvents.eventId });
    expect(retry).toHaveLength(1); // ponowna próba przechodzi
  });

  it("claimWebhookEvent zwraca true raz, potem false dla tego samego id", async () => {
    expect(await claimWebhookEvent(db, "evt_1", "invoice.paid")).toBe(true);
    expect(await claimWebhookEvent(db, "evt_1", "invoice.paid")).toBe(false);
  });

  it("releaseWebhookEvent pozwala ponowić zdarzenie po błędzie handlera", async () => {
    await claimWebhookEvent(db, "evt_2", "invoice.paid");
    await releaseWebhookEvent(db, "evt_2");
    expect(await claimWebhookEvent(db, "evt_2", "invoice.paid")).toBe(true);
  });
});
