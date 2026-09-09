import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The repository is the workspace root; a lockfile higher up the tree must not be picked up.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

// Next 16 builds with Turbopack, so the service worker is produced by Serwist's Turbopack
// integration (app/serwist/[path]/route.ts) instead of the template's webpack plugin.
export default withSerwist(nextConfig);
