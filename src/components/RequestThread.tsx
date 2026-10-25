import { getT } from "@/i18n/server";
import type { RequestMessage } from "@/db/schema";

/** The conversation on one request, oldest first. `viewerIs` decides whether "you" is the owner or the investor. */
export async function RequestThread({ messages, viewerIs }: { messages: RequestMessage[]; viewerIs: "owner" | "investor" | "admin" }) {
  const { t, lang } = await getT();
  const fmt = new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <ol className="thread" data-testid="thread">
      {messages.map((m) => {
        const mine = (viewerIs === "owner" && m.authorRole === "owner") || (viewerIs === "investor" && m.authorRole === "investor");
        const who = mine ? t("request.you") : m.authorRole === "owner" ? t("request.owner") : t("request.investor");
        return (
          <li key={m.id} className={`bubble${m.authorRole === "owner" ? " owner" : ""}`} data-kind={m.kind}>
            <div className="who">
              {who} · {t(`request.kind.${m.kind}`)} · <span dir="ltr">{fmt.format(m.createdAt)}</span>
            </div>
            <div style={{ whiteSpace: "pre-line" }}>{m.body}</div>
          </li>
        );
      })}
    </ol>
  );
}
