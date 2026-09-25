import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GET as listGet } from "../app/api/portals/route";
import { configurePortalStore, ensurePortalSchema, savePortal } from "../src/portal-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { UNIVERSITY_CHOICE } from "../src/sentences";
import { byCountry, choiceMode, CORRIDOR_COUNTRIES, inCountry, RADIOS_UP_TO, type ListedUniversity } from "../src/university-choice";

/**
 * "Which university?" (D247, the advisor's brief of 25 Sep 2026): up to five, radios grouped by country and no search;
 * beyond, the country first with the corridor's in front, then the search within it. One line of help, the rest folded.
 */

const one = (pair: string, title: string, issuer: string, country: string): ListedUniversity => ({ pair, title, issuer, country });
const LIST = [
  one("aur-it", "The American University of Rome", "Italy", "IT"),
  one("ufhb-ci", "Université Félix Houphouët-Boigny", "Côte d’Ivoire", "CI"),
  one("ucad-sn", "Université Cheikh Anta Diop", "Senegal", "SN"),
  one("ugb-sn", "Université Gaston Berger", "Senegal", "SN"),
  one("ub-es", "Universitat de Barcelona", "Spain", "ES"),
  one("sorbonne-fr", "Sorbonne Université", "France", "FR"),
];

test("five or fewer is a list of radios; one more and the country is asked first", () => {
  assert.equal(RADIOS_UP_TO, 5, "Material's bound for radio buttons");
  assert.equal(choiceMode(1), "radios");
  assert.equal(choiceMode(5), "radios");
  assert.equal(choiceMode(6), "country-first");
});

test("grouped by country, the corridor's first in its order, then the others by name, and each country's by name", () => {
  assert.deepEqual(CORRIDOR_COUNTRIES, ["sn", "ci", "fr"]);
  const groups = byCountry(LIST);
  assert.deepEqual(groups.map((group) => group.code), ["SN", "CI", "FR", "IT", "ES"]);
  assert.deepEqual(groups[0].universities.map((u) => u.pair), ["ucad-sn", "ugb-sn"]);
  assert.equal(groups[0].name, "Senegal");
});

test("the search within a country: every word, without case or accents, and all of them when nothing is typed", () => {
  assert.deepEqual(inCountry(LIST, "SN", "").map((u) => u.pair), ["ucad-sn", "ugb-sn"]);
  assert.deepEqual(inCountry(LIST, "SN", "universite cheikh").map((u) => u.pair), ["ucad-sn"]);
  assert.deepEqual(inCountry(LIST, "SN", "sorbonne"), [], "another country's university is not found here");
});

test("the list route gives every portal with its country, and nothing else", async () => {
  const db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePortalStore(executor);
  try {
    await ensurePortalSchema();
    await savePortal({
      portalId: "ucad-sn",
      name: "UCAD, espace étudiant",
      university: "Université Cheikh Anta Diop",
      country: "SN",
      providerId: "67ec1b13-b206-4fac-a78c-fbd5a2af55b3",
      providerVersion: "1.0.0",
      requestHash: `0x${"ab".repeat(32)}`,
      loginUrl: "https://ent.ucad.sn/login",
      extract: { field: "status", matches: "^(Inscrit|Enrolled)", keeps: "whether the status says enrolled, and nothing else" },
      provenBy: "0x000000000000000000000000000000000000a11c",
    });
    const answer = (await (await listGet(new Request("https://viky.test/api/portals"))).json()) as { results: ListedUniversity[] };
    assert.equal(answer.results.length, 1);
    assert.deepEqual(Object.keys(answer.results[0]).sort(), ["country", "issuer", "pair", "proves", "title"], "no sign-in address, no provider; what it proves, for the gift's sentence (D267)");
    assert.equal(answer.results[0].proves, "enrolment");
    assert.equal(answer.results[0].pair, "ucad-sn");
    assert.equal(answer.results[0].country, "SN");
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
  assert.match(chooser, /choiceMode\(list\.length\) === "radios"/);
  // Nothing about checking in the chooser: that is said folded on the gift's page, where the proof is shown.
  assert.doesNotMatch(chooser, /<details|<summary|navigator\.share|clipboard/);
  assert.deepEqual(Object.keys(UNIVERSITY_CHOICE).sort(), ["addYours", "country", "none", "notListed", "nothingThere", "reading", "searchIn", "unreadable"]);
  assert.doesNotMatch(JSON.stringify(Object.values(UNIVERSITY_CHOICE).filter((v) => typeof v === "string")), /unverified|password|proof|checked|connected/i);
  // One line under the list: the question and the link to the page a student adds theirs from.
  assert.equal(`${UNIVERSITY_CHOICE.notListed} ${UNIVERSITY_CHOICE.addYours}`, "Yours isn't here? Add your university");
  assert.match(chooser, /\{W\.notListed\}\{" "\}\n\s*<Link href="\/add-your-university"/);
  assert.ok(existsSync("app/add-your-university/page.tsx"), "the page the link opens");
  assert.doesNotMatch(card, /UNIVERSITY_CHOICE/, "no coming-soon line on the card since D258");
});

test("a listed university is its name alone, never marked unverified (D264)", () => {
  const store = readFileSync("src/portal-store.ts", "utf8");
  const listed = store.slice(store.indexOf("export function portalListed"), store.indexOf("}\n", store.indexOf("export function portalListed")));
  assert.match(listed, /title: portal\.university,/);
  assert.doesNotMatch(listed, /UNVERIFIED_MARK|unverified/);
});

test("a portal that proves a student account keeps its name alone on the list, and the gift's sentence says what it proves", async () => {
  const { chosenUniversityTitle } = await import("../src/university-choice");
  const { universityNamed } = await import("../src/milestone-conditions");
  const listed = { pair: "du-bd", title: "University of Dhaka", issuer: "Bangladesh", country: "BD", proves: "account" as const };
  const title = chosenUniversityTitle(listed);
  assert.equal(universityNamed("", title), "This gift will be for University of Dhaka, Bangladesh. Its student portal shows that a student account is active, not that they are enrolled this year: that is what this gift will check.");
  assert.equal(chosenUniversityTitle({ ...listed, proves: "enrolment" }), "University of Dhaka, Bangladesh");
});
