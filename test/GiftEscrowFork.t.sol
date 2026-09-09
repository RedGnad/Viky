// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftEscrow} from "../contracts/GiftEscrow.sol";

interface VmFork {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function skip(bool skipTest) external;
}

interface IAusd is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function decimals() external view returns (uint8);
}

/// @notice The funding path against the REAL AUSD on a Monad mainnet fork: a fresh account signs a
///         `ReceiveWithAuthorization` under the domain measured on-chain (DECISIONS.md D5) and the escrow pulls
///         the money. Skips when MONAD_RPC_URL is not set (public CI); run locally with the public RPC.
contract GiftEscrowForkTest {
    VmFork private constant VM = VmFork(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    // The Curve AUSD/USDC/USDT0 pool holds AUSD reserves; it lends the test funder a few units.
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    uint256 private constant FUNDER_KEY = 0xF0F0;
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant AMOUNT = 5_000_000; // 5 AUSD

    bool private forked;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
    }

    function testCreateGiftPullsRealAusdWithASignedAuthorization() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        require(block.chainid == 143, "not Monad mainnet");
        IAusd ausd = IAusd(AUSD);
        require(ausd.decimals() == 6, "AUSD decimals");

        address funder = VM.addr(FUNDER_KEY);
        VM.prank(CURVE_POOL);
        ausd.transfer(funder, AMOUNT);
        require(ausd.balanceOf(funder) == AMOUNT, "test funder not funded");

        GiftEscrow escrow = new GiftEscrow(IERC20(AUSD), VM.addr(EVIDENCE_KEY));
        escrow.setCreationPaused(false);
        escrow.registerGoal(1, keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8"));

        GiftEscrow.GiftParams memory p = GiftEscrow.GiftParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: keccak256("viky:contact:v1:email:ama@example.com"),
            goalType: 1,
            dailyTarget: 10,
            durationDays: 7,
            amount: AMOUNT,
            salt: keccak256("fork salt")
        });
        GiftEscrow.Authorization memory a;
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = escrow.fundingNonce(p);
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, funder, address(escrow), AMOUNT, a.validAfter, a.validBefore, a.nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(FUNDER_KEY, digest);

        uint256 giftId = escrow.createGift(p, a);
        require(giftId == 1, "gift id");
        require(ausd.balanceOf(address(escrow)) == AMOUNT, "escrow did not receive the real AUSD");
        require(ausd.balanceOf(funder) == 0, "funder still holds the AUSD");
        require(escrow.getGift(giftId).perDay == AMOUNT / 7, "per day");
    }
}
