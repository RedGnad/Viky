// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MilestoneGift} from "../contracts/MilestoneGift.sol";

interface VmMilestoneFork {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function skip(bool skipTest) external;
}

interface IAusdFork is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function decimals() external view returns (uint8);
}

/// @notice A milestone gift from end to end against the REAL AUSD on a Monad mainnet fork: the funder's one signature
///         pulls the money, the evidence signer's claim and two readings start and settle the climb, and the recipient
///         takes the whole amount through a signed intent, as the relayer does it. Skips when MONAD_RPC_URL is unset.
contract MilestoneGiftForkTest {
    VmMilestoneFork private constant VM = VmMilestoneFork(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    uint256 private constant FUNDER_KEY = 0xF0F0;
    uint256 private constant RECIPIENT_KEY = 0x5EC5;
    uint256 private constant EVIDENCE_KEY = 0xE1D3;
    uint256 private constant AMOUNT = 5_000_000; // 5 AUSD
    bytes32 private constant NO_CONTACT = keccak256("viky:contact:v1:none");
    bytes32 private constant RAPID = keccak256("viky:provider:chess-com-rapid-zkfetch:v1");
    bytes32 private constant IDENTITY = keccak256("identity:41");

    bool private forked;
    MilestoneGift private gift;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
    }

    function testAMilestoneGiftRunsOnRealAusdFromFundingToTakingIt() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        require(block.chainid == 143, "not Monad mainnet");
        IAusdFork ausd = IAusdFork(AUSD);
        address funder = VM.addr(FUNDER_KEY);
        address recipient = VM.addr(RECIPIENT_KEY);
        VM.prank(CURVE_POOL);
        ausd.transfer(funder, AMOUNT);

        gift = new MilestoneGift(IERC20(AUSD), VM.addr(EVIDENCE_KEY), 1_000_000);
        gift.registerGoal(1, RAPID, gift.SHAPE_CLIMB());
        gift.setCreationPaused(false);
        gift.setProofPaused(false);

        MilestoneGift.MilestoneParams memory p = MilestoneGift.MilestoneParams({
            funder: funder,
            refundTo: funder,
            recipientContactHash: NO_CONTACT,
            goalType: 1,
            shape: 0,
            target: 1954,
            maximumStart: 1914,
            subject: bytes32(0),
            durationDays: 30,
            amount: AMOUNT,
            salt: keccak256("fork salt")
        });
        MilestoneGift.Authorization memory a;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = gift.fundingNonce(p);
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, funder, address(gift), AMOUNT, a.validAfter, a.validBefore, a.nonce)
        );
        (a.v, a.r, a.s) =
            VM.sign(FUNDER_KEY, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash)));
        uint256 id = gift.createGift(p, a);
        require(id == 1_000_000, "the first milestone gift");
        require(ausd.balanceOf(address(gift)) == AMOUNT && ausd.balanceOf(funder) == 0, "the real AUSD moved");

        uint64 now_ = uint64(block.timestamp);
        MilestoneGift.ClaimAttestation memory c = MilestoneGift.ClaimAttestation({
            recipient: recipient, contactHash: NO_CONTACT, issuedAt: now_, expiresAt: now_ + 5 minutes, signature: ""
        });
        c.signature =
            _sign(keccak256(abi.encode(gift.CLAIM_TYPEHASH(), id, recipient, NO_CONTACT, c.issuedAt, c.expiresAt)));
        gift.claim(id, c);

        gift.prove(id, _proof(id, recipient, 1904, uint64(block.timestamp), 1));
        VM.warp(block.timestamp + 3 days);
        gift.prove(id, _proof(id, recipient, 1960, uint64(block.timestamp), 2));
        require(gift.earnedBalance(id) == AMOUNT, "all of it is theirs");

        MilestoneGift.WithdrawIntent memory i = MilestoneGift.WithdrawIntent({
            to: recipient, amount: AMOUNT, nonce: 0, deadline: uint64(block.timestamp + 10 minutes), signature: ""
        });
        bytes32 withdrawHash = keccak256(abi.encode(gift.WITHDRAW_TYPEHASH(), id, i.to, i.amount, i.nonce, i.deadline));
        i.signature = _signWith(RECIPIENT_KEY, withdrawHash);
        gift.withdrawEarnedWithIntent(id, i);
        require(ausd.balanceOf(recipient) == AMOUNT, "the recipient holds the real AUSD");
        require(ausd.balanceOf(address(gift)) == 0, "nothing stays behind");
    }

    function _proof(uint256 id, address recipient, uint64 rating, uint64 observedAt, uint256 seed)
        private
        returns (MilestoneGift.ProofAttestation memory a)
    {
        uint64 now_ = uint64(block.timestamp);
        a = MilestoneGift.ProofAttestation({
            recipient: recipient,
            identityHash: IDENTITY,
            providerId: RAPID,
            metricValue: rating,
            eventAt: 0,
            observedAt: observedAt,
            nullifier: keccak256(abi.encode("fork nullifier", seed)),
            issuedAt: now_,
            expiresAt: now_ + 5 minutes,
            signature: ""
        });
        a.signature = _sign(
            keccak256(
                abi.encode(
                    gift.PROOF_TYPEHASH(),
                    id,
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

    function _sign(bytes32 structHash) private returns (bytes memory) {
        return _signWith(EVIDENCE_KEY, structHash);
    }

    function _signWith(uint256 key, bytes32 structHash) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Milestone"),
                keccak256("1"),
                block.chainid,
                address(gift)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
