// The README is read by judges who have little time (the founder, 5 and 12 Oct 2026): what verifies Viky stands on its
// first screen, no section is a block of text, and the long ones (the two people, the path forward, the declarations)
// are in docs/, each behind three lines and a link. The declarations the rules ask of the README itself stand in those
// three lines, in the open, and the pre-existing code is listed file by file in a folded block under them: the rules
// say "identified in the README". What has run with real money opens on a table, a row a fact. The event's rules ask
// things of it by name (version 3.0 of 3 Sep 2026, section 4.1): setup and deployment instructions, the attribution
// of external code, the pre-existing code identified, the AI tools declared, a description, an architecture overview,
// the stack, and what the project takes from Monad with its addresses. This holds each of them in place, and holds
// what the README and docs/ name to the tree and the contracts they describe.

import assert from "node:assert/strict";
import { BLOCK_TIME, RELAYER_FEES } from "../src/measured";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import test from "node:test";
import { toFunctionSelector } from "viem";
import { verdictOnly } from "../src/condition-privacy";
import { consentTermsFor } from "../src/consent-terms";
import { HOME } from "../src/sentences";
import { EXAMPLE_FOR_JUDGES_TX } from "../src/proof-journal";
import { FOUNDER_TEST_ACCOUNTS } from "../src/pilot-accounts";
import { EXIT_ROUTER, GIFT_ESCROW, USDC_ROUTER } from "../src/viky-contracts";

const README = readFileSync("README.md", "utf8");
const DOCS = {
  contracts: "docs/CONTRACTS.md",
  verification: "docs/VERIFICATION.md",
  pages: "docs/PAGES-AND-ROUTES.md",
  indexer: "docs/INDEXER.md",
  people: "docs/THE-TWO-PEOPLE.md",
  path: "docs/PATH-FORWARD.md",
  declarations: "docs/DECLARATIONS.md",
} as const;
const doc = (name: keyof typeof DOCS) => readFileSync(DOCS[name], "utf8");
/** Everything a reader of the repository is told: the README and the seven documents it links to. */
const EVERYTHING = [README, ...Object.keys(DOCS).map((name) => doc(name as keyof typeof DOCS))].join("\n");

/** A part of the declarations, which left the README's foot for docs/DECLARATIONS.md on 12 Oct 2026: under its heading, to the next. */
function declared(title: string): string {
  const text = doc("declarations");
  const from = text.indexOf(`\n## ${title}\n`);
  assert.ok(from >= 0, `the declarations have a part "${title}"`);
  const next = text.indexOf("\n## ", from + 1);
  return text.slice(from, next < 0 ? undefined : next);
}

/** A section of the README: under a heading, to the next heading of its rank or higher. */
function section(title: string): string {
  const found = new RegExp(`^(#{2,3}) ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").exec(README);
  assert.ok(found, `the README has a section "${title}"`);
  const rest = README.slice(found.index + found[0].length);
  const next = rest.search(new RegExp(`^#{2,${found[1].length}} `, "m"));
  return README.slice(found.index, next < 0 ? undefined : found.index + found[0].length + next);
}

/** What stands before the first section: what a judge sees without scrolling far. */
const FIRST_SCREEN = README.slice(0, README.indexOf("\n## "));

const IN_SERVICE = {
  GiftEscrowV3: "0x591d76863177E70FfcA2C793212d4715A367Ec70",
  MilestoneGiftV2: "0x493c87A27E637bBc7179C17bE2B215fC18523CC0",
  ExitRouter: EXIT_ROUTER,
  converter: USDC_ROUTER,
} as const;
const SAFE = "0xE08D926c148A5065F4Df2892702785a183de86F9";

test("the first screen: the name, the landing's promise, the two sentences, the three links, the product in use", () => {
  const lines = FIRST_SCREEN.split("\n").filter((line) => line.trim() !== "");
  assert.equal(lines[0], "# Viky");
  assert.equal(lines[1], `**${HOME.promise}**`, "the promise is the landing's own");
  assert.equal(lines[2], "The money is already in their name. Every day they miss, a piece comes back to you.");
  // In that order: the words, the links, the image, the table, the badge.
  const at = (words: string) => {
    const found = FIRST_SCREEN.indexOf(words);
    assert.ok(found >= 0, words);
    return found;
  };
  const order = [at("Viky is a conditional payment on Monad."), at("[The app](https://viky.cash)"), at("![The card a gift is filled in on"), at("| On Monad mainnet (chain 143) |"), at("pnpm verify:day\n"), at("[![CI]")];
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  // The three links: the app, the judges page, and the video, which has no address until the submission and says so.
  assert.match(FIRST_SCREEN, /\*\*\[The app\]\(https:\/\/viky\.cash\)\*\* · \*\*3-minute video\*\* \(its link comes with the submission\) · \*\*\[The judges page\]\(https:\/\/viky\.cash\/judges\)\*\*/);
  // One image, of the product in use, which is in the tree; and the sentence under it says what it is.
  const images = [...README.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((found) => found[1]).filter((path) => !path.startsWith("http"));
  assert.deepEqual(images, ["docs/readme/in-use.png"]);
  assert.ok(statSync("docs/readme/in-use.png").size > 50_000 && statSync("docs/readme/in-use.png").size < 700_000);
  assert.match(FIRST_SCREEN, /Three of the app's own screens, photographed by the test suite with example data/);
  // Short enough to be a first screen: what verifies Viky, and nothing that explains it at length.
  assert.ok(lines.length <= 36, `${lines.length} lines before the first section`);
});

test("the contracts in service are named with their address, the explorer and their verified source", () => {
  const table = FIRST_SCREEN.slice(FIRST_SCREEN.indexOf("| On Monad mainnet (chain 143) |"), FIRST_SCREEN.indexOf("```bash"));
  for (const [name, address] of Object.entries(IN_SERVICE)) {
    assert.ok(table.includes(`[\`${address}\`](https://monadvision.com/address/${address})`), `${name} opens on the explorer`);
    assert.ok(table.includes(`[exact match](https://sourcify-api-monad.blockvision.org/v2/contract/143/${address})`), `${name}'s source is the link that answers it`);
  }
  assert.ok(table.includes(`[\`${SAFE}\`](https://monadvision.com/address/${SAFE})`), "and their owner");
  for (const contract of ["GiftEscrowV3", "MilestoneGiftV2", "ExitRouter"]) assert.ok(table.includes(`\`${contract}\``) && existsSync(`contracts/${contract}.sol`), contract);
  // Where the sources are verified is said as it is: on the explorer's own Sourcify instance.
  assert.match(FIRST_SCREEN, /The sources are verified on\s+MonadVision, the explorer, through its Sourcify instance\./);
  assert.match(doc("contracts"), /sourcify\.dev's own\s+server does not hold them/);
  // Every address of the first screen is in the list of the nine.
  for (const address of [...Object.values(IN_SERVICE), SAFE]) assert.ok(doc("contracts").includes(`\`${address}\``), address);
});

test("the command that checks a credited day, and a refusal with the error the contract returns", () => {
  assert.match(FIRST_SCREEN, /git clone https:\/\/github\.com\/RedGnad\/Viky\.git && cd Viky && pnpm install && pnpm verify:day\n/);
  assert.equal((JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts["verify:day"], "tsx scripts/verify-day.ts");
  // Both halves of what it says, here, and the whole of it one link away.
  assert.match(FIRST_SCREEN, /It does not prove whose account it is, nor that a human did the work/);
  assert.match(FIRST_SCREEN, /\[what it checks, and its limits\]\(docs\/VERIFICATION\.md#check-a-credited-day-yourself\)/);
  // The refusal: an account that is not the recipient asks for what a gift earned, on the contract in service. The
  // error is the one the source declares and that function raises, and its selector is computed, not typed.
  const selector = toFunctionSelector("NotRecipient()");
  assert.equal(selector, "0x586d3357");
  assert.ok(FIRST_SCREEN.includes(`the error \`NotRecipient()\`, \`${selector}\``));
  assert.ok(FIRST_SCREEN.includes(`cast call ${IN_SERVICE.GiftEscrowV3} "withdrawEarned(uint256,address,uint256)" \\\n  1000 0x000000000000000000000000000000000000dEaD 1 --rpc-url https://rpc.monad.xyz\n`));
  const escrow = readFileSync("contracts/GiftEscrowV3.sol", "utf8");
  assert.match(escrow, /error NotRecipient\(\);/);
  assert.match(escrow, /function withdrawEarned\(uint256 giftId, address to, uint256 amount\) external nonReentrant \{\n\s*Gift storage g = _gift\(giftId\);\n\s*if \(msg\.sender != g\.recipient\) revert NotRecipient\(\);/);
});

test("the CI badge is the workflow's own, on main: its state is the real one", () => {
  assert.ok(FIRST_SCREEN.includes("[![CI](https://github.com/RedGnad/Viky/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RedGnad/Viky/actions/workflows/ci.yml?query=branch%3Amain)"));
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /^name: CI$/m);
  // What the sentence beside it says the checks are is what the workflow runs.
  for (const step of ["pnpm exec tsc --noEmit", "pnpm lint", "pnpm test:policy", "forge test --network monad", "pnpm test:browser"]) assert.ok(ci.includes(step), step);
});

test("what the rules ask of a README is all there (section 4.1), and the licence is MIT", () => {
  // Description, the problem and who it is for.
  assert.match(FIRST_SCREEN, /Viky is a conditional payment on Monad\./);
  assert.match(section("Who it is for, and the problem"), /the person who pays for somebody else's effort from a distance and cannot check it themselves/);
  // What is new, with the tools that exist named. No paragraph of what is not claimed, anywhere in a text a judge
  // reads (the founder, 8 Oct 2026; the audit of 9 Oct found two in this file).
  const fresh = section("What is new");
  assert.match(fresh, /Beeminder, StickK, Forfeit/);
  assert.doesNotMatch(EVERYTHING, /Two things Viky does not claim|What is not claimed/);
  // The table's right column says what Viky does, in every row: beside the effect that stops with the money, a gift's
  // own length and the funder's next choice.
  assert.doesNotMatch(EVERYTHING, /does not claim/);
  assert.match(doc("people"), /\| A gift covers a set number of days\. After it, the funder chooses whether to offer another\. \|/);
  // Members, and no segment by age: "adults" is a rule of the product, never a pitch.
  assert.match(doc("path"), /A club officer, to members and the relatives who back them/);
  assert.doesNotMatch(EVERYTHING, /adult members/);
  // Architecture and stack: the diagram is in the README itself (the founder, 12 Oct 2026: it reads in ten seconds),
  // over the three lines that say it, and the long texts are the documents it links to.
  assert.match(section("Architecture"), /^## Architecture\n\n```mermaid\nflowchart LR/);
  assert.match(section("Architecture"), /the evidence signer attests what was read, the relayer submits it,\nand the contract moves the money/);
  assert.ok(!existsSync("docs/ARCHITECTURE.md"), "the diagram has one home");
  assert.match(section("Stack"), /Next\.js 16/);
  // Setup instructions a third party can follow from nothing, and deployment instructions.
  const run = section("Run");
  for (const step of ["git clone https://github.com/RedGnad/Viky.git", "pnpm install", "cp .env.example .env.local", "SESSION_SIGNING_SECRET", "pnpm dev", "http://localhost:3000"]) assert.ok(run.includes(step), step);
  assert.match(readFileSync(".env.example", "utf8"), /^SESSION_SIGNING_SECRET=$/m);
  assert.equal(readFileSync(".nvmrc", "utf8").trim(), "24");
  const deploy = section("Deploy");
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const command of [...`${run}\n${deploy}\n${section("Test")}`.matchAll(/`pnpm ([a-z0-9:-]+)/g)].map((found) => found[1])) {
    assert.ok(command in scripts || ["install", "exec"].includes(command), `pnpm ${command} exists`);
  }
  for (const file of ["vercel.json", "Dockerfile", ".env.example"]) assert.ok(deploy.includes(`\`${file}\``) && existsSync(file), file);
  // Monad: what the project takes from it, the addresses, and transactions.
  assert.match(section("Why Monad"), /Only what was measured, or what Monad's own documentation states\./);
  assert.match(FIRST_SCREEN, /\| On Monad mainnet \(chain 143\) \|/);
  // The pre-existing code identified and the AI tools declared, in the README itself and in the open (the rules ask
  // both of the README by name): the tool, where the ported code came from and how much of it, the template.
  const stated = section("Declarations, environment and licences");
  assert.match(stated, /- \*\*AI tools\.\*\* Viky was built with an AI coding tool, Claude Code \(Anthropic\)/);
  assert.match(stated, /- \*\*Pre-existing code\.\*\* The verification plumbing was ported from Lock-in, an earlier project by the same author/);
  assert.match(stated, /`monad-developers\/next-serwist-privy-embedded-wallet`/);
  // Its figures are the ones the full declaration counts.
  assert.match(stated, /\(37 files, about 7,200 of the 109,700 lines\)/);
  assert.match(declared("Pre-existing code"), /That is 37 files and about 7,200 of the 109,700 lines of code and tests/);
  // The licence, and where a vulnerability is reported.
  assert.match(stated, /- \*\*Licence\.\*\* \[MIT\]\(LICENSE\)\./);
  assert.match(readFileSync("LICENSE", "utf8"), /^MIT License/);
  assert.match(stated, /\[SECURITY\.md\]\(SECURITY\.md\)/);
  assert.match(stated, /\]\(docs\/DECLARATIONS\.md\)\.\n$/);
  // Each in full, one link away, with the external code and libraries attributed.
  assert.match(declared("AI tools"), /Claude Code \(Anthropic\)/);
  assert.match(declared("Pre-existing code"), /Lock-in is an earlier project by the same author/);
  assert.match(declared("Pre-existing code"), /monad-developers\/next-serwist-privy-embedded-wallet/);
  assert.match(declared("Third-party licences"), /`gsap` and its `ScrollTrigger` are not under a free licence/);
  assert.match(declared("License"), /\[MIT\]\(\.\.\/LICENSE\)/);
  assert.match(declared("Security"), /\[SECURITY\.md\]\(\.\.\/SECURITY\.md\)/);
  assert.match(doc("declarations"), /This repository carries the project's whole history since 10 Sep 2026\./);
  // The order: the short sections, then how to run it, then the declarations at the foot.
  const order = ["## What Viky is built on", "## Who it is for, and the problem", "## What we know about the two people", "## What is new", "## No word of crypto", "## Eighteen conditions", "## Why Monad", "## What has run with real money", "## Path forward: how the next hundred find Viky", "## Architecture", "## Stack", "## Run", "### Deploy", "## Test", "## Declarations, environment and licences"].map((mark) => README.indexOf(mark));
  assert.ok(order.every((found) => found >= 0), "every section is there");
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  // Three folded blocks, each one level under what its section opens on: the three steps a person's own account
  // sends, which "Why Monad" says leave a gift's usual path (the founder, 13 Oct 2026), the step by step of what has
  // run, and the pre-existing code file by file.
  assert.deepEqual([...README.matchAll(/<details>\n<summary><b>([^<]+)<\/b><\/summary>/g)].map((found) => found[1]), ["The three steps a person's own account sends", "Each of them step by step, with its transactions", "The pre-existing code, file by file"]);
  assert.equal(README.match(/<\/details>/g)?.length, 3);
  assert.match(section("Why Monad"), /Three steps leave that path, listed\s+under this section\./);
  assert.deepEqual([...doc("declarations").matchAll(/^## (.+)$/gm)].map((found) => found[1]), ["AI tools", "Pre-existing code", "Environment", "Third-party licences", "Security", "License"]);
});

test("a long section is three lines and a link here, and whole in its document (the founder, 12 Oct 2026)", () => {
  const moved = { "What we know about the two people": "people", "Path forward: how the next hundred find Viky": "path" } as const;
  for (const [title, name] of Object.entries(moved)) {
    const lines = section(title).split("\n").slice(1).join("\n").trim().split("\n\n");
    assert.equal(lines.length, 2, `${title}: a paragraph and a link`);
    assert.ok(lines[0]!.split("\n").length <= 3, `${title}: three lines at most`);
    assert.ok(lines[1]!.includes(`](${DOCS[name]})`), `${title} sends to ${DOCS[name]}`);
    assert.ok(doc(name).startsWith(`# ${title}\n`), `${DOCS[name]} carries the section's own title`);
  }
  // The declarations: three lines, each a thing the rules ask of the README, then the folded list, then the link.
  const stated = section("Declarations, environment and licences");
  const open = stated.slice(0, stated.indexOf("<details>"));
  assert.equal(open.split("\n").filter((line) => line.startsWith("- **")).length, 3);
  assert.ok(stated.indexOf("</details>") < stated.indexOf("](docs/DECLARATIONS.md)"));
  // No section is a block of text: what a section says in the open, outside its tables, its commands and its folded
  // block, stays short. The longest is "Run", which is setup instructions and does not move.
  for (const part of README.split(/\n(?=## )/).slice(1)) {
    const title = part.split("\n")[0]!;
    const said = part.replace(/<details>[\s\S]*?<\/details>/g, "").replace(/```[\s\S]*?```/g, "").split("\n").filter((line) => !line.startsWith("|")).join("\n");
    const words = said.split(/\s+/).filter(Boolean).length;
    assert.ok(words <= 340, `${title}: ${words} words in the open`);
  }
});

test("what has run with real money opens on a table, a row a fact, and its step by step is one level down", () => {
  const ran = section("What has run with real money");
  const linksOf = (said: string) => [...said.matchAll(/\[`0x[0-9a-f]{4}…[0-9a-f]{4}`\]\(https:\/\/monadvision\.com\/tx\/(0x[0-9a-f]{64})\)/g)].map((found) => found[1]);
  const fold = ran.slice(ran.indexOf("<details>"), ran.indexOf("</details>"));
  assert.match(fold, /^<details>\n<summary><b>Each of them step by step, with its transactions<\/b><\/summary>\n\n- \*\*A day credited on a proof\.\*\*/);
  // The table (the founder, 12 Oct 2026): what happened, the date, the amount, the transaction; five facts.
  const rows = ran.slice(0, ran.indexOf("<details>")).split("\n").filter((line) => line.startsWith("| ")).map((line) => line.slice(2, -2).split(" | "));
  assert.deepEqual(rows[0], ["What happened", "Date", "Amount", "Transaction"]);
  assert.equal(rows.length, 7);
  const facts = rows.slice(1);
  for (const fact of facts) {
    assert.equal(fact.length, 4, fact[0]);
    assert.match(fact[0]!, /^\*\*[A-Z]/, "what happened, its first words in bold");
    assert.match(fact[1]!, /\d{1,2} (Sep|Oct) 2026$/);
    assert.match(fact[2]!, /^\d+\.\d+ AUSD/);
    assert.equal(linksOf(fact[3]!).length, 1, "one transaction a row");
  }
  // The gift between two people comes first, with the transaction that paid it; then the same student's next gift.
  assert.deepEqual(facts[0]!.slice(1, 3), ["7 Oct 2026", "8.98 AUSD"]);
  assert.match(facts[0]![0]!, /^\*\*A gift between two people who are not the author\*\*, paid on the proof a student showed from their university's portal, at Toulouse\./);
  assert.deepEqual(linksOf(facts[0]![3]!), ["0x9c5508e83b0dd20668bb6a8c683faa047820734d6938387f8b6f516c3467c4fd"]);
  assert.deepEqual(facts[1]!.slice(1, 3), ["9 Oct 2026", "5.02 AUSD"]);
  assert.match(facts[1]![0]!, /paid 20 seconds after they signed in\*\* to that portal, on the rule fixed ahead of the pass, with no review\./);
  assert.deepEqual(linksOf(facts[1]![3]!), ["0xd950295c4c3d51480496003fd6547b0fc6c3546ac0c5747d377e6259cd3277e2"]);
  // The author's own gift is said his, and its figures are the step by step's: 0.187 and 5.423 make 5.61.
  assert.match(facts[2]![0]!, /made by the author between two of his own accounts: one day credited, 0\.187 AUSD, and the 29 others, 5\.423 AUSD, back to the funder\./);
  assert.equal(facts[2]![2], "5.61 AUSD");
  assert.equal(facts[3]![2], "7.914524 AUSD");
  // A gift card bought by the author from his own account (the founder, 12 Oct 2026): the AUSD his account sent to
  // Viky's treasury, read on the chain and not on the order, which carries the card's code. One transfer of AUSD came
  // into the treasury that day: 11.769118, at 14:06:20 UTC, submitted by the relayer on his signature.
  assert.match(facts[4]![0]!, /^\*\*A gift card bought with the account's own dollars\*\*, by the author from his own account: the AUSD sent to Viky's treasury on one signature\.$/);
  assert.deepEqual(facts[4]!.slice(1, 3), ["12 Oct 2026", "11.769118 AUSD"]);
  assert.deepEqual(linksOf(facts[4]![3]!), ["0x346cef5586d129fbe16b405140a443aef943954a30a920db60959186623321ae"]);
  // The account that paid is one of the founder's own, as the row says.
  assert.ok(FOUNDER_TEST_ACCOUNTS.includes("0xb12e0c72209bd4becfdafa96a8f3e7ebc93b8376"));
  // The credited day: one day of gift 2, 1.00 AUSD over seven days, as the contract holds it (read on 12 Oct 2026).
  assert.equal(facts[5]![2], "0.142857 AUSD, one day of a 1.00 AUSD gift");
  assert.equal(Math.floor(1_000_000 / 7), 142_857);
  // Every transaction of the table is one of the step by step's thirteen, and none is said twice there.
  const links = linksOf(fold);
  assert.equal(links.length, 13);
  assert.equal(new Set(links).size, 13, "thirteen transactions, none said twice");
  for (const fact of facts) assert.ok(links.includes(linksOf(fact[3]!)[0]!), fact[0]);
  // Every item of the lists carries one: nothing is said to have run on words alone.
  const items = fold.split("\n").filter((line) => /^\s*(- \*\*|\d\. )/.test(line));
  assert.equal(items.length, 15, "six things, one of them in six steps and one in three");
  const text = fold.replace(/\n\s+/g, " ");
  for (const step of text.split(/(?=\s\d\. )/).slice(1)) assert.match(step, /monadvision\.com\/tx\/0x[0-9a-f]{64}/, step.slice(0, 60));
  // The gift that ran end to end is said for what it is: the author's own, between two of his accounts.
  assert.match(fold, /made by the\s+author between two of his own accounts/);
  // The first gift between two people who are not the author: said with its three transactions, with the review that
  // came before the money, and with what its proof read and no more (7 Oct 2026).
  assert.match(fold, /\*\*The first pass, two days before: a gift between two people who are not the author, paid on a proof from a\s+university's portal\.\*\*/);
  // Over it, the day's fact (the founder, 9 Oct 2026): the same account, on the rule fixed ahead, paid with no review.
  assert.match(fold, /\*\*Toulouse, 9 Oct 2026: a student showed their enrolment, and the gift paid 20 seconds after they signed in to\s+their university's portal, with no review\.\*\*/);
  assert.ok(fold.indexOf("Toulouse, 9 Oct 2026") < fold.indexOf("The first pass, two days before"));
  assert.match(fold, /created and funded by a third party, in a student's name/);
  assert.match(fold, /it was held, and nothing moved until the\s+operator had read what it had read/);
  assert.match(fold, /What that proof read is narrow, and is said as it is: signed in to his own file, the answer to one click carried the\s+academic year 2026-2027\./);
  assert.match(fold, /it names no person, no number and\s+no faculty/);
  assert.match(readFileSync(DOCS.contracts, "utf8"), /gift 1000006, 8\.98 AUSD between two people who are not the author/);
  // And what has not run is said, in the open.
  assert.match(ran.slice(0, ran.indexOf("<details>")), /What has not run on the third daily contract yet: a missed day going back, and a gift reaching its last day\./);
  // The day `pnpm verify:day` checks is the first of the step by step, the one Why Monad gives the fee of.
  assert.ok(links[0] === "0x55f9eafa857ee9897be5a7e092e055a3c75d2003d11a087dd9a0244e64726fab" && section("Why Monad").includes(links[0]));
  // The amounts add up: what was funded is what went back and what was withdrawn.
  assert.match(fold, /funded with 5\.61 AUSD/);
  assert.match(fold, /5\.423 AUSD/);
  assert.match(fold, /the 0\.187 AUSD it earned withdrawn/);
  assert.equal(5_423_000 + 187_000, 5_610_000);
  // The judges page is said for what it is.
  assert.match(ran, /\[viky\.cash\/judges\]\(https:\/\/viky\.cash\/judges\) is the one page for verifying Viky/);
});

test("the two people and the path forward say of the product what the code does", () => {
  const people = doc("people").replace(/\s+/g, " ");
  const path = doc("path").replace(/\s+/g, " ");
  // The three lines the README keeps of them say the same, shorter.
  assert.match(section("What we know about the two people").replace(/\s+/g, " "), /the whole amount is in their name from the first minute; the funder sees yes or no, a number only where a public page shows it and nothing else that was read; the recipient agrees with their own signature and can stop being read\./);
  // What the funder sees: yes or no for a day, and the figure read for a goal whose number a public page shows. "Never
  // the detail" was said of both, and a rating is a detail. A score or a grade the person shows from their own account
  // is under the verdict rule (src/condition-privacy.ts): the number is kept nowhere, the target is attested in its
  // place, and the funder is told that it was reached and no more (the founder, 13 Oct 2026). The agreement the person
  // signs (src/consent-terms.ts) still says "and the score" and "and the grade" of those two: more than is shown.
  assert.equal(consentTermsFor("duolingo-daily")?.things, 1);
  for (const withAFigure of ["chess-rating", "wca-time"]) assert.equal(consentTermsFor(withAFigure)?.things, 2, withAFigure);
  for (const verdictAlone of ["toefl-mybest-shown", "university-grade-shown"]) assert.ok(verdictOnly(verdictAlone), verdictAlone);
  assert.ok(people.includes("The funder sees yes or no for a day; for a rating, a time or a score read from a public page, that number and whether it reaches the target; for a score or a grade the person shows from their own account, only whether the target was reached."));
  // A gift's page answers to its number, so what is kept to the two people and the link is the names, not the page.
  assert.ok(people.includes("the names and the account read are shown only to its two people and to whoever holds its link"));
  assert.doesNotMatch(people, /opens only from its link/);
  // An age is confirmed, never checked.
  assert.ok(people.includes("both people confirm they are 18 or older"));
  // The button a tester's reading renamed.
  assert.ok(people.includes(`The button became "${HOME.takeItOut}".`));
  // What each card service keeps and the month's readings are said once, on the judges page, from the registers
  // themselves: the README no longer repeats either (the founder, 10 Oct 2026), so neither figure can go stale here.
  assert.doesNotMatch(README, /What limits growth today|never less than €|the plan in force covers/);
  assert.match(readFileSync("app/judges/JudgesAgora.tsx", "utf8"), /\{waysIn\(\)\.map\(\(way\) => \(\s*<span key=\{way\.name\} className="block">\s*\{feeSentence\(way\)\}/);
  assert.match(readFileSync("app/judges/page.tsx", "utf8"), /allows up to \{RECLAIM_ALLOWANCE\.fetches\} attested fetches and \{RECLAIM_ALLOWANCE\.verifications\} verifications a\s+month/);
  // The words check it names exists, in the source and on rendered screens.
  assert.match(readFileSync("package.json", "utf8"), /"check:words":/);
  assert.match(readFileSync("test/browser/screens.spec.ts", "utf8"), /FORBIDDEN_WORDS/);
  // Nothing either section claims that Viky refuses to claim.
  for (const never of [/cheaper than a bank/i, /no licen[cs]e (is )?required/i, /nobody (else )?does this/i]) assert.doesNotMatch(`${people} ${path}`, never);
});

test("every link of the README and of docs/ leads to a file of the tree, and to a heading that is there", () => {
  const anchorOf = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
  for (const file of ["README.md", ...Object.values(DOCS)]) {
    const text = readFileSync(file, "utf8");
    const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((found) => found[1]).filter((target) => !/^(https?:|mailto:)/.test(target));
    assert.ok(file !== "README.md" || links.length >= 10, `${links.length} links inside the repository`);
    for (const target of links) {
      const [path, anchor] = target.split("#");
      const where = path === "" ? file : normalize(join(dirname(file), path));
      assert.ok(existsSync(where), `${file} links to ${target}`);
      if (anchor) {
        const headings = [...readFileSync(where, "utf8").matchAll(/^#{1,3} (.+)$/gm)].map((found) => anchorOf(found[1]));
        assert.ok(headings.includes(anchor), `${file} links to #${anchor} in ${where}`);
      }
    }
  }
  // The seven documents the README sends to.
  for (const path of Object.values(DOCS)) assert.ok(README.includes(`](${path}`), `the README links to ${path}`);
});

test("the README discloses the AI tools used, as the rules ask", () => {
  assert.match(section("Declarations, environment and licences"), /an AI coding tool, Claude Code \(Anthropic\): it wrote most of the code, the tests\n  and the documentation from the author's written briefs, and the author directed all of it\./);
  const tools = declared("AI tools");
  assert.match(tools, /AI coding tool/);
  assert.match(tools, /Claude Code \(Anthropic\)/, "the tool is named");
  assert.match(tools, /The author directed all of it/, "and who decides is said");
});

test("the pre-existing code is identified in the README and named file by file one link away, and every file named is in the tree", () => {
  const before = declared("Pre-existing code");
  assert.match(before, /Lock-in is an earlier project by the same author, in a private repository/);
  assert.match(before, /monad-developers\/next-serwist-privy-embedded-wallet/, "the template is named");
  assert.match(before, /Everything else was written between 10 Sep 2026 and the submission\./);
  const filesOf = (said: string) => [...said.matchAll(/`((?:src|app|contracts|scripts|test)\/[^`]+\.(?:ts|sol))`/g)].map((found) => found[1]);
  const named = filesOf(before);
  assert.ok(named.length >= 37, `${named.length} files named`);
  // The same list stands in the README itself, in a folded block under the three lines (the founder, 12 Oct 2026: the
  // rules say "identified in the README"): the same files, in the same words.
  const stated = section("Declarations, environment and licences");
  const folded = stated.slice(stated.indexOf("<summary><b>The pre-existing code, file by file</b></summary>"), stated.indexOf("</details>"));
  assert.deepEqual(filesOf(folded), named);
  for (const also of ["`foundry.toml` and `remappings.txt`", "`.github/workflows/ci.yml`", "That is 37 files and about 7,200 of the 109,700 lines of code and tests", "monad-developers/next-serwist-privy-embedded-wallet", "Everything else was written between 10 Sep 2026 and the submission."]) assert.ok(folded.includes(also), also);
  for (const file of named) assert.ok(existsSync(file), `${file} exists`);
  // Every file that says it was ported from Lock-in is named here.
  for (const file of ["src/account-auth-server.ts", "src/api-guard.ts", "src/rate-limit.ts", "src/proof-session-store.ts", "src/reclaim-onchain.ts", "src/reclaim-proof-set.ts", "src/reclaim-channel.ts", "src/duolingo-proof-policy.ts", "src/duolingo-profile.ts", "src/gift-attestation.ts", "src/reclaim-abi.ts", "src/reclaim-types.ts", "contracts/verifiers/VikyReclaimVerifier.sol", "contracts/verifiers/VikyStravaReclaimVerifier.sol", "contracts/verifiers/VikyProofTypes.sol"]) {
    assert.ok(named.includes(file), `${file} is named as ported`);
  }
});

test("the README and its documents say what is, and no longer what was", () => {
  assert.doesNotMatch(EVERYTHING, /viky:private:v1|private space|\/api\/account\/private/, "the private space is gone (#380)");
  assert.match(README, /sha256\("viky:consent:v1"\)/, "the consent key is what the second salt makes");
  assert.equal(readFileSync("src/client/consent-key.ts", "utf8").includes('sha256("viky:consent:v1")'), true);
  assert.doesNotMatch(EVERYTHING, /\(TEE required\)/, "a witness provider has no enclave (D312)");
  assert.match(doc("verification"), /Three kinds of proof reach the evidence signer/);
  assert.doesNotMatch(EVERYTHING, /Removed after KT1/);
  // Never the claims the product rules forbid.
  assert.doesNotMatch(EVERYTHING, /cheaper than a bank transfer|nobody does this|no licen[cs]e (is )?required/i);
  assert.doesNotMatch(EVERYTHING, /can make no contract call at all/);
  // No dash that is not a hyphen, anywhere.
  assert.doesNotMatch(EVERYTHING, /[–—]/);
  // The migration prints the tables it left, read back, and never the one it drops.
  const migrate = readFileSync("scripts/migrate-db.ts", "utf8");
  assert.doesNotMatch(migrate.slice(migrate.indexOf("schema ready")), /viky_private_spaces/);
  assert.match(migrate, /FROM information_schema\.tables/);
});

test("the three contracts, the deployments and their owner are named, and the verifiers are said not deployed", () => {
  const contracts = doc("contracts");
  for (const source of ["contracts/GiftEscrow.sol", "contracts/MilestoneGift.sol", "contracts/ExitRouter.sol"]) {
    assert.ok(contracts.includes(`\`${source}\``) && existsSync(source), source);
  }
  // The second version, deployed on 2 Oct 2026: its three addresses, and nothing saying it is not deployed.
  for (const address of ["0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51", "0x493c87A27E637bBc7179C17bE2B215fC18523CC0", "0x2a15DF23fF62120700f14D1E5d5d56CA0dAd027e"]) {
    assert.ok(contracts.includes(`\`${address}\``), address);
  }
  assert.doesNotMatch(contracts, /not deployed: no gift runs on them/);
  assert.match(contracts, /were deployed on\s+2 Oct 2026 at the addresses above/);
  for (const address of ["0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233", "0xE04CD59bB93765333200a9da01df83149D4C4d67", "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e", "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223", "0xE08D926c148A5065F4Df2892702785a183de86F9"]) {
    assert.ok(contracts.includes(address), address);
  }
  assert.match(contracts, /`contracts\/verifiers` is not deployed/);
  // Gift 1000 is dated as the chain dates it, and said for whose it was.
  assert.match(contracts, /Its first day was paid on 4 Oct at 03:23 UTC/);
  assert.match(contracts, /made by the author between two of his own accounts/);
  // What the paragraphs say of the contracts is what their sources say.
  const escrow = readFileSync("contracts/GiftEscrow.sol", "utf8");
  assert.match(escrow, /READING_GRACE = 6 hours;\s*uint256 public constant CATCH_UP_WINDOW = 1 days \+ READING_GRACE;/, "the catch-up window of 30 hours");
  assert.match(escrow, /UNCLAIMED_REFUND_DELAY = 14 days;/);
  assert.match(readFileSync("contracts/MilestoneGift.sol", "utf8"), /LATE_PROOF_WINDOW = 14 days;/);
  assert.match(readFileSync("contracts/ExitRouter.sol", "utf8"), /function sweep\(address to, address what\) external onlyOwner/);
});

test("Why Monad carries figures that can be read again, and the code they describe", () => {
  const why = section("Why Monad");
  assert.match(why, /`pnpm relayer:fees`/);
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).scripts["relayer:fees"], "tsx scripts/relayer-fees.ts");
  assert.match(why, /margin\s+of\s+7\.5\s+%/);
  assert.match(readFileSync("src/monad-gas.ts", "utf8"), /MONAD_GAS_MARGIN_BPS = 750n;/);
  assert.match(why, /refuses\s+to\s+send\s+below\s+12\s+MON/);
  assert.match(readFileSync("src/relayer.ts", "utf8"), /RELAYER_MIN_BALANCE = parseEther\("12"\);/);
  assert.match(why, /`waitForFinality`/);
  assert.match(readFileSync("src/monad/chain.ts", "utf8"), /getBlock\(\{ blockTag: "finalized" \}\)/);
});

test("the pages and the route groups the documentation lists are the ones under app", () => {
  const pages = doc("pages");
  for (const page of ["fund", "gifts", "me", "cash-out", "what-viky-can-check", "add-your-university", "help", "privacy", "legal", "judges"]) {
    assert.ok(pages.includes(`\`/${page}\``), `/${page} is listed`);
    assert.ok(existsSync(`app/${page}/page.tsx`), `app/${page}/page.tsx exists`);
  }
  // Every folder of routes is named, and none that does not exist.
  const folders = readdirSync("app/api", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const groups = pages.slice(pages.indexOf("Every route is a file under"));
  for (const folder of folders) assert.ok(groups.includes(`\`${folder}\``), `the routes under app/api/${folder} are named`);
  for (const found of groups.slice(0, groups.indexOf("Operator commands")).matchAll(/`([a-z-]+)`/g)) assert.ok(folders.includes(found[1]), `app/api/${found[1]} exists`);
  // The passes are the crons vercel.json sets.
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  assert.deepEqual(crons.map((cron) => `${cron.path} ${cron.schedule}`), ["/api/cron/daily 30 0 * * *", "/api/cron/recount 30 3 * * *", "/api/cron/settle 0 7 * * *", "/api/cron/watch 0 2 * * *"]);
  const environment = declared("Environment");
  assert.match(environment, /`\/api\/cron\/daily` at 00:30 UTC and `\/api\/cron\/settle` at 07:00 UTC/);
  assert.match(environment, /`\/api\/cron\/watch` at 02:00 UTC/);
  assert.match(environment, /`\/api\/cron\/recount` at 03:30 UTC/);
  assert.equal(crons.length, 4, "the four daily passes the Deploy section speaks of");
  assert.match(section("Deploy"), /the four daily passes/);
  assert.ok(existsSync("app/api/cron/recount/route.ts"));
  assert.ok(existsSync("app/api/cron/watch/route.ts") && existsSync("app/api/health/route.ts"));
});

test(".env.example names every variable with no value, and each one is read somewhere", () => {
  const example = readFileSync(".env.example", "utf8");
  const names = [...example.matchAll(/^([A-Z][A-Z0-9_]+)=(.*)$/gm)];
  assert.ok(names.length > 40);
  for (const [, name, value] of names) assert.equal(value, "", `${name} carries no value`);
  const read = ["src", "app", "scripts"].flatMap((folder) => readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name)).map((entry) => readFileSync(`${entry.parentPath}/${entry.name}`, "utf8"))).join("\n");
  for (const [, name] of names) assert.ok(read.includes(name), `${name} is read by the code`);
  assert.match(declared("Environment"), /\[`\.env\.example`\]\(\.\.\/\.env\.example\)/);
  assert.match(section("Run"), /\[Environment\]\(docs\/DECLARATIONS\.md#environment\) says what each group opens\./);
  // The variables the Run and Deploy sections name are in it.
  for (const name of ["SESSION_SIGNING_SECRET", "DATABASE_URL", "ZKFETCH_WORKER_URL", "ZKFETCH_WORKER_SECRET"]) assert.ok(names.some(([, found]) => found === name) && README.includes(`\`${name}\``), name);
});

test("the licences of what the worker calls are said beside MIT", () => {
  const licences = declared("Third-party licences");
  assert.match(licences, /`@reclaimprotocol\/zk-fetch` and `@reclaimprotocol\/attestor-core` are under AGPL-3\.0/);
  assert.match(licences, /`snarkjs`[^]*GPL-3\.0/);
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
  assert.ok(manifest.dependencies["@reclaimprotocol/zk-fetch"], "a direct dependency");
});

test("the Foundry version named is the one the CI installs, and nothing is said of phones nobody recorded", () => {
  const pinned = /foundry-toolchain@v1\s+with:\s+version: v([0-9.]+)/.exec(readFileSync(".github/workflows/ci.yml", "utf8"));
  assert.ok(pinned, "the CI pins a Foundry version");
  assert.ok(README.includes(`Foundry ${pinned[1]} with \`network = "monad"\``), `the README names Foundry ${pinned[1]}`);
  assert.ok(section("Test").includes(`Foundry ${pinned[1]}`), "and the Test section names the same");
  assert.doesNotMatch(EVERYTHING, /tried the product himself on real phones/);
});

test("the README says the passes that run, what the word check reads, and what came with the port (the audit of 8 Oct 2026)", () => {
  // The README and the documents its long sections moved to on 12 Oct 2026.
  const text = EVERYTHING;
  // The passes: Vercel's own schedule, and the one a scheduler outside it calls, which pays a day the day it is done.
  // That one is called every hour since 12 Oct 2026 (the founder set the scheduler that day; every five minutes before).
  assert.doesNotMatch(text, /Two passes a day/);
  assert.match(text, /CRON\[Passes: 00:30, 03:30 and 07:00 UTC, and one called every hour\]/);
  assert.match(text, /A fifth address, `\/api\/cron\/milestones`, is not\non Vercel's schedule: a scheduler outside Vercel, cron-job\.org, calls it every hour\./);
  const schedule = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  assert.deepEqual(schedule.crons.map((cron) => `${cron.path} ${cron.schedule}`).sort(), ["/api/cron/daily 30 0 * * *", "/api/cron/recount 30 3 * * *", "/api/cron/settle 0 7 * * *", "/api/cron/watch 0 2 * * *"]);
  assert.match(readFileSync("app/api/cron/milestones/route.ts", "utf8"), /called every hour by cron-job\.org/);
  // The word check: its seven words, and where it reads.
  assert.match(text, /A check\s+looks for seven such words at every change \(wallet, gas, chain, seed, token, transaction hash, address:/);
  assert.match(readFileSync("src/consumer-words.ts", "utf8"), /wallets\?\|gas\|chains\?\|seeds\?\|tokens\?\|transaction hash\(\?:es\)\?\|address\(\?:es\)\?/);
  const scanned = readFileSync("scripts/check-consumer-words.ts", "utf8");
  for (const place of ['"app/api/proof/**/*.ts"', '"src/rails.ts"', '"src/ramp.ts"', '"src/mercuryo.ts"', '"src/shown-verification.ts"']) assert.ok(scanned.includes(place), place);
  // The way out's routes are read since the leftovers of the audit of 8 Oct 2026, and the one line there that keeps
  // such a word is marked in the route itself. The README's sentence on it was taken out with the section's last
  // line (the founder, 10 Oct 2026): the mark is where a reader of the code finds it.
  assert.ok(scanned.includes('"app/api/exit/**/*.ts"'));
  assert.doesNotMatch(text, /written for the operator's log/);
  assert.match(readFileSync("app/api/exit/relay/route.ts", "utf8"),/\/\/ consumer-words: allow a line of the operator's log, never sent to the person\n\s*if \(!landed\?\.txHash\) console\.error\(/);
  // What came with the port, by name, and what has changed since.
  assert.match(text, /three files of the build and of the checks, which came in that commit too: `foundry\.toml` and `remappings\.txt`,\n  unchanged since/);
  assert.match(text, /`\.github\/workflows\/ci\.yml`, one job\n  then and rewritten since/);
  // The AI that is in the product and is not Viky's.
  assert.match(text, /Another AI is in the product itself, and is not Viky's: Reclaim's agent\./);
  // Who reviewed, who the roles named in comments are, and the second tool (the founder, 13 Oct 2026): in the README,
  // where the rules ask for the AI tools, and in the declarations. The founder's own two sentences, word for word.
  const flat = (said: string) => said.replace(/\s+/g, " ");
  for (const said of [flat(section("Declarations, environment and licences")), flat(doc("declarations"))]) {
    assert.ok(said.includes("The contracts were reviewed on 2 and 3 Oct 2026 by a separate session of the same tool, given the contracts alone. Its tests are in `test/review`."));
    assert.ok(said.includes(`In this repository's comments, pull requests and past documents, "the developer", "the other developer", "the advisor" and "the reviewer" are sessions of that same tool. The founder is the one person.`));
    assert.ok(said.includes("A second AI tool was used once: `reclaim-portal-agent`, run with free OpenRouter models on 28 Sep 2026 to look up the student portals of twenty universities, each of which was then opened by hand"));
  }
  // The review is said as what it was, in the contracts' own document and in the review's tests.
  const contracts = flat(readFileSync("docs/CONTRACTS.md", "utf8"));
  assert.doesNotMatch(contracts, /independent review/i);
  assert.ok(contracts.includes("A review of 2 Oct 2026, made by a separate session of that same tool, given the contracts alone, was read before any deployment"));
  for (const file of ["ReviewScenarios.t.sol", "ReviewScenariosV3.t.sol", "ReviewerRigV3.sol", "FirstDayAcrossMidnightV3.t.sol", "ReviewInvariants.t.sol", "ReviewInvariantsV3.t.sol"]) {
    assert.doesNotMatch(readFileSync(`test/review/${file}`, "utf8"), /independent|\b[Hh](e|is|im)\b|by the authors?\b/, file);
  }
  // The history is said as it is, including the two examples awaiting the reading service's deployment.
  assert.ok(flat(doc("declarations")).includes("A few more were found on 12 Oct 2026. The identified files were corrected on 13 Oct, except for two examples in `src/attested-sources.ts` whose removal requires a coordinated reading-service deployment. Past commits still hold the real identifiers."));
  // Mobile money is not said switched off where the judges page says it is offered.
  assert.doesNotMatch(readFileSync("docs/PAGES-AND-ROUTES.md", "utf8"), /switched off until a first real payout/);
});

test("the README's measured figures are src/measured.ts's own, and the documents say what the audit of 9 Oct 2026 found late", () => {
  const readme = EVERYTHING.replace(/\s+/g, " ");
  const average = (Number(RELAYER_FEES.totalMon) / RELAYER_FEES.transactions).toFixed(4);
  assert.ok(readme.includes(`Read from the chain on ${RELAYER_FEES.readAt.replace(", ", " at ")} with \`${RELAYER_FEES.command}\`: ${RELAYER_FEES.transactions} transactions sent since the first one, ${RELAYER_FEES.totalMon} MON of fees in all, ${average} MON a transaction on average.`));
  assert.ok(readme.includes(`A block every ${BLOCK_TIME.seconds * 1_000} ms, measured over ${BLOCK_TIME.blocks.toLocaleString("en-US")} blocks on ${BLOCK_TIME.readOn}`));
  // The rule in force at Toulouse is no longer the one its first proof was read by.
  // One date for the rule fixed ahead (the founder, 13 Oct 2026): the judges page says "since 8 Oct 2026", and so does
  // this. The version the second pass ran on was pinned on 9 Oct at 00:36 UTC, read on the provider's row on 13 Oct.
  assert.ok(readme.includes("it was pinned on 7 Oct 2026; since 8 Oct 2026 the rule in force is one fixed ahead of any proof, as the judges page says, and the version the pass of 9 Oct ran on was pinned that day at 00:36 UTC."));
  assert.ok(readFileSync("app/judges/page.tsx", "utf8").includes("The second case, since 8 Oct"));
  // People are counted where they are counted, on the judges page: the README gave a number that was two days old.
  assert.ok(readme.includes('People from outside the project have opened gifts, one of them on an iPhone, from Instagram: the judges page counts them, under "Who has used Viky".'));
  assert.doesNotMatch(readme, /Two people from outside the project/);
  assert.match(readFileSync("app/judges/JudgesWhoUsed.tsx", "utf8"), /<Fold id="who" title="Who has used Viky">/);
  assert.doesNotMatch(readme, /it is the one pinned on 7 Oct 2026/);
  // The one dev page that opens to anybody is said to.
  assert.match(readFileSync("docs/PAGES-AND-ROUTES.md", "utf8"), /One exception, `\/dev\/rampnow`, opens to anybody, in production too/);
  assert.match(readFileSync("app/dev/rampnow/page.tsx", "utf8"), /Unlike the other dev pages it is not held to the operator's account/);
  // The six notes of conditions for pupils say at their head that they are closed.
  for (const name of ["bac-cameroon", "bac-france", "bac-morocco", "ecoledirecte-grade", "pronote-grade", "waec-result"]) {
    const lines = readFileSync(`docs/reclaim/${name}-shown-provider.md`, "utf8").split("\n");
    assert.match(lines[0]!, /^# /, name);
    assert.match(lines[2]!, /^> Closed since 4 Oct 2026: Viky is for adults on both sides, and this condition is offered on no page\./, name);
  }
});


test("the day `pnpm verify:day` checks is named by the transaction the site publishes, in both places", () => {
  // The command takes its example from the site, and the site answers this transaction (src/proof-journal.ts, where
  // test/proof-journal.test.ts holds it against a database). The README said one and the command checked another.
  const firstScreen = README.split("\n").find((line) => line.startsWith("| **A credited day, checked again from nothing** | `pnpm verify:day`"));
  assert.ok(firstScreen?.includes(`(https://monadvision.com/tx/${EXAMPLE_FOR_JUDGES_TX})`), "the first screen's table");
  const ran = README.slice(README.indexOf("- **A day credited on a proof.**"), README.indexOf("`pnpm verify:day` checks again."));
  assert.ok(ran.includes("Gift 2, the day of 12 Sep 2026, on `GiftEscrow` at `0x995A…e233`") && ran.includes(`(https://monadvision.com/tx/${EXAMPLE_FOR_JUDGES_TX})`), "what has run with real money");
  // The gift's number and its contract are the ones the chain gives that transaction, and no trace of the other day is left.
  assert.equal(GIFT_ESCROW.slice(0, 6) + "…" + GIFT_ESCROW.slice(-4), "0x995A…e233");
  assert.doesNotMatch(README, /0x5aa6|Gift 1, the day of 12 Sep 2026/);
  assert.equal(README.split(EXAMPLE_FOR_JUDGES_TX).length - 1, 4, "with the table of what has run and the note on its gas limit: the same transaction, four times");
});
