// The judges page's sentences about readings, held to the code that makes them (the money path audit of 27 Sep 2026):
// reads are counted per gift and not per person, the plain steps of the marathon line go out from the app's own
// servers without the pace, and the pace lives in the reading service's memory.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BEFORE_THE_JOURNAL, DAILY_CEILING, JUDGING, LOST_ON_30_SEP_2026, RECLAIM_ALERT_LEFT, RECLAIM_ALLOWANCE } from "../src/attested-calls";
import { fetchesOfGoal } from "../src/certificate-reading";
import { climbFetches } from "../src/climb-reading";
import { CODEFORCES_CLIMB } from "../src/climbs";
import { COURSERA_GOAL_TYPE } from "../src/coursera-certificate";
import { CREDLY_GOAL_TYPE } from "../src/credly-badge";
import { COUNTING_PASS, dailyPass, type DailyPassDeps } from "../src/daily-pass";
import { attestMarathonResult, readMarathonResult } from "../src/marathon-reading";
import { PLATFORM_PACE, SourcePace } from "../src/source-throttle";

const page = readFileSync(new URL("../app/judges/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);

test("the morning pass reads each daily gift, so two gifts on one account are two reads, and the page says per gift", async () => {
  const asked: string[] = [];
  const deps: DailyPassDeps = {
    // Two gifts, one from each parent, on the same Duolingo account: nothing in the pass groups them by person.
    boundGifts: async () => [{ giftId: "11" }, { giftId: "12" }],
    allGifts: async () => [],
    read: async () => {
      throw new Error("not reached");
    },
    count: async (giftId) => {
      asked.push(giftId);
      return { kind: "counted", giftId, xp: 1_000, creditedDays: 1, hash: "0x01" };
    },
    drain: async () => ({ hash: "0x" }),
    finalise: async () => ({ hash: "0x" }),
    refund: async () => ({ hash: "0x" }),
    start: async () => ({ address: ESCROW, balance: 0n }),
  };
  await dailyPass(COUNTING_PASS, deps);
  assert.deepEqual(asked, ["11", "12"], "one reading per gift, not one per person");

  // The day's guard is keyed by the gift, and a count the person asks for passes it.
  assert.match(source("src/duolingo-public-checkin.ts"), /startsWith\(`public:\$\{giftId\}:count:\$\{today\}:`\)/);
  assert.match(source("app/api/gift/[id]/count/route.ts"), /: \{ giftId: id, purpose: "count", force: true \}\)/, "by the condition's nature, a connected source read with its own key");
  assert.match(source("app/api/gift/[id]/count/route.ts"), /checkRateLimit\(isMilestoneGiftId\(id\) \|\| look \? "reading" : "verify", request\)/, "keyed by the IP address alone");

  assert.ok(!page.includes("per recipient per day"), "no read per recipient per day");
  assert.ok(!page.includes("one profile per recipient"), "no profile per recipient");
  assert.ok(page.includes("Reads are counted per gift, never per person"));
  assert.ok(page.includes("Viky reads a profile once a day for each gift made on it"));
});

/** Every plain request the app sends, and the moment the reading service is asked, in order. */
function recorder(answer: (url: string) => Response) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(`plain ${new URL(url).host}`);
    return answer(url);
  };
  const deps = {
    zkFetch: async () => {
      calls.push("reading service");
      throw new Error("stopped here");
    },
    verify: async () => true,
  } as never;
  return { calls, fetchImpl, deps };
}

const RR_CONFIG = JSON.stringify({ key: "bafa4cbc7e8acfb6a08aa821a73310c1", server: "my4.raceresult.com", eventname: "42K de Buenos Aires 2026", contests: { "1": "Maratón" }, TabConfig: { Lists: [{ Name: "Maratón 2026|Resultado General G/CH", Contest: "1" }] } });
const RR_FIELDS = ["BIB", "ID", "ConEstatus([ClasifGeneral.p])", "correctSpelling([FLNAME])", "NATION.FLAG", "AGEGROUP.NAMESHORT", "SexoMF", "[Final.CHIP]", "[Final.GUN]", "[Final]"];
const RR_ROW = ["1", "1", "1.", "Bethwel Kibet Chumba", "[img:/graphics/flags/KE.svg]", "M35-39", "M", "2:08:24", "2:08:28", "2:08:28"];
const raceResult = (url: string) => new Response(url.includes("/results/config") ? RR_CONFIG : JSON.stringify({ data: [RR_ROW, [1]], DataFields: RR_FIELDS }), { status: 200 });

const MIKA_SEARCH = `<li class=" list-active event-L_HCH3BKLB3B8 list-group-item row"> <div class="row"> <h4 class=" list-field type-fullname"><a href="?content=detail&amp;fpid=search&amp;pid=search&amp;idp=HCH3BKLB662C9A&amp;lang=EN_CAP&amp;event=L_HCH3BKLB3B8&amp;search%5Bstart_no%5D=3166&amp;search_event=L_HCH3BKLB3B8">Dr. Aarak, Kim Andre (NOR)</a></h4> </div>
<div class=" list-field type-field" style="width: 50px"><div class="visible-xs-block visible-sm-block list-label">Bib Number</div>3166</div> </li>`;
const MIKA_DETAIL = `<meta property="og:url" content="https://frankfurt.r.mikatiming.de/2026/?content=detail&amp;event=L_HCH3BKLB3B8&amp;event_main_group=2026&amp;idp=HCH3BKLB662C9A" />
<table class="table table-condensed"> <tbody> <tr class=" f-__fullname" > <th class="desc" >Name</th> <td class="f-__fullname last">Dr. Aarak, Kim Andre (NOR)</td> </tr>
<tr class="list-highlight f-start_no_text" > <th class="desc" >Bib Number</th> <td class="f-start_no_text last">3166</td> </tr>
<tr class="list-highlight f-time_finish_netto" > <th class="desc" >Time Total</th> <td class="f-time_finish_netto last">03:21:04</td> </tr> </tbody> </table>`;
const mika = (url: string) => new Response(url.includes("pid=search") ? MIKA_SEARCH : MIKA_DETAIL, { status: 200 });

test("one press of Read my result sends four plain requests to race result and three to MikaTiming from the app, before the reading service", async () => {
  const rr = recorder(raceResult);
  await readMarathonResult("423560|1|1", rr.fetchImpl);
  await assert.rejects(attestMarathonResult("423560|1|1", rr.deps, rr.fetchImpl));
  assert.deepEqual(rr.calls, ["plain my.raceresult.com", "plain my4.raceresult.com", "plain my.raceresult.com", "plain my4.raceresult.com", "reading service"]);

  const mt = recorder(mika);
  await readMarathonResult("frankfurt.r.mikatiming.de/2026|L_|3166", mt.fetchImpl);
  await assert.rejects(attestMarathonResult("frankfurt.r.mikatiming.de/2026|L_|3166", mt.deps, mt.fetchImpl));
  assert.deepEqual(mt.calls, ["plain frankfurt.r.mikatiming.de", "plain frankfurt.r.mikatiming.de", "plain frankfurt.r.mikatiming.de", "reading service"]);

  // One press is both routes, and both read with the app's own fetch, in the app's own process.
  assert.match(source("app/kit/MarathonProof.tsx"), /await readMarathonLine\(giftId\);[\s\S]*await proveMarathon\(giftId\);/);
  assert.match(source("app/api/marathon/result/route.ts"), /readMarathonResult\(account\)/);
  assert.match(source("app/api/marathon/result/route.ts"), /checkRateLimit\("verify", request, auth\.account\)/);
  assert.match(source("app/api/marathon/prove/route.ts"), /checkRateLimit\("relay", request, auth\.account\)/);
  assert.match(source("src/certificate-reading.ts"), /await attestMarathonResult\(link\)/);
  assert.match(source("src/rate-limit.ts"), /verify: \{ limit: 10, windowMs: 10 \* 60_000/);
  assert.match(source("src/rate-limit.ts"), /relay: \{ limit: 20, windowMs: 10 \* 60_000/);

  assert.ok(!page.includes("Production reads from another address (the reading service, on Railway)"), "production does not read from the reading service alone");
  assert.ok(page.includes("from Viky&apos;s own app servers"));
  assert.ok(page.includes("four requests to race result"));
  assert.ok(page.includes("three to MikaTiming"));
  assert.ok(page.includes("ten reads of the line and twenty proofs in ten minutes"));
});

test("the pace is the numbers the page gives, and a restart of the service forgets it, as the page says", () => {
  for (const platform of ["race-result", "mika-timing"]) {
    assert.equal(PLATFORM_PACE[platform].minIntervalMs, 3_000);
    assert.equal(PLATFORM_PACE[platform].perDay, 400);
    assert.equal(PLATFORM_PACE[platform].pauseAfter429Ms, 30 * 60_000);
  }
  const before = new SourcePace();
  assert.equal(before.take("race-result-row", T0).go, true);
  before.answered429("race-result-row", T0);
  assert.equal(before.take("race-result-row", T0 + 60_000).go, false, "paused in the same process");
  assert.equal(new SourcePace().take("race-result-row", T0 + 60_000).go, true, "a new process knows no pause");
  assert.match(source("scripts/zkfetch-worker.ts"), /^const pace = new SourcePace\(\);$/m, "one pace, built when the service starts");

  assert.ok(page.includes("The pace is held in the service&apos;s memory: a restart or a redeploy of the service forgets a pause and starts the day&apos;s count again."));
  assert.ok(!page.includes("four hundred readings a day at most"), "no ceiling said without its restart");
});

test("how to try it starts with the daily Duolingo path and gives each path's cost in readings, which is the code's", () => {
  const from = page.indexOf("data-try-paths");
  const paths = page.slice(from, page.indexOf("</ul>", from));
  const order = [
    "First, Duolingo, a lesson a day: two readings for one connection, one lesson and one day paid.",
    "A climb on Chess.com: four readings, started and reached.",
    "On Codeforces a reading is one fetch: two, started and reached.",
    "A certificate by its link",
    "A Credly badge: two.",
    "Strava or Fitbit, by the day: one reading to connect",
    "A document a person shows (a score, an enrolment, a grade): no reading.",
  ].map((sentence) => paths.indexOf(sentence));
  assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), `each path is said, Duolingo first: ${order.join(", ")}`);
  // A climb is read twice, at its start and at its target; a certificate once.
  assert.equal(2 * climbFetches("rapid"), 4);
  assert.equal(2 * climbFetches(CODEFORCES_CLIMB), 2);
  assert.equal(fetchesOfGoal(COURSERA_GOAL_TYPE), 1);
  assert.equal(fetchesOfGoal(CREDLY_GOAL_TYPE), 2);
  assert.equal(RECLAIM_ALLOWANCE.verifications, 25);
  // What is left is said where the judge chooses, from the journal as the page is served.
  assert.match(paths, /\{reclaimUse \? <span data-readings-left> \{readingsLeftInWords\(reclaimUse\)\}<\/span> : null\}/);
  assert.match(page, /return `\$\{left\} \$\{left === 1 \? "reading is" : "readings are"\} left until \$\{utcDayInWords\(use\.until\)\}, when the count starts again\.`;/);
});

test("the cycle's detail is said as it is: thirteen proofs of real use, fifty-seven lost on 30 Sep by our fault, and what is left", () => {
  assert.deepEqual(LOST_ON_30_SEP_2026, { fetches: 114, proofs: 57 });
  assert.equal(BEFORE_THE_JOURNAL.proved - LOST_ON_30_SEP_2026.proofs, 13);
  assert.ok(page.includes("Of those ${BEFORE_THE_JOURNAL.proved} proofs, ${BEFORE_THE_JOURNAL.proved - LOST_ON_30_SEP_2026.proofs} were real use and ${LOST_ON_30_SEP_2026.proofs} were lost on 30 Sep 2026 by a fault of ours on one Chess.com gift: its ratings answered 404, and the pass of every five minutes took a new proof of the profile at each round, ${LOST_ON_30_SEP_2026.fetches} fetches in five hours."));
  assert.ok(page.includes("Corrected on 3 Oct 2026: a proof is claimed before it is paid for and a day has its ceilings, so the same fault now costs ${dailyCeilings().perGift} proofs in a day at most."));
  assert.equal(DAILY_CEILING.perGift, 4);
  assert.ok(page.includes("{reclaimUse ? <span data-cycle-left> {readingsLeftInWords(reclaimUse)}</span> : null}"));
  // The operator's alerts, as the page says them, are the marks and the judging the code holds.
  assert.deepEqual(RECLAIM_ALERT_LEFT, [15, 10, 5, 0]);
  assert.deepEqual(JUDGING, { from: "2026-10-14", until: "2026-10-27" });
  assert.ok(page.includes('{RECLAIM_ALERT_LEFT.filter((mark) => mark > 0).join(", ")} and none are left of an allowance'));
  assert.ok(!page.includes("at half of an allowance"), "the shares are gone");
  assert.ok(!page.includes("each attempt to connect an account by a code in its name is still a proof"), "closed on 3 Oct 2026 by the look for the code");
});
