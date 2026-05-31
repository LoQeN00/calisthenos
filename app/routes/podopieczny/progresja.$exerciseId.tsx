import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import {
  ProgressionLineChart,
  RepsVsEffortChart,
  VolumeBars,
} from "~/components/progression-charts";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const exerciseId = args.params.exerciseId ?? "";
  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view = await getExerciseProgression(db, user.id, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { view, range };
}

const RANGE_LABELS: Array<{ value: ProgressionRange; label: string }> = [
  { value: "4w", label: "4 tyg" },
  { value: "3m", label: "3 mies" },
  { value: "6m", label: "6 mies" },
  { value: "all", label: "cały" },
];

/** Format a value by unit ("12" vs "30 s"). */
function fmtByUnit(value: number, unit: "REPS" | "SEC"): string {
  return unit === "SEC" ? `${value} s` : `${value}`;
}

export default function TraineeProgresjaDetail() {
  const { view, range } = useLoaderData<typeof loader>();
  const { exercise, kpis, points, granularity } = view;
  const { unit } = exercise;

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/progresja">Progresja</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny · Progresja
          </div>
          <h1 className="row" style={{ gap: 10, alignItems: "center" }}>
            {exercise.name}
            <span className={`badge ${unit === "REPS" ? "reps" : "sec"}`}>{unit}</span>
          </h1>
          <div className="sub">Najlepsza seria, objętość i wysiłek w czasie.</div>
        </div>
      </div>

      {/* Range switcher — loader-driven via ?zakres= */}
      <div className="row wrap" style={{ gap: 6, marginBottom: 18 }}>
        {RANGE_LABELS.map((r) => {
          const active = r.value === range;
          return (
            <Link
              key={r.value}
              to={`?zakres=${r.value}`}
              preventScrollReset
              className="btn btn-sm"
              aria-pressed={active}
              style={
                active
                  ? {
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                      borderColor: "transparent",
                      fontWeight: 600,
                      textDecoration: "none",
                    }
                  : { textDecoration: "none" }
              }
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {/* KPI strip */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <KpiTile label="Rekord (PR)">
          <div className="stat-num">{fmtByUnit(kpis.pr, unit)}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            {fmtDate(kpis.prAchievedOn)}
          </div>
        </KpiTile>

        <KpiTile label="Ostatnia sesja">
          <div className="stat-num">{fmtByUnit(kpis.lastBest, unit)}</div>
          <div style={{ marginTop: 6 }}>
            <Delta delta={kpis.lastDelta} />
          </div>
        </KpiTile>

        <KpiTile label="Zmiana w okresie">
          <div
            className="stat-num"
            style={{
              color:
                kpis.periodChangePct == null
                  ? "var(--ink)"
                  : kpis.periodChangePct > 0
                    ? "var(--ok)"
                    : kpis.periodChangePct < 0
                      ? "var(--danger)"
                      : "var(--ink)",
            }}
          >
            {kpis.periodChangePct == null
              ? "—"
              : `${kpis.periodChangePct > 0 ? "+" : ""}${kpis.periodChangePct}%`}
          </div>
        </KpiTile>

        <KpiTile label="Sesje w okresie">
          <div className="stat-num">{kpis.sessionsInRange}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            śr. RPE {kpis.avgRpeInRange ?? "—"}
          </div>
        </KpiTile>
      </div>

      {/* Hero chart */}
      <section style={{ marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <div
            className="row between"
            style={{ alignItems: "baseline", marginBottom: 12, gap: 8 }}
          >
            <h2 style={{ fontSize: 16 }}>Najmocniejsza seria w sesji</h2>
            {granularity === "week" && (
              <span className="text-xs muted">ujęcie tygodniowe</span>
            )}
          </div>
          <ProgressionLineChart points={points} unit={unit} />
        </div>
      </section>

      {/* Volume + reps-vs-effort */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}
      >
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Objętość pracy</h2>
          <VolumeBars points={points} />
        </div>
        {kpis.avgRpeInRange != null && (
          <div className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Siła = lżej</h2>
            <RepsVsEffortChart points={points} />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card stat" style={{ padding: 16 }}>
      <div className="k">{label}</div>
      {children}
    </div>
  );
}

/** Colored ▲/▼ delta vs the previous session; "—" when 0 or null. */
function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <span className="text-xs muted">—</span>;
  }
  const up = delta > 0;
  return (
    <span
      className="mono"
      style={{ fontSize: 13, fontWeight: 600, color: up ? "var(--ok)" : "var(--danger)" }}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {delta}
    </span>
  );
}
