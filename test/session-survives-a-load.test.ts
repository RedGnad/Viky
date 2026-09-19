import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { announcedAccount, sessionReach } from "../src/account/session-gate";
import { ME } from "../src/sentences";

/**
 * The session survives a page load (18 Sep 2026).
 *
 * What the founder met in production: he signed in with his passkey and was signed out again at once, and every
 * reload asked for the passkey again, while the twelve hour cookie sat in the browser and the server answered every
 * request with it. A funder who reloads, changes tab, or comes back from the card page was losing the account in the
 * middle of the money path.
 *
 * These are the rules that keep it fixed. The screens are React, so what is checked here is the decision behind them
 * and the wiring that carries it, rather than a rendering.
 */

const A = "0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376" as const;
const B = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761" as const;

test("a reload keeps the account, because the server still names it", () => {
  // This is a page that has just loaded: no key in memory, a cookie the server accepts.
  assert.equal(announcedAccount(undefined, A), A);
  assert.equal(sessionReach(undefined, A), "reading");
  // And the passkey opening later changes nothing about who it is.
  assert.equal(announcedAccount(A, A), A);
  assert.equal(sessionReach(A, A), "signing");
});

test("nothing is announced when the two sides name different accounts", () => {
  assert.equal(announcedAccount(B, A), undefined, "a key that signs as somebody else is not this session");
  assert.equal(sessionReach(B, A), "signed-out");
});

test("the page asks the server who it is at load, without a passkey", () => {
  const provider = readFileSync("src/account/provider.tsx", "utf8");
  const atLoad = provider.slice(provider.indexOf("useEffect("), provider.indexOf("const address ="));
  assert.match(atLoad, /currentServerSession\(\)/, "the load asks the server for the session");
  assert.doesNotMatch(atLoad, /signIn|createAccount|passkey/i, "and asks for no passkey to do it");
});

test("every money path opens the passkey at the signature, and none assumes it is already open", () => {
  for (const screen of [
    "app/components/PayGift.tsx",
    "app/components/GiftPage.tsx",
    "app/components/CashOut.tsx",
  ]) {
    const source = readFileSync(screen, "utf8");
    assert.match(source, /ensureSigner\(\)/, `${screen} opens the signing session where it signs`);
    assert.doesNotMatch(source, /mera\.currentAccount\(\)/, `${screen} must not reach for a key that a load has lost`);
  }
});

test("Me says what is true of each state, and promises no signing window that is not open", () => {
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /reach === "signing" && until \? W\.signedInUntil\(until\)/, "the countdown belongs to the signing session");
  assert.match(me, /reach === "signed-out" \? W\.signedOut : W\.signedIn/);
  assert.match(me, /reach === "reading" \? <p className=\{HELP\}>\{W\.passkeyWhenMoneyMoves\}<\/p> : null/);
  assert.equal(ME.signedIn, "Signed in on this device.");
  assert.match(ME.passkeyWhenMoneyMoves, /asked again the moment money moves/);
  // The sentence with a time in it may only be said while there is a time: it is about the signing session.
  assert.match(ME.signedInUntil("11:19 PM"), /until 11:19 PM/);
});

test("the signer never signs as an account the server has not accepted", () => {
  const provider = readFileSync("src/account/provider.tsx", "utf8");
  const opener = provider.slice(provider.indexOf("const ensureSigner"), provider.indexOf("const value = useMemo"));
  assert.match(opener, /account\.address !== serverSessionFor/, "a different passkey signs the browser in again as that account");
  assert.match(opener, /signInToServer\(account\)/);
  assert.match(opener, /setServerSessionFor\(account\.address\)/);
});
