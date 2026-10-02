// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ConsentAnchor} from "../contracts/ConsentAnchor.sol";
import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmParityV2 {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
}

/// @dev The Solidity half of the pin between the second version's contracts and src/v2-protocol.ts. The SAME hex is
///      asserted in test/v2-protocol.test.ts. If either the contracts or the TypeScript formulas drift, its side
///      fails, so a drift between what a browser signs and what a contract checks fails in CI, not on mainnet.
contract V2TypehashParityTest {
    VmParityV2 private constant VM = VmParityV2(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PIN_OPEN_TH = 0xc04f410f844e05bb80e2244e4132269824ec9cef30df4ff39c994fff894ff348;
    bytes32 private constant PIN_END_TH = 0xe350fd57abfb620d7e481dc2480c7d476343ce19cf7460bd586c7b0f6b563468;
    bytes32 private constant PIN_START_TH = 0x41aee35b19513d4cfd00e8f1c0357e40ec42efe363c9ec295262ea25a03e509a;
    bytes32 private constant PIN_FUND_TAG = 0x49fb844f043b01c05dcd937faae3fbc842cc045c7ff721fc9b9aa42e1e7030e5;
    bytes32 private constant PIN_MILESTONE_FUND_TAG =
        0xee77a665ab5d2ae1fca00b3d90f467d42246a1bd70af954c88254551761f6f64;
    bytes32 private constant PIN_CONSENT_KEY_TH = 0x8e2674bed6524066ecb8ac2080be24b484f38b0933235c8f1a6fbd254d47eeaf;
    // The readings and the withdrawal keep the first version's types (test/GiftTypehashParity.t.sol pins them there).
    bytes32 private constant PIN_CHECK_IN_TH = 0x9d466a7ca50fa84a8a3809bebe71bfcb6d60214fb0f8f371d9920593436a90bd;
    bytes32 private constant PIN_WITHDRAW_TH = 0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e;
    bytes32 private constant PIN_PROOF_TH = 0x2e334597ad17c7a0a6d0115c0a1bd40455a3d23a5358a913c0613e9d33f0558f;
    /// @dev The opening key of the link whose secret is "AbCdEfGhIjKlMnOpQrStUvWxYz012345".
    address private constant PIN_OPENING_KEY = 0x519F812ccB8121840C592066052B9e196d9d03c2;
    bytes32 private constant PIN_DAILY_PARAMS = 0x6305fe0ce52213b871ff22430d8bfa0c0eb5e6ae9d42f0f085b02b8c8d705504;
    bytes32 private constant PIN_DAILY_NONCE = 0x45e13353459322b8459e64e829d386754a233662e90bc237e83f57b70830c17d;
    bytes32 private constant PIN_CLIMB_PARAMS = 0x74017d6c0fd6c44acb402e796b4a85a705d28f8a4959d7f7aea760abddc816c6;
    bytes32 private constant PIN_CLIMB_NONCE = 0x1b6199c91b7cd2b9effdb8e147b527024732a55a9a713a367cc135e9dbfc09a9;
    bytes32 private constant PIN_OPEN_STRUCT = 0xc85c263b170f997da2fd082a3451f57123b07ab088b84af1fc08c61c2d336fe0;
    bytes32 private constant PIN_END_STRUCT = 0x8a6ff1bcda58ec2ddf303e89f8008a97b59a58237c136344b1924ff055e56a06;
    bytes32 private constant PIN_START_STRUCT = 0xe3fb84415047bf8d0c7a75a0bb025cf4ca7808e6e8d856a7762a6cf46b6e0ef6;
    bytes32 private constant PIN_CONSENT_STRUCT = 0x939d1d5f290262fe9769a2a4153985279ccb2bf13f9336ba43f173a23ad9822d;
    address private constant PIN_FUNDER = 0x00000000000000000000000000000000000A11cE;

    GiftEscrowV2 private escrow;
    MilestoneGiftV2 private milestone;
    ConsentAnchor private anchor;

    function setUp() public {
        VM.chainId(143);
        MockAUSD token = new MockAUSD();
        escrow = new GiftEscrowV2(token, VM.addr(1), 1);
        milestone = new MilestoneGiftV2(token, VM.addr(1), 1_000_000);
        anchor = new ConsentAnchor(VM.addr(2));
    }

    function testTypehashesMatchTheTypeScriptPin() public view {
        require(
            escrow.OPEN_TYPEHASH() == PIN_OPEN_TH && milestone.OPEN_TYPEHASH() == PIN_OPEN_TH, "open typehash drift"
        );
        require(escrow.END_TYPEHASH() == PIN_END_TH && milestone.END_TYPEHASH() == PIN_END_TH, "end typehash drift");
        require(
            escrow.START_TYPEHASH() == PIN_START_TH && milestone.START_TYPEHASH() == PIN_START_TH,
            "start typehash drift"
        );
        require(escrow.CHECK_IN_TYPEHASH() == PIN_CHECK_IN_TH, "check-in typehash drift");
        require(milestone.PROOF_TYPEHASH() == PIN_PROOF_TH, "proof typehash drift");
        require(
            escrow.WITHDRAW_TYPEHASH() == PIN_WITHDRAW_TH && milestone.WITHDRAW_TYPEHASH() == PIN_WITHDRAW_TH,
            "withdraw typehash drift"
        );
        require(escrow.FUND_NONCE_TAG() == PIN_FUND_TAG, "fund nonce tag drift");
        require(milestone.FUND_NONCE_TAG() == PIN_MILESTONE_FUND_TAG, "milestone fund nonce tag drift");
        require(anchor.CONSENT_KEY_TYPEHASH() == PIN_CONSENT_KEY_TH, "consent key typehash drift");
    }

    /// @dev The key a link's secret makes is the same key in a browser and here: the address the terms carry.
    function testTheOpeningKeyOfALinkMatchesTheTypeScriptPin() public {
        uint256 key = uint256(keccak256("viky:open:v2:AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
        require(VM.addr(key) == PIN_OPENING_KEY, "opening key derivation drift");
    }

    function testFundingNoncesMatchTheTypeScriptPin() public view {
        GiftEscrowV2.GiftParams memory p = GiftEscrowV2.GiftParams({
            funder: PIN_FUNDER,
            refundTo: PIN_FUNDER,
            openingKey: PIN_OPENING_KEY,
            goalType: 1,
            dailyTarget: 10,
            durationDays: 7,
            amount: 5_000_000,
            salt: bytes32(uint256(1))
        });
        require(escrow.hashGiftParams(p) == PIN_DAILY_PARAMS, "daily params hash drift");
        require(escrow.fundingNonce(p) == PIN_DAILY_NONCE, "daily funding nonce drift");

        MilestoneGiftV2.MilestoneParams memory m = MilestoneGiftV2.MilestoneParams({
            funder: PIN_FUNDER,
            refundTo: PIN_FUNDER,
            openingKey: PIN_OPENING_KEY,
            goalType: 1,
            shape: 0,
            target: 1500,
            maximumStart: 1300,
            subject: bytes32(0),
            durationDays: 30,
            amount: 25_000_000,
            salt: bytes32(uint256(1))
        });
        require(milestone.hashParams(m) == PIN_CLIMB_PARAMS, "milestone params hash drift");
        require(milestone.fundingNonce(m) == PIN_CLIMB_NONCE, "milestone funding nonce drift");
    }

    function testTheStructsABrowserSignsMatchTheTypeScriptPin() public pure {
        require(
            keccak256(abi.encode(PIN_OPEN_TH, uint256(7), PIN_FUNDER, uint64(1_800_000_600))) == PIN_OPEN_STRUCT,
            "open struct drift"
        );
        require(
            keccak256(
                abi.encode(
                    PIN_END_TH, uint256(7), uint256(2_000_000), uint256(5_000_000), uint256(3), uint64(1_800_000_600)
                )
            ) == PIN_END_STRUCT,
            "end struct drift"
        );
        require(
            keccak256(
                abi.encode(
                    PIN_START_TH,
                    uint256(7),
                    bytes32(0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd),
                    uint64(1_000),
                    uint64(1_800_000_000)
                )
            ) == PIN_START_STRUCT,
            "start struct drift"
        );
        bytes32 key = 0xabababababababababababababababababababababababababababababababab;
        require(
            keccak256(abi.encode(PIN_CONSENT_KEY_TH, PIN_FUNDER, key)) == PIN_CONSENT_STRUCT, "consent struct drift"
        );
    }

    function testDomainsMatchTheTypeScriptPin() public view {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        require(
            keccak256(bytes(name)) == keccak256("Viky Gift") && keccak256(bytes(version)) == keccak256("2"), "daily"
        );
        require(chainId == 143 && verifying == address(escrow), "daily domain binding drift");
        (, name, version, chainId, verifying,,) = milestone.eip712Domain();
        require(
            keccak256(bytes(name)) == keccak256("Viky Milestone") && keccak256(bytes(version)) == keccak256("2"),
            "milestone"
        );
        require(chainId == 143 && verifying == address(milestone), "milestone domain binding drift");
        (, name, version, chainId, verifying,,) = anchor.eip712Domain();
        require(
            keccak256(bytes(name)) == keccak256("Viky Consent") && keccak256(bytes(version)) == keccak256("1"),
            "consent"
        );
        require(chainId == 143 && verifying == address(anchor), "consent domain binding drift");
    }
}
