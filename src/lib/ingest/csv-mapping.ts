/**
 * Column mapping for income reports.
 *
 * TODO(real-sample): the real Airbnb export's column names and formats are UNKNOWN. The profile
 * below ("synthetic-v1") is invented for development and tests; do not treat it as Airbnb's format.
 * When a real file arrives, add a new profile here (and a fixture in tests/fixtures) instead of
 * changing the parser.
 *
 * Only columns listed here are ever read (an allow-list). Every other column, including anything
 * that looks like guest data, is ignored and never leaves the parser.
 */
export type ColumnMapping = {
  profile: string;
  /** Candidate header names per field, compared case-insensitively after trimming. */
  columns: {
    confirmationCode: string[];
    checkin: string[];
    checkout: string[];
    nights?: string[];
    gross: string[];
    hostFee?: string[];
    net?: string[];
    currency?: string[];
    status?: string[];
    /** Optional row-type column; only rows whose value is in `includeTypes` are used. */
    rowType?: string[];
  };
  includeTypes?: string[];
  statusValues: { confirmed: string[]; canceled: string[] };
  /** "auto" picks DMY/MDY from the data and reports ambiguity instead of guessing. */
  dateOrder: "auto" | "ymd" | "dmy" | "mdy";
  decimal: "auto" | "dot" | "comma";
  /** Used when the file has no currency column. */
  defaultCurrency?: string;
};

/** Headers matching this are never mapped, as a second line of defence against guest data. */
export const GUEST_HEADER_PATTERN =
  /guest|traveler|traveller|renter|customer|\bname\b|e-?mail|phone|mobile|contact|address|passport|\bid\b/i;

export const SYNTHETIC_V1: ColumnMapping = {
  profile: "synthetic-v1",
  columns: {
    confirmationCode: ["confirmation code", "confirmation", "reservation code", "booking code"],
    checkin: ["start date", "check-in", "checkin", "arrival"],
    checkout: ["end date", "check-out", "checkout", "departure"],
    nights: ["nights", "number of nights"],
    gross: ["gross earnings", "gross", "gross amount", "amount"],
    hostFee: ["host fee", "service fee", "host service fee"],
    net: ["net earnings", "net", "net amount", "payout"],
    currency: ["currency"],
    status: ["status"],
    rowType: ["type", "row type"],
  },
  includeTypes: ["reservation", "booking"],
  statusValues: {
    confirmed: ["confirmed", "completed", "paid", "booked", "reservation"],
    canceled: ["canceled", "cancelled", "cancellation"],
  },
  dateOrder: "auto",
  decimal: "auto",
};

export const PROFILES: Record<string, ColumnMapping> = { [SYNTHETIC_V1.profile]: SYNTHETIC_V1 };
export const DEFAULT_PROFILE = SYNTHETIC_V1;
