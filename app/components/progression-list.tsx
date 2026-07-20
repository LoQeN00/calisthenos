import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import {
  ProgressionStatusBadge,
  StatusSummaryBar,
  sparkStrokeForStatus,
} from "~/components/progression-charts";
import { Sparkline } from "~/components/stat-widgets";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { daysAgo, fmtDate } from "~/lib/format";
import type { ListControlsSpec, ListControlsState } from "~/lib/list-params";
import type { ProgressionListRow } from "~/lib/progression-math";

type Summary = React.ComponentProps<typeof StatusSummaryBar>["summary"];

/**
 * Lista progresji ćwiczeń + opcjonalny tryb porównania. Czysta prezentacja:
 * trasa-rodzic przekazuje już posortowane/odfiltrowane wiersze, podsumowanie,
 * spec/state kontrolek oraz buildery linków (rola-zależne).
 */
export function ProgressionList({
  title,
  rows,
  summary,
  spec,
  controls,
  hrefForExercise,
  buildCompareHref,
}: {
  title: string;
  rows: ProgressionListRow[];
  summary: Summary;
  spec: ListControlsSpec;
  controls: ListControlsState;
  hrefForExercise: (exerciseId: string) => string;
  buildCompareHref: (selectedIds: string[]) => string;
}) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function exitCompare() {
    setCompare(false);
    setSelected([]);
  }

  return (
    <div>
      <div className="row between" style={{ alignItems: "center", margin: "10px 0 12px", gap: 8 }}>
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        <div className="row" style={{ gap: 8 }}>
          {compare ? (
            <>
              <button type="button" className="btn btn-sm" onClick={exitCompare}>
                {t("progression.list.cancel")}
              </button>
              {selected.length < 2 ? (
                <button type="button" className="btn btn-sm btn-primary" disabled>
                  {selected.length > 0
                    ? t("progression.list.compareWithCount", { count: selected.length })
                    : t("progression.list.compare")}
                </button>
              ) : (
                <Link to={buildCompareHref(selected)} className="btn btn-sm btn-primary">
                  {t("progression.list.compareWithCount", { count: selected.length })}
                </Link>
              )}
            </>
          ) : (
            rows.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => setCompare(true)}>
                <Icons.Trend />
                {t("progression.list.compare")}
              </button>
            )
          )}
        </div>
      </div>

      <StatusSummaryBar summary={summary} />
      <ListControls spec={spec} state={controls} />

      {compare && (
        <div className="text-xs muted" style={{ marginBottom: 12 }}>
          {t("progression.list.selectHint")}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <h3>{t("progression.list.emptyTitle")}</h3>
          <div>{t("progression.list.emptyBody")}</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {rows.map((row) => {
            const subtitle = t("progression.list.subtitle", {
              sessions: t("progression.list.sessions", { count: row.sessionCount }),
              ago: daysAgo(row.lastPerformedOn, locale),
              date: fmtDate(row.lastPerformedOn, locale),
            });
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
                      <span className="badge">
                        {t(row.unit === "SEC" ? "progression.unit.sec" : "progression.unit.reps")}
                      </span>
                    </div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {subtitle}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 14, alignItems: "center" }}>
                  <Sparkline
                    values={row.sparkline}
                    width={96}
                    height={30}
                    stroke={sparkStrokeForStatus(row.status)}
                    fill="transparent"
                  />
                  <ProgressionStatusBadge status={row.status} />
                  <div
                    style={{ textAlign: "right", minWidth: 56 }}
                    title={t("progression.list.personalRecord")}
                  >
                    <div className="text-xs muted">{t("progression.list.record")}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                      {prText}
                    </div>
                  </div>
                </div>
              </>
            );

            const rowEl = compare ? (
              <button
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
            ) : (
              <Link
                to={hrefForExercise(row.exerciseId)}
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

            return <div key={row.exerciseId}>{rowEl}</div>;
          })}
        </div>
      )}
    </div>
  );
}
