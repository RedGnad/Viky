// Two more requests that move money (the founder, 13 Oct 2026, after the final audit).
//
// The payment of a phone top-up or a gift card left by the plain request: a connection that dropped after the person's
// money had gone read "That did not work. Nothing was taken.", and a gateway's page read "Something went wrong.
// Nothing was changed.". The end of a gift, which sends money back and cannot be undone, read "Nothing was changed."
// the same way. Both now leave as the send does since 12 Oct 2026: no answer of the route is said as that, the
// balance or the gift is read again, and a refusal the route wrote keeps its code and its sentence.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ApiError, NoAnswer } from "../src/client/api";
import { payPhone, type PhonePrice } from "../src/client/phone";
import { endGift } from "../src/client/v2";
import { NO_ANSWER_AFTER_SENDING } from "../src/generic-failure";
import { END_GIFT } from "../src/sentences";

const read = (path: string) => readFileSync(path, "utf8");
const kept = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = kept;
});
let asked = 0;
const answering = (answer: () => Promise<Response>) => {
  asked = 0;
  globalThis.fetch = (async () => {
    asked += 1;
    return answer();
  }) as typeof fetch;
};
const dropped = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};
const noAnswer = (error: unknown) => error instanceof NoAnswer && error.code === "NO_ANSWER" && error.message === NO_ANSWER_AFTER_SENDING;

const account = privateKeyToAccount(generatePrivateKey());
const PRICE: PhonePrice = { orderId: "ph_test_000001", operatorName: "Orange", localAmount: "10", localCurrency: "EUR", ausdUnits: 12_050_000n, feeUnits: 352_000n, to: "0x00000000000000000000000000000000000000aa" };
const NONCE = `0x${"11".repeat(32)}` as const;

test("the payment of a top-up or a card: no answer of the route is said as that, and so is its plain failure", async () => {
  answering(dropped);
  await assert.rejects(payPhone({ account, price: PRICE, nonce: NONCE }), noAnswer);
  assert.equal(asked, 1);
  // A gateway's page in the route's place.
  answering(async () => new Response("<html>504 Gateway Timeout</html>", { status: 504, headers: { "content-type": "text/html" } }));
  await assert.rejects(payPhone({ account, price: PRICE, nonce: NONCE }), (error: unknown) => noAnswer(error) && (error as NoAnswer).status === 504);
  // The route's plain failure, written where anything unforeseen ends: it says "Nothing was changed." of a request
  // that may have sent the person's money before it failed, so it is not repeated.
  answering(async () => Response.json({ error: "Something went wrong. Nothing was changed.", code: "FAILED" }, { status: 500 }));
  await assert.rejects(payPhone({ account, price: PRICE, nonce: NONCE }), (error: unknown) => noAnswer(error) && (error as NoAnswer).status === 500);
  // A refusal the route wrote keeps its code and its sentence.
  answering(async () => Response.json({ code: "PRICE_EXPIRED", error: "That price has run out. Start again: nothing was taken." }, { status: 409 }));
  await assert.rejects(payPhone({ account, price: PRICE, nonce: NONCE }), (error: unknown) => error instanceof ApiError && !(error instanceof NoAnswer) && error.code === "PRICE_EXPIRED" && error.message === "That price has run out. Start again: nothing was taken.");
  // Too many attempts has its own name, and stays the route's sentence.
  answering(async () => Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 }));
  await assert.rejects(payPhone({ account, price: PRICE, nonce: NONCE }), (error: unknown) => error instanceof ApiError && error.code === "RATE_LIMITED");
  // And an answer is an answer.
  answering(async () => Response.json({ orderId: PRICE.orderId, state: "delivered", amount: "$12.05", operatorName: "Orange" }));
  assert.equal((await payPhone({ account, price: PRICE, nonce: NONCE })).state, "delivered");
});

test("a signature refused is before the request: nothing is asked of Viky, and the screen's own sentence stays true", async () => {
  answering(dropped);
  const refusing = { ...account, signTypedData: async () => Promise.reject(new Error("the passkey said no")) } as unknown as typeof account;
  await assert.rejects(payPhone({ account: refusing, price: PRICE, nonce: NONCE }), (error: unknown) => !(error instanceof ApiError));
  assert.equal(asked, 0, "the payment was never asked");
  const phone = read("src/client/phone.ts");
  assert.ok(phone.indexOf("const signature = await input.account.signTypedData(") < phone.indexOf('return await postJsonThatMoves<PhoneStatus>("/api/phone/pay", {'));
  // Both screens say a refusal in the sentence it carries, and theirs for what is not one: that is the signature.
  for (const screen of ["app/components/PhoneTopUp.tsx", "app/components/GiftCardOut.tsx"]) {
    const text = read(screen);
    assert.match(text, /return error instanceof ApiError \? error\.message : W\.failed;/, screen);
    // The balance is read again when no answer came back, so the figure they are told to check is a fresh one.
    assert.match(text, /next = await payPhone\(\{ account, price, nonce: randomNonce\(\) \}\);\s+\} catch \(error\) \{[\s\S]{0,180}if \(error instanceof ApiError && error\.code === "NO_ANSWER"\) await Promise\.resolve\(props\.onChanged\(\)\)\.catch\(\(\) => undefined\);\s+throw error;/, screen);
  }
});

test("the end of a gift: no answer says neither ended nor unchanged, in a sentence of its own, and the gift is read again", async () => {
  assert.equal(END_GIFT.noAnswer, "Viky got no answer. Look at this gift in a minute before ending it again.");
  assert.doesNotMatch(END_GIFT.noAnswer, /nothing was (taken|changed)|ended this|is ended|done/i);
  const offer = { keep: "3000000", giveBack: "7000000", nonce: "0", keepDisplay: "$3.00", giveBackDisplay: "$7.00" } as unknown as Parameters<typeof endGift>[0]["offer"];
  const input = { account, giftId: "1000", contract: "0x00000000000000000000000000000000000000bb" as const, offer };
  answering(dropped);
  await assert.rejects(endGift(input), noAnswer);
  answering(async () => new Response("", { status: 502 }));
  await assert.rejects(endGift(input), noAnswer);
  answering(async () => Response.json({ error: "Something went wrong. Nothing was changed.", code: "FAILED" }, { status: 500 }));
  await assert.rejects(endGift(input), noAnswer);
  // What the route wrote stays what the sheet says: the amounts moved, the gift is finished, not final yet.
  answering(async () => Response.json({ error: "The amounts have changed since they were shown. Look at them again. Nothing was changed.", code: "END_CHANGED" }, { status: 409 }));
  await assert.rejects(endGift(input), (error: unknown) => error instanceof ApiError && !(error instanceof NoAnswer) && error.code === "END_CHANGED");
  answering(async () => Response.json({ giftId: "1000", ended: true, keep: "3000000", giveBack: "7000000" }));
  assert.equal((await endGift(input)).ended, true);
  // The sheet: its own sentence, the gift read again before anything is offered again, and nothing else changed.
  const hook = read("app/kit/EndGift.tsx");
  assert.match(hook, /if \(error instanceof ApiError && error\.code === "NO_ANSWER"\) \{\s+setProblem\(E\.noAnswer\);\s+await Promise\.resolve\(onEnded\(\)\)\.catch\(\(\) => undefined\);\s+return false;\s+\}/);
  assert.ok(hook.indexOf("setProblem(E.noAnswer);") < hook.indexOf("setProblem(error instanceof ApiError ? error.message : isAccountError(error) ? error.guidance : E.failed);"));
  assert.equal(END_GIFT.failed, "The gift could not be ended. Nothing was changed. Try again.", "what is said before the request leaves");
});
