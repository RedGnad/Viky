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
    /**
     * No service worker in a test (D150). A request a service worker makes does not go through `page.route`, so a
     * test that answers a source itself was answered by the real one instead, whenever the worker happened to take
     * the page over during that test: the course list showed a real Duolingo profile with eighteen courses where
     * six were stubbed, in about one full run out of two, on whichever width lost the race. What the worker itself
     * does is not what these tests measure; they measure the screens.
     */
    serviceWorkers: "block",
  },
  /**
   * The three widths the design pass is judged at. 375 is the narrow phone everybody still carries, 430 the
   * wide one, and the desktop is where a single-column app has to stop growing. 320 is checked inside the
   * accessibility spec instead, because WCAG 1.4.10 Reflow asks for it and no real device is that narrow.
   */
  /**
   * Four widths, and each one is a decision rather than a device: 375 the narrow phone, 430 the wide one, 768
   * the width where a destination has grown but has not split, and 1280 where it is two panes. 320 is checked
   * inside the accessibility spec, because WCAG 1.4.10 asks for it and no real device is that narrow.
   *
   * All four run on the same engine on purpose: the widths are what is being tested, and asking CI to install
   * a second browser to measure a margin is a cost with no finding behind it.
   */
  projects: [
    { name: "phone 375", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 667 } } },
    { name: "phone 430", use: { ...devices["Pixel 7"], viewport: { width: 430, height: 932 } } },
    { name: "tablet 768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop 1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
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
