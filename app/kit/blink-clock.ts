/**
 * When the characters last blinked, shared by every blink (D309, the founder, 28 Sep 2026): the blink as the light
 * changes and the landing figure's blink now and then did not know of each other, and it blinked twice in a moment.
 * A blink now and then waits until the last blink of any kind is at least its shortest gap behind it.
 */
let lastBlinkAt = Number.NEGATIVE_INFINITY;

export function noteBlink(now: number = performance.now()): void {
  lastBlinkAt = now;
}

export function msSinceBlink(now: number = performance.now()): number {
  return now - lastBlinkAt;
}
