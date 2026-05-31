import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  countOpenItemsForTrainee,
  createConsultation,
  deleteConsultation,
  getConsultationDetail,
  listConsultationsForTrainee,
  setActionItemStatus,
  updateConsultation,
} from "~/lib/consultations";

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

  const [tA] = await db
    .insert(schema.users)
    .values({
      email: "trenera@example.com",
      displayName: "Trener A",
      role: "trainer",
    })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;
  const [pA] = await db
    .insert(schema.users)
    .values({
      email: "podoa@example.com",
      displayName: "Podo A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = pA!.id;
  const [tB] = await db
    .insert(schema.users)
    .values({
      email: "trenerb@example.com",
      displayName: "Trener B",
      role: "trainer",
    })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;
  const [pB] = await db
    .insert(schema.users)
    .values({
      email: "podob@example.com",
      displayName: "Podo B",
      role: "trainee",
      trainerId: trainerB,
    })
    .returning({ id: schema.users.id });
  traineeB = pB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

const form = {
  heldOn: "2026-05-20",
  periodFrom: "2026-05-01",
  periodTo: "2026-05-19",
  title: "Maj",
  summary: "OK",
  items: [
    { body: "Łokcie", status: "open" as const },
    { body: "Tempo", status: "resolved" as const },
  ],
};

describe("consultations repo", () => {
  it("tworzy konsultację z punktami w kolejności", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(detail).not.toBeNull();
    expect(detail!.items.map((i) => i.body)).toEqual(["Łokcie", "Tempo"]);
    expect(detail!.items[0]!.ordinal).toBe(0);
    expect(detail!.items[1]!.resolvedAt).not.toBeNull();
  });

  it("nie pozwala obcemu trenerowi odczytać konsultacji (404 → null)", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const asB = await getConsultationDetail(db, { consultationId: id, trainerId: trainerB });
    expect(asB).toBeNull();
  });

  it("nie pozwala obcemu podopiecznemu odczytać konsultacji", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const asPB = await getConsultationDetail(db, { consultationId: id, traineeId: traineeB });
    expect(asPB).toBeNull();
  });

  it("blokuje tworzenie konsultacji dla cudzego podopiecznego", async () => {
    await expect(
      createConsultation(db, { trainerId: trainerB, traineeId: traineeA, form }),
    ).rejects.toThrow();
  });

  it("setActionItemStatus ustawia/zeruje resolved_at i pilnuje właściciela", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    const openItem = detail!.items.find((i) => i.status === "open")!;
    await setActionItemStatus(db, { trainerId: trainerA, itemId: openItem.id, status: "resolved" });
    const after = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(after!.items.find((i) => i.id === openItem.id)!.resolvedAt).not.toBeNull();
    await expect(
      setActionItemStatus(db, { trainerId: trainerB, itemId: openItem.id, status: "open" }),
    ).rejects.toThrow();
  });

  it("countOpenItemsForTrainee liczy otwarte punkty", async () => {
    const n = await countOpenItemsForTrainee(db, traineeA);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await countOpenItemsForTrainee(db, traineeB)).toBe(0);
  });

  it("update wymienia punkty", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    await updateConsultation(db, {
      trainerId: trainerA,
      consultationId: id,
      form: { ...form, items: [{ body: "Nowy", status: "open" }] },
    });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(detail!.items.map((i) => i.body)).toEqual(["Nowy"]);
  });

  it("blokuje edycję cudzej konsultacji", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    await expect(
      updateConsultation(db, {
        trainerId: trainerB,
        consultationId: id,
        form: { ...form, items: [] },
      }),
    ).rejects.toThrow();
  });

  it("delete kasuje konsultację i kaskadowo punkty", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const ok = await deleteConsultation(db, { trainerId: trainerA, consultationId: id });
    expect(ok).toBe(true);
    const gone = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(gone).toBeNull();
  });

  it("listConsultationsForTrainee zwraca pozycje z licznikami", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const list = await listConsultationsForTrainee(db, traineeA);
    const found = list.find((c) => c.id === id);
    expect(found).toBeDefined();
    expect(found!.totalItemCount).toBe(2);
    expect(found!.openItemCount).toBe(1);
  });
});
