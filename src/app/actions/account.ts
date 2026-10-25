"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMailer, getStorage } from "@/adapters";
import { getDb } from "@/db/client";
import { auditLog, properties, users, verifiedEmails } from "@/db/schema";
import { config } from "@/lib/config";
import { deleteAllPhotos } from "@/lib/photo-service";
import { hashToken, randomToken } from "@/lib/ids";
import { requireUser } from "@/lib/session";

const VERIFY_TTL_MS = 24 * 3600_000;

export async function addVerifiedEmail(formData: FormData) {
  const user = await requireUser("/account");
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  if (!parsed.success) redirect("/account?emailError=1");
  const email = parsed.data;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(verifiedEmails)
    .where(and(eq(verifiedEmails.userId, user.id), eq(verifiedEmails.email, email)))
    .limit(1);
  if (existing?.verifiedAt) redirect(`/account?verified=${encodeURIComponent(email)}`);

  const token = randomToken(32);
  const values = { verifyTokenHash: hashToken(token), verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS) };
  if (existing) await db.update(verifiedEmails).set(values).where(eq(verifiedEmails.id, existing.id));
  else await db.insert(verifiedEmails).values({ userId: user.id, email, ...values });

  const link = `${config.appUrl()}/account/verify-email?token=${token}`;
  await getMailer().send({
    to: email,
    subject: "Verify your email for Stayield · אימות כתובת מייל ב-Stayield",
    text: `Verify this email address for your Stayield account:\n${link}\n\nאימות כתובת המייל לחשבון Stayield שלך:\n${link}\n\nThe link expires in 24 hours.`,
  });
  revalidatePath("/account");
  redirect(`/account?sent=${encodeURIComponent(email)}`);
}

export async function removeVerifiedEmail(formData: FormData) {
  const user = await requireUser("/account");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const db = await getDb();
  const [row] = await db.select().from(verifiedEmails).where(and(eq(verifiedEmails.id, id.data), eq(verifiedEmails.userId, user.id))).limit(1);
  // The address you signed in with stays verified.
  if (!row || row.email === user.email.toLowerCase()) return;
  await db.delete(verifiedEmails).where(eq(verifiedEmails.id, row.id));
  revalidatePath("/account");
}

export async function becomeSeller() {
  const user = await requireUser("/sell");
  if (user.role === "buyer") {
    const db = await getDb();
    await db.update(users).set({ role: "seller" }).where(eq(users.id, user.id));
    await db.insert(auditLog).values({ actorId: user.id, action: "user.become_seller", entityType: "user", entityId: user.id });
  }
  redirect("/sell");
}

/** Permanently deletes the user's listings, photos and income data. Purchases are kept for accounting. */
export async function deleteMyData(formData: FormData) {
  const user = await requireUser("/account");
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") redirect("/account?deleteError=1");
  const db = await getDb();
  const mine = await db.select({ id: properties.id }).from(properties).where(eq(properties.ownerId, user.id));
  const storage = getStorage();
  for (const p of mine) {
    await deleteAllPhotos(storage, p.id);
    await storage.deletePrefix(`private/properties/${p.id}`);
  }
  // Cascades remove photos, submissions, reservations, aggregates, unlocks, consents and inbound addresses.
  await db.delete(properties).where(eq(properties.ownerId, user.id));
  await db.insert(auditLog).values({ actorId: user.id, action: "user.delete_data", entityType: "user", entityId: user.id, meta: { properties: mine.length } });
  redirect("/account?deleted=1");
}
