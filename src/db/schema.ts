import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = pgEnum("user_role", ["seller", "buyer", "admin"]);
export const propertyStatus = pgEnum("property_status", [
  "draft",
  "data_pending",
  "review",
  "live",
  "unpublished",
]);
/** Trust tiers are always visible to buyers. `api_verified` is reserved (Hospitable Connect, later). */
export const trustTier = pgEnum("trust_tier", ["signed_email", "self_reported", "api_verified"]);
export const submissionSource = pgEnum("submission_source", ["signed_email", "csv_upload", "api"]);
export const submissionStatus = pgEnum("submission_status", [
  "received",
  "verifying",
  "verified",
  "flagged",
  "failed",
  "rejected",
]);
export const reservationStatus = pgEnum("reservation_status", ["confirmed", "canceled"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Money is always integer minor units (cents) + an ISO-4217 currency code. */
const money = (name: string) => bigint(name, { mode: "number" });

// ---------------------------------------------------------------------------
// Auth tables (shape required by Better Auth's Drizzle adapter)
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("buyer"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------
export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: propertyStatus("status").notNull().default("draft"),
    publicSlug: text("public_slug").notNull().unique(),

    // Basics
    city: text("city").notNull().default(""),
    neighborhood: text("neighborhood").notNull().default(""),
    country: text("country").notNull().default(""),
    askingPriceMinor: money("asking_price_minor"),
    currency: text("currency").notNull().default("USD"),
    sqm: integer("sqm"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    description: text("description").notNull().default(""),
    originalListingUrl: text("original_listing_url"),

    // Public teaser fields, computed when a submission is accepted.
    trustTier: trustTier("trust_tier"),
    activeSubmissionId: uuid("active_submission_id"),
    incomeBandLowMinor: money("income_band_low_minor"),
    incomeBandHighMinor: money("income_band_high_minor"),
    coverageStart: date("coverage_start", { mode: "string" }),
    coverageEnd: date("coverage_end", { mode: "string" }),
    /** Plain-language reasons shown to the seller (and admin) when status = review. */
    reviewReasons: jsonb("review_reasons").$type<ReviewReason[]>().notNull().default([]),

    isDemo: boolean("is_demo").notNull().default(false),
    viewsCount: integer("views_count").notNull().default(0),
    wizardStep: integer("wizard_step").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("properties_owner_idx").on(t.ownerId),
    index("properties_status_idx").on(t.status),
  ],
);

export type ReviewReason = {
  code: string;
  level: "warn" | "fail";
  /** Message keys are resolved through the i18n dictionaries; params fill placeholders. */
  params?: Record<string, string | number>;
};

export const propertyPhotos = pgTable(
  "property_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    /** Base key; variants live at `${storageKey}/full.webp|full.jpg|thumb.webp`. */
    storageKey: text("storage_key").notNull(),
    position: integer("position").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    alt: text("alt").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("photos_property_idx").on(t.propertyId, t.position)],
);

export const dataSubmissions = pgTable(
  "data_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    source: submissionSource("source").notNull(),
    trustTier: trustTier("trust_tier").notNull(),
    /** Private storage key of the raw .eml / uploaded file (null for demo data). */
    rawFileKey: text("raw_file_key"),
    rawSha256: text("raw_sha256"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    verificationResult: jsonb("verification_result").$type<VerificationResult>(),
    status: submissionStatus("status").notNull().default("received"),
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_property_idx").on(t.propertyId),
    // A given raw message may only ever be ingested once.
    uniqueIndex("submissions_sha_uidx").on(t.rawSha256).where(sql`${t.rawSha256} is not null`),
  ],
);

export type CheckLevel = "pass" | "warn" | "fail";
export type VerificationCheck = {
  code: string;
  level: CheckLevel;
  params?: Record<string, string | number>;
};
export type VerificationResult = {
  checks: VerificationCheck[];
  /** Human-readable summary lines for the seller, keyed for i18n. */
  outcome: "live" | "review" | "failed";
  verifiedAt: string;
  /** Email path only: what the DKIM verification found. */
  dkim?: { domain: string; selector: string; result: string };
};

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => dataSubmissions.id, { onDelete: "cascade" }),
    /** One-way hash of the confirmation code. The code itself is never stored. */
    confirmationHash: text("confirmation_hash").notNull(),
    checkin: date("checkin", { mode: "string" }).notNull(),
    checkout: date("checkout", { mode: "string" }).notNull(),
    nights: integer("nights").notNull(),
    grossMinor: money("gross_minor").notNull(),
    hostFeeMinor: money("host_fee_minor").notNull(),
    netMinor: money("net_minor").notNull(),
    currency: text("currency").notNull(),
    status: reservationStatus("status").notNull().default("confirmed"),
    // Deliberately NO guest fields.
  },
  (t) => [
    index("reservations_property_idx").on(t.propertyId, t.checkin),
    uniqueIndex("reservations_conf_uidx").on(t.submissionId, t.confirmationHash),
  ],
);

export const monthlyAggregates = pgTable(
  "monthly_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => dataSubmissions.id, { onDelete: "cascade" }),
    /** First day of the month. */
    month: date("month", { mode: "string" }).notNull(),
    grossMinor: money("gross_minor").notNull(),
    netMinor: money("net_minor").notNull(),
    bookedNights: integer("booked_nights").notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    reservationsCount: integer("reservations_count").notNull(),
    currency: text("currency").notNull(),
  },
  (t) => [uniqueIndex("aggregates_property_month_uidx").on(t.propertyId, t.month)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("payments_buyer_idx").on(t.buyerId)],
);

export const unlocks = pgTable(
  "unlocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("unlocks_buyer_property_uidx").on(t.buyerId, t.propertyId)],
);

export const savedProperties = pgTable(
  "saved_properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_buyer_property_uidx").on(t.buyerId, t.propertyId)],
);

export const introRequests = pgTable("intro_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerId: text("buyer_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  message: text("message").notNull().default(""),
  createdAt: createdAt(),
});

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  textVersion: text("text_version").notNull(),
  /** Which statements were accepted, e.g. ["owns", "shares_aggregates", "complete_data"]. */
  accepted: jsonb("accepted").$type<string[]>().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inboundAddresses = pgTable("inbound_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const verifiedEmails = pgTable(
  "verified_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("verified_emails_user_email_uidx").on(t.userId, t.email)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type PropertyPhoto = typeof propertyPhotos.$inferSelect;
export type DataSubmission = typeof dataSubmissions.$inferSelect;
export type MonthlyAggregate = typeof monthlyAggregates.$inferSelect;
