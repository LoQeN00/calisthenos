import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { listBrandExercises } from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";
import { tDyn } from "~/i18n/translate";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";

const PAGE_SIZE = 24;

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  // Labels are empty here — filled at render time with translations.
  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "name_asc", label: "" },
      { key: "name_desc", label: "" },
    ],
    defaultSort: "name_asc",
    filterGroups: [
      {
        param: "unit",
        label: "",
        options: [
          { value: "all", label: "" },
          { value: "REPS", label: "" },
          { value: "SEC", label: "" },
        ],
        defaultValue: "all",
      },
    ],
    searchable: true,
  };

  const controls = parseListControls(url.searchParams, spec);

  // Fetch all brand exercises (brand catalog is small) then filter/sort in memory.
  let rows = await listBrandExercises(db, orgId);

  // Search by name
  if (controls.q.length > 0) {
    const q = controls.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  // Filter by unit
  const filterUnit = controls.filters.unit ?? "all";
  if (filterUnit === "REPS" || filterUnit === "SEC") {
    rows = rows.filter((r) => r.unit === filterUnit);
  }

  // Sort: listBrandExercises zwraca już name_asc; tylko name_desc wymaga re-sortu.
  // (Brak sortu po dacie — BrandExerciseRow nie niesie createdAt; gdyby był potrzebny,
  // trzeba by rozszerzyć repo. Świadomie poza zakresem #4a.)
  if (controls.sort === "name_desc") {
    rows = [...rows].sort((a, b) => b.name.localeCompare(a.name));
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;
  const items = rows.slice(offset, offset + PAGE_SIZE);

  return { items, spec, controls, page: safePage, totalPages, total };
}

export default function MarkaBibliotekaIndex() {
  const { items, spec, controls, page, totalPages, total } = useLoaderData<typeof loader>();
  const { t } = useTranslation("marka");

  const localizedUnit = (u: string) =>
    u === "REPS"
      ? t("biblioteka.filterUnit.reps")
      : u === "SEC"
        ? t("biblioteka.filterUnit.sec")
        : t("biblioteka.filterUnit.all");

  const localizedSpec: ListControlsSpec = {
    ...spec,
    sortOptions: spec.sortOptions.map((o) => ({
      ...o,
      label: tDyn(t, `biblioteka.sort.${o.key}`),
    })),
    filterGroups: spec.filterGroups.map((g) => ({
      ...g,
      label: t("biblioteka.filterUnit.label"),
      options: g.options.map((o) => ({ ...o, label: localizedUnit(o.value) })),
    })),
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("biblioteka.eyebrow")}
          </div>
          <h1>{t("biblioteka.title")}</h1>
          <div className="sub">
            {total === 0 ? t("biblioteka.subEmpty") : t("biblioteka.subCount", { count: total })}
          </div>
        </div>
        <Link to="/marka/biblioteka/nowe" className="btn btn-primary">
          <Icons.Plus /> {t("biblioteka.ctaNew")}
        </Link>
      </div>

      <ListControls
        spec={localizedSpec}
        state={controls}
        searchPlaceholder={t("biblioteka.searchPlaceholder")}
      />

      {items.length === 0 ? (
        <div className="empty">
          <h3>{t("biblioteka.emptyTitle")}</h3>
          <div>{t("biblioteka.emptyBody")}</div>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {items.map((ex) => (
            <Link
              key={ex.id}
              to={`/marka/biblioteka/${ex.id}`}
              className="card card-hover"
              style={{ padding: 14 }}
            >
              <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{ex.name}</h3>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {ex.archivedAt != null && (
                    <span className="badge archived">
                      <span className="badge-dot" />
                      {t("bibliotekaForm.archived")}
                    </span>
                  )}
                  <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>{ex.unit}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={t("biblioteka.totalLabel", { count: total })}
      />
    </div>
  );
}
