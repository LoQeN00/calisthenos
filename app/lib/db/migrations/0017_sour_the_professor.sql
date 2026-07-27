CREATE TYPE "public"."feature_request_kind" AS ENUM('idea', 'bug', 'other');--> statement-breakpoint
CREATE TYPE "public"."feature_request_status" AS ENUM('new', 'considering', 'planned', 'done', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"kind" "feature_request_kind" DEFAULT 'idea' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "feature_request_status" DEFAULT 'new' NOT NULL,
	"trainer_response" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_trainee_created_idx" ON "feature_requests" USING btree ("trainee_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_trainer_status_idx" ON "feature_requests" USING btree ("trainer_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_trainer_created_idx" ON "feature_requests" USING btree ("trainer_id","created_at");