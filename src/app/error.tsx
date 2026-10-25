"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const limited = error.message.includes("rate_limited");
  return (
    <div className="section">
      <div className="container narrow card card-pad center stack" role="alert">
        <h1 style={{ fontSize: "2.2rem" }}>{t("error.title")}</h1>
        <p className="muted">{limited ? t("error.rate") : t("error.body")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={reset}>{t("error.retry")}</button>
          <Link className="btn btn-secondary" href="/">{t("error.home")}</Link>
        </div>
      </div>
    </div>
  );
}
