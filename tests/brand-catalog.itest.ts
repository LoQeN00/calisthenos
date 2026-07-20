// Integration test — owner runs under Docker (testcontainers). Do NOT run in the no-Docker loop.
// Uruchamia właściciel pod Dockerem: npm run test:itest

// FILE_SIGNING_SECRET musi być ustawiony PRZED pierwszym importem ~/lib/files,
// bo getEnv() cache'uje wynik przy pierwszym wywołaniu.
process.env.FILE_SIGNING_SECRET = "itest-brand-catalog-secret-32-bytes-xx";
process.env.SESSION_SECRET = "itest-brand-catalog-session-32-bytes-x";
process.env.DATABASE_URL = "postgres://unused:unused@localhost/unused";
process.env.BASE_URL = "http://localhost:3000";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  ensureOrganization,
  ensureRegion,
  ensureBrandAdmin,
  assignUserToOrgRegion,
} from "~/lib/organizations";
import {
  createBrandExercise,
  getBrandExercise,
  archiveBrandExercise,
  createBrandSkill,
  getBrandSkillWithVariations,
  addBrandVariation,
  removeBrandVariation,
  reorderBrandVariations,
  findBrandSkillForExercise,
  addBrandPrerequisite,
  getBrandSkillTree,
  BrandCatalogError,
} from "~/lib/brand-catalog";
import { fileIsBrandDemoInOrg } from "~/lib/catalog";
import { signFileUrl, verifyFileUrl } from "~/lib/files";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Shared ids set in beforeAll.
let orgAId: string;
let orgBId: string;
let presidentId: string; // brand_admin org A
let trainerInOrgA: string; // trainer in org A (member, not author)
let trainerInOrgB: string; // trainer in org B (other tenant)

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // Org A + region + brand_admin (president).
  orgAId = await ensureOrganization(db, "Marka Alpha");
  const regionA = await ensureRegion(db, {
    organizationId: orgAId,
    name: "Polska",
    country: "PL",
    currency: "pln",
    locale: "pl-PL",
  });
  presidentId = await ensureBrandAdmin(db, {
    organizationId: orgAId,
    email: "prezes@alpha.example.com",
    displayName: "Prezes Alpha",
    password: "haslo-prezes-1234",
  });

  // Trainer in org A (member who reads brand content).
  const [tA] = await db
    .insert(schema.users)
    .values({
      email: "trener-a@alpha.example.com",
      displayName: "Trener A",
      role: "trainer",
    })
    .returning({ id: schema.users.id });
  trainerInOrgA = tA!.id;
  await assignUserToOrgRegion(db, trainerInOrgA, orgAId, regionA);

  // Org B (other tenant) + trainer.
  const [otherOrg] = await db
    .insert(schema.organizations)
    .values({ name: "Marka Beta" })
    .returning({ id: schema.organizations.id });
  orgBId = otherOrg!.id;
  const regionB = await ensureRegion(db, {
    organizationId: orgBId,
    name: "Francja",
    country: "FR",
    currency: "eur",
    locale: "fr-FR",
  });
  const [tB] = await db
    .insert(schema.users)
    .values({
      email: "trener-b@beta.example.com",
      displayName: "Trener B",
      role: "trainer",
    })
    .returning({ id: schema.users.id });
  trainerInOrgB = tB!.id;
  await assignUserToOrgRegion(db, trainerInOrgB, orgBId, regionB);
}, 180000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Scenario 1: createBrandExercise + brand-owned files row + signFileUrl round-trip
// ---------------------------------------------------------------------------

describe("Scenario 1 — createBrandExercise + brand-owned file + signFileUrl", () => {
  it("createBrandExercise tworzy wiersz z trainer_id NULL i organization_id = orgA", async () => {
    const exercise = await createBrandExercise(db, orgAId, {
      name: "Pull-up (markowe)",
      unit: "REPS",
      description: "Markowe podciąganie",
      tracksRpe: true,
      tags: ["ciąg", "siła"],
      demoFileId: null,
    });

    expect(exercise.trainerId).toBeNull();
    expect(exercise.organizationId).toBe(orgAId);
    expect(exercise.name).toBe("Pull-up (markowe)");
  });

  it("files row z owner: { organizationId } ma organization_id = orgA, trainer_id NULL " +
    "(CHECK files_owner_check spełniony)", async () => {
    // Wstawiamy wprost (uploadFile wymaga magicznych bajtów + działającego FileStorage);
    // NOTE: ścieżka uploadFile z walidacją magic-bytes jest pokryta w tests/catalog-exercises.itest.ts.
    const [fileRow] = await db
      .insert(schema.files)
      .values({
        organizationId: orgAId,
        trainerId: null,
        uploadedBy: presidentId,
        kind: "exercise_demo",
        mimeType: "video/mp4",
        bytes: 1024,
        storagePath: `exercises/brand-demo-s1-${Date.now()}.mp4`,
      })
      .returning();

    expect(fileRow!.organizationId).toBe(orgAId);
    expect(fileRow!.trainerId).toBeNull();
  });

  it("signFileUrl / verifyFileUrl round-trips dla userId prezesa; zmieniona sygnatura zawodzi", () => {
    const fakeFileId = "00000000-0000-0000-0000-000000000001";
    const url = signFileUrl(fakeFileId, presidentId);

    // Parsujemy parametry z wygenerowanego URL.
    const parsed = new URL(url, "http://localhost");
    const exp = Number(parsed.searchParams.get("exp"));
    const sig = parsed.searchParams.get("sig") as string;

    // Poprawna weryfikacja.
    expect(verifyFileUrl(fakeFileId, exp, sig, presidentId)).toBe(true);

    // Inny userId → fałsz.
    expect(verifyFileUrl(fakeFileId, exp, sig, trainerInOrgA)).toBe(false);

    // Zmieniona sygnatura → fałsz.
    const tampered = `${sig.slice(0, -2)}00`;
    expect(verifyFileUrl(fakeFileId, exp, tampered, presidentId)).toBe(false);

    // Pusta sygnatura → fałsz.
    expect(verifyFileUrl(fakeFileId, exp, "", presidentId)).toBe(false);

    // Wygasły exp → fałsz.
    expect(verifyFileUrl(fakeFileId, 1000, sig, presidentId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: brand demo readable across org via fileIsBrandDemoInOrg
// ---------------------------------------------------------------------------

describe("Scenario 2 — fileIsBrandDemoInOrg: widoczność demo w org", () => {
  let brandExId: string;
  let demoFileId: string;

  beforeAll(async () => {
    // Ćwiczenie markowe org A.
    const ex = await createBrandExercise(db, orgAId, {
      name: "Dip (demo-test)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    brandExId = ex.id;

    // Plik demo (wstawiamy wprost — nie potrzebujemy FileStorage).
    const [f] = await db
      .insert(schema.files)
      .values({
        organizationId: orgAId,
        trainerId: null,
        uploadedBy: presidentId,
        kind: "exercise_demo",
        mimeType: "video/mp4",
        bytes: 512,
        storagePath: `exercises/brand-demo-s2-${Date.now()}.mp4`,
      })
      .returning({ id: schema.files.id });
    demoFileId = f!.id;

    // Powiąż demo z ćwiczeniem.
    await db.update(schema.exercises).set({ demoFileId }).where(eq(schema.exercises.id, brandExId));
  });

  it("demo widoczne dla trenera w tej samej org A", async () => {
    const result = await fileIsBrandDemoInOrg(db, demoFileId, orgAId);
    expect(result).toBe(true);
  });

  it("demo widoczne dla podopiecznego org A (przekazujemy orgId jego trenera)", async () => {
    // Podopieczny dziedziczy org od trenera — symulujemy jak trasa wyznacza efektywną org.
    const [trainerRow] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, trainerInOrgA))
      .limit(1);
    const effectiveOrg = trainerRow!.organizationId!;
    expect(await fileIsBrandDemoInOrg(db, demoFileId, effectiveOrg)).toBe(true);
  });

  it("demo NIE widoczne dla trenera w org B (inna organizacja)", async () => {
    expect(await fileIsBrandDemoInOrg(db, demoFileId, orgBId)).toBe(false);
  });

  it("null org → false (brak zapytania)", async () => {
    expect(await fileIsBrandDemoInOrg(db, demoFileId, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: createBrandSkill + addBrandVariation ordinals + removeBrandVariation + reorder
// ---------------------------------------------------------------------------

describe("Scenario 3 — skill + variations: ordinale, remove, reorder", () => {
  let skillId: string;
  let exA: string;
  let exB: string;
  let exC: string;

  beforeAll(async () => {
    // Trzy markowe ćwiczenia dla tej grupy.
    const a = await createBrandExercise(db, orgAId, {
      name: "Tuck FL",
      unit: "SEC",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    const b = await createBrandExercise(db, orgAId, {
      name: "Advanced Tuck FL",
      unit: "SEC",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    const c = await createBrandExercise(db, orgAId, {
      name: "Full FL",
      unit: "SEC",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    exA = a.id;
    exB = b.id;
    exC = c.id;

    const skill = await createBrandSkill(db, orgAId, "Front Lever", "Markowa drabina FL");
    skillId = skill.id;
  });

  it("createBrandSkill tworzy wiersz z trainer_id NULL i organization_id = orgA", async () => {
    const detail = await getBrandSkillWithVariations(db, orgAId, skillId);
    expect(detail).not.toBeNull();
    expect(detail!.variations).toHaveLength(0);

    const [row] = await db
      .select({ trainerId: schema.skills.trainerId, organizationId: schema.skills.organizationId })
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId))
      .limit(1);
    expect(row!.trainerId).toBeNull();
    expect(row!.organizationId).toBe(orgAId);
  });

  it("addBrandVariation dwukrotnie → ordinale 1, 2", async () => {
    await addBrandVariation(db, orgAId, skillId, exA);
    await addBrandVariation(db, orgAId, skillId, exB);

    const detail = await getBrandSkillWithVariations(db, orgAId, skillId);
    expect(detail!.variations).toHaveLength(2);
    expect(detail!.variations[0]!.ordinal).toBe(1);
    expect(detail!.variations[0]!.exerciseId).toBe(exA);
    expect(detail!.variations[1]!.ordinal).toBe(2);
    expect(detail!.variations[1]!.exerciseId).toBe(exB);
  });

  it("removeBrandVariation usuwa pierwszy wariant i przepakowuje ordinale do 1", async () => {
    const detail = await getBrandSkillWithVariations(db, orgAId, skillId);
    const firstVariationId = detail!.variations[0]!.id; // ordinal 1 (exA)

    await removeBrandVariation(db, orgAId, skillId, firstVariationId);

    const after = await getBrandSkillWithVariations(db, orgAId, skillId);
    expect(after!.variations).toHaveLength(1);
    expect(after!.variations[0]!.ordinal).toBe(1); // przepakowane
    expect(after!.variations[0]!.exerciseId).toBe(exB);
  });

  it("reorderBrandVariations zmienia kolejność", async () => {
    // Dodaj dwa ćwiczenia by mieć czym zamieniać (exB już jest, dodaj exC).
    await addBrandVariation(db, orgAId, skillId, exC);

    const before = await getBrandSkillWithVariations(db, orgAId, skillId);
    expect(before!.variations).toHaveLength(2);
    const idFirst = before!.variations[0]!.id; // exB ordinal 1
    const idSecond = before!.variations[1]!.id; // exC ordinal 2

    // Odwróć kolejność.
    await reorderBrandVariations(db, orgAId, skillId, [idSecond, idFirst]);

    const after = await getBrandSkillWithVariations(db, orgAId, skillId);
    expect(after!.variations[0]!.id).toBe(idSecond);
    expect(after!.variations[0]!.ordinal).toBe(1);
    expect(after!.variations[1]!.id).toBe(idFirst);
    expect(after!.variations[1]!.ordinal).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: addBrandVariation — reguły walidacji
// ---------------------------------------------------------------------------

describe("Scenario 4 — addBrandVariation: reguły walidacji", () => {
  let skillX: string;
  let skillY: string;
  let exFree: string;
  let exArchived: string;

  beforeAll(async () => {
    const a = await createBrandExercise(db, orgAId, {
      name: "Muscle-up (s4)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    exFree = a.id;

    const b = await createBrandExercise(db, orgAId, {
      name: "Archived ex (s4)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    exArchived = b.id;
    await archiveBrandExercise(db, orgAId, exArchived);

    const sX = await createBrandSkill(db, orgAId, "Muscle-up Skill (s4-X)", "");
    skillX = sX.id;
    const sY = await createBrandSkill(db, orgAId, "Muscle-up Skill (s4-Y)", "");
    skillY = sY.id;

    // Przypisz exFree do skillX.
    await addBrandVariation(db, orgAId, skillX, exFree);
  });

  it("addBrandVariation rzuca BrandCatalogError gdy ćwiczenie jest już wariantem INNEJ umiejętności", async () => {
    // exFree jest już wariantem skillX — próba dodania do skillY powinna rzucić.
    await expect(addBrandVariation(db, orgAId, skillY, exFree)).rejects.toThrow(BrandCatalogError);
  });

  it("addBrandVariation rzuca BrandCatalogError gdy ćwiczenie jest zarchiwizowane", async () => {
    await expect(addBrandVariation(db, orgAId, skillX, exArchived)).rejects.toThrow(
      BrandCatalogError,
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: addBrandPrerequisite — wykrywanie cykli i self-loop + getBrandSkillTree
// ---------------------------------------------------------------------------

describe("Scenario 5 — addBrandPrerequisite: cykl, self-loop; getBrandSkillTree", () => {
  let sA: string;
  let sB: string;
  let sC: string;

  beforeAll(async () => {
    const rA = await createBrandSkill(db, orgAId, "Skill A (s5)", "");
    const rB = await createBrandSkill(db, orgAId, "Skill B (s5)", "");
    const rC = await createBrandSkill(db, orgAId, "Skill C (s5)", "");
    sA = rA.id;
    sB = rB.id;
    sC = rC.id;
  });

  it("A wymaga B — poprawna krawędź (brak błędu)", async () => {
    await expect(addBrandPrerequisite(db, orgAId, sA, sB)).resolves.toBeUndefined();
  });

  it("B wymaga A — tworzyłoby cykl → BrandCatalogError(cycle)", async () => {
    const err = await addBrandPrerequisite(db, orgAId, sB, sA).catch((e) => e);
    expect(err).toBeInstanceOf(BrandCatalogError);
    expect((err as BrandCatalogError).message).toContain("cycle");
  });

  it("self-loop (A wymaga A) → BrandCatalogError(self loop)", async () => {
    const err = await addBrandPrerequisite(db, orgAId, sA, sA).catch((e) => e);
    expect(err).toBeInstanceOf(BrandCatalogError);
    expect((err as BrandCatalogError).message).toContain("self loop");
  });

  it("getBrandSkillTree zwraca węzły z computed layer i tylko krawędzie między aktywnymi", async () => {
    // Dodaj B wymaga C (A→B→C: A=warstwa 2, B=warstwa 1, C=warstwa 0).
    await addBrandPrerequisite(db, orgAId, sB, sC);

    const tree = await getBrandSkillTree(db, orgAId);

    // Filtrujemy do naszej trójki (mogą być inne skille z poprzednich scenariuszy).
    const ourNodes = tree.nodes.filter((n) => [sA, sB, sC].includes(n.skillId));
    expect(ourNodes).toHaveLength(3);

    const nodeA = ourNodes.find((n) => n.skillId === sA)!;
    const nodeB = ourNodes.find((n) => n.skillId === sB)!;
    const nodeC = ourNodes.find((n) => n.skillId === sC)!;

    // C jest prererekwizytem B, B jest prererekwizytem A — layer C < layer B < layer A.
    expect(nodeC.layer).toBeLessThan(nodeB.layer);
    expect(nodeB.layer).toBeLessThan(nodeA.layer);

    // Krawędzie dla naszej trójki.
    const ourEdges = tree.edges.filter(
      (e) => [sA, sB, sC].includes(e.from) && [sA, sB, sC].includes(e.requires),
    );
    // Powinniśmy mieć dokładnie dwie krawędzie: A→B i B→C.
    expect(ourEdges).toHaveLength(2);
    const froms = ourEdges.map((e) => e.from);
    expect(froms).toContain(sA);
    expect(froms).toContain(sB);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: izolacja tenanta — org B nie widzi danych org A
// ---------------------------------------------------------------------------

describe("Scenario 6 — izolacja tenanta (org B nie widzi zasobów org A)", () => {
  let exOrgA: string;
  let skillOrgA: string;

  beforeAll(async () => {
    const ex = await createBrandExercise(db, orgAId, {
      name: "Tenant isolation ex (s6)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    exOrgA = ex.id;

    const sk = await createBrandSkill(db, orgAId, "Tenant isolation skill (s6)", "");
    skillOrgA = sk.id;
  });

  it("getBrandExercise z orgB dla ćwiczenia orgA → null", async () => {
    const result = await getBrandExercise(db, orgBId, exOrgA);
    expect(result).toBeNull();
  });

  it("getBrandSkillWithVariations z orgB dla umiejętności orgA → null", async () => {
    const result = await getBrandSkillWithVariations(db, orgBId, skillOrgA);
    expect(result).toBeNull();
  });

  it("archiveBrandExercise z orgB dla ćwiczenia orgA — no-op (wiersz bez zmian)", async () => {
    await archiveBrandExercise(db, orgBId, exOrgA); // nie powinno rzucić, ale też nie zmienić

    const result = await getBrandExercise(db, orgAId, exOrgA);
    expect(result).not.toBeNull();
    expect(result!.exercise.archivedAt).toBeNull(); // nadal aktywne
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: files regression — trainer-owned upload nadal działa poprawnie
// ---------------------------------------------------------------------------

describe("Scenario 7 — files regression: trainer-owned file (trainer_id set, org NULL)", () => {
  it("wstawiamy files row z owner trainerId → trainer_id ustawiony, organization_id NULL " +
    "(CHECK files_owner_check spełniony)", async () => {
    const [fileRow] = await db
      .insert(schema.files)
      .values({
        trainerId: trainerInOrgA,
        organizationId: null,
        uploadedBy: trainerInOrgA,
        kind: "set_video",
        mimeType: "video/mp4",
        bytes: 2048,
        storagePath: `sets/trainer-s7-${Date.now()}.mp4`,
      })
      .returning();

    expect(fileRow!.trainerId).toBe(trainerInOrgA);
    expect(fileRow!.organizationId).toBeNull();
  });

  it("files row z OBOMA trainer_id i organization_id → naruszenie CHECK (rzuca)", async () => {
    await expect(
      db.insert(schema.files).values({
        trainerId: trainerInOrgA,
        organizationId: orgAId,
        uploadedBy: trainerInOrgA,
        kind: "set_video",
        mimeType: "video/mp4",
        bytes: 512,
        storagePath: `sets/bad-both-${Date.now()}.mp4`,
      }),
    ).rejects.toThrow();
  });

  it("files row BEZ właściciela → naruszenie CHECK (rzuca)", async () => {
    await expect(
      db.insert(schema.files).values({
        trainerId: null,
        organizationId: null,
        uploadedBy: trainerInOrgA,
        kind: "set_video",
        mimeType: "video/mp4",
        bytes: 512,
        storagePath: `sets/bad-none-${Date.now()}.mp4`,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: archive-variant guard — findBrandSkillForExercise
// ---------------------------------------------------------------------------

describe("Scenario 8 — findBrandSkillForExercise: guard archiwizacji ćwiczenia wariantu", () => {
  let guardSkill: string;
  let guardExercise: string;

  beforeAll(async () => {
    const ex = await createBrandExercise(db, orgAId, {
      name: "Guard exercise (s8)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    guardExercise = ex.id;

    const sk = await createBrandSkill(db, orgAId, "Guard skill (s8)", "");
    guardSkill = sk.id;

    await addBrandVariation(db, orgAId, guardSkill, guardExercise);
  });

  it("findBrandSkillForExercise zwraca skillId i skillName gdy ćwiczenie jest aktywnym wariantem", async () => {
    const result = await findBrandSkillForExercise(db, orgAId, guardExercise);
    expect(result).not.toBeNull();
    expect(result!.skillId).toBe(guardSkill);
    expect(result!.skillName).toBe("Guard skill (s8)");
  });

  it("findBrandSkillForExercise zwraca null dla ćwiczenia nie będącego wariantem", async () => {
    const other = await createBrandExercise(db, orgAId, {
      name: "Unassigned (s8)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    const result = await findBrandSkillForExercise(db, orgAId, other.id);
    expect(result).toBeNull();
  });

  it("findBrandSkillForExercise zwraca null po archiwizacji umiejętności " +
    "(zarchiwizowany skill nie blokuje archiwizacji ćwiczenia)", async () => {
    // Stwórz oddzielną parę, bo nie chcemy psuć guardSkill dla poprzednich asercji.
    const ex2 = await createBrandExercise(db, orgAId, {
      name: "Ex for archived skill (s8)",
      unit: "REPS",
      description: "",
      tracksRpe: false,
      tags: [],
      demoFileId: null,
    });
    const sk2 = await createBrandSkill(db, orgAId, "Archived skill (s8)", "");
    await addBrandVariation(db, orgAId, sk2.id, ex2.id);

    // Archiwizuj umiejętność (nie ćwiczenie).
    await db
      .update(schema.skills)
      .set({ archivedAt: new Date() })
      .where(and(eq(schema.skills.id, sk2.id), isNull(schema.skills.trainerId)));

    // findBrandSkillForExercise szuka tylko aktywnych umiejętności.
    const result = await findBrandSkillForExercise(db, orgAId, ex2.id);
    expect(result).toBeNull();
  });

  it("findBrandSkillForExercise zwraca null dla ćwiczenia orgA zapytanego z orgB " +
    "(izolacja tenanta w guard)", async () => {
    const result = await findBrandSkillForExercise(db, orgBId, guardExercise);
    expect(result).toBeNull();
  });
});
