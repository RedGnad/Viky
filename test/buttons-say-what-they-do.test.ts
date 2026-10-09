import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById } from "../src/conditions";
import { FUND, GIFT_PAGE, PAY } from "../src/sentences";

// A button says what its press does and never declares a state (the founder, 4 Oct 2026). What only opens a sentence
// is a fold, named by a question. And one screen writes an amount one way.

const connect = readFileSync("app/kit/ConnectTheSource.tsx", "utf8");

test("the buttons that declared a state say what their press does", () => {
  assert.equal(GIFT_PAGE.iAddedIt, "Check my profile");
  assert.equal(PAY.alreadyHaveAccount, "Sign in");
  assert.doesNotMatch(readFileSync("app/components/AccountPanel.tsx", "utf8"), /I already have an account/);
});

test("what only opens a sentence is a fold named by a question, with its chevron", () => {
  const words = conditionById("duolingo-daily")?.recipient;
  assert.ok(words);
  assert.equal(words.notYours, "Not your Duolingo name?");
  assert.equal(words.notYet, "No Duolingo yet?");
  for (const [mark, name, inside] of [
    ["data-not-your-name", "words.notYours", "{W.namedWrong(funderName)}"],
    ["data-no-source-yet", "field.notYet", "{field.notYetHow.says}"],
  ] as const) {
    const from = connect.indexOf(`<details className="said-fold" ${mark}="">`);
    assert.ok(from > 0, mark);
    const fold = connect.slice(from, connect.indexOf("</details>", from));
    assert.ok(fold.includes(`<summary className="said-fold-name">`) && fold.includes(`{${name}}`) && fold.includes("<FoldChevron />"), `${mark}: the fold's own name and chevron`);
    assert.ok(fold.includes(`<div className="said-fold-body`) && fold.includes(inside), `${mark}: what it holds`);
    assert.doesNotMatch(fold, /<button/, "no button in it");
  }
  // "No Duolingo yet?": the button that opens Duolingo's own site and says so, and one line (the founder, 4 Oct 2026).
  // It held two sentences more: how to get it, and what becomes of the money.
  const how = words.notYetHow;
  assert.equal(how.says, "Free. Come back with your username.");
  assert.equal(how.open, "Open Duolingo");
  assert.equal(how.href, "https://www.duolingo.com");
  const noSource = connect.slice(connect.indexOf(`data-no-source-yet=""`));
  const fold = noSource.slice(0, noSource.indexOf("</details>"));
  assert.ok(fold.indexOf("{field.notYetHow.open}") > 0 && fold.indexOf("{field.notYetHow.open}") < fold.indexOf("{field.notYetHow.says}"), "the button, then the line");
  assert.equal((fold.match(/<p /g) ?? []).length, 1, "one line, and no paragraph beside it");
  assert.match(fold, /<a href=\{field\.notYetHow\.href\} target="_blank" rel="noopener noreferrer" className=\{`\$\{SMALL_BUTTON\} self-start`\} data-open-the-source="">\n\s*\{field\.notYetHow\.open\}/);
  // "Have a code?" is no fold any more (the founder, 9 Oct 2026): its press opens a field and a button, so it is a
  // small key, above the total. Nothing leads back from it: the card's button never left.
  const code = readFileSync("app/kit/offer/JudgeCode.tsx", "utf8");
  assert.match(code, /onClick=\{\(\) => setShown\(true\)\} data-have-a-code="">\n\s*\{W\.code\.have\}/);
  assert.doesNotMatch(code, /<details/);
  assert.ok(!("without" in PAY.code));
  assert.doesNotMatch(readFileSync("app/kit/offer/PaySheet.tsx", "utf8"), /without a code/i);
  assert.doesNotMatch(connect, /notMineOpen|notYetOpen/, "nothing of the page's own opens them");
  // Where the person typed the name themselves, the button under the code opens the username's field again, and says
  // so: on that screen "name" is already the Duolingo name the code goes into.
  assert.equal(words.anotherUsername, "Use another username");
  assert.match(connect, /<button type="button" onClick=\{\(\) => setRenaming\(true\)\} className=\{SECONDARY_BUTTON\}>\n\s*\{words\.anotherUsername\}/);
  assert.doesNotMatch(readFileSync("src/conditions.ts", "utf8"), /Not my name/);
});

test("the screen of a payment that fell short writes what is left as its button does", () => {
  assert.equal(FUND.arrived.payMore("€5.00"), "Pay €5.00 more");
  assert.equal(FUND.arrived.short("$24.90", "$30.00", "€5.00", "$24.90"), "$24.90 arrived, less than the $30.00 for this gift. Pay €5.00 more, or make the gift $24.90.");
  const paying = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(paying, /W\.arrived\.short\(said\(arrived\), gift, moneyIn\(more, "EUR"\), makeItSaid\)/);
  assert.match(paying, /\{W\.arrived\.payMore\(moneyIn\(more, "EUR"\)\)\}/);
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /EUR more/);
});
