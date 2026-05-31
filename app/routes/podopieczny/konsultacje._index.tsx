import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ListControls } from "~/components/list-controls";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { listConsultationsForTrainee, type ConsultationSort } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";

const PUNKT: PlForms = { one: "punkt", few: "punkty", many: "punktów" };

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "date_desc", label: "Najnowsze" },
    { key: "date_asc", label: "Najstarsze" },
    { key: "most_open", label: "Najwięcej otwartych" },
  ],
  defaultSort: "date_desc",
  filterGroups: [
    {
      param: "open",
      label: "Punkty",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "with_open", label: "Z otwartymi" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const controls = parseListControls(url.searchParams, spec);
  const open = (controls.filters.open ?? "all") as "all" | "with_open";
  // Konsultacji jest zwykle kilka–kilkanaście; 200 to bezpieczny sufit bez paginacji.
  const consultations = await listConsultationsForTrainee(db, user.id, {
    limit: 200,
    sort: controls.sort as ConsultationSort,
    q: controls.q,
    open,
  });
  return { consultations, spec, controls };
}

export default function TraineeKonsultacjeList() {
  const { consultations, spec, controls } = useLoaderData<typeof loader>();
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

      <ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po tytule…" />

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
