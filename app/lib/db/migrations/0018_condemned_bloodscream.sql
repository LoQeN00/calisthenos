ALTER TABLE "files" ALTER COLUMN "trainer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "files_org_kind_idx" ON "files" USING btree ("organization_id","kind");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_check" CHECK (("files"."trainer_id" IS NULL AND "files"."organization_id" IS NOT NULL) OR
          ("files"."trainer_id" IS NOT NULL AND "files"."organization_id" IS NULL));