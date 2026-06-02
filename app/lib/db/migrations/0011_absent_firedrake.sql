CREATE TYPE "public"."consultation_cadence" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."consultation_status" AS ENUM('planned', 'confirmed', 'change_requested', 'cancelled', 'documented');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"cadence" "consultation_cadence" NOT NULL,
	"weekday" smallint,
	"day_of_month" smallint,
	"time_of_day" time NOT NULL,
	"duration_min" integer DEFAULT 45 NOT NULL,
	"starts_on" date NOT NULL,
	"default_meeting_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_schedules_anchor_check" CHECK (("consultation_schedules"."cadence" IN ('weekly','biweekly') AND "consultation_schedules"."weekday" IS NOT NULL AND "consultation_schedules"."day_of_month" IS NULL)
          OR ("consultation_schedules"."cadence" = 'monthly' AND "consultation_schedules"."day_of_month" IS NOT NULL AND "consultation_schedules"."weekday" IS NULL)),
	CONSTRAINT "consultation_schedules_dom_check" CHECK ("consultation_schedules"."day_of_month" IS NULL OR ("consultation_schedules"."day_of_month" >= 1 AND "consultation_schedules"."day_of_month" <= 28)),
	CONSTRAINT "consultation_schedules_weekday_check" CHECK ("consultation_schedules"."weekday" IS NULL OR ("consultation_schedules"."weekday" >= 0 AND "consultation_schedules"."weekday" <= 6))
);
--> statement-breakpoint
DROP INDEX IF EXISTS "consultations_trainee_date_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "consultations_trainer_created_idx";--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "scheduled_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "duration_min" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "status" "consultation_status" DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "trainee_note" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "google_event_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_schedules" ADD CONSTRAINT "consultation_schedules_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_schedules" ADD CONSTRAINT "consultation_schedules_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_schedules_one_active_uniq" ON "consultation_schedules" USING btree ("trainer_id","trainee_id") WHERE "consultation_schedules"."active";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultations" ADD CONSTRAINT "consultations_schedule_id_consultation_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."consultation_schedules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultations_trainee_sched_idx" ON "consultations" USING btree ("trainee_id","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultations_trainer_status_idx" ON "consultations" USING btree ("trainer_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultations_schedule_idx" ON "consultations" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultations_schedule_slot_uniq" ON "consultations" USING btree ("schedule_id","scheduled_at");--> statement-breakpoint
ALTER TABLE "consultations" DROP COLUMN IF EXISTS "held_on";