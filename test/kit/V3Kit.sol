// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV3} from "../../contracts/GiftEscrowV3.sol";
import {MilestoneGiftV2} from "../../contracts/MilestoneGiftV2.sol";

interface VmKit {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function skip(bool skipTest) external;
}

/// @dev What a token needs to say for a funding signature to be made for it: the mock and the real AUSD both do.
interface IFundingToken {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice The signatures every test of the third daily contract makes, beside the milestone contract of the second
///         version, which the third leaves as it is: the funder's payment, the link key's opening, the evidence
///         signer's readings and the recipient's own intents. The same kit as the second version's (`V2Kit.sol`),
///         with the daily contract's type and the version of its signing domain, "3"; the milestone's stays "2".
abstract contract V3Kit {
    VmKit internal constant VM = VmKit(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    uint256 internal constant EVIDENCE_KEY = 0xE1D3;
    uint256 internal constant FUNDER_KEY = 0xF00D;
    uint256 internal constant RECIPIENT_KEY = 0x5EC;
    uint256 internal constant OTHER_KEY = 0x07E;
    /// @dev The key a gift's link carries: its address is in the terms the funder signs.
    uint256 internal constant LINK_KEY = 0x11AB;

    uint256 private kitNullifiers;
    uint256 private kitSalts;

    /// @dev The key of an account a suite signs as, or zero for an account the kit holds no key of. The first
    ///      reading of a gift is signed by the account it is for beside the evidence signer, so a reading the kit
    ///      builds carries that signature whenever the kit can make it; the contracts read it on a first reading
    ///      and on no other.
    function _accountKey(address who) internal returns (uint256) {
        uint256[7] memory keys = [RECIPIENT_KEY, OTHER_KEY, FUNDER_KEY, uint256(0xBAD), 0xC0FFEE, 0xF00E, LINK_KEY];
        for (uint256 i = 0; i < keys.length; ++i) {
            if (VM.addr(keys[i]) == who) return keys[i];
        }
        return 0;
    }

    /// @dev What the account a gift is for signs on its first reading: `Start`, the same type on both contracts.
    function _startSignature(
        string memory name,
        address verifying,
        bytes32 typehash,
        uint256 giftId,
        address who,
        bytes32 identity,
        uint64 metric,
        uint64 observedAt
    ) internal returns (bytes memory) {
        uint256 key = _accountKey(who);
        if (key == 0) return "";
        return _signed(name, verifying, key, keccak256(abi.encode(typehash, giftId, identity, metric, observedAt)));
    }

    function _salt() internal returns (bytes32) {
        return keccak256(abi.encode("kit salt", ++kitSalts));
    }

    function _nullifier() internal returns (bytes32) {
        return keccak256(abi.encode("kit nullifier", ++kitNullifiers));
    }

    function _signed(string memory name, address verifying, uint256 key, bytes32 structHash)
        internal
        returns (bytes memory)
    {
        // The daily contract signs under the third version of its domain, the milestone contract under the second.
        bytes32 version = keccak256(bytes(name)) == keccak256("Viky Gift") ? keccak256("3") : keccak256("2");
        bytes32 domain =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), version, block.chainid, verifying));
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    /// @dev The funder's one signature: an EIP-3009 authorization whose nonce is the terms themselves.
    function _funding(address token, address to, address funder, uint256 amount, bytes32 nonce, uint256 funderKey)
        internal
        returns (uint256 validBefore, uint8 v, bytes32 r, bytes32 s)
    {
        validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, funder, to, amount, uint256(0), validBefore, nonce));
        (v, r, s) = VM.sign(
            funderKey, keccak256(abi.encodePacked("\x19\x01", IFundingToken(token).DOMAIN_SEPARATOR(), structHash))
        );
    }

    // --- the daily contract ---------------------------------------------------------------------------------

    function _dailyParams(address funder, uint8 goal, uint256 amount, uint32 duration, uint32 target)
        internal
        returns (GiftEscrowV3.GiftParams memory)
    {
        return GiftEscrowV3.GiftParams({
            funder: funder,
            refundTo: funder,
            openingKey: VM.addr(LINK_KEY),
            goalType: goal,
            dailyTarget: target,
            durationDays: duration,
            amount: amount,
            salt: _salt()
        });
    }

    function _dailyAuthorization(GiftEscrowV3 escrow, GiftEscrowV3.GiftParams memory p, uint256 funderKey)
        internal
        returns (GiftEscrowV3.Authorization memory a)
    {
        a.nonce = escrow.fundingNonce(p);
        (a.validBefore, a.v, a.r, a.s) =
            _funding(address(escrow.token()), address(escrow), p.funder, p.amount, a.nonce, funderKey);
    }

    function _dailyOpen(GiftEscrowV3 escrow, uint256 giftId, address who, uint256 key)
        internal
        returns (GiftEscrowV3.OpenIntent memory o)
    {
        o = GiftEscrowV3.OpenIntent({
            recipient: who, deadline: uint64(VM.getBlockTimestamp() + 5 minutes), signature: ""
        });
        o.signature = _signed(
            "Viky Gift", address(escrow), key, keccak256(abi.encode(escrow.OPEN_TYPEHASH(), giftId, who, o.deadline))
        );
    }

    function _dailyReading(
        GiftEscrowV3 escrow,
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt
    ) internal returns (GiftEscrowV3.CheckInAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrowV3.CheckInAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            observedAt: observedAt,
            nullifier: _nullifier(),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: "",
            recipientSignature: _startSignature(
                "Viky Gift", address(escrow), escrow.START_TYPEHASH(), giftId, who, identity, metric, observedAt
            )
        });
        a.signature = _signed(
            "Viky Gift",
            address(escrow),
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

    function _dailyWithdraw(GiftEscrowV3 escrow, uint256 giftId, address to, uint256 amount, uint256 key)
        internal
        returns (GiftEscrowV3.WithdrawIntent memory w)
    {
        w = GiftEscrowV3.WithdrawIntent({
            to: to,
            amount: amount,
            nonce: escrow.withdrawNonces(giftId),
            deadline: uint64(VM.getBlockTimestamp() + 10 minutes),
            signature: ""
        });
        w.signature = _signed(
            "Viky Gift",
            address(escrow),
            key,
            keccak256(abi.encode(escrow.WITHDRAW_TYPEHASH(), giftId, w.to, w.amount, w.nonce, w.deadline))
        );
    }

    function _dailyEnd(GiftEscrowV3 escrow, uint256 giftId, uint256 keep, uint256 giveBack, uint256 key)
        internal
        returns (GiftEscrowV3.EndIntent memory e)
    {
        e = GiftEscrowV3.EndIntent({
            keep: keep,
            giveBack: giveBack,
            nonce: escrow.withdrawNonces(giftId),
            deadline: uint64(VM.getBlockTimestamp() + 10 minutes),
            signature: ""
        });
        e.signature = _signed(
            "Viky Gift",
            address(escrow),
            key,
            keccak256(abi.encode(escrow.END_TYPEHASH(), giftId, e.keep, e.giveBack, e.nonce, e.deadline))
        );
    }

    // --- the milestone contract -----------------------------------------------------------------------------

    function _climbParams(
        address funder,
        uint8 goal,
        uint256 amount,
        uint32 duration,
        uint64 target,
        uint64 maximumStart
    ) internal returns (MilestoneGiftV2.MilestoneParams memory) {
        return MilestoneGiftV2.MilestoneParams({
            funder: funder,
            refundTo: funder,
            openingKey: VM.addr(LINK_KEY),
            goalType: goal,
            shape: 0,
            target: target,
            maximumStart: maximumStart,
            subject: bytes32(0),
            durationDays: duration,
            amount: amount,
            salt: _salt()
        });
    }

    function _haveParams(address funder, uint8 goal, uint256 amount, uint32 duration, bytes32 subject)
        internal
        returns (MilestoneGiftV2.MilestoneParams memory)
    {
        return MilestoneGiftV2.MilestoneParams({
            funder: funder,
            refundTo: funder,
            openingKey: VM.addr(LINK_KEY),
            goalType: goal,
            shape: 1,
            target: 1,
            maximumStart: 0,
            subject: subject,
            durationDays: duration,
            amount: amount,
            salt: _salt()
        });
    }

    function _milestoneAuthorization(MilestoneGiftV2 gift, MilestoneGiftV2.MilestoneParams memory p, uint256 funderKey)
        internal
        returns (MilestoneGiftV2.Authorization memory a)
    {
        a.nonce = gift.fundingNonce(p);
        (a.validBefore, a.v, a.r, a.s) =
            _funding(address(gift.token()), address(gift), p.funder, p.amount, a.nonce, funderKey);
    }

    function _milestoneOpen(MilestoneGiftV2 gift, uint256 giftId, address who, uint256 key)
        internal
        returns (MilestoneGiftV2.OpenIntent memory o)
    {
        o = MilestoneGiftV2.OpenIntent({
            recipient: who, deadline: uint64(VM.getBlockTimestamp() + 5 minutes), signature: ""
        });
        o.signature = _signed(
            "Viky Milestone", address(gift), key, keccak256(abi.encode(gift.OPEN_TYPEHASH(), giftId, who, o.deadline))
        );
    }

    function _milestoneProof(
        MilestoneGiftV2 gift,
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 eventAt,
        uint64 observedAt
    ) internal returns (MilestoneGiftV2.ProofAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = MilestoneGiftV2.ProofAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            eventAt: eventAt,
            observedAt: observedAt,
            nullifier: _nullifier(),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: "",
            recipientSignature: _startSignature(
                "Viky Milestone", address(gift), gift.START_TYPEHASH(), giftId, who, identity, metric, observedAt
            )
        });
        a.signature = _signed(
            "Viky Milestone",
            address(gift),
            EVIDENCE_KEY,
            keccak256(
                abi.encode(
                    gift.PROOF_TYPEHASH(),
                    giftId,
                    a.recipient,
                    a.identityHash,
                    a.providerId,
                    a.metricValue,
                    a.eventAt,
                    a.observedAt,
                    a.nullifier,
                    a.issuedAt,
                    a.expiresAt
                )
            )
        );
    }

    function _milestoneWithdraw(MilestoneGiftV2 gift, uint256 giftId, address to, uint256 amount, uint256 key)
        internal
        returns (MilestoneGiftV2.WithdrawIntent memory w)
    {
        w = MilestoneGiftV2.WithdrawIntent({
            to: to,
            amount: amount,
            nonce: gift.withdrawNonces(giftId),
            deadline: uint64(VM.getBlockTimestamp() + 10 minutes),
            signature: ""
        });
        w.signature = _signed(
            "Viky Milestone",
            address(gift),
            key,
            keccak256(abi.encode(gift.WITHDRAW_TYPEHASH(), giftId, w.to, w.amount, w.nonce, w.deadline))
        );
    }

    function _milestoneEnd(MilestoneGiftV2 gift, uint256 giftId, uint256 giveBack, uint256 key)
        internal
        returns (MilestoneGiftV2.EndIntent memory e)
    {
        e = MilestoneGiftV2.EndIntent({
            keep: 0,
            giveBack: giveBack,
            nonce: gift.withdrawNonces(giftId),
            deadline: uint64(VM.getBlockTimestamp() + 10 minutes),
            signature: ""
        });
        e.signature = _signed(
            "Viky Milestone",
            address(gift),
            key,
            keccak256(abi.encode(gift.END_TYPEHASH(), giftId, e.keep, e.giveBack, e.nonce, e.deadline))
        );
    }
}
