-- Defence in depth: row level security on every table. The app connects as the table owner, which
-- bypasses RLS; any other role (for example via a Data API) gets no rows because no policies exist.
ALTER TABLE "stayield"."access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."data_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."inbound_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."investor_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."monthly_aggregates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."property_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."request_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."saved_properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."storage_objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stayield"."verified_emails" ENABLE ROW LEVEL SECURITY;
