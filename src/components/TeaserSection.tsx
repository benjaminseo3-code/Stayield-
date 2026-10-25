import { getT } from "@/i18n/server";
import { formatDate, formatMoney } from "@/lib/format";
import type { Teaser } from "@/lib/data/teaser";
import { Gallery } from "./Gallery";
import { TrustBadge } from "./TrustBadge";

/** The public part of a listing: photos, price, facts, description and the income band. */
export async function TeaserSection({ p }: { p: Teaser }) {
  const { t, lang } = await getT();
  const place = [p.neighborhood, p.city, p.country].filter(Boolean).join(", ");
  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <Gallery photos={p.photos.map((x) => ({ id: x.id, alt: x.alt }))} fallbackAlt={place || t("prop.noPhotos")} />
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4, fontSize: "clamp(1.7rem, 4vw, 2.5rem)" }}>{place || t("dash.untitled")}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {[p.bedrooms != null && t("common.bedrooms", { n: p.bedrooms }), p.bathrooms != null && t("common.bathrooms", { n: p.bathrooms }), p.sqm != null && t("common.sqm", { n: p.sqm })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div style={{ textAlign: "end" }}>
          <div className="muted small">{t("prop.asking")}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.9rem" }}>
            {p.askingPriceMinor != null ? formatMoney(p.askingPriceMinor, p.currency, lang) : "—"}
          </div>
        </div>
      </div>
      {p.isDemo && <p className="notice small">{t("common.demoData")}: {t("demo.banner")}</p>}

      <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <section className="card card-pad stack" aria-labelledby="about-h">
          <h2 id="about-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("prop.about")}</h2>
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{p.description || "—"}</p>
          {p.originalListingUrl && (
            <p style={{ margin: 0 }}>
              <a href={p.originalListingUrl} target="_blank" rel="noopener noreferrer nofollow">
                {t("common.viewOriginal")} ↗
              </a>
            </p>
          )}
        </section>
        <section className="card card-pad stack" aria-labelledby="income-h">
          <h2 id="income-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("prop.income.teaser")}</h2>
          {p.incomeBandLowMinor != null && p.incomeBandHighMinor != null ? (
            <p style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.8rem" }} data-testid="income-band">
              <bdi dir="ltr">{t("card.incomeBand", { low: formatMoney(p.incomeBandLowMinor, p.currency, lang, true), high: formatMoney(p.incomeBandHighMinor, p.currency, lang, true) })}</bdi>
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t("card.noIncome")}</p>
          )}
          {p.trustTier && (
            <p style={{ margin: 0 }}>
              <span className="small muted">{t("trust.label")}: </span>
              <TrustBadge tier={p.trustTier} withDescription />
            </p>
          )}
          {p.coverageStart && p.coverageEnd && (
            <p className="small muted" style={{ margin: 0 }}>
              {t("prop.coverage", { start: formatDate(p.coverageStart, lang), end: formatDate(p.coverageEnd, lang) })}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
