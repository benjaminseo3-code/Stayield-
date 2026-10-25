import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import type { ProfileView } from "@/lib/access";

/** An investor's profile as the owner sees it. Phone and email are null until the request is approved. */
export async function ProfileCard({ profile }: { profile: ProfileView }) {
  const { t, lang } = await getT();
  const row = (label: string, value: React.ReactNode) =>
    value ? (
      <>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </>
    ) : null;
  return (
    <section className="card card-pad stack" aria-labelledby="profile-h" data-testid="investor-profile">
      <div className="row between">
        <h2 id="profile-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("profile.card.title")}</h2>
        <span className={`badge ${profile.status === "verified" ? "status-live" : ""}`}>{t(`profile.status.${profile.status}`)}</span>
      </div>
      <dl className="dl">
        {row(t("profile.card.name"), profile.fullName)}
        {profile.investorType && row(t("profile.type"), t(`profile.type.${profile.investorType}`))}
        {row(t("profile.card.entity"), profile.entityName)}
        {row(t("profile.card.country"), profile.country)}
        {profile.budgetMin != null && profile.budgetMax != null && row(t("profile.budget"), <bdi dir="ltr">{`${formatMoney(profile.budgetMin * 100, profile.currency, lang)} – ${formatMoney(profile.budgetMax * 100, profile.currency, lang)}`}</bdi>)}
        {row(t("profile.card.targets"), profile.targetCountries)}
        {profile.experience && row(t("profile.card.experience"), t(`profile.experience.${profile.experience}`))}
        {profile.financing && row(t("profile.card.financing"), t(`profile.financing.${profile.financing}`))}
        {profile.timeline && row(t("profile.card.timeline"), t(`profile.timeline.${profile.timeline}`))}
        {row(t("profile.card.about"), <span style={{ whiteSpace: "pre-line" }}>{profile.about}</span>)}
        {row(t("profile.website"), profile.website ? <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">{profile.website}</a> : null)}
        {profile.email ? row(t("profile.email"), <span dir="ltr">{profile.email}</span>) : null}
        {profile.phone ? row(t("profile.phone"), <span dir="ltr">{profile.phone}</span>) : null}
      </dl>
      {!profile.email && <p className="small muted" style={{ margin: 0 }}>{t("profile.contactHidden")}</p>}
    </section>
  );
}
