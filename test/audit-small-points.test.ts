import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { refusedFromElsewhere } from "../src/api-guard";
import { LOST } from "../src/sentences";

/**
 * The three small points of the audit of 9 Oct 2026 (I25, I26, I27).
 *
 * Fifteen routes that write were held from another site's page by the session cookie alone. The offline page had two
 * sentences, one of them not its own to say, and no way to ask again. And the exchange's own words for a refusal
 * reached the withdrawal's screen as they came.
 */
const ROUTES = readdirSync("app/api", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => `app/api/${file}`);

test("every route that writes says where a request may come from, but the one a service calls with its own signature", () => {
  const writes = ROUTES.filter((file) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, "utf8")));
  assert.ok(writes.length > 50, `the routes were found: ${writes.length}`);
  const unguarded = writes.filter((file) => !/assertSameOrigin\(|readJsonBody[<(]|refusedFromElsewhere\(|askedFromOurOwnPage\(/.test(readFileSync(file, "utf8")));
  // Switch's webhook comes from Switch, signed by it: another origin is the whole of it.
  assert.deepEqual(unguarded, ["app/api/mobile-money/webhook/route.ts"]);
  assert.match(readFileSync("app/api/mobile-money/webhook/route.ts", "utf8"), /signedBySwitch\(raw, request\.headers\.get\("x-switch-signature"\)\)/);
});

test("the fifteen routes of the audit check it before anything else, and a first reading's first request too", () => {
  const inTheTry = ["gift/[id]/reached-seen", "gift/[id]/link", "gift/[id]/cancel", "gift/[id]/consent", "gift/[id]/count", "gift/[id]/bind", "gift/certificate/create", "judge/credit", "dev/gas-top-up"];
  for (const name of inTheTry) {
    const route = readFileSync(`app/api/${name}/route.ts`, "utf8");
    const post = route.slice(route.indexOf("export async function POST("));
    assert.match(post, /^export async function POST\([^)]*\) \{\n(?:  let account = "";\n)?  try \{\n    assertSameOrigin\(request\);\n/, name);
  }
  const early = ["det/certificate", "credly/badge", "edx/certificate", "mitx-online/certificate", "accredible/credential", "coursera/certificate", "gift/[id]/certificate"];
  for (const name of early) {
    const route = readFileSync(`app/api/${name}/route.ts`, "utf8");
    const post = route.slice(route.indexOf("export async function POST("));
    assert.match(post, /^export async function POST\([^)]*\) \{\n  const elsewhere = refusedFromElsewhere\(request\);\n  if \(elsewhere\) return elsewhere;\n/, name);
  }
  assert.equal(inTheTry.length + early.length, 16, "the fifteen, and the first request of a first reading");
  // The creation of a certificate gift reads its body bounded, as its two twins do.
  for (const twin of ["gift/create", "gift/milestone/create", "gift/certificate/create"]) {
    assert.match(readFileSync(`app/api/${twin}/route.ts`, "utf8"), /await readJsonBody<[^>]+>+\(request, 8 \* 1_024\)/, twin);
  }
  assert.doesNotMatch(readFileSync("app/api/gift/certificate/create/route.ts", "utf8"), /await request\.json\(\)/);
});

test("the check as an answer: nothing for our own page or a request that names no origin, a refusal for another site", async () => {
  const from = (headers: Record<string, string>) => new Request("https://viky.test/api/judge/credit", { method: "POST", headers });
  assert.equal(refusedFromElsewhere(from({ origin: "https://viky.test", host: "viky.test" })), null);
  assert.equal(refusedFromElsewhere(from({ host: "viky.test" })), null, "a server that calls it names no origin");
  const elsewhere: Record<string, string>[] = [{ "sec-fetch-site": "cross-site", host: "viky.test" }, { origin: "https://elsewhere.test", host: "viky.test" }];
  for (const headers of elsewhere) {
    const refused = refusedFromElsewhere(from(headers));
    assert.equal(refused?.status, 400);
    assert.equal(refused?.headers.get("cache-control"), "no-store");
    assert.match(((await refused?.json()) as { code: string }).code, /^CROSS_(SITE|ORIGIN)$/);
  }
});

test("the offline page says one thing it can know, and has a press that loads the address again", () => {
  assert.equal(LOST.offline, "Viky needs a connection. Nothing was changed by this page.");
  assert.equal(LOST.again, "Try again");
  const page = readFileSync("app/~offline/page.tsx", "utf8");
  assert.match(page, /<Notice>\{W\.offline\}<\/Notice>/);
  assert.match(page, /<button type="button" id="try-again" className=\{PRIMARY_BUTTON\}>\s+\{W\.again\}\s+<\/button>/);
  // Written in the page itself: nothing can be fetched when it is shown, a script of its own included.
  assert.match(page, /const TRY_AGAIN = `document\.getElementById\("try-again"\)\.addEventListener\("click", function \(\) \{ window\.location\.reload\(\); \}\);`;/);
  assert.match(page, /<script dangerouslySetInnerHTML=\{\{ __html: TRY_AGAIN \}\} \/>/);
  assert.doesNotMatch(page, /"use client"/);
  assert.doesNotMatch(page, /safe|nothing changes while you are away/i);
});

test("the exchange's refusal is said in our sentence alone, and its own words go to the log", () => {
  const exchange = readFileSync("src/kuru.ts", "utf8");
  assert.match(exchange, /console\.error\(`exchange refused a quote \(\$\{quoteResponse\.status\}\): \$\{String\(quote\.message \?\? "no message"\)\.slice\(0, 300\)\}`\);\s+throw new GiftApiError\("QUOTE_UNAVAILABLE", "No route for this right now\. Try again shortly\.", 503\);/);
  assert.doesNotMatch(exchange, /GiftApiError\("QUOTE_UNAVAILABLE", quote\.message/);
});
