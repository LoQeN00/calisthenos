ALTER TABLE "workout_set_logs" DROP CONSTRAINT "workout_set_logs_difficulty_check";--> statement-breakpoint
ALTER TABLE "workout_set_logs" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "tracks_rpe" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_difficulty_check" CHECK ("workout_set_logs"."difficulty" IS NULL OR "workout_set_logs"."difficulty" BETWEEN 1 AND 10);