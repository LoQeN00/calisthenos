import { and, count, eq, sql } from "drizzle-orm";
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

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

export default function PlanyList() {
  const { items, status, counts } = useLoaderData<typeof loader>();
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
            style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr 0.4fr", gap: 14 }}
          >
            <div>Plan</div>
            <div>Podopieczny</div>
            <div>Sesje</div>
            <div>Status</div>
            <div />
          </div>
          {items.map((p) => (
            <Link
              key={p.id}
              to={`/trener/plany/${p.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr 0.4fr", gap: 14 }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                <div className="mono text-xs muted" style={{ marginTop: 2 }}>
                  v{p.version}
                  {p.publishedAt && p.status === "active" && (
                    <> · od {fmtDate(p.publishedAt.toString())}</>
                  )}
                </div>
              </div>
              <div className="text-sm">{p.trainee.displayName}</div>
              <div className="mono text-sm">
                {p.sessionCount} <span className="muted">sesji</span>
              </div>
              <div>
                <StatusBadge status={p.status} />
              </div>
              <div style={{ textAlign: "right", color: "var(--muted-2)" }}>
                <Icons.Chev />
              </div>
            </Link>
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
