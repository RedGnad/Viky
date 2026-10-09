/**
 * The judge code a link carries (the founder, 9 Oct 2026): the submission portal's instructions give a link to Viky
 * whose address holds the code, so a judge types nothing. The pay sheet opens on the code, already filled in.
 *
 * Only what can be a code is kept: a few characters with no space in them, cut at the length the server reads. The
 * server alone says whether it is the code; nothing here knows it.
 */
export const JUDGE_CODE_PARAMETER = "code";

/** The longest code the server reads (app/api/judge/credit/route.ts). */
const LONGEST = 200;

/** The code in an address's query ("?code=..."), or nothing: no parameter, an empty one, or one with a space in it. */
export function judgeCodeIn(query: string): string | null {
  const given = new URLSearchParams(query).get(JUDGE_CODE_PARAMETER)?.trim() ?? "";
  if (given === "" || /\s/.test(given)) return null;
  return given.slice(0, LONGEST);
}
