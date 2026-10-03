// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {GiftEscrowV3} from "../../contracts/GiftEscrowV3.sol";

interface Vm {
    function warp(uint256) external;
    function getBlockTimestamp() external view returns (uint256);
    function prank(address) external;
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
}

/// @dev Six decimals and the EIP-3009 entry, with no signature check: the funder's signature is not under review.
contract Coin is ERC20 {
    constructor() ERC20("AUSD", "AUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256,
        uint256,
        bytes32,
        uint8,
        bytes32,
        bytes32
    ) external {
        require(to == msg.sender, "to");
        _transfer(from, to, value);
    }
}

/// @dev The independent reviewer's own rig, written from the contract alone (the re-read of 3 Oct 2026), kept as he
///      wrote it. Three contracts of his bench are not here: the second version called through the third's ABI,
///      a copy with a minimum of one day, and a copy carrying the correction of his finding C1, which is now the
///      contract itself. So his `fix` is `v3`.
abstract contract ReviewerRig {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    error Mismatch(string what, uint256 got, uint256 want);

    uint256 internal constant DAY = 86400;
    uint32 internal constant D0 = 20000;
    uint256 internal constant SIGNER_PK = 0xA11CE;
    uint256 internal constant RECIP_PK = 0xB0B;
    uint256 internal constant OPEN_PK = 0xC0DE;
    bytes32 internal constant PROVIDER = keccak256("provider");
    bytes32 internal constant IDENT = keccak256("identity");
    uint32 internal constant TARGET = 10;
    uint64 internal constant BASE = 1000;
    /// @dev Seven days at 10 AUSD, and five units of dust.
    uint256 internal constant AMOUNT = 70_000_005;
    uint256 internal constant PER = 10_000_000;

    bytes32 internal constant OPEN_TYPEHASH = keccak256("Open(uint256 giftId,address recipient,uint64 deadline)");
    bytes32 internal constant CHECK_IN_TYPEHASH = keccak256(
        "CheckIn(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)"
    );
    bytes32 internal constant START_TYPEHASH =
        keccak256("Start(uint256 giftId,bytes32 identityHash,uint64 metricValue,uint64 observedAt)");
    bytes32 internal constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)");
    bytes32 internal constant END_TYPEHASH =
        keccak256("End(uint256 giftId,uint256 keep,uint256 giveBack,uint256 nonce,uint64 deadline)");

    bytes4 internal constant OUTSIDE_WINDOW = bytes4(keccak256("OutsideWindow()"));
    bytes4 internal constant NTC = bytes4(keccak256("NothingToCredit()"));
    bytes4 internal constant INSUF = bytes4(keccak256("InsufficientProgress()"));

    Coin internal coin;
    GiftEscrowV3 internal v3;
    address internal signer;
    address internal recip;
    address internal funder = address(0xF00D);
    address internal refundTo = address(0xBEEF);
    uint256 private seq;

    function setUp() public virtual {
        vm.warp(at(D0, 9, 0, 0));
        signer = vm.addr(SIGNER_PK);
        recip = vm.addr(RECIP_PK);
        coin = new Coin();
        IERC20 t = IERC20(address(coin));
        v3 = new GiftEscrowV3(t, signer, 1);
        _open(v3);
    }

    function _open(GiftEscrowV3 e) private {
        e.registerGoal(1, PROVIDER);
        e.setCreationPaused(false);
    }

    // --- time -------------------------------------------------------------------------------------------

    function at(uint256 day, uint256 h, uint256 m, uint256 s) internal pure returns (uint64) {
        return uint64(day * DAY + h * 3600 + m * 60 + s);
    }

    function now64() internal view returns (uint64) {
        return uint64(vm.getBlockTimestamp());
    }

    function today() internal view returns (uint32) {
        return uint32(vm.getBlockTimestamp() / DAY);
    }

    // --- checks -----------------------------------------------------------------------------------------

    function eq(uint256 got, uint256 want, string memory what) internal pure {
        if (got != want) revert Mismatch(what, got, want);
    }

    function err(bytes4 got, bytes4 want, string memory what) internal pure {
        if (got != want) revert Mismatch(what, uint32(got), uint32(want));
    }

    function ok(bytes4 got, string memory what) internal pure {
        if (got != bytes4(0)) revert Mismatch(what, uint32(got), 0);
    }

    function sel(bytes memory r) internal pure returns (bytes4) {
        return r.length >= 4 ? bytes4(r) : bytes4(0xdeadbeef);
    }

    // --- signing ----------------------------------------------------------------------------------------

    function domain(GiftEscrowV3 e, string memory version) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256(bytes(version)),
                block.chainid,
                address(e)
            )
        );
    }

    /// @dev The domain the contract really signs under.
    function dom(GiftEscrowV3 e) internal view returns (bytes32) {
        return domain(e, "3");
    }

    function sig(uint256 pk, bytes32 dm, bytes32 structHash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", dm, structHash)));
        return abi.encodePacked(r, s, v);
    }

    // --- a gift's life ----------------------------------------------------------------------------------

    function params(uint256 amount, uint32 duration) internal returns (GiftEscrowV3.GiftParams memory p) {
        p.funder = funder;
        p.refundTo = refundTo;
        p.openingKey = vm.addr(OPEN_PK);
        p.goalType = 1;
        p.dailyTarget = TARGET;
        p.durationDays = duration;
        p.amount = amount;
        p.salt = bytes32(++seq);
    }

    function tryCreate(GiftEscrowV3 e, GiftEscrowV3.GiftParams memory p, bytes32 nonce)
        internal
        returns (bytes4, uint256)
    {
        coin.mint(funder, p.amount);
        GiftEscrowV3.Authorization memory a;
        a.nonce = nonce;
        try e.createGift(p, a) returns (uint256 id) {
            return (bytes4(0), id);
        } catch (bytes memory r) {
            return (sel(r), 0);
        }
    }

    function create(GiftEscrowV3 e, uint256 amount, uint32 duration) internal returns (uint256 id) {
        GiftEscrowV3.GiftParams memory p = params(amount, duration);
        bytes4 got;
        (got, id) = tryCreate(e, p, e.fundingNonce(p));
        ok(got, "create");
    }

    function openIntent(bytes32 dm, uint256 id) internal view returns (GiftEscrowV3.OpenIntent memory o) {
        o.recipient = recip;
        o.deadline = uint64(vm.getBlockTimestamp() + 1 hours);
        o.signature = sig(OPEN_PK, dm, keccak256(abi.encode(OPEN_TYPEHASH, id, recip, o.deadline)));
    }

    function tryClaim(GiftEscrowV3 e, uint256 id, GiftEscrowV3.OpenIntent memory o) internal returns (bytes4) {
        try e.claim(id, o) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function claim(GiftEscrowV3 e, uint256 id) internal {
        ok(tryClaim(e, id, openIntent(dom(e), id)), "claim");
    }

    /// @dev An attestation issued at the block it is built in, for a reading observed when the caller says.
    function att(GiftEscrowV3 e, bytes32 dm, uint256 id, uint64 metric, uint64 observedAt, bool isFirst)
        internal
        returns (GiftEscrowV3.CheckInAttestation memory a)
    {
        e;
        a.recipient = recip;
        a.identityHash = IDENT;
        a.providerId = PROVIDER;
        a.metricValue = metric;
        a.observedAt = observedAt;
        a.nullifier = keccak256(abi.encode("nullifier", ++seq));
        a.issuedAt = uint64(vm.getBlockTimestamp());
        a.expiresAt = uint64(vm.getBlockTimestamp() + 5 minutes);
        a.signature = sig(
            SIGNER_PK,
            dm,
            keccak256(
                abi.encode(
                    CHECK_IN_TYPEHASH,
                    id,
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
        if (isFirst) a.recipientSignature = startSig(dm, id, metric, observedAt);
    }

    function startSig(bytes32 dm, uint256 id, uint64 metric, uint64 observedAt) internal pure returns (bytes memory) {
        return sig(RECIP_PK, dm, keccak256(abi.encode(START_TYPEHASH, id, IDENT, metric, observedAt)));
    }

    function tryCheckIn(GiftEscrowV3 e, uint256 id, GiftEscrowV3.CheckInAttestation memory a)
        internal
        returns (bytes4)
    {
        try e.checkIn(id, a) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function first(GiftEscrowV3 e, uint256 id, uint64 metric, uint64 observedAt) internal {
        ok(tryCheckIn(e, id, att(e, dom(e), id, metric, observedAt, true)), "first reading");
    }

    function tryRead(GiftEscrowV3 e, uint256 id, uint64 metric, uint64 observedAt) internal returns (bytes4) {
        return tryCheckIn(e, id, att(e, dom(e), id, metric, observedAt, false));
    }

    /// @dev Made, opened and connected in the block the caller stands in.
    function begin(GiftEscrowV3 e, uint32 duration, uint64 observedAt) internal returns (uint256 id) {
        id = create(e, AMOUNT, duration);
        claim(e, id);
        first(e, id, BASE, observedAt);
    }

    function tryDrain(GiftEscrowV3 e, uint256 id) internal returns (bytes4) {
        try e.drain(id) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function tryFinalise(GiftEscrowV3 e, uint256 id) internal returns (bytes4) {
        try e.finalise(id) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function tryRefund(GiftEscrowV3 e, uint256 id) internal returns (bytes4) {
        try e.refundUnearned(id) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function tryPause(GiftEscrowV3 e, bool paused) internal returns (bytes4) {
        try e.setCheckInPaused(paused) {
            return bytes4(0);
        } catch (bytes memory r) {
            return sel(r);
        }
    }

    function endNow(GiftEscrowV3 e, uint256 id) internal returns (uint256 keep, uint256 giveBack) {
        (keep, giveBack) = e.endPreview(id);
        vm.prank(recip);
        e.endGift(id, keep, giveBack);
    }

    function takeOut(GiftEscrowV3 e, uint256 id) internal {
        uint256 earned = e.earnedBalance(id);
        if (earned == 0) return;
        vm.prank(recip);
        e.withdrawEarned(id, recip, earned);
    }

    // --- what must hold at every step, for the one gift of a contract ---------------------------------------

    function hold(GiftEscrowV3 e, uint256 id, uint64 metric) internal view {
        GiftEscrowV3.Gift memory g = e.getGift(id);
        uint256 credited = uint256(g.creditedDays) * g.perDay;
        if (uint256(g.creditedDays) * TARGET > metric - BASE) revert("more days paid than targets of progress");
        if (g.withdrawnByRecipient > credited || g.refundedToFunder > g.refundable) revert("more left than was owed");
        if (coin.balanceOf(address(e)) != g.amount - g.withdrawnByRecipient - g.refundedToFunder) {
            revert("the contract does not hold what is left");
        }
        if (g.finalised) {
            if (credited + g.refundable != g.amount) revert("over: paid + given back != amount");
            if (g.creditedDays + g.drainedDays + g.givenBackDays != g.durationDays) revert("over: days do not add up");
        } else {
            if (g.settledThroughDay > today()) revert("a day settled before it began");
            if (g.creditedDays + g.drainedDays != g.settledThroughDay + 1 - g.startDay) {
                revert("a day counted twice, or skipped");
            }
            uint256 remaining = uint256(g.durationDays - g.creditedDays - g.drainedDays) * g.perDay
                + (g.amount - g.perDay * g.durationDays);
            if (credited + g.refundable + remaining != g.amount) revert("paid + given back + remaining != amount");
        }
    }

    function rnd(uint256 seed, uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i)));
    }

    /// @dev One gift through readings dated anywhere the contract accepts them, drains, refunds, withdrawals and
    ///      pauses, in any order, then to its end by one of the two ways. `hold` after every step.
    function walk(GiftEscrowV3 e, uint256 seed) internal {
        uint32 duration = uint32(7 + rnd(seed, 0) % 10);
        vm.warp(at(D0, 0, 0, 0) + rnd(seed, 1) % DAY);
        uint256 id = create(e, AMOUNT, duration);
        claim(e, id);
        first(e, id, BASE, uint64(vm.getBlockTimestamp() - 1800 + rnd(seed, 2) % 1861));
        uint64 metric = BASE;
        hold(e, id, metric);
        for (uint256 i = 0; i < 48; i++) {
            uint256 r = rnd(seed, 10 + i);
            vm.warp(vm.getBlockTimestamp() + 1 + (r % 4 == 0 ? (r >> 8) % (40 hours) : (r >> 8) % (4 hours)));
            if ((r >> 40) % 3 != 0) metric += uint64((r >> 48) % 26);
            uint256 pick = (r >> 64) % 12;
            if (pick < 6) {
                uint64 obs = uint64(vm.getBlockTimestamp() - 1800 + (r >> 80) % 1861);
                bytes4 got = tryRead(e, id, metric, obs);
                if (got == 0x4e487b71) revert("a reading panicked");
                if (got == bytes4(0)) {
                    uint32 settled = e.getGift(id).settledThroughDay;
                    if (settled > today() || settled > uint32(obs / DAY)) {
                        revert("a day paid before it began, or past the reading's own day");
                    }
                }
            } else if (pick < 8) {
                tryDrain(e, id);
            } else if (pick == 8) {
                tryRefund(e, id);
            } else if (pick == 9) {
                takeOut(e, id);
            } else {
                tryPause(e, pick == 10);
            }
            hold(e, id, metric);
        }
        GiftEscrowV3.Gift memory g = e.getGift(id);
        if (seed % 2 == 0) {
            endNow(e, id);
        } else {
            uint256 t = at(uint256(g.endDay) + 2, 6, 0, 0);
            vm.warp((t < vm.getBlockTimestamp() ? vm.getBlockTimestamp() : t) + 9 days);
            e.finalise(id);
        }
        hold(e, id, metric);
        tryRefund(e, id);
        takeOut(e, id);
        g = e.getGift(id);
        eq(coin.balanceOf(address(e)), 0, "nothing stays in the contract");
        eq(coin.balanceOf(recip), uint256(g.creditedDays) * g.perDay, "the recipient holds the paid days, no more");
        eq(coin.balanceOf(recip) + coin.balanceOf(refundTo), AMOUNT, "paid + given back = amount");
    }

    /// @dev A first reading, then any later reading the contract's own bounds accept. With `neverBefore`, the day
    ///      the later reading counts for must never be before the first day (what `OutsideWindow` used to refuse).
    function laterReading(GiftEscrowV3 e, uint256 seed, bool neverBefore) internal {
        uint256 t0 = rnd(seed, 6) % 2 == 0
            ? at(D0, 0, 0, 0) + rnd(seed, 0) % DAY
            : at(D0 + 1, 0, 0, 0) - 2400 + rnd(seed, 0) % 4800;
        vm.warp(t0);
        uint256 id = create(e, AMOUNT, 7);
        claim(e, id);
        uint64 obs0 = uint64(t0 - 1800 + rnd(seed, 1) % 1861);
        first(e, id, BASE, obs0);
        uint32 startDay = e.getGift(id).startDay;
        uint256 t1 = t0 + rnd(seed, 2) % (rnd(seed, 3) % 2 == 0 ? 3600 : 3 days);
        vm.warp(t1);
        uint256 lo = t1 - 1800;
        if (lo < uint256(obs0) + 1) lo = uint256(obs0) + 1;
        uint256 hi = t1 + 60;
        if (lo > hi) return;
        uint64 obs1 = uint64(lo + rnd(seed, 4) % (hi - lo + 1));
        bytes4 got = tryRead(e, id, BASE + uint64(rnd(seed, 5) % 4) * TARGET, obs1);
        if (got != bytes4(0) && got != NTC && got != INSUF) revert Mismatch("refused another way", uint32(got), 0);
        uint32 readDay = uint32(obs1 / DAY) < today() ? uint32(obs1 / DAY) : today();
        if (neverBefore && readDay < startDay) revert("a reading counts for a day before the first");
        if (got == bytes4(0) && e.getGift(id).settledThroughDay < startDay) revert("paid a day before the first");
    }
}
