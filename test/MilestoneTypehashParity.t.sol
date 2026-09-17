// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MilestoneGift} from "../contracts/MilestoneGift.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmMilestoneParity {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
}

/// @dev The Solidity half of the milestone protocol pin. The SAME hex is asserted in test/milestone-protocol.test.ts,
///      so the terms the funder's screen signs, the proofs the evidence signer signs and the contract that checks both
///      cannot drift apart without one side failing in CI. chainId is forced to 143, the deployed chain.
contract MilestoneTypehashParityTest {
    VmMilestoneParity private constant VM = VmMilestoneParity(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PIN_CLAIM_TH = 0x2cc2ef1342b642e75667cc06ec45e6fcd050584c714b83316da1360cdfa9a44f;
    bytes32 private constant PIN_PROOF_TH = 0x2e334597ad17c7a0a6d0115c0a1bd40455a3d23a5358a913c0613e9d33f0558f;
    bytes32 private constant PIN_WITHDRAW_TH = 0x934fbda9a8be236a524d3f7d43c9cc2c829b9a8ab1c9e54726f96800fa14137e;
    bytes32 private constant PIN_FUND_NONCE_TAG = 0x3f630561bddd9d392e0f5542a24baa7d9db51ac2d836df26e18886f03cff1860;
    bytes32 private constant PIN_NO_CONTACT = 0x6159a8d5bbbbf3f243f3b1bc36324cf58617b4a0c69727ee4c35188b65423b97;
    bytes32 private constant PIN_PARAMS_HASH = 0xbe1cf1f6253514a1ff39971b7ef2300b04b4dd227dfd808c913d3d825e4f5eea;
    bytes32 private constant PIN_FUNDING_NONCE = 0x6b2b0396432e5429078494d52f7c45bf6d41bd08504ea384e3422eafcd863d8b;
    bytes32 private constant PIN_RAPID = 0x56c9a42f353c58f8ef74b979c6a74fa6144562aed8f7fe5cf93c9cbeeef93b40;
    bytes32 private constant PIN_BLITZ = 0xc57bd1392946f1743380ebedbe6561e03e5a6e8bdaa6af8879b89caa5dc3fd36;
    bytes32 private constant PIN_BULLET = 0x2b19a55b3e63943851b302dd0601451792be3cb97fadfa8047cb876900084330;
    bytes32 private constant PIN_DAILY = 0xb55b5e37e9fa879c5bc5adbffa5ca98372cc00d8fe21279e827cf9c94d3706e3;
    address private constant PIN_FUNDER = 0x00000000000000000000000000000000000A11cE;

    MilestoneGift private gift;

    function setUp() public {
        VM.chainId(143);
        gift = new MilestoneGift(new MockAUSD(), VM.addr(1), 1_000_000);
    }

    function testTypehashesMatchTheTypeScriptPin() public view {
        require(gift.CLAIM_TYPEHASH() == PIN_CLAIM_TH, "claim typehash drift");
        require(gift.PROOF_TYPEHASH() == PIN_PROOF_TH, "proof typehash drift");
        require(gift.WITHDRAW_TYPEHASH() == PIN_WITHDRAW_TH, "withdraw typehash drift");
        require(gift.FUND_NONCE_TAG() == PIN_FUND_NONCE_TAG, "fund nonce tag drift");
    }

    function testFundingNonceMatchesTheTypeScriptPin() public view {
        require(keccak256("viky:contact:v1:none") == PIN_NO_CONTACT, "no-contact hash drift");
        MilestoneGift.MilestoneParams memory p = MilestoneGift.MilestoneParams({
            funder: PIN_FUNDER,
            refundTo: PIN_FUNDER,
            recipientContactHash: PIN_NO_CONTACT,
            goalType: 1,
            shape: 0,
            target: 1500,
            maximumStart: 1430,
            subject: bytes32(0),
            durationDays: 30,
            amount: 25_000_000,
            salt: bytes32(uint256(1))
        });
        require(gift.hashParams(p) == PIN_PARAMS_HASH, "params hash drift");
        require(gift.fundingNonce(p) == PIN_FUNDING_NONCE, "funding nonce drift");
    }

    /// @dev The provider id of each cadence, as the deployment registers it and the evidence signer signs it.
    function testCadenceProvidersMatchTheTypeScriptPin() public pure {
        require(keccak256("viky:provider:chess-com-rapid-zkfetch:v1") == PIN_RAPID, "rapid provider drift");
        require(keccak256("viky:provider:chess-com-blitz-zkfetch:v1") == PIN_BLITZ, "blitz provider drift");
        require(keccak256("viky:provider:chess-com-bullet-zkfetch:v1") == PIN_BULLET, "bullet provider drift");
        require(keccak256("viky:provider:chess-com-daily-zkfetch:v1") == PIN_DAILY, "daily provider drift");
    }

    function testDomainMatchesTheTypeScriptPin() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            gift.eip712Domain();
        require(keccak256(bytes(name)) == keccak256("Viky Milestone"), "domain name drift");
        require(keccak256(bytes(version)) == keccak256("1"), "domain version drift");
        require(chainId == 143 && verifyingContract == address(gift), "domain binding drift");
    }
}
