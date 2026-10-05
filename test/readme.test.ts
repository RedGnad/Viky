// The README is read by judges who have a minute (the founder, 5 Oct 2026): what verifies Viky stands on its first
// screen, the long sections are in docs/ behind a link, and the declarations sit at its foot. The event's rules ask
// things of it by name (version 3.0 of 3 Sep 2026, section 4.1): setup and deployment instructions, the attribution
// of external code, the pre-existing code identified, the AI tools declared, a description, an architecture overview,
// the stack, and what the project takes from Monad with its addresses. This holds each of them in place, and holds
// what the README and docs/ name to the tree and the contracts they describe.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import test from "node:test";
import { toFunctionSelector } from "viem";
import { RECLAIM_ALLOWANCE, reclaimAllowance } from "../src/attested-calls";
import { consentTermsFor } from "../src/consent-terms";
import { WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAY_IN_USDC, waysIn } from "../src/rails";
import { HOME } from "../src/sentences";
import { EXIT_ROUTER, USDC_ROUTER } from "../src/viky-contracts";

const README = readFileSync("README.md", "utf8");
const DOCS = { contracts: "docs/CONTRACTS.md", verification: "docs/VERIFICATION.md", pages: "docs/PAGES-AND-ROUTES.md", indexer: "docs/INDEXER.md" } as const;
const doc = (name: keyof typeof DOCS) => readFileSync(DOCS[name], "utf8");
/** Everything a reader of the repository is told: the README and the four documents it links to. */
const EVERYTHING = [README, ...Object.keys(DOCS).map((name) => doc(name as keyof typeof DOCS))].join("\n");

/** A section of the README: under a heading, to the next heading of its rank or higher, or inside a fold at its foot. */
function section(title: string): string {
  const fold = README.indexOf(`<summary><b>${title}</b></summary>`);
  if (fold >= 0) return README.slice(fold, README.indexOf("</details>", fold));
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
  // What is new, with the tools that exist named, and the two things Viky does not claim.
  const fresh = section("What is new");
  assert.match(fresh, /Beeminder, StickK, Forfeit/);
  assert.match(fresh, /Two things Viky does not claim/);
  // Architecture and stack.
  assert.match(section("Architecture"), /```mermaid\nflowchart LR/);
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
  // The pre-existing code identified, the AI tools declared, and the external code and libraries attributed.
  assert.match(section("AI tools"), /Claude Code \(Anthropic\)/);
  assert.match(section("Pre-existing code"), /Lock-in is an earlier project by the same author/);
  assert.match(section("Pre-existing code"), /monad-developers\/next-serwist-privy-embedded-wallet/);
  assert.match(section("Third-party licences"), /`gsap` and its `ScrollTrigger` are not under a free licence/);
  // The licence.
  assert.match(section("License"), /\[MIT\]\(LICENSE\)/);
  assert.match(readFileSync("LICENSE", "utf8"), /^MIT License/);
  assert.match(section("Security"), /\[SECURITY\.md\]\(SECURITY\.md\)/);
  // The order: the short sections, then how to run it, then the declarations folded at the foot.
  const order = ["## Who it is for, and the problem", "## What we know about the two people", "## What is new", "## Why Monad", "## What has run with real money", "## Path forward: how the next hundred find Viky", "## Architecture", "## Stack", "## Run", "### Deploy", "## Test", "<summary><b>AI tools</b></summary>", "<summary><b>Pre-existing code</b></summary>", "<summary><b>Environment</b></summary>", "<summary><b>Third-party licences</b></summary>", "<summary><b>Security</b></summary>", "<summary><b>License</b></summary>"].map((mark) => README.indexOf(mark));
  assert.ok(order.every((found) => found >= 0), "every section is there");
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.equal(README.match(/<details>/g)?.length, 6);
  assert.equal(README.match(/<\/details>/g)?.length, 6);
});

test("what has run with real money is only what has a transaction, each with its link", () => {
  const ran = section("What has run with real money");
  const links = [...ran.matchAll(/\[`0x[0-9a-f]{4}…[0-9a-f]{4}`\]\(https:\/\/monadvision\.com\/tx\/(0x[0-9a-f]{64})\)/g)].map((found) => found[1]);
  assert.equal(links.length, 8);
  assert.equal(new Set(links).size, 8, "eight transactions, none said twice");
  // Every item of the lists carries one: nothing is said to have run on words alone.
  const items = ran.split("\n").filter((line) => /^\s*(- \*\*|\d\. )/.test(line));
  assert.equal(items.length, 9, "three things, one of them in six steps");
  const text = ran.replace(/\n\s+/g, " ");
  for (const step of text.split(/(?=\s\d\. )/).slice(1)) assert.match(step, /monadvision\.com\/tx\/0x[0-9a-f]{64}/, step.slice(0, 60));
  // The gift that ran end to end is said for what it is: the author's own, between two of his accounts.
  assert.match(ran, /made by the\s+author between two of his own accounts/);
  // And what has not run is said.
  assert.match(ran, /What has not run on the third daily contract yet: a missed day going back, and a gift reaching its last day\./);
  // The day `pnpm verify:day` checks is the first of them, the one Why Monad gives the fee of.
  assert.ok(links[0] === "0x5aa6752fc8c7db2526a5e5bafe6aeb91e09bd1cbe0cf3d4a6bc5e8f65f664ffd" && section("Why Monad").includes(links[0]));
  // The amounts add up: what was funded is what went back and what was withdrawn.
  assert.match(ran, /funded with 5\.61 AUSD/);
  assert.match(ran, /5\.423 AUSD/);
  assert.match(ran, /the 0\.187 AUSD it earned withdrawn/);
  assert.equal(5_423_000 + 187_000, 5_610_000);
  // The judges page is said for what it is.
  assert.match(ran, /\[viky\.cash\/judges\]\(https:\/\/viky\.cash\/judges\) is the one page for verifying Viky/);
});

test("the two people and the path forward say of the product what the code does", () => {
  const people = section("What we know about the two people").replace(/\s+/g, " ");
  const path = section("Path forward: how the next hundred find Viky").replace(/\s+/g, " ");
  // What the funder sees is what the agreement says they see (src/consent-terms.ts): yes or no for a day, and the
  // figure read for a goal that has one. "Never the detail" was said of both, and a rating is a detail.
  assert.equal(consentTermsFor("duolingo-daily")?.things, 1);
  for (const withAFigure of ["chess-rating", "toefl-mybest-shown", "university-grade-shown", "wca-time"]) assert.equal(consentTermsFor(withAFigure)?.things, 2, withAFigure);
  assert.ok(people.includes("The funder sees yes or no for a day and, for a goal with a number (a rating, a score, a grade, a time), that number and whether it reaches the target."));
  // A gift's page answers to its number, so what is kept to the two people and the link is the names, not the page.
  assert.ok(people.includes("the names and the account read are shown only to its two people and to whoever holds its link"));
  assert.doesNotMatch(people, /opens only from its link/);
  // An age is confirmed, never checked.
  assert.ok(people.includes("both people confirm they are 18 or older"));
  // The button a tester's reading renamed.
  assert.ok(people.includes(`The button became "${HOME.takeItOut}".`));
  // What each card service keeps is the register's own figure, in the order the sheet tries them.
  assert.equal(waysIn({ rampnow: true })[0], WAY_IN_USDC);
  const euro = (amount: number) => `€${amount.toFixed(2)}`;
  const first = WAY_IN_USDC.fee;
  const onTwenty = Math.max(first.minimum, (20 * first.percent) / 100 + (first.plus ?? 0));
  const card = `${WAY_IN_USDC.name}, tried first where it serves the payer, ${first.percent} % plus ${euro(first.plus ?? 0)} and never less than ${euro(first.minimum)}, which is ${euro(onTwenty)} of a €20 payment; ${WAY_IN_GIFT_COIN.name} up to ${WAY_IN_GIFT_COIN.fee.percent} %, never less than ${euro(WAY_IN_GIFT_COIN.fee.minimum)}; ${WAY_IN_CHAIN_COIN.name} ${WAY_IN_CHAIN_COIN.fee.percent} %, from €${WAY_IN_CHAIN_COIN.smallestEur}.`;
  assert.ok(WAY_IN_GIFT_COIN.fee.upTo && !WAY_IN_CHAIN_COIN.fee.upTo && !first.upTo);
  assert.ok(path.includes(card), card);
  // The month's readings are the allowance the code stops at, with no setting moving it.
  assert.deepEqual(reclaimAllowance({}), RECLAIM_ALLOWANCE);
  assert.ok(path.includes(`the plan in force covers ${RECLAIM_ALLOWANCE.fetches} a month, with ${RECLAIM_ALLOWANCE.verifications} proofs a person shows from their own account`));
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
  // The four documents the README sends to.
  for (const path of Object.values(DOCS)) assert.ok(README.includes(`](${path}`), `the README links to ${path}`);
});

test("the README discloses the AI tools used, as the rules ask", () => {
  const tools = section("AI tools");
  assert.match(tools, /AI coding tool/);
  assert.match(tools, /Claude Code \(Anthropic\)/, "the tool is named");
  assert.match(tools, /The author directed all of it/, "and who decides is said");
});

test("the README identifies the pre-existing code, file by file, and every file it names is in the tree", () => {
  const before = section("Pre-existing code");
  assert.match(before, /Lock-in is an earlier project by the same author, in a private repository/);
  assert.match(before, /monad-developers\/next-serwist-privy-embedded-wallet/, "the template is named");
  assert.match(before, /Everything else was written between 10 Sep 2026 and the submission\./);
  const named = [...before.matchAll(/`((?:src|app|contracts|scripts|test)\/[^`]+\.(?:ts|sol))`/g)].map((found) => found[1]);
  assert.ok(named.length >= 37, `${named.length} files named`);
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
  const environment = section("Environment");
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
  assert.match(section("Environment"), /\[`\.env\.example`\]\(\.env\.example\)/);
  // The variables the Run and Deploy sections name are in it.
  for (const name of ["SESSION_SIGNING_SECRET", "DATABASE_URL", "ZKFETCH_WORKER_URL", "ZKFETCH_WORKER_SECRET"]) assert.ok(names.some(([, found]) => found === name) && README.includes(`\`${name}\``), name);
});

test("the licences of what the worker calls are said beside MIT", () => {
  const licences = section("Third-party licences");
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
