"use client";
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "@/src/client/exit";
import { sendOwnMoney } from "@/src/client/gift";
import { readCoinBalance, sendMon } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, exactly, isNative, movesOnASignature, type Coin } from "@/src/coins";
import { formatAusd } from "@/src/gift-reader";
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
 * Each says where it pays and where that was read, and nobody is asked where they live: a list of countries frozen
 * into Viky would be wrong within weeks, and a wrong sentence about somebody's money is what this refuses above all.
 *
 * An account can hold three different things once the way out exists, so every one of them is read and every one can
 * be sent. Two of them move on a signature Viky relays and pays for. The third is the network's own coin, which
 * nobody can move on somebody else's behalf, so the person sends that themselves and the fee comes out of it. That
 * difference is said on the screen rather than smoothed over, because "nothing to pay" is not true of all three.
 */

type Step = "look" | "change" | "send" | "sent";

/**
 * What went wrong, in words that are true of this screen.
 *
 * On a screen about money nothing may arrive as a shrug. The first real attempt at the way out failed with the
 * generic catch-all, which told the funder neither what had happened nor whether their money had moved; the
 * cause was a table that had never been migrated, three steps away from anything they did (D80). That exact
 * wording is asserted absent from this file by test/screen-claims.test.ts, which is why it is not quoted here
 * even to explain itself. So a session that has closed says so and offers the way back, a refusal the contract named
 * keeps its name, and everything left over still says the one thing that is always true here: nothing was
 * taken. The router holds nothing between transactions, so that sentence is not reassurance, it is the design.
 */
function readable(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NOT_CONFIGURED") return "Viky cannot pay this out yet. Nothing was taken, and your money is where it was.";
    if (error.code === "FAILED") return "Viky could not finish this, and nothing was taken. Your money is where it was. Please try again in a moment.";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Viky could not finish this, and nothing was taken. Your money is where it was.";
}

/** A session that closed while they were away is not a failure to report, it is a door to reopen (D74). */
function sessionClosed(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SIGN_IN_REQUIRED";
}

export function CashOut() {
  const { address } = useAccount();
  const [holdings, setHoldings] = useState<Record<string, bigint> | null>(null);
  const [step, setStep] = useState<Step>("look");
  const [chosen, setChosen] = useState<WayOut | null>(null);
  const [changeAmount, setChangeAmount] = useState("");
  const [quote, setQuote] = useState<WayOutQuote | null>(null);
  const [changed, setChanged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendCoin, setSendCoin] = useState<Coin>(AUSD);
  const [ownAccount, setOwnAccount] = useState("");
  // What leaves, typed to the last decimal the coin has. A payout service is ordered for a quantity and expects that
  // quantity to arrive, so sending a whole balance made every such order wrong (D75).
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when the passkey session closed under the screen. Kept separately from `problem` because it is not a
  // failure of anything: the amount they typed and the quote they read are still good, and what they need is
  // the way back in rather than an apology (D74, D80).
  const [closed, setClosed] = useState(false);
  // Where the payout service asks the money to be sent, pasted by the person, and whether their own identifier has
  // just been copied. The service asks where the money comes from before it says where to send it, and the first
  // real exit found this screen had no answer to give: the funder had to find the identifier somewhere else.
  const [depositTo, setDepositTo] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    const read = await Promise.all(COINS.map((coin) => readCoinBalance(coin, address)));
    setHoldings(Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]])));
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  // The session closes itself after ten quiet minutes, and placing an order with a payout service takes longer
  // than that. So it closing is an expected part of this journey, not an error in it: the screen says what
  // happened, says plainly that nothing moved, and asks for the one thing it needs (D74, D80). It used to
  // replace the whole screen with a bare sign-in form, losing the amount they had typed and the quote they had
  // read, and saying nothing about either.
  if (!address || closed) {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <section className={STICKER.lilac}>
          <h1 className={TITLE}>{closed ? "Your session closed while you were away" : "Sign in to see your money"}</h1>
          {closed ? (
            <>
              <p className="text-[length:var(--type-body)]">
                Nothing moved and nothing was taken. Your money is exactly where it was, and nothing about it
                expires.
              </p>
              <p className={HELP}>
                Sessions close on their own after {mera.SESSION_IDLE_MINUTES} quiet minutes. Placing an order
                with a payout service takes longer than that, so this is normal rather than something going
                wrong. Sign in again and pick up where you stopped.
              </p>
            </>
          ) : null}
        </section>
        {/* Signing in leads, and making an account follows. The other way round, somebody coming back to their
            own money makes a second account and their money stays on the first (D74). */}
        <AccountPanel returning={closed} />
      </div>
    );
  }

  const held = (coin: Coin): bigint | null => (holdings ? (holdings[coin.symbol] ?? 0n) : null);
  const gift = held(AUSD);
  // Only what they actually have. A chooser offering coins nobody holds is noise on the one screen that should be
  // plainest, and after a change there is usually exactly one thing worth sending.
  const holdable = COINS.filter((coin) => (held(coin) ?? 0n) > 0n);

  // One signature and nothing else, for the coins that allow it. Their account never calls a contract, which on
  // Monad is not a nicety: an account below the 10 MON reserve cannot call one at all (D53).
  const sending = amountToSend(amount, held(sendCoin) ?? 0n, sendCoin);
  const changing = amountToSend(changeAmount, gift ?? 0n, AUSD);

  const pick = (way: WayOut) => {
    setChosen(way);
    setQuote(null);
    setChanged(null);
    setProblem(null);
    setNotice(null);
    setChangeAmount(exactAmountText(gift ?? 0n, AUSD));
    setStep("change");
  };

  const openSend = (coin: Coin) => {
    setSendCoin(coin);
    // The field opens on the whole balance, in full, because that is the common case and because a figure rounded to
    // the cent would be the one thing an order must not carry (D75).
    setAmount(exactAmountText(held(coin) ?? 0n, coin));
    setProblem(null);
    setNotice(null);
    setStep("send");
  };

  const askWhatItWouldGive = async () => {
    if (!chosen || changing.units === undefined) return;
    setBusy(true);
    setProblem(null);
    try {
      setQuote(await quoteWayOut({ amount: changing.units, coin: chosen.coin }));
    } catch (error) {
      if (sessionClosed(error)) setClosed(true);
      else setProblem(readable(error));
    } finally {
      setBusy(false);
    }
  };

  const changeIt = async () => {
    if (!quote) return;
    const account = mera.currentAccount();
    // A closed session used to leave this function silently, with the button doing nothing at all and the
    // screen saying nothing: worse than a wrong message, because there was nothing to read (D80).
    if (!account) {
      setClosed(true);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await takeTheWayOut({ account, ticket: quote.ticket });
      // What the exchange guaranteed, which is the least that arrived. The figure an order must be created for is
      // whatever actually landed, and that is read from the account, not promised here.
      setChanged(result.shown);
      setNotice(`Changed. At least ${result.shown} of ${quote.sells} is in your account now.`);
      await refresh();
    } catch (error) {
      if (sessionClosed(error)) setClosed(true);
      else setProblem(readable(error));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setProblem(null);
    setNotice(null);
    if (!isAddress(ownAccount.trim()) || sending.units === undefined) return;
    const account = mera.currentAccount();
    if (!account) {
      setClosed(true);
      return;
    }
    const leaving = sending.units;
    const to = ownAccount.trim() as Hex;
    setBusy(true);
    try {
      if (isNative(sendCoin)) {
        // Nobody can move the network's own coin for somebody else, so this is the person's own transaction and the
        // fee comes out of the same coin. Said afterwards with the figure, because it is their money that paid it.
        const { fee } = await sendMon(account, to, leaving);
        setNotice(`Sent. ${exactly(leaving, sendCoin)} is in the other account, and sending it cost ${exactly(fee, sendCoin)}.`);
      } else {
        await sendOwnMoney({ account, to, amount: leaving, coin: sendCoin });
        setNotice(`Sent. ${exactly(leaving, sendCoin)} is in the other account now.`);
      }
      setStep("sent");
      await refresh();
    } catch (error) {
      if (sessionClosed(error)) setClosed(true);
      else setProblem(readable(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-[var(--space-xl)]">
      <section className={STICKER.sun}>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]">Yours to take out</p>
        <p className={MONEY}>{gift === null ? "..." : formatAusd(gift)}</p>
        {/* What a gift holds is the headline. Anything the way out has already changed it into is shown under it, in
            its own coin: after a change the headline is smaller than what they own, and a screen that hid the rest
            would be telling somebody their money had gone. */}
        {holdings
          ? COINS.filter((coin) => coin !== AUSD && (held(coin) ?? 0n) > 0n).map((coin) => (
              <p key={coin.symbol} className={HELP}>
                Also in your account: {exactly(held(coin) ?? 0n, coin)}
              </p>
            ))
          : null}
        <p className="text-[length:var(--type-help)] text-[var(--muted)]">
          Your money stays yours, and nothing about it expires.
        </p>
      </section>

      {step === "look" && holdings !== null && holdable.length > 0 ? (
        <div className="space-y-[var(--space-lg)]">
          <h2 className={TITLE}>Ways to be paid</h2>
          {/* Each one says where it pays and where that was read, so nobody has to take Viky's word for a sentence
              about their own money. Neither is offered as "the" way out: which one fits is something the person
              knows and Viky does not ask (D77). */}
          {WAYS_OUT.map((way, index) => (
            <section key={way.name} className={index === 0 ? STICKER.pink : STICKER.lilac}>
              <h3 className={TITLE}>{way.name}</h3>
              <p className="text-[length:var(--type-body)]">{way.where}</p>
              {/* What it costs is measured and recorded in src/rails.ts, and deliberately not printed here:
                  nothing says a figure about fees until a real amount has actually gone through one of these
                  (the funder's instruction, 16 Sep). A fee sentence nobody has paid is a claim, not a fact. */}
              <dl className="space-y-[var(--space-xs)]">
                <div className="flex flex-wrap gap-[var(--space-xs)]">
                  <dt className={HELP}>What it buys:</dt>
                  <dd className={HELP}>{way.sells}</dd>
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
              <button type="button" onClick={() => pick(way)} disabled={(gift ?? 0n) === 0n} className={PRIMARY_BUTTON}>
                Use {way.name}
              </button>
            </section>
          ))}
          <p className={HELP}>
            If neither of these pays where you live, nothing is lost: your money stays yours and nothing about it
            expires. You can also move it to another account of your own.
          </p>
          <div className="flex flex-wrap gap-[var(--tap-gap)]">
            {holdable.map((coin) => (
              <button key={coin.symbol} type="button" onClick={() => openSend(coin)} className={SECONDARY_BUTTON}>
                {holdable.length === 1 ? "Send it to another account of mine" : `Send ${coin.symbol} to another account of mine`}
              </button>
            ))}
          </div>
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
          <p className={HELP}>Your account holds {gift === null ? "..." : exactly(gift, AUSD)}.</p>
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
                  {busy ? "Changing..." : `Change ${exactly(changing.units ?? 0n, AUSD)}`}
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
            <div className="space-y-[var(--space-md)]">
              <p className="text-[length:var(--type-body)]">
                Your money is changed and it is in your own account. Place your order with {chosen.name} for the
                amount you actually received.
              </p>
              {/* In the order the service asks for things. It wants to know where the money comes from before it
                  says where to send it, and on the first real exit this screen had nothing to offer at that step,
                  so the funder had to find their own identifier somewhere else (D82). Shown start and end for
                  checking, copied whole, exactly as the funding screen does it. */}
              <div className="rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] space-y-[var(--space-xs)]">
                <p className={HELP}>When {chosen.name} asks where you are sending from, give them your account&apos;s identifier:</p>
                <p className="text-[length:var(--type-body)] tabular-nums">
                  {address.slice(0, 6)}
                  <span className="text-[var(--muted)]"> ... </span>
                  {address.slice(-4)}
                </p>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied(true)).catch(() => setCopied(false))}
                  className={SECONDARY_BUTTON}
                >
                  Copy your identifier
                </button>
                {copied ? <p className={HELP}>Copied and ready to paste.</p> : null}
              </div>
              <label className="flex flex-col gap-[var(--space-xs)]">
                <span className={HELP}>Then paste the identifier {chosen.name} gives you to send to</span>
                <input
                  value={depositTo}
                  onChange={(event) => setDepositTo(event.target.value)}
                  placeholder="Paste the identifier they give you"
                  className={FIELD}
                />
              </label>
              <button
                type="button"
                disabled={!isAddress(depositTo.trim()) || !coinAt(chosen.coin)}
                onClick={() => {
                  const received = coinAt(chosen.coin);
                  if (!received) return;
                  // Into the send that already exists, with the destination they just pasted. The amount it opens on
                  // is what the account holds of that coin, written in full, which is what an order must carry.
                  setOwnAccount(depositTo.trim());
                  openSend(received);
                }}
                className={PRIMARY_BUTTON}
              >
                Send it to {chosen.name}
              </button>
              <button type="button" onClick={() => setStep("look")} className={INLINE_BUTTON}>
                Back
              </button>
            </div>
          )}
        </section>
      ) : null}

      {step === "send" || step === "sent" ? (
        <section className={STICKER.pink}>
          <h2 className={TITLE}>Send {sendCoin.symbol} to another account</h2>
          <p className="text-[length:var(--type-help)] text-[var(--muted)]">
            {movesOnASignature(sendCoin)
              ? "Exactly what you type leaves your account, to the last decimal, and nothing to pay: Viky covers what it costs to move."
              : `Exactly what you type leaves your account, to the last decimal. ${sendCoin.symbol} is the network's own coin, so nobody can send it for you: it goes from your own account and what it costs to send comes out of your ${sendCoin.symbol}.`}{" "}
            To reach another account of your own, sign in to it and open its &quot;For judges&quot; page to find its
            identifier.
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
          <p className={HELP}>Your account holds {held(sendCoin) === null ? "..." : exactly(held(sendCoin)!, sendCoin)}.</p>
          <input
            value={ownAccount}
            onChange={(event) => setOwnAccount(event.target.value)}
            placeholder="Paste the account's identifier"
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
            onClick={() => void send()}
            disabled={busy || !isAddress(ownAccount.trim()) || sending.units === undefined || step === "sent"}
            className={PRIMARY_BUTTON}
          >
            {step === "sent" ? "Sent" : sending.units === undefined ? "Send it" : `Send ${exactly(sending.units, sendCoin)}`}
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
