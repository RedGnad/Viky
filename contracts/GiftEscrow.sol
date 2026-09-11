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

/// @title  GiftEscrow
/// @notice A conditional gift. A funder allocates AUSD in a recipient's name; the money becomes the recipient's
///         as verified progress accrues, one day at a time, and every missed day goes back to the funder (or to
///         a charity the funder chose). Nobody else ever profits from a missed day.
/// @dev    One contract, many gifts. Verification is off-chain: the server verifies a Reclaim proof with its TEE
///         attestation and the evidence signer attests the result (EIP-712 `CheckIn`); the contract checks the
///         signer, the freshness window, the nullifier, the identity binding and does the day arithmetic. A
///         compromised evidence signer could attest progress that never happened, exactly as documented for
///         Lock-in's escrows; the judges page discloses this trust assumption in one sentence.
///         Guards ported from Lock-in's LockInDuolingoEscrow: attestation freshness, clock skew, nullifiers,
///         identity binding, pausable creation and check-in, evidence signer rotation, typed errors.
contract GiftEscrow is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant CONTRACT_SCHEMA_ID = 1;
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(uint256 giftId,address recipient,bytes32 contactHash,uint64 issuedAt,uint64 expiresAt)");
    bytes32 public constant CHECK_IN_TYPEHASH = keccak256(
        "CheckIn(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)"
    );
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)");
    /// @dev The funder's EIP-3009 nonce is derived from the gift terms, so one signature is both the payment and
    ///      the consent to those exact terms (DECISIONS.md D12).
    bytes32 public constant FUND_NONCE_TAG = keccak256("viky.fund.v1");

    uint256 public constant MIN_AMOUNT = 1_000_000; // 1 AUSD
    uint256 public constant MAX_AMOUNT = 100_000_000_000; // 100,000 AUSD
    uint32 public constant MIN_DURATION_DAYS = 7;
    uint32 public constant MAX_DURATION_DAYS = 90;
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes;
    uint256 public constant MAX_CLOCK_SKEW = 1 minutes;
    /// @dev A day can be covered until the end of the next day (DECISIONS.md D13), and is judged by the reading
    ///      taken the morning after that: it becomes drainable only once that reading has had time to run, so a
    ///      drain called just after midnight can never pre-empt a catch-up (DECISIONS.md D30).
    uint256 public constant READING_GRACE = 6 hours;
    uint256 public constant CATCH_UP_WINDOW = 1 days + READING_GRACE;
    uint256 public constant UNCLAIMED_REFUND_DELAY = 14 days;
    uint256 private constant DAY = 1 days;

    /// @dev `salt` is chosen by the funder's app so two gifts with identical terms still get distinct funding
    ///      nonces (an EIP-3009 authorization can be used once).
    struct GiftParams {
        address funder;
        address refundTo;
        bytes32 recipientContactHash;
        uint8 goalType;
        uint32 dailyTarget;
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

    /// @dev Provider-neutral: `providerId` must match the registry entry of the gift's goal type, and the goal
    ///      type fixes how `metricValue` is read (Duolingo total XP, Strava metres, GitHub contributions).
    struct CheckInAttestation {
        address recipient;
        bytes32 identityHash;
        bytes32 providerId;
        uint64 metricValue;
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
        uint32 dailyTarget;
        uint32 durationDays;
        uint32 startDay;
        uint32 endDay;
        uint32 creditedDays;
        uint32 drainedDays;
        uint32 settledThroughDay;
        uint256 amount;
        uint256 perDay;
        uint256 withdrawnByRecipient;
        uint256 refundedToFunder;
        uint256 refundable;
        bytes32 identityHash;
        uint64 baselineValue;
        uint64 lastCheckInAt;
        uint64 fundedAt;
        uint64 claimedAt;
        bool cancelled;
        bool finalised;
    }

    IERC20 public immutable token;
    address public evidenceSigner;
    /// @dev Starts where the previous deployment stopped, so a gift id names one gift across Viky's deployments.
    uint256 public nextGiftId;
    bool public creationPaused;
    bool public checkInPaused;

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
        uint32 dailyTarget,
        uint32 durationDays,
        uint256 amount,
        uint256 perDay
    );
    event GiftFunded(uint256 indexed giftId, uint256 amount);
    event GiftClaimed(uint256 indexed giftId, address indexed recipient);
    event IdentityBound(uint256 indexed giftId, address indexed recipient, bytes32 indexed identityHash);
    event CheckInAccepted(
        uint256 indexed giftId,
        address indexed recipient,
        uint32 fromDay,
        uint32 toDay,
        uint32 creditedDays,
        uint64 metricValue,
        uint64 observedAt
    );
    event DaysDrained(uint256 indexed giftId, uint32 fromDay, uint32 toDay, uint32 missedDays, uint256 amount);
    event EarnedWithdrawn(uint256 indexed giftId, address indexed recipient, address indexed to, uint256 amount);
    event UnearnedRefunded(uint256 indexed giftId, address indexed refundTo, uint256 amount);
    event GiftCancelled(uint256 indexed giftId, uint256 refunded);
    event GiftFinalised(uint256 indexed giftId, uint32 creditedDays, uint32 drainedDays, uint256 dust);
    event EvidenceSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CreationPauseUpdated(bool paused);
    event CheckInPauseUpdated(bool paused);

    error InvalidAddress();
    error InvalidGiftId();
    error InvalidTokenDecimals();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidDailyTarget();
    error InvalidContactHash();
    error UnknownGoal();
    error InvalidGoalType();
    error InvalidAuthorizationNonce();
    error TransferShortfall();
    error GiftNotFound();
    error CreationIsPaused();
    error CheckInIsPaused();
    error AlreadyClaimed();
    error NotClaimed();
    error ContactMismatch();
    error GiftIsCancelled();
    error AlreadyFinalised();
    error InvalidEvidenceSigner();
    error AttestationExpired();
    error InvalidAttestationWindow();
    error InvalidProofHash();
    error NullifierAlreadyUsed();
    error ProviderMismatch();
    error IdentityMismatch();
    error NoBaseline();
    error StaleObservation();
    error MetricDecreased();
    error OutsideWindow();
    error NothingToCredit();
    error InsufficientProgress();
    error NothingToDrain();
    error InsufficientEarned();
    error NotRecipient();
    error InvalidRecipientSignature();
    error IntentExpired();
    error InvalidIntentNonce();
    error NothingToRefund();
    error NotFunder();
    error CancellationClosed();
    error FinalisationTooEarly();

    constructor(IERC20 token_, address evidenceSigner_, uint256 firstGiftId_) EIP712("Viky Gift", "1") {
        if (address(token_) == address(0) || evidenceSigner_ == address(0)) revert InvalidAddress();
        if (IERC20Metadata(address(token_)).decimals() != 6) revert InvalidTokenDecimals();
        if (firstGiftId_ == 0) revert InvalidGiftId();
        token = token_;
        evidenceSigner = evidenceSigner_;
        nextGiftId = firstGiftId_;
        // Fail closed: the deployer unpauses once the deployment has been checked.
        creationPaused = true;
        checkInPaused = true;
    }

    // --- terms ------------------------------------------------------------------------------------------

    function hashGiftParams(GiftParams calldata p) public pure returns (bytes32) {
        return keccak256(
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
        );
    }

    /// @notice The EIP-3009 nonce the funder must sign for these exact terms.
    function fundingNonce(GiftParams calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(FUND_NONCE_TAG, hashGiftParams(p)));
    }

    // --- lifecycle --------------------------------------------------------------------------------------

    /// @notice Creates and funds a gift in one transaction. The relayer submits; the funder's single EIP-3009
    ///         signature pays and consents to the terms, because its nonce is derived from them.
    function createGift(GiftParams calldata p, Authorization calldata a)
        external
        nonReentrant
        returns (uint256 giftId)
    {
        if (creationPaused) revert CreationIsPaused();
        if (p.funder == address(0) || p.refundTo == address(0)) revert InvalidAddress();
        if (p.recipientContactHash == bytes32(0)) revert InvalidContactHash();
        if (goalProviders[p.goalType] == bytes32(0)) revert UnknownGoal();
        if (p.dailyTarget == 0) revert InvalidDailyTarget();
        if (p.durationDays < MIN_DURATION_DAYS || p.durationDays > MAX_DURATION_DAYS) revert InvalidDuration();
        if (p.amount < MIN_AMOUNT || p.amount > MAX_AMOUNT) revert InvalidAmount();
        if (a.nonce != fundingNonce(p)) revert InvalidAuthorizationNonce();

        uint256 perDay = p.amount / p.durationDays;
        if (perDay == 0) revert InvalidAmount();

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
        g.dailyTarget = p.dailyTarget;
        g.durationDays = p.durationDays;
        g.amount = p.amount;
        g.perDay = perDay;
        g.fundedAt = uint64(block.timestamp);

        emit GiftCreated(
            giftId,
            p.funder,
            p.refundTo,
            p.recipientContactHash,
            p.goalType,
            p.dailyTarget,
            p.durationDays,
            p.amount,
            perDay
        );
        emit GiftFunded(giftId, p.amount);
    }

    /// @notice Binds the recipient's account to the gift. The evidence signer attests that the account holder
    ///         opened the claim link sent to the contact the funder named.
    function claim(uint256 giftId, ClaimAttestation calldata c) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
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

    /// @notice Records verified progress. The first accepted check-in is the baseline: it binds the identity,
    ///         anchors the metric and opens the window the next UTC day. Later check-ins judge only days that are
    ///         over: a reading observed on day `d` credits the earliest open days up to `d - 1`, never `d` itself,
    ///         so a lesson taken on the last day counts when it is read the next morning, and progress made
    ///         before the window can never pay for a missed window day (DECISIONS.md D30). A binge inside the
    ///         catch-up window is allowed, partial progress below one day carries to the next check-in, and
    ///         excess beyond the open days is discarded (never banked).
    function checkIn(uint256 giftId, CheckInAttestation calldata a) external nonReentrant {
        if (checkInPaused) revert CheckInIsPaused();
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.finalised) revert AlreadyFinalised();
        if (a.recipient != g.recipient) revert IdentityMismatch();
        if (a.providerId != goalProviders[g.goalType]) revert ProviderMismatch();
        if (a.nullifier == bytes32(0) || a.identityHash == bytes32(0)) revert InvalidProofHash();
        if (usedNullifiers[a.nullifier]) revert NullifierAlreadyUsed();
        _validateAttestationWindow(a.issuedAt, a.expiresAt);
        if (uint256(a.observedAt) > block.timestamp + MAX_CLOCK_SKEW) revert InvalidAttestationWindow();
        if (a.observedAt <= g.lastCheckInAt) revert StaleObservation();
        _verifyCheckInSignature(giftId, a);
        usedNullifiers[a.nullifier] = true;

        if (g.identityHash == bytes32(0)) {
            g.identityHash = a.identityHash;
            g.baselineValue = a.metricValue;
            g.lastCheckInAt = a.observedAt;
            uint32 startDay = _dayOf(a.observedAt) + 1;
            g.startDay = startDay;
            g.endDay = startDay + g.durationDays - 1;
            g.settledThroughDay = startDay - 1;
            emit IdentityBound(giftId, g.recipient, a.identityHash);
            emit CheckInAccepted(giftId, g.recipient, startDay, startDay, 0, a.metricValue, a.observedAt);
            return;
        }

        if (a.identityHash != g.identityHash) revert IdentityMismatch();
        if (a.metricValue < g.baselineValue) revert MetricDecreased();
        uint32 lastCompleteDay = _dayOf(a.observedAt) - 1;
        if (lastCompleteDay < g.startDay) revert OutsideWindow();
        uint32 upper = lastCompleteDay > g.endDay ? g.endDay : lastCompleteDay;
        if (upper <= g.settledThroughDay) revert NothingToCredit();

        uint32 elapsed = upper - g.settledThroughDay;
        uint256 possible = uint256(a.metricValue - g.baselineValue) / g.dailyTarget;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 credit = possible >= elapsed ? elapsed : uint32(possible);
        if (credit == 0) revert InsufficientProgress();
        if (possible > elapsed) {
            g.baselineValue = a.metricValue;
        } else {
            g.baselineValue += uint64(credit) * g.dailyTarget;
        }
        uint32 fromDay = g.settledThroughDay + 1;
        g.settledThroughDay += credit;
        g.creditedDays += credit;
        g.lastCheckInAt = a.observedAt;
        emit CheckInAccepted(giftId, g.recipient, fromDay, fromDay + credit - 1, credit, a.metricValue, a.observedAt);
    }

    /// @notice Marks every open day whose catch-up window has elapsed as missed and moves its share to the
    ///         refundable bucket. Anyone may call it; the keeper does, daily.
    function drain(uint256 giftId) external {
        Gift storage g = _gift(giftId);
        if (g.startDay == 0) revert NoBaseline();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.finalised) revert AlreadyFinalised();
        uint32 upper = _lastDrainableDay();
        if (upper > g.endDay) upper = g.endDay;
        if (upper <= g.settledThroughDay) revert NothingToDrain();
        uint32 missed = upper - g.settledThroughDay;
        uint32 fromDay = g.settledThroughDay + 1;
        g.settledThroughDay = upper;
        g.drainedDays += missed;
        uint256 amount = uint256(missed) * g.perDay;
        g.refundable += amount;
        emit DaysDrained(giftId, fromDay, upper, missed, amount);
    }

    /// @notice The recipient withdraws what is already theirs.
    function withdrawEarned(uint256 giftId, address to, uint256 amount) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (msg.sender != g.recipient) revert NotRecipient();
        _withdraw(giftId, g, to, amount);
    }

    /// @notice The same withdrawal, submitted by the relayer with the recipient's signed intent.
    function withdrawEarnedWithIntent(uint256 giftId, WithdrawIntent calldata w) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (w.deadline < block.timestamp) revert IntentExpired();
        if (w.nonce != withdrawNonces[giftId]) revert InvalidIntentNonce();
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, giftId, w.to, w.amount, w.nonce, w.deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), w.signature) != g.recipient) {
            revert InvalidRecipientSignature();
        }
        withdrawNonces[giftId] = w.nonce + 1;
        _withdraw(giftId, g, w.to, w.amount);
    }

    /// @notice Sends the unearned money back to the refund destination: drained days, and everything when the
    ///         gift was never claimed, or never connected, within the refund delay. Anyone may call it: the money
    ///         can only ever go to `refundTo`.
    function refundUnearned(uint256 giftId) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (!g.cancelled && !g.finalised) {
            bool neverClaimed =
                g.recipient == address(0) && block.timestamp >= uint256(g.fundedAt) + UNCLAIMED_REFUND_DELAY;
            bool neverConnected = g.recipient != address(0) && g.startDay == 0
                && block.timestamp >= uint256(g.claimedAt) + UNCLAIMED_REFUND_DELAY;
            if (neverClaimed || neverConnected) {
                g.cancelled = true;
                g.refundable = g.amount;
                emit GiftCancelled(giftId, g.amount - g.refundedToFunder);
            }
        }
        uint256 amount = g.refundable - g.refundedToFunder;
        if (amount == 0) revert NothingToRefund();
        g.refundedToFunder += amount;
        _push(g.refundTo, amount);
        emit UnearnedRefunded(giftId, g.refundTo, amount);
    }

    /// @notice The funder takes the gift back before anyone claimed it.
    function cancel(uint256 giftId) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (msg.sender != g.funder) revert NotFunder();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.recipient != address(0)) revert CancellationClosed();
        g.cancelled = true;
        g.refundable = g.amount;
        uint256 amount = g.amount - g.refundedToFunder;
        g.refundedToFunder = g.amount;
        _push(g.refundTo, amount);
        emit GiftCancelled(giftId, amount);
        emit UnearnedRefunded(giftId, g.refundTo, amount);
    }

    /// @notice Settles the remaining days as missed once the last day's catch-up window has elapsed, and moves
    ///         the rounding dust to the refund bucket.
    function finalise(uint256 giftId) external {
        Gift storage g = _gift(giftId);
        if (g.startDay == 0) revert NoBaseline();
        if (g.cancelled) revert GiftIsCancelled();
        if (g.finalised) revert AlreadyFinalised();
        if (_lastDrainableDay() < g.endDay) revert FinalisationTooEarly();
        if (g.settledThroughDay < g.endDay) {
            uint32 missed = g.endDay - g.settledThroughDay;
            uint32 fromDay = g.settledThroughDay + 1;
            g.settledThroughDay = g.endDay;
            g.drainedDays += missed;
            uint256 amount = uint256(missed) * g.perDay;
            g.refundable += amount;
            emit DaysDrained(giftId, fromDay, g.endDay, missed, amount);
        }
        uint256 dust = g.amount - g.perDay * g.durationDays;
        g.refundable += dust;
        g.finalised = true;
        emit GiftFinalised(giftId, g.creditedDays, g.drainedDays, dust);
    }

    // --- views ------------------------------------------------------------------------------------------

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return _gift(giftId);
    }

    function earnedBalance(uint256 giftId) external view returns (uint256) {
        Gift storage g = _gift(giftId);
        return uint256(g.creditedDays) * g.perDay - g.withdrawnByRecipient;
    }

    function refundableBalance(uint256 giftId) external view returns (uint256) {
        Gift storage g = _gift(giftId);
        return g.refundable - g.refundedToFunder;
    }

    function dayOf(uint256 timestamp) external pure returns (uint32) {
        return _dayOf(timestamp);
    }

    function lastDrainableDay() external view returns (uint32) {
        return _lastDrainableDay();
    }

    // --- owner ------------------------------------------------------------------------------------------

    /// @notice A new verified service is a new registry entry, never a new contract.
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

    function setCheckInPaused(bool paused) external onlyOwner {
        checkInPaused = paused;
        emit CheckInPauseUpdated(paused);
    }

    // --- internals --------------------------------------------------------------------------------------

    function _withdraw(uint256 giftId, Gift storage g, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidAddress();
        uint256 available = uint256(g.creditedDays) * g.perDay - g.withdrawnByRecipient;
        if (amount == 0 || amount > available) revert InsufficientEarned();
        g.withdrawnByRecipient += amount;
        _push(to, amount);
        emit EarnedWithdrawn(giftId, g.recipient, to, amount);
    }

    function _verifyCheckInSignature(uint256 giftId, CheckInAttestation calldata a) private view {
        bytes32 structHash = keccak256(
            abi.encode(
                CHECK_IN_TYPEHASH,
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

    function _dayOf(uint256 timestamp) private pure returns (uint32) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(timestamp / DAY);
    }

    /// @dev Day `d` is drainable once `block.timestamp >= dayStart(d) + 1 day + CATCH_UP_WINDOW`.
    function _lastDrainableDay() private view returns (uint32) {
        if (block.timestamp < CATCH_UP_WINDOW + DAY) return 0;
        return _dayOf(block.timestamp - CATCH_UP_WINDOW) - 1;
    }
}
