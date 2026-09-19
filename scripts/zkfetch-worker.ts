import "../src/load-env";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { classifyFetchFailure, localAttestedFetch } from "../src/attested-read";
import { attestedSource } from "../src/attested-sources";
import { fetchPublicProfile, PublicProfileError, reclaimLocalProfileDeps } from "../src/duolingo-public";
import { fingerprintOfContents, READING_FILES } from "../src/reading-fingerprint";

/**
 * The attested-fetch worker (D27): a small HTTP service that runs Reclaim's zkFetch where Node can load it
 * (Vercel functions start Node with `--no-experimental-require-module`, which zk-fetch's CommonJS build
 * cannot survive). It only fetches and returns the proof; the caller verifies the attestor signature
 * itself, so a compromised worker could delay a reading but never forge one.
 *
 * Two shapes of request. `{ source, account }` names a page from src/attested-sources.ts and the account to read
 * there; the worker builds the URL itself and never takes one from its caller (C2, Chess.com). `{ username }` is the
 * Duolingo request the app sent before sources existed, kept so a deployment of the app can never meet a worker that
 * no longer understands it.
 *
 * Usage: ZKFETCH_WORKER_SECRET=<secret> pnpm zkfetch:worker [port]
 */
const port = Number(process.argv[2] ?? process.env.PORT ?? 3210);
const secret = process.env.ZKFETCH_WORKER_SECRET?.trim();
if (!secret) throw new Error("ZKFETCH_WORKER_SECRET is required");

/**
 * The number of the two files this image runs (src/reading-fingerprint.ts). It is read from the files themselves,
 * the ones tsx loads, so it is the truth about this image and not about the commit it was meant to be built from.
 * The app compares it with its own before it asks for anything, and refuses to read rather than believe an older
 * worker (incident of 18 Sep 2026: this service ran a day-old image and every reading died as PROOF_MISMATCH).
 */
const reading = (() => {
  try {
    return { fingerprint: fingerprintOfContents(READING_FILES.map((name) => readFileSync(name, "utf8"))), files: READING_FILES };
  } catch (error) {
    console.error(JSON.stringify({ worker: "zkfetch", at: new Date().toISOString(), readingFingerprint: "unreadable", message: error instanceof Error ? error.message : String(error) }));
    return null;
  }
})();

const server = createServer(async (request, response) => {
  const started = Date.now();
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && request.url === "/health") return reply(200, { ok: true, worker: "zkfetch", at: new Date().toISOString(), reading });
  if (request.method !== "POST" || request.url !== "/read") return reply(404, { error: "Not found" });
  if (request.headers.authorization !== `Bearer ${secret}`) return reply(401, { error: "Not allowed" });
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4_096) return reply(413, { error: "Too large" });
  }
  let body: { username?: unknown; source?: unknown; account?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return reply(400, { error: "Bad JSON" });
  }

  if (body.source !== undefined) {
    const source = attestedSource(String(body.source));
    const account = String(body.account ?? "");
    if (!source) return reply(400, { error: "UNKNOWN_SOURCE" });
    if (!source.accepts(account)) return reply(400, { error: "INVALID_ACCOUNT" });
    try {
      const proof = await localAttestedFetch(source, account);
      console.log(JSON.stringify({ at: new Date().toISOString(), source: source.id, account, ms: Date.now() - started, ok: true }));
      return reply(200, { proof });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = classifyFetchFailure(message, source).code;
      console.log(JSON.stringify({ at: new Date().toISOString(), source: source.id, account, ms: Date.now() - started, ok: false, code, message }));
      // zkFetch's own words go back, so the caller reads a refusal exactly as it would read a local one.
      return reply(code === "NOT_FOUND" ? 404 : code === "NO_MATCH" ? 422 : 502, { error: code, message });
    }
  }

  const username = String(body.username ?? "");
  try {
    const profile = await fetchPublicProfile(username, await reclaimLocalProfileDeps());
    console.log(JSON.stringify({ at: new Date().toISOString(), username, ms: Date.now() - started, ok: true, totalXp: profile.totalXp }));
    return reply(200, { proof: profile.proof });
  } catch (error) {
    const code = error instanceof PublicProfileError ? error.code : "FETCH_FAILED";
    console.log(JSON.stringify({ at: new Date().toISOString(), username, ms: Date.now() - started, ok: false, code, message: error instanceof Error ? error.message : String(error) }));
    return reply(code === "PROFILE_NOT_FOUND" || code === "INVALID_USERNAME" ? 404 : 502, { error: code, message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => console.log(JSON.stringify({ worker: "zkfetch", port, at: new Date().toISOString(), reading })));
