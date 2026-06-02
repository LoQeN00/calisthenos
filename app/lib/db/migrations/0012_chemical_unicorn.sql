CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
	"trainer_id" uuid PRIMARY KEY NOT NULL,
	"google_email" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"token_expiry" timestamp with time zone NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"scope" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
