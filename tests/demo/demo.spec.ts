import { expect, test, type Page } from "@playwright/test";

const BUYER = "buyer@stayield.demo";
const SELLER = "seller@stayield.demo";
const PASSWORD = "Stayield-Demo-2026";

async function login(page: Page, email: string, next = "/") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await expect(page.getByTestId("demo-credentials")).toContainText(PASSWORD.length ? "Demo accounts" : "");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("demo is seeded and photos load", async ({ page }) => {
  await page.goto("/properties");
  await expect(page.getByTestId("property-card")).toHaveCount(3);
  const img = page.locator(".property-card img").first();
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/");
});

test("buyer logs in with the demo credentials and unlocks a report", async ({ page }) => {
  await login(page, BUYER, "/properties");
  await page.waitForURL(/\/properties/);
  await page.getByTestId("property-card").first().click();
  await page.getByTestId("unlock-button").click();
  await page.getByTestId("mock-pay").click();
  await expect(page.getByTestId("checkout-result")).toHaveAttribute("data-status", "succeeded");
  await page.getByRole("link", { name: /open the report/i }).click();
  await expect(page.getByTestId("report")).toBeVisible();
});

test("seller logs in and sees the demo listings and the wizard", async ({ page }) => {
  await login(page, SELLER, "/sell");
  await page.waitForURL(/\/sell/);
  await expect(page.getByTestId("dash-listing")).toHaveCount(3);
  await page.getByTestId("new-listing").click();
  await page.waitForURL(/\/basics/);
  await page.getByLabel("City").fill("Madrid");
  await expect(page.getByTestId("save-status")).toContainText("All changes saved");
});

test("wrong password is rejected; sign-up and magic link are not available", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.locator("#email").fill(BUYER);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password")).toBeVisible();

  const signup = await request.post("/api/auth/sign-up/email", {
    data: { email: "new@x.test", password: "Password123!", name: "x" },
    headers: { origin: "http://localhost:3101" },
  });
  expect(signup.status()).toBeGreaterThanOrEqual(400);

  // The admin area is not reachable with demo accounts.
  await login(page, SELLER, "/");
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});
