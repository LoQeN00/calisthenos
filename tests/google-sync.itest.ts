/**
 * Testy integracyjne google-sync: syncUpsertOne + real Postgres (testcontainers).
 * Google SDK jest mockowany (zero sieci) — sprawdzamy argumenty wywołania i
 * persystencję google_event_id / meetingUrl w bazie.
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie. Uruchamia go
 * właściciel (Docker/testcontainers): npm run test:itest
 */

import { randomBytes } from "node:crypto";

// Ustawić przed jakimkolwiek importem ~/lib/google/*, bo crypto.ts czyta process.env
// bezpośrednio przy pierwszym wywołaniu encryptToken/decryptToken, a getEnv() cache'uje.
process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI =
  "http://localhost:3000/trener/integracje/google/callback";

// ---- Mocki SDK (PRZED importami aplikacji) ----
// vi.mock jest hoistowany przez Vitest; vi.fn() musi być dostępne w fabryce.
// Używamy vi.hoisted() by zdefiniować mocki zanim vi.mock wykona fabrykę.
import { vi } from "vitest";

const { insertMock, patchMock, deleteMock } = vi.hoisted(() => ({
  insertMock: vi.fn(async () => ({
    data: {
      id: "evt-123",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    },
  })),
  patchMock: vi.fn(async () => ({ data: {} })),
  deleteMock: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@googleapis/calendar", () => ({
  calendar: () => ({
    events: {
      insert: insertMock,
      patch: patchMock,
      delete: deleteMock,
    },
  }),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    setCredentials() {}
    on() {}
    generateAuthUrl() {
      return "https://accounts.google.com/o/oauth2/auth";
    }
  },
}));

// ---- Importy aplikacji (po vi.mock) ----
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import { encryptToken } from "~/lib/google/crypto";
import { syncUpsertOne } from "~/lib/google/sync";

// ---- Bootstrapstrapping (identyczny z consultations.itest.ts) ----

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerId = "";
let traineeId = "";
const traineeEmail = "trainee-google@example.com";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const mk = async (
    email: string,
    role: "trainer" | "trainee",
    parentTrainerId?: string,
  ) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, displayName: email, role, trainerId: parentTrainerId })
      .returning({ id: schema.users.id });
    return u!.id;
  };

  trainerId = await mk("trainer-google@example.com", "trainer");
  traineeId = await mk(traineeEmail, "trainee", trainerId);

  // google_calendar_connections dla trenera
  await db.insert(schema.googleCalendarConnections).values({
    trainerId,
    googleEmail: "trainer-google@gmail.com",
    accessTokenEnc: encryptToken("fake-access-token"),
    refreshTokenEnc: encryptToken("fake-refresh-token"),
    tokenExpiry: new Date(Date.now() + 3_600_000), // 1h od teraz
    scope: "https://www.googleapis.com/auth/calendar.events",
    calendarId: "primary",
  });
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---- Helper: wstaw jedną konsultację ----
async function insertPlannedConsultation(title: string): Promise<string> {
  const [row] = await db
    .insert(schema.consultations)
    .values({
      trainerId,
      traineeId,
      scheduledAt: new Date(Date.now() + 7 * 24 * 3_600_000), // za 7 dni
      durationMin: 45,
      status: "planned",
      title,
      summary: "",
      googleEventId: null,
    })
    .returning({ id: schema.consultations.id });
  return row!.id;
}

// ---- Helper: odczytaj wiersz consultations ----
async function fetchConsultation(id: string) {
  const [row] = await db
    .select()
    .from(schema.consultations)
    .where(eq(schema.consultations.id, id))
    .limit(1);
  return row ?? null;
}

// ---- Testy ----

describe("syncUpsertOne — Google Calendar mock", () => {
  it("(create) wywołuje events.insert z właściwymi args i persystuje google_event_id + meetingUrl", async () => {
    insertMock.mockClear();

    const consultationId = await insertPlannedConsultation("Konsultacja sync test");

    await syncUpsertOne(db, { trainerId, consultationId });

    // 1. insertMock wywołany dokładnie raz
    expect(insertMock).toHaveBeenCalledTimes(1);

    // 2. Sprawdź argumenty przekazane do events.insert.
    // vi.fn() zwraca mock.calls: [][] (zero-length tuple) — castujemy przez unknown.
    type InsertCallArg = {
      calendarId: string;
      conferenceDataVersion: number;
      sendUpdates: string;
      requestBody: { attendees: Array<{ email: string }> };
    };
    const rawCalls = insertMock.mock.calls as unknown as InsertCallArg[][];
    const callArg = rawCalls[0]![0]!;
    expect(callArg.conferenceDataVersion).toBe(1);
    expect(callArg.sendUpdates).toBe("all");
    expect(callArg.requestBody.attendees[0]!.email).toBe(traineeEmail);

    // 3. google_event_id i meetingUrl zapisane w bazie
    const row = await fetchConsultation(consultationId);
    expect(row).not.toBeNull();
    expect(row!.googleEventId).toBe("evt-123");
    expect(row!.meetingUrl).toContain("meet.google.com");
  });

  it("(best-effort) błąd Google nie rzuca wyjątku i nie zmienia google_event_id", async () => {
    insertMock.mockClear();
    insertMock.mockRejectedValueOnce(new Error("Google 500"));

    const consultationId = await insertPlannedConsultation("Konsultacja best-effort");

    // syncUpsertOne nie może rzucić — best-effort
    await expect(syncUpsertOne(db, { trainerId, consultationId })).resolves.toBeUndefined();

    // google_event_id pozostaje null — stan natywny nienaruszony
    const row = await fetchConsultation(consultationId);
    expect(row).not.toBeNull();
    expect(row!.googleEventId).toBeNull();
  });
});
