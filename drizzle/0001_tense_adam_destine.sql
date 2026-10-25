ALTER TABLE "verified_emails" ADD COLUMN "verify_token_hash" text;--> statement-breakpoint
ALTER TABLE "verified_emails" ADD COLUMN "verify_expires_at" timestamp with time zone;