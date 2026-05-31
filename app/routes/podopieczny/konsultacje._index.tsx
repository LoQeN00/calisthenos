import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { listConsultationsForTrainee } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";

const PUNKT: PlForms = { one: "punkt", few: "punkty", many: "punktów" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  // Konsultacji jest zwykle kilka–kilkanaście; 200 to bezpieczny sufit bez paginacji.
  const consultations = await listConsultationsForTrainee(db, user.id, { limit: 200 });
  return { consultations };
}

export default function TraineeKonsultacjeList() {
  const { consultations } = useLoaderData<typeof loader>();
  const total = consultations.length;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Konsultacje</h1>
          <div className="sub">
            {total === 0
              ? "Brak konsultacji."
              : "Ustalenia z Twoich spotkań z trenerem."}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="empty">
          <h3>Brak konsultacji</h3>
          <div>Pojawią się tu po pierwszym udokumentowanym spotkaniu.</div>
        </div>
      ) : (
        <div className="list">
          {consultations.map((c) => (
            <Link
              key={c.id}
              to={`/podopieczny/konsultacje/${c.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "76px 1fr auto", gap: 14 }}
            >
              <div className="mono text-xs muted">{fmtDate(c.heldOn)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</div>
                {c.openItemCount > 0 && (
                  <div className="text-xs" style={{ marginTop: 4 }}>
                    <span
                      className="mono text-xs"
                      style={{ color: "var(--warn)" }}
                    >
                      {c.openItemCount} {pluralizePl(c.openItemCount, PUNKT)} do poprawy
                    </span>
                  </div>
                )}
              </div>
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
