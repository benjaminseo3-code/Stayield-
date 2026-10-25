CREATE SCHEMA IF NOT EXISTS "stayield";
--> statement-breakpoint
CREATE TYPE "stayield"."access_status" AS ENUM('pending', 'info_requested', 'approved', 'declined', 'withdrawn', 'revoked');--> statement-breakpoint
CREATE TYPE "stayield"."investor_experience" AS ENUM('first_time', 'one_to_three', 'four_to_ten', 'ten_plus');--> statement-breakpoint
CREATE TYPE "stayield"."investor_financing" AS ENUM('cash', 'mortgage', 'mixed');--> statement-breakpoint
CREATE TYPE "stayield"."investor_status" AS ENUM('draft', 'submitted', 'verified', 'suspended');--> statement-breakpoint
CREATE TYPE "stayield"."investor_timeline" AS ENUM('now', 'three_months', 'six_to_twelve_months', 'exploring');--> statement-breakpoint
CREATE TYPE "stayield"."investor_type" AS ENUM('individual', 'family_office', 'company', 'fund');--> statement-breakpoint
CREATE TYPE "stayield"."message_author" AS ENUM('investor', 'owner');--> statement-breakpoint
CREATE TYPE "stayield"."message_kind" AS ENUM('request', 'question', 'answer', 'note');--> statement-breakpoint
CREATE TYPE "stayield"."property_status" AS ENUM('draft', 'data_pending', 'review', 'live', 'unpublished');--> statement-breakpoint
CREATE TYPE "stayield"."reservation_status" AS ENUM('confirmed', 'canceled');--> statement-breakpoint
CREATE TYPE "stayield"."submission_source" AS ENUM('signed_email', 'csv_upload', 'api');--> statement-breakpoint
CREATE TYPE "stayield"."submission_status" AS ENUM('received', 'verifying', 'verified', 'flagged', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "stayield"."trust_tier" AS ENUM('signed_email', 'self_reported', 'api_verified');--> statement-breakpoint
CREATE TYPE "stayield"."user_role" AS ENUM('seller', 'buyer', 'admin');--> statement-breakpoint
CREATE TABLE "stayield"."access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"investor_id" text NOT NULL,
	"status" "stayield"."access_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"seller_unseen" boolean DEFAULT true NOT NULL,
	"investor_unseen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"text_version" text NOT NULL,
	"accepted" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."data_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"source" "stayield"."submission_source" NOT NULL,
	"trust_tier" "stayield"."trust_tier" NOT NULL,
	"raw_file_key" text,
	"raw_sha256" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_result" jsonb,
	"status" "stayield"."submission_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."inbound_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_addresses_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stayield"."investor_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "stayield"."investor_status" DEFAULT 'draft' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"investor_type" "stayield"."investor_type",
	"entity_name" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"budget_min" bigint,
	"budget_max" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"target_countries" text DEFAULT '' NOT NULL,
	"experience" "stayield"."investor_experience",
	"financing" "stayield"."investor_financing",
	"timeline" "stayield"."investor_timeline",
	"about" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."monthly_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"month" date NOT NULL,
	"gross_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	"booked_nights" integer NOT NULL,
	"days_in_month" integer NOT NULL,
	"reservations_count" integer NOT NULL,
	"currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"status" "stayield"."property_status" DEFAULT 'draft' NOT NULL,
	"public_slug" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"neighborhood" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"asking_price_minor" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sqm" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"description" text DEFAULT '' NOT NULL,
	"original_listing_url" text,
	"trust_tier" "stayield"."trust_tier",
	"active_submission_id" uuid,
	"income_band_low_minor" bigint,
	"income_band_high_minor" bigint,
	"coverage_start" date,
	"coverage_end" date,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"wizard_step" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "stayield"."property_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"author_role" "stayield"."message_author" NOT NULL,
	"kind" "stayield"."message_kind" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"confirmation_hash" text NOT NULL,
	"checkin" date NOT NULL,
	"checkout" date NOT NULL,
	"nights" integer NOT NULL,
	"gross_minor" bigint NOT NULL,
	"host_fee_minor" bigint NOT NULL,
	"net_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "stayield"."reservation_status" DEFAULT 'confirmed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."saved_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stayield"."storage_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "stayield"."user_role" DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "stayield"."verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stayield"."verified_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verify_token_hash" text,
	"verify_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stayield"."access_requests" ADD CONSTRAINT "access_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."access_requests" ADD CONSTRAINT "access_requests_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."consents" ADD CONSTRAINT "consents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."data_submissions" ADD CONSTRAINT "data_submissions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."inbound_addresses" ADD CONSTRAINT "inbound_addresses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."investor_profiles" ADD CONSTRAINT "investor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."monthly_aggregates" ADD CONSTRAINT "monthly_aggregates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."monthly_aggregates" ADD CONSTRAINT "monthly_aggregates_submission_id_data_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "stayield"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."properties" ADD CONSTRAINT "properties_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."property_photos" ADD CONSTRAINT "property_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."request_messages" ADD CONSTRAINT "request_messages_request_id_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "stayield"."access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."request_messages" ADD CONSTRAINT "request_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."reservations" ADD CONSTRAINT "reservations_submission_id_data_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "stayield"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."saved_properties" ADD CONSTRAINT "saved_properties_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."saved_properties" ADD CONSTRAINT "saved_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "stayield"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stayield"."verified_emails" ADD CONSTRAINT "verified_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "stayield"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_property_idx" ON "stayield"."access_requests" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "access_requests_investor_idx" ON "stayield"."access_requests" USING btree ("investor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_active_uidx" ON "stayield"."access_requests" USING btree ("property_id","investor_id") WHERE "stayield"."access_requests"."status" in ('pending', 'info_requested', 'approved');--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "stayield"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "stayield"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "submissions_property_idx" ON "stayield"."data_submissions" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_sha_uidx" ON "stayield"."data_submissions" USING btree ("raw_sha256") WHERE "stayield"."data_submissions"."raw_sha256" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "aggregates_property_month_uidx" ON "stayield"."monthly_aggregates" USING btree ("property_id","month");--> statement-breakpoint
CREATE INDEX "properties_owner_idx" ON "stayield"."properties" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "stayield"."properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "photos_property_idx" ON "stayield"."property_photos" USING btree ("property_id","position");--> statement-breakpoint
CREATE INDEX "request_messages_request_idx" ON "stayield"."request_messages" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "reservations_property_idx" ON "stayield"."reservations" USING btree ("property_id","checkin");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_conf_uidx" ON "stayield"."reservations" USING btree ("submission_id","confirmation_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_buyer_property_uidx" ON "stayield"."saved_properties" USING btree ("buyer_id","property_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "stayield"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verified_emails_user_email_uidx" ON "stayield"."verified_emails" USING btree ("user_id","email");