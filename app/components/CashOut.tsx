"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "@/src/client/exit";
import { sendOwnMoney } from "@/src/client/gift";
import { readAusdBalance } from "@/src/client/onchain";
import { formatAusd, formatAusdExact } from "@/src/gift-reader";
import { WAYS_OUT, type WayOut } from "@/src/rails";
import { AccountPanel } from "./AccountPanel";
import { SessionScope } from "./SessionScope";
import { amountToSend, exactAmountText } from "@/src/send-amount";
import { FIELD, HELP, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, STICKER, TITLE } from "./ui";

/**
 * What a gift earned, and what the person can do with it.
 *
 * Two ways out are named here, not one, because no single payout service covers the people this is for: the euro one
 * refuses Senegal and Ivory Coast outright, and the card one pays nothing in France or the rest of the EEA (D77).
 * Each says where it pays, what it costs, and where that was read and when. Nobody is asked where they live: a list
 * of countries frozen into Viky would be wrong within weeks, and a wrong sentence about somebody's money is the thing
 * this refuses above all.
 */

type Step = "look" | "change" | "send" | "sent";

function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Nothing was taken. Please try again.";
}

export function CashOut() {
  const { address } = useAccount();
  const [holding, setHolding] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>("look");
  const [chosen, setChosen] = useState<WayOut | null>(null);
  const [changeAmount, setChangeAmount] = useState("");
  const [quote, setQuote] = useState<WayOutQuote | null>(null);
  const [changed, setChanged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const changing = amountToSend(changeAmount, holding ?? 0n);

  const pick = (way: WayOut) => {
    setChosen(way);
    setQuote(null);
    setChanged(null);
    setProblem(null);
    setNotice(null);
    setChangeAmount(exactAmountText(holding ?? 0n));
    setStep("change");
  };

  const askWhatItWouldGive = async () => {
    if (!chosen || changing.units === undefined) return;
    setBusy(true);
    setProblem(null);
    try {
      setQuote(await quoteWayOut({ amount: changing.units, coin: chosen.coin }));
    } catch (error) {
      setProblem(readable(error));
    } finally {
      setBusy(false);
    }
  };

  const changeIt = async () => {
    const account = mera.currentAccount();
    if (!account || !quote) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await takeTheWayOut({ account, ticket: quote.ticket });
      // What the exchange guaranteed, which is the least that arrived. The figure the order must be created for is
      // whatever actually landed, and the person reads that on the payout service's own page.
      setChanged(result.shown);
      setNotice(`Changed. At least ${result.shown} of ${quote.sells} is in your account now.`);
      await refresh();
    } catch (error) {
      setProblem(readable(error));
    } finally {
      setBusy(false);
    }
  };

  const sendToOwnAccount = async () => {
    setProblem(null);
    setNotice(null);
    const account = mera.currentAccount();
    if (!account || holding === null || !isAddress(ownAccount.trim()) || sending.units === undefined) return;
    const leaving = sending.units;
    try {
      await sendOwnMoney({ account, to: ownAccount.trim() as Hex, amount: leaving });
      setStep("sent");
      setNotice(`Sent. ${formatAusdExact(leaving)} is in your other account now.`);
      await refresh();
    } catch (error) {
      setProblem(readable(error));
    }
  };

  return (
    <div className="space-y-[var(--space-xl)]">
      <section className={STICKER.sun}>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]">Yours to take out</p>
        <p className={MONEY}>{holding === null ? "..." : formatAusd(holding)}</p>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]">
          Your money stays yours, and nothing about it expires.
        </p>
      </section>

      {step === "look" && holding !== null && holding > 0n ? (
        <div className="space-y-[var(--space-lg)]">
          <h2 className={TITLE}>Ways to be paid</h2>
          {/* Each one says where it pays and where that was read, so nobody has to take Viky's word for a sentence
              about their own money. Neither is offered as "the" way out: which one fits is something the person
              knows and Viky does not ask (D77). */}
          {WAYS_OUT.map((way, index) => (
            <section key={way.name} className={index === 0 ? STICKER.pink : STICKER.lilac}>
              <h3 className={TITLE}>{way.name}</h3>
              <p className="text-[length:var(--type-body)]">{way.where}</p>
              <dl className="space-y-[var(--space-xs)]">
                <div className="flex flex-wrap gap-[var(--space-xs)]">
                  <dt className={HELP}>What it buys:</dt>
                  <dd className={HELP}>{way.sells}</dd>
                </div>
                <div className="flex flex-wrap gap-[var(--space-xs)]">
                  <dt className={HELP}>What it costs:</dt>
                  <dd className={HELP}>{way.fee}</dd>
                </div>
              </dl>
              <ul className={`list-disc pl-[var(--space-lg)] ${HELP}`}>
                {way.conditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
              <p className={HELP}>
                Read from {way.source}, {way.read}.
              </p>
              <button type="button" onClick={() => pick(way)} className={PRIMARY_BUTTON}>
                Use {way.name}
              </button>
            </section>
          ))}
          <p className={HELP}>
            If neither of these pays where you live, nothing is lost: your money stays yours and nothing about it
            expires. You can also move it to another account of your own.
          </p>
          <button
            type="button"
            onClick={() => {
              // The field opens on the whole balance, in full, because that is the common case and because a figure
              // rounded to the cent would be the one thing an order must not carry (D75).
              setAmount(exactAmountText(holding));
              setStep("send");
            }}
            className={SECONDARY_BUTTON}
          >
            Send it to another account of mine
          </button>
        </div>
      ) : null}

      {/* Not mint: at night mint and the accent are the same lime, so a primary button on it disappears, and
          this panel's whole point is the button that changes the money. */}
      {step === "change" && chosen ? (
        <section className={STICKER.sun}>
          <h2 className={TITLE}>Change it for what {chosen.name} buys</h2>
          <p className="text-[length:var(--type-help)] text-[var(--muted)]">
            {chosen.name} buys {chosen.sells}, so this changes your money into that first. You choose how much, and
            what you get lands in your own account, not anywhere else.
          </p>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>How much to change</span>
            <input
              value={changeAmount}
              onChange={(event) => {
                setChangeAmount(event.target.value);
                setQuote(null);
              }}
              inputMode="decimal"
              className={FIELD}
              disabled={busy || changed !== null}
            />
          </label>
          <p className={HELP}>Your account holds {holding === null ? "..." : formatAusdExact(holding)}.</p>
          {changeAmount.trim() !== "" && changing.refusal ? (
            <p role="alert" className={HELP}>
              {changing.refusal}
            </p>
          ) : null}

          {quote ? (
            <div className="space-y-[var(--space-xs)]">
              <p className="text-[length:var(--type-body)]">
                You would get at least {quote.shown} of {quote.sells}.
              </p>
              {quote.payout ? (
                <p className={HELP}>
                  That is worth about {quote.payout.worth.toFixed(2)} {quote.payout.currency} today. {quote.name}{" "}
                  takes sales from {quote.payout.smallest.toFixed(2)} to {quote.payout.largest.toFixed(2)}{" "}
                  {quote.payout.currency}.
                </p>
              ) : null}
            </div>
          ) : null}

          {changed === null ? (
            <div className="flex flex-wrap gap-[var(--tap-gap)]">
              {quote === null ? (
                <button
                  type="button"
                  onClick={() => void askWhatItWouldGive()}
                  disabled={busy || changing.units === undefined}
                  className={PRIMARY_BUTTON}
                >
                  {busy ? "Asking..." : "See what you would get"}
                </button>
              ) : (
                <button type="button" onClick={() => void changeIt()} disabled={busy} className={PRIMARY_BUTTON}>
                  {busy ? "Changing..." : `Change ${formatAusdExact(changing.units ?? 0n)}`}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep("look");
                  setChosen(null);
                  setQuote(null);
                }}
                className={INLINE_BUTTON}
              >
                Not now
              </button>
            </div>
          ) : (
            // What is true after the change, and no more. The last step of the journey, sending the changed money to
            // the address the payout service gives you, has no path in Viky yet: what moves money here is tied to
            // what a gift holds, not to what the exchange handed back (D77). Saying so is the only honest thing:
            // implying the journey finishes would be a sentence about money that no code makes true.
            <div className="space-y-[var(--space-sm)]">
              <p className="text-[length:var(--type-body)]">
                Your money is changed and it is in your own account. Viky cannot yet send it on to {chosen.name}, so
                that last step is not available here today.
              </p>
              <button type="button" onClick={() => setStep("look")} className={INLINE_BUTTON}>
                Back
              </button>
            </div>
          )}
        </section>
      ) : null}

      {step === "send" || step === "sent" ? (
        <section className={STICKER.pink}>
          <h2 className={TITLE}>Send it to another account of yours</h2>
          <p className="text-[length:var(--type-help)] text-[var(--muted)]">
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
              disabled={step === "sent"}
            />
          </label>
          <p className={HELP}>Your account holds {holding === null ? "..." : formatAusdExact(holding)}.</p>
          <input
            value={ownAccount}
            onChange={(event) => setOwnAccount(event.target.value)}
            placeholder="Paste your other account's identifier"
            className={FIELD}
            disabled={step === "sent"}
          />
          {step === "send" && amount.trim() !== "" && sending.refusal ? (
            <p role="alert" className={HELP}>
              {sending.refusal}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void sendToOwnAccount()}
            disabled={!isAddress(ownAccount.trim()) || sending.units === undefined || step === "sent"}
            className={PRIMARY_BUTTON}
          >
            {step === "sent" ? "Sent" : sending.units === undefined ? "Send it" : `Send ${formatAusdExact(sending.units)}`}
          </button>
          {step !== "sent" ? (
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
