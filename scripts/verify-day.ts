import { readFileSync } from "node:fs";
import { portalByRequestHash } from "../src/portal-store";
import { getIdentifierFromClaimInfo, recoverSignersOfSignedClaim, type Proof } from "@reclaimprotocol/js-sdk";
import { createPublicClient, hexToBytes, http, parseEventLogs, type Abi, type Hex } from "viem";
import { claimFingerprint } from "../src/duolingo-public";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { isMilestoneGiftId } from "../src/milestone-protocol";
import { PINNED_RECLAIM_WITNESS } from "../src/reclaim-proof-set";
import { dateOfDay } from "../src/day-record";

/**
 * Re-verify one credited day of a gift, or one reading of a milestone gift, from outside Viky, in one command.
 *
 * It needs no account, no key and no secret: a proof, a gift, a day, and a Monad RPC. It answers four questions, in
 * this order, and stops at the first one it cannot answer:
 * 1. Is the proof internally consistent? The claim's identifier is recomputed from the signed claim data.
 * 2. Did Reclaim's attestor sign it? The signer is recovered from the signature and compared to the pinned attestor.
 * 3. Is the published fingerprint this claim's? It is recomputed as keccak("viky:zkfetch:" + identifier).
 * 4. Did the chain accept exactly this claim, once? The gift's contract is asked whether that fingerprint is used,
 *    and the settling transaction is read back to see it credited that gift.
 *
 * What a pass proves: Duolingo's own servers answered that, and Viky's contract credited that day against that one
 * answer, which cannot be replayed. What it does not prove: that the account belongs to the person the gift is for,
 * or that a human rather than a script did the lesson. The account is proved once, separately, by a code in the
 * display name or by the funder naming it; the proof is about the account, never about the hands on the phone.
 *
 * Usage:
 *   pnpm verify:day                                   the example Viky publishes, from viky.cash
 *   pnpm verify:day --site https://viky.cash          the same, against another deployment
 *   pnpm verify:day --file proof.json --gift 42 --day 3 --fingerprint 0x...
 *                                                     a proof the funder or the recipient downloaded themselves
 *   pnpm verify:day --file reading.json --gift 1000001 --reading 4
 *                                                     the same for a milestone gift, which settles on a reading
 */

type Answer = { question: string; verdict: "yes" | "no"; detail: string };

const RPC = process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

type Subject = Readonly<{ giftId: string; day?: number; readingId?: number; txHash?: string; fingerprint?: string; escrow?: string; proof: Proof }>;

/** A milestone gift settles on its own contract, with its own events, and its gift numbers say which one it is. */
const milestone = (giftId: string) => isMilestoneGiftId(giftId);
const abiFor = (giftId: string) => (milestone(giftId) ? (milestoneGiftAbi as unknown as Abi) : (giftEscrowAbi as unknown as Abi));
const contractFor = (giftId: string) =>
  (milestone(giftId) ? process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS : process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS)?.trim();
const what = (subject: Subject) =>
  subject.readingId === undefined ? `the day of ${dateOfDay(Number(subject.day))} (day ${subject.day})` : `reading ${subject.readingId}`;

async function fromSite(site: string): Promise<Subject> {
  const answer = await fetch(new URL("/api/judges/example", site));
  if (!answer.ok) throw new Error(`${site} answered ${answer.status} for its example`);
  const body = (await answer.json()) as { example: (Subject & { proof: unknown }) | null };
  if (!body.example) {
    throw new Error(
      `${site} publishes no example yet: no credited day there still has its proof. Ask for one, or verify your own with --file.`,
    );
  }
  const example = body.example;
  return { ...example, proof: (Array.isArray(example.proof) ? example.proof[0] : example.proof) as Proof };
}

function fromFile(file: string): Subject {
  const giftId = argument("gift");
  const asked = argument("reading");
  const day = Number(argument("day"));
  const readingId = Number(asked);
  if (!giftId) throw new Error("--file needs --gift as well");
  if (asked === undefined && !Number.isInteger(day)) throw new Error("--file needs --day, or --reading for a milestone gift");
  if (asked !== undefined && !Number.isInteger(readingId)) throw new Error("--reading takes the number the gift's page printed");
  const content = JSON.parse(readFileSync(file, "utf8")) as { proof?: unknown; fingerprint?: string; escrow?: string; giftId?: string; day?: number };
  // The route hands back { giftId, day or readingId, fingerprint, proof }; a bare proof file works too.
  const raw = content.proof ?? content;
  return {
    giftId,
    ...(asked === undefined ? { day } : { readingId }),
    fingerprint: argument("fingerprint") ?? content.fingerprint,
    escrow: argument("contract") ?? content.escrow,
    proof: (Array.isArray(raw) ? raw[0] : raw) as Proof,
  };
}

async function main() {
  const file = argument("file");
  const site = argument("site") ?? "https://viky.cash";
  const subject = file ? fromFile(file) : await fromSite(site);
  const answers: Answer[] = [];
  const claim = subject.proof.claimData as unknown as Parameters<typeof getIdentifierFromClaimInfo>[0] & { identifier: string };
  // A proof shown from a student portal names its portal by the request it made (D165): the row it matches is said.
  try {
    const context = JSON.parse(String(claim.context ?? "{}")) as { providerHash?: unknown };
    const portal = typeof context.providerHash === "string" ? await portalByRequestHash(context.providerHash) : null;
    if (portal) console.log(`portal: ${portal.portalId}, ${portal.university} (${portal.country}), provider ${portal.providerId}@${portal.providerVersion}, proved ${portal.provenAt.toISOString().slice(0, 10)}`);
  } catch {
    // A context that is not JSON is refused below, where the claim is checked.
  }

  const recomputed = getIdentifierFromClaimInfo(claim);
  const sameIdentifier = recomputed.toLowerCase() === String(claim.identifier).toLowerCase();
  answers.push({
    question: "Is the proof internally consistent?",
    verdict: sameIdentifier ? "yes" : "no",
    detail: sameIdentifier ? `the signed claim hashes to ${recomputed}` : `the signed claim hashes to ${recomputed}, not to ${claim.identifier}`,
  });

  // The SDK wants the signatures as bytes; a proof carries them as hex strings, which is how they travel.
  const signatures = subject.proof.signatures.map((signature) => hexToBytes(signature as Hex));
  const signers = recoverSignersOfSignedClaim({ claim: subject.proof.claimData, signatures } as unknown as Parameters<typeof recoverSignersOfSignedClaim>[0]).map(
    (signer: string) => signer.toLowerCase(),
  );
  const attestorSigned = signers.includes(PINNED_RECLAIM_WITNESS.toLowerCase());
  answers.push({
    question: "Did Reclaim's attestor sign it?",
    verdict: attestorSigned ? "yes" : "no",
    detail: attestorSigned ? `signed by ${PINNED_RECLAIM_WITNESS}` : `signed by ${signers.join(", ") || "nobody"}, not by ${PINNED_RECLAIM_WITNESS}`,
  });

  const fingerprint = claimFingerprint(String(claim.identifier));
  const published = subject.fingerprint?.toLowerCase();
  const sameFingerprint = published === undefined || published === fingerprint.toLowerCase();
  answers.push({
    question: "Is the published fingerprint this claim's?",
    verdict: sameFingerprint ? "yes" : "no",
    detail: published === undefined ? `${fingerprint}, with nothing published to compare it to` : sameFingerprint ? `${fingerprint}` : `${fingerprint}, but ${published} was published`,
  });

  // The contract to ask, in the order that needs the least: what the command names, what the proof carries, what
  // the environment of a Viky checkout already has.
  const contract = argument("contract")?.trim() || subject.escrow?.trim() || contractFor(subject.giftId);
  if (!contract) throw new Error("no contract to ask: pass --contract, or set the contract address in the environment");
  const abi = abiFor(subject.giftId);
  const chain = createPublicClient({ transport: http(RPC) });
  const used = (await chain.readContract({
    address: contract as Hex,
    abi,
    functionName: "usedNullifiers",
    args: [fingerprint],
  })) as boolean;
  answers.push({
    question: "Did the chain accept exactly this claim, once?",
    verdict: used ? "yes" : "no",
    detail: used ? `${contract} has that fingerprint recorded, so it can never be used again` : `${contract} has no such fingerprint`,
  });

  if (subject.txHash) {
    const receipt = await chain.getTransactionReceipt({ hash: subject.txHash as Hex });
    // A day is credited by `CheckInAccepted`, which names the first and last day it counted. A milestone reading
    // either records the start or reaches the target, and the contract publishes one event for each.
    const names = milestone(subject.giftId) ? ["StartRecorded", "MilestoneReached"] : ["CheckInAccepted"];
    const events = parseEventLogs({ abi, logs: receipt.logs, eventName: names, strict: false });
    const settled = events.some((event) => {
      const args = (event as unknown as { args: Record<string, unknown> }).args;
      if (String(args.giftId) !== subject.giftId) return false;
      if (subject.day === undefined) return true;
      return Number(args.fromDay) <= subject.day && subject.day <= Number(args.toDay);
    });
    answers.push({
      question: `Did that transaction settle ${what(subject)} of gift ${subject.giftId}?`,
      verdict: settled ? "yes" : "no",
      detail: settled ? `${subject.txHash}, block ${receipt.blockNumber}` : `${subject.txHash} settles no such thing`,
    });
  }

  console.log(`Gift ${subject.giftId}, ${what(subject)}, on ${RPC}`);
  for (const answer of answers) console.log(`  ${answer.verdict === "yes" ? "yes" : "NO "}  ${answer.question}  ${answer.detail}`);
  const allYes = answers.every((answer) => answer.verdict === "yes");
  console.log(
    allYes
      ? `\nEvery answer is yes: the source's own servers answered this, and the contract settled ${what(subject)} against this one claim.\nIt does not prove whose account it is, nor that a human did the work: the account is proved once, by a code in its name or by the funder naming it.`
      : "\nAt least one answer is no. Nothing above is taken on trust: read the detail beside it.",
  );
  if (!allYes) process.exitCode = 1;
}

main().catch((error) => {
  console.error("VERIFY_DAY_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
