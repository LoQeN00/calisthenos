import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  smallint,
  timestamp,
  time,
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
export const consultationItemStatus = pgEnum("consultation_item_status", ["open", "resolved"]);
export const consultationStatus = pgEnum("consultation_status", [
  "planned",
  "confirmed",
  "change_requested",
  "cancelled",
  "documented",
]);
export const consultationCadence = pgEnum("consultation_cadence", [
  "weekly",
  "biweekly",
  "monthly",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "none",
  "incomplete",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
export const skillTier = pgEnum("skill_tier", ["basic", "intermediate", "advanced", "expert"]);

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
    monthlyAmountGrosze: integer("monthly_amount_grosze"),
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
    tracksRpe: boolean("tracks_rpe").notNull().default(true),
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
    trainerNameUniq: uniqueIndex("exercise_categories_trainer_name_uniq").on(t.trainerId, t.name),
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
    difficulty: integer("difficulty"),
    videoFileId: uuid("video_file_id").references(() => files.id, { onDelete: "set null" }),
  },
  (t) => ({
    uniq: uniqueIndex("workout_set_logs_exlog_ordinal_uniq").on(t.workoutExerciseLogId, t.ordinal),
    difficultyCheck: check(
      "workout_set_logs_difficulty_check",
      sql`${t.difficulty} IS NULL OR ${t.difficulty} BETWEEN 1 AND 10`,
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

// ---------------- Consultations ----------------

export const consultationSchedules = pgTable(
  "consultation_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cadence: consultationCadence("cadence").notNull(),
    weekday: smallint("weekday"),
    dayOfMonth: smallint("day_of_month"),
    timeOfDay: time("time_of_day").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    startsOn: date("starts_on").notNull(),
    defaultMeetingUrl: text("default_meeting_url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneActiveUniq: uniqueIndex("consultation_schedules_one_active_uniq")
      .on(t.trainerId, t.traineeId)
      .where(sql`${t.active}`),
    anchorCheck: check(
      "consultation_schedules_anchor_check",
      sql`(${t.cadence} IN ('weekly','biweekly') AND ${t.weekday} IS NOT NULL AND ${t.dayOfMonth} IS NULL)
          OR (${t.cadence} = 'monthly' AND ${t.dayOfMonth} IS NOT NULL AND ${t.weekday} IS NULL)`,
    ),
    domCheck: check(
      "consultation_schedules_dom_check",
      sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} >= 1 AND ${t.dayOfMonth} <= 28)`,
    ),
    weekdayCheck: check(
      "consultation_schedules_weekday_check",
      sql`${t.weekday} IS NULL OR (${t.weekday} >= 0 AND ${t.weekday} <= 6)`,
    ),
  }),
);

export const consultations = pgTable(
  "consultations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => consultationSchedules.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    status: consultationStatus("status").notNull().default("planned"),
    meetingUrl: text("meeting_url"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    traineeNote: text("trainee_note"),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeSchedIdx: index("consultations_trainee_sched_idx").on(t.traineeId, t.scheduledAt),
    trainerStatusIdx: index("consultations_trainer_status_idx").on(t.trainerId, t.status),
    scheduleIdx: index("consultations_schedule_idx").on(t.scheduleId),
    schedSlotUniq: uniqueIndex("consultations_schedule_slot_uniq").on(t.scheduleId, t.scheduledAt),
    periodCheck: check(
      "consultations_period_check",
      sql`(${t.periodFrom} IS NULL AND ${t.periodTo} IS NULL) OR
          (${t.periodFrom} IS NOT NULL AND ${t.periodTo} IS NOT NULL AND ${t.periodFrom} <= ${t.periodTo})`,
    ),
  }),
);

export const consultationActionItems = pgTable(
  "consultation_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    body: text("body").notNull(),
    status: consultationItemStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("consultation_action_items_consultation_ordinal_uniq").on(
      t.consultationId,
      t.ordinal,
    ),
  }),
);

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  trainerId: uuid("trainer_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull(),
  // access_token i refresh_token szyfrowane at-rest (AES-256-GCM, patrz lib/google/crypto.ts).
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  scope: text("scope").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------- Skills (drabiny wariantów) ----------------

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Stopień trudności — steruje pasem piramidy w drzewie umiejętności.
    // DEFAULT + NOT NULL backfilluje istniejące wiersze w tym samym ALTER TABLE.
    tier: skillTier("tier").notNull().default("basic"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial: zarchiwizowana umiejętność NIE blokuje utworzenia nowej o tej samej
    // nazwie (po archiwizacji „znika z listy", więc nazwa powinna być znów wolna).
    trainerNameUniq: uniqueIndex("skills_trainer_name_uniq")
      .on(t.trainerId, t.name)
      .where(sql`${t.archivedAt} IS NULL`),
    trainerIdx: index("skills_trainer_idx").on(t.trainerId),
  }),
);

export const skillVariations = pgTable(
  "skill_variations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillOrdinalUniq: uniqueIndex("skill_variations_skill_ordinal_uniq").on(t.skillId, t.ordinal),
    skillExerciseUniq: uniqueIndex("skill_variations_skill_exercise_uniq").on(
      t.skillId,
      t.exerciseId,
    ),
    // Ćwiczenie należy do co najwyżej jednej umiejętności. Indeks wygląda globalnie,
    // ale exercises są per-trener (mają własny trainer_id), więc działa w zakresie trenera.
    exerciseUniq: uniqueIndex("skill_variations_exercise_uniq").on(t.exerciseId),
  }),
);

export const skillAdvancements = pgTable(
  "skill_advancements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    fromVariationId: uuid("from_variation_id").references(() => skillVariations.id, {
      onDelete: "restrict",
    }),
    toVariationId: uuid("to_variation_id")
      .notNull()
      .references(() => skillVariations.id, { onDelete: "restrict" }),
    advancedOn: date("advanced_on").notNull(),
    advancedBy: uuid("advanced_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeSkillIdx: index("skill_advancements_trainee_skill_idx").on(
      t.traineeId,
      t.skillId,
      t.advancedOn,
    ),
    trainerIdx: index("skill_advancements_trainer_idx").on(t.trainerId, t.createdAt),
  }),
);

export const skillPrerequisites = pgTable(
  "skill_prerequisites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalizacja tenant-scope (jak skill_advancements/workout_logs).
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Umiejętność, która MA prerekwizyt.
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    // Prerekwizyt (musi być opanowany, by odblokować skillId).
    requiresSkillId: uuid("requires_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    edgeUniq: uniqueIndex("skill_prerequisites_edge_uniq").on(t.skillId, t.requiresSkillId),
    trainerIdx: index("skill_prerequisites_trainer_idx").on(t.trainerId),
    skillIdx: index("skill_prerequisites_skill_idx").on(t.skillId),
    requiresIdx: index("skill_prerequisites_requires_idx").on(t.requiresSkillId),
    // Acykliczność egzekwujemy w repo (Postgres nie ma constraintu DAG);
    // tu blokujemy tylko trywialną pętlę własną.
    noSelfLoop: check(
      "skill_prerequisites_no_self_loop",
      sql`${t.skillId} <> ${t.requiresSkillId}`,
    ),
  }),
);

// ---------------- Payments / Stripe ----------------

export const stripeConnections = pgTable("stripe_connections", {
  trainerId: uuid("trainer_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  detailsSubmitted: boolean("details_submitted").notNull().default(false),
  country: text("country"),
  defaultCurrency: text("default_currency"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachingSubscriptions = pgTable(
  "coaching_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountGrosze: integer("amount_grosze").notNull(),
    currency: text("currency").notNull().default("pln"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: subscriptionStatus("status").notNull().default("none"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairUniq: uniqueIndex("coaching_subscriptions_pair_uniq").on(t.trainerId, t.traineeId),
    subUniq: uniqueIndex("coaching_subscriptions_sub_uniq")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} IS NOT NULL`),
    trainerStatusIdx: index("coaching_subscriptions_trainer_status_idx").on(t.trainerId, t.status),
    amountCheck: check("coaching_subscriptions_amount_check", sql`${t.amountGrosze} >= 0`),
  }),
);

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    amountGrosze: integer("amount_grosze").notNull(),
    currency: text("currency").notNull().default("pln"),
    status: text("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceUniq: uniqueIndex("subscription_payments_invoice_uniq").on(t.stripeInvoiceId),
    traineeCreatedIdx: index("subscription_payments_trainee_created_idx").on(
      t.traineeId,
      t.createdAt,
    ),
  }),
);

// Dedup zdarzeń webhooka Stripe: event.id jako PRIMARY KEY. Wstawienie „insert-first,
// on-conflict-skip" w trasie webhooka gwarantuje, że ponowne dostarczenie tego samego
// eventu (Stripe potrafi dostarczyć >1 raz) nie zostanie przetworzone drugi raz —
// twarda bariera niezależna od idempotencji per-faktura/subskrypcja.
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

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
export type Consultation = typeof consultations.$inferSelect;
export type NewConsultation = typeof consultations.$inferInsert;
export type ConsultationStatus = (typeof consultationStatus.enumValues)[number];
export type ConsultationSchedule = typeof consultationSchedules.$inferSelect;
export type NewConsultationSchedule = typeof consultationSchedules.$inferInsert;
export type ConsultationCadence = (typeof consultationCadence.enumValues)[number];
export type ConsultationActionItem = typeof consultationActionItems.$inferSelect;
export type NewConsultationActionItem = typeof consultationActionItems.$inferInsert;
export type ConsultationItemStatus = (typeof consultationItemStatus.enumValues)[number];
export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type NewGoogleCalendarConnection = typeof googleCalendarConnections.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillVariation = typeof skillVariations.$inferSelect;
export type NewSkillVariation = typeof skillVariations.$inferInsert;
export type SkillAdvancement = typeof skillAdvancements.$inferSelect;
export type NewSkillAdvancement = typeof skillAdvancements.$inferInsert;
export type SkillPrerequisite = typeof skillPrerequisites.$inferSelect;
export type NewSkillPrerequisite = typeof skillPrerequisites.$inferInsert;
export type StripeConnection = typeof stripeConnections.$inferSelect;
export type NewStripeConnection = typeof stripeConnections.$inferInsert;
export type CoachingSubscription = typeof coachingSubscriptions.$inferSelect;
export type NewCoachingSubscription = typeof coachingSubscriptions.$inferInsert;
export type SubscriptionStatusDb = (typeof subscriptionStatus.enumValues)[number];
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
export type NewSubscriptionPayment = typeof subscriptionPayments.$inferInsert;
export type ProcessedWebhookEvent = typeof processedWebhookEvents.$inferSelect;
export type NewProcessedWebhookEvent = typeof processedWebhookEvents.$inferInsert;
