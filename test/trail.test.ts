import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { milestoneProgress } from "../src/milestone-view";

/**
 * The trail (D232): everywhere a milestone is drawn, flat, and measured from nothing, so a reading already made shows
 * as a way already walked (Nunes and Drèze, 2006).
 */

test("progress is measured from nothing: a reading already made is a way already walked, and never a lie", () => {
  const at = (todayReading: number | null, target: number, reached = false) => milestoneProgress({ todayReading, target, reached });
  assert.equal(Math.round(at(383, 2500) * 1000) / 1000, 0.153, "383 of 2,500 is drawn a little way along, not at the start");
  assert.equal(at(1500, 1600), 0.9375, "1,500 of 1,600 is nearly there, which is what the words say too");
  assert.equal(at(null, 2500), 0, "nothing read yet stands at the start: anything else would be a lie");
  assert.equal(at(0, 100), 0, "and so does a reading of nothing");
  assert.equal(at(3000, 2500), 1, "past the target is the end");
  assert.equal(at(10, 2500, true), 1, "reached is the end, whatever was read");
  assert.equal(at(5, 0), 1, "a target of nothing is reached by anything");
  const source = readFileSync("src/milestone-view.ts", "utf8");
  assert.doesNotMatch(source.slice(source.indexOf("export function milestoneProgress")), /startReading/, "where they started is not in the picture");
});

test("the trail is flat and on every milestone: the card in a list draws it where a bar stood", () => {
  const climb = readFileSync("app/kit/Climb.tsx", "utf8");
  assert.match(climb, /const FOOT = 0\.2;\nconst RISE = 0;/, "flat: a slope took room for nothing");
  assert.match(readFileSync("app/globals.css", "utf8"), /\.climb \{\n\s*position: relative;\n\s*display: block;\n\s*height: 88px;/, "and lower for it");
  const card = readFileSync("app/kit/GiftCard.tsx", "utf8");
  assert.match(card, /<Climb giftId=\{gift\.giftId\} status=\{milestone\} \/>/, "the card in a list draws the trail");
  assert.doesNotMatch(card, /MilestoneMeter status/, "and no bar");
  const meter = readFileSync("app/kit/MilestoneMeter.tsx", "utf8");
  assert.doesNotMatch(meter, /export function MilestoneMeter/, "the bar is gone");
  assert.match(meter, /export function milestoneCharacter/, "what both drawings read stays");
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /<Climb giftId=\{giftId\} status=\{milestone\} \/>/, "the gift's own page draws the same trail");
});
