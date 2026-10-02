// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../contracts/GiftEscrowV2.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V2Kit} from "./kit/V2Kit.sol";

/// @notice The first reading of a gift is signed by the account the gift is for, beside the evidence signer (the
///         review of 2 Oct 2026, R-15). That reading binds an identity and a starting value for good. With the
///         evidence key alone, somebody could send it for a gift just opened with an identity nobody holds: every
///         real reading was refused from then on, the money went back to the funder and the person lost their gift.
contract V2FirstReadingTest is V2Kit {
    uint256 private constant START = 1_800_000_000;
    uint8 private constant GOAL = 1;
    uint8 private constant GOAL_CERTIFICATE = 2;
    bytes32 private constant PROVIDER = keccak256("a source that moves");
    bytes32 private constant CERTIFICATE_PROVIDER = keccak256("a source that grants");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant INVENTED = keccak256("identity:nobody");
    bytes32 private constant SUBJECT = keccak256("subject:ama:a course");

    MockAUSD private token;
    GiftEscrowV2 private daily;
    MilestoneGiftV2 private milestone;
    address private funder;
    address private recipient;
    address private other;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        funder = VM.addr(FUNDER_KEY);
        recipient = VM.addr(RECIPIENT_KEY);
        other = VM.addr(OTHER_KEY);
        token = new MockAUSD();
        token.mint(funder, 1_000_000_000);
        daily = new GiftEscrowV2(token, VM.addr(EVIDENCE_KEY), 1);
        daily.registerGoal(GOAL, PROVIDER);
        daily.setCreationPaused(false);
        milestone = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        milestone.registerGoal(GOAL, PROVIDER, 0);
        milestone.registerGoal(GOAL_CERTIFICATE, CERTIFICATE_PROVIDER, 1);
        milestone.setCreationPaused(false);
    }

    // --- the daily contract -----------------------------------------------------------------------------------

    /// @dev The reviewer's scenario: whoever holds the evidence key, and nothing else, binds an invented identity
    ///      to a gift just opened. It is refused, and the person's own first reading is taken afterwards.
    function testTheEvidenceKeyAloneCannotBindAnIdentityToADailyGift() public {
        uint256 id = _openedDaily();
        GiftEscrowV2.CheckInAttestation memory forged =
            _dailyReading(daily, id, recipient, INVENTED, PROVIDER, 1000, _now());
        forged.recipientSignature = "";
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);

        // Signing it with the evidence key in the recipient's place is no better, nor is any other account.
        forged.recipientSignature = _start("Viky Gift", address(daily), EVIDENCE_KEY, id, INVENTED, 1000, _now());
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        forged.recipientSignature = _start("Viky Gift", address(daily), OTHER_KEY, id, INVENTED, 1000, _now());
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        // Nor bytes that are no signature at all.
        forged.recipientSignature = hex"01";
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        forged.recipientSignature = new bytes(65);
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        require(daily.getGift(id).identityHash == bytes32(0), "nothing was bound");

        daily.checkIn(id, _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now()));
        require(daily.getGift(id).identityHash == IDENTITY, "the person's own first reading is taken");
    }

    /// @dev The signature names the reading to the unit, so whoever sees it on its way cannot hang another reading
    ///      on it: another identity, another value, another moment, another gift, the other contract.
    function testTheRecipientsSignatureCarriesOneReadingAndNoOther() public {
        uint256 id = _openedDaily();
        uint256 second = _openedDaily();
        bytes memory theirs = _start("Viky Gift", address(daily), RECIPIENT_KEY, id, IDENTITY, 1000, _now());

        GiftEscrowV2.CheckInAttestation memory a = _dailyReading(daily, id, recipient, INVENTED, PROVIDER, 1000, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        // A baseline far above where they stand would refuse every real reading that followed.
        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, type(uint64).max, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now() - 1);
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        a = _dailyReading(daily, second, recipient, IDENTITY, PROVIDER, 1000, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(second, a);

        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now());
        a.recipientSignature = _start("Viky Milestone", address(milestone), RECIPIENT_KEY, id, IDENTITY, 1000, _now());
        VM.expectRevert(GiftEscrowV2.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        // The reading it was made for, sent by anybody, is taken.
        a.recipientSignature = theirs;
        VM.prank(other);
        daily.checkIn(id, a);
        require(daily.getGift(id).baselineValue == 1000, "the reading they signed, and no other");
    }

    /// @dev Every reading after the first is taken in the morning with nobody there to sign: the evidence signer's
    ///      signature is all it carries, as before.
    function testTheReadingsThatFollowNeedNoSignatureOfTheRecipient() public {
        uint256 id = _openedDaily();
        daily.checkIn(id, _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now()));
        uint256 morning = (START / 1 days + 2) * 1 days + 30 minutes;
        VM.warp(morning);
        GiftEscrowV2.CheckInAttestation memory next =
            _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1010, uint64(morning));
        next.recipientSignature = "";
        daily.checkIn(id, next);
        require(daily.getGift(id).creditedDays == 1, "a day counted on the evidence signer's reading alone");
    }

    // --- the milestone contract -------------------------------------------------------------------------------

    /// @dev On a climb the first reading is the start, recorded whatever it says: an invented identity, or a start
    ///      above what the funder accepted, and the gift could never pay.
    function testTheEvidenceKeyAloneCannotStartAClimb() public {
        uint256 id = _openedClimb();
        MilestoneGiftV2.ProofAttestation memory forged =
            _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1499, 0, _now());
        forged.recipientSignature = "";
        VM.expectRevert(MilestoneGiftV2.InvalidRecipientSignature.selector);
        milestone.prove(id, forged);
        forged.recipientSignature =
            _start("Viky Milestone", address(milestone), EVIDENCE_KEY, id, IDENTITY, 1499, _now());
        VM.expectRevert(MilestoneGiftV2.InvalidRecipientSignature.selector);
        milestone.prove(id, forged);

        // The recipient signed a start at 1200. It cannot carry a start at 1499, above the funder's 1400.
        forged.recipientSignature =
            _start("Viky Milestone", address(milestone), RECIPIENT_KEY, id, IDENTITY, 1200, _now());
        VM.expectRevert(MilestoneGiftV2.InvalidRecipientSignature.selector);
        milestone.prove(id, forged);
        // Nor one signed for the daily contract.
        forged.recipientSignature = _start("Viky Gift", address(daily), RECIPIENT_KEY, id, IDENTITY, 1499, _now());
        VM.expectRevert(MilestoneGiftV2.InvalidRecipientSignature.selector);
        milestone.prove(id, forged);
        require(milestone.getGift(id).identityHash == bytes32(0), "nothing was recorded");

        milestone.prove(id, _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1200, 0, _now()));
        require(milestone.getGift(id).startingValue == 1200, "the start the person signed");
    }

    function testTheProofsThatFollowAStartNeedNoSignatureOfTheRecipient() public {
        uint256 id = _openedClimb();
        milestone.prove(id, _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1200, 0, _now()));
        VM.warp(START + 3 days);
        MilestoneGiftV2.ProofAttestation memory reached =
            _milestoneProof(milestone, id, recipient, IDENTITY, PROVIDER, 1500, 0, _now());
        reached.recipientSignature = "";
        milestone.prove(id, reached);
        require(milestone.earnedBalance(id) == 50_000_000, "paid on the evidence signer's reading alone");
    }

    /// @dev A certificate has no first reading: one proof pays or is refused, and it must name what the funder
    ///      named. There is nothing for the evidence key to bind, so nothing more is asked of the recipient.
    function testACertificateIsProvedWithoutASignatureOfTheRecipient() public {
        MilestoneGiftV2.MilestoneParams memory p = _haveParams(funder, GOAL_CERTIFICATE, 50_000_000, 10, SUBJECT);
        uint256 id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
        VM.warp(START + 3 days);
        MilestoneGiftV2.ProofAttestation memory granted =
            _milestoneProof(milestone, id, recipient, SUBJECT, CERTIFICATE_PROVIDER, 1, uint64(START + 2 days), _now());
        granted.recipientSignature = "";
        milestone.prove(id, granted);
        require(milestone.earnedBalance(id) == 50_000_000, "paid");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _now() private view returns (uint64) {
        return uint64(VM.getBlockTimestamp());
    }

    function _openedDaily() private returns (uint256 id) {
        GiftEscrowV2.GiftParams memory p = _dailyParams(funder, GOAL, 70_000_000, 7, 10);
        id = daily.createGift(p, _dailyAuthorization(daily, p, FUNDER_KEY));
        daily.claim(id, _dailyOpen(daily, id, recipient, LINK_KEY));
    }

    function _openedClimb() private returns (uint256 id) {
        MilestoneGiftV2.MilestoneParams memory p = _climbParams(funder, GOAL, 50_000_000, 10, 1500, 1400);
        id = milestone.createGift(p, _milestoneAuthorization(milestone, p, FUNDER_KEY));
        milestone.claim(id, _milestoneOpen(milestone, id, recipient, LINK_KEY));
    }

    /// @dev A `Start` signed by any key, under any of the two domains: what a forger would try.
    function _start(
        string memory name,
        address verifying,
        uint256 key,
        uint256 giftId,
        bytes32 identity,
        uint64 metric,
        uint64 observedAt
    ) private returns (bytes memory) {
        return _signed(
            name, verifying, key, keccak256(abi.encode(daily.START_TYPEHASH(), giftId, identity, metric, observedAt))
        );
    }
}
