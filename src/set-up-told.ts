import type { PortalSense } from "./portal-store";
import { senseOfCondition } from "./university-choice";

/**
 * A university set up tells the people who were waiting on it (the founder, 11 Oct 2026).
 *
 * A gift on a university nobody had read waits at "Set up" (src/university-path.ts), and until now nothing told its
 * people that the wait was over: the student read a date and had to come back. The setting up ends when the operator
 * registers the provider (`pnpm provider:add`), so that command tells them, on the devices that asked.
 *
 * Told to the enrolment gifts of that university that are still running. A gift on results is left out: its path
 * starts at Results and draws no setting up, and its people were offered a message for the gift itself. Once for a
 * gift, whoever tells and however often the command is run (src/morning-send.ts claims the subject). Never a reason
 * for the registration to fail: the provider is written by then.
 */
export type SetUpToldDeps = Readonly<{
  /** The gifts made on a university, with the condition each reads. */
  giftsOn: (portalId: string) => Promise<readonly Readonly<{ giftId: string; conditionId: string }>[]>;
  /** Whether a gift can still be proved: neither settled nor taken back. */
  running: (giftId: string) => Promise<boolean>;
  /** Tells a gift's subscribers, and answers how many devices took it. */
  tell: (giftId: string) => Promise<number>;
}>;

export async function tellSetUp(portalId: string, sense: PortalSense, deps: SetUpToldDeps): Promise<readonly Readonly<{ giftId: string; devices: number }>[]> {
  if (sense !== "enrolment") return [];
  const told: { giftId: string; devices: number }[] = [];
  for (const gift of await deps.giftsOn(portalId)) {
    if (senseOfCondition(gift.conditionId) !== sense) continue;
    // A gift that cannot be read is told nothing, rather than something that may be untrue of it.
    if (!(await deps.running(gift.giftId).catch(() => false))) continue;
    told.push({ giftId: gift.giftId, devices: await deps.tell(gift.giftId).catch(() => 0) });
  }
  return told;
}
