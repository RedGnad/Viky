// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ExitRouter} from "../contracts/ExitRouter.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

/// @dev The Solidity half of the way out's parity pin. The SAME hex is asserted in test/exit-terms.test.ts.
///      The nonce of the authorization is the hash of these terms, so a drift between the screen's formula
///      and the contract's would not be a wrong number: the token would simply refuse every signature, and
///      nobody could be paid. It fails here instead, in CI.
///
///      Regenerated for D77: the coin coming back is now named inside the terms, because the two payout
///      services take different ones and a router pinned to either would close the other's corridor.
contract ExitTermsParityTest {
    bytes32 private constant PIN_TAG = 0x0de910a1b0f5e4b17afad1da2ba4244aa30c5610373da5d1d456c6b22b1b1d8b;
    bytes32 private constant PIN_TERMS = 0xc92bda34589b9e0db645b39b5d7d78af9b3add4c4f62afe742c03127d3de7d7c;
    bytes32 private constant PIN_NONCE = 0x196cac2a2acfb5bf33ca8c2f8b42d73bc790a68b3f08743a9a1afc0c5c3f8d08;

    ExitRouter private router;

    function setUp() public {
        router = new ExitRouter(new MockAUSD());
    }

    function _terms() private pure returns (ExitRouter.ExitTerms memory) {
        return ExitRouter.ExitTerms({
            payer: 0x00000000000000000000000000000000000A11cE,
            amount: 3_000_000,
            // The stablecoin one of the two services takes, on Monad. The other takes the chain's own coin,
            // which the same struct carries as zero.
            tokenOut: 0x754704Bc059F8C67012fEd69BC8A327a5aafb603,
            // Six decimals now, not eighteen.
            minOut: 2_997_000,
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

    /// @dev The tag moved with the struct, twice now. If it had not, a signature made for older terms would
    ///      still hash to a nonce this contract accepts, and those bytes mean something else here: v1 read a
    ///      destination where v3 reads a coin.
    function testTheTagIsNotOneAnOlderSignatureWouldProduce() public view {
        require(router.EXIT_NONCE_TAG() != keccak256("viky.exit.v1"), "the tag must move with the terms");
        require(router.EXIT_NONCE_TAG() != keccak256("viky.exit.v2"), "the tag must move with the terms");
    }

    /// @dev Zero is a real value of this field and not a missing one, so it is pinned too: a formula that
    ///      dropped the coin when it was the chain's own would agree with the pin above and disagree here.
    function testTheChainsOwnCoinIsPartOfTheHashLikeAnyOther() public view {
        ExitRouter.ExitTerms memory native = _terms();
        native.tokenOut = address(0);
        require(router.hashTerms(native) != PIN_TERMS, "the coin must change the hash, zero included");
    }
}
