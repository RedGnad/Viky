// After a send that brought no answer (the founder, 13 Oct 2026, after the final audit).
//
// Two things were left of the rule of 12 Oct. When the send had passed, the balances read again made the amount typed
// too much: the confirmation, which carried "Viky got no answer.", was no longer drawn, and a title stood alone (the
// send to a payout service read "One moment" with no end). And the confirmation kept its "Send": each press signed a
// new authorization, with a new number, so a second press after a lost answer could send a second time.
//
// Held here. What is signed is kept while its confirmation stands and asked again as it is: the coin takes an
// authorization once, and the route answers ALREADY_SENT for one it has taken. And when the balance read again holds
// that much less, or the route says so, the send is said in the confirmation's place, with nothing to press twice.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sendOwnMoney, sendSigned, signOwnSend } from "../src/client/gift";
import { AUSD, USDC } from "../src/coins";
import { leftAllTheSame } from "../src/exit-steps";
import { routeSaysIt, SAID_BY_THE_ROUTE, SAID_BY_THE_SCREEN } from "../src/money-refusals";
import { CASH_OUT } from "../src/sentences";

const read = (path: string) => readFileSync(path, "utf8");
const kept = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = kept;
});
const account = privateKeyToAccount(generatePrivateKey());
const TO = "0x00000000000000000000000000000000000000aa" as const;

test("what is signed is kept and asked again as it is: one authorization, one number, however many presses", async () => {
  const asked: Array<Record<string, string>> = [];
  globalThis.fetch = (async (_path: unknown, init?: { body?: string }) => {
    asked.push(JSON.parse(init?.body ?? "{}") as Record<string, string>);
    return Response.json({ sent: true, reference: "S-1", sentAtMs: 1 });
  }) as typeof fetch;
  const signed = await signOwnSend({ account, to: TO, amount: 2_000_000n, coin: AUSD });
  assert.equal(asked.length, 0, "a signature asks nothing of Viky");
  assert.deepEqual(Object.keys(signed).sort(), ["coin", "nonce", "signature", "to", "validAfter", "validBefore", "value"]);
  assert.equal(signed.coin, AUSD.address);
  assert.equal(signed.value, "2000000");
  assert.match(signed.nonce, /^0x[0-9a-f]{64}$/);
  await sendSigned(signed);
  await sendSigned(signed);
  assert.deepEqual(asked[0], asked[1], "the second asking is the first, to the letter");
  assert.deepEqual(asked[0], { ...signed });
  // Two signatures are two numbers, which is why the second one must not be made while the first may have passed.
  const again = await signOwnSend({ account, to: TO, amount: 2_000_000n, coin: AUSD });
  assert.notEqual(again.nonce, signed.nonce);
  // The send in one call is the two halves, for whoever sends once and keeps nothing (src/client/mobile-money.ts).
  await sendOwnMoney({ account, to: TO, amount: 1_000_000n, coin: USDC });
  assert.equal(asked[2]?.coin, USDC.address);
  const client = read("src/client/gift.ts");
  assert.match(client, /export async function sendOwnMoney\([^)]*\): Promise<\{ sent: boolean; reference: string; sentAtMs: number \}> \{\s+return sendSigned\(await signOwnSend\(input\)\);\s+\}/);
});

test("the screen keeps the authorization of the confirmation in front of the person, and lets go of it only when it is settled", () => {
  const screen = read("app/components/CashOut.tsx");
  // One authorization for the same account, coin, destination and amount.
  assert.match(screen, /const key = `\$\{input\.account\.address\}:\$\{input\.coin\.address\}:\$\{input\.to\}:\$\{input\.amount\}`\.toLowerCase\(\);\s+if \(keptSend\?\.key === key\) return keptSend\.signed;\s+const signed = await signOwnSend\(input\);\s+setKeptSend\(\{ key, signed \}\);/);
  // Both sends go through it, and both let go of it once the route has answered that it is sent.
  assert.equal((screen.match(/await sendSigned\(await signedFor\(\{/g) ?? []).length, 2);
  assert.equal((screen.match(/await sendSigned\(await signedFor\([^\n]+\n\s+setKeptSend\(null\);/g) ?? []).length, 2);
  assert.doesNotMatch(screen, /sendOwnMoney/, "no send of this screen signs anew at every press");
  // It is let go when the coin has taken it, when the balance shows it left, and when the coin refused it unused.
  assert.match(screen, /if \(code === "ALREADY_SENT"\) \{\s+setKeptSend\(null\);\s+await refresh\(\)\.catch\(\(\) => undefined\);\s+return true;\s+\}/);
  assert.match(screen, /if \(!leftAllTheSame\(was\.heldBefore, now\?\.\[was\.coin\.symbol\], was\.leaving\)\) return false;\s+setKeptSend\(null\);\s+return true;/);
  assert.match(screen, /if \(code === "REFUSED" \|\| code === "INVALID_SIGNATURE" \|\| code === "INVALID_REQUEST"\) setKeptSend\(null\);\s+return false;/);
  // After a lost answer with a balance that has not moved, it stays: the next press asks with the same one.
  const unheard = screen.slice(screen.indexOf("const leftUnheard = async"), screen.indexOf("const codeProblem = ()"));
  assert.equal((unheard.match(/setKeptSend\(null\);/g) ?? []).length, 3);
});

test("the route answers an authorization the coin has already taken as a send that passed, before any refusal that says it did not", () => {
  const route = read("app/api/send/route.ts");
  assert.match(route, /name: "authorizationState", stateMutability: "view", inputs: \[\{ name: "authorizer", type: "address" \}, \{ name: "nonce", type: "bytes32" \}\], outputs: \[\{ type: "bool" \}\]/);
  assert.match(route, /const ALREADY_SENT = "That was sent the first time\. Nothing more left your account\.";/);
  assert.match(route, /functionName: "authorizationState", args: \[from, nonce as Hex\] \}\)\) as boolean;\s+if \(taken\) throw new GiftApiError\("ALREADY_SENT", ALREADY_SENT, 409\);/);
  // Asked where the route would otherwise say that nothing left: not enough, refused by the coin, and reverted.
  assert.match(route, /if \(held < value\) \{\s+await refuseIfAlreadySent\(\);\s+throw new GiftApiError\("NOT_ENOUGH"/);
  assert.match(route, /\} catch \{\s+await refuseIfAlreadySent\(\);\s+throw new GiftApiError\("REFUSED"/);
  assert.match(route, /if \(receipt\.status !== "success"\) \{[\s\S]{0,140}await refuseIfAlreadySent\(\);\s+throw new RelayerError\("REVERTED"/);
  assert.equal((route.match(/await refuseIfAlreadySent\(\);/g) ?? []).length, 3);
  // A read of the coin that fails is not turned into a refusal the route cannot vouch for.
  assert.doesNotMatch(route.slice(route.indexOf("const refuseIfAlreadySent"), route.indexOf("const held =")), /catch/);
  // The screen says it in words of its own: the send, in the confirmation's place.
  assert.ok(SAID_BY_THE_SCREEN.has("ALREADY_SENT") && !SAID_BY_THE_ROUTE.has("ALREADY_SENT"));
  assert.equal(routeSaysIt("ALREADY_SENT"), false);
});

test("a send whose answer was lost and that left is said as sent, in the confirmation's place, with nothing to press twice", () => {
  // The balance read again: that much less, or more (the chain's own coin pays its fee too), is a send that left.
  assert.equal(leftAllTheSame(5_000_000n, 3_000_000n, 2_000_000n), true);
  assert.equal(leftAllTheSame(5_000_000n, 2_990_000n, 2_000_000n), true);
  assert.equal(leftAllTheSame(428_571n, 0n, 428_571n), true, "everything, the fraction of a cent with it");
  // Not moved, moved by less, grown, or not read: nothing is known, and nothing is concluded.
  assert.equal(leftAllTheSame(5_000_000n, 5_000_000n, 2_000_000n), false);
  assert.equal(leftAllTheSame(5_000_000n, 4_000_000n, 2_000_000n), false);
  assert.equal(leftAllTheSame(5_000_000n, 9_000_000n, 2_000_000n), false);
  assert.equal(leftAllTheSame(5_000_000n, undefined, 2_000_000n), false);
  assert.equal(leftAllTheSame(0n, 0n, 0n), false);

  assert.equal(CASH_OUT.own.sentUnheard("2.00"), "Sent $2.00 to your other account. No answer came back, so there is no reference to show.");
  assert.equal(CASH_OUT.sentUnheard("$9.99", "Ramp"), "Sent $9.99 to Ramp. No answer came back, so there is no reference to show.");
  for (const sentence of [CASH_OUT.own.sentUnheard("2.00"), CASH_OUT.sentUnheard("$9.99", "Ramp")]) assert.doesNotMatch(sentence, /nothing was (taken|changed)|Reference:/i);

  const screen = read("app/components/CashOut.tsx");
  // What was sent is read before the press: afterwards the coin itself may be another, and the amount typed too much.
  assert.match(screen, /const coin = ownCoin;\s+const heldBefore = held\(coin\);\s+const said = twoDecimalsDown\(leaving, coin\.decimals\);/);
  assert.match(screen, /if \(await leftUnheard\(error, \{ coin, leaving, heldBefore \}\)\) \{\s+setGone\(\{ amount: said, name: "" \}\);\s+setOwnCode\(""\);\s+setStage\("ownGone"\);\s+return;\s+\}/);
  assert.match(screen, /if \(await leftUnheard\(error, \{ coin, leaving, heldBefore \}\)\) \{\s+const said = amountOf\(chosen, ready\);\s+setGone\(\{ amount: said\.lead, exact: said\.exact, name: chosen\.name \}\);\s+setDeposit\(""\);\s+setStage\("gone"\);\s+return;\s+\}/);
  // Drawn where the confirmation stood, with no "Send" in it.
  assert.match(screen, /\) : stage === "ownGone" && gone \? \(\s+<p className=\{BODY\} data-sent-unheard="">\s+\{W\.own\.sentUnheard\(gone\.amount\)\}\s+<\/p>/);
  const said = screen.slice(screen.indexOf(`) : stage === "gone" && gone ? (`), screen.indexOf(") : ready ? ("));
  assert.match(said, /\{W\.sentUnheard\(gone\.amount, gone\.name\)\}/);
  assert.doesNotMatch(said, /W\.sendButton|onPress/);
  // And when nothing can be concluded, what was said of the send stays on the screen: no title alone, no wait with no end.
  assert.match(screen, /\{stage === "ownConfirm" && ownSending\.units === undefined \? \(\s+<>\s+\{alert\("own"\)\}/);
  assert.match(screen, /\) : problem\?\.where === "send" \? \(\s+<section className=\{CARD\}>[\s\S]{0,200}\{alert\("send"\)\}/);
  assert.ok(screen.indexOf(`) : problem?.where === "send" ? (`) < screen.indexOf("<WaitLine>{W.oneMoment}</WaitLine>\n        )}\n      </div>\n    );\n  }\n\n  // W13"), "before the wait");
});
