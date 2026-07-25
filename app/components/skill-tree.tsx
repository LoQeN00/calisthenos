import { Link } from "react-router";
import { Icons } from "~/components/icons";
import {
  DEFAULT_METRICS,
  VIEW_W,
  buildPyramid,
  layoutPyramid,
  type PyramidBandBox,
} from "~/lib/skill-pyramid";
import { TIER_LABEL, highestEarnedTier, type SkillTier } from "~/lib/skill-tier";
import type { SkillTree, TreeNode } from "~/lib/skill-tree";
import type { NodeState } from "~/lib/skill-tree-math";

// ============================================================
// SkillTreeView — piramida umiejętności. Fundament (PODSTAWOWY) na dole,
// EKSPERT na szczycie; każdy wyższy pas jest węższy.
//
// Dwa kodowania na jednej karcie, na różnych warstwach:
//   • TIER → ciężar karty (płaski well → hairline → 1.5px → inwersja atramentowa)
//   • STAN → akcent (kafel z inicjałem, linia poziomu, pasek postępu)
// Lime jest zarezerwowany dla postępu podopiecznego — nigdy nie oznacza tieru.
//
// Karta w piramidzie jest węższa niż w dawnym układzie warstwowym, więc pigułka
// stanu nad kartą znika: przy czterech kartach w rzędzie na telefonie napis
// „gotowe do startu" i tak by się nie zmieścił. Stan niesie kolor kafla, linia
// poziomu, pasek postępu i legenda pod planszą; pełną nazwę stanu dostaje
// czytnik ekranu przez aria-label.
//
// MODEL WSPÓŁRZĘDNYCH
// -------------------
// Geometrię liczy `layoutPyramid` (czysta funkcja, testowana jednostkowo):
// oś X w jednostkach 0..VIEW_W (rozciągana na szerokość planszy), oś Y w px 1:1.
// Karty pozycjonowane absolutnie w procentach X i pikselach Y; SVG krawędzi ma
// viewBox 0 0 VIEW_W totalH z preserveAspectRatio="none". Dzięki temu końce
// beziera trafiają w środki kart przy każdej szerokości — bez pomiaru DOM,
// bez useEffect, bezpiecznie w SSR.
// ============================================================

/**
 * Ile razy szerzej od minimum wolno rozciągnąć planszę. Bez sufitu na szerokim
 * monitorze karty rozjeżdżają się w rzadką siatkę i sylwetka piramidy ginie —
 * `.pyramid-board { margin: 0 auto }` dopiero z tym limitem ma co centrować.
 */
const BOARD_SLACK = 1.35;

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
      // Ten sam odcień co in_progress (brak osobnego tokenu "info") — stany
      // odróżniają się nie kolorem, tylko formą: kontur zamiast wypełnienia
      // w legendzie (StateLegend) i pusty pasek postępu (0%) na karcie.
      return "var(--accent)";
    case "locked":
      return "var(--muted-2)";
  }
}

export function SkillTreeView({
  tree,
  hrefForNode,
}: {
  tree: SkillTree;
  /** Link docelowy drill-in (zależny od roli). */
  hrefForNode: (skillId: string) => string;
}): React.JSX.Element {
  if (tree.nodes.length === 0) {
    return (
      <div className="empty">
        <h3>Brak umiejętności w drzewie.</h3>
        <p className="muted text-sm" style={{ margin: 0 }}>
          Dodaj umiejętności i połącz je prerekwizytami, aby zobaczyć piramidę.
        </p>
      </div>
    );
  }

  const bands = buildPyramid(
    tree.nodes.map((n) => ({ id: n.skillId, name: n.name, tier: n.tier })),
    tree.edges,
  );
  const layout = layoutPyramid(bands, DEFAULT_METRICS);

  const nodeById = new Map(tree.nodes.map((n) => [n.skillId, n]));
  const stateById = new Map(tree.nodes.map((n) => [n.skillId, n.state ?? "locked"]));

  // Liczniki per pas — „4/6" na railu płyty.
  const countsByTier = new Map<SkillTier, { total: number; mastered: number }>();
  for (const n of tree.nodes) {
    const c = countsByTier.get(n.tier) ?? { total: 0, mastered: 0 };
    c.total += 1;
    if ((n.state ?? "locked") === "mastered") c.mastered += 1;
    countsByTier.set(n.tier, c);
  }

  // `layout.bands` idzie od góry planszy; opóźnienie animacji ma rosnąć OD DOŁU.
  const revealOf = (i: number) => layout.bands.length - 1 - i;

  const cols = layout.boardCols.toFixed(2);

  return (
    <div className="col" style={{ gap: 18 }}>
      <PyramidProgress nodes={tree.nodes} />

      <div className="pyramid-scroll">
        <div
          className="pyramid-board"
          style={{
            height: layout.totalH,
            minWidth: `calc(var(--pyramid-col) * ${cols})`,
            maxWidth: `max(420px, var(--pyramid-col) * ${cols} * ${BOARD_SLACK})`,
          }}
        >
          {layout.bands.map((box, i) => (
            <BandPlate
              key={box.tier}
              box={box}
              counts={countsByTier.get(box.tier) ?? { total: 0, mastered: 0 }}
              reveal={revealOf(i)}
            />
          ))}

          <svg
            className="pyramid-edges"
            viewBox={`0 0 ${VIEW_W} ${layout.totalH}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Połączenia prerekwizytów między umiejętnościami"
            style={
              {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: layout.totalH,
                pointerEvents: "none",
                zIndex: 1,
                // Krawędzie pojawiają się po wszystkich pasach.
                "--reveal": layout.bands.length,
              } as React.CSSProperties
            }
          >
            {tree.edges.map((e) => {
              const from = layout.centers.get(e.from); // węzeł zależny (wyżej)
              const req = layout.centers.get(e.requires); // prerekwizyt (niżej)
              if (!from || !req) return null;

              // Krawędź odwrócona: prereq leży WYŻEJ na planszy (mniejsze y) niż to,
              // co odblokowuje. Wystarczy porównać y — w obrębie pasa podrząd liczy
              // się z tych samych krawędzi, więc fałszywy alarm jest niemożliwy.
              const reversed = req.y < from.y;

              const sourceMastered = stateById.get(e.requires) === "mastered";
              const bothMastered = sourceMastered && stateById.get(e.from) === "mastered";

              const midY = (req.y + from.y) / 2;
              const d = `M${req.x},${req.y} C${req.x},${midY} ${from.x},${midY} ${from.x},${from.y}`;

              const stroke = reversed
                ? "var(--warn)"
                : sourceMastered
                  ? "var(--ok)"
                  : "var(--line)";
              const dash = reversed ? "2 6" : sourceMastered ? undefined : "6 7";

              return (
                <path
                  key={`${e.from}->${e.requires}`}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={bothMastered ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  // Oś X jest skalowana szerokością planszy, oś Y nie — bez tego
                  // ta sama krawędź byłaby chudsza na wąskim ekranie i grubsza na
                  // szerokim, a kreski przerywane rozciągałyby się razem z nią.
                  vectorEffect="non-scaling-stroke"
                  opacity={bothMastered ? 1 : sourceMastered ? 0.85 : 0.7}
                />
              );
            })}
          </svg>

          {[...layout.centers].map(([skillId, c]) => {
            const node = nodeById.get(skillId);
            if (!node) return null;
            const bandIndex = layout.bands.findIndex((b) => b.tier === node.tier);
            return (
              <NodeCard
                key={skillId}
                node={node}
                href={hrefForNode(skillId)}
                x={c.x}
                y={c.y}
                reveal={revealOf(bandIndex < 0 ? 0 : bandIndex)}
              />
            );
          })}
        </div>
      </div>

      <StateLegend />
    </div>
  );
}

// ============================================================
// PyramidProgress — nagłówek dumy: ile zdobyte, jak wysoko, ile w toku.
// ============================================================

function PyramidProgress({ nodes }: { nodes: TreeNode[] }) {
  const total = nodes.length;
  const mastered = nodes.filter((n) => (n.state ?? "locked") === "mastered").length;
  const inProgress = nodes.filter((n) => (n.state ?? "locked") === "in_progress").length;
  const top = highestEarnedTier(
    nodes.map((n) => ({ tier: n.tier, mastered: (n.state ?? "locked") === "mastered" })),
  );

  return (
    <div className="card row wrap" style={{ gap: 32, padding: 16 }}>
      <div className="stat">
        <div className="v mono">
          {mastered}/{total}
        </div>
        <div className="k">Opanowane</div>
      </div>
      <div className="stat">
        <div className="v" style={{ fontSize: 18, lineHeight: 1.4 }}>
          {top === null ? "—" : TIER_LABEL[top]}
        </div>
        <div className="k">Najwyższy zdobyty tier</div>
      </div>
      <div className="stat">
        <div className="v mono">{inProgress}</div>
        <div className="k">W toku</div>
      </div>
    </div>
  );
}

// ============================================================
// BandPlate — płyta jednego pasa: well + rail z nazwą tieru i licznikiem.
// ============================================================

function BandPlate({
  box,
  counts,
  reveal,
}: {
  box: PyramidBandBox;
  counts: { total: number; mastered: number };
  reveal: number;
}) {
  return (
    <div
      className="pyramid-band"
      style={
        {
          left: `${(box.x0 / VIEW_W) * 100}%`,
          width: `${((box.x1 - box.x0) / VIEW_W) * 100}%`,
          top: box.y,
          height: box.h,
          "--reveal": reveal,
        } as React.CSSProperties
      }
    >
      <div className="pyramid-band-head">
        <span className="uppercase-label">{TIER_LABEL[box.tier]}</span>
        <span className="mono text-xs muted">
          {counts.mastered}/{counts.total}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// NodeCard — jedna umiejętność, link do drabiny wariantów.
// ============================================================

function NodeCard({
  node,
  href,
  x,
  y,
  reveal,
}: {
  node: TreeNode;
  href: string;
  x: number;
  y: number;
  reveal: number;
}) {
  const state: NodeState = node.state ?? "locked";
  const color = stateColor(state);
  const isLocked = state === "locked";
  const isInProgress = state === "in_progress";
  const isExpert = node.tier === "expert";

  // Na karcie atramentowej `--muted` daje 3.9:1 (jasny) / 2.9:1 (ciemny) —
  // za mało. `--muted-2` odwraca się razem z motywem tak samo jak `--ink`,
  // więc czyta się na obu. Ta sama zamiana co dla `.pyramid-node-sub` w CSS.
  const mutedInk = isExpert ? "var(--muted-2)" : "var(--muted)";

  return (
    <Link
      to={href}
      data-tier={node.tier}
      className={`card card-hover pyramid-node${isLocked ? " pyramid-node-locked" : ""}`}
      style={
        {
          left: `${(x / VIEW_W) * 100}%`,
          top: y,
          zIndex: 2,
          "--reveal": reveal,
        } as React.CSSProperties
      }
      aria-label={`${node.name} — ${TIER_LABEL[node.tier]}, ${STATE_LABEL[state]}`}
    >
      {/* Kafel z inicjałem — bez emoji (reguła design-systemu). */}
      <div
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          margin: "0 auto 7px",
          borderRadius: "var(--radius)",
          display: "grid",
          placeItems: "center",
          background: isExpert ? "transparent" : "var(--surface-2)",
          border: `1px solid ${isLocked ? "var(--line)" : color}`,
          color: isLocked ? mutedInk : color,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        {node.name.charAt(0).toUpperCase()}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 12.5,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          overflowWrap: "anywhere",
        }}
      >
        {node.name}
      </div>

      {/* Kolor CELOWO w CSS, nie inline: styl inline wygrałby z regułą
          kontrastu `.pyramid-node[data-tier="expert"] .pyramid-node-sub`. */}
      <div className="mono pyramid-node-sub" style={{ fontSize: 10.5, marginTop: 4 }}>
        {levelText(node)}
      </div>

      {/* Rowek i jego wypełnienie stylowane w CSS — tło rowka musi dać się
          nadpisać na karcie odwróconej, a inline by na to nie pozwolił. */}
      <div aria-hidden="true" className="pyramid-node-bar">
        <div
          style={{
            width: barFill(state, node),
            background: isInProgress ? "var(--accent)" : color,
          }}
        />
      </div>
    </Link>
  );
}

/** Linia poziomu: "poziom n/m" albo status, gdy umiejętność nieprzypisana. */
function levelText(node: TreeNode): string {
  const state: NodeState = node.state ?? "locked";
  if (state === "available") return "gotowe";
  if (state === "locked") return "zablokowane";
  if (node.variationCount === 0) return "brak wariantów";
  return node.currentOrdinal != null
    ? `poziom ${node.currentOrdinal}/${node.variationCount}`
    : `${node.variationCount} poziomów`;
}

/** Wypełnienie paska wg stanu. mastered = pełny, available/locked = pusty. */
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
// StateLegend — klucz kolorów stanu + legenda krawędzi.
// ============================================================

function StateLegend() {
  const items: NodeState[] = ["mastered", "in_progress", "available", "locked"];
  return (
    <div
      className="row wrap"
      style={{ gap: 16, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}
    >
      {items.map((state) => (
        <span key={state} className="row" style={{ gap: 6, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: state === "available" ? "transparent" : stateColor(state),
              border: state === "available" ? "1px solid var(--accent)" : undefined,
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
        <span>prerekwizyt nieopanowany</span>
      </span>
      <span className="row" style={{ gap: 6, alignItems: "center" }}>
        <svg width={22} height={10} aria-hidden="true" style={{ display: "block" }}>
          <line
            x1={1}
            y1={5}
            x2={21}
            y2={5}
            stroke="var(--warn)"
            strokeWidth={2}
            strokeDasharray="2 4"
          />
        </svg>
        <span>prerekwizyt trudniejszy — do poprawy</span>
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
      <span className="text-xs muted">Brak wariantów — uzupełnij w edytorze umiejętności.</span>
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
            color: isCurrent ? "var(--accent-ink)" : isDone ? "var(--ok)" : "var(--muted)",
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
