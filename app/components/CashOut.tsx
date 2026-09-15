"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { sendOwnMoney } from "@/src/client/gift";
import { readAusdBalance } from "@/src/client/onchain";
import { formatAusd, formatAusdExact } from "@/src/gift-reader";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";
import { amountToSend, exactAmountText } from "@/src/send-amount";
import { FIELD, HELP, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, STICKER, TITLE } from "./ui";

/**
 * What a gift earned, and what the person can do with it today: move all of it to another account of theirs, from
 * one signature, and nothing else.
 *
 * Nothing here promises a card or a bank. The card rail's own help centre, in an article published on 15 Sep, lists
 * France and the rest of the EEA among the places it pays out to no Visa and no Mastercard, which is where the
 * pilot's recipients are, and `ExitRouter` is neither deployed nor wired to it (D72).
 */

type Step = "look" | "toAccount" | "sentToAccount";

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Nothing was taken. Please try again.";
}

export function CashOut() {
  const { address } = useAccount();
  const [holding, setHolding] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("look");
  const [ownAccount, setOwnAccount] = useState("");
  // What leaves, typed to the last of the coin's six decimals. A payout service is ordered for a quantity and expects
  // that quantity to arrive, so sending a whole balance made every such order wrong (D75).
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setHolding(await readAusdBalance(address));
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  if (!address) return <AccountPanel />;

  // One signature and nothing else. Their account never calls a contract, which on Monad is not a nicety:
  // an account below the 10 MON reserve cannot call one at all (D53), and a recipient holds no MON.
  const sending = amountToSend(amount, holding ?? 0n);

  const sendToOwnAccount = async () => {
    setProblem(null);
    setNotice(null);
    const account = mera.currentAccount();
    if (!account || holding === null || !isAddress(ownAccount.trim()) || sending.units === undefined) return;
    const leaving = sending.units;
    try {
      await sendOwnMoney({ account, to: ownAccount.trim() as Hex, amount: leaving });
      setStep("sentToAccount");
      setNotice(`Sent. ${formatAusdExact(leaving)} is in your other account now.`);
      await refresh();
    } catch (error) {
      setProblem(readable(error));
    }
  };

  return (
    <div className="space-y-[var(--space-xl)]">
      <section className={STICKER.sun}>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Yours to take out
        </p>
        <p className={MONEY}>{holding === null ? "..." : formatAusd(holding)}</p>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Your money stays yours, and nothing about it expires.
        </p>
      </section>

      {step === "look" && holding !== null && holding > 0n ? (
        <button
          type="button"
          onClick={() => {
            // The field opens on the whole balance, in full, because that is the common case and because a figure
            // rounded to the cent would be the one thing the order must not carry (D75).
            setAmount(exactAmountText(holding));
            setStep("toAccount");
          }}
          className={SECONDARY_BUTTON}
        >
          Send it to another account of mine
        </button>
      ) : null}

      {step === "toAccount" || step === "sentToAccount" ? (
        <section className={STICKER.pink}>
          <h2 className={TITLE}>Send it to another account of yours</h2>
          <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
            Exactly what you type leaves your account, to the last of its six decimals, and nothing to pay: Viky
            covers what it costs to move. Sign in to your other account and open its &quot;For judges&quot; page to
            find its identifier.
          </p>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>How much leaves</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className={FIELD}
              disabled={step === "sentToAccount"}
            />
          </label>
          <p className={HELP}>Your account holds {holding === null ? "..." : formatAusdExact(holding)}.</p>
          <input
            value={ownAccount}
            onChange={(event) => setOwnAccount(event.target.value)}
            placeholder="Paste your other account's identifier"
            className={FIELD}
            disabled={step === "sentToAccount"}
          />
          {step === "toAccount" && amount.trim() !== "" && sending.refusal ? (
            <p role="alert" className={HELP}>
              {sending.refusal}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void sendToOwnAccount()}
            disabled={!isAddress(ownAccount.trim()) || sending.units === undefined || step === "sentToAccount"}
            className={PRIMARY_BUTTON}
          >
            {step === "sentToAccount" ? "Sent" : sending.units === undefined ? "Send it" : `Send ${formatAusdExact(sending.units)}`}
          </button>
          {step !== "sentToAccount" ? (
            <button type="button" onClick={() => setStep("look")} className={INLINE_BUTTON}>
              Not now
            </button>
          ) : null}
        </section>
      ) : null}

      {notice ? <p className="text-[length:var(--type-help)]">{notice}</p> : null}
      {problem ? (
        <p role="alert" className="rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)]">
          {problem}
        </p>
      ) : null}

      <SessionScope />
    </div>
  );
}
