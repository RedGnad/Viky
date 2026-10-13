// The proof takes the link the screen asks for (the founder, 13 Oct 2026). The person pastes their certificate's link;
// the first reading took the code out of it, and the proof gave the whole link to readers that take the bare code. Six
// conditions answered "That is not a certificate link" to the link Viky had just read, after the person had agreed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ACCREDIBLE_GOAL_TYPE } from "../src/accredible-credential";
import { certificateCodeOf, lookByGoal } from "../src/certificate-reading";
import { COURSERA_GOAL_TYPE } from "../src/coursera-certificate";
import { CREDLY_GOAL_TYPE } from "../src/credly-badge";
import { EDX_GOAL_TYPE } from "../src/edx-certificate";
import { MARATHON_TIMERS } from "../src/marathon";
import { DET_MILESTONE } from "../src/milestone-conditions";
import { MITX_ONLINE_GOAL_TYPE } from "../src/mitx-online-certificate";
import { WCA_GOAL_TYPE } from "../src/wca";

const UUID = "01234567-89ab-cdef-0123-456789abcdef";
/** A whole link as a person copies it from each site, and the code its reader takes. None of them is anybody's. */
const PASTED: readonly Readonly<{ name: string; goal: number; link: string; code: string }>[] = [
  { name: "the Duolingo English Test", goal: DET_MILESTONE.goalType, link: "https://certs.duolingo.com/abcd1234", code: "abcd1234" },
  { name: "Coursera", goal: COURSERA_GOAL_TYPE, link: "https://www.coursera.org/account/accomplishments/verify/ABCDEFGH1234", code: "ABCDEFGH1234" },
  { name: "edX", goal: EDX_GOAL_TYPE, link: "https://courses.edx.org/certificates/0123456789abcdef0123456789abcdef", code: "0123456789abcdef0123456789abcdef" },
  { name: "MITx Online", goal: MITX_ONLINE_GOAL_TYPE, link: `https://mitxonline.mit.edu/certificate/${UUID}/`, code: UUID },
  { name: "Credly", goal: CREDLY_GOAL_TYPE, link: `https://www.credly.com/badges/${UUID}/public_url`, code: UUID },
  { name: "Accredible", goal: ACCREDIBLE_GOAL_TYPE, link: `https://www.credential.net/${UUID}`, code: UUID },
];

test("each of the six conditions takes the code out of the whole link, and a code alone as it is", () => {
  for (const pasted of PASTED) {
    assert.equal(certificateCodeOf(pasted.goal, pasted.link), pasted.code, pasted.name);
    assert.equal(certificateCodeOf(pasted.goal, pasted.code), pasted.code, `${pasted.name}, the code alone`);
    assert.equal(certificateCodeOf(pasted.goal, "not a link at all"), undefined, `${pasted.name}, something else`);
  }
  // A race and a WCA time have no link: their account is built from the gift's record, and is not touched.
  assert.equal(certificateCodeOf(WCA_GOAL_TYPE, "TestOpen2026/333|Ada Example"), "TestOpen2026/333|Ada Example");
  for (const timer of Object.values(MARATHON_TIMERS)) assert.equal(certificateCodeOf(timer.goalType, "1488071608761-442|marathon|900347"), "1488071608761-442|marathon|900347");
});

test("the real readers, given the whole link, ask the site for the code and never answer that it is not a link", async (t) => {
  const asked: string[] = [];
  const real = globalThis.fetch;
  // Every site is down: what is looked at is what was asked of it, and which refusal comes back.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input instanceof Request ? input.url : input));
    return new Response("down", { status: 503 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = real;
  });
  for (const pasted of PASTED) {
    asked.length = 0;
    const refusal = await lookByGoal(pasted.goal, pasted.link, undefined, null, 1_800_000_000).then(
      () => undefined,
      (error: unknown) => error as { code?: string },
    );
    assert.ok(refusal, `${pasted.name}: a site that is down gives no reading`);
    assert.notEqual(refusal.code, "INVALID_LINK", `${pasted.name}: the link the screen asks for is a link`);
    assert.ok(asked.length > 0 && asked[0].toLowerCase().includes(pasted.code.toLowerCase()), `${pasted.name}: the site was asked for the code, ${asked[0] ?? "nothing asked"}`);
    assert.ok(!asked[0].includes(encodeURIComponent(pasted.link)) && !asked[0].includes(`${pasted.link}/`), `${pasted.name}: never for the link inside a link`);
  }
  // Something that is no link is still refused as such, by the reader, before anything is asked.
  asked.length = 0;
  await assert.rejects(lookByGoal(COURSERA_GOAL_TYPE, "not a link at all", undefined, null, 1_800_000_000), (error: unknown) => (error as { code?: string }).code === "INVALID_LINK");
  assert.deepEqual(asked, []);
});

test("the proof's route gives what was pasted to the one door that takes the code out", () => {
  const route = readFileSync("app/api/gift/[id]/certificate/route.ts", "utf8");
  assert.match(route, /proveCertificate\(\{ giftId: id, link \}\)/);
  const reading = readFileSync("src/certificate-reading.ts", "utf8");
  assert.equal(reading.split("const link = certificateCodeOf(goalType, pasted) ?? pasted;").length - 1, 2, "the look and the attested read");
});
