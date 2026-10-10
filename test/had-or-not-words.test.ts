// What a gift had or not says (the audit of 1 Oct 2026). Its target on the contract is 1, or a count nobody reads,
// and the pages printed it: "Reach 1 on their university", "Target 1. Not read yet.", a flag marked "1" on a trail.
// And once a proof was held, refused, waited for or late, the title stayed "Show it" and the funder still read "has
// not shown it yet".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITIONS } from "../src/conditions";
import { liveOf, type LiveInput } from "../src/gift-live";
import { askedInWords, certificateById } from "../src/milestone-conditions";
import { marathonTargetUnderHours } from "../src/marathon";
import { onALaterDay } from "../src/moments";
import { GIFT_CARD, GIFT_PAGE, MILESTONE_PAGE, SHOW_PROOF } from "../src/sentences";

test("what it asks is said in the register's words, from the contract's own target", () => {
  const asked = (id: string, units: number) => askedInWords(certificateById(id)!, units);
  assert.equal(asked("university-enrollment-shown", 1), "enrolled at that university");
  assert.equal(asked("university-year-passed-shown", 1), "the year passed at that university");
  assert.equal(asked("toefl-mybest-shown", 90), "90 on the TOEFL");
  assert.equal(asked("coursera-certificate", 1), "the certificate of that course");
  assert.equal(asked("marathon-finish", 1), "finish the race");
  assert.match(asked("marathon-finish", marathonTargetUnderHours(4.5))!, /^finish in under 4 h 30$/);
  assert.equal(asked("wca-time", 1), "set a result");
  // A grade is on a scale of its own, and has its own words ("14.50 out of 20").
  assert.equal(asked("university-grade-shown", 1450), null);
  // Every condition of this shape has words, or is the grade: none falls back on the number.
  for (const condition of CONDITIONS) {
    const certificate = certificateById(condition.id);
    if (!certificate || condition.id === "university-grade-shown") continue;
    const words = askedInWords(certificate, certificate.targetUnits ? certificate.targetUnits(certificate.target.suggested) : certificate.target.suggested);
    assert.ok(words && words.length > 3 && !/^\d+$/.test(words), `${condition.id}: ${words}`);
  }
  assert.match(readFileSync("src/milestone-status.ts", "utf8"), /asked: insider && certificate \? askedInWords\(certificate, Number\(state\.target\)\) : null,/, "only to whoever is shown the gift's own figures");
  // On the gift's page it is the value of a line, "For": the fold holds lines, never paragraphs (the founder, 4 Oct 2026).
  assert.equal(MILESTONE_PAGE.lines.isFor, "For");
});

test("the gift's page never prints the contract's target for this shape, and dates the return", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  const agreed = page.slice(page.indexOf("const agreedRows: Row[] = ["), page.indexOf("const checkedRows: Row[] = ["));
  assert.match(agreed, /hadOrNot\.asked\s*\? \(\[M\.lines\.isFor, hadOrNot\.asked\] as const\)/, "what it asks, in the register's words");
  assert.match(agreed, /\[M\.lines\.when, milestoneBy\(milestone, zone\)\] as const/);
  assert.match(agreed, /\[M\.lines\.ifNot, hadOrNot \? M\.lines\.twoWeeksLater\(backToFunder\) : backToFunder\] as const/, "and the return is dated: two weeks later");
  // The sentences that name a target name a climb's number or a grade's words, and "it" for the rest.
  assert.match(page, /const targetToName = !milestone \? null : hadOrNot \? \(milestone\.targetWords \?\? null\)/);
  assert.equal(MILESTONE_PAGE.lines.twoWeeksLater(GIFT_PAGE.lines.backToYou), "back to you, two weeks later");
  assert.equal(MILESTONE_PAGE.lines.twoWeeksLater(GIFT_PAGE.lines.backTo("Mom")), "back to Mom, two weeks later");
});

test("the card draws no trail and no flag for it, and says where its proof stands", () => {
  const card = readFileSync("app/kit/GiftCard.tsx", "utf8");
  assert.match(card, /milestone\.shape === "certificate" \? \(\s*<HadOrNot state=/);
  assert.match(card, /if \(status\.shape === "certificate"\) \{/);
  assert.deepEqual(GIFT_CARD.hadOrNot, {
    waiting: "Not proved yet.",
    checking: "Shown. Viky is checking it.",
    refused: "Checked: it did not show what the gift asks.",
    unread: "Shown. Viky did not check it in time.",
    building: "Waiting for the university's page to be set up.",
    proved: "Proved.",
    missed: "Not proved in time.",
  });
  for (const sentence of Object.values(GIFT_CARD.hadOrNot)) assert.doesNotMatch(sentence, /\d/, "no target, no number");
});

const WAITING: LiveInput = {
  moment: "awaitingProof",
  voice: "recipient",
  funderName: "Mom",
  recipientName: "Boo",
  source: "their university",
  amountDisplay: "$25.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$0.00",
  todayReading: null,
  target: 1,
  started: true,
  shown: true,
  shape: "stamp",
  lastJudged: null,
  openBy: null,
  connectBy: null,
  nextReadingInWords: null,
  cameBackOnInWords: null,
};

test("the title says where the proof stands, to each of the two people", () => {
  const title = (over: Partial<LiveInput>) => liveOf({ ...WAITING, ...over }).headline;
  // Nothing yet: the gesture, as before.
  assert.equal(title({}), "Show it from your own university account, and it is yours.");
  assert.equal(title({ voice: "funder" }), "Boo has not shown it yet.");
  // A year's results not out yet (the founder, 10 Oct 2026): the wait, to both.
  assert.equal(title({ waitsForResults: true }), "Waiting for your results.");
  assert.equal(title({ waitsForResults: true, voice: "funder" }), "Waiting for their results.");
  // Held for review.
  assert.equal(title({ proof: "pending" }), "Shown. Viky is checking it.");
  assert.equal(title({ proof: "pending", voice: "funder" }), "Boo showed it. Viky is checking it.");
  // Refused by it.
  assert.equal(title({ proof: "refused" }), "It was checked and did not show what the gift asks.");
  assert.equal(title({ proof: "refused", voice: "funder" }), "It was checked and did not show what the gift asks.");
  // The university's page still being built.
  // Said by what the person will be able to do and when (the founder, 10 Oct 2026).
  assert.equal(title({ proof: "building", builtByInWords: "12 Oct" }), "Your university is being set up. You can show your page here from 12 Oct at the latest.");
  assert.equal(title({ proof: "building", builtByInWords: "12 Oct", voice: "funder" }), "Their university is being set up. They can show their page from 12 Oct at the latest.");
  // Once the day named has passed, the sentence stays and the day goes.
  assert.equal(title({ proof: "building", builtByInWords: null }), "Your university is being set up. The money waits in your name.");
  assert.equal(title({ proof: "building", builtByInWords: null, voice: "funder" }), "Their university is being set up.");
  assert.deepEqual([onALaterDay(Date.UTC(2026, 9, 13, 0, 5), Date.UTC(2026, 9, 12, 15), "UTC"), onALaterDay(Date.UTC(2026, 9, 12, 23, 55), Date.UTC(2026, 9, 12, 15), "UTC"), onALaterDay(Date.UTC(2026, 9, 12, 23, 55), Date.UTC(2026, 9, 12, 15), "Asia/Tokyo")], [true, false, false]);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /builtByInWords: nowMs !== 0 && onALaterDay\(nowMs, \(status\.createdAtChain \+ 2 \* 86_400\) \* 1000, zone\) \? null : dayInWords\(\(status\.createdAtChain \+ 2 \* 86_400\) \* 1000, zone\),/);
  // The card says it once: the block under it draws nothing while the university is being set up.
  assert.match(readFileSync("app/kit/ShowProof.tsx", "utf8"), /if \(review === "building" && state\.at !== "held"\) return null;/);
  assert.equal("building" in SHOW_PROOF, false);
  // Past the last day, where the source dates what it grants: what was had in time can still be proved.
  // The state is the title and what follows from it is the line under it (1 Oct 2026): one title said both before.
  const under = (over: Partial<LiveInput>) => liveOf({ ...WAITING, ...over }).next;
  assert.equal(title({ proof: "late", lateUntilInWords: "31 Oct 2026" }), "The last day has passed.");
  assert.equal(under({ proof: "late", lateUntilInWords: "31 Oct 2026" }), "What you had by then can still be proved until 31 Oct 2026.");
  assert.equal(title({ proof: "late", lateUntilInWords: "31 Oct 2026", voice: "funder" }), "The last day has passed.");
  assert.equal(under({ proof: "late", lateUntilInWords: "31 Oct 2026", voice: "funder" }), "If nothing from before it is proved by 31 Oct 2026, it comes back to you.");
  assert.equal(under({ proof: "late", lateUntilInWords: "31 Oct 2026", voice: "reader" }), "What was had by then can still be proved until 31 Oct 2026.");
  // Past the last day, where the showing itself is what is dated: nothing shown now can pay, and the return is dated.
  assert.equal(title({ proof: "ended", lateUntilInWords: "31 Oct 2026" }), "The last day passed without it.");
  assert.equal(under({ proof: "ended", lateUntilInWords: "31 Oct 2026" }), "It goes back to Mom after 31 Oct 2026.");
  assert.equal(title({ proof: "ended", lateUntilInWords: "31 Oct 2026", voice: "funder" }), "The last day passed without it.");
  assert.equal(under({ proof: "ended", lateUntilInWords: "31 Oct 2026", voice: "funder" }), "It comes back to you after 31 Oct 2026.");
  assert.equal(title({ proof: "ended", lateUntilInWords: "31 Oct 2026", voice: "reader" }), "The last day passed without it.");
  assert.equal(under({ proof: "ended", lateUntilInWords: "31 Oct 2026", voice: "reader" }), null);
  // Nothing follows while the last day has not passed.
  for (const proof of ["pending", "refused", "building"] as const) assert.equal(under({ proof }), null, proof);
  // The figure is still said once, under the title.
  assert.deepEqual(liveOf({ ...WAITING, proof: "pending" }).figure, { label: "In your name", value: "$25.00" });
  // The page hands it what the contract and the review say, and the late window is the contract's.
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /hadOrNot\.review\?\.status \?\? \(pastTheLastDay \? \(condition\?\.nature === "shown" \|\| datedTheDayItIsRead\(hadOrNot\.conditionId\) \? "ended" : "late"\) : null\)/);
  // The contract compares days, so the whole last day counts; and what is shown is dated the day it is shown.
  assert.match(page, /Math\.floor\(nowMs \/ 86_400_000\) > Math\.floor\(hadOrNot\.deadlineMs \/ 86_400_000\)/);
  assert.match(readFileSync("src/shown-verification.ts", "utf8"), /eventAt: BigInt\(evidence\.reading\.eventAt \?\? evidence\.observedAt\)/);
  assert.match(readFileSync("contracts/MilestoneGift.sol", "utf8"), /if \(_dayOf\(a\.eventAt\) > _dayOf\(g\.deadline\)\) revert DeadlinePassed\(\);/);
  // No gesture is offered for a showing that can no longer pay.
  assert.match(page, /if \(proofStands === "ended" \|\| proofStands === "unread"\) return null;/);
  assert.match(page, /hadOrNot\.deadlineMs \+ MILESTONE_LATE_PROOF_SECONDS \* 1000/);
});
