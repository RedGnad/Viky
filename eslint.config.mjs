import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Playwright's own output and the review captures are pictures and traces, never source: an interrupted browser run
  // left minified trace resources in test-results/ and the lint read them as ours (20 Sep 2026).
  globalIgnores([".next/**", "out/**", "cache/**", "lib/**", "public/**", "next-env.d.ts", "test-results/**", "review-captures/**"]),
]);
