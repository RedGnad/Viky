import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOperator } from "../src/dev-access";

/**
 * Screen 2 of the UI pass of 8 Oct 2026 asks for one press: the same tab goes to the verification and comes back. The
 * founder adopts it on one condition, that it is tried first on a real iPhone, in Safari and in the installed app,
 * which only he can do, and only on viky.cash, where a passkey works. So the same tab is taken for the operator's own
 * accounts and for nobody else, on the server's word; everybody else has the two steps of before, unchanged.
 */

test("the same tab is the server's word, for the operator's own accounts alone", () => {
  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(route, /const sameTab = isOperator\(account\);/);
  assert.match(route, /secondsLeft: PROOF_SESSION_TTL_SECONDS, \.\.\.\(sameTab \? \{ sameTab \} : \{\}\) \}/, "nobody else is answered the field at all");
  assert.ok(route.indexOf("const account = auth.account;") < route.indexOf("const sameTab = isOperator(account);"), "by the account of the signed cookie");
  assert.doesNotMatch(route, /body\.sameTab/, "never by what the browser sends");
  const one = "0x00000000000000000000000000000000000000a1";
  assert.equal(isOperator(one, one), true);
  assert.equal(isOperator("0x00000000000000000000000000000000000000b2", one), false);
  assert.equal(isOperator(one, ""), false, "with no operator account set, nobody has the trial");
});

test("the page takes the same tab only when told to, and draws the two steps for everybody else", () => {
  const page = readFileSync("app/kit/ShowProof.tsx", "utf8");
  assert.match(page, /if \(session\.sameTab\) \{\n\s*window\.location\.assign\(session\.requestUrl\);\n\s*return;\n\s*\}\n\s*await waitFor\.current\(giftId, session, stop, false\);/);
  // The session brings the person back to the gift's own page, where the open session is found and looked at.
  assert.match(readFileSync("app/api/proof/session/route.ts", "utf8"), /proofRequest\.setRedirectUrl\(`\$\{accountAuthOriginFromRequest\(request\)\}\/g\/\$\{giftId\}`\);/);
  assert.match(page, /useState<State>\(\(\) => \(yours && !review && openAtLoad \? \{ at: "checking" \} : \{ at: "asking" \}\)\);/);
  // A page the browser kept and shows again by "Back" is not left frozen on the press: it asks what became of the session.
  assert.match(page, /const shownAgain = \(event: PageTransitionEvent\) => \{\n\s*if \(!event\.persisted\) return;\n\s*setState\(\{ at: "asking" \}\);\n\s*if \(!waiting\.current\) find\.current\(giftId, true, left\.signal\);/);
  // The two steps of before are all still there: the link named after where the person signs in, the wait, the stop.
  assert.match(page, /<a href=\{state\.requestUrl\} target="_blank" rel="noopener"/);
  assert.match(page, /\{W\.stopWaiting\}/);
});
