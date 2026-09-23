process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EVIDENCE_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import { BUILDING, conditionById } from "../src/conditions";
import { proofOfCondition } from "../src/condition-proof";
import { VerificationError } from "../src/duolingo-verification";
import { certificateById, UDEMY_MILESTONE } from "../src/milestone-conditions";
import { milestoneGoal } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { shownConditionById, UDEMY_SHOWN } from "../src/shown-conditions";
import { verifyShownSession, type ShownVerificationDeps } from "../src/shown-verification";
import { isValidUdemySlug, readUdemyCourse, UDEMY_GOAL_TYPE, UDEMY_NOT_REGISTERED, UDEMY_PROVIDER, udemyProviderId, udemySlugOf, udemySubject } from "../src/udemy-shown";

/** A Udemy course finished, shown from the person's own account (D178): the course in the subject, the provider to come. */

function record(course: string | null) {
  return { giftId: "1000020", conditionId: "udemy-course-shown", mode: "certificate", standingAtOffer: 0, standingReadAt: new Date(0), portal: null, course };
}

test("one goal, pinned by name, and the course is what the funder signs", () => {
  assert.equal(UDEMY_GOAL_TYPE, 22);
  assert.equal(udemyProviderId(), keccak256(stringToHex("viky:provider:udemy-course-shown:v1")));
  assert.equal(udemyProviderId(), "0xf0da5b726f28cf4bc8bef5c1a8d7976a7d5a208e258b3ee9897e7ddd534e5fdd", "the id written in OPERATIONS for the owner to sign");
  assert.equal(milestoneGoal(22)?.providerId, udemyProviderId());
  assert.equal(milestoneGoal(22)?.shape, SHAPE_HAVE_OR_NOT);
  assert.equal(udemySubject("The-Complete-Python-Bootcamp "), udemySubject("the-complete-python-bootcamp"), "the same course however it was typed");
  assert.notEqual(udemySubject("a-course"), udemySubject("another-course"));
  assert.equal(UDEMY_MILESTONE.subject({ name: "", course: "a-course" }), udemySubject("a-course"));
  assert.equal(UDEMY_MILESTONE.goalType, 22);
  assert.equal(UDEMY_MILESTONE.asksName, false);
  assert.equal(UDEMY_SHOWN.subjectOf?.(record("a-course")), udemySubject("a-course"));
  assert.equal(UDEMY_SHOWN.subjectOf?.(record(null)), null, "a gift naming no course has no subject to sign against");
  assert.equal(UDEMY_SHOWN.condition.attestationProviderId, udemyProviderId());
  const condition = conditionById("udemy-course-shown");
  assert.equal(condition?.family, "course");
  assert.equal(condition?.nature, "shown");
  assert.equal(condition?.live, false);
  assert.ok(BUILDING.includes(condition as never));
  assert.ok(proofOfCondition("udemy-course-shown"));
});

test("the course is the word in its link, and nothing else is a course", () => {
  for (const [pasted, slug] of [
    ["https://www.udemy.com/course/the-complete-python-bootcamp/", "the-complete-python-bootcamp"],
    ["udemy.com/course/The-Complete-Python-Bootcamp/learn/lecture/123", "the-complete-python-bootcamp"],
    ["https://www.udemy.com/course/docker-mastery/?couponCode=X", "docker-mastery"],
    ["docker-mastery", "docker-mastery"],
  ] as const) {
    assert.equal(udemySlugOf(pasted), slug, pasted);
  }
  for (const bad of ["", "https://www.coursera.org/learn/python", "https://www.udemy.com/", "https://www.udemy.com/certificate/UC-1234/", "not a slug!", "a".repeat(121)]) {
    assert.equal(udemySlugOf(bad), undefined, bad);
  }
  assert.ok(isValidUdemySlug("a-b-1") && !isValidUdemySlug("-a") && !isValidUdemySlug("A"));
  assert.equal(UDEMY_MILESTONE.course?.slugOf("https://www.udemy.com/course/docker-mastery/"), "docker-mastery");
  assert.match(UDEMY_MILESTONE.course?.named("docker-mastery") ?? "", /docker-mastery/);
});

test("the reading says finished, or why not, for the gift's course alone", () => {
  assert.deepEqual(readUdemyCourse({ courseSlug: "docker-mastery", completed: "100" }, "docker-mastery"), { kind: "read", metricValue: 1, inWords: "Finished" });
  assert.deepEqual(readUdemyCourse({ courseSlug: "Docker-Mastery", completed: "true" }, "docker-mastery"), { kind: "read", metricValue: 1, inWords: "Finished" });
  const other = readUdemyCourse({ courseSlug: "another", completed: "100" }, "docker-mastery");
  assert.equal(other.kind === "refused" && other.code, "OTHER_COURSE");
  const notYet = readUdemyCourse({ courseSlug: "docker-mastery", completed: "62" }, "docker-mastery");
  assert.equal(notYet.kind === "refused" && notYet.code, "NOT_FINISHED");
  const nothing = readUdemyCourse({}, "docker-mastery");
  assert.equal(nothing.kind === "refused" && nothing.code, "OTHER_COURSE");
  assert.ok(UDEMY_MILESTONE.validTarget(1) && !UDEMY_MILESTONE.validTarget(2));
});

test("no provider is registered tonight, and the line says so by name before anything is fetched", async () => {
  assert.equal(UDEMY_PROVIDER, null);
  assert.equal(UDEMY_SHOWN.notRegistered, UDEMY_NOT_REGISTERED);
  assert.equal(certificateById("udemy-course-shown")?.notOpen, UDEMY_NOT_REGISTERED);
  assert.equal(await UDEMY_SHOWN.providerOf?.(record("docker-mastery")), null, "no provider, nothing to read with");
  assert.equal(shownConditionById("udemy-course-shown"), UDEMY_SHOWN);
  let fetched = false;
  const deps = {
    loadSession: async () => ({ sessionId: "session_12345678", account: "0x000000000000000000000000000000000000a11c", giftId: "1000020", goalType: 22, conditionId: "udemy-course-shown", phase: "reach" as const, dayIndex: 0 }),
    loadLatestEvidence: async () => null,
    consumeAndSaveVerification: async () => true,
    consumeShownSession: async () => true,
    fetchStatus: async () => {
      fetched = true;
      return { session: undefined } as never;
    },
    verifyProofs: async () => ({ isVerified: true, isTeeAttestationVerified: true, data: [] }),
    signCheckIn: async () => "0x" as Hex,
    prove: async () => ({ hash: `0x${"ab".repeat(32)}` as Hex, happened: "reached" as const }),
    record: async () => undefined,
    milestoneRecordOf: async () => record("docker-mastery"),
    milestoneOf: async () => null,
    appId: "0x15678cD04e54ccc2bC1c24cb455be3C60Eb11ADf",
    escrowAddress: "0x00000000000000000000000000000000000000E5" as Hex,
    now: () => 1_784_000_100,
  } as unknown as ShownVerificationDeps;
  await assert.rejects(
    verifyShownSession(deps, { sessionId: "session_12345678", account: "0x000000000000000000000000000000000000a11c" }),
    (error: unknown) => error instanceof VerificationError && error.code === "NOT_CONFIGURED" && error.message === UDEMY_NOT_REGISTERED,
  );
  assert.equal(fetched, false);
});
