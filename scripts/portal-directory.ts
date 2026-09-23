import "../src/load-env";
import { getAddress } from "viem";
import { DIRECTORY_PORTALS } from "../src/directory-portals";
import { ensurePortalSchema, loadPortal, portalFound, savePortal } from "../src/portal-store";

/**
 * Writes the directory's portals pinned in src/directory-portals.ts as portal rows, marked unverified (D193): one
 * command, run by an operator against the database the environment names. `DRY_RUN=1` prints the rows and writes
 * nothing. Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`,
 * and the production `DATABASE_URL` in the shell).
 *
 *   PROVEN_BY=0x…<the operator account> pnpm portal:directory
 */
async function main() {
  const provenBy = getAddress(String(process.env.PROVEN_BY?.trim()));
  const rows = DIRECTORY_PORTALS.map((pinned) => ({ portalId: pinned.portalId, name: pinned.name, university: pinned.university, country: pinned.country, providerId: pinned.providerId, providerVersion: pinned.providerVersion, requestHash: pinned.requestHash, loginUrl: pinned.loginUrl, extract: pinned.extract, provenBy, unverified: true }));
  console.log(JSON.stringify({ step: process.env.DRY_RUN === "1" ? "would write" : "writing", rows: rows.map((row) => ({ portalId: row.portalId, providerId: row.providerId, requestHash: row.requestHash })) }, null, 2));
  if (process.env.DRY_RUN === "1") return;
  await ensurePortalSchema();
  for (const row of rows) {
    await savePortal(row);
    const back = await loadPortal(row.portalId);
    if (!back) throw new Error(`${row.portalId} did not read back`);
    console.log(JSON.stringify({ step: "read back", portalId: back.portalId, chooser: portalFound(back) }));
  }
}

main().catch((error) => {
  console.error("PORTAL_DIRECTORY_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
