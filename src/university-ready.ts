import { DIRECTORY_PORTALS, type DirectoryPortal } from "./directory-portals";
import { portalListed, type Portal, type PortalProvider, type PortalSense } from "./portal-store";

/**
 * Whether a student of a university can show a proof today (the UI pass of 8 Oct 2026): the chooser lists those
 * universities first, under "Ready today", and every other under how many there are and how fast one is added.
 *
 * Ready is said of one sense, since a gift asks for one: a university whose enrolment is read today may have no
 * provider for its results yet, and a gift on a grade there is set up like any other. A sense is ready when its
 * provider is read through a witness and carries a pin: the rule its proofs are checked against is in place, written
 * by a reviewed first proof or fixed ahead from a version Reclaim publishes (src/witness-portal.ts).
 *
 * Or when its check is Reclaim's own (the founder's decision of 8 Oct 2026, written here on 9 Oct): a provider taken
 * from Reclaim's directory, which Reclaim approved, and whose row carries the hash a proof of that version carries,
 * worked out again from the request Reclaim publishes (`readyByTheDirectory`). Rome's is such a one. Its row held
 * another hash until the operator's command wrote the right one, and a row that holds another is not ready.
 *
 * Before, the first group was "Tested with a student", whatever the gift asked for; and a university pinned ahead of a
 * proof, as Toulouse was on 8 Oct 2026, fell out of it, though its students could show that day.
 */
export function readySenses(portal: Partial<Pick<Portal, "enrolment" | "results">>): readonly PortalSense[] {
  const senses: PortalSense[] = [];
  for (const sense of ["enrolment", "results"] as const) {
    const provider = portal[sense];
    if ((provider?.verification === "witness" && provider.pin !== null) || readyByTheDirectory(provider)) senses.push(sense);
  }
  return senses;
}

/**
 * The directory's entry a provider row is ready by, or nothing: the row is that entry's provider, read with the
 * enclave's attestation as every provider of the directory is, Reclaim approved it, and the row carries the entry's
 * version and its hash. That hash is the one a proof carries, worked out again from the published request and held to
 * it by a test (test/reclaim-pins.test.ts): a row written before it was corrected holds another, and is not ready.
 */
export function readyByTheDirectory(provider: Pick<PortalProvider, "providerId" | "verification" | "providerVersion" | "requestHash"> | null | undefined): DirectoryPortal | null {
  if (!provider || provider.verification !== "tee") return null;
  const entry = DIRECTORY_PORTALS.find((one) => one.providerId !== undefined && one.providerId === provider.providerId);
  if (!entry?.approved || !entry.requestHash) return null;
  return provider.providerVersion === entry.providerVersion && provider.requestHash.toLowerCase() === entry.requestHash.toLowerCase() ? entry : null;
}

/**
 * The universities ready on a check approved by Reclaim, as the judges page names each in a line, from the rows as
 * they stand: none while a row still holds the hash it was first written with.
 */
export async function readyOnReclaimsCheck(load: (portalId: string) => Promise<Partial<Pick<Portal, "enrolment" | "results">> | null>): Promise<readonly Readonly<{ portalId: string; said: string }>[]> {
  const ready: { portalId: string; said: string }[] = [];
  for (const entry of DIRECTORY_PORTALS) {
    if (!entry.said || !entry.approved) continue;
    const portal = await load(entry.portalId).catch(() => null);
    if (portal && (["enrolment", "results"] as const).some((sense) => readyByTheDirectory(portal[sense])?.portalId === entry.portalId)) ready.push({ portalId: entry.portalId, said: entry.said });
  }
  return ready;
}

/** A university as the list gives it to the chooser: what `portalListed` says of it, and the senses it is ready on. */
export function universityListed(portal: Parameters<typeof portalListed>[0]): ReturnType<typeof portalListed> & Readonly<{ ready: readonly PortalSense[] }> {
  return { ...portalListed(portal), ready: readySenses(portal) };
}
