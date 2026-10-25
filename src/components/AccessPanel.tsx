import Link from "next/link";
import { requestAccessAction } from "@/app/actions/requests";
import { getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import type { Listing } from "@/lib/data/listings";
import { cooldownEnd as cooldownEndOf, isCoolingDown } from "@/lib/access";
import type { InvestorStatus } from "@/lib/policies";
import type { AccessRequest } from "@/db/schema";

type Viewer = { id: string; role: "seller" | "buyer" | "admin" } | null;

/** The "request access" box on a listing. What it shows depends on who is looking and where their request stands. */
export async function AccessPanel({
  listing,
  viewer,
  isOwner,
  profileStatus,
  request,
  error,
}: {
  listing: Listing;
  viewer: Viewer;
  isOwner: boolean;
  profileStatus: InvestorStatus | null;
  request: AccessRequest | null;
  error?: string;
}) {
  const { t, lang } = await getT();
  const here = `/properties/${listing.slug}`;
  const statusKey = request?.status;
  const cooldownEnd = cooldownEndOf(request);
  const coolingDown = isCoolingDown(request);

  const box = (body: React.ReactNode, tone: "" | "ok" | "warn" = "") => (
    <section className={`card card-pad stack panel-accent`} aria-labelledby="access-h" data-testid="access-panel" data-state={statusKey ?? (viewer ? "none" : "anon")}>
      <h2 id="access-h" style={{ fontSize: "1.4rem", margin: 0 }}>{t("access.title")}</h2>
      {error && <p className="notice error" role="alert">{t(`access.error.${error}` as "access.error.profile")}</p>}
      <div className={tone ? `notice ${tone}` : undefined}>{body}</div>
    </section>
  );

  if (isOwner) {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}>{t("access.owner.body")}</p>
        <Link className="btn btn-secondary sm" href="/requests">{t("access.owner.cta")}</Link>
      </>,
    );
  }
  if (!viewer) {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}>{t("access.anon.body")}</p>
        <div className="row">
          <Link className="btn btn-primary" href={`/sign-up?role=buyer&next=${encodeURIComponent(here)}`} data-testid="signup-to-request">{t("access.anon.signup")}</Link>
          <Link className="btn btn-secondary" href={`/sign-in?next=${encodeURIComponent(here)}`}>{t("nav.signIn")}</Link>
        </div>
      </>,
    );
  }
  if (viewer.role === "seller") return box(<p style={{ margin: 0 }}>{t("access.seller.body")}</p>);
  if (viewer.role === "admin") return box(<p style={{ margin: 0 }}>{t("access.admin.body")}</p>);

  // Investor from here on.
  if (statusKey === "approved") {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}><strong>{t("access.approved")}</strong></p>
        <Link className="btn btn-secondary sm" href={`/requests/${request!.id}`}>{t("access.viewRequest")}</Link>
      </>,
      "ok",
    );
  }
  if (statusKey === "pending") {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}>{t("access.pending")}</p>
        <Link className="btn btn-secondary sm" href={`/requests/${request!.id}`}>{t("access.viewRequest")}</Link>
      </>,
      "warn",
    );
  }
  if (statusKey === "info_requested") {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}><strong>{t("access.info")}</strong></p>
        <Link className="btn btn-primary sm" href={`/requests/${request!.id}`}>{t("access.info.cta")}</Link>
      </>,
      "warn",
    );
  }
  if (profileStatus === "suspended") return box(<p style={{ margin: 0 }}>{t("access.suspended")}</p>);
  if (profileStatus !== "submitted" && profileStatus !== "verified") {
    return box(
      <>
        <p style={{ margin: "0 0 12px" }}>{t("access.needProfile.body")}</p>
        <Link className="btn btn-primary" href={`/account/verification?next=${encodeURIComponent(here)}`} data-testid="complete-profile">{t("access.needProfile.cta")}</Link>
      </>,
    );
  }

  const prefix =
    statusKey === "declined" ? (
      <p style={{ margin: "0 0 12px" }}>{t("access.declined")}{coolingDown ? ` ${t("access.cooldown", { date: formatDate(cooldownEnd!.toISOString().slice(0, 10), lang) })}` : ` ${t("access.declined.again")}`}</p>
    ) : statusKey === "revoked" ? (
      <p style={{ margin: "0 0 12px" }}>{t("access.revoked")}</p>
    ) : statusKey === "withdrawn" ? (
      <p style={{ margin: "0 0 12px" }}>{t("access.withdrawn")}</p>
    ) : null;

  if (coolingDown) return box(prefix, "warn");
  return box(
    <>
      {prefix}
      <form action={requestAccessAction} className="stack" style={{ ["--gap" as string]: "10px" }}>
        <input type="hidden" name="propertyId" value={listing.id} />
        <p className="muted" style={{ margin: 0 }}>{t("access.request.hint")}</p>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="message">{t("access.request.message")}</label>
          <textarea id="message" name="message" className="input" maxLength={1500} placeholder={t("access.request.placeholder")} />
        </div>
        <button className="btn btn-primary" type="submit" data-testid="request-access">{t("access.request.send")}</button>
      </form>
    </>,
  );
}
