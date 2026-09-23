import assert from "node:assert/strict";
import test from "node:test";
import { allExamples, type ExampleMoment } from "../app/dev/looks/gift/examples";
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
};

test("every example on the board is the moment its name says, read by the page's own functions", () => {
  const examples = allExamples(Date.UTC(2026, 8, 23, 12));
  assert.ok(examples.length > 100);
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
