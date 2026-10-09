import { judgeCodeIn } from "../judge-link";

/**
 * The judge code a link carried, kept for this tab alone (src/judge-link.ts): read from the address of the first page
 * the link opens, whichever it is, and held until the code has been used, so it is still there when the pay sheet
 * opens after a page or two. A browser that keeps nothing for the page loses it, and the judge types the code.
 */
const KEPT_AS = "viky.judge-code";

export function keepJudgeCodeFromTheAddress(): void {
  try {
    const code = judgeCodeIn(window.location.search);
    if (code) window.sessionStorage.setItem(KEPT_AS, code);
  } catch {
    // Nothing kept: the field opens empty.
  }
}

/** The code the link carried, or nothing. Read in a browser, after the page has drawn. */
export function judgeCodeFromTheLink(): string {
  try {
    return window.sessionStorage.getItem(KEPT_AS) ?? "";
  } catch {
    return "";
  }
}

/** Once the code has given its credit, it is not offered again. */
export function forgetJudgeCodeFromTheLink(): void {
  try {
    window.sessionStorage.removeItem(KEPT_AS);
  } catch {
    // Nothing was kept.
  }
}
