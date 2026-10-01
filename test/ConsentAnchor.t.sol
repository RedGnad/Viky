// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ConsentAnchor} from "../contracts/ConsentAnchor.sol";

interface VmConsent {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function chainId(uint256 newChainId) external;
}

/// @notice Where a recipient's agreement is written down in public (the audit of 1 Oct 2026, S-02 and section 3.7).
///         What must hold: only the account names its consent key, once; only the anchorer writes entries; and an
///         entry takes the next place of its gift's sequence and no other, so nothing signed earlier is written again.
contract ConsentAnchorTest {
    VmConsent private constant VM = VmConsent(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant ACCOUNT_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    uint256 private constant START = 1_800_000_000;
    bytes32 private constant CONSENT_KEY = keccak256("an Ed25519 public key");
    bytes32 private constant OTHER_CONSENT_KEY = keccak256("another Ed25519 public key");
    bytes32 private constant DIGEST = keccak256("the text of a yes");
    bytes32 private constant R = keccak256("signature r");
    bytes32 private constant S = keccak256("signature s");

    ConsentAnchor private anchor;
    address private account;
    address private other;
    address private relayer = address(0x4E1A7);

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        account = VM.addr(ACCOUNT_KEY);
        other = VM.addr(OTHER_KEY);
        anchor = new ConsentAnchor(relayer);
    }

    // --- the key ----------------------------------------------------------------------------------------------

    function testAnAccountBindsItsConsentKeyWithItsOwnSignatureAndAnybodyCarriesIt() public {
        bytes memory signature = _binding(account, CONSENT_KEY, ACCOUNT_KEY);
        VM.prank(other);
        anchor.bind(account, CONSENT_KEY, signature);
        require(anchor.consentKeyOf(account) == CONSENT_KEY, "bound");
    }

    function testNobodyElseCanNameAKeyForAnAccount() public {
        // Signed by another account: whoever writes Viky's database holds no key that makes this signature.
        bytes memory forged = _binding(account, OTHER_CONSENT_KEY, OTHER_KEY);
        VM.expectRevert(ConsentAnchor.InvalidAccountSignature.selector);
        anchor.bind(account, OTHER_CONSENT_KEY, forged);
        // The account's signature over one key binds no other key.
        bytes memory signature = _binding(account, CONSENT_KEY, ACCOUNT_KEY);
        VM.expectRevert(ConsentAnchor.InvalidAccountSignature.selector);
        anchor.bind(account, OTHER_CONSENT_KEY, signature);
        // Nor the same key to another account.
        VM.expectRevert(ConsentAnchor.InvalidAccountSignature.selector);
        anchor.bind(other, CONSENT_KEY, signature);
        require(anchor.consentKeyOf(account) == bytes32(0) && anchor.consentKeyOf(other) == bytes32(0), "nothing bound");
    }

    function testTheFirstKeyBoundStandsForGood() public {
        anchor.bind(account, CONSENT_KEY, _binding(account, CONSENT_KEY, ACCOUNT_KEY));
        // Even the account itself cannot replace it: the same passkey makes the same key on every device.
        bytes memory again = _binding(account, OTHER_CONSENT_KEY, ACCOUNT_KEY);
        VM.expectRevert(ConsentAnchor.KeyAlreadyBound.selector);
        anchor.bind(account, OTHER_CONSENT_KEY, again);
        require(anchor.consentKeyOf(account) == CONSENT_KEY, "the first stands");
    }

    function testABindingNamesAnAccountAndAKey() public {
        bytes memory signature = _binding(account, CONSENT_KEY, ACCOUNT_KEY);
        VM.expectRevert(ConsentAnchor.InvalidAddress.selector);
        anchor.bind(address(0), CONSENT_KEY, signature);
        VM.expectRevert(ConsentAnchor.InvalidKey.selector);
        anchor.bind(account, bytes32(0), signature);
    }

    function testABindingMadeForAnotherContractOrAnotherChainBindsNothingHere() public {
        ConsentAnchor elsewhere = new ConsentAnchor(relayer);
        bytes memory signature = _binding(account, CONSENT_KEY, ACCOUNT_KEY);
        VM.expectRevert(ConsentAnchor.InvalidAccountSignature.selector);
        elsewhere.bind(account, CONSENT_KEY, signature);
        require(
            anchor.bindingDigest(account, CONSENT_KEY) != elsewhere.bindingDigest(account, CONSENT_KEY),
            "the contract is part of what is signed"
        );
    }

    // --- the entries ------------------------------------------------------------------------------------------

    function testAYesThenAStopAreWrittenInOrderAndReadBack() public {
        _bound();
        VM.prank(relayer);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        VM.warp(START + 3 days);
        VM.prank(relayer);
        anchor.anchor(account, 7, 2, 1, keccak256("the text of a stop"), S, R);

        require(anchor.entryCount(account, 7) == 2, "two entries");
        ConsentAnchor.Entry memory yes = anchor.entryAt(account, 7, 0);
        require(yes.kind == 1 && yes.anchoredAt == START && yes.digest == DIGEST, "the yes");
        require(yes.signatureR == R && yes.signatureS == S, "with the signature anybody can check");
        ConsentAnchor.Entry memory stop = anchor.entryAt(account, 7, 1);
        require(stop.kind == 2 && stop.anchoredAt == START + 3 days, "then the stop");
    }

    /// @dev What a database row could not stop (S-02): an old yes copied back after a stop. The place in the sequence
    ///      is part of what the consent key signed, and only the next place can be written.
    function testAnOldYesCannotBeWrittenAgainAfterAStop() public {
        _bound();
        VM.prank(relayer);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        VM.prank(relayer);
        anchor.anchor(account, 7, 2, 1, keccak256("the text of a stop"), S, R);
        // The yes of place 0, sent again as it was signed.
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.OutOfSequence.selector);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        // A place cannot be skipped either.
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.OutOfSequence.selector);
        anchor.anchor(account, 7, 1, 3, DIGEST, R, S);
        require(anchor.entryCount(account, 7) == 2, "nothing was added");
    }

    function testEachGiftHasItsOwnSequence() public {
        _bound();
        VM.prank(relayer);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        VM.prank(relayer);
        anchor.anchor(account, 1_000_004, 1, 0, DIGEST, R, S);
        require(anchor.entryCount(account, 7) == 1 && anchor.entryCount(account, 1_000_004) == 1, "one each");
        require(anchor.entryCount(other, 7) == 0, "and another account's are its own");
    }

    function testOnlyTheAnchorerWritesAndOnlyForAnAccountThatBoundItsKey() public {
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.KeyNotBound.selector);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        _bound();
        // Not the account itself, not the owner: an entry nobody checked would use up a place.
        VM.prank(account);
        VM.expectRevert(ConsentAnchor.NotAnchorer.selector);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        VM.expectRevert(ConsentAnchor.NotAnchorer.selector);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.InvalidKind.selector);
        anchor.anchor(account, 7, 0, 0, DIGEST, R, S);
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.InvalidKind.selector);
        anchor.anchor(account, 7, 3, 0, DIGEST, R, S);
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.InvalidDigest.selector);
        anchor.anchor(account, 7, 1, 0, bytes32(0), R, S);
    }

    // --- the owner --------------------------------------------------------------------------------------------

    function testTheOwnerNamesAnotherAnchorerAndNothingWrittenChanges() public {
        _bound();
        VM.prank(relayer);
        anchor.anchor(account, 7, 1, 0, DIGEST, R, S);
        address next = address(0xBEEF);
        anchor.setAnchorer(next);
        VM.prank(relayer);
        VM.expectRevert(ConsentAnchor.NotAnchorer.selector);
        anchor.anchor(account, 7, 2, 1, DIGEST, R, S);
        VM.prank(next);
        anchor.anchor(account, 7, 2, 1, DIGEST, R, S);
        require(anchor.entryAt(account, 7, 0).kind == 1 && anchor.consentKeyOf(account) == CONSENT_KEY, "untouched");

        VM.expectRevert(ConsentAnchor.InvalidAddress.selector);
        anchor.setAnchorer(address(0));
        VM.prank(other);
        VM.expectRevert(bytes("Ownable: caller is not the owner"));
        anchor.setAnchorer(other);
    }

    function testOwnershipMovesInTwoStepsAndCannotBeGivenUp() public {
        address safe = address(0x5AFE);
        anchor.transferOwnership(safe);
        require(anchor.owner() == address(this) && anchor.pendingOwner() == safe, "nothing moved until it is accepted");
        VM.prank(safe);
        anchor.acceptOwnership();
        require(anchor.owner() == safe, "accepted");
        VM.prank(safe);
        VM.expectRevert(ConsentAnchor.OwnershipIsNotRenounceable.selector);
        anchor.renounceOwnership();
        VM.expectRevert(ConsentAnchor.InvalidAddress.selector);
        new ConsentAnchor(address(0));
    }

    // --- helpers ----------------------------------------------------------------------------------------------

    function _bound() private {
        anchor.bind(account, CONSENT_KEY, _binding(account, CONSENT_KEY, ACCOUNT_KEY));
    }

    function _binding(address who, bytes32 key, uint256 signerKey) private returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Viky Consent"),
                keccak256("1"),
                block.chainid,
                address(anchor)
            )
        );
        bytes32 structHash = keccak256(abi.encode(anchor.CONSENT_KEY_TYPEHASH(), who, key));
        (uint8 v, bytes32 r, bytes32 s) =
            VM.sign(signerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
}
