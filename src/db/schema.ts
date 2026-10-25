import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Everything lives in its own Postgres schema so Stayield can share a database (e.g. a Supabase
 * project) with other apps without touching their `public` tables. The schema is not exposed by
 * Supabase's Data API.
 */
export const app = pgSchema("stayield");


// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = app.enum("user_role", ["seller", "buyer", "admin"]);
export const propertyStatus = app.enum("property_status", [
  "draft",
  "data_pending",
  "review",
  "live",
  "unpublished",
]);
/** Trust tiers are always visible to buyers. `api_verified` is reserved (Hospitable Connect, later). */
export const trustTier = app.enum("trust_tier", ["signed_email", "self_reported", "api_verified"]);
export const submissionSource = app.enum("submission_source", ["signed_email", "csv_upload", "api"]);
export const submissionStatus = app.enum("submission_status", [
  "received",
  "verifying",
  "verified",
  "flagged",
  "failed",
  "rejected",
]);
export const reservationStatus = app.enum("reservation_status", ["confirmed", "canceled"]);
export const investorStatus = app.enum("investor_status", ["draft", "submitted", "verified", "suspended"]);
export const investorType = app.enum("investor_type", ["individual", "family_office", "company", "fund"]);
export const investorExperience = app.enum("investor_experience", ["first_time", "one_to_three", "four_to_ten", "ten_plus"]);
export const investorFinancing = app.enum("investor_financing", ["cash", "mortgage", "mixed"]);
export const investorTimeline = app.enum("investor_timeline", ["now", "three_months", "six_to_twelve_months", "exploring"]);
export const accessStatus = app.enum("access_status", ["pending", "info_requested", "approved", "declined", "withdrawn", "revoked"]);
export const messageAuthor = app.enum("message_author", ["investor", "owner"]);
export const messageKind = app.enum("message_kind", ["request", "question", "answer", "note"]);

/** Postgres bytea as a Node Buffer (node-postgres returns Buffer, PGlite a Uint8Array). */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (v) => v,
  fromDriver: (v) => Buffer.from(v),
});

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
export const users = app.table("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("buyer"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = app.table(
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

export const accounts = app.table(
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

export const verifications = app.table("verifications", {
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
export const properties = app.table(
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

export const propertyPhotos = app.table(
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

export const dataSubmissions = app.table(
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

export const reservations = app.table(
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

export const monthlyAggregates = app.table(
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

export const savedProperties = app.table(
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

/**
 * Investor profile ("advanced verification"). Owners of a property an investor asked about see it
 * (contact details only after approval). `status` gates sending access requests.
 */
export const investorProfiles = app.table("investor_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: investorStatus("status").notNull().default("draft"),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  investorType: investorType("investor_type"),
  entityName: text("entity_name").notNull().default(""),
  country: text("country").notNull().default(""),
  /** Whole units of `currency`, not minor units: this is a self-declared range, not money we move. */
  budgetMin: bigint("budget_min", { mode: "number" }),
  budgetMax: bigint("budget_max", { mode: "number" }),
  currency: text("currency").notNull().default("USD"),
  targetCountries: text("target_countries").notNull().default(""),
  experience: investorExperience("experience"),
  financing: investorFinancing("financing"),
  timeline: investorTimeline("timeline"),
  about: text("about").notNull().default(""),
  website: text("website").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * An investor asking to see one listing in full. At most one ACTIVE request (pending, info_requested
 * or approved) per investor and listing; declined/withdrawn/revoked ones stay as history.
 */
export const accessRequests = app.table(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    investorId: text("investor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: accessStatus("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** New activity the owner / the investor has not looked at yet (drives the nav badges). */
    sellerUnseen: boolean("seller_unseen").notNull().default(true),
    investorUnseen: boolean("investor_unseen").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("access_requests_property_idx").on(t.propertyId, t.status),
    index("access_requests_investor_idx").on(t.investorId, t.status),
    uniqueIndex("access_requests_active_uidx")
      .on(t.propertyId, t.investorId)
      .where(sql`${t.status} in ('pending', 'info_requested', 'approved')`),
  ],
);

export const requestMessages = app.table(
  "request_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => accessRequests.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Who wrote it, from the request's point of view. */
    authorRole: messageAuthor("author_role").notNull(),
    kind: messageKind("kind").notNull(),
    body: text("body").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("request_messages_request_idx").on(t.requestId, t.createdAt)],
);

/** Database-backed file storage (photos, evidence) for deployments without a writable disk. */
export const storageObjects = app.table("storage_objects", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const consents = app.table("consents", {
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

export const inboundAddresses = app.table("inbound_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const verifiedEmails = app.table(
  "verified_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** SHA-256 of the emailed verification token (the token itself is never stored). */
    verifyTokenHash: text("verify_token_hash"),
    verifyExpiresAt: timestamp("verify_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("verified_emails_user_email_uidx").on(t.userId, t.email)],
);

export const auditLog = app.table(
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

export type InvestorProfile = typeof investorProfiles.$inferSelect;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type RequestMessage = typeof requestMessages.$inferSelect;
export type AccessStatus = (typeof accessStatus.enumValues)[number];
