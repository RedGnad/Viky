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
import { FIELD, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, STICKER, TITLE } from "./ui";

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
  const sendToOwnAccount = async () => {
    setProblem(null);
    setNotice(null);
    const account = mera.currentAccount();
    if (!account || holding === null || !isAddress(ownAccount.trim())) return;
    try {
      await sendOwnMoney({ account, to: ownAccount.trim() as Hex, amount: holding });
      setStep("sentToAccount");
      setNotice("Sent. It is in your other account now.");
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
        <button type="button" onClick={() => setStep("toAccount")} className={SECONDARY_BUTTON}>
          Send it to another account of mine
        </button>
      ) : null}

      {step === "toAccount" || step === "sentToAccount" ? (
        <section className={STICKER.pink}>
          <h2 className={TITLE}>Send it to another account of yours</h2>
          <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
            {/* The whole balance leaves, to the last of its six decimals, so that is what is written (D72). */}
            All of it goes, {holding === null ? "..." : formatAusdExact(holding)} exactly, and nothing to pay: Viky
            covers what it costs to move. Useful for putting what you earned in one place. Sign in to your other
            account and open its &quot;For judges&quot; page to find its identifier.
          </p>
          <input
            value={ownAccount}
            onChange={(event) => setOwnAccount(event.target.value)}
            placeholder="Paste your other account's identifier"
            className={FIELD}
            disabled={step === "sentToAccount"}
          />
          <button
            type="button"
            onClick={() => void sendToOwnAccount()}
            disabled={!isAddress(ownAccount.trim()) || step === "sentToAccount"}
            className={PRIMARY_BUTTON}
          >
            {step === "sentToAccount" ? "Sent" : "Send it"}
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
