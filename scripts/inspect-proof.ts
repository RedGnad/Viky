import "../src/load-env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  fetchStatusUrl,
  getAttestors,
  getHashFromProof,
  getIdentifierFromClaimInfo,
  recoverSignersOfSignedClaim,
  ReclaimProofRequest,
  verifyProof,
  type Proof,
} from "@reclaimprotocol/js-sdk";
import { hexToBytes, type Hex } from "viem";
import { PINNED_RECLAIM_WITNESS } from "../src/reclaim-proof-set";

// Operator inspection of one Reclaim proof, built for the first AI-witnessed provider a student runs. It answers three
// questions with the SDK's own functions: who signed the claim (the witness), what the signed claim holds (the request
// and the patterns the response was matched against, or only values an AI produced), and what could be pinned in place
// of a requestHash. It never relays, never writes to a database and never touches the chain; the raw proofs land in the
// gitignored sessions/ directory because they carry one person's account.
//
//   pnpm proof:inspect start <providerId> [--version <v>]   create a session that accepts AI providers, print its link
//   pnpm proof:inspect <sessionId> [--wait]                 read the session from Reclaim and report
//   pnpm proof:inspect <file.json>                          report on proofs saved earlier

type Row = [string, unknown];

function print(title: string, rows: Row[]): void {
  console.log(`\n${title}`);
  for (const [label, value] of rows) {
    const shown = typeof value === "string" ? value : JSON.stringify(value);
    console.log(`  ${label.padEnd(34)} ${shown}`);
  }
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function shorten(value: unknown, max = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined ? "(absent)" : text.length > max ? `${text.slice(0, max)}... (${text.length} chars)` : text;
}

async function start(providerId: string): Promise<void> {
  const appId = process.env.RECLAIM_APP_ID?.trim();
  const appSecret = process.env.RECLAIM_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("RECLAIM_APP_ID and RECLAIM_APP_SECRET are needed to open a session");
  const request = await ReclaimProofRequest.init(appId, appSecret, providerId, {
    providerVersion: flag("--version"),
    acceptAiProviders: true,
  });
  request.addContext("0x000000000000000000000000000000000000dEaD", "viky inspection, no gift");
  const sessionId = request.getStatusUrl().split("/").pop() ?? "";
  const requestUrl = await request.getRequestUrl({ verificationMode: "portal" });
  print("Session opened (accepts AI providers, for inspection only)", [
    ["session", sessionId],
    ["provider", `${providerId}@${request.getProviderVersion().providerVersion || "latest"}`],
    ["link for the student", requestUrl],
    ["then run", `pnpm proof:inspect ${sessionId} --wait`],
  ]);
}

async function load(source: string): Promise<{ status: string; isPortalProof: unknown; providerId?: string; providerVersion?: string; proofs: Proof[] }> {
  if (source.endsWith(".json")) {
    const saved = JSON.parse(await readFile(source, "utf8"));
    const session = saved.session ?? {};
    const proofs = saved.session ? session.proofs : saved;
    return {
      status: session.statusV2 ?? "(file)",
      isPortalProof: session.isPortalProof,
      providerId: session.providerId,
      providerVersion: session.providerVersionString,
      proofs: Array.isArray(proofs) ? proofs : proofs ? [proofs] : [],
    };
  }
  const deadline = Date.now() + (process.argv.includes("--wait") ? 10 * 60_000 : 0);
  for (;;) {
    const response = await fetchStatusUrl(source);
    const session = (response.session ?? {}) as Record<string, unknown> & NonNullable<typeof response.session>;
    const proofs = session.proofs ?? [];
    if (proofs.length > 0 || Date.now() >= deadline) {
      await mkdir(resolve("sessions"), { recursive: true });
      const out = resolve("sessions", `inspect-${source}.json`);
      await writeFile(out, JSON.stringify(response, null, 2));
      console.log(`Raw session saved to ${out}`);
      return {
        status: session.statusV2 ?? response.message,
        isPortalProof: session.isPortalProof,
        providerId: session.providerId,
        providerVersion: session.providerVersionString,
        proofs,
      };
    }
    process.stdout.write(`${session.statusV2 ?? "waiting"}. `);
    await new Promise((wait) => setTimeout(wait, 4_000));
  }
}

async function inspect(source: string): Promise<void> {
  const { status, isPortalProof, providerId, providerVersion, proofs } = await load(source);
  print("Session", [
    ["status", status],
    ["accepted by Viky today", status === "PROOF_SUBMITTED" ? "yes (PROOF_SUBMITTED)" : "no, only PROOF_SUBMITTED is"],
    ["isPortalProof", isPortalProof ?? "(absent)"],
    ["provider", `${providerId ?? "?"}@${providerVersion ?? "?"}`],
    ["proofs", proofs.length],
  ]);
  if (proofs.length === 0) return;

  const attestors = await getAttestors().catch(() => []);
  const attestorIds = new Set(attestors.map((attestor) => attestor.id.toLowerCase()));

  proofs.forEach((proof, index) => {
    const claim = proof.claimData;
    const parameters = parseJson(claim.parameters);
    const context = parseJson(claim.context);
    const identifier = getIdentifierFromClaimInfo({ provider: claim.provider, parameters: claim.parameters, context: claim.context });
    let signers: string[] = [];
    try {
      signers = recoverSignersOfSignedClaim({ claim, signatures: proof.signatures.map((signature) => hexToBytes(signature as Hex)) });
    } catch (error) {
      signers = [`(recovery failed: ${error instanceof Error ? error.message : error})`];
    }
    print(`Proof ${index}: the witness`, [
      ["claim provider", claim.provider],
      ["identifier recomputed = signed", identifier.toLowerCase() === claim.identifier.toLowerCase()],
      ["signers recovered", signers],
      ["witnesses listed in the proof", proof.witnesses.map((witness) => witness.id)],
      ["signer is Viky's pinned witness", signers.includes(PINNED_RECLAIM_WITNESS.toLowerCase())],
      ["signer is a current Reclaim attestor", attestors.length ? signers.some((signer) => attestorIds.has(signer)) : "(attestor list unreachable)"],
      ["witness TEE claimAttestation", proof.witnesses.map((witness) => Boolean(witness.claimAttestation))],
      ["app TEE attestation (teeAttestation)", Boolean(proof.teeAttestation)],
    ]);

    const matches = Array.isArray(parameters.responseMatches) ? parameters.responseMatches : [];
    const redactions = Array.isArray(parameters.responseRedactions) ? parameters.responseRedactions : [];
    print(`Proof ${index}: what the signed claim holds (claimData.parameters)`, [
      ["parameter keys", Object.keys(parameters)],
      ["method url", `${parameters.method ?? "?"} ${parameters.url ?? "(no url)"}`],
      ["request body signed", parameters.body ? shorten(parameters.body, 80) : "(none)"],
      ["header names signed", Object.keys((parameters.headers as object) ?? {})],
      ["responseMatches", matches.length ? matches.map((match) => shorten(match)) : "(none)"],
      ["responseRedactions", redactions.length ? redactions.map((redaction) => shorten(redaction)) : "(none)"],
      ["paramValues", shorten(parameters.paramValues ?? "(none)")],
      ["publicData (NOT signed)", shorten(proof.publicData ?? "(none)")],
    ]);

    let computed: string[] = [];
    try {
      computed = getHashFromProof(proof);
    } catch (error) {
      computed = [`(not computable: ${error instanceof Error ? error.message : error})`];
    }
    print(`Proof ${index}: context and pin candidates`, [
      ["context keys", Object.keys(context)],
      ["contextAddress / contextMessage", `${context.contextAddress} / ${context.contextMessage}`],
      ["reclaimSessionId", context.reclaimSessionId],
      ["extractedParameters", context.extractedParameters],
      ["providerHash (what Viky pins now)", context.providerHash ?? "(absent)"],
      ["hash of the signed request spec", computed],
      ["providerHash = spec hash", typeof context.providerHash === "string" && computed.includes(context.providerHash.toLowerCase())],
      ["timestampS", `${claim.timestampS} (${new Date(claim.timestampS * 1_000).toISOString()})`],
    ]);
  });

  const appSecret = process.env.RECLAIM_APP_SECRET?.trim();
  if (!providerId) return;
  for (const allowedTags of [[], ["ai"]]) {
    const result = await verifyProof(proofs, {
      providerId,
      providerVersion,
      allowedTags,
      ...(appSecret ? { teeAttestation: { appSecret } } : {}),
    });
    print(`SDK verifyProof, allowedTags ${JSON.stringify(allowedTags)}${appSecret ? " with the app TEE check" : " WITHOUT the app TEE check (no secret)"}`, [
      ["isVerified", result.isVerified],
      ["isTeeAttestationVerified", result.isTeeAttestationVerified ?? "(not run)"],
      ["error", result.error?.message ?? "(none)"],
    ]);
  }
  const attestorTee = await verifyProof(proofs, { providerId, providerVersion, allowedTags: ["ai"], attestorTeeAttestation: {} });
  print("SDK verifyProof, witness TEE check (attestorTeeAttestation)", [
    ["isVerified", attestorTee.isVerified],
    ["isAttestorTeeAttestationVerified", attestorTee.isAttestorTeeAttestationVerified ?? "(not run)"],
    ["error", attestorTee.error?.message ?? "(none)"],
  ]);
}

const [command, argument] = process.argv.slice(2);
const run = command === "start" && argument ? start(argument) : command ? inspect(command) : Promise.reject(new Error(
  "Usage: pnpm proof:inspect start <providerId> [--version v] | pnpm proof:inspect <sessionId> [--wait] | pnpm proof:inspect <file.json>",
));
run.catch((error) => {
  console.error("INSPECT_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
