// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  countActiveExercisesForTrainer,
  countExercisesForTrainer,
  getExerciseForTrainer,
  getExerciseWithDemoForTrainer,
  listActiveExercisesForTrainer,
  listExercisesForTrainer,
  setExerciseArchived,
} from "~/lib/exercises";
import { addVariation, createSkill } from "~/lib/skills";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns three exercises (Pull-up, Dip, and one archived — Push-up).
// Trainer B owns an unrelated exercise — used to prove the tenant boundary.
let trainerA = "";
let trainerB = "";
let pullUpId = "";
let dipId = "";
let pushUpArchivedId = "";
let exerciseB = "";

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
  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  // --- Exercises (trainer A) ---
  const [pullUp] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS", tags: ["plecy"] })
    .returning({ id: schema.exercises.id });
  pullUpId = pullUp!.id;
  const [dip] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Dip", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  dipId = dip!.id;
  const [pushUp] = await db
    .insert(schema.exercises)
    .values({
      trainerId: trainerA,
      name: "Push-up",
      unit: "REPS",
      archivedAt: new Date(),
    })
    .returning({ id: schema.exercises.id });
  pushUpArchivedId = pushUp!.id;

  // --- Exercise (trainer B) ---
  const [exB] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerB, name: "Squat", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exerciseB = exB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("exercises repo", () => {
  it("listActiveExercisesForTrainer zwraca aktywne ćwiczenia trenera po nazwie", async () => {
    const rows = await listActiveExercisesForTrainer(db, trainerA);
    expect(rows.map((r) => r.name)).toEqual(["Dip", "Pull-up"]);
  });

  it("listActiveExercisesForTrainer NIE odfiltrowuje wariantów umiejętności", async () => {
    // Regresja: podmiana na listAssignableExercises okroiłaby picker edytora planów.
    const skillA = await createSkill(db, trainerA, "Front Lever", "", "basic");
    await addVariation(db, trainerA, skillA.id, pullUpId);
    const rows = await listActiveExercisesForTrainer(db, trainerA);
    expect(rows.map((r) => r.name)).toContain("Pull-up");
  });

  it("listActiveExercisesForTrainer nie widzi cudzych ani zarchiwizowanych ćwiczeń", async () => {
    const rows = await listActiveExercisesForTrainer(db, trainerA);
    expect(rows.map((r) => r.id)).not.toContain(exerciseB);
    expect(rows.map((r) => r.id)).not.toContain(pushUpArchivedId);
  });

  it("countActiveExercisesForTrainer liczy tylko aktywne ćwiczenia trenera", async () => {
    expect(await countActiveExercisesForTrainer(db, trainerA)).toBe(2);
    expect(await countActiveExercisesForTrainer(db, trainerB)).toBe(1);
  });

  it("getExerciseWithDemoForTrainer nie przecieka między tenantami", async () => {
    expect(await getExerciseWithDemoForTrainer(db, trainerB, pullUpId)).toBeNull();
  });

  it("getExerciseWithDemoForTrainer zwraca ćwiczenie własnemu trenerowi z null demoFile", async () => {
    const row = await getExerciseWithDemoForTrainer(db, trainerA, pullUpId);
    expect(row).toMatchObject({ exercise: { id: pullUpId, name: "Pull-up" }, demoFile: null });
  });

  it("getExerciseForTrainer nie przecieka między tenantami", async () => {
    expect(await getExerciseForTrainer(db, trainerB, pullUpId)).toBeNull();
  });

  it("setExerciseArchived jest no-opem dla obcego trenera", async () => {
    await setExerciseArchived(db, trainerB, pullUpId, true);
    const still = await getExerciseForTrainer(db, trainerA, pullUpId);
    expect(still?.archivedAt).toBeNull();
  });

  it("setExerciseArchived archiwizuje i przywraca ćwiczenie własnego trenera", async () => {
    await setExerciseArchived(db, trainerA, dipId, true);
    const archived = await getExerciseForTrainer(db, trainerA, dipId);
    expect(archived?.archivedAt).not.toBeNull();

    await setExerciseArchived(db, trainerA, dipId, false);
    const restored = await getExerciseForTrainer(db, trainerA, dipId);
    expect(restored?.archivedAt).toBeNull();
  });

  it("listExercisesForTrainer filtruje po szukajce, tagu i jednostce", async () => {
    const rows = await listExercisesForTrainer(db, trainerA, {
      q: "pull",
      sort: "name_asc",
      limit: 24,
      offset: 0,
    });
    expect(rows.map((r) => r.exercise.name)).toEqual(["Pull-up"]);

    const byUnit = await listExercisesForTrainer(db, trainerA, {
      unit: "SEC",
      sort: "name_asc",
      limit: 24,
      offset: 0,
    });
    expect(byUnit.every((r) => r.exercise.unit === "SEC")).toBe(true);

    const byTag = await listExercisesForTrainer(db, trainerA, {
      tag: "plecy",
      sort: "name_asc",
      limit: 24,
      offset: 0,
    });
    expect(byTag.map((r) => r.exercise.name)).toEqual(["Pull-up"]);
  });

  it("countExercisesForTrainer liczy z tym samym filtrem co lista", async () => {
    expect(await countExercisesForTrainer(db, trainerA, { q: "pull" })).toBe(1);
  });

  it("lista i licznik nie przeciekają między tenantami", async () => {
    // Trener B ma dokładnie jedno własne aktywne ćwiczenie (Squat) — gdyby trainerId
    // nie wchodził do WHERE, liczba objęłaby też aktywne ćwiczenia trenera A.
    expect(await countExercisesForTrainer(db, trainerB, {})).toBe(1);
  });
});
