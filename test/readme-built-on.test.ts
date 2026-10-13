// What Viky is built on, said at the README's head and on the judges page (the founder, 10 Oct 2026): Monad, Agora's
// AUSD and its Instant Settlement, Mera, Envio, Alchemy and Reclaim, each with the file or the page that shows it. The
// README named neither Agora, nor Alchemy, nor Instant Settlement until that day. Every figure in those sentences is
// held here to the register it comes from, so a figure that moves in the code fails this before it lies in the README.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { AGORA_TESTNET_RUN, testnetTransactionUrl } from "../src/agora-testnet";
import { FAMILIES, liveConditions } from "../src/conditions";
import { fourFigures, standInTheReadme, standOf, standsCounted } from "../src/condition-stands";
import { OPENS_ON_REQUEST, READ_WITHOUT_A_GIFT } from "../src/judges-ways";
import { CONDITION_NATURE } from "../src/sentences";
import { providerWords } from "../src/judges-chain";
import { ARRIVAL, BLOCK_TIME, creditedDayMon, dollarsOf, FINALITY_GAP, monWords } from "../src/measured";
import { providersAskedFirst, PUBLIC_RPC_URL, rpcProviderOf } from "../src/monad/chain";
import { USE_MONEY } from "../src/sentences";

const README = readFileSync("README.md", "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/** A section of the README, from its heading to the next one of the same rank. */
function section(title: string): string {
  const from = README.indexOf(`\n## ${title}\n`);
  assert.ok(from >= 0, `the README has a section "${title}"`);
  const next = README.indexOf("\n## ", from + 1);
  return flat(README.slice(from, next < 0 ? undefined : next));
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

test("what Viky is built on: six rows, each figure the register's own, each file in the tree", () => {
  const built = section("What Viky is built on");
  for (const name of ["Monad", "AUSD, Agora's dollar", "Mera", "Envio HyperIndex", "Alchemy", "Reclaim"]) assert.ok(built.includes(`| **${name}** |`), name);
  // Monad: the block time, the finality gap and a credited day's cost are the measured ones (src/measured.ts).
  assert.deepEqual([FINALITY_GAP.fewestBlocks, FINALITY_GAP.mostBlocks], [1, 2]);
  assert.ok(built.includes(`A step is final one or two blocks after its own, at a block every ${BLOCK_TIME.seconds} s.`));
  assert.ok(built.includes(`A credited day costs ${monWords(creditedDayMon())}, about ${dollarsOf(creditedDayMon())}, and Viky's relayer pays it.`));
  // Agora: the one run made, on testnet and said as that, with its whole transaction behind the short one.
  const run = AGORA_TESTNET_RUN;
  assert.ok(run, "the testnet run is recorded");
  assert.equal(run.ausdIn, 10_000_000n);
  assert.equal(run.otherCoinOut, 10n * 10n ** 18n);
  assert.ok(built.includes(`On ${run.day}, on Monad testnet, the way out sent 10.00 test AUSD through Agora's Instant Settlement pair and got 10.00 of the pair's other test coin back, one for one, on one signature.`));
  assert.ok(README.includes(`[\`${run.exit.slice(0, 6)}…${run.exit.slice(-4)}\`](${testnetTransactionUrl(run.exit)})`));
  // The row ends on the run, which it says was made on testnet: what has not run on mainnet is the judges page's to say.
  assert.ok(built.includes("one for one, on one signature. | `pnpm agora:testnet check`"));
  // Mera: the gestures counted, and the two keys of one prompt.
  assert.equal(ARRIVAL.gestures.length, 2);
  assert.ok(built.includes("Two gestures take a person from a gift's link to their first transaction."));
  // Envio: the contracts the index follows, as the judges page says them from the index it reads. The converter of
  // card payments is not one of them, and the row does not say every contract.
  assert.ok(built.includes("The events of the gift contracts, the way out and the anchor of agreements are indexed."));
  assert.match(readFileSync("app/judges/JudgesIndex.tsx", "utf8"), /It follows the two gift contracts of each of\s+the first two versions, the earlier gift contract, [^]*?the way out and\s+the anchor of agreements\./);
  assert.match(readFileSync("docs/INDEXER.md", "utf8"), /names the contracts of \[Contracts\]\(CONTRACTS\.md\), all but the converter/);
  // Every file and every command a row sends to is there.
  for (const file of ["src/account/mera.ts", "src/client/consent-key.ts", "src/monad/chain.ts", "docs/VERIFICATION.md"]) assert.ok(built.includes(file) && existsSync(file), file);
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const command of ["agora:testnet", "verify:consent"]) assert.ok(built.includes(`\`pnpm ${command}`) && command in scripts, command);
  // The folds of the judges page a row names by their title.
  assert.match(readFileSync("app/judges/JudgesAgora.tsx", "utf8"), /<Fold id="agora" title="AUSD, Agora's dollar:/);
  assert.match(readFileSync("app/judges/JudgesIndex.tsx", "utf8"), /<Fold id="index" title="The index of the contracts' events">/);
});

test("Alchemy is named from the deployment's own setting: by its host, never by its endpoint", () => {
  // The transport the README sends to asks the configured provider first, then the public endpoint.
  const chain = readFileSync("src/monad/chain.ts", "utf8");
  assert.match(chain, /return fallback\(\[http\(rpcUrl\), http\(PUBLIC_RPC_URL\)\]\);/);
  assert.ok(section("What Viky is built on").includes("On viky.cash, every read a browser makes of Monad goes through Alchemy's Monad RPC first, with Monad's public endpoint behind it. | `monadTransport`, `src/monad/chain.ts`"));
  // A provider is known by its host alone.
  assert.equal(rpcProviderOf("https://monad-mainnet.g.alchemy.com/v2/a-key"), "Alchemy");
  for (const other of [PUBLIC_RPC_URL, "https://alchemy.com.example.org/v2/a-key", "https://notalchemy.com/", "http://127.0.0.1:8547", "", "not an address"]) assert.equal(rpcProviderOf(other), null, other);
  // What the deployment asks first, for a browser and for the server, from its two settings.
  const kept = { browser: process.env.NEXT_PUBLIC_MONAD_RPC_URL, server: process.env.MONAD_RPC_URL };
  const set = (browser?: string, server?: string) => {
    for (const [name, value] of [["NEXT_PUBLIC_MONAD_RPC_URL", browser], ["MONAD_RPC_URL", server]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return providersAskedFirst();
  };
  try {
    const alchemy = "https://monad-mainnet.g.alchemy.com/v2/a-key";
    assert.deepEqual(set(), { browser: null, server: null });
    assert.deepEqual(set(alchemy), { browser: "Alchemy", server: "Alchemy" });
    assert.deepEqual(set(alchemy, "https://another.example.org/a-key"), { browser: "Alchemy", server: null });
    assert.deepEqual(set(undefined, alchemy), { browser: null, server: "Alchemy" });
  } finally {
    set(kept.browser, kept.server);
  }
  // The sentence under Network, for each of those, and nothing where no provider has a name.
  const then = "Monad RPC first, with the public endpoint above behind it.";
  assert.equal(providerWords({ browser: "Alchemy", server: "Alchemy" }), `The app's own reads of Monad go through Alchemy's ${then}`);
  assert.equal(providerWords({ browser: "Alchemy", server: null }), `The reads a browser makes of Monad go through Alchemy's ${then}`);
  assert.equal(providerWords({ browser: null, server: "Alchemy" }), `The server's reads of Monad go through Alchemy's ${then}`);
  assert.equal(providerWords({ browser: null, server: null }), null);
  // The page prints that sentence as it is read, and writes no provider's name itself.
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /const askedFirst = providerWords\(\);/);
  assert.match(page, /\{askedFirst \? \(\s*<span className="block" data-network="provider">\s*\{askedFirst\}/);
  assert.doesNotMatch(page, /Alchemy/);
});

test("no card service is called licensed in the sentence that covers them all", () => {
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /A funder pays by card, through a card service, never to Viky\./);
  assert.doesNotMatch(page, /licensed (service|partner)/);
  // The one licence the page sources is Ramp's own, in Ramp's block.
  assert.match(page, /href="https:\/\/rampnetwork\.com\/licenses-and-registrations"/);
});

test("the conditions the README counts are the catalogue's: one sentence of four figures, then one line a condition (the founder, 12 Oct 2026)", () => {
  const live = liveConditions();
  const capital = (count: number) => `${NUMBER_WORDS[count]![0]!.toUpperCase()}${NUMBER_WORDS[count]!.slice(1)}`;
  const heading = `${capital(live.length)} conditions`;
  const from = README.indexOf(`\n## ${heading}\n`);
  assert.ok(from >= 0, heading);
  const said = README.slice(from, README.indexOf("\n## ", from + 1));
  // Where each stood on 12 Oct 2026: the real proofs that had paid by that day (5 days, 3 enrolments and 2 climbs),
  // and Strava offered on request and not opened. The same function the two pages ask, with the counts they read live.
  const counts = new Map([["duolingo-daily", 5], ["university-enrollment-shown", 3], ["chess-rating", 2]]);
  const toBeOpened = new Set(["strava-daily"]);
  const counted = standsCounted(counts, toBeOpened);
  assert.deepEqual(counted, { paid: 3, read: 10, waiting: 4, onRequest: 1, total: 18 });
  assert.equal(fourFigures(counted!), "3 paid with real money, 10 read on their real page, 4 open and waiting for their first person, 1 on request.");
  assert.ok(said.includes(`**${fourFigures(counted!)}**\nA condition is proven the day the thing happens: a lesson is daily, a race has a date, a university gives its results\nonce a year.`));
  // The table: a line a condition, in the register's order, family by family; a family is named on its first line.
  const rows = said.split("\n").filter((line) => line.startsWith("| ")).map((line) => line.slice(2, -2).split(" | "));
  assert.deepEqual(rows[0], ["Family", "Condition", "How it is read", `Where it stands, ${READ_WITHOUT_A_GIFT.on}`]);
  const inOrder = FAMILIES.flatMap((family) => live.filter((condition) => condition.family === family.id).map((condition, at) => ({ family: at === 0 ? `**${family.title}**` : "", condition })));
  assert.equal(rows.length - 1, inOrder.length);
  const bold = (cell: string) => (cell === "Paid with real money" ? `**${cell}**` : cell);
  for (const [at, { family, condition }] of inOrder.entries()) {
    const row = rows[at + 1]!;
    assert.equal(row[0], family, condition.id);
    // The condition by the register's own name, without the word its third column already says.
    assert.equal(row[1], condition.name.replace(/, shown$/, ""), condition.id);
    // How it is read, in the app's own words for a nature.
    const nature = CONDITION_NATURE[condition.nature];
    assert.equal(row[2], `${nature[0]}${nature.slice(1).toLowerCase()}`, condition.id);
    // Where it stands: the one phrase of src/condition-stands.ts, without a count or a day in the cell.
    assert.equal(row[3], bold(standInTheReadme(standOf(condition, counts, toBeOpened))), condition.id);
  }
  // The ten read on their real page are the register's list, each of which gave a proof that day.
  assert.equal(READ_WITHOUT_A_GIFT.conditions.length, 10);
  assert.equal(rows.filter((row) => row[3] === "Read on its real page").length, 10);
  // Under the table: what Strava's request is, in the founder's sentence, and the universities beyond the first.
  assert.ok(said.replace(/\s+/g, " ").includes(OPENS_ON_REQUEST["strava-daily"]!));
  assert.ok(said.includes("The university conditions work at any of 11,000 universities: the first is read today, each other is set up within two\ndays of a first gift."));
  assert.match(readFileSync("app/judges/JudgesUniversities.tsx", "utf8"), /more: each set up within two days of a first gift\./);
  // The counts themselves are the judges page's, read as it is served: the README gives none that could go stale.
  assert.ok(said.includes("Live counts and what each one proves: [the judges page](https://viky.cash/judges)."));
  assert.doesNotMatch(said, /\d+ real proofs?/);
  assert.doesNotMatch(README, /Seventeen conditions|is built and closed/);
});

test("how money leaves is the register's six ways, its routes are named, and the word check is said in its own section", () => {
  // The five ways out the screen names, and the send to another account.
  assert.deepEqual(Object.keys(USE_MONEY.ways).sort(), ["bank", "bankOrCard", "card", "giftcard", "mobile", "phone"]);
  assert.match(readFileSync("app/judges/JudgesAgora.tsx", "utf8"), /Send to another Viky account of mine/);
  const money = section("Pay in, spend and withdraw");
  assert.ok(money.includes("Money earned leaves the way the person's country allows: to a bank account, to a card, to a mobile money number, as phone credit, as a gift card, or on to another Viky account."));
  assert.ok(money.includes("Rampnow is offered first where it serves the payer"));
  assert.ok(money.includes("Ramp serves bank withdrawals. Mercuryo serves card withdrawals."));
  assert.ok(money.includes("Switch Labs sends to mobile money. Bitrefill provides phone credit, data, and gift cards."));
  // No word of crypto: a coin is named on a service's own page, and in the lines of Viky that say what to pick there.
  const words = section("No word of crypto");
  assert.ok(words.includes("Where it does not, Viky says what to pick there in the service's own two words, quoted as its page prints them."));
  const sentences = readFileSync("src/sentences.ts", "utf8");
  assert.match(sentences, /`Receive: \$\{delivers\.coin\}\.`/);
  assert.match(sentences, /are the two words \$\{name\} uses for the money it delivers to Viky/);
  assert.match(sentences, /\$\{coin\}, the one marked \$\{network\}/);
  for (const file of ["src/consumer-words.ts", "scripts/check-consumer-words.ts", "test/browser/screens.spec.ts"]) assert.ok(words.includes(`\`${file}\``) && existsSync(file), file);
  // The plan's own paragraph keeps the half about an association, and sends to the section for the check.
  const path = flat(readFileSync("docs/PATH-FORWARD.md", "utf8"));
  assert.ok(path.includes('An association that declines because "it is crypto": a word leaked onto a screen, which the check under [No word of crypto](../README.md#no-word-of-crypto) reads for at every change.'));
  assert.doesNotMatch(path, /A check looks for seven/);
});

test("the two sentences that stood as notes are written, dated, and the studies are said in one sentence", () => {
  const peopleSource = readFileSync("docs/THE-TWO-PEOPLE.md", "utf8");
  const people = flat(peopleSource);
  assert.ok(people.includes("By 10 Oct 2026, four people outside the team had used Viky. Two funded a gift, and one who earned a gift used that money to offer one in turn."));
  assert.ok(people.includes("The judges page records events and accounts from the contracts; it does not infer a count of people from them."));
  assert.ok(people.includes("The four included a grandma."));
  assert.doesNotMatch(README, /\[N\] people outside the team/);
  // The studies are said as what they are for, then the practical observations get their own heading (the founder,
  // 10 Oct 2026).
  assert.match(peopleSource, /These studies are why the design is what it is\.\n\n## What using it with people showed us/);
  assert.doesNotMatch(README, /These studies have their limits|not proof that Viky works/);
  const path = flat(readFileSync("docs/PATH-FORWARD.md", "utf8"));
  assert.ok(path.includes("The student channel is open. On 7 Oct 2026 a student in Toulouse showed his enrolment from his university's own portal and the gift paid. On 9 Oct 2026 a second gift paid 20 seconds after he signed in to that portal, with nobody reviewing it."));
  assert.doesNotMatch(README, /The student channel opens once/);
  // Both passes are the ones "What has run with real money" gives the transactions of.
  const ran = section("What has run with real money");
  assert.match(ran, /Toulouse, 9 Oct 2026: a student showed their enrolment, and the gift paid 20 seconds after they signed in to their university's portal, with no review\./);
  assert.match(ran, /7 Oct, 12:15: opened by the student/);
});
