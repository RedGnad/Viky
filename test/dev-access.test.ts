import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { devPagesEnabled, isOperator, operatorAccounts } from "../src/dev-access";

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761";
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d";

describe("dev access", () => {
  it("parses the operator list, ignoring blanks and invalid entries, case-insensitively", () => {
    const set = operatorAccounts(` ${A.toLowerCase()} , nope,, ${B} `);
    assert.equal(set.size, 2);
    assert.ok(isOperator(A.toUpperCase().replace("0X", "0x"), `${A},${B}`));
    assert.ok(isOperator(B.toLowerCase(), `${A},${B}`));
  });

  it("refuses everyone when the list is empty or the account is unknown", () => {
    assert.equal(isOperator(A, ""), false);
    assert.equal(isOperator("0x0000000000000000000000000000000000000001", `${A}`), false);
    assert.equal(isOperator(null, `${A}`), false);
    assert.equal(isOperator("not-an-account", `${A}`), false);
  });

  it("keeps dev pages off unless both the switch and an operator list are set", () => {
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "1", VIKY_OPERATOR_ACCOUNTS: "" }), false);
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "0", VIKY_OPERATOR_ACCOUNTS: A }), false);
    assert.equal(devPagesEnabled({ VIKY_DEV_PAGES: "1", VIKY_OPERATOR_ACCOUNTS: A }), true);
  });

  it("opens the looks laboratory to the operator's signed-in account, without the switch that opens the pages which move money", () => {
    // The founder judges each screen and each movement on viky.cash, from his operator account (4 Oct 2026). The
    // operator's list is set there and the dev pages' switch is not: the laboratory draws example data and moves
    // nothing, so it opens on the account alone, and every other dev page stays the page that does not exist.
    const access = readFileSync("src/dev-access.ts", "utf8");
    const signedIn = access.slice(access.indexOf("export async function operatorIsSignedIn"), access.indexOf("/**", access.indexOf("export async function operatorIsSignedIn")));
    assert.match(signedIn, /if \(operatorAccounts\(\)\.size === 0\) return false;/);
    assert.doesNotMatch(signedIn, /devPagesEnabled/, "not the dev pages' switch");
    assert.match(signedIn, /return isOperator\(readAccountAuthSession\(request\)\.account\);/);
    assert.match(access, /export async function operatorCanSeeDevPages\(\): Promise<boolean> \{\n\s*if \(!devPagesEnabled\(\)\) return false;\n\s*return operatorIsSignedIn\(\);/, "the other dev pages still need both");
    const lab = readFileSync("app/dev/looks/lab.ts", "utf8");
    assert.match(lab, /if \(galleryOpen\(\)\) return;\n\s*if \(!\(await operatorIsSignedIn\(\)\)\) notFound\(\);/);
    // Every page of the laboratory passes that one door.
    for (const page of ["page.tsx", "[screen]/page.tsx", "motion/page.tsx", "reached/page.tsx", "gift-moments/page.tsx", "gift-moments/[example]/page.tsx", "character/page.tsx"]) {
      assert.match(readFileSync(`app/dev/looks/${page}`, "utf8"), /await requireLab\(\);/, page);
    }
  });

  it("gives each movement a button that plays it again, by itself", () => {
    // A day earned, a day that opens, a day gone back, the arrival, and a gift reached (the founder, 4 Oct 2026).
    const motion = readFileSync("app/kit/Motion.tsx", "utf8");
    assert.match(motion, /export function playMoment\(moment: "earned" \| "returned" \| "woken", root: Element\): void \{\n\s*if \(reduced\(\)\) return;/);
    const moments = readFileSync("app/dev/looks/ReplayMoments.tsx", "utf8");
    for (const id of ["earned", "woken", "returned"]) assert.ok(moments.includes(`{ id: "${id}"`), id);
    assert.match(moments, /if \(root\) playMoment\(day\.id, root\);/);
    assert.match(moments, /window\.dispatchEvent\(new Event\(REPLAY_ARRIVAL\)\)/);
    assert.match(moments, /href="\/dev\/looks\/reached\?who=recipient"/);
    // A character named from the drawings' file has no part the page can reach, and nothing of it moves: the three
    // days are written into the page, and so are the days of the arrival that move, as the product's own row draws them.
    assert.match(moments, /<Character state=\{day\.state\} variant=\{index\} drawn="inline" wakes=\{day\.id === "woken"\}/);
    const screen = readFileSync("app/dev/looks/MotionScreen.tsx", "utf8");
    assert.match(screen, /drawn=\{state === "earned" \|\| state === "returned" \|\| state === "today" \? "inline" : "referenced"\} wakes=\{state === "today"\}/);
    assert.match(screen, /<ReplayMoments \/>/);
    // The moment is a modal, over everything: it is offered again once it has been closed, and drawn anew each time.
    const reached = readFileSync("app/dev/looks/reached/LabReached.tsx", "utf8");
    assert.match(reached, /if \(!closed\) return <ReachedMoment key=\{playing\}/);
    assert.match(reached, /setClosed\(false\);\n\s*setPlaying\(\(times\) => times \+ 1\);/);
  });
});

