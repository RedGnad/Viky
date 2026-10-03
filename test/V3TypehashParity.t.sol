// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmParityV3 {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
}

/// @dev What a browser and the server sign for the third daily contract, pinned. Every signed type is the second
///      version's, word for word, so its typehash is the second version's and is checked against that contract
///      itself. What differs is what marks the version: the funding tag, hence the funding nonce of the same terms,
///      and the version of the signing domain. A signature made for one version is therefore never one for the other
///      (test/V3FirstReading.t.sol sends one and sees it refused).
contract V3TypehashParityTest {
    VmParityV3 private constant VM = VmParityV3(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev keccak256("viky.fund.v3").
    bytes32 private constant PIN_FUND_TAG = 0x2624e87505ddc5e6017bc49a4eb71a7e9bc774bf67aa0dc15e453c1503bcd207;
    /// @dev The terms test/V2TypehashParity.t.sol pins, whose hash is the same on both versions.
    bytes32 private constant PIN_DAILY_PARAMS = 0x6305fe0ce52213b871ff22430d8bfa0c0eb5e6ae9d42f0f085b02b8c8d705504;
    bytes32 private constant PIN_DAILY_NONCE = 0xeb24f30dc97d72ca0b71e214d9affbaec3f22c633a12aaefbb8b3243144fbbdd;
    address private constant PIN_OPENING_KEY = 0x519F812ccB8121840C592066052B9e196d9d03c2;
    address private constant PIN_FUNDER = 0x00000000000000000000000000000000000A11cE;

    GiftEscrowV2 private second;
    GiftEscrowV3 private escrow;

    function setUp() public {
        VM.chainId(143);
        MockAUSD token = new MockAUSD();
        second = new GiftEscrowV2(token, VM.addr(1), 1);
        escrow = new GiftEscrowV3(token, VM.addr(1), 1);
    }

    function testEverySignedTypeIsTheSecondVersions() public view {
        require(escrow.OPEN_TYPEHASH() == second.OPEN_TYPEHASH(), "open typehash drift");
        require(escrow.CHECK_IN_TYPEHASH() == second.CHECK_IN_TYPEHASH(), "check-in typehash drift");
        require(escrow.START_TYPEHASH() == second.START_TYPEHASH(), "start typehash drift");
        require(escrow.WITHDRAW_TYPEHASH() == second.WITHDRAW_TYPEHASH(), "withdraw typehash drift");
        require(escrow.END_TYPEHASH() == second.END_TYPEHASH(), "end typehash drift");
    }

    function testTheFundingTagAndNonceAreTheThirdVersionsOwn() public view {
        require(escrow.FUND_NONCE_TAG() == PIN_FUND_TAG, "fund nonce tag drift");
        require(escrow.FUND_NONCE_TAG() != second.FUND_NONCE_TAG(), "the tag of the second version");
        GiftEscrowV3.GiftParams memory p = GiftEscrowV3.GiftParams({
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
    }

    function testTheDomainIsTheThirdVersions() public view {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        require(
            keccak256(bytes(name)) == keccak256("Viky Gift") && keccak256(bytes(version)) == keccak256("3"), "daily"
        );
        require(chainId == 143 && verifying == address(escrow), "daily domain binding drift");
        require(escrow.CONTRACT_SCHEMA_ID() == 3, "schema");
    }

    /// @dev Everything a person or the owner can call is what the second version offers, by the same name and with
    ///      the same arguments: the constants that bound a gift, a day and a pause are the same figures.
    function testTheBoundsAreTheSecondVersions() public view {
        require(escrow.CATCH_UP_WINDOW() == second.CATCH_UP_WINDOW(), "catch-up window");
        require(escrow.READING_GRACE() == second.READING_GRACE(), "reading grace");
        require(escrow.MAX_OBSERVATION_AGE() == second.MAX_OBSERVATION_AGE(), "observation age");
        require(escrow.MAX_ATTESTATION_AGE() == second.MAX_ATTESTATION_AGE(), "attestation age");
        require(escrow.MAX_CLOCK_SKEW() == second.MAX_CLOCK_SKEW(), "clock skew");
        require(escrow.UNCLAIMED_REFUND_DELAY() == second.UNCLAIMED_REFUND_DELAY(), "refund delay");
        require(escrow.MAX_PAUSE() == second.MAX_PAUSE() && escrow.PAUSE_REST() == second.PAUSE_REST(), "pause");
        require(escrow.SIGNER_DELAY() == second.SIGNER_DELAY(), "signer delay");
        require(escrow.MIN_AMOUNT() == second.MIN_AMOUNT() && escrow.MAX_AMOUNT() == second.MAX_AMOUNT(), "amounts");
        require(
            escrow.MIN_DURATION_DAYS() == second.MIN_DURATION_DAYS()
                && escrow.MAX_DURATION_DAYS() == second.MAX_DURATION_DAYS(),
            "durations"
        );
    }
}
