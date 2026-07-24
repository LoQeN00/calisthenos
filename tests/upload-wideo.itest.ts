/**
 * Testy integracyjne trasy zasobowej `/upload/wideo` na realnym Postgresie
 * (testcontainers) + realnym zapisie na dysk (katalog tymczasowy).
 *
 * Sprawdzamy to, czego NIE weryfikuje żaden test jednostkowy: że `trainerId` i `kind`
 * pochodzą wyłącznie z sesji i stałej w kodzie, a nie z ciała żądania.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

// Katalog na pliki musi być gotowy PRZED importem aplikacji (storage czyta DATA_DIR
// przy pierwszym użyciu). Sekrety podpisu/sesji są wymagane przez `env.ts`.
const DATA_DIR = await mkdtemp(path.join(tmpdir(), "kalisthenos-upload-itest-"));
process.env.DATA_DIR = DATA_DIR;
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.FILE_SIGNING_SECRET ??= "y".repeat(32);
process.env.BASE_URL ??= "http://localhost:3000";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeId = "";
let traineeSessionId = "";
let trainerSessionId = "";

/** Minimalny prawidłowy nagłówek MP4 — `file-type` rozpoznaje go po `ftyp`. */
function mp4Bytes(): Uint8Array<ArrayBuffer> {
  const header = [
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
  ];
  const out = new Uint8Array(new ArrayBuffer(8192));
  out.set(header, 0);
  return out;
}

function uploadRequest(sessionId: string, fd: FormData): Request {
  return new Request("http://localhost/upload/wideo", {
    method: "POST",
    headers: { cookie: `__Host-session=${sessionId}` },
    body: fd,
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  process.env.DATABASE_URL = container.getConnectionUri();
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [trainer] = await db
    .insert(schema.users)
    .values({ email: "trainer-upl@example.com", displayName: "Trener", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerId = trainer!.id;

  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "trainee-upl@example.com",
      displayName: "Podopieczny",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  traineeId = trainee!.id;

  const inDays = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);
  const [ts] = await db
    .insert(schema.sessions)
    .values({ id: "sess-trainee-upl", userId: traineeId, expiresAt: inDays(1) })
    .returning({ id: schema.sessions.id });
  traineeSessionId = ts!.id;
  const [trs] = await db
    .insert(schema.sessions)
    .values({ id: "sess-trainer-upl", userId: trainerId, expiresAt: inDays(1) })
    .returning({ id: schema.sessions.id });
  trainerSessionId = trs!.id;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("POST /upload/wideo", () => {
  it("zapisuje nagranie z trainerId i uploadedBy wziętymi z SESJI", async () => {
    const { action } = await import("~/routes/upload.wideo");
    const fd = new FormData();
    fd.append("file", new File([mp4Bytes()], "seria.mp4", { type: "video/mp4" }));

    const res = (await action({
      request: uploadRequest(traineeSessionId, fd),
      params: {},
      context: {},
    } as never)) as Response;

    expect(res.status).toBe(200);
    const body = (await res.json()) as { fileId: string };
    expect(body.fileId).toBeTruthy();

    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, body.fileId));
    expect(row?.kind).toBe("set_video");
    expect(row?.trainerId).toBe(trainerId);
    expect(row?.uploadedBy).toBe(traineeId);
  });

  it("IGNORUJE trainerId i kind podane w ciele żądania", async () => {
    // Sedno bezpieczeństwa tej trasy: klient nie może przekierować pliku do cudzego
    // tenanta ani podszyć go pod inny rodzaj.
    const { action } = await import("~/routes/upload.wideo");
    const fd = new FormData();
    fd.append("file", new File([mp4Bytes()], "seria.mp4", { type: "video/mp4" }));
    fd.append("trainerId", "00000000-0000-0000-0000-000000000000");
    fd.append("kind", "body_photo");

    const res = (await action({
      request: uploadRequest(traineeSessionId, fd),
      params: {},
      context: {},
    } as never)) as Response;

    const body = (await res.json()) as { fileId: string };
    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, body.fileId));
    expect(row?.trainerId).toBe(trainerId);
    expect(row?.kind).toBe("set_video");
  });

  it("odbija trenera (trasa jest wyłącznie dla podopiecznych)", async () => {
    const { action } = await import("~/routes/upload.wideo");
    const fd = new FormData();
    fd.append("file", new File([mp4Bytes()], "seria.mp4", { type: "video/mp4" }));

    // `requireUser` z niepasującą rolą rzuca przekierowaniem.
    await expect(
      action({
        request: uploadRequest(trainerSessionId, fd),
        params: {},
        context: {},
      } as never),
    ).rejects.toBeInstanceOf(Response);
  });

  it("odrzuca plik o niezgodnych magic-bytes i NIE tworzy wiersza", async () => {
    const { action } = await import("~/routes/upload.wideo");
    const before = await db.select({ id: schema.files.id }).from(schema.files);

    const fd = new FormData();
    // Deklaruje mp4, ale zawartość to same zera — `file-type` nic nie rozpozna.
    fd.append(
      "file",
      new File([new Uint8Array(new ArrayBuffer(8192))], "fake.mp4", { type: "video/mp4" }),
    );

    const res = (await action({
      request: uploadRequest(traineeSessionId, fd),
      params: {},
      context: {},
    } as never)) as Response;

    expect(res.status).toBe(400);
    const after = await db.select({ id: schema.files.id }).from(schema.files);
    expect(after.length).toBe(before.length);
  });

  it("odrzuca żądanie bez pliku", async () => {
    const { action } = await import("~/routes/upload.wideo");
    const res = (await action({
      request: uploadRequest(traineeSessionId, new FormData()),
      params: {},
      context: {},
    } as never)) as Response;

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Brak pliku");
  });

  it("zwraca czysty JSON (konsumuje go surowy XHR, nie React Router)", async () => {
    const { action } = await import("~/routes/upload.wideo");
    const fd = new FormData();
    fd.append("file", new File([mp4Bytes()], "seria.mp4", { type: "video/mp4" }));

    const res = (await action({
      request: uploadRequest(traineeSessionId, fd),
      params: {},
      context: {},
    } as never)) as Response;

    expect(res.headers.get("content-type")).toContain("application/json");
    // Musi dać się sparsować gołym JSON.parse — dokładnie tak robi `video-upload-field.tsx`.
    // Gdyby trasa wróciła do zwracania `data()`/gołego obiektu, RR mógłby zakodować
    // odpowiedź własnym formatem i klient by się wywalił.
    const text = await res.text();
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
