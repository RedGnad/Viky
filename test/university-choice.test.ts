import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GET as listGet } from "../app/api/portals/route";
import { configurePortalStore, ensurePortalSchema, savePortalRows } from "../src/portal-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { UNIVERSITY_CHOICE } from "../src/sentences";
import { matching, type ListedUniversity } from "../src/university-choice";

/**
 * "Which university?" (D247, D313): the world's list, read a country at a time. The country in the same sheet with a
 * search as "Where you live", then that country's universities searched within. One line of help, the rest folded.
 */

const one = (pair: string, title: string, issuer: string, country: string): ListedUniversity => ({ pair, title, issuer, country });
const LIST = [
  one("ucad-sn", "Université Cheikh Anta Diop", "Senegal", "SN"),
  one("ugb-sn", "Université Gaston Berger", "Senegal", "SN"),
  one("bem-sn", "BEM Dakar Management School", "Senegal", "SN"),
];

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
    assert.deepEqual(Object.keys(senegal.results[0]).sort(), ["country", "issuer", "pair", "scale", "title"], "no sign-in address, no provider; the scale a grade is typed on, when pinned");
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
  assert.match(chooser, /<CountryPicker/, "the country in the same sheet as \"Where you live\" (D313)");
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

test("the chosen university is its name and its country, and the gift's sentence says nothing more (D313)", async () => {
  const { chosenUniversityTitle } = await import("../src/university-choice");
  const { universityNamed } = await import("../src/milestone-conditions");
  const title = chosenUniversityTitle({ pair: "du-bd", title: "University of Dhaka", issuer: "Bangladesh", country: "BD" });
  assert.equal(universityNamed("", title), "This gift will be for University of Dhaka, Bangladesh.");
});
