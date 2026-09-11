import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { devPagesEnabled, isOperator, operatorAccounts } from "../src/dev-access";

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761";
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d";

describe("dev access", () => {
  it("parses the operator list, ignoring blanks and invalid entries, case-insensitively", () => {
    const set = operatorAccounts(` ${A.toLowerCase()} , nope,, ${B} `);
    assert.equal(set.size, 2);
    assert.ok(isOperator(A.toUpperCase().replace("0X", "0x"), `${A},${B}`));
    assert.ok(isOperator(B.toLowerCase(), `${A},${B}`));
  });

  it("refuses everyone when the list is empty or the account is unknown", () => {
    assert.equal(isOperator(A, ""), false);
    assert.equal(isOperator("0x0000000000000000000000000000000000000001", `${A}`), false);
    assert.equal(isOperator(null, `${A}`), false);
    assert.equal(isOperator("not-an-account", `${A}`), false);
  });

  it("keeps dev pages off unless both the switch and an operator list are set", () => {
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "1", VIKY_OPERATOR_ACCOUNTS: "" }), false);
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "0", VIKY_OPERATOR_ACCOUNTS: A }), false);
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "1", VIKY_OPERATOR_ACCOUNTS: A }), true);
  });
});
