"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
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
import { CheckThisReading } from "../kit/CheckThisReading";
import { FieldRefusal } from "../kit/FieldRefusal";
import { GiftCard } from "../kit/GiftCard";
import { LinkAgain } from "../kit/LinkAgain";
import { CertificateProof } from "../kit/CertificateProof";
import { MorningMessage } from "../kit/MorningMessage";
import { Shell } from "../kit/Shell";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "./ui";

/**
 * A milestone gift's page, built against the register (structure, section 5): the target, today's reading, the
 * deadline, when it is checked, and what happens at the deadline, in the reader's own words. The source's name comes
 * from the register, the numbers from the contract (src/milestone-status.ts).
 *
 * Opening, connecting and taking are the milestone contract's own steps (C2). The recipient opens the link and starts
 * the first reading, which is where they start; a code is asked only where they named the account themselves (D27,
 * D104 bis), because an account the funder named needs nothing proved about it. After that they only play: Viky
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

/**
 * What a reading says, in one sentence, whatever it answered.
 *
 * Every branch ends in a sentence and so does the absence of a branch: an answer of a shape nobody foresaw, or one
 * carrying no words of its own, still says something. A button that answers nothing is a button a person presses once
 * and then abandons, which is exactly what happened to the rehearsal of 18 Sep.
 */
function outcomeMessage(outcome: MilestoneOutcome, status: MilestoneStatus): string {
  switch (outcome.kind) {
    case "started":
      return outcome.aboveAccepted ? A.outcome.startedAbove(outcome.rating, status.target) : A.outcome.started(outcome.rating, status.target);
    case "reached":
      return A.outcome.reached(outcome.rating);
    case "notYet":
      return A.outcome.notYet(outcome.rating, outcome.target);
    case "already":
      return A.outcome.already[outcome.reason as keyof typeof A.outcome.already] ?? A.failed;
    case "refused":
      return outcome.message.trim().length > 0 ? outcome.message : A.failed;
    default:
      return A.failed;
  }
}

export function MilestoneGiftPage({ status, linkKey = null, reload }: Readonly<{ status: MilestoneStatus; linkKey?: string | null; reload?: () => Promise<void> }>) {
  const { address, ensureSigner, status: accountStatus } = useAccount();
  useMoneySession();
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [busy, setBusy] = useState<Busy>("idle");
  /**
   * What the last gesture answered, and which gesture it was, so the answer appears under the button that was pressed
   * rather than at the far end of the page. The rehearsal of 18 Sep pressed "I added it", the route answered 200, and
   * the sentence landed below everything else, out of sight: from where the person stood, nothing happened.
   */
  const [answer, setAnswer] = useState<{ at: Busy; text: string; failed: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [taken, setTaken] = useState<{ amount: string; atMs: number } | null>(null);

  const condition = conditionById(status.conditionId);
  const milestone = milestoneById(status.conditionId);
  const source = condition?.source ?? "";
  const certificate = status.shape === "certificate";
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
    setAnswer(null);
    try {
      const message = await action();
      // An action that answers with words says them here. One that answers by changing the screen (opening the gift,
      // giving a code) says nothing here, because the screen itself is the answer.
      if (message) setAnswer({ at: kind, text: message, failed: false });
      await reload?.();
    } catch (error) {
      setAnswer({ at: kind, text: screenMessage(error), failed: true });
    } finally {
      setBusy("idle");
    }
  };

  /** The answer to one gesture, under that gesture, announced as it appears. */
  const answerTo = (at: Busy) =>
    answer && answer.at === at ? (
      answer.failed ? (
        <FieldRefusal id={`gift-${at}-refused`}>{answer.text}</FieldRefusal>
      ) : (
        <p role="status" className={BODY}>
          {answer.text}
        </p>
      )
    ) : null;
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
      // The passkey is opened here, at the one moment a signature is needed, rather than assumed to be open.
      const signer = await ensureSigner();
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
        {status.reached || status.finished || !readTime || certificate ? null : (
          <p className={BODY}>{readerIsFunder ? W.ruleTheirs(status.target, by, readTime) : W.ruleYours(status.target, by, readTime)}</p>
        )}
        {/* The card above carries the meter and today's figure; this says where the climb started and when it was read.
            A certificate has neither: nothing is read until its holder shares the page, and one reading settles it. */}
        {!certificate && status.startReading !== null ? <p className={HELP}>{W.startedAt(status.startReading)}</p> : null}
        {certificate ? null : (
          <p className={HELP}>
            {status.readAtMs !== null && nowMs !== 0 ? W.lastRead(momentInWords(status.readAtMs, nowMs)) : readerIsFunder ? W.notReadYetTheirs(source) : W.notReadYetYours(source)}
          </p>
        )}
        <p className={status.reached || status.finished ? "font-medium" : HELP}>{outcome}</p>
        {!certificate && status.phase === "climbing" && mine && !status.accountClosed ? (
          <>
            <button type="button" onClick={() => void check()} disabled={working} className={SECONDARY_BUTTON}>
              {busy === "checking" ? A.checking : A.checkNow}
            </button>
            {answerTo("checking")}
          </>
        ) : null}
        <MorningMessage giftId={status.giftId} yours={mine || readerIsFunder} />
      </section>

      {/* A supervised result is proved once, by the page its holder shares (U3). */}
      {certificate && status.opened && !status.finished ? (
        <CertificateProof giftId={status.giftId} conditionId={status.conditionId} yours={mine} onProved={() => reload?.()} />
      ) : null}

      {!address && !status.cancelled ? (
        <section className="flex flex-col gap-[var(--space-md)]">
          <p className="font-medium">{status.opened ? G.signInToSee : G.createToOpen}</p>
          <AccountPanel returning={status.opened} />
        </section>
      ) : null}

      {address && !status.opened && !status.cancelled && linkKey ? (
        <>
          <button type="button" onClick={() => void open()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "opening" ? G.opening : G.openMyGift}
          </button>
          {answerTo("opening")}
        </>
      ) : null}

      {/* The link again, to the funder, while nobody has opened it: the daily page had this and a milestone had
          nothing at all, which is how the link of gift 1000001 was lost for good (19 Sep 2026). */}
      {readerIsFunder && !status.opened && !status.cancelled ? <LinkAgain giftId={status.giftId} recipientName={status.names?.recipientName ?? null} /> : null}

      {/* The funder named the account, so the first reading binds it and nothing is asked of the person's own profile
          (D27). A code exists only where the recipient names their own account. */}
      {mine && status.phase === "opened" && account.namedByFunder && !status.accountClosed ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.connectTitle(source)}</h2>
          {account.username ? <p className={BODY}>{A.givenName(source, account.username)}</p> : null}
          <p className={HELP}>{A.nothingToDo(source)}</p>
          <p className="font-medium">{A.connectNow(status.durationDays)}</p>
          <p className={HELP}>{A.firstReading(status.target)}</p>
          <button type="button" onClick={() => void start()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "starting" ? A.addedBusy : A.startReading(source)}
          </button>
          {answerTo("starting")}
        </section>
      ) : null}

      {mine && status.phase === "opened" && !account.namedByFunder && !codeUsable && !status.accountClosed ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.connectTitle(source)}</h2>
          {account.username ? <p className={BODY}>{A.givenName(source, account.username)}</p> : null}
          <p className={HELP}>{A.whyCode(source)}</p>
          <p className="font-medium">{A.connectNow(status.durationDays)}</p>
          <p className={HELP}>{A.firstReading(status.target)}</p>
          <button type="button" onClick={() => void code()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "code" ? A.gettingCode : account.code ? A.newCode : A.getCode}
          </button>
          {answerTo("code")}
        </section>
      ) : null}

      {mine && status.phase === "opened" && !account.namedByFunder && codeUsable && account.username && !status.accountClosed ? (
        <section className={CARD}>
          <h2 className={TITLE}>{A.proveTitle(account.username)}</h2>
          <p className={BODY}>{milestone?.words.codeSteps}</p>
          <p className="text-center text-[length:var(--type-money)] font-semibold tracking-widest">{account.code}</p>
          <p className="font-medium">{A.connectNow(status.durationDays)}</p>
          <p className={HELP}>{A.firstReading(status.target)}</p>
          <button type="button" onClick={() => void start()} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "starting" ? A.addedBusy : A.added}
          </button>
          {answerTo("starting")}
          <p className={HELP}>{A.removeAfter}</p>
        </section>
      ) : null}

      {/* The source has closed the account (U1): nothing can be connected or read, and no gesture is offered that would be refused. */}
      {status.accountClosed && !status.finished ? <p className="font-medium">{milestone?.words.accountClosed}</p> : null}
      {readerIsFunder && status.phase === "opened" && !status.accountClosed ? <p className={BODY}>{A.theirsNotConnected}</p> : null}
      {status.phase === "startTooHigh" && status.startReading !== null ? (
        <p className={BODY}>{mine ? A.startTooHighMine(status.startReading, status.target, funder) : A.startTooHighTheirs(status.startReading, status.target, recipient)}</p>
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
          {answerTo("taking")}
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

      {mine || readerIsFunder ? <CheckThisReading giftId={status.giftId} /> : null}

      {/* Every gesture answers beside its own button, above. Nothing is left to say at the end of the page, which is
          where an answer used to land, out of sight of the person who had just pressed. */}
      {readerIsFunder ? <p className={HELP}>{G.made(dateInWords(status.createdAtChain * 1_000), status.giftId)}</p> : null}
    </Shell>
  );
}
