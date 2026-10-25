import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";
import { LangProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { Footer } from "@/components/Footer";
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
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: `${t("brand.name")} — ${t("brand.tagline")}`, template: `%s · ${t("brand.name")}` },
    description: t("home.hero.sub"),
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
