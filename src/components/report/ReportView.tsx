import { createHash } from "node:crypto";
import { getT } from "@/i18n/server";
import { formatDate, formatMoney, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import type { ReviewReason } from "@/db/schema";
import { buildReport, type AggRow } from "@/lib/metrics/report";
import { TrustBadge, type Tier } from "../TrustBadge";
import { BarChart } from "./BarChart";
import { ChecksList } from "./ChecksList";
import { SeasonChart } from "./SeasonChart";

/** The paid report. Pure presentation of aggregates; honest labels (never "occupancy"). */
export async function ReportView({ rows, tier, notes = [], generatedAt = new Date() }: {
  rows: AggRow[];
  tier: Tier;
  notes?: ReviewReason[];
  generatedAt?: Date;
}) {
  const { t, lang } = await getT();
  const r = buildReport(rows);
  const cur = r.currency;
  const fingerprint = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);
  const monthName = (m: number) => new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2025, m - 1, 1)));

  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }} data-testid="report">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t("report.title")}</h2>
        <TrustBadge tier={tier} />
      </div>

      {!r.t12.isFullYear && (
        <p className="notice warn" role="note">
          {t("report.partial", { n: r.t12.monthsUsed })}
        </p>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="label">{t("report.kpi.gross")}</div>
          <div className="value" data-testid="kpi-gross">{formatMoney(r.t12.grossMinor, cur, lang)}</div>
          <div className="sub">{t("report.kpi.gross.sub", { n: r.t12.monthsUsed })}</div>
        </div>
        <div className="kpi">
          <div className="label">{t("report.kpi.net")}</div>
          <div className="value" data-testid="kpi-net">{formatMoney(r.t12.netMinor, cur, lang)}</div>
          <div className="sub">{t("report.kpi.net.sub", { fees: formatMoney(r.t12.hostFeesMinor, cur, lang) })}</div>
        </div>
        <div className="kpi">
          <div className="label">{t("report.kpi.adr")}</div>
          <div className="value">{r.t12.avgNightlyRateMinor != null ? formatMoney(r.t12.avgNightlyRateMinor, cur, lang) : "—"}</div>
          <div className="sub">{t("report.kpi.adr.sub")}</div>
        </div>
        <div className="kpi">
          <div className="label">{t("report.kpi.rate")}</div>
          <div className="value">{r.t12.bookedNightRate != null ? formatPercent(r.t12.bookedNightRate, lang) : "—"}</div>
          <div className="sub">{t("report.kpi.rate.sub", { nights: formatNumber(r.t12.bookedNights, lang), days: formatNumber(r.t12.daysInPeriod, lang) })}</div>
        </div>
      </div>

      {r.chart.length > 0 && (
        <section className="card card-pad stack" aria-labelledby="chart-h">
          <h3 id="chart-h" style={{ margin: 0 }}>{t("report.chart.title")}</h3>
          <BarChart
            rows={r.chart}
            lang={lang}
            alt={t("report.chart.alt", { start: formatMonth(r.chart[0].month, lang), end: formatMonth(r.chart[r.chart.length - 1].month, lang) })}
            caption={t("report.tableCaption")}
            labels={{ month: t("report.month"), gross: t("report.col.gross"), net: t("report.col.net"), nights: t("report.col.nights") }}
          />
          <div className="legend">
            <span><i style={{ background: "var(--navy)" }} />{t("report.chart.earlier")}</span>
            <span><i style={{ background: "var(--green)" }} />{t("report.chart.recent")}</span>
          </div>
        </section>
      )}

      <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <section className="card card-pad stack" aria-labelledby="season-h">
          <h3 id="season-h" style={{ margin: 0 }}>{t("report.season.title")}</h3>
          {r.seasonality ? (
            <>
              <p className="small muted" style={{ margin: 0 }}>{t("report.season.rate")}</p>
              <SeasonChart points={r.seasonality} best={r.bestMonth} lang={lang} alt={t("report.season.rate")} />
              <p style={{ margin: 0 }}>
                {r.bestMonth && t("report.season.best", { month: monthName(r.bestMonth) })}
                <br />
                {r.worstMonth && t("report.season.worst", { month: monthName(r.worstMonth) })}
              </p>
            </>
          ) : (
            <p className="muted">{t("report.season.need")}</p>
          )}
        </section>
        <section className="card card-pad stack" aria-labelledby="yoy-h">
          <h3 id="yoy-h" style={{ margin: 0 }}>{t("report.yoy.title")}</h3>
          {r.yoy?.grossChange != null ? (
            <p style={{ margin: 0 }}>
              {Math.abs(r.yoy.grossChange) < 0.005
                ? t("report.yoy.flat")
                : t(r.yoy.grossChange > 0 ? "report.yoy.up" : "report.yoy.down", { pct: formatPercent(Math.abs(r.yoy.grossChange), lang, 1) })}
            </p>
          ) : (
            <p className="muted">{t("report.yoy.need")}</p>
          )}
        </section>
      </div>

      <section className="card card-pad stack" aria-labelledby="prov-h">
        <h3 id="prov-h" style={{ margin: 0 }}>{t("report.source")}</h3>
        <p style={{ margin: 0 }}>
          <TrustBadge tier={tier} /> {t(`report.source.${tier}`)}
        </p>
        {r.coverage && (
          <p style={{ margin: 0 }}>
            <strong>{t("report.coverage")}:</strong>{" "}
            {t("report.coverage.range", { start: formatDate(r.coverage.start, lang), end: formatDate(r.coverage.end, lang), n: r.monthsCovered })}
          </p>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {t("report.generated", { date: formatDate(generatedAt.toISOString().slice(0, 10), lang) })} · {t("report.fingerprint")}: <code dir="ltr">{fingerprint}</code>
        </p>
        {notes.length > 0 && (
          <div>
            <h4 style={{ fontSize: "1rem", margin: "8px 0" }}>{t("report.dataNotes")}</h4>
            <ChecksList checks={notes.map((n) => ({ code: n.code, level: n.level, params: n.params }))} />
          </div>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="notes-h">
        <h3 id="notes-h" style={{ margin: 0 }}>{t("report.notes.title")}</h3>
        <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>
          <li>{t("report.notes.shows", { currency: cur })}</li>
          <li>{t("report.notes.notOccupancy")}</li>
          <li>{t("report.notes.notCosts")}</li>
          <li>{t("report.notes.notGuests")}</li>
        </ul>
      </section>
    </div>
  );
}
