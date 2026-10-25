import Link from "next/link";
import { reviewInvestorAction } from "@/app/actions/requests";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { listInvestorsForAdmin } from "@/lib/access";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("admin.investors") };
}

export default async function AdminInvestors() {
  const { t } = await getT();
  const admin = await requireAdmin();
  const rows = await listInvestorsForAdmin(await getDb(), admin);
  const act = (userId: string, status: string, label: string, kind: string) => (
    <form action={reviewInvestorAction} key={status}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn ${kind} sm`} type="submit">{label}</button>
    </form>
  );
  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <Link href="/admin" className="small">← {t("admin.back")}</Link>
        <h1>{t("admin.investors")}</h1>
        <p className="notice small">{t("admin.investors.note")}</p>
        <section className="card card-pad">
          {rows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t("admin.investors.empty")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {rows.map((r) => (
                <li key={r.userId} className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }} data-testid="admin-investor">
                  <span>
                    <strong>{r.fullName}</strong>
                    <span className="muted small" style={{ display: "block" }} dir="ltr">{r.email} · {r.country}</span>
                  </span>
                  <span className="row">
                    <span className={`badge ${r.status === "verified" ? "status-live" : r.status === "suspended" ? "" : "status-review"}`}>{t(`profile.status.${r.status}`)}</span>
                    {r.status !== "verified" && act(r.userId, "verified", t("admin.investors.verify"), "btn-primary")}
                    {r.status !== "suspended" && act(r.userId, "suspended", t("admin.investors.suspend"), "btn-danger")}
                    {r.status === "suspended" && act(r.userId, "submitted", t("admin.investors.restore"), "btn-secondary")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
