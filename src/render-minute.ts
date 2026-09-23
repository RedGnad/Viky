/** The minute a page is drawn at, on the server (the fix to #154): the clock the first image and its hydration share. */
export function renderMinute(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 60_000) * 60_000;
}
