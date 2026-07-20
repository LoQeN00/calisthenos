import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { layoutNodes, wouldCreateCycle, type Edge } from "~/lib/skill-tree-math";
import type { SkillTree, TreeNode } from "~/lib/skill-tree";

export class BrandCatalogError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

// ---------- Ćwiczenia marki ----------

export interface BrandExerciseRow {
  id: string;
  name: string;
  unit: "REPS" | "SEC";
  tracksRpe: boolean;
  tags: string[];
  demoFileId: string | null;
  archivedAt: Date | null;
}

/** Wszystkie markowe ćwiczenia organizacji (aktywne + zarchiwizowane), po nazwie. */
export async function listBrandExercises(
  db: Db,
  organizationId: string,
): Promise<BrandExerciseRow[]> {
  return await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
      tracksRpe: schema.exercises.tracksRpe,
      tags: schema.exercises.tags,
      demoFileId: schema.exercises.demoFileId,
      archivedAt: schema.exercises.archivedAt,
    })
    .from(schema.exercises)
    .where(
      and(isNull(schema.exercises.trainerId), eq(schema.exercises.organizationId, organizationId)),
    )
    .orderBy(asc(schema.exercises.name));
}

/** Pojedyncze markowe ćwiczenie org (z wierszem demo). null → 404. */
export async function getBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<{ exercise: schema.Exercise; demoFile: schema.File | null } | null> {
  // Scope w WHERE (jak reszta pliku): wiersz spoza marki/org po prostu nie wróci → 404.
  const [row] = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { exercise: row.exercise, demoFile: row.demoFile };
}

export interface BrandExerciseInput {
  name: string;
  unit: "REPS" | "SEC";
  description: string;
  tracksRpe: boolean;
  tags: string[];
  demoFileId: string | null;
}

/** Wstawia markowe ćwiczenie (trainer_id NULL + organization_id). */
export async function createBrandExercise(
  db: Db,
  organizationId: string,
  input: BrandExerciseInput,
): Promise<schema.Exercise> {
  const [row] = await db
    .insert(schema.exercises)
    .values({
      trainerId: null,
      organizationId,
      name: input.name,
      unit: input.unit,
      description: input.description,
      tracksRpe: input.tracksRpe,
      tags: input.tags,
      demoFileId: input.demoFileId,
    })
    .returning();
  // INSERT ... RETURNING zawsze zwraca dokładnie jeden wiersz.
  return row!;
}

/** Aktualizuje markowe ćwiczenie org (scope w WHERE → obce nie ruszone). */
export async function updateBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
  input: BrandExerciseInput,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({
      name: input.name,
      unit: input.unit,
      description: input.description,
      tracksRpe: input.tracksRpe,
      tags: input.tags,
      demoFileId: input.demoFileId,
    })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}

/** Archiwizuje markowe ćwiczenie org (scope w WHERE → obce nie ruszone). */
export async function archiveBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}

/** Przywraca zarchiwizowane markowe ćwiczenie org. */
export async function restoreBrandExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: null })
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    );
}

// ---------- Umiejętności marki ----------

export interface BrandSkillListRow {
  id: string;
  name: string;
  description: string;
  variationCount: number;
}

/** Aktywne markowe umiejętności organizacji + liczba wariantów, po nazwie. */
export async function listBrandSkills(
  db: Db,
  organizationId: string,
): Promise<BrandSkillListRow[]> {
  const rows = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      description: schema.skills.description,
      variationCount: sql<number>`COUNT(${schema.skillVariations.id})::int`,
    })
    .from(schema.skills)
    .leftJoin(schema.skillVariations, eq(schema.skillVariations.skillId, schema.skills.id))
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .groupBy(schema.skills.id)
    .orderBy(asc(schema.skills.name));
  return rows.map((r) => ({ ...r, variationCount: Number(r.variationCount) }));
}

export interface BrandVariationRow {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
}

export interface BrandSkillDetail {
  id: string;
  name: string;
  description: string;
  variations: BrandVariationRow[];
}

/**
 * Markowa umiejętność org z wariantami. null gdy nie istnieje / poza zasięgiem (→ 404).
 */
export async function getBrandSkillWithVariations(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<BrandSkillDetail | null> {
  // Scope w WHERE (jak getBrandExercise): wiersz spoza marki/org po prostu nie wróci → 404.
  const [skill] = await db
    .select()
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.id, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!skill) return null;

  const variations = await db
    .select({
      id: schema.skillVariations.id,
      exerciseId: schema.skillVariations.exerciseId,
      ordinal: schema.skillVariations.ordinal,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(eq(schema.skillVariations.skillId, skillId))
    .orderBy(asc(schema.skillVariations.ordinal));

  return { id: skill.id, name: skill.name, description: skill.description, variations };
}

/**
 * Wstawia markową umiejętność (trainer_id NULL + organization_id).
 * Uwaga: brak unikalnego indeksu na (organization_id, name) w schemacie — blok
 * duplicate-name catch celowo pominięty (nie ma nazwy constraintu do dopasowania).
 * Ewentualny markowy unikat nazwy to przyszła decyzja.
 */
export async function createBrandSkill(
  db: Db,
  organizationId: string,
  name: string,
  description: string,
): Promise<schema.Skill> {
  const [row] = await db
    .insert(schema.skills)
    .values({ trainerId: null, organizationId, name, description })
    .returning();
  return row!;
}

/**
 * Aktualizuje markową umiejętność org (scope w WHERE → obce nie ruszone).
 * Bez catch na duplikat nazwy — brak unikalnego indeksu dla markowych (patrz createBrandSkill).
 */
export async function updateBrandSkill(
  db: Db,
  organizationId: string,
  skillId: string,
  name: string,
  description: string,
): Promise<void> {
  await db
    .update(schema.skills)
    .set({ name, description })
    .where(
      and(
        eq(schema.skills.id, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    );
}

/** Archiwizuje markową umiejętność + usuwa krawędzie prerekwizytów tej org. */
export async function archiveBrandSkill(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.skills)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(schema.skills.id, skillId),
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, organizationId),
        ),
      );
    // Usuń krawędzie prerekwizytów dotyczące tej umiejętności (jako zależnej i jako
    // prereka). Scope: markowe krawędzie tej organizacji.
    await tx
      .delete(schema.skillPrerequisites)
      .where(
        and(
          isNull(schema.skillPrerequisites.trainerId),
          eq(schema.skillPrerequisites.organizationId, organizationId),
          or(
            eq(schema.skillPrerequisites.skillId, skillId),
            eq(schema.skillPrerequisites.requiresSkillId, skillId),
          ),
        ),
      );
  });
}

/**
 * Jeśli ćwiczenie jest wariantem AKTYWNEJ markowej umiejętności tej org —
 * zwraca jej id + nazwę; inaczej null. Używane, by zablokować archiwizację ćwiczenia.
 */
export async function findBrandSkillForExercise(
  db: Db,
  organizationId: string,
  exerciseId: string,
): Promise<{ skillId: string; skillName: string } | null> {
  const [row] = await db
    .select({ skillId: schema.skills.id, skillName: schema.skills.name })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.exerciseId, exerciseId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Markowe ćwiczenia org aktywne i nieprzypisane do żadnej markowej umiejętności
 * (picker wariantu). Mirror `listAssignableExercises` — brand-scoped, bez forków.
 */
export async function listAssignableBrandExercises(
  db: Db,
  organizationId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  const [exercises, taken] = await Promise.all([
    db
      .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
      .from(schema.exercises)
      .where(
        and(
          isNull(schema.exercises.trainerId),
          eq(schema.exercises.organizationId, organizationId),
          isNull(schema.exercises.archivedAt),
        ),
      )
      .orderBy(asc(schema.exercises.name)),
    db
      .select({ exerciseId: schema.skillVariations.exerciseId })
      .from(schema.skillVariations)
      .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
      .where(
        and(isNull(schema.skills.trainerId), eq(schema.skills.organizationId, organizationId)),
      ),
  ]);
  const takenSet = new Set(taken.map((r) => r.exerciseId));
  return exercises.filter((e) => !takenSet.has(e.id));
}

/**
 * Dodaje wariant na koniec markowej drabiny umiejętności (ordinal = max+1).
 * Waliduje: umiejętność i ćwiczenie są markowe w tej org; ćwiczenie aktywne;
 * ćwiczenie nie jest wariantem innej markowej umiejętności.
 */
export async function addBrandVariation(
  db: Db,
  organizationId: string,
  skillId: string,
  exerciseId: string,
): Promise<void> {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.id, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!skill) throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");

  const [exercise] = await db
    .select({ id: schema.exercises.id, archivedAt: schema.exercises.archivedAt })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.id, exerciseId),
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!exercise) throw new BrandCatalogError("not found", "Nie znaleziono ćwiczenia.");
  if (exercise.archivedAt != null) {
    throw new BrandCatalogError(
      "archived",
      "Nie można dodać zarchiwizowanego ćwiczenia jako wariantu.",
    );
  }

  // Reguła „≤1 markowa umiejętność w org na ćwiczenie".
  const existing = await findBrandSkillForExercise(db, organizationId, exerciseId);
  if (existing && existing.skillId !== skillId) {
    throw new BrandCatalogError(
      "exercise taken",
      "To ćwiczenie jest już wariantem innej umiejętności.",
    );
  }

  const [maxRow] = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.skillVariations.ordinal}), 0)::int` })
    .from(schema.skillVariations)
    .where(eq(schema.skillVariations.skillId, skillId));
  const nextOrdinal = Number(maxRow?.m ?? 0) + 1;

  try {
    await db.insert(schema.skillVariations).values({ skillId, exerciseId, ordinal: nextOrdinal });
  } catch (e) {
    // Wyścig: dwa równoległe addBrandVariation policzyły ten sam max(ordinal)+1.
    if (e instanceof Error && e.message.includes("skill_variations_skill_ordinal_uniq")) {
      throw new BrandCatalogError(
        "ordinal race",
        "Nie udało się dodać wariantu — spróbuj ponownie.",
      );
    }
    // Ćwiczenie jest już wariantem tej samej umiejętności (UNIQUE(skill_id, exercise_id)).
    if (e instanceof Error && e.message.includes("skill_variations_skill_exercise_uniq")) {
      throw new BrandCatalogError(
        "exercise taken",
        "To ćwiczenie jest już wariantem tej umiejętności.",
      );
    }
    throw e;
  }
}

/** Usuwa wariant markowej umiejętności + przepakowuje ordinale pozostałych (dwufazowo). */
export async function removeBrandVariation(
  db: Db,
  organizationId: string,
  skillId: string,
  variationId: string,
): Promise<void> {
  const [v] = await db
    .select({ id: schema.skillVariations.id })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.id, variationId),
        eq(schema.skillVariations.skillId, skillId),
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!v) throw new BrandCatalogError("not found", "Nie znaleziono wariantu.");

  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.skillVariations).where(eq(schema.skillVariations.id, variationId));
      // Przepakuj ordinale pozostałych wariantów do 1..n (bez dziur). Dwufazowo
      // przez wartości ujemne, by nie złamać UNIQUE(skill_id, ordinal).
      const remaining = await tx
        .select({ id: schema.skillVariations.id })
        .from(schema.skillVariations)
        .where(eq(schema.skillVariations.skillId, skillId))
        .orderBy(asc(schema.skillVariations.ordinal));
      for (let i = 0; i < remaining.length; i++) {
        await tx
          .update(schema.skillVariations)
          .set({ ordinal: -(i + 1) })
          .where(eq(schema.skillVariations.id, remaining[i]!.id));
      }
      for (let i = 0; i < remaining.length; i++) {
        await tx
          .update(schema.skillVariations)
          .set({ ordinal: i + 1 })
          .where(eq(schema.skillVariations.id, remaining[i]!.id));
      }
    });
  } catch (e) {
    // 23503 FK RESTRICT z skill_advancements: wariant użyty w historii awansów.
    if (e instanceof Error && e.message.includes("skill_advancements")) {
      throw new BrandCatalogError(
        "referenced",
        "Nie można usunąć — ten wariant jest użyty w historii awansów. Zarchiwizuj umiejętność zamiast tego.",
      );
    }
    throw e;
  }
}

// ---------- Prerekwizyty marki ----------

/** Wszystkie markowe krawędzie prerekwizytów organizacji (do wykrywania cykli i budowy drzewa). */
async function listBrandEdges(db: Db, organizationId: string): Promise<Edge[]> {
  const rows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
      ),
    );
  return rows.map((r) => ({ from: r.from, requires: r.requires }));
}

/** Czy obie umiejętności są aktywnymi markowymi umiejętnościami tej organizacji? */
async function bothBrandSkillsActive(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
        inArray(schema.skills.id, [skillId, requiresSkillId]),
      ),
    );
  return new Set(rows.map((r) => r.id)).size === 2;
}

/** Dodaje krawędź „skillId wymaga requiresSkillId" w markowym DAG organizacji. */
export async function addBrandPrerequisite(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  if (skillId === requiresSkillId) {
    throw new BrandCatalogError("self loop", "Umiejętność nie może wymagać samej siebie.");
  }
  if (!(await bothBrandSkillsActive(db, organizationId, skillId, requiresSkillId))) {
    throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");
  }
  const edges = await listBrandEdges(db, organizationId);
  if (wouldCreateCycle(edges, skillId, requiresSkillId)) {
    throw new BrandCatalogError("cycle", "To połączenie utworzyłoby cykl w drzewie.");
  }
  try {
    await db.insert(schema.skillPrerequisites).values({
      trainerId: null,
      organizationId,
      skillId,
      requiresSkillId,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_prerequisites_edge_uniq")) {
      throw new BrandCatalogError("duplicate", "Ten prerekwizyt jest już dodany.");
    }
    throw e;
  }
}

/** Usuwa markową krawędź prerekwizytu organizacji (jeśli istnieje). */
export async function removeBrandPrerequisite(
  db: Db,
  organizationId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  await db
    .delete(schema.skillPrerequisites)
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
        eq(schema.skillPrerequisites.skillId, skillId),
        eq(schema.skillPrerequisites.requiresSkillId, requiresSkillId),
      ),
    );
}

/** Prerekwizyty danej markowej umiejętności (do edytora „Wymaga:"). */
export async function listBrandPrerequisitesForSkill(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  return await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skillPrerequisites)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillPrerequisites.requiresSkillId))
    .where(
      and(
        isNull(schema.skillPrerequisites.trainerId),
        eq(schema.skillPrerequisites.organizationId, organizationId),
        eq(schema.skillPrerequisites.skillId, skillId),
      ),
    )
    .orderBy(asc(schema.skills.name));
}

/**
 * Aktywne markowe umiejętności organizacji, które MOŻNA dodać jako prereq danej
 * (bez siebie, bez już dodanych, bez tych, które domknęłyby cykl).
 */
export async function listAssignableBrandPrerequisites(
  db: Db,
  organizationId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  const all = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, organizationId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .orderBy(asc(schema.skills.name));
  const edges = await listBrandEdges(db, organizationId);
  const existing = new Set(edges.filter((e) => e.from === skillId).map((e) => e.requires));
  return all.filter(
    (s) => s.id !== skillId && !existing.has(s.id) && !wouldCreateCycle(edges, skillId, s.id),
  );
}

// ---------- Drzewo umiejętności marki ----------

/**
 * Drzewo markowych umiejętności organizacji — szkielet autora (bez stanów per-podopieczny).
 * Używa listBrandSkills (aktywne + variationCount) + listBrandEdges (krawędzie markowe).
 */
export async function getBrandSkillTree(db: Db, organizationId: string): Promise<SkillTree> {
  const skills = await listBrandSkills(db, organizationId);
  const allEdges = await listBrandEdges(db, organizationId);
  const activeIds = new Set(skills.map((s) => s.id));
  // Pomijamy krawędzie dotykające umiejętności spoza aktywnego zbioru (zarchiwizowane).
  const edges = allEdges.filter((e) => activeIds.has(e.from) && activeIds.has(e.requires));

  // Layout współdzielony z widokiem trenera (skill-tree-math.layoutNodes).
  const pos = layoutNodes(skills, edges);

  const nodes: TreeNode[] = skills.map((s) => ({
    skillId: s.id,
    name: s.name,
    layer: pos.get(s.id)?.layer ?? 0,
    orderInLayer: pos.get(s.id)?.orderInLayer ?? 0,
    variationCount: s.variationCount,
    currentVariationId: null,
    currentExerciseId: null,
    currentOrdinal: null,
  }));
  return { nodes, edges };
}

/**
 * Ustawia kolejność wariantów markowej umiejętności wg podanej listy id.
 * Lista musi zawierać DOKŁADNIE bieżące warianty. W transakcji, dwufazowo.
 */
export async function reorderBrandVariations(
  db: Db,
  organizationId: string,
  skillId: string,
  variationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const [skill] = await tx
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.id, skillId),
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!skill) throw new BrandCatalogError("not found", "Nie znaleziono umiejętności.");

    const current = await tx
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
      .where(
        and(
          eq(schema.skillVariations.skillId, skillId),
          isNull(schema.skills.trainerId),
          eq(schema.skills.organizationId, organizationId),
        ),
      );
    const currentIds = new Set(current.map((c) => c.id));
    // Porównanie rozmiaru + sprawdzenie nieznanych id odrzuca też duplikaty w wejściu.
    if (currentIds.size !== variationIds.length || variationIds.some((id) => !currentIds.has(id))) {
      throw new BrandCatalogError("mismatch", "Lista wariantów nie zgadza się z umiejętnością.");
    }

    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: -(i + 1) })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: i + 1 })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
  });
}
