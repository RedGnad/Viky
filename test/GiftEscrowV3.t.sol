// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
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

/// @notice The daily contract's own suite, pointed at its third version (the founder, 3 Oct 2026: a day is paid the
///         day it is read). Every test of the second version is here. Those that do not touch the day a reading
///         credits are unchanged. Those that asserted the second version's rule, that a reading judges only days
///         that are over, are rewritten to assert the third's, with their dates a day earlier where the first day
///         of a gift is now the day it is connected, and each says so. The rule's own tests are in
///         `GiftEscrowV3Rule.t.sol`.
contract GiftEscrowV3Test {
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
    GiftEscrowV3 private escrow;
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
        escrow = new GiftEscrowV3(token, evidenceSigner, 1);
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
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.funder == funder && g.refundTo == funder && g.recipient == address(0), "parties");
        require(g.perDay == PER_DAY && g.amount == AMOUNT && g.durationDays == DURATION, "terms");
        require(g.fundedAt == START && g.startDay == 0, "window not open before the baseline");
    }

    function testCreateRefusesAnAuthorizationNotBoundToTheTerms() public {
        GiftEscrowV3.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        GiftEscrowV3.Authorization memory a = _authorization(p, FUNDER_KEY);
        // The relayer changes the amount after the funder signed: the derived nonce no longer matches.
        p.amount = AMOUNT + 1;
        VM.expectRevert(GiftEscrowV3.InvalidAuthorizationNonce.selector);
        escrow.createGift(p, a);
        // A nonce that matches the terms but a signature by someone else fails inside the token.
        GiftEscrowV3.GiftParams memory q = _params(AMOUNT, DURATION, TARGET);
        GiftEscrowV3.Authorization memory forged = _authorization(q, OTHER_KEY);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        escrow.createGift(q, forged);
    }

    function testTwoGiftsWithIdenticalTermsNeedDistinctSalts() public {
        GiftEscrowV3.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        escrow.createGift(p, _authorization(p, FUNDER_KEY));
        // Same terms, same salt: the token refuses the reused authorization.
        GiftEscrowV3.Authorization memory again = _authorization(p, FUNDER_KEY);
        VM.expectRevert(MockAUSD.AuthorizationUsed.selector);
        escrow.createGift(p, again);
        // Same terms, fresh salt: a second gift.
        p.salt = keccak256("another salt");
        require(escrow.createGift(p, _authorization(p, FUNDER_KEY)) == 2, "second gift");
    }

    function testCreateValidatesTheTermsAndTheGoalMenu() public {
        _expectCreateRevert(_params(AMOUNT, 6, TARGET), GiftEscrowV3.InvalidDuration.selector);
        _expectCreateRevert(_params(AMOUNT, 91, TARGET), GiftEscrowV3.InvalidDuration.selector);
        _expectCreateRevert(_params(999_999, DURATION, TARGET), GiftEscrowV3.InvalidAmount.selector);
        _expectCreateRevert(_params(100_000_000_001, DURATION, TARGET), GiftEscrowV3.InvalidAmount.selector);
        _expectCreateRevert(_params(AMOUNT, DURATION, 0), GiftEscrowV3.InvalidDailyTarget.selector);

        // Refusal case 1: a goal outside the certifiable menu is refused at creation.
        GiftEscrowV3.GiftParams memory unknownGoal = _params(AMOUNT, DURATION, TARGET);
        unknownGoal.goalType = 9;
        _expectCreateRevert(unknownGoal, GiftEscrowV3.UnknownGoal.selector);

        // A gift nobody could open: no opening key in the terms.
        GiftEscrowV3.GiftParams memory noKey = _params(AMOUNT, DURATION, TARGET);
        noKey.openingKey = address(0);
        _expectCreateRevert(noKey, GiftEscrowV3.InvalidOpeningKey.selector);

        GiftEscrowV3.GiftParams memory noRefund = _params(AMOUNT, DURATION, TARGET);
        noRefund.refundTo = address(0);
        _expectCreateRevert(noRefund, GiftEscrowV3.InvalidAddress.selector);

        // A refund sent to the contract itself, or to the token, could never leave again.
        GiftEscrowV3.GiftParams memory refundHere = _params(AMOUNT, DURATION, TARGET);
        refundHere.refundTo = address(escrow);
        _expectCreateRevert(refundHere, GiftEscrowV3.InvalidAddress.selector);
        GiftEscrowV3.GiftParams memory refundToToken = _params(AMOUNT, DURATION, TARGET);
        refundToToken.refundTo = address(token);
        _expectCreateRevert(refundToToken, GiftEscrowV3.InvalidAddress.selector);

        escrow.setCreationPaused(true);
        _expectCreateRevert(_params(AMOUNT, DURATION, TARGET), GiftEscrowV3.CreationIsPaused.selector);
    }

    // --- claim ------------------------------------------------------------------------------------------

    /// @dev Rewritten for the second version. The first asserted that the evidence signer's attestation opened a
    ///      gift, which is the defect: one hot key decided who a gift was for. Here the key of the link decides.
    function testClaimBindsTheRecipientWithTheLinkKeyAndRefusesAnyOtherKeyALateOneOrAReplay() public {
        uint256 giftId = _create();
        // A signature by any key that is not the gift's opening key opens nothing.
        GiftEscrowV3.OpenIntent memory wrongKey = _openIntent(giftId, recipient, uint64(START + 5 minutes), WRONG_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        escrow.claim(giftId, wrongKey);

        // The link key signed for one account: the same signature opens it for no other.
        GiftEscrowV3.OpenIntent memory moved = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        moved.recipient = other;
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        escrow.claim(giftId, moved);

        // Nor for another gift: the gift is part of what is signed.
        uint256 second = _create();
        GiftEscrowV3.OpenIntent memory forFirst = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        escrow.claim(second, forFirst);

        GiftEscrowV3.OpenIntent memory expired = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.warp(START + 6 minutes);
        VM.expectRevert(GiftEscrowV3.IntentExpired.selector);
        escrow.claim(giftId, expired);
        VM.warp(START);

        // Anyone may carry it: the relayer does, and it changes nothing of who the gift opens for.
        VM.prank(other);
        escrow.claim(giftId, forFirst);
        require(escrow.getGift(giftId).recipient == recipient, "recipient not bound");
        require(escrow.getGift(giftId).claimedAt == START, "opened now");

        GiftEscrowV3.OpenIntent memory again = _openIntent(giftId, other, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.AlreadyClaimed.selector);
        escrow.claim(giftId, again);
    }

    /// @dev The theft the audit of 1 Oct 2026 proved on the first version (S-01,
    ///      `testN1_EvidenceKeyTakesAnUnclaimedDailyGiftInOneBlock`): whoever held the evidence key signed the
    ///      opening of an unopened gift for an account of their own, then its progress, and took it. It must fail.
    function testTheEvidenceKeyAloneCannotOpenAnUnopenedGift() public {
        uint256 giftId = _create();
        address thief = VM.addr(0x7E1EF);
        // The evidence key signs the opening, as it did on the first version.
        GiftEscrowV3.OpenIntent memory byEvidenceKey =
            _openIntent(giftId, thief, uint64(START + 5 minutes), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        escrow.claim(giftId, byEvidenceKey);
        // And progress it attests for an account the gift was never opened for is refused: nobody opened it.
        GiftEscrowV3.CheckInAttestation memory progress =
            _checkInAttestation(giftId, thief, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        escrow.checkIn(giftId, progress);
        VM.prank(thief);
        VM.expectRevert(GiftEscrowV3.NotRecipient.selector);
        escrow.withdrawEarned(giftId, thief, 1);
        // Every unit is still there, and still the funder's to take back.
        require(token.balanceOf(address(escrow)) == AMOUNT && token.balanceOf(thief) == 0, "nothing moved");
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(funder) == 1_000_000_000, "the funder has it all back");
    }

    function testAFunderCannotOpenTheirOwnGift() public {
        uint256 giftId = _create();
        GiftEscrowV3.OpenIntent memory own = _openIntent(giftId, funder, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.RecipientIsFunder.selector);
        escrow.claim(giftId, own);
        GiftEscrowV3.OpenIntent memory nobody = _openIntent(giftId, address(0), uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidAddress.selector);
        escrow.claim(giftId, nobody);
    }

    function testClaimRefusedOnACancelledGift() public {
        uint256 giftId = _create();
        VM.prank(funder);
        escrow.cancel(giftId);
        GiftEscrowV3.OpenIntent memory o = _openIntent(giftId, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.GiftIsCancelled.selector);
        escrow.claim(giftId, o);
    }

    // --- check-in ---------------------------------------------------------------------------------------

    /// @dev Rewritten for the third version. The second asserted that the window opened the day after the
    ///      baseline and that a reading of the baseline day was refused. Here the day of the baseline is the
    ///      gift's first, and a lesson read later that day pays it.
    function testBaselineBindsIdentityAndOpensTheWindowThatSameDay() public {
        uint256 giftId = _create();
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.identityHash == IDENTITY && g.baselineValue == 1000, "baseline not recorded");
        require(g.startDay == day0 && g.endDay == day0 + DURATION - 1, "window");
        require(g.creditedDays == 0 && g.settledThroughDay == day0 - 1, "nothing credited at baseline");
        require(escrow.earnedBalance(giftId) == 0, "and nothing earned");
        // The same day is open: a lesson taken after the baseline and read an hour later pays it.
        uint256 later = START + 1 hours;
        VM.warp(later);
        _checkIn(giftId, IDENTITY, 1010, later);
        g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the first day is paid the day it is read");
        require(escrow.earnedBalance(giftId) == PER_DAY, "and is the recipient's");
    }

    function testCheckInBeforeClaimIsRefused() public {
        uint256 giftId = _create();
        GiftEscrowV3.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        escrow.checkIn(giftId, a);
    }

    /// @dev A day earlier than on the second version: the first day is the baseline's, and the oldest open day is
    ///      the one a reading pays first.
    function testOneDayIsCreditedAndBecomesTheRecipients() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 1);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "one day credited, the oldest open");
        require(escrow.earnedBalance(giftId) == PER_DAY, "earned balance");
        require(g.baselineValue == 1010, "anchor moved by exactly the credited progress");
    }

    function testBingeCreditsEveryOpenDayAndDiscardsTheExcess() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 1);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1050, t); // 50 XP for two open days: two credited, the rest is not banked
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "two days credited, the day of the reading too");
        require(g.baselineValue == 1050, "excess discarded");
        // Nothing left to credit today.
        GiftEscrowV3.CheckInAttestation memory more =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1100, uint64(t + 1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.NothingToCredit.selector);
        escrow.checkIn(giftId, more);
    }

    /// @dev On the third version what is under one target is kept only while an open day is still unpaid, as here.
    ///      Once every open day is paid it is not (`GiftEscrowV3Rule.t.sol`).
    function testPartialProgressCarriesToTheNextCheckInWhileADayIsStillOpen() public {
        uint256 giftId = _baselined();
        uint256 t1 = _readAt(day0 + 1);
        VM.warp(t1);
        GiftEscrowV3.CheckInAttestation memory short_ =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1006, uint64(t1), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InsufficientProgress.selector);
        escrow.checkIn(giftId, short_);

        uint256 t2 = _readAt(day0 + 2);
        VM.warp(t2);
        _checkIn(giftId, IDENTITY, 1012, t2); // 12 XP since the anchor: one day of three open, 2 XP carried
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
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
        GiftEscrowV3.CheckInAttestation memory strava =
            _checkInAttestation(giftId, recipient, IDENTITY, STRAVA_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.ProviderMismatch.selector);
        escrow.checkIn(giftId, strava);

        // Refusal case 5: another Duolingo account than the one bound.
        GiftEscrowV3.CheckInAttestation memory otherAccount =
            _checkInAttestation(giftId, recipient, OTHER_IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherAccount);

        // Another recipient than the one bound.
        GiftEscrowV3.CheckInAttestation memory otherRecipient =
            _checkInAttestation(giftId, other, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.IdentityMismatch.selector);
        escrow.checkIn(giftId, otherRecipient);

        // Wrong signer.
        GiftEscrowV3.CheckInAttestation memory wrongSigner =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), WRONG_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidEvidenceSigner.selector);
        escrow.checkIn(giftId, wrongSigner);

        // Metric going backwards.
        GiftEscrowV3.CheckInAttestation memory backwards =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 999, uint64(t), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.MetricDecreased.selector);
        escrow.checkIn(giftId, backwards);

        // Observation dated in the future beyond the clock skew.
        GiftEscrowV3.CheckInAttestation memory future = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t + 2 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV3.InvalidAttestationWindow.selector);
        escrow.checkIn(giftId, future);

        // Observation not newer than the last accepted one.
        GiftEscrowV3.CheckInAttestation memory stale =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.StaleObservation.selector);
        escrow.checkIn(giftId, stale);

        // Refusal case 2: a replayed nullifier.
        GiftEscrowV3.CheckInAttestation memory a =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(t), EVIDENCE_KEY);
        escrow.checkIn(giftId, a);
        GiftEscrowV3.CheckInAttestation memory replay =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        replay.nullifier = a.nullifier;
        replay.signature = _sign(EVIDENCE_KEY, _checkInStructHash(giftId, replay));
        VM.expectRevert(GiftEscrowV3.NullifierAlreadyUsed.selector);
        escrow.checkIn(giftId, replay);

        // Stale attestation: issued more than ten minutes ago.
        GiftEscrowV3.CheckInAttestation memory old =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 1), EVIDENCE_KEY);
        VM.warp(t + 11 minutes);
        VM.expectRevert(GiftEscrowV3.AttestationExpired.selector);
        escrow.checkIn(giftId, old);

        escrow.setCheckInPaused(true);
        GiftEscrowV3.CheckInAttestation memory paused = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1020, uint64(t + 11 minutes), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV3.CheckInIsPaused.selector);
        escrow.checkIn(giftId, paused);
    }

    /// @dev Rewritten for the second version. The first asserted that one reading three days after the window
    ///      credited all seven days, which is the defect of 29 Sep: the contract did not hold the catch-up window
    ///      itself, so whoever held the evidence key could credit days long gone. Here the days whose window has
    ///      elapsed go back first, in the same call, and only the days still open are credited.
    function testACheckInAfterTheWindowCreditsOnlyTheDaysStillOpenAndTheRestGoBack() public {
        uint256 giftId = _baselined();
        // The morning after the last day: the last two days can still be covered, the five before them cannot.
        uint256 t = _readAt(day0 + DURATION);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1000 + TARGET * 100, t);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.drainedDays == DURATION - 2 && g.creditedDays == 2, "five went back, two were credited");
        require(g.settledThroughDay == g.endDay, "capped at the last day");
        require(escrow.refundableBalance(giftId) == (DURATION - 2) * PER_DAY, "and the five are the funder's");
    }

    /// @dev The same defect from its other side: a reading that arrives once every window has elapsed credits nothing.
    function testAReadingThreeDaysAfterTheWindowCreditsNothing() public {
        uint256 giftId = _baselined();
        uint256 t = _dayStart(day0 + DURATION + 2) + 1 hours;
        VM.warp(t);
        GiftEscrowV3.CheckInAttestation memory late = _checkInAttestation(
            giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000 + TARGET * 100, uint64(t), EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV3.NothingToCredit.selector);
        escrow.checkIn(giftId, late);
        escrow.finalise(giftId);
        require(escrow.getGift(giftId).drainedDays == DURATION, "every day went back");
    }

    /// @dev A reading is taken, attested and sent within minutes. One kept for later is refused, the first included.
    function testAReadingOlderThanThirtyMinutesIsRefused() public {
        uint256 giftId = _create();
        _claim(giftId);
        VM.warp(START + 30 minutes + 1);
        GiftEscrowV3.CheckInAttestation memory keptBack =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1000, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.StaleObservation.selector);
        escrow.checkIn(giftId, keptBack);
        // Thirty minutes exactly is still a reading of now.
        _checkIn(giftId, IDENTITY, 1000, START + 1);
        require(escrow.getGift(giftId).baselineValue == 1000, "taken");
    }

    function testGiftIdsContinueFromTheConfiguredFirstId() public {
        GiftEscrowV3 next = new GiftEscrowV3(token, evidenceSigner, 2);
        require(next.nextGiftId() == 2, "the sequence continues from the previous deployment");
        VM.expectRevert(GiftEscrowV3.InvalidGiftId.selector);
        new GiftEscrowV3(token, evidenceSigner, 0);
    }

    // --- the reading of a day: a day is paid the day it is read ---------------------------------------

    /// @dev The first reading a pass takes of a day, at 00:30 UTC. It can pay that day itself, and the days before it
    ///      that are still open, the oldest first.
    function _readAt(uint32 day) private pure returns (uint256) {
        return _dayStart(day) + 30 minutes;
    }

    /// @dev The middle of a day, when a lesson taken that morning is read.
    function _noonOf(uint32 day) private pure returns (uint256) {
        return _dayStart(day) + 12 hours;
    }

    /// @dev Rewritten for the third version. The second asserted the opposite, that a reading never credits its own
    ///      day and that the lesson of a day is paid the morning after. That wait is what the third version removes.
    function testAReadingCreditsItsOwnDay() public {
        uint256 giftId = _baselined();
        // The first day, late evening, lesson done after the baseline: it is read, and it is paid.
        uint256 evening = _dayStart(day0) + 23 hours;
        VM.warp(evening);
        _checkIn(giftId, IDENTITY, 1010, evening);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "day one credited that evening");
        // The next morning's reading finds nothing new, and pays nothing more for it.
        uint256 morning = _readAt(day0 + 1);
        VM.warp(morning);
        GiftEscrowV3.CheckInAttestation memory again =
            _checkInAttestation(giftId, recipient, IDENTITY, DUOLINGO_PROVIDER, 1010, uint64(morning), EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InsufficientProgress.selector);
        escrow.checkIn(giftId, again);
        require(escrow.getGift(giftId).creditedDays == 1, "one lesson, one day");
    }

    /// @dev Rewritten for the third version, which pays the last day on the last day, not the morning after it.
    function testTheLastDayIsPaidOnTheLastDay() public {
        uint256 giftId = _baselined();
        // One lesson on each day of the window, the first included, each read at noon that day.
        for (uint32 k = 0; k < DURATION; k++) {
            uint256 t = _noonOf(day0 + k);
            VM.warp(t);
            _checkIn(giftId, IDENTITY, uint64(1000 + TARGET * (k + 1)), t);
            require(escrow.getGift(giftId).settledThroughDay == day0 + k, "each day paid that day");
        }
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION && g.settledThroughDay == g.endDay, "the last day counted on the last day");
        require(uint32(VM.getBlockTimestamp() / DAY) == g.endDay, "and this is still the last day");
    }

    function testAMissedDayInTheWindowGoesBackToTheFunder() public {
        uint256 giftId = _baselined();
        // A lesson read on each day of the window except the last one.
        for (uint32 k = 0; k < DURATION - 1; k++) {
            uint256 t = _noonOf(day0 + k);
            VM.warp(t);
            _checkIn(giftId, IDENTITY, uint64(1000 + TARGET * (k + 1)), t);
        }
        // The morning after the last day: no new lesson, nothing to credit.
        uint256 last = _readAt(day0 + DURATION);
        VM.warp(last);
        GiftEscrowV3.CheckInAttestation memory none = _checkInAttestation(
            giftId,
            recipient,
            IDENTITY,
            DUOLINGO_PROVIDER,
            uint64(1000 + TARGET * (DURATION - 1)),
            uint64(last),
            EVIDENCE_KEY
        );
        VM.expectRevert(GiftEscrowV3.InsufficientProgress.selector);
        escrow.checkIn(giftId, none);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION - 1, "six lessons in the window, six days");
        VM.warp(_dayStart(day0 + DURATION + 1) + 6 hours);
        escrow.finalise(giftId);
        g = escrow.getGift(giftId);
        require(g.creditedDays == DURATION - 1 && g.drainedDays == 1, "the missed last day goes back");
    }

    function testADayIsNeverDrainedBeforeTheMorningReadingThatCouldCoverIt() public {
        uint256 giftId = _baselined();
        // The first day missed; two lessons on the second cover it. Someone calls drain just after midnight.
        VM.warp(_dayStart(day0 + 2) + 1);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(giftId);
        // The morning reading credits both days.
        VM.warp(_readAt(day0 + 2));
        _checkIn(giftId, IDENTITY, 1020, _readAt(day0 + 2));
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "caught up");
        VM.warp(_dayStart(day0 + 2) + 6 hours);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(giftId);
    }

    // --- drain ------------------------------------------------------------------------------------------

    function testDrainWaitsForTheCatchUpWindowThenMovesMissedDaysOnly() public {
        uint256 giftId = _baselined();
        // The first day, day0, can be covered until the end of day0+1, and a reading the morning after still counts
        // for it: nothing to drain a second before that reading's grace ends.
        VM.warp(_dayStart(day0 + 2) + 6 hours - 1);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(giftId);

        VM.warp(_dayStart(day0 + 2) + 6 hours);
        escrow.drain(giftId);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.drainedDays == 1 && g.settledThroughDay == day0, "day one drained");
        require(escrow.refundableBalance(giftId) == PER_DAY, "refundable bucket");

        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(giftId);

        // The recipient covers day0+1 in time (read on day0+2); day0+2 is then missed.
        uint256 t = _dayStart(day0 + 2) + 7 hours;
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);
        require(escrow.getGift(giftId).settledThroughDay == day0 + 1, "the oldest open day is the one paid");
        VM.warp(_dayStart(day0 + 4) + 6 hours);
        escrow.drain(giftId);
        g = escrow.getGift(giftId);
        require(
            g.creditedDays == 1 && g.drainedDays == 2 && g.settledThroughDay == day0 + 2,
            "credited days are never drained"
        );
    }

    function testDrainNeedsABaseline() public {
        uint256 giftId = _create();
        _claim(giftId);
        VM.expectRevert(GiftEscrowV3.NoBaseline.selector);
        escrow.drain(giftId);
    }

    // --- withdraw ---------------------------------------------------------------------------------------

    function testRecipientWithdrawsDirectlyOrThroughASignedIntent() public {
        uint256 giftId = _baselined();
        uint256 t = _readAt(day0 + 1);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1020, t); // two days
        require(escrow.earnedBalance(giftId) == 2 * PER_DAY, "earned");

        VM.expectRevert(GiftEscrowV3.NotRecipient.selector);
        VM.prank(other);
        escrow.withdrawEarned(giftId, other, PER_DAY);

        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY);
        require(token.balanceOf(recipient) == PER_DAY, "direct withdrawal");

        VM.expectRevert(GiftEscrowV3.InsufficientEarned.selector);
        VM.prank(recipient);
        escrow.withdrawEarned(giftId, recipient, PER_DAY + 1);

        // The relayer submits the recipient's signed intent.
        GiftEscrowV3.WithdrawIntent memory w =
            _intent(giftId, recipient, PER_DAY, 0, uint64(t + 1 hours), RECIPIENT_KEY);
        escrow.withdrawEarnedWithIntent(giftId, w);
        require(token.balanceOf(recipient) == 2 * PER_DAY, "intent withdrawal");
        require(escrow.earnedBalance(giftId) == 0, "nothing left");

        VM.expectRevert(GiftEscrowV3.InvalidIntentNonce.selector);
        escrow.withdrawEarnedWithIntent(giftId, w);

        GiftEscrowV3.WithdrawIntent memory forged = _intent(giftId, other, 1, 1, uint64(t + 1 hours), OTHER_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        escrow.withdrawEarnedWithIntent(giftId, forged);

        GiftEscrowV3.WithdrawIntent memory late = _intent(giftId, recipient, 1, 1, uint64(t - 1), RECIPIENT_KEY);
        VM.expectRevert(GiftEscrowV3.IntentExpired.selector);
        escrow.withdrawEarnedWithIntent(giftId, late);
    }

    // --- refund and cancel ------------------------------------------------------------------------------

    function testMissedDaysComeBackToTheFunder() public {
        uint256 giftId = _baselined();
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        escrow.refundUnearned(giftId);

        VM.warp(_dayStart(day0 + 3) + 6 hours);
        escrow.drain(giftId); // days day0 and day0+1 missed
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + 2 * PER_DAY, "two days refunded");
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
    }

    function testUnclaimedGiftIsRefundedInFullAfterFourteenDays() public {
        uint256 giftId = _create();
        VM.warp(START + 14 days - 1);
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        escrow.refundUnearned(giftId);
        VM.warp(START + 14 days);
        uint256 before = token.balanceOf(funder);
        escrow.refundUnearned(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "full refund");
        require(escrow.getGift(giftId).cancelled, "cancelled");
        GiftEscrowV3.OpenIntent memory o = _openIntent(giftId, recipient, uint64(START + 15 days), LINK_KEY);
        VM.expectRevert(GiftEscrowV3.GiftIsCancelled.selector);
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
        VM.expectRevert(GiftEscrowV3.NotFunder.selector);
        VM.prank(other);
        escrow.cancel(giftId);

        uint256 before = token.balanceOf(funder);
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(funder) == before + AMOUNT, "cancel refunds everything");
        VM.expectRevert(GiftEscrowV3.GiftIsCancelled.selector);
        VM.prank(funder);
        escrow.cancel(giftId);

        uint256 claimed = _create();
        _claim(claimed);
        VM.expectRevert(GiftEscrowV3.CancellationClosed.selector);
        VM.prank(funder);
        escrow.cancel(claimed);
    }

    function testRefundGoesToTheCharityWhenTheFunderChoseOne() public {
        GiftEscrowV3.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        p.refundTo = other;
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        VM.prank(funder);
        escrow.cancel(giftId);
        require(token.balanceOf(other) == AMOUNT, "charity received the refund");
    }

    // --- finalise ---------------------------------------------------------------------------------------

    function testFinaliseSettlesTheRemainderAndTheDust() public {
        GiftEscrowV3.GiftParams memory p = _params(7_000_004, DURATION, TARGET); // dust of 4 units
        uint256 giftId = escrow.createGift(p, _authorization(p, FUNDER_KEY));
        _claim(giftId);
        _checkIn(giftId, IDENTITY, 1000, START);
        uint256 t = _readAt(day0 + 1);
        VM.warp(t);
        _checkIn(giftId, IDENTITY, 1010, t);

        // The window ends a day earlier than on the second version, and so does the moment it can be closed.
        VM.warp(_dayStart(day0 + DURATION + 1) + 6 hours - 1);
        VM.expectRevert(GiftEscrowV3.FinalisationTooEarly.selector);
        escrow.finalise(giftId);

        VM.warp(_dayStart(day0 + DURATION + 1) + 6 hours);
        escrow.finalise(giftId);
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
        require(g.finalised && g.creditedDays == 1 && g.drainedDays == DURATION - 1, "settled");
        require(escrow.refundableBalance(giftId) == (DURATION - 1) * PER_DAY + 4, "missed days plus dust");
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
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
        GiftEscrowV3.GiftParams memory p = _params(amount, duration, TARGET);
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
                GiftEscrowV3.CheckInAttestation memory a = _checkInAttestation(
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
        GiftEscrowV3.Gift memory g = escrow.getGift(giftId);
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

    function _params(uint256 amount, uint32 duration, uint32 target) private returns (GiftEscrowV3.GiftParams memory) {
        return GiftEscrowV3.GiftParams({
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

    function _authorization(GiftEscrowV3.GiftParams memory p, uint256 key)
        private
        returns (GiftEscrowV3.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(
            abi.encode(
                keccak256("viky.fund.v3"),
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
        GiftEscrowV3.GiftParams memory p = _params(AMOUNT, DURATION, TARGET);
        return escrow.createGift(p, _authorization(p, FUNDER_KEY));
    }

    function _expectCreateRevert(GiftEscrowV3.GiftParams memory p, bytes4 selector) private {
        GiftEscrowV3.Authorization memory a = _authorization(p, FUNDER_KEY);
        VM.expectRevert(selector);
        escrow.createGift(p, a);
    }

    function _openIntent(uint256 giftId, address who, uint64 deadline, uint256 key)
        private
        returns (GiftEscrowV3.OpenIntent memory o)
    {
        o = GiftEscrowV3.OpenIntent({recipient: who, deadline: deadline, signature: ""});
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
    ) private returns (GiftEscrowV3.CheckInAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrowV3.CheckInAttestation({
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

    function _startStructHash(uint256 giftId, GiftEscrowV3.CheckInAttestation memory a) private view returns (bytes32) {
        return keccak256(abi.encode(escrow.START_TYPEHASH(), giftId, a.identityHash, a.metricValue, a.observedAt));
    }

    function _checkInStructHash(uint256 giftId, GiftEscrowV3.CheckInAttestation memory a)
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
        returns (GiftEscrowV3.WithdrawIntent memory w)
    {
        w = GiftEscrowV3.WithdrawIntent({to: to, amount: amount, nonce: nonce, deadline: deadline, signature: ""});
        bytes32 structHash = keccak256(abi.encode(escrow.WITHDRAW_TYPEHASH(), giftId, to, amount, nonce, deadline));
        w.signature = _sign(key, structHash);
    }

    function _sign(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256("3"),
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
