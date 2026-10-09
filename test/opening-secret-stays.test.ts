import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The secret after a gift link's `#` signs the opening in the browser, or goes nowhere (the delta re-read of 2 Oct
 * 2026). The page chose between signing here and posting the link's key from two fields of the server's status, the
 * gift's version and its contract: an answer that said "second version" and named another contract, or none, made the
 * honest code post the secret. The settings are set before the modules are read, as a browser's build holds them.
 */
const SECOND = "0x1111111111111111111111111111111111111111";
const FIRST = "0x2222222222222222222222222222222222222222";
process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS = SECOND;
process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS = "0x3333333333333333333333333333333333333333";
process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS = "0x4444444444444444444444444444444444444444";

const RECIPIENT = "0x5555555555555555555555555555555555555555";

async function sentBy(run: (secret: string) => Promise<unknown>): Promise<{ secret: string; sent: Array<{ url: string; body: string }>; refused: unknown }> {
  const { linkSecretFrom } = await import("../src/v2-protocol");
  const secret = linkSecretFrom(`0x${"ab".repeat(65)}`);
  const sent: Array<{ url: string; body: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    sent.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ giftId: "5", opened: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const refused = await run(secret).then(() => null, (error: unknown) => error);
    return { secret, sent, refused };
  } finally {
    globalThis.fetch = original;
  }
}

test("on the gift's own contract the opening is signed here, and the secret is in nothing that leaves", async () => {
  const { openWithTheLinkSecret } = await import("../src/client/v2");
  const { secret, sent, refused } = await sentBy((linkSecret) => openWithTheLinkSecret({ giftId: "5", linkSecret, contract: SECOND, recipient: RECIPIENT }));
  assert.equal(refused, null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "/api/gift/claim");
  assert.ok(!sent[0].body.includes(secret), "the secret is not in the request");
  assert.match(sent[0].body, /"opening":\{"deadline":"\d+","signature":"0x[0-9a-f]{130}"\}/);
});

test("an answer that names another contract, none, or no account is refused, and nothing is sent at all", async () => {
  const { openWithTheLinkSecret } = await import("../src/client/v2");
  const { ApiError } = await import("../src/client/api");
  const answers: Array<{ contract: string | null | undefined; recipient: string | null }> = [
    { contract: FIRST, recipient: RECIPIENT },
    { contract: undefined, recipient: RECIPIENT },
    { contract: null, recipient: RECIPIENT },
    { contract: "not an address", recipient: RECIPIENT },
    { contract: SECOND, recipient: null },
  ];
  for (const answer of answers) {
    const { sent, refused } = await sentBy((linkSecret) => openWithTheLinkSecret({ giftId: "5", linkSecret, ...answer }));
    assert.ok(refused instanceof ApiError && refused.code === "OUT_OF_DATE", `refused by name: ${JSON.stringify(answer)}`);
    assert.equal((refused as Error).message, "This page is out of date. Load it again to open your gift. Nothing was changed.");
    assert.deepEqual(sent, [], "nothing left the browser");
  }
});

test("the page never hands the secret after the # to the function that posts a key", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /if \(linkOpened\) await openWithTheLinkSecret\(\{ giftId, linkSecret: openingKey, contract, recipient \}\);\n\s*else await claimGift\(giftId, openingKey\);/);
  assert.equal(page.match(/claimGift\(/g)?.length, 1, "one call, on the first version's branch");
  // The function that posts a key takes a key and nothing that could send it down the other road.
  const client = readFileSync("src/client/gift.ts", "utf8");
  assert.match(client, /export function claimGift\(giftId: string, token: string\): Promise<\{ giftId: string; opened: boolean \}> \{\n {2}return postJson\(`\/api\/gift\/claim`, \{ giftId, token \}\);\n\}/);
  assert.ok(!client.includes("openWithLinkKey"), "and it opens nothing of the second version");
});
