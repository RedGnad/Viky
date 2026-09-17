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
