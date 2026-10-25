import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="section">
      <div className="container narrow card card-pad center stack">
        <p className="eyebrow">404</p>
        <h1 style={{ fontSize: "2.2rem" }}>{t("notfound.title")}</h1>
        <p className="muted">{t("notfound.body")}</p>
        <Link className="btn btn-primary" href="/">{t("error.home")}</Link>
      </div>
    </div>
  );
}
