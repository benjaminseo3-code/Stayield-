import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { jpeg, newContext, reportCsv, signIn, uniqueEmail } from "./helpers";

/**
 * Visual tour of every page, EN and HE, desktop and mobile. For each shot we also assert:
 * no horizontal scroll, correct dir/lang, and no console errors.
 */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

fs.mkdirSync("screenshots", { recursive: true });
test.describe.configure({ mode: "serial" });

for (const lang of ["en", "he"] as const) {
  for (const vp of VIEWPORTS) {
    test(`tour ${lang} ${vp.name}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const errors: string[] = [];
      const watch = (page: Page) => {
        page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} :: ${m.text()}`));
        page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e}`));
      };
      const shot = async (page: Page, name: string) => {
        await page.waitForLoadState("load");
        // After a client-side redirect the <title> can lag the content by a tick.
        await page.waitForFunction(() => document.title.trim().length > 0);
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal scroll on ${name}`).toBeLessThanOrEqual(0);
        expect(await page.getAttribute("html", "dir")).toBe(lang === "he" ? "rtl" : "ltr");
        expect(await page.getAttribute("html", "lang")).toBe(lang);
        await page.screenshot({ path: `screenshots/${name}-${lang}-${vp.name}.png`, fullPage: true });
        // Accessibility: WCAG 2.1 A/AA rules (includes colour contrast). Any serious/critical issue fails.
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
          bad.map((v) => `${v.id} (${v.impact}) on ${name}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
          `a11y violations on ${name}`,
        ).toEqual([]);
      };
      const ctxOpts = { lang, width: vp.width, height: vp.height };

      // --- anonymous ---------------------------------------------------------
      const anon = await newContext(browser, ctxOpts);
      const ap = await anon.newPage();
      watch(ap);
      await ap.goto("/");
      await shot(ap, "home");
      await ap.goto("/properties");
      await shot(ap, "properties");
      await ap.goto("/properties?city=Atlantis");
      await shot(ap, "properties-empty");
      await ap.goto("/properties");
      await ap.getByTestId("property-card").first().click();
      await ap.getByTestId("locked-report").waitFor();
      await shot(ap, "property-locked");
      await ap.goto("/sign-in");
      await shot(ap, "sign-in");
      await ap.goto("/sell");
      await shot(ap, "sell-landing");
      await anon.close();

      // --- buyer -------------------------------------------------------------
      const buyer = await newContext(browser, ctxOpts);
      const bp = await buyer.newPage();
      watch(bp);
      await signIn(bp, uniqueEmail("tour-buyer"), "/properties");
      await bp.goto("/properties");
      await bp.getByTestId("property-card").first().click();
      await bp.getByTestId("unlock-button").click();
      await shot(bp, "checkout-mock");
      await bp.getByTestId("mock-pay").click();
      await shot(bp, "checkout-result");
      await bp.getByRole("link").filter({ hasText: /open the report|פתיחת הדוח/i }).click();
      await bp.getByTestId("report").waitFor();
      await shot(bp, "property-unlocked-report");
      await bp.goto("/account");
      await shot(bp, "account-buyer");
      await buyer.close();

      // --- seller ------------------------------------------------------------
      const seller = await newContext(browser, ctxOpts);
      const sp = await seller.newPage();
      watch(sp);
      await signIn(sp, uniqueEmail("tour-seller"), "/sell");
      await sp.goto("/sell");
      await shot(sp, "sell-become-seller");
      await sp.getByTestId("become-seller").click();
      await shot(sp, "dashboard-empty");
      await sp.getByTestId("new-listing").click();
      await sp.waitForURL(/\/basics/);
      await sp.locator("#city").fill(lang === "he" ? "תל אביב" : "Tel Aviv");
      await sp.locator("#neighborhood").fill(lang === "he" ? "פלורנטין" : "Florentin");
      await sp.locator("#country").fill("IL");
      await sp.locator("#price").fill("1800000");
      await sp.locator("#currency").selectOption("USD");
      await sp.locator("#sqm").fill("52");
      await sp.locator("#bedrooms").fill("2");
      await sp.locator("#bathrooms").fill("1");
      await sp.locator("#description").fill(lang === "he" ? "דירה מוארת עם ביקוש גבוה לאורך כל השנה." : "Bright apartment with steady demand all year round.");
      await expect(sp.getByTestId("save-status")).toContainText(lang === "he" ? "נשמרו" : "saved");
      await shot(sp, "wizard-basics");
      const id = sp.url().match(/sell\/([0-9a-f-]{36})\//)![1];

      await sp.goto(`/sell/${id}/photos`);
      await shot(sp, "wizard-photos-empty");
      await sp.getByTestId("photo-input").setInputFiles([
        { name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1600, 1100, "#3b6ea5") },
        { name: "b.jpg", mimeType: "image/jpeg", buffer: await jpeg(1400, 1000, "#a5763b") },
        { name: "c.jpg", mimeType: "image/jpeg", buffer: await jpeg(1400, 1000, "#4ea58a") },
      ]);
      await expect(sp.getByTestId("photo-item")).toHaveCount(3);
      await shot(sp, "wizard-photos");

      await sp.goto(`/sell/${id}/data`);
      await shot(sp, "wizard-data-email");
      await sp.getByTestId("option-b").click();
      await sp.getByTestId("csv-input").setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from(reportCsv()) });
      await sp.getByTestId("csv-summary").waitFor();
      await shot(sp, "wizard-data-csv-preview");
      await sp.getByTestId("csv-submit").click();
      await expect(sp.getByTestId("data-status")).toContainText(lang === "he" ? "מאומת" : "Verified");
      await shot(sp, "wizard-data-verified");

      await sp.goto(`/sell/${id}/preview`);
      await sp.getByTestId("report").waitFor();
      await shot(sp, "wizard-preview");
      await sp.goto(`/sell/${id}/publish`);
      await shot(sp, "wizard-publish");
      for (const c of ["owns", "shares_aggregates", "complete_data"]) await sp.getByTestId(`consent-${c}`).check();
      await sp.getByTestId("publish-button").click();
      await expect(sp.getByTestId("publish-result")).toHaveAttribute("data-status", "live");
      await shot(sp, "wizard-published");
      await sp.goto("/sell");
      await shot(sp, "dashboard");
      await sp.goto("/account");
      await shot(sp, "account-seller");
      await seller.close();

      // --- admin -------------------------------------------------------------
      const adminCtx = await newContext(browser, ctxOpts);
      const adm = await adminCtx.newPage();
      watch(adm);
      await signIn(adm, "admin@e2e.test", "/admin");
      await adm.goto("/admin");
      await shot(adm, "admin");
      await adm.locator('[data-testid="admin-row"] a').first().click();
      await adm.waitForLoadState("load");
      await shot(adm, "admin-property");
      await adminCtx.close();

      // 404s for Link prefetches of routes that do not exist are not expected anymore: fail on any error.
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
}
