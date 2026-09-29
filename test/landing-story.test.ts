import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LANDING_STORY } from "../src/sentences";

/**
 * Under the card on the landing (D282, the founder, 27 Sep 2026, after Duolingo's page): four promises with their
 * drawings, the phone, and one last way to the card. Each promise must stay true of the code that makes it.
 */

test("the landing draws its four promises under the card, then the phone, then the way back to the card", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(home, /<LandingStory \/>/);
  const story = readFileSync("app/kit/LandingStory.tsx", "utf8");
  assert.deepEqual(LANDING_STORY.blocks.map((block) => block.key), ["theirs", "checked", "back", "face"]);
  assert.match(story, /<Install \/>/);
  assert.match(story, /standalone \? null/);
  assert.match(story, /href="#offer"[^>]*onClick=\{goToTheCard\}/);
  // The install line is said once on the page: in the phone's card, no longer in the links at the foot.
  assert.doesNotMatch(home, /<Install quiet \/>/);
});

test("a missed day goes back to the funder: the create routes send the refund to the account that pays, and nowhere else", () => {
  for (const route of ["app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts"]) {
    assert.match(readFileSync(route, "utf8"), /const refundTo = refundDestination\(body\.refundTo, auth\.account\);/);
  }
  const screens = ["app/kit/offer/PaySheet.tsx", "app/kit/offer/OfferCard.tsx"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(screens, /refundTo/);
});

test("no promise uses a word the person must never see, and none claims what Viky must not say", () => {
  const all = [JSON.stringify(LANDING_STORY), LANDING_STORY.blocks.map((block) => (typeof block.body === "function" ? block.body("the service") : block.body)).join(" ")].join(" ").toLowerCase();
  for (const word of ["wallet", "gas", "chain", "seed", "token", "transaction", "address", "cheaper", "nobody does", "licence"]) {
    assert.ok(!all.includes(word), word);
  }
});
