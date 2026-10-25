import { expect, test } from "@playwright/test";
import { ADMIN, BASE, DEMO, fillProfile, jpeg, login, newContext, photoIds, reportCsv, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

const ATHENS = "/properties/demo-athens-koukaki";
const alert = (page: import("@playwright/test").Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

test("guests are sent to sign in; members see every listing blurred and the real values are not even in the page", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto("/properties");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fproperties/);
  await page.goto(ATHENS);
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fproperties%2Fdemo-athens-koukaki/);
  await expect(page.locator("body")).not.toContainText("Koukaki");

  await signUp(page, "buyer", { name: "Browsing Investor", next: "/properties" });
  await page.goto("/properties");
  await expect(page.getByTestId("property-card")).toHaveCount(3);
  for (const card of await page.getByTestId("property-card").all()) await expect(card).toHaveAttribute("data-level", "locked");
  await expect(page.locator("img.blurred-photo").first()).toBeVisible();

  const html = await page.content();
  for (const secret of ["420,000", "1,950,000", "285,000", "Germasogeia", "Florentin", "Koukaki", "Bright two-bedroom"]) expect(html, `leaked ${secret}`).not.toContain(secret);

  // The photo route only gives the blurred variant to people without access.
  const ids = await photoIds(page);
  expect(ids.length).toBeGreaterThan(0);
  expect((await page.request.get(`/api/photos/${ids[0]}/blur.webp`)).status()).toBe(200);
  for (const v of ["full.jpg", "full.webp", "thumb.webp"]) expect((await page.request.get(`/api/photos/${ids[0]}/${v}`)).status()).toBe(404);

  await page.goto(ATHENS);
  await expect(page.getByTestId("locked-gallery")).toBeVisible();
  await expect(page.getByTestId("report")).toHaveCount(0);
  await expect(page.getByTestId("report-locked")).toBeVisible();
  const detail = await page.content();
  for (const secret of ["285,000", "Koukaki", "Acropolis"]) expect(detail).not.toContain(secret);
  await expect(page.getByTestId("complete-profile")).toBeVisible();
  await ctx.close();
});

test("filters narrow the list and show an empty state", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await signUp(page, "buyer", { name: "Filtering Investor", next: "/properties" });
  await page.goto("/properties?city=Limassol");
  await expect(page.getByTestId("property-card")).toHaveCount(1);
  await page.goto("/properties?country=GR");
  await expect(page.getByTestId("property-card")).toHaveCount(1);
  await page.goto("/properties?city=Atlantis");
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await ctx.close();
});

test("investor journey: sign up, verify, request, answer a question, get approved, see everything, then lose access", async ({ browser }) => {
  const investorCtx = await newContext(browser);
  const inv = await investorCtx.newPage();
  const ownerCtx = await newContext(browser);
  const own = await ownerCtx.newPage();

  // 1. Sign up as an investor; the profile comes first.
  const email = await signUp(inv, "buyer", { name: "Maya Investor", next: ATHENS });
  await expect(inv).toHaveURL(/\/account\/verification/);
  await expect(inv.getByTestId("profile-status")).toHaveText("Not submitted");

  // 2. Without a profile the listing only offers to complete it.
  await inv.goto(ATHENS);
  await expect(inv.getByTestId("access-panel")).toHaveAttribute("data-state", "none");
  await expect(inv.getByTestId("complete-profile")).toBeVisible();
  await expect(inv.getByTestId("request-access")).toHaveCount(0);

  // 3. Complete the profile (validation first), then request access.
  await inv.goto("/account/verification");
  await inv.locator("#about").fill("short");
  await inv.getByTestId("profile-submit").click();
  await expect(alert(inv).first()).toBeVisible();
  await fillProfile(inv, { name: "Maya Investor" });
  await expect(inv.getByTestId("profile-saved")).toBeVisible();

  await inv.goto(ATHENS);
  await inv.locator("#message").fill("I love the Koukaki location and run two similar apartments. Could you share the full numbers?");
  await inv.getByTestId("request-access").click();
  await inv.waitForURL(/\/requests\//);
  await expect(inv.getByTestId("request-status")).toHaveText("Waiting for the owner");
  const requestUrl = inv.url();

  // Still blurred while pending: nothing sharp is served.
  await inv.goto(ATHENS);
  await expect(inv.getByTestId("access-panel")).toHaveAttribute("data-state", "pending");
  expect(await inv.content()).not.toContain("285,000");
  const lockedIds = await photoIds(inv);
  expect((await inv.request.get(`/api/photos/${lockedIds[0]}/full.jpg`)).status()).toBe(404);

  // 4. The owner sees it: badge, the investor's profile, no contact details yet.
  await login(own, DEMO.owner, DEMO.password, "/requests");
  await expect(own.getByTestId("nav-badge").first()).toBeVisible();
  await own.getByTestId("request-row").filter({ hasText: "Maya Investor" }).click();
  const profile = own.getByTestId("investor-profile");
  await expect(profile).toContainText("Maya Investor");
  await expect(profile).toContainText("Israel");
  await expect(profile).toContainText("Cyprus, Greece");
  await expect(profile).not.toContainText(email);
  await expect(profile).not.toContainText("+972 50 123 4567");

  // 5. The owner asks a question; the investor gets a badge and answers.
  await own.locator("#note").fill("Do you plan to run it yourself or through a manager?");
  await own.getByTestId("decide-ask").click();
  await expect(own.getByTestId("request-status")).toHaveText("More information requested");

  await inv.goto("/requests");
  await expect(inv.getByTestId("nav-badge").first()).toBeVisible();
  await inv.goto(requestUrl);
  await expect(inv.getByTestId("thread")).toContainText("through a manager");
  await inv.locator("#body").fill("Through a manager, and I can close within 60 days.");
  await inv.getByTestId("reply-send").click();
  await expect(inv.getByTestId("request-status")).toHaveText("Waiting for the owner");

  // 6. The owner approves; contact details are now shared with the owner.
  await own.reload();
  await own.goto(own.url());
  await own.getByTestId("decide-approve").waitFor();
  await own.locator("#note").fill("Thanks, approved.");
  await own.getByTestId("decide-approve").click();
  await expect(own.getByTestId("request-status")).toHaveText("Approved");
  await expect(own.getByTestId("investor-profile")).toContainText(email);
  await expect(own.getByTestId("investor-profile")).toContainText("+972 50 123 4567");

  // 7. The investor now sees the whole listing: price, report, sharp photos.
  await inv.goto(ATHENS);
  await expect(inv.getByTestId("access-panel")).toHaveAttribute("data-state", "approved");
  await expect(inv.getByTestId("asking-price")).toContainText("285,000");
  await expect(inv.getByTestId("report")).toBeVisible();
  await expect(inv.getByTestId("kpi-gross")).toContainText(/\d/);
  const sharpIds = await photoIds(inv);
  expect((await inv.request.get(`/api/photos/${sharpIds[0]}/full.jpg`)).status()).toBe(200);
  await inv.goto("/properties");
  await expect(inv.locator("[data-testid=property-card][data-level=full]")).toHaveCount(1); // only Athens: this investor was approved for just that listing

  // Another investor still sees nothing, even with the photo id.
  const otherCtx = await newContext(browser);
  const other = await otherCtx.newPage();
  await signUp(other, "buyer");
  expect((await other.request.get(`/api/photos/${sharpIds[0]}/full.jpg`)).status()).toBe(404);
  expect((await other.request.get(requestUrl)).status()).toBe(404); // a stranger gets "no such request", not "forbidden"
  await other.goto(requestUrl);
  await expect(other.getByRole("heading", { name: /not found|404|לא נמצא/i }).first()).toBeVisible();
  await otherCtx.close();

  // 8. The owner withdraws access; the investor is locked out again.
  await own.getByTestId("revoke").click();
  await expect(own.getByTestId("request-status")).toHaveText("Access withdrawn");
  await inv.goto(ATHENS);
  expect(await inv.content()).not.toContain("285,000");
  await expect(inv.getByTestId("report")).toHaveCount(0);
  expect((await inv.request.get(`/api/photos/${sharpIds[0]}/full.jpg`)).status()).toBe(404);

  await investorCtx.close();
  await ownerCtx.close();
});

test("a declined investor cannot ask again right away", async ({ browser }) => {
  const invCtx = await newContext(browser);
  const inv = await invCtx.newPage();
  const ownCtx = await newContext(browser);
  const own = await ownCtx.newPage();
  await signUp(inv, "buyer", { name: "Dan Declined" });
  await fillProfile(inv, { name: "Dan Declined" });
  await inv.goto("/properties/demo-tel-aviv-florentin");
  await inv.getByTestId("request-access").click();
  await inv.waitForURL(/\/requests\//);

  await login(own, DEMO.owner, DEMO.password, "/requests");
  await own.getByTestId("request-row").filter({ hasText: "Dan Declined" }).click();
  await own.locator("#note").fill("Not a fit right now.");
  await own.getByTestId("decide-decline").click();
  await expect(own.getByTestId("request-status")).toHaveText("Declined");

  await inv.goto("/properties/demo-tel-aviv-florentin");
  await expect(inv.getByTestId("access-panel")).toHaveAttribute("data-state", "declined");
  await expect(inv.getByTestId("access-panel")).toContainText("You can send a new request after");
  await expect(inv.getByTestId("request-access")).toHaveCount(0);
  await invCtx.close();
  await ownCtx.close();
});

test("roles and areas are separated", async ({ browser }) => {
  const anon = await newContext(browser);
  const ap = await anon.newPage();
  await ap.goto("/requests");
  await expect(ap).toHaveURL(/\/sign-in/);
  await ap.goto("/account/verification");
  await expect(ap).toHaveURL(/\/sign-in/);
  const unauth = await ap.request.get("/api/properties/00000000-0000-0000-0000-000000000000/submission");
  expect([401, 404]).toContain(unauth.status());
  await anon.close();

  const invCtx = await newContext(browser);
  const inv = await invCtx.newPage();
  await signUp(inv, "buyer");
  await inv.goto("/admin");
  await expect(inv).not.toHaveURL(/\/admin/);
  await inv.goto("/sell");
  await expect(inv.getByTestId("new-listing")).toHaveCount(0); // investors do not get the owner dashboard
  await invCtx.close();

  const ownerCtx = await newContext(browser);
  const own = await ownerCtx.newPage();
  await login(own, DEMO.owner, DEMO.password);
  await own.goto(ATHENS);
  await expect(own.getByText("This is your listing.")).toBeVisible();
  await expect(own.getByTestId("asking-price")).toContainText("285,000"); // owners always see their own listing in full
  await own.goto("/account/verification");
  await expect(own).toHaveURL(/\/account$/); // owners have no investor profile
  await ownerCtx.close();

  // Wrong password and unknown user get the same message.
  const bad = await newContext(browser);
  const bp = await bad.newPage();
  await bp.goto("/sign-in");
  await bp.locator("#email").fill(DEMO.owner);
  await bp.locator("#password").fill("not-the-password");
  await bp.getByTestId("signin-submit").click();
  await expect(alert(bp).first()).toContainText("Wrong email or password");
  await bad.close();
});

test("an owner lists an apartment; it appears blurred to everyone; an investor requests it; the owner approves", async ({ browser }) => {
  const ownerCtx = await newContext(browser);
  const own = await ownerCtx.newPage();
  await signUp(own, "seller", { name: "Olivia Owner" });
  await own.goto("/sell");
  await own.getByTestId("new-listing").click();
  await own.waitForURL(/\/basics/);

  await own.getByLabel("Country").selectOption("CY");
  await own.getByLabel("City").fill("Porto");
  await own.getByLabel("Neighborhood").fill("Ribeira");
  await own.getByLabel("Asking price").fill("350000");
  await own.getByLabel("Currency").selectOption("EUR");
  await own.getByLabel("Size (m²)").fill("58");
  await own.getByLabel("Bedrooms").fill("2");
  await own.getByLabel("Bathrooms").fill("1");
  await own.getByLabel("Description").fill("Bright flat by the river with strong summer demand.");
  await expect(own.getByTestId("save-status")).toContainText("All changes saved");
  await own.getByRole("button", { name: "Continue" }).click();
  await own.waitForURL(/\/photos/);

  await own.getByTestId("photo-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1200, 800, "#336699") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await jpeg(1000, 700, "#996633") },
  ]);
  await expect(own.getByTestId("photo-item")).toHaveCount(2);
  await own.getByTestId("photo-input").setInputFiles({ name: "evil.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<?php echo 1;") });
  await expect(alert(own).first()).toContainText("not a JPEG, PNG or WebP");
  await own.getByTestId("next-step").click();
  await own.waitForURL(/\/data/);

  await expect(own.getByTestId("inbound-address")).toContainText(/^p-[a-z0-9]+@inbound\./);
  await own.getByTestId("option-b").click();
  await own.getByTestId("csv-input").setInputFiles({ name: "report.csv", mimeType: "text/csv", buffer: Buffer.from(reportCsv()) });
  await expect(own.getByTestId("csv-summary")).toContainText("64 bookings found");
  await expect(own.getByText("Fake Guest")).toHaveCount(0);
  await own.getByTestId("csv-submit").click();
  await expect(own.getByTestId("data-status")).toContainText("Verified");
  await own.getByTestId("next-step").click();
  await own.waitForURL(/\/preview/);
  await expect(own.getByTestId("report")).toBeVisible();
  await own.getByTestId("next-step").click();
  await own.waitForURL(/\/publish/);

  await own.getByTestId("publish-button").click();
  await expect(alert(own).first()).toContainText("accept all three");
  for (const c of ["owns", "shares_aggregates", "complete_data"]) await own.getByTestId(`consent-${c}`).check();
  await own.getByTestId("publish-button").click();
  await expect(own.getByTestId("publish-result")).toHaveAttribute("data-status", "live");
  await own.getByRole("link", { name: "View listing" }).click();
  await expect(own.getByTestId("asking-price")).toContainText("350,000");
  const slug = new URL(own.url()).pathname.split("/").pop()!;

  // Everyone else sees it blurred.
  const anon = await newContext(browser);
  const ap = await anon.newPage();
  await ap.goto(`/properties/${slug}`);
  await expect(ap).toHaveURL(/\/sign-in\?next=/); // guests cannot browse
  await signUp(ap, "buyer", { name: "Window Shopper", next: `/properties/${slug}` });
  await ap.goto(`/properties/${slug}`);
  await expect(ap.getByTestId("locked-gallery")).toBeVisible();
  const html = await ap.content();
  for (const secret of ["350,000", "Ribeira", "strong summer demand"]) expect(html).not.toContain(secret);
  await anon.close();

  // An investor requests it; the dashboard shows it; the owner approves.
  const invCtx = await newContext(browser);
  const inv = await invCtx.newPage();
  await signUp(inv, "buyer", { name: "Ines Investor" });
  await fillProfile(inv, { name: "Ines Investor" });
  await inv.goto(`/properties/${slug}`);
  await inv.getByTestId("request-access").click();
  await inv.waitForURL(/\/requests\//);

  await own.goto("/sell");
  await expect(own.getByTestId("dash-requests")).toBeVisible();
  await own.getByTestId("dash-requests").click();
  await own.getByTestId("request-row").filter({ hasText: "Ines Investor" }).click();
  await own.getByTestId("decide-approve").click();
  await expect(own.getByTestId("request-status")).toHaveText("Approved");

  await inv.goto(`/properties/${slug}`);
  await expect(inv.getByTestId("asking-price")).toContainText("350,000");
  await expect(inv.getByTestId("report")).toBeVisible();

  // Unpublishing takes it away from everyone, including the approved investor.
  await own.goto("/sell");
  await own.getByRole("button", { name: "Unpublish" }).click();
  await expect(own.getByTestId("dash-listing").first()).toContainText("Unpublished");
  await inv.goto(`/properties/${slug}`);
  await expect(inv.getByText("This listing is not available")).toBeVisible();
  await invCtx.close();
  await ownerCtx.close();
});

test("a listing with a failed check goes to review; an admin approves it and verifies an investor", async ({ browser }) => {
  const sellerCtx = await newContext(browser);
  const sp = await sellerCtx.newPage();
  await signUp(sp, "seller", { name: "Sam Seller" });
  await sp.goto("/sell");
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

  const anon = await newContext(browser);
  const ap = await anon.newPage();
  await signUp(ap, "buyer", { name: "Faro Watcher", next: "/properties" });
  await ap.goto("/properties?city=Faro");
  await expect(ap.getByTestId("property-card")).toHaveCount(0);

  const adminCtx = await newContext(browser);
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN.email, ADMIN.password, "/admin");
  await admin.goto(`/admin/${id}`);
  await expect(admin.getByText("appear more than once").first()).toBeVisible();
  await admin.getByTestId("admin-approve").click();
  await expect(admin.locator(".badge.status-live").first()).toBeVisible();
  await ap.goto("/properties?city=Faro");
  await expect(ap.getByTestId("property-card")).toHaveCount(1);

  // Investor verification by an admin.
  const invCtx = await newContext(browser);
  const inv = await invCtx.newPage();
  await signUp(inv, "buyer", { name: "Vera Verified" });
  await fillProfile(inv, { name: "Vera Verified" });
  await admin.goto("/admin/investors");
  const row = admin.getByTestId("admin-investor").filter({ hasText: "Vera Verified" });
  await row.getByRole("button", { name: "Verify" }).click();
  await expect(row).toContainText("Verified by Stayield");
  await inv.goto("/account/verification");
  await expect(inv.getByTestId("profile-status")).toHaveText("Verified by Stayield");
  await anon.close();
  await adminCtx.close();
  await invCtx.close();
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
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();

  // The seeded demo investor has approved access to Limassol, so the real band is shown there.
  const ctx = await newContext(browser, { lang: "he" });
  const page = await ctx.newPage();
  await login(page, DEMO.investor, DEMO.password, "/properties?city=Limassol");
  await page.goto("/properties?city=Limassol");
  await expect(page.locator(".income-band bdi").first()).toHaveAttribute("dir", "ltr");
  await ctx.close();
});

test("private pages are not indexable and robots/sitemap exist", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/properties");
  const signIn = await (await request.get("/sign-in")).text();
  expect(signIn).toMatch(/<meta name="robots" content="noindex/);
});
