// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title  ConsentAnchor
/// @notice Where the agreement of the person a gift is for is written down in public. It holds no money and moves
///         none. It records two things: which consent key an account agrees with, once and for good, and every yes
///         and every stop that key signed for a gift, in the order they were given.
/// @dev    The person a gift is for agrees to what Viky reads of them, and can stop it, by signing a text with a
///         consent key: an Ed25519 key their passkey makes, apart from the key of their account, which can move
///         no money. Until this contract the tie between that key and the account was one row of Viky's database,
///         so whoever wrote the database could put a key of their own there and sign a yes, or copy an old yes
///         back after a stop (the audit of 1 Oct 2026, S-02).
///
///         **The key is bound by the account itself.** `bind` takes the account's own signature (EIP-712
///         `ConsentKey`) over the consent key, and keeps the first one for ever. Nobody else can name a key for an
///         account, and nobody can replace one.
///
///         **Every yes and every stop is anchored in order.** `anchor` writes the digest of the signed text, its
///         kind, and the consent key's signature over a short message that names this contract, the account, the
///         gift, the kind, the place in the gift's sequence and that digest. The place in the sequence is part of
///         what is signed and is checked here, so an old yes cannot be written again after a stop.
///
///         This contract cannot check an Ed25519 signature: the chain has no way to. It keeps the signature in
///         the open instead, with everything the signed message is made of, so anybody can check it against the
///         bound key without asking Viky for anything (`pnpm verify:consent`). An entry whose signature does not
///         verify is an entry that proves nothing, and the anchorer is the only one who can have written it.
///
///         Only the anchorer writes entries, because an entry nobody checked would use up a place in a gift's
///         sequence. What the anchorer cannot do is the point: it cannot sign for anybody, cannot bind a key, and
///         cannot reorder what was signed.
contract ConsentAnchor is Ownable2Step, EIP712 {
    bytes32 public constant CONSENT_KEY_TYPEHASH = keccak256("ConsentKey(address account,bytes32 key)");

    /// @dev The person agrees to what is read for the gift.
    uint8 public constant KIND_YES = 1;
    /// @dev The person stops it, from that moment.
    uint8 public constant KIND_STOP = 2;

    struct Entry {
        uint8 kind;
        uint64 anchoredAt;
        /// @dev sha256 of the text the person signed, byte for byte.
        bytes32 digest;
        /// @dev The consent key's Ed25519 signature over the anchor message, in its two halves.
        bytes32 signatureR;
        bytes32 signatureS;
    }

    /// @dev The one account allowed to write entries: Viky's relayer.
    address public anchorer;
    /// @dev The Ed25519 public key an account agrees with, or zero when it has bound none.
    mapping(address => bytes32) public consentKeyOf;
    mapping(address => mapping(uint256 => Entry[])) private entries;

    event ConsentKeyBound(address indexed account, bytes32 indexed key);
    event ConsentAnchored(
        address indexed account,
        uint256 indexed giftId,
        uint8 kind,
        uint64 sequence,
        bytes32 digest,
        bytes32 signatureR,
        bytes32 signatureS
    );
    event AnchorerUpdated(address indexed previousAnchorer, address indexed newAnchorer);

    error InvalidAddress();
    error InvalidKey();
    error InvalidKind();
    error InvalidDigest();
    error KeyAlreadyBound();
    error KeyNotBound();
    error InvalidAccountSignature();
    error NotAnchorer();
    error OutOfSequence();
    error OwnershipIsNotRenounceable();

    constructor(address anchorer_) EIP712("Viky Consent", "1") {
        if (anchorer_ == address(0)) revert InvalidAddress();
        anchorer = anchorer_;
        emit AnchorerUpdated(address(0), anchorer_);
    }

    /// @notice Binds a consent key to an account, with the account's own signature. Anyone may submit it; only the
    ///         account can have signed it. The first key bound stands for good: the same passkey makes the same
    ///         key on every device, so another key is another passkey.
    function bind(address account, bytes32 key, bytes calldata signature) external {
        if (account == address(0)) revert InvalidAddress();
        if (key == bytes32(0)) revert InvalidKey();
        if (consentKeyOf[account] != bytes32(0)) revert KeyAlreadyBound();
        bytes32 structHash = keccak256(abi.encode(CONSENT_KEY_TYPEHASH, account, key));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != account) revert InvalidAccountSignature();
        consentKeyOf[account] = key;
        emit ConsentKeyBound(account, key);
    }

    /// @notice Writes one yes or one stop of an account for a gift, at the next place in that gift's sequence.
    /// @param  sequence The place it takes, counted from zero. It is part of the message the consent key signed,
    ///                  so it must be the next one: a signature made for an earlier place cannot be written again.
    function anchor(
        address account,
        uint256 giftId,
        uint8 kind,
        uint64 sequence,
        bytes32 digest,
        bytes32 signatureR,
        bytes32 signatureS
    ) external {
        if (msg.sender != anchorer) revert NotAnchorer();
        if (consentKeyOf[account] == bytes32(0)) revert KeyNotBound();
        if (kind != KIND_YES && kind != KIND_STOP) revert InvalidKind();
        if (digest == bytes32(0)) revert InvalidDigest();
        Entry[] storage list = entries[account][giftId];
        if (sequence != list.length) revert OutOfSequence();
        list.push(
            Entry({
                kind: kind,
                anchoredAt: uint64(block.timestamp),
                digest: digest,
                signatureR: signatureR,
                signatureS: signatureS
            })
        );
        emit ConsentAnchored(account, giftId, kind, sequence, digest, signatureR, signatureS);
    }

    /// @notice How many entries an account has for a gift: the place the next one takes.
    function entryCount(address account, uint256 giftId) external view returns (uint256) {
        return entries[account][giftId].length;
    }

    /// @notice One entry of an account for a gift, by its place.
    function entryAt(address account, uint256 giftId, uint256 sequence) external view returns (Entry memory) {
        return entries[account][giftId][sequence];
    }

    /// @notice The EIP-712 digest an account signs to bind a consent key, for whoever checks one by hand.
    function bindingDigest(address account, bytes32 key) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CONSENT_KEY_TYPEHASH, account, key)));
    }

    // --- the owner --------------------------------------------------------------------------------------

    /// @notice Names another anchorer, when the relayer's key changes. It changes who may write, and nothing that
    ///         was written.
    function setAnchorer(address newAnchorer) external onlyOwner {
        if (newAnchorer == address(0)) revert InvalidAddress();
        emit AnchorerUpdated(anchorer, newAnchorer);
        anchorer = newAnchorer;
    }

    /// @dev Giving up ownership would leave the anchorer where it stands for ever.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipIsNotRenounceable();
    }
}
