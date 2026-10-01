import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchesOf, WCA_PERSON_RESULTS } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { CONDITIONS, conditionById, WCA_TIME_LINE as LINE } from "../src/conditions";
import { certificateById, certificateOfGoal, WCA_MILESTONE } from "../src/milestone-conditions";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { competitionStillOpen, isWcaId, sameCuber, wcaAccount, wcaAccountOf, wcaCourseOf, WCA_ANY_RESULT, WCA_GOAL_TYPE, WCA_MAX_CENTISECONDS, wcaMetricOf, wcaProviderId, wcaNameOf, wcaResultInWords, wcaSubject, wcaTargetInWords, wcaTargetUnderSeconds } from "../src/wca";
import { bestRowOf, listWcaCompetitions, readWcaRegistration, readWcaResult, WcaReadError, type WcaResultRow } from "../src/wca-reading";

/**
 * "Set a time at a WCA competition" (the founder, 27 Sep 2026). The pages below are the WCA API's own shapes, measured
 * on Saint Symphorien 2026 and Gan Open 2026 on 26 Sep 2026, trimmed to what is read, with invented people.
 */
const RESULTS = JSON.stringify([
  { id: 1, round_id: 10, pos: 1, best: 791, average: 867, name: "Ada Example", country_iso2: "FR", competition_id: "TestOpen2026", event_id: "333", round_type_id: "1", format_id: "a", wca_id: "2019EXAM01", attempts: [1038, 815, 912, 791, 873] },
  { id: 2, round_id: 11, pos: 8, best: 854, average: 955, name: "Ada Example", country_iso2: "FR", competition_id: "TestOpen2026", event_id: "333", round_type_id: "f", format_id: "a", wca_id: "2019EXAM01", attempts: [854, 955, 1000, 900, 960] },
  { id: 3, round_id: 12, pos: 1, best: -1, average: -1, name: "Ada Example", country_iso2: "FR", competition_id: "TestOpen2026", event_id: "333bf", round_type_id: "f", format_id: "3", wca_id: "2019EXAM01", attempts: [-1, -1, -1] },
  { id: 4, round_id: 10, pos: 2, best: 702, average: 890, name: "Bob Other", country_iso2: "FR", competition_id: "TestOpen2026", event_id: "333", round_type_id: "1", format_id: "a", wca_id: "2018OTHE02", attempts: [702, 926, -1, 749, 996] },
]);
const WCIF = JSON.stringify({ persons: [
  { registrantId: 1, name: "Ada Example", wcaId: "2019EXAM01", countryIso2: "FR", registration: { eventIds: ["222", "333", "pyram"], status: "accepted" } },
  { registrantId: 2, name: "New Comer", wcaId: null, countryIso2: "FR", registration: { eventIds: ["333"], status: "accepted" } },
  { registrantId: 3, name: "Not Yet", wcaId: null, countryIso2: "FR", registration: { eventIds: ["333"], status: "pending" } },
] });
const COMPETITIONS = JSON.stringify([{ id: "TestOpen2026", name: "Test Open 2026", city: "Rennes", country_iso2: "FR", start_date: "2026-10-17", end_date: "2026-10-18", event_ids: ["333", "222", "notanevent"] }]);
const fake = async (url: string) => {
  if (url.endsWith("/competitions/TestOpen2026/results")) return new Response(RESULTS, { status: 200 });
  if (url.endsWith("/competitions/TestOpen2026/wcif/public")) return new Response(WCIF, { status: 200 });
  if (url.includes("/competitions?start=")) return new Response(COMPETITIONS, { status: 200 });
  return new Response("", { status: 404 });
};
const refused = (code: string) => (error: unknown) => error instanceof WcaReadError && error.code === code;

test("the module: events, ids, the course, the metric in hundredths under an hour, the words", () => {
  assert.ok(isWcaId("2019SCHO04") && isWcaId(" 2019scho04 ") && !isWcaId("2019SCHO4") && !isWcaId("SCHO2019"));
  assert.deepEqual(wcaCourseOf("GanOpen2026/333"), { competitionId: "GanOpen2026", eventId: "333" });
  assert.equal(wcaCourseOf("GanOpen2026/999"), undefined, "an event the WCA does not hold");
  assert.equal(wcaCourseOf("Gan Open/333"), undefined);
  assert.equal(wcaMetricOf(791, "333"), WCA_MAX_CENTISECONDS - 791);
  assert.equal(wcaMetricOf(-1, "333"), undefined, "a DNF is no result");
  assert.equal(wcaMetricOf(23, "333fm"), WCA_ANY_RESULT, "moves are a result, never a time");
  assert.equal(wcaTargetUnderSeconds(15.5), WCA_MAX_CENTISECONDS - 1_550);
  assert.equal(wcaTargetInWords(WCA_ANY_RESULT), "set a result");
  assert.equal(wcaTargetInWords(wcaTargetUnderSeconds(15.5)), "set a single under 15.50 s");
  assert.equal(wcaResultInWords(791, "333"), "7.91 s");
  assert.equal(wcaResultInWords(6532, "444"), "1:05.32");
  assert.equal(wcaResultInWords(23, "333fm"), "23 moves");
  assert.equal(wcaSubject("ada EXAMPLE", "TestOpen2026/333"), wcaSubject("Example Ada", "TestOpen2026/333"), "no case, no order");
  assert.notEqual(wcaSubject("Ada Example", "TestOpen2026/333"), wcaSubject("Ada Example", "TestOpen2026/222"), "the event is signed");
  assert.ok(sameCuber("Alexandre Schoeffel", "schoeffel alexandre") && !sameCuber("Alexandre Schoeffel", "Alexandre Other"));
  // The WCA prints a name in the person's own script after it, in parentheses; a funder writes the name people say
  // (the audit of 1 Oct 2026: compared whole, the two never matched, so such a person's result paid nothing).
  assert.ok(sameCuber("Ada Example (艾达)", "Ada Example"), "the API's printed name against the name written");
  assert.ok(sameCuber("Ada Example", "Ada Example (艾达)") && sameCuber("Ada Example (艾达)", "example ada (艾达)"), "whichever side carries it");
  assert.ok(!sameCuber("Ada Example (艾达)", "Ada Other"), "another person is still another person");
  assert.equal(wcaNameOf("Ada Example (艾达)"), "Ada Example");
  assert.equal(wcaNameOf("Ada (Addie) Example"), "Ada (Addie) Example", "only a parenthesis that ends the name is dropped");
  assert.equal(wcaNameOf("(艾达)"), "(艾达)", "a name that is nothing else is kept");
  assert.equal(wcaSubject("Ada Example (艾达)", "TestOpen2026/333"), wcaSubject("Ada Example", "TestOpen2026/333"), "and what is signed is the same person either way");
  assert.ok(competitionStillOpen("2026-10-17", new Date("2026-10-16T23:59:00Z").getTime()) && !competitionStillOpen("2026-10-17", new Date("2026-10-17T00:00:00Z").getTime()));
  assert.equal(wcaAccount(" 2019scho04 ", "SaintSymphorienSpeedcubing2026", "333", "f"), "2019SCHO04|SaintSymphorienSpeedcubing2026|333|f");
  assert.deepEqual(wcaAccountOf("2019SCHO04|SaintSymphorienSpeedcubing2026|333|f"), { wcaId: "2019SCHO04", competitionId: "SaintSymphorienSpeedcubing2026", eventId: "333", round: "f" });
  assert.equal(wcaAccountOf("2019SCHO04|Comp|999|f"), undefined);
  assert.equal(WCA_GOAL_TYPE, 32);
  assert.equal(wcaProviderId(), "0xe8fe5b823e9946efa5da357e01825f12d71f46b4cac1bd0e27afbc182c3a88fb");
});

test("the source: one pattern built for the account, on the person's own results, taking that competition, event and round only", () => {
  const account = "2019EXAM01|TestOpen2026|333|f";
  assert.ok(WCA_PERSON_RESULTS.accepts(account) && !WCA_PERSON_RESULTS.accepts("2019EXAM01|Test Open|333|f") && !WCA_PERSON_RESULTS.accepts("EXAM|TestOpen2026|333|f"));
  assert.equal(WCA_PERSON_RESULTS.url(account), "https://www.worldcubeassociation.org/api/v0/persons/2019EXAM01/results");
  assert.equal(WCA_PERSON_RESULTS.matches.length, 0, "nothing static: the pattern is the account's");
  const [pattern] = matchesOf(WCA_PERSON_RESULTS, account);
  const found = new RegExp(pattern.value).exec(RESULTS);
  assert.deepEqual({ ...found?.groups }, { best: "854", average: "955", name: "Ada Example" }, "the final, not the first round");
  assert.equal(new RegExp(matchesOf(WCA_PERSON_RESULTS, "2019EXAM01|TestOpen2026|333|1")[0].value).exec(RESULTS)?.groups?.best, "791");
  assert.equal(new RegExp(matchesOf(WCA_PERSON_RESULTS, "2019EXAM01|TestOpen2026|222|f")[0].value).exec(RESULTS), null, "an event they did not enter");
  assert.equal(new RegExp(matchesOf(WCA_PERSON_RESULTS, "2018OTHE02|TestOpen2026|333|f")[0].value).exec(RESULTS), null, "another person's id");
  assert.equal(WCA_PERSON_RESULTS.userAgent, "Mozilla/5.0 (compatible; Viky/1.0; +https://viky.cash)");
});

test("the competitors list stands in for the bib: by name or by WCA id, accepted, in the event", async () => {
  assert.deepEqual(await readWcaRegistration("TestOpen2026/333", "example ada", fake), { registrantId: 1, name: "Ada Example", wcaId: "2019EXAM01" });
  assert.deepEqual(await readWcaRegistration("TestOpen2026/333", "2019exam01", fake), { registrantId: 1, name: "Ada Example", wcaId: "2019EXAM01" });
  assert.equal((await readWcaRegistration("TestOpen2026/333", "New Comer", fake)).wcaId, null, "a first competition has no id yet");
  await assert.rejects(readWcaRegistration("TestOpen2026/333", "Not Yet", fake), refused("NOT_REGISTERED"), "pending is not registered");
  await assert.rejects(readWcaRegistration("TestOpen2026/pyram", "New Comer", fake), refused("NOT_REGISTERED"), "registered, but not in that event");
  await assert.rejects(readWcaRegistration("TestOpen2026/333", "Nobody Here", fake), refused("NOT_REGISTERED"));
  await assert.rejects(readWcaRegistration("Elsewhere2026/333", "Ada Example", fake), refused("UNKNOWN_COMPETITION"));
});

test("the result: the best single of the person's rounds in the event, a DNF everywhere is no result, another event nothing", async () => {
  const read = await readWcaResult("TestOpen2026/333", "Ada Example", fake);
  assert.equal(read.round, "1");
  assert.equal(read.best, 791);
  assert.equal(read.wcaId, "2019EXAM01");
  assert.equal(read.metric, WCA_MAX_CENTISECONDS - 791);
  assert.equal(read.subject, wcaSubject("Ada Example", "TestOpen2026/333"));
  assert.equal((await readWcaResult("TestOpen2026/333", "2019EXAM01", fake)).best, 791, "by id too");
  await assert.rejects(readWcaResult("TestOpen2026/333bf", "Ada Example", fake), refused("NOT_FINISHED"));
  await assert.rejects(readWcaResult("TestOpen2026/222", "Ada Example", fake), refused("NO_RESULT"));
  await assert.rejects(readWcaResult("TestOpen2026/333", "Nobody Here", fake), refused("NO_RESULT"));
  const rows: WcaResultRow[] = [{ name: "X Y", wcaId: "2020XXYY01", eventId: "333", round: "1", best: -2, average: -1 }];
  assert.throws(() => bestRowOf(rows, "333", "X Y"), refused("NOT_FINISHED"), "a DNS is no result either");
  const list = await listWcaCompetitions("2026-09-27", fake);
  assert.deepEqual(list[0].eventIds, ["333", "222"], "an id the WCA does not hold is dropped");
});

test("the line: read for them, Play, goal 32, open, the fact rule, a name asked, the WCA's list as its chooser", () => {
  assert.equal(LINE.family, "play");
  assert.equal(LINE.nature, "read");
  assert.equal(LINE.live, true);
  assert.ok(CONDITIONS.includes(LINE));
  assert.ok(LINE.name.length <= 30, `${LINE.name.length} characters`);
  assert.equal(conditionById("wca-time"), LINE);
  assert.equal(certificateById("wca-time"), WCA_MILESTONE);
  assert.equal(certificateOfGoal(32), WCA_MILESTONE);
  assert.equal(WCA_MILESTONE.asksName, true);
  assert.equal(WCA_MILESTONE.course?.search?.competitions, true);
  assert.ok(WCA_MILESTONE.validLink("2019SCHO04") && WCA_MILESTONE.validLink("Alexandre Schoeffel") && !WCA_MILESTONE.validLink("Ada"));
  assert.ok(WCA_MILESTONE.validTarget(0) && WCA_MILESTONE.validTarget(15.5) && !WCA_MILESTONE.validTarget(3_600));
  assert.equal(WCA_MILESTONE.targetUnits?.(0), WCA_ANY_RESULT);
  assert.equal(WCA_MILESTONE.targetUnits?.(15.5), wcaTargetUnderSeconds(15.5));
  assert.ok(proofOfCondition("wca-time")?.supervised, "judged at a WCA competition");
  assert.equal(privacyOf(LINE).kept, "fact");
  assert.ok(MILESTONE_GOALS.some((goal) => goal.goalType === 32 && goal.providerId === wcaProviderId()));
  for (const route of ["result", "prove"]) {
    const source = readFileSync(`app/api/wca/${route}/route.ts`, "utf8");
    assert.match(source, /wcaCourseOfGift\(String\(body\.giftId \?\? ""\), auth\.account\)/);
    assert.doesNotMatch(source, /body\.(who|name|competition|event|link)/, `the ${route} route takes nothing but the gift`);
  }
  const registration = readFileSync("app/api/wca/registration/route.ts", "utf8");
  assert.match(registration, /if \(!competitionStillOpen\(competition\.startDate, Date\.now\(\)\) && !isOperator\(auth\.account\)\) throw new GiftApiError\("COMPETITION_STARTED"/);
  assert.match(registration, /if \(gift\.boundAt\) throw new GiftApiError\("ALREADY_CHECKED"/, "checked once");
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /if \(milestone\.conditionId === "wca-time"\) return <WcaProof/);
  assert.match(readFileSync("app/kit/offer/WillSheet.tsx", "utf8"), /certificate\.course\?\.search\?\.competitions \? \(/);
  const chooser = readFileSync("app/kit/offer/WcaChooser.tsx", "utf8");
  assert.match(chooser, /setCompetitions\(byDate\(found\)\)/, "all countries by date");
  assert.match(chooser, /R\.countryAll/, "the same filter as the races");
});
