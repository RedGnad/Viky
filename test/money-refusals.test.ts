// On a screen about money, a refusal that has a sentence of its own is read in that sentence (the founder, 12 Oct
// 2026). He sent to another of his accounts and read "Viky could not finish this, and nothing was taken." where the
// route had said why. Held here: every refusal a route of "Spend or withdraw" can give is in one of three lists, the
// two he named pass, too many attempts are named where the route gives them no code, and the smallest amount Viky
// sends is said under the field before the press, with the figure the send route itself holds.

import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { NOT_FINAL_YET } from "../src/gift-api";
import { formatAusd } from "../src/gift-reader";
import { NO_SENTENCE_OF_ITS_OWN, routeSaysIt, SAID_BY_THE_ROUTE, SAID_BY_THE_SCREEN } from "../src/money-refusals";
import { DEFAULT_RELAY_CEILINGS, tooSmallToRelay } from "../src/relay-ceiling";
import { CASH_OUT, RELAY_CEILING } from "../src/sentences";

const read = (path: string) => readFileSync(path, "utf8");
/** The routes "Spend or withdraw" calls, and the modules they refuse through. */
const ROUTES = [
  "app/api/send/route.ts",
  "app/api/send/record/route.ts",
  "app/api/gift/withdraw/route.ts",
  ...globSync("app/api/exit/*/route.ts"),
  ...globSync("app/api/fund/**/route.ts"),
  "src/exit-ticket.ts",
  "src/exit-quote.ts",
  "src/exit-relay.ts",
  "src/relay-free-checks.ts",
];

test("every refusal a route of the money screen can give is in one of three lists, and in one only", () => {
  const found = new Map<string, string>();
  for (const file of ROUTES) {
    for (const match of read(file).matchAll(/new (?:GiftApiError|RequestError)\(\s*"([A-Z_]{3,})"/g)) found.set(match[1]!, file);
  }
  assert.ok(found.size >= 25, `${found.size} refusals read from ${ROUTES.length} files`);
  for (const [code, file] of found) {
    const lists = [SAID_BY_THE_ROUTE, SAID_BY_THE_SCREEN, NO_SENTENCE_OF_ITS_OWN].filter((list) => list.has(code)).length;
    assert.equal(lists, 1, `${code} (${file}) is in ${lists} of the three lists: decide whether its sentence is the route's, the screen's, or none`);
  }
  for (const code of SAID_BY_THE_ROUTE) assert.ok(!SAID_BY_THE_SCREEN.has(code) && !NO_SENTENCE_OF_ITS_OWN.has(code), code);
  // What has no sentence of its own really has none: the routes say "Please try again" or a word for a program.
  for (const code of NO_SENTENCE_OF_ITS_OWN) {
    const said = ROUTES.flatMap((file) => [...read(file).matchAll(new RegExp(`new GiftApiError\\(\\s*"${code}",\\s*"([^"]+)"`, "g"))].map((match) => match[1]!));
    for (const sentence of said) assert.match(sentence, /^(Please try again\.?|Unknown gift)$/, `${code}: ${sentence}`);
  }
});

test("the two the founder named are read in the route's own sentence, with what else says a fact", () => {
  assert.equal(routeSaysIt("TOO_SMALL_TO_RELAY"), true);
  assert.equal(routeSaysIt("RELAY_CEILING"), true);
  // The sentences themselves, as the routes throw them.
  const admission = read("src/relay-admission.ts");
  assert.match(admission, /throw new GiftApiError\("TOO_SMALL_TO_RELAY", kind === "send" \? W\.tooSmallToSend\(least\) : W\.tooSmallToTakeOut\(least\), 409\);/);
  assert.match(admission, /code: "RELAY_CEILING" \| "TOP_UP_TOO_SOON"/);
  assert.equal(RELAY_CEILING.tooSmallToSend("$1.00"), "Viky sends $1.00 or more at a time. Below that, send everything you have at once.");
  assert.equal(RELAY_CEILING.hour("account", 12), "That is as many actions as Viky sends for one account in an hour. Try again in 12 minutes.");
  // Sent and not known to be final: "nothing was taken" would not be true, and the route's sentence says neither.
  assert.equal(routeSaysIt("NOT_FINAL_YET"), true);
  assert.doesNotMatch(NOT_FINAL_YET, /nothing was (taken|changed)/i);
  assert.match(CASH_OUT.failures.other, /nothing was taken/);
  // A code nobody listed, or none at all, is not passed: the server's prose is never shown unread.
  assert.equal(routeSaysIt("SOMETHING_NEW"), false);
  assert.equal(routeSaysIt(undefined), false);
  // The screen asks the list before anything else, on the send to another account, on the send to a payout service,
  // and where the gifts' part is taken out first.
  const screen = read("app/components/CashOut.tsx");
  assert.match(screen, /if \(error instanceof ApiError\) \{\s+\/\/ These carry the figures or the fact the route measured, so its sentence is the true one\.\s+if \(routeSaysIt\(error\.code\)\) return error\.message;\s+switch \(error\.code\) \{/);
  assert.match(screen, /setProblem\(\{ where: "own", text: refusalText\(error, null\) \}\);/);
  assert.match(screen, /setProblem\(\{ where: "send", text: refusalText\(error, chosen\)/);
  assert.match(screen, /where: "gather", text: error instanceof ApiError && routeSaysIt\(error\.code\) \? error\.message : readying \? W\.notReadied : W\.gatherFailed/);
  // The sentences the withdraw routes pass end as sentences do.
  for (const file of ["app/api/gift/withdraw/route.ts", "src/milestone-routes.ts"]) {
    const source = read(file);
    assert.match(source, /"NOT_YOURS", "Only the person the gift is for can take it\.", 403/, file);
    assert.match(source, /"NOT_ENOUGH_EARNED", "That is more than what is yours so far\.", 409/, file);
    assert.match(source, /"INVALID_DESTINATION", "That destination is not valid\."/, file);
  }
});

test("too many attempts are named: a route that says so with no code is not taken for a failure", () => {
  // Five routes of this screen answer 429 with their sentence and no code; the browser names it for all of them.
  const bare = ROUTES.filter((file) => /\{ error: "Too many attempts\. Try again shortly\." \}, \{ status: 429/.test(read(file)));
  assert.ok(bare.length >= 4, `${bare.length} routes answer too many attempts with no code`);
  assert.match(read("src/client/api.ts"), /code: failure\.code \?\? \(response\.status === 401 \? "SIGN_IN_REQUIRED" : response\.status === 429 \? "RATE_LIMITED" : "FAILED"\),/);
  assert.equal(routeSaysIt("RATE_LIMITED"), true);
});

test("the smallest amount Viky sends is said under the field before the press, with the send route's own figure", () => {
  // The rule, which the screen and the route share: under the smallest amount, unless it is everything there is.
  const least = DEFAULT_RELAY_CEILINGS.minimumUnits;
  assert.equal(formatAusd(least), "$1.00");
  assert.equal(tooSmallToRelay(500_000n, 5_000_000n, least), true);
  assert.equal(tooSmallToRelay(1_000_000n, 5_000_000n, least), false);
  assert.equal(tooSmallToRelay(660_000n, 660_000n, least), false, "everything there is always leaves");
  // The figure is the server's, from the setting the send route reads, never a number typed into the screen.
  assert.match(read("app/api/exit/open/route.ts"), /sendsAtLeast: relayCeilings\(\)\.minimumUnits\.toString\(\)/);
  assert.match(read("app/api/send/route.ts"), /assertNotTooSmall\("send", value, held\);/);
  const screen = read("app/components/CashOut.tsx");
  assert.match(screen, /if \(answer\.sendsAtLeast !== undefined\) least = BigInt\(answer\.sendsAtLeast\);/);
  assert.match(screen, /const ownTooSmall = ownLeaving !== undefined && sendsAtLeast !== null && tooSmallToRelay\(ownLeaving, held\(ownCoin\), sendsAtLeast\);/);
  // The sentence that exists already, and the press held back while it stands.
  assert.match(screen, /data-too-small-to-send="">\s+\{RELAY_CEILING\.tooSmallToSend\(formatAusd\(sendsAtLeast\)\)\}/);
  assert.match(screen, /ownSending\.units === undefined \|\| ownTooSmall\} className=\{PRIMARY_BUTTON\}/);
  assert.doesNotMatch(screen, /1\.00 or more|1_000_000n/, "no figure of the smallest amount is typed into the screen");
});
