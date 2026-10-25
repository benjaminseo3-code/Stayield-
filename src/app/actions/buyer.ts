"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMailer, getPaymentProvider } from "@/adapters";
import { getDb } from "@/db/client";
import { auditLog, introRequests, payments, properties, savedProperties } from "@/db/schema";
import { config } from "@/lib/config";
import { createPendingPayment, settlePayment } from "@/lib/payments";
import { hasUnlock } from "@/lib/data/report";
import { requireUser } from "@/lib/session";

const uuid = z.string().uuid();

export async function startUnlock(formData: FormData) {
  const id = uuid.safeParse(formData.get("propertyId"));
  if (!id.success) redirect("/properties");
  const db = await getDb();
  const [p] = await db.select({ slug: properties.publicSlug }).from(properties).where(eq(properties.id, id.data)).limit(1);
  if (!p) redirect("/properties");
  const user = await requireUser(`/properties/${p.slug}`);

  const provider = getPaymentProvider();
  const start = await createPendingPayment(db, user, id.data, {
    provider: provider.name,
    amountMinor: config.unlockPriceMinor(),
    currency: config.unlockCurrency(),
  });
  if (!start.ok) redirect(`/properties/${p.slug}`);
  if (start.alreadyUnlocked) redirect(`/properties/${p.slug}`);

  const base = config.appUrl();
  const session = await provider.createCheckout({
    paymentId: start.paymentId,
    buyerEmail: user.email,
    propertyId: id.data,
    propertyLabel: `Stayield income report · ${p.slug}`,
    amountMinor: config.unlockPriceMinor(),
    currency: config.unlockCurrency(),
    successUrl: `${base}/checkout/result?payment=${start.paymentId}`,
    cancelUrl: `${base}/properties/${p.slug}`,
  });
  await db.update(payments).set({ providerRef: session.providerRef }).where(eq(payments.id, start.paymentId));
  redirect(session.redirectUrl);
}

/** Dev-only "pay" button of the mock provider. Only the buyer who owns the payment can settle it. */
export async function completeMockPayment(formData: FormData) {
  const paymentId = uuid.safeParse(formData.get("paymentId"));
  if (!paymentId.success) redirect("/properties");
  const user = await requireUser("/properties");
  const db = await getDb();
  const [pay] = await db.select().from(payments).where(eq(payments.id, paymentId.data)).limit(1);
  if (!pay || pay.buyerId !== user.id || pay.provider !== "mock") redirect("/properties");
  const outcome = formData.get("outcome") === "fail" ? "failed" : "succeeded";
  await settlePayment(db, pay.id, outcome, pay.providerRef ?? undefined);
  redirect(`/checkout/result?payment=${pay.id}`);
}

export async function toggleSave(formData: FormData) {
  const id = uuid.safeParse(formData.get("propertyId"));
  if (!id.success) return;
  const db = await getDb();
  const [p] = await db.select({ slug: properties.publicSlug, status: properties.status }).from(properties).where(eq(properties.id, id.data)).limit(1);
  if (!p || p.status !== "live") return;
  const user = await requireUser(`/properties/${p.slug}`);
  const [existing] = await db.select({ id: savedProperties.id }).from(savedProperties).where(and(eq(savedProperties.buyerId, user.id), eq(savedProperties.propertyId, id.data))).limit(1);
  if (existing) await db.delete(savedProperties).where(eq(savedProperties.id, existing.id));
  else await db.insert(savedProperties).values({ buyerId: user.id, propertyId: id.data });
  revalidatePath(`/properties/${p.slug}`);
  revalidatePath("/account");
}

/** "Request introduction": stored and emailed to the admin. There is no chat. Only after unlocking. */
export async function requestIntro(formData: FormData) {
  const id = uuid.safeParse(formData.get("propertyId"));
  const message = z.string().max(2000).safeParse(String(formData.get("message") ?? ""));
  if (!id.success || !message.success) return;
  const db = await getDb();
  const [p] = await db.select({ slug: properties.publicSlug, ownerId: properties.ownerId }).from(properties).where(eq(properties.id, id.data)).limit(1);
  if (!p) return;
  const user = await requireUser(`/properties/${p.slug}`);
  if (!(await hasUnlock(db, user, id.data))) redirect(`/properties/${p.slug}`);

  await db.insert(introRequests).values({ buyerId: user.id, propertyId: id.data, message: message.data });
  await db.insert(auditLog).values({ actorId: user.id, action: "intro.requested", entityType: "property", entityId: id.data });
  const admin = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  if (admin) {
    await getMailer().send({
      to: admin,
      subject: `Introduction request · ${p.slug}`,
      text: `Buyer ${user.email} asked for an introduction to listing ${p.slug}.\n\nMessage:\n${message.data || "(none)"}\n`,
    });
  }
  redirect(`/properties/${p.slug}?intro=sent`);
}
