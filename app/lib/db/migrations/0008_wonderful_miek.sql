CREATE TABLE IF NOT EXISTS "skill_advancements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"from_variation_id" uuid,
	"to_variation_id" uuid NOT NULL,
	"advanced_on" date NOT NULL,
	"advanced_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_variations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_from_variation_id_skill_variations_id_fk" FOREIGN KEY ("from_variation_id") REFERENCES "public"."skill_variations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_to_variation_id_skill_variations_id_fk" FOREIGN KEY ("to_variation_id") REFERENCES "public"."skill_variations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_advancements" ADD CONSTRAINT "skill_advancements_advanced_by_users_id_fk" FOREIGN KEY ("advanced_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_variations" ADD CONSTRAINT "skill_variations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_variations" ADD CONSTRAINT "skill_variations_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_advancements_trainee_skill_idx" ON "skill_advancements" USING btree ("trainee_id","skill_id","advanced_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_advancements_trainer_idx" ON "skill_advancements" USING btree ("trainer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_variations_skill_ordinal_uniq" ON "skill_variations" USING btree ("skill_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_variations_skill_exercise_uniq" ON "skill_variations" USING btree ("skill_id","exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_variations_exercise_uniq" ON "skill_variations" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_trainer_name_uniq" ON "skills" USING btree ("trainer_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_trainer_idx" ON "skills" USING btree ("trainer_id");