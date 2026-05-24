import { and, eq, isNull } from "drizzle-orm";
import { useMemo, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
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
// Loader: pull plan + sessions + blocks + items + trainer's exercise list.
// Active plans redirect to their draft (creating one if needed).
// ============================================================

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const planId = args.params.planId ?? "";

  const detail = await loadPlanForTrainer(db, planId, user.id);
  if (!detail) throw new Response("not found", { status: 404 });

  if (detail.plan.status === "active") {
    // The partial unique index allows at most one draft per trainee, so we
    // can't safely create a second one — if any draft already exists, jump
    // straight to it regardless of which version it's based on.
    const existing = await findAnyDraftFor(db, detail.plan.traineeId);
    if (existing) {
      throw redirect(`/trener/plany/${existing.id}`);
    }
    const draftId = await createDraftFromActive(db, detail.plan.id);
    throw redirect(`/trener/plany/${draftId}`);
  }

  // Exercise library for the picker, non-archived.
  const exercises = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.trainerId, user.id),
        isNull(schema.exercises.archivedAt),
      ),
    )
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
  };
}

// ============================================================
// Action: save / publish / discard. Intents arrive in the `intent` field.
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
      return { error: "Brak danych formularza." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "Niepoprawny format danych." };
    }
    const validated = PlanFormSchema.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      const path = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
      return {
        error: `${path}${issue?.message ?? "Niektóre pola planu są niepoprawne."}`,
      };
    }

    await saveDraftPlan(db, planId, user.id, validated.data);

    if (intent === "publish") {
      await publishPlan(db, planId, user.id);
      throw redirect("/trener/plany");
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

function newBlock(kind: BlockForm["kind"], defaultExerciseId: string, defaultUnit: "REPS" | "SEC"): BlockForm {
  if (kind === "dropset") {
    return {
      id: tempId(),
      kind: "dropset",
      sets: 3,
      restSeconds: 120,
      items: [
        { id: tempId(), exerciseId: defaultExerciseId, reps: 5, unit: defaultUnit, sets: null, restSeconds: null, note: null },
        { id: tempId(), exerciseId: defaultExerciseId, reps: 8, unit: defaultUnit, sets: null, restSeconds: null, note: null },
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

export default function PlanEditor() {
  const { plan, trainee, initial, exercises } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [state, setState] = useState<PlanForm>(initial);

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
    setState((p) => ({ ...p, sessions: [...p.sessions, newSession(`Sesja ${p.sessions.length + 1}`)] }));

  const removeSession = (idx: number) =>
    setState((p) => ({ ...p, sessions: p.sessions.filter((_, i) => i !== idx) }));

  const moveSession = (idx: number, dir: -1 | 1) =>
    setState((p) => ({ ...p, sessions: moveAt(p.sessions, idx, dir) }));

  const serialized = JSON.stringify(state);

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/plany">Plany</Link>
        <span className="sep">›</span>
        <span className="current">{plan.name}</span>
      </div>

      <div className="pagehead">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Plan v{plan.version}
            {plan.basedOnVersion != null && ` · bazuje na v${plan.basedOnVersion}`} · dla{" "}
            {trainee.displayName}
          </div>
          <input
            value={state.name}
            onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))}
            placeholder="Nazwa planu"
            maxLength={120}
            style={{
              fontSize: 28,
              fontWeight: 600,
              border: 0,
              background: "transparent",
              width: "100%",
              padding: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          />
        </div>
        <span className="badge draft" style={{ flexShrink: 0 }}>
          <span className="badge-dot" />
          draft
        </span>
      </div>

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
          Nie masz jeszcze żadnych ćwiczeń.{" "}
          <Link to="/trener/biblioteka" className="bold">
            Dodaj coś do biblioteki
          </Link>{" "}
          zanim zaczniesz układać sesje.
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
            onChange={(next) => updateSession(sIdx, () => next)}
            onMove={(dir) => moveSession(sIdx, dir)}
            onRemove={() => removeSession(sIdx)}
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
          + Dodaj sesję
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
          <button type="submit" name="intent" value="save" className="btn">
            Zapisz draft
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            className="btn btn-primary"
            onClick={(e) => {
              if (state.sessions.length === 0) {
                e.preventDefault();
                alert("Plan musi mieć co najmniej jedną sesję.");
                return;
              }
              if (!confirm("Opublikować ten plan? Aktywny plan podopiecznego (jeśli istnieje) zostanie zarchiwizowany.")) {
                e.preventDefault();
              }
            }}
          >
            Opublikuj
          </button>
        </Form>
        <div style={{ flex: 1 }} />
        <Form method="post">
          <button
            type="submit"
            name="intent"
            value="delete"
            className="btn btn-danger"
            onClick={(e) => {
              if (
                !confirm(
                  `Usunąć plan „${plan.name}"?\n\nJeśli ma już zalogowane sesje podopiecznego, zostanie zarchiwizowany (historia zachowana). Jeśli nie — zostanie skasowany na stałe.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            Usuń plan
          </button>
        </Form>
      </div>

      {actionData?.error != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>
          {actionData.error}
        </p>
      )}
      {actionData != null && "ok" in actionData && actionData.ok && (
        <p style={{ color: "var(--ok)", fontSize: 13, marginTop: 14 }}>Zapisano.</p>
      )}
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
  onChange,
  onMove,
  onRemove,
}: {
  session: SessionForm;
  index: number;
  total: number;
  exercises: ExerciseOpt[];
  exerciseById: Map<string, ExerciseOpt>;
  defaultExercise: ExerciseOpt | null;
  onChange: (next: SessionForm) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
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
        background: "var(--surface)",
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
          marginBottom: 12,
        }}
      >
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
          value={session.name}
          onChange={(e) => onChange({ ...session, name: e.target.value })}
          placeholder="Nazwa sesji"
          maxLength={80}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 500,
            border: 0,
            background: "transparent",
            padding: "4px 0",
            fontFamily: "inherit",
            color: "var(--ink)",
          }}
        />
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          style={iconButton}
          title="W górę"
          aria-label="Przesuń sesję w górę"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          title="W dół"
          aria-label="Przesuń sesję w dół"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Usunąć sesję „${session.name}"?`)) onRemove();
          }}
          style={{ ...iconButton, color: "var(--danger)" }}
          title="Usuń"
          aria-label="Usuń sesję"
        >
          ×
        </button>
      </div>

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
          />
        ))}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <button
            type="button"
            onClick={() => addBlock("single")}
            style={addButton}
            disabled={!defaultExercise}
          >
            + Single
          </button>
          <button
            type="button"
            onClick={() => addBlock("superset")}
            style={addButton}
            disabled={!defaultExercise}
          >
            + Superset
          </button>
          <button
            type="button"
            onClick={() => addBlock("dropset")}
            style={addButton}
            disabled={!defaultExercise}
          >
            + Dropset
          </button>
        </div>
      </div>
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
}) {
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

  const removeItem = (iIdx: number) => {
    const minItems = isDropset ? 2 : block.kind === "superset" ? 2 : 1;
    if (block.items.length <= minItems) {
      alert(`Ten blok wymaga co najmniej ${minItems} ćwiczeń.`);
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
          aria-label="Przesuń blok w górę"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          aria-label="Przesuń blok w dół"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{ ...iconButton, color: "var(--danger)" }}
          aria-label="Usuń blok"
        >
          ×
        </button>
      </div>

      {isDropset && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            Serie
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
            Przerwa (s)
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
            ({block.items.length} dropów)
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
          />
        ))}
        <button type="button" onClick={addItem} style={addButton} disabled={!defaultExercise}>
          + {isDropset ? "Dodaj drop" : "Dodaj ćwiczenie"}
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
          aria-label="W górę"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          style={iconButton}
          aria-label="W dół"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          style={{ ...iconButton, color: "var(--danger)" }}
          aria-label="Usuń"
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!isDropsetItem && (
          <label style={{ fontSize: 11, color: "var(--muted)" }}>
            Serie
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
          {selectedUnit === "SEC" ? "Sek." : "Powt."}
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
            Przerwa (s)
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
        <label style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 180 }}>
          Notatka
          <input
            type="text"
            maxLength={500}
            value={item.note ?? ""}
            onChange={(e) => onChange({ ...item, note: e.target.value || null })}
            placeholder="opcjonalna…"
            style={{ ...inputStyle, width: "100%", marginLeft: 0 }}
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

