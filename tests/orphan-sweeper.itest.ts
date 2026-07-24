/**
 * Testy integracyjne sweepera nagrań-sierot (`sweepOrphanSetVideos`) na realnym
 * Postgresie (testcontainers).
 *
 * Rozdzielony upload tworzy wiersz `files` PRZED zapisem sesji, więc porzucona sesja
 * logowania zostawia plik bez właściciela. Sweeper ma skasować dokładnie te i NIC więcej
 * — pomyłka w drugą stronę kasuje nagrania z zapisanych treningów.
 *
 * `deleteFileBlob` jest mockowany: testujemy logikę wyboru wierszy, nie dysk.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { vi } from "vitest";

// Mock PRZED importami aplikacji — sweeper woła deleteFileBlob dla każdego wiersza,
// a na dysku nie ma tu żadnych plików.
const { deleteBlobMock } = vi.hoisted(() => ({ deleteBlobMock: vi.fn(async () => {}) }));
vi.mock("~/lib/file-uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/file-uploads")>();
  return { ...actual, deleteFileBlob: deleteBlobMock };
});

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import { ORPHAN_GRACE_MS, sweepOrphanSetVideos } from "~/lib/orphan-files";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeId = "";
let exerciseId = "";
let planId = "";
let planSessionId = "";

const NOW_MS = Date.parse("2026-07-22T12:00:00.000Z");
const STARE = new Date(NOW_MS - ORPHAN_GRACE_MS - 60_000); // tuż PO karencji
const SWIEZE = new Date(NOW_MS - 60_000); // grubo w karencji

async function seedVideo(opts: {
  createdAt: Date;
  suffix: string;
  kind?: "set_video" | "body_photo";
}): Promise<string> {
  const [row] = await db
    .insert(schema.files)
    .values({
      trainerId,
      uploadedBy: traineeId,
      kind: opts.kind ?? "set_video",
      mimeType: opts.kind === "body_photo" ? "image/jpeg" : "video/mp4",
      bytes: 999,
      storagePath: `sets/${opts.suffix}.mp4`,
      createdAt: opts.createdAt,
    })
    .returning({ id: schema.files.id });
  return row!.id;
}

async function claim(fileId: string): Promise<void> {
  const [log] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId,
      traineeId,
      planId,
      planSessionId,
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

async function exists(fileId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(eq(schema.files.id, fileId));
  return rows.length > 0;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [trainer] = await db
    .insert(schema.users)
    .values({ email: "trainer-sweep@example.com", displayName: "Trener", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerId = trainer!.id;

  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "trainee-sweep@example.com",
      displayName: "Podopieczny",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeId = trainee!.id;

  const [ex] = await db
    .insert(schema.exercises)
    .values({ trainerId, name: "Dip", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exerciseId = ex!.id;

  const [plan] = await db
    .insert(schema.plans)
    .values({ trainerId, traineeId, name: "Plan", version: 1, status: "active" })
    .returning({ id: schema.plans.id });
  planId = plan!.id;

  const [ps] = await db
    .insert(schema.planSessions)
    .values({ planId, ordinal: 0, name: "Sesja" })
    .returning({ id: schema.planSessions.id });
  planSessionId = ps!.id;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

beforeEach(() => {
  deleteBlobMock.mockClear();
});

describe("sweepOrphanSetVideos", () => {
  it("kasuje nagranie starsze niż karencja i niepodpięte", async () => {
    const fileId = await seedVideo({ createdAt: STARE, suffix: "sierota" });

    const n = await sweepOrphanSetVideos(db, NOW_MS);

    expect(n).toBeGreaterThanOrEqual(1);
    expect(await exists(fileId)).toBe(false);
    // Blob też musi zniknąć — inaczej wolumen rośnie mimo posprzątanej bazy.
    expect(deleteBlobMock).toHaveBeenCalledWith("sets/sierota.mp4");
  });

  it("NIE rusza nagrania podpiętego do serii, choćby było stare", async () => {
    const fileId = await seedVideo({ createdAt: STARE, suffix: "podpiete" });
    await claim(fileId);

    await sweepOrphanSetVideos(db, NOW_MS);

    expect(await exists(fileId)).toBe(true);
    expect(deleteBlobMock).not.toHaveBeenCalledWith("sets/podpiete.mp4");
  });

  it("NIE rusza nagrania świeższego niż karencja, choćby niepodpiętego", async () => {
    // Sesja w toku: podopieczny wgrał nagranie i wciąż wypełnia formularz.
    const fileId = await seedVideo({ createdAt: SWIEZE, suffix: "w-toku" });

    await sweepOrphanSetVideos(db, NOW_MS);

    expect(await exists(fileId)).toBe(true);
  });

  it("NIE rusza plików innego rodzaju niż set_video", async () => {
    // Zdjęcia sylwetki mają własny cykl życia (`body_photos.file_id`) i sweeper
    // celowo o nich nie wie — skasowanie ich byłoby utratą danych.
    const fileId = await seedVideo({ createdAt: STARE, suffix: "sylwetka", kind: "body_photo" });

    await sweepOrphanSetVideos(db, NOW_MS);

    expect(await exists(fileId)).toBe(true);
  });

  it("zwraca 0, gdy nie ma czego sprzątać", async () => {
    const n = await sweepOrphanSetVideos(db, NOW_MS);
    expect(n).toBe(0);
  });
});
