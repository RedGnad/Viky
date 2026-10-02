// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V2Kit} from "./kit/V2Kit.sol";

/// @dev The shape Foundry reads to know which functions of which contract a campaign may call.
struct FuzzSelector {
    address addr;
    bytes4[] selectors;
}

/// @notice Everything anybody can do to the daily contract, in any order: gifts made, opened, read, drained, paid out,
///         sent back, cancelled, finalised, ended by the person they are for, the owner pausing and reopening, and
///         time passing. A campaign calls these at random; the invariants below hold after every single call.
/// @dev    Every gift has a refund destination and a payout destination of its own, used by no other gift. So what
///         a gift paid out and what it sent back are two balances anybody can read, and the conservation of each
///         gift's money is checked against tokens that really moved, never against the contract's own book alone.
contract DailyHandler is V2Kit {
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    uint32 private constant TARGET = 10;

    MockAUSD public immutable token;
    GiftEscrowV2 public immutable escrow;
    uint256[] public ids;
    mapping(uint256 => uint64) private metric;
    uint256 public created;
    /// @dev Set if a pause was ever accepted while one ran, or inside the rest that follows one.
    bool public pausedTooSoon;

    constructor() {
        // A real moment: the rest between two pauses is counted from the end of the last one, which is zero on a
        // contract never paused, so a campaign begun at the first second of 1970 would spend a week unable to pause.
        VM.warp(1_800_000_000);
        token = new MockAUSD();
        escrow = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.registerGoal(GOAL, PROVIDER);
        token.mint(VM.addr(FUNDER_KEY), type(uint128).max);
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    /// @dev Where a gift's unearned money goes back, and where its earned money is paid: its own two addresses.
    function boxOf(uint256 id) public pure returns (address) {
        return address(uint160(0xB0000000 + id));
    }

    function pocketOf(uint256 id) public pure returns (address) {
        return address(uint160(0xC0000000 + id));
    }

    function _one(uint256 seed) private view returns (uint256 id, bool any) {
        if (ids.length == 0) return (0, false);
        return (ids[seed % ids.length], true);
    }

    // --- what the campaign calls --------------------------------------------------------------------------

    function make(uint256 amountSeed, uint8 durationSeed) external {
        if (ids.length >= 12) return;
        uint32 duration = 7 + uint32(durationSeed % 84);
        uint256 amount = 1_000_000 + (amountSeed % 999_000_000);
        GiftEscrowV2.GiftParams memory p = _dailyParams(VM.addr(FUNDER_KEY), GOAL, amount, duration, TARGET);
        p.refundTo = boxOf(escrow.nextGiftId());
        uint256 id = escrow.createGift(p, _dailyAuthorization(escrow, p, FUNDER_KEY));
        ids.push(id);
        created += amount;
    }

    function open(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        // The one drawn, or the first that nobody has opened yet when it is already open.
        for (uint256 i = 0; i < ids.length && escrow.getGift(id).recipient != address(0); ++i) {
            id = ids[i];
        }
        escrow.claim(id, _dailyOpen(escrow, id, VM.addr(RECIPIENT_KEY), LINK_KEY));
    }

    function read(uint256 seed, uint8 progress) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        uint64 next = (metric[id] == 0 ? 1000 : metric[id]) + uint64(progress % 45);
        escrow.checkIn(
            id,
            _dailyReading(
                escrow,
                id,
                VM.addr(RECIPIENT_KEY),
                keccak256("identity"),
                PROVIDER,
                next,
                uint64(VM.getBlockTimestamp())
            )
        );
        metric[id] = next;
    }

    /// @dev The morning pass: the clock moves to half past midnight of the next day and every gift is read, each
    ///      with its own progress. Random calls alone almost never line a reading up with a day that is still
    ///      open, and a campaign that counts no day checks nothing of the days counted.
    function morning(uint256 seed) external {
        uint256 next = (VM.getBlockTimestamp() / 1 days + 1) * 1 days + 30 minutes;
        VM.warp(next);
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint64 progress = uint64(uint256(keccak256(abi.encode(seed, id))) % 25);
            uint64 value = (metric[id] == 0 ? 1000 : metric[id]) + progress;
            try escrow.checkIn(
                id,
                _dailyReading(escrow, id, VM.addr(RECIPIENT_KEY), keccak256("identity"), PROVIDER, value, uint64(next))
            ) {
                metric[id] = value;
            } catch {}
        }
    }

    function drain(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (any) escrow.drain(id);
    }

    function finalise(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (any) escrow.finalise(id);
    }

    function refund(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (any) escrow.refundUnearned(id);
    }

    function cancel(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        VM.prank(VM.addr(FUNDER_KEY));
        escrow.cancel(id);
    }

    function takeOut(uint256 seed, uint256 amountSeed, bool byIntent) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        uint256 earned = escrow.earnedBalance(id);
        if (earned == 0) return;
        uint256 amount = 1 + (amountSeed % earned);
        if (byIntent) {
            escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, pocketOf(id), amount, RECIPIENT_KEY));
        } else {
            VM.prank(VM.addr(RECIPIENT_KEY));
            escrow.withdrawEarned(id, pocketOf(id), amount);
        }
    }

    function end(uint256 seed, bool byIntent) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        if (byIntent) {
            escrow.endGiftWithIntent(id, _dailyEnd(escrow, id, keep, giveBack, RECIPIENT_KEY));
        } else {
            VM.prank(VM.addr(RECIPIENT_KEY));
            escrow.endGift(id, keep, giveBack);
        }
    }

    /// @dev One call in eight pauses and three in eight reopen: a campaign spent mostly under a pause would read
    ///      nothing, and it is the days read, paid and sent back that the invariants are about.
    function pause(uint8 seed) external {
        if (seed % 8 == 0) {
            uint256 lastEnd = escrow.checkInPausedUntil();
            try escrow.setCheckInPaused(true) {
                if (lastEnd != 0 && VM.getBlockTimestamp() <= lastEnd + 7 days) pausedTooSoon = true;
            } catch {}
        } else if (seed % 8 < 4) {
            escrow.setCheckInPaused(false);
        }
    }

    function wait(uint32 seconds_) external {
        VM.warp(VM.getBlockTimestamp() + 1 minutes + (uint256(seconds_) % 36 hours));
    }
}

/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 200
/// forge-config: default.invariant.fail-on-revert = false
contract GiftEscrowV2InvariantTest {
    DailyHandler private handler;
    GiftEscrowV2 private escrow;
    MockAUSD private token;

    function setUp() public {
        handler = new DailyHandler();
        escrow = handler.escrow();
        token = handler.token();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](12);
        selectors[11] = DailyHandler.morning.selector;
        selectors[0] = DailyHandler.make.selector;
        selectors[1] = DailyHandler.open.selector;
        selectors[2] = DailyHandler.read.selector;
        selectors[3] = DailyHandler.drain.selector;
        selectors[4] = DailyHandler.finalise.selector;
        selectors[5] = DailyHandler.refund.selector;
        selectors[6] = DailyHandler.cancel.selector;
        selectors[7] = DailyHandler.takeOut.selector;
        selectors[8] = DailyHandler.end.selector;
        selectors[9] = DailyHandler.pause.selector;
        selectors[10] = DailyHandler.wait.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector({addr: address(handler), selectors: selectors});
    }

    /// @notice Each gift's money is conserved, whatever was called and in whatever order: what it paid the person
    ///         it is for, what it sent back, and what the contract still holds of it add up to what was paid in,
    ///         and the two first are tokens that really arrived somewhere.
    function invariant_EachGiftsMoneyIsConserved() public view {
        uint256 held;
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            GiftEscrowV2.Gift memory g = escrow.getGift(id);
            uint256 paidOut = token.balanceOf(handler.pocketOf(id));
            uint256 sentBack = token.balanceOf(handler.boxOf(id));
            require(paidOut == g.withdrawnByRecipient, "what the gift paid out is what arrived");
            require(sentBack == g.refundedToFunder, "what the gift sent back is what arrived");
            require(paidOut + sentBack <= g.amount, "a gift never gives more than was paid in");
            held += g.amount - paidOut - sentBack;
        }
        require(token.balanceOf(address(escrow)) == held, "the contract holds exactly what its gifts still hold");
        require(held <= handler.created(), "and never more than was ever paid in");
    }

    /// @notice The owner cannot hold the clock of missed days (the review of 2 Oct 2026, R-02 and R-03). A pause runs
    ///         seven days at most and is never sent twice in a row, so the clock stands still for one pause and one
    ///         catch-up window at most, and the days it decides are never further behind than that.
    function invariant_TheClockOfMissedDaysIsNeverHeldLongerThanOnePause() public view {
        require(!handler.pausedTooSoon(), "a pause was accepted while one ran, or inside the rest after one");
        require(
            uint256(escrow.checkInPausedUntil()) <= uint256(escrow.checkInPauseBegan()) + 7 days,
            "a pause never runs past seven days"
        );
        uint256 heldAtMost = 7 days + escrow.CATCH_UP_WINDOW();
        uint256 slowest = (block.timestamp - heldAtMost - escrow.CATCH_UP_WINDOW()) / 1 days - 1;
        require(escrow.lastDrainableDay() >= slowest, "the clock of missed days is held longer than one pause");
    }

    /// @notice A counted day is the recipient's and nobody else's: they never take more than was counted, and the
    ///         funder never receives a counted day.
    function invariant_ACountedDayIsNeverTheFunders() public view {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            GiftEscrowV2.Gift memory g = escrow.getGift(handler.ids(i));
            uint256 counted = uint256(g.creditedDays) * g.perDay;
            require(g.withdrawnByRecipient <= counted, "nothing is taken that was not counted");
            require(g.refundedToFunder <= g.refundable, "nothing goes back that was not freed");
            require(g.refundable + counted <= g.amount, "what is freed is never a counted day");
            if (g.cancelled) require(g.creditedDays == 0, "a cancelled gift counted nothing");
        }
    }

    /// @notice Every day of a gift is settled once at most: counted, missed, or given back by its ending.
    function invariant_EveryDayIsSettledOnceAtMost() public view {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            GiftEscrowV2.Gift memory g = escrow.getGift(handler.ids(i));
            uint256 settled = uint256(g.creditedDays) + g.drainedDays + g.givenBackDays;
            require(settled <= g.durationDays, "no day is settled twice");
            if (g.startDay != 0) {
                require(g.settledThroughDay >= g.startDay - 1 && g.settledThroughDay <= g.endDay, "inside the window");
                if (g.endedAt == 0) {
                    require(
                        uint256(g.creditedDays) + g.drainedDays == g.settledThroughDay - (g.startDay - 1),
                        "the days settled are the days the window has passed"
                    );
                }
            }
            if (g.finalised) {
                require(settled == g.durationDays, "a finished gift has settled every day");
                // Once finished, everything that is not a counted day is the funder's, the rounding dust included.
                require(g.refundable + uint256(g.creditedDays) * g.perDay == g.amount, "nothing is left unowned");
            }
            if (g.endedAt != 0) {
                require(g.finalised && g.refundedToFunder == g.refundable, "an ending sends it all back");
            }
        }
    }
}

/// @notice The same for the milestone contract: climbs and certificates made, opened, proved, expired, sent back,
///         cancelled, paid out, ended, with the owner pausing and time passing.
contract MilestoneHandler is V2Kit {
    uint8 private constant GOAL_CLIMB = 1;
    uint8 private constant GOAL_HAVE = 2;
    bytes32 private constant CLIMB_PROVIDER = keccak256("viky:provider:chess-public:v1");
    bytes32 private constant HAVE_PROVIDER = keccak256("viky:provider:coursera-certificate:v1");
    bytes32 private constant SUBJECT = keccak256("a person and a course");
    uint64 private constant TARGET = 1500;

    MockAUSD public immutable token;
    MilestoneGiftV2 public immutable gift;
    uint256[] public ids;
    uint256 public created;
    /// @dev Set if a pause was ever accepted while one ran, or inside the rest that follows one.
    bool public pausedTooSoon;
    /// @dev Set if a gift could not be sent back two weeks after its own window closed.
    bool public heldTooLong;

    constructor() {
        VM.warp(1_800_000_000);
        token = new MockAUSD();
        gift = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        gift.setCreationPaused(false);
        gift.registerGoal(GOAL_CLIMB, CLIMB_PROVIDER, 0);
        gift.registerGoal(GOAL_HAVE, HAVE_PROVIDER, 1);
        token.mint(VM.addr(FUNDER_KEY), type(uint128).max);
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function boxOf(uint256 id) public pure returns (address) {
        return address(uint160(0xB0000000 + id));
    }

    function pocketOf(uint256 id) public pure returns (address) {
        return address(uint160(0xC0000000 + id));
    }

    function _one(uint256 seed) private view returns (uint256 id, bool any) {
        if (ids.length == 0) return (0, false);
        return (ids[seed % ids.length], true);
    }

    function make(uint256 amountSeed, uint8 durationSeed, bool certificate) external {
        if (ids.length >= 12) return;
        uint32 duration = 1 + uint32(durationSeed % 120);
        uint256 amount = 1_000_000 + (amountSeed % 999_000_000);
        address funder = VM.addr(FUNDER_KEY);
        MilestoneGiftV2.MilestoneParams memory p = certificate
            ? _haveParams(funder, GOAL_HAVE, amount, duration, SUBJECT)
            : _climbParams(funder, GOAL_CLIMB, amount, duration, TARGET, TARGET - 200);
        p.refundTo = boxOf(gift.nextGiftId());
        uint256 id = gift.createGift(p, _milestoneAuthorization(gift, p, FUNDER_KEY));
        ids.push(id);
        created += amount;
    }

    function open(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        gift.claim(id, _milestoneOpen(gift, id, VM.addr(RECIPIENT_KEY), LINK_KEY));
    }

    function prove(uint256 seed, uint16 rating, uint32 grantedAgo) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        uint64 now_ = uint64(VM.getBlockTimestamp());
        address who = VM.addr(RECIPIENT_KEY);
        if (g.shape == 1) {
            uint64 eventAt = now_ - uint64(grantedAgo % 200 days);
            gift.prove(id, _milestoneProof(gift, id, who, SUBJECT, HAVE_PROVIDER, rating % 2, eventAt, now_));
        } else {
            uint64 value = 1100 + uint64(rating % 600);
            gift.prove(id, _milestoneProof(gift, id, who, keccak256("identity"), CLIMB_PROVIDER, value, 0, now_));
        }
    }

    /// @dev When a gift's own window closes, no pause counted: what its funder was told when they paid.
    function _closesByItself(MilestoneGiftV2.Gift memory g) private pure returns (uint256) {
        if (g.recipient == address(0)) return uint256(g.fundedAt) + 14 days + 6 hours;
        if (g.shape == 1) return uint256(g.deadline) + 14 days;
        if (g.identityHash != bytes32(0)) return uint256(g.deadline) + 6 hours;
        return uint256(g.claimedAt) + 14 days + 6 hours;
    }

    /// @dev A pause moves a window only if it began while the window was open, runs seven days at most and gives
    ///      back seven days at most: two weeks after its own close, every gift not reached must go back.
    function expire(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        bool due = !g.settled && !g.cancelled && VM.getBlockTimestamp() > _closesByItself(g) + 14 days;
        try gift.expire(id) {}
        catch {
            if (due) heldTooLong = true;
        }
    }

    function refund(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (any) gift.refundUnearned(id);
    }

    function cancel(uint256 seed) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        VM.prank(VM.addr(FUNDER_KEY));
        gift.cancel(id);
    }

    function takeOut(uint256 seed, uint256 amountSeed, bool byIntent) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        uint256 earned = gift.earnedBalance(id);
        if (earned == 0) return;
        uint256 amount = 1 + (amountSeed % earned);
        if (byIntent) {
            gift.withdrawEarnedWithIntent(id, _milestoneWithdraw(gift, id, pocketOf(id), amount, RECIPIENT_KEY));
        } else {
            VM.prank(VM.addr(RECIPIENT_KEY));
            gift.withdrawEarned(id, pocketOf(id), amount);
        }
    }

    function end(uint256 seed, bool byIntent) external {
        (uint256 id, bool any) = _one(seed);
        if (!any) return;
        (, uint256 giveBack) = gift.endPreview(id);
        if (byIntent) {
            gift.endGiftWithIntent(id, _milestoneEnd(gift, id, giveBack, RECIPIENT_KEY));
        } else {
            VM.prank(VM.addr(RECIPIENT_KEY));
            gift.endGift(id, 0, giveBack);
        }
    }

    function pause(uint8 seed) external {
        if (seed % 8 == 0) {
            uint256 lastEnd = gift.proofPausedUntil();
            try gift.setProofPaused(true) {
                if (lastEnd != 0 && VM.getBlockTimestamp() <= lastEnd + 7 days) pausedTooSoon = true;
            } catch {}
        } else if (seed % 8 < 4) {
            gift.setProofPaused(false);
        }
    }

    function wait(uint32 seconds_) external {
        VM.warp(VM.getBlockTimestamp() + 1 minutes + (uint256(seconds_) % 20 days));
    }
}

/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 200
/// forge-config: default.invariant.fail-on-revert = false
contract MilestoneGiftV2InvariantTest {
    MilestoneHandler private handler;
    MilestoneGiftV2 private gift;
    MockAUSD private token;

    function setUp() public {
        handler = new MilestoneHandler();
        gift = handler.gift();
        token = handler.token();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = MilestoneHandler.make.selector;
        selectors[1] = MilestoneHandler.open.selector;
        selectors[2] = MilestoneHandler.prove.selector;
        selectors[3] = MilestoneHandler.expire.selector;
        selectors[4] = MilestoneHandler.refund.selector;
        selectors[5] = MilestoneHandler.cancel.selector;
        selectors[6] = MilestoneHandler.takeOut.selector;
        selectors[7] = MilestoneHandler.end.selector;
        selectors[8] = MilestoneHandler.pause.selector;
        selectors[9] = MilestoneHandler.wait.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector({addr: address(handler), selectors: selectors});
    }

    /// @notice Each gift's money is conserved, whatever was called and in whatever order.
    function invariant_EachGiftsMoneyIsConserved() public view {
        uint256 held;
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            MilestoneGiftV2.Gift memory g = gift.getGift(id);
            uint256 paidOut = token.balanceOf(handler.pocketOf(id));
            uint256 sentBack = token.balanceOf(handler.boxOf(id));
            require(paidOut == g.withdrawnByRecipient, "what the gift paid out is what arrived");
            require(sentBack == g.refundedToFunder, "what the gift sent back is what arrived");
            require(paidOut + sentBack <= g.amount, "a gift never gives more than was paid in");
            held += g.amount - paidOut - sentBack;
        }
        require(token.balanceOf(address(gift)) == held, "the contract holds exactly what its gifts still hold");
        require(held <= handler.created(), "and never more than was ever paid in");
    }

    /// @notice The owner cannot hold a gift (the review of 2 Oct 2026, R-02 and R-04): a pause is never sent twice
    ///         in a row, and whatever the owner sent, a gift not reached goes back at the latest two weeks after
    ///         its own window closed.
    function invariant_NoGiftIsHeldByThePause() public view {
        require(!handler.pausedTooSoon(), "a pause was accepted while one ran, or inside the rest after one");
        require(
            uint256(gift.proofPausedUntil()) <= uint256(gift.proofPauseBegan()) + 7 days,
            "a pause never runs past seven days"
        );
        require(!handler.heldTooLong(), "a gift could not go back two weeks after its own window closed");
    }

    /// @notice A milestone is all or nothing, and it is one person's or the other's: reached, the whole amount is the
    ///         recipient's and none of it ever goes back; otherwise none of it is ever paid out.
    function invariant_AGiftIsOnePersonsOrTheOthers() public view {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            MilestoneGiftV2.Gift memory g = gift.getGift(handler.ids(i));
            require(g.earned == 0 || g.earned == g.amount, "all or nothing");
            require(g.withdrawnByRecipient <= g.earned, "nothing is taken that was not earned");
            if (g.earned == g.amount) {
                require(g.settled && g.refundable == 0 && g.refundedToFunder == 0, "a reached gift never goes back");
                require(g.endedAt == 0 && !g.cancelled, "and was neither ended nor cancelled");
            } else {
                require(g.withdrawnByRecipient == 0, "a gift not reached pays nothing out");
                require(g.refundable + g.refundedToFunder <= g.amount, "and sends back no more than it holds");
            }
            if (g.endedAt != 0) require(g.settled && g.refundedToFunder == g.amount, "an ending sends it all back");
            if (g.cancelled) {
                require(g.refundedToFunder == g.amount && g.recipient == address(0), "cancelled unopened");
            }
        }
    }
}
