"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import * as mera from "@/src/account/mera";
import { ApiError } from "@/src/client/api";
import { claimGift, loadGiftStatus, runCheckIn, withdrawEarned, type GiftStatus } from "@/src/client/gift";
import { AccountPanel } from "./AccountPanel";

/**
 * The recipient's whole journey on one screen: see the money in their name, open it with a passkey,
 * connect Duolingo, check in each day, take what is theirs. Words a person understands; the
 * verification tab is Reclaim's, the rest is here.
 */

type Busy = "idle" | "opening" | "connecting" | "checking" | "taking";

const USERNAME_KEY = (giftId: string) => `viky.duolingo.username.${giftId}`;
const never = () => () => {};
const emptyName = () => "";

function readStoredUsername(giftId: string): string {
  try {
    return window.localStorage.getItem(USERNAME_KEY(giftId)) ?? "";
  } catch {
    return "";
  }
}

function openInNewTab(): (url: string) => void {
  // Opened synchronously in the click so browsers do not block it; the address is set once known.
  const tab = window.open("", "_blank");
  return (url: string) => {
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
  };
}

export function GiftPage({ giftId, linkKey }: { giftId: string; linkKey: string | null }) {
  const { address, status: accountStatus } = useAccount();
  const [gift, setGift] = useState<GiftStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The Duolingo username typed on this device is remembered for the daily check-ins.
  const storedUsername = useSyncExternalStore(never, () => readStoredUsername(giftId), emptyName);
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const username = typedUsername ?? storedUsername;
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
      setProblem(error instanceof Error ? error.message : "Something went wrong. Nothing was changed.");
    } finally {
      setBusy("idle");
    }
  };

  const open = () =>
    run("opening", async () => {
      if (!token) throw new Error("This link is missing its key. Ask for the link again.");
      await claimGift(giftId, token);
      return "It is yours. Connect your Duolingo to start counting.";
    });

  const connect = () => {
    const openUrl = openInNewTab();
    return run("connecting", async () => {
      const name = username.trim();
      if (!name) throw new Error("Enter your Duolingo username");
      try {
        window.localStorage.setItem(USERNAME_KEY(giftId), name);
      } catch {
        // storage unavailable
      }
      const outcome = await runCheckIn({ giftId, phase: "baseline", dayIndex: 0, username: name, openUrl });
      if (outcome.refusal) return outcome.refusal.message;
      return "Connected. From tomorrow, every day with your lesson is yours.";
    });
  };

  const checkIn = () => {
    const openUrl = openInNewTab();
    return run("checking", async () => {
      if (!gift) return null;
      const outcome = await runCheckIn({ giftId, phase: "check-in", dayIndex: gift.todayDayIndex, username: username.trim(), openUrl });
      if (outcome.refusal) return outcome.refusal.message;
      const days = outcome.relayed?.creditedDays ?? 0;
      return days === 0 ? "Recorded." : days === 1 ? "Today is yours." : `${days} days are yours.`;
    });
  };

  const take = () =>
    run("taking", async () => {
      const account = mera.currentAccount();
      if (!account || !gift) throw new Error("Sign in first.");
      await withdrawEarned({ account, giftId, amount: BigInt(gift.earned), nonce: BigInt(gift.withdrawNonce) });
      return `${gift.earnedDisplay} is now in your account.`;
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Viky
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{gift.amountDisplay} is in your name.</h1>
        <p className="text-lg leading-snug">
          Someone put it there for your Duolingo. It becomes yours as you go: {gift.perDayDisplay} for each day with your lesson,
          for {gift.durationDays} days.
        </p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {gift.perDayDisplay} goes back to them for each day without it. Nobody else ever profits from a missed day.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Yours so far
          </p>
          <p className="text-2xl font-semibold">{gift.alreadyTheirsDisplay}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Went back
          </p>
          <p className="text-2xl font-semibold">{gift.returnedDisplay}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Days done
          </p>
          <p className="text-xl">
            {gift.creditedDays} of {gift.durationDays}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Days missed
          </p>
          <p className="text-xl">{gift.missedDays}</p>
        </div>
      </section>

      {gift.cancelled ? <p>This gift was taken back before it was opened.</p> : null}

      {!gift.cancelled && !signedIn ? (
        <section className="space-y-3">
          <p className="font-medium">{gift.opened ? "Sign in to see your gift." : "Create your account to open it. Nothing to install."}</p>
          <AccountPanel />
        </section>
      ) : null}

      {!gift.cancelled && signedIn && !gift.opened ? (
        <button type="button" onClick={open} disabled={working || !token} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">
          {busy === "opening" ? "Opening" : "Open my gift"}
        </button>
      ) : null}

      {!gift.cancelled && signedIn && gift.opened && !gift.connected ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <label className="block text-sm font-medium" htmlFor="duolingo-username">
            Your Duolingo username
          </label>
          <input
            id="duolingo-username"
            value={username}
            onChange={(event) => setTypedUsername(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
            placeholder="ama_learns"
            disabled={working}
          />
          <button type="button" onClick={connect} disabled={working || username.trim().length === 0} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">
            {busy === "connecting" ? "Waiting for Duolingo" : "Connect Duolingo"}
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            A verification tab opens. Sign in to Duolingo there; it checks your progress and closes. Two to thirty seconds.
          </p>
        </section>
      ) : null}

      {!gift.cancelled && signedIn && gift.connected && !gift.finished ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <p className="font-medium">{gift.todayDayIndex === 0 ? "Counting starts tomorrow." : `Day ${gift.todayDayIndex}: check in after your lesson.`}</p>
          <button type="button" onClick={checkIn} disabled={working || gift.todayDayIndex === 0} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">
            {busy === "checking" ? "Waiting for Duolingo" : "Check in today"}
          </button>
        </section>
      ) : null}

      {signedIn && gift.opened && BigInt(gift.earned) > 0n ? (
        <button type="button" onClick={take} disabled={working} className="w-full rounded-lg border px-4 py-3 font-medium disabled:opacity-50">
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
