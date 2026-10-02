/**
 * Runs once when a Next.js server starts, locally or on Vercel. A local server, the capture run's included, refuses to
 * start against the production database: `src/database-guard-start.ts`, loaded only in the Node.js runtime, says why
 * and stops, rather than answering every request with an error.
 *
 * And no server starts with the second version of the contracts half set (the review of 2 Oct 2026, R-08): one or two
 * of its three addresses, or one that is not an address. The build refuses the same thing first (next.config.mjs),
 * since a browser's copy of the three is fixed when the app is built.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { refuseProductionDatabase, refuseHalfSetSecondVersion } = await import("./src/database-guard-start");
  refuseHalfSetSecondVersion();
  refuseProductionDatabase();
}
