import { daysBetween } from "./parse-report";
import type { Check, NormalizedReservation, ParseIssue } from "./types";

const confirmed = (rows: NormalizedReservation[]) => rows.filter((r) => r.status === "confirmed");

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Reliability checks over parsed reservations. Each check always reports (pass included) so the
 * seller, admin and buyer can see exactly what was verified.
 *   fail -> listing goes to admin review; warn -> listing can go live with a visible note.
 */
export function runReliabilityChecks(
  rows: NormalizedReservation[],
  skipped: ParseIssue[],
  now: Date,
): Check[] {
  const checks: Check[] = [];
  const conf = confirmed(rows);

  if (conf.length === 0) {
    return [{ code: "rows_found", level: "fail" }];
  }
  checks.push({ code: "rows_found", level: "pass", params: { count: conf.length } });

  // Rows the parser could not read.
  const total = rows.length + skipped.length;
  const skipRatio = total ? skipped.length / total : 0;
  checks.push(
    skipped.length === 0
      ? { code: "unparseable_rows", level: "pass" }
      : { code: "unparseable_rows", level: skipRatio > 0.05 ? "fail" : "warn", params: { count: skipped.length } },
  );

  // Duplicate confirmation codes.
  const seen = new Map<string, number>();
  for (const r of conf) seen.set(r.confirmationCode, (seen.get(r.confirmationCode) ?? 0) + 1);
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  checks.push(dupes ? { code: "duplicate_confirmations", level: "fail", params: { count: dupes } } : { code: "duplicate_confirmations", level: "pass" });

  // Overlapping stays (back-to-back is fine: checkout day == next checkin day).
  const byStart = [...conf].sort((a, b) => a.checkin.localeCompare(b.checkin) || a.checkout.localeCompare(b.checkout));
  let overlaps = 0;
  let maxOut = "";
  for (const r of byStart) {
    if (maxOut && r.checkin < maxOut) overlaps++;
    if (r.checkout > maxOut) maxOut = r.checkout;
  }
  checks.push(overlaps ? { code: "overlapping_reservations", level: "fail", params: { count: overlaps } } : { code: "overlapping_reservations", level: "pass" });

  // Nights column vs date range.
  const mismatches = conf.filter((r) => r.nights !== daysBetween(r.checkin, r.checkout)).length;
  checks.push(mismatches ? { code: "nights_mismatch", level: "fail", params: { count: mismatches } } : { code: "nights_mismatch", level: "pass" });

  // Impossible or suspicious values.
  const impossible = conf.filter(
    (r) => daysBetween(r.checkin, r.checkout) <= 0 || r.grossMinor < 0 || r.netMinor < 0 || r.hostFeeMinor < 0 || r.netMinor > r.grossMinor,
  ).length;
  const zero = conf.filter((r) => r.grossMinor === 0).length;
  checks.push(
    impossible
      ? { code: "value_anomalies", level: "fail", params: { count: impossible } }
      : zero
        ? { code: "value_anomalies", level: "warn", params: { count: zero } }
        : { code: "value_anomalies", level: "pass" },
  );

  // One currency only.
  const currencies = [...new Set(conf.map((r) => r.currency))];
  checks.push(
    currencies.length > 1
      ? { code: "mixed_currencies", level: "fail", params: { currencies: currencies.join(", ") } }
      : { code: "mixed_currencies", level: "pass", params: { currency: currencies[0] } },
  );

  // Gaps inside the covered period.
  let maxGap = 0;
  let out = byStart[0].checkout;
  for (const r of byStart.slice(1)) {
    if (r.checkin > out) maxGap = Math.max(maxGap, daysBetween(out, r.checkin));
    if (r.checkout > out) out = r.checkout;
  }
  checks.push(
    maxGap >= 120
      ? { code: "coverage_gaps", level: "fail", params: { days: maxGap } }
      : maxGap >= 45
        ? { code: "coverage_gaps", level: "warn", params: { days: maxGap } }
        : { code: "coverage_gaps", level: "pass" },
  );

  // Coverage length.
  const first = byStart[0].checkin;
  const months = Math.round(daysBetween(first, out) / 30.4);
  checks.push(months < 12 ? { code: "coverage_length", level: "warn", params: { months } } : { code: "coverage_length", level: "pass", params: { months } });

  // Recency.
  const sinceLast = Math.round((now.getTime() - Date.parse(`${out}T00:00:00Z`)) / 86_400_000);
  checks.push(sinceLast > 120 ? { code: "data_recency", level: "warn", params: { days: sinceLast } } : { code: "data_recency", level: "pass" });

  // Nightly-rate outliers.
  const rates = conf.filter((r) => r.nights > 0 && r.grossMinor > 0).map((r) => r.grossMinor / r.nights);
  if (rates.length >= 5) {
    const med = median(rates);
    const outliers = rates.filter((x) => x > med * 4 || x < med * 0.25).length;
    checks.push(outliers ? { code: "rate_outliers", level: "warn", params: { count: outliers } } : { code: "rate_outliers", level: "pass" });
  } else {
    checks.push({ code: "rate_outliers", level: "pass" });
  }

  return checks;
}

export function outcomeOf(checks: Check[]): "live" | "review" {
  return checks.some((c) => c.level === "fail") ? "review" : "live";
}
