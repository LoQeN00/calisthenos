// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  findTraineeOfTrainer,
  getExerciseProgression,
  listProgressionExercises,
} from "~/lib/progression";
import { excludeByExerciseId } from "~/lib/progression-math";
import { getSkillMapForTrainee, setStartingLevel } from "~/lib/skill-progression";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import {
  addVariation,
  createSkill,
  getSkillWithVariations,
  listExerciseSkillMap,
} from "~/lib/skills";

// -- redirect loader shims (tested by calling loaders directly; no auth needed) --
import type { LoaderFunctionArgs } from "react-router";
import { loader as progresjaIndexLoader } from "~/routes/podopieczny/progresja._index";
import { loader as progresjaExerciseLoader } from "~/routes/podopieczny/progresja.$exerciseId";
import { loader as progresjaPorownanieLoader } from "~/routes/podopieczny/progresja.porownanie";
import { loader as umiejetnosciLoader } from "~/routes/podopieczny/umiejetnosci";
import { loader as umiejetnosciSkillLoader } from "~/routes/podopieczny/umiejetnosci.$skillId";
import { loader as trenerProgresjaIndexLoader } from "~/routes/trener/podopieczni.$traineeId.progresja._index";
import { loader as trenerProgresjaExerciseLoader } from "~/routes/trener/podopieczni.$traineeId.progresja.$exerciseId";
import { loader as trenerProgresjaPorownanieLoader } from "~/routes/trener/podopieczni.$traineeId.progresja.porownanie";
import { loader as trenerUmiejetnosciLoader } from "~/routes/trener/podopieczni.$traineeId.umiejetnosci";
import { loader as trenerUmiejetnosciSkillLoader } from "~/routes/trener/podopieczni.$traineeId.umiejetnosci.$skillId";

// -- read-only trainee: verify no `action` export from the podopieczny node detail route --
import * as PodopiecznyRozwojWezelModule from "~/routes/podopieczny/rozwoj.umiejetnosc.$skillId";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A owns trainee P_A. Trainer B owns trainee P_B — used to prove tenant boundary.
let trainerA = "";
let traineePA = "";
let trainerB = "";
let traineePB = "";

// Exercises seeded under trainer A.
let pullupId = ""; // will get workout logs → appears in lista Pozostałe initially
let dipsId = ""; // second exercise with logs
let skillExId = ""; // exercise that becomes a skill variation → disappears from lista Pozostałe

// Skill + variation for the "node detail" tests.
let skillId = "";
let variationIdWithLogs = ""; // variation whose exercise has logs
let variationIdNoLogs = ""; // variation whose exercise has no logs

/** Create a plan + one plan session for a trainee (workout logs require both). */
async function seedPlan(
  trainerId: string,
  traineeId: string,
  version: number,
): Promise<{ planId: string; planSessionId: string }> {
  const [plan] = await db
    .insert(schema.plans)
    .values({
      trainerId,
      traineeId,
      name: "Plan",
      version,
      status: "active",
    })
    .returning({ id: schema.plans.id });
  const [planSession] = await db
    .insert(schema.planSessions)
    .values({ planId: plan!.id, ordinal: 0, name: "Sesja A" })
    .returning({ id: schema.planSessions.id });
  return { planId: plan!.id, planSessionId: planSession!.id };
}

/** Seed one workout session for a trainee on a fixed date with a single exercise + sets. */
async function seedSession(opts: {
  trainerId: string;
  traineeId: string;
  planId: string;
  planSessionId: string;
  exerciseId: string;
  performedOn: string;
  reps: number[];
}): Promise<void> {
  const [log] = await db
    .insert(schema.workoutLogs)
    .values({
      trainerId: opts.trainerId,
      traineeId: opts.traineeId,
      planId: opts.planId,
      planSessionId: opts.planSessionId,
      sessionName: "Sesja",
      performedOn: opts.performedOn,
    })
    .returning({ id: schema.workoutLogs.id });
  const [exLog] = await db
    .insert(schema.workoutExerciseLogs)
    .values({ workoutLogId: log!.id, ordinal: 0, exerciseId: opts.exerciseId })
    .returning({ id: schema.workoutExerciseLogs.id });
  await db.insert(schema.workoutSetLogs).values(
    opts.reps.map((reps, i) => ({
      workoutExerciseLogId: exLog!.id,
      ordinal: i,
      reps,
      difficulty: 6,
    })),
  );
}

/** Build a minimal LoaderFunctionArgs (no auth — redirect loaders don't need it). */
function makeArgs(url: string, params: Record<string, string> = {}): LoaderFunctionArgs {
  return {
    request: new Request(url),
    params,
    context: {},
  } as unknown as LoaderFunctionArgs;
}

/** Extract `Location` header from a redirect Response returned by a loader. */
function locationOf(response: Response): string {
  return response.headers.get("Location") ?? "";
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  // --- Users ---
  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@rozwoj.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [pA] = await db
    .insert(schema.users)
    .values({
      email: "podoa@rozwoj.example.com",
      displayName: "Podo A",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineePA = pA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@rozwoj.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pB] = await db
    .insert(schema.users)
    .values({
      email: "podob@rozwoj.example.com",
      displayName: "Podo B",
      role: "trainee",
      trainerId: trainerB,
    })
    .returning({ id: schema.users.id });
  traineePB = pB!.id;

  // --- Exercises ---
  const [pullup] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  pullupId = pullup!.id;

  const [dips] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Dips", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  dipsId = dips!.id;

  // This exercise will eventually become a skill variation → should leave lista Pozostałe.
  const [skillEx] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Archer Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  skillExId = skillEx!.id;

  // Exercise for variation-with-logs scenario (node detail chart).
  const [exWithLogs] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Front Lever Tuck", unit: "SEC" })
    .returning({ id: schema.exercises.id });

  // Exercise for variation-without-logs scenario.
  const [exNoLogs] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Front Lever Full", unit: "SEC" })
    .returning({ id: schema.exercises.id });

  // --- Plans ---
  const planPA = await seedPlan(trainerA, traineePA, 1);

  // --- Workout logs: Pull-up, Dips, skillEx (Archer Pull-up), exWithLogs ---
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: "2026-01-05",
    reps: [5, 5, 4],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: pullupId,
    performedOn: "2026-01-12",
    reps: [7, 6, 6],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: dipsId,
    performedOn: "2026-01-05",
    reps: [8, 8],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: skillExId,
    performedOn: "2026-01-10",
    reps: [3, 3],
  });
  await seedSession({
    trainerId: trainerA,
    traineeId: traineePA,
    planId: planPA.planId,
    planSessionId: planPA.planSessionId,
    exerciseId: exWithLogs!.id,
    performedOn: "2026-01-08",
    reps: [15, 20],
  });

  // --- Skill for node detail tests ---
  const skill = await createSkill(db, trainerA, "Front Lever", "");
  skillId = skill.id;

  // Add two variations: exWithLogs (ordinal 1) and exNoLogs (ordinal 2).
  await addVariation(db, trainerA, skillId, exWithLogs!.id);
  await addVariation(db, trainerA, skillId, exNoLogs!.id);

  const skillDetail = await getSkillWithVariations(db, trainerA, skillId);
  // variations are ordered by ordinal ascending.
  variationIdWithLogs = skillDetail!.variations[0]!.id; // ordinal 1 — has logs (exWithLogs)
  variationIdNoLogs = skillDetail!.variations[1]!.id; // ordinal 2 — no logs (exNoLogs)
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// ---------------------------------------------------------------------------
// Tenant-scope: trainer A cannot access trainer B's trainee
// ---------------------------------------------------------------------------
describe("tenant-scope: trener A → 404 na podopiecznym trenera B", () => {
  it("findTraineeOfTrainer: trener A nie widzi podopiecznego trenera B (→ null)", async () => {
    const result = await findTraineeOfTrainer(db, trainerA, traineePB);
    expect(result).toBeNull();
  });

  it("findTraineeOfTrainer: trener B nie widzi podopiecznego trenera A (→ null)", async () => {
    const result = await findTraineeOfTrainer(db, trainerB, traineePA);
    expect(result).toBeNull();
  });

  it("findTraineeOfTrainer: właściwy trener widzi swojego podopiecznego", async () => {
    const result = await findTraineeOfTrainer(db, trainerA, traineePA);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(traineePA);
  });

  it("getSkillTreeForTrainee: trener B nie widzi umiejętności trenera A dla podopiecznego trenera A", async () => {
    // The guard `findTraineeOfTrainer` returning null is sufficient for HTTP-layer 404.
    // Additionally verify that getSkillTreeForTrainee is scoped to trainerId:
    // trainer A created skillId above — trainer B's tree should not include it.
    const treeBForPA = await getSkillTreeForTrainee(db, trainerB, traineePA);
    const nodeIds = treeBForPA.nodes.map((n) => n.skillId);
    expect(nodeIds).not.toContain(skillId);
  });

  it("listProgressionExercises: cudze dane nie wyciekają do innego podopiecznego", async () => {
    // Trainer B's trainee P_B has no logs → lista pusta, nie widać logów P_A.
    const rowsB = await listProgressionExercises(db, traineePB);
    const idsB = rowsB.map((r) => r.exerciseId);
    expect(idsB).not.toContain(pullupId);
    expect(idsB).not.toContain(dipsId);
  });
});

// ---------------------------------------------------------------------------
// Redirects (301): podopieczny — stare URL-e → /podopieczny/rozwoj/*
// ---------------------------------------------------------------------------
describe("redirecty podopieczny: stare trasy → nowe /rozwoj/*", () => {
  it("/podopieczny/progresja → /podopieczny/rozwoj (301)", async () => {
    // progresjaIndexLoader takes no args (loader() → redirect) — cast to suppress TS.
    const resp = await (progresjaIndexLoader as () => Promise<Response>)();
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe("/podopieczny/rozwoj");
  });

  it("/podopieczny/progresja/:id?zakres=6m → /podopieczny/rozwoj/cwiczenie/:id?zakres=6m", async () => {
    const fakeId = "ex-abc-123";
    const resp = await (progresjaExerciseLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs(`http://localhost/podopieczny/progresja/${fakeId}?zakres=6m`, {
        exerciseId: fakeId,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/podopieczny/rozwoj/cwiczenie/${fakeId}?zakres=6m`);
  });

  it("/podopieczny/progresja/porownanie?ex=a,b → /podopieczny/rozwoj/porownanie?ex=a,b", async () => {
    const resp = await (progresjaPorownanieLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs("http://localhost/podopieczny/progresja/porownanie?ex=a,b"),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe("/podopieczny/rozwoj/porownanie?ex=a,b");
  });

  it("/podopieczny/umiejetnosci → /podopieczny/rozwoj (301)", async () => {
    // umiejetnosciLoader takes no args (loader() → redirect) — cast to suppress TS.
    const resp = await (umiejetnosciLoader as () => Promise<Response>)();
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe("/podopieczny/rozwoj");
  });

  it("/podopieczny/umiejetnosci/:skillId → /podopieczny/rozwoj/umiejetnosc/:skillId", async () => {
    const fakeSkillId = "skill-xyz-999";
    const resp = await (umiejetnosciSkillLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs(`http://localhost/podopieczny/umiejetnosci/${fakeSkillId}`, {
        skillId: fakeSkillId,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/podopieczny/rozwoj/umiejetnosc/${fakeSkillId}`);
  });
});

// ---------------------------------------------------------------------------
// Redirects (301): trener — stare URL-e → …/rozwoj/*
// ---------------------------------------------------------------------------
describe("redirecty trener: stare trasy → nowe …/rozwoj/*", () => {
  const fakeTid = "trainer-tid-abc";
  const fakeExId = "ex-def-456";
  const fakeSkId = "skill-def-789";

  it("/trener/podopieczni/:tid/progresja → …/rozwoj", async () => {
    const resp = await (trenerProgresjaIndexLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs(`http://localhost/trener/podopieczni/${fakeTid}/progresja`, {
        traineeId: fakeTid,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/trener/podopieczni/${fakeTid}/rozwoj`);
  });

  it("/trener/podopieczni/:tid/progresja/:exId?zakres=6m → …/rozwoj/cwiczenie/:exId?zakres=6m", async () => {
    const resp = await (
      trenerProgresjaExerciseLoader as (a: LoaderFunctionArgs) => Promise<Response>
    )(
      makeArgs(`http://localhost/trener/podopieczni/${fakeTid}/progresja/${fakeExId}?zakres=6m`, {
        traineeId: fakeTid,
        exerciseId: fakeExId,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(
      `/trener/podopieczni/${fakeTid}/rozwoj/cwiczenie/${fakeExId}?zakres=6m`,
    );
  });

  it("/trener/podopieczni/:tid/progresja/porownanie?ex=a,b → …/rozwoj/porownanie?ex=a,b", async () => {
    const resp = await (
      trenerProgresjaPorownanieLoader as (a: LoaderFunctionArgs) => Promise<Response>
    )(
      makeArgs(`http://localhost/trener/podopieczni/${fakeTid}/progresja/porownanie?ex=a,b`, {
        traineeId: fakeTid,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/trener/podopieczni/${fakeTid}/rozwoj/porownanie?ex=a,b`);
  });

  it("/trener/podopieczni/:tid/umiejetnosci → …/rozwoj", async () => {
    const resp = await (trenerUmiejetnosciLoader as (a: LoaderFunctionArgs) => Promise<Response>)(
      makeArgs(`http://localhost/trener/podopieczni/${fakeTid}/umiejetnosci`, {
        traineeId: fakeTid,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/trener/podopieczni/${fakeTid}/rozwoj`);
  });

  it("/trener/podopieczni/:tid/umiejetnosci/:skillId → …/rozwoj/umiejetnosc/:skillId", async () => {
    const resp = await (
      trenerUmiejetnosciSkillLoader as (a: LoaderFunctionArgs) => Promise<Response>
    )(
      makeArgs(`http://localhost/trener/podopieczni/${fakeTid}/umiejetnosci/${fakeSkId}`, {
        traineeId: fakeTid,
        skillId: fakeSkId,
      }),
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(301);
    expect(locationOf(resp)).toBe(`/trener/podopieczni/${fakeTid}/rozwoj/umiejetnosc/${fakeSkId}`);
  });
});

// ---------------------------------------------------------------------------
// Read-only podopieczny: brak `action` na /podopieczny/rozwoj/umiejetnosc/:skillId
// ---------------------------------------------------------------------------
describe("read-only podopieczny: brak action na węźle umiejętności", () => {
  it("moduł nie eksportuje action (POST → 404/405 w RR7)", () => {
    // React Router v7 returns 405 when no action is exported and a POST arrives.
    // Verify at the module level that there is no action export.
    expect((PodopiecznyRozwojWezelModule as Record<string, unknown>).action).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Lista „Pozostałe": excludeByExerciseId odfiltrowuje warianty umiejętności
// ---------------------------------------------------------------------------
describe("lista Pozostałe: warianty umiejętności nie trafiają na listę", () => {
  it("przed dodaniem wariantu: wszystkie ćwiczenia z logami widoczne w liście", async () => {
    const allRows = await listProgressionExercises(db, traineePA);
    const skillMap = await listExerciseSkillMap(db, trainerA);
    const variantIds = new Set(skillMap.map((s) => s.exerciseId));
    // skillExId is NOT a variation yet (only Front Lever variants were added in setup).
    // Pull-up, Dips, Archer Pull-up, Front Lever Tuck should all be in allRows.
    const idsInAll = allRows.map((r) => r.exerciseId);
    expect(idsInAll).toContain(pullupId);
    expect(idsInAll).toContain(dipsId);
    expect(idsInAll).toContain(skillExId);

    const filteredRows = excludeByExerciseId(allRows, variantIds);
    const filteredIds = filteredRows.map((r) => r.exerciseId);
    // Pull-up and Dips are not skill variants → stay in list.
    expect(filteredIds).toContain(pullupId);
    expect(filteredIds).toContain(dipsId);
    // Archer Pull-up is not a variant yet → stays.
    expect(filteredIds).toContain(skillExId);
  });

  it("po dodaniu ćwiczenia jako wariantu: znika z listy, pojawia się jako węzeł w drzewie", async () => {
    // Create a new skill and add skillExId (Archer Pull-up) as its variation.
    const newSkill = await createSkill(db, trainerA, "Archer Pull-up Skill", "");
    await addVariation(db, trainerA, newSkill.id, skillExId);

    const allRows = await listProgressionExercises(db, traineePA);
    const skillMap = await listExerciseSkillMap(db, trainerA);
    const variantIds = new Set(skillMap.map((s) => s.exerciseId));

    // skillExId should now be in variantIds.
    expect(variantIds.has(skillExId)).toBe(true);

    const filteredRows = excludeByExerciseId(allRows, variantIds);
    const filteredIds = filteredRows.map((r) => r.exerciseId);

    // Archer Pull-up is now a variant → should NOT appear in lista Pozostałe.
    expect(filteredIds).not.toContain(skillExId);

    // Pull-up and Dips are still non-variants → still present.
    expect(filteredIds).toContain(pullupId);
    expect(filteredIds).toContain(dipsId);

    // The new skill should appear as a node in the skill tree for the trainee.
    const tree = await getSkillTreeForTrainee(db, trainerA, traineePA);
    const treeNodeIds = tree.nodes.map((n) => n.skillId);
    expect(treeNodeIds).toContain(newSkill.id);
  });
});

// ---------------------------------------------------------------------------
// Szczegół węzła z wykresem: view != null gdy wariant z logami, view == null gdy bez
// ---------------------------------------------------------------------------
describe("szczegół węzła: view z wykresem zależy od logów bieżącego wariantu", () => {
  it("bez przypisanego poziomu: getSkillMapForTrainee zwraca entry z currentVariationId = null → view = null", async () => {
    const map = await getSkillMapForTrainee(db, trainerA, traineePA, {
      withSuggestions: false,
    });
    const entry = map.find((m) => m.skillId === skillId);
    expect(entry).toBeDefined();
    // No level set yet → currentVariationId should be null.
    expect(entry!.currentVariationId).toBeNull();
    // The loader condition: view = entry.currentHasLogs && entry.currentExerciseId ? ... : null
    // With no current variation → view = null.
    expect(entry!.currentHasLogs).toBe(false);
    expect(entry!.currentExerciseId).toBeNull();
  });

  it("z przypisanym wariantem BEZ logów: currentHasLogs = false → view = null", async () => {
    // Set the trainee to variationIdNoLogs (Front Lever Full — no workout logs).
    await setStartingLevel(db, trainerA, traineePA, skillId, variationIdNoLogs, "2026-06-01", null);

    const map = await getSkillMapForTrainee(db, trainerA, traineePA, {
      withSuggestions: false,
    });
    const entry = map.find((m) => m.skillId === skillId);
    expect(entry).toBeDefined();
    expect(entry!.currentVariationId).toBe(variationIdNoLogs);
    // The exercise has no logs → currentHasLogs should be false.
    expect(entry!.currentHasLogs).toBe(false);

    // Simulate what the loader does: view = null when no logs.
    const view =
      entry!.currentHasLogs && entry!.currentExerciseId
        ? await getExerciseProgression(db, traineePA, entry!.currentExerciseId, "all")
        : null;
    expect(view).toBeNull();
  });

  it("z przypisanym wariantem Z logami: currentHasLogs = true → view != null z danymi", async () => {
    // Change the trainee to variationIdWithLogs (Front Lever Tuck — has workout logs).
    await setStartingLevel(
      db,
      trainerA,
      traineePA,
      skillId,
      variationIdWithLogs,
      "2026-06-02",
      null,
    );

    const map = await getSkillMapForTrainee(db, trainerA, traineePA, {
      withSuggestions: false,
    });
    const entry = map.find((m) => m.skillId === skillId);
    expect(entry).toBeDefined();
    expect(entry!.currentVariationId).toBe(variationIdWithLogs);
    // The exercise has logs (seeded in beforeAll) → currentHasLogs should be true.
    expect(entry!.currentHasLogs).toBe(true);
    expect(entry!.currentExerciseId).not.toBeNull();

    // Simulate what the loader does: view != null when logs exist.
    const view = await getExerciseProgression(db, traineePA, entry!.currentExerciseId!, "all");
    expect(view).not.toBeNull();
    expect(view!.kpis.sessionsInRange).toBeGreaterThanOrEqual(1);
    expect(view!.points.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Audyt usuwania: zarchiwizowane ćwiczenie znika z Rozwoju (lista + szczegół)
// ---------------------------------------------------------------------------
describe("audyt usuwania: zarchiwizowane ćwiczenie nie pojawia się w Rozwoju", () => {
  it("ćwiczenie z logami po archiwizacji znika z listProgressionExercises i ze szczegółu (→ null)", async () => {
    // Reużyj istniejący aktywny plan P_A (unikalność active-per-trainee blokuje drugi).
    const [plan] = await db
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(and(eq(schema.plans.traineeId, traineePA), eq(schema.plans.status, "active")))
      .limit(1);
    const [ps] = await db
      .select({ id: schema.planSessions.id })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, plan!.id))
      .limit(1);
    const [ex] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Archived Movement", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    await seedSession({
      trainerId: trainerA,
      traineeId: traineePA,
      planId: plan!.id,
      planSessionId: ps!.id,
      exerciseId: ex!.id,
      performedOn: "2026-02-01",
      reps: [10, 9],
    });

    // Widoczne przed archiwizacją.
    const before = await listProgressionExercises(db, traineePA);
    expect(before.map((r) => r.exerciseId)).toContain(ex!.id);

    // Archiwizuj.
    await db
      .update(schema.exercises)
      .set({ archivedAt: new Date() })
      .where(eq(schema.exercises.id, ex!.id));

    // Znika z listy „Pozostałe".
    const after = await listProgressionExercises(db, traineePA);
    expect(after.map((r) => r.exerciseId)).not.toContain(ex!.id);

    // Szczegół ćwiczenia zwraca null → loader robi z tego 404.
    const view = await getExerciseProgression(db, traineePA, ex!.id, "all");
    expect(view).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fix okresu: szeroki zakres z sesjami w jednym tygodniu nie pokazuje „za mało
// danych" — fallback do ujęcia per-sesja (zakres "all" = brak dolnej granicy daty,
// więc test jest niezależny od zegara).
// ---------------------------------------------------------------------------
describe("okres: sesje w jednym tygodniu na szerokim zakresie → per-sesja, nie pusto", () => {
  it("3 sesje w jednym tygodniu + zakres 'all' → granularity 'session', 3 punkty", async () => {
    const [plan] = await db
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(and(eq(schema.plans.traineeId, traineePA), eq(schema.plans.status, "active")))
      .limit(1);
    const [ps] = await db
      .select({ id: schema.planSessions.id })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, plan!.id))
      .limit(1);
    const [ex] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerA, name: "Same-week movement", unit: "REPS" })
      .returning({ id: schema.exercises.id });
    // 2026-05-25/26/27 to pon/wt/śr tego samego tygodnia → tygodniowo = 1 punkt.
    for (const [d, reps] of [
      ["2026-05-25", [5]],
      ["2026-05-26", [6]],
      ["2026-05-27", [7]],
    ] as const) {
      await seedSession({
        trainerId: trainerA,
        traineeId: traineePA,
        planId: plan!.id,
        planSessionId: ps!.id,
        exerciseId: ex!.id,
        performedOn: d,
        reps: [...reps],
      });
    }

    const view = await getExerciseProgression(db, traineePA, ex!.id, "all");
    expect(view).not.toBeNull();
    // Mimo szerokiego zakresu (który domyślnie agreguje tygodniowo) fallback daje
    // ujęcie per-sesja, bo tygodniowo byłby tylko 1 punkt → „za mało danych".
    expect(view!.granularity).toBe("session");
    expect(view!.points).toHaveLength(3);
  });
});
