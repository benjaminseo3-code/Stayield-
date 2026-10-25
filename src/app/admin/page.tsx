import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, properties, users } from "@/db/schema";
import { getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const { t, lang } = await getT();
  await requireAdmin();
  const db = await getDb();
  const rows = await db
    .select({ p: properties, ownerEmail: users.email })
    .from(properties)
    .innerJoin(users, eq(users.id, properties.ownerId))
    .orderBy(desc(properties.updatedAt))
    .limit(100);
  const queue = rows.filter((r) => r.p.status === "review");
  const events = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(30);

  const row = (r: (typeof rows)[number]) => (
    <li key={r.p.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }} data-testid="admin-row">
      <span>
        <Link href={`/admin/${r.p.id}`}>{[r.p.neighborhood, r.p.city].filter(Boolean).join(", ") || r.p.publicSlug}</Link>
        <span className="small muted"> · <span dir="ltr">{r.ownerEmail}</span></span>
      </span>
      <span className={`badge status-${r.p.status}`}>{t(`status.${r.p.status}`)}</span>
    </li>
  );

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <h1>{t("admin.title")}</h1>
        <p className="notice small">{t("admin.note")}</p>
        <section className="card card-pad" aria-labelledby="q-h">
          <h2 id="q-h" style={{ fontSize: "1.4rem" }}>{t("admin.queue")} ({queue.length})</h2>
          {queue.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("admin.queue.empty")}</p> : <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{queue.map(row)}</ul>}
        </section>
        <section className="card card-pad" aria-labelledby="all-h">
          <h2 id="all-h" style={{ fontSize: "1.4rem" }}>{t("admin.all")}</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{rows.map(row)}</ul>
        </section>
        <section className="card card-pad" aria-labelledby="audit-h">
          <h2 id="audit-h" style={{ fontSize: "1.4rem" }}>{t("admin.audit")}</h2>
          {events.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("admin.audit.empty")}</p> : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="small muted" dir="ltr">{formatDate(e.createdAt.toISOString().slice(0, 10), lang)}</td>
                      <td dir="ltr">{e.action}</td>
                      <td className="small muted" dir="ltr">{e.entityType}:{(e.entityId ?? "").slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
