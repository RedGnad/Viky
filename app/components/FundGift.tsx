"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import { CARD, FIELD, INLINE_BUTTON, PRIMARY_BUTTON } from "./ui";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { createGift, type CreatedGift } from "@/src/client/gift";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { nextFundingStep } from "@/src/funding-step";
import { AmountError, dollarsToUnits } from "@/src/money";
import { WAY_IN } from "@/src/rails";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";

/**
 * The funder's screen. Someone puts money behind another person's goal, pays for it with a card, and
 * never sees what carries it. Which company takes the card is one object, `WAY_IN` (D42), so replacing it
 * changes nothing here. Today's rail ignores any parameter we could pass (D32), so the person's deposit
 * line is copied for them and its page is opened beside this one. While it stays open this screen watches for the money, turns it into what a gift
 * holds, and creates the gift, asking for a signature only when the open session has closed (D33).
 */

const POLL_MS = 8_000;

type Step = "form" | "waiting" | "converting" | "giving" | "done";

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof AmountError) return error.message;
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
  const [linkCopied, setLinkCopied] = useState(false);
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
        const next = nextFundingStep({ held, arriving, wanted: dollarsToUnits(dollars) });
        if (next.do === "give") {
          working.current = true;
          setStep("giving");
          setNotice("Your money is here. Putting it behind the goal.");
          await give();
          return;
        }
        if (next.do === "convert") {
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
            amount: next.amount.toString(),
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
    window.open(WAY_IN.page, "_blank", "noopener,noreferrer");
    setStep("waiting");
  };

  if (step === "done" && created) {
    return (
      <section className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <p className="text-lg font-medium">It is in their name.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Whoever opens this link takes the gift, so send it only to {contact.trim() || "them"} and to nobody
          else. They open it, and the money becomes theirs day by day. Whatever they do not earn comes back to
          you by itself.
        </p>
        <p className="select-all break-all rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">{created.claimUrl}</p>
        <button
          type="button"
          onClick={() => {
            // Some browsers refuse the copy silently. Say which of the two happened, never nothing.
            void navigator.clipboard
              .writeText(created.claimUrl)
              .then(() => {
                setLinkCopied(true);
                setProblem(null);
              })
              .catch(() => {
                setLinkCopied(false);
                setProblem("Your browser would not let us copy it. Press and hold the link above, then choose Copy.");
              });
          }}
          className={PRIMARY_BUTTON}
        >
          {linkCopied ? "Copied" : "Copy the link"}
        </button>
        {problem ? <p className="text-sm text-red-600">{problem}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {!enough ? (
        <section className={CARD}>
          <p className="font-medium">Before you start</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Paying by card is done by {WAY_IN.name}, and the smallest payment they take is {WAY_IN.smallest},
            whatever you decide to put behind the goal. Whatever is left over stays in your account, for the
            next goal. Nothing is lost.
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Their page opens on something else by default, so you will have to set it yourself: Buy, pay in
            EUR, receive MON, on the Monad network. The next screen walks you through it.
          </p>
        </section>
      ) : null}

      <section className={CARD}>
        <h2 className="font-medium">Who is it for, and for what</h2>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="Their email or phone"
          className={FIELD}
        />
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Their Duolingo name, if you know it"
          className={FIELD}
        />
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Naming it is the surest thing you can do: only that Duolingo can then earn this gift, whoever opens
          the link. Leave it empty and they name their own.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            How much
            <input
              value={dollars}
              onChange={(event) => setDollars(event.target.value)}
              inputMode="decimal"
              className={FIELD}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            XP a day
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              inputMode="numeric"
              className={FIELD}
            />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            For how many days
            <input
              value={days}
              onChange={(event) => setDays(event.target.value)}
              inputMode="numeric"
              className={FIELD}
            />
          </label>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Seven days at least. Each day they reach the target, that day&apos;s share becomes theirs. Each day they
          miss comes back to you.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-medium">Your money</h2>
        <p className="text-2xl font-semibold">{balance === null ? "..." : formatAusd(balance)}</p>
        {!enough ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            You do not have enough yet, so the next step opens {WAY_IN.name} to pay by card. They keep{" "}
            {WAY_IN.fee} of what you pay, and they check who you are the first time, once.
          </p>
        ) : null}
        {step === "waiting" ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">Waiting for your payment. Keep this page open.</p>
            <p style={{ color: "var(--muted)" }}>
              {WAY_IN.name}&apos;s page opens on something else by default, so set each of these yourself:
            </p>
            <ol className="list-decimal space-y-1 pl-5" style={{ color: "var(--muted)" }}>
              <li>Choose Buy, not sell.</li>
              <li>Pay in EUR, and type how much.</li>
              <li>Choose to receive MON.</li>
              <li>Choose the Monad network.</li>
              <li>Paste your identifier where they ask where to send it.</li>
            </ol>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <p style={{ color: "var(--muted)" }}>Before you pay, check what you pasted starts and ends like this:</p>
              <p className="font-mono text-base">
                {address.slice(0, 6)}
                <span style={{ color: "var(--muted)" }}> ... </span>
                {address.slice(-4)}
              </p>
            </div>
            {copied ? <p style={{ color: "var(--muted)" }}>Copied and ready to paste.</p> : null}
            {pending !== null && pending > 0n ? (
              <p style={{ color: "var(--muted)" }}>Something arrived and is being made ready.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false))}
                className={INLINE_BUTTON}
              >
                Copy my identifier again
              </button>
              <a href={WAY_IN.page} target="_blank" rel="noopener noreferrer" className={INLINE_BUTTON}>
                Open {WAY_IN.name} again
              </a>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void start()}
          disabled={!ready || step === "converting" || step === "giving"}
          className={PRIMARY_BUTTON}
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
