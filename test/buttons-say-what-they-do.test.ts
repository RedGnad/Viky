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

test("what only opens a sentence is a fold named by a question, drawn as the fold of 'Have a code?'", () => {
  const words = conditionById("duolingo-daily")?.recipient;
  assert.ok(words);
  assert.equal(words.notYours, "Not your Duolingo name?");
  assert.equal(words.notYet, "No Duolingo yet?");
  for (const [mark, name, sentence] of [
    ["data-not-your-name", "words.notYours", "W.namedWrong(funderName)"],
    ["data-no-source-yet", "field.notYet", "W.notYetBody(funderName)"],
  ] as const) {
    const from = connect.indexOf(`<details className="said-fold" ${mark}="">`);
    assert.ok(from > 0, mark);
    const fold = connect.slice(from, connect.indexOf("</details>", from));
    assert.ok(fold.includes(`<summary className="said-fold-name">`) && fold.includes(`{${name}}`) && fold.includes("<FoldChevron />"), `${mark}: the fold's own name and chevron`);
    assert.ok(fold.includes(`<div className="said-fold-body`) && fold.includes(`{${sentence}}`), `${mark}: the sentence inside`);
    assert.doesNotMatch(fold, /<button/, "no button in it");
  }
  // "No Duolingo yet?" says what to do before it says what becomes of the money, and a button opens Duolingo's own
  // site and says so.
  const how = words.notYetHow;
  assert.equal(how.says, "Duolingo is free. Install it, make your account, then come back here with your username.");
  assert.equal(how.open, "Open Duolingo");
  assert.equal(how.href, "https://www.duolingo.com");
  const noSource = connect.slice(connect.indexOf(`data-no-source-yet=""`));
  assert.ok(noSource.indexOf("{field.notYetHow.says}") > 0 && noSource.indexOf("{field.notYetHow.says}") < noSource.indexOf("{field.notYetHow.open}"), "what to do, then the button");
  assert.ok(noSource.indexOf("{field.notYetHow.open}") < noSource.indexOf("{W.notYetBody(funderName)}"), "the money after");
  assert.match(noSource, /<a href=\{field\.notYetHow\.href\} target="_blank" rel="noopener noreferrer" className=\{`\$\{SMALL_BUTTON\} self-start`\} data-open-the-source="">\n\s*\{field\.notYetHow\.open\}/);
  // The same component as the pay sheet's "Have a code?".
  assert.match(readFileSync("app/kit/offer/JudgeCode.tsx", "utf8"), /<details className="said-fold" data-have-a-code="">\n\s*<summary className="said-fold-name">/);
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
  assert.match(paying, /W\.arrived\.short\(arrivedFigure, gift, moneyIn\(more, "EUR"\), `\$\$\{makeIt\}`\)/);
  assert.match(paying, /\{W\.arrived\.payMore\(moneyIn\(more, "EUR"\)\)\}/);
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /EUR more/);
});
