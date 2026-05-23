import { and, arrayContains, eq, ilike, isNull } from "drizzle-orm";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import {
  CategoryError,
  addCategory,
  deleteCategory,
  listCategoriesForTrainer,
} from "~/lib/categories";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { signFileUrl } from "~/lib/files";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const tag = url.searchParams.get("tag") ?? "all";

  const categories = await listCategoriesForTrainer(db, user.id);
  const categoryNames = new Set(categories.map((c) => c.name));

  const conditions = [
    eq(schema.exercises.trainerId, user.id),
    isNull(schema.exercises.archivedAt),
  ];
  if (q.length > 0) {
    conditions.push(ilike(schema.exercises.name, `%${q}%`));
  }
  if (tag !== "all" && categoryNames.has(tag)) {
    conditions.push(arrayContains(schema.exercises.tags, [tag]));
  }

  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(...conditions))
    .orderBy(schema.exercises.name);

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

  return { items, q, tag, categories };
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
  const { items, q, tag, categories } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Biblioteka ćwiczeń</h1>
          <div className="sub">
            {items.length === 0
              ? "Brak ćwiczeń."
              : `${items.length} ${pluralizePozycja(items.length)}.`}
          </div>
        </div>
        <Link to="/trener/biblioteka/nowe" className="btn btn-primary">
          <Icons.Plus /> Nowe ćwiczenie
        </Link>
      </div>

      <Form method="get" className="row" style={{ gap: 8, marginBottom: 14 }}>
        <div className="input-search" style={{ flex: 1 }}>
          <Icons.Search />
          <input
            name="q"
            defaultValue={q}
            placeholder="Szukaj po nazwie…"
            className="input"
          />
        </div>
        {tag !== "all" && <input type="hidden" name="tag" value={tag} />}
        <button type="submit" className="btn">
          Szukaj
        </button>
      </Form>

      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <FilterChip label="Wszystkie" active={tag === "all"} value="all" searchParams={searchParams} />
        {categories.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            active={tag === c.name}
            value={c.name}
            searchParams={searchParams}
          />
        ))}
      </div>

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
                  <button
                    type="submit"
                    className="tag"
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      cursor: "pointer",
                      border: 0,
                    }}
                    title="Usuń kategorię"
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Usunąć kategorię „${c.name}"? Ćwiczenia ją zachowują w tagach, ale zniknie z listy.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {c.name}
                    <Icons.X style={{ fontSize: 11 }} />
                  </button>
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
                <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>
                  {ex.unit}
                </span>
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
              {ex.tags.length > 0 && (
                <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                  {ex.tags.slice(0, 4).map((t) => (
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
    </div>
  );
}

function FilterChip({
  label,
  active,
  value,
  searchParams,
}: {
  label: string;
  active: boolean;
  value: string;
  searchParams: URLSearchParams;
}) {
  const newParams = new URLSearchParams(searchParams);
  if (value === "all") newParams.delete("tag");
  else newParams.set("tag", value);
  const qs = newParams.toString();
  return (
    <Link
      to={qs.length > 0 ? `?${qs}` : "."}
      className={active ? "btn btn-sm btn-dark" : "btn btn-sm"}
    >
      {label}
    </Link>
  );
}

function pluralizePozycja(n: number): string {
  if (n === 1) return "pozycja";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "pozycji";
  if (last >= 2 && last <= 4) return "pozycje";
  return "pozycji";
}
