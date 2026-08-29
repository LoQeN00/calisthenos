// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  countPlansByStatusForTrainer,
  countPlansForTrainer,
  countPlansForTrainerByStatus,
  countSessionsInPlan,
  findPlanStatusForTrainer,
  listPlansForTrainee,
  listPlansForTrainer,
} from "~/lib/plans";
import { countLogsForTrainerSince, listRecentLogsForTrainer } from "~/lib/workouts";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns two trainees:
// - Anna Kowalska: one ACTIVE plan ("Masa zimowa", 3 sesje) + one ARCHIVED plan
//   ("Stara baza") — archived proves it's excluded from counts/lists/tabs.
// - Bartek Nowak: one DRAFT plan ("Redukcja", 0 sesji) — proves LEFT JOIN + COALESCE
//   keeps a plan with no sessions on the list instead of dropping it.
// Trainer B owns nothing — used to prove the tenant boundary.
let trainerA = "";
let trainerB = "";
let traineeAnna = "";
let traineeBartek = "";
let planActiveId = "";
let planArchivedId = "";
let planDraftId = "";

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

  const [anna] = await db
    .insert(schema.users)
    .values({
      email: "anna@example.com",
      displayName: "Anna Kowalska",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeAnna = anna!.id;
  const [bartek] = await db
    .insert(schema.users)
    .values({
      email: "bartek@example.com",
      displayName: "Bartek Nowak",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeBartek = bartek!.id;

  // --- Plans ---
  const [planActive] = await db
    .insert(schema.plans)
    .values({
      trainerId: trainerA,
      traineeId: traineeAnna,
      name: "Masa zimowa",
      version: 1,
      basedOnVersion: null,
      status: "active",
      publishedAt: new Date(),
    })
    .returning({ id: schema.plans.id });
  planActiveId = planActive!.id;

  const [planArchived] = await db
    .insert(schema.plans)
    .values({
      trainerId: trainerA,
      traineeId: traineeAnna,
      name: "Stara baza",
      version: 2,
      basedOnVersion: 1,
      status: "archived",
    })
    .returning({ id: schema.plans.id });
  planArchivedId = planArchived!.id;

  const [planDraft] = await db
    .insert(schema.plans)
    .values({
      trainerId: trainerA,
      traineeId: traineeBartek,
      name: "Redukcja",
      version: 1,
      basedOnVersion: null,
      status: "draft",
    })
    .returning({ id: schema.plans.id });
  planDraftId = planDraft!.id;

  // 3 sessions on the active plan; the draft plan stays session-less on purpose.
  const insertedSessions = await db
    .insert(schema.planSessions)
    .values([
      { planId: planActiveId, ordinal: 0, name: "Sesja A" },
      { planId: planActiveId, ordinal: 1, name: "Sesja B" },
      { planId: planActiveId, ordinal: 2, name: "Sesja C" },
    ])
    .returning({ id: schema.planSessions.id });
  const sessionAId = insertedSessions[0]!.id;

  // Two workout logs for trainerA/traineeAnna against the active plan: one recent
  // (within the "last 7 days" window used by listRecentLogsForTrainer/
  // countLogsForTrainerSince), one older — proves the date filter actually filters.
  await db.insert(schema.workoutLogs).values([
    {
      trainerId: trainerA,
      traineeId: traineeAnna,
      planId: planActiveId,
      planSessionId: sessionAId,
      sessionName: "Sesja A",
      performedOn: "2026-07-25",
    },
    {
      trainerId: trainerA,
      traineeId: traineeAnna,
      planId: planActiveId,
      planSessionId: sessionAId,
      sessionName: "Sesja A",
      performedOn: "2026-07-10",
    },
  ]);
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("plans repo", () => {
  it("countPlansByStatusForTrainer pomija zarchiwizowane", async () => {
    expect(await countPlansByStatusForTrainer(db, trainerA)).toEqual({
      all: 2,
      active: 1,
      draft: 1,
    });
  });

  it("listPlansForTrainer szuka po nazwie planu I nazwie podopiecznego", async () => {
    const byPlan = await listPlansForTrainer(db, trainerA, {
      status: "all",
      q: "Masa",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]!.plan.id).toBe(planActiveId);

    const byTrainee = await listPlansForTrainer(db, trainerA, {
      status: "all",
      q: "Anna",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(byTrainee).toHaveLength(1);
    expect(byTrainee[0]!.plan.id).toBe(planActiveId);
  });

  it("listPlansForTrainer zwraca liczbę sesji planu", async () => {
    const rows = await listPlansForTrainer(db, trainerA, {
      status: "active",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(rows[0]!.sessionCount).toBe(3);
  });

  it("listPlansForTrainer nie gubi planu bez sesji — sessionCount = 0, nie zniknięcie z listy", async () => {
    const rows = await listPlansForTrainer(db, trainerA, {
      status: "draft",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan.id).toBe(planDraftId);
    expect(rows[0]!.sessionCount).toBe(0);
  });

  it("listPlansForTrainer nie pokazuje planów innego trenera", async () => {
    expect(await countPlansForTrainer(db, trainerB, { status: "all" })).toBe(0);
    const rows = await listPlansForTrainer(db, trainerB, {
      status: "all",
      sort: "newest",
      limit: 20,
      offset: 0,
    });
    expect(rows).toHaveLength(0);
  });

  it("findPlanStatusForTrainer zwraca null dla obcego trenera", async () => {
    expect(await findPlanStatusForTrainer(db, planActiveId, trainerB)).toBeNull();
    expect(await findPlanStatusForTrainer(db, planActiveId, trainerA)).toEqual({
      status: "active",
      traineeId: traineeAnna,
    });
  });

  it("countPlansForTrainerByStatus(null) liczy WSZYSTKIE plany, w tym zarchiwizowane", async () => {
    // Kontrast z countPlansByStatusForTrainer (pomija archived) — to jest
    // celowo inny zakres, używany przez licznik nawigacji.
    expect(await countPlansForTrainerByStatus(db, trainerA, null)).toBe(3);
    expect(await countPlansForTrainerByStatus(db, trainerA, "active")).toBe(1);
    expect(await countPlansForTrainerByStatus(db, trainerA, "draft")).toBe(1);
  });

  it("listPlansForTrainee zwraca WSZYSTKIE plany pary, także zarchiwizowane", async () => {
    const rows = await listPlansForTrainee(db, trainerA, traineeAnna);
    expect(rows.map((r) => r.id).sort()).toEqual([planActiveId, planArchivedId].sort());
  });

  it("listRecentLogsForTrainer zwraca logi wszystkich podopiecznych trenera, najnowsze pierwsze", async () => {
    const rows = await listRecentLogsForTrainer(db, trainerA, 6);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.log.performedOn >= rows[1]!.log.performedOn).toBe(true);
    expect(rows[0]!.trainee.displayName).toBeTruthy();
  });

  it("countLogsForTrainerSince liczy tylko od podanej daty i tylko własnych", async () => {
    expect(await countLogsForTrainerSince(db, trainerA, "2026-07-21")).toBe(1);
    expect(await countLogsForTrainerSince(db, trainerB, "2026-07-21")).toBe(0);
  });

  it("countSessionsInPlan zwraca 0 dla planu bez sesji", async () => {
    expect(await countSessionsInPlan(db, planDraftId)).toBe(0);
  });
});
