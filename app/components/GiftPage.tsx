"use client";
import Link from "next/link";
import { useMinute } from "../kit/clock";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { catchUpDay } from "@/src/catch-up";
import { ApiError } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { useReaderZone } from "@/src/client/reader-zone";
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
import { eyebrowOf, liveOf, titleOf } from "@/src/gift-live";
import { notTheirs, voiceOf, type Voice } from "@/src/gift-voice";
import { milestoneById } from "@/src/milestone-conditions";
import type { AnyGiftStatus } from "@/src/gift-status";
import type { MilestoneStatus } from "@/src/milestone-view";
import { contractDayInWords, contractRangeInWords, dateInWords, momentInWords, nextPassMs } from "@/src/moments";
import { COUNTING_PASS_UTC, settlingTimeInWords } from "@/src/pass-schedule";
import { GIFT_LIVE as L, GIFT_PAGE as W, MILESTONE_ACTIONS as A, MILESTONE_PAGE as M } from "@/src/sentences";
import { AskAgain } from "../kit/AskAgain";
import { CertificateProof } from "../kit/CertificateProof";
import { MarathonProof, MarathonStanding } from "../kit/MarathonProof";
import { WcaProof, WcaStanding } from "../kit/WcaProof";
import { Confetti } from "../kit/Confetti";
import { Nature } from "../kit/Nature";
import { ShowProof } from "../kit/ShowProof";
import { CheckThisDay } from "../kit/CheckThisDay";
import { CheckThisReading } from "../kit/CheckThisReading";
import { ConnectTheAccount } from "../kit/ConnectTheAccount";
import { ConnectTheSource, type ConnectWords } from "../kit/ConnectTheSource";
import { DayRow } from "../kit/DayRow";
import { charactersOf } from "../kit/DayStrip";
import { FieldRefusal } from "../kit/FieldRefusal";
import { GiftLive } from "../kit/GiftLive";
import { HeadCharacter } from "../kit/HeadCharacter";
import { LinkAgain } from "../kit/LinkAgain";
import { Climb } from "../kit/Climb";
import { Stamp } from "../kit/Stamp";
import { MorningMessage } from "../kit/MorningMessage";
import { Arrival, ArrivalAmount, useLastSeen } from "../kit/Motion";
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
  /** The clock this reader keeps, so a date says their day and not the server's (D160). */
  const zone = useReaderZone();
  const nowMs = useMinute();
  const [busy, setBusy] = useState<Busy>("idle");
  const [answer, setAnswer] = useState<{ at: Where; text: string; failed: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  /** A signed-out reader of an opened gift asked to sign in: the quiet line opens the door, it is not the moment's action. */
  const [signingIn, setSigningIn] = useState(false);
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
  // Both contracts give an unopened gift back 14 days after it was funded, and an opened gift nothing started 14 days
  // after it was opened (GiftEscrow's UNCLAIMED_REFUND_DELAY, MilestoneGift's DORMANT_REFUND_DELAY).
  const openBy = moment === "unopened" ? dateInWords((status.createdAtChain + 14 * 86_400) * 1000, zone) : null;
  const connectBy = moment === "openedNotConnected" && status.claimedAtChain > 0 ? dateInWords((status.claimedAtChain + 14 * 86_400) * 1000, zone) : null;
  const cameBackOn = milestone?.reachedAtMs ? dateInWords(milestone.reachedAtMs, zone) : daily?.lastReturnAtMs ? dateInWords(daily.lastReturnAtMs, zone) : null;

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
    shown: condition?.nature === "shown",
    shape: milestone ? (milestone.shape === "certificate" ? "stamp" : "climb") : "days",
    openBy,
    connectBy,
    endedOnInWords: milestone?.reachedAtMs ? dateInWords(milestone.reachedAtMs, zone) : daily && daily.finished && daily.endDay > 0 ? contractDayInWords(daily.endDay) : null,
    deadlineInWords: milestone?.deadlineMs ? dateInWords(milestone.deadlineMs, zone) : null,
    nextReadingInWords: moment === "counting" || moment === "climbing" ? nextReading : null,
    cameBackOnInWords: cameBackOn,
    takeableFromHome: !milestone && earned > 0n,
  });

  // The money on the card counts from what this device last saw of it, last in the arrival and once (the brief,
  // section 6). Only money counts: a rating is a reading, not an amount.
  const figureMoney = moneyOf(live.figure?.value);
  const seenMoney = useLastSeen(`viky.seen.gift.${giftId}.${live.figure?.label ?? ""}`, figureMoney?.value);
  const figureNode = figureMoney ? (
    <ArrivalAmount from={seenMoney ?? figureMoney.value} to={figureMoney.value} symbol={figureMoney.symbol} after={figureMoney.after} />
  ) : undefined;

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
        connectNow: A.connectNow,
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
      // Before it is opened, the account is the way in: making it IS opening the gift, the moment's one action.
      if (!status.opened) {
        return (
          <div className="flex flex-col gap-[var(--space-md)]">
            <p className="font-medium">{W.createToOpen}</p>
            <AccountPanel />
          </div>
        );
      }
      // After it, a reader without an account is somebody the page cannot know: a judge, or the person it is for coming
      // back. Signing in is a door and not the moment's action, so it is one quiet line that opens the panel (V4: a
      // page with no action is read in three seconds, and a sun button on every moment made every moment ask).
      return signingIn ? (
        <AccountPanel returning signInOnly />
      ) : (
        <button type="button" onClick={() => setSigningIn(true)} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.signInToSee}
        </button>
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
        // A condition of the third nature is connected, not named (D189): the source's own page, one gesture.
        if (condition?.link.kind === "connect") return <ConnectTheAccount giftId={giftId} conditionId={condition.id} yours={mine} onChanged={reload} />;
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
        if (!milestone) return null;
        // A shown condition takes its one proof from the person's own account; a certificate takes a pasted link (D162).
        // A marathon takes a bib before the start and a reading after the finish, on its own screen (D273).
        if (milestone.conditionId === "marathon-finish") return <MarathonProof giftId={giftId} status={milestone} yours={mine} onChanged={reload} />;
        if (milestone.conditionId === "wca-time") return <WcaProof giftId={giftId} status={milestone} yours={mine} onChanged={reload} />;
        return conditionById(milestone.conditionId)?.nature === "shown" ? (
          <ShowProof giftId={giftId} conditionId={milestone.conditionId} yours={mine} review={milestone.review?.status ?? null} reviewMessage={milestone.review?.message ?? null} onShown={reload} />
        ) : (
          <CertificateProof giftId={giftId} conditionId={milestone.conditionId} yours={mine} onProved={reload} />
        );
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
        return <AskAgain funderName={funderName} />;
      case "offerAgain":
        return (
          <Link href="/" className={PRIMARY_BUTTON}>
            {L.startTooHigh.offerAgain}
          </Link>
        );
      default:
        return null;
    }
  })();

  // The gift's own drawing, alive (V4): the row of days, the climb, or the stamp. What it shows is said in words beside
  // it, so none of the three repeats a figure the state or the money carries.
  const shape = milestone ? (
    milestone.shape === "certificate" ? (
      <Stamp state={milestone.reached ? "stamped" : milestone.finished || milestone.cancelled ? "void" : "waiting"} asleep={!milestone.opened} />
    ) : (
      <Climb giftId={giftId} status={milestone} />
    )
  ) : daily ? (
    <DayRow id={giftId} gift={daily} catchUpSeconds={daily.catchUpSeconds} records={daily.days} voice={voice} />
  ) : null;

  /** What was agreed: the amount, what it counts, how long, and what happens to what is not earned. Read once. */
  const agreed = (
    <>
      {milestone ? (
        <>
          <p className={BODY}>{M.target(milestone.targetWords ?? milestone.target, source)}</p>
          <p className={BODY}>
            {readerIsFunder
              ? M.atDeadlineTheirs(milestoneBy(milestone, zone))
              : M.atDeadlineYours(milestoneBy(milestone, zone), funderName)}
          </p>
          {milestone.startReading !== null ? <p className={HELP}>{M.startedAt(milestone.startReading)}</p> : null}
          {/* A marathon's bib and the line read, to whoever is not at the moment of entering or reading them (D273). */}
          {milestone.marathon && read.action !== "shareProof" ? <MarathonStanding marathon={milestone.marathon} /> : null}
          {milestone.wca && read.action !== "shareProof" ? <WcaStanding wca={milestone.wca} /> : null}
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
      {readerIsFunder ? <p className={HELP}>{W.made(dateInWords(status.createdAtChain * 1000, zone), giftId)}</p> : null}
    </>
  );

  /** How this is checked: what the source is, when it is read, and the proof anybody may take away. */
  const checked = (
    <>
      {nextReading && !gift.finished ? (
        <p className={HELP}>{voice === "recipient" ? (words?.reads ?? "") : (words?.readsTheirs ?? "")}</p>
      ) : null}
      {milestone ? (
        <p className={HELP}>{readerIsFunder ? M.ruleTheirs(milestone.target, milestoneBy(milestone, zone), settlingTimeInWords(nowMs, zone)) : M.ruleYours(milestone.target, milestoneBy(milestone, zone), settlingTimeInWords(nowMs, zone))}</p>
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
      amount
      gifts={[{ id: giftId, days: arriving, lastSeen: arriving.filter((day) => day === "earned" || day === "returned").length }]}
    >
      <Shell
        kind="task"
        character={<HeadCharacter />}
        {...(address || hadAccount ? { back: "/gifts", backLabel: W.backToGifts } : { back: "/", backLabel: W.aboutViky, backFollows: true })}
      >
        {/* The one confetti of the app, on "Atteint", to the two people and to nobody else (decision B). */}
        <Confetti giftId={giftId} play={moment === "won" && (mine || readerIsFunder)} />
        <GiftLive
          from={eyebrowOf(voice, funderName)}
          who={titleOf(voice, recipientName ?? account.username)}
          what={condition?.name ?? ""}
          nature={condition ? <Nature nature={condition.nature} /> : null}
          shape={shape}
          live={live}
          figureNode={figureNode}
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

/** A money figure as the page prints it, "$2.00", taken apart so it can count; nothing for anything that is not money. */
export function moneyOf(printed: string | undefined): { symbol: string; value: number; after: string } | null {
  const found = printed ? /^([^\d\s]+)((?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2})([^\d]*)$/.exec(printed.trim()) : null;
  if (!found) return null;
  return { symbol: found[1], value: Number(found[2].replace(/,/g, "")), after: found[3] };
}

/** "by 17 Oct 2026" once the first reading has started the clock, "within 30 days of connecting" before it (D46). */
function milestoneBy(status: MilestoneStatus, zone: string): string {
  return status.deadlineMs === null ? M.withinDays(status.durationDays) : M.byDate(dateInWords(status.deadlineMs, zone));
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
