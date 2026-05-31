import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
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
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { type PlForms, fmtDate, pluralizePl } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";
import { PlanRepoError, deletePlan } from "~/lib/plans";

const PAGE_SIZE = 20;
const PLAN: PlForms = { one: "plan", few: "plany", many: "planów" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  // Tab badge counts (active + draft only) — computed before applying search query.
  const statusCounts = await db
    .select({ status: schema.plans.status, c: count() })
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, user.id), ne(schema.plans.status, "archived")))
    .groupBy(schema.plans.status);

  type StatusKey = "all" | "active" | "draft";
  const counts = { all: 0, active: 0, draft: 0 } as Record<StatusKey, number>;
  for (const r of statusCounts) {
    if (r.status === "active" || r.status === "draft") {
      counts[r.status] = Number(r.c);
      counts.all += Number(r.c);
    }
  }

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "newest", label: "Najnowsze" },
      { key: "oldest", label: "Najstarsze" },
      { key: "name_asc", label: "Nazwa A–Z" },
      { key: "published", label: "Ostatnio opublikowane" },
    ],
    defaultSort: "newest",
    filterGroups: [
      {
        param: "status",
        label: "Status",
        options: [
          { value: "all", label: `Wszystkie (${counts.all})` },
          { value: "active", label: `Aktywne (${counts.active})` },
          { value: "draft", label: `Drafty (${counts.draft})` },
        ],
        defaultValue: "all",
      },
    ],
    searchable: true,
  };

  const controls = parseListControls(url.searchParams, spec);
  const status = controls.filters.status ?? "all";

  // Archived plans are hidden from the trainer UI — they're created automatically
  // on publish to preserve history but offer no actionable value here.
  const conditions = [eq(schema.plans.trainerId, user.id), ne(schema.plans.status, "archived")];
  if (status !== "all") {
    conditions.push(eq(schema.plans.status, status as "active" | "draft"));
  }
  if (controls.q.length > 0) {
    conditions.push(
      or(
        ilike(schema.plans.name, `%${controls.q}%`),
        ilike(schema.users.displayName, `%${controls.q}%`),
      )!,
    );
  }

  const orderBy =
    controls.sort === "oldest"
      ? [asc(schema.plans.createdAt)]
      : controls.sort === "name_asc"
        ? [asc(schema.plans.name)]
        : controls.sort === "published"
          ? [sql`${schema.plans.publishedAt} DESC NULLS LAST`]
          : [desc(schema.plans.createdAt)];

  // Total must reflect the search/status filter (not just the status count).
  const [totalRow] = await db
    .select({ c: count() })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .where(and(...conditions));
  const total = Number(totalRow?.c ?? 0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const sessionCountSub = db.$with("session_counts").as(
    db
      .select({ planId: schema.planSessions.planId, c: count().as("c") })
      .from(schema.planSessions)
      .groupBy(schema.planSessions.planId),
  );

  const rows = await db
    .with(sessionCountSub)
    .select({
      plan: schema.plans,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
      sessionCount: sql<number>`COALESCE(${sessionCountSub.c}, 0)::int`,
    })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .leftJoin(sessionCountSub, eq(sessionCountSub.planId, schema.plans.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset(offset);

  const items = rows.map((r) => ({
    id: r.plan.id,
    name: r.plan.name,
    version: r.plan.version,
    status: r.plan.status,
    publishedAt: r.plan.publishedAt,
    createdAt: r.plan.createdAt,
    trainee: r.trainee,
    sessionCount: r.sessionCount,
  }));

  return { items, spec, controls, counts, page: safePage, totalPages, total };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent !== "delete") return null;
  const planId = String(fd.get("planId") ?? "");
  if (!planId) return { error: "Brak id planu." };
  try {
    const result = await deletePlan(db, planId, user.id);
    if (result.kind === "deleted") {
      return { success: "Plan usunięty." };
    }
    return {
      success: `Plan zarchiwizowany — ma ${result.logCount} zapisanych sesji, historia została zachowana.`,
    };
  } catch (e) {
    if (e instanceof PlanRepoError) return { error: e.userMessage };
    throw e;
  }
}

export default function PlanyList() {
  const { items, spec, controls, counts, page, totalPages, total } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const status = controls.filters.status ?? "all";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Plany</h1>
          <div className="sub">
            {counts.all === 0
              ? "Brak planów."
              : `${counts.all} ${pluralizePl(counts.all, PLAN)} łącznie · ${counts.active} aktywnych · ${counts.draft} draftów.`}
          </div>
        </div>
        <Link to="/trener/plany/nowy" className="btn btn-primary">
          <Icons.Plus /> Nowy plan
        </Link>
      </div>

      {actionData != null && "success" in actionData && actionData.success != null && (
        <output
          style={{
            display: "block",
            color: "var(--ok)",
            fontSize: 13,
            marginBottom: 14,
            padding: "8px 12px",
            border: "1px solid var(--ok)",
            borderRadius: 8,
            background: "var(--accent-soft)",
          }}
        >
          {actionData.success}
        </output>
      )}
      {actionData != null && "error" in actionData && actionData.error != null && (
        <p
          role="alert"
          style={{
            color: "var(--danger)",
            fontSize: 13,
            marginBottom: 14,
            padding: "8px 12px",
            border: "1px solid var(--danger)",
            borderRadius: 8,
          }}
        >
          {actionData.error}
        </p>
      )}

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder="Szukaj planu lub podopiecznego…"
      />

      {items.length === 0 ? (
        <EmptyState status={status} hasQuery={controls.q.length > 0} />
      ) : (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr auto", gap: 14 }}
          >
            <div>Plan</div>
            <div>Podopieczny</div>
            <div>Sesje</div>
            <div>Status</div>
            <div />
          </div>
          {items.map((p) => (
            <div
              key={p.id}
              className="list-row"
              style={{
                gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr auto",
                gap: 14,
                position: "relative",
              }}
            >
              <Link
                to={`/trener/plany/${p.id}`}
                aria-label={`Otwórz ${p.name}`}
                style={{ position: "absolute", inset: 0, zIndex: 1 }}
              />
              <div style={{ position: "relative", zIndex: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                <div className="mono text-xs muted" style={{ marginTop: 2 }}>
                  v{p.version}
                  {p.publishedAt && p.status === "active" && (
                    <> · od {fmtDate(p.publishedAt.toString())}</>
                  )}
                </div>
              </div>
              <div className="text-sm" style={{ position: "relative", zIndex: 0 }}>
                {p.trainee.displayName}
              </div>
              <div className="mono text-sm" style={{ position: "relative", zIndex: 0 }}>
                {p.sessionCount} <span className="muted">sesji</span>
              </div>
              <div style={{ position: "relative", zIndex: 0 }}>
                <StatusBadge status={p.status} />
              </div>
              <div
                className="row"
                style={{
                  gap: 4,
                  position: "relative",
                  zIndex: 2,
                  justifyContent: "flex-end",
                  color: "var(--muted-2)",
                }}
              >
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="planId" value={p.id} />
                  <ConfirmSubmitButton
                    className="btn btn-sm btn-icon btn-ghost"
                    style={{ color: "var(--danger)" }}
                    title="Usuń plan"
                    aria-label={`Usuń plan ${p.name}`}
                    confirmOptions={{
                      title: `Usunąć plan „${p.name}"?`,
                      message: `Podopieczny: ${p.trainee.displayName}.\n\nJeśli plan ma już zalogowane sesje, zostanie zarchiwizowany (historia zachowana). Inaczej — skasowany na stałe.`,
                      destructive: true,
                      confirmText: "Usuń plan",
                    }}
                  >
                    <Icons.X />
                  </ConfirmSubmitButton>
                </Form>
                <Icons.Chev />
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, PLAN)}
      />
    </div>
  );
}

function EmptyState({ status, hasQuery }: { status: string; hasQuery: boolean }) {
  const title =
    status === "active"
      ? "Brak aktywnych planów"
      : status === "draft"
        ? "Brak draftów"
        : "Brak planów";
  let hint: string;
  if (hasQuery) {
    hint = "Spróbuj innego zapytania.";
  } else if (status === "draft") {
    hint = "Wszystko opublikowane.";
  } else if (status === "all") {
    hint = "Kliknij Nowy plan, aby zacząć.";
  } else {
    hint = "Zmień filtr, by zobaczyć inne plany.";
  }
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div>{hint}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "active" | "archived" }) {
  const cfg: Record<typeof status, { cls: string; label: string }> = {
    active: { cls: "badge active", label: "aktywny" },
    draft: { cls: "badge draft", label: "draft" },
    archived: { cls: "badge archived", label: "archiwum" },
  };
  const s = cfg[status];
  return (
    <span className={s.cls}>
      <span className="badge-dot" />
      {s.label}
    </span>
  );
}
