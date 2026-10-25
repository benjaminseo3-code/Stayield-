/** Types shared by the ingestion pipeline. This file must stay free of Node-only imports (it runs in the browser too). */

export type CheckLevel = "pass" | "warn" | "fail";

export type Check = {
  /** Stable code; the UI maps `check.<code>.<level>` dictionary keys to human text. */
  code: string;
  level: CheckLevel;
  params?: Record<string, string | number>;
};

/**
 * One reservation, with money in integer minor units. There are deliberately no guest fields: the
 * parser never reads them. `confirmationCode` only exists in memory; it is hashed before storage.
 */
export type NormalizedReservation = {
  confirmationCode: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD (exclusive: the night of `checkout` is not stayed)
  nights: number;
  grossMinor: number;
  hostFeeMinor: number;
  netMinor: number;
  currency: string;
  status: "confirmed" | "canceled";
};

export type ParseIssue = { line: number; code: string; params?: Record<string, string | number> };

export type ParseResult =
  | {
      ok: true;
      rows: NormalizedReservation[];
      /** Rows that could not be used (bad date, bad amount...). Never contains row content. */
      skipped: ParseIssue[];
      /** Header names that were ignored, so the UI can show "we ignored these columns". */
      ignoredColumns: string[];
      profile: string;
    }
  | { ok: false; error: { code: string; params?: Record<string, string | number> } };

export type MonthAggregate = {
  month: string; // first day of month, YYYY-MM-01
  grossMinor: number;
  netMinor: number;
  bookedNights: number;
  daysInMonth: number;
  reservationsCount: number;
  currency: string;
};
