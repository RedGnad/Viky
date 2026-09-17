import assert from "node:assert/strict";
import test from "node:test";
import type { AttestedReadDeps } from "../src/attested-read";
import { duolingoCourseSource } from "../src/attested-sources";
import { CourseReadError, readDuolingoCourse } from "../src/duolingo-course-reading";
import { parsePublicDuolingoProfile } from "../src/duolingo-profile";
import { checkInSubject, duolingoCourseXpPattern, DUOLINGO_COURSE_PROVIDER_ID, DUOLINGO_PUBLIC_PROVIDER_ID, isDuolingoCourseId } from "../src/duolingo-public-terms";
import type { ZkFetchProof } from "../src/duolingo-public";

/**
 * A day counted on one course, not on the experience total (U1).
 *
 * The page is the public profile Viky already reads. What changed is the pattern: it is anchored on one course's id and
 * stopped by the end of that course's object, so experience won in another course is not in the reading at all. The
 * bodies below are the real answers, read on 18 Sep 2026.
 */

const ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";

/** Two courses of the shape measured that day: the keys of a course object come in one order on every profile read. */
const COURSES =
  '"courses":[{"authorId":"duolingo","fromLanguage":"en","healthEnabled":true,"id":"DUOLINGO_FR_EN","learningLanguage":"fr","placementTestAvailable":false,"preload":false,"title":"French","xp":76886,"crowns":9999},' +
  '{"authorId":"duolingo","fromLanguage":"en","healthEnabled":true,"id":"DUOLINGO_JA_EN","learningLanguage":"ja","placementTestAvailable":false,"preload":false,"title":"Japanese","xp":4028,"crowns":51}]';
const PAGE = `{"users":[{"id":14,"username":"Luis","name":"Luis","streak":3946,${COURSES},"currentCourseId":"DUOLINGO_FR_EN","totalXp":80914}]}`;

function proofOf(source: { url: (account: string) => string; matches: readonly { type: string; value: string }[] }, account: string, extracted: Record<string, string>): ZkFetchProof {
  return {
    claimData: {
      provider: "http",
      parameters: JSON.stringify({ url: source.url(account), method: "GET", headers: { accept: "application/json" }, body: "", responseMatches: source.matches }),
      context: JSON.stringify({ extractedParameters: extracted, providerHash: "0xb78a" }),
      identifier: `0x${"d2".repeat(32)}`,
      timestampS: 1_789_700_000,
    },
    signatures: ["0x00"],
    witnesses: [{ id: ATTESTOR, url: "wss://attestor.reclaimprotocol.org:444/ws" }],
  };
}

/** An attestor that reads the real page with the source's own patterns, and refuses what they do not find. */
function reading(page: string): AttestedReadDeps {
  return {
    zkFetch: async (source, account) => {
      const extracted: Record<string, string> = {};
      for (const match of source.matches) {
        const found = new RegExp(match.value).exec(page);
        if (!found) throw new Error(`Regex "${match.value}" didn't match`);
        for (const [name, value] of Object.entries(found.groups ?? {})) extracted[name] = String(value);
      }
      return proofOf(source, account, extracted);
    },
    verify: async () => true,
    attestors: [ATTESTOR],
  };
}

test("the pattern reads the course it names and no other, on the page as Duolingo answers it", () => {
  assert.equal(new RegExp(duolingoCourseXpPattern("DUOLINGO_FR_EN")).exec(PAGE)?.groups?.courseXp, "76886");
  assert.equal(new RegExp(duolingoCourseXpPattern("DUOLINGO_JA_EN")).exec(PAGE)?.groups?.courseXp, "4028");
  assert.equal(new RegExp(duolingoCourseXpPattern("DUOLINGO_ES_EN")).test(PAGE), false, "a course the profile does not carry finds nothing");
  // Measured on 19 public profiles on 18 Sep 2026: the sum of the courses is the total the profile prints.
  assert.equal(76886 + 4028, JSON.parse(PAGE).users[0].totalXp);
});

test("experience won in the course counts, experience won elsewhere does not", async () => {
  const before = await readDuolingoCourse({ username: "Luis", courseId: "DUOLINGO_FR_EN" }, reading(PAGE));
  assert.equal(before.courseXp, 76886);
  assert.equal(before.profileId, "14");
  assert.equal(before.displayName, "Luis");

  // A day of Japanese: the total moves by 30, the French course does not move at all.
  const afterJapanese = PAGE.replace('"title":"Japanese","xp":4028', '"title":"Japanese","xp":4058').replace('"totalXp":80914', '"totalXp":80944');
  const french = await readDuolingoCourse({ username: "Luis", courseId: "DUOLINGO_FR_EN" }, reading(afterJapanese));
  assert.equal(french.courseXp, 76886, "nothing was earned in the course this gift is about");
  const japanese = await readDuolingoCourse({ username: "Luis", courseId: "DUOLINGO_JA_EN" }, reading(afterJapanese));
  assert.equal(japanese.courseXp, 4058, "and the course that moved is read as having moved");
});

test("a course the profile does not carry is its own refusal, and says nothing about the account", async () => {
  await assert.rejects(
    readDuolingoCourse({ username: "Luis", courseId: "DUOLINGO_ES_EN" }, reading(PAGE)),
    (error: unknown) => error instanceof CourseReadError && error.code === "NO_SUCH_COURSE",
  );
  // A username nobody has answers `{"users":[]}`: every pattern misses, and that is the profile missing, not a course.
  await assert.rejects(
    readDuolingoCourse({ username: "nobody", courseId: "DUOLINGO_FR_EN" }, reading('{"users":[]}')),
    (error: unknown) => error instanceof CourseReadError && error.code === "PROFILE_NOT_FOUND",
  );
  await assert.rejects(
    readDuolingoCourse({ username: "Luis", courseId: "not a course" }, reading(PAGE)),
    (error: unknown) => error instanceof CourseReadError && error.code === "NOT_CONFIGURED",
  );
});

test("a course gift and a gift on the whole profile can never be mistaken for each other, on the chain", () => {
  const whole = checkInSubject("14", null);
  const french = checkInSubject("14", "DUOLINGO_FR_EN");
  const japanese = checkInSubject("14", "DUOLINGO_JA_EN");
  // Gifts made before U1 keep exactly the provider and the identity they have always had.
  assert.equal(whole.providerId, DUOLINGO_PUBLIC_PROVIDER_ID);
  assert.equal(whole.identity, "14");
  // A course gift carries the goal 5 provider, which the contract checks against the gift's goal, and an identity of
  // its own, which the contract pins at the first reading and refuses to see change.
  assert.equal(french.providerId, DUOLINGO_COURSE_PROVIDER_ID);
  assert.equal(DUOLINGO_COURSE_PROVIDER_ID, "0x8f940d06b0eb5122941908713583a1aef4c026ab396ce91c93348d460cf89629", "registered on the escrow as goal 5 on 18 Sep 2026");
  assert.notEqual(french.identity, whole.identity);
  assert.notEqual(french.identity, japanese.identity);
});

test("only a course id Duolingo could have ever reaches a pattern or a URL", () => {
  for (const id of ["DUOLINGO_FR_EN", "DUOLINGO_NL-NL_EN", "DUOLINGO_ZH-CN_RO", "DUOLINGO_KO_PT"]) assert.equal(isDuolingoCourseId(id), true, id);
  for (const id of ["", "duolingo_fr_en", "DUOLINGO_FR", "DUOLINGO_FR_EN.", "DUOLINGO_FR_EN\\d", "../../secret", 'x","xp":(?<courseXp>1']) {
    assert.equal(isDuolingoCourseId(id), false, id);
    assert.equal(duolingoCourseSource(id), undefined, id);
  }
  const source = duolingoCourseSource("DUOLINGO_FR_EN");
  assert.equal(source?.id, "duolingo-course-DUOLINGO_FR_EN");
  assert.equal(source?.url("Luis"), "https://www.duolingo.com/2017-06-30/users?username=Luis");
});

test("the courses a profile carries are read for the funder, with the one Duolingo says is current", () => {
  const profile = parsePublicDuolingoProfile(JSON.parse(PAGE), "Luis");
  assert.deepEqual(profile.courses, [
    { id: "DUOLINGO_FR_EN", title: "French", xp: 76886 },
    { id: "DUOLINGO_JA_EN", title: "Japanese", xp: 4028 },
  ]);
  assert.equal(profile.currentCourseId, "DUOLINGO_FR_EN");
  // A profile with nothing readable in its courses is a profile with no course to choose, not a wrong one.
  const odd = parsePublicDuolingoProfile({ users: [{ id: 14, username: "Luis", courses: [{ id: "NOPE", title: "", xp: "x" }] }] }, "Luis");
  assert.deepEqual(odd.courses, []);
  assert.equal(odd.currentCourseId, null);
});
