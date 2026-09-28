import "../src/load-env";
import { ensurePortalSchema, giftsOnPortal, loadPortal, removePortal } from "../src/portal-store";

/**
 * Takes a university off the list when no proof can come from its portal (the founder, 28 Sep 2026): its row and its
 * held reviews, never a portal a gift names. The register it came from must drop it too, or `pnpm portal:directory`
 * writes it back. `DRY_RUN=1` says what would go and removes nothing.
 *
 *   pnpm portal:remove ihet-tn polytech-med-tn
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 */
async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("name the portal ids to remove");
  await ensurePortalSchema();
  for (const portalId of ids) {
    const portal = await loadPortal(portalId);
    const gifts = await giftsOnPortal(portalId);
    console.log(JSON.stringify({ portalId, found: portal !== null, university: portal?.university ?? null, gifts }));
    if (!portal || process.env.DRY_RUN === "1") continue;
    console.log(JSON.stringify({ portalId, removed: await removePortal(portalId) }));
  }
}

main().catch((error) => {
  console.error("PORTAL_REMOVE_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
