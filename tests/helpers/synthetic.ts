/** SYNTHETIC report data for tests. Not Airbnb's real format (see csv-mapping.ts). */
export type SynthRow = {
  code: string;
  start: string;
  end: string;
  nights: number;
  guest: string;
  currency: string;
  gross: string;
  fee: string;
  status: string;
  type: string;
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `n` back-to-back-ish stays starting at `startIso`, 3-5 nights each, one every 6 days. */
export function synthRows(startIso: string, n: number, currency = "EUR"): SynthRow[] {
  const rows: SynthRow[] = [];
  let t = Date.parse(`${startIso}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const nights = 3 + (i % 3);
    const start = iso(t);
    const end = iso(t + nights * 86_400_000);
    const rate = 100 + (i % 7) * 10;
    rows.push({
      code: `SYN${String(1000 + i)}`,
      start,
      end,
      nights,
      guest: `Fake Guest ${i}`,
      currency,
      gross: (nights * rate).toFixed(2),
      fee: (nights * rate * 0.03).toFixed(2),
      status: "Confirmed",
      type: "Reservation",
    });
    t += 6 * 86_400_000;
  }
  return rows;
}

export function toCsv(rows: SynthRow[], opts: { delimiter?: string; bom?: boolean; extraHeader?: string } = {}): string {
  const d = opts.delimiter ?? ",";
  const header = ["Confirmation Code", "Start Date", "End Date", "Nights", "Guest", "Listing", "Currency", "Gross Earnings", "Host Fee", "Status", "Type"];
  const lines = [header.join(d)];
  for (const r of rows) {
    lines.push([r.code, r.start, r.end, r.nights, `"${r.guest}"`, '"Synthetic Listing, Unit 1"', r.currency, r.gross, r.fee, r.status, r.type].join(d));
  }
  return (opts.bom ? "﻿" : "") + lines.join("\n") + "\n";
}
