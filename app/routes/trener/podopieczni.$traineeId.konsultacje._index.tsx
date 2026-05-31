import { and, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ListControls } from "~/components/list-controls";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { listConsultationsForTrainee, type ConsultationSort } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";

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
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const [trainee] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new Response("not found", { status: 404 });
  const url = new URL(args.request.url);
  const controls = parseListControls(url.searchParams, spec);
  const open = (controls.filters.open ?? "all") as "all" | "with_open";
  const consultations = await listConsultationsForTrainee(db, traineeId, {
    limit: 200,
    sort: controls.sort as ConsultationSort,
    q: controls.q,
    open,
  });
  return { trainee, consultations, spec, controls };
}

const KONSULTACJA: PlForms = { one: "konsultacja", few: "konsultacje", many: "konsultacji" };

export default function TrenerKonsultacjeIndex() {
  const { trainee, consultations, spec, controls } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Konsultacje</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Konsultacje</h1>
          <div className="sub">
            {consultations.length === 0
              ? "Brak konsultacji."
              : `${consultations.length} ${pluralizePl(consultations.length, KONSULTACJA)}`}
          </div>
        </div>
        <Link to={`/trener/podopieczni/${trainee.id}/konsultacje/nowa`} className="btn btn-primary">
          <Icons.Plus /> Nowa konsultacja
        </Link>
      </div>

      <ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po tytule…" />

      {consultations.length === 0 ? (
        <div className="empty">
          <h3>Brak konsultacji</h3>
          <div>Nie dodano jeszcze żadnej konsultacji dla tego podopiecznego.</div>
        </div>
      ) : (
        <div className="list">
          <div
            className="list-head list-row"
            style={{
              gridTemplateColumns: "100px 1fr auto auto",
              gap: 14,
            }}
          >
            <span>Data</span>
            <span>Tytuł</span>
            <span>Punkty</span>
            <span />
          </div>
          {consultations.map((c) => (
            <Link
              key={c.id}
              to={`/trener/podopieczni/${trainee.id}/konsultacje/${c.id}`}
              className="list-row"
              style={{
                gridTemplateColumns: "100px 1fr auto auto",
                gap: 14,
              }}
            >
              <div className="mono text-xs muted">{fmtDate(c.heldOn)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</div>
                {c.periodFrom && c.periodTo && (
                  <div className="text-xs muted" style={{ marginTop: 2 }}>
                    <span className="mono">{fmtDate(c.periodFrom)}</span>
                    {" — "}
                    <span className="mono">{fmtDate(c.periodTo)}</span>
                  </div>
                )}
              </div>
              <ItemCountBadge open={c.openItemCount} total={c.totalItemCount} />
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCountBadge({ open, total }: { open: number; total: number }) {
  if (total === 0) {
    return (
      <span className="mono text-xs muted" style={{ minWidth: 80, textAlign: "right" }}>
        —
      </span>
    );
  }
  if (open > 0) {
    return (
      <span
        className="mono text-xs"
        style={{
          color: "var(--warn)",
          fontWeight: 600,
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {open} do poprawy
      </span>
    );
  }
  return (
    <span
      className="mono text-xs"
      style={{ color: "var(--ok)", fontWeight: 600, minWidth: 80, textAlign: "right" }}
    >
      wszystko poprawione
    </span>
  );
}
