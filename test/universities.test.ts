import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById } from "../src/conditions";
import { HOME } from "../src/sentences";
import { CERTIFICATE_LINES, NAMED_ON_THE_LANDING, UNIVERSITIES, certificateLinesLive, certificatePlatforms, namesInWords, pickUniversities } from "../src/universities";

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
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(home, /\{universities\.length > 0 \? \(/, "and the page prints nothing then");
});

test("every school named has its page on the platform Viky reads, and MIT waits for its own line", () => {
  assert.equal(UNIVERSITIES.length, 12);
  assert.equal(new Set(UNIVERSITIES.map((school) => school.name)).size, 12, "no name twice");
  for (const school of UNIVERSITIES) {
    const host = school.platform === "edx" ? "https://www.edx.org/school/" : "https://www.coursera.org/partners/";
    assert.ok(school.page.startsWith(host), `${school.name} is named on its platform's own page: ${school.page}`);
  }
  // MIT's courses are on MITx Online, whose line is being wired (D222) and is not live: not named until it is.
  assert.ok(!UNIVERSITIES.some((school) => /\bMIT\b/.test(school.name)), "MIT is not named");
  assert.equal(conditionById("mitx-online-certificate")?.live, false);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["check:universities"], "tsx scripts/check-universities.ts", "the pages are checked by a script that fails when one is gone");
});

test("four distinct names, by the random the server gives, and said as a list", () => {
  const steps = [0.99, 0, 0.5, 0.5];
  let at = 0;
  const picked = pickUniversities(() => steps[at++ % steps.length]);
  assert.equal(picked.length, NAMED_ON_THE_LANDING);
  assert.equal(new Set(picked).size, 4, "distinct");
  assert.deepEqual(picked, ["ETH Zürich", "Harvard", "Imperial", "Princeton"], "in the order they were drawn: nothing sorts them into a rank");
  assert.equal(namesInWords(picked), "ETH Zürich, Harvard, Imperial or Princeton");
  assert.equal(namesInWords(["Harvard"]), "Harvard");
  assert.equal(namesInWords([]), "");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /universities=\{pickUniversities\(\)\}/, "picked by the server, once per request");
});

test("text only, no partnership claimed, the affiliation said, and nothing moves", () => {
  const read = HOME.certificate.read(certificatePlatforms());
  const words = `${HOME.certificate.before} ${HOME.certificate.after} ${read}`;
  assert.doesNotMatch(words, /partner|trusted|as seen|official|endorse/i, "the universities' trademark rules");
  assert.match(read, /not affiliated/);
  assert.equal(certificatePlatforms(), "edX or Coursera", "the platforms as the register names them: no screen names a source itself");
  assert.equal(read, "Read from the certificate's own page on edX or Coursera. Viky is not affiliated with these universities.");
  assert.equal(HOME.certificate.before, "A verified certificate from a course by");
  assert.equal(HOME.certificate.after, "can be what their gift waits for.");
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(home, /<span className=\{NAMED\}>\{namesInWords\(universities\)\}<\/span>/, "the names in the title face and the ink");
  assert.doesNotMatch(home.slice(home.indexOf("{universities.length > 0"), home.indexOf('<Link href="/what-viky-can-check"')), /animate|setInterval|setTimeout|transition/, "no fade, no clock");
  assert.doesNotMatch(readFileSync("src/universities.ts", "utf8"), /\.svg|\.png|\.jpe?g|<img/i, "no logo, no crest: names only");
  const claims = readFileSync("docs/SCREEN-CLAIMS.md", "utf8");
  assert.match(claims, /A verified certificate from a course by .* can be what their gift waits for/, "the sentence is in the claims, with what makes it true");
});
