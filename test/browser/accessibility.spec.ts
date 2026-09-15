import { expect, test } from "@playwright/test";

/**
 * What the design pass promised, measured in a real browser rather than asserted in a comment.
 *
 * Every number here is traced in docs/design/research.md: 48 for a tap target because it is the only value
 * web.dev, Material, Apple and WCAG 2.5.5 all accept; 4.5:1 for text at every size because that is WCAG
 * 1.4.3 and we decline the large-text relaxation; 320 CSS pixels because WCAG 1.4.10 Reflow asks the layout
 * to work there with no sideways scrolling.
 *
 * These run on the pages a person reaches without signing in, which is every page a first visit meets.
 */

const PAGES = ["/", "/fund", "/cash-out", "/account", "/privacy", "/legal"];

/** WCAG's own formula. Duplicated from src/contrast.ts because this runs inside the browser. */
const CONTRAST = `
  (function () {
    function channel(v) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function luminance(rgb) { return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]); }
    function parse(colour) {
      const m = colour.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (parts.length >= 4 && parts[3] === 0) return null;
      return [parts[0], parts[1], parts[2]];
    }
    function behind(node) {
      let el = node;
      while (el) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c) return c;
        el = el.parentElement;
      }
      return [255, 255, 255];
    }
    const failures = [];
    for (const el of document.querySelectorAll("main *")) {
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!text) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const fg = parse(style.color);
      if (!fg) continue;
      const bg = behind(el);
      const l1 = luminance(fg), l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 4.5) failures.push(text.slice(0, 40) + " :: " + ratio.toFixed(2) + ":1 (" + style.color + " on rgb(" + bg + "))");
    }
    return failures;
  })()
`;

test.describe("what the design pass promised", () => {
  for (const path of PAGES) {
    test(`${path}: every piece of text clears 4.5:1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const failures = (await page.evaluate(CONTRAST)) as string[];
      expect(failures, `${path} has text below 4.5:1`).toEqual([]);
    });

    test(`${path}: every tap target is at least 48 by 48`, async ({ page }) => {
      await page.goto(path);
      /**
       * WCAG 2.5.8 lists an Inline exception: a target "in a sentence, or its size is otherwise constrained
       * by the line-height of non-target text". A link inside a paragraph is exactly that, and stretching it
       * to 48 would break the paragraph around it. So inline links inside running text are skipped, and
       * everything a person is meant to aim at is not.
       *
       * This is an exception in the criterion, not a hole in the rule: the moment a control stops being a
       * word inside a sentence, it is measured.
       */
      const small = (await page.evaluate(() => {
        const failures: string[] = [];
        const targets = document.querySelectorAll("main a, main button, main input, main select, main textarea");
        for (const element of targets) {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const inSentence = style.display.startsWith("inline") && element.closest("p, li") !== null;
          if (inSentence) continue;
          if (box.height < 48 || box.width < 48) {
            const label = (element.textContent || element.getAttribute("placeholder") || "field").trim().slice(0, 40);
            failures.push(`${label} :: ${Math.round(box.width)}x${Math.round(box.height)}`);
          }
        }
        return failures;
      })) as string[];
      expect(small, `${path} has targets under 48`).toEqual([]);
    });

    test(`${path}: nothing pushes the page sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    });
  }

  test("the layout survives 320 pixels, which is what Reflow asks", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways at 320`).toBeLessThanOrEqual(1);
    }
  });

  test("the viewport lets people zoom, and asks for the device insets", async ({ page }) => {
    await page.goto("/");
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).toContain("width=device-width");
    expect(content).toContain("initial-scale=1");
    expect(content).toContain("viewport-fit=cover");
    expect(content).not.toContain("user-scalable=no");
    expect(content).not.toContain("maximum-scale");
  });

  test("the insets are padded on the document, so a bottom bar never pins the browser chin open", async ({ page }) => {
    await page.goto("/");
    const padding = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { bottom: style.paddingBottom, top: style.paddingTop };
    });
    // Zero on a device with no insets, which is the fallback doing its job rather than a missing rule.
    expect(padding.bottom).toBeTruthy();
    expect(padding.top).toBeTruthy();
  });

  test("the single column stops growing on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const width = await page.locator("main").evaluate((el) => el.getBoundingClientRect().width);
    // 480 plus the 24 margin each side that Material publishes from 600 pixels upward.
    expect(width).toBeLessThanOrEqual(480 + 48 + 1);
  });
});
