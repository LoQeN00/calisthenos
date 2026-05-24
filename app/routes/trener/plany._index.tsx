import { and, count, eq, sql } from "drizzle-orm";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";
import { deletePlan, PlanRepoError } from "~/lib/plans";

const STATUS_TABS = ["all", "active", "draft", "archived"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function parseStatus(raw: string | null): StatusTab {
  if (raw == null) return "all";
  return (STATUS_TABS as readonly string[]).includes(raw) ? (raw as StatusTab) : "all";
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const status = parseStatus(url.searchParams.get("status"));

  const sessionCountSub = db.$with("session_counts").as(
    db
      .select({ planId: schema.planSessions.planId, c: count().as("c") })
      .from(schema.planSessions)
      .groupBy(schema.planSessions.planId),
  );

  const conditions = [eq(schema.plans.trainerId, user.id)];
  if (status !== "all") {
    conditions.push(eq(schema.plans.status, status));
  }

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
    .orderBy(sql`${schema.plans.createdAt} DESC`);

  // Counts for tab badges. One query, grouped by status.
  const statusCounts = await db
    .select({ status: schema.plans.status, c: count() })
    .from(schema.plans)
    .where(eq(schema.plans.trainerId, user.id))
    .groupBy(schema.plans.status);
  const counts = {
    all: 0,
    active: 0,
    draft: 0,
    archived: 0,
  } as Record<StatusTab, number>;
  for (const r of statusCounts) {
    counts[r.status as Exclude<StatusTab, "all">] = Number(r.c);
    counts.all += Number(r.c);
  }

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

  return { items, status, counts };
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
  const { items, status, counts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  const TAB_LABELS: Record<StatusTab, string> = {
    all: "Wszystkie",
    active: "Aktywne",
    draft: "Drafty",
    archived: "Archiwum",
  };

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
              : `${counts.all} ${pluralizePlan(counts.all)} łącznie · ${counts.active} aktywnych · ${counts.draft} draftów · ${counts.archived} w archiwum.`}
          </div>
        </div>
        <Link to="/trener/plany/nowy" className="btn btn-primary">
          <Icons.Plus /> Nowy plan
        </Link>
      </div>

      {actionData != null && "success" in actionData && actionData.success != null && (
        <p
          role="status"
          style={{
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
        </p>
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

      <div className="row wrap" style={{ gap: 6, marginBottom: 18 }}>
        {STATUS_TABS.map((tab) => {
          const isActive = tab === status;
          const newParams = new URLSearchParams(searchParams);
          if (tab === "all") newParams.delete("status");
          else newParams.set("status", tab);
          const qs = newParams.toString();
          return (
            <Link
              key={tab}
              to={qs.length > 0 ? `?${qs}` : ""}
              className={isActive ? "btn btn-sm btn-dark" : "btn btn-sm"}
            >
              {TAB_LABELS[tab]}
              <span
                className="mono"
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                {counts[tab]}
              </span>
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h3>
            {status === "all"
              ? "Brak planów"
              : status === "active"
                ? "Brak aktywnych planów"
                : status === "draft"
                  ? "Brak draftów"
                  : "Archiwum jest puste"}
          </h3>
          <div>
            {status === "draft"
              ? "Wszystko opublikowane."
              : status === "all"
                ? "Kliknij „Nowy plan”, aby zacząć."
                : "Zmień zakładkę, by zobaczyć inne plany."}
          </div>
        </div>
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

function pluralizePlan(n: number): string {
  if (n === 1) return "plan";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "planów";
  if (last >= 2 && last <= 4) return "plany";
  return "planów";
}
