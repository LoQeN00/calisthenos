// Uruchamia właściciel pod Dockerem: npm run test:itest
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  listLogsForTrainee,
  countLogsForTrainee,
  listClientsForTrainer,
} from "~/lib/workouts";
import {
  listConsultationsForTrainee,
  createConsultation,
} from "~/lib/consultations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";
let traineeB = "";
// Trainer A has extra clients for pagination/sort tests
let traineeA2 = "";
let traineeA3 = "";

// IDs captured for assertions
let planAId = "";
let planASessionId = "";

// workout log IDs for trainee A
let logWithVideoId = "";
let logHighDifficultyId = "";
let logLowDifficultyId = "";
let logManySetId = "";

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
    .values({ email: "podoa@example.com", displayName: "Alfa Kowalski", role: "trainee", trainerId: trainerA })
    .returning({ id: schema.users.id });
  traineeA = pA!.id;

  const [pA2] = await db
    .insert(schema.users)
    .values({ email: "podoa2@example.com", displayName: "Beta Nowak", role: "trainee", trainerId: trainerA })
    .returning({ id: schema.users.id });
  traineeA2 = pA2!.id;

  const [pA3] = await db
    .insert(schema.users)
    .values({ email: "podoa3@example.com", displayName: "Gamma Wiśniewska", role: "trainee", trainerId: trainerA })
    .returning({ id: schema.users.id });
  traineeA3 = pA3!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pB] = await db
    .insert(schema.users)
    .values({ email: "podob@example.com", displayName: "Zeta Trenerowski", role: "trainee", trainerId: trainerB })
    .returning({ id: schema.users.id });
  traineeB = pB!.id;

  // --- Exercise (owned by trainer A) ---
  const [ex] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  const exerciseId = ex!.id;

  // --- Plan for trainee A ---
  const [plan] = await db
    .insert(schema.plans)
    .values({ trainerId: trainerA, traineeId: traineeA, name: "Plan A", version: 1, status: "active" })
    .returning({ id: schema.plans.id });
  planAId = plan!.id;

  const [session] = await db
    .insert(schema.planSessions)
    .values({ planId: planAId, ordinal: 0, name: "Sesja A" })
    .returning({ id: schema.planSessions.id });
  planASessionId = session!.id;

  // --- Plan for trainee B (separate tenant) ---
  const [planB] = await db
    .insert(schema.plans)
    .values({ trainerId: trainerB, traineeId: traineeB, name: "Plan B", version: 1, status: "active" })
    .returning({ id: schema.plans.id });
  const [sessionB] = await db
    .insert(schema.planSessions)
    .values({ planId: planB!.id, ordinal: 0, name: "Sesja B" })
    .returning({ id: schema.planSessions.id });

  // Exercise for trainer B
  const [exB] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerB, name: "Push-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });

  // --- Trainee A: log 1 — HIGH difficulty (avg 9), no video ---
  const [logHighDiff] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerA,
      traineeId: traineeA,
      planId: planAId,
      planSessionId: planASessionId,
      sessionName: "Ciężka sesja",
      performedOn: "2026-05-01",
    })
    .returning({ id: schema.workoutLogs.id });
  logHighDifficultyId = logHighDiff!.id;

  const [exLog1] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: logHighDifficultyId, ordinal: 0, exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values([
    { workoutExerciseLogId: exLog1!.id, ordinal: 0, reps: 8, difficulty: 9 },
    { workoutExerciseLogId: exLog1!.id, ordinal: 1, reps: 7, difficulty: 9 },
  ]);

  // --- Trainee A: log 2 — LOW difficulty (avg 3), no video ---
  const [logLowDiff] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerA,
      traineeId: traineeA,
      planId: planAId,
      planSessionId: planASessionId,
      sessionName: "Lekka sesja",
      performedOn: "2026-05-02",
    })
    .returning({ id: schema.workoutLogs.id });
  logLowDifficultyId = logLowDiff!.id;

  const [exLog2] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: logLowDifficultyId, ordinal: 0, exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values([
    { workoutExerciseLogId: exLog2!.id, ordinal: 0, reps: 5, difficulty: 3 },
    { workoutExerciseLogId: exLog2!.id, ordinal: 1, reps: 5, difficulty: 3 },
  ]);

  // --- Trainee A: log 3 — MEDIUM difficulty (avg 6), WITH video ---
  const [logWithVideo] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerA,
      traineeId: traineeA,
      planId: planAId,
      planSessionId: planASessionId,
      sessionName: "Sesja z wideo",
      performedOn: "2026-05-03",
    })
    .returning({ id: schema.workoutLogs.id });
  logWithVideoId = logWithVideo!.id;

  // File stub for video (needed for videoFileId FK)
  const [videoFile] = await db
    .insert(schema.files)
    .values({
      trainerId: trainerA,
      uploadedBy: traineeA,
      kind: "set_video",
      mimeType: "video/mp4",
      bytes: 1024,
      storagePath: "test/video.mp4",
    })
    .returning({ id: schema.files.id });

  const [exLog3] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: logWithVideoId, ordinal: 0, exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values([
    { workoutExerciseLogId: exLog3!.id, ordinal: 0, reps: 6, difficulty: 6, videoFileId: videoFile!.id },
  ]);

  // --- Trainee A: log 4 — MANY sets (6), no video ---
  const [logManySets] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerA,
      traineeId: traineeA,
      planId: planAId,
      planSessionId: planASessionId,
      sessionName: "Objętościówka",
      performedOn: "2026-05-04",
    })
    .returning({ id: schema.workoutLogs.id });
  logManySetId = logManySets!.id;

  const [exLog4] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: logManySetId, ordinal: 0, exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values([
    { workoutExerciseLogId: exLog4!.id, ordinal: 0, reps: 5, difficulty: 7 },
    { workoutExerciseLogId: exLog4!.id, ordinal: 1, reps: 5, difficulty: 7 },
    { workoutExerciseLogId: exLog4!.id, ordinal: 2, reps: 5, difficulty: 7 },
    { workoutExerciseLogId: exLog4!.id, ordinal: 3, reps: 5, difficulty: 7 },
    { workoutExerciseLogId: exLog4!.id, ordinal: 4, reps: 5, difficulty: 7 },
    { workoutExerciseLogId: exLog4!.id, ordinal: 5, reps: 5, difficulty: 7 },
  ]);

  // --- Trainee B: a log (should NEVER appear in trainee A's results) ---
  const [logB] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: trainerB,
      traineeId: traineeB,
      planId: planB!.id,
      planSessionId: sessionB!.id,
      sessionName: "Sesja B",
      performedOn: "2026-05-05",
    })
    .returning({ id: schema.workoutLogs.id });
  const [exLogB] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: logB!.id, ordinal: 0, exerciseId: exB!.id })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values([
    { workoutExerciseLogId: exLogB!.id, ordinal: 0, reps: 10, difficulty: 5 },
  ]);

  // --- Plans for trainer A clients (for plan filter test) ---
  // traineeA2 gets an active plan; traineeA3 does NOT
  const [planA2] = await db
    .insert(schema.plans)
    .values({ trainerId: trainerA, traineeId: traineeA2, name: "Plan Beta", version: 1, status: "active" })
    .returning({ id: schema.plans.id });
  await db
    .insert(schema.planSessions)
    .values({ planId: planA2!.id, ordinal: 0, name: "Sesja" });

  // --- Session counts for sorting: traineeA has 4 logs, traineeA2 has 0, traineeA3 has 0 ---
  // (logs already inserted above give traineeA a session_count of 4)

}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Logs: sort, video filter, tenant scope
// ---------------------------------------------------------------------------

describe("listLogsForTrainee — sort + filtr video + tenant-scope", () => {
  it("sort=hardest: zwraca wyłącznie logi trenera A, posortowane avg difficulty desc", async () => {
    const logs = await listLogsForTrainee(db, traineeA, { sort: "hardest" });
    expect(logs.length).toBe(4);

    // All must belong to traineeA — no cross-tenant leakage (4 logs, not 5)
    // Highest avg difficulty first: log1 (9) > log4 (7) > log3 (6) > log2 (3)
    expect(logs[0]!.id).toBe(logHighDifficultyId);
    expect(logs[0]!.avgDifficulty).toBe(9);
    expect(logs[logs.length - 1]!.id).toBe(logLowDifficultyId);
    expect(logs[logs.length - 1]!.avgDifficulty).toBe(3);
  });

  it("sort=easiest: najtrudniejszy log na końcu", async () => {
    const logs = await listLogsForTrainee(db, traineeA, { sort: "easiest" });
    expect(logs.length).toBe(4);
    expect(logs[0]!.id).toBe(logLowDifficultyId);
    expect(logs[logs.length - 1]!.id).toBe(logHighDifficultyId);
  });

  it("sort=sets_desc: log z 6 seriami na pierwszym miejscu", async () => {
    const logs = await listLogsForTrainee(db, traineeA, { sort: "sets_desc" });
    expect(logs.length).toBe(4);
    expect(logs[0]!.id).toBe(logManySetId);
    expect(logs[0]!.setCount).toBe(6);
  });

  it("video=with: zwraca tylko logi z wideo (wyłącznie traineeA)", async () => {
    const logs = await listLogsForTrainee(db, traineeA, { video: "with" });
    expect(logs.length).toBe(1);
    expect(logs[0]!.id).toBe(logWithVideoId);
    expect(logs[0]!.hasVideo).toBe(true);
  });

  it("video=without: zwraca tylko logi bez wideo (wyłącznie traineeA)", async () => {
    const logs = await listLogsForTrainee(db, traineeA, { video: "without" });
    expect(logs.length).toBe(3);
    expect(logs.every((l) => !l.hasVideo)).toBe(true);
    expect(logs.map((l) => l.id)).not.toContain(logWithVideoId);
  });

  it("traineeB nie widzi logów traineeA (izolacja tenantów)", async () => {
    const logsB = await listLogsForTrainee(db, traineeB, {});
    const idsB = logsB.map((l) => l.id);
    expect(idsB).not.toContain(logHighDifficultyId);
    expect(idsB).not.toContain(logWithVideoId);
    expect(idsB).not.toContain(logManySetId);
    expect(idsB).not.toContain(logLowDifficultyId);
  });
});

describe("countLogsForTrainee — filtr video + tenant-scope", () => {
  it("video=with: liczba logów z wideo == 1", async () => {
    const n = await countLogsForTrainee(db, traineeA, { video: "with" });
    expect(n).toBe(1);
  });

  it("video=without: liczba logów bez wideo == 3", async () => {
    const n = await countLogsForTrainee(db, traineeA, { video: "without" });
    expect(n).toBe(3);
  });

  it("suma with + without == łączna liczba logów", async () => {
    const total = await countLogsForTrainee(db, traineeA);
    const withV = await countLogsForTrainee(db, traineeA, { video: "with" });
    const withoutV = await countLogsForTrainee(db, traineeA, { video: "without" });
    expect(withV + withoutV).toBe(total);
  });

  it("q: szukajka po nazwie sesji", async () => {
    const n = await countLogsForTrainee(db, traineeA, { q: "wideo" });
    expect(n).toBe(1);
    const logs = await listLogsForTrainee(db, traineeA, { q: "wideo" });
    expect(logs[0]!.id).toBe(logWithVideoId);
  });
});

// ---------------------------------------------------------------------------
// Clients: sort, plan filter, name search, tenant scope
// ---------------------------------------------------------------------------

describe("listClientsForTrainer — sort + plan filter + szukajka + tenant-scope", () => {
  it("sort=most_sessions: klient z największą liczbą sesji na pierwszym miejscu", async () => {
    // traineeA has 4 sessions; traineeA2 and traineeA3 have 0
    const clients = await listClientsForTrainer(db, trainerA, { sort: "most_sessions" });
    expect(clients.length).toBe(3);
    expect(clients[0]!.id).toBe(traineeA);
    expect(clients[0]!.totalSessions).toBe(4);
  });

  it("sort=most_sessions + limit/offset: paginacja nie zaburza kolejności", async () => {
    const page1 = await listClientsForTrainer(db, trainerA, {
      sort: "most_sessions",
      limit: 2,
      offset: 0,
    });
    const page2 = await listClientsForTrainer(db, trainerA, {
      sort: "most_sessions",
      limit: 2,
      offset: 2,
    });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(1);
    // Najlepszy klient (traineeA) musi być na pierwszej stronie
    expect(page1[0]!.id).toBe(traineeA);
    // Żaden klient trenera B nie pojawia się w wynikach trenera A
    expect([...page1, ...page2].map((c) => c.id)).not.toContain(traineeB);
  });

  it("q: szukajka po fragmencie nazwy — zwraca tylko pasujących klientów trenera A", async () => {
    // "Beta" matchuje "Beta Nowak" (traineeA2); "Alfa" matchuje "Alfa Kowalski" (traineeA)
    const res = await listClientsForTrainer(db, trainerA, { q: "Beta" });
    expect(res.length).toBe(1);
    expect(res[0]!.id).toBe(traineeA2);
  });

  it("plan=with: zwraca tylko klientów z aktywnym planem trenera A", async () => {
    // traineeA i traineeA2 mają aktywny plan pod trainerA; traineeA3 nie ma
    const withPlan = await listClientsForTrainer(db, trainerA, { plan: "with" });
    const ids = withPlan.map((c) => c.id);
    expect(ids).toContain(traineeA);
    expect(ids).toContain(traineeA2);
    expect(ids).not.toContain(traineeA3);
    expect(ids).not.toContain(traineeB);
  });

  it("plan=without: zwraca tylko klientów bez aktywnego planu trenera A", async () => {
    const withoutPlan = await listClientsForTrainer(db, trainerA, { plan: "without" });
    const ids = withoutPlan.map((c) => c.id);
    expect(ids).toContain(traineeA3);
    expect(ids).not.toContain(traineeA);
    expect(ids).not.toContain(traineeA2);
  });

  it("trener B nie widzi klientów trenera A", async () => {
    const clientsB = await listClientsForTrainer(db, trainerB, {});
    const ids = clientsB.map((c) => c.id);
    expect(ids).not.toContain(traineeA);
    expect(ids).not.toContain(traineeA2);
    expect(ids).not.toContain(traineeA3);
  });
});

// ---------------------------------------------------------------------------
// Consultations: open filter, title search, sort, tenant scope
// ---------------------------------------------------------------------------

describe("listConsultationsForTrainee — filtr open + szukajka + sort + tenant-scope", () => {
  // We create consultations fresh for each describe block to keep state clean.
  let consultIdWithOpen = "";
  let consultIdResolved = "";
  let consultIdManyOpen = "";

  beforeAll(async () => {
    // Konsultacja 1: 2 otwarte punkty, tytuł "Styczeń 2026"
    consultIdWithOpen = await createConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      form: {
        heldOn: "2026-01-10",
        periodFrom: "2026-01-01",
        periodTo: "2026-01-09",
        title: "Styczeń 2026",
        summary: "Pierwsze spotkanie",
        items: [
          { body: "Łokcie", status: "open" },
          { body: "Hantle", status: "open" },
        ],
      },
    });

    // Konsultacja 2: wszystkie punkty resolved, tytuł "Luty 2026"
    consultIdResolved = await createConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      form: {
        heldOn: "2026-02-10",
        periodFrom: "2026-02-01",
        periodTo: "2026-02-09",
        title: "Luty 2026",
        summary: "Postęp dobry",
        items: [
          { body: "Tempo", status: "resolved" },
        ],
      },
    });

    // Konsultacja 3: 3 otwarte punkty, tytuł "Marzec 2026"
    consultIdManyOpen = await createConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      form: {
        heldOn: "2026-03-10",
        periodFrom: "2026-03-01",
        periodTo: "2026-03-09",
        title: "Marzec 2026",
        summary: "Dużo pracy",
        items: [
          { body: "Technika", status: "open" },
          { body: "Mobilność", status: "open" },
          { body: "Forma", status: "open" },
        ],
      },
    });

    // Konsultacja dla traineeB (nie powinna wyciekać do traineeA)
    await createConsultation(db, {
      trainerId: trainerB,
      traineeId: traineeB,
      form: {
        heldOn: "2026-01-15",
        periodFrom: null,
        periodTo: null,
        title: "Konsultacja B",
        summary: "",
        items: [{ body: "Item B", status: "open" }],
      },
    });
  });

  it("open=with_open: zwraca tylko konsultacje z otwartymi punktami, wyłącznie traineeA", async () => {
    const list = await listConsultationsForTrainee(db, traineeA, { open: "with_open" });
    const ids = list.map((c) => c.id);
    expect(ids).toContain(consultIdWithOpen);
    expect(ids).toContain(consultIdManyOpen);
    expect(ids).not.toContain(consultIdResolved);
    // Wszystkie zwrócone mają openItemCount > 0
    expect(list.every((c) => c.openItemCount > 0)).toBe(true);
  });

  it("open=with_open: nie zwraca konsultacji traineeB", async () => {
    const listA = await listConsultationsForTrainee(db, traineeA, { open: "with_open" });
    const listB = await listConsultationsForTrainee(db, traineeB, { open: "with_open" });
    const idsA = listA.map((c) => c.id);
    // Żadna konsultacja traineeB nie pojawia się w listA
    for (const cB of listB) {
      expect(idsA).not.toContain(cB.id);
    }
  });

  it("q: szukajka po fragmencie tytułu", async () => {
    const list = await listConsultationsForTrainee(db, traineeA, { q: "Marzec" });
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(consultIdManyOpen);
  });

  it("q: szukajka nie zwraca wyników innego tenanta", async () => {
    // "Konsultacja B" należy do traineeB — nie powinna pojawić się dla traineeA
    const list = await listConsultationsForTrainee(db, traineeA, { q: "Konsultacja B" });
    expect(list.length).toBe(0);
  });

  it("sort=most_open: konsultacja z największą liczbą otwartych punktów na pierwszym miejscu", async () => {
    const list = await listConsultationsForTrainee(db, traineeA, { sort: "most_open" });
    // Marzec (3 otwarte) > Styczeń (2 otwarte) > Luty (0 otwartych)
    expect(list[0]!.id).toBe(consultIdManyOpen);
    expect(list[0]!.openItemCount).toBe(3);
    expect(list[1]!.id).toBe(consultIdWithOpen);
    expect(list[1]!.openItemCount).toBe(2);
    // Luty jest ostatni (0 otwartych)
    const lastItem = list[list.length - 1]!;
    expect(lastItem.id).toBe(consultIdResolved);
    expect(lastItem.openItemCount).toBe(0);
  });

  it("sort=date_asc: konsultacje posortowane chronologicznie", async () => {
    const list = await listConsultationsForTrainee(db, traineeA, { sort: "date_asc" });
    // Styczeń (01-10) < Luty (02-10) < Marzec (03-10)
    const heldDates = list
      .filter((c) => [consultIdWithOpen, consultIdResolved, consultIdManyOpen].includes(c.id))
      .map((c) => c.heldOn);
    for (let i = 1; i < heldDates.length; i++) {
      expect(heldDates[i]! >= heldDates[i - 1]!).toBe(true);
    }
  });

  it("traineeB nie widzi konsultacji traineeA", async () => {
    const listB = await listConsultationsForTrainee(db, traineeB, {});
    const idsB = listB.map((c) => c.id);
    expect(idsB).not.toContain(consultIdWithOpen);
    expect(idsB).not.toContain(consultIdResolved);
    expect(idsB).not.toContain(consultIdManyOpen);
  });
});
