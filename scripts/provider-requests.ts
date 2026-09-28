import "../src/load-env";
import { getAddress } from "viem";
import { ensurePortalSchema, loadPortal, markRequestAlerted, markRequestBuilt, openRequests, saveProvider, type PortalSense } from "../src/portal-store";
import { sendProviderAlert } from "../src/provider-alert";
import { defaultProviderDomain } from "../src/provider-instruction";

/**
 * The providers funders' gifts are waiting on (D313). A gift on a university without a provider of the sense it reads
 * asks the operator for one, with the exact instruction for Reclaim's agent; the person reads that it is checked within
 * a day, and nothing is lost meanwhile.
 *
 *   pnpm provider:requests
 *     lists the open requests, oldest first: the university, the sense, its sign-in page, the gift that asked first,
 *     whether founder@viky.cash was emailed, and the instruction to build the provider with.
 *   pnpm provider:requests --alert
 *     emails the open requests nobody was emailed about yet (made before `RESEND_API_KEY` existed, or whose email
 *     failed), once each.
 *   PROVEN_BY=0x… pnpm provider:add <portal id> <enrolment|results> <provider id> [--domain <domain>]
 *     registers the provider built from it as a witness provider with no pin yet, on the domain given or the sign-in
 *     page's own, and closes the request: the next proof from it is held for review (`pnpm portal:pin`).
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 * `DRY_RUN=1` says what would be registered and writes nothing.
 */
async function main() {
  await ensurePortalSchema();
  const [, , verb, portalId, sense, providerId] = process.argv;
  if (verb !== "add") {
    const alert = process.argv.includes("--alert");
    const requests = await openRequests();
    const listed = await Promise.all(
      requests.map(async (one) => {
        const portal = await loadPortal(one.portalId);
        let emailed = one.alertedAt?.toISOString() ?? null;
        if (alert && !emailed && portal) {
          const outcome = await sendProviderAlert(portal, one);
          if (outcome === "sent" && (await markRequestAlerted(one.portalId, one.sense))) emailed = "now";
          else emailed = outcome;
        }
        return { portal: one.portalId, sense: one.sense, university: portal?.university ?? null, country: portal?.country ?? null, signIn: portal?.loginUrl ?? null, firstGift: one.firstGiftId, asked: one.createdAt.toISOString(), emailed, instruction: one.instruction };
      }),
    );
    console.log(JSON.stringify({ open: listed.length, requests: listed }, null, 2));
    return;
  }
  if (sense !== "enrolment" && sense !== "results") throw new Error("the sense is enrolment or results");
  const portal = await loadPortal(String(portalId));
  if (!portal) throw new Error(`no university ${portalId}`);
  const at = process.argv.indexOf("--domain");
  const domain = (at > 0 ? process.argv[at + 1] : defaultProviderDomain(portal.loginUrl))?.trim().toLowerCase() ?? null;
  const provider = {
    portalId: portal.portalId,
    sense: sense as PortalSense,
    providerId: String(providerId ?? "").trim(),
    verification: "witness" as const,
    domain,
    providerVersion: "",
    requestHash: "",
    extract: null,
    pin: null,
    addedBy: getAddress(String(process.env.PROVEN_BY?.trim())),
  };
  console.log(JSON.stringify({ step: process.env.DRY_RUN === "1" ? "would register" : "registering", university: portal.university, ...provider }, null, 2));
  if (process.env.DRY_RUN === "1") return;
  await saveProvider(provider);
  await markRequestBuilt(portal.portalId, provider.sense);
  const back = await loadPortal(portal.portalId);
  console.log(JSON.stringify({ step: "read back", portal: portal.portalId, sense, provider: back?.[provider.sense]?.providerId ?? null }));
}

main().catch((error) => {
  console.error("PROVIDER_REQUESTS_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
