import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";
import {
  ActivityHeatmapCard,
  EffortBalanceCard,
  HeroStatsCard,
  ThisWeekCard,
  WrappedListRow,
} from "~/components/trainee-stats";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { daysAgo, fmtDate, fmtDateShort } from "~/lib/format";
import { getActivityHeatmap, getEffortBalance, getHeroStats, getThisWeekStats } from "~/lib/stats";
import { listLogsForTrainee, loadActivePlanSummaryForTrainee } from "~/lib/workouts";
import { getAvailableWrappedMonths, getLatestAvailableWrapped } from "~/lib/wrapped";

// ============================================================
// Wrapped banner — appears when the previous month's wrapped is fresh and
// hasn't been viewed yet (`localStorage.wrapped-viewed-YYYY-MM`). Hidden on
// SSR/initial-render to avoid hydration mismatch + a flash for repeat viewers.
// ============================================================

function WrappedBanner({
  wrapped,
}: {
  wrapped: NonNullable<ReturnType<typeof useLoaderData<typeof loader>>["latestWrapped"]>;
}) {
  const { t } = useTranslation("podopieczny");
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const viewed = localStorage.getItem(`wrapped-viewed-${wrapped.ym}`);
      const dismissed = localStorage.getItem(`wrapped-dismissed-${wrapped.ym}`);
      if (!viewed && !dismissed) setShow(true);
    } catch {
      // localStorage blocked → just show; clicking through marks it server-side
      // on the wrapped page itself anyway.
      setShow(true);
    }
  }, [wrapped.ym]);

  const dismiss = () => {
    try {
      localStorage.setItem(`wrapped-dismissed-${wrapped.ym}`, "1");
    } catch {
      // ignored
    }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div
      className="card"
      style={{
        background: "var(--ink)",
        color: "var(--bg)",
        border: 0,
        padding: 18,
        marginBottom: 20,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "var(--accent)",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".12em",
            color: "var(--accent)",
            marginBottom: 6,
          }}
        >
          ✨ {t("pulpit.wrapped.badge")}
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>
          {t("pulpit.wrapped.title", { label: wrapped.label })}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {t("pulpit.wrapped.sessionCount", { count: wrapped.sessions })}
        </div>
      </div>
      <div className="row" style={{ gap: 8, position: "relative", flexShrink: 0 }}>
        <button
          type="button"
          onClick={dismiss}
          className="btn"
          style={{
            background: "transparent",
            color: "var(--bg)",
            borderColor: "rgba(255,255,255,.18)",
          }}
        >
          {t("pulpit.wrapped.laterBtn")}
        </button>
        <Link to={`/podopieczny/wrapped/${wrapped.ym}`} className="btn btn-primary">
          {t("pulpit.wrapped.openBtn")} <Icons.Chev />
        </Link>
      </div>
    </div>
  );
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const [planSummary, recent, hero, thisWeek, heatmap, effort, wrappedMonths, latestWrapped] =
    await Promise.all([
      loadActivePlanSummaryForTrainee(db, user.id),
      listLogsForTrainee(db, user.id, { limit: 5 }),
      getHeroStats(db, user.id),
      getThisWeekStats(db, user.id),
      getActivityHeatmap(db, user.id, 26),
      getEffortBalance(db, user.id),
      getAvailableWrappedMonths(db, user.id),
      // Latest wrapped (previous calendar month, if it has data). Banner is
      // suppressed client-side once the trainee opens the wrapped.
      getLatestAvailableWrapped(db, user.id),
    ]);

  return {
    user,
    planSummary,
    recent,
    hero,
    thisWeek,
    heatmap,
    effort,
    wrappedMonths,
    latestWrapped,
  };
}

export default function TraineeDashboard() {
  const {
    user,
    planSummary,
    recent,
    hero,
    thisWeek,
    heatmap,
    effort,
    wrappedMonths,
    latestWrapped,
  } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";

  const firstName = user.displayName.split(" ")[0] ?? user.displayName;

  return (
    <div>
      {latestWrapped && <WrappedBanner wrapped={latestWrapped} />}

      <div
        className="row between"
        style={{
          paddingBottom: 22,
          marginBottom: 22,
          borderBottom: "1px solid var(--line)",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("pulpit.eyebrow", { name: firstName })}
          </div>
          <h1 style={{ fontSize: 30 }}>{t("pulpit.title")}</h1>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            {t("pulpit.subtitle")}
          </div>
        </div>
        {planSummary != null && planSummary.sessions.length > 0 && (
          <Link to="/podopieczny/sesje" className="btn btn-primary btn-lg">
            <Icons.Plus /> {t("pulpit.registerSession")}
          </Link>
        )}
      </div>

      {hero.totalSessions > 0 && <HeroStatsCard hero={hero} />}

      {planSummary == null ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <h3>{t("pulpit.noPlan.title")}</h3>
          <div>{t("pulpit.noPlan.subtitle")}</div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            border: 0,
            marginBottom: 20,
            padding: 24,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "var(--accent)",
              opacity: 0.15,
              pointerEvents: "none",
            }}
          />
          <div className="row between" style={{ alignItems: "flex-start", position: "relative" }}>
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
                <span
                  className="badge"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--accent)",
                    color: "var(--accent)",
                  }}
                >
                  <span className="badge-dot" style={{ background: "var(--accent)" }} />
                  {t("pulpit.activePlan.badge")}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, opacity: 0.7, color: "var(--accent)" }}
                >
                  {t("pulpit.activePlan.versionSuffix", { version: planSummary.plan.version })}
                  {planSummary.plan.publishedAt && (
                    <>
                      {" "}
                      ·{" "}
                      {t("pulpit.activePlan.sinceDate", {
                        date: fmtDate(planSummary.plan.publishedAt.toString()),
                      })}
                    </>
                  )}
                </span>
              </div>
              <h2 style={{ fontSize: 24, color: "var(--bg)", margin: 0 }}>
                {planSummary.plan.name}
              </h2>
              <div className="mono" style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                {t("pulpit.activePlan.sessionCount", { count: planSummary.sessions.length })}
              </div>
            </div>
            <Link
              to="/podopieczny/sesje"
              className="btn"
              style={{
                background: "transparent",
                color: "var(--bg)",
                borderColor: "rgba(255,255,255,.15)",
              }}
            >
              {t("pulpit.activePlan.listLink")} <Icons.Chev />
            </Link>
          </div>
        </div>
      )}

      {hero.totalSessions > 0 && (
        <>
          <ThisWeekCard thisWeek={thisWeek} />
          <ActivityHeatmapCard days={heatmap} />
          <EffortBalanceCard effort={effort} />
        </>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}
      >
        {planSummary != null && planSummary.sessions.length > 0 && (
          <section>
            <div className="row between" style={{ alignItems: "baseline", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16 }}>{t("pulpit.planSessions.title")}</h2>
              <Link to="/podopieczny/sesje" className="btn btn-ghost btn-sm">
                {t("pulpit.planSessions.detailsLink")} <Icons.Chev />
              </Link>
            </div>
            <div className="list">
              {planSummary.sessions.map((s, idx) => (
                <div
                  key={s.session.id}
                  className="list-row"
                  style={{
                    gridTemplateColumns: "32px 1fr auto auto",
                    gap: 12,
                    padding: "12px 16px",
                  }}
                >
                  <div className="mono text-xs muted" style={{ textAlign: "center" }}>
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s.session.name}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {s.doneCount === 0
                        ? t("pulpit.planSessions.notDoneYet")
                        : `${t("pulpit.planSessions.doneCount", { count: s.doneCount })}${
                            s.lastPerformedOn
                              ? ` · ${t("pulpit.planSessions.lastPerformed", { when: daysAgo(s.lastPerformedOn, locale) })}`
                              : ""
                          }`}
                    </div>
                  </div>
                  <Link
                    to={`/podopieczny/loguj/${s.session.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Icons.Plus /> {t("pulpit.planSessions.registerBtn")}
                  </Link>
                  <Link
                    to={`/podopieczny/sesje/${s.session.id}`}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={t("pulpit.planSessions.detailsAriaLabel")}
                  >
                    <Icons.Chev />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16 }}>{t("pulpit.history.title")}</h2>
            {recent.length > 0 && (
              <Link to="/podopieczny/historia" className="btn btn-ghost btn-sm">
                {t("pulpit.history.allLink")} <Icons.Chev />
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="empty">
              <h3>{t("pulpit.history.empty.title")}</h3>
              <div>{t("pulpit.history.empty.subtitle")}</div>
            </div>
          ) : (
            <div className="list">
              {recent.map((log) => (
                <Link
                  key={log.id}
                  to={`/podopieczny/historia/${log.id}`}
                  className="list-row"
                  style={{ gridTemplateColumns: "60px 1fr auto", gap: 12, padding: "12px 16px" }}
                >
                  <div className="mono text-xs muted">{fmtDateShort(log.performedOn, locale)}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{log.sessionName}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      <span className="mono">{log.exerciseCount}</span>{" "}
                      {t("pulpit.history.exerciseWord", { count: log.exerciseCount })} ·{" "}
                      {t("pulpit.history.difficulty")}{" "}
                      {log.avgDifficulty == null ? (
                        "—"
                      ) : (
                        <>
                          <span className="mono">{log.avgDifficulty}</span>/10
                        </>
                      )}
                    </div>
                  </div>
                  <Icons.Chev style={{ color: "var(--muted-2)" }} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <WrappedListRow months={wrappedMonths} />
    </div>
  );
}
