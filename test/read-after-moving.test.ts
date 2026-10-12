// The balances read after money has moved (the founder, 13 Oct 2026, after the final audit).
//
// On the screen that spends and withdraws, the read that follows a movement stood inside the try of the movement
// itself, at four places. When that read failed, the catch spoke of the movement: "Viky could not finish this, and
// nothing was taken." after a send the route had confirmed, "nothing left your account" after a send to a payout
// service, and "it is still yours, in the gift" once the gift's part was in the account. Held here: the movement is
// said as soon as its route has answered, and the read that follows cannot fail it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CASH_OUT } from "../src/sentences";

const screen = readFileSync("app/components/CashOut.tsx", "utf8");
const between = (from: string, to: string) => {
  const start = screen.indexOf(from);
  const end = screen.indexOf(to, start);
  assert.ok(start > 0 && end > start, `${from} ... ${to}`);
  return screen.slice(start, end);
};

test("the read that follows a movement never throws, and is made again until it answers", () => {
  assert.match(screen, /const readAfterMoving = async \(\): Promise<Record<string, bigint> \| undefined> => \{\s+const now = await refresh\(\)\.catch\(\(\) => undefined\);\s+setUnread\(now === undefined\);\s+return now;\s+\};/);
  assert.match(screen, /useEffect\(\(\) => \{\s+if \(!unread\) return;\s+const timer = setInterval\(\(\) => void refresh\(\)\.then\(\(\) => setUnread\(false\), \(\) => undefined\), 4_000\);\s+return \(\) => clearInterval\(timer\);\s+\}, \[unread, refresh\]\);/);
  // No read of the balances is left to throw inside a function that moves money: each is caught where it is made.
  const bare = [...screen.matchAll(/await refresh\(\);/g)];
  assert.equal(bare.length, 0, "a bare read after a movement turns its failure into a sentence about the movement");
});

test("a send is said as soon as its route has answered, and the balances are read after that", () => {
  const own = between("const sendOwn = async () => {", "const heading = ");
  assert.match(own, /setSent\(\{ amount: said, name: "", when: whenInWords\(result\.sentAtMs\), reference: result\.reference \}\);\s+setOwnCode\(""\);[\s\S]{0,160}setStage\("ownSent"\);\s+await readAfterMoving\(\);\s+\} catch \(error\) \{/);
  const payout = between("const send = async () => {", "const ownCoin: Coin");
  assert.match(payout, /setSent\(\{ amount: said\.lead, exact: said\.exact, name: chosen\.name, when: whenInWords\(atMs\), reference, cost \}\);\s+setDeposit\(""\);[\s\S]{0,160}setStage\("sent"\);\s+await readAfterMoving\(\);\s+\} catch \(error\) \{/);
  // The sentences those catches can say, which a failed read must never reach.
  assert.match(CASH_OUT.failures.other, /nothing was taken/);
  assert.match(CASH_OUT.failures.notSent("Ramp"), /nothing left your account/);
});

test("money made ready opens its next step at once, and the gifts' part is never said to be in the gift once it is out", () => {
  const ready = between("const getReady = async () => {", "const copyCode = ");
  assert.match(ready, /await takeTheWayOut\(\{ account, ticket: quote\.ticket \}\);[\s\S]{0,260}setQuote\(null\);\s+setStage\("ready"\);\s+await readAfterMoving\(\);\s+\} catch \(error\) \{/);
  // The gifts' part: the movements alone are inside the try. What follows them is outside it, read twice at the most.
  const gather = between("const gather = async ()", "const start = async (way: WayOut)");
  const tried = gather.slice(gather.indexOf("try {"), gather.indexOf("} catch (error) {"));
  assert.match(tried, /await takeFromGifts\(account, inGifts\);/);
  assert.doesNotMatch(tried, /refresh\(\)|readAfterMoving\(\)/);
  assert.match(gather, /const now = \(await readAfterMoving\(\)\) \?\? \(await readAfterMoving\(\)\);\s+if \(!now\) setStage\("base"\);\s+setBusy\(false\);\s+return now;/);
  assert.ok(gather.indexOf("W.gatherFailed") < gather.indexOf("const now = (await readAfterMoving())"), "the sentence about the gift is said of a movement that failed, and of nothing else");
  assert.match(CASH_OUT.gatherFailed, /it is still yours, in the gift/);
});
