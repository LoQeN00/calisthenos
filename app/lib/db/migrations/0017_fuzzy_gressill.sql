DROP INDEX IF EXISTS "skill_variations_exercise_uniq";--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "origin_id" uuid;--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "origin_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_origin_id_exercises_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_origin_id_skills_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_org_idx" ON "exercises" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_origin_idx" ON "exercises" USING btree ("origin_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_trainer_origin_uniq" ON "exercises" USING btree ("trainer_id","origin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_org_idx" ON "skills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_origin_idx" ON "skills" USING btree ("origin_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_trainer_origin_uniq" ON "skills" USING btree ("trainer_id","origin_id");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_check" CHECK (("exercises"."trainer_id" IS NULL AND "exercises"."organization_id" IS NOT NULL) OR
          ("exercises"."trainer_id" IS NOT NULL AND "exercises"."organization_id" IS NULL));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_origin_check" CHECK ("exercises"."origin_id" IS NULL OR "exercises"."trainer_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_owner_check" CHECK (("skill_prerequisites"."trainer_id" IS NULL AND "skill_prerequisites"."organization_id" IS NOT NULL) OR
          ("skill_prerequisites"."trainer_id" IS NOT NULL AND "skill_prerequisites"."organization_id" IS NULL));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_check" CHECK (("skills"."trainer_id" IS NULL AND "skills"."organization_id" IS NOT NULL) OR
          ("skills"."trainer_id" IS NOT NULL AND "skills"."organization_id" IS NULL));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_origin_check" CHECK ("skills"."origin_id" IS NULL OR "skills"."trainer_id" IS NOT NULL);