CREATE TABLE IF NOT EXISTS "skill_prerequisites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"requires_skill_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_prerequisites_no_self_loop" CHECK ("skill_prerequisites"."skill_id" <> "skill_prerequisites"."requires_skill_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_requires_skill_id_skills_id_fk" FOREIGN KEY ("requires_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_prerequisites_edge_uniq" ON "skill_prerequisites" USING btree ("skill_id","requires_skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_prerequisites_trainer_idx" ON "skill_prerequisites" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_prerequisites_skill_idx" ON "skill_prerequisites" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_prerequisites_requires_idx" ON "skill_prerequisites" USING btree ("requires_skill_id");