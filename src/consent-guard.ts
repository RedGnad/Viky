import { consentBytes, fromHex } from "./consent";
import { anchorContract, anchorWaitingRows } from "./consent-anchoring";
import { consentKeyOf, consentsWaitingForAnchor, ed25519Verifies, latestConsent, type ConsentRow } from "./consent-store";
import { readGift } from "./gift-reader";
import { loadGift } from "./gift-store";
import { readMilestoneGift } from "./milestone-reader";
import { isMilestoneGiftId } from "./milestone-protocol";
import { escrowOf } from "./relayer";

/**
 * Whether a reading may be taken for a gift (the founder, 29 Sep 2026): no reading that moves money without the
 * recipient's valid yes. Every path that reads asks here, the nightly passes, the frequent pass, the reading on
 * opening, a certificate, a university's proof, a race, a competition. Server only.
 *
 * A stop is final until a new yes: nothing is read after it, so a day not read goes back to the funder and a target not
 * read by its deadline brings the whole gift back. A gift funded before agreements existed is read as before, marked so,
 * until its recipient says yes or stop on their next visit.
 */

/** Gifts funded from this moment are read only with a yes: the day agreements went live, 30 Sep 2026, 00:00 UTC. */
export const AGREEMENTS_FROM = Date.UTC(2026, 8, 30) / 1000;

export type ReadingLeave = Readonly<{ allowed: true; beforeAgreements: boolean }> | Readonly<{ allowed: false; reason: "no_agreement" | "stopped" }>;

/** The row still stands: signed for this gift, not in the future, over its own text, by the key its account signs with. Checked at every reading. */
async function stands(row: ConsentRow, giftId: string): Promise<boolean> {
  if (!row.text.includes(`\nGift: ${giftId}\n`) || row.signedAt.getTime() > Date.now()) return false;
  const key = fromHex(row.publicKey);
  const signature = fromHex(row.signature);
  if (!key || !signature || !ed25519Verifies(key, consentBytes(row.text), signature)) return false;
  return (await consentKeyOf(row.account)) === row.publicKey.toLowerCase();
}

/** Tries once more whatever of this gift still waits for the anchor, oldest first. Nothing while the anchor is off. */
async function anchorWhatWaits(latest: ConsentRow): Promise<void> {
  if (latest.anchorTx !== null || latest.anchorSignature === null || !anchorContract()) return;
  await anchorWaitingRows(await consentsWaitingForAnchor(latest.giftId));
}

/**
 * @param anchor Tries once more to write what still waits for the anchor (the audit of 1 Oct 2026). A yes, before the
 *   reading it allows: the public record then holds the yes before the reading that moved money. And a stop (the
 *   review of 2 Oct 2026, R-07): it holds from the moment it is signed, and every pass asks here, so a stop the anchor
 *   missed once is tried again at each pass until it is written. The answer never waits on the outcome. A caller that
 *   only reads the state, and takes no reading, passes `false`.
 */
export async function readingLeave(giftId: string, fundedAt: number, anchor = true): Promise<ReadingLeave> {
  const latest = await latestConsent(giftId);
  if (latest?.kind === "yes") {
    if (!(await stands(latest, giftId))) return { allowed: false, reason: "no_agreement" };
    if (anchor) await anchorWhatWaits(latest);
    return { allowed: true, beforeAgreements: false };
  }
  if (latest?.kind === "stop") {
    if (anchor) await anchorWhatWaits(latest);
    return { allowed: false, reason: "stopped" };
  }
  return fundedAt > 0 && fundedAt < AGREEMENTS_FROM ? { allowed: true, beforeAgreements: true } : { allowed: false, reason: "no_agreement" };
}

/** The same answer for a path that holds only the gift's id: its funding moment is read from the contract. */
export async function giftReadingLeave(giftId: string): Promise<ReadingLeave> {
  const gift = await loadGift(giftId);
  if (!gift) return { allowed: false, reason: "no_agreement" };
  const contract = escrowOf(gift);
  const { fundedAt } = isMilestoneGiftId(giftId) ? await readMilestoneGift(contract, giftId) : await readGift(contract, giftId);
  return readingLeave(giftId, fundedAt);
}

/**
 * What held when a reading was taken, for the journal: a yes, the time before agreements (a gift funded before they
 * existed, not yet answered), or no agreement (never given, or stopped). Rows oldest first.
 */
export type AgreementMark = "agreed" | "before_agreements" | "no_agreement";

export function agreementAt(history: readonly ConsentRow[], fundedAt: number, atSeconds: number): AgreementMark {
  let held: ConsentRow | null = null;
  for (const row of history) if (row.signedAt.getTime() <= atSeconds * 1_000) held = row;
  if (held) return held.kind === "yes" ? "agreed" : "no_agreement";
  return fundedAt > 0 && fundedAt < AGREEMENTS_FROM ? "before_agreements" : "no_agreement";
}

/** The refusal every reader answers with, in the words the journal and the screens use. */
export const NO_AGREEMENT = { code: "NO_AGREEMENT", message: "Not read: no agreement." } as const;
