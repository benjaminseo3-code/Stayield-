/**
 * Inbound email port. A provider turns its own webhook payload into the raw RFC 822 bytes of the
 * message that reached our inbound domain, which is all the ingestion library needs.
 */
export type InboundMessage = {
  /** The complete message exactly as received (needed for the DKIM body hash). */
  raw: Buffer;
};

export interface InboundEmailProvider {
  readonly name: string;
  parseWebhook(req: Request): Promise<InboundMessage>;
}
