import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getEasierAtSameReps, getExerciseProgress, getPlateauExercises } from "~/lib/stats";
import {
  currentLevelFromEvents,
  suggestAdvancement,
  type AdvancementSuggestion,
  type AdvancementEvent,
} from "~/lib/skill-progression-math";
import { SkillError } from "~/lib/skills";

export interface SkillMapVariation {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
  isCurrent: boolean;
}

export interface SkillAdvancementHistoryRow {
  advancedOn: string;
  fromVariationId: string | null;
  toVariationId: string;
  note: string | null;
}

export interface SkillMapEntry {
  skillId: string;
  skillName: string;
  variations: SkillMapVariation[];
  currentVariationId: string | null;
  // exerciseId bieżącego wariantu (do deep-linku w wyniki/Progresję); null gdy nieprzypisane.
  currentExerciseId: string | null;
  lastAdvancedOn: string | null;
  suggestion: AdvancementSuggestion;
  history: SkillAdvancementHistoryRow[];
  // Czy bieżący wariant ma zalogowane serie — steruje linkiem „wyniki w czasie"
  // do Progresji (trasa progresja/:exerciseId zwraca 404 bez logów).
  currentHasLogs: boolean;
}

export type SkillMap = SkillMapEntry[];

export async function getSkillMapForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
  opts: { withSuggestions?: boolean } = {},
): Promise<SkillMap> {
  const skills = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .orderBy(asc(schema.skills.name));
  if (skills.length === 0) return [];
  const skillIds = skills.map((s) => s.id);

  const variations = await db
    .select({
      id: schema.skillVariations.id,
      skillId: schema.skillVariations.skillId,
      exerciseId: schema.skillVariations.exerciseId,
      ordinal: schema.skillVariations.ordinal,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(inArray(schema.skillVariations.skillId, skillIds))
    .orderBy(asc(schema.skillVariations.skillId), asc(schema.skillVariations.ordinal));

  const advRows = await db
    .select({
      skillId: schema.skillAdvancements.skillId,
      fromVariationId: schema.skillAdvancements.fromVariationId,
      toVariationId: schema.skillAdvancements.toVariationId,
      advancedOn: schema.skillAdvancements.advancedOn,
      createdAt: schema.skillAdvancements.createdAt,
      note: schema.skillAdvancements.note,
    })
    .from(schema.skillAdvancements)
    .where(
      and(
        eq(schema.skillAdvancements.trainerId, trainerId),
        eq(schema.skillAdvancements.traineeId, traineeId),
        inArray(schema.skillAdvancements.skillId, skillIds),
      ),
    )
    .orderBy(desc(schema.skillAdvancements.advancedOn), desc(schema.skillAdvancements.createdAt));

  // Ćwiczenia, dla których podopieczny ma zalogowane serie (do flagi currentHasLogs).
  const loggedRows = await db
    .selectDistinct({ exerciseId: schema.workoutExerciseLogs.exerciseId })
    .from(schema.workoutExerciseLogs)
    .innerJoin(
      schema.workoutLogs,
      eq(schema.workoutLogs.id, schema.workoutExerciseLogs.workoutLogId),
    )
    .where(
      and(eq(schema.workoutLogs.trainerId, trainerId), eq(schema.workoutLogs.traineeId, traineeId)),
    );
  const loggedExSet = new Set(loggedRows.map((r) => r.exerciseId));

  const varsBySkill = new Map<string, typeof variations>();
  for (const v of variations) {
    const arr = varsBySkill.get(v.skillId) ?? [];
    arr.push(v);
    varsBySkill.set(v.skillId, arr);
  }
  const ordinalByVarId = new Map(variations.map((v) => [v.id, v.ordinal] as const));
  const advBySkill = new Map<string, typeof advRows>();
  for (const a of advRows) {
    const arr = advBySkill.get(a.skillId) ?? [];
    arr.push(a);
    advBySkill.set(a.skillId, arr);
  }

  let progressByEx = new Map<
    string,
    { status: "up" | "flat" | "down" | "new"; sessionCount: number; recentAvgRpe: number }
  >();
  let easierSet = new Set<string>();
  let plateauSet = new Set<string>();
  if (opts.withSuggestions) {
    const progress = await getExerciseProgress(db, traineeId);
    progressByEx = new Map(
      progress.map((p) => [
        p.exerciseId,
        { status: p.status, sessionCount: p.sessionCount, recentAvgRpe: p.recentAvgRpe },
      ]),
    );
    easierSet = new Set((await getEasierAtSameReps(db, traineeId)).map((e) => e.exerciseId));
    plateauSet = new Set((await getPlateauExercises(db, traineeId)).map((p) => p.exerciseId));
  }

  return skills.map((skill) => {
    const vars = varsBySkill.get(skill.id) ?? [];
    const rawAdv = advBySkill.get(skill.id) ?? [];
    const events: AdvancementEvent[] = rawAdv.map((a) => ({
      toVariationId: a.toVariationId,
      toOrdinal: ordinalByVarId.get(a.toVariationId) ?? 0,
      advancedOn: a.advancedOn,
      createdAt: a.createdAt.getTime(),
    }));
    const current = currentLevelFromEvents(events);
    const currentVar = current ? (vars.find((v) => v.id === current.toVariationId) ?? null) : null;
    const lastAdvancedOn = rawAdv[0]?.advancedOn ?? null;

    let suggestion: AdvancementSuggestion = null;
    if (opts.withSuggestions && currentVar) {
      const prog = progressByEx.get(currentVar.exerciseId);
      // vars jest niepuste: currentVar != null oznacza, że vars.find(...) wyżej trafiło.
      const ordinals = vars.map((v) => v.ordinal);
      const maxOrd = Math.max(...ordinals);
      const minOrd = Math.min(...ordinals);
      suggestion = suggestAdvancement({
        sessionsOnCurrent: prog?.sessionCount ?? 0,
        status: prog?.status ?? "new",
        easierAtSameReps: easierSet.has(currentVar.exerciseId),
        inPlateau: plateauSet.has(currentVar.exerciseId),
        recentAvgRpe: prog?.recentAvgRpe ?? null,
        hasHigherVariant: currentVar.ordinal < maxOrd,
        hasLowerVariant: currentVar.ordinal > minOrd,
      });
    }

    return {
      skillId: skill.id,
      skillName: skill.name,
      variations: vars.map((v) => ({
        id: v.id,
        exerciseId: v.exerciseId,
        ordinal: v.ordinal,
        exerciseName: v.exerciseName,
        unit: v.unit,
        isCurrent: currentVar?.id === v.id,
      })),
      currentVariationId: currentVar?.id ?? null,
      currentExerciseId: currentVar?.exerciseId ?? null,
      lastAdvancedOn,
      suggestion,
      history: rawAdv.map((a) => ({
        advancedOn: a.advancedOn,
        fromVariationId: a.fromVariationId,
        toVariationId: a.toVariationId,
        note: a.note,
      })),
      currentHasLogs: currentVar ? loggedExSet.has(currentVar.exerciseId) : false,
    };
  });
}

/** Id umiejętności, do których podopieczny jest przypisany (ma ≥1 zdarzenie awansu). */
export async function listAssignedSkillIds(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ skillId: schema.skillAdvancements.skillId })
    .from(schema.skillAdvancements)
    .where(
      and(
        eq(schema.skillAdvancements.trainerId, trainerId),
        eq(schema.skillAdvancements.traineeId, traineeId),
      ),
    );
  return rows.map((r) => r.skillId);
}

/** Wspólny insert zdarzenia awansu/cofnięcia/poziomu startowego z walidacją tenant-scope. */
async function insertAdvancement(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  fromVariationId: string | null,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) throw new SkillError("not found", "Nie znaleziono umiejętności.");

  const [trainee] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new SkillError("not found", "Nie znaleziono podopiecznego.");

  const ids = fromVariationId ? [toVariationId, fromVariationId] : [toVariationId];
  const vars = await db
    .select({ id: schema.skillVariations.id })
    .from(schema.skillVariations)
    .where(
      and(eq(schema.skillVariations.skillId, skillId), inArray(schema.skillVariations.id, ids)),
    );
  if (vars.length !== ids.length) {
    throw new SkillError("bad variation", "Wariant nie należy do tej umiejętności.");
  }

  await db.insert(schema.skillAdvancements).values({
    trainerId,
    traineeId,
    skillId,
    fromVariationId,
    toVariationId,
    advancedOn,
    advancedBy: trainerId,
    note,
  });
}

/** Ustawienie poziomu startowego (from = NULL). */
export async function setStartingLevel(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  await insertAdvancement(db, trainerId, traineeId, skillId, toVariationId, null, advancedOn, note);
}

/** Awans/cofnięcie: from = bieżący poziom, to = wybrany wariant (wyższy lub niższy ordinal). */
export async function recordAdvancement(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  const advRows = await db
    .select({
      toVariationId: schema.skillAdvancements.toVariationId,
      advancedOn: schema.skillAdvancements.advancedOn,
      createdAt: schema.skillAdvancements.createdAt,
    })
    .from(schema.skillAdvancements)
    .where(
      and(
        eq(schema.skillAdvancements.trainerId, trainerId),
        eq(schema.skillAdvancements.traineeId, traineeId),
        eq(schema.skillAdvancements.skillId, skillId),
      ),
    );
  const events: AdvancementEvent[] = advRows.map((a) => ({
    toVariationId: a.toVariationId,
    // currentLevelFromEvents nie czyta toOrdinal (wybiera po dacie/createdAt) — 0 tylko domyka typ.
    toOrdinal: 0,
    advancedOn: a.advancedOn,
    createdAt: a.createdAt.getTime(),
  }));
  const current = currentLevelFromEvents(events);
  if (current == null) {
    throw new SkillError("no start", "Najpierw ustaw poziom startowy.");
  }
  if (current.toVariationId === toVariationId) {
    throw new SkillError("same level", "Podopieczny jest już na tym wariancie.");
  }
  await insertAdvancement(
    db,
    trainerId,
    traineeId,
    skillId,
    toVariationId,
    current.toVariationId,
    advancedOn,
    note,
  );
}
