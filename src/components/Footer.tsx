import Link from "next/link";
import { getT } from "@/i18n/server";

export async function Footer() {
  const { t } = await getT();
  return (
    <footer className="footer">
      <div className="container stack" style={{ ["--gap" as string]: "8px" }}>
        <p className="disclaimer" style={{ margin: 0 }}>
          {t("footer.disclaimer")}
        </p>
        <p className="small" style={{ margin: 0 }}>
          {t("footer.privacy")} <Link href="/privacy">{t("privacy.link")}</Link>
        </p>
        <p className="small" style={{ margin: 0 }}>
          <span dir="ltr">{t("footer.rights", { year: new Date().getFullYear() })}</span>
        </p>
      </div>
    </footer>
  );
}
