"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/adapters";
import { safeNext } from "@/lib/safe-next";

export async function signInAction(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  if (!parsed.success) redirect(`/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  await auth.sendMagicLink(parsed.data, next, await headers());
  redirect(`/sign-in/sent?email=${encodeURIComponent(parsed.data)}`);
}

export async function signOutAction() {
  await auth.signOut(await headers());
  redirect("/");
}

/** Demo deployments only: sign in with the seeded demo credentials. */
export async function passwordSignInAction(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(formData.get("email"));
  const password = z.string().min(1).max(200).safeParse(formData.get("password"));
  if (!email.success || !password.success) redirect(`/sign-in?error=invalid&next=${encodeURIComponent(next)}`);
  const ok = await auth.signInWithPassword(email.data, password.data, await headers());
  if (!ok) redirect(`/sign-in?error=credentials&next=${encodeURIComponent(next)}`);
  redirect(next);
}
