/**
 * Testy integracyjne onboardingu płatności (OB-3): po rejestracji z zaproszenia
 * mającym ustaloną kwotę miesięczną zakładamy, że setMonthlyAmount tworzy wiersz
 * coaching_subscriptions dla pary (trener, podopieczny) ze statusem 'none'.
 * Sprawdzamy też tenant-scope: obcy trener nie widzi subskrypcji pary, a para bez
 * wywołania setMonthlyAmount nie ma wiersza.
 *
 * Klient Stripe jest mockowany (zero sieci).
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { vi } from "vitest";

// ---- Mock klienta Stripe (PRZED importami aplikacji) ----
// vi.hoisted() pozwala zdefiniować mocki zanim fabryka vi.mock zostanie wykonana.
const { pricesCreateMock } = vi.hoisted(() => ({
  // Każde wywołanie zwraca unikalne id, by odróżnić Price z kolejnych zmian kwoty.
  pricesCreateMock: vi.fn(async () => ({ id: `price_${Math.random().toString(36).slice(2, 8)}` })),
}));

const fakeStripe = {
  prices: { create: pricesCreateMock },
};

vi.mock("~/lib/stripe/client", () => ({
  getStripe: () => fakeStripe,
  STRIPE_API_VERSION: "x",
}));

// ---- Importy aplikacji (po vi.mock) ----
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import { getSubscriptionForPair, setMonthlyAmount } from "~/lib/stripe/subscriptions";

// ---- Bootstrapping (identyczny z stripe-subscriptions.itest.ts) ----

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";
let traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const mkTrainer = async (email: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, displayName: email, role: "trainer" })
      .returning({ id: schema.users.id });
    return u!.id;
  };

  trainerA = await mkTrainer("trainer-a-onboarding@example.com");
  trainerB = await mkTrainer("trainer-b-onboarding@example.com");

  const mkTrainee = async (email: string, trainerId: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, displayName: email, role: "trainee", trainerId })
      .returning({ id: schema.users.id });
    return u!.id;
  };

  traineeA = await mkTrainee("trainee-a-onboarding@example.com", trainerA);
  traineeB = await mkTrainee("trainee-b-onboarding@example.com", trainerA);
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---- Testy ----

describe("onboarding płatności — setMonthlyAmount po rejestracji z kwotą", () => {
  it("tworzy wiersz coaching_subscriptions (status 'none') dla pary trener↔podopieczny", async () => {
    pricesCreateMock.mockClear();

    // Symulacja akcji rejestracji: po consumeInvite (kind === 'created') z kwotą
    // ustaloną na zaproszeniu wołamy setMonthlyAmount dla utworzonego podopiecznego.
    await setMonthlyAmount(db, trainerA, traineeA, 20000);

    expect(pricesCreateMock).toHaveBeenCalledTimes(1);

    const row = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("none");
    expect(row!.amountGrosze).toBe(20000);
    expect(row!.stripePriceId).toMatch(/^price_/);
  });

  it("para bez wywołania setMonthlyAmount nie ma wiersza subskrypcji (null)", async () => {
    // traineeB istnieje, ale nie przeszedł onboardingu z kwotą.
    const row = await getSubscriptionForPair(db, trainerA, traineeB);
    expect(row).toBeNull();
  });

  it("tenant-scope: obcy trener nie widzi subskrypcji pary", async () => {
    const foreign = await getSubscriptionForPair(db, trainerB, traineeA);
    expect(foreign).toBeNull();
  });
});
