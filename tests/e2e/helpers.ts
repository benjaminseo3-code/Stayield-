import sharp from "sharp";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { synthRows, toCsv } from "../helpers/synthetic";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
export const PASSWORD = "Test-password-123";
export const DEMO = { owner: "seller@stayield.demo", investor: "buyer@stayield.demo", password: "Stayield-Demo-2026" };
export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@e2e.test", password: process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password-1" };

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;

export async function newContext(browser: Browser, opts: { lang?: "en" | "he"; width?: number; height?: number } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  await ctx.addCookies([{ name: "lang", value: opts.lang ?? "en", url: BASE }]);
  return ctx;
}

export async function login(page: Page, email: string, password: string, next = "/"): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByTestId("signin-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

/** Creates an account through the real sign-up form. Investors land on the verification page, owners on /sell. */
export async function signUp(page: Page, role: "buyer" | "seller", opts: { name?: string; email?: string; next?: string } = {}): Promise<string> {
  const email = opts.email ?? uniqueEmail(role === "buyer" ? "investor" : "owner");
  await page.goto(`/sign-up?role=${role}${opts.next ? `&next=${encodeURIComponent(opts.next)}` : ""}`);
  await page.getByTestId(`role-${role}`).check();
  await page.locator("#name").fill(opts.name ?? (role === "buyer" ? "Test Investor" : "Test Owner"));
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByTestId("signup-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-up"));
  return email;
}

export async function fillProfile(page: Page, opts: { name?: string } = {}): Promise<void> {
  await page.goto("/account/verification");
  await page.locator("#fullName").fill(opts.name ?? "Test Investor");
  await page.locator("#phone").fill("+972 50 123 4567");
  await page.locator("#country").fill("Israel");
  await page.locator("#budgetMin").fill("250000");
  await page.locator("#budgetMax").fill("450000");
  await page.getByTestId("target-GR").check();
  await page.getByTestId("target-CY").check();
  await page.locator("#about").fill("I run two short-term rentals in Tel Aviv and want one more in Southern Europe with verified numbers.");
  await page.getByTestId("profile-submit").click();
  await page.getByTestId("profile-saved").waitFor(); // navigating away earlier can drop the submit on a slow server
}

export const jpeg = (w = 1200, h = 800, color = "#336699") => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

/** A synthetic report CSV ending ~40 days ago and covering ~12 months. */
export function reportCsv(opts: { duplicate?: boolean } = {}): string {
  const start = new Date(Date.now() - 410 * 86_400_000).toISOString().slice(0, 10);
  const rows = synthRows(start, 64);
  if (opts.duplicate) rows.push(rows[10]);
  return toCsv(rows);
}

/** Photo ids on a listing page (the blurred or sharp ones, whichever the viewer was given). */
export async function photoIds(page: Page): Promise<string[]> {
  const srcs = await page.locator("img[src^='/api/photos/']").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src") ?? ""));
  return [...new Set(srcs.map((s) => s.split("/")[3]))];
}
