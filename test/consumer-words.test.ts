import assert from "node:assert/strict";
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
