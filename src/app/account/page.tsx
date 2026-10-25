import { countryLabel } from "@/lib/countries";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { addVerifiedEmail, deleteMyData, removeVerifiedEmail } from "@/app/actions/account";
import { signOutAction } from "@/app/actions/auth";
import { getDb } from "@/db/client";
import { properties, savedProperties, verifiedEmails } from "@/db/schema";
import { getT } from "@/i18n/server";
import { getInvestorProfile } from "@/lib/access";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
type SP = { sent?: string; verified?: string; verifyError?: string; emailError?: string; deleted?: string; deleteError?: string };

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("account.title") };
}

export default async function Account({ searchParams }: { searchParams: Promise<SP> }) {
  const { t } = await getT();
  const user = await requireUser("/account");
  const sp = await searchParams;
  const db = await getDb();
  const emails = await db.select().from(verifiedEmails).where(eq(verifiedEmails.userId, user.id));
  const profile = user.role === "buyer" ? await getInvestorProfile(db, user.id) : null;
  const saved = await db
    .select({ id: savedProperties.id, slug: properties.publicSlug, city: properties.city, country: properties.country })
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
            <button className="btn btn-secondary sm" type="submit">{t("auth.signOut")}</button>
          </form>
        </div>

        {user.role === "buyer" && (
          <section className="card card-pad stack" aria-labelledby="inv-h" data-testid="investor-card">
            <h2 id="inv-h" style={{ fontSize: "1.5rem", margin: 0 }}>{t("profile.title")}</h2>
            <p style={{ margin: 0 }}>
              <strong>{t("profile.statusLabel")}:</strong>{" "}
              <span className={`badge ${profile?.status === "verified" ? "status-live" : profile?.status === "submitted" ? "status-review" : ""}`}>{t(`profile.status.${profile?.status ?? "draft"}`)}</span>
            </p>
            <p className="muted" style={{ margin: 0 }}>{profile?.status === "submitted" || profile?.status === "verified" ? t("profile.account.done") : t("profile.account.todo")}</p>
            <div className="row">
              <Link className="btn btn-primary sm" href="/account/verification">{profile?.status === "submitted" || profile?.status === "verified" ? t("profile.edit") : t("profile.complete")}</Link>
              <Link className="btn btn-secondary sm" href="/requests">{t("requests.title")}</Link>
            </div>
          </section>
        )}

        {user.role === "buyer" && (
          <section className="card card-pad stack" aria-labelledby="saved-h">
            <h2 id="saved-h" style={{ fontSize: "1.5rem", margin: 0 }}>{t("buyer.saved")}</h2>
            {saved.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>{t("buyer.saved.empty")} <Link href="/properties">{t("buyer.browse")}</Link></p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {saved.map((p) => (
                  <li key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <Link href={`/properties/${p.slug}`}>{[p.city, countryLabel(t, p.country)].filter(Boolean).join(", ")}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {user.role === "seller" && (
          <section className="card card-pad stack" aria-labelledby="senders">
            <h2 id="senders" style={{ fontSize: "1.5rem", margin: 0 }}>{t("account.sender.title")}</h2>
            <p className="muted" style={{ margin: 0 }}>{t("account.sender.desc")}</p>
            {sp.sent && <p className="notice ok" role="status">{t("account.sender.sent", { email: sp.sent })}</p>}
            {sp.verified && <p className="notice ok" role="status">{t("account.sender.confirmed", { email: sp.verified })}</p>}
            {sp.verifyError && <p className="notice error" role="alert">{t("account.sender.invalid")}</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {emails.map((e) => (
                <li key={e.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <span dir="ltr">{e.email}</span>
                  <span className="row">
                    <span className={`badge ${e.verifiedAt ? "status-live" : "status-review"}`}>{e.verifiedAt ? t("account.sender.verified") : t("account.sender.pending")}</span>
                    <form action={removeVerifiedEmail}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn btn-ghost sm" type="submit">{t("account.sender.remove")}</button>
                    </form>
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
              <button className="btn btn-primary sm" type="submit">{t("account.sender.addButton")}</button>
            </form>
            <p className="small muted" style={{ margin: 0 }}>{t("account.sender.mailNote")}</p>
          </section>
        )}

        {user.role === "seller" && (
          <section className="card card-pad stack" aria-labelledby="delete">
            <h2 id="delete" style={{ fontSize: "1.5rem", margin: 0 }}>{t("account.deleteTitle")}</h2>
            <p className="muted" style={{ margin: 0 }}>{t("account.deleteDesc")}</p>
            {sp.deleteError && <p className="notice error" role="alert">{t("account.deleteConfirm")}</p>}
            <form action={deleteMyData} className="row">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="confirm" className="visually-hidden">{t("account.deleteConfirm")}</label>
                <input id="confirm" name="confirm" className="input" placeholder={t("account.deleteConfirm")} autoComplete="off" dir="ltr" />
              </div>
              <button className="btn btn-danger" type="submit">{t("account.deleteButton")}</button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
