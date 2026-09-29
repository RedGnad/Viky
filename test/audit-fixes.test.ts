import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { takeTheWayOut } from "../src/client/exit";
import { ApiError } from "../src/client/api";
import { GiftApiError, refundDestination } from "../src/gift-api";
import { drainExpiredDays, expiredDayOpen, type OpenDays } from "../src/gift-relay";
import { RelayerError } from "../src/relayer";
import { EARLIER_GIFT_ESCROW, EXIT_ROUTER, GIFT_ESCROW, isVikyContract, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * Five short corrections from the audit of 29 Sep 2026: an expired day drained before any check-in, the refund sent to
 * the funder alone, no sending to Viky's own contracts, a start above the cap not recorded (test/milestone-reading.test.ts),
 * and the way out signed for the router the code knows.
 */

const OPEN: OpenDays = { startDay: 20_000, endDay: 20_006, settledThroughDay: 20_002, cancelled: false, finalised: false, lastDrainableDay: 20_002 };

test("a day whose catch-up window is over, still open, is what must be drained first", () => {
  assert.equal(expiredDayOpen(OPEN), false, "everything up to the last drainable day is settled");
  assert.equal(expiredDayOpen({ ...OPEN, lastDrainableDay: 20_003 }), true);
  assert.equal(expiredDayOpen({ ...OPEN, lastDrainableDay: 20_009, settledThroughDay: 20_006 }), false, "past its last day, nothing is left open");
  assert.equal(expiredDayOpen({ ...OPEN, startDay: 0, settledThroughDay: 0, lastDrainableDay: 20_003 }), false, "before its first reading there is no day");
  assert.equal(expiredDayOpen({ ...OPEN, lastDrainableDay: 20_003, finalised: true }), false);
  assert.equal(expiredDayOpen({ ...OPEN, lastDrainableDay: 20_003, cancelled: true }), false);
});

test("the drain runs before the check-in only when a day has expired, and a drain that fails stops the check-in", async () => {
  const drained: string[] = [];
  const deps = (days: OpenDays, drain: () => Promise<unknown> = async () => drained.push("drain")) => ({ read: async () => days, drain });
  assert.equal(await drainExpiredDays("7", GIFT_ESCROW, deps(OPEN)), false);
  assert.deepEqual(drained, []);
  assert.equal(await drainExpiredDays("7", GIFT_ESCROW, deps({ ...OPEN, lastDrainableDay: 20_004 })), true);
  assert.deepEqual(drained, ["drain"]);
  // Drained by the settling pass in between: nothing left to do, and the check-in may go.
  const raced = deps({ ...OPEN, lastDrainableDay: 20_004 }, async () => {
    throw new RelayerError("REVERTED", "reverted", "NothingToDrain");
  });
  assert.equal(await drainExpiredDays("7", GIFT_ESCROW, raced), false);
  const down = deps({ ...OPEN, lastDrainableDay: 20_004 }, async () => {
    throw new RelayerError("RESERVE_TOO_LOW", "the relayer is low");
  });
  await assert.rejects(drainExpiredDays("7", GIFT_ESCROW, down), RelayerError);
  // Every relayed check-in goes through it, and the verify route drains before it signs.
  assert.match(readFileSync("src/gift-relay.ts", "utf8"), /await drainExpiredDays\(giftId, escrow\);\n\s*const attestation = \{/);
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /drainExpired: async \(giftId\) => \{\n\s*await drainExpiredDays\(giftId, giftEscrow\);/);
});

test("unearned money goes back to the account that offers the gift, and a request naming another is refused", () => {
  const funder = "0x00000000000000000000000000000000000A11cE";
  assert.equal(refundDestination(undefined, funder), funder);
  assert.equal(refundDestination("", funder), funder);
  assert.equal(refundDestination(funder.toLowerCase(), funder), funder);
  assert.throws(() => refundDestination("0x000000000000000000000000000000000000b0b0", funder), (error) => error instanceof GiftApiError && error.code === "INVALID_REFUND");
  assert.throws(() => refundDestination(42, funder), (error) => error instanceof GiftApiError && error.code === "INVALID_REFUND");
  for (const route of ["app/api/gift/create/route.ts", "app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts"]) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /const refundTo = refundDestination\(body\.refundTo, auth\.account\);/, route);
    assert.doesNotMatch(source, /refundToRaw/, route);
  }
});

test("Viky's own contracts are refused as a destination, in the app and on the server", () => {
  for (const contract of [GIFT_ESCROW, EARLIER_GIFT_ESCROW, MILESTONE_GIFT, EXIT_ROUTER]) {
    assert.equal(isVikyContract(contract), true, contract);
    assert.equal(isVikyContract(contract.toLowerCase()), true, contract);
  }
  assert.equal(isVikyContract("0x00000000000000000000000000000000000A11cE"), false);
  assert.match(readFileSync("app/api/send/route.ts", "utf8"), /if \(isVikyContract\(to\)\) throw new GiftApiError\("VIKY_DESTINATION"/);
  const cashOut = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(cashOut, /if \(isVikyContract\(typed\)\) return W\.codeRefusals\.viky\(chosen\.name\);/);
  assert.match(cashOut, /if \(isVikyContract\(typed\)\) return W\.own\.refusals\.viky;/);
});

test("the way out is signed for the router this code knows, and an answer naming another is refused unsigned", async () => {
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  let signed = 0;
  const signTypedData = account.signTypedData.bind(account);
  const signer: typeof account = { ...account, signTypedData: ((input) => ((signed += 1), signTypedData(input))) as typeof account.signTypedData };
  const posted: Array<{ url: string; body: Record<string, unknown> }> = [];
  const answer = (to: string) => async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    posted.push({ url: path, body: JSON.parse(String(init?.body ?? "{}")) });
    const body = path.endsWith("/prepare")
      ? { id: "exit-1", signed: false, shown: "9.99", authorization: { to, value: "10000000", validAfter: "0", validBefore: "1900000000", nonce: `0x${"ab".repeat(32)}` } }
      : { paid: true, hash: `0x${"cd".repeat(32)}` };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  const real = globalThis.fetch;
  try {
    globalThis.fetch = answer("0x000000000000000000000000000000000000dEaD") as typeof fetch;
    await assert.rejects(takeTheWayOut({ account: signer, ticket: "t" }), (error) => error instanceof ApiError && error.code === "EXIT_ELSEWHERE");
    assert.equal(signed, 0, "nothing is signed for another address");
    assert.equal(posted.some((post) => post.url.endsWith("/relay")), false, "and nothing is relayed");

    globalThis.fetch = answer(EXIT_ROUTER.toLowerCase()) as typeof fetch;
    const result = await takeTheWayOut({ account: signer, ticket: "t" });
    assert.equal(result.paid, true);
    assert.equal(signed, 1);
  } finally {
    globalThis.fetch = real;
  }
  assert.match(readFileSync("src/client/exit.ts", "utf8"), /to: EXIT_ROUTER,/);
});
