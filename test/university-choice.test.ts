import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { after, before } from "node:test";
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
    assert.deepEqual(Object.keys(answer.results[0]).sort(), ["country", "issuer", "pair", "title"], "no sign-in address, no provider");
    assert.equal(answer.results[0].pair, "ucad-sn");
    assert.equal(answer.results[0].country, "SN");
  } finally {
    configurePortalStore(undefined);
    await db.close();
  }
});

test("the sheet asks it as the brief says, one line of help, the rest folded, and the card says what comes next", () => {
  const chooser = readFileSync("app/kit/offer/UniversityChooser.tsx", "utf8");
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(sheet, /certificate\.course\?\.search\?\.listed \? \(/, "the university's question takes the list");
  assert.match(chooser, /choiceMode\(list\.length\) === "radios"/);
  assert.match(chooser, /<summary className="cursor-pointer font-medium">\{W\.howChecked\}<\/summary>/);
  assert.equal(UNIVERSITY_CHOICE.help.split(". ").length, 1, "one sentence");
  assert.match(UNIVERSITY_CHOICE.how.join(" "), /password never reaches Viky/);
  assert.match(UNIVERSITY_CHOICE.how.join(" "), /nothing about their marks is read/);
  assert.equal(UNIVERSITY_CHOICE.soon, "Passed the year, and grades: soon, university by university.");
  // Not listed: the funder hands the student the page the catalogue line wrote (D246), by share sheet or clipboard.
  assert.match(chooser, /\$\{window\.location\.origin\}\/add-your-university/);
  assert.match(chooser, /navigator\.share\(\{ text: W\.shareText, url \}\)/);
  assert.ok(existsSync("app/add-your-university/page.tsx"), "the page the link opens");
  assert.match(UNIVERSITY_CHOICE.notHere, /about ten minutes/);
  assert.match(card, /draft\.conditionId === UNIVERSITY_ENROLLMENT_SHOWN\.id \? <span className=\{`\$\{HELP\} text-center`\}>\{UNIVERSITY_CHOICE\.soon\}<\/span>/);
});
