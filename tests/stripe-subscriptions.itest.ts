/**
 * Testy integracyjne Stripe connections: tenant-scope per trainerId + real Postgres
 * (testcontainers). Klient Stripe jest mockowany (zero sieci) — sprawdzamy, że
 * ensureExpressAccount/getConnectionRow/applyAccountUpdate operują tylko na wierszu
 * właściwego trenera.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { vi } from "vitest";

// ---- Mock klienta Stripe (PRZED importami aplikacji) ----
// vi.hoisted() pozwala zdefiniować mocki zanim fabryka vi.mock zostanie wykonana.
const { accountsCreateMock, accountLinksCreateMock, pricesCreateMock, subCancelMock, customerDelMock } =
  vi.hoisted(() => ({
    accountsCreateMock: vi.fn(async () => ({
      id: "acct_TEST_A",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      country: "PL",
      default_currency: "pln",
    })),
    accountLinksCreateMock: vi.fn(async () => ({ url: "https://connect.stripe.com/setup/test" })),
    // Każde wywołanie zwraca unikalne id, by odróżnić Price z kolejnych zmian kwoty.
    pricesCreateMock: vi.fn(async () => ({ id: `price_${Math.random().toString(36).slice(2, 8)}` })),
    subCancelMock: vi.fn(async () => ({})),
    customerDelMock: vi.fn(async () => ({ deleted: true })),
  }));

const fakeStripe = {
  accounts: { create: accountsCreateMock },
  accountLinks: { create: accountLinksCreateMock },
  prices: { create: pricesCreateMock },
  customers: { del: customerDelMock },
  subscriptions: {
    retrieve: vi.fn(async () => ({ items: { data: [{ id: "si_TEST" }] } })),
    update: vi.fn(async () => ({})),
    cancel: subCancelMock,
  },
};

vi.mock("~/lib/stripe/client", () => ({
  getStripe: () => fakeStripe,
  STRIPE_API_VERSION: "x",
}));

// stripeApiConfigured() czyta pełny env (DATABASE_URL/SESSION_SECRET/…). W itest go
// mockujemy: Stripe „skonfigurowany", BASE_URL atrapowy (cleanup go nie używa).
vi.mock("~/lib/env", () => ({
  getEnv: () => ({ BASE_URL: "http://localhost:3000" }),
  stripeApiConfigured: () => true,
  stripeConfigured: () => true,
}));

// ---- Importy aplikacji (po vi.mock) ----
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import {
  applyAccountUpdate,
  ensureExpressAccount,
  getConnectionRow,
  getConnectionStatus,
} from "~/lib/stripe/connections";
import {
  cleanupSubscriptionForTrainee,
  getSubscriptionForPair,
  setMonthlyAmount,
} from "~/lib/stripe/subscriptions";

// ---- Bootstrapping (identyczny z google-sync.itest.ts) ----

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const mk = async (email: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, displayName: email, role: "trainer" })
      .returning({ id: schema.users.id });
    return u!.id;
  };

  trainerA = await mk("trainer-a-stripe@example.com");
  trainerB = await mk("trainer-b-stripe@example.com");

  const [tA] = await db
    .insert(schema.users)
    .values({
      email: "trainee-a-stripe@example.com",
      displayName: "Trainee A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = tA!.id;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---- Testy ----

describe("Stripe connections — tenant-scope per trainerId", () => {
  it("ensureExpressAccount tworzy wiersz dla trenera A; trener B go nie widzi", async () => {
    accountsCreateMock.mockClear();

    const accountId = await ensureExpressAccount(db, trainerA, "trainer-a-stripe@example.com");

    // Konto utworzone raz, z metadanymi trenera A
    expect(accountsCreateMock).toHaveBeenCalledTimes(1);
    expect(accountId).toBe("acct_TEST_A");

    // Wiersz trenera A istnieje i zawiera dane z konta
    const rowA = await getConnectionRow(db, trainerA);
    expect(rowA).not.toBeNull();
    expect(rowA!.stripeAccountId).toBe("acct_TEST_A");
    expect(rowA!.country).toBe("PL");
    expect(rowA!.defaultCurrency).toBe("pln");

    // Trener B nie widzi połączenia trenera A (tenant-scope)
    const rowB = await getConnectionRow(db, trainerB);
    expect(rowB).toBeNull();
    const statusB = await getConnectionStatus(db, trainerB);
    expect(statusB.connected).toBe(false);
    expect(statusB.stripeAccountId).toBeNull();
  });

  it("applyAccountUpdate aktualizuje tylko wiersz dopasowany po stripe_account_id (A), B bez zmian", async () => {
    // Upewnij się, że A istnieje (poprzedni test go utworzył; ensureExpressAccount jest idempotentny)
    const accountIdA = await ensureExpressAccount(db, trainerA, "trainer-a-stripe@example.com");

    await applyAccountUpdate(db, {
      id: accountIdA,
      charges_enabled: true,
      details_submitted: true,
    });

    const statusA = await getConnectionStatus(db, trainerA);
    expect(statusA.chargesEnabled).toBe(true);
    expect(statusA.detailsSubmitted).toBe(true);

    // Trener B nadal bez połączenia — aktualizacja nie dotknęła nieistniejącego wiersza
    const rowB = await getConnectionRow(db, trainerB);
    expect(rowB).toBeNull();
  });
});

describe("setMonthlyAmount — upsert wiersza pary + tenant-scope", () => {
  it("bez istniejącego wiersza tworzy wpis ze statusem 'none' i Price", async () => {
    pricesCreateMock.mockClear();

    await setMonthlyAmount(db, trainerA, traineeA, 20000);

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);
    const row = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("none");
    expect(row!.amountGrosze).toBe(20000);
    expect(row!.stripePriceId).toMatch(/^price_/);
  });

  it("ponowne wywołanie aktualizuje kwotę i Price bez duplikatu wiersza", async () => {
    const before = await getSubscriptionForPair(db, trainerA, traineeA);
    const oldPriceId = before!.stripePriceId;

    await setMonthlyAmount(db, trainerA, traineeA, 35000);

    const after = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(after!.id).toBe(before!.id); // ten sam wiersz (pairUniq)
    expect(after!.amountGrosze).toBe(35000);
    expect(after!.stripePriceId).not.toBe(oldPriceId);

    // brak duplikatu pary
    const all = await db
      .select()
      .from(schema.coachingSubscriptions)
      .where(eq(schema.coachingSubscriptions.trainerId, trainerA));
    expect(all.filter((r) => r.traineeId === traineeA)).toHaveLength(1);
  });

  it("tenant-scope: obcy trener nie widzi subskrypcji pary", async () => {
    const foreign = await getSubscriptionForPair(db, trainerB, traineeA);
    expect(foreign).toBeNull();
  });
});

describe("cleanupSubscriptionForTrainee — anulowanie przy usuwaniu podopiecznego", () => {
  it("anuluje subskrypcję i kasuje customera, gdy oba id są w wierszu pary", async () => {
    subCancelMock.mockClear();
    customerDelMock.mockClear();
    // Para z aktywną subskrypcją + customerem (np. po Checkout).
    await db
      .update(schema.coachingSubscriptions)
      .set({
        stripeSubscriptionId: "sub_cleanup_itest",
        stripeCustomerId: "cus_cleanup_itest",
        status: "active",
      })
      .where(eq(schema.coachingSubscriptions.traineeId, traineeA));

    await cleanupSubscriptionForTrainee(db, trainerA, traineeA);

    expect(subCancelMock).toHaveBeenCalledTimes(1);
    expect(subCancelMock).toHaveBeenCalledWith("sub_cleanup_itest");
    expect(customerDelMock).toHaveBeenCalledTimes(1);
    expect(customerDelMock).toHaveBeenCalledWith("cus_cleanup_itest");
  });

  it("no-op bez wiersza pary (nie woła Stripe)", async () => {
    subCancelMock.mockClear();
    customerDelMock.mockClear();
    await cleanupSubscriptionForTrainee(db, trainerB, traineeA); // brak wiersza dla trenera B
    expect(subCancelMock).not.toHaveBeenCalled();
    expect(customerDelMock).not.toHaveBeenCalled();
  });

  it("błąd anulowania w Stripe nie przerywa (best-effort) — customer dalej kasowany", async () => {
    subCancelMock.mockClear();
    customerDelMock.mockClear();
    subCancelMock.mockRejectedValueOnce(Object.assign(new Error("stripe down"), { code: "api_error" }));

    await expect(cleanupSubscriptionForTrainee(db, trainerA, traineeA)).resolves.toBeUndefined();
    expect(customerDelMock).toHaveBeenCalledTimes(1);
  });
});
