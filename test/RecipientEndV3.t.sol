// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";

interface VmEndV3 {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
}

/// @notice The person a daily gift is for ends it (the audit of 1 Oct 2026, section 3.6): what was counted stays
///         theirs, the rest goes back to the funder in the same transaction, and the ending is final. The second
///         version's suite on the third daily contract, which leaves the ending as it was: the dates are a day
///         earlier, because the first day of a gift is now the day it is connected and a reading pays its own
///         day. Mock token.
contract RecipientEndDailyV3Test {
    VmEndV3 private constant VM = VmEndV3(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant FUNDER_KEY = 0xF00D;
    uint256 private constant RECIPIENT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    /// @dev The key the gift's link carries: its address is in the terms the funder signs.
    uint256 private constant LINK_KEY = 0x11AB;
    uint256 private constant DAY = 1 days;
    // 08:00 UTC on some day.
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 7_000_000;
    uint32 private constant TARGET = 10;
    uint32 private constant DURATION = 7;
    uint256 private constant PER_DAY = 1_000_000;
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8");
    bytes32 private constant IDENTITY = keccak256("identity:ama");

    MockAUSD private token;
    GiftEscrowV3 private escrow;
    address private funder;
    address private recipient;
    address private other;
    uint256 private nullifierSeed;
    uint256 private saltSeed;
    uint32 private day0;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        escrow = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        escrow.setCreationPaused(false);
        escrow.setCheckInPaused(false);
        escrow.registerGoal(GOAL, PROVIDER);
        token.mint(funder, 1_000_000_000);
        day0 = uint32(START / DAY);
    }

    // --- the ending itself --------------------------------------------------------------------------------

    /// @dev The founder's sentence: keep what was earned, give the rest back at once.
    function testEndKeepsCountedDaysAndGivesTheRestBackAtOnce() public {
        uint256 id = _baselined();
        // Two days done, the first and the second, read by the pass of the second morning.
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1020, morning);
        require(escrow.getGift(id).creditedDays == 2, "two days counted");

        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == 2 * PER_DAY && giveBack == 5 * PER_DAY, "the two figures the screen prints");

        uint256 funderBefore = token.balanceOf(funder);
        GiftEscrowV3.EndIntent memory e = _end(id, keep, giveBack, 0, uint64(morning + 10 minutes), RECIPIENT_KEY);
        // Anyone may carry it: here, a stranger stands in for the relayer.
        VM.prank(other);
        escrow.endGiftWithIntent(id, e);

        require(token.balanceOf(funder) == funderBefore + 5 * PER_DAY, "the rest came back in the same transaction");
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.finalised && !g.cancelled && g.endedAt == morning, "ended");
        require(g.creditedDays == 2 && g.drainedDays == 0 && g.givenBackDays == 5, "2 counted, 0 missed, 5 given back");
        require(g.refundable == 5 * PER_DAY && g.refundedToFunder == 5 * PER_DAY, "nothing left owed to the funder");
        require(escrow.earnedBalance(id) == 2 * PER_DAY, "what was counted is still theirs");
        require(token.balanceOf(address(escrow)) == 2 * PER_DAY, "the contract holds exactly what is theirs");

        // And they take it exactly as before, with the next nonce.
        GiftEscrowV3.WithdrawIntent memory w = _withdraw(id, recipient, 2 * PER_DAY, 1, uint64(morning + 10 minutes));
        escrow.withdrawEarnedWithIntent(id, w);
        require(token.balanceOf(recipient) == 2 * PER_DAY && token.balanceOf(address(escrow)) == 0, "taken");
    }

    /// @dev Days already lost under the gift's own rule are said as missed, not as given back.
    function testEndSettlesTheDaysAlreadyLostAsMissed() public {
        uint256 id = _baselined();
        // Nothing done. On the fourth day at 08:00, the first two are past their catch-up; the third could still be
        // caught. A day earlier than on the second version: the first day is the day of the connection.
        uint256 at = _dayStart(day0 + 3) + 8 hours;
        VM.warp(at);
        require(escrow.lastDrainableDay() == day0 + 1, "the first two days are lost");
        VM.prank(recipient);
        escrow.endGift(id, 0, AMOUNT);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.creditedDays == 0 && g.drainedDays == 2 && g.givenBackDays == 5, "0 counted, 2 missed, 5 given back");
        require(token.balanceOf(funder) == 1_000_000_000, "the whole amount is back with the funder");
        require(token.balanceOf(address(escrow)) == 0, "nothing left");
    }

    /// @dev What a missed day already sent back is not sent twice: `giveBack` is what leaves now.
    function testEndAfterMissedDaysWereAlreadyReturned() public {
        uint256 id = _baselined();
        uint256 at = _dayStart(day0 + 3) + 8 hours;
        VM.warp(at);
        escrow.drain(id);
        escrow.refundUnearned(id);
        require(escrow.getGift(id).refundedToFunder == 2 * PER_DAY, "two missed days already back");
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == 0 && giveBack == 5 * PER_DAY, "only what is still here");
        uint256 funderBefore = token.balanceOf(funder);
        VM.prank(recipient);
        escrow.endGift(id, keep, giveBack);
        require(token.balanceOf(funder) == funderBefore + 5 * PER_DAY, "five more");
        require(escrow.getGift(id).refundedToFunder == AMOUNT, "seven in all");
    }

    /// @dev The rounding dust is the funder's, as at an ordinary end.
    function testEndReturnsTheRoundingDustToTheFunder() public {
        GiftEscrowV3.GiftParams memory p = _params(10_000_000, 7);
        uint256 id = escrow.createGift(p, _authorization(p));
        _claim(id);
        _checkIn(id, 1000, START);
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1010, morning);
        uint256 perDay = uint256(10_000_000) / 7; // 1.428571
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == perDay && giveBack == 10_000_000 - perDay, "dust goes back");
        VM.prank(recipient);
        escrow.endGift(id, keep, giveBack);
        require(token.balanceOf(address(escrow)) == perDay, "exactly one day stays");
    }

    /// @dev Opened and never connected: today the funder waits fourteen days from the opening.
    function testEndBeforeTheFirstReadingGivesEverythingBack() public {
        uint256 id = escrow.createGift(_p(), _authorization(_p0()));
        _claim(id);
        uint256 funderBefore = token.balanceOf(funder);
        VM.prank(recipient);
        escrow.endGift(id, 0, AMOUNT);
        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(g.finalised && g.givenBackDays == DURATION && g.startDay == 0, "no day was ever open");
        require(token.balanceOf(funder) == funderBefore + AMOUNT, "all of it, at once");
        VM.warp(START + 15 days);
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        escrow.refundUnearned(id);
    }

    function testEndCountsWhatWasAlreadyTakenOutAsKept() public {
        uint256 id = _baselined();
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1020, morning);
        VM.prank(recipient);
        escrow.withdrawEarned(id, recipient, PER_DAY);
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        require(keep == 2 * PER_DAY && giveBack == 5 * PER_DAY, "kept is counted days, taken or not");
        VM.prank(recipient);
        escrow.endGift(id, keep, giveBack);
        require(escrow.earnedBalance(id) == PER_DAY && token.balanceOf(address(escrow)) == PER_DAY, "one left to take");
    }

    // --- who, and under which signature ------------------------------------------------------------------

    function testOnlyTheRecipientCanEnd() public {
        uint256 id = _baselined();
        // Not the funder, not the owner (this contract), not a stranger.
        VM.prank(funder);
        VM.expectRevert(GiftEscrowV3.NotRecipient.selector);
        escrow.endGift(id, 0, AMOUNT);
        VM.expectRevert(GiftEscrowV3.NotRecipient.selector);
        escrow.endGift(id, 0, AMOUNT);
        // An intent signed by the funder, or by the evidence signer, is not the recipient's.
        uint64 d = uint64(START + 10 minutes);
        GiftEscrowV3.EndIntent memory byFunder = _end(id, 0, AMOUNT, 0, d, FUNDER_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        escrow.endGiftWithIntent(id, byFunder);
        GiftEscrowV3.EndIntent memory bySigner = _end(id, 0, AMOUNT, 0, d, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        escrow.endGiftWithIntent(id, bySigner);
    }

    function testAGiftNobodyOpenedCannotBeEnded() public {
        uint256 id = escrow.createGift(_p(), _authorization(_p0()));
        GiftEscrowV3.EndIntent memory e = _end(id, 0, AMOUNT, 0, uint64(START + 10 minutes), RECIPIENT_KEY);
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        escrow.endGiftWithIntent(id, e);
        VM.prank(recipient);
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        escrow.endGift(id, 0, AMOUNT);
    }

    function testAnIntentExpiresCarriesANonceAndCannotBeReplayed() public {
        uint256 id = _baselined();
        uint64 d = uint64(START + 10 minutes);
        GiftEscrowV3.EndIntent memory e = _end(id, 0, AMOUNT, 0, d, RECIPIENT_KEY);

        GiftEscrowV3.EndIntent memory wrongNonce = _end(id, 0, AMOUNT, 1, d, RECIPIENT_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidIntentNonce.selector);
        escrow.endGiftWithIntent(id, wrongNonce);

        VM.warp(START + 11 minutes);
        VM.expectRevert(GiftEscrowV3.IntentExpired.selector);
        escrow.endGiftWithIntent(id, e);

        VM.warp(START);
        escrow.endGiftWithIntent(id, e);
        // Replayed: its nonce is spent.
        VM.expectRevert(GiftEscrowV3.InvalidIntentNonce.selector);
        escrow.endGiftWithIntent(id, e);
        // Signed again with the next nonce: the gift is over.
        GiftEscrowV3.EndIntent memory again = _end(id, 0, AMOUNT, 1, d, RECIPIENT_KEY);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.endGiftWithIntent(id, again);
    }

    /// @dev A person who signed an ending, then changed their mind and took money out instead, is safe: the later
    ///      intent retires the earlier one, so a copy of the ending kept by anybody is dead.
    function testALaterIntentRetiresAnEndingSignedEarlier() public {
        uint256 id = _baselined();
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1020, morning);
        uint64 d = uint64(morning + 10 minutes);
        GiftEscrowV3.EndIntent memory e = _end(id, 2 * PER_DAY, 5 * PER_DAY, 0, d, RECIPIENT_KEY);
        escrow.withdrawEarnedWithIntent(id, _withdraw(id, recipient, PER_DAY, 0, d));
        VM.expectRevert(GiftEscrowV3.InvalidIntentNonce.selector);
        escrow.endGiftWithIntent(id, e);
        require(!escrow.getGift(id).finalised, "still running");
    }

    /// @dev The screen said "You keep $2.00"; a third day was counted before the relay. The contract refuses rather
    ///      than do something the person did not read, and nothing changes: not even the nonce.
    function testTheTwoAmountsSignedAreTheTwoAmountsMoved() public {
        uint256 id = _baselined();
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1020, morning);
        uint256 nextMorning = _dayStart(day0 + 2) + 30 minutes;
        GiftEscrowV3.EndIntent memory e =
            _end(id, 2 * PER_DAY, 5 * PER_DAY, 0, uint64(nextMorning + 10 minutes), RECIPIENT_KEY);
        VM.warp(nextMorning);
        _checkIn(id, 1030, nextMorning);
        VM.expectRevert(GiftEscrowV3.EndTermsChanged.selector);
        escrow.endGiftWithIntent(id, e);
        require(!escrow.getGift(id).finalised && escrow.withdrawNonces(id) == 0, "nothing changed");
        // Asking for more than is theirs, or sending back less, is refused the same way.
        VM.prank(recipient);
        VM.expectRevert(GiftEscrowV3.EndTermsChanged.selector);
        escrow.endGift(id, 7 * PER_DAY, 0);
    }

    // --- what an ended gift refuses ----------------------------------------------------------------------

    function testAnEndedGiftIsClosedToEverythingButTakingWhatIsTheirs() public {
        uint256 id = _baselined();
        uint256 morning = _dayStart(day0 + 1) + 30 minutes;
        VM.warp(morning);
        _checkIn(id, 1020, morning);
        VM.prank(recipient);
        escrow.endGift(id, 2 * PER_DAY, 5 * PER_DAY);

        uint256 later = _dayStart(day0 + 5) + 8 hours;
        VM.warp(later);
        GiftEscrowV3.CheckInAttestation memory a = _checkInAttestation(id, 1050, uint64(later));
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.checkIn(id, a);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.drain(id);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.finalise(id);
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        escrow.refundUnearned(id);
        VM.prank(funder);
        VM.expectRevert(GiftEscrowV3.CancellationClosed.selector);
        escrow.cancel(id);
        VM.prank(recipient);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.endGift(id, 2 * PER_DAY, 0);
        // Long after, what was counted is still theirs to take.
        VM.warp(later + 400 days);
        VM.prank(recipient);
        escrow.withdrawEarned(id, recipient, 2 * PER_DAY);
        require(token.balanceOf(address(escrow)) == 0, "all settled");
    }

    function testAGiftAlreadyFinishedOrTakenBackCannotBeEnded() public {
        uint256 id = _baselined();
        VM.warp(_dayStart(day0 + DURATION + 2) + 7 hours);
        escrow.finalise(id);
        VM.prank(recipient);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        escrow.endGift(id, 0, 0);

        // Opened, never connected, already sent back whole by the fourteen-day rule.
        uint256 dormant = escrow.createGift(_p(), _authorization(_p0()));
        _claim(dormant);
        VM.warp(VM.getBlockTimestamp() + 14 days);
        escrow.refundUnearned(dormant);
        VM.prank(recipient);
        VM.expectRevert(GiftEscrowV3.GiftIsCancelled.selector);
        escrow.endGift(dormant, 0, 0);
    }

    /// @dev Neither pause is the recipient's problem: ending needs no reading and no attestation.
    function testEndingWorksWhileEverythingIsPaused() public {
        uint256 id = _baselined();
        escrow.setCheckInPaused(true);
        escrow.setCreationPaused(true);
        VM.prank(recipient);
        escrow.endGift(id, 0, AMOUNT);
        require(escrow.getGift(id).finalised, "ended under a pause");
    }

    // --- the invariant, fuzzed ----------------------------------------------------------------------------

    /// @dev Whatever was counted, whenever it ends: every unit is the recipient's or the funder's, the contract
    ///      holds exactly what the recipient has not taken, and the funder never receives a counted day.
    function testFuzz_EndConservesEveryUnit(uint8 doneDays, uint32 endOffset, uint64 amount, uint8 duration) public {
        uint32 d = 7 + (uint32(duration) % 84); // 7 to 90
        uint256 amt = 1_000_000 + (uint256(amount) % 99_000_000);
        GiftEscrowV3.GiftParams memory p = _params(amt, d);
        uint256 id = escrow.createGift(p, _authorization(p));
        _claim(id);
        _checkIn(id, 1000, START);
        uint256 perDay = amt / d;

        uint32 done = uint32(doneDays) % (d + 1);
        // `done` days of work, each read at noon on its own day, the first included: a day read later than its
        // catch-up window is settled as missed before anything is credited, so one late reading could not count them
        // all.
        for (uint32 k = 1; k <= done; ++k) {
            uint256 readAt = _dayStart(day0 + k - 1) + 12 hours;
            VM.warp(readAt);
            _checkIn(id, 1000 + uint64(k) * TARGET, readAt);
        }
        uint256 endAt = VM.getBlockTimestamp() + (uint256(endOffset) % (100 days));
        VM.warp(endAt);
        GiftEscrowV3.Gift memory before = escrow.getGift(id);
        if (before.finalised) return;

        uint256 funderBefore = token.balanceOf(funder);
        (uint256 keep, uint256 giveBack) = escrow.endPreview(id);
        VM.prank(recipient);
        escrow.endGift(id, keep, giveBack);

        GiftEscrowV3.Gift memory g = escrow.getGift(id);
        require(keep == uint256(done) * perDay, "kept is exactly the counted days");
        require(keep + g.refundedToFunder == amt, "every unit is one person's or the other's");
        require(token.balanceOf(funder) == funderBefore + giveBack, "the funder received what was signed");
        require(token.balanceOf(address(escrow)) == keep, "the contract holds what is theirs, no more");
        require(g.creditedDays + g.drainedDays + g.givenBackDays == d, "every day is counted, missed or given back");
        require(g.finalised && g.settledThroughDay == g.endDay, "closed");
    }

    // --- helpers -------------------------------------------------------------------------------------------

    GiftEscrowV3.GiftParams private lastParams;

    function _p() private returns (GiftEscrowV3.GiftParams memory p) {
        p = _params(AMOUNT, DURATION);
        lastParams = p;
    }

    function _p0() private view returns (GiftEscrowV3.GiftParams memory) {
        return lastParams;
    }

    function _params(uint256 amount, uint32 duration) private returns (GiftEscrowV3.GiftParams memory) {
        return GiftEscrowV3.GiftParams({
            funder: funder,
            refundTo: funder,
            openingKey: VM.addr(LINK_KEY),
            goalType: GOAL,
            dailyTarget: TARGET,
            durationDays: duration,
            amount: amount,
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _authorization(GiftEscrowV3.GiftParams memory p) private returns (GiftEscrowV3.Authorization memory a) {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(
            abi.encode(
                keccak256("viky.fund.v3"),
                keccak256(
                    abi.encode(
                        p.funder, p.refundTo, p.openingKey, p.goalType, p.dailyTarget, p.durationDays, p.amount, p.salt
                    )
                )
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                p.funder,
                address(escrow),
                p.amount,
                a.validAfter,
                a.validBefore,
                a.nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(FUNDER_KEY, digest);
    }

    function _claim(uint256 giftId) private {
        uint64 deadline = uint64(VM.getBlockTimestamp() + 5 minutes);
        GiftEscrowV3.OpenIntent memory o =
            GiftEscrowV3.OpenIntent({recipient: recipient, deadline: deadline, signature: ""});
        o.signature = _sign(LINK_KEY, keccak256(abi.encode(escrow.OPEN_TYPEHASH(), giftId, recipient, deadline)));
        escrow.claim(giftId, o);
    }

    function _checkInAttestation(uint256 giftId, uint64 metric, uint64 observedAt)
        private
        returns (GiftEscrowV3.CheckInAttestation memory a)
    {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrowV3.CheckInAttestation({
            recipient: recipient,
            identityHash: IDENTITY,
            providerId: PROVIDER,
            metricValue: metric,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("nullifier", ++nullifierSeed)),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: "",
            recipientSignature: ""
        });
        a.recipientSignature = _sign(
            RECIPIENT_KEY,
            keccak256(abi.encode(escrow.START_TYPEHASH(), giftId, a.identityHash, a.metricValue, a.observedAt))
        );
        a.signature = _sign(
            EVIDENCE_KEY,
            keccak256(
                abi.encode(
                    escrow.CHECK_IN_TYPEHASH(),
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
            )
        );
    }

    function _checkIn(uint256 giftId, uint64 metric, uint256 observedAt) private {
        escrow.checkIn(giftId, _checkInAttestation(giftId, metric, uint64(observedAt)));
    }

    function _baselined() private returns (uint256 giftId) {
        GiftEscrowV3.GiftParams memory p = _params(AMOUNT, DURATION);
        giftId = escrow.createGift(p, _authorization(p));
        _claim(giftId);
        _checkIn(giftId, 1000, START);
    }

    function _end(uint256 giftId, uint256 keep, uint256 giveBack, uint256 nonce, uint64 deadline, uint256 key)
        private
        returns (GiftEscrowV3.EndIntent memory e)
    {
        e = GiftEscrowV3.EndIntent({keep: keep, giveBack: giveBack, nonce: nonce, deadline: deadline, signature: ""});
        e.signature = _sign(key, keccak256(abi.encode(escrow.END_TYPEHASH(), giftId, keep, giveBack, nonce, deadline)));
    }

    function _withdraw(uint256 giftId, address to, uint256 amount, uint256 nonce, uint64 deadline)
        private
        returns (GiftEscrowV3.WithdrawIntent memory w)
    {
        w = GiftEscrowV3.WithdrawIntent({to: to, amount: amount, nonce: nonce, deadline: deadline, signature: ""});
        w.signature = _sign(
            RECIPIENT_KEY, keccak256(abi.encode(escrow.WITHDRAW_TYPEHASH(), giftId, to, amount, nonce, deadline))
        );
    }

    function _sign(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256("3"),
                block.chainid,
                address(escrow)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _dayStart(uint32 day) private pure returns (uint256) {
        return uint256(day) * DAY;
    }
}

/// @notice The person a milestone gift is for ends it before its target is read: nothing was earned, so the whole
///         amount goes back at once, without waiting for the deadline.
