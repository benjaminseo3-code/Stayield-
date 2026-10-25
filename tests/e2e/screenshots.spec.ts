import { test, expect } from "@playwright/test";
import fs from "node:fs";

/** Public pages screenshotted at desktop and mobile, in EN and HE. Grows with each phase. */
const PAGES: { name: string; path: string }[] = [{ name: "home", path: "/" }];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

fs.mkdirSync("screenshots", { recursive: true });

for (const lang of ["en", "he"] as const) {
  for (const vp of VIEWPORTS) {
    for (const p of PAGES) {
      test(`screenshot ${p.name} ${lang} ${vp.name}`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: vp, baseURL: "http://localhost:3100" });
        await ctx.addCookies([{ name: "lang", value: lang, url: "http://localhost:3100" }]);
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
        });
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(p.path, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        // No horizontal scroll at any width.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        expect(await page.getAttribute("html", "dir")).toBe(lang === "he" ? "rtl" : "ltr");
        await page.screenshot({ path: `screenshots/${p.name}-${lang}-${vp.name}.png`, fullPage: true });
        expect(errors, errors.join("\n")).toEqual([]);
        await ctx.close();
      });
    }
  }
}
