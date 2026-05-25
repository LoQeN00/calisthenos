import type { HeatmapDay } from "~/lib/stats";

// ============================================================
// Heatmap — GitHub-style daily activity grid. 7 rows × N week-cols.
// ============================================================

interface HeatmapProps {
  /** Days ordered chronologically; length must be a multiple of 7. */
  days: HeatmapDay[];
  /** Pixel size of each cell side. */
  cellSize?: number;
  /** Gap between cells. */
  cellGap?: number;
}

export function Heatmap({ days, cellSize = 12, cellGap = 3 }: HeatmapProps) {
  if (days.length === 0) return null;
  const weeks = Math.ceil(days.length / 7);
  const width = weeks * (cellSize + cellGap) - cellGap;
  const height = 7 * (cellSize + cellGap) - cellGap;

  const monthLabels = computeMonthLabels(days, cellSize + cellGap);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 2 }}>
      <svg
        width={width}
        height={height + 16}
        viewBox={`0 0 ${width} ${height + 16}`}
        role="img"
        aria-label="Heatmapa aktywności"
        style={{ display: "block" }}
      >
        {monthLabels.map((m) => (
          <text
            key={`${m.label}-${m.x}`}
            x={m.x}
            y={10}
            fontSize={9}
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {m.label}
          </text>
        ))}
        <g transform="translate(0, 16)">
          {days.map((day, i) => {
            const weekIdx = Math.floor(i / 7);
            const dayIdx = i % 7;
            const x = weekIdx * (cellSize + cellGap);
            const y = dayIdx * (cellSize + cellGap);
            return (
              <rect
                key={day.date}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={2}
                ry={2}
                fill={colorForCount(day.count)}
              >
                <title>
                  {day.date}: {day.count === 0 ? "brak" : `${day.count} sesji`}
                </title>
              </rect>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function colorForCount(count: number): string {
  if (count === 0) return "var(--surface-2)";
  if (count === 1) return "var(--accent-soft)";
  if (count === 2) return "var(--accent)";
  return "var(--ok)";
}

function computeMonthLabels(
  days: HeatmapDay[],
  weekColWidth: number,
): Array<{ label: string; x: number }> {
  const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
  const labels: Array<{ label: string; x: number }> = [];
  let lastMonth = -1;
  for (let i = 0; i < days.length; i += 7) {
    const d = new Date(days[i]!.date);
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      labels.push({ label: MONTHS[m]!, x: (i / 7) * weekColWidth });
      lastMonth = m;
    }
  }
  return labels;
}

// ============================================================
// Sparkline — polyline + dots, single value series.
// ============================================================

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showLastDot?: boolean;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = "var(--accent)",
  fill = "var(--accent-soft)",
  showLastDot = true,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <span
        className="muted text-xs"
        style={{ fontStyle: "italic" }}
      >
        za mało danych
      </span>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width.toFixed(1)},${height} L0,${height} Z`;
  const last = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d={areaPath} fill={fill} opacity={0.5} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showLastDot && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}

// ============================================================
// SegmentedBar — colored horizontal bar with proportional segments.
// ============================================================

export interface BarSegment {
  label: string;
  value: number;
  color: string;
}

export function SegmentedBar({
  segments,
  height = 10,
}: {
  segments: BarSegment[];
  height?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return (
      <div
        style={{
          height,
          background: "var(--surface-2)",
          borderRadius: 999,
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: 999,
        overflow: "hidden",
        background: "var(--surface-2)",
      }}
    >
      {segments.map((s) => {
        const pct = (s.value / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={s.label}
            style={{
              width: `${pct}%`,
              background: s.color,
            }}
            title={`${s.label}: ${s.value} (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>
  );
}

export function SegmentedBarLegend({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div
      className="row wrap"
      style={{ gap: 12, fontSize: 11, marginTop: 8 }}
    >
      {segments.map((s) => {
        const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
        return (
          <div
            key={s.label}
            className="row"
            style={{ gap: 6, alignItems: "center" }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: s.color,
              }}
            />
            <span className="muted">{s.label}</span>
            <span className="mono">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
