CREATE TYPE "public"."consultation_item_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultation_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"body" text NOT NULL,
	"status" "consultation_item_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"period_from" date,
	"period_to" date,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_period_check" CHECK (("consultations"."period_from" IS NULL AND "consultations"."period_to" IS NULL) OR
          ("consultations"."period_from" IS NOT NULL AND "consultations"."period_to" IS NOT NULL AND "consultations"."period_from" <= "consultations"."period_to"))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultation_action_items" ADD CONSTRAINT "consultation_action_items_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultations" ADD CONSTRAINT "consultations_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultations" ADD CONSTRAINT "consultations_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_action_items_consultation_ordinal_uniq" ON "consultation_action_items" USING btree ("consultation_id","ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultations_trainee_date_idx" ON "consultations" USING btree ("trainee_id","held_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultations_trainer_created_idx" ON "consultations" USING btree ("trainer_id","created_at");