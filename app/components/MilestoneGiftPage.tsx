"use client";
import { useSyncExternalStore } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import type { GiftSummary } from "@/src/client/gift";
import { conditionById } from "@/src/conditions";
import type { MilestoneStatus } from "@/src/milestone-view";
import { dateInWords, momentInWords } from "@/src/moments";
import { GIFT_PAGE as G, MILESTONE_PAGE as W } from "@/src/sentences";
import { GiftCard } from "../kit/GiftCard";
import { Shell } from "../kit/Shell";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, HELP } from "./ui";

/**
 * A milestone gift's page, built against the register (structure, section 5): the target, today's reading, the
 * deadline, "Checked every morning", and what happens at the deadline, in the reader's own words. The route answers
 * a milestone gift once a milestone condition is live (C2); until then only the capture run draws this page, from
 * simulated data. The source's name comes from the register, the numbers from the gift.
 *
 * Opening, connecting and taking a milestone gift are the milestone contract's own steps and are wired on its line;
 * this page says where the gift stands and what comes next, and it never offers a gesture the route cannot answer.
 */

function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

export function MilestoneGiftPage({ status }: Readonly<{ status: MilestoneStatus }>) {
  const { address } = useAccount();
  useMoneySession();
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const condition = conditionById(status.conditionId);
  const source = condition?.source ?? "";
  const readerIsFunder = status.youAreTheFunder;
  const funder = status.names?.funderName ?? null;
  const recipient = status.names?.recipientName ?? status.goalAccount.username ?? null;
  const deadline = dateInWords(status.deadlineMs);
  const title = readerIsFunder ? G.titleTheirs(recipient, status.amountDisplay) : G.titleYours(funder, status.amountDisplay);
  const back = address ? { back: "/gifts", backLabel: G.backToGifts } : { back: "/", backLabel: G.aboutViky, backFollows: true };

  const summary: GiftSummary = {
    giftId: status.giftId,
    role: readerIsFunder ? "funder" : "recipient",
    goalType: 0,
    goalUsername: status.goalAccount.username,
    usernameSource: null,
    recipientName: status.names?.recipientName ?? null,
    funderName: funder,
    catchUpSeconds: 0,
    days: [],
    fundedAt: status.createdAtChain,
    startDay: 0,
    endDay: 0,
    amountDisplay: status.amountDisplay,
    perDayDisplay: status.amountDisplay,
    durationDays: 0,
    creditedDays: 0,
    missedDays: 0,
    opened: status.opened,
    counting: status.connected,
    finished: status.finished,
    cancelled: status.cancelled,
    earnedDisplay: status.earnedDisplay,
    theirsDisplay: status.reached ? status.amountDisplay : "$0.00",
    returnedDisplay: status.returnedDisplay,
  };

  const outcome = status.reached
    ? readerIsFunder
      ? W.reachedTheirs(dateInWords(status.reachedAtMs ?? status.deadlineMs), status.amountDisplay)
      : W.reachedYours(dateInWords(status.reachedAtMs ?? status.deadlineMs), status.amountDisplay)
    : status.finished
      ? readerIsFunder
        ? W.missedTheirs(deadline, status.amountDisplay)
        : W.missedYours(deadline, status.amountDisplay, funder)
      : readerIsFunder
        ? W.atDeadlineTheirs(deadline, status.amountDisplay)
        : W.atDeadlineYours(deadline, status.amountDisplay, funder);

  return (
    <Shell kind="task" {...back} step={title}>
      <GiftCard gift={summary} milestone={status} still />
      <section className={CARD}>
        <p className="font-medium">{W.target(status.target, source)}</p>
        {/* The rule is a promise about the future; once the keeper read it reached, or the deadline passed, the outcome says what happened instead. */}
        {status.reached || status.finished ? null : <p className={BODY}>{readerIsFunder ? W.ruleTheirs(status.target, deadline) : W.ruleYours(status.target, deadline)}</p>}
        {/* The card above carries the meter and today's figure; this says where the climb started and when it was read. */}
        {status.startReading !== null ? <p className={HELP}>{W.startedAt(status.startReading)}</p> : null}
        <p className={HELP}>{status.readAtMs !== null && nowMs !== 0 ? W.lastRead(momentInWords(status.readAtMs, nowMs)) : W.notReadYet}</p>
        <p className={status.reached || status.finished ? "font-medium" : HELP}>{outcome}</p>
      </section>
      {!address && !status.cancelled ? (
        <section className="flex flex-col gap-[var(--space-md)]">
          <p className="font-medium">{status.opened ? G.signInToSee : G.createToOpen}</p>
          <AccountPanel returning={status.opened} />
        </section>
      ) : null}
      {readerIsFunder ? <p className={HELP}>{G.made(dateInWords(status.createdAtChain * 1_000), status.giftId)}</p> : null}
    </Shell>
  );
}
