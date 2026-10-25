import Link from "next/link";
import { PropertyCard } from "@/components/PropertyCard";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { listLiveTeasers } from "@/lib/data/teaser";

export const dynamic = "force-dynamic";
type SP = { city?: string; min?: string; max?: string; beds?: string; trust?: string };

const toMinor = (v?: string) => (v && !Number.isNaN(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) : undefined);

export default async function Properties({ searchParams }: { searchParams: Promise<SP> }) {
  const { t } = await getT();
  const sp = await searchParams;
  const trust = sp.trust === "signed_email" || sp.trust === "self_reported" || sp.trust === "api_verified" ? sp.trust : undefined;
  const filtered = !!(sp.city || sp.min || sp.max || sp.beds || trust);
  const items = await listLiveTeasers(await getDb(), {
    city: sp.city?.trim() || undefined,
    minPriceMinor: toMinor(sp.min),
    maxPriceMinor: toMinor(sp.max),
    minBedrooms: sp.beds && Number(sp.beds) >= 0 ? Number(sp.beds) : undefined,
    trustTier: trust,
  });

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("props.title")}</h1>
          <p className="muted" style={{ margin: 0 }}>{t("props.sub")}</p>
        </div>

        <form method="get" className="card card-pad" aria-label={t("props.filters")}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="f-city">{t("props.filter.city")}</label>
              <input id="f-city" name="city" className="input" defaultValue={sp.city ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="f-min">{t("props.filter.minPrice")}</label>
              <input id="f-min" name="min" type="number" min={0} inputMode="numeric" className="input" defaultValue={sp.min ?? ""} dir="ltr" />
            </div>
            <div className="field">
              <label htmlFor="f-max">{t("props.filter.maxPrice")}</label>
              <input id="f-max" name="max" type="number" min={0} inputMode="numeric" className="input" defaultValue={sp.max ?? ""} dir="ltr" />
            </div>
            <div className="field">
              <label htmlFor="f-beds">{t("props.filter.bedrooms")}</label>
              <select id="f-beds" name="beds" className="input" defaultValue={sp.beds ?? ""}>
                <option value="">{t("props.filter.any")}</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}+</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-trust">{t("props.filter.trust")}</label>
              <select id="f-trust" name="trust" className="input" defaultValue={trust ?? ""}>
                <option value="">{t("props.filter.any")}</option>
                <option value="signed_email">{t("trust.signed_email")}</option>
                <option value="self_reported">{t("trust.self_reported")}</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary sm" type="submit">{t("props.apply")}</button>
            {filtered && <Link className="btn btn-ghost sm" href="/properties">{t("props.clear")}</Link>}
          </div>
        </form>

        <p className="small muted" style={{ margin: 0 }} role="status">{t("props.count", { n: items.length })}</p>
        {items.length === 0 ? (
          <div className="card card-pad center" data-testid="empty-state">
            <p className="muted" style={{ margin: 0 }}>{filtered ? t("props.empty") : t("props.emptyAll")}</p>
          </div>
        ) : (
          <div className="grid-cards">
            {items.map((p) => (
              <PropertyCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
