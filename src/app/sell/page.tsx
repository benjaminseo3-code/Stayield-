import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { becomeSeller } from "@/app/actions/account";
import { createListing, deleteListing, setPublished } from "@/app/actions/sell";
import { getDb } from "@/db/client";
import { accessRequests, properties } from "@/db/schema";
import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("sell.hero.title") };
}

export default async function Sell() {
  const { t } = await getT();
  const user = await currentUser();
  const isSeller = user?.role === "seller" || user?.role === "admin";

  if (!isSeller) {
    return (
      <>
        <section className="hero">
          <div className="container hero-inner stack" style={{ ["--gap" as string]: "20px" }}>
            <h1>{t("sell.hero.title")}</h1>
            <p className="lead">{t("sell.hero.sub")}</p>
            {user ? (
              <form action={becomeSeller}>
                <button className="btn btn-primary lg" type="submit" data-testid="become-seller">
                  {t("sell.cta.start")}
                </button>
              </form>
            ) : (
              <Link className="btn btn-primary lg" href="/sign-in?next=/sell">
                {t("sell.cta.signIn")}
              </Link>
            )}
          </div>
        </section>
        <section className="section">
          <div className="container grid-3">
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className="card card-pad">
                <span className="step-num" aria-hidden="true">{n}</span>
                <h3>{t(`sell.why.${n}.title`)}</h3>
                <p className="muted" style={{ margin: 0 }}>{t(`sell.why.${n}.body`)}</p>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }

  const db = await getDb();
  const props = await db.select().from(properties).where(eq(properties.ownerId, user!.id)).orderBy(desc(properties.createdAt));
  // Request counts per listing (a grouped query: a correlated sub-select would lose its table qualifier).
  const counts = await db
    .select({ propertyId: accessRequests.propertyId, status: accessRequests.status, n: count() })
    .from(accessRequests)
    .innerJoin(properties, eq(properties.id, accessRequests.propertyId))
    .where(eq(properties.ownerId, user!.id))
    .groupBy(accessRequests.propertyId, accessRequests.status);
  const countOf = (id: string, status: string) => Number(counts.find((c) => c.propertyId === id && c.status === status)?.n ?? 0);
  const rows = props.map((p) => ({ p, pending: countOf(p.id, "pending"), approved: countOf(p.id, "approved") }));

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <div className="row between">
          <h1 style={{ margin: 0 }}>{t("dash.title")}</h1>
          <form action={createListing}>
            <button className="btn btn-primary" type="submit" data-testid="new-listing">
              {t("dash.new")}
            </button>
          </form>
        </div>
        {rows.length === 0 && <p className="muted">{t("dash.empty")}</p>}
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          {rows.map(({ p, pending, approved }) => {
            const place = [p.neighborhood, p.city].filter(Boolean).join(", ") || t("dash.untitled");
            return (
              <article key={p.id} className="card card-pad" data-testid="dash-listing">
                <div className="row between">
                  <div>
                    <h2 style={{ fontSize: "1.3rem", margin: 0 }}>{place}</h2>
                    <p className="small muted" style={{ margin: "4px 0 0" }}>
                      {t("dash.views", { n: p.viewsCount })} · {t("dash.requestsPending", { n: pending })} · {t("dash.requestsApproved", { n: approved })}
                    </p>
                  </div>
                  <span className={`badge status-${p.status}`}>{t(`status.${p.status}`)}</span>
                </div>
                {p.status === "review" && <p className="notice warn small">{t("dash.reviewNote")}</p>}
                {(p.status === "draft" || p.status === "data_pending") && <p className="small muted">{t("dash.pendingNote")}</p>}
                <div className="row" style={{ marginTop: 12 }}>
                  <Link className="btn btn-secondary sm" href={`/sell/${p.id}/${p.status === "draft" ? "basics" : "preview"}`}>
                    {t("dash.continue")}
                  </Link>
                  {p.status === "live" && (
                    <Link className="btn btn-ghost sm" href={`/properties/${p.publicSlug}`}>
                      {t("dash.view")}
                    </Link>
                  )}
                  {pending > 0 && (
                    <Link className="btn btn-primary sm" href="/requests" data-testid="dash-requests">
                      {t("dash.openRequests", { n: pending })}
                    </Link>
                  )}
                  {p.status === "live" && (
                    <form action={setPublished}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-ghost sm" type="submit">{t("dash.unpublish")}</button>
                    </form>
                  )}
                  {p.status === "unpublished" && (
                    <form action={setPublished}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="publish" value="1" />
                      <button className="btn btn-ghost sm" type="submit">{t("dash.republish")}</button>
                    </form>
                  )}
                  <form action={deleteListing}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn btn-danger sm" type="submit" aria-label={`${t("dash.delete")}: ${place}`}>
                      {t("dash.delete")}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
