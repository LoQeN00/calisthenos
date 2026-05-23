import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  timestamp,
  date,
  check,
  index,
  uniqueIndex,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// citext is a Postgres case-insensitive text type; not in drizzle's built-ins.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

// ---------------- Enums ----------------

export const userRole = pgEnum("user_role", ["trainer", "trainee"]);
export const exerciseUnit = pgEnum("exercise_unit", ["REPS", "SEC"]);
export const fileKind = pgEnum("file_kind", ["exercise_demo", "set_video", "body_photo"]);
export const planStatus = pgEnum("plan_status", ["draft", "active", "archived"]);
export const blockKind = pgEnum("block_kind", ["single", "superset", "dropset"]);
export const bodyPhotoView = pgEnum("body_photo_view", ["front", "side", "back"]);

// ---------------- Users ----------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull(),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    role: userRole("role").notNull(),
    // self-reference: a trainee's trainer_id points to another row in users
    trainerId: uuid("trainer_id").references((): AnyPgColumn => users.id, {
      onDelete: "restrict",
    }),
    joinedOn: date("joined_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUniq: uniqueIndex("users_email_uniq").on(t.email),
    roleCheck: check(
      "users_role_check",
      sql`(${t.role} = 'trainer' AND ${t.trainerId} IS NULL) OR
          (${t.role} = 'trainee' AND ${t.trainerId} IS NOT NULL)`,
    ),
  }),
);

// ---------------- Sessions + Invites ----------------

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // 32-byte base64url
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgentHint: text("user_agent_hint"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: citext("email"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUser: uuid("consumed_by_user").references(() => users.id),
    replacesUserId: uuid("replaces_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUniq: uniqueIndex("invites_token_hash_uniq").on(t.tokenHash),
    trainerIdx: index("invites_trainer_idx").on(t.trainerId),
  }),
);

// ---------------- Files ----------------

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: fileKind("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    storagePath: text("storage_path").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storagePathUniq: uniqueIndex("files_storage_path_uniq").on(t.storagePath),
    trainerKindIdx: index("files_trainer_kind_idx").on(t.trainerId, t.kind),
  }),
);

// ---------------- Exercises ----------------

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: exerciseUnit("unit").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    demoFileId: uuid("demo_file_id").references(() => files.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trainerIdx: index("exercises_trainer_idx").on(t.trainerId),
    tagsGin: index("exercises_tags_gin").using("gin", t.tags),
  }),
);

// ---------------- Exercise categories ----------------

// Per-trainer list of category labels for tagging exercises. The exercises.tags
// text[] column still stores the chosen labels on each exercise; this table just
// drives the picker UI and the filter chips so categories appear in filters even
// before any exercise uses them.
export const exerciseCategories = pgTable(
  "exercise_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trainerNameUniq: uniqueIndex("exercise_categories_trainer_name_uniq").on(
      t.trainerId,
      t.name,
    ),
    trainerIdx: index("exercise_categories_trainer_idx").on(t.trainerId),
  }),
);

// ---------------- Plans ----------------

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    basedOnVersion: integer("based_on_version"),
    status: planStatus("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUniq: uniqueIndex("plans_trainee_version_uniq").on(t.traineeId, t.version),
    activeUniq: uniqueIndex("plans_trainee_active_uniq")
      .on(t.traineeId)
      .where(sql`${t.status} = 'active'`),
    draftUniq: uniqueIndex("plans_trainee_draft_uniq")
      .on(t.traineeId)
      .where(sql`${t.status} = 'draft'`),
    trainerIdx: index("plans_trainer_idx").on(t.trainerId),
  }),
);

export const planSessions = pgTable(
  "plan_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    name: text("name").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("plan_sessions_plan_ordinal_uniq").on(t.planId, t.ordinal),
  }),
);

export const planBlocks = pgTable(
  "plan_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planSessionId: uuid("plan_session_id")
      .notNull()
      .references(() => planSessions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    kind: blockKind("kind").notNull(),
    // For dropset blocks: holds the shared sets/rest for all drops.
    // For single/superset blocks: must be NULL (enforced by CHECK constraint).
    sets: integer("sets"),
    restSeconds: integer("rest_seconds"),
  },
  (t) => ({
    uniq: uniqueIndex("plan_blocks_session_ordinal_uniq").on(t.planSessionId, t.ordinal),
    kindCheck: check(
      "plan_blocks_kind_check",
      sql`(${t.kind} = 'dropset' AND ${t.sets} IS NOT NULL AND ${t.restSeconds} IS NOT NULL) OR
          (${t.kind} <> 'dropset' AND ${t.sets} IS NULL AND ${t.restSeconds} IS NULL)`,
    ),
  }),
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planBlockId: uuid("plan_block_id")
      .notNull()
      .references(() => planBlocks.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    // For single/superset blocks: each item carries its own sets/rest.
    // For dropset blocks: these are NULL (block carries them).
    sets: integer("sets"),
    restSeconds: integer("rest_seconds"),
    reps: integer("reps").notNull(),
    unit: exerciseUnit("unit").notNull(),
    note: text("note"),
  },
  (t) => ({
    uniq: uniqueIndex("plan_items_block_ordinal_uniq").on(t.planBlockId, t.ordinal),
  }),
);

// ---------------- Workout logs ----------------

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalized for tenant-scoped queries without joining the trainee.
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    planSessionId: uuid("plan_session_id")
      .notNull()
      .references(() => planSessions.id, { onDelete: "restrict" }),
    // Snapshot of the session name as it was when logged — survives later renames.
    sessionName: text("session_name").notNull(),
    performedOn: date("performed_on").notNull(),
    note: text("note"),
    allDone: boolean("all_done").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeDateIdx: index("workout_logs_trainee_date_idx").on(t.traineeId, t.performedOn),
    trainerCreatedIdx: index("workout_logs_trainer_created_idx").on(t.trainerId, t.createdAt),
  }),
);

export const workoutExerciseLogs = pgTable(
  "workout_exercise_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutLogId: uuid("workout_log_id")
      .notNull()
      .references(() => workoutLogs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
  },
  (t) => ({
    uniq: uniqueIndex("workout_exercise_logs_log_ordinal_uniq").on(t.workoutLogId, t.ordinal),
  }),
);

export const workoutSetLogs = pgTable(
  "workout_set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutExerciseLogId: uuid("workout_exercise_log_id")
      .notNull()
      .references(() => workoutExerciseLogs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    reps: integer("reps").notNull(),
    difficulty: integer("difficulty").notNull(),
    videoFileId: uuid("video_file_id").references(() => files.id, { onDelete: "set null" }),
  },
  (t) => ({
    uniq: uniqueIndex("workout_set_logs_exlog_ordinal_uniq").on(t.workoutExerciseLogId, t.ordinal),
    difficultyCheck: check(
      "workout_set_logs_difficulty_check",
      sql`${t.difficulty} BETWEEN 1 AND 10`,
    ),
  }),
);

// ---------------- Body photos ----------------

export const bodyPhotos = pgTable(
  "body_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    view: bodyPhotoView("view").notNull(),
    takenOn: date("taken_on").notNull(),
    note: text("note"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeDateIdx: index("body_photos_trainee_date_idx").on(t.traineeId, t.takenOn),
    trainerIdx: index("body_photos_trainer_idx").on(t.trainerId),
  }),
);

// ---------------- Types ----------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type ExerciseCategory = typeof exerciseCategories.$inferSelect;
export type NewExerciseCategory = typeof exerciseCategories.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanSession = typeof planSessions.$inferSelect;
export type NewPlanSession = typeof planSessions.$inferInsert;
export type PlanBlock = typeof planBlocks.$inferSelect;
export type NewPlanBlock = typeof planBlocks.$inferInsert;
export type PlanItem = typeof planItems.$inferSelect;
export type NewPlanItem = typeof planItems.$inferInsert;
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type NewWorkoutLog = typeof workoutLogs.$inferInsert;
export type WorkoutExerciseLog = typeof workoutExerciseLogs.$inferSelect;
export type NewWorkoutExerciseLog = typeof workoutExerciseLogs.$inferInsert;
export type WorkoutSetLog = typeof workoutSetLogs.$inferSelect;
export type NewWorkoutSetLog = typeof workoutSetLogs.$inferInsert;
export type BodyPhoto = typeof bodyPhotos.$inferSelect;
export type NewBodyPhoto = typeof bodyPhotos.$inferInsert;
export type BodyPhotoView = (typeof bodyPhotoView.enumValues)[number];
