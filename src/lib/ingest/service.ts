import { and, desc, eq } from "drizzle-orm";
import dns from "node:dns/promises";
import { simpleParser } from "mailparser";
import { z } from "zod";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import type { StorageAdapter } from "@/ports/storage";
import { config } from "@/lib/config";
import { incomeBand } from "@/lib/metrics/band";
import { aggregateMonthly, coverageOf } from "./aggregate";
import { outcomeOf, runReliabilityChecks } from "./checks";
import { verifyForwardedReport, type DNSResolver } from "./email";
import { hashConfirmation } from "./hash";
import type { Check, NormalizedReservation, ParseIssue } from "./types";

export type IngestOutcome = "live" | "review" | "needs_csv" | "failed";

type PersistInput = {
  property: Pick<s.Property, "id" | "ownerId" | "activeSubmissionId">;
  source: "signed_email" | "csv_upload";
  tier: "signed_email" | "self_reported";
  outcome: IngestOutcome;
  checks: Check[];
  rows?: NormalizedReservation[];
  now: Date;
  rawSha256?: string;
  evidence?: { headers: string; dkim?: { domain: string; selector: string; result: string } };
  storage?: StorageAdapter;
};

const levelWeight = { fail: 0, warn: 1, pass: 2 } as const;

/** Stores one submission and, when it produced data, replaces the property's reservations and aggregates. */
export async function persistSubmission(db: Db, input: PersistInput): Promise<{ submissionId: string }> {
  const { property, outcome, now } = input;
  const status: s.DataSubmission["status"] = outcome === "live" ? "verified" : outcome === "failed" ? "failed" : "flagged";

  const submissionId = await db.transaction(async (tx) => {
    const [sub] = await tx
      .insert(s.dataSubmissions)
      .values({
        propertyId: property.id,
        source: input.source,
        trustTier: input.tier,
        rawSha256: input.rawSha256 ?? null,
        status,
        verificationResult: {
          checks: input.checks,
          outcome: outcome === "needs_csv" ? "failed" : outcome,
          verifiedAt: now.toISOString(),
          dkim: input.evidence?.dkim,
        },
      })
      .returning({ id: s.dataSubmissions.id });

    const hasData = !!input.rows && (outcome === "live" || outcome === "review");
    if (hasData) {
      const rows = input.rows!;
      // Replace previous data: reservations hold nothing guest-related, but we still keep only what is current.
      await tx.delete(s.reservations).where(eq(s.reservations.propertyId, property.id));
      await tx.delete(s.monthlyAggregates).where(eq(s.monthlyAggregates.propertyId, property.id));

      const key = config.hashKey();
      const occurrences = new Map<string, number>();
      await tx.insert(s.reservations).values(
        rows.map((r) => {
          const n = occurrences.get(r.confirmationCode) ?? 0;
          occurrences.set(r.confirmationCode, n + 1);
          // Duplicate codes are flagged by the checks; suffix keeps the unique index satisfiable.
          const code = n === 0 ? r.confirmationCode : `${r.confirmationCode}#${n}`;
          return {
            propertyId: property.id,
            submissionId: sub.id,
            confirmationHash: hashConfirmation(code, property.id, key),
            checkin: r.checkin,
            checkout: r.checkout,
            nights: r.nights,
            grossMinor: r.grossMinor,
            hostFeeMinor: r.hostFeeMinor,
            netMinor: r.netMinor,
            currency: r.currency,
            status: r.status,
          };
        }),
      );

      const aggs = aggregateMonthly(rows, now);
      if (aggs.length) {
        await tx.insert(s.monthlyAggregates).values(aggs.map((a) => ({ ...a, propertyId: property.id, submissionId: sub.id })));
      }
      const t12 = aggs.slice(-12).reduce((sum, a) => sum + a.grossMinor, 0);
      const band = incomeBand(t12);
      const cov = coverageOf(aggs);
      await tx
        .update(s.properties)
        .set({
          trustTier: input.tier,
          activeSubmissionId: sub.id,
          incomeBandLowMinor: aggs.length ? band.low : null,
          incomeBandHighMinor: aggs.length ? band.high : null,
          coverageStart: cov?.start ?? null,
          coverageEnd: cov?.end ?? null,
          currency: aggs[0]?.currency ?? undefined,
        })
        .where(eq(s.properties.id, property.id));
    }

    // Reasons describe the data currently stored; a rejected later attempt shows via the submission status instead.
    if (hasData || !property.activeSubmissionId) {
      await tx
        .update(s.properties)
        .set({
          reviewReasons: input.checks
            .filter((c) => c.level !== "pass")
            .sort((a, b) => levelWeight[a.level] - levelWeight[b.level])
            .map((c) => ({ code: c.code, level: c.level as "warn" | "fail", params: c.params })),
        })
        .where(eq(s.properties.id, property.id));
    }

    await tx.insert(s.auditLog).values({
      actorId: property.ownerId,
      action: "submission.ingested",
      entityType: "property",
      entityId: property.id,
      meta: { source: input.source, outcome, submissionId: sub.id },
    });
    return sub.id;
  });

  // Evidence: headers of the original message only. Bodies (which carry guest data) are never kept.
  if (input.storage && input.evidence) {
    const key = `private/submissions/${submissionId}/evidence.json`;
    await input.storage.put(key, Buffer.from(JSON.stringify({ headers: input.evidence.headers, dkim: input.evidence.dkim }, null, 2)));
    await db.update(s.dataSubmissions).set({ rawFileKey: key }).where(eq(s.dataSubmissions.id, submissionId));
  }

  await evaluatePropertyStatus(db, property.id, now);
  return { submissionId };
}

/**
 * Moves a property between statuses based on its active submission and the seller's consent.
 *   - no consent yet, or data not usable      -> data_pending
 *   - consent + all checks pass (or warn only) -> live (automatically)
 *   - consent + any failed check               -> review (admin decides)
 * An unpublished listing is never revived automatically.
 */
export async function evaluatePropertyStatus(db: Db, propertyId: string, now = new Date()): Promise<s.Property["status"] | null> {
  const [p] = await db.select().from(s.properties).where(eq(s.properties.id, propertyId)).limit(1);
  if (!p || p.status === "unpublished") return p?.status ?? null;

  // Only the ACTIVE submission (the one whose data is stored) decides visibility. A later failed or
  // incomplete submission must never take down a listing whose current data is fine.
  const [active] = p.activeSubmissionId
    ? await db.select().from(s.dataSubmissions).where(eq(s.dataSubmissions.id, p.activeSubmissionId)).limit(1)
    : [];
  const [consent] = await db.select({ id: s.consents.id }).from(s.consents).where(eq(s.consents.propertyId, propertyId)).limit(1);
  const result = active?.verificationResult?.outcome;
  const usable = result === "live" || result === "review";

  let next: s.Property["status"] = p.status === "draft" ? "data_pending" : p.status;
  if (!active) {
    const [any] = await db.select({ id: s.dataSubmissions.id }).from(s.dataSubmissions).where(eq(s.dataSubmissions.propertyId, propertyId)).limit(1);
    next = any ? "data_pending" : p.status;
  } else if (usable) {
    next = consent ? (result === "live" ? "live" : "review") : "data_pending";
  }

  if (next !== p.status) {
    await db
      .update(s.properties)
      .set({ status: next, publishedAt: next === "live" && !p.publishedAt ? now : p.publishedAt })
      .where(eq(s.properties.id, propertyId));
    await db.insert(s.auditLog).values({ action: "property.status", entityType: "property", entityId: propertyId, meta: { from: p.status, to: next } });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Self-reported CSV path
// ---------------------------------------------------------------------------
const rowSchema = z.object({
  confirmationCode: z.string().min(1).max(64),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.number().int().min(-1000).max(1000),
  grossMinor: z.number().int(),
  hostFeeMinor: z.number().int(),
  netMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["confirmed", "canceled"]),
});
// `.strict()` rejects any extra field (so a client cannot smuggle guest data through).
export const submittedRowsSchema = z.array(rowSchema.strict()).min(1).max(20_000);

/** Entry point for rows cleaned in the browser. Everything is re-validated and re-checked here. */
export async function ingestCleanedRows(
  db: Db,
  args: { propertyId: string; userId: string; rows: unknown; skippedCount?: number; now?: Date },
): Promise<{ ok: true; outcome: IngestOutcome; submissionId: string; checks: Check[] } | { ok: false; error: string }> {
  const now = args.now ?? new Date();
  const [property] = await db.select().from(s.properties).where(eq(s.properties.id, args.propertyId)).limit(1);
  if (!property || property.ownerId !== args.userId) return { ok: false, error: "forbidden" };
  const parsed = submittedRowsSchema.safeParse(args.rows);
  if (!parsed.success) return { ok: false, error: "invalid_rows" };

  const skipped: ParseIssue[] = Array.from({ length: Math.max(0, Math.min(args.skippedCount ?? 0, 100_000)) }, (_, i) => ({ line: i, code: "skipped_in_browser" }));
  const checks = runReliabilityChecks(parsed.data, skipped, now);
  const outcome = outcomeOf(checks);
  const { submissionId } = await persistSubmission(db, { property, source: "csv_upload", tier: "self_reported", outcome, checks, rows: parsed.data, now });
  return { ok: true, outcome, submissionId, checks };
}

// ---------------------------------------------------------------------------
// Inbound email path
// ---------------------------------------------------------------------------
export type InboundResult =
  | { status: "rejected"; reason: "unknown_address" | "unreadable" }
  | { status: "processed"; propertyId: string; submissionId: string | null; outcome: IngestOutcome; checks: Check[] };

const realResolver: DNSResolver = (name, rr) => dns.resolve(name, rr as "TXT") as Promise<string[][]>;

export async function ingestInboundEmail(
  db: Db,
  args: { raw: Buffer; storage?: StorageAdapter; now?: Date; resolver?: DNSResolver; inboundDomain?: string; trustedDomains?: string[] },
): Promise<InboundResult> {
  const now = args.now ?? new Date();
  const domain = (args.inboundDomain ?? config.inboundDomain()).toLowerCase();

  let outerTo: string[];
  try {
    const outer = await simpleParser(args.raw);
    const to = Array.isArray(outer.to) ? outer.to : outer.to ? [outer.to] : [];
    outerTo = to.flatMap((t) => t.value.map((v) => (v.address ?? "").toLowerCase()));
  } catch {
    return { status: "rejected", reason: "unreadable" };
  }

  const token = outerTo.map((a) => new RegExp(`^p-([a-z0-9]+)@${domain.replace(/\./g, "\\.")}$`).exec(a)?.[1]).find(Boolean);
  if (!token) return { status: "rejected", reason: "unknown_address" };

  const [addr] = await db
    .select()
    .from(s.inboundAddresses)
    .where(and(eq(s.inboundAddresses.token, token), eq(s.inboundAddresses.active, true)))
    .limit(1);
  if (!addr) return { status: "rejected", reason: "unknown_address" };

  const [property] = await db.select().from(s.properties).where(eq(s.properties.id, addr.propertyId)).limit(1);
  if (!property) return { status: "rejected", reason: "unknown_address" };

  const emails = await db
    .select({ email: s.verifiedEmails.email, verifiedAt: s.verifiedEmails.verifiedAt })
    .from(s.verifiedEmails)
    .where(eq(s.verifiedEmails.userId, property.ownerId));
  const sellerEmails = emails.filter((e) => e.verifiedAt).map((e) => e.email);

  const result = await verifyForwardedReport({
    outerRaw: args.raw,
    now,
    trustedDomains: args.trustedDomains ?? config.trustedSenderDomains(),
    resolver: args.resolver ?? realResolver,
    sellerEmails,
    isSeen: async (sha) => {
      const rows = await db.select({ id: s.dataSubmissions.id }).from(s.dataSubmissions).where(eq(s.dataSubmissions.rawSha256, sha)).limit(1);
      return rows.length > 0;
    },
  });

  // A failed or duplicate message is recorded as a failed submission (without a hash, so a corrected
  // resend of the same original is not blocked by a message we rejected).
  const duplicate = result.checks.some((c) => c.code === "not_seen_before" && c.level === "fail");
  if (duplicate) {
    return { status: "processed", propertyId: property.id, submissionId: null, outcome: "failed", checks: result.checks };
  }
  const { submissionId } = await persistSubmission(db, {
    property,
    source: "signed_email",
    tier: "signed_email",
    outcome: result.outcome,
    checks: result.checks,
    rows: result.rows,
    now,
    rawSha256: result.outcome === "failed" ? undefined : result.innerSha256,
    evidence: result.evidenceHeaders ? { headers: result.evidenceHeaders, dkim: result.dkim } : undefined,
    storage: args.storage,
  });
  return { status: "processed", propertyId: property.id, submissionId, outcome: result.outcome, checks: result.checks };
}

/** Latest submission state for the seller's live status display. */
export async function latestSubmissionStatus(db: Db, propertyId: string) {
  const [row] = await db
    .select({ id: s.dataSubmissions.id, source: s.dataSubmissions.source, status: s.dataSubmissions.status, result: s.dataSubmissions.verificationResult, at: s.dataSubmissions.createdAt })
    .from(s.dataSubmissions)
    .where(eq(s.dataSubmissions.propertyId, propertyId))
    .orderBy(desc(s.dataSubmissions.createdAt))
    .limit(1);
  return row ?? null;
}

