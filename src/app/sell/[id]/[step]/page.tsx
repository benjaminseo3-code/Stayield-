import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dataSubmissions, inboundAddresses, propertyPhotos, verifiedEmails } from "@/db/schema";
import { config } from "@/lib/config";
import { getT } from "@/i18n/server";
import { ReportView } from "@/components/report/ReportView";
import { TeaserSection } from "@/components/TeaserSection";
import { BasicsForm } from "@/components/wizard/BasicsForm";
import { DataStep } from "@/components/wizard/DataStep";
import { PhotosManager } from "@/components/wizard/PhotosManager";
import { PublishForm } from "@/components/wizard/PublishForm";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/photos-constants";
import { getTeaserBySlug } from "@/lib/data/teaser";
import { getReport } from "@/lib/data/report";
import { loadEditableProperty, requireSeller } from "@/lib/session";

export const dynamic = "force-dynamic";

const STEPS = ["basics", "photos", "data", "preview", "publish"] as const;
type Step = (typeof STEPS)[number];

export default async function WizardStep({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { id, step } = await params;
  if (!(STEPS as readonly string[]).includes(step)) notFound();
  const current = step as Step;
  const user = await requireSeller(`/sell/${id}/${step}`);
  const db = await getDb();
  const property = await loadEditableProperty(db, user, id);
  if (!property) notFound();
  const { t } = await getT();
  const idx = STEPS.indexOf(current);
  const href = (s: Step) => `/sell/${id}/${s}`;
  const next = STEPS[idx + 1];
  const back = STEPS[idx - 1];

  let body: React.ReactNode = null;
  if (current === "basics") {
    body = (
      <BasicsForm
        propertyId={id}
        nextHref={href("photos")}
        initial={{
          country: property.country,
          city: property.city,
          neighborhood: property.neighborhood,
          askingPrice: property.askingPriceMinor == null ? "" : String(property.askingPriceMinor / 100),
          currency: (["USD", "EUR", "GBP", "ILS"].includes(property.currency) ? property.currency : "USD") as "USD",
          sqm: property.sqm == null ? "" : String(property.sqm),
          bedrooms: property.bedrooms == null ? "" : String(property.bedrooms),
          bathrooms: property.bathrooms == null ? "" : String(property.bathrooms),
          description: property.description,
          originalListingUrl: property.originalListingUrl ?? "",
        }}
      />
    );
  } else if (current === "photos") {
    const photos = await db.select().from(propertyPhotos).where(eq(propertyPhotos.propertyId, id)).orderBy(asc(propertyPhotos.position));
    body = (
      <>
        <p className="muted">{t("photos.sub", { max: MAX_PHOTOS, mb: MAX_PHOTO_BYTES / 1024 / 1024 })}</p>
        <PhotosManager key={photos.map((p) => `${p.id}${p.isCover}${p.position}`).join()} propertyId={id} initial={photos.map((p) => ({ id: p.id, alt: p.alt, isCover: p.isCover }))} />
      </>
    );
  } else if (current === "data") {
    const [addr] = await db.select().from(inboundAddresses).where(eq(inboundAddresses.propertyId, id)).limit(1);
    const [latest] = await db.select().from(dataSubmissions).where(eq(dataSubmissions.propertyId, id)).orderBy(desc(dataSubmissions.createdAt)).limit(1);
    const emails = await db.select().from(verifiedEmails).where(eq(verifiedEmails.userId, property.ownerId));
    body = (
      <>
        <p className="muted">{t("data.sub")}</p>
        <DataStep
          propertyId={id}
          inboundAddress={`p-${addr?.token ?? ""}@${config.inboundDomain()}`}
          sellerEmails={emails.filter((e) => e.verifiedAt).length}
          initialSubmission={
            latest
              ? { id: latest.id, source: latest.source, status: latest.status, outcome: latest.verificationResult?.outcome ?? null, checks: latest.verificationResult?.checks ?? [] }
              : null
          }
        />
      </>
    );
  } else if (current === "preview") {
    const teaser = await getTeaserBySlug(db, user, property.publicSlug);
    const hasData = !!property.activeSubmissionId;
    const report = hasData ? await getReport(db, user, id) : null;
    body = (
      <div className="stack" style={{ ["--gap" as string]: "32px" }}>
        <p className="muted">{t("preview.sub")}</p>
        <section aria-labelledby="pv-teaser">
          <h2 id="pv-teaser" style={{ fontSize: "1.3rem" }}>{t("preview.teaser")}</h2>
          {teaser && <TeaserSection p={teaser} />}
        </section>
        <section aria-labelledby="pv-report">
          <h2 id="pv-report" style={{ fontSize: "1.3rem" }}>{t("preview.report")}</h2>
          {report && report.trustTier ? (
            <ReportView rows={report.rows} tier={report.trustTier} notes={property.reviewReasons} />
          ) : (
            <p className="notice warn">{t("preview.noData")}</p>
          )}
        </section>
      </div>
    );
  } else {
    body = (
      <>
        <p className="muted">{t("publish.sub")}</p>
        <PublishForm propertyId={id} hasData={!!property.activeSubmissionId} reasons={property.reviewReasons} />
      </>
    );
  }

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <div>
          <Link href="/sell" className="small">← {t("wizard.backToDashboard")}</Link>
          <h1 style={{ margin: "8px 0 4px", fontSize: "clamp(1.6rem,4vw,2.4rem)" }}>{t(`${current}.title` as "basics.title")}</h1>
          <p className="small muted" style={{ margin: 0 }}>{t("wizard.stepOf", { n: idx + 1, total: STEPS.length })}</p>
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={idx + 1} aria-label={t("wizard.stepOf", { n: idx + 1, total: STEPS.length })} style={{ marginTop: 8 }}>
            <span style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="stepper" aria-label={t("wizard.title")}>
            {STEPS.map((s) => (
              <li key={s} aria-current={s === current ? "step" : undefined}>
                <Link href={href(s)}>{t(`wizard.step.${s}`)}</Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="card card-pad">{body}</div>

        <div className="row between">
          {back ? (
            <Link className="btn btn-ghost" href={href(back)}>{t("wizard.back")}</Link>
          ) : (
            <span />
          )}
          {next && current !== "basics" ? (
            <Link className="btn btn-primary" href={href(next)} data-testid="next-step">{t("wizard.next")}</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
