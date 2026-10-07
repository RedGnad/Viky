import "../src/load-env";
import { getAddress, type Hex } from "viem";
import { loadGift } from "../src/gift-store";
import { readMilestoneGift } from "../src/milestone-reader";
import { relayProve } from "../src/milestone-relay";
import { loadMilestoneGift, recordReading } from "../src/milestone-store";
import { isMilestoneGiftId } from "../src/milestone-protocol";
import { decideReview, ensurePortalSchema, loadPortal, loadReview, pendingReviews, pinProvider, runProviderOn, type PortalReview, type PortalSense, type ResultsFields } from "../src/portal-store";
import { ENROLMENT_FIELD, RESULTS_FIELDS } from "../src/provider-instruction";
import { escrowOf } from "../src/relayer";
import { settleHeldReview, type SettleDeps } from "../src/shown-verification";
import { tellAboutMilestone, tellAboutReview } from "../src/morning-send";
import { liveTellingDeps } from "../src/morning-send-live";
import { VerificationError } from "../src/duolingo-verification";
import { enrolledBy, gradeScaleOf, gradeShownBy, LETTER_GRADES, letterRank, type PortalExtract } from "../src/university-shown";
import type { WitnessPin } from "../src/witness-portal";

/**
 * The operator's review of a witness provider's first proof (D312). A first proof from a university read through a
 * Reclaim AI provider is checked on what is sure (the pinned witness, the provider's domain, the method) and held;
 * this command shows what its pattern read, and then either pins the provider from it and settles the gift, or
 * refuses it. The fields are named by the instruction the provider was built with (src/provider-instruction.ts), so
 * the patterns are the only thing the operator writes.
 *
 *   pnpm portal:pin
 *     lists the held proofs: the portal, the sense, the gift, the request and the fields the pattern read.
 *   PROVEN_BY=0x… pnpm portal:pin <session> --matches "<regex>" --keeps "<words>"                     (enrolment)
 *   PROVEN_BY=0x… pnpm portal:pin <session> --admitted "<regex>" --scale 20 [--year "<regex>"]         (results)
 *     `--scale` is the scale the page shows: 20, 4, 100, 20/0.5, or letters:A,B,C,D,E,F. A grade gift made on another
 *     scale before this pin is refused with its own sentence; one made on it is read.
 *     checks the fields against what was read, pins the provider (version, request, match, redaction, spec hash),
 *     relays the held proof to the milestone contract, then settles every other proof held for the same provider,
 *     refusing by its code any that the pin does not fit. `--field`, `--admitted-field`, `--grade-field` and
 *     `--year-field` name another field than the instruction's.
 *   pnpm portal:pin <session>
 *     for a proof held before its provider was pinned by another: settles it on that pin.
 *   pnpm portal:pin <session> --refuse "<note for the journal>"
 *     closes the review: the person reads that the page did not show what the gift is for, and nothing moves.
 *   PROVEN_BY=0x… pnpm portal:pin --portal <id> --sense enrolment --run <version>
 *     pins a university again, on a rule written by hand (7 Oct 2026): takes the pin off and sets the version of its
 *     Reclaim provider its sessions are opened on. The next proof is held as a first one is, and is pinned from with
 *     the command above. Refused while a proof of that provider is held: decide it first.
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
  return { session: review.sessionId, portal: review.portalId, sense: review.sense, gift: review.giftId, version: review.providerVersion, observedAt: new Date(review.observedAt * 1_000).toISOString(), read: review.reading };
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

/**
 * Tells the gift's two people how the review was decided, on the devices that asked (src/morning-send.ts): the same
 * message a reading that reaches a gift sends, or the review's own when it did not. Never stops the command.
 */
async function told(giftId: string, verdict: "reached" | "refused" | "notYet"): Promise<void> {
  const sent = await (verdict === "reached" ? tellAboutMilestone(giftId, "reached", liveTellingDeps()) : tellAboutReview(giftId, verdict, liveTellingDeps())).catch(() => 0);
  console.log(JSON.stringify({ step: "told", gift: giftId, verdict, devices: sent }));
}

/** Settles one held proof on the portal's pin, and closes its review by what happened. */
async function settle(review: PortalReview): Promise<void> {
  const portal = await loadPortal(review.portalId);
  if (!portal) throw new Error(`no portal ${review.portalId}`);
  try {
    const outcome = await settleHeldReview(deps, { review, portal });
    await decideReview(review.sessionId, "pinned", null);
    console.log(JSON.stringify({ step: "settled", session: review.sessionId, gift: review.giftId, outcome }, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
    // The answer the person was waiting for, on every device that asked to be told (the founder, 29 Sep 2026).
    if (outcome.kind === "reached") await told(review.giftId, "reached");
  } catch (error) {
    // A grade read on the pinned scale and under the target: the provider works, the grade is not there yet, and the
    // person shows it again when it is (the gift's page offers "Show it" again).
    if (error instanceof VerificationError && error.code === "NOT_THERE_YET") {
      await decideReview(review.sessionId, "pinned", "NOT_THERE_YET");
      console.log(JSON.stringify({ step: "read, not there yet", session: review.sessionId, gift: review.giftId }));
      await told(review.giftId, "notYet");
      return;
    }
    // A proof the pin does not fit, a page without the field, a gift already over: refused by its code, said to the
    // person as the review's refusal. Anything else (the network, the chain) leaves it held for the next run.
    const final = error instanceof VerificationError && !["NOT_CONFIGURED", "UNKNOWN_GIFT"].includes(error.code);
    if (final) await decideReview(review.sessionId, "refused", (error as VerificationError).code);
    console.log(JSON.stringify({ step: final ? "refused" : "still held", session: review.sessionId, gift: review.giftId, reason: error instanceof Error ? error.message : String(error) }));
    if (final) await told(review.giftId, "refused");
  }
}

async function main() {
  await ensurePortalSchema();
  const sessionId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  const version = flag("run");
  if (version !== undefined) {
    const portalId = need("portal");
    const sense = (flag("sense")?.trim() || "enrolment") as PortalSense;
    if (sense !== "enrolment" && sense !== "results") throw new Error("--sense is enrolment or results");
    const held = (await pendingReviews()).filter((review) => review.portalId === portalId && review.sense === sense);
    if (held.length > 0) throw new Error(`${held.length} proof of this provider is held (${held.map((review) => review.sessionId).join(", ")}): pin or refuse it first`);
    const before = (await loadPortal(portalId))?.[sense];
    const step = { portal: portalId, sense, runsOn: version.trim(), before: before ? { version: before.providerVersion, pinned: Boolean(before.pin), reads: before.pin ? { url: before.pin.url, method: before.pin.method, responseRedactions: before.pin.responseRedactions } : null } : null };
    if (process.env.DRY_RUN === "1") {
      console.log(JSON.stringify({ step: "would take the pin off and run on", ...step }, null, 2));
      return;
    }
    const operator = getAddress(String(process.env.PROVEN_BY?.trim()));
    if (!(await runProviderOn(portalId, sense, { version: version.trim(), operator }))) throw new Error(`${portalId} has no witness provider for ${sense}`);
    console.log(JSON.stringify({ step: "pin taken off, running on", ...step, next: "the next proof is held: pnpm portal:pin, then pnpm portal:pin <session> --matches … --keeps …" }, null, 2));
    return;
  }
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
    if (!dry) await told(review.giftId, "refused");
    return;
  }

  const portal = await loadPortal(review.portalId);
  const provider = portal?.[review.sense];
  if (!portal || !provider || provider.verification !== "witness") throw new Error(`${review.portalId} has no witness provider for ${review.sense}`);
  // Held before the pin was set by another proof: settled on the pin the provider has.
  if (provider.pin && provider.extract) {
    console.log(JSON.stringify({ step: dry ? "would settle on the pin" : "settling on the pin", ...shown(review) }, null, 2));
    if (!dry) await settle(review);
    return;
  }
  const read = review.reading as { fields?: Record<string, string>; url: string; method: string; responseMatches: string; responseRedactions: string; specHash: string };
  const fields = read.fields ?? {};
  // The fields must be read on the proof being pinned, or the pin would be born refusing its own first proof.
  let extract: PortalExtract | ResultsFields;
  if (review.sense === "enrolment") {
    const enrolment: PortalExtract = { field: flag("field")?.trim() || ENROLMENT_FIELD, matches: need("matches"), keeps: need("keeps") };
    if (!enrolledBy(enrolment, fields)) throw new Error(`the field ${enrolment.field} does not match ${enrolment.matches} on this proof: nothing pinned`);
    extract = enrolment;
  } else {
    const scale = gradeScaleOf(need("scale"));
    if (!scale) throw new Error("--scale is 20, 4, 20/0.5 or letters:A,B,C");
    // Letters are ranked in one order whatever the university (LETTER_GRADES): a letter outside it could not be compared.
    if (scale.kind === "letters" && scale.grades.some((grade) => letterRank(grade) === undefined)) throw new Error(`--scale letters must be among ${LETTER_GRADES.join(", ")}`);
    const yearMatches = flag("year")?.trim();
    const results: ResultsFields = {
      admitted: { field: flag("admitted-field")?.trim() || RESULTS_FIELDS.decision, matches: need("admitted") },
      grade: { field: flag("grade-field")?.trim() || RESULTS_FIELDS.average, scale },
      ...(yearMatches ? { year: { field: flag("year-field")?.trim() || RESULTS_FIELDS.year, matches: yearMatches } } : {}),
    };
    const asRead = { providerId: provider.providerId, providerVersion: review.providerVersion, requestHash: read.specHash, ...results };
    const grade = gradeShownBy(asRead, fields);
    if (grade.kind === "refused") throw new Error(`${grade.message} (${grade.code}): nothing pinned`);
    if (!(results.admitted.field in fields)) throw new Error(`this proof carries no field ${results.admitted.field}: nothing pinned`);
    extract = results;
  }
  const pin: WitnessPin = { providerVersion: review.providerVersion, url: read.url, method: read.method, responseMatches: read.responseMatches, responseRedactions: read.responseRedactions, specHash: read.specHash };
  const operator = getAddress(String(process.env.PROVEN_BY?.trim()));
  console.log(JSON.stringify({ step: dry ? "would pin" : "pinning", portal: portal.portalId, sense: review.sense, pin, extract }, null, 2));
  if (dry) return;
  if (!(await pinProvider(portal.portalId, review.sense, { pin, extract, operator }))) throw new Error("the provider could not be pinned");

  await settle(review);
  for (const other of await pendingReviews()) if (other.portalId === portal.portalId && other.sense === review.sense) await settle(other);
}

main().catch((error) => {
  console.error("PORTAL_PIN_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
