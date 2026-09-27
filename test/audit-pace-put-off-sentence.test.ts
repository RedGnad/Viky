// A reading put off by the pace tells the person when to come back (the money path audit of 27 Sep 2026): the wait the
// reading service gave, never a fixed half hour, and never "Try again in a moment" on the proof's page.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { putOffSentence } from "../src/marathon-reading";

test("the sentence says the wait the service gave, and the day's ceiling as after midnight UTC", () => {
  assert.equal(putOffSentence("THROTTLED retry-after=1380: THROTTLED PAUSED_AFTER_429: race-result is read again in 23 minutes"), "The timing company is being read too often right now. Nothing was counted: try again in 23 minutes.");
  assert.equal(putOffSentence("THROTTLED retry-after=50000: THROTTLED DAILY_CEILING: race-result is read again in 834 minutes"), "The timing company is being read too often right now. Nothing was counted: try again after midnight UTC.");
  assert.equal(putOffSentence("THROTTLED retry-after=3: x"), "The timing company is being read too often right now. Nothing was counted: try again in 1 minute.");
  assert.equal(putOffSentence("THROTTLED: the source is being read too often"), "The timing company is being read too often right now. Nothing was counted: try again later.");
});

test("the wait travels from the service's answer, and the proof's page passes the sentence through", () => {
  assert.match(readFileSync(new URL("../src/attested-read.ts", import.meta.url), "utf8"), /retry-after=\$\{Math\.ceil\(body\.retryAfterSeconds\)\}/);
  const proof = readFileSync(new URL("../src/certificate-reading.ts", import.meta.url), "utf8");
  const through = proof.indexOf('error.message.startsWith("The timing company is being read too often")');
  assert.ok(through > 0 && through < proof.indexOf('case "INVALID_LINK":'), "passed through before the generic words");
});
