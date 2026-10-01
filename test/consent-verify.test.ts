import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { heldAt, type AnchoredEntry } from "../src/consent-verify";

/**
 * What `pnpm verify:consent` decides once it has read the anchor (the audit of 1 Oct 2026, section 3.7): which yes or
 * stop held at the moment of a reading. The reading of the chain itself runs against the real contracts in the fork
 * rehearsal (scripts/rehearse-v2-fork.ts, step 6).
 */

const DIGEST = `0x${"ab".repeat(32)}` as const;
const entry = (sequence: number, kind: AnchoredEntry["kind"], anchoredAt: number, stands = true): AnchoredEntry => ({ sequence, kind, anchoredAt, digest: DIGEST, stands });

test("a reading is held by the latest yes or stop anchored by its moment, and by nothing before the first", () => {
  const entries = [entry(0, "yes", 100), entry(1, "stop", 200), entry(2, "yes", 300)];
  assert.equal(heldAt(entries, 99), "nothing", "before the first yes");
  assert.equal(heldAt(entries, 100), "yes", "the block of the yes itself");
  assert.equal(heldAt(entries, 150), "yes");
  assert.equal(heldAt(entries, 250), "stop", "a reading after a stop is not covered by the yes before it");
  assert.equal(heldAt(entries, 300), "yes", "agreeing again covers again");
  assert.equal(heldAt([], 1_000), "nothing");
});

test("an entry the bound key did not sign counts for nothing: neither a yes it would give, nor a stop it would lift", () => {
  // A yes nobody signed, written by whoever holds the relayer's key: it covers no reading.
  assert.equal(heldAt([entry(0, "yes", 100, false)], 150), "nothing");
  // And such a yes after a real stop does not lift the stop.
  assert.equal(heldAt([entry(0, "yes", 100), entry(1, "stop", 200), entry(2, "yes", 300, false)], 350), "stop");
  // A stop nobody signed does not end a real yes either: only the person's own key says stop.
  assert.equal(heldAt([entry(0, "yes", 100), entry(1, "stop", 200, false)], 250), "yes");
  // A kind the contract does not know is nothing.
  assert.equal(heldAt([entry(0, "unknown", 100)], 150), "nothing");
});

test("with nothing set, the command says there is nothing to verify, and fails", () => {
  const env = { ...process.env, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: "", NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: "", NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: "" };
  let output = "";
  let code = 0;
  try {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-consent.ts"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const failed = error as { status?: number; stderr?: string };
    code = failed.status ?? 1;
    output = failed.stderr ?? "";
  }
  assert.equal(code, 1);
  assert.match(output, /VERIFY_FAILED: Nothing to verify/);
});
