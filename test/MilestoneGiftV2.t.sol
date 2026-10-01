// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmMilestone {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
}

/// @notice The milestone contract's own suite, pointed at its second version (the audit of 1 Oct 2026). Every test of
///         the first version is here. Those that held on both are unchanged but for the opening, which the key of
///         the gift's link now signs. Those that asserted what the second version corrects are rewritten to assert
///         the correction, and say so.
contract MilestoneGiftV2Test {
    VmMilestone private constant VM = VmMilestone(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant WRONG_KEY = 0xBAD;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    /// @dev The key the gift's link carries: its address is in the terms the funder signs.
    uint256 private constant LINK_KEY = 0x11AB;
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 100_000_000; // 100 AUSD, the shape of "100 if you get that diploma"
    uint64 private constant TARGET = 1500; // a rating to reach, or 1 for a certificate
    uint64 private constant MAX_START = 1300; // the highest starting point the funder will pay a climb from
    uint256 private constant FIRST_ID = 1_000_000;
    uint32 private constant DURATION = 90;
    uint8 private constant GOAL_CHESS = 1;
    bytes32 private constant CHESS_PROVIDER = keccak256("viky:provider:chess-public:v1");
    bytes32 private constant OTHER_PROVIDER = keccak256("viky:provider:certificate:v1");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant OTHER_IDENTITY = keccak256("identity:someone-else");
    bytes32 private constant SUBJECT = keccak256("Ama Diallo|A4W_GyDjEeW5Rwo0txKkgQ");
    uint8 private constant GOAL_CERTIFICATE = 2;
    bytes32 private constant CERTIFICATE_PROVIDER = keccak256("viky:provider:coursera-certificate:v1");

    MockAUSD private token;
    MilestoneGiftV2 private gift;
    address private evidenceSigner;
    address private funder;
    address private recipient;
    address private other;
    address private openingKey;
    uint256 private nullifierSeed;
    uint256 private saltSeed;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        evidenceSigner = VM.addr(EVIDENCE_KEY);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        openingKey = VM.addr(LINK_KEY);
        token = new MockAUSD();
        gift = new MilestoneGiftV2(token, evidenceSigner, FIRST_ID);
        require(gift.creationPaused() && gift.proofPaused(), "not fail-closed");
        gift.setCreationPaused(false);
        gift.setProofPaused(false);
        gift.registerGoal(GOAL_CHESS, CHESS_PROVIDER, gift.SHAPE_CLIMB());
        gift.registerGoal(GOAL_CERTIFICATE, CERTIFICATE_PROVIDER, gift.SHAPE_HAVE_OR_NOT());
        token.mint(funder, 1_000_000_000);
    }

    // --- create and fund --------------------------------------------------------------------------------

    function testCreatePullsTheMoneyWithOneSignatureBoundToTheTerms() public {
        uint256 id = _create();
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        require(g.amount == AMOUNT && g.target == TARGET && g.durationDays == DURATION, "terms");
        require(token.balanceOf(address(gift)) == AMOUNT, "money pulled");
        require(g.earned == 0 && g.refundable == 0, "nothing settled at creation");
    }

    /// @dev The reason the daily contract could not express this at all (DECISIONS.md D36).
    function testAOneDayMilestoneIsAllowed() public {
        MilestoneGiftV2.MilestoneParams memory p = _params(AMOUNT, 1, TARGET);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        require(gift.getGift(id).durationDays == 1, "one day");
    }

    function testCreateValidatesTheTermsAndTheGoalMenu() public {
        _expectCreateRevert(_params(AMOUNT, DURATION, 0), MilestoneGiftV2.InvalidTarget.selector);
        _expectCreateRevert(_params(AMOUNT, 0, TARGET), MilestoneGiftV2.InvalidDuration.selector);
        _expectCreateRevert(_params(AMOUNT, 366, TARGET), MilestoneGiftV2.InvalidDuration.selector);
        _expectCreateRevert(_params(999_999, DURATION, TARGET), MilestoneGiftV2.InvalidAmount.selector);

        MilestoneGiftV2.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        p.goalType = 7;
        _expectCreateRevert(p, MilestoneGiftV2.UnknownGoal.selector);

        // A gift nobody could open: no opening key in the terms.
        MilestoneGiftV2.MilestoneParams memory noKey = _params(AMOUNT, DURATION, TARGET);
        noKey.openingKey = address(0);
        _expectCreateRevert(noKey, MilestoneGiftV2.InvalidOpeningKey.selector);

        // A refund sent to the contract itself, or to the token, could never leave again.
        MilestoneGiftV2.MilestoneParams memory refundHere = _params(AMOUNT, DURATION, TARGET);
        refundHere.refundTo = address(gift);
        _expectCreateRevert(refundHere, MilestoneGiftV2.InvalidAddress.selector);
        MilestoneGiftV2.MilestoneParams memory refundToToken = _params(AMOUNT, DURATION, TARGET);
        refundToToken.refundTo = address(token);
        _expectCreateRevert(refundToToken, MilestoneGiftV2.InvalidAddress.selector);

        gift.setCreationPaused(true);
        _expectCreateRevert(_params(AMOUNT, DURATION, TARGET), MilestoneGiftV2.CreationIsPaused.selector);
    }

    function testAnAuthorizationForAnotherContractCannotFundThisOne() public {
        // The daily contract's tag, on otherwise identical terms.
        MilestoneGiftV2.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        MilestoneGiftV2.Authorization memory a = _authorizationWithTag(p, FUNDER_KEY, keccak256("viky.fund.v2"));
        VM.expectRevert(MilestoneGiftV2.InvalidAuthorizationNonce.selector);
        gift.createGift(p, a);
        // Nor terms signed for the first version of this contract.
        MilestoneGiftV2.Authorization memory first =
            _authorizationWithTag(p, FUNDER_KEY, keccak256("viky.milestone.fund.v1"));
        VM.expectRevert(MilestoneGiftV2.InvalidAuthorizationNonce.selector);
        gift.createGift(p, first);
    }

    // --- claim ------------------------------------------------------------------------------------------

    /// @dev Rewritten for the second version. The first asserted that the evidence signer's attestation opened a
    ///      gift, which is the defect: one hot key decided who a gift was for. Here the key of the link decides.
    function testClaimBindsTheRecipientWithTheLinkKeyAndRefusesAnyOtherKeyALateOneOrAReplay() public {
        uint256 id = _create();
        MilestoneGiftV2.OpenIntent memory wrongKey = _openIntent(id, recipient, uint64(START + 5 minutes), WRONG_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        gift.claim(id, wrongKey);

        // The link key signed for one account: the same signature opens it for no other.
        MilestoneGiftV2.OpenIntent memory moved = _openIntent(id, recipient, uint64(START + 5 minutes), LINK_KEY);
        moved.recipient = other;
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        gift.claim(id, moved);

        // Nor another gift: the gift is part of what is signed.
        uint256 second = _create();
        MilestoneGiftV2.OpenIntent memory forFirst = _openIntent(id, recipient, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        gift.claim(second, forFirst);

        VM.warp(START + 6 minutes);
        VM.expectRevert(MilestoneGiftV2.IntentExpired.selector);
        gift.claim(id, forFirst);
        VM.warp(START);

        // Anyone may carry it: the relayer does, and it changes nothing of who the gift opens for.
        VM.prank(other);
        gift.claim(id, forFirst);
        require(gift.getGift(id).recipient == recipient, "claimed");

        MilestoneGiftV2.OpenIntent memory again = _openIntent(id, other, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(MilestoneGiftV2.AlreadyClaimed.selector);
        gift.claim(id, again);
    }

    /// @dev The theft the audit of 1 Oct 2026 proved on the first version (S-01, `testF1_*`): whoever held the
    ///      evidence key signed the opening of an unopened gift for an account of their own, then the proof that
    ///      reached it, and took the whole amount in one block. It must fail.
    function testTheEvidenceKeyAloneCannotOpenAnUnopenedGift() public {
        MilestoneGiftV2.MilestoneParams memory p = _certificateParams(AMOUNT, DURATION);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        address thief = VM.addr(0x7E1EF);
        // The evidence key signs the opening, as it did on the first version.
        MilestoneGiftV2.OpenIntent memory byEvidenceKey =
            _openIntent(id, thief, uint64(START + 5 minutes), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        gift.claim(id, byEvidenceKey);
        // And the proof it attests for an account the gift was never opened for is refused: nobody opened it.
        MilestoneGiftV2.ProofAttestation memory reached =
            _proofOf(id, thief, SUBJECT, CERTIFICATE_PROVIDER, 1, uint64(START), uint64(START), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.NotClaimed.selector);
        gift.prove(id, reached);
        VM.prank(thief);
        VM.expectRevert(MilestoneGiftV2.NotRecipient.selector);
        gift.withdrawEarned(id, thief, 1);
        // Every unit is still there, and still the funder's to take back.
        require(token.balanceOf(address(gift)) == AMOUNT && token.balanceOf(thief) == 0, "nothing moved");
        VM.prank(funder);
        gift.cancel(id);
        require(token.balanceOf(funder) == 1_000_000_000, "the funder has it all back");
    }

    function testAFunderCannotOpenTheirOwnGift() public {
        uint256 id = _create();
        MilestoneGiftV2.OpenIntent memory own = _openIntent(id, funder, uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(MilestoneGiftV2.RecipientIsFunder.selector);
        gift.claim(id, own);
        MilestoneGiftV2.OpenIntent memory nobody = _openIntent(id, address(0), uint64(START + 5 minutes), LINK_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidAddress.selector);
        gift.claim(id, nobody);
    }

    // --- the rule the contract rests on -----------------------------------------------------------------

    /// @dev The finding that stopped the first deployment. The rule used to refuse a start at or past the
    ///      target, and a refusal reverts, so the contract kept no memory of it. On a rating, which falls when
    ///      you lose, someone at 1520 could lose two games, start at 1499, win one, and take the whole amount
    ///      for a one point climb. The first reading is now the start whatever it says, and the funder signs
    ///      the highest start they will pay from.
    function testARecipientCannotRetryUntilAReadingSuitsThem() public {
        uint256 id = _claimed();
        uint64 at = uint64(VM.getBlockTimestamp());

        // A first reading far above what the funder accepted. It is recorded, not refused.
        gift.prove(id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1520, at, EVIDENCE_KEY));
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        require(g.identityHash == IDENTITY && g.startingValue == 1520, "the first reading is the start");

        // Dipping below the target and climbing back now settles nothing, for ever.
        VM.warp(START + 2 hours);
        MilestoneGiftV2.ProofAttestation memory sandbagged =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1499, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.StartTooHigh.selector);
        gift.prove(id, sandbagged);

        VM.warp(START + 3 hours);
        MilestoneGiftV2.ProofAttestation memory climbed =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET + 100, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.StartTooHigh.selector);
        gift.prove(id, climbed);

        require(gift.getGift(id).earned == 0, "nothing was ever earned");

        // And the money goes back to the funder at the deadline, as an unreached milestone.
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "it all goes back");
    }

    function testAStartingPointAtOrAboveTheTargetIsRefusedInTheTerms() public {
        _expectCreateRevert(_paramsFrom(AMOUNT, DURATION, TARGET, TARGET), MilestoneGiftV2.InvalidMaximumStart.selector);
        _expectCreateRevert(
            _paramsFrom(AMOUNT, DURATION, TARGET, TARGET + 1), MilestoneGiftV2.InvalidMaximumStart.selector
        );
    }

    /// @dev An old reading as a starting point would be pure advantage: the clock runs from now either way.
    function testTheFirstReadingCannotBeAnOldOne() public {
        uint256 id = _claimed();
        VM.warp(START + 1 hours);
        MilestoneGiftV2.ProofAttestation memory old =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.StaleObservation.selector);
        gift.prove(id, old);
    }

    function testTheFirstProofRecordsWhereTheyStoodAndStartsTheClock() public {
        uint256 id = _claimed();
        uint64 at = uint64(VM.getBlockTimestamp());
        gift.prove(id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, at, EVIDENCE_KEY));
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        require(g.identityHash == IDENTITY && g.startingValue == 1200, "start recorded");
        require(g.deadline == uint64(START + uint256(DURATION) * 1 days), "clock started");
        require(g.earned == 0, "nothing earned by starting");
    }

    function testReachingTheTargetGivesTheWholeAmountAtOnce() public {
        uint256 id = _started(1200);
        VM.warp(START + 30 days);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        require(g.settled && g.earned == AMOUNT, "all of it, at once");
        require(gift.earnedBalance(id) == AMOUNT, "theirs to take");
        require(g.refundable == 0, "nothing goes back");
    }

    function testShortOfTheTargetChangesNothing() public {
        uint256 id = _started(1200);
        VM.warp(START + 10 days);
        MilestoneGiftV2.ProofAttestation memory nearly =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET - 1, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.NotThereYet.selector);
        gift.prove(id, nearly);
        require(gift.getGift(id).earned == 0, "nothing earned");
        require(!gift.getGift(id).settled, "still open");
    }

    /// @dev A rating that falls and rises again is still a milestone reached: only the target matters.
    function testProgressMayGoDownOnTheWay() public {
        uint256 id = _started(1200);
        VM.warp(START + 5 days);
        MilestoneGiftV2.ProofAttestation memory dipped =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 900, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.NotThereYet.selector);
        gift.prove(id, dipped);
        VM.warp(START + 20 days);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        require(gift.getGift(id).earned == AMOUNT, "reached");
    }

    function testProofRefusals() public {
        uint256 id = _started(1200);
        uint64 at = uint64(VM.getBlockTimestamp());

        MilestoneGiftV2.ProofAttestation memory wrongProvider =
            _proof(id, recipient, IDENTITY, OTHER_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.ProviderMismatch.selector);
        gift.prove(id, wrongProvider);

        MilestoneGiftV2.ProofAttestation memory otherProfile =
            _proof(id, recipient, OTHER_IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.IdentityMismatch.selector);
        gift.prove(id, otherProfile);

        MilestoneGiftV2.ProofAttestation memory otherPerson =
            _proof(id, other, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.IdentityMismatch.selector);
        gift.prove(id, otherPerson);

        MilestoneGiftV2.ProofAttestation memory wrongSigner =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, WRONG_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidEvidenceSigner.selector);
        gift.prove(id, wrongSigner);

        MilestoneGiftV2.ProofAttestation memory stale =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.StaleObservation.selector);
        gift.prove(id, stale);

        MilestoneGiftV2.ProofAttestation memory future =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 2 minutes, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidAttestationWindow.selector);
        gift.prove(id, future);

        // A reading below the target changes nothing at all, so the same reading may be presented again:
        // the call reverts, and a revert undoes even the spending of its own replay guard.
        MilestoneGiftV2.ProofAttestation memory short_ =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET - 100, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.NotThereYet.selector);
        gift.prove(id, short_);
        VM.expectRevert(MilestoneGiftV2.NotThereYet.selector);
        gift.prove(id, short_);
        require(gift.getGift(id).lastProofAt == at, "a refused reading moves nothing");

        MilestoneGiftV2.ProofAttestation memory whilePaused =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 3, EVIDENCE_KEY);
        gift.setProofPaused(true);
        VM.expectRevert(MilestoneGiftV2.ProofIsPaused.selector);
        gift.prove(id, whilePaused);
    }

    function testAnAcceptedReadingCannotBeUsedTwice() public {
        uint256 id = _claimed();
        uint64 at = uint64(VM.getBlockTimestamp());
        MilestoneGiftV2.ProofAttestation memory start =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, at, EVIDENCE_KEY);
        gift.prove(id, start);

        // The same reading again, re-signed so only the replay guard can refuse it.
        MilestoneGiftV2.ProofAttestation memory again =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        again.nullifier = start.nullifier;
        again.signature = _sign(EVIDENCE_KEY, _proofStructHash(id, again));
        VM.expectRevert(MilestoneGiftV2.NullifierAlreadyUsed.selector);
        gift.prove(id, again);
    }

    function testProofBeforeTheClaimIsRefused() public {
        uint256 id = _create();
        MilestoneGiftV2.ProofAttestation memory early =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.NotClaimed.selector);
        gift.prove(id, early);
    }

    function testNothingIsAcceptedAfterTheDeadlineOrAfterItIsSettled() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 1);
        MilestoneGiftV2.ProofAttestation memory late =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(id, late);

        VM.warp(START);
        uint256 second = _started(1200);
        VM.warp(START + 40 days);
        gift.prove(
            second,
            _proof(second, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        MilestoneGiftV2.ProofAttestation memory afterwards = _proof(
            second, recipient, IDENTITY, CHESS_PROVIDER, TARGET + 1, uint64(VM.getBlockTimestamp() + 1), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.AlreadySettled.selector);
        gift.prove(second, afterwards);
    }

    // --- having it or not: the certificate shape ---------------------------------------------------------

    /// @dev No public page says "not yet obtained": the page appears the day the thing is granted. So there is
    ///      no starting point to record, and what pays is the day the page itself gives.
    function testACertificateEarnedInsideTheGiftPays() public {
        uint256 id = _certificate();
        uint64 granted = uint64(START + 30 days);
        VM.warp(START + 31 days);
        gift.prove(
            id,
            _proofOf(
                id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
            )
        );
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        require(g.settled && g.earned == AMOUNT, "the whole amount, at once");
    }

    function testTheDeadlineOfACertificateIsADateTheFunderSees() public {
        uint256 id = _certificate();
        require(gift.getGift(id).deadline == uint64(START + uint256(DURATION) * 1 days), "fixed when they paid");
    }

    /// @dev A certificate obtained before the gift existed was not earned by it.
    function testACertificateEarnedBeforeTheGiftNeverPays() public {
        uint256 id = _certificate();
        uint64 granted = uint64(START - 1 days);
        VM.warp(START + 10 days);
        MilestoneGiftV2.ProofAttestation memory before = _proofOf(
            id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.EarnedBeforeTheGift.selector);
        gift.prove(id, before);
    }

    function testACertificateEarnedAfterTheDeadlineNeverPays() public {
        uint256 id = _certificate();
        // The day after the deadline's day. A granting day is a day: later on the deadline's own day counts.
        uint64 granted = uint64(START + uint256(DURATION + 1) * 1 days);
        VM.warp(START + uint256(DURATION + 1) * 1 days + 2 hours);
        MilestoneGiftV2.ProofAttestation memory late = _proofOf(
            id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(id, late);
    }

    /// @dev Somebody else's certificate is somebody else's. The funder signed the person and the thing.
    function testAnotherPersonsCertificateNeverPays() public {
        uint256 id = _certificate();
        VM.warp(START + 10 days);
        MilestoneGiftV2.ProofAttestation memory theirs = _proofOf(
            id,
            recipient,
            keccak256("Someone Else|other-course"),
            CERTIFICATE_PROVIDER,
            1,
            uint64(START + 5 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.IdentityMismatch.selector);
        gift.prove(id, theirs);
    }

    /// @dev The reading may be hours old here: what it says is a date in the past either way, and holding the
    ///      first reading to ten minutes is what silently cancelled the grace once already (D46).
    function testACertificateReadingSurvivesHoursOfOurOwnLateness() public {
        uint256 id = _certificate();
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint64 observed = uint64(deadline - 2 minutes);
        VM.warp(deadline + 5 hours);
        gift.prove(
            id,
            _proofOf(id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, uint64(START + 10 days), observed, EVIDENCE_KEY)
        );
        require(gift.getGift(id).earned == AMOUNT, "our lateness is ours");
    }

    function testACertificateNotObtainedComesBackOnceItCanNoLongerBeProved() public {
        uint256 id = _certificate();
        uint256 deadline = START + uint256(DURATION) * 1 days;

        // Not while a certificate granted in time could still be submitted.
        VM.warp(deadline + 6 hours + 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        VM.warp(deadline + 14 days);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        VM.warp(deadline + 14 days + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "it all goes back");
    }

    function testACertificateGiftNobodyOpensComesBackWithoutWaitingForItsDate() public {
        MilestoneGiftV2.MilestoneParams memory p = _certificateParams(AMOUNT, 365);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        VM.warp(START + 14 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "the funder does not wait a year for a link nobody opened");
    }

    function testTheTwoShapesCannotBorrowEachOthersTerms() public {
        MilestoneGiftV2.MilestoneParams memory climbWithSubject = _paramsFrom(AMOUNT, DURATION, TARGET, TARGET - 200);
        climbWithSubject.subject = SUBJECT;
        _expectCreateRevert(climbWithSubject, MilestoneGiftV2.InvalidSubject.selector);

        MilestoneGiftV2.MilestoneParams memory certificateWithCeiling = _certificateParams(AMOUNT, DURATION);
        certificateWithCeiling.maximumStart = 1;
        _expectCreateRevert(certificateWithCeiling, MilestoneGiftV2.InvalidMaximumStart.selector);

        MilestoneGiftV2.MilestoneParams memory certificateWithoutSubject = _certificateParams(AMOUNT, DURATION);
        certificateWithoutSubject.subject = bytes32(0);
        _expectCreateRevert(certificateWithoutSubject, MilestoneGiftV2.InvalidSubject.selector);

        MilestoneGiftV2.MilestoneParams memory nonsense = _certificateParams(AMOUNT, DURATION);
        nonsense.shape = 7;
        _expectCreateRevert(nonsense, MilestoneGiftV2.InvalidShape.selector);
    }

    /// @dev The finding that stopped the third deployment. A granting day was compared against the hour the
    ///      funder happened to pay, so a certificate granted that same morning could never pay, and the last
    ///      day was cut short at that same hour.
    function testACertificateGrantedOnTheFundersOwnDayPays() public {
        uint256 id = _certificate();
        // Midnight of the day the funder paid, which is before the funding instant but the same day.
        uint64 granted = uint64((START / 1 days) * 1 days);
        require(granted < START, "earlier in the day than the funding");
        VM.warp(START + 2 days);
        gift.prove(
            id,
            _proofOf(
                id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
            )
        );
        require(gift.getGift(id).earned == AMOUNT, "granted the day they paid, so it counts");
    }

    function testACertificateGrantedLaterOnTheDeadlineDayPays() public {
        uint256 id = _certificate();
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint64 granted = uint64(((deadline / 1 days) * 1 days) + 23 hours);
        require(granted > deadline, "later in the day than the deadline instant");
        VM.warp(deadline + 1 days);
        gift.prove(
            id,
            _proofOf(
                id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
            )
        );
        require(gift.getGift(id).earned == AMOUNT, "the deadline day belongs to them");
    }

    /// @dev A granting day is historical: it says the same thing for ever, so being slow to open the app must
    ///      not cost the whole gift. Six hours was the climb's rule, borrowed where it did not belong.
    function testACertificateGrantedInTimeSurvivesDaysOfSilence() public {
        uint256 id = _certificate();
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline + 10 days);
        gift.prove(
            id,
            _proofOf(
                id,
                recipient,
                SUBJECT,
                CERTIFICATE_PROVIDER,
                1,
                uint64(START + 10 days),
                uint64(VM.getBlockTimestamp()),
                EVIDENCE_KEY
            )
        );
        require(gift.getGift(id).earned == AMOUNT, "they did it in time, so they are paid");
    }

    function testAGrantingDayInTheFutureNeverPays() public {
        uint256 id = _certificate();
        VM.warp(START + 10 days);
        MilestoneGiftV2.ProofAttestation memory ahead = _proofOf(
            id,
            recipient,
            SUBJECT,
            CERTIFICATE_PROVIDER,
            1,
            uint64(VM.getBlockTimestamp() + 1 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.InvalidAttestationWindow.selector);
        gift.prove(id, ahead);
    }

    /// @dev A rating proved as "having it or not" would settle the whole amount on one reading, with no start
    ///      recorded and no climb at all. The shape belongs to the goal, not to whoever fills in the terms.
    function testAGoalIsProvedInItsOwnShapeOrNotAtAll() public {
        MilestoneGiftV2.MilestoneParams memory ratingAsCertificate =
            _shaped(AMOUNT, DURATION, TARGET, 0, gift.SHAPE_HAVE_OR_NOT(), SUBJECT);
        ratingAsCertificate.goalType = GOAL_CHESS;
        _expectCreateRevert(ratingAsCertificate, MilestoneGiftV2.InvalidShape.selector);

        MilestoneGiftV2.MilestoneParams memory certificateAsClimb =
            _shaped(AMOUNT, DURATION, TARGET, TARGET - 200, gift.SHAPE_CLIMB(), bytes32(0));
        certificateAsClimb.goalType = GOAL_CERTIFICATE;
        _expectCreateRevert(certificateAsClimb, MilestoneGiftV2.InvalidShape.selector);
    }

    function testAClimbCarriesNoGrantingDay() public {
        uint256 id = _claimed();
        MilestoneGiftV2.ProofAttestation memory dated = _proofOf(
            id,
            recipient,
            IDENTITY,
            CHESS_PROVIDER,
            1200,
            uint64(START - 1 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGiftV2.InvalidShape.selector);
        gift.prove(id, dated);
    }

    /// @dev While proofs are paused nothing can be saved, so nothing may be taken back: the pause would
    ///      otherwise pay the funder for a milestone the recipient simply could not submit.
    // --- a pause across a deadline (the fourth review, 17 Sep 2026) ---------------------------------------

    /// @dev The defect the fourth review found in the pause fix of D49. `expire` refused during a pause, but once it
    ///      ended `prove` still refused past deadline + grace and `expire` opened at that same instant. A target
    ///      reached an hour before the deadline, during a pause from two hours before to seven after, was lost.
    function testAPauseAcrossTheDeadlineGivesTheWholeGraceBackAfterItEnds() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline - 2 hours);
        gift.setProofPaused(true);
        VM.warp(deadline + 7 hours);
        gift.setProofPaused(false);

        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(deadline - 1 hours), EVIDENCE_KEY)
        );
        require(gift.getGift(id).earned == AMOUNT, "reached in time, and a pause of ours took nothing");
    }

    function testAfterAPauseAcrossTheDeadlineTheGraceIsWholeAndNoLonger() public {
        uint256 kept = _started(1200);
        uint256 lost = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline - 2 hours);
        gift.setProofPaused(true);
        VM.warp(deadline + 7 hours);
        gift.setProofPaused(false);
        uint256 resumed = deadline + 7 hours;

        VM.warp(resumed + 6 hours);
        gift.prove(
            kept, _proof(kept, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(deadline - 1 hours), EVIDENCE_KEY)
        );
        require(gift.getGift(kept).earned == AMOUNT, "the last instant of the grace after the pause still pays");
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(lost);

        VM.warp(resumed + 6 hours + 1);
        MilestoneGiftV2.ProofAttestation memory late =
            _proof(lost, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(deadline - 1 hours), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(lost, late);
        gift.expire(lost);
        require(gift.refundableBalance(lost) == AMOUNT, "and then it goes back, as without a pause");
    }

    function testAPauseEntirelyBeforeTheDeadlineChangesNothing() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline - 5 hours);
        gift.setProofPaused(true);
        VM.warp(deadline - 3 hours);
        gift.setProofPaused(false);

        VM.warp(deadline + 6 hours + 1);
        MilestoneGiftV2.ProofAttestation memory late =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(deadline - 1 hours), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        gift.prove(id, late);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "the grace ends where it always did");
    }

    function testAPauseAcrossTheLateWindowOfACertificateGivesItBack() public {
        uint256 id = _certificate();
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline + 13 days);
        gift.setProofPaused(true);
        VM.warp(deadline + 15 days);
        gift.setProofPaused(false);

        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.prove(
            id,
            _proofOf(
                id,
                recipient,
                SUBJECT,
                CERTIFICATE_PROVIDER,
                1,
                uint64(START + 10 days),
                uint64(VM.getBlockTimestamp()),
                EVIDENCE_KEY
            )
        );
        require(gift.getGift(id).earned == AMOUNT, "a certificate granted in time survives a pause over its window");
    }

    function testAPauseAcrossTheWaitForAFirstReadingGivesItBack() public {
        uint256 id = _claimed();
        // A second gift opened the same day, never started: made before the pause, since nothing opens during one.
        uint256 neverStarted = _claimed();
        VM.warp(START + 13 days);
        gift.setProofPaused(true);
        VM.warp(START + 15 days);
        gift.setProofPaused(false);

        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        require(gift.getGift(id).identityHash == IDENTITY, "the start a pause blocked can still be taken");

        VM.warp(START + 15 days + 6 hours - 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(neverStarted);
        VM.warp(START + 15 days + 6 hours);
        gift.expire(neverStarted);
        require(
            gift.refundableBalance(neverStarted) == AMOUNT,
            "and a gift never started still goes back, the grace after the pause"
        );
    }

    /// @dev Rewritten for the second version, which keeps the end of the pause rather than a flag and a moment.
    function testOnlyTheEndOfARunningPauseMovesTheClock() public {
        uint64 opened = gift.proofPausedUntil();
        require(opened == uint64(START) && !gift.proofPaused(), "open since the deployment was checked");
        VM.warp(START + 1 days);
        gift.setProofPaused(false);
        require(gift.proofPausedUntil() == opened, "opening what is already open is not the end of a pause");
        gift.setProofPaused(true);
        require(gift.proofPausedUntil() == uint64(START + 8 days) && gift.proofPaused(), "a pause runs seven days");
        VM.warp(START + 2 days);
        gift.setProofPaused(false);
        require(gift.proofPausedUntil() == uint64(START + 2 days) && !gift.proofPaused(), "its end is recorded");
    }

    /// @dev For any pause and any moment it ends: a reading taken before the deadline, submitted within the grace
    ///      after the later of the deadline and the pause's end, pays; and the gift cannot be taken back before then.
    function testFuzzAReadingTakenInTimeIsNeverLostToAPause(
        uint32 pauseStartSeed,
        uint32 pauseLengthSeed,
        uint32 submitSeed
    ) public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint256 pauseStart = deadline - 1 days + (uint256(pauseStartSeed) % (1 days + 6 hours));
        uint256 pauseEnd = pauseStart + 1 minutes + (uint256(pauseLengthSeed) % 3 days);
        VM.warp(pauseStart);
        gift.setProofPaused(true);
        VM.warp(pauseEnd);
        gift.setProofPaused(false);

        uint256 from = pauseEnd > deadline ? pauseEnd : deadline;
        // Submitted once proofs are open and the reading has been taken, at any moment up to the end of the grace.
        uint256 observed = deadline - 1 minutes;
        uint256 earliest = pauseEnd > observed ? pauseEnd : observed;
        uint256 submitAt = earliest + (uint256(submitSeed) % (from + 6 hours - earliest + 1));
        VM.warp(submitAt);
        if (submitAt <= from + 6 hours) {
            VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
            gift.expire(id);
        }
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(deadline - 1 minutes), EVIDENCE_KEY)
        );
        require(gift.getGift(id).earned == AMOUNT, "a reading taken in time pays");
    }

    /// @dev Rewritten for the second version. The first refused `expire` with a switch while proofs were paused, and
    ///      that switch is what froze every gift under way once the owner was gone. Here nothing is refused by a
    ///      switch: the windows are counted from the end of the pause, which is still ahead while it runs.
    function testAPauseNeverHandsTheGiftBack() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 7 hours);
        gift.setProofPaused(true);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        gift.setProofPaused(false);
        // Proofs reopened at deadline + 7 hours, so a reading taken in time has its whole grace from then (the fourth
        // review): the gift settles once that grace has passed, and not the moment proofs reopen.
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);
        VM.warp(START + uint256(DURATION) * 1 days + 13 hours + 1);
        gift.expire(id);
        require(
            gift.refundableBalance(id) == AMOUNT, "and once proofs are open again and the grace has run, it settles"
        );
    }

    // --- the deadline -----------------------------------------------------------------------------------

    function testTheWholeAmountGoesBackWhenTheDeadlinePasses() public {
        uint256 id = _started(1200);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "all of it comes back");

        uint256 before = token.balanceOf(funder);
        gift.refundUnearned(id);
        require(token.balanceOf(funder) == before + AMOUNT, "and it arrives");
        VM.expectRevert(MilestoneGiftV2.NothingToRefund.selector);
        gift.refundUnearned(id);
    }

    function testAGiftNobodyEverStartsComesBackAfterFourteenDays() public {
        uint256 id = _claimed();
        VM.warp(START + 14 days - 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        VM.warp(START + 14 days + 6 hours);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "all of it comes back");
    }

    function testAReachedMilestoneCannotBeExpired() public {
        uint256 id = _started(1200);
        VM.warp(START + 10 days);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        VM.warp(START + 400 days);
        VM.expectRevert(MilestoneGiftV2.AlreadySettled.selector);
        gift.expire(id);
    }

    function testExpiringTwiceIsRefused() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        VM.expectRevert(MilestoneGiftV2.AlreadySettled.selector);
        gift.expire(id);
    }

    /// @dev The deadline judges the reading, not the transaction. The first version of this test allowed one
    ///      minute of lateness, which the ten minute staleness bound already permitted, so it could not see
    ///      that the six hour grace did nothing. Five hours is a delay only the grace can survive.
    function testAReadingTakenInTimeSurvivesHoursOfOurOwnLateness() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint64 observed = uint64(deadline - 2 minutes);

        // Our relayer is down for five hours across the deadline. The attestation is re-issued when it comes
        // back, for the same reading, which is what the evidence signer does.
        VM.warp(deadline + 5 hours);
        MilestoneGiftV2.ProofAttestation memory inTime =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, observed, EVIDENCE_KEY);
        gift.prove(id, inTime);
        require(gift.getGift(id).earned == AMOUNT, "our lateness is ours, never theirs to pay for");
    }

    /// @dev And the bound that does belong to a first reading is still there.
    function testTheGraceDoesNotLetAnOldReadingStartAGift() public {
        uint256 id = _claimed();
        VM.warp(START + 5 hours);
        MilestoneGiftV2.ProofAttestation memory old =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.StaleObservation.selector);
        gift.prove(id, old);
    }

    function testProveAndExpireAreNeverBothShut() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint64 observed = uint64(deadline - 1 minutes);

        // The moment expire opens, a reading taken in time can no longer arrive, and not one second before.
        VM.warp(deadline + 6 hours);
        MilestoneGiftV2.ProofAttestation memory lastMoment =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, observed, EVIDENCE_KEY);
        gift.prove(id, lastMoment);
        require(gift.getGift(id).earned == AMOUNT, "the last instant of the grace still pays");
    }

    function testTheKeeperCannotExpireWhileSuchAReadingCouldStillArrive() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline + 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        VM.warp(deadline + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "and then it goes back");
    }

    /// @dev Opening the link on the last day must not leave someone with no time to take a first reading.
    function testTheWaitForAFirstReadingRunsFromTheDayItWasOpened() public {
        uint256 id = _create();
        VM.warp(START + 13 days);
        gift.claim(id, _open(id, recipient));

        VM.warp(START + 14 days + 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        VM.warp(START + 13 days + 14 days + 6 hours);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "returned only after the full wait from opening");
    }

    function testAGiftThatIsOverCannotBeOpened() public {
        uint256 id = _create();
        VM.warp(START + 14 days + 6 hours);
        gift.expire(id);
        MilestoneGiftV2.OpenIntent memory late = _open(id, recipient);
        VM.expectRevert(MilestoneGiftV2.AlreadySettled.selector);
        gift.claim(id, late);
    }

    function testAGiftReturnedAtItsDeadlineCannotBeClosedAgain() public {
        uint256 id = _create();
        VM.warp(START + 14 days + 6 hours + 1);
        gift.expire(id);
        VM.expectRevert(MilestoneGiftV2.AlreadySettled.selector);
        VM.prank(funder);
        gift.cancel(id);
    }

    function testTheKeeperCannotBeatAFirstReadingEither() public {
        uint256 id = _claimed();
        VM.warp(START + 14 days + 1);
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        gift.expire(id);

        // Still time to start it, right up to the grace.
        VM.warp(START + 14 days + 5 hours);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        require(gift.getGift(id).identityHash == IDENTITY, "a first reading still lands inside the grace");
    }

    function testMilestoneIdsCannotCollideWithTheDailyContract() public {
        VM.expectRevert(MilestoneGiftV2.InvalidGiftId.selector);
        new MilestoneGiftV2(token, evidenceSigner, FIRST_ID - 1);
        require(gift.nextGiftId() >= FIRST_ID, "numbered well clear of the other contract");
    }

    // --- taking it and giving it back -------------------------------------------------------------------

    function testTheRecipientTakesItDirectlyOrThroughASignedIntent() public {
        uint256 id = _reached();
        VM.expectRevert(MilestoneGiftV2.NotRecipient.selector);
        VM.prank(other);
        gift.withdrawEarned(id, other, 1);

        VM.prank(recipient);
        gift.withdrawEarned(id, recipient, AMOUNT / 2);
        require(token.balanceOf(recipient) == AMOUNT / 2, "half taken");

        MilestoneGiftV2.WithdrawIntent memory intent = _intent(id, recipient, AMOUNT / 2, 0, RECIPIENT_KEY);
        gift.withdrawEarnedWithIntent(id, intent);
        require(token.balanceOf(recipient) == AMOUNT, "the rest taken by the relayer");

        VM.expectRevert(MilestoneGiftV2.InsufficientEarned.selector);
        VM.prank(recipient);
        gift.withdrawEarned(id, recipient, 1);
    }

    function testAnIntentSignedByAnotherAccountIsRefused() public {
        uint256 id = _reached();
        MilestoneGiftV2.WithdrawIntent memory intent = _intent(id, other, AMOUNT, 0, OTHER_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidRecipientSignature.selector);
        gift.withdrawEarnedWithIntent(id, intent);
    }

    function testTheFunderTakesItBackOnlyBeforeItIsOpened() public {
        uint256 id = _create();
        uint256 before = token.balanceOf(funder);
        VM.expectRevert(MilestoneGiftV2.NotFunder.selector);
        VM.prank(other);
        gift.cancel(id);

        VM.prank(funder);
        gift.cancel(id);
        require(token.balanceOf(funder) == before + AMOUNT, "everything back");

        uint256 second = _claimed();
        VM.expectRevert(MilestoneGiftV2.AlreadyClaimed.selector);
        VM.prank(funder);
        gift.cancel(second);
    }

    // --- the accounting ---------------------------------------------------------------------------------

    /// @dev Whatever happens, every unit ends with the recipient or with the funder, and none stays here.
    function testFuzzEveryUnitEndsWithSomebody(uint256 seed, uint8 amountSeed, uint8 durationSeed) public {
        uint256 amount = 1_000_000 + (uint256(amountSeed) * 333_337);
        uint32 duration = 1 + uint32(durationSeed % 365);
        MilestoneGiftV2.MilestoneParams memory p = _params(amount, duration, TARGET);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        gift.claim(id, _open(id, recipient));
        gift.prove(id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY));

        if (seed % 2 == 0) {
            VM.warp(START + (uint256(duration) * 1 days) / 2 + 1);
            gift.prove(
                id,
                _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
            );
        } else if (seed % 3 == 0) {
            // A pause across the deadline, of any length: the gift still settles once, after the whole grace.
            uint256 deadline = START + uint256(duration) * 1 days;
            VM.warp(deadline - 1 hours);
            gift.setProofPaused(true);
            uint256 resumed = deadline + (seed % 3 days);
            VM.warp(resumed);
            gift.setProofPaused(false);
            VM.warp((resumed > deadline ? resumed : deadline) + 6 hours + 1);
            gift.expire(id);
        } else {
            VM.warp(START + uint256(duration) * 1 days + 6 hours + 1);
            gift.expire(id);
        }

        uint256 earned = gift.earnedBalance(id);
        if (earned > 0) {
            VM.prank(recipient);
            gift.withdrawEarned(id, recipient, earned);
        }
        if (gift.refundableBalance(id) > 0) gift.refundUnearned(id);

        require(token.balanceOf(address(gift)) == 0, "nothing stuck");
        require(token.balanceOf(recipient) + token.balanceOf(funder) == 1_000_000_000, "nothing created or lost");
    }

    // --- helpers ----------------------------------------------------------------------------------------

    function _params(uint256 amount, uint32 duration, uint64 target)
        private
        returns (MilestoneGiftV2.MilestoneParams memory)
    {
        return _paramsFrom(amount, duration, target, target == 0 ? 0 : target - 200);
    }

    function _paramsFrom(uint256 amount, uint32 duration, uint64 target, uint64 maximumStart)
        private
        returns (MilestoneGiftV2.MilestoneParams memory p)
    {
        p = _shaped(amount, duration, target, maximumStart, gift.SHAPE_CLIMB(), bytes32(0));
        p.goalType = GOAL_CHESS;
    }

    function _certificateParams(uint256 amount, uint32 duration)
        private
        returns (MilestoneGiftV2.MilestoneParams memory p)
    {
        p = _shaped(amount, duration, 1, 0, gift.SHAPE_HAVE_OR_NOT(), SUBJECT);
        p.goalType = GOAL_CERTIFICATE;
    }

    function _shaped(uint256 amount, uint32 duration, uint64 target, uint64 maximumStart, uint8 shape, bytes32 subject)
        private
        returns (MilestoneGiftV2.MilestoneParams memory)
    {
        return MilestoneGiftV2.MilestoneParams({
            funder: funder,
            refundTo: funder,
            openingKey: openingKey,
            goalType: GOAL_CHESS,
            shape: shape,
            target: target,
            maximumStart: maximumStart,
            subject: subject,
            durationDays: duration,
            amount: amount,
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _authorization(MilestoneGiftV2.MilestoneParams memory p, uint256 key)
        private
        returns (MilestoneGiftV2.Authorization memory)
    {
        return _authorizationWithTag(p, key, keccak256("viky.milestone.fund.v2"));
    }

    function _authorizationWithTag(MilestoneGiftV2.MilestoneParams memory p, uint256 key, bytes32 tag)
        private
        returns (MilestoneGiftV2.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(
            abi.encode(
                tag,
                keccak256(
                    abi.encode(
                        p.funder,
                        p.refundTo,
                        p.openingKey,
                        p.goalType,
                        p.shape,
                        p.target,
                        p.maximumStart,
                        p.subject,
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
                address(gift),
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
        MilestoneGiftV2.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        return gift.createGift(p, _authorization(p, FUNDER_KEY));
    }

    function _claimed() private returns (uint256 id) {
        id = _create();
        gift.claim(id, _open(id, recipient));
    }

    function _started(uint64 from) private returns (uint256 id) {
        id = _claimed();
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, from, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
    }

    function _certificate() private returns (uint256 id) {
        MilestoneGiftV2.MilestoneParams memory p = _certificateParams(AMOUNT, DURATION);
        id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        gift.claim(id, _open(id, recipient));
    }

    function _reached() private returns (uint256 id) {
        id = _started(1200);
        VM.warp(START + 10 days);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
    }

    function _expectCreateRevert(MilestoneGiftV2.MilestoneParams memory p, bytes4 selector) private {
        MilestoneGiftV2.Authorization memory a = _authorization(p, FUNDER_KEY);
        VM.expectRevert(selector);
        gift.createGift(p, a);
    }

    function _openIntent(uint256 giftId, address who, uint64 deadline, uint256 key)
        private
        returns (MilestoneGiftV2.OpenIntent memory o)
    {
        o = MilestoneGiftV2.OpenIntent({recipient: who, deadline: deadline, signature: ""});
        o.signature = _sign(key, keccak256(abi.encode(gift.OPEN_TYPEHASH(), giftId, who, deadline)));
    }

    /// @dev The opening the link's own key signs, good for five minutes from now.
    function _open(uint256 giftId, address who) private returns (MilestoneGiftV2.OpenIntent memory) {
        return _openIntent(giftId, who, uint64(VM.getBlockTimestamp() + 5 minutes), LINK_KEY);
    }

    function _proof(
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt,
        uint256 key
    ) private returns (MilestoneGiftV2.ProofAttestation memory) {
        return _proofOf(giftId, who, identity, provider, metric, 0, observedAt, key);
    }

    function _proofOf(
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 eventAt,
        uint64 observedAt,
        uint256 key
    ) private returns (MilestoneGiftV2.ProofAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = MilestoneGiftV2.ProofAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            eventAt: eventAt,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("nullifier", ++nullifierSeed)),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: ""
        });
        a.signature = _sign(key, _proofStructHash(giftId, a));
    }

    function _proofStructHash(uint256 giftId, MilestoneGiftV2.ProofAttestation memory a)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                gift.PROOF_TYPEHASH(),
                giftId,
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
        );
    }

    function _intent(uint256 giftId, address to, uint256 amount, uint256 nonce, uint256 key)
        private
        returns (MilestoneGiftV2.WithdrawIntent memory i)
    {
        i = MilestoneGiftV2.WithdrawIntent({
            to: to, amount: amount, nonce: nonce, deadline: uint64(VM.getBlockTimestamp() + 10 minutes), signature: ""
        });
        bytes32 structHash =
            keccak256(abi.encode(gift.WITHDRAW_TYPEHASH(), giftId, i.to, i.amount, i.nonce, i.deadline));
        i.signature = _sign(key, structHash);
    }

    function _sign(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Milestone"),
                keccak256("2"),
                block.chainid,
                address(gift)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
