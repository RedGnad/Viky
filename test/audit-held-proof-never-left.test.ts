import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { liveOf, type LiveInput } from "../src/gift-live";
import { morningSentence, morningSubject } from "../src/morning-message";
import { NEVER_REVIEWED } from "../src/portal-store";
import { heldProofsReminder, wholeDays } from "../src/provider-alert";
import { GIFT_CARD } from "../src/sentences";

/**
 * A university's first proof held for review and never reviewed (the audit of 8 Oct 2026, point 9). The person read
 * "checked within an hour", one email left, and the pass held the gift only from the moment the contract refused every
 * proof: nothing was paid and nothing came back until somebody refused by hand.
 *
 * Since then the operator is reminded each morning with the time the contract can still pay it, and once that time is
 * over the review is closed as never made, the gift goes back, and both people read whose failure it was. The pass
 * itself is held by test/milestone-pass.test.ts, the closure in the database by test/portal-store.test.ts.
 */

const NOW = Date.UTC(2026, 9, 20, 7, 0, 0) / 1_000;
const DAY = 86_400;
const HELD = { sessionId: "session_12345678", portalId: "utoulouse-fr", university: "Université de Toulouse", sense: "enrolment", giftId: "1000042", shownAt: NOW - 2 * DAY - 3_600 };

test("the morning's reminder names each held proof, since when, and how long the contract can still pay it", () => {
  const mail = heldProofsReminder([{ ...HELD, closesAt: NOW + 12 * DAY + 3_600 }], NOW);
  assert.equal(mail.subject, "First proofs still held: 1. The contract stops paying the nearest in 12 days");
  const lines = mail.text.split("\n");
  assert.equal(
    lines[0],
    "Université de Toulouse (utoulouse-fr), enrolment, gift 1000042, session session_12345678: held for 2 days. The contract can pay it for 12 days more, until 2026-11-01 08:00 UTC.",
  );
  assert.match(mail.text, /Past that moment the pass closes the review as never made, the person reads that Viky did not check the proof in time, and the gift goes back to the person who paid\./);
  assert.match(mail.text, /pnpm portal:pin <session>/);
  assert.doesNotMatch(mail.text, /Inscrit|Enrolled/, "what the page carried stays in the database, for portal:pin alone");
  // Several: the nearest window leads the subject and the list, and a university with no name is its id.
  const several = heldProofsReminder([{ ...HELD, closesAt: NOW + 12 * DAY }, { ...HELD, sessionId: "session_near", university: null, closesAt: NOW + 3_600 }], NOW);
  assert.equal(several.subject, "First proofs still held: 2. The contract stops paying the nearest in less than a day");
  assert.match(several.text.split("\n")[0], /^utoulouse-fr, enrolment, gift 1000042, session session_near: .* for less than a day more/);
  // A proof whose gift is over promises no day: nothing can be paid on it.
  const over = heldProofsReminder([{ ...HELD, closesAt: null }], NOW);
  assert.equal(over.subject, "First proofs still held: 1, of gifts that are over");
  assert.match(over.text, /session session_12345678: its gift is over, so no proof can pay it\. Refuse it to close it\./);
  assert.doesNotMatch(over.text, /Past that moment/);
});

test("a wait is said in whole days, and never as a day it has not", () => {
  assert.deepEqual([0, DAY - 1, DAY, 2 * DAY - 1, 14 * DAY, -5].map(wholeDays), ["less than a day", "less than a day", "1 day", "1 day", "14 days", "less than a day"]);
});

test("the reminder leaves once in a UTC day, from the settling pass, and never fails it", () => {
  const pass = readFileSync("src/milestone-pass.ts", "utf8");
  assert.match(pass, /await tellOnceToday\(\s*"held-proofs",/);
  assert.match(pass, /if \(settle && deps\.heldProofs\) \{/, "asked by the settling pass alone: 07:00 UTC, the operator's morning");
  assert.match(pass, /await deps\.remind\(reminders, deps\.now\(\)\)\.catch\(/);
  assert.match(readFileSync("vercel.json", "utf8"), /"path": "\/api\/cron\/settle",\s*"schedule": "0 7 \* \* \*"/);
  // The hold that waited for a refusal by hand is gone.
  assert.doesNotMatch(pass, /a first proof is under review, decide it/);
});

test("both people are told that Viky did not check it in time, with the money that went back, once", () => {
  const names = { recipientName: "Boo", funderName: "Mom" };
  const news = { kind: "reviewed", verdict: "unread", amount: "$25.00" } as const;
  assert.equal(morningSentence("recipient", news, names), "Viky did not check your proof in time. $25.00 went back to Mom.");
  assert.equal(morningSentence("recipient", news, { recipientName: null, funderName: null }), "Viky did not check your proof in time. $25.00 went back.");
  assert.equal(morningSentence("funder", news, names), "Viky did not check Boo's proof in time. $25.00 came back to you.");
  assert.equal(morningSentence("funder", news, { recipientName: null, funderName: null }), "Viky did not check their proof in time. $25.00 came back to you.");
  assert.equal(morningSubject(news), "reviewed:unread", "told once");
  // An amount said in the account's own currency opens the sentence with a capital.
  assert.equal(morningSentence("funder", { ...news, amount: "about €21.40" }, names), "Viky did not check Boo's proof in time. About €21.40 came back to you.");
});

const OVER: LiveInput = {
  moment: "over",
  voice: "recipient",
  funderName: "Mom",
  recipientName: "Boo",
  source: "their university",
  amountDisplay: "$25.00",
  theirsDisplay: "$0.00",
  returnedDisplay: "$25.00",
  todayReading: null,
  target: 1,
  started: true,
  shown: true,
  shape: "stamp",
  lastJudged: null,
  openBy: null,
  connectBy: null,
  nextReadingInWords: null,
  cameBackOnInWords: "1 Nov 2026",
};

test("the gift's page says whose lateness it was, on the gift gone back and on the gift about to", () => {
  const said = (over: Partial<LiveInput>) => liveOf({ ...OVER, ...over });
  // Gone back: the headline is ours, the figure and the date are the gift's own.
  assert.equal(said({ proof: "unread" }).headline, "Viky did not check your proof in time.");
  assert.equal(said({ proof: "unread", voice: "funder" }).headline, "Viky did not check Boo's proof in time.");
  assert.equal(said({ proof: "unread", voice: "reader" }).headline, "Viky did not check Boo's proof in time.");
  assert.equal(said({ proof: "unread", voice: "funder", recipientName: null }).headline, "Viky did not check their proof in time.");
  assert.deepEqual(said({ proof: "unread" }).figure, { label: "Back to Mom", value: "$25.00" });
  assert.equal(said({ proof: "unread" }).next, "Back on 1 Nov 2026.");
  // A gift that ran out with nothing shown keeps its own words: the person's lateness is said only where it was theirs.
  assert.equal(said({}).headline, "The time is up.");
  assert.equal(said({ voice: "funder" }).headline, "Boo did not make it in time.");
  // The review closed and the expire not sent yet: the same headline, and where the money goes.
  const waiting = { moment: "awaitingProof", returnedDisplay: "$0.00", cameBackOnInWords: null, proof: "unread" } as const;
  assert.equal(said(waiting).headline, "Viky did not check your proof in time.");
  assert.equal(said(waiting).next, "Nothing to do: it goes back by itself.");
  assert.equal(said({ ...waiting, voice: "funder" }).next, "Nothing to do: it comes back to you by itself.");
});

test("the status carries the reason, the page offers no gesture on it, and the card says it before 'not proved in time'", () => {
  assert.equal(NEVER_REVIEWED, "NEVER_REVIEWED");
  const status = readFileSync("src/milestone-status.ts", "utf8");
  assert.match(status, /if \(review\.status === "refused" && review\.reason === NEVER_REVIEWED\) return \{ status: "unread" \};/);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const unread = hadOrNot\?\.review\?\.status === "unread";/);
  assert.match(page, /!hadOrNot\.opened \? null : unread \? "unread" : gift\.finished \? null :/, "said on the gift over too, where nothing else of the proof is");
  assert.match(page, /if \(proofStands === "ended" \|\| proofStands === "unread"\) return null;/, "nothing more can be shown: the contract takes no proof");
  const card = readFileSync("app/kit/GiftCard.tsx", "utf8");
  assert.ok(card.indexOf('if (status.review?.status === "unread") return W.hadOrNot.unread;') < card.indexOf("if (status.finished) return W.hadOrNot.missed;"));
  assert.ok(card.indexOf('if (status.review?.status === "unread") return W.hadOrNot.unread;') > 0);
  assert.equal(GIFT_CARD.hadOrNot.unread, "Shown. Viky did not check it in time.");
  // No sentence of these says what the page showed, which nobody read, nor that the proof was good.
  for (const sentence of [GIFT_CARD.hadOrNot.unread, "Viky did not check your proof in time."]) assert.doesNotMatch(sentence, /did not show|valid|enrolled/i);
});
