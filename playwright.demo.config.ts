import { defineConfig } from "@playwright/test";

const PORT = 3101;

/** Runs the production build in DEMO_MODE exactly as the public Vercel demo does (memory DB/storage, no mail). */
export default defineConfig({
  testDir: "tests/demo",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined } },
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DEMO_MODE: "true",
      PGLITE_DIR: "memory",
      STORAGE_ADAPTER: "memory",
      MAILER: "log",
      ALLOW_MOCK_PAYMENTS: "true",
      APP_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "demo-secret-demo-secret-demo-secret-00",
      INBOUND_WEBHOOK_SECRET: "demo-webhook-secret",
    },
  },
});
