import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { countLogsForTrainee, listLogsForTrainee } from "~/lib/workouts";

const PAGE_SIZE = 20;
const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  const total = await countLogsForTrainee(db, user.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const logs = await listLogsForTrainee(db, user.id, {
    limit: PAGE_SIZE,
    offset,
  });
  return { logs, page: safePage, totalPages, total };
}

export default function TraineeHistoryList() {
  const { logs, page, totalPages, total } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Historia treningów</h1>
          <div className="sub">
            {total === 0
              ? "Jeszcze nic nie zarejestrowano."
              : `${total} ${pluralizePl(total, SESJA)} łącznie.`}
          </div>
        </div>
      </div>

      {total === 0 ? (
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

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, SESJA)}
      />
    </div>
  );
}

