// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @dev The EIP-3009 entry AUSD exposes. `to` must be the caller, so a signed authorization can only land here.
interface IERC3009Receiver {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title  MilestoneGiftV2
/// @notice A gift for one thing, not for a habit. A funder sets an amount aside in someone's name for a single
///         verified milestone, with a deadline: reach it in time and the whole amount is theirs, let the
///         deadline pass and the whole amount goes back. Nothing accrues, nothing is credited in parts.
/// @dev    The companion of GiftEscrowV2, which pays a day at a time. The two are separate contracts on purpose
///         (DECISIONS.md D36): the shape of the release is written into the contract, not chosen per gift, and
///         trying to serve both from one made neither honest. What they share is deliberate and identical: the
///         funder's single EIP-3009 signature is both the payment and the consent to these exact terms, the
///         goal registry maps a goal type to the provider its proofs must carry, and every proof is attested
///         off chain by the evidence signer and checked here for signer, freshness, replay and identity.
///
///         What the second version changes, each from the audit of 1 Oct 2026. Opening a gift takes the key of
///         its link: the funder's terms carry the address of an opening key made from the secret the link
///         carries, `claim` takes that key's signature, and the evidence signer opens nothing (on the first
///         version it could open an unopened gift in its own name and prove it in the same block). The person
///         the gift is for can end it before the target is read, and the whole amount goes back at once. The
///         owner is bounded: ownership moves in two steps and cannot be given up, a signer one owner announced
///         never stands under the next, a new evidence signer is announced and stands a day later, a goal is
///         added and never changed, and a pause of proofs covers opening too, ends by itself after seven days
///         and cannot be sent again while it runs nor for seven days after it ended.
///
///         What a pause does to a gift, from the review of 2 Oct 2026. A window for a proof, the grace after a
///         climb's deadline or a certificate's late window, that was still open when the pause began keeps, once
///         the pause is over, at least the time it had left, or seven days if it had more, and never more than
///         it had; one that had closed stays closed. The two waits before a gift is under way, for somebody to
///         open it and for a first reading, are not given back what a pause took: one the pause ran across ends
///         six hours after the pause at the latest, and one that ends later ends when it would have. A climb
///         whose deadline fell inside the pause is judged on a reading taken until the pause
///         ended, because nothing could be proved meanwhile. And the first reading of a climb, which binds an
///         identity and a starting point for good, is signed by the account the gift is for beside the evidence
///         signer: that one key alone could otherwise record a start nobody stood at.
///
///         There are two shapes of milestone, because there are two shapes of thing to prove.
///
///         **A climb**, for something measured that moves: a rating, a count. The rule is about the climb,
///         not the arrival, and it is described below.
///
///         **Having it or not**, for something that is granted once and has a date: a certificate. There is
///         no starting point to record, because no public page says "not yet obtained"; the only page there
///         is appears the day the thing is granted. So the proof carries the day it was granted, attested,
///         and the contract pays when that day falls between the day the gift was funded and its deadline.
///         The deadline is fixed at funding, so the funder signs a date they can see, and the attestation
///         must match the person and the course the funder named, which they signed with the rest.
///
///         The security of the climb lives in one rule, and the rule is about the climb, not the arrival. A
///         funder signs two numbers: the target to reach, and the highest starting point they will pay from.
///         The first reading is always recorded as the start, whatever it says, and a milestone pays only if
///         that recorded start was at or below the highest the funder accepted.
///
///         Both halves matter. Recording the first reading whatever it says leaves the recipient no way to
///         retry until a reading suits them: an earlier draft refused a start at or past the target, and a
///         refusal reverts, so the contract kept no memory of it. On a metric that can fall, a rating for
///         instance, someone already at 1520 could lose two games, start at 1499, win one, and take the whole
///         amount for a one point climb. And the highest accepted start is what stops the same trick being
///         played before the first reading is ever taken, which no memory of refusals could catch.
contract MilestoneGiftV2 is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant CONTRACT_SCHEMA_ID = 2;
    /// @dev What the key of the gift's link signs to open it: the gift, the account it opens for, and until when.
    bytes32 public constant OPEN_TYPEHASH = keccak256("Open(uint256 giftId,address recipient,uint64 deadline)");
    bytes32 public constant PROOF_TYPEHASH = keccak256(
        "Proof(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 eventAt,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)"
    );
    /// @dev What the account the gift is for signs beside the evidence signer on the reading that starts a climb,
    ///      and on that one only: the identity it binds, where it starts from and the moment it was read. The type
    ///      is the daily contract's on purpose, so one signing path serves both.
    bytes32 public constant START_TYPEHASH =
        keccak256("Start(uint256 giftId,bytes32 identityHash,uint64 metricValue,uint64 observedAt)");
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)");
    /// @dev What the person the gift is for signs to end it: the two amounts their screen showed. On this contract
    ///      nothing is earned before the target, so `keep` is always zero and `giveBack` is the whole amount; the
    ///      type is the daily contract's on purpose, so one screen and one signing path serve both.
    bytes32 public constant END_TYPEHASH =
        keccak256("End(uint256 giftId,uint256 keep,uint256 giveBack,uint256 nonce,uint64 deadline)");
    /// @dev Distinct from the daily contract's tag, so one contract's funding signature can never fund the
    ///      other's gift even for identical terms, and from the first version's.
    bytes32 public constant FUND_NONCE_TAG = keccak256("viky.milestone.fund.v2");

    uint256 public constant MIN_AMOUNT = 1_000_000; // 1 AUSD
    uint256 public constant MAX_AMOUNT = 100_000_000_000; // 100,000 AUSD
    /// @dev One day is allowed here and nowhere else: "a mission delivered tomorrow" is a milestone, and it was
    ///      the first thing the daily contract could not express (D36).
    uint32 public constant MIN_DURATION_DAYS = 1;
    uint32 public constant MAX_DURATION_DAYS = 365;
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes;
    uint256 public constant MAX_CLOCK_SKEW = 1 minutes;
    /// @dev A gift nobody ever opens, or opens and never starts, comes back rather than sitting here for ever.
    ///      Measured from the claim once there is one, so opening the link late does not shorten the wait.
    uint256 public constant DORMANT_REFUND_DELAY = 14 days;
    /// @dev How long after its deadline a certificate granted in time may still be submitted. A granting day
    ///      is historical, so waiting gains the recipient nothing and a short window would only take the gift
    ///      away for being slow to open the app. Bounded all the same: the funder's money must not wait for
    ///      ever on a proof that may never come.
    uint256 public constant LATE_PROOF_WINDOW = 14 days;
    /// @dev A reading taken before the deadline may still be submitted for a while after it, so the keeper's
    ///      call to `expire` can never beat a proof that was verifiably in time. The deadline judges the
    ///      reading; this grace judges the transaction. The daily contract protects its catch-up the same way.
    uint256 public constant PROOF_GRACE = 6 hours;
    /// @dev Milestone gifts are numbered from here up, so an id can never mean two different gifts across the
    ///      two contracts. Records elsewhere key on the id alone, and a collision would merge two gifts.
    uint256 public constant FIRST_ID_FLOOR = 1_000_000;
    /// @dev The longest a pause of proofs can run. One that runs cannot be sent again.
    uint256 public constant MAX_PAUSE = 7 days;
    /// @dev How long after the end of a pause the next one must wait. It is also the most a pause ever gives back
    ///      to a window, so no window a pause moved is still open when the next pause can begin: a gift is never
    ///      held from one pause to the next (the review of 2 Oct 2026, R-02).
    uint256 public constant PAUSE_REST = 7 days;
    /// @dev How long an announced evidence signer waits before it stands.
    uint256 public constant SIGNER_DELAY = 24 hours;

    /// @dev Something measured that moves: the first reading is the start, and the climb is what pays.
    uint8 public constant SHAPE_CLIMB = 0;
    /// @dev Something granted once, with a date: no start, and the granting day is what pays.
    uint8 public constant SHAPE_HAVE_OR_NOT = 1;
    uint256 private constant DAY = 1 days;

    /// @dev `salt` lets two gifts with identical terms still get distinct funding nonces.
    struct MilestoneParams {
        address funder;
        address refundTo;
        /// @dev The address of the key that opens this gift. Its private half is derived, in the funder's
        ///      browser, from the secret the gift's link carries: whoever holds the link holds the key.
        address openingKey;
        uint8 goalType;
        uint8 shape;
        uint64 target;
        /// @dev A climb only: the highest starting point the funder will pay a climb from. Signed with the
        ///      rest of the terms, so it is the funder's number and nobody else's. Zero for the other shape.
        uint64 maximumStart;
        /// @dev Having it or not only: what the funder named, the person and the thing, bound into one hash
        ///      and signed with the terms, so a proof of somebody else's certificate cannot pay. Zero for a climb.
        bytes32 subject;
        uint32 durationDays;
        uint256 amount;
        bytes32 salt;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Signed by the gift's opening key. Naming the recipient is what stops a relayer, or anybody watching,
    ///      from opening the gift for another account with a signature they did not make.
    struct OpenIntent {
        address recipient;
        uint64 deadline;
        bytes signature;
    }

    /// @dev Provider-neutral, exactly as the daily contract: `providerId` must match the registry entry for the
    ///      gift's goal type, and the goal type fixes how `metricValue` reads. A certificate is 0 then 1
    ///      against a target of 1; a rating is the rating itself.
    struct ProofAttestation {
        address recipient;
        bytes32 identityHash;
        bytes32 providerId;
        uint64 metricValue;
        /// @dev Having it or not: the day the thing was granted, as the page itself says it. Zero for a climb.
        uint64 eventAt;
        uint64 observedAt;
        bytes32 nullifier;
        uint64 issuedAt;
        uint64 expiresAt;
        bytes signature;
        /// @dev The recipient's own signature over `Start`, on the reading that starts a climb. Empty on every
        ///      other proof.
        bytes recipientSignature;
    }

    struct WithdrawIntent {
        address to;
        uint256 amount;
        uint256 nonce;
        uint64 deadline;
        bytes signature;
    }

    struct EndIntent {
        uint256 keep;
        uint256 giveBack;
        uint256 nonce;
        uint64 deadline;
        bytes signature;
    }

    struct Gift {
        address funder;
        address refundTo;
        address recipient;
        address openingKey;
        uint8 goalType;
        uint8 shape;
        uint64 target;
        uint64 maximumStart;
        bytes32 subject;
        uint32 durationDays;
        uint256 amount;
        uint256 earned;
        uint256 withdrawnByRecipient;
        uint256 refundable;
        uint256 refundedToFunder;
        bytes32 identityHash;
        uint64 startingValue;
        uint64 lastProofAt;
        uint64 deadline;
        uint64 fundedAt;
        uint64 claimedAt;
        bool cancelled;
        bool settled;
        /// @dev When the recipient ended it, or zero. An ended gift is settled, with nothing earned.
        uint64 endedAt;
    }

    IERC20 public immutable token;
    address public evidenceSigner;
    /// @dev Milestone gifts carry their own numbering, distinct from the daily contract's.
    uint256 public nextGiftId;
    bool public creationPaused;
    /// @dev The last pause of proofs: when it began, and when it ends (in the future while one runs, never further
    ///      than `MAX_PAUSE` from the moment it was set). Both are zero until the first pause: a new contract
    ///      holds no gift, so it has nothing to pause. Every window a pause could have shut is read through
    ///      `_closes`, which reopens nothing. The grace after a climb's deadline and a certificate's late window
    ///      keep, past the pause, at least the time they had left when it began, or seven days if they had more.
    ///      The wait for somebody to open the gift and the wait for a first reading get back six hours at most,
    ///      and only when the pause ran across their end. No pause is for ever, so an owner who is gone cannot
    ///      hold one and `expire` needs no switch.
    uint64 public proofPauseBegan;
    uint64 public proofPausedUntil;
    /// @dev A new evidence signer is announced here, and stands only after `SIGNER_DELAY`.
    address public pendingEvidenceSigner;
    uint64 public evidenceSignerReadyAt;

    mapping(uint256 => Gift) private gifts;
    mapping(uint8 => bytes32) public goalProviders;
    /// @dev The shape a goal is proved in, fixed when the goal is registered. Without it a gift could be
    ///      declared in the wrong shape for its source, and a rating proved as "having it or not" would settle
    ///      the whole amount on a single reading, with no start recorded and no climb at all.
    mapping(uint8 => uint8) public goalShapes;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(uint256 => uint256) public withdrawNonces;

    event GoalRegistered(uint8 indexed goalType, bytes32 indexed providerId, uint8 shape);
    event GiftCreated(
        uint256 indexed giftId,
        address indexed funder,
        address refundTo,
        address indexed openingKey,
        uint8 goalType,
        uint8 shape,
        uint64 target,
        uint64 maximumStart,
        bytes32 subject,
        uint32 durationDays,
        uint256 amount,
        uint64 deadline
    );
    event GiftFunded(uint256 indexed giftId, uint256 amount);
    event GiftClaimed(uint256 indexed giftId, address indexed recipient);
    event StartRecorded(
        uint256 indexed giftId,
        address indexed recipient,
        bytes32 indexed identityHash,
        uint64 startingValue,
        uint64 deadline
    );
    event MilestoneReached(
        uint256 indexed giftId, address indexed recipient, uint64 metricValue, uint64 observedAt, uint256 amount
    );
    event GiftExpired(uint256 indexed giftId, uint256 amount);
    event GiftEnded(uint256 indexed giftId, address indexed recipient, uint256 kept, uint256 givenBack);
    event EarnedWithdrawn(uint256 indexed giftId, address indexed recipient, address indexed to, uint256 amount);
    event UnearnedRefunded(uint256 indexed giftId, address indexed refundTo, uint256 amount);
    event GiftCancelled(uint256 indexed giftId, uint256 refunded);
    event EvidenceSignerAnnounced(address indexed newSigner, uint64 readyAt);
    event EvidenceSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CreationPauseUpdated(bool paused);
    event ProofPauseUpdated(bool paused, uint64 pausedUntil);

    error InvalidAddress();
    error InvalidGiftId();
    error InvalidTokenDecimals();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidTarget();
    error InvalidOpeningKey();
    error UnknownGoal();
    error InvalidGoalType();
    error InvalidAuthorizationNonce();
    error TransferShortfall();
    error GiftNotFound();
    error AlreadyClaimed();
    error NotClaimed();
    error InvalidOpeningSignature();
    error RecipientIsFunder();
    error GiftIsCancelled();
    error CreationIsPaused();
    error ProofIsPaused();
    error InvalidEvidenceSigner();
    error AttestationExpired();
    error InvalidAttestationWindow();
    error InvalidProofHash();
    error NullifierAlreadyUsed();
    error IdentityMismatch();
    error ProviderMismatch();
    error StaleObservation();
    error InvalidShape();
    error InvalidSubject();
    error EarnedBeforeTheGift();
    error InvalidMaximumStart();
    error StartTooHigh();
    error NotThereYet();
    error DeadlinePassed();
    error AlreadySettled();
    error TooEarly();
    error NotRecipient();
    error NotFunder();
    error InsufficientEarned();
    error NothingToRefund();
    error IntentExpired();
    error InvalidIntentNonce();
    error InvalidRecipientSignature();
    error EndTermsChanged();
    error OwnershipIsNotRenounceable();
    error GoalAlreadyRegistered();
    error NoSignerPending();
    error SignerNotReady();
    error PauseTooSoon();

    constructor(IERC20 token_, address evidenceSigner_, uint256 firstGiftId_) EIP712("Viky Milestone", "2") {
        if (address(token_) == address(0) || evidenceSigner_ == address(0)) revert InvalidAddress();
        if (IERC20Metadata(address(token_)).decimals() != 6) revert InvalidTokenDecimals();
        if (firstGiftId_ < FIRST_ID_FLOOR) revert InvalidGiftId();
        token = token_;
        evidenceSigner = evidenceSigner_;
        nextGiftId = firstGiftId_;
        // Fail closed: no gift can be made until the deployer opens creation, once the deployment has been
        // checked. Proofs are not paused here: there is no gift to prove yet, and a pause spent on an empty
        // contract would leave it without its brake for the seven days of rest that follow.
        creationPaused = true;
    }

    /// @notice Whether proofs and openings are paused right now. A pause ends when the owner ends it, or by itself
    ///         `MAX_PAUSE` after it was sent.
    function proofPaused() public view returns (bool) {
        return block.timestamp < proofPausedUntil;
    }

    // --- terms ------------------------------------------------------------------------------------------

    function hashParams(MilestoneParams calldata p) public pure returns (bytes32) {
        return keccak256(
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
        );
    }

    /// @notice The nonce the funder's EIP-3009 authorization must carry: the hash of these exact terms. One
    ///         signature is therefore both the payment and the consent to the terms, and cannot fund anything else.
    function fundingNonce(MilestoneParams calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(FUND_NONCE_TAG, hashParams(p)));
    }

    // --- create and fund --------------------------------------------------------------------------------

    function createGift(MilestoneParams calldata p, Authorization calldata a)
        external
        nonReentrant
        returns (uint256 giftId)
    {
        if (creationPaused) revert CreationIsPaused();
        if (p.funder == address(0) || p.refundTo == address(0)) revert InvalidAddress();
        // A refund sent here or to the token could never leave again.
        if (p.refundTo == address(this) || p.refundTo == address(token)) revert InvalidAddress();
        if (p.openingKey == address(0)) revert InvalidOpeningKey();
        if (goalProviders[p.goalType] == bytes32(0)) revert UnknownGoal();
        // The shape belongs to the goal, not to the terms: a source that moves is proved as a climb and
        // nothing else, whatever the funder's app puts in this field.
        if (p.shape != goalShapes[p.goalType]) revert InvalidShape();
        if (p.target == 0) revert InvalidTarget();
        if (p.shape == SHAPE_CLIMB) {
            // A climb has to be a climb: a starting point at or above the target would pay for standing still.
            if (p.maximumStart >= p.target) revert InvalidMaximumStart();
            if (p.subject != bytes32(0)) revert InvalidSubject();
        } else if (p.shape == SHAPE_HAVE_OR_NOT) {
            // Nothing to start from, and a proof must name the person and the thing the funder named.
            if (p.maximumStart != 0) revert InvalidMaximumStart();
            if (p.subject == bytes32(0)) revert InvalidSubject();
        } else {
            revert InvalidShape();
        }
        if (p.durationDays < MIN_DURATION_DAYS || p.durationDays > MAX_DURATION_DAYS) revert InvalidDuration();
        if (p.amount < MIN_AMOUNT || p.amount > MAX_AMOUNT) revert InvalidAmount();
        if (a.nonce != fundingNonce(p)) revert InvalidAuthorizationNonce();

        uint256 balanceBefore = token.balanceOf(address(this));
        IERC3009Receiver(address(token))
            .receiveWithAuthorization(
                p.funder, address(this), p.amount, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s
            );
        if (token.balanceOf(address(this)) != balanceBefore + p.amount) revert TransferShortfall();

        giftId = nextGiftId++;
        Gift storage g = gifts[giftId];
        g.funder = p.funder;
        g.refundTo = p.refundTo;
        g.openingKey = p.openingKey;
        g.goalType = p.goalType;
        g.shape = p.shape;
        g.target = p.target;
        g.maximumStart = p.maximumStart;
        g.subject = p.subject;
        g.durationDays = p.durationDays;
        g.amount = p.amount;
        g.fundedAt = uint64(block.timestamp);
        // Having it or not runs to a date the funder can see, counted from the moment they paid. A climb
        // cannot: nobody knows when the recipient will take their first reading.
        if (p.shape == SHAPE_HAVE_OR_NOT) g.deadline = uint64(block.timestamp + uint256(p.durationDays) * DAY);

        emit GiftCreated(
            giftId,
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
            g.deadline
        );
        emit GiftFunded(giftId, p.amount);
    }

    // --- claim ------------------------------------------------------------------------------------------

    /// @notice Binds the recipient's account. Whoever holds the gift's link holds its opening key, and that key
    ///         signs which account the gift opens for. Anyone may submit it, the relayer does; nobody can change
    ///         the account it names. The evidence signer is not asked: it proves the milestone, it opens nothing.
    function claim(uint256 giftId, OpenIntent calldata o) external nonReentrant {
        // The pause is the brake on everything that binds or settles in the recipient's favour, opening included.
        if (proofPaused()) revert ProofIsPaused();
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        if (g.recipient != address(0)) revert AlreadyClaimed();
        if (o.recipient == address(0)) revert InvalidAddress();
        // A gift is for somebody else. A funder who opened their own could prove it themselves and call it a gift.
        if (o.recipient == g.funder) revert RecipientIsFunder();
        if (o.deadline < block.timestamp) revert IntentExpired();
        bytes32 structHash = keccak256(abi.encode(OPEN_TYPEHASH, giftId, o.recipient, o.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), o.signature) != g.openingKey) revert InvalidOpeningSignature();

        g.recipient = o.recipient;
        g.claimedAt = uint64(block.timestamp);
        emit GiftClaimed(giftId, o.recipient);
    }

    // --- proving the milestone --------------------------------------------------------------------------

    /// @notice Records verified progress toward the one milestone. The first proof is the starting point,
    ///         whatever it says: it binds the identity, records where the person stood, and starts the clock.
    ///         It is never refused for standing too high, because a refusal would leave no trace and the
    ///         recipient could simply try again from a reading that suited them. A start above what the funder
    ///         accepted is recorded instead, and no later proof can settle the gift, which then returns at its
    ///         deadline. Every later proof either reaches the target from an accepted start, and the whole
    ///         amount becomes the recipient's at once, or it does not, and nothing changes.
    function prove(uint256 giftId, ProofAttestation calldata a) external nonReentrant {
        if (proofPaused()) revert ProofIsPaused();
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        if (a.recipient != g.recipient) revert IdentityMismatch();
        if (a.providerId != goalProviders[g.goalType]) revert ProviderMismatch();
        if (a.nullifier == bytes32(0) || a.identityHash == bytes32(0)) revert InvalidProofHash();
        // A climb is proved by readings, never by a date. Refusing the field outright stops the two shapes
        // borrowing each other's rules through an attestation.
        if (g.shape == SHAPE_CLIMB && a.eventAt != 0) revert InvalidShape();
        if (usedNullifiers[a.nullifier]) revert NullifierAlreadyUsed();
        _validateAttestationWindow(a.issuedAt, a.expiresAt);
        if (uint256(a.observedAt) > block.timestamp + MAX_CLOCK_SKEW) revert InvalidAttestationWindow();
        // Bounded below, but only for the reading that starts a gift: there is no previous reading to compare
        // it with, and an old one as a starting point would be pure advantage to the recipient. Applying the
        // same bound to a later proof would undo the grace below, because a reading could then never arrive
        // more than ten minutes after it was taken, and a reading taken in time would be lost to our own
        // lateness. Later proofs are bounded by `lastProofAt`, by the deadline, and by their own nullifier.
        if (
            g.shape == SHAPE_CLIMB && g.identityHash == bytes32(0)
                && uint256(a.observedAt) + MAX_ATTESTATION_AGE < block.timestamp
        ) {
            revert StaleObservation();
        }
        if (a.observedAt <= g.lastProofAt) revert StaleObservation();
        _verifyProofSignature(giftId, a);
        usedNullifiers[a.nullifier] = true;

        if (g.shape == SHAPE_HAVE_OR_NOT) {
            // Nothing to start: the page only exists once the thing is granted. What pays is the day it says,
            // and a day is a day. Comparing it against the hour the funder happened to pay would refuse a
            // certificate granted that same morning and cut the last day short at that same hour.
            if (a.identityHash != g.subject) revert IdentityMismatch();
            if (a.eventAt == 0 || uint256(a.eventAt) > block.timestamp) revert InvalidAttestationWindow();
            if (_dayOf(a.eventAt) < _dayOf(g.fundedAt)) revert EarnedBeforeTheGift();
            if (_dayOf(a.eventAt) > _dayOf(g.deadline)) revert DeadlinePassed();
            // Two weeks to submit, not six hours. A granting day is historical and permanent: the page says
            // the same thing for ever, so waiting gains the recipient nothing, and a short window would take
            // the whole gift away for being slow to open the app. The climb's grace is short because a
            // reading is a snapshot that goes stale; this is not one.
            if (block.timestamp > _closes(g.deadline, LATE_PROOF_WINDOW)) revert DeadlinePassed();
            if (a.metricValue < g.target) revert NotThereYet();
            g.lastProofAt = a.observedAt;
            g.settled = true;
            g.earned = g.amount;
            emit MilestoneReached(giftId, g.recipient, a.metricValue, a.eventAt, g.amount);
            return;
        }

        if (g.identityHash == bytes32(0)) {
            // Recorded whatever it says. Refusing here would revert, leaving no memory of the reading, and the
            // recipient could keep trying until one suited them. This is the rule the climb rests on. And since
            // what it records is recorded for good, the account the gift is for signs it too.
            _verifyStartSignature(giftId, g.recipient, a);
            g.identityHash = a.identityHash;
            g.startingValue = a.metricValue;
            g.lastProofAt = a.observedAt;
            uint64 deadline = uint64(block.timestamp + uint256(g.durationDays) * DAY);
            g.deadline = deadline;
            emit StartRecorded(giftId, g.recipient, a.identityHash, a.metricValue, deadline);
            return;
        }

        if (a.identityHash != g.identityHash) revert IdentityMismatch();
        // The deadline judges the reading; the grace judges the transaction. A reading taken in time is not
        // lost because the keeper submitted it a moment late, and `expire` cannot open until the grace ends.
        // A deadline that fell inside a pause is read at the end of that pause: nothing could be proved meanwhile,
        // so a target reached the day before the deadline would otherwise be lost to the pause.
        if (uint256(a.observedAt) > _readBy(g.deadline)) revert DeadlinePassed();
        // The grace is whole again once proofs reopen, when the pause ran past the deadline.
        if (block.timestamp > _closes(g.deadline, PROOF_GRACE)) revert DeadlinePassed();
        g.lastProofAt = a.observedAt;
        // The climb the funder signed for. A start above it can never settle, so the gift returns at its
        // deadline; the screens say so as soon as the start is recorded.
        if (g.startingValue > g.maximumStart) revert StartTooHigh();
        if (a.metricValue < g.target) revert NotThereYet();

        g.settled = true;
        g.earned = g.amount;
        emit MilestoneReached(giftId, g.recipient, a.metricValue, a.observedAt, g.amount);
    }

    // --- the deadline -----------------------------------------------------------------------------------

    /// @notice Sends the whole amount back once the milestone can no longer be reached: the deadline has passed,
    ///         or nobody ever opened the gift or started it. Anyone may call it; the keeper does, daily.
    function expire(uint256 giftId) external nonReentrant {
        // No switch here. While proofs are paused nothing can be saved, so nothing may be taken back either, and
        // that follows from the windows themselves: one that a pause shut closes after the end of that pause,
        // which is still ahead while it runs. A window that had closed before the pause began stays closed. A
        // pause ends by itself and cannot be sent again at once, so a gift always settles, whoever owns the contract.
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();

        if (g.recipient == address(0)) {
            // Nobody ever opened it. The funder waits the dormant delay, never the whole deadline, which for a
            // certificate could be a year away.
            // Past a pause that shut the opening out when the wait ran out.
            if (block.timestamp < _closes(uint256(g.fundedAt) + DORMANT_REFUND_DELAY, PROOF_GRACE)) revert TooEarly();
        } else if (g.shape == SHAPE_HAVE_OR_NOT) {
            // Not until a certificate granted in time can no longer be submitted.
            if (block.timestamp <= _closes(g.deadline, LATE_PROOF_WINDOW)) revert TooEarly();
        } else if (g.identityHash != bytes32(0)) {
            // A climb under way: not until a reading taken before the deadline can no longer arrive.
            if (block.timestamp <= _closes(g.deadline, PROOF_GRACE)) revert TooEarly();
        } else {
            // A climb nobody ever started, measured from the day it was opened, so opening the link late never
            // leaves a recipient with no time at all to take a first reading, and past a pause that shut that
            // first reading out when its wait ran out.
            if (block.timestamp < _closes(uint256(g.claimedAt) + DORMANT_REFUND_DELAY, PROOF_GRACE)) revert TooEarly();
        }

        g.settled = true;
        g.refundable = g.amount;
        emit GiftExpired(giftId, g.amount);
    }

    // --- ending it --------------------------------------------------------------------------------------

    /// @notice The person the gift is for ends it before the target is read. Nothing was earned yet, so the whole
    ///         amount goes back to the refund destination in this same transaction, without waiting for the
    ///         deadline. Only they can do it, and it cannot be undone. A gift already reached cannot be ended: it
    ///         is theirs.
    function endGift(uint256 giftId, uint256 keep, uint256 giveBack) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (msg.sender != g.recipient) revert NotRecipient();
        _end(giftId, g, keep, giveBack);
    }

    /// @notice The same ending, submitted by the relayer with the recipient's signed intent. No attestation is
    ///         involved, and a pause of proofs does not stop it: `expire` waits for a pause to end because it acts
    ///         against the recipient, and this is the recipient's own decision.
    function endGiftWithIntent(uint256 giftId, EndIntent calldata e) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (e.deadline < block.timestamp) revert IntentExpired();
        if (e.nonce != withdrawNonces[giftId]) revert InvalidIntentNonce();
        bytes32 structHash = keccak256(abi.encode(END_TYPEHASH, giftId, e.keep, e.giveBack, e.nonce, e.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), e.signature) != g.recipient) {
            revert InvalidRecipientSignature();
        }
        withdrawNonces[giftId] = e.nonce + 1;
        _end(giftId, g, e.keep, e.giveBack);
    }

    /// @notice What ending the gift now would do: nothing kept, and what would go back. The screen prints the
    ///         figure, and the intent signs it.
    function endPreview(uint256 giftId) external view returns (uint256 keep, uint256 giveBack) {
        Gift storage g = _gift(giftId);
        keep = 0;
        giveBack = g.amount - g.refundedToFunder;
    }

    // --- taking it --------------------------------------------------------------------------------------

    function withdrawEarned(uint256 giftId, address to, uint256 amount) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (msg.sender != g.recipient) revert NotRecipient();
        _withdraw(giftId, g, to, amount);
    }

    /// @notice The recipient signs an intent and Viky's relayer submits it, so they never need anything of their
    ///         own to take what is theirs.
    function withdrawEarnedWithIntent(uint256 giftId, WithdrawIntent calldata i) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (i.deadline < block.timestamp) revert IntentExpired();
        if (i.nonce != withdrawNonces[giftId]) revert InvalidIntentNonce();

        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, giftId, i.to, i.amount, i.nonce, i.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), i.signature) != g.recipient) {
            revert InvalidRecipientSignature();
        }

        withdrawNonces[giftId] = i.nonce + 1;
        _withdraw(giftId, g, i.to, i.amount);
    }

    function refundUnearned(uint256 giftId) external nonReentrant {
        Gift storage g = _gift(giftId);
        uint256 amount = g.refundable;
        if (amount == 0) revert NothingToRefund();
        g.refundable = 0;
        g.refundedToFunder += amount;
        _push(g.refundTo, amount);
        emit UnearnedRefunded(giftId, g.refundTo, amount);
    }

    /// @notice The funder takes it back, only while nobody has opened it.
    function cancel(uint256 giftId) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (msg.sender != g.funder) revert NotFunder();
        if (g.recipient != address(0)) revert AlreadyClaimed();
        if (g.cancelled) revert GiftIsCancelled();
        // Already returned by the deadline: closing it again would pay nothing and say twice that it ended.
        if (g.settled) revert AlreadySettled();
        uint256 amount = g.amount - g.refundedToFunder;
        g.cancelled = true;
        g.refundable = 0;
        g.refundedToFunder += amount;
        _push(g.refundTo, amount);
        emit UnearnedRefunded(giftId, g.refundTo, amount);
        emit GiftCancelled(giftId, amount);
    }

    // --- the owner --------------------------------------------------------------------------------------

    function registerGoal(uint8 goalType, bytes32 providerId, uint8 shape) external onlyOwner {
        if (goalType == 0) revert InvalidGoalType();
        if (providerId == bytes32(0)) revert InvalidProofHash();
        if (shape != SHAPE_CLIMB && shape != SHAPE_HAVE_OR_NOT) revert InvalidShape();
        // A goal is added, never changed: gifts already made keep the condition they were made on.
        if (goalProviders[goalType] != bytes32(0)) revert GoalAlreadyRegistered();
        goalProviders[goalType] = providerId;
        goalShapes[goalType] = shape;
        emit GoalRegistered(goalType, providerId, shape);
    }

    /// @notice Announces a new evidence signer. It stands after `SIGNER_DELAY`, in public, so anybody watching has a
    ///         day to see it coming; the signer in place stands meanwhile. Zero calls an announcement off.
    function setEvidenceSigner(address newSigner) external onlyOwner {
        pendingEvidenceSigner = newSigner;
        evidenceSignerReadyAt = newSigner == address(0) ? 0 : uint64(block.timestamp + SIGNER_DELAY);
        emit EvidenceSignerAnnounced(newSigner, evidenceSignerReadyAt);
    }

    /// @notice Anybody may make an announced signer stand once its wait is over.
    function applyEvidenceSigner() external {
        address newSigner = pendingEvidenceSigner;
        if (newSigner == address(0)) revert NoSignerPending();
        if (block.timestamp < evidenceSignerReadyAt) revert SignerNotReady();
        pendingEvidenceSigner = address(0);
        evidenceSignerReadyAt = 0;
        emit EvidenceSignerUpdated(evidenceSigner, newSigner);
        evidenceSigner = newSigner;
    }

    /// @dev Giving up ownership while proofs are paused used to freeze every gift under way.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipIsNotRenounceable();
    }

    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPauseUpdated(paused);
    }

    /// @notice Pauses proofs and openings, or reopens them. A pause runs `MAX_PAUSE` at most from the moment it is
    ///         sent. It cannot be sent again while it runs, nor for `PAUSE_REST` after it ended, so the funder's
    ///         money always comes back when its milestone was missed.
    function setProofPaused(bool paused) external onlyOwner {
        if (paused) {
            if (block.timestamp <= uint256(proofPausedUntil) + PAUSE_REST) revert PauseTooSoon();
            proofPauseBegan = uint64(block.timestamp);
            proofPausedUntil = uint64(block.timestamp + MAX_PAUSE);
        } else if (block.timestamp < proofPausedUntil) {
            // Only the end of a running pause is recorded: reopening what was already open moves no window.
            proofPausedUntil = uint64(block.timestamp);
        }
        emit ProofPauseUpdated(paused, proofPausedUntil);
    }

    // --- reading ----------------------------------------------------------------------------------------

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return _gift(giftId);
    }

    function earnedBalance(uint256 giftId) external view returns (uint256) {
        Gift storage g = _gift(giftId);
        return g.earned - g.withdrawnByRecipient;
    }

    function refundableBalance(uint256 giftId) external view returns (uint256) {
        return _gift(giftId).refundable;
    }

    // --- internals --------------------------------------------------------------------------------------

    function _withdraw(uint256 giftId, Gift storage g, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > g.earned - g.withdrawnByRecipient) revert InsufficientEarned();
        g.withdrawnByRecipient += amount;
        _push(to, amount);
        emit EarnedWithdrawn(giftId, g.recipient, to, amount);
    }

    function _end(uint256 giftId, Gift storage g, uint256 keep, uint256 giveBack) private {
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        // Not settled and not cancelled means nothing has left the gift yet: the whole amount is still here.
        uint256 givenBack = g.amount - g.refundedToFunder;
        if (keep != 0 || giveBack != givenBack) revert EndTermsChanged();
        g.settled = true;
        g.endedAt = uint64(block.timestamp);
        g.refundedToFunder += givenBack;
        emit GiftEnded(giftId, g.recipient, 0, givenBack);
        _push(g.refundTo, givenBack);
        emit UnearnedRefunded(giftId, g.refundTo, givenBack);
    }

    function _verifyProofSignature(uint256 giftId, ProofAttestation calldata a) private view {
        bytes32 structHash = keccak256(
            abi.encode(
                PROOF_TYPEHASH,
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
        if (ECDSA.recover(_hashTypedDataV4(structHash), a.signature) != evidenceSigner) revert InvalidEvidenceSigner();
    }

    function _validateAttestationWindow(uint64 issuedAt, uint64 expiresAt) private view {
        if (expiresAt < block.timestamp) revert AttestationExpired();
        if (
            issuedAt > block.timestamp + MAX_CLOCK_SKEW || issuedAt > expiresAt
                || uint256(issuedAt) + MAX_ATTESTATION_AGE < block.timestamp
                || uint256(expiresAt) > uint256(issuedAt) + MAX_ATTESTATION_AGE
        ) revert InvalidAttestationWindow();
    }

    function _push(address to, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(to);
        token.safeTransfer(to, amount);
        if (token.balanceOf(to) != balanceBefore + amount) revert TransferShortfall();
    }

    /// @dev When a window of `window` after `moment` closes, the last pause counted.
    ///
    ///      A window that had closed before the pause began stays closed: a pause sent weeks later used to reopen
    ///      it (the review of 2 Oct 2026, R-04). One that was still open has, once the pause is over, the time it
    ///      had left when the pause began, and the whole of it when the pause began before `moment`. Never more
    ///      than `PAUSE_REST`, which is all a pause can take and the soonest another can begin: so a window this
    ///      moved has closed before the next pause, and reading the last pause alone is exact. While a pause runs
    ///      its end is still ahead, so no window that it shut can close.
    function _closes(uint256 moment, uint256 window) private view returns (uint256 close) {
        close = moment + window;
        uint256 began = proofPauseBegan;
        if (began > close) return close;
        uint256 left = close - (began > moment ? began : moment);
        uint256 reopened = uint256(proofPausedUntil) + (left < PAUSE_REST ? left : PAUSE_REST);
        if (reopened > close) close = reopened;
    }

    /// @dev Until when a climb's reading may have been taken: its deadline, or the end of the pause the deadline
    ///      fell inside. The grace after it stays what judges the transaction.
    function _readBy(uint256 deadline) private view returns (uint256) {
        return proofPauseBegan <= deadline && deadline < proofPausedUntil ? uint256(proofPausedUntil) : deadline;
    }

    /// @dev The reading that starts a climb, signed by the account the gift is for. A signature that is missing or
    ///      malformed is refused as one that is not theirs.
    function _verifyStartSignature(uint256 giftId, address recipient, ProofAttestation calldata a) private view {
        bytes32 structHash = keccak256(abi.encode(START_TYPEHASH, giftId, a.identityHash, a.metricValue, a.observedAt));
        (address signer, ECDSA.RecoverError error) =
            ECDSA.tryRecover(_hashTypedDataV4(structHash), a.recipientSignature);
        if (error != ECDSA.RecoverError.NoError || signer != recipient) revert InvalidRecipientSignature();
    }

    /// @dev A signer announced by one owner never stands under the next. Between the hand-over and its acceptance
    ///      the outgoing owner could announce one that stood a day later, whoever owned the contract by then (the
    ///      review of 2 Oct 2026, R-05).
    function _transferOwnership(address newOwner) internal override {
        if (pendingEvidenceSigner != address(0)) {
            pendingEvidenceSigner = address(0);
            evidenceSignerReadyAt = 0;
            emit EvidenceSignerAnnounced(address(0), 0);
        }
        super._transferOwnership(newOwner);
    }

    /// @dev The UTC day a moment falls in, as the daily contract computes it. A granting day is a day, and
    ///      comparing it against an hour is what refused a certificate granted on the funder's own morning.
    function _dayOf(uint256 timestamp) private pure returns (uint32) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(timestamp / DAY);
    }

    function _gift(uint256 giftId) private view returns (Gift storage g) {
        g = gifts[giftId];
        if (g.funder == address(0)) revert GiftNotFound();
    }
}
