// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V2Kit} from "./kit/V2Kit.sol";

/// @notice What the owner of the daily contract can and cannot do (the audit of 1 Oct 2026, section 3.1.2). On the
///         first version the owner could give the contract up, replace the evidence signer at once, move a goal
///         under the gifts made on it, and hold a pause for ever. Each of those is bounded here, and the review of
///         2 Oct 2026 bounded the pause again: it is not sent twice in a row (R-02, R-03), and a signer announced
///         before a hand-over does not stand after it (R-05).
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
        // Deployed and opened two days before the tests begin.
        VM.warp(START - 2 days);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        escrow = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.registerGoal(GOAL, PROVIDER);
        token.mint(funder, 1_000_000_000);
        VM.warp(START);
        day0 = uint32(START / DAY);
    }

    // --- ownership --------------------------------------------------------------------------------------------

    function testANewContractMakesNoGiftUntilItsDeployerOpensItAndItsPauseIsReadyFromTheFirstDay() public {
        GiftEscrowV2 fresh = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        fresh.registerGoal(GOAL, PROVIDER);
        require(fresh.creationPaused(), "closed at first");
        GiftEscrowV2.GiftParams memory p = _dailyParams(funder, GOAL, AMOUNT, DURATION, TARGET);
        GiftEscrowV2.Authorization memory a = _dailyAuthorization(fresh, p, FUNDER_KEY);
        VM.expectRevert(GiftEscrowV2.CreationIsPaused.selector);
        fresh.createGift(p, a);
        // No pause of check-ins is spent on a contract that holds no gift: the brake is whole the day gifts begin.
        require(!fresh.checkInPaused() && fresh.checkInPausedUntil() == 0 && fresh.checkInPauseBegan() == 0, "unspent");
        fresh.setCreationPaused(false);
        fresh.setCheckInPaused(true);
        require(fresh.checkInPaused() && fresh.checkInPausedUntil() == START + 7 days, "paused the day it opens");
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

    /// @dev The review of 2 Oct 2026, R-05. Between a hand-over and its acceptance the outgoing owner is still the
    ///      owner: a signer it announced then stood a day later, under an owner that never announced it.
    function testASignerAnnouncedBeforeAHandOverNeverStandsAfterIt() public {
        address safe = address(0x5AFE);
        escrow.transferOwnership(safe);
        escrow.setEvidenceSigner(VM.addr(0xBAD));
        require(escrow.pendingEvidenceSigner() == VM.addr(0xBAD), "announced by the outgoing owner");
        VM.prank(safe);
        escrow.acceptOwnership();
        require(
            escrow.pendingEvidenceSigner() == address(0) && escrow.evidenceSignerReadyAt() == 0,
            "called off by the hand-over"
        );
        VM.warp(START + 24 hours);
        VM.expectRevert(GiftEscrowV2.NoSignerPending.selector);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place never changed");

        // The new owner's own announcement stands a day later, as any does.
        VM.prank(safe);
        escrow.setEvidenceSigner(other);
        VM.warp(START + 48 hours);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == other, "announced by the owner it stands under");
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

    function testAPauseCannotBeSentAgainWhileItRunsNorForSevenDaysAfterItEnded() public {
        uint256 began = START + 1 hours;
        VM.warp(began);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == began && escrow.checkInPausedUntil() == began + 7 days, "a pause");
        // While it runs it cannot be made longer.
        VM.warp(began + 5 days);
        VM.expectRevert(GiftEscrowV2.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPausedUntil() == began + 7 days, "its end has not moved");

        // Ended by the owner. Reopening what is open moves nothing.
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 5 days && !escrow.checkInPaused(), "ended by the owner");
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 5 days, "reopening what is open moves nothing");

        // For seven days after its end, no pause.
        VM.warp(began + 5 days + 1);
        VM.expectRevert(GiftEscrowV2.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        VM.warp(began + 12 days);
        VM.expectRevert(GiftEscrowV2.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPauseBegan() == began && !escrow.checkInPaused(), "nothing moved");

        // Then it is a new pause, with its own beginning.
        VM.warp(began + 12 days + 1);
        escrow.setCheckInPaused(true);
        require(
            escrow.checkInPauseBegan() == began + 12 days + 1 && escrow.checkInPausedUntil() == began + 19 days + 1,
            "a new pause"
        );
    }

    function testAPauseThatLapsedByItselfIsFollowedBySevenDaysOfRestToo() public {
        escrow.setCheckInPaused(true);
        VM.warp(START + 14 days);
        require(!escrow.checkInPaused(), "lapsed a week ago");
        VM.expectRevert(GiftEscrowV2.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        VM.warp(START + 14 days + 1);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPaused(), "paused again, a week after the first one lapsed");
    }

    /// @dev The review of 2 Oct 2026, R-02. A pause sent again every six days held the funder's unearned money for
    ///      as long as the owner wished: nothing was drained, nothing finalised. Sent as often as the contract now
    ///      lets it, one pause stands, and what was not earned goes back a catch-up window after it.
    function testTheFundersUnearnedMoneyComesBackHoweverOftenTheOwnerSendsThePause() public {
        uint256 id = _baselined();
        uint256 began = _dayStart(day0 + 2) + 12 hours;
        VM.warp(began);
        escrow.setCheckInPaused(true);
        uint256 accepted;
        for (uint256 day = 1; day <= 8; ++day) {
            VM.warp(began + day * 1 days);
            try escrow.setCheckInPaused(true) {
                ++accepted;
            } catch {}
        }
        require(accepted == 0 && escrow.checkInPausedUntil() == began + 7 days, "one pause, seven days");

        // One catch-up window after it lapsed the clock is the plain one, and the gift's seven days are long over.
        VM.warp(began + 7 days + 30 hours);
        escrow.drain(id);
        escrow.finalise(id);
        escrow.refundUnearned(id);
        require(token.balanceOf(funder) == 1_000_000_000, "the funder has the whole unearned amount back");
    }

    /// @dev The review of 2 Oct 2026, R-03. A pause flicked on and off every 29 hours kept the clock of missed days
    ///      where the first flick found it, with check-ins open, so twenty idle days were all credited from one late
    ///      reading. The second flick is refused now, the clock moves again, and the same reading credits two.
    function testAPauseFlickedOnAndOffNoLongerStopsTheClockOfMissedDays() public {
        uint256 id = _createFor(30, 300_000_000);
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1000, uint64(START)));
        VM.warp(_dayStart(day0 + 1) + 10 minutes);
        escrow.setCheckInPaused(true);
        escrow.setCheckInPaused(false);
        for (uint256 i = 0; i < 17; ++i) {
            VM.warp(VM.getBlockTimestamp() + 29 hours);
            if (VM.getBlockTimestamp() <= _dayStart(day0 + 1) + 10 minutes + 7 days) {
                VM.expectRevert(GiftEscrowV2.PauseTooSoon.selector);
                escrow.setCheckInPaused(true);
            }
        }
        VM.warp(_readAt(day0 + 22));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1200, uint64(_readAt(day0 + 22))));
        GiftEscrowV2.Gift memory g = escrow.getGift(id);
        require(
            g.creditedDays == 2 && g.drainedDays == 19, "two days counted, nineteen missed, as with no pause at all"
        );
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
        return _createFor(DURATION, AMOUNT);
    }

    function _createFor(uint32 duration, uint256 amount) private returns (uint256) {
        GiftEscrowV2.GiftParams memory p = _dailyParams(funder, GOAL, amount, duration, TARGET);
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
///         way once the owner was gone. The review of 2 Oct 2026 added four: a pause is not sent twice in a row
///         (R-02), one sent after a window closed reopens nothing (R-04), a climb whose deadline fell inside a pause
///         is judged on a reading taken until the pause ended (R-14), and a signer announced before a hand-over
///         does not stand after it (R-05).
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
    bytes32 private constant SUBJECT = keccak256("subject:ama:a course");

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
        gift.registerGoal(GOAL_CHESS, CHESS_PROVIDER, 0);
        gift.registerGoal(GOAL_CERTIFICATE, CERTIFICATE_PROVIDER, 1);
        token.mint(funder, 1_000_000_000);
    }

    function testANewContractMakesNoGiftUntilItsDeployerOpensItAndItsPauseIsReadyFromTheFirstDay() public {
        MilestoneGiftV2 fresh = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        fresh.registerGoal(GOAL_CHESS, CHESS_PROVIDER, 0);
        require(fresh.creationPaused(), "closed at first");
        MilestoneGiftV2.MilestoneParams memory p =
            _climbParams(funder, GOAL_CHESS, AMOUNT, DURATION, TARGET, TARGET - 200);
        MilestoneGiftV2.Authorization memory a = _milestoneAuthorization(fresh, p, FUNDER_KEY);
        VM.expectRevert(MilestoneGiftV2.CreationIsPaused.selector);
        fresh.createGift(p, a);
        // No pause of proofs is spent on a contract that holds no gift: the brake is whole the day gifts begin.
        require(!fresh.proofPaused() && fresh.proofPausedUntil() == 0 && fresh.proofPauseBegan() == 0, "unspent");
        fresh.setCreationPaused(false);
        fresh.setProofPaused(true);
        require(fresh.proofPaused() && fresh.proofPausedUntil() == START + 7 days, "paused the day it opens");
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

    function testAPauseCannotBeSentAgainWhileItRunsNorForSevenDaysAfterItEnded() public {
        gift.setProofPaused(true);
        require(gift.proofPauseBegan() == START && gift.proofPausedUntil() == START + 7 days, "a pause");
        VM.warp(START + 6 days);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        require(gift.proofPausedUntil() == START + 7 days, "its end has not moved");
        VM.warp(START + 7 days);
        require(!gift.proofPaused(), "and no longer");

        VM.warp(START + 14 days);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        VM.warp(START + 14 days + 1);
        gift.setProofPaused(true);
        require(gift.proofPauseBegan() == START + 14 days + 1, "a new pause, a week after the first one lapsed");

        // Ended by the owner at once: the week of rest is counted from that end.
        gift.setProofPaused(false);
        require(gift.proofPausedUntil() == START + 14 days + 1 && !gift.proofPaused(), "ended by the owner");
        VM.warp(START + 21 days + 1);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        VM.warp(START + 21 days + 2);
        gift.setProofPaused(true);
    }

    /// @dev The review of 2 Oct 2026, R-04. A certificate whose fourteen late days ran out weeks ago, a climb a
    ///      month past its deadline, a gift nobody opened and one nobody started, none of them expired yet. A pause
    ///      sent then, and lifted at once, used to count every one of those windows again from that moment.
    function testAPauseSentAfterAWindowClosedReopensNothing() public {
        uint256 certificate = _certificate(10);
        uint256 climb = _startedFor(10, 1200);
        uint256 unopened = _createFor(10);
        uint256 unstarted = _claimedFor(10);
        uint64 granted = uint64(START + 5 days);
        uint64 inTime = uint64(START + 9 days);

        VM.warp(START + 44 days);
        gift.setProofPaused(true);
        // Even while the pause runs: these windows had closed before it began, so it holds nothing of them.
        gift.expire(certificate);
        gift.expire(unopened);
        gift.setProofPaused(false);

        MilestoneGiftV2.ProofAttestation memory late =
            _milestoneProof(gift, climb, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, inTime);
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(climb, late);
        gift.expire(climb);
        gift.expire(unstarted);

        // A gift made after that pause is untouched by it: its own late days, and no more.
        uint256 other_ = _certificateAt(START + 44 days, 10);
        VM.warp(START + 44 days + 10 days + 14 days + 1);
        MilestoneGiftV2.ProofAttestation memory tooLate = _milestoneProof(
            gift, other_, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted + 44 days, uint64(VM.getBlockTimestamp())
        );
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(other_, tooLate);

        gift.refundUnearned(certificate);
        gift.refundUnearned(climb);
        gift.refundUnearned(unopened);
        gift.refundUnearned(unstarted);
        require(token.balanceOf(funder) == 1_000_000_000 - AMOUNT, "four gifts back, one still to expire");
    }

    /// @dev A window that was open when the pause began has, after it, the time it had left: no more, no less.
    function testAPauseThatBeganInsideTheGraceGivesBackWhatTheGraceHadLeft() public {
        uint256 paid = _startedFor(10, 1200);
        uint256 late = _startedFor(10, 1200);
        uint256 deadline = START + 10 days;
        // Two hours into the six of the grace, proofs are paused, for three days.
        VM.warp(deadline + 2 hours);
        gift.setProofPaused(true);
        uint256 reopened = deadline + 2 hours + 3 days;
        VM.warp(reopened);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(paid);
        gift.setProofPaused(false);

        // Four hours were left. A reading taken before the deadline is taken until four hours after the reopening.
        VM.warp(reopened + 4 hours);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(paid);
        gift.prove(
            paid,
            _milestoneProof(gift, paid, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline - 1 hours))
        );
        require(gift.earnedBalance(paid) == AMOUNT, "read in time, sent inside what the grace had left");

        VM.warp(reopened + 4 hours + 1);
        MilestoneGiftV2.ProofAttestation memory after_ =
            _milestoneProof(gift, late, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline - 1 hours));
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(late, after_);
        gift.expire(late);
    }

    function testAPauseInsideACertificatesLateDaysGivesBackWhatWasLeftUpToSevenDays() public {
        uint256 id = _certificate(10);
        uint256 deadline = START + 10 days;
        uint64 granted = uint64(START + 5 days);
        // One late day is left when the pause begins. It lapses a week later, and that day is whole again.
        VM.warp(deadline + 13 days);
        gift.setProofPaused(true);
        VM.warp(deadline + 20 days);
        require(!gift.proofPaused(), "lapsed");
        VM.warp(deadline + 21 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.prove(
            id,
            _milestoneProof(gift, id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(deadline + 21 days))
        );
        require(gift.earnedBalance(id) == AMOUNT, "granted in time, shown on the day the pause gave back");
    }

    function testAPauseEarlyInACertificatesLateDaysLeavesAWeekAfterIt() public {
        uint256 id = _certificate(10);
        uint256 deadline = START + 10 days;
        // Twelve late days are left when the pause begins, five when it lapses: a week is counted from its end.
        VM.warp(deadline + 2 days);
        gift.setProofPaused(true);
        VM.warp(deadline + 16 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        VM.warp(deadline + 16 days + 1);
        gift.expire(id);
    }

    function testAPauseAcrossACertificatesDeadlineLeavesItsLateDaysWhereTheyWere() public {
        uint256 id = _certificate(10);
        uint256 deadline = START + 10 days;
        // The pause lapses six days into the fourteen: eight are left, more than a pause can take. Nothing moves.
        VM.warp(deadline - 1 days);
        gift.setProofPaused(true);
        VM.warp(deadline + 14 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        VM.warp(deadline + 14 days + 1);
        gift.expire(id);
    }

    /// @dev The review of 2 Oct 2026, R-02, on this contract: `expire` was refused for as long as the pause was
    ///      sent again. Sent as often as the contract lets it, no gift is held from one pause to the next: whatever a
    ///      pause moved has closed before another can begin.
    function testNoGiftIsHeldFromOnePauseToTheNextHoweverOftenTheOwnerSendsIt() public {
        uint256 climb = _startedFor(10, 1200);
        uint256 certificate = _certificate(10);
        uint256 deadline = START + 10 days;

        // The first pause begins the day before the deadline and lapses six days after it.
        VM.warp(deadline - 1 days);
        gift.setProofPaused(true);
        VM.warp(deadline + 6 days);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        // The climb: its six hours of grace follow the pause, and then it goes back.
        VM.warp(deadline + 6 days + 6 hours + 1);
        gift.expire(climb);

        // The second pause begins the first second the contract allows, inside the certificate's late days.
        VM.warp(deadline + 13 days);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        VM.warp(deadline + 13 days + 1);
        gift.setProofPaused(true);
        // The certificate had a day less a second left: it has it again after the pause, and no third pause can
        // begin before that day is over.
        VM.warp(deadline + 21 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(certificate);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        VM.warp(deadline + 21 days + 1);
        VM.expectRevert(MilestoneGiftV2.PauseTooSoon.selector);
        gift.setProofPaused(true);
        gift.expire(certificate);

        gift.refundUnearned(climb);
        gift.refundUnearned(certificate);
        require(token.balanceOf(funder) == 1_000_000_000, "both went back to the funder");
    }

    /// @dev The review of 2 Oct 2026, R-14. A pause from two days before a climb's deadline. The person reaches the
    ///      target the day before the deadline and cannot prove it: proofs are paused. When they reopened only a
    ///      reading taken before the deadline was accepted, and nobody held one, so the gift went back.
    function testAClimbWhoseDeadlineFellInsideAPauseIsJudgedOnAReadingTakenUntilThePauseEnded() public {
        uint256 id = _startedFor(10, 1200);
        uint256 afterIt = _startedFor(10, 1200);
        uint256 deadline = START + 10 days;
        VM.warp(deadline - 2 days);
        gift.setProofPaused(true);
        VM.warp(deadline - 1 days);
        MilestoneGiftV2.ProofAttestation memory reached =
            _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline - 1 days));
        VM.expectRevert(MilestoneGiftV2.ProofIsPaused.selector);
        gift.prove(id, reached);

        // The owner reopens three days after the deadline.
        uint256 reopened = deadline + 3 days;
        VM.warp(reopened);
        gift.setProofPaused(false);

        // A reading taken once proofs are open again is past the deadline, as it would be with no pause.
        VM.warp(reopened + 1 hours);
        MilestoneGiftV2.ProofAttestation memory fresh =
            _milestoneProof(gift, afterIt, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(reopened + 1 hours));
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(afterIt, fresh);

        // One taken while they were paused counts, the deadline included in the pause, inside the grace that follows.
        gift.prove(
            id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline + 2 days))
        );
        require(gift.earnedBalance(id) == AMOUNT, "reached while proofs were paused, paid when they reopened");

        // The grace is six hours from the reopening, for this reading as for any.
        VM.warp(reopened + 6 hours + 1);
        MilestoneGiftV2.ProofAttestation memory slow =
            _milestoneProof(gift, afterIt, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline - 1 days));
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(afterIt, slow);
        gift.expire(afterIt);
    }

    function testADeadlineOutsideAPauseStaysTheDeadline() public {
        uint256 before = _startedFor(10, 1200);
        uint256 deadline = START + 10 days;
        // A pause that ended before the deadline moves nothing.
        VM.warp(deadline - 5 days);
        gift.setProofPaused(true);
        VM.warp(deadline - 4 days);
        gift.setProofPaused(false);
        VM.warp(deadline + 1 hours);
        MilestoneGiftV2.ProofAttestation memory pastIt =
            _milestoneProof(gift, before, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline + 1));
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(before, pastIt);
        gift.prove(
            before, _milestoneProof(gift, before, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline))
        );
        require(gift.earnedBalance(before) == AMOUNT, "a reading of the deadline itself still pays inside the grace");
    }

    function testAPauseThatBeganAfterTheDeadlineMovesTheGraceAndNotTheDeadline() public {
        uint256 id = _startedFor(10, 1200);
        uint256 deadline = START + 10 days;
        VM.warp(deadline + 1 hours);
        gift.setProofPaused(true);
        VM.warp(deadline + 2 days);
        gift.setProofPaused(false);
        MilestoneGiftV2.ProofAttestation memory during =
            _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline + 1 days));
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(id, during);
        gift.prove(id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, 0, uint64(deadline)));
        require(gift.earnedBalance(id) == AMOUNT, "read in time, sent once proofs reopened");
    }

    /// @dev The review of 2 Oct 2026, R-05, as on the daily contract.
    function testASignerAnnouncedBeforeAHandOverNeverStandsAfterIt() public {
        address safe = address(0x5AFE);
        gift.transferOwnership(safe);
        gift.setEvidenceSigner(VM.addr(0xBAD));
        VM.prank(safe);
        gift.acceptOwnership();
        require(
            gift.pendingEvidenceSigner() == address(0) && gift.evidenceSignerReadyAt() == 0,
            "called off by the hand-over"
        );
        VM.warp(START + 24 hours);
        VM.expectRevert(MilestoneGiftV2.NoSignerPending.selector);
        gift.applyEvidenceSigner();
        require(gift.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place never changed");
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
        return _createFor(DURATION);
    }

    function _createFor(uint32 duration) private returns (uint256) {
        MilestoneGiftV2.MilestoneParams memory p =
            _climbParams(funder, GOAL_CHESS, AMOUNT, duration, TARGET, TARGET - 200);
        return gift.createGift(p, _milestoneAuthorization(gift, p, FUNDER_KEY));
    }

    function _claimed() private returns (uint256 id) {
        return _claimedFor(DURATION);
    }

    function _claimedFor(uint32 duration) private returns (uint256 id) {
        id = _createFor(duration);
        gift.claim(id, _milestoneOpen(gift, id, recipient, LINK_KEY));
    }

    function _started(uint64 from) private returns (uint256 id) {
        return _startedFor(DURATION, from);
    }

    function _startedFor(uint32 duration, uint64 from) private returns (uint256 id) {
        id = _claimedFor(duration);
        gift.prove(
            id, _milestoneProof(gift, id, recipient, IDENTITY, CHESS_PROVIDER, from, 0, uint64(VM.getBlockTimestamp()))
        );
    }

    function _certificate(uint32 duration) private returns (uint256 id) {
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_CERTIFICATE, AMOUNT, duration, SUBJECT);
        id = gift.createGift(p, _milestoneAuthorization(gift, p, FUNDER_KEY));
        gift.claim(id, _milestoneOpen(gift, id, recipient, LINK_KEY));
    }

    /// @dev A certificate gift made later than the suite's start, which is where the block already stands.
    function _certificateAt(uint256 moment, uint32 duration) private returns (uint256 id) {
        require(VM.getBlockTimestamp() == moment, "made at the moment the test says");
        return _certificate(duration);
    }
}
