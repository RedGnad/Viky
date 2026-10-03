// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {V3Kit} from "./kit/V3Kit.sol";

/// @notice Every way money moves through the third daily contract, against the REAL AUSD on a copy of Monad mainnet:
///         paid in with the funder's one signature, paid out to the person the gift is for the day a lesson is read,
///         sent back day by day, sent back whole, and sent back at once when that person ends the gift. The mock token
///         of the other suites says what the contract means to do; this says what the token itself lets it do. The
///         second version's suite for the daily contract (test/V2MoneyPathsFork.t.sol), with the third version's
///         days, and one test more for what the third version is for.
///
///         Skips when MONAD_RPC_URL is not set. CI sets it to the public endpoint.
contract V3MoneyPathsForkTest is V3Kit {
    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    // The Curve AUSD/USDC/USDT0 pool holds AUSD reserves; it lends the test funder what the gifts are made of.
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    uint256 private constant DAY = 1 days;
    uint256 private constant DAILY_AMOUNT = 7_000_004; // seven days of 1.000000 and a dust of four units
    uint256 private constant PER_DAY = 1_000_000;
    uint8 private constant GOAL = 1;
    bytes32 private constant DAILY_PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    bytes32 private constant IDENTITY = keccak256("identity:ama");

    bool private forked;
    IERC20 private ausd;
    GiftEscrowV3 private escrow;
    address private funder;
    address private recipient;
    uint256 private start;
    uint32 private day0;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
        require(block.chainid == 143, "not Monad mainnet");
        ausd = IERC20(AUSD);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);

        escrow = new GiftEscrowV3(ausd, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.registerGoal(GOAL, DAILY_PROVIDER);

        // Three days on, at 08:00 UTC, so every moment the tests walk to is ahead of the copy's own clock.
        day0 = uint32(block.timestamp / DAY) + 3;
        start = uint256(day0) * DAY + 8 hours;
        VM.warp(start);

        VM.prank(CURVE_POOL);
        ausd.transfer(funder, 4 * DAILY_AMOUNT);
        require(
            ausd.balanceOf(funder) == 4 * DAILY_AMOUNT && ausd.balanceOf(recipient) == 0,
            "the test starts from known balances"
        );
    }

    modifier onFork() {
        if (!forked) {
            VM.skip(true);
            return;
        }
        _;
    }

    /// @dev What the third version is for: a lesson taken after the connection, read at noon that day, is real
    ///      money that same day, and can be taken out that same day.
    function testALessonReadTheDayItIsTakenIsRealMoneyThatDay() public onFork {
        uint256 id = _dailyBaselined();
        require(ausd.balanceOf(address(escrow)) == DAILY_AMOUNT, "the real AUSD arrived with one signature");
        uint256 noon = uint256(day0) * DAY + 12 hours;
        VM.warp(noon);
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1010, uint64(noon)));
        require(escrow.earnedBalance(id) == PER_DAY, "the day is theirs four hours after the connection");
        escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, recipient, PER_DAY, RECIPIENT_KEY));
        require(ausd.balanceOf(recipient) == PER_DAY, "one real dollar reached them");
        require(uint32(block.timestamp / DAY) == day0, "on the day the gift was connected");
    }

    /// @dev A whole gift: two days done and paid out, five missed and sent back with the dust, nothing left behind.
    function testADailyGiftPaysTheDaysDoneAndSendsTheRestBack() public onFork {
        uint256 id = _dailyBaselined();
        require(escrow.getGift(id).perDay == PER_DAY, "a day's share");

        // Two days done, the first and the second, read by the pass of the second morning.
        VM.warp(_readAt(day0 + 1));
        escrow.checkIn(
            id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1020, uint64(_readAt(day0 + 1)))
        );
        require(escrow.earnedBalance(id) == 2 * PER_DAY, "two days are theirs");

        // Paid out by the relayer on the recipient's signed intent.
        escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, recipient, 2 * PER_DAY, RECIPIENT_KEY));
        require(ausd.balanceOf(recipient) == 2 * PER_DAY, "two real dollars reached them");

        // Nothing more is done. Once the window of the last day has closed, the rest goes back, the dust with it.
        VM.warp(uint256(day0 + 6 + 2) * DAY + 6 hours);
        escrow.finalise(id);
        uint256 before = ausd.balanceOf(funder);
        escrow.refundUnearned(id);
        require(ausd.balanceOf(funder) == before + 5 * PER_DAY + 4, "five days and the dust came back");
        require(ausd.balanceOf(address(escrow)) == 0, "and the contract holds nothing of this gift");
    }

    /// @dev The person it is for ends it: what was counted stays theirs, the rest goes back in the same transaction.
    function testEndingADailyGiftSendsTheRestBackAtOnce() public onFork {
        uint256 id = _dailyBaselined();
        VM.warp(_readAt(day0 + 1));
        escrow.checkIn(
            id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1020, uint64(_readAt(day0 + 1)))
        );

        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == 2 * PER_DAY && giveBack == 5 * PER_DAY + 4, "the two figures the screen prints");
        uint256 before = ausd.balanceOf(funder);
        escrow.endGiftWithIntent(id, _dailyEnd(escrow, id, keep, giveBack, RECIPIENT_KEY));
        require(ausd.balanceOf(funder) == before + giveBack, "the rest came back in that transaction");
        require(ausd.balanceOf(address(escrow)) == keep, "the contract holds exactly what is theirs");

        escrow.withdrawEarnedWithIntent(id, _dailyWithdraw(escrow, id, recipient, keep, RECIPIENT_KEY));
        require(ausd.balanceOf(recipient) == keep && ausd.balanceOf(address(escrow)) == 0, "and they take it as before");
    }

    /// @dev A gift nobody opens: the funder takes it back, or it comes back by itself after fourteen days.
    function testAnUnopenedDailyGiftComesBackWhole() public onFork {
        uint256 taken = _dailyCreate();
        uint256 left = _dailyCreate();
        uint256 before = ausd.balanceOf(funder);
        VM.prank(funder);
        escrow.cancel(taken);
        require(ausd.balanceOf(funder) == before + DAILY_AMOUNT, "taken back by the funder");

        VM.warp(start + 14 days);
        escrow.refundUnearned(left);
        require(ausd.balanceOf(funder) == before + 2 * DAILY_AMOUNT, "or back by itself after fourteen days");
        require(ausd.balanceOf(address(escrow)) == 0, "nothing left");
    }

    /// @dev The theft the audit proved on the first version, on the real token: the evidence key alone takes nothing.
    function testTheEvidenceKeyAloneTakesNothingFromAnUnopenedGift() public onFork {
        uint256 daily = _dailyCreate();
        address thief = VM.addr(0x7E1EF);
        GiftEscrowV3.OpenIntent memory dailyOpen = _dailyOpen(escrow, daily, thief, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        escrow.claim(daily, dailyOpen);
        GiftEscrowV3.CheckInAttestation memory progress =
            _dailyReading(escrow, daily, thief, IDENTITY, DAILY_PROVIDER, 1000, uint64(start));
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        escrow.checkIn(daily, progress);
        require(ausd.balanceOf(thief) == 0, "nothing reached the thief");
        require(ausd.balanceOf(address(escrow)) == DAILY_AMOUNT, "the daily gift is whole");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _readAt(uint32 day) private pure returns (uint256) {
        return uint256(day) * DAY + 30 minutes;
    }

    function _dailyCreate() private returns (uint256) {
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, DAILY_AMOUNT, 7, 10);
        return escrow.createGift(p, _dailyAuthorization(escrow, p, FUNDER_KEY));
    }

    function _dailyBaselined() private returns (uint256 id) {
        id = _dailyCreate();
        escrow.claim(id, _dailyOpen(escrow, id, recipient, LINK_KEY));
        escrow.checkIn(id, _dailyReading(escrow, id, recipient, IDENTITY, DAILY_PROVIDER, 1000, uint64(start)));
    }
}
