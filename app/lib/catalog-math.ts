/** Czysta logika katalogu (org/marka ↔ trener). Bez DB, bez I/O, bez Date.now. */

/** Z markowych wierszy usuwa te, które dany trener już sforkował (po origin_id). */
export function suppressForkedOrigins<T extends { id: string }>(
  brandRows: T[],
  forkedOriginIds: Set<string>,
): T[] {
  return brandRows.filter((r) => !forkedOriginIds.has(r.id));
}

/** Czy ćwiczenie jest już wariantem JAKIEJŚ umiejętności w widoku (zbiór exerciseId wariantów widoku). */
export function exerciseAlreadyVariationInView(
  variationExerciseIdsInView: Set<string>,
  exerciseId: string,
): boolean {
  return variationExerciseIdsInView.has(exerciseId);
}

export interface CloneVariationInput {
  exerciseId: string;
  ordinal: number;
}
export interface ClonePrereqInput {
  skillId: string;
  requiresSkillId: string;
}
/**
 * Plan głębokiego klonu drabiny: przepisuje warianty (ten sam ordinal, to samo
 * exerciseId) i krawędzie prereq, podmieniając stare skillId klonowanego skilla na
 * nowe. Czysta transformacja — bez I/O.
 */
export function planSkillClone(
  newSkillId: string,
  originSkillId: string,
  variations: CloneVariationInput[],
  prereqEdges: ClonePrereqInput[],
): { variations: CloneVariationInput[]; prereqEdges: ClonePrereqInput[] } {
  const swap = (id: string) => (id === originSkillId ? newSkillId : id);
  return {
    // Defensywna projekcja: wejście może być bogatszym wierszem wariantu — zwracamy tylko { exerciseId, ordinal } potrzebne do wstawienia klonów.
    variations: variations.map((v) => ({ exerciseId: v.exerciseId, ordinal: v.ordinal })),
    prereqEdges: prereqEdges.map((e) => ({
      skillId: swap(e.skillId),
      requiresSkillId: swap(e.requiresSkillId),
    })),
  };
}
