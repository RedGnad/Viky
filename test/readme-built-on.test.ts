// What Viky is built on, said at the README's head and on the judges page (the founder, 10 Oct 2026): Monad, Agora's
// AUSD and its Instant Settlement, Mera, Envio, Alchemy and Reclaim, each with the file or the page that shows it. The
// README named neither Agora, nor Alchemy, nor Instant Settlement until that day. Every figure in those sentences is
// held here to the register it comes from, so a figure that moves in the code fails this before it lies in the README.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { AGORA_TESTNET_RUN, testnetTransactionUrl } from "../src/agora-testnet";
import { FAMILIES, liveConditions } from "../src/conditions";
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

test("the conditions the README counts are the catalogue's, family by family", () => {
  const live = liveConditions();
  const heading = `${NUMBER_WORDS[live.length]![0]!.toUpperCase()}${NUMBER_WORDS[live.length]!.slice(1)} conditions, ${NUMBER_WORDS[FAMILIES.length]} families`;
  const said = section(heading);
  // Each family by the title the product gives it, in the product's order.
  const places = FAMILIES.map((family) => said.indexOf(`${family.title}:`));
  assert.ok(places.every((place) => place >= 0), "every family is named by its title");
  assert.deepEqual(places, [...places].sort((left, right) => left - right));
  // Each condition offered today is in its family's sentence, by the words below; one added to the catalogue fails here.
  const words: Record<string, string> = {
    "duolingo-daily": "a Duolingo lesson each day",
    "codeforces-rating": "a Codeforces rating",
    "credly-badge": "a Credly or Accredible credential",
    "accredible-credential": "a Credly or Accredible credential",
    "university-enrollment-shown": "enrolled, the year passed or a grade reached at any of 11,000 universities",
    "university-year-passed-shown": "enrolled, the year passed or a grade reached at any of 11,000 universities",
    "university-grade-shown": "enrolled, the year passed or a grade reached at any of 11,000 universities",
    "toefl-mybest-shown": "a TOEFL or Duolingo English Test score",
    "duolingo-english-test": "a TOEFL or Duolingo English Test score",
    "edx-certificate": "an edX, MIT or Coursera certificate",
    "mitx-online-certificate": "an edX, MIT or Coursera certificate",
    "coursera-certificate": "an edX, MIT or Coursera certificate",
    "chess-rating": "a Chess.com rating or puzzle record",
    "chess-tactics": "a Chess.com rating or puzzle record",
    "wca-time": "a cube time at a WCA competition",
    "strava-daily": "daily kilometres on Strava",
    "fitbit-daily": "daily active minutes on Fitbit",
    "marathon-finish": "a race finish read on the timing company's results page",
  };
  assert.deepEqual(live.map((condition) => condition.id).sort(), Object.keys(words).sort());
  for (const [at, family] of FAMILIES.entries()) {
    const sentence = said.slice(places[at]!, at + 1 < places.length ? places[at + 1]! : undefined);
    for (const condition of live.filter((one) => one.family === family.id)) assert.ok(sentence.includes(words[condition.id]!), `${condition.id} under ${family.title}`);
  }
  // The universities beyond the first are set up on request, in the words the judges page and the card say it.
  assert.ok(said.includes("(the first is read today; each other is set up within two days of a first gift)"));
  assert.match(readFileSync("app/judges/JudgesMinute.tsx", "utf8"), /more: each set up within two days of a first gift\./);
});

test("how money leaves is the register's six ways, and the word check is said in its own section", () => {
  // The five ways out the screen names, and the send to another account.
  assert.deepEqual(Object.keys(USE_MONEY.ways).sort(), ["bank", "bankOrCard", "card", "giftcard", "mobile", "phone"]);
  assert.match(readFileSync("app/judges/JudgesAgora.tsx", "utf8"), /Send to another Viky account of mine/);
  assert.ok(section("Who it is for, and the problem").includes("Money earned leaves the way the person's country allows: to a bank account, to a card, to a mobile money number, as phone credit, as a gift card, or on to another Viky account."));
  // No word of crypto: a coin is named on a service's own page, and in the lines of Viky that say what to pick there.
  const words = section("No word of crypto");
  assert.ok(words.includes("Where it does not, Viky says what to pick there in the service's own two words, quoted as its page prints them."));
  const sentences = readFileSync("src/sentences.ts", "utf8");
  assert.match(sentences, /`Receive: \$\{delivers\.coin\}\.`/);
  assert.match(sentences, /are the two words \$\{name\} uses for the money it delivers to Viky/);
  assert.match(sentences, /\$\{coin\}, the one marked \$\{network\}/);
  for (const file of ["src/consumer-words.ts", "scripts/check-consumer-words.ts", "test/browser/screens.spec.ts"]) assert.ok(words.includes(`\`${file}\``) && existsSync(file), file);
  // The plan's own paragraph keeps the half about an association, and sends to the section for the check.
  const path = section("Path forward: how the next hundred find Viky");
  assert.ok(path.includes('An association that declines because "it is crypto": a word leaked onto a screen, which the check under [No word of crypto](#no-word-of-crypto) reads for at every change.'));
  assert.doesNotMatch(path, /A check looks for seven/);
});

test("the two sentences that stood as notes are written, dated, and the studies are said in one sentence", () => {
  const people = section("What we know about the two people");
  assert.ok(people.includes("By 10 Oct 2026, four people outside the team had used Viky: two funded a gift, three opened one, and one who earned a gift used that money to offer one in turn."));
  assert.doesNotMatch(README, /\[N\] people outside the team/);
  // The studies are said as what they are for, in one sentence, with nothing after it (the founder, 10 Oct 2026).
  assert.ok(people.includes("These studies are why the design is what it is. **What using it with people showed us.**"));
  assert.doesNotMatch(README, /These studies have their limits|not proof that Viky works/);
  const path = section("Path forward: how the next hundred find Viky");
  assert.ok(path.includes("The student channel is open. On 7 Oct 2026 a student in Toulouse showed his enrolment from his university's own portal and the gift paid. On 9 Oct 2026 a second gift paid 20 seconds after he signed in to that portal, with nobody reviewing it."));
  assert.doesNotMatch(README, /The student channel opens once/);
  // Both passes are the ones "What has run with real money" gives the transactions of.
  const ran = section("What has run with real money");
  assert.match(ran, /Toulouse, 9 Oct 2026: a student showed their enrolment, and the gift paid 20 seconds after they signed in to their university's portal, with no review\./);
  assert.match(ran, /7 Oct, 12:15: opened by the student/);
});
