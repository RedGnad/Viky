// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../../contracts/GiftEscrowV3.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {V3Kit} from "../kit/V3Kit.sol";

struct FuzzSelector {
    address addr;
    bytes4[] selectors;
}

/// @notice The reviewer's own campaign on the daily contract (2 Oct 2026, test/review/ReviewInvariants.t.sol), run on
///         the third daily contract with no line of it changed but the contract's name. Every gift pays out to an
///         address of its own and refunds to an address of its own, so each gift's money is followed on token
///         balances that moved.
contract RDailyHandlerV3 is V3Kit {
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("review provider");
    uint256 private constant FUNDER_B = 0xF00E;
    uint256 private constant STRANGER_KEY = 0xBAD;

    MockAUSD public immutable token;
    GiftEscrowV3 public immutable escrow;
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
        escrow = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
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
        GiftEscrowV3.GiftParams memory p = _dailyParams(VM.addr(fk), GOAL, amount, duration, 10);
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
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
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
            GiftEscrowV3.Gift memory g = escrow.getGift(id);
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
contract ReviewDailyInvariantsV3 {
    RDailyHandlerV3 private handler;
    MockAUSD private token;
    GiftEscrowV3 private escrow;

    function setUp() public {
        handler = new RDailyHandlerV3();
        token = handler.token();
        escrow = handler.escrow();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory targets) {
        bytes4[] memory s = new bytes4[](14);
        s[0] = RDailyHandlerV3.make.selector;
        s[1] = RDailyHandlerV3.open.selector;
        s[2] = RDailyHandlerV3.read.selector;
        s[3] = RDailyHandlerV3.morning.selector;
        s[4] = RDailyHandlerV3.drain.selector;
        s[5] = RDailyHandlerV3.finalise.selector;
        s[6] = RDailyHandlerV3.refund.selector;
        s[7] = RDailyHandlerV3.cancel.selector;
        s[8] = RDailyHandlerV3.withdraw.selector;
        s[9] = RDailyHandlerV3.end.selector;
        s[10] = RDailyHandlerV3.endWithOtherAmounts.selector;
        s[11] = RDailyHandlerV3.stranger.selector;
        s[12] = RDailyHandlerV3.pause.selector;
        s[13] = RDailyHandlerV3.wait.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector({addr: address(handler), selectors: s});
    }

    function _books() private view returns (uint256 held) {
        uint256 n = handler.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = handler.ids(i);
            GiftEscrowV3.Gift memory g = escrow.getGift(id);
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
