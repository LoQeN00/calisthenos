import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ComparisonChart, ComparisonChartLegend } from "~/components/progression-charts";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer, getProgressionComparison } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
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
  const comparison = await getProgressionComparison(db, traineeId, ids, range);
  return { trainee, comparison, range, ids };
}

export default function TrenerRozwojPorownanie() {
  const { trainee, comparison, range, ids } = useLoaderData<typeof loader>();
  const { t } = useTranslation("trenerRozwoj");

  const rangeLabels: Array<{ value: ProgressionRange; label: string }> = [
    { value: "4w", label: t("porownanie.range4w") },
    { value: "3m", label: t("porownanie.range3m") },
    { value: "6m", label: t("porownanie.range6m") },
    { value: "all", label: t("porownanie.rangeAll") },
  ];

  const rozwojPath = `/trener/podopieczni/${trainee.id}/rozwoj`;

  // Defense in depth: the list disables Compare under 2, but a hand-edited URL
  // could land here with too few exercises.
  if (ids.length < 2) {
    return (
      <div>
        <div className="crumbs">
          <Link to="/trener/podopieczni">{t("breadcrumb.podopieczni")}</Link>
          <span className="sep">›</span>
          <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
          <span className="sep">›</span>
          <Link to={rozwojPath}>{t("breadcrumb.rozwoj")}</Link>
          <span className="sep">›</span>
          <span className="current">{t("porownanie.current")}</span>
        </div>
        <div className="card" style={{ padding: 22, textAlign: "center" }}>
          <div className="sub" style={{ marginBottom: 14 }}>
            {t("porownanie.empty.text")}
          </div>
          <Link to={rozwojPath} className="btn">
            {t("porownanie.empty.back")}
          </Link>
        </div>
      </div>
    );
  }

  const exParam = ids.join(",");

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">{t("breadcrumb.podopieczni")}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={rozwojPath}>{t("breadcrumb.rozwoj")}</Link>
        <span className="sep">›</span>
        <span className="current">{t("porownanie.current")}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("porownanie.eyebrow", { name: trainee.displayName })}
          </div>
          <h1>{t("porownanie.title")}</h1>
          <div className="sub">{t("porownanie.subtitle")}</div>
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
          {t("porownanie.period")}
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
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("porownanie.chartTitle")}</h2>
          {comparison.series.length >= 1 ? (
            <>
              <ComparisonChart series={comparison.series} />
              <ComparisonChartLegend series={comparison.series} />
            </>
          ) : (
            <div className="muted text-sm">{t("porownanie.notEnough")}</div>
          )}
        </div>
      </section>

      {/* Raw start→now values per exercise */}
      {comparison.series.length >= 1 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div className="k" style={{ marginBottom: 8 }}>
            {t("porownanie.concrete")}
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
            {t("porownanie.skipped")}
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
