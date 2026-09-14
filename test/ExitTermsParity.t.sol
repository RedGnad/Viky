// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ExitRouter} from "../contracts/ExitRouter.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

/// @dev The Solidity half of the way out's parity pin. The SAME hex is asserted in test/exit-terms.test.ts.
///      The nonce of the authorization is the hash of these terms, so a drift between the screen's formula
///      and the contract's would not be a wrong number: the token would simply refuse every signature, and
///      nobody could be paid. It fails here instead, in CI.
contract ExitTermsParityTest {
    bytes32 private constant PIN_TAG = 0xdd4bba613d066136bca6ad1767334a869d95213754ff7c20fb74938a5e4436b1;
    bytes32 private constant PIN_TERMS = 0xccad8506d70276c93375f96e5ec8d7e692deebf95ff95de12e37bbafc8ae6e1d;
    bytes32 private constant PIN_NONCE = 0xa6090652bd18818b0eab2ae7c9a21f66bd3559657c7972884ce8a6136cbe0503;

    ExitRouter private router;

    function setUp() public {
        router = new ExitRouter(new MockAUSD());
    }

    function _terms() private pure returns (ExitRouter.ExitTerms memory) {
        return ExitRouter.ExitTerms({
            payer: 0x00000000000000000000000000000000000A11cE,
            payoutTo: 0x0000000000000000000000000000000000000B0b,
            amount: 3_000_000,
            minOut: 126_000_000_000_000_000_000,
            exchange: 0xb3e6778480b2E488385E8205eA05E20060B813cb,
            callHash: bytes32(uint256(1)),
            deadline: 1_800_000_600,
            salt: bytes32(uint256(2))
        });
    }

    function testTheTagAndTheTermsMatchTheTypeScriptPin() public view {
        require(router.EXIT_NONCE_TAG() == PIN_TAG, "exit nonce tag drift");
        require(router.hashTerms(_terms()) == PIN_TERMS, "terms hash drift");
        require(router.exitNonce(_terms()) == PIN_NONCE, "exit nonce drift");
    }
}
