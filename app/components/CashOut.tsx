"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { sendOwnMoney } from "@/src/client/gift";
import { readAusdBalance } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";
import { CARD, FIELD, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

/**
 * What a gift earned, and what the person can do with it today.
 *
 * Paying out to a card is not here, and that is deliberate rather than unfinished: the only way we had asked
 * the person's own account to approve an exchange and then swap, two contract calls, and Monad refuses a
 * contract call from an account below its 10 MON reserve (D53). A recipient holds a gift and no MON, so that
 * screen could never have worked for anybody. It comes back through `ExitRouter`, where the relayer does the
 * calling and the person only signs.
 *
 * What is here works today and needs nothing of them: moving their own money, from one signature.
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
    <div className="space-y-6">
      <section className={CARD}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Yours to take out
        </p>
        <p className="text-3xl font-semibold">{holding === null ? "..." : formatAusd(holding)}</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Sending it to your card or your bank is coming. Your money stays yours in the meantime, and nothing
          about it expires.
        </p>
      </section>

      {step === "look" && holding !== null && holding > 0n ? (
        <button type="button" onClick={() => setStep("toAccount")} className={SECONDARY_BUTTON}>
          Send it to another account of mine
        </button>
      ) : null}

      {step === "toAccount" || step === "sentToAccount" ? (
        <section className={CARD}>
          <p className="font-medium">Send it to another account of yours</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Any amount, and nothing to pay: Viky covers what it costs to move. Useful for putting what you
            earned in one place before taking it out. Sign in to your other account and open its
            &quot;For judges&quot; page to find its identifier.
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

      {notice ? <p className="text-sm">{notice}</p> : null}
      {problem ? (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {problem}
        </p>
      ) : null}

      <SessionScope />
    </div>
  );
}
