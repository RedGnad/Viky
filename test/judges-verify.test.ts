import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JUDGES } from "../src/sentences";

/**
 * The one thing on this site a stranger is invited to do instead of believing us (U4's leftover, 18 Sep 2026).
 *
 * The enclave was costed and set aside, so nothing here may imply that the signing key is out of our hands. What the
 * page says instead is the plain thing: the key is ours, the owner can replace it, and here is how you check a
 * reading had a proof behind it. These tests hold that sentence, the command, and the fact that both halves of the
 * answer are said, the half that proves and the half that does not.
 */

const page = readFileSync("app/judges/JudgesVerify.tsx", "utf8");
const readme = readFileSync("README.md", "utf8");
/** Where the check is explained in full since 5 Oct 2026: the README keeps the command, on its first screen. */
const verification = readFileSync("docs/VERIFICATION.md", "utf8");

/** What the page actually says: comments explain the code to us, they are not read by anybody on the site. */
const said = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\s+/g, " ");

test("the note is the founder's, and it promises nothing about where the key is held", () => {
  assert.equal(JUDGES.ourKey, "The key that signs is ours. The owner can replace it.");
  assert.match(JUDGES.andSo, /how anybody checks, without us, that a reading really had a proof behind it/);
  assert.match(page, /J\.ourKey/);
  assert.match(page, /J\.andSo/);
  // Nothing a person reads may say the key sits in an enclave: it does not.
  for (const source of [said(page), readme, verification, JSON.stringify(JUDGES)]) {
    assert.doesNotMatch(source, /enclave/i, "no page promises an enclave");
  }
});

test("the command can be copied, and it is the whole of it from nothing", () => {
  assert.match(page, /<CopyLine/, "the command is offered with a way to copy it");
  assert.match(page, /git clone https:\/\/github\.com\/RedGnad\/Viky\.git/);
  assert.match(page, /pnpm install/);
  assert.match(page, /pnpm verify:day/);
  assert.match(JUDGES.fromNothing, /No key, no account, no permission from us/);
  const copy = readFileSync("app/kit/CopyLine.tsx", "utf8");
  assert.match(copy, /clipboard\.writeText/);
  assert.match(copy, /setCopied\("refused"\)/, "a browser that refuses the copy still says something");
});

test("both halves of the answer are on the page: what it proves and what it does not", () => {
  const words = said(page);
  assert.match(words, /What a pass proves/);
  assert.match(words, /What it does not prove/);
  assert.match(words, /belongs to the person the gift is for/);
  assert.match(words, /a human rather than a script/);
});

test("the check is documented where somebody cloning the repository would look", () => {
  // The command is on the README's first screen, with both halves of what it says in a sentence each.
  assert.match(readme, /git clone https:\/\/github\.com\/RedGnad\/Viky\.git && cd Viky && pnpm install && pnpm verify:day/);
  assert.match(readme, /`pnpm verify:day` proves that the source's own servers answered/);
  assert.match(readme, /It does not prove whose account it is, nor that a human did the work/);
  assert.match(readme, /\]\(docs\/VERIFICATION\.md#check-a-credited-day-yourself\)/);
  // And the whole of it is one link away.
  assert.match(verification, /## Check a credited day yourself/);
  assert.match(verification, /git clone https:\/\/github\.com\/RedGnad\/Viky\.git/);
  assert.match(verification, /\*\*What it proves\*\*/);
  assert.match(verification, /\*\*What it does not prove\*\*/);
  assert.match(verification, /The key that signs is ours and the owner can replace it/);
});

test("it is the first thing on the judges page, before anything we ask to be believed", () => {
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  const verify = judges.indexOf("<JudgesVerify />");
  const conditions = judges.indexOf("<JudgesConditions />");
  const reliability = judges.indexOf("<JudgesReliability />");
  assert.ok(verify > 0 && conditions > 0 && reliability > 0);
  assert.ok(verify < conditions && verify < reliability, "the check comes before the claims it lets you test");
});
