import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { FeatureRequestBadge } from "~/components/feature-request-badge";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
} from "~/lib/feature-request-types";
import { type FeatureRequestSort, countForTrainer, listForTrainer } from "~/lib/feature-requests";
import { type PlForms, fmtDate, pluralizePl } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";

const PAGE_SIZE = 20;
const ZGLOSZENIE: PlForms = { one: "zgłoszenie", few: "zgłoszenia", many: "zgłoszeń" };

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
  ],
  defaultSort: "newest",
  filterGroups: [
    {
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "Wszystkie" },
        ...FEATURE_REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
      ],
      defaultValue: "all",
    },
    {
      param: "kind",
      label: "Typ",
      options: [
        { value: "all", label: "Wszystkie" },
        ...FEATURE_REQUEST_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);
  const status = controls.filters.status as "all" | (typeof FEATURE_REQUEST_STATUSES)[number];
  const kind = controls.filters.kind as "all" | (typeof FEATURE_REQUEST_KINDS)[number];

  const total = await countForTrainer(db, user.id, { status, kind, q: controls.q });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const requests = await listForTrainer(db, user.id, {
    sort: controls.sort as FeatureRequestSort,
    status,
    kind,
    q: controls.q,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });

  return { requests, spec, controls, page: safePage, totalPages, total };
}

export default function PomyslyTrenera() {
  const { requests, spec, controls, page, totalPages, total } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Pomysły</h1>
          <div className="sub">
            {total === 0
              ? "Podopieczni nie zgłosili jeszcze nic."
              : `${total} ${pluralizePl(total, ZGLOSZENIE)} od podopiecznych.`}
          </div>
        </div>
      </div>

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder="Szukaj po treści lub autorze…"
      />

      {total === 0 ? (
        <div className="empty">
          <h3>Brak zgłoszeń</h3>
          <div>Gdy podopieczny wyśle pomysł albo zgłosi błąd, zobaczysz go tutaj.</div>
        </div>
      ) : (
        <div className="list">
          {requests.map((r) => (
            <Link
              key={r.id}
              to={`/trener/pomysly/${r.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "76px 1fr auto auto", gap: 14 }}
            >
              <div className="mono text-xs muted">{fmtDate(r.createdAtISO)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {r.traineeName} · {KIND_LABEL[r.kind]}
                </div>
              </div>
              <FeatureRequestBadge status={r.status} />
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, ZGLOSZENIE)}
      />
    </div>
  );
}
