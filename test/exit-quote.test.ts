import assert from "node:assert/strict";
import test from "node:test";
import { floorForTerms } from "../src/exit-quote.js";
import type { SwapQuote } from "../src/kuru.js";

/**
 * The non-regression tests for D81, built on the shape that was **measured** rather than the one I first
 * assumed.
 *
 * The failure was not two quotes announcing different numbers. Over sixteen quotes the minimum engraved in the
 * bytes equals the minimum announced beside them, every time, and in the attempt that failed both were
 * 9,998,810. What differed was the route: the one inside those bytes could deliver only 9,968,242. No
 * comparison of the two numbers can see that, which is why the check I wrote here first could not fail and has
 * been deleted rather than kept as reassurance.
 *
 * So what is tested here is what can actually be decided at this step, and the rest is tested as a retry.
 */

const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb" as const;

/**
 * A payload shaped like the real one. `route` changes the bytes without changing either number, which is
 * exactly the difference that mattered and exactly the one no arithmetic here can detect.
 */
function payload(engraved: bigint, route: string): `0x${string}` {
  const words = [
    (10_000_000n).toString(16).padStart(64, "0"),
    engraved.toString(16).padStart(64, "0"),
    ...Array.from({ length: 6 }, (_, i) => `${route}${i}`.padStart(64, "0")),
  ];
  return `0xce1e7030${words.join("")}` as `0x${string}`;
}

function quote(minOut: bigint, data: `0x${string}`): SwapQuote {
  // The engraved minimum sits 0.040 % under the output, which is what this exchange does at quote time.
  return { output: ((minOut * 100_040n) / 100_000n).toString(), minOut: minOut.toString(), to: EXCHANGE, data, value: "0" };
}

/**
 * The exact shape of the failure: both numbers equal, and the route behind them unable to fill. Nothing at this
 * step can tell the good payload from the bad one, and the test says so out loud so nobody adds a check here
 * believing it covers this.
 */
test("the failing shape is indistinguishable here, which is why the retry exists", () => {
  const engraved = 9_998_810n;
  const fillable = quote(engraved, payload(engraved, "aa"));
  // The same numbers, a different route, and that route can only deliver 9,968,242 on chain.
  const doomed = quote(engraved, payload(engraved, "bb"));

  assert.equal(floorForTerms(fillable, engraved), engraved);
  assert.equal(floorForTerms(doomed, engraved), engraved, "it passes, and it must: the difference is unreadable here");
  assert.notEqual(fillable.data, doomed.data, "the bytes differ, and only the chain can tell which one fills");
});

test("the floor bound is the one from the quote whose bytes will be relayed", () => {
  const relayed = quote(9_995_060n, payload(9_995_060n, "aa"));
  // What the person saw earlier does not become the floor. Binding one quote's figure to another quote's bytes
  // is the fault this removes.
  assert.equal(floorForTerms(relayed, 9_990_000n), 9_995_060n);
  assert.notEqual(floorForTerms(relayed, 9_990_000n), 9_990_000n);
});

test("a quote worse than what they were shown is refused, not quietly bound", () => {
  const worse = quote(9_990_000n, payload(9_990_000n, "aa"));
  assert.throws(() => floorForTerms(worse, 9_995_060n), (error: Error) => /rate moved/i.test(error.message));
  // Exactly what they saw is enough: they were promised at least that, not more than that.
  const exact = quote(9_995_060n, payload(9_995_060n, "aa"));
  assert.equal(floorForTerms(exact, 9_995_060n), 9_995_060n);
});

/**
 * The protection that was deleted, asserted absent. It compared the announced minimum with the engraved one,
 * which are always equal, so it could not fail. A check that cannot fail is worse than none, because it reads
 * as cover.
 */
test("no check remains that compares the announced minimum with the engraved one", async () => {
  const exported = await import("../src/exit-quote.js");
  for (const gone of ["embeddedMinimum", "KURU_SWAP_SELECTOR"]) {
    assert.equal(gone in exported, false, `${gone} must not come back: over sixteen quotes those numbers never differ`);
  }
});
