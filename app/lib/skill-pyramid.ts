import { SKILL_TIERS, type SkillTier } from "~/lib/skill-tier";
import { orderWithinLayer, type Edge } from "~/lib/skill-tree-math";

/**
 * Układ piramidy umiejętności: przypisanie pasów/podrzędów + geometria planszy.
 * Wszystko czyste i deterministyczne — bez DOM, bez DB, bezpieczne w SSR.
 *
 * MODEL WSPÓŁRZĘDNYCH
 * -------------------
 * Oś X jest znormalizowana do 0..VIEW_W i rozciągana na szerokość planszy
 * (SVG z preserveAspectRatio="none", karty pozycjonowane w procentach).
 * Oś Y jest w PIKSELACH i mapuje się 1:1 — dzięki temu końce beziera zawsze
 * trafiają w środki kart, niezależnie od szerokości ekranu.
 */

export interface PyramidNodeInput {
  id: string;
  name: string;
  tier: SkillTier;
}

export interface PyramidBand {
  tier: SkillTier;
  /** Od dołu pasa: rows[0] = podrząd 0. Każdy rząd posortowany po nazwie (locale pl). */
  rows: string[][];
}

/** Mapa: węzeł → jego prereki leżące w TYM SAMYM pasie (tylko one tworzą podrzędy). */
function sameBandPrereqs(nodes: PyramidNodeInput[], edges: Edge[]): Map<string, string[]> {
  const tierById = new Map(nodes.map((n) => [n.id, n.tier]));
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const fromTier = tierById.get(e.from);
    const reqTier = tierById.get(e.requires);
    // Krawędź dotykająca węzła spoza wejścia (np. zarchiwizowanego) — pomijamy.
    if (fromTier === undefined || reqTier === undefined) continue;
    // Międzypasowa (w tym odwrócona) — nie tworzy podrzędu, patrz spec §4.2.
    if (fromTier !== reqTier) continue;
    const arr = m.get(e.from) ?? [];
    arr.push(e.requires);
    m.set(e.from, arr);
  }
  return m;
}

/** Głębokość w obrębie pasa: bez prereków w pasie = 0, inaczej max(prereq) + 1. */
function subRowDepths(ids: string[], prereqs: Map<string, string[]>): Map<string, number> {
  const inScope = new Set(ids);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function d(id: string): number {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // guard na nieoczekiwany cykl
    visiting.add(id);
    let best = 0;
    for (const p of prereqs.get(id) ?? []) {
      if (!inScope.has(p)) continue;
      best = Math.max(best, d(p) + 1);
    }
    visiting.delete(id);
    depth.set(id, best);
    return best;
  }
  for (const id of ids) d(id);
  return depth;
}

/** Pasy piramidy — tylko niepuste, rosnąco od `basic`. */
export function buildPyramid(nodes: PyramidNodeInput[], edges: Edge[]): PyramidBand[] {
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  const prereqs = sameBandPrereqs(nodes, edges);

  const out: PyramidBand[] = [];
  for (const tier of SKILL_TIERS) {
    // .sort() domyka determinizm: gdyby dwie umiejętności miały tę samą nazwę,
    // orderWithinLayer (sort stabilny) zostawiłby o kolejności decydować bazie.
    const ids = nodes
      .filter((n) => n.tier === tier)
      .map((n) => n.id)
      .sort();
    if (ids.length === 0) continue; // pusty pas nie jest renderowany
    const depths = subRowDepths(ids, prereqs);
    const maxDepth = Math.max(...ids.map((id) => depths.get(id) ?? 0));
    const rows: string[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      rows.push(
        orderWithinLayer(
          ids.filter((id) => (depths.get(id) ?? 0) === d),
          nameById,
        ),
      );
    }
    // Guard antycyklowy w subRowDepths może zostawić dziurę w numeracji głębokości,
    // a wtedy layoutPyramid zarezerwowałby pusty rząd. Dla poprawnego DAG-u ten
    // filtr jest no-opem: każda głębokość 0..maxDepth ma tam swojego mieszkańca.
    out.push({ tier, rows: rows.filter((r) => r.length > 0) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export const VIEW_W = 1000;

export interface PyramidMetrics {
  /** Wysokość jednego rzędu wizualnego, px. */
  rowH: number;
  /** Wysokość paska z nazwą tieru i licznikiem, px. */
  bandHeaderH: number;
  /** Odstęp między płytami pasów, px. */
  bandGap: number;
  /** Zawężenie pasa na stronę, w jednostkach VIEW_W, na każdy pas w górę. */
  insetStep: number;
  /**
   * Twardy limit zawężenia na stronę, jako ułamek VIEW_W. Bez niego wysoka
   * piramida zwinęłaby szczyt do paska. Musi być < 0.5.
   */
  maxInsetFrac: number;
}

/**
 * `rowH` musi być WIĘKSZE od karty, bo karta jest wyśrodkowana na swoim rzędzie:
 * rowH to odległość między środkami sąsiednich podrzędów. Karta piramidy mierzy
 * ~126 px w najgorszym przypadku (kafel 34 + nazwa łamana do 2 linii + linia
 * poziomu + pasek + padding), więc 144 zostawia ~9 px powietrza nad i pod nią —
 * to samo powietrze jest jednocześnie dolnym marginesem płyty pasa.
 */
export const DEFAULT_METRICS: PyramidMetrics = {
  rowH: 144,
  bandHeaderH: 30,
  bandGap: 14,
  insetStep: 64,
  maxInsetFrac: 0.28,
};

export interface PyramidBandBox {
  tier: SkillTier;
  /** Lewa/prawa krawędź płyty w jednostkach VIEW_W. */
  x0: number;
  x1: number;
  /** Górna krawędź płyty i jej wysokość, px. */
  y: number;
  h: number;
}

export interface PyramidLayout {
  totalH: number;
  /**
   * Ile szerokości karty musi mieć plansza, żeby ŻADEN pas nie ściskał swoich kart
   * poniżej pełnej szerokości — liczba zmiennoprzecinkowa. CSS używa jej jako
   * `calc(var(--pyramid-col) * boardCols)`.
   */
  boardCols: number;
  /** Od góry planszy (najwyższy tier) w dół. */
  bands: PyramidBandBox[];
  /** x w jednostkach VIEW_W, y w px. */
  centers: Map<string, { x: number; y: number }>;
}

/**
 * KLUCZOWA ZASADA: zawężenie pasów jest nienaruszalne — sylwetka piramidy to
 * cały sens tego widoku. Gdy przez zawężenie kolumny w wyższym pasie zrobiłoby
 * się ciasno, koszt bierze na siebie SZEROKOŚĆ PLANSZY (`boardCols`), a nie
 * szerokość karty. Wcześniejsza wersja robiła odwrotnie — przycinała zawężenie —
 * przez co piramida z jednym węzłem na pas spłaszczała się w prostokąt.
 */
export function layoutPyramid(
  bands: PyramidBand[],
  m: PyramidMetrics = DEFAULT_METRICS,
): PyramidLayout {
  const insetCap = m.maxInsetFrac * VIEW_W;
  const boxes: PyramidBandBox[] = [];
  const centers = new Map<string, { x: number; y: number }>();
  let y = 0;
  let boardCols = 1;

  // `bands` rośnie od basic, więc iteracja od końca idzie od góry planszy w dół,
  // a indeks `i` jest jednocześnie numerem pasa liczonym OD DOŁU (steruje zawężeniem).
  for (let i = bands.length - 1; i >= 0; i--) {
    const band = bands[i]!;
    const inset = Math.min(i * m.insetStep, insetCap);
    const x0 = inset;
    const x1 = VIEW_W - inset;
    const span = x1 - x0;
    const widestInBand = Math.max(1, ...band.rows.map((r) => r.length));
    // Ten pas mieści `widestInBand` kolumn na `span` jednostkach zamiast na
    // pełnych VIEW_W — więc żąda od planszy odpowiednio większej szerokości.
    boardCols = Math.max(boardCols, (widestInBand * VIEW_W) / span);

    const h = m.bandHeaderH + band.rows.length * m.rowH;
    boxes.push({ tier: band.tier, x0, x1, y, h });

    // Podrząd 0 na dole pasa → iterujemy rzędy od końca (najwyższy podrząd u góry).
    for (let r = 0; r < band.rows.length; r++) {
      const row = band.rows[band.rows.length - 1 - r]!;
      const rowCenterY = y + m.bandHeaderH + r * m.rowH + m.rowH / 2;
      row.forEach((id, j) => {
        centers.set(id, {
          x: x0 + ((j + 0.5) / row.length) * span,
          y: rowCenterY,
        });
      });
    }

    y += h + m.bandGap;
  }

  return { totalH: Math.max(0, y - m.bandGap), boardCols, bands: boxes, centers };
}
