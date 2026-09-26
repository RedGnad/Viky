import assert from "node:assert/strict";
import test from "node:test";
import { BREIZH_CHRONO_RUNNER } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { CONDITIONS, conditionById, MARATHON_FINISH_LINE as LINE } from "../src/conditions";
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
  assert.equal(marathonAccount(MARATHON_RACES[0], MARATHON_RACES[0].events[0], " 347 "), ACCOUNT);
  assert.deepEqual(marathonAccountOf(ACCOUNT), { ref: "1488071608761-442", heat: "marathon", bib: "347" });
  assert.equal(marathonAccountOf("1488071608761-442|marathon|../x"), undefined);
  assert.ok(BREIZH_CHRONO_RUNNER.accepts(ACCOUNT) && !BREIZH_CHRONO_RUNNER.accepts("x|y|z"));
  assert.equal(BREIZH_CHRONO_RUNNER.url(ACCOUNT), "https://resultats.breizhchrono.com/bc/resultats/coureur.jsp?ref=1488071608761-442&heat=marathon&dossard=347");
  assert.ok(isValidBib("347", "breizh-chrono") && isValidBib("1", "breizh-chrono") && !isValidBib("A347", "breizh-chrono") && !isValidBib("1234567", "breizh-chrono"));
  // MikaTiming prints a letter or two before some bibs ("F3166", the women's bibs at Frankfurt).
  assert.ok(isValidBib("F3166", "mika-timing") && isValidBib("f3166") && isValidBib("21735") && !isValidBib("FFF1") && !isValidBib("3166F"));
});

test("the two patterns read a runner's page: the name, the bib and the official time", () => {
  const result = marathonResultOf(ACCOUNT, valuesOf(runnerPage("EXAMPLE Ada", "347", "02:30:05")));
  assert.equal(result.runner, "EXAMPLE Ada");
  assert.equal(result.bib, "347");
  assert.equal(result.finishSeconds, 2 * 3600 + 30 * 60 + 5);
  assert.equal(result.metric, DAY_SECONDS - result.finishSeconds);
  assert.equal(result.subject, marathonSubject("Ada Example", "dakar-2023/marathon"), "no case, no accents, no order");
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

test("the line: read for them, Move, goal 30, open, the fact rule, a name asked", () => {
  assert.equal(LINE.family, "move");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.live, true);
  assert.ok(CONDITIONS.includes(LINE));
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
const MILESTONE = { giftId: "1000002", conditionId: "marathon-finish", mode: "", standingAtOffer: 0, standingReadAt: new Date(0), portal: null, course: `${RACE.raceId}/marathon` } as MilestoneRecord;
const STATE = {
  giftId: "1000002",
  recipient: RECIPIENT,
  shape: SHAPE_HAVE_OR_NOT,
  goalType: MARATHON_GOAL_TYPE,
  subject: marathonSubject("Mor Fall", `${RACE.raceId}/marathon`),
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
      subject: marathonSubject("Mor Fall", `${RACE.raceId}/marathon`),
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
  assert.match(gift, /account: marathonAccount\(race, event, bib\)/);
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

/**
 * The register of races (the founder, 27 Sep 2026): the coming races with a marathon, a half or a 10 km, the
 * distance chosen at creation, a race already run offered to nobody but an operator's account.
 */
import { DISTANCE_LABELS, heatSlugOf, marathonCourseId, marathonEventById, marathonGoalTypeOf, marathonProviderIdOf, MIKA_TIMING_GOAL_TYPE, MIKA_TIMING_HOSTS, MIKA_TIMING_OPEN, mikaAccountOf, mikaRunnerName, RACE_RESULT_OPEN, raceResultAccountOf, racesOffered } from "../src/marathon";
import { RACE_RESULT_ROW } from "../src/attested-sources";
import { raceResultAccount, RaceResultError, raceResultRows, raceResultSeconds, readRaceResultConfig, readRaceResultRow } from "../src/race-result";
import { matchesOf, MIKA_TIMING_RUNNER } from "../src/attested-sources";
import { mikaDetailAccount, mikaEventMatches, mikaRowsOf, mikaRunnerIdOf, mikaSearchUrl, mikaValuesOf } from "../src/mika-timing";
import { certificateOfGoal } from "../src/milestone-conditions";
import { attestMarathonResult, mikaRunnerAccount } from "../src/marathon-reading";

test("the heat's key on the results site follows from its name: measured on forty heats of eight past events", () => {
  const measured: [string, string][] = [
    ["Le S'MI Ouest-France", "le-smi-ouest-france"],
    ["L'Eau du Bassin Rennais - Poussins", "leau-du-bassin-rennais---poussins"],
    ["Le 5km - Chronométré", "le-5km---chronometre"],
    ["Marathon en relais à 2", "marathon-en-relais-a-2"],
    ["10 KM", "10-km"],
    ["Semi-Marathon", "semi-marathon"],
    ["Course Groupe QUEGUINER", "course-groupe-queguiner"],
    ["10km McDo", "10km-mcdo"],
    ["La Course Féminine Yves Rocher", "la-course-feminine-yves-rocher"],
    ["Le Marathon Vert Rennes", "le-marathon-vert-rennes"],
  ];
  for (const [label, heat] of measured) assert.equal(heatSlugOf(label), heat, label);
  for (const race of MARATHON_RACES) {
    if (race.timer !== "breizh-chrono") continue;
    for (const one of race.events) assert.equal(one.heat, heatSlugOf(one.label), `${race.raceId} ${one.label}`);
  }
});

test("the register: one id per race, a date that reads, a heat per distance, and the reference the results site keys on", () => {
  const ids = MARATHON_RACES.map((race) => race.raceId);
  assert.equal(new Set(ids).size, ids.length);
  for (const race of MARATHON_RACES) {
    if (race.timer === "breizh-chrono") assert.match(race.ref, /^\d{10,16}-\d{1,6}$/, race.raceId);
    else if (race.timer === "race-result") {
      // A race result reference is the event's id; its heats are contests by id; its list and columns are written.
      assert.match(race.ref, /^\d{4,8}$/, race.raceId);
      assert.ok(race.raceResult, `${race.raceId} names its list`);
      assert.ok(race.raceResult!.columns.name > 0 && race.raceResult!.columns.time > race.raceResult!.columns.name, `${race.raceId}: the bib first, then the name, then the time`);
      assert.ok(race.raceResult!.fields.name.length > 0 && race.raceResult!.fields.time.length > 0);
      for (const one of race.events) assert.match(one.heat, /^\d{1,3}$/, `${race.raceId} ${one.label}`);
    } else {
      // A MikaTiming reference is one of the sites the source accepts and the race's year; its one heat is the event code's start.
      const [host, year] = race.ref.split("/");
      assert.ok(MIKA_TIMING_HOSTS.includes(host) && /^20\d\d$/.test(year), race.raceId);
      assert.equal(race.events.length, 1);
      assert.match(race.events[0].heat, /^[A-Z][A-Z0-9_]{0,12}$/);
      assert.equal(new Date(race.startsAt).getUTCFullYear(), Number(year), `${race.raceId} is dated in its year`);
    }
    assert.ok(Number.isFinite(new Date(race.startsAt).getTime()), `${race.raceId} has a date`);
    assert.ok(race.events.length >= 1 && race.events.length <= 3);
    assert.equal(new Set(race.events.map((one) => one.distance)).size, race.events.length, `${race.raceId}: one heat per distance`);
    for (const one of race.events) assert.ok(one.distance in DISTANCE_LABELS);
    assert.ok(race.town.length > 0 && /^[A-Z]{2}$/.test(race.country));
  }
  const found = marathonEventById("dakar-2023/half");
  assert.equal(found?.event.heat, "semi-marathon");
  assert.equal(marathonCourseId(found!.race, found!.event), "dakar-2023/half");
  assert.equal(marathonEventById("dakar-2023"), undefined, "a race alone is not a course");
  assert.equal(marathonEventById("dakar-2023/5k"), undefined);
  assert.equal(marathonEventById("nowhere-2026/marathon"), undefined);
});

test("a race already run is offered to nobody but an operator's account, and a coming one to everybody until it starts", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  const everybody = racesOffered(now, false).map((race) => race.raceId);
  assert.ok(!everybody.includes("dakar-2023"), "the test race is not offered");
  assert.ok(!everybody.includes("tout-rennes-court-2026"), "a race started the day before is not offered");
  assert.ok(everybody.includes("marathon-vert-rennes-2026") && everybody.includes("marathon-deauville-2026"));
  const operator = racesOffered(now, true).map((race) => race.raceId);
  assert.ok(operator.includes("dakar-2023") && !operator.includes("tout-rennes-court-2026"), "the operator sees the test race, and no other race already run");
  const refuses = MARATHON_MILESTONE.course?.refuses;
  assert.ok(refuses);
  assert.equal(refuses("dakar-2023/marathon", false)?.code, "RACE_RUN");
  assert.equal(refuses("dakar-2023/marathon", true), undefined);
  assert.equal(refuses("nowhere/marathon", true)?.code, "UNKNOWN_RACE");
  assert.equal(MARATHON_MILESTONE.course?.slugOf("dakar-2023/marathon"), "dakar-2023/marathon");
  assert.equal(MARATHON_MILESTONE.course?.slugOf("dakar-2023"), undefined);
  assert.match(readFileSync("app/api/gift/certificate/create/route.ts", "utf8"), /certificate\.course\.refuses\(course, isOperator\(account\)\)/);
  assert.match(readFileSync("app/api/marathon/races/route.ts", "utf8"), /racesOffered\(Date\.now\(\), operator\)/);
});

/**
 * MikaTiming, the second timing company (the founder, 27 Sep 2026), measured on 26 Sep 2026 at Frankfurt 2025 (bib
 * 3166, and its lettered twin F3166), Chicago 2025, Berlin 2025 and Boston 2026. The pages below are those, trimmed
 * to what is read.
 */
const MIKA_SEARCH = `<ul class="list-group list-group-multicolumn"><li class=" list-group row list-group-item list-group-header "><div>Place</div></li>
<li class=" list-active event-L_HCH3BKLB3B8 list-group-item row"> <div class="row"> <h4 class=" list-field type-fullname"><a href="?content=detail&amp;fpid=search&amp;pid=search&amp;idp=HCH3BKLB662C9A&amp;lang=EN_CAP&amp;event=L_HCH3BKLB3B8&amp;search%5Bstart_no%5D=3166&amp;search_event=L_HCH3BKLB3B8">Dr. Aarak, Kim Andre (NOR)</a></h4> </div>
<div class=" list-field type-field" style="width: 50px"><div class="visible-xs-block visible-sm-block list-label">Bib Number</div>3166</div> </li>
<li class=" event-L_HCH3BKLB3B8 list-group-item row"> <h4 class=" list-field type-fullname"><a href="?content=detail&amp;idp=HCH3BKLB664F51&amp;event=L_HCH3BKLB3B8">Althoff, Kim (GER)</a></h4>
<div class=" list-field type-field" style="width: 50px"><div class="visible-xs-block visible-sm-block list-label">Bib Number</div>F3166</div> </li>
<li class=" event-S_HCH3BKLB3B9 list-group-item row"> <h4 class=" list-field type-fullname"><a href="?content=detail&amp;idp=HCH3BKLB66AAAA&amp;event=S_HCH3BKLB3B9">Relay, Team</a></h4>
<div class=" list-field type-field" style="width: 50px"><div class="visible-xs-block visible-sm-block list-label">Bib Number</div>3166</div> </li></ul>`;
function mikaDetailPage(runner: string, bib: string, official: string | null, year = "2026", idp = "HCH3BKLB662C9A"): string {
  return `<meta property="og:url" content="https://frankfurt.r.mikatiming.de/${year}/?content=detail&amp;event=L_HCH3BKLB3B8&amp;event_main_group=${year}&amp;idp=${idp}" />
<table class="table table-condensed"> <tbody> <tr class=" f-__fullname" > <th class="desc" >Name</th> <td class="f-__fullname last">${runner}</td> </tr>
<tr class="list-highlight f-start_no_text" > <th class="desc" >Bib Number</th> <td class="f-start_no_text last">${bib}</td> </tr>
${official ? `<tr class="list-highlight f-time_finish_netto" > <th class="desc" >Time Total</th> <td class="f-time_finish_netto last">${official}</td> </tr>` : ""}
<tr class=" f-time_finish_brutto" > <th class="desc" >Finish Time (Gun)</th> <td class="f-time_finish_brutto last">03:29:22</td> </tr> </tbody> </table>`;
}
const FRANKFURT = "frankfurt.r.mikatiming.de/2026|L_|3166";

test("MikaTiming: the search by bib gives the runner's id, the lettered twin and another event's bib left aside", () => {
  assert.equal(mikaSearchUrl("frankfurt.r.mikatiming.de", "2026", "F3166"), "https://frankfurt.r.mikatiming.de/2026/?pid=search&search%5Bstart_no%5D=F3166");
  const rows = mikaRowsOf(MIKA_SEARCH);
  assert.deepEqual(rows, [
    { code: "L_HCH3BKLB3B8", bib: "3166", idp: "HCH3BKLB662C9A" },
    { code: "L_HCH3BKLB3B8", bib: "F3166", idp: "HCH3BKLB664F51" },
    { code: "S_HCH3BKLB3B9", bib: "3166", idp: "HCH3BKLB66AAAA" },
  ]);
  assert.equal(mikaRunnerIdOf(rows, "L_", "3166"), "HCH3BKLB662C9A");
  assert.equal(mikaRunnerIdOf(rows, "L_", "F3166"), "HCH3BKLB664F51", "the women's bib is its own runner");
  assert.equal(mikaRunnerIdOf(rows, "L_", "316"), undefined, "a bib is exact, never a prefix");
  assert.ok(mikaEventMatches("MAR_9TGG96381A5", "MAR_") && mikaEventMatches("R", "R") && !mikaEventMatches("RW", "R") && !mikaEventMatches("S_X", "L_"));
  assert.equal(mikaDetailAccount("frankfurt.r.mikatiming.de", "2026", "HCH3BKLB662C9A", "3166"), "frankfurt.r.mikatiming.de/2026|HCH3BKLB662C9A|3166");
});

test("MikaTiming: the runner's page is read by four patterns, and its name is brought to what a funder writes", () => {
  const values = mikaValuesOf(mikaDetailPage("Dr. Aarak, Kim Andre (NOR)", "3166", "03:21:04"));
  assert.deepEqual(values, { runner: "Dr. Aarak, Kim Andre (NOR)", bib: "3166", official: "03:21:04", year: "2026", idp: "HCH3BKLB662C9A" });
  assert.equal(mikaRunnerName("Dr. Aarak, Kim Andre (NOR)"), "Aarak Kim Andre");
  assert.equal(mikaRunnerName("Abadi, Kidani"), "Abadi Kidani");
  assert.ok(sameRunner(mikaRunnerName("Dr. Aarak, Kim Andre (NOR)"), "Kim Andre Aarak"), "the name the funder writes, in its own order");
  const account = "frankfurt.r.mikatiming.de/2026|HCH3BKLB662C9A|3166";
  assert.ok(MIKA_TIMING_RUNNER.accepts(account) && !MIKA_TIMING_RUNNER.accepts("evil.example/2026|HCH3BKLB662C9A|3166") && !MIKA_TIMING_RUNNER.accepts(FRANKFURT));
  assert.equal(MIKA_TIMING_RUNNER.url(account), "https://frankfurt.r.mikatiming.de/2026/?content=detail&idp=HCH3BKLB662C9A");
  assert.deepEqual(mikaAccountOf(FRANKFURT), { host: "frankfurt.r.mikatiming.de", year: "2026", heat: "L_", bib: "3166" });
  assert.equal(mikaAccountOf("evil.example/2026|L_|3166"), undefined, "no host but the sites listed");
});

test("MikaTiming: a plain read finds the runner then reads their page; the year, the bib and the finish are checked", async () => {
  const pages = (detail: string) => async (url: string) => new Response(url.includes("pid=search") ? MIKA_SEARCH : detail, { status: 200 });
  const read = await readMarathonResult(FRANKFURT, pages(mikaDetailPage("Dr. Aarak, Kim Andre (NOR)", "3166", "03:21:04")));
  assert.equal(read.runner, "Aarak Kim Andre");
  assert.equal(read.finishSeconds, 3 * 3600 + 21 * 60 + 4);
  assert.equal(read.subject, marathonSubject("Kim Andre Aarak", "frankfurt-2026/marathon"));
  assert.equal(await mikaRunnerAccount(FRANKFURT, pages("")), "frankfurt.r.mikatiming.de/2026|HCH3BKLB662C9A|3166");
  await assert.rejects(readMarathonResult("frankfurt.r.mikatiming.de/2026|L_|9999", pages("")), refused("NO_RESULT"));
  await assert.rejects(readMarathonResult(FRANKFURT, pages(mikaDetailPage("Dr. Aarak, Kim Andre (NOR)", "3166", "03:21:04", "2025"))), refused("NO_RESULT"), "a site still answering last year's pages");
  await assert.rejects(readMarathonResult(FRANKFURT, pages(mikaDetailPage("Dr. Aarak, Kim Andre (NOR)", "3166", null))), refused("NOT_FINISHED"));
  await assert.rejects(readMarathonResult(FRANKFURT, pages(mikaDetailPage("Someone, Else", "F3166", "03:21:04"))), refused("ANOTHER_BIB"));
  await assert.rejects(readMarathonResult("frankfurt.r.mikatiming.de/2031|L_|3166", pages("")), refused("UNKNOWN_RACE"));
});

test("MikaTiming: its own goal and provider, one line for both timing companies, and nothing offered until goal 31 is signed", () => {
  assert.equal(MIKA_TIMING_GOAL_TYPE, 31);
  assert.equal(marathonGoalTypeOf("mika-timing"), 31);
  assert.equal(marathonProviderIdOf("mika-timing"), "0x5f162f6734f7ec9371fc0cfc3eff666a1c01397748a818073a2cec9b4a2708b7");
  assert.equal(certificateOfGoal(31), MARATHON_MILESTONE, "goal 31 reads with the marathon's words");
  assert.equal(MARATHON_MILESTONE.goalTypeOf?.("chicago-2026/marathon"), 31);
  assert.equal(MARATHON_MILESTONE.goalTypeOf?.("dakar-2023/marathon"), 30);
  assert.equal(MIKA_TIMING_OPEN, true, "since the founder signed goal 31");
  const now = new Date("2026-10-01T12:00:00Z").getTime();
  assert.ok(racesOffered(now, false).some((race) => race.raceId === "chicago-2026"), "listed to everybody once open");
  assert.equal(MARATHON_MILESTONE.course?.refuses?.("chicago-2026/marathon", false), undefined);
  assert.match(readFileSync("app/api/gift/certificate/create/route.ts", "utf8"), /goalType: \(course && certificate\.goalTypeOf\?\.\(course\)\) \|\| certificate\.goalType/);
  assert.match(readFileSync("src/certificate-reading.ts", "utf8"), /if \(marathonGoalTypeOf\(reading\.race\.timer\) !== goalType\) throw new MarathonReadError\("PROOF_MISMATCH"/);
});

/** "Which race?" as the founder asks it on 27 Sep 2026: all countries by date, under one filter "Country · all". */
import { byDate, countriesOf, inCountryOrAll } from "../src/marathon-choice";

test("the list of races: every coming race by date, all countries, and one country kept when its chip is pressed", () => {
  const list = [
    { raceId: "b", country: "FR", startsAt: "2026-11-14T00:00:00+01:00" },
    { raceId: "a", country: "US", startsAt: "2026-10-11T00:00:00-05:00" },
    { raceId: "c", country: "DE", startsAt: "2026-10-25T00:00:00+02:00" },
    { raceId: "d", country: "FR", startsAt: "2026-10-04T00:00:00+02:00" },
  ];
  assert.deepEqual(byDate(list).map((one) => one.raceId), ["d", "a", "c", "b"]);
  assert.deepEqual(countriesOf(list), [{ code: "FR", name: "France" }, { code: "DE", name: "Germany" }, { code: "US", name: "United States" }]);
  assert.deepEqual(inCountryOrAll(list, null).map((one) => one.raceId), ["b", "a", "c", "d"], "no country: everything, untouched");
  assert.deepEqual(inCountryOrAll(list, "FR").map((one) => one.raceId), ["b", "d"]);
  const chooser = readFileSync("app/kit/offer/MarathonChooser.tsx", "utf8");
  assert.match(chooser, /setRaces\(byDate\(found\)\)/, "sorted by date as it arrives");
  assert.match(chooser, /aria-pressed=\{country === null\} onClick=\{\(\) => setCountry\(null\)\}/, "the first chip is everything");
  assert.match(chooser, /setCountry\(country === one\.code \? null : one\.code\)/, "pressing a chosen country again gives everything back");
  assert.doesNotMatch(chooser, /country-first|Which country/, "no country step before the list");
});

/**
 * race result, the third timing platform (the founder, 27 Sep 2026: coverage first), measured on the 42K de Buenos
 * Aires 2026 on 26 Sep 2026: the list's own key order, one row per bib in search mode, an empty time for a DNF.
 */
const RR_CONFIG = JSON.stringify({ key: "bafa4cbc7e8acfb6a08aa821a73310c1", server: "my4.raceresult.com", eventname: "42K de Buenos Aires 2026", contests: { "1": "Maratón", "2": "DIS Maratón" }, TabConfig: { Lists: [{ Name: "Maratón 2026|Resultado General G/CH", Contest: "1" }] } });
const RR_FIELDS = ["BIB", "ID", "ConEstatus([ClasifGeneral.p])", "correctSpelling([FLNAME])", "NATION.FLAG", "AGEGROUP.NAMESHORT", "SexoMF", "[Final.CHIP]", "[Final.GUN]", "[Final]"];
const rrList = (rows: string[][], fields = RR_FIELDS) => JSON.stringify({ list: { ListName: "Maratón 2026|Resultado General G/CH" }, data: [...rows, [14259]], DataFields: fields });
const RR_ROW = ["1", "1", "1.", "Bethwel Kibet Chumba", "[img:/graphics/flags/KE.svg]", "M35-39", "M", "2:08:24", "2:08:28", "2:08:28"];
const RR_DNF = ["13", "13", "DNF", "Zacharia Krop", "[img:/graphics/flags/KE.svg]", "M18-29", "M", "", "", ""];
const rrFetch = (answers: Record<string, string>) => async (url: string) => {
  if (url.includes("/results/config")) return new Response(RR_CONFIG, { status: 200 });
  const term = /term=([^&]*)/.exec(url)?.[1] ?? "";
  return new Response(answers[term] ?? rrList([]), { status: 200 });
};
const BUENOS_AIRES = marathonEventById("buenos-aires-2026/marathon")!;

test("race result: the account carries what the URL needs, and the pattern takes the bib's own row at the register's columns", async () => {
  const account = raceResultAccount({ key: "bafa4cbc7e8acfb6a08aa821a73310c1", server: "my4.raceresult.com" }, BUENOS_AIRES.race, BUENOS_AIRES.event, " 1 ");
  assert.equal(account, "my4.raceresult.com|423560|bafa4cbc7e8acfb6a08aa821a73310c1|Marat%C3%B3n%202026%7CResultado%20General%20G%2FCH|1|1|3|7");
  assert.ok(RACE_RESULT_ROW.accepts(account) && !RACE_RESULT_ROW.accepts("evil.example|423560|bafa4cbc7e8acfb6a08aa821a73310c1|x|1|1|3|7"));
  assert.equal(RACE_RESULT_ROW.url(account), "https://my4.raceresult.com/423560/results/list?key=bafa4cbc7e8acfb6a08aa821a73310c1&listname=Marat%C3%B3n%202026%7CResultado%20General%20G%2FCH&page=results&contest=1&r=search&l=0&openedGroups=%7B%7D&term=1");
  const [pattern] = matchesOf(RACE_RESULT_ROW, account);
  assert.deepEqual({ ...new RegExp(pattern.value).exec(rrList([RR_ROW]))?.groups }, { runner: "Bethwel Kibet Chumba", official: "2:08:24" });
  assert.equal(new RegExp(pattern.value).exec(rrList([["4", "4", "2.", "John Hakizimana", "", "M30-34", "M", "2:08:36", "2:08:39", "2:08:39"]])), null, "another bib's row");
  assert.deepEqual({ ...new RegExp(pattern.value).exec(rrList([RR_DNF.map((cell, index) => (index === 0 ? "1" : cell))]))?.groups }, { runner: "Zacharia Krop", official: "" }, "a DNF is an empty time, read as such");
  assert.deepEqual(raceResultRows(JSON.parse(rrList([RR_ROW, RR_DNF])).data), [RR_ROW, RR_DNF], "the trailing count is not a row");
  assert.deepEqual(raceResultRows({ "#1_f": [RR_ROW], "#2_m": { sub: [RR_DNF] } }), [RR_ROW, RR_DNF], "groups are flattened");
  assert.equal(raceResultSeconds("2:08:24"), 7_704);
  assert.equal(raceResultSeconds("12:29.14"), 749, "minutes, seconds and hundredths");
  assert.equal(raceResultSeconds("1:05:32.5"), 3_932);
  assert.equal(raceResultSeconds(""), undefined);
  assert.equal(raceResultSeconds("DNF"), undefined);
  assert.deepEqual(raceResultAccountOf("423560|1|F12"), { eventId: "423560", contest: "1", bib: "F12" });
  assert.equal(raceResultAccountOf("423560|1|toolongbib"), undefined);
  const config = await readRaceResultConfig("423560", rrFetch({}));
  assert.deepEqual(config, { key: "bafa4cbc7e8acfb6a08aa821a73310c1", server: "my4.raceresult.com", eventName: "42K de Buenos Aires 2026", contests: { "1": "Maratón", "2": "DIS Maratón" }, lists: [{ name: "Maratón 2026|Resultado General G/CH", contest: "1" }] });
});

test("race result: the row is read plainly by bib, the list's columns are checked first, and the register's races are read through the marathon door", async () => {
  const found = await readRaceResultRow(BUENOS_AIRES.race, BUENOS_AIRES.event, "1", rrFetch({ "1": rrList([RR_ROW]) }));
  assert.deepEqual(found.row, { runner: "Bethwel Kibet Chumba", official: "2:08:24" });
  await assert.rejects(readRaceResultRow(BUENOS_AIRES.race, BUENOS_AIRES.event, "999", rrFetch({})), (error: unknown) => error instanceof RaceResultError && error.code === "NO_RESULT");
  const moved = [...RR_FIELDS]; moved[7] = "[Final.GUN]";
  await assert.rejects(readRaceResultRow(BUENOS_AIRES.race, BUENOS_AIRES.event, "1", rrFetch({ "1": rrList([RR_ROW], moved) })), (error: unknown) => error instanceof RaceResultError && error.code === "UNKNOWN_LIST", "a list whose columns moved is not trusted");
  const read = await readMarathonResult("423560|1|1", rrFetch({ "1": rrList([RR_ROW]) }));
  assert.equal(read.finishSeconds, 7_704);
  assert.equal(read.race.timer, "race-result");
  assert.equal(read.subject, marathonSubject("Bethwel Kibet Chumba", "buenos-aires-2026/marathon"));
  await assert.rejects(readMarathonResult("423560|1|13", rrFetch({ "13": rrList([RR_DNF]) })), refused("NOT_FINISHED"));
  await assert.rejects(readMarathonResult("999999|1|1", rrFetch({})), refused("UNKNOWN_RACE"));
  assert.equal(marathonGoalTypeOf("race-result"), 34);
  assert.equal(marathonProviderIdOf("race-result"), "0x7cfa6c530b178b3d1b56fe7e1e080bc8cdce8cf60bae36dace0378c2cb4f2887");
  assert.equal(RACE_RESULT_OPEN, true, "since the founder signed goal 34");
  const now = new Date("2026-10-01T12:00:00Z").getTime();
  const offered = racesOffered(now, false);
  const coming = offered.find((race) => race.timer === "race-result");
  assert.ok(coming, "race result's coming races listed to everybody once open");
  assert.ok(!offered.some((race) => race.raceId === "buenos-aires-2026"), "the test race stays the operator's");
  assert.ok(racesOffered(now, true).some((race) => race.raceId === "buenos-aires-2026"));
  assert.equal(MARATHON_MILESTONE.course?.refuses?.(`${coming!.raceId}/${coming!.events[0].distance}`, false), undefined);
  assert.ok(MARATHON_RACES.filter((race) => race.timer === "race-result").length >= 2, "the test race and the generated register");
  // The register's race result half is the generator's, and every race in it was kept because its list reads by bib.
  const generator = readFileSync("scripts/raceresult-register.ts", "utf8");
  assert.match(generator, /list\.contest === contestId/, "a list declared for that contest, never one for all contests");
  assert.match(generator, /fields\[0\] !== "BIB"/, "the bib first");
  assert.match(generator, /process\.env\.RAILWAY_ENVIRONMENT/, "never from the address that reads in production");
  assert.match(generator, /SMALL_SERIES\.test\(event\.name\)/, "small recurring laps left out (the founder, 27 Sep 2026)");
  assert.ok(!MARATHON_RACES.some((race) => race.timer === "race-result" && /teichwiesen|lost places|insel marathon/i.test(race.name)), "none in the register");
  assert.equal(MARATHON_RACES.filter((race) => race.town === "Frankfurt").length, 1, "a race read by two timing companies is listed once");
  assert.match(readFileSync("src/marathon.ts", "utf8"), /\.\.\.RACE_RESULT_RACES/);
});
