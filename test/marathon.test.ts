import assert from "node:assert/strict";
import test from "node:test";
import { BREIZH_CHRONO_RUNNER } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, conditionById, MARATHON_FINISH_LINE as LINE } from "../src/conditions";
import { bibStillOpen, DAY_SECONDS, finishInWords, finishSecondsOf, isValidBib, MARATHON_FINISH, MARATHON_GOAL_TYPE, MARATHON_RACES, marathonAccount, marathonAccountOf, marathonProviderId, marathonSubject, marathonTargetInWords, marathonTargetUnderHours, sameRunner } from "../src/marathon";
import { MarathonReadError, marathonResultOf, readMarathonResult } from "../src/marathon-reading";
import { certificateById, MARATHON_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";

/**
 * "Finish a marathon" (D273). The page below is a runner's own page on Breizh Chrono, measured on the Marathon de
 * Dakar 2023 on 26 Sep 2026, trimmed to what is read, with invented runners and a bib no race gives.
 */
const ACCOUNT = "1488071608761-442|marathon|900347";
function runnerPage(name: string, bib: string, official: string): string {
  return `<div class="col-12 col-md-6"> <div class=""> <h1 class="title pb-2 text-center" >${name} (N°${bib})</h1> </div>
<div class="col-6 col-md-2 text-center mx-2 d-flex flex-column justify-content-center"> <span class="timeTitle">Temps Officiel</span> <span class="timeValue">${official}</span> </div>
<span class="secondaryTime">Temps Réel</span> <span class="secondaryTime">${official}</span>`;
}
function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of BREIZH_CHRONO_RUNNER.matches) Object.assign(values, new RegExp(match.value).exec(page)?.groups ?? {});
  return values;
}
const refused = (code: string) => (error: unknown) => error instanceof MarathonReadError && error.code === code;

test("the account is the race's reference, its heat and the bib, and nothing else reads", () => {
  assert.equal(marathonAccount(MARATHON_RACES[0], " 900347 "), ACCOUNT);
  assert.deepEqual(marathonAccountOf(ACCOUNT), { ref: "1488071608761-442", heat: "marathon", bib: "900347" });
  assert.equal(marathonAccountOf("1488071608761-442|marathon|../x"), undefined);
  assert.ok(BREIZH_CHRONO_RUNNER.accepts(ACCOUNT) && !BREIZH_CHRONO_RUNNER.accepts("x|y|z"));
  assert.equal(BREIZH_CHRONO_RUNNER.url(ACCOUNT), "https://resultats.breizhchrono.com/bc/resultats/coureur.jsp?ref=1488071608761-442&heat=marathon&dossard=900347");
  assert.ok(isValidBib("900347") && isValidBib("1") && !isValidBib("A900347") && !isValidBib("1234567"));
});

test("the two patterns read a runner's page: the name, the bib and the official time", () => {
  const result = marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Ada", "900347", "02:47:19")));
  assert.equal(result.runner, "EXAMPLE Ada");
  assert.equal(result.bib, "900347");
  assert.equal(result.finishSeconds, 2 * 3600 + 47 * 60 + 19);
  assert.equal(result.metric, DAY_SECONDS - result.finishSeconds);
  assert.equal(result.subject, marathonSubject("Ada Example", "dakar-2023"), "no case, no accents, no order");
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Noor", "900347", "00:00:00"))), refused("NOT_FINISHED"), "a runner who did not finish");
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Ada", "900348", "02:47:19"))), refused("ANOTHER_BIB"));
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf("")), refused("NO_RESULT"), "the empty page of a bib nobody wore");
  assert.throws(() => marathonResultOf("1488071608761-999|marathon|900347", {}), refused("UNKNOWN_RACE"));
});

test("the name ties: capitals, accents and the order of the names do not matter; another name does", () => {
  assert.ok(sameRunner("MODELE Sam", "Sam Modele"));
  assert.ok(sameRunner("EXEMPLE Aïda", "aida exemple"));
  assert.ok(!sameRunner("MODELE Sam", "Modele Lou"));
  assert.ok(!sameRunner("", ""));
});

test("the time and the target: seconds under a day, finish is one, under X hours is that time's metric", () => {
  assert.equal(finishSecondsOf("02:47:19"), 10039);
  assert.equal(finishSecondsOf("00:00:00"), undefined);
  assert.equal(finishSecondsOf("2:30"), undefined);
  assert.equal(marathonTargetUnderHours(4), DAY_SECONDS - 4 * 3600);
  assert.ok(DAY_SECONDS - 10039 >= marathonTargetUnderHours(4), "2:47:19 is under 4 hours");
  assert.ok(DAY_SECONDS - 10039 < marathonTargetUnderHours(2.5), "and not under 2 h 30");
  assert.equal(marathonTargetInWords(MARATHON_FINISH), "finish the race");
  assert.equal(marathonTargetInWords(marathonTargetUnderHours(4.5)), "finish in under 4 h 30");
  assert.equal(finishInWords(10039), "2:47:19");
  assert.equal(MARATHON_MILESTONE.targetUnits?.(0), MARATHON_FINISH);
  assert.equal(MARATHON_MILESTONE.targetUnits?.(4), marathonTargetUnderHours(4));
  assert.ok(MARATHON_MILESTONE.validTarget(0) && MARATHON_MILESTONE.validTarget(4.5) && !MARATHON_MILESTONE.validTarget(24) && !MARATHON_MILESTONE.validTarget(-1));
});

test("the bib field closes at the race's start", () => {
  const race = MARATHON_RACES[0];
  assert.ok(bibStillOpen(race, new Date("2023-11-18T12:00:00Z").getTime()));
  assert.ok(!bibStillOpen(race, new Date("2023-11-19T00:00:00+01:00").getTime()));
  assert.ok(!bibStillOpen(race, Date.now()));
});

test("a plain read refuses by name when the page is not there", async () => {
  const answer = (status: number, body = "") => async () => new Response(body, { status });
  await assert.rejects(readMarathonResult(ACCOUNT, answer(200, "")), refused("NO_RESULT"));
  await assert.rejects(readMarathonResult(ACCOUNT, answer(503)), refused("FETCH_FAILED"));
  const read = await readMarathonResult(ACCOUNT, answer(200, runnerPage("EXAMPLE Ada", "900347", "03:59:59")));
  assert.equal(read.official, "03:59:59");
});

test("the line: read for them, Move, goal 30, being built, the fact rule, a name asked", () => {
  assert.equal(LINE.family, "move");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.live, false);
  assert.ok(BUILDING.includes(LINE));
  assert.ok(LINE.name.length <= 30);
  assert.equal(conditionById("marathon-finish"), LINE);
  assert.equal(certificateById("marathon-finish"), MARATHON_MILESTONE);
  assert.equal(MARATHON_MILESTONE.asksName, true);
  assert.ok(MARATHON_MILESTONE.validName("Sam Modele") && !MARATHON_MILESTONE.validName("Ibou"));
  assert.equal(MARATHON_MILESTONE.course?.search?.races, true);
  assert.ok(proofOfCondition("marathon-finish"));
  assert.equal(privacyOf(LINE).kept, "fact");
  assert.equal(MARATHON_GOAL_TYPE, 30);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 30 && goal.providerId === marathonProviderId()));
});
