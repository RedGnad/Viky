import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { morningPayload, morningSentence, morningStep, morningSubject } from "../src/morning-message";
import { MORNING } from "../src/sentences";

/**
 * What a phone says when nobody opened the app, and when the button may ask for permission at all.
 *
 * The sentences are the product's promise in one line: the person learns the day's outcome without a gesture. So each
 * one has to be true, short, and free of anything the product never says: a name the gift does not carry, a source,
 * a word about coins or networks.
 */

const BOTH = { recipientName: "Léa", funderName: "Maman" };
const NEITHER = { recipientName: null, funderName: null };
const WORDS = { yesterday: "yesterday's lesson" };

test("the recipient hears what happened to yesterday, and that today still counts", () => {
  assert.equal(morningSentence("recipient", { kind: "day", outcome: "earned", amount: "$3.57" }, BOTH), "Yesterday counted. $3.57 is yours.");
  assert.equal(morningSentence("recipient", { kind: "day", outcome: "returned", amount: "$3.57" }, BOTH), "Yesterday went back to Maman. Today still counts.");
  // A gift made before the names existed says the same thing without inventing one.
  assert.equal(morningSentence("recipient", { kind: "day", outcome: "returned", amount: "$3.57" }, NEITHER), "Yesterday went back. Today still counts.");
});

test("the funder hears what the person did, in the register's words, never in a named source", () => {
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$3.57" }, BOTH, WORDS), "Léa did yesterday's lesson. $3.57 is theirs.");
  // Without the register's word the sentence still stands, and still names nothing.
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$3.57" }, BOTH), "Léa counted yesterday. $3.57 is theirs.");
  assert.equal(morningSentence("funder", { kind: "day", outcome: "earned", amount: "$3.57" }, NEITHER), "Yesterday counted. $3.57 is theirs.");
  assert.equal(morningSentence("funder", { kind: "day", outcome: "returned", amount: "$3.57" }, BOTH, WORDS), "Yesterday came back to you: $3.57.");
});

test("a milestone reached and a milestone expired are one sentence each, on both sides", () => {
  assert.equal(morningSentence("recipient", { kind: "reached", amount: "$60.00" }, BOTH), "You reached it. $60.00 is yours.");
  assert.equal(morningSentence("funder", { kind: "reached", amount: "$60.00" }, BOTH), "Léa reached it. $60.00 is theirs.");
  assert.equal(morningSentence("funder", { kind: "reached", amount: "$60.00" }, NEITHER), "It is reached. $60.00 is theirs.");
  assert.equal(morningSentence("recipient", { kind: "expired", amount: "$60.00" }, BOTH), "The time is up. $60.00 went back to Maman.");
  assert.equal(morningSentence("recipient", { kind: "expired", amount: "$60.00" }, NEITHER), "The time is up. $60.00 went back.");
  assert.equal(morningSentence("funder", { kind: "expired", amount: "$60.00" }, BOTH), "The time is up. $60.00 came back to you.");
});

test("a name is used only when the gift carries one, on every sentence there is", () => {
  const blank = { recipientName: "   ", funderName: "" };
  for (const side of ["recipient", "funder"] as const) {
    for (const news of [
      { kind: "day", outcome: "earned", amount: "$1.00" },
      { kind: "day", outcome: "returned", amount: "$1.00" },
      { kind: "reached", amount: "$1.00" },
      { kind: "expired", amount: "$1.00" },
    ] as const) {
      const said = morningSentence(side, news, blank, WORDS);
      assert.doesNotMatch(said, /undefined|null|\s{2}|^\s|\s$/, `${side} ${news.kind}: ${said}`);
      assert.match(said, /^[A-Z].*\.$/, `${side} ${news.kind}: ${said}`);
    }
  }
});

test("no sentence a phone shows says a word the product never says", () => {
  // The same words the whole product refuses (scripts/check-consumer-words.ts), checked where nobody sees a screen.
  const banned = /\b(wallet|gas|blockchain|seed|token|crypto|transaction hash|AUSD|dollars|euros)\b/i;
  const said = JSON.stringify(MORNING);
  assert.doesNotMatch(said, banned, said);
});

test("the payload carries the sentence, a title that names nobody, and the gift's own page", () => {
  const payload = morningPayload("42", "recipient", { kind: "day", outcome: "earned", amount: "$3.57" }, BOTH);
  assert.equal(payload.title, "Viky");
  assert.equal(payload.message, "Yesterday counted. $3.57 is yours.");
  assert.equal(payload.url, "/g/42");
  assert.doesNotMatch(payload.title, /Léa|Maman/, "a lock screen shows the title to whoever is looking");
});

test("a day is its own subject, so one day is told about once", () => {
  assert.equal(morningSubject({ kind: "day", outcome: "earned", amount: "" }, 20_709), "day:20709");
  assert.notEqual(morningSubject({ kind: "day", outcome: "earned", amount: "" }, 20_709), morningSubject({ kind: "day", outcome: "returned", amount: "" }, 20_710));
  assert.equal(morningSubject({ kind: "reached", amount: "" }), "reached");
  assert.equal(morningSubject({ kind: "expired", amount: "" }), "expired");
});

test("an iPhone outside the Home Screen is told how to install, before anything is called impossible", () => {
  const iphone = { supported: false, onIOS: true, standalone: false, permission: "default", subscribed: false } as const;
  assert.equal(morningStep(iphone), "install");
  // Installed, the same iPhone has push and is asked like any other browser (webkit.org, 16 Feb 2023).
  assert.equal(morningStep({ ...iphone, supported: true, standalone: true }), "ask");
  assert.equal(morningStep({ ...iphone, supported: true, standalone: true, subscribed: true }), "on");
});

test("a browser that refused the permission is not asked again, and one that cannot is not offered", () => {
  const desktop = { supported: true, onIOS: false, standalone: false, permission: "default", subscribed: false } as const;
  assert.equal(morningStep(desktop), "ask");
  assert.equal(morningStep({ ...desktop, permission: "denied" }), "refused");
  assert.equal(morningStep({ ...desktop, permission: "granted", subscribed: true }), "on");
  assert.equal(morningStep({ ...desktop, supported: false }), "unsupported");
});

test("nothing asks for the permission except a press", () => {
  // iOS grants push only in direct response to a press, so a request on load is refused there and rude everywhere.
  const component = readFileSync("app/kit/MorningMessage.tsx", "utf8");
  const asks = component.slice(component.indexOf("requestPermission"));
  assert.ok(component.includes("const start = useCallback"), "the request lives in the button's own callback");
  assert.doesNotMatch(component.slice(0, component.indexOf("const start")), /requestPermission/, "nothing asks before the press");
  assert.ok(asks.length > 0);
});

/**
 * Being told, offered in the open after the first thing that worked (the founder, 1 Oct 2026, the audit's P-31). It
 * sat in the fold "How this is checked", was never offered to the funder, a gift had or not offered nothing at all,
 * and on an iPhone it took a press to learn that installing came first.
 */
test("the messages are offered under the card and under the funder's link, never in a fold, and only behind an account", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  const fold = page.slice(page.indexOf("const checked = ("), page.indexOf("const proof ="));
  assert.doesNotMatch(fold, /MorningMessage|ReachAlert/, "nothing of it inside the fold");
  const open = page.slice(page.indexOf("<GiftLive"));
  assert.match(open, /\{daily && status\.opened && !gift\.finished && !gift\.cancelled \? <MorningMessage giftId=\{giftId\} yours=\{mine \|\| readerIsFunder\} \/> : null\}/);
  assert.match(open, /hadOrNot && status\.opened && !gift\.finished && !gift\.cancelled && hadOrNot\.review\?\.status !== "pending" && \(mine \|\| readerIsFunder\)/);
  assert.match(open, /<ReachAlert giftId=\{giftId\} target="" yours=\{mine\} hadOrNot \/>/);
  // Under the link the funder has just been given, the three shapes of gift each with their own.
  const link = readFileSync("app/components/PayGift.tsx", "utf8");
  const made = link.slice(link.indexOf("W.made.findItAgain"), link.indexOf("W.made.nextTitle"));
  assert.match(made, /<MorningMessage giftId=\{made\.giftId\} yours \/>/);
  assert.match(made, /<ReachAlert giftId=\{made\.giftId\} target="" yours=\{false\} hadOrNot \/>/);
  assert.match(made, /<ReachAlert giftId=\{made\.giftId\} target=\{String\(made\.target\)\} yours=\{false\} \/>/);
  // An iPhone outside the Home Screen: the sentence and its two steps, in full, and no button that could grant nothing.
  const component = readFileSync("app/kit/MorningMessage.tsx", "utf8");
  const install = component.slice(component.indexOf('if (step === "install") {'), component.indexOf('data-told="ask"'));
  assert.match(install, /<p className=\{HELP\}>\{W\.installFirst\}<\/p>\s+<p className=\{HELP\}>\{ME\.installHow\}<\/p>/);
  assert.doesNotMatch(install, /<button/);
  assert.match(component, /\{step === "install" \? <p className=\{HELP\}>\{ME\.installHow\}<\/p> : null\}/, "the reach alert says the steps too");
  // Nobody without an account: the route refuses, and neither place is drawn for them.
  assert.match(readFileSync("app/api/gift/[id]/notify/route.ts", "utf8"), /SIGN_IN_REQUIRED/);
});

test("a gift had or not tells its subscribers when it is reached, from every request that reaches one", () => {
  // The sentence offered: "Get a message when it is theirs, or when the time is up."
  const live = readFileSync("src/morning-send-live.ts", "utf8");
  assert.match(live, /export async function tellReached\(giftId: string\): Promise<void> \{\s+await tellAboutMilestone\(giftId, "reached", liveTellingDeps\(\)\)\.catch\(\(\) => 0\);/);
  for (const route of ["app/api/gift/[id]/certificate/route.ts", "app/api/wca/prove/route.ts", "app/api/marathon/prove/route.ts"]) {
    assert.match(readFileSync(route, "utf8"), /if \(outcome\.kind === "reached"\) await tellReached\(/, route);
  }
  // A proof shown: only when the contract said the gift was reached by it, not when it only started one.
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /if \(result\.arrived\) await tellReached\(result\.giftId\);/);
  assert.match(readFileSync("src/shown-verification.ts", "utf8"), /arrived: proved\.happened === "reached",/);
  // Its time running out is the settling pass's to tell, as for every milestone.
  assert.match(readFileSync("src/milestone-pass.ts", "utf8"), /await tellAboutMilestone\(giftId, "expired", liveTellingDeps\(\)\);/);
});
