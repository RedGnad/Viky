import assert from "node:assert/strict";
import test from "node:test";
import { addMonadGasBuffer, MONAD_GAS_MARGIN_BPS } from "../src/monad-gas";

test("adds the 7.5 percent Monad gas margin, rounded up", () => {
  assert.equal(MONAD_GAS_MARGIN_BPS, 750n);
  assert.equal(addMonadGasBuffer(100_000n), 107_500n);
  assert.equal(addMonadGasBuffer(1n), 2n);
  assert.equal(addMonadGasBuffer(133n), 143n);
  assert.throws(() => addMonadGasBuffer(0n), /positive/);
  assert.throws(() => addMonadGasBuffer(-5n), /positive/);
});
