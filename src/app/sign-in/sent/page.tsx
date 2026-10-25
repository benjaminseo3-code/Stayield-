import Link from "next/link";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function Sent({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { t } = await getT();
  const { email = "" } = await searchParams;
  const dev = process.env.NODE_ENV !== "production";
  return (
    <div className="section">
      <div className="container narrow">
        <div className="card card-pad stack" role="status">
          <h1 style={{ fontSize: "2rem" }}>{t("auth.sentTitle")}</h1>
          <p>{t("auth.sentBody", { email })}</p>
          {dev && (
            <p className="notice small">
              {t("auth.devHint")} <Link href="/dev/outbox">{t("auth.openOutbox")}</Link>
            </p>
          )}
          <Link href="/sign-in">{t("auth.tryAgain")}</Link>
        </div>
      </div>
    </div>
  );
}
