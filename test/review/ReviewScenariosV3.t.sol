// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrow} from "../../contracts/GiftEscrow.sol";
import {GiftEscrowV3} from "../../contracts/GiftEscrowV3.sol";
import {MilestoneGiftV2} from "../../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "../mocks/MockAUSD.sol";
import {V3Kit} from "../kit/V3Kit.sol";

/// @notice The scenarios of the independent review of 2 Oct 2026 (test/review/ReviewScenarios.t.sol), run again with
///         the third daily contract in the daily contract's place. The reviewer wrote them for the second version;
///         the third changes one rule, the day a reading credits, and nothing a scenario attacks. So each daily
///         scenario is here under the name `V3`, with its dates a day earlier where it counted days from the day
///         after the connection, and each says so. Two refusals are added to the scenario of signatures: an opening
///         and a withdrawal signed under the second version's domain are not signatures here. The milestone
///         scenarios run as they are, against the milestone contract the third version does not touch.
/// @dev    What the first file says of itself still holds: kept as the reviewer wrote them (annex A of the review), with two changes by the authors once the
///         contracts were corrected, and no other:
///
///         1. Seven scenarios passed because a defect was there, and the reviewer wrote that they must fail once
///            it is corrected. They do. So that they stay in the suite without failing it, each is renamed from
///            `test_` to `defect_`, body untouched, and a test at the foot of this file runs it and requires the
///            failure the correction gives it. If a defect comes back, its scenario runs to its end and that
///            test fails.
///         2. The readings come from `test/kit/V2Kit.sol`, which now adds the recipient's own signature to them:
///            the first reading of a gift is signed by the account it is for (R-15). No line here changed for it.
contract ReviewScenariosV3 is V3Kit {
    uint8 private constant GOAL = 1;
    uint8 private constant GOAL_HAVE = 2;
    bytes32 private constant PROVIDER = keccak256("review provider");
    bytes32 private constant PROVIDER_HAVE = keccak256("review provider have");
    bytes32 private constant IDENTITY = keccak256("review identity");
    bytes32 private constant SUBJECT = keccak256("review subject");
    uint256 private constant ATTACKER_KEY = 0xBAD;
    address private constant BOX = address(0xB0C5);
    address private constant SAFE = address(0x5AFE);
    bytes32 private constant DOMAIN_TYPEHASH_ =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    MockAUSD private token;
    GiftEscrow private v1;
    GiftEscrowV3 private daily;
    MilestoneGiftV2 private milestone;
    address private funder;
    address private recipient;
    address private attacker;

    function setUp() public {
        VM.warp(1_790_000_000);
        token = new MockAUSD();
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        attacker = VM.addr(ATTACKER_KEY);
        token.mint(funder, 1_000_000_000_000);

        v1 = new GiftEscrow(token, VM.addr(EVIDENCE_KEY), 1);
        v1.registerGoal(GOAL, PROVIDER);
        v1.setCreationPaused(false);
        v1.setCheckInPaused(false);

        daily = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        daily.registerGoal(GOAL, PROVIDER);
        daily.setCreationPaused(false);
        daily.setCheckInPaused(false);

        milestone = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        milestone.registerGoal(GOAL, PROVIDER, 0);
        milestone.registerGoal(GOAL_HAVE, PROVIDER_HAVE, 1);
        milestone.setCreationPaused(false);
        milestone.setProofPaused(false);

        // Past the stand-still that follows the deployment's own pause, as a contract in service would be.
        VM.warp(VM.getBlockTimestamp() + 3 days);
    }

    // --- helpers ----------------------------------------------------------------------------------------

    function _eq(uint256 a, uint256 b, string memory what) private pure {
        if (a != b) revert(string.concat(what, ": ", _str(a), " != ", _str(b)));
    }

    function _str(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        while (n != 0) {
            ++len;
            n /= 10;
        }
        bytes memory out = new bytes(len);
        while (v != 0) {
            out[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(out);
    }

    function _sig(string memory name, string memory version, address verifying, uint256 key, bytes32 structHash)
        private
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH_, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, verifying)
        );
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function _dayStart(uint256 day) private pure returns (uint256) {
        return day * 1 days;
    }

    function _today() private view returns (uint256) {
        return VM.getBlockTimestamp() / 1 days;
    }

    function _makeDaily(uint256 amount, uint32 duration) private returns (uint256 id) {
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, amount, duration, 10);
        p.refundTo = BOX;
        id = daily.createGift(p, _dailyAuthorization(daily, p, FUNDER_KEY));
    }

    function _openDaily(uint256 id) private {
        daily.claim(id, _dailyOpen(daily, id, recipient, LINK_KEY));
    }

    function _read(uint256 id, uint64 metric) private {
        daily.checkIn(
            id, _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, metric, uint64(VM.getBlockTimestamp()))
        );
    }

    // --- 1. the theft proven on the version in service, and the same attack on the second -----------------

    /// @dev On the version in service, whoever holds the evidence key alone takes a gift nobody opened.
    function test_V1_evidenceKeyAloneTakesAnUnopenedGift() public {
        GiftEscrow.GiftParams memory p = GiftEscrow.GiftParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: keccak256("somebody's contact"),
            goalType: GOAL,
            dailyTarget: 10,
            durationDays: 7,
            amount: 70_000_000,
            salt: _salt()
        });
        GiftEscrow.Authorization memory a;
        a.nonce = v1.fundingNonce(p);
        (a.validBefore, a.v, a.r, a.s) = _funding(address(token), address(v1), funder, p.amount, a.nonce, FUNDER_KEY);
        uint256 id = v1.createGift(p, a);

        // The thief holds EVIDENCE_KEY and nothing else. The contact hash is public (the creation event).
        uint64 t = uint64(VM.getBlockTimestamp());
        GiftEscrow.ClaimAttestation memory c = GiftEscrow.ClaimAttestation({
            recipient: attacker,
            contactHash: p.recipientContactHash,
            issuedAt: t,
            expiresAt: t + 5 minutes,
            signature: ""
        });
        c.signature = _sig(
            "Viky Gift",
            "1",
            address(v1),
            EVIDENCE_KEY,
            keccak256(abi.encode(v1.CLAIM_TYPEHASH(), id, attacker, c.contactHash, c.issuedAt, c.expiresAt))
        );
        v1.claim(id, c);

        _v1CreditSevenDays(id);
        VM.prank(attacker);
        v1.withdrawEarned(id, attacker, 70_000_000);
        _eq(token.balanceOf(attacker), 70_000_000, "the thief holds the whole gift");
    }

    function _v1CreditSevenDays(uint256 id) private {
        _v1Read(id, 1000);
        uint256 baselineDay = _today();
        for (uint256 i = 0; i < 7; ++i) {
            VM.warp(_dayStart(baselineDay + 2 + i) + 30 minutes);
            _v1Read(id, uint64(1010 + 10 * i));
        }
    }

    function _v1Read(uint256 id, uint64 metric) private {
        uint64 t = uint64(VM.getBlockTimestamp());
        GiftEscrow.CheckInAttestation memory r = GiftEscrow.CheckInAttestation({
            recipient: attacker,
            identityHash: IDENTITY,
            providerId: PROVIDER,
            metricValue: metric,
            observedAt: t,
            nullifier: _nullifier(),
            issuedAt: t,
            expiresAt: t + 5 minutes,
            signature: ""
        });
        r.signature = _sig(
            "Viky Gift",
            "1",
            address(v1),
            EVIDENCE_KEY,
            keccak256(
                abi.encode(
                    v1.CHECK_IN_TYPEHASH(),
                    id,
                    r.recipient,
                    r.identityHash,
                    r.providerId,
                    r.metricValue,
                    r.observedAt,
                    r.nullifier,
                    r.issuedAt,
                    r.expiresAt
                )
            )
        );
        v1.checkIn(id, r);
    }

    /// @dev The same thief on the second version: the evidence key opens nothing, and a real opening cannot be turned.
    function test_V3_evidenceKeyAloneOpensNothing() public {
        uint256 id = _makeDaily(70_000_000, 7);

        GiftEscrowV3.OpenIntent memory forged = _dailyOpen(daily, id, attacker, EVIDENCE_KEY);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, forged);

        // A reading for a gift nobody opened is refused, whoever signs it.
        GiftEscrowV3.CheckInAttestation memory r =
            _dailyReading(daily, id, attacker, IDENTITY, PROVIDER, 1000, uint64(VM.getBlockTimestamp()));
        VM.expectRevert(GiftEscrowV3.NotClaimed.selector);
        daily.checkIn(id, r);

        // The relayer sees the real opening before it lands, and cannot point it at another account.
        GiftEscrowV3.OpenIntent memory real = _dailyOpen(daily, id, recipient, LINK_KEY);
        GiftEscrowV3.OpenIntent memory turned =
            GiftEscrowV3.OpenIntent({recipient: attacker, deadline: real.deadline, signature: real.signature});
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, turned);

        // An opening signed for another gift does not open this one.
        uint256 other = _makeDaily(70_000_000, 7);
        GiftEscrowV3.OpenIntent memory forOther = _dailyOpen(daily, other, attacker, LINK_KEY);
        // (same link key in this kit: what protects is the gift id inside the signed message)
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, forOther);

        _eq(token.balanceOf(attacker), 0, "the thief holds nothing");
    }

    function test_V2_milestone_evidenceKeyAloneOpensNothing() public {
        MilestoneGiftV2.MilestoneParams memory p = _climbParams(funder, GOAL, 50_000_000, 10, 1500, 1400);
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        MilestoneGiftV2.OpenIntent memory forged = _milestoneOpen(milestone, id, attacker, EVIDENCE_KEY);
        VM.expectRevert(MilestoneGiftV2.InvalidOpeningSignature.selector);
        milestone.claim(id, forged);
        MilestoneGiftV2.ProofAttestation memory proof =
            _milestoneProof(milestone, id, attacker, IDENTITY, PROVIDER, 1600, 0, uint64(VM.getBlockTimestamp()));
        VM.expectRevert(MilestoneGiftV2.NotClaimed.selector);
        milestone.prove(id, proof);
    }

    /// @dev The link of a gift of the second version is `/g/<id>?t=<secret>` (src/client/v2.ts:53), and the page is
    ///      rendered on the server, which is handed `t` (app/g/[id]/page.tsx:59-62), as are the status route
    ///      (app/api/gift/[id]/route.ts:37) and the preview image (page.tsx:30). The opening key is
    ///      keccak256("viky:open:v2:" + secret) and nothing else (src/v2-protocol.ts:152-155). So whoever runs the
    ///      server, or reads what it is sent, and holds the evidence key, takes a gift whose link was fetched once
    ///      and not opened yet: the theft of the first version, with one more input that the server is given.
    function test_V3_whoeverIsSentTheLinkAndHoldsTheEvidenceKeyTakesTheGift() public {
        string memory secretInTheUrl = "Zm9yLXRoZS1yZXZpZXctb2YtMi1PY3Q"; // what `?t=` carries
        uint256 funderSideKey = uint256(keccak256(bytes(string.concat("viky:open:v2:", secretInTheUrl))));
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, 70_000_000, 7, 10);
        p.refundTo = BOX;
        p.openingKey = VM.addr(funderSideKey);
        uint256 id = daily.createGift(p, _dailyAuthorization(daily, p, FUNDER_KEY));

        // The server's side: it has the request's `t`, and its own evidence key. Nothing else.
        _openFromTheUrl(id, secretInTheUrl);
        _creditSevenDays(id);
        VM.prank(attacker);
        daily.withdrawEarned(id, attacker, 70_000_000);
        _eq(token.balanceOf(attacker), 70_000_000, "the whole gift");
    }

    /// @dev The same on a milestone gift, where nothing slows it down: opened, proved and taken out in one block.
    function test_V2_milestone_whoeverIsSentTheLinkTakesItInOneBlock() public {
        uint256 keyFromTheUrl =
            uint256(keccak256(bytes(string.concat("viky:open:v2:", "Zm9yLXRoZS1yZXZpZXctb2YtMi1PY3Q"))));
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_HAVE, 50_000_000, 10, SUBJECT);
        p.refundTo = BOX;
        p.openingKey = VM.addr(keyFromTheUrl);
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        uint64 t = uint64(VM.getBlockTimestamp());
        milestone.claim(id, _milestoneOpen(milestone, id, attacker, keyFromTheUrl));
        milestone.prove(id, _milestoneProof(milestone, id, attacker, SUBJECT, PROVIDER_HAVE, 1, t, t));
        VM.prank(attacker);
        milestone.withdrawEarned(id, attacker, 50_000_000);
        _eq(token.balanceOf(attacker), 50_000_000, "the whole gift, in the block it was opened");
        // The funder can no longer take it back: somebody opened it.
        VM.expectRevert(MilestoneGiftV2.AlreadyClaimed.selector);
        VM.prank(funder);
        milestone.cancel(id);
    }

    function _openFromTheUrl(uint256 id, string memory secretInTheUrl) private {
        uint256 madeOnTheServer = uint256(keccak256(bytes(string.concat("viky:open:v2:", secretInTheUrl))));
        daily.claim(id, _dailyOpen(daily, id, attacker, madeOnTheServer));
    }

    function _creditSevenDays(uint256 id) private {
        _readAs(id, attacker, 1000);
        uint256 d0 = _today();
        for (uint256 i = 0; i < 7; ++i) {
            VM.warp(_dayStart(d0 + 2 + i) + 30 minutes);
            _readAs(id, attacker, uint64(1010 + 10 * i));
        }
    }

    function _readAs(uint256 id, address who, uint64 metric) private {
        daily.checkIn(id, _dailyReading(daily, id, who, IDENTITY, PROVIDER, metric, uint64(VM.getBlockTimestamp())));
    }

    function test_openingKeyAddressOfAFixedSecret() public {
        uint256 key = uint256(keccak256(bytes(string.concat("viky:open:v2:", "Zm9yLXRoZS1yZXZpZXctb2YtMi1PY3Q"))));
        if (VM.addr(key) != 0x0000000000000000000000000000000000000000) emitAddress(VM.addr(key));
    }

    event OpeningKey(address key);

    function emitAddress(address a) private {
        emit OpeningKey(a);
    }

    // --- 2. the recipient ends the gift -------------------------------------------------------------------

    function test_V3_endMidGift_conservesToTheUnit_andIsFinal() public {
        uint256 amount = 100_000_003;
        uint256 id = _makeDaily(amount, 7);
        uint256 perDay = amount / 7;
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();

        VM.warp(_dayStart(d0 + 1) + 30 minutes);
        _read(id, 1010); // credits the first day, which on the third version is the day of the connection
        VM.prank(recipient);
        daily.withdrawEarned(id, recipient, perDay / 2);

        VM.warp(_dayStart(d0 + 4) + 7 hours);
        daily.drain(id); // two days missed, not yet sent back
        _eq(daily.getGift(id).drainedDays, 2, "two days drained");

        (uint256 keep, uint256 giveBack) = daily.endPreview(id);
        _eq(keep, perDay, "kept is the one counted day");
        _eq(giveBack, amount - perDay, "everything else goes back");
        uint256 boxBefore = token.balanceOf(BOX);
        daily.endGiftWithIntent(id, _dailyEnd(daily, id, keep, giveBack, RECIPIENT_KEY));
        _eq(token.balanceOf(BOX) - boxBefore, giveBack, "it went back in the same transaction");
        _eq(daily.getGift(id).givenBackDays, 4, "four days given back");

        // Nothing follows an ending.
        GiftEscrowV3.CheckInAttestation memory r =
            _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 2000, uint64(VM.getBlockTimestamp()));
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        daily.checkIn(id, r);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        daily.drain(id);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        daily.finalise(id);
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        daily.refundUnearned(id);
        VM.expectRevert(GiftEscrowV3.AlreadyFinalised.selector);
        VM.prank(recipient);
        daily.endGift(id, keep, 0);

        // What was kept is still theirs.
        VM.prank(recipient);
        daily.withdrawEarned(id, recipient, perDay - perDay / 2);
        _eq(token.balanceOf(recipient), perDay, "the recipient holds the counted day");
        _eq(token.balanceOf(BOX), amount - perDay, "the funder holds the rest, dust included");
        _eq(token.balanceOf(address(daily)), 0, "the contract holds nothing of this gift");
    }

    function test_V3_endAfterAnEarlierRefund_conserves() public {
        uint256 amount = 70_000_000;
        uint256 id = _makeDaily(amount, 7);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 3) + 7 hours);
        daily.drain(id);
        daily.refundUnearned(id); // two missed days already sent back
        _eq(token.balanceOf(BOX), 20_000_000, "two days went back");
        (uint256 keep, uint256 giveBack) = daily.endPreview(id);
        _eq(keep, 0, "nothing counted");
        _eq(giveBack, 50_000_000, "the rest");
        VM.prank(recipient);
        daily.endGift(id, keep, giveBack);
        _eq(token.balanceOf(BOX), amount, "the funder has the whole amount back");
        _eq(token.balanceOf(address(daily)), 0, "nothing left");
    }

    /// @dev Somebody sending the missed days back between the screen and the signature's landing changes giveBack:
    ///      the ending is refused and must be signed again. It costs the caller a transaction each time, and can be
    ///      done at most once per drained batch.
    function test_V3_endIsRefusedWhenARefundLandsFirst() public {
        uint256 id = _makeDaily(70_000_000, 7);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 3) + 7 hours);
        daily.drain(id);
        (uint256 keep, uint256 giveBack) = daily.endPreview(id);
        GiftEscrowV3.EndIntent memory e = _dailyEnd(daily, id, keep, giveBack, RECIPIENT_KEY);
        daily.refundUnearned(id); // anybody
        VM.expectRevert(GiftEscrowV3.EndTermsChanged.selector);
        daily.endGiftWithIntent(id, e);
    }

    // --- 3. the pause -------------------------------------------------------------------------------------

    /// @dev "A pause that ends by itself": it does, unless the owner sends it again, and nothing bounds how often.
    ///      While it is renewed no day is drained and no gift finalised, so the funder's unearned money stays put.
    function defect_V3_renewedPauseFreezesTheFundersMoneyPastSevenDays() public {
        uint256 id = _makeDaily(70_000_000, 7);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 1) + 12 hours);
        daily.setCheckInPaused(true);
        for (uint256 i = 0; i < 10; ++i) {
            VM.warp(VM.getBlockTimestamp() + 6 days);
            daily.setCheckInPaused(true);
        }
        // Sixty days on, the gift's last day is seven weeks behind, and nothing can be sent back.
        if (!daily.checkInPaused()) revert("still paused");
        VM.expectRevert(GiftEscrowV3.NothingToDrain.selector);
        daily.drain(id);
        VM.expectRevert(GiftEscrowV3.FinalisationTooEarly.selector);
        daily.finalise(id);
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        daily.refundUnearned(id);
        _eq(token.balanceOf(BOX), 0, "the funder has nothing back after sixty days");

        // The recipient can still end it, which is the only way out while the owner keeps renewing.
        (uint256 keep, uint256 giveBack) = daily.endPreview(id);
        VM.prank(recipient);
        daily.endGift(id, keep, giveBack);
        _eq(token.balanceOf(BOX), 70_000_000, "ending sends it back");
    }

    /// @dev An unopened gift under a renewed pause: the wait of fourteen days never runs out for anybody but the
    ///      funder, who must send `cancel` from their own account (and so pay for the transaction themselves).
    function defect_V3_renewedPause_unopenedGift_onlyTheFundersOwnCancelWorks() public {
        uint256 id = _makeDaily(70_000_000, 7);
        VM.warp(VM.getBlockTimestamp() + 13 days);
        daily.setCheckInPaused(true);
        for (uint256 i = 0; i < 5; ++i) {
            VM.warp(VM.getBlockTimestamp() + 6 days);
            daily.setCheckInPaused(true);
        }
        VM.expectRevert(GiftEscrowV3.NothingToRefund.selector);
        daily.refundUnearned(id);
        VM.prank(funder);
        daily.cancel(id);
        _eq(token.balanceOf(BOX), 70_000_000, "cancel still works");
    }

    /// @dev The owner flicks the pause on and off every 29 hours. Check-ins stay open, but the clock that decides
    ///      which days are missed stands still at the first flick, so a recipient who did nothing for twenty days
    ///      is credited all twenty from one late reading. Without the flicks the same reading credits two.
    function defect_V3_flickedPauseVoidsTheCatchUpWindow() public {
        uint256 id = _makeDaily(300_000_000, 30);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 1) + 10 minutes);
        daily.setCheckInPaused(true);
        daily.setCheckInPaused(false);
        while (VM.getBlockTimestamp() + 29 hours < _dayStart(d0 + 22)) {
            VM.warp(VM.getBlockTimestamp() + 29 hours);
            daily.setCheckInPaused(true);
            daily.setCheckInPaused(false);
        }
        VM.warp(_dayStart(d0 + 22) + 30 minutes);
        _read(id, 1000 + 10 * 20);
        _eq(daily.getGift(id).creditedDays, 20, "twenty days credited from one late reading");
        _eq(daily.getGift(id).drainedDays, 0, "no day was ever missed");
    }

    /// @dev On the third version, a day earlier and one day more: the two days whose window still runs, and the day
    ///      of the reading itself.
    function test_V3_control_withoutFlicks_sameReadingCreditsThreeDays() public {
        uint256 id = _makeDaily(300_000_000, 30);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 21) + 30 minutes);
        _read(id, 1000 + 10 * 20);
        _eq(daily.getGift(id).creditedDays, 3, "three days credited");
        _eq(daily.getGift(id).drainedDays, 19, "nineteen days missed");
    }

    /// @dev A certificate gift whose late window closed weeks ago, that nobody expired. The owner sends a pause and
    ///      lifts it at once: the late window is counted again from that moment, a proof is accepted, and until
    ///      then `expire` is refused to the funder.
    function defect_V2_milestone_aLatePauseReopensAClosedWindow() public {
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_HAVE, 50_000_000, 10, SUBJECT);
        p.refundTo = BOX;
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        uint256 t0 = VM.getBlockTimestamp();
        uint64 granted = uint64(t0 + 5 days);

        VM.warp(t0 + 10 days + 14 days + 20 days);
        MilestoneGiftV2.ProofAttestation memory late = _milestoneProof(
            milestone, id, recipient, SUBJECT, PROVIDER_HAVE, 1, granted, uint64(VM.getBlockTimestamp())
        );
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        milestone.prove(id, late);

        milestone.setProofPaused(true);
        milestone.setProofPaused(false);

        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        milestone.expire(id);
        VM.warp(VM.getBlockTimestamp() + 13 days);
        MilestoneGiftV2.ProofAttestation memory again = _milestoneProof(
            milestone, id, recipient, SUBJECT, PROVIDER_HAVE, 1, granted, uint64(VM.getBlockTimestamp())
        );
        milestone.prove(id, again);
        _eq(milestone.earnedBalance(id), 50_000_000, "paid weeks after the window closed");
    }

    /// @dev The same on a climb: a reading taken before the deadline is accepted weeks after the six-hour grace.
    function defect_V2_milestone_aLatePauseReopensAClimb() public {
        MilestoneGiftV2.MilestoneParams memory p = _climbParams(funder, GOAL, 50_000_000, 10, 1500, 1400);
        p.refundTo = BOX;
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        uint256 t0 = VM.getBlockTimestamp();
        milestone.prove(id, _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1300, 0, uint64(t0)));
        uint64 inTime = uint64(t0 + 9 days);

        VM.warp(t0 + 40 days);
        MilestoneGiftV2.ProofAttestation memory late =
            _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1600, 0, inTime);
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        milestone.prove(id, late);

        milestone.setProofPaused(true);
        milestone.setProofPaused(false);
        MilestoneGiftV2.ProofAttestation memory again =
            _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1600, 0, inTime);
        milestone.prove(id, again);
        _eq(milestone.earnedBalance(id), 50_000_000, "paid a month after the deadline");
    }

    function defect_V2_milestone_renewedPauseBlocksExpire() public {
        MilestoneGiftV2.MilestoneParams memory p = _climbParams(funder, GOAL, 50_000_000, 10, 1500, 1400);
        p.refundTo = BOX;
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        milestone.prove(
            id, _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1300, 0, uint64(VM.getBlockTimestamp()))
        );
        VM.warp(VM.getBlockTimestamp() + 9 days);
        milestone.setProofPaused(true);
        for (uint256 i = 0; i < 10; ++i) {
            VM.warp(VM.getBlockTimestamp() + 6 days);
            milestone.setProofPaused(true);
        }
        VM.expectRevert(MilestoneGiftV2.TooEarly.selector);
        milestone.expire(id);
        _eq(token.balanceOf(BOX), 0, "the funder has nothing back two months after the deadline");
    }

    // --- 4. the owner's hand-over -------------------------------------------------------------------------

    /// @dev Between `transferOwnership` and the Safe's `acceptOwnership` the deploying key is still the owner. A
    ///      signer it announces in that time stands a day later even though the Safe never announced it.
    function defect_V3_aSignerAnnouncedBeforeTheHandOverStandsAfterIt() public {
        daily.transferOwnership(SAFE);
        daily.setEvidenceSigner(attacker); // the deploying key, still owner
        VM.warp(VM.getBlockTimestamp() + 1 hours);
        VM.prank(SAFE);
        daily.acceptOwnership();
        VM.warp(VM.getBlockTimestamp() + 24 hours);
        VM.prank(attacker);
        daily.applyEvidenceSigner();
        if (daily.evidenceSigner() != attacker) revert("the announced signer stands");
    }

    function test_V3_pendingOwnerCanBeRepointedUntilAccepted() public {
        daily.transferOwnership(SAFE);
        daily.transferOwnership(attacker);
        VM.expectRevert(bytes("Ownable2Step: caller is not the new owner"));
        VM.prank(SAFE);
        daily.acceptOwnership();
        VM.prank(attacker);
        daily.acceptOwnership();
        if (daily.owner() != attacker) revert("repointed");
    }

    // --- 5. signatures across versions, contracts and chains ----------------------------------------------

    function test_V3_signaturesOfAnotherVersionContractOrChainAreRefused() public {
        uint256 id = _makeDaily(70_000_000, 7);

        // An opening signed under the first version's domain.
        GiftEscrowV3.OpenIntent memory o = GiftEscrowV3.OpenIntent({
            recipient: recipient, deadline: uint64(VM.getBlockTimestamp() + 300), signature: ""
        });
        bytes32 openHash = keccak256(abi.encode(daily.OPEN_TYPEHASH(), id, recipient, o.deadline));
        o.signature = _sig("Viky Gift", "1", address(daily), LINK_KEY, openHash);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, o);

        // Signed for the milestone contract.
        o.signature = _sig("Viky Milestone", "2", address(milestone), LINK_KEY, openHash);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, o);

        // Signed under the second version's domain, for this very address: the third's own version is "3".
        o.signature = _sig("Viky Gift", "2", address(daily), LINK_KEY, openHash);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, o);

        // Signed for the same contract on another chain.
        o.signature = _sig("Viky Gift", "3", address(daily), LINK_KEY, openHash);
        VM.chainId(10143);
        VM.expectRevert(GiftEscrowV3.InvalidOpeningSignature.selector);
        daily.claim(id, o);
        VM.chainId(31337);
        daily.claim(id, o);

        // A withdrawal intent of the recipient signed for the version in service.
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 1) + 30 minutes);
        _read(id, 1010);
        GiftEscrowV3.WithdrawIntent memory w = GiftEscrowV3.WithdrawIntent({
            to: attacker, amount: 10_000_000, nonce: 0, deadline: uint64(VM.getBlockTimestamp() + 300), signature: ""
        });
        bytes32 wHash = keccak256(abi.encode(daily.WITHDRAW_TYPEHASH(), id, w.to, w.amount, w.nonce, w.deadline));
        w.signature = _sig("Viky Gift", "1", address(v1), RECIPIENT_KEY, wHash);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.withdrawEarnedWithIntent(id, w);
        w.signature = _sig("Viky Gift", "1", address(daily), RECIPIENT_KEY, wHash);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.withdrawEarnedWithIntent(id, w);
        // Nor one signed under the second version's domain.
        w.signature = _sig("Viky Gift", "2", address(daily), RECIPIENT_KEY, wHash);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.withdrawEarnedWithIntent(id, w);
    }

    /// @dev A withdrawal intent signed before an ending is retired by it (one counter for both).
    function test_V3_anOlderIntentIsRetiredByALaterOne() public {
        uint256 id = _makeDaily(70_000_000, 7);
        _openDaily(id);
        _read(id, 1000);
        uint256 d0 = _today();
        VM.warp(_dayStart(d0 + 2) + 30 minutes);
        _read(id, 1010);
        GiftEscrowV3.WithdrawIntent memory w = _dailyWithdraw(daily, id, attacker, 10_000_000, RECIPIENT_KEY);
        (uint256 keep, uint256 giveBack) = daily.endPreview(id);
        daily.endGiftWithIntent(id, _dailyEnd(daily, id, keep, giveBack, RECIPIENT_KEY));
        VM.expectRevert(GiftEscrowV3.InvalidIntentNonce.selector);
        daily.withdrawEarnedWithIntent(id, w);
    }

    // --- added by the authors: the seven scenarios above that proved a defect now fail, each as named here -----

    /// @dev Runs a scenario as its own call, and requires that it stops on exactly this refusal.
    function _nowFailsWith(bytes4 scenario, bytes4 refusal, string memory what) private {
        (bool ran, bytes memory why) = address(this).call(abi.encodeWithSelector(scenario));
        if (ran) revert(string.concat("the defect is back: ", what));
        if (why.length < 4 || bytes4(why) != refusal) revert(string.concat("stopped on another refusal: ", what));
    }

    /// @dev R-02. The second `setCheckInPaused(true)`, six days into the first, is refused: a pause that runs is
    ///      not sent again.
    function test_fixed_R02_aRenewedPauseNoLongerFreezesTheFundersMoney() public {
        _nowFailsWith(
            this.defect_V3_renewedPauseFreezesTheFundersMoneyPastSevenDays.selector,
            GiftEscrowV3.PauseTooSoon.selector,
            "a pause was sent again while it ran"
        );
    }

    /// @dev R-02. The same refusal, on a gift nobody opened.
    function test_fixed_R02_aRenewedPauseNoLongerHoldsAnUnopenedGift() public {
        _nowFailsWith(
            this.defect_V3_renewedPause_unopenedGift_onlyTheFundersOwnCancelWorks.selector,
            GiftEscrowV3.PauseTooSoon.selector,
            "a pause was sent again while it ran"
        );
    }

    /// @dev R-02, on the milestone contract.
    function test_fixed_R02_aRenewedPauseNoLongerBlocksExpire() public {
        _nowFailsWith(
            this.defect_V2_milestone_renewedPauseBlocksExpire.selector,
            MilestoneGiftV2.PauseTooSoon.selector,
            "a pause of proofs was sent again while it ran"
        );
    }

    /// @dev R-03. The second flick, 29 hours after the first, is refused: seven days of rest follow a pause.
    function test_fixed_R03_aFlickedPauseNoLongerVoidsTheCatchUpWindow() public {
        _nowFailsWith(
            this.defect_V3_flickedPauseVoidsTheCatchUpWindow.selector,
            GiftEscrowV3.PauseTooSoon.selector,
            "a pause was sent again inside the rest that follows one"
        );
    }

    /// @dev R-04, the climb. After the late pause the reading is refused as it was before it.
    function test_fixed_R04_aLatePauseNoLongerReopensAClimb() public {
        _nowFailsWith(
            this.defect_V2_milestone_aLatePauseReopensAClimb.selector,
            MilestoneGiftV2.DeadlinePassed.selector,
            "a pause sent a month after the deadline reopened the grace"
        );
    }

    /// @dev R-04, the certificate. The scenario stops one line before the proof: it expected `expire` to be refused
    ///      after the late pause, and `expire` is accepted now, which is the same correction seen from the funder's
    ///      side. The test below it walks the same steps to the proof, which is refused with `DeadlinePassed`, the
    ///      refusal the reviewer wrote.
    function test_fixed_R04_aLatePauseNoLongerHoldsTheFunderOfAClosedCertificate() public {
        (bool ran, bytes memory why) =
            address(this).call(abi.encodeWithSelector(this.defect_V2_milestone_aLatePauseReopensAClosedWindow.selector));
        if (ran) revert("the defect is back: a pause sent weeks after the late window reopened it");
        if (!_says(why, "next call did not revert as expected")) {
            revert("stopped somewhere else than on `expire` being accepted");
        }
    }

    /// @dev Whether a refusal's data carries these words, however the test runner wraps them.
    function _says(bytes memory why, bytes memory words) private pure returns (bool) {
        if (why.length < words.length) return false;
        for (uint256 i = 0; i + words.length <= why.length; ++i) {
            uint256 j = 0;
            while (j < words.length && why[i + j] == words[j]) ++j;
            if (j == words.length) return true;
        }
        return false;
    }

    function test_fixed_R04_aLatePauseNoLongerReopensAClosedWindow() public {
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_HAVE, 50_000_000, 10, SUBJECT);
        p.refundTo = BOX;
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        uint256 t0 = VM.getBlockTimestamp();
        uint64 granted = uint64(t0 + 5 days);

        VM.warp(t0 + 10 days + 14 days + 20 days);
        milestone.setProofPaused(true);
        milestone.setProofPaused(false);
        VM.warp(VM.getBlockTimestamp() + 13 days);
        MilestoneGiftV2.ProofAttestation memory again = _milestoneProof(
            milestone, id, recipient, SUBJECT, PROVIDER_HAVE, 1, granted, uint64(VM.getBlockTimestamp())
        );
        VM.expectRevert(MilestoneGiftV2.DeadlinePassed.selector);
        milestone.prove(id, again);
        milestone.expire(id);
        milestone.refundUnearned(id);
        _eq(token.balanceOf(BOX), 50_000_000, "the funder has it back, pause or no pause");
    }

    /// @dev R-05. The announcement made before the hand-over is gone when the Safe accepts, so there is no signer
    ///      to make stand a day later.
    function test_fixed_R05_aSignerAnnouncedBeforeTheHandOverNoLongerStands() public {
        _nowFailsWith(
            this.defect_V3_aSignerAnnouncedBeforeTheHandOverStandsAfterIt.selector,
            GiftEscrowV3.NoSignerPending.selector,
            "a signer announced by the outgoing owner stood under the new one"
        );
    }
}
