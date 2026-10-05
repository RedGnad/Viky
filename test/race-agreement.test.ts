// The agreement of a race says what the gift's page shows the person who offered it (the founder, 5 Oct 2026). It said
// "whether it was finished" and no more, while the page showed the name printed on the result and the finish time. An
// agreement is the text a person signs: it is held here to what the reading takes and what the page draws.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { consentText, KEPT_AFTER } from "../src/consent";
import { consentTermsFor } from "../src/consent-terms";

test("the race's agreement names what is read: the line of the official results, with its name and its finish time", () => {
  const yours = consentTermsFor("marathon-finish", "yours");
  assert.ok(yours);
  assert.equal(yours.reads, "your line in the official results of the race named in this gift: the name on it, the bib, the distance and the finish time");
  assert.equal(yours.funderSees, "whether it was finished, and the line read: the name on it and the finish time");
  // Two things on the round button: whether it counted, and what was read.
  assert.equal(yours.things, 2);
  assert.equal(consentTermsFor("marathon-finish", "theirs")?.reads, "their line in the official results of the race named in this gift: the name on it, the bib, the distance and the finish time");
  // And the text a person signs carries both sentences, as it does for every condition.
  const signed = consentText("yes", { account: "0x1111111111111111111111111111111111111111", giftId: "1000042", terms: yours, until: "30 Oct 2026, the gift's last day", kept: KEPT_AFTER  });
  assert.match(signed, /Viky may read, for this gift and nothing else: your line in the official results/);
  assert.match(signed, /The person who offered it sees: whether it was finished, and the line read: the name on it and the finish time/);
});

test("what the agreement says the funder sees is what the page shows them, and no more", () => {
  // The reading takes the name printed, the bib and the official time (src/marathon-reading.ts).
  const reading = readFileSync("src/marathon-reading.ts", "utf8");
  assert.match(reading, /return \{ race, event, bib, runner, finishSeconds, official,/);
  // The status sends the line to the two people and the holder of the link, and to nobody else.
  const status = readFileSync("src/milestone-status.ts", "utf8");
  assert.match(status, /const result = seesNames && latest && latest\.rating !== null && latest\.playerId \? \{ runner: latest\.username, bib: latest\.playerId, official: finishInWords\(latest\.rating\), finishSeconds: latest\.rating \} : null;/);
  // The page draws the name and the finish time of that line: the two the agreement names.
  const page = readFileSync("app/kit/MarathonProof.tsx", "utf8");
  assert.match(page, /if \(marathon\.result\) return \[W\.lines\.read, W\.lines\.result\(marathon\.result\.runner, finishInWords\(marathon\.result\.finishSeconds\)\)\];/);
  // Nothing the old sentence promised and the page did not keep.
  assert.doesNotMatch(readFileSync("src/consent-terms.ts", "utf8"), /funderSees: "whether it was finished",/);
});

test("the note on the card service that delivers the other dollar coin says what has run, and no longer what had not", () => {
  const rails = readFileSync("src/rails.ts", "utf8");
  assert.doesNotMatch(rails, /No payment has run through it yet/);
  assert.match(rails, /The step that changes USDC into what a gift holds is deployed since 3 Oct 2026/);
  // The same amount and the same day as the README and docs/CONTRACTS.md say of that conversion.
  for (const file of ["README.md", "docs/CONTRACTS.md"]) assert.match(readFileSync(file, "utf8"), /7\.914524 AUSD/, file);
  assert.match(rails, /7\.914524 AUSD/);
});
