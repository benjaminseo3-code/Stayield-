import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/adapters";
import type { Db } from "@/db/client";
import { properties, type Property } from "@/db/schema";
import { canEditProperty } from "@/lib/policies";
import type { SessionUser } from "@/ports/auth";

export async function currentUser(): Promise<SessionUser | null> {
  return auth.getSession(await headers());
}

/** Redirects to sign-in when there is no session. */
export async function requireUser(next = "/"): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireSeller(next = "/sell"): Promise<SessionUser> {
  const user = await requireUser(next);
  if (user.role === "buyer") redirect("/sell");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Loads a property the user may edit, or null (indistinguishable from "not found"). */
export async function loadEditableProperty(db: Db, user: Pick<SessionUser, "id" | "role">, id: string): Promise<Property | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!p || !canEditProperty(user, p)) return null;
  return p;
}


