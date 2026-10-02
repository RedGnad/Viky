import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { assertReadingInProportion, brokenBaselineAlert, outOfProportion, ReadingOutOfProportion, READING_JUMP_FACTOR, tellOfARefusedBaseline } from "../src/reading-proportion";

/**
 * A reading far out of proportion with a gift's daily target is not attested, and a real reading refused as below the
 * baseline is told to the operator (the review of 2 Oct 2026, R-15, second scenario): one reading with an absurd
 * figure sets a daily gift's baseline to it, and nothing counts after. For gifts of the second version only.
 */
const SECOND = "0x1111111111111111111111111111111111111111" as Hex;
const FIRST = "0x2222222222222222222222222222222222222222" as Hex;
process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS = SECOND;
process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS = "0x3333333333333333333333333333333333333333";
process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS = "0x4444444444444444444444444444444444444444";

const DAY = 86_400;
const LAST = Date.UTC(2026, 9, 5, 0, 30, 0) / 1_000;
/** A gift under way: twenty points a day, last read at 00:30 with a baseline of 1,000. */
const gift = { startDay: 20_731, baselineValue: 1_000n, lastCheckInAt: LAST, dailyTarget: 20 };
const at = (seconds: number, metricValue: bigint) => ({ giftId: 7n, metricValue, observedAt: BigInt(seconds) });

test("a day's rise is believed up to ten thousand times the target, to the unit, and a first reading is never judged", () => {
  assert.equal(READING_JUMP_FACTOR, 10_000);
  const nextMorning = LAST + DAY;
  // A heavy day, a hundred times the target: believed.
  assert.equal(outOfProportion(gift, at(nextMorning, 3_000n)), null);
  // The most that is believed for one day, and one more.
  assert.equal(outOfProportion(gift, at(nextMorning, 1_000n + 200_000n)), null);
  assert.deepEqual(outOfProportion(gift, at(nextMorning, 1_000n + 200_001n)), { jump: 200_001n, most: 200_000n, days: 1 });
  // The figure the review's scenario sends.
  assert.deepEqual(outOfProportion(gift, at(nextMorning, 2n ** 64n - 1n))?.most, 200_000n);
  // Each day that passed since the last reading the contract took allows as much again: a day begun counts whole.
  assert.equal(outOfProportion(gift, at(LAST + DAY + 1, 1_000n + 400_000n)), null);
  assert.deepEqual(outOfProportion(gift, at(LAST + 9 * DAY, 1_000n + 1_800_001n)), { jump: 1_800_001n, most: 1_800_000n, days: 9 });
  // Read again the same hour: one day's worth, never none.
  assert.equal(outOfProportion(gift, at(LAST + 60, 1_000n + 200_000n)), null);
  // A first reading has nothing to be compared with, whatever it says.
  assert.equal(outOfProportion({ ...gift, startDay: 0, baselineValue: 0n, lastCheckInAt: 0 }, at(nextMorning, 2n ** 64n - 1n)), null);
  // At or below the baseline is the contract's own refusal to give, not this one's.
  assert.equal(outOfProportion(gift, at(nextMorning, 1_000n)), null);
  assert.equal(outOfProportion(gift, at(nextMorning, 10n)), null);
});

test("on the second version an absurd figure is refused before anything is signed, and the operator is told once", async () => {
  const told: Array<{ subject: string; text: string }> = [];
  const alert = async (one: { subject: string; text: string }) => {
    told.push(one);
    return "sent" as const;
  };
  const absurd = at(LAST + DAY, 5_000_000_000n);
  const refused = await assertReadingInProportion(SECOND, gift, absurd, alert).then(() => null, (error: unknown) => error);
  assert.ok(refused instanceof ReadingOutOfProportion);
  assert.equal(refused.code, "READING_OUT_OF_PROPORTION");
  assert.equal(refused.message, "Viky read a figure that cannot be right and did not count it. Nothing was changed.");
  assert.equal(refused.giftId, "7");
  assert.equal(told.length, 1);
  assert.equal(told[0].subject, "Gift 7: a reading out of all proportion was not attested");
  assert.match(told[0].text, /The source answered 5000000000 for gift 7\. The contract's baseline is 1000, and its daily target is 20\./);
  assert.match(told[0].text, /a rise of 4999999000 in 1 day\(s\), and the most this server attests is 200000 \(10000 times the target a day\)/);
  // A real reading goes on to the signature, and nobody is told anything.
  await assertReadingInProportion(SECOND, gift, at(LAST + DAY, 1_060n), alert);
  assert.equal(told.length, 1);
  // An alert that could not leave never turns the refusal into another failure.
  const silent = await assertReadingInProportion(SECOND, gift, absurd, async () => Promise.reject(new Error("no mail"))).then(() => null, (error: unknown) => error);
  assert.ok(silent instanceof ReadingOutOfProportion);
});

test("a gift of the first version is read as it always was", async () => {
  const told: unknown[] = [];
  const alert = async (one: unknown) => {
    told.push(one);
    return "sent" as const;
  };
  await assertReadingInProportion(FIRST, gift, at(LAST + DAY, 5_000_000_000n), alert);
  await tellOfARefusedBaseline(FIRST, "7", 1_000n, 10n, alert);
  assert.deepEqual(told, []);
});

test("a real reading refused as below the baseline is told, with what it can mean and what is left to do", async () => {
  const told: Array<{ subject: string; text: string }> = [];
  await tellOfARefusedBaseline(SECOND, "7", 18_446_744_073_709_551_615n, 1_520n, async (one) => {
    told.push(one);
    return "sent";
  });
  assert.deepEqual(told, [brokenBaselineAlert("7", 18_446_744_073_709_551_615n, 1_520n)]);
  assert.equal(told[0].subject, "Gift 7: a reading was refused for being below the gift's baseline");
  assert.match(told[0].text, /The contract refused a reading of 1520 for gift 7: its baseline is 18446744073709551615 \(MetricDecreased\)\./);
  assert.match(told[0].text, /nothing in the contract resets a baseline, and a new signer does not either/);
  assert.match(told[0].text, /the person the gift is for can end it and keep what was counted, and the rest goes back to the funder at once/);
  // Never thrown: the refusal the person reads is the contract's own.
  await tellOfARefusedBaseline(SECOND, "7", 2n, 1n, async () => Promise.reject(new Error("no mail")));
});

test("every signature of a daily reading is preceded by the guard, and the relay tells of a refused baseline", () => {
  // The three places a daily reading is signed, and no fourth.
  const signedIn = ["src/duolingo-public-checkin.ts", "src/connected-checkin.ts", "app/api/proof/verify/route.ts"];
  for (const file of signedIn) {
    const source = readFileSync(file, "utf8");
    const guard = source.indexOf("await assertReadingInProportion(");
    const signature = source.search(/(await |return )signCheckIn\(message, (escrow|giftEscrow)\)/);
    assert.ok(guard > 0 && signature > guard, `${file}: the guard comes before the signature`);
    assert.equal(source.match(/signCheckIn\(message, (escrow|giftEscrow)\)/g)?.length, 1, `${file}: one signature`);
  }
  // The gift it is judged against is the contract's own, read for this reading.
  assert.match(readFileSync("src/duolingo-public-checkin.ts", "utf8"), /await assertReadingInProportion\(escrow, onChain, message\);/);
  assert.match(readFileSync("src/connected-checkin.ts", "utf8"), /await assertReadingInProportion\(escrow, onChain, message\);/);
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /await assertReadingInProportion\(giftEscrow, await readGift\(giftEscrow, message\.giftId\.toString\(\)\), message\);/);
  // A typed refusal on each road: an outcome the pass writes down, and a 409 for a shown proof.
  for (const file of signedIn.slice(0, 2)) assert.match(readFileSync(file, "utf8"), /if \(error instanceof ReadingOutOfProportion\) return refusal\(giftId, error\.code, error\.message\);/);
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /if \(error instanceof ReadingOutOfProportion\) return NextResponse\.json\(\{ error: error\.message, code: error\.code \}, \{ status: 409/);
  // The relay: a reading the contract refuses as below the baseline is told, and the refusal goes on as it was.
  const relay = readFileSync("src/gift-relay.ts", "utf8");
  assert.match(relay, /if \(second && error instanceof RelayerError && error\.contractError === "MetricDecreased"\) await tellOfARefusedBaseline\(escrow, giftId, second\.baselineValue, attestation\.metricValue\);\n\s*throw error;/);
});
