"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import * as mera from "@/src/account/mera";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { claimGift, withdrawEarned, type GiftSummary } from "@/src/client/gift";
import { checkMilestone, requestMilestoneCode, startMilestone, type MilestoneOutcome } from "@/src/client/milestone";
import { conditionById } from "@/src/conditions";
import { milestoneById } from "@/src/milestone-conditions";
import type { MilestoneStatus } from "@/src/milestone-view";
import { dateInWords, momentInWords } from "@/src/moments";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { GIFT_PAGE as G, MILESTONE_ACTIONS as A, MILESTONE_PAGE as W, NAV } from "@/src/sentences";
import { FieldRefusal } from "../kit/FieldRefusal";
import { GiftCard } from "../kit/GiftCard";
import { MorningMessage } from "../kit/MorningMessage";
import { Shell } from "../kit/Shell";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "./ui";

/**
 * A milestone gift's page, built against the register (structure, section 5): the target, today's reading, the
 * deadline, when it is checked, and what happens at the deadline, in the reader's own words. The source's name comes
 * from the register, the numbers from the contract (src/milestone-status.ts).
 *
 * Opening, connecting and taking are the milestone contract's own steps (C2). The recipient opens the link, puts a code
 * in the name of the account the funder named (that first reading is where they start), and then only plays: Viky
 * reads the rating every day, and the first reading at the target makes all of it theirs. Taking it has a review
 * before and a confirmation after (rule E of the specification). No gesture is offered that the route cannot answer.
 */

function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

type Busy = "idle" | "opening" | "code" | "starting" | "checking" | "taking";

function screenMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ? `${error.message} (${error.detail})` : error.message;
  return A.failed;
}

function outcomeMessage(outcome: MilestoneOutcome, status: MilestoneStatus): string {
  switch (outcome.kind) {
    case "started":
      return outcome.aboveAccepted ? A.outcome.startedAbove(outcome.rating, status.maximumStart) : A.outcome.started(outcome.rating, status.target);
    case "reached":
      return A.outcome.reached(outcome.rating);
    case "notYet":
      return A.outcome.notYet(outcome.rating, outcome.target);
    case "already":
      return A.outcome.already[outcome.reason as keyof typeof A.outcome.already] ?? A.failed;
    case "refused":
      return outcome.message;
  }
}

export function MilestoneGiftPage({ status, linkKey = null, reload }: Readonly<{ status: MilestoneStatus; linkKey?: string | null; reload?: () => Promise<void> }>) {
  const { address, status: accountStatus } = useAccount();
  useMoneySession();
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [taken, setTaken] = useState<{ amount: string; atMs: number } | null>(null);

  const condition = conditionById(status.conditionId);
  const milestone = milestoneById(status.conditionId);
  const source = condition?.source ?? "";
  const readerIsFunder = status.youAreTheFunder;
  const mine = status.youAreTheRecipient;
  const funder = status.names?.funderName ?? null;
  const recipient = status.names?.recipientName ?? status.goalAccount.username ?? null;
  // A climb's clock starts at its first reading (D46): before it there is no date, only a number of days.
  const by = status.deadlineMs === null ? W.withinDays(status.durationDays) : W.byDate(dateInWords(status.deadlineMs));
  const missedBy = status.deadlineMs === null ? W.inTime : by;
  const title = readerIsFunder ? G.titleTheirs(recipient, status.amountDisplay) : G.titleYours(funder, status.amountDisplay);
  const back = address ? { back: "/gifts", backLabel: G.backToGifts } : { back: "/", backLabel: G.aboutViky, backFollows: true };
  const readTime = nowMs === 0 ? "" : settlingTimeInWords(nowMs);
  const working = busy !== "idle" || accountStatus === "busy";
  const account = status.goalAccount;
  const codeUsable = account.code !== null && account.codeExpiresAt !== null && nowMs !== 0 && new Date(account.codeExpiresAt).getTime() > nowMs;

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

  const reachedOn = dateInWords(status.reachedAtMs ?? status.deadlineMs ?? status.createdAtChain * 1_000);
  const outcome = status.reached
    ? readerIsFunder
      ? W.reachedTheirs(reachedOn, status.amountDisplay)
      : W.reachedYours(reachedOn, status.amountDisplay)
    : status.finished
      ? readerIsFunder
        ? W.missedTheirs(missedBy, status.amountDisplay)
        : W.missedYours(missedBy, status.amountDisplay, funder)
      : readerIsFunder
        ? W.atDeadlineTheirs(by, status.amountDisplay)
        : W.atDeadlineYours(by, status.amountDisplay, funder);

  const run = async (kind: Busy, action: () => Promise<string | null>) => {
    setBusy(kind);
    setProblem(null);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      await reload?.();
    } catch (error) {
      setProblem(screenMessage(error));
    } finally {
      setBusy("idle");
    }
  };
  const open = () =>
    run("opening", async () => {
      if (!linkKey) throw new ApiError({ status: 400, code: "CLAIM_LINK_INVALID", message: G.missingKey });
      await claimGift(status.giftId, linkKey);
      return A.opened;
    });
  const code = () =>
    run("code", async () => {
      await requestMilestoneCode(status.giftId);
      return null;
    });
  const start = () => run("starting", async () => outcomeMessage(await startMilestone(status.giftId), status));
  const check = () => run("checking", async () => outcomeMessage(await checkMilestone(status.giftId), status));
  const take = () =>
    run("taking", async () => {
      const signer = mera.currentAccount();
      if (!signer) throw new ApiError({ status: 401, code: "SIGN_IN_REQUIRED", message: G.signInToSee });
      await withdrawEarned({ account: signer, giftId: status.giftId, escrow: status.escrow, amount: BigInt(status.earned), nonce: BigInt(status.withdrawNonce) });
      setReviewing(false);
      setTaken({ amount: status.earnedDisplay, atMs: Date.now() });
      return null;
    });

  return (
    <Shell kind="task" {...back} step={title}>
      <GiftCard gift={summary} milestone={status} still />
      <section className={CARD}>
        <p className="font-medium">{W.target(status.target, source)}</p>
        {/* The rule is a promise about the future; once the keeper read it reached, or the deadline passed, the outcome says what happened instead. */}
        {status.reached || status.finished || !readTime ? null : (
          <p className={BODY}>{readerIsFunder ? W.ruleTheirs(status.target, by, readTime) : W.ruleYours(status.target, by, readTime)}</p>
        )}
        {/* The card above carries the meter and today's figure; this says where the climb started and when it was read. */}
        {status.startReading !== null ? <p className={HELP}>{W.startedAt(status.startReading)}</p> : null}
        <p className={HELP}>
          {status.readAtMs !== null && nowMs !== 0 ? W.lastRead(momentInWords(status.readAtMs, nowMs)) : readerIsFunder ? W.notReadYetTheirs(source) : W.notReadYetYours(source)}
        </p>
        <p className={status.reached || status.finished ? "font-medium" : HELP}>{outcome}</p>
        {status.phase === "climbing" && mine ? (
          <button type="button" onClick={() => void check()} disabled={working} className={SECONDARY_BUTTON}>
            {busy === "checking" ? A.checking : A.checkNow}
          </button>
        ) : null}
        <MorningMessage giftId={status.giftId} yours={mine || readerIsFunder} />
      </section>

      {!address && !status.cancelled ? (
        <section className="flex flex-col gap-[var(--space-md)]">
          <p className="font-medium">{status.opened ? G.signInToSee : G.createToOpen}</p>
          <AccountPanel returning={status.opened} />
        </section>
      ) : null}

      {address && !status.opened && !status.cancelled && linkKey ? (
        <button type="button" onClick={() => void open()} disabled={working} className={PRIMARY_BUTTON}>
          {busy === "opening" ? G.opening : G.openMyGift}
        </button>
      ) : null}

      {mine && status.phase === "opened" && !codeUsable ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.connectTitle(source)}</h2>
          {account.username ? <p className={BODY}>{A.givenName(source, account.username)}</p> : null}
          <p className={HELP}>{A.whyCode(source)}</p>
          <p className="font-medium">{A.firstReading(status.maximumStart)}</p>
          <button type="button" onClick={() => void code()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "code" ? A.gettingCode : account.code ? A.newCode : A.getCode}
          </button>
        </section>
      ) : null}

      {mine && status.phase === "opened" && codeUsable && account.username ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.proveTitle(account.username)}</h2>
          <p className={BODY}>{milestone?.words.codeSteps}</p>
          <p className="text-center text-[length:var(--type-money)] font-semibold tracking-widest">{account.code}</p>
          <p className="font-medium">{A.firstReading(status.maximumStart)}</p>
          <button type="button" onClick={() => void start()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "starting" ? A.addedBusy : A.added}
          </button>
          <p className={HELP}>{A.removeAfter}</p>
        </section>
      ) : null}

      {readerIsFunder && status.phase === "opened" ? <p className={BODY}>{A.theirsNotConnected}</p> : null}
      {status.phase === "startTooHigh" && status.startReading !== null ? (
        <p className={BODY}>{mine ? A.startTooHighMine(status.startReading, status.maximumStart) : A.startTooHighTheirs(status.startReading, status.maximumStart)}</p>
      ) : null}
      {status.phase === "overdue" ? <p className={BODY}>{A.overdue}</p> : null}

      {mine && BigInt(status.earned) > 0n && !reviewing && !taken ? (
        <button type="button" onClick={() => setReviewing(true)} disabled={working} className={PRIMARY_BUTTON}>
          {A.take(status.earnedDisplay)}
        </button>
      ) : null}
      {mine && BigInt(status.earned) > 0n && reviewing ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.takeReviewTitle(status.earnedDisplay)}</h2>
          <dl className="flex flex-col divide-y divide-[var(--divider)]">
            <div className="flex justify-between gap-[var(--space-md)] py-[var(--space-sm)]">
              <dt className={HELP}>{A.takeRows.goes}</dt>
              <dd className={BODY}>{A.takeRows.account}</dd>
            </div>
            <div className="flex justify-between gap-[var(--space-md)] py-[var(--space-sm)]">
              <dt className={HELP}>{A.takeRows.stays}</dt>
              <dd className={`${BODY} tabular-nums`}>{A.nothingLeft}</dd>
            </div>
          </dl>
          <button type="button" onClick={() => void take()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "taking" ? A.taking : A.takeConfirm(status.earnedDisplay)}
          </button>
          <button type="button" onClick={() => setReviewing(false)} disabled={working} className={SECONDARY_BUTTON}>
            {A.notNow}
          </button>
        </section>
      ) : null}
      {taken ? (
        <section className={CARD} role="status">
          <p className="font-medium">{A.taken(taken.amount, dateInWords(taken.atMs), status.giftId)}</p>
          <Link href="/" className={SECONDARY_BUTTON}>
            {NAV.home}
          </Link>
        </section>
      ) : null}

      {notice ? <p className={`${CARD} ${BODY}`}>{notice}</p> : null}
      {problem ? <FieldRefusal id="gift-refused">{problem}</FieldRefusal> : null}
      {readerIsFunder ? <p className={HELP}>{G.made(dateInWords(status.createdAtChain * 1_000), status.giftId)}</p> : null}
    </Shell>
  );
}
