CREATE TABLE IF NOT EXISTS "exercise_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_categories" ADD CONSTRAINT "exercise_categories_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_categories_trainer_name_uniq" ON "exercise_categories" USING btree ("trainer_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_categories_trainer_idx" ON "exercise_categories" USING btree ("trainer_id");
