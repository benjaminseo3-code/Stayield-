import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";
import { LangProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { Footer } from "@/components/Footer";
import { appUrl } from "@/lib/app-url";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
  display: "swap",
});
const frank = Frank_Ruhl_Libre({
  subsets: ["latin", "hebrew"],
  weight: ["500", "700"],
  variable: "--font-frank",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#0B1C30", width: "device-width", initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: t("lp.meta.title"), template: `%s · ${t("brand.name")}` },
    description: t("lp.sub"),
    openGraph: { type: "website", siteName: "Stayield", title: t("brand.name"), description: t("brand.tagline"), images: [{ url: "/brand/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, dir, t } = await getT();
  return (
    <html lang={lang} dir={dir} className={`${heebo.variable} ${frank.variable}`}>
      <body>
        <LangProvider lang={lang}>
          <a className="skip-link" href="#main">
            {t("nav.skip")}
          </a>
          <TopBar />
          <main id="main">{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
