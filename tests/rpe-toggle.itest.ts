// Test integracyjny — uruchamiany pod Dockerem przez właściciela (testcontainers). NIE uruchamiać w pętli dev.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import { saveWorkoutLog, listLogsForTrainee } from "~/lib/workouts";
import { getEffortBalance } from "~/lib/stats";
import { getExerciseProgression } from "~/lib/progression";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeId = "";
let planId = "";
let planSessionId = "";

// Dwa ćwiczenia: jedno z RPE, drugie bez.
let rpeExId = "";
let noRpeExId = "";

/** Utwórz plan + jedną sesję planu (logi treningów wymagają obu; onDelete: restrict). */
async function seedPlan(
  trnrId: string,
  trnId: string,
  version: number,
): Promise<{ planId: string; planSessionId: string }> {
  const [plan] = await db
    .insert(schema.plans)
    .values({
      trainerId: trnrId,
      traineeId: trnId,
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

  // --- Użytkownicy ---
  const [trainer] = await db
    .insert(schema.users)
    .values({ email: "trener@rpe-toggle.example.com", displayName: "Trener RPE", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerId = trainer!.id;

  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "podopieczny@rpe-toggle.example.com",
      displayName: "Podopieczny RPE",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeId = trainee!.id;

  // --- Plan ---
  const plan = await seedPlan(trainerId, traineeId, 1);
  planId = plan.planId;
  planSessionId = plan.planSessionId;

  // --- Ćwiczenia ---
  const [rpeEx] = await db
    .insert(schema.exercises)
    .values({ trainerId, name: "Pull-up", unit: "REPS", tracksRpe: true })
    .returning({ id: schema.exercises.id });
  rpeExId = rpeEx!.id;

  const [noRpeEx] = await db
    .insert(schema.exercises)
    .values({ trainerId, name: "Plank", unit: "REPS", tracksRpe: false })
    .returning({ id: schema.exercises.id });
  noRpeExId = noRpeEx!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("rpe-toggle", () => {
  it("ćwiczenie bez RPE zapisuje difficulty = NULL", async () => {
    const logId = await saveWorkoutLog(db, {
      trainerId,
      traineeId,
      planId,
      planSessionId,
      sessionName: "Sesja",
      performedOn: "2026-02-01",
      note: null,
      allDone: true,
      exercises: [
        {
          exerciseId: noRpeExId,
          sets: [{ ordinal: 0, reps: 10, difficulty: null, videoFileId: null }],
        },
      ],
    });

    const rows = await db
      .select({ difficulty: schema.workoutSetLogs.difficulty })
      .from(schema.workoutSetLogs)
      .innerJoin(
        schema.workoutExerciseLogs,
        eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId),
      )
      .where(eq(schema.workoutExerciseLogs.workoutLogId, logId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.difficulty).toBeNull();
  });

  it("sesja mieszana liczy avgDifficulty tylko po ocenionych seriach", async () => {
    await saveWorkoutLog(db, {
      trainerId,
      traineeId,
      planId,
      planSessionId,
      sessionName: "Sesja mieszana",
      performedOn: "2026-02-02",
      note: null,
      allDone: true,
      exercises: [
        {
          exerciseId: rpeExId,
          sets: [{ ordinal: 0, reps: 8, difficulty: 8, videoFileId: null }],
        },
        {
          exerciseId: noRpeExId,
          sets: [{ ordinal: 0, reps: 10, difficulty: null, videoFileId: null }],
        },
      ],
    });

    const logs = await listLogsForTrainee(db, traineeId, {});
    const mixed = logs.find((l) => l.performedOn === "2026-02-02");
    expect(mixed).toBeDefined();
    // AVG SQL ignoruje NULL-e — jedyna oceniona seria ma difficulty=8.
    expect(mixed!.avgDifficulty).toBe(8);
  });

  it("ćwiczenie bez RPE → avgRpeInRange null, getEffortBalance pomija sesje bez RPE", async () => {
    // getExerciseProgression: ćwiczenie logowane wyłącznie bez RPE → null w KPI.
    const view = await getExerciseProgression(db, traineeId, noRpeExId, "all");
    expect(view).not.toBeNull();
    expect(view!.kpis.avgRpeInRange).toBeNull();

    // getEffortBalance nie rzuca wyjątku i zwraca wynik.
    const balance = await getEffortBalance(db, traineeId);
    expect(balance).toBeDefined();
    // Sesje składające się wyłącznie z nieocenionych serii nie wchodzą do bilansu
    // (avgRpe = NULL → pomijane w pętli); total musi być liczbą.
    expect(typeof balance.total).toBe("number");
  });
});
