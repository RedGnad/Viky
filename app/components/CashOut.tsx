"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getAddress, isAddress, type Hex } from "viem";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { changeArrivedUsdc } from "@/src/client/convert";
import { fundingQuote } from "@/src/client/funding-quote";
import { quoteWayOut, takeTheWayOut, type WayOutQuote } from "@/src/client/exit";
import { loadEarnedInGifts, sendOwnMoney, takeFromGifts } from "@/src/client/gift";
import { totalEarned, type EarnedInGift } from "@/src/earned-shape";
import { readCoinBalance, sendMon, sendWithExplicitGas } from "@/src/client/onchain";
import { isVikyContract } from "@/src/viky-contracts";
import { AUSD, coinAt, COINS, isNative, MON, USDC, type Coin } from "@/src/coins";
import { rateDateInWords, spokenAmount, whenInWords, type LedAmount } from "@/src/display-currency";
import { exitAmount, type ExitAmount } from "@/src/exit-amount";
import { dollarsToChange, dollarsToTheCent, feeApplied, floorToOrder, heldForWithdrawal, netOfEverything, readyFor, toTheCent, twoDecimalsDown, type Ready } from "@/src/exit-steps";
import { chainCoinToChange, USDC_ARRIVAL_FLOOR } from "@/src/funding-step";
import { usdcRouterAddress } from "@/src/usdc-router";
import { formatAusd } from "@/src/gift-reader";
import { LedFigure } from "../kit/LedAmount";
import { Lines } from "../kit/Lines";
import { whereTheRailsServe, type RailsWhere } from "@/src/client/rails";
import { countryInWords } from "@/src/rail-country";
import { feeUnderItsName, RATE_SOURCE, WAY_OUT_CARD, WAY_OUT_EURO, wayOutFillsIn, wayOutPage, WAYS_OUT, type WayOut } from "@/src/rails";
import { CASH_OUT as W, KIT, USE_MONEY as U, WHERE_YOU_LIVE as L } from "@/src/sentences";
import { useChainCoinWorth } from "../kit/money";
import { inTheSun, orderUses, usesFor, usesSentence } from "@/src/use-money";
import { useAccountCountry } from "@/src/client/account-country";
import { CountryPicker } from "../kit/CountryPicker";
import { FoldChevron } from "../kit/GiftLive";
import { Said } from "../kit/Said";
import { AccountPanel } from "./AccountPanel";
import { PhoneTopUp } from "./PhoneTopUp";
import { amountIn, currencyOf } from "@/src/currencies";
import { MobileMoneyOut, MobilePayoutCard } from "./MobileMoneyOut";
import { latestMobilePayout, mobileMoneyOffer, payableFor, type AccountOffer, type FollowedPayout, type PayableNow } from "@/src/client/mobile-money";
import { delayInWords, localInWords, MOBILE_REFUSALS, operatorsInWords } from "@/src/mobile-money";
import { GiftCardOut } from "./GiftCardOut";
import { AMOUNT_IN_TITLE, BODY, CARD, CARD_LABEL, CARD_TITLE, FIELD, HELP, META, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, TITLE, TITLE_IN_FACE } from "./ui";
import { WaitLine } from "../kit/Waiting";
import { WAITS } from "@/src/sentences";
import { Working } from "../kit/Working";
import { Button } from "../kit/Button";

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

type Stage = "base" | "phone" | "mobile" | "giftcard" | "gathering" | "amount" | "review" | "getting" | "ready" | "confirm" | "sending" | "sent" | "own" | "ownConfirm" | "ownSending" | "ownSent";

/** Where a refusal is shown: under the element that caused it, never in a box at the bottom of the page. */
type Where = "gather" | "amount" | "review" | "code" | "send" | "own";

type Sent = Readonly<{ amount: string; exact?: string; name: string; when: string; reference: string; cost?: Readonly<{ dollars: string; underACent: boolean }> }>;

/** A figure in the currency a payout service pays in: the euro and the dollar with their signs, a franc amount as francs are written, anything else with its code. */
function figureIn(amount: number, currency: string): string {
  if (currencyOf(currency).after) return amountIn(amount, currency);
  return currency === "EUR" ? `€${amount.toFixed(2)}` : currency === "USD" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency}`;
}

/** A session that closed while they were away is not a failure to report, it is a door to reopen (D74, D80). */
function sessionClosed(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SIGN_IN_REQUIRED";
}

/**
 * What the person reads when a route refuses, branched on the typed code and never on the server's prose. On
 * a screen about money nothing may arrive as a shrug (D80): every branch below ends on what is true here, that nothing
 * was taken, because the router holds nothing between transactions, or, for a send that went out and is not final yet,
 * the route's own sentence that it is being confirmed.
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
      case "SENT_UNCONFIRMED":
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
  /**
   * The withdrawal this account has open, as the server reads it from what was written down (src/open-withdrawal.ts):
   * none, one, or not known yet. Nothing is said to be ready for the bank service without one, and nothing is changed
   * while it is not known.
   */
  const [openWithdrawal, setOpenWithdrawal] = useState<Readonly<{ coin: string; atLeast: bigint }> | null | undefined>(undefined);
  /** What the chain's own coin in the account would give now, by the exchange's own quote (app/kit/money.ts). */
  const coinWorth = useChainCoinWorth(holdings);
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
  // Where the person lives, a fact of the account (D274): read from it, and "change" below writes it back there.
  const { country: accountCountry, save: saveCountry } = useAccountCountry(address);
  // Until the account says, the country the connection comes from is proposed, as in Me, and the uses are shown for it
  // straight away (the founder, 27 Sep 2026): never a screen waiting on a question. Proposed only, never kept.
  const [proposedCountry, setProposedCountry] = useState<string | null>(null);
  const answeredCountry = accountCountry ?? null;
  const readFor = answeredCountry ?? proposedCountry;
  /** Whether the person opened "change" under the title, to say where their number is from (D270). */
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let live = true;
    whereTheRailsServe(readFor)
      .then((answer) => {
        if (!live) return;
        // The two signals disagree and nothing was said: read again for the connection's country rather than ask.
        const proposal = answer.ask && !readFor ? (answer.fromConnection ?? answer.fromDevice ?? null) : null;
        if (proposal) setProposedCountry(proposal);
        else setWhere(answer);
      })
      .catch(() => {
        // Nothing read is nothing ordered: the register's own order stands, and both ways stay on the screen.
        if (live) setWhere(null);
      });
    return () => {
      live = false;
    };
  }, [readFor]);

  const countryNow = answeredCountry ?? where?.country ?? null;

  // Whether mobile money is offered where the person lives, and with what, asked of the server, which asks Switch: a
  // country it does not cover, the way switched off, or Switch silent, and there is no card for it at all.
  const [mobile, setMobile] = useState<AccountOffer | null>(null);
  useEffect(() => {
    if (!countryNow) return;
    let current = true;
    mobileMoneyOffer(countryNow).then(
      (offer) => current && setMobile(offer),
      () => current && setMobile({ offered: false }),
    );
    return () => {
      current = false;
    };
  }, [countryNow]);
  const mobileOffered = mobile && mobile.offered === true && "mostUnits" in mobile && mobile.country === countryNow?.toUpperCase() ? mobile : null;
  /** What this account can really send to a number now, read when the mobile money card is opened. */
  const [mobilePayable, setMobilePayable] = useState<PayableNow | null>(null);
  /**
   * The payout this account is still owed a screen for (the founder, 5 Oct 2026): the last one money left for, until
   * it is finished and was seen finished, read from the server's ledger each time the way out is opened. Its reference
   * lived only in the screen that sent it, so "Back", a closed tab or a reload lost it. "Back" puts it away for this
   * visit, so the rest of the way out can be reached while it is still on its way.
   */
  const [owedPayout, setOwedPayout] = useState<FollowedPayout | null>(null);
  const [putAway, setPutAway] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    let current = true;
    latestMobilePayout().then(
      (payout) => current && setOwedPayout(payout),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [address]);

  const coinOf = (way: WayOut): Coin => coinAt(way.coin) ?? USDC;

  const refresh = useCallback(async (): Promise<Record<string, bigint> | undefined> => {
    if (!address) return undefined;
    const [read, gifts, open] = await Promise.all([
      Promise.all(COINS.map((coin) => readCoinBalance(coin, address))),
      // A read that fails is a way out without the gifts' part, which is what it was before (D208).
      loadEarnedInGifts(),
      // A read that fails leaves it unknown: nothing is said to be ready, and nothing is changed either.
      getJson<{ open: { coin: string; atLeast: string } | null }>("/api/exit/open").then(
        (answer) => (answer.open ? { coin: answer.open.coin, atLeast: BigInt(answer.open.atLeast) } : null),
        () => undefined,
      ),
    ]);
    const next = Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]]));
    setHoldings(next);
    setInGifts(gifts);
    setOpenWithdrawal(open);
    // An account is back, so a session that had closed is closed no longer.
    setClosed(false);
    // Nothing opens by itself any more (the audit of 1 Oct 2026). A way out holding something ready used to open on its
    // second step at every visit, so whatever else the account held could not be spent or sent anywhere else. The first
    // screen says what is ready and offers the way back to it (`W.continueReady`): the balances still decide the step.
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
  /**
   * Dollars a card payment delivered and no gift took: the other dollar coin, held with no withdrawal open on it. They
   * are money in the account like the rest, and they are turned into what a gift holds the moment a way is chosen, as
   * the gifts' part is taken first (`gather`). Nothing while the withdrawal is not known, under what the step that
   * changes them takes, or where that step does not exist.
   */
  const arrived = openWithdrawal !== undefined && !heldForWithdrawal(openWithdrawal, USDC.address, held(USDC)) && held(USDC) >= USDC_ARRIVAL_FLOOR && usdcRouterAddress() ? held(USDC) : 0n;
  /**
   * The chain's own coin under the same rule (the founder, 4 Oct 2026): a card can deliver it too. It is money in the
   * account, counted at the exchange's own quote (`useChainCoinWorth`), the quote Home counts it with, so the figure
   * here is Home's whatever the coin is held for. Held with no withdrawal open on it, it is changed into what a gift
   * holds the moment a way is chosen: `arrivedCoin` is that coin, `arrivedCoinWorth` its dollars, cut to the cent.
   * Held for a withdrawal by card that is open, it is counted all the same (the founder, 4 Oct 2026: "Yours" left it
   * out, and Home did not), and the line under the figure says that much of it is ready for the card service.
   */
  const coinHeld = chainCoinToChange(held(MON));
  const coinHeldWorth = coinHeld > 0n && coinWorth.state === "worth" ? coinWorth.units : 0n;
  const arrivedCoin = openWithdrawal !== undefined && !heldForWithdrawal(openWithdrawal, MON.address, held(MON)) ? coinHeld : 0n;
  const arrivedCoinWorth = arrivedCoin > 0n ? coinHeldWorth : 0n;
  const changeable = toTheCent(ausd + giftsHold + arrived, AUSD.decimals) + arrivedCoinWorth;
  const dollarsHeld = dollarsToTheCent(ausd + giftsHold, held(USDC)) + coinHeldWorth;
  /**
   * The coin's worth is not known and nothing else is held: no figure, as on Home (app/kit/money.ts). While the quote
   * is being read the dollars alone, then the dollars and the coin, would be two figures; and when it did not answer,
   * a zero would stand over money. It is asked again until it answers, and nothing is said of it (the founder, 4 Oct 2026).
   */
  const figureUnknown = coinHeld > 0n && (coinWorth.state === "reading" || (coinWorth.state === "unread" && dollarsHeld === 0n));
  /**
   * What the account holds, led by the reader's currency, with "about" before a figure that is a conversion. The exact
   * dollars under it are gone from this screen (the founder, 4 Oct 2026: "Exactly $20.99, at the rate of…"): the person
   * this is for has no use for dollars here. They are still said where an amount is typed and confirmed in them.
   */
  const heldLed = (): LedAmount => money.led(dollarsHeld);
  const readyOf = (way: WayOut): Ready | undefined => (holdings ? readyFor(way, coinOf(way), held(coinOf(way))) : undefined);
  /**
   * What the first screen says is ready for a service (the founder, 3 and 4 Oct 2026): only the money of a withdrawal
   * that is open. A balance used to say it, and a card payment delivers both coins a service takes.
   */
  const saidReady = (way: WayOut): Ready | undefined => (heldForWithdrawal(openWithdrawal, coinOf(way).address, held(coinOf(way))) ? readyOf(way) : undefined);
  const firstReady = WAYS_OUT.find((way) => saidReady(way) !== undefined);

  /** The dollars a card rail's ready amount is worth, once the price has answered, and nothing until then. */
  const worthUnits = worth === undefined || worth === "unavailable" ? undefined : worth.units;
  /** What a person reads (dollars) and what the service asks for (the exact quantity), for one way out (D104). */
  const amountOf = (way: WayOut, ready: Ready): ExitAmount =>
    exitAmount({ number: ready.number, native: isNative(coinOf(way)), worth: worthUnits });
  /** What is ready, as the person reads it: the bank service's dollars in the account's own currency, the card service's as before (D104). */
  const readyInWords = (way: WayOut): string => (isNative(coinOf(way)) ? amountOf(way, readyOf(way)!).lead : spokenAmount(money.led(readyOf(way)!.units)));

  /** How the bank service pays in this country, and the card service's smallest sale, as each publishes it today. */
  const bankPays = where?.out?.bank ?? null;
  const cardSmallest = where?.out?.cardSmallest ?? null;
  const bankSmallest = where?.out?.bankSmallest ?? null;
  /** What each way out would leave of everything that can be changed, at the rate read today (src/exit-steps.ts). */
  const netOf = (way: WayOut) => netOfEverything(changeable, way.fee, money.rates, way === WAY_OUT_EURO ? (bankPays?.currency ?? "EUR") : undefined);
  /** The way back to money already made ready for a service, from the first screen. */
  const continueWith = (way: WayOut) => {
    setChosen(way);
    setProblem(null);
    setStage("ready");
  };
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
    if (inGifts.length === 0 && arrived === 0n && arrivedCoin === 0n) return holdings ?? undefined;
    setBusy(true);
    setProblem(null);
    setStage("gathering");
    // Which of the two was under way when something failed, so the sentence is about that one.
    let readying = false;
    try {
      const account = await ensureSigner();
      await takeFromGifts(account, inGifts);
      // Then the dollars a card delivered, all of them, by the same step the gift's own screen takes (src/usdc-router.ts).
      if (arrived > 0n) {
        readying = true;
        await changeArrivedUsdc({ account, amount: arrived });
      }
      // And the chain's own coin a card delivered, above what the account keeps: the conversion the gift's own screen
      // makes, held to the amount asked for and to the one exchange before it is sent (src/client/funding-quote.ts).
      if (arrivedCoin > 0n) {
        readying = true;
        const conversion = await fundingQuote(arrivedCoin);
        await sendWithExplicitGas(account, { to: conversion.to, data: conversion.data, value: BigInt(conversion.value) });
      }
      return await refresh();
    } catch (error) {
      if (sessionClosed(error)) closeSession();
      else setProblem({ where: "gather", text: readying ? W.notReadied : W.gatherFailed, code: error instanceof ApiError ? error.code : undefined });
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

  /**
   * Sending to another account takes the gifts' part and what a card delivered first, as every other use does (the
   * founder, 4 Oct 2026). It opened on what the account alone held: somebody whose money was in a gift pressed an
   * enabled button and was offered "0.00".
   */
  const startOwn = async () => {
    const now = await gather();
    if (!now) return;
    const coin = (now[AUSD.symbol] ?? 0n) > 0n ? AUSD : USDC;
    setProblem(null);
    setOwnAmount(twoDecimalsDown(now[coin.symbol] ?? 0n, coin.decimals));
    setStage("own");
  };

  /**
   * The mobile money card opens on what the account can really send, the cost of changing it included (the founder,
   * 5 Oct 2026), so that is read first: the balance, the exchange and Switch. When one of them does not answer nothing
   * could be sent either, and the first screen says so.
   */
  const startMobile = async () => {
    const now = await gather();
    if (!now || !mobileOffered) return;
    setProblem(null);
    setBusy(true);
    try {
      setMobilePayable(await payableFor(mobileOffered.country));
      setStage("mobile");
    } catch (error) {
      if (sessionClosed(error)) closeSession();
      else setProblem({ where: "gather", text: error instanceof ApiError ? error.message : MOBILE_REFUSALS.notNow, code: error instanceof ApiError ? error.code : undefined });
      setStage("base");
    } finally {
      setBusy(false);
    }
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
    if (isVikyContract(typed)) return W.codeRefusals.viky(chosen.name);
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
      let cost: Sent["cost"];
      let atMs: number;
      if (isNative(coin)) {
        // Nobody can move the chain's own coin for somebody else: their own account sends it and the fee comes
        // out of the same coin, said afterwards with the figure (D77). The row is written by a route that reads
        // the transaction back before believing the browser.
        const result = await sendMon(account, to, leaving);
        atMs = Date.now();
        // In dollars, at the rate the ready amount was priced at, or not at all: never in the coin it was paid in.
        if (worthUnits !== undefined && cardOnlyUnits) {
          const inDollars = (result.fee * worthUnits) / cardOnlyUnits;
          cost = { dollars: formatAusd(inDollars), underACent: inDollars < 10_000n };
        }
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
    if (isVikyContract(typed)) return W.own.refusals.viky;
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
  const asking = picking;
  const eurosHeld = money.rates?.usdPerEur ? Number(changeable) / 1_000_000 / money.rates.usdPerEur : undefined;
  const uses = orderUses(usesFor(countryNow, where?.waysOut ?? {}, true, true, mobileOffered !== null), eurosHeld, (use) => netOf(use === "bank" ? WAY_OUT_EURO : WAY_OUT_CARD)?.net);

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
          <Said text={closed ? W.closedBody : W.signedOutBody} />
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
      ) : heldLed().converted ? (
        <>
          <LedFigure amount={heldLed()} className={MONEY} />
        </>
      ) : (
        <>
          <p className={MONEY}>{formatAusd(dollarsHeld)}</p>
          {money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
        </>
      )}
      {firstReady && dollarsHeld > 0n && !isNative(coinOf(firstReady)) && stage !== "sent" ? (
        <p className={BODY}>{W.readyLine(firstReady.name, readyInWords(firstReady))}</p>
      ) : null}
      {/* On the first screen the ready amount is the headline, and this is the way back to its second step. */}
      {stage === "base" && firstReady ? (
        <button type="button" onClick={() => continueWith(firstReady)} className={SECONDARY_BUTTON}>
          {W.continueReady(firstReady.name)}
        </button>
      ) : null}
    </section>
  );

  if (stage === "gathering") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <Working says={inGifts.length > 0 ? W.gathering : W.readying} />
      </div>
    );
  }

  // A payout money left for, not finished or not yet seen finished: its own card, as after the press that sent it.
  if (stage === "base" && owedPayout && putAway !== owedPayout.reference) {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <MobilePayoutCard payout={owedPayout} onChanged={refresh} onBack={() => setPutAway(owedPayout.reference)} />
      </div>
    );
  }

  if (stage === "base") {
    const led = holdings === null || figureUnknown ? undefined : heldLed();
    // Only when the coin's quote did not answer: while it is being read the figure's place is held, and once it has
    // answered the coin is in "Yours", with the line under it saying what is ready.
    const cardBranch = holdings !== null && dollarsHeld === 0n && firstReady !== undefined && coinWorth.state !== "reading";
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {/* The balance, on the page ground and not in a box, as Home sets it: the person's currency leads with "about"
            before it, and the exact dollars held are the caption (the founder, 29 Sep 2026), since they are what
            leaves. When the dollar coins are empty and something is ready for the card service, that card leads. */}
        {cardBranch ? (
          moneyCard
        ) : (
          <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
            <p className={CARD_LABEL}>{U.yours}</p>
            {led ? (
              <LedFigure amount={led} className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": led.lead.length } as CSSProperties} />
            ) : (
              <p className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": 1 } as CSSProperties}>
                …
              </p>
            )}
            {led && !led.converted && money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
            {firstReady && dollarsHeld > 0n ? (
              <>
                <p className={HELP}>{W.readyLine(firstReady.name, readyInWords(firstReady))}</p>
                <button type="button" onClick={() => continueWith(firstReady)} className={`${SMALL_BUTTON} self-start`}>
                  {W.continueReady(firstReady.name)}
                </button>
              </>
            ) : null}
            {/* The gifts' part is in the figure above, and it is taken into the account first (D208). */}
            {giftsHold > 0n ? <p className={HELP}>{W.inYourGifts(formatAusd(giftsHold))}</p> : null}
            {alert("gather")}
          </section>
        )}
        {/* "Spend or withdraw" (D270, renamed 29 Sep 2026): the uses for the number's country, one card each, the first
            in the sun. Under the title, the ways shown here in one sentence and in their order, never one that is not
            offered; then the country that filters and orders them, and "change" answers it; when the two signals
            disagree, the question is open from the start and nothing is ordered until it is answered (R1). */}
        <div className="flex flex-col gap-[var(--space-xs)]">
          {heading}
          {usesSentence(uses) ? <p className={BODY}>{usesSentence(uses)}</p> : null}
          {/* "change" is the same key as Me's (the founder did not see it as a link in the label, 27 Sep 2026). */}
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-sm)]">
            <p className={CARD_LABEL}>{countryNow ? U.forWhereYouLive(countryInWords(countryNow) ?? countryNow.toUpperCase()) : U.forYourNumber}</p>
            <button type="button" onClick={() => setPicking((was) => !was)} aria-expanded={asking} className={SMALL_BUTTON}>
              {U.change}
            </button>
          </div>
        </div>
        {asking ? (
          <section className={CARD}>
            {/* The same list as Me (D274): every country where at least one way out works, kept on the account. */}
            <CountryPicker
              id="use-where-you-live"
              label={L.question}
              value={countryNow}
              onChange={(code) => {
                setPicking(false);
                void saveCountry(code);
              }}
            />
          </section>
        ) : null}
        {uses.length === 0 ? <p className={BODY}>{U.nothingHere}</p> : null}
        {/* Neither the bank nor the card reaches this country: said here, with the uses that do stay under it. */}
        {where !== null && countryNow && !uses.includes("bank") && !uses.includes("card") && !uses.includes("mobile") ? <p className={BODY}>{U.noWayOutThere(countryInWords(countryNow) ?? countryNow.toUpperCase())}</p> : null}
        {uses.map((use, index) => {
          const words = U[use];
          const way = use === "bank" ? WAY_OUT_EURO : use === "card" ? WAY_OUT_CARD : undefined;
          const net = way ? netOf(way) : undefined;
          // The phone's figure is the balance itself, in the person's currency: what the top-up is taken from, since what
          // reaches the phone is priced once the number and the amount are known (D238).
          const figure = way ? (net ? figureIn(net.net, net.currency) : undefined) : holdings === null ? undefined : (money.figure(dollarsHeld)?.text ?? formatAusd(dollarsHeld));
          const act = () => (way ? start(way) : use === "giftcard" ? void startGiftCard() : use === "mobile" ? void startMobile() : void startPhone());
          // What stays in the open, one sentence, and the four lines folded under "How it works" (the founder, 4 Oct
          // 2026): what the person gets, in how long, what it costs, what it takes. Mobile money's name the operators
          // Switch pays in the country and the time it publishes for them; the bank's follow the method its service
          // publishes for this country; a time nobody published is not a line.
          const operators = use === "mobile" && mobileOffered ? operatorsInWords(mobileOffered.operators.map((operator) => operator.name)) : "";
          const delay = use === "mobile" && mobileOffered ? delayInWords(mobileOffered.settlement) : "";
          const bank = use === "bank" ? U.bankBy(bankPays?.method ?? "SEPA", bankPays?.currency ?? "EUR") : null;
          const line = use === "mobile" ? (mobileOffered ? U.mobileLine(operators, delay) : "") : use === "bank" ? (bank?.line ?? "") : U[use].line;
          const how: ReadonlyArray<readonly [string, string]> =
            use === "mobile"
              ? mobileOffered
                ? [[U.how.get, U.mobileGet(operators)], [U.how.time, U.mobileTime(delay)], [U.how.cost, U.mobile.cost], [U.how.need, U.mobile.need]]
                : []
              : use === "bank"
                ? [[U.how.get, bank?.get ?? ""], [U.how.time, bank?.time ?? ""], [U.how.cost, feeUnderItsName(WAY_OUT_EURO)], [U.how.need, U.bank.need]]
                : use === "card"
                  ? [[U.how.get, U.card.get], [U.how.cost, feeUnderItsName(WAY_OUT_CARD)], [U.how.need, U.card.need]]
                  : [[U.how.get, U[use].get], [U.how.time, U[use].time], [U.how.cost, U[use].cost], [U.how.need, U[use].need]];
          return (
            <section key={use} className={CARD}>
              <div className="flex items-baseline justify-between gap-[var(--space-md)]">
                <h3 className={CARD_TITLE}>{words.name}</h3>
                {figure ? <p className={`${CARD_TITLE} whitespace-nowrap tabular-nums`}>{figure}</p> : null}
              </div>
              <p className={CARD_LABEL}>{words.nature}</p>
              {/* The bank's sentence follows the method its service publishes for this country, and the card says its
                  smallest payout before anything is changed for it (the audit of 1 Oct 2026). */}
              {/* One sentence in the open, and four lines folded under "How it works": a fold holds lines, never
                  paragraphs (the founder, 4 Oct 2026). */}
              {line ? <p className={BODY}>{line}</p> : null}
              {how.length > 0 ? (
                <details className="said-fold" data-how-it-works={use}>
                  <summary className="said-fold-name">
                    {KIT.how}
                    <FoldChevron />
                  </summary>
                  <div className="said-fold-body">
                    <Lines quiet rows={how} />
                  </div>
                </details>
              ) : null}
              {use === "card" && cardSmallest ? <p className={HELP}>{U.cardFrom(figureIn(cardSmallest.amount, cardSmallest.currency))}</p> : null}
              {/* The bank service says its smallest payout too, before anything is changed for it (the audit of 9 Oct 2026). */}
              {use === "bank" && bankSmallest ? <p className={HELP} data-bank-from>{U.bankFrom(figureIn(bankSmallest.amount, bankSmallest.currency))}</p> : null}
              {/* Mobile money says its smallest payout too, in the country's money, before the form is opened. */}
              {use === "mobile" && mobileOffered ? <p className={HELP} data-mobile-from>{U.mobileFrom(localInWords(mobileOffered.leastLocal, mobileOffered.currency))}</p> : null}
              <button type="button" onClick={act} disabled={holdings === null || changeable === 0n} className={inTheSun(use, index, eurosHeld) ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                {words.action}
              </button>
              {holdings !== null && changeable === 0n ? <p className={HELP}>{W.nothingToSend}</p> : null}
            </section>
          );
        })}
        {/* The two gestures left, in one line (the README's seventh rule): keep it here, or send it to another account. */}
        <p className={HELP}>{U.keepHere}</p>
        <button type="button" onClick={() => void startOwn()} disabled={holdings === null || dollarsHeld === 0n || busy} className={`${SMALL_BUTTON} self-start`}>
          {W.anotherAccount}
        </button>
        {/* The published figures and where each was read, for whoever asks: one press away, under everything. */}
        <details className="said-fold">
          <summary className="said-fold-name">
            {W.whereFrom}
            <FoldChevron />
          </summary>
          {/* A line each (the founder, 4 Oct 2026: a fold holds lines, never paragraphs): what the service keeps and
              the day that figure was read on its own pages (the first day `read` names: a second one is about its
              countries), then the rate's source and its day. */}
          <div className="said-fold-body">
            <Lines quiet rows={[...WAYS_OUT.map((way) => [way.name, W.keptAndRead(feeUnderItsName(way), way.read.split(" (")[0])] as const), ...(money.rates ? [[W.rate, W.rateOf(RATE_SOURCE.short, rateDateInWords(money.rates.date))] as const] : [])]} />
          </div>
        </details>
      </div>
    );
  }

  if (stage === "giftcard") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {moneyCard}
        <GiftCardOut country={countryNow} rates={money.rates} countryName={countryNow ? (countryInWords(countryNow) ?? countryNow.toUpperCase()) : null} ausd={ausd} ensureSigner={ensureSigner} onSessionClosed={closeSession} onChanged={refresh} onBack={() => { setProblem(null); setStage("base"); }} />
      </div>
    );
  }

  if (stage === "mobile" && mobileOffered && mobilePayable) {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <MobileMoneyOut offer={mobileOffered} payable={mobilePayable} ensureSigner={ensureSigner} onSessionClosed={closeSession} onChanged={refresh} onBack={() => { setProblem(null); setStage("base"); }} />
      </div>
    );
  }

  if (stage === "phone") {
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        {heading}
        {moneyCard}
        <PhoneTopUp rates={money.rates} ausd={ausd} ensureSigner={ensureSigner} onSessionClosed={closeSession} onChanged={refresh} onBack={() => { setProblem(null); setStage("base"); }} />
      </div>
    );
  }

  if ((stage === "amount" || stage === "review" || stage === "getting") && chosen) {
    const bank = chosen.coin === USDC.address;
    const orderNumber = quote ? floorToOrder(quote.shown) : "";
    const applied = quote?.payout ? feeApplied(quote.payout.worth, chosen.fee) : undefined;
    // What the bank account receives, when the service publishes it: the figure, and the line that says what it took.
    const payout = quote?.payout && applied ? { net: `${applied.net.toFixed(2)} ${quote.payout.currency}`, line: W.reviewTurns(chosen.name, `${quote.payout.worth.toFixed(2)} ${quote.payout.currency}`, `${applied.fee.toFixed(2)} ${quote.payout.currency}`) } : null;
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
                <>
                  <p role="alert" className={`${HELP} font-medium`}>
                    {changing.refusal}
                  </p>
                  {/* The way out of the refusal is a button under it, never a link inside its sentence (rule 1). */}
                  {changing.refusal === W.refusals.tooMuch(maxToChange) ? (
                    <button type="button" onClick={() => setDollars(maxToChange)} className={`${SMALL_BUTTON} self-start`}>
                      {W.refusals.sendAllOfIt}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className={HELP}>{W.upTo(maxToChange, money.about(ausd))}</p>
              )}
              {alert("amount")}
              <div className="flex flex-wrap gap-[var(--tap-gap)]">
                <Button doing={busy ? W.asking : null} step={WAITS.amount} waiting={changing.units === undefined} onPress={() => void askPrice()}>
                  {W.seeWhatYouWillGet}
                </Button>
                <button type="button" onClick={() => { setStage("base"); setChosen(null); setProblem(null); }} className={SMALL_BUTTON}>
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
                  {/* Figures side by side, each under a label of four words (rule 5): on the bank rail what will be ready
                      to send and what the bank account receives; on the card rail the money spent and the quantity. */}
                  <div className="decide-two" data-review-figures>
                    {bank ? null : (
                      <div>
                        <p className="decide-amount">{formatAusd(changing.units ?? 0n)}</p>
                        <p className={`${CARD_LABEL} decide-label`}>{W.reviewOfYours}</p>
                      </div>
                    )}
                    <div>
                      <p className="decide-amount">{bank ? `$${orderNumber}` : orderNumber}</p>
                      <p className={`${CARD_LABEL} decide-label`}>{W.reviewToSend}</p>
                    </div>
                    {bank && payout ? (
                      <div>
                        <p className="decide-amount">{payout.net}</p>
                        <p className={`${CARD_LABEL} decide-label`}>{W.reviewOnBank}</p>
                      </div>
                    ) : null}
                  </div>
                  {bank ? null : <p className={BODY}>{W.reviewQuantity(chosen.name)}</p>}
                  {payout ? <p className={BODY}>{payout.line}</p> : bank ? null : <p className={BODY}>{W.reviewCard(chosen.name)}</p>}
                  {bank ? <p className={BODY}>{W.nothingLeavesYet}</p> : null}
                  {quote.kept ? <p className={HELP}>{W.reviewKept(quote.kept)}</p> : null}
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
                  <Button doing={busy ? W.asking : null} onPress={() => void askPrice(true)}>
                    {W.failures.seeTheNewPrice}
                  </Button>
                ) : problem?.where === "review" && problem.code === "QUOTE_STALE" ? (
                  <Button doing={busy ? W.asking : null} onPress={() => void askPrice(true)}>
                    {W.failures.tryAgain}
                  </Button>
                ) : (
                  <Button doing={stage === "getting" ? W.gettingReady(bank ? `$${orderNumber}` : formatAusd(changing.units ?? 0n)) : null} waiting={busy && stage !== "getting"} onPress={() => void getReady()}>
                    {W.getReady(bank ? `$${orderNumber}` : formatAusd(changing.units ?? 0n))}
                  </Button>
                )}
                {stage !== "getting" ? (
                  <button type="button" onClick={() => { setStage("amount"); setQuote(null); setProblem(null); }} className={SMALL_BUTTON}>
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
        <Said className={HELP} text={W.exactQuantity(chosen.name, amount.exact)} />
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
            {sent.exact ? <Said className={HELP} text={W.exactQuantity(sent.name, sent.exact)} /> : null}
            <p className={HELP}>{W.sentPays(chosen.name, chosen.pays, !isNative(coin))}</p>
            {sent.cost ? <p className={HELP}>{W.sendingCost(sent.cost.dollars, sent.cost.underACent)}</p> : null}
            <a href={wayOutPage(chosen)} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
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
                {/* What to do on the service's page, which opens with nothing chosen; nothing to say once it arrives
                    told what is sold and how much (`wayOutFillsIn`). */}
                {wayOutFillsIn(chosen) ? null : <p className={BODY}>{W.onTheirPage(chosen.name, chosen.sells, ready.number, chosen === WAY_OUT_EURO)}</p>}
                {exactLine}
                <p className={BODY}>{W.giveThisCode(chosen.name)}</p>
                {/* Whole and wrapping, so it can be compared with what was pasted on the service's page (decision 9). */}
                <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
                {/* One gesture (the audit of 1 Oct 2026): the code is copied by the press that opens the service's page,
                    so nobody arrives there without it. Steps 2 and 3 stand on one screen, so the accent marks the step
                    the screen is waiting for: this one while nothing has been pasted, sending once the code is there. */}
                <a href={wayOutPage(chosen, { account: address, units: ready.units })} target="_blank" rel="noopener noreferrer" onClick={copyCode} className={sendable ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
                  {W.copyAndOpen(chosen.name)}
                </a>
                {copied === "yes" ? (
                  <p role="status" className={HELP}>
                    {W.copied}
                  </p>
                ) : null}
                {copied === "refused" ? <p className={HELP}>{W.copyRefused}</p> : null}
                {/* What opens and what to come back with stay in the open, a line each: they are what the person does
                    next. The rest is folded (rule 4): the question the service asks, and what stops a person at the
                    service itself, said here where its page opens and not on the card that decides (D124): the
                    identity check, and the name the account or the card must carry. */}
                {W.comeBack(chosen.name).map((line) => (
                  <p key={line} className={HELP}>
                    {line}
                  </p>
                ))}
                <Said whole className={HELP} text={[W.itIsYours(chosen.name), ...chosen.conditions, isNative(coin) ? W.sixHours(chosen.name) : ""].filter(Boolean).join(" ")} />
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
                <Link href="/" className={SMALL_BUTTON}>
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
                  <Button doing={stage === "sending" ? W.sending(amount!.lead, chosen.name) : null} waiting={busy && stage !== "sending"} onPress={() => void send()}>
                    {W.sendButton}
                  </Button>
                  {stage !== "sending" ? (
                    <button type="button" onClick={() => { setStage("ready"); setProblem(null); }} className={SMALL_BUTTON}>
                      {W.notNow}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <WaitLine>{W.oneMoment}</WaitLine>
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
                  <>
                    <p role="alert" className={`${HELP} font-medium`}>
                      {ownSending.refusal}
                    </p>
                    {ownSending.refusal === W.refusals.tooMuch(ownMax) ? (
                      <button type="button" onClick={() => setOwnAmount(ownMax)} className={`${SMALL_BUTTON} self-start`}>
                        {W.refusals.sendAllOfIt}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className={HELP}>{W.upTo(ownMax, money.about(held(ownCoin)))}</p>
                )}
                <div className="flex flex-wrap gap-[var(--tap-gap)]">
                  <button type="button" onClick={() => setStage("ownConfirm")} disabled={busy || ownCode.trim() === "" || ownProblem !== null || ownSending.units === undefined} className={PRIMARY_BUTTON}>
                    {W.own.send(ownNumber)}
                  </button>
                  {ownCode.trim() === "" ? <p className={HELP}>{W.own.pasteFirst}</p> : null}
                  <button type="button" onClick={() => { setStage("base"); setProblem(null); }} className={SMALL_BUTTON}>
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
                  <Button doing={stage === "ownSending" ? W.sending(ownNumber, "your other account") : null} waiting={busy && stage !== "ownSending"} onPress={() => void sendOwn()}>
                    {W.sendButton}
                  </Button>
                  {stage !== "ownSending" ? (
                    <button type="button" onClick={() => { setStage("own"); setProblem(null); }} className={SMALL_BUTTON}>
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
