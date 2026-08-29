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
import { db } from "~/lib/db/client";
import {
  type ExerciseFilter,
  type ExerciseSort,
  countExercisesForTrainer,
  listExercisesForTrainer,
} from "~/lib/exercises";
import { signFileUrl } from "~/lib/files";
import { type PlForms, pluralizePl } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";

const PAGE_SIZE = 24;
const POZYCJA: PlForms = { one: "pozycja", few: "pozycje", many: "pozycji" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  const categories = await listCategoriesForTrainer(db, user.id);
  const categoryNames = new Set(categories.map((c) => c.name));

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "name_asc", label: "Nazwa A–Z" },
      { key: "name_desc", label: "Nazwa Z–A" },
      { key: "newest", label: "Najnowsze" },
      { key: "oldest", label: "Najstarsze" },
    ],
    defaultSort: "name_asc",
    filterGroups: [
      {
        param: "tag",
        label: "Kategoria",
        options: [
          { value: "all", label: "Wszystkie" },
          ...categories.map((c) => ({ value: c.name, label: c.name })),
        ],
        defaultValue: "all",
      },
      {
        param: "unit",
        label: "Jednostka",
        options: [
          { value: "all", label: "Wszystkie" },
          { value: "REPS", label: "Powtórzenia" },
          { value: "SEC", label: "Czas" },
        ],
        defaultValue: "all",
      },
    ],
    searchable: true,
  };

  const controls = parseListControls(url.searchParams, spec);

  const filterTag = controls.filters.tag ?? "all";
  const filterUnit = controls.filters.unit ?? "all";
  // Nieznana kategoria z URL-a jest ignorowana — tak samo jak dotychczas.
  const filter: ExerciseFilter = {
    q: controls.q.length > 0 ? controls.q : undefined,
    tag: filterTag !== "all" && categoryNames.has(filterTag) ? filterTag : undefined,
    unit: filterUnit === "REPS" || filterUnit === "SEC" ? filterUnit : undefined,
  };

  const total = await countExercisesForTrainer(db, user.id, filter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const rows = await listExercisesForTrainer(db, user.id, {
    ...filter,
    sort: controls.sort as ExerciseSort,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });

  const items = rows.map((r) => ({
    id: r.exercise.id,
    name: r.exercise.name,
    unit: r.exercise.unit,
    description: r.exercise.description,
    tags: r.exercise.tags,
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
  // Po usunięciu kategorii jej nazwa zostaje w `exercises.tags[]` (świadome), ale
  // nie powinna już wisieć jako chip — pokazujemy tylko tagi będące znaną kategorią.
  const knownCategoryNames = new Set(categories.map((c) => c.name));

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Biblioteka ćwiczeń</h1>
          <div className="sub">
            {total === 0 ? "Brak ćwiczeń." : `${total} ${pluralizePl(total, POZYCJA)}.`}
          </div>
        </div>
        <Link to="/trener/biblioteka/nowe" className="btn btn-primary">
          <Icons.Plus /> Nowe ćwiczenie
        </Link>
      </div>

      <ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po nazwie…" />

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
          <span>Zarządzaj kategoriami ({categories.length})</span>
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
                    title="Usuń kategorię"
                    confirmOptions={{
                      title: `Usunąć kategorię „${c.name}"?`,
                      message:
                        "Ćwiczenia ją zachowują w swoich tagach, ale zniknie z listy filtrów.",
                      destructive: true,
                      confirmText: "Usuń",
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
              placeholder="np. pull, push, legs"
              required
              className="input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-sm btn-primary">
              <Icons.Plus /> Dodaj
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
          <h3>Nic nie znaleziono</h3>
          <div>Dodaj pierwsze ćwiczenie, by zacząć.</div>
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
                    <span className="label">DEMO</span>
                    <span className="play">
                      <Icons.Play />
                    </span>
                  </>
                )}
              </div>
              <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{ex.name}</h3>
                <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>{ex.unit}</span>
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
        totalLabel={pluralizePl(total, POZYCJA)}
      />
    </div>
  );
}
