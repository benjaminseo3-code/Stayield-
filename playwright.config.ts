import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined },
  },
  webServer: {
    // Uses an isolated database + file area; run `pnpm build` first.
    command: `pnpm db:migrate && pnpm db:seed && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PGLITE_DIR: ".data/e2e-db",
      STORAGE_DIR: ".data/e2e-files",
      OUTBOX_DIR: ".data/e2e-outbox",
      APP_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-00",
      INBOUND_WEBHOOK_SECRET: "e2e-webhook-secret",
      ADMIN_EMAILS: "admin@e2e.test",
      // e2e runs a production build, where the mock payment provider is otherwise refused.
      ALLOW_MOCK_PAYMENTS: "true",
      // The tour signs in dozens of times from one IP, which the sign-in rate limit would (rightly) block.
      RATE_LIMIT_DISABLED: "true",
    },
  },
});
