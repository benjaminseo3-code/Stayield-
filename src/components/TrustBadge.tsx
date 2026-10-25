import { getT } from "@/i18n/server";

export type Tier = "signed_email" | "self_reported" | "api_verified";

const ICON: Record<Tier, string> = { signed_email: "✓", self_reported: "✎", api_verified: "⚡" };

/** The trust tier is always visible wherever income is shown. */
export async function TrustBadge({ tier, withDescription = false }: { tier: Tier; withDescription?: boolean }) {
  const { t } = await getT();
  return (
    <span>
      <span className={`badge trust-${tier}`} title={t(`trust.${tier}.desc`)}>
        <span aria-hidden="true">{ICON[tier]}</span> {t(`trust.${tier}`)}
      </span>
      {withDescription && <span className="small muted"> {t(`trust.${tier}.desc`)}</span>}
    </span>
  );
}
