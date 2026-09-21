"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { catchUpDay } from "@/src/catch-up";
import { ApiError } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import {
  bindGoalAccount,
  claimGift,
  countNow,
  loadGiftStatus,
  nameGoalAccount,
  withdrawEarned,
  type GiftStatus,
  type PublicOutcome,
} from "@/src/client/gift";
import { checkMilestone, requestMilestoneCode, startMilestone, type MilestoneOutcome } from "@/src/client/milestone";
import { conditionById, conditionOfGoal } from "@/src/conditions";
import { stripFromRecord } from "@/src/day-states";
import { whenInWords } from "@/src/display-currency";
import { giftOfMilestone, giftOfSummary, funderMayTakeItBack, readAs } from "@/src/gift-moment";
import { liveOf } from "@/src/gift-live";
import { notTheirs, voiceOf, type Voice } from "@/src/gift-voice";
import { milestoneById } from "@/src/milestone-conditions";
import type { AnyGiftStatus } from "@/src/gift-status";
import type { MilestoneStatus } from "@/src/milestone-view";
import { contractDayInWords, contractRangeInWords, dateInWords, momentInWords, nextPassMs } from "@/src/moments";
import { COUNTING_PASS_UTC, settlingTimeInWords } from "@/src/pass-schedule";
import { GIFT_CARD as CARD_WORDS, GIFT_PAGE as W, MILESTONE_ACTIONS as A, MILESTONE_PAGE as M } from "@/src/sentences";
import { CertificateProof } from "../kit/CertificateProof";
import { CheckThisDay } from "../kit/CheckThisDay";
import { CheckThisReading } from "../kit/CheckThisReading";
import { ConnectTheSource, type ConnectWords } from "../kit/ConnectTheSource";
import { DayRow } from "../kit/DayRow";
import { charactersOf } from "../kit/DayStrip";
import { FieldRefusal } from "../kit/FieldRefusal";
import { GiftLive } from "../kit/GiftLive";
import { HeadCharacter } from "../kit/HeadCharacter";
import { LinkAgain } from "../kit/LinkAgain";
import { MilestoneMeter } from "../kit/MilestoneMeter";
import { MorningMessage } from "../kit/MorningMessage";
import { Arrival } from "../kit/Motion";
import { Shell } from "../kit/Shell";
import { TakeItBack } from "../kit/TakeItBack";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, HELP, PRIMARY_BUTTON } from "./ui";

/**
 * A gift's page: the card of Home, alive (the vision of 19 Sep 2026, section 5; document J).
 *
 * One page for the three shapes of gift and for the three readers. It leads with the moment the gift is in, and a
 * moment carries four things: the state in one sentence, the figure that counts now, the next moment with its date,
 * and one action or none. What was agreed and how it is checked are folded under their own names.
 *
 * What replaced what: two pages of 566 and 352 lines, each holding its own version of the same gestures, each
 * writing the agreement and the state at the same weight in the same prose. All twenty-three of their states said
 * at least one figure twice, and that is what this shape closes.
 *
 * Nothing under the screen changed: the same routes, the same readings, the same refusals, the same passkey opened
 * at the one moment a signature is needed.
 */

type Busy = "idle" | "opening" | "naming" | "starting" | "counting" | "taking";
type Where = "open" | "name" | "start" | "count" | "take";

const never = () => () => {};
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;
const inBrowser = () => true;
const onServer = () => false;

/** Our own typed sentences verbatim; anything else as one plain line, so no library's words reach a person. */
function screenMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ? `${error.message} (${error.detail})` : error.message;
  return A.failed;
}

/**
 * The gift's screen. The gift itself comes from the server, read while the page rendered (D160): before that, this
 * screen was built twice, once as "One moment" and once as the gift, and a phone showed the entrance animation of
 * one tree and then the entrance animation of another. What the browser still does is ask again after something
 * happens on the screen, which is a refresh of the same tree and not a second screen.
 */
export function GiftPage({ giftId, linkKey, initialStatus }: Readonly<{ giftId: string; linkKey: string | null; initialStatus?: AnyGiftStatus | null }>) {
  const [status, setStatus] = useState<GiftStatus | MilestoneStatus | null>(initialStatus ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Whether the gift on screen is the one the server just read, which needs no second reading to be true. */
  const asTheServerRead = useRef(Boolean(initialStatus));

  // Written as a promise rather than an await, so the state settles in a callback: a page that sets state in the body
  // of its own effect renders twice for every read.
  const reload = useCallback(
    () =>
      loadGiftStatus(giftId, linkKey).then(
        (answer) => {
          setStatus(answer as GiftStatus | MilestoneStatus);
          setLoadError(null);
        },
        (error: unknown) => setLoadError(error instanceof ApiError ? error.message : W.notFound),
      ),
    [giftId, linkKey],
  );

  useEffect(() => {
    if (asTheServerRead.current) {
      asTheServerRead.current = false;
      return;
    }
    void reload();
  }, [reload]);

  if (loadError) {
    return (
      <Shell kind="task" back="/" backLabel={W.aboutViky} backFollows>
        <p className={BODY}>{loadError}</p>
      </Shell>
    );
  }
  if (!status) {
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts}>
        <p className={HELP}>{W.loading}</p>
      </Shell>
    );
  }
  return <LiveGift status={status} linkKey={linkKey} reload={reload} />;
}

function LiveGift({ status, linkKey, reload }: Readonly<{ status: GiftStatus | MilestoneStatus; linkKey: string | null; reload: () => Promise<void> }>) {
  const { address, ensureSigner, status: accountStatus } = useAccount();
  useMoneySession();
  const money = useDisplayCurrency(address);
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [busy, setBusy] = useState<Busy>("idle");
  const [answer, setAnswer] = useState<{ at: Where; text: string; failed: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [taken, setTaken] = useState<{ amount: string; atMs: number; take: number } | null>(null);
  // Whether an account was signed in on this page before it went: then the session closed while they were here,
  // rather than a page opened again with nobody signed in (D74, D80).
  const [hadAccount, setHadAccount] = useState(false);
  if (address && !hadAccount) setHadAccount(true);

  const milestone = status.kind === "milestone" ? status : null;
  const daily = status.kind === "milestone" ? null : status;
  const giftId = status.giftId;
  const names = status.names ?? null;
  const funderName = names?.funderName ?? null;

  const voice: Voice = voiceOf({
    youAreTheFunder: status.youAreTheFunder,
    youAreTheRecipient: status.youAreTheRecipient,
    opened: status.opened,
  });
  const mine = voice === "recipient";
  const readerIsFunder = voice === "funder";
  const outsider = notTheirs(voice, Boolean(address));

  const gift = milestone ? giftOfMilestone(milestone) : giftOfSummary(daily!);
  const read = readAs(gift, voice);
  const moment = read.moment;

  const condition = milestone ? conditionById(milestone.conditionId) : conditionOfGoal(daily?.goalType ?? 0);
  const words = condition?.recipient;
  const source = condition?.source ?? "";
  const recipientName = names?.recipientName ?? (milestone ? milestone.goalAccount.username : (daily?.goalAccount.source === "funder" ? daily.goalAccount.username : null));

  const account = milestone
    ? {
        username: milestone.goalAccount.username,
        code: milestone.goalAccount.code,
        namedByFunder: milestone.goalAccount.namedByFunder,
        codeExpired: milestone.goalAccount.codeExpiresAt !== null && nowMs !== 0 && new Date(milestone.goalAccount.codeExpiresAt).getTime() <= nowMs,
        codeExpiresAt: milestone.goalAccount.codeExpiresAt,
      }
    : {
        username: daily?.goalAccount.username ?? null,
        code: daily?.goalAccount.code ?? null,
        namedByFunder: daily?.goalAccount.source === "funder",
        codeExpired: (daily?.goalAccount.codeExpiresAt ?? null) !== null && nowMs !== 0 && new Date(daily!.goalAccount.codeExpiresAt!).getTime() <= nowMs,
        codeExpiresAt: daily?.goalAccount.codeExpiresAt ?? null,
      };

  const working = busy !== "idle" || accountStatus === "busy";
  const earned = BigInt(milestone ? milestone.earned : (daily?.earned ?? "0"));
  const amountDisplay = milestone ? milestone.amountDisplay : (daily?.amountDisplay ?? "");
  const earnedDisplay = milestone ? milestone.earnedDisplay : (daily?.earnedDisplay ?? "");
  const returnedDisplay = milestone ? milestone.returnedDisplay : (daily?.returnedDisplay ?? "");
  const theirsDisplay = milestone
    ? milestone.reached
      ? milestone.amountDisplay
      : milestone.earnedDisplay
    : (daily?.alreadyTheirsDisplay ?? daily?.earnedDisplay ?? "");

  /** The last day Viky judged, from the record it keeps of each day. Nothing for a gift settled before that record. */
  const lastJudged = daily && daily.days.length > 0 ? [...daily.days].sort((a, b) => b.day - a.day)[0].outcome : null;
  const nextReading = nowMs === 0 || gift.finished || gift.cancelled ? null : W.nextReading(momentInWords(nextPassMs(COUNTING_PASS_UTC, nowMs), nowMs));
  const openBy =
    moment === "unopened" && !readerIsFunder && daily
      ? W.openBy(dateInWords((daily.createdAtChain + 14 * 86_400) * 1000), funderName)
      : null;
  const cameBackOn = milestone?.reachedAtMs ? dateInWords(milestone.reachedAtMs) : daily?.lastReturnAtMs ? dateInWords(daily.lastReturnAtMs) : null;

  const live = liveOf({
    moment,
    voice,
    funderName,
    recipientName,
    source,
    amountDisplay,
    theirsDisplay,
    returnedDisplay,
    todayReading: milestone?.todayReading ?? null,
    target: milestone?.target ?? null,
    started: milestone ? milestone.connected : Boolean(daily && daily.creditedDays + daily.missedDays > 0),
    lastJudged,
    openByInWords: openBy,
    nextReadingInWords: moment === "counting" || moment === "climbing" ? nextReading : null,
    cameBackOnInWords: cameBackOn,
  });

  const run = async (kind: Busy, where: Where, action: () => Promise<string | null>) => {
    setBusy(kind);
    setAnswer(null);
    try {
      const message = await action();
      if (message) setAnswer({ at: where, text: message, failed: false });
      await reload();
    } catch (error) {
      setAnswer({ at: where, text: screenMessage(error), failed: true });
    } finally {
      setBusy("idle");
    }
  };

  /** What a daily reading answered, in the words of the register and of the page, or a refusal thrown to be shown. */
  const dailyOutcome = (result: PublicOutcome): string => {
    switch (result.kind) {
      case "bound":
        return [words?.countingFrom(contractDayInWords(Math.floor(nowMs / 86_400_000) + 1)) ?? "", account.namedByFunder ? "" : W.codeOut]
          .filter(Boolean)
          .join(" ");
      case "counted":
        return W.readCounted(result.creditedDays);
      case "already":
        return result.reason === "counted_today" ? (words?.alreadyRead ?? W.readCounted(0)) : (W.nothingToDo[result.reason] ?? W.readCounted(0));
      case "refused":
        throw new ApiError({
          status: 409,
          code: result.code,
          message: result.code === "CODE_NOT_IN_NAME" ? `${result.message} ${W.notSeenYet}` : result.message,
        });
    }
  };

  /** What a milestone reading answered. Every branch ends in a sentence, including the shape nobody foresaw. */
  const milestoneOutcome = (outcome: MilestoneOutcome): string => {
    switch (outcome.kind) {
      case "started":
        return outcome.aboveAccepted
          ? A.outcome.startedAbove(outcome.rating, milestone?.target ?? 0)
          : A.outcome.started(outcome.rating, milestone?.target ?? 0);
      case "reached":
        return A.outcome.reached(outcome.rating);
      case "notYet":
        return A.outcome.notYet(outcome.rating, outcome.target);
      case "already":
        return A.outcome.already[outcome.reason as keyof typeof A.outcome.already] ?? A.failed;
      case "refused":
        throw new ApiError({ status: 409, code: "REFUSED", message: outcome.message.trim().length > 0 ? outcome.message : A.failed });
      default:
        return A.failed;
    }
  };

  const open = () =>
    run("opening", "open", async () => {
      if (!linkKey) throw new ApiError({ status: 400, code: "NO_KEY", message: W.missingKey });
      await claimGift(giftId, linkKey);
      return null;
    });
  const name = (username: string) => run("naming", "name", async () => {
    await nameGoalAccount(giftId, username);
    return null;
  });
  const askCode = () =>
    run("naming", "name", async () => {
      if (milestone) {
        await requestMilestoneCode(giftId);
        return null;
      }
      if (account.username) await nameGoalAccount(giftId, account.username);
      return null;
    });
  const start = () =>
    run("starting", "start", async () => (milestone ? milestoneOutcome(await startMilestone(giftId)) : dailyOutcome(await bindGoalAccount(giftId))));
  const countToday = () =>
    run("counting", "count", async () => (milestone ? milestoneOutcome(await checkMilestone(giftId)) : dailyOutcome(await countNow(giftId))));
  const take = () =>
    run("taking", "take", async () => {
      // The passkey is opened here, at the one moment a signature is needed, rather than assumed to be open.
      const signer = await ensureSigner();
      const takeNumber = Number(milestone ? milestone.withdrawNonce : (daily?.withdrawNonce ?? "0")) + 1;
      await withdrawEarned({
        account: signer,
        giftId,
        escrow: milestone ? milestone.escrow : (daily?.escrow as `0x${string}`),
        amount: earned,
        nonce: BigInt(milestone ? milestone.withdrawNonce : (daily?.withdrawNonce ?? "0")),
      });
      setReviewing(false);
      setTaken({ amount: earnedDisplay, atMs: Date.now(), take: takeNumber });
      return null;
    });

  const answerAt = (where: Where): ReactNode =>
    answer && answer.at === where ? (
      answer.failed ? (
        <FieldRefusal id={`gift-${where}-refused`}>{answer.text}</FieldRefusal>
      ) : (
        <p role="status" className={BODY}>
          {answer.text}
        </p>
      )
    ) : null;

  // The session closed while they were here: nothing is lost and the door is the whole page (D74, D80).
  if (!address && hadAccount) {
    return (
      <Shell kind="task" back="/" backLabel={W.aboutViky} backFollows step={W.closedTitle}>
        <p className={BODY}>{W.closedBody}</p>
        <AccountPanel returning signInOnly />
      </Shell>
    );
  }

  const connectWords: ConnectWords | null = milestone
    ? {
        named: account.username ? A.givenName(source, account.username) : null,
        stillNeeds: A.connectTitle(source),
        notMine: undefined,
        proveTitle: account.username ? A.proveTitle(account.username) : A.connectTitle(source),
        proveSteps: milestoneById(milestone.conditionId)?.words.codeSteps ?? "",
        connectNow: A.connectNow(milestone.durationDays),
        firstReading: A.firstReading,
        start: A.startReading(source),
        added: A.added,
        getCode: A.getCode,
        newCode: A.newCode,
      }
    : words
      ? {
          named: account.username ? words.namedBy(account.username, funderName ?? "the person who sent it") : null,
          stillNeeds: words.stillNeeds,
          nameField: {
            label: words.usernameLabel,
            help: words.usernameHelp,
            typeToContinue: words.typeToContinue,
            noPassword: words.noPassword,
            notYet: words.notYet,
          },
          notMine: words.notMine,
          proveTitle: account.username ? words.proveTitle(account.username) : words.stillNeeds,
          proveSteps: words.proveSteps,
          slowToShow: words.slowToShow,
          start: W.startCounting,
          added: W.iAddedIt,
          getCode: W.newCode,
          newCode: W.newCode,
        }
      : null;

  /** The one action of this moment, and nothing of the same weight beside it (document J). */
  const action = ((): ReactNode => {
    if (!address && !gift.cancelled) {
      return (
        <div className="flex flex-col gap-[var(--space-md)]">
          <p className="font-medium">{status.opened ? W.signInToSee : W.createToOpen}</p>
          {status.opened ? <AccountPanel returning signInOnly /> : <AccountPanel />}
        </div>
      );
    }
    if (outsider) {
      return (
        <div className="flex flex-col gap-[var(--space-sm)]">
          <p className="font-medium">{W.notYours}</p>
          <p className={HELP}>{W.readingWhose(funderName, recipientName)}</p>
        </div>
      );
    }
    switch (read.action) {
      case "open":
        return (
          <>
            <button type="button" onClick={open} disabled={working || !linkKey} className={PRIMARY_BUTTON}>
              {busy === "opening" ? W.opening : W.openMyGift}
            </button>
            {linkKey ? answerAt("open") : <FieldRefusal id="gift-no-key">{W.missingKey}</FieldRefusal>}
          </>
        );
      case "connect":
        return connectWords ? (
          <ConnectTheSource
            words={connectWords}
            account={account}
            funderName={funderName}
            busy={busy === "naming" ? "naming" : busy === "starting" ? "starting" : null}
            working={working}
            refusal={
              answer?.failed && (answer.at === "name" || answer.at === "start") ? { where: answer.at, text: answer.text } : null
            }
            validUntil={account.codeExpiresAt && nowMs !== 0 ? momentInWords(new Date(account.codeExpiresAt).getTime(), nowMs) : null}
            onName={milestone ? undefined : name}
            onAskCode={askCode}
            onStart={start}
          />
        ) : null;
      case "shareProof":
        return milestone ? (
          <CertificateProof giftId={giftId} conditionId={milestone.conditionId} yours={mine} onProved={reload} />
        ) : null;
      case "take":
        return reviewing ? (
          <div className="flex flex-col gap-[var(--space-md)]">
            <p className={BODY}>{W.takeReview}</p>
            {money.about(earned) ? <p className={HELP}>{money.about(earned)}</p> : null}
            <button type="button" onClick={take} disabled={working} className={PRIMARY_BUTTON}>
              {busy === "taking" ? W.taking : W.take(earnedDisplay)}
            </button>
            {answerAt("take")}
            <button
              type="button"
              onClick={() => setReviewing(false)}
              disabled={working}
              className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}
            >
              {W.notNow}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setReviewing(true)} disabled={working} className={PRIMARY_BUTTON}>
            {W.take(earnedDisplay)}
          </button>
        );
      case "linkAgain":
        return <LinkAgain giftId={giftId} recipientName={recipientName} />;
      case "askAgain":
      default:
        return null;
    }
  })();

  const shape = milestone ? (
    <MilestoneMeter status={milestone} size="large" />
  ) : browser && daily ? (
    <DayRow id={giftId} gift={daily} catchUpSeconds={daily.catchUpSeconds} records={daily.days} voice={voice} />
  ) : null;

  /** What was agreed: the amount, what it counts, how long, and what happens to what is not earned. Read once. */
  const agreed = (
    <>
      {milestone ? (
        <>
          <p className={BODY}>{M.target(milestone.target, source)}</p>
          <p className={BODY}>
            {readerIsFunder
              ? M.atDeadlineTheirs(milestoneBy(milestone))
              : M.atDeadlineYours(milestoneBy(milestone), funderName)}
          </p>
          {milestone.startReading !== null ? <p className={HELP}>{M.startedAt(milestone.startReading)}</p> : null}
        </>
      ) : daily ? (
        <>
          <p className={BODY}>
            {readerIsFunder || voice === "reader"
              ? W.becomesTheirs(daily.perDayDisplay, words?.eachDayTheirs ?? condition?.words.eachDay ?? "", agreedWhen(daily))
              : W.becomesYours(daily.perDayDisplay, words?.eachDayYours ?? condition?.words.eachDay ?? "", agreedWhen(daily))}
          </p>
          <p className={BODY}>{readerIsFunder ? W.comesBackToYou : W.goesBackToThem(funderName)}</p>
        </>
      ) : null}
      {readerIsFunder ? <p className={HELP}>{W.made(dateInWords(status.createdAtChain * 1000), giftId)}</p> : null}
    </>
  );

  /** How this is checked: what the source is, when it is read, and the proof anybody may take away. */
  const checked = (
    <>
      {nextReading && !gift.finished ? (
        <p className={HELP}>{voice === "recipient" ? (words?.reads ?? "") : (words?.readsTheirs ?? "")}</p>
      ) : null}
      {milestone ? (
        <p className={HELP}>{readerIsFunder ? M.ruleTheirs(milestone.target, milestoneBy(milestone), settlingTimeInWords(nowMs)) : M.ruleYours(milestone.target, milestoneBy(milestone), settlingTimeInWords(nowMs))}</p>
      ) : null}
      {daily && !stripFromRecordSafe(daily, nowMs) ? <p className={HELP}>{W.fromCountsNote}</p> : null}
      {/* Asking for a reading now, and being told each morning: neither is the moment's action, so neither is
          offered beside it. They live here, with the rest of how a gift is checked. */}
      {(mine || readerIsFunder) && !gift.finished && gift.connected && !gift.sourceClosed ? (
        <>
          <button type="button" onClick={countToday} disabled={working} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
            {busy === "counting" ? W.reading : W.countNow}
          </button>
          {answerAt("count")}
        </>
      ) : null}
      <MorningMessage giftId={giftId} yours={mine || readerIsFunder} />
    </>
  );

  /** The reading behind a day, to take away and check: outside the card, in the ground's own voice (the mockup). */
  const proof =
    mine || readerIsFunder ? (
      <>
        {daily ? <CheckThisDay giftId={giftId} days={daily.days} /> : null}
        {milestone ? <CheckThisReading giftId={giftId} /> : null}
      </>
    ) : null;

  const arriving = nowMs === 0 || !daily ? [] : charactersOf(daily, daily.catchUpSeconds, nowMs, daily.days);

  return (
    <Arrival
      storageKey="viky.seen.days"
      gifts={[{ id: giftId, days: arriving, lastSeen: arriving.filter((day) => day === "earned" || day === "returned").length }]}
    >
      <Shell
        kind="task"
        character={<HeadCharacter />}
        {...(address || hadAccount ? { back: "/gifts", backLabel: W.backToGifts } : { back: "/", backLabel: W.aboutViky, backFollows: true })}
      >
        <GiftLive
          from={CARD_WORDS.fromFunderOrYours(readerIsFunder ? null : funderName)}
          who={mine ? CARD_WORDS.forYou : CARD_WORDS.forName(recipientName ?? account.username ?? "")}
          what={condition?.name ?? ""}
          shape={shape}
          live={live}
          /* The source closed the account: said where the state is said, because it is the state now. */
          closed={milestone?.accountClosed && !gift.finished ? (milestoneById(milestone.conditionId)?.words.accountClosed ?? null) : null}
          action={action}
          agreed={{ open: read.agreementOpen, children: agreed }}
          checked={checked}
          beside={proof}
        />

        {/* Ending a gift nobody opened: the funder's second gesture, under the first, never beside it. */}
        {funderMayTakeItBack(gift, voice) ? (
          <TakeItBack giftId={giftId} amountDisplay={amountDisplay} recipientName={recipientName} onTakenBack={reload} />
        ) : null}

        {taken ? (
          <section className={CARD} role="status">
            <p className="font-medium">{W.taken(taken.amount, whenInWords(taken.atMs), giftId, taken.take)}</p>
            {/* The money has just moved into the account, so the way out is what this screen is waiting for now. */}
            <Link href="/cash-out" className={PRIMARY_BUTTON}>
              {W.sendToBank}
            </Link>
          </section>
        ) : null}
      </Shell>
    </Arrival>
  );
}

/** "by 17 Oct 2026" once the first reading has started the clock, "within 30 days of connecting" before it (D46). */
function milestoneBy(status: MilestoneStatus): string {
  return status.deadlineMs === null ? M.withinDays(status.durationDays) : M.byDate(dateInWords(status.deadlineMs));
}

/** The dates a daily gift runs between, or how long it runs once it is connected. */
function agreedWhen(gift: Readonly<{ startDay: number; endDay: number; durationDays: number }>): string {
  return gift.startDay === 0 ? W.forDaysFromConnecting(gift.durationDays) : contractRangeInWords(gift.startDay, gift.endDay);
}

/** Whether the day row is drawn from the record of each day rather than from the totals alone. */
function stripFromRecordSafe(gift: GiftStatus, nowMs: number): boolean {
  return nowMs === 0 ? true : stripFromRecord(gift, gift.catchUpSeconds, nowMs, gift.days);
}

/** Kept for the catch-up sentence the day row leans on, so a day that can still be caught is never silent. */
export { catchUpDay };
