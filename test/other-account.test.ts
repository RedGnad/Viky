import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ACCOUNT_DOOR, ME, OTHER_ACCOUNT } from "../src/sentences";

/**
 * "Other account" opens the account's door over Me without closing the session (the founder, 9 Oct 2026): another
 * account is chosen or made there, the session changes only when the other account opens, and closing the sheet
 * leaves everything as it was. What runs in a browser is test/browser/other-account.spec.ts; this holds the order of
 * the code that makes it true.
 */
const mera = readFileSync("src/account/mera.ts", "utf8");
const provider = readFileSync("src/account/provider.tsx", "utf8");
const me = readFileSync("app/kit/Me.tsx", "utf8");
const sheet = readFileSync("app/kit/OtherAccount.tsx", "utf8");

test("the press on Me opens the sheet and does nothing else", () => {
  const act = me.slice(me.indexOf("<Act name={W.otherAccount}"), me.indexOf("<InstallAct />"));
  assert.match(act, /onPress=\{\(\) => setChoosing\(true\)\} data-decide="other-account"/);
  assert.match(me, /<OtherAccountSheet open=\{choosing\} onClose=\{\(\) => setChoosing\(false\)\} \/>/);
  // The old way out is not Me's any more: it closed the session and let go of the device's passkey at the press.
  assert.doesNotMatch(me, /useAnotherAccount|toAnotherAccount|askForTheDoor/);
});

test("the other account's passkey is asked beside the open one, and nothing of this page changes until it is kept", () => {
  const beside = mera.slice(mera.indexOf("export async function openBeside"), mera.indexOf("* The passkey evaluated under another salt"));
  // No passkey is named, so the device offers every account it holds for Viky; a new one is made as everywhere else.
  assert.match(beside, /const result = await askPasskey\(undefined\);/);
  assert.match(beside, /const created = await makePasskey\(""\);/);
  assert.match(beside, /if \(make && !accountsAreMadeOn\(window\.location\.hostname\)\) throw accountError\("MADE_ELSEWHERE"\);/);
  // Before one of its two ways of being kept, nothing is remembered and no session is taken.
  const asked = beside.slice(0, beside.indexOf("return {"));
  assert.doesNotMatch(asked.replace(/const rememberTheirs = [\s\S]*?\n  \};/, ""), /rememberCredential\(|rememberKeyKept\(|takeSession\(|closeAccountSession\(|notify\(/);
  // Taken, it is this page's account; remembered, it is told to no screen and its key is zeroed; dropped, it is zeroed.
  assert.match(beside, /take: \(\) => \{[\s\S]*?const address = takeSession\(opened, candidate\);\s+rememberTheirs\(false\);/);
  assert.match(beside, /remember: \(\) => \{\s+rememberTheirs\(true\);\s+opened\.end\(\);\s+\},/);
  assert.match(beside, /drop: \(\) => \{\s+opened\.end\(\);[\s\S]*?if \(consentIsTheirs\) endConsentKey\(\);\s+\},/);
  // The consent key that stands is never another account's.
  assert.match(beside, /if \(!consentIsTheirs && account\?\.address !== candidate\.address\) endConsentKey\(\);\s+const address = takeSession/);
  // The two ceremonies are still written once each, whatever asks for them.
  assert.equal(mera.match(/createPasskeyWithPrfOutput\(\{/g)?.length, 1);
  assert.equal(mera.match(/getPasskeyPrfOutput\(\{ rpId: relyingPartyId\(\), credential, webAuthnClient: ceremonyClient\(\) \}\)/g)?.length, 1);
});

test("the browser becomes the other account's only once the server has taken it, and a failure changes nothing", () => {
  const way = provider.slice(provider.indexOf("openAnotherAccount: async ({ make = false } = {}) => {"), provider.indexOf("clearError: () => setError(undefined),"));
  assert.ok(way.length > 0);
  // The session is not closed, the device's passkey is not let go of, and the landing is asked for nothing.
  assert.doesNotMatch(way, /signOutOfServer|forgetCredential|askForTheDoor|mera\.signOut/);
  // In order: the passkey, the server, and only then the other tabs, the device's memory and Home as a new document.
  const order = ["await withTimeout(asked, CEREMONY_TIMEOUT_MS);", "await withTimeout(signInToServer(beside.account), SERVER_TIMEOUT_MS);", "return moveOver(beside);"].map((step) => way.indexOf(step));
  assert.ok(order.every((at) => at >= 0) && order.every((at, i) => i === 0 || at > order[i - 1]), `in that order: ${order}`);
  const move = way.slice(way.indexOf("const moveOver ="), way.indexOf("try {"));
  const moved = ["movingOver.current = true;", "tellOtherTabsSignedOut();", "theirs.remember();", 'window.location.assign("/");'].map((step) => move.indexOf(step));
  assert.ok(moved.every((at) => at >= 0) && moved.every((at, i) => i === 0 || at > moved[i - 1]), `in that order: ${moved}`);
  // The passkey of the account already here opens nothing else: it is taken as a sign-in is, and the server is not asked.
  assert.match(way, /if \(beside\.account\.address\.toLowerCase\(\) === address\?\.toLowerCase\(\)\) \{\s+beside\.take\(\);\s+setStatus\("idle"\);\s+return "same";/);
  // A failure lets go of the key that answered, a late one included, and is thrown for the sheet alone.
  assert.match(way, /if \(beside\) beside\.drop\(\);\s+else void asked\.then\(\(late\) => late\.drop\(\), \(\) => undefined\);\s+setStatus\("idle"\);\s+throw toAccountError\(caught\);/);
  assert.doesNotMatch(way, /setError\(/, "no other screen is told");
  // An answer lost on the way back is not a refusal: the server is asked who this browser is now.
  assert.match(way, /const now = await currentServerSession\(\);\s+if \(now && now\.account\.toLowerCase\(\) === beside\.account\.address\.toLowerCase\(\)\) return moveOver\(beside\);/);
  // The page that leaves hears what it tells the other tabs, and is not redrawn for nobody on the way.
  assert.match(provider, /const serverForgot = useCallback\(\(\) => \{\s+if \(movingOver\.current\) return;/);
});

test("the sheet: signing in first, making an account second, who may make one, and what a press came to", () => {
  assert.equal(ME.otherAccount, "Other account");
  assert.equal(OTHER_ACCOUNT.stays, "This account stays signed in until the other one opens.");
  assert.equal(OTHER_ACCOUNT.choose, "Sign in to another account");
  assert.equal(OTHER_ACCOUNT.same, "That is the account you are signed in to.");
  assert.equal(ACCOUNT_DOOR.newAccount, "Create a new account");
  assert.match(sheet, /<Sheet\s+open=\{open\}\s+title=\{ME\.otherAccount\}\s+help=\{W\.stays\}/);
  const choose = sheet.indexOf('onPress={() => void ask("choose")}');
  const make = sheet.indexOf('onPress={() => void ask("make")}');
  assert.ok(choose > 0 && choose < make, "a press by mistake on the first changes nothing");
  // One sun button: the second is the outlined one.
  assert.equal(sheet.match(/<Button /g)?.length, 2);
  assert.match(sheet, /<Button look="secondary"[^>]*onPress=\{\(\) => void ask\("make"\)\}/);
  // "18 or older" under the button that makes an account, here as at every door (test/adults-only.test.ts).
  assert.ok(sheet.indexOf("{ACCOUNT_DOOR.newAccount}") < sheet.indexOf("{ACCOUNT_DOOR.adult}"));
  // On a computer, which choice of the system's sheet follows the person; and no account is made off Viky's own address.
  assert.match(sheet, /useOnAComputer\(\)/);
  assert.match(sheet, /\{ACCOUNT_DOOR\.onAComputer\}/);
  assert.match(sheet, /\{madeHere \? \(/);
  assert.match(sheet, /\{ACCOUNT_DOOR\.madeOnTheMainSite\}/);
  // The other account opened: the button keeps saying it works until Home is painted.
  assert.match(sheet, /if \(\(await openAnotherAccount\(\{ make: way === "make" \}\)\) === "other"\) return;/);
});
