"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { sendOwnMoney } from "@/src/client/gift";
import { approveAusd, readAusdBalance, sendAllMon, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { WAY_OUT } from "@/src/rails";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";
import { CARD, FIELD, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

/**
 * The way out. What a gift earned lives in the person's own account; this turns it into money on their
 * card or in their bank. Which company pays it out is one object, `WAY_OUT` (D42), so replacing it changes
 * nothing here. Today's rail takes no parameters from us (D32), so the person is handed to its page and
 * comes back with the line it gives them. Its fees are stated before anything is done, because on a small
 * amount they eat most of it (D20).
 */

// Measured in D20: their quote refuses roughly below 4 dollars, and they keep a flat 3 EUR whatever the
// amount. The floor here sits above their refusal so nobody is sent to a page that will turn them away.
const SMALLEST_PAYOUT = 5_000_000n;
// Where their flat fee stops being a large bite. Three euros is under a tenth of thirty euros, and forty
// dollars is above thirty euros at any exchange rate worth planning for, so the figure shown is never
// more flattering than the truth. Stated so nobody hands a third of a small gift to a payout service
// without being told first.
const FEE_UNDER_A_TENTH = 40_000_000n;

type Step = "look" | "preparing" | "ready" | "sending" | "sent" | "toAccount" | "sentToAccount";

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Nothing was taken. Please try again.";
}

export function CashOut() {
  const { address } = useAccount();
  const [holding, setHolding] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("look");
  const [destination, setDestination] = useState("");
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

  const enough = holding !== null && holding >= SMALLEST_PAYOUT;

  const prepare = async () => {
    setProblem(null);
    setNotice(null);
    const account = mera.currentAccount();
    if (!account || holding === null) return;
    setStep("preparing");
    try {
      // Viky pays for the two steps this takes, as it pays for everything else the person does.
      await postJson("/api/exit/gas", {});
      const quote = await postJson<{ to: Hex; data: Hex; value: string }>("/api/exit/quote", { amount: holding.toString() });
      await approveAusd(account, quote.to, holding);
      await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
      await refresh();
      setStep("ready");
      setNotice("Your money is ready to be paid out.");
    } catch (error) {
      setProblem(readable(error));
      setStep("look");
    }
  };

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

  const send = async () => {
    setProblem(null);
    const account = mera.currentAccount();
    if (!account || !isAddress(destination.trim())) return;
    setStep("sending");
    try {
      await sendAllMon(account, destination.trim() as Hex);
      setStep("sent");
      setNotice(`Sent. ${WAY_OUT.name} pays it out to you from here.`);
    } catch (error) {
      setProblem(readable(error));
      setStep("ready");
    }
  };

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Yours to take out
        </p>
        <p className="text-3xl font-semibold">{holding === null ? "..." : formatAusd(holding)}</p>
        {!enough ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This is too small to pay out yet. It stays yours either way, and it grows with every day you do
            your lesson.
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Paying it out is done by {WAY_OUT.name} on their own page, and they keep {WAY_OUT.fee}.{" "}
            {holding !== null && holding >= FEE_UNDER_A_TENTH
              ? "At this size that is less than a tenth of what you get."
              : "Above about $40.00 that is less than a tenth of what you get; below it, they take a big bite. Nothing is lost by waiting: it stays yours until you ask for it."}
          </p>
        )}
      </section>

      {enough && step === "look" ? (
        <button type="button" onClick={() => void prepare()} className={PRIMARY_BUTTON}>
          Get it ready
        </button>
      ) : null}

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

      {step === "preparing" ? <p className="text-sm">Getting it ready. This takes a few seconds.</p> : null}

      {step === "ready" || step === "sending" || step === "sent" ? (
        <section className={CARD}>
          <p className="font-medium">Two steps, on {WAY_OUT.name}&apos;s page</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm" style={{ color: "var(--muted)" }}>
            <li>Open their page, say how much you want and where you want it, and they give you a line to copy.</li>
            <li>Come back, paste it below, and Viky sends your money to them.</li>
          </ol>
          <a href={WAY_OUT.page} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
            Open the payout page
          </a>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Paste what they asked you to copy"
            className={FIELD}
            disabled={step === "sending" || step === "sent"}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!isAddress(destination.trim()) || step === "sending" || step === "sent"}
            className={PRIMARY_BUTTON}
          >
            {step === "sending" ? "Sending" : step === "sent" ? "Sent" : "Send it to them"}
          </button>
          {step !== "sent" ? (
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
