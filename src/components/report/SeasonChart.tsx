import type { SeasonPoint } from "@/lib/metrics/report";
import { formatPercent } from "@/lib/format";
import type { Lang } from "@/i18n";

export function SeasonChart({ points, best, lang, alt }: { points: SeasonPoint[]; best: number | null; lang: Lang; alt: string }) {
  const W = 720;
  const H = 150;
  const m = { top: 10, bottom: 26, side: 8 };
  const max = Math.max(0.01, ...points.map((p) => p.bookedNightRate));
  const step = (W - m.side * 2) / 12;
  const barW = step * 0.64;
  const fmt = new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-US", { month: "short", timeZone: "UTC" });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} style={{ direction: "ltr" }}>
      {points.map((p, i) => {
        const h = (p.bookedNightRate / max) * (H - m.top - m.bottom);
        const x = m.side + i * step + (step - barW) / 2;
        return (
          <g key={p.month}>
            <rect className={`chart-bar${p.month === best ? " best" : ""}`} x={x} y={H - m.bottom - h} width={barW} height={Math.max(h, 1)} rx={3}>
              <title>{`${fmt.format(new Date(Date.UTC(2025, p.month - 1, 1)))}: ${formatPercent(p.bookedNightRate, lang)}`}</title>
            </rect>
            <text className="chart-label" x={x + barW / 2} y={H - 8} textAnchor="middle">
              {fmt.format(new Date(Date.UTC(2025, p.month - 1, 1)))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
