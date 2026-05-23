import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { listLogsForTrainee } from "~/lib/workouts";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const logs = await listLogsForTrainee(db, user.id);
  return { logs };
}

export default function TraineeHistoryList() {
  const { logs } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Historia treningów</h1>
          <div className="sub">
            {logs.length === 0
              ? "Jeszcze nic nie zarejestrowano."
              : `${logs.length} ${pluralizeSesja(logs.length)} łącznie.`}
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="empty">
          <h3>Brak sesji</h3>
          <div>Zarejestruj pierwszą z pulpitu.</div>
        </div>
      ) : (
        <div className="list">
          {logs.map((log) => (
            <Link
              key={log.id}
              to={`/podopieczny/historia/${log.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "76px 1fr auto", gap: 14 }}
            >
              <div className="mono text-xs muted">{fmtDate(log.performedOn)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{log.sessionName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  <span className="mono">{log.exerciseCount}</span> ćwiczeń ·{" "}
                  <span className="mono">{log.setCount}</span> serii · śr.{" "}
                  <span className="mono">{log.avgDifficulty}</span>/10
                  {log.hasVideo && " · video"}
                </div>
              </div>
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function pluralizeSesja(n: number): string {
  if (n === 1) return "sesja";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "sesji";
  if (last >= 2 && last <= 4) return "sesje";
  return "sesji";
}
