// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../../contracts/GiftEscrowV3.sol";
import {ReviewerRig} from "./ReviewerRigV3.sol";

/// @notice The first day of a gift when its first reading passes midnight (the independent re-read of 3 Oct 2026,
///         finding C1, and the founder's decision the same day: corrected in the contract).
///
///         The first day was the day the reading was observed. Observed at 23:50 UTC and carried by a block of 00:10,
///         it opened a first day already over: no money was lost, the catch-up window paid it the day after, but a
///         person at one lesson a day was then paid a day late for the whole gift, which is what the third version
///         exists to end. The first day is now the day of the block that carries the reading.
///
///         The first four tests are the reviewer's own, as he wrote them on a copy of the contract carrying the
///         one line (`GiftEscrowV3Fix`), run here on the contract itself. The first of them failed on the contract
///         as it stood at a1fdb4b. The last two are what the correction costs, said by him and tested here: the
///         first day now depends on the block and not on a signed figure, so whoever sends the transaction can,
///         by holding it a few minutes around midnight, move the first day a day later. That is to the recipient's
///         advantage and costs the funder nothing.
contract FirstDayAcrossMidnightV3Test is ReviewerRig {
    /// @dev A first reading observed at 23:50 and carried by a block at 00:10.
    function acrossMidnight(GiftEscrowV3 e) internal returns (uint256 id) {
        vm.warp(at(D0, 23, 50, 0));
        uint64 observed = now64();
        id = create(e, AMOUNT, 7);
        claim(e, id);
        vm.warp(at(D0 + 1, 0, 10, 0));
        first(e, id, BASE, observed);
    }

    /// @dev His `test_F1_FAILS_onV3_theFirstDayIsOverBeforeTheGiftStarts`: expected 20001, the contract gave 20000.
    function test_F1_theFirstDayIsTheDayTheGiftStartsOn() public {
        uint256 id = acrossMidnight(v3);
        eq(v3.getGift(id).startDay, today(), "the first day is the day the gift starts on");
    }

    /// @dev His `test_F1_passes_onTheCorrection`.
    function test_F1_passes_onTheCorrection() public {
        uint256 id = acrossMidnight(v3);
        eq(v3.getGift(id).startDay, today(), "the first day is the day the gift starts on");
        // A reading observed before midnight too, and sent after the first: refused by name, nothing moves.
        err(tryRead(v3, id, BASE + 10, at(D0, 23, 55, 0)), NTC, "a reading observed before the first day");
        vm.warp(at(D0 + 1, 12, 0, 0));
        ok(tryRead(v3, id, BASE + 10, now64()), "a lesson that day pays it");
        eq(v3.getGift(id).settledThroughDay, D0 + 1, "the first day");
    }

    /// @dev The correction keeps every guarantee of his point 1, and no reading panics on it.
    function testFuzz_F1_correction_walk(uint256 seed) public {
        walk(v3, seed);
    }

    function testFuzz_F1_correction_noReadingPanics(uint256 seed) public {
        laterReading(v3, seed, false);
    }

    // --- what the correction costs: the counterpart, written by the author from the reviewer's own words -------

    /// @dev The same reading, observed at 23:59:00. Sent at once it opens the day it was observed; held for a
    ///      minute and a half, past midnight, it opens the next. Nothing else of the gift differs.
    function sentBeforeAndAfterMidnight() internal returns (uint256 atOnce, uint256 held) {
        vm.warp(at(D0, 23, 59, 0));
        uint64 observed = now64();
        atOnce = create(v3, AMOUNT, 7);
        claim(v3, atOnce);
        held = create(v3, AMOUNT, 7);
        claim(v3, held);
        vm.warp(at(D0, 23, 59, 30));
        first(v3, atOnce, BASE, observed);
        vm.warp(at(D0 + 1, 0, 0, 30));
        first(v3, held, BASE, observed);
    }

    function test_C1_aSendingHeldPastMidnightMovesTheFirstDayByOneDay() public {
        (uint256 atOnce, uint256 held) = sentBeforeAndAfterMidnight();
        GiftEscrowV3.Gift memory a = v3.getGift(atOnce);
        GiftEscrowV3.Gift memory b = v3.getGift(held);
        eq(a.startDay, D0, "sent before midnight: the first day is the day observed");
        eq(b.startDay, D0 + 1, "held past midnight: the first day is the next");
        eq(b.endDay, a.endDay + 1, "and the last day moves with it");
        // The same number of days, each worth the same, and nothing credited by the first reading either way.
        eq(b.endDay - b.startDay, a.endDay - a.startDay, "the same number of days");
        eq(b.perDay, a.perDay, "each worth the same");
        eq(a.creditedDays + b.creditedDays, 0, "the first reading credits nothing");
        eq(a.baselineValue, b.baselineValue, "from the same baseline");
    }

    /// @dev It costs the funder nothing. With a lesson every day of the gift, each gift pays its seven days and no
    ///      more. With none at all, each gives everything back. The delay never adds a day, and never a unit.
    function test_C1_theDelayCostsTheFunderNothing() public {
        (uint256 atOnce, uint256 held) = sentBeforeAndAfterMidnight();
        // A lesson a day, read at noon, from the first day of the later gift to its last.
        uint64 metric = BASE;
        for (uint32 day = D0 + 1; day <= D0 + 7; day++) {
            vm.warp(at(day, 12, 0, 0));
            metric += TARGET;
            tryRead(v3, held, metric, now64());
        }
        eq(v3.getGift(held).creditedDays, 7, "the gift held past midnight pays its seven days");
        eq(v3.earnedBalance(held), 7 * PER, "seven days, and not one more");
        // The gift sent at once is given no lesson at all: every day of it goes back.
        uint256 before = coin.balanceOf(refundTo);
        vm.warp(at(D0 + 20, 0, 0, 0));
        v3.finalise(atOnce);
        v3.finalise(held);
        ok(tryRefund(v3, atOnce), "the unearned gift is sent back");
        ok(tryRefund(v3, held), "the dust of the earned one too");
        eq(coin.balanceOf(refundTo) - before, AMOUNT + (AMOUNT - 7 * PER), "all of one, and the dust of the other");
        takeOut(v3, held);
        eq(coin.balanceOf(recip), 7 * PER, "the recipient holds seven days");
        eq(coin.balanceOf(address(v3)), 0, "nothing stays in the contract");
    }
}
