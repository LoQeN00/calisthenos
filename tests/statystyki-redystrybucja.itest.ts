// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import { findTraineeOfTrainer } from "~/lib/progression";
import {
  getActivityHeatmap,
  getEffortBalance,
  getHealthStats,
  getHeroStats,
  getPlateauExercises,
  getTagDistribution,
} from "~/lib/stats";

// -- redirect loader shims (tested by calling loaders directly; no auth needed) --
import type { LoaderFunctionArgs } from "react-router";
import { loader as statystykiPodopiecznyLoader } from "~/routes/podopieczny/statystyki";
import { loader as statystykiTrenerLoader } from "~/routes/trener/podopieczni.$traineeId.statystyki";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns trainee P_A. Trainer B owns trainee P_B — used to prove tenant boundary.
let trainerA = "";
let traineePA = "";
let trainerB = "";
let traineePB = "";

/** Create a plan + one plan session for a trainee (workout logs require both). */
async function seedPlan(
  trainerId: string,
  traineeId: string,
  version: number,
): Promise<{ planId: string; planSessionId: string }> {
  const [plan] = await db
    .insert(schema.plans)
    .values({
      trainerId,
      traineeId,
      name: "Plan",
      version,
      status: "active",
    })
    .returning({ id: schema.plans.id });
  const [planSession] = await db
    .insert(schema.planSessions)
    .values({ planId: plan!.id, ordinal: 0, name: "Sesja A" })
    .returning({ id: schema.planSessions.id });
  return { planId: plan!.id, planSessionId: planSession!.id };
}

/** Seed one workout session for a trainee on a fixed date with a single exercise + sets. */
async function seedSession(opts: {
  trainerId: string;
  traineeId: string;
  planId: string;
  planSessionId: string;
  exerciseId: string;
  performedOn: string;
  reps: number[];
}): Promise<void> {
  const [log] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: opts.trainerId,
      traineeId: opts.traineeId,
      planId: opts.planId,
      planSessionId: opts.planSessionId,
      sessionName: "Sesja",
      performedOn: opts.performedOn,
    })
    .returning({ id: schema.workoutLogs.id });
  const [exLog] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: log!.id, ordinal: 0, exerciseId: opts.exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values(
    opts.reps.map((reps, i) => ({
      workoutExerciseLogId: exLog!.id,
      ordinal: i,
      reps,
      difficulty: 6,
    })),
  );
}

/** Build a minimal LoaderFunctionArgs (no auth — redirect loaders don't need it). */
function makeArgs(url: string, params: Record<string, string> = {}): LoaderFunctionArgs {
  return {
    request: new Request(url),
    params,
    context: {},
  } as unknown as LoaderFunctionArgs;
}

/** Extract `Location` header from a redirect Response returned by a loader. */
function locationOf(response: Response): string {
  return response.headers.get("Location") ?? "";
}

let pullupId = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // --- Users ---
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@statystyki.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [pA] = await db
    .insert(schema.users)
    .values({
      email: "podoa@statystyki.example.com",
      displayName: "Podo A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineePA = pA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@statystyki.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pB] = await db
    .insert(schema.users)
    .values({
      email: "podob@statystyki.example.com",
      displayName: "Podo B",
      role: "trainee",
      trainerId: trainerB,
    })
    .returning({ id: schema.users.id });
  traineePB = pB!.id;

  // --- Exercises ---
  const [pullup] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  pullupId = pullup!.id;

  // --- Plan + sessions ---
  const planPA = await seedPlan(trainerA, traineePA, 1);

  // Seed two sessions so sessionsLast30 / totalSessions are reliably >= 1 when
  // running on dates far from 2026-06-01. Use "all" range where needed — use a
  // wide range so data doesn't age out relative to `isoDaysAgo(30)`.
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 5 days ago
    reps: [5, 5, 4],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 10 days ago
    reps: [7, 6, 6],
  });
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// 1. Redirects (301): statystyki → nowe URL-e
// ---------------------------------------------------------------------------
describe("redirecty: /podopieczny/statystyki → /podopieczny", () => {
  it("/podopieczny/statystyki → /podopieczny (301)", async () => {
    // statystykiPodopiecznyLoader takes no args (loader() → redirect) — cast to suppress TS.
    const resp = await (statystykiPodopiecznyLoader as () => Promise<Response>)();
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe("/podopieczny");
  });
});

describe("redirecty: /trener/podopieczni/:id/statystyki → /trener/podopieczni/:id", () => {
  it("/trener/podopieczni/:traineeId/statystyki → /trener/podopieczni/:traineeId (301)", async () => {
    const fakeId = "trainee-fake-id-abc";
    const resp = await (statystykiTrenerLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs(`http://localhost/trener/podopieczni/${fakeId}/statystyki`, {
        traineeId: fakeId,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/trener/podopieczni/${fakeId}`);
  });

  it("traineeId pusty string → Location: /trener/podopieczni/", async () => {
    // Verify redirect works even when params.traineeId is undefined (→ empty string fallback).
    const resp = await (statystykiTrenerLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs("http://localhost/trener/podopieczni//statystyki", {}),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe("/trener/podopieczni/");
  });
});

// ---------------------------------------------------------------------------
// 2. Trainer client-view stats are scoped (tested via lib layer)
// ---------------------------------------------------------------------------
// The route loader in podopieczni.$traineeId.tsx uses requireUser (reads
// from the global DB singleton), so we test auth/tenant scoping at the
// repository layer — exactly as rozwoj.itest.ts does for progression.

describe("tenant-scope: trener A → 404 na podopiecznym trenera B", () => {
  it("findTraineeOfTrainer: trener A nie widzi podopiecznego trenera B (→ null)", async () => {
    const result = await findTraineeOfTrainer(db, trainerA, traineePB);
    expect(result).toBeNull();
  });

  it("findTraineeOfTrainer: trener B nie widzi podopiecznego trenera A (→ null)", async () => {
    const result = await findTraineeOfTrainer(db, trainerB, traineePA);
    expect(result).toBeNull();
  });

  it("findTraineeOfTrainer: właściwy trener widzi swojego podopiecznego", async () => {
    const result = await findTraineeOfTrainer(db, trainerA, traineePA);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(traineePA);
  });
});

describe("trainer client-view stats payload: getHealthStats / getPlateauExercises / getTagDistribution", () => {
  it("getHealthStats: sessionsLast30 >= 1 dla podopiecznego z logami", async () => {
    const health = await getHealthStats(db, traineePA);
    expect(health).toBeDefined();
    // Two sessions were seeded within the last 10 days → sessionsLast30 must be >= 1.
    expect(health.sessionsLast30).toBeGreaterThanOrEqual(1);
  });

  it("getHealthStats: zawiera wymagane klucze", async () => {
    const health = await getHealthStats(db, traineePA);
    expect(health).toHaveProperty("sessionsLast30");
    expect(health).toHaveProperty("sessionsLast7");
    expect(health).toHaveProperty("rpeTrend");
    expect(health).toHaveProperty("hasAnyLog30d");
  });

  it("getHealthStats: brak logów → sessionsLast30 = 0 dla podopiecznego bez logów", async () => {
    const health = await getHealthStats(db, traineePB);
    expect(health.sessionsLast30).toBe(0);
  });

  it("getPlateauExercises: zwraca tablicę (może być pusta bez wystarczających danych)", async () => {
    const plateau = await getPlateauExercises(db, traineePA);
    expect(Array.isArray(plateau)).toBe(true);
  });

  it("getTagDistribution: zwraca shares + untagged + totalExerciseLogs dla trenera A", async () => {
    const tagDist = await getTagDistribution(db, traineePA, 30);
    expect(tagDist).toHaveProperty("shares");
    expect(tagDist).toHaveProperty("untagged");
    expect(tagDist).toHaveProperty("totalExerciseLogs");
    expect(Array.isArray(tagDist.shares)).toBe(true);
  });

  it("getTagDistribution: cudze dane nie wyciekają — podopieczny trenera B ma 0 logów", async () => {
    const tagDist = await getTagDistribution(db, traineePB, 30);
    expect(tagDist.totalExerciseLogs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Podopieczny dashboard: hero / heatmap / effort scoped per trainee
// ---------------------------------------------------------------------------
describe("podopieczny dashboard: hero / heatmap / effort są powiązane z traineeId", () => {
  it("getHeroStats: totalSessions >= 1 dla podopiecznego z logami", async () => {
    const hero = await getHeroStats(db, traineePA);
    expect(hero).toBeDefined();
    expect(hero.totalSessions).toBeGreaterThanOrEqual(1);
  });

  it("getHeroStats: zawiera wymagane klucze", async () => {
    const hero = await getHeroStats(db, traineePA);
    expect(hero).toHaveProperty("totalSessions");
    expect(hero).toHaveProperty("totalReps");
    expect(hero).toHaveProperty("streakWeeks");
    expect(hero).toHaveProperty("firstSessionOn");
  });

  it("getHeroStats: podopieczny trenera B — brak logów → totalSessions = 0", async () => {
    const hero = await getHeroStats(db, traineePB);
    expect(hero.totalSessions).toBe(0);
  });

  it("getActivityHeatmap: zwraca tablicę dni (może być <= 26*7)", async () => {
    const heatmap = await getActivityHeatmap(db, traineePA, 26);
    expect(Array.isArray(heatmap)).toBe(true);
    // Heatmap should have at least 1 entry (one per week for 26 weeks).
    expect(heatmap.length).toBeGreaterThan(0);
  });

  it("getEffortBalance: zawiera klucze easy / mid / hard / verdict", async () => {
    const effort = await getEffortBalance(db, traineePA);
    expect(effort).toHaveProperty("easy");
    expect(effort).toHaveProperty("mid");
    expect(effort).toHaveProperty("hard");
    expect(effort).toHaveProperty("verdict");
  });

  it("cudze dane nie wyciekają: getHeroStats dla P_B nie widzi sesji P_A", async () => {
    const heroB = await getHeroStats(db, traineePB);
    const heroA = await getHeroStats(db, traineePA);
    // P_B has no logs — P_A's sessions must not appear.
    expect(heroB.totalSessions).toBe(0);
    // P_A should have their own sessions.
    expect(heroA.totalSessions).toBeGreaterThanOrEqual(1);
  });
});
