import "../src/load-env";
import { getAddress, type Hex } from "viem";
import { loadGift } from "../src/gift-store";
import { readMilestoneGift } from "../src/milestone-reader";
import { relayProve } from "../src/milestone-relay";
import { loadMilestoneGift, recordReading } from "../src/milestone-store";
import { isMilestoneGiftId } from "../src/milestone-protocol";
import { decideReview, ensurePortalSchema, loadPortal, loadReview, pendingReviews, pinPortal, type PortalReview } from "../src/portal-store";
import { escrowOf } from "../src/relayer";
import { settleHeldReview, type SettleDeps } from "../src/shown-verification";
import { VerificationError } from "../src/duolingo-verification";
import { enrolledBy, type PortalExtract } from "../src/university-shown";
import type { WitnessPin } from "../src/witness-portal";

/**
 * The operator's review of a witness portal's first proof (D312). A first proof from a university read through a
 * Reclaim AI provider is checked on what is sure (the pinned witness, the domain, the method) and held; this command
 * shows what its pattern read, and then either pins the portal from it and settles the gift, or refuses it.
 *
 *   pnpm portal:pin
 *     lists the held proofs: the portal, the gift, the request and the fields the pattern read.
 *   PROVEN_BY=0x… pnpm portal:pin <session> --field <name> --matches <regex> --keeps "<words>" --proves account|enrolment
 *     checks the field against what was read, pins the portal (version, request, match, redaction, spec hash), relays
 *     the held proof to the milestone contract, then settles every other proof held for the same portal the same way,
 *     refusing by its code any that the pin does not fit.
 *   pnpm portal:pin <session>
 *     for a proof held before its portal was pinned by another: settles it on that pin.
 *   pnpm portal:pin <session> --refuse "<note for the journal>"
 *     closes the review: the person reads that the page did not show what the gift is for, and nothing moves.
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`), and
 * the relayer and evidence signer of the environment sign and carry the proof. `DRY_RUN=1` pins and relays nothing.
 */

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
}

function need(name: string): string {
  const value = flag(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function shown(review: PortalReview) {
  return { session: review.sessionId, portal: review.portalId, gift: review.giftId, version: review.providerVersion, observedAt: new Date(review.observedAt * 1_000).toISOString(), read: review.reading };
}

const deps: SettleDeps = {
  prove: relayProve,
  record: recordReading,
  milestoneRecordOf: loadMilestoneGift,
  milestoneOf: async (giftId) => {
    if (!isMilestoneGiftId(giftId)) return null;
    const contract: Hex = escrowOf(await loadGift(giftId));
    const state = await readMilestoneGift(contract, giftId);
    return state.recipient
      ? { contract, recipient: state.recipient, opened: true, settled: state.settled || state.cancelled, target: state.target }
      : { contract, recipient: "0x0000000000000000000000000000000000000000", opened: false, settled: false, target: state.target };
  },
  now: () => Math.floor(Date.now() / 1_000),
};

/** Settles one held proof on the portal's pin, and closes its review by what happened. */
async function settle(review: PortalReview): Promise<void> {
  const portal = await loadPortal(review.portalId);
  if (!portal) throw new Error(`no portal ${review.portalId}`);
  try {
    const outcome = await settleHeldReview(deps, { review, portal });
    await decideReview(review.sessionId, "pinned", null);
    console.log(JSON.stringify({ step: "settled", session: review.sessionId, gift: review.giftId, outcome }, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
  } catch (error) {
    // A proof the pin does not fit, a page without the field, a gift already over: refused by its code, said to the
    // person as the review's refusal. Anything else (the network, the chain) leaves it held for the next run.
    const final = error instanceof VerificationError && !["NOT_CONFIGURED", "UNKNOWN_GIFT"].includes(error.code);
    if (final) await decideReview(review.sessionId, "refused", (error as VerificationError).code);
    console.log(JSON.stringify({ step: final ? "refused" : "still held", session: review.sessionId, gift: review.giftId, reason: error instanceof Error ? error.message : String(error) }));
  }
}

async function main() {
  await ensurePortalSchema();
  const sessionId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  if (!sessionId) {
    const pending = await pendingReviews();
    console.log(JSON.stringify({ held: pending.length, reviews: pending.map(shown) }, null, 2));
    return;
  }
  const review = await loadReview(sessionId);
  if (!review) throw new Error(`no held proof for session ${sessionId}`);
  if (review.status !== "pending") throw new Error(`this review is already ${review.status}`);
  const dry = process.env.DRY_RUN === "1";

  const refusal = flag("refuse");
  if (refusal !== undefined) {
    console.log(JSON.stringify({ step: dry ? "would refuse" : "refusing", ...shown(review), note: refusal }, null, 2));
    if (!dry && !(await decideReview(sessionId, "refused", refusal.trim() || "refused on review"))) throw new Error("the review was decided meanwhile");
    return;
  }

  const portal = await loadPortal(review.portalId);
  if (!portal || portal.verification !== "witness") throw new Error(`${review.portalId} is not a witness portal`);
  // Held before the pin was set by another proof: settled on the pin the portal has.
  if (portal.pin) {
    console.log(JSON.stringify({ step: dry ? "would settle on the pin" : "settling on the pin", ...shown(review) }, null, 2));
    if (!dry) await settle(review);
    return;
  }
  const proves = need("proves");
  if (proves !== "account" && proves !== "enrolment") throw new Error("--proves is account or enrolment");
  const extract: PortalExtract = { field: need("field"), matches: need("matches"), keeps: need("keeps") };
  const read = review.reading as { fields?: Record<string, string>; url: string; method: string; responseMatches: string; responseRedactions: string; specHash: string };
  // The field must say it on the proof being pinned, or the pin would be born refusing its own first proof.
  if (!enrolledBy(extract, read.fields ?? {})) throw new Error(`the field ${extract.field} does not match ${extract.matches} on this proof: nothing pinned`);
  const pin: WitnessPin = { providerVersion: review.providerVersion, url: read.url, method: read.method, responseMatches: read.responseMatches, responseRedactions: read.responseRedactions, specHash: read.specHash };
  const operator = getAddress(String(process.env.PROVEN_BY?.trim()));
  console.log(JSON.stringify({ step: dry ? "would pin" : "pinning", portal: portal.portalId, pin, extract, proves }, null, 2));
  if (dry) return;
  if (!(await pinPortal(portal.portalId, { pin, extract, proves, operator }))) throw new Error("the portal could not be pinned");

  await settle(review);
  for (const other of await pendingReviews()) if (other.portalId === portal.portalId) await settle(other);
}

main().catch((error) => {
  console.error("PORTAL_PIN_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
