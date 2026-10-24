import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.EMAIL_OFFERS_TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    "Set EMAIL_OFFERS_TEST_DATABASE_URL to disposable local PostgreSQL and apply migrations first."
  );
}
if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error(
    "Set AI_GATEWAY_API_KEY for the real assessment in this opt-in test."
  );
}

process.env.EMAIL_OFFERS_HTTP_E2E = "1";
process.env.CRON_SECRET = "local-email-offers-cron";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "email-offer-alerts-flow.test.ts",
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3016",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx tests/helpers/email-offers-provider.ts",
      url: "http://127.0.0.1:3017/test/messages",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3016",
      url: "http://127.0.0.1:3016/ping",
      reuseExistingServer: false,
      env: {
        PLAYWRIGHT: "true",
        AUTH_SECRET: "local-email-offers-http-test",
        POSTGRES_URL: databaseUrl,
        APP_POSTGRES_URL: databaseUrl,
        NANGO_API_KEY: "local-protocol-fixture",
        NANGO_SECRET_KEY: "local-protocol-fixture",
        NANGO_SERVER_URL: "http://127.0.0.1:3017",
        NANGO_TELEGRAM_CONNECTION_ID: "telegram-fixture",
        CRON_SECRET: process.env.CRON_SECRET,
      },
    },
  ],
});
