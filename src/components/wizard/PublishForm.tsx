"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishProperty, type PublishResult } from "@/app/actions/sell";
import { useT } from "@/i18n/client";
import type { ReviewReason } from "@/db/schema";
import { ChecksClient } from "./ChecksClient";

const STATEMENTS = [
  { id: "owns", key: "publish.consent.owns" },
  { id: "shares_aggregates", key: "publish.consent.shares" },
  { id: "complete_data", key: "publish.consent.complete" },
] as const;

export function PublishForm({ propertyId, hasData, reasons }: { propertyId: string; hasData: boolean; reasons: ReviewReason[] }) {
  const t = useT();
  const [accepted, setAccepted] = useState<string[]>([]);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const all = accepted.length === STATEMENTS.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!all) return setError(true);
    setError(false);
    start(async () => setResult(await publishProperty(propertyId, accepted)));
  }

  if (result?.ok) {
    return (
      <div className="stack" role="status" data-testid="publish-result" data-status={result.status}>
        <p className={`notice ${result.status === "live" ? "ok" : result.status === "review" ? "warn" : ""}`}>
          {result.status === "live" ? t("publish.result.live") : result.status === "review" ? t("publish.result.review") : t("publish.result.pending")}
        </p>
        {result.status === "review" && <ChecksClient checks={reasons.map((r) => ({ code: r.code, level: r.level, params: r.params }))} />}
        <div className="row">
          {result.status === "live" && (
            <Link className="btn btn-primary" href={`/properties/${result.slug}`}>
              {t("publish.viewListing")}
            </Link>
          )}
          <Link className="btn btn-secondary" href="/sell">
            {t("publish.goToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {!hasData && <p className="notice warn">{t("publish.noData")}</p>}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="visually-hidden">{t("publish.title")}</legend>
        {STATEMENTS.map((s) => (
          <label key={s.id} className="check">
            <input
              type="checkbox"
              checked={accepted.includes(s.id)}
              onChange={(e) => setAccepted((a) => (e.target.checked ? [...a, s.id] : a.filter((x) => x !== s.id)))}
              data-testid={`consent-${s.id}`}
            />
            <span>{t(s.key)}</span>
          </label>
        ))}
      </fieldset>
      {error && <p className="error-text" role="alert">{t("publish.consent.required")}</p>}
      {result && !result.ok && <p className="error-text" role="alert">{result.error === "no_data" ? t("publish.noData") : result.error === "consent" ? t("publish.consent.required") : result.error === "incomplete" ? t("basics.invalid") : t("common.error")}</p>}
      <button type="submit" className="btn btn-primary lg" disabled={pending || !hasData} style={{ marginTop: 16 }} data-testid="publish-button">
        {t("publish.button")}
      </button>
    </form>
  );
}
