import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { morningSentence, morningSubject } from "../src/morning-message";
import { GIFT_LIVE } from "../src/sentences";
import { tellSetUp, type SetUpToldDeps } from "../src/set-up-told";

/**
 * "Get a message when it is ready." (the founder's mockup of 11 Oct 2026): while a university is being set up, the
 * gift's people can ask to be told, and the command that registers the university tells them. Until then nothing did:
 * the student read a date and had to come back.
 */
const GIFTS = [
  { giftId: "1000020", conditionId: "university-enrollment-shown" },
  { giftId: "1000021", conditionId: "university-year-passed-shown" },
  { giftId: "1000022", conditionId: "university-enrollment-shown" },
  { giftId: "1000023", conditionId: "university-enrollment-shown" },
];

function deps(told: string[], over: Partial<SetUpToldDeps> = {}): SetUpToldDeps {
  return {
    giftsOn: async (portalId) => (portalId === "example-edu" ? GIFTS : []),
    // 1000022 is over, and 1000023 cannot be read from here.
    running: async (giftId) => {
      if (giftId === "1000023") throw new Error("unreadable");
      return giftId !== "1000022";
    },
    tell: async (giftId) => {
      told.push(giftId);
      return 2;
    },
    ...over,
  };
}

test("the enrolment gifts still running on the university are told, and no other gift", async () => {
  const told: string[] = [];
  assert.deepEqual(await tellSetUp("example-edu", "enrolment", deps(told)), [{ giftId: "1000020", devices: 2 }]);
  assert.deepEqual(told, ["1000020"], "not the gift on results, not the one that is over, not the one that cannot be read");
  assert.deepEqual(await tellSetUp("another-edu", "enrolment", deps(told)), []);
});

test("a results page set up tells nobody: a gift on results draws no setting up, and was offered no such message", async () => {
  const told: string[] = [];
  assert.deepEqual(await tellSetUp("example-edu", "results", deps(told)), []);
  assert.deepEqual(told, []);
});

test("a telling that fails stops nothing: the gift is listed with no device", async () => {
  const told: string[] = [];
  const failing = deps(told, {
    tell: async () => {
      throw new Error("push service down");
    },
  });
  assert.deepEqual(await tellSetUp("example-edu", "enrolment", failing), [{ giftId: "1000020", devices: 0 }]);
});

test("what each person reads on their phone, once", () => {
  const names = { recipientName: "Boo", funderName: "Mom" };
  assert.equal(morningSentence("recipient", { kind: "setUp", amount: "" }, names), "Your university is ready. Open your gift to show your page.");
  assert.equal(morningSentence("funder", { kind: "setUp", amount: "" }, names), "Boo's university is ready. They can show their page now.");
  assert.equal(morningSentence("funder", { kind: "setUp", amount: "" }, { recipientName: null, funderName: null }), "Their university is ready. They can show their page now.");
  assert.equal(morningSubject({ kind: "setUp", amount: "" }), "setUp", "told once for a gift");
});

test("offered while the university is being set up, and told by the command that registers it", () => {
  assert.equal(GIFT_LIVE.climbing.setUpAlert, "Get a message when it is ready.");
  assert.equal(GIFT_LIVE.climbing.setUpAlertOn, "Viky will tell you when it is ready.");
  assert.equal(GIFT_LIVE.climbing.turnOn, "Turn on");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /milestone\?\.review\?\.status === "building" && !resultsGift\s+\? \{ kind: "setUp" \}/);
  const sheet = readFileSync("app/kit/MorningMessage.tsx", "utf8");
  assert.match(sheet, /about\.kind === "setUp" \? L\.setUpAlert :/);
  assert.match(sheet, /about\.kind === "setUp" \? L\.setUpAlertOn :/);
  // After the provider is written and its request closed, and never in a dry run, which returns before both.
  const command = readFileSync("scripts/provider-requests.ts", "utf8");
  const written = command.indexOf("await saveProvider(provider);");
  const closed = command.indexOf("await markRequestBuilt(portal.portalId, provider.sense);");
  const tells = command.indexOf("await tellSetUp(portal.portalId, provider.sense, {");
  const dry = command.indexOf('if (process.env.DRY_RUN === "1") return;');
  assert.ok(dry > 0 && dry < written && written < closed && closed < tells);
  assert.match(command, /tell: \(giftId\) => tellAboutSetUp\(giftId, liveTellingDeps\(\)\),\n\s+\}\)\.catch\(\(\) => null\);/);
});
