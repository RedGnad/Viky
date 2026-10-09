import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import {
  DUOLINGO_OWNERSHIP_REQUEST_HASH,
  DUOLINGO_PROVIDER_ID,
  DUOLINGO_XP_REQUEST_HASH,
  DuolingoPolicyError,
  duolingoContextMessage,
  validateDuolingoEvidence,
  validateDuolingoProgress,
  type DuolingoEvidence,
} from "../src/duolingo-proof-policy";
import type { ReclaimTrustedData } from "../src/reclaim-types";

const account = "0x000000000000000000000000000000000000a11c";
const baseContext = {
  contextAddress: account,
  contextMessage: "42:baseline",
  reclaimSessionId: "session-123",
};

function trusted(
  input: {
    marker?: string;
    id?: string;
    xp?: string;
    ownershipContext?: Record<string, unknown>;
    xpContext?: Record<string, unknown>;
  } = {},
): ReclaimTrustedData[] {
  return [
    {
      context: { ...baseContext, providerHash: DUOLINGO_OWNERSHIP_REQUEST_HASH, ...input.ownershipContext },
      extractedParameters: { marker: input.marker ?? "disable_social" },
    },
    {
      context: { ...baseContext, providerHash: DUOLINGO_XP_REQUEST_HASH, ...input.xpContext },
      extractedParameters: {
        id: input.id ?? "123456",
        xp: input.xp ?? "1000",
      },
    },
  ];
}

const policy = {
  account,
  giftId: "42",
  phase: "baseline" as const,
  expectedSessionId: "session-123",
  expectedProfileId: "123456",
};

function codeIs(code: string) {
  return (error: unknown) => error instanceof DuolingoPolicyError && error.code === code;
}

test("accepts separate self-ownership and XP proofs without publishing a display name", () => {
  const result = validateDuolingoEvidence({
    data: trusted(),
    timestamps: [1_784_000_000, 1_784_000_003],
    providerId: DUOLINGO_PROVIDER_ID,
    policy,
  });
  assert.equal(result.totalXp, 1000);
  assert.equal(result.profileId, "123456");
  assert.equal(result.observedAt, 1_784_000_003);
  assert.equal(result.dayIndex, 0);
  assert.match(result.identityHash, /^0x[0-9a-f]{64}$/);
});

test("rejects a missing self-only ownership marker", () => {
  assert.throws(
    () =>
      validateDuolingoEvidence({
        data: trusted({ marker: "disable_leaderboards" }),
        timestamps: [1, 2],
        providerId: DUOLINGO_PROVIDER_ID,
        policy,
      }),
    /does not control/,
  );
});

test("rejects a profile response that differs from the server-resolved username id (refusal case 5)", () => {
  assert.throws(
    () =>
      validateDuolingoEvidence({
        data: trusted({ id: "654321" }),
        timestamps: [1, 2],
        providerId: DUOLINGO_PROVIDER_ID,
        policy,
      }),
    codeIs("ACCOUNT_NOT_OWNED"),
  );
});

test("binds both proofs to account, gift phase, session and exact request schemas", () => {
  for (const [changed, code] of [
    [{ ownershipContext: { contextAddress: "0x000000000000000000000000000000000000b0b0" } }, "WRONG_ACCOUNT"],
    [{ xpContext: { contextMessage: "43:baseline" } }, "WRONG_GIFT_PHASE"],
    [{ ownershipContext: { reclaimSessionId: "session-attacker" } }, "WRONG_SESSION"],
    [{ xpContext: { providerHash: DUOLINGO_OWNERSHIP_REQUEST_HASH } }, "WRONG_REQUEST_SCHEMA"],
  ] as const) {
    assert.throws(
      () =>
        validateDuolingoEvidence({
          data: trusted(changed),
          timestamps: [1, 2],
          providerId: DUOLINGO_PROVIDER_ID,
          policy,
        }),
      codeIs(code),
      `expected ${code}`,
    );
  }
});

test("a check-in is bound to its day index in the signed message", () => {
  assert.equal(duolingoContextMessage("42", "baseline"), "42:baseline");
  assert.equal(duolingoContextMessage("42", "check-in", 7), "42:7");
  assert.equal(duolingoContextMessage("42", "check-in", 366), "42:366");
  assert.throws(() => duolingoContextMessage("42", "check-in", 367), codeIs("INVALID_POLICY"));
  assert.throws(() => duolingoContextMessage("42", "check-in"), codeIs("INVALID_POLICY"));

  const checkIn = { ...policy, phase: "check-in" as const, dayIndex: 7 };
  const data = trusted({ ownershipContext: { contextMessage: "42:7" }, xpContext: { contextMessage: "42:7" } });
  const result = validateDuolingoEvidence({ data, timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy: checkIn });
  assert.equal(result.dayIndex, 7);
  assert.equal(result.phase, "check-in");
  // The baseline message is refused for a day-7 check-in, and day 8's message for day 7.
  assert.throws(
    () => validateDuolingoEvidence({ data: trusted(), timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy: checkIn }),
    codeIs("WRONG_GIFT_PHASE"),
  );
  const dayEight = trusted({ ownershipContext: { contextMessage: "42:8" }, xpContext: { contextMessage: "42:8" } });
  assert.throws(
    () => validateDuolingoEvidence({ data: dayEight, timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy: checkIn }),
    codeIs("WRONG_GIFT_PHASE"),
  );
});

test("honours an explicit expectedContextMessage", () => {
  const ctx = `gift:create:0x${"ab".repeat(32)}:baseline`;
  const data = trusted({ ownershipContext: { contextMessage: ctx }, xpContext: { contextMessage: ctx } });
  const explicit = { ...policy, giftId: "0", expectedContextMessage: ctx };
  const result = validateDuolingoEvidence({ data, timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy: explicit });
  assert.equal(result.totalXp, 1000);
  assert.throws(
    () => validateDuolingoEvidence({ data: trusted(), timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy: explicit }),
    codeIs("WRONG_GIFT_PHASE"),
  );
});

test("the nullifier is stable for a phase and distinct across days", () => {
  const first = validateDuolingoEvidence({ data: trusted(), timestamps: [1, 2], providerId: DUOLINGO_PROVIDER_ID, policy });
  const second = validateDuolingoEvidence({ data: trusted(), timestamps: [3, 4], providerId: DUOLINGO_PROVIDER_ID, policy });
  assert.equal(first.eventNullifier, second.eventNullifier);
  const day = (dayIndex: number) =>
    validateDuolingoEvidence({
      data: trusted({
        ownershipContext: { contextMessage: `42:${dayIndex}` },
        xpContext: { contextMessage: `42:${dayIndex}` },
      }),
      timestamps: [1, 2],
      providerId: DUOLINGO_PROVIDER_ID,
      policy: { ...policy, phase: "check-in", dayIndex },
    }).eventNullifier;
  assert.notEqual(day(1), day(2));
  assert.notEqual(day(1), first.eventNullifier);
});

test("rejects wrong counts, providers and non-canonical numeric fields", () => {
  assert.throws(() =>
    validateDuolingoEvidence({ data: trusted().slice(1), timestamps: [1], providerId: DUOLINGO_PROVIDER_ID, policy }),
  );
  assert.throws(() => validateDuolingoEvidence({ data: trusted(), timestamps: [1, 2], providerId: "wrong-provider", policy }));
  for (const fields of [{ id: "0123456" }, { id: "18446744073709551616" }, { xp: "01000" }]) {
    assert.throws(() =>
      validateDuolingoEvidence({
        data: trusted(fields),
        timestamps: [1, 2],
        providerId: DUOLINGO_PROVIDER_ID,
        policy,
      }),
    );
  }
});

// --- progress between two proofs -------------------------------------------------------------------
// Everything below lives in the RELATION between two proofs, which is exactly where a per-proof check
// cannot help: each proof can be perfectly valid on its own while the pair is a lie.

function evidence(overrides: Partial<DuolingoEvidence> = {}): DuolingoEvidence {
  return {
    profileId: "477033640",
    totalXp: 8_193,
    identityHash: keccak256(stringToHex("identity:477033640")),
    eventNullifier: keccak256(stringToHex("nullifier:baseline")),
    observedAt: 1_784_253_360,
    sessionId: "a8d2e5c3d3",
    phase: "baseline",
    dayIndex: 0,
    ...overrides,
  };
}

function checkInEvidence(overrides: Partial<DuolingoEvidence> = {}): DuolingoEvidence {
  return evidence({
    totalXp: 8_207,
    eventNullifier: keccak256(stringToHex("nullifier:1")),
    observedAt: 1_784_255_388,
    phase: "check-in",
    dayIndex: 1,
    ...overrides,
  });
}

test("the real captured cycle passes: 8193 then 8207 earns 14 XP", () => {
  const progress = validateDuolingoProgress({ previous: evidence(), current: checkInEvidence() });
  assert.equal(progress.earnedXp, 14);
  assert.equal(progress.previousXp, 8_193);
  assert.equal(progress.currentXp, 8_207);
});

test("no progress is still a valid pair; the contract decides what it credits", () => {
  const progress = validateDuolingoProgress({ previous: evidence(), current: checkInEvidence({ totalXp: 8_193 }) });
  assert.equal(progress.earnedXp, 0);
});

test("the recipient cannot swap Duolingo accounts between the two proofs", () => {
  assert.throws(
    () =>
      validateDuolingoProgress({
        previous: evidence(),
        current: checkInEvidence({ identityHash: keccak256(stringToHex("identity:999")) }),
      }),
    codeIs("IDENTITY_CHANGED"),
  );
});

test("a proof cannot play both ends of its own progress", () => {
  const same = evidence();
  for (const [pair, code] of [
    [{ previous: same, current: { ...same, phase: "check-in" as const, dayIndex: 1 } }, "REPLAYED_PROOF"],
    [{ previous: same, current: checkInEvidence({ observedAt: same.observedAt }) }, "NOT_AFTER_PREVIOUS"],
    [{ previous: checkInEvidence(), current: evidence() }, "WRONG_PHASE_ORDER"],
    [{ previous: checkInEvidence({ dayIndex: 3 }), current: checkInEvidence({ dayIndex: 3, observedAt: 1_784_260_000, eventNullifier: keccak256(stringToHex("nullifier:3b")) }) }, "WRONG_PHASE_ORDER"],
  ] as const) {
    assert.throws(() => validateDuolingoProgress(pair), codeIs(code), `expected ${code}`);
  }
});

test("XP going backwards is refused rather than read as a negative delta", () => {
  assert.throws(
    () => validateDuolingoProgress({ previous: evidence({ totalXp: 9_000 }), current: checkInEvidence({ totalXp: 8_207 }) }),
    codeIs("XP_WENT_BACKWARDS"),
  );
});

test("the new proof must be fresh, and cannot be dated in the future", () => {
  const now = 1_784_255_388 + 600;
  assert.ok(validateDuolingoProgress({ previous: evidence(), current: checkInEvidence(), maxCurrentAgeSeconds: 3_600, now }));
  assert.throws(
    () => validateDuolingoProgress({ previous: evidence(), current: checkInEvidence(), maxCurrentAgeSeconds: 60, now }),
    codeIs("PROOF_TOO_OLD"),
  );
  assert.throws(
    () =>
      validateDuolingoProgress({
        previous: evidence(),
        current: checkInEvidence({ observedAt: now + 3_600 }),
        maxCurrentAgeSeconds: 3_600,
        now,
      }),
    codeIs("PROOF_IN_FUTURE"),
  );
});
