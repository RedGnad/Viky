// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V3Kit} from "./kit/V3Kit.sol";

/// @notice The rule of the third daily contract, one test for each thing it says (the founder, 3 Oct 2026): a day
///         is paid the day it is read. The first day is the day the account is connected; a reading credits the
///         open days up to its own, the oldest first; once every open day is paid nothing is set aside. Each test
///         is named by what it proves. What the second version already did, and the third leaves alone, is in
///         `GiftEscrowV3.t.sol` and the suites beside it.
contract GiftEscrowV3RuleTest is V3Kit {
    uint256 private constant DAY = 1 days;
    // 08:00 UTC on some day, so the arithmetic crosses real day boundaries.
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 7_000_000;
    uint32 private constant TARGET = 10;
    uint32 private constant DURATION = 7;
    uint256 private constant PER_DAY = 1_000_000;
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("a source that moves");
    bytes32 private constant IDENTITY = keccak256("identity:ama");

    MockAUSD private token;
    GiftEscrowV3 private escrow;
    address private funder;
    address private recipient;
    uint32 private day0;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        token = new MockAUSD();
        token.mint(funder, 1_000_000_000);
        escrow = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.registerGoal(GOAL, PROVIDER);
        escrow.setCreationPaused(false);
        day0 = uint32(START / DAY);
    }

    // --- the first day ----------------------------------------------------------------------------------------

    function test_firstDayIsTheDayOfConnection() public {
        uint256 id = _connected(1000);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.startDay == day0, "the first day is the day of the first reading");
        require(g.endDay == day0 + DURATION - 1, "and the last one follows from it");
        require(g.settledThroughDay == day0 - 1, "no day is settled yet");
    }

    function test_firstReadingCreditsNothing_andWhatCameBeforeIsInTheBaseline() public {
        // The account already holds 1000 when it is connected: whatever made that figure was done before.
        uint256 id = _connected(1000);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 0 && escrow.earnedBalance(id) == 0, "nothing is earned by connecting");
        require(g.baselineValue == 1000, "the baseline is the figure read");
        // A reading a minute later with the same figure: a lesson taken before the connection pays nothing.
        _refused(id, 1000, START + 1 minutes, GiftEscrowV3.InsufficientProgress.selector);
    }

    // --- a day is paid the day it is read -----------------------------------------------------------------------

    function test_lessonReadTheSameDayPaysThatDay() public {
        uint256 id = _connected(1000);
        // One lesson after the connection, read at noon the same day.
        _read(id, 1010, _at(day0, 12 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the day is credited the day it is read");
        require(escrow.earnedBalance(id) == PER_DAY, "and its share is the recipient's");
    }

    function test_sameProgressNeverPaysTwice() public {
        uint256 id = _connected(1000);
        _read(id, 1010, _at(day0, 12 hours));
        // The same figure, read again an hour later: the day is paid, there is nothing to credit.
        _refused(id, 1010, _at(day0, 13 hours), GiftEscrowV3.NothingToCredit.selector);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.baselineValue == 1010, "nothing moved");
        require(g.lastCheckInAt == _at(day0, 12 hours), "and the refused reading left no trace");
    }

    function test_nextMorningReadingPaysNothingMoreForYesterday() public {
        uint256 id = _connected(1000);
        _read(id, 1010, _at(day0, 12 hours));
        // The pass of the next morning, with no lesson since: yesterday was paid yesterday.
        _refused(id, 1010, _at(day0 + 1, 30 minutes), GiftEscrowV3.InsufficientProgress.selector);
        require(escrow.getGift(id).creditedDays == 1, "one lesson, one day");
    }

    // --- nothing is set aside once the open days are paid -------------------------------------------------------

    function test_excessIsDiscardedOnceOpenDaysArePaid() public {
        uint256 id = _connected(1000);
        // Three targets of progress, one open day: one day, and the baseline is the figure read.
        _read(id, 1030, _at(day0, 12 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.baselineValue == 1030, "one day credited, the excess not kept");
        // The next day with no lesson: the two targets past the first pay nothing.
        _refused(id, 1030, _at(day0 + 1, 12 hours), GiftEscrowV3.InsufficientProgress.selector);
        require(escrow.getGift(id).creditedDays == 1, "the excess did not pay tomorrow");
    }

    function test_remainderIsDiscardedOnceOpenDaysArePaid() public {
        uint256 id = _connected(1000);
        // One target and a half, one open day: one day, and the half is not kept.
        _read(id, 1015, _at(day0, 12 hours));
        require(escrow.getGift(id).baselineValue == 1015, "the baseline is the figure read, remainder included");
        // The next day, half a target more: with the half kept it would make one. It does not.
        _refused(id, 1020, _at(day0 + 1, 12 hours), GiftEscrowV3.InsufficientProgress.selector);
        // A whole target since the last reading does.
        _read(id, 1025, _at(day0 + 1, 13 hours));
        require(escrow.getGift(id).creditedDays == 2, "a whole target taken that day pays it");
    }

    function test_partialProgressWaitsWhileADayIsStillOpen() public {
        uint256 id = _connected(1000);
        // Nothing on the first day. On the second, two days are open and a target and a half is read.
        _read(id, 1015, _at(day0 + 1, 12 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the first day is paid");
        require(g.baselineValue == 1010, "and the half waits for the day still open");
        // Half a target more: with the half kept it makes one, and the second day is paid.
        _read(id, 1020, _at(day0 + 1, 13 hours));
        g = escrow.getGift(id);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "the second day is paid");
        require(g.baselineValue == 1020, "and nothing is left over");
    }

    // --- the oldest open day first -----------------------------------------------------------------------------

    function test_oldestOpenDayIsPaidFirst() public {
        uint256 id = _connected(1000);
        // No lesson on the first day. One on the second, read that day: it is the first day that is paid.
        _read(id, 1010, _at(day0 + 1, 12 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the missed first day is the one credited");
        // The second day is still open, and a second lesson pays it.
        _read(id, 1020, _at(day0 + 1, 18 hours));
        g = escrow.getGift(id);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "then the second");
    }

    function test_twoTargetsCatchUpYesterdayAndPayToday() public {
        uint256 id = _connected(1000);
        // Two lessons on the second day, read once: yesterday and today, in one reading.
        _read(id, 1020, _at(day0 + 1, 12 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "two days credited in one reading");
        require(escrow.earnedBalance(id) == 2 * PER_DAY, "both are the recipient's");
    }

    // --- a missed day goes back only after its window -----------------------------------------------------------

    function test_aDayGoesBackOnlyAfterItsWindow() public {
        uint256 id = _connected(1000);
        // The first day can still be paid until 06:00 UTC two days later: a second before, nothing goes back.
        VM.warp(_at(day0 + 2, 6 hours) - 1);
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        escrow.drain(id);
        // From 06:00 it does.
        VM.warp(_at(day0 + 2, 6 hours));
        escrow.drain(id);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.drainedDays == 1 && g.settledThroughDay == day0, "the first day went back, and only it");
        require(escrow.refundableBalance(id) == PER_DAY, "its share is the funder's");
        // A reading afterwards pays only the days still open: the second and the third.
        _read(id, 1050, _at(day0 + 2, 7 hours));
        g = escrow.getGift(id);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 2, "two open days, two credited");
        require(g.drainedDays == 1, "and the day that went back stays gone");
    }

    function test_aReadingInsideTheWindowStillPaysTheDayBeforeItGoesBack() public {
        uint256 id = _connected(1000);
        // The last second of the first day's window: one lesson is read, and it is the first day that is paid.
        _read(id, 1010, _at(day0 + 2, 6 hours) - 1);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.drainedDays == 0 && g.settledThroughDay == day0, "paid, not drained");
    }

    // --- the end of the window ----------------------------------------------------------------------------------

    function test_lastDayIsPaidOnTheLastDay() public {
        uint256 id = _connected(1000);
        uint64 metric = 1000;
        for (uint32 k = 0; k < DURATION; ++k) {
            metric += TARGET;
            _read(id, metric, _at(day0 + k, 12 hours));
        }
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == DURATION && g.settledThroughDay == g.endDay, "every day paid, the last included");
        require(uint32(VM.getBlockTimestamp() / DAY) == g.endDay, "on the last day itself");
        // The gift is closed as before: once the last day's window has run out, and no sooner.
        VM.warp(_at(g.endDay + 2, 6 hours) - 1);
        VM.expectRevert(GiftEscrowV3.FinalisationTooEarly.selector);
        escrow.finalise(id);
        VM.warp(_at(g.endDay + 2, 6 hours));
        escrow.finalise(id);
        require(escrow.getGift(id).finalised && escrow.refundableBalance(id) == 0, "nothing goes back");
    }

    function test_readingAfterTheEndPaysOnlyDaysStillOpen() public {
        uint256 id = _connected(1000);
        // Nothing read during the gift. The morning after its last day, a reading with ten targets of progress.
        _read(id, 1100, _at(day0 + DURATION, 30 minutes));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        // The windows of the last two days are still running: they are paid. The five before them went back first.
        require(g.drainedDays == DURATION - 2 && g.creditedDays == 2, "five went back, two were credited");
        require(g.settledThroughDay == g.endDay, "never past the last day");
        // A day later every window has run out: nothing is left to credit.
        _refused(id, 1200, _at(day0 + DURATION + 1, 30 minutes), GiftEscrowV3.NothingToCredit.selector);
    }

    // --- the edges of a day -------------------------------------------------------------------------------------

    function test_connectionLateInTheDay_firstDayStaysPayableInItsWindow() public {
        uint256 id = _open();
        // Connected thirty seconds before midnight UTC: that day is the first all the same.
        uint256 late = _at(day0, 24 hours) - 30;
        VM.warp(late);
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1000, uint64(late)));
        require(escrow.getGift(id).startDay == day0, "the first day is the day of the connection");
        // A lesson the next day pays the first day, the oldest open, and the next day is still open.
        _read(id, 1010, _at(day0 + 1, 9 hours));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the first day is paid by the next day's lesson");
        // A second lesson that day pays the second day.
        _read(id, 1020, _at(day0 + 1, 20 hours));
        require(escrow.getGift(id).settledThroughDay == day0 + 1, "and a second one pays that day");
    }

    function test_observationJustBeforeMidnight_minedAfter_creditsTheObservedDay() public {
        uint256 id = _connected(1000);
        // Read ten seconds before midnight, carried by a block twenty seconds after it.
        uint256 observed = _at(day0, 24 hours) - 10;
        VM.warp(observed + 30);
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1010, uint64(observed)));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 1 && g.settledThroughDay == day0, "the day it was observed is the day paid");
        // The day the block fell in is still open: what was read before midnight did not pay it.
        _read(id, 1020, _at(day0 + 1, 12 hours));
        require(escrow.getGift(id).settledThroughDay == day0 + 1, "the next day is paid by its own lesson");
    }

    function test_aReadingDatedAheadOfItsBlockNeverOpensADayThatHasNotBegun() public {
        uint256 id = _connected(1000);
        _read(id, 1010, _at(day0, 12 hours));
        // Thirty seconds before midnight, a reading dated ten seconds after it: inside the clock's tolerance.
        uint256 block_ = _at(day0, 24 hours) - 30;
        VM.warp(block_);
        GiftEscrowV3.CheckInAttestation memory ahead =
            _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, 1020, uint64(block_ + 40));
        // Today is paid, tomorrow has not begun: nothing to credit, whatever the reading's date says.
        VM.expectRevert(GiftEscrowV3.NothingToCredit.selector);
        escrow.checkIn(id, ahead);
        // The same for a connection: its first day is the day of the block that carries it.
        uint256 second = _open();
        escrow.checkIn(second, _dailyReading(escrow, second, recipient, IDENTITY, PROVIDER, 1000, uint64(block_ + 40)));
        require(escrow.getGift(second).startDay == day0, "the first day is a day that has begun");
    }

    // --- what a cumulative figure cannot say ---------------------------------------------------------------------

    /// @dev The case the founder accepted on 3 Oct 2026 (option A1), written as it behaves. The figure is a running
    ///      total: between two readings the contract cannot know when the progress was made.
    function test_secondLessonTheSameDay_isCountedByTheNextReading() public {
        uint256 id = _connected(1000);
        // 09:00, a first lesson: the day is paid.
        _read(id, 1010, _at(day0, 9 hours));
        // 13:00, a second lesson the same day. The day is paid already: the reading is refused and changes nothing.
        _refused(id, 1020, _at(day0, 13 hours), GiftEscrowV3.NothingToCredit.selector);
        require(escrow.getGift(id).baselineValue == 1010, "the baseline did not move");
        // The first reading of the next day finds one target of progress, and pays that day: no lesson was taken on it.
        _read(id, 1020, _at(day0 + 1, 30 minutes));
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 2 && g.settledThroughDay == day0 + 1, "yesterday's second lesson paid today");
        // Two lessons, two days: one lesson never pays two days, and no more days are paid than lessons were taken.
        _refused(id, 1020, _at(day0 + 1, 12 hours), GiftEscrowV3.NothingToCredit.selector);
        _refused(id, 1020, _at(day0 + 2, 12 hours), GiftEscrowV3.InsufficientProgress.selector);
    }

    // --- never more days than have begun -------------------------------------------------------------------------

    /// @dev Any walk of readings, drains and jumps in time, the clock's tolerance included: no day that has not
    ///      begun is ever settled, no day is settled twice, and what is credited never exceeds the lessons read.
    function testFuzz_neverMoreDaysCreditedThanDaysBegun(uint256 seed) public {
        uint256 id = _connected(1000);
        uint64 metric = 1000;
        uint256 lessons;
        uint256 clock = START;
        for (uint256 step = 0; step < 40; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            // Between one minute and a day and a half later.
            clock += 60 + (seed % (36 hours));
            VM.warp(clock);
            uint256 choice = (seed >> 64) % 4;
            if (choice == 0) {
                try escrow.drain(id) {} catch {}
            } else {
                // A reading: zero to three lessons since the last one, observed up to twenty minutes ago, or up to
                // a minute ahead of the block.
                uint64 taken = uint64((seed >> 96) % 4);
                uint256 offset = (seed >> 128) % 1260;
                uint256 observed = offset < 60 ? clock + offset : clock - (offset - 60);
                GiftEscrowV3.CheckInAttestation memory a =
                    _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, metric + taken * TARGET, uint64(observed));
                try escrow.checkIn(id, a) {
                    metric += taken * TARGET;
                    lessons += taken;
                } catch {}
            }
            GiftEscrowV3.Gift memory g = escrow.getGift(id);
            uint32 today = uint32(clock / DAY);
            require(
                g.settledThroughDay <= (today < g.endDay ? today : g.endDay), "a day that has not begun was settled"
            );
            require(g.creditedDays + g.drainedDays <= DURATION, "more days settled than the gift has");
            require(
                g.creditedDays + g.drainedDays == g.settledThroughDay + 1 - g.startDay,
                "a day settled twice, or skipped"
            );
            require(g.creditedDays <= lessons, "more days credited than lessons read");
            require(escrow.earnedBalance(id) + escrow.refundableBalance(id) <= AMOUNT, "more money than the gift holds");
        }
    }

    // --- helpers ------------------------------------------------------------------------------------------------

    function _at(uint32 day, uint256 intoTheDay) private pure returns (uint256) {
        return uint256(day) * DAY + intoTheDay;
    }

    function _open() private returns (uint256 id) {
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, AMOUNT, DURATION, TARGET);
        id = escrow.createGift(p, _dailyAuthorization(escrow, p, FUNDER_KEY));
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
    }

    /// @dev A gift opened and connected at 08:00 UTC on day0, with the figure the account then holds.
    function _connected(uint64 baseline) private returns (uint256 id) {
        id = _open();
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, baseline, uint64(START)));
    }

    function _read(uint256 id, uint64 metric, uint256 when) private {
        VM.warp(when);
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, metric, uint64(when)));
    }

    function _refused(uint256 id, uint64 metric, uint256 when, bytes4 why) private {
        VM.warp(when);
        GiftEscrowV3.CheckInAttestation memory a =
            _dailyReading(escrow, id, recipient, IDENTITY, PROVIDER, metric, uint64(when));
        VM.expectRevert(why);
        escrow.checkIn(id, a);
    }
}
