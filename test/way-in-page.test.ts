import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAY } from "../src/sentences";
import { RAMP_BARE_PAGE, WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, wayInFillsIn, wayInPage } from "../src/rails";

/**
 * The partner's page opens filled in (D289, the founder's decision of 27 Sep 2026): the person types and pastes nothing.
 * Ramp takes the account, the amount and the asset in its address, with its partner key; without the key it refuses any
 * parameter ("Integration issue detected", read on its live page on 27 Sep 2026), so the page opens bare.
 */

const ACCOUNT = "0x000000000000000000000000000000000000dEaD";

test("with Ramp's partner key, the page carries the account, the amount in euros and what a gift holds", () => {
  const page = new URL(wayInPage(WAY_IN_GIFT_COIN, { account: ACCOUNT, euros: 25.4 }, "pk_test"));
  assert.equal(page.origin, "https://app.ramp.network");
  assert.equal(page.searchParams.get("hostApiKey"), "pk_test");
  assert.equal(page.searchParams.get("swapAsset"), "MONAD_AUSD", "what a gift holds, nothing to swap after it");
  assert.equal(page.searchParams.get("flow"), "onramp");
  assert.equal(page.searchParams.get("userAddress"), ACCOUNT);
  assert.equal(page.searchParams.get("fiatCurrency"), "EUR");
  assert.equal(page.searchParams.get("fiatValue"), "26", "the sheet's whole euros, never less");
  assert.equal(wayInFillsIn(WAY_IN_GIFT_COIN, "pk_test"), true);
});

test("without the key, Ramp opens bare, where it works, and nothing says it is filled in", () => {
  assert.equal(wayInPage(WAY_IN_GIFT_COIN, { account: ACCOUNT, euros: 26 }, undefined), RAMP_BARE_PAGE);
  assert.equal(wayInFillsIn(WAY_IN_GIFT_COIN, undefined), false);
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /wayInFillsIn\(way\) \? W\.partnerFilledIn : W\.partnerPaste\(way\.name, way\.delivers\.coin, way\.delivers\.network, way\.arrives === "gift"\)/);
  assert.match(PAY.partnerFilledIn, /Your account is already filled in\./);
});

test("Mercuryo keeps its own page: filling it in needs a partner widget id", () => {
  assert.equal(wayInPage(WAY_IN_CHAIN_COIN, { account: ACCOUNT, euros: 30 }, "pk_test"), WAY_IN_CHAIN_COIN.page);
  assert.equal(wayInFillsIn(WAY_IN_CHAIN_COIN, "pk_test"), false);
});

test("every screen that opens the partner opens the page this builds, and the judges page names the partner and the asset", () => {
  assert.match(readFileSync("app/kit/offer/PaySheet.tsx", "utf8"), /window\.open\(wayInPage\(way, \{ account, euros \}\)/);
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.doesNotMatch(wait, /wayIn\.page/);
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(judges, /authorised crypto-asset service provider under MiCA, regulated by the Central Bank of Ireland/);
  assert.match(judges, /MONAD_AUSD/);
  assert.match(judges, /The next step is Ramp embedded with a partner key/);
});

test("without the key, the sheet says what to choose on the partner's page and where the code goes, and offers the code (D294)", () => {
  assert.equal(
    PAY.partnerPaste(WAY_IN_GIFT_COIN.name, WAY_IN_GIFT_COIN.delivers.coin, WAY_IN_GIFT_COIN.delivers.network, true),
    "Our partner Ramp takes your card, once with your ID. Choose AUSD on Monad there: that is what your gift holds. Paste your code where it asks for an address. Come back here: the gift starts by itself.",
  );
  // Mercuryo delivers the chain's coin, which one confirmed step turns into what a gift holds (D101): never "by itself".
  const mercuryo = PAY.partnerPaste(WAY_IN_CHAIN_COIN.name, WAY_IN_CHAIN_COIN.delivers.coin, WAY_IN_CHAIN_COIN.delivers.network, WAY_IN_CHAIN_COIN.arrives === "gift");
  assert.equal(mercuryo, "Our partner Mercuryo takes your card, once with your ID. Choose MON on Monad there. Paste your code where it asks for an address. Come back here to confirm the last step.");
  assert.doesNotMatch(mercuryo, /by itself|what your gift holds/);
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  // The code exists once the account does: before the first press there is no account, and nothing to copy.
  assert.match(sheet, /!enough && \(cardClosed \|\| !wayInFillsIn\(way\)\) && address \? \(/);
  assert.match(sheet, /navigator\.clipboard\.writeText\(address\)/);
});

test("without the key, the pay press opens nothing: the waiting screen shows the code first, then opens the partner (D296)", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /if \(!enough && wayInFillsIn\(way\)\) \{\s*window\.open\(wayInPage\(way, \{ account, euros \}\), "_blank", "noopener,noreferrer"\);\s*router\.push\("\/fund\?step=paying&opened=1"\);\s*\} else router\.push\("\/fund\?step=paying"\);/);
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /partnerOpened \? W\.waiting\.openAgain\(wayIn\.name\) : W\.waiting\.openFirst\(wayIn\.name\)/);
  // On the waiting screen the code and its copy come before the button that opens the partner.
  assert.ok(wait.indexOf("W.waiting.codeLabel(wayIn.name)") < wait.indexOf("W.waiting.openFirst(wayIn.name)"));
});
