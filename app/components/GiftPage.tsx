"use client";
import { useCallback, useEffect, useState } from "react";
import { CARD, FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";
import { useAccount } from "@/src/account/provider";
import * as mera from "@/src/account/mera";
import { ApiError } from "@/src/client/api";
import { bindGoalAccount, claimGift, countNow, loadGiftStatus, nameGoalAccount, withdrawEarned, type GiftStatus, type PublicOutcome } from "@/src/client/gift";
import { AccountPanel } from "./AccountPanel";
import { catchUpDay, deadlineInWords } from "@/src/catch-up";
import { DayRow } from "./DayRow";

/**
 * The recipient's whole journey on one screen: see the money in their name, open it with a passkey,
 * name their Duolingo once (or find it already named by the funder), then nothing: every day is read
 * from their public profile by an attested fetch and counted by itself (D27). Words a person
 * understands; no tab, no password, no app to install.
 */

type Busy = "idle" | "opening" | "naming" | "binding" | "counting" | "taking";

/**
 * What the person reads when something fails: our own sentences (server refusals, account guidance, the
 * page's own checks) verbatim, anything else (a library error, a network stack trace) as one plain line,
 * so no technical word ever reaches the screen.
 */
function screenMessage(error: unknown): string {
  // `detail` arrives only for one of our own accounts, and only when a refusal had no name to give.
  if (error instanceof ApiError) return error.detail ? `${error.message} (${error.detail})` : error.message;
  if (error instanceof ScreenError) return error.message;
  return "Something went wrong. Nothing was changed. Please try again.";
}

class ScreenError extends Error {}

/** Why nothing happened, in the person's own situation. "Nothing to do right now" tells them nothing. */
const NOTHING_TO_DO: Record<string, string> = {
  counted_today: "Viky already read your Duolingo today. Come back tomorrow.",
  not_bound: "Connect your Duolingo first.",
  not_opened: "Open the gift first.",
  no_account: "Add your Duolingo name first.",
  already_bound: "Your Duolingo is already connected. Nothing else to do.",
  finished: "This gift is finished.",
  cancelled: "This gift was taken back before it was opened.",
};

/**
 * What the person reads after an attested reading. `codeWasUsed` matters: when the person who sent the
 * gift named the Duolingo account, no code was ever placed in a display name, so telling them to take it
 * out is nonsense.
 */
function outcomeMessage(outcome: PublicOutcome, codeWasUsed: boolean, whenCounted: (days: number) => string): string {
  switch (outcome.kind) {
    case "bound":
      return codeWasUsed
        ? "Done. From tomorrow, every day with your lesson is yours, counted by itself. You can take the code out of your name now."
        : "Done. From tomorrow, every day with your lesson is yours, counted by itself. Nothing else to do.";
    case "counted":
      return whenCounted(outcome.creditedDays);
    case "already":
      return NOTHING_TO_DO[outcome.reason] ?? "Nothing to do right now.";
    case "refused":
      return outcome.message;
  }
}

export function GiftPage({ giftId, linkKey }: { giftId: string; linkKey: string | null }) {
  const { address, status: accountStatus } = useAccount();
  const [gift, setGift] = useState<GiftStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typedUsername, setTypedUsername] = useState("");
  // A name that does not resolve must not trap the person on the code step for ever: the server accepts
  // a new one for as long as nothing is bound, so the screen has to offer it.
  const [renaming, setRenaming] = useState(false);
  // The catch-up deadline is a moment, so the screen has to know the time. Kept in state and stepped once a
  // minute rather than read during a render, and it lets the words change as the deadline comes closer.
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const timer = setInterval(tick, 60_000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);
  const token = linkKey;

  const reload = useCallback(
    () =>
      loadGiftStatus(giftId).then(
        (status) => {
          setGift(status);
          setLoadError(null);
        },
        (error: unknown) => setLoadError(error instanceof ApiError ? error.message : "This gift could not be found."),
      ),
    [giftId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (kind: Busy, action: () => Promise<string | null>) => {
    setBusy(kind);
    setProblem(null);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      await reload();
    } catch (error) {
      setProblem(screenMessage(error));
    } finally {
      setBusy("idle");
    }
  };

  const open = () =>
    run("opening", async () => {
      if (!token) throw new ScreenError("This link is missing its key. Ask for the link again.");
      await claimGift(giftId, token);
      return "It is yours.";
    });

  // The recipient names their Duolingo; a code comes back to put in the display name for a minute.
  const name = () =>
    run("naming", async () => {
      const username = typedUsername.trim();
      if (!username) throw new ScreenError("Enter your Duolingo username");
      await nameGoalAccount(giftId, username);
      // A fresh code was issued for the new name, so the code step takes over again.
      setRenaming(false);
      setTypedUsername("");
      return null;
    });

  // A code exists only when the recipient named the account themselves. When the sender named it, there
  // was never anything to put in a display name, and nothing to take out of one afterwards.
  const codeWasUsed = () => gift?.goalAccount.source === "recipient";

  // The first attested read: proves the code is in the name (when the recipient named the account) and starts the count.
  const bind = () =>
    run("binding", async () => outcomeMessage(await bindGoalAccount(giftId), codeWasUsed(), () => "Counting."));

  const count = () =>
    run("counting", async () =>
      outcomeMessage(await countNow(giftId), codeWasUsed(), (days) =>
        days === 0 ? "Read. Nothing new to count yet." : days === 1 ? "One more day is yours." : `${days} more days are yours.`,
      ),
    );

  const take = () =>
    run("taking", async () => {
      const account = mera.currentAccount();
      if (!account || !gift) throw new ScreenError("Sign in first.");
      await withdrawEarned({ account, giftId, escrow: gift.escrow, amount: BigInt(gift.earned), nonce: BigInt(gift.withdrawNonce) });
      return `${gift.earnedDisplay} is now in your account. From the home page you can send it to your card or bank.`;
    });

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Viky</h1>
        <p>{loadError}</p>
      </main>
    );
  }
  if (!gift) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <p style={{ color: "var(--muted)" }}>One moment</p>
      </main>
    );
  }

  const signedIn = Boolean(address);
  const working = busy !== "idle" || accountStatus === "busy";
  const account = gift.goalAccount;
  // Everything below used to speak to the recipient whoever was reading. A funder signed in on their own
  // gift was shown "is in your name" and offered a "take it" the contract refuses, with no way to tell from
  // the screen which of the two accounts they were in.
  const mine = gift.youAreTheRecipient;
  const theirs = signedIn && !mine;
  // The day that is neither counted nor lost. Without naming it, the third day of a window reads
  // "1 of 7 done, 0 missed" and looks broken (D50).
  const catchUp = nowMs === 0 ? undefined : catchUpDay(gift, gift.catchUpSeconds, nowMs);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Viky
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {theirs ? `You put ${gift.amountDisplay} in their name.` : `${gift.amountDisplay} is in your name.`}
        </h1>
        <p className="text-lg leading-snug">
          {theirs
            ? `It becomes theirs as they go: ${gift.perDayDisplay} for each day with their lesson, for ${gift.durationDays} days.`
            : `Someone put it there for your Duolingo. It becomes yours as you go: ${gift.perDayDisplay} for each day with your lesson, for ${gift.durationDays} days.`}
        </p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {theirs
            ? `${gift.perDayDisplay} comes back to you for each day without it. Nobody else ever profits from a missed day.`
            : `${gift.perDayDisplay} goes back to them for each day without it. Nobody else ever profits from a missed day.`}
        </p>
      </header>

      <DayRow
        gift={gift}
        catchUpSeconds={gift.catchUpSeconds}
        nowMs={nowMs}
        readerIsRecipient={mine}
        earnedDisplay={gift.alreadyTheirsDisplay}
        returnedDisplay={gift.returnedDisplay}
      />

      {gift.cancelled ? <p>This gift was taken back before it was opened.</p> : null}

      {!gift.cancelled && !signedIn ? (
        <section className="space-y-3">
          <p className="font-medium">{gift.opened ? "Sign in to see your gift." : "Create your account to open it. Nothing to install."}</p>
          <AccountPanel />
        </section>
      ) : null}

      {theirs && gift.opened ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          This gift is being earned by the person you sent it to. There is nothing for you to do: what they
          earn is theirs, and what they miss comes back to you by itself.
        </p>
      ) : null}

      {!gift.cancelled && signedIn && !gift.opened ? (
        <button type="button" onClick={open} disabled={working || !token} className={PRIMARY_BUTTON}>
          {busy === "opening" ? "Opening" : "Open my gift"}
        </button>
      ) : null}

      {!gift.cancelled && mine && !account.bound && account.source === "funder" && account.username ? (
        <section className={CARD}>
          <p className="font-medium">Your Duolingo: {account.username}</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Named by the person who sent this. Nothing to sign in to, nothing to install: your lessons are read from your public profile.
          </p>
          <button type="button" onClick={bind} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "binding" ? "Reading your profile" : "Start counting"}
          </button>
        </section>
      ) : null}

      {!gift.cancelled && mine && !account.bound && account.source !== "funder" && (!account.code || renaming) ? (
        <section className={CARD}>
          <label className="block text-sm font-medium" htmlFor="duolingo-username">
            Your Duolingo username
          </label>
          <input
            id="duolingo-username"
            value={typedUsername}
            onChange={(event) => setTypedUsername(event.target.value)}
            className={FIELD}
            placeholder="ama_learns"
            disabled={working}
          />
          <button type="button" onClick={name} disabled={working || typedUsername.trim().length === 0} className={PRIMARY_BUTTON}>
            {busy === "naming" ? "One moment" : "Continue"}
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No password, no sign-in: your lessons are read from your public profile. Next, a short code proves the profile is yours.
          </p>
          {renaming ? (
            <button type="button" onClick={() => setRenaming(false)} className={SECONDARY_BUTTON}>
              Keep the name I had
            </button>
          ) : null}
        </section>
      ) : null}

      {!gift.cancelled && mine && !account.bound && account.source === "recipient" && account.code && !renaming ? (
        <section className={CARD}>
          <p className="font-medium">Prove {account.username} is yours</p>
          <p className="text-sm">
            In Duolingo, open Profile, then Settings, then Name, and add this code to your name for a minute:
          </p>
          <p className="text-center font-mono text-3xl tracking-widest">{account.code}</p>
          <button type="button" onClick={bind} disabled={working} className={PRIMARY_BUTTON}>
            {busy === "binding" ? "Reading your profile" : "I added it"}
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            You can remove the code right after.
          </p>
          <button type="button" onClick={() => setRenaming(true)} className={SECONDARY_BUTTON}>
            That is not my Duolingo name
          </button>
        </section>
      ) : null}

      {!gift.cancelled && mine && account.bound && !gift.finished ? (
        <section className={CARD}>
          <p className="font-medium">{gift.todayDayIndex === 0 ? "Counting starts tomorrow." : `Day ${gift.todayDayIndex} of ${gift.durationDays}. Counted by itself, every day.`}</p>
          {gift.todayDayIndex === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Everything you learn from now on already counts toward tomorrow, the first day.
            </p>
          ) : null}
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Do your lesson; nothing else. Each morning Viky reads your Duolingo ({account.username}) and counts the day before.
          </p>
          {catchUp ? (
            <p className="text-sm font-medium">
              {theirs
                ? `Yesterday is not counted yet, and not lost either: a lesson before ${deadlineInWords(catchUp.deadlineMs, nowMs)} still earns that day.`
                : `Yesterday is not counted yet, and not lost either. Do a lesson before ${deadlineInWords(catchUp.deadlineMs, nowMs)} and it still counts. Two lessons and you are back up to date.`}
            </p>
          ) : null}
          {gift.missedDays > 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {gift.returnedDisplay} has gone back so far, for {gift.missedDays} {gift.missedDays === 1 ? "day" : "days"} without a lesson. The days ahead are still yours to take.
            </p>
          ) : null}
          <button type="button" onClick={count} disabled={working || gift.todayDayIndex === 0} className={SECONDARY_BUTTON}>
            {busy === "counting" ? "Reading your profile" : "Count now"}
          </button>
        </section>
      ) : null}

      {!gift.cancelled && signedIn && gift.finished ? (
        <section className="space-y-2 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <p className="font-medium">This gift is finished.</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {gift.creditedDays} of {gift.durationDays} days were yours, so {gift.alreadyTheirsDisplay} is yours to keep.
            {gift.missedDays > 0 ? ` The other ${gift.missedDays} went back to the person who sent it.` : ""}
          </p>
        </section>
      ) : null}

      {mine && BigInt(gift.earned) > 0n ? (
        <button type="button" onClick={take} disabled={working} className={SECONDARY_BUTTON}>
          {busy === "taking" ? "One moment" : `Take ${gift.earnedDisplay}`}
        </button>
      ) : null}

      {notice ? <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">{notice}</p> : null}
      {problem ? (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {problem}
        </p>
      ) : null}
    </main>
  );
}
