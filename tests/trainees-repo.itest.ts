// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import { countTraineesOfTrainer, getTraineeOfTrainer, listTraineesOfTrainer } from "~/lib/trainees";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns two trainees (A1, A2). Trainer B owns a trainee unrelated to A —
// used to prove the tenant boundary.
let trainerA = "";
let traineeA1 = "";
let traineeA2 = "";
let trainerB = "";
let traineeB1 = "";

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
  const [pA1] = await db
    .insert(schema.users)
    .values({
      email: "podoa1@example.com",
      displayName: "Podo A1",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA1 = pA1!.id;
  const [pA2] = await db
    .insert(schema.users)
    .values({
      email: "podoa2@example.com",
      displayName: "Podo A2",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA2 = pA2!.id;
  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;
  const [pB1] = await db
    .insert(schema.users)
    .values({
      email: "podob1@example.com",
      displayName: "Podo B1",
      role: "trainee",
      trainerId: trainerB,
    })
    .returning({ id: schema.users.id });
  traineeB1 = pB1!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("trainees repo", () => {
  it("getTraineeOfTrainer zwraca pełny wiersz tylko własnemu trenerowi", async () => {
    expect(await getTraineeOfTrainer(db, trainerA, traineeA1)).toMatchObject({
      id: traineeA1,
      role: "trainee",
    });
    expect(await getTraineeOfTrainer(db, trainerB, traineeA1)).toBeNull();
  });

  it("listTraineesOfTrainer pomija zarchiwizowanych i sortuje po nazwie", async () => {
    await db
      .update(schema.users)
      .set({ archivedAt: new Date() })
      .where(eq(schema.users.id, traineeA2));

    // Trzeci, aktywny podopieczny trenera A — nazwa sortuje się PRZED "Podo A1".
    // Przy jednym aktywnym wierszu (jak wcześniej, po odfiltrowaniu A2) ORDER BY
    // nigdy nie zadziała na więcej niż jednym rekordzie, więc nazwa testu byłaby
    // fałszywa. Sprzątamy ten wiersz na końcu testu, żeby nie zmienić stanu bazy
    // dla kolejnych testów (np. `countTraineesOfTrainer` niżej zakłada dokładnie
    // dwóch podopiecznych trenera A, licząc też zarchiwizowanych).
    const [pA0] = await db
      .insert(schema.users)
      .values({
        email: "podoa0@example.com",
        displayName: "Ada A0",
        role: "trainee",
        trainerId: trainerA,
      })
      .returning({ id: schema.users.id });
    const traineeA0 = pA0!.id;

    try {
      const rows = await listTraineesOfTrainer(db, trainerA);
      expect(rows.map((r) => r.id)).toEqual([traineeA0, traineeA1]);
      expect(rows.map((r) => r.displayName)).toEqual(["Ada A0", "Podo A1"]);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, traineeA0));
    }
  });

  it("countTraineesOfTrainer liczy również zarchiwizowanych", async () => {
    expect(await countTraineesOfTrainer(db, trainerA)).toBe(2);
  });

  it("listTraineesOfTrainer i countTraineesOfTrainer nie widzą cudzych podopiecznych", async () => {
    const rows = await listTraineesOfTrainer(db, trainerB);
    expect(rows.map((r) => r.id)).toEqual([traineeB1]);
    expect(await countTraineesOfTrainer(db, trainerB)).toBe(1);
  });
});
