import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "js/audit/tests",
  testMatch: "**/*.spec.mjs",
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
    timeout: 10000,
  },
  reporter: [["list"]],
});
