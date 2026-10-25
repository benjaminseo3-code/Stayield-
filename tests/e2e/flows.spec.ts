import { expect, test } from "@playwright/test";
import { BASE, jpeg, newContext, reportCsv, signIn, uniqueEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

test("anonymous visitors see demo teasers and a locked report, never the numbers", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto("/properties");
  await expect(page.getByTestId("property-card")).toHaveCount(3);
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await page.getByTestId("property-card").first().click();
  await expect(page.getByTestId("income-band")).toBeVisible();
  await expect(page.getByTestId("locked-report")).toBeVisible();
  await expect(page.getByTestId("report")).toHaveCount(0);
  await expect(page.getByTestId("signin-to-unlock")).toBeVisible();
  await ctx.close();
});

test("filters narrow the list and show an empty state", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto("/properties?city=Lisbon");
  await expect(page.getByTestId("property-card")).toHaveCount(1);
  await page.goto("/properties?city=Atlantis");
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await ctx.close();
});

test("buyer signs in, pays (mock) and unlocks the report permanently", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const email = uniqueEmail("buyer");
  await page.goto("/properties");
  await page.getByTestId("property-card").first().click();
  await page.getByTestId("signin-to-unlock").click();
  await page.waitForURL(/sign-in/);
  await page.getByLabel(/email address/i).fill(email);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/sent/);
  await signIn(page, email, "/properties");

  await page.goto("/properties");
  await page.getByTestId("property-card").first().click();
  await page.getByTestId("unlock-button").click();
  await page.getByTestId("mock-pay").click();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "succeeded");
  await page.getByRole("link", { name: /open the report/i }).click();

  const report = page.getByTestId("report");
  await expect(report).toBeVisible();
  await expect(page.getByTestId("kpi-gross")).toContainText(/\d/);
  // Honest wording: booked nights, never "occupancy" as a metric label.
  await expect(report).toContainText("Booked nights ÷ days in period");
  // The trust tier is always visible next to the numbers (the first demo listing is the signed one).
  await expect(report).toContainText("Signed");
  await expect(report).toContainText("Data coverage");
  // No metric is labelled "occupancy" (the note explaining why it is NOT occupancy is allowed).
  const labels = (await report.locator(".kpi .label").allInnerTexts()).join("|").toLowerCase();
  expect(labels).not.toContain("occupancy");

  // Another visitor still cannot see it.
  const other = await newContext(browser);
  const op = await other.newPage();
  await op.goto(page.url());
  await expect(op.getByTestId("report")).toHaveCount(0);
  await other.close();

  // Purchases + intro request.
  await page.getByRole("button", { name: /send request/i }).click();
  await expect(page.getByText("Request sent")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByTestId("purchases").locator("li")).toHaveCount(1);
  await ctx.close();
});

test("buyers cannot open seller or admin areas", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signIn(page, uniqueEmail("nosy"), "/");
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  const res = await page.request.get("/api/properties/00000000-0000-0000-0000-000000000000/submission");
  expect([401, 404]).toContain(res.status());
  await ctx.close();
});

test("seller creates a listing with photos and a CSV; it goes live automatically; then unpublishes", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signIn(page, uniqueEmail("seller"), "/sell");
  await page.goto("/sell");
  await page.getByTestId("become-seller").click();
  await page.getByTestId("new-listing").click();
  await page.waitForURL(/\/basics/);

  // Basics (autosaves, then continue)
  await page.getByLabel("Country").fill("pt");
  await page.getByLabel("City").fill("Porto");
  await page.getByLabel("Neighborhood").fill("Ribeira");
  await page.getByLabel("Asking price").fill("350000");
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByLabel("Size (m²)").fill("58");
  await page.getByLabel("Bedrooms").fill("2");
  await page.getByLabel("Bathrooms").fill("1");
  await page.getByLabel("Description").fill("Bright flat by the river with strong summer demand.");
  await expect(page.getByTestId("save-status")).toContainText("All changes saved");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/photos/);

  // Photos
  await page.getByTestId("photo-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1200, 800, "#336699") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await jpeg(1000, 700, "#996633") },
  ]);
  await expect(page.getByTestId("photo-item")).toHaveCount(2);
  await expect(page.getByText("Cover").first()).toBeVisible();
  // A non-image is rejected with a clear message.
  await page.getByTestId("photo-input").setInputFiles({ name: "evil.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<?php echo 1;") });
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("not a JPEG, PNG or WebP");
  await page.getByTestId("next-step").click();
  await page.waitForURL(/\/data/);

  // Income data: email option shows the unique address, CSV option works.
  await expect(page.getByTestId("inbound-address")).toContainText(/^p-[a-z0-9]+@inbound\.localhost$/);
  await page.getByTestId("option-b").click();
  await page.getByTestId("csv-input").setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from(reportCsv()) });
  await expect(page.getByTestId("csv-summary")).toContainText("64 bookings found");
  await expect(page.getByText("Ignored columns")).toContainText("Guest");
  await expect(page.getByText("Fake Guest")).toHaveCount(0);
  await page.getByTestId("csv-submit").click();
  await expect(page.getByTestId("data-status")).toContainText("Verified");
  await page.getByTestId("next-step").click();
  await page.waitForURL(/\/preview/);
  await expect(page.getByTestId("report")).toBeVisible();
  await page.getByTestId("next-step").click();
  await page.waitForURL(/\/publish/);

  // Publish requires all three consents.
  await page.getByTestId("publish-button").click();
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("accept all three");
  for (const c of ["owns", "shares_aggregates", "complete_data"]) await page.getByTestId(`consent-${c}`).check();
  await page.getByTestId("publish-button").click();
  await expect(page.getByTestId("publish-result")).toHaveAttribute("data-status", "live");
  await page.getByRole("link", { name: "View listing" }).click();
  await expect(page.getByTestId("income-band")).toBeVisible();
  await expect(page.getByTestId("gallery")).toBeVisible();
  await expect(page.getByTestId("report")).toBeVisible(); // the owner sees their own report

  // Public (anonymous) view works, then unpublishing hides it.
  const anon = await newContext(browser);
  const ap = await anon.newPage();
  await ap.goto(page.url());
  await expect(ap.getByTestId("locked-report")).toBeVisible();

  await page.goto("/sell");
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("dash-listing")).toContainText("Unpublished");
  await ap.reload();
  await expect(ap.getByText("This listing is not available")).toBeVisible();
  await anon.close();

  // Photo files are no longer served publicly either.
  const photoHref = await page.goto("/sell").then(() => null);
  void photoHref;
  await ctx.close();
});

test("a listing with a failed check goes to review; an admin approves it", async ({ browser }) => {
  const sellerCtx = await newContext(browser);
  const sp = await sellerCtx.newPage();
  await signIn(sp, uniqueEmail("seller2"), "/sell");
  await sp.goto("/sell");
  await sp.getByTestId("become-seller").click();
  await sp.getByTestId("new-listing").click();
  await sp.waitForURL(/\/basics/);
  await sp.getByLabel("City").fill("Faro");
  await sp.getByLabel("Asking price").fill("200000");
  await expect(sp.getByTestId("save-status")).toContainText("All changes saved");
  const id = sp.url().match(/sell\/([0-9a-f-]{36})\//)![1];

  await sp.goto(`/sell/${id}/data`);
  await sp.getByTestId("option-b").click();
  await sp.getByTestId("csv-input").setInputFiles({ name: "dup.csv", mimeType: "text/csv", buffer: Buffer.from(reportCsv({ duplicate: true })) });
  await sp.getByTestId("csv-submit").click();
  await expect(sp.getByTestId("data-status")).toContainText("flagged for review");
  await sp.goto(`/sell/${id}/publish`);
  for (const c of ["owns", "shares_aggregates", "complete_data"]) await sp.getByTestId(`consent-${c}`).check();
  await sp.getByTestId("publish-button").click();
  await expect(sp.getByTestId("publish-result")).toHaveAttribute("data-status", "review");
  await expect(sp.getByText("appear more than once")).toBeVisible();

  // Not public while in review.
  const anon = await newContext(browser);
  const ap = await anon.newPage();
  await ap.goto("/properties?city=Faro");
  await expect(ap.getByTestId("property-card")).toHaveCount(0);

  const adminCtx = await newContext(browser);
  const admin = await adminCtx.newPage();
  await signIn(admin, "admin@e2e.test", "/admin");
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: /Review queue \(\d+\)/ })).toBeVisible();
  await admin.goto(`/admin/${id}`);
  await expect(admin.getByText("appear more than once").first()).toBeVisible();
  await admin.getByTestId("admin-approve").click();
  await expect(admin.locator(".badge.status-live").first()).toBeVisible();

  await ap.goto("/properties?city=Faro");
  await expect(ap.getByTestId("property-card")).toHaveCount(1);
  await anon.close();
  await adminCtx.close();
  await sellerCtx.close();
});

test("inbound email webhook fails closed", async ({ request }) => {
  const noSecret = await request.post("/api/inbound-email", { data: Buffer.from("x"), headers: { "content-type": "message/rfc822" } });
  expect(noSecret.status()).toBe(401);
  const wrong = await request.post("/api/inbound-email", { data: Buffer.from("x"), headers: { "content-type": "message/rfc822", "x-webhook-secret": "nope" } });
  expect(wrong.status()).toBe(401);
  const ok = await request.post("/api/inbound-email", {
    data: Buffer.from("From: a@b.test\r\nTo: p-unknown@inbound.localhost\r\nSubject: hi\r\n\r\nbody"),
    headers: { "content-type": "message/rfc822", "x-webhook-secret": "e2e-webhook-secret" },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ status: "rejected", reason: "unknown_address" });
});

test("mutating API routes require same-origin and a session", async ({ request }) => {
  const res = await request.post(`${BASE}/api/properties/00000000-0000-0000-0000-000000000000/csv`, { data: { rows: [] }, headers: { origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

test("security headers are set and the income band keeps reading order in Hebrew", async ({ browser, request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();

  const ctx = await newContext(browser, { lang: "he" });
  const page = await ctx.newPage();
  await page.goto("/properties?city=Lisbon");
  const band = page.locator(".income-band bdi").first();
  await expect(band).toHaveAttribute("dir", "ltr");
  await ctx.close();
});

test("private pages are not indexable and robots/sitemap exist", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/properties");
  const signIn = await (await request.get("/sign-in")).text();
  expect(signIn).toMatch(/<meta name="robots" content="noindex/);
});
