import assert from "node:assert/strict";
import test from "node:test";
import { FUND, PAY } from "../src/sentences";
import { sharedWith } from "../src/preview-line";

/**
 * A card can be paid for without the recipient's name (the founder, 20 Sep 2026): a gift for whoever opens the link.
 * Every sentence that names them reads right without one (D299). The founder saw "Your gift: $34.20 for , 30 days."
 */
const broken = /( ,| \.|'s gift|'s name| {2}| to \.)/;

test("with no name, nothing reads 'for ,' or 's name', and with a name nothing changes", () => {
  const empty = [
    PAY.title(""),
    PAY.rows.gift(""),
    FUND.check.linkRisk(""),
    FUND.check.putIt("$30.00", ""),
    FUND.waiting.giftSaid("$34.20", "", 30),
    FUND.arrived.putting(undefined, "$30.00", ""),
    FUND.closed.kept("$30.00", ""),
    FUND.closed.keptWhileOpen("$30.00", ""),
    FUND.waitingGift.which("$30.00", ""),
    FUND.made.title("$30.00", ""),
    sharedWith("", "$30.00", "It becomes yours as you go."),
    FUND.made.onlyThem(""),
    FUND.waiting.giftSaid("$30.00", ""),
  ];
  for (const sentence of empty) assert.doesNotMatch(sentence, broken, sentence);
  assert.equal(FUND.waiting.giftSaid("$34.20", "", 30), "$34.20, 30 days");
  assert.equal(PAY.title(""), "Pay for their gift");
  assert.equal(FUND.check.linkRisk(""), "The link you will get opens the gift for whoever opens it first. Send it only to the person it is for.");
  assert.equal(FUND.waiting.giftSaid("$30.00", "Noah", 30), "$30.00 for Noah, 30 days");
  assert.equal(PAY.title("Noah"), "Pay for Noah's gift");
});
