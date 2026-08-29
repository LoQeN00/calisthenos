import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  not,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { logger } from "~/lib/logger";

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
  /** Czy ćwiczenie zbiera ocenę trudności (RPE) per seria. */
  tracksRpe: boolean;
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
      countRows.map((r) => [r.planSessionId, { count: Number(r.c), lastPerformedOn: r.last }]),
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
          .innerJoin(schema.exercises, eq(schema.exercises.id, schema.planItems.exerciseId))
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
  const planRows = await db.select().from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
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
      exerciseTracksRpe: schema.exercises.tracksRpe,
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
        expectedSets: isDropset ? (block.sets ?? 1) : (it.item.sets ?? 1),
        expectedReps: it.item.reps,
        note: it.item.note,
        isDropsetItem: isDropset,
        tracksRpe: it.exerciseTracksRpe,
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
  avgDifficulty: number | null;
}

export type LogSort = "date_desc" | "date_asc" | "hardest" | "easiest" | "sets_desc";

export interface LogListOpts {
  limit?: number;
  offset?: number;
  sort?: LogSort; // domyślnie "date_desc"
  q?: string; // search po nazwie sesji
  video?: "all" | "with" | "without"; // domyślnie "all"
}

export async function listLogsForTrainee(
  db: Db,
  traineeId: string,
  opts: LogListOpts = {},
): Promise<WorkoutLogListItem[]> {
  const statsSub = db.$with("log_stats").as(
    db
      .select({
        logId: schema.workoutExerciseLogs.workoutLogId,
        exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExerciseLogs.id})::int`.as(
          "exercise_count",
        ),
        setCount: sql<number>`COUNT(${schema.workoutSetLogs.id})::int`.as("set_count"),
        avgDifficulty: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`.as(
          "avg_difficulty",
        ),
        hasVideo: sql<boolean>`bool_or(${schema.workoutSetLogs.videoFileId} IS NOT NULL)`.as(
          "has_video",
        ),
      })
      .from(schema.workoutExerciseLogs)
      .leftJoin(
        schema.workoutSetLogs,
        eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
      )
      .groupBy(schema.workoutExerciseLogs.workoutLogId),
  );

  const conditions = [eq(schema.workoutLogs.traineeId, traineeId)];
  if (opts.q && opts.q.length > 0) {
    conditions.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
  }
  if (opts.video === "with") conditions.push(sql`COALESCE(${statsSub.hasVideo}, false) = true`);
  if (opts.video === "without") conditions.push(sql`COALESCE(${statsSub.hasVideo}, false) = false`);

  const orderBy =
    opts.sort === "date_asc"
      ? [asc(schema.workoutLogs.performedOn), asc(schema.workoutLogs.createdAt)]
      : opts.sort === "hardest"
        ? [sql`${statsSub.avgDifficulty} DESC NULLS LAST`, desc(schema.workoutLogs.performedOn)]
        : opts.sort === "easiest"
          ? [sql`${statsSub.avgDifficulty} ASC NULLS LAST`, desc(schema.workoutLogs.performedOn)]
          : opts.sort === "sets_desc"
            ? [sql`COALESCE(${statsSub.setCount}, 0) DESC`, desc(schema.workoutLogs.performedOn)]
            : [desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt)];

  const rows = await db
    .with(statsSub)
    .select({
      log: schema.workoutLogs,
      exerciseCount: sql<number>`COALESCE(${statsSub.exerciseCount}, 0)::int`,
      setCount: sql<number>`COALESCE(${statsSub.setCount}, 0)::int`,
      avgDifficulty: sql<number | null>`${statsSub.avgDifficulty}`,
      hasVideo: sql<boolean>`COALESCE(${statsSub.hasVideo}, false)`,
    })
    .from(schema.workoutLogs)
    .leftJoin(statsSub, eq(statsSub.logId, schema.workoutLogs.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.log.id,
    performedOn: r.log.performedOn,
    sessionName: r.log.sessionName,
    note: r.log.note,
    exerciseCount: Number(r.exerciseCount),
    setCount: Number(r.setCount),
    hasVideo: Boolean(r.hasVideo),
    avgDifficulty: r.avgDifficulty == null ? null : Math.round(Number(r.avgDifficulty) * 10) / 10,
  }));
}

export async function countClientsForTrainer(
  db: Db,
  trainerId: string,
  opts: { q?: string; plan?: "all" | "with" | "without" } = {},
): Promise<number> {
  const conds = [eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")];
  if (opts.q && opts.q.length > 0) {
    conds.push(
      or(ilike(schema.users.displayName, `%${opts.q}%`), ilike(schema.users.email, `%${opts.q}%`))!,
    );
  }
  const activePlanSub = db
    .select({ x: sql`1` })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.traineeId, schema.users.id),
        eq(schema.plans.trainerId, trainerId),
        eq(schema.plans.status, "active"),
      ),
    );
  if (opts.plan === "with") conds.push(exists(activePlanSub));
  if (opts.plan === "without") conds.push(not(exists(activePlanSub)));
  const [row] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(...conds));
  return Number(row?.c ?? 0);
}

export async function countLogsForTrainee(
  db: Db,
  traineeId: string,
  opts: { q?: string; video?: "all" | "with" | "without" } = {},
): Promise<number> {
  if (opts.video === "with" || opts.video === "without") {
    const statsSub = db.$with("log_stats").as(
      db
        .select({
          logId: schema.workoutExerciseLogs.workoutLogId,
          hasVideo: sql<boolean>`bool_or(${schema.workoutSetLogs.videoFileId} IS NOT NULL)`.as(
            "has_video",
          ),
        })
        .from(schema.workoutExerciseLogs)
        .leftJoin(
          schema.workoutSetLogs,
          eq(schema.workoutSetLogs.workoutExerciseLogId, schema.workoutExerciseLogs.id),
        )
        .groupBy(schema.workoutExerciseLogs.workoutLogId),
    );
    const conds = [eq(schema.workoutLogs.traineeId, traineeId)];
    if (opts.q && opts.q.length > 0)
      conds.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
    conds.push(
      opts.video === "with"
        ? sql`COALESCE(${statsSub.hasVideo}, false) = true`
        : sql`COALESCE(${statsSub.hasVideo}, false) = false`,
    );
    const [row] = await db
      .with(statsSub)
      .select({ c: count() })
      .from(schema.workoutLogs)
      .leftJoin(statsSub, eq(statsSub.logId, schema.workoutLogs.id))
      .where(and(...conds));
    return Number(row?.c ?? 0);
  }

  const conds = [eq(schema.workoutLogs.traineeId, traineeId)];
  if (opts.q && opts.q.length > 0) conds.push(ilike(schema.workoutLogs.sessionName, `%${opts.q}%`));
  const [row] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(and(...conds));
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
  const planSession = await loadSessionForLogging(db, head.log.planId, head.log.planSessionId);
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

export type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest";

export interface ClientListOpts {
  limit?: number;
  offset?: number;
  sort?: ClientSort;
  q?: string;
  plan?: "all" | "with" | "without";
}

export async function listClientsForTrainer(
  db: Db,
  trainerId: string,
  opts: ClientListOpts = {},
): Promise<ClientStats[]> {
  const statsSub = db.$with("client_stats").as(
    db
      .select({
        traineeId: schema.workoutLogs.traineeId,
        sessionCount: count().as("session_count"),
        lastSession: sql<string | null>`MAX(${schema.workoutLogs.performedOn})`.as("last_session"),
      })
      .from(schema.workoutLogs)
      .groupBy(schema.workoutLogs.traineeId),
  );

  const conditions = [eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")];
  if (opts.q && opts.q.length > 0) {
    conditions.push(
      or(ilike(schema.users.displayName, `%${opts.q}%`), ilike(schema.users.email, `%${opts.q}%`))!,
    );
  }

  // Correlated EXISTS on an active plan for this trainee under this trainer.
  const activePlanSub = db
    .select({ x: sql`1` })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.traineeId, schema.users.id),
        eq(schema.plans.trainerId, trainerId),
        eq(schema.plans.status, "active"),
      ),
    );
  if (opts.plan === "with") conditions.push(exists(activePlanSub));
  if (opts.plan === "without") conditions.push(not(exists(activePlanSub)));

  const orderBy =
    opts.sort === "name_desc"
      ? [desc(schema.users.displayName)]
      : opts.sort === "last_session"
        ? [sql`${statsSub.lastSession} DESC NULLS LAST`, asc(schema.users.displayName)]
        : opts.sort === "most_sessions"
          ? [sql`COALESCE(${statsSub.sessionCount}, 0) DESC`, asc(schema.users.displayName)]
          : opts.sort === "newest"
            ? [sql`${schema.users.joinedOn} DESC NULLS LAST`, asc(schema.users.displayName)]
            : [asc(schema.users.displayName)];

  const clients = await db
    .with(statsSub)
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      joinedOn: schema.users.joinedOn,
      totalSessions: sql<number>`COALESCE(${statsSub.sessionCount}, 0)::int`,
      lastSession: sql<string | null>`${statsSub.lastSession}`,
    })
    .from(schema.users)
    .leftJoin(statsSub, eq(statsSub.traineeId, schema.users.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);

  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);

  // Active plan names for the page.
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
    totalSessions: Number(c.totalSessions),
    lastSession: c.lastSession ?? null,
    activePlanName: planByTrainee.get(c.id)?.name ?? null,
    activePlanId: planByTrainee.get(c.id)?.planId ?? null,
  }));
}

export interface RecentLogRow {
  log: schema.WorkoutLog;
  trainee: { id: string; displayName: string };
}

/** Ostatnie treningi wszystkich podopiecznych trenera — pulpit. */
export async function listRecentLogsForTrainer(
  db: Db,
  trainerId: string,
  limit: number,
): Promise<RecentLogRow[]> {
  return await db
    .select({
      log: schema.workoutLogs,
      trainee: { id: schema.users.id, displayName: schema.users.displayName },
    })
    .from(schema.workoutLogs)
    .innerJoin(schema.users, eq(schema.users.id, schema.workoutLogs.traineeId))
    .where(eq(schema.workoutLogs.trainerId, trainerId))
    .orderBy(desc(schema.workoutLogs.performedOn), desc(schema.workoutLogs.createdAt))
    .limit(limit);
}

/** Liczba treningów trenera od podanej daty włącznie (`performedOn >= sinceIso`). */
export async function countLogsForTrainerSince(
  db: Db,
  trainerId: string,
  sinceIso: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(
        eq(schema.workoutLogs.trainerId, trainerId),
        gte(schema.workoutLogs.performedOn, sinceIso),
      ),
    );
  return Number(row?.c ?? 0);
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
  difficulty: number | null;
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

/**
 * Czysta część walidacji nagrań: które z żądanych identyfikatorów nie nadają się do
 * podpięcia. Dwie reguły:
 *  1. id nie wróciło z bazy — jest cudze, złego rodzaju, spoza tenanta, już podpięte
 *     albo sprzątnięte przez sweeper;
 *  2. id powtarza się w żądaniu — jeden upload nie może obsłużyć dwóch serii, a samo
 *     zapytanie tego nie wykryje (zwróci wiersz raz i będzie wyglądał poprawnie).
 */
/** Kształt UUID — `files.id` jest kolumną `uuid`, więc śmieć musi odpaść przed zapytaniem. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function findUnusableVideoIds(requested: string[], usable: Array<{ id: string }>): string[] {
  const ok = new Set(usable.map((r) => r.id));
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const id of requested) {
    if (!ok.has(id) || seen.has(id)) bad.push(id);
    seen.add(id);
  }
  return bad;
}

/**
 * Rzuca `WorkoutSaveError`, jeśli którekolwiek z podanych nagrań nie należy do TEGO
 * podopiecznego, nie jest rodzaju `set_video`, wypada poza tenanta albo jest już
 * podpięte do innej serii.
 *
 * Konieczne od czasu rozdzielenia uploadu od zapisu: wcześniej `videoFileId` pochodził
 * z `uploadFile` w tym samym żądaniu, teraz przychodzi od klienta.
 *
 * `uploaded_by` jest tu KLUCZOWE i sam `trainer_id` NIE wystarcza — podopieczni jednego
 * trenera dzielą tę samą wartość `trainer_id`, więc bez tego warunku podopieczny A mógłby
 * podpiąć pod swój trening nagranie podopiecznego B.
 */
export async function assertOwnedUnclaimedVideos(
  db: Db,
  args: { traineeId: string; trainerId: string; fileIds: string[] },
): Promise<void> {
  if (args.fileIds.length === 0) return;

  // Odsiej identyfikatory o niepoprawnym kształcie PRZED zapytaniem: `files.id` jest
  // kolumną `uuid`, więc wstawienie tam czegokolwiek innego kończy się błędem Postgresa
  // 22P02, a ten nie jest `WorkoutSaveError` — poleciałby jako 500 i ErrorBoundary.
  // Identyfikatory pochodzą od klienta, więc to trywialnie wywoływalne.
  // Odsiane id trafiają niżej do `bad` przez porównanie z pełną listą żądań.
  const wellFormed = args.fileIds.filter((id) => UUID_RE.test(id));
  if (wellFormed.length === 0) {
    logger.warn("workout.video_ids_rejected", {
      count: args.fileIds.length,
      requested: args.fileIds.length,
      traineeId: args.traineeId,
    });
    throw new WorkoutSaveError(
      `rejected ${args.fileIds.length} malformed video ids`,
      "Któreś z nagrań nie jest już dostępne. Odśwież stronę i dodaj je ponownie.",
    );
  }

  const rows = await db
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(
      and(
        inArray(schema.files.id, wellFormed),
        eq(schema.files.kind, "set_video"),
        eq(schema.files.trainerId, args.trainerId),
        eq(schema.files.uploadedBy, args.traineeId),
        notExists(
          db
            .select({ x: sql`1` })
            .from(schema.workoutSetLogs)
            .where(eq(schema.workoutSetLogs.videoFileId, schema.files.id)),
        ),
      ),
    );

  const bad = findUnusableVideoIds(args.fileIds, rows);
  if (bad.length > 0) {
    // Bez samych identyfikatorów w logu — liczba wystarcza do diagnozy, a nie zdradza
    // cudzych zasobów w strumieniu logów.
    logger.warn("workout.video_ids_rejected", {
      count: bad.length,
      requested: args.fileIds.length,
      traineeId: args.traineeId,
    });
    throw new WorkoutSaveError(
      `rejected ${bad.length} of ${args.fileIds.length} video ids`,
      "Któreś z nagrań nie jest już dostępne. Odśwież stronę i dodaj je ponownie.",
    );
  }
}

/** Persist a workout log + nested exercise logs + set logs inside one transaction. */
export async function saveWorkoutLog(db: Db, input: SaveWorkoutLogInput): Promise<string> {
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
