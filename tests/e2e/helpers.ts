import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { BrowserContext, Page } from "@playwright/test";
import { synthRows, toCsv } from "../helpers/synthetic";

export const BASE = "http://localhost:3100";
const OUTBOX = path.join(process.cwd(), ".data", "e2e-outbox");

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;

/** The newest sign-in link emailed to `email` (read from the dev outbox directory). */
export function latestMagicLink(email: string): string {
  const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter((f) => f.endsWith(".json")).sort().reverse() : [];
  for (const f of files) {
    const mail = JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf8")) as { to: string; text: string; subject: string };
    if (mail.to !== email || !/Sign in/i.test(mail.subject)) continue;
    const m = mail.text.match(/https?:\/\/\S+magic-link\/verify\S+/);
    if (m) return m[0];
  }
  throw new Error(`no magic link for ${email}`);
}

export async function signIn(page: Page, email: string, next = "/"): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email address|כתובת מייל/i).fill(email);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/sign-in\/sent/);
  await page.goto(latestMagicLink(email));
  await page.waitForLoadState("load");
}

export async function newContext(browser: import("@playwright/test").Browser, opts: { lang?: "en" | "he"; width?: number; height?: number } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 } });
  await ctx.addCookies([{ name: "lang", value: opts.lang ?? "en", url: BASE }]);
  return ctx;
}

export const jpeg = (w = 1200, h = 800, color = "#336699") => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

/** A synthetic report CSV ending ~40 days ago and covering ~12 months. */
export function reportCsv(opts: { duplicate?: boolean } = {}): string {
  const start = new Date(Date.now() - 410 * 86_400_000).toISOString().slice(0, 10);
  const rows = synthRows(start, 64);
  if (opts.duplicate) rows.push(rows[10]);
  return toCsv(rows);
}
