// Integration test — owner runs under Docker (testcontainers). Do NOT run in the no-Docker loop.
// Uruchamia właściciel pod Dockerem: npm run test:itest

// Ustaw env PRZED pierwszym importem modułów aplikacji (getEnv() cache'uje przy pierwszym wywołaniu).
process.env.FILE_SIGNING_SECRET = "itest-ambassadors-secret-32-bytes-xxx";
process.env.SESSION_SECRET = "itest-ambassadors-session-32-bytes-xx";
process.env.DATABASE_URL = "postgres://unused:unused@localhost/unused";
process.env.BASE_URL = "http://localhost:3000";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  ensureOrganization,
  ensureRegion,
  ensureBrandAdmin,
  assignUserToOrgRegion,
} from "~/lib/organizations";
import {
  listAmbassadors,
  getAmbassadorProfile,
  inviteAmbassador,
  deactivateAmbassador,
  reactivateAmbassador,
  AmbassadorError,
} from "~/lib/ambassadors";
import { createInvite, consumeInvite, createSession, readSession } from "~/lib/auth";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Shared ids set in beforeAll.
let orgAId: string;
let orgBId: string;
let regionAId: string;
let presidentId: string; // brand_admin w org A

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // Org A + region + brand_admin (prezes).
  orgAId = await ensureOrganization(db, "Marka Alpha");
  regionAId = await ensureRegion(db, {
    organizationId: orgAId,
    name: "Polska",
    country: "PL",
    currency: "pln",
    locale: "pl-PL",
  });
  presidentId = await ensureBrandAdmin(db, {
    organizationId: orgAId,
    email: "prezes-amb@alpha.example.com",
    displayName: "Prezes Alpha",
    password: "haslo-prezes-amb-1234",
  });

  // Org B (inny tenant).
  const [orgB] = await db
    .insert(schema.organizations)
    .values({ name: "Marka Beta" })
    .returning({ id: schema.organizations.id });
  orgBId = orgB!.id;
}, 180_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Scenario 1: Trainer invite → consumeInvite → konto trenera
// ---------------------------------------------------------------------------

describe("Scenario 1 — inviteAmbassador + consumeInvite tworzy konto trenera", () => {
  it("token z inviteAmbassador → consumeInvite tworzy user z role:trainer, org i region", async () => {
    const token = await inviteAmbassador(db, {
      organizationId: orgAId,
      invitedByUserId: presidentId,
      regionId: regionAId,
      displayName: "Ambasador S1",
      email: "ambasador-s1@alpha.example.com",
    });

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    const result = await consumeInvite(db, {
      token,
      chosenEmail: "ambasador-s1@alpha.example.com",
      chosenDisplayName: "Ambasador S1",
      newPasswordHash: "hash_placeholder_s1",
    });

    expect(result.kind).toBe("created");
    const user = result.user;
    expect(user.role).toBe("trainer");
    expect(user.organizationId).toBe(orgAId);
    expect(user.regionId).toBe(regionAId);
    // Trener nie ma trainer_id (nie jest podopiecznym)
    expect(user.trainerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Trainee invite regression — domyślna ścieżka (targetRole: trainee)
// ---------------------------------------------------------------------------

describe("Scenario 2 — createInvite (trainee domyślnie) + consumeInvite tworzy podopiecznego", () => {
  it("invite bez targetRole (trainee default) → consumeInvite tworzy user z role:trainee i trainerId", async () => {
    // Seed trenera dla tej pary
    const [trainerRow] = await db
      .insert(schema.users)
      .values({
        email: "trener-s2@alpha.example.com",
        displayName: "Trener S2",
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    const trainerId = trainerRow!.id;
    await assignUserToOrgRegion(db, trainerId, orgAId, regionAId);

    const { token } = await createInvite(db, {
      targetRole: "trainee",
      trainerId,
      displayName: "Podopieczny S2",
      email: "podopieczny-s2@alpha.example.com",
    });

    const result = await consumeInvite(db, {
      token,
      chosenEmail: "podopieczny-s2@alpha.example.com",
      chosenDisplayName: "Podopieczny S2",
      newPasswordHash: "hash_placeholder_trainee_s2",
    });

    expect(result.kind).toBe("created");
    const user = result.user;
    expect(user.role).toBe("trainee");
    expect(user.trainerId).toBe(trainerId);
    // Podopieczny nie ma organizationId wprost (dziedziczy od trenera via resolveCatalogOrgId)
    expect(user.organizationId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: deactivate blokuje sesję trenera + reactivate przywraca
//
// NOTE: deactivateAmbassador/reactivateAmbassador wołają pauseSubscription/resumeSubscription
// z ~/lib/stripe/subscriptions dla każdej aktywnej/spauzowanej subskrypcji trenera.
// W tym teście NIE tworzymy wierszy coaching_subscriptions — pętla iteruje zero wierszy
// i nigdy nie wywołuje Stripe. Orkiestracja pause/resume Stripe jest pokryta przez
// tests/stripe-pause.itest.ts i ręczne testy z prawdziwym kluczem Stripe.
// ---------------------------------------------------------------------------

describe("Scenario 3 — deactivate blokuje sesję, reactivate przywraca", () => {
  let s3TrainerId: string;
  let s3SessionId: string;

  beforeAll(async () => {
    // Seed trenera w org A (bez subskrypcji → pętla Stripe iteruje 0 wierszy)
    const [trainerRow] = await db
      .insert(schema.users)
      .values({
        email: "trener-s3@alpha.example.com",
        displayName: "Trener S3",
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    s3TrainerId = trainerRow!.id;
    await assignUserToOrgRegion(db, s3TrainerId, orgAId, regionAId);

    // Seed podopiecznego pod tym trenerem (bez wiersza coaching_subscriptions)
    await db.insert(schema.users).values({
      email: "podopieczny-s3@alpha.example.com",
      displayName: "Podopieczny S3",
      role: "trainee",
      trainerId: s3TrainerId,
    });
  });

  it("createSession + readSession zwraca wiersz dla aktywnego trenera", async () => {
    const { id } = await createSession(db, { userId: s3TrainerId });
    s3SessionId = id;
    const row = await readSession(db, s3SessionId);
    expect(row).not.toBeNull();
    expect(row!.user.id).toBe(s3TrainerId);
  });

  it("deactivateAmbassador ustawia archivedAt (trener zdezaktywowany)", async () => {
    await deactivateAmbassador(db, orgAId, s3TrainerId);

    const [u] = await db
      .select({ archivedAt: schema.users.archivedAt })
      .from(schema.users)
      .where(eq(schema.users.id, s3TrainerId))
      .limit(1);
    expect(u!.archivedAt).not.toBeNull();
  });

  it("readSession po deactivate zwraca null (sesja zablokowana przez archivedAt)", async () => {
    const row = await readSession(db, s3SessionId);
    expect(row).toBeNull();
  });

  it("getAmbassadorProfile.active jest false po deactivate", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s3TrainerId);
    expect(profile).not.toBeNull();
    expect(profile!.active).toBe(false);
  });

  it("reactivateAmbassador czyści archivedAt", async () => {
    await reactivateAmbassador(db, orgAId, s3TrainerId);

    const [u] = await db
      .select({ archivedAt: schema.users.archivedAt })
      .from(schema.users)
      .where(eq(schema.users.id, s3TrainerId))
      .limit(1);
    expect(u!.archivedAt).toBeNull();
  });

  it("readSession po reactivate znowu działa (nowa sesja)", async () => {
    const { id: newSessionId } = await createSession(db, { userId: s3TrainerId });
    const row = await readSession(db, newSessionId);
    expect(row).not.toBeNull();
    expect(row!.user.id).toBe(s3TrainerId);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Izolacja tenanta — org B nie widzi danych org A
// ---------------------------------------------------------------------------

describe("Scenario 4 — izolacja tenanta: org B nie widzi trenera org A", () => {
  let s4TrainerId: string;
  let s4OrgBTrainerId: string;

  beforeAll(async () => {
    // Trener w org A
    const [tA] = await db
      .insert(schema.users)
      .values({
        email: "trener-s4-a@alpha.example.com",
        displayName: "Trener S4 A",
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    s4TrainerId = tA!.id;
    await assignUserToOrgRegion(db, s4TrainerId, orgAId, regionAId);

    // Region i trener w org B
    const regionBId = await ensureRegion(db, {
      organizationId: orgBId,
      name: "Francja",
      country: "FR",
      currency: "eur",
      locale: "fr-FR",
    });
    const [tB] = await db
      .insert(schema.users)
      .values({
        email: "trener-s4-b@beta.example.com",
        displayName: "Trener S4 B",
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    s4OrgBTrainerId = tB!.id;
    await assignUserToOrgRegion(db, s4OrgBTrainerId, orgBId, regionBId);
  });

  it("getAmbassadorProfile(orgB, trenerOrgA) → null", async () => {
    const result = await getAmbassadorProfile(db, orgBId, s4TrainerId);
    expect(result).toBeNull();
  });

  it("deactivateAmbassador(orgB, trenerOrgA) → rzuca AmbassadorError", async () => {
    await expect(deactivateAmbassador(db, orgBId, s4TrainerId)).rejects.toBeInstanceOf(
      AmbassadorError,
    );
  });

  it("listAmbassadors(orgA) zawiera trenera orgA, nie trenera orgB", async () => {
    const list = await listAmbassadors(db, orgAId);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(s4TrainerId);
    expect(ids).not.toContain(s4OrgBTrainerId);
  });

  it("listAmbassadors(orgB) zawiera trenera orgB, nie trenera orgA", async () => {
    const list = await listAmbassadors(db, orgBId);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(s4OrgBTrainerId);
    expect(ids).not.toContain(s4TrainerId);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: CHECK invites_target_check — naruszenia schematu
// ---------------------------------------------------------------------------

describe("Scenario 5 — CHECK invites_target_check: naruszenia integralności", () => {
  it("targetRole:trainer bez invitedByUserId/organizationId → naruszenie CHECK (rzuca)", async () => {
    // Wstawiamy wprost z brakującymi polami wymaganymi przez CHECK dla trainer
    await expect(
      db.insert(schema.invites).values({
        targetRole: "trainer",
        // invitedByUserId: null — brakujące; CHECK wymaga NOT NULL dla trainer
        // organizationId: null — brakujące; CHECK wymaga NOT NULL dla trainer
        displayName: "Bad Trainer Invite",
        tokenHash: `bad-trainer-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400 * 1000),
      }),
    ).rejects.toThrow();
  });

  it("targetRole:trainee bez trainerId → naruszenie CHECK (rzuca)", async () => {
    // Wstawiamy wprost z brakującym trainerId wymaganym przez CHECK dla trainee
    await expect(
      db.insert(schema.invites).values({
        targetRole: "trainee",
        // trainerId: null — brakujące; CHECK wymaga NOT NULL dla trainee
        displayName: "Bad Trainee Invite",
        tokenHash: `bad-trainee-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400 * 1000),
      }),
    ).rejects.toThrow();
  });

  it("poprawne zaproszenie trenera (wszystkie pola) przechodzi CHECK", async () => {
    // Sanity check: poprawny insert nie rzuca
    await expect(
      db.insert(schema.invites).values({
        targetRole: "trainer",
        invitedByUserId: presidentId,
        organizationId: orgAId,
        regionId: regionAId,
        trainerId: null,
        displayName: "Good Trainer Invite",
        tokenHash: `good-trainer-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400 * 1000),
      }),
    ).resolves.toBeDefined();
  });

  it("poprawne zaproszenie podopiecznego (trainerId ustawiony) przechodzi CHECK", async () => {
    const [trainerRow] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, "trainer"))
      .limit(1);

    await expect(
      db.insert(schema.invites).values({
        targetRole: "trainee",
        trainerId: trainerRow!.id,
        displayName: "Good Trainee Invite",
        tokenHash: `good-trainee-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400 * 1000),
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Metryki getAmbassadorProfile — traineeCount, logs7d/logs30d, mrrGrosze
//
// NOTE: getAmbassadorProfile tylko CZYTA — żadne wywołania Stripe nie są wykonywane.
// Subskrypcje wstawiamy wprost (bez stripeSubscriptionId) tylko by przetestować MRR.
// ---------------------------------------------------------------------------

describe("Scenario 6 — getAmbassadorProfile: metryki traineeCount, logs, MRR", () => {
  let s6TrainerId: string;
  let s6ActiveTrainee1Id: string;
  let s6ActiveTrainee2Id: string;

  /** Tworzy plan + jedną sesję planu dla pary trener+podopieczny (workout_logs wymaga obu FK). */
  async function seedPlan(
    trainerId: string,
    traineeId: string,
  ): Promise<{ planId: string; planSessionId: string }> {
    const [plan] = await db
      .insert(schema.plans)
      .values({ trainerId, traineeId, name: "Plan S6", version: 1, status: "active" })
      .returning({ id: schema.plans.id });
    const [planSession] = await db
      .insert(schema.planSessions)
      .values({ planId: plan!.id, ordinal: 0, name: "Sesja S6" })
      .returning({ id: schema.planSessions.id });
    return { planId: plan!.id, planSessionId: planSession!.id };
  }

  /** Wstawia jeden workout_log z daną datą. */
  async function seedLog(opts: {
    trainerId: string;
    traineeId: string;
    planId: string;
    planSessionId: string;
    performedOn: string;
  }): Promise<void> {
    await db.insert(schema.workoutLogs).values({
      trainerId: opts.trainerId,
      traineeId: opts.traineeId,
      planId: opts.planId,
      planSessionId: opts.planSessionId,
      sessionName: "Sesja S6",
      performedOn: opts.performedOn,
    });
  }

  beforeAll(async () => {
    // Seed trenera w org A
    const [tRow] = await db
      .insert(schema.users)
      .values({
        email: "trener-s6@alpha.example.com",
        displayName: "Trener S6",
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    s6TrainerId = tRow!.id;
    await assignUserToOrgRegion(db, s6TrainerId, orgAId, regionAId);

    // 2 aktywnych podopiecznych
    const [t1] = await db
      .insert(schema.users)
      .values({
        email: "trainee-s6-1@alpha.example.com",
        displayName: "Podopieczny S6 1",
        role: "trainee",
        trainerId: s6TrainerId,
      })
      .returning({ id: schema.users.id });
    s6ActiveTrainee1Id = t1!.id;

    const [t2] = await db
      .insert(schema.users)
      .values({
        email: "trainee-s6-2@alpha.example.com",
        displayName: "Podopieczny S6 2",
        role: "trainee",
        trainerId: s6TrainerId,
      })
      .returning({ id: schema.users.id });
    s6ActiveTrainee2Id = t2!.id;

    // 1 zarchiwizowany podopieczny (nie wlicza się do traineeCount)
    await db.insert(schema.users).values({
      email: "trainee-s6-archived@alpha.example.com",
      displayName: "Podopieczny S6 Archived",
      role: "trainee",
      trainerId: s6TrainerId,
      archivedAt: new Date("2025-01-01"),
    });

    // Seed planów dla logów
    const { planId: p1Id, planSessionId: ps1Id } = await seedPlan(s6TrainerId, s6ActiveTrainee1Id);
    const { planId: p2Id, planSessionId: ps2Id } = await seedPlan(s6TrainerId, s6ActiveTrainee2Id);

    // Daty testowe: "dzisiaj" w kontekście testu
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Log z 3 dni temu → wchodzi do logs7d i logs30d
    const d3 = new Date(today);
    d3.setDate(today.getDate() - 3);
    await seedLog({
      trainerId: s6TrainerId,
      traineeId: s6ActiveTrainee1Id,
      planId: p1Id,
      planSessionId: ps1Id,
      performedOn: fmt(d3),
    });

    // Log z 10 dni temu → wchodzi do logs30d, ale NIE logs7d
    const d10 = new Date(today);
    d10.setDate(today.getDate() - 10);
    await seedLog({
      trainerId: s6TrainerId,
      traineeId: s6ActiveTrainee2Id,
      planId: p2Id,
      planSessionId: ps2Id,
      performedOn: fmt(d10),
    });

    // Log z 40 dni temu → nie wchodzi do logs7d ani logs30d
    const d40 = new Date(today);
    d40.setDate(today.getDate() - 40);
    await seedLog({
      trainerId: s6TrainerId,
      traineeId: s6ActiveTrainee1Id,
      planId: p1Id,
      planSessionId: ps1Id,
      performedOn: fmt(d40),
    });

    // Subskrypcje: jedna active (kwota X), jedna past_due (kwota Y)
    // MRR = tylko active; past_due wykluczone.
    // NOTE: brak stripeSubscriptionId → getAmbassadorProfile tylko CZYTA; żaden Stripe call.
    await db.insert(schema.coachingSubscriptions).values({
      trainerId: s6TrainerId,
      traineeId: s6ActiveTrainee1Id,
      amountGrosze: 9900,
      status: "active",
    });
    await db.insert(schema.coachingSubscriptions).values({
      trainerId: s6TrainerId,
      traineeId: s6ActiveTrainee2Id,
      amountGrosze: 4900,
      status: "past_due",
    });
  });

  it("traineeCount = 2 (tylko aktywni; zarchiwizowany wykluczony)", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s6TrainerId);
    expect(profile).not.toBeNull();
    expect(profile!.traineeCount).toBe(2);
  });

  it("logs7d = 1 (log z 3 dni temu)", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s6TrainerId);
    expect(profile!.logs7d).toBe(1);
  });

  it("logs30d = 2 (log z 3 dni + log z 10 dni; log z 40 dni wykluczony)", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s6TrainerId);
    expect(profile!.logs30d).toBe(2);
  });

  it("mrrGrosze = 9900 (tylko active; past_due wykluczone)", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s6TrainerId);
    expect(profile!.mrrGrosze).toBe(9900);
  });

  it("active = true (trener nie zarchiwizowany)", async () => {
    const profile = await getAmbassadorProfile(db, orgAId, s6TrainerId);
    expect(profile!.active).toBe(true);
  });
});
