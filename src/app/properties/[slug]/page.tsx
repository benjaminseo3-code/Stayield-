import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { toggleSave } from "@/app/actions/requests";
import { AccessPanel } from "@/components/AccessPanel";
import { ListingView } from "@/components/ListingView";
import { ReportView } from "@/components/report/ReportView";
import { getDb } from "@/db/client";
import { properties, savedProperties } from "@/db/schema";
import { getT } from "@/i18n/server";
import { getInvestorProfile, myRequestFor } from "@/lib/access";
import { getListingBySlug } from "@/lib/data/listings";
import { getReport } from "@/lib/data/report";
import { countView } from "@/lib/data/views";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // Metadata is public: only the locked (anonymous) view is ever used here.
  const l = await getListingBySlug(await getDb(), null, slug);
  if (!l) return { title: "Stayield" };
  const place = [l.city, l.country].filter(Boolean).join(", ");
  return { title: place, description: `${place}`, robots: { index: true } };
}

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { t } = await getT();
  const db = await getDb();
  const user = await currentUser();
  const listing = await getListingBySlug(db, user, slug);
  if (!listing) {
    return (
      <div className="section">
        <div className="container narrow card card-pad center stack">
          <h1 style={{ fontSize: "2rem" }}>{t("prop.notFound")}</h1>
          <Link href="/properties">{t("prop.backToList")}</Link>
        </div>
      </div>
    );
  }
  const [meta] = await db.select({ ownerId: properties.ownerId, reviewReasons: properties.reviewReasons }).from(properties).where(eq(properties.id, listing.id)).limit(1);
  const isOwner = user?.id === meta.ownerId;
  if (!isOwner && listing.status === "live") await countView(db, listing.id);

  const profile = user?.role === "buyer" ? await getInvestorProfile(db, user.id) : null;
  const request = user ? await myRequestFor(db, user.id, listing.id) : null;
  const full = listing.level === "full";
  const report = full && listing.trustTier ? await getReport(db, user, listing.id) : null;
  const saved = user?.role === "buyer"
    ? (await db.select({ id: savedProperties.id }).from(savedProperties).where(and(eq(savedProperties.buyerId, user.id), eq(savedProperties.propertyId, listing.id))).limit(1)).length > 0
    : false;

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "28px" }}>
        <Link href="/properties" className="small">← {t("prop.backToList")}</Link>
        <ListingView l={listing} />

        <div className="row">
          {user?.role === "buyer" && listing.status === "live" && (
            <form action={toggleSave}>
              <input type="hidden" name="propertyId" value={listing.id} />
              <button className="btn btn-secondary sm" type="submit" aria-pressed={saved}>{saved ? `♥ ${t("prop.saved")}` : `♡ ${t("prop.save")}`}</button>
            </form>
          )}
          {isOwner && <span className="badge">{t("prop.owner")}</span>}
        </div>

        {!full || (user?.role === "buyer" && request) ? (
          <AccessPanel listing={listing} viewer={user ? { id: user.id, role: user.role } : null} isOwner={isOwner} profileStatus={profile?.status ?? null} request={request} error={error} />
        ) : null}

        {report && report.trustTier && <ReportView rows={report.rows} tier={report.trustTier} notes={meta.reviewReasons} />}
        {!full && (
          <section className="card card-pad center muted" data-testid="report-locked">
            <p style={{ margin: 0 }}>🔒 {t("listing.reportLocked")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
