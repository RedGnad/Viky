import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById } from "../src/conditions";
import { HOME } from "../src/sentences";
import { CERTIFICATE_LINES, UNIVERSITIES, certificateLinesLive, certificatePlatforms, pickUniversities } from "../src/universities";

/**
 * The schools named at the foot of the landing (D225): the sentence is true of the code, the names are on the
 * platforms Viky reads, the pick is the server's, and the universities' trademark rules are kept.
 */

test("the sentence stands on two live lines that read the certificate's own page, and falls silent without them", () => {
  for (const [platform, id] of Object.entries(CERTIFICATE_LINES)) {
    const line = conditionById(id);
    assert.ok(line?.live, `${platform}: ${id} is live`);
    assert.match(line!.help, /certificate's public page/i, `${id} reads the certificate's own page`);
  }
  assert.equal(certificateLinesLive(), true);
  const source = readFileSync("src/universities.ts", "utf8");
  assert.match(source, /if \(!certificateLinesLive\(\)\) return \[\];/, "no line live, no name printed");
  // And the sentence under the card prints nothing when it has nothing to say (D285).
  assert.match(readFileSync("app/kit/GoalsGoingBy.tsx", "utf8"), /if \(!first\) return null;/);
});

test("every school named has its page on the platform Viky reads, and MIT waits for its own line", () => {
  assert.equal(UNIVERSITIES.length, 12);
  assert.equal(new Set(UNIVERSITIES.map((school) => school.name)).size, 12, "no name twice");
  for (const school of UNIVERSITIES) {
    const host = school.platform === "edx" ? "https://www.edx.org/school/" : "https://www.coursera.org/partners/";
    assert.ok(school.page.startsWith(host), `${school.name} is named on its platform's own page: ${school.page}`);
  }
  // MIT's courses are on MITx Online, its own line (D222), not on Coursera or edX: this list names the schools of
  // those two platforms by their pages there, so MIT is not in it.
  assert.ok(!UNIVERSITIES.some((school) => /\bMIT\b/.test(school.name)), "MIT is not named");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["check:universities"], "tsx scripts/check-universities.ts", "the pages are checked by a script that fails when one is gone");
});

test("every school, distinct, in the order the server's random draws them", () => {
  const steps = [0.99, 0, 0.5, 0.5];
  let at = 0;
  const picked = pickUniversities(() => steps[at++ % steps.length]);
  assert.equal(picked.length, UNIVERSITIES.length);
  assert.equal(new Set(picked).size, UNIVERSITIES.length, "distinct");
  assert.deepEqual(picked.slice(0, 4), ["ETH Zürich", "Harvard", "Imperial", "Princeton"], "in the order they were drawn: nothing sorts them into a rank");
  assert.equal(pickUniversities(Math.random, 2).length, 2);
});

test("the schools are named as text only, no partnership claimed, the affiliation said", () => {
  const read = HOME.waitsFor.read;
  assert.doesNotMatch(`${HOME.waitsFor.lead} ${read}`, /partner|trusted|as seen|official|endorse/i, "the universities' trademark rules");
  assert.match(read, /not affiliated with the schools/);
  assert.equal(certificatePlatforms(), "edX or Coursera", "the platforms as the register names them: no screen names a source itself");
  assert.doesNotMatch(readFileSync("src/universities.ts", "utf8"), /\.svg|\.png|\.jpe?g|<img/i, "no logo, no crest: names only");
});
