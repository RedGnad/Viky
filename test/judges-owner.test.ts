import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { ownedContracts, ownershipWords, readOwnership, type OwnerReader } from "../src/judges-owner";

/**
 * Two lines of the money path review of 23 Sep 2026 (D187): the judges page says who owns the contracts from the
 * chain, never from a sentence written down, and every endpoint it prints is the public one, never the browser
 * variable, which carries a key.
 */
const SAFE = "0xE08D926c148A5065F4Df2892702785a183de86F9";
const A = "0x0000000000000000000000000000000000000aa1" as Hex;
const B = "0x0000000000000000000000000000000000000bb2" as Hex;
const FOUR = [
  { label: "gifts", address: A },
  { label: "milestone gifts", address: B },
];

function reader(owners: Record<string, string | Error>, safe: Parameters<OwnerReader["safe"]> extends never ? never : Awaited<ReturnType<OwnerReader["safe"]>> | Error): OwnerReader {
  return {
    owner: async (address) => {
      const answer = owners[address];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    safe: async () => {
      if (safe instanceof Error) throw safe;
      return safe;
    },
  };
}

test("when every contract answers the same address, that address is asked what it is, and the sentence says so", async () => {
  const ownership = await readOwnership(reader({ [A]: SAFE, [B]: SAFE.toLowerCase() }, { version: "1.4.1", threshold: 2, owners: ["0x1", "0x2", "0x3"] }), FOUR);
  assert.equal(ownership.one, SAFE);
  assert.deepEqual(ownership.safe, { version: "1.4.1", threshold: 2, owners: ["0x1", "0x2", "0x3"] });
  const words = ownershipWords(ownership);
  assert.ok(words.includes(`One owner holds all 2 (gifts, milestone gifts), read from the chain as this page was served: ${SAFE}, a Safe 1.4.1 that signs with 2 of its 3 keys`), words);
  assert.ok(words.includes("needs 2 of those signatures on any of them, and no single key can."), words);
});

test("when the owners differ, or one cannot be read, the sentence says which is which and claims no single owner", async () => {
  const differ = await readOwnership(reader({ [A]: SAFE, [B]: "0x0000000000000000000000000000000000000cc3" }, new Error("never asked")), FOUR);
  assert.equal(differ.one, null);
  assert.equal(differ.safe, null);
  assert.ok(ownershipWords(differ).startsWith("The contracts do not answer one owner right now"), ownershipWords(differ));
  const unread = await readOwnership(reader({ [A]: SAFE, [B]: new Error("timeout") }, new Error("never asked")), FOUR);
  assert.equal(unread.one, null);
  assert.ok(ownershipWords(unread).includes(`milestone gifts ${B}: could not be read just now`), ownershipWords(unread));
});

test("an owner that is not a Safe is said to be one address, with no key count invented", async () => {
  const plain = await readOwnership(reader({ [A]: SAFE, [B]: SAFE }, new Error("not a Safe")), FOUR);
  assert.equal(plain.one, SAFE);
  assert.equal(plain.safe, null);
  const words = ownershipWords(plain);
  assert.ok(words.includes("which does not answer as a Safe this page can read"), words);
  assert.ok(words.includes("needs that owner's signature"), words);
});

test("the contracts come from the environment, by name, and one not configured is left out", () => {
  const env = { NEXT_PUBLIC_GIFT_ESCROW_ADDRESS: A, EXIT_ROUTER_ADDRESS: B, NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS: "not an address", NEXT_PUBLIC_USDC_ROUTER_ADDRESS: SAFE } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(ownedContracts(env), [
    { label: "gifts", address: A },
    { label: "the way out", address: B },
    // The converter of card payments, once its address is set (3 Oct 2026): its owner is read with the others'.
    { label: "the converter of card payments", address: SAFE },
  ]);
  assert.equal(ownershipWords({ contracts: [], one: null, safe: null }), "No contract is configured here, so nothing can be said about who owns them.");
});

test("no judges surface prints the browser's endpoint, and every command it prints names the public one", () => {
  const files = [
    ...readdirSync("app/judges").filter((name) => name.endsWith(".tsx")).map((name) => `app/judges/${name}`),
    ...readdirSync("app/components").filter((name) => name.includes("Judges") && name.endsWith(".tsx")).map((name) => `app/components/${name}`),
    "src/judges-chain.ts",
    "src/judges-owner.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (file.startsWith("app/")) assert.equal(source.includes("monadRpcUrl"), false, `${file} must not print or import the browser's endpoint`);
    for (const match of source.matchAll(/--rpc-url [^\s`"']+/g)) assert.equal(match[0], "--rpc-url ${PUBLIC_RPC_URL}", `${file}: ${match[0]}`);
    assert.equal(/NEXT_PUBLIC_MONAD_RPC_URL/.test(source), false, `${file} names the variable`);
  }
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.equal(page.includes("One wallet owns"), false, "the owner is read, not written");
  assert.ok(page.includes("ownershipWords("), "the owner sentence is the one read from the chain");
});
