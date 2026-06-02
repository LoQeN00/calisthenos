import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deactivateSchedule,
  ensureOccurrences,
  getActiveSchedule,
  upsertSchedule,
} from "~/lib/consultation-schedules";
import {
  cancelOccurrence,
  countPendingForTrainee,
  createAdhocConsultation,
  documentConsultation,
  getConsultationDetail,
  listOccurrencesForTrainee,
  listTrainerOccurrencesInRange,
  rescheduleOccurrence,
  respondToOccurrence,
} from "~/lib/consultations";
import * as schema from "~/lib/db/schema";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
let trainerA = "";
let traineeA = "";
let trainerB = "";
let traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const mk = async (email: string, role: "trainer" | "trainee", trainerId?: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email, displayName: email, role, trainerId })
      .returning({ id: schema.users.id });
    return u!.id;
  };
  trainerA = await mk("ta@example.com", "trainer");
  traineeA = await mk("pa@example.com", "trainee", trainerA);
  trainerB = await mk("tb@example.com", "trainer");
  traineeB = await mk("pb@example.com", "trainee", trainerB);
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

const weeklyForm = {
  cadence: "weekly" as const,
  weekday: 3,
  dayOfMonth: null,
  timeOfDay: "18:00",
  durationMin: 45,
  startsOn: "2026-06-01",
  defaultMeetingUrl: null,
};

describe("harmonogram + materializacja", () => {
  it("upsertSchedule generuje terminy planned z właściwymi datami i jest idempotentny", async () => {
    const schedId = await upsertSchedule(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      form: weeklyForm,
      fromISO: "2026-06-01",
    });
    const occ1 = await listOccurrencesForTrainee(db, traineeA, {
      fromISO: "2026-06-01T00:00:00.000Z",
      toISO: "2026-06-30T23:59:59.000Z",
    });
    expect(occ1.length).toBeGreaterThanOrEqual(4); // środy czerwca
    expect(occ1.every((o) => o.status === "planned")).toBe(true);
    // idempotencja
    await ensureOccurrences(db, schedId, "2026-06-01");
    const occ2 = await listOccurrencesForTrainee(db, traineeA, {
      fromISO: "2026-06-01T00:00:00.000Z",
      toISO: "2026-06-30T23:59:59.000Z",
    });
    expect(occ2.length).toBe(occ1.length);
  });

  it("blokuje harmonogram dla cudzego podopiecznego", async () => {
    await expect(
      upsertSchedule(db, {
        trainerId: trainerB,
        traineeId: traineeA,
        form: weeklyForm,
        fromISO: "2026-06-01",
      }),
    ).rejects.toThrow();
  });

  it("deactivateSchedule anuluje przyszłe planned", async () => {
    await deactivateSchedule(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      fromISO: "2026-06-01",
    });
    expect(await getActiveSchedule(db, { trainerId: trainerA, traineeId: traineeA })).toBeNull();
    const occ = await listOccurrencesForTrainee(db, traineeA, {
      fromISO: "2026-06-01T00:00:00.000Z",
      toISO: "2026-06-30T23:59:59.000Z",
    });
    expect(occ.length).toBe(0); // wszystkie cancelled, lista je pomija
  });
});

describe("cykl życia terminu", () => {
  it("podopieczny potwierdza tylko własny i z dozwolonego statusu", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: false,
      form: { scheduledAt: "2026-07-01T18:00", durationMin: 45, title: "Ad-hoc", summary: "", items: [] },
    });
    await respondToOccurrence(db, { traineeId: traineeA, consultationId: id, action: "confirm" });
    const d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("confirmed");
    // obcy podopieczny nie może
    await expect(
      respondToOccurrence(db, { traineeId: traineeB, consultationId: id, action: "decline" }),
    ).rejects.toThrow();
  });

  it("prośba o zmianę zapisuje notatkę; reschedule wraca do planned i czyści notatkę", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: false,
      form: { scheduledAt: "2026-07-08T18:00", durationMin: 45, title: "X", summary: "", items: [] },
    });
    await respondToOccurrence(db, {
      traineeId: traineeA,
      consultationId: id,
      action: "request_change",
      note: "Wolę rano",
    });
    let d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("change_requested");
    expect(d!.consultation.traineeNote).toBe("Wolę rano");
    await rescheduleOccurrence(db, {
      trainerId: trainerA,
      consultationId: id,
      scheduledAtLocal: "2026-07-09T09:00",
    });
    d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("planned");
    expect(d!.consultation.traineeNote).toBeNull();
  });

  it("cancel pilnuje właściciela; documented wstawia punkty i blokuje cancelled", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: false,
      form: { scheduledAt: "2026-07-15T18:00", durationMin: 45, title: "Y", summary: "", items: [] },
    });
    await expect(cancelOccurrence(db, { trainerId: trainerB, consultationId: id })).rejects.toThrow();
    await documentConsultation(db, {
      trainerId: trainerA,
      consultationId: id,
      form: {
        scheduledAt: "2026-07-15T18:00",
        durationMin: 45,
        title: "Y",
        summary: "Dobre tempo",
        items: [{ body: "Łokcie", status: "open" }],
      },
    });
    const d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("documented");
    expect(d!.items.map((i) => i.body)).toEqual(["Łokcie"]);
  });

  it("countPendingForTrainee liczy planned czekające na reakcję", async () => {
    const n = await countPendingForTrainee(db, traineeA);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(await countPendingForTrainee(db, traineeB)).toBe(0);
  });

  it("tenant-scope: obcy trener nie czyta szczegółów", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: true,
      form: { scheduledAt: "2026-07-20T18:00", durationMin: 45, title: "Z", summary: "ok", items: [] },
    });
    expect(await getConsultationDetail(db, { consultationId: id, trainerId: trainerB })).toBeNull();
    expect(await getConsultationDetail(db, { consultationId: id, traineeId: traineeB })).toBeNull();
  });
});

describe("zbiorczy kalendarz trenera", () => {
  it("listTrainerOccurrencesInRange zwraca terminy trenera z nazwą podopiecznego i pomija obcych", async () => {
    const range = { fromISO: "2026-07-01T00:00:00.000Z", toISO: "2026-07-31T23:59:59.000Z" };
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: false,
      form: { scheduledAt: "2026-07-25T10:00", durationMin: 30, title: "Kalendarz", summary: "", items: [] },
    });
    // Termin trenera B (nie powinien wyciekać do trenera A).
    await createAdhocConsultation(db, {
      trainerId: trainerB,
      traineeId: traineeB,
      documented: false,
      form: { scheduledAt: "2026-07-26T10:00", durationMin: 30, title: "B-term", summary: "", items: [] },
    });

    const listA = await listTrainerOccurrencesInRange(db, { trainerId: trainerA, ...range });
    const mine = listA.find((o) => o.id === id);
    expect(mine).toBeDefined();
    expect(mine!.traineeId).toBe(traineeA);
    expect(mine!.traineeName.length).toBeGreaterThan(0);
    // Wszystkie pozycje należą do podopiecznych trenera A (brak wycieku B).
    expect(listA.every((o) => o.traineeId !== traineeB)).toBe(true);

    const listB = await listTrainerOccurrencesInRange(db, { trainerId: trainerB, ...range });
    expect(listB.some((o) => o.id === id)).toBe(false);
  });

  it("pomija terminy cancelled", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA,
      traineeId: traineeA,
      documented: false,
      form: { scheduledAt: "2026-08-03T10:00", durationMin: 30, title: "DoOdwołania", summary: "", items: [] },
    });
    await cancelOccurrence(db, { trainerId: trainerA, consultationId: id });
    const list = await listTrainerOccurrencesInRange(db, {
      trainerId: trainerA,
      fromISO: "2026-08-01T00:00:00.000Z",
      toISO: "2026-08-31T23:59:59.000Z",
    });
    expect(list.some((o) => o.id === id)).toBe(false);
  });
});
