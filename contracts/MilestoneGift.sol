// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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

/// @title  MilestoneGift
/// @notice A gift for one thing, not for a habit. A funder sets an amount aside in someone's name for a single
///         verified milestone, with a deadline: reach it in time and the whole amount is theirs, let the
///         deadline pass and the whole amount goes back. Nothing accrues, nothing is credited in parts.
/// @dev    The companion of GiftEscrow, which pays a day at a time. The two are separate contracts on purpose
///         (DECISIONS.md D36): the shape of the release is written into the contract, not chosen per gift, and
///         trying to serve both from one made neither honest. What they share is deliberate and identical: the
///         funder's single EIP-3009 signature is both the payment and the consent to these exact terms, the
///         goal registry maps a goal type to the provider its proofs must carry, and every proof is attested
///         off chain by the evidence signer and checked here for signer, freshness, replay and identity.
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
contract MilestoneGift is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant CONTRACT_SCHEMA_ID = 1;
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(uint256 giftId,address recipient,bytes32 contactHash,uint64 issuedAt,uint64 expiresAt)");
    bytes32 public constant PROOF_TYPEHASH = keccak256(
        "Proof(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 eventAt,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)"
    );
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)");
    /// @dev Distinct from the daily contract's tag, so one contract's funding signature can never fund the
    ///      other's gift even for identical terms.
    bytes32 public constant FUND_NONCE_TAG = keccak256("viky.milestone.fund.v1");

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
    /// @dev A reading taken before the deadline may still be submitted for a while after it, so the keeper's
    ///      call to `expire` can never beat a proof that was verifiably in time. The deadline judges the
    ///      reading; this grace judges the transaction. The daily contract protects its catch-up the same way.
    uint256 public constant PROOF_GRACE = 6 hours;
    /// @dev Milestone gifts are numbered from here up, so an id can never mean two different gifts across the
    ///      two contracts. Records elsewhere key on the id alone, and a collision would merge two gifts.
    uint256 public constant FIRST_ID_FLOOR = 1_000_000;

    /// @dev Something measured that moves: the first reading is the start, and the climb is what pays.
    uint8 public constant SHAPE_CLIMB = 0;
    /// @dev Something granted once, with a date: no start, and the granting day is what pays.
    uint8 public constant SHAPE_HAVE_OR_NOT = 1;
    uint256 private constant DAY = 1 days;

    /// @dev `salt` lets two gifts with identical terms still get distinct funding nonces.
    struct MilestoneParams {
        address funder;
        address refundTo;
        bytes32 recipientContactHash;
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

    struct ClaimAttestation {
        address recipient;
        bytes32 contactHash;
        uint64 issuedAt;
        uint64 expiresAt;
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
    }

    struct WithdrawIntent {
        address to;
        uint256 amount;
        uint256 nonce;
        uint64 deadline;
        bytes signature;
    }

    struct Gift {
        address funder;
        address refundTo;
        address recipient;
        bytes32 recipientContactHash;
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
    }

    IERC20 public immutable token;
    address public evidenceSigner;
    /// @dev Milestone gifts carry their own numbering, distinct from the daily contract's.
    uint256 public nextGiftId;
    bool public creationPaused;
    bool public proofPaused;

    mapping(uint256 => Gift) private gifts;
    mapping(uint8 => bytes32) public goalProviders;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(uint256 => uint256) public withdrawNonces;

    event GoalRegistered(uint8 indexed goalType, bytes32 indexed providerId);
    event GiftCreated(
        uint256 indexed giftId,
        address indexed funder,
        address refundTo,
        bytes32 indexed recipientContactHash,
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
    event EarnedWithdrawn(uint256 indexed giftId, address indexed recipient, address indexed to, uint256 amount);
    event UnearnedRefunded(uint256 indexed giftId, address indexed refundTo, uint256 amount);
    event GiftCancelled(uint256 indexed giftId, uint256 refunded);
    event EvidenceSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CreationPauseUpdated(bool paused);
    event ProofPauseUpdated(bool paused);

    error InvalidAddress();
    error InvalidGiftId();
    error InvalidTokenDecimals();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidTarget();
    error InvalidContactHash();
    error UnknownGoal();
    error InvalidGoalType();
    error InvalidAuthorizationNonce();
    error TransferShortfall();
    error GiftNotFound();
    error AlreadyClaimed();
    error NotClaimed();
    error ContactMismatch();
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

    constructor(IERC20 token_, address evidenceSigner_, uint256 firstGiftId_) EIP712("Viky Milestone", "1") {
        if (address(token_) == address(0) || evidenceSigner_ == address(0)) revert InvalidAddress();
        if (IERC20Metadata(address(token_)).decimals() != 6) revert InvalidTokenDecimals();
        if (firstGiftId_ < FIRST_ID_FLOOR) revert InvalidGiftId();
        token = token_;
        evidenceSigner = evidenceSigner_;
        nextGiftId = firstGiftId_;
        // Fail closed: the deployer opens it once the deployment has been checked.
        creationPaused = true;
        proofPaused = true;
    }

    // --- terms ------------------------------------------------------------------------------------------

    function hashParams(MilestoneParams calldata p) public pure returns (bytes32) {
        return keccak256(
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
        if (p.recipientContactHash == bytes32(0)) revert InvalidContactHash();
        if (goalProviders[p.goalType] == bytes32(0)) revert UnknownGoal();
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
        g.recipientContactHash = p.recipientContactHash;
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
            p.recipientContactHash,
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

    /// @notice Binds the recipient's account. The evidence signer attests that whoever holds this account opened
    ///         the claim link sent to the contact the funder named.
    function claim(uint256 giftId, ClaimAttestation calldata c) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        if (g.recipient != address(0)) revert AlreadyClaimed();
        if (c.recipient == address(0)) revert InvalidAddress();
        if (c.contactHash != g.recipientContactHash) revert ContactMismatch();
        _validateAttestationWindow(c.issuedAt, c.expiresAt);

        bytes32 structHash =
            keccak256(abi.encode(CLAIM_TYPEHASH, giftId, c.recipient, c.contactHash, c.issuedAt, c.expiresAt));
        if (ECDSA.recover(_hashTypedDataV4(structHash), c.signature) != evidenceSigner) revert InvalidEvidenceSigner();

        g.recipient = c.recipient;
        g.claimedAt = uint64(block.timestamp);
        emit GiftClaimed(giftId, c.recipient);
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
        if (proofPaused) revert ProofIsPaused();
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        if (a.recipient != g.recipient) revert IdentityMismatch();
        if (a.providerId != goalProviders[g.goalType]) revert ProviderMismatch();
        if (a.nullifier == bytes32(0) || a.identityHash == bytes32(0)) revert InvalidProofHash();
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
            // Nothing to start: the page only exists once the thing is granted. What pays is the day it says.
            if (a.identityHash != g.subject) revert IdentityMismatch();
            if (a.eventAt < g.fundedAt) revert EarnedBeforeTheGift();
            if (a.eventAt > g.deadline) revert DeadlinePassed();
            if (block.timestamp > uint256(g.deadline) + PROOF_GRACE) revert DeadlinePassed();
            if (a.metricValue < g.target) revert NotThereYet();
            g.lastProofAt = a.observedAt;
            g.settled = true;
            g.earned = g.amount;
            emit MilestoneReached(giftId, g.recipient, a.metricValue, a.eventAt, g.amount);
            return;
        }

        if (g.identityHash == bytes32(0)) {
            // Recorded whatever it says. Refusing here would revert, leaving no memory of the reading, and the
            // recipient could keep trying until one suited them. This is the rule the climb rests on.
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
        if (uint256(a.observedAt) > g.deadline) revert DeadlinePassed();
        if (block.timestamp > uint256(g.deadline) + PROOF_GRACE) revert DeadlinePassed();
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
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
        if (g.settled) revert AlreadySettled();
        if (g.refundable > 0 || g.refundedToFunder > 0) revert AlreadySettled();

        bool started = g.shape == SHAPE_HAVE_OR_NOT || g.identityHash != bytes32(0);
        if (
            started && g.recipient == address(0)
                && block.timestamp >= uint256(g.fundedAt) + DORMANT_REFUND_DELAY + PROOF_GRACE
        ) {
            // Nobody ever opened it. The funder waits the dormant delay, never the whole deadline.
            g.settled = true;
            g.refundable = g.amount;
            emit GiftExpired(giftId, g.amount);
            return;
        }
        if (started) {
            // Not until a reading taken before the deadline can no longer arrive.
            if (block.timestamp <= uint256(g.deadline) + PROOF_GRACE) revert TooEarly();
        } else {
            // Measured from the claim once there is one: opening the link on the last day must not leave a
            // recipient with no time at all to take a first reading.
            uint256 from = g.claimedAt == 0 ? g.fundedAt : g.claimedAt;
            // The same grace as the deadline: the keeper must not land in the same block as a first reading.
            if (block.timestamp < from + DORMANT_REFUND_DELAY + PROOF_GRACE) revert TooEarly();
        }

        g.settled = true;
        g.refundable = g.amount;
        emit GiftExpired(giftId, g.amount);
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

    function registerGoal(uint8 goalType, bytes32 providerId) external onlyOwner {
        if (goalType == 0) revert InvalidGoalType();
        if (providerId == bytes32(0)) revert InvalidProofHash();
        goalProviders[goalType] = providerId;
        emit GoalRegistered(goalType, providerId);
    }

    function setEvidenceSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAddress();
        emit EvidenceSignerUpdated(evidenceSigner, newSigner);
        evidenceSigner = newSigner;
    }

    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPauseUpdated(paused);
    }

    function setProofPaused(bool paused) external onlyOwner {
        proofPaused = paused;
        emit ProofPauseUpdated(paused);
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

    function _gift(uint256 giftId) private view returns (Gift storage g) {
        g = gifts[giftId];
        if (g.funder == address(0)) revert GiftNotFound();
    }
}
