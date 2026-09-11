import "../src/load-env";
import { createServer } from "node:http";
import { fetchPublicProfile, PublicProfileError, reclaimLocalProfileDeps } from "../src/duolingo-public";

/**
 * The attested-fetch worker (D27): a small HTTP service that runs Reclaim's zkFetch where Node can load it
 * (Vercel functions start Node with `--no-experimental-require-module`, which zk-fetch's CommonJS build
 * cannot survive). It only fetches and returns the proof; the caller verifies the attestor signature
 * itself, so a compromised worker could delay a reading but never forge one.
 *
 * Usage: ZKFETCH_WORKER_SECRET=<secret> pnpm zkfetch:worker [port]
 */
const port = Number(process.argv[2] ?? process.env.PORT ?? 3210);
const secret = process.env.ZKFETCH_WORKER_SECRET?.trim();
if (!secret) throw new Error("ZKFETCH_WORKER_SECRET is required");

const server = createServer(async (request, response) => {
  const started = Date.now();
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || request.url !== "/read") return reply(404, { error: "Not found" });
  if (request.headers.authorization !== `Bearer ${secret}`) return reply(401, { error: "Not allowed" });
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4_096) return reply(413, { error: "Too large" });
  }
  let username = "";
  try {
    username = String((JSON.parse(raw) as { username?: unknown }).username ?? "");
  } catch {
    return reply(400, { error: "Bad JSON" });
  }
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

server.listen(port, () => console.log(JSON.stringify({ worker: "zkfetch", port, at: new Date().toISOString() })));
