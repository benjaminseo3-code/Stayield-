import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/adapters";
import { getDb } from "@/db/client";
import { getT } from "@/i18n/server";
import { investorUnseenCount, ownerPendingCount } from "@/lib/access";
import { LogoMark } from "./Logo";
import { NavMenu, type NavItem } from "./NavMenu";

export async function TopBar() {
  const { t } = await getT();
  const user = await auth.getSession(await headers());

  // Badge: requests waiting for an owner, or news for an investor.
  let badge = 0;
  if (user) {
    const db = await getDb();
    badge = user.role === "seller" ? await ownerPendingCount(db, user.id) : user.role === "buyer" ? await investorUnseenCount(db, user.id) : 0;
  }

  const items: NavItem[] = [{ href: "/properties", label: t("nav.browse") }];
  if (user && user.role !== "admin") items.push({ href: "/requests", label: t("nav.requests"), badge });
  if (!user || user.role !== "buyer") items.push({ href: "/sell", label: user?.role === "seller" ? t("nav.myListings") : t("nav.sell") });
  if (user?.role === "admin") items.push({ href: "/admin", label: t("nav.admin") });
  if (user) items.push({ href: "/account", label: t("nav.account") });
  else {
    items.push({ href: "/sign-in", label: t("nav.signIn") });
    items.push({ href: "/sign-up", label: t("nav.signUp"), primary: true });
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner" style={{ position: "relative" }}>
        <Link href="/" className="logo" aria-label={t("brand.name")}>
          <LogoMark />
          <span>{t("brand.name")}</span>
        </Link>
        <NavMenu items={items} />
      </div>
    </header>
  );
}
