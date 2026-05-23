import { desc, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { daysAgo, fmtDate } from "~/lib/format";
import { listClientsForTrainer } from "~/lib/workouts";

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
  };
}

export default function TrenerPulpit() {
  const { user, clients, recentLogs } = useLoaderData<typeof loader>();
  const greeting = user.displayName.split(" ")[0] ?? user.displayName;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener · {user.displayName}
          </div>
          <h1>Pulpit</h1>
          <div className="sub">
            Cześć, {greeting}. {clients.length === 0 ? "Zaproś pierwszego podopiecznego, by zacząć." : `${clients.length} ${pluralizeOsoba(clients.length)}.`}
          </div>
        </div>
        <Link to="/trener/biblioteka/nowe" className="btn btn-primary">
          <Icons.Plus /> Nowe ćwiczenie
        </Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 22 }}>
        <section>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Podopieczni</h2>
            {clients.length > 0 && (
              <Link to="/trener/podopieczni" className="btn btn-ghost btn-sm">
                Wszyscy <Icons.Chev />
              </Link>
            )}
          </div>
          {clients.length === 0 ? (
            <div className="empty">
              <h3>Brak podopiecznych</h3>
              <div>Wygeneruj pierwsze zaproszenie w zakładce „Podopieczni".</div>
            </div>
          ) : (
            <div className="list">
              {clients.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  to={`/trener/podopieczni/${c.id}`}
                  className="list-row"
                  style={{ gridTemplateColumns: "auto 1fr auto auto", gap: 12, padding: "12px 16px" }}
                >
                  <span className="avatar sm">{initialsOf(c.displayName)}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.displayName}</div>
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {c.activePlanName != null ? c.activePlanName : "brak planu"}
                    </div>
                  </div>
                  <div className="mono text-xs muted">
                    {c.lastSession ? daysAgo(c.lastSession) : "brak sesji"}
                  </div>
                  <Icons.Chev style={{ color: "var(--muted-2)" }} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Ostatnie sesje</h2>
            <Icons.History style={{ color: "var(--muted)" }} />
          </div>
          {recentLogs.length === 0 ? (
            <div className="empty">
              <h3>Brak sesji</h3>
              <div>Nikt jeszcze nie zarejestrował treningu.</div>
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
                  <div className="mono text-xs muted">{daysAgo(log.performedOn)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div style={{ marginTop: 22 }}>
        <Link to="/trener/plany" className="muted text-xs">
          Plany ›
        </Link>
        <span className="muted text-xs" style={{ margin: "0 10px" }}>·</span>
        <Link to="/trener/biblioteka" className="muted text-xs">
          Biblioteka ćwiczeń ›
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

function pluralizeOsoba(n: number): string {
  if (n === 1) return "osoba aktywna";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "osób aktywnych";
  if (last >= 2 && last <= 4) return "osoby aktywne";
  return "osób aktywnych";
}
