import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { proveCertificate, type CertificateReadingDeps } from "../src/certificate-reading";
import { DetReadError } from "../src/det-reading";
import { certificateSubject, detProviderId, DET_SOURCE } from "../src/duolingo-english-test";
import type { GiftRecord } from "../src/gift-store";
import { DET_MILESTONE } from "../src/milestone-conditions";
import { SHAPE_CLIMB, SHAPE_HAVE_OR_NOT, type MilestoneProofMessage } from "../src/milestone-protocol";
import type { MilestoneState } from "../src/milestone-reader";

/**
 * A gift on a supervised result, from the recipient's side (U3, C3). This is the money path of the whole condition,
 * so what is tested is the order of the refusals and the one thing that must never happen: the right certificate
 * pasted and nothing said.
 */

const NAME = "Vantar, Elio Sam Noor";
const SUBJECT = certificateSubject(DET_SOURCE, NAME);
const RECIPIENT = "0x000000000000000000000000000000000000B0B0" as const;
const DAY = 86_400;
const FUNDED = 20_700 * DAY;
const TEST_DAY = 20_709 * DAY;
const DEADLINE = 20_790 * DAY;

const RECORD = { giftId: "1000001", recipient: RECIPIENT, escrow: "0x00000000000000000000000000000000000000e1" } as unknown as GiftRecord;

function state(over: Partial<MilestoneState> = {}): MilestoneState {
  return {
    giftId: "1000001",
    recipient: RECIPIENT,
    shape: SHAPE_HAVE_OR_NOT,
    goalType: DET_MILESTONE.goalType,
    subject: SUBJECT,
    target: 120n,
    maximumStart: 0n,
    fundedAt: FUNDED,
    deadline: DEADLINE,
    settled: false,
    cancelled: false,
    earned: 0n,
    amount: 25_000_000n,
    startingValue: 0n,
    durationDays: 90,
    ...over,
  } as unknown as MilestoneState;
}

function deps(over: Partial<CertificateReadingDeps> = {}, sent: MilestoneProofMessage[] = []): CertificateReadingDeps {
  return {
    loadGift: async () => RECORD,
    readState: async () => state(),
    attest: async () => ({
      score: 135,
      testDay: TEST_DAY,
      subject: SUBJECT,
      observedAt: TEST_DAY + 3 * DAY,
      nullifier: `0x${"d2".repeat(32)}` as Hex,
      providerId: detProviderId(),
    }),
    prove: async ({ message }) => {
      sent.push(message);
      return { hash: `0x${"ab".repeat(32)}` };
    },
    record: async () => undefined,
    now: () => TEST_DAY + 3 * DAY,
    ...over,
  };
}

test("the certificate the gift was made for settles it, and the proof carries what the contract judges", async () => {
  const sent: MilestoneProofMessage[] = [];
  const outcome = await proveCertificate({ giftId: "1000001", link: "https://certs.duolingo.com/abcd1234efgh5678" }, deps({}, sent));
  assert.equal(outcome.kind, "reached");
  assert.equal(sent.length, 1);
  const message = sent[0];
  assert.equal(message.identityHash, SUBJECT, "the person and the thing the funder signed");
  assert.equal(message.providerId, detProviderId(), "one source's proof can never settle another's gift");
  assert.equal(message.metricValue, 135n);
  assert.equal(message.eventAt, BigInt(TEST_DAY), "the day the page says, which is what this shape is judged by");
  assert.ok(message.expiresAt > message.issuedAt);
});

test("a certificate in another name pays nothing, and says so", async () => {
  const outcome = await proveCertificate(
    { giftId: "1000001", link: "https://certs.duolingo.com/abcd1234efgh5678" },
    deps({ readState: async () => state({ subject: certificateSubject(DET_SOURCE, "Lea Martin") }) }),
  );
  assert.equal(outcome.kind, "refused");
  assert.equal(outcome.kind === "refused" && outcome.code, "ANOTHER_NAME");
  assert.equal(outcome.kind === "refused" && outcome.message, DET_MILESTONE.words.refusals.anotherName);
});

test("a score under the target says what it is and what the gift is for", async () => {
  const outcome = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => state({ target: 140n }) }));
  assert.equal(outcome.kind === "refused" && outcome.code, "BELOW_THE_TARGET");
  assert.equal(outcome.kind === "refused" && outcome.message, DET_MILESTONE.words.refusals.below(140, 135));
  assert.equal(outcome.kind === "refused" && outcome.score, 135);
});

test("a test taken outside the gift's days pays nothing, on either side of it", async () => {
  const before = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => state({ fundedAt: TEST_DAY + DAY }) }));
  assert.equal(before.kind === "refused" && before.code, "BEFORE_THE_GIFT");
  const after = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => state({ deadline: TEST_DAY - DAY }) }));
  assert.equal(after.kind === "refused" && after.code, "AFTER_THE_DEADLINE");
});

test("a certificate granted on the day the gift was made, or on its last day, still pays", async () => {
  for (const edge of [state({ fundedAt: TEST_DAY + 3_600 }), state({ deadline: TEST_DAY })]) {
    const outcome = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => edge }));
    assert.equal(outcome.kind, "reached", "a day is a day, and the hour of funding cuts nothing short (D49)");
  }
});

test("what the source answered becomes what the person reads, and nothing is relayed", async () => {
  const cases = [
    ["CERTIFICATE_PRIVATE", DET_MILESTONE.words.refusals.notPublic],
    ["CERTIFICATE_EXPIRED", DET_MILESTONE.words.refusals.expired],
    ["NO_CERTIFICATE", DET_MILESTONE.words.refusals.notFound],
    ["INVALID_LINK", DET_MILESTONE.words.refusals.linkShape],
    ["FETCH_FAILED", DET_MILESTONE.words.refusals.unavailable],
  ] as const;
  for (const [code, said] of cases) {
    const sent: MilestoneProofMessage[] = [];
    const outcome = await proveCertificate(
      { giftId: "1000001", link: "x" },
      deps(
        {
          attest: async () => {
            throw new DetReadError(code as never, "raw");
          },
        },
        sent,
      ),
    );
    assert.equal(outcome.kind, "refused", code);
    assert.equal(outcome.kind === "refused" && outcome.message, said, code);
    assert.equal(sent.length, 0, "nothing is relayed on a refusal");
  }
});

test("a gift of the other shape, or one already finished, is left alone", async () => {
  const climb = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => state({ shape: SHAPE_CLIMB }) }));
  assert.equal(climb.kind === "already" && climb.reason, "not_a_certificate");
  const settled = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ readState: async () => state({ settled: true, earned: 25_000_000n }) }));
  assert.equal(settled.kind, "already");
  const unopened = await proveCertificate({ giftId: "1000001", link: "x" }, deps({ loadGift: async () => ({ ...RECORD, recipient: null }) as GiftRecord }));
  assert.equal(unopened.kind === "already" && unopened.reason, "not_opened");
});

test("the recipient's screen says where the link is found, and what is not kept", () => {
  const words = DET_MILESTONE.words;
  assert.match(words.linkHelp, /Get Shareable Link/, "the button that makes the page public is named");
  assert.match(words.whatIsRead, /score, the day of the test, and the name/);
  assert.match(words.whatIsRead, /date of birth and your photograph are on the same page and are never asked for/);
  const screen = readFileSync("app/kit/CertificateProof.tsx", "utf8");
  assert.match(screen, /words\.whatIsRead/, "and the screen says it before the link is pasted");
  assert.match(screen, /readCertificate\(readPath, typed\)/, "a plain read answers first, before any money");
  assert.match(screen, /if \(!yours \|\| !certificate \|\| !certificate\.readPath\) return null;/, "and a shown condition, which has no read path, draws none of this (D164)");
  for (const refusal of ["notPublic", "expired", "notFound", "linkShape"]) assert.match(screen, new RegExp(`refusals\\.${refusal}`), refusal);
});

test("the funder's review says what the certificate must show, and what happens if none comes", () => {
  const said = DET_MILESTONE.words.mustShow("Lea Martin", 120);
  assert.match(said, /in the name Lea Martin/);
  assert.match(said, /120 or more/);
  assert.match(said, /test date inside these days/);
  assert.match(DET_MILESTONE.words.ifNot, /comes back to you/);
  // Said where the money is about to move, which since the mockups of 19 Sep 2026 is the sheet that pays.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /certificate\.words\.mustShow\(draft\.subject\.trim\(\), target, draft\.scale\)/);
  assert.match(sheet, /certificate\.words\.ifNot/);
});

test("a gift on this result ends well inside the two years, on the screen as in the register", () => {
  assert.equal(DET_MILESTONE.duration.max, 180);
  assert.match(DET_MILESTONE.words.durationShape(14, 180), /Between 14 and 180 days/);
  // The card offers the condition's own bounds and refuses anything outside them, for both milestone shapes.
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(card, /durationBounds\(draft\.conditionId\)/);
  // Since D130 the card offers those bounds as its three chips and nothing else, so nothing outside them can be asked.
  assert.match(card, /const quick = \[bounds\.min, bounds\.suggested, bounds\.max\];/);
});
