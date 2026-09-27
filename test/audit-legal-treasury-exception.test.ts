// The legal notice says the phone and gift card route as a bounded exception (the founder, 27 Sep 2026): Viky holds the
// person's money for the time it takes to pay the order, within ceilings that are the code's own, with a refund by
// itself and one line per order.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHONE_CEILINGS } from "../src/phone-order";

const legal = readFileSync(new URL("../app/legal/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
const dollars = (n: number) => `$${n.toFixed(2)}`;

test("the ceilings the notice names are the ones the code enforces", () => {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  assert.ok(legal.includes(`${words[PHONE_CEILINGS.ordersPerDay]} orders and ${dollars(PHONE_CEILINGS.usdPerDay)} a day for everybody together`));
  assert.ok(legal.includes(`and ${dollars(PHONE_CEILINGS.usdPerPersonPerDay)} a person a day`));
});

test("the exception says the money is held for the order's time, sent back by itself, and written down per order", () => {
  assert.ok(legal.includes("the one exception to what is said above about money, and it is bounded"));
  assert.ok(legal.includes("Viky holds the person&apos;s money in its treasury for the time it takes to pay the order"));
  assert.ok(legal.includes("at the latest by the next daily pass"), "true of followUnsettledOrders in the settling pass");
  assert.ok(legal.includes("Every order is written down, one line each"));
  const settle = readFileSync(new URL("../app/api/cron/settle/route.ts", import.meta.url), "utf8");
  assert.match(settle, /followUnsettledOrders\(\)/);
});
