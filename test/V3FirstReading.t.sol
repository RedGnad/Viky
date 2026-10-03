// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../contracts/GiftEscrowV3.sol";
import {MilestoneGiftV2} from "../contracts/MilestoneGiftV2.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {V3Kit} from "./kit/V3Kit.sol";

/// @notice The first reading of a gift is signed by the account the gift is for, beside the evidence signer (the
///         review of 2 Oct 2026, R-15). That reading binds an identity and a starting value for good. With the
///         evidence key alone, somebody could send it for a gift just opened with an identity nobody holds: every
///         real reading was refused from then on, the money went back to the funder and the person lost their gift.
///         The second version's suite for the daily contract, on the third, which leaves this as it was. One test
///         is added: what was signed for the second version is not a signature on the third.
contract V3FirstReadingTest is V3Kit {
    uint256 private constant START = 1_800_000_000;
    uint8 private constant GOAL = 1;
    bytes32 private constant PROVIDER = keccak256("a source that moves");
    bytes32 private constant IDENTITY = keccak256("identity:ama");
    bytes32 private constant INVENTED = keccak256("identity:nobody");

    MockAUSD private token;
    GiftEscrowV3 private daily;
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
        daily = new GiftEscrowV3(token, VM.addr(EVIDENCE_KEY), 1);
        daily.registerGoal(GOAL, PROVIDER);
        daily.setCreationPaused(false);
        milestone = new MilestoneGiftV2(token, VM.addr(EVIDENCE_KEY), 1_000_000);
        milestone.registerGoal(GOAL, PROVIDER, 0);
    }

    // --- the daily contract -----------------------------------------------------------------------------------

    /// @dev The reviewer's scenario: whoever holds the evidence key, and nothing else, binds an invented identity
    ///      to a gift just opened. It is refused, and the person's own first reading is taken afterwards.
    function testTheEvidenceKeyAloneCannotBindAnIdentityToADailyGift() public {
        uint256 id = _openedDaily();
        GiftEscrowV3.CheckInAttestation memory forged =
            _dailyReading(daily, id, recipient, INVENTED, PROVIDER, 1000, _now());
        forged.recipientSignature = "";
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);

        // Signing it with the evidence key in the recipient's place is no better, nor is any other account.
        forged.recipientSignature = _start("Viky Gift", address(daily), EVIDENCE_KEY, id, INVENTED, 1000, _now());
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        forged.recipientSignature = _start("Viky Gift", address(daily), OTHER_KEY, id, INVENTED, 1000, _now());
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        // Nor bytes that are no signature at all.
        forged.recipientSignature = hex"01";
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, forged);
        forged.recipientSignature = new bytes(65);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
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

        GiftEscrowV3.CheckInAttestation memory a = _dailyReading(daily, id, recipient, INVENTED, PROVIDER, 1000, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        // A baseline far above where they stand would refuse every real reading that followed.
        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, type(uint64).max, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now() - 1);
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        a = _dailyReading(daily, second, recipient, IDENTITY, PROVIDER, 1000, _now());
        a.recipientSignature = theirs;
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(second, a);

        a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now());
        a.recipientSignature = _start("Viky Milestone", address(milestone), RECIPIENT_KEY, id, IDENTITY, 1000, _now());
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        // The reading it was made for, sent by anybody, is taken.
        a.recipientSignature = theirs;
        VM.prank(other);
        daily.checkIn(id, a);
        require(daily.getGift(id).baselineValue == 1000, "the reading they signed, and no other");
    }

    /// @dev Every reading after the first is taken by a pass with nobody there to sign: the evidence signer's
    ///      signature is all it carries, as before. On the third version it can be an hour after the first.
    function testTheReadingsThatFollowNeedNoSignatureOfTheRecipient() public {
        uint256 id = _openedDaily();
        daily.checkIn(id, _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now()));
        uint256 later = START + 1 hours;
        VM.warp(later);
        GiftEscrowV3.CheckInAttestation memory next =
            _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1010, uint64(later));
        next.recipientSignature = "";
        daily.checkIn(id, next);
        require(daily.getGift(id).creditedDays == 1, "a day counted on the evidence signer's reading alone");
    }

    /// @dev The third version signs under its own domain. A `Start` the recipient signed for the second version, for
    ///      the same gift number, identity, value and moment, at this very address, is not theirs here, and neither
    ///      is a reading the evidence signer attested under the second version's domain.
    function testWhatWasSignedForTheSecondVersionIsNoSignatureOnTheThird() public {
        uint256 id = _openedDaily();
        bytes32 startHash = keccak256(abi.encode(daily.START_TYPEHASH(), id, IDENTITY, uint64(1000), _now()));
        GiftEscrowV3.CheckInAttestation memory a = _dailyReading(daily, id, recipient, IDENTITY, PROVIDER, 1000, _now());
        bytes memory theirs = a.recipientSignature;
        a.recipientSignature = _underVersion("2", RECIPIENT_KEY, startHash);
        VM.expectRevert(GiftEscrowV3.InvalidRecipientSignature.selector);
        daily.checkIn(id, a);

        a.recipientSignature = theirs;
        bytes memory attested = a.signature;
        a.signature = _underVersion(
            "2",
            EVIDENCE_KEY,
            keccak256(
                abi.encode(
                    daily.CHECK_IN_TYPEHASH(),
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
        VM.expectRevert(GiftEscrowV3.InvalidEvidenceSigner.selector);
        daily.checkIn(id, a);

        // Both under the third version's domain: taken.
        a.signature = attested;
        daily.checkIn(id, a);
        require(daily.getGift(id).identityHash == IDENTITY, "bound under the third version's domain");
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _now() private view returns (uint64) {
        return uint64(VM.getBlockTimestamp());
    }

    function _openedDaily() private returns (uint256 id) {
        GiftEscrowV3.GiftParams memory p = _dailyParams(funder, GOAL, 70_000_000, 7, 10);
        id = daily.createGift(p, _dailyAuthorization(daily, p, FUNDER_KEY));
        daily.claim(id, _dailyOpen(daily, id, recipient, LINK_KEY));
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

    /// @dev A signature under the daily contract's domain at another version than its own.
    function _underVersion(string memory version, uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Gift"),
                keccak256(bytes(version)),
                block.chainid,
                address(daily)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
