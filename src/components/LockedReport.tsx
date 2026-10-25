import Link from "next/link";
import { startUnlock } from "@/app/actions/buyer";
import { getT } from "@/i18n/server";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/format";

const SAMPLE = [0.45, 0.5, 0.62, 0.7, 0.8, 0.9, 1, 0.95, 0.78, 0.66, 0.5, 0.46];

/**
 * What a buyer sees before paying. The blurred chart is DECORATIVE sample art, not derived from the
 * listing's data, so nothing real can leak through the blur.
 */
export async function LockedReport({ propertyId, slug, canUnlock, signedIn }: { propertyId: string; slug: string; canUnlock: boolean; signedIn: boolean }) {
  const { t, lang } = await getT();
  const price = formatMoney(config.unlockPriceMinor(), config.unlockCurrency(), lang);
  return (
    <section className="card locked" aria-labelledby="locked-h" data-testid="locked-report">
      <div className="blur card-pad" aria-hidden="true">
        <div className="kpis" style={{ marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="kpi"><div className="label">████████</div><div className="value">$ ██,███</div></div>
          ))}
        </div>
        <svg className="chart" viewBox="0 0 720 200">
          {SAMPLE.map((v, i) => (
            <rect key={i} className={`chart-bar${i > 5 ? " recent" : ""}`} x={20 + i * 57} y={190 - v * 170} width={38} height={v * 170} rx={3} />
          ))}
        </svg>
      </div>
      <div className="overlay">
        <div className="card card-pad center stack" style={{ maxWidth: 460 }}>
          <h2 id="locked-h" style={{ fontSize: "1.5rem", margin: 0 }}>{t("prop.locked.title")}</h2>
          <p className="muted" style={{ margin: 0 }}>{t("prop.locked.body")}</p>
          <p className="small muted" style={{ margin: 0 }}>{t("prop.locked.preview")}</p>
          {canUnlock ? (
            <form action={startUnlock}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <button className="btn btn-primary lg" type="submit" data-testid="unlock-button">
                {t("prop.unlock", { price })}
              </button>
            </form>
          ) : !signedIn ? (
            <Link className="btn btn-primary lg" href={`/sign-in?next=${encodeURIComponent(`/properties/${slug}`)}`} data-testid="signin-to-unlock">
              {t("prop.signInToUnlock")}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
