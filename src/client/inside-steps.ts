/**
 * Whether the page before this one, in the browser's own history, is a page of Viky (7 Oct 2026). Browser side.
 *
 * The back key went a step back whenever the history held more than one entry. A person brought back to a gift's page
 * by the verification page had Reclaim's page as the entry before: the key led there, and Reclaim sent them straight
 * back, so nothing seemed to happen. A browser says how long its history is, never what it holds or where in it the
 * page stands, so the pages Viky itself showed are kept here, in the order the history holds them.
 *
 * What is kept is never more than what is sure. A page reached by a step inside Viky is added when the history grew
 * with it. A step that did not grow it is a step back to a page already kept (the list is cut there), or a page put in
 * the place of another. Anything unsure shortens the list: the key then goes to the place it names, which is always a
 * page of Viky, where a wrong step back could leave it.
 *
 * It lives with the document, and in the tab's own storage so a page loaded again keeps it. A page arrived at from
 * anywhere else starts it anew: what came before is not Viky's to step back to.
 */

const STORED_AS = "viky.steps";
const MOST = 50;

/** The list after a page is shown. `grew` is whether the browser's history is longer than at the page before. */
export function nextSteps(steps: readonly string[], page: string, grew: boolean): string[] {
  if (steps.length === 0) return [page];
  if (steps[steps.length - 1] === page) return [...steps];
  if (grew) return [...steps, page].slice(-MOST);
  const before = steps.lastIndexOf(page);
  if (before >= 0) return steps.slice(0, before + 1);
  return [...steps.slice(0, -1), page];
}

/** What a list loaded with the document is worth: kept for a page loaded again or stepped back to, nothing otherwise. */
export function stepsAtLoad(stored: readonly string[], arrivedBy: string | undefined): string[] {
  return arrivedBy === "reload" || arrivedBy === "back_forward" ? [...stored] : [];
}

let steps: string[] | null = null;
let lengthBefore = 0;

function stored(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORED_AS) ?? "[]");
    return Array.isArray(parsed) && parsed.every((one) => typeof one === "string") ? parsed.slice(-MOST) : [];
  } catch {
    return [];
  }
}

/** Called with each page Viky shows: its path and its query, which is what a step of a task changes. */
export function pageShown(page: string): void {
  if (typeof window === "undefined") return;
  const length = window.history.length;
  if (steps === null) {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    steps = nextSteps(stepsAtLoad(stored(), entry?.type), page, false);
  } else {
    steps = nextSteps(steps, page, length > lengthBefore);
  }
  lengthBefore = length;
  try {
    window.sessionStorage.setItem(STORED_AS, JSON.stringify(steps));
  } catch {
    // A browser that keeps nothing still has the list for as long as the document lives.
  }
}

/** True when a step back stays inside Viky. */
export function pageBeforeIsOurs(): boolean {
  return typeof window !== "undefined" && window.history.length > 1 && (steps?.length ?? 0) > 1;
}
