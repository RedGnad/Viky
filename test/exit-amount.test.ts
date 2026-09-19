import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { exitAmount } from "../src/exit-amount.js";
import { CASH_OUT } from "../src/sentences.js";

/**
 * What the way out names, and in what order (D104). The founder's rule, 18 Sep 2026: a person never reads a bare
 * number, and never the name of a chain's own coin. So dollars lead every sentence they decide on, and the exact
 * quantity a payout service asks for is said under the action, never in place of the money.
 *
 * The defect behind it: "Send 9.99 to Ramp. This cannot be undone." and "Sent 9.99 to Ramp on 18 Sep 2026" on the
 * screen whose own heading said $10.99. The trap in fixing it: the card service buys the chain's own coin, so the
 * same "$" put in front of that rail's number would have claimed $138.43 for something worth about $3.24.
 */

test("the bank rail's number is dollars, so it is written as dollars and asks for nothing else", () => {
  const amount = exitAmount({ number: "9.99", native: false });
  assert.equal(amount.lead, "$9.99");
  assert.equal(amount.exact, undefined, "there is no other quantity to say: the number is the money");
  assert.equal(amount.converted, false);
  assert.equal(amount.unpriced, false);
});

test("the card rail leads with the money and keeps the quantity beside it", () => {
  // 138.43 of the chain's own coin, worth about $3.24 at the price that answered.
  const amount = exitAmount({ number: "138.43", native: true, worth: 3_240_000n });
  assert.equal(amount.lead, "about $3.24", "the money a person decides on, and 'about' because it was converted");
  assert.equal(amount.exact, "138.43", "what the service asks for is never dropped");
  assert.equal(amount.converted, true);
  assert.doesNotMatch(amount.lead, /138/, "the quantity must never be read as dollars");
});

test("with no price, no dollar figure is invented", () => {
  const amount = exitAmount({ number: "138.43", native: true });
  assert.equal(amount.lead, "138.43");
  assert.equal(amount.exact, "138.43");
  assert.equal(amount.unpriced, true, "the screen says the value will come, rather than naming one");
  assert.doesNotMatch(amount.lead, /\$/, "a dollar sign here would be a figure nobody read");
});

test("every sentence of the way out prints the amount it is given, and adds no symbol of its own", () => {
  const bank = exitAmount({ number: "9.99", native: false }).lead;
  const card = exitAmount({ number: "138.43", native: true, worth: 3_240_000n }).lead;
  // The review before sending is the one screen where the amount is not inside the sentence: it is the figure above
  // it, at display size, because the star of a review is what the gesture moves (the founder, 19 Sep 2026). D104 is
  // untouched by that: the figure is still `exitAmount().lead`, dollars first and the quantity never read as money.
  assert.equal(CASH_OUT.confirmTo("Ramp"), "To Ramp. This cannot be undone.");
  assert.doesNotMatch(CASH_OUT.confirmTo("Mercuryo"), /\d/, "the sentence beside the figure names no amount of its own");
  assert.equal(
    CASH_OUT.sent(card, "Mercuryo", "18 Sep 2026 at 9:15 AM", "7599b203"),
    "Sent about $3.24 to Mercuryo on 18 Sep 2026 at 9:15 AM. Reference: 7599b203.",
  );
  assert.equal(CASH_OUT.sending(bank, "Ramp"), "Sending $9.99 to Ramp");
  assert.equal(CASH_OUT.ready(card), "Ready: about $3.24");
  assert.equal(CASH_OUT.order(card, "Mercuryo"), "Order about $3.24 on Mercuryo");
  assert.equal(CASH_OUT.send(bank, "Ramp"), "Send $9.99 to Ramp");
  assert.equal(CASH_OUT.getReady(bank), "Get $9.99 ready");
  assert.equal(CASH_OUT.closedWhere(bank, "Ramp"), "You were at step 2 of 3: $9.99 is ready to send to Ramp.");
  assert.equal(CASH_OUT.readyLine("Ramp", bank), "$9.99 of it is ready to send to Ramp.");
  // Doubling a symbol is what a sentence adding its own would do to an amount that already carries one.
  for (const said of [CASH_OUT.sending(bank, "Ramp"), CASH_OUT.sent(bank, "Ramp", "now", "r"), CASH_OUT.ready(bank)]) {
    assert.doesNotMatch(said, /\$\$/);
  }
});

test("the quantity the service asks for is said in words a person can act on", () => {
  const said = CASH_OUT.exactQuantity("Mercuryo", "138.43");
  assert.match(said, /138\.43/);
  assert.match(said, /exact quantity/);
  // No word of a chain, a coin or a network reaches a person (the rule of the repository, and check:words).
  assert.doesNotMatch(said, /\b(MON|Monad|token|coin|wallet|chain|crypto)\b/i);
});

test("the screen hands the sentences an amount, never the raw quantity", () => {
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  // One place composes both forms; everything else reads from it.
  assert.match(screen, /const amountOf = \(way: WayOut, ready: Ready\): ExitAmount =>/);
  for (const sentence of ["ready", "order", "send", "confirm", "sending"]) {
    assert.doesNotMatch(
      screen,
      new RegExp(`W\\.${sentence}\\(ready\\.number`),
      `${sentence} is back to printing the quantity as if it were money`,
    );
  }
  assert.doesNotMatch(screen, /W\.sent\(sent\.number/, "the confirmation is back to the quantity");
  assert.doesNotMatch(screen, /W\.closedWhere\(ready\.number/, "the closed session is back to the quantity");
  // The one number that is dollars by construction still is: the bank rail's order figure.
  assert.match(screen, /W\.review\(`\$\$\{orderNumber\}`/);
});
