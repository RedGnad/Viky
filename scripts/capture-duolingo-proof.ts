import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchStatusUrl, ReclaimProofRequest, type Proof } from "@reclaimprotocol/js-sdk";
import { getAddress, isAddress } from "viem";
import { DUOLINGO_PROVIDER_ID, DUOLINGO_PROVIDER_VERSION, duolingoContextMessage } from "../src/duolingo-proof-policy";
import { resolvePublicDuolingoProfile } from "../src/duolingo-profile";
import { reclaimChannelInitOptions, reclaimChannelLaunchOptions, resolveReclaimChannel } from "../src/reclaim-channel";

// Live-schema capture for the private Duolingo provider (KT3). Ported from Lock-in. It reproduces the
// exact request the app builds in app/api/duolingo/session/route.ts, opens the Reclaim flow in the local
// Chrome (CDP :9222) so the human only signs in, then polls the Reclaim backend and writes the raw proofs
// for schema inspection. It never funds, never deploys and never flips any gate; it only records what a
// real proof looks like. Output lands in the gitignored sessions/ directory.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const providerId = process.env.DUOLINGO_PROVIDER_ID?.trim() || DUOLINGO_PROVIDER_ID;
const providerVersion = process.env.DUOLINGO_PROVIDER_VERSION?.trim() || DUOLINGO_PROVIDER_VERSION;
const username = (process.argv[2] || process.env.DUOLINGO_USERNAME || "").trim();
if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
  throw new Error("Usage: pnpm tsx scripts/capture-duolingo-proof.ts <duolingo-username> [--gift <id>] [--day <index>] [--no-cdp]");
}
const rawAccount = process.env.ACCOUNT_ADDRESS?.trim() || "0x000000000000000000000000000000000000dEaD";
if (!isAddress(rawAccount)) throw new Error("ACCOUNT_ADDRESS is invalid");
const account = getAddress(rawAccount).toLowerCase();
const openCdp = !process.argv.includes("--no-cdp");
const giftId = process.argv.includes("--gift") ? process.argv[process.argv.indexOf("--gift") + 1] : "0";
const dayArgument = process.argv.includes("--day") ? Number(process.argv[process.argv.indexOf("--day") + 1]) : undefined;
const phase = dayArgument === undefined ? "baseline" : "check-in";

async function main() {
  const profile = await resolvePublicDuolingoProfile(username);
  console.log(`Resolved Duolingo profile: username=${profile.username} id=${profile.id}`);

  const channel = resolveReclaimChannel();
  const request = await ReclaimProofRequest.init(required("RECLAIM_APP_ID"), required("RECLAIM_APP_SECRET"), providerId, {
    providerVersion,
    acceptAiProviders: false,
    ...reclaimChannelInitOptions(channel),
  });
  request.setParams({ duolingo_user_id: profile.id });
  request.addContext(account, duolingoContextMessage(giftId, phase, dayArgument));

  const sessionId = request.getStatusUrl().split("/").pop() || "";
  const requestUrl = await request.getRequestUrl(reclaimChannelLaunchOptions(channel));
  console.log(JSON.stringify({ sessionId, provider: `${providerId}@${providerVersion}`, contextAddress: account, phase, giftId, requestUrl }, null, 2));

  if (openCdp) {
    try {
      const response = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(requestUrl)}`, { method: "PUT" });
      console.log(response.ok ? "Opened the Reclaim flow in local Chrome (CDP)." : `CDP open failed (${response.status}); open the requestUrl manually.`);
    } catch {
      console.log("No Chrome CDP on :9222; open the requestUrl manually in the browser signed in to Duolingo.");
    }
  }

  console.log("Waiting for the proof. Sign in to Duolingo in the opened tab and let Reclaim finish...");
  const deadline = Date.now() + 8 * 60 * 1_000;
  let proofs: Proof | Proof[] | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 3_000));
    let status;
    try {
      status = await fetchStatusUrl(sessionId);
    } catch {
      continue;
    }
    const raw = String(status.session?.statusV2 || status.message || "");
    if (/fail|error|cancel|reject|expired/i.test(raw)) throw new Error(`Reclaim session ${raw || "failed"}`);
    const ready = status.session?.proofs;
    if (Array.isArray(ready) ? ready.length > 0 : Boolean(ready)) {
      proofs = ready as Proof | Proof[];
      break;
    }
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  if (!proofs) throw new Error("Timed out before a proof was returned");

  const list = Array.isArray(proofs) ? proofs : [proofs];
  const outDir = resolve("sessions");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `duolingo-capture-${sessionId}.json`);
  await writeFile(outPath, JSON.stringify(proofs, null, 2));
  console.log(`\nCaptured ${list.length} proof(s) -> ${outPath}\n`);

  list.forEach((proof, index) => {
    const p = proof as Proof;
    let context: Record<string, unknown> = {};
    try {
      context = JSON.parse(p.claimData?.context || "{}");
    } catch {}
    console.log(`--- proof[${index}] ---`);
    console.log("provider:", p.claimData?.provider);
    console.log("parameters:", p.claimData?.parameters);
    console.log("context keys:", Object.keys(context));
    console.log("context.contextMessage:", context.contextMessage);
    console.log("context.contextAddress:", context.contextAddress);
    console.log("has extractedParameters:", Boolean((context as { extractedParameters?: unknown }).extractedParameters));
    console.log("attestation fields present:", Object.keys(context).filter((k) => /attest|nonce|tee/i.test(k)));
    console.log("has teeAttestation object:", Boolean((p as { teeAttestation?: unknown }).teeAttestation));
    console.log("identifier:", p.identifier);
    console.log("signatures:", Array.isArray(p.signatures) ? p.signatures.length : 0);
  });
}

main().catch((error) => {
  console.error("CAPTURE_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
