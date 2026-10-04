import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dollarsHeld, heldInGifts, holdsAnything } from "../app/kit/money";
import { dollarsToTheCent } from "../src/exit-steps";
import { totalEarned } from "../src/earned-shape";
import { readAs } from "../src/gift-moment";

/**
 * Money a daily gift already paid its recipient, taken out from Home while the gift still runs (D208): the gift's page
 * offers no gesture, Home offers the way out, and the way out takes the gifts' part first.
 */

test("what the gifts hold is added in the coin's units, and an account with only that has a way out", () => {
  assert.equal(totalEarned([{ earned: "1000000" }, { earned: "2500000" }]), 3_500_000n);
  assert.equal(totalEarned([]), 0n);
  assert.equal(heldInGifts([{ takeable: "3000000" }, { takeable: "0" }, {}]), 3_000_000n);
  assert.equal(heldInGifts(null), 0n);
  const empty = { AUSD: 0n, USDC: 0n, MON: 0n };
  assert.equal(holdsAnything(empty), false);
  assert.equal(holdsAnything(empty, [{ takeable: "0" }]), false);
  assert.equal(holdsAnything(empty, [{ takeable: "3000000" }]), true, "the gift's page says to take it from Home, so Home offers it");
});

test("Home's amount is everything the person can take out now: the account and what their gifts have already paid them", () => {
  // The first gift of the third contract, on 4 Oct 2026: an empty account, and 0.187 already paid by the gift. Its
  // page said "$0.18 yours so far", and Home said 0.00 over "Spend or withdraw".
  const empty = { AUSD: 0n, USDC: 0n, MON: 0n };
  assert.equal(dollarsHeld(empty), 0n);
  assert.equal(dollarsHeld(empty, heldInGifts([{ takeable: "187000" }])), 180_000n, "cut to the cent, as the way out cuts it");
  // Added to the coin a gift holds before the cut, so the figure is the way out's to the cent.
  assert.equal(dollarsHeld({ AUSD: 5_000n, USDC: 0n, MON: 0n }, 187_000n), 190_000n);
  assert.equal(dollarsHeld({ AUSD: 5_000n, USDC: 9_600n, MON: 0n }, 187_000n), dollarsToTheCent(5_000n + 187_000n, 9_600n));
  // One amount, read by Home and by You, and each hands it the gifts it already reads.
  const money = readFileSync("app/kit/money.ts", "utf8");
  assert.match(money, /const dollars = dollarsHeld\(holdings, heldInGifts\(gifts\)\);/);
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /<MoneyHero address=\{address\} holdings=\{holdings\} gifts=\{gifts\} giftsUnread=\{problem !== null\} \/>/);
  assert.match(readFileSync("app/kit/MoneyHero.tsx", "utf8"), /const dollars = useMoneyHeld\(holdings, gifts, giftsUnread\);/);
  assert.match(readFileSync("app/kit/Me.tsx", "utf8"), /const held = useMoneyHeld\(holdings, gifts, giftsUnread !== null\);/);
});

test("a daily gift that counts offers no gesture to its recipient: the way out is on Home", () => {
  const gift = { opened: true, cancelled: false, finished: false, connected: true, earnedAnything: true, shape: "days" as const, startTooHigh: false, sourceClosed: false, moneyToTake: true };
  assert.equal(readAs(gift, "recipient").action, null);
  assert.equal(readAs({ ...gift, finished: true }, "recipient").action, "take", "at the end the gift's page still offers it");
});

test("the way out reads the gifts' part with the balances, counts it, and takes it before a way", () => {
  const out = readFileSync("app/components/CashOut.tsx", "utf8");
  const client = readFileSync("src/client/gift.ts", "utf8");
  assert.match(client, /getJson<\{ gifts: EarnedInGift\[\] \}>\("\/api\/gifts\/earned"\)/);
  assert.match(out, /Promise\.all\(COINS\.map\(\(coin\) => readCoinBalance\(coin, address\)\)\),\n[\s\S]{0,200}loadEarnedInGifts\(\),/, "read with the balances");
  assert.match(out, /const changeable = toTheCent\(ausd \+ giftsHold \+ arrived, AUSD\.decimals\) \+ arrivedCoinWorth;/, "counted in every way's figure, with what a card delivered");
  assert.match(out, /const dollarsHeld = dollarsToTheCent\(ausd \+ giftsHold, held\(USDC\)\) \+ arrivedCoinWorth;/, "and in the figure at the head");
  assert.match(out, /const start = async \(way: WayOut\) => \{\n\s*const now = await gather\(\);\n\s*if \(!now\) return;/, "taken first, and a refusal stops there");
  assert.match(out, /await takeFromGifts\(account, inGifts\);/);
  assert.match(client, /await withdrawEarned\(\{ account, giftId: gift\.giftId, escrow: gift\.escrow, amount: BigInt\(gift\.earned\), nonce: BigInt\(gift\.nonce\) \}\)/, "the whole of each gift's part, at the nonce the contract expects");
  assert.ok(!out.includes("earned-in-gifts"), "the browser never imports the server's reader");
  assert.match(readFileSync("app/kit/Home.tsx", "utf8"), /holdsAnything\(holdings, gifts\)/);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /takeableFromHome: !milestone && earned > 0n,/, "the line is said of a daily gift that holds something");
  assert.match(readFileSync("src/my-gifts.ts", "utf8"), /takeable: role === "recipient" \? gift\.earnedBalance\.toString\(\) : "0",/);
  const route = readFileSync("app/api/gifts/earned/route.ts", "utf8");
  assert.match(route, /readAccountAuthSession\(request\)/, "only the signed-in account's own gifts");
  assert.match(readFileSync("src/earned-in-gifts.ts", "utf8"), /state\.recipient\.toLowerCase\(\) !== who \|\| state\.earnedBalance <= 0n/, "the contract's recipient, and only what is there to take");
});
