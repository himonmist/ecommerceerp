import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL; // set to test a deployed environment
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://lv:lv_local_dev@localhost:5432/lv_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: BASE_URL ? undefined : "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL ?? `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /landing\.spec\.ts/ },
  ],
  webServer: BASE_URL ? undefined : {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL, APP_URL: `http://localhost:${PORT}` },
    timeout: 120_000,
  },
});
