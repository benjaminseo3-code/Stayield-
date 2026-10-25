import Link from "next/link";
import { getT } from "@/i18n/server";
import { countryLabel } from "@/lib/countries";
import { formatMoney } from "@/lib/format";
import type { Listing } from "@/lib/data/listings";
import { Photo } from "./Photo";
import { TrustBadge } from "./TrustBadge";

/** Decoy text for blurred fields. It is a constant, never derived from the listing. */
export const DECOY = { price: "€ 000,000", band: "€00K – €00K" } as const;

export async function PropertyCard({ p }: { p: Listing }) {
  const { t, lang } = await getT();
  const locked = p.level === "locked";
  const cover = p.photos.find((x) => x.isCover) ?? p.photos[0];
  const place = locked ? [p.city, countryLabel(t, p.country)].filter(Boolean).join(", ") : [p.neighborhood, p.city].filter(Boolean).join(", ");
  return (
    <Link href={`/properties/${p.slug}`} className="card card-link property-card" data-testid="property-card" data-level={p.level}>
      <div className="cover">
        {cover ? <Photo id={cover.id} alt={cover.alt || place} variant={locked ? "blur" : "thumb"} /> : <div className="cover-fallback">{p.city || t("prop.noPhotos")}</div>}
        <div className="badges">
          {p.isDemo && <span className="badge demo">{t("common.demoData")}</span>}
          {p.trustTier && <TrustBadge tier={p.trustTier} />}
          {locked ? <span className="lock-note">🔒 {t("listing.locked")}</span> : <span className="badge status-live">{t("listing.accessGranted")}</span>}
        </div>
      </div>
      <div className="body">
        <p className="price" style={{ margin: 0 }}>
          {locked ? (
            <>
              <span className="blurred" aria-hidden="true">{DECOY.price}</span>
              <span className="visually-hidden">{t("listing.hiddenUntilApproved")}</span>
            </>
          ) : p.askingPriceMinor != null ? (
            formatMoney(p.askingPriceMinor, p.currency, lang)
          ) : (
            "—"
          )}
        </p>
        <h3 style={{ margin: "2px 0 8px", fontSize: "1.05rem" }}>{place}</h3>
        <div className="meta">
          {p.bedrooms != null && <span>{t("common.bedrooms", { n: p.bedrooms })}</span>}
          {p.bathrooms != null && <span>{t("common.bathrooms", { n: p.bathrooms })}</span>}
          {!locked && p.sqm != null && <span>{t("common.sqm", { n: p.sqm })}</span>}
        </div>
        <div className="income-band">
          <span className="muted">{t("card.income")}</span>
          {locked ? (
            <strong>
              <span className="blurred" aria-hidden="true">{DECOY.band}</span>
              <span className="visually-hidden">{t("listing.hiddenUntilApproved")}</span>
            </strong>
          ) : p.incomeBandLowMinor != null && p.incomeBandHighMinor != null ? (
            <strong>
              <bdi dir="ltr">
                {t("card.incomeBand", { low: formatMoney(p.incomeBandLowMinor, p.currency, lang, true), high: formatMoney(p.incomeBandHighMinor, p.currency, lang, true) })}
              </bdi>
            </strong>
          ) : (
            <strong>{t("card.noIncome")}</strong>
          )}
        </div>
      </div>
    </Link>
  );
}
