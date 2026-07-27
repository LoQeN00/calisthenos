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
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/trener/integracje/google/callback";

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
import {
  syncBackfillPair,
  syncCancelAllForPair,
  syncCancelStaleSchedule,
  syncUpsertOne,
} from "~/lib/google/sync";
import { listCancelledGoogleEventIds, listGoogleEventIdsForPair } from "~/lib/consultations";

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

  const mk = async (email: string, role: "trainer" | "trainee", parentTrainerId?: string) => {
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

// ---- Helper: konsultacja z dowolnym statusem + googleEventId + offsetem dni ----
async function insertConsultation(args: {
  status: schema.ConsultationStatus;
  googleEventId: string | null;
  daysFromNow: number;
}): Promise<string> {
  const [row] = await db
    .insert(schema.consultations)
    .values({
      trainerId,
      traineeId,
      scheduledAt: new Date(Date.now() + args.daysFromNow * 24 * 3_600_000),
      durationMin: 45,
      status: args.status,
      title: "X",
      summary: "",
      googleEventId: args.googleEventId,
    })
    .returning({ id: schema.consultations.id });
  return row!.id;
}

describe("repo: listGoogleEventIdsForPair / listCancelledGoogleEventIds", () => {
  it("listGoogleEventIdsForPair zwraca tylko terminy pary z googleEventId (dowolny status)", async () => {
    const withEvent = await insertConsultation({
      status: "confirmed",
      googleEventId: "evt-pair-1",
      daysFromNow: 5,
    });
    await insertConsultation({ status: "planned", googleEventId: null, daysFromNow: 6 });

    const refs = await listGoogleEventIdsForPair(db, { trainerId, traineeId });
    const ids = refs.map((r) => r.consultationId);
    expect(ids).toContain(withEvent);
    // żaden zwrócony ref nie ma null-owego eventu
    expect(refs.every((r) => typeof r.googleEventId === "string")).toBe(true);
  });

  it("listCancelledGoogleEventIds bierze tylko nadchodzące, odwołane z googleEventId", async () => {
    const fromISO = new Date().toISOString().slice(0, 10);
    const cancelledFuture = await insertConsultation({
      status: "cancelled",
      googleEventId: "evt-cancel-future",
      daysFromNow: 4,
    });
    // odwołany ale w PRZESZŁOŚCI — pomijany
    await insertConsultation({
      status: "cancelled",
      googleEventId: "evt-cancel-past",
      daysFromNow: -4,
    });
    // odwołany bez eventu — pomijany
    await insertConsultation({ status: "cancelled", googleEventId: null, daysFromNow: 3 });

    const refs = await listCancelledGoogleEventIds(db, { trainerId, traineeId, fromISO });
    const ids = refs.map((r) => r.consultationId);
    expect(ids).toContain(cancelledFuture);
    expect(refs.every((r) => r.googleEventId !== null)).toBe(true);
  });
});

describe("syncCancelAllForPair — usuwanie podopiecznego", () => {
  it("kasuje zdarzenia Google wszystkich terminów pary z googleEventId", async () => {
    deleteMock.mockClear();
    await insertConsultation({ status: "planned", googleEventId: "evt-all-1", daysFromNow: 8 });
    await insertConsultation({ status: "confirmed", googleEventId: "evt-all-2", daysFromNow: 9 });

    await syncCancelAllForPair(db, { trainerId, traineeId });

    // Sprawdź, że skasowano KONKRETNE eventy wstawione w tym teście (mogą dojść
    // też eventy z wcześniejszych testów tej samej pary — stąd toContain, nie równość).
    const deletedEventIds = (deleteMock.mock.calls as unknown as Array<[{ eventId: string }]>).map(
      (c) => c[0]!.eventId,
    );
    expect(deletedEventIds).toContain("evt-all-1");
    expect(deletedEventIds).toContain("evt-all-2");
  });

  it("best-effort: błąd delete nie rzuca", async () => {
    deleteMock.mockClear();
    deleteMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: 500 }));
    await insertConsultation({ status: "planned", googleEventId: "evt-all-err", daysFromNow: 10 });
    await expect(syncCancelAllForPair(db, { trainerId, traineeId })).resolves.toBeUndefined();
  });
});

describe("syncBackfillPair — wypchnięcie brakujących + naprawa istniejących", () => {
  // Każdy przypadek dostaje WŁASNĄ parę trener-podopieczny: `syncBackfillPair` bierze
  // wszystkie nadchodzące żywe terminy pary, więc współdzielenie pary między testami
  // rozsypałoby asercje `attempted`/`synced`.
  let pairSeq = 0;

  async function makePair(withGoogle: boolean): Promise<{ trainer: string; trainee: string }> {
    pairSeq += 1;
    const [tr] = await db
      .insert(schema.users)
      .values({
        email: `trainer-backfill-${pairSeq}@example.com`,
        displayName: `T-bf-${pairSeq}`,
        role: "trainer",
      })
      .returning({ id: schema.users.id });
    const [pu] = await db
      .insert(schema.users)
      .values({
        email: `trainee-backfill-${pairSeq}@example.com`,
        displayName: `P-bf-${pairSeq}`,
        role: "trainee",
        trainerId: tr!.id,
      })
      .returning({ id: schema.users.id });
    if (withGoogle) {
      await db.insert(schema.googleCalendarConnections).values({
        trainerId: tr!.id,
        googleEmail: `trainer-backfill-${pairSeq}@gmail.com`,
        accessTokenEnc: encryptToken("fake-access-token"),
        refreshTokenEnc: encryptToken("fake-refresh-token"),
        tokenExpiry: new Date(Date.now() + 3_600_000),
        scope: "https://www.googleapis.com/auth/calendar.events",
        calendarId: "primary",
      });
    }
    return { trainer: tr!.id, trainee: pu!.id };
  }

  async function addConsultation(
    pair: { trainer: string; trainee: string },
    args: { status: schema.ConsultationStatus; googleEventId: string | null; at: string },
  ): Promise<string> {
    const [row] = await db
      .insert(schema.consultations)
      .values({
        trainerId: pair.trainer,
        traineeId: pair.trainee,
        scheduledAt: new Date(args.at),
        durationMin: 45,
        status: args.status,
        title: "Konsultacja",
        summary: "",
        googleEventId: args.googleEventId,
      })
      .returning({ id: schema.consultations.id });
    return row!.id;
  }

  type PatchArg = {
    eventId: string;
    requestBody: {
      start: { dateTime: string; timeZone: string };
      summary?: string;
      description?: string;
    };
  };
  const patchArgs = () => (patchMock.mock.calls as unknown as PatchArg[][]).map((c) => c[0]!);

  it("wstawia brakujące, naprawia istniejące, pomija przeszłe i odwołane", async () => {
    insertMock.mockClear();
    patchMock.mockClear();
    const pair = await makePair(true);

    await addConsultation(pair, {
      status: "planned",
      googleEventId: null,
      at: "2030-06-14T18:30:00.000Z",
    });
    await addConsultation(pair, {
      status: "confirmed",
      googleEventId: "evt-existing",
      at: "2030-06-21T18:30:00.000Z",
    });
    // Pomijane: przeszły oraz odwołany.
    await addConsultation(pair, {
      status: "planned",
      googleEventId: null,
      at: "2020-01-01T18:30:00.000Z",
    });
    await addConsultation(pair, {
      status: "cancelled",
      googleEventId: "evt-cancelled",
      at: "2030-06-28T18:30:00.000Z",
    });

    const r = await syncBackfillPair(db, {
      trainerId: pair.trainer,
      traineeId: pair.trainee,
      nowISO: new Date().toISOString(),
    });

    expect(r).toEqual({ connected: true, attempted: 2, synced: 2 });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledTimes(1);

    // Patch trafia w istniejące zdarzenie — a NIE w to właśnie wstawione
    // (oba zbiory czytamy przed zapisami, więc świeży termin nie dostaje dubla).
    const patchArg = patchArgs()[0]!;
    expect(patchArg.eventId).toBe("evt-existing");

    // Regresja stref: czas ścienny bez „Z" + jawna strefa aplikacji.
    expect(patchArg.requestBody.start.dateTime).toBe("2030-06-21T18:30:00");
    expect(patchArg.requestBody.start.timeZone).toBe("Europe/Warsaw");

    // Naprawa jest `timesOnly` — nie kasuje opisu dopisanego po stronie Google.
    expect(patchArg.requestBody.summary).toBeUndefined();
    expect(patchArg.requestBody.description).toBeUndefined();
  });

  it("odtwarza zdarzenie skasowane ręcznie w Google (patch → 404)", async () => {
    insertMock.mockClear();
    patchMock.mockClear();
    patchMock.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: 404 }));
    const pair = await makePair(true);
    const id = await addConsultation(pair, {
      status: "confirmed",
      googleEventId: "evt-deleted-in-google",
      at: "2030-07-05T18:30:00.000Z",
    });

    const r = await syncBackfillPair(db, {
      trainerId: pair.trainer,
      traineeId: pair.trainee,
      nowISO: new Date().toISOString(),
    });

    // Termin liczy się jako zsynchronizowany, a martwa referencja zostaje zastąpiona nową.
    expect(r).toEqual({ connected: true, attempted: 1, synced: 1 });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = await fetchConsultation(id);
    expect(row!.googleEventId).toBe("evt-123");
  });

  it("best-effort: błąd patcha nie przerywa reszty przebiegu", async () => {
    insertMock.mockClear();
    patchMock.mockClear();
    patchMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: 500 }));
    const pair = await makePair(true);
    await addConsultation(pair, {
      status: "confirmed",
      googleEventId: "evt-fail",
      at: "2030-08-02T18:30:00.000Z",
    });
    await addConsultation(pair, {
      status: "confirmed",
      googleEventId: "evt-ok",
      at: "2030-08-09T18:30:00.000Z",
    });

    const r = await syncBackfillPair(db, {
      trainerId: pair.trainer,
      traineeId: pair.trainee,
      nowISO: new Date().toISOString(),
    });

    // Pierwszy padł, drugi mimo to przeszedł — i nic nie wyleciało na zewnątrz.
    expect(r).toEqual({ connected: true, attempted: 2, synced: 1 });
    expect(patchMock).toHaveBeenCalledTimes(2);
    expect(patchArgs().map((a) => a.eventId)).toEqual(["evt-fail", "evt-ok"]);
    // Błąd 500 to NIE „zdarzenie zniknęło" — nic nie odtwarzamy.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("no-op dla trenera bez połączenia Google", async () => {
    insertMock.mockClear();
    patchMock.mockClear();
    const pair = await makePair(false);

    const r = await syncBackfillPair(db, {
      trainerId: pair.trainer,
      traineeId: pair.trainee,
      nowISO: new Date().toISOString(),
    });

    // `connected: false` odróżnia „nie ma czego synchronizować" od „integracja nie działa".
    expect(r).toEqual({ connected: false, attempted: 0, synced: 0 });
    expect(insertMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });
});

describe("syncCancelStaleSchedule — sprzątanie po zmianie harmonogramu", () => {
  it("kasuje zdarzenia nadchodzących odwołanych terminów i czyści googleEventId", async () => {
    deleteMock.mockClear();
    const fromISO = new Date().toISOString().slice(0, 10);
    const stale = await insertConsultation({
      status: "cancelled",
      googleEventId: "evt-stale-1",
      daysFromNow: 11,
    });

    await syncCancelStaleSchedule(db, { trainerId, traineeId, fromISO });

    const row = await fetchConsultation(stale);
    expect(row!.googleEventId).toBeNull(); // referencja wyczyszczona (wiersz zostaje)
    expect(deleteMock).toHaveBeenCalled();
  });
});
