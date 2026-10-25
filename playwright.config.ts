import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a seeded database (npm run db:seed) with
 * PAYMENTS_MOCK=true. Set E2E_BASE_URL to reuse an already running server;
 * otherwise a dev server is started on port 3217.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3217";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3217", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
