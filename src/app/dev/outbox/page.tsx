import { notFound } from "next/navigation";
import { getMailer } from "@/adapters";

export const dynamic = "force-dynamic";

const URL_RE = /https?:\/\/[^\s)]+/g;

/** Development only: shows emails the app "sent", so magic links can be clicked locally. */
export default async function Outbox() {
  if (process.env.NODE_ENV === "production") notFound();
  const mails = (await getMailer().list?.()) ?? [];
  return (
    <div className="section">
      <div className="container narrow stack">
        <h1>Dev outbox</h1>
        {mails.length === 0 && <p className="muted">No emails yet.</p>}
        {mails.map((m) => (
          <div key={m.id} className="card card-pad" data-testid="outbox-mail">
            <p className="small muted" dir="ltr">
              To: {m.to} · {m.sentAt}
            </p>
            <h3 dir="ltr">{m.subject}</h3>
            <ul>
              {[...new Set(m.text.match(URL_RE) ?? [])].map((u) => (
                <li key={u} dir="ltr">
                  <a href={u}>{u}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
