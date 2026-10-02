// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {V2Kit} from "../kit/V2Kit.sol";

struct FuzzSelector {
    address addr;
    bytes4[] selectors;
}

/// @notice The reviewer's own campaign on the daily contract (2 Oct 2026). Every gift pays out to an address of its
///         own and refunds to an address of its own, so each gift's money is followed on token balances that moved.
contract RDailyHandler is V2Kit {
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("review provider");
    uint256 private constant FUNDER_B = 0xF00E;
    uint256 private constant STRANGER_KEY = 0xBAD;

    MockAUSD public immutable token;
    GiftEscrowV2 public immutable escrow;
    uint256[] public ids;
    mapping(uint256 => uint64) private metric;
    mapping(uint256 => uint256) private keyOf;
    mapping(uint256 => uint256) private funderKeyOf;

    /// @dev Set if something that must never succeed did.
    string public forbidden;
    uint256 public credits;
    uint256 public endings;
    uint256 public withdrawals;
    uint256 public refunds;
    uint256 public cancels;
    uint256 public finalisations;

    constructor() {
        VM.warp(1_790_000_000);
        token = new MockAUSD();
        escrow = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.registerGoal(GOAL, PROVIDER);
        escrow.setCreationPaused(false);
        escrow.setCheckInPaused(false);
        token.mint(VM.addr(FUNDER_KEY), type(uint128).max);
        token.mint(VM.addr(FUNDER_B), type(uint128).max);
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function refundBox(uint256 id) public pure returns (address) {
        return address(uint160(0x10000000 + id));
    }

    function payBox(uint256 id) public pure returns (address) {
        return address(uint160(0x20000000 + id));
    }

    function _pick(uint256 seed) private view returns (uint256 id, bool any) {
        if (ids.length == 0) return (0, false);
        return (ids[seed % ids.length], true);
    }

    function _keyAt(uint256 seed) private pure returns (uint256) {
        uint256 k = seed % 3;
        return k == 0 ? RECIPIENT_KEY : k == 1 ? OTHER_KEY : 0xC0FFEE;
    }

    function make(uint256 amountSeed, uint8 durationSeed, bool second) external {
        if (ids.length >= 10) return;
        uint256 fk = second ? FUNDER_B : FUNDER_KEY;
        uint32 duration = 7 + uint32(durationSeed % 84);
        uint256 amount = 1_000_000 + (amountSeed % 2_000_000_000);
        GiftEscrowV2.GiftParams memory p = _dailyParams(VM.addr(fk), GOAL, amount, duration, 10);
        uint256 next = escrow.nextGiftId();
        p.refundTo = refundBox(next);
        uint256 id = escrow.createGift(p, _dailyAuthorization(escrow, p, fk));
        ids.push(id);
        funderKeyOf[id] = fk;
    }

    function open(uint256 seed, uint256 whoSeed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        uint256 key = _keyAt(whoSeed);
        escrow.claim(id, _dailyOpen(escrow, id, VM.addr(key), LINK_KEY));
        keyOf[id] = key;
    }

    function _reading(uint256 id, uint64 value, uint64 observedAt) private returns (bool) {
        uint32 before = escrow.getGift(id).creditedDays;
        try escrow.checkIn(
            id,
            _dailyReading(
                escrow, id, VM.addr(keyOf[id]), keccak256(abi.encode("identity", id)), PROVIDER, value, observedAt
            )
        ) {
            metric[id] = value;
            credits += escrow.getGift(id).creditedDays - before;
            return true;
        } catch {
            return false;
        }
    }

    function read(uint256 seed, uint8 progress, uint16 age) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        uint64 value = (metric[id] == 0 ? 1000 : metric[id]) + uint64(progress % 60);
        _reading(id, value, uint64(VM.getBlockTimestamp() - (uint256(age) % 40 minutes)));
    }

    /// @dev The morning pass, and the pass at the very edge of the catch-up window (06:00 and a little).
    function morning(uint256 seed, bool edge) external {
        uint256 next =
            (VM.getBlockTimestamp() / 1 days + 1) * 1 days + (edge ? 6 hours + (seed % 10 minutes) : 30 minutes);
        VM.warp(next);
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (keyOf[id] == 0) continue;
            uint64 value = (metric[id] == 0 ? 1000 : metric[id]) + uint64(uint256(keccak256(abi.encode(seed, id))) % 35);
            _reading(id, value, uint64(next));
        }
    }

    function drain(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (any) escrow.drain(id);
    }

    function finalise(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        escrow.finalise(id);
        ++finalisations;
    }

    function refund(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        escrow.refundUnearned(id);
        ++refunds;
    }

    function cancel(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        VM.prank(VM.addr(funderKeyOf[id]));
        escrow.cancel(id);
        ++cancels;
    }

    function withdraw(uint256 seed, uint256 amountSeed, bool byIntent) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        uint256 available = escrow.earnedBalance(id);
        // Sometimes more than is there, which must be refused.
        uint256 amount = 1 + (amountSeed % (available + 1 + (amountSeed % 7 == 0 ? 1_000 : 0)));
        if (byIntent) {
            escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, payBox(id), amount, keyOf[id]));
        } else {
            VM.prank(VM.addr(keyOf[id]));
            escrow.withdrawEarned(id, payBox(id), amount);
        }
        if (amount > available) forbidden = "withdrew more than was earned";
        ++withdrawals;
    }

    function end(uint256 seed, bool byIntent) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        uint256 boxBefore = token.balanceOf(refundBox(id));
        if (byIntent) {
            escrow.endGiftWithIntent(id, _dailyEnd(escrow, id, keep, giveBack, keyOf[id]));
        } else {
            VM.prank(VM.addr(keyOf[id]));
            escrow.endGift(id, keep, giveBack);
        }
        if (token.balanceOf(refundBox(id)) - boxBefore != giveBack) {
            forbidden = "an ending did not send back what it said";
        }
        ++endings;
    }

    function endWithOtherAmounts(uint256 seed, uint256 delta) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        delta = 1 + (delta % 1_000_000);
        VM.prank(VM.addr(keyOf[id]));
        try escrow.endGift(id, keep + delta, giveBack > delta ? giveBack - delta : giveBack + delta) {
            forbidden = "an ending with other amounts was accepted";
        } catch {}
    }

    function stranger(uint256 seed, uint8 what) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        address who = VM.addr(STRANGER_KEY);
        GiftEscrowV2.Gift memory g = escrow.getGift(id);
        if (who == g.recipient || who == g.funder) return;
        uint256 kind = what % 5;
        if (kind == 0) {
            VM.prank(who);
            try escrow.withdrawEarned(id, who, 1) {
                forbidden = "a stranger withdrew";
            } catch {}
        } else if (kind == 1) {
            (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
            VM.prank(who);
            try escrow.endGift(id, keep, giveBack) {
                forbidden = "a stranger ended a gift";
            } catch {}
        } else if (kind == 2) {
            VM.prank(who);
            try escrow.cancel(id) {
                forbidden = "a stranger cancelled a gift";
            } catch {}
        } else if (kind == 3) {
            try escrow.claim(id, _dailyOpen(escrow, id, who, STRANGER_KEY)) {
                forbidden = "a stranger opened a gift without the link key";
            } catch {}
        } else {
            (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
            try escrow.endGiftWithIntent(id, _dailyEnd(escrow, id, keep, giveBack, STRANGER_KEY)) {
                forbidden = "a stranger's signature ended a gift";
            } catch {}
            try escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, who, 1, STRANGER_KEY)) {
                forbidden = "a stranger's signature withdrew";
            } catch {}
        }
    }

    function pause(bool on) external {
        escrow.setCheckInPaused(on);
    }

    function wait(uint32 secondsSeed) external {
        VM.warp(VM.getBlockTimestamp() + (uint256(secondsSeed) % 3 days));
    }

    /// @dev Everything is brought to its end: every gift settled, every refund sent, every earned unit taken out.
    function sweep() external {
        escrow.setCheckInPaused(false);
        VM.warp(VM.getBlockTimestamp() + 200 days);
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            GiftEscrowV2.Gift memory g = escrow.getGift(id);
            if (!g.cancelled && !g.finalised && g.startDay != 0) escrow.finalise(id);
            try escrow.refundUnearned(id) {} catch {}
            uint256 left = escrow.earnedBalance(id);
            if (left > 0) {
                VM.prank(escrow.getGift(id).recipient);
                escrow.withdrawEarned(id, payBox(id), left);
            }
        }
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 150
/// forge-config: default.invariant.fail-on-revert = false
contract ReviewDailyInvariants {
    RDailyHandler private handler;
    MockAUSD private token;
    GiftEscrowV2 private escrow;

    function setUp() public {
        handler = new RDailyHandler();
        token = handler.token();
        escrow = handler.escrow();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory s = new bytes4[](14);
        s[0] = RDailyHandler.make.selector;
        s[1] = RDailyHandler.open.selector;
        s[2] = RDailyHandler.read.selector;
        s[3] = RDailyHandler.morning.selector;
        s[4] = RDailyHandler.drain.selector;
        s[5] = RDailyHandler.finalise.selector;
        s[6] = RDailyHandler.refund.selector;
        s[7] = RDailyHandler.cancel.selector;
        s[8] = RDailyHandler.withdraw.selector;
        s[9] = RDailyHandler.end.selector;
        s[10] = RDailyHandler.endWithOtherAmounts.selector;
        s[11] = RDailyHandler.stranger.selector;
        s[12] = RDailyHandler.pause.selector;
        s[13] = RDailyHandler.wait.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector({addr: address(handler), selectors: s});
    }

    function _books() private view returns (uint256 held) {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            GiftEscrowV2.Gift memory g = escrow.getGift(id);
            uint256 paid = token.balanceOf(handler.payBox(id));
            uint256 refunded = token.balanceOf(handler.refundBox(id));
            uint256 earned = uint256(g.creditedDays) * g.perDay;
            require(paid == g.withdrawnByRecipient, "paid out is not what the book says");
            require(refunded == g.refundedToFunder, "sent back is not what the book says");
            require(paid <= earned, "paid more than was earned");
            require(g.refundedToFunder <= g.refundable, "sent back more than was refundable");
            require(earned + g.refundable <= g.amount, "earned and refundable exceed the gift");
            require(uint256(g.creditedDays) + g.drainedDays + g.givenBackDays <= g.durationDays, "a day counted twice");
            if (g.endedAt != 0) {
                require(g.finalised, "ended but not final");
                require(g.refundedToFunder == g.amount - earned, "an ended gift still owes the funder");
                require(
                    uint256(g.creditedDays) + g.drainedDays + g.givenBackDays == g.durationDays,
                    "ended days do not add up"
                );
            }
            if (g.cancelled) {
                require(g.creditedDays == 0 && refunded == g.amount, "a cancelled gift did not go back whole");
            }
            if (g.finalised && g.endedAt == 0) {
                require(uint256(g.creditedDays) + g.drainedDays == g.durationDays, "finalised days do not add up");
                require(earned + g.refundable == g.amount, "a finalised gift leaves money unassigned");
            }
            held += g.amount - paid - refunded;
        }
    }

    function invariant_EveryGiftsMoneyIsWhereTheBookSaysAndNowhereElse() public view {
        require(token.balanceOf(address(escrow)) == _books(), "the contract's balance is not the sum of its gifts");
        require(bytes(handler.forbidden()).length == 0, handler.forbidden());
    }

    /// @dev At the end of every run: settle everything, and the contract must hold exactly nothing.
    function afterInvariant() public {
        handler.sweep();
        require(_books() == 0, "something is left in a gift after everything settled");
        require(token.balanceOf(address(escrow)) == 0, "the contract still holds money after everything settled");
    }
}

/// @notice The reviewer's own campaign on the milestone contract.
contract RMilestoneHandler is V2Kit {
    uint8 private constant GOAL_CLIMB = 1;
    uint8 private constant GOAL_HAVE = 2;
    bytes32 private constant PROVIDER = keccak256("review provider");
    bytes32 private constant PROVIDER_HAVE = keccak256("review provider have");
    uint256 private constant STRANGER_KEY = 0xBAD;

    MockAUSD public immutable token;
    MilestoneGiftV2 public immutable gift;
    uint256[] public ids;
    mapping(uint256 => uint256) private keyOf;
    string public forbidden;
    uint256 public reached;
    uint256 public endings;
    uint256 public expiries;

    constructor() {
        VM.warp(1_790_000_000);
        token = new MockAUSD();
        gift = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        gift.registerGoal(GOAL_CLIMB, PROVIDER, 0);
        gift.registerGoal(GOAL_HAVE, PROVIDER_HAVE, 1);
        gift.setCreationPaused(false);
        gift.setProofPaused(false);
        token.mint(VM.addr(FUNDER_KEY), type(uint128).max);
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function refundBox(uint256 id) public pure returns (address) {
        return address(uint160(0x10000000 + id));
    }

    function payBox(uint256 id) public pure returns (address) {
        return address(uint160(0x20000000 + id));
    }

    function _pick(uint256 seed) private view returns (uint256 id, bool any) {
        if (ids.length == 0) return (0, false);
        return (ids[seed % ids.length], true);
    }

    function _subject(uint256 id) private pure returns (bytes32) {
        return keccak256(abi.encode("subject", id));
    }

    function make(uint256 amountSeed, uint16 durationSeed, bool have) external {
        if (ids.length >= 10) return;
        uint256 amount = 1_000_000 + (amountSeed % 2_000_000_000);
        uint32 duration = 1 + uint32(durationSeed % 40);
        uint256 next = gift.nextGiftId();
        MilestoneGiftV2.MilestoneParams memory p = have
            ? _haveParams(VM.addr(FUNDER_KEY), GOAL_HAVE, amount, duration, _subject(next))
            : _climbParams(VM.addr(FUNDER_KEY), GOAL_CLIMB, amount, duration, 1500, 1400);
        p.refundTo = refundBox(next);
        ids.push(gift.createGift(p, _milestoneAuthorization(gift, p, FUNDER_KEY)));
    }

    function open(uint256 seed, bool other) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        uint256 key = other ? OTHER_KEY : RECIPIENT_KEY;
        gift.claim(id, _milestoneOpen(gift, id, VM.addr(key), LINK_KEY));
        keyOf[id] = key;
    }

    function prove(uint256 seed, uint16 metricSeed, uint32 ageSeed, bool old) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        MilestoneGiftV2.Gift memory g = gift.getGift(id);
        uint256 nowAt = VM.getBlockTimestamp();
        MilestoneGiftV2.ProofAttestation memory a;
        if (g.shape == 1) {
            uint64 eventAt =
                uint64(uint256(g.fundedAt) - 2 days + (uint256(ageSeed) % (uint256(g.durationDays) * 1 days + 5 days)));
            a = _milestoneProof(
                gift,
                id,
                VM.addr(keyOf[id]),
                _subject(id),
                PROVIDER_HAVE,
                uint64(metricSeed % 2),
                eventAt,
                uint64(nowAt)
            );
        } else {
            // A reading of now, of a few minutes ago, or one taken long ago (before the deadline, perhaps).
            uint256 age = old ? uint256(ageSeed) % 30 days : uint256(ageSeed) % 15 minutes;
            if (age > nowAt) age = 0;
            a = _milestoneProof(
                gift,
                id,
                VM.addr(keyOf[id]),
                keccak256(abi.encode("identity", id)),
                PROVIDER,
                1200 + uint64(metricSeed % 500),
                0,
                uint64(nowAt - age)
            );
        }
        bool settledBefore = g.settled;
        gift.prove(id, a);
        if (!settledBefore && gift.getGift(id).settled) ++reached;
    }

    function expire(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        gift.expire(id);
        ++expiries;
    }

    function refund(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (any) gift.refundUnearned(id);
    }

    function cancel(uint256 seed) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        VM.prank(VM.addr(FUNDER_KEY));
        gift.cancel(id);
    }

    function withdraw(uint256 seed, uint256 amountSeed, bool byIntent) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        uint256 available = gift.earnedBalance(id);
        uint256 amount = 1 + (amountSeed % (available + 1 + (amountSeed % 7 == 0 ? 1_000 : 0)));
        if (byIntent) {
            gift.withdrawEarnedWithIntent(id, _milestoneWithdraw(gift, id, payBox(id), amount, keyOf[id]));
        } else {
            VM.prank(VM.addr(keyOf[id]));
            gift.withdrawEarned(id, payBox(id), amount);
        }
        if (amount > available) forbidden = "withdrew more than was earned";
    }

    function end(uint256 seed, bool byIntent) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any || keyOf[id] == 0) return;
        (, uint256 giveBack) = gift.endPreview(id);
        uint256 boxBefore = token.balanceOf(refundBox(id));
        if (byIntent) {
            gift.endGiftWithIntent(id, _milestoneEnd(gift, id, giveBack, keyOf[id]));
        } else {
            VM.prank(VM.addr(keyOf[id]));
            gift.endGift(id, 0, giveBack);
        }
        if (token.balanceOf(refundBox(id)) - boxBefore != giveBack) {
            forbidden = "an ending did not send back what it said";
        }
        if (giveBack != gift.getGift(id).amount) forbidden = "an ending sent back less than the whole";
        ++endings;
    }

    function stranger(uint256 seed, uint8 what) external {
        (uint256 id, bool any) = _pick(seed);
        if (!any) return;
        address who = VM.addr(STRANGER_KEY);
        uint256 kind = what % 5;
        (, uint256 giveBack) = gift.endPreview(id);
        if (kind == 0) {
            VM.prank(who);
            try gift.withdrawEarned(id, who, 1) {
                forbidden = "a stranger withdrew";
            } catch {}
        } else if (kind == 1) {
            VM.prank(who);
            try gift.endGift(id, 0, giveBack) {
                forbidden = "a stranger ended a gift";
            } catch {}
        } else if (kind == 2) {
            VM.prank(who);
            try gift.cancel(id) {
                forbidden = "a stranger cancelled a gift";
            } catch {}
        } else if (kind == 3) {
            try gift.claim(id, _milestoneOpen(gift, id, who, STRANGER_KEY)) {
                forbidden = "a stranger opened a gift without the link key";
            } catch {}
        } else {
            try gift.endGiftWithIntent(id, _milestoneEnd(gift, id, giveBack, STRANGER_KEY)) {
                forbidden = "a stranger's signature ended a gift";
            } catch {}
            try gift.withdrawEarnedWithIntent(id, _milestoneWithdraw(gift, id, who, 1, STRANGER_KEY)) {
                forbidden = "a stranger's signature withdrew";
            } catch {}
        }
    }

    function pause(bool on) external {
        gift.setProofPaused(on);
    }

    function wait(uint32 secondsSeed) external {
        VM.warp(VM.getBlockTimestamp() + (uint256(secondsSeed) % 5 days));
    }

    function sweep() external {
        gift.setProofPaused(false);
        VM.warp(VM.getBlockTimestamp() + 500 days);
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            MilestoneGiftV2.Gift memory g = gift.getGift(id);
            if (!g.cancelled && !g.settled) gift.expire(id);
            try gift.refundUnearned(id) {} catch {}
            uint256 left = gift.earnedBalance(id);
            if (left > 0) {
                VM.prank(gift.getGift(id).recipient);
                gift.withdrawEarned(id, payBox(id), left);
            }
        }
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 150
/// forge-config: default.invariant.fail-on-revert = false
contract ReviewMilestoneInvariants {
    RMilestoneHandler private handler;
    MockAUSD private token;
    MilestoneGiftV2 private gift;

    function setUp() public {
        handler = new RMilestoneHandler();
        token = handler.token();
        gift = handler.gift();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory s = new bytes4[](11);
        s[0] = RMilestoneHandler.make.selector;
        s[1] = RMilestoneHandler.open.selector;
        s[2] = RMilestoneHandler.prove.selector;
        s[3] = RMilestoneHandler.expire.selector;
        s[4] = RMilestoneHandler.refund.selector;
        s[5] = RMilestoneHandler.cancel.selector;
        s[6] = RMilestoneHandler.withdraw.selector;
        s[7] = RMilestoneHandler.end.selector;
        s[8] = RMilestoneHandler.stranger.selector;
        s[9] = RMilestoneHandler.pause.selector;
        s[10] = RMilestoneHandler.wait.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector({addr: address(handler), selectors: s});
    }

    function _books() private view returns (uint256 held) {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            MilestoneGiftV2.Gift memory g = gift.getGift(id);
            uint256 paid = token.balanceOf(handler.payBox(id));
            uint256 refunded = token.balanceOf(handler.refundBox(id));
            require(paid == g.withdrawnByRecipient, "paid out is not what the book says");
            require(refunded == g.refundedToFunder, "sent back is not what the book says");
            require(g.earned == 0 || g.earned == g.amount, "a milestone was earned in part");
            require(paid <= g.earned, "paid more than was earned");
            require(g.earned + g.refundable + g.refundedToFunder <= g.amount, "the gift's money is promised twice");
            if (g.earned > 0) require(g.refundable == 0 && refunded == 0 && g.settled, "earned and also sent back");
            if (g.cancelled) require(refunded == g.amount && g.earned == 0, "a cancelled gift did not go back whole");
            if (g.endedAt != 0) {
                require(refunded == g.amount && g.earned == 0 && g.settled, "an ended gift did not go back whole");
            }
            if (g.settled) {
                require(
                    g.earned + g.refundable + g.refundedToFunder == g.amount, "a settled gift leaves money unassigned"
                );
            }
            held += g.amount - paid - refunded;
        }
    }

    function invariant_EveryGiftsMoneyIsWhereTheBookSaysAndNowhereElse() public view {
        require(token.balanceOf(address(gift)) == _books(), "the contract's balance is not the sum of its gifts");
        require(bytes(handler.forbidden()).length == 0, handler.forbidden());
    }

    function afterInvariant() public {
        handler.sweep();
        require(_books() == 0, "something is left in a gift after everything settled");
        require(token.balanceOf(address(gift)) == 0, "the contract still holds money after everything settled");
    }
}
