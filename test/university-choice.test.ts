import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GET as listGet } from "../app/api/portals/route";
import { GET as searchGet } from "../app/api/portals/search/route";
import { configurePortalStore, ensurePortalSchema, FOLD_FROM, FOLD_TO, foldForSearch, savePortalRows } from "../src/portal-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { ADD_UNIVERSITY, SHOW_PROOF, UNIVERSITY_CHOICE } from "../src/sentences";
import { countInWords, indexUniversities, inGroups, matching, senseOfCondition, shownUniversities, sortName, type ListedUniversity } from "../src/university-choice";
import { readySenses } from "../src/university-ready";

/**
 * "Which university?" (D247, D313, the founder, 29 and 30 Sep 2026): the world's list, read whole, opens on every
 * country; a country chip narrows it, and one field searches it at once.
 */

const one = (pair: string, title: string, issuer: string, country: string): ListedUniversity => ({ pair, title, issuer, country });
const LIST = [
  one("ucad-sn", "Université Cheikh Anta Diop", "Senegal", "SN"),
  one("ugb-sn", "Université Gaston Berger", "Senegal", "SN"),
  one("bem-sn", "BEM Dakar Management School", "Senegal", "SN"),
];

test("a country's list in two groups, the ones ready today first, the search on both, and a ready one never twice", () => {
  const list = [...LIST, { ...one("uadb-sn", "Université Alioune Diop de Bambey", "Senegal", "SN"), ready: ["enrolment"] as const }];
  assert.deepEqual(inGroups(list, "", "enrolment").ready.map((u) => u.pair), ["uadb-sn"]);
  assert.deepEqual(inGroups(list, "", "enrolment").others.map((u) => u.pair), ["bem-sn", "ucad-sn", "ugb-sn"]);
  assert.deepEqual(inGroups(list, "universite", "enrolment").ready.map((u) => u.pair), ["uadb-sn"]);
  assert.deepEqual(inGroups(list, "universite", "enrolment").others.map((u) => u.pair), ["ucad-sn", "ugb-sn"]);
  assert.deepEqual(inGroups(list, "bem", "enrolment"), { ready: [], others: [LIST[2]] });
});

test("ready today is said of what the gift asks: a university read for enrolment is not ready for a grade (the UI pass of 8 Oct 2026)", () => {
  const list = [...LIST, { ...one("uadb-sn", "Université Alioune Diop de Bambey", "Senegal", "SN"), ready: ["enrolment"] as const }];
  assert.equal(senseOfCondition("university-enrollment-shown"), "enrolment");
  assert.equal(senseOfCondition("university-year-passed-shown"), "results");
  assert.equal(senseOfCondition("university-grade-shown"), "results");
  // The same senses the gift's own page reads each condition by.
  assert.match(readFileSync("src/milestone-status.ts", "utf8"), /"university-enrollment-shown": "enrolment",\n  "university-year-passed-shown": "results",\n  "university-grade-shown": "results",/);
  assert.deepEqual(inGroups(list, "", "results").ready, [], "its results page has no provider yet: it is set up like any other");
  assert.deepEqual(inGroups(list, "", "results").others.map((u) => u.pair), ["uadb-sn", "bem-sn", "ucad-sn", "ugb-sn"]);
  const index = indexUniversities(list);
  assert.deepEqual(shownUniversities(index, "", null, "enrolment").ready.map((u) => u.pair), ["uadb-sn"]);
  assert.deepEqual(shownUniversities(index, "", null, "results").ready, []);
  assert.deepEqual(shownUniversities(index, "", "FR", "enrolment"), { ready: [], others: [] });
  // The chooser asks by the gift's own condition.
  const chooser = readFileSync("app/kit/offer/UniversityChooser.tsx", "utf8");
  assert.match(chooser, /const sense = senseOfCondition\(draft\.conditionId\);/);
  assert.match(chooser, /shownUniversities\(index, typed, country, sense\)/);
});

test("which universities are ready: a witness provider with its rule pinned, made by a first proof or ahead of one", () => {
  const pin = { providerVersion: "3.0.0", url: "https://portal.test/", method: "POST", responseMatches: "[]", responseRedactions: "[]", specHash: `0x${"11".repeat(32)}` };
  const witness = (over: Record<string, unknown>) => ({ portalId: "utoulouse-fr", providerId: "p", verification: "witness", domain: "utoulouse.fr", providerVersion: "3.0.0", requestHash: "", extract: null, pin: null, ...over }) as never;
  // Toulouse on 8 Oct 2026: pinned ahead of any proof on a rule written by hand. Its students can show today.
  assert.deepEqual(readySenses({ enrolment: witness({ pin: { ...pin, ahead: true, fixed: true } }) }), ["enrolment"]);
  assert.deepEqual(readySenses({ enrolment: witness({ pin }) }), ["enrolment"]);
  assert.deepEqual(readySenses({ enrolment: witness({ pin }), results: witness({ pin }) }), ["enrolment", "results"]);
  // A witness provider no proof has pinned yet, a provider being built, and none at all.
  assert.deepEqual(readySenses({ enrolment: witness({ pin: null }) }), []);
  assert.deepEqual(readySenses({}), []);
  // A provider taken from Reclaim's directory, as Rome's is, is not said ready by a rule: it goes up on its own checks.
  assert.deepEqual(readySenses({ enrolment: witness({ verification: "tee", pin: null, requestHash: `0x${"22".repeat(32)}` }) }), []);
});

test("the second group's heading counts what it holds, by the thousand once there are thousands", () => {
  assert.equal(countInWords(11_412), "11,000");
  assert.equal(countInWords(11_000), "11,000");
  assert.equal(countInWords(999), "999");
  assert.equal(countInWords(312), "312");
  assert.equal(countInWords(1), "1");
  assert.equal(UNIVERSITY_CHOICE.more(countInWords(11_412)), "11,000 more, added on request within two days");
  assert.equal(UNIVERSITY_CHOICE.moreAlone(countInWords(312)), "312 universities, added on request within two days");
  assert.equal(UNIVERSITY_CHOICE.moreAlone(countInWords(1)), "1 university, added on request within two days");
  // At 390 the heading of eleven thousand takes two lines: cut evenly, never one word alone on the second.
  assert.match(readFileSync("app/kit/ChoiceList.tsx", "utf8"), /lines \? `\$\{CARD_LABEL\} mb-\[var\(--space-sm\)\] \[text-wrap:balance\]`/);
  const chooser = readFileSync("app/kit/offer/UniversityChooser.tsx", "utf8");
  assert.match(chooser, /legend=\{\(shown\.ready\.length > 0 \? W\.more : W\.moreAlone\)\(countInWords\(shown\.others\.length\)\)\}/);
  // The line that said it under the heading is gone: the heading says it.
  assert.doesNotMatch(chooser, /note=\{/);
});

test("the search within a country: every word, without case or accents, by name, and all of them when nothing is typed", () => {
  assert.deepEqual(matching(LIST, "").map((u) => u.pair), ["bem-sn", "ucad-sn", "ugb-sn"]);
  assert.deepEqual(matching(LIST, "universite cheikh").map((u) => u.pair), ["ucad-sn"]);
  assert.deepEqual(matching(LIST, "sorbonne"), []);
});

test("the list route gives the countries with their counts, then one country's universities, and nothing else", async () => {
  const db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePortalStore(executor);
  try {
    await ensurePortalSchema();
    const operator = "0x000000000000000000000000000000000000a11c";
    await savePortalRows([
      { portalId: "ucad-sn", name: "UCAD", university: "Université Cheikh Anta Diop", country: "SN", loginUrl: "https://studentcenter.ucad.sn/login", provenBy: operator },
      { portalId: "ugb-sn", name: "UGB", university: "Université Gaston Berger", country: "SN", loginUrl: "https://portail.ugbnumerique.sn/", provenBy: operator },
      { portalId: "unilag-ng", name: "UNILAG", university: "University of Lagos", country: "NG", loginUrl: "https://studentportal.unilag.edu.ng/", provenBy: operator },
    ]);
    const countries = (await (await listGet(new Request("https://viky.test/api/portals"))).json()) as { countries: { code: string; count: number }[] };
    assert.deepEqual(countries.countries, [{ code: "NG", count: 1 }, { code: "SN", count: 2 }]);
    const senegal = (await (await listGet(new Request("https://viky.test/api/portals?country=sn"))).json()) as { results: ListedUniversity[] };
    assert.deepEqual(senegal.results.map((u) => u.pair), ["ucad-sn", "ugb-sn"]);
    assert.deepEqual(Object.keys(senegal.results[0]).sort(), ["country", "issuer", "pair", "ready", "scale", "title"], "no sign-in address, no provider; the scale a grade is typed on, and what it is ready for, for grouping");
    assert.deepEqual(senegal.results[0].ready, []);
    assert.equal(senegal.results[0].scale, null);
    assert.equal(senegal.results[0].issuer, "Senegal");
    assert.equal((await listGet(new Request("https://viky.test/api/portals?country=Senegal"))).status, 400);
  } finally {
    configurePortalStore(undefined);
    await db.close();
  }
});

test("the chooser lists names alone, says nothing about checking, and invites the student's own university (D264)", () => {
  const chooser = readFileSync("app/kit/offer/UniversityChooser.tsx", "utf8");
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(sheet, /certificate\.course\?\.search\?\.listed \? \(/, "the university's question takes the list");
  assert.match(chooser, /<CountryPicker[\s\S]*chip=\{W\.inCountry\}\n\s*everywhere=\{W\.everywhere\}/, "the country as a chip that narrows the list, and every country first");
  assert.match(chooser, /const \[country, setCountry\] = useState<string \| null>\(null\);/, "no country guessed: the one paying is often not in the student's country");
  assert.doesNotMatch(chooser, /W\.reading\}<\/p>|Reading the/, "no sentence while the list is read: empty lines hold its place");
  // Nothing about checking in the chooser: that is said folded on the gift's page, where the proof is shown.
  assert.doesNotMatch(chooser, /<details|<summary|navigator\.share|clipboard/);
  assert.deepEqual(Object.keys(UNIVERSITY_CHOICE).sort(), ["addYours", "change", "country", "everywhere", "inCountry", "more", "moreAlone", "notListed", "nothing", "reading", "ready", "search", "unreadable"]);
  // The two groups' words, as the founder validated them on the mockup of 8 Oct 2026, and nothing on each line.
  assert.equal(UNIVERSITY_CHOICE.ready, "Ready today");
  assert.equal(UNIVERSITY_CHOICE.more("11,000"), "11,000 more, added on request within two days");
  assert.doesNotMatch(JSON.stringify([...Object.values(UNIVERSITY_CHOICE).filter((v) => typeof v === "string"), UNIVERSITY_CHOICE.more("1"), UNIVERSITY_CHOICE.moreAlone("1")]), /unverified|password|proof|checked|connected|tested/i);
  // One line under the list: the question and the link to the page a student adds theirs from.
  assert.equal(`${UNIVERSITY_CHOICE.notListed} ${UNIVERSITY_CHOICE.addYours}`, "Yours isn't here? Add your university");
  // The question, and beside it a small button to the page a student adds theirs from: never a link in the text.
  assert.match(chooser, /<p className=\{HELP\}>\{W\.notListed\}<\/p>\n\s*<Link href="\/add-your-university" className=\{`\$\{SMALL_BUTTON\} no-underline`\}>/);
  assert.ok(existsSync("app/add-your-university/page.tsx"), "the page the link opens");
  // The page opens on three lines for somebody who is paying (the founder's words, 9 Oct 2026): it opened on a
  // student's procedure, which a payer read as theirs to do. The procedure is under a fold named by whom it is for.
  const page = readFileSync("app/add-your-university/page.tsx", "utf8");
  assert.deepEqual(ADD_UNIVERSITY.forAPayer, ["Offer the gift anyway.", "We set your university up within two days.", "You have nothing else to do."]);
  assert.equal(ADD_UNIVERSITY.forTheStudent, "Are you the student?");
  assert.ok(page.indexOf("W.forAPayer.map") < page.indexOf(`<details className="said-fold" data-for-the-student="">`), "the three lines, then the fold");
  const fold = page.slice(page.indexOf(`<details className="said-fold" data-for-the-student="">`), page.indexOf("</details>"));
  for (const inside of ["{W.forTheStudent}", "<FoldChevron />", "{W.intro}", "W.steps.map", "{W.never}", "{W.next}"]) assert.ok(fold.includes(inside), inside);
  assert.ok(!page.slice(0, page.indexOf("<details")).includes("W.intro"), "nothing of the procedure stands in the open");
  assert.doesNotMatch(card, /UNIVERSITY_CHOICE/, "no coming-soon line on the card since D258");
});

test("a listed university is its name alone, never marked unverified (D264)", () => {
  const store = readFileSync("src/portal-store.ts", "utf8");
  const listed = store.slice(store.indexOf("export function portalListed"), store.indexOf("}\n", store.indexOf("export function portalListed")));
  assert.match(listed, /title: portal\.university,/);
  assert.doesNotMatch(listed, /UNVERIFIED_MARK|unverified/);
});

test("the chosen university is its name and its country, and the gift's sentence says nothing more (D313)", async () => {
  const { chosenUniversityTitle } = await import("../src/university-choice");
  const { universityNamed } = await import("../src/milestone-conditions");
  const title = chosenUniversityTitle({ pair: "du-bd", title: "University of Dhaka", issuer: "Bangladesh", country: "BD" });
  assert.equal(universityNamed("", title), "This gift will be for University of Dhaka, Bangladesh.");
});

test("the list shows every university, drawn a hundred at a time as its end comes near, never only the first ones", () => {
  // The founder, 29 Sep 2026: no list shows twelve and hides the rest. Eleven thousand lines are drawn as they come
  // near rather than at once, and nothing stops the next hundred.
  const chooser = readFileSync("app/kit/offer/UniversityChooser.tsx", "utf8");
  assert.match(chooser, /const PAGE = 100;/);
  assert.match(chooser, /options=\{shown\.others\.slice\(0, count\)\.map\(line\)\}/);
  assert.match(chooser, /\{shown\.others\.length > count \? <MoreWhenNear onNear=\{\(\) => setDrawn\(\{ key: listKey, count: count \+ PAGE \}\)\} \/> : null\}/);
  assert.doesNotMatch(chooser, /slice\(0, \d+\)/);
  assert.equal(UNIVERSITY_CHOICE.inCountry("France"), "In France");
  assert.equal(UNIVERSITY_CHOICE.everywhere, "All countries");
});

test("the whole list is indexed once by own name, and shown whole, narrowed by country and by every word typed", () => {
  const list = [
    one("ut1-fr", "Toulouse I Capitole University", "France", "FR"),
    { ...one("ucad-sn", "Université Cheikh Anta Diop", "Senegal", "SN"), ready: ["enrolment"] as const },
    one("ut3-fr", "Université de Toulouse (Paul Sabatier)", "France", "FR"),
    one("ugb-sn", "Université Gaston Berger", "Senegal", "SN"),
  ];
  const index = indexUniversities(list);
  const pairs = (words: string, country: string | null) => {
    const shown = shownUniversities(index, words, country, "enrolment");
    return [shown.ready.map((u) => u.pair), shown.others.map((u) => u.pair)];
  };
  assert.deepEqual(pairs("", null), [["ucad-sn"], ["ugb-sn", "ut3-fr", "ut1-fr"]], "every country, the ones ready today first, the others by own name");
  assert.deepEqual(pairs("", "FR"), [[], ["ut3-fr", "ut1-fr"]], "Toulouse (Paul Sabatier) beside Toulouse I Capitole");
  assert.deepEqual(pairs("toulouse universite", null), [[], ["ut3-fr"]], "every word, in any order, without its accent");
  assert.deepEqual(pairs("cheikh", "FR"), [[], []], "a country narrows the search too");
});

test("the whole list comes in one answer kept five minutes at the edge, and the search route finds every word, accents aside", async () => {
  const db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePortalStore(executor);
  try {
    await ensurePortalSchema();
    const operator = "0x000000000000000000000000000000000000a11c";
    const row = (portalId: string, university: string, country: string) => ({ portalId, name: portalId, university, country, loginUrl: `https://${portalId}.example/`, provenBy: operator });
    await savePortalRows([
      row("ut3-fr", "Université de Toulouse (Paul Sabatier)", "FR"),
      row("ut1-fr", "Toulouse I Capitole University", "FR"),
      row("ucad-sn", "Université Cheikh Anta Diop", "SN"),
      row("uwr-pl", "Uniwersytet Wrocławski", "PL"),
      row("ucam-gb", "University of Cambridge", "GB"),
    ]);
    const whole = await listGet(new Request("https://viky.test/api/portals?all=1"));
    assert.match(String(whole.headers.get("cache-control")), /public, max-age=0, s-maxage=300/);
    const everything = ((await whole.json()) as { results: ListedUniversity[] }).results;
    assert.deepEqual(everything.map((u) => u.pair).sort(), ["ucad-sn", "ucam-gb", "ut1-fr", "ut3-fr", "uwr-pl"], "every country, every university");
    assert.deepEqual(Object.keys(everything[0]).sort(), ["country", "issuer", "pair", "ready", "scale", "title"], "the shape of a country's list");

    const search = async (query: string) => (await (await searchGet(new Request(`https://viky.test/api/portals/search?${query}`))).json()) as { results: ListedUniversity[]; more: boolean };
    const pairs = async (query: string) => (await search(query)).results.map((u) => u.pair);
    assert.deepEqual(await pairs("q=toulouse"), ["ut1-fr", "ut3-fr"]);
    assert.deepEqual(await pairs("q=sabatier%20universite"), ["ut3-fr"], "every word, in any order, without its accent");
    assert.deepEqual(await pairs("q=UNIVERSITÉ%20cheikh"), ["ucad-sn"], "an accent typed where the name has one, in capitals");
    assert.deepEqual(await pairs("q=wroclaw"), ["uwr-pl"], "a letter no accent rule folds");
    assert.deepEqual(await pairs("q=toulouse&except=FR"), [], "the country already listed whole is left out");
    assert.deepEqual(await pairs("q=cambridge&except=FR"), ["ucam-gb"]);
    assert.deepEqual(await pairs("q=sn"), ["ucad-sn"], "a country's two letters");
    const answer = await search("q=cambridge");
    assert.deepEqual(Object.keys(answer.results[0]).sort(), ["country", "issuer", "pair", "ready", "scale", "title"], "the shape of a country's list");
    assert.equal(answer.more, false);
    assert.equal((await searchGet(new Request("https://viky.test/api/portals/search?q=%25"))).status, 400);
  } finally {
    configurePortalStore(undefined);
    await db.close();
  }
});

test("the table's names and the words typed are folded by the same pairs", () => {
  assert.equal([...FOLD_FROM].length, [...FOLD_TO].length, "translate needs one letter for one letter");
  assert.match(FOLD_TO, /^[a-z]+$/);
  assert.equal(foldForSearch("Université Wrocławski ØSTFOLD"), "universite wroclawski ostfold");
});

test("the list is sorted by each university's own name, so a city's universities stand together", () => {
  // The founder, 29 Sep 2026: "Université de Toulouse" was at U, far from "Toulouse I Capitole University" at T.
  assert.equal(sortName("Université de Toulouse"), "toulouse");
  assert.equal(sortName("University of Toulouse Jean Jaurès"), "toulouse jean jaures");
  assert.equal(sortName("Université Cheikh Anta Diop"), "cheikh anta diop");
  assert.equal(sortName("Toulouse I Capitole University"), "toulouse i capitole university");
  assert.equal(sortName("University"), "university", "a name that is only the word keeps it");
  assert.equal(sortName('University "Petre Andrei" Iasi'), 'petre andrei" iasi', "a quote the name opens on is not what it sorts by");
  assert.equal(sortName("'Konrad Wolf' Film University Babelsberg"), "konrad wolf' film university babelsberg");
  const one = (title: string): ListedUniversity => ({ pair: title, title, issuer: "France", country: "FR" });
  const sorted = matching([one("Université de Toulouse"), one("Angers University"), one("Toulouse I Capitole University"), one("University of Toulouse Jean Jaurès"), one("Université Paris-Saclay")], "").map((u) => u.title);
  assert.deepEqual(sorted, ["Angers University", "Université Paris-Saclay", "Université de Toulouse", "Toulouse I Capitole University", "University of Toulouse Jean Jaurès"]);
});

test("the show-it block says a page opens, and nothing about where it opens", () => {
  // On a phone the verification opens in its own app, not a browser tab (the founder, 29 Sep 2026).
  assert.equal(SHOW_PROOF.whatHappens("your university"), "A verification page opens. You sign in to your university there, and what that page shows is proved without Viky ever seeing your password.");
});
