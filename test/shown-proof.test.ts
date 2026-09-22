import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { shownContextMessage, ShownProofError, validateShownEvidence, type ShownCondition } from "../src/shown-proof";

/**
 * The flow that reads a proof the person shows, with the source taken out of it (D162). Every refusal here is what
 * the Duolingo policy refused, asked of a condition described in one object rather than by name.
 */

const ACCOUNT = "0x000000000000000000000000000000000000a11c";
const SESSION = "session_12345678";
const REQUEST = "0x881b7539dce87f232902946fa97c9410805b7587bb45d3f8fb5041193f3dee21";

const SCORE: ShownCondition = {
  conditionId: "toefl-mybest",
  providerId: "67ec1b13-b206-4fac-a78c-fbd5a2af55b3",
  providerVersion: "1.0.0",
  requestHashes: [REQUEST],
  proofCount: 1,
  phases: ["reach"],
  attestationProviderId: keccak256(stringToHex("viky:provider:toefl-mybest-shown:v1")),
  read: (fields) => {
    if (!/^\d{1,3}$/.test(fields.scoreValue ?? "")) throw new ShownProofError("INVALID_SCORE", "The score is not a number");
    return { metricValue: BigInt(fields.scoreValue), eventAt: null, accountKey: fields.bookingId ?? null };
  },
};

function data(overrides: Partial<{ address: string; message: string; session: string; hash: string; fields: Record<string, string> }> = {}) {
  return [
    {
      context: {
        contextAddress: overrides.address ?? ACCOUNT,
        contextMessage: overrides.message ?? "42:reach",
        reclaimSessionId: overrides.session ?? SESSION,
        providerHash: overrides.hash ?? REQUEST,
      },
      extractedParameters: overrides.fields ?? { scoreValue: "97", bookingId: "123456" },
    },
  ];
}

const policy = { account: ACCOUNT, giftId: "42", phase: "reach" as const, expectedSessionId: SESSION };

test("a session is sealed with the gift and the phase, and a check-in with its day, as it always was", () => {
  assert.equal(shownContextMessage("42", "baseline"), "42:baseline");
  assert.equal(shownContextMessage("42", "check-in", 7), "42:7");
  assert.equal(shownContextMessage("42", "reach"), "42:reach");
  assert.throws(() => shownContextMessage("42", "check-in", 367), /day index/);
  assert.throws(() => shownContextMessage("x", "reach"), /gift is invalid/);
});

test("a proof about this gift, this person and this session is read in the condition's own terms", () => {
  const evidence = validateShownEvidence({ condition: SCORE, data: data(), timestamps: [1_784_000_000], policy });
  assert.equal(evidence.reading.metricValue, 97n);
  assert.equal(evidence.reading.accountKey, "123456");
  assert.equal(evidence.observedAt, 1_784_000_000);
  assert.equal(evidence.phase, "reach");
  assert.match(evidence.nullifier, /^0x[0-9a-f]{64}$/);
});

test("the nullifier is one per gift, phase and session, so a proof is used once", () => {
  const one = validateShownEvidence({ condition: SCORE, data: data(), timestamps: [1_784_000_000], policy });
  const again = validateShownEvidence({ condition: SCORE, data: data(), timestamps: [1_784_000_500], policy });
  assert.equal(one.nullifier, again.nullifier, "the same session gives the same nullifier whatever the clock says");
  const other = validateShownEvidence({ condition: SCORE, data: data({ session: "session_87654321" }), timestamps: [1_784_000_000], policy: { ...policy, expectedSessionId: "session_87654321" } });
  assert.notEqual(one.nullifier, other.nullifier);
});

function refuses(code: string, run: () => unknown) {
  assert.throws(run, (error: unknown) => error instanceof ShownProofError && error.code === code, code);
}

test("every way a proof can be about something else is refused, with its reason", () => {
  refuses("WRONG_ACCOUNT", () => validateShownEvidence({ condition: SCORE, data: data({ address: "0x000000000000000000000000000000000000b0b0" }), timestamps: [1], policy }));
  refuses("WRONG_GIFT_PHASE", () => validateShownEvidence({ condition: SCORE, data: data({ message: "43:reach" }), timestamps: [1], policy }));
  refuses("WRONG_GIFT_PHASE", () => validateShownEvidence({ condition: SCORE, data: data({ message: "42:baseline" }), timestamps: [1], policy }));
  refuses("WRONG_SESSION", () => validateShownEvidence({ condition: SCORE, data: data({ session: "session_00000000" }), timestamps: [1], policy }));
  refuses("WRONG_REQUEST_SCHEMA", () => validateShownEvidence({ condition: SCORE, data: data({ hash: `0x${"ab".repeat(32)}` }), timestamps: [1], policy }));
  refuses("WRONG_PROOF_COUNT", () => validateShownEvidence({ condition: SCORE, data: [...data(), ...data()], timestamps: [1, 1], policy }));
  refuses("INVALID_PROOF_TIME", () => validateShownEvidence({ condition: SCORE, data: data(), timestamps: [0], policy }));
  refuses("WRONG_PHASE", () => validateShownEvidence({ condition: SCORE, data: data({ message: "42:baseline" }), timestamps: [1], policy: { ...policy, phase: "baseline" } }));
  refuses("INVALID_SCORE", () => validateShownEvidence({ condition: SCORE, data: data({ fields: { scoreValue: "high", bookingId: "1" } }), timestamps: [1], policy }));
});

test("two proofs of one session must agree on what they both read", () => {
  const two: ShownCondition = { ...SCORE, proofCount: 2, requestHashes: [REQUEST, `0x${"cd".repeat(32)}`] };
  const first = data()[0];
  const second = { ...data({ hash: `0x${"cd".repeat(32)}`, fields: { scoreValue: "12" } })[0] };
  refuses("CONFLICTING_FIELDS", () => validateShownEvidence({ condition: two, data: [first, second], timestamps: [1, 1], policy }));
});
