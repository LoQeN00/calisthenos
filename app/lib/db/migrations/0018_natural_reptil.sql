CREATE TABLE IF NOT EXISTS "onboarding_form_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"unit" "exercise_unit" NOT NULL,
	"value" integer,
	"comment" text,
	CONSTRAINT "onboarding_form_items_value_check" CHECK ("onboarding_form_items"."value" IS NULL OR ("onboarding_form_items"."value" >= 0 AND "onboarding_form_items"."value" <= 10000))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"invite_id" uuid NOT NULL,
	"trainee_id" uuid,
	"trainer_note" text,
	"trainee_note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_form_items" ADD CONSTRAINT "onboarding_form_items_form_id_onboarding_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."onboarding_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_form_items" ADD CONSTRAINT "onboarding_form_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_forms" ADD CONSTRAINT "onboarding_forms_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_forms" ADD CONSTRAINT "onboarding_forms_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_forms" ADD CONSTRAINT "onboarding_forms_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_form_items_form_ordinal_uniq" ON "onboarding_form_items" USING btree ("form_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_form_items_form_exercise_uniq" ON "onboarding_form_items" USING btree ("form_id","exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_forms_invite_uniq" ON "onboarding_forms" USING btree ("invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_forms_trainee_pending_uniq" ON "onboarding_forms" USING btree ("trainee_id") WHERE "onboarding_forms"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_forms_trainer_idx" ON "onboarding_forms" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_forms_trainee_idx" ON "onboarding_forms" USING btree ("trainee_id");