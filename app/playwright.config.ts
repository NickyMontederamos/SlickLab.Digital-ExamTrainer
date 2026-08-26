import { defineConfig, devices } from "@playwright/test";

/**
 * Runs on a dedicated port (3011) — deliberately NOT 3010, which is the
 * sibling CM-Law SecureExam project's port on this machine. With
 * reuseExistingServer: true, sharing a port wouldn't just conflict, it
 * would silently attach this project's E2E run to the OTHER project's dev
 * server (wrong app, wrong database) and produce results that look valid
 * but aren't. Also not 3001, which is what `next dev` lands on by default
 * on this machine when 3000 is already held by something else.
 * reuseExistingServer means a local repeat run reuses whatever's already
 * up on 3011; CI always starts fresh.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3011",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- -p 3011",
    url: "http://localhost:3011",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
