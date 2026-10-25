import { describe, expect, it } from "vitest";
import { buildReport, type AggRow } from "@/lib/metrics/report";

const months = (n: number, start = "2023-11-01"): AggRow[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + i, 1));
    const month = d.toISOString().slice(0, 10);
    const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return { month, grossMinor: 100_000, netMinor: 97_000, bookedNights: 15, daysInMonth: dim, reservationsCount: 5, currency: "EUR" };
  });

describe("buildReport", () => {
  it("computes T12M gross, net, fees, nightly rate and booked-night rate", () => {
    const r = buildReport(months(14));
    expect(r.t12).toMatchObject({ monthsUsed: 12, isFullYear: true, grossMinor: 1_200_000, netMinor: 1_164_000, hostFeesMinor: 36_000, bookedNights: 180 });
    expect(r.t12.avgNightlyRateMinor).toBe(Math.round(1_200_000 / 180));
    // booked nights / days in period, never called occupancy
    // the 12 months here are Jan-Dec 2024, a leap year (366 days)
    expect(r.t12.bookedNightRate).toBeCloseTo(180 / 366, 5);
    expect(r).not.toHaveProperty("occupancy");
    expect(r.t12).not.toHaveProperty("occupancy");
  });

  it("flags partial years and has no YoY / seasonality with short coverage", () => {
    const r = buildReport(months(8));
    expect(r.t12.isFullYear).toBe(false);
    expect(r.t12.monthsUsed).toBe(8);
    expect(r.yoy).toBeNull();
    expect(r.seasonality).toBeNull();
  });

  it("computes YoY only with at least 24 months", () => {
    const rows = months(24);
    rows.forEach((r, i) => i >= 12 && (r.grossMinor = 120_000));
    const r = buildReport(rows);
    expect(r.yoy?.grossChange).toBeCloseTo(0.2, 5);
    expect(buildReport(months(23)).yoy).toBeNull();
  });

  it("derives seasonality and best/worst months from 12+ months", () => {
    const rows = months(12, "2025-01-01");
    rows.forEach((r) => (r.bookedNights = Number(r.month.slice(5, 7)) === 7 ? 28 : Number(r.month.slice(5, 7)) === 1 ? 5 : 15));
    const r = buildReport(rows);
    expect(r.seasonality).toHaveLength(12);
    expect(r.bestMonth).toBe(7);
    expect(r.worstMonth).toBe(1);
  });

  it("reports coverage dates and limits the chart to 24 months", () => {
    const r = buildReport(months(30));
    expect(r.chart).toHaveLength(24);
    expect(r.coverage?.start).toBe("2023-11-01");
    expect(r.monthsCovered).toBe(30);
  });

  it("handles empty input", () => {
    const r = buildReport([]);
    expect(r.coverage).toBeNull();
    expect(r.t12.avgNightlyRateMinor).toBeNull();
  });
});
