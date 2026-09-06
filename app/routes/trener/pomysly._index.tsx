import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { FeatureRequestBadge } from "~/components/feature-request-badge";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/api/auth";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
} from "~/lib/feature-request-types";
import {
  type FeatureRequestKindFilter,
  type FeatureRequestSort,
  type FeatureRequestStatusFilter,
  listForTrainer,
} from "~/lib/feature-requests";
import { type PlForms, fmtDate, pluralizePl } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";

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
  const { api } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);
  const status = controls.filters.status as FeatureRequestStatusFilter;
  const kind = controls.filters.kind as FeatureRequestKindFilter;

  // Jedno żądanie zamiast dwóch: strona przychodzi razem z `total` i z autorem
  // każdego wiersza, a `page` spoza zakresu przycina BE — dawne `safePage` nie ma
  // już czego liczyć. Szukajka po tytule, treści i autorze biegnie po tamtej stronie.
  const result = await listForTrainer(api, {
    page,
    sort: controls.sort as FeatureRequestSort,
    status,
    kind,
    q: controls.q,
  });

  return {
    requests: result.items,
    spec,
    controls,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  };
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
              <div className="mono text-xs muted">{fmtDate(r.createdAt)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {r.authorName} · {KIND_LABEL[r.kind]}
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
