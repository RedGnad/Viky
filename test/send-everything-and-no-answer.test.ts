// Two things the send to another account did not say truly (the founder, 12 Oct 2026).
//
// Everything. The field is filled with the balance rounded down to the cent, and under the smallest amount Viky sends
// the route takes the whole balance and nothing else: a balance like $0.428571 could never leave, and the screen said
// "send everything you have at once" to somebody whose field already held everything. When the amount typed is the
// balance as the screen shows it, the whole balance leaves, fractions of a cent included. One rule, above $1.00 as
// under it, and no new sentence.
//
// No answer. When the send request has left and no answer of the route comes back, the screen no longer says "nothing
// was taken": it says it got no answer, and to check the balance before sending again. Before the request leaves (a
// signature refused), the sentence it had is true and stays.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { ApiError, NoAnswer, postJson, postJsonThatMoves } from "../src/client/api";
import { leavingForOwnSend, twoDecimalsDown } from "../src/exit-steps";
import { NO_ANSWER_AFTER_SENDING } from "../src/generic-failure";
import { routeSaysIt, SAID_BY_THE_SCREEN } from "../src/money-refusals";
import { DEFAULT_RELAY_CEILINGS, tooSmallToRelay } from "../src/relay-ceiling";
import { CASH_OUT, RELAY_CEILING } from "../src/sentences";

const read = (path: string) => readFileSync(path, "utf8");
const LEAST = DEFAULT_RELAY_CEILINGS.minimumUnits;

test("the amount typed is the balance as the screen shows it: the whole balance leaves, fractions of a cent included", () => {
  // Three days of a dollar over seven: what a gift really pays is seldom a whole number of cents.
  const held = 428_571n;
  assert.equal(twoDecimalsDown(held, 6), "0.42", "what the screen shows, and fills the field with");
  assert.equal(leavingForOwnSend(420_000n, held, 6), held);
  // The route's own rule then lets it go: it is everything there is, whatever the smallest amount.
  assert.equal(tooSmallToRelay(leavingForOwnSend(420_000n, held, 6), held, LEAST), false);
  assert.equal(tooSmallToRelay(420_000n, held, LEAST), true, "the amount to the cent alone was refused, for ever");
  // An amount that is not the balance shown leaves as it was typed, and under the smallest amount it is still refused.
  assert.equal(leavingForOwnSend(400_000n, held, 6), 400_000n);
  assert.equal(tooSmallToRelay(leavingForOwnSend(400_000n, held, 6), held, LEAST), true);
  // One rule, above the smallest amount as under it: $5.00 typed of $5.004999 held sends all of it.
  assert.equal(leavingForOwnSend(5_000_000n, 5_004_999n, 6), 5_004_999n);
  assert.equal(leavingForOwnSend(2_000_000n, 5_004_999n, 6), 2_000_000n);
  // A balance that is a whole number of cents leaves exactly as typed, as it always did.
  assert.equal(leavingForOwnSend(660_000n, 660_000n, 6), 660_000n);
  // What the person reads afterwards is the figure they typed: the fraction never had a figure on this screen.
  assert.equal(twoDecimalsDown(leavingForOwnSend(420_000n, held, 6), 6), "0.42");
});

test("the screen sends what that rule says, checks the smallest amount against it, and adds no sentence", () => {
  const screen = read("app/components/CashOut.tsx");
  assert.match(screen, /const ownLeaving = ownSending\.units === undefined \? undefined : leavingForOwnSend\(ownSending\.units, held\(ownCoin\), ownCoin\.decimals\);/);
  assert.match(screen, /const ownTooSmall = ownLeaving !== undefined && sendsAtLeast !== null && tooSmallToRelay\(ownLeaving, held\(ownCoin\), sendsAtLeast\);/);
  assert.match(screen, /const leaving = ownLeaving;[\s\S]{0,360}setBusy\(true\);\s+setProblem\(null\);\s+setStage\("ownSending"\);/);
  // Signed, then sent, in two halves since 13 Oct 2026 (test/send-unheard.test.ts): the same amount and the same coin.
  assert.match(screen, /const coin = ownCoin;/);
  assert.match(screen, /await sendSigned\(await signedFor\(\{ account, to: getAddress\(ownCode\.trim\(\)\) as Hex, amount: leaving, coin \}\)\);/);
  // A send to a payout service is another thing: its order is for an exact number, and exactly that number leaves.
  assert.match(screen, /Exactly the two-decimal number they ordered leaves, never the six-decimal balance/);
  // The sentence under the field is the one that existed, and it no longer stands over a field that holds everything.
  assert.equal(RELAY_CEILING.tooSmallToSend("$1.00"), "Viky sends $1.00 or more at a time. Below that, send everything you have at once.");
  // Taking a gift's part out has no such dead end: it always takes the whole of what the gift holds, to the unit.
  assert.match(read("src/client/gift.ts"), /await withdrawEarned\(\{ account, giftId: gift\.giftId, escrow: gift\.escrow, amount: BigInt\(gift\.earned\), nonce: BigInt\(gift\.nonce\) \}\);/);
  assert.match(read("app/api/gift/withdraw/route.ts"), /assertNotTooSmall\("takeOut", amount, gift\.earnedBalance\);/);
});

const kept = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = kept;
});
const answering = (answer: () => Promise<Response>) => {
  globalThis.fetch = (async () => answer()) as typeof fetch;
};

test("a request that moves money and brings back no answer of the route is said as that", async () => {
  assert.equal(NO_ANSWER_AFTER_SENDING, "Viky got no answer. Check your balance in a minute before sending again.");
  assert.equal(CASH_OUT.failures.noAnswer, NO_ANSWER_AFTER_SENDING);
  assert.doesNotMatch(NO_ANSWER_AFTER_SENDING, /nothing was (taken|changed)|sent|done/i, "neither done nor untouched is known, and neither is said");
  // The connection dropped: the request left, and nothing came back.
  answering(async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(postJsonThatMoves("/api/send", {}), (error: unknown) => error instanceof NoAnswer && error.code === "NO_ANSWER" && error.message === NO_ANSWER_AFTER_SENDING);
  // A gateway answered in the route's place: a page, and no body of the route's.
  answering(async () => new Response("<html>504 Gateway Timeout</html>", { status: 504, headers: { "content-type": "text/html" } }));
  await assert.rejects(postJsonThatMoves("/api/send", {}), (error: unknown) => error instanceof NoAnswer && error.status === 504);
  // An answer cut short, even one that began well.
  answering(async () => new Response("", { status: 200 }));
  await assert.rejects(postJsonThatMoves("/api/send", {}), NoAnswer);
  // A refusal the route wrote comes back as it always did, with its code and its sentence.
  answering(async () => Response.json({ error: "That is more than you have.", code: "NOT_ENOUGH" }, { status: 409 }));
  await assert.rejects(postJsonThatMoves("/api/send", {}), (error: unknown) => error instanceof ApiError && !(error instanceof NoAnswer) && error.code === "NOT_ENOUGH" && error.message === "That is more than you have.");
  // And an answer is an answer.
  answering(async () => Response.json({ sent: true, reference: "S-1", sentAtMs: 1 }));
  assert.deepEqual(await postJsonThatMoves("/api/send", {}), { sent: true, reference: "S-1", sentAtMs: 1 });
  // A request that moves nothing keeps its old reading: a connection that drops is the browser's own error there.
  answering(async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(postJson("/api/rates", {}), (error: unknown) => error instanceof TypeError);
});

test("before the request leaves, the screen's own sentence stays; after it, no answer is the screen's to say", () => {
  // The send signs first and asks second: a signature refused throws before anything is asked of Viky.
  const send = read("src/client/gift.ts");
  const signs = send.indexOf("const signature = await input.account.signTypedData(transferAuthorizationTypedData(message, coin));");
  const asks = send.indexOf('return postJsonThatMoves("/api/send", {');
  assert.ok(signs > 0 && asks > signs, "the signature comes before the request");
  assert.doesNotMatch(send.slice(signs, asks), /try \{|catch/, "nothing turns a refused signature into no answer");
  // The chain's own coin, which the account sends itself: once the transfer is out, a wait that fails is no answer.
  const own = read("src/client/onchain.ts");
  assert.match(own, /let receipt;\s+try \{\s+receipt = await waitForFinality\(publicClient, hash\);\s+\} catch \{\s+throw new NoAnswer\(\);\s+\}/);
  assert.ok(own.indexOf("sendTransaction({") < own.indexOf("receipt = await waitForFinality(publicClient, hash);"));
  // The screen: its own sentence for no answer, the balance read again, and the old sentence for what is not one.
  assert.ok(SAID_BY_THE_SCREEN.has("NO_ANSWER"));
  assert.equal(routeSaysIt("NO_ANSWER"), false);
  const screen = read("app/components/CashOut.tsx");
  assert.match(screen, /case "NO_ANSWER":[\s\S]{0,160}return W\.failures\.noAnswer;/);
  // The balance read again, on the send to another account and on the send to a payout service: one place for both
  // since 13 Oct 2026, which also says the send when the balance shows it left (test/send-unheard.test.ts).
  assert.match(screen, /if \(code === "NO_ANSWER" \|\| code === "SENT_UNCONFIRMED"\) \{\s+const now = await refresh\(\)\.catch\(\(\) => undefined\);/);
  assert.equal((screen.match(/if \(await leftUnheard\(error, \{ coin, leaving, heldBefore \}\)\) \{/g) ?? []).length, 2, "on the send to another account and on the send to a payout service");
  assert.match(screen, /default:\s+return W\.failures\.other;\s+\}\s+\}\s+return W\.failures\.other;/, "what is not an answer of a route, before the request, keeps the sentence it had");
  assert.match(CASH_OUT.failures.other, /^Viky could not finish this, and nothing was taken\./);
});

test("the judges page names the treasury a gift card pays, by its address, in the Bitrefill paragraph", () => {
  const page = read("app/judges/page.tsx");
  // The address alone, from the deployment's setting, never a key; nothing where it is not set.
  assert.match(page, /const treasury = \(\(\) => \{\s+try \{\s+return treasuryAddress\(\);\s+\} catch \{\s+return null;\s+\}\s+\}\)\(\);/);
  assert.match(read("src/phone-treasury.ts"), /export function treasuryAddress\(env: NodeJS\.ProcessEnv = process\.env\): Hex \{\s+const shared = env\.TREASURY_ADDRESS\?\.trim\(\);/);
  const row = page.slice(page.indexOf("<Row title={<>The Bitrefill way out</>}>"));
  assert.match(row.slice(0, 1_200), /They sign their AUSD over to Viky&apos;s treasury on Monad\s+\{treasury \? \(\s+<>\s+\{" "\}\s+\(\s+<a className="underline \[overflow-wrap:anywhere\]" href=\{`https:\/\/monadvision\.com\/address\/\$\{treasury\}`\} data-treasury="">\s+\{treasury\}/);
  // The README's line says where its money went in those words, and its transaction goes to that address.
  assert.match(read("README.md"), /the AUSD sent to Viky's treasury on one signature\./);
});
