import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requestIntro, toggleSave } from "@/app/actions/buyer";
import { LockedReport } from "@/components/LockedReport";
import { TeaserSection } from "@/components/TeaserSection";
import { ReportView } from "@/components/report/ReportView";
import { getDb } from "@/db/client";
import { properties, savedProperties } from "@/db/schema";
import { getT } from "@/i18n/server";
import { getReport, hasUnlock } from "@/lib/data/report";
import { getTeaserBySlug } from "@/lib/data/teaser";
import { countView } from "@/lib/data/views";
import { canUnlock, canViewReport } from "@/lib/policies";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTeaserBySlug(await getDb(), null, slug); // public teaser only
  if (!t) return { title: "Stayield" };
  const place = [t.neighborhood, t.city].filter(Boolean).join(", ");
  const cover = t.photos.find((p) => p.isCover) ?? t.photos[0];
  return {
    title: place,
    description: t.description.slice(0, 160),
    openGraph: { title: place, description: t.description.slice(0, 160), images: cover ? [`/api/photos/${cover.id}/full.jpg`] : undefined },
  };
}

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ intro?: string }> }) {
  const { slug } = await params;
  const { intro } = await searchParams;
  const { t } = await getT();
  const db = await getDb();
  const user = await currentUser();
  const teaser = await getTeaserBySlug(db, user, slug);
  if (!teaser) {
    return (
      <div className="section">
        <div className="container narrow card card-pad center stack">
          <h1 style={{ fontSize: "2rem" }}>{t("prop.notFound")}</h1>
          <Link href="/properties">{t("prop.backToList")}</Link>
        </div>
      </div>
    );
  }
  const [owner] = await db.select({ ownerId: properties.ownerId, reviewReasons: properties.reviewReasons }).from(properties).where(eq(properties.id, teaser.id)).limit(1);
  const ref = { id: teaser.id, ownerId: owner.ownerId, status: teaser.status };
  const isOwner = user?.id === owner.ownerId;
  if (!isOwner && teaser.status === "live") await countView(db, teaser.id);

  const unlocked = await hasUnlock(db, user, teaser.id);
  const mayRead = canViewReport(user, ref, unlocked);
  const report = mayRead && teaser.trustTier ? await getReport(db, user, teaser.id) : null;
  const saved = user
    ? (await db.select({ id: savedProperties.id }).from(savedProperties).where(and(eq(savedProperties.buyerId, user.id), eq(savedProperties.propertyId, teaser.id))).limit(1)).length > 0
    : false;

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "28px" }}>
        <Link href="/properties" className="small">← {t("prop.backToList")}</Link>
        <TeaserSection p={teaser} />

        <div className="row">
          {user && !isOwner && teaser.status === "live" && (
            <form action={toggleSave}>
              <input type="hidden" name="propertyId" value={teaser.id} />
              <button className="btn btn-secondary sm" type="submit" aria-pressed={saved}>
                {saved ? `♥ ${t("prop.saved")}` : `♡ ${t("prop.save")}`}
              </button>
            </form>
          )}
          {isOwner && <span className="badge">{t("prop.owner")}</span>}
          {unlocked && !isOwner && <span className="badge status-live">{t("prop.unlocked")}</span>}
        </div>

        {report && report.trustTier ? (
          <>
            <ReportView rows={report.rows} tier={report.trustTier} notes={owner.reviewReasons} />
            {unlocked && !isOwner && (
              <section className="card card-pad stack" aria-labelledby="intro-h">
                <h2 id="intro-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("prop.intro")}</h2>
                <p className="muted" style={{ margin: 0 }}>{t("prop.introHint")}</p>
                {intro === "sent" ? (
                  <p className="notice ok" role="status">{t("prop.introSent")}</p>
                ) : (
                  <form action={requestIntro}>
                    <input type="hidden" name="propertyId" value={teaser.id} />
                    <div className="field">
                      <label htmlFor="intro-msg">{t("prop.introMessage")}</label>
                      <textarea id="intro-msg" name="message" className="input" maxLength={2000} />
                    </div>
                    <button className="btn btn-primary" type="submit">{t("prop.introSend")}</button>
                  </form>
                )}
              </section>
            )}
          </>
        ) : teaser.status === "live" ? (
          <LockedReport propertyId={teaser.id} slug={slug} canUnlock={canUnlock(user, ref)} signedIn={!!user} />
        ) : null}
      </div>
    </div>
  );
}
