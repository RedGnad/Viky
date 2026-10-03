import assert from "node:assert/strict";
import test from "node:test";
import type { Hex } from "viem";
import { heldStartStillGood } from "../src/held-start";
import type { HeldStart } from "../src/held-start-store";

/**
 * A first reading that waits for its signature is answered again, never read again (3 Oct 2026): a person who closed
 * their passkey's sheet and pressed a second time used to pay for a second proof, with the first still waiting.
 */

const NOW = 1_790_000_000;
const ACCOUNT = "0x000000000000000000000000000000000000b0b0";
const CONTRACT = "0x00000000000000000000000000000000000000d2" as Hex;
const IDENTITY = `0x${"1d".repeat(32)}`;

function held(over: Partial<HeldStart> = {}, message: Record<string, string | number> = {}): HeldStart {
  return {
    giftId: "7",
    account: ACCOUNT,
    kind: "daily",
    contract: CONTRACT,
    message: { identityHash: IDENTITY, metricValue: "1000", observedAt: String(NOW - 120), issuedAt: String(NOW - 120), expiresAt: String(NOW + 480), ...message },
    sessionId: "public:7:bind:20700:abcd",
    after: {},
    heldAt: new Date((NOW - 120) * 1_000),
    ...over,
  } as HeldStart;
}

const asked = (load: () => Promise<HeldStart | null>, account = ACCOUNT, now = NOW) => heldStartStillGood("7", account, now, load as never);

test("a held first reading still good to send is what there is to sign, again", async () => {
  assert.deepEqual(await asked(async () => held()), { kind: "sign", giftId: "7", start: { of: "daily", contract: CONTRACT, identityHash: IDENTITY, metricValue: "1000", observedAt: String(NOW - 120) } });
  // Asked by another account than the one it is held for, or with nothing held: nothing.
  assert.equal(await asked(async () => held(), "0x000000000000000000000000000000000000dEaD"), null);
  assert.equal(await asked(async () => null), null);
  // A store that cannot be read is taken as nothing held: the reading is taken afresh.
  assert.equal(await asked(async () => Promise.reject(new Error("the database did not answer"))), null);
});

test("past its end, or within a minute of it, it is read afresh: a daily start ends with its attestation, a climb's with its observation", async () => {
  // Daily: the attestation is sent as it was signed, and ends at its `expiresAt`.
  assert.notEqual(await asked(async () => held({}, { expiresAt: String(NOW + 61) })), null);
  assert.equal(await asked(async () => held({}, { expiresAt: String(NOW + 60) })), null);
  assert.equal(await asked(async () => held({}, { expiresAt: String(NOW - 1) })), null);
  // A climb: signed again when it is sent, so what ages is the observation, ten minutes.
  const climb = (observedAt: number) => held({ kind: "milestone", sessionId: null }, { observedAt: String(observedAt), expiresAt: String(NOW - 9_999) });
  assert.equal((await asked(async () => climb(NOW - 500)))?.start.of, "milestone");
  assert.equal(await asked(async () => climb(NOW - 541)), null);
  // What is held must name an identity, or it is not something to sign.
  assert.equal(await asked(async () => held({}, { identityHash: "0x1234" })), null);
});
