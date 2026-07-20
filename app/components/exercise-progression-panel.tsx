import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ProgressionLineChart, VolumeBars } from "~/components/progression-charts";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { fmtDate } from "~/lib/format";
import type { ExerciseProgressionView } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGE_VALUES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

/** Format a value by unit ("12" vs "30 s"). */
function fmtByUnit(value: number, unit: "REPS" | "SEC"): string {
  return unit === "SEC" ? `${value} s` : `${value}`;
}

/**
 * Pełny panel progresji jednego ćwiczenia: przełącznik „Okres", KPI, wykres
 * rekordu-w-czasie i objętość. Przełącznik używa względnych linków `?zakres=`
 * (działa pod każdą trasą; opcjonalny `rangeHrefExtra` dokleja inne paramy, np. ?ex=).
 * Czysta prezentacja — bez fetchowania.
 */
export function ExerciseProgressionPanel({
  view,
  range,
  rangeHrefExtra = "",
}: {
  view: ExerciseProgressionView;
  range: ProgressionRange;
  rangeHrefExtra?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const { exercise, kpis, points, granularity } = view;
  const { unit } = exercise;

  return (
    <div>
      {/* Range switcher — loader-driven via ?zakres= */}
      <div
        className="row"
        style={{ gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}
      >
        <span
          className="text-xs muted"
          style={{ textTransform: "uppercase", letterSpacing: ".04em" }}
        >
          {t("progression.range.label")}
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {RANGE_VALUES.map((value) => {
            const active = value === range;
            return (
              <Link
                key={value}
                to={`?zakres=${value}${rangeHrefExtra}`}
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
                {tDyn(t, `progression.range.${value}`)}
              </Link>
            );
          })}
        </div>
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
        <KpiTile label={t("progression.kpi.pr")}>
          <div className="stat-num">{fmtByUnit(kpis.pr, unit)}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            {fmtDate(kpis.prAchievedOn, locale)}
          </div>
        </KpiTile>

        <KpiTile label={t("progression.kpi.lastSession")}>
          <div className="stat-num">{fmtByUnit(kpis.lastBest, unit)}</div>
          <div style={{ marginTop: 6 }}>
            <Delta delta={kpis.lastDelta} />
          </div>
        </KpiTile>

        <KpiTile label={t("progression.kpi.periodChange")}>
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

        <KpiTile label={t("progression.kpi.sessionsInPeriod")}>
          <div className="stat-num">{kpis.sessionsInRange}</div>
          <div className="text-xs muted" style={{ marginTop: 6 }}>
            {t("progression.kpi.avgRpe", { value: kpis.avgRpeInRange ?? "—" })}
          </div>
        </KpiTile>
      </div>

      {/* Hero chart */}
      <section style={{ marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 4, gap: 8 }}>
            <h2 style={{ fontSize: 16 }}>{t("progression.heroChart.title")}</h2>
            {granularity === "week" && (
              <span className="text-xs muted">{t("progression.heroChart.weekly")}</span>
            )}
          </div>
          <div className="text-xs muted" style={{ marginBottom: 12 }}>
            {t("progression.heroChart.subtitle")}
          </div>
          <ProgressionLineChart points={points} unit={unit} />
        </div>
      </section>

      {/* Volume */}
      <div className="card" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 2 }}>{t("progression.volumeChart.title")}</h2>
        <div className="text-xs muted" style={{ marginBottom: 12 }}>
          {t("progression.volumeChart.subtitle")}
        </div>
        <VolumeBars points={points} />
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
