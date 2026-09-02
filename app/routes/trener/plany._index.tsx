import type { PlanStatusCounts } from "@kalisthenos/api-client";
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
import { requireUser } from "~/lib/api/auth";
import { type PlForms, fmtDate, pluralizePl } from "~/lib/format";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";
import {
  PlanError,
  type PlanSort,
  type PlanStatusFilter,
  deletePlan,
  listPlansForTrainer,
  planDeleteOutcomeMessage,
} from "~/lib/plans";

const PLAN: PlForms = { one: "plan", few: "plany", many: "planów" };

// Etykiety zakładek dostają liczby dopiero PO odpowiedzi — `counts` przychodzą
// razem z listą. Parsowanie kontrolek liczb nie potrzebuje: zna wyłącznie wartości.
const PLAN_LIST_SPEC: ListControlsSpec = {
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
        { value: "all", label: "Wszystkie" },
        { value: "active", label: "Aktywne" },
        { value: "draft", label: "Drafty" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

function specWithCounts(counts: PlanStatusCounts): ListControlsSpec {
  return {
    ...PLAN_LIST_SPEC,
    filterGroups: PLAN_LIST_SPEC.filterGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        // Wartości filtra to dokładnie klucze `counts` (`all` · `active` · `draft`).
        label: `${option.label} (${counts[option.value as keyof PlanStatusCounts]})`,
      })),
    })),
  };
}

export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, PLAN_LIST_SPEC);

  const result = await listPlansForTrainer(api, {
    status: (controls.filters.status ?? "all") as PlanStatusFilter,
    q: controls.q.length > 0 ? controls.q : undefined,
    sort: controls.sort as PlanSort,
    page,
  });

  const items = result.items.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    status: p.status,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    trainee: { id: p.traineeId, displayName: p.traineeName },
    sessionCount: p.sessionCount,
  }));

  return {
    items,
    spec: specWithCounts(result.counts),
    controls,
    counts: result.counts,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  };
}

export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent !== "delete") return null;
  const planId = String(fd.get("planId") ?? "");
  if (!planId) return { error: "Brak id planu." };
  try {
    const outcome = await deletePlan(api, planId);
    return { success: planDeleteOutcomeMessage(outcome) };
  } catch (e) {
    if (e instanceof PlanError) return { error: e.userMessage };
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
                  {p.publishedAt && p.status === "active" && <> · od {fmtDate(p.publishedAt)}</>}
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
