CREATE TYPE "public"."subscription_status" AS ENUM('none', 'incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coaching_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"amount_grosze" integer NOT NULL,
	"currency" text DEFAULT 'pln' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_subscriptions_amount_check" CHECK ("coaching_subscriptions"."amount_grosze" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_connections" (
	"trainer_id" uuid PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"country" text,
	"default_currency" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"trainee_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"amount_grosze" integer NOT NULL,
	"currency" text DEFAULT 'pln' NOT NULL,
	"status" text NOT NULL,
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"hosted_invoice_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coaching_subscriptions" ADD CONSTRAINT "coaching_subscriptions_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coaching_subscriptions" ADD CONSTRAINT "coaching_subscriptions_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_trainer_id_users_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coaching_subscriptions_pair_uniq" ON "coaching_subscriptions" USING btree ("trainer_id","trainee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coaching_subscriptions_sub_uniq" ON "coaching_subscriptions" USING btree ("stripe_subscription_id") WHERE "coaching_subscriptions"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coaching_subscriptions_trainer_status_idx" ON "coaching_subscriptions" USING btree ("trainer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_invoice_uniq" ON "subscription_payments" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payments_trainee_created_idx" ON "subscription_payments" USING btree ("trainee_id","created_at");