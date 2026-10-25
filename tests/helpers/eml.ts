import { generateKeyPairSync } from "node:crypto";
import { dkimSign, type DNSResolver } from "mailauth";

/** A locally generated RSA key and a resolver that serves its public half. No network involved. */
export function makeDkimKey(domain: string, selector: string) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pubDer = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const records: Record<string, string[][]> = {
    [`${selector}._domainkey.${domain}`]: [[`v=DKIM1; k=rsa; p=${pubDer}`]],
  };
  const resolver: DNSResolver = async (name, rr) => {
    if (rr.toUpperCase() === "TXT" && records[name.toLowerCase()]) return records[name.toLowerCase()];
    const err = new Error(`ENOTFOUND ${name}`) as NodeJS.ErrnoException;
    err.code = "ENOTFOUND";
    throw err;
  };
  return { privateKey: pem, resolver, domain, selector };
}

const wrap = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");
const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");

export type InnerOpts = {
  from?: string;
  to?: string;
  date?: Date;
  subject?: string;
  csv?: string | null;
  linkOnly?: boolean;
  headerList?: string;
  maxBodyLength?: number;
};

/** An original "report" message as the platform would send it (SYNTHETIC), DKIM-signed. */
export async function buildSignedOriginal(key: ReturnType<typeof makeDkimKey>, o: InnerOpts = {}): Promise<string> {
  const boundary = "----=_Part_synthetic_1";
  const headers = [
    `From: Reports <${o.from ?? `noreply@${key.domain}`}>`,
    `To: ${o.to ?? "seller@example.test"}`,
    `Subject: ${o.subject ?? "Your earnings report (synthetic)"}`,
    `Date: ${(o.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@${key.domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n");
  const parts: string[] = [
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${o.linkOnly ? "Download your report: https://example.test/download/abc" : "Your report is attached."}\r\n`,
  ];
  if (o.csv) {
    parts.push(
      `--${boundary}\r\nContent-Type: text/csv; name="report.csv"\r\nContent-Disposition: attachment; filename="report.csv"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(Buffer.from(o.csv).toString("base64"))}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  const message = `${headers}\r\n\r\n${parts.join("")}`;

  const signed = await dkimSign(message, {
    canonicalization: "relaxed/relaxed",
    headerList: o.headerList ?? "from:to:subject:date:message-id:mime-version:content-type",
    signatureData: [
      { signingDomain: key.domain, selector: key.selector, privateKey: key.privateKey, ...(o.maxBodyLength ? { maxBodyLength: o.maxBodyLength } : {}) },
    ],
  });
  return signed.signatures + message;
}

/** The seller's "forward as attachment" message carrying the original unchanged. */
export function wrapForwarded(original: string, opts: { to: string; from?: string; asInline?: boolean } ): Buffer {
  const boundary = "----=_Outer_1";
  if (opts.asInline) {
    // A plain forward: the original is quoted as text, which breaks the signature.
    return Buffer.from(
      crlf(`From: ${opts.from ?? "seller@example.test"}\nTo: ${opts.to}\nSubject: Fwd: report\nDate: ${new Date().toUTCString()}\nMIME-Version: 1.0\nContent-Type: text/plain\n\n${original}`),
    );
  }
  const body = [
    `From: ${opts.from ?? "seller@example.test"}`,
    `To: ${opts.to}`,
    "Subject: Fwd: report",
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Forwarded as attachment.",
    `--${boundary}`,
    'Content-Type: message/rfc822; name="original.eml"',
    'Content-Disposition: attachment; filename="original.eml"',
    "Content-Transfer-Encoding: 7bit",
    "",
    original,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(body);
}
