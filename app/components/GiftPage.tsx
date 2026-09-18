"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { catchUpDay } from "@/src/catch-up";
import { ApiError } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { bindGoalAccount, claimGift, countNow, loadGiftStatus, nameGoalAccount, withdrawEarned, type GiftStatus, type GiftSummary, type PublicOutcome } from "@/src/client/gift";
import { conditionOfGoal } from "@/src/conditions";
import { giftLinkOnThisDevice } from "@/src/gift-link-memory";
import { stripFromRecord } from "@/src/day-states";
import { whenInWords } from "@/src/display-currency";
import type { MilestoneStatus } from "@/src/milestone-view";
import { contractDayInWords, contractRangeInWords, dateInWords, momentInWords, nextPassMs } from "@/src/moments";
import { COUNTING_PASS_UTC } from "@/src/pass-schedule";
import { GIFT_PAGE as W } from "@/src/sentences";
import { charactersOf } from "../kit/DayStrip";
import { CheckThisDay } from "../kit/CheckThisDay";
import { DayRow } from "../kit/DayRow";
import { Arrival } from "../kit/Motion";
import { FieldRefusal } from "../kit/FieldRefusal";
import { GiftCard } from "../kit/GiftCard";
import { MorningMessage } from "../kit/MorningMessage";
import { Notice } from "../kit/Notice";
import { Shell } from "../kit/Shell";
import { AccountPanel } from "./AccountPanel";
import { MilestoneGiftPage } from "./MilestoneGiftPage";
import { BODY, CARD, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

/**
 * A gift's page, flows R1 to R12 on the product structure (S3): the person it is for opens it, connects what they do,
 * and watches each day become theirs; the funder reads the same page in their own words (R11). Everything a day says
 * is dated in the reader's clock (item 12), every amount is in the text face (item 7), the head of the page is the same
 * gift card as on Home and Gifts (item 9), and what depends on the source comes from the register (item 10).
 *
 * The page decides who is reading from the route: the recipient signed in, the funder signed in, or somebody holding
 * the link, who is addressed as the person it is for. It keeps no state of its own that the route could contradict:
 * every action ends by reading the gift again.
 */

type Busy = "idle" | "opening" | "naming" | "binding" | "counting" | "taking";
type Where = "open" | "name" | "bind" | "count" | "take";
type Taken = Readonly<{ amount: string; atMs: number; take: number }>;

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
  return "That did not go through, and nothing was changed. Try again.";
}

export function GiftPage({ giftId, linkKey }: Readonly<{ giftId: string; linkKey: string | null }>) {
  const [status, setStatus] = useState<GiftStatus | MilestoneStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  if (status.kind === "milestone") return <MilestoneGiftPage status={status} linkKey={linkKey} reload={reload} />;
  return <DailyGiftPage gift={status} linkKey={linkKey} reload={reload} />;
}

/** The card's own description of this gift, from the page's reading of it, so the head of the page is the same card. */
export function summaryOf(gift: GiftStatus, readerIsFunder: boolean): GiftSummary {
  return {
    giftId: gift.giftId,
    role: readerIsFunder ? "funder" : "recipient",
    goalType: gift.goalType,
    goalUsername: gift.goalAccount.source === "funder" ? gift.goalAccount.username : null,
    usernameSource: gift.goalAccount.source,
    recipientName: gift.names?.recipientName ?? null,
    funderName: gift.names?.funderName ?? null,
    catchUpSeconds: gift.catchUpSeconds,
    days: gift.days,
    fundedAt: gift.createdAtChain,
    startDay: gift.startDay,
    endDay: gift.endDay,
    amountDisplay: gift.amountDisplay,
    perDayDisplay: gift.perDayDisplay,
    durationDays: gift.durationDays,
    creditedDays: gift.creditedDays,
    missedDays: gift.missedDays,
    opened: gift.opened,
    counting: gift.connected,
    finished: gift.finished,
    cancelled: gift.cancelled,
    earnedDisplay: gift.earnedDisplay,
    theirsDisplay: gift.alreadyTheirsDisplay,
    returnedDisplay: gift.returnedDisplay,
  };
}

function DailyGiftPage({ gift, linkKey, reload }: Readonly<{ gift: GiftStatus; linkKey: string | null; reload: () => Promise<void> }>) {
  const { address, ensureSigner, status: accountStatus } = useAccount();
  // Money moves on this page, so the session stays open thirty minutes rather than ten (decision 2, 17 Sep 2026).
  useMoneySession();
  const money = useDisplayCurrency(address);
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ where: Where; message: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [notMineOpen, setNotMineOpen] = useState(false);
  const [notYetOpen, setNotYetOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [taken, setTaken] = useState<Taken | null>(null);
  const [copied, setCopied] = useState<"yes" | "refused" | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  // Whether somebody was signed in on this page before the session went: then it closed while they were away (R12).
  const [hadAccount, setHadAccount] = useState(false);
  if (address && !hadAccount) setHadAccount(true);

  const condition = conditionOfGoal(gift.goalType);
  const words = condition?.recipient;
  const readerIsFunder = gift.youAreTheFunder;
  const mine = gift.youAreTheRecipient;
  const outsider = Boolean(address) && gift.opened && !mine && !readerIsFunder;
  const account = gift.goalAccount;
  const funder = gift.names?.funderName ?? null;
  const recipient = gift.names?.recipientName ?? (account.source === "funder" ? account.username : null);
  const working = busy !== "idle" || accountStatus === "busy";
  const catchUp = nowMs === 0 ? undefined : catchUpDay(gift, gift.catchUpSeconds, nowMs);
  const range = gift.startDay === 0 ? null : contractRangeInWords(gift.startDay, gift.endDay);
  const exact = BigInt(gift.perDay) * BigInt(gift.durationDays) === BigInt(gift.amount);
  const perDay = `${exact ? "" : "about "}${gift.perDayDisplay}`;
  const codeExpired = account.codeExpiresAt !== null && nowMs !== 0 && new Date(account.codeExpiresAt).getTime() <= nowMs;
  const earned = BigInt(gift.earned);
  const about = money.about(BigInt(gift.amount));

  const run = async (kind: Busy, where: Where, action: () => Promise<string | null>) => {
    setBusy(kind);
    setProblem(null);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      await reload();
    } catch (error) {
      setProblem({ where, message: screenMessage(error) });
    } finally {
      setBusy("idle");
    }
  };

  const outcome = (result: PublicOutcome): string => {
    switch (result.kind) {
      case "bound":
        return [words?.countingFrom(contractDayInWords(Math.floor(nowMs / 86_400_000) + 1)) ?? "", account.source === "recipient" ? W.codeOut : ""].filter(Boolean).join(" ");
      case "counted":
        return W.readCounted(result.creditedDays);
      case "already":
        return result.reason === "counted_today" ? (words?.alreadyRead ?? W.readCounted(0)) : (W.nothingToDo[result.reason] ?? W.readCounted(0));
      case "refused":
        throw new ApiError({ status: 409, code: result.code, message: result.code === "CODE_NOT_IN_NAME" ? `${result.message} ${W.notSeenYet}` : result.message });
    }
  };

  const open = () =>
    run("opening", "open", async () => {
      if (!linkKey) throw new ApiError({ status: 400, code: "NO_KEY", message: W.missingKey });
      await claimGift(gift.giftId, linkKey);
      return null;
    });
  const name = (username: string) =>
    run("naming", "name", async () => {
      await nameGoalAccount(gift.giftId, username);
      setRenaming(false);
      setTyped("");
      return null;
    });
  const bind = () => run("binding", "bind", async () => outcome(await bindGoalAccount(gift.giftId)));
  const count = () => run("counting", "count", async () => outcome(await countNow(gift.giftId)));
  const take = () =>
    run("taking", "take", async () => {
      // The passkey is opened here, at the one moment a signature is needed, rather than assumed to be open.
      const signer = await ensureSigner();
      const amount = gift.earnedDisplay;
      const takeNumber = Number(gift.withdrawNonce) + 1;
      await withdrawEarned({ account: signer, giftId: gift.giftId, escrow: gift.escrow, amount: earned, nonce: BigInt(gift.withdrawNonce) });
      setReviewing(false);
      setTaken({ amount, atMs: Date.now(), take: takeNumber });
      return null;
    });

  const refusalAt = (where: Where) => (problem?.where === where ? <FieldRefusal id={`gift-${where}-refused`}>{problem.message}</FieldRefusal> : null);

  const title = readerIsFunder ? W.titleTheirs(recipient, gift.amountDisplay) : W.titleYours(funder, gift.amountDisplay);
  const when = range ?? W.forDaysFromConnecting(gift.durationDays);
  const summary = summaryOf(gift, readerIsFunder);
  // Somebody whose session just closed still has gifts; only a reader who never had an account here is sent to the door.
  const back = address || hadAccount ? { back: "/gifts", backLabel: W.backToGifts } : { back: "/", backLabel: W.aboutViky, backFollows: true };

  const prose = (
    <section className="flex flex-col gap-[var(--space-sm)]">
      {about ? <p className={HELP}>{about}</p> : null}
      {gift.cancelled ? (
        <p className={BODY}>{W.wentBackBeforeStart}</p>
      ) : gift.finished ? null : (
        <>
          <p className={BODY}>
            {readerIsFunder
              ? W.becomesTheirs(perDay, words?.eachDayTheirs ?? condition?.words.eachDay ?? "", when)
              : W.becomesYours(perDay, words?.eachDayYours ?? condition?.words.eachDay ?? "", when)}
          </p>
          <p className={HELP}>{readerIsFunder ? W.comesBackToYou(perDay) : W.goesBackToThem(perDay, funder)}</p>
          {!gift.opened && !readerIsFunder ? <p className={HELP}>{W.openBy(dateInWords((gift.createdAtChain + 14 * 86_400) * 1_000), funder)}</p> : null}
        </>
      )}
    </section>
  );

  // The session closed while somebody was reading: a door to reopen, not a failure (R12, as W11).
  if (!address && hadAccount) {
    return (
      <Shell kind="task" {...back} step={W.closedTitle}>
        <GiftCard gift={summary} still />
        <p className={BODY}>{W.closedBody}</p>
        <AccountPanel returning signInOnly />
      </Shell>
    );
  }

  const actions: ReactNode[] = [];

  if (!gift.cancelled && !address) {
    actions.push(
      <section key="account" className="flex flex-col gap-[var(--space-md)]">
        <p className="font-medium">{gift.opened ? W.signInToSee : W.createToOpen}</p>
        {/* An opened gift is somebody's already: whoever reads it here without an account is coming back to one, so
            signing in is all there is to offer, and the panel's sentence about a gift and a payment is not theirs. */}
        {gift.opened ? <AccountPanel returning signInOnly /> : <AccountPanel />}
      </section>,
    );
  }

  if (outsider) actions.push(<p key="outsider" className={BODY}>{W.openedByOther}</p>);

  if (!gift.cancelled && address && !gift.opened && !readerIsFunder) {
    actions.push(
      <section key="open" className="flex flex-col gap-[var(--space-sm)]">
        <button type="button" onClick={open} disabled={working || !linkKey} className={PRIMARY_BUTTON}>
          {busy === "opening" ? W.opening : W.openMyGift}
        </button>
        {!linkKey ? <FieldRefusal id="gift-no-key">{W.missingKey}</FieldRefusal> : refusalAt("open")}
      </section>,
    );
  }

  // R5: the funder named the account.
  if (!gift.cancelled && mine && !account.bound && account.source === "funder" && account.username && words) {
    actions.push(
      <section key="named" className={CARD}>
        <p className={BODY}>{words.namedBy(account.username, funder ?? "the person who sent it")}</p>
        <button type="button" onClick={bind} disabled={working} className={PRIMARY_BUTTON}>
          {busy === "binding" ? W.reading : W.startCounting}
        </button>
        {refusalAt("bind")}
        <button type="button" onClick={() => setNotMineOpen((isOpen) => !isOpen)} aria-expanded={notMineOpen} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {words.notMine}
        </button>
        {notMineOpen ? <p className={HELP}>{W.namedWrong(funder)}</p> : null}
      </section>,
    );
  }

  // R3: connect the account, when nobody named it, or to change a name that is not theirs.
  const naming = !gift.cancelled && mine && !account.bound && account.source !== "funder" && (!account.code || renaming);
  if (naming && words) {
    actions.push(
      <section key="name" className={CARD}>
        <p className="font-medium">{words.stillNeeds}</p>
        <form
          className="flex flex-col gap-[var(--space-md)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed.trim()) void name(typed.trim());
          }}
        >
          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor="source-username" className="font-medium">
              {words.usernameLabel}
            </label>
            <p id="source-username-help" className={HELP}>
              {words.usernameHelp}
            </p>
            <input
              id="source-username"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="source-username-help"
              aria-invalid={problem?.where === "name" ? true : undefined}
              disabled={working}
              className={FIELD}
            />
            {problem?.where === "name" ? refusalAt("name") : typed.trim() === "" ? <p className={HELP}>{words.typeToContinue}</p> : null}
          </div>
          <button type="submit" disabled={working || typed.trim() === ""} className={PRIMARY_BUTTON}>
            {busy === "naming" ? W.checking : W.continue}
          </button>
        </form>
        <p className={HELP}>{words.noPassword}</p>
        {renaming ? (
          <button type="button" onClick={() => setRenaming(false)} className={SECONDARY_BUTTON}>
            {W.keepMyName}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setNotYetOpen((isOpen) => !isOpen)} aria-expanded={notYetOpen} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
              {words.notYet}
            </button>
            {notYetOpen ? <p className={HELP}>{W.notYetBody(funder)}</p> : null}
          </>
        )}
      </section>,
    );
  }

  // R4: prove the account is theirs, with a code in its display name.
  if (!gift.cancelled && mine && !account.bound && account.source === "recipient" && account.code && account.username && !renaming && words) {
    const username = account.username;
    const code = account.code;
    actions.push(
      <section key="prove" className={CARD}>
        <p className="font-medium">{words.proveTitle(username)}</p>
        {codeExpired ? (
          <>
            <p className={BODY}>{W.expired}</p>
            <button type="button" onClick={() => void name(username)} disabled={working} className={PRIMARY_BUTTON}>
              {busy === "naming" ? W.checking : W.newCode}
            </button>
            {refusalAt("name")}
          </>
        ) : (
          <>
            <p className={BODY}>{words.proveSteps}</p>
            <p className="text-center text-[length:var(--type-money)] font-semibold tracking-widest tabular-nums">{code}</p>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(code)
                  .then(() => setCopied("yes"))
                  .catch(() => setCopied("refused"))
              }
              className={SECONDARY_BUTTON}
            >
              {copied === "yes" ? W.copied : W.copyCode}
            </button>
            {copied === "refused" ? <FieldRefusal id="code-copy-refused">{W.copyRefused}</FieldRefusal> : null}
            {account.codeExpiresAt && nowMs !== 0 ? <p className={HELP}>{W.validUntil(momentInWords(new Date(account.codeExpiresAt).getTime(), nowMs))}</p> : null}
            <button type="button" onClick={bind} disabled={working} className={PRIMARY_BUTTON}>
              {busy === "binding" ? W.reading : W.iAddedIt}
            </button>
            {refusalAt("bind")}
            <p className={HELP}>{words.slowToShow}</p>
            <p className={HELP}>{W.removeAfter}</p>
          </>
        )}
        <button type="button" onClick={() => setRenaming(true)} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {words.notMine}
        </button>
      </section>,
    );
  }

  // R6 to R11: connected, counting, finished, and the funder's reading of it.
  const counting = !gift.cancelled && gift.connected && (mine || readerIsFunder);
  const nextReading = nowMs === 0 ? null : momentInWords(nextPassMs(COUNTING_PASS_UTC, nowMs), nowMs);
  const fromRecord = nowMs === 0 ? true : stripFromRecord(gift, gift.catchUpSeconds, nowMs, gift.days);
  const takeOffered = mine && earned > 0n;

  const takeBlock = takeOffered ? (
    reviewing ? (
      <section className={CARD}>
        <p className={BODY}>{W.takeReview(gift.earnedDisplay)}</p>
        {money.about(earned) ? <p className={HELP}>{money.about(earned)}</p> : null}
        <button type="button" onClick={take} disabled={working} className={PRIMARY_BUTTON}>
          {busy === "taking" ? W.taking : W.take(gift.earnedDisplay)}
        </button>
        {refusalAt("take")}
        <button type="button" onClick={() => setReviewing(false)} disabled={working} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.notNow}
        </button>
      </section>
    ) : (
      <button type="button" onClick={() => setReviewing(true)} disabled={working} className={PRIMARY_BUTTON}>
        {W.take(gift.earnedDisplay)}
      </button>
    )
  ) : null;

  /**
   * The link again, and only on the device that made the gift: it is the one thing the server cannot hand back, because
   * the link carries the key that opens the gift and prints the two names.
   */
  const keptLink = browser && readerIsFunder ? giftLinkOnThisDevice(gift.giftId) : null;
  const copyLink = (link: string) => navigator.clipboard.writeText(link).then(() => setCopiedLink(true)).catch(() => setCopiedLink(false));
  const linkAgain =
    keptLink && !gift.opened ? (
      <section className={CARD}>
        <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] select-all">{keptLink}</p>
        <button type="button" onClick={() => void copyLink(keptLink)} className={SECONDARY_BUTTON}>
          {copiedLink ? W.copied : W.copyLinkAgain}
        </button>
        <p className={HELP}>{W.linkOnlyHere}</p>
      </section>
    ) : null;

  const takenBlock = taken ? (
    <section className={CARD} role="status">
      <p className="font-medium">{W.taken(taken.amount, whenInWords(taken.atMs), gift.giftId, taken.take)}</p>
      <p className={HELP}>{W.stillInGift(gift.earnedDisplay, gift.finished ? 0 : Math.max(0, gift.daysLeft))}</p>
      <Link href="/cash-out" className={SECONDARY_BUTTON}>
        {W.sendToBank}
      </Link>
    </section>
  ) : null;

  const countingBlock = counting ? (
    <section className="flex flex-col gap-[var(--space-md)]">
      {gift.finished ? (
        <div className="flex flex-col gap-[var(--space-xs)]">
          <p className="font-medium">{W.finished(range ?? "")}</p>
          <p className={BODY}>
            {readerIsFunder
              ? W.daysTheirs(gift.creditedDays, gift.durationDays, gift.alreadyTheirsDisplay)
              : W.daysYours(gift.creditedDays, gift.durationDays, gift.alreadyTheirsDisplay)}
          </p>
          <p className={BODY}>{readerIsFunder ? W.cameBack(gift.missedDays, gift.returnedDisplay) : W.wentBackTo(gift.missedDays, funder, gift.returnedDisplay)}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--space-xs)]">
          <p className="font-medium">{gift.todayDayIndex === 0 ? W.counting(range ?? "") : W.dayOf(gift.todayDayIndex, gift.durationDays, range ?? "")}</p>
          {nextReading ? (
            <p className={HELP}>
              {W.nextReading(nextReading)} {words?.reads ?? ""}
            </p>
          ) : null}
        </div>
      )}
      {browser ? <DayRow id={gift.giftId} gift={gift} catchUpSeconds={gift.catchUpSeconds} records={gift.days} readerIsFunder={readerIsFunder} /> : null}
      {!fromRecord ? <p className={HELP}>{W.fromCountsNote}</p> : null}
      {/* The proof of a day goes only to the two people the gift is between (U2), so it is offered only to them. */}
      {mine || readerIsFunder ? <CheckThisDay giftId={gift.giftId} days={gift.days} /> : null}
      <MorningMessage giftId={gift.giftId} yours={mine || readerIsFunder} />
      <dl className="flex flex-col divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
        <Total label={readerIsFunder ? W.theirsSoFar : W.yoursSoFar} value={W.amountDays(gift.alreadyTheirsDisplay, gift.creditedDays)} />
        {mine ? <Total label={W.alreadyTaken} value={gift.takenDisplay} /> : null}
        <Total
          label={readerIsFunder ? W.cameBackToYou : W.backToFunder(funder)}
          value={W.amountDays(gift.returnedDisplay, gift.missedDays)}
          note={readerIsFunder && gift.lastReturnAtMs && nowMs !== 0 ? W.inYourAccount(momentInWords(gift.lastReturnAtMs, nowMs)) : undefined}
        />
      </dl>
      {catchUp && !gift.finished && words ? (
        <p className="font-medium">{readerIsFunder ? words.catchUpTheirs(momentInWords(catchUp.deadlineMs, nowMs)) : words.catchUpYours(momentInWords(catchUp.deadlineMs, nowMs))}</p>
      ) : null}
      {readerIsFunder && !gift.finished ? <p className={HELP}>{W.beingEarned}</p> : null}
      {mine && !gift.finished && gift.todayDayIndex > 0 ? (
        <div className="flex flex-col gap-[var(--space-sm)]">
          <button type="button" onClick={count} disabled={working} className={SECONDARY_BUTTON}>
            {busy === "counting" ? W.reading : W.countNow}
          </button>
          {refusalAt("count")}
        </div>
      ) : null}
    </section>
  ) : null;

  // What changed on this gift since this device last opened it, replayed once on arrival (brief, section 6).
  const arriving = nowMs === 0 ? [] : charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
  return (
    <Arrival
      storageKey="viky.seen.days"
      gifts={[{ id: gift.giftId, days: arriving, lastSeen: arriving.filter((day) => day === "earned" || day === "returned").length }]}
    >
    <Shell kind="task" {...back} step={title}>
      <GiftCard gift={summary} still />
      {takenBlock}
      {takeBlock}
      {linkAgain}
      {notice ? (
        <Notice role="status">
          <span>{notice}</span>
        </Notice>
      ) : null}
      {prose}
      {actions}
      {countingBlock}
      {readerIsFunder ? <p className={HELP}>{W.made(dateInWords(gift.createdAtChain * 1_000), gift.giftId)}</p> : null}
    </Shell>
    </Arrival>
  );
}

function Total({ label, value, note }: Readonly<{ label: string; value: string; note?: string }>) {
  return (
    <div className="flex flex-col gap-[var(--space-xs)] py-[var(--space-sm)]">
      <div className="flex items-baseline justify-between gap-[var(--space-md)]">
        <dt className={HELP}>{label}</dt>
        <dd className={`${BODY} text-right tabular-nums`}>{value}</dd>
      </div>
      {note ? <dd className={HELP}>{note}</dd> : null}
    </div>
  );
}
