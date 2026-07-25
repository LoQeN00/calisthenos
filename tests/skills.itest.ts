// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  SkillError,
  addPrerequisite,
  addVariation,
  archiveSkill,
  createSkill,
  findSkillForExercise,
  getSkillWithVariations,
  listPrerequisitesForSkill,
  removeVariation,
  reorderVariations,
} from "~/lib/skills";
import {
  getSkillMapForTrainee,
  recordAdvancement,
  setStartingLevel,
} from "~/lib/skill-progression";
import { deleteTraineeFully } from "~/lib/trainees";
import { eq } from "drizzle-orm";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns trainee P_A. Trainer B owns trainee P_B — used to prove tenant boundary.
let trainerA = "";
let traineePA = "";
let trainerB = "";
let traineePB = "";

// Exercises seeded under trainer A and trainer B.
let exA1 = ""; // trainer A — will be variation 1
let exA2 = ""; // trainer A — will be variation 2
let exA3 = ""; // trainer A — will be variation 3
let exB1 = ""; // trainer B — for cross-tenant "exercise taken" scenario

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // --- Users ---
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@example.com", displayName: "Trener A", role: "trainer" })
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
  traineePA = pA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@example.com", displayName: "Trener B", role: "trainer" })
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
  traineePB = pB!.id;

  // --- Exercises ---
  const [e1] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exA1 = e1!.id;

  const [e2] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Archer Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exA2 = e2!.id;

  const [e3] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "One-arm Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exA3 = e3!.id;

  const [eB] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerB, name: "Dips", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  exB1 = eB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Tenant-scope: trainer B cannot see or mutate trainer A's skill / trainee
// ---------------------------------------------------------------------------
describe("tenant-scope", () => {
  it("getSkillWithVariations: obcy trener dostaje null (→ 404)", async () => {
    const skillA = await createSkill(db, trainerA, "Podciąganie A", "", "basic");
    const asB = await getSkillWithVariations(db, trainerB, skillA.id);
    expect(asB).toBeNull();
  });

  it("setStartingLevel: obcy trener rzuca SkillError dla umiejętności nie-swojej", async () => {
    const skillA = await createSkill(db, trainerA, "Podciąganie tenant-setStart", "", "basic");
    // Świeże ćwiczenie — exA1/exA2 są zarezerwowane dla lifecycle-testu (UNIQUE(exercise_id)).
    const [exTen1] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Tenant ex setStart", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    await addVariation(db, trainerA, skillA.id, exTen1!.id);
    const detail = await getSkillWithVariations(db, trainerA, skillA.id);
    const varId = detail!.variations[0]!.id;
    await expect(
      setStartingLevel(db, trainerB, traineePA, skillA.id, varId, "2026-06-01", null),
    ).rejects.toThrow(SkillError);
  });

  it("recordAdvancement: obcy trener rzuca SkillError dla podopiecznego nie-swojego", async () => {
    const skillA = await createSkill(db, trainerA, "Podciąganie tenant-record", "", "basic");
    // Świeże ćwiczenie — exA1/exA2 są zarezerwowane dla lifecycle-testu (UNIQUE(exercise_id)).
    const [exTen2] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Tenant ex record", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    await addVariation(db, trainerA, skillA.id, exTen2!.id);
    const detail = await getSkillWithVariations(db, trainerA, skillA.id);
    const varId = detail!.variations[0]!.id;
    // Trener B próbuje zapisać awans trenera A (zarówno umiejętność, jak i podopieczny to tenant A)
    await expect(
      recordAdvancement(db, trainerB, traineePA, skillA.id, varId, "2026-06-01", null),
    ).rejects.toThrow(SkillError);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: createSkill → addVariation ×3 → reorderVariations →
//   setStartingLevel → recordAdvancement (awans) → recordAdvancement (regres)
//   → getSkillMapForTrainee (poprawny currentVariationId + historia)
// ---------------------------------------------------------------------------
describe("full lifecycle", () => {
  let skillId = "";
  let varId1 = "";
  let varId2 = "";
  let varId3 = "";

  it("createSkill tworzy umiejętność", async () => {
    const skill = await createSkill(db, trainerA, "Drabina podciągania", "Opis drabiny", "basic");
    expect(skill.id).toBeTruthy();
    expect(skill.name).toBe("Drabina podciągania");
    skillId = skill.id;
  });

  it("addVariation ×3 dodaje trzy warianty w kolejności", async () => {
    await addVariation(db, trainerA, skillId, exA1);
    await addVariation(db, trainerA, skillId, exA2);
    await addVariation(db, trainerA, skillId, exA3);
    const detail = await getSkillWithVariations(db, trainerA, skillId);
    expect(detail).not.toBeNull();
    expect(detail!.variations).toHaveLength(3);
    // Warianty są posortowane po ordinal (rosnąco)
    const ordinals = detail!.variations.map((v) => v.ordinal);
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    varId1 = detail!.variations[0]!.id;
    varId2 = detail!.variations[1]!.id;
    varId3 = detail!.variations[2]!.id;
  });

  it("reorderVariations: nowa kolejność persystuje", async () => {
    // Odwróć kolejność: [3, 2, 1]
    await reorderVariations(db, trainerA, skillId, [varId3, varId2, varId1]);
    const detail = await getSkillWithVariations(db, trainerA, skillId);
    const ids = detail!.variations.map((v) => v.id);
    // Posortowane po rosnącym ordinal — nowy order: varId3 ma ordinal 1 (najniższy)
    expect(ids[0]).toBe(varId3);
    expect(ids[1]).toBe(varId2);
    expect(ids[2]).toBe(varId1);

    // Przywróć oryginalną kolejność do dalszych testów: [1, 2, 3]
    await reorderVariations(db, trainerA, skillId, [varId1, varId2, varId3]);
  });

  it("setStartingLevel: ustawia poziom startowy (from = null)", async () => {
    await setStartingLevel(db, trainerA, traineePA, skillId, varId1, "2026-01-01", null);
    const map = await getSkillMapForTrainee(db, trainerA, traineePA);
    const entry = map.find((e) => e.skillId === skillId)!;
    expect(entry.currentVariationId).toBe(varId1);
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0]!.fromVariationId).toBeNull();
    expect(entry.history[0]!.toVariationId).toBe(varId1);
  });

  it("recordAdvancement: awans na wyższy wariant", async () => {
    await recordAdvancement(
      db,
      trainerA,
      traineePA,
      skillId,
      varId2,
      "2026-02-01",
      "Gotowy na awans",
    );
    const map = await getSkillMapForTrainee(db, trainerA, traineePA);
    const entry = map.find((e) => e.skillId === skillId)!;
    expect(entry.currentVariationId).toBe(varId2);
    expect(entry.history).toHaveLength(2);
  });

  it("recordAdvancement: regres na niższy ordinal — currentVariationId = najnowsze zdarzenie", async () => {
    await recordAdvancement(db, trainerA, traineePA, skillId, varId1, "2026-03-01", "Zbyt trudne");
    const map = await getSkillMapForTrainee(db, trainerA, traineePA);
    const entry = map.find((e) => e.skillId === skillId)!;
    // Najnowsze zdarzenie (2026-03-01) wskazuje varId1 — to jest currentVariationId
    expect(entry.currentVariationId).toBe(varId1);
    expect(entry.history).toHaveLength(3);
  });

  it("getSkillMapForTrainee: pełna historia ma poprawne from/to", async () => {
    const map = await getSkillMapForTrainee(db, trainerA, traineePA);
    const entry = map.find((e) => e.skillId === skillId)!;
    // Historia jest posortowana malejąco (najnowsze pierwsze) przez skill-progression.ts
    expect(entry.history[0]!.toVariationId).toBe(varId1); // regres (2026-03-01)
    expect(entry.history[1]!.toVariationId).toBe(varId2); // awans (2026-02-01)
    expect(entry.history[2]!.toVariationId).toBe(varId1); // start (2026-01-01)
    expect(entry.history[2]!.fromVariationId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UNIQUE(exercise_id): ten sam exercise_id nie może być wariantem drugiej umiejętności
// ---------------------------------------------------------------------------
describe("UNIQUE(exercise_id) constraint", () => {
  it("addVariation: rzuca SkillError('exercise taken') gdy ćwiczenie już jest wariantem innej umiejętności", async () => {
    // exA1 jest już wariantem z lifecycle-testu powyżej; tworzymy nową umiejętność
    const skill2 = await createSkill(db, trainerA, "Druga drabina", "", "basic");
    await expect(addVariation(db, trainerA, skill2.id, exA1)).rejects.toThrow(SkillError);

    // Weryfikujemy dokładny klucz błędu
    await expect(addVariation(db, trainerA, skill2.id, exA1)).rejects.toMatchObject({
      message: "exercise taken",
    });
  });
});

// ---------------------------------------------------------------------------
// ON DELETE RESTRICT: removeVariation z użytym wariantem rzuca SkillError
// ---------------------------------------------------------------------------
describe("ON DELETE RESTRICT on skill_advancements", () => {
  it("removeVariation: rzuca SkillError('referenced') gdy wariant ma awans", async () => {
    // Tworzymy oddzielną umiejętność z nowym ćwiczeniem (exA3 wolne bo użyte w lifecycle z oryginalną kolejnością,
    // ale exA3 NIE zostało wcześniej usunięte — sprawdzamy, czy jest w innej umiejętności)
    // Tworzymy świeże ćwiczenie specjalnie na ten test
    const [freshEx] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Muscle-up", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    const freshExId = freshEx!.id;

    const skill = await createSkill(db, trainerA, "Restrict-test skill", "", "basic");
    await addVariation(db, trainerA, skill.id, freshExId);
    const detail = await getSkillWithVariations(db, trainerA, skill.id);
    const varId = detail!.variations[0]!.id;

    // Ustaw poziom startowy → referencja w skill_advancements
    await setStartingLevel(db, trainerA, traineePA, skill.id, varId, "2026-04-01", null);

    // Próba usunięcia wariantu powinna rzucić SkillError("referenced")
    await expect(removeVariation(db, trainerA, skill.id, varId)).rejects.toThrow(SkillError);

    await expect(removeVariation(db, trainerA, skill.id, varId)).rejects.toMatchObject({
      message: "referenced",
    });
  });
});

// ---------------------------------------------------------------------------
// recordAdvancement guards: "no start" i "same level"
// ---------------------------------------------------------------------------
describe("recordAdvancement guards", () => {
  let guardSkillId = "";
  let guardVarId1 = "";
  let guardVarId2 = "";

  beforeAll(async () => {
    const [freshEx1] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Ring Row", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    const [freshEx2] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Australian Pull-up", unit: "REPS" })
      .returning({ id: schema.exercises.id });

    const skill = await createSkill(db, trainerA, "Guard-test skill", "", "basic");
    guardSkillId = skill.id;
    await addVariation(db, trainerA, guardSkillId, freshEx1!.id);
    await addVariation(db, trainerA, guardSkillId, freshEx2!.id);
    const detail = await getSkillWithVariations(db, trainerA, guardSkillId);
    guardVarId1 = detail!.variations[0]!.id;
    guardVarId2 = detail!.variations[1]!.id;
  });

  it("rzuca SkillError('no start') gdy brak poziomu startowego", async () => {
    await expect(
      recordAdvancement(db, trainerA, traineePA, guardSkillId, guardVarId2, "2026-05-01", null),
    ).rejects.toMatchObject({ message: "no start" });
  });

  it("rzuca SkillError('same level') gdy to == current", async () => {
    await setStartingLevel(db, trainerA, traineePA, guardSkillId, guardVarId1, "2026-05-01", null);
    await expect(
      recordAdvancement(db, trainerA, traineePA, guardSkillId, guardVarId1, "2026-05-02", null),
    ).rejects.toMatchObject({ message: "same level" });
  });
});

// ---------------------------------------------------------------------------
// Regresje z audytu usuwania (2026-06-01)
// ---------------------------------------------------------------------------
describe("audyt usuwania: archiwizacja i warianty", () => {
  it("addVariation: odrzuca zarchiwizowane ćwiczenie (SkillError 'archived')", async () => {
    const [arch] = await db
      .insert(schema.exercises)
      .values({
        trainerId: trainerA,
        name: "Archived ex",
        unit: "REPS",
        archivedAt: new Date(),
      })
      .returning({ id: schema.exercises.id });
    const skill = await createSkill(db, trainerA, "Skill z archiwum", "", "basic");
    await expect(addVariation(db, trainerA, skill.id, arch!.id)).rejects.toMatchObject({
      message: "archived",
    });
  });

  it("removeVariation: przepakowuje ordinale pozostałych do 1..n (bez dziur)", async () => {
    const mk = async (name: string) => {
      const [e] = await db
        .insert(schema.exercises)
        .values({ trainerId: trainerA, name, unit: "REPS" })
        .returning({ id: schema.exercises.id });
      return e!.id;
    };
    const skill = await createSkill(db, trainerA, "Repack skill", "", "basic");
    await addVariation(db, trainerA, skill.id, await mk("Repack ex 1"));
    await addVariation(db, trainerA, skill.id, await mk("Repack ex 2"));
    await addVariation(db, trainerA, skill.id, await mk("Repack ex 3"));
    const before = await getSkillWithVariations(db, trainerA, skill.id);
    const middleId = before!.variations[1]!.id; // ordinal 2

    await removeVariation(db, trainerA, skill.id, middleId);

    const after = await getSkillWithVariations(db, trainerA, skill.id);
    expect(after!.variations.map((v) => v.ordinal)).toEqual([1, 2]);
  });

  it("findSkillForExercise: zwraca aktywną umiejętność wariantu; null poza nią i po archiwizacji", async () => {
    const [ex] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "FindSkill ex", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    const [loose] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "FindSkill loose ex", unit: "REPS" })
      .returning({ id: schema.exercises.id });

    const skill = await createSkill(db, trainerA, "FindSkill skill", "", "basic");
    await addVariation(db, trainerA, skill.id, ex!.id);

    expect(await findSkillForExercise(db, trainerA, ex!.id)).toMatchObject({ skillId: skill.id });
    expect(await findSkillForExercise(db, trainerA, loose!.id)).toBeNull();

    await archiveSkill(db, trainerA, skill.id);
    expect(await findSkillForExercise(db, trainerA, ex!.id)).toBeNull();
  });
});

describe("audyt usuwania: archiveSkill czyści prereki i zwalnia nazwę", () => {
  it("archiveSkill: usuwa krawędzie prerekwizytów (jako zależna i jako prerek)", async () => {
    const base = await createSkill(db, trainerA, "Prereq base", "", "basic");
    const dep = await createSkill(db, trainerA, "Prereq dependent", "", "basic");
    const dep2 = await createSkill(db, trainerA, "Prereq dependent 2", "", "basic");
    // dep wymaga base; dep2 wymaga base → base jest prerekiem dwóch.
    await addPrerequisite(db, trainerA, dep.id, base.id);
    await addPrerequisite(db, trainerA, dep2.id, base.id);
    expect(await listPrerequisitesForSkill(db, trainerA, dep.id)).toHaveLength(1);

    await archiveSkill(db, trainerA, base.id);

    // Krawędzie dotykające zarchiwizowanej `base` znikają z obu zależnych.
    expect(await listPrerequisitesForSkill(db, trainerA, dep.id)).toHaveLength(0);
    expect(await listPrerequisitesForSkill(db, trainerA, dep2.id)).toHaveLength(0);
  });

  it("createSkill: nazwa zarchiwizowanej umiejętności jest znów wolna (partial unique)", async () => {
    const s = await createSkill(db, trainerA, "Nazwa do recyklingu", "", "basic");
    await archiveSkill(db, trainerA, s.id);
    // Ta sama nazwa po archiwizacji — nie powinno rzucić 'duplicate'.
    const again = await createSkill(db, trainerA, "Nazwa do recyklingu", "", "basic");
    expect(again.id).toBeTruthy();
    expect(again.id).not.toBe(s.id);
  });
});

describe("audyt usuwania: deleteTraineeFully z historią awansów", () => {
  it("usuwa podopiecznego z awansem bez błędu FK; awanse znikają (kaskada po trainee_id)", async () => {
    // Świeży trener + podopieczny, by nie naruszyć współdzielonego stanu harnessu.
    const [tc] = await db
      .insert(schema.users)
      .values({ email: "trenerc@example.com", displayName: "Trener C", role: "trainer" })
      .returning({ id: schema.users.id });
    const [pc] = await db
      .insert(schema.users)
      .values({
        email: "podoc@example.com",
        displayName: "Podo C",
        role: "trainee",
        trainerId: tc!.id,
      })
      .returning({ id: schema.users.id });
    const [ex] = await db
      .insert(schema.exercises)
      .values({ trainerId: tc!.id, name: "Trainee-del ex", unit: "REPS" })
      .returning({ id: schema.exercises.id });

    const skill = await createSkill(db, tc!.id, "Trainee-del skill", "", "basic");
    await addVariation(db, tc!.id, skill.id, ex!.id);
    const detail = await getSkillWithVariations(db, tc!.id, skill.id);
    await setStartingLevel(
      db,
      tc!.id,
      pc!.id,
      skill.id,
      detail!.variations[0]!.id,
      "2026-01-01",
      null,
    );

    // Usunięcie podopiecznego z istniejącym skill_advancement NIE może rzucić błędu FK.
    const res = await deleteTraineeFully(db, tc!.id, pc!.id);
    expect(res.displayName).toBe("Podo C");

    const advLeft = await db
      .select({ id: schema.skillAdvancements.id })
      .from(schema.skillAdvancements)
      .where(eq(schema.skillAdvancements.traineeId, pc!.id));
    expect(advLeft).toHaveLength(0);

    const userLeft = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, pc!.id));
    expect(userLeft).toHaveLength(0);
  });
});
