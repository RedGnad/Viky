// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrow} from "../contracts/GiftEscrow.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmParity {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
}

/// @dev The Solidity half of the EIP-712 parity pin. The SAME hex is asserted in test/gift-attestation.test.ts.
///      If either the contract or the TypeScript formula drifts, its side fails, so a drift between the signer
///      and the contract fails in CI, not on mainnet. chainId is forced to 143, the deployed chain.
contract GiftTypehashParityTest {
    VmParity private constant VM = VmParity(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PIN_CHECK_IN_TH = 0x9d466a7ca50fa84a8a3809bebe71bfcb6d60214fb0f8f371d9920593436a90bd;
    bytes32 private constant PIN_CLAIM_TH = 0x2cc2ef1342b642e75667cc06ec45e6fcd050584c714b83316da1360cdfa9a44f;
    bytes32 private constant PIN_WITHDRAW_TH = 0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e;
    bytes32 private constant PIN_FUND_NONCE_TAG = 0x778db84091eb415c574d04413372a2e9ce3882b8dbf9b23ad62e7ceef3f52408;
    bytes32 private constant PIN_CONTACT = 0x051ba1efa40687e649c5a3403f00a0031510d61c8355521acc2eac285f4a7a7c;
    bytes32 private constant PIN_PARAMS_HASH = 0x32fa16f869d1afa32edc136fee91a503f143f3b6b1122b9774c47d4803d85bf2;
    bytes32 private constant PIN_FUNDING_NONCE = 0x1f43cae02ca8df344a572307cad4a8c47cb1ec23a3c234d96eacf201e86ec5ee;
    address private constant PIN_FUNDER = 0x00000000000000000000000000000000000A11cE;

    GiftEscrow private escrow;

    function setUp() public {
        VM.chainId(143);
        escrow = new GiftEscrow(new MockAUSD(), VM.addr(1), 1);
    }

    function testTypehashesMatchTheTypeScriptPin() public view {
        require(escrow.CHECK_IN_TYPEHASH() == PIN_CHECK_IN_TH, "check-in typehash drift");
        require(escrow.CLAIM_TYPEHASH() == PIN_CLAIM_TH, "claim typehash drift");
        require(escrow.WITHDRAW_TYPEHASH() == PIN_WITHDRAW_TH, "withdraw typehash drift");
        require(escrow.FUND_NONCE_TAG() == PIN_FUND_NONCE_TAG, "fund nonce tag drift");
    }

    function testFundingNonceMatchesTheTypeScriptPin() public view {
        require(keccak256("viky:contact:v1:email:ama@example.com") == PIN_CONTACT, "contact hash drift");
        GiftEscrow.GiftParams memory p = GiftEscrow.GiftParams({
            funder: PIN_FUNDER,
            refundTo: PIN_FUNDER,
            recipientContactHash: PIN_CONTACT,
            goalType: 1,
            dailyTarget: 10,
            durationDays: 7,
            amount: 5_000_000,
            salt: bytes32(uint256(1))
        });
        require(escrow.hashGiftParams(p) == PIN_PARAMS_HASH, "params hash drift");
        require(escrow.fundingNonce(p) == PIN_FUNDING_NONCE, "funding nonce drift");
    }

    function testDomainMatchesTheTypeScriptPin() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            escrow.eip712Domain();
        require(keccak256(bytes(name)) == keccak256("Viky Gift"), "domain name drift");
        require(keccak256(bytes(version)) == keccak256("1"), "domain version drift");
        require(chainId == 143 && verifyingContract == address(escrow), "domain binding drift");
    }
}
