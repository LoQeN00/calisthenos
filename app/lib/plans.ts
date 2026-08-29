import { and, asc, count, desc, eq, ilike, inArray, max, ne, or, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import type { PlanForm } from "~/lib/plan-types";

// ---------------- Reads ----------------

export interface PlanDetail {
  plan: schema.Plan;
  trainee: { id: string; displayName: string };
  sessions: Array<{
    session: schema.PlanSession;
    blocks: Array<{
      block: schema.PlanBlock;
      items: schema.PlanItem[];
    }>;
  }>;
}

/** Load a plan with all its nested sessions, blocks, and items. Returns null if not owned by the trainer. */
export async function loadPlanForTrainer(
  db: Db,
  planId: string,
  trainerId: string,
): Promise<PlanDetail | null> {
  const planRows = await db
    .select({
      plan: schema.plans,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
    })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
    .limit(1);
  const head = planRows[0];
  if (!head) return null;

  const sessions = await db
    .select()
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, planId))
    .orderBy(schema.planSessions.ordinal);

  if (sessions.length === 0) {
    return { plan: head.plan, trainee: head.trainee, sessions: [] };
  }

  const sessionIds = sessions.map((s) => s.id);
  const blocks = await db
    .select()
    .from(schema.planBlocks)
    .where(inArray(schema.planBlocks.planSessionId, sessionIds))
    .orderBy(schema.planBlocks.planSessionId, schema.planBlocks.ordinal);

  const blockIds = blocks.map((b) => b.id);
  const items =
    blockIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.planItems)
          .where(inArray(schema.planItems.planBlockId, blockIds))
          .orderBy(schema.planItems.planBlockId, schema.planItems.ordinal);

  const itemsByBlock = new Map<string, schema.PlanItem[]>();
  for (const it of items) {
    const list = itemsByBlock.get(it.planBlockId) ?? [];
    list.push(it);
    itemsByBlock.set(it.planBlockId, list);
  }

  const blocksBySession = new Map<
    string,
    Array<{ block: schema.PlanBlock; items: schema.PlanItem[] }>
  >();
  for (const b of blocks) {
    const list = blocksBySession.get(b.planSessionId) ?? [];
    list.push({ block: b, items: itemsByBlock.get(b.id) ?? [] });
    blocksBySession.set(b.planSessionId, list);
  }

  return {
    plan: head.plan,
    trainee: head.trainee,
    sessions: sessions.map((s) => ({
      session: s,
      blocks: blocksBySession.get(s.id) ?? [],
    })),
  };
}

export type PlanSort = "newest" | "oldest" | "name_asc" | "published";
export type PlanStatusFilter = "all" | "active" | "draft";

export interface PlanListRow {
  plan: schema.Plan;
  trainee: { id: string; displayName: string };
  sessionCount: number;
}

/** Liczniki zakładek — zawsze bez zarchiwizowanych, niezależnie od filtra listy. */
export async function countPlansByStatusForTrainer(
  db: Db,
  trainerId: string,
): Promise<{ all: number; active: number; draft: number }> {
  const rows = await db
    .select({ status: schema.plans.status, c: count() })
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, trainerId), ne(schema.plans.status, "archived")))
    .groupBy(schema.plans.status);

  const counts = { all: 0, active: 0, draft: 0 };
  for (const r of rows) {
    if (r.status === "active" || r.status === "draft") {
      counts[r.status] = Number(r.c);
      counts.all += Number(r.c);
    }
  }
  return counts;
}

function planConditions(trainerId: string, filter: { status: PlanStatusFilter; q?: string }) {
  // Zarchiwizowane są ukryte w UI trenera — powstają automatycznie przy publikacji
  // i nie niosą akcji.
  const conditions = [eq(schema.plans.trainerId, trainerId), ne(schema.plans.status, "archived")];
  if (filter.status !== "all") {
    conditions.push(eq(schema.plans.status, filter.status));
  }
  if (filter.q != null && filter.q.length > 0) {
    conditions.push(
      or(
        ilike(schema.plans.name, `%${filter.q}%`),
        ilike(schema.users.displayName, `%${filter.q}%`),
      )!,
    );
  }
  return conditions;
}

export async function countPlansForTrainer(
  db: Db,
  trainerId: string,
  filter: { status: PlanStatusFilter; q?: string },
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .where(and(...planConditions(trainerId, filter)));
  return Number(row?.c ?? 0);
}

/** List plans for one trainer with trainee + session count, filtered/sorted/paginated. */
export async function listPlansForTrainer(
  db: Db,
  trainerId: string,
  opts: { status: PlanStatusFilter; q?: string; sort: PlanSort; limit: number; offset: number },
): Promise<PlanListRow[]> {
  const orderBy =
    opts.sort === "oldest"
      ? [asc(schema.plans.createdAt)]
      : opts.sort === "name_asc"
        ? [asc(schema.plans.name)]
        : opts.sort === "published"
          ? [sql`${schema.plans.publishedAt} DESC NULLS LAST`]
          : [desc(schema.plans.createdAt)];

  const sessionCountSub = db.$with("session_counts").as(
    db
      .select({ planId: schema.planSessions.planId, c: count().as("c") })
      .from(schema.planSessions)
      .groupBy(schema.planSessions.planId),
  );

  return await db
    .with(sessionCountSub)
    .select({
      plan: schema.plans,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
      sessionCount: sql<number>`COALESCE(${sessionCountSub.c}, 0)::int`,
    })
    .from(schema.plans)
    .innerJoin(schema.users, eq(schema.users.id, schema.plans.traineeId))
    .leftJoin(sessionCountSub, eq(sessionCountSub.planId, schema.plans.id))
    .where(and(...planConditions(trainerId, opts)))
    .orderBy(...orderBy)
    .limit(opts.limit)
    .offset(opts.offset);
}

/** Wszystkie plany pary (łącznie z zarchiwizowanymi) — widok klienta. */
export async function listPlansForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<schema.Plan[]> {
  return await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.trainerId, trainerId), eq(schema.plans.traineeId, traineeId)))
    .orderBy(desc(schema.plans.createdAt));
}

export async function findPlanStatusForTrainer(
  db: Db,
  planId: string,
  trainerId: string,
): Promise<{ status: schema.Plan["status"]; traineeId: string } | null> {
  const rows = await db
    .select({ status: schema.plans.status, traineeId: schema.plans.traineeId })
    .from(schema.plans)
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/** `status: null` liczy WSZYSTKIE plany trenera, także zarchiwizowane (licznik nawigacji). */
export async function countPlansForTrainerByStatus(
  db: Db,
  trainerId: string,
  status: "active" | "draft" | null,
): Promise<number> {
  const conditions = [eq(schema.plans.trainerId, trainerId)];
  if (status != null) conditions.push(eq(schema.plans.status, status));
  const [row] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(and(...conditions));
  return Number(row?.c ?? 0);
}

export async function countSessionsInPlan(db: Db, planId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, planId));
  return Number(row?.c ?? 0);
}

/** Return the existing draft for a given (trainee, basedOnVersion), if any. */
export async function findDraftBasedOn(
  db: Db,
  traineeId: string,
  basedOnVersion: number,
): Promise<schema.Plan | null> {
  const rows = await db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.traineeId, traineeId),
        eq(schema.plans.status, "draft"),
        eq(schema.plans.basedOnVersion, basedOnVersion),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Any draft for the trainee (regardless of basedOnVersion). At most one due to partial unique index. */
export async function findAnyDraftFor(db: Db, traineeId: string): Promise<schema.Plan | null> {
  const rows = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, traineeId), eq(schema.plans.status, "draft")))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns the trainer's next free version number for a trainee. */
async function nextVersionFor(db: Db, traineeId: string): Promise<number> {
  const rows = await db
    .select({ m: max(schema.plans.version) })
    .from(schema.plans)
    .where(eq(schema.plans.traineeId, traineeId));
  const current = rows[0]?.m ?? 0;
  return current + 1;
}

// ---------------- Writes ----------------

export interface CreateBlankPlanInput {
  trainerId: string;
  traineeId: string;
  name: string;
}

/** Create a new draft plan with no sessions. Returns the new plan's id. */
export async function createBlankPlan(db: Db, input: CreateBlankPlanInput): Promise<string> {
  return await db.transaction(async (tx) => {
    const version = await nextVersionFor(tx, input.traineeId);
    const [row] = await tx
      .insert(schema.plans)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        name: input.name,
        version,
        basedOnVersion: null,
        status: "draft",
      })
      .returning({ id: schema.plans.id });
    return row!.id;
  });
}

/** Deep-clone the given active plan into a new draft. Returns the new draft id. */
export async function createDraftFromActive(db: Db, sourcePlanId: string): Promise<string> {
  return await db.transaction(async (tx) => {
    const sourceRows = await tx
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, sourcePlanId))
      .limit(1);
    const source = sourceRows[0];
    if (!source) throw new Error("source plan not found");
    if (source.status !== "active") throw new Error("source plan is not active");

    const newVersion = await nextVersionFor(tx, source.traineeId);
    const [draftRow] = await tx
      .insert(schema.plans)
      .values({
        trainerId: source.trainerId,
        traineeId: source.traineeId,
        name: source.name,
        version: newVersion,
        basedOnVersion: source.version,
        status: "draft",
      })
      .returning({ id: schema.plans.id });
    const draftId = draftRow!.id;

    // Clone the tree (sessions → blocks → items).
    const srcSessions = await tx
      .select()
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, sourcePlanId))
      .orderBy(schema.planSessions.ordinal);

    for (const s of srcSessions) {
      const [newS] = await tx
        .insert(schema.planSessions)
        .values({ planId: draftId, ordinal: s.ordinal, name: s.name })
        .returning({ id: schema.planSessions.id });
      const srcBlocks = await tx
        .select()
        .from(schema.planBlocks)
        .where(eq(schema.planBlocks.planSessionId, s.id))
        .orderBy(schema.planBlocks.ordinal);
      for (const b of srcBlocks) {
        const [newB] = await tx
          .insert(schema.planBlocks)
          .values({
            planSessionId: newS!.id,
            ordinal: b.ordinal,
            kind: b.kind,
            sets: b.sets,
            restSeconds: b.restSeconds,
          })
          .returning({ id: schema.planBlocks.id });
        const srcItems = await tx
          .select()
          .from(schema.planItems)
          .where(eq(schema.planItems.planBlockId, b.id))
          .orderBy(schema.planItems.ordinal);
        if (srcItems.length > 0) {
          await tx.insert(schema.planItems).values(
            srcItems.map((it) => ({
              planBlockId: newB!.id,
              ordinal: it.ordinal,
              exerciseId: it.exerciseId,
              sets: it.sets,
              restSeconds: it.restSeconds,
              reps: it.reps,
              unit: it.unit,
              note: it.note,
            })),
          );
        }
      }
    }

    return draftId;
  });
}

export class PlanRepoError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Save the entire plan tree. Wipe-and-rewrite of sessions/blocks/items.
 * Verifies ownership AND that every referenced exercise belongs to the trainer.
 */
export async function saveDraftPlan(
  db: Db,
  planId: string,
  trainerId: string,
  input: PlanForm,
): Promise<void> {
  // Collect distinct exercise ids referenced in the incoming plan tree.
  const referencedExerciseIds = new Set<string>();
  for (const session of input.sessions) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        referencedExerciseIds.add(item.exerciseId);
      }
    }
  }

  await db.transaction(async (tx) => {
    // 1) Ownership + draft-status guard.
    const planRows = await tx
      .select({ status: schema.plans.status })
      .from(schema.plans)
      .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
      .limit(1);
    const plan = planRows[0];
    if (!plan)
      throw new PlanRepoError("plan not found", "Plan nie istnieje albo nie należy do Ciebie.");
    if (plan.status !== "draft") {
      throw new PlanRepoError("not a draft", "Plan nie jest w trybie draft.");
    }

    // 2) Tenant scope check on referenced exercises. Prevents a crafted request
    //    from inserting plan_items that point at another trainer's exercises.
    if (referencedExerciseIds.size > 0) {
      const ids = Array.from(referencedExerciseIds);
      const validRows = await tx
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(and(eq(schema.exercises.trainerId, trainerId), inArray(schema.exercises.id, ids)));
      if (validRows.length !== ids.length) {
        throw new PlanRepoError(
          "exercise not in library",
          "Niektóre ćwiczenia w planie nie są z Twojej biblioteki.",
        );
      }
    }

    // 3) Update name.
    await tx.update(schema.plans).set({ name: input.name }).where(eq(schema.plans.id, planId));

    // 4) Wipe sessions (CASCADE → blocks → items).
    await tx.delete(schema.planSessions).where(eq(schema.planSessions.planId, planId));

    // 5) Reinsert tree.
    for (const [sIdx, session] of input.sessions.entries()) {
      const [sRow] = await tx
        .insert(schema.planSessions)
        .values({ planId, ordinal: sIdx, name: session.name })
        .returning({ id: schema.planSessions.id });
      const sessionId = sRow!.id;

      for (const [bIdx, block] of session.blocks.entries()) {
        const isDropset = block.kind === "dropset";
        const [bRow] = await tx
          .insert(schema.planBlocks)
          .values({
            planSessionId: sessionId,
            ordinal: bIdx,
            kind: block.kind,
            sets: isDropset ? (block.sets ?? null) : null,
            restSeconds: isDropset ? (block.restSeconds ?? null) : null,
          })
          .returning({ id: schema.planBlocks.id });
        const blockId = bRow!.id;

        if (block.items.length > 0) {
          await tx.insert(schema.planItems).values(
            block.items.map((it, iIdx) => ({
              planBlockId: blockId,
              ordinal: iIdx,
              exerciseId: it.exerciseId,
              sets: isDropset ? null : (it.sets ?? null),
              restSeconds: isDropset ? null : (it.restSeconds ?? null),
              reps: it.reps,
              unit: it.unit,
              note: it.note ?? null,
            })),
          );
        }
      }
    }
  });
}

/**
 * Publish a draft. Atomically: archive any prior active plan for the same
 * trainee, then flip this draft to active with published_at = now.
 * Verifies ownership.
 */
export async function publishPlan(db: Db, planId: string, trainerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
      .for("update")
      .limit(1);
    const target = rows[0];
    if (!target)
      throw new PlanRepoError("plan not found", "Plan nie istnieje albo nie należy do Ciebie.");
    if (target.status !== "draft") {
      throw new PlanRepoError("not a draft", "Tylko draft można opublikować.");
    }

    await tx
      .update(schema.plans)
      .set({ status: "archived" })
      .where(and(eq(schema.plans.traineeId, target.traineeId), eq(schema.plans.status, "active")));

    await tx
      .update(schema.plans)
      .set({ status: "active", publishedAt: new Date() })
      .where(eq(schema.plans.id, planId));
  });
}

export type DeletePlanResult = { kind: "deleted" } | { kind: "archived"; logCount: number };

// Smart delete: hard-delete if no logs reference the plan; otherwise archive
// to preserve historical sessions (workout_logs.plan_id is ON DELETE RESTRICT).
export async function deletePlan(
  db: Db,
  planId: string,
  trainerId: string,
): Promise<DeletePlanResult> {
  return await db.transaction(async (tx) => {
    const planRows = await tx
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.id, planId), eq(schema.plans.trainerId, trainerId)))
      .for("update")
      .limit(1);
    const plan = planRows[0];
    if (!plan) {
      throw new PlanRepoError("plan not found", "Plan nie istnieje albo nie należy do Ciebie.");
    }

    const logCountRows = await tx
      .select({ c: count() })
      .from(schema.workoutLogs)
      .where(eq(schema.workoutLogs.planId, planId));
    const logCount = Number(logCountRows[0]?.c ?? 0);

    if (logCount === 0) {
      try {
        await tx.delete(schema.plans).where(eq(schema.plans.id, planId));
      } catch (e) {
        // Teoretyczny wyścig: log treningu wstawiony równolegle mimo blokady
        // `FOR UPDATE` wyżej (workout_logs.plan_id jest RESTRICT). Zamiast surowego
        // błędu FK (→ 500) zwracamy przyjazny komunikat, by trener odświeżył i ponowił.
        // Dopasowanie po nazwie constraintu (precyzyjniej niż sama nazwa tabeli).
        if (e instanceof Error && e.message.includes("workout_logs_plan_id")) {
          throw new PlanRepoError(
            "race: logs added concurrently",
            "Plan ma już zapisane sesje — odśwież stronę i spróbuj ponownie.",
          );
        }
        throw e;
      }
      return { kind: "deleted" };
    }

    // Plan has logs. We can only archive it (smart-delete intent). Already
    // archived → there's nothing left to do; the previous code silently
    // returned a misleading "archived" success — bail out loudly instead so
    // the user understands the action wasn't a no-op by accident.
    if (plan.status === "archived") {
      throw new PlanRepoError(
        "archived with logs",
        `Plan jest już zarchiwizowany i ma ${logCount} ${logCount === 1 ? "zapisaną sesję" : "zapisanych sesji"}. Historia treningów jest chroniona — całkowite usunięcie nie jest możliwe.`,
      );
    }

    await tx.update(schema.plans).set({ status: "archived" }).where(eq(schema.plans.id, planId));
    return { kind: "archived", logCount };
  });
}
