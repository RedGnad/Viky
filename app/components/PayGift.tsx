"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { linkOfMade, loadEarnedInGifts, prepareGift, submitGift, takeFromGifts, type CreatedGift } from "@/src/client/gift";
import { totalEarned, type EarnedInGift } from "@/src/earned-shape";
import { prepareCertificateGift, submitCertificateGift } from "@/src/client/certificate-gift";
import { prepareMilestoneGift, submitMilestoneGift } from "@/src/client/milestone";
import { attemptFor, forgetsAttempt, GIFT_ATTEMPT_KEY, isCertificateRequest, isMilestoneRequest } from "@/src/gift-attempt";
import { changeArrivedUsdc } from "@/src/client/convert";
import { fundingQuote } from "@/src/client/funding-quote";
import { readAusdBalance, readCoinBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { USDC } from "@/src/coins";
import { usdcRouterAddress } from "@/src/usdc-router";
import { conditionById } from "@/src/conditions";
import { GOAL_TYPE_DUOLINGO_COURSE_XP } from "@/src/gift-terms";
import { cadenceOf, certificateById, milestoneById } from "@/src/milestone-conditions";
import { twoDecimalsDown } from "@/src/exit-steps";
import { afterPaying, refusalAfterPaying } from "@/src/after-paying";
import { nextFundingStep, pausedAfterFailure, POLL_MS } from "@/src/funding-step";
import { askToPay } from "@/src/card-ask";
import { useCardAsk } from "@/src/client/card-ask";
import { eurosToBuyOn } from "@/src/gift-amount";
import { draftToTerms, isComplete, type GiftDraft } from "@/src/gift-draft";
import { cardDraft, clearedCardDraft, startingCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { tidyGiftName } from "@/src/gift-names";
import { rememberGiftLink } from "@/src/gift-link-memory";
import { markJustMade } from "@/src/just-made";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { forgetPendingGift, peekPendingGift, savePendingGift, type PendingGift } from "@/src/pending-gift";
import { wayInAsksNothing, wayInPage, waysIn, WAY_IN_USDC, type WayIn } from "@/src/rails";
import { JudgeCode } from "../kit/offer/JudgeCode";
import { CardNotOffered, CardTermsLine } from "../kit/offer/CardTerms";
import { SwapperSheet } from "../kit/offer/SwapperSheet";
import { RampnowSheet } from "../kit/offer/RampnowSheet";
import { RampnowWaiting } from "../kit/offer/RampnowWaiting";
import { frameKeepsSignIn, rampnowFrameOn } from "@/src/rampnow-frame";
import { clearRampnowPending, noteRampnowPending, payAtRampnowBeside, readRampnowPending, useRampnowPending } from "@/src/client/rampnow-pending";
import { noteInRampnowJournal } from "@/src/client/rampnow-journal";
import { dollarsSaidIn, giftAsTyped, heldIn, moneyIn, moneyTypedIn } from "@/src/pay-sum";
import { Lines } from "../kit/Lines";
import { Step, Steps } from "../kit/Steps";
import { Said } from "../kit/Said";
import { whereTheRailsServe } from "@/src/client/rails";
import { CASH_OUT as C, FUND as W, MILESTONE_FUND as M, OFFER, OFFER as O, PAY as P } from "@/src/sentences";
import { FieldRefusal } from "../kit/FieldRefusal";
import { Shell } from "../kit/Shell";
import { Working } from "../kit/Working";
import { AccountPanel } from "./AccountPanel";
import { DoorNotice } from "../kit/AccountDoor";
import { BODY, CARD, CARD_LABEL, CARD_TITLE, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "./ui";
import { WaitLine } from "../kit/Waiting";

/**
 * Paying for the gift that was filled in on the card (the product vision of 19 Sep 2026, section 5, surface Pay).
 *
 * The card on Home says what the gift is; this says what it costs and makes it. The account and the passkey are asked
 * here and nowhere earlier, which is the vision's rule and Apple's own guidance on postponing setup. Nothing else
 * about the money changed on 19 Sep: the ways in, the watching of the account, the swap, the one signature and the
 * link at the end are the code that has run since D33, D42, D74 and D87, moved out of the assistant that used to ask
 * the four questions above them.
 *
 * The terms are read from the device, where the card wrote them (D74). A gift whose four cases are not filled has
 * nothing to pay for, and this screen says so rather than asking the questions again: they are asked on the card.
 */

/** Where a gift just made was kept for the screen that followed, until 8 Oct 2026: read once more, to leave that screen. */
const MADE_KEY = "viky.giftMade";

type Step = "pay" | "account" | "paying" | "done";
const ALL_STEPS: readonly Step[] = ["pay", "account", "paying", "done"];
type Phase = "waiting" | "taking" | "converting" | "giving" | "short" | "failed";

function readSession<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A tab that refuses storage keeps what it needs in memory for as long as it stays open.
  }
}

const never = () => () => {};
const inBrowser = () => true;
const onServer = () => false;
/**
 * What a refusal to make the gift says, once the money is in the account (src/after-paying.ts): the route's own typed
 * sentence, the passkey's own, or that the gift was not made and the money is in the account. Never a library's words,
 * and never "nothing was taken" of somebody whose card was (the founder, 5 Oct 2026).
 */
function readable(error: unknown): string {
  return refusalAfterPaying(error, W.failures.notMade);
}

/**
 * The gift, small, under the wait (the mockup paying.html): the same paper, the same label, the same name, and one
 * line of what it is. It is there so the thing being made never leaves the screen while it is being made.
 */
function MiniGift({ recipient, what, line }: Readonly<{ recipient: string; what: string; line: string }>) {
  return (
    <section className="on-paper w-full rounded-[var(--radius-control)] p-[var(--space-lg)]">
      <p className={CARD_LABEL}>{OFFER.yourGift}</p>
      <p className={CARD_TITLE}>{OFFER.forName(recipient)}</p>
      <p className={`${HELP} text-[var(--on-surface-body)]`} title={what}>
        {line}
      </p>
    </section>
  );
}

export function PayGift() {
  const { address, signIn, ensureSigner, status: accountStatus } = useAccount();
  // Money moves on this screen, so the session stays open thirty minutes rather than ten (decision 2, 17 Sep 2026).
  useMoneySession();
  const router = useRouter();
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const params = useSearchParams();
  const asked = params.get("step");
  // Whether the pay press already opened the partner's page (D296): only when that page arrives filled in.
  const [partnerOpened, setPartnerOpened] = useState(params.get("opened") === "1" || params.get("card") === "1");
  const step: Step = ALL_STEPS.includes(asked as Step) ? (asked as Step) : "pay";

  // The gift is read from the same store the card writes (src/card-draft.ts): one gift, in one place, on the device.
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, startingCardDraft);
  /** The gift this screen made a moment ago: its page is where the person is being taken, and nothing is paid twice. */
  const [madeGift, setMadeGift] = useState<string | null>(null);
  const [kept, setKept] = useState<PendingGift | undefined>(() => (typeof window === "undefined" ? undefined : peekPendingGift()));
  const [balance, setBalance] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  /**
   * What the person's gifts have already paid them and still hold (D208): theirs to pay with, as Home counts it, and
   * taken into the account before the gift is made (the founder, 4 Oct 2026). Null until read, once, when the screen
   * opens; empty once taken, and after a taking that was refused, which is said and not tried again by itself.
   */
  const [earned, setEarned] = useState<readonly EarnedInGift[] | null>(null);
  /** What a payment that fell short brought, in the coin's units: said in the money the gift was typed in. */
  const [arrived, setArrived] = useState<bigint | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemCode, setProblemCode] = useState<string | null>(null);
  /**
   * What is said under the ring while the money is in the account and a call did not answer, or answered "not now"
   * (the founder, 5 Oct 2026): the screen stays as it is and asks again, and this line says what is known.
   */
  const [asksAgain, setAsksAgain] = useState<string | null>(null);
  /** When a creation last went unanswered: it is asked again after a pause, never at once (src/funding-step.ts). */
  const unansweredAtMs = useRef<number | null>(null);
  /**
   * A creation was sent and nothing is known of what it did. It is sent again, the same signed request, whatever the
   * account holds by then: if the first one went through, the money is gone from the account, and a screen that
   * went back to waiting for a payment would ask for a second one.
   */
  const awaitingCreation = useRef(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [copyRefused, setCopyRefused] = useState<"code" | "link" | null>(null);
  const [keptOnDevice, setKeptOnDevice] = useState(true);
  const working = useRef(false);
  /** When the last conversion failed, so the watch leaves it alone for a pause rather than trying again at once. */
  const failedAtMs = useRef<number | null>(null);
  const [hadAccount, setHadAccount] = useState(false);
  /** The way in the funder pressed, so the wait tells them what to set on the page they actually opened (D101). */
  /** The way in the kept payment names, which is the one the sheet on the card opened (D101). */
  const chosenWay: WayIn | null = null;
  if (address && !hadAccount) setHadAccount(true);

  const wayIn: WayIn = chosenWay ?? waysIn().find((entry) => entry.name === kept?.wayIn) ?? waysIn()[0];
  /** The card paid inside Viky (`SwapperSheet`), open over this screen: at once when the pay press sent the person here for it. */
  const [cardOpen, setCardOpen] = useState(params.get("card") === "1");
  /**
   * A card payment that may have left through Rampnow and has not arrived (src/client/rampnow-pending.ts): the screen
   * then says where the payment is, and its main action leads back to it. One gift, one payment (the founder, 3 Oct
   * 2026): a new payment starts only after the person says they have not paid.
   */
  const rampnowPending = useRampnowPending(address);
  /**
   * Rampnow in a frame (`RampnowSheet`), open over this screen: on a new payment, or on one already started, to finish
   * it. Nothing closes it but this screen: the money arriving, or one of the ways out under the frame.
   */
  const [frame, setFrame] = useState<Readonly<{ mode: "new" } | { mode: "finish"; orderUid: string | null }> | null>(null);
  /**
   * What the address asked for on arrival, answered once, when the account and what this device waits for are known:
   * the pay press opens the frame on a new payment only if none is waited for. Arriving again at the same address
   * never starts a second one: the screen then says what is waited for, or asks.
   */
  /**
   * Where Rampnow's frame can keep the person signed in, it is the way. Where it cannot (`frameKeepsSignIn`,
   * src/rampnow-frame.ts: Safari's engine before 18.4 and from 18.5 to 26.1), the person never sees the frame:
   * Rampnow's page opens beside, and the payment is followed as one started from a tab (the founder, 4 Oct 2026).
   */
  const rampnowBeside = browser && rampnowFrameOn() && !frameKeepsSignIn(navigator.userAgent);
  const [arrival, setArrival] = useState(params.get("rampnow") === "1");
  if (arrival && browser && address) {
    setArrival(false);
    if (!rampnowPending && !rampnowBeside) setFrame({ mode: "new" });
  }
  /** The frame said the payment failed and nothing left: said once, above the button that pays. */
  const [rampnowFailed, setRampnowFailed] = useState(false);
  /** Whether the card is offered to this payer (src/card-rail.ts): not in a country its providers' terms exclude. */
  const [card, setCard] = useState<Readonly<{ offered: boolean; country: string | null }> | null>(null);
  useEffect(() => {
    let live = true;
    whereTheRailsServe()
      .then((answer) => {
        if (live) setCard(answer.card ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [address]);
  const cardClosed = card?.offered === false;
  const money = useDisplayCurrency(address);
  const condition = conditionById(draft.conditionId);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const cadence = milestone && draft.cadence ? cadenceOf(milestone, draft.cadence) : undefined;
  const ready = isComplete(draft);
  const units = ready ? dollarsToUnits(draft.dollars) : null;
  // What a card is asked for what is left to pay (src/client/card-ask.ts): the amount the pay press was made on when
  // this is the wait that follows it, else Rampnow's own quote in the money the gift was typed in when it gives one,
  // else the rule, in the currency the service's page is opened in. What is left is not known until the account has
  // been read, and what the person's gifts hold for them: after a payment that fell short, those are taken already.
  const leftToPay = units === null || balance === null ? 0n : phase === "short" ? units - balance : earned === null ? 0n : units - balance - totalEarned(earned);
  const cardShort = leftToPay > 0n ? leftToPay : 0n;
  /** The euros the rule asks for it, never under the service's floor: a wait must be payable. */
  const ruleEuros = cardShort > 0n ? eurosToBuyOn(cardShort, wayIn, money.rates?.usdPerEur) : undefined;
  const askMoney = moneyTypedIn(draft.typedAmount !== undefined ? draft : { typedAmount: kept?.typedAmount, typedIn: kept?.typedIn }, money.rates);
  const cardAsked = useCardAsk({ on: step === "paying" && Boolean(address) && cardShort > 0n, offer: { way: wayIn, euros: ruleEuros, atFloor: false }, short: cardShort, code: askMoney, usdPerEur: money.rates?.usdPerEur, kept: true });
  /** While Rampnow is asked its price, no amount is named and no page of it is opened. */
  const askAwaited = cardAsked.state === "asking";
  const toPay = askToPay(cardAsked);
  const toPaySaid = toPay ? moneyIn(toPay.amount, toPay.currency) : undefined;
  const days = Number(draft.days);
  const target = Number(draft.target);
  const recipient = tidyGiftName(draft.recipientName);
  const funder = tidyGiftName(draft.funderName);
  const subject = draft.subject.trim();

  const go = (next: Step) => {
    setProblem(null);
    setProblemCode(null);
    window.history.pushState(null, "", `?step=${next}`);
    window.scrollTo(0, 0);
  };
  const replace = (next: Step) => window.history.replaceState(null, "", `?step=${next}`);

  const refresh = useCallback(async () => {
    if (!address) return null;
    // USDC is read only where the step that changes it exists (src/usdc-router.ts): without it nothing could be done
    // with what was read, and the screen asks the chain nothing more than it did.
    const [held, arriving, usdc] = await Promise.all([readAusdBalance(address), readMonBalance(address), usdcRouterAddress() ? readCoinBalance(USDC, address) : undefined]);
    setBalance(held);
    return { held, arriving, usdc };
  }, [address]);

  useEffect(() => {
    // Past the synchronous body of the effect, so nothing this reads sets state while React is still rendering.
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void loadEarnedInGifts().then((gifts) => {
      if (live) setEarned(gifts);
    });
    return () => {
      live = false;
    };
  }, [address]);

  // Where the screen belongs: a gift already made, a payment already running, or nothing to pay for at all.
  useEffect(() => {
    if (!browser) return;
    // The screen of a gift just made is the gift's own page since 8 Oct 2026: an address kept from before leads there.
    if (step === "done") {
      const before = readSession<{ giftId?: string }>(MADE_KEY)?.giftId;
      if (before && /^\d{1,78}$/.test(before)) router.replace(`/g/${before}`);
      else replace("pay");
      return;
    }
    if (step === "account" && address) replace("pay");
    if (!ready && madeGift === null) replace("pay");
    // A payment was started for this gift before the page went: the wait is where this person was (D74).
    if (step === "pay" && address && ready && kept?.wayIn && phase === "waiting" && madeGift === null) replace("paying");
  }, [browser, step, madeGift, address, ready, kept, phase, router]);

  const give = useCallback(async () => {
    // Opens the passkey here if the page was reloaded or came back from the card page: the signature is the first
    // moment one is needed, and the account is the one the server's cookie already names.
    const account = await ensureSigner();
    if (!condition || units === null || !Number.isInteger(days)) throw new Error(W.failures.other);
    // Signed once for these terms and sent again as it is on every retry, so the server finds the same creation and
    // never pays for the gift twice (D87). A milestone's target and starting reading are part of its terms.
    const terms = {
      account: account.address,
      username: subject,
      recipientName: recipient,
      funderName: funder,
      // A gift counted on one course is its own goal on the contract (U1), so the course is part of the terms signed.
      goalType: milestone ? (cadence?.goalType ?? 0) : draft.course ? GOAL_TYPE_DUOLINGO_COURSE_XP : (condition.goalType ?? 0),
      course: milestone ? "" : draft.course,
      dailyTarget: milestone || certificate ? 0 : target,
      durationDays: days,
      amount: units.toString(),
      ...(milestone ? { target, standing: draft.standing ?? 0 } : {}),
      // A certificate's target, and the scale a grade is typed on, are its terms too (the founder, 28 Sep 2026).
      ...(certificate ? { target, scale: draft.scale ?? "" } : {}),
    };
    let request = attemptFor(readSession(GIFT_ATTEMPT_KEY), terms);
    if (!request && certificate) {
      request = await prepareCertificateGift({
        account,
        certificate,
        personName: subject,
        target,
        durationDays: days,
        amount: units,
        recipientName: recipient,
        funderName: funder,
        // The course or university the gift is made on (C3, D165), and the scale a grade is typed on before the
        // university's own is pinned: without them the route could not rebuild the terms the funder signed.
        ...(draft.course ? { course: draft.course } : {}),
        ...(draft.scale ? { scale: draft.scale } : {}),
      });
    }
    if (!request && milestone) {
      if (!cadence || draft.standing === undefined || !draft.standingReadAt) throw new Error(W.failures.other);
      request = await prepareMilestoneGift({
        account,
        milestone,
        cadenceGoalType: cadence.goalType,
        cadence: cadence.id,
        username: terms.username,
        standing: draft.standing,
        standingReadAt: draft.standingReadAt,
        target,
        durationDays: days,
        amount: units,
        recipientName: recipient,
        funderName: funder,
      });
    }
    if (!request) {
      if (terms.goalType === 0) throw new Error(W.failures.other);
      request = await prepareGift({
        account,
        duolingoUsername: terms.username || undefined,
        course: terms.course || undefined,
        recipientName: recipient,
        funderName: funder,
        goalType: terms.goalType,
        dailyTarget: target,
        durationDays: days,
        amount: units,
      });
    }
    writeSession(GIFT_ATTEMPT_KEY, { terms, request });
    let result: CreatedGift;
    try {
      // Three shapes of gift, three creations, and the attempt kept is whichever one was signed (D87).
      result = isCertificateRequest(request)
        ? await submitCertificateGift(request)
        : isMilestoneRequest(request)
          ? await submitMilestoneGift(request)
          : await submitGift(request);
    } catch (error) {
      if (error instanceof ApiError && forgetsAttempt(error.code)) writeSession(GIFT_ATTEMPT_KEY, null);
      throw error;
    }
    writeSession(GIFT_ATTEMPT_KEY, null);
    // The gift's link: the server's answer, or on the second version of the contracts the one this browser makes from
    // the funder's own signature, since the server was never given what opens the gift (src/client/v2.ts).
    const claimUrl = await linkOfMade(account, result, request.salt);
    // This device keeps the link: the gift's page, which is the screen that follows, shows it to be sent.
    rememberGiftLink(result.giftId, claimUrl);
    // Made, so nothing is left on this device to pick up or to fill in again (D74).
    forgetPendingGift();
    clearedCardDraft();
    setKept(undefined);
    setMadeGift(result.giftId);
    // The character at the head of that page answers this payment, once (src/just-made.ts).
    markJustMade(result.giftId);
    // The gift's own page is the screen after paying (the UI pass of 8 Oct 2026, screen 3): its card says "Send it",
    // with the link under it. A screen of its own said the amount and the condition a second time.
    router.replace(`/g/${result.giftId}`);
  }, [router, ensureSigner, condition, milestone, certificate, cadence, draft.course, draft.standing, draft.standingReadAt, subject, target, days, units, recipient, funder]);

  // While paying: watch the account, turn what arrived into what a gift holds, then make the gift.
  useEffect(() => {
    if (step !== "paying" || !address || units === null || phase === "short" || phase === "failed") return;
    const wanted = units;
    let live = true;
    const look = async () => {
      if (!live || working.current) return;
      try {
        // Making the gift, and what its failure means once the money is in the account (src/after-paying.ts).
        const make = async () => {
          working.current = true;
          setPhase("giving");
          try {
            await give();
            awaitingCreation.current = false;
            unansweredAtMs.current = null;
            setAsksAgain(null);
          } catch (error) {
            const after = afterPaying(error, W.arrived.notAnswered);
            if (after.keep) {
              // It did not answer, or the gift is being made: the screen stays, says so, and asks again after a
              // pause. The signed request is kept and sent again as it is, which cannot pay twice (D87).
              awaitingCreation.current = true;
              unansweredAtMs.current = Date.now();
              setAsksAgain(after.says);
            } else {
              // A refusal to make the gift is said once, with a way to try again: retrying by itself every few
              // seconds would repeat a refusal nobody has read (F11).
              awaitingCreation.current = false;
              setAsksAgain(null);
              setProblem(readable(error));
              setProblemCode(error instanceof ApiError ? error.code : null);
              setPhase("failed");
            }
          }
          working.current = false;
        };
        if (awaitingCreation.current) {
          if (!pausedAfterFailure(unansweredAtMs.current, Date.now())) await make();
          return;
        }
        const read = await refresh();
        if (!read) return;
        const inGifts = totalEarned(earned ?? []);
        const next = nextFundingStep({ held: read.held, arriving: read.arriving, arrivingUsdc: read.usdc, inGifts, wanted, failedAtMs: failedAtMs.current, nowMs: Date.now() });
        if (next.do === "takeFromGifts") {
          // The person's own money, out of their gifts and into their account, by the way out's own gesture
          // (src/client/gift.ts), before the gift is made and before a card is waited for.
          working.current = true;
          // Said on the whole screen only when it is all the gift needs. With a card still to pay, the screen stays
          // as it is: the frame a card is paid in must not close under the person (one gift, one payment).
          if (read.held + inGifts >= wanted) setPhase("taking");
          let account;
          try {
            account = await ensureSigner();
          } catch {
            working.current = false;
            return;
          }
          try {
            await takeFromGifts(account, earned ?? []);
          } catch {
            // Said once, and not tried again by itself (F11): whatever came out is in the account, whatever did not
            // is still in its gift, and the gift is paid with what the account holds and a card.
            const after = await readAusdBalance(address).catch(() => read.held);
            setBalance(after);
            setEarned([]);
            setProblem(C.gatherFailed);
            working.current = false;
            setPhase("waiting");
            return;
          }
          const after = await readAusdBalance(address);
          setBalance(after);
          setEarned([]);
          setProblem(null);
          working.current = false;
          setPhase(after >= wanted ? "giving" : "waiting");
          return;
        }
        // A change that stayed on the screen after a failure, and nothing is left to change: what arrived has gone, or
        // was changed elsewhere. The screen that waits says what the account holds. A wait that is only the pause
        // after a failure keeps the change on the screen.
        if (next.do === "wait" && phase === "converting" && !pausedAfterFailure(failedAtMs.current, Date.now())) {
          setAsksAgain(null);
          setPhase("waiting");
          return;
        }
        // The money is in the account: the frame it was paid in closes, whatever the frame said or did not say.
        // Without a partner's key Rampnow's messages may never come, so nothing waits for them (3 Oct 2026).
        if (next.do !== "wait") {
          setFrame(null);
          // And nothing is waited for at Rampnow any more. Written down with its time: the length of a real payment.
          if (readRampnowPending(address)) noteInRampnowJournal("Viky: the money arrived in the account");
          clearRampnowPending(address);
        }
        if (next.do === "give") {
          await make();
          return;
        }
        if (next.do === "convertUsdc") {
          // The other dollar coin a card can deliver (the founder, 1 Oct 2026): changed into what a gift holds on one
          // signature the relayer carries, since this account holds none of the chain's coin and can call nothing.
          working.current = true;
          setPhase("converting");
          let account;
          try {
            account = await ensureSigner();
          } catch {
            working.current = false;
            return;
          }
          try {
            await changeArrivedUsdc({ account, amount: next.amount });
          } catch (error) {
            // Kept from trying again at once, exactly as a conversion of the chain's coin is (src/funding-step.ts).
            // The screen stays on the change (the founder, 5 Oct 2026): the payment arrived, and going back to the
            // screen that waits for one put its pay button in front of somebody who had paid.
            failedAtMs.current = Date.now();
            const after = afterPaying(error, W.arrived.notAnswered);
            setAsksAgain(after.keep ? after.says : error instanceof ApiError && error.code !== "QUOTE_STALE" ? readable(error) : W.arrived.priceMoved);
            working.current = false;
            return;
          }
          failedAtMs.current = null;
          setAsksAgain(null);
          const after = await readAusdBalance(address);
          setBalance(after);
          setArrived(after - read.held);
          setProblem(null);
          working.current = false;
          setPhase(after >= wanted ? "giving" : "short");
          return;
        }
        if (next.do === "convert") {
          working.current = true;
          setPhase("converting");
          let account;
          try {
            account = await ensureSigner();
          } catch {
            working.current = false;
            return;
          }
          try {
            // Held to the amount asked for and to the one exchange, against the chain, before it is sent.
            const quote = await fundingQuote(next.amount);
            await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
          } catch (error) {
            // The time of the failure is what keeps the next look, and every look inside the pause, from converting
            // again (src/funding-step.ts). The screen stays on the change, as for the card's dollars above.
            failedAtMs.current = Date.now();
            const after = afterPaying(error, W.arrived.notAnswered);
            setAsksAgain(after.keep ? after.says : W.arrived.priceMoved);
            working.current = false;
            return;
          }
          failedAtMs.current = null;
          setAsksAgain(null);
          const after = await readAusdBalance(address);
          setBalance(after);
          setArrived(after - read.held);
          setProblem(null);
          working.current = false;
          setPhase(after >= wanted ? "giving" : "short");
          return;
        }
      } catch {
        // A read that failed is read again at the next look; nothing was moved.
      }
    };
    void look();
    const timer = setInterval(() => void look(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [step, address, units, phase, refresh, give, ensureSigner, earned]);

  const copy = (what: "code" | "link", text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        setCopyRefused(null);
      })
      .catch(() => {
        setCopied(null);
        setCopyRefused(what);
      });
  };

  /** The gift, written down before the rail's page opens, so a payment that outlasts the session loses nothing (D74). */
  const keepOnDevice = (next: GiftDraft = draft, way: WayIn = wayIn) => {
    if (!address) return;
    setKeptOnDevice(savePendingGift({ ...draftToTerms(next, address), wayIn: way.name }));
  };

  const differentGift = () => {
    forgetPendingGift();
    clearedCardDraft();
    setKept(undefined);
    setPhase("waiting");
    setProblem(null);
    router.push("/");
  };

  if (!browser) {
    return (
      <Shell kind="task">
        <WaitLine>{O.oneMoment}</WaitLine>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // A payment already started on this device, and nobody signed in: one path.
  if (!address && kept?.wayIn && step !== "account" && !hadAccount) {
    return (
      <Shell kind="task" back="/" step={W.waitingGift.title}>
        {/* Inside another app's page nobody signs in: said first, with the way out (the founder, 1 Oct 2026). */}
        <DoorNotice />
        <p className={BODY}>{kept.recipientName ? W.waitingGift.which(formatAusd(dollarsToUnits(kept.dollars)), kept.recipientName) : W.waitingGift.whichUnnamed(formatAusd(dollarsToUnits(kept.dollars)))}</p>
        <button type="button" onClick={() => void signIn()} disabled={accountStatus === "busy"} className={PRIMARY_BUTTON}>
          {W.waitingGift.signIn}
        </button>
        <div className="flex flex-col gap-[var(--space-xs)]">
          <button type="button" onClick={differentGift} className={`${SMALL_BUTTON} self-start`}>
            {W.waiting.different}
          </button>
          <p className={HELP}>{W.waitingGift.staysInAccount}</p>
        </div>
      </Shell>
    );
  }

  // The session closed while paying.
  if (!address && step === "paying") {
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.closed.title}>
        {/* One sentence in the open, the rest folded (the founder's rule 4 of 1 Oct 2026). */}
        <Said text={`${keptOnDevice ? W.closed.kept(formatAusd(units ?? 0n), recipient) : W.closed.keptWhileOpen(formatAusd(units ?? 0n), recipient)} ${W.closed.signInAgain}`} />
        <AccountPanel returning signInOnly />
      </Shell>
    );
  }

  // Nothing filled in on the card, so there is nothing here to pay for.
  if (!ready || units === null || !condition) {
    return (
      <Shell kind="task" back="/" step={O.nothingToPay.title}>
        <Said text={O.nothingToPay.body} />
        <Link href="/" className={PRIMARY_BUTTON}>
          {O.nothingToPay.action}
        </Link>
      </Shell>
    );
  }

  /**
   * One writing of money (the founder, 4 Oct 2026, src/pay-sum.ts): the gift as it was typed, in the money it was typed
   * in, and everything else on these screens said in that same money. The figure is the one the pay sheet showed, kept
   * with the payment started and on the card.
   */
  const typed = draft.typedAmount !== undefined ? draft : { typedAmount: kept?.typedAmount, typedIn: kept?.typedIn };
  const gift = giftAsTyped(typed, formatAusd(units));
  const typedMoney = moneyTypedIn(typed, money.rates);
  const said = (amount: bigint) => dollarsSaidIn(amount, typedMoney, money.rates, formatAusd(amount));

  // ---------------------------------------------------------------------------------------------------------------
  // Paying: the wait, the payment arriving, the gift being made.
  if (step === "paying" && address) {
    const held = balance ?? 0n;
    if (phase === "taking" || phase === "converting" || phase === "giving") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows>
          {/* The whole screen while a gift is being made (the mockup paying.html): the ring, what is being done,
              how long it takes, and the gift itself small underneath, so it never leaves the screen. */}
          <Working says={phase === "taking" ? C.gathering : phase === "converting" ? W.arrived.gettingReady : P.putting(gift, recipient)} and={P.takesSeconds} then={P.mayClose} large />
          {/* A call that did not answer, or a gift being made: the screen stays, and says what is known. Never a
              failure, and never the sentence of a request that did nothing (the founder, 5 Oct 2026). */}
          {asksAgain ? (
            <p className={`${BODY} text-center`} role="status" data-asks-again="">
              {asksAgain}
            </p>
          ) : null}
          <MiniGift recipient={recipient} what={condition.name} line={P.mini(condition.name, gift, days)} />
        </Shell>
      );
    }
    if (phase === "short" && arrived !== undefined && askAwaited) {
      // What is left to pay is being priced by the card service: said, and no amount named meanwhile.
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <WaitLine>{P.workingOutTotal}</WaitLine>
        </Shell>
      );
    }
    if (phase === "short" && arrived !== undefined) {
      // What is left to pay, as the card is asked it; in euros by the service's floor when no rate was read.
      const more = toPaySaid ?? moneyIn(ruleEuros ?? wayIn.smallestEur, "EUR");
      const makeIt = twoDecimalsDown(held, 6);
      // What the gift would become, as the button and the sentence say it, and as it is kept if the button is pressed.
      const makeItUnits = dollarsToUnits(makeIt);
      const makeItRead = typedMoney === "USD" ? undefined : heldIn(makeItUnits, typedMoney, money.rates);
      const makeItSaid = said(makeItUnits);
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <Said text={W.arrived.short(said(arrived), gift, more, makeItSaid)} />
          {cardClosed ? (
            <CardNotOffered country={card?.country ?? null} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (wayIn.embedded) setCardOpen(true);
                  // What arrived fell short: paying the rest is a new payment, asked for by this press.
                  else if (wayIn === WAY_IN_USDC && rampnowBeside) payAtRampnowBeside(address, wayInPage(wayIn, { account: address, euros: ruleEuros, ask: toPay }));
                  else if (wayIn === WAY_IN_USDC && rampnowFrameOn()) setFrame({ mode: "new" });
                  else window.open(wayInPage(wayIn, { account: address, euros: ruleEuros, ask: toPay }), "_blank", "noopener,noreferrer");
                  setPhase("waiting");
                }}
                className={PRIMARY_BUTTON}
              >
                {W.arrived.payMore(more)}
              </button>
              <CardTermsLine way={wayIn} />
            </>
          )}
          {held >= 1_000_000n ? (
            <button
              type="button"
              onClick={() => {
                // The gift becomes what the payment actually bought, on the card as here: there is one gift. And it
                // is said from now on as this button said it.
                const next = { ...draft, dollars: makeIt, typedAmount: makeItRead === undefined ? makeIt : String(makeItRead), typedIn: makeItRead === undefined ? "USD" : typedMoney };
                writeCardDraft(next, address);
                keepOnDevice(next);
                setKept(peekPendingGift());
                setPhase("waiting");
                go("pay");
              }}
              className={SECONDARY_BUTTON}
            >
              {W.arrived.makeIt(makeItSaid)}
            </button>
          ) : null}
        </Shell>
      );
    }
    if (phase === "failed") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          {problem ? <FieldRefusal id="give-refused">{problem}</FieldRefusal> : null}
          {problemCode === "ALREADY_MADE" ? (
            // The creation went through and its answer was lost: the gift exists, with its link, in the list. Making
            // it again would be a second gift, so the way on is the list, and nothing here is kept as "not made".
            <Link
              href="/gifts"
              className={PRIMARY_BUTTON}
              onClick={() => {
                forgetPendingGift();
                clearedCardDraft();
              }}
            >
              {W.backToGifts}
            </Link>
          ) : problemCode === "STANDING_MOVED" ? (
            // Their rating moved past what the gift could start from while the payment arrived: the same terms would be
            // refused again, so the way on is to read where they stand and choose again, on the card. The payment stays.
            <button
              type="button"
              onClick={() => {
                // The reading is dropped so the card asks for it again, which is where that question lives now.
                writeCardDraft({ ...draft, standing: undefined, standingReadAt: undefined }, address);
                setPhase("waiting");
                router.push("/");
              }}
              className={PRIMARY_BUTTON}
            >
              {M.failures.standingMoved}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                setPhase("waiting");
              }}
              className={PRIMARY_BUTTON}
            >
              {W.failures.tryAgain}
            </button>
          )}
          {/* Not of a gift already made: what it took is in the gift, and nothing is left to make with the rest. */}
          {held > 0n && problemCode !== "ALREADY_MADE" ? <p className={HELP}>{W.waiting.staysInAccount}</p> : null}
        </Shell>
      );
    }
    // What a card is asked for: the gift, less everything the person pays with, their account and what their gifts
    // still hold for them, which is being taken. Not known, and nothing asked, until both have been read.
    // In euros by the rule, for a page whose settings the person types themselves; what is said and opened is `toPay`.
    const toBuy = balance === null || earned === null ? undefined : ruleEuros;
    const start = address.slice(0, 4);
    const end = address.slice(-4);
    /** A card paid through Rampnow, in its frame or on its page beside: the wait is two short steps. */
    const byRampnow = wayIn === WAY_IN_USDC && rampnowFrameOn() && !cardClosed;
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.waiting.title(toPaySaid)}>
        <section className="flex flex-col gap-[var(--space-xs)]">
          {/* Two short lines, a label and its value, where two sentences stood (the founder, 4 Oct 2026). */}
          <Lines
            rows={[
              [W.waiting.lines.gift, W.waiting.giftSaid(gift, recipient, milestone ? undefined : days)],
              [W.waiting.lines.account, balance === null ? "…" : said(held)],
            ]}
          />
          {/* Where a first funder lands once pay has made their account: the judge code is asked here too (D299). A
              credit that covers the gift is made into it by the watch above, as any payment that lands is. */}
          <JudgeCode
            needed={units}
            held={balance}
            onCredited={() => void refresh()}
            onMakeIt={(dollars) => writeCardDraft({ ...draft, dollars, typedAmount: dollars, typedIn: "USD" }, address)}
          />
        </section>
        {problem ? <FieldRefusal id="waiting-refused">{problem}</FieldRefusal> : null}
        {/* Nothing to set and no code to give where the card's page is told all of it already: inside Viky, or locked. */}
        {wayInAsksNothing(wayIn) && !cardClosed ? null : (
        <section className={CARD}>
          {/* What to set on the card partner's page, only where that page is offered to this payer. */}
          {cardClosed ? null : (
            <>
              <p className="font-medium">{W.waiting.setThese(wayIn.name)}</p>
              <ul className={`flex flex-col gap-[var(--space-xs)] ${BODY}`}>
                {W.waiting.settings(toBuy, wayIn.delivers).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {/* What the wait ends with, in the open: money a gift can hold at once, or a step the person confirms
                  (D101). The partner's two words, and what stays behind, are folded under it (rule 4). */}
              <p className={HELP}>{wayIn.arrives === "gift" ? W.waiting.thenNothing : W.waiting.thenChanged}</p>
              <Said whole className={HELP} text={[wayIn.arrives === "gift" ? "" : W.waiting.thenChangedRest, W.waiting.theirWords(wayIn.name, wayIn.delivers)].filter(Boolean).join(" ")} />
            </>
          )}
          <p className="font-medium">{W.waiting.codeLabel(wayIn.name)}</p>
          <p className="select-all break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
          <button type="button" onClick={() => copy("code", address)} className={SECONDARY_BUTTON}>
            {copied === "code" ? W.waiting.copied : W.waiting.copy}
          </button>
          {copyRefused === "code" ? <FieldRefusal id="code-refused">{W.waiting.copyRefused}</FieldRefusal> : null}
          <p className={HELP}>{W.waiting.startsEnds(start, end)}</p>
        </section>
        )}
        {/* Each help comes when it serves (the founder, 4 Oct 2026): four sentences stood here whatever the moment.
            That this device would not keep the gift is a warning, and stays. On the way a card is paid through
            Rampnow, what comes next is the second of two short steps; on another service's page, where the person
            leaves with a code, how long it takes and that they may leave are said as before. */}
        {!keptOnDevice ? <p className={BODY}>{W.waiting.stay}</p> : byRampnow ? null : <p className={BODY}>{[wayIn.takes && !cardClosed ? W.check.delay(wayIn.name, wayIn.takes) : "", W.waiting.leave].filter(Boolean).join(" ")}</p>}
        {cardClosed ? (
          <CardNotOffered country={card?.country ?? null} />
        ) : wayIn.embedded ? (
          <>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => {
                setPartnerOpened(true);
                setCardOpen(true);
              }}
            >
              {partnerOpened ? W.waiting.openCardAgain : W.waiting.openCard}
            </button>
            <CardTermsLine way={wayIn} />
          </>
        ) : wayIn === WAY_IN_USDC && rampnowFrameOn() && rampnowPending ? (
          // A payment may have left and the frame was left. Known: the screen says where it is, and its one button
          // leads back to it. Not known: the screen asks, and a new payment opens only on the answer "No, pay now".
          <RampnowWaiting
            // Where the frame is never shown, the way back to a payment is Rampnow's own page in a tab, whatever was kept.
            pending={rampnowBeside ? { ...rampnowPending, via: "tab" } : rampnowPending}
            onFinish={() => setFrame({ mode: "finish", orderUid: rampnowPending.orderUid })}
            onPayNow={() => {
              noteInRampnowJournal("Viky: answered no, pay now");
              clearRampnowPending(address);
              setRampnowFailed(false);
              if (rampnowBeside) payAtRampnowBeside(address, wayInPage(wayIn, { account: address, euros: toBuy, ask: toPay }));
              else setFrame({ mode: "new" });
            }}
          />
        ) : wayIn === WAY_IN_USDC && rampnowBeside ? (
          // No frame here: the button that pays is a link to Rampnow's page in a tab of its own, which no browser
          // refuses, and from that press the payment is followed as one started from a tab.
          <Steps>
            <Step says={W.waiting.steps.payBeside(wayIn.name)}>
              {askAwaited ? (
                <WaitLine>{P.workingOutTotal}</WaitLine>
              ) : (
                <a
                  href={wayInPage(wayIn, { account: address, euros: toBuy, ask: toPay })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={PRIMARY_BUTTON}
                  data-rampnow-pay-beside=""
                  onClick={() => {
                    noteInRampnowJournal("Viky: the card page was opened beside, from the wait");
                    noteRampnowPending(address, { via: "tab" });
                  }}
                >
                  {toPaySaid ? P.payByCard(toPaySaid) : W.waiting.openCard}
                </a>
              )}
              <CardTermsLine way={wayIn} />
            </Step>
            <Step says={W.waiting.steps.comeBack} />
          </Steps>
        ) : wayIn === WAY_IN_USDC && rampnowFrameOn() ? (
          <Steps>
            <Step says={W.waiting.steps.pay}>
              {rampnowFailed ? <FieldRefusal id="rampnow-failed">{P.rampnow.failed}</FieldRefusal> : null}
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() => {
                  setRampnowFailed(false);
                  setFrame({ mode: "new" });
                }}
              >
                {toPaySaid ? P.payByCard(toPaySaid) : W.waiting.openCard}
              </button>
              <CardTermsLine way={wayIn} />
            </Step>
            <Step says={W.waiting.steps.keepOpen} />
          </Steps>
        ) : (
          <>
            <a href={wayInPage(wayIn, { account: address, euros: toBuy, ask: toPay })} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON} onClick={() => setPartnerOpened(true)}>
              {partnerOpened ? W.waiting.openAgain(wayIn.name) : W.waiting.openFirst(wayIn.name)}
            </a>
            <CardTermsLine way={wayIn} />
          </>
        )}
        <SwapperSheet
          open={cardOpen}
          account={address}
          onArrived={() => {
            setCardOpen(false);
            void refresh();
          }}
          onClose={() => setCardOpen(false)}
        />
        <RampnowSheet
          open={frame !== null}
          account={address}
          ask={toPay}
          asking={askAwaited}
          finish={frame?.mode === "finish" ? { orderUid: frame.orderUid } : null}
          known={rampnowPending?.known ?? false}
          started={rampnowPending !== null}
          onSaid={(what, orderUid) => noteRampnowPending(address, { orderUid, known: what === "paying", via: "frame" })}
          onBack={() => {
            // Back from a new payment, nothing was paid and nothing is waited for; back from a payment already
            // started, it is still waited for, and the screen that waits says so or asks.
            if (frame?.mode !== "finish") clearRampnowPending(address);
            setFrame(null);
          }}
          onFailed={() => {
            noteInRampnowJournal("Viky: the frame said the payment failed");
            clearRampnowPending(address);
            setFrame(null);
            setRampnowFailed(true);
          }}
          onLate={() => {
            noteRampnowPending(address);
            setFrame(null);
          }}
          onBeside={() => {
            noteRampnowPending(address, { via: "tab" });
            setFrame(null);
          }}
        />
        <div className="flex flex-col gap-[var(--space-xs)]">
          <button type="button" onClick={differentGift} className={`${SMALL_BUTTON} self-start`}>
            {W.waiting.different}
          </button>
          <p className={HELP}>{W.waiting.staysInAccount}</p>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Paying starts on the card, in the sheet that opens over it (the mockup pay.html). Somebody who lands here with
  // nothing running is sent back to it rather than shown a second way to pay for the same gift.
  return (
    <Shell kind="task" back="/" step={O.nothingToPay.title}>
      <p className={BODY}>{O.nothingToPay.body}</p>
      <Link href="/" className={PRIMARY_BUTTON}>
        {O.nothingToPay.action}
      </Link>
    </Shell>
  );
}
