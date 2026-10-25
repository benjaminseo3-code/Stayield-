import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { moderate } from "@/app/actions/admin";
import { ChecksList } from "@/components/report/ChecksList";
import { ReportView } from "@/components/report/ReportView";
import { TeaserSection } from "@/components/TeaserSection";
import { getDb } from "@/db/client";
import { dataSubmissions, properties, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { getReport } from "@/lib/data/report";
import { getTeaserBySlug } from "@/lib/data/teaser";
import { canViewRawSubmission } from "@/lib/policies";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminProperty({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const admin = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!p) notFound();
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, p.ownerId)).limit(1);
  const [sub] = p.activeSubmissionId ? await db.select().from(dataSubmissions).where(eq(dataSubmissions.id, p.activeSubmissionId)).limit(1) : [];
  const teaser = await getTeaserBySlug(db, admin, p.publicSlug);
  const report = sub ? await getReport(db, admin, p.id) : null;
  // Raw evidence (headers, DKIM details) is admin-only by policy.
  const showEvidence = canViewRawSubmission(admin);

  const action = (decision: string, label: string, kind: string) => (
    <form action={moderate} key={decision}>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="decision" value={decision} />
      <button className={`btn ${kind}`} type="submit" data-testid={`admin-${decision}`}>{label}</button>
    </form>
  );

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <Link href="/admin" className="small">← {t("admin.back")}</Link>
        <div className="card card-pad stack">
          <div className="row between">
            <h1 style={{ margin: 0, fontSize: "1.8rem" }}>{[p.neighborhood, p.city].filter(Boolean).join(", ") || p.publicSlug}</h1>
            <span className={`badge status-${p.status}`}>{t(`status.${p.status}`)}</span>
          </div>
          <p style={{ margin: 0 }}><strong>{t("admin.owner")}:</strong> <span dir="ltr">{owner?.email}</span></p>
          {sub && (
            <p style={{ margin: 0 }}>
              <strong>{t("admin.source")}:</strong> {sub.source} · <strong>{t("admin.submittedAt")}:</strong> <span dir="ltr">{sub.createdAt.toISOString()}</span>
            </p>
          )}
          {showEvidence && sub?.verificationResult?.dkim && (
            <p style={{ margin: 0 }}>
              <strong>{t("admin.dkim")}:</strong> <span dir="ltr">d={sub.verificationResult.dkim.domain}; s={sub.verificationResult.dkim.selector}; {sub.verificationResult.dkim.result}</span>
            </p>
          )}
          <div className="row">
            {(p.status === "review" || p.status === "data_pending") && action("approve", t("admin.approve"), "btn-primary")}
            {p.status === "review" && action("reject", t("admin.reject"), "btn-danger")}
            {p.status === "live" && action("unpublish", t("admin.unpublish"), "btn-secondary")}
            {p.status === "unpublished" && action("republish", t("admin.republish"), "btn-secondary")}
          </div>
        </div>

        <section className="card card-pad stack" aria-labelledby="chk-h">
          <h2 id="chk-h" style={{ fontSize: "1.3rem", margin: 0 }}>{t("admin.checks")}</h2>
          <ChecksList checks={sub?.verificationResult?.checks ?? []} />
        </section>

        {teaser && <TeaserSection p={teaser} />}
        {report?.trustTier && <ReportView rows={report.rows} tier={report.trustTier} notes={p.reviewReasons} />}
      </div>
    </div>
  );
}
