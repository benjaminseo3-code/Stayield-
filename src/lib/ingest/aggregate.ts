import { daysBetween } from "./parse-report";
import type { MonthAggregate, NormalizedReservation } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (iso: string) => `${iso.slice(0, 7)}-01`;
const daysInMonth = (monthIso: string) => {
  const [y, m] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextMonth = (monthIso: string) => {
  const [y, m] = monthIso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
};

/** Splits `total` into `n` integer parts that sum exactly to `total`. */
function splitEvenly(total: number, n: number): number[] {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / n);
  const rem = abs - base * n;
  return Array.from({ length: n }, (_, i) => sign * (base + (i < rem ? 1 : 0)));
}

export function lastCompleteMonth(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // current month (0-based) -> previous month
  return m === 0 ? `${y - 1}-12-01` : `${y}-${pad(m)}-01`;
}

/**
 * Monthly aggregates from confirmed reservations. Nights, gross and net are prorated per night
 * across calendar months. Only COMPLETE months up to the last full month before `now` are produced;
 * months with no bookings inside the covered span are included as zero rows.
 */
export function aggregateMonthly(rows: NormalizedReservation[], now: Date): MonthAggregate[] {
  const confirmed = rows.filter((r) => r.status === "confirmed" && daysBetween(r.checkin, r.checkout) > 0);
  if (confirmed.length === 0) return [];

  // Use the dominant currency; mixed currencies are reported by the reliability checks.
  const byCur = new Map<string, number>();
  for (const r of confirmed) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + 1);
  const currency = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const cutoff = lastCompleteMonth(now);

  const acc = new Map<string, MonthAggregate>();
  for (const r of confirmed.filter((x) => x.currency === currency)) {
    const n = daysBetween(r.checkin, r.checkout);
    const grossParts = splitEvenly(r.grossMinor, n);
    const netParts = splitEvenly(r.netMinor, n);
    const touched = new Set<string>();
    for (let i = 0; i < n; i++) {
      const mk = monthKey(addDays(r.checkin, i));
      if (mk > cutoff) continue;
      const a =
        acc.get(mk) ??
        { month: mk, grossMinor: 0, netMinor: 0, bookedNights: 0, daysInMonth: daysInMonth(mk), reservationsCount: 0, currency };
      a.grossMinor += grossParts[i];
      a.netMinor += netParts[i];
      a.bookedNights += 1;
      if (!touched.has(mk)) {
        touched.add(mk);
        a.reservationsCount += 1;
      }
      acc.set(mk, a);
    }
  }
  if (acc.size === 0) return [];

  // The data demonstrably covers every month up to the latest check-in we saw (capped at the last
  // complete month), so trailing empty months before it are real zeros, not missing data.
  const latestCheckin = monthKey(confirmed.filter((r) => r.currency === currency).map((r) => r.checkin).sort().pop()!);
  const months = [...acc.keys()].sort();
  const end = [months[months.length - 1], latestCheckin < cutoff ? latestCheckin : cutoff].sort().pop()!;
  const out: MonthAggregate[] = [];
  for (let m = months[0]; m <= end; m = nextMonth(m)) {
    out.push(
      acc.get(m) ?? { month: m, grossMinor: 0, netMinor: 0, bookedNights: 0, daysInMonth: daysInMonth(m), reservationsCount: 0, currency },
    );
  }
  return out;
}

/** First/last day covered by a set of aggregates (whole months). */
export function coverageOf(aggs: MonthAggregate[]): { start: string; end: string } | null {
  if (aggs.length === 0) return null;
  const first = aggs[0].month;
  const last = aggs[aggs.length - 1].month;
  return { start: first, end: addDays(nextMonth(last), -1) };
}
