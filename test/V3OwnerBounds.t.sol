// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V3Kit} from "./kit/V3Kit.sol";

/// @notice What the owner of the daily contract can and cannot do (the audit of 1 Oct 2026, section 3.1.2). On the
///         first version the owner could give the contract up, replace the evidence signer at once, move a goal
///         under the gifts made on it, and hold a pause for ever. Each of those is bounded here, and the review of
///         2 Oct 2026 bounded the pause again: it is not sent twice in a row (R-02, R-03), and a signer announced
///         before a hand-over does not stand after it (R-05). The second version's suite on the third daily
///         contract, which leaves the owner's bounds as they were: where a test counts days, they are the third
///         version's, the first of them the day of the connection.
contract GiftEscrowV3OwnerBoundsTest is V3Kit {
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
    GiftEscrowV3 private escrow;
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
        escrow = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.registerGoal(GOAL, PROVIDER);
        token.mint(funder, 1_000_000_000);
        VM.warp(START);
        day0 = uint32(START / DAY);
    }

    // --- ownership --------------------------------------------------------------------------------------------

    function testANewContractMakesNoGiftUntilItsDeployerOpensItAndItsPauseIsReadyFromTheFirstDay() public {
        GiftEscrowV3 fresh = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        fresh.registerGoal(GOAL, PROVIDER);
        require(fresh.creationPaused(), "closed at first");
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, AMOUNT, DURATION, TARGET);
        GiftEscrowV3.Authorization memory a = _dailyAuthorization(fresh, p, FUNDER_KEY);
        VM.expectRevert(GiftEscrowV3.CreationIsPaused.selector);
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
        VM.expectRevert(GiftEscrowV3.OwnershipIsNotRenounceable.selector);
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
        VM.expectRevert(GiftEscrowV3.NoSignerPending.selector);
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
        VM.expectRevert(GiftEscrowV3.GoalAlreadyRegistered.selector);
        escrow.registerGoal(GOAL, keccak256("somewhere else"));
        // The same provider again is refused too: there is nothing to say twice.
        VM.expectRevert(GiftEscrowV3.GoalAlreadyRegistered.selector);
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
        VM.expectRevert(GiftEscrowV3.SignerNotReady.selector);
        escrow.applyEvidenceSigner();
        VM.warp(START + 1 hours);
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1010, uint64(START + 1 hours)));
        require(escrow.getGift(id).creditedDays == 1, "the signer in place still counts a day");

        // Once the day is over, anybody carries it.
        VM.warp(START + 24 hours);
        VM.prank(other);
        escrow.applyEvidenceSigner();
        require(
            escrow.evidenceSigner() == rogue && escrow.pendingEvidenceSigner() == address(0), "replaced after the wait"
        );
        VM.expectRevert(GiftEscrowV3.NoSignerPending.selector);
        escrow.applyEvidenceSigner();
    }

    function testAnAnnouncedSignerCanBeCalledOff() public {
        escrow.setEvidenceSigner(VM.addr(0xBAD));
        escrow.setEvidenceSigner(address(0));
        require(escrow.pendingEvidenceSigner() == address(0) && escrow.evidenceSignerReadyAt() == 0, "called off");
        VM.warp(START + 24 hours);
        VM.expectRevert(GiftEscrowV3.NoSignerPending.selector);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == VM.addr(EVIDENCE_KEY), "the signer in place never changed");
    }

    function testAnnouncingAgainStartsTheDayAgain() public {
        escrow.setEvidenceSigner(VM.addr(0xBAD));
        VM.warp(START + 23 hours);
        escrow.setEvidenceSigner(VM.addr(0xBAD2));
        VM.warp(START + 24 hours);
        VM.expectRevert(GiftEscrowV3.SignerNotReady.selector);
        escrow.applyEvidenceSigner();
        VM.warp(START + 47 hours);
        escrow.applyEvidenceSigner();
        require(escrow.evidenceSigner() == VM.addr(0xBAD2), "the last one announced, a full day after it was");
    }

    // --- the pause --------------------------------------------------------------------------------------------

    function testThePauseIsAlsoTheBrakeOnOpeningAGiftAndNeverHoldsTheFunder() public {
        uint256 id = _create();
        escrow.setCheckInPaused(true);
        GiftEscrowV3.OpenIntent memory o = _dailyOpen(escrow, id, recipient, LINK_KEY);
        VM.expectRevert(GiftEscrowV3.CheckInIsPaused.selector);
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
        GiftEscrowV3.OpenIntent memory early = _dailyOpen(escrow, id, recipient, LINK_KEY);
        VM.expectRevert(GiftEscrowV3.CheckInIsPaused.selector);
        escrow.claim(id, early);
        // The owner is gone. Seven days after the pause was sent, gifts open and are read again.
        VM.warp(START + 7 days);
        require(!escrow.checkInPaused(), "the pause lapsed");
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1000, uint64(START + 7 days)));
        // On the third version the first day is the day of that reading itself.
        require(escrow.getGift(id).startDay == day0 + 7, "read again");
    }

    /// @dev The Medium of the audit: a pause must hold a day open, never take it. A person who kept working through
    ///      a pause of ours is credited every day of it once readings reopen, and nothing is drained meanwhile.
    function testAPauseHoldsEveryOpenDayAndGivesAWholeWindowBackAfterIt() public {
        uint256 worked = _baselined();
        uint256 idle = _baselined();
        // Day one, the day of the connection, is done and not yet read. The pause begins ten minutes after midnight,
        // before the reading that would count it. Every date here is a day earlier than on the second version.
        uint256 begins = _dayStart(day0 + 1) + 10 minutes;
        VM.warp(begins);
        escrow.setCheckInPaused(true);

        // Two days later the first two days would be past their catch-up. Under a pause nothing is taken.
        VM.warp(_dayStart(day0 + 3) + 6 hours);
        GiftEscrowV3.CheckInAttestation memory during =
            _dailyReading(escrow, worked, recipient, IDENTITY, PROVIDER, 1030, uint64(_dayStart(day0 + 3) + 6 hours));
        VM.expectRevert(GiftEscrowV3.CheckInIsPaused.selector);
        escrow.checkIn(worked, during);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(worked);
        require(escrow.lastDrainableDay() == day0 - 2, "the clock stands where the pause began");

        // The owner reopens three days after it began. The reading of that morning counts all four days done.
        uint256 ends = _dayStart(day0 + 4) + 10 minutes;
        VM.warp(ends);
        escrow.setCheckInPaused(false);
        VM.warp(_readAt(day0 + 4));
        escrow.checkIn(
            worked, _dailyReading(escrow, worked, recipient, IDENTITY, PROVIDER, 1040, uint64(_readAt(day0 + 4)))
        );
        GiftEscrowV3.Gift memory g = escrow.getGift(worked);
        require(g.creditedDays == 4 && g.drainedDays == 0, "four days done, four days counted, none taken");
        require(g.settledThroughDay == day0 + 3, "the day of the reading itself is still open");

        // For one catch-up window after the pause nothing is settled as missed, so a reading has time to arrive.
        VM.warp(ends + 30 hours - 1);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
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
        VM.expectRevert(GiftEscrowV3.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        require(escrow.checkInPausedUntil() == began + 7 days, "its end has not moved");

        // Ended by the owner. Reopening what is open moves nothing.
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 5 days && !escrow.checkInPaused(), "ended by the owner");
        escrow.setCheckInPaused(false);
        require(escrow.checkInPausedUntil() == began + 5 days, "reopening what is open moves nothing");

        // For seven days after its end, no pause.
        VM.warp(began + 5 days + 1);
        VM.expectRevert(GiftEscrowV3.PauseTooSoon.selector);
        escrow.setCheckInPaused(true);
        VM.warp(began + 12 days);
        VM.expectRevert(GiftEscrowV3.PauseTooSoon.selector);
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
        VM.expectRevert(GiftEscrowV3.PauseTooSoon.selector);
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
                VM.expectRevert(GiftEscrowV3.PauseTooSoon.selector);
                escrow.setCheckInPaused(true);
            }
        }
        // A day earlier than on the second version, and one day more counted: the day of the reading is open too.
        VM.warp(_readAt(day0 + 21));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1200, uint64(_readAt(day0 + 21))));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(
            g.creditedDays == 3 && g.drainedDays == 19, "three days counted, nineteen missed, as with no pause at all"
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
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
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
        VM.warp(_dayStart(day0 + DURATION - 1) + 1 hours);
        escrow.setCheckInPaused(true);
        VM.warp(_dayStart(day0 + DURATION + 1) + 7 hours);
        VM.expectRevert(GiftEscrowV3.FinalisationTooEarly.selector);
        escrow.finalise(id);
        escrow.setCheckInPaused(false);
        VM.expectRevert(GiftEscrowV3.FinalisationTooEarly.selector);
        escrow.finalise(id);
        VM.warp(_dayStart(day0 + DURATION + 1) + 7 hours + 30 hours);
        escrow.finalise(id);
        require(escrow.getGift(id).finalised, "finalised once a reading has had its window");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _create() private returns (uint256) {
        return _createFor(DURATION, AMOUNT);
    }

    function _createFor(uint32 duration, uint256 amount) private returns (uint256) {
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, amount, duration, TARGET);
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

    /// @dev The first reading a pass takes of a day, at 00:30 UTC.
    function _readAt(uint32 day) private pure returns (uint256) {
        return _dayStart(day) + 30 minutes;
    }
}
