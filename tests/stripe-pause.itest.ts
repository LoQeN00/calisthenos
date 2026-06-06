/**
 * Testy integracyjne Stripe pause/resume: tenant-scope per (trainerId, traineeId)
 * + real Postgres (testcontainers). Klient Stripe jest mockowany (zero sieci) —
 * sprawdzamy, że pauseSubscription/resumeSubscription oraz applySubscriptionUpdate
 * z paused:true poprawnie ustawiają status po naszej stronie i wołają Stripe.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { vi } from "vitest";

// ---- Mock klienta Stripe (PRZED importami aplikacji) ----
const { subscriptionsUpdateMock } = vi.hoisted(() => ({
  subscriptionsUpdateMock: vi.fn(async () => ({})),
}));

const fakeStripe = {
  subscriptions: {
    update: subscriptionsUpdateMock,
  },
};

vi.mock("~/lib/stripe/client", () => ({
  getStripe: () => fakeStripe,
  STRIPE_API_VERSION: "x",
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
  applySubscriptionUpdate,
  getSubscriptionForPair,
  pauseSubscription,
  resumeSubscription,
  SubscriptionError,
} from "~/lib/stripe/subscriptions";

// ---- Bootstrapping ----

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";

const STRIPE_SUB_ID = "sub_PAUSE_TEST";

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

  trainerA = await mk("trainer-a-pause@example.com");
  trainerB = await mk("trainer-b-pause@example.com");

  const [tA] = await db
    .insert(schema.users)
    .values({
      email: "trainee-a-pause@example.com",
      displayName: "Trainee A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = tA!.id;

  // Para z aktywną subskrypcją (ma stripeSubscriptionId) — wymagana przez pause/resume.
  await db.insert(schema.coachingSubscriptions).values({
    trainerId: trainerA,
    traineeId: traineeA,
    amountGrosze: 20000,
    stripeSubscriptionId: STRIPE_SUB_ID,
    status: "active",
  });
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---- Testy ----

describe("pause/resume — tenant-scope per (trainerId, traineeId)", () => {
  it("pauseSubscription ustawia status 'paused' i woła Stripe z behavior 'void'", async () => {
    subscriptionsUpdateMock.mockClear();

    await pauseSubscription(db, trainerA, traineeA);

    expect(subscriptionsUpdateMock).toHaveBeenCalledTimes(1);
    expect(subscriptionsUpdateMock).toHaveBeenCalledWith(STRIPE_SUB_ID, {
      pause_collection: { behavior: "void" },
    });

    const row = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(row!.status).toBe("paused");
  });

  it("resumeSubscription ustawia status 'active' i czyści pause_collection", async () => {
    subscriptionsUpdateMock.mockClear();

    await resumeSubscription(db, trainerA, traineeA);

    expect(subscriptionsUpdateMock).toHaveBeenCalledTimes(1);
    expect(subscriptionsUpdateMock).toHaveBeenCalledWith(STRIPE_SUB_ID, {
      pause_collection: "",
    });

    const row = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(row!.status).toBe("active");
  });

  it("applySubscriptionUpdate z paused:true nadpisuje status na 'paused' niezależnie od stripeStatus", async () => {
    await applySubscriptionUpdate(db, {
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripeStatus: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      paused: true,
    });

    const row = await getSubscriptionForPair(db, trainerA, traineeA);
    expect(row!.status).toBe("paused");
  });

  it("tenant-scope: obcy trener nie może wstrzymać subskrypcji pary (brak wiersza → SubscriptionError)", async () => {
    await expect(pauseSubscription(db, trainerB, traineeA)).rejects.toBeInstanceOf(
      SubscriptionError,
    );
  });
});
