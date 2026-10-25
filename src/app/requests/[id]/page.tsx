import Link from "next/link";
import { notFound } from "next/navigation";
import { decideAction, replyAction, revokeAction, withdrawAction } from "@/app/actions/requests";
import { ProfileCard } from "@/components/ProfileCard";
import { RequestThread } from "@/components/RequestThread";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { getRequestDetail } from "@/lib/access";
import { ForbiddenError } from "@/lib/policies";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("request.title") };
}

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const { done, error } = await searchParams;
  const { t } = await getT();
  const user = await requireUser(`/requests/${id}`);
  let d;
  try {
    d = await getRequestDetail(await getDb(), user, id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound(); // same as "no such request"
    throw e;
  }
  if (!d) notFound();
  const { request: r, property: p, profile, messages, viewerIs } = d;
  const place = viewerIs === "investor" && r.status !== "approved" ? [p.city, p.country].filter(Boolean).join(", ") : [p.neighborhood, p.city, p.country].filter(Boolean).join(", ");
  const open = r.status === "pending" || r.status === "info_requested";

  return (
    <div className="section">
      <div className="container stack" style={{ ["--gap" as string]: "24px" }}>
        <Link href="/requests" className="small">← {t("requests.title")}</Link>
        <div className="row between">
          <h1 style={{ margin: 0, fontSize: "clamp(1.6rem,4vw,2.3rem)" }}>{place}</h1>
          <span className={`badge req-${r.status}`} data-testid="request-status">{t(`request.status.${r.status}`)}</span>
        </div>
        {done && <p className="notice ok" role="status">{t(`request.done.${done}` as "request.done.requested")}</p>}
        {error && <p className="notice error" role="alert">{t(`request.error.${error}` as "request.error.state")}</p>}

        {viewerIs === "owner" && profile && <ProfileCard profile={profile} />}

        <section className="card card-pad stack" aria-labelledby="thread-h">
          <h2 id="thread-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("request.conversation")}</h2>
          <RequestThread messages={messages} viewerIs={viewerIs} />
        </section>

        {viewerIs === "owner" && open && (
          <section className="card card-pad stack panel-accent" aria-labelledby="decide-h" data-testid="decide-panel">
            <h2 id="decide-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("request.decide.title")}</h2>
            <form action={decideAction} className="stack" style={{ ["--gap" as string]: "12px" }}>
              <input type="hidden" name="requestId" value={r.id} />
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="note">{t("request.decide.note")}</label>
                <textarea id="note" name="note" className="input" maxLength={1500} aria-describedby="note-hint" />
                <span id="note-hint" className="hint">{t("request.decide.noteHint")}</span>
              </div>
              <div className="row">
                <button className="btn btn-primary" type="submit" name="decision" value="approve" data-testid="decide-approve">{t("request.decide.approve")}</button>
                {r.status === "pending" && <button className="btn btn-secondary" type="submit" name="decision" value="ask_info" data-testid="decide-ask">{t("request.decide.ask")}</button>}
                <button className="btn btn-danger" type="submit" name="decision" value="decline" data-testid="decide-decline">{t("request.decide.decline")}</button>
              </div>
            </form>
          </section>
        )}

        {viewerIs === "owner" && r.status === "approved" && (
          <form action={revokeAction}>
            <input type="hidden" name="requestId" value={r.id} />
            <button className="btn btn-danger sm" type="submit" data-testid="revoke">{t("request.revoke")}</button>
          </form>
        )}

        {viewerIs === "investor" && r.status === "info_requested" && (
          <section className="card card-pad stack panel-accent" aria-labelledby="reply-h" data-testid="reply-panel">
            <h2 id="reply-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("request.reply.title")}</h2>
            <form action={replyAction} className="stack" style={{ ["--gap" as string]: "12px" }}>
              <input type="hidden" name="requestId" value={r.id} />
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="body">{t("request.reply.label")}</label>
                <textarea id="body" name="body" className="input" maxLength={1500} required />
              </div>
              <div><button className="btn btn-primary" type="submit" data-testid="reply-send">{t("request.reply.send")}</button></div>
            </form>
          </section>
        )}

        {viewerIs === "investor" && (
          <div className="row">
            {r.status === "approved" && <Link className="btn btn-primary" href={`/properties/${p.slug}`} data-testid="open-listing">{t("request.openListing")}</Link>}
            {(open || r.status === "approved") && (
              <form action={withdrawAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <button className="btn btn-ghost sm" type="submit">{t("request.withdraw")}</button>
              </form>
            )}
            {r.status !== "approved" && <Link className="btn btn-ghost sm" href={`/properties/${p.slug}`}>{t("request.viewListing")}</Link>}
          </div>
        )}
        {viewerIs === "owner" && <Link className="btn btn-ghost sm" href={`/properties/${p.slug}`}>{t("request.viewListing")}</Link>}
      </div>
    </div>
  );
}
