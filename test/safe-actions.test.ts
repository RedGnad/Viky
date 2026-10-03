// What the owner of Viky's contracts can be asked to do through the Safe, each action as the one call it is (the review
// of 2 Oct 2026, R-06 and R-10). The tool itself is rehearsed against a fork of mainnet by `pnpm rehearse:v2`: built,
// signed by two keys and sent. These pin what it builds, with no chain and no key.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeFunctionData, toFunctionSelector, type Abi } from "viem";
import { consentAnchorAbi } from "../src/consent-anchor-abi";
import { giftEscrowV2Abi } from "../src/gift-escrow-v2-abi";
import { giftEscrowV3Abi } from "../src/gift-escrow-v3-abi";
import { milestoneGiftV2Abi } from "../src/milestone-gift-v2-abi";
import { isLocalRpc, scriptTransport } from "../src/monad/chain";
import { SAFE_ACTIONS, SAFE_TARGETS, safeActionCall, safeTarget } from "../src/safe-actions";

const DAILY_V2 = "0x904eb9C50656673770Ab3C3f91395Ce3684B8BDF";
const MILESTONE_V2 = "0xa0D26d3f4C777aF7F65F1E52020173DC748FAC4D";
const ANCHOR = "0xE4f997659b93cA5389B9829FB68737300E66c236";
const V1 = { GIFT_ESCROW_ADDRESS: "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233", NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS: "0xE04CD59bB93765333200a9da01df83149D4C4d67", MILESTONE_GIFT_ADDRESS: "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e", EXIT_ROUTER_ADDRESS: "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223" };
const SIGNER = "0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a";
const ZERO = "0x0000000000000000000000000000000000000000";

const called = (abi: unknown, data: `0x${string}`) => {
  const decoded = decodeFunctionData({ abi: abi as Abi, data });
  return `${decoded.functionName}(${(decoded.args ?? []).join(",")})`;
};

test("the tool knows the three contracts of the second version, by a name each", () => {
  assert.deepEqual(SAFE_TARGETS, ["escrow", "earlier-escrow", "milestone", "router", "escrow-v2", "milestone-v2", "anchor", "escrow-v3"]);
  assert.deepEqual(SAFE_ACTIONS, ["creation-paused", "checkin-paused", "proof-paused", "evidence-signer", "anchorer", "accept-ownership", "raw"]);
  // Before the app is told where they are, which is when their ownership is accepted: named on the command line.
  assert.equal(safeTarget({ TARGET: "escrow-v2", TARGET_ADDRESS: DAILY_V2 }).address, DAILY_V2);
  assert.equal(safeTarget({ TARGET: "milestone-v2", TARGET_ADDRESS: MILESTONE_V2.toLowerCase() }).address, MILESTONE_V2);
  // Once the app knows them, its own settings name them, for the emergency that has no time to look an address up.
  const set = { NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: DAILY_V2, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: MILESTONE_V2, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: ANCHOR };
  assert.equal(safeTarget({ ...set, TARGET: "escrow-v2" }).address, DAILY_V2);
  assert.equal(safeTarget({ ...set, TARGET: "anchor" }).address, ANCHOR);
  assert.equal(safeTarget({ ...set, TARGET: "anchor", TARGET_ADDRESS: ANCHOR }).address, ANCHOR, "said twice, the same");
  // Two addresses that disagree, no address at all, and an address given for a contract in service: each is refused.
  assert.throws(() => safeTarget({ ...set, TARGET: "escrow-v2", TARGET_ADDRESS: MILESTONE_V2 }), /one of the two is wrong/);
  assert.throws(() => safeTarget({ TARGET: "escrow-v2" }), /give TARGET_ADDRESS, as the deployment printed it/);
  assert.throws(() => safeTarget({ ...V1, TARGET: "escrow", TARGET_ADDRESS: DAILY_V2 }), /second version or the third only/);
  assert.throws(() => safeTarget({ TARGET: "escrow-v2", TARGET_ADDRESS: "0x1234" }), /not an address/);
  assert.throws(() => safeTarget({ TARGET: "vault" }), /is none of them/);
  // The contracts in service are found where they always were, and the default is the daily one.
  assert.equal(safeTarget(V1).address, V1.GIFT_ESCROW_ADDRESS);
  assert.equal(safeTarget({ ...V1, TARGET: "milestone" }).address, V1.MILESTONE_GIFT_ADDRESS);
});

test("accepting an ownership is an action of its own, on the three contracts whose ownership moves in two steps", () => {
  for (const [target, address, abi] of [["escrow-v2", DAILY_V2, giftEscrowV2Abi], ["milestone-v2", MILESTONE_V2, milestoneGiftV2Abi], ["anchor", ANCHOR, consentAnchorAbi]] as const) {
    const call = safeActionCall({ ACTION: "accept-ownership", TARGET: target, TARGET_ADDRESS: address });
    assert.equal(call.to, address);
    assert.equal(call.data, "0x79ba5097", "acceptOwnership(), the bytes that were written by hand before");
    assert.equal(call.data, toFunctionSelector("acceptOwnership()"));
    assert.equal(called(abi, call.data), "acceptOwnership()");
    assert.match(call.step, new RegExp(`^accept the ownership of the .+ at ${address}$`));
  }
  // The contracts in service moved in one step, with nothing to accept.
  assert.throws(() => safeActionCall({ ...V1, ACTION: "accept-ownership", TARGET: "escrow" }), /is not an action of the gift escrow/);
});

test("the third daily contract is a target of its own: accepted, paused and given a signer as the second version's is", () => {
  const DAILY_V3 = "0x00000000000000000000000000000000000000E3";
  // Named on the command line before the app knows it, and by its own setting after.
  assert.equal(safeTarget({ TARGET: "escrow-v3", TARGET_ADDRESS: DAILY_V3 }).address, DAILY_V3);
  assert.equal(safeTarget({ NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS: DAILY_V3, TARGET: "escrow-v3" }).address, DAILY_V3);
  assert.throws(() => safeTarget({ TARGET: "escrow-v3" }), /give TARGET_ADDRESS, as the deployment printed it/);
  assert.throws(() => safeTarget({ NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS: DAILY_V3, TARGET: "escrow-v3", TARGET_ADDRESS: DAILY_V2 }), /one of the two is wrong/);
  let call = safeActionCall({ ACTION: "accept-ownership", TARGET: "escrow-v3", TARGET_ADDRESS: DAILY_V3 });
  assert.deepEqual([call.to, call.data, call.step], [DAILY_V3, "0x79ba5097", `accept the ownership of the gift escrow, third version at ${DAILY_V3}`]);
  const env = { NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS: DAILY_V3, TARGET: "escrow-v3" };
  call = safeActionCall({ ...env, ACTION: "checkin-paused", PAUSED: "true" });
  assert.deepEqual([call.to, called(giftEscrowV3Abi, call.data), call.step], [DAILY_V3, "setCheckInPaused(true)", "pause checkin on the gift escrow, third version"]);
  call = safeActionCall({ ...env, ACTION: "creation-paused", PAUSED: "true" });
  assert.equal(called(giftEscrowV3Abi, call.data), "setCreationPaused(true)");
  call = safeActionCall({ ...env, ACTION: "evidence-signer", VALUE: SIGNER });
  assert.equal(call.step, `announce ${SIGNER} as the evidence signer of the gift escrow, third version, to stand in 24 hours`);
  // It proves nothing of a milestone and anchors nothing.
  assert.throws(() => safeActionCall({ ...env, ACTION: "proof-paused", PAUSED: "true" }), /is not an action of the gift escrow, third version/);
  assert.throws(() => safeActionCall({ ...env, ACTION: "anchorer", VALUE: SIGNER }), /is not an action of the gift escrow, third version/);
});

test("the emergency actions of the second version are named, each on the contract that has it", () => {
  const env = { NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: DAILY_V2, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: MILESTONE_V2, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: ANCHOR };
  let call = safeActionCall({ ...env, ACTION: "checkin-paused", TARGET: "escrow-v2", PAUSED: "true" });
  assert.deepEqual([call.to, called(giftEscrowV2Abi, call.data), call.step], [DAILY_V2, "setCheckInPaused(true)", "pause checkin on the gift escrow, second version"]);
  call = safeActionCall({ ...env, ACTION: "proof-paused", TARGET: "milestone-v2", PAUSED: "true" });
  assert.deepEqual([call.to, called(milestoneGiftV2Abi, call.data)], [MILESTONE_V2, "setProofPaused(true)"]);
  call = safeActionCall({ ...env, ACTION: "creation-paused", TARGET: "milestone-v2", PAUSED: "false" });
  assert.deepEqual([called(milestoneGiftV2Abi, call.data), call.step], ["setCreationPaused(false)", "unpause creation on the milestone gift, second version"]);
  // A signer is announced there, and stands a day later; zero calls an announcement off. The step says which.
  call = safeActionCall({ ...env, ACTION: "evidence-signer", TARGET: "escrow-v2", VALUE: SIGNER });
  assert.deepEqual([called(giftEscrowV2Abi, call.data), call.step], [`setEvidenceSigner(${SIGNER})`, `announce ${SIGNER} as the evidence signer of the gift escrow, second version, to stand in 24 hours`]);
  call = safeActionCall({ ...env, ACTION: "evidence-signer", TARGET: "milestone-v2", VALUE: ZERO });
  assert.deepEqual([called(milestoneGiftV2Abi, call.data), call.step], [`setEvidenceSigner(${ZERO})`, "call off the evidence signer announced on the milestone gift, second version"]);
  call = safeActionCall({ ...env, ACTION: "anchorer", TARGET: "anchor", VALUE: SIGNER });
  assert.deepEqual([call.to, called(consentAnchorAbi, call.data)], [ANCHOR, `setAnchorer(${SIGNER})`]);
  // An action asked of a contract that has none of it is refused in words, before anything is encoded.
  assert.throws(() => safeActionCall({ ...env, ACTION: "proof-paused", TARGET: "escrow-v2", PAUSED: "true" }), /proof-paused is not an action of the gift escrow, second version/);
  assert.throws(() => safeActionCall({ ...env, ACTION: "checkin-paused", TARGET: "anchor", PAUSED: "true" }), /is not an action of the consent anchor/);
  assert.throws(() => safeActionCall({ ...env, ACTION: "anchorer", TARGET: "escrow-v2", VALUE: SIGNER }), /is not an action/);
  assert.throws(() => safeActionCall({ ...env, ACTION: "checkin-paused", TARGET: "escrow-v2" }), /PAUSED must be true or false/);
  assert.throws(() => safeActionCall({ ...env, ACTION: "sweep", TARGET: "escrow-v2" }), /ACTION is creation-paused/);
});

test("the actions of the contracts in service are what they were, and raw still refuses to give a contract up", () => {
  let call = safeActionCall({ ...V1, ACTION: "creation-paused", PAUSED: "true" });
  assert.deepEqual([call.to, call.step], [V1.GIFT_ESCROW_ADDRESS, "pause creation on the gift escrow"]);
  call = safeActionCall({ ...V1, ACTION: "evidence-signer", TARGET: "milestone", VALUE: SIGNER });
  assert.equal(call.step, `set the evidence signer of the milestone gift to ${SIGNER}`);
  call = safeActionCall({ ACTION: "raw", TO: DAILY_V2, DATA: "0x79ba5097" });
  assert.deepEqual([call.to, call.data, call.target], [DAILY_V2, "0x79ba5097", null]);
  assert.throws(() => safeActionCall({ ACTION: "raw", TO: DAILY_V2, DATA: "0x715018a6" }), /renounceOwnership/);
  assert.throws(() => safeActionCall({ ACTION: "raw", TO: DAILY_V2, DATA: "0x7" }), /DATA must be the call's own bytes/);
});

test("a script that sends speaks to a local node only as a rehearsal, and a rehearsal to nothing else", () => {
  assert.equal(isLocalRpc("http://127.0.0.1:8547"), true);
  assert.equal(isLocalRpc("http://localhost:8545/"), true);
  assert.equal(isLocalRpc("https://rpc.monad.xyz"), false);
  assert.equal(isLocalRpc("https://localhost.example.com"), false);
  // A setting left over from a rehearsal cannot send a real run to a fork.
  assert.throws(() => scriptTransport("http://127.0.0.1:8547", false), /is a local node, and this is not a rehearsal/);
  // And a rehearsal never leaves its node: no public endpoint behind it to fall back to.
  assert.throws(() => scriptTransport("https://rpc.monad.xyz", true), /REHEARSAL runs only against a local node/);
  assert.doesNotThrow(() => scriptTransport("http://127.0.0.1:8547", true));
  assert.doesNotThrow(() => scriptTransport("https://rpc.monad.xyz", false));
  const chain = readFileSync("src/monad/chain.ts", "utf8");
  assert.match(chain, /return rehearsal \? http\(rpcUrl\) : monadTransport\(rpcUrl\);/);
  for (const script of ["scripts/safe-action.ts", "scripts/deploy-v2.ts", "scripts/check-v2-handover.ts"]) {
    assert.match(readFileSync(script, "utf8"), /scriptTransport\(/, script);
    assert.doesNotMatch(readFileSync(script, "utf8"), /monadTransport\(/, `${script} takes no transport that falls back to the public endpoint`);
  }
});

test("the Safe's tool runs the call as the Safe before anybody signs, and reads an acceptance back", () => {
  const tool = readFileSync("scripts/safe-action.ts", "utf8");
  // What the contract would refuse is refused before the hash to sign is printed.
  assert.ok(tool.indexOf("await publicClient.call({ account: safe, to: call.to, data: call.data });") < tool.indexOf("signThis: hash"));
  assert.match(tool, /if \(getAddress\(pending\) !== safe\) throw new Error\(`Refusing to run: the ownership of \$\{call\.to\} is offered to/);
  assert.match(tool, /if \(getAddress\(owner\) !== safe \|\| !\/\^0x0\{40\}\$\/\.test\(pending\)\) throw new Error/);
  assert.match(tool, /A signer is waiting on \$\{call\.to\}/);
});

test("the deployment asks for no private key of the evidence signer, and says each address the moment it exists", () => {
  const script = readFileSync("scripts/deploy-v2.ts", "utf8");
  // Never read, never required: the only mentions are the sentences that say it is not asked for.
  assert.doesNotMatch(script, /process\.env\.EVIDENCE_SIGNER_PRIVATE_KEY/);
  assert.doesNotMatch(script, /required\("EVIDENCE_SIGNER_PRIVATE_KEY"\)/);
  // Its address is held to what the contracts in service hold, and the owner to the one they answer to.
  assert.match(script, /functionName: "evidenceSigner" \}\)\)\);\s+if \(signedBy !== evidenceSigner\) throw new Error\(`Refusing to deploy: EVIDENCE_SIGNER_ADDRESS/);
  assert.match(script, /functionName: "owner" \}\)\)\);\s+if \(ownedBy !== owner\) throw new Error\(`Refusing to deploy: OWNER_ADDRESS/);
  // The address is printed before the first check that can stop the run.
  assert.ok(script.indexOf("console.log(`WRITE DOWN: ${name} is at ${getAddress(address)}") < script.indexOf("if (getAddress(address) !== expected)"));
  // No pause is sent at deployment, and the three settings are printed as not to be set yet.
  assert.doesNotMatch(script, /setCheckInPaused|setProofPaused/);
  assert.match(script, /DEPLOYED \(not yet the Safe's, and not to be set in the app yet\)/);
  assert.match(script, /pnpm check:v2-handover/);
  // The check prints the three settings only when nothing is left to put right.
  const check = readFileSync("scripts/check-v2-handover.ts", "utf8");
  assert.ok(check.indexOf("if (problems.length > 0)") < check.indexOf("console.log(`${contract.setting}=${contract.address}`)"));
  assert.match(readFileSync("package.json", "utf8"), /"check:v2-handover": "tsx scripts\/check-v2-handover\.ts"/);
});
