import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// The offline page is precached under a revision that changes with every deployment, so a new
// build always refreshes it. Vercel exposes the commit; a local build falls back to git, then to
// a random value.
function buildRevision(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (fromVercel) return fromVercel;
  const fromGit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim();
  if (fromGit) return fromGit;
  return crypto.randomUUID();
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision: buildRevision() }],
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
});
