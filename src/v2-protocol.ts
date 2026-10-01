import { encodeAbiParameters, hexToBytes, keccak256, parseAbiParameters, sha256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, CHECK_IN_TYPES, WITHDRAW_TYPES } from "./gift-terms";
import { MILESTONE_PROOF_TYPES, MILESTONE_WITHDRAW_TYPES } from "./milestone-protocol";

/**
 * The browser-safe half of the second version of the two gift contracts (`contracts/GiftEscrowV2.sol`,
 * `contracts/MilestoneGiftV2.sol`, the audit of 1 Oct 2026): the terms a funder signs, the opening the key of a
 * gift's link signs, and the ending the person a gift is for signs. No secret of Viky's and no Node module, so a
 * screen computes exactly what the contract will check. Every value is pinned against the contracts by
 * test/V2TypehashParity.t.sol and test/v2-protocol.test.ts: if either side drifts, its side fails.
 *
 * What the second version changes for whoever signs:
 *
 * - **The terms carry the address of an opening key** where the first version carried a contact hash that named
 *   nobody. The key is made in the funder's browser from the secret the gift's link carries (`openingAccount`), and
 *   only its address ever leaves that browser.
 * - **Opening is signed by that key**, in the browser of whoever holds the link (`openTypedData`). The evidence
 *   signer opens nothing any more.
 * - **The person a gift is for can end it** (`endTypedData`), signing the two amounts their screen shows.
 *
 * The readings (`CheckIn`, `Proof`) and the withdrawal (`Withdraw`) keep their types; what changes for them is the
 * domain's version, "2", so nothing signed for one version is ever valid on the other.
 */

export const GIFT_V2_DOMAIN = { name: "Viky Gift", version: "2", chainId: CHAIN_ID } as const;
export const MILESTONE_V2_DOMAIN = { name: "Viky Milestone", version: "2", chainId: CHAIN_ID } as const;

/** Which of the two contracts a typed message is for. */
export type V2Kind = "daily" | "milestone";

export function v2Domain(kind: V2Kind, contract: Hex) {
  return { ...(kind === "daily" ? GIFT_V2_DOMAIN : MILESTONE_V2_DOMAIN), verifyingContract: contract };
}

export const OPEN_TYPES = {
  Open: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const END_TYPES = {
  End: [
    { name: "giftId", type: "uint256" },
    { name: "keep", type: "uint256" },
    { name: "giveBack", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const OPEN_TYPEHASH = keccak256(stringToHex("Open(uint256 giftId,address recipient,uint64 deadline)"));
export const END_TYPEHASH = keccak256(stringToHex("End(uint256 giftId,uint256 keep,uint256 giveBack,uint256 nonce,uint64 deadline)"));

export const FUND_NONCE_TAG_V2 = keccak256(stringToHex("viky.fund.v2"));
export const MILESTONE_FUND_NONCE_TAG_V2 = keccak256(stringToHex("viky.milestone.fund.v2"));

/** `GiftEscrowV2.MAX_OBSERVATION_AGE`: a reading more than thirty minutes old is refused. */
export const MAX_OBSERVATION_AGE_SECONDS = 30 * 60;
/** `MAX_PAUSE` of both contracts: a pause ends by itself seven days after it was last sent. */
export const MAX_PAUSE_SECONDS = 7 * 86_400;
/** `SIGNER_DELAY` of both contracts: an announced evidence signer stands a day later. */
export const SIGNER_DELAY_SECONDS = 24 * 60 * 60;

// --- the terms -------------------------------------------------------------------------------------------------

export type GiftParamsV2 = {
  funder: Hex;
  refundTo: Hex;
  /** The address of the key that opens the gift (`openingAccount(secret).address`). */
  openingKey: Hex;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  salt: Hex;
};

/** `GiftEscrowV2.hashGiftParams`, byte for byte. */
export function hashGiftParamsV2(p: GiftParamsV2): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, address, uint8, uint32, uint32, uint256, bytes32"), [
      p.funder,
      p.refundTo,
      p.openingKey,
      p.goalType,
      p.dailyTarget,
      p.durationDays,
      p.amount,
      p.salt,
    ]),
  );
}

/** `GiftEscrowV2.fundingNonce`: the nonce the funder's `ReceiveWithAuthorization` carries. */
export function fundingNonceV2(p: GiftParamsV2): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [FUND_NONCE_TAG_V2, hashGiftParamsV2(p)]));
}

export type MilestoneParamsV2 = {
  funder: Hex;
  refundTo: Hex;
  openingKey: Hex;
  goalType: number;
  shape: number;
  target: bigint;
  maximumStart: bigint;
  subject: Hex;
  durationDays: number;
  amount: bigint;
  salt: Hex;
};

/** `MilestoneGiftV2.hashParams`, byte for byte. */
export function hashMilestoneParamsV2(p: MilestoneParamsV2): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, address, uint8, uint8, uint64, uint64, bytes32, uint32, uint256, bytes32"), [
      p.funder,
      p.refundTo,
      p.openingKey,
      p.goalType,
      p.shape,
      p.target,
      p.maximumStart,
      p.subject,
      p.durationDays,
      p.amount,
      p.salt,
    ]),
  );
}

/** `MilestoneGiftV2.fundingNonce`. */
export function milestoneFundingNonceV2(p: MilestoneParamsV2): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [MILESTONE_FUND_NONCE_TAG_V2, hashMilestoneParamsV2(p)]));
}

// --- the link, and the key it carries --------------------------------------------------------------------------

/** What a link's secret looks like: what the routes that take one accept, and what `linkSecretFrom` makes. */
export const LINK_SECRET = /^[A-Za-z0-9_-]{16,64}$/;

const OPENING_KEY_TAG = "viky:open:v2:";

/**
 * The key that opens a gift, made from the secret its link carries. Whoever holds the link makes the same key, in
 * their own browser, and nobody else can: the secret is in the link and nowhere else. Its address is what the funder's
 * terms carry and what the contract compares an opening against.
 */
export function openingAccount(linkSecret: string) {
  if (!LINK_SECRET.test(linkSecret)) throw new Error("This is not the key of a gift's link");
  return privateKeyToAccount(keccak256(stringToHex(`${OPENING_KEY_TAG}${linkSecret}`)));
}

/**
 * The fingerprint of a link, which is all Viky keeps of it (src/gift-store.ts, `claimTokenHash`, the same value byte for
 * byte): enough to tell that a reader holds the link, and useless to open the gift with.
 */
export function linkFingerprint(linkSecret: string): string {
  return sha256(stringToHex(`viky:claim:v1:${linkSecret}`)).slice(2);
}

/**
 * How a funder finds a gift's link again on another device, with nothing kept anywhere that could open the gift.
 *
 * The secret of the link is not random: it is made from the funder's own signature over the gift's salt. The same
 * account signing the same salt makes the same signature (RFC 6979: an ECDSA signature by a given key over a given
 * message is always the same), so the same secret, on any device where their passkey opens their account. The salt is
 * public, it is in the terms the contract was sent. The signature is not: only the funder's account can make it, it
 * is made in their browser and never leaves it, and only its hash becomes the secret.
 */
export const GIFT_LINK_DOMAIN = { name: "Viky Link", version: "1", chainId: CHAIN_ID } as const;
export const GIFT_LINK_TYPES = { GiftLink: [{ name: "salt", type: "bytes32" }] } as const;

/** What the funder's account signs to make, or find again, the secret of a gift's link. */
export function giftLinkTypedData(salt: Hex) {
  return { domain: GIFT_LINK_DOMAIN, types: GIFT_LINK_TYPES, primaryType: "GiftLink" as const, message: { salt } };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The secret of the link from the funder's signature: 24 bytes of its hash, written as a link carries them. */
export function linkSecretFrom(signature: Hex): string {
  return base64Url(hexToBytes(keccak256(signature)).slice(0, 24));
}

// --- what is signed --------------------------------------------------------------------------------------------

/** Signed by the gift's opening key: which account the gift opens for, and until when the signature is good. */
export function openTypedData(kind: V2Kind, contract: Hex, message: { giftId: bigint; recipient: Hex; deadline: bigint }) {
  return { domain: v2Domain(kind, contract), types: OPEN_TYPES, primaryType: "Open" as const, message };
}

/** How long an opening signature is good for: long enough for a slow relay, short enough to mean "now". */
export const OPEN_TTL_SECONDS = 10 * 60;

/** Signed by the recipient's own account: the two amounts their screen shows, to the unit. */
export function endTypedData(kind: V2Kind, contract: Hex, message: { giftId: bigint; keep: bigint; giveBack: bigint; nonce: bigint; deadline: bigint }) {
  return { domain: v2Domain(kind, contract), types: END_TYPES, primaryType: "End" as const, message };
}

/** The recipient's withdrawal, as on the first version but under the second version's domain. */
export function withdrawTypedDataV2(kind: V2Kind, contract: Hex, message: { giftId: bigint; to: Hex; amount: bigint; nonce: bigint; deadline: bigint }) {
  return { domain: v2Domain(kind, contract), types: kind === "daily" ? WITHDRAW_TYPES : MILESTONE_WITHDRAW_TYPES, primaryType: "Withdraw" as const, message };
}

/** The types the evidence signer signs a reading with: unchanged from the first version, under the second's domain. */
export const READING_TYPES_V2 = { daily: CHECK_IN_TYPES, milestone: MILESTONE_PROOF_TYPES } as const;

// --- the agreement, written down in public (contracts/ConsentAnchor.sol) -----------------------------------------

export const CONSENT_DOMAIN = { name: "Viky Consent", version: "1", chainId: CHAIN_ID } as const;
export const CONSENT_KEY_TYPES = {
  ConsentKey: [
    { name: "account", type: "address" },
    { name: "key", type: "bytes32" },
  ],
} as const;
export const CONSENT_KEY_TYPEHASH = keccak256(stringToHex("ConsentKey(address account,bytes32 key)"));

/** What an account signs, once, to say which consent key it agrees with. */
export function consentKeyTypedData(anchor: Hex, account: Hex, key: Hex) {
  return { domain: { ...CONSENT_DOMAIN, verifyingContract: anchor }, types: CONSENT_KEY_TYPES, primaryType: "ConsentKey" as const, message: { account, key } };
}

export const CONSENT_KIND = { yes: 1, stop: 2 } as const;

/**
 * The short message the consent key signs for the public record of a yes or a stop. Everything in it is on the chain
 * beside the signature, so anybody rebuilds it and checks the signature against the key the account bound, with
 * nothing asked of Viky. The agreement's own text stays private; its sha256 is what ties it to this message.
 */
export function consentAnchorMessage(input: { anchor: Hex; account: Hex; giftId: string | bigint; kind: "yes" | "stop"; sequence: number | bigint; digest: Hex }): string {
  return [
    "Viky consent anchor, version 1",
    `Chain: ${CHAIN_ID}`,
    `Contract: ${input.anchor.toLowerCase()}`,
    `Account: ${input.account.toLowerCase()}`,
    `Gift: ${input.giftId.toString()}`,
    `Kind: ${input.kind}`,
    `Sequence: ${input.sequence.toString()}`,
    `Text: ${input.digest.toLowerCase()}`,
  ].join("\n");
}

/** The digest an entry carries: sha256 of the agreement's text, byte for byte as it was signed. */
export function consentTextDigest(text: string): Hex {
  return sha256(new TextEncoder().encode(text));
}
