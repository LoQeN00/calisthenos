// Integration test — owner runs under Docker (testcontainers). Do NOT run in the no-Docker loop.
// Uruchamia właściciel pod Dockerem: npm run test:itest
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  effectiveExerciseWhere,
  fileIsBrandDemoInOrg,
  forkExercise,
  forkedExerciseOriginIds,
  isBrandOwned,
} from "~/lib/catalog";
import { ensureOrganization, ensureRegion, assignUserToOrgRegion } from "~/lib/organizations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Współdzielone id ustawiane w beforeAll.
let orgId: string;
let otherOrgId: string;
let trainerA: string;
let trainerB: string;
let trainerC: string; // trener z INNEJ organizacji
let traineeInOrg: string; // podopieczny w org (trainerId = A)
let brandExerciseId: string; // markowe ćwiczenie org (trainer_id NULL)
let ownExerciseA: string; // własne ćwiczenie trenera A
let otherBrandExerciseId: string; // markowe ćwiczenie INNEJ organizacji
let brandDemoFileId: string; // plik demo markowego ćwiczenia (właściciel: founder A)
let arbitraryFileId: string; // plik nie będący demo żadnego markowego ćwiczenia

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // Organizacja + region + druga organizacja.
  orgId = await ensureOrganization(db, "Marka Globalna");
  const regionId = await ensureRegion(db, {
    organizationId: orgId,
    name: "Polska",
    country: "PL",
    currency: "pln",
    locale: "pl-PL",
  });
  // ensureOrganization jest idempotentny (zwraca pierwszy wiersz), więc drugą org wstawiamy wprost.
  const [otherOrg] = await db
    .insert(schema.organizations)
    .values({ name: "Inna Marka" })
    .returning({ id: schema.organizations.id });
  otherOrgId = otherOrg!.id;

  // Dwaj trenerzy w org.
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trener-a@example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trener-b@example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;
  trainerB = tB!.id;
  await assignUserToOrgRegion(db, trainerA, orgId, regionId);
  await assignUserToOrgRegion(db, trainerB, orgId, regionId);

  // Markowe ćwiczenie org (trainer_id NULL, organization_id = org).
  const [brand] = await db
    .insert(schema.exercises)
    .values({
      trainerId: null,
      organizationId: orgId,
      name: "Pull-up",
      unit: "REPS",
      description: "Markowe podciąganie",
    })
    .returning({ id: schema.exercises.id });
  brandExerciseId = brand!.id;

  // Własne ćwiczenie trenera A.
  const [own] = await db
    .insert(schema.exercises)
    .values({
      trainerId: trainerA,
      organizationId: null,
      name: "Własne A",
      unit: "REPS",
    })
    .returning({ id: schema.exercises.id });
  ownExerciseA = own!.id;

  // Markowe ćwiczenie INNEJ organizacji (do testu obcej org).
  const [otherBrand] = await db
    .insert(schema.exercises)
    .values({
      trainerId: null,
      organizationId: otherOrgId,
      name: "Dip",
      unit: "REPS",
    })
    .returning({ id: schema.exercises.id });
  otherBrandExerciseId = otherBrand!.id;

  // Trener z INNEJ organizacji (do testu odczytu demo z obcej org).
  const [tC] = await db
    .insert(schema.users)
    .values({ email: "trener-c@example.com", displayName: "Trener C", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerC = tC!.id;
  const otherRegionId = await ensureRegion(db, {
    organizationId: otherOrgId,
    name: "Francja",
    country: "FR",
    currency: "eur",
    locale: "fr-FR",
  });
  await assignUserToOrgRegion(db, trainerC, otherOrgId, otherRegionId);

  // Podopieczny w org: organizationId NULL, ale trainerId = A (founder org).
  const [trainee] = await db
    .insert(schema.users)
    .values({
      email: "podopieczny@example.com",
      displayName: "Podopieczny",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeInOrg = trainee!.id;

  // Plik demo markowego ćwiczenia — właścicielem (trainer_id) jest founder A.
  const [demoFile] = await db
    .insert(schema.files)
    .values({
      trainerId: trainerA,
      uploadedBy: trainerA,
      kind: "exercise_demo",
      mimeType: "video/mp4",
      bytes: 1024,
      storagePath: "brand-demo.mp4",
    })
    .returning({ id: schema.files.id });
  brandDemoFileId = demoFile!.id;
  // Wpięcie pliku jako demo markowego ćwiczenia org.
  await db
    .update(schema.exercises)
    .set({ demoFileId: brandDemoFileId })
    .where(eq(schema.exercises.id, brandExerciseId));

  // Plik nie będący demo żadnego markowego ćwiczenia (kontrola negatywna).
  const [arbitrary] = await db
    .insert(schema.files)
    .values({
      trainerId: trainerA,
      uploadedBy: trainerA,
      kind: "set_video",
      mimeType: "video/mp4",
      bytes: 2048,
      storagePath: "arbitrary.mp4",
    })
    .returning({ id: schema.files.id });
  arbitraryFileId = arbitrary!.id;
}, 180000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

/** Pomocnik: id z efektywnego katalogu trenera (liczy forki świeżo). */
async function effectiveIds(trainerId: string): Promise<Set<string>> {
  const forked = await forkedExerciseOriginIds(db, trainerId);
  const rows = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(effectiveExerciseWhere(orgId, trainerId, forked));
  return new Set(rows.map((r) => r.id));
}

describe("effectiveExerciseWhere + forkedExerciseOriginIds", () => {
  it("przed forkiem: A widzi własne + markowe org", async () => {
    const ids = await effectiveIds(trainerA);
    expect(ids.has(ownExerciseA)).toBe(true);
    expect(ids.has(brandExerciseId)).toBe(true);
    // Markowe innej org poza zakresem.
    expect(ids.has(otherBrandExerciseId)).toBe(false);
  });

  it("trener B (bez własnych) widzi markowe org", async () => {
    const ids = await effectiveIds(trainerB);
    expect(ids.has(brandExerciseId)).toBe(true);
    expect(ids.has(ownExerciseA)).toBe(false);
  });

  it("po forku A: oryginał markowy znika z widoku A, klon się pojawia; B nadal widzi oryginał", async () => {
    const cloneId = await forkExercise(db, {
      trainerId: trainerA,
      organizationId: orgId,
      exerciseId: brandExerciseId,
    });
    expect(cloneId).not.toBeNull();

    const aIds = await effectiveIds(trainerA);
    expect(aIds.has(brandExerciseId)).toBe(false); // oryginał wytłumiony przez origin
    expect(aIds.has(cloneId as string)).toBe(true); // klon w widoku A
    expect(aIds.has(ownExerciseA)).toBe(true); // własne nadal widoczne

    const bIds = await effectiveIds(trainerB);
    expect(bIds.has(brandExerciseId)).toBe(true); // B nie forkował → widzi oryginał
    expect(bIds.has(cloneId as string)).toBe(false); // klon A poza widokiem B
  });

  it("brak organizacji → tylko własne", async () => {
    const forked = await forkedExerciseOriginIds(db, trainerA);
    const rows = await db
      .select({ id: schema.exercises.id, trainerId: schema.exercises.trainerId })
      .from(schema.exercises)
      .where(effectiveExerciseWhere(null, trainerA, forked));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.trainerId === trainerA)).toBe(true);
  });
});

describe("isBrandOwned", () => {
  it("markowy wiersz (trainer_id NULL) → true; trenerski → false", () => {
    expect(isBrandOwned({ trainerId: null })).toBe(true);
    expect(isBrandOwned({ trainerId: trainerA })).toBe(false);
  });
});

describe("forkExercise — copy-on-write i idempotencja", () => {
  it("forkuje markowe na własność A z origin_id; powtórne wywołanie zwraca to samo id; oryginał bez zmian", async () => {
    const first = await forkExercise(db, {
      trainerId: trainerA,
      organizationId: orgId,
      exerciseId: brandExerciseId,
    });
    expect(first).not.toBeNull();

    // Kształt klonu: trainer_id=A, origin_id=brand, organization_id=NULL.
    const [clone] = await db
      .select({
        trainerId: schema.exercises.trainerId,
        organizationId: schema.exercises.organizationId,
        originId: schema.exercises.originId,
        name: schema.exercises.name,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, first as string))
      .limit(1);
    expect(clone!.trainerId).toBe(trainerA);
    expect(clone!.organizationId).toBeNull();
    expect(clone!.originId).toBe(brandExerciseId);
    expect(clone!.name).toBe("Pull-up");

    // Idempotencja: drugie wywołanie → to samo id, brak nowego wiersza. Backuje to
    // teraz unikat DB exercises_trainer_origin_uniq (≤1 fork origin na trenera) —
    // nawet wyścig dwóch forków da co najwyżej jeden wiersz, a forkExercise łapie
    // 23505 po nazwie indeksu i odczytuje kanoniczny fork.
    const second = await forkExercise(db, {
      trainerId: trainerA,
      organizationId: orgId,
      exerciseId: brandExerciseId,
    });
    expect(second).toBe(first);
    const clonesOfBrand = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.trainerId, trainerA),
          eq(schema.exercises.originId, brandExerciseId),
        ),
      );
    expect(clonesOfBrand.length).toBe(1);

    // Oryginał markowy bez zmian (nadal trainer_id NULL, org = org).
    const [orig] = await db
      .select({
        trainerId: schema.exercises.trainerId,
        organizationId: schema.exercises.organizationId,
      })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, brandExerciseId))
      .limit(1);
    expect(orig!.trainerId).toBeNull();
    expect(orig!.organizationId).toBe(orgId);
  });

  it("zwraca null dla ćwiczenia NIE-markowego (trainer_id ustawione)", async () => {
    const res = await forkExercise(db, {
      trainerId: trainerB,
      organizationId: orgId,
      exerciseId: ownExerciseA, // wiersz trenerski, nie markowy
    });
    expect(res).toBeNull();
  });

  it("zwraca null dla markowego ćwiczenia INNEJ organizacji", async () => {
    const res = await forkExercise(db, {
      trainerId: trainerA,
      organizationId: orgId,
      exerciseId: otherBrandExerciseId, // markowe, ale org != trener.org
    });
    expect(res).toBeNull();
  });
});

describe("CHECK exercises_owner_check", () => {
  it("odrzuca wiersz z OBOMA: trainer_id i organization_id", async () => {
    await expect(
      db.insert(schema.exercises).values({
        trainerId: trainerA,
        organizationId: orgId, // niedozwolone razem z trainer_id
        name: "Zły — oba",
        unit: "REPS",
      }),
    ).rejects.toThrow();
  });

  it("odrzuca wiersz bez właściciela (ani trainer_id, ani organization_id)", async () => {
    await expect(
      db.insert(schema.exercises).values({
        trainerId: null,
        organizationId: null, // niedozwolone — brak właściciela
        name: "Zły — żaden",
        unit: "REPS",
      }),
    ).rejects.toThrow();
  });
});

// Autoryzacja serwowania plików: demo markowego ćwiczenia jest czytelne dla
// wszystkich członków organizacji (nie tylko właściciela pliku = foundera).
// Testujemy bezpośrednio helper fileIsBrandDemoInOrg (czyste zapytanie DB) —
// trasa składa go z effectiveOrgId + ownsTrainerScope. Uruchamia właściciel pod Dockerem.
describe("fileIsBrandDemoInOrg — odczyt demo markowych w org", () => {
  // Odtwarza wyliczanie efektywnej org z trasy files.$fileId: własna org użytkownika,
  // a dla podopiecznego (organizationId NULL) — org jego trenera.
  async function effectiveOrgIdOf(userId: string): Promise<string | null> {
    const [u] = await db
      .select({ org: schema.users.organizationId, trainerId: schema.users.trainerId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (u!.org) return u!.org;
    if (u!.trainerId) {
      const [t] = await db
        .select({ org: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, u!.trainerId))
        .limit(1);
      return t?.org ?? null;
    }
    return null;
  }

  it("demo markowego ćwiczenia → widoczne dla innego trenera tej samej org", async () => {
    // Trener B (ta sama org co founder A, ale NIE właściciel pliku) → dozwolone.
    const org = await effectiveOrgIdOf(trainerB);
    expect(await fileIsBrandDemoInOrg(db, brandDemoFileId, org)).toBe(true);
  });

  it("demo markowego ćwiczenia → widoczne dla podopiecznego w org", async () => {
    // Podopieczny ma organizationId NULL; efektywną org bierzemy z jego trenera (A → orgId).
    const org = await effectiveOrgIdOf(traineeInOrg);
    expect(org).toBe(orgId);
    expect(await fileIsBrandDemoInOrg(db, brandDemoFileId, org)).toBe(true);
  });

  it("trener z INNEJ organizacji → brak dostępu (false)", async () => {
    // Efektywna org trenera C = otherOrgId ≠ org pliku demo → false.
    const org = await effectiveOrgIdOf(trainerC);
    expect(org).toBe(otherOrgId);
    expect(await fileIsBrandDemoInOrg(db, brandDemoFileId, org)).toBe(false);
  });

  it("plik nie będący demo markowego ćwiczenia → false", async () => {
    expect(await fileIsBrandDemoInOrg(db, arbitraryFileId, orgId)).toBe(false);
  });

  it("null org → false (krótkie spięcie bez zapytania)", async () => {
    expect(await fileIsBrandDemoInOrg(db, brandDemoFileId, null)).toBe(false);
  });
});
