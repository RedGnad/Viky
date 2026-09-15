import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Without this, `next dev` started by an AI agent writes Next's own rules block into CLAUDE.md.
  agentRules: false,
  // Reclaim's zkFetch stack (attestor core, zk circuits, optional native re2) is loaded at runtime from
  // node_modules rather than bundled: its dynamic imports and resource files do not survive bundling.
  serverExternalPackages: ["@reclaimprotocol/zk-fetch", "@reclaimprotocol/attestor-core", "@reclaimprotocol/zk-symmetric-crypto", "re2", "@swc/core", "pino"],
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/.pnpm/@reclaimprotocol+attestor-core*/node_modules/@reclaimprotocol/attestor-core/**",
      "./node_modules/.pnpm/@reclaimprotocol+zk-symmetric-crypto*/node_modules/@reclaimprotocol/zk-symmetric-crypto/**",
      "./node_modules/.pnpm/@reclaimprotocol+zk-fetch*/node_modules/@reclaimprotocol/zk-fetch/**",
    ],
  },
  // The repository is the workspace root; a lockfile higher up the tree must not be picked up.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

// Next 16 builds with Turbopack, so the service worker is produced by Serwist's Turbopack
// integration (app/serwist/[path]/route.ts) instead of the template's webpack plugin.
export default withSerwist(nextConfig);
