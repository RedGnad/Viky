import "../src/load-env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getHostname } from "tldts";
import { getAddress } from "viem";
import { ADDED_PORTALS, CORRIDOR_PORTALS, DIRECTORY_PORTALS } from "../src/directory-portals";
import { countPortals, ensurePortalSchema, loadPortal, portalCountries, savePortal, savePortalRows, type PortalRowInput } from "../src/portal-store";

/**
 * Writes the list of universities (D199, D313): the rows written by hand in src/directory-portals.ts (Rome's with its
 * enrolment provider, the corridor's with their portals looked up one by one), then the world's list,
 * data/university-register.json (`pnpm universities:register`), less every university a hand-written row already
 * names, by a directory provider it came from, its sign-in host, or its name in the same country. Rows only: a provider is added by
 * `pnpm provider:add` once built, and a provider already there is never touched by this command.
 *
 * One command, run by an operator against the database the environment names. `DRY_RUN=1` counts what would be
 * written, by country, and writes nothing. Against production, the operator command of "The test database" applies
 * (`VIKY_ALLOW_PRODUCTION_DATABASE=1`, and the production `DATABASE_URL` in the shell).
 *
 *   PROVEN_BY=0x…<the operator account> pnpm portal:directory
 */

type RegisterRow = { portalId: string; university: string; country: string; loginUrl: string; host: string; domain: string; sourceProviderIds: string[]; answered: number };

function registerRows(): readonly RegisterRow[] {
  const file = join(process.cwd(), "data", "university-register.json");
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { rows: RegisterRow[] }).rows;
}

function hostOf(url: string): string {
  return (getHostname(url) ?? "").toLowerCase();
}

/** A university's name and country, folded, so a hand-written row and the world's line for it are one. */
function nameKey(name: string, country: string): string {
  return `${name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${country}`;
}

async function main() {
  const provenBy = getAddress(String(process.env.PROVEN_BY?.trim()));
  const dry = process.env.DRY_RUN === "1";
  const handWritten = [...CORRIDOR_PORTALS, ...ADDED_PORTALS];
  const handRows = [...DIRECTORY_PORTALS, ...handWritten];
  const taken = {
    ids: new Set(handRows.map((row) => row.portalId)),
    sources: new Set(handWritten.map((row) => row.sourceProviderId)),
    // By the sign-in host, not its registrable domain: a hosting platform serves several universities under one domain.
    hosts: new Set(handRows.map((row) => hostOf(row.loginUrl))),
    names: new Set(handRows.map((row) => nameKey(row.university, row.country))),
  };
  const world = registerRows().filter(
    (row) => !taken.ids.has(row.portalId) && !row.sourceProviderIds.some((id) => taken.sources.has(id)) && !taken.hosts.has(hostOf(row.loginUrl)) && !taken.names.has(nameKey(row.university, row.country)),
  );
  const worldRows: PortalRowInput[] = world.map((row) => ({ portalId: row.portalId, name: row.university, university: row.university, country: row.country, loginUrl: row.loginUrl, provenBy, unverified: true }));
  const corridorRows: PortalRowInput[] = handWritten.map((row) => ({ portalId: row.portalId, name: row.name, university: row.university, country: row.country, loginUrl: row.loginUrl, provenBy, unverified: true }));

  const byCountry = new Map<string, number>();
  for (const row of [...DIRECTORY_PORTALS, ...corridorRows, ...worldRows]) byCountry.set(row.country, (byCountry.get(row.country) ?? 0) + 1);
  console.log(
    JSON.stringify({
      step: dry ? "would write" : "writing",
      handWritten: DIRECTORY_PORTALS.length + corridorRows.length,
      world: worldRows.length,
      countries: byCountry.size,
      byCountry: Object.fromEntries([...byCountry.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))),
    }),
  );
  if (dry) return;
  await ensurePortalSchema();
  for (const pinned of DIRECTORY_PORTALS) {
    const provider = pinned.providerId ? { providerId: pinned.providerId, providerVersion: pinned.providerVersion, requestHash: pinned.requestHash, extract: pinned.extract } : {};
    await savePortal({ portalId: pinned.portalId, name: pinned.name, university: pinned.university, country: pinned.country, loginUrl: pinned.loginUrl, provenBy, unverified: true, ...provider });
    if (!(await loadPortal(pinned.portalId))) throw new Error(`${pinned.portalId} did not read back`);
  }
  const written = await savePortalRows([...corridorRows, ...worldRows]);
  console.log(JSON.stringify({ step: "read back", written, portals: await countPortals(), countries: (await portalCountries()).length }));
}

main().catch((error) => {
  console.error("PORTAL_DIRECTORY_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
