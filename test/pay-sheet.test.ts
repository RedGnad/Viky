import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAY } from "../src/sentences";
import { WAYS_IN } from "../src/rails";

/**
 * Paying for the gift on the card, and the wait while it is made (the rendered mockups pay.html and paying.html of
 * 19 Sep 2026, which are the specification for these two surfaces).
 *
 * What is defended here is what the sheet promises: three lines and no fourth, a figure this person actually pays,
 * the account made at the press and not before, the terms written to the device before the service's page opens,
 * and the second way in still reachable. The old assistant's check screen made the same promises on a page; these
 * tests follow them to where they are said now.
 */

const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
const pay = readFileSync("app/components/PayGift.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("three lines, and the third is that Viky keeps nothing", () => {
  assert.equal(PAY.rows.gift("Léa"), "The gift, in Léa's name");
  assert.equal(PAY.rows.service("Ramp"), "What Ramp charges");
  assert.equal(PAY.rows.viky, "Viky takes");
  assert.equal(PAY.nothing, "nothing");
  // True of the code: no rail of ours takes a share, and nothing in the money path adds one.
  for (const way of WAYS_IN) assert.ok(way.fee.percent > 0, `${way.name} publishes its own fee, which is theirs and not ours`);
  assert.doesNotMatch(readFileSync("src/gift-amount.ts", "utf8"), /vikyFee|ourFee|commission/i);
});

test("what this person pays is their own figure, at a dated rate", () => {
  assert.match(sheet, /eurosToBuyOn\(short, way, money\.rates\?\.usdPerEur\)/);
  assert.match(sheet, /arrivesInDollars\(euros, way, money\.rates\?\.usdPerEur\)/);
  // What the service keeps is measured rather than quoted: what the euros are worth, less what lands.
  assert.match(sheet, /euros \* money\.rates\.usdPerEur - arrives/);
  assert.match(sheet, /W\.atTheRate\(rateDateInWords\(money\.rates\.date\)\)/);
  assert.equal(PAY.atTheRate("18 Sep 2026"), "at the rate of 18 Sep 2026");
});

test("the account is made at the press, and the sheet says so before it happens", () => {
  assert.match(PAY.passkeyMakesTheAccount, /creates your account when you press pay/);
  assert.match(PAY.passkeyMakesTheAccount, /Nothing was asked of you until now/);
  assert.match(sheet, /W\.passkeyMakesTheAccount/);
  // The passkey opens inside the press, then the terms are written, then the service's page opens: that order.
  const press = sheet.slice(sheet.indexOf("const pay = async"), sheet.indexOf("const line ="));
  assert.ok(press.indexOf("await ensureSigner()") < press.indexOf("savePendingGift("), "the account comes before the terms are kept");
  assert.ok(press.indexOf("savePendingGift(") < press.indexOf("window.open(way.page"), "and the terms before the page that takes the money");
  assert.match(press, /router\.push\("\/fund\?step=paying"\)/, "and the wait takes over");
});

test("the second way in is reachable, and never in front of the action", () => {
  assert.match(sheet, /W\.another\(other\.name\)/);
  assert.equal(PAY.another("Mercuryo"), "Pay with Mercuryo instead");
  const footer = sheet.slice(sheet.indexOf("footer={"), sheet.indexOf("</Sheet>"));
  assert.ok(footer.indexOf("PRIMARY_BUTTON") < footer.indexOf("W.another"), "the one action comes first");
});

test("the sheet stands where the mockup stands it, and the wait is the whole screen", () => {
  assert.match(css, /dialog\.sheet-tall \{\s*\n\s*max-height: 82dvh;/, "a sheet with more to say stops at 82 per cent");
  assert.match(sheet, /tall\n/, "and this is that sheet");
  // The wait: the ring at the size paying.html draws it, what is being done in the title face, and the gift under it.
  assert.match(css, /\.working-ring-large \{[\s\S]*?width: 54px;/);
  assert.match(pay, /<Working says=\{phase === "converting" \? W\.arrived\.gettingReady : P\.putting\(gift, recipient\)\} and=\{P\.takesSeconds\} large \/>/);
  assert.match(pay, /<MiniGift recipient=\{recipient\}/);
  assert.equal(PAY.putting("$30.00", "Noah"), "Putting $30.00 in Noah's name.");
  assert.match(PAY.takesSeconds, /You can close this page/);
});

test("paying starts on the card, and the old way in to it is gone", () => {
  // The check screen with its two cards of figures, the separate account step and the review rows are all gone:
  // one surface asks for the money now, and it is the sheet over the card.
  for (const said of ["W.check.payingWith", "W.check.payWithFor", "W.account.title", "orderRails"]) {
    assert.ok(!pay.includes(said), `the paying screen still carries ${said}`);
  }
  assert.match(pay, /O\.nothingToPay\.title/, "somebody who lands there with nothing running is sent back to the card");
});
