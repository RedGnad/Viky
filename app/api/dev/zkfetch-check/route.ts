import { NextResponse } from "next/server";
import { fetchPublicProfile, reclaimPublicProfileDeps } from "@/src/duolingo-public";
import { NO_STORE } from "@/src/gift-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Dev-only: proves the attested fetch runs in this deployment (native client, tracing, credentials). */
export async function GET() {
  if (process.env.VIKY_DEV_PAGES !== "1") return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  const started = Date.now();
  const runtime: Record<string, unknown> = { node: process.version, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null };
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const esmOnlyPackage = "@reclaimprotocol/tls"; // a transitive dependency; named as a string so the type checker does not look for it
    try {
      req(esmOnlyPackage);
      runtime.requireEsm = "ok";
    } catch (error) {
      runtime.requireEsm = error instanceof Error ? `${(error as { code?: string }).code ?? error.name}: ${error.message.slice(0, 120)}` : String(error);
    }
    try {
      await import(/* turbopackIgnore: true */ esmOnlyPackage);
      runtime.importEsm = "ok";
    } catch (error) {
      runtime.importEsm = error instanceof Error ? `${(error as { code?: string }).code ?? error.name}: ${error.message.slice(0, 120)}` : String(error);
    }
  } catch (error) {
    runtime.probe = error instanceof Error ? error.message : String(error);
  }
  try {
    const profile = await fetchPublicProfile("duolingo", await reclaimPublicProfileDeps());
    return NextResponse.json({ ok: true, runtime, ms: Date.now() - started, profileId: profile.profileId, totalXp: profile.totalXp, observedAt: profile.observedAt }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ ok: false, runtime, ms: Date.now() - started, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }, { status: 500, headers: NO_STORE });
  }
}
