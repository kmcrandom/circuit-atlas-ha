import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      "x-remote-user-id": "fictional-ha-owner",
      "x-remote-user-display-name": "Fictional Owner",
    },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "CIRCUIT_ATLAS_PORT=3000 CIRCUIT_ATLAS_BACKEND_PORT=3001 CIRCUIT_ATLAS_TRUSTED_INGRESS_PROXIES=127.0.0.1 npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
