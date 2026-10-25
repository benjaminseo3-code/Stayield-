import { parseCsv } from "./csv";
import { DEFAULT_PROFILE, GUEST_HEADER_PATTERN, type ColumnMapping } from "./csv-mapping";
import type { NormalizedReservation, ParseIssue, ParseResult } from "./types";

const DAY_MS = 86_400_000;

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parses a date. `order` applies to numeric a/b/c dates; ISO `YYYY-MM-DD` always works. */
export function parseDate(raw: string, order: "ymd" | "dmy" | "mdy"): string | null {
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return order === "dmy" ? validDate(y, b, a) : order === "mdy" ? validDate(y, a, b) : null;
  }
  return null;
}

/** Looks at all numeric a/b/yyyy dates to decide DMY vs MDY. Returns null when it cannot tell. */
export function detectDateOrder(values: string[]): "dmy" | "mdy" | "ymd" | null {
  let dmy = false;
  let mdy = false;
  let numeric = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v.trim());
    if (!m) continue;
    numeric++;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  if (numeric === 0) return "ymd";
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return null;
}

/**
 * Parses an amount into integer minor units (2 decimals). Handles "$1,234.56", "1.234,56 €",
 * "(12.00)" and "12.00-". Returns null if it is not a number.
 */
export function parseAmount(raw: string, decimal: "auto" | "dot" | "comma" = "auto"): number | null {
  let s = raw.replace(/[\s ]/g, "");
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decSep: "." | "," | null = null;
  if (decimal === "dot") decSep = ".";
  else if (decimal === "comma") decSep = ",";
  else if (lastDot >= 0 && lastComma >= 0) decSep = lastDot > lastComma ? "." : ",";
  else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const count = s.split(sep).length - 1;
    const afterLen = s.length - s.lastIndexOf(sep) - 1;
    // "1,234" (one separator + exactly 3 digits) is a thousands separator; "12.5" / "12,50" are decimals.
    decSep = count === 1 && afterLen !== 3 ? (sep as "." | ",") : null;
  }

  let intPart = s;
  let frac = "";
  if (decSep) {
    const i = s.lastIndexOf(decSep);
    intPart = s.slice(0, i);
    frac = s.slice(i + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (frac.replace(/\D/g, "").length !== frac.length) return null;
  const cents = Number((frac + "00").slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  const total = Number(intPart || "0") * 100 + cents + roundUp;
  if (!Number.isFinite(total)) return null;
  return negative ? -total : total;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type Resolved = Record<string, number | undefined>;

function resolveColumns(headers: string[], mapping: ColumnMapping): { cols: Resolved; used: Set<number> } {
  const normalized = headers.map(norm);
  const cols: Resolved = {};
  const used = new Set<number>();
  for (const [field, candidates] of Object.entries(mapping.columns)) {
    for (const cand of candidates ?? []) {
      const idx = normalized.indexOf(norm(cand));
      // Never map a header that looks like guest data, even if someone listed it as a candidate.
      if (idx >= 0 && !GUEST_HEADER_PATTERN.test(headers[idx])) {
        cols[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return { cols, used };
}

export function parseReportCsv(
  text: string,
  opts: { mapping?: ColumnMapping; dateOrder?: "dmy" | "mdy" | "ymd"; currency?: string } = {},
): ParseResult {
  const mapping = opts.mapping ?? DEFAULT_PROFILE;
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: { code: "empty_file" } };

  const headers = table[0];
  const { cols, used } = resolveColumns(headers, mapping);
  const missing = (["confirmationCode", "checkin", "checkout", "gross"] as const).filter((f) => cols[f] === undefined);
  if (missing.length) return { ok: false, error: { code: "missing_columns", params: { columns: missing.join(", ") } } };

  const ignoredColumns = headers.filter((_, i) => !used.has(i)).map((h) => h.trim()).filter(Boolean);
  const body = table.slice(1);
  const cell = (row: string[], f: string) => (cols[f] === undefined ? "" : (row[cols[f]!] ?? "").trim());

  // Decide how to read ambiguous numeric dates.
  let order: "ymd" | "dmy" | "mdy";
  if (opts.dateOrder) order = opts.dateOrder;
  else if (mapping.dateOrder !== "auto") order = mapping.dateOrder;
  else {
    const detected = detectDateOrder(body.flatMap((r) => [cell(r, "checkin"), cell(r, "checkout")]));
    if (!detected) return { ok: false, error: { code: "ambiguous_dates" } };
    order = detected;
  }

  const rows: NormalizedReservation[] = [];
  const skipped: ParseIssue[] = [];

  body.forEach((r, i) => {
    const line = i + 2; // 1-based, header is line 1
    const type = cell(r, "rowType");
    if (cols.rowType !== undefined && mapping.includeTypes && !mapping.includeTypes.includes(norm(type))) return;

    const checkin = parseDate(cell(r, "checkin"), order);
    const checkout = parseDate(cell(r, "checkout"), order);
    if (!checkin || !checkout) return void skipped.push({ line, code: "bad_date" });

    const gross = parseAmount(cell(r, "gross"), mapping.decimal);
    if (gross === null) return void skipped.push({ line, code: "bad_amount" });
    const feeRaw = cell(r, "hostFee");
    const fee = feeRaw === "" ? 0 : parseAmount(feeRaw, mapping.decimal);
    if (fee === null) return void skipped.push({ line, code: "bad_amount" });
    const netRaw = cell(r, "net");
    const net = netRaw === "" ? gross - Math.abs(fee) : parseAmount(netRaw, mapping.decimal);
    if (net === null) return void skipped.push({ line, code: "bad_amount" });

    const currencyRaw = cell(r, "currency").toUpperCase();
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : (opts.currency ?? mapping.defaultCurrency ?? "");
    if (!currency) return void skipped.push({ line, code: "missing_currency" });

    const statusRaw = norm(cell(r, "status"));
    let status: "confirmed" | "canceled" = "confirmed";
    if (statusRaw) {
      if (mapping.statusValues.canceled.includes(statusRaw)) status = "canceled";
      else if (!mapping.statusValues.confirmed.includes(statusRaw)) return void skipped.push({ line, code: "unknown_status" });
    }

    const code = cell(r, "confirmationCode");
    if (!code) return void skipped.push({ line, code: "missing_confirmation" });

    const nightsRaw = cell(r, "nights");
    const nights = nightsRaw === "" ? daysBetween(checkin, checkout) : Number.parseInt(nightsRaw, 10);
    if (!Number.isFinite(nights)) return void skipped.push({ line, code: "bad_nights" });

    rows.push({
      confirmationCode: code,
      checkin,
      checkout,
      nights,
      grossMinor: gross,
      hostFeeMinor: Math.abs(fee),
      netMinor: net,
      currency,
      status,
    });
  });

  return { ok: true, rows, skipped, ignoredColumns, profile: mapping.profile };
}
