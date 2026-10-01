// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {V2Kit} from "./kit/V2Kit.sol";

/// @notice Every way money moves through the second version, against the REAL AUSD on a copy of Monad mainnet: paid
///         in with the funder's one signature, paid out to the person the gift is for, sent back day by day, sent back
///         whole, and sent back at once when that person ends the gift. The mock token of the other suites says what
///         the contracts mean to do; this says what the token itself lets them do.
///
///         Skips when MONAD_RPC_URL is not set. CI sets it to the public endpoint.
contract V2MoneyPathsForkTest is V2Kit {
    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    // The Curve AUSD/USDC/USDT0 pool holds AUSD reserves; it lends the test funder what the gifts are made of.
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    uint256 private constant DAY = 1 days;
    uint256 private constant DAILY_AMOUNT = 7_000_004; // seven days of 1.000000 and a dust of four units
    uint256 private constant PER_DAY = 1_000_000;
    uint256 private constant MILESTONE_AMOUNT = 25_000_000;
    uint8 private constant GOAL = 1;
    uint8 private constant GOAL_CERTIFICATE = 2;
    bytes32 private constant DAILY_PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    bytes32 private constant CLIMB_PROVIDER = keccak256("viky:provider:chess-public:v1");
    bytes32 private constant CERTIFICATE_PROVIDER = keccak256("viky:provider:coursera-certificate:v1");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant SUBJECT = keccak256("a person and a course");

    bool private forked;
    IERC20 private ausd;
    GiftEscrowV2 private escrow;
    MilestoneGiftV2 private milestone;
    address private funder;
    address private recipient;
    uint256 private start;
    uint32 private day0;
    uint256 private funded;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
        require(block.chainid == 143, "not Monad mainnet");
        ausd = IERC20(AUSD);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);

        escrow = new GiftEscrowV2(ausd, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.setCheckInPaused(false);
        escrow.registerGoal(GOAL, DAILY_PROVIDER);
        milestone = new MilestoneGiftV2(ausd, VM.addr(EVIDENCE_KEY), 1_000_000);
        milestone.setCreationPaused(false);
        milestone.setProofPaused(false);
        milestone.registerGoal(GOAL, CLIMB_PROVIDER, 0);
        milestone.registerGoal(GOAL_CERTIFICATE, CERTIFICATE_PROVIDER, 1);

        // Three days on, at 08:00 UTC: past the stand-still that follows the opening of a new contract.
        day0 = uint32(block.timestamp / DAY) + 3;
        start = uint256(day0) * DAY + 8 hours;
        VM.warp(start);

        funded = 4 * DAILY_AMOUNT + 5 * MILESTONE_AMOUNT;
        VM.prank(CURVE_POOL);
        ausd.transfer(funder, funded);
        require(
            ausd.balanceOf(funder) == funded && ausd.balanceOf(recipient) == 0, "the test starts from known balances"
        );
    }

    modifier onFork() {
        if (!forked) {
            VM.skip(true);
            return;
        }
        _;
    }

    // --- the daily contract ---------------------------------------------------------------------------------

    /// @dev A whole gift: two days done and paid out, five missed and sent back with the dust, nothing left behind.
    function testADailyGiftPaysTheDaysDoneAndSendsTheRestBack() public onFork {
        uint256 id = _dailyBaselined();
        require(ausd.balanceOf(address(escrow)) == DAILY_AMOUNT, "the real AUSD arrived with one signature");
        require(escrow.getGift(id).perDay == PER_DAY, "a day's share");

        // Two days done, read by the pass of the third morning.
        VM.warp(_readAt(day0 + 3));
        escrow.checkIn(
            id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1020, uint64(_readAt(day0 + 3)))
        );
        require(escrow.earnedBalance(id) == 2 * PER_DAY, "two days are theirs");

        // Paid out by the relayer on the recipient's signed intent.
        escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, recipient, 2 * PER_DAY, RECIPIENT_KEY));
        require(ausd.balanceOf(recipient) == 2 * PER_DAY, "two real dollars reached them");

        // Nothing more is done. Once the window has closed, the rest goes back, the rounding dust with it.
        VM.warp(uint256(day0 + 7 + 2) * DAY + 6 hours);
        escrow.finalise(id);
        uint256 before = ausd.balanceOf(funder);
        escrow.refundUnearned(id);
        require(ausd.balanceOf(funder) == before + 5 * PER_DAY + 4, "five days and the dust came back");
        require(ausd.balanceOf(address(escrow)) == 0, "and the contract holds nothing of this gift");
    }

    /// @dev The person it is for ends it: what was counted stays theirs, the rest goes back in the same transaction.
    function testEndingADailyGiftSendsTheRestBackAtOnce() public onFork {
        uint256 id = _dailyBaselined();
        VM.warp(_readAt(day0 + 3));
        escrow.checkIn(
            id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1020, uint64(_readAt(day0 + 3)))
        );

        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == 2 * PER_DAY && giveBack == 5 * PER_DAY + 4, "the two figures the screen prints");
        uint256 before = ausd.balanceOf(funder);
        escrow.endGiftWithIntent(id, _dailyEnd(escrow, id, keep, giveBack, RECIPIENT_KEY));
        require(ausd.balanceOf(funder) == before + giveBack, "the rest came back in that transaction");
        require(ausd.balanceOf(address(escrow)) == keep, "the contract holds exactly what is theirs");

        escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, recipient, keep, RECIPIENT_KEY));
        require(ausd.balanceOf(recipient) == keep && ausd.balanceOf(address(escrow)) == 0, "and they take it as before");
    }

    /// @dev A gift nobody opens: the funder takes it back, or it comes back by itself after fourteen days.
    function testAnUnopenedDailyGiftComesBackWhole() public onFork {
        uint256 taken = _dailyCreate();
        uint256 left = _dailyCreate();
        uint256 before = ausd.balanceOf(funder);
        VM.prank(funder);
        escrow.cancel(taken);
        require(ausd.balanceOf(funder) == before + DAILY_AMOUNT, "taken back by the funder");

        VM.warp(start + 14 days);
        escrow.refundUnearned(left);
        require(ausd.balanceOf(funder) == before + 2 * DAILY_AMOUNT, "or back by itself after fourteen days");
        require(ausd.balanceOf(address(escrow)) == 0, "nothing left");
    }

    /// @dev The theft the audit proved on the first version, on the real token: the evidence key alone takes nothing.
    function testTheEvidenceKeyAloneTakesNothingFromAnUnopenedGift() public onFork {
        uint256 daily = _dailyCreate();
        uint256 certificate = _certificateCreate();
        address thief = VM.addr(0x7E1EF);

        GiftEscrowV2.OpenIntent memory dailyOpen = _dailyOpen(escrow, daily, thief, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidOpeningSignature.selector);
        escrow.claim(daily, dailyOpen);
        MilestoneGiftV2.OpenIntent memory milestoneOpen = _milestoneOpen(milestone, certificate, thief, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        milestone.claim(certificate, milestoneOpen);
        MilestoneGiftV2.ProofAttestation memory reached = _milestoneProof(
            milestone, certificate, thief, SUBJECT, CERTIFICATE_PROVIDER, 1, uint64(start), uint64(start)
        );
        VM.expectRevert(MilestoneGiftV2.NotClaimed.selector);
        milestone.prove(certificate, reached);

        require(ausd.balanceOf(thief) == 0, "nothing reached the thief");
        require(ausd.balanceOf(address(escrow)) == DAILY_AMOUNT, "the daily gift is whole");
        require(ausd.balanceOf(address(milestone)) == MILESTONE_AMOUNT, "the certificate gift is whole");
    }

    // --- the milestone contract -----------------------------------------------------------------------------

    /// @dev A climb reached pays the whole amount; a climb not reached sends the whole amount back at its deadline.
    function testAClimbReachedPaysAndAClimbMissedComesBack() public onFork {
        uint256 reached = _climbStarted(1200);
        uint256 missed = _climbStarted(1200);
        require(ausd.balanceOf(address(milestone)) == 2 * MILESTONE_AMOUNT, "both paid in with real AUSD");

        VM.warp(start + 10 days);
        milestone.prove(
            reached,
            _milestoneProof(milestone, reached, recipient, IDENTITY, CLIMB_PROVIDER, 1500, 0, uint64(start + 10 days))
        );
        milestone.withdrawEarnedWithIntent(
            reached, _milestoneWithdraw(milestone, reached, recipient, MILESTONE_AMOUNT, RECIPIENT_KEY)
        );
        require(ausd.balanceOf(recipient) == MILESTONE_AMOUNT, "the whole amount reached them");

        uint256 before = ausd.balanceOf(funder);
        VM.warp(start + 30 days + 6 hours + 1);
        milestone.expire(missed);
        milestone.refundUnearned(missed);
        require(ausd.balanceOf(funder) == before + MILESTONE_AMOUNT, "the other came back whole");
        require(ausd.balanceOf(address(milestone)) == 0, "nothing left");
    }

    /// @dev A certificate granted inside the gift pays; one never shown comes back once it can no longer be.
    function testACertificateGrantedPaysAndOneNeverShownComesBack() public onFork {
        uint256 shown = _certificateOpened();
        uint256 never = _certificateOpened();

        VM.warp(start + 5 days);
        milestone.prove(
            shown,
            _milestoneProof(
                milestone,
                shown,
                recipient,
                SUBJECT,
                CERTIFICATE_PROVIDER,
                1,
                uint64(start + 4 days),
                uint64(start + 5 days)
            )
        );
        VM.prank(recipient);
        milestone.withdrawEarned(shown, recipient, MILESTONE_AMOUNT);
        require(ausd.balanceOf(recipient) == MILESTONE_AMOUNT, "paid");

        uint256 before = ausd.balanceOf(funder);
        VM.warp(start + 30 days + 14 days + 1);
        milestone.expire(never);
        milestone.refundUnearned(never);
        require(ausd.balanceOf(funder) == before + MILESTONE_AMOUNT && ausd.balanceOf(address(milestone)) == 0, "back");
    }

    /// @dev Ended by the person it is for, or taken back unopened by the funder: the whole amount, at once.
    function testAMilestoneGiftEndedOrCancelledComesBackAtOnce() public onFork {
        uint256 ended = _climbStarted(1200);
        uint256 cancelled = _certificateCreate();
        uint256 before = ausd.balanceOf(funder);

        milestone.endGiftWithIntent(ended, _milestoneEnd(milestone, ended, MILESTONE_AMOUNT, RECIPIENT_KEY));
        require(ausd.balanceOf(funder) == before + MILESTONE_AMOUNT, "ended: back in that transaction");
        VM.prank(funder);
        milestone.cancel(cancelled);
        require(ausd.balanceOf(funder) == before + 2 * MILESTONE_AMOUNT, "cancelled: back in that transaction");
        require(ausd.balanceOf(address(milestone)) == 0 && ausd.balanceOf(recipient) == 0, "nothing left, nothing paid");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _readAt(uint32 day) private pure returns (uint256) {
        return uint256(day) * DAY + 30 minutes;
    }

    function _dailyCreate() private returns (uint256) {
        GiftEscrowV2.GiftParams memory p = _dailyParams(funder, GOAL, DAILY_AMOUNT, 7, 10);
        return escrow.createGift(p, _dailyAuthorization(escrow, p, FUNDER_KEY));
    }

    function _dailyBaselined() private returns (uint256 id) {
        id = _dailyCreate();
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1000, uint64(start)));
    }

    function _climbStarted(uint64 from) private returns (uint256 id) {
        MilestoneGiftV2.MilestoneParams memory p = _climbParams(funder, GOAL, MILESTONE_AMOUNT, 30, 1500, 1300);
        id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        milestone.prove(id, _milestoneProof(milestone, id, recipient, IDENTITY, CLIMB_PROVIDER, from, 0, uint64(start)));
    }

    function _certificateCreate() private returns (uint256) {
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_CERTIFICATE, MILESTONE_AMOUNT, 30, SUBJECT);
        return milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
    }

    function _certificateOpened() private returns (uint256 id) {
        id = _certificateCreate();
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
    }
}
