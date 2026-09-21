"use client";
import { Character } from "./Character";
import { Expression, Gaze } from "./Motion";

/**
 * The character at the head of a screen (D148, the motion roadmap of 21 Sep 2026, step 2).
 *
 * It was on the page without an account and nowhere else. It now stands at the head of a gift's page, of the sheet
 * that pays and of the way out, in the same corner, because it is the one thing on these screens that can answer a
 * gesture: what it does next is the arrival of what changed, the gift made, the money taken. An ornament would not
 * have earned the room.
 *
 * 72 wide, which is 45 tall in its own box: the size that sits in a head beside a way back without making the row
 * taller than the title under it. The page without an account keeps its own 86, floated into the title's hollow.
 */
export function HeadCharacter() {
  return (
    <Expression>
      <Gaze>
        <Character state="diamond" tone="sun" standing={false} className="h-auto w-[72px] shrink-0" />
      </Gaze>
    </Expression>
  );
}
