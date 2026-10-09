// The judge code a link carries (the founder, 9 Oct 2026): the submission portal's instructions give a link to Viky
// whose address holds the code, and the pay sheet opens on it, already filled in.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JUDGE_CODE_PARAMETER, judgeCodeIn } from "../src/judge-link";

test("the code is read from the address's own parameter, and only what can be a code is kept", () => {
  assert.equal(JUDGE_CODE_PARAMETER, "code");
  assert.equal(judgeCodeIn("?code=MONAD-2026"), "MONAD-2026");
  assert.equal(judgeCodeIn("?trace=1&code=abc%2Bdef"), "abc+def", "as the address wrote it, decoded once");
  assert.equal(judgeCodeIn("?code=%20MONAD-2026%20"), "MONAD-2026", "the spaces around a pasted link's code are not part of it");
  // Nothing, an empty parameter, or something with a space in it: no code, and the field opens empty.
  assert.equal(judgeCodeIn(""), null);
  assert.equal(judgeCodeIn("?step=2"), null);
  assert.equal(judgeCodeIn("?code="), null);
  assert.equal(judgeCodeIn("?code=two%20words"), null);
  // Cut at the length the server reads, which is the route's own figure.
  assert.equal(judgeCodeIn(`?code=${"a".repeat(500)}`)?.length, 200);
  assert.match(readFileSync("app/api/judge/credit/route.ts", "utf8"), /body\.code\.slice\(0, 200\)/);
});

test("the code is kept for the tab on whichever page the link opens, and forgotten once it has given its credit", () => {
  const kept = readFileSync("src/client/judge-link.ts", "utf8");
  assert.match(kept, /const code = judgeCodeIn\(window\.location\.search\);\s+if \(code\) window\.sessionStorage\.setItem\(KEPT_AS, code\);/);
  // For this tab alone, and a browser that keeps nothing loses it without breaking the page.
  assert.doesNotMatch(kept, /localStorage|document\.cookie/);
  assert.equal((kept.match(/\} catch \{/g) ?? []).length, 3, "each of the three is guarded");
  // Read once, when the page arrives, by a component of the root layout that draws nothing.
  const link = readFileSync("app/kit/JudgeLink.tsx", "utf8");
  assert.match(link, /useEffect\(\(\) => \{\s+keepJudgeCodeFromTheAddress\(\);\s+\}, \[\]\);\s+return null;/);
  assert.match(readFileSync("app/layout.tsx", "utf8"), /<JudgeLink \/>/);
  // Nothing of it leaves with a visit count: the address is counted without its query (src/visit-counts.ts).
  assert.match(readFileSync("src/visit-counts.ts", "utf8"), /counted\.search = "";/);
  // The sheet forgets it at the credit, and never before: a code that was refused is still in the field's reach.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /onCredited=\{\(\) => \{\s+setCodeGiven\(shape\);\s+forgetJudgeCodeFromTheLink\(\);\s+setBalanceRead\(\(n\) => n \+ 1\);\s+\}\}/);
  assert.equal((sheet.match(/forgetJudgeCodeFromTheLink\(\)/g) ?? []).length, 1);
});
