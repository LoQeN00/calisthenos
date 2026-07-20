import { and, arrayContains, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { tDyn } from "~/i18n/translate";
import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import {
  CategoryError,
  addCategory,
  deleteCategory,
  listCategoriesForTrainer,
} from "~/lib/categories";
import { effectiveExerciseWhere, forkedExerciseOriginIds, isBrandOwned } from "~/lib/catalog";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { signFileUrl } from "~/lib/files";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";

const PAGE_SIZE = 24;

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  const categories = await listCategoriesForTrainer(db, user.id);
  const categoryNames = new Set(categories.map((c) => c.name));

  // Labels not needed server-side (parseListControls reads keys/values only);
  // the render-time spec below carries translated labels for <ListControls>.
  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "name_asc", label: "" },
      { key: "name_desc", label: "" },
      { key: "newest", label: "" },
      { key: "oldest", label: "" },
    ],
    defaultSort: "name_asc",
    filterGroups: [
      {
        param: "tag",
        label: "",
        options: [
          { value: "all", label: "" },
          ...categories.map((c) => ({ value: c.name, label: c.name })),
        ],
        defaultValue: "all",
      },
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

  const filterTag = controls.filters.tag ?? "all";
  const filterUnit = controls.filters.unit ?? "all";

  const forkedOrigins = await forkedExerciseOriginIds(db, user.id);
  const conditions = [
    effectiveExerciseWhere(user.organizationId, user.id, forkedOrigins),
    isNull(schema.exercises.archivedAt),
  ];
  if (controls.q.length > 0) {
    conditions.push(ilike(schema.exercises.name, `%${controls.q}%`));
  }
  if (filterTag !== "all" && categoryNames.has(filterTag)) {
    conditions.push(arrayContains(schema.exercises.tags, [filterTag]));
  }
  if (filterUnit === "REPS" || filterUnit === "SEC") {
    conditions.push(eq(schema.exercises.unit, filterUnit));
  }

  const orderBy =
    controls.sort === "name_desc"
      ? [desc(schema.exercises.name)]
      : controls.sort === "newest"
        ? [desc(schema.exercises.createdAt)]
        : controls.sort === "oldest"
          ? [asc(schema.exercises.createdAt)]
          : [asc(schema.exercises.name)];

  const [totalRow] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(...conditions));
  const total = Number(totalRow?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset(offset);

  const items = rows.map((r) => ({
    id: r.exercise.id,
    name: r.exercise.name,
    unit: r.exercise.unit,
    description: r.exercise.description,
    tags: r.exercise.tags,
    isBrand: isBrandOwned(r.exercise),
    demo:
      r.demoFile != null
        ? {
            url: signFileUrl(r.demoFile.id, user.id),
            mime: r.demoFile.mimeType,
          }
        : null,
  }));

  return {
    items,
    spec,
    controls,
    categories,
    page: safePage,
    totalPages,
    total,
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "add-category") {
    const name = (fd.get("name") ?? "").toString();
    try {
      await addCategory(db, user.id, name);
    } catch (e) {
      if (e instanceof CategoryError) return { error: e.userMessage };
      throw e;
    }
    return { ok: true };
  }

  if (intent === "delete-category") {
    const categoryId = (fd.get("categoryId") ?? "").toString();
    if (categoryId.length > 0) {
      await deleteCategory(db, user.id, categoryId);
    }
    return { ok: true };
  }

  return null;
}

export default function BibliotekaList() {
  const { items, spec, controls, categories, page, totalPages, total } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("trener");
  // Po usunięciu kategorii jej nazwa zostaje w `exercises.tags[]` (świadome), ale
  // nie powinna już wisieć jako chip — pokazujemy tylko tagi będące znaną kategorią.
  const knownCategoryNames = new Set(categories.map((c) => c.name));

  const localizedUnit = (u: string) =>
    u === "REPS"
      ? t("biblioteka.filterUnit.reps")
      : u === "SEC"
        ? t("biblioteka.filterUnit.sec")
        : t("biblioteka.filterUnit.all");

  // Spec z przetłumaczonymi etykietami — budowany przy renderze. Kategorie
  // (nazwy z DB) zachowują własne etykiety; pozostałe opcje są tłumaczone.
  const localizedSpec: ListControlsSpec = {
    ...spec,
    sortOptions: spec.sortOptions.map((o) => ({
      ...o,
      label: tDyn(t, `biblioteka.sort.${o.key}`),
    })),
    filterGroups: spec.filterGroups.map((g) =>
      g.param === "tag"
        ? {
            ...g,
            label: t("biblioteka.filterCategory.label"),
            options: g.options.map((o) =>
              o.value === "all" ? { ...o, label: t("biblioteka.filterCategory.all") } : o,
            ),
          }
        : {
            ...g,
            label: t("biblioteka.filterUnit.label"),
            options: g.options.map((o) => ({ ...o, label: localizedUnit(o.value) })),
          },
    ),
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
        <Link to="/trener/biblioteka/nowe" className="btn btn-primary">
          <Icons.Plus /> {t("biblioteka.ctaNew")}
        </Link>
      </div>

      <ListControls
        spec={localizedSpec}
        state={controls}
        searchPlaceholder={t("biblioteka.searchPlaceholder")}
      />

      <details
        className="card"
        style={{ padding: "10px 14px", marginBottom: 22 }}
        open={categories.length === 0}
      >
        <summary
          style={{
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <Icons.Settings />
          <span>{t("biblioteka.categories.manage", { count: categories.length })}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          {categories.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
              {categories.map((c) => (
                <Form key={c.id} method="post" style={{ display: "inline-block" }}>
                  <input type="hidden" name="intent" value="delete-category" />
                  <input type="hidden" name="categoryId" value={c.id} />
                  <ConfirmSubmitButton
                    className="tag"
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      cursor: "pointer",
                      border: 0,
                    }}
                    title={t("biblioteka.categories.removeTitle")}
                    confirmOptions={{
                      title: t("biblioteka.categories.confirmTitle", { name: c.name }),
                      message: t("biblioteka.categories.confirmMessage"),
                      destructive: true,
                      confirmText: t("biblioteka.categories.confirmText"),
                    }}
                  >
                    {c.name}
                    <Icons.X style={{ fontSize: 11 }} />
                  </ConfirmSubmitButton>
                </Form>
              ))}
            </div>
          )}
          <Form method="post" className="row" style={{ gap: 6 }}>
            <input type="hidden" name="intent" value="add-category" />
            <input
              name="name"
              type="text"
              maxLength={32}
              placeholder={t("biblioteka.categories.placeholder")}
              required
              className="input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-sm btn-primary">
              <Icons.Plus /> {t("biblioteka.categories.add")}
            </button>
          </Form>
          {actionData != null && "error" in actionData && actionData.error != null && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: "8px 0 0" }}>
              {actionData.error}
            </p>
          )}
        </div>
      </details>

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
              to={`/trener/biblioteka/${ex.id}`}
              className="card card-hover"
              style={{ padding: 14 }}
            >
              <div className="video-tile" style={{ marginBottom: 12 }}>
                {ex.demo ? (
                  <video
                    src={ex.demo.url}
                    preload="metadata"
                    muted
                    playsInline
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                ) : (
                  <>
                    <span className="scanlines" />
                    <span className="label">{t("biblioteka.demoLabel")}</span>
                    <span className="play">
                      <Icons.Play />
                    </span>
                  </>
                )}
              </div>
              <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{ex.name}</h3>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {ex.isBrand && <span className="badge">{t("biblioteka.brandBadge")}</span>}
                  <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>{ex.unit}</span>
                </div>
              </div>
              {ex.description.length > 0 && (
                <div
                  className="text-sm muted"
                  style={{
                    marginTop: 8,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {ex.description}
                </div>
              )}
              {ex.tags.some((t) => knownCategoryNames.has(t)) && (
                <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                  {ex.tags
                    .filter((t) => knownCategoryNames.has(t))
                    .slice(0, 4)
                    .map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                </div>
              )}
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
