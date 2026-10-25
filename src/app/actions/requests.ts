"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { properties, savedProperties } from "@/db/schema";
import {
  createAccessRequest,
  investorReply,
  investorWithdraw,
  ownerDecide,
  ownerRevoke,
  profileSchema,
  reviewInvestor,
  saveInvestorProfile,
  type Decision,
} from "@/lib/access";
import { enforce } from "@/lib/enforce";
import { safeNext } from "@/lib/safe-next";
import { requireUser } from "@/lib/session";

const uuid = z.string().uuid();
const text = (f: FormDataEntryValue | null) => (typeof f === "string" ? f : "");
const num = (f: FormDataEntryValue | null) => {
  const v = text(f).trim();
  return v === "" || Number.isNaN(Number(v)) ? NaN : Math.round(Number(v));
};

export type ProfileState = { status: "idle" | "saved" | "error" | "suspended"; fields: string[]; next?: string };

/** "Advanced verification": validates and submits the investor profile. */
export async function saveProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser("/account/verification");
  enforce(`profile:${user.id}`, { limit: 30, windowMs: 3600_000 });
  const parsed = profileSchema.safeParse({
    fullName: text(formData.get("fullName")),
    phone: text(formData.get("phone")),
    investorType: text(formData.get("investorType")),
    entityName: text(formData.get("entityName")),
    country: text(formData.get("country")),
    budgetMin: num(formData.get("budgetMin")),
    budgetMax: num(formData.get("budgetMax")),
    currency: text(formData.get("currency")),
    targetCountries: text(formData.get("targetCountries")),
    experience: text(formData.get("experience")),
    financing: text(formData.get("financing")),
    timeline: text(formData.get("timeline")),
    about: text(formData.get("about")),
    website: text(formData.get("website")),
  });
  if (!parsed.success) return { status: "error", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  const res = await saveInvestorProfile(await getDb(), user, parsed.data);
  if (!res.ok) return { status: res.error === "suspended" ? "suspended" : "error", fields: [] };
  revalidatePath("/account");
  const next = text(formData.get("next"));
  return { status: "saved", fields: [], next: next ? safeNext(next) : undefined };
}

export async function requestAccessAction(formData: FormData) {
  const id = uuid.safeParse(formData.get("propertyId"));
  if (!id.success) redirect("/properties");
  const db = await getDb();
  const [p] = await db.select({ slug: properties.publicSlug }).from(properties).where(eq(properties.id, id.data)).limit(1);
  if (!p) redirect("/properties");
  const user = await requireUser(`/properties/${p.slug}`);
  enforce(`access-request:${user.id}`, { limit: 15, windowMs: 3600_000 });
  const res = await createAccessRequest(db, user, id.data, text(formData.get("message")));
  if (!res.ok) redirect(`/properties/${p.slug}?error=${res.error}`);
  revalidatePath("/requests");
  redirect(`/requests/${res.id}?done=requested`);
}

export async function decideAction(formData: FormData) {
  const id = uuid.safeParse(formData.get("requestId"));
  const decision = z.enum(["approve", "decline", "ask_info"]).safeParse(formData.get("decision"));
  if (!id.success || !decision.success) redirect("/requests");
  const user = await requireUser(`/requests/${id.data}`);
  enforce(`decide:${user.id}`, { limit: 120, windowMs: 3600_000 });
  const res = await ownerDecide(await getDb(), user, id.data, decision.data as Decision, text(formData.get("note")));
  revalidatePath("/requests");
  redirect(`/requests/${id.data}?${res.ok ? `done=${decision.data}` : `error=${res.error}`}`);
}

export async function replyAction(formData: FormData) {
  const id = uuid.safeParse(formData.get("requestId"));
  if (!id.success) redirect("/requests");
  const user = await requireUser(`/requests/${id.data}`);
  enforce(`reply:${user.id}`, { limit: 60, windowMs: 3600_000 });
  const res = await investorReply(await getDb(), user, id.data, text(formData.get("body")));
  revalidatePath("/requests");
  redirect(`/requests/${id.data}?${res.ok ? "done=replied" : `error=${res.error}`}`);
}

export async function withdrawAction(formData: FormData) {
  const id = uuid.safeParse(formData.get("requestId"));
  if (!id.success) redirect("/requests");
  const user = await requireUser(`/requests/${id.data}`);
  const res = await investorWithdraw(await getDb(), user, id.data);
  revalidatePath("/requests");
  redirect(`/requests/${id.data}?${res.ok ? "done=withdrawn" : `error=${res.error}`}`);
}

export async function revokeAction(formData: FormData) {
  const id = uuid.safeParse(formData.get("requestId"));
  if (!id.success) redirect("/requests");
  const user = await requireUser(`/requests/${id.data}`);
  const res = await ownerRevoke(await getDb(), user, id.data);
  revalidatePath("/requests");
  redirect(`/requests/${id.data}?${res.ok ? "done=revoked" : `error=${res.error}`}`);
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

/** Admin: mark an investor profile verified / suspended. */
export async function reviewInvestorAction(formData: FormData) {
  const user = await requireUser("/admin/investors");
  const id = z.string().min(1).max(100).safeParse(formData.get("userId"));
  const status = z.enum(["verified", "suspended", "submitted"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return;
  await reviewInvestor(await getDb(), user, id.data, status.data);
  revalidatePath("/admin/investors");
}
