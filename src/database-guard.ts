import { createHash } from "node:crypto";

/**
 * Keeps a local run away from the production database (the founder's rule of 17 Sep 2026).
 *
 * `.env.local` once named the production database, so a server started on a laptop, and the capture run's four
 * servers, read real gifts and would have written to them. Local work now has its own Neon branch. This guard is the
 * part that does not depend on anybody remembering: outside a running Vercel deployment, a database whose host is the
 * production one is refused, unless the run says in its own environment that it means to touch production
 * (`VIKY_ALLOW_PRODUCTION_DATABASE=1`, which the operator commands in docs/OPERATIONS.md set and nothing else does).
 *
 * The production host is not written here: only a hash of it, so the repository does not carry the address.
 */

/** sha256 of "viky:database:v1:" and the production endpoint's host, pooler or not. */
export const PRODUCTION_DATABASE_FINGERPRINT = "500f6aed0268bea59c11e894b654b2b0f6bcd4f2f1e75922b08ed32e8ee5134e";

export class ProductionDatabaseRefused extends Error {
  constructor() {
    super(
      "Refusing to use the production database outside a Vercel deployment. Point DATABASE_URL at the local Neon branch, or set VIKY_ALLOW_PRODUCTION_DATABASE=1 for an operator command that means to touch production.",
    );
    this.name = "ProductionDatabaseRefused";
  }
}

/** The fingerprint of a database URL's host, the same for its pooled and unpooled endpoints. */
export function databaseFingerprint(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return createHash("sha256").update(`viky:database:v1:${host.replace(/^([^.]+)-pooler\./, "$1.")}`).digest("hex");
}

type Environment = Readonly<Record<string, string | undefined>>;

/** Throws when this run is local and its database is production's, without the operator's explicit consent. */
export function assertDatabaseAllowed(env: Environment = process.env, production: string = PRODUCTION_DATABASE_FINGERPRINT): void {
  const url = env.DATABASE_URL?.trim();
  if (!url) return;
  // A running deployment has a region; `vercel env pull` writes VERCEL=1 into a local file too, but never a region
  // ("VERCEL_REGION, available at runtime", Vercel's system environment variables, read 17 Sep 2026).
  if (env.VERCEL === "1" && Boolean(env.VERCEL_REGION)) return;
  if (env.VIKY_ALLOW_PRODUCTION_DATABASE === "1") return;
  if (databaseFingerprint(url) === production) throw new ProductionDatabaseRefused();
}

/** The database URL every store connects with, once the guard has let it through. */
export function databaseUrl(env: Environment = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");
  assertDatabaseAllowed(env);
  return url;
}
