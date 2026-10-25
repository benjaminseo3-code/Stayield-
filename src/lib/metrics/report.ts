/**
 * Report metrics from monthly aggregates. Pure functions.
 *
 * Honesty rules (see CLAUDE.md):
 *  - We only know BOOKED nights, not blocked/available nights, so there is no "occupancy" here.
 *    The headline ratio is "booked nights ÷ days in period" and is named exactly that.
 *  - Gross and net (after host fees) are always separate figures.
 */
export type AggRow = {
  month: string; // YYYY-MM-01
  grossMinor: number;
  netMinor: number;
  bookedNights: number;
  daysInMonth: number;
  reservationsCount: number;
  currency: string;
};

export type SeasonPoint = { month: number; bookedNightRate: number; grossMinor: number; samples: number };

export type ReportMetrics = {
  currency: string;
  monthsCovered: number;
  coverage: { start: string; end: string } | null;
  /** Trailing twelve months; `monthsUsed` < 12 means the report covers less than a year. */
  t12: {
    monthsUsed: number;
    isFullYear: boolean;
    grossMinor: number;
    netMinor: number;
    hostFeesMinor: number;
    bookedNights: number;
    daysInPeriod: number;
    /** gross ÷ booked nights */
    avgNightlyRateMinor: number | null;
    /** booked nights ÷ days in period (NOT occupancy) */
    bookedNightRate: number | null;
  };
  /** Change of trailing-12M gross vs the 12 months before it; null with less than 24 months. */
  yoy: { grossChange: number | null; previousGrossMinor: number } | null;
  /** Average per calendar month across the years available; null with less than 12 months. */
  seasonality: SeasonPoint[] | null;
  bestMonth: number | null;
  worstMonth: number | null;
  /** Up to 24 most recent months, oldest first, for the bar chart. */
  chart: AggRow[];
};

const sum = (rows: AggRow[], f: (r: AggRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export function buildReport(input: AggRow[]): ReportMetrics {
  const rows = [...input].sort((a, b) => a.month.localeCompare(b.month));
  const currency = rows[0]?.currency ?? "USD";
  const last12 = rows.slice(-12);
  const bookedNights = sum(last12, (r) => r.bookedNights);
  const daysInPeriod = sum(last12, (r) => r.daysInMonth);
  const gross = sum(last12, (r) => r.grossMinor);
  const net = sum(last12, (r) => r.netMinor);

  let yoy: ReportMetrics["yoy"] = null;
  if (rows.length >= 24) {
    const prev = rows.slice(-24, -12);
    const prevGross = sum(prev, (r) => r.grossMinor);
    yoy = { previousGrossMinor: prevGross, grossChange: prevGross > 0 ? gross / prevGross - 1 : null };
  }

  let seasonality: SeasonPoint[] | null = null;
  let bestMonth: number | null = null;
  let worstMonth: number | null = null;
  if (rows.length >= 12) {
    seasonality = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const inMonth = rows.filter((r) => Number(r.month.slice(5, 7)) === m);
      const nights = sum(inMonth, (r) => r.bookedNights);
      const days = sum(inMonth, (r) => r.daysInMonth);
      return {
        month: m,
        bookedNightRate: days ? nights / days : 0,
        grossMinor: inMonth.length ? Math.round(sum(inMonth, (r) => r.grossMinor) / inMonth.length) : 0,
        samples: inMonth.length,
      };
    });
    const sorted = [...seasonality].sort((a, b) => b.bookedNightRate - a.bookedNightRate);
    bestMonth = sorted[0].month;
    worstMonth = sorted[sorted.length - 1].month;
  }

  return {
    currency,
    monthsCovered: rows.length,
    coverage: rows.length ? { start: rows[0].month, end: lastDay(rows[rows.length - 1].month) } : null,
    t12: {
      monthsUsed: last12.length,
      isFullYear: last12.length === 12,
      grossMinor: gross,
      netMinor: net,
      hostFeesMinor: gross - net,
      bookedNights,
      daysInPeriod,
      avgNightlyRateMinor: bookedNights > 0 ? Math.round(gross / bookedNights) : null,
      bookedNightRate: daysInPeriod > 0 ? bookedNights / daysInPeriod : null,
    },
    yoy,
    seasonality,
    bestMonth,
    worstMonth,
    chart: rows.slice(-24),
  };
}

function lastDay(monthIso: string): string {
  const [y, m] = monthIso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
