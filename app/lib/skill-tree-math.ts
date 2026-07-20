/** Czysta logika drzewa umiejętności (bez DB). Krawędź: `from` wymaga `requires`. */

export type NodeState = "mastered" | "in_progress" | "available" | "locked";
export interface Edge {
  from: string; // umiejętność, która ma prerekwizyt
  requires: string; // prerekwizyt
}

/** Mapa: węzeł → lista jego prerekwizytów (requires). */
function prereqAdjacency(edges: Edge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const arr = m.get(e.from) ?? [];
    arr.push(e.requires);
    m.set(e.from, arr);
  }
  return m;
}

/**
 * Czy dodanie krawędzi `from → requires` (from wymaga requires) domknęłoby cykl?
 * Cykl powstaje, gdy `requires` już (tranzytywnie) zależy od `from`. Idziemy po
 * prerekwizytach startując z `requires`; jeśli dotrzemy do `from` — cykl.
 */
export function wouldCreateCycle(edges: Edge[], from: string, requires: string): boolean {
  if (from === requires) return true;
  const adj = prereqAdjacency(edges);
  const stack = [requires];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const p of adj.get(n) ?? []) stack.push(p);
  }
  return false;
}

/** Warstwa = najdłuższa ścieżka od korzenia: korzeń=0, węzeł=max(prereki)+1. Zakłada DAG. */
export function assignLayers(nodeIds: string[], edges: Edge[]): Map<string, number> {
  const adj = prereqAdjacency(edges);
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // guard na nieoczekiwany cykl
    visiting.add(id);
    let d = 0;
    for (const p of adj.get(id) ?? []) d = Math.max(d, depth(p) + 1);
    visiting.delete(id);
    layer.set(id, d);
    return d;
  }
  for (const id of nodeIds) depth(id);
  return layer;
}

/** Deterministyczna kolejność węzłów w warstwie (po nazwie, locale pl). */
export function orderWithinLayer(nodeIds: string[], nameById: Map<string, string>): string[] {
  return [...nodeIds].sort((a, b) =>
    (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "", "pl"),
  );
}

export interface NodeStateInput {
  hasEvents: boolean; // umiejętność przypisana podopiecznemu (≥1 zdarzenie awansu)
  atTopVariation: boolean; // bieżący wariant = najwyższy ordinal
  prereqStates: NodeState[]; // stany bezpośrednich prerekwizytów
}

export function nodeState(input: NodeStateInput): NodeState {
  if (input.hasEvents) return input.atTopVariation ? "mastered" : "in_progress";
  const allMastered = input.prereqStates.every((s) => s === "mastered");
  return allMastered ? "available" : "locked";
}

/**
 * Pozycje węzłów do rysowania drzewa: warstwa (najdłuższa ścieżka od korzenia) +
 * kolejność w warstwie (po nazwie, locale pl). Czyste — współdzielone przez widok
 * trenera (`skill-tree.ts`) i marki (`brand-catalog.ts`).
 */
export function layoutNodes(
  nodes: Array<{ id: string; name: string }>,
  edges: Edge[],
): Map<string, { layer: number; orderInLayer: number }> {
  const ids = nodes.map((n) => n.id);
  const layers = assignLayers(ids, edges);
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const l = layers.get(id) ?? 0;
    const arr = byLayer.get(l) ?? [];
    arr.push(id);
    byLayer.set(l, arr);
  }
  const pos = new Map<string, { layer: number; orderInLayer: number }>();
  for (const [l, group] of byLayer) {
    orderWithinLayer(group, nameById).forEach((id, i) => pos.set(id, { layer: l, orderInLayer: i }));
  }
  return pos;
}

/** Porządek topologiczny (prerekwizyty przed zależnymi). Stabilny (sort id). */
export function topoOrder(nodeIds: string[], edges: Edge[]): string[] {
  const adj = prereqAdjacency(edges);
  const dependents = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodeIds) indeg.set(id, (adj.get(id) ?? []).length);
  for (const e of edges) {
    const arr = dependents.get(e.requires) ?? [];
    arr.push(e.from);
    dependents.set(e.requires, arr);
  }
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  const out: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    out.push(n);
    for (const d of dependents.get(n) ?? []) {
      const next = (indeg.get(d) ?? 0) - 1;
      indeg.set(d, next);
      if (next === 0) {
        queue.push(d);
        queue.sort();
      }
    }
  }
  return out;
}
