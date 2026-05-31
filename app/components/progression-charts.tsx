import type { ComparisonSeries } from "~/lib/progression";
import type { ChartPoint, ProgressionStatus } from "~/lib/progression-math";

// ============================================================
// Progression charts — hand-rolled SVG, matching stat-widgets.tsx idiom:
// all colors via var(--*), numbers in var(--font-mono), role="img" +
// aria-label, responsive viewBox, shared "za mało danych" empty state.
// Pure presentation: no data fetching, no router imports.
// ============================================================

type Unit = "REPS" | "SEC";

/** Shared empty-state span, matching stat-widgets.tsx Sparkline. */
function NotEnough({ text = "za mało danych" }: { text?: string }) {
  return (
    <span className="muted text-xs" style={{ fontStyle: "italic" }}>
      {text}
    </span>
  );
}

/** Color a dot by mean RPE: easy → green, mid → amber, hard → red. */
function rpeColor(avgRpe: number | null): string {
  if (avgRpe == null) return "var(--muted)";
  if (avgRpe < 7) return "var(--ok)";
  if (avgRpe < 9) return "var(--warn)";
  return "var(--danger)";
}

/** Format a best value by unit ("12" vs "30 s"). */
function fmtBest(best: number, unit: Unit): string {
  return unit === "SEC" ? `${best} s` : `${best}`;
}

// ============================================================
// 1. ProgressionLineChart — hero: best set per session over time.
// ============================================================

export function ProgressionLineChart({
  points,
  unit,
  height = 220,
}: {
  points: ChartPoint[];
  unit: Unit;
  height?: number;
}) {
  if (points.length < 2) return <NotEnough />;

  const W = 640;
  const padL = 16;
  const padR = 16;
  const padT = 26; // room for the PR label above the top dot
  const padB = 22; // room for the X labels below the baseline

  const plotW = W - padL - padR;
  const plotH = height - padT - padB;

  const bests = points.map((p) => p.best);
  const min = Math.min(...bests);
  const max = Math.max(...bests);
  // Pad the value domain so the line isn't glued to the edges.
  const span = Math.max(max - min, 1);
  const yMin = min - span * 0.12;
  const yMax = max + span * 0.12;
  const yRange = Math.max(yMax - yMin, 1);

  const stepX = plotW / (points.length - 1);
  const xAt = (i: number) => padL + i * stepX;
  const yAt = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH;

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.best), p }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  // The in-view PR: the (first) point reaching the maximum best.
  const prIndex = bests.indexOf(max);

  const baselineY = padT + plotH;
  const midY = padT + plotH / 2;

  // Sparse X labels: first, middle, last.
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label="Wykres rekordu w czasie"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {/* Dashed mid gridline */}
      <line
        x1={padL}
        y1={midY}
        x2={W - padR}
        y2={midY}
        stroke="var(--line)"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.6}
      />
      {/* Y axis */}
      <line x1={padL} y1={padT} x2={padL} y2={baselineY} stroke="var(--line)" strokeWidth={1} />
      {/* X baseline */}
      <line
        x1={padL}
        y1={baselineY}
        x2={W - padR}
        y2={baselineY}
        stroke="var(--line)"
        strokeWidth={1}
      />

      {/* Value line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Dots, colored by RPE; PR dot enlarged with white stroke + label. */}
      {coords.map(({ x, y, p }, i) => {
        const isPr = i === prIndex;
        return (
          <g key={p.key}>
            <circle
              cx={x}
              cy={y}
              r={isPr ? 7 : 3.5}
              fill={rpeColor(p.avgRpe)}
              stroke={isPr ? "#ffffff" : "none"}
              strokeWidth={isPr ? 1.5 : 0}
            >
              <title>
                {p.label}: {fmtBest(p.best, unit)} · RPE {p.avgRpe ?? "—"}
              </title>
            </circle>
            {isPr && (
              <text
                x={x}
                y={y - 12}
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="var(--ink)"
                fontWeight={600}
                textAnchor="middle"
              >
                {fmtBest(p.best, unit)}
              </text>
            )}
          </g>
        );
      })}

      {/* Sparse X labels */}
      {labelIdx.map((i) => {
        const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
        return (
          <text
            key={points[i]!.key}
            x={xAt(i)}
            y={height - 6}
            fontSize={10}
            fontFamily="var(--font-mono)"
            fill="var(--muted)"
            textAnchor={anchor}
          >
            {points[i]!.label}
          </text>
        );
      })}
    </svg>
  );
}

// ============================================================
// 2. VolumeBars — one bar per session, height ∝ volume.
// ============================================================

export function VolumeBars({
  points,
  height = 90,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  if (points.length === 0) return <NotEnough />;

  const W = 640;
  const padB = 2;
  const plotH = height - padB;
  const max = Math.max(...points.map((p) => p.volume), 1);

  const gap = points.length > 1 ? 4 : 0;
  const barW = (W - gap * (points.length - 1)) / points.length;
  const lastIdx = points.length - 1;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label="Objętość treningowa w czasie"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {points.map((p, i) => {
        const h = Math.max((p.volume / max) * plotH, p.volume > 0 ? 2 : 0);
        const x = i * (barW + gap);
        const y = plotH - h;
        // Mark the latest bar with a darker lime so "now" stands out.
        const fill = i === lastIdx ? "#9bbf2e" : "var(--accent)";
        return (
          <rect key={p.key} x={x} y={y} width={barW} height={h} rx={3} ry={3} fill={fill}>
            <title>
              {p.label}: {p.volume}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

// ============================================================
// 3. RepsVsEffortChart — best vs avgRpe over the same X.
// ============================================================

export function RepsVsEffortChart({
  points,
  height = 90,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  if (points.length < 2) return <NotEnough />;

  const rpePoints = points
    .map((p, i) => ({ i, avgRpe: p.avgRpe }))
    .filter((x): x is { i: number; avgRpe: number } => x.avgRpe != null);
  const hasRpe = rpePoints.length >= 2;

  const W = 640;
  const padL = 4;
  const padR = 4;
  const padY = 6;
  const plotW = W - padL - padR;
  const plotH = height - padY * 2;

  const stepX = plotW / (points.length - 1);
  const xAt = (i: number) => padL + i * stepX;

  // best on its own min/max domain
  const bests = points.map((p) => p.best);
  const bMin = Math.min(...bests);
  const bMax = Math.max(...bests);
  const bRange = Math.max(bMax - bMin, 1);
  const bestY = (v: number) => padY + plotH - ((v - bMin) / bRange) * plotH;

  // RPE on a fixed 1–10 domain
  const rpeY = (v: number) => padY + plotH - ((v - 1) / 9) * plotH;

  const bestPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${bestY(p.best).toFixed(1)}`)
    .join(" ");
  const rpePath = hasRpe
    ? rpePoints
        .map((x, k) => `${k === 0 ? "M" : "L"}${xAt(x.i).toFixed(1)},${rpeY(x.avgRpe).toFixed(1)}`)
        .join(" ")
    : "";

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label="Powtórzenia względem wysiłku"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <path
          d={bestPath}
          fill="none"
          stroke="#9bbf2e"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hasRpe && (
          <path
            d={rpePath}
            fill="none"
            stroke="var(--danger)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="row wrap" style={{ gap: 12, fontSize: 11, marginTop: 8 }}>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <LegendDot color="#9bbf2e" />
          <span className="muted">powtórzenia</span>
        </div>
        {hasRpe && (
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <LegendDot color="var(--danger)" />
            <span className="muted">wysiłek (RPE)</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small square legend swatch, mirroring SegmentedBarLegend in stat-widgets. */
function LegendDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 2,
        background: color,
      }}
    />
  );
}

// ============================================================
// 4. ComparisonChart — multiple exercises on one % timeline.
// ============================================================

// Categorical palette for overlaid comparison lines — distinct hues, not theme tokens.
const COMPARE_COLORS = ["var(--ink)", "#3f6212", "var(--warn)", "var(--muted)", "var(--danger)"];

export function ComparisonChart({
  series,
  height = 220,
}: {
  series: ComparisonSeries[];
  height?: number;
}) {
  if (series.length === 0) {
    return <NotEnough text="wybierz co najmniej 2 ćwiczenia do porównania" />;
  }

  const W = 640;
  const padL = 38; // room for Y % labels
  const padR = 12;
  const padT = 10;
  const padB = 8;
  const plotW = W - padL - padR;
  const plotH = height - padT - padB;

  // X domain: absolute time across all series.
  const allTimes: number[] = [];
  const allPct: number[] = [];
  for (const s of series) {
    for (const pt of s.points) {
      allTimes.push(new Date(pt.performedOn).getTime());
      allPct.push(pt.pct);
    }
  }
  if (allTimes.length === 0) {
    return <NotEnough text="brak punktów do porównania" />;
  }

  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const tRange = Math.max(tMax - tMin, 1);
  const xAt = (t: number) => padL + ((t - tMin) / tRange) * plotW;

  // Y domain: percent, always including 0.
  const pMin = Math.min(0, ...allPct);
  const pMax = Math.max(...allPct, 0);
  const pRange = Math.max(pMax - pMin, 1);
  const yAt = (pct: number) => padT + plotH - ((pct - pMin) / pRange) * plotH;

  const fmtPct = (pct: number) => `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;

  // Gridlines / Y labels: a few evenly-spaced ticks plus the 0 baseline.
  const ticks = [pMin, pMin + pRange / 2, pMax];
  const baselineY = yAt(0);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label="Porównanie progresji ćwiczeń"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {/* Faint gridlines + Y labels */}
      {ticks.map((t) => {
        const y = yAt(t);
        return (
          <g key={t}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="var(--line)"
              strokeWidth={1}
              opacity={0.5}
            />
            <text
              x={padL - 6}
              y={y + 3}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--muted)"
              textAnchor="end"
            >
              {fmtPct(t)}
            </text>
          </g>
        );
      })}

      {/* Solid 0% baseline */}
      <line
        x1={padL}
        y1={baselineY}
        x2={W - padR}
        y2={baselineY}
        stroke="var(--line-2)"
        strokeWidth={1.5}
      />

      {/* One polyline per series + end dot */}
      {series.map((s, si) => {
        const color = COMPARE_COLORS[si % COMPARE_COLORS.length]!;
        const pts = s.points.map((pt) => ({
          x: xAt(new Date(pt.performedOn).getTime()),
          y: yAt(pt.pct),
        }));
        if (pts.length === 0) return null;
        const path = pts
          .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
          .join(" ");
        const last = pts[pts.length - 1]!;
        return (
          <g key={s.exerciseId}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={last.x} cy={last.y} r={3} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

/** Legend for ComparisonChart — series name + color, English names as-is. */
export function ComparisonChartLegend({ series }: { series: ComparisonSeries[] }) {
  return (
    <div className="row wrap" style={{ gap: 12, fontSize: 11, marginTop: 8 }}>
      {series.map((s, si) => (
        <div key={s.exerciseId} className="row" style={{ gap: 6, alignItems: "center" }}>
          <LegendDot color={COMPARE_COLORS[si % COMPARE_COLORS.length]!} />
          <span className="muted">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 5. ProgressionStatusBadge — small pill describing trend.
// ============================================================

const STATUS_META: Record<
  ProgressionStatus,
  { text: string; color: string; bg: string; ink: string }
> = {
  up: {
    text: "▲ rośnie",
    color: "var(--ok)",
    bg: "rgba(47, 158, 106, 0.14)",
    ink: "var(--ok)",
  },
  flat: {
    text: "= stabilnie",
    color: "var(--muted)",
    bg: "var(--surface-2)",
    ink: "var(--muted)",
  },
  down: {
    text: "▼ spadek",
    color: "var(--danger)",
    bg: "rgba(226, 92, 58, 0.14)",
    ink: "var(--danger)",
  },
  new: {
    text: "nowe",
    color: "var(--accent)",
    bg: "var(--accent-soft)",
    ink: "var(--accent-ink)",
  },
};

export function ProgressionStatusBadge({ status }: { status: ProgressionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        background: m.bg,
        color: m.ink,
        whiteSpace: "nowrap",
      }}
    >
      {m.text}
    </span>
  );
}
