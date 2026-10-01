// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V2Kit} from "./kit/V2Kit.sol";

/// @notice What the owner of the daily contract can and cannot do (the audit of 1 Oct 2026, section 3.1.2). On the
///         first version the owner could give the contract up, replace the evidence signer at once, move a goal
///         under the gifts made on it, and hold a pause for ever. Each of those is bounded here.
contract GiftEscrowV2OwnerBoundsTest is V2Kit {
    uint256 private constant DAY = 1 days;
    // 08:00 UTC on some day.
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 7_000_000;
    uint256 private constant PER_DAY = 1_000_000;
    uint32 private constant TARGET = 10;
    uint32 private constant DURATION = 7;
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    bytes32 private constant IDENTITY = keccak256("identity:ama");

    MockAUSD private token;
    GiftEscrowV2 private escrow;
    address private funder;
    address private recipient;
    address private other;
    uint32 private day0;

    function setUp() public {
        VM.chainId(143);
        // Deployed and opened two days before the tests begin, so the stand-still that follows the opening of a new
        // contract is over and every clock a test reads is the plain one.
        VM.warp(START - 2 days);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        escrow = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.setCheckInPaused(false);
        escrow.registerGoal(GOAL, PROVIDER);
        token.mint(funder, 1_000_000_000);
        VM.warp(START);
        day0 = uint32(START / DAY);
    }

    // --- ownership --------------------------------------------------------------------------------------------

    function testANewContractIsClosedUntilItsDeployerOpensItAndOpensByItselfAfterSevenDays() public {
        GiftEscrowV2 fresh = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        require(fresh.creationPaused() && fresh.checkInPaused(), "closed at first");
        require(fresh.checkInPausedUntil() == START + 7 days, "for seven days at most");
        VM.warp(START + 7 days);
        // Check-ins reopen by themselves; creation is a plain switch and stays shut, so no gift exists to be read.
        require(!fresh.checkInPaused() && fresh.creationPaused(), "check-ins lapse, creation does not");
    }

    function testOwnershipMovesInTwoStepsAndCannotBeGivenUp() public {
        address safe = address(0x5AFE);
        escrow.transferOwnership(safe);
        require(escrow.owner() == address(this) && escrow.pendingOwner() == safe, "nothing moved until it is accepted");
        VM.prank(address(0xBAD));
        VM.expectRevert(bytes("Ownable2Step: caller is not the new owner"));
        escrow.acceptOwnership();
        VM.prank(safe);
        escrow.acceptOwnership();
        require(escrow.owner() == safe && escrow.pendingOwner() == address(0), "accepted");

        VM.prank(safe);
        VM.expectRevert(GiftEscrowV2.OwnershipIsNotRenounceable.selector);
        escrow.renounceOwnership();
        require(escrow.owner() == safe, "still owned");
    }

    function testOnlyTheOwnerHoldsTheSwitches() public {
        VM.startPrank(other);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        escrow.setCheckInPaused(true);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        escrow.setCreationPaused(true);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        escrow.registerGoal(2, keccak256("a source"));
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        escrow.setEvidenceSigner(other);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        escrow.renounceOwnership();
        VM.stopPrank();
    }

    // --- the goal registry ------------------------------------------------------------------------------------

    function testAGoalIsAddedAndNeverChanged() public {
        VM.expectRevert(GiftEscrowV2.GoalAlreadyRegistered.selector);
        escrow.registerGoal(GOAL, keccak256("somewhere else"));
        // The same provider again is refused too: there is nothing to say twice.
        VM.expectRevert(GiftEscrowV2.GoalAlreadyRegistered.selector);
        escrow.registerGoal(GOAL, PROVIDER);
        require(escrow.goalProviders(GOAL) == PROVIDER, "the goal stands as it was made");
        escrow.registerGoal(2, keccak256("a new source"));
        require(escrow.goalProviders(2) == keccak256("a new source"), "a new goal is a new entry");
    }

    // --- the evidence signer ----------------------------------------------------------------------------------

    function testANewSignerWaitsADayAndTheOneInPlaceStandsMeanwhile() public {
        uint256 id = _baselined();
        address rogue = VM.addr(0xBAD);
        escrow.setEvidenceSigner(rogue);
        require(escrow.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place still stands");
        require(
            escrow.pendingEvidenceSigner() == rogue && escrow.evidenceSignerReadyAt() == START + 24 hours, "announced"
        );

        // A reading the announced signer attests is refused for a day; the one in place is still taken.
        VM.expectRevert(GiftEscrowV2.SignerNotReady.selector);
        escrow.applyEvidenceSigner();
        VM.warp(_readAt(day0 + 2));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1010, uint64(_readAt(day0 + 2))));
        require(escrow.getGift(id).creditedDays == 1, "the signer in place still counts a day");

        // Once the day is over, anybody carries it.
        VM.warp(START + 24 hours);
        VM.prank(other);
        escrow.applyEvidenceSigner();
        require(
            escrow.evidenceSigner() == rogue && escrow.pendingEvidenceSigner() == address(0), "replaced after the wait"
        );
        VM.expectRevert(GiftEscrowV2.NoSignerPending.selector);
        escrow.applyEvidenceSigner();
    }

    function testAnAnnouncedSignerCanBeCalledOff() public {
        escrow.setEvidenceSigner(VM.addr(0xBAD));
        escrow.setEvidenceSigner(address(0));
        require(escrow.pendingEvidenceSigner() == address(0) && escrow.evidenceSignerReadyAt() == 0, "called off");
        VM.warp(START + 24 hours);
        VM.expectRevert(GiftEscrowV2.NoSignerPending.selector);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place never changed");
    }

    function testAnnouncingAgainStartsTheDayAgain() public {
        escrow.setEvidenceSigner(VM.addr(0xBAD));
        VM.warp(START + 23 hours);
        escrow.setEvidenceSigner(VM.addr(0xBAD2));
        VM.warp(START + 24 hours);
        VM.expectRevert(GiftEscrowV2.SignerNotReady.selector);
        escrow.applyEvidenceSigner();
        VM.warp(START + 47 hours);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == VM.addr(0xBAD2), "the last one announced, a full day after it was");
    }

    // --- the pause --------------------------------------------------------------------------------------------

    function testThePauseIsAlsoTheBrakeOnOpeningAGiftAndNeverHoldsTheFunder() public {
        uint256 id = _create();
        escrow.setCheckInPaused(true);
        GiftEscrowV2.OpenIntent memory o = _dailyOpen(escrow, id, recipient, LINK_KEY);
        VM.expectRevert(GiftEscrowV2.CheckInIsPaused.selector);
        escrow.claim(id, o);
        VM.prank(funder);
        escrow.cancel(id);
        require(token.balanceOf(funder) == 1_000_000_000, "a funder takes an unopened gift back under a pause");
    }

    function testAPauseEndsByItselfAfterSevenDaysWithNobodyActing() public {
        uint256 id = _create();
        escrow.setCheckInPaused(true);
        require(escrow.checkInPaused() && escrow.checkInPausedUntil() == START + 7 days, "paused for seven days");
        VM.warp(START + 7 days - 1);
        GiftEscrowV2.OpenIntent memory early = _dailyOpen(escrow, id, recipient, LINK_KEY);
        VM.expectRevert(GiftEscrowV2.CheckInIsPaused.selector);
        escrow.claim(id, early);
        // The owner is gone. Seven days after the pause was sent, gifts open and are read again.
        VM.warp(START + 7 days);
        require(!escrow.checkInPaused(), "the pause lapsed");
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1000, uint64(START + 7 days)));
        require(escrow.getGift(id).startDay == day0 + 8, "read again");
    }

    /// @dev The Medium of the audit: a pause must hold a day open, never take it. A person who kept working through
    ///      a pause of ours is credited every day of it once readings reopen, and nothing is drained meanwhile.
    function testAPauseHoldsEveryOpenDayAndGivesAWholeWindowBackAfterIt() public {
        uint256 worked = _baselined();
        uint256 idle = _baselined();
        // Day one is done. The pause begins ten minutes after midnight, before the reading that would count it.
        uint256 begins = _dayStart(day0 + 2) + 10 minutes;
        VM.warp(begins);
        escrow.setCheckInPaused(true);

        // Two days later the first two days would be past their catch-up. Under a pause nothing is taken.
        VM.warp(_dayStart(day0 + 4) + 6 hours);
        GiftEscrowV2.CheckInAttestation memory during =
            _dailyReading(escrow, worked, recipient, IDENTITY, PROVIDER, 1030, uint64(_dayStart(day0 + 4) + 6 hours));
        VM.expectRevert(GiftEscrowV2.CheckInIsPaused.selector);
        escrow.checkIn(worked, during);
        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
        escrow.drain(worked);
        require(escrow.lastDrainableDay() == day0 - 1, "the clock stands where the pause began");

        // The owner reopens three days after it began. The reading of that morning counts all four days done.
        uint256 ends = _dayStart(day0 + 5) + 10 minutes;
        VM.warp(ends);
        escrow.setCheckInPaused(false);
        VM.warp(_readAt(day0 + 5));
        escrow.checkIn(
            worked, _dailyReading(escrow, worked, recipient, IDENTITY, PROVIDER, 1040, uint64(_readAt(day0 + 5)))
        );
        GiftEscrowV2.Gift memory g = escrow.getGift(worked);
        require(g.creditedDays == 4 && g.drainedDays == 0, "four days done, four days counted, none taken");

        // For one catch-up window after the pause nothing is settled as missed, so a reading has time to arrive.
        VM.warp(ends + 30 hours - 1);
        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
        escrow.drain(idle);
        // Then the clock is the plain one again, and the days nobody did go back as they always would have.
        VM.warp(ends + 30 hours);
        escrow.drain(idle);
        require(
            escrow.getGift(idle).drainedDays == 4 && escrow.refundableBalance(idle) == 4 * PER_DAY, "four went back"
        );
    }

    function testAPauseSentAgainRunsLongerAndKeepsItsBeginning() public {
        uint256 began = START + 1 hours;
        VM.warp(began);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == began && escrow.checkInPausedUntil() == began + 7 days, "a pause");
        VM.warp(began + 6 days);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == began, "its beginning has not moved");
        require(escrow.checkInPausedUntil() == began + 13 days, "it runs seven days from when it was sent again");

        // Ended, then sent again inside the stand-still that follows it: still the same pause.
        VM.warp(began + 8 days);
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 8 days && !escrow.checkInPaused(), "ended by the owner");
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 8 days, "reopening what is open moves nothing");
        VM.warp(began + 8 days + 1 hours);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == began, "one stand-still, one beginning");
        escrow.setCheckInPaused(false);

        // Sent once the stand-still is over, it is a new pause with its own beginning.
        uint256 later = began + 8 days + 1 hours + 30 hours;
        VM.warp(later);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == later, "a new pause");
    }

    function testTheWaitOfAnUnopenedGiftRunsPastAPauseThatShutItsOpening() public {
        uint256 shut = _create();
        // Thirteen days in, with a day left to open it, openings are paused for two days.
        VM.warp(START + 13 days);
        escrow.setCheckInPaused(true);
        VM.warp(START + 15 days);
        escrow.setCheckInPaused(false);
        // Without the pause the gift went back at fourteen days. It waits one catch-up window past the pause.
        VM.expectRevert(GiftEscrowV2.NothingToRefund.selector);
        escrow.refundUnearned(shut);
        escrow.claim(shut, _dailyOpen(escrow, shut, recipient, LINK_KEY));
        require(escrow.getGift(shut).recipient == recipient, "and the person it is for can still open it");

        uint256 unopened = _create();
        VM.warp(START + 15 days + 14 days);
        escrow.refundUnearned(unopened);
        require(escrow.getGift(unopened).cancelled, "a gift nobody opens still goes back after its own fourteen days");
    }

    function testAWaitThatWasOverBeforeAPauseBeganIsOver() public {
        uint256 id = _create();
        VM.warp(START + 20 days);
        escrow.setCheckInPaused(true);
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(id);
        require(token.balanceOf(funder) == before + AMOUNT, "a funder is not held by a pause that came after");
    }

    function testAGiftIsNotFinalisedWhileTheClockStandsStill() public {
        uint256 id = _baselined();
        // The pause begins on the last day and is ended two days after the gift's window closed.
        VM.warp(_dayStart(day0 + DURATION) + 1 hours);
        escrow.setCheckInPaused(true);
        VM.warp(_dayStart(day0 + DURATION + 2) + 7 hours);
        VM.expectRevert(GiftEscrowV2.FinalisationTooEarly.selector);
        escrow.finalise(id);
        escrow.setCheckInPaused(false);
        VM.expectRevert(GiftEscrowV2.FinalisationTooEarly.selector);
        escrow.finalise(id);
        VM.warp(_dayStart(day0 + DURATION + 2) + 7 hours + 30 hours);
        escrow.finalise(id);
        require(escrow.getGift(id).finalised, "finalised once a reading has had its window");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _create() private returns (uint256) {
        GiftEscrowV2.GiftParams memory p = _dailyParams(funder, GOAL, AMOUNT, DURATION, TARGET);
        return escrow.createGift(p, _dailyAuthorization(escrow, p, FUNDER_KEY));
    }

    function _baselined() private returns (uint256 id) {
        id = _create();
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(
            id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1000, uint64(VM.getBlockTimestamp()))
        );
    }

    function _dayStart(uint32 day) private pure returns (uint256) {
        return uint256(day) * DAY;
    }

    /// @dev The daily pass reads at 00:30 UTC.
    function _readAt(uint32 day) private pure returns (uint256) {
        return _dayStart(day) + 30 minutes;
    }
}

/// @notice The same bounds on the milestone contract, where a pause that never ended used to freeze every gift under
///         way once the owner was gone.
contract MilestoneGiftV2OwnerBoundsTest is V2Kit {
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 100_000_000;
    uint64 private constant TARGET = 1500;
    uint32 private constant DURATION = 90;
    uint8 private constant GOAL_CHESS = 1;
    uint8 private constant GOAL_CERTIFICATE = 2;
    bytes32 private constant CHESS_PROVIDER = keccak256("viky:provider:chess-public:v1");
    bytes32 private constant CERTIFICATE_PROVIDER = keccak256("viky:provider:coursera-certificate:v1");
    bytes32 private constant IDENTITY = keccak256("identity:ama");

    MockAUSD private token;
    MilestoneGiftV2 private gift;
    address private funder;
    address private recipient;
    address private other;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        gift = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        gift.setCreationPaused(false);
        gift.setProofPaused(false);
        gift.registerGoal(GOAL_CHESS, CHESS_PROVIDER, 0);
        gift.registerGoal(GOAL_CERTIFICATE, CERTIFICATE_PROVIDER, 1);
        token.mint(funder, 1_000_000_000);
    }

    function testANewContractIsClosedUntilItsDeployerOpensItAndOpensByItselfAfterSevenDays() public {
        MilestoneGiftV2 fresh = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        require(fresh.creationPaused() && fresh.proofPaused(), "closed at first");
        VM.warp(START + 7 days);
        require(!fresh.proofPaused() && fresh.creationPaused(), "proofs lapse, creation does not");
    }

    /// @dev The Medium of 29 Sep, replayed: a pause, and the owner is gone for good. On the first version a climb
    ///      under way could never settle: `prove` and `expire` were both shut for ever. Here the pause ends by
    ///      itself, a reading taken in time still pays, and a gift never reached goes back at its own deadline.
    function testAPauseEndsByItselfAndGiftsSettleWithoutAnyOwner() public {
        uint256 reached = _started(1200);
        uint256 missed = _started(1200);
        gift.setProofPaused(true);
        VM.expectRevert(MilestoneGiftV2.OwnershipIsNotRenounceable.selector);
        gift.renounceOwnership();

        // Nothing is taken back while the pause runs, with no switch in `expire`: the windows say so.
        VM.warp(START + 3 days);
        require(gift.proofPaused(), "still paused");
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(missed);
        MilestoneGiftV2.ProofAttestation memory early =
            _milestoneProof(gift, reached, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(START + 3 days));
        VM.expectRevert(MilestoneGiftV2.ProofIsPaused.selector);
        gift.prove(reached, early);

        // Seven days after it was sent, with nobody acting, proofs are open again.
        VM.warp(START + 7 days);
        require(!gift.proofPaused(), "the pause lapsed");
        gift.prove(
            reached,
            _milestoneProof(gift, reached, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(START + 7 days))
        );
        require(gift.earnedBalance(reached) == AMOUNT, "a target reached is paid after the lapse");
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(missed);
        gift.refundUnearned(missed);
        require(token.balanceOf(funder) == 1_000_000_000 - AMOUNT, "and the other went back at its own deadline");
    }

    function testAPauseAcrossADeadlineStillGivesTheGraceBack() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline - 1 hours);
        gift.setProofPaused(true);
        VM.warp(deadline + 2 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.setProofPaused(false);
        // A reading taken before the deadline, sent once proofs reopen, inside the grace counted from the reopening.
        gift.prove(
            id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline - 2 hours))
        );
        require(gift.earnedBalance(id) == AMOUNT, "earned in time, paid after the pause");
    }

    function testAPauseSentAgainRunsSevenDaysFromThen() public {
        gift.setProofPaused(true);
        VM.warp(START + 6 days);
        gift.setProofPaused(true);
        require(gift.proofPausedUntil() == START + 13 days, "seven days from when it was sent again");
        VM.warp(START + 13 days);
        require(!gift.proofPaused(), "and no longer");
    }

    function testANewSignerWaitsADayAndTheOneInPlaceStandsMeanwhile() public {
        uint256 id = _claimed();
        address rogue = VM.addr(0xBAD);
        gift.setEvidenceSigner(rogue);
        require(gift.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place still stands");
        VM.expectRevert(MilestoneGiftV2.SignerNotReady.selector);
        gift.applyEvidenceSigner();
        // The signer in place still starts a climb during the day of the announcement.
        gift.prove(id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, 1200, 0, uint64(START)));
        require(gift.getGift(id).startingValue == 1200, "started by the signer in place");

        VM.warp(START + 24 hours);
        VM.prank(other);
        gift.applyEvidenceSigner();
        require(gift.evidenceSigner() == rogue, "replaced after the wait, carried by anybody");
        VM.expectRevert(MilestoneGiftV2.NoSignerPending.selector);
        gift.applyEvidenceSigner();
        // What the old signer attests now is refused.
        MilestoneGiftV2.ProofAttestation memory old =
            _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(START + 24 hours));
        VM.expectRevert(MilestoneGiftV2.InvalidEvidenceSigner.selector);
        gift.prove(id, old);
    }

    function testAnAnnouncedSignerCanBeCalledOff() public {
        gift.setEvidenceSigner(VM.addr(0xBAD));
        gift.setEvidenceSigner(address(0));
        VM.warp(START + 24 hours);
        VM.expectRevert(MilestoneGiftV2.NoSignerPending.selector);
        gift.applyEvidenceSigner();
        require(gift.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place never changed");
    }

    function testOwnershipMovesInTwoStepsAndAGoalIsNeverRepointed() public {
        address safe = address(0x5AFE);
        gift.transferOwnership(safe);
        require(gift.owner() == address(this) && gift.pendingOwner() == safe, "nothing moved until it is accepted");
        VM.prank(address(0xBAD));
        VM.expectRevert(bytes("Ownable2Step: caller is not the new owner"));
        gift.acceptOwnership();
        VM.prank(safe);
        gift.acceptOwnership();
        require(gift.owner() == safe, "accepted");

        VM.prank(safe);
        VM.expectRevert(MilestoneGiftV2.GoalAlreadyRegistered.selector);
        gift.registerGoal(GOAL_CHESS, keccak256("somewhere else"), 0);
        // Nor its shape: a rating proved as "having it or not" would settle on one reading.
        VM.prank(safe);
        VM.expectRevert(MilestoneGiftV2.GoalAlreadyRegistered.selector);
        gift.registerGoal(GOAL_CHESS, CHESS_PROVIDER, 1);
        VM.prank(safe);
        gift.registerGoal(77, keccak256("a new source"), 1);
        require(gift.goalShapes(77) == 1 && gift.goalShapes(GOAL_CHESS) == 0, "added, and the first untouched");
    }

    function testOnlyTheOwnerHoldsTheSwitches() public {
        VM.startPrank(other);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.setProofPaused(true);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.setCreationPaused(true);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.registerGoal(9, keccak256("a source"), 0);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.setEvidenceSigner(other);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        gift.renounceOwnership();
        VM.stopPrank();
    }

    function testThePauseIsAlsoTheBrakeOnOpeningAGiftAndNeverHoldsTheFunder() public {
        uint256 id = _create();
        gift.setProofPaused(true);
        MilestoneGiftV2.OpenIntent memory o = _milestoneOpen(gift, id, recipient, LINK_KEY);
        VM.expectRevert(MilestoneGiftV2.ProofIsPaused.selector);
        gift.claim(id, o);
        VM.prank(funder);
        gift.cancel(id);
        require(token.balanceOf(funder) == 1_000_000_000, "a funder takes an unopened gift back under a pause");
    }

    function testTheWaitOfAnUnopenedGiftRunsPastAPauseThatShutItsOpening() public {
        uint256 id = _create();
        VM.warp(START + 13 days);
        gift.setProofPaused(true);
        VM.warp(START + 15 days);
        gift.setProofPaused(false);
        // Without the pause it went back at fourteen days and six hours. The six hours are counted from its end.
        VM.warp(START + 15 days + 6 hours - 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.claim(id, _milestoneOpen(gift, id, recipient, LINK_KEY));
        require(gift.getGift(id).recipient == recipient, "and the person it is for can still open it");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _create() private returns (uint256) {
        MilestoneGiftV2.MilestoneParams memory p =
            _climbParams(funder, GOAL_CHESS, AMOUNT, DURATION, TARGET, TARGET - 200);
        return gift.createGift(p, _milestoneAuthorization(gift, p, FUNDER_KEY));
    }

    function _claimed() private returns (uint256 id) {
        id = _create();
        gift.claim(id, _milestoneOpen(gift, id, recipient, LINK_KEY));
    }

    function _started(uint64 from) private returns (uint256 id) {
        id = _claimed();
        gift.prove(
            id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, from, 0, uint64(VM.getBlockTimestamp()))
        );
    }
}
