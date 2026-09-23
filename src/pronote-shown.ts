import { keccak256, stringToHex, type Hex } from "viem";

/**
 * An average at school shown from the family's own PRONOTE space (D203), built as EcoleDirecte's (D179), on the
 * founder's decision of 23 Sep 2026 and with its risk assumed in the open: Index Education's terms for its sites forbid
 * "tout dispositif manuel ou automatique permettant toute récupération de données sans notre autorisation expresse
 * écrite", no such authorisation exists, and the judges' page says so beside the reason Viky goes on (the person shows
 * their own marks at their own request, the rights of access and portability of the GDPR, articles 15 and 20; no mark
 * kept, the verdict alone, D185), as it does for Duolingo's terms.
 *
 * PRONOTE is served per establishment, `https://<the space>.index-education.net/pronote/`, with a page for parents
 * (`parent.html`), preferred, and one for pupils (`eleve.html`). So the gift carries its space as a university gift
 * carries its portal: the funder pastes the address, the space's own word is the subject they sign, and the person
 * signs in on that space in their own browser. The grades come back from `appelfonction` in clear JSON when the space
 * does not switch on its own AES encryption or compression (`CrA`, `CoA` in the page's start parameters; the public
 * demonstration space has neither, read 23 Sep 2026): `dataSec.data.moyGenerale.V`, "14,50" (pronotepy's
 * `overall_average`, the same day). A space that encrypts gives a proof with nothing readable in it, and the reading
 * fails by its name, `NO_GRADE`, nothing lost.
 */

export const PRONOTE_SOURCE = "PRONOTE";
export const PRONOTE_GOAL_TYPE = 24;

export function pronoteProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:pronote-grade-shown:v1"));
}

/** The subject the funder signs: the space's own word, so a proof from another establishment's space pays nothing. */
export function pronoteSubject(space: string): Hex {
  return keccak256(stringToHex(`viky:subject:pronote-grade-shown:v1:${space}`));
}

/** A space's word: the host's first label on index-education.net, letters and digits, like `0123456a`. */
export function isPronoteSpace(value: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/.test(value);
}

/** The space from what the funder pastes: the address of the PRONOTE page, or its host, or the word alone. */
export function pronoteSpaceOf(pasted: string): string | undefined {
  const text = pasted.trim().toLowerCase();
  if (!text) return undefined;
  const match = /^(?:https?:\/\/)?([a-z0-9-]+)\.index-education\.net(?:[/?#].*)?$/.exec(text);
  const space = match ? match[1] : text;
  return isPronoteSpace(space) && space !== "www" && space !== "demo" ? space : undefined;
}

/** Where the family signs in, in their own browser: the space's parents' page. */
export function pronoteLoginUrl(space: string): string {
  return `https://${space}.index-education.net/pronote/parent.html`;
}

/** A provider of ours, pinned once registered from a real family's session: nothing yet. */
export type PronoteProvider = Readonly<{ id: string; version: string; requestHash: string }>;
export const PRONOTE_PROVIDER: PronoteProvider | null = null;

export const PRONOTE_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real family's PRONOTE space first, and nothing can be shown until then.";
