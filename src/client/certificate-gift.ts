import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } from "../ausd-authorization";
import { NO_CONTACT_HASH } from "../contact-hash";
import type { CertificateCondition } from "../milestone-conditions";
import { milestoneFundingNonce, SHAPE_HAVE_OR_NOT, type MilestoneParams } from "../milestone-protocol";
import { getJson, postJson } from "./api";
import { randomSalt, type CreatedGift } from "./gift";
import { milestoneAddressFromEnv } from "./milestone";

/**
 * Browser-side steps of a gift on a supervised result (U3, C3).
 *
 * What the funder signs is the person and the thing, hashed, plus the score and the date. There is no reading before
 * the gift, because no page says "not yet obtained": the page only exists once the test has been sat (D47).
 */

export type CertificateGiftRequest = Readonly<{
  conditionId: string;
  /** The name the funder typed, which the certificate must carry. Hashed into the terms; sent so the server rebuilds it. */
  personName: string;
  /** The course, where the condition asks for one: hashed into the terms with the name, and sent for the same reason. */
  course?: string;
  target: number;
  durationDays: number;
  amount: string;
  refundTo: string;
  salt: Hex;
  recipientName?: string;
  funderName?: string;
  authorization: { validAfter: string; validBefore: string; nonce: Hex; v: number; r: Hex; s: Hex };
}>;

/** One passkey signature: the authorization whose nonce is the hash of these exact terms, the subject included. */
export async function prepareCertificateGift(input: {
  account: LocalAccount;
  certificate: CertificateCondition;
  personName: string;
  target: number;
  durationDays: number;
  amount: bigint;
  recipientName?: string;
  funderName?: string;
  /** The course a certificate gift is for, where the condition asks for one (C3). */
  course?: string;
}): Promise<CertificateGiftRequest> {
  const contract = milestoneAddressFromEnv();
  const funder = getAddress(input.account.address);
  const params: MilestoneParams = {
    funder,
    refundTo: funder,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: input.certificate.goalType,
    shape: SHAPE_HAVE_OR_NOT,
    // A grade is typed on its scale and signed in hundredths; the route rebuilds the same integer (D174).
    target: BigInt(input.certificate.targetUnits ? input.certificate.targetUnits(input.target) : input.target),
    // Nothing to start from: the ceiling is zero and the contract refuses anything else for this shape.
    maximumStart: 0n,
    subject: input.certificate.subject({ name: input.personName, course: input.course }),
    durationDays: input.durationDays,
    amount: input.amount,
    salt: randomSalt(),
  };
  const message = receiveAuthorizationMessage({ funder, escrow: contract, amount: input.amount, nonce: milestoneFundingNonce(params) });
  const signature = await input.account.signTypedData(receiveAuthorizationTypedData(message));
  const authorization = toContractAuthorization(message, signature);
  return {
    conditionId: input.certificate.condition.id,
    personName: input.personName,
    course: input.course,
    target: input.target,
    durationDays: input.durationDays,
    amount: input.amount.toString(),
    refundTo: funder,
    salt: params.salt,
    recipientName: input.recipientName,
    funderName: input.funderName,
    authorization: {
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
      v: authorization.v,
      r: authorization.r,
      s: authorization.s,
    },
  };
}

export function submitCertificateGift(request: CertificateGiftRequest): Promise<CreatedGift> {
  return postJson<CreatedGift>("/api/gift/certificate/create", request);
}

/** What a certificate a person pasted says, read plainly before anything is proved. */
export type ReadCertificate = Readonly<{ alias: string; score: number; testDay: number; name: string; subject: Hex }>;

export function readCertificate(path: string, link: string): Promise<ReadCertificate> {
  return postJson<ReadCertificate>(path, { link });
}

export type CertificateProofOutcome =
  | { kind: "reached"; giftId: string; score: number; testDay: number; hash: string }
  | { kind: "refused"; giftId: string; code: string; message: string; score?: number }
  | { kind: "already"; giftId: string; reason: string };

/** Proves the gift with the certificate the recipient pasted. The only call on this page that moves money. */
export function proveCertificateGift(giftId: string, link: string): Promise<CertificateProofOutcome> {
  return postJson<CertificateProofOutcome>(`/api/gift/${giftId}/certificate`, { link });
}

/** Whether this browser may offer the conditions that are wired and not live yet. */
export function loadOffered(): Promise<{ ids: string[]; preview: string[] }> {
  return getJson("/api/conditions");
}

/** One line of a source's own search, as the sheet lists it: what to press, and what the terms then carry. */
export type CertificationFound = Readonly<{ pair: string; title: string; issuer: string; path: string }>;

/**
 * The certifications a source knows by some words, through Viky's own route (the register names it): the funder
 * types, reads each answer with who awards it, and chooses. Nothing is kept from the answer but the one chosen.
 */
export async function searchCertifications(path: string, words: string): Promise<readonly CertificationFound[]> {
  const answer = await getJson<{ results: readonly CertificationFound[] }>(`${path}?q=${encodeURIComponent(words.trim())}`);
  return answer.results;
}
