CREATE TYPE "public"."block_kind" AS ENUM('single', 'superset', 'dropset');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_session_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "block_kind" NOT NULL,
	"sets" integer,
	"rest_seconds" integer,
	CONSTRAINT "plan_blocks_kind_check" CHECK (("plan_blocks"."kind" = 'dropset' AND "plan_blocks"."sets" IS NOT NULL AND "plan_blocks"."rest_seconds" IS NOT NULL) OR
          ("plan_blocks"."kind" <> 'dropset' AND "plan_blocks"."sets" IS NULL AND "plan_blocks"."rest_seconds" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_block_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sets" integer,
	"rest_seconds" integer,
	"reps" integer NOT NULL,
	"unit" "exercise_unit" NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"based_on_version" integer,
	"status" "plan_status" NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_blocks" ADD CONSTRAINT "plan_blocks_plan_session_id_plan_sessions_id_fk" FOREIGN KEY ("plan_session_id") REFERENCES "public"."plan_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_block_id_plan_blocks_id_fk" FOREIGN KEY ("plan_block_id") REFERENCES "public"."plan_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plans" ADD CONSTRAINT "plans_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plans" ADD CONSTRAINT "plans_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_blocks_session_ordinal_uniq" ON "plan_blocks" USING btree ("plan_session_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_items_block_ordinal_uniq" ON "plan_items" USING btree ("plan_block_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_sessions_plan_ordinal_uniq" ON "plan_sessions" USING btree ("plan_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_trainee_version_uniq" ON "plans" USING btree ("trainee_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_trainee_active_uniq" ON "plans" USING btree ("trainee_id") WHERE "plans"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_trainee_draft_uniq" ON "plans" USING btree ("trainee_id") WHERE "plans"."status" = 'draft';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_trainer_idx" ON "plans" USING btree ("trainer_id");