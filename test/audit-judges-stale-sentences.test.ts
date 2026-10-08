// Sentences of the judges page that the chain no longer answers (the money path audit of 27 Sep 2026): the earlier
// contract's balance, the goals signed on 26 Sep 2026, and when the founder's key took the contracts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followsThirdDailyContract } from "../src/envio-index";
import { MILESTONE_GOALS } from "../src/milestone-goals";

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
  assert.ok(page.includes("To see the other side on this device: copy the link, press Me, then Use another account, open the link and press Create my account. Press Open my gift, then connect the source."));
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
