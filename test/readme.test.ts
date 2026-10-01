// The README is read by judges, and the event's rules ask two things of it: "Use of AI coding tools is permitted and
// must be disclosed in the README", and "pre-existing components are identified in the README". This holds both
// sections in place, and holds what the README names to the tree it describes.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const README = readFileSync("README.md", "utf8");

function section(title: string): string {
  const start = README.indexOf(`\n### ${title}\n`) >= 0 ? README.indexOf(`\n### ${title}\n`) : README.indexOf(`\n## ${title}\n`);
  assert.ok(start >= 0, `the README has a section "${title}"`);
  const next = README.slice(start + 4).search(/\n#{2,3} /);
  return README.slice(start, next < 0 ? undefined : start + 4 + next);
}

test("the README discloses the AI tools used, as the rules ask", () => {
  const built = section("How Viky was built");
  assert.ok(built.length > 0);
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

test("the README says what is, and no longer what was", () => {
  assert.doesNotMatch(README, /viky:private:v1|private space|\/api\/account\/private/, "the private space is gone (#380)");
  assert.match(README, /sha256\("viky:consent:v1"\)/, "the consent key is what the second salt makes");
  assert.equal(readFileSync("src/client/consent-key.ts", "utf8").includes('sha256("viky:consent:v1")'), true);
  assert.doesNotMatch(README, /\(TEE required\)/, "a witness provider has no enclave (D312)");
  assert.match(README, /Three kinds of proof reach the evidence signer/);
  assert.doesNotMatch(README, /Removed after KT1/);
  // Never the claims the product rules forbid.
  assert.doesNotMatch(README, /cheaper than a bank transfer|nobody does this|no licen[cs]e (is )?required/i);
  assert.doesNotMatch(README, /can make no contract call at all/);
  // The migration prints the tables it left, read back, and never the one it drops.
  const migrate = readFileSync("scripts/migrate-db.ts", "utf8");
  assert.doesNotMatch(migrate.slice(migrate.indexOf("schema ready")), /viky_private_spaces/);
  assert.match(migrate, /FROM information_schema\.tables/);
});

test("the three contracts, the four deployments and their owner are named, and the verifiers are said not deployed", () => {
  const contracts = section("Contracts");
  for (const source of ["contracts/GiftEscrow.sol", "contracts/MilestoneGift.sol", "contracts/ExitRouter.sol"]) {
    assert.ok(contracts.includes(`\`${source}\``) && existsSync(source), source);
  }
  for (const address of ["0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233", "0xE04CD59bB93765333200a9da01df83149D4C4d67", "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e", "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223", "0xE08D926c148A5065F4Df2892702785a183de86F9"]) {
    assert.ok(contracts.includes(address), address);
  }
  assert.match(contracts, /`contracts\/verifiers` is not deployed/);
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

test("the pages and the route groups the README lists are the ones under app", () => {
  const pages = section("Pages and routes");
  for (const page of ["fund", "gifts", "me", "cash-out", "what-viky-can-check", "add-your-university", "help", "privacy", "legal", "judges"]) {
    assert.ok(pages.includes(`\`/${page}\``), `/${page} is listed`);
    assert.ok(existsSync(`app/${page}/page.tsx`), `app/${page}/page.tsx exists`);
  }
  // Every folder of routes is named, and none that does not exist.
  const folders = readdirSync("app/api", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const groups = pages.slice(pages.indexOf("Every route is a file under"));
  for (const folder of folders) assert.ok(groups.includes(`\`${folder}\``), `the routes under app/api/${folder} are named`);
  for (const found of groups.slice(0, groups.indexOf("Operator commands")).matchAll(/`([a-z-]+)`/g)) assert.ok(folders.includes(found[1]), `app/api/${found[1]} exists`);
  // The two passes are the crons vercel.json sets.
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  assert.deepEqual(crons.map((cron) => `${cron.path} ${cron.schedule}`), ["/api/cron/daily 30 0 * * *", "/api/cron/settle 0 7 * * *", "/api/cron/watch 0 2 * * *"]);
  assert.match(README, /`\/api\/cron\/daily` at 00:30 UTC and `\/api\/cron\/settle` at 07:00 UTC/);
  assert.match(README, /`\/api\/cron\/watch` at 02:00 UTC/);
  assert.ok(existsSync("app/api/cron/watch/route.ts") && existsSync("app/api/health/route.ts"));
});

test(".env.example names every variable with no value, and each one is read somewhere", () => {
  const example = readFileSync(".env.example", "utf8");
  const names = [...example.matchAll(/^([A-Z][A-Z0-9_]+)=(.*)$/gm)];
  assert.ok(names.length > 40);
  for (const [, name, value] of names) assert.equal(value, "", `${name} carries no value`);
  const read = ["src", "app", "scripts"].flatMap((folder) => readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name)).map((entry) => readFileSync(`${entry.parentPath}/${entry.name}`, "utf8"))).join("\n");
  for (const [, name] of names) assert.ok(read.includes(name), `${name} is read by the code`);
  assert.match(README, /\[`\.env\.example`\]\(\.env\.example\)/);
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
  assert.doesNotMatch(README, /tried the product himself on real phones/);
});
