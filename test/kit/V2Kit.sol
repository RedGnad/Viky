// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GiftEscrowV2} from "../../contracts/GiftEscrowV2.sol";
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

/// @notice The signatures every test of the second version makes: the funder's payment, the link key's opening, the
///         evidence signer's readings and the recipient's own intents. Kept in one place so the suites that walk
///         many gifts (the owner's bounds, the invariants, the fork) sign exactly what the contracts check.
abstract contract V2Kit {
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
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256("2"), block.chainid, verifying)
        );
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
        returns (GiftEscrowV2.GiftParams memory)
    {
        return GiftEscrowV2.GiftParams({
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

    function _dailyAuthorization(GiftEscrowV2 escrow, GiftEscrowV2.GiftParams memory p, uint256 funderKey)
        internal
        returns (GiftEscrowV2.Authorization memory a)
    {
        a.nonce = escrow.fundingNonce(p);
        (a.validBefore, a.v, a.r, a.s) =
            _funding(address(escrow.token()), address(escrow), p.funder, p.amount, a.nonce, funderKey);
    }

    function _dailyOpen(GiftEscrowV2 escrow, uint256 giftId, address who, uint256 key)
        internal
        returns (GiftEscrowV2.OpenIntent memory o)
    {
        o = GiftEscrowV2.OpenIntent({
            recipient: who, deadline: uint64(VM.getBlockTimestamp() + 5 minutes), signature: ""
        });
        o.signature = _signed(
            "Viky Gift", address(escrow), key, keccak256(abi.encode(escrow.OPEN_TYPEHASH(), giftId, who, o.deadline))
        );
    }

    function _dailyReading(
        GiftEscrowV2 escrow,
        uint256 giftId,
        address who,
        bytes32 identity,
        bytes32 provider,
        uint64 metric,
        uint64 observedAt
    ) internal returns (GiftEscrowV2.CheckInAttestation memory a) {
        uint64 issuedAt = uint64(VM.getBlockTimestamp());
        a = GiftEscrowV2.CheckInAttestation({
            recipient: who,
            identityHash: identity,
            providerId: provider,
            metricValue: metric,
            observedAt: observedAt,
            nullifier: _nullifier(),
            issuedAt: issuedAt,
            expiresAt: issuedAt + 5 minutes,
            signature: ""
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

    function _dailyWithdraw(GiftEscrowV2 escrow, uint256 giftId, address to, uint256 amount, uint256 key)
        internal
        returns (GiftEscrowV2.WithdrawIntent memory w)
    {
        w = GiftEscrowV2.WithdrawIntent({
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

    function _dailyEnd(GiftEscrowV2 escrow, uint256 giftId, uint256 keep, uint256 giveBack, uint256 key)
        internal
        returns (GiftEscrowV2.EndIntent memory e)
    {
        e = GiftEscrowV2.EndIntent({
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
            signature: ""
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
