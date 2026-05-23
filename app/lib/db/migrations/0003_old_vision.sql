CREATE TABLE IF NOT EXISTS "workout_exercise_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_log_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"exercise_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workout_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_session_id" uuid NOT NULL,
	"session_name" text NOT NULL,
	"performed_on" date NOT NULL,
	"note" text,
	"all_done" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workout_set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_exercise_log_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"reps" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"video_file_id" uuid,
	CONSTRAINT "workout_set_logs_difficulty_check" CHECK ("workout_set_logs"."difficulty" BETWEEN 1 AND 10)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_exercise_logs" ADD CONSTRAINT "workout_exercise_logs_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_exercise_logs" ADD CONSTRAINT "workout_exercise_logs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_plan_session_id_plan_sessions_id_fk" FOREIGN KEY ("plan_session_id") REFERENCES "public"."plan_sessions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_workout_exercise_log_id_workout_exercise_logs_id_fk" FOREIGN KEY ("workout_exercise_log_id") REFERENCES "public"."workout_exercise_logs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_video_file_id_files_id_fk" FOREIGN KEY ("video_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workout_exercise_logs_log_ordinal_uniq" ON "workout_exercise_logs" USING btree ("workout_log_id","ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_logs_trainee_date_idx" ON "workout_logs" USING btree ("trainee_id","performed_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_logs_trainer_created_idx" ON "workout_logs" USING btree ("trainer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workout_set_logs_exlog_ordinal_uniq" ON "workout_set_logs" USING btree ("workout_exercise_log_id","ordinal");