// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  findTraineeOfTrainer,
  getExerciseProgression,
  getProgressionComparison,
  listProgressionExercises,
} from "~/lib/progression";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns trainee P_A (+ a second trainee P_A2). Trainer B owns trainee P_B,
// and has no relation to P_A — used to prove the tenant boundary.
let trainerA = "";
let traineePA = "";
let traineePA2 = "";
let trainerB = "";
let traineePB = "";

// Exercises seeded under each trainer; ids captured for progression assertions.
let pullupId = ""; // P_A's REPS exercise — the one with ≥2 logged sessions.
let dipsId = ""; // P_A's second exercise — gives a comparison series.
let otherTraineeExerciseId = ""; // belongs to P_A2 (under trainer A) — must NOT leak into P_A's data.

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

/** Create a plan + one plan session for a trainee (workout logs require both, onDelete: restrict). */
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

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // --- Users ---
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;
  const [pA] = await db
    .insert(schema.users)
    .values({ email: "podoa@example.com", displayName: "Podo A", role: "trainee", trainerId: trainerA })
    .returning({ id: schema.users.id });
  traineePA = pA!.id;
  const [pA2] = await db
    .insert(schema.users)
    .values({ email: "podoa2@example.com", displayName: "Podo A2", role: "trainee", trainerId: trainerA })
    .returning({ id: schema.users.id });
  traineePA2 = pA2!.id;
  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;
  const [pB] = await db
    .insert(schema.users)
    .values({ email: "podob@example.com", displayName: "Podo B", role: "trainee", trainerId: trainerB })
    .returning({ id: schema.users.id });
  traineePB = pB!.id;

  // --- Exercises (each trainer owns their own library) ---
  const [pullup] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  pullupId = pullup!.id;
  const [dips] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Dips", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  dipsId = dips!.id;
  const [other] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Squat", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  otherTraineeExerciseId = other!.id;

  // --- Plans (one per trainee that logs anything) ---
  const planPA = await seedPlan(trainerA, traineePA, 1);
  const planPA2 = await seedPlan(trainerA, traineePA2, 1);

  // --- P_A logs: Pull-up across two sessions (deterministic, fixed dates) ---
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: "2026-01-05",
    reps: [5, 5, 4],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: "2026-01-12",
    reps: [7, 6, 6],
  });
  // P_A also logs Dips once → gives a second series for the comparison call.
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: dipsId,
    performedOn: "2026-01-05",
    reps: [8, 8],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: dipsId,
    performedOn: "2026-01-12",
    reps: [10, 9],
  });

  // --- P_A2 logs a DIFFERENT exercise → must never appear in P_A's progression ---
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA2,
    planId: planPA2.planId,
    planSessionId: planPA2.planSessionId,
    exerciseId: otherTraineeExerciseId,
    performedOn: "2026-01-10",
    reps: [12, 12],
  });
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("progression tenant scope", () => {
  it("findTraineeOfTrainer: obcy trener nie widzi podopiecznego (→ null)", async () => {
    const asB = await findTraineeOfTrainer(db, trainerB, traineePA);
    expect(asB).toBeNull();
  });

  it("findTraineeOfTrainer: właściwy trener dostaje podopiecznego", async () => {
    const asA = await findTraineeOfTrainer(db, trainerA, traineePA);
    expect(asA).not.toBeNull();
    expect(asA!.id).toBe(traineePA);
  });

  it("listProgressionExercises: zawiera ćwiczenia P_A, nie zawiera cudzych logów", async () => {
    const list = await listProgressionExercises(db, traineePA);
    expect(list.length).toBeGreaterThan(0);

    const ids = list.map((r) => r.exerciseId);
    expect(ids).toContain(pullupId);
    expect(ids).toContain(dipsId);
    // P_A2's exercise (logged under the same trainer) must NOT leak across trainees.
    expect(ids).not.toContain(otherTraineeExerciseId);

    const pullupRow = list.find((r) => r.exerciseId === pullupId)!;
    expect(pullupRow.name).toBe("Pull-up");
    expect(pullupRow.unit).toBe("REPS");
    expect(pullupRow.sessionCount).toBe(2);
    expect(pullupRow.pr).toBe(7); // best single set across both sessions
  });

  it("getExerciseProgression: zwraca dane wyłącznie z logów P_A", async () => {
    const view = await getExerciseProgression(db, traineePA, pullupId, "all");
    expect(view).not.toBeNull();
    expect(view!.exercise.id).toBe(pullupId);
    expect(view!.kpis.sessionsInRange).toBeGreaterThanOrEqual(2);
    expect(view!.kpis.pr).toBe(7);
    // range "all" aggregates weekly (shouldAggregateWeekly("all") === true), so
    // granularity is "week". The two seeded sessions fall on Mondays in distinct
    // ISO weeks, so each collapses to a week-start key equal to its own date.
    // ("all" is used deliberately so the January seed stays in range regardless
    // of when the owner runs the test — a "4w" range would exclude past dates.)
    expect(view!.granularity).toBe("week");
    expect(view!.points.length).toBe(2);
    expect(view!.points.map((p) => p.key)).toEqual(["2026-01-05", "2026-01-12"]);
  });

  it("getExerciseProgression: cudze ćwiczenie nie jest widoczne dla P_A (→ null)", async () => {
    const leaked = await getExerciseProgression(db, traineePA, otherTraineeExerciseId, "all");
    expect(leaked).toBeNull();
  });

  it("getProgressionComparison: zwraca serie/pominięte bez wyjątku", async () => {
    const cmp = await getProgressionComparison(db, traineePA, [pullupId, dipsId], "all");
    const seriesIds = cmp.series.map((s) => s.exerciseId);
    expect(seriesIds).toContain(pullupId);
    expect(seriesIds).toContain(dipsId);
    // The cross-tenant exercise yields no data for P_A → reported as skipped, not series.
    const cmp2 = await getProgressionComparison(db, traineePA, [otherTraineeExerciseId], "all");
    expect(cmp2.series).toHaveLength(0);
    expect(cmp2.skipped.map((s) => s.exerciseId)).toContain(otherTraineeExerciseId);
  });
});
