import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { completeMockPayment } from "@/app/actions/buyer";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MockCheckout({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { t, lang } = await getT();
  const { payment } = await searchParams;
  const user = await requireUser("/properties");
  if (!payment || !/^[0-9a-f-]{36}$/i.test(payment)) notFound();
  const db = await getDb();
  const [pay] = await db.select().from(payments).where(eq(payments.id, payment)).limit(1);
  if (!pay || pay.buyerId !== user.id || pay.provider !== "mock" || pay.status !== "pending") notFound();
  const price = formatMoney(pay.amountMinor, pay.currency, lang);

  return (
    <div className="section">
      <div className="container narrow">
        <div className="card card-pad stack">
          <h1 style={{ fontSize: "2rem" }}>{t("checkout.mock.title")}</h1>
          <p className="muted">{t("checkout.mock.body")}</p>
          <form action={completeMockPayment} className="row">
            <input type="hidden" name="paymentId" value={pay.id} />
            <button className="btn btn-primary lg" type="submit" name="outcome" value="ok" data-testid="mock-pay">
              {t("checkout.mock.pay", { price })}
            </button>
            <button className="btn btn-ghost" type="submit" name="outcome" value="fail">
              {t("checkout.mock.fail")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
