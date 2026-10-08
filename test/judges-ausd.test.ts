import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ausdFacts, type AusdReader } from "../src/judges-ausd";

/**
 * What AUSD's issuer is doing to the token right now, on the judges page (the review of 2 Oct 2026, R-12): asked of
 * the token as the page is served, and said as not read when any part of it could not be.
 */

const ADMIN = "0xB8fCC66d613e5f54ee6A425DDbf4a2fDBE4Dedee";
const DAILY = "0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51";
const MILESTONE = "0x493c87A27E637bBc7179C17bE2B215fC18523CC0";

const reader = (over: Partial<Record<string, unknown>> = {}, frozen: readonly string[] = []): AusdReader => ({
  read: async (name) => ({ isTransferPaused: false, isSignatureVerificationPaused: false, proxyAdminAddress: ADMIN, ...over })[name],
  frozen: async (account) => frozen.includes(account),
});

test("the token's state is read whole: its two suspensions, who can replace its code, and each holder frozen or not", async () => {
  assert.deepEqual(await ausdFacts([DAILY, MILESTONE], reader()), {
    transfersPaused: false,
    signedTransfersPaused: false,
    proxyAdmin: ADMIN,
    holders: [{ address: DAILY, frozen: false }, { address: MILESTONE, frozen: false }],
  });
  const stopped = await ausdFacts([DAILY, MILESTONE], reader({ isSignatureVerificationPaused: true }, [MILESTONE]));
  assert.equal(stopped?.signedTransfersPaused, true);
  assert.deepEqual(stopped?.holders, [{ address: DAILY, frozen: false }, { address: MILESTONE, frozen: true }]);
});

test("a part that cannot be read leaves nothing said, and never an error on the page", async () => {
  const failing: AusdReader = { read: async () => Promise.reject(new Error("the chain does not answer")), frozen: async () => false };
  assert.equal(await ausdFacts([DAILY], failing), null);
  assert.equal(await ausdFacts([DAILY], reader({ proxyAdminAddress: "nobody" })), null);
  const block = readFileSync("app/judges/JudgesAgora.tsx", "utf8");
  assert.match(block, /could not be asked of the token just now, so nothing is said of it here rather than something out of date\./);
  assert.doesNotMatch(block, /error\.message/);
});

test("the block names the issuer, what its roles can do to a gift, and what Viky takes, from the sources read", () => {
  const block = readFileSync("app/judges/JudgesAgora.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(block.includes("AUSD is issued by Agora Bermuda Limited"));
  for (const said of ["A freezer role can freeze an account, which can then neither send nor receive AUSD.", "A pauser role can suspend every transfer, or the signed transfers alone", "A burner role can burn AUSD from an account.", "The contract&apos;s admin can replace its code.", "Nobody else gains by any of these: the money stays where it is."]) {
    assert.ok(block.includes(said), said);
  }
  assert.ok(block.includes("Nothing today. The gift contracts take no fee, in any version"));
  // No fee in the contracts: no function of either version sends AUSD to anybody but a gift's two people.
  for (const file of ["contracts/GiftEscrowV2.sol", "contracts/MilestoneGiftV2.sol", "contracts/GiftEscrow.sol", "contracts/MilestoneGift.sol"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\bfee\b|\bFee\b|treasury/, file);
  }
  // The plain send is the route's own: a signed authorization the relayer submits, to any account but Viky's contracts.
  const send = readFileSync("app/api/send/route.ts", "utf8");
  assert.match(send, /name: "transferWithAuthorization"/);
  assert.match(send, /isVikyContract/);
});
