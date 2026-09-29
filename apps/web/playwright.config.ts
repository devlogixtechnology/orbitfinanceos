import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  testDir: "test/browser",
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: process.platform === "win32" ? "chrome" : "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec tsx test/browser/support/api-server.ts",
      port: 3100,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm build && pnpm start --port 3101",
      env: {
        ORBITOS_API_BASE_URL: "http://127.0.0.1:3100",
        ORBITOS_OUTPUT_MODE: "server",
        ORBITOS_SECURE_COOKIES: "false",
      },
      port: 3101,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
