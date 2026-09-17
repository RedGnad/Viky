/**
 * Runs once when a Next.js server starts, locally or on Vercel. A local server, the capture run's included, refuses to
 * start against the production database: `src/database-guard-start.ts`, loaded only in the Node.js runtime, says why
 * and stops, rather than answering every request with an error.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { refuseProductionDatabase } = await import("./src/database-guard-start");
  refuseProductionDatabase();
}
