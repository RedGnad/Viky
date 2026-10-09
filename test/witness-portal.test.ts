process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getHashFromProof, getIdentifierFromClaimInfo, hashProofClaimParams, type Proof } from "@reclaimprotocol/js-sdk";
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
import { matchesAsTheyCount, redactionsAsTheyCount, canonical, onAnyDomain, onDomain, pinFromPublished, pinInWords, pinOf, PublishedRuleError, READING_METHODS, sameRule, verifyWitnessProof, WitnessProofError, type PublishedRequest, type WitnessPin } from "../src/witness-portal";

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

type Page = { url?: string; method?: string; matches?: unknown[]; redactions?: unknown[]; fields?: Record<string, string>; session?: string; message?: string; spec?: string; body?: string };

/** One claim as Reclaim's witness signs it: the request and patterns in `parameters`, the binding and the fields in `context`. */
async function witnessProof(page: Page = {}, signer = WITNESS, timestampS = NOW - 30): Promise<Proof> {
  const parameters = JSON.stringify({
    url: page.url ?? "https://studentcenter.ucad.sn/api/me",
    method: page.method ?? "GET",
    // The body a version sniffs is signed as its template, the values it fills in left out.
    ...(page.body === undefined ? {} : { body: page.body }),
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

test("the judges' page prints what a pinned provider reads from the pin itself, the rule in force and no other", () => {
  // The first university, as it was pinned on 7 Oct 2026 from its first paid proof.
  const toulouse: WitnessPin = {
    providerVersion: "1.0.0-ai.3",
    url: "https://mondossierweb.univ-tlse3.fr/UIDL/?v-uiId=0",
    method: "POST",
    responseMatches: '[{"type":"contains","value":"_{{academicYear}}_"}]',
    responseRedactions: '[{"regex":"_(?<academicYear>2026-2027)_"}]',
    specHash: "0xc4a4c2ee74a4a71a2aca7c3a6a1a89edc5f9322c1dfea358efe0e53733a8bc3a",
  };
  assert.equal(
    pinInWords(toulouse, { field: "academicYear", matches: "^2026-2027$" }),
    'version 1.0.0-ai.3 reads POST mondossierweb.univ-tlse3.fr/UIDL/ and keeps of the answer what matches "_(?<academicYear>2026-2027)_"; Viky counts it when academicYear matches "^2026-2027$"',
  );
  // The query of the address is not printed, and a results provider's fields are said elsewhere.
  assert.doesNotMatch(pinInWords(toulouse, null), /v-uiId|Viky counts/);
  // A pattern is printed as it is, cut when it is long, and a list that does not parse prints no pattern at all.
  assert.match(pinInWords({ ...toulouse, responseRedactions: JSON.stringify([{ jsonPath: "$.status" }, { regex: "x".repeat(400) }]) }, null), /"x{200}…", "\$\.status"$/);
  assert.equal(pinInWords({ ...toulouse, responseRedactions: "not json" }, null), "version 1.0.0-ai.3 reads POST mondossierweb.univ-tlse3.fr/UIDL/");
  assert.match(readFileSync("app/judges/page.tsx", "utf8"), /line\.pin \? `pinned: \$\{pinInWords\(line\.pin, line\.sense === "enrolment" && line\.extract \? line\.extract : null\)\}` : "first proof awaited"/);
});

/** A version as Reclaim publishes it: the rule of the test claims, with the defaults a published request carries. */
const BODY_TEMPLATE = '{"csrfToken":"{{BODY_PARAM_SECRET_1}}","rpc":[["{{BODY_PARAM_1}}","click"]],"syncId":{{BODY_PARAM_2}}}';
const PUBLISHED: PublishedRequest = {
  url: "https://studentcenter.ucad.sn/api/me",
  urlType: "CONSTANT",
  method: "POST",
  responseMatches: [{ value: '"status":"{{status}}"', type: "contains", invert: false, isOptional: false }],
  responseRedactions: [{ jsonPath: "$.status", xPath: null, regex: null, hash: null, order: 0 }],
  bodySniff: { enabled: true, template: BODY_TEMPLATE },
};
const hashOf = (request: PublishedRequest & { body: string }) => hashProofClaimParams(request as never) as string | string[];

test("a pin worked out from a version's published request is the pin a real claim under it gives", async () => {
  // Measured on the first university's real proofs (8 Oct 2026): versions ai.1 and ai.3, which sniff the body, give
  // from their published request the very pin their claim gives, and production's pin was that of ai.3.
  const ahead = pinFromPublished(PUBLISHED, "1.0.1", hashOf);
  assert.equal(ahead.ahead, true, "marked as made ahead of any proof");
  assert.equal(ahead.fixed, true, "and as a fixed rule: its sessions ask for no agent");
  assert.equal(ahead.method, "POST");
  assert.equal(ahead.responseMatches, '[{"type":"contains","value":"\\"status\\":\\"{{status}}\\""}]', "the published defaults are dropped, as a claim drops them");
  assert.equal(ahead.responseRedactions, '[{"jsonPath":"$.status"}]');
  const claim = await witnessProof({ method: "POST", body: BODY_TEMPLATE });
  const real = pinOf(verifyWitnessProof(claim, { domain: "ucad.sn", method: null, pin: null, providerVersion: "1.0.1", witness: WITNESS.address }), "1.0.1");
  assert.equal(sameRule(ahead, real), true);
  assert.equal(real.ahead, undefined, "a pin a proof gave carries no mark");
  assert.equal(real.fixed, undefined, "and its sessions go on asking for the agent, as when that proof was made");
  // And the claim passes under the pin made ahead, checked as the server checks any pinned proof.
  verifyWitnessProof(claim, { domain: "ucad.sn", method: ahead.method, pin: ahead, providerVersion: "1.0.1", witness: WITNESS.address });
  // Another rule is another pin.
  assert.equal(sameRule(ahead, pinFromPublished({ ...PUBLISHED, responseRedactions: [{ regex: "x" }] }, "1.0.1", hashOf)), false);
  assert.equal(sameRule(ahead, { ...real, providerVersion: "1.0.2" }), false);

  // A version that sniffs no body signs the body each person sends, session token included: a new hash at every
  // proof (the first university's ai.2). It can never be pinned, and is refused by name.
  assert.throws(() => pinFromPublished({ ...PUBLISHED, bodySniff: { enabled: false, template: "" } }, "1.0.1", hashOf), (error: unknown) => error instanceof PublishedRuleError && /sniffs no body/.test(error.message));
  // An address that is a pattern, and a request with several hashes: neither is one rule.
  assert.throws(() => pinFromPublished({ ...PUBLISHED, urlType: "REGEX" }, "1.0.1", hashOf), (error: unknown) => error instanceof PublishedRuleError && /pattern/.test(error.message));
  assert.throws(() => pinFromPublished(PUBLISHED, "1.0.1", () => ["0x" + "11".repeat(32), "0x" + "22".repeat(32)]), (error: unknown) => error instanceof PublishedRuleError && /not one hash/.test(error.message));
  // Said on the judges' page for what it is.
  assert.match(pinInWords(ahead, { field: "status", matches: "^Inscrit 2026" }), /^version 1\.0\.1, no proof shown on it yet, reads POST studentcenter\.ucad\.sn\/api\/me /);
});

test("a claim that carries the editor's defaults beside its rule fits the pin of that rule; an inversion that is set does not", async () => {
  // A version saved by hand in Reclaim's editor publishes, and its claims may carry, the editor's defaults beside the
  // rule: "invert": false, "description": null, "order": null, "isOptional": false on a match, null paths on a
  // redaction. The hash of the request ignores them, so the same rule has the same hash with and without them.
  const ahead = pinFromPublished(PUBLISHED, "4.0.0", hashOf);
  const withDefaults = await witnessProof({
    method: "POST",
    body: BODY_TEMPLATE,
    matches: [{ value: '"status":"{{status}}"', type: "contains", invert: false, description: null, order: null, isOptional: false }],
    redactions: [{ xPath: null, jsonPath: "$.status", regex: null, hash: null, order: 0 }],
  });
  const bare = await witnessProof({ method: "POST", body: BODY_TEMPLATE });
  const under = (pin: WitnessPin) => ({ domain: "ucad.sn", method: pin.method, pin, providerVersion: "4.0.0", witness: WITNESS.address });
  const read = verifyWitnessProof(withDefaults, under(ahead));
  // Compared as written it was another pattern, and a proof of the pinned rule would have been held (9 Oct 2026).
  assert.equal(read.specHash, ahead.specHash, "the same request, by its hash");
  assert.equal(read.responseMatches, ahead.responseMatches);
  assert.equal(read.responseRedactions, ahead.responseRedactions);
  assert.equal(read.responseMatches, verifyWitnessProof(bare, under(ahead)).responseMatches, "with the defaults or without, one rule");
  // The pin such a claim gives is the same pin, so a university pinned from it holds the bare claims too.
  assert.equal(sameRule(pinOf(read, "4.0.0"), ahead), true);
  assert.equal(matchesAsTheyCount([{ value: "x", type: "contains", invert: false }]), '[{"type":"contains","value":"x"}]');
  assert.equal(matchesAsTheyCount([{ value: "x" }]), '[{"type":"contains","value":"x"}]', "a match with no type is a contains, as the hash takes it");
  assert.equal(redactionsAsTheyCount([{ xPath: "", jsonPath: null, regex: "y", hash: null, order: 3 }]), '[{"regex":"y"}]');
  assert.equal(matchesAsTheyCount(undefined), "[]");
  assert.equal(redactionsAsTheyCount("not a list"), "[]");

  // An inversion that is set turns the rule round: it is kept, it changes the hash, and the pin refuses it.
  assert.equal(matchesAsTheyCount([{ value: "x", type: "contains", invert: true }]), '[{"invert":true,"type":"contains","value":"x"}]');
  const inverted = await witnessProof({ method: "POST", body: BODY_TEMPLATE, matches: [{ value: '"status":"{{status}}"', type: "contains", invert: true }] });
  assert.notEqual(verifyWitnessProof(inverted, { domain: "ucad.sn", method: null, pin: null, providerVersion: "4.0.0", witness: WITNESS.address }).specHash, ahead.specHash);
  assert.throws(() => verifyWitnessProof(inverted, under(ahead)), refusedAs("WITNESS_OTHER_PATTERN"));
  // And a pin worked out from a published rule that inverts says so.
  assert.match(pinFromPublished({ ...PUBLISHED, responseMatches: [{ value: "x", type: "contains", invert: true }] }, "4.0.0", hashOf).responseMatches, /"invert":true/);
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

test("a pin made ahead of any proof is believed by the first proof that fits it, and holds one that does not", async () => {
  // The first pass on a rule written by hand is paid with no review when everything is as described, and is never
  // lost when something is not (8 Oct 2026): a description of a rule is not a proof of it.
  const real = (await pinned()).enrolment!;
  const madeAhead: Portal = { ...UCAD, unverified: false, enrolment: { ...real, pin: { ...real.pin!, ahead: true } } };
  portal = madeAhead;
  const confirmed: string[] = [];
  const confirm: Partial<ShownVerificationDeps> = { confirmPin: async (portalId, sense) => (confirmed.push(`${portalId}:${sense}`), true) };

  // It fits: paid at once, nothing held, and the mark comes off.
  const fits = deps([proofSync.good], AGENT_VERSION, confirm);
  const paid = await verifyShownSession(fits.deps, { sessionId: SESSION_ID, account: ACCOUNT });
  assert.equal(paid.kind, "reached");
  assert.equal(fits.proved.length, 1);
  assert.equal(fits.held.length, 0, "no review");
  assert.deepEqual(confirmed, ["ucad-sn:enrolment"]);

  // It does not: another rule, another version, or a field that does not say it. Held as a first proof is, nothing
  // paid, the mark left where it is. Under a pin a proof gave, each of these is a refusal.
  const unfit: Array<[string, Proof[], string]> = [
    ["read with another rule", [proofSync.otherPattern], AGENT_VERSION],
    ["made on another version", [proofSync.good], "1.0.0-ai.2"],
    ["a field that does not say enrolled", [await witnessProof({ fields: { status: "Ancien étudiant" } })], AGENT_VERSION],
  ];
  for (const [what, proofs, version] of unfit) {
    const run = deps(proofs, version, confirm);
    const outcome = await verifyShownSession(run.deps, { sessionId: SESSION_ID, account: ACCOUNT });
    assert.equal(outcome.kind, "held", what);
    assert.equal(run.proved.length, 0, what);
    assert.equal(run.held.length, 1, what);
    assert.equal(run.held[0].providerVersion, version, "the operator reads the version the proof was really made on");
  }
  assert.deepEqual(confirmed, ["ucad-sn:enrolment"], "a proof that does not fit confirms nothing");

  // What no rule excuses is refused as ever, held by nobody.
  await assert.rejects(verifyShownSession(deps([proofSync.stranger], AGENT_VERSION, confirm).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_SIGNER"));
  await assert.rejects(verifyShownSession(deps([proofSync.otherDomain], AGENT_VERSION, confirm).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("WITNESS_OTHER_DOMAIN"));
  await assert.rejects(verifyShownSession(deps([await witnessProof({}, WITNESS, NOW - 3_600)], AGENT_VERSION, confirm).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("PROOF_TOO_OLD"));
  await assert.rejects(verifyShownSession(deps([proofSync.good], "latest", confirm).deps, { sessionId: SESSION_ID, account: ACCOUNT }), refusedAs("PROOF_REJECTED"));

  // A proof held under a pin made ahead did not fit it: it is not settled on it, the provider is pinned from it.
  const review: PortalReview = { sessionId: SESSION_ID, portalId: "ucad-sn", sense: "enrolment", giftId: GIFT, account: ACCOUNT, providerVersion: AGENT_VERSION, reading: {}, proofs: JSON.parse(JSON.stringify([proofSync.otherPattern])), observedAt: NOW - 30, status: "pending", reason: null };
  await assert.rejects(settleHeldReview(deps([]).deps, { review, portal: madeAhead }), refusedAs("NOT_CONFIGURED"));
  portal = UCAD;
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
