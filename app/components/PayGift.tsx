"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { linkOfMade, prepareGift, submitGift, type CreatedGift } from "@/src/client/gift";
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
import { spokenAmount, whenInWords } from "@/src/display-currency";
import { twoDecimalsDown } from "@/src/exit-steps";
import { nextFundingStep, POLL_MS } from "@/src/funding-step";
import { eurosToBuyOn } from "@/src/gift-amount";
import { draftToTerms, isComplete, type GiftDraft } from "@/src/gift-draft";
import { cardDraft, clearedCardDraft, startingCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { tidyGiftName } from "@/src/gift-names";
import { rememberGiftLink } from "@/src/gift-link-memory";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { forgetPendingGift, peekPendingGift, savePendingGift, type PendingGift } from "@/src/pending-gift";
import { wayInAsksNothing, wayInPage, waysIn, type WayIn } from "@/src/rails";
import { JudgeCode } from "../kit/offer/JudgeCode";
import { CardNotOffered, CardTermsLine } from "../kit/offer/CardTerms";
import { SwapperSheet } from "../kit/offer/SwapperSheet";
import { FunderControls } from "../kit/FunderControls";
import { Said } from "../kit/Said";
import { FoldChevron } from "../kit/GiftLive";
import { whereTheRailsServe } from "@/src/client/rails";
import { FUND as W, MILESTONE_FUND as M, OFFER, OFFER as O, PAY as P } from "@/src/sentences";
import { ExactLine } from "../kit/LedAmount";
import { Figure } from "../kit/Figure";
import { FieldRefusal } from "../kit/FieldRefusal";
import { Success } from "../kit/Motion";
import { Shell } from "../kit/Shell";
import { Working } from "../kit/Working";
import { previewLine, sharedWith } from "@/src/preview-line";
import { AccountPanel } from "./AccountPanel";
import { DoorNotice } from "../kit/AccountDoor";
import { BODY, CARD, CARD_LABEL, CARD_TITLE, HELP, META, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";

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

const MADE_KEY = "viky.giftMade";

type Step = "pay" | "account" | "paying" | "done";
const ALL_STEPS: readonly Step[] = ["pay", "account", "paying", "done"];
type Phase = "waiting" | "converting" | "giving" | "short" | "failed";

type Made = Readonly<{
  giftId: string;
  claimUrl: string;
  atMs: number;
  recipientName: string;
  /** The giver's name as they gave it, for the words the link is shared with; nothing on a gift made before 1 Oct 2026. */
  funderName?: string;
  conditionId: string;
  amount: string;
  days: number;
  goal?: string;
  target?: number;
  namedByFunder?: boolean;
}>;

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
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
/** A route's own typed sentence when it gave one; one plain line otherwise, never a library's words. */
function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return W.failures.other;
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
  const sharing = useSyncExternalStore(never, canShare, onServer);
  const params = useSearchParams();
  const asked = params.get("step");
  // Whether the pay press already opened the partner's page (D296): only when that page arrives filled in.
  const [partnerOpened, setPartnerOpened] = useState(params.get("opened") === "1" || params.get("card") === "1");
  const step: Step = ALL_STEPS.includes(asked as Step) ? (asked as Step) : "pay";

  // The gift is read from the same store the card writes (src/card-draft.ts): one gift, in one place, on the device.
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, startingCardDraft);
  const [made, setMade] = useState<Made | null>(() => (typeof window === "undefined" ? null : readSession<Made>(MADE_KEY)));
  /**
   * Whether the gift was made by a press on this screen a moment ago, rather than read back from the session on a
   * reload: the character's arrival answers the payment, and a reload is not one (V4, decision B).
   */
  const [justMade, setJustMade] = useState(false);
  const [kept, setKept] = useState<PendingGift | undefined>(() => (typeof window === "undefined" ? undefined : peekPendingGift()));
  const [balance, setBalance] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [arrivedFigure, setArrivedFigure] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemCode, setProblemCode] = useState<string | null>(null);
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

  // Where the screen belongs: a gift already made, a payment already running, or nothing to pay for at all.
  useEffect(() => {
    if (!browser) return;
    if (step === "done" && !made) replace("pay");
    if (step === "account" && address) replace("pay");
    if (step !== "done" && !ready) replace("pay");
    // A payment was started for this gift before the page went: the wait is where this person was (D74).
    if (step === "pay" && address && ready && kept?.wayIn && phase === "waiting" && made === null) replace("paying");
  }, [browser, step, made, address, ready, kept, phase]);

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
    const record: Made = {
      giftId: result.giftId,
      claimUrl,
      atMs: Date.now(),
      recipientName: recipient,
      funderName: funder,
      conditionId: condition.id,
      amount: units.toString(),
      days,
      ...(milestone && cadence ? { goal: milestone.words.goal(target, cadence.label), target, namedByFunder: subject.length > 0 } : {}),
      ...(certificate ? { goal: certificate.words.goal(target, draft.scale), target } : {}),
    };
    writeSession(MADE_KEY, record);
    // This device keeps the link, so the gift's page can offer it again long after this screen is gone.
    rememberGiftLink(result.giftId, claimUrl);
    // Made, so nothing is left on this device to pick up or to fill in again (D74).
    forgetPendingGift();
    clearedCardDraft();
    setKept(undefined);
    setMade(record);
    setJustMade(true);
    replace("done");
    window.scrollTo(0, 0);
  }, [ensureSigner, condition, milestone, certificate, cadence, draft.course, draft.standing, draft.standingReadAt, subject, target, days, units, recipient, funder]);

  // While paying: watch the account, turn what arrived into what a gift holds, then make the gift.
  useEffect(() => {
    if (step !== "paying" || !address || units === null || phase === "short" || phase === "failed") return;
    const wanted = units;
    let live = true;
    const look = async () => {
      if (!live || working.current) return;
      try {
        const read = await refresh();
        if (!read) return;
        const next = nextFundingStep({ held: read.held, arriving: read.arriving, arrivingUsdc: read.usdc, wanted, failedAtMs: failedAtMs.current, nowMs: Date.now() });
        if (next.do === "give") {
          working.current = true;
          setPhase("giving");
          try {
            await give();
          } catch (error) {
            // A refusal to make the gift is said once, with a way to try again: retrying by itself every few seconds
            // would repeat a refusal nobody has read (F11).
            setProblem(readable(error));
            setProblemCode(error instanceof ApiError ? error.code : null);
            setPhase("failed");
          }
          working.current = false;
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
            failedAtMs.current = Date.now();
            setProblem(error instanceof ApiError && error.code !== "QUOTE_STALE" ? error.message : W.arrived.priceMoved);
            setPhase("waiting");
            working.current = false;
            return;
          }
          failedAtMs.current = null;
          const after = await readAusdBalance(address);
          setBalance(after);
          setArrivedFigure(formatAusd(after - read.held));
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
          } catch {
            // The phase goes back to waiting, which starts this watch again at once: the time of the failure is what
            // keeps that first look, and every look inside the pause, from converting again (src/funding-step.ts).
            failedAtMs.current = Date.now();
            setProblem(W.arrived.priceMoved);
            setPhase("waiting");
            working.current = false;
            return;
          }
          failedAtMs.current = null;
          const after = await readAusdBalance(address);
          setBalance(after);
          setArrivedFigure(formatAusd(after - read.held));
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
  }, [step, address, units, phase, refresh, give, ensureSigner]);

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
        <p className={HELP}>{O.oneMoment}</p>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // It is in their name.
  if (step === "done" && made) {
    const madeCondition = conditionById(made.conditionId);
    const madeMilestone = made.goal !== undefined && made.target !== undefined;
    const madeUnits = BigInt(made.amount);
    const day = madeUnits / BigInt(made.days);
    // The person's currency leads with "about", and the dollars put in their name are under the title, exact (the
    // founder, 29 Sep 2026). The terms say the same currency; a converted day is "about" already, so it is not said twice.
    const led = money.led(madeUnits);
    const perDay = money.led(day);
    return (
      <Shell
        kind="task"
        back="/gifts"
        backLabel={W.backToGifts}
        backFollows
        step={W.made.title(spokenAmount(led, true), made.recipientName)}
        /* At payment, the character arrives on the expressive spring, once, and no confetti: the one confetti of the app
           is the gift reached (decision B, V4). It is the app's own character, waving, where the gift box of the first
           look stood (the founder, 28 Sep 2026: that box is kept as the kid, for later, and drawn on no screen now). */
        character={
          justMade ? (
            <Success>
              <span className="block w-[72px] shrink-0">
                <Figure id="made" arms="wave" mouth="soft" halftone />
              </span>
            </Success>
          ) : (
            <span className="block w-[72px] shrink-0">
              <Figure id="made" arms="wave" mouth="soft" halftone />
            </span>
          )
        }
      >
        <section className="flex flex-col gap-[var(--space-sm)]">
          <ExactLine amount={led} />
          {madeMilestone ? (
            <>
              <p className={BODY}>{M.made.terms(spokenAmount(led, true), made.goal ?? "", made.days, madeCondition?.source ?? "")}</p>
              <p className={BODY}>{M.made.allOrNothing}</p>
            </>
          ) : (
            <>
              {/* The day's share and the days, two figures side by side where a sentence said them (the founder's
                  rule 5 of 1 Oct 2026). The whole amount is the title's. */}
              <div className="flex gap-[var(--space-xxl)]" data-made-figures>
                <div>
                  <p className={MONEY}>{`${perDay.converted || day * BigInt(made.days) === madeUnits ? "" : W.made.about}${spokenAmount(perDay)}`}</p>
                  <p className={META}>{W.made.aDay}</p>
                </div>
                <div>
                  <p className={MONEY}>{made.days}</p>
                  <p className={META}>{W.made.days(made.days)}</p>
                </div>
              </div>
              <p className={BODY}>{W.made.firstDay(madeCondition?.source ?? "")}</p>
            </>
          )}
          <p className={HELP}>{W.made.reference(whenInWords(made.atMs), made.giftId)}</p>
        </section>
        <section className={CARD}>
          <h2 className={TITLE}>{W.made.linkTitle}</h2>
          <p className="select-all break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)]">{made.claimUrl}</p>
          <button type="button" onClick={() => copy("link", made.claimUrl)} className={PRIMARY_BUTTON}>
            {copied === "link" ? W.made.copied : W.made.copy}
          </button>
          {copyRefused === "link" ? <FieldRefusal id="link-refused">{W.made.copyRefused}</FieldRefusal> : null}
          {sharing ? (
            <button
              type="button"
              // Who, how much in the giver's own currency, what it is; the link follows (the founder, 1 Oct 2026).
              onClick={() => void navigator.share({ title: "Viky", text: sharedWith(made.funderName, spokenAmount(led), previewLine(madeCondition, madeMilestone)), url: made.claimUrl }).catch(() => undefined)}
              className={SECONDARY_BUTTON}
            >
              {W.made.share}
            </button>
          ) : null}
          <p className={HELP}>{W.made.onlyThem(made.recipientName)}</p>
          {/* What happens next, folded under its name: three steps and the way back to a lost link (rule 4). */}
          <details className="gift-fold" data-made-next>
            <summary className="gift-fold-name">
              {W.made.nextTitle}
              <FoldChevron />
            </summary>
            <div className="gift-fold-body">
              <ol className="flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)]">
                {(madeMilestone
                  ? M.made.next(made.recipientName, madeCondition?.source ?? "", made.target ?? 0, made.days, settlingTimeInWords(made.atMs), made.namedByFunder === true)
                  : W.made.next(made.recipientName, madeCondition?.words.theyConnect ?? W.made.theyConnectAny, madeCondition?.words.eachDay ?? "", spokenAmount(perDay), settlingTimeInWords(made.atMs))
                ).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className={HELP}>{W.made.findItAgain}</p>
            </div>
          </details>
        </section>
        {/* Being told how it goes, offered here, right after the link exists (the founder, 1 Oct 2026): the funder was
            never offered it, and it is how "what they miss comes back to you" reaches them without opening Viky. It
            is the funder's round button, as on the gift's own page. */}
        <FunderControls
          giftId={made.giftId}
          about={!madeMilestone ? { kind: "morning" } : certificateById(made.conditionId) ? { kind: "hadOrNot" } : { kind: "reach", target: String(made.target) }}
          takeBack={null}
        />
        <Link href={`/g/${made.giftId}`} className={SECONDARY_BUTTON}>
          {W.made.seeIt}
        </Link>
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

  const gift = formatAusd(units);

  // ---------------------------------------------------------------------------------------------------------------
  // Paying: the wait, the payment arriving, the gift being made.
  if (step === "paying" && address) {
    const held = balance ?? 0n;
    if (phase === "converting" || phase === "giving") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows>
          {/* The whole screen while a gift is being made (the mockup paying.html): the ring, what is being done,
              how long it takes, and the gift itself small underneath, so it never leaves the screen. */}
          <Working says={phase === "converting" ? W.arrived.gettingReady : P.putting(gift, recipient)} and={P.takesSeconds} then={P.mayClose} large />
          <MiniGift recipient={recipient} what={condition.name} line={P.mini(condition.name, gift, days)} />
        </Shell>
      );
    }
    if (phase === "short" && arrivedFigure) {
      const more = eurosToBuyOn(units - held, wayIn, money.rates?.usdPerEur) ?? wayIn.smallestEur;
      const makeIt = twoDecimalsDown(held, 6);
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <Said text={W.arrived.short(arrivedFigure, gift, more, `$${makeIt}`)} />
          {cardClosed ? (
            <CardNotOffered country={card?.country ?? null} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (wayIn.embedded) setCardOpen(true);
                  else window.open(wayInPage(wayIn, { account: address, euros: more }), "_blank", "noopener,noreferrer");
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
                // The gift becomes what the payment actually bought, on the card as here: there is one gift.
                keepOnDevice({ ...draft, dollars: makeIt });
                setPhase("waiting");
                go("pay");
              }}
              className={SECONDARY_BUTTON}
            >
              {W.arrived.makeIt(`$${makeIt}`)}
            </button>
          ) : null}
        </Shell>
      );
    }
    if (phase === "failed") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          {problem ? <FieldRefusal id="give-refused">{problem}</FieldRefusal> : null}
          {problemCode === "STANDING_MOVED" ? (
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
          <p className={HELP}>{W.waiting.staysInAccount}</p>
        </Shell>
      );
    }
    const toBuy = balance === null ? undefined : eurosToBuyOn(units - held, wayIn, money.rates?.usdPerEur);
    const start = address.slice(0, 4);
    const end = address.slice(-4);
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.waiting.title(toBuy)}>
        <section className="flex flex-col gap-[var(--space-xs)]">
          <p className={HELP}>{W.waiting.inAccountNow(balance === null ? "…" : formatAusd(held))}</p>
          <p className={BODY}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, days)}</p>
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
        {/* A dollar coin that arrives is changed by this screen, with nothing to confirm: said before it lands. */}
        {wayIn.arrives === "usdc" && !cardClosed ? <p className={HELP}>{W.waiting.thenConfirmed}</p> : null}
        <p className={BODY}>
          {wayIn.takes && !cardClosed ? `${W.check.delay(wayIn.name, wayIn.takes)} ` : ""}
          {keptOnDevice ? W.waiting.leave : W.waiting.stay}
        </p>
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
        ) : (
          <>
            <a href={wayInPage(wayIn, { account: address, euros: toBuy })} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON} onClick={() => setPartnerOpened(true)}>
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
