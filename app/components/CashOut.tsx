"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getAddress, isAddress, type Hex } from "viem";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "@/src/client/exit";
import { sendOwnMoney, withdrawEarned } from "@/src/client/gift";
import { totalEarned, type EarnedInGift } from "@/src/earned-shape";
import { readCoinBalance, sendMon } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, exactly, isNative, USDC, type Coin } from "@/src/coins";
import { rateDateInWords, whenInWords } from "@/src/display-currency";
import { exitAmount, type ExitAmount } from "@/src/exit-amount";
import { dollarsToChange, dollarsToTheCent, feeApplied, floorToOrder, netOfEverything, readyFor, toTheCent, twoDecimalsDown, type Ready } from "@/src/exit-steps";
import { formatAusd } from "@/src/gift-reader";
import { whereTheRailsServe, type RailsWhere } from "@/src/client/rails";
import { countryInWords } from "@/src/rail-country";
import { feeSentence, RATE_SOURCE, WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT, type WayOut } from "@/src/rails";
import { CASH_OUT as W, USE_MONEY as U } from "@/src/sentences";
import { orderUses, usesFor } from "@/src/use-money";
import { AccountPanel } from "./AccountPanel";
import { PhoneTopUp } from "./PhoneTopUp";
import { GiftCardOut } from "./GiftCardOut";
import { phoneOffered } from "@/src/client/phone";
import { AMOUNT_IN_TITLE, BODY, CARD, CARD_LABEL, CARD_TITLE, CHIP, FIELD, HELP, INLINE_BUTTON, META, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE, TITLE_IN_FACE } from "./ui";

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
 *
 * The screen that decides is out.html of 19 Sep 2026, as the founder read it against production on 20 Sep (D124):
 * the balance, the question, and one card per way with its title in the person's words, the figure that would reach
 * them, one line, one button. The way that leaves the most goes first and carries the accent, and a line under its
 * figure says by how much. The published figures and their sources are behind a fold under the cards.
 */

type Stage = "base" | "phone" | "giftcard" | "gathering" | "amount" | "review" | "getting" | "ready" | "confirm" | "sending" | "sent" | "own" | "ownConfirm" | "ownSending" | "ownSent";

/** Where a refusal is shown: under the element that caused it, never in a box at the bottom of the page. */
type Where = "gather" | "amount" | "review" | "code" | "send" | "own";

type Sent = Readonly<{ amount: string; exact?: string; name: string; when: string; reference: string; cost?: string }>;

/** A figure in the currency a payout service pays in, the euro with its sign and anything else with its code. */
function figureIn(amount: number, currency: string): string {
  return currency === "EUR" ? `€${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency}`;
}

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
  const { address, ensureSigner, signOut } = useAccount();
  useMoneySession();
  const money = useDisplayCurrency(address);
  const [holdings, setHoldings] = useState<Record<string, bigint> | null>(null);
  /** What the gifts made out to this account hold for it, which the way out takes first (D208). */
  const [inGifts, setInGifts] = useState<readonly EarnedInGift[]>([]);
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
  /** Whether the person opened "change" under the title, to say where their number is from (D270). */
  const [picking, setPicking] = useState(false);
  const resumed = useRef(false);
  // The third way, their phone (D238): shown only when the server offers it to this account, and nothing is said when
  // it does not, since the way is not open to everybody before a real top-up has reached a real number.
  const [phoneOn, setPhoneOn] = useState(false);
  const [phoneDataOn, setPhoneDataOn] = useState(false);
  const [giftCardsOn, setGiftCardsOn] = useState(false);
  useEffect(() => {
    if (!address) return;
    let live = true;
    phoneOffered().then((offer) => {
      if (!live) return;
      setPhoneOn(offer.offered);
      setPhoneDataOn(offer.data);
      setGiftCardsOn(offer.giftCards);
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [address]);

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

  const coinOf = (way: WayOut): Coin => coinAt(way.coin) ?? USDC;

  const refresh = useCallback(async (): Promise<Record<string, bigint> | undefined> => {
    if (!address) return undefined;
    const [read, gifts] = await Promise.all([
      Promise.all(COINS.map((coin) => readCoinBalance(coin, address))),
      // A read that fails is a way out without the gifts' part, which is what it was before (D208).
      getJson<{ gifts: EarnedInGift[] }>("/api/gifts/earned").then((answer) => answer.gifts, () => [] as EarnedInGift[]),
    ]);
    const next = Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]]));
    setHoldings(next);
    setInGifts(gifts);
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
    return next;
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  const held = (coin: Coin): bigint => holdings?.[coin.symbol] ?? 0n;
  const ausd = held(AUSD);
  /** What the gifts hold for this account (D208): taken into it first, so it counts in every figure it will change. */
  const giftsHold = totalEarned(inGifts);
  // Each coin cut to the cent before they are added, so the figure at the head and the figures on the cards are one
  // number (D124): dust under a cent left by a payout used to tip the sum and print $10.14 over cards on $10.13.
  const changeable = toTheCent(ausd + giftsHold, AUSD.decimals);
  const dollarsHeld = dollarsToTheCent(ausd + giftsHold, held(USDC));
  const readyOf = (way: WayOut): Ready | undefined => (holdings ? readyFor(way, coinOf(way), held(coinOf(way))) : undefined);
  const firstReady = WAYS_OUT.find((way) => readyOf(way) !== undefined);

  /** The dollars a card rail's ready amount is worth, once the price has answered, and nothing until then. */
  const worthUnits = worth === undefined || worth === "unavailable" ? undefined : worth.units;
  /** What a person reads (dollars) and what the service asks for (the exact quantity), for one way out (D104). */
  const amountOf = (way: WayOut, ready: Ready): ExitAmount =>
    exitAmount({ number: ready.number, native: isNative(coinOf(way)), worth: worthUnits });

  /** What each way out would leave of everything that can be changed, at the rate read today (src/exit-steps.ts). */
  const netOf = (way: WayOut) => netOfEverything(changeable, way.fee, money.rates);
  // Every way, in the order the screen shows them: the country may send one to the back (R1), then what reaches
  // the person decides, and nothing is ever removed.

  const changing = dollarsToChange(dollars, ausd, W.refusals);
  const maxToChange = twoDecimalsDown(ausd, AUSD.decimals);

  // The card branch with nothing else in the account: the ready figure leads, and its worth is asked once.
  const cardOnly = holdings !== null && dollarsHeld === 0n && firstReady !== undefined && isNative(coinOf(firstReady)) ? readyOf(firstReady) : undefined;
  /**
   * What is ready on a card rail, whichever way the screen got there: the person decides on dollars, so the dollars
   * are asked of the price for every state that names the amount, not only for the headline of an empty account
   * (D104). One quote per amount, the same the funder screen converts with, and never a guess.
   */
  const cardWay = chosen && isNative(coinOf(chosen)) ? chosen : firstReady && isNative(coinOf(firstReady)) ? firstReady : undefined;
  const cardOnlyUnits = cardWay ? readyOf(cardWay)?.units : undefined;
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

  /**
   * The gifts' part first (D208): one signature per gift, each relayed into this account, then the balances read
   * again, so everything after this step is the way out as it always was, on money the account holds. A refusal
   * leaves the rest where it was: whatever came out is in the account, whatever did not is still in its gift.
   */
  const gather = async (): Promise<Record<string, bigint> | undefined> => {
    if (inGifts.length === 0) return holdings ?? undefined;
    setBusy(true);
    setProblem(null);
    setStage("gathering");
    try {
      const account = await ensureSigner();
      for (const gift of inGifts) {
        await withdrawEarned({ account, giftId: gift.giftId, escrow: gift.escrow, amount: BigInt(gift.earned), nonce: BigInt(gift.nonce) });
      }
      return await refresh();
    } catch (error) {
      if (sessionClosed(error)) closeSession();
      else setProblem({ where: "gather", text: W.gatherFailed, code: error instanceof ApiError ? error.code : undefined });
      await refresh().catch(() => undefined);
      setStage("base");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const start = async (way: WayOut) => {
    const now = await gather();
    if (!now) return;
    setChosen(way);
    setQuote(null);
    setProblem(null);
    setRefreshed(false);
    setDollars(twoDecimalsDown(now[AUSD.symbol] ?? 0n, AUSD.decimals));
    setStage("amount");
  };

  const startGiftCard = async () => {
    const now = await gather();
    if (!now) return;
    setProblem(null);
    setStage("giftcard");
  };

  const startPhone = async () => {
    const now = await gather();
    if (!now) return;
    setProblem(null);
    setStage("phone");
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
    // A closed session used to leave this function silently, the button doing nothing at all (D80). Now the passkey
    // is opened here, which is the moment a signature is needed; only a refusal closes the session.
    let account;
    try {
      account = await ensureSigner();
    } catch {
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
    if (!ready) return;
    let account;
    try {
      account = await ensureSigner();
    } catch {
      closeSession();
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
      const said = amountOf(chosen, ready);
      setSent({ amount: said.lead, exact: said.exact, name: chosen.name, when: whenInWords(atMs), reference, cost });
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
    if (ownSending.units === undefined) return;
    let account;
    try {
      account = await ensureSigner();
    } catch {
      closeSession();
      return;
    }
    const leaving = ownSending.units;
    setBusy(true);
    setProblem(null);
    setStage("ownSending");
    try {
      const result = await sendOwnMoney({ account, to: getAddress(ownCode.trim()) as Hex, amount: leaving, coin: ownCoin });
      setSent({ amount: twoDecimalsDown(leaving, ownCoin.decimals), name: "", when: whenInWords(result.sentAtMs), reference: result.reference });
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

  /**
   * The page's title, in the screen rather than the shell (D270): on the first screen it stands under the balance with
   * the line that says which country orders the uses, as the mockups draw it; on every other step it leads, as the
   * shell's title did. In the title face, as the mockups set it.
   */
  const heading = <h1 className={TITLE_IN_FACE}>{W.title}</h1>;
  // The uses for the number's country, ordered by the amount (D270): only what works there, the first in the sun.
  const asking = picking || Boolean(where?.ask && !answeredCountry);
  const countryChoices = Array.from(new Set([countryNow, where?.fromDevice, where?.fromConnection, "sn", "ci", "fr"].filter((code): code is string => Boolean(code))));
  const eurosHeld = money.rates?.usdPerEur ? Number(changeable) / 1_000_000 / money.rates.usdPerEur : undefined;
  const uses = where?.ask && !answeredCountry ? [] : orderUses(usesFor(countryNow, where?.waysOut ?? {}, phoneOn, giftCardsOn), eurosHeld, (use) => netOf(use === "bank" ? WAY_OUT_EURO : WAY_OUT_CARD)?.net);

  // W11 and W12. The session closes itself; the balances decide the step, so nothing is remembered here and
  // nothing is lost. Signing in leads, and nothing else is offered: a second account would strand the money.
  if (!address) {
    const ready = chosen ? readyOf(chosen) : firstReady ? readyOf(firstReady) : undefined;
    const way = chosen ?? firstReady ?? null;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        <section className={CARD}>
          <h1 className={TITLE}>{closed ? W.closedTitle : W.signInToSee}</h1>
          <p className={BODY}>{closed ? W.closedBody : W.signedOutBody}</p>
          {closed && ready && way ? (
            <>
              <p className={HELP}>{W.closedWhere(amountOf(way, ready).lead, way.name)}</p>
              {amountOf(way, ready).exact ? <p className={HELP}>{W.exactQuantity(way.name, amountOf(way, ready).exact!)}</p> : null}
            </>
          ) : null}
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
          <p className={MONEY}>{amountOf(firstReady, readyOf(firstReady)!).lead}</p>
          {cardOnly ? (
            <p className={HELP}>
              {worth === undefined
                ? W.oneMoment
                : worth === "unavailable"
                  ? W.worthLater
                  : // The figure above is already the dollars (D104); this line carries the account's own currency
                    // and the date of the rate, and says nothing when the account reads in dollars.
                    (money.about(worth.units) ?? "")}
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
      {firstReady && dollarsHeld > 0n && !isNative(coinOf(firstReady)) && stage !== "sent" ? (
        <p className={BODY}>{W.readyLine(firstReady.name, amountOf(firstReady, readyOf(firstReady)!).lead)}</p>
      ) : null}
    </section>
  );

  if (stage === "gathering") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <p role="status" className={BODY}>
          {W.gathering}
        </p>
      </div>
    );
  }

  if (stage === "base") {
    const figure = holdings === null ? undefined : money.figure(dollarsHeld);
    const cardBranch = holdings !== null && dollarsHeld === 0n && firstReady !== undefined;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {/* The balance, on the page ground and not in a box, as Home sets it: the dollars lead on the way out because
            the cards under them say what arrives in the person's currency, and the conversion is the caption. When
            the dollar coins are empty and something is ready for the card service, that card leads instead. */}
        {cardBranch ? (
          moneyCard
        ) : (
          <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
            <p className={CARD_LABEL}>{U.yours}</p>
            <p className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": holdings === null ? 1 : formatAusd(dollarsHeld).length } as CSSProperties}>
              {holdings === null ? "…" : formatAusd(dollarsHeld)}
            </p>
            {figure?.rateDate ? <p className={HELP}>{W.aboutLine(figure.text, figure.rateDate)}</p> : null}
            {holdings !== null && !figure?.rateDate && money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
            {firstReady && dollarsHeld > 0n && !isNative(coinOf(firstReady)) ? (
              <p className={HELP}>{W.readyLine(firstReady.name, amountOf(firstReady, readyOf(firstReady)!).lead)}</p>
            ) : null}
            {/* The gifts' part is in the figure above, and it is taken into the account first (D208). */}
            {giftsHold > 0n ? <p className={HELP}>{W.inYourGifts(formatAusd(giftsHold))}</p> : null}
            {alert("gather")}
          </section>
        )}
        {/* "Use your money" (D270): the uses for the number's country, one card each, the first in the sun. The line
            under the title says which country filters and orders them, and "change" answers it; when the two signals
            disagree, the question is open from the start and nothing is ordered until it is answered (R1). */}
        <div className="flex flex-col gap-[var(--space-xs)]">
          {heading}
          <p className={CARD_LABEL}>
            {countryNow ? U.forNumberIn(countryInWords(countryNow) ?? countryNow.toUpperCase()) : U.forYourNumber}
            {" · "}
            <button type="button" onClick={() => setPicking((was) => !was)} aria-expanded={asking} className="underline underline-offset-2">
              {U.change}
            </button>
          </p>
        </div>
        {asking ? (
          <section className={CARD}>
            <h3 className={CARD_TITLE}>{U.whereIsTheNumber}</h3>
            <div className="flex flex-wrap gap-[var(--space-sm)]">
              {countryChoices.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={countryNow === code}
                  onClick={() => {
                    setAnsweredCountry(code);
                    setPicking(false);
                  }}
                  className={`${CHIP} ${countryNow === code ? "bg-[var(--chosen)] font-bold" : ""}`}
                >
                  {countryInWords(code) ?? code.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {uses.length === 0 ? <p className={BODY}>{U.nothingHere}</p> : null}
        {uses.map((use, index) => {
          const words = U[use];
          const way = use === "bank" ? WAY_OUT_EURO : use === "card" ? WAY_OUT_CARD : undefined;
          const net = way ? netOf(way) : undefined;
          // The phone's figure is the balance itself, in the person's currency: what the top-up is taken from, since what
          // reaches the phone is priced once the number and the amount are known (D238).
          const figure = way ? (net ? figureIn(net.net, net.currency) : undefined) : holdings === null ? undefined : (money.figure(dollarsHeld)?.text ?? formatAusd(dollarsHeld));
          const act = () => (way ? start(way) : use === "giftcard" ? void startGiftCard() : void startPhone());
          return (
            <section key={use} className={CARD}>
              <div className="flex items-baseline justify-between gap-[var(--space-md)]">
                <h3 className={CARD_TITLE}>{words.name}</h3>
                {figure ? <p className={`${CARD_TITLE} whitespace-nowrap tabular-nums`}>{figure}</p> : null}
              </div>
              <p className={CARD_LABEL}>{words.nature}</p>
              <p className={BODY}>{words.body}</p>
              <button type="button" onClick={act} disabled={holdings === null || changeable === 0n} className={index === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                {words.action}
              </button>
              {holdings !== null && changeable === 0n ? <p className={HELP}>{W.nothingToSend}</p> : null}
            </section>
          );
        })}
        {/* The two gestures left, in one line (the README's seventh rule): keep it here, or send it to another account. */}
        <p className={HELP}>
          {U.keepHere}
          {" · "}
          <button type="button" onClick={() => { setProblem(null); setOwnAmount(ownMax); setStage("own"); }} disabled={holdings === null || dollarsHeld === 0n} className="inline underline underline-offset-2 disabled:no-underline">
            {W.anotherAccount}
          </button>
        </p>
        {/* The published figures and where each was read, for whoever asks: one press away, under everything. */}
        <details className={HELP}>
          <summary className="min-h-[var(--tap-target)] cursor-pointer py-[var(--space-sm)] font-medium">{W.whereFrom}</summary>
          {WAYS_OUT.map((way) => (
            <p key={way.name}>
              {feeSentence(way)}, and pays {way.pays}. {W.sourceLine(way.source, way.read)}
            </p>
          ))}
          {money.rates ? <p>{W.rateLine(RATE_SOURCE.name, rateDateInWords(money.rates.date))}</p> : null}
        </details>
      </div>
    );
  }

  if (stage === "giftcard") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {moneyCard}
        <GiftCardOut country={countryNow} countryName={countryNow ? (countryInWords(countryNow) ?? countryNow.toUpperCase()) : null} ausd={ausd} ensureSigner={ensureSigner} onSessionClosed={closeSession} onChanged={refresh} onBack={() => { setProblem(null); setStage("base"); }} />
      </div>
    );
  }

  if (stage === "phone") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <PhoneTopUp ausd={ausd} dataOn={phoneDataOn} ensureSigner={ensureSigner} onSessionClosed={closeSession} onChanged={refresh} onBack={() => { setProblem(null); setStage("base"); }} />
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
        {heading}
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
                  {/* The dollars a person is spending lead, whichever coin the service buys: on the bank rail the
                      number ready to send is those dollars, on the card rail it is a quantity of the chain's own
                      coin, and the quantity is said after the money rather than in its place (D104). */}
                  <p className={BODY}>
                    {bank
                      ? W.review(`$${orderNumber}`, chosen.name, payout)
                      : W.reviewGetting(formatAusd(changing.units ?? 0n), orderNumber, chosen.name)}
                  </p>
                  {bank ? null : <p className={BODY}>{payout}</p>}
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
                    {stage === "getting"
                      ? W.gettingReady(bank ? `$${orderNumber}` : formatAusd(changing.units ?? 0n))
                      : W.getReady(bank ? `$${orderNumber}` : formatAusd(changing.units ?? 0n))}
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

  /**
   * The balance, while a gesture waits to be confirmed: one line in the meta voice, in place of the card that sets it
   * at the size of an amount. On the review of 19 Sep the whole balance, $20.99, was the largest figure on a screen
   * that sends $9.99, and a squint read it as the subject.
   */
  const balanceInMeta = <p className={META}>{W.yourMoneyNow(formatAusd(dollarsHeld))}</p>;

  if ((stage === "ready" || stage === "confirm" || stage === "sending" || stage === "sent") && chosen) {
    const ready = readyOf(chosen);
    const coin = coinOf(chosen);
    // What a person reads here, and the exact quantity the service asks for, said once under the action (D104).
    const amount = ready ? amountOf(chosen, ready) : undefined;
    const exactLine = amount?.exact ? (
      <>
        <p className={HELP}>{W.exactQuantity(chosen.name, amount.exact)}</p>
        {amount.unpriced ? <p className={HELP}>{W.worthLater}</p> : null}
      </>
    ) : null;
    const problemWithCode = codeProblem();
    /** The screen is waiting for a code it can send to; until there is one, sending is not the action to press. */
    const sendable = deposit.trim() !== "" && problemWithCode === null;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {stage === "confirm" || stage === "sending" ? balanceInMeta : moneyCard}
        {stage === "sent" && sent ? (
          <section className={CARD}>
            <p className={BODY}>{W.sent(sent.amount, sent.name, sent.when, sent.reference)}</p>
            {sent.exact ? <p className={HELP}>{W.exactQuantity(sent.name, sent.exact)}</p> : null}
            <p className={HELP}>{W.sentPays(chosen.name, chosen.pays, !isNative(coin))}</p>
            {sent.cost ? <p className={HELP}>{W.sendingCost(sent.cost)}</p> : null}
            <a href={chosen.page} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
              {W.follow(chosen.name)}
            </a>
          </section>
        ) : ready ? (
          <section className={CARD}>
            {/* What is ready, and what the two decimals leave behind: read while the person is placing the order. Once
                they are confirming, the amount is the figure below and these two lines would say it a second time. */}
            {stage === "ready" ? (
              <>
                <p className={BODY}>{W.ready(amount!.lead)}</p>
                <p className={HELP}>{isNative(coin) ? W.staysQuantity(chosen.name) : W.staysDollars}</p>
              </>
            ) : null}
            {/* What the screen is waiting for: a code that could be sent to. Until then, sending is not the live action. */}

            {stage === "ready" ? (
              <>
                <h2 className={TITLE}>{W.step2(chosen.name)}</h2>
                {/* Steps 2 and 3 stand on one screen, so the accent marks the step the screen is waiting for: placing the
                    order while nothing has been pasted, sending once the code is there. Never both at once. */}
                <a href={chosen.page} target="_blank" rel="noopener noreferrer" className={sendable ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
                  {W.order(amount!.lead, chosen.name)}
                </a>
                {exactLine}
                <p className={BODY}>{W.giveThisCode(chosen.name)}</p>
                {/* Whole and wrapping, so it can be compared with what was pasted on the service's page (decision 9). */}
                <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
                <button type="button" onClick={copyCode} className={SECONDARY_BUTTON}>
                  {copied === "yes" ? W.copied : W.copy}
                </button>
                {copied === "refused" ? <p className={HELP}>{W.copyRefused}</p> : null}
                <p className={HELP}>{W.itIsYours(chosen.name)}</p>
                {/* What stops a person at the service itself, said here where its page opens and not on the card that
                    decides (D124): the identity check, and the name the account or the card must carry. */}
                {chosen.conditions.map((condition) => (
                  <p key={condition} className={HELP}>
                    {condition}
                  </p>
                ))}
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
                  {W.amountFixed}: {amount!.lead}
                </p>
                <button type="button" onClick={() => setStage("confirm")} disabled={!sendable || busy} className={sendable ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                  {W.send(amount!.lead, chosen.name)}
                </button>
                {deposit.trim() === "" ? <p className={HELP}>{W.pasteFirst(chosen.name)}</p> : null}
                <Link href="/" className={INLINE_BUTTON}>
                  {W.notNow}
                </Link>
              </>
            ) : null}
            {stage === "confirm" || stage === "sending" ? (
              <>
                {/* The star of a review is what the gesture moves (the founder, 19 Sep 2026): the amount at display
                    size, the rest in one sentence under it, and the account's own balance in the meta voice above,
                    because it is where you are and not what you are deciding. */}
                <p className={`money-display ${AMOUNT_IN_TITLE}`} style={{ "--amount-chars": amount!.lead.length } as CSSProperties}>
                  {amount!.lead}
                </p>
                <p className={BODY}>{W.confirmTo(chosen.name)}</p>
                {exactLine}
                {isNative(coin) ? <p className={HELP}>{W.confirmCard}</p> : null}
                <p className={HELP}>{W.codeYouPasted}</p>
                <p className="break-all text-[length:var(--type-help)] tabular-nums">{deposit.trim()}</p>
                {alert("send")}
                <div className="flex flex-wrap gap-[var(--tap-gap)]">
                  <button type="button" onClick={() => void send()} disabled={busy || stage === "sending"} className={PRIMARY_BUTTON}>
                    {stage === "sending" ? W.sending(amount!.lead, chosen.name) : W.sendButton}
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
      {heading}
      {moneyCard}
      <section className={CARD}>
        <h2 className={TITLE}>{W.own.title}</h2>
        {stage === "ownSent" && sent ? (
          <>
            <p className={BODY}>{W.own.sent(sent.amount, sent.when, sent.reference)}</p>
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
