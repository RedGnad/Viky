import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";

/**
 * The second version of the gift contracts is set by three addresses, together or not at all (the review of 2 Oct
 * 2026, R-08; `secondVersionProblem` in src/v2.ts says why, and test/v2-server.test.ts holds the two to the same
 * answer). A browser's copy of them is fixed here, when the app is built, so this is where a half-set second version
 * is refused first: the build fails, and nothing is served.
 */
const SECOND_VERSION_SETTINGS = ["NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", "NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS", "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS"];
const secondVersion = SECOND_VERSION_SETTINGS.map((name) => (process.env[name] ?? "").trim());
const secondVersionSet = secondVersion.filter((value) => value !== "");
if (secondVersionSet.length > 0 && (secondVersionSet.length < 3 || secondVersionSet.some((value) => !/^0x[0-9a-fA-F]{40}$/.test(value)) || new Set(secondVersionSet.map((value) => value.toLowerCase())).size < 3)) {
  throw new Error(`Refusing to build: ${SECOND_VERSION_SETTINGS.join(", ")} are set together, each an address of its own, or none is.`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nothing says which framework answers (the audit of 1 Oct 2026).
  poweredByHeader: false,
  // Without this, `next dev` started by an AI agent writes Next's own rules block into CLAUDE.md.
  agentRules: false,
  // Reclaim's zkFetch stack (attestor core, zk circuits, optional native re2) is loaded at runtime from
  // node_modules rather than bundled: its dynamic imports and resource files do not survive bundling.
  serverExternalPackages: ["@reclaimprotocol/zk-fetch", "@reclaimprotocol/attestor-core", "@reclaimprotocol/zk-symmetric-crypto", "re2", "@swc/core", "pino"],
  /**
   * What a function must never carry (measured 18 Sep 2026, and the account was 76.6 GB over its 10 GB of function
   * storage). zk-fetch ships its native library built for four platforms inside one package, 135 MB of it, and the
   * tracer puts all four in every function that touches the reading path: the two macOS builds, 60 MB, can never run
   * on a Linux function. The Linux builds both stay, because nothing published says which CPU a function runs on and
   * a reading that cannot load its library is the whole product stopping.
   *
   * The two folders are local: a capture run writes hundreds of megabytes of screenshots into the repository, and the
   * tracer followed them into the bundle on a laptop build. They do not exist on the build machine; excluding them
   * keeps a local measurement honest.
   */
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/.pnpm/@reclaimprotocol+zk-fetch*/node_modules/@reclaimprotocol/zk-fetch/lib/darwin/**",
      "./review-captures/**",
      "./test-results/**",
    ],
  },
  outputFileTracingIncludes: {
    // The picture under a link to the site itself (D265), drawn the same way.
    "/opengraph-image": ["./app/fonts/*.ttf", "./app/kit/figure-day.svg"],
    "/api/**": [
      // The picture a messaging app shows under a gift's link is drawn on the server, from these two faces and this drawing.
      "./app/fonts/*.ttf",
      "./app/kit/figure-day.svg",
      "./node_modules/.pnpm/@reclaimprotocol+attestor-core*/node_modules/@reclaimprotocol/attestor-core/**",
      "./node_modules/.pnpm/@reclaimprotocol+zk-symmetric-crypto*/node_modules/@reclaimprotocol/zk-symmetric-crypto/**",
      // Everything of zk-fetch but its four platform builds: only the Linux ones can run on a function, and the
      // package ships 135 MB of native library, 60 MB of it macOS (D105).
      "./node_modules/.pnpm/@reclaimprotocol+zk-fetch*/node_modules/@reclaimprotocol/zk-fetch/dist/**",
      "./node_modules/.pnpm/@reclaimprotocol+zk-fetch*/node_modules/@reclaimprotocol/zk-fetch/package.json",
      "./node_modules/.pnpm/@reclaimprotocol+zk-fetch*/node_modules/@reclaimprotocol/zk-fetch/lib/linux/**",
    ],
  },
  /**
   * The drawings of the named characters (D206) are addressed with their own content's version, so a phone keeps them
   * for a year and asks again only when a drawing changes: a reload then paints every character from its own memory.
   */
  async headers() {
    return [
      { source: "/characters.svg", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      /**
       * A page's address never travels with a request it makes, only the site's name (the founder, 1 Oct 2026). A
       * browser puts the whole address of the page, key of a gift's link included, in the `Referer` of every request
       * that page sends to its own site, and the visit count is one of them. Nothing in Viky reads that header.
       */
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin" },
          /**
           * Three more for every page (the audit of 1 Oct 2026). A file is what its type says and nothing a browser
           * guesses. No other site may draw Viky inside a frame of its own, which is how a press meant for one page is
           * taken by another: said twice, since older browsers read the first and newer ones the second. And the only
           * frame Viky itself draws is the card service's, off until its id is set (`SwapperSheet`).
           */
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; frame-src 'self' https://deposit.swapper.finance" },
        ],
      },
    ];
  },
  // The repository is the workspace root; a lockfile higher up the tree must not be picked up.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

// Next 16 builds with Turbopack, so the service worker is produced by Serwist's Turbopack
// integration (app/serwist/[path]/route.ts) instead of the template's webpack plugin.
export default withSerwist(nextConfig);
