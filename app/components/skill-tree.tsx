import { Link } from "react-router";
import { Icons } from "~/components/icons";
import type { SkillTree, TreeNode } from "~/lib/skill-tree";
import type { NodeState } from "~/lib/skill-tree-math";

// ============================================================
// SkillTreeView — game-like skill tree, re-skinned to the kalisthenos
// design system: hairline borders, mono labels, one lime accent, NO glow,
// NO emoji (per design-system/README.md). Mirrors the idiom of
// stat-widgets.tsx / progression-charts.tsx: all colors via var(--*),
// numbers in var(--font-mono), SVG layer with role="img" + aria-label,
// responsive via CSS grid + a normalized-viewBox SVG.
//
// Pure presentation: no data fetching, no loaders/actions, only `Link` from
// react-router.
//
// COORDINATE MODEL (for the SVG edge layer)
// ------------------------------------------
// The DOM nodes live in a CSS grid (one grid-row per `layer`, columns within a
// row by `orderInLayer`). The SVG sits behind them with a *normalized* viewBox
// of `0..VIEW_W` × `0..VIEW_H` and `preserveAspectRatio="none"`, so SVG units
// stretch 1:1 onto the board's pixel box. We compute every node's center in
// that normalized space purely from counts — no DOM measurement, SSR-clean:
//   • y = top padding for the node's layer row (each row gets an equal band;
//     the node center sits in the middle of its band).
//   • x = the node's column center, spreading `nodesInLayer` evenly across the
//     full width. A layer with N nodes splits the width into N equal columns;
//     node i sits at the center of column i.
// These match the grid's own even distribution (`1fr` columns, equal rows), so
// the bezier endpoints line up with the card centers at any board size.
// ============================================================

const VIEW_W = 1000;
const ROW_H = 100; // normalized height per layer band

const STATE_LABEL: Record<NodeState, string> = {
  mastered: "opanowane",
  in_progress: "w toku",
  available: "gotowe do startu",
  locked: "zablokowane",
};

/** Token-based accent color for a node state (no hardcoded hex, no glow). */
function stateColor(state: NodeState): string {
  switch (state) {
    case "mastered":
      return "var(--ok)";
    case "in_progress":
      return "var(--accent)";
    case "available":
      // Distinct from in_progress: same accent hue but used as outline only
      // (no token "info" color exists — closest tasteful token is the accent).
      return "var(--accent)";
    case "locked":
      return "var(--muted-2)";
  }
}

/** Normalized center of a node given its layer/order and the per-layer counts. */
function nodeCenter(
  layer: number,
  orderInLayer: number,
  nodesInLayer: number,
): { x: number; y: number } {
  const cols = Math.max(nodesInLayer, 1);
  const x = ((orderInLayer + 0.5) / cols) * VIEW_W;
  const y = layer * ROW_H + ROW_H / 2;
  return { x, y };
}

/** Group nodes into rows by layer (ascending), each row ordered by orderInLayer. */
function groupByLayer(nodes: TreeNode[]): TreeNode[][] {
  const byLayer = new Map<number, TreeNode[]>();
  for (const n of nodes) {
    const arr = byLayer.get(n.layer) ?? [];
    arr.push(n);
    byLayer.set(n.layer, arr);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  return layers.map((l) =>
    [...byLayer.get(l)!].sort((a, b) => a.orderInLayer - b.orderInLayer),
  );
}

export function SkillTreeView({
  tree,
  hrefForNode,
  showStates,
}: {
  tree: SkillTree;
  /** Link docelowy drill-in (zależny od roli). */
  hrefForNode: (skillId: string) => string;
  /** true: koloruj wg stanu (per-podopieczny); false: szkielet (autor). */
  showStates: boolean;
}): React.JSX.Element {
  if (tree.nodes.length === 0) {
    return (
      <div className="empty">
        <h3>Brak umiejętności w drzewie.</h3>
        <p className="muted text-sm" style={{ margin: 0 }}>
          Dodaj umiejętności i połącz je prerekwizytami, aby zobaczyć drzewo.
        </p>
      </div>
    );
  }

  const rows = groupByLayer(tree.nodes);
  const layerCount = rows.length;

  // Per-node geometry + per-node lookup, computed once from counts.
  const countByLayer = new Map<number, number>();
  for (const n of tree.nodes) {
    countByLayer.set(n.layer, (countByLayer.get(n.layer) ?? 0) + 1);
  }
  const centerById = new Map<string, { x: number; y: number }>();
  const stateById = new Map<string, NodeState>();
  for (const n of tree.nodes) {
    centerById.set(
      n.skillId,
      nodeCenter(n.layer, n.orderInLayer, countByLayer.get(n.layer) ?? 1),
    );
    stateById.set(n.skillId, n.state ?? "locked");
  }

  const viewH = Math.max(layerCount, 1) * ROW_H;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div style={{ position: "relative" }}>
        {/* Edge layer — behind the cards, decorative-but-labelled. */}
        <svg
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Połączenia prerekwizytów między umiejętnościami"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {tree.edges.map((e) => {
            const from = centerById.get(e.from); // węzeł zależny (niżej)
            const req = centerById.get(e.requires); // prerekwizyt (wyżej)
            if (!from || !req) return null;
            // Pionowy bezier: od prerekwizytu (góra) do zależnego (dół).
            const midY = (req.y + from.y) / 2;
            const d = `M${req.x},${req.y} C${req.x},${midY} ${from.x},${midY} ${from.x},${from.y}`;
            const sourceMastered =
              showStates && stateById.get(e.requires) === "mastered";
            const stroke = sourceMastered ? "var(--ok)" : "var(--line)";
            return (
              <path
                key={`${e.from}->${e.requires}`}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={sourceMastered ? undefined : "6 7"}
                opacity={sourceMastered ? 0.85 : 0.7}
              />
            );
          })}
        </svg>

        {/* Node rows — CSS grid, one row per layer. */}
        <div className="col" style={{ position: "relative", zIndex: 1, gap: 56 }}>
          {rows.map((row, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows indexed by layer position, stable
              key={`layer-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                gap: 24,
                justifyItems: "center",
              }}
            >
              {row.map((node) => (
                <NodeCard
                  key={node.skillId}
                  node={node}
                  href={hrefForNode(node.skillId)}
                  showStates={showStates}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {showStates ? <StateLegend /> : null}
    </div>
  );
}

// ============================================================
// NodeCard — a single skill, linking to its drill-in (variation ladder).
// ============================================================

function NodeCard({
  node,
  href,
  showStates,
}: {
  node: TreeNode;
  href: string;
  showStates: boolean;
}) {
  const state: NodeState = node.state ?? "locked";
  const color = stateColor(state);
  const isLocked = showStates && state === "locked";
  const isMastered = showStates && state === "mastered";
  const isInProgress = showStates && state === "in_progress";
  const isAvailable = showStates && state === "available";

  // Outline treatment differentiates available (accent ring) from in_progress
  // (accent ring + lighter weight) without inventing colors.
  const borderColor = !showStates
    ? "var(--line)"
    : isLocked
      ? "var(--line)"
      : color;

  return (
    <Link
      to={href}
      className="card card-hover"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 230,
        padding: 14,
        textAlign: "center",
        display: "block",
        borderColor,
        borderWidth: isMastered || isInProgress ? 1.5 : 1,
        opacity: isLocked ? 0.6 : 1,
      }}
      aria-label={
        showStates
          ? `${node.name} — ${STATE_LABEL[state]}`
          : `${node.name} — ${node.variationCount} wariantów`
      }
    >
      {showStates ? <StatePill state={state} /> : null}

      {/* Glyph tile — mono initial, no emoji (design-system rule). */}
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          margin: "4px auto 10px",
          borderRadius: "var(--radius)",
          display: "grid",
          placeItems: "center",
          background: "var(--surface-2)",
          border: `1px solid ${showStates && !isLocked ? color : "var(--line)"}`,
          color: showStates && !isLocked ? color : "var(--muted)",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 18,
        }}
      >
        {node.name.charAt(0).toUpperCase()}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: isLocked ? "var(--ink-2)" : "var(--ink)",
        }}
      >
        {node.name}
      </div>

      {/* Level indicator / skeleton variation count. */}
      <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>
        {showStates ? levelText(node) : `${node.variationCount} wariantów`}
      </div>

      {/* Progress bar — fill driven by state, accent-coded. */}
      {showStates ? (
        <div
          aria-hidden="true"
          style={{
            height: 6,
            borderRadius: "var(--radius-pill)",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            overflow: "hidden",
            marginTop: 9,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: "var(--radius-pill)",
              width: barFill(state, node),
              background: isInProgress ? "var(--accent)" : color,
            }}
          />
        </div>
      ) : null}
    </Link>
  );
}

/** Level line for the per-trainee view: "poziom n/m" + current variation hint. */
function levelText(node: TreeNode): string {
  const state: NodeState = node.state ?? "locked";
  if (state === "available") return "prereki spełnione";
  if (state === "locked") return "zablokowane";
  if (node.variationCount === 0) return "brak wariantów";
  // mastered/in_progress — we know there are events; show the exact level.
  const total = node.variationCount;
  return node.currentOrdinal != null ? `poziom ${node.currentOrdinal}/${total}` : `${total} poziomów`;
}

/** Bar fill width by state. mastered = full, available/locked = empty, in_progress = ordinal/total. */
function barFill(state: NodeState, node: TreeNode): string {
  if (state === "mastered") return "100%";
  if (state === "in_progress") {
    if (node.currentOrdinal != null && node.variationCount > 0) {
      return `${Math.round((node.currentOrdinal / node.variationCount) * 100)}%`;
    }
    return "40%";
  }
  return "0%";
}

// ============================================================
// StatePill — small mono uppercase pill, mirrors the system's `.badge`.
// ============================================================

function StatePill({ state }: { state: NodeState }) {
  const color = stateColor(state);
  const bg =
    state === "mastered"
      ? "var(--accent-soft)"
      : state === "in_progress"
        ? "var(--accent)"
        : state === "available"
          ? "var(--accent-soft)"
          : "var(--surface-2)";
  const ink =
    state === "in_progress"
      ? "var(--accent-ink)"
      : state === "locked"
        ? "var(--muted)"
        : color;
  return (
    <span
      style={{
        position: "absolute",
        top: -10,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        background: bg,
        color: ink,
        border: state === "in_progress" ? "1px solid transparent" : `1px solid ${color}`,
      }}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

// ============================================================
// StateLegend — color key + edge legend, matching SegmentedBarLegend idiom.
// ============================================================

function StateLegend() {
  const items: Array<{ state: NodeState }> = [
    { state: "mastered" },
    { state: "in_progress" },
    { state: "available" },
    { state: "locked" },
  ];
  return (
    <div
      className="row wrap"
      style={{ gap: 16, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}
    >
      {items.map(({ state }) => (
        <span key={state} className="row" style={{ gap: 6, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: stateColor(state),
            }}
          />
          <span>{STATE_LABEL[state]}</span>
        </span>
      ))}
      <span className="row" style={{ gap: 6, alignItems: "center" }}>
        <svg width={22} height={10} aria-hidden="true" style={{ display: "block" }}>
          <line
            x1={1}
            y1={5}
            x2={21}
            y2={5}
            stroke="var(--line)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </svg>
        <span>prowadzi do zablokowanej</span>
      </span>
    </div>
  );
}

// ============================================================
// VariationLadder — growy, pionowy tor wariantów jednej umiejętności
// (tuck → adv tuck → … → full). Współdzieli język wizualny z SkillTreeView:
// tokeny `var(--*)`, etykiety mono, hairline bordery, brak glow/emoji.
// Stany kroków: done (poniżej bieżącego, `--ok` + ptaszek), current (bieżący,
// `--accent` + pigułka „TU JESTEŚ"), locked/upcoming (powyżej bieżącego lub gdy
// brak bieżącego — przygaszone `--muted`). Czysta prezentacja, read-only.
// ============================================================

type LadderState = "done" | "current" | "locked";

/** Token-based accent color for a ladder step (no hardcoded hex, no glow). */
function ladderStepColor(state: LadderState): string {
  switch (state) {
    case "done":
      return "var(--ok)";
    case "current":
      return "var(--accent)";
    case "locked":
      return "var(--muted-2)";
  }
}

export function VariationLadder({
  variations,
}: {
  variations: Array<{
    id: string;
    ordinal: number;
    exerciseName: string;
    isCurrent: boolean;
  }>;
}): React.JSX.Element {
  if (variations.length === 0) {
    return (
      <span className="text-xs muted">
        Brak wariantów — uzupełnij w edytorze umiejętności.
      </span>
    );
  }

  const currentOrdinal = variations.find((v) => v.isCurrent)?.ordinal ?? null;
  const steps = [...variations].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <ol
      className="col"
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        gap: 0,
        position: "relative",
      }}
    >
      {steps.map((v, i) => {
        const state: LadderState = v.isCurrent
          ? "current"
          : currentOrdinal != null && v.ordinal < currentOrdinal
            ? "done"
            : "locked";
        const color = ladderStepColor(state);
        const isLast = i === steps.length - 1;
        return (
          <LadderStep
            key={v.id}
            ordinal={v.ordinal}
            exerciseName={v.exerciseName}
            state={state}
            color={color}
            isLast={isLast}
          />
        );
      })}
    </ol>
  );
}

function LadderStep({
  ordinal,
  exerciseName,
  state,
  color,
  isLast,
}: {
  ordinal: number;
  exerciseName: string;
  state: LadderState;
  color: string;
  isLast: boolean;
}) {
  const isCurrent = state === "current";
  const isDone = state === "done";
  const isLocked = state === "locked";

  // Connector segment color: solid accent/ok up to the current step, dashed
  // hairline above it (the not-yet-reached part of the path).
  const connectorReached = isDone || isCurrent;

  return (
    <li
      className="row"
      style={{
        gap: 12,
        alignItems: "stretch",
        opacity: isLocked ? 0.6 : 1,
      }}
      aria-current={isCurrent ? "step" : undefined}
    >
      {/* Rail: node + vertical connector to the next step. */}
      <div
        aria-hidden="true"
        className="col"
        style={{
          alignItems: "center",
          gap: 0,
          flexShrink: 0,
          width: 28,
          paddingTop: 2,
        }}
      >
        {/* Node marker — mono ordinal, or check for done, accent ring for current. */}
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-pill)",
            border: `${isCurrent ? 2 : 1}px solid ${isLocked ? "var(--line)" : color}`,
            background: isCurrent
              ? "var(--accent)"
              : isDone
                ? "var(--accent-soft)"
                : "var(--surface-2)",
            color: isCurrent
              ? "var(--accent-ink)"
              : isDone
                ? "var(--ok)"
                : "var(--muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {isDone ? <Icons.Check style={{ width: 14, height: 14 }} /> : ordinal}
        </span>
        {/* Vertical connector down to the next node (omit on last step). */}
        {!isLast ? (
          <span
            style={{
              flex: 1,
              width: connectorReached ? 2 : 0,
              minHeight: 18,
              marginTop: 2,
              marginBottom: 2,
              background: connectorReached ? color : "transparent",
              borderLeft: connectorReached ? undefined : "2px dashed var(--line)",
            }}
          />
        ) : null}
      </div>

      {/* Label block. */}
      <div
        className="col"
        style={{
          gap: 4,
          paddingBottom: isLast ? 0 : 14,
          minWidth: 0,
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: isCurrent ? 600 : 500,
              fontSize: 14,
              letterSpacing: "-0.01em",
              color: isLocked ? "var(--ink-2)" : "var(--ink)",
            }}
          >
            <span className="mono" style={{ color: isLocked ? "var(--muted)" : color }}>
              {ordinal}.
            </span>{" "}
            {exerciseName}
          </span>
          {isCurrent ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--radius-pill)",
                whiteSpace: "nowrap",
                background: "var(--accent)",
                color: "var(--accent-ink)",
                border: "1px solid transparent",
              }}
            >
              Tu jesteś
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
