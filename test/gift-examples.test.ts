import assert from "node:assert/strict";
import test from "node:test";
import { allExamples, type ExampleMoment } from "../app/dev/looks/gift-moments/examples";
import { giftOfMilestone, giftOfSummary, momentOf, type Moment } from "../src/gift-moment";
import { voiceOf } from "../src/gift-voice";

/**
 * The laboratory's board of a gift's page (V4) is only worth its captures if each example is the moment it says it
 * is: a picture labelled "won" drawn from a status the page reads as "over" would be judged against the wrong row of
 * the founder's table. So each example is read by the page's own functions here.
 */
const EXPECTED: Record<ExampleMoment, readonly Moment[]> = {
  unopened: ["unopened"],
  notConnected: ["openedNotConnected"],
  running: ["counting", "climbing", "awaitingProof"],
  runningBack: ["counting"],
  startTooHigh: ["startTooHigh"],
  won: ["won"],
  over: ["over"],
  cameBack: ["cameBack"],
  // A university's first proof held for review, or refused by it (D312): still waiting for its proof.
  building: ["awaitingProof"],
  held: ["awaitingProof"],
  reviewRefused: ["awaitingProof"],
  // Never reviewed before the contract stopped taking it (the audit of 8 Oct 2026): the gift is over, gone back.
  neverReviewed: ["over"],
};

test("every example on the board is the moment its name says, read by the page's own functions", () => {
  const examples = allExamples(Date.UTC(2026, 8, 23, 12));
  assert.equal(examples.length, 116, "five shapes, their moments (7, 7, 5, 5, 5), four readers");
  for (const example of examples) {
    const status = example.status;
    const gift = status.kind === "milestone" ? giftOfMilestone(status) : giftOfSummary(status);
    const moment = momentOf(gift);
    assert.ok(EXPECTED[example.moment].includes(moment), `${example.id} reads as ${moment}`);
    if (example.moment === "running") {
      const wanted = example.shape === "days" ? "counting" : example.shape === "climb" ? "climbing" : "awaitingProof";
      assert.equal(moment, wanted, example.id);
    }
    const voice = voiceOf(status);
    if (example.reader === "funder") assert.equal(voice, "funder", example.id);
    if (example.reader === "recipient") assert.equal(voice, "recipient", example.id);
    if (example.reader === "outsider" && status.opened) assert.equal(voice, "reader", example.id);
  }
});

test("a source named from the funder's side is said to the person it is for as theirs, never 'your their university'", async () => {
  const { SHOW_PROOF } = await import("../src/sentences");
  assert.equal(SHOW_PROOF.title("their university"), "Show it from your university account");
  assert.match(SHOW_PROOF.whatHappens("their university"), /You sign in to your university there/);
  assert.equal(SHOW_PROOF.title("Acme"), "Show it from your Acme account");
});
