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
 * Dakar 2023 on 26 Sep 2026 (bib 347), trimmed to what is read, with an invented runner.
 */
const ACCOUNT = "1488071608761-442|marathon|347";
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
  assert.equal(marathonAccount(MARATHON_RACES[0], " 347 "), ACCOUNT);
  assert.deepEqual(marathonAccountOf(ACCOUNT), { ref: "1488071608761-442", heat: "marathon", bib: "347" });
  assert.equal(marathonAccountOf("1488071608761-442|marathon|../x"), undefined);
  assert.ok(BREIZH_CHRONO_RUNNER.accepts(ACCOUNT) && !BREIZH_CHRONO_RUNNER.accepts("x|y|z"));
  assert.equal(BREIZH_CHRONO_RUNNER.url(ACCOUNT), "https://resultats.breizhchrono.com/bc/resultats/coureur.jsp?ref=1488071608761-442&heat=marathon&dossard=347");
  assert.ok(isValidBib("347") && isValidBib("1") && !isValidBib("A347") && !isValidBib("1234567"));
});

test("the two patterns read a runner's page: the name, the bib and the official time", () => {
  const result = marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Ada", "347", "02:30:05")));
  assert.equal(result.runner, "EXAMPLE Ada");
  assert.equal(result.bib, "347");
  assert.equal(result.finishSeconds, 2 * 3600 + 30 * 60 + 5);
  assert.equal(result.metric, DAY_SECONDS - result.finishSeconds);
  assert.equal(result.subject, marathonSubject("Ada Example", "dakar-2023"), "no case, no accents, no order");
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf(runnerPage("TINE Abdou", "347", "00:00:00"))), refused("NOT_FINISHED"), "a runner who did not finish");
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Ada", "348", "02:30:05"))), refused("ANOTHER_BIB"));
  assert.throws(() => marathonResultOf(ACCOUNT, valuesOf("")), refused("NO_RESULT"), "the empty page of a bib nobody wore");
  assert.throws(() => marathonResultOf("1488071608761-999|marathon|347", {}), refused("UNKNOWN_RACE"));
});

test("the name ties: capitals, accents and the order of the names do not matter; another name does", () => {
  assert.ok(sameRunner("FALL Mor", "Mor Fall"));
  assert.ok(sameRunner("NDIAYE Aïssatou", "aissatou ndiaye"));
  assert.ok(!sameRunner("FALL Mor", "Fall Moussa"));
  assert.ok(!sameRunner("", ""));
});

test("the time and the target: seconds under a day, finish is one, under X hours is that time's metric", () => {
  assert.equal(finishSecondsOf("02:30:05"), 9005);
  assert.equal(finishSecondsOf("00:00:00"), undefined);
  assert.equal(finishSecondsOf("2:30"), undefined);
  assert.equal(marathonTargetUnderHours(4), DAY_SECONDS - 4 * 3600);
  assert.ok(DAY_SECONDS - 9005 >= marathonTargetUnderHours(4), "2:30:05 is under 4 hours");
  assert.ok(DAY_SECONDS - 9005 < marathonTargetUnderHours(2.5), "and not under 2 h 30");
  assert.equal(marathonTargetInWords(MARATHON_FINISH), "finish the race");
  assert.equal(marathonTargetInWords(marathonTargetUnderHours(4.5)), "finish in under 4 h 30");
  assert.equal(finishInWords(9005), "2:30:05");
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
  const read = await readMarathonResult(ACCOUNT, answer(200, runnerPage("EXAMPLE Ada", "347", "03:59:59")));
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
  assert.ok(MARATHON_MILESTONE.validName("Mor Fall") && !MARATHON_MILESTONE.validName("Mor"));
  assert.equal(MARATHON_MILESTONE.course?.search?.races, true);
  assert.ok(proofOfCondition("marathon-finish"));
  assert.equal(privacyOf(LINE).kept, "fact");
  assert.equal(MARATHON_GOAL_TYPE, 30);
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 30 && goal.providerId === marathonProviderId()));
});

/**
 * The gift's page (D273, the screens): what the status carries for a marathon gift, to whom, and what the proof leaves
 * behind for the page to show. The records below are fakes; the state is a certificate gift as the contract reads it.
 */
import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { attestByGoal, proveCertificate, type CertificateReadingDeps } from "../src/certificate-reading";
import type { GiftRecord } from "../src/gift-store";
import { SHAPE_HAVE_OR_NOT, type MilestoneProofMessage } from "../src/milestone-protocol";
import type { MilestoneState } from "../src/milestone-reader";
import { milestoneStatusOf } from "../src/milestone-status";
import type { MilestoneReading, MilestoneRecord } from "../src/milestone-store";

const NOW = 1_790_000_000;
const RACE = MARATHON_RACES[0];
const RECIPIENT = "0x000000000000000000000000000000000000B0B0" as const;
const CONTRACT = "0x00000000000000000000000000000000000000e1" as const;
const RECORD = {
  giftId: "1000002",
  funder: "0x000000000000000000000000000000000000a11c",
  goalType: MARATHON_GOAL_TYPE,
  recipient: RECIPIENT,
  escrow: CONTRACT,
  goalUsername: "347",
  usernameSource: "recipient",
  boundAt: new Date((NOW - 3_600) * 1_000),
  recipientName: "Mor",
  funderName: "Sam",
} as unknown as GiftRecord;
const MILESTONE = { giftId: "1000002", conditionId: "marathon-finish", mode: "", standingAtOffer: 0, standingReadAt: new Date(0), portal: null, course: RACE.raceId } as MilestoneRecord;
const STATE = {
  giftId: "1000002",
  recipient: RECIPIENT,
  shape: SHAPE_HAVE_OR_NOT,
  goalType: MARATHON_GOAL_TYPE,
  subject: marathonSubject("Mor Fall", RACE.raceId),
  target: BigInt(MARATHON_FINISH),
  maximumStart: 0n,
  fundedAt: NOW - 86_400,
  claimedAt: NOW - 7_200,
  deadline: NOW + 30 * 86_400,
  settled: false,
  cancelled: false,
  earned: 0n,
  amount: 25_000_000n,
  startingValue: 0n,
  durationDays: 30,
  withdrawNonce: 0n,
  earnedBalance: 0n,
  withdrawnByRecipient: 0n,
  refundable: 0n,
  refundedToFunder: 0n,
  lastProofAt: 0,
  proofPaused: false,
} as unknown as MilestoneState;
const READ: MilestoneReading = {
  giftId: "1000002",
  purpose: "reach",
  attested: true,
  username: "FALL Mor",
  playerId: "347",
  rating: 9_005,
  ratedAt: null,
  rd: null,
  observedAt: NOW - 60,
  nullifier: `0x${"5f".repeat(32)}`,
  outcome: "reached",
  txHash: null,
  proofs: null,
} as unknown as MilestoneReading;

test("the status carries the race, whether the bib is still open, and the bib and the line to those who see the names", () => {
  const viewer = (over: Partial<{ isRecipient: boolean; isFunder: boolean; holdsTheLink: boolean }>) => ({ isRecipient: false, isFunder: false, holdsTheLink: false, ...over });
  const status = (who: ReturnType<typeof viewer>, latest: MilestoneReading | null = null, milestone: MilestoneRecord | null = MILESTONE) =>
    milestoneStatusOf({ record: RECORD, milestone, state: STATE, contract: CONTRACT, latest, last: latest, reachedAt: null, viewer: who, nowSeconds: NOW }).marathon;
  assert.equal(status(viewer({ isRecipient: true }), null, { ...MILESTONE, conditionId: "coursera-certificate" }), null, "nothing for any other condition");
  assert.equal(status(viewer({ isRecipient: true }), null, { ...MILESTONE, course: "no-such-race" }), null, "nothing for a race the register does not hold");
  const recipient = status(viewer({ isRecipient: true }), READ);
  assert.ok(recipient);
  assert.equal(recipient.raceName, RACE.name);
  assert.equal(recipient.bibOpen, false, "the 2023 race has started");
  assert.equal(recipient.bib, "347");
  assert.deepEqual(recipient.result, { runner: "FALL Mor", bib: "347", official: "2:30:05", finishSeconds: 9_005 });
  assert.equal(status(viewer({ isFunder: true }), READ)?.bib, "347", "the funder wrote the name and sees the bib");
  assert.equal(status(viewer({ holdsTheLink: true }), READ)?.result?.runner, "FALL Mor", "the link reads names, so it reads the line");
  const reader = status(viewer({}), READ);
  assert.ok(reader);
  assert.equal(reader.bib, null, "a reader without the link sees no bib");
  assert.equal(reader.result, null, "nor the line");
  assert.equal(status(viewer({ isRecipient: true }), { ...READ, rating: null })?.result, null, "a refused reading leaves no line");
});

test("the proof leaves the line read with the reading, and answers it, so the page can show the name, the bib and the time", async () => {
  const sent: MilestoneProofMessage[] = [];
  const recorded: Parameters<CertificateReadingDeps["record"]>[0][] = [];
  const deps: CertificateReadingDeps = {
    loadGift: async () => RECORD,
    readState: async () => STATE,
    attest: async () => ({
      subject: marathonSubject("Mor Fall", RACE.raceId),
      score: DAY_SECONDS - 9_005,
      testDay: NOW - 60,
      observedAt: NOW - 60,
      nullifier: `0x${"5f".repeat(32)}` as Hex,
      providerId: marathonProviderId(),
      line: { username: "FALL Mor", playerId: "347", rating: 9_005 },
    }),
    prove: async ({ message }) => {
      sent.push(message);
      return { hash: `0x${"ab".repeat(32)}` };
    },
    record: async (reading) => {
      recorded.push(reading);
    },
    now: () => NOW,
  };
  const outcome = await proveCertificate({ giftId: "1000002", link: ACCOUNT }, deps);
  assert.equal(outcome.kind, "reached");
  assert.deepEqual(outcome.kind === "reached" ? outcome.line : null, { runner: "FALL Mor", bib: "347", official: "2:30:05", finishSeconds: 9_005 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].metricValue, BigInt(DAY_SECONDS - 9_005), "the contract judges the seconds under a day, not the line");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].username, "FALL Mor");
  assert.equal(recorded[0].playerId, "347");
  assert.equal(recorded[0].rating, 9_005, "the finish time is what the page shows back, so it is what is kept");
  assert.equal(typeof attestByGoal, "function", "the rehearsal script runs the real reading through the same door");
});

test("the routes build the account from the gift's race and bound bib, never from the browser, and the bib closes at the start", () => {
  const gift = readFileSync("src/marathon-gift.ts", "utf8");
  assert.match(gift, /account: marathonAccount\(race, bib\)/);
  assert.match(gift, /const bib = gift\.boundAt && gift\.goalUsername \? String\(gift\.goalUsername\) : ""/);
  for (const route of ["result", "prove"]) {
    const source = readFileSync(`app/api/marathon/${route}/route.ts`, "utf8");
    assert.match(source, /marathonAccountOfGift\(String\(body\.giftId \?\? ""\), auth\.account\)/);
    assert.doesNotMatch(source, /body\.(bib|account|link|race)/, `the ${route} route takes nothing but the gift`);
  }
  const bib = readFileSync("app/api/marathon/bib/route.ts", "utf8");
  assert.match(bib, /if \(!bibStillOpen\(race, Date\.now\(\)\) && !isOperator\(auth\.account\)\) throw new GiftApiError\("RACE_STARTED"/);
  assert.match(bib, /if \(gift\.boundAt\) throw new GiftApiError\("BIB_ALREADY_SET"/, "a bib is entered once");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /if \(milestone\.conditionId === "marathon-finish"\) return <MarathonProof/);
  assert.match(page, /milestone\.marathon && read\.action !== "shareProof" \? <MarathonStanding/);
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(sheet, /certificate\.course\?\.search\?\.races \? \(/);
});
