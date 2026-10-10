import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONVERSION_RESERVE, nextFundingStep, pausedAfterFailure, POLL_MS, RETRY_PAUSE_MS } from "../src/funding-step";

/**
 * The waiting screen's cadence when the conversion keeps failing (the audit of 1 Oct 2026, finding F-20).
 *
 * The screen's watch depends on its phase, and a failed conversion puts the phase back to waiting: the watch starts
 * again at once, looks at once, and found the same payment to convert. Measured on a local build with the price not
 * answering: 596 to 717 requests in twelve seconds. The pause is in the decision, so it is tested here as the screen
 * runs it: a look at once whenever the phase comes back to waiting, and a look every `POLL_MS` after that.
 */

const WANTED = 30_000_000n;
const ARRIVED = CONVERSION_RESERVE + 40_000_000_000_000_000_000n;
/** How long a conversion that fails takes to fail, as measured locally: about twenty milliseconds. */
const FAILS_AFTER_MS = 20;

/** The conversions tried in a window, every one failing. `paused` false is the screen as it was. */
function conversionsTried(windowMs: number, paused: boolean): number[] {
  const tried: number[] = [];
  let failedAtMs: number | null = null;
  let lookAt = 0;
  while (lookAt < windowMs) {
    const step = nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: paused ? failedAtMs : null, nowMs: lookAt });
    if (step.do === "convert") {
      tried.push(lookAt);
      failedAtMs = lookAt + FAILS_AFTER_MS;
      // The phase came back to waiting: the watch starts again and looks at once.
      lookAt = failedAtMs;
    } else {
      // Nothing to do at this look: the next one is the watch's own, a whole interval later.
      lookAt += POLL_MS;
    }
  }
  return tried;
}

test("a conversion that keeps failing is tried once a look, not hundreds of times", () => {
  assert.ok(RETRY_PAUSE_MS < POLL_MS, "the pause is shorter than a look, so the look after a failure does try");
  const before = conversionsTried(12_000, false);
  assert.ok(before.length >= 500, `without the pause the screen tried ${before.length} times in twelve seconds`);
  const now = conversionsTried(12_000, true);
  assert.deepEqual(now, [0, POLL_MS + FAILS_AFTER_MS], "once on arriving, once a look later, and nothing between");
  // Over a minute: one try a look, each a whole pause after the failure before it.
  const minute = conversionsTried(60_000, true);
  assert.ok(minute.length <= Math.ceil(60_000 / POLL_MS), `${minute.length} tries in a minute`);
  for (let index = 1; index < minute.length; index += 1) assert.ok(minute[index] - minute[index - 1] >= RETRY_PAUSE_MS);
});

test("the pause holds a conversion only, only after a failure, and only for its length", () => {
  assert.equal(pausedAfterFailure(null, 5_000), false, "never failed, never paused");
  assert.equal(pausedAfterFailure(1_000, 1_000), true);
  assert.equal(pausedAfterFailure(1_000, 1_000 + RETRY_PAUSE_MS - 1), true);
  assert.equal(pausedAfterFailure(1_000, 1_000 + RETRY_PAUSE_MS), false, "the pause is over, the next look converts");
  // A clock that went backwards holds nothing for ever.
  assert.equal(pausedAfterFailure(10_000, 1_000), false);
  // What the person is told while it is held is that something arrived, and nothing is done.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 2_000 }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 1_000 + RETRY_PAUSE_MS }), { do: "convert", amount: ARRIVED - CONVERSION_RESERVE });
  // A gift that can be made is made, pause or not: the pause is about converting.
  assert.deepEqual(nextFundingStep({ held: WANTED, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 1_001 }), { do: "give" });
  // With nothing said about a failure, the decision is what it always was.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED }), { do: "convert", amount: ARRIVED - CONVERSION_RESERVE });
});

test("the screen keeps the time of the failure, and its watch still depends on the phase", () => {
  const screen = readFileSync("app/components/PayGift.tsx", "utf8");
  const watch = screen.slice(screen.indexOf("// While paying: watch the account"), screen.indexOf("const copy = "));
  assert.match(watch, /nextFundingStep\(\{ held: read\.held, arriving: read\.arriving, arrivingUsdc: read\.usdc, inGifts, wanted, failedAtMs: failedAtMs\.current, nowMs: Date\.now\(\) \}\)/);
  const failure = watch.slice(watch.indexOf("await fundingQuote(next.amount)"), watch.lastIndexOf("const after = await readAusdBalance"));
  assert.ok(watch.includes("await fundingQuote(next.amount)"), "the conversion is asked through the check that holds it to the amount and the exchange");
  // Since 5 Oct 2026 the screen stays on the change after a failure: the payment arrived, and the screen that waits
  // for one put its pay button back in front of somebody who had paid. The time is still what keeps the next look,
  // and every look inside the pause, from converting again; the watch goes on by its interval.
  assert.ok(failure.includes("failedAtMs.current = Date.now()"), "the time of the failure is kept");
  assert.doesNotMatch(failure, /setPhase\("waiting"\)/, "the screen does not go back to the one that offers to pay");
  assert.match(failure, /setAsksAgain\(after\.keep \? after\.says : W\.arrived\.priceMoved\);/, "what is known is said under the ring");
  assert.match(watch, /\}, \[step, address, units, phase, refresh, give, termsOf, ensureSigner, earned\]\);/, "the phase stays among what the watch depends on");
  assert.match(watch, /setInterval\(\(\) => void look\(\), POLL_MS\)/);
});

test("the person's own money first: what their gifts hold is taken before a card is waited for, and before anything is changed", () => {
  // The account alone is enough: the gift is made, and the gifts are left alone.
  assert.deepEqual(nextFundingStep({ held: WANTED, arriving: 0n, wanted: WANTED, inGifts: 5_000_000n }), { do: "give" });
  // Short, and the gifts hold something for the person: all of it is taken first, whether or not it is enough.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted: WANTED, inGifts: WANTED }), { do: "takeFromGifts" });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted: WANTED, inGifts: 1n }), { do: "takeFromGifts" });
  // Before what a card delivered is changed: it is what a gift holds already, and nothing of it is lost to a price.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, arrivingUsdc: 9_000_000n, wanted: WANTED, inGifts: 5_000_000n }), { do: "takeFromGifts" });
  // Nothing in the gifts, or not read: the decision is what it always was.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted: WANTED, inGifts: 0n }), { do: "wait", sawSomething: false });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED }), { do: "convert", amount: ARRIVED - CONVERSION_RESERVE });
});

test("paying a gift counts what the person's gifts hold for them, and takes it by the way out's own gesture", () => {
  // One gesture, written once: the whole of each gift's part, one signature per gift.
  const client = readFileSync("src/client/gift.ts", "utf8");
  assert.match(client, /export async function takeFromGifts\(account: LocalAccount, gifts: readonly EarnedInGift\[\]\): Promise<void> \{\n\s*for \(const gift of gifts\) \{\n\s*await withdrawEarned\(\{ account, giftId: gift\.giftId, escrow: gift\.escrow, amount: BigInt\(gift\.earned\), nonce: BigInt\(gift\.nonce\) \}\);/);
  assert.match(readFileSync("app/components/CashOut.tsx", "utf8"), /await takeFromGifts\(account, inGifts\);/);

  // The pay sheet: "From your Viky money" is the account and the gifts' part, read with the list it already reads.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  // Since 5 Oct 2026 the sheet reads all of it in one reading (src/client/pay-held.ts), and counts it as Home does
  // (src/pay-held.ts): what the gifts hold is added to what a gift holds before the cut to the cent.
  assert.match(readFileSync("src/client/pay-held.ts", "utf8"), /const inGifts = mine\.gifts\.reduce\(\(sum, gift\) => sum \+ BigInt\(gift\.takeable \?\? "0"\), 0n\);/);
  assert.match(readFileSync("src/pay-held.ts", "utf8"), /dollarsToTheCent\(parts\.ausd \+ parts\.inGifts, parts\.usdc\)/);
  assert.match(sheet, /const inAccount = heldForTheLines\(Boolean\(address\), held\);/);
  assert.match(sheet, /judgeLineIsTrue\(\{ gift: units, held: held\.state === "read" \? held\.parts\.ausd : null, untouchedCredit \}\)/, "the judge credit line is still about the account alone");

  // The screen that makes the gift: read once, taken once, and a refusal is said and not tried again by itself.
  const screen = readFileSync("app/components/PayGift.tsx", "utf8");
  const watch = screen.slice(screen.indexOf("// While paying: watch the account"), screen.indexOf("const copy = "));
  const taking = watch.slice(watch.indexOf('if (next.do === "takeFromGifts")'), watch.indexOf("// The money is in the account: the frame it was paid in closes"));
  assert.ok(taking.length > 0 && watch.indexOf('if (next.do === "takeFromGifts")') < watch.indexOf('if (next.do !== "wait")'), "taken before the frame a card is paid in is closed: it is not a payment arriving");
  assert.doesNotMatch(taking, /setFrame|clearRampnowPending/, "the frame and the payment waited for at Rampnow are left as they are");
  assert.match(taking, /if \(read\.held \+ inGifts >= wanted\) setPhase\("taking"\);/, "the whole screen says it only when it is all the gift needs");
  assert.match(taking, /await takeFromGifts\(account, earned \?\? \[\]\);/);
  assert.match(taking, /\} catch \{[\s\S]*?setEarned\(\[\]\);\n\s*setProblem\(C\.gatherFailed\);/, "refused: said, and no longer counted on this visit");
  assert.match(taking, /setPhase\(after >= wanted \? "giving" : "waiting"\);/);
  assert.match(screen, /const leftToPay = units === null \|\| balance === null \? 0n : phase === "short" \? units - balance : earned === null \? 0n : units - balance - totalEarned\(earned\);/, "the card is asked for the gift less everything the person pays with");
  assert.match(screen, /const ruleEuros = cardShort > 0n \? eurosToBuyOn\(cardShort, wayIn, money\.rates\?\.usdPerEur, askMoney\) : undefined;/);
  assert.match(screen, /const toBuy = balance === null \|\| earned === null \? undefined : ruleEuros;/);
  assert.match(screen, /<Working says=\{phase === "taking" \? C\.gathering : /);

  // Sending to another account opens through the same taking as every other use.
  const out = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(out, /const startOwn = async \(\) => \{\n\s*const now = await gather\(\);\n\s*if \(!now\) return;/);
  assert.match(out, /onClick=\{\(\) => void startOwn\(\)\} disabled=\{holdings === null \|\| dollarsHeld === 0n \|\| busy\}/);
});
