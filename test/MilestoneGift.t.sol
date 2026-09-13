// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MilestoneGift} from "../contracts/MilestoneGift.sol";
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

contract MilestoneGiftTest {
    VmMilestone private constant VM = VmMilestone(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant WRONG_KEY = 0xBAD;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 100_000_000; // 100 AUSD, the shape of "100 if you get that diploma"
    uint64 private constant TARGET = 1500; // a rating to reach, or 1 for a certificate
    uint64 private constant MAX_START = 1300; // the highest starting point the funder will pay a climb from
    uint256 private constant FIRST_ID = 1_000_000;
    uint32 private constant DURATION = 90;
    uint8 private constant GOAL_CHESS = 1;
    bytes32 private constant CHESS_PROVIDER = keccak256("viky:provider:chess-public:v1");
    bytes32 private constant OTHER_PROVIDER = keccak256("viky:provider:certificate:v1");
    bytes32 private constant CONTACT = keccak256("viky:contact:v1:email:ama@example.com");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant OTHER_IDENTITY = keccak256("identity:someone-else");
    bytes32 private constant SUBJECT = keccak256("Ama Diallo|A4W_GyDjEeW5Rwo0txKkgQ");
    uint8 private constant GOAL_CERTIFICATE = 2;
    bytes32 private constant CERTIFICATE_PROVIDER = keccak256("viky:provider:coursera-certificate:v1");

    MockAUSD private token;
    MilestoneGift private gift;
    address private evidenceSigner;
    address private funder;
    address private recipient;
    address private other;
    uint256 private nullifierSeed;
    uint256 private saltSeed;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        evidenceSigner = VM.addr(EVIDENCE_KEY);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        gift = new MilestoneGift(token, evidenceSigner, FIRST_ID);
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
        MilestoneGift.Gift memory g = gift.getGift(id);
        require(g.amount == AMOUNT && g.target == TARGET && g.durationDays == DURATION, "terms");
        require(token.balanceOf(address(gift)) == AMOUNT, "money pulled");
        require(g.earned == 0 && g.refundable == 0, "nothing settled at creation");
    }

    /// @dev The reason the daily contract could not express this at all (DECISIONS.md D36).
    function testAOneDayMilestoneIsAllowed() public {
        MilestoneGift.MilestoneParams memory p = _params(AMOUNT, 1, TARGET);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        require(gift.getGift(id).durationDays == 1, "one day");
    }

    function testCreateValidatesTheTermsAndTheGoalMenu() public {
        _expectCreateRevert(_params(AMOUNT, DURATION, 0), MilestoneGift.InvalidTarget.selector);
        _expectCreateRevert(_params(AMOUNT, 0, TARGET), MilestoneGift.InvalidDuration.selector);
        _expectCreateRevert(_params(AMOUNT, 366, TARGET), MilestoneGift.InvalidDuration.selector);
        _expectCreateRevert(_params(999_999, DURATION, TARGET), MilestoneGift.InvalidAmount.selector);

        MilestoneGift.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        p.goalType = 7;
        _expectCreateRevert(p, MilestoneGift.UnknownGoal.selector);

        gift.setCreationPaused(true);
        _expectCreateRevert(_params(AMOUNT, DURATION, TARGET), MilestoneGift.CreationIsPaused.selector);
    }

    function testAnAuthorizationForAnotherContractCannotFundThisOne() public {
        // The daily contract's tag, on otherwise identical terms.
        MilestoneGift.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        MilestoneGift.Authorization memory a = _authorizationWithTag(p, FUNDER_KEY, keccak256("viky.fund.v1"));
        VM.expectRevert(MilestoneGift.InvalidAuthorizationNonce.selector);
        gift.createGift(p, a);
    }

    // --- claim ------------------------------------------------------------------------------------------

    function testClaimBindsTheRecipientAndRefusesTheWrongContactOrAReplay() public {
        uint256 id = _create();
        MilestoneGift.ClaimAttestation memory wrongContact =
            _claimAttestation(id, recipient, keccak256("someone else"), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.ContactMismatch.selector);
        gift.claim(id, wrongContact);

        MilestoneGift.ClaimAttestation memory wrongSigner = _claimAttestation(id, recipient, CONTACT, WRONG_KEY);
        VM.expectRevert(MilestoneGift.InvalidEvidenceSigner.selector);
        gift.claim(id, wrongSigner);

        gift.claim(id, _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY));
        require(gift.getGift(id).recipient == recipient, "claimed");

        MilestoneGift.ClaimAttestation memory again = _claimAttestation(id, other, CONTACT, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.AlreadyClaimed.selector);
        gift.claim(id, again);
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
        MilestoneGift.Gift memory g = gift.getGift(id);
        require(g.identityHash == IDENTITY && g.startingValue == 1520, "the first reading is the start");

        // Dipping below the target and climbing back now settles nothing, for ever.
        VM.warp(START + 2 hours);
        MilestoneGift.ProofAttestation memory sandbagged =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1499, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.StartTooHigh.selector);
        gift.prove(id, sandbagged);

        VM.warp(START + 3 hours);
        MilestoneGift.ProofAttestation memory climbed =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET + 100, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.StartTooHigh.selector);
        gift.prove(id, climbed);

        require(gift.getGift(id).earned == 0, "nothing was ever earned");

        // And the money goes back to the funder at the deadline, as an unreached milestone.
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "it all goes back");
    }

    function testAStartingPointAtOrAboveTheTargetIsRefusedInTheTerms() public {
        _expectCreateRevert(_paramsFrom(AMOUNT, DURATION, TARGET, TARGET), MilestoneGift.InvalidMaximumStart.selector);
        _expectCreateRevert(
            _paramsFrom(AMOUNT, DURATION, TARGET, TARGET + 1), MilestoneGift.InvalidMaximumStart.selector
        );
    }

    /// @dev An old reading as a starting point would be pure advantage: the clock runs from now either way.
    function testTheFirstReadingCannotBeAnOldOne() public {
        uint256 id = _claimed();
        VM.warp(START + 1 hours);
        MilestoneGift.ProofAttestation memory old =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.StaleObservation.selector);
        gift.prove(id, old);
    }

    function testTheFirstProofRecordsWhereTheyStoodAndStartsTheClock() public {
        uint256 id = _claimed();
        uint64 at = uint64(VM.getBlockTimestamp());
        gift.prove(id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, at, EVIDENCE_KEY));
        MilestoneGift.Gift memory g = gift.getGift(id);
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
        MilestoneGift.Gift memory g = gift.getGift(id);
        require(g.settled && g.earned == AMOUNT, "all of it, at once");
        require(gift.earnedBalance(id) == AMOUNT, "theirs to take");
        require(g.refundable == 0, "nothing goes back");
    }

    function testShortOfTheTargetChangesNothing() public {
        uint256 id = _started(1200);
        VM.warp(START + 10 days);
        MilestoneGift.ProofAttestation memory nearly =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET - 1, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.NotThereYet.selector);
        gift.prove(id, nearly);
        require(gift.getGift(id).earned == 0, "nothing earned");
        require(!gift.getGift(id).settled, "still open");
    }

    /// @dev A rating that falls and rises again is still a milestone reached: only the target matters.
    function testProgressMayGoDownOnTheWay() public {
        uint256 id = _started(1200);
        VM.warp(START + 5 days);
        MilestoneGift.ProofAttestation memory dipped =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 900, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.NotThereYet.selector);
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

        MilestoneGift.ProofAttestation memory wrongProvider =
            _proof(id, recipient, IDENTITY, OTHER_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.ProviderMismatch.selector);
        gift.prove(id, wrongProvider);

        MilestoneGift.ProofAttestation memory otherProfile =
            _proof(id, recipient, OTHER_IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.IdentityMismatch.selector);
        gift.prove(id, otherProfile);

        MilestoneGift.ProofAttestation memory otherPerson =
            _proof(id, other, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.IdentityMismatch.selector);
        gift.prove(id, otherPerson);

        MilestoneGift.ProofAttestation memory wrongSigner =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, WRONG_KEY);
        VM.expectRevert(MilestoneGift.InvalidEvidenceSigner.selector);
        gift.prove(id, wrongSigner);

        MilestoneGift.ProofAttestation memory stale =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.StaleObservation.selector);
        gift.prove(id, stale);

        MilestoneGift.ProofAttestation memory future =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 2 minutes, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.InvalidAttestationWindow.selector);
        gift.prove(id, future);

        // A reading below the target changes nothing at all, so the same reading may be presented again:
        // the call reverts, and a revert undoes even the spending of its own replay guard.
        MilestoneGift.ProofAttestation memory short_ =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET - 100, at + 1, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.NotThereYet.selector);
        gift.prove(id, short_);
        VM.expectRevert(MilestoneGift.NotThereYet.selector);
        gift.prove(id, short_);
        require(gift.getGift(id).lastProofAt == at, "a refused reading moves nothing");

        MilestoneGift.ProofAttestation memory whilePaused =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 3, EVIDENCE_KEY);
        gift.setProofPaused(true);
        VM.expectRevert(MilestoneGift.ProofIsPaused.selector);
        gift.prove(id, whilePaused);
    }

    function testAnAcceptedReadingCannotBeUsedTwice() public {
        uint256 id = _claimed();
        uint64 at = uint64(VM.getBlockTimestamp());
        MilestoneGift.ProofAttestation memory start =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, at, EVIDENCE_KEY);
        gift.prove(id, start);

        // The same reading again, re-signed so only the replay guard can refuse it.
        MilestoneGift.ProofAttestation memory again =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, at + 1, EVIDENCE_KEY);
        again.nullifier = start.nullifier;
        again.signature = _sign(EVIDENCE_KEY, _proofStructHash(id, again));
        VM.expectRevert(MilestoneGift.NullifierAlreadyUsed.selector);
        gift.prove(id, again);
    }

    function testProofBeforeTheClaimIsRefused() public {
        uint256 id = _create();
        MilestoneGift.ProofAttestation memory early =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.NotClaimed.selector);
        gift.prove(id, early);
    }

    function testNothingIsAcceptedAfterTheDeadlineOrAfterItIsSettled() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 1);
        MilestoneGift.ProofAttestation memory late =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.DeadlinePassed.selector);
        gift.prove(id, late);

        VM.warp(START);
        uint256 second = _started(1200);
        VM.warp(START + 40 days);
        gift.prove(
            second,
            _proof(second, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        MilestoneGift.ProofAttestation memory afterwards = _proof(
            second, recipient, IDENTITY, CHESS_PROVIDER, TARGET + 1, uint64(VM.getBlockTimestamp() + 1), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.AlreadySettled.selector);
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
        MilestoneGift.Gift memory g = gift.getGift(id);
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
        MilestoneGift.ProofAttestation memory before = _proofOf(
            id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.EarnedBeforeTheGift.selector);
        gift.prove(id, before);
    }

    function testACertificateEarnedAfterTheDeadlineNeverPays() public {
        uint256 id = _certificate();
        // The day after the deadline's day. A granting day is a day: later on the deadline's own day counts.
        uint64 granted = uint64(START + uint256(DURATION + 1) * 1 days);
        VM.warp(START + uint256(DURATION + 1) * 1 days + 2 hours);
        MilestoneGift.ProofAttestation memory late = _proofOf(
            id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, granted, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.DeadlinePassed.selector);
        gift.prove(id, late);
    }

    /// @dev Somebody else's certificate is somebody else's. The funder signed the person and the thing.
    function testAnotherPersonsCertificateNeverPays() public {
        uint256 id = _certificate();
        VM.warp(START + 10 days);
        MilestoneGift.ProofAttestation memory theirs = _proofOf(
            id,
            recipient,
            keccak256("Someone Else|other-course"),
            CERTIFICATE_PROVIDER,
            1,
            uint64(START + 5 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.IdentityMismatch.selector);
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
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);
        VM.warp(deadline + 14 days);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);

        VM.warp(deadline + 14 days + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "it all goes back");
    }

    function testACertificateGiftNobodyOpensComesBackWithoutWaitingForItsDate() public {
        MilestoneGift.MilestoneParams memory p = _certificateParams(AMOUNT, 365);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        VM.warp(START + 14 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "the funder does not wait a year for a link nobody opened");
    }

    function testTheTwoShapesCannotBorrowEachOthersTerms() public {
        MilestoneGift.MilestoneParams memory climbWithSubject = _paramsFrom(AMOUNT, DURATION, TARGET, TARGET - 200);
        climbWithSubject.subject = SUBJECT;
        _expectCreateRevert(climbWithSubject, MilestoneGift.InvalidSubject.selector);

        MilestoneGift.MilestoneParams memory certificateWithCeiling = _certificateParams(AMOUNT, DURATION);
        certificateWithCeiling.maximumStart = 1;
        _expectCreateRevert(certificateWithCeiling, MilestoneGift.InvalidMaximumStart.selector);

        MilestoneGift.MilestoneParams memory certificateWithoutSubject = _certificateParams(AMOUNT, DURATION);
        certificateWithoutSubject.subject = bytes32(0);
        _expectCreateRevert(certificateWithoutSubject, MilestoneGift.InvalidSubject.selector);

        MilestoneGift.MilestoneParams memory nonsense = _certificateParams(AMOUNT, DURATION);
        nonsense.shape = 7;
        _expectCreateRevert(nonsense, MilestoneGift.InvalidShape.selector);
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
        MilestoneGift.ProofAttestation memory ahead = _proofOf(
            id,
            recipient,
            SUBJECT,
            CERTIFICATE_PROVIDER,
            1,
            uint64(VM.getBlockTimestamp() + 1 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.InvalidAttestationWindow.selector);
        gift.prove(id, ahead);
    }

    /// @dev A rating proved as "having it or not" would settle the whole amount on one reading, with no start
    ///      recorded and no climb at all. The shape belongs to the goal, not to whoever fills in the terms.
    function testAGoalIsProvedInItsOwnShapeOrNotAtAll() public {
        MilestoneGift.MilestoneParams memory ratingAsCertificate =
            _shaped(AMOUNT, DURATION, TARGET, 0, gift.SHAPE_HAVE_OR_NOT(), SUBJECT);
        ratingAsCertificate.goalType = GOAL_CHESS;
        _expectCreateRevert(ratingAsCertificate, MilestoneGift.InvalidShape.selector);

        MilestoneGift.MilestoneParams memory certificateAsClimb =
            _shaped(AMOUNT, DURATION, TARGET, TARGET - 200, gift.SHAPE_CLIMB(), bytes32(0));
        certificateAsClimb.goalType = GOAL_CERTIFICATE;
        _expectCreateRevert(certificateAsClimb, MilestoneGift.InvalidShape.selector);
    }

    function testAClimbCarriesNoGrantingDay() public {
        uint256 id = _claimed();
        MilestoneGift.ProofAttestation memory dated = _proofOf(
            id,
            recipient,
            IDENTITY,
            CHESS_PROVIDER,
            1200,
            uint64(START - 1 days),
            uint64(VM.getBlockTimestamp()),
            EVIDENCE_KEY
        );
        VM.expectRevert(MilestoneGift.InvalidShape.selector);
        gift.prove(id, dated);
    }

    /// @dev While proofs are paused nothing can be saved, so nothing may be taken back: the pause would
    ///      otherwise pay the funder for a milestone the recipient simply could not submit.
    function testAPauseNeverHandsTheGiftBack() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 7 hours);
        gift.setProofPaused(true);
        VM.expectRevert(MilestoneGift.ProofIsPaused.selector);
        gift.expire(id);

        gift.setProofPaused(false);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "and once proofs are open again it settles");
    }

    // --- the deadline -----------------------------------------------------------------------------------

    function testTheWholeAmountGoesBackWhenTheDeadlinePasses() public {
        uint256 id = _started(1200);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);

        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "all of it comes back");

        uint256 before = token.balanceOf(funder);
        gift.refundUnearned(id);
        require(token.balanceOf(funder) == before + AMOUNT, "and it arrives");
        VM.expectRevert(MilestoneGift.NothingToRefund.selector);
        gift.refundUnearned(id);
    }

    function testAGiftNobodyEverStartsComesBackAfterFourteenDays() public {
        uint256 id = _claimed();
        VM.warp(START + 14 days - 1);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
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
        VM.expectRevert(MilestoneGift.AlreadySettled.selector);
        gift.expire(id);
    }

    function testExpiringTwiceIsRefused() public {
        uint256 id = _started(1200);
        VM.warp(START + uint256(DURATION) * 1 days + 6 hours + 1);
        gift.expire(id);
        VM.expectRevert(MilestoneGift.AlreadySettled.selector);
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
        MilestoneGift.ProofAttestation memory inTime =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, observed, EVIDENCE_KEY);
        gift.prove(id, inTime);
        require(gift.getGift(id).earned == AMOUNT, "our lateness is ours, never theirs to pay for");
    }

    /// @dev And the bound that does belong to a first reading is still there.
    function testTheGraceDoesNotLetAnOldReadingStartAGift() public {
        uint256 id = _claimed();
        VM.warp(START + 5 hours);
        MilestoneGift.ProofAttestation memory old =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(START), EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.StaleObservation.selector);
        gift.prove(id, old);
    }

    function testProveAndExpireAreNeverBothShut() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        uint64 observed = uint64(deadline - 1 minutes);

        // The moment expire opens, a reading taken in time can no longer arrive, and not one second before.
        VM.warp(deadline + 6 hours);
        MilestoneGift.ProofAttestation memory lastMoment =
            _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, observed, EVIDENCE_KEY);
        gift.prove(id, lastMoment);
        require(gift.getGift(id).earned == AMOUNT, "the last instant of the grace still pays");
    }

    function testTheKeeperCannotExpireWhileSuchAReadingCouldStillArrive() public {
        uint256 id = _started(1200);
        uint256 deadline = START + uint256(DURATION) * 1 days;
        VM.warp(deadline + 1);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);

        VM.warp(deadline + 6 hours + 1);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "and then it goes back");
    }

    /// @dev Opening the link on the last day must not leave someone with no time to take a first reading.
    function testTheWaitForAFirstReadingRunsFromTheDayItWasOpened() public {
        uint256 id = _create();
        VM.warp(START + 13 days);
        gift.claim(id, _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY));

        VM.warp(START + 14 days + 1);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);

        VM.warp(START + 13 days + 14 days + 6 hours);
        gift.expire(id);
        require(gift.refundableBalance(id) == AMOUNT, "returned only after the full wait from opening");
    }

    function testAGiftThatIsOverCannotBeOpened() public {
        uint256 id = _create();
        VM.warp(START + 14 days + 6 hours);
        gift.expire(id);
        MilestoneGift.ClaimAttestation memory late = _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGift.AlreadySettled.selector);
        gift.claim(id, late);
    }

    function testAGiftReturnedAtItsDeadlineCannotBeClosedAgain() public {
        uint256 id = _create();
        VM.warp(START + 14 days + 6 hours + 1);
        gift.expire(id);
        VM.expectRevert(MilestoneGift.AlreadySettled.selector);
        VM.prank(funder);
        gift.cancel(id);
    }

    function testTheKeeperCannotBeatAFirstReadingEither() public {
        uint256 id = _claimed();
        VM.warp(START + 14 days + 1);
        VM.expectRevert(MilestoneGift.TooEarly.selector);
        gift.expire(id);

        // Still time to start it, right up to the grace.
        VM.warp(START + 14 days + 5 hours);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1200, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
        require(gift.getGift(id).identityHash == IDENTITY, "a first reading still lands inside the grace");
    }

    function testMilestoneIdsCannotCollideWithTheDailyContract() public {
        VM.expectRevert(MilestoneGift.InvalidGiftId.selector);
        new MilestoneGift(token, evidenceSigner, FIRST_ID - 1);
        require(gift.nextGiftId() >= FIRST_ID, "numbered well clear of the other contract");
    }

    // --- taking it and giving it back -------------------------------------------------------------------

    function testTheRecipientTakesItDirectlyOrThroughASignedIntent() public {
        uint256 id = _reached();
        VM.expectRevert(MilestoneGift.NotRecipient.selector);
        VM.prank(other);
        gift.withdrawEarned(id, other, 1);

        VM.prank(recipient);
        gift.withdrawEarned(id, recipient, AMOUNT / 2);
        require(token.balanceOf(recipient) == AMOUNT / 2, "half taken");

        MilestoneGift.WithdrawIntent memory intent = _intent(id, recipient, AMOUNT / 2, 0, RECIPIENT_KEY);
        gift.withdrawEarnedWithIntent(id, intent);
        require(token.balanceOf(recipient) == AMOUNT, "the rest taken by the relayer");

        VM.expectRevert(MilestoneGift.InsufficientEarned.selector);
        VM.prank(recipient);
        gift.withdrawEarned(id, recipient, 1);
    }

    function testAnIntentSignedByAnotherAccountIsRefused() public {
        uint256 id = _reached();
        MilestoneGift.WithdrawIntent memory intent = _intent(id, other, AMOUNT, 0, OTHER_KEY);
        VM.expectRevert(MilestoneGift.InvalidRecipientSignature.selector);
        gift.withdrawEarnedWithIntent(id, intent);
    }

    function testTheFunderTakesItBackOnlyBeforeItIsOpened() public {
        uint256 id = _create();
        uint256 before = token.balanceOf(funder);
        VM.expectRevert(MilestoneGift.NotFunder.selector);
        VM.prank(other);
        gift.cancel(id);

        VM.prank(funder);
        gift.cancel(id);
        require(token.balanceOf(funder) == before + AMOUNT, "everything back");

        uint256 second = _claimed();
        VM.expectRevert(MilestoneGift.AlreadyClaimed.selector);
        VM.prank(funder);
        gift.cancel(second);
    }

    // --- the accounting ---------------------------------------------------------------------------------

    /// @dev Whatever happens, every unit ends with the recipient or with the funder, and none stays here.
    function testFuzzEveryUnitEndsWithSomebody(uint256 seed, uint8 amountSeed, uint8 durationSeed) public {
        uint256 amount = 1_000_000 + (uint256(amountSeed) * 333_337);
        uint32 duration = 1 + uint32(durationSeed % 365);
        MilestoneGift.MilestoneParams memory p = _params(amount, duration, TARGET);
        uint256 id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        gift.claim(id, _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY));
        gift.prove(id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, 1, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY));

        if (seed % 2 == 0) {
            VM.warp(START + (uint256(duration) * 1 days) / 2 + 1);
            gift.prove(
                id,
                _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
            );
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
        returns (MilestoneGift.MilestoneParams memory)
    {
        return _paramsFrom(amount, duration, target, target == 0 ? 0 : target - 200);
    }

    function _paramsFrom(uint256 amount, uint32 duration, uint64 target, uint64 maximumStart)
        private
        returns (MilestoneGift.MilestoneParams memory p)
    {
        p = _shaped(amount, duration, target, maximumStart, gift.SHAPE_CLIMB(), bytes32(0));
        p.goalType = GOAL_CHESS;
    }

    function _certificateParams(uint256 amount, uint32 duration)
        private
        returns (MilestoneGift.MilestoneParams memory p)
    {
        p = _shaped(amount, duration, 1, 0, gift.SHAPE_HAVE_OR_NOT(), SUBJECT);
        p.goalType = GOAL_CERTIFICATE;
    }

    function _shaped(uint256 amount, uint32 duration, uint64 target, uint64 maximumStart, uint8 shape, bytes32 subject)
        private
        returns (MilestoneGift.MilestoneParams memory)
    {
        return MilestoneGift.MilestoneParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: CONTACT,
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

    function _authorization(MilestoneGift.MilestoneParams memory p, uint256 key)
        private
        returns (MilestoneGift.Authorization memory)
    {
        return _authorizationWithTag(p, key, keccak256("viky.milestone.fund.v1"));
    }

    function _authorizationWithTag(MilestoneGift.MilestoneParams memory p, uint256 key, bytes32 tag)
        private
        returns (MilestoneGift.Authorization memory a)
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
                        p.recipientContactHash,
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
        MilestoneGift.MilestoneParams memory p = _params(AMOUNT, DURATION, TARGET);
        return gift.createGift(p, _authorization(p, FUNDER_KEY));
    }

    function _claimed() private returns (uint256 id) {
        id = _create();
        gift.claim(id, _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY));
    }

    function _started(uint64 from) private returns (uint256 id) {
        id = _claimed();
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, from, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
    }

    function _certificate() private returns (uint256 id) {
        MilestoneGift.MilestoneParams memory p = _certificateParams(AMOUNT, DURATION);
        id = gift.createGift(p, _authorization(p, FUNDER_KEY));
        gift.claim(id, _claimAttestation(id, recipient, CONTACT, EVIDENCE_KEY));
    }

    function _reached() private returns (uint256 id) {
        id = _started(1200);
        VM.warp(START + 10 days);
        gift.prove(
            id, _proof(id, recipient, IDENTITY, CHESS_PROVIDER, TARGET, uint64(VM.getBlockTimestamp()), EVIDENCE_KEY)
        );
    }

    function _expectCreateRevert(MilestoneGift.MilestoneParams memory p, bytes4 selector) private {
        MilestoneGift.Authorization memory a = _authorization(p, FUNDER_KEY);
        VM.expectRevert(selector);
        gift.createGift(p, a);
    }

    function _claimAttestation(uint256 giftId, address who, bytes32 contact, uint256 key)
        private
        returns (MilestoneGift.ClaimAttestation memory c)
    {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        c = MilestoneGift.ClaimAttestation({
            recipient: who, contactHash: contact, issuedAt: issuedAt, expiresAt: issuedAt + 5 minutes, signature: ""
        });
        bytes32 structHash = keccak256(abi.encode(gift.CLAIM_TYPEHASH(), giftId, who, contact, c.issuedAt, c.expiresAt));
        c.signature = _sign(key, structHash);
    }

    function _proof(
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt,
        uint256 key
    ) private returns (MilestoneGift.ProofAttestation memory) {
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
    ) private returns (MilestoneGift.ProofAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = MilestoneGift.ProofAttestation({
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

    function _proofStructHash(uint256 giftId, MilestoneGift.ProofAttestation memory a) private view returns (bytes32) {
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
        returns (MilestoneGift.WithdrawIntent memory i)
    {
        i = MilestoneGift.WithdrawIntent({
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
                keccak256("1"),
                block.chainid,
                address(gift)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
