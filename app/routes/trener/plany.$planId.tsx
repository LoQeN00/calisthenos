import { and, eq, isNull } from "drizzle-orm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton, useAlert, useConfirm } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { useToast } from "~/components/toast-provider";
import { type Lang, langToIntlLocale } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

// biome-ignore lint/suspicious/noExplicitAny: przeciążenia TFunction są złożone; tu wystarczy luźny podpis dla propsów-dzieci.
type TFn = (...args: any[]) => string;
import {
  type BlockForm,
  type ItemForm,
  type PlanForm,
  PlanFormSchema,
  type SessionForm,
} from "~/lib/plan-types";
import {
  createDraftFromActive,
  deletePlan,
  findAnyDraftFor,
  loadPlanForTrainer,
  PlanRepoError,
  publishPlan,
  saveDraftPlan,
} from "~/lib/plans";

// ============================================================
// Loader: returns the plan + the editor's exercise library + a mode telling
// the component how to render. Drafts go straight to the editor; active and
// archived plans land in a read-only view first, and the user explicitly
// requests edit via `?edit=1`. Drafts are created lazily — only when the
// trainer saves or publishes from edit-active mode (see action below).
// ============================================================

export type PlanRouteMode = "view-active" | "edit-active" | "edit-draft" | "view-archived";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const planId = args.params.planId ?? "";
  const url = new URL(args.request.url);
  const wantsEdit = url.searchParams.get("edit") === "1";

  const detail = await loadPlanForTrainer(db, planId, user.id);
  if (!detail) throw new Response("not found", { status: 404 });

  let mode: PlanRouteMode;
  if (detail.plan.status === "active") {
    if (wantsEdit) {
      // The partial unique index allows at most one draft per trainee, so if
      // one already exists for this trainee we jump to it — editing the active
      // plan would conflict at the DB layer.
      const existing = await findAnyDraftFor(db, detail.plan.traineeId);
      if (existing) {
        throw redirect(`/trener/plany/${existing.id}`);
      }
      mode = "edit-active";
    } else {
      mode = "view-active";
    }
  } else if (detail.plan.status === "draft") {
    mode = "edit-draft";
  } else {
    mode = "view-archived";
  }

  // Exercise library — loaded always; views use it for display names, the
  // editor uses it for the picker.
  const exercises = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, user.id), isNull(schema.exercises.archivedAt)))
    .orderBy(schema.exercises.name);

  // Map the DB tree into the editor's `PlanForm` shape.
  const initial: PlanForm = {
    name: detail.plan.name,
    sessions: detail.sessions.map((s) => ({
      id: s.session.id,
      name: s.session.name,
      blocks: s.blocks.map((b) => ({
        id: b.block.id,
        kind: b.block.kind,
        sets: b.block.sets ?? null,
        restSeconds: b.block.restSeconds ?? null,
        items: b.items.map((it) => ({
          id: it.id,
          exerciseId: it.exerciseId,
          sets: it.sets ?? null,
          restSeconds: it.restSeconds ?? null,
          reps: it.reps,
          unit: it.unit,
          note: it.note ?? null,
        })),
      })),
    })),
  };

  return {
    plan: detail.plan,
    trainee: detail.trainee,
    initial,
    exercises,
    mode,
  };
}

// ============================================================
// Action: save / publish / delete. Intents arrive in the `intent` field.
// ============================================================

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const planId = args.params.planId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "delete") {
      await deletePlan(db, planId, user.id);
      throw redirect("/trener/plany");
    }

    // save / publish both need the JSON-encoded plan body.
    const raw = fd.get("plan");
    if (typeof raw !== "string") {
      return { error: "plany.detail.actionMissingForm" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "plany.detail.actionBadFormat" };
    }
    const validated = PlanFormSchema.safeParse(parsed);
    if (!validated.success) {
      // Komunikat + ścieżka pola pochodzą z PlanFormSchema (lib, PL) — renderowane
      // dosłownie. Brak komunikatu → klucz tłumaczenia (rozpoznawany w komponencie).
      const issue = validated.error.issues[0];
      if (!issue?.message) return { error: "plany.detail.actionInvalidFields" };
      const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
      return { error: `${path}${issue.message}` };
    }

    // Determine the actual draft to write to. If we're editing an active plan
    // (lazy-draft flow), promote to a draft now — either reuse an existing one
    // for this trainee or clone from active. This is the only place where a
    // draft is created automatically; just loading a plan no longer does it.
    const planRows = await db
      .select({
        status: schema.plans.status,
        traineeId: schema.plans.traineeId,
      })
      .from(schema.plans)
      .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, user.id)))
      .limit(1);
    const plan = planRows[0];
    if (!plan) throw new Response("not found", { status: 404 });

    let targetPlanId = planId;
    let wasPromoted = false;

    if (plan.status === "active") {
      const existing = await findAnyDraftFor(db, plan.traineeId);
      if (existing) {
        targetPlanId = existing.id;
      } else {
        targetPlanId = await createDraftFromActive(db, planId);
      }
      wasPromoted = true;
    } else if (plan.status === "archived") {
      return { error: "plany.detail.actionCannotEditArchived" };
    }

    await saveDraftPlan(db, targetPlanId, user.id, validated.data);

    if (intent === "publish") {
      await publishPlan(db, targetPlanId, user.id);
      throw redirect("/trener/plany");
    }

    // If we just promoted from active, redirect to the draft URL so subsequent
    // saves operate on the right plan.
    if (wasPromoted) {
      throw redirect(`/trener/plany/${targetPlanId}`);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof PlanRepoError) {
      return { error: e.userMessage };
    }
    throw e;
  }
}

// ============================================================
// Helpers for client-side temp ids.
// ============================================================

let tempIdCounter = 0;
function tempId(): string {
  tempIdCounter += 1;
  return `tmp-${tempIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function newItem(defaultExerciseId: string, defaultUnit: "REPS" | "SEC"): ItemForm {
  return {
    id: tempId(),
    exerciseId: defaultExerciseId,
    sets: 3,
    restSeconds: 60,
    reps: 8,
    unit: defaultUnit,
    note: null,
  };
}

function newBlock(
  kind: BlockForm["kind"],
  defaultExerciseId: string,
  defaultUnit: "REPS" | "SEC",
): BlockForm {
  if (kind === "dropset") {
    return {
      id: tempId(),
      kind: "dropset",
      sets: 3,
      restSeconds: 120,
      items: [
        {
          id: tempId(),
          exerciseId: defaultExerciseId,
          reps: 5,
          unit: defaultUnit,
          sets: null,
          restSeconds: null,
          note: null,
        },
        {
          id: tempId(),
          exerciseId: defaultExerciseId,
          reps: 8,
          unit: defaultUnit,
          sets: null,
          restSeconds: null,
          note: null,
        },
      ],
    };
  }
  if (kind === "superset") {
    return {
      id: tempId(),
      kind: "superset",
      sets: null,
      restSeconds: null,
      items: [newItem(defaultExerciseId, defaultUnit), newItem(defaultExerciseId, defaultUnit)],
    };
  }
  return {
    id: tempId(),
    kind: "single",
    sets: null,
    restSeconds: null,
    items: [newItem(defaultExerciseId, defaultUnit)],
  };
}

function newSession(name: string): SessionForm {
  return { id: tempId(), name, blocks: [] };
}

function moveAt<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = idx + dir;
  if (next < 0 || next >= arr.length) return arr;
  const copy = [...arr];
  [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
  return copy;
}

// ============================================================
// Top-level component.
// ============================================================

type ExerciseOpt = { id: string; name: string; unit: "REPS" | "SEC" };

export default function PlanRoute() {
  const { mode } = useLoaderData<typeof loader>();
  if (mode === "edit-draft" || mode === "edit-active") {
    return <PlanEditor />;
  }
  return <PlanView />;
}

function PlanEditor() {
  const { plan, trainee, initial, exercises, mode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [state, setState] = useState<PlanForm>(initial);
  const alert = useAlert();
  const confirm = useConfirm();
  const toast = useToast();
  const { t } = useTranslation("trenerPlany");

  // Default: every session loaded from the DB starts collapsed (review mode).
  // Newly added sessions are expanded so the trainer can fill them in.
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(
    () => new Set(initial.sessions.map((s) => s.id).filter((id): id is string => id != null)),
  );
  const toggleCollapse = (id: string | undefined) => {
    if (!id) return;
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Dirty tracking: compare serialized state against the last known "saved"
  // snapshot. Starts equal to `initial`; after a successful save we capture
  // whatever was submitted so subsequent edits show as dirty again.
  const [savedSerialized, setSavedSerialized] = useState(() => JSON.stringify(initial));
  const currentSerialized = useMemo(() => JSON.stringify(state), [state]);
  const dirty = currentSerialized !== savedSerialized;

  const stateRef = useRef(state);
  stateRef.current = state;

  // Show toast + clear dirty when the action returns ok.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on actionData transitions
  useEffect(() => {
    if (actionData != null && "ok" in actionData && actionData.ok) {
      setSavedSerialized(JSON.stringify(stateRef.current));
      toast(t("plany.detail.toastSavedDraft"));
    }
  }, [actionData]);

  // beforeunload guard while there are unsaved changes — but not while we're
  // actively submitting (form POST counts as navigation).
  useEffect(() => {
    const isSubmitting = navigation.state !== "idle";
    if (!dirty || isSubmitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, navigation.state]);

  const defaultExercise: ExerciseOpt | null = exercises[0] ?? null;
  const exerciseById = useMemo(() => {
    const m = new Map<string, ExerciseOpt>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const hasExercises = exercises.length > 0;

  const updateSession = (idx: number, fn: (s: SessionForm) => SessionForm) =>
    setState((p) => ({
      ...p,
      sessions: p.sessions.map((s, i) => (i === idx ? fn(s) : s)),
    }));

  const addSession = () =>
    setState((p) => ({
      ...p,
      sessions: [
        ...p.sessions,
        newSession(t("plany.detail.newSessionName", { n: p.sessions.length + 1 })),
      ],
    }));

  const removeSession = (idx: number) =>
    setState((p) => ({ ...p, sessions: p.sessions.filter((_, i) => i !== idx) }));

  const moveSession = (idx: number, dir: -1 | 1) =>
    setState((p) => ({ ...p, sessions: moveAt(p.sessions, idx, dir) }));

  const serialized = JSON.stringify(state);

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/plany">{t("plany.detail.crumbList")}</Link>
        <span className="sep">›</span>
        <span className="current">{plan.name}</span>
      </div>

      <div className="pagehead">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {mode === "edit-active"
              ? t("plany.detail.eyebrowEditActive", {
                  version: plan.version,
                  next: plan.version + 1,
                })
              : `${t("plany.detail.eyebrowDraft", { version: plan.version })}${plan.basedOnVersion != null ? t("plany.detail.eyebrowBasedOn", { base: plan.basedOnVersion }) : ""}`}
            {t("plany.detail.eyebrowForTrainee", { trainee: trainee.displayName })}
          </div>
          <input
            className="inline-edit"
            value={state.name}
            onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("plany.detail.namePlaceholder")}
            aria-label={t("plany.detail.nameAria")}
            maxLength={120}
            style={{
              fontSize: 28,
              fontWeight: 600,
              width: "100%",
              padding: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          />
        </div>
        <span
          className={mode === "edit-active" ? "badge active" : "badge draft"}
          style={{ flexShrink: 0 }}
        >
          <span className="badge-dot" />
          {mode === "edit-active"
            ? t("plany.detail.badgeEditingActive")
            : t("plany.detail.badgeDraft")}
        </span>
      </div>

      {mode === "edit-active" && (
        <div
          className="card"
          style={{
            borderColor: "var(--accent)",
            borderLeft: "3px solid var(--accent)",
            padding: 12,
            marginBottom: 14,
            fontSize: 13,
            color: "var(--ink-2)",
          }}
        >
          {t("plany.detail.editActiveNotice")}
        </div>
      )}

      {!hasExercises && (
        <div
          className="card"
          style={{
            borderColor: "var(--warn)",
            borderLeft: "3px solid var(--warn)",
            padding: 14,
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {t("plany.detail.noExercisesPre")}
          <Link to="/trener/biblioteka" className="bold">
            {t("plany.detail.noExercisesLink")}
          </Link>
          {t("plany.detail.noExercisesPost")}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {state.sessions.map((session, sIdx) => (
          <SessionCard
            key={session.id ?? sIdx}
            session={session}
            index={sIdx}
            total={state.sessions.length}
            exercises={exercises}
            exerciseById={exerciseById}
            defaultExercise={defaultExercise}
            collapsed={session.id != null && collapsedSessions.has(session.id)}
            onToggleCollapse={() => toggleCollapse(session.id)}
            onChange={(next) => updateSession(sIdx, () => next)}
            onMove={(dir) => moveSession(sIdx, dir)}
            onRemove={() => removeSession(sIdx)}
            t={t}
          />
        ))}
        <button
          type="button"
          onClick={addSession}
          className="btn btn-lg"
          style={{
            width: "100%",
            borderStyle: "dashed",
            borderColor: "var(--line-2)",
            color: "var(--muted)",
          }}
          disabled={!hasExercises}
        >
          {t("plany.detail.addSession")}
        </button>
      </div>

      <div
        className="row wrap"
        style={{
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line)",
          gap: 8,
        }}
      >
        <Form method="post" style={{ display: "contents" }}>
          <input type="hidden" name="plan" value={serialized} />
          <button
            type="submit"
            name="intent"
            value="save"
            className={dirty ? "btn btn-dark" : "btn"}
          >
            {t("plany.detail.saveDraft")}
            {dirty && (
              <span
                aria-label={t("plany.detail.unsavedChanges")}
                title={t("plany.detail.unsavedChanges")}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  marginLeft: 6,
                  display: "inline-block",
                }}
              />
            )}
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            className="btn btn-primary"
            onClick={async (e) => {
              const btn = e.currentTarget;
              if (state.sessions.length === 0) {
                e.preventDefault();
                await alert(
                  t("plany.detail.publishNeedsSessionMsg"),
                  t("plany.detail.publishNeedsSessionTitle"),
                );
                return;
              }
              e.preventDefault();
              const ok = await confirm({
                title: t("plany.detail.confirmPublishTitle"),
                message: t("plany.detail.confirmPublishMessage"),
                confirmText: t("plany.detail.confirmPublishConfirm"),
              });
              if (ok) btn.form?.requestSubmit(btn);
            }}
          >
            {t("plany.detail.publish")}
          </button>
        </Form>
        <div style={{ flex: 1 }} />
        <Form method="post">
          <ConfirmSubmitButton
            name="intent"
            value="delete"
            className="btn btn-danger"
            confirmOptions={{
              title: t("plany.detail.confirmDeleteTitle", { name: plan.name }),
              message: t("plany.detail.confirmDeleteMessage"),
              destructive: true,
              confirmText: t("plany.detail.confirmDeleteConfirm"),
            }}
          >
            {t("plany.detail.deletePlan")}
          </ConfirmSubmitButton>
        </Form>
      </div>

      {actionData?.error != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>
          {actionData.error.startsWith("plany.") ? tDyn(t, actionData.error) : actionData.error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// PlanView — read-only render of an active or archived plan. Trainer enters
// edit mode via the "Edytuj plan" button (?edit=1), which loads PlanEditor.
// ============================================================

function PlanView() {
  const { plan, trainee, initial, exercises, mode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerPlany");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const isArchived = mode === "view-archived";

  const exerciseById = useMemo(() => {
    const m = new Map<string, ExerciseOpt>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/plany">{t("plany.detail.crumbList")}</Link>
        <span className="sep">›</span>
        <span className="current">{plan.name}</span>
      </div>

      <div className="pagehead">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("plany.detail.viewEyebrowVersion", { version: plan.version })}
            {plan.basedOnVersion != null && t("plany.detail.eyebrowBasedOn", {
              base: plan.basedOnVersion,
            })}
            {plan.publishedAt &&
              (isArchived
                ? t("plany.detail.viewPublishedArchived", {
                    date: fmtDate(plan.publishedAt.toString(), locale),
                  })
                : t("plany.detail.viewPublishedActive", {
                    date: fmtDate(plan.publishedAt.toString(), locale),
                  }))}
            {t("plany.detail.eyebrowForTrainee", { trainee: trainee.displayName })}
          </div>
          <h1>{plan.name}</h1>
        </div>
        <span className={isArchived ? "badge archived" : "badge active"} style={{ flexShrink: 0 }}>
          <span className="badge-dot" />
          {isArchived ? t("plany.detail.badgeArchived") : t("plany.detail.badgeActive")}
        </span>
      </div>

      {actionData?.error != null && (
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

      {initial.sessions.length === 0 ? (
        <div className="empty">
          <h3>{t("plany.detail.emptySessionsTitle")}</h3>
          <div>{t("plany.detail.emptySessionsBody")}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {initial.sessions.map((s, sIdx) => (
            <ViewSessionCard
              key={s.id ?? sIdx}
              session={s}
              index={sIdx}
              exerciseById={exerciseById}
              t={t}
            />
          ))}
        </div>
      )}

      <div
        className="row wrap"
        style={{
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line)",
          gap: 8,
        }}
      >
        {!isArchived && (
          <Link to={`/trener/plany/${plan.id}?edit=1`} className="btn btn-primary">
            <Icons.Edit /> {t("plany.detail.editPlan")}
          </Link>
        )}
        <Link to="/trener/plany" className="btn btn-ghost">
          {t("plany.detail.backToList")}
        </Link>
        <div style={{ flex: 1 }} />
        <Form method="post">
          <ConfirmSubmitButton
            name="intent"
            value="delete"
            className="btn btn-danger"
            confirmOptions={{
              title: t("plany.detail.confirmDeleteTitle", { name: plan.name }),
              message: t("plany.detail.confirmDeleteMessage"),
              destructive: true,
              confirmText: t("plany.detail.confirmDeleteConfirm"),
            }}
          >
            {t("plany.detail.deletePlan")}
          </ConfirmSubmitButton>
        </Form>
      </div>
    </div>
  );
}

function ViewSessionCard({
  session,
  index,
  exerciseById,
  t,
}: {
  session: SessionForm;
  index: number;
  exerciseById: Map<string, ExerciseOpt>;
  t: TFn;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 12 }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--muted)",
            width: 24,
            textAlign: "center",
          }}
        >
          #{String(index + 1).padStart(2, "0")}
        </span>
        <h3 style={{ fontSize: 16, margin: 0, flex: 1 }}>{session.name}</h3>
        <span className="mono text-xs muted">
          {session.blocks.length === 0
            ? t("plany.detail.sessionEmpty")
            : t("plany.detail.blocksCount", {
                count: session.blocks.length,
                word: t("plany.detail.blockWord", { count: session.blocks.length }),
              })}
        </span>
      </div>
      {session.blocks.length === 0 ? (
        <div className="text-xs muted" style={{ fontStyle: "italic", paddingLeft: 34 }}>
          {t("plany.detail.noBlocks")}
        </div>
      ) : (
        <div className="col" style={{ gap: 10, paddingLeft: 34 }}>
          {session.blocks.map((b, bi) => (
            <ViewBlock key={b.id ?? bi} block={b} index={bi} exerciseById={exerciseById} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewBlock({
  block,
  index,
  exerciseById,
  t,
}: {
  block: BlockForm;
  index: number;
  exerciseById: Map<string, ExerciseOpt>;
  t: TFn;
}) {
  const isDropset = block.kind === "dropset";
  const isSuperset = block.kind === "superset";
  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
        <span className="mono muted" style={{ fontSize: 11, width: 18, textAlign: "center" }}>
          {String.fromCharCode(65 + index)}
        </span>
        {isSuperset && <Icons.Link style={{ color: "var(--muted)", fontSize: 12 }} />}
        {isDropset && (
          <Icons.Drop
            style={{
              color: "var(--accent-ink)",
              background: "var(--accent)",
              padding: 2,
              borderRadius: 3,
              fontSize: 11,
            }}
          />
        )}
        <span
          className="text-xs muted"
          style={{ textTransform: "uppercase", letterSpacing: ".06em" }}
        >
          {block.kind}
        </span>
        {isDropset && (
          <span className="mono text-xs muted" style={{ marginLeft: "auto" }}>
            {block.sets ?? 0}× · {block.restSeconds ?? 0}s {t("plany.detail.restSuffix")}
          </span>
        )}
      </div>
      <div className="col" style={{ gap: 4, paddingLeft: 26 }}>
        {block.items.map((it, ii) => {
          const ex = exerciseById.get(it.exerciseId);
          const unitSuffix = ex?.unit === "SEC" ? "s" : "";
          const meta = isDropset
            ? `${it.reps}${unitSuffix}`
            : `${it.sets ?? 0}×${it.reps}${unitSuffix}${it.restSeconds != null ? ` · ${it.restSeconds}s` : ""}`;
          return (
            <div
              key={it.id ?? ii}
              className="row"
              style={{ gap: 8, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" }}
            >
              <span style={{ color: "var(--ink-2)", flex: 1, minWidth: 0 }}>
                {ex?.name ?? "?"}
                {ex == null && (
                  <span className="muted text-xs" style={{ marginLeft: 4 }}>
                    {t("plany.detail.exerciseRemoved")}
                  </span>
                )}
              </span>
              <span className="mono muted text-xs">{meta}</span>
              {it.note && (
                <span
                  className="text-xs"
                  style={{
                    fontStyle: "italic",
                    color: "var(--muted)",
                    width: "100%",
                    paddingLeft: 0,
                  }}
                >
                  „{it.note}"
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SessionCard
// ============================================================

function SessionCard({
  session,
  index,
  total,
  exercises,
  exerciseById,
  defaultExercise,
  collapsed,
  onToggleCollapse,
  onChange,
  onMove,
  onRemove,
  t,
}: {
  session: SessionForm;
  index: number;
  total: number;
  exercises: ExerciseOpt[];
  exerciseById: Map<string, ExerciseOpt>;
  defaultExercise: ExerciseOpt | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (next: SessionForm) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  t: TFn;
}) {
  const confirm = useConfirm();
  const updateBlock = (bIdx: number, fn: (b: BlockForm) => BlockForm) =>
    onChange({
      ...session,
      blocks: session.blocks.map((b, i) => (i === bIdx ? fn(b) : b)),
    });

  const addBlock = (kind: BlockForm["kind"]) => {
    if (!defaultExercise) return;
    onChange({
      ...session,
      blocks: [...session.blocks, newBlock(kind, defaultExercise.id, defaultExercise.unit)],
    });
  };

  const removeBlock = (bIdx: number) =>
    onChange({ ...session, blocks: session.blocks.filter((_, i) => i !== bIdx) });

  const moveBlock = (bIdx: number, dir: -1 | 1) =>
    onChange({ ...session, blocks: moveAt(session.blocks, bIdx, dir) });

  return (
    <div
      style={{
        // Collapsed sessions sink to the "well" surface so a long plan is
        // scannable at a glance (open = white editing surface, collapsed = grey).
        background: collapsed ? "var(--surface-2)" : "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: collapsed ? 0 : 12,
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{
            ...iconButton,
            color: "var(--muted)",
            border: 0,
            background: "transparent",
          }}
          title={collapsed ? t("plany.detail.expandSession") : t("plany.detail.collapseSession")}
          aria-label={
            collapsed ? t("plany.detail.expandSession") : t("plany.detail.collapseSession")
          }
          aria-expanded={!collapsed}
        >
          <Icons.ChevDown
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform .12s ease",
            }}
          />
        </button>
        <span
          style={{
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "var(--font-mono)",
            width: 24,
            textAlign: "center",
          }}
        >
          #{String(index + 1).padStart(2, "0")}
        </span>
        <input
          className="inline-edit"
          value={session.name}
          onChange={(e) => onChange({ ...session, name: e.target.value })}
          placeholder={t("plany.detail.sessionNamePlaceholder")}
          aria-label={t("plany.detail.sessionNameAria")}
          maxLength={80}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 500,
            padding: "4px 6px",
            fontFamily: "inherit",
            color: "var(--ink)",
          }}
        />
        {collapsed && (
          <span className="mono text-xs muted" style={{ flexShrink: 0 }}>
            {session.blocks.length === 0
              ? t("plany.detail.sessionEmpty")
              : t("plany.detail.blocksCount", {
                  count: session.blocks.length,
                  word: t("plany.detail.blockWord", { count: session.blocks.length }),
                })}
          </span>
        )}
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          style={iconButton}
          title={t("plany.detail.moveUp")}
          aria-label={t("plany.detail.moveSessionUp")}
        >
          <Icons.ChevDown style={{ transform: "rotate(180deg)" }} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          title={t("plany.detail.moveDown")}
          aria-label={t("plany.detail.moveSessionDown")}
        >
          <Icons.ChevDown />
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: t("plany.detail.confirmDeleteSessionTitle", { name: session.name }),
              message: t("plany.detail.confirmDeleteSessionMessage"),
              destructive: true,
              confirmText: t("plany.detail.delete"),
            });
            if (ok) onRemove();
          }}
          style={{ ...iconButton, color: "var(--danger)" }}
          title={t("plany.detail.delete")}
          aria-label={t("plany.detail.deleteSession")}
        >
          <Icons.X />
        </button>
      </div>

      {collapsed ? (
        <SessionSummary session={session} exerciseById={exerciseById} t={t} />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {session.blocks.map((block, bIdx) => (
            <BlockEditor
              key={block.id ?? bIdx}
              block={block}
              index={bIdx}
              total={session.blocks.length}
              exercises={exercises}
              exerciseById={exerciseById}
              defaultExercise={defaultExercise}
              onChange={(next) => updateBlock(bIdx, () => next)}
              onMove={(dir) => moveBlock(bIdx, dir)}
              onRemove={() => removeBlock(bIdx)}
              t={t}
            />
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="button"
              onClick={() => addBlock("single")}
              style={addButton}
              disabled={!defaultExercise}
            >
              {t("plany.detail.addSingle")}
            </button>
            <button
              type="button"
              onClick={() => addBlock("superset")}
              style={addButton}
              disabled={!defaultExercise}
            >
              {t("plany.detail.addSuperset")}
            </button>
            <button
              type="button"
              onClick={() => addBlock("dropset")}
              style={addButton}
              disabled={!defaultExercise}
            >
              {t("plany.detail.addDropset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionSummary({
  session,
  exerciseById,
  t,
}: {
  session: SessionForm;
  exerciseById: Map<string, ExerciseOpt>;
  t: TFn;
}) {
  if (session.blocks.length === 0) {
    return (
      <div className="text-xs muted" style={{ paddingLeft: 38, fontStyle: "italic" }}>
        {t("plany.detail.summaryNoBlocks")}
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 4, paddingLeft: 38, paddingTop: 8 }}>
      {session.blocks.map((b, bi) => {
        const first = b.items[0];
        const names = b.items
          .map((it) => exerciseById.get(it.exerciseId)?.name ?? "?")
          .join(b.kind === "dropset" ? " → " : " + ");
        const meta =
          b.kind === "dropset"
            ? `${b.sets ?? 0}×${b.items.length}drop`
            : `${first?.sets ?? 0}×${first?.reps ?? 0}${first?.unit === "SEC" ? "s" : ""}`;
        return (
          <div
            key={b.id ?? bi}
            className="row"
            style={{ gap: 8, fontSize: 12.5, alignItems: "baseline" }}
          >
            <span className="mono muted" style={{ fontSize: 11, width: 16, textAlign: "center" }}>
              {String.fromCharCode(65 + bi)}
            </span>
            {b.kind === "superset" && (
              <Icons.Link style={{ color: "var(--muted)", fontSize: 12 }} />
            )}
            {b.kind === "dropset" && (
              <Icons.Drop
                style={{
                  color: "var(--accent-ink)",
                  background: "var(--accent)",
                  padding: 2,
                  borderRadius: 3,
                  fontSize: 10,
                }}
              />
            )}
            <span style={{ flex: 1, color: "var(--ink-2)" }}>{names}</span>
            <span className="mono muted" style={{ fontSize: 11 }}>
              {meta}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// BlockEditor
// ============================================================

function BlockEditor({
  block,
  index,
  total,
  exercises,
  exerciseById,
  defaultExercise,
  onChange,
  onMove,
  onRemove,
  t,
}: {
  block: BlockForm;
  index: number;
  total: number;
  exercises: ExerciseOpt[];
  exerciseById: Map<string, ExerciseOpt>;
  defaultExercise: ExerciseOpt | null;
  onChange: (next: BlockForm) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  t: TFn;
}) {
  const alert = useAlert();
  const isDropset = block.kind === "dropset";

  const updateItem = (iIdx: number, fn: (it: ItemForm) => ItemForm) =>
    onChange({
      ...block,
      items: block.items.map((it, i) => (i === iIdx ? fn(it) : it)),
    });

  const addItem = () => {
    if (!defaultExercise) return;
    const nextItem: ItemForm = isDropset
      ? {
          id: tempId(),
          exerciseId: defaultExercise.id,
          reps: 5,
          unit: defaultExercise.unit,
          sets: null,
          restSeconds: null,
          note: null,
        }
      : newItem(defaultExercise.id, defaultExercise.unit);
    const newItems = [...block.items, nextItem];

    // A `single` block by definition holds exactly one exercise. The moment
    // a trainer adds a second, the block becomes a superset — auto-promote
    // so the validator doesn't reject and the trainer doesn't need to
    // remember to flip the dropdown.
    if (block.kind === "single" && newItems.length >= 2) {
      onChange({
        ...block,
        kind: "superset",
        sets: null,
        restSeconds: null,
        items: newItems,
      });
      return;
    }

    onChange({ ...block, items: newItems });
  };

  const removeItem = async (iIdx: number) => {
    const minItems = isDropset ? 2 : block.kind === "superset" ? 2 : 1;
    if (block.items.length <= minItems) {
      await alert(
        t("plany.detail.blockMinItems", {
          count: minItems,
          word:
            minItems === 1
              ? t("plany.detail.exerciseWordOne")
              : t("plany.detail.exerciseWordMany"),
        }),
        t("plany.detail.cannotRemove"),
      );
      return;
    }
    onChange({ ...block, items: block.items.filter((_, i) => i !== iIdx) });
  };

  const moveItem = (iIdx: number, dir: -1 | 1) =>
    onChange({ ...block, items: moveAt(block.items, iIdx, dir) });

  // Switch block kind — preserve items where possible, adjust sets/rest fields per the invariant.
  const switchKind = (kind: BlockForm["kind"]) => {
    if (kind === block.kind) return;
    if (!defaultExercise) return;
    if (kind === "dropset") {
      onChange({
        ...block,
        kind: "dropset",
        sets: block.sets ?? 3,
        restSeconds: block.restSeconds ?? 120,
        items:
          block.items.length >= 2
            ? block.items.map((it) => ({ ...it, sets: null, restSeconds: null }))
            : [
                ...block.items.map((it) => ({ ...it, sets: null, restSeconds: null })),
                {
                  id: tempId(),
                  exerciseId: defaultExercise.id,
                  reps: 8,
                  unit: defaultExercise.unit,
                  sets: null,
                  restSeconds: null,
                  note: null,
                },
              ],
      });
      return;
    }
    if (kind === "superset") {
      onChange({
        ...block,
        kind: "superset",
        sets: null,
        restSeconds: null,
        items:
          block.items.length >= 2
            ? block.items.map((it) => ({
                ...it,
                sets: it.sets ?? 3,
                restSeconds: it.restSeconds ?? 60,
              }))
            : [
                ...block.items.map((it) => ({
                  ...it,
                  sets: it.sets ?? 3,
                  restSeconds: it.restSeconds ?? 60,
                })),
                newItem(defaultExercise.id, defaultExercise.unit),
              ],
      });
      return;
    }
    // single: keep only the first item
    onChange({
      ...block,
      kind: "single",
      sets: null,
      restSeconds: null,
      items: [
        {
          ...(block.items[0] ?? newItem(defaultExercise.id, defaultExercise.unit)),
          sets: block.items[0]?.sets ?? 3,
          restSeconds: block.items[0]?.restSeconds ?? 60,
        },
      ],
    });
  };

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <select
          value={block.kind}
          onChange={(e) => switchKind(e.target.value as BlockForm["kind"])}
          style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}
        >
          <option value="single">Single</option>
          <option value="superset">Superset</option>
          <option value="dropset">Dropset</option>
        </select>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          style={iconButton}
          aria-label={t("plany.detail.moveBlockUp")}
          title={t("plany.detail.moveUp")}
        >
          <Icons.ChevDown style={{ transform: "rotate(180deg)" }} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          aria-label={t("plany.detail.moveBlockDown")}
          title={t("plany.detail.moveDown")}
        >
          <Icons.ChevDown />
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{ ...iconButton, color: "var(--danger)" }}
          aria-label={t("plany.detail.deleteBlock")}
          title={t("plany.detail.deleteBlock")}
        >
          <Icons.X />
        </button>
      </div>

      {isDropset && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("plany.detail.labelSeries")}
            <input
              type="number"
              min={1}
              max={50}
              value={block.sets ?? ""}
              onChange={(e) =>
                onChange({ ...block, sets: e.target.value === "" ? null : Number(e.target.value) })
              }
              style={{ ...inputStyle, width: 70, marginLeft: 6 }}
            />
          </label>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("plany.detail.labelRest")}
            <input
              type="number"
              min={0}
              max={3600}
              value={block.restSeconds ?? ""}
              onChange={(e) =>
                onChange({
                  ...block,
                  restSeconds: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              style={{ ...inputStyle, width: 80, marginLeft: 6 }}
            />
          </label>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("plany.detail.dropsCount", { count: block.items.length })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {block.items.map((item, iIdx) => (
          <ItemRow
            key={item.id ?? iIdx}
            item={item}
            index={iIdx}
            total={block.items.length}
            isDropsetItem={isDropset}
            exercises={exercises}
            exerciseById={exerciseById}
            onChange={(next) => updateItem(iIdx, () => next)}
            onMove={(dir) => moveItem(iIdx, dir)}
            onRemove={() => removeItem(iIdx)}
            t={t}
          />
        ))}
        <button type="button" onClick={addItem} style={addButton} disabled={!defaultExercise}>
          {isDropset ? t("plany.detail.addDrop") : t("plany.detail.addExercise")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ItemRow
// ============================================================

function ItemRow({
  item,
  index,
  total,
  isDropsetItem,
  exercises,
  exerciseById,
  onChange,
  onMove,
  onRemove,
  t,
}: {
  item: ItemForm;
  index: number;
  total: number;
  isDropsetItem: boolean;
  exercises: ExerciseOpt[];
  exerciseById: Map<string, ExerciseOpt>;
  onChange: (next: ItemForm) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  t: TFn;
}) {
  const selectedUnit = exerciseById.get(item.exerciseId)?.unit ?? item.unit;

  // When trainer changes exercise, sync unit (REPS/SEC) to the chosen exercise's default.
  const onExerciseChange = (exerciseId: string) => {
    const ex = exerciseById.get(exerciseId);
    onChange({ ...item, exerciseId, unit: ex?.unit ?? item.unit });
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--muted)",
            width: 18,
            textAlign: "center",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <select
          value={item.exerciseId}
          onChange={(e) => onExerciseChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, padding: "5px 8px" }}
        >
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name} ({ex.unit})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          style={iconButton}
          aria-label={t("plany.detail.moveUp")}
          title={t("plany.detail.moveUp")}
        >
          <Icons.ChevDown style={{ transform: "rotate(180deg)" }} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          aria-label={t("plany.detail.moveDown")}
          title={t("plany.detail.moveDown")}
        >
          <Icons.ChevDown />
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{ ...iconButton, color: "var(--danger)" }}
          aria-label={t("plany.detail.delete")}
          title={t("plany.detail.delete")}
        >
          <Icons.X />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!isDropsetItem && (
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("plany.detail.labelSeries")}
            <input
              type="number"
              min={1}
              max={50}
              value={item.sets ?? ""}
              onChange={(e) =>
                onChange({ ...item, sets: e.target.value === "" ? null : Number(e.target.value) })
              }
              style={{ ...inputStyle, width: 64, marginLeft: 6 }}
            />
          </label>
        )}
        <label style={{ fontSize: 11, color: "var(--muted)" }}>
          {selectedUnit === "SEC" ? t("plany.detail.labelSec") : t("plany.detail.labelReps")}
          <input
            type="number"
            min={1}
            max={1000}
            value={item.reps}
            onChange={(e) => onChange({ ...item, reps: Number(e.target.value) || 1 })}
            style={{ ...inputStyle, width: 70, marginLeft: 6 }}
          />
        </label>
        {!isDropsetItem && (
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            {t("plany.detail.labelRest")}
            <input
              type="number"
              min={0}
              max={3600}
              value={item.restSeconds ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  restSeconds: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              style={{ ...inputStyle, width: 80, marginLeft: 6 }}
            />
          </label>
        )}
        <label style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 220 }}>
          {t("plany.detail.labelNote")}
          <textarea
            maxLength={500}
            rows={2}
            value={item.note ?? ""}
            onChange={(e) => onChange({ ...item, note: e.target.value || null })}
            placeholder={t("plany.detail.notePlaceholder")}
            style={{
              ...inputStyle,
              width: "100%",
              marginLeft: 0,
              resize: "vertical",
              minHeight: 36,
              lineHeight: 1.4,
              fontFamily: "inherit",
            }}
          />
        </label>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  fontFamily: "inherit",
};

const iconButton: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--ink)",
};

const addButton: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px dashed var(--line-2)",
  background: "transparent",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink)",
  cursor: "pointer",
};
