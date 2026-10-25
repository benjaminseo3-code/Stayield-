import { defineConfig } from "@playwright/test";

// Runs the e2e flows against a deployed URL (E2E_BASE). No local server.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE,
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined },
  },
});
