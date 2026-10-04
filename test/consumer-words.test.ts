import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { scanSource } from "../src/consumer-words";

const flagged = (file: string, text: string) => scanSource(file, text).map((f) => f.text);

describe("consumer words guard", () => {
  it("flags readable text: JSX text, text attributes, sentences, templates", () => {
    assert.deepEqual(flagged("a.tsx", "export const A = () => <p>Connect your wallet</p>;"), ["Connect your wallet"]);
    assert.deepEqual(flagged("a.tsx", 'export const A = () => <input placeholder="Your address" />;'), ["Your address"]);
    assert.deepEqual(flagged("a.ts", 'throw new Error("Not enough gas left");'), ["Not enough gas left"]);
    assert.deepEqual(flagged("a.ts", "const m = `Sent to ${x}, see the transaction hash`;"), ["Sent to  , see the transaction hash"]);
    assert.deepEqual(flagged("a.tsx", 'export const A = () => <p>{"Tokens"}</p>;'), ["Tokens"]);
  });

  it("never flags code: identifiers, keys, single-word literals, non-text attributes", () => {
    assert.deepEqual(flagged("a.ts", "const address = wallet.address; const token = params.get(\"token\");"), []);
    assert.deepEqual(flagged("a.ts", 'const headers = { "x-token": "1" }; const q = { address: 1 };'), []);
    assert.deepEqual(flagged("a.tsx", 'export const A = () => <a className="wallet-link" href="/wallet">Home</a>;'), []);
    assert.deepEqual(flagged("a.ts", 'import { chain } from "./chain";'), []);
  });

  it("respects a justified allow marker", () => {
    assert.deepEqual(flagged("a.ts", 'const m = "Gas is paid for you"; // consumer-words: allow judges copy'), []);
  });

  it("does not match inside longer words", () => {
    assert.deepEqual(flagged("a.ts", 'const m = "The blockchain regas addressed seedling tokenised text";'), []);
  });
});

/**
 * The product is written in English, and a French word slipped into it twice: "Like Mom, or Tom" under the funder's
 * name, and the same name drawn on the default link preview (founder, 18 Sep 2026).
 *
 * This is a smoke test, not a language check: it cannot prove a file is English, it catches the words most likely to
 * come back from a conversation held in French. The list is short on purpose, and every word in it is one no English
 * sentence of this product would ever carry.
 */
describe("the words a person reads are English", () => {
  const FRENCH = ["mom", "papa", "bonjour", "merci", "cadeau", "argent", "compte", "aujourd'hui", "pseudo", "connexion", "montant"];
  const READ_BY_PEOPLE = ["src/sentences.ts", "src/conditions.ts", "src/milestone-conditions.ts", "src/condition-proof.ts", "app/kit/example-gift.ts"];
  it("catches a French word in what the product says", () => {
    for (const file of READ_BY_PEOPLE) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const word of FRENCH) {
        assert.ok(!new RegExp(`\\b${word}\\b`).test(text), `${file} carries the French word "${word}"`);
      }
    }
  });
});
