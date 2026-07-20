import { and, eq, isNotNull, isNull, notInArray, or, type SQL } from "drizzle-orm";
import { planSkillClone } from "~/lib/catalog-math";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class CatalogError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/** origin_id markowych ćwiczeń, które dany trener już sforkował. */
export async function forkedExerciseOriginIds(db: Db, trainerId: string): Promise<string[]> {
  const rows = await db
    .select({ originId: schema.exercises.originId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNotNull(schema.exercises.originId)));
  return rows.map((r) => r.originId).filter((x): x is string => x != null);
}

/**
 * Warunek WHERE „efektywny katalog ćwiczeń trenera": własne ∪ markowe organizacji,
 * z pominięciem markowych, które trener już sforkował. `forkedOriginIds` = wynik
 * `forkedExerciseOriginIds` (przekazywany, by trasa policzyła go raz).
 */
export function effectiveExerciseWhere(
  organizationId: string | null,
  trainerId: string,
  forkedOriginIds: string[],
): SQL {
  const own = eq(schema.exercises.trainerId, trainerId);
  if (!organizationId) return own;
  const brandConds = [
    isNull(schema.exercises.trainerId),
    eq(schema.exercises.organizationId, organizationId),
  ];
  if (forkedOriginIds.length > 0) {
    brandConds.push(notInArray(schema.exercises.id, forkedOriginIds));
  }
  // or()/and() z niepustymi warunkami nie zwracają undefined; ! domyka typ SQL przy kompozycji drizzle (jak w sibling-repach).
  return or(own, and(...brandConds))!;
}

/** Czy ćwiczenie jest markowe (do oznaczania badge „Marka" w UI). */
export function isBrandOwned(row: { trainerId: string | null }): boolean {
  return row.trainerId == null;
}

/** origin_id markowych umiejętności, które trener już sforkował. */
export async function forkedSkillOriginIds(db: Db, trainerId: string): Promise<string[]> {
  const rows = await db
    .select({ originId: schema.skills.originId })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNotNull(schema.skills.originId)));
  return rows.map((r) => r.originId).filter((x): x is string => x != null);
}

/**
 * Warunek WHERE „efektywny katalog umiejętności trenera": własne ∪ markowe
 * organizacji, z pominięciem markowych, które trener już sforkował (analogiczny do
 * `effectiveExerciseWhere`). `forkedOriginIds` = wynik `forkedSkillOriginIds`.
 */
export function effectiveSkillWhere(
  organizationId: string | null,
  trainerId: string,
  forkedOriginIds: string[],
): SQL {
  const own = eq(schema.skills.trainerId, trainerId);
  if (!organizationId) return own;
  const brandConds = [
    isNull(schema.skills.trainerId),
    eq(schema.skills.organizationId, organizationId),
  ];
  if (forkedOriginIds.length > 0) {
    brandConds.push(notInArray(schema.skills.id, forkedOriginIds));
  }
  // or()/and() z niepustymi warunkami nie zwracają undefined; ! domyka typ SQL.
  return or(own, and(...brandConds))!;
}

/**
 * Efektywna organizacja właściciela katalogu dla widoku trenera/podopiecznego:
 * org żądającego, a dla podopiecznego — org jego trenera (katalog markowy należy
 * do organizacji trenera). `??` short-circuituje: gdy org znana, brak zapytania.
 */
export async function resolveCatalogOrgId(
  db: Db,
  user: { organizationId: string | null; trainerId: string | null },
): Promise<string | null> {
  if (user.organizationId) return user.organizationId;
  if (!user.trainerId) return null;
  const [row] = await db
    .select({ o: schema.users.organizationId })
    .from(schema.users)
    .where(eq(schema.users.id, user.trainerId))
    .limit(1);
  return row?.o ?? null;
}

/**
 * Czy plik jest demo markowego ćwiczenia z danej organizacji? Używane przez
 * serwowanie plików, by demo markowych ćwiczeń było widoczne dla wszystkich
 * członków organizacji (nie tylko właściciela pliku). null org → false.
 */
export async function fileIsBrandDemoInOrg(
  db: Db,
  fileId: string,
  organizationId: string | null,
): Promise<boolean> {
  if (!organizationId) return false;
  const [row] = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.demoFileId, fileId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row != null;
}

/**
 * Forkuje markowe ćwiczenie na własność trenera (copy-on-write). Idempotentny:
 * jeśli fork tego origin już istnieje, zwraca jego id. Waliduje, że origin jest
 * markowy i z organizacji trenera (inaczej null → 404).
 */
export async function forkExercise(
  db: Db,
  params: { trainerId: string; organizationId: string | null; exerciseId: string },
): Promise<string | null> {
  const { trainerId, organizationId, exerciseId } = params;
  const [origin] = await db
    .select()
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        organizationId
          ? eq(schema.exercises.organizationId, organizationId)
          : isNull(schema.exercises.organizationId),
      ),
    )
    .limit(1);
  if (!origin) return null;

  // Szybka ścieżka: fork już istnieje.
  const existingId = await findForkId(db, trainerId, exerciseId);
  if (existingId) return existingId;

  try {
    const [clone] = await db
      .insert(schema.exercises)
      .values({
        trainerId,
        organizationId: null,
        originId: origin.id,
        name: origin.name,
        unit: origin.unit,
        description: origin.description,
        tags: origin.tags,
        tracksRpe: origin.tracksRpe,
        demoFileId: origin.demoFileId, // współdzielimy referencję do pliku demo
      })
      .returning({ id: schema.exercises.id });
    // INSERT ... RETURNING jednego wiersza zawsze zwraca dokładnie jeden rekord.
    return clone!.id;
  } catch (e) {
    // Wyścig: równoległy fork wstawił wiersz między SELECT a INSERT → kolizja na
    // (trainer_id, origin_id). Postgres unique-violation (23505) wraca jako zwykły
    // Error z postgres-js; klasyfikujemy po nazwie indeksu (jak w skills.ts) i
    // ponownie czytamy kanoniczny fork.
    if (e instanceof Error && e.message.includes("exercises_trainer_origin_uniq")) {
      const raced = await findForkId(db, trainerId, exerciseId);
      if (raced) return raced;
    }
    throw e;
  }
}

/** id istniejącego forka origin u trenera (lub null). */
async function findForkId(db: Db, trainerId: string, exerciseId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(eq(schema.exercises.trainerId, trainerId), eq(schema.exercises.originId, exerciseId)),
    )
    .limit(1);
  return existing?.id ?? null;
}

/**
 * Głęboko forkuje markową umiejętność na własność trenera (copy-on-write):
 * klonuje sam skill + jego warianty (te same ordinale/ćwiczenia) i krawędzie
 * prerekwizytów, podmieniając origin skillId → nowe id (przez `planSkillClone`).
 * Wszystko w jednej transakcji. Idempotentny: jeśli fork tego origin już istnieje,
 * zwraca jego id. Waliduje, że origin jest markowy i z organizacji trenera
 * (inaczej null → 404). Race-safe na `skills_trainer_origin_uniq` (jak forkExercise).
 */
export async function forkSkill(
  db: Db,
  params: { trainerId: string; organizationId: string | null; skillId: string },
): Promise<string | null> {
  const { trainerId, organizationId, skillId } = params;
  try {
    return await db.transaction(async (tx) => {
      const [origin] = await tx
        .select()
        .from(schema.skills)
        .where(
          and(
            eq(schema.skills.id, skillId),
            isNull(schema.skills.trainerId),
            organizationId
              ? eq(schema.skills.organizationId, organizationId)
              : isNull(schema.skills.organizationId),
          ),
        )
        .limit(1);
      if (!origin) return null;

      // Szybka ścieżka: fork już istnieje.
      const existingId = await findSkillForkId(tx, trainerId, skillId);
      if (existingId) return existingId;

      const [clone] = await tx
        .insert(schema.skills)
        .values({
          trainerId,
          organizationId: null,
          originId: origin.id,
          name: origin.name,
          description: origin.description,
        })
        .returning({ id: schema.skills.id });
      // INSERT ... RETURNING jednego wiersza zawsze zwraca dokładnie jeden rekord.
      const newSkillId = clone!.id;

      const variations = await tx
        .select({
          exerciseId: schema.skillVariations.exerciseId,
          ordinal: schema.skillVariations.ordinal,
        })
        .from(schema.skillVariations)
        .where(eq(schema.skillVariations.skillId, origin.id));
      const prereqs = await tx
        .select({
          skillId: schema.skillPrerequisites.skillId,
          requiresSkillId: schema.skillPrerequisites.requiresSkillId,
        })
        .from(schema.skillPrerequisites)
        .where(eq(schema.skillPrerequisites.skillId, origin.id));

      const plan = planSkillClone(newSkillId, origin.id, variations, prereqs);

      if (plan.variations.length > 0) {
        await tx.insert(schema.skillVariations).values(
          plan.variations.map((v) => ({
            skillId: newSkillId,
            exerciseId: v.exerciseId,
            ordinal: v.ordinal,
          })),
        );
      }
      if (plan.prereqEdges.length > 0) {
        await tx.insert(schema.skillPrerequisites).values(
          plan.prereqEdges.map((e) => ({
            trainerId,
            organizationId: null,
            skillId: e.skillId,
            requiresSkillId: e.requiresSkillId,
          })),
        );
      }
      return newSkillId;
    });
  } catch (e) {
    // Wyścig: równoległy fork wstawił klon między SELECT a INSERT → kolizja na
    // (trainer_id, origin_id). Postgres unique-violation (23505) wraca jako zwykły
    // Error z postgres-js; klasyfikujemy po nazwie indeksu (jak forkExercise) i
    // ponownie czytamy kanoniczny fork (transakcja zwycięzcy już się zacommitowała).
    if (e instanceof Error && e.message.includes("skills_trainer_origin_uniq")) {
      const raced = await findSkillForkId(db, trainerId, skillId);
      if (raced) return raced;
    }
    throw e;
  }
}

/**
 * Promuje WSZYSTKIE własne (niesforkowane, trainer_id=trainerId) ćwiczenia i
 * umiejętności trenera do poziomu marki (trainer_id=NULL, organization_id=org),
 * BEZ zmiany id → FK z planów/logów/wariantów/awansów pozostają ważne. Idempotentny:
 * wiersze już markowe są pomijane (filtr trainer_id=trainerId). Krawędzie prereq
 * promowanego trenera również. Promujemy tylko origin_id IS NULL (kanon, nie forki).
 *
 * CHECK ownerCheck (exercises/skills/skill_prerequisites): „dokładnie jeden
 * właściciel". Po UPDATE trainer_id=NULL ∧ organization_id=org (NOT NULL) spełnia
 * pierwszy dysjunkt → bez naruszenia. organizationId musi być realnym id org
 * (odpowiedzialność wołającego — seed podaje istniejącą org), inaczej FK pęknie.
 */
export async function promoteTrainerCatalogToBrand(
  db: Db,
  params: { trainerId: string; organizationId: string },
): Promise<{ exercises: number; skills: number; prerequisites: number }> {
  const { trainerId, organizationId } = params;
  return await db.transaction(async (tx) => {
    const ex = await tx
      .update(schema.exercises)
      .set({ trainerId: null, organizationId })
      .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.originId)))
      .returning({ id: schema.exercises.id });
    const sk = await tx
      .update(schema.skills)
      .set({ trainerId: null, organizationId })
      .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.originId)))
      .returning({ id: schema.skills.id });
    // skill_prerequisites nie ma origin_id → promujemy WSZYSTKIE krawędzie foundera (OK przy bootstrapie; krawędź wskazująca niepromowany fork stałaby się cross-ownership — nie dotyczy bootstrapu).
    const pr = await tx
      .update(schema.skillPrerequisites)
      .set({ trainerId: null, organizationId })
      .where(eq(schema.skillPrerequisites.trainerId, trainerId))
      .returning({ id: schema.skillPrerequisites.id });
    return { exercises: ex.length, skills: sk.length, prerequisites: pr.length };
  });
}

/** id istniejącego forka markowej umiejętności u trenera (lub null). */
async function findSkillForkId(db: Db, trainerId: string, skillId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), eq(schema.skills.originId, skillId)))
    .limit(1);
  return existing?.id ?? null;
}
