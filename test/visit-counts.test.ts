import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countedAddress, countedPath, GIFT_PAGE_COUNTED_AS } from "../src/visit-counts";

/**
 * Anonymous visit counts by Vercel (the founder, 1 Oct 2026): no address leaves with the key of a gift's link or a
 * gift's number, in what is counted or in what the browser says of the page that sent it.
 */

test("an address is counted without its key, its query, its fragment or its gift number", () => {
  assert.equal(countedAddress("https://viky.cash/g/1284?t=AbC-123_secret"), "https://viky.cash/g/[id]");
  assert.equal(countedAddress("https://viky.cash/g/1284?t=key&take=1#proof"), "https://viky.cash/g/[id]");
  assert.equal(countedAddress("https://viky.cash/g/1284/"), "https://viky.cash/g/[id]/");
  assert.equal(countedAddress("https://viky.cash/fund?step=paying&opened=1"), "https://viky.cash/fund");
  assert.equal(countedAddress("https://viky.cash/?utm_source=x"), "https://viky.cash/");
  assert.equal(countedAddress("https://viky.cash/gifts"), "https://viky.cash/gifts", "a page with no number is counted as itself");
  assert.equal(GIFT_PAGE_COUNTED_AS, "/g/[id]");
  assert.equal(countedPath("/g/1284"), "/g/[id]");
  assert.equal(countedPath("/gifts"), "/gifts");
  assert.equal(countedPath("/"), "/");
  for (const address of ["https://viky.cash/g/77?t=k", "https://viky.cash/g/909090?t=zzz#x"]) {
    assert.doesNotMatch(countedAddress(address), /\d|t=|\?/);
  }
});

test("every count goes through the cleaning, and a page's address never travels as the referrer", () => {
  const component = readFileSync("app/kit/VisitCounts.tsx", "utf8");
  assert.match(component, /beforeSend=\{\(event\) => \(\{ \.\.\.event, url: countedAddress\(event\.url\) \}\)\}/);
  // The route and the path are given already cleaned: the package's own Next component sent the bare path as the route.
  assert.match(component, /const counted = countedPath\(usePathname\(\) \?\? "\/"\);/);
  assert.match(component, /route=\{counted\}\n\s*path=\{counted\}/);
  assert.doesNotMatch(component, /from "@vercel\/analytics\/next"/);
  // The two settings Vercel writes at build are read under the names the package itself reads them by.
  const packaged = readFileSync("node_modules/@vercel/analytics/dist/next/index.mjs", "utf8");
  for (const name of ["NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH", "NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG"]) {
    assert.ok(packaged.includes(`process.env.${name}`), `the package still reads ${name}`);
    assert.ok(component.includes(`process.env.${name}`), `and so does the component`);
  }
  assert.match(readFileSync("app/layout.tsx", "utf8"), /<VisitCounts \/>/);
  // The browser's own `Referer` on a same-site request carries the page's whole address unless the site says otherwise.
  assert.match(readFileSync("next.config.mjs", "utf8"), /\{ source: "\/:path\*", headers: \[\{ key: "Referrer-Policy", value: "strict-origin" \}\] \}/);
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).dependencies["@vercel/analytics"], "2.0.1");
  const privacy = readFileSync("app/privacy/page.tsx", "utf8");
  assert.match(privacy, /Visits are counted anonymously, with no cookie, by Vercel/);
  assert.doesNotMatch(privacy, /No analytics scripts/);
});
