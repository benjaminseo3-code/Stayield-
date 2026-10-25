import { createHash } from "node:crypto";
import { dkimVerify, type DNSResolver } from "mailauth";
import { simpleParser, type ParsedMail, type Attachment } from "mailparser";
import { parseReportCsv } from "./parse-report";
import { runReliabilityChecks, outcomeOf } from "./checks";
import type { Check, NormalizedReservation, ParseIssue } from "./types";
import type { ColumnMapping } from "./csv-mapping";

export type { DNSResolver };

const MAX_AGE_MS = 7 * 86_400_000;
const MAX_FUTURE_MS = 3_600_000;
/** Headers that must be covered by the signature for the report to be bound to this seller and moment. */
const REQUIRED_SIGNED_HEADERS = ["from", "date", "to"] as const;

export type EmailVerifyInput = {
  /** The complete message as received (outer, forwarded-as-attachment). */
  outerRaw: Buffer;
  now: Date;
  trustedDomains: string[];
  /** DNS resolver, injectable so tests never touch the network. */
  resolver: DNSResolver;
  /** Verified email addresses of the property's owner. */
  sellerEmails: string[];
  isSeen: (sha256: string) => Promise<boolean>;
  mapping?: ColumnMapping;
};

export type EmailVerifyResult = {
  /**
   * live/review: data accepted as `signed_email` (review when reliability checks failed).
   * needs_csv: the email is genuine but carries no CSV (e.g. a download link) so no data was read.
   * failed: signature/binding checks failed; nothing is stored.
   */
  outcome: "live" | "review" | "needs_csv" | "failed";
  checks: Check[];
  dkim?: { domain: string; selector: string; result: string };
  innerSha256?: string;
  /** Headers of the original message only (no body), safe to keep as evidence. */
  evidenceHeaders?: string;
  rows?: NormalizedReservation[];
  skipped?: ParseIssue[];
};

const domainOf = (addr: string) => addr.slice(addr.lastIndexOf("@") + 1).toLowerCase();
const inDomain = (domain: string, root: string) => domain === root || domain.endsWith(`.${root}`);
const fail = (checks: Check[], extra: Partial<EmailVerifyResult> = {}): EmailVerifyResult => ({ outcome: "failed", checks, ...extra });

function headerBlock(raw: Buffer): string {
  const s = raw.toString("latin1");
  const i = s.search(/\r?\n\r?\n/);
  return (i < 0 ? s : s.slice(0, i)).trim();
}

function findCsv(mail: ParsedMail): Attachment | undefined {
  return mail.attachments.find(
    (a) => /csv/i.test(a.contentType) || /\.csv$/i.test(a.filename ?? "") || (/^text\/plain/i.test(a.contentType) && /\.csv$/i.test(a.filename ?? "")),
  );
}

export async function verifyForwardedReport(input: EmailVerifyInput): Promise<EmailVerifyResult> {
  const checks: Check[] = [];

  // 1. The seller must forward the ORIGINAL message as an attachment (a plain forward breaks the signature).
  let outer: ParsedMail;
  try {
    outer = await simpleParser(input.outerRaw);
  } catch {
    return fail([{ code: "message_readable", level: "fail" }]);
  }
  const inner = outer.attachments.find((a) => /^message\/rfc822$/i.test(a.contentType));
  if (!inner) return fail([{ code: "forwarded_as_attachment", level: "fail" }]);
  checks.push({ code: "forwarded_as_attachment", level: "pass" });

  const innerRaw = Buffer.from(inner.content);
  const innerSha256 = createHash("sha256").update(innerRaw).digest("hex");
  const evidenceHeaders = headerBlock(innerRaw);

  // 2. Never ingest the same original message twice.
  if (await input.isSeen(innerSha256)) {
    return fail([...checks, { code: "not_seen_before", level: "fail" }], { innerSha256 });
  }
  checks.push({ code: "not_seen_before", level: "pass" });

  // 3. DKIM, verified now against live DNS (keys rotate, so we never re-verify later).
  let dkim;
  try {
    dkim = await dkimVerify(innerRaw, { resolver: input.resolver, curTime: input.now });
  } catch {
    return fail([...checks, { code: "dkim_valid", level: "fail" }], { innerSha256, evidenceHeaders });
  }
  const passing = dkim.results.filter((r) => r.status.result === "pass");
  const fromAddrs = dkim.headerFrom;
  const fromDomain = fromAddrs.length === 1 ? domainOf(fromAddrs[0]) : "";
  const trusted = input.trustedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);

  if (passing.length === 0) {
    const first = dkim.results[0];
    return fail([...checks, { code: "dkim_valid", level: "fail", params: { reason: first?.status.comment ?? first?.status.result ?? "no signature" } }], {
      innerSha256,
      evidenceHeaders,
    });
  }
  checks.push({ code: "dkim_valid", level: "pass" });

  // 4. The signing domain must be trusted AND aligned with the visible From domain. Fail closed if no list is configured.
  const sig = passing.find((r) => {
    const d = (r.signingDomain ?? "").toLowerCase();
    const aligned = !!fromDomain && (fromDomain === d || fromDomain.endsWith(`.${d}`) || d.endsWith(`.${fromDomain}`));
    return aligned && trusted.some((t) => inDomain(d, t)) && trusted.some((t) => inDomain(fromDomain, t));
  });
  if (!sig) {
    return fail([...checks, { code: "sender_trusted", level: "fail", params: { domain: fromDomain || "?" } }], {
      innerSha256,
      evidenceHeaders,
      dkim: { domain: passing[0].signingDomain ?? "", selector: passing[0].selector ?? "", result: "pass" },
    });
  }
  checks.push({ code: "sender_trusted", level: "pass", params: { domain: sig.signingDomain ?? "" } });
  const dkimInfo = { domain: sig.signingDomain ?? "", selector: sig.selector ?? "", result: "pass" };

  // 5. From/Date/To must be inside the signature, and the whole body must be covered (no l= truncation).
  const signedKeys = (sig.signingHeaders?.keys ?? "").toLowerCase().split(":").map((s) => s.trim());
  const missingHeaders = REQUIRED_SIGNED_HEADERS.filter((h) => !signedKeys.includes(h));
  checks.push(missingHeaders.length ? { code: "headers_signed", level: "fail", params: { missing: missingHeaders.join(", ") } } : { code: "headers_signed", level: "pass" });
  const unsigned = sig.status.underSized ?? 0;
  checks.push(unsigned > 0 ? { code: "body_fully_signed", level: "fail", params: { bytes: unsigned } } : { code: "body_fully_signed", level: "pass" });

  // 6. Parse the original message to bind it to this seller and this week.
  let orig: ParsedMail;
  try {
    orig = await simpleParser(innerRaw);
  } catch {
    return fail([...checks, { code: "message_readable", level: "fail" }], { innerSha256, evidenceHeaders, dkim: dkimInfo });
  }

  const age = orig.date ? input.now.getTime() - orig.date.getTime() : NaN;
  checks.push(
    Number.isFinite(age) && age <= MAX_AGE_MS && age >= -MAX_FUTURE_MS
      ? { code: "date_fresh", level: "pass" }
      : { code: "date_fresh", level: "fail", params: { days: Number.isFinite(age) ? Math.round(age / 86_400_000) : -1 } },
  );

  const recipients = (Array.isArray(orig.to) ? orig.to : orig.to ? [orig.to] : []).flatMap((t) => t.value.map((v) => (v.address ?? "").toLowerCase()));
  const sellerSet = new Set(input.sellerEmails.map((e) => e.toLowerCase()));
  checks.push(recipients.some((r) => sellerSet.has(r)) ? { code: "recipient_matches_seller", level: "pass" } : { code: "recipient_matches_seller", level: "fail" });

  if (checks.some((c) => c.level === "fail")) return fail(checks, { innerSha256, evidenceHeaders, dkim: dkimInfo });

  // 7. Read the CSV from the signed body.
  const csv = findCsv(orig);
  if (!csv) {
    const hasLink = /https?:\/\//i.test(`${orig.text ?? ""} ${typeof orig.html === "string" ? orig.html : ""}`);
    return {
      outcome: "needs_csv",
      checks: [...checks, { code: "attachment_present", level: "warn", params: { kind: hasLink ? "link" : "none" } }],
      dkim: dkimInfo,
      innerSha256,
      evidenceHeaders,
    };
  }
  checks.push({ code: "attachment_present", level: "pass" });

  const parsed = parseReportCsv(csv.content.toString("utf8"), { mapping: input.mapping });
  if (!parsed.ok) {
    return fail([...checks, { code: `csv_${parsed.error.code}`, level: "fail", params: parsed.error.params }], { innerSha256, evidenceHeaders, dkim: dkimInfo });
  }
  const reliability = runReliabilityChecks(parsed.rows, parsed.skipped, input.now);
  const all = [...checks, ...reliability];
  return {
    outcome: outcomeOf(reliability),
    checks: all,
    dkim: dkimInfo,
    innerSha256,
    evidenceHeaders,
    rows: parsed.rows,
    skipped: parsed.skipped,
  };
}

export function parseTrustedDomains(value: string | undefined): string[] {
  return (value ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
