import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { JUDGES_CONTENTS } from "../app/judges/JudgesContents";
import { secondsBetween, TOULOUSE_PASSES } from "../src/judges-first-use";

/**
 * The judges page for a judge in a hurry (the audit of 1 Oct 2026, D-11; the founder, 2 Oct 2026): a block that says
 * the page in one minute, a list of its sections with anchors, and every section folded under its title. Nothing is
 * removed, everything folds.
 */

const read = (file: string) => readFileSync(file, "utf8");
const SOURCES = [...readdirSync("app/judges").filter((name) => name.endsWith(".tsx")).map((name) => `app/judges/${name}`), "app/components/MilestoneJudges.tsx", "app/components/JudgesAccount.tsx"];
const folds = SOURCES.flatMap((file) => [...read(file).matchAll(/<Fold id="([\w-]+)" title="([^"]+)"( open)?/g)].map((found) => ({ file, id: found[1], title: found[2], open: Boolean(found[3]) })));

test("the page opens on the minute, then the contents, then the sections", () => {
  const page = read("app/judges/page.tsx");
  const minute = page.indexOf("<JudgesMinute");
  const contents = page.indexOf("<JudgesContents />");
  const first = page.indexOf("<Fold ");
  assert.ok(minute > page.indexOf("</header>") && contents > minute && first > contents, "the minute, the contents, then the first section");
});

test("every section is a fold with an anchor, the contents list names each one once, and no link leads nowhere", () => {
  // No section is left that is not a fold: the judges page's blocks all go through app/judges/Fold.tsx.
  for (const file of SOURCES.filter((name) => !/Fold|Minute|Contents/.test(name))) assert.doesNotMatch(read(file), /<section/, `${file} still draws a section of its own`);
  const ids = [...new Set(folds.map((fold) => fold.id))].sort();
  assert.deepEqual([...JUDGES_CONTENTS.map((entry) => entry.id)].sort(), ids, "the contents and the folds name the same sections");
  assert.equal(new Set(JUDGES_CONTENTS.map((entry) => entry.id)).size, JUDGES_CONTENTS.length);
  // A block drawn in two states (read, or not read) carries one id and one title in both.
  for (const id of ids) assert.equal(new Set(folds.filter((fold) => fold.id === id).map((fold) => fold.title)).size, 1, id);
  // The links inside the minute block lead to sections that exist.
  for (const anchor of read("app/judges/JudgesMinute.tsx").matchAll(/href="#([\w-]+)"/g)) assert.ok(ids.includes(anchor[1]), `#${anchor[1]}`);
  // The order of the list is the order of the page.
  const page = read("app/judges/page.tsx");
  const order = ["how to try it", "<JudgesWhoUsed", 'title="Network"', "<JudgesVerify", "<JudgesConditions", "<JudgesReliability", "<JudgesContracts", "<JudgesEarlyGifts", "<JudgesIndex", "<JudgesAgora", "<JudgesMera", 'title="How money comes in"', 'title="How money goes out"', 'title="How a day is read"', 'title="Risks and holes', "<MilestoneJudges", "<JudgesAccount"].map((mark) => page.indexOf(mark));
  assert.ok(order.every((at) => at > 0), "every section is on the page");
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.deepEqual(JUDGES_CONTENTS.map((entry) => entry.id), ["try", "who", "network", "verify", "conditions", "reliability", "contracts", "first-gifts", "index", "agora", "mera", "money-in", "money-out", "reading", "risks", "milestone", "account"]);
});

test("every section of detail is folded: only the judge's own path and their own account open by themselves", () => {
  assert.deepEqual([...new Set(folds.filter((fold) => fold.open).map((fold) => fold.id))].sort(), ["account", "try"]);
  // The long passages are folded inside their section too: the gift by gift list, and those of AUSD and of Mera.
  assert.match(read("app/judges/JudgesWhoUsed.tsx"), /<SubFold title=\{`Gift by gift \(\$\{usage\.gifts\}\)`\}>/);
  const agora = read("app/judges/JudgesAgora.tsx");
  for (const title of ["What its issuer can do to a gift", "A plain send, with no gift", "What a gift costs, who pays it, and how fast it settles"]) assert.ok(agora.includes(`<SubFold title="${title}">`), title);
  const mera = read("app/judges/JudgesMera.tsx");
  for (const title of ["The seconds, and what they are", "Where the key is tied on Monad, and what the anchor is not"]) assert.ok(mera.includes(`<SubFold title="${title}">`), title);
  // What a hurried judge is meant to run stays in the open: the command is outside the fold.
  assert.ok(mera.indexOf('<CopyLine command="pnpm verify:consent" />') > mera.lastIndexOf("</SubFold>"));
});

test("a fold is a plain details under the section's own heading, so it opens without a script and is found by a search", () => {
  const fold = read("app/judges/Fold.tsx");
  assert.match(fold, /<section id=\{id\} className="judges-section">\s*<details open=\{open\}>\s*<summary className="gift-fold-name">\s*<h2 className=\{TITLE\}>\{title\}<\/h2>/);
  assert.doesNotMatch(fold, /"use client"|useState|useEffect/);
  // The contents list is anchors: a link leads to its section with no script, and with one it opens it.
  const contents = read("app/judges/JudgesContents.tsx");
  assert.match(contents, /<a className="underline" href=\{`#\$\{entry\.id\}`\} onClick=\{\(\) => openSection\(entry\.id\)\}>/);
  assert.match(contents, /const named = decodeURIComponent\(window\.location\.hash\.slice\(1\)\);/);
});

test("the minute says what Viky is, for whom, who used it, where it runs, why Monad in three lines and one command, and adds no figure of its own", () => {
  const minute = read("app/judges/JudgesMinute.tsx").replace(/\s+/g, " ");
  for (const label of ["What it is", "Who it is for", "Who has used it", "Where it runs", "Why Monad", "One command"]) assert.ok(minute.includes(`<dt className={MUTED}>${label}</dt>`), label);
  // Who it is for is the README's own sentence, so the two never say two things.
  const readme = read("README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes("the person who pays for somebody else's effort from a distance and cannot check it themselves"));
  assert.ok(minute.includes("The person who pays for somebody else&apos;s effort from a distance and cannot check it themselves"));
  // The figures of use are counted, the same count as the section's; the figures of Monad are the measured ones.
  assert.ok(minute.includes("const usage = index && credited ? usageOf(index.gifts, founderAccounts(operatorAccounts()), credited) : null;"));
  assert.ok(minute.includes("{monWords(creditedDayMon())}") && minute.includes("{BLOCK_TIME.seconds} s") && minute.includes("{FINALITY_GAP.fewestBlocks} or {FINALITY_GAP.mostBlocks} blocks"));
  assert.doesNotMatch(minute, /\$\d|\d MON|\d+ gifts/, "no figure is typed into the block");
  // The three addresses are the page's own settings, and the command is one anybody can run with no key.
  const page = read("app/judges/page.tsx");
  assert.ok(page.includes("{ daily: escrowV2, milestone: milestoneV2, anchor, version: 2 }"));
  assert.ok(minute.includes('<CopyLine command={`cast call ${contracts.daily} "owner()(address)" --rpc-url ${PUBLIC_RPC_URL}`} />'));
  // Never the claims the product rules forbid.
  assert.doesNotMatch(minute, /cheaper than a bank|nobody does this|no licen[cs]e/i);
});

test("the universities are lines a judge reads in a minute, and Rome's is written once its row holds the right hash (the UI pass of 8 Oct 2026)", () => {
  const minute = read("app/judges/JudgesMinute.tsx");
  // The day's fact first (the founder, 9 Oct 2026), the first pass under it, each with the transaction that paid.
  assert.match(minute, /Toulouse, \{TOULOUSE_PASSES\.onTheFixedRule\.day\}: a student showed their enrolment, and\{" "\}\s+<a className="underline" href=\{`https:\/\/monadvision\.com\/tx\/\$\{TOULOUSE_PASSES\.onTheFixedRule\.paidTx\}`\}>\s+the gift paid\s+<\/a>\{" "\}\s+\{TOULOUSE_PASSES\.onTheFixedRule\.secondsFromSignIn\} seconds after they signed in to their university&apos;s portal, with no review\./);
  assert.match(minute, /Toulouse, \{TOULOUSE_PASSES\.first\.day\}, the first pass: a real student showed their enrolment, and\{" "\}/);
  assert.ok(minute.indexOf('data-toulouse="on-the-fixed-rule"') < minute.indexOf('data-toulouse="first"'), "the first pass stays under it");
  // Counted from the student's sign-in to their portal, not from the verification opening, which holds the time
  // they type (the founder, 10 Oct 2026). Twenty seconds is his measure on his recording of the pass, from the
  // press that sent the sign-in to the payment. It stands between what the two logged moments allow: the portal's
  // sign-in form was gone eighteen seconds before the block that paid, and the verification had opened sixty before.
  const pass = TOULOUSE_PASSES.onTheFixedRule;
  assert.equal(pass.day, "9 Oct 2026");
  assert.equal(pass.secondsFromSignIn, 20);
  assert.equal(secondsBetween(pass.opened, pass.paid), 60);
  assert.equal(secondsBetween(pass.signInFormGone, pass.paid), 18);
  assert.ok(secondsBetween(pass.signInFormGone, pass.paid) <= pass.secondsFromSignIn && pass.secondsFromSignIn < secondsBetween(pass.opened, pass.paid));
  assert.equal(pass.signInFormGone.toISOString(), "2026-10-09T12:55:09.000Z");
  assert.equal(TOULOUSE_PASSES.onTheFixedRule.opened.toISOString(), "2026-10-09T12:54:27.000Z");
  assert.equal(TOULOUSE_PASSES.onTheFixedRule.paid.toISOString(), "2026-10-09T12:55:27.000Z");
  assert.equal(TOULOUSE_PASSES.onTheFixedRule.paidTx, "0xd950295c4c3d51480496003fd6547b0fc6c3546ac0c5747d377e6259cd3277e2");
  assert.equal(TOULOUSE_PASSES.first.paidTx, "0x9c5508e83b0dd20668bb6a8c683faa047820734d6938387f8b6f516c3467c4fd");
  assert.doesNotMatch(minute, /(20|60) seconds/, "the figure is the register's");
  // The README says the same fact in the founder's sentence, with the same transaction, over the first pass.
  const readme = read("README.md");
  assert.match(readme, /\*\*Toulouse, 9 Oct 2026: a student showed their enrolment, and the gift paid 20 seconds after they signed in to\s+their university's portal, with no review\.\*\*/);
  // The three hours stay, and no number of the session is in a text anybody reads.
  assert.ok(readme.replace(/\s+/g, " ").includes("The verification opened at 12:54:27 UTC, on the rule fixed ahead of the pass, the portal's sign-in form was gone from the page at 12:55:09, and the gift paid in the block of 12:55:27"));
  assert.doesNotMatch(readme + minute, /LOGIN_INDICATORS_NOT_FOUND|session (id|number) [0-9a-f-]{8,}/i);
  assert.ok(readme.includes(`https://monadvision.com/tx/${TOULOUSE_PASSES.onTheFixedRule.paidTx}`));
  assert.ok(readme.indexOf("Toulouse, 9 Oct 2026") < readme.indexOf("The first pass, two days before"), "and the first pass stays under it");
  assert.match(readme, /Gift 1000008 on the second `MilestoneGift`, 5\.02 AUSD for staying enrolled/);
  assert.ok(minute.includes("more: each set up within two days of a first gift.</span>"));
  // Both cases (the founder, 9 Oct 2026): a rule set ahead pays the proof that fits it at once, and review is for the rest.
  assert.ok(minute.includes('<span className="block">A first proof that fits a rule set ahead for its university is paid at once.</span>'));
  assert.ok(minute.includes('<span className="block">Any other first proof is reviewed by hand, within the hour.</span>'));
  assert.ok(!minute.includes("Every university&apos;s first proof is reviewed by hand"));
  // How many more is counted as the page is served, by the thousand, never typed in.
  assert.ok(minute.includes("{countInWords(moreUniversities)} more: each set up within two days of a first gift."));
  assert.doesNotMatch(minute, /11,000/);
  const page = read("app/judges/page.tsx");
  assert.ok(page.includes("moreUniversities={portals && witnessLines ? Math.max(0, portals.listed - new Set([...witnessLines.filter((line) => line.pin).map((line) => line.portalId), ...readyOnReclaim.map((one) => one.portalId)]).size) : null}"));
  // The gift Toulouse's line speaks of is the one the README gives the three transactions of.
  assert.match(read("README.md"), /Gift 1000006 on\s+the second `MilestoneGift`, 8\.98 AUSD for staying enrolled/);
  // Rome's line (the founder, 9 Oct 2026), after Toulouse's: written from its row as it stands, so only once the row
  // holds the hash Reclaim's own library derives from the provider's published configuration, which it did not on
  // 8 Oct 2026. Its name comes from the directory's entry, never typed into the page.
  assert.doesNotMatch(minute, /Rome/);
  assert.match(minute, /\{readyOnReclaim\.map\(\(name\) => \(\s+<span className="block" key=\{name\} data-ready-on-reclaim="">\s+\{name\}: ready today, on a check approved by Reclaim\.\s+<\/span>\s+\)\)\}/);
  assert.ok(minute.indexOf('data-toulouse="first"') < minute.indexOf("{readyOnReclaim.map("));
  assert.ok(minute.indexOf("{readyOnReclaim.map(") < minute.indexOf("more: each set up within two days of a first gift."));
  assert.ok(page.includes("const readyOnReclaim = await readyOnReclaimsCheck(loadPortal);"));
  assert.ok(page.includes("readyOnReclaim={readyOnReclaim.map((one) => one.said)}"));
});

test("what a first proof meets is said in both cases: held and read, or paid on a rule fixed ahead (the audit of 8 Oct 2026)", () => {
  const page = read("app/judges/page.tsx").replace(/\s+/g, " ");
  assert.ok(page.includes("That first proof is held, never paid on its own: the operator reads what the pattern read"));
  assert.ok(page.includes("The second case, since 8 Oct 2026: the operator can fix a university&apos;s rule ahead of any proof"));
  assert.ok(page.includes("first proof that fits it whole is paid at once, with nobody reading it first; one that does not fit is held and read as a first proof is, never refused."));
  // The code that makes the second case true: a proof that fits a pin made ahead is settled, one that does not is held.
  const verification = read("src/shown-verification.ts");
  assert.match(verification, /const ahead = Boolean\(witness\?\.pin\?\.ahead\);/);
  assert.match(verification, /if \(witness && ahead && deps\.confirmPin\) await deps\.confirmPin\(witness\.portalId, witness\.sense\)/);
  // And the line each university condition carries on the page says the same.
  const proof = read("src/condition-proof.ts");
  assert.equal(proof.split("where the operator fixed the rule ahead, from a version Reclaim publishes, the first proof that fits it is paid at once and one that does not is held.").length - 1, 2);
  assert.doesNotMatch(proof, /the first proof from an AI provider is read by the operator before anything pays\./);
});
