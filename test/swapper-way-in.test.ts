import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cardOffered, cardReach } from "../src/card-rail";
import { scanSource } from "../src/consumer-words";
import { wayInFor } from "../src/gift-amount";
import { MONAD_CHAIN_ID } from "../src/monad/chain";
import { reachOfWaysIn, swapperQuotesIn } from "../src/rail-availability";
import { feeSentence, SWAPPER_CLOSED_IN, swapperIntegratorId, WAY_IN_CHAIN_COIN, WAY_IN_EMBEDDED, WAY_IN_GIFT_COIN, WAYS_IN, waysIn } from "../src/rails";
import { FUND, PAY } from "../src/sentences";

/**
 * Paying by card inside Viky, through Swapper's widget (the founder, 1 Oct 2026): behind its integrator id. Without the
 * id nothing changes; with it, Swapper stands first where its card services quote, the sentence about choosing a coin
 * and pasting a code is gone on that path, and the line about being 18 and its terms follows with its name and link.
 */

const ENV = "NEXT_PUBLIC_SWAPPER_INTEGRATOR_ID";
function withId<T>(id: string | undefined, run: () => T): T {
  const before = process.env[ENV];
  if (id === undefined) delete process.env[ENV];
  else process.env[ENV] = id;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env[ENV];
    else process.env[ENV] = before;
  }
}

test("without the id, the ways in are the two there were, and nothing names Swapper", () => {
  withId(undefined, () => {
    assert.equal(swapperIntegratorId(), undefined);
    assert.equal(waysIn(), WAYS_IN, "the very list the sheet read before");
    assert.deepEqual(Object.keys(cardReach("fr")), ["Ramp", "Mercuryo"]);
    assert.equal(wayInFor(30_000_000n, waysIn(), 1.15, cardReach("fr")).way, WAY_IN_GIFT_COIN);
  });
  withId("   ", () => assert.equal(waysIn(), WAYS_IN, "an empty id is no id"));
});

test("with the id, Swapper stands first where it serves, and gives way by its own sentence where it does not", () => {
  withId("an-id", () => {
    const ways = waysIn();
    assert.deepEqual(ways.map((way) => way.name), ["Swapper", "Ramp", "Mercuryo"]);
    const france = wayInFor(30_000_000n, ways, 1.15, cardReach("fr"));
    assert.equal(france.way, WAY_IN_EMBEDDED);
    // 30 dollars are 26.09 EUR at 1.15, and one euro of margin since 1 Oct 2026, so a payment does not land a little
    // short; the measured ceiling of 9 % makes it 29.77, and a whole euro 30.
    assert.equal(france.euros, 30);
    assert.equal(france.insteadOf, undefined);
    assert.equal(wayInFor(30_000_000n, ways, 1.15, cardReach("sn")).way, WAY_IN_EMBEDDED, "Dakar is quoted");
    const abidjan = wayInFor(30_000_000n, ways, 1.15, cardReach("ci"));
    assert.equal(abidjan.way, WAY_IN_CHAIN_COIN, "Ivory Coast had no quote at 20 EUR, and Ramp does not sell there");
    assert.deepEqual(abidjan.insteadOf, { way: WAY_IN_EMBEDDED, because: "country" });
    assert.equal(PAY.instead.country("Swapper", abidjan.way.name), "Swapper does not serve your country, so this goes through Mercuryo.");
    // Under its smallest payment, the next way takes the gift.
    const small = wayInFor(5_000_000n, ways, 1.15, cardReach("fr"));
    assert.equal(small.way, WAY_IN_GIFT_COIN);
    assert.deepEqual(small.insteadOf, { way: WAY_IN_EMBEDDED, because: "floor" });
    // A live answer still counts where the list is silent, and the card is offered while any way serves.
    assert.equal(cardReach("fr", { Swapper: "does-not" }).Swapper, "does-not");
    assert.equal(cardOffered(cardReach("ci")), true);
    assert.equal(cardOffered(cardReach("ir")), false, "Iran is on all three lists");
  });
});

test("where Swapper's card gives nothing is the list read on 1 Oct 2026", () => {
  assert.equal(SWAPPER_CLOSED_IN.length, 43, "6 countries it does not list, 37 with no quote at 20 EUR");
  for (const code of SWAPPER_CLOSED_IN) assert.match(code, /^[a-z]{2}$/);
  assert.equal(new Set(SWAPPER_CLOSED_IN).size, 43);
  for (const closed of ["cn", "cu", "ir", "kp", "sy", "zw", "ci", "ml", "bf", "gn", "ng", "tn"]) assert.ok(SWAPPER_CLOSED_IN.includes(closed), closed);
  for (const open of ["fr", "sn", "us", "be", "cm", "ma", "gb"]) assert.ok(!SWAPPER_CLOSED_IN.includes(open), open);
  assert.equal(WAY_IN_EMBEDDED.closedIn, SWAPPER_CLOSED_IN);
  assert.equal(WAY_IN_EMBEDDED.arrives, "gift");
  assert.equal(WAY_IN_EMBEDDED.smallestEur, 10);
  assert.deepEqual(WAY_IN_EMBEDDED.fee, { percent: 9, upTo: true, minimum: 0, currency: "EUR" });
  assert.equal(WAY_IN_EMBEDDED.terms, "https://swapper.finance/pdfs/SWAPPER_TERMS_OF_USE.pdf");
});

test("its card services are asked live for the payer's country, only while the id is set", async () => {
  const real = globalThis.fetch;
  const asked: Array<{ url: string; body: Record<string, unknown> }> = [];
  const answer = (quotes: unknown, status = 200) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ quotes }), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  try {
    globalThis.fetch = answer([{ serviceProvider: "TOPPER" }]);
    assert.equal(await swapperQuotesIn("sn", 1_000), true);
    assert.deepEqual(asked[0], {
      url: "https://swapper.finance/api/onramp/quote",
      body: { sourceAmount: "20", sourceCurrencyCode: "EUR", destinationCurrencyCode: "USDC_POLYGON", countryCode: "SN", paymentMethodType: "CREDIT_DEBIT_CARD" },
    });
    assert.equal(await swapperQuotesIn("sn", 2_000), true, "held: not asked again");
    assert.equal(asked.length, 1);
    globalThis.fetch = answer([]);
    assert.equal(await swapperQuotesIn("ci", 1_000), false);
    globalThis.fetch = answer(null, 502);
    assert.equal(await swapperQuotesIn("ke", 1_000), null, "a read that fails is not a refusal");

    // The route's own answer: nothing of Swapper without the id, and its live word with it.
    // The other two services' reads fail here; Swapper's answers no quote.
    globalThis.fetch = (async (url: string | URL | Request) =>
      String(url).includes("swapper.finance") ? new Response(JSON.stringify({ quotes: [] }), { status: 200 }) : new Response("{}", { status: 404 })) as typeof fetch;
    const without = await withId(undefined, () => reachOfWaysIn("ci"));
    assert.equal("Swapper" in without, false);
    const withIt = await withId("an-id", () => reachOfWaysIn("bj"));
    assert.equal(withIt.Swapper, "does-not");
    assert.equal((await withId("an-id", () => reachOfWaysIn(null))).Swapper, "unknown", "no country known: the widget checks");
  } finally {
    globalThis.fetch = real;
  }
});

test("on that path nothing is chosen and nothing is pasted, and the sentences say what the person meets", () => {
  const said = PAY.partnerEmbedded("Swapper", 29);
  assert.equal(
    said,
    "The card payment opens next, by our partner Swapper. Enter 29 EUR there: it shows what your gift receives. A card service then takes your card in its own window, once with your ID, and calls the money USDC. Come back here: the gift starts by itself.",
  );
  assert.doesNotMatch(said, /Choose|Paste|code/);
  assert.deepEqual(scanSource("sentence", said), [], "through the consumer words check");
  assert.match(PAY.partnerEmbedded("Swapper", undefined), /Enter the amount there/);
  assert.deepEqual(PAY.card, { title: "Pay by card", frame: "Card payment" });
  assert.deepEqual([FUND.waiting.openCard, FUND.waiting.openCardAgain], ["Pay by card", "Open the card payment again"]);
  assert.equal(feeSentence(WAY_IN_EMBEDDED), "Through Swapper, a card payment bought up to 9 % less than the day's rate when it was read");
  assert.equal(`${PAY.cardTerms.before}${PAY.cardTerms.link(WAY_IN_EMBEDDED.name)}${PAY.cardTerms.after}`, "By paying by card, you confirm you are 18 or older and accept Swapper's terms.");

  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /if \(!enough && way\.embedded\) return router\.push\("\/fund\?step=paying&card=1"\);/, "the same press opens the card on the wait, after the account is made and the gift kept");
  assert.match(sheet, /\{way\.embedded\n\s*\? W\.partnerEmbedded\(way\.name, euros\)\n/);
  assert.match(sheet, /\{byCard \? <CardTermsLine way=\{way\} \/> : null\}/, "the terms line follows, with the way's own name and link");
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /\{wayInAsksNothing\(wayIn\) && !cardClosed \? null : \(\n\s*<section className=\{CARD\}>/, "no settings and no code to give on the wait either");
  assert.match(wait, /const \[cardOpen, setCardOpen\] = useState\(params\.get\("card"\) === "1"\);/, "the card sheet opens at once for whoever the pay press sent");
  assert.match(wait, /<SwapperSheet\n\s*open=\{cardOpen\}\n\s*account=\{address\}/);
});

test("the widget is told what a gift holds, on the gift's chain, to the payer's own account, and shows the card alone", () => {
  const widget = readFileSync("app/kit/offer/SwapperSheet.tsx", "utf8");
  assert.equal(MONAD_CHAIN_ID, 143);
  assert.match(widget, /dstChainId: String\(MONAD_CHAIN_ID\),/);
  assert.match(widget, /dstTokenAddr: AUSD_ADDRESS,/);
  assert.match(widget, /depositWalletAddress: account,/);
  assert.match(widget, /supportedDepositOptions: \["depositWithCash"\],/);
  assert.match(widget, /if \(!open \|\| !account \|\| !container \|\| !integratorId\) return;/, "nothing is drawn without the id");
  assert.doesNotMatch(widget, /minDepositUsd:/, "its minimum did not stop a card payment under it (read 1 Oct 2026), so it is not passed");
  assert.match(widget, /widget\?\.destroy\(\);/);
  // The dependency is imported where it is used, and nowhere pinned loosely.
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).dependencies["@swapper-finance/deposit-sdk"], "0.4.1");
});
