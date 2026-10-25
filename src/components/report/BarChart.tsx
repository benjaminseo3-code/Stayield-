import type { AggRow } from "@/lib/metrics/report";
import { formatMoney, formatMonth } from "@/lib/format";
import type { Lang } from "@/i18n";

/**
 * Monthly gross bars. Navy for earlier months, green for the most recent six. Server-rendered SVG
 * (no JS), with a visually hidden table for screen readers.
 */
export function BarChart({ rows, lang, alt, caption, labels }: {
  rows: AggRow[];
  lang: Lang;
  alt: string;
  caption: string;
  labels: { month: string; gross: string; net: string; nights: string };
}) {
  const W = 720;
  const H = 260;
  const m = { top: 12, right: 8, bottom: 34, left: 52 };
  const innerW = W - m.left - m.right;
  const innerH = H - m.top - m.bottom;
  const max = Math.max(1, ...rows.map((r) => r.grossMinor));
  const niceMax = niceCeil(max);
  const step = innerW / Math.max(1, rows.length);
  const barW = Math.max(4, step * 0.68);
  const currency = rows[0]?.currency ?? "USD";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <figure style={{ margin: 0 }} dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt}>
        {ticks.map((v) => {
          const y = m.top + innerH - (v / niceMax) * innerH;
          return (
            <g key={v}>
              <line className="chart-grid" x1={m.left} x2={W - m.right} y1={y} y2={y} />
              <text className="chart-label" x={m.left - 6} y={y + 4} textAnchor="end">
                {formatMoney(v, currency, lang, true)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const h = (r.grossMinor / niceMax) * innerH;
          const x = m.left + i * step + (step - barW) / 2;
          const recent = i >= rows.length - 6;
          const showLabel = rows.length <= 12 || i % 3 === (rows.length - 1) % 3;
          return (
            <g key={r.month}>
              <rect className={`chart-bar${recent ? " recent" : ""}`} x={x} y={m.top + innerH - h} width={barW} height={Math.max(h, 1)} rx={3}>
                <title>{`${formatMonth(r.month, lang)}: ${formatMoney(r.grossMinor, currency, lang)}`}</title>
              </rect>
              {showLabel && (
                <text className="chart-label" x={x + barW / 2} y={H - 12} textAnchor="middle">
                  {new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${r.month}T00:00:00Z`))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>{labels.month}</th>
            <th>{labels.gross}</th>
            <th>{labels.net}</th>
            <th>{labels.nights}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{formatMonth(r.month, lang)}</td>
              <td>{formatMoney(r.grossMinor, currency, lang)}</td>
              <td>{formatMoney(r.netMinor, currency, lang)}</td>
              <td>{r.bookedNights}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Rounds up to 1, 2, 2.5, 5 x 10^n so axis ticks are tidy. */
function niceCeil(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
