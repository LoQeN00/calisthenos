import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { useTranslation } from "react-i18next";
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
import { type Lang, langToIntlLocale } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";
import { PlanRepoError, deletePlan } from "~/lib/plans";

const PAGE_SIZE = 20;

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

  // Spec bez etykiet — używany server-side wyłącznie do parseListControls.
  // Etykiety budujemy w komponencie (z tłumaczeniami) przy renderze.
  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "newest", label: "" },
      { key: "oldest", label: "" },
      { key: "name_asc", label: "" },
      { key: "published", label: "" },
    ],
    defaultSort: "newest",
    filterGroups: [
      {
        param: "status",
        label: "",
        options: [
          { value: "all", label: "" },
          { value: "active", label: "" },
          { value: "draft", label: "" },
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
  if (!planId) return { error: "plany.actionMissingPlanId" };
  try {
    const result = await deletePlan(db, planId, user.id);
    if (result.kind === "deleted") {
      return { success: "plany.actionDeleted" };
    }
    return { success: "plany.actionArchived", count: result.logCount };
  } catch (e) {
    if (e instanceof PlanRepoError) return { error: e.userMessage };
    throw e;
  }
}

export default function PlanyList() {
  const { items, spec: baseSpec, controls, counts, page, totalPages, total } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerPlany");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";

  const status = controls.filters.status ?? "all";

  // Spec z przetłumaczonymi etykietami — budowany przy renderze (loader zwraca
  // wersję bez etykiet, użytą tylko do parseListControls).
  const spec: ListControlsSpec = {
    ...baseSpec,
    sortOptions: [
      { key: "newest", label: t("plany.sort.newest") },
      { key: "oldest", label: t("plany.sort.oldest") },
      { key: "name_asc", label: t("plany.sort.name_asc") },
      { key: "published", label: t("plany.sort.published") },
    ],
    filterGroups: [
      {
        param: "status",
        label: t("plany.filterStatusLabel"),
        options: [
          { value: "all", label: t("plany.filterAll", { count: counts.all }) },
          { value: "active", label: t("plany.filterActive", { count: counts.active }) },
          { value: "draft", label: t("plany.filterDraft", { count: counts.draft }) },
        ],
        defaultValue: "all",
      },
    ],
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("plany.eyebrow")}
          </div>
          <h1>{t("plany.title")}</h1>
          <div className="sub">
            {counts.all === 0
              ? t("plany.subEmpty")
              : t("plany.subStats", {
                  total: counts.all,
                  totalWord: t("plany.totalWord", { count: counts.all }),
                  active: counts.active,
                  draft: counts.draft,
                })}
          </div>
        </div>
        <Link to="/trener/plany/nowy" className="btn btn-primary">
          <Icons.Plus /> {t("plany.newPlan")}
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
          {tDyn(t, actionData.success, "count" in actionData ? { count: actionData.count } : undefined)}
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
          {actionData.error.startsWith("plany.") ? tDyn(t, actionData.error) : actionData.error}
        </p>
      )}

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder={t("plany.searchPlaceholder")}
      />

      {items.length === 0 ? (
        <EmptyState status={status} hasQuery={controls.q.length > 0} t={t} />
      ) : (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr auto", gap: 14 }}
          >
            <div>{t("plany.colPlan")}</div>
            <div>{t("plany.colTrainee")}</div>
            <div>{t("plany.colSessions")}</div>
            <div>{t("plany.colStatus")}</div>
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
                aria-label={t("plany.open", { name: p.name })}
                style={{ position: "absolute", inset: 0, zIndex: 1 }}
              />
              <div style={{ position: "relative", zIndex: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                <div className="mono text-xs muted" style={{ marginTop: 2 }}>
                  v{p.version}
                  {p.publishedAt && p.status === "active" && (
                    <> · {t("plany.versionFrom", { date: fmtDate(p.publishedAt.toString(), locale) })}</>
                  )}
                </div>
              </div>
              <div className="text-sm" style={{ position: "relative", zIndex: 0 }}>
                {p.trainee.displayName}
              </div>
              <div className="mono text-sm" style={{ position: "relative", zIndex: 0 }}>
                {p.sessionCount} <span className="muted">{t("plany.sessionsWord")}</span>
              </div>
              <div style={{ position: "relative", zIndex: 0 }}>
                <StatusBadge status={p.status} t={t} />
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
                    title={t("plany.deletePlanTitleShort")}
                    aria-label={t("plany.deletePlanAria", { name: p.name })}
                    confirmOptions={{
                      title: t("plany.confirmDeleteTitle", { name: p.name }),
                      message: t("plany.confirmDeleteMessage", {
                        trainee: p.trainee.displayName,
                      }),
                      destructive: true,
                      confirmText: t("plany.confirmDeleteConfirm"),
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
        totalLabel={t("plany.totalWord", { count: total })}
      />
    </div>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: przeciążenia TFunction są złożone; tu wystarczy luźny podpis.
type TFn = (...args: any[]) => string;

function EmptyState({ status, hasQuery, t }: { status: string; hasQuery: boolean; t: TFn }) {
  const title =
    status === "active"
      ? t("plany.emptyActiveTitle")
      : status === "draft"
        ? t("plany.emptyDraftTitle")
        : t("plany.emptyAllTitle");
  let hint: string;
  if (hasQuery) {
    hint = t("plany.emptyHintQuery");
  } else if (status === "draft") {
    hint = t("plany.emptyHintDraft");
  } else if (status === "all") {
    hint = t("plany.emptyHintAll");
  } else {
    hint = t("plany.emptyHintOther");
  }
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div>{hint}</div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: "draft" | "active" | "archived"; t: TFn }) {
  const cfg: Record<typeof status, { cls: string; label: string }> = {
    active: { cls: "badge active", label: t("plany.badgeActive") },
    draft: { cls: "badge draft", label: t("plany.badgeDraft") },
    archived: { cls: "badge archived", label: t("plany.badgeArchived") },
  };
  const s = cfg[status];
  return (
    <span className={s.cls}>
      <span className="badge-dot" />
      {s.label}
    </span>
  );
}
