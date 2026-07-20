import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getSkillMapForTrainee } from "~/lib/skill-progression";
import { listSkillsForTrainer } from "~/lib/skills";
import {
  layoutNodes,
  nodeState,
  topoOrder,
  type Edge,
  type NodeState,
} from "~/lib/skill-tree-math";

export interface TreeNode {
  skillId: string;
  name: string;
  layer: number;
  orderInLayer: number;
  variationCount: number;
  currentVariationId: string | null;
  currentExerciseId: string | null;
  // Ordinal bieżącego wariantu (1..variationCount) gdy przypisana; null gdy nie lub w widoku autora.
  currentOrdinal: number | null;
  state?: NodeState; // tylko w widoku per-podopieczny
}

export interface SkillTree {
  nodes: TreeNode[];
  edges: Edge[];
}

/** Aktywne umiejętności (efektywny katalog) + ich krawędzie. Współdzielone przez oba widoki. */
async function loadGraph(
  db: Db,
  { trainerId, organizationId }: { trainerId: string; organizationId: string | null },
): Promise<{
  skills: Array<{ id: string; name: string; variationCount: number }>;
  edges: Edge[];
}> {
  // Reuse: listSkillsForTrainer daje aktywne umiejętności + variationCount (patrz skills.ts).
  const skills = await listSkillsForTrainer(db, { trainerId, organizationId });
  const activeIds = new Set(skills.map((s) => s.id));

  const edgeRows = await db
    .select({
      from: schema.skillPrerequisites.skillId,
      requires: schema.skillPrerequisites.requiresSkillId,
    })
    .from(schema.skillPrerequisites)
    .where(
      // Efektywne krawędzie: własne (trainer_id) ∪ markowe (trainer_id NULL) w tej org.
      organizationId
        ? or(
            eq(schema.skillPrerequisites.trainerId, trainerId),
            and(
              isNull(schema.skillPrerequisites.trainerId),
              eq(schema.skillPrerequisites.organizationId, organizationId),
            ),
          )
        : eq(schema.skillPrerequisites.trainerId, trainerId),
    );
  // Pomijamy krawędzie dotykające umiejętności spoza efektywnego zbioru (zarchiwizowane,
  // a także markowe nadpisane forkiem — fork ma własne sklonowane krawędzie, a markowy
  // węzeł znika z activeIds, więc jego krawędzie są tu odrzucane).
  const edges = edgeRows.filter((e) => activeIds.has(e.from) && activeIds.has(e.requires));

  return {
    skills: skills.map((s) => ({ id: s.id, name: s.name, variationCount: s.variationCount })),
    edges,
  };
}

/** Drzewo dla autora (trener) — sam szkielet, bez stanów per-podopieczny. */
export async function getSkillTreeForTrainer(
  db: Db,
  { trainerId, organizationId }: { trainerId: string; organizationId: string | null },
): Promise<SkillTree> {
  const { skills, edges } = await loadGraph(db, { trainerId, organizationId });
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

/** Drzewo dla podopiecznego — ze stanami węzłów liczonymi w porządku topologicznym. */
export async function getSkillTreeForTrainee(
  db: Db,
  { trainerId, organizationId }: { trainerId: string; organizationId: string | null },
  traineeId: string,
): Promise<SkillTree> {
  const { skills, edges } = await loadGraph(db, { trainerId, organizationId });
  const pos = layoutNodes(skills, edges);

  // Bieżący wariant + czy są zdarzenia + max ordinal → z mapy umiejętności (kierunek A).
  const map = await getSkillMapForTrainee(db, trainerId, traineeId, { withSuggestions: false });
  const mapBySkill = new Map(map.map((m) => [m.skillId, m]));

  // Stany w porządku topologicznym, by available/locked zależały od mastered prereków.
  const adjPrereqs = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adjPrereqs.get(e.from) ?? [];
    arr.push(e.requires);
    adjPrereqs.set(e.from, arr);
  }
  const state = new Map<string, NodeState>();
  const ordById = new Map<string, number | null>();
  for (const id of topoOrder(
    skills.map((s) => s.id),
    edges,
  )) {
    const m = mapBySkill.get(id);
    const hasEvents = m?.currentVariationId != null;
    const maxOrd = m ? Math.max(0, ...m.variations.map((v) => v.ordinal)) : 0;
    const curOrd = m?.variations.find((v) => v.id === m.currentVariationId)?.ordinal ?? 0;
    const atTop = hasEvents && m!.variations.length > 0 && curOrd === maxOrd;
    const prereqStates = (adjPrereqs.get(id) ?? []).map((p) => state.get(p) ?? "locked");
    state.set(id, nodeState({ hasEvents, atTopVariation: atTop, prereqStates }));
    ordById.set(id, hasEvents ? curOrd : null);
  }

  const nodes: TreeNode[] = skills.map((s) => {
    const m = mapBySkill.get(s.id);
    return {
      skillId: s.id,
      name: s.name,
      layer: pos.get(s.id)?.layer ?? 0,
      orderInLayer: pos.get(s.id)?.orderInLayer ?? 0,
      variationCount: s.variationCount,
      currentVariationId: m?.currentVariationId ?? null,
      currentExerciseId: m?.currentExerciseId ?? null,
      currentOrdinal: ordById.get(s.id) ?? null,
      state: state.get(s.id) ?? "locked",
    };
  });
  return { nodes, edges };
}
