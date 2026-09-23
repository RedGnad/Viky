import "../src/load-env";
import { countPortals, ensurePortalSchema, loadPortal, savePortal } from "../src/portal-store";
import { need, resultsFromEnv, resultsNamed } from "./portal-env";

/**
 * Writes one proven student portal into `viky_portals` (D165). Run by an operator, once a Reclaim provider has been
 * registered on that portal from a real student account and a proof has come back carrying the field named here.
 * OPERATIONS, "A university's portal, in thirty minutes", is the whole procedure; this is its last step.
 *
 * Everything is named in the environment of the command, nothing is asked interactively:
 *
 *   PORTAL_ID=ucad-sn NAME="UCAD, espace étudiant" UNIVERSITY="Université Cheikh Anta Diop" COUNTRY=SN \
 *   PROVIDER_ID=<uuid> PROVIDER_VERSION=1.0.0 REQUEST_HASH=0x… LOGIN_URL=https://… \
 *   EXTRACT_FIELD=status EXTRACT_MATCHES="^(Inscrit|Enrolled)" EXTRACT_KEEPS="whether the status says enrolled, and nothing else" \
 *   PROVEN_BY=0x…<the operator account> pnpm portal:add
 *
 * The results page, when it was proved in the same session, goes in the same command with the `RESULTS_*` names
 * of scripts/portal-env.ts (D174); otherwise `pnpm portal:results` adds it later, and proving enrolment again never
 * removes it.
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 * `DRY_RUN=1` prints the row and writes nothing.
 */
async function main() {
  const row = {
    portalId: need("PORTAL_ID"),
    name: need("NAME"),
    university: need("UNIVERSITY"),
    country: need("COUNTRY").toUpperCase(),
    providerId: need("PROVIDER_ID"),
    providerVersion: need("PROVIDER_VERSION"),
    requestHash: need("REQUEST_HASH"),
    loginUrl: need("LOGIN_URL"),
    extract: { field: need("EXTRACT_FIELD"), matches: need("EXTRACT_MATCHES"), keeps: need("EXTRACT_KEEPS") },
    provenBy: need("PROVEN_BY"),
    ...(resultsNamed() ? { results: resultsFromEnv() } : {}),
  };
  console.log(JSON.stringify({ step: process.env.DRY_RUN === "1" ? "would write" : "writing", row }, null, 2));
  if (process.env.DRY_RUN === "1") return;
  await ensurePortalSchema();
  await savePortal(row);
  const back = await loadPortal(row.portalId);
  if (!back) throw new Error("the row did not read back");
  console.log(JSON.stringify({ step: "read back", portalId: back.portalId, university: back.university, provenAt: back.provenAt.toISOString(), results: back.results ? "proved" : "none", portals: await countPortals() }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
