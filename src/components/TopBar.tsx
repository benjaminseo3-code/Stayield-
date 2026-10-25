import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/adapters";
import { getT } from "@/i18n/server";
import { LogoMark } from "./Logo";
import { NavMenu, type NavItem } from "./NavMenu";

export async function TopBar() {
  const { t } = await getT();
  const user = await auth.getSession(await headers());

  const items: NavItem[] = [
    { href: "/properties", label: t("nav.browse") },
    { href: "/sell", label: t("nav.sell") },
  ];
  if (user?.role === "admin") items.push({ href: "/admin", label: t("nav.admin") });
  items.push(user ? { href: "/account", label: t("nav.account") } : { href: "/sign-in", label: t("nav.signIn") });

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
