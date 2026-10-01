import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTheExchange } from "../src/client/funding-quote";
import { quoteIsFor, sendsExactly } from "../src/funding-quote";

/**
 * The conversion of what a card bought is the funder's own account's transaction, built from what the exchange
 * answers (the audit of 1 Oct 2026). Before then an answer naming another destination, or another amount, was sent as
 * it came. Measured on 1 Oct 2026 against the exchange itself: for 5 MON to AUSD it answers the configured exchange,
 * 0xb3e6…13cb, and a value of exactly 5 MON, so the two checks refuse nothing that is right today.
 */

const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
const ELSEWHERE = "0x00000000000000000000000000000000000000Aa";
const FIVE = 5_000_000_000_000_000_000n;

test("an answer is for this conversion only when it goes to the exchange and sends exactly what was asked", () => {
  assert.equal(quoteIsFor({ to: EXCHANGE, value: FIVE.toString() }, FIVE, EXCHANGE), true);
  assert.equal(quoteIsFor({ to: EXCHANGE.toLowerCase() as `0x${string}`, value: FIVE.toString() }, FIVE, EXCHANGE), true, "the same address, however it is written");
  assert.equal(quoteIsFor({ to: ELSEWHERE, value: FIVE.toString() }, FIVE, EXCHANGE), false, "another destination");
  assert.equal(quoteIsFor({ to: EXCHANGE, value: (FIVE + 1n).toString() }, FIVE, EXCHANGE), false, "one unit more than asked");
  assert.equal(quoteIsFor({ to: EXCHANGE, value: (FIVE - 1n).toString() }, FIVE, EXCHANGE), false, "one unit less");
  assert.equal(quoteIsFor({ to: EXCHANGE, value: "0" }, FIVE, EXCHANGE), false);
  assert.equal(sendsExactly({ value: "five" }, FIVE), false, "an amount that is not a number is not the amount");
  assert.equal(sendsExactly({ value: "0x4563918244f40000" }, FIVE), true, "the same amount written in hexadecimal");
});

test("the server holds the answer to both before it answers, and refuses without sending anything", () => {
  const route = readFileSync("app/api/fund/quote/route.ts", "utf8");
  assert.match(route, /const exchange = exitExchangeAddress\(\);/, "the exchange is the one the way out is opened to");
  assert.match(route, /if \(!quoteIsFor\(quote, amount, exchange\)\) \{/);
  assert.ok(route.indexOf("quoteIsFor(quote, amount, exchange)") < route.indexOf("return NextResponse.json(quote"), "checked before it is answered");
  assert.match(route, /Nothing was changed\./);
});

test("the browser checks again before it sends, against the chain and not against the server", async () => {
  // The way out's contract knows its exchange: an address it does not know is not sent to.
  const pins: Record<string, string> = { [EXCHANGE.toLowerCase()]: "0x2f84FB8982073f39Ba47c7fcC29119aF074AbbcB" };
  const read = async (address: string) => pins[address.toLowerCase()] ?? "0x0000000000000000000000000000000000000000";
  assert.equal(await isTheExchange(EXCHANGE as `0x${string}`, read), true);
  assert.equal(await isTheExchange(ELSEWHERE as `0x${string}`, read), false);
  assert.equal(await isTheExchange("not an address" as `0x${string}`, read), false);

  const client = readFileSync("src/client/funding-quote.ts", "utf8");
  assert.match(client, /if \(!sendsExactly\(quote, amount\) \|\| !\(await isTheExchange\(quote\.to, read\)\)\) throw/);
  assert.match(client, /address: EXIT_ROUTER, abi: PIN_ABI, functionName: "mustPointAt"/);
  // And the pay screen sends only what came through that check.
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /const quote = await fundingQuote\(next\.amount\);\s*await sendWithExplicitGas\(account, \{ to: quote\.to, data: quote\.data, value: BigInt\(quote\.value\) \}\);/);
  assert.doesNotMatch(pay, /postJson<[^>]*>\("\/api\/fund\/quote"/, "no other path asks for a conversion and sends it unchecked");
});
