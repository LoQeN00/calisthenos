import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { ProgressionStatusBadge } from "~/components/progression-charts";
import { Sparkline } from "~/components/stat-widgets";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { daysAgo, fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { findTraineeOfTrainer, listProgressionExercises } from "~/lib/progression";
import { sortProgressionRows, summarizeStatuses, type StatusSummary } from "~/lib/progression-math";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const rows = await listProgressionExercises(db, traineeId);
  const summary = summarizeStatuses(rows);

  const url = new URL(args.request.url);

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  const tagOptions = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "recent", label: "Ostatnio trenowane" },
      { key: "attention", label: "Wymaga uwagi" },
    ],
    defaultSort: "attention",
    filterGroups: [
      {
        param: "tag",
        label: "Kategoria",
        options: [
          { value: "all", label: "Wszystkie" },
          ...tagOptions.map((t) => ({ value: t, label: t })),
        ],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);

  const tag = controls.filters.tag ?? "all";
  const filtered = tag === "all" ? rows : rows.filter((r) => r.tags.includes(tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { trainee, rows: visible, summary, spec, controls, hasAny: rows.length > 0 };
}

export default function TrenerProgresja() {
  const { trainee, rows, summary, spec, controls, hasAny } = useLoaderData<typeof loader>();

  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggleSelected(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function exitCompare() {
    setCompare(false);
    setSelected([]);
  }

  const compareHref = `/trener/podopieczni/${trainee.id}/progresja/porownanie?ex=${selected.join(",")}`;

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Progresja</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Progresja</h1>
          <div className="sub">Postęp w ćwiczeniach w czasie.</div>
        </div>
        {hasAny && (
          <div className="row" style={{ gap: 8 }}>
            {compare ? (
              <>
                <button type="button" className="btn btn-sm" onClick={exitCompare}>
                  Anuluj
                </button>
                {selected.length < 2 ? (
                  <button type="button" className="btn btn-sm btn-primary" disabled>
                    Porównaj{selected.length > 0 ? ` (${selected.length})` : ""}
                  </button>
                ) : (
                  <Link to={compareHref} className="btn btn-sm btn-primary">
                    Porównaj ({selected.length})
                  </Link>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCompare(true)}
              >
                <Icons.Trend />
                Porównaj
              </button>
            )}
          </div>
        )}
      </div>

      {!hasAny ? (
        <div className="empty">
          <h3>Brak danych</h3>
          <div>
            Progresja pojawi się, gdy podopieczny zarejestruje pierwszą serię ćwiczenia.
          </div>
        </div>
      ) : (
        <>
          <StatusSummaryBar summary={summary} />

          <ListControls spec={spec} state={controls} />

          {compare && (
            <div className="text-xs muted" style={{ marginBottom: 12 }}>
              Zaznacz co najmniej 2 ćwiczenia, aby je porównać.
            </div>
          )}

          {rows.length === 0 ? (
            <div className="empty">
              <h3>Brak ćwiczeń w tej kategorii</h3>
              <div>Wybierz inną kategorię lub „Wszystkie".</div>
            </div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {rows.map((row) => {
                const subtitle = `${row.sessionCount} ${pluralizePl(
                  row.sessionCount,
                  SESJA,
                )} · ostatnio: ${daysAgo(row.lastPerformedOn)} (${fmtDate(row.lastPerformedOn)})`;
                const prText = `${row.pr}${row.unit === "SEC" ? " s" : ""}`;
                const isSelected = selected.includes(row.exerciseId);

                const inner = (
                  <>
                    <div className="row" style={{ gap: 10, minWidth: 0, flex: 1 }}>
                      {compare && (
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            flexShrink: 0,
                            border: `2px solid ${isSelected ? "var(--accent)" : "var(--line-2)"}`,
                            background: isSelected ? "var(--accent)" : "transparent",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--accent-ink)",
                          }}
                        >
                          {isSelected && <Icons.Check />}
                        </span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{row.name}</span>
                          <span className="badge">{row.unit}</span>
                        </div>
                        <div className="text-xs muted" style={{ marginTop: 2 }}>
                          {subtitle}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 14, alignItems: "center" }}>
                      <Sparkline values={row.sparkline} width={96} height={30} />
                      <ProgressionStatusBadge status={row.status} />
                      <div
                        className="mono"
                        style={{ fontSize: 15, fontWeight: 600, minWidth: 48, textAlign: "right" }}
                        title="Rekord osobisty"
                      >
                        {prText}
                      </div>
                    </div>
                  </>
                );

                if (compare) {
                  return (
                    <button
                      key={row.exerciseId}
                      type="button"
                      onClick={() => toggleSelected(row.exerciseId)}
                      aria-pressed={isSelected}
                      className="card card-hover row between"
                      style={{
                        gap: 14,
                        padding: "12px 16px",
                        flexWrap: "wrap",
                        width: "100%",
                        textAlign: "left",
                        background: isSelected ? "var(--accent-soft)" : undefined,
                        borderColor: isSelected ? "transparent" : undefined,
                      }}
                    >
                      {inner}
                    </button>
                  );
                }

                return (
                  <Link
                    key={row.exerciseId}
                    to={`/trener/podopieczni/${trainee.id}/progresja/${row.exerciseId}`}
                    className="card card-hover row between"
                    style={{
                      gap: 14,
                      padding: "12px 16px",
                      flexWrap: "wrap",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusSummaryBar({ summary }: { summary: StatusSummary }) {
  const items: Array<{ label: string; value: number; color: string }> = [
    { label: "▲ rośnie", value: summary.up, color: "var(--ok)" },
    { label: "= stabilnie", value: summary.flat, color: "var(--muted)" },
    { label: "▼ spada", value: summary.down, color: "var(--danger)" },
    { label: "nowe", value: summary.new, color: "var(--muted)" },
  ];
  return (
    <div
      className="row wrap"
      style={{
        gap: 16,
        marginBottom: 18,
        padding: "10px 14px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
      }}
    >
      {items.map((it) => (
        <span key={it.label} className="row" style={{ gap: 6, alignItems: "baseline" }}>
          <span className="text-xs" style={{ color: it.color, fontWeight: 600 }}>
            {it.label}
          </span>
          <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: it.color }}>
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}
