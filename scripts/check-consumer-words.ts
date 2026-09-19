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
  // Since the product structure of 17 Sep 2026 the screens are built from the kit, their words live in one file and
  // what a condition is called lives in the register; the three destinations and the help page are surfaces too.
  "app/kit/**/*.tsx",
  "app/kit/**/*.ts",
  "app/gifts/**/*.tsx",
  "app/me/**/*.tsx",
  "app/help/**/*.tsx",
  "app/what-viky-can-check/**/*.tsx",
  "app/cash-out/**/*.tsx",
  "src/sentences.ts",
  "src/conditions.ts",
  "app/api/duolingo/profile/*.ts",
  "app/api/fund/**/*.ts",
  "app/api/send/**/*.ts",
  "app/api/gift/**/*.ts",
  "app/api/gifts/**/*.ts",
  "app/api/account/**/*.ts",
  "src/account/errors.ts",
  "src/gift-api.ts",
  "src/client/*.ts",
  "src/duolingo-public-checkin.ts",
  // The milestone gift (C2): the half of the register it adds, the refusals its routes and its reading send, and the
  // route that reads where someone stands before a gift is offered.
  "src/milestone-conditions.ts",
  "src/milestone-api.ts",
  "src/milestone-reading.ts",
  "src/milestone-routes.ts",
  "app/api/chess/**/*.ts",
  "app/api/conditions/**/*.ts",
];
// The judges page is the one place addresses and the words of the chain may appear, and these two components are only on it.
const EXCLUDED = new Set(["app/components/JudgesAccount.tsx", "app/components/MilestoneJudges.tsx"]);

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
