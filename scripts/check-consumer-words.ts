import { globSync, readFileSync } from "node:fs";
import { scanSource } from "../src/consumer-words";

/**
 * CI guard: every consumer surface (screens, the messages our routes send to them, the account errors)
 * must be free of the words the user must never see. The judges page, the one place addresses may
 * appear, and the operator-only dev pages are excluded.
 */

const SURFACES = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/g/**/*.tsx",
  "app/privacy/**/*.tsx",
  "app/legal/**/*.tsx",
  "app/~offline/**/*.tsx",
  "app/fund/**/*.tsx",
  "app/components/*.tsx",
  "app/api/gift/**/*.ts",
  "app/api/gifts/**/*.ts",
  "app/api/account/**/*.ts",
  "src/account/errors.ts",
  "src/gift-api.ts",
  "src/client/*.ts",
  "src/duolingo-public-checkin.ts",
];
const EXCLUDED = new Set(["app/components/JudgesAccount.tsx"]);

const files = [...new Set(SURFACES.flatMap((pattern) => globSync(pattern)))].filter((file) => !EXCLUDED.has(file)).sort();
const findings = files.flatMap((file) => scanSource(file, readFileSync(file, "utf8")));
console.log(`consumer words: ${files.length} files scanned`);
for (const f of findings) console.log(`FORBIDDEN ${f.file}:${f.line}  "${f.text}"`);
if (findings.length > 0) {
  console.error(`${findings.length} forbidden word(s) in consumer text. Reword, or mark a justified line with "consumer-words: allow <reason>".`);
  process.exitCode = 1;
} else {
  console.log("no forbidden word in consumer text");
}
