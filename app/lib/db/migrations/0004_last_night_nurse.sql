CREATE TYPE "public"."body_photo_view" AS ENUM('front', 'side', 'back');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "body_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"view" "body_photo_view" NOT NULL,
	"taken_on" date NOT NULL,
	"note" text,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "body_photos" ADD CONSTRAINT "body_photos_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "body_photos" ADD CONSTRAINT "body_photos_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "body_photos" ADD CONSTRAINT "body_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "body_photos_trainee_date_idx" ON "body_photos" USING btree ("trainee_id","taken_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "body_photos_trainer_idx" ON "body_photos" USING btree ("trainer_id");