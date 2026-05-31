import { and, desc, eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { daysAgo, fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { deletePlan, PlanRepoError } from "~/lib/plans";
import { deleteTraineeFully, TraineeDeleteError } from "~/lib/trainees";
import { countLogsForTrainee, listLogsForTrainee, type LogSort } from "~/lib/workouts";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "date_desc", label: "Najnowsze" },
    { key: "date_asc", label: "Najstarsze" },
    { key: "hardest", label: "Najtrudniejsze" },
    { key: "easiest", label: "Najłatwiejsze" },
    { key: "sets_desc", label: "Najwięcej serii" },
  ],
  defaultSort: "date_desc",
  filterGroups: [
    {
      param: "video",
      label: "Wideo",
      options: [
        { value: "all", label: "Wszystkie" },
        { value: "with", label: "Z wideo" },
        { value: "without", label: "Bez wideo" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

const LOGS_PAGE_SIZE = 20;

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const url = new URL(args.request.url);
  const logsPage = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);

  const traineeRows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  const trainee = traineeRows[0];
  if (!trainee) throw new Response("not found", { status: 404 });

  const plans = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, user.id), eq(schema.plans.traineeId, traineeId)))
    .orderBy(desc(schema.plans.createdAt));

  const activePlan = plans.find((p) => p.status === "active") ?? null;
  const draftPlan = plans.find((p) => p.status === "draft") ?? null;

  const video = (controls.filters.video ?? "all") as "all" | "with" | "without";
  const totalLogs = await countLogsForTrainee(db, traineeId, { q: controls.q, video });
  const totalLogPages = Math.max(1, Math.ceil(totalLogs / LOGS_PAGE_SIZE));
  const safeLogsPage = Math.min(logsPage, totalLogPages);
  const logsOffset = (safeLogsPage - 1) * LOGS_PAGE_SIZE;
  const logs = await listLogsForTrainee(db, traineeId, {
    limit: LOGS_PAGE_SIZE,
    offset: logsOffset,
    sort: controls.sort as LogSort,
    q: controls.q,
    video,
  });

  return {
    trainee,
    activePlan,
    draftPlan,
    logs,
    logsPage: safeLogsPage,
    totalLogPages,
    totalLogs,
    spec,
    controls,
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  // Re-verify trainee ownership before any mutation.
  const traineeRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (traineeRows.length === 0) {
    throw new Response("not found", { status: 404 });
  }

  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "delete-trainee") {
    try {
      const { displayName } = await deleteTraineeFully(db, user.id, traineeId);
      throw redirect(`/trener/podopieczni?usuniety=${encodeURIComponent(displayName)}`);
    } catch (e) {
      if (e instanceof Response) throw e;
      if (e instanceof TraineeDeleteError) return { error: e.userMessage };
      throw e;
    }
  }

  if (intent !== "delete-plan") return null;
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

export default function TrenerPodopiecznyDetail() {
  const { trainee, activePlan, draftPlan, logs, logsPage, totalLogPages, totalLogs, spec, controls } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <span className="current">{trainee.displayName}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny{trainee.joinedOn && ` · od ${fmtDate(trainee.joinedOn)}`}
          </div>
          <h1>{trainee.displayName}</h1>
          {totalLogs > 0 && logs[0] && (
            <div className="sub">
              Ostatnia sesja{" "}
              <span style={{ color: "var(--ink-2)" }} className="mono">
                {daysAgo(logs[0].performedOn)}
              </span>{" "}
              · łącznie <span className="mono">{totalLogs}</span> {pluralizePl(totalLogs, SESJA)}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to={`/trener/podopieczni/${trainee.id}/statystyki`} className="btn">
            <Icons.Chart /> Statystyki
          </Link>
          <Link to={`/trener/podopieczni/${trainee.id}/progresja`} className="btn">
            <Icons.Trend /> Progresja
          </Link>
          <Link to={`/trener/podopieczni/${trainee.id}/sylwetka`} className="btn">
            <Icons.Camera /> Sylwetka
          </Link>
          <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`} className="btn">
            <Icons.Consult /> Konsultacje
          </Link>
          {draftPlan == null && (
            <Link to={`/trener/plany/nowy?traineeId=${trainee.id}`} className="btn btn-primary">
              <Icons.Plus /> Nowy plan
            </Link>
          )}
        </div>
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

      {activePlan && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
                <span className="badge active">
                  <span className="badge-dot" />
                  aktywny plan
                </span>
                <span className="mono text-xs muted">
                  v{activePlan.version}
                  {activePlan.publishedAt && (
                    <> · od {fmtDate(activePlan.publishedAt.toString())}</>
                  )}
                </span>
              </div>
              <h2 style={{ fontSize: 19, marginBottom: 4 }}>{activePlan.name}</h2>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to={`/trener/plany/${activePlan.id}`} className="btn btn-ghost">
                Pokaż
              </Link>
              <Link to={`/trener/plany/${activePlan.id}?edit=1`} className="btn">
                <Icons.Edit /> Edytuj plan
              </Link>
              <DeletePlanForm planId={activePlan.id} planName={activePlan.name} />
            </div>
          </div>
        </div>
      )}

      {draftPlan && draftPlan.id !== activePlan?.id && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            borderStyle: "dashed",
            borderColor: "var(--line-2)",
            background: "var(--surface)",
          }}
        >
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
                <span className="badge draft">
                  <span className="badge-dot" />
                  draft
                </span>
                <span className="mono text-xs muted">
                  Wersja {draftPlan.version} (Draft)
                  {draftPlan.basedOnVersion != null && (
                    <> — bazuje na wersji {draftPlan.basedOnVersion}</>
                  )}
                </span>
              </div>
              <h3 style={{ fontSize: 17 }}>{draftPlan.name}</h3>
              <div className="text-xs muted" style={{ marginTop: 4 }}>
                niedokończony
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to={`/trener/plany/${draftPlan.id}`} className="btn btn-dark">
                Wróć do edycji <Icons.Chev />
              </Link>
              <DeletePlanForm planId={draftPlan.id} planName={draftPlan.name} />
            </div>
          </div>
        </div>
      )}

      {activePlan == null && draftPlan == null && (
        <div
          className="card"
          style={{ marginBottom: 14, borderStyle: "dashed", borderColor: "var(--line-2)" }}
        >
          <div className="row between" style={{ alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>Brak planu</h3>
              <div className="text-sm muted">
                Ten podopieczny nie ma jeszcze przypisanego planu treningowego.
              </div>
            </div>
            <Link to={`/trener/plany/nowy?traineeId=${trainee.id}`} className="btn btn-primary">
              <Icons.Plus /> Nowy plan
            </Link>
          </div>
        </div>
      )}

      <h2 style={{ margin: "28px 0 12px", fontSize: 17 }}>Historia treningów</h2>
      <ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po nazwie sesji…" />
      {totalLogs === 0 ? (
        <div className="empty">
          <h3>Brak sesji</h3>
          <div>Ten podopieczny jeszcze nic nie zarejestrował.</div>
        </div>
      ) : (
        <>
          <div className="list">
            {logs.map((log) => (
              <Link
                key={log.id}
                to={`/trener/podopieczni/${trainee.id}/log/${log.id}`}
                className="list-row"
                style={{ gridTemplateColumns: "76px 1fr auto auto", gap: 14 }}
              >
                <div className="mono text-xs muted">{fmtDate(log.performedOn)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{log.sessionName}</div>
                  <div className="text-xs muted" style={{ marginTop: 2 }}>
                    <span className="mono">{log.exerciseCount}</span> ćwiczeń ·{" "}
                    <span className="mono">{log.setCount}</span> serii · śr.{" "}
                    {log.avgDifficulty == null ? "—" : <><span className="mono">{log.avgDifficulty}</span>/10</>}
                    {log.hasVideo && " · video"}
                    {log.note && (
                      <span style={{ fontStyle: "italic", color: "var(--ink-2)" }}>
                        {" "}
                        · „{log.note.slice(0, 40)}
                        {log.note.length > 40 ? "…" : ""}"
                      </span>
                    )}
                  </div>
                </div>
                <DifficultyBadge avg={log.avgDifficulty} />
                <Icons.Chev style={{ color: "var(--muted-2)" }} />
              </Link>
            ))}
          </div>
          <Pagination
            page={logsPage}
            totalPages={totalLogPages}
            total={totalLogs}
            totalLabel={pluralizePl(totalLogs, SESJA)}
          />
        </>
      )}

      <div
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid var(--line)",
        }}
      >
        <h2 className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
          Strefa niebezpieczna
        </h2>
        <div
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--danger)",
            borderStyle: "dashed",
          }}
        >
          <div className="row between" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Usuń podopiecznego
              </div>
              <div className="text-xs muted">
                Konto, wszystkie plany, historia treningów, zdjęcia sylwetki i nagrania video
                zostaną <strong>nieodwracalnie skasowane</strong>.
              </div>
            </div>
            <Form method="post" style={{ flexShrink: 0 }}>
              <input type="hidden" name="intent" value="delete-trainee" />
              <ConfirmSubmitButton
                className="btn btn-danger"
                confirmOptions={{
                  title: `Usunąć podopiecznego „${trainee.displayName}"?`,
                  message:
                    "Wszystkie dane tej osoby (plany, sesje, video, zdjęcia) zostaną nieodwracalnie skasowane. Tej operacji nie da się cofnąć.",
                  destructive: true,
                  confirmText: "Usuń podopiecznego",
                }}
              >
                <Icons.Trash /> Usuń podopiecznego
              </ConfirmSubmitButton>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeletePlanForm({ planId, planName }: { planId: string; planName: string }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="delete-plan" />
      <input type="hidden" name="planId" value={planId} />
      <ConfirmSubmitButton
        className="btn btn-icon btn-ghost"
        style={{ color: "var(--danger)" }}
        title="Usuń plan"
        aria-label={`Usuń plan ${planName}`}
        confirmOptions={{
          title: `Usunąć plan „${planName}"?`,
          message:
            "Jeśli plan ma już zalogowane sesje, zostanie zarchiwizowany (historia zachowana). Inaczej — skasowany na stałe.",
          destructive: true,
          confirmText: "Usuń plan",
        }}
      >
        <Icons.X />
      </ConfirmSubmitButton>
    </Form>
  );
}

function DifficultyBadge({ avg }: { avg: number | null }) {
  if (avg == null) {
    return (
      <span
        className="badge"
        style={{ color: "var(--muted)" }}
      >
        —
      </span>
    );
  }
  if (avg === 0) return <span />;
  const tone = avg <= 4 ? "var(--ok)" : avg <= 7 ? "var(--warn)" : "var(--danger)";
  return (
    <span
      className="mono"
      style={{
        fontSize: 12,
        color: tone,
        fontWeight: 600,
        background: "var(--surface-2)",
        padding: "2px 8px",
        borderRadius: 999,
      }}
    >
      {avg}
    </span>
  );
}
