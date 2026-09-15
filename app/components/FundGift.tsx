"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import Link from "next/link";
import { ACTION_BAR, BACK_LINK, BODY, CARD, FIELD, HELP, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, TITLE } from "./ui";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { createGift, type CreatedGift } from "@/src/client/gift";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { nextFundingStep } from "@/src/funding-step";
import { AmountError, dollarsToUnits } from "@/src/money";
import { WAY_IN } from "@/src/rails";
import { payoutFloorInWords } from "@/src/gift-amount";
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

/**
 * The three questions, asked one screen at a time, because a form that follows the guidelines gets 78 % of
 * its submissions right the first time against 42 % for one that does not, and the largest single guideline
 * behind that number is one column with one thing per row (NN/g, Seckler et al.). The amount, the daily
 * target and the length used to sit side by side in a three-column grid, which at 320 pixels is three
 * cramped boxes and at any width interrupts the way down the form.
 *
 * They are three screens rather than three sections because the last one is a check: GOV.UK asks for one
 * before a confirmation, and Baymard measures abandonment when a cost appears for the first time at payment.
 */
type Stage = "who" | "howMuch" | "check" | "account";

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof AmountError) return error.message;
  if (error instanceof Error && error.message && error.message.length < 160) return error.message;
  return "Something went wrong. Nothing was taken. Please try again.";
}

export function FundGift() {
  const { address } = useAccount();
  const [step, setStep] = useState<Step>("form");
  const [stage, setStage] = useState<Stage>("who");
  const [contact, setContact] = useState("");
  const [username, setUsername] = useState("");
  // The field is in dollars and D62 settles the suggestion in euros, 50, so this is the round dollar figure
  // beside it. What matters about it is measured: earned five days out of seven it still clears the smallest
  // payout the rail will take, which a 25 EUR gift does not.
  const [dollars, setDollars] = useState("50");
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
    // The account exists by the time this runs: the check screen sends somebody without one to make it
    // first. Stated rather than assumed, because the whole point of the change was that the two stages
    // before this need nobody.
    if (!address) {
      setStage("account");
      return;
    }
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
      <section className="space-y-[var(--space-lg)] rounded-[var(--radius-card)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-lg)]">
        <h2 className={TITLE}>It is in their name.</h2>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Whoever opens this link takes the gift, so send it only to {contact.trim() || "them"} and to nobody
          else. They open it, and the money becomes theirs day by day. Whatever they do not earn comes back to
          you by itself.
        </p>
        <p className="select-all break-all rounded-[var(--radius-control)] border border-[var(--divider)] p-[var(--space-md)] text-[length:var(--type-help)]">{created.claimUrl}</p>
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
        {problem ? <p className="text-[length:var(--type-help)] text-[var(--accent-text)]">{problem}</p> : null}
      </section>
    );
  }

  // What one day is worth, live, because it is the number that makes a gift feel like a gift rather than a
  // transfer. Computed from what they typed and never stored, so it cannot disagree with the amount.
  const perDay = (() => {
    try {
      const total = dollarsToUnits(dollars);
      const length = BigInt(Math.max(1, Number(days)));
      return total / length;
    } catch {
      return null;
    }
  })();

  if (step === "form" && stage === "account") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <button type="button" onClick={() => setStage("check")} className={BACK_LINK}>
          Back
        </button>
        <section className={CARD}>
          <h1 className={TITLE}>One account, and then you can pay</h1>
          <p className={HELP}>
            The money is held in your name until they earn it, so it needs somewhere of yours to be held. Your
            face or your fingerprint is the whole account: no password, no code by text, nothing to remember.
          </p>
        </section>
        <AccountPanel />
        <SessionScope />
      </div>
    );
  }

  if (step === "form" && stage === "who") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <Link href="/" className={BACK_LINK}>
          Back to my gifts
        </Link>
        <section className={CARD}>
          <h1 className={TITLE}>Who is it for, and for what</h1>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>Their email or phone</span>
            <input value={contact} onChange={(event) => setContact(event.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>Their Duolingo name, if you know it</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className={FIELD} />
          </label>
          <p className={HELP}>
            Naming it is the surest thing you can do: only that Duolingo can then earn this gift, whoever opens
            the link. Leave it empty and they name their own.
          </p>
        </section>
        <button
          type="button"
          onClick={() => setStage("howMuch")}
          disabled={contact.trim().length === 0}
          className={PRIMARY_BUTTON}
        >
          Continue
        </button>
        <SessionScope />
      </div>
    );
  }

  if (step === "form" && stage === "howMuch") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <button type="button" onClick={() => setStage("who")} className={BACK_LINK}>
          Back
        </button>
        <section className={CARD}>
          <h1 className={TITLE}>How much, and for how long</h1>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>How much, in dollars</span>
            <input value={dollars} onChange={(event) => setDollars(event.target.value)} inputMode="decimal" className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>For how many days, seven at least</span>
            <input value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>XP a day to earn one day</span>
            <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="numeric" className={FIELD} />
          </label>
        </section>

        <section className={CARD}>
          <p className={HELP}>Each day they reach it, this becomes theirs</p>
          <p className={MONEY}>{perDay === null ? "..." : formatAusd(perDay)}</p>
          <p className={HELP}>And each day they miss, the same comes back to you.</p>
        </section>

        <div className={ACTION_BAR}>
          <button type="button" onClick={() => setStage("check")} disabled={!ready} className={PRIMARY_BUTTON}>
            Continue
          </button>
        </div>
        {problem ? <p className={BODY}>{problem}</p> : null}
        <SessionScope />
      </div>
    );
  }

  if (step === "form" && stage === "check") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <button type="button" onClick={() => setStage("howMuch")} className={BACK_LINK}>
          Back
        </button>
        <section className={CARD}>
          <h1 className={TITLE}>Check this over</h1>
          <dl className="flex flex-col gap-[var(--space-sm)]">
            <div className="flex items-baseline justify-between gap-[var(--space-md)]">
              <dt className={HELP}>In their name</dt>
              <dd className={BODY}>{(() => { try { return formatAusd(dollarsToUnits(dollars)); } catch { return "..."; } })()}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-[var(--space-md)]">
              <dt className={HELP}>Theirs for each day earned</dt>
              <dd className={BODY}>{perDay === null ? "..." : formatAusd(perDay)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-[var(--space-md)]">
              <dt className={HELP}>Over</dt>
              <dd className={BODY}>{days} days, {target} XP a day</dd>
            </div>
            <div className="flex items-baseline justify-between gap-[var(--space-md)]">
              <dt className={HELP}>First day counted</dt>
              <dd className={BODY}>the day after they connect Duolingo</dd>
            </div>
          </dl>
          <p className={HELP}>
            A day they miss comes back to you by itself, the morning after. Nothing of this is kept by anyone if
            they stop.
          </p>
        </section>

        <section className={CARD}>
          <h2 className={TITLE}>What they can do with it</h2>
          <p className={HELP}>
            What they earn is theirs straight away. To send it to their card they need {payoutFloorInWords()},
            and earnings add up from one gift to the next, so a small gift is waiting rather than gone.
          </p>
        </section>

        {!enough ? (
          <section className={CARD}>
            <h2 className={TITLE}>Paying for it</h2>
            <p className={HELP}>
              You do not have enough in your account yet, so the next step opens {WAY_IN.name} to pay by card.
              The smallest payment they take is {WAY_IN.smallest}, they keep {WAY_IN.fee} of what you pay, and
              they check who you are the first time, once. Whatever is left over stays in your account for the
              next gift.
            </p>
            <p className={HELP}>
              Their page opens on something else by default, so you will set it yourself: Buy, pay in EUR,
              receive MON, on the Monad network. The next screen walks you through it.
            </p>
          </section>
        ) : null}

        <div className={ACTION_BAR}>
          {address ? (
            <button type="button" onClick={() => void start()} disabled={!ready} className={PRIMARY_BUTTON}>
              {enough ? "Put it in their name" : "Add money and give"}
            </button>
          ) : (
            <button type="button" onClick={() => setStage("account")} disabled={!ready} className={PRIMARY_BUTTON}>
              Continue
            </button>
          )}
        </div>
        {notice ? <p className={BODY}>{notice}</p> : null}
        {problem ? <p className={BODY}>{problem}</p> : null}
        <SessionScope />
      </div>
    );
  }

  // Waiting for the card payment, then converting, then giving. One screen, because it is one wait.
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <section className={CARD}>
        <h1 className={TITLE}>Your money</h1>
        <p className={MONEY}>{balance === null ? "..." : formatAusd(balance)}</p>
        {step === "waiting" ? (
          <div className="flex flex-col gap-[var(--space-md)]">
            <p className="font-medium">Waiting for your payment. Keep this page open.</p>
            <p className={HELP}>
              {WAY_IN.name}&apos;s page opens on something else by default, so set each of these yourself:
            </p>
            <ol className={`list-decimal pl-[var(--space-lg)] ${HELP}`}>
              <li>Choose Buy, not sell.</li>
              <li>Pay in EUR, and type how much.</li>
              <li>Choose to receive MON.</li>
              <li>Choose the Monad network.</li>
              <li>Paste your identifier where they ask where to send it.</li>
            </ol>
            <div className="rounded-[var(--radius-control)] border border-[var(--divider)] p-[var(--space-md)]">
              <p className={HELP}>Before you pay, check what you pasted starts and ends like this:</p>
              <p className="text-[length:var(--type-body)] tabular-nums">
                {address!.slice(0, 6)}
                <span className="text-[var(--muted)]"> ... </span>
                {address!.slice(-4)}
              </p>
            </div>
            {copied ? <p className={HELP}>Copied and ready to paste.</p> : null}
            {pending !== null && pending > 0n ? <p className={HELP}>Something arrived and is being made ready.</p> : null}
            <div className="flex flex-wrap gap-[var(--tap-gap)]">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(address!).then(() => setCopied(true)).catch(() => setCopied(false))}
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
        {step === "converting" || step === "giving" ? (
          <p className={BODY}>{step === "giving" ? "Putting it in their name" : "Getting it ready"}</p>
        ) : null}
        {notice ? <p className={BODY}>{notice}</p> : null}
        {problem ? <p className={BODY}>{problem}</p> : null}
      </section>

      <SessionScope />
    </div>
  );
}
