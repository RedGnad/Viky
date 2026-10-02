// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
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

/// @notice The daily contract's own suite, pointed at its second version (the audit of 1 Oct 2026). Every test of the
///         first version is here. Those that held on both are unchanged but for the opening, which the key of the
///         gift's link now signs. Those that asserted what the second version corrects are rewritten to assert the
///         correction, and say so.
contract GiftEscrowV2Test {
    VmGift private constant VM = VmGift(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant WRONG_KEY = 0xBAD;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    /// @dev The key the gift's link carries: its address is in the terms the funder signs.
    uint256 private constant LINK_KEY = 0x11AB;
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
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant OTHER_IDENTITY = keccak256("identity:someone-else");

    MockAUSD private token;
    GiftEscrowV2 private escrow;
    address private evidenceSigner;
    address private funder;
    address private recipient;
    address private other;
    address private openingKey;
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
        openingKey = VM.addr(LINK_KEY);
        token = new MockAUSD();
        escrow = new GiftEscrowV2(token, evidenceSigner, 1);
        require(escrow.creationPaused() && !escrow.checkInPaused(), "not closed to gifts, or its pause is spent");
        escrow.setCreationPaused(false);
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
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.funder == funder && g.refundTo == funder && g.recipient == address(0), "parties");
        require(g.perDay == PER_DAY && g.amount == AMOUNT && g.durationDays == DURATION, "terms");
        require(g.fundedAt == START && g.startDay == 0, "window not open before the baseline");
    }

    function testCreateRefusesAnAuthorizationNotBoundToTheTerms() public {
        GiftEscrowV2.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        GiftEscrowV2.Authorization memory a = _authorization(p, FUNDER_KEY);
        // The relayer changes the amount after the funder signed: the derived nonce no longer matches.
        p.amount = AMOUNT + 1;
        VM.expectRevert(GiftEscrowV2.InvalidAuthorizationNonce.selector);
        escrow.createGift(p, a);
        // A nonce that matches the terms but a signature by someone else fails inside the token.
        GiftEscrowV2.GiftParams memory q = _params(AMOUNT, DURATION, TARGET);
        GiftEscrowV2.Authorization memory forged = _authorization(q, OTHER_KEY);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        escrow.createGift(q, forged);
    }

    function testTwoGiftsWithIdenticalTermsNeedDistinctSalts() public {
        GiftEscrowV2.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        escrow.createGift(p, _authorization(p, FUNDER_KEY));
        // Same terms, same salt: the token refuses the reused authorization.
        GiftEscrowV2.Authorization memory again = _authorization(p, FUNDER_KEY);
        VM.expectRevert(MockAUSD.AuthorizationUsed.selector);
        escrow.createGift(p, again);
        // Same terms, fresh salt: a second gift.
        p.salt = keccak256("another salt");
        require(escrow.createGift(p, _authorization(p, FUNDER_KEY)) == 2, "second gift");
    }

    function testCreateValidatesTheTermsAndTheGoalMenu() public {
        _expectCreateRevert(_params(AMOUNT, 6, TARGET), GiftEscrowV2.InvalidDuration.selector);
        _expectCreateRevert(_params(AMOUNT, 91, TARGET), GiftEscrowV2.InvalidDuration.selector);
        _expectCreateRevert(_params(999_999, DURATION, TARGET), GiftEscrowV2.InvalidAmount.selector);
        _expectCreateRevert(_params(100_000_000_001, DURATION, TARGET), GiftEscrowV2.InvalidAmount.selector);
        _expectCreateRevert(_params(AMOUNT, DURATION, 0), GiftEscrowV2.InvalidDailyTarget.selector);

        // Refusal case 1: a goal outside the certifiable menu is refused at creation.
        GiftEscrowV2.GiftParams memory unknownGoal = _params(AMOUNT, DURATION, TARGET);
        unknownGoal.goalType = 9;
        _expectCreateRevert(unknownGoal, GiftEscrowV2.UnknownGoal.selector);

        // A gift nobody could open: no opening key in the terms.
        GiftEscrowV2.GiftParams memory noKey = _params(AMOUNT, DURATION, TARGET);
        noKey.openingKey = address(0);
        _expectCreateRevert(noKey, GiftEscrowV2.InvalidOpeningKey.selector);

        GiftEscrowV2.GiftParams memory noRefund = _params(AMOUNT, DURATION, TARGET);
        noRefund.refundTo = address(0);
        _expectCreateRevert(noRefund, GiftEscrowV2.InvalidAddress.selector);

        // A refund sent to the contract itself, or to the token, could never leave again.
        GiftEscrowV2.GiftParams memory refundHere = _params(AMOUNT, DURATION, TARGET);
        refundHere.refundTo = address(escrow);
        _expectCreateRevert(refundHere, GiftEscrowV2.InvalidAddress.selector);
        GiftEscrowV2.GiftParams memory refundToToken = _params(AMOUNT, DURATION, TARGET);
        refundToToken.refundTo = address(token);
        _expectCreateRevert(refundToToken, GiftEscrowV2.InvalidAddress.selector);

        escrow.setCreationPaused(true);
        _expectCreateRevert(_params(AMOUNT, DURATION, TARGET), GiftEscrowV2.CreationIsPaused.selector);
    }

    // --- claim ------------------------------------------------------------------------------------------

    /// @dev Rewritten for the second version. The first asserted that the evidence signer's attestation opened a
    ///      gift, which is the defect: one hot key decided who a gift was for. Here the key of the link decides.
    function testClaimBindsTheRecipientWithTheLinkKeyAndRefusesAnyOtherKeyALateOneOrAReplay() public {
        uint256 giftId = _create();
        // A signature by any key that is not the gift's opening key opens nothing.
        GiftEscrowV2.OpenIntent memory wrongKey = _openIntent(giftId, recipient, uint64(START + 5 minutes), WRONG_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidOpeningSignature.selector);
        escrow.claim(giftId, wrongKey);

        // The link key signed for one account: the same signature opens it for no other.
        GiftEscrowV2.OpenIntent memory moved = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        moved.recipient = other;
        VM.expectRevert(GiftEscrowV2.InvalidOpeningSignature.selector);
        escrow.claim(giftId, moved);

        // Nor for another gift: the gift is part of what is signed.
        uint256 second = _create();
        GiftEscrowV2.OpenIntent memory forFirst = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidOpeningSignature.selector);
        escrow.claim(second, forFirst);

        GiftEscrowV2.OpenIntent memory expired = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.warp(START + 6 minutes);
        VM.expectRevert(GiftEscrowV2.IntentExpired.selector);
        escrow.claim(giftId, expired);
        VM.warp(START);

        // Anyone may carry it: the relayer does, and it changes nothing of who the gift opens for.
        VM.prank(other);
        escrow.claim(giftId, forFirst);
        require(escrow.getGift(giftId).recipient == recipient, "recipient not bound");
        require(escrow.getGift(giftId).claimedAt == START, "opened now");

        GiftEscrowV2.OpenIntent memory again = _openIntent(giftId, other, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.AlreadyClaimed.selector);
        escrow.claim(giftId, again);
    }

    /// @dev The theft the audit of 1 Oct 2026 proved on the first version (S-01,
    ///      `testN1_EvidenceKeyTakesAnUnclaimedDailyGiftInOneBlock`): whoever held the evidence key signed the
    ///      opening of an unopened gift for an account of their own, then its progress, and took it. It must fail.
    function testTheEvidenceKeyAloneCannotOpenAnUnopenedGift() public {
        uint256 giftId = _create();
        address thief = VM.addr(0x7E1EF);
        // The evidence key signs the opening, as it did on the first version.
        GiftEscrowV2.OpenIntent memory byEvidenceKey =
            _openIntent(giftId, thief, uint64(START + 5 minutes), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidOpeningSignature.selector);
        escrow.claim(giftId, byEvidenceKey);
        // And progress it attests for an account the gift was never opened for is refused: nobody opened it.
        GiftEscrowV2.CheckInAttestation memory progress =
            _checkInAttestation(giftId, thief, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.NotClaimed.selector);
        escrow.checkIn(giftId, progress);
        VM.prank(thief);
        VM.expectRevert(GiftEscrowV2.NotRecipient.selector);
        escrow.withdrawEarned(giftId, thief, 1);
        // Every unit is still there, and still the funder's to take back.
        require(token.balanceOf(address(escrow)) == AMOUNT && token.balanceOf(thief) == 0, "nothing moved");
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(funder) == 1_000_000_000, "the funder has it all back");
    }

    function testAFunderCannotOpenTheirOwnGift() public {
        uint256 giftId = _create();
        GiftEscrowV2.OpenIntent memory own = _openIntent(giftId, funder, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.RecipientIsFunder.selector);
        escrow.claim(giftId, own);
        GiftEscrowV2.OpenIntent memory nobody = _openIntent(giftId, address(0), uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidAddress.selector);
        escrow.claim(giftId, nobody);
    }

    function testClaimRefusedOnACancelledGift() public {
        uint256 giftId = _create();
        VM.prank(funder);
        escrow.cancel(giftId);
        GiftEscrowV2.OpenIntent memory o = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.GiftIsCancelled.selector);
        escrow.claim(giftId, o);
    }

    // --- check-in ---------------------------------------------------------------------------------------

    function testBaselineBindsIdentityAndOpensTheWindowTheNextDay() public {
        uint256 giftId = _create();
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.identityHash == IDENTITY && g.baselineValue == 1000, "baseline not recorded");
        require(g.startDay == day0 + 1 && g.endDay == day0 + DURATION, "window");
        require(g.creditedDays == 0 && g.settledThroughDay == day0, "nothing credited at baseline");
        // The same day is not yet open: a second check-in today credits nothing.
        uint256 later = START + 1 hours;
        VM.warp(later);
        GiftEscrowV2.CheckInAttestation memory sameDay =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(later), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.OutsideWindow.selector);
        escrow.checkIn(giftId, sameDay);
    }

    function testCheckInBeforeClaimIsRefused() public {
        uint256 giftId = _create();
        GiftEscrowV2.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.NotClaimed.selector);
        escrow.checkIn(giftId, a);
    }

    function testOneDayIsCreditedAndBecomesTheRecipients() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 2);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0 + 1, "one day credited");
        require(escrow.earnedBalance(giftId) == PER_DAY, "earned balance");
        require(g.baselineValue == 1010, "anchor moved by exactly the credited progress");
    }

    function testBingeCreditsEveryOpenDayAndDiscardsTheExcess() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 3);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1050, t); // 50 XP for two open days: two credited, the rest is not banked
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 2, "two days credited");
        require(g.baselineValue == 1050, "excess discarded");
        // Nothing left to credit today.
        GiftEscrowV2.CheckInAttestation memory more =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1100, uint64(t + 1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.NothingToCredit.selector);
        escrow.checkIn(giftId, more);
    }

    function testPartialProgressCarriesToTheNextCheckIn() public {
        uint256 giftId = _baselined();
        uint256 t1 = _readAt(day0 + 2);
        VM.warp(t1);
        GiftEscrowV2.CheckInAttestation memory short_ =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1006, uint64(t1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.InsufficientProgress.selector);
        escrow.checkIn(giftId, short_);

        uint256 t2 = _readAt(day0 + 3);
        VM.warp(t2);
        _checkIn(giftId, IDENTITY, 1012, t2); // 12 XP since the anchor: one day, 2 XP carried
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
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
        GiftEscrowV2.CheckInAttestation memory strava =
            _checkInAttestation(giftId, recipient, IDENTITY, STRAVA_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.ProviderMismatch.selector);
        escrow.checkIn(giftId, strava);

        // Refusal case 5: another Duolingo account than the one bound.
        GiftEscrowV2.CheckInAttestation memory otherAccount =
            _checkInAttestation(giftId, recipient, OTHER_IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherAccount);

        // Another recipient than the one bound.
        GiftEscrowV2.CheckInAttestation memory otherRecipient =
            _checkInAttestation(giftId, other, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherRecipient);

        // Wrong signer.
        GiftEscrowV2.CheckInAttestation memory wrongSigner =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), WRONG_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidEvidenceSigner.selector);
        escrow.checkIn(giftId, wrongSigner);

        // Metric going backwards.
        GiftEscrowV2.CheckInAttestation memory backwards =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 999, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.MetricDecreased.selector);
        escrow.checkIn(giftId, backwards);

        // Observation dated in the future beyond the clock skew.
        GiftEscrowV2.CheckInAttestation memory future = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t + 2 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV2.InvalidAttestationWindow.selector);
        escrow.checkIn(giftId, future);

        // Observation not newer than the last accepted one.
        GiftEscrowV2.CheckInAttestation memory stale =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.StaleObservation.selector);
        escrow.checkIn(giftId, stale);

        // Refusal case 2: a replayed nullifier.
        GiftEscrowV2.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        escrow.checkIn(giftId, a);
        GiftEscrowV2.CheckInAttestation memory replay =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        replay.nullifier = a.nullifier;
        replay.signature = _sign(EVIDENCE_KEY, _checkInStructHash(giftId, replay));
        VM.expectRevert(GiftEscrowV2.NullifierAlreadyUsed.selector);
        escrow.checkIn(giftId, replay);

        // Stale attestation: issued more than ten minutes ago.
        GiftEscrowV2.CheckInAttestation memory old =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        VM.warp(t + 11 minutes);
        VM.expectRevert(GiftEscrowV2.AttestationExpired.selector);
        escrow.checkIn(giftId, old);

        escrow.setCheckInPaused(true);
        GiftEscrowV2.CheckInAttestation memory paused = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 11 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV2.CheckInIsPaused.selector);
        escrow.checkIn(giftId, paused);
    }

    /// @dev Rewritten for the second version. The first asserted that one reading three days after the window
    ///      credited all seven days, which is the defect of 29 Sep: the contract did not hold the catch-up window
    ///      itself, so whoever held the evidence key could credit days long gone. Here the days whose window has
    ///      elapsed go back first, in the same call, and only the days still open are credited.
    function testACheckInAfterTheWindowCreditsOnlyTheDaysStillOpenAndTheRestGoBack() public {
        uint256 giftId = _baselined();
        // The morning after the last day: the last two days can still be covered, the five before them cannot.
        uint256 t = _readAt(day0 + DURATION + 1);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1000 + TARGET * 100, t);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.drainedDays == DURATION - 2 && g.creditedDays == 2, "five went back, two were credited");
        require(g.settledThroughDay == g.endDay, "capped at the last day");
        require(escrow.refundableBalance(giftId) == (DURATION - 2) * PER_DAY, "and the five are the funder's");
    }

    /// @dev The same defect from its other side: a reading that arrives once every window has elapsed credits nothing.
    function testAReadingThreeDaysAfterTheWindowCreditsNothing() public {
        uint256 giftId = _baselined();
        uint256 t = _dayStart(day0 + DURATION + 3) + 1 hours;
        VM.warp(t);
        GiftEscrowV2.CheckInAttestation memory late = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000 + TARGET * 100, uint64(t), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV2.NothingToCredit.selector);
        escrow.checkIn(giftId, late);
        escrow.finalise(giftId);
        require(escrow.getGift(giftId).drainedDays == DURATION, "every day went back");
    }

    /// @dev A reading is taken, attested and sent within minutes. One kept for later is refused, the first included.
    function testAReadingOlderThanThirtyMinutesIsRefused() public {
        uint256 giftId = _create();
        _claim(giftId);
        VM.warp(START + 30 minutes + 1);
        GiftEscrowV2.CheckInAttestation memory keptBack =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.StaleObservation.selector);
        escrow.checkIn(giftId, keptBack);
        // Thirty minutes exactly is still a reading of now.
        _checkIn(giftId, IDENTITY, 1000, START + 1);
        require(escrow.getGift(giftId).baselineValue == 1000, "taken");
    }

    function testGiftIdsContinueFromTheConfiguredFirstId() public {
        GiftEscrowV2 next = new GiftEscrowV2(token, evidenceSigner, 2);
        require(next.nextGiftId() == 2, "the sequence continues from the previous deployment");
        VM.expectRevert(GiftEscrowV2.InvalidGiftId.selector);
        new GiftEscrowV2(token, evidenceSigner, 0);
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
        GiftEscrowV2.CheckInAttestation memory early =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(evening), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV2.OutsideWindow.selector);
        escrow.checkIn(giftId, early);
        // The next morning's reading credits it.
        VM.warp(_readAt(day0 + 2));
        _checkIn(giftId, IDENTITY, 1010, _readAt(day0 + 2));
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
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
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION && g.settledThroughDay == g.endDay, "the last day counted the next morning");
    }

    function testAMissedDayInTheWindowGoesBackToTheFunder() public {
        uint256 giftId = _baselined();
        // A lesson read on each window day except the last one.
        for (uint32 k = 2; k <= DURATION; k++) {
            uint256 t = _readAt(day0 + k);
            VM.warp(t);
            _checkIn(giftId, IDENTITY, uint64(1000 + TARGET * k), t);
        }
        // The morning after the last day: no new lesson, nothing to credit.
        uint256 last = _readAt(day0 + DURATION + 1);
        VM.warp(last);
        GiftEscrowV2.CheckInAttestation memory none = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, uint64(1000 + TARGET * DURATION), uint64(last), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV2.InsufficientProgress.selector);
        escrow.checkIn(giftId, none);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
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
        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
        escrow.drain(giftId);
        // The morning reading credits both days.
        VM.warp(_readAt(day0 + 3));
        _checkIn(giftId, IDENTITY, 1020, _readAt(day0 + 3));
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 2, "caught up");
        VM.warp(_dayStart(day0 + 3) + 6 hours);
        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
        escrow.drain(giftId);
    }

    // --- drain ------------------------------------------------------------------------------------------

    function testDrainWaitsForTheCatchUpWindowThenMovesMissedDaysOnly() public {
        uint256 giftId = _baselined();
        // Day day0+1 can be covered until the end of day day0+2 and is judged by the next morning's reading:
        // nothing to drain a second before that reading's grace ends.
        VM.warp(_dayStart(day0 + 3) + 6 hours - 1);
        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
        escrow.drain(giftId);

        VM.warp(_dayStart(day0 + 3) + 6 hours);
        escrow.drain(giftId);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.drainedDays == 1 && g.settledThroughDay == day0 + 1, "day one drained");
        require(escrow.refundableBalance(giftId) == PER_DAY, "refundable bucket");

        VM.expectRevert(GiftEscrowV2.NothingToDrain.selector);
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
        VM.expectRevert(GiftEscrowV2.NoBaseline.selector);
        escrow.drain(giftId);
    }

    // --- withdraw ---------------------------------------------------------------------------------------

    function testRecipientWithdrawsDirectlyOrThroughASignedIntent() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 3);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1020, t); // two days
        require(escrow.earnedBalance(giftId) == 2 * PER_DAY, "earned");

        VM.expectRevert(GiftEscrowV2.NotRecipient.selector);
        VM.prank(other);
        escrow.withdrawEarned(giftId, other, PER_DAY);

        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY);
        require(token.balanceOf(recipient) == PER_DAY, "direct withdrawal");

        VM.expectRevert(GiftEscrowV2.InsufficientEarned.selector);
        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY + 1);

        // The relayer submits the recipient's signed intent.
        GiftEscrowV2.WithdrawIntent memory w =
            _intent(giftId, recipient, PER_DAY, 0, uint64(t + 1 hours), RECIPIENT_KEY);
        escrow.withdrawEarnedWithIntent(giftId, w);
        require(token.balanceOf(recipient) == 2 * PER_DAY, "intent withdrawal");
        require(escrow.earnedBalance(giftId) == 0, "nothing left");

        VM.expectRevert(GiftEscrowV2.InvalidIntentNonce.selector);
        escrow.withdrawEarnedWithIntent(giftId, w);

        GiftEscrowV2.WithdrawIntent memory forged = _intent(giftId, other, 1, 1, uint64(t + 1 hours), OTHER_KEY);
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        escrow.withdrawEarnedWithIntent(giftId, forged);

        GiftEscrowV2.WithdrawIntent memory late = _intent(giftId, recipient, 1, 1, uint64(t - 1), RECIPIENT_KEY);
        VM.expectRevert(GiftEscrowV2.IntentExpired.selector);
        escrow.withdrawEarnedWithIntent(giftId, late);
    }

    // --- refund and cancel ------------------------------------------------------------------------------

    function testMissedDaysComeBackToTheFunder() public {
        uint256 giftId = _baselined();
        VM.expectRevert(GiftEscrowV2.NothingToRefund.selector);
        escrow.refundUnearned(giftId);

        VM.warp(_dayStart(day0 + 4) + 6 hours);
        escrow.drain(giftId); // days day0+1 and day0+2 missed
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + 2 * PER_DAY, "two days refunded");
        VM.expectRevert(GiftEscrowV2.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
    }

    function testUnclaimedGiftIsRefundedInFullAfterFourteenDays() public {
        uint256 giftId = _create();
        VM.warp(START + 14 days - 1);
        VM.expectRevert(GiftEscrowV2.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
        VM.warp(START + 14 days);
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "full refund");
        require(escrow.getGift(giftId).cancelled, "cancelled");
        GiftEscrowV2.OpenIntent memory o = _openIntent(giftId, recipient, uint64(START + 15 days), LINK_KEY);
        VM.expectRevert(GiftEscrowV2.GiftIsCancelled.selector);
        escrow.claim(giftId, o);
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
        VM.expectRevert(GiftEscrowV2.NotFunder.selector);
        VM.prank(other);
        escrow.cancel(giftId);

        uint256 before = token.balanceOf(funder);
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "cancel refunds everything");
        VM.expectRevert(GiftEscrowV2.GiftIsCancelled.selector);
        VM.prank(funder);
        escrow.cancel(giftId);

        uint256 claimed = _create();
        _claim(claimed);
        VM.expectRevert(GiftEscrowV2.CancellationClosed.selector);
        VM.prank(funder);
        escrow.cancel(claimed);
    }

    function testRefundGoesToTheCharityWhenTheFunderChoseOne() public {
        GiftEscrowV2.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        p.refundTo = other;
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(other) == AMOUNT, "charity received the refund");
    }

    // --- finalise ---------------------------------------------------------------------------------------

    function testFinaliseSettlesTheRemainderAndTheDust() public {
        GiftEscrowV2.GiftParams memory p = _params(7_000_004, DURATION, TARGET); // dust of 4 units
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        uint256 t = _readAt(day0 + 2);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);

        VM.warp(_dayStart(day0 + DURATION + 2) + 6 hours - 1);
        VM.expectRevert(GiftEscrowV2.FinalisationTooEarly.selector);
        escrow.finalise(giftId);

        VM.warp(_dayStart(day0 + DURATION + 2) + 6 hours);
        escrow.finalise(giftId);
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
        require(g.finalised && g.creditedDays == 1 && g.drainedDays == DURATION - 1, "settled");
        require(escrow.refundableBalance(giftId) == (DURATION - 1) * PER_DAY + 4, "missed days plus dust");
        VM.expectRevert(GiftEscrowV2.AlreadyFinalised.selector);
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
        GiftEscrowV2.GiftParams memory p = _params(amount, duration, TARGET);
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
                GiftEscrowV2.CheckInAttestation memory a = _checkInAttestation(
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
        GiftEscrowV2.Gift memory g = escrow.getGift(giftId);
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

    function _params(uint256 amount, uint32 duration, uint32 target) private returns (GiftEscrowV2.GiftParams memory) {
        return GiftEscrowV2.GiftParams({
            funder: funder,
            refundTo: funder,
            openingKey: openingKey,
            goalType: GOAL_DUOLINGO,
            dailyTarget: target,
            durationDays: duration,
            amount: amount,
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _authorization(GiftEscrowV2.GiftParams memory p, uint256 key)
        private
        returns (GiftEscrowV2.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(
            abi.encode(
                keccak256("viky.fund.v2"),
                keccak256(
                    abi.encode(
                        p.funder, p.refundTo, p.openingKey, p.goalType, p.dailyTarget, p.durationDays, p.amount, p.salt
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
        GiftEscrowV2.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        return escrow.createGift(p, _authorization(p, FUNDER_KEY));
    }

    function _expectCreateRevert(GiftEscrowV2.GiftParams memory p, bytes4 selector) private {
        GiftEscrowV2.Authorization memory a = _authorization(p, FUNDER_KEY);
        VM.expectRevert(selector);
        escrow.createGift(p, a);
    }

    function _openIntent(uint256 giftId, address who, uint64 deadline, uint256 key)
        private
        returns (GiftEscrowV2.OpenIntent memory o)
    {
        o = GiftEscrowV2.OpenIntent({recipient: who, deadline: deadline, signature: ""});
        o.signature = _sign(key, keccak256(abi.encode(escrow.OPEN_TYPEHASH(), giftId, who, deadline)));
    }

    function _claim(uint256 giftId) private {
        escrow.claim(giftId, _openIntent(giftId, recipient, uint64(VM.getBlockTimestamp() + 5 minutes), LINK_KEY));
    }

    function _checkInAttestation(
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt,
        uint256 key
    ) private returns (GiftEscrowV2.CheckInAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrowV2.CheckInAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("nullifier", ++nullifierSeed)),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: "",
            recipientSignature: ""
        });
        a.signature = _sign(key, _checkInStructHash(giftId, a));
        // The account the reading names signs it too: the contract asks for that on a first reading only.
        a.recipientSignature = _sign(who == other ? OTHER_KEY : RECIPIENT_KEY, _startStructHash(giftId, a));
    }

    function _startStructHash(uint256 giftId, GiftEscrowV2.CheckInAttestation memory a) private view returns (bytes32) {
        return keccak256(abi.encode(escrow.START_TYPEHASH(), giftId, a.identityHash, a.metricValue, a.observedAt));
    }

    function _checkInStructHash(uint256 giftId, GiftEscrowV2.CheckInAttestation memory a)
        private
        view
        returns (bytes32)
    {
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
        returns (GiftEscrowV2.WithdrawIntent memory w)
    {
        w = GiftEscrowV2.WithdrawIntent({to: to, amount: amount, nonce: nonce, deadline: deadline, signature: ""});
        bytes32 structHash = keccak256(abi.encode(escrow.WITHDRAW_TYPEHASH(), giftId, to, amount, nonce, deadline));
        w.signature = _sign(key, structHash);
    }

    function _sign(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256("2"),
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
