// Integration test — owner runs under Docker (testcontainers). Do NOT run in the no-Docker loop.
// Uruchamia właściciel pod Dockerem: npm run test:itest
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import { promoteTrainerCatalogToBrand } from "~/lib/catalog";
import { ensureOrganization, ensureRegion, assignUserToOrgRegion } from "~/lib/organizations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Współdzielone id ustawiane w beforeAll.
let orgId: string;
let trainerA: string; // founder org
let traineeInOrg: string; // podopieczny (trainerId = A)

// Własny (niesforkowany) katalog foundera A — promowany do marki.
let ownExerciseA: string; // referencja z plan_items i workout_exercise_logs
let ownSkillA: string; // ma wariant (skill_variation) wskazujący ownExerciseA
let ownSkillReqA: string; // drugi skill — prerekwizyt do krawędzi prereq
let prereqEdgeId: string; // krawędź skill_prerequisites trenera A
let variationId: string; // wariant ownSkillA → ownExerciseA

// FK referencje, których id muszą pozostać ważne po promocji.
let planItemId: string;
let workoutExerciseLogId: string;

// Fork (origin_id ustawione) — NIE promowany.
let brandExerciseId: string; // markowy oryginał (trainer_id NULL)
let forkExerciseId: string; // fork foundera A: trainer_id=A, origin_id=brand
let brandSkillId: string;
let forkSkillId: string; // fork skilla foundera A

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // Organizacja + region + founder A przypisany do org.
  orgId = await ensureOrganization(db, "Marka Globalna");
  const regionId = await ensureRegion(db, {
    organizationId: orgId,
    name: "Polska",
    country: "PL",
    currency: "pln",
    locale: "pl-PL",
  });
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "founder-a@example.com", displayName: "Founder A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;
  await assignUserToOrgRegion(db, trainerA, orgId, regionId);

  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "podopieczny@example.com",
      displayName: "Podopieczny",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeInOrg = trainee!.id;

  // Własne ćwiczenie A (trainer_id=A, origin_id NULL) — kandydat do promocji.
  const [ownEx] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, organizationId: null, name: "Własne A", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  ownExerciseA = ownEx!.id;

  // Własne skille A (trainer_id=A) — kandydaci do promocji.
  const [ownSk] = await db
    .insert(schema.skills)
    .values({ trainerId: trainerA, organizationId: null, name: "Front Lever" })
    .returning({ id: schema.skills.id });
  ownSkillA = ownSk!.id;
  const [ownReq] = await db
    .insert(schema.skills)
    .values({ trainerId: trainerA, organizationId: null, name: "Tuck Front Lever" })
    .returning({ id: schema.skills.id });
  ownSkillReqA = ownReq!.id;

  // Wariant ownSkillA → ownExerciseA (FK do exercises, którego id ma przetrwać).
  const [variation] = await db
    .insert(schema.skillVariations)
    .values({ skillId: ownSkillA, exerciseId: ownExerciseA, ordinal: 0 })
    .returning({ id: schema.skillVariations.id });
  variationId = variation!.id;

  // Krawędź prereq trenera A: ownSkillA wymaga ownSkillReqA.
  const [edge] = await db
    .insert(schema.skillPrerequisites)
    .values({
      trainerId: trainerA,
      organizationId: null,
      skillId: ownSkillA,
      requiresSkillId: ownSkillReqA,
    })
    .returning({ id: schema.skillPrerequisites.id });
  prereqEdgeId = edge!.id;

  // Plan A → sesja → blok → item odwołujący się do ownExerciseA (FK plan_items.exercise_id).
  const [plan] = await db
    .insert(schema.plans)
    .values({
      trainerId: trainerA,
      traineeId: traineeInOrg,
      name: "Plan A",
      version: 1,
      status: "active",
    })
    .returning({ id: schema.plans.id });
  const [session] = await db
    .insert(schema.planSessions)
    .values({ planId: plan!.id, ordinal: 0, name: "Sesja 1" })
    .returning({ id: schema.planSessions.id });
  const [block] = await db
    .insert(schema.planBlocks)
    .values({ planSessionId: session!.id, ordinal: 0, kind: "single" })
    .returning({ id: schema.planBlocks.id });
  const [item] = await db
    .insert(schema.planItems)
    .values({
      planBlockId: block!.id,
      ordinal: 0,
      exerciseId: ownExerciseA,
      sets: 3,
      restSeconds: 120,
      reps: 5,
      unit: "REPS",
    })
    .returning({ id: schema.planItems.id });
  planItemId = item!.id;

  // Workout log A → wpis odwołujący się do ownExerciseA (FK workout_exercise_logs.exercise_id).
  const [wlog] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerA,
      traineeId: traineeInOrg,
      planId: plan!.id,
      planSessionId: session!.id,
      sessionName: "Sesja 1",
      performedOn: "2026-06-01",
    })
    .returning({ id: schema.workoutLogs.id });
  const [welog] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: wlog!.id, ordinal: 0, exerciseId: ownExerciseA })
    .returning({ id: schema.workoutExerciseLogs.id });
  workoutExerciseLogId = welog!.id;

  // Markowy oryginał + fork foundera A (origin_id ustawione) — fork NIE jest promowany.
  const [brandEx] = await db
    .insert(schema.exercises)
    .values({ trainerId: null, organizationId: orgId, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  brandExerciseId = brandEx!.id;
  const [forkEx] = await db
    .insert(schema.exercises)
    .values({
      trainerId: trainerA,
      organizationId: null,
      originId: brandExerciseId,
      name: "Pull-up",
      unit: "REPS",
    })
    .returning({ id: schema.exercises.id });
  forkExerciseId = forkEx!.id;

  const [brandSk] = await db
    .insert(schema.skills)
    .values({ trainerId: null, organizationId: orgId, name: "Planche" })
    .returning({ id: schema.skills.id });
  brandSkillId = brandSk!.id;
  const [forkSk] = await db
    .insert(schema.skills)
    .values({
      trainerId: trainerA,
      organizationId: null,
      originId: brandSkillId,
      name: "Planche",
    })
    .returning({ id: schema.skills.id });
  forkSkillId = forkSk!.id;
}, 180000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("promoteTrainerCatalogToBrand", () => {
  it("promuje własny kanon A do marki IN PLACE (to samo id, FK pozostają ważne)", async () => {
    const res = await promoteTrainerCatalogToBrand(db, {
      trainerId: trainerA,
      organizationId: orgId,
    });
    // Liczniki: 1 własne ćwiczenie, 2 własne skille, 1 krawędź prereq.
    expect(res).toEqual({ exercises: 1, skills: 2, prerequisites: 1 });

    // Ćwiczenie: TO SAMO id, teraz markowe (trainer_id NULL, org = org).
    const [ex] = await db
      .select({
        id: schema.exercises.id,
        trainerId: schema.exercises.trainerId,
        organizationId: schema.exercises.organizationId,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, ownExerciseA))
      .limit(1);
    expect(ex!.id).toBe(ownExerciseA); // id niezmienione
    expect(ex!.trainerId).toBeNull();
    expect(ex!.organizationId).toBe(orgId);

    // Skille: TO SAMO id, teraz markowe.
    const skillRows = await db
      .select({
        id: schema.skills.id,
        trainerId: schema.skills.trainerId,
        organizationId: schema.skills.organizationId,
      })
      .from(schema.skills)
      .where(eq(schema.skills.id, ownSkillA));
    expect(skillRows[0]!.trainerId).toBeNull();
    expect(skillRows[0]!.organizationId).toBe(orgId);

    // Krawędź prereq: TO SAMO id, teraz markowa.
    const [edge] = await db
      .select({
        id: schema.skillPrerequisites.id,
        trainerId: schema.skillPrerequisites.trainerId,
        organizationId: schema.skillPrerequisites.organizationId,
      })
      .from(schema.skillPrerequisites)
      .where(eq(schema.skillPrerequisites.id, prereqEdgeId))
      .limit(1);
    expect(edge!.trainerId).toBeNull();
    expect(edge!.organizationId).toBe(orgId);

    // FK z plan_items nadal wskazuje to samo ćwiczenie — join działa.
    const [joinedPlan] = await db
      .select({ exId: schema.exercises.id })
      .from(schema.planItems)
      .innerJoin(schema.exercises, eq(schema.planItems.exerciseId, schema.exercises.id))
      .where(eq(schema.planItems.id, planItemId))
      .limit(1);
    expect(joinedPlan!.exId).toBe(ownExerciseA);

    // FK z workout_exercise_logs nadal wskazuje to samo ćwiczenie — join działa.
    const [joinedLog] = await db
      .select({ exId: schema.exercises.id })
      .from(schema.workoutExerciseLogs)
      .innerJoin(schema.exercises, eq(schema.workoutExerciseLogs.exerciseId, schema.exercises.id))
      .where(eq(schema.workoutExerciseLogs.id, workoutExerciseLogId))
      .limit(1);
    expect(joinedLog!.exId).toBe(ownExerciseA);

    // FK z skill_variations nadal wskazuje to samo ćwiczenie i skill — join działa.
    const [joinedVar] = await db
      .select({ exId: schema.exercises.id, skId: schema.skills.id })
      .from(schema.skillVariations)
      .innerJoin(schema.exercises, eq(schema.skillVariations.exerciseId, schema.exercises.id))
      .innerJoin(schema.skills, eq(schema.skillVariations.skillId, schema.skills.id))
      .where(eq(schema.skillVariations.id, variationId))
      .limit(1);
    expect(joinedVar!.exId).toBe(ownExerciseA);
    expect(joinedVar!.skId).toBe(ownSkillA);
  });

  it("NIE promuje forków (origin_id ustawione) — pozostają trenerskie", async () => {
    const [forkEx] = await db
      .select({
        trainerId: schema.exercises.trainerId,
        organizationId: schema.exercises.organizationId,
        originId: schema.exercises.originId,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, forkExerciseId))
      .limit(1);
    expect(forkEx!.trainerId).toBe(trainerA);
    expect(forkEx!.organizationId).toBeNull();
    expect(forkEx!.originId).toBe(brandExerciseId);

    const [forkSk] = await db
      .select({
        trainerId: schema.skills.trainerId,
        organizationId: schema.skills.organizationId,
        originId: schema.skills.originId,
      })
      .from(schema.skills)
      .where(eq(schema.skills.id, forkSkillId))
      .limit(1);
    expect(forkSk!.trainerId).toBe(trainerA);
    expect(forkSk!.organizationId).toBeNull();
    expect(forkSk!.originId).toBe(brandSkillId);
  });

  it("idempotentny: drugie wywołanie nic nie promuje i nie zmienia danych", async () => {
    const res = await promoteTrainerCatalogToBrand(db, {
      trainerId: trainerA,
      organizationId: orgId,
    });
    expect(res).toEqual({ exercises: 0, skills: 0, prerequisites: 0 });

    // Brak wierszy trenerskich (origin_id NULL) pozostałych dla A po promocji
    // (poza forkami z origin_id ustawionym, które celowo pomijamy).
    const leftoverEx = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.trainerId, trainerA), isNull(schema.exercises.originId)));
    expect(leftoverEx.length).toBe(0);
    const leftoverSk = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(eq(schema.skills.trainerId, trainerA), isNull(schema.skills.originId)));
    expect(leftoverSk.length).toBe(0);

    // Promowane wiersze nadal markowe (bez regresji).
    const [ex] = await db
      .select({ trainerId: schema.exercises.trainerId })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, ownExerciseA))
      .limit(1);
    expect(ex!.trainerId).toBeNull();
  });

  it("CHECK *_owner_check spełniony po promocji (dokładnie jeden właściciel)", async () => {
    // Markowe wiersze A: trainer_id NULL ∧ organization_id = org → pierwszy dysjunkt.
    const promotedEx = await db
      .select({ trainerId: schema.exercises.trainerId, orgId: schema.exercises.organizationId })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, ownExerciseA));
    for (const r of promotedEx) {
      expect(r.trainerId === null && r.orgId !== null).toBe(true);
    }
    // Brak wyjątku z poprzednich UPDATE-ów już dowodzi, że CHECK nie pękł;
    // tu domykamy asercję na kształcie własności promowanych skilli i krawędzi.
    const promotedSk = await db
      .select({ trainerId: schema.skills.trainerId, orgId: schema.skills.organizationId })
      .from(schema.skills)
      .where(isNull(schema.skills.trainerId));
    for (const r of promotedSk) {
      expect(r.trainerId === null && r.orgId !== null).toBe(true);
    }
  });
});
