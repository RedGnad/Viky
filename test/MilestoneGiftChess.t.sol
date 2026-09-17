// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MilestoneGift} from "../contracts/MilestoneGift.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmChess {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
}

/// @notice MilestoneGift as C2 deploys it: four cadences of Chess.com, each its own goal type and provider id, every
///         goal a climb, the switches opened, and ownership handed to the founder. The contract's own suite
///         (test/MilestoneGift.t.sol) holds the rule of D44 on one goal; this suite holds it on the configuration that
///         goes to mainnet, with the numbers a funder actually sees (today 1420, the gift at 1500, from 1430 or under).
contract MilestoneGiftChessTest {
    VmChess private constant VM = VmChess(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant DEPLOYER_KEY = 0xDE9;
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 25_000_000;
    uint32 private constant DURATION = 30;
    uint64 private constant TODAY = 1420;
    uint64 private constant TARGET = 1500;
    uint64 private constant CEILING = 1430;
    address private constant FOUNDER = 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64;
    bytes32 private constant NO_CONTACT = keccak256("viky:contact:v1:none");
    bytes32 private constant IDENTITY = keccak256("viky:identity:v1:chess.com:41");
    uint8 private constant RAPID = 1;
    uint8 private constant BLITZ = 2;
    uint8 private constant BULLET = 3;
    uint8 private constant DAILY = 4;

    MockAUSD private token;
    MilestoneGift private gift;
    address private deployer;
    address private funder;
    address private recipient;
    uint256 private nullifierSeed;
    uint256 private saltSeed;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        deployer = VM.addr(DEPLOYER_KEY);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        token = new MockAUSD();
        token.mint(funder, 1_000_000_000);

        // The order of scripts/deploy-milestone-gift.ts: deploy, register the four cadences, open, hand over.
        VM.startPrank(deployer);
        gift = new MilestoneGift(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        gift.registerGoal(RAPID, _provider("rapid"), gift.SHAPE_CLIMB());
        gift.registerGoal(BLITZ, _provider("blitz"), gift.SHAPE_CLIMB());
        gift.registerGoal(BULLET, _provider("bullet"), gift.SHAPE_CLIMB());
        gift.registerGoal(DAILY, _provider("daily"), gift.SHAPE_CLIMB());
        gift.setCreationPaused(false);
        gift.setProofPaused(false);
        gift.transferOwnership(FOUNDER);
        VM.stopPrank();
    }

    // --- the deployment ---------------------------------------------------------------------------------

    function testOwnershipEndsWithTheFounderAndTheDeployKeyKeepsNothing() public {
        require(gift.owner() == FOUNDER, "owned by the founder");
        require(!gift.creationPaused() && !gift.proofPaused(), "open");
        require(gift.nextGiftId() == 1_000_000, "numbered from one million");
        VM.startPrank(deployer);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.setProofPaused(true);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.registerGoal(RAPID, keccak256("anything else"), 0);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.setEvidenceSigner(deployer);
        VM.stopPrank();
        // The founder can still stop proofs, and doing so also stops the keeper taking a gift back (D49).
        VM.prank(FOUNDER);
        gift.setProofPaused(true);
        require(gift.proofPaused(), "the founder holds the switch");
    }

    function testEveryCadenceIsAClimbWithItsOwnProvider() public view {
        string[4] memory modes = ["rapid", "blitz", "bullet", "daily"];
        for (uint8 goal = 1; goal <= 4; goal++) {
            require(gift.goalProviders(goal) == _provider(modes[goal - 1]), "provider");
            require(gift.goalShapes(goal) == gift.SHAPE_CLIMB(), "a rating is a climb, never having it or not");
        }
        require(gift.goalProviders(5) == bytes32(0), "nothing else is offered");
    }

    /// @dev D48: the page gives a rating per cadence, so a gift for one must never be settled by another.
    function testARapidGiftIsNeverSettledByABlitzRating() public {
        uint256 id = _startedAt(RAPID, TODAY);
        VM.warp(START + 3 days);
        MilestoneGift.ProofAttestation memory blitz = _proof(id, _provider("blitz"), 2000, _now());
        VM.expectRevert(MilestoneGift.ProviderMismatch.selector);
        gift.prove(id, blitz);
        gift.prove(id, _proof(id, _provider("rapid"), TARGET, _now()));
        require(gift.getGift(id).earned == AMOUNT, "the rapid rating settles it");
    }

    // --- the rule, with a funder's numbers -------------------------------------------------------------

    function testTheScreensNumbersPayExactlyWhereTheySay() public {
        // From 1430 or under: exactly 1430 pays.
        uint256 atCeiling = _startedAt(RAPID, CEILING);
        VM.warp(START + 1 days);
        gift.prove(atCeiling, _proof(atCeiling, _provider("rapid"), TARGET, _now()));
        require(gift.getGift(atCeiling).earned == AMOUNT, "1430 or under pays");

        // One point above does not, whatever comes after.
        VM.warp(START + 2 days);
        uint256 above = _startedAt(RAPID, CEILING + 1);
        VM.warp(START + 3 days);
        MilestoneGift.ProofAttestation memory reached = _proof(above, _provider("rapid"), TARGET + 200, _now());
        VM.expectRevert(MilestoneGift.StartTooHigh.selector);
        gift.prove(above, reached);
    }

    /// @dev The play D44 found, on a rating: they rose to 1520 after the funder read 1420, lost two games to 1499
    ///      before connecting, and would win one for the whole gift. The first reading is the start, above 1430.
    function testRisingBeforeConnectingAndDippingJustUnderTheTargetPaysNothing() public {
        uint256 id = _startedAt(RAPID, 1499);
        VM.warp(START + 1 hours);
        MilestoneGift.ProofAttestation memory oneWin = _proof(id, _provider("rapid"), 1508, _now());
        VM.expectRevert(MilestoneGift.StartTooHigh.selector);
        gift.prove(id, oneWin);
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        gift.refundUnearned(id);
        require(token.balanceOf(funder) == 1_000_000_000, "every unit back with the funder");
    }

    /// @dev For any start and any sequence of later readings: it pays if and only if the start was at or under the
    ///      ceiling and some reading before the deadline reached the target, and every unit ends with somebody.
    function testFuzzItPaysExactlyWhenTheClimbTheFunderSignedForHappens(uint16 startSeed, uint64 readingsSeed) public {
        uint64 startRating = 1300 + uint64(startSeed % 300); // 1300 to 1599, either side of 1430 and of 1500
        uint256 id = _startedAt(RAPID, startRating);
        bool shouldPay = false;
        uint256 seed = readingsSeed;
        for (uint256 i = 0; i < 6; i++) {
            VM.warp(START + (i + 1) * 4 days + (seed % 3 hours));
            uint64 rating = 1350 + uint64(seed % 250);
            seed = uint256(keccak256(abi.encode(seed)));
            MilestoneGift.ProofAttestation memory reading = _proof(id, _provider("rapid"), rating, _now());
            bool pays = startRating <= CEILING && rating >= TARGET;
            if (gift.getGift(id).settled) {
                VM.expectRevert(MilestoneGift.AlreadySettled.selector);
            } else if (startRating > CEILING) {
                VM.expectRevert(MilestoneGift.StartTooHigh.selector);
            } else if (!pays) {
                VM.expectRevert(MilestoneGift.NotThereYet.selector);
            }
            gift.prove(id, reading);
            shouldPay = shouldPay || pays;
        }
        MilestoneGift.Gift memory g = gift.getGift(id);
        require(g.settled == shouldPay && (g.earned == AMOUNT) == shouldPay, "paid exactly when the climb happened");
        if (!shouldPay) {
            VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
            gift.expire(id);
            gift.refundUnearned(id);
        } else {
            VM.prank(recipient);
            gift.withdrawEarned(id, recipient, AMOUNT);
        }
        uint256 back = shouldPay ? 0 : AMOUNT;
        require(
            token.balanceOf(recipient) + gift.getGift(id).refundedToFunder == AMOUNT, "every unit ends with somebody"
        );
        require(gift.getGift(id).refundedToFunder == back, "the funder gets back exactly what was not earned");
        require(token.balanceOf(address(gift)) == 0, "nothing stays in the contract");
    }

    // --- helpers --------------------------------------------------------------------------------------

    function _provider(string memory mode) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("viky:provider:chess-com-", mode, "-zkfetch:v1"));
    }

    function _now() private view returns (uint64) {
        return uint64(VM.getBlockTimestamp());
    }

    function _startedAt(uint8 goal, uint64 rating) private returns (uint256 id) {
        MilestoneGift.MilestoneParams memory p = MilestoneGift.MilestoneParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: NO_CONTACT,
            goalType: goal,
            shape: 0,
            target: TARGET,
            maximumStart: CEILING,
            subject: bytes32(0),
            durationDays: DURATION,
            amount: AMOUNT,
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
        id = gift.createGift(p, _authorization(p));
        MilestoneGift.ClaimAttestation memory c = MilestoneGift.ClaimAttestation({
            recipient: recipient,
            contactHash: NO_CONTACT,
            issuedAt: _now(),
            expiresAt: _now() + 5 minutes,
            signature: ""
        });
        c.signature =
            _sign(keccak256(abi.encode(gift.CLAIM_TYPEHASH(), id, recipient, NO_CONTACT, c.issuedAt, c.expiresAt)));
        gift.claim(id, c);
        gift.prove(id, _proof(id, gift.goalProviders(goal), rating, _now()));
    }

    function _proof(uint256 id, bytes32 provider, uint64 rating, uint64 observedAt)
        private
        returns (MilestoneGift.ProofAttestation memory a)
    {
        a = MilestoneGift.ProofAttestation({
            recipient: recipient,
            identityHash: IDENTITY,
            providerId: provider,
            metricValue: rating,
            eventAt: 0,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("chess nullifier", ++nullifierSeed)),
            issuedAt: _now(),
            expiresAt: _now() + 5 minutes,
            signature: ""
        });
        a.signature = _sign(
            keccak256(
                abi.encode(
                    gift.PROOF_TYPEHASH(),
                    id,
                    a.recipient,
                    a.identityHash,
                    a.providerId,
                    a.metricValue,
                    a.eventAt,
                    a.observedAt,
                    a.nullifier,
                    a.issuedAt,
                    a.expiresAt
                )
            )
        );
    }

    function _authorization(MilestoneGift.MilestoneParams memory p)
        private
        returns (MilestoneGift.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = gift.fundingNonce(p);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                ),
                p.funder,
                address(gift),
                p.amount,
                a.validAfter,
                a.validBefore,
                a.nonce
            )
        );
        (a.v, a.r, a.s) =
            VM.sign(FUNDER_KEY, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    function _sign(bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Milestone"),
                keccak256("1"),
                block.chainid,
                address(gift)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            VM.sign(EVIDENCE_KEY, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
