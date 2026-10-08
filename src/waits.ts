/**
 * A wait that follows a press (the founder, 3 Oct 2026; the motion roadmap's section on the two waits): the wheel
 * turns inside the button from the press, under a second nothing more is said, and past ten seconds a line under the
 * button names the step in progress. Ten seconds is Nielsen's limit of attention (1993): past it, a person needs to
 * know what is being done, not only that something is.
 */
export const NAME_THE_STEP_AFTER_MS = 10_000;

/**
 * How long a button says it is done before it is back at rest (the UI pass of 8 Oct 2026, rule 3; the validated
 * mockup holds its mark for 2.2 s): long enough to be read, short enough that the button is there to press again.
 */
export const DONE_SHOWN_MS = 2_200;
