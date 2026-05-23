CREATE TYPE "public"."exercise_unit" AS ENUM('REPS', 'SEC');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('exercise_demo', 'set_video', 'body_photo');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" "exercise_unit" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"demo_file_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_demo_file_id_files_id_fk" FOREIGN KEY ("demo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_trainer_idx" ON "exercises" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_tags_gin" ON "exercises" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "files_storage_path_uniq" ON "files" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_trainer_kind_idx" ON "files" USING btree ("trainer_id","kind");