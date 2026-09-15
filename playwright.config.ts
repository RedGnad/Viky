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
  /**
   * The three widths the design pass is judged at. 375 is the narrow phone everybody still carries, 430 the
   * wide one, and the desktop is where a single-column app has to stop growing. 320 is checked inside the
   * accessibility spec instead, because WCAG 1.4.10 Reflow asks for it and no real device is that narrow.
   */
  projects: [
    // Both phones run on the same engine on purpose: the widths are what is being tested, and asking CI to
    // install a second browser to measure a margin is a cost with no finding behind it.
    { name: "phone 375", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 667 } } },
    { name: "phone 430", use: { ...devices["Pixel 7"], viewport: { width: 430, height: 932 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.VIKY_BROWSER_TEST_URL
    ? undefined
    : {
        command: "pnpm start --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
