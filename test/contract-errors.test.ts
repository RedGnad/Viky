import assert from "node:assert/strict";
import test from "node:test";
import { decodeContractError } from "../src/relayer";

/**
 * The decoder had no test, and it was blind to the one shape viem actually produces: the name arrives
 * already decoded, inside `data`, one layer down. Every typed refusal from the contract therefore reached
 * the person as "this could not be recorded", which named nothing and sent us chasing the wrong causes for
 * an evening (D51).
 */

const nested = (data: unknown) => ({
  name: "ContractFunctionExecutionError",
  cause: { name: "ContractFunctionRevertedError", data, cause: { name: "CallExecutionError", cause: {} } },
});

test("a typed refusal is read from the shape viem really gives", () => {
  assert.equal(decodeContractError(nested({ errorName: "InvalidRecipientSignature", args: [] })), "InvalidRecipientSignature");
  assert.equal(decodeContractError(nested({ errorName: "NothingToDrain", args: [] })), "NothingToDrain");
});

test("a refusal written as a sentence keeps its sentence", () => {
  // Solidity calls this one "Error" and puts the sentence in its arguments. Returning the name alone would
  // lose the only part that says anything, and a library inside the contract refuses this way.
  assert.equal(decodeContractError(nested({ errorName: "Error", args: ["ECDSA: invalid signature"] })), "ECDSA: invalid signature");
  assert.equal(decodeContractError(nested({ errorName: "Error", args: ["SafeERC20: low-level call failed"] })), "SafeERC20: low-level call failed");
  // With no sentence to give, the name is still better than nothing.
  assert.equal(decodeContractError(nested({ errorName: "Error", args: [] })), "Error");
});

test("the older shapes still read, and nothing is invented", () => {
  assert.equal(decodeContractError({ errorName: "AlreadyClaimed" }), "AlreadyClaimed");
  assert.equal(decodeContractError(nested(undefined)), undefined);
  assert.equal(decodeContractError({ cause: { cause: { cause: {} } } }), undefined);
  assert.equal(decodeContractError(new Error("something else")), undefined);
  assert.equal(decodeContractError(undefined), undefined);
  assert.equal(decodeContractError("not an error"), undefined);
});
