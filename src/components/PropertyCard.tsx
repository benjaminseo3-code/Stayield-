import Link from "next/link";
import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import type { Teaser } from "@/lib/data/teaser";
import { Photo } from "./Photo";
import { TrustBadge } from "./TrustBadge";

export async function PropertyCard({ p }: { p: Teaser }) {
  const { t, lang } = await getT();
  const cover = p.photos.find((x) => x.isCover) ?? p.photos[0];
  const place = [p.neighborhood, p.city].filter(Boolean).join(", ");
  return (
    <Link href={`/properties/${p.slug}`} className="card card-link property-card" data-testid="property-card">
      <div className="cover">
        {cover ? <Photo id={cover.id} alt={cover.alt || place} /> : <div className="cover-fallback">{p.city || t("prop.noPhotos")}</div>}
        <div className="badges">
          {p.isDemo && <span className="badge demo">{t("common.demoData")}</span>}
          {p.trustTier && <TrustBadge tier={p.trustTier} />}
        </div>
      </div>
      <div className="body">
        <p className="price" style={{ margin: 0 }}>
          {p.askingPriceMinor != null ? formatMoney(p.askingPriceMinor, p.currency, lang) : "—"}
        </p>
        <h3 style={{ margin: "2px 0 8px", fontSize: "1.05rem" }}>{place}</h3>
        <div className="meta">
          {p.bedrooms != null && <span>{t("common.bedrooms", { n: p.bedrooms })}</span>}
          {p.bathrooms != null && <span>{t("common.bathrooms", { n: p.bathrooms })}</span>}
          {p.sqm != null && <span>{t("common.sqm", { n: p.sqm })}</span>}
        </div>
        <div className="income-band">
          <span className="muted">{t("card.income")}</span>
          {p.incomeBandLowMinor != null && p.incomeBandHighMinor != null ? (
            <strong>
              {t("card.incomeBand", {
                low: formatMoney(p.incomeBandLowMinor, p.currency, lang, true),
                high: formatMoney(p.incomeBandHighMinor, p.currency, lang, true),
              })}
            </strong>
          ) : (
            <strong>{t("card.noIncome")}</strong>
          )}
        </div>
      </div>
    </Link>
  );
}
