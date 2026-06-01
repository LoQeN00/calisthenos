import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { wouldCreateCycle, type Edge } from "~/lib/skill-tree-math";

export class SkillError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface SkillListRow {
  id: string;
  name: string;
  description: string;
  variationCount: number;
}

/** Aktywne umiejętności trenera + liczba wariantów. */
export async function listSkillsForTrainer(db: Db, trainerId: string): Promise<SkillListRow[]> {
  const rows = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      description: schema.skills.description,
      variationCount: sql<number>`COUNT(${schema.skillVariations.id})::int`,
    })
    .from(schema.skills)
    .leftJoin(schema.skillVariations, eq(schema.skillVariations.skillId, schema.skills.id))
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .groupBy(schema.skills.id)
    .orderBy(asc(schema.skills.name));
  return rows.map((r) => ({ ...r, variationCount: Number(r.variationCount) }));
}

export interface VariationRow {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
}

export interface SkillDetail {
  id: string;
  name: string;
  description: string;
  variations: VariationRow[]; // posortowane rosnąco po ordinal
}

/** Umiejętność trenera z wariantami. null gdy nie istnieje / nie jego (→ 404). */
export async function getSkillWithVariations(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<SkillDetail | null> {
  const [skill] = await db
    .select()
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
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

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    variations,
  };
}

export async function createSkill(
  db: Db,
  trainerId: string,
  name: string,
  description: string,
): Promise<schema.Skill> {
  try {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId, name, description })
      .returning();
    return row!;
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function updateSkill(
  db: Db,
  trainerId: string,
  skillId: string,
  name: string,
  description: string,
): Promise<void> {
  try {
    await db
      .update(schema.skills)
      .set({ name, description })
      .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)));
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function archiveSkill(db: Db, trainerId: string, skillId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.skills)
      .set({ archivedAt: sql`now()` })
      .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)));
    // Usuń krawędzie prerekwizytów dotyczące tej umiejętności (jako zależnej i jako
    // prereka). Inaczej zostałyby osierocone w DB — niewidoczne dziś (drzewo pomija
    // krawędzie zarchiwizowanych, skill-tree.ts), ale wróciłyby przy ewentualnym
    // odarchiwizowaniu i rosłyby jako martwe dane.
    await tx
      .delete(schema.skillPrerequisites)
      .where(
        and(
          eq(schema.skillPrerequisites.trainerId, trainerId),
          or(
            eq(schema.skillPrerequisites.skillId, skillId),
            eq(schema.skillPrerequisites.requiresSkillId, skillId),
          ),
        ),
      );
  });
}

/**
 * Jeśli ćwiczenie jest wariantem AKTYWNEJ umiejętności trenera — zwraca jej nazwę;
 * inaczej null. Używane, by zablokować archiwizację ćwiczenia, które wisi w drzewie
 * umiejętności (inwariant: wariant aktywnej umiejętności nigdy nie wskazuje
 * zarchiwizowanego ćwiczenia → drzewo/mapa pozostają spójne z biblioteką).
 */
export async function findSkillForExercise(
  db: Db,
  trainerId: string,
  exerciseId: string,
): Promise<{ skillId: string; skillName: string } | null> {
  const [row] = await db
    .select({ skillId: schema.skills.id, skillName: schema.skills.name })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.exerciseId, exerciseId),
        eq(schema.skills.trainerId, trainerId),
        isNull(schema.skills.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Dodaje wariant na koniec drabiny (ordinal = max+1). Weryfikuje, że i umiejętność,
 * i ćwiczenie należą do trenera. Łamie UNIQUE(exercise_id) → przyjazny błąd.
 */
export async function addVariation(
  db: Db,
  trainerId: string,
  skillId: string,
  exerciseId: string,
): Promise<void> {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) throw new SkillError("not found", "Nie znaleziono umiejętności.");

  const [exercise] = await db
    .select({ id: schema.exercises.id, archivedAt: schema.exercises.archivedAt })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  if (!exercise) throw new SkillError("not found", "Nie znaleziono ćwiczenia.");
  // Picker `listAssignableExercises` już odfiltrowuje zarchiwizowane, ale akcja musi
  // walidować samodzielnie (bezpośredni POST mógłby ominąć picker).
  if (exercise.archivedAt != null) {
    throw new SkillError("archived", "Nie można dodać zarchiwizowanego ćwiczenia jako wariantu.");
  }

  const [maxRow] = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.skillVariations.ordinal}), 0)::int` })
    .from(schema.skillVariations)
    .where(eq(schema.skillVariations.skillId, skillId));
  const nextOrdinal = Number(maxRow?.m ?? 0) + 1;

  try {
    await db.insert(schema.skillVariations).values({ skillId, exerciseId, ordinal: nextOrdinal });
  } catch (e) {
    // Postgres unique-violation (23505) wraca jako zwykły Error z postgres-js; klasyfikujemy po nazwie indeksu.
    if (e instanceof Error && e.message.includes("skill_variations_exercise_uniq")) {
      throw new SkillError("exercise taken", "To ćwiczenie jest już wariantem innej umiejętności.");
    }
    // Wyścig: dwa równoległe addVariation policzyły ten sam max(ordinal)+1 → kolizja na (skill_id, ordinal).
    if (e instanceof Error && e.message.includes("skill_variations_skill_ordinal_uniq")) {
      throw new SkillError("ordinal race", "Nie udało się dodać wariantu — spróbuj ponownie.");
    }
    throw e;
  }
}

/** Usuwa wariant (jeśli należy do umiejętności trenera). RESTRICT z awansów → przyjazny błąd. */
export async function removeVariation(
  db: Db,
  trainerId: string,
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
        eq(schema.skills.trainerId, trainerId),
      ),
    )
    .limit(1);
  if (!v) throw new SkillError("not found", "Nie znaleziono wariantu.");

  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.skillVariations).where(eq(schema.skillVariations.id, variationId));
      // Przepakuj ordinale pozostałych wariantów do 1..n (bez dziur). Dwufazowo
      // przez wartości ujemne, by nie złamać UNIQUE(skill_id, ordinal) — jak w
      // reorderVariations.
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
    // 23503 = foreign_key_violation: awans (RESTRICT) wskazuje ten wariant. Komunikat PG
    // zawiera nazwę tabeli odnoszącej się — "skill_advancements" — stąd dopasowanie po podłańcuchu.
    if (e instanceof Error && e.message.includes("skill_advancements")) {
      throw new SkillError(
        "referenced",
        "Nie można usunąć — ten wariant jest użyty w historii awansów. Zarchiwizuj umiejętność zamiast tego.",
      );
    }
    throw e;
  }
}

/**
 * Ustawia kolejność wariantów wg podanej listy id. W transakcji, dwufazowo,
 * by nie złamać UNIQUE(skill_id, ordinal): najpierw ordinale ujemne, potem docelowe.
 * Lista musi zawierać DOKŁADNIE bieżące warianty umiejętności.
 */
export async function reorderVariations(
  db: Db,
  trainerId: string,
  skillId: string,
  variationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // Jawna weryfikacja własności umiejętności — także dla przypadku pustej listy
    // wariantów, gdzie sama porównawcza bramka niżej przeszłaby pusto (no-op).
    const [skill] = await tx
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
      .limit(1);
    if (!skill) throw new SkillError("not found", "Nie znaleziono umiejętności.");

    const current = await tx
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
      .where(
        and(eq(schema.skillVariations.skillId, skillId), eq(schema.skills.trainerId, trainerId)),
      );
    const currentIds = new Set(current.map((c) => c.id));
    // Porównanie rozmiaru + sprawdzenie nieznanych id odrzuca też duplikaty w wejściu
    // (duplikat nie powiększa zbioru, więc rozmiary się rozjadą).
    if (currentIds.size !== variationIds.length || variationIds.some((id) => !currentIds.has(id))) {
      throw new SkillError("mismatch", "Lista wariantów nie zgadza się z umiejętnością.");
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

/**
 * Ćwiczenia trenera, które NIE są jeszcze wariantem żadnej umiejętności (do pickera).
 * Pojedynczy LEFT JOIN + `skill_variations.id IS NULL` — bez ładowania listy id do pamięci.
 * (UNIQUE(exercise_id) gwarantuje co najwyżej jeden join na ćwiczenie, więc brak duplikatów.)
 */
export async function listAssignableExercises(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  return await db
    .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
    .from(schema.exercises)
    .leftJoin(schema.skillVariations, eq(schema.skillVariations.exerciseId, schema.exercises.id))
    .where(
      and(
        eq(schema.exercises.trainerId, trainerId),
        isNull(schema.exercises.archivedAt),
        isNull(schema.skillVariations.id),
      ),
    )
    .orderBy(asc(schema.exercises.name));
}

/**
 * Mapa: ćwiczenie → umiejętność, do której należy (aktywne umiejętności trenera).
 * Używane przez listę Progresji, by pokazać chip „część umiejętności: …" linkujący
 * do drabiny. Jeden wiersz na wariant (UNIQUE(exercise_id) → brak duplikatów).
 */
export async function listExerciseSkillMap(
  db: Db,
  trainerId: string,
): Promise<Array<{ exerciseId: string; skillId: string; skillName: string }>> {
  return await db
    .select({
      exerciseId: schema.skillVariations.exerciseId,
      skillId: schema.skills.id,
      skillName: schema.skills.name,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(
      and(
        eq(schema.skills.trainerId, trainerId),
        isNull(schema.skills.archivedAt),
        isNull(schema.exercises.archivedAt),
      ),
    );
}

/** Wszystkie krawędzie prerekwizytów trenera (do wykrywania cykli i budowy drzewa). */
async function listEdgesForTrainer(db: Db, trainerId: string): Promise<Edge[]> {
  const rows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(eq(schema.skillPrerequisites.trainerId, trainerId));
  return rows.map((r) => ({ from: r.from, requires: r.requires }));
}

/** Czy obie umiejętności należą do trenera? (walidacja własności). */
async function bothSkillsOwned(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.trainerId, trainerId),
        isNull(schema.skills.archivedAt),
        inArray(schema.skills.id, [skillId, requiresSkillId]),
      ),
    );
  return new Set(rows.map((r) => r.id)).size === 2;
}

/** Dodaje krawędź „skillId wymaga requiresSkillId". Odrzuca obce, samopętlę, cykl, duplikat. */
export async function addPrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  if (skillId === requiresSkillId) {
    throw new SkillError("self loop", "Umiejętność nie może wymagać samej siebie.");
  }
  if (!(await bothSkillsOwned(db, trainerId, skillId, requiresSkillId))) {
    throw new SkillError("not found", "Nie znaleziono umiejętności.");
  }
  const edges = await listEdgesForTrainer(db, trainerId);
  if (wouldCreateCycle(edges, skillId, requiresSkillId)) {
    throw new SkillError("cycle", "To połączenie utworzyłoby cykl w drzewie.");
  }
  try {
    await db
      .insert(schema.skillPrerequisites)
      .values({ trainerId, skillId, requiresSkillId });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_prerequisites_edge_uniq")) {
      throw new SkillError("duplicate", "Ten prerekwizyt jest już dodany.");
    }
    throw e;
  }
}

/** Usuwa krawędź (jeśli należy do trenera). */
export async function removePrerequisite(
  db: Db,
  trainerId: string,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  await db
    .delete(schema.skillPrerequisites)
    .where(
      and(
        eq(schema.skillPrerequisites.trainerId, trainerId),
        eq(schema.skillPrerequisites.skillId, skillId),
        eq(schema.skillPrerequisites.requiresSkillId, requiresSkillId),
      ),
    );
}

/** Prerekwizyty danej umiejętności (do edytora „Wymaga:"). */
export async function listPrerequisitesForSkill(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  return await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skillPrerequisites)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillPrerequisites.requiresSkillId))
    .where(
      and(
        eq(schema.skillPrerequisites.trainerId, trainerId),
        eq(schema.skillPrerequisites.skillId, skillId),
      ),
    )
    .orderBy(asc(schema.skills.name));
}

/**
 * Umiejętności trenera, które MOŻNA dodać jako prereq danej (bez siebie, bez już
 * dodanych, bez tych, które domknęłyby cykl). Aktywne (nie zarchiwizowane).
 */
export async function listAssignablePrerequisites(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<Array<{ id: string; name: string }>> {
  const all = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .orderBy(asc(schema.skills.name));
  const edges = await listEdgesForTrainer(db, trainerId);
  const existing = new Set(
    edges.filter((e) => e.from === skillId).map((e) => e.requires),
  );
  return all.filter(
    (s) =>
      s.id !== skillId &&
      !existing.has(s.id) &&
      !wouldCreateCycle(edges, skillId, s.id),
  );
}
