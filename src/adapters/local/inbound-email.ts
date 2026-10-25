import type { InboundEmailProvider, InboundMessage } from "@/ports/inbound-email";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Provider-agnostic inbound adapter. Accepts the raw RFC 822 message as:
 *  - a `message/rfc822` (or octet-stream) request body, or
 *  - multipart/form-data with a `file` part (manual .eml upload in dev), or
 *  - JSON `{ "raw": "<base64>" }`.
 * Real providers (Postmark, Mailgun, SES, ...) get their own adapter that maps their payload here.
 */
export class GenericInboundProvider implements InboundEmailProvider {
  readonly name = "generic";

  async parseWebhook(req: Request): Promise<InboundMessage> {
    const type = (req.headers.get("content-type") ?? "").toLowerCase();
    let raw: Buffer;
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("missing file part");
      raw = Buffer.from(await file.arrayBuffer());
    } else if (type.startsWith("application/json")) {
      const body = (await req.json()) as { raw?: unknown };
      if (typeof body.raw !== "string") throw new Error("missing raw field");
      raw = Buffer.from(body.raw, "base64");
    } else {
      raw = Buffer.from(await req.arrayBuffer());
    }
    if (raw.length === 0) throw new Error("empty message");
    if (raw.length > MAX_BYTES) throw new Error("message too large");
    return { raw };
  }
}
