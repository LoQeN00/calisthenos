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

const RANGE_LABELS: Array<{ value: ProgressionRange; label: string }> = [
  { value: "4w", label: "4 tyg" },
  { value: "3m", label: "3 mies" },
  { value: "6m", label: "6 mies" },
  { value: "all", label: "cały" },
];

export default function TraineeProgresjaPorownanie() {
  const { comparison, range, ids } = useLoaderData<typeof loader>();

  // Defense in depth: the list disables Compare under 2, but a hand-edited URL
  // could land here with too few exercises.
  if (ids.length < 2) {
    return (
      <div>
        <div className="crumbs">
          <Link to="/podopieczny/progresja">Progresja</Link>
          <span className="sep">›</span>
          <span className="current">Porównanie</span>
        </div>
        <div className="card" style={{ padding: 22, textAlign: "center" }}>
          <div className="sub" style={{ marginBottom: 14 }}>
            Wybierz co najmniej 2 ćwiczenia na liście Progresji, aby je porównać.
          </div>
          <Link to="/podopieczny/progresja" className="btn">
            Wróć do Progresji
          </Link>
        </div>
      </div>
    );
  }

  const exParam = ids.join(",");

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/progresja">Progresja</Link>
        <span className="sep">›</span>
        <span className="current">Porównanie</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny · Progresja
          </div>
          <h1>Porównanie progresji</h1>
          <div className="sub">
            Każda linia to % zmiany od startu okresu — różne jednostki dzielą jedną oś.
          </div>
        </div>
      </div>

      {/* Range switcher — loader-driven via ?zakres=, preserving ?ex= */}
      <div className="row wrap" style={{ gap: 6, marginBottom: 18 }}>
        {RANGE_LABELS.map((r) => {
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

      {/* Chart card */}
      <section style={{ marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Zmiana od startu okresu</h2>
          {comparison.series.length >= 1 ? (
            <>
              <ComparisonChart series={comparison.series} />
              <ComparisonChartLegend series={comparison.series} />
            </>
          ) : (
            <div className="muted text-sm">Za mało danych, aby wykreślić porównanie.</div>
          )}
        </div>
      </section>

      {/* Skipped exercises note */}
      {comparison.skipped.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="k" style={{ marginBottom: 8 }}>
            Pominięte
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
