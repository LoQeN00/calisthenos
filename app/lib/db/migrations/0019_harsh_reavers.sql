CREATE TYPE "public"."invite_target_role" AS ENUM('trainee', 'trainer');--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "target_role" "invite_target_role" DEFAULT 'trainee' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "region_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "invited_by_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_target_check" CHECK (("invites"."target_role" = 'trainee' AND "invites"."trainer_id" IS NOT NULL) OR
          ("invites"."target_role" = 'trainer' AND "invites"."invited_by_user_id" IS NOT NULL
             AND "invites"."organization_id" IS NOT NULL AND "invites"."trainer_id" IS NULL
             AND "invites"."replaces_user_id" IS NULL AND "invites"."monthly_amount_grosze" IS NULL));