import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { verifiedEmails } from "@/db/schema";
import { hashToken } from "@/lib/ids";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = new URL(req.url);
  const token = base.searchParams.get("token") ?? "";
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(base.pathname + base.search)}`, base));

  const db = await getDb();
  const [row] = token
    ? await db
        .select()
        .from(verifiedEmails)
        .where(and(eq(verifiedEmails.verifyTokenHash, hashToken(token)), eq(verifiedEmails.userId, user.id), gt(verifiedEmails.verifyExpiresAt, new Date())))
        .limit(1)
    : [];
  // Fail closed: the link must belong to the signed-in account and be unexpired.
  if (!row) return NextResponse.redirect(new URL("/account?verifyError=1", base));
  await db.update(verifiedEmails).set({ verifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null }).where(eq(verifiedEmails.id, row.id));
  return NextResponse.redirect(new URL(`/account?verified=${encodeURIComponent(row.email)}`, base));
}
