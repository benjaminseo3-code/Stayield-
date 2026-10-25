"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/adapters";
import { enforce } from "@/lib/enforce";
import { clientIp } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(128);

export async function signInAction(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const h = await headers();
  enforce(`signin:${clientIp(h)}`, { limit: 20, windowMs: 10 * 60_000 });
  const e = email.safeParse(formData.get("email"));
  const p = z.string().min(1).max(128).safeParse(formData.get("password"));
  if (!e.success || !p.success) redirect(`/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  if (!(await auth.signInWithPassword(e.data, p.data, h))) redirect(`/sign-in?error=credentials&next=${encodeURIComponent(next)}`);
  redirect(next);
}

/** Creates an investor (role "buyer") or property owner (role "seller") account and signs them in. */
export async function signUpAction(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const h = await headers();
  enforce(`signup:${clientIp(h)}`, { limit: 10, windowMs: 60 * 60_000 });
  const name = z.string().trim().min(2).max(120).safeParse(formData.get("name"));
  const e = email.safeParse(formData.get("email"));
  const p = password.safeParse(formData.get("password"));
  const role = z.enum(["buyer", "seller"]).safeParse(formData.get("role"));
  const back = (error: string) => `/sign-up?error=${error}&role=${role.success ? role.data : "buyer"}&next=${encodeURIComponent(next)}`;
  if (!name.success || !e.success || !role.success) redirect(back("invalid"));
  if (!p.success) redirect(back("password"));
  const res = await auth.signUp({ name: name.data, email: e.data, password: p.data, role: role.data }, h);
  if (!res.ok) redirect(back(res.error));
  // Investors start with their profile; owners go to their listings.
  redirect(role.data === "buyer" ? "/account/verification?welcome=1" : "/sell");
}

export async function signOutAction() {
  await auth.signOut(await headers());
  redirect("/");
}
