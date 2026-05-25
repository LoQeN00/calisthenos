import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// ============================================================
// Domain types
// ============================================================

/**
 * A flattened "entry" the trainee logs against. Each plan item produces one
 * entry; for dropset blocks, each drop becomes its own entry (with the block's
 * sets count). Entries are ordered by (sessionOrdinal, blockOrdinal, itemOrdinal).
 */
export interface LoggingEntry {
  /** The plan_item id this entry maps to (for reference; not directly used by writers). */
  planItemId: string;
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  /** Number of sets the trainee is expected to perform. */
  expectedSets: number;
  /** Target reps (or seconds) per set. */
  expectedReps: number;
  /** Optional trainer note. */
  note: string | null;
  /** Whether this entry belongs to a dropset block (UI affordance only). */
  isDropsetItem: boolean;
}

export interface SessionForLogging {
  plan: schema.Plan;
  session: schema.PlanSession;
  entries: LoggingEntry[];
}

// ============================================================
// Reads
// ============================================================

/** Find the trainee's active plan, or null. */
export async function findActivePlanForTrainee(
  db: Db,
  traineeId: string,
): Promise<schema.Plan | null> {
  const rows = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, traineeId), eq(schema.plans.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Load the trainee's active plan, listing its sessions, with a count of how
 * many logs each session has + the date of the most recent one. Returns null
 * if the trainee has no active plan.
 */
export async function loadActivePlanSummaryForTrainee(db: Db, traineeId: string) {
  const plan = await findActivePlanForTrainee(db, traineeId);
  if (!plan) return null;

  const sessions = await db
    .select()
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, plan.id))
    .orderBy(schema.planSessions.ordinal);

  const sessionIds = sessions.map((s) => s.id);

  let countsBySession = new Map<string, { count: number; lastPerformedOn: string | null }>();
  if (sessionIds.length > 0) {
    const countRows = await db
      .select({
        planSessionId: schema.workoutLogs.planSessionId,
        c: count(),
        last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`,
      })
      .from(schema.workoutLogs)
      .where(
        and(
          eq(schema.workoutLogs.traineeId, traineeId),
          eq(schema.workoutLogs.planId, plan.id),
          inArray(schema.workoutLogs.planSessionId, sessionIds),
        ),
      )
      .groupBy(schema.workoutLogs.planSessionId);
    countsBySession = new Map(
      countRows.map((r) => [
        r.planSessionId,
        { count: Number(r.c), lastPerformedOn: r.last },
      ]),
    );
  }

  return {
    plan,
    sessions: sessions.map((s) => ({
      session: s,
      doneCount: countsBySession.get(s.id)?.count ?? 0,
      lastPerformedOn: countsBySession.get(s.id)?.lastPerformedOn ?? null,
    })),
  };
}

// ============================================================
// Active plan with full nested structure (trainee-side, view-only)
// ============================================================

export interface PlanSessionView {
  session: schema.PlanSession;
  doneCount: number;
  lastPerformedOn: string | null;
  blocks: Array<{
    block: schema.PlanBlock;
    items: Array<{
      item: schema.PlanItem;
      exercise: {
        id: string;
        name: string;
        unit: "REPS" | "SEC";
        description: string;
        demoFileId: string | null;
      };
    }>;
  }>;
}

export interface ActivePlanFull {
  plan: schema.Plan;
  sessions: PlanSessionView[];
}

/** Load the trainee's active plan with full nested sessions/blocks/items + per-session stats. */
export async function loadActivePlanFullForTrainee(
  db: Db,
  traineeId: string,
): Promise<ActivePlanFull | null> {
  const plan = await findActivePlanForTrainee(db, traineeId);
  if (!plan) return null;

  const sessions = await db
    .select()
    .from(schema.planSessions)
    .where(eq(schema.planSessions.planId, plan.id))
    .orderBy(schema.planSessions.ordinal);

  if (sessions.length === 0) {
    return { plan, sessions: [] };
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
          .select({
            item: schema.planItems,
            exercise: {
              id: schema.exercises.id,
              name: schema.exercises.name,
              unit: schema.exercises.unit,
              description: schema.exercises.description,
              demoFileId: schema.exercises.demoFileId,
            },
          })
          .from(schema.planItems)
          .innerJoin(
            schema.exercises,
            eq(schema.exercises.id, schema.planItems.exerciseId),
          )
          .where(inArray(schema.planItems.planBlockId, blockIds))
          .orderBy(schema.planItems.planBlockId, schema.planItems.ordinal);

  // Session-level log counts.
  const countRows = await db
    .select({
      planSessionId: schema.workoutLogs.planSessionId,
      c: count(),
      last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`,
    })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.traineeId, traineeId),
        eq(schema.workoutLogs.planId, plan.id),
        inArray(schema.workoutLogs.planSessionId, sessionIds),
      ),
    )
    .groupBy(schema.workoutLogs.planSessionId);
  const statsBySession = new Map(
    countRows.map((r) => [r.planSessionId, { count: Number(r.c), last: r.last }]),
  );

  // Group items by block.
  const itemsByBlock = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByBlock.get(it.item.planBlockId) ?? [];
    list.push(it);
    itemsByBlock.set(it.item.planBlockId, list);
  }

  // Group blocks (with their items) by session.
  const blocksBySession = new Map<string, PlanSessionView["blocks"]>();
  for (const b of blocks) {
    const list = blocksBySession.get(b.planSessionId) ?? [];
    list.push({ block: b, items: itemsByBlock.get(b.id) ?? [] });
    blocksBySession.set(b.planSessionId, list);
  }

  return {
    plan,
    sessions: sessions.map((s) => ({
      session: s,
      doneCount: statsBySession.get(s.id)?.count ?? 0,
      lastPerformedOn: statsBySession.get(s.id)?.last ?? null,
      blocks: blocksBySession.get(s.id) ?? [],
    })),
  };
}

/**
 * Expand one plan_session into the flat list of logging entries.
 * Verifies the session belongs to the given plan (defense-in-depth).
 */
export async function loadSessionForLogging(
  db: Db,
  planId: string,
  sessionId: string,
): Promise<SessionForLogging | null> {
  const planRows = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan) return null;

  const sessionRows = await db
    .select()
    .from(schema.planSessions)
    .where(and(eq(schema.planSessions.id, sessionId), eq(schema.planSessions.planId, planId)))
    .limit(1);
  const session = sessionRows[0];
  if (!session) return null;

  const blocks = await db
    .select()
    .from(schema.planBlocks)
    .where(eq(schema.planBlocks.planSessionId, session.id))
    .orderBy(schema.planBlocks.ordinal);

  if (blocks.length === 0) {
    return { plan, session, entries: [] };
  }

  const blockIds = blocks.map((b) => b.id);
  const items = await db
    .select({
      item: schema.planItems,
      exerciseName: schema.exercises.name,
      exerciseUnit: schema.exercises.unit,
    })
    .from(schema.planItems)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.planItems.exerciseId))
    .where(inArray(schema.planItems.planBlockId, blockIds))
    .orderBy(schema.planItems.planBlockId, schema.planItems.ordinal);

  const itemsByBlock = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByBlock.get(it.item.planBlockId) ?? [];
    list.push(it);
    itemsByBlock.set(it.item.planBlockId, list);
  }

  const entries: LoggingEntry[] = [];
  for (const block of blocks) {
    const isDropset = block.kind === "dropset";
    const blockItems = itemsByBlock.get(block.id) ?? [];
    for (const it of blockItems) {
      entries.push({
        planItemId: it.item.id,
        exerciseId: it.item.exerciseId,
        exerciseName: it.exerciseName,
        unit: it.item.unit,
        expectedSets: isDropset
          ? (block.sets ?? 1)
          : (it.item.sets ?? 1),
        expectedReps: it.item.reps,
        note: it.item.note,
        isDropsetItem: isDropset,
      });
    }
  }

  return { plan, session, entries };
}

// ============================================================
// Workout log lists + detail
// ============================================================

export interface WorkoutLogListItem {
  id: string;
  performedOn: string;
  sessionName: string;
  note: string | null;
  exerciseCount: number;
  setCount: number;
  hasVideo: boolean;
  avgDifficulty: number;
}

async function statsForLogs(db: Db, logIds: string[]) {
  if (logIds.length === 0) return new Map<string, Omit<WorkoutLogListItem, "id" | "performedOn" | "sessionName" | "note">>();
  const rows = await db
    .select({
      logId: schema.workoutExerciseLogs.workoutLogId,
      exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExerciseLogs.id})::int`,
      setCount: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`,
      avgDifficulty: sql<number>`COALESCE(AVG(${schema.workoutSetLogs.difficulty}), 0)::float`,
      hasVideo: sql<boolean>`bool_or(${schema.workoutSetLogs.videoFileId} IS NOT NULL)`,
    })
    .from(schema.workoutExerciseLogs)
    .leftJoin(
      schema.workoutSetLogs,
      eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
    )
    .where(inArray(schema.workoutExerciseLogs.workoutLogId, logIds))
    .groupBy(schema.workoutExerciseLogs.workoutLogId);
  return new Map(
    rows.map((r) => [
      r.logId,
      {
        exerciseCount: Number(r.exerciseCount),
        setCount: Number(r.setCount),
        hasVideo: Boolean(r.hasVideo),
        avgDifficulty: Math.round(Number(r.avgDifficulty) * 10) / 10,
      },
    ]),
  );
}

export async function listLogsForTrainee(
  db: Db,
  traineeId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<WorkoutLogListItem[]> {
  const baseRows = await db
    .select()
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId))
    .orderBy(desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt))
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);

  const stats = await statsForLogs(db, baseRows.map((r) => r.id));
  return baseRows.map((r) => ({
    id: r.id,
    performedOn: r.performedOn,
    sessionName: r.sessionName,
    note: r.note,
    exerciseCount: stats.get(r.id)?.exerciseCount ?? 0,
    setCount: stats.get(r.id)?.setCount ?? 0,
    hasVideo: stats.get(r.id)?.hasVideo ?? false,
    avgDifficulty: stats.get(r.id)?.avgDifficulty ?? 0,
  }));
}

export async function countClientsForTrainer(
  db: Db,
  trainerId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    );
  return Number(row?.c ?? 0);
}

export async function countLogsForTrainee(
  db: Db,
  traineeId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, traineeId));
  return Number(row?.c ?? 0);
}

export interface WorkoutLogDetail {
  log: schema.WorkoutLog;
  trainee: { id: string; displayName: string };
  exercises: Array<{
    log: schema.WorkoutExerciseLog;
    exercise: { id: string; name: string; unit: "REPS" | "SEC" };
    sets: Array<{
      log: schema.WorkoutSetLog;
      videoFileId: string | null;
    }>;
    /** Number of sets the plan expected at log time; 0 if plan data unavailable. */
    expectedSets: number;
    /** Planned reps/seconds per set; 0 if plan data unavailable. */
    expectedReps: number;
  }>;
  /** Sum of `expectedSets` across all exercises. 0 if plan unavailable. */
  totalExpectedSets: number;
}

/** Load a workout log with all its details. Returns null if not visible to the viewer. */
export async function loadLogForViewer(
  db: Db,
  logId: string,
  viewer: { id: string; role: "trainer" | "trainee"; trainerId: string | null },
): Promise<WorkoutLogDetail | null> {
  const rows = await db
    .select({
      log: schema.workoutLogs,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
    })
    .from(schema.workoutLogs)
    .innerJoin(schema.users, eq(schema.users.id, schema.workoutLogs.traineeId))
    .where(eq(schema.workoutLogs.id, logId))
    .limit(1);
  const head = rows[0];
  if (!head) return null;

  // Tenant scoping:
  // - Trainee: must be their own log.
  // - Trainer: log's trainer_id must match.
  if (viewer.role === "trainee" && head.log.traineeId !== viewer.id) return null;
  if (viewer.role === "trainer" && head.log.trainerId !== viewer.id) return null;

  const exLogs = await db
    .select({
      log: schema.workoutExerciseLogs,
      exercise: {
        id: schema.exercises.id,
        name: schema.exercises.name,
        unit: schema.exercises.unit,
      },
    })
    .from(schema.workoutExerciseLogs)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.workoutExerciseLogs.exerciseId))
    .where(eq(schema.workoutExerciseLogs.workoutLogId, logId))
    .orderBy(schema.workoutExerciseLogs.ordinal);

  if (exLogs.length === 0) {
    return {
      log: head.log,
      trainee: head.trainee,
      exercises: [],
      totalExpectedSets: 0,
    };
  }

  const exLogIds = exLogs.map((e) => e.log.id);
  const setLogs = await db
    .select()
    .from(schema.workoutSetLogs)
    .where(inArray(schema.workoutSetLogs.workoutExerciseLogId, exLogIds))
    .orderBy(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutSetLogs.ordinal);

  const setsByExLog = new Map<string, schema.WorkoutSetLog[]>();
  for (const s of setLogs) {
    const list = setsByExLog.get(s.workoutExerciseLogId) ?? [];
    list.push(s);
    setsByExLog.set(s.workoutExerciseLogId, list);
  }

  // Reconstruct the planned entries for this session (same shape the logging
  // form sees). Matched 1:1 by position with exLogs — that's the contract
  // saveWorkoutLog upholds: one workout_exercise_log per plan entry, in
  // entry order. If the plan can't be loaded (deleted? RESTRICT should make
  // that impossible, but be defensive), fall back to 0 = "no expected info".
  const planSession = await loadSessionForLogging(
    db,
    head.log.planId,
    head.log.planSessionId,
  );
  const entries = planSession?.entries ?? [];

  const exercises = exLogs.map((e, i) => {
    const entry = entries[i];
    return {
      log: e.log,
      exercise: e.exercise,
      sets: (setsByExLog.get(e.log.id) ?? []).map((s) => ({
        log: s,
        videoFileId: s.videoFileId,
      })),
      expectedSets: entry?.expectedSets ?? 0,
      expectedReps: entry?.expectedReps ?? 0,
    };
  });

  const totalExpectedSets = exercises.reduce((a, e) => a + e.expectedSets, 0);

  return {
    log: head.log,
    trainee: head.trainee,
    exercises,
    totalExpectedSets,
  };
}

// ============================================================
// Trainer-side trainee aggregation
// ============================================================

export interface ClientStats {
  id: string;
  displayName: string;
  joinedOn: string | null;
  totalSessions: number;
  lastSession: string | null;
  activePlanName: string | null;
  activePlanId: string | null;
}

export async function listClientsForTrainer(
  db: Db,
  trainerId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ClientStats[]> {
  const clients = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      joinedOn: schema.users.joinedOn,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .orderBy(schema.users.displayName)
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);

  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);

  const counts = await db
    .select({
      traineeId: schema.workoutLogs.traineeId,
      c: count(),
      last: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`,
    })
    .from(schema.workoutLogs)
    .where(inArray(schema.workoutLogs.traineeId, ids))
    .groupBy(schema.workoutLogs.traineeId);
  const statsByTrainee = new Map(counts.map((r) => [r.traineeId, r]));

  const activePlans = await db
    .select({
      traineeId: schema.plans.traineeId,
      planId: schema.plans.id,
      name: schema.plans.name,
    })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.trainerId, trainerId),
        eq(schema.plans.status, "active"),
        inArray(schema.plans.traineeId, ids),
      ),
    );
  const planByTrainee = new Map(activePlans.map((p) => [p.traineeId, p]));

  return clients.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    joinedOn: c.joinedOn,
    totalSessions: Number(statsByTrainee.get(c.id)?.c ?? 0),
    lastSession: statsByTrainee.get(c.id)?.last ?? null,
    activePlanName: planByTrainee.get(c.id)?.name ?? null,
    activePlanId: planByTrainee.get(c.id)?.planId ?? null,
  }));
}

// ============================================================
// Saves
// ============================================================

export class WorkoutSaveError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface SaveSetInput {
  /**
   * Original planned position of this set (0-indexed). Preserving it — rather
   * than re-indexing on insert — lets the viewer detect *which* sets were
   * skipped: any ordinal in [0, expectedSets) without a corresponding row is
   * a skip. Old logs (saved before this change) have consecutive ordinals
   * 0..n-1; in that case the missing tail is treated as "skipped at the end",
   * which is still informative.
   */
  ordinal: number;
  reps: number;
  difficulty: number;
  videoFileId: string | null;
}

export interface SaveExerciseLogInput {
  exerciseId: string;
  sets: SaveSetInput[];
}

export interface SaveWorkoutLogInput {
  traineeId: string;
  trainerId: string;
  planId: string;
  planSessionId: string;
  sessionName: string;
  performedOn: string; // YYYY-MM-DD
  note: string | null;
  allDone: boolean;
  exercises: SaveExerciseLogInput[];
}

/** Persist a workout log + nested exercise logs + set logs inside one transaction. */
export async function saveWorkoutLog(
  db: Db,
  input: SaveWorkoutLogInput,
): Promise<string> {
  return await db.transaction(async (tx) => {
    const [logRow] = await tx
      .insert(schema.workoutLogs)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        planId: input.planId,
        planSessionId: input.planSessionId,
        sessionName: input.sessionName,
        performedOn: input.performedOn,
        note: input.note,
        allDone: input.allDone,
      })
      .returning({ id: schema.workoutLogs.id });
    const logId = logRow!.id;

    for (const [eIdx, ex] of input.exercises.entries()) {
      const [exRow] = await tx
        .insert(schema.workoutExerciseLogs)
        .values({
          workoutLogId: logId,
          ordinal: eIdx,
          exerciseId: ex.exerciseId,
        })
        .returning({ id: schema.workoutExerciseLogs.id });
      const exLogId = exRow!.id;

      if (ex.sets.length > 0) {
        await tx.insert(schema.workoutSetLogs).values(
          ex.sets.map((s) => ({
            workoutExerciseLogId: exLogId,
            ordinal: s.ordinal,
            reps: s.reps,
            difficulty: s.difficulty,
            videoFileId: s.videoFileId,
          })),
        );
      }
    }

    return logId;
  });
}
