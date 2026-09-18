"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress, isAddress, type Hex } from "viem";
import * as mera from "@/src/account/mera";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "@/src/client/exit";
import { sendOwnMoney } from "@/src/client/gift";
import { readCoinBalance, sendMon } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, exactly, isNative, USDC, type Coin } from "@/src/coins";
import { whenInWords } from "@/src/display-currency";
import { dollarsToChange, dustInWords, feeApplied, floorToOrder, readyFor, twoDecimalsDown, type Ready } from "@/src/exit-steps";
import { formatAusd } from "@/src/gift-reader";
import { whereTheRailsServe, type RailsWhere } from "@/src/client/rails";
import { countryInWords, orderWaysOut } from "@/src/rail-country";
import { feeSentence, WAYS_OUT, type WayOut } from "@/src/rails";
import { CASH_OUT as W } from "@/src/sentences";
import { AccountPanel } from "./AccountPanel";
import {BODY, CARD, FIELD, HELP, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE} from "./ui";

/**
 * The way out, rebuilt from docs/design/flows.md (states W1 to W13) on 17 Sep 2026.
 *
 * Three numbered steps on one card: get the money ready, place the order with the payout service, send it.
 * Which step is open is read from what the account holds and never from a flag in memory, so a reload lands
 * on the same step and a closed session loses nothing. The person only ever meets two-decimal numbers, cut down
 * and never rounded up, because the payout service is ordered for such a number (src/exit-steps.ts). Every
 * sentence is in src/sentences.ts, and every refusal is typed and sits under the element in cause.
 *
 * Nothing under this screen moves money in a new way: the quote, the prepare, the relay and the send are the
 * routes that carried the first real conversion of 16 Sep (D82).
 */

type Stage = "base" | "amount" | "review" | "getting" | "ready" | "confirm" | "sending" | "sent" | "own" | "ownConfirm" | "ownSending" | "ownSent";

/** Where a refusal is shown: under the element that caused it, never in a box at the bottom of the page. */
type Where = "amount" | "review" | "code" | "send" | "own";

type Sent = Readonly<{ number: string; name: string; when: string; reference: string; cost?: string }>;

/** A session that closed while they were away is not a failure to report, it is a door to reopen (D74, D80). */
function sessionClosed(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SIGN_IN_REQUIRED";
}

/**
 * What the person reads when a route refuses, branched on the typed code and never on the server's prose. On
 * a screen about money nothing may arrive as a shrug (D80): every branch below ends on what is always true here,
 * that nothing was taken, because the router holds nothing between transactions.
 */
function refusalText(error: unknown, way: WayOut | null): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NOT_CONFIGURED":
        return W.failures.notConfigured;
      case "RATE_MOVED":
        return W.failures.rateMoved;
      case "QUOTE_STALE":
        return W.failures.keptChanging;
      case "QUOTE_EXPIRED":
        return W.failures.expired;
      case "ALREADY_UNDER_WAY":
        return W.failures.underWay;
      case "REFUSED":
      case "FAILED":
        return way ? W.failures.notSent(way.name) : W.failures.other;
      case "NOT_ENOUGH":
      case "BELOW_PAYOUT_MINIMUM":
      case "ABOVE_PAYOUT_MAXIMUM":
      case "PAYOUT_SERVICE_SILENT":
      case "PAYOUT_ASSET_CLOSED":
      case "QUOTE_UNAVAILABLE":
      case "EXCHANGE_REFUSED":
      case "TOO_SLOW":
        // These carry the figures or the fact the route measured, so its sentence is the true one.
        return error.message;
      default:
        return W.failures.other;
    }
  }
  return W.failures.other;
}

export function CashOut() {
  const { address, signOut } = useAccount();
  useMoneySession();
  const money = useDisplayCurrency(address);
  const [holdings, setHoldings] = useState<Record<string, bigint> | null>(null);
  const [stage, setStage] = useState<Stage>("base");
  const [chosen, setChosen] = useState<WayOut | null>(null);
  const [dollars, setDollars] = useState("");
  const [quote, setQuote] = useState<WayOutQuote | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ where: Where; text: string; code?: string } | null>(null);
  // Set when the passkey session closed under the screen. Not a failure: what the account holds decides the
  // step, so signing in again lands exactly where they were (D74, D80).
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");
  const [deposit, setDeposit] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [ownCode, setOwnCode] = useState("");
  const [ownAmount, setOwnAmount] = useState("");
  // What the coin the card service buys is worth in dollars, asked of the price and never guessed: the same quote
  // the funder screen converts with. "unavailable" when nothing answered, and the screen says so (founder, 17 Sep).
  const [worth, setWorth] = useState<{ units: bigint } | "unavailable" | undefined>(undefined);
  // Where the rails serve, and the one answer the person may have given when the two signals disagreed (R1). Kept for
  // the tab: it orders cards and nothing else, so it is never worth asking twice in one sitting and never worth keeping.
  const [where, setWhere] = useState<RailsWhere | null>(null);
  const [answeredCountry, setAnsweredCountry] = useState<string | null>(null);
  const resumed = useRef(false);

  useEffect(() => {
    let live = true;
    whereTheRailsServe(answeredCountry)
      .then((answer) => {
        if (live) setWhere(answer);
      })
      .catch(() => {
        // Nothing read is nothing ordered: the register's own order stands, and both ways stay on the screen.
        if (live) setWhere(null);
      });
    return () => {
      live = false;
    };
  }, [answeredCountry]);

  const countryNow = answeredCountry ?? where?.country ?? null;
  const ordered = where && !where.ask ? orderWaysOut(WAYS_OUT, where.waysOut) : WAYS_OUT;

  const coinOf = (way: WayOut): Coin => coinAt(way.coin) ?? USDC;

  const refresh = useCallback(async () => {
    if (!address) return;
    const read = await Promise.all(COINS.map((coin) => readCoinBalance(coin, address)));
    const next = Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]]));
    setHoldings(next);
    // An account is back, so a session that had closed is closed no longer.
    setClosed(false);
    // The exact resume: a way out already holding something ready opens on its second step, from the balances
    // alone and only on the first read, so a person who chose "Not now" is not dragged back (flows W6, W11).
    if (!resumed.current) {
      resumed.current = true;
      const ready = WAYS_OUT.find((way) => readyFor(way, coinOf(way), next[coinOf(way).symbol] ?? 0n) !== undefined);
      if (ready) {
        setChosen(ready);
        setStage("ready");
      }
    }
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  const held = (coin: Coin): bigint => holdings?.[coin.symbol] ?? 0n;
  const ausd = held(AUSD);
  const dollarsHeld = ausd + held(USDC);
  const readyOf = (way: WayOut): Ready | undefined => (holdings ? readyFor(way, coinOf(way), held(coinOf(way))) : undefined);
  const firstReady = WAYS_OUT.find((way) => readyOf(way) !== undefined);

  const changing = dollarsToChange(dollars, ausd, W.refusals);
  const maxToChange = twoDecimalsDown(ausd, AUSD.decimals);

  // The card branch with nothing else in the account: the ready figure leads, and its worth is asked once.
  const cardOnly = holdings !== null && dollarsHeld === 0n && firstReady !== undefined && isNative(coinOf(firstReady)) ? readyOf(firstReady) : undefined;
  const cardOnlyUnits = cardOnly?.units;
  useEffect(() => {
    if (cardOnlyUnits === undefined) return;
    let live = true;
    postJson<{ output: string }>("/api/fund/quote", { amount: cardOnlyUnits.toString() })
      .then((quote) => {
        if (live) setWorth({ units: BigInt(quote.output) });
      })
      .catch(() => {
        if (live) setWorth("unavailable");
      });
    return () => {
      live = false;
    };
  }, [cardOnlyUnits]);

  /**
   * The server said the session is gone. The passkey side may still think it is open, and a panel reading that
   * side would say "You are signed in" under a title saying the opposite, which is exactly what the audit found on
   * this screen (its finding 13.1). So both sides are closed here, and only "Sign in" is offered (flows W11).
   */
  const closeSession = () => {
    setClosed(true);
    signOut();
  };

  const start = (way: WayOut) => {
    setChosen(way);
    setQuote(null);
    setProblem(null);
    setRefreshed(false);
    setDollars(maxToChange);
    setStage("amount");
  };

  const askPrice = async (again = false) => {
    if (!chosen || changing.units === undefined) return;
    setBusy(true);
    setProblem(null);
    try {
      setQuote(await quoteWayOut({ amount: changing.units, coin: chosen.coin }));
      setRefreshed(again);
      setStage("review");
    } catch (error) {
      if (sessionClosed(error)) closeSession();
      else setProblem({ where: "amount", text: refusalText(error, chosen), code: error instanceof ApiError ? error.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  const getReady = async () => {
    if (!quote || !chosen) return;
    const account = mera.currentAccount();
    // A closed session used to leave this function silently, the button doing nothing at all (D80).
    if (!account) {
      closeSession();
      return;
    }
    setBusy(true);
    setProblem(null);
    setStage("getting");
    try {
      await takeTheWayOut({ account, ticket: quote.ticket });
      await refresh();
      setQuote(null);
      setStage("ready");
    } catch (error) {
      if (sessionClosed(error)) {
        closeSession();
        return;
      }
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "QUOTE_EXPIRED") {
        // The price died while they read it. Asked again for them, and said so, rather than refused.
        setStage("amount");
        await askPrice(true);
        return;
      }
      setStage("review");
      setProblem({ where: "review", text: refusalText(error, chosen), code });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    if (!address) return;
    void navigator.clipboard
      .writeText(address)
      .then(() => setCopied("yes"))
      .catch(() => setCopied("refused"));
  };

  const codeProblem = (): string | null => {
    const typed = deposit.trim();
    if (!chosen || typed === "") return null;
    if (!isAddress(typed)) return W.codeRefusals.shape(chosen.name);
    if (address && getAddress(typed) === getAddress(address)) return W.codeRefusals.own(chosen.name);
    return null;
  };

  const send = async () => {
    if (!chosen) return;
    const ready = readyOf(chosen);
    const account = mera.currentAccount();
    if (!ready || !account) {
      if (!account) closeSession();
      return;
    }
    const to = getAddress(deposit.trim()) as Hex;
    const coin = coinOf(chosen);
    // Exactly the two-decimal number they ordered leaves, never the six-decimal balance: the order at the payout
    // service is for that number and expects that number (D75, flows W7 to W9).
    const leaving = ready.units;
    setBusy(true);
    setProblem(null);
    setStage("sending");
    try {
      let reference: string;
      let cost: string | undefined;
      let atMs: number;
      if (isNative(coin)) {
        // Nobody can move the chain's own coin for somebody else: their own account sends it and the fee comes
        // out of the same coin, said afterwards with the figure (D77). The row is written by a route that reads
        // the transaction back before believing the browser.
        const result = await sendMon(account, to, leaving);
        atMs = Date.now();
        cost = exactly(result.fee, coin);
        reference = result.hash.slice(2, 10);
        try {
          reference = (await postJson<{ reference: string }>("/api/send/record", { hash: result.hash, to })).reference;
        } catch {
          // The money moved; the record is for finding it later, and the reference is the same either way.
        }
      } else {
        const result = await sendOwnMoney({ account, to, amount: leaving, coin });
        reference = result.reference;
        atMs = result.sentAtMs;
      }
      setSent({ number: ready.number, name: chosen.name, when: whenInWords(atMs), reference, cost });
      setDeposit("");
      await refresh();
      setStage("sent");
    } catch (error) {
      if (sessionClosed(error)) {
        closeSession();
        return;
      }
      setStage("confirm");
      setProblem({ where: "send", text: refusalText(error, chosen), code: error instanceof ApiError ? error.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  // W13: to another account of the person's own. What a gift holds, or what is left of the euro coin when no
  // gift money is there. The chain's own coin never goes this way: it goes to the card service through the steps.
  const ownCoin: Coin = ausd > 0n ? AUSD : USDC;
  const ownMax = twoDecimalsDown(held(ownCoin), ownCoin.decimals);
  const ownSending = dollarsToChange(ownAmount, held(ownCoin), W.refusals);
  const ownNumber = ownSending.units === undefined ? "" : twoDecimalsDown(ownSending.units, ownCoin.decimals);
  const ownCodeProblem = (): string | null => {
    const typed = ownCode.trim();
    if (typed === "") return null;
    if (!isAddress(typed)) return W.own.refusals.shape;
    if (address && getAddress(typed) === getAddress(address)) return W.own.refusals.own;
    return null;
  };
  const sendOwn = async () => {
    const account = mera.currentAccount();
    if (!account || ownSending.units === undefined) {
      if (!account) closeSession();
      return;
    }
    const leaving = ownSending.units;
    setBusy(true);
    setProblem(null);
    setStage("ownSending");
    try {
      const result = await sendOwnMoney({ account, to: getAddress(ownCode.trim()) as Hex, amount: leaving, coin: ownCoin });
      setSent({ number: twoDecimalsDown(leaving, ownCoin.decimals), name: "", when: whenInWords(result.sentAtMs), reference: result.reference });
      setOwnCode("");
      await refresh();
      setStage("ownSent");
    } catch (error) {
      if (sessionClosed(error)) {
        closeSession();
        return;
      }
      setStage("ownConfirm");
      setProblem({ where: "own", text: refusalText(error, null) });
    } finally {
      setBusy(false);
    }
  };

  // W11 and W12. The session closes itself; the balances decide the step, so nothing is remembered here and
  // nothing is lost. Signing in leads, and nothing else is offered: a second account would strand the money.
  if (!address) {
    const ready = chosen ? readyOf(chosen) : firstReady ? readyOf(firstReady) : undefined;
    const way = chosen ?? firstReady ?? null;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <section className={CARD}>
          <h1 className={TITLE}>{closed ? W.closedTitle : W.signInToSee}</h1>
          <p className={BODY}>{closed ? W.closedBody : W.signedOutBody}</p>
          {closed && ready && way ? <p className={HELP}>{W.closedWhere(ready.number, way.name)}</p> : null}
        </section>
        <AccountPanel returning signInOnly />
      </div>
    );
  }

  const alert = (where: Where) =>
    problem && problem.where === where ? (
      <p role="alert" className={`${HELP} font-medium`}>
        {problem.text}
      </p>
    ) : null;

  const moneyCard = (
    <section className={CARD}>
      {/* When the dollar coins are empty and something is ready for a payout service, that figure is the headline:
          a big zero above money that exists is what the audit found on the card branch (its finding 15.5). */}
      <p className={HELP}>{holdings !== null && dollarsHeld === 0n && firstReady ? W.readyLabel(firstReady.name) : W.yourMoney}</p>
      {/* The display currency leads when the account has one, the dollar stays readable under it (decision 1). */}
      {holdings === null ? (
        <p className={MONEY}>{W.oneMoment}</p>
      ) : dollarsHeld === 0n && firstReady ? (
        <>
          <p className={MONEY}>{readyOf(firstReady)!.number}</p>
          {cardOnly ? (
            <p className={HELP}>
              {worth === undefined
                ? W.oneMoment
                : worth === "unavailable"
                  ? W.worthLater
                  : `${W.worthAbout(twoDecimalsDown(worth.units, AUSD.decimals))}${money.about(worth.units) ? `, ${money.about(worth.units)}` : ""}`}
            </p>
          ) : null}
        </>
      ) : money.about(dollarsHeld) ? (
        <>
          <p className={MONEY}>{money.about(dollarsHeld)!.replace(/ \(rate of .*\)$/, "")}</p>
          <p className={HELP}>
            {formatAusd(dollarsHeld)}, {money.about(dollarsHeld)!.match(/\((rate of .*)\)$/)?.[1]}
          </p>
        </>
      ) : (
        <>
          <p className={MONEY}>{formatAusd(dollarsHeld)}</p>
          {money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
        </>
      )}
      {firstReady && dollarsHeld > 0n && !isNative(coinOf(firstReady)) && stage !== "sent" ? <p className={BODY}>{W.readyLine(firstReady.name, readyOf(firstReady)!.number)}</p> : null}
    </section>
  );

  if (stage === "base") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {moneyCard}
        {/* Two signals disagree about where this person is (a trip, a shared connection, a private network), so the
            screen asks once. Until it is answered nothing is ordered, and nothing is hidden either (R1). */}
        {where?.ask && !answeredCountry ? (
          <section className={CARD}>
            <h2 className={TITLE}>{W.whereIsYours}</h2>
            <div className="flex flex-col gap-[var(--tap-gap)]">
              {[where.fromDevice, where.fromConnection].filter((one): one is string => one !== null).map((code) => (
                <button key={code} type="button" onClick={() => setAnsweredCountry(code)} className={SECONDARY_BUTTON}>
                  {countryInWords(code) ?? code.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {/* One accent surface per screen: the accent is on the first way offered, the others carry the same action in the
            plain shape. Which one comes first is the order's business (R1), never a hidden or a missing card. */}
        {ordered.map((way, index) => (
          <section key={way.name} className={CARD}>
            <h2 className={TITLE}>{way.name}</h2>
            <p className={BODY}>{way.where}</p>
            <p className={BODY}>
              {feeSentence(way)}, and pays {way.pays}.
            </p>
            <ul className={`list-disc pl-[var(--space-lg)] ${HELP}`}>
              {way.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
            <p className={HELP}>{W.sourceLine(way.source, way.read)}</p>
            {/* What that service itself says about this country today, read live. A rail that could not be read says
                nothing rather than something false, and the card stays where it is either way. */}
            {countryNow && where?.waysOut[way.name] === "does-not" ? <p className={HELP}>{W.noPayoutThere(way.name, countryInWords(countryNow) ?? countryNow.toUpperCase())}</p> : null}
            <button type="button" onClick={() => start(way)} disabled={holdings === null || ausd === 0n} className={index === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
              {way.coin === USDC.address ? W.chooseBank : W.chooseCard}
            </button>
            {holdings !== null && ausd === 0n ? <p className={HELP}>{W.nothingToSend}</p> : null}
          </section>
        ))}
        <button type="button" onClick={() => { setProblem(null); setOwnAmount(ownMax); setStage("own"); }} disabled={holdings === null || dollarsHeld === 0n} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.anotherAccount}
        </button>
      </div>
    );
  }

  if ((stage === "amount" || stage === "review" || stage === "getting") && chosen) {
    const bank = chosen.coin === USDC.address;
    const orderNumber = quote ? floorToOrder(quote.shown) : "";
    const applied = quote?.payout ? feeApplied(quote.payout.worth, chosen.fee) : undefined;
    const payout =
      quote?.payout && applied
        ? W.reviewPayout(
            chosen.name,
            `${quote.payout.worth.toFixed(2)} ${quote.payout.currency}`,
            `${applied.fee.toFixed(2)} ${quote.payout.currency}`,
            `${applied.net.toFixed(2)} ${quote.payout.currency}`,
          )
        : W.reviewCard(chosen.name);
    const priceRefused = problem?.where === "review" && (problem.code === "RATE_MOVED" || problem.code === "QUOTE_STALE");
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {moneyCard}
        <section className={CARD}>
          <h2 className={TITLE}>{W.step1}</h2>
          {stage === "amount" ? (
            <>
              <label className="flex flex-col gap-[var(--space-xs)]">
                <span className={BODY}>{bank ? W.howMuchBank : W.howMuchCard}</span>
                <span className="flex items-center gap-[var(--space-sm)]">
                  <span className={BODY}>$</span>
                  <input value={dollars} onChange={(event) => { setDollars(event.target.value); setProblem(null); }} inputMode="decimal" className={FIELD} disabled={busy} />
                </span>
              </label>
              {dollars.trim() !== "" && changing.refusal ? (
                <p role="alert" className={`${HELP} font-medium`}>
                  {changing.refusal}{" "}
                  {changing.refusal === W.refusals.tooMuch(maxToChange) ? (
                    <button type="button" onClick={() => setDollars(maxToChange)} className="underline">
                      {W.refusals.sendAllOfIt}
                    </button>
                  ) : null}
                </p>
              ) : (
                <p className={HELP}>{W.upTo(maxToChange, money.about(ausd))}</p>
              )}
              {alert("amount")}
              <div className="flex flex-wrap gap-[var(--tap-gap)]">
                <button type="button" onClick={() => void askPrice()} disabled={busy || changing.units === undefined} className={PRIMARY_BUTTON}>
                  {busy ? W.asking : W.seeWhatYouWillGet}
                </button>
                <button type="button" onClick={() => { setStage("base"); setChosen(null); setProblem(null); }} className={INLINE_BUTTON}>
                  {W.notNow}
                </button>
              </div>
            </>
          ) : null}
          {(stage === "review" || stage === "getting") && quote ? (
            <>
              {/* Once the price was refused, the figures it carried are old and the line saying it holds is false,
                  so neither stays on the screen beside the refusal. */}
              {priceRefused ? null : (
                <>
                  <p className={BODY}>{W.review(orderNumber, chosen.name, payout)}</p>
                  <p className={HELP}>
                    {W.reviewDollars(changing.units !== undefined ? twoDecimalsDown(changing.units, AUSD.decimals) : dollars)}
                    {money.about(changing.units ?? 0n) ? ` ${money.about(changing.units ?? 0n)}.` : ""}
                  </p>
                  <p className={HELP}>{refreshed ? `${W.priceRefreshed} ${W.priceHolds}` : W.priceHolds}</p>
                </>
              )}
              {alert("review")}
              <div className="flex flex-wrap gap-[var(--tap-gap)]">
                {problem?.where === "review" && problem.code === "RATE_MOVED" ? (
                  <button type="button" onClick={() => void askPrice(true)} disabled={busy} className={PRIMARY_BUTTON}>
                    {W.failures.seeTheNewPrice}
                  </button>
                ) : problem?.where === "review" && problem.code === "QUOTE_STALE" ? (
                  <button type="button" onClick={() => void askPrice(true)} disabled={busy} className={PRIMARY_BUTTON}>
                    {W.failures.tryAgain}
                  </button>
                ) : (
                  <button type="button" onClick={() => void getReady()} disabled={busy || stage === "getting"} className={PRIMARY_BUTTON}>
                    {stage === "getting" ? W.gettingReady(orderNumber) : W.getReady(orderNumber)}
                  </button>
                )}
                {stage !== "getting" ? (
                  <button type="button" onClick={() => { setStage("amount"); setQuote(null); setProblem(null); }} className={INLINE_BUTTON}>
                    {W.notNow}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    );
  }

  if ((stage === "ready" || stage === "confirm" || stage === "sending" || stage === "sent") && chosen) {
    const ready = readyOf(chosen);
    const coin = coinOf(chosen);
    const problemWithCode = codeProblem();
    /** The screen is waiting for a code it can send to; until there is one, sending is not the action to press. */
    const sendable = deposit.trim() !== "" && problemWithCode === null;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {moneyCard}
        {stage === "sent" && sent ? (
          <section className={CARD}>
            <p className={BODY}>{W.sent(sent.number, sent.name, sent.when, sent.reference)}</p>
            <p className={HELP}>{W.sentPays(chosen.name, chosen.pays, !isNative(coin))}</p>
            {sent.cost ? <p className={HELP}>{W.sendingCost(sent.cost)}</p> : null}
            <a href={chosen.page} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
              {W.follow(chosen.name)}
            </a>
          </section>
        ) : ready ? (
          <section className={CARD}>
            <p className={BODY}>{W.ready(ready.number)}</p>
            <p className={HELP}>{W.stays(dustInWords(ready.dust, coin.decimals))}</p>
            {/* What the screen is waiting for: a code that could be sent to. Until then, sending is not the live action. */}

            {stage === "ready" ? (
              <>
                <h2 className={TITLE}>{W.step2(chosen.name)}</h2>
                {/* Steps 2 and 3 stand on one screen, so the accent marks the step the screen is waiting for: placing the
                    order while nothing has been pasted, sending once the code is there. Never both at once. */}
                <a href={chosen.page} target="_blank" rel="noopener noreferrer" className={sendable ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
                  {W.order(ready.number, chosen.name)}
                </a>
                <p className={BODY}>{W.giveThisCode(chosen.name)}</p>
                {/* Whole and wrapping, so it can be compared with what was pasted on the service's page (decision 9). */}
                <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
                <button type="button" onClick={copyCode} className={SECONDARY_BUTTON}>
                  {copied === "yes" ? W.copied : W.copy}
                </button>
                {copied === "refused" ? <p className={HELP}>{W.copyRefused}</p> : null}
                <p className={HELP}>{W.itIsYours(chosen.name)}</p>
                {isNative(coin) ? <p className={HELP}>{W.sixHours(chosen.name)}</p> : null}
              </>
            ) : null}

            <h2 className={TITLE}>{W.step3}</h2>
            {stage === "ready" ? (
              <>
                <label className="flex flex-col gap-[var(--space-xs)]">
                  <span className={BODY}>{W.pasteTheCode(chosen.name)}</span>
                  <input value={deposit} onChange={(event) => { setDeposit(event.target.value); setProblem(null); }} className={`${FIELD} break-all`} disabled={busy} />
                </label>
                {problemWithCode ? (
                  <p role="alert" className={`${HELP} font-medium`}>
                    {problemWithCode}
                  </p>
                ) : deposit.trim() !== "" ? (
                  <p className="break-all text-[length:var(--type-help)] tabular-nums">{deposit.trim()}</p>
                ) : null}
                <p className={HELP}>
                  {W.amountFixed}: {ready.number}
                </p>
                <button type="button" onClick={() => setStage("confirm")} disabled={!sendable || busy} className={sendable ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                  {W.send(ready.number, chosen.name)}
                </button>
                {deposit.trim() === "" ? <p className={HELP}>{W.pasteFirst(chosen.name)}</p> : null}
                <Link href="/" className={INLINE_BUTTON}>
                  {W.notNow}
                </Link>
              </>
            ) : null}
            {stage === "confirm" || stage === "sending" ? (
              <>
                <p className={BODY}>{W.confirm(ready.number, chosen.name)}</p>
                {isNative(coin) ? <p className={HELP}>{W.confirmCard}</p> : null}
                <p className={HELP}>{W.codeYouPasted}</p>
                <p className="break-all text-[length:var(--type-help)] tabular-nums">{deposit.trim()}</p>
                {alert("send")}
                <div className="flex flex-wrap gap-[var(--tap-gap)]">
                  <button type="button" onClick={() => void send()} disabled={busy || stage === "sending"} className={PRIMARY_BUTTON}>
                    {stage === "sending" ? W.sending(ready.number, chosen.name) : W.sendButton}
                  </button>
                  {stage !== "sending" ? (
                    <button type="button" onClick={() => { setStage("ready"); setProblem(null); }} className={INLINE_BUTTON}>
                      {W.notNow}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <p className={HELP}>{W.oneMoment}</p>
        )}
      </div>
    );
  }

  // W13: the secondary path, to another account of the person's own.
  const ownProblem = ownCodeProblem();
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      {moneyCard}
      <section className={CARD}>
        <h2 className={TITLE}>{W.own.title}</h2>
        {stage === "ownSent" && sent ? (
          <>
            <p className={BODY}>{W.own.sent(sent.number, sent.when, sent.reference)}</p>
          </>
        ) : (
          <>
            {stage === "own" ? (
              <>
                <label className="flex flex-col gap-[var(--space-xs)]">
                  <span className={BODY}>{W.own.code}</span>
                  <input value={ownCode} onChange={(event) => { setOwnCode(event.target.value); setProblem(null); }} className={`${FIELD} break-all`} disabled={busy} />
                </label>
                {ownProblem ? (
                  <p role="alert" className={`${HELP} font-medium`}>
                    {ownProblem}
                  </p>
                ) : (
                  <p className={HELP}>{W.own.help}</p>
                )}
                <label className="flex flex-col gap-[var(--space-xs)]">
                  <span className={BODY}>{W.own.howMuch}</span>
                  <span className="flex items-center gap-[var(--space-sm)]">
                    <span className={BODY}>$</span>
                    <input value={ownAmount} onChange={(event) => setOwnAmount(event.target.value)} inputMode="decimal" className={FIELD} disabled={busy} />
                  </span>
                </label>
                {ownAmount.trim() !== "" && ownSending.refusal ? (
                  <p role="alert" className={`${HELP} font-medium`}>
                    {ownSending.refusal}{" "}
                    {ownSending.refusal === W.refusals.tooMuch(ownMax) ? (
                      <button type="button" onClick={() => setOwnAmount(ownMax)} className="underline">
                        {W.refusals.sendAllOfIt}
                      </button>
                    ) : null}
                  </p>
                ) : (
                  <p className={HELP}>{W.upTo(ownMax, money.about(held(ownCoin)))}</p>
                )}
                <div className="flex flex-wrap gap-[var(--tap-gap)]">
                  <button type="button" onClick={() => setStage("ownConfirm")} disabled={busy || ownCode.trim() === "" || ownProblem !== null || ownSending.units === undefined} className={PRIMARY_BUTTON}>
                    {W.own.send(ownNumber)}
                  </button>
                  {ownCode.trim() === "" ? <p className={HELP}>{W.own.pasteFirst}</p> : null}
                  <button type="button" onClick={() => { setStage("base"); setProblem(null); }} className={INLINE_BUTTON}>
                    {W.notNow}
                  </button>
                </div>
              </>
            ) : null}
            {(stage === "ownConfirm" || stage === "ownSending") && ownSending.units !== undefined ? (
              <>
                <p className={BODY}>{W.own.confirm(ownNumber)}</p>
                <p className={HELP}>{W.codeYouPasted}</p>
                <p className="break-all text-[length:var(--type-help)] tabular-nums">{ownCode.trim()}</p>
                {alert("own")}
                <div className="flex flex-wrap gap-[var(--tap-gap)]">
                  <button type="button" onClick={() => void sendOwn()} disabled={busy || stage === "ownSending"} className={PRIMARY_BUTTON}>
                    {stage === "ownSending" ? W.sending(ownNumber, "your other account") : W.sendButton}
                  </button>
                  {stage !== "ownSending" ? (
                    <button type="button" onClick={() => { setStage("own"); setProblem(null); }} className={INLINE_BUTTON}>
                      {W.notNow}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
