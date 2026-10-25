"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLog, properties } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

type Decision = "approve" | "reject" | "unpublish" | "republish";

export async function moderate(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  const decision = z.enum(["approve", "reject", "unpublish", "republish"]).safeParse(formData.get("decision"));
  if (!id.success || !decision.success) return;
  const db = await getDb();
  const [p] = await db.select().from(properties).where(eq(properties.id, id.data)).limit(1);
  if (!p) return;

  const d: Decision = decision.data;
  if (d === "approve" || d === "republish") {
    await db
      .update(properties)
      .set({
        status: "live",
        publishedAt: p.publishedAt ?? new Date(),
        // Approval clears the blocking reasons; informational warnings stay visible to buyers.
        reviewReasons: p.reviewReasons.filter((r) => r.level !== "fail"),
      })
      .where(eq(properties.id, p.id));
  } else if (d === "reject") {
    await db
      .update(properties)
      .set({ status: "data_pending", reviewReasons: [...p.reviewReasons, { code: "admin_rejected", level: "fail" as const }] })
      .where(eq(properties.id, p.id));
  } else {
    await db.update(properties).set({ status: "unpublished" }).where(eq(properties.id, p.id));
  }
  await db.insert(auditLog).values({ actorId: admin.id, action: `admin.${d}`, entityType: "property", entityId: p.id, meta: { from: p.status } });
  revalidatePath("/admin");
  revalidatePath("/properties");
}
