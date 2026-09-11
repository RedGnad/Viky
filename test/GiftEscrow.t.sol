// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrow} from "../contracts/GiftEscrow.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmGift {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
}

contract GiftEscrowTest {
    VmGift private constant VM = VmGift(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant WRONG_KEY = 0xBAD;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    uint256 private constant DAY = 1 days;
    // 08:00 UTC on some day, so every timestamp arithmetic crosses real day boundaries.
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 7_000_000; // 7 AUSD
    uint32 private constant TARGET = 10;
    uint32 private constant DURATION = 7;
    uint256 private constant PER_DAY = 1_000_000;
    uint8 private constant GOAL_DUOLINGO = 1;
    bytes32 private constant DUOLINGO_PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    bytes32 private constant STRAVA_PROVIDER = keccak256("f3ec8292-d8f3-487c-a79d-f53f482f88e2@7.0.0");
    bytes32 private constant CONTACT = keccak256("viky:contact:v1:email:ama@example.com");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant OTHER_IDENTITY = keccak256("identity:someone-else");

    MockAUSD private token;
    GiftEscrow private escrow;
    address private evidenceSigner;
    address private funder;
    address private recipient;
    address private other;
    uint256 private nullifierSeed;
    uint256 private saltSeed;
    uint32 private day0;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        evidenceSigner = VM.addr(EVIDENCE_KEY);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        escrow = new GiftEscrow(token, evidenceSigner, 1);
        require(escrow.creationPaused() && escrow.checkInPaused(), "not fail-closed");
        escrow.setCreationPaused(false);
        escrow.setCheckInPaused(false);
        escrow.registerGoal(GOAL_DUOLINGO, DUOLINGO_PROVIDER);
        token.mint(funder, 1_000_000_000);
        day0 = uint32(START / DAY);
    }

    // --- create and fund ------------------------------------------------------------------------------

    function testCreateGiftPullsTheMoneyWithOneSignatureBoundToTheTerms() public {
        uint256 before = token.balanceOf(funder);
        uint256 giftId = _create();
        require(giftId == 1, "first gift id");
        require(token.balanceOf(address(escrow)) == AMOUNT, "escrow not funded");
        require(token.balanceOf(funder) == before - AMOUNT, "funder not debited");
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.funder == funder && g.refundTo == funder && g.recipient == address(0), "parties");
        require(g.perDay == PER_DAY && g.amount == AMOUNT && g.durationDays == DURATION, "terms");
        require(g.fundedAt == START && g.startDay == 0, "window not open before the baseline");
    }

    function testCreateRefusesAnAuthorizationNotBoundToTheTerms() public {
        GiftEscrow.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        GiftEscrow.Authorization memory a = _authorization(p, FUNDER_KEY);
        // The relayer changes the amount after the funder signed: the derived nonce no longer matches.
        p.amount = AMOUNT + 1;
        VM.expectRevert(GiftEscrow.InvalidAuthorizationNonce.selector);
        escrow.createGift(p, a);
        // A nonce that matches the terms but a signature by someone else fails inside the token.
        GiftEscrow.GiftParams memory q = _params(AMOUNT, DURATION, TARGET);
        GiftEscrow.Authorization memory forged = _authorization(q, OTHER_KEY);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        escrow.createGift(q, forged);
    }

    function testTwoGiftsWithIdenticalTermsNeedDistinctSalts() public {
        GiftEscrow.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        escrow.createGift(p, _authorization(p, FUNDER_KEY));
        // Same terms, same salt: the token refuses the reused authorization.
        GiftEscrow.Authorization memory again = _authorization(p, FUNDER_KEY);
        VM.expectRevert(MockAUSD.AuthorizationUsed.selector);
        escrow.createGift(p, again);
        // Same terms, fresh salt: a second gift.
        p.salt = keccak256("another salt");
        require(escrow.createGift(p, _authorization(p, FUNDER_KEY)) == 2, "second gift");
    }

    function testCreateValidatesTheTermsAndTheGoalMenu() public {
        _expectCreateRevert(_params(AMOUNT, 6, TARGET), GiftEscrow.InvalidDuration.selector);
        _expectCreateRevert(_params(AMOUNT, 91, TARGET), GiftEscrow.InvalidDuration.selector);
        _expectCreateRevert(_params(999_999, DURATION, TARGET), GiftEscrow.InvalidAmount.selector);
        _expectCreateRevert(_params(100_000_000_001, DURATION, TARGET), GiftEscrow.InvalidAmount.selector);
        _expectCreateRevert(_params(AMOUNT, DURATION, 0), GiftEscrow.InvalidDailyTarget.selector);

        // Refusal case 1: a goal outside the certifiable menu is refused at creation.
        GiftEscrow.GiftParams memory unknownGoal = _params(AMOUNT, DURATION, TARGET);
        unknownGoal.goalType = 9;
        _expectCreateRevert(unknownGoal, GiftEscrow.UnknownGoal.selector);

        GiftEscrow.GiftParams memory noContact = _params(AMOUNT, DURATION, TARGET);
        noContact.recipientContactHash = bytes32(0);
        _expectCreateRevert(noContact, GiftEscrow.InvalidContactHash.selector);

        GiftEscrow.GiftParams memory noRefund = _params(AMOUNT, DURATION, TARGET);
        noRefund.refundTo = address(0);
        _expectCreateRevert(noRefund, GiftEscrow.InvalidAddress.selector);

        escrow.setCreationPaused(true);
        _expectCreateRevert(_params(AMOUNT, DURATION, TARGET), GiftEscrow.CreationIsPaused.selector);
    }

    // --- claim ------------------------------------------------------------------------------------------

    function testClaimBindsTheRecipientAndRefusesTheWrongContactSignerOrReplay() public {
        uint256 giftId = _create();
        GiftEscrow.ClaimAttestation memory wrongContact =
            _claimAttestation(giftId, recipient, keccak256("other"), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.ContactMismatch.selector);
        escrow.claim(giftId, wrongContact);

        GiftEscrow.ClaimAttestation memory wrongSigner = _claimAttestation(giftId, recipient, CONTACT, WRONG_KEY);
        VM.expectRevert(GiftEscrow.InvalidEvidenceSigner.selector);
        escrow.claim(giftId, wrongSigner);

        GiftEscrow.ClaimAttestation memory expired = _claimAttestation(giftId, recipient, CONTACT, EVIDENCE_KEY);
        VM.warp(START + 6 minutes);
        VM.expectRevert(GiftEscrow.AttestationExpired.selector);
        escrow.claim(giftId, expired);
        VM.warp(START);

        _claim(giftId);
        require(escrow.getGift(giftId).recipient == recipient, "recipient not bound");

        GiftEscrow.ClaimAttestation memory second = _claimAttestation(giftId, other, CONTACT, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.AlreadyClaimed.selector);
        escrow.claim(giftId, second);
    }

    function testClaimRefusedOnACancelledGift() public {
        uint256 giftId = _create();
        VM.prank(funder);
        escrow.cancel(giftId);
        GiftEscrow.ClaimAttestation memory c = _claimAttestation(giftId, recipient, CONTACT, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.GiftIsCancelled.selector);
        escrow.claim(giftId, c);
    }

    // --- check-in ---------------------------------------------------------------------------------------

    function testBaselineBindsIdentityAndOpensTheWindowTheNextDay() public {
        uint256 giftId = _create();
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.identityHash == IDENTITY && g.baselineValue == 1000, "baseline not recorded");
        require(g.startDay == day0 + 1 && g.endDay == day0 + DURATION, "window");
        require(g.creditedDays == 0 && g.settledThroughDay == day0, "nothing credited at baseline");
        // The same day is not yet open: a second check-in today credits nothing.
        uint256 later = START + 1 hours;
        VM.warp(later);
        GiftEscrow.CheckInAttestation memory sameDay =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(later), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.OutsideWindow.selector);
        escrow.checkIn(giftId, sameDay);
    }

    function testCheckInBeforeClaimIsRefused() public {
        uint256 giftId = _create();
        GiftEscrow.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.NotClaimed.selector);
        escrow.checkIn(giftId, a);
    }

    function testOneDayIsCreditedAndBecomesTheRecipients() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 2);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0 + 1, "one day credited");
        require(escrow.earnedBalance(giftId) == PER_DAY, "earned balance");
        require(g.baselineValue == 1010, "anchor moved by exactly the credited progress");
    }

    function testBingeCreditsEveryOpenDayAndDiscardsTheExcess() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 3);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1050, t); // 50 XP for two open days: two credited, the rest is not banked
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 2, "two days credited");
        require(g.baselineValue == 1050, "excess discarded");
        // Nothing left to credit today.
        GiftEscrow.CheckInAttestation memory more =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1100, uint64(t + 1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.NothingToCredit.selector);
        escrow.checkIn(giftId, more);
    }

    function testPartialProgressCarriesToTheNextCheckIn() public {
        uint256 giftId = _baselined();
        uint256 t1 = _readAt(day0 + 2);
        VM.warp(t1);
        GiftEscrow.CheckInAttestation memory short_ =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1006, uint64(t1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.InsufficientProgress.selector);
        escrow.checkIn(giftId, short_);

        uint256 t2 = _readAt(day0 + 3);
        VM.warp(t2);
        _checkIn(giftId, IDENTITY, 1012, t2); // 12 XP since the anchor: one day, 2 XP carried
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.baselineValue == 1010, "remainder kept");

        _checkIn(giftId, IDENTITY, 1020, t2 + 1); // 10 XP since the anchor: the second open day
        g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.baselineValue == 1020, "second day credited from the carried anchor");
    }

    function testCheckInRefusals() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 2);
        VM.warp(t);

        // Provider mismatch: a Strava attestation on a Duolingo gift.
        GiftEscrow.CheckInAttestation memory strava =
            _checkInAttestation(giftId, recipient, IDENTITY, STRAVA_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.ProviderMismatch.selector);
        escrow.checkIn(giftId, strava);

        // Refusal case 5: another Duolingo account than the one bound.
        GiftEscrow.CheckInAttestation memory otherAccount =
            _checkInAttestation(giftId, recipient, OTHER_IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherAccount);

        // Another recipient than the one bound.
        GiftEscrow.CheckInAttestation memory otherRecipient =
            _checkInAttestation(giftId, other, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherRecipient);

        // Wrong signer.
        GiftEscrow.CheckInAttestation memory wrongSigner =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), WRONG_KEY);
        VM.expectRevert(GiftEscrow.InvalidEvidenceSigner.selector);
        escrow.checkIn(giftId, wrongSigner);

        // Metric going backwards.
        GiftEscrow.CheckInAttestation memory backwards =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 999, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.MetricDecreased.selector);
        escrow.checkIn(giftId, backwards);

        // Observation dated in the future beyond the clock skew.
        GiftEscrow.CheckInAttestation memory future = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t + 2 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrow.InvalidAttestationWindow.selector);
        escrow.checkIn(giftId, future);

        // Observation not newer than the last accepted one.
        GiftEscrow.CheckInAttestation memory stale =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.StaleObservation.selector);
        escrow.checkIn(giftId, stale);

        // Refusal case 2: a replayed nullifier.
        GiftEscrow.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        escrow.checkIn(giftId, a);
        GiftEscrow.CheckInAttestation memory replay =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        replay.nullifier = a.nullifier;
        replay.signature = _sign(EVIDENCE_KEY, _checkInStructHash(giftId, replay));
        VM.expectRevert(GiftEscrow.NullifierAlreadyUsed.selector);
        escrow.checkIn(giftId, replay);

        // Stale attestation: issued more than ten minutes ago.
        GiftEscrow.CheckInAttestation memory old =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        VM.warp(t + 11 minutes);
        VM.expectRevert(GiftEscrow.AttestationExpired.selector);
        escrow.checkIn(giftId, old);

        escrow.setCheckInPaused(true);
        GiftEscrow.CheckInAttestation memory paused = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 11 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrow.CheckInIsPaused.selector);
        escrow.checkIn(giftId, paused);
    }

    function testCheckInAfterTheWindowCreditsOnlyUpToTheLastDay() public {
        uint256 giftId = _baselined();
        uint256 t = _dayStart(day0 + DURATION + 3) + 1 hours;
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1000 + TARGET * 100, t);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION && g.settledThroughDay == g.endDay, "capped at the last day");
    }

    function testGiftIdsContinueFromTheConfiguredFirstId() public {
        GiftEscrow next = new GiftEscrow(token, evidenceSigner, 2);
        require(next.nextGiftId() == 2, "the sequence continues from the previous deployment");
        VM.expectRevert(GiftEscrow.InvalidGiftId.selector);
        new GiftEscrow(token, evidenceSigner, 0);
    }

    // --- the daily reading (D30): a day is judged the morning after it -------------------------------

    /// @dev The daily pass reads each recipient at 00:30 UTC. A reading closes the days before its own
    ///      day, never its own day: a lesson taken on day d is judged by the reading of day d + 1.
    function _readAt(uint32 day) private pure returns (uint256) {
        return _dayStart(day) + 30 minutes;
    }

    function testAReadingNeverCreditsItsOwnDay() public {
        uint256 giftId = _baselined();
        // The first window day, late evening, lesson done: that day is not over, nothing to credit yet.
        uint256 evening = _dayStart(day0 + 1) + 23 hours;
        VM.warp(evening);
        GiftEscrow.CheckInAttestation memory early =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(evening), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.OutsideWindow.selector);
        escrow.checkIn(giftId, early);
        // The next morning's reading credits it.
        VM.warp(_readAt(day0 + 2));
        _checkIn(giftId, IDENTITY, 1010, _readAt(day0 + 2));
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0 + 1, "day one credited the next morning");
    }

    function testTheLastDayCountsWhenReadTheNextMorning() public {
        uint256 giftId = _baselined();
        // One lesson on each window day, and one more on the baseline day itself.
        for (uint32 k = 2; k <= DURATION + 1; k++) {
            uint256 t = _readAt(day0 + k);
            VM.warp(t);
            _checkIn(giftId, IDENTITY, uint64(1000 + TARGET * k), t);
        }
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION && g.settledThroughDay == g.endDay, "the last day counted the next morning");
    }

    function testALessonBeforeTheWindowNeverPaysForAMissedDay() public {
        uint256 giftId = _baselined();
        // A lesson on the baseline day, then one per window day except the last one.
        for (uint32 k = 2; k <= DURATION; k++) {
            uint256 t = _readAt(day0 + k);
            VM.warp(t);
            _checkIn(giftId, IDENTITY, uint64(1000 + TARGET * k), t);
        }
        // The morning after the last day: no new lesson, nothing to credit.
        uint256 last = _readAt(day0 + DURATION + 1);
        VM.warp(last);
        GiftEscrow.CheckInAttestation memory none = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, uint64(1000 + TARGET * DURATION), uint64(last), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrow.InsufficientProgress.selector);
        escrow.checkIn(giftId, none);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION - 1, "six lessons in the window, six days");
        VM.warp(_dayStart(day0 + DURATION + 2) + 6 hours);
        escrow.finalise(giftId);
        g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION - 1 && g.drainedDays == 1, "the missed last day goes back");
    }

    function testADayIsNeverDrainedBeforeTheMorningReadingThatCouldCoverIt() public {
        uint256 giftId = _baselined();
        // Day one missed; two lessons on day two cover it. Someone calls drain just after midnight.
        VM.warp(_dayStart(day0 + 3) + 1);
        VM.expectRevert(GiftEscrow.NothingToDrain.selector);
        escrow.drain(giftId);
        // The morning reading credits both days.
        VM.warp(_readAt(day0 + 3));
        _checkIn(giftId, IDENTITY, 1020, _readAt(day0 + 3));
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 2, "caught up");
        VM.warp(_dayStart(day0 + 3) + 6 hours);
        VM.expectRevert(GiftEscrow.NothingToDrain.selector);
        escrow.drain(giftId);
    }

    // --- drain ------------------------------------------------------------------------------------------

    function testDrainWaitsForTheCatchUpWindowThenMovesMissedDaysOnly() public {
        uint256 giftId = _baselined();
        // Day day0+1 can be covered until the end of day day0+2 and is judged by the next morning's reading:
        // nothing to drain a second before that reading's grace ends.
        VM.warp(_dayStart(day0 + 3) + 6 hours - 1);
        VM.expectRevert(GiftEscrow.NothingToDrain.selector);
        escrow.drain(giftId);

        VM.warp(_dayStart(day0 + 3) + 6 hours);
        escrow.drain(giftId);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.drainedDays == 1 && g.settledThroughDay == day0 + 1, "day one drained");
        require(escrow.refundableBalance(giftId) == PER_DAY, "refundable bucket");

        VM.expectRevert(GiftEscrow.NothingToDrain.selector);
        escrow.drain(giftId);

        // The recipient covers day day0+2 in time (read on day0+3); day day0+3 is then missed.
        uint256 t = _dayStart(day0 + 3) + 7 hours;
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);
        VM.warp(_dayStart(day0 + 5) + 6 hours);
        escrow.drain(giftId);
        g = escrow.getGift(giftId);
        require(
            g.creditedDays == 1 && g.drainedDays == 2 && g.settledThroughDay == day0 + 3,
            "credited days are never drained"
        );
    }

    function testDrainNeedsABaseline() public {
        uint256 giftId = _create();
        _claim(giftId);
        VM.expectRevert(GiftEscrow.NoBaseline.selector);
        escrow.drain(giftId);
    }

    // --- withdraw ---------------------------------------------------------------------------------------

    function testRecipientWithdrawsDirectlyOrThroughASignedIntent() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 3);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1020, t); // two days
        require(escrow.earnedBalance(giftId) == 2 * PER_DAY, "earned");

        VM.expectRevert(GiftEscrow.NotRecipient.selector);
        VM.prank(other);
        escrow.withdrawEarned(giftId, other, PER_DAY);

        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY);
        require(token.balanceOf(recipient) == PER_DAY, "direct withdrawal");

        VM.expectRevert(GiftEscrow.InsufficientEarned.selector);
        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY + 1);

        // The relayer submits the recipient's signed intent.
        GiftEscrow.WithdrawIntent memory w = _intent(giftId, recipient, PER_DAY, 0, uint64(t + 1 hours), RECIPIENT_KEY);
        escrow.withdrawEarnedWithIntent(giftId, w);
        require(token.balanceOf(recipient) == 2 * PER_DAY, "intent withdrawal");
        require(escrow.earnedBalance(giftId) == 0, "nothing left");

        VM.expectRevert(GiftEscrow.InvalidIntentNonce.selector);
        escrow.withdrawEarnedWithIntent(giftId, w);

        GiftEscrow.WithdrawIntent memory forged = _intent(giftId, other, 1, 1, uint64(t + 1 hours), OTHER_KEY);
        VM.expectRevert(GiftEscrow.InvalidRecipientSignature.selector);
        escrow.withdrawEarnedWithIntent(giftId, forged);

        GiftEscrow.WithdrawIntent memory late = _intent(giftId, recipient, 1, 1, uint64(t - 1), RECIPIENT_KEY);
        VM.expectRevert(GiftEscrow.IntentExpired.selector);
        escrow.withdrawEarnedWithIntent(giftId, late);
    }

    // --- refund and cancel ------------------------------------------------------------------------------

    function testMissedDaysComeBackToTheFunder() public {
        uint256 giftId = _baselined();
        VM.expectRevert(GiftEscrow.NothingToRefund.selector);
        escrow.refundUnearned(giftId);

        VM.warp(_dayStart(day0 + 4) + 6 hours);
        escrow.drain(giftId); // days day0+1 and day0+2 missed
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + 2 * PER_DAY, "two days refunded");
        VM.expectRevert(GiftEscrow.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
    }

    function testUnclaimedGiftIsRefundedInFullAfterFourteenDays() public {
        uint256 giftId = _create();
        VM.warp(START + 14 days - 1);
        VM.expectRevert(GiftEscrow.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
        VM.warp(START + 14 days);
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "full refund");
        require(escrow.getGift(giftId).cancelled, "cancelled");
        GiftEscrow.ClaimAttestation memory c = _claimAttestation(giftId, recipient, CONTACT, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrow.GiftIsCancelled.selector);
        escrow.claim(giftId, c);
    }

    function testClaimedButNeverConnectedGiftIsRefundedAfterFourteenDays() public {
        uint256 giftId = _create();
        _claim(giftId);
        VM.warp(START + 14 days);
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "full refund");
    }

    function testFunderCancelsOnlyBeforeTheClaim() public {
        uint256 giftId = _create();
        VM.expectRevert(GiftEscrow.NotFunder.selector);
        VM.prank(other);
        escrow.cancel(giftId);

        uint256 before = token.balanceOf(funder);
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "cancel refunds everything");
        VM.expectRevert(GiftEscrow.GiftIsCancelled.selector);
        VM.prank(funder);
        escrow.cancel(giftId);

        uint256 claimed = _create();
        _claim(claimed);
        VM.expectRevert(GiftEscrow.CancellationClosed.selector);
        VM.prank(funder);
        escrow.cancel(claimed);
    }

    function testRefundGoesToTheCharityWhenTheFunderChoseOne() public {
        GiftEscrow.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        p.refundTo = other;
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(other) == AMOUNT, "charity received the refund");
    }

    // --- finalise ---------------------------------------------------------------------------------------

    function testFinaliseSettlesTheRemainderAndTheDust() public {
        GiftEscrow.GiftParams memory p = _params(7_000_004, DURATION, TARGET); // dust of 4 units
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        uint256 t = _readAt(day0 + 2);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);

        VM.warp(_dayStart(day0 + DURATION + 2) + 6 hours - 1);
        VM.expectRevert(GiftEscrow.FinalisationTooEarly.selector);
        escrow.finalise(giftId);

        VM.warp(_dayStart(day0 + DURATION + 2) + 6 hours);
        escrow.finalise(giftId);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.finalised && g.creditedDays == 1 && g.drainedDays == DURATION - 1, "settled");
        require(escrow.refundableBalance(giftId) == (DURATION - 1) * PER_DAY + 4, "missed days plus dust");
        VM.expectRevert(GiftEscrow.AlreadyFinalised.selector);
        escrow.finalise(giftId);

        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(address(escrow)) == 0, "every unit left the escrow");
    }

    // --- accounting invariant ----------------------------------------------------------------------------

    /// @dev A random walk of check-ins and drains over the whole window: whatever happens, every unit of the
    ///      gift ends either with the recipient or with the refund destination, never anywhere else.
    function testFuzzAccountingHolds(uint256 seed, uint8 durationSeed, uint8 amountSeed) public {
        uint32 duration = 7 + uint32(durationSeed % 14);
        uint256 amount = 1_000_000 + uint256(amountSeed) * 333_337;
        GiftEscrow.GiftParams memory p = _params(amount, duration, TARGET);
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        _claim(giftId);
        uint64 metric = 1000;
        _checkIn(giftId, IDENTITY, metric, START);

        for (uint32 day = 1; day <= duration + 3; ++day) {
            uint256 t = _dayStart(day0 + day) + 30 minutes + (seed % 3600);
            VM.warp(t);
            seed = uint256(keccak256(abi.encode(seed, day)));
            if (seed % 4 != 0) {
                metric += uint64(seed % 30);
                GiftEscrow.CheckInAttestation memory a = _checkInAttestation(
                    giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, metric, uint64(t), EVIDENCE_KEY
                );
                try escrow.checkIn(giftId, a) {} catch {}
            }
            if (seed % 3 == 0) {
                try escrow.drain(giftId) {} catch {}
            }
        }
        VM.warp(_dayStart(day0 + duration + 3) + 6 hours);
        escrow.finalise(giftId);
        GiftEscrow.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays + g.drainedDays == duration, "every day settled once");

        uint256 earned = escrow.earnedBalance(giftId);
        if (earned > 0) {
            VM.prank(recipient);
            escrow.withdrawEarned(giftId, recipient, earned);
        }
        uint256 refundable = escrow.refundableBalance(giftId);
        if (refundable > 0) escrow.refundUnearned(giftId);
        require(token.balanceOf(address(escrow)) == 0, "nothing stuck in the escrow");
        require(token.balanceOf(recipient) + token.balanceOf(funder) == 1_000_000_000, "nothing created or lost");
    }

    // --- helpers ----------------------------------------------------------------------------------------

    function _params(uint256 amount, uint32 duration, uint32 target) private returns (GiftEscrow.GiftParams memory) {
        return GiftEscrow.GiftParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: CONTACT,
            goalType: GOAL_DUOLINGO,
            dailyTarget: target,
            durationDays: duration,
            amount: amount,
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _authorization(GiftEscrow.GiftParams memory p, uint256 key)
        private
        returns (GiftEscrow.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(
            abi.encode(
                keccak256("viky.fund.v1"),
                keccak256(
                    abi.encode(
                        p.funder,
                        p.refundTo,
                        p.recipientContactHash,
                        p.goalType,
                        p.dailyTarget,
                        p.durationDays,
                        p.amount,
                        p.salt
                    )
                )
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                p.funder,
                address(escrow),
                p.amount,
                a.validAfter,
                a.validBefore,
                a.nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(key, digest);
    }

    function _create() private returns (uint256) {
        GiftEscrow.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        return escrow.createGift(p, _authorization(p, FUNDER_KEY));
    }

    function _expectCreateRevert(GiftEscrow.GiftParams memory p, bytes4 selector) private {
        GiftEscrow.Authorization memory a = _authorization(p, FUNDER_KEY);
        VM.expectRevert(selector);
        escrow.createGift(p, a);
    }

    function _claimAttestation(uint256 giftId, address who, bytes32 contact, uint256 key)
        private
        returns (GiftEscrow.ClaimAttestation memory c)
    {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        c = GiftEscrow.ClaimAttestation({
            recipient: who, contactHash: contact, issuedAt: issuedAt, expiresAt: issuedAt + 5 minutes, signature: ""
        });
        bytes32 structHash =
            keccak256(abi.encode(escrow.CLAIM_TYPEHASH(), giftId, who, contact, c.issuedAt, c.expiresAt));
        c.signature = _sign(key, structHash);
    }

    function _claim(uint256 giftId) private {
        escrow.claim(giftId, _claimAttestation(giftId, recipient, CONTACT, EVIDENCE_KEY));
    }

    function _checkInAttestation(
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt,
        uint256 key
    ) private returns (GiftEscrow.CheckInAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrow.CheckInAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("nullifier", ++nullifierSeed)),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: ""
        });
        a.signature = _sign(key, _checkInStructHash(giftId, a));
    }

    function _checkInStructHash(uint256 giftId, GiftEscrow.CheckInAttestation memory a) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                escrow.CHECK_IN_TYPEHASH(),
                giftId,
                a.recipient,
                a.identityHash,
                a.providerId,
                a.metricValue,
                a.observedAt,
                a.nullifier,
                a.issuedAt,
                a.expiresAt
            )
        );
    }

    function _checkIn(uint256 giftId, bytes32 identity, uint64 metric, uint256 observedAt) private {
        escrow.checkIn(
            giftId,
            _checkInAttestation(
                giftId, recipient, identity, DUOLINGO_PROVIDER, metric, uint64(observedAt), EVIDENCE_KEY
            )
        );
    }

    function _baselined() private returns (uint256 giftId) {
        giftId = _create();
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
    }

    function _intent(uint256 giftId, address to, uint256 amount, uint256 nonce, uint64 deadline, uint256 key)
        private
        returns (GiftEscrow.WithdrawIntent memory w)
    {
        w = GiftEscrow.WithdrawIntent({to: to, amount: amount, nonce: nonce, deadline: deadline, signature: ""});
        bytes32 structHash = keccak256(abi.encode(escrow.WITHDRAW_TYPEHASH(), giftId, to, amount, nonce, deadline));
        w.signature = _sign(key, structHash);
    }

    function _sign(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256("1"),
                block.chainid,
                address(escrow)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _dayStart(uint32 day) private pure returns (uint256) {
        return uint256(day) * DAY;
    }
}
