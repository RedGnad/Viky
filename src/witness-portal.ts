import { getHashFromProof, getIdentifierFromClaimInfo, recoverSignersOfSignedClaim, type Proof } from "@reclaimprotocol/js-sdk";
import { hexToBytes, type Hex } from "viem";
import { PINNED_RECLAIM_WITNESS } from "./reclaim-proof-set";
import type { ReclaimTrustedData } from "./reclaim-types";

/**
 * A portal read through a Reclaim AI provider (D312, the founder's decision of 28 Sep 2026): no enclave, the proof
 * verified the way a zkFetch reading is, by the pinned witness's signature on the claim and by what the claim says it
 * read. An AI provider's configuration names no request; Reclaim's agent writes one at the first real run and keeps it
 * as a version of its own ("1.0.0-ai.1"): the URL, the method, the response match and the redaction. That version and
 * what it holds are the portal's pin, set by the operator after reading the first proof (`pnpm portal:pin`).
 *
 * Without a pin, a proof is checked on what is already sure (the witness, the site's domain, a method a page is read
 * with) and held for review, never paid on its own. With a pin, a proof whose request, method, match, redaction or
 * version differ is refused.
 *
 * The method is the agent's choice and not ours (7 Oct 2026): the first real proofs of a university, Toulouse's "Mon
 * dossier web", read the page with POST, as an application that draws its pages from the answers to its own posts
 * does, and a server that expected GET before the pin refused both. Before a pin either of the two is held, the
 * operator reads which it was beside the address and the pattern, and the pin fixes it.
 */

/** The ways a page is read. Anything else (PUT, DELETE, PATCH) changes something and is never a reading. */
export const READING_METHODS: readonly string[] = ["GET", "POST"];

export type WitnessPin = Readonly<{
  /** The provider version the agent wrote, "1.0.0-ai.1". */
  providerVersion: string;
  url: string;
  method: string;
  /** `responseMatches` and `responseRedactions` as the claim signs them, JSON. */
  responseMatches: string;
  responseRedactions: string;
  /** The hash of the signed request spec, the claim context's `providerHash`. */
  specHash: string;
}>;

export class WitnessProofError extends Error {
  constructor(
    readonly code: "WITNESS_UNSIGNED" | "WITNESS_OTHER_SIGNER" | "WITNESS_OTHER_DOMAIN" | "WITNESS_OTHER_METHOD" | "WITNESS_OTHER_PATTERN" | "WITNESS_OTHER_VERSION" | "WITNESS_MALFORMED",
    message: string,
  ) {
    super(message);
    this.name = "WitnessProofError";
  }
}

function parsed(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const json = JSON.parse(value);
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The same JSON for the same value whatever the key order, so a pin compares what was signed and not how it was printed. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Whether a host is the portal's domain or one of its subdomains, and nothing that merely ends with its letters. */
export function onDomain(url: string, domain: string): boolean {
  let host: string;
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") return false;
    host = parsedUrl.hostname.toLowerCase();
  } catch {
    return false;
  }
  const wanted = domain.trim().toLowerCase().replace(/^\.+/, "");
  return wanted.length > 0 && (host === wanted || host.endsWith(`.${wanted}`));
}

/**
 * Whether a URL is on one of a provider's domains, written "utoulouse.fr,univ-tlse3.fr": a university can answer on
 * two of its own (the Université de Toulouse, Paul Sabatier's until 2025, D313).
 */
export function onAnyDomain(url: string, domains: string): boolean {
  return domains.split(",").some((domain) => onDomain(url, domain));
}

export type WitnessReading = Readonly<{
  /** What the claim carries, trusted once the witness's signature on it is verified. */
  data: ReclaimTrustedData;
  url: string;
  method: string;
  responseMatches: string;
  responseRedactions: string;
  specHash: string;
}>;

/**
 * One proof of a witness-verified portal, checked: the claim's identifier is the hash of what it holds, it is signed by
 * the pinned witness and nobody else, it read the portal's own domain with a method a page is read with (the pinned
 * one once there is a pin), and, once the portal is pinned, exactly the pinned request, match, redaction and spec. What comes back is trusted in the same sense as the
 * SDK's `verifyProof` data: context and extracted parameters the witness signed.
 */
export function verifyWitnessProof(
  proof: Proof,
  expected: Readonly<{ domain: string; /** The pinned method, or nothing before the pin: any of READING_METHODS. */ method: string | null; pin: WitnessPin | null; providerVersion: string; /** Tests only: the witness a test key stands for. */ witness?: string }>,
): WitnessReading {
  const claim = proof?.claimData;
  if (!claim || typeof claim.parameters !== "string" || typeof claim.context !== "string" || !Array.isArray(proof.signatures)) {
    throw new WitnessProofError("WITNESS_MALFORMED", "The proof does not carry a signed claim");
  }
  const identifier = getIdentifierFromClaimInfo({ provider: claim.provider, parameters: claim.parameters, context: claim.context });
  if (identifier.toLowerCase() !== String(claim.identifier).toLowerCase()) throw new WitnessProofError("WITNESS_UNSIGNED", "The claim's identifier is not the hash of what it holds");
  let signers: string[];
  try {
    signers = recoverSignersOfSignedClaim({ claim, signatures: proof.signatures.map((signature) => hexToBytes(signature as Hex)) }).map((one) => one.toLowerCase());
  } catch {
    throw new WitnessProofError("WITNESS_UNSIGNED", "The claim's signature could not be read");
  }
  const witness = (expected.witness ?? PINNED_RECLAIM_WITNESS).toLowerCase();
  if (signers.length === 0 || signers.some((one) => one !== witness)) throw new WitnessProofError("WITNESS_OTHER_SIGNER", "The claim is not signed by Viky's pinned witness alone");

  const parameters = parsed(claim.parameters);
  const context = parsed(claim.context);
  const url = String(parameters.url ?? "");
  const method = String(parameters.method ?? "GET").toUpperCase();
  if (!onAnyDomain(url, expected.domain)) throw new WitnessProofError("WITNESS_OTHER_DOMAIN", "The proof read another site than this university's portal");
  const methods = expected.method ? [expected.method.toUpperCase()] : READING_METHODS;
  if (!methods.includes(method)) throw new WitnessProofError("WITNESS_OTHER_METHOD", "The proof asked the portal in another way than this university's pin");
  const responseMatches = canonical(parameters.responseMatches ?? []);
  const responseRedactions = canonical(parameters.responseRedactions ?? []);
  const specHash = String(context.providerHash ?? "").toLowerCase();
  let computed: string[] = [];
  try {
    computed = [getHashFromProof(proof)].flat().map((hash) => String(hash).toLowerCase());
  } catch {
    computed = [];
  }
  if (!specHash || computed.length !== 1 || computed[0] !== specHash) throw new WitnessProofError("WITNESS_OTHER_PATTERN", "The proof's request is not the one it says it read");

  const pin = expected.pin;
  if (pin) {
    if (expected.providerVersion !== pin.providerVersion) throw new WitnessProofError("WITNESS_OTHER_VERSION", "The proof came from another version of this university's provider");
    if (url !== pin.url || responseMatches !== pin.responseMatches || responseRedactions !== pin.responseRedactions || specHash !== pin.specHash.toLowerCase()) {
      throw new WitnessProofError("WITNESS_OTHER_PATTERN", "The proof read the page with another pattern than this university's pin");
    }
  }
  const extracted = context.extractedParameters;
  const extractedParameters: Record<string, string> = {};
  if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
    for (const [key, value] of Object.entries(extracted as Record<string, unknown>)) if (typeof value === "string") extractedParameters[key] = value;
  }
  return { data: { context, extractedParameters }, url, method, responseMatches, responseRedactions, specHash };
}

/** The pin a first proof gives, once the operator has read it: the version it came from and what its claim signed. */
export function pinOf(reading: WitnessReading, providerVersion: string): WitnessPin {
  return { providerVersion, url: reading.url, method: reading.method, responseMatches: reading.responseMatches, responseRedactions: reading.responseRedactions, specHash: reading.specHash };
}

/** An agent-written version of an AI provider: its base and "-ai.N". */
export function isAgentVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-ai\.\d+$/.test(version);
}

/**
 * A version an AI provider's session can report: the agent's ("1.0.0-ai.1", what a submitted proof has shown so far),
 * or the provider's own base ("1.0.0", what a session reports when it opens). A first proof is held on either, so a
 * student's visit is never lost to the name of a version; the pin is what is checked after it.
 */
export function isWitnessVersion(version: string): boolean {
  return isAgentVersion(version) || /^\d+\.\d+\.\d+$/.test(version);
}

/** The values one key holds across a pin's list, "regex" of its redactions or "value" of its matches. */
function held(list: string, key: string): string[] {
  try {
    const parsedList: unknown = JSON.parse(list);
    if (!Array.isArray(parsedList)) return [];
    return parsedList.flatMap((one) => (one && typeof one === "object" && typeof (one as Record<string, unknown>)[key] === "string" ? [String((one as Record<string, unknown>)[key])] : []));
  } catch {
    return [];
  }
}

const PRINTED_AT_MOST = 200;
const printed = (text: string) => (text.length > PRINTED_AT_MOST ? `${text.slice(0, PRINTED_AT_MOST)}…` : text);

/**
 * What a pinned provider reads, as the judges' page prints it (7 Oct 2026): the version, the request, what its
 * pattern keeps of the answer, and the field Viky then compares. Made from the pin itself, so the page says the rule
 * in force and no other, and says a new one the day the provider is pinned again. A rule holds no name, no number
 * and no faculty: the operator reads it before pinning, and this prints what was pinned.
 */
export function pinInWords(pin: WitnessPin, compared: Readonly<{ field: string; matches: string }> | null): string {
  let where = pin.url;
  try {
    const url = new URL(pin.url);
    where = `${url.hostname}${url.pathname}`;
  } catch {
    // A pin always holds an address a proof read; printed as it is if it ever does not parse.
  }
  const kept = [...held(pin.responseRedactions, "regex"), ...held(pin.responseRedactions, "jsonPath"), ...held(pin.responseRedactions, "xPath")];
  const reads = `version ${pin.providerVersion} reads ${pin.method} ${where}`;
  const keeps = kept.length > 0 ? ` and keeps of the answer what matches ${kept.map((one) => `"${printed(one)}"`).join(", ")}` : "";
  const counts = compared ? `; Viky counts it when ${compared.field} matches "${printed(compared.matches)}"` : "";
  return `${reads}${keeps}${counts}`;
}
