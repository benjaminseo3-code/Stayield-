import { countryLabel } from "@/lib/countries";
import Link from "next/link";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { listInvestorRequests, listOwnerRequests } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("requests.title") };
}

export default async function Requests() {
  const { t, lang } = await getT();
  const user = await requireUser("/requests");
  const db = await getDb();
  const day = (d: Date) => formatDate(d.toISOString().slice(0, 10), lang);

  if (user.role === "seller") {
    const rows = await listOwnerRequests(db, user);
    const waiting = rows.filter((r) => r.status === "pending");
    const rest = rows.filter((r) => r.status !== "pending");
    const list = (items: typeof rows) => (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((r) => (
          <li key={r.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }} data-testid="request-row">
            <Link href={`/requests/${r.id}`} className="row between" style={{ textDecoration: "none", color: "inherit" }}>
              <span>
                <strong>{r.investorName}</strong>
                {r.sellerUnseen && <span className="badge-count" aria-label={t("requests.new")}>•</span>}
                <span className="muted small" style={{ display: "block" }}>
                  {r.investorType ? t(`profile.type.${r.investorType}`) : ""} · {r.investorCountry} · {[r.neighborhood, r.city].filter(Boolean).join(", ")} · {day(r.updatedAt)}
                </span>
              </span>
              <span className={`badge req-${r.status}`}>{t(`request.status.${r.status}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
    return (
      <div className="section">
        <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{t("requests.owner.title")}</h1>
            <p className="muted" style={{ margin: 0 }}>{t("requests.owner.sub")}</p>
          </div>
          <section className="card card-pad stack" aria-labelledby="w-h">
            <h2 id="w-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("requests.waiting")} ({waiting.length})</h2>
            {waiting.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("requests.owner.empty")}</p> : list(waiting)}
          </section>
          {rest.length > 0 && (
            <section className="card card-pad stack" aria-labelledby="h-h">
              <h2 id="h-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("requests.history")}</h2>
              {list(rest)}
            </section>
          )}
        </div>
      </div>
    );
  }

  const rows = await listInvestorRequests(db, user);
  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("requests.title")}</h1>
          <p className="muted" style={{ margin: 0 }}>{t("requests.sub")}</p>
        </div>
        <section className="card card-pad stack">
          {rows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t("requests.empty")} <Link href="/properties">{t("buyer.browse")}</Link>
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {rows.map((r) => (
                <li key={r.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }} data-testid="request-row">
                  <Link href={`/requests/${r.id}`} className="row between" style={{ textDecoration: "none", color: "inherit" }}>
                    <span>
                      <strong>{[r.city, countryLabel(t, r.country)].filter(Boolean).join(", ")}</strong>
                      {r.investorUnseen && <span className="badge-count" aria-label={t("requests.new")}>•</span>}
                      <span className="muted small" style={{ display: "block" }}>{day(r.updatedAt)}</span>
                    </span>
                    <span className={`badge req-${r.status}`}>{t(`request.status.${r.status}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
