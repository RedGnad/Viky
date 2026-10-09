import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changeBackAmount, heldForWithdrawal } from "../src/exit-steps";
import { CONVERSION_RESERVE, USDC_ARRIVAL_FLOOR } from "../src/funding-step";
import { CASH_OUT } from "../src/sentences";

/**
 * A withdrawal started and left (the audit of 9 Oct 2026, F17).
 *
 * A withdrawal is open for as long as no send of its coin is written after it, with no length of time. Somebody the
 * payout service refused, or who changed their mind, read "$20.00 of it is ready to send to Ramp." at every visit,
 * with every other use of the screen closed to that money and nothing that changed it back. "Use it another way"
 * does, by the step a card's delivery of the same coin is already changed by.
 */
const ONE = 1_000_000_000_000_000_000n;
const screen = readFileSync("app/components/CashOut.tsx", "utf8");

test("what can be changed back is what the step for that coin takes, and nothing under it", () => {
  // The other dollar coin: all of it, from the dollar the step takes.
  assert.equal(changeBackAmount(false, 9_990_000n), 9_990_000n);
  assert.equal(changeBackAmount(false, USDC_ARRIVAL_FLOOR), USDC_ARRIVAL_FLOOR);
  assert.equal(changeBackAmount(false, USDC_ARRIVAL_FLOOR - 1n), 0n);
  assert.equal(changeBackAmount(false, 0n), 0n);
  // The chain's own coin: everything above what the account keeps to be able to send.
  assert.equal(changeBackAmount(true, CONVERSION_RESERVE + 138n * ONE), 138n * ONE);
  assert.equal(changeBackAmount(true, CONVERSION_RESERVE), 0n);
  assert.equal(changeBackAmount(true, 0n), 0n);
});

test("once it is changed back the account no longer holds what the way out brought, so nothing is said to be ready", () => {
  const open = { coin: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", atLeast: 9_990_000n };
  assert.equal(heldForWithdrawal(open, open.coin, 9_990_000n), true);
  assert.equal(heldForWithdrawal(open, open.coin, 9_990_000n - changeBackAmount(false, 9_990_000n)), false);
});

test("the press changes it back by the steps a card's delivery takes, reads the balances again, and opens nothing", () => {
  const action = screen.slice(screen.indexOf("const putBack = async (way: WayOut) => {"), screen.indexOf("const start = async (way: WayOut) => {"));
  assert.ok(action.length > 0);
  assert.match(action, /const amount = backOf\(way\);\s+if \(amount === 0n\) return;/);
  assert.match(action, /const account = await ensureSigner\(\);/, "the passkey is asked at the press");
  assert.match(action, /const conversion = await fundingQuote\(amount\);\s+await sendWithExplicitGas\(account, \{ to: conversion\.to, data: conversion\.data, value: BigInt\(conversion\.value\) \}\);/);
  assert.match(action, /await changeArrivedUsdc\(\{ account, amount \}\);/);
  assert.match(action, /await refresh\(\);/);
  // Whatever happened, the first screen, never a step of a way out.
  assert.match(action, /\} finally \{\s+setStage\("base"\);\s+setPuttingBack\(false\);\s+setBusy\(false\);\s+\}/);
  assert.doesNotMatch(action, /setChosen\(|setStage\("(amount|ready|review)"\)/);
  assert.match(action, /setProblem\(\{ where: "gather", text: W\.notPutBack,/);
  // It is offered for the money of a withdrawal that is open, and only where the step that changes it exists.
  const offered = screen.slice(screen.indexOf("const backOf = (way: WayOut): bigint => {"), screen.indexOf("// Named without \"use\""));
  assert.match(offered, /if \(!saidReady\(way\) \|\| \(!isNative\(coin\) && !usdcRouterAddress\(\)\)\) return 0n;\s+return changeBackAmount\(isNative\(coin\), held\(coin\)\);/);
});

test("it stands beside the way back on both first screens, small, and says what it does", () => {
  assert.equal(CASH_OUT.useAnotherWay, "Use it another way");
  assert.equal(CASH_OUT.puttingBack, "Putting it back in your balance, a few seconds.");
  assert.equal(CASH_OUT.notPutBack, "It could not be put back just now. It is still in your account.");
  assert.equal(screen.match(/data-use-another-way=""/g)?.length, 2, "where the ready amount leads, and under 'Yours'");
  for (const button of screen.matchAll(/<button type="button" onClick=\{\(\) => void putBack\(firstReady\)\} disabled=\{busy\} className=\{([^}]+)\} data-use-another-way="">/g)) {
    assert.match(button[1], /SMALL_BUTTON/, "never the screen's one action");
  }
  assert.match(screen, /<Working says=\{puttingBack \? W\.puttingBack : inGifts\.length > 0 \? W\.gathering : W\.readying\} \/>/);
  // A failure is said where the press was, on the card that leads as under "Yours".
  assert.match(screen, /\{stage === "base" \? alert\("gather"\) : null\}\s+<\/section>\s+\);/);
});
