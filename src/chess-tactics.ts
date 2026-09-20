import { keccak256, stringToHex, type Hex } from "viem";

/**
 * The puzzle rating on Chess.com, a climb of its own (the founder's line of 20 Sep 2026). Browser safe.
 *
 * Only the goal lives here for now: the number and the provider id the founder registers on `MilestoneGift`. The
 * reading comes with the line that offers it, and it is kept out of src/chess-com.ts on purpose until then: that
 * file is one of the two the reading service's fingerprint covers, and a constant that changes nothing about what
 * the worker fetches should not force it to be redeployed.
 *
 * What the reading will be, measured on 20 Sep 2026 on sevyb and on hikaru: the same stats page as the cadences,
 * with a `tactics` block carrying `highest` and `lowest`, each a rating and a date, and no RD at all. `highest`
 * never goes down, so what the condition says is "beat your own record", and the guard that refuses an unsettled
 * rating has nothing to read here and must not apply.
 */

/** After the four cadences, the test, Lichess, Coursera and Credly. */
export const CHESS_TACTICS_GOAL_TYPE = 12;

export function chessTacticsProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:chess-com-tactics-zkfetch:v1"));
}
