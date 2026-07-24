/**
 * Testy integracyjne walidacji identyfikatorów nagrań przy zapisie treningu
 * (`assertOwnedUnclaimedVideos`) na realnym Postgresie (testcontainers).
 *
 * DLACZEGO to jest krytyczne: po rozdzieleniu uploadu od zapisu sesji `videoFileId`
 * przychodzi OD KLIENTA. Wcześniej pochodził z `uploadFile` w tym samym żądaniu i nie
 * wymagał weryfikacji. Najgroźniejszy przypadek to podpięcie nagrania INNEGO podopiecznego
 * TEGO SAMEGO trenera — sam `trainer_id` tego nie wyłapie, bo obaj mają tę samą wartość.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import { assertOwnedUnclaimedVideos, WorkoutSaveError } from "~/lib/workouts";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeA = "";
let traineeB = "";
let otherTrainerId = "";
let otherTraineeId = "";
let exerciseId = "";

/** Wgrywa wiersz `files` bez fizycznego pliku — walidacja patrzy wyłącznie w bazę. */
async function seedFile(opts: {
  trainerId: string;
  uploadedBy: string;
  kind: "set_video" | "body_photo" | "exercise_demo";
  suffix: string;
}): Promise<string> {
  const [row] = await db
    .insert(schema.files)
    .values({
      trainerId: opts.trainerId,
      uploadedBy: opts.uploadedBy,
      kind: opts.kind,
      mimeType: opts.kind === "body_photo" ? "image/jpeg" : "video/mp4",
      bytes: 1234,
      storagePath: `sets/${opts.suffix}.mp4`,
    })
    .returning({ id: schema.files.id });
  return row!.id;
}

/** Podpina nagranie do serii — pełny łańcuch plan → sesja → log → ćwiczenie → seria. */
async function claimFile(fileId: string, traineeId: string): Promise<void> {
  const [plan] = await db
    .insert(schema.plans)
    .values({ trainerId, traineeId, name: "Plan", version: 1, status: "archived" })
    .returning({ id: schema.plans.id });
  const [planSession] = await db
    .insert(schema.planSessions)
    .values({ planId: plan!.id, ordinal: 0, name: "Sesja" })
    .returning({ id: schema.planSessions.id });
  const [log] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId,
      traineeId,
      planId: plan!.id,
      planSessionId: planSession!.id,
      sessionName: "Sesja",
      performedOn: "2026-07-01",
    })
    .returning({ id: schema.workoutLogs.id });
  const [exLog] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: log!.id, ordinal: 0, exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values({
    workoutExerciseLogId: exLog!.id,
    ordinal: 0,
    reps: 8,
    difficulty: 6,
    videoFileId: fileId,
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [trainer] = await db
    .insert(schema.users)
    .values({ email: "trainer-vid@example.com", displayName: "Trener", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerId = trainer!.id;

  const [a] = await db
    .insert(schema.users)
    .values({
      email: "trainee-a-vid@example.com",
      displayName: "Podopieczny A",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeA = a!.id;

  const [b] = await db
    .insert(schema.users)
    .values({
      email: "trainee-b-vid@example.com",
      displayName: "Podopieczny B",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeB = b!.id;

  const [otherTrainer] = await db
    .insert(schema.users)
    .values({ email: "trainer2-vid@example.com", displayName: "Trener 2", role: "trainer" })
    .returning({ id: schema.users.id });
  otherTrainerId = otherTrainer!.id;

  const [otherTrainee] = await db
    .insert(schema.users)
    .values({
      email: "trainee-c-vid@example.com",
      displayName: "Podopieczny C",
      role: "trainee",
      trainerId: otherTrainerId,
    })
    .returning({ id: schema.users.id });
  otherTraineeId = otherTrainee!.id;

  const [ex] = await db
    .insert(schema.exercises)
    .values({ trainerId, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exerciseId = ex!.id;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("assertOwnedUnclaimedVideos", () => {
  it("przepuszcza własne, nieużyte nagranie", async () => {
    const fileId = await seedFile({
      trainerId,
      uploadedBy: traineeA,
      kind: "set_video",
      suffix: "ok",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [fileId] }),
    ).resolves.toBeUndefined();
  });

  it("ODRZUCA nagranie innego podopiecznego TEGO SAMEGO trenera", async () => {
    // Najważniejszy przypadek całego plasterka: `trainer_id` jest identyczny dla obu
    // podopiecznych, więc chroni wyłącznie warunek `uploaded_by`.
    const fileId = await seedFile({
      trainerId,
      uploadedBy: traineeB,
      kind: "set_video",
      suffix: "cudze",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [fileId] }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca nagranie spoza tenanta (inny trener)", async () => {
    const fileId = await seedFile({
      trainerId: otherTrainerId,
      uploadedBy: otherTraineeId,
      kind: "set_video",
      suffix: "obcy-tenant",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [fileId] }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca plik o rodzaju innym niż set_video", async () => {
    // Zdjęcie sylwetki podpięte jako nagranie serii — własne, w tenancie, ale zły rodzaj.
    const fileId = await seedFile({
      trainerId,
      uploadedBy: traineeA,
      kind: "body_photo",
      suffix: "zly-rodzaj",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [fileId] }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca nagranie już podpięte do innej serii", async () => {
    const fileId = await seedFile({
      trainerId,
      uploadedBy: traineeA,
      kind: "set_video",
      suffix: "juz-uzyte",
    });
    await claimFile(fileId, traineeA);

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [fileId] }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca nieistniejące id", async () => {
    await expect(
      assertOwnedUnclaimedVideos(db, {
        traineeId: traineeA,
        trainerId,
        fileIds: ["00000000-0000-0000-0000-000000000000"],
      }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca to samo id podane dwa razy (jeden upload, dwie serie)", async () => {
    const fileId = await seedFile({
      trainerId,
      uploadedBy: traineeA,
      kind: "set_video",
      suffix: "duplikat",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, {
        traineeId: traineeA,
        trainerId,
        fileIds: [fileId, fileId],
      }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("odrzuca CAŁY zapis, gdy choć jedno id z listy jest złe", async () => {
    const ok = await seedFile({
      trainerId,
      uploadedBy: traineeA,
      kind: "set_video",
      suffix: "mieszane-ok",
    });
    const bad = await seedFile({
      trainerId,
      uploadedBy: traineeB,
      kind: "set_video",
      suffix: "mieszane-zle",
    });

    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [ok, bad] }),
    ).rejects.toBeInstanceOf(WorkoutSaveError);
  });

  it("pusta lista przechodzi bez zapytania", async () => {
    await expect(
      assertOwnedUnclaimedVideos(db, { traineeId: traineeA, trainerId, fileIds: [] }),
    ).resolves.toBeUndefined();
  });
});
