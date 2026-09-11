/**
 * The one place the look of a control is decided. Every screen imports from here rather than repeating
 * Tailwind classes, so the palette and the shapes stay the same and a change happens once. Each control
 * is at least eleven units tall, which is the forty-four pixels platform guidance gives for a thumb; a
 * browser test measures it on every push.
 */

const TAP = "min-h-11 inline-flex items-center justify-center";

/** The action a screen is asking for. One per screen, at most. */
export const PRIMARY_BUTTON = `${TAP} w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50`;

/** Everything else a person may do from here. */
export const SECONDARY_BUTTON = `${TAP} w-full rounded-lg border border-gray-300 px-4 py-3 text-sm disabled:opacity-50 dark:border-gray-700`;

/** A secondary action that sits beside others rather than filling the width. */
export const INLINE_BUTTON = `${TAP} rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-gray-700`;

/** A box that groups one step of a journey. */
export const CARD = "space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800";

/** A line the person types into. */
export const FIELD = "min-h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-base dark:border-gray-700";
