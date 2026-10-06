import { defineConfig } from "@playwright/test";
import { assertTestDatabase } from "./scripts/test-database";
assertTestDatabase();
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: "list",
  webServer: [
    {
      command:
        "node node_modules/tsx/dist/cli.mjs --tsconfig services/api/tsconfig.json services/api/src/main.ts",
      url: "http://127.0.0.1:4101/api/v1/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts apps/web --port 5174 --host 127.0.0.1",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
