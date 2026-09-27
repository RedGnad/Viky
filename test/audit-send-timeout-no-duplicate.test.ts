// A send whose finality wait fails is never told "nothing left your account" (the money path audit of 27 Sep 2026): it
// was sent, so the route answers SENT_UNCONFIRMED with a sentence that asks the person to look before sending again,
// and the screen shows that sentence rather than its own "did not receive it".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/send/route.ts", import.meta.url), "utf8");
const screen = readFileSync(new URL("../app/components/CashOut.tsx", import.meta.url), "utf8");

test("once the send is out, a failed wait is SENT_UNCONFIRMED, never a failure that says nothing moved", () => {
  const sent = route.indexOf("clients.walletClient.writeContract(");
  const wait = route.indexOf("receipt = await waitForFinality(clients.publicClient, hash);");
  const unconfirmed = route.indexOf('new GiftApiError("SENT_UNCONFIRMED"');
  assert.ok(sent > 0 && wait > sent, "the wait comes after the send");
  assert.ok(unconfirmed > wait, "a wait that throws becomes SENT_UNCONFIRMED");
  assert.match(route.slice(wait - 40, unconfirmed), /try \{\s*receipt = await waitForFinality/);
  assert.doesNotMatch(route.slice(unconfirmed, unconfirmed + 200), /[Nn]othing/);
});

test("the way out shows the route's own sentence for an unconfirmed send", () => {
  const branch = screen.slice(screen.indexOf('case "SENT_UNCONFIRMED":'));
  assert.ok(screen.includes('case "SENT_UNCONFIRMED":'));
  assert.ok(branch.indexOf("return error.message;") < branch.indexOf("return W.failures"), "it falls to the route's sentence");
});
