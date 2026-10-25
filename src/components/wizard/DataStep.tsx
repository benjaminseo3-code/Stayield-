"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/i18n/client";
import { formatDate, formatMoney } from "@/lib/format";
import { parseReportCsv } from "@/lib/ingest/parse-report";
import type { Check, NormalizedReservation, ParseResult } from "@/lib/ingest/types";
import { ChecksClient } from "./ChecksClient";

type Sub = {
  id: string;
  source: string;
  status: string;
  outcome: "live" | "review" | "failed" | null;
  checks: Check[];
} | null;

type Props = { propertyId: string; inboundAddress: string; initialSubmission: Sub; sellerEmails: number };

/** Statuses the seller sees, derived from the latest submission. */
function statusKey(sub: Sub): "waiting" | "verified" | "review" | "failed" | "needs_csv" {
  if (!sub) return "waiting";
  if (sub.checks.some((c) => c.code === "attachment_present" && c.level === "warn")) return "needs_csv";
  if (sub.status === "verified") return "verified";
  if (sub.status === "flagged") return "review";
  return "failed";
}

export function DataStep({ propertyId, inboundAddress, initialSubmission }: Props) {
  const { t } = useLang();
  const router = useRouter();
  const [option, setOption] = useState<"A" | "B">("A");
  const [sub, setSub] = useState<Sub>(initialSubmission);
  const [copied, setCopied] = useState(false);

  // Live status for option A: poll the latest submission while this step is open.
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/properties/${propertyId}/submission`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const json = (await res.json()) as { submission: Sub };
        if (!stop) setSub(json.submission);
      } catch {
        /* keep polling */
      }
    }
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [propertyId]);

  const key = statusKey(sub);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inboundAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the address is selectable text */
    }
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <div className="option-cards" role="radiogroup" aria-label={t("data.title")}>
        <button type="button" role="radio" aria-checked={option === "A"} className={`option-card${option === "A" ? " selected" : ""}`} onClick={() => setOption("A")} style={{ textAlign: "start", font: "inherit", color: "inherit", cursor: "pointer" }} data-testid="option-a">
          <span className="badge trust-signed_email">{t("data.optionA.badge")}</span>
          <h3 style={{ margin: "8px 0" }}>{t("data.optionA.title")}</h3>
          <p className="small muted" style={{ margin: 0 }}>{t("data.optionA.desc")}</p>
        </button>
        <button type="button" role="radio" aria-checked={option === "B"} className={`option-card${option === "B" ? " selected" : ""}`} onClick={() => setOption("B")} style={{ textAlign: "start", font: "inherit", color: "inherit", cursor: "pointer" }} data-testid="option-b">
          <span className="badge trust-self_reported">{t("trust.self_reported")}</span>
          <h3 style={{ margin: "8px 0" }}>{t("data.optionB.title")}</h3>
          <p className="small muted" style={{ margin: 0 }}>{t("data.optionB.desc")}</p>
        </button>
        <div className="option-card disabled" aria-disabled="true">
          <span className="badge">{t("data.comingSoon")}</span>
          <h3 style={{ margin: "8px 0" }}>{t("data.optionC.title")}</h3>
          <p className="small muted" style={{ margin: 0 }}>{t("data.optionC.desc")}</p>
          <button type="button" className="btn btn-secondary sm" disabled style={{ marginTop: 12 }}>
            {t("data.comingSoon")}
          </button>
        </div>
      </div>

      {option === "A" ? (
        <section className="card card-pad stack" aria-labelledby="a-h">
          <h3 id="a-h" style={{ margin: 0 }}>{t("data.optionA.title")}</h3>
          <ol style={{ margin: 0, paddingInlineStart: "1.4em" }}>
            <li>{t("data.a.step1")}</li>
            <li>{t("data.a.step2")}</li>
            <li>{t("data.a.step3")}</li>
          </ol>
          <div className="copy-box">
            <code dir="ltr" data-testid="inbound-address">{inboundAddress}</code>
            <button type="button" className="btn btn-secondary sm" onClick={copy}>
              {copied ? t("data.a.copied") : t("data.a.copy")}
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t("data.a.note")} <Link href="/account">{t("data.a.manageEmails")}</Link>
          </p>
        </section>
      ) : (
        <CsvUpload propertyId={propertyId} onDone={() => router.refresh()} />
      )}

      <section className="card card-pad stack" aria-labelledby="status-h" aria-live="polite">
        <h3 id="status-h" style={{ margin: 0 }}>{t("data.status.title")}</h3>
        <p style={{ margin: 0 }} data-testid="data-status">
          <span className={`badge ${key === "verified" ? "status-live" : key === "waiting" ? "status-draft" : key === "failed" ? "" : "status-review"}`}>
            {t(`data.status.${key}`)}
          </span>
        </p>
        {key === "needs_csv" && <p className="notice warn">{t("data.status.needsCsvHelp")}</p>}
        {sub ? (
          <>
            <h4 style={{ fontSize: "1rem", margin: "4px 0" }}>{t("data.checks.title")}</h4>
            <ChecksClient checks={sub.checks} />
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>{t("data.checks.none")}</p>
        )}
      </section>
    </div>
  );
}

function CsvUpload({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const { t, lang } = useLang();
  const [text, setText] = useState<string | null>(null);
  const [order, setOrder] = useState<"dmy" | "mdy" | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const parsed: ParseResult | null = text == null ? null : parseReportCsv(text, { dateOrder: order, currency: undefined });

  async function onFile(file: File | undefined) {
    setChecks(null);
    setFileError(null);
    setOrder(undefined);
    if (!file) return setText(null);
    try {
      setText(await file.text());
    } catch {
      setText(null);
      setFileError(t("data.b.error.read"));
    }
  }

  async function submit(rows: NormalizedReservation[], skipped: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/csv`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows, skippedCount: skipped }),
      });
      const json = (await res.json()) as { checks?: Check[] };
      setChecks(json.checks ?? null);
      if (!res.ok) setFileError(t("common.error"));
      onDone();
    } catch {
      setFileError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad stack" aria-labelledby="b-h">
      <h3 id="b-h" style={{ margin: 0 }}>{t("data.optionB.title")}</h3>
      <p className="notice small" style={{ margin: 0 }}>{t("data.b.privacy")}</p>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="csv">{t("data.b.choose")}</label>
        <input id="csv" type="file" accept=".csv,text/csv,text/plain" className="input" data-testid="csv-input" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {fileError && <p className="error-text" role="alert">{fileError}</p>}

      {parsed && !parsed.ok && parsed.error.code === "ambiguous_dates" && (
        <div className="notice warn">
          <p style={{ marginTop: 0 }}>{t("data.b.ambiguous")}</p>
          <label htmlFor="order">{t("data.b.dateOrder")} </label>
          <select id="order" className="input" style={{ maxWidth: 260 }} value={order ?? ""} onChange={(e) => setOrder((e.target.value || undefined) as "dmy" | "mdy" | undefined)}>
            <option value="">—</option>
            <option value="dmy">{t("data.b.dmy")}</option>
            <option value="mdy">{t("data.b.mdy")}</option>
          </select>
        </div>
      )}
      {parsed && !parsed.ok && parsed.error.code !== "ambiguous_dates" && (
        <p className="error-text" role="alert" data-testid="csv-error">
          {parsed.error.code === "empty_file"
            ? t("data.b.error.empty_file")
            : parsed.error.code === "missing_columns"
              ? t("data.b.error.missing_columns", { columns: String(parsed.error.params?.columns ?? "") })
              : t("data.b.error.read")}
        </p>
      )}

      {parsed?.ok && (
        <>
          <p style={{ margin: 0 }} data-testid="csv-summary">
            <strong>{t("data.b.rows", { n: parsed.rows.length })}</strong>
            {parsed.skipped.length > 0 && <> · {t("data.b.skipped", { n: parsed.skipped.length })}</>}
          </p>
          {parsed.ignoredColumns.length > 0 && <p className="small muted" style={{ margin: 0 }}>{t("data.b.ignored", { cols: parsed.ignoredColumns.join(", ") })}</p>}
          <h4 style={{ fontSize: "1rem", margin: "4px 0" }}>{t("data.b.preview")}</h4>
          <div className="table-wrap" role="region" tabIndex={0} aria-label={t("data.b.preview")}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("data.b.col.checkin")}</th>
                  <th>{t("data.b.col.checkout")}</th>
                  <th>{t("data.b.col.nights")}</th>
                  <th>{t("data.b.col.gross")}</th>
                  <th>{t("data.b.col.fee")}</th>
                  <th>{t("data.b.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{formatDate(r.checkin, lang)}</td>
                    <td>{formatDate(r.checkout, lang)}</td>
                    <td className="num">{r.nights}</td>
                    <td className="num">{formatMoney(r.grossMinor, r.currency, lang)}</td>
                    <td className="num">{formatMoney(r.hostFeeMinor, r.currency, lang)}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button type="button" className="btn btn-primary" disabled={busy || parsed.rows.length === 0} onClick={() => void submit(parsed.rows, parsed.skipped.length)} data-testid="csv-submit">
              {busy ? t("data.b.submitting") : t("data.b.submit")}
            </button>
          </div>
        </>
      )}
      {checks && <ChecksClient checks={checks} />}
    </section>
  );
}
