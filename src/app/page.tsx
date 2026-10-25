import Link from "next/link";
import { PropertyCard } from "@/components/PropertyCard";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { listLiveListings } from "@/lib/data/listings";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Illustrative only: relative month heights for the sample chart (last five months are the "recent" green bars).
const SAMPLE_BARS = [46, 52, 63, 70, 78, 88, 100, 96, 82, 68, 58, 72];

export default async function Home() {
  const { t } = await getT();
  const steps = [1, 2, 3] as const;
  // Listings are for signed-in members; visitors only see the landing content.
  const user = await currentUser();
  const featured = user ? (await listLiveListings(await getDb(), user)).slice(0, 3) : [];
  return (
    <>
      <section className="hero">
        <div className="container hero-inner lp-hero">
          <div className="stack" style={{ ["--gap" as string]: "20px" }}>
            <p className="eyebrow">{t("lp.eyebrow")}</p>
            <h1>{t("lp.title")}</h1>
            <p className="lead">{t("lp.sub")}</p>
            <div className="row">
              {user ? (
                <Link href="/properties" className="btn btn-primary lg" data-testid="cta-browse">
                  {t("lp.cta.browse")}
                </Link>
              ) : (
                <Link href="/sign-up?role=buyer" className="btn btn-primary lg" data-testid="cta-signup">
                  {t("lp.cta.signUp")}
                </Link>
              )}
              <Link href={user ? "/sell" : "/sign-up?role=seller"} className="btn btn-secondary lg">
                {t("lp.cta.sell")}
              </Link>
            </div>
            {!user && (
              <p className="lp-signin">
                <Link href="/sign-in">{t("lp.cta.signIn")}</Link>
              </p>
            )}
          </div>

          <aside className="lp-sample" aria-label={t("lp.sample.title")}>
            <div className="lp-sample-h">
              <h2>{t("lp.sample.title")}</h2>
              <span className="lp-tag">{t("lp.sample.tag")}</span>
            </div>
            <div className="lp-kpis">
              <div className="lp-kpi">
                <b dir="ltr">$48,200</b>
                <span>{t("lp.sample.income")}</span>
              </div>
              <div className="lp-kpi">
                <b dir="ltr">74%</b>
                <span>{t("lp.sample.booked")}</span>
              </div>
              <div className="lp-kpi">
                <b dir="ltr">$178</b>
                <span>{t("lp.sample.adr")}</span>
              </div>
            </div>
            <div className="lp-bars" aria-hidden="true">
              {SAMPLE_BARS.map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} className={i >= 7 ? "recent" : undefined} />
              ))}
            </div>
            <div className="lp-bars-l" aria-hidden="true">
              <span>{t("lp.sample.jan")}</span>
              <span>{t("lp.sample.dec")}</span>
            </div>
            <p className="lp-note">{t("lp.sample.note")}</p>
          </aside>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section" aria-labelledby="featured-h">
          <div className="container">
            <div className="row between">
              <h2 id="featured-h">{t("home.featured.title")}</h2>
              <Link href="/properties">{t("home.featured.all")}</Link>
            </div>
            <div className="grid-cards">
              {featured.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" id="how">
        <div className="container">
          <div className="lp-sec-h">
            <h2>{t("lp.how.title")}</h2>
            <p className="muted">{t("lp.how.sub")}</p>
          </div>
          <div className="grid-3">
            {steps.map((n) => (
              <div key={n} className="card card-pad">
                <span className="step-num" aria-hidden="true">
                  {n}
                </span>
                <h3>{t(`lp.how.${n}.title`)}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {t(`lp.how.${n}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section on-navy lp-dark">
        <div className="container">
          <div className="lp-sec-h">
            <h2>{t("lp.trust.title")}</h2>
            <p>{t("lp.trust.sub")}</p>
          </div>
          <div className="grid-3">
            {steps.map((n) => (
              <div key={n} className="lp-pillar">
                <h3>{t(`lp.trust.${n}.title`)}</h3>
                <p>{t(`lp.trust.${n}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!user && (
        <section className="section" aria-labelledby="join-h">
          <div className="container">
            <div className="card card-pad lp-join">
              <div>
                <h2 id="join-h">{t("lp.join.title")}</h2>
                <p className="muted" style={{ margin: 0 }}>{t("lp.join.body")}</p>
              </div>
              <div className="row">
                <Link href="/sign-up?role=buyer" className="btn btn-primary lg">
                  {t("lp.cta.signUp")}
                </Link>
                <Link href="/sign-in" className="btn btn-ghost lg">
                  {t("nav.signIn")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
