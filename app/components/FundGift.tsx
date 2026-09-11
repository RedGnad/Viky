"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { createGift, type CreatedGift } from "@/src/client/gift";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";

/**
 * The funder's screen. Someone puts money behind another person's goal, pays for it with a card, and
 * never sees what carries it. Card payments go through Mercuryo's consumer page (D32), which ignores
 * any parameter we could pass, so the person's deposit line is copied for them and the page is opened
 * beside this one. While it stays open this screen watches for the money, turns it into what a gift
 * holds, and creates the gift, asking for a signature only when the open session has closed (D33).
 */

// Mercuryo's own minimum purchase and fee, measured in D20. Shown before their page is opened, never after.
const MERCURYO_MINIMUM_EUR = 25;
const MERCURYO_FEE = "about 3.8%";
const MERCURYO_URL = "https://exchange.mercuryo.io";
// What stays behind to pay for the conversion itself. The gift is submitted by Viky's relayer, so
// nothing more is needed afterwards.
const CONVERSION_RESERVE_WEI = 200_000_000_000_000_000n;
// Below this, an arriving balance is dust rather than a card payment worth converting.
const ARRIVAL_FLOOR_WEI = 50_000_000_000_000_000n;
const POLL_MS = 8_000;

type Step = "form" | "waiting" | "converting" | "giving" | "done";

function dollarsToUnits(value: string): bigint {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter how much you want to put behind the goal");
  return BigInt(cents) * 10_000n;
}

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message && error.message.length < 160) return error.message;
  return "Something went wrong. Nothing was taken. Please try again.";
}

export function FundGift() {
  const { address } = useAccount();
  const [step, setStep] = useState<Step>("form");
  const [contact, setContact] = useState("");
  const [username, setUsername] = useState("");
  const [dollars, setDollars] = useState("20");
  const [target, setTarget] = useState("10");
  const [days, setDays] = useState("7");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState<bigint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedGift | null>(null);
  const [copied, setCopied] = useState(false);
  const working = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    const [held, arriving] = await Promise.all([readAusdBalance(address), readMonBalance(address)]);
    setBalance(held);
    setPending(arriving);
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  const give = useCallback(async () => {
    const account = mera.currentAccount();
    if (!account) throw new Error("Sign in first.");
    const result = await createGift({
      account,
      contact: contact.trim(),
      duolingoUsername: username.trim() || undefined,
      goalType: GOAL_TYPE_DUOLINGO_XP,
      dailyTarget: Number(target),
      durationDays: Number(days),
      amount: dollarsToUnits(dollars),
    });
    setCreated(result);
    setStep("done");
    await refresh();
  }, [contact, username, target, days, dollars, refresh]);

  // While the payment page is open beside this one: watch for the money, convert it, then give.
  useEffect(() => {
    if (step !== "waiting" || !address) return;
    let live = true;
    const look = async () => {
      if (!live || working.current) return;
      try {
        await refresh();
        const [held, arriving] = await Promise.all([readAusdBalance(address), readMonBalance(address)]);
        const wanted = dollarsToUnits(dollars);
        if (held >= wanted) {
          working.current = true;
          setStep("giving");
          setNotice("Your money is here. Putting it behind the goal.");
          await give();
          return;
        }
        if (arriving > ARRIVAL_FLOOR_WEI + CONVERSION_RESERVE_WEI) {
          working.current = true;
          setStep("converting");
          setNotice("Your payment arrived. Getting it ready, a few seconds.");
          const account = mera.currentAccount();
          if (!account) {
            setStep("waiting");
            setProblem("Your session closed. Sign in again to finish.");
            working.current = false;
            return;
          }
          const quote = await postJson<{ to: `0x${string}`; data: `0x${string}`; value: string }>("/api/fund/quote", {
            amount: (arriving - CONVERSION_RESERVE_WEI).toString(),
          });
          await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
          await refresh();
          working.current = false;
          setStep("waiting");
          setNotice("Ready. Putting it behind the goal.");
          return;
        }
      } catch (error) {
        working.current = false;
        setProblem(readable(error));
        setStep("waiting");
      }
    };
    void look();
    const timer = setInterval(() => void look(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [step, address, dollars, refresh, give]);

  if (!address) {
    return (
      <div className="space-y-6">
        <AccountPanel />
      </div>
    );
  }

  const enough = (() => {
    try {
      return balance !== null && balance >= dollarsToUnits(dollars);
    } catch {
      return false;
    }
  })();

  const ready = contact.trim().length > 0 && Number(target) > 0 && Number(days) >= 7;

  const start = async () => {
    setProblem(null);
    setNotice(null);
    try {
      dollarsToUnits(dollars);
    } catch (error) {
      setProblem(readable(error));
      return;
    }
    if (enough) {
      setStep("giving");
      try {
        await give();
      } catch (error) {
        setProblem(readable(error));
        setStep("form");
      }
      return;
    }
    // Both the copy and the new page must happen inside the tap, or the browser blocks them.
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(MERCURYO_URL, "_blank", "noopener,noreferrer");
    setStep("waiting");
  };

  if (step === "done" && created) {
    return (
      <section className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <p className="text-lg font-medium">It is in their name.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Send them this link. They open it, connect their Duolingo once, and the money becomes theirs day by
          day. Whatever they do not earn comes back to you by itself.
        </p>
        <p className="break-all rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">{created.claimUrl}</p>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(created.claimUrl).then(() => setCopied(true))}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white"
        >
          Copy the link
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-medium">Who is it for, and for what</h2>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Their email or phone"
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
        />
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Their Duolingo name, if you know it"
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            How much
            <input
              value={dollars}
              onChange={(event) => setDollars(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-base dark:border-gray-700"
            />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            XP a day
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-base dark:border-gray-700"
            />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            For how many days
            <input
              value={days}
              onChange={(event) => setDays(event.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-base dark:border-gray-700"
            />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Seven days at least. Each day they reach the target, that day&apos;s share becomes theirs. Each day they
          miss comes back to you.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-medium">Your money</h2>
        <p className="text-2xl font-semibold">{balance === null ? "..." : formatAusd(balance)}</p>
        {!enough ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            You do not have enough yet. Paying by card is handled by Mercuryo on their own page: their smallest
            purchase is {MERCURYO_MINIMUM_EUR} EUR and they keep {MERCURYO_FEE} of it. You can put the rest behind
            another goal later.
          </p>
        ) : null}
        {step === "waiting" ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Waiting for your payment. Keep this page open.</p>
            <p style={{ color: "var(--muted)" }}>
              {copied
                ? "Your deposit line is copied. On Mercuryo's page choose Monad, paste it where they ask where to send, and pay with your card."
                : "On Mercuryo's page choose Monad, then come back here and tap Copy my deposit line."}
            </p>
            {pending !== null && pending > 0n ? (
              <p style={{ color: "var(--muted)" }}>Something arrived and is being made ready.</p>
            ) : null}
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false))}
              className="rounded-lg border px-3 py-2"
            >
              Copy my deposit line
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void start()}
          disabled={!ready || step === "converting" || step === "giving"}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {step === "giving" ? "Putting it in their name" : step === "converting" ? "Getting it ready" : enough ? "Put it in their name" : "Add money and give"}
        </button>
        {notice ? <p className="text-sm">{notice}</p> : null}
        {problem ? <p className="text-sm text-red-600">{problem}</p> : null}
      </section>

      <SessionScope />
    </div>
  );
}
