import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ComparisonChart, ComparisonChartLegend } from "~/components/progression-charts";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getProgressionComparison } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const ids = (url.searchParams.get("ex") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8); // cap the comparison set — bounds DB work and keeps the chart legible
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const comparison = await getProgressionComparison(db, user.id, ids, range);
  return { comparison, range, ids };
}

export default function PodopiecznyRozwojPorownanie() {
  const { comparison, range, ids } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");

  const rangeLabels: Array<{ value: ProgressionRange; label: string }> = [
    { value: "4w", label: t("rozwoj.porownanie.range4w") },
    { value: "3m", label: t("rozwoj.porownanie.range3m") },
    { value: "6m", label: t("rozwoj.porownanie.range6m") },
    { value: "all", label: t("rozwoj.porownanie.rangeAll") },
  ];

  // Defense in depth: the list disables Compare under 2, but a hand-edited URL
  // could land here with too few exercises.
  if (ids.length < 2) {
    return (
      <div>
        <div className="crumbs">
          <Link to="/podopieczny/rozwoj">{t("rozwoj.title")}</Link>
          <span className="sep">›</span>
          <span className="current">{t("rozwoj.porownanie.crumb")}</span>
        </div>
        <div className="card" style={{ padding: 22, textAlign: "center" }}>
          <div className="sub" style={{ marginBottom: 14 }}>
            {t("rozwoj.porownanie.tooFewTitle")}
          </div>
          <Link to="/podopieczny/rozwoj" className="btn">
            {t("rozwoj.porownanie.backBtn")}
          </Link>
        </div>
      </div>
    );
  }

  const exParam = ids.join(",");

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/rozwoj">{t("rozwoj.title")}</Link>
        <span className="sep">›</span>
        <span className="current">{t("rozwoj.porownanie.crumb")}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("rozwoj.porownanie.eyebrow")}
          </div>
          <h1>{t("rozwoj.porownanie.title")}</h1>
          <div className="sub">{t("rozwoj.porownanie.subtitle")}</div>
        </div>
      </div>

      {/* Range switcher — loader-driven via ?zakres=, preserving ?ex= */}
      <div
        className="row"
        style={{ gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}
      >
        <span
          className="text-xs muted"
          style={{ textTransform: "uppercase", letterSpacing: ".04em" }}
        >
          {t("rozwoj.porownanie.periodLabel")}
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {rangeLabels.map((r) => {
            const active = r.value === range;
            return (
              <Link
                key={r.value}
                to={`?ex=${exParam}&zakres=${r.value}`}
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
      </div>

      {/* Chart card */}
      <section style={{ marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("rozwoj.porownanie.chartTitle")}</h2>
          {comparison.series.length >= 1 ? (
            <>
              <ComparisonChart series={comparison.series} />
              <ComparisonChartLegend series={comparison.series} />
            </>
          ) : (
            <div className="muted text-sm">{t("rozwoj.porownanie.noData")}</div>
          )}
        </div>
      </section>

      {/* Raw start→now values per exercise */}
      {comparison.series.length >= 1 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div className="k" style={{ marginBottom: 8 }}>
            {t("rozwoj.porownanie.detailsTitle")}
          </div>
          <div className="col" style={{ gap: 4 }}>
            {comparison.series.map((s) => {
              const pct =
                s.startValue === 0 ? null : Math.round((s.endValue / s.startValue - 1) * 100);
              const u = s.unit === "SEC" ? " s" : "";
              const color =
                pct == null
                  ? "var(--muted)"
                  : pct > 0
                    ? "var(--ok)"
                    : pct < 0
                      ? "var(--danger)"
                      : "var(--muted)";
              return (
                <div key={s.exerciseId} className="row between" style={{ fontSize: 13 }}>
                  <span>{s.name}</span>
                  <span className="muted">
                    {s.startValue}
                    {u} → {s.endValue}
                    {u}{" "}
                    <b className="mono" style={{ color }}>
                      {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
                    </b>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skipped exercises note */}
      {comparison.skipped.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="k" style={{ marginBottom: 8 }}>
            {t("rozwoj.porownanie.skippedTitle")}
          </div>
          <ul className="text-xs muted" style={{ margin: 0, paddingLeft: 18 }}>
            {comparison.skipped.map((s) => (
              <li key={s.exerciseId}>
                {s.name}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
