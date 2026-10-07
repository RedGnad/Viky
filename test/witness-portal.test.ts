process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { getHashFromProof, getIdentifierFromClaimInfo, type Proof } from "@reclaimprotocol/js-sdk";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VerificationError } from "../src/duolingo-verification";
import type { MilestoneProofMessage } from "../src/milestone-protocol";
import type { Portal, PortalReview } from "../src/portal-store";
import { awaitingPin } from "../src/portal-store";
import type { ProofSession } from "../src/proof-session-store";
import { portalProviderFor, SHOWN_CONDITIONS, UNIVERSITY_SHOWN, type ShownEntry } from "../src/shown-conditions";
import { settleHeldReview, verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";
import { UNIVERSITY_ENROLLED, universitySubject } from "../src/university-shown";
import { canonical, onAnyDomain, onDomain, pinOf, READING_METHODS, verifyWitnessProof, WitnessProofError, type WitnessPin } from "../src/witness-portal";

/**
 * A university read through a Reclaim AI provider (D312): the proof carries no enclave, so it is verified by the
 * witness's signature on the claim and by what the claim says it read. The claims here are built and signed the way
 * Reclaim's attestor signs them (`createSignDataForClaim`), by a test key standing in for the pinned witness.
 */

const WITNESS = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const STRANGER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const ACCOUNT = "0x000000000000000000000000000000000000a11c";
const CONTRACT = "0x00000000000000000000000000000000000000E5" as Hex;
const APP_ID = "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf";
const SESSION_ID = "session_witness_1";
const GIFT = "1000009";
const NOW = 1_784_000_100;
const AGENT_VERSION = "1.0.0-ai.1";

type Page = { url?: string; method?: string; matches?: unknown[]; redactions?: unknown[]; fields?: Record<string, string>; session?: string; message?: string; spec?: string };

/** One claim as Reclaim's witness signs it: the request and patterns in `parameters`, the binding and the fields in `context`. */
async function witnessProof(page: Page = {}, signer = WITNESS, timestampS = NOW - 30): Promise<Proof> {
  const parameters = JSON.stringify({
    url: page.url ?? "https://studentcenter.ucad.sn/api/me",
    method: page.method ?? "GET",
    responseMatches: page.matches ?? [{ type: "contains", value: "\"status\":\"{{status}}\"" }],
    responseRedactions: page.redactions ?? [{ jsonPath: "$.status" }],
  });
  const draft = { claimData: { provider: "http", parameters, context: "{}" } } as unknown as Proof;
  const spec = page.spec ?? String([getHashFromProof(draft)].flat()[0]).toLowerCase();
  const context = JSON.stringify({
    contextAddress: ACCOUNT,
    contextMessage: page.message ?? `${GIFT}:reach`,
    reclaimSessionId: page.session ?? SESSION_ID,
    providerHash: spec,
    extractedParameters: page.fields ?? { status: "Inscrit 2026-2027" },
  });
  const claim = { provider: "http", parameters, context, owner: ACCOUNT, timestampS, epoch: 1 };
  const identifier = getIdentifierFromClaimInfo(claim);
  const signature = await signer.signMessage({ message: [identifier, claim.owner.toLowerCase(), String(timestampS), "1"].join("\n") });
  return { identifier, claimData: { ...claim, identifier }, signatures: [signature], witnesses: [] } as unknown as Proof;
}

const OPERATOR = "0x000000000000000000000000000000000000beef";
const UCAD: Portal = {
  portalId: "ucad-sn",
  name: "UCAD, student center",
  university: "Université Cheikh Anta Diop",
  country: "SN",
  loginUrl: "https://studentcenter.ucad.sn/login",
  provenAt: new Date(0),
  provenBy: OPERATOR,
  unverified: true,
  // Built from the enrolment instruction (D312): a witness provider on the university's own domain, no pin yet.
  enrolment: { portalId: "ucad-sn", sense: "enrolment", providerId: "10560c0d-b009-412b-8e78-762d79fa7cc4", verification: "witness", domain: "ucad.sn", providerVersion: "", requestHash: "", extract: null, pin: null, addedBy: OPERATOR },
  results: null,
};

async function pinned(): Promise<Portal> {
  const reading = verifyWitnessProof(await witnessProof(), { domain: "ucad.sn", method: "GET", pin: null, providerVersion: AGENT_VERSION, witness: WITNESS.address });
  const pin = pinOf(reading, AGENT_VERSION);
  return {
    ...UCAD,
    unverified: false,
    enrolment: { ...UCAD.enrolment!, pin, providerVersion: AGENT_VERSION, requestHash: reading.specHash, extract: { field: "status", matches: "^Inscrit 2026", keeps: "whether the page says enrolled for 2026-2027" } },
  };
}

function expect(pin: WitnessPin | null, version = AGENT_VERSION) {
  return { domain: "ucad.sn", method: pin?.method ?? null, pin, providerVersion: version, witness: WITNESS.address };
}

function refusedAs(code: string) {
  return (error: unknown) => (error instanceof WitnessProofError || error instanceof VerificationError) && error.code === code;
}

test("the portal's domain is its own or a subdomain, over https, and nothing that merely ends with its letters", () => {
  assert.equal(onDomain("https://ucad.sn/", "ucad.sn"), true);
  assert.equal(onDomain("https://studentcenter.ucad.sn/api", "ucad.sn"), true);
  assert.equal(onDomain("https://evilucad.sn/", "ucad.sn"), false);
  assert.equal(onDomain("https://ucad.sn.evil.com/", "ucad.sn"), false);
  assert.equal(onDomain("http://studentcenter.ucad.sn/", "ucad.sn"), false, "a proof is of a TLS page");
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  // A provider on two of a university's own domains (the Université de Toulouse, D313).
  assert.equal(onAnyDomain("https://ent-etudiants.univ-tlse3.fr/scolarite", "utoulouse.fr,univ-tlse3.fr"), true);
  assert.equal(onAnyDomain("https://ent.utoulouse.fr/", "utoulouse.fr,univ-tlse3.fr"), true);
  assert.equal(onAnyDomain("https://univ-tlse2.fr/", "utoulouse.fr,univ-tlse3.fr"), false);
});

test("a witness proof is read only when the witness alone signed what it holds, on the portal's domain", async () => {
  const reading = verifyWitnessProof(await witnessProof(), expect(null));
  assert.equal(reading.data.extractedParameters.status, "Inscrit 2026-2027");
  assert.equal(reading.url, "https://studentcenter.ucad.sn/api/me");

  assert.throws(() => verifyWitnessProof({} as Proof, expect(null)), refusedAs("WITNESS_MALFORMED"));
  // Signed by somebody else than the pinned witness.
  assert.throws(() => verifyWitnessProof(proofSync.stranger, expect(null)), refusedAs("WITNESS_OTHER_SIGNER"));
  // What the claim holds changed after it was signed: its identifier no longer matches.
  const tampered = structuredClone(proofSync.good) as Proof;
  (tampered.claimData as { context: string }).context = tampered.claimData.context.replace("Inscrit", "Admis");
  assert.throws(() => verifyWitnessProof(tampered, expect(null)), refusedAs("WITNESS_UNSIGNED"));
  // Another site, or a method no page is read with.
  assert.throws(() => verifyWitnessProof(proofSync.otherDomain, expect(null)), refusedAs("WITNESS_OTHER_DOMAIN"));
  assert.throws(() => verifyWitnessProof(proofSync.put, expect(null)), refusedAs("WITNESS_OTHER_METHOD"));
  // A spec hash the request does not produce.
  assert.throws(() => verifyWitnessProof(proofSync.lyingSpec, expect(null)), refusedAs("WITNESS_OTHER_PATTERN"));
});

test("before the pin a page read with POST is read as one read with GET is, and the pin then fixes which", async () => {
  // Toulouse's "Mon dossier web" answers its pages to POSTs (7 Oct 2026): a server that expected GET before any pin
  // refused the first two real proofs of a university. The method is the agent's, read by the operator, then pinned.
  assert.deepEqual(READING_METHODS, ["GET", "POST"]);
  const posted = verifyWitnessProof(proofSync.post, expect(null));
  assert.equal(posted.method, "POST");
  const onPost = pinOf(posted, AGENT_VERSION);
  assert.equal(onPost.method, "POST", "the pin keeps the method the first proof read with");
  verifyWitnessProof(proofSync.post, expect(onPost));
  // The pin compares what a GET and a POST share here (address, pattern, spec), so the method is what refuses.
  const got = pinOf(verifyWitnessProof(proofSync.good, expect(null)), AGENT_VERSION);
  assert.throws(() => verifyWitnessProof(proofSync.post, expect(got)), refusedAs("WITNESS_OTHER_METHOD"));
  assert.throws(() => verifyWitnessProof(proofSync.good, expect(onPost)), refusedAs("WITNESS_OTHER_METHOD"));
});

test("once pinned, another pattern, another request or another version of the provider is refused", async () => {
  const pin = (await pinned()).enrolment!.pin!;
  verifyWitnessProof(proofSync.good, expect(pin));
  assert.throws(() => verifyWitnessProof(proofSync.otherPattern, expect(pin)), refusedAs("WITNESS_OTHER_PATTERN"));
  assert.throws(() => verifyWitnessProof(proofSync.otherPage, expect(pin)), refusedAs("WITNESS_OTHER_PATTERN"));
  assert.throws(() => verifyWitnessProof(proofSync.good, expect(pin, "1.0.0-ai.2")), refusedAs("WITNESS_OTHER_VERSION"));
});

// Built once, before the synchronous assertions above read them.
const proofSync = {} as Record<"good" | "stranger" | "otherDomain" | "post" | "put" | "lyingSpec" | "otherPattern" | "otherPage", Proof>;
test.before(async () => {
  proofSync.good = await witnessProof();
  proofSync.stranger = await witnessProof({}, STRANGER);
  proofSync.otherDomain = await witnessProof({ url: "https://studentcenter.ucad.sn.example.com/api/me" });
  proofSync.post = await witnessProof({ method: "POST" });
  proofSync.put = await witnessProof({ method: "PUT" });
  proofSync.lyingSpec = await witnessProof({ spec: `0x${"12".repeat(32)}` });
  proofSync.otherPattern = await witnessProof({ matches: [{ type: "regex", value: ".*" }] });
  proofSync.otherPage = await witnessProof({ url: "https://studentcenter.ucad.sn/api/other" });
});

let portal: Portal = UCAD;
const WITNESS_SHOWN: ShownEntry = {
  ...UNIVERSITY_SHOWN,
  providerOf: async () => portalProviderFor("university-enrollment-shown", portal),
  subjectOf: () => universitySubject(portal.portalId),
  condition: { ...UNIVERSITY_SHOWN.condition, conditionId: "test-witness-shown" },
};
(SHOWN_CONDITIONS as ShownEntry[]).push(WITNESS_SHOWN);

function session(): ProofSession {
  return { sessionId: SESSION_ID, account: ACCOUNT, giftId: GIFT, goalType: 13, conditionId: "test-witness-shown", phase: "reach", dayIndex: 0 };
}

function deps(proofs: Proof[], version = AGENT_VERSION, overrides: Partial<ShownVerificationDeps> = {}) {
  const proved: MilestoneProofMessage[] = [];
  const held: Omit<PortalReview, "status" | "reason">[] = [];
  const consumed: unknown[] = [];
  const all: ShownVerificationDeps = {
    loadSession: async () => session(),
    loadLatestEvidence: async () => null,
    consumeAndSaveVerification: async () => true,
    consumeShownSession: async (input) => {
      consumed.push(input);
      return true;
    },
    fetchStatus: async () => ({ session: { sessionId: SESSION_ID, appId: APP_ID, providerId: UCAD.enrolment!.providerId, providerVersionString: version, statusV2: "PROOF_SUBMITTED", proofs } as never }),
    verifyProofs: async () => {
      throw new Error("a witness proof never goes to the SDK's TEE verification");
    },
    signCheckIn: async () => "0x" as Hex,
    prove: async ({ message }) => {
      proved.push(message);
      return { hash: `0x${"ab".repeat(32)}` as Hex, happened: "reached" };
    },
    record: async () => {},
    milestoneOf: async () => ({ contract: CONTRACT, recipient: ACCOUNT as Hex, opened: true, settled: false, target: BigInt(UNIVERSITY_ENROLLED) }),
    milestoneRecordOf: async () => ({ giftId: GIFT, conditionId: "university-enrollment-shown", mode: "shown", standingAtOffer: 0, standingReadAt: new Date(0), portal: "ucad-sn" }),
    holdForReview: async (review) => {
      if (held.some((one) => one.sessionId === review.sessionId)) return false;
      held.push(review);
      return true;
    },
    appId: APP_ID,
    escrowAddress: CONTRACT,
    now: () => NOW,
    witnessAddress: WITNESS.address,
    ...overrides,
  };
  return { deps: all, proved, held, consumed };
}

test("a first proof from a portal with no pin is checked on what is sure, held, and never relayed", async () => {
  portal = UCAD;
  assert.equal(awaitingPin(UCAD.enrolment!), true);
  const run = deps([proofSync.good]);
  const outcome = await verifyShownSession(run.deps, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind, "held");
  assert.equal(outcome.kind === "held" ? outcome.message : "", "First proof from this university: checked within an hour.");
  assert.equal(run.proved.length, 0, "nothing signed, nothing relayed");
  assert.equal(run.held.length, 1);
  assert.equal(run.held[0].providerVersion, AGENT_VERSION);
  assert.deepEqual((run.held[0].reading as { fields: Record<string, string> }).fields, { status: "Inscrit 2026-2027" }, "the operator reads what the pattern read");
  assert.equal(run.consumed.length, 1, "the session is spent, so the proof cannot be shown twice");
  // The same session again: held once.
  await assert.rejects(verifyShownSession(run.deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("ALREADY_RECORDED"));
});

test("before the pin, a proof from another site, another signer, another account or an old one is refused, not held", async () => {
  portal = UCAD;
  const other = async (proof: Proof) => deps([proof]).deps;
  await assert.rejects(verifyShownSession(await other(proofSync.otherDomain), { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_DOMAIN"));
  await assert.rejects(verifyShownSession(await other(proofSync.stranger), { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_SIGNER"));
  await assert.rejects(verifyShownSession(await other(await witnessProof({ message: "1000010:reach" })), { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WRONG_GIFT_PHASE"));
  await assert.rejects(verifyShownSession(await other(await witnessProof({}, WITNESS, NOW - 3_600)), { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("PROOF_TOO_OLD"));
  // Old is older than a session lives. A proof made a quarter of an hour ago, in a session still open, is held: the
  // person took their time coming back, and the ten minutes that refused it here were the daily lesson's.
  const late = deps([await witnessProof({}, WITNESS, NOW - 15 * 60)]);
  assert.equal((await verifyShownSession(late.deps, { sessionId: SESSION_ID, account: ACCOUNT })).kind, "held");
  // Read with POST: held too, with the method the operator reads before pinning.
  const posted = deps([proofSync.post]);
  assert.equal((await verifyShownSession(posted.deps, { sessionId: SESSION_ID, account: ACCOUNT })).kind, "held");
  assert.equal((posted.held[0].reading as { method: string }).method, "POST");
  await assert.rejects(verifyShownSession(await other(proofSync.put), { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_METHOD"));
  // A version that is no version at all is refused; the provider's base ("1.0.0", what a session reports when it opens)
  // is held like the agent's, so a student's first proof is never lost to the name of a version.
  await assert.rejects(verifyShownSession(deps([proofSync.good], "latest").deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("PROOF_REJECTED"));
  const onBase = deps([proofSync.good], "1.0.0");
  assert.equal((await verifyShownSession(onBase.deps, { sessionId: SESSION_ID, account: ACCOUNT })).kind, "held");
  assert.equal(onBase.held[0].providerVersion, "1.0.0");
  // Without the witness key a test stands in for, the pinned witness is required, and the test key is not it.
  await assert.rejects(verifyShownSession(deps([proofSync.good], AGENT_VERSION, { witnessAddress: undefined }).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_SIGNER"));
});

test("after the pin, a proof is verified on the pin alone, read by its field, and relayed", async () => {
  portal = await pinned();
  const run = deps([proofSync.good]);
  const outcome = await verifyShownSession(run.deps, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(outcome.kind, "reached");
  assert.equal(run.held.length, 0);
  assert.equal(run.proved.length, 1);
  assert.equal(run.proved[0].metricValue, BigInt(UNIVERSITY_ENROLLED));
  assert.equal(run.proved[0].identityHash, universitySubject("ucad-sn"));
  await assert.rejects(verifyShownSession(deps([proofSync.otherPattern]).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_PATTERN"));
  await assert.rejects(verifyShownSession(deps([proofSync.good], "1.0.0-ai.2").deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("PROOF_REJECTED"));
  // The field says otherwise: refused by its name, nothing relayed.
  const notEnrolled = deps([await witnessProof({ fields: { status: "Ancien étudiant" } })]);
  await assert.rejects(verifyShownSession(notEnrolled.deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("NOT_ENROLLED"));
  assert.equal(notEnrolled.proved.length, 0);
});

test("a held proof is settled once its portal is pinned, and only on that pin", async () => {
  const review: PortalReview = {
    sessionId: SESSION_ID,
    portalId: "ucad-sn",
    sense: "enrolment",
    giftId: GIFT,
    account: ACCOUNT,
    providerVersion: AGENT_VERSION,
    reading: {},
    proofs: JSON.parse(JSON.stringify([proofSync.good])),
    observedAt: NOW - 30,
    status: "pending",
    reason: null,
  };
  // A day later: its freshness was checked when it was held.
  const later = deps([], AGENT_VERSION, { now: () => NOW + 86_400 });
  await assert.rejects(settleHeldReview(later.deps, { review, portal: UCAD }), refusedAs("NOT_CONFIGURED"));
  const outcome = await settleHeldReview(later.deps, { review, portal: await pinned() });
  assert.equal(outcome.kind, "reached");
  assert.equal(later.proved.length, 1);
  assert.equal(later.proved[0].observedAt, BigInt(NOW - 30), "the day it was shown");
  assert.equal(later.consumed.length, 0, "the session was spent when the proof was held");
  // Another student's proof held meanwhile, read with another pattern: refused on the pin.
  const other = { ...review, proofs: JSON.parse(JSON.stringify([proofSync.otherPattern])) };
  await assert.rejects(settleHeldReview(later.deps, { review: other, portal: await pinned() }), refusedAs("WITNESS_OTHER_PATTERN"));
  await assert.rejects(settleHeldReview(later.deps, { review: { ...review, status: "refused" }, portal: await pinned() }), refusedAs("ALREADY_RECORDED"));
  // A gift made on another portal is not settled by this one.
  const elsewhere = deps([], AGENT_VERSION, { milestoneRecordOf: async () => ({ giftId: GIFT, conditionId: "university-enrollment-shown", mode: "shown", standingAtOffer: 0, standingReadAt: new Date(0), portal: "ugb-sn" }) });
  await assert.rejects(settleHeldReview(elsewhere.deps, { review, portal: await pinned() }), refusedAs("UNKNOWN_GIFT"));
});
