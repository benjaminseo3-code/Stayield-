import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { addVerifiedEmail, deleteMyData, removeVerifiedEmail } from "@/app/actions/account";
import { signOutAction } from "@/app/actions/auth";
import { getDb } from "@/db/client";
import { payments, properties, savedProperties, verifiedEmails } from "@/db/schema";
import { getT } from "@/i18n/server";
import { formatDate, formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("account.title") };
}
type SP = { sent?: string; verified?: string; verifyError?: string; emailError?: string; deleted?: string; deleteError?: string };

export default async function Account({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, lang } = await getT();
  const user = await requireUser("/account");
  const sp = await searchParams;
  const db = await getDb();
  const emails = await db.select().from(verifiedEmails).where(eq(verifiedEmails.userId, user.id));
  const purchases = await db
    .select({ id: payments.id, slug: properties.publicSlug, city: properties.city, neighborhood: properties.neighborhood, amount: payments.amountMinor, currency: payments.currency, at: payments.completedAt })
    .from(payments)
    .innerJoin(properties, eq(properties.id, payments.propertyId))
    .where(eq(payments.buyerId, user.id))
    .orderBy(desc(payments.createdAt));
  const saved = await db
    .select({ id: savedProperties.id, slug: properties.publicSlug, city: properties.city, neighborhood: properties.neighborhood, status: properties.status })
    .from(savedProperties)
    .innerJoin(properties, eq(properties.id, savedProperties.propertyId))
    .where(eq(savedProperties.buyerId, user.id));

  return (
    <div className="section">
      <div className="container narrow stack" style={{ ["--gap" as string]: "24px" }}>
        <h1>{t("account.title")}</h1>

        <div className="card card-pad stack" style={{ ["--gap" as string]: "8px" }}>
          <p style={{ margin: 0 }}>
            <strong>{t("account.email")}:</strong> <span dir="ltr">{user.email}</span>
          </p>
          <p style={{ margin: 0 }}>
            <strong>{t("account.role")}:</strong> {t(`account.role.${user.role}`)}
          </p>
          <form action={signOutAction}>
            <button className="btn btn-secondary sm" type="submit">
              {t("auth.signOut")}
            </button>
          </form>
        </div>

        <section className="card card-pad stack" aria-labelledby="purchases-h" data-testid="purchases">
          <h2 id="purchases-h" style={{ fontSize: "1.5rem" }}>{t("buyer.purchases")}</h2>
          {purchases.filter((p) => p.at).length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t("buyer.purchases.empty")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {purchases.filter((p) => p.at).map((p) => (
                <li key={p.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <span>
                    {[p.neighborhood, p.city].filter(Boolean).join(", ")} · {formatMoney(p.amount, p.currency, lang)} · {formatDate(p.at!.toISOString().slice(0, 10), lang)}
                  </span>
                  <Link href={`/properties/${p.slug}`}>{t("account.purchases.view")}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad stack" aria-labelledby="saved-h">
          <h2 id="saved-h" style={{ fontSize: "1.5rem" }}>{t("buyer.saved")}</h2>
          {saved.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t("buyer.saved.empty")} <Link href="/properties">{t("buyer.browse")}</Link></p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {saved.map((p) => (
                <li key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <Link href={`/properties/${p.slug}`}>{[p.neighborhood, p.city].filter(Boolean).join(", ")}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad stack" aria-labelledby="senders">
          <h2 id="senders" style={{ fontSize: "1.5rem" }}>
            {t("account.sender.title")}
          </h2>
          <p className="muted">{t("account.sender.desc")}</p>
          {sp.sent && <p className="notice ok" role="status">{t("account.sender.sent", { email: sp.sent })}</p>}
          {sp.verified && <p className="notice ok" role="status">{t("account.sender.confirmed", { email: sp.verified })}</p>}
          {sp.verifyError && <p className="notice error" role="alert">{t("account.sender.invalid")}</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {emails.map((e) => (
              <li key={e.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <span dir="ltr">{e.email}</span>
                <span className="row">
                  <span className={`badge ${e.verifiedAt ? "status-live" : "status-review"}`}>
                    {e.verifiedAt ? t("account.sender.verified") : t("account.sender.pending")}
                  </span>
                  {e.email !== user.email.toLowerCase() && (
                    <form action={removeVerifiedEmail}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn btn-ghost sm" type="submit">
                        {t("account.sender.remove")}
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form action={addVerifiedEmail}>
            <div className="field">
              <label htmlFor="add-email">{t("account.sender.add")}</label>
              <input id="add-email" name="email" type="email" className="input" required autoComplete="off" aria-invalid={sp.emailError ? true : undefined} />
              {sp.emailError && <span className="error-text" role="alert">{t("auth.invalidEmail")}</span>}
            </div>
            <button className="btn btn-primary sm" type="submit">
              {t("account.sender.addButton")}
            </button>
          </form>
        </section>

        {user.role !== "buyer" && (
          <section className="card card-pad stack" aria-labelledby="delete">
            <h2 id="delete" style={{ fontSize: "1.5rem" }}>
              {t("account.deleteTitle")}
            </h2>
            <p className="muted">{t("account.deleteDesc")}</p>
            {sp.deleteError && <p className="notice error" role="alert">{t("account.deleteConfirm")}</p>}
            <form action={deleteMyData} className="row">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="confirm" className="visually-hidden">
                  {t("account.deleteConfirm")}
                </label>
                <input id="confirm" name="confirm" className="input" placeholder={t("account.deleteConfirm")} autoComplete="off" dir="ltr" />
              </div>
              <button className="btn btn-danger" type="submit">
                {t("account.deleteButton")}
              </button>
            </form>
          </section>
        )}
        <p>
          <Link href="/sell">{t("nav.sell")}</Link>
        </p>
      </div>
    </div>
  );
}
