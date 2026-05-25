import { and, count, eq, gte } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { daysAgo, fmtDate, fmtDateShort } from "~/lib/format";
import {
  listLogsForTrainee,
  loadActivePlanSummaryForTrainee,
} from "~/lib/workouts";
import { getLatestAvailableWrapped } from "~/lib/wrapped";

// ============================================================
// Wrapped banner — appears when the previous month's wrapped is fresh and
// hasn't been viewed yet (`localStorage.wrapped-viewed-YYYY-MM`). Hidden on
// SSR/initial-render to avoid hydration mismatch + a flash for repeat viewers.
// ============================================================

function WrappedBanner({
  wrapped,
}: {
  wrapped: NonNullable<
    ReturnType<typeof useLoaderData<typeof loader>>["latestWrapped"]
  >;
}) {
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
          ✨ Świeży wrapped
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>
          Twój {wrapped.label} jest gotowy.
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {wrapped.sessions} {wrapped.sessions === 1 ? "sesja" : "sesji"} do
          obejrzenia w klimacie Spotify Wrapped.
        </div>
      </div>
      <div
        className="row"
        style={{ gap: 8, position: "relative", flexShrink: 0 }}
      >
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
          Później
        </button>
        <Link to={`/podopieczny/wrapped/${wrapped.ym}`} className="btn btn-primary">
          Otwórz wrapped <Icons.Chev />
        </Link>
      </div>
    </div>
  );
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const planSummary = await loadActivePlanSummaryForTrainee(db, user.id);
  const recent = await listLogsForTrainee(db, user.id, { limit: 5 });

  const sevenDaysAgo = isoDaysAgo(7);
  const [weekRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, user.id),
        gte(schema.workoutLogs.performedOn, sevenDaysAgo),
      ),
    );
  const [totalRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, user.id));

  // Latest wrapped (previous calendar month, if it has data). Banner is
  // suppressed client-side once the trainee opens the wrapped.
  const latestWrapped = await getLatestAvailableWrapped(db, user.id);

  return {
    user,
    planSummary,
    recent,
    stats: {
      weekSessions: Number(weekRow?.c ?? 0),
      totalSessions: Number(totalRow?.c ?? 0),
    },
    latestWrapped,
  };
}

export default function TraineeDashboard() {
  const { user, planSummary, recent, stats, latestWrapped } =
    useLoaderData<typeof loader>();

  const firstName = user.displayName.split(" ")[0] ?? user.displayName;
  const lastSessionLabel = recent[0]?.performedOn ? daysAgo(recent[0].performedOn) : null;

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
            Cześć, {firstName}
          </div>
          <h1 style={{ fontSize: 30 }}>Twój trening</h1>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            Twoje sesje i historia treningów.
          </div>
        </div>
        {planSummary != null && planSummary.sessions.length > 0 && (
          <Link to="/podopieczny/sesje" className="btn btn-primary btn-lg">
            <Icons.Plus /> Zarejestruj sesję
          </Link>
        )}
      </div>

      {stats.totalSessions > 0 && (
        <div
          className="card"
          style={{
            display: "flex",
            gap: 28,
            padding: "16px 20px",
            marginBottom: 20,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div className="stat">
            <div className="v">{stats.weekSessions}</div>
            <div className="k">w tym tygodniu</div>
          </div>
          <span className="vdiv" style={{ height: 36 }} />
          <Link
            to="/podopieczny/historia"
            className="stat"
            style={{ textDecoration: "none" }}
          >
            <div className="v">{stats.totalSessions}</div>
            <div className="k">łącznie sesji</div>
          </Link>
          {lastSessionLabel && (
            <>
              <span className="vdiv" style={{ height: 36 }} />
              <div className="stat">
                <div className="v" style={{ fontSize: 18 }}>
                  {lastSessionLabel}
                </div>
                <div className="k">ostatnia sesja</div>
              </div>
            </>
          )}
        </div>
      )}

      {planSummary == null ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <h3>Brak aktywnego planu</h3>
          <div>Trener przygotuje go wkrótce.</div>
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
                  aktywny plan
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, opacity: 0.7, color: "var(--accent)" }}
                >
                  v{planSummary.plan.version}
                  {planSummary.plan.publishedAt && (
                    <> · od {fmtDate(planSummary.plan.publishedAt.toString())}</>
                  )}
                </span>
              </div>
              <h2 style={{ fontSize: 24, color: "var(--bg)", margin: 0 }}>
                {planSummary.plan.name}
              </h2>
              <div className="mono" style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                {planSummary.sessions.length} sesji do wyboru
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
              Lista sesji <Icons.Chev />
            </Link>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {planSummary != null && planSummary.sessions.length > 0 && (
          <section>
            <div className="row between" style={{ alignItems: "baseline", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16 }}>Sesje w planie</h2>
              <Link to="/podopieczny/sesje" className="btn btn-ghost btn-sm">
                Szczegóły <Icons.Chev />
              </Link>
            </div>
            <div className="list">
              {planSummary.sessions.map((s, idx) => (
                <div
                  key={s.session.id}
                  className="list-row"
                  style={{ gridTemplateColumns: "32px 1fr auto auto", gap: 12, padding: "12px 16px" }}
                >
                  <div className="mono text-xs muted" style={{ textAlign: "center" }}>
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{s.session.name}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {s.doneCount === 0
                        ? "jeszcze nie wykonana"
                        : `×${s.doneCount}${
                            s.lastPerformedOn ? ` · ostatnio ${daysAgo(s.lastPerformedOn)}` : ""
                          }`}
                    </div>
                  </div>
                  <Link
                    to={`/podopieczny/loguj/${s.session.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Icons.Plus /> Zarejestruj
                  </Link>
                  <Link
                    to={`/podopieczny/sesje/${s.session.id}`}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label="Szczegóły sesji"
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
            <h2 style={{ fontSize: 16 }}>Twoja historia</h2>
            {recent.length > 0 && (
              <Link to="/podopieczny/historia" className="btn btn-ghost btn-sm">
                Wszystkie <Icons.Chev />
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="empty">
              <h3>Brak treningów</h3>
              <div>Jeszcze nic nie zarejestrowano.</div>
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
                  <div className="mono text-xs muted">{fmtDateShort(log.performedOn)}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{log.sessionName}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      <span className="mono">{log.exerciseCount}</span> ćwiczeń · trudność{" "}
                      <span className="mono">{log.avgDifficulty}</span>/10
                    </div>
                  </div>
                  <Icons.Chev style={{ color: "var(--muted-2)" }} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
