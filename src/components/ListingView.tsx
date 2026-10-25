import { getT } from "@/i18n/server";
import { countryLabel } from "@/lib/countries";
import { formatDate, formatMoney } from "@/lib/format";
import type { Listing } from "@/lib/data/listings";
import { DECOY } from "./PropertyCard";
import { Gallery } from "./Gallery";
import { Photo } from "./Photo";
import { TrustBadge } from "./TrustBadge";

const DECOY_TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.";

/**
 * The listing as the viewer may see it. While locked, price/location detail/description/income are
 * decoys on screen and are not present in the data passed in (see lib/data/listings.ts).
 */
export async function ListingView({ l }: { l: Listing }) {
  const { t, lang } = await getT();
  const locked = l.level === "locked";
  const place = locked ? [l.city, countryLabel(t, l.country)].filter(Boolean).join(", ") : [l.neighborhood, l.city, countryLabel(t, l.country)].filter(Boolean).join(", ");
  const hidden = <span className="visually-hidden">{t("listing.hiddenUntilApproved")}</span>;

  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      {locked ? (
        l.photos.length > 0 ? (
          <div className="locked-gallery" data-testid="locked-gallery" data-count={Math.min(l.photos.length, 5)}>
            {l.photos.slice(0, 5).map((p) => (
              <div key={p.id}>
                <Photo id={p.id} alt="" variant="blur" eager />
              </div>
            ))}
          </div>
        ) : (
          <div className="card card-pad center muted">{t("prop.noPhotos")}</div>
        )
      ) : (
        <Gallery photos={l.photos.map((x) => ({ id: x.id, alt: x.alt }))} fallbackAlt={place || t("prop.noPhotos")} />
      )}

      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4, fontSize: "clamp(1.7rem, 4vw, 2.5rem)" }}>{place || t("dash.untitled")}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {[l.bedrooms != null && t("common.bedrooms", { n: l.bedrooms }), l.bathrooms != null && t("common.bathrooms", { n: l.bathrooms }), !locked && l.sqm != null && t("common.sqm", { n: l.sqm })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div style={{ textAlign: "end" }}>
          <div className="muted small">{t("prop.asking")}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.9rem" }} data-testid="asking-price">
            {locked ? (
              <>
                <span className="blurred" aria-hidden="true">{DECOY.price}</span>
                {hidden}
              </>
            ) : l.askingPriceMinor != null ? (
              formatMoney(l.askingPriceMinor, l.currency, lang)
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
      {l.isDemo && (
        <p className="notice small">
          {t("common.demoData")}: {t("demo.banner")}
        </p>
      )}

      <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <section className="card card-pad stack" aria-labelledby="about-h">
          <h2 id="about-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("prop.about")}</h2>
          {locked ? (
            <>
              <p className="blurred" aria-hidden="true" style={{ margin: 0 }}>{DECOY_TEXT}</p>
              {hidden}
            </>
          ) : (
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{l.description || "—"}</p>
          )}
          {!locked && l.originalListingUrl && (
            <p style={{ margin: 0 }}>
              <a href={l.originalListingUrl} target="_blank" rel="noopener noreferrer nofollow">
                {t("common.viewOriginal")} ↗
              </a>
            </p>
          )}
        </section>
        <section className="card card-pad stack" aria-labelledby="income-h">
          <h2 id="income-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("prop.income.teaser")}</h2>
          {locked ? (
            <p style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.8rem" }} data-testid="income-band">
              <span className="blurred" aria-hidden="true">{DECOY.band}</span>
              {hidden}
            </p>
          ) : l.incomeBandLowMinor != null && l.incomeBandHighMinor != null ? (
            <p style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.8rem" }} data-testid="income-band">
              <bdi dir="ltr">{t("card.incomeBand", { low: formatMoney(l.incomeBandLowMinor, l.currency, lang, true), high: formatMoney(l.incomeBandHighMinor, l.currency, lang, true) })}</bdi>
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t("card.noIncome")}</p>
          )}
          {l.trustTier && (
            <p style={{ margin: 0 }}>
              <span className="small muted">{t("trust.label")}: </span>
              <TrustBadge tier={l.trustTier} withDescription />
            </p>
          )}
          {!locked && l.coverageStart && l.coverageEnd && (
            <p className="small muted" style={{ margin: 0 }}>{t("prop.coverage", { start: formatDate(l.coverageStart, lang), end: formatDate(l.coverageEnd, lang) })}</p>
          )}
        </section>
      </div>
    </div>
  );
}
