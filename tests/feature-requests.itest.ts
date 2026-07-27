// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import {
  FeatureRequestError,
  countForTrainee,
  countNewForTrainer,
  createFeatureRequest,
  deleteFeatureRequest,
  getForTrainer,
  listForTrainer,
  respondToFeatureRequest,
} from "~/lib/feature-requests";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";
let traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@fr.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@fr.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pA] = await db
    .insert(schema.users)
    .values({
      email: "podopiecznya@fr.example.com",
      displayName: "Ala Podopieczna",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = pA!.id;

  const [pB] = await db
    .insert(schema.users)
    .values({
      email: "podopiecznyb@fr.example.com",
      displayName: "Bartek Podopieczny",
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

async function newRequest(trainerId: string, traineeId: string, title: string) {
  return await createFeatureRequest(db, {
    trainerId,
    traineeId,
    kind: "idea",
    title,
    body: "Opis zgłoszenia testowego.",
  });
}

describe("tworzenie", () => {
  it("nowe zgłoszenie ma status new i trafia do trenera autora", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Ciemny motyw");
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("new");
    expect(detail?.traineeName).toBe("Ala Podopieczna");
    expect(detail?.trainerResponse).toBeNull();
  });
});

describe("tenant-scope", () => {
  it("trener B nie odczyta zgłoszenia podopiecznego trenera A", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant odczyt");
    expect(await getForTrainer(db, trainerB, id)).toBeNull();
  });

  it("lista trenera B nie zawiera zgłoszeń trenera A", async () => {
    await newRequest(trainerA, traineeA, "Tenant lista A");
    await newRequest(trainerB, traineeB, "Tenant lista B");
    const rows = await listForTrainer(db, trainerB, { limit: 100, offset: 0 });
    expect(rows.every((r) => r.traineeId === traineeB)).toBe(true);
    expect(rows.some((r) => r.title === "Tenant lista A")).toBe(false);
  });

  it("respondToFeatureRequest obcego trenera nic nie zmienia", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant odpowiedź");
    const err = await respondToFeatureRequest(db, {
      trainerId: trainerB,
      id,
      status: "rejected",
      response: "Przejęte",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("new");
    expect(detail?.trainerResponse).toBeNull();
  });

  it("podopieczny nie usunie cudzego zgłoszenia", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant usuwanie");
    const err = await deleteFeatureRequest(db, { traineeId: traineeB, id }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    expect(await getForTrainer(db, trainerA, id)).not.toBeNull();
  });
});

describe("odpowiedź trenera", () => {
  it("ustawia status, treść i respondedAt", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Odpowiedź pełna");
    await respondToFeatureRequest(db, {
      trainerId: trainerA,
      id,
      status: "planned",
      response: "Robimy w przyszłym miesiącu.",
    });
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("planned");
    expect(detail?.trainerResponse).toBe("Robimy w przyszłym miesiącu.");
    expect(detail?.respondedAtISO).not.toBeNull();
  });

  it("sama zmiana statusu nie stempluje respondedAt", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Odpowiedź pusta");
    await respondToFeatureRequest(db, {
      trainerId: trainerA,
      id,
      status: "considering",
      response: null,
    });
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("considering");
    expect(detail?.respondedAtISO).toBeNull();
  });
});

describe("usuwanie przez autora", () => {
  it("usuwa własne zgłoszenie ze statusem new", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Do usunięcia");
    await deleteFeatureRequest(db, { traineeId: traineeA, id });
    expect(await getForTrainer(db, trainerA, id)).toBeNull();
  });

  it("nie usunie zgłoszenia po zmianie statusu przez trenera", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Już obsłużone");
    await respondToFeatureRequest(db, {
      trainerId: trainerA,
      id,
      status: "done",
      response: "Zrobione.",
    });
    const err = await deleteFeatureRequest(db, { traineeId: traineeA, id }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    expect(await getForTrainer(db, trainerA, id)).not.toBeNull();
  });
});

describe("liczniki", () => {
  it("countNewForTrainer liczy tylko new i tylko własne", async () => {
    const before = await countNewForTrainer(db, trainerB);
    const { id } = await newRequest(trainerB, traineeB, "Licznik nowe");
    expect(await countNewForTrainer(db, trainerB)).toBe(before + 1);
    await respondToFeatureRequest(db, { trainerId: trainerB, id, status: "done", response: "OK." });
    expect(await countNewForTrainer(db, trainerB)).toBe(before);
  });

  it("countForTrainee liczy tylko własne zgłoszenia", async () => {
    const mine = await countForTrainee(db, traineeB);
    const all = await db.select().from(schema.featureRequests);
    expect(mine).toBeLessThan(all.length);
  });
});
