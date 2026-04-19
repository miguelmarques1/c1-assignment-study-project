import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://videomax:videomax@127.0.0.1:5433/videomax";
const sessionSecret =
  process.env.SESSION_SECRET ??
  "playwright-e2e-session-secret-min-32-chars-long";
const appPort = process.env.APP_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${appPort}`;

process.env.DATABASE_URL = databaseUrl;
process.env.SESSION_SECRET = sessionSecret;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${appPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
      APP_PORT: appPort,
    },
  },
});
