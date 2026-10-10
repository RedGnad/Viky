// Sentences of the judges page that the chain no longer answers (the money path audit of 27 Sep 2026): the earlier
// contract's balance, the goals signed on 26 Sep 2026, and when the founder's key took the contracts.

import assert from "node:assert/strict";
import { RACE_RESULT_RACES } from "../src/race-result-races";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followsThirdDailyContract } from "../src/envio-index";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { waysIn } from "../src/rails";
import { JUDGE_CREDIT_ENDS } from "../src/judge-credit";
import { ME, NAV, YOU_DECIDE } from "../src/sentences";

const page = readFileSync(new URL("../app/judges/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");

test("the page no longer says the earlier contract still holds its first gift's money", () => {
  assert.doesNotMatch(page, /still holds the 8\.571432 AUSD/);
  assert.match(page, /its last refund went back to its funder on 23 Sep 2026/);
});

test("the goals signed on 26 Sep 2026 are said open, never waiting for a signature", () => {
  assert.doesNotMatch(page, /offered until goal 3[1-3] is signed/);
  for (const goal of [31, 32, 33]) {
    assert.ok(MILESTONE_GOALS.some((g) => g.goalType === goal), `goal ${goal} is in the register the Safe signed`);
    assert.ok(page.includes(`Open since goal ${goal} was signed on 26 Sep 2026.`));
  }
});

test("the founder's key is said to have held each contract from its own day, not from one date", () => {
  assert.doesNotMatch(page, /which had held them since 18 Sep 2026/);
});

// The sentences the audit of 1 Oct 2026 (D-10, D-20, F-06) and the review of 2 Oct 2026 (R-07, R-12, R-14, R-18) found
// false or out of date, each held to what replaced it and to the code that makes the new one true.

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("the judge's path leads to the recipient's side, and promises nothing a single judge alone could use", () => {
  assert.doesNotMatch(page, /shown in the video/);
  assert.doesNotMatch(page, /open the gift the founder made for you from the operator account/);
  // One press since the UI pass of 8 Oct 2026: "Open my gift" makes the account and opens the gift.
  assert.ok(page.includes("To see the other side on this device: copy the link, press Me, then Other account, open the link and press Open my gift, which creates a second account. Then connect the source."));
  // The words are the screens' own.
  const sentences = read("src/sentences.ts");
  for (const label of ['me: "Me"', 'anotherAccount: "Use another account"', 'openMyGift: "Open my gift"']) assert.ok(sentences.includes(label), label);
  // When a day counts and when a missed one comes back: the schedules' own hours.
  assert.ok(page.includes('"The day counts the morning after it ends (the readings pass of 00:30 UTC). A "'), "when a day counts, on the first two versions");
  assert.ok(page.includes("day without a lesson costs no reading, a plain look sees it first, and it comes back to the funder 31 hours after it ends (the settling pass of 07:00 UTC, two mornings later)."));
  const crons = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons as { path: string; schedule: string }[];
  assert.equal(crons.find((cron) => cron.path === "/api/cron/daily")?.schedule, "30 0 * * *");
  assert.equal(crons.find((cron) => cron.path === "/api/cron/settle")?.schedule, "0 7 * * *");
  assert.ok(page.includes("on one page"));
  assert.doesNotMatch(page, /in one screen/);
});

test("a reading that fails on our side is no longer said to hold the day: it goes back once its window has closed", () => {
  assert.doesNotMatch(page, /holds the day open rather than taking it away from anybody/);
  assert.ok(page.includes("a failure of ours does not hold it longer"));
  const reliability = read("app/judges/JudgesReliability.tsx");
  assert.doesNotMatch(reliability, /holds the gift instead of draining it/);
  assert.doesNotMatch(reliability, /The rule in the code is that this is zero/);
  assert.ok(reliability.includes("A failure of ours does not hold a day past its window."));
  // What the sentence rests on: the settling pass counts nothing, and a check-in of the second version settles the
  // days whose window has elapsed before it credits anything.
  assert.match(read("src/daily-pass.ts"), /export const SETTLING_PASS: PassPlan = \{ name: "settling", count: false, refund: true \};/);
  assert.match(read("contracts/GiftEscrowV2.sol"), /A check-in first settles the days whose window \/\/\/ has elapsed/);
  assert.match(read("vercel.json"), /"path": "\/api\/cron\/recount", "schedule": "30 3 \* \* \*"/);
});

test("what a pause does is said per version, and never that it cannot take a day on a contract where it can", () => {
  const contracts = read("app/judges/JudgesContracts.tsx");
  assert.doesNotMatch(contracts, /A paused reading holds a day open; it cannot take one back\./);
  assert.ok(contracts.includes("On the daily contracts a pause stops check-ins only: once a day&apos;s catch-up window has passed, the contract lets anybody send that day back to the funder, pause or not."));
  // The first daily contract's drain asks nothing of the pause; the second's pause holds the open days.
  const first = readFileSync(new URL("../contracts/GiftEscrow.sol", import.meta.url), "utf8");
  const drain = first.slice(first.indexOf("function drain("), first.indexOf("function withdrawEarned("));
  assert.doesNotMatch(drain, /checkInPaused/);
  assert.match(read("contracts/GiftEscrowV2.sol"), /holds every open day \/\/\/ rather than taking it/);
  // R-14, the other side of its correction: a pause across a climb's deadline lengthens that climb, and the page says so.
  assert.ok(contracts.includes("So a pause sent across a climb&apos;s deadline gives that climb up to seven days more than its funder signed"));
  assert.match(read("contracts/MilestoneGiftV2.sol"), /A climb \/\/\/ whose deadline fell inside the pause is judged on a reading taken until the pause \/\/\/ ended/);
  // The second version's bounds are the contracts' own constants.
  for (const file of ["contracts/GiftEscrowV2.sol", "contracts/MilestoneGiftV2.sol"]) {
    const source = read(file);
    for (const constant of ["MAX_PAUSE = 7 days", "PAUSE_REST = 7 days", "SIGNER_DELAY = 24 hours", "error OwnershipIsNotRenounceable();", "error GoalAlreadyRegistered();"]) assert.ok(source.includes(constant), `${file}: ${constant}`);
  }
  // The legal notice says the same, in the words a person reads.
  const legal = read("app/legal/page.tsx");
  assert.doesNotMatch(legal, /the worst a pause can do is hold a day open/);
  assert.doesNotMatch(legal, /They can never move money/);
  assert.doesNotMatch(legal, /outside the team/);
  assert.doesNotMatch(read("app/privacy/page.tsx"), /outside the team/);
  assert.ok(legal.includes("a day whose time to be caught up has passed still goes back to the person who offered it, pause or not"));
  assert.ok(legal.includes("Whoever holds that key could sign a reading nobody made"));
});

test("a short code is promised only where one is asked: never of an account the funder named", () => {
  for (const file of ["src/conditions.ts", "src/condition-proof.ts", "app/components/MilestoneJudges.tsx"]) {
    assert.doesNotMatch(read(file), /prove it is theirs with a short code when they open it|proves it is theirs with a short code when they open the gift|where the recipient puts a one-hour code to prove the account is theirs/, file);
  }
  assert.ok(read("src/condition-proof.ts").includes("that naming is the whole tie: no code is asked, so whoever opens the link is paid when that account gets there."));
  assert.ok(read("src/conditions.ts").includes("Only that Chess.com account can earn this gift. Check the name: nobody is asked to prove it is theirs."));
  assert.ok(page.includes("When the funder names the account, on Duolingo, Chess.com or Codeforces, that naming is the whole tie"));
  // The code's own rule: a code is asked only of an account the recipient named.
  assert.match(read("src/milestone-routes.ts"), /if \(record\.usernameSource !== "recipient"\) throw new GiftApiError\("NO_CODE_NEEDED"/);
  assert.match(read("src/duolingo-public-checkin.ts"), /purpose === "bind" && record\.usernameSource === "recipient"/);
});

test("stale sentences are gone: Coursera is open, no verifier is on the chain, a climb is not read twice a day", () => {
  assert.doesNotMatch(page, /That condition is not open yet/);
  assert.doesNotMatch(page, /the three proofs are shown here/);
  assert.doesNotMatch(page, /the on-chain Duolingo verifier/);
  assert.doesNotMatch(page, /it reads twice a day/);
  assert.doesNotMatch(read("app/components/MilestoneJudges.tsx"), /Viky reads twice a day/);
  assert.match(read("src/conditions.ts"), /id: "coursera-certificate",[^}]*?state: "open"/);
  assert.match(read("src/reclaim-proof-set.ts"), /PINNED_RECLAIM_WITNESS/);
  assert.match(read("src/frequent-pass.ts"), /A pass over the milestones still climbing every five minutes/);
});

test("the second version's three contracts are on the page with the transactions that made and handed them over", () => {
  for (const hash of [
    "0x8be062b29a506c17b581587f2ba0b2f8d1460cd5fc2705e0aa191a2f9c8ac409",
    "0x15c355472e145a6d70e3d25af7bcee2bcc1c1560e80e0940e3a460bd7678bd4c",
    "0xe0a2b4127067d5c24282254886a8e32da9667e835c24dd98461e4e4a3c90d412",
    "0x5a8dca52982b71dba715feb187e33f0494f4412c3cbb984147d97d4bf63aeae9",
    "0xb5b8b17b735fffb5a0323ee52b3eccbe0ee58c24ecf2703bdf6bee0c1222921e",
    "0x4125aef710d8017a09fcc8c842ce9808d2b7def366dfc0befaa61f05413b171b",
    "0x0c2e70edd97c91d010527ef930d60c2e12fd25578109a3e4cd94e0f57cec5397",
    "0x10e8d50ec6c88d9492cbcc7d826b6afc5b7753cb046c033ae4898411131457b5",
    "0x32ec292bd099897081bac962f95efacc40fdfbb87e0092cd58f8d75537ab181a",
  ]) assert.ok(page.includes(`<Tx hash="${hash}" />`), hash);
  // The addresses are the settings', never typed into the page, and nothing is said to work before a gift has run.
  assert.ok(page.includes("{escrowV2 && milestoneV2 && anchor ? ("));
  assert.doesNotMatch(page, /0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51|0x493c87A27E637bBc7179C17bE2B215fC18523CC0|0x2a15DF23fF62120700f14D1E5d5d56CA0dAd027e/);
  assert.ok(page.includes('nothing is claimed as working on {escrowV3 ? "one of them" : "it"} before one has, end to end, with real amounts'));
  // The chain is asked about the seven, and each gift contract for the key it accepts.
  const chain = read("src/judges-chain.ts");
  for (const getter of ["giftEscrowV2Address()", "milestoneGiftV2Address()", "consentAnchorAddress()", 'getter: "evidenceSigner"', 'getter: "pendingEvidenceSigner"', 'getter: "anchorer"']) assert.ok(chain.includes(getter), getter);
  assert.ok(read("src/judges-owner.ts").includes('{ label: "the anchor of agreements", key: "NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS" }'));
});

test("the anchor is said to be a record, not what a reading is decided on, with the command that checks it", () => {
  const mera = read("app/judges/JudgesMera.tsx");
  assert.ok(mera.includes("It is not what a reading is decided on: that is still the signed row in Viky&apos;s database"));
  assert.ok(mera.includes("So the anchor does not prevent a reading without a yes: it lets anybody see one."));
  assert.ok(mera.includes('<CopyLine command="pnpm verify:consent" />'));
  assert.equal(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts["verify:consent"], "tsx scripts/verify-consent.ts");
  // What those sentences rest on: the server's own account of it, and the contract's.
  assert.match(read("src/consent-anchoring.ts"), /The anchor is a public record of the agreement, not what \* the reading is decided on: that is still the row\./);
  assert.match(read("contracts/ConsentAnchor.sol"), /`bind` takes the account's own signature \(EIP-712 \/\/\/ `ConsentKey`\) over the consent key, and keeps the first one for ever\./);
});

test("the third daily contract is everywhere the page counts or names the contracts (the audit of 8 Oct 2026)", () => {
  // Under Network, where a daily gift is made today: its address is the setting's, its deployment is on the chain,
  // and the second version's daily contract is said to run the gifts it holds.
  assert.ok(page.includes("const escrowV3 = giftEscrowV3Address();"));
  assert.ok(page.includes('<Tx hash="0xe6edce353863afaf302f3840068a5bb92300fb8380d234d8477afb5983a897f3" />), the third version of the daily contract,'));
  assert.ok(page.includes("), runs the gifts it holds."));
  assert.doesNotMatch(page, /0x591d76863177E70FfcA2C793212d4715A367Ec70/, "never typed into the page");
  assert.ok(page.includes('The source of {escrowV3 ? "the four" : "the three"} is verified through'));
  // Who owns the contracts: asked of the chain with the others, and first, since a daily gift made today is on it.
  const owner = read("src/judges-owner.ts");
  assert.ok(owner.indexOf('{ label: "third-version daily gifts", key: "NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS" }') > 0);
  assert.ok(owner.indexOf('key: "NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS"') < owner.indexOf('key: "NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS" }'));
  // Whether AUSD's issuer froze a contract that holds gifts' money: it holds some.
  assert.ok(read("app/judges/JudgesAgora.tsx").includes('{ label: "third-version daily gifts", address: giftEscrowV3Address() },'));
  // A pause of readings holds the open days on the second and third daily contracts: the third does as the second.
  const third = read("contracts/GiftEscrowV3.sol");
  assert.match(third, /uint256 clock = _standsStill\(\) \? checkInPauseBegan : block\.timestamp;/);
  assert.match(read("contracts/GiftEscrowV2.sol"), /uint256 clock = _standsStill\(\) \? checkInPauseBegan : block\.timestamp;/);
  assert.ok(page.includes("owner holds the open days, on the second and third versions of the daily contract and not on the first."));
  assert.ok(read("app/judges/JudgesReliability.tsx").includes("pausing readings before that hour does, on those two versions and not on the first."));
  const contracts = read("app/judges/JudgesContracts.tsx");
  assert.ok(contracts.includes("What the owner of a gift contract of the second version, or of the third daily contract, can do, read from the"));
  assert.ok(contracts.includes("On the daily contracts, the second version&apos;s and the"));
  for (const stale of ["on the second version of the daily contract alone", "on the second version alone", "It follows seven contracts"]) {
    for (const file of ["app/judges/page.tsx", "app/judges/JudgesReliability.tsx", "app/judges/JudgesContracts.tsx", "app/judges/JudgesIndex.tsx"]) assert.ok(!read(file).includes(stale), `${file}: ${stale}`);
  }
});

test("the index block names the contracts the deployment read follows, from what it holds, and says when the third is not among them", () => {
  // The index's address is a setting and changes at every deployment: the page read one made before the third daily
  // contract until the founder set the new address, and said "seven contracts" with a number written in.
  const gift = (version: 1 | 2 | 3) => ({ version }) as never;
  assert.equal(followsThirdDailyContract({ gifts: [gift(1), gift(2)] }), false);
  assert.equal(followsThirdDailyContract({ gifts: [gift(1), gift(3)] }), true);
  assert.equal(followsThirdDailyContract({ gifts: [] }), false);
  const index = read("app/judges/JudgesIndex.tsx");
  assert.ok(index.includes('{third ? "the daily contract of the third version, " : ""}the way out and'));
  assert.ok(index.includes("const thirdMissing = !third && giftEscrowV3Address() !== null;"));
  assert.ok(index.includes("does not follow it: a daily gift made"));
  // And the count of who used Viky says the same, rather than a count that looks whole.
  const who = read("app/judges/JudgesWhoUsed.tsx");
  assert.ok(who.includes("{giftEscrowV3Address() !== null && !followsThirdDailyContract(index) ? ("));
  assert.ok(who.includes("The index read here does not follow the third daily contract: a daily gift made since 3 Oct 2026 is not"));
});

// Sentences of the judges page the code no longer held (the audit of 8 Oct 2026, points 6 and 7), each with the code
// that makes the new one true.

test("a day's ceiling and the month's limit hold no day: the page says the day stays open, then goes back", () => {
  assert.doesNotMatch(page, /nothing is settled against the gift, and its page says when reading resumes/);
  assert.doesNotMatch(page, /nothing is settled against a reading that was not taken/);
  assert.ok(page.includes("The ceiling holds no day: a day not read stays open until its catch-up window closes, 30 hours after it ends, and then goes back to the funder like a missed day, whoever was at fault."));
  assert.ok(page.includes("The limit holds no day: a day waiting for a reading stays open until its catch-up window closes, then goes back to the funder like a missed day."));
  // What the reliability block already said, and the contract: a day is drained once its window has elapsed, whoever asks.
  assert.ok(read("app/judges/JudgesReliability.tsx").includes("A failure of ours does not hold a day past its window."));
  assert.match(read("contracts/GiftEscrowV3.sol"), /function drain\(uint256 giftId\) external \{/);
  // On the screen the ceiling's sentence no longer says nothing is lost, and gives the hour the day counts until.
  assert.doesNotMatch(read("src/sentences.ts").slice(read("src/sentences.ts").indexOf("export const CEILING"), read("src/sentences.ts").indexOf("export type Reserve")), /Nothing is lost\.`/);
  assert.ok(read("src/client/limit.ts").includes("${dayCeilingInWords()} ${openDayInWords(outcome.countableUntil, true, null)}"));
});

test("what Viky asks of Duolingo is said for the contract a daily gift is made on today", () => {
  assert.ok(page.includes("On the first two versions of the daily contract Viky reads a profile once a day for each gift made on it"));
  assert.ok(page.includes("it looks at the profile every quarter of an hour while a day of the gift is open, and once a minute while the gift's page is open, plainly; an attested reading is taken only for a lesson a look saw"));
  // The quarter of an hour, the minute, and the look that comes before any reading.
  assert.match(read("src/frequent-pass.ts"), /export const FREQUENT_DAILY_PASS_EVERY_SECONDS = 14 \* 60;/);
  assert.match(read("app/kit/LiveReading.tsx"), /60_000|EVERY_MS|every minute|once a minute/i);
  assert.ok(read("src/daily-look.ts").includes("if (noDay) return { kind: \"refused\", refusal: noDay };"), "no day open, and the source is not even asked");
});

test("the card services are said in the order the pay sheet tries them", () => {
  assert.doesNotMatch(page, /A third way is Rampnow/);
  assert.ok(page.includes('The pay sheet tries them in this order:{" "} {waysIn().map((way) => way.name).join(", then ")}.'));
  assert.ok(page.includes("{rampnowOn ? ( <> {rampnowWay} {rampWay} </> ) : ( <> {rampWay} {rampnowWay} </> )}"));
  // The order is the code's: Rampnow first where it is on, then the two there were.
  assert.deepEqual(waysIn({ rampnow: true }).map((way) => way.name), ["Rampnow", "Ramp", "Mercuryo"]);
  assert.deepEqual(waysIn({}).map((way) => way.name), ["Ramp", "Mercuryo"]);
});

test("the judges' path names the button as Me draws it, and says what each path asks of them", () => {
  assert.ok(page.includes("press Me, then Other account, open the link and press Open my gift, which creates a second account"));
  assert.doesNotMatch(page, /then Use another account/);
  assert.equal(ME.otherAccount, "Other account");
  assert.ok(read("app/kit/Me.tsx").includes("name={W.otherAccount}"));
  assert.ok(page.includes("Each path asks something of you: Duolingo, an account there, and a lesson done after you connect it; Chess.com, an account there, and one rating point won."));
  // With no account of a source, the short path (the audit of 9 Oct 2026): open the gift, "Stop", "End the gift". The
  // page sent that judge to a link the portal's instructions might give.
  assert.ok(page.includes("With no account of a source, the short path is the next step: open the gift, then end it."));
  // What the Duolingo path asks before it is one press: the name typed on the card, by the label the card gives it.
  assert.ok(page.includes("For Duolingo, type your own Duolingo name on the card, under &quot;Their Duolingo name&quot;, and connecting is one press."));
  assert.ok(read("src/conditions.ts").includes('label: "Their Duolingo name"'));
  assert.ok(page.includes("Press &quot;Stop&quot;, then &quot;End the gift&quot;, and confirm: all of it goes back to the account that paid."));
  assert.ok(page.indexOf("With no account of a source") < page.indexOf("data-try-short-path"));
  assert.ok(!page.includes("give you the link of a gift made for you"));
  // The two words are the gift page's own.
  assert.deepEqual([YOU_DECIDE.stop, YOU_DECIDE.endTheGift], ["Stop", "End the gift"]);
});

test("three sentences the audit of 9 Oct 2026 found late: two equal delays, the destination's name, and how long the code works", () => {
  // "between 10 minutes and 10 minutes": two delays that differ by seconds and are said in the same words are one.
  const reliability = read("app/judges/JudgesReliability.tsx");
  assert.ok(reliability.includes("if (delay(plan.soonestSeconds) === delay(plan.latestSeconds)) return `They began ${delay(plan.latestSeconds)} after that minute.`;"));
  assert.ok(reliability.indexOf("delay(plan.soonestSeconds) === delay(plan.latestSeconds)") < reliability.indexOf("They began between"));
  // The destination is called Me: the judges' own account said "You".
  assert.equal(NAV.me, "Me");
  const account = read("app/components/JudgesAccount.tsx");
  assert.ok(account.includes("come back here through Me, For judges, to read it.") && account.includes("then come back through Me, For judges."));
  assert.doesNotMatch(account, /through You,/);
  // Until when the code works, from the moment the route refuses it: the last day before it, in UTC.
  assert.equal(new Date(JUDGE_CREDIT_ENDS - 1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), "4 Nov 2026");
  assert.ok(page.includes("<span data-judge-code-until>The code works until {lastDayOfTheCode()}, UTC.</span>"));
  assert.ok(page.includes("return new Date(JUDGE_CREDIT_ENDS - 1).toLocaleDateString("));
});

test("the sentences the audit of 9 Oct 2026 asked to redo from the code: a provider never written to, a climb's reading, the races, the rhythm", () => {
  const register = read("src/condition-proof.ts");
  // Nothing is written to a provider (the founder): the page promised to ask Bitrefill, and said two questions "had
  // not been answered" that were never asked.
  assert.ok(page.includes("Personal API for the pilot, the risk assumed and written here. The pilot&apos;s limits"));
  assert.doesNotMatch(page, /is to ask Bitrefill|Business API when the time comes/);
  assert.equal((register.match(/and that question has not been asked\./g) ?? []).length, 2);
  assert.doesNotMatch(register, /has not been answered/);
  // A climb has no button for its reading: it is read as its page opens, which the gift's page says of itself.
  assert.ok(page.includes("once it is reached open the gift&apos;s page: a climb is read as its page opens, and has no button for it."));
  assert.doesNotMatch(page, /ask for the reading from the gift/);
  const gift = read("app/components/GiftPage.tsx");
  assert.ok(gift.includes("A milestone is read as its page opens, so it has no button for it"));
  // And its person's alone (the audit of 8 Oct 2026): the route answers anybody else "Open the gift first."
  assert.ok(gift.includes("{mine && !milestone && !gift.finished && gift.connected"), "Count now is a habit's button, never a climb's");
  // The races are the register's own count, and no town is named, on the page or in the register it prints.
  assert.ok(page.includes("({RACE_RESULT_KEPT.races} races in {RACE_RESULT_KEPT.countries} countries)"));
  assert.ok(page.includes("const RACE_RESULT_KEPT = { races: RACE_RESULT_RACES.length, countries: new Set(RACE_RESULT_RACES.map((race) => race.country)).size } as const;"));
  assert.deepEqual([RACE_RESULT_RACES.length, new Set(RACE_RESULT_RACES.map((race) => race.country)).size], [35, 11]);
  assert.doesNotMatch(page + register, /2,126 coming|Lusaka|Francistown|Marathon de Dakar/);
  // The rhythm of readings since the third daily contract, in the register as in the page's own steps.
  assert.ok(register.includes('inShort: "Read from Duolingo the day the lesson is done.'));
  assert.ok(register.includes("read through an attested fetch the day the lesson is done: when the gift's page is opened after the lesson, or within a quarter of an hour."));
  assert.ok(page.includes("when the gift's page is opened after the lesson, or within a quarter of an hour"), "the page's own step says the same");
  assert.ok(register.includes("read through an attested fetch when the climb starts and when its target is reached, and checked the same way as Duolingo."));
  assert.ok(register.includes("when the person binds the account, when the climb starts and when its target is reached"));
  assert.doesNotMatch(register, /Read each morning from Duolingo|read once a morning|read every day through an attested fetch|at every daily reading/);
});


test("the final audit of 9 Oct 2026: a link to a section opens it, and six sentences say what the screens do", () => {
  // The four links of the first block led to a fold that stayed shut: the page now follows the address as it changes.
  const contents = read("app/judges/JudgesContents.tsx");
  assert.ok(contents.includes('const followed = () => openSection(decodeURIComponent(window.location.hash.slice(1)));'));
  assert.ok(contents.includes('window.addEventListener("hashchange", followed);') && contents.includes('return () => window.removeEventListener("hashchange", followed);'));
  // The key stands right above the pay button since 9 Oct 2026.
  assert.ok(page.includes("Without the link, press &quot;Have a code?&quot;, right above the pay button, and type the code from those instructions."));
  assert.doesNotMatch(page, /under the card&apos;s button and type the code/);
  // What comes back from the passkey alone, and what the first device kept as a convenience.
  assert.ok(page.includes("sign out, clear this site&apos;s storage or take another device, and sign in with the same passkey. The account, its gifts and its money come back from the passkey alone."));
  assert.ok(page.includes("What the first device kept (which passkey to offer, a gift&apos;s link, the theme) is a convenience the account does not need."));
  assert.doesNotMatch(page, /nothing was kept on the first device/);
  // A payment left before its end: on the device that paid, for a day.
  assert.ok(page.includes("for a day, on the device that paid, the screen that waits leads back to it"));
  // The race's line reads three timing companies: it is not printed under one's name.
  const conditions = read("src/conditions.ts");
  assert.ok(conditions.includes(`source: "the race's timing company",`));
  assert.doesNotMatch(conditions, /source: "Breizh Chrono"/);
  // In the index, the date of a gift is the day it was made, said so beside its state.
  assert.ok(read("app/judges/JudgesIndex.tsx").includes("{gift.status}, made {dayOf(gift.createdAt)}"));
});
