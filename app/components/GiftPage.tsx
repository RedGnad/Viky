"use client";
import Link from "next/link";
import { agreeFirst } from "@/src/client/consent";
import { useMinute } from "../kit/clock";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { openWithTheLinkSecret, type StartStep } from "@/src/client/v2";
import { openingSecretOf } from "@/src/v2-protocol";
import { opensByItsLink, paysTheSameDay } from "@/src/v2";
import { useMoneySession } from "@/src/account/money-session";
import { isAccountError } from "@/src/account/errors";
import { useDoor } from "@/src/account/door";
import { ownBrowserOf } from "@/src/account/passkey-support";
import * as mera from "@/src/account/mera";
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
  type OpenShown,
  nameGoalAccount,
  type GiftStatus,
  type PublicOutcome,
} from "@/src/client/gift";
import { checkMilestone, requestMilestoneCode, startMilestone, type MilestoneOutcome } from "@/src/client/milestone";
import { conditionById, conditionOfGoal } from "@/src/conditions";
import { MarkNotice } from "../kit/MarkNotice";
import { dayNow, lessonWouldPay } from "@/src/day-now";
import { stripFromRecord } from "@/src/day-states";
import { spokenAmount } from "@/src/display-currency";
import { followGiftLinks, giftLinkOnThisDevice } from "@/src/gift-link-memory";
import { forgetJustMade, wasJustMade } from "@/src/just-made";
import { giftOfMilestone, giftOfSummary, funderMayTakeItBack, readAs } from "@/src/gift-moment";
import { asItGoesNow, eyebrowOf, liveOf, titleOf } from "@/src/gift-live";
import { notTheirs, voiceOf, type Voice } from "@/src/gift-voice";
import { datedTheDayItIsRead, milestoneById } from "@/src/milestone-conditions";
import { previewLine, sharedWith } from "@/src/preview-line";
import { MILESTONE_LATE_PROOF_SECONDS } from "@/src/milestone-protocol";
import type { AnyGiftStatus } from "@/src/gift-status";
import type { MilestoneStatus } from "@/src/milestone-view";
import { contractDayInWords, contractRangeInWords, dateInWords, hourInWords, momentInWords, nextPassMs } from "@/src/moments";
import { COUNTING_PASS_UTC, settlingTimeInWords } from "@/src/pass-schedule";
import { reserveOf } from "@/src/reserves";
import { ACCOUNT_DOOR, CONSENT as C, GIFT_LIVE as L, GIFT_PAGE as W, LIMIT, MILESTONE_ACTIONS as A, MILESTONE_PAGE as M, WAITS } from "@/src/sentences";
import { AskAgain } from "../kit/AskAgain";
import { Button } from "../kit/Button";
import { CertificateProof } from "../kit/CertificateProof";
import { MarathonProof, marathonLine } from "../kit/MarathonProof";
import { WcaProof, wcaLine } from "../kit/WcaProof";
import { ReachedOnItsPage, reachedOfStatus } from "../kit/ReachedMoment";
import { Nature } from "../kit/Nature";
import { ShowProof } from "../kit/ShowProof";
import { CheckThisDay } from "../kit/CheckThisDay";
import { CheckThisReading } from "../kit/CheckThisReading";
import { ConnectTheAccount } from "../kit/ConnectTheAccount";
import { Character } from "../kit/Character";
import { ConsentLine, funderConsentRows, recipientConsentRows, useGiftConsent, type StopCost } from "../kit/Consent";
import { ConnectTheSource, type ConnectWords } from "../kit/ConnectTheSource";
import { dayReadingFailure, useDayReading } from "../kit/DayReading";
import { DayRow } from "../kit/DayRow";
import { charactersOf } from "../kit/DayStrip";
import { FieldRefusal } from "../kit/FieldRefusal";
import { FunderControls } from "../kit/FunderControls";
import { GiftLive } from "../kit/GiftLive";
import { HeadCharacter } from "../kit/HeadCharacter";
import { Lines, MOST_LINES_IN_A_FOLD } from "../kit/Lines";
import { LinkAgain } from "../kit/LinkAgain";
import { Climb } from "../kit/Climb";
import { HadOrNot } from "../kit/HadOrNot";
import type { ToldAbout } from "../kit/MorningMessage";
import { LiveLine, useLiveReading } from "../kit/LiveReading";
import { openDayLine } from "@/src/client/limit";
import { contactEmail } from "@/src/contact";
import { Figure } from "../kit/Figure";
import { Arrival, ArrivalAmount, Reacts, Success, useLastSeen } from "../kit/Motion";
import { Shell } from "../kit/Shell";
import { ButtonWords, StepInProgress, WaitLine } from "../kit/Waiting";
import { YouDecide } from "../kit/YouDecide";
import { AccountPanel } from "./AccountPanel";
import { BODY, HELP, PRIMARY_BUTTON, SMALL_BUTTON } from "./ui";

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

type Busy = "idle" | "opening" | "naming" | "starting" | "counting";
type Where = "open" | "name" | "start" | "count";


/** Our own typed sentences verbatim; anything else as one plain line, so no library's words reach a person. */
function screenMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ? `${error.message} (${error.detail})` : error.message;
  // A passkey that did not answer, or answered for another account, says so in the account's own words.
  if (isAccountError(error)) return error.guidance;
  return A.failed;
}

/**
 * The gift's screen. The gift itself comes from the server, read while the page rendered (D160): before that, this
 * screen was built twice, once as "One moment" and once as the gift, and a phone showed the entrance animation of
 * one tree and then the entrance animation of another. What the browser still does is ask again after something
 * happens on the screen, which is a refresh of the same tree and not a second screen.
 */
export function GiftPage({
  giftId,
  linkKey,
  initialStatus,
  openProof = null,
}: Readonly<{ giftId: string; linkKey: string | null; initialStatus?: AnyGiftStatus | null; /** The session the reader has open for this gift's proof, as the server read it with the page. */ openProof?: OpenShown | null }>) {
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

  // A second reading while the page is open: a failure keeps the page as it is, where `reload` would replace it.
  const refresh = useCallback(
    () =>
      loadGiftStatus(giftId, linkKey).then(
        (answer) => setStatus(answer as GiftStatus | MilestoneStatus),
        () => undefined,
      ),
    [giftId, linkKey],
  );

  /**
   * Read again whenever the account reading it changes (the audit of 1 Oct 2026): the gift says who its reader is,
   * the funder, the person it is for or neither, and somebody who signs in on this page is not who the page was built
   * for. A funder who signed in on their own link kept the page of a stranger, with "Open my gift" on it. The first
   * image is still the server's (D160): it was read for the account the cookie names, which is the one announced here.
   */
  const { address } = useAccount();
  useEffect(() => {
    if (asTheServerRead.current) {
      asTheServerRead.current = false;
      return;
    }
    void reload();
  }, [reload, address]);

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
        <WaitLine>{W.loading}</WaitLine>
      </Shell>
    );
  }
  return <LiveGift status={status} linkKey={linkKey} reload={reload} refresh={refresh} openProof={openProof} />;
}

const onHashChange = (changed: () => void) => {
  window.addEventListener("hashchange", changed);
  return () => window.removeEventListener("hashchange", changed);
};

/**
 * The secret after the `#` of the link this page was opened by, or nothing (the review of 2 Oct 2026, R-01). It opens
 * a gift of the second version, and it is read here and nowhere else: a browser sends what follows a `#` to no server,
 * so the page as the server renders it has none, and it is known once the browser has the page.
 */
function useOpeningSecret(): string | null {
  return useSyncExternalStore(onHashChange, () => openingSecretOf(window.location.hash), () => null);
}

function LiveGift({ status, linkKey, reload, refresh, openProof }: Readonly<{ status: GiftStatus | MilestoneStatus; linkKey: string | null; reload: () => Promise<void>; refresh: () => Promise<void>; openProof: OpenShown | null }>) {
  const { address, hasCredential, ensureSigner, status: accountStatus, createAccount, signIn } = useAccount();
  const openingSecret = useOpeningSecret();
  const door = useDoor();
  useMoneySession();
  const money = useDisplayCurrency(address);
  /** The clock this reader keeps, so a date says their day and not the server's (D160). */
  const zone = useReaderZone();
  const nowMs = useMinute();
  const [busy, setBusy] = useState<Busy>("idle");
  /** The step a running gesture is on, named under its button once the wait has passed ten seconds (app/kit/Waiting.tsx). */
  const [step, setStep] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ at: Where; text: string; failed: boolean } | null>(null);
  /** A signed-out reader of an opened gift asked to sign in: the quiet line opens the door, it is not the moment's action. */
  const [signingIn, setSigningIn] = useState(false);
  /** "Open my gift" pressed with nobody signed in: the account comes first, then the gift is opened, on that one press. */
  const [comingIn, setComingIn] = useState(false);
  // Whether an account was signed in on this page before it went: then the session closed while they were here,
  // rather than a page opened again with nobody signed in (D74, D80).
  const [hadAccount, setHadAccount] = useState(false);
  if (address && !hadAccount) setHadAccount(true);
  /**
   * How many times the gift was opened while this page stood: once at most. A page drawn on a gift already opened
   * counts none, so the character at its head answers the opening itself and nothing else (the founder, 4 Oct 2026).
   */
  const [sawOpened, setSawOpened] = useState(status.opened);
  const [openings, setOpenings] = useState(0);
  if (status.opened !== sawOpened) {
    setSawOpened(status.opened);
    if (status.opened) setOpenings(openings + 1);
  }

  const milestone = status.kind === "milestone" ? status : null;
  const daily = status.kind === "milestone" ? null : status;
  const giftId = status.giftId;
  /** Whether the reader arrives from the payment that made this gift: read once, as the page is first drawn in the browser. */
  const [justMade] = useState(() => typeof window !== "undefined" && wasJustMade(status.giftId));
  useEffect(() => {
    if (justMade) forgetJustMade();
  }, [justMade]);
  // Whether this device holds the gift's link, read in the browser and followed: the funder's card says "Send it" then.
  const linkHere = useSyncExternalStore(followGiftLinks, () => giftLinkOnThisDevice(giftId) !== null, () => false);
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

  /**
   * A climb is read live while its page is open and in front (the founder, 29 Sep 2026), by either of its two people,
   * through the counting route and its rate limit: a plain look each minute, and a proof only at or past the target.
   * A new figure refreshes the page quietly; a reading that reaches the target refreshes it too, and the moment plays
   * at once, over this page, without a reload (ReachedOnItsPage below).
   */
  /**
   * The month's limit (the founder, 3 Oct 2026): when it is reached no reading can go for this gift, so none is asked,
   * and the card says why where it says where the gift stands. A condition a person shows a proof for has the other
   * limit, said where the proof starts (ShowProof).
   */
  const limit = status.limit ?? null;
  // The reserve this gift draws on, when it is the one used up: the proofs of people for a document shown, the
  // readings for everything Viky reads by itself. The other one being empty changes nothing for this gift.
  const emptyReserve = limit && status.opened && condition ? (limit[reserveOf(condition.nature)] ? reserveOf(condition.nature) : null) : null;
  const readingsStopped = emptyReserve === "readings";
  const readsLive = Boolean(milestone && milestone.shape !== "certificate" && moment === "climbing" && (voice === "recipient" || voice === "funder") && !readingsStopped);
  const shownReading = milestone?.todayReading ?? null;
  const liveState = useLiveReading(
    readsLive,
    () => checkMilestone(giftId),
    (outcome) => {
      if (outcome.kind === "reached" || (outcome.kind === "notYet" && outcome.rating !== shownReading)) void refresh();
    },
  );
  const readingLine = readsLive ? <LiveLine state={liveState} source={source} /> : null;
  /**
   * A habit read as the day goes (the third daily contract, the founder's mockup of 3 Oct 2026): the page looks as it
   * opens and once a minute, for either of its two people, and only while a lesson done now would pay a day. A look
   * costs nothing; the attested reading starts by itself for a lesson seen, and nothing is pressed (app/kit/DayReading.tsx).
   */
  const asItGoes = daily?.readLive && moment === "counting" ? (words?.asItGoes ?? null) : null;
  const today = daily && asItGoes ? dayNow(daily, daily.catchUpSeconds, nowMs) : null;
  const readsTheDay = Boolean(asItGoes && (mine || readerIsFunder) && !readingsStopped && lessonWouldPay(today));
  const dayReading = useDayReading(readsTheDay, giftId, () => void refresh());
  // A look or a reading that failed on our side: said under the state, with the hour the open day can still be
  // counted until, in the reader's own clock. The page looks again in a minute.
  const openUntilMs = !daily || !today || today.kind === "counted" ? null : today.kind === "catchUp" ? today.deadlineMs : (today.day + 1) * 86_400_000 + daily.catchUpSeconds * 1_000;
  const dayFailure = dayReadingFailure(dayReading, source);
  const dayFailureLine = dayFailure ? [dayFailure, openUntilMs !== null && nowMs !== 0 ? L.asItGoes.stillOpenUntil(momentInWords(openUntilMs, nowMs)) : ""].filter(Boolean).join(" ") : null;
  /** The recipient's yes and stop (the founder, 29 Sep 2026): the line under the card, and the funder's sentence. */
  const consent = useGiftConsent(giftId, (mine || readerIsFunder) && status.opened && !gift.finished);
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
  const returnedDisplay = milestone ? milestone.returnedDisplay : (daily?.returnedDisplay ?? "");
  const theirsDisplay = milestone
    ? milestone.reached
      ? milestone.amountDisplay
      : milestone.earnedDisplay
    : (daily?.alreadyTheirsDisplay ?? daily?.earnedDisplay ?? "");

  /** The last day Viky judged, from the record it keeps of each day. Nothing for a gift settled before that record. */
  const lastJudged = daily && daily.days.length > 0 ? [...daily.days].sort((a, b) => b.day - a.day)[0].outcome : null;
  // A gift read as the day goes announces no next reading: its page looked as it opened.
  const nextReading = nowMs === 0 || gift.finished || gift.cancelled || readingsStopped || asItGoes ? null : W.nextReading(momentInWords(nextPassMs(COUNTING_PASS_UTC, nowMs), nowMs));
  // One sentence in the open: which service is not checked, by this gift's own source, and the day it starts again.
  // The rest is folded, a line each: until when the open day can still be counted, in the reader's clock, that what is
  // theirs is taken out as usual, what the empty reserve does not touch, and where to write.
  const limitSaid =
    emptyReserve && limit && !gift.finished && !gift.cancelled
      ? {
          said: LIMIT.said(source, emptyReserve, limit.again, mine),
          can: [
            emptyReserve === "readings" && limit.countableUntil && nowMs !== 0 && (mine || readerIsFunder) ? openDayLine(limit.countableUntil, mine, recipientName, nowMs) : null,
            mine ? LIMIT.lines.takeYours : LIMIT.lines.takeTheirs,
            LIMIT.lines.untouched[emptyReserve],
            contactEmail() ? LIMIT.lines.write(contactEmail() as string) : null,
          ].filter((line): line is Row => Boolean(line)),
        }
      : null;
  // Both contracts give an unopened gift back 14 days after it was funded, and an opened gift nothing started 14 days
  // after it was opened (GiftEscrow's UNCLAIMED_REFUND_DELAY, MilestoneGift's DORMANT_REFUND_DELAY).
  const openBy = moment === "unopened" ? dateInWords((status.createdAtChain + 14 * 86_400) * 1000, zone) : null;
  const connectBy = moment === "openedNotConnected" && status.claimedAtChain > 0 ? dateInWords((status.claimedAtChain + 14 * 86_400) * 1000, zone) : null;
  const cameBackOn = milestone?.reachedAtMs ? dateInWords(milestone.reachedAtMs, zone) : daily?.lastReturnAtMs ? dateInWords(daily.lastReturnAtMs, zone) : null;

  /**
   * Something had or not (the audit of 1 Oct 2026): its target on the contract is 1, or a count nobody reads, and is
   * never printed; and once it has a proof, or its last day has passed, the page says where that stands. What was
   * granted by the last day may be shown for the contract's late window after it.
   */
  const hadOrNot = milestone?.shape === "certificate" ? milestone : null;
  const lateUntilMs = hadOrNot && hadOrNot.deadlineMs !== null ? hadOrNot.deadlineMs + MILESTONE_LATE_PROOF_SECONDS * 1000 : null;
  // The contract compares days: the whole of the last day counts, so "past" is the day after it, on its own clock.
  const pastTheLastDay = Boolean(hadOrNot && hadOrNot.deadlineMs !== null && nowMs !== 0 && Math.floor(nowMs / 86_400_000) > Math.floor(hadOrNot.deadlineMs / 86_400_000));
  // Where a source dates what it grants, what was had in time can still be proved; where the showing is what is dated,
  // nothing shown after the last day can pay (src/shown-verification.ts: the day shown is the day sent to the contract).
  // A proof nobody reviewed in time is said for good, on the gift over as on the gift about to go back.
  const unread = hadOrNot?.review?.status === "unread";
  // A race and a competition are dated the day their result is read, so they stand with what is shown.
  const proofStands = !hadOrNot || !hadOrNot.opened ? null : unread ? "unread" : gift.finished ? null : (hadOrNot.review?.status ?? (pastTheLastDay ? (condition?.nature === "shown" || datedTheDayItIsRead(hadOrNot.conditionId) ? "ended" : "late") : null));
  /** The target as a sentence may name it: a climb's number, a grade's words, and nothing for something had or not. */
  const targetToName = !milestone ? null : hadOrNot ? (milestone.targetWords ?? null) : (milestone.targetWords ?? (milestone.target === null ? null : String(milestone.target)));

  const nextPass = nowMs === 0 || gift.finished || gift.cancelled || readingsStopped || asItGoes ? null : nextPassMs(COUNTING_PASS_UTC, nowMs);
  const liveInput = {
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
    linkHere,
    connectBy,
    endedOnInWords: milestone?.reachedAtMs ? dateInWords(milestone.reachedAtMs, zone) : daily && daily.finished && daily.endDay > 0 ? contractDayInWords(daily.endDay) : null,
    deadlineInWords: milestone?.deadlineMs ? dateInWords(milestone.deadlineMs, zone) : null,
    nextReadingInWords: moment === "counting" || moment === "climbing" ? nextReading : null,
    nextReadingAt: moment === "counting" && nextPass !== null ? hourInWords(nextPass) : null,
    cameBackOnInWords: cameBackOn,
    // What a gift paid is used from Home, a habit's as a milestone's: nothing on this page takes it any more.
    takeableFromHome: earned > 0n,
    proof: proofStands,
    lateUntilInWords: lateUntilMs === null ? null : dateInWords(lateUntilMs, zone),
    // Ended by the person it is for: the day in this reader's clock, and the two amounts the ending moved.
    ended: status.ended ? { onInWords: dateInWords(status.ended.atMs, zone), keptDisplay: status.ended.keptDisplay, givenBackDisplay: status.ended.givenBackDisplay } : null,
    // Where today stands, once the clock is known: before it, the card says what it always said of a gift counting.
    asItGoes: daily && asItGoes && nowMs !== 0 ? asItGoesNow(today, nowMs, daily.perDayDisplay, dayReading.phase === "certifying", asItGoes) : null,
  } as const;
  const said = liveOf(liveInput);
  // Under the state, after what the next lesson pays: a sentence of that length has no place beside the figures.
  const live = dayFailureLine ? { ...said, next: [said.next, dayFailureLine].filter(Boolean).join(" ") } : said;

  // The money on the card counts from what this device last saw of it, last in the arrival and once (the brief,
  // section 6). Only money counts: a rating is a reading, not an amount.
  const figureMoney = moneyOf(live.figure?.value);
  const seenMoney = useLastSeen(`viky.seen.gift.${giftId}.${live.figure?.label ?? ""}`, figureMoney?.value);
  const figureNode = figureMoney ? (
    <ArrivalAmount from={seenMoney ?? figureMoney.value} to={figureMoney.value} symbol={figureMoney.symbol} after={figureMoney.after} />
  ) : undefined;

  /**
   * The agreement, then the gift (the audit of 1 Oct 2026): a gesture that signed the yes is followed by the yes on
   * the page, so the line under the card never says nothing is read while the reading has begun, and "Agree" is
   * never offered for a yes already given. Every gesture of the page and of the blocks it mounts ends here.
   */
  const reloadAll = async () => {
    await consent.reload();
    await reload();
  };

  const run = async (kind: Busy, where: Where, action: () => Promise<string | null>, firstStep: string | null = null) => {
    setBusy(kind);
    setStep(firstStep);
    setAnswer(null);
    try {
      const message = await action();
      if (message) setAnswer({ at: where, text: message, failed: false });
      await reloadAll();
    } catch (error) {
      setAnswer({ at: where, text: screenMessage(error), failed: true });
    } finally {
      setBusy("idle");
      setStep(null);
    }
  };

  /** What a daily reading answered, in the words of the register and of the page, or a refusal thrown to be shown. */
  const dailyOutcome = (result: PublicOutcome): string => {
    switch (result.kind) {
      case "bound":
        // The first day is the day of the connection on the third daily contract, and the day after it before.
        return [(paysTheSameDay(status.version) && words?.asItGoes ? words.asItGoes.countingFrom(contractDayInWords(Math.floor(nowMs / 86_400_000))) : words?.countingFrom(contractDayInWords(Math.floor(nowMs / 86_400_000) + 1))) ?? "", account.namedByFunder ? "" : W.codeOut]
          .filter(Boolean)
          .join(" ");
      case "counted":
        return W.readCounted(result.creditedDays);
      case "already":
        return result.reason === "counted_today" ? (words?.alreadyRead ?? W.readCounted(0)) : (W.nothingToDo[result.reason] ?? W.readCounted(0));
      // A look alone is asked by the page that reads as it opens, never by a press: it has nothing to say here.
      case "seen":
        return W.readCounted(0);
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

  // What opens the gift: on the first version the key the link carries in `?t=`, which the server compares; on the
  // second the secret after the link's `#`, which no server is sent and which signs the opening here.
  const linkOpened = opensByItsLink(status.version);
  const openingKey = linkOpened ? openingSecret : linkKey;
  /** Opens the gift for an account: the one signed in on this page, or the one a press just brought in. */
  const openFor = (recipient: typeof address) =>
    run(
      "opening",
      "open",
      async () => {
        if (!openingKey) throw new ApiError({ status: 400, code: "NO_KEY", message: W.missingKey });
        // On the second version of the contracts the link's own key signs the opening, here, for the signed-in account:
        // the contract the gift is on and that account are what it needs (src/client/v2.ts).
        const contract = milestone ? milestone.escrow : daily?.escrow;
        // The secret after the `#` signs here or goes nowhere: it is never handed to the function that posts a key.
        if (linkOpened) await openWithTheLinkSecret({ giftId, linkSecret: openingKey, contract, recipient });
        else await claimGift(giftId, openingKey);
        return null;
      },
      WAITS.opening,
    );
  const open = () => openFor(address);
  /**
   * One press opens a gift from its link (the UI pass of 8 Oct 2026, screen 1 and rule 4): the account is made, or
   * signed in to, and then the gift is opened, with no second button to find. Making an account asks no decision the
   * press did not already carry, so it is a state of that button, which says "Opening" from the press to the end.
   *
   * The gift is read again for the account that just came in before anything is opened: who they are to it decides.
   * The person who paid for it, signing in on their own link, opens nothing, and neither does anybody on a gift
   * opened meanwhile; the page then draws what it is to them.
   */
  const openFromTheLink = async (how: "make" | "signIn") => {
    setComingIn(true);
    try {
      await (how === "make" ? createAccount("") : signIn());
      const cameIn = mera.currentAddress();
      // The passkey was closed or refused: the panel says what to do, and nothing was opened.
      if (!cameIn) return;
      const theirs = (await loadGiftStatus(giftId, linkKey)) as GiftStatus | MilestoneStatus;
      if (theirs.opened || theirs.youAreTheFunder) return;
      await openFor(cameIn);
    } catch {
      // The gift could not be read for them: the page reads it again as the account arrives, and offers the button.
    } finally {
      setComingIn(false);
    }
  };
  const name = (username: string) =>
    run(
      "naming",
      "name",
      async () => {
        await nameGoalAccount(giftId, username);
        return null;
      },
      WAITS.naming(source),
    );
  const askCode = () =>
    run(
      "naming",
      "name",
      async () => {
        if (milestone) {
          await requestMilestoneCode(giftId);
          return null;
        }
        if (account.username) await nameGoalAccount(giftId, account.username);
        return null;
      },
      WAITS.naming(source),
    );
  /** The first reading's steps, each one thing this page awaits: the source asked, the passkey, the reading written. */
  const startStep = (at: StartStep) => setStep(at === "reading" ? WAITS.firstReading(source) : at === "signing" ? WAITS.passkey : WAITS.recordingStart);
  // Starting is the gesture that asks for the first reading, so it is where the yes is signed (the founder, 29 Sep 2026).
  const start = () =>
    run(
      "starting",
      "start",
      async () => {
        await agreeFirst(giftId);
        // On the second version the account signs the first reading too: with no gesture when its session is open.
        return milestone ? milestoneOutcome(await startMilestone(giftId, ensureSigner, startStep)) : dailyOutcome(await bindGoalAccount(giftId, ensureSigner, startStep));
      },
      WAITS.agreeing,
    );
  const countToday = () =>
    run("counting", "count", async () => (milestone ? milestoneOutcome(await checkMilestone(giftId)) : dailyOutcome(await countNow(giftId))), WAITS.counting(source));

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
        anotherUsername: undefined,
        proveTitle: account.username ? A.proveTitle(account.username) : A.connectTitle(source),
        codeStep: milestoneById(milestone.conditionId)?.words.codeStep ?? "",
        connectNow: A.connectNow,
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
            notYetHow: words.notYetHow,
          },
          anotherUsername: words.anotherUsername,
          notYours: words.notYours,
          proveTitle: account.username ? words.proveTitle(account.username) : words.stillNeeds,
          codeStep: words.codeStep,
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
            {/* Inside another app's page no account is made here: the line says where to go, as the button under it
                does, rather than asking for what the box then refuses (the founder, 1 Oct 2026). Anywhere else the
                button says it all: "Open my gift" (the UI pass of 8 Oct 2026). */}
            {door.kind === "elsewhere" ? <p className="font-medium">{ACCOUNT_DOOR.continueIn(ownBrowserOf(door.handset, door.app))}</p> : null}
            {/* A device that remembers a passkey is somebody coming back: the press signs in, so no second account is made. */}
            <AccountPanel returning={hasCredential} opening={{ pressed: (how) => void openFromTheLink(how), busy: comingIn }} />
          </div>
        );
      }
      // After it, a reader without an account is somebody the page cannot know: a judge, or the person it is for coming
      // back. Signing in is a door and not the moment's action, so it is one quiet line that opens the panel (V4: a
      // page with no action is read in three seconds, and a sun button on every moment made every moment ask).
      return signingIn ? (
        <AccountPanel returning signInOnly />
      ) : (
        <button type="button" onClick={() => setSigningIn(true)} className={`${SMALL_BUTTON} self-start`}>
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
            {/* The same button as before the account, in the same state: a press made signed out goes on here. */}
            <Button doing={busy === "opening" || comingIn ? W.opening : null} step={step} waiting={(working && busy !== "opening") || !openingKey} onPress={() => void open()} data-open-my-gift="">
              {W.openMyGift}
            </Button>
            {openingKey ? answerAt("open") : <FieldRefusal id="gift-no-key">{W.missingKey}</FieldRefusal>}
          </>
        );
      case "connect":
        // A condition of the third nature is connected, not named (D189): the source's own page, one gesture.
        if (condition?.link.kind === "connect") return <ConnectTheAccount giftId={giftId} conditionId={condition.id} yours={mine} onChanged={reloadAll} />;
        return connectWords ? (
          <ConnectTheSource
            words={connectWords}
            account={account}
            funderName={funderName}
            busy={busy === "naming" ? "naming" : busy === "starting" ? "starting" : null}
            step={step}
            working={working}
            refusal={
              answer?.failed && (answer.at === "name" || answer.at === "start") ? { where: answer.at, text: answer.text } : null
            }
            onName={milestone ? undefined : name}
            onAskCode={askCode}
            onStart={start}
          />
        ) : null;
      case "shareProof":
        if (!milestone) return null;
        // Nothing shown after the last day can pay, so no gesture is offered for it: the title says when it goes back.
        // The same once a proof was never reviewed in time: the contract takes none any more.
        if (proofStands === "ended" || proofStands === "unread") return null;
        // A shown condition takes its one proof from the person's own account; a certificate takes a pasted link (D162).
        // A marathon takes a bib before the start and a reading after the finish, on its own screen (D273).
        if (milestone.conditionId === "marathon-finish") return <MarathonProof giftId={giftId} status={milestone} yours={mine} onChanged={reloadAll} />;
        if (milestone.conditionId === "wca-time") return <WcaProof giftId={giftId} status={milestone} yours={mine} onChanged={reloadAll} />;
        return conditionById(milestone.conditionId)?.nature === "shown" ? (
          <ShowProof giftId={giftId} conditionId={milestone.conditionId} yours={mine} review={milestone.review?.status === "unread" ? null : (milestone.review?.status ?? null)} reviewMessage={milestone.review?.message ?? null} limitReached={emptyReserve === "proofs"} openAtLoad={openProof} onShown={reloadAll} />
        ) : (
          <CertificateProof giftId={giftId} conditionId={milestone.conditionId} yours={mine} onProved={reloadAll} />
        );
      case "linkAgain":
        // Shared with who gave it, how much in the reader's own currency (the funder's), and what it is.
        return <LinkAgain giftId={giftId} found={linkOpened} shareText={sharedWith(funderName, spokenAmount(money.led(BigInt(status.amount))), previewLine(condition, Boolean(milestone)))} />;
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

  // The gift's own drawing, alive (V4): the row of days, the climb, or the character alone. What it shows is said in words beside
  // it, so none of the three repeats a figure the state or the money carries.
  const shape = milestone ? (
    milestone.shape === "certificate" ? (
      <HadOrNot state={milestone.reached ? "reached" : milestone.finished || milestone.cancelled ? "void" : "waiting"} asleep={!milestone.opened} />
    ) : (
      <Climb giftId={giftId} status={milestone} />
    )
  ) : daily ? (
    <DayRow id={giftId} gift={daily} catchUpSeconds={daily.catchUpSeconds} records={daily.days} voice={voice} silent={Boolean(live.when)} each={daily.perDayDisplay} leadOnToday={Boolean(asItGoes)} />
  ) : null;

  /**
   * What was agreed, as lines (the founder, 4 Oct 2026: a fold holds a label and its value, four at most, never a
   * paragraph): what it pays for, how long, and where what is not earned goes. Then, while there is room, what the
   * reader can still learn here: where a marathon or a competition stands, that the person it is for can end it,
   * that what is theirs is used from Home, where a climb started, and the day it was made.
   */
  const backToFunder = readerIsFunder ? W.lines.backToYou : W.lines.backTo(funderName);
  const eachDay = daily ? ((readerIsFunder || voice === "reader" ? words?.eachDayTheirs : words?.eachDayYours) ?? condition?.words.eachDay ?? "") : "";
  const agreedRows: Row[] = [
    ...(milestone
      ? [
          // What it asks in the register's words, or a grade's own; never "Reach 1 on their university".
          hadOrNot
            ? hadOrNot.asked
              ? ([M.lines.isFor, hadOrNot.asked] as const)
              : hadOrNot.targetWords
                ? ([M.lines.toReach, M.lines.onSource(hadOrNot.targetWords, source)] as const)
                : null
            : milestone.target !== null
              ? ([M.lines.toReach, M.lines.onSource(milestone.targetWords ?? milestone.target, source)] as const)
              : null,
          [M.lines.when, milestoneBy(milestone, zone)] as const,
          // What was not proved in time goes back two weeks later: the time left to show it (MILESTONE_LATE_PROOF_SECONDS).
          [M.lines.ifNot, hadOrNot ? M.lines.twoWeeksLater(backToFunder) : backToFunder] as const,
          // A marathon's bib and the line read, to whoever is not at the moment of entering or reading them (D273).
          milestone.marathon && read.action !== "shareProof" ? marathonLine(milestone.marathon) : null,
          milestone.wca && read.action !== "shareProof" ? wcaLine(milestone.wca) : null,
        ]
      : daily
        ? [[eachDay.charAt(0).toUpperCase() + eachDay.slice(1), daily.perDayDisplay] as const, [W.lines.days, agreedWhen(daily)] as const, [W.lines.missedDay, backToFunder] as const]
        : []),
    // The ending (the audit of 1 Oct 2026): only a gift of the second version of the contracts has one. The funder
    // reads here that it can happen; the person it is for has the gesture, under the card, in "You decide".
    readerIsFunder && linkOpened && !gift.finished && !gift.cancelled ? ([W.lines.canEnd(recipientName), W.lines.theRest] as const) : null,
    // On the third daily contract a day is paid the day it is read: what that guarantees, and no more.
    daily && paysTheSameDay(status.version) && words?.asItGoes ? words.asItGoes.agreed : null,
    // Where money already theirs goes (rule 5), at every moment it has some: while it counts, and once it is reached
    // or ended, where "Take $2.00" stood until 4 Oct 2026.
    mine && earned > 0n ? ([W.lines.yoursAlready, W.lines.fromHome] as const) : null,
    milestone && milestone.startReading !== null ? ([M.lines.startedAt, String(milestone.startReading)] as const) : null,
    readerIsFunder ? ([W.lines.made, W.lines.madeOn(dateInWords(status.createdAtChain * 1000, zone), giftId)] as const) : null,
  ]
    .filter((row): row is Row => Boolean(row))
    .slice(0, MOST_LINES_IN_A_FOLD);
  const agreed = <Lines quiet rows={agreedRows} />;

  /**
   * How this is checked, as lines too: when it is read, what is read and who agreed to it, and under them the proof
   * anybody may take away. The rule a milestone pays by is said once, in "What was agreed".
   */
  const checkedRows: Row[] = [
    asItGoes && !readingsStopped ? ([W.lines.read, asItGoes.reads] as const) : nextReading && !gift.finished && words?.reads ? ([W.lines.read, words.reads] as const) : null,
    daily && !stripFromRecordSafe(daily, nowMs) ? ([W.lines.olderDays, W.lines.fromTotals] as const) : null,
    // How an account the funder named is read, at the moment it is connected: it stood above the action (rule 4).
    mine && moment === "openedNotConnected" && account.namedByFunder && words ? ([W.lines.nothingToInstall, W.lines.fromProfile] as const) : null,
    ...(mine ? recipientConsentRows(consent.answer, zone) : []),
    ...(readerIsFunder ? funderConsentRows(consent.answer, recipientName, zone) : []),
  ]
    .filter((row): row is Row => Boolean(row))
    .slice(0, MOST_LINES_IN_A_FOLD);
  const checked = (
    <>
      <Lines quiet rows={checkedRows} />
      {/* Asking for a reading now is not the moment's action, so it is not offered beside it: it lives here, with the
          rest of how a gift is checked. Being told is offered in the open, under the card (the founder, 1 Oct 2026). */}
      {/* A milestone is read as its page opens, so it has no button for it (the founder, 29 Sep 2026). */}
      {/* Neither has a habit read as its page opens (the founder, 3 Oct 2026): opening the page is the gesture. */}
      {/* Only the person the gift is for: the route answers anybody else "Open the gift first." (the audit of 8 Oct 2026). */}
      {mine && !milestone && !gift.finished && gift.connected && !gift.sourceClosed && !readingsStopped && !asItGoes ? (
        <>
          <button type="button" onClick={countToday} disabled={working} className={`${SMALL_BUTTON} self-start`}>
            <ButtonWords busy={busy === "counting"} doing={W.reading}>
              {W.countNow}
            </ButtonWords>
          </button>
          <StepInProgress busy={busy === "counting"} step={step} />
          {answerAt("count")}
        </>
      ) : null}
      {/* The reading behind a day, to take away and check: with the rest of how a gift is checked since 1 Oct 2026
          (rule 6: nothing stands under the card but the round controls). */}
      {mine || readerIsFunder ? (
        <>
          {daily ? <CheckThisDay giftId={giftId} days={daily.days} /> : null}
          {milestone ? <CheckThisReading giftId={giftId} /> : null}
        </>
      ) : null}
    </>
  );

  const stopCost: StopCost = milestone
    ? {
        kind: "milestone",
        target: targetToName,
        by: milestoneBy(milestone, zone),
        amount: amountDisplay,
        funder: funderName ?? C.theFunder,
      }
    : { kind: "daily", funder: funderName ?? C.theFunder };

  const arriving = nowMs === 0 || !daily ? [] : charactersOf(daily, daily.catchUpSeconds, nowMs, daily.days);

  /** The gift is the reader's own and still theirs to decide about: opened, and neither over nor taken back. */
  const decides = mine && status.opened && !gift.finished && !gift.cancelled;
  /** What this gift's messages are about now: each morning for a habit, one moment for everything else. */
  // Before it is opened, the person who offered it is the only one told anything: being told was offered on the screen
  // after paying (the founder, 1 Oct 2026), and that screen is this page since 8 Oct 2026.
  const unopenedForItsFunder = readerIsFunder && !status.opened;
  const about: ToldAbout | null = (!status.opened && !unopenedForItsFunder) || gift.finished || gift.cancelled
    ? null
    : daily
      ? { kind: "morning" }
      : milestone?.review?.status === "pending"
        ? { kind: "review" }
        : hadOrNot
          ? { kind: "hadOrNot" }
          : milestone && (readsLive || unopenedForItsFunder)
            ? { kind: "reach", target: String(milestone.targetWords ?? milestone.target) }
            : null;
  // The funder's page as the funder reads it now, for the sheet that says what they see: the same moment in their
  // voice, and the days up to today, drawn small. A climb and a gift had or not are their state and their figure.
  const theirs = liveOf({ ...liveInput, voice: "funder" });
  const upToToday = daily && daily.startDay !== 0 ? arriving.slice(0, Math.max(1, arriving.findLastIndex((day) => day !== "toCome") + 1)).slice(-6) : [];
  const theirView = {
    shape:
      upToToday.length > 0 ? (
        <span aria-hidden className="decide-view-days">
          {upToToday.map((day, index) => (
            <span key={index}>
              <Character state={day} variant={index} standing={false} className="h-auto w-full" />
            </span>
          ))}
        </span>
      ) : null,
    headline: theirs.headline,
    figure: theirs.figure ? `${theirs.figure.value} ${theirs.figure.label}` : null,
  };

  return (
    <Arrival
      storageKey="viky.seen.days"
      amount
      gifts={[{ id: giftId, days: arriving, lastSeen: arriving.filter((day) => day === "earned" || day === "returned").length }]}
    >
      <Shell
        kind="task"
        /* No hero on a gift in progress (the founder, 29 Sep 2026): its one character is the drawing's, the climb or the days. */
        character={
          justMade ? (
            // Arriving from the payment that made it: the app's own character, waving, on the expressive spring, once,
            // and no confetti (V4, decision B). It stood on a screen of its own until 8 Oct 2026.
            <Success>
              <span className="block w-[72px] shrink-0">
                <Figure id="made" arms="wave" mouth="soft" halftone />
              </span>
            </Success>
          ) : moment === "counting" || moment === "climbing" || moment === "awaitingProof" ? null : (
            // The opening, made on this page: the gift's own character answers it, once. The days do not move.
            <Reacts gesture={openings}>
              <HeadCharacter />
            </Reacts>
          )
        }
        {...(address || hadAccount ? { back: "/gifts", backLabel: W.backToGifts } : { back: "/", backLabel: W.aboutViky, backFollows: true })}
      >
        <GiftLive
          from={eyebrowOf(voice, funderName)}
          who={titleOf(voice, recipientName ?? account.username)}
          what={condition?.name ?? ""}
          /* Not on a milestone's page (the founder, 29 Sep 2026): the line of reading says how it is read. */
          nature={condition && !milestone ? <Nature nature={condition.nature} /> : null}
          shape={shape}
          live={live}
          figureNode={figureNode}
          /* The source closed the account: said where the state is said, because it is the state now. */
          closed={
            milestone?.accountClosed && !gift.finished
              ? [milestoneById(milestone.conditionId)?.words.accountClosed ?? ""].filter(Boolean)
              : milestone?.startAboveCap != null && !gift.finished
                ? readerIsFunder
                  ? A.startAboveCapTheirs(milestone.startAboveCap, milestone.maximumStart, recipientName)
                  : A.startAboveCapMine(milestone.startAboveCap, milestone.maximumStart)
                : null
          }
          /* The month's limit of readings: in the place a reading would have been told. */
          limit={limitSaid}
          /* A lesson was seen: the attested reading runs by itself, and says what it is doing. */
          waiting={dayReading.phase === "certifying" ? WAITS.counting(source) : null}
          looking={dayReading.phase === "looking"}
          action={action}
          agreed={{ open: read.agreementOpen, children: agreed }}
          checked={checked}
          reading={readingLine}
        />

        {/* A gift that is not read and waits for its person: the one line that stays in the open, with its button. */}
        {decides ? <ConsentLine giftId={giftId} conditionId={condition?.id ?? ""} answer={consent.answer} underWay={moment === "counting" || moment === "climbing"} zone={zone} onChanged={() => void reloadAll()} /> : null}

        {/* The standing controls of the person it is for, under the card (the founder, 1 Oct 2026, you-decide.html):
            being told, what the funder sees, and the stop, each a round button and a sheet. */}
        {decides ? (
          <YouDecide
            giftId={giftId}
            conditionId={condition?.id ?? ""}
            funderName={funderName}
            answer={consent.answer}
            underWay={moment === "counting" || moment === "climbing"}
            cost={stopCost}
            zone={zone}
            about={about}
            end={status.end ? { contract: milestone ? milestone.escrow : daily!.escrow, offer: status.end } : null}
            theirView={theirView}
            onChanged={reloadAll}
          />
        ) : null}

        {/* The funder's own controls, the same round buttons (the founder's rule 6): being told how it goes once the
            gift is opened, and taking it back while nobody has opened it. */}
        {readerIsFunder ? (
          <FunderControls giftId={giftId} about={about} takeBack={funderMayTakeItBack(gift, voice) ? { amountDisplay, recipientName } : null} onTakenBack={reload} />
        ) : null}

        {/* The moment a gift is reached, to its two people and to nobody else (decision B): played here when this is
            where they arrive first, and again whenever they ask. */}
        {milestone?.reached && (mine || readerIsFunder) ? (
          <ReachedOnItsPage gift={reachedOfStatus(milestone, mine ? "recipient" : "funder", { recipientName, funderName })} />
        ) : null}

        {/* A gift that names the TOEFL: what its owner asks at the bottom of a page that names it. */}
        <MarkNotice naming={[condition?.name]} />
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

/** One line of a fold: a label and its value. */
type Row = readonly [label: string, value: string];

/** The dates a daily gift runs between, or how long it runs once it is connected. */
function agreedWhen(gift: Readonly<{ startDay: number; endDay: number; durationDays: number; version?: GiftStatus["version"] }>): string {
  return gift.startDay === 0 ? W.lines.fromConnecting(gift.durationDays, paysTheSameDay(gift.version)) : contractRangeInWords(gift.startDay, gift.endDay);
}

/** Whether the day row is drawn from the record of each day rather than from the totals alone. */
function stripFromRecordSafe(gift: GiftStatus, nowMs: number): boolean {
  return nowMs === 0 ? true : stripFromRecord(gift, gift.catchUpSeconds, nowMs, gift.days);
}

/** Kept for the catch-up sentence the day row leans on, so a day that can still be caught is never silent. */
export { catchUpDay };
