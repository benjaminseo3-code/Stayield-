import Link from "next/link";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("privacy.title") };
}

export default async function Privacy() {
  const { t } = await getT();
  const sections = [1, 2, 3, 4, 5] as const;
  return (
    <div className="section">
      <article className="container narrow stack" style={{ ["--gap" as string]: "8px" }}>
        <Link href="/">{t("privacy.back")}</Link>
        <h1 style={{ marginTop: 16 }}>{t("privacy.title")}</h1>
        <p className="muted">{t("privacy.updated")}</p>
        {sections.map((n) => (
          <section key={n}>
            <h2 style={{ fontSize: "1.4rem", marginTop: 24 }}>{t(`privacy.${n}.title`)}</h2>
            <p>{t(`privacy.${n}.body`)}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
