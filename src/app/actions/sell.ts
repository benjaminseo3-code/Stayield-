"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStorage } from "@/adapters";
import { getDb } from "@/db/client";
import { auditLog, consents, inboundAddresses, properties } from "@/db/schema";
import { randomToken, slugify } from "@/lib/ids";
import { evaluatePropertyStatus } from "@/lib/ingest/service";
import { deleteAllPhotos } from "@/lib/photo-service";
import { canSell } from "@/lib/policies";
import { loadEditableProperty, requireSeller, requireUser } from "@/lib/session";

export async function createListing() {
  const user = await requireSeller("/sell");
  if (!canSell(user)) redirect("/sell");
  const db = await getDb();
  const [p] = await db
    .insert(properties)
    .values({ ownerId: user.id, publicSlug: `draft-${randomToken(10)}`, status: "draft" })
    .returning({ id: properties.id });
  await db.insert(inboundAddresses).values({ propertyId: p.id, token: randomToken(12) });
  await db.insert(auditLog).values({ actorId: user.id, action: "property.created", entityType: "property", entityId: p.id });
  redirect(`/sell/${p.id}/basics`);
}

const basicsSchema = z.object({
  country: z.string().trim().max(2).regex(/^([A-Za-z]{2})?$/),
  city: z.string().trim().max(80),
  neighborhood: z.string().trim().max(80),
  askingPrice: z.number().min(0).max(1e10).nullable(),
  currency: z.enum(["USD", "EUR", "GBP", "ILS"]),
  sqm: z.number().int().min(0).max(100000).nullable(),
  bedrooms: z.number().int().min(0).max(50).nullable(),
  bathrooms: z.number().int().min(0).max(50).nullable(),
  description: z.string().max(5000),
  originalListingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "url"),
});
export type BasicsInput = z.input<typeof basicsSchema>;

/** Autosave target for the basics step. Returns field errors instead of throwing so the form can show them. */
export async function saveBasics(propertyId: string, input: BasicsInput): Promise<{ ok: true } | { ok: false; fields: string[] }> {
  const user = await requireUser("/sell");
  const db = await getDb();
  const property = await loadEditableProperty(db, user, propertyId);
  if (!property) return { ok: false, fields: ["property"] };
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  const d = parsed.data;
  await db
    .update(properties)
    .set({
      country: d.country.toUpperCase(),
      city: d.city,
      neighborhood: d.neighborhood,
      askingPriceMinor: d.askingPrice == null ? null : Math.round(d.askingPrice * 100),
      currency: d.currency,
      sqm: d.sqm,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      description: d.description,
      originalListingUrl: d.originalListingUrl === "" ? null : d.originalListingUrl,
      wizardStep: Math.max(property.wizardStep, 2),
    })
    .where(eq(properties.id, propertyId));
  return { ok: true };
}

export type PublishResult =
  | { ok: true; status: "live" | "review" | "data_pending"; slug: string }
  | { ok: false; error: "consent" | "no_data" | "incomplete" | "forbidden" };

export async function publishProperty(propertyId: string, accepted: string[]): Promise<PublishResult> {
  const user = await requireUser("/sell");
  const db = await getDb();
  const property = await loadEditableProperty(db, user, propertyId);
  if (!property) return { ok: false, error: "forbidden" };

  const required = ["owns", "shares_aggregates", "complete_data"];
  if (!required.every((r) => accepted.includes(r))) return { ok: false, error: "consent" };
  if (!property.activeSubmissionId) return { ok: false, error: "no_data" };
  if (!property.city || property.askingPriceMinor == null) return { ok: false, error: "incomplete" };

  // A readable public URL, fixed at first publish.
  let slug = property.publicSlug;
  if (slug.startsWith("draft-")) {
    slug = `${slugify([property.city, property.neighborhood].filter(Boolean).join("-")) || "apartment"}-${randomToken(5)}`;
    await db.update(properties).set({ publicSlug: slug }).where(eq(properties.id, propertyId));
  }
  await db.insert(consents).values({ userId: user.id, propertyId, textVersion: "2026-10-v1", accepted: required });
  // A previously unpublished listing is published again by this explicit action.
  if (property.status === "unpublished") await db.update(properties).set({ status: "data_pending" }).where(eq(properties.id, propertyId));
  const status = await evaluatePropertyStatus(db, propertyId);
  await db.update(properties).set({ wizardStep: 5 }).where(eq(properties.id, propertyId));
  revalidatePath("/sell");
  revalidatePath("/properties");
  return { ok: true, status: status === "live" || status === "review" ? status : "data_pending", slug };
}

/** Dashboard: unpublish, or publish again (consent already on record). */
export async function setPublished(formData: FormData) {
  const user = await requireUser("/sell");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const db = await getDb();
  const property = await loadEditableProperty(db, user, id.data);
  if (!property) return;
  if (formData.get("publish") === "1") {
    await db.update(properties).set({ status: "data_pending" }).where(eq(properties.id, property.id));
    await evaluatePropertyStatus(db, property.id);
  } else {
    await db.update(properties).set({ status: "unpublished" }).where(eq(properties.id, property.id));
    await db.insert(auditLog).values({ actorId: user.id, action: "property.unpublished", entityType: "property", entityId: property.id });
  }
  revalidatePath("/sell");
  revalidatePath("/properties");
}

export async function deleteListing(formData: FormData) {
  const user = await requireUser("/sell");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const db = await getDb();
  const property = await loadEditableProperty(db, user, id.data);
  if (!property) return;
  await deleteAllPhotos(getStorage(), property.id);
  await getStorage().deletePrefix(`private/properties/${property.id}`);
  await db.delete(properties).where(and(eq(properties.id, property.id)));
  await db.insert(auditLog).values({ actorId: user.id, action: "property.deleted", entityType: "property", entityId: property.id });
  revalidatePath("/sell");
  revalidatePath("/properties");
}

