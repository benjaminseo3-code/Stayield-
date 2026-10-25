"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LangToggle } from "./LangToggle";

export type NavItem = { href: string; label: string };

/** Desktop nav + mobile hamburger panel. Items are resolved on the server. */
export function NavMenu({ items }: { items: NavItem[] }) {
  const t = useT();
  const pathname = usePathname();
  // The panel is "open" only for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <nav className="nav" aria-label="Main">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={isCurrent(i.href) ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
        <LangToggle />
      </nav>
      <button
        type="button"
        className="btn btn-ghost sm menu-btn"
        aria-expanded={open}
        aria-controls="mobile-panel"
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {t("nav.menu")} <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <div id="mobile-panel" className="mobile-panel" style={{ position: "absolute", insetInline: 0, top: "var(--topbar-h)" }}>
          {items.map((i) => (
            <Link key={i.href} href={i.href}>
              {i.label}
            </Link>
          ))}
          <div>
            <LangToggle />
          </div>
        </div>
      )}
    </>
  );
}
