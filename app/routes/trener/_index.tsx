import { and, count, desc, eq, gte } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { daysAgo } from "~/lib/format";
import { listClientsForTrainer } from "~/lib/workouts";

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });

  const clients = await listClientsForTrainer(db, user.id);

  const recentLogs = await db
    .select({
      log: schema.workoutLogs,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
    })
    .from(schema.workoutLogs)
    .innerJoin(schema.users, eq(schema.users.id, schema.workoutLogs.traineeId))
    .where(eq(schema.workoutLogs.trainerId, user.id))
    .orderBy(desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt))
    .limit(6);

  const sevenDaysAgo = isoDaysAgo(7);

  const [activePlansRow] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, user.id), eq(schema.plans.status, "active")));
  const [draftsRow] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, user.id), eq(schema.plans.status, "draft")));
  const [weekSessionsRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.trainerId, user.id),
        gte(schema.workoutLogs.performedOn, sevenDaysAgo),
      ),
    );

  return {
    user,
    clients,
    recentLogs: recentLogs.map((r) => ({
      id: r.log.id,
      performedOn: r.log.performedOn,
      sessionName: r.log.sessionName,
      traineeId: r.trainee.id,
      traineeName: r.trainee.displayName,
    })),
    stats: {
      activePlans: Number(activePlansRow?.c ?? 0),
      drafts: Number(draftsRow?.c ?? 0),
      weekSessions: Number(weekSessionsRow?.c ?? 0),
    },
  };
}

export default function TrenerPulpit() {
  const { user, clients, recentLogs, stats } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation("trener");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const greeting = user.displayName.split(" ")[0] ?? user.displayName;
  const noClients = clients.length === 0;

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>{t("pulpit.greeting", { name: greeting })}</h1>
          <div className="sub">
            {noClients
              ? t("pulpit.subInvite")
              : t("pulpit.subActive", { count: clients.length })}
          </div>
        </div>
        {noClients ? (
          <Link to="/trener/podopieczni" className="btn btn-primary">
            <Icons.Plus /> {t("pulpit.ctaInvite")}
          </Link>
        ) : (
          <Link to="/trener/plany/nowy" className="btn btn-primary">
            <Icons.Plus /> {t("pulpit.ctaNewPlan")}
          </Link>
        )}
      </div>

      {!noClients && (
        <div
          className="card"
          style={{
            display: "flex",
            gap: 28,
            padding: "16px 20px",
            marginBottom: 22,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/trener/plany?status=active"
            className="stat"
            style={{ textDecoration: "none" }}
          >
            <div className="v">{stats.activePlans}</div>
            <div className="k">{t("pulpit.stats.activePlans")}</div>
          </Link>
          <span className="vdiv" style={{ height: 36 }} />
          <div className="stat">
            <div className="v">{stats.weekSessions}</div>
            <div className="k">{t("pulpit.stats.weekSessions")}</div>
          </div>
          <span className="vdiv" style={{ height: 36 }} />
          <Link
            to="/trener/plany?status=draft"
            className="stat"
            style={{
              textDecoration: "none",
              color: stats.drafts > 0 ? "var(--warn)" : undefined,
            }}
          >
            <div className="v">{stats.drafts}</div>
            <div className="k">{t("pulpit.stats.drafts")}</div>
          </Link>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 22 }}>
        <section>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>{t("pulpit.clients.heading")}</h2>
            {clients.length > 0 && (
              <Link to="/trener/podopieczni" className="btn btn-ghost btn-sm">
                {t("pulpit.clients.all")} <Icons.Chev />
              </Link>
            )}
          </div>
          {clients.length === 0 ? (
            <div className="empty">
              <h3>{t("pulpit.clients.emptyTitle")}</h3>
              <div>{t("pulpit.clients.emptyBody")}</div>
            </div>
          ) : (
            <div className="list">
              {clients.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  to={`/trener/podopieczni/${c.id}`}
                  className="list-row"
                  style={{
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 12,
                    padding: "12px 16px",
                  }}
                >
                  <span className="avatar sm">{initialsOf(c.displayName)}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.displayName}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {c.activePlanName != null ? c.activePlanName : t("pulpit.clients.noPlan")}
                    </div>
                  </div>
                  <div className="mono text-xs muted">
                    {c.lastSession ? daysAgo(c.lastSession, locale) : t("pulpit.clients.noSession")}
                  </div>
                  <Icons.Chev style={{ color: "var(--muted-2)" }} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>{t("pulpit.recent.heading")}</h2>
            <Icons.History style={{ color: "var(--muted)" }} />
          </div>
          {recentLogs.length === 0 ? (
            <div className="empty">
              <h3>{t("pulpit.recent.emptyTitle")}</h3>
              <div>{t("pulpit.recent.emptyBody")}</div>
            </div>
          ) : (
            <div className="list">
              {recentLogs.map((log) => (
                <Link
                  key={log.id}
                  to={`/trener/podopieczni/${log.traineeId}/log/${log.id}`}
                  className="list-row"
                  style={{ gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "12px 16px" }}
                >
                  <span className="avatar sm">{initialsOf(log.traineeName)}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{log.traineeName}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {log.sessionName}
                    </div>
                  </div>
                  <div className="mono text-xs muted">{daysAgo(log.performedOn, locale)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div style={{ marginTop: 22 }}>
        <Link to="/trener/plany" className="muted text-xs">
          {t("pulpit.footer.plans")}
        </Link>
        <span className="muted text-xs" style={{ margin: "0 10px" }}>
          ·
        </span>
        <Link to="/trener/biblioteka" className="muted text-xs">
          {t("pulpit.footer.library")}
        </Link>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
