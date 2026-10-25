import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/ingest/csv";
import { parseAmount, parseDate, parseReportCsv } from "@/lib/ingest/parse-report";
import { aggregateMonthly, coverageOf } from "@/lib/ingest/aggregate";
import { outcomeOf, runReliabilityChecks } from "@/lib/ingest/checks";
import type { NormalizedReservation } from "@/lib/ingest/types";
import { synthRows, toCsv } from "../helpers/synthetic";

const NOW = new Date("2026-10-25T00:00:00Z");
const level = (checks: ReturnType<typeof runReliabilityChecks>, code: string) => checks.find((c) => c.code === code)?.level;

describe("csv", () => {
  it("handles quotes, embedded delimiters/newlines, BOM and CRLF", () => {
    const t = '﻿a,b\r\n"x, y","line1\nline2"\r\n';
    expect(parseCsv(t)).toEqual([["a", "b"], ["x, y", "line1\nline2"]]);
  });
  it("detects semicolon delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("amounts and dates", () => {
  it.each([
    ["$1,234.56", 123456],
    ["1.234,56 €", 123456],
    ["(12.00)", -1200],
    ["12.00-", -1200],
    ["1,234", 123400],
    ["12,5", 1250],
    ["0.5", 50],
    ["€ 99", 9900],
  ])("parseAmount(%s)", (raw, expected) => expect(parseAmount(raw)).toBe(expected));
  it("rejects non-numbers", () => expect(parseAmount("n/a")).toBeNull());
  it("validates real dates", () => {
    expect(parseDate("2025-02-30", "ymd")).toBeNull();
    expect(parseDate("03/04/2025", "dmy")).toBe("2025-04-03");
    expect(parseDate("03/04/2025", "mdy")).toBe("2025-03-04");
  });
});

describe("parseReportCsv", () => {
  it("parses synthetic rows into minor units", () => {
    const res = parseReportCsv(toCsv(synthRows("2025-01-01", 10)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(10);
    expect(res.rows[0]).toMatchObject({ checkin: "2025-01-01", nights: 3, currency: "EUR", status: "confirmed" });
    expect(res.rows[0].grossMinor).toBe(30000);
    expect(res.rows[0].hostFeeMinor).toBe(900);
    expect(res.rows[0].netMinor).toBe(29100);
  });

  it("never lets guest data out of the parser", () => {
    const res = parseReportCsv(toCsv(synthRows("2025-01-01", 5)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const dump = JSON.stringify(res);
    expect(dump).not.toContain("Fake Guest");
    expect(res.ignoredColumns).toContain("Guest");
    for (const r of res.rows) expect(Object.keys(r)).not.toContain("guest");
  });

  it("refuses to map a guest-looking header even if it is listed as a candidate", () => {
    const csv = "Guest Name,Start Date,End Date,Gross Earnings,Currency\nAlice,2025-01-01,2025-01-03,100,EUR\n";
    const res = parseReportCsv(csv, {
      mapping: {
        profile: "evil",
        columns: { confirmationCode: ["guest name"], checkin: ["start date"], checkout: ["end date"], gross: ["gross earnings"], currency: ["currency"] },
        statusValues: { confirmed: [], canceled: [] },
        dateOrder: "auto",
        decimal: "auto",
      },
    });
    expect(res).toMatchObject({ ok: false, error: { code: "missing_columns" } });
  });

  it("reports missing columns, empty files and ambiguous dates", () => {
    expect(parseReportCsv("a,b\n1,2")).toMatchObject({ ok: false, error: { code: "missing_columns" } });
    expect(parseReportCsv("")).toMatchObject({ ok: false, error: { code: "empty_file" } });
    const ambiguous = "Confirmation Code,Start Date,End Date,Gross Earnings,Currency\nA1,03/04/2025,05/04/2025,100,EUR\n";
    expect(parseReportCsv(ambiguous)).toMatchObject({ ok: false, error: { code: "ambiguous_dates" } });
    expect(parseReportCsv(ambiguous, { dateOrder: "dmy" })).toMatchObject({ ok: true });
  });

  it("detects DMY from unambiguous dates and works with semicolons + BOM", () => {
    const csv = "Confirmation Code;Start Date;End Date;Gross Earnings;Currency\nA1;25/04/2025;27/04/2025;100,50;EUR\n";
    const res = parseReportCsv("﻿" + csv);
    expect(res.ok && res.rows[0]).toMatchObject({ checkin: "2025-04-25", checkout: "2025-04-27", grossMinor: 10050 });
  });

  it("skips bad rows without exposing their content, and filters non-reservation rows", () => {
    const csv = [
      "Confirmation Code,Start Date,End Date,Gross Earnings,Currency,Type",
      "A1,2025-01-01,2025-01-03,100,EUR,Reservation",
      "A2,not-a-date,2025-01-03,100,EUR,Reservation",
      "A3,2025-02-01,2025-02-03,50,EUR,Payout",
    ].join("\n");
    const res = parseReportCsv(csv);
    expect(res.ok && res.rows.map((r) => r.confirmationCode)).toEqual(["A1"]);
    expect(res.ok && res.skipped).toEqual([{ line: 3, code: "bad_date" }]);
  });
});

describe("aggregateMonthly", () => {
  it("prorates across months and conserves totals", () => {
    const rows: NormalizedReservation[] = [
      { confirmationCode: "X", checkin: "2025-01-30", checkout: "2025-02-03", nights: 4, grossMinor: 40001, hostFeeMinor: 0, netMinor: 40001, currency: "EUR", status: "confirmed" },
      { confirmationCode: "Y", checkin: "2025-03-10", checkout: "2025-03-12", nights: 2, grossMinor: 20000, hostFeeMinor: 0, netMinor: 20000, currency: "EUR", status: "confirmed" },
    ];
    const aggs = aggregateMonthly(rows, NOW);
    expect(aggs.map((a) => a.month)).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
    expect(aggs[0].bookedNights).toBe(2);
    expect(aggs[1].bookedNights).toBe(2);
    expect(aggs[0].grossMinor + aggs[1].grossMinor).toBe(40001);
    expect(aggs[2]).toMatchObject({ bookedNights: 2, daysInMonth: 31, reservationsCount: 1 });
  });

  it("excludes canceled stays and the current (incomplete) month, zero-fills gaps", () => {
    const rows: NormalizedReservation[] = [
      { confirmationCode: "A", checkin: "2026-07-01", checkout: "2026-07-03", nights: 2, grossMinor: 20000, hostFeeMinor: 0, netMinor: 20000, currency: "EUR", status: "confirmed" },
      { confirmationCode: "B", checkin: "2026-08-01", checkout: "2026-08-03", nights: 2, grossMinor: 99999, hostFeeMinor: 0, netMinor: 99999, currency: "EUR", status: "canceled" },
      { confirmationCode: "C", checkin: "2026-10-01", checkout: "2026-10-05", nights: 4, grossMinor: 40000, hostFeeMinor: 0, netMinor: 40000, currency: "EUR", status: "confirmed" },
    ];
    const aggs = aggregateMonthly(rows, NOW);
    expect(aggs.map((a) => a.month)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(aggs[1]).toMatchObject({ bookedNights: 0, grossMinor: 0 });
    expect(coverageOf(aggs)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  });
});

describe("reliability checks", () => {
  const good = () => {
    const res = parseReportCsv(toCsv(synthRows("2025-01-01", 70)));
    if (!res.ok) throw new Error("fixture failed");
    return res;
  };

  it("passes clean data with at least 12 months", () => {
    const { rows, skipped } = good();
    const checks = runReliabilityChecks(rows, skipped, NOW);
    expect(checks.filter((c) => c.level === "fail")).toEqual([]);
    expect(outcomeOf(checks)).toBe("live");
  });

  it("flags duplicate confirmation codes", () => {
    const { rows } = good();
    const checks = runReliabilityChecks([...rows, rows[3]], [], NOW);
    expect(level(checks, "duplicate_confirmations")).toBe("fail");
    expect(outcomeOf(checks)).toBe("review");
  });

  it("flags overlapping reservations but allows back-to-back", () => {
    const base = good().rows[0];
    const mk = (code: string, checkin: string, checkout: string): NormalizedReservation => ({ ...base, confirmationCode: code, checkin, checkout, nights: Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000) });
    expect(level(runReliabilityChecks([mk("A", "2025-01-01", "2025-01-04"), mk("B", "2025-01-04", "2025-01-06")], [], NOW), "overlapping_reservations")).toBe("pass");
    expect(level(runReliabilityChecks([mk("A", "2025-01-01", "2025-01-04"), mk("B", "2025-01-03", "2025-01-06")], [], NOW), "overlapping_reservations")).toBe("fail");
  });

  it("flags nights/date mismatches, mixed currencies and impossible values", () => {
    const { rows } = good();
    expect(level(runReliabilityChecks([{ ...rows[0], nights: 9 }, ...rows.slice(1)], [], NOW), "nights_mismatch")).toBe("fail");
    expect(level(runReliabilityChecks([{ ...rows[0], currency: "USD" }, ...rows.slice(1)], [], NOW), "mixed_currencies")).toBe("fail");
    expect(level(runReliabilityChecks([{ ...rows[0], netMinor: rows[0].grossMinor + 1 }, ...rows.slice(1)], [], NOW), "value_anomalies")).toBe("fail");
  });

  it("warns on short coverage and stale data, fails on huge gaps", () => {
    const short = parseReportCsv(toCsv(synthRows("2026-06-01", 8)));
    if (!short.ok) throw new Error("fixture");
    const c = runReliabilityChecks(short.rows, [], NOW);
    expect(level(c, "coverage_length")).toBe("warn");

    const stale = parseReportCsv(toCsv(synthRows("2024-01-01", 20)));
    if (!stale.ok) throw new Error("fixture");
    expect(level(runReliabilityChecks(stale.rows, [], NOW), "data_recency")).toBe("warn");

    const { rows } = good();
    const shifted = rows.map((r, i) => (i < 35 ? r : { ...r, checkin: addDays(r.checkin, 200), checkout: addDays(r.checkout, 200) }));
    expect(level(runReliabilityChecks(shifted, [], NOW), "coverage_gaps")).toBe("fail");
  });

  it("fails when there are no reservations, and treats many unreadable rows as a failure", () => {
    expect(outcomeOf(runReliabilityChecks([], [], NOW))).toBe("review");
    const { rows } = good();
    const skipped = Array.from({ length: 60 }, (_, i) => ({ line: i, code: "bad_date" }));
    expect(level(runReliabilityChecks(rows, skipped, NOW), "unparseable_rows")).toBe("fail");
  });
});

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
