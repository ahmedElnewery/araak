import { defineConfig } from "@playwright/test";

const tenantA = process.env.E2E_TENANT_A_URL ?? "http://tenant-a.localhost:3000";
const tenantB = process.env.E2E_TENANT_B_URL ?? "http://tenant-b.localhost:3000";
const admin = process.env.E2E_ADMIN_URL ?? "http://admin.localhost:3001";

const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  use: executablePath ? { launchOptions: { executablePath } } : {},
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "accessibility/**/*.spec.ts"],
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    { name: "portal-tenant-a", use: { baseURL: tenantA } },
    { name: "portal-tenant-b", use: { baseURL: tenantB } },
    { name: "admin", use: { baseURL: admin } },
  ],
});
