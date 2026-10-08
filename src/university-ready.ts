import { portalListed, type Portal, type PortalSense } from "./portal-store";

/**
 * Whether a student of a university can show a proof today (the UI pass of 8 Oct 2026): the chooser lists those
 * universities first, under "Ready today", and every other under how many there are and how fast one is added.
 *
 * Ready is said of one sense, since a gift asks for one: a university whose enrolment is read today may have no
 * provider for its results yet, and a gift on a grade there is set up like any other. A sense is ready when its
 * provider is read through a witness and carries a pin: the rule its proofs are checked against is in place, written
 * by a reviewed first proof or fixed ahead from a version Reclaim publishes (src/witness-portal.ts). A provider taken
 * from Reclaim's directory that no proof has yet gone through is not said ready by this alone: Rome's is such a one,
 * and goes up on its own checks, not on a rule.
 *
 * Before, the first group was "Tested with a student", whatever the gift asked for; and a university pinned ahead of a
 * proof, as Toulouse was on 8 Oct 2026, fell out of it, though its students could show that day.
 */
export function readySenses(portal: Partial<Pick<Portal, "enrolment" | "results">>): readonly PortalSense[] {
  const senses: PortalSense[] = [];
  for (const sense of ["enrolment", "results"] as const) {
    const provider = portal[sense];
    if (provider?.verification === "witness" && provider.pin !== null) senses.push(sense);
  }
  return senses;
}

/** A university as the list gives it to the chooser: what `portalListed` says of it, and the senses it is ready on. */
export function universityListed(portal: Parameters<typeof portalListed>[0]): ReturnType<typeof portalListed> & Readonly<{ ready: readonly PortalSense[] }> {
  return { ...portalListed(portal), ready: readySenses(portal) };
}
