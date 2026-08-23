import { defineConfig, devices } from "@playwright/test";

const frontendPort = Number(process.env.CIRCUIT_ATLAS_E2E_PORT ?? 3000);
const backendPort = frontendPort + 1;
const baseURL = `http://localhost:${frontendPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
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
    command: `CIRCUIT_ATLAS_PORT=${frontendPort} CIRCUIT_ATLAS_BACKEND_PORT=${backendPort} CIRCUIT_ATLAS_TRUSTED_INGRESS_PROXIES=127.0.0.1 npm run start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.CIRCUIT_ATLAS_E2E_PORT,
    timeout: 120_000,
  },
});
