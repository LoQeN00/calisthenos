CREATE TYPE "public"."skill_tier" AS ENUM('basic', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tier" "skill_tier" DEFAULT 'basic' NOT NULL;