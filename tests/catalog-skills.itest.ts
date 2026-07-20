// Integration test — owner runs under Docker (testcontainers). Do NOT run in the no-Docker loop.
// Uruchamia właściciel pod Dockerem: npm run test:itest
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import { forkSkill } from "~/lib/catalog";
import { ensureOrganization, ensureRegion, assignUserToOrgRegion } from "~/lib/organizations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Współdzielone id ustawiane w beforeAll.
let orgId: string;
let otherOrgId: string;
let trainerA: string; // trener w org
let traineeA: string; // podopieczny (do testu „nie-markowy = trenerski")

// Markowy graf umiejętności org:
let brandSkillId: string; // markowa umiejętność z 2 wariantami + 1 prereq
let brandPrereqSkillId: string; // markowa umiejętność będąca prerekwizytem brandSkillId
let brandExerciseX: string; // markowe ćwiczenie — wariant 1
let brandExerciseY: string; // markowe ćwiczenie — wariant 2
let ownSkillA: string; // własna (trenerska) umiejętność A — nie-markowa
let otherBrandSkillId: string; // markowa umiejętność INNEJ organizacji

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
  const [otherOrg] = await db
    .insert(schema.organizations)
    .values({ name: "Inna Marka" })
    .returning({ id: schema.organizations.id });
  otherOrgId = otherOrg!.id;

  // Trener w org.
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trener-a@example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;
  await assignUserToOrgRegion(db, trainerA, orgId, regionId);

  // Podopieczny A (do negatywnego testu: jego „własna" umiejętność trenerska).
  const [trA] = await db
    .insert(schema.users)
    .values({
      email: "podopieczny-a@example.com",
      displayName: "Podopieczny A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = trA!.id;

  // Dwa markowe ćwiczenia org (warianty drabiny).
  const [exX] = await db
    .insert(schema.exercises)
    .values({ trainerId: null, organizationId: orgId, name: "Tuck Front Lever", unit: "SEC" })
    .returning({ id: schema.exercises.id });
  brandExerciseX = exX!.id;
  const [exY] = await db
    .insert(schema.exercises)
    .values({ trainerId: null, organizationId: orgId, name: "Full Front Lever", unit: "SEC" })
    .returning({ id: schema.exercises.id });
  brandExerciseY = exY!.id;

  // Markowa umiejętność-prerekwizyt (np. „Pull-up").
  const [prereqSkill] = await db
    .insert(schema.skills)
    .values({
      trainerId: null,
      organizationId: orgId,
      name: "Pull-up",
      description: "Baza ciągu",
    })
    .returning({ id: schema.skills.id });
  brandPrereqSkillId = prereqSkill!.id;

  // Markowa umiejętność główna (Front Lever) z 2 wariantami.
  const [mainSkill] = await db
    .insert(schema.skills)
    .values({
      trainerId: null,
      organizationId: orgId,
      name: "Front Lever",
      description: "Markowa drabina FL",
    })
    .returning({ id: schema.skills.id });
  brandSkillId = mainSkill!.id;

  await db.insert(schema.skillVariations).values([
    { skillId: brandSkillId, exerciseId: brandExerciseX, ordinal: 1 },
    { skillId: brandSkillId, exerciseId: brandExerciseY, ordinal: 2 },
  ]);

  // Krawędź prerekwizytu (markowa): Front Lever wymaga Pull-up.
  await db.insert(schema.skillPrerequisites).values({
    trainerId: null,
    organizationId: orgId,
    skillId: brandSkillId,
    requiresSkillId: brandPrereqSkillId,
  });

  // Własna (trenerska) umiejętność A — nie-markowa (do negatywnego testu).
  const [own] = await db
    .insert(schema.skills)
    .values({ trainerId: trainerA, name: "Własna A", description: "" })
    .returning({ id: schema.skills.id });
  ownSkillA = own!.id;

  // Markowa umiejętność INNEJ organizacji.
  const [otherBrand] = await db
    .insert(schema.skills)
    .values({ trainerId: null, organizationId: otherOrgId, name: "Planche", description: "" })
    .returning({ id: schema.skills.id });
  otherBrandSkillId = otherBrand!.id;
}, 180000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("forkSkill — głęboki klon markowej umiejętności", () => {
  it("klonuje skill + warianty (te same ordinale/exerciseId) + krawędź prereq (skillId podmieniony na klon)", async () => {
    const cloneId = await forkSkill(db, {
      trainerId: trainerA,
      organizationId: orgId,
      skillId: brandSkillId,
    });
    expect(cloneId).not.toBeNull();

    // Kształt klonu: trainer_id=A, origin_id=brand, organization_id=NULL, skopiowane name/description.
    const [clone] = await db
      .select({
        trainerId: schema.skills.trainerId,
        organizationId: schema.skills.organizationId,
        originId: schema.skills.originId,
        name: schema.skills.name,
        description: schema.skills.description,
      })
      .from(schema.skills)
      .where(eq(schema.skills.id, cloneId as string))
      .limit(1);
    expect(clone!.trainerId).toBe(trainerA);
    expect(clone!.organizationId).toBeNull();
    expect(clone!.originId).toBe(brandSkillId);
    expect(clone!.name).toBe("Front Lever");
    expect(clone!.description).toBe("Markowa drabina FL");

    // Warianty sklonowane: te same exerciseId i ordinale.
    const clonedVariations = await db
      .select({
        exerciseId: schema.skillVariations.exerciseId,
        ordinal: schema.skillVariations.ordinal,
      })
      .from(schema.skillVariations)
      .where(eq(schema.skillVariations.skillId, cloneId as string))
      .orderBy(schema.skillVariations.ordinal);
    expect(clonedVariations).toEqual([
      { exerciseId: brandExerciseX, ordinal: 1 },
      { exerciseId: brandExerciseY, ordinal: 2 },
    ]);

    // Krawędź prereq sklonowana: skillId podmieniony na klon, trainerId=A, org NULL,
    // requiresSkillId nadal wskazuje markowy prerekwizyt (nie był klonowanym skillem).
    const clonedEdges = await db
      .select({
        trainerId: schema.skillPrerequisites.trainerId,
        organizationId: schema.skillPrerequisites.organizationId,
        skillId: schema.skillPrerequisites.skillId,
        requiresSkillId: schema.skillPrerequisites.requiresSkillId,
      })
      .from(schema.skillPrerequisites)
      .where(eq(schema.skillPrerequisites.skillId, cloneId as string));
    expect(clonedEdges).toEqual([
      {
        trainerId: trainerA,
        organizationId: null,
        skillId: cloneId,
        requiresSkillId: brandPrereqSkillId,
      },
    ]);

    // Oryginał markowy bez zmian.
    const [orig] = await db
      .select({
        trainerId: schema.skills.trainerId,
        organizationId: schema.skills.organizationId,
      })
      .from(schema.skills)
      .where(eq(schema.skills.id, brandSkillId))
      .limit(1);
    expect(orig!.trainerId).toBeNull();
    expect(orig!.organizationId).toBe(orgId);
  });

  it("idempotencja: drugie wywołanie zwraca to samo id; dokładnie jeden klon, bez duplikatów wariantów/krawędzi", async () => {
    const first = await forkSkill(db, {
      trainerId: trainerA,
      organizationId: orgId,
      skillId: brandSkillId,
    });
    const second = await forkSkill(db, {
      trainerId: trainerA,
      organizationId: orgId,
      skillId: brandSkillId,
    });
    expect(second).toBe(first);

    // Dokładnie jeden klon origin u trenera A.
    const clones = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(eq(schema.skills.trainerId, trainerA), eq(schema.skills.originId, brandSkillId)));
    expect(clones.length).toBe(1);

    // Brak duplikatów wariantów (nadal 2) i krawędzi (nadal 1).
    const vars = await db
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .where(eq(schema.skillVariations.skillId, first as string));
    expect(vars.length).toBe(2);
    const edges = await db
      .select({ id: schema.skillPrerequisites.id })
      .from(schema.skillPrerequisites)
      .where(eq(schema.skillPrerequisites.skillId, first as string));
    expect(edges.length).toBe(1);
  });

  it("zwraca null dla umiejętności NIE-markowej (trenerskiej)", async () => {
    const res = await forkSkill(db, {
      trainerId: trainerA,
      organizationId: orgId,
      skillId: ownSkillA, // wiersz trenerski, nie markowy
    });
    expect(res).toBeNull();
    // Nie powstał żaden fork tej umiejętności.
    const clones = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(eq(schema.skills.originId, ownSkillA));
    expect(clones.length).toBe(0);
  });

  it("zwraca null dla markowej umiejętności INNEJ organizacji", async () => {
    const res = await forkSkill(db, {
      trainerId: trainerA,
      organizationId: orgId,
      skillId: otherBrandSkillId, // markowa, ale org != trener.org
    });
    expect(res).toBeNull();
    const clones = await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(eq(schema.skills.originId, otherBrandSkillId));
    expect(clones.length).toBe(0);
  });

  it("RESTRICT: awans wskazujący wariant ORYGINAŁU pozostaje ważny — fork go nie dotyka", async () => {
    // Wariant oryginalnej markowej drabiny (ordinal 2).
    const [origVar] = await db
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .where(
        and(
          eq(schema.skillVariations.skillId, brandSkillId),
          eq(schema.skillVariations.ordinal, 2),
        ),
      )
      .limit(1);
    // Awans podopiecznego wskazujący wariant oryginału (RESTRICT na to_variation_id).
    const [adv] = await db
      .insert(schema.skillAdvancements)
      .values({
        trainerId: trainerA,
        traineeId: traineeA,
        skillId: brandSkillId,
        toVariationId: origVar!.id,
        advancedOn: "2026-06-01",
        advancedBy: trainerA,
      })
      .returning({ id: schema.skillAdvancements.id });

    // Ponowny fork (idempotentny) nie rusza wariantów oryginału → awans nadal ważny.
    await forkSkill(db, { trainerId: trainerA, organizationId: orgId, skillId: brandSkillId });

    const [stillThere] = await db
      .select({ toVariationId: schema.skillAdvancements.toVariationId })
      .from(schema.skillAdvancements)
      .where(eq(schema.skillAdvancements.id, adv!.id))
      .limit(1);
    expect(stillThere!.toVariationId).toBe(origVar!.id);
  });
});

// Sanity: markowy origin ma trainer_id NULL (potwierdza wzorzec własności wykorzystywany przez fork).
describe("kształt markowego origin", () => {
  it("markowa umiejętność ma trainer_id NULL i organization_id ustawione", async () => {
    const [row] = await db
      .select({ trainerId: schema.skills.trainerId, organizationId: schema.skills.organizationId })
      .from(schema.skills)
      .where(and(eq(schema.skills.id, brandSkillId), isNull(schema.skills.trainerId)))
      .limit(1);
    expect(row!.trainerId).toBeNull();
    expect(row!.organizationId).toBe(orgId);
  });
});
