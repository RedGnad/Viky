import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests over the screens a person actually meets. They run against a built app with no database
 * and nobody signed in, which is exactly the state every first visit is in, so they need no secret and
 * can run on every push. What they guard: the pages render at all, they read one handed on a phone, and
 * no word from the forbidden list reaches the rendered page. The source-level guard (`pnpm check:words`)
 * cannot see text that only exists once React has run; this can.
 */
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.VIKY_BROWSER_TEST_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.VIKY_BROWSER_TEST_URL
    ? undefined
    : {
        command: "pnpm start --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
