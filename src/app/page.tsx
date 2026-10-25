import Link from "next/link";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { t } = await getT();
  const steps = [1, 2, 3] as const;
  return (
    <>
      <section className="hero">
        <div className="container hero-inner stack" style={{ ["--gap" as string]: "20px" }}>
          <p className="eyebrow">{t("brand.name")}</p>
          <h1>{t("home.hero.title")}</h1>
          <p className="lead">{t("home.hero.sub")}</p>
          <div className="row">
            <Link href="/properties" className="btn btn-primary lg">
              {t("home.hero.ctaBrowse")}
            </Link>
            <Link href="/sell" className="btn btn-secondary lg">
              {t("home.hero.ctaSell")}
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{t("home.how.title")}</h2>
          <div className="grid-3">
            {steps.map((n) => (
              <div key={n} className="card card-pad">
                <span className="step-num" aria-hidden="true">
                  {n}
                </span>
                <h3>{t(`home.how.${n}.title`)}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {t(`home.how.${n}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
