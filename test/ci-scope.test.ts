import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * What a change asks of the CI (the founder, 1 Oct 2026): three jobs side by side, a tree walked once, and two things
 * skipped and no third. `scripts/ci-scope.sh` decides the two, and this holds it to the one rule that matters:
 * nothing is lightened for what touches money.
 */
function scope(paths: readonly string[]): { contracts: boolean; browser: boolean } {
  const run = spawnSync("bash", ["scripts/ci-scope.sh"], { input: paths.map((path) => `${path}\n`).join(""), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const answers = Object.fromEntries(run.stdout.trim().split("\n").map((line) => line.split("=")));
  assert.deepEqual(Object.keys(answers).sort(), ["browser", "contracts"], "two answers, in the form a step writes to its outputs");
  return { contracts: answers.contracts === "true", browser: answers.browser === "true" };
}

test("a change of screens, of their words and of TypeScript tests walks the screens and does not run forge", () => {
  assert.deepEqual(scope(["app/kit/YouDecide.tsx", "app/globals.css", "src/sentences.ts", "test/browser/you-decide.spec.ts", "test/gift-live.test.ts", "public/characters.svg"]), { contracts: false, browser: true });
});

test("a change of documents alone runs neither forge nor the browser", () => {
  assert.deepEqual(scope(["README.md", "docs/reclaim/notes.md", "LICENSE", "SECURITY.md"]), { contracts: false, browser: false });
  // One file that is not a document, and the screens are walked again.
  assert.deepEqual(scope(["README.md", "app/page.tsx"]), { contracts: false, browser: true });
});

test("nothing is lightened for what touches money: contracts, relays and payment routes keep the whole suite", () => {
  const money = [
    "contracts/GiftEscrowV2.sol",
    "test/GiftEscrowV2.t.sol",
    "foundry.toml",
    "remappings.txt",
    "src/gift-relay.ts",
    "src/milestone-relay.ts",
    "src/exit-relay.ts",
    "src/relayer.ts",
    "src/monad/chain.ts",
    "src/gift-gas.ts",
    "src/gift-creation.ts",
    "src/daily-pass.ts",
    "src/client/onchain.ts",
    "app/api/gift/create/route.ts",
    "app/api/gift/[id]/end/route.ts",
    "app/api/exit/relay/route.ts",
    "app/api/fund/quote/route.ts",
    "app/api/phone/pay/route.ts",
    "app/api/cron/daily/route.ts",
    "scripts/deploy-v2.ts",
    "scripts/keeper.ts",
  ];
  for (const path of money) assert.deepEqual(scope([path]), { contracts: true, browser: true }, path);
  // Beside a hundred screens, one of them still asks for everything.
  assert.deepEqual(scope(["app/kit/Home.tsx", "README.md", "src/gift-relay.ts"]), { contracts: true, browser: true });
});

test("a path nobody thought of runs everything, and so does a change that could not be read", () => {
  for (const path of [".github/workflows/ci.yml", "scripts/ci-scope.sh", "package.json", "pnpm-lock.yaml", "next.config.mjs", "src/conditions.ts", "src/consent-terms.ts", "vercel.json", "a-new-folder/thing.ts"]) {
    assert.deepEqual(scope([path]), { contracts: true, browser: true }, path);
  }
  assert.deepEqual(scope([]), { contracts: true, browser: true }, "no path at all is not a change that was measured");
});

test("the workflow runs three jobs side by side, marks a tree only after a green pass, and reads the mark first", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const job = (name: string) => {
    const from = workflow.indexOf(`\n  ${name}:\n`);
    assert.ok(from > 0, `no job ${name}`);
    const next = workflow.slice(from + 1).search(/\n {2}[a-z]+:\n/);
    return workflow.slice(from, next < 0 ? undefined : from + 1 + next);
  };
  // The three jobs wait for the scope and for nothing else, so they run side by side.
  for (const name of ["contracts", "policy", "browser"]) assert.match(job(name), /\n {4}needs: scope\n/, `${name} waits for another job`);
  assert.match(job("browser"), /part: \[1, 2, 3\]/, "the screens in three parts");
  assert.match(job("browser"), /pnpm test:browser --shard=\$\{\{ matrix\.part \}\}\/3/);
  // The policy tests run on every pass that is not stopped by the mark; the two others also ask the scope.
  assert.match(job("policy"), /if: needs\.scope\.outputs\.validated != 'true'\n/);
  assert.match(job("contracts"), /if: needs\.scope\.outputs\.validated != 'true' && needs\.scope\.outputs\.contracts == 'true'\n/);
  assert.match(job("browser"), /if: needs\.scope\.outputs\.validated != 'true' && needs\.scope\.outputs\.browser == 'true'\n/);
  // Forge keeps its four steps, on the mainnet fork.
  for (const step of ["forge fmt --check", "forge build", "pnpm check:contract-sizes", "forge test --network monad"]) assert.ok(job("contracts").includes(step), step);
  // The mark: named after the tree that was tested, written only when the policy tests passed and nothing failed or
  // was cut, and looked for before anything runs.
  const mark = job("validated");
  assert.match(mark, /needs: \[scope, contracts, policy, browser\]/);
  assert.match(mark, /needs\.policy\.result == 'success' && !contains\(needs\.\*\.result, 'failure'\) && !contains\(needs\.\*\.result, 'cancelled'\)/);
  assert.match(mark, /name: validated-\$\{\{ needs\.scope\.outputs\.tree \}\}/);
  assert.match(job("scope"), /tree=\$\(git rev-parse 'HEAD\^\{tree\}'\)/);
  assert.match(job("scope"), /actions\/artifacts\?name=validated-\$tree/);
  assert.match(job("scope"), /\|\| echo 0\)/, "a lookup that fails finds no mark, and the pass runs");
  // The workflow asks to read and nothing more.
  assert.match(workflow, /permissions:\n {2}contents: read\n[^]*? {2}actions: read\n {2}pull-requests: read\n\nconcurrency:/);
});
