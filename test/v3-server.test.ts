// The third daily contract on the server and in the browser (3 Oct 2026): the second version's contract with one rule
// changed, a day is paid by a reading taken that same day. What these pin: it is off until its own address is set, it
// stands on the second version's three settings, everything signed for it is signed under its own version, a gift on
// it is read as the day goes and never pays for a proof without a lesson seen, and nothing changes for a gift on the
// first two versions. The chain is not reached here.

process.env.SESSION_SIGNING_SECRET = "test-account-session-secret-that-is-longer-than-32-bytes";
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
delete process.env.DATABASE_URL;
delete process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS;
delete process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS;
delete process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS;
delete process.env.NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS;
process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233";
process.env.GIFT_ESCROW_ADDRESS = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prepareGift } from "../src/client/gift";
import { openWithTheLinkSecret, secondVersionOf, versionOf } from "../src/client/v2";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { readAsTheDayGoes } from "../src/daily-count";
import { DuolingoProfileError, type PublicDuolingoProfile } from "../src/duolingo-profile";
import { lastResortWithin, PROOF_EVERY_SECONDS, runPublicCheckIn, type PublicCheckInDeps } from "../src/duolingo-public-checkin";
import { FREQUENT_DAILY_PASS_EVERY_SECONDS, frequentDailyPass } from "../src/frequent-pass";
import { evidenceSignerAddress, signCheckIn, type CheckInMessage } from "../src/gift-attestation";
import type { GiftState } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, markBound, markClaimed, saveGift } from "../src/gift-store";
import { CHECK_IN_TYPES, GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import { morningSentence } from "../src/morning-message";
import type { SqlExecutor } from "../src/proof-session-store";
import { RelayerError } from "../src/relayer";
import { assertSecondVersionWhole, dailyAbiOf, dailyVersionOf, giftEscrowV3Address, linkOpenedDailyContracts, newDailyGiftsContract, opensByItsLink, paysTheSameDay, SECOND_VERSION_SETTINGS, SecondVersionHalfSet, THIRD_VERSION_SETTING, thirdVersionProblem } from "../src/v2";
import { FUND_NONCE_TAG_V2, FUND_NONCE_TAG_V3, fundingNonceOn, fundingNonceV2, fundingNonceV3, GIFT_V2_DOMAIN, GIFT_V3_DOMAIN, v2Domain, type GiftParamsV2 } from "../src/v2-protocol";
import { requestedLink } from "../src/v2-request";
import { isVikyContract } from "../src/viky-contracts";

const V1 = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233" as Hex;
const V2 = "0x00000000000000000000000000000000000000D2" as Hex;
const V2_MILESTONE = "0x00000000000000000000000000000000000000d3" as Hex;
const ANCHOR = "0x00000000000000000000000000000000000000A4" as Hex;
const V3 = "0x00000000000000000000000000000000000000E3" as Hex;
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECIPIENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SECOND = { NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS: V2, NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS: V2_MILESTONE, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: ANCHOR };

/** Runs something with the second version set, and the third when asked, and unsets them afterwards whatever happened. */
async function withVersions<T>(third: boolean, run: () => Promise<T> | T): Promise<T> {
  Object.assign(process.env, SECOND);
  if (third) process.env.NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS = V3;
  try {
    return await run();
  } finally {
    for (const name of [...SECOND_VERSION_SETTINGS, THIRD_VERSION_SETTING]) delete process.env[name];
  }
}

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
});
beforeEach(async () => {
  await db.query("DELETE FROM viky_gifts");
});
after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

test("with its address unset there is no third version, and the second is what it was", async () => {
  assert.equal(giftEscrowV3Address(), null);
  assert.equal(dailyVersionOf(V3), 1);
  await withVersions(false, () => {
    assert.equal(dailyVersionOf(V3), 1, "an address nobody set is no version of anything");
    assert.equal(dailyVersionOf(V2), 2);
    assert.equal(newDailyGiftsContract(), V2);
    assert.deepEqual(linkOpenedDailyContracts(), [V2]);
    assert.equal(secondVersionOf("daily"), V2);
    assert.deepEqual(v2Domain("daily", V3), { ...GIFT_V2_DOMAIN, verifyingContract: V3 });
    assert.equal(isVikyContract(V3), false);
  });
});

test("the address set as the third is the third version, and new daily gifts are made there", async () => {
  await withVersions(true, () => {
    assert.equal(giftEscrowV3Address(), V3);
    assert.equal(dailyVersionOf(V3.toLowerCase()), 3);
    assert.equal(dailyVersionOf(V2), 2, "the second version keeps serving the gifts it holds, by its own rule");
    assert.equal(dailyVersionOf(V1), 1);
    assert.equal(versionOf("7", V3), 3);
    assert.equal(newDailyGiftsContract(), V3);
    assert.equal(secondVersionOf("daily"), V3);
    assert.equal(secondVersionOf("milestone")?.toLowerCase(), V2_MILESTONE.toLowerCase(), "the milestone contract has no third version");
    assert.deepEqual(linkOpenedDailyContracts(), [V2, V3]);
    assert.equal(isVikyContract(V3), true, "money is never sent to it by hand");
    // A request carries a link once either is set, as for the second.
    assert.deepEqual(requestedLink({ openingKey: FUNDER.address, linkFingerprint: "ab".repeat(32) }, "daily"), { openingKey: FUNDER.address, fingerprint: "ab".repeat(32) });
  });
  // What the two later versions share, and the one thing the third alone does.
  assert.deepEqual([1, 2, 3].map((version) => opensByItsLink(version as 1 | 2 | 3)), [false, true, true]);
  assert.deepEqual([1, 2, 3].map((version) => paysTheSameDay(version as 1 | 2 | 3)), [false, false, true]);
  assert.equal(opensByItsLink(undefined), false);
  // Its ABI is the second's without the one refusal its rule no longer has.
  await withVersions(true, () => {
    const names = (contract: Hex) => (dailyAbiOf(contract) as unknown as Array<{ type: string; name?: string }>).filter((entry) => entry.type === "error").map((entry) => entry.name);
    assert.ok(names(V2).includes("OutsideWindow"));
    assert.ok(!names(V3).includes("OutsideWindow"));
    assert.deepEqual(names(V2).filter((name) => name !== "OutsideWindow").sort(), [...names(V3)].sort());
  });
});

test("the third version's address stands on the second's three: alone, malformed, or one of them, it refuses to build and to start", () => {
  assert.equal(thirdVersionProblem({}), null, "unset: off");
  assert.equal(thirdVersionProblem({ ...SECOND, [THIRD_VERSION_SETTING]: V3 }), null, "set on the three: on");
  assert.doesNotThrow(() => assertSecondVersionWhole({ ...SECOND, [THIRD_VERSION_SETTING]: V3 }));
  assert.match(String(thirdVersionProblem({ [THIRD_VERSION_SETTING]: V3 })), /the three settings of the second version are not/);
  assert.match(String(thirdVersionProblem({ ...SECOND, NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS: undefined, [THIRD_VERSION_SETTING]: V3 })), /the three settings of the second version are not/);
  assert.match(String(thirdVersionProblem({ ...SECOND, [THIRD_VERSION_SETTING]: "0x1234" })), /is set and is not an address/);
  assert.match(String(thirdVersionProblem({ ...SECOND, [THIRD_VERSION_SETTING]: V2.toLowerCase() })), /names the address of one of the three/);
  assert.throws(() => assertSecondVersionWhole({ ...SECOND, [THIRD_VERSION_SETTING]: V2 }), (error: unknown) => error instanceof SecondVersionHalfSet);
  // The build's own check is plain JavaScript: held to the same answer.
  const config = readFileSync("next.config.mjs", "utf8");
  assert.match(config, /const thirdVersion = \(process\.env\.NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS \?\? ""\)\.trim\(\);/);
  assert.match(config, /if \(thirdVersion !== "" && \(!\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(thirdVersion\) \|\| secondVersionSet\.length < 3 \|\| secondVersionSet\.some\(\(value\) => value\.toLowerCase\(\) === thirdVersion\.toLowerCase\(\)\)\)\) \{\n\s*throw new Error\("Refusing to build: /);
  const buildRefuses = (env: Record<string, string | undefined>) => {
    const second = SECOND_VERSION_SETTINGS.map((name) => (env[name] ?? "").trim()).filter((value) => value !== "");
    const third = (env[THIRD_VERSION_SETTING] ?? "").trim();
    return third !== "" && (!/^0x[0-9a-fA-F]{40}$/.test(third) || second.length < 3 || second.some((value) => value.toLowerCase() === third.toLowerCase()));
  };
  for (const env of [{}, { ...SECOND, [THIRD_VERSION_SETTING]: V3 }, { [THIRD_VERSION_SETTING]: V3 }, { ...SECOND, [THIRD_VERSION_SETTING]: "0x1234" }, { ...SECOND, [THIRD_VERSION_SETTING]: V2 }]) {
    assert.equal(buildRefuses(env), thirdVersionProblem(env) !== null, JSON.stringify(env));
  }
});

test("everything signed for the third contract is signed under its own version, and its terms pay on it alone", async () => {
  // The same pins as test/V3TypehashParity.t.sol, which reads them off the contract itself.
  assert.equal(FUND_NONCE_TAG_V3, "0x2624e87505ddc5e6017bc49a4eb71a7e9bc774bf67aa0dc15e453c1503bcd207");
  assert.notEqual(FUND_NONCE_TAG_V3, FUND_NONCE_TAG_V2);
  const terms: GiftParamsV2 = { funder: "0x00000000000000000000000000000000000A11cE", refundTo: "0x00000000000000000000000000000000000A11cE", openingKey: "0x519F812ccB8121840C592066052B9e196d9d03c2", goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: `0x${"00".repeat(31)}01` };
  assert.equal(fundingNonceV3(terms), "0xeb24f30dc97d72ca0b71e214d9affbaec3f22c633a12aaefbb8b3243144fbbdd");
  assert.deepEqual([GIFT_V3_DOMAIN.name, GIFT_V3_DOMAIN.version, GIFT_V3_DOMAIN.chainId], ["Viky Gift", "3", 143]);
  await withVersions(true, async () => {
    assert.equal(fundingNonceOn(V3, terms), fundingNonceV3(terms));
    assert.equal(fundingNonceOn(V2, terms), fundingNonceV2(terms));
    assert.deepEqual(v2Domain("daily", V3), { ...GIFT_V3_DOMAIN, verifyingContract: V3 });
    assert.deepEqual(v2Domain("daily", V2), { ...GIFT_V2_DOMAIN, verifyingContract: V2 });
    // A reading for a gift on the third contract is signed under the third's domain, and under no other.
    const message: CheckInMessage = { giftId: 7n, recipient: RECIPIENT.address, identityHash: `0x${"1d".repeat(32)}`, providerId: `0x${"2e".repeat(32)}`, metricValue: 1_010n, observedAt: 1_800_000_000n, nullifier: `0x${"3f".repeat(32)}`, issuedAt: 1_800_000_000n, expiresAt: 1_800_000_600n };
    const signature = await signCheckIn(message, V3);
    const signedUnder = (domain: typeof GIFT_V3_DOMAIN | typeof GIFT_V2_DOMAIN) => recoverTypedDataAddress({ domain: { ...domain, verifyingContract: V3 }, types: CHECK_IN_TYPES, primaryType: "CheckIn", message, signature });
    assert.equal(await signedUnder(GIFT_V3_DOMAIN), evidenceSignerAddress());
    assert.notEqual(await signedUnder(GIFT_V2_DOMAIN), evidenceSignerAddress());
    // The funder's browser signs for the contract the gift is made on: the third's address and the third's nonce.
    const request = await prepareGift({ account: FUNDER, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n });
    const signed: GiftParamsV2 = { funder: FUNDER.address, refundTo: FUNDER.address, openingKey: request.openingKey as Hex, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 5_000_000n, salt: request.salt };
    assert.equal(request.authorization.nonce, fundingNonceV3(signed));
    assert.notEqual(request.authorization.nonce, fundingNonceV2(signed));
  });
  // And the creation route checks the nonce of the contract new gifts are made on.
  const route = readFileSync("app/api/gift/create/route.ts", "utf8");
  assert.match(route, /const madeOn = newDailyGiftsContract\(\);\n\s*const signedFor = link && madeOn\n\s*\? fundingNonceOn\(madeOn, /);
});

test("a link's secret signs for a gift on the second or on the third, as this build's own settings name them, and for no other contract", async () => {
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    sent.push(String(url));
    return new Response(JSON.stringify({ giftId: "7", opened: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await withVersions(true, async () => {
      for (const contract of [V2, V3]) {
        const answer = await openWithTheLinkSecret({ giftId: "7", linkSecret: "AbCdEfGhIjKlMnOpQrStUvWxYz012345", contract, recipient: RECIPIENT.address });
        assert.equal(answer.opened, true, contract);
      }
      assert.equal(sent.length, 2);
      for (const contract of [V1, V2_MILESTONE, ANCHOR, null, "not an address"]) {
        await assert.rejects(openWithTheLinkSecret({ giftId: "7", linkSecret: "AbCdEfGhIjKlMnOpQrStUvWxYz012345", contract, recipient: RECIPIENT.address }), (error: unknown) => (error as { code?: string }).code === "OUT_OF_DATE", String(contract));
      }
      assert.equal(sent.length, 2, "nothing left the browser for a contract that is not one of ours");
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

// --- a gift read as the day goes ----------------------------------------------------------------------------------

const DAY = 86_400;
const TODAY = 20_700;
const NOON = TODAY * DAY + 12 * 3_600;

function onChain(over: Partial<GiftState> = {}): GiftState {
  return {
    giftId: "7",
    funder: FUNDER.address,
    refundTo: FUNDER.address,
    recipient: RECIPIENT.address,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: GOAL_TYPE_DUOLINGO_XP,
    dailyTarget: 10,
    durationDays: 7,
    // Connected yesterday: on the third contract that day was the first, and it is still open beside today.
    startDay: TODAY,
    endDay: TODAY + 6,
    creditedDays: 0,
    drainedDays: 0,
    settledThroughDay: TODAY - 1,
    amount: 7_000_000n,
    perDay: 1_000_000n,
    withdrawnByRecipient: 0n,
    refundedToFunder: 0n,
    refundable: 0n,
    identityHash: `0x${"1d".repeat(32)}`,
    baselineValue: 1_000n,
    lastCheckInAt: NOON - 3_600,
    fundedAt: NOON - 2 * DAY,
    claimedAt: NOON - DAY,
    cancelled: false,
    finalised: false,
    earnedBalance: 0n,
    refundableBalance: 0n,
    withdrawNonce: 0n,
    version: 3,
    openingKey: FUNDER.address,
    endedAt: 0,
    givenBackDays: 0,
    ...over,
  };
}

const seen = (totalXp: number | null): PublicDuolingoProfile => ({ id: "7", username: "Ama", courses: [], currentCourseId: null, totalXp, name: "Ama" });

/** A connected gift in the store, and the dependencies of a reading that must never reach the attested fetch. */
async function reading(escrow: Hex, gift: GiftState, look: PublicCheckInDeps["look"], claim: boolean = true, now: number = NOON, lastResort: boolean = true) {
  await saveGift({ giftId: "7", funder: FUNDER.address, contactHash: NO_CONTACT_HASH, claimToken: "a-link-key-0123456789abcdef", goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_000n, createdTx: `0x${"a7".repeat(32)}`, escrow, goalUsername: "Ama" });
  await markClaimed("7", RECIPIENT.address, null);
  await markBound("7", "7");
  const calls: string[] = [];
  const deps: PublicCheckInDeps = {
    profile: async () => {
      calls.push("proof");
      throw new Error("the attested fetch was reached");
    },
    course: async () => {
      calls.push("proof");
      throw new Error("the attested fetch was reached");
    },
    now: () => now,
    gift: async () => gift,
    look: look
      ? async (username) => {
          calls.push("look");
          return look(username);
        }
      : undefined,
    claimProof: async (giftId, everySeconds) => {
      calls.push(`claim:${giftId}:${everySeconds}`);
      return claim;
    },
    claimLastResort: async (giftId, day) => {
      calls.push(`lastResort:${giftId}:${day}`);
      return lastResort;
    },
  };
  return { calls, deps };
}

test("an open page asks for a look alone: it answers whether a lesson is in, and no proof is ever paid for it", async () => {
  await withVersions(true, async () => {
    const lesson = await reading(V3, onChain(), async () => seen(1_010));
    assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", lookOnly: true }, lesson.deps), { kind: "seen", giftId: "7", xp: 1_010 });
    assert.deepEqual(lesson.calls, ["look"], "no claim and no proof: the look takes nothing");
  });
  await db.query("DELETE FROM viky_gifts");
  await withVersions(true, async () => {
    const none = await reading(V3, onChain(), async () => seen(1_004));
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", lookOnly: true }, none.deps);
    assert.deepEqual(outcome, { kind: "refused", giftId: "7", code: "NOT_ENOUGH_PROGRESS", message: "Not enough yet for a full day. One more lesson and it counts.", xp: 1_004, looked: true });
    assert.deepEqual(none.calls, ["look"]);
  });
  await db.query("DELETE FROM viky_gifts");
  await withVersions(true, async () => {
    // Today paid already: nothing is asked of the source at all.
    const paid = await reading(V3, onChain({ settledThroughDay: TODAY, creditedDays: 1 }), async () => seen(5_000));
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", lookOnly: true }, paid.deps);
    assert.equal(outcome.kind === "refused" && outcome.code, "NOTHING_TO_CREDIT");
    assert.deepEqual(paid.calls, []);
  });
});

test("read as the day goes, a proof is taken only for a lesson the look saw, and only once it is claimed", async () => {
  await withVersions(true, async () => {
    // The look failed: no proof from a page, which comes back in a minute.
    const down = await reading(V3, onChain(), async () => Promise.reject(new DuolingoProfileError("SOURCE_UNAVAILABLE", "down")));
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count" }, down.deps);
    assert.deepEqual(outcome, { kind: "refused", giftId: "7", code: "FETCH_FAILED", message: "Duolingo could not be read just now. Try again in a minute.", looked: true });
    assert.deepEqual(down.calls, ["look"]);
  });
  await db.query("DELETE FROM viky_gifts");
  await withVersions(true, async () => {
    // A lesson is in, and a proof was taken for this gift less than four minutes ago: none is taken now, whoever asks.
    for (const pass of [undefined, "frequent", "counting"] as const) {
      await db.query("DELETE FROM viky_gifts");
      const claimed = await reading(V3, onChain(), async () => seen(1_010), false);
      assert.deepEqual(await runPublicCheckIn({ giftId: "7", purpose: "count", pass }, claimed.deps), { kind: "already", giftId: "7", reason: "read_recently" });
      assert.deepEqual(claimed.calls, ["look", `claim:7:${PROOF_EVERY_SECONDS}`]);
    }
    assert.equal(PROOF_EVERY_SECONDS, 240);
  });
  await db.query("DELETE FROM viky_gifts");
  await withVersions(true, async () => {
    // A lesson is in and the claim is given: the attested fetch is reached, and only then.
    const taken = await reading(V3, onChain(), async () => seen(1_010));
    await assert.rejects(runPublicCheckIn({ giftId: "7", purpose: "count", pass: "frequent" }, taken.deps), /the attested fetch was reached/);
    assert.deepEqual(taken.calls, ["look", `claim:7:${PROOF_EVERY_SECONDS}`, "proof"]);
  });
});

test("on the third contract a look that failed takes a reading of last resort once in a day, and only when a window closes before the next pass", async () => {
  const DOWN = async () => Promise.reject(new DuolingoProfileError("SOURCE_UNAVAILABLE", "down"));
  /** Yesterday is open and unsettled: its window closes at 06:00 UTC tomorrow. */
  const behind = () => onChain({ startDay: TODAY - 1, endDay: TODAY + 5, settledThroughDay: TODAY - 2 });
  const at = async (now: number, pass: "frequent" | "counting" | "recount" | undefined, gift = behind(), claim = true) => {
    await db.query("DELETE FROM viky_gifts");
    const read = await reading(V3, gift, DOWN, true, now, claim);
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", pass }, read.deps).then(
      (answered) => (answered.kind === "refused" ? answered.code : answered.kind),
      (error: Error) => error.message,
    );
    return { outcome, calls: read.calls };
  };
  const closes = (TODAY + 1) * DAY + 6 * 3_600;
  await withVersions(true, async () => {
    // Hours before the window closes: the next pass looks again, which costs nothing. No proof, no claim.
    assert.deepEqual(await at(NOON, "frequent"), { outcome: "FETCH_FAILED", calls: ["look"] });
    assert.deepEqual(await at(closes - 21 * 60, "frequent"), { outcome: "FETCH_FAILED", calls: ["look"] });
    // The last pass before it closes: the reading of last resort, claimed for the gift and the day.
    assert.deepEqual(await at(closes - 19 * 60, "frequent"), { outcome: "the attested fetch was reached", calls: ["look", `lastResort:7:${TODAY + 1}`, "proof"] });
    // The passes of the morning are passes too, and the same rule holds them: at 03:30 the window is hours away.
    assert.deepEqual(await at((TODAY + 1) * DAY + 3 * 3_600 + 30 * 60, "recount"), { outcome: "FETCH_FAILED", calls: ["look"] });
    assert.deepEqual(await at(closes - 10 * 60, "counting"), { outcome: "the attested fetch was reached", calls: ["look", `lastResort:7:${TODAY + 1}`, "proof"] });
    // Once for a gift in a day: already taken, it is not taken again.
    assert.deepEqual(await at(closes - 5 * 60, "frequent", behind(), false), { outcome: "FETCH_FAILED", calls: ["look", `lastResort:7:${TODAY + 1}`] });
    // A page names no pass: it never takes one, whatever is about to close. Neither does a look alone.
    assert.deepEqual(await at(closes - 5 * 60, undefined), { outcome: "FETCH_FAILED", calls: ["look"] });
    // Today alone open, with yesterday counted: its window closes the day after tomorrow, nothing is due.
    assert.deepEqual(await at(closes - 5 * 60, "frequent", onChain({ startDay: TODAY, settledThroughDay: TODAY })), { outcome: "FETCH_FAILED", calls: ["look"] });
  });
  // The rule by version, in one place: a gift read each morning has its last resort at the second reading alone.
  assert.equal(lastResortWithin(undefined, 3), null);
  assert.deepEqual((["counting", "recount", "frequent"] as const).map((pass) => lastResortWithin(pass, 3)), [1_200, 1_200, 1_200]);
  assert.deepEqual((["counting", "recount", "frequent"] as const).map((pass) => lastResortWithin(pass, 2)), [null, 72_000, null]);
  assert.deepEqual((["counting", "recount", "frequent"] as const).map((pass) => lastResortWithin(pass, 1)), [null, 72_000, null]);
});

test("which gifts are read as the day goes: on the third contract, on a source that can be looked at plainly", async () => {
  await withVersions(true, () => {
    assert.equal(readAsTheDayGoes({ giftId: "7", escrow: V3, goalType: GOAL_TYPE_DUOLINGO_XP }), true);
    assert.equal(readAsTheDayGoes({ giftId: "7", escrow: V2, goalType: GOAL_TYPE_DUOLINGO_XP }), false, "on the second, a reading never pays its own day");
    assert.equal(readAsTheDayGoes({ giftId: "7", escrow: V1, goalType: GOAL_TYPE_DUOLINGO_XP }), false);
    assert.equal(readAsTheDayGoes({ giftId: "7", escrow: null, goalType: GOAL_TYPE_DUOLINGO_XP }), false, "a record without its contract is read by nobody");
    // A connected source has no plain look: its gifts are read by the nightly pass alone, on every version.
    const route = readFileSync("src/daily-count.ts", "utf8");
    assert.match(route, /return paysTheSameDay\(versionOfGift\(record\)\) && conditionOfGoal\(record\.goalType\)\?\.nature !== "connected";/);
    assert.match(route, /if \(condition\?\.nature === "connected" && input\.lookOnly\) return \{ kind: "already", giftId: input\.giftId, reason: "read_recently" \};/);
  });
  // The count route: a look is asked with ?look=1 under the reading limit, either of the two people may ask for a
  // gift read as the day goes, and a gift that is not is read for the person it is for alone, as before.
  const count = readFileSync("app/api/gift/[id]/count/route.ts", "utf8");
  assert.match(count, /const rate = checkRateLimit\(isMilestoneGiftId\(id\) \|\| look \? "reading" : "verify", request\);/);
  assert.match(count, /const offeredIt = Boolean\(gift && live && gift\.funder\.toLowerCase\(\) === account\);/);
  assert.match(count, /if \(look && !live\) throw new GiftApiError\("NOT_READ_LIVE", /);
  assert.match(count, /readDailyGift\(live \? \{ giftId: id, purpose: "count", lookOnly: look \} : \{ giftId: id, purpose: "count", force: true \}\)/);
});

test("the pass of every quarter of an hour reads those gifts alone, one after another, and one failure is one line", async () => {
  await withVersions(true, async () => {
    const asked: string[] = [];
    const lines = await frequentDailyPass({
      gifts: async () => [
        { giftId: "5", escrow: V2, goalType: GOAL_TYPE_DUOLINGO_XP },
        { giftId: "7", escrow: V3, goalType: GOAL_TYPE_DUOLINGO_XP },
        { giftId: "8", escrow: V3, goalType: GOAL_TYPE_DUOLINGO_XP },
        { giftId: "9", escrow: V3, goalType: GOAL_TYPE_DUOLINGO_XP },
        { giftId: "1000007", escrow: V3, goalType: 1 },
      ],
      count: async (giftId) => {
        asked.push(giftId);
        if (giftId === "8") throw new Error("the endpoint did not answer");
        if (giftId === "9") return { kind: "refused", giftId, code: "NOT_ENOUGH_PROGRESS", message: "", looked: true };
        return { kind: "counted", giftId, xp: 1_010, creditedDays: 1, hash: "0xc7" };
      },
    });
    assert.deepEqual(asked, ["7", "8", "9"]);
    assert.deepEqual(lines, [
      { giftId: "7", result: "counted, 1 day(s) credited" },
      { giftId: "8", result: "failed: the endpoint did not answer" },
      { giftId: "9", result: "looked: NOT_ENOUGH_PROGRESS" },
    ]);
    // What every later relay would meet as well ends the pass.
    await assert.rejects(
      frequentDailyPass({ gifts: async () => [{ giftId: "7", escrow: V3, goalType: GOAL_TYPE_DUOLINGO_XP }], count: async () => Promise.reject(new RelayerError("RESERVE_TOO_LOW", "below the reserve")) }),
      (error: unknown) => error instanceof RelayerError && error.code === "RESERVE_TOO_LOW",
    );
  });
  // It rides the scheduler's one call, under its own guard, and asks for a look first.
  assert.equal(FREQUENT_DAILY_PASS_EVERY_SECONDS, 14 * 60);
  const route = readFileSync("app/api/cron/milestones/route.ts", "utf8");
  assert.match(route, /if \(await claimPass\("daily-gifts", FREQUENT_DAILY_PASS_EVERY_SECONDS\)\) \{/);
  assert.match(readFileSync("src/frequent-pass.ts", "utf8"), /count: \(giftId\) => readDailyGift\(\{ giftId, purpose: "count", pass: "frequent" \}\),/);
});

test("on the first two versions nothing changed: one reading a day, and a count on demand still reads", async () => {
  await withVersions(true, async () => {
    // A gift on the second version, connected the day before: its first day is today, and no reading pays it today.
    const second = await reading(V2, onChain({ version: 2, startDay: TODAY, settledThroughDay: TODAY - 1 }), async () => seen(5_000));
    const outcome = await runPublicCheckIn({ giftId: "7", purpose: "count", force: true }, second.deps);
    assert.equal(outcome.kind === "refused" && outcome.code, "NOT_STARTED", "the contract's own OutsideWindow, foreseen");
    assert.deepEqual(second.calls, [], "the day itself is never open to a reading on the second version");
  });
  const checkIn = readFileSync("src/duolingo-public-checkin.ts", "utf8");
  assert.match(checkIn, /if \(purpose === "count" && !input\.force && !paysTheSameDay\(onChain\.version\) && \(await countedToday\(giftId, now\)\)\) return \{ kind: "already", giftId, reason: "counted_today" \};/);
});

test("a day counted the day it was done is told as today's, to each of the two", () => {
  const BOTH = { recipientName: "Léa", funderName: "Mom" };
  assert.equal(morningSentence("recipient", { kind: "day", outcome: "earned", amount: "$2.40", today: true }, BOTH), "Today counted. $2.40 is yours.");
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$2.40", today: true }, BOTH, { yesterday: "yesterday's lesson", today: "today's lesson" }), "Léa did today's lesson. $2.40 is theirs.");
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$2.40", today: true }, BOTH), "Léa counted today. $2.40 is theirs.");
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$2.40", today: true }, { recipientName: null, funderName: null }), "Today counted. $2.40 is theirs.");
  // A day counted the morning after says what it always said.
  assert.equal(morningSentence("recipient", { kind: "day", outcome: "earned", amount: "$2.40" }, BOTH), "Yesterday counted. $2.40 is yours.");
  // The sending says "today" only of a day earned on the day of the telling.
  const send = readFileSync("src/morning-send.ts", "utf8");
  assert.match(send, /const today = last\.outcome === "earned" && last\.day === Math\.floor\(nowMs \/ 86_400_000\);/);
});
