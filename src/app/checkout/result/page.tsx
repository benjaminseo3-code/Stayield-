import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { payments, properties } from "@/db/schema";
import { getT } from "@/i18n/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Result({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { t } = await getT();
  const { payment } = await searchParams;
  const user = await requireUser("/account");
  if (!payment || !/^[0-9a-f-]{36}$/i.test(payment)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ status: payments.status, buyerId: payments.buyerId, slug: properties.publicSlug })
    .from(payments)
    .innerJoin(properties, eq(properties.id, payments.propertyId))
    .where(eq(payments.id, payment))
    .limit(1);
  if (!row || row.buyerId !== user.id) notFound();
  const ok = row.status === "succeeded";
  return (
    <div className="section">
      <div className="container narrow">
        <div className="card card-pad stack" role="status" data-testid="checkout-result" data-status={row.status}>
          <h1 style={{ fontSize: "2rem" }}>{t("checkout.title")}</h1>
          <p className={`notice ${ok ? "ok" : row.status === "pending" ? "" : "error"}`}>
            {ok ? t("checkout.success") : row.status === "pending" ? t("checkout.cancelled") : t("checkout.failed")}
          </p>
          <Link className="btn btn-primary" href={`/properties/${row.slug}`}>
            {t("checkout.openReport")}
          </Link>
        </div>
      </div>
    </div>
  );
}
