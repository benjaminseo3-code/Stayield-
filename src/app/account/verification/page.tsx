import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileValues } from "@/components/ProfileForm";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { getInvestorProfile } from "@/lib/access";
import { safeNext } from "@/lib/safe-next";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("profile.title") };
}

export default async function Verification({ searchParams }: { searchParams: Promise<{ next?: string; welcome?: string }> }) {
  const { t } = await getT();
  const user = await requireUser("/account/verification");
  if (user.role !== "buyer") redirect("/account");
  const { next, welcome } = await searchParams;
  const profile = await getInvestorProfile(await getDb(), user.id);
  const initial: ProfileValues = {
    fullName: profile?.fullName || user.name,
    phone: profile?.phone ?? "",
    investorType: profile?.investorType ?? "individual",
    entityName: profile?.entityName ?? "",
    country: profile?.country ?? "",
    budgetMin: profile?.budgetMin != null ? String(profile.budgetMin) : "",
    budgetMax: profile?.budgetMax != null ? String(profile.budgetMax) : "",
    currency: profile?.currency ?? "USD",
    targetCountries: profile?.targetCountries ?? "",
    experience: profile?.experience ?? "first_time",
    financing: profile?.financing ?? "cash",
    timeline: profile?.timeline ?? "exploring",
    about: profile?.about ?? "",
    website: profile?.website ?? "",
  };
  const status = profile?.status ?? "draft";
  return (
    <div className="section">
      <div className="container narrow stack" style={{ ["--gap" as string]: "20px" }}>
        <div>
          <Link href="/account" className="small">← {t("account.title")}</Link>
          <h1 style={{ margin: "8px 0 4px" }}>{t("profile.title")}</h1>
          <p className="muted" style={{ margin: 0 }}>{t("profile.sub")}</p>
        </div>
        {welcome && <p className="notice ok" role="status">{t("profile.welcome")}</p>}
        <p style={{ margin: 0 }}>
          <strong>{t("profile.statusLabel")}:</strong> <span className={`badge ${status === "verified" ? "status-live" : status === "submitted" ? "status-review" : ""}`} data-testid="profile-status">{t(`profile.status.${status}`)}</span>
        </p>
        <div className="card card-pad">
          <ProfileForm initial={initial} next={next ? safeNext(next) : undefined} />
        </div>
      </div>
    </div>
  );
}
