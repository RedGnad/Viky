import { keccak256, stringToHex, type Hex } from "viem";

/**
 * The Duolingo English Test, the one supervised result of the four we read (U3, 18 Sep 2026). Browser safe.
 *
 * The test itself is recorded and reviewed by examiners against an identity document, which is why it is here: what
 * a gift hangs on is a result the person cannot award themselves. What we read is the page the taker chose to make
 * public by pressing "Get Shareable Link" on their own certificate.
 *
 * Measured on 18 Sep 2026, on two live certificates: `certs.duolingo.com/<alias>` is a shell with no score in it,
 * and the score comes from `certs.duolingo.com/certificates/data?alias=<alias>`, which answers an anonymous request
 * with the score, the name, the day of the test and the sub-scores, and also a date of birth and a link to the
 * taker's photograph. **Three fields are attested and nothing else is kept**: the score, the day, and the name. The
 * date of birth and the photograph are matched by no pattern, stored nowhere, and named on the privacy page for what
 * they are: part of an answer the attestor fetches.
 *
 * The same reading also says when a certificate has stopped being public: 403 once the taker takes it private again,
 * 400 once it has expired, both measured the same day.
 */

/** The page a person shares, and the answer behind it. The alias is the only part that varies. */
export const DET_SOURCE = "Duolingo English Test";

/** Aliases seen in the wild: sixteen lowercase letters and figures, thirty-two hex, and eight for the oldest. */
const ALIAS = /^[a-z0-9]{8,64}$/;

export function isValidDetAlias(value: string): boolean {
  return ALIAS.test(value.trim());
}

export function detCertificateUrl(alias: string): string {
  return `https://certs.duolingo.com/${encodeURIComponent(alias.trim())}`;
}

export function detDataUrl(alias: string): string {
  return `https://certs.duolingo.com/certificates/data?alias=${encodeURIComponent(alias.trim())}`;
}

/**
 * The alias inside whatever the person pasted: the whole link, the link without its protocol, or the alias alone.
 * Anything else gives nothing, and the screen says so rather than guessing.
 */
export function detAliasOf(pasted: string): string | undefined {
  const text = pasted.trim();
  if (text.length === 0) return undefined;
  if (isValidDetAlias(text)) return text;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return undefined;
  }
  if (url.hostname.toLowerCase() !== "certs.duolingo.com") return undefined;
  const fromQuery = url.searchParams.get("alias");
  const candidate = (fromQuery ?? url.pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  return isValidDetAlias(candidate) ? candidate : undefined;
}

/**
 * A name as the two sides can both write it. The certificate prints a legal name, surname first and with a comma
 * ("Vantar, Elio Sam Noor", the shape read on a live certificate on 18 Sep 2026, with an invented holder), while a
 * funder types the name they
 * use. So accents, case, punctuation and the order of the parts are all removed: what is left is the set of words in
 * the name, in one order, which is the same whichever way round either side wrote it.
 *
 * What this deliberately does not do is guess. A funder who types two words for a name the certificate prints with
 * four gets a refusal, not a gift paid to somebody else.
 */
export function normaliseCertificateName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * The person and the thing, as the funder signs them into the terms (D45 promise 9, `subject` on the contract). The
 * proof carries the same hash or it pays nothing, so a certificate belonging to somebody else settles no gift.
 *
 * It stays a name, with what that costs: two people with the same name and the same result inside the same window
 * cannot be told apart by this, because the page has no field its holder can edit. D49 wrote that gap down rather
 * than dressing it up, and it is unchanged here.
 */
export function certificateSubject(source: string, name: string): Hex {
  return keccak256(stringToHex(`viky:certificate:v1:${source}:${normaliseCertificateName(name)}`));
}

/** The scores the test gives: 10 to 160, in fives (Duolingo's published scale). */
export const DET_MIN_SCORE = 10;
export const DET_MAX_SCORE = 160;
export const DET_SCORE_STEP = 5;

export function isValidDetScore(value: number): boolean {
  return Number.isSafeInteger(value) && value >= DET_MIN_SCORE && value <= DET_MAX_SCORE && value % DET_SCORE_STEP === 0;
}

/**
 * How long a gift on this result may run. The contract already caps a deadline at a year, and a certificate is
 * valid for two: "After two years, your DET Certificate will be marked expired and you will no longer be able to
 * share your DET Certificate with third parties" (their terms, read 18 Sep 2026). The certificate a gift pays for is
 * taken inside the gift, so at proof time it is at most this old, which leaves the whole of its second year spare.
 */
export const DET_DURATION_DAYS = Object.freeze({ min: 14, max: 180, suggested: 90 });

/** The day of the test as the answer gives it, "2025-12-19", as seconds at midnight UTC: what the contract judges. */
export function detTestDaySeconds(testDate: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(testDate.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const seconds = Date.UTC(Number(year), Number(month) - 1, Number(day)) / 1_000;
  if (!Number.isSafeInteger(seconds)) return undefined;
  // A day the calendar does not have (2025-02-30) rolls over in Date.UTC, so it is refused rather than moved.
  const back = new Date(seconds * 1_000).toISOString().slice(0, 10);
  return back === `${year}-${month}-${day}` ? seconds : undefined;
}

/** The provider id every proof of this reading carries, so one source's proof can never settle another's gift. */
export function detProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:duolingo-english-test-zkfetch:v1"));
}

/** The label of the identity pseudonym for this source. One person, one identity, whatever they scored. */
export const DET_IDENTITY_LABEL = "englishtest.duolingo.com";
