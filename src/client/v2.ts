import { getAddress, type Hex, type LocalAccount } from "viem";
import type { EndOffer } from "../gift-ending";
import { isMilestoneGiftId } from "../milestone-protocol";
import { dailyVersionOf, giftEscrowV2Address, milestoneGiftV2Address, milestoneVersionOf, type ContractVersion } from "../v2";
import { endTypedData, giftLink, giftLinkTypedData, linkFingerprint, linkSecretFrom, openingAccount, OPEN_TTL_SECONDS, openTypedData, previewTokenOf, startTypedData, type V2Kind } from "../v2-protocol";
import { ApiError, postJson } from "./api";

/**
 * The browser's half of the second version of the two gift contracts (the audit of 1 Oct 2026). Everything here is off
 * until the second version's addresses are set (src/v2.ts): until then no gift is made with a link key, and none of
 * these functions is reached.
 *
 * What changes for a browser:
 *
 * - **The funder's browser makes the link.** Its secret is the hash of the funder's own signature over the gift's salt,
 *   so the same account finds it again on any device. The server is given the address of the opening key and the
 *   fingerprint of the link's preview token, which is made from the secret and cannot be turned back into it.
 * - **The secret travels after the `#` of the link** (the review of 2 Oct 2026, R-01), which a browser sends to no
 *   server: not at the visit, not to the image a messaging app fetches. `?t=` carries the preview token. This code
 *   sends the secret in no request. What it cannot promise is the code itself: the page is served by Viky, and a
 *   server that served other code could read the `#`.
 * - **The recipient's browser opens the gift.** It makes the opening key from the secret after the `#` and signs which
 *   account the gift opens for. The server relays that signature; the secret is not sent with it.
 * - **The recipient's account signs the first reading** (the review of 2 Oct 2026, R-15). The server reads, holds what
 *   it read and answers what there is to sign; the account signs it here and the reading is sent with that signature.
 *   With the signing session open it takes no gesture; otherwise the passkey is asked for once.
 * - **The recipient can end the gift**, signing the two amounts the screen showed.
 */

/** Where new gifts of each kind are made once the second version is set, or nothing while it is not. */
export function secondVersionOf(kind: V2Kind): Hex | null {
  return kind === "daily" ? giftEscrowV2Address() : milestoneGiftV2Address();
}

/** Which version of its contract holds a gift, from the contract's own address. */
export function versionOf(giftId: string, contract: string | null | undefined): ContractVersion {
  return isMilestoneGiftId(giftId) ? milestoneVersionOf(contract) : dailyVersionOf(contract);
}

const kindOf = (giftId: string): V2Kind => (isMilestoneGiftId(giftId) ? "milestone" : "daily");

/** The secret of a gift's link, made, or made again, by the account that offers the gift from the gift's own salt. */
export async function linkSecretOf(account: LocalAccount, salt: Hex): Promise<string> {
  return linkSecretFrom(await account.signTypedData(giftLinkTypedData(salt)));
}

/**
 * What the funder's terms and the creation request carry of the link: the opening key's address, and the fingerprint
 * of the preview token, which is what the link will send the server in `?t=`.
 */
export async function linkForTerms(account: LocalAccount, salt: Hex): Promise<{ openingKey: Hex; linkFingerprint: string }> {
  const secret = await linkSecretOf(account, salt);
  return { openingKey: openingAccount(secret).address, linkFingerprint: linkFingerprint(previewTokenOf(secret)) };
}

/** The address this app is at, as a link names it. */
function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || window.location.origin;
}

/** The link of a gift the account made, built here: the server never held its secret, so it cannot answer it. */
export async function giftLinkOf(account: LocalAccount, salt: Hex, giftId: string): Promise<string> {
  return giftLink(appOrigin(), giftId, await linkSecretOf(account, salt));
}

/**
 * Opens a gift of the second version for the signed-in account: the key made from the secret after the link's `#` signs
 * which account it opens for, here, and only the signature leaves the browser.
 */
export async function openWithLinkKey(input: { giftId: string; contract: Hex; recipient: string; linkSecret: string; nowMs?: number }): Promise<{ giftId: string; opened: boolean }> {
  const deadline = BigInt(Math.floor((input.nowMs ?? Date.now()) / 1_000) + OPEN_TTL_SECONDS);
  const signature = await openingAccount(input.linkSecret).signTypedData(
    openTypedData(kindOf(input.giftId), input.contract, { giftId: BigInt(input.giftId), recipient: getAddress(input.recipient), deadline }),
  );
  return postJson("/api/gift/claim", { giftId: input.giftId, opening: { deadline: deadline.toString(), signature } });
}

/**
 * Ends a gift, on the person's own signature over the two amounts their screen showed. The contract works both out
 * again and refuses if either differs, and then the screen shows them again.
 */
export async function endGift(input: { account: LocalAccount; giftId: string; contract: Hex; offer: EndOffer }): Promise<{ ended: boolean; keep: string; giveBack: string }> {
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
  const message = { giftId: BigInt(input.giftId), keep: BigInt(input.offer.keep), giveBack: BigInt(input.offer.giveBack), nonce: BigInt(input.offer.nonce), deadline };
  const signature = await input.account.signTypedData(endTypedData(kindOf(input.giftId), input.contract, message));
  return postJson(`/api/gift/${input.giftId}/end`, {
    keep: message.keep.toString(),
    giveBack: message.giveBack.toString(),
    nonce: message.nonce.toString(),
    deadline: deadline.toString(),
    signature,
  });
}

/** What the server answers in place of a first reading's outcome: it read, holds it, and this is what there is to sign. */
export type StartAsked = Readonly<{ kind: "sign"; giftId: string; start: Readonly<{ of: V2Kind; contract: Hex; identityHash: Hex; metricValue: string; observedAt: string }> }>;

/**
 * The second half of a first reading on the second version: when the server answers that the reading waits for the
 * recipient's signature, their account signs exactly that reading and asks again with it, and what the reading came to
 * is answered as if it had been one request. Any other outcome is passed through untouched.
 *
 * The account signs for the gift the page is on and for no other: an answer naming another gift is refused here.
 */
export async function withTheStartSigned<T extends { kind: string }>(giftId: string, outcome: T | StartAsked, signer: () => Promise<LocalAccount>): Promise<T> {
  if (outcome.kind !== "sign") return outcome as T;
  const asked = outcome as StartAsked;
  if (asked.giftId !== giftId || !/^0x[0-9a-fA-F]{64}$/.test(asked.start.identityHash)) throw new ApiError({ status: 409, code: "REFUSED", message: "That reading could not be used. Try again in a minute." });
  const account = await signer();
  const signature = await account.signTypedData(
    startTypedData(asked.start.of, getAddress(asked.start.contract), { giftId: BigInt(giftId), identityHash: asked.start.identityHash, metricValue: BigInt(asked.start.metricValue), observedAt: BigInt(asked.start.observedAt) }),
  );
  return postJson<T>(`/api/gift/${giftId}/bind`, { startSignature: signature });
}
