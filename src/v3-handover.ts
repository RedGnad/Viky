import type { Hex } from "viem";
import { MILESTONE_FIRST_ID } from "./milestone-protocol";
import { goalProblems, leftAsDeployed, type GiftContractRead, type HandoverExpected } from "./v2-handover";

/**
 * What the hand-over of the third daily contract must read before the app is told where it is (3 Oct 2026). No key, no
 * network: `scripts/check-v3-handover.ts` reads the chain and asks this.
 *
 * The contract itself is held to what the second version's two were (src/v2-handover.ts): the Safe owns it, nobody
 * else is offered it, no signer waits, no pause was sent, creation is open, and every goal is the register's.
 *
 * What differs is the numbering. A gift's record is keyed by its number alone, so no two daily contracts may ever
 * give out the same one. The second version continued where the first stopped, with creation closed there for good.
 * The third may do the same, or start further on and leave the second version open behind it: then the second can
 * still make gifts, as many as there are numbers before the third's first, which is what keeps a way back to it.
 * Either way: no earlier contract's next number is past the third's, and one that is still open has room left.
 */

/** A daily contract that made gifts before the third: where its numbering stands, and whether it still makes gifts. */
export type EarlierDaily = Readonly<{ name: string; address: Hex; nextGiftId: bigint; creationPaused: boolean }>;

export type ThirdDailyRead = Omit<GiftContractRead, "replaces"> & Readonly<{ schemaId: number; earlier: readonly EarlierDaily[] }>;

/** What a numbering must read, for a third contract whose first gift takes `first`. Shared with the deployment's own check. */
export function numberingProblems(name: string, first: bigint, earlier: readonly EarlierDaily[]): Readonly<{ problems: string[]; notes: string[] }> {
  const problems: string[] = [];
  const notes: string[] = [];
  if (first >= MILESTONE_FIRST_ID) problems.push(`${name}: its next gift is ${first}, inside the milestone numbering, which starts at ${MILESTONE_FIRST_ID}`);
  for (const contract of earlier) {
    if (contract.nextGiftId > first) {
      problems.push(`${name}: its next gift is ${first}, behind ${contract.nextGiftId} on ${contract.name} ${contract.address}: two gifts would carry one number`);
      continue;
    }
    if (contract.creationPaused) continue;
    const room = first - contract.nextGiftId;
    if (room === 0n) problems.push(`${name}: creation is open on ${contract.name} ${contract.address}, whose next gift takes ${contract.nextGiftId}, a number this contract gives out too. The Safe closes it first`);
    else notes.push(`${contract.name} ${contract.address} still makes gifts: ${room} number(s) are left before its numbering meets this contract's, at gift ${first}. It is closed before then`);
  }
  return { problems, notes };
}

/** Everything that must be put right before the one setting is set, and what is worth knowing without being wrong. */
export function thirdHandoverProblems(expected: Pick<HandoverExpected, "owner" | "signer" | "nowSeconds">, third: ThirdDailyRead): Readonly<{ problems: string[]; notes: string[] }> {
  const itself = leftAsDeployed(expected, third);
  const problems = [...itself.problems];
  const notes = [...itself.notes];
  if (third.schemaId !== 3) problems.push(`${third.name}: it answers schema ${third.schemaId}, and the third daily contract answers 3. This is another contract`);
  const numbering = numberingProblems(third.name, third.nextGiftId, third.earlier);
  problems.push(...numbering.problems, ...goalProblems(third.name, third.goals, third.register));
  notes.push(...numbering.notes);
  return { problems, notes };
}
