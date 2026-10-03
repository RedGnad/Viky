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

/// @title  GiftEscrowV3
/// @notice A conditional gift. A funder allocates AUSD in a recipient's name; the money becomes the recipient's
///         as verified progress accrues, one day at a time, and every missed day goes back to the funder (or to
///         a charity the funder chose). Nobody else ever profits from a missed day.
/// @dev    One contract, many gifts. Verification is off-chain: the server verifies a Reclaim proof with its TEE
///         attestation and the evidence signer attests the result (EIP-712 `CheckIn`); the contract checks the
///         signer, the freshness window, the nullifier, the identity binding and does the day arithmetic. A
///         compromised evidence signer could attest progress that never happened on a gift that is open, and
///         could stop a gift under way for good: one reading far above the truth credits the days that are open
///         and moves the baseline where no real reading reaches it again, under any later signer. The days left
///         then go back to the funder as they pass, or at once if the recipient ends the gift. The judges page
///         discloses this trust assumption.
///
///         What the third version changes, and nothing else (the founder, 3 Oct 2026): **a day is paid the day it
///         is read.** On the second version a reading judged only days that were over, so a lesson was paid the
///         morning after, and one taken the day the account was connected a day later still. Here the first day
///         is the day the account is connected, and a reading credits the open days up to its own day, the oldest
///         first, and never a day that has not begun. Once every open day is paid nothing is set aside, neither
///         what is past the target nor what is under one. Everything else is the second version's, word for
///         word: the catch-up window, the missed days that go back, the signatures, the pause, the owner's
///         bounds. A gift made on the second version stays there, under its rule.
///
///         What a cumulative figure cannot say is when the progress was made. A day paid in the morning by one
///         lesson, then a second lesson that afternoon: the first reading of the next day finds one target of
///         progress and pays that day, with no lesson taken on it. One lesson never pays two days, and no more
///         days are paid than lessons were taken. This is accepted, and said on the judges page.
///
///         What the second version changed, each from the audit of 1 Oct 2026:
///
///         **Opening a gift takes the key of its link.** The funder's signed terms carry the address of an
///         opening key, made in the funder's browser from the secret the link carries. `claim` takes that key's
///         signature over the gift, the account that opens it and a deadline. The evidence signer has no say in
///         who opens a gift any more: on the first version that one key could open an unopened gift in its own
///         name and prove it in the same block.
///
///         **The person the gift is for can end it.** What was counted stays theirs; everything else goes back
///         to the refund destination in the same transaction, and the ending cannot be undone.
///
///         **The owner is bounded.** Ownership moves in two steps and cannot be given up, and a signer one owner
///         announced never stands under the next. A new evidence signer is announced and stands a day later. A
///         goal is added and never changed. A pause of check-ins covers opening too, ends by itself after seven
///         days, cannot be sent again while it runs nor for seven days after it ended, and holds every open day
///         rather than taking it: no day is settled as missed from the start of a pause until one catch-up
///         window after its end.
///
///         **The first reading is the recipient's too.** It binds an identity and a baseline for good, so the
///         account the gift is for signs it beside the evidence signer (the review of 2 Oct 2026): that one key
///         alone could otherwise bind an identity nobody holds, and no real reading would ever count.
///
///         **The catch-up window is the contract's own rule.** A check-in first settles the days whose window
///         has elapsed, so it can never credit one of them, and a reading more than thirty minutes old is refused.
contract GiftEscrowV3 is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant CONTRACT_SCHEMA_ID = 3;
    /// @dev What the key of the gift's link signs to open it: the gift, the account it opens for, and until when.
    bytes32 public constant OPEN_TYPEHASH = keccak256("Open(uint256 giftId,address recipient,uint64 deadline)");
    bytes32 public constant CHECK_IN_TYPEHASH = keccak256(
        "CheckIn(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)"
    );
    /// @dev What the account the gift is for signs beside the evidence signer on the first reading, and on that one
    ///      only: the identity it binds, the value it starts from and the moment it was read. It names the reading
    ///      to the unit, so whoever sees the signature on its way can send that reading and no other.
    bytes32 public constant START_TYPEHASH =
        keccak256("Start(uint256 giftId,bytes32 identityHash,uint64 metricValue,uint64 observedAt)");
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)");
    /// @dev What the person the gift is for signs to end it: the two amounts their screen showed, to the unit. The
    ///      contract works both out again and refuses if either differs, so "You keep X, Y goes back" is the
    ///      transaction and never an estimate.
    bytes32 public constant END_TYPEHASH =
        keccak256("End(uint256 giftId,uint256 keep,uint256 giveBack,uint256 nonce,uint64 deadline)");
    /// @dev The funder's EIP-3009 nonce is derived from the gift terms, so one signature is both the payment and
    ///      the consent to those exact terms (DECISIONS.md D12). A tag of its own, so terms signed for an earlier
    ///      version can never be read as terms of this one.
    bytes32 public constant FUND_NONCE_TAG = keccak256("viky.fund.v3");

    uint256 public constant MIN_AMOUNT = 1_000_000; // 1 AUSD
    uint256 public constant MAX_AMOUNT = 100_000_000_000; // 100,000 AUSD
    uint32 public constant MIN_DURATION_DAYS = 7;
    uint32 public constant MAX_DURATION_DAYS = 90;
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes;
    uint256 public constant MAX_CLOCK_SKEW = 1 minutes;
    /// @dev How old the reading itself may be when its check-in arrives. A reading is taken, attested and relayed
    ///      within minutes; one older than this is somebody keeping a reading for the moment it suits.
    uint256 public constant MAX_OBSERVATION_AGE = 30 minutes;
    /// @dev A day can be covered until the end of the next day (DECISIONS.md D13), and a reading taken the morning
    ///      after that still counts for it: it becomes drainable only once that reading has had time to run, so a
    ///      drain called just after midnight can never pre-empt a catch-up (DECISIONS.md D30).
    uint256 public constant READING_GRACE = 6 hours;
    uint256 public constant CATCH_UP_WINDOW = 1 days + READING_GRACE;
    uint256 public constant UNCLAIMED_REFUND_DELAY = 14 days;
    /// @dev The longest a pause of check-ins can run. One that runs cannot be sent again.
    uint256 public constant MAX_PAUSE = 7 days;
    /// @dev How long after the end of a pause the next one must wait. An announced signer stands in a day, so
    ///      seven days of pause are enough for an emergency; without the rest a pause sent again and again held
    ///      the funder's unearned money for as long as the owner wished, and one flicked on and off stopped the
    ///      clock of missed days for good (the review of 2 Oct 2026, R-02 and R-03).
    uint256 public constant PAUSE_REST = 7 days;
    /// @dev How long an announced evidence signer waits before it stands.
    uint256 public constant SIGNER_DELAY = 24 hours;
    uint256 private constant DAY = 1 days;

    /// @dev `salt` is chosen by the funder's app so two gifts with identical terms still get distinct funding
    ///      nonces (an EIP-3009 authorization can be used once).
    struct GiftParams {
        address funder;
        address refundTo;
        /// @dev The address of the key that opens this gift. Its private half is derived, in the funder's
        ///      browser, from the secret the gift's link carries: whoever holds the link holds the key.
        address openingKey;
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

    /// @dev Signed by the gift's opening key. Naming the recipient is what stops a relayer, or anybody watching,
    ///      from opening the gift for another account with a signature they did not make.
    struct OpenIntent {
        address recipient;
        uint64 deadline;
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
        /// @dev The recipient's own signature over `Start`, on the first reading of a gift. Empty on every other:
        ///      the readings that follow are taken by a pass, with nobody there to sign.
        bytes recipientSignature;
    }

    struct WithdrawIntent {
        address to;
        uint256 amount;
        uint256 nonce;
        uint64 deadline;
        bytes signature;
    }

    /// @dev `keep` is everything the gift has made the recipient's so far, taken out or not. `giveBack` is what
    ///      leaves for the refund destination in this transaction. The nonce is the gift's one intent counter,
    ///      shared with `Withdraw`, so any intent signed later retires every one signed before it.
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
        /// @dev When the recipient ended it, or zero. An ended gift is finalised: nothing is read for it any more.
        uint64 endedAt;
        /// @dev The days that were neither counted nor missed when it was ended: given back, not failed.
        uint32 givenBackDays;
    }

    IERC20 public immutable token;
    address public evidenceSigner;
    /// @dev Starts where the previous deployment stopped, so a gift id names one gift across Viky's deployments.
    uint256 public nextGiftId;
    bool public creationPaused;
    /// @dev A pause of check-ins: when it began, and when it ends (in the future while one runs, never further
    ///      than `MAX_PAUSE` from the moment it was set). No day becomes drainable from the start of a pause until
    ///      one catch-up window after its end, so a pause holds a day open and can never take one back. Both are
    ///      zero until the first pause: a new contract holds no gift, so it has nothing to pause.
    uint64 public checkInPauseBegan;
    uint64 public checkInPausedUntil;
    /// @dev A new evidence signer is announced here, and stands only after `SIGNER_DELAY`.
    address public pendingEvidenceSigner;
    uint64 public evidenceSignerReadyAt;

    mapping(uint256 => Gift) private gifts;
    mapping(uint8 => bytes32) public goalProviders;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(uint256 => uint256) public withdrawNonces;

    event GoalRegistered(uint8 indexed goalType, bytes32 indexed providerId);
    event GiftCreated(
        uint256 indexed giftId,
        address indexed funder,
        address refundTo,
        address indexed openingKey,
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
    event GiftEnded(
        uint256 indexed giftId, address indexed recipient, uint256 kept, uint256 givenBack, uint32 givenBackDays
    );
    event GiftFinalised(uint256 indexed giftId, uint32 creditedDays, uint32 drainedDays, uint256 dust);
    event EvidenceSignerAnnounced(address indexed newSigner, uint64 readyAt);
    event EvidenceSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CreationPauseUpdated(bool paused);
    event CheckInPauseUpdated(bool paused, uint64 pausedUntil);

    error InvalidAddress();
    error InvalidGiftId();
    error InvalidTokenDecimals();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidDailyTarget();
    error InvalidOpeningKey();
    error UnknownGoal();
    error InvalidGoalType();
    error InvalidAuthorizationNonce();
    error TransferShortfall();
    error GiftNotFound();
    error CreationIsPaused();
    error CheckInIsPaused();
    error AlreadyClaimed();
    error NotClaimed();
    error InvalidOpeningSignature();
    error RecipientIsFunder();
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
    error EndTermsChanged();
    error OwnershipIsNotRenounceable();
    error GoalAlreadyRegistered();
    error NoSignerPending();
    error SignerNotReady();
    error PauseTooSoon();

    constructor(IERC20 token_, address evidenceSigner_, uint256 firstGiftId_) EIP712("Viky Gift", "3") {
        if (address(token_) == address(0) || evidenceSigner_ == address(0)) revert InvalidAddress();
        if (IERC20Metadata(address(token_)).decimals() != 6) revert InvalidTokenDecimals();
        if (firstGiftId_ == 0) revert InvalidGiftId();
        token = token_;
        evidenceSigner = evidenceSigner_;
        nextGiftId = firstGiftId_;
        // Fail closed: no gift can be made until the deployer opens creation, once the deployment has been
        // checked. Check-ins are not paused here: there is no gift to read yet, and a pause spent on an empty
        // contract would leave it without its brake for the seven days of rest that follow.
        creationPaused = true;
    }

    /// @notice Whether check-ins and openings are paused right now. A pause ends when the owner ends it, or by
    ///         itself `MAX_PAUSE` after it was sent.
    function checkInPaused() public view returns (bool) {
        return block.timestamp < checkInPausedUntil;
    }

    // --- terms ------------------------------------------------------------------------------------------

    function hashGiftParams(GiftParams calldata p) public pure returns (bytes32) {
        return keccak256(
            abi.encode(p.funder, p.refundTo, p.openingKey, p.goalType, p.dailyTarget, p.durationDays, p.amount, p.salt)
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
        // A refund sent here or to the token could never leave again.
        if (p.refundTo == address(this) || p.refundTo == address(token)) revert InvalidAddress();
        if (p.openingKey == address(0)) revert InvalidOpeningKey();
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
        g.openingKey = p.openingKey;
        g.goalType = p.goalType;
        g.dailyTarget = p.dailyTarget;
        g.durationDays = p.durationDays;
        g.amount = p.amount;
        g.perDay = perDay;
        g.fundedAt = uint64(block.timestamp);

        emit GiftCreated(
            giftId, p.funder, p.refundTo, p.openingKey, p.goalType, p.dailyTarget, p.durationDays, p.amount, perDay
        );
        emit GiftFunded(giftId, p.amount);
    }

    /// @notice Binds the recipient's account to the gift. Whoever holds the gift's link holds its opening key, and
    ///         that key signs which account the gift opens for. Anyone may submit it, the relayer does; nobody can
    ///         change the account it names. The evidence signer is not asked: it proves progress, it opens nothing.
    function claim(uint256 giftId, OpenIntent calldata o) external nonReentrant {
        // The pause is the brake on everything that binds or credits, opening included.
        if (checkInPaused()) revert CheckInIsPaused();
        Gift storage g = _gift(giftId);
        if (g.cancelled) revert GiftIsCancelled();
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

    /// @notice Records verified progress. The first accepted check-in is the baseline: it binds the identity,
    ///         anchors the metric and opens the window that same UTC day, which is the gift's first. It credits
    ///         nothing: whatever was done before it is in the baseline. A later check-in observed on day `d`
    ///         credits the open days up to `d` itself, the oldest first, one for each target of progress since the
    ///         baseline, so a lesson read the day it is taken is paid that day. What it can never pay for is a
    ///         day already settled. A binge inside the catch-up window is allowed. While an open day is still
    ///         unpaid, progress below one target carries to the next check-in; once every open day is paid,
    ///         nothing is carried, neither what is past the target nor what is under one.
    function checkIn(uint256 giftId, CheckInAttestation calldata a) external nonReentrant {
        if (checkInPaused()) revert CheckInIsPaused();
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
        if (uint256(a.observedAt) + MAX_OBSERVATION_AGE < block.timestamp) revert StaleObservation();
        if (a.observedAt <= g.lastCheckInAt) revert StaleObservation();
        _verifyCheckInSignature(giftId, a);
        usedNullifiers[a.nullifier] = true;

        if (g.identityHash == bytes32(0)) {
            // What this reading binds is bound for good, so the account the gift is for signs it too.
            _verifyStartSignature(giftId, g.recipient, a);
            g.identityHash = a.identityHash;
            g.baselineValue = a.metricValue;
            g.lastCheckInAt = a.observedAt;
            // The first day is the day this reading is recorded, the block's own: a lesson taken later that day,
            // and read, pays it. Not the day it was observed: observed before midnight and carried after it, it
            // would open a first day already over.
            uint32 startDay = _dayOf(block.timestamp);
            g.startDay = startDay;
            g.endDay = startDay + g.durationDays - 1;
            g.settledThroughDay = startDay - 1;
            emit IdentityBound(giftId, g.recipient, a.identityHash);
            emit CheckInAccepted(giftId, g.recipient, startDay, startDay, 0, a.metricValue, a.observedAt);
            return;
        }

        if (a.identityHash != g.identityHash) revert IdentityMismatch();
        if (a.metricValue < g.baselineValue) revert MetricDecreased();
        // The catch-up window is the contract's own rule: a day whose window has elapsed goes back before anything
        // is credited, whoever is or is not running a keeper.
        _drainElapsed(giftId, g);
        // The day of the reading itself is open to it. A reading observed before the first day finds no open
        // day and is refused below.
        uint32 readDay = _readDay(a.observedAt);
        uint32 upper = readDay > g.endDay ? g.endDay : readDay;
        if (upper <= g.settledThroughDay) revert NothingToCredit();

        uint32 elapsed = upper - g.settledThroughDay;
        uint256 possible = uint256(a.metricValue - g.baselineValue) / g.dailyTarget;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 credit = possible >= elapsed ? elapsed : uint32(possible);
        if (credit == 0) revert InsufficientProgress();
        if (credit == elapsed) {
            // Every open day is paid: the baseline is this reading, and nothing is set aside for a day to come.
            g.baselineValue = a.metricValue;
        } else {
            // An open day is still unpaid: what is under one target waits for it.
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
        if (!_drainElapsed(giftId, g)) revert NothingToDrain();
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
            // Counted past a pause that ran across the end of the wait: nobody could open or connect meanwhile.
            bool neverClaimed = g.recipient == address(0)
                && block.timestamp >= _afterPause(uint256(g.fundedAt) + UNCLAIMED_REFUND_DELAY);
            bool neverConnected = g.recipient != address(0) && g.startDay == 0
                && block.timestamp >= _afterPause(uint256(g.claimedAt) + UNCLAIMED_REFUND_DELAY);
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

    /// @notice The person the gift is for ends it. What was counted stays theirs and can be taken out as before;
    ///         everything else goes back to the refund destination in this same transaction, and nothing is read
    ///         for the gift any more. Only they can do it, and it cannot be undone.
    function endGift(uint256 giftId, uint256 keep, uint256 giveBack) external nonReentrant {
        Gift storage g = _gift(giftId);
        if (g.recipient == address(0)) revert NotClaimed();
        if (msg.sender != g.recipient) revert NotRecipient();
        _end(giftId, g, keep, giveBack);
    }

    /// @notice The same ending, submitted by the relayer with the recipient's signed intent, because the recipient
    ///         holds nothing to pay for a transaction with. No attestation is involved: the evidence signer has no
    ///         say in it, and no pause stops it.
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

    /// @notice What ending the gift now would do: what stays the recipient's and what would go back. The screen
    ///         prints these two figures, and the intent signs them.
    function endPreview(uint256 giftId) external view returns (uint256 keep, uint256 giveBack) {
        Gift storage g = _gift(giftId);
        keep = uint256(g.creditedDays) * g.perDay;
        giveBack = g.amount - keep - g.refundedToFunder;
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

    /// @notice A new verified service is a new registry entry, never a new contract. A goal is added and never
    ///         changed: gifts already made keep the condition they were made on.
    function registerGoal(uint8 goalType, bytes32 providerId) external onlyOwner {
        if (goalType == 0) revert InvalidGoalType();
        if (providerId == bytes32(0)) revert InvalidProofHash();
        if (goalProviders[goalType] != bytes32(0)) revert GoalAlreadyRegistered();
        goalProviders[goalType] = providerId;
        emit GoalRegistered(goalType, providerId);
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

    /// @dev Giving up ownership would leave the pauses and the signer where they stand for ever.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipIsNotRenounceable();
    }

    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPauseUpdated(paused);
    }

    /// @notice Pauses check-ins and openings, or reopens them. A pause runs `MAX_PAUSE` at most from the moment
    ///         it is sent. It cannot be sent again while it runs, nor for `PAUSE_REST` after it ended: the clock
    ///         of missed days always moves again, and the funder's unearned money always comes back.
    function setCheckInPaused(bool paused) external onlyOwner {
        if (paused) {
            if (block.timestamp <= uint256(checkInPausedUntil) + PAUSE_REST) revert PauseTooSoon();
            checkInPauseBegan = uint64(block.timestamp);
            checkInPausedUntil = uint64(block.timestamp + MAX_PAUSE);
        } else if (block.timestamp < checkInPausedUntil) {
            // Only the end of a running pause is recorded: reopening what was already open moves nothing.
            checkInPausedUntil = uint64(block.timestamp);
        }
        emit CheckInPauseUpdated(paused, checkInPausedUntil);
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

    /// @dev Settles as missed every open day whose catch-up window has elapsed. Answers whether any was.
    function _drainElapsed(uint256 giftId, Gift storage g) private returns (bool) {
        uint32 upper = _lastDrainableDay();
        if (upper > g.endDay) upper = g.endDay;
        if (upper <= g.settledThroughDay) return false;
        uint32 missed = upper - g.settledThroughDay;
        uint32 fromDay = g.settledThroughDay + 1;
        g.settledThroughDay = upper;
        g.drainedDays += missed;
        uint256 amount = uint256(missed) * g.perDay;
        g.refundable += amount;
        emit DaysDrained(giftId, fromDay, upper, missed, amount);
        return true;
    }

    function _end(uint256 giftId, Gift storage g, uint256 keep, uint256 giveBack) private {
        if (g.cancelled) revert GiftIsCancelled();
        if (g.finalised) revert AlreadyFinalised();
        uint32 givenBackDays;
        if (g.startDay == 0) {
            // Opened and never connected: no day was ever open, so none was counted and none was missed.
            givenBackDays = g.durationDays;
        } else {
            // Days whose catch-up window had already run out were missed under the rule the gift ran by, and are
            // said as missed. Every other open day, yesterday still catchable, today, the days to come, is given
            // back: not counted, and not failed either.
            uint32 upper = _lastDrainableDay();
            if (upper > g.endDay) upper = g.endDay;
            if (upper > g.settledThroughDay) {
                uint32 missed = upper - g.settledThroughDay;
                emit DaysDrained(giftId, g.settledThroughDay + 1, upper, missed, uint256(missed) * g.perDay);
                g.drainedDays += missed;
            }
            givenBackDays = g.durationDays - g.creditedDays - g.drainedDays;
            g.settledThroughDay = g.endDay;
        }
        // Credited days stay the recipient's. Everything else, the rounding dust included, is the funder's.
        uint256 kept = uint256(g.creditedDays) * g.perDay;
        uint256 givenBack = g.amount - kept - g.refundedToFunder;
        if (kept != keep || givenBack != giveBack) revert EndTermsChanged();
        g.refundable = g.amount - kept;
        g.refundedToFunder = g.refundable;
        g.finalised = true;
        g.endedAt = uint64(block.timestamp);
        g.givenBackDays = givenBackDays;
        emit GiftEnded(giftId, g.recipient, kept, givenBack, givenBackDays);
        if (givenBack > 0) {
            _push(g.refundTo, givenBack);
            emit UnearnedRefunded(giftId, g.refundTo, givenBack);
        }
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

    /// @dev The first reading, signed by the account the gift is for. A signature that is missing or malformed is
    ///      refused as one that is not theirs.
    function _verifyStartSignature(uint256 giftId, address recipient, CheckInAttestation calldata a) private view {
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

    /// @dev The day a reading counts for: the day it was observed, and never a day that has not begun. A reading
    ///      may be dated up to `MAX_CLOCK_SKEW` ahead of the block that carries it, and in the last minute of a day
    ///      that would open the next one before it starts.
    function _readDay(uint64 observedAt) private view returns (uint32) {
        uint32 observed = _dayOf(observedAt);
        uint32 today = _dayOf(block.timestamp);
        return observed > today ? today : observed;
    }

    /// @dev Whether the clock stands still: from the beginning of a pause until one catch-up window after its end.
    function _standsStill() private view returns (bool) {
        return block.timestamp > checkInPauseBegan && block.timestamp < uint256(checkInPausedUntil) + CATCH_UP_WINDOW;
    }

    /// @dev A wait that ran out while the clock stood still runs out when it moves again, and no sooner: nothing
    ///      could be opened or read meanwhile. A wait over before the pause began is over.
    function _afterPause(uint256 moment) private view returns (uint256) {
        uint256 moves = uint256(checkInPausedUntil) + CATCH_UP_WINDOW;
        return moment > checkInPauseBegan && moment < moves ? moves : moment;
    }

    /// @dev Day `d` is drainable once `block.timestamp >= dayStart(d) + 1 day + CATCH_UP_WINDOW`. While the clock
    ///      stands still it is read at the beginning of the pause: a reading that could not be sent has a whole
    ///      window again once check-ins reopen.
    function _lastDrainableDay() private view returns (uint32) {
        uint256 clock = _standsStill() ? checkInPauseBegan : block.timestamp;
        if (clock < CATCH_UP_WINDOW + DAY) return 0;
        return _dayOf(clock - CATCH_UP_WINDOW) - 1;
    }
}
