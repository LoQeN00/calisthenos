/**
 * Słownik tierów umiejętności (stopień trudności). Czysta logika — bez DB i bez Reacta.
 * Kolejność tablicy JEST semantyką: indeks = ranga trudności.
 */

export const SKILL_TIERS = ["basic", "intermediate", "advanced", "expert"] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];

/**
 * Etykiety w pisowni zdaniowej — `<select>` w formularzu ma być czytelny.
 * Wersalik dokłada CSS tam, gdzie wymaga tego design-system (plakietka, rail pasa).
 */
export const TIER_LABEL: Record<SkillTier, string> = {
  basic: "Podstawowy",
  intermediate: "Średnio zaawansowany",
  advanced: "Zaawansowany",
  expert: "Ekspert",
};

/** 0 (basic) … 3 (expert). Wartość spoza słownika → 0 (defensywnie — dane z DB). */
export function tierRank(tier: SkillTier): number {
  const i = SKILL_TIERS.indexOf(tier);
  return i < 0 ? 0 : i;
}

/**
 * Czy `prereqTier` wolno użyć jako prerekwizytu umiejętności o `skillTier`.
 * Reguła piramidy: prerekwizyt nigdy nie jest trudniejszy od tego, co odblokowuje.
 */
export function canBePrerequisite(prereqTier: SkillTier, skillTier: SkillTier): boolean {
  return tierRank(prereqTier) <= tierRank(skillTier);
}

/**
 * Najwyższy tier, w którym podopieczny ma co najmniej jedną opanowaną umiejętność.
 * `null` gdy nie opanował jeszcze niczego. Bierze `mastered: boolean`, a nie `NodeState`,
 * żeby ten moduł nie zależał od semantyki grafu — mapowanie robi wołający.
 */
export function highestEarnedTier(
  nodes: Array<{ tier: SkillTier; mastered: boolean }>,
): SkillTier | null {
  let best: SkillTier | null = null;
  for (const n of nodes) {
    if (!n.mastered) continue;
    if (best === null || tierRank(n.tier) > tierRank(best)) best = n.tier;
  }
  return best;
}
