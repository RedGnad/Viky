"use client";

/**
 * What the character is feeling, and what made it feel that (the motion roadmap of 21 Sep 2026, step 2).
 *
 * The character stands at the head of the page and the controls it answers are inside the card below it, so the two
 * are never in the same component. A store rather than a context: the card says what it is being asked about, the
 * character hears it, and neither has to know where the other is drawn. It is the same shape as `src/card-draft.ts`,
 * the store React is told to read with `useSyncExternalStore`, kept as one object so a snapshot never changes by
 * itself.
 *
 * Nothing here plays on a clock: a mood is set by a gesture, a pointer arriving or a choice made, and the character
 * decides how long it holds it (`Expression` in app/kit/Motion.tsx).
 */

/**
 * `curious` and `happy` answer a pointer or a choice (step 2). The other three answer the gift's own record (the life
 * of the product, step 2, 23 Sep 2026): `open` when a day earned lands, `down` when a day goes back, for 300 ms and
 * never a frown, and `jump`, once, the first time this device sees the gift reached. None is ever set by a clock.
 */
export type Feeling = "rest" | "curious" | "happy" | "open" | "down" | "jump";

export type Mood = Readonly<{
  feeling: Feeling;
  /** Where on the screen the thing that caused it is, so the character can look at it rather than at nothing. */
  at: Readonly<{ x: number; y: number }> | null;
  /** True when there is no pointer to leave: the expression plays once and comes back by itself. */
  once: boolean;
  /** Which turn this is, so the same feeling asked for twice plays twice. */
  round: number;
}>;

const AT_REST: Mood = { feeling: "rest", at: null, once: false, round: 0 };

let mood: Mood = AT_REST;
const listeners = new Set<() => void>();

export function subscribeToMood(changed: () => void): () => void {
  listeners.add(changed);
  return () => {
    listeners.delete(changed);
  };
}

export function currentMood(): Mood {
  return mood;
}

/** A server has no character to move, so it renders one at rest and the browser takes over. */
export function atRest(): Mood {
  return AT_REST;
}

/** A control says what it is: "look at me", "this one is good news", or that it has been left. */
export function feel(feeling: Feeling, from?: Element | null, once = false): void {
  const box = from?.getBoundingClientRect();
  mood = {
    feeling,
    at: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null,
    once,
    round: mood.round + 1,
  };
  for (const changed of [...listeners]) changed();
}
