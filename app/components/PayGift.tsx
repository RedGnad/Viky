"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { prepareGift, submitGift, type CreatedGift } from "@/src/client/gift";
import { prepareCertificateGift, submitCertificateGift } from "@/src/client/certificate-gift";
import { prepareMilestoneGift, submitMilestoneGift } from "@/src/client/milestone";
import { attemptFor, forgetsAttempt, GIFT_ATTEMPT_KEY, isCertificateRequest, isMilestoneRequest } from "@/src/gift-attempt";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { conditionById } from "@/src/conditions";
import { GOAL_TYPE_DUOLINGO_COURSE_XP } from "@/src/gift-terms";
import { cadenceOf, certificateById, milestoneById } from "@/src/milestone-conditions";
import { whenInWords } from "@/src/display-currency";
import { twoDecimalsDown } from "@/src/exit-steps";
import { CONVERSION_RESERVE, nextFundingStep, paymentArrived } from "@/src/funding-step";
import { arrivesInDollars, eurosToBuyOn } from "@/src/gift-amount";
import { draftToTerms, isComplete, type GiftDraft } from "@/src/gift-draft";
import { cardDraft, clearedCardDraft, emptyCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { tidyGiftName } from "@/src/gift-names";
import { rememberGiftLink } from "@/src/gift-link-memory";
import { formatAusd } from "@/src/gift-reader";
import { dollarsToUnits } from "@/src/money";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { forgetPendingGift, peekPendingGift, savePendingGift, type PendingGift } from "@/src/pending-gift";
import { whereTheRailsServe } from "@/src/client/rails";
import { countryInWords, orderRails, type RailReach } from "@/src/rail-country";
import { feeSentence, WAYS_IN, type WayIn } from "@/src/rails";
import { CASH_OUT, FUND as W, MILESTONE_FUND as M, OFFER as O } from "@/src/sentences";
import { FieldRefusal } from "../kit/FieldRefusal";
import { Shell } from "../kit/Shell";
import { Working } from "../kit/Working";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "./ui";

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

const POLL_MS = 8_000;
const MADE_KEY = "viky.giftMade";

type Step = "pay" | "account" | "paying" | "done";
const ALL_STEPS: readonly Step[] = ["pay", "account", "paying", "done"];
type Phase = "waiting" | "converting" | "giving" | "short" | "failed";

type Made = Readonly<{
  giftId: string;
  claimUrl: string;
  atMs: number;
  recipientName: string;
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
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

/** A route's own typed sentence when it gave one; one plain line otherwise, never a library's words. */
function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return W.failures.other;
}

function Line({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--space-md)]">
      <dt className={HELP}>{label}</dt>
      <dd className={`${BODY} text-right tabular-nums`}>{value}</dd>
    </div>
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
  const step: Step = ALL_STEPS.includes(asked as Step) ? (asked as Step) : "pay";

  // The gift is read from the same store the card writes (src/card-draft.ts): one gift, in one place, on the device.
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, emptyCardDraft);
  const [made, setMade] = useState<Made | null>(() => (typeof window === "undefined" ? null : readSession<Made>(MADE_KEY)));
  const [kept, setKept] = useState<PendingGift | undefined>(() => (typeof window === "undefined" ? undefined : peekPendingGift()));
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState<bigint | null>(null);
  const [arrivedWorth, setArrivedWorth] = useState<string | null | "unknown">(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [arrivedFigure, setArrivedFigure] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemCode, setProblemCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [copyRefused, setCopyRefused] = useState<"code" | "link" | null>(null);
  const [keptOnDevice, setKeptOnDevice] = useState(true);
  const working = useRef(false);
  const [hadAccount, setHadAccount] = useState(false);
  /** What each rail that adds money says about this person's country, read live (R1). Never hides one. */
  const [railIn, setRailIn] = useState<{ country: string | null; waysIn: Readonly<Record<string, RailReach>> }>({ country: null, waysIn: {} });
  /** The way in the funder pressed, so the wait tells them what to set on the page they actually opened (D101). */
  /** Nothing chosen until a way in is pressed; before that it is whichever way the kept payment names (D101). */
  const [chosenWay, setChosenWay] = useState<WayIn | null>(null);
  if (address && !hadAccount) setHadAccount(true);
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);

  const wayIn: WayIn = chosenWay ?? WAYS_IN.find((entry) => entry.name === kept?.wayIn) ?? WAYS_IN[0];
  const money = useDisplayCurrency(address);
  const condition = conditionById(draft.conditionId);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const cadence = milestone && draft.cadence ? cadenceOf(milestone, draft.cadence) : undefined;
  const ready = isComplete(draft);
  const units = ready ? dollarsToUnits(draft.dollars) : null;
  const days = Number(draft.days);
  const target = Number(draft.target);
  const perDay = units !== null && days > 0 ? units / BigInt(days) : null;
  const exact = perDay !== null && units !== null && perDay * BigInt(days) === units;
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
    const [held, arriving] = await Promise.all([readAusdBalance(address), readMonBalance(address)]);
    setBalance(held);
    setPending(arriving);
    return { held, arriving };
  }, [address]);

  useEffect(() => {
    // Past the synchronous body of the effect, so nothing this reads sets state while React is still rendering.
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    let live = true;
    whereTheRailsServe(typeof navigator === "undefined" ? undefined : navigator.language)
      .then((answer) => {
        if (live) setRailIn({ country: answer.country, waysIn: answer.waysIn });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Where the screen belongs: a gift already made, a payment already running, or nothing to pay for at all.
  useEffect(() => {
    if (!browser) return;
    if (step === "done" && !made) replace("pay");
    if (step === "account" && address) replace("pay");
    if (step !== "done" && !ready) replace("pay");
    // A payment was started for this gift before the page went: the wait is where this person was (D74).
    if (step === "pay" && address && ready && kept?.wayIn && phase === "waiting" && made === null) replace("paying");
  }, [browser, step, made, address, ready, kept, phase]);

  // On the pay screen, a card payment sitting in the account is valued before it is used (audit C, 9.1).
  useEffect(() => {
    if (step !== "pay" || !address || pending === null || !paymentArrived(pending)) return;
    let live = true;
    postJson<{ output: string }>("/api/fund/quote", { amount: (pending - CONVERSION_RESERVE).toString() })
      .then((quote) => {
        if (live) setArrivedWorth(formatAusd(BigInt(quote.output)));
      })
      .catch(() => {
        if (live) setArrivedWorth("unknown");
      });
    return () => {
      live = false;
    };
  }, [step, address, pending]);

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
    const record: Made = {
      giftId: result.giftId,
      claimUrl: result.claimUrl,
      atMs: Date.now(),
      recipientName: recipient,
      conditionId: condition.id,
      amount: units.toString(),
      days,
      ...(milestone && cadence ? { goal: milestone.words.goal(target, cadence.label), target, namedByFunder: subject.length > 0 } : {}),
      ...(certificate ? { goal: certificate.words.goal(target), target } : {}),
    };
    writeSession(MADE_KEY, record);
    // This device keeps the link, so the gift's page can offer it again long after this screen is gone.
    rememberGiftLink(result.giftId, result.claimUrl);
    // Made, so nothing is left on this device to pick up or to fill in again (D74).
    forgetPendingGift();
    clearedCardDraft();
    setKept(undefined);
    setMade(record);
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
        const next = nextFundingStep({ held: read.held, arriving: read.arriving, wanted });
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
            const quote = await postJson<{ to: `0x${string}`; data: `0x${string}`; value: string }>("/api/fund/quote", { amount: next.amount.toString() });
            await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
          } catch {
            setProblem(W.arrived.priceMoved);
            setPhase("waiting");
            working.current = false;
            return;
          }
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

  const commit = async (enough: boolean, arrived: boolean, way: WayIn = wayIn) => {
    setProblem(null);
    if (!address) {
      go("account");
      return;
    }
    if (enough) {
      setPhase("giving");
      go("paying");
      return;
    }
    setChosenWay(way);
    keepOnDevice(draft, way);
    setPhase("waiting");
    // The card service's page opens inside the tap, or the browser blocks it.
    if (!arrived) window.open(way.page, "_blank", "noopener,noreferrer");
    go("paying");
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
    const about = money.about(madeUnits);
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.made.title(formatAusd(madeUnits), made.recipientName)}>
        <section className="flex flex-col gap-[var(--space-sm)]">
          {about ? <p className={HELP}>{about}</p> : null}
          <p className={BODY}>
            {madeMilestone
              ? M.made.terms(formatAusd(madeUnits), made.goal ?? "", made.days, madeCondition?.source ?? "")
              : W.made.terms(formatAusd(madeUnits), made.days, formatAusd(day), day * BigInt(made.days) === madeUnits, madeCondition?.source ?? "")}
          </p>
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
              onClick={() => void navigator.share({ title: "Viky", text: W.made.shareText(made.recipientName), url: made.claimUrl }).catch(() => undefined)}
              className={SECONDARY_BUTTON}
            >
              {W.made.share}
            </button>
          ) : null}
          <p className={HELP}>{W.made.onlyThem(made.recipientName)}</p>
          <p className={HELP}>{W.made.findItAgain}</p>
        </section>
        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{W.made.nextTitle}</h2>
          <ol className={`flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)] ${BODY}`}>
            {(madeMilestone
              ? M.made.next(made.recipientName, madeCondition?.source ?? "", made.target ?? 0, made.days, settlingTimeInWords(made.atMs), made.namedByFunder === true)
              : W.made.next(made.recipientName, madeCondition?.words.theyConnect ?? W.made.theyConnectAny, madeCondition?.words.eachDay ?? "", formatAusd(day), settlingTimeInWords(made.atMs))
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>
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
        <p className={BODY}>{kept.recipientName ? W.waitingGift.which(formatAusd(dollarsToUnits(kept.dollars)), kept.recipientName) : W.waitingGift.whichUnnamed(formatAusd(dollarsToUnits(kept.dollars)))}</p>
        <button type="button" onClick={() => void signIn()} disabled={accountStatus === "busy"} className={PRIMARY_BUTTON}>
          {W.waitingGift.signIn}
        </button>
        <div className="flex flex-col gap-[var(--space-xs)]">
          <button type="button" onClick={differentGift} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
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
        <p className={BODY}>{keptOnDevice ? W.closed.kept(formatAusd(units ?? 0n), recipient) : W.closed.keptWhileOpen(formatAusd(units ?? 0n), recipient)}</p>
        <p className={HELP}>{W.closed.signInAgain}</p>
        <AccountPanel returning signInOnly />
      </Shell>
    );
  }

  // Nothing filled in on the card, so there is nothing here to pay for.
  if (!ready || units === null || !condition) {
    return (
      <Shell kind="task" back="/" step={O.nothingToPay.title}>
        <p className={BODY}>{O.nothingToPay.body}</p>
        <Link href="/" className={PRIMARY_BUTTON}>
          {O.nothingToPay.action}
        </Link>
      </Shell>
    );
  }

  const gift = formatAusd(units);

  // One account, and then you can pay.
  if (step === "account") {
    return (
      <Shell kind="task" back="/" backLabel={O.backToCard} step={W.account.title}>
        <p className={BODY}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, days)}</p>
        <p className={HELP}>{W.account.why}</p>
        <AccountPanel />
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Paying: the wait, the payment arriving, the gift being made.
  if (step === "paying" && address) {
    const held = balance ?? 0n;
    if (phase === "converting" || phase === "giving") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <Working
            says={`${phase === "converting" ? W.arrived.gettingReady : W.arrived.putting(arrivedFigure, gift, recipient)} ${W.arrived.takesSeconds}`}
            and={phase === "giving" ? W.arrived.pageMayClose : undefined}
          />
          {/* The gift stays in sight while it is being made (audit C, 10.3). */}
          <p className={HELP}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, days)}</p>
        </Shell>
      );
    }
    if (phase === "short" && arrivedFigure) {
      const more = eurosToBuyOn(units - held, wayIn, money.rates?.usdPerEur) ?? wayIn.smallestEur;
      const makeIt = twoDecimalsDown(held, 6);
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <p className={BODY}>{W.arrived.short(arrivedFigure, gift, more, `$${makeIt}`)}</p>
          <button
            type="button"
            onClick={() => {
              window.open(wayIn.page, "_blank", "noopener,noreferrer");
              setPhase("waiting");
            }}
            className={PRIMARY_BUTTON}
          >
            {W.arrived.payMore(more)}
          </button>
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
        </section>
        {problem ? <FieldRefusal id="waiting-refused">{problem}</FieldRefusal> : null}
        <section className={CARD}>
          <p className="font-medium">{W.waiting.setThese(wayIn.name)}</p>
          <ul className={`flex flex-col gap-[var(--space-xs)] ${BODY}`}>
            {W.waiting.settings(toBuy, wayIn.delivers).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={HELP}>{W.waiting.theirWords(wayIn.name, wayIn.delivers)}</p>
          {/* What the wait ends with: money a gift can hold at once, or a step the person confirms (D101). */}
          <p className={HELP}>{wayIn.arrives === "gift" ? W.waiting.thenNothing : W.waiting.thenChanged}</p>
          <p className="font-medium">{W.waiting.codeLabel(wayIn.name)}</p>
          <p className="select-all break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
          <button type="button" onClick={() => copy("code", address)} className={SECONDARY_BUTTON}>
            {copied === "code" ? W.waiting.copied : W.waiting.copy}
          </button>
          {copyRefused === "code" ? <FieldRefusal id="code-refused">{W.waiting.copyRefused}</FieldRefusal> : null}
          <p className={HELP}>{W.waiting.startsEnds(start, end)}</p>
        </section>
        <p className={BODY}>
          {wayIn.takes ? `${W.check.delay(wayIn.name, wayIn.takes)} ` : ""}
          {keptOnDevice ? W.waiting.leave : W.waiting.stay}
        </p>
        <a href={wayIn.page} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
          {W.waiting.openAgain(wayIn.name)}
        </a>
        <div className="flex flex-col gap-[var(--space-xs)]">
          <button type="button" onClick={differentGift} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
            {W.waiting.different}
          </button>
          <p className={HELP}>{W.waiting.staysInAccount}</p>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // What it costs, and the ways in. The gift itself is read back from the card rather than asked again.
  const enough = balance !== null && units !== null && balance >= units;
  const arrived = !enough && pending !== null && paymentArrived(pending);
  const short = !enough && !arrived && address !== undefined;
  const held = balance ?? 0n;
  const waysIn = orderRails(WAYS_IN, railIn.waysIn);
  const payingOn = (way: WayIn) => {
    const euros = eurosToBuyOn(units - held, way, money.rates?.usdPerEur);
    const arrives = euros === undefined ? undefined : arrivesInDollars(euros, way, money.rates?.usdPerEur);
    const stays = arrives === undefined ? undefined : Math.floor(Number(held) / 1_000_000 + arrives - Number(units) / 1_000_000);
    return { euros, arrives, stays };
  };
  const about = money.about(units);

  return (
    <Shell kind="task" back="/" backLabel={O.backToCard} step={O.pay(gift)}>
      {/* The card, read back: what it is, for whom, on what, for how long. Changing any of it happens on the card
          itself, so there are no "change" links here and no screen of rows to read twice (vision, section 6). */}
      <dl className="flex flex-col divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
        <Line label={W.check.rows.for} value={O.forNames(recipient, funder)} />
        <Line label={W.check.rows.what} value={condition.name} />
        {subject ? <Line label={milestone?.condition.link.kind === "username" ? M.check.rows.name : certificate ? certificate.words.nameLabel : (condition.link.kind === "username" ? condition.link.row : "")} value={subject} /> : null}
        {milestone && cadence ? <Line label={M.check.rows.cadence} value={cadence.label} /> : null}
        {milestone || certificate ? <Line label={M.check.rows.reach} value={certificate ? certificate.target.inWords(target) : String(target)} /> : null}
        {!milestone && !certificate && condition.target ? <Line label={W.check.rows.dayCounts} value={condition.target.inWords(target)} /> : null}
        <Line label={W.check.rows.goes} value={about ? `${gift} (${about})` : gift} />
        <Line
          label={milestone || certificate ? M.check.rows.long : W.check.rows.dayEarned}
          value={
            milestone
              ? milestone.words.durationInWords(days)
              : certificate
                ? certificate.words.durationInWords(days)
                : perDay !== null
                  ? W.check.dayEarned(formatAusd(perDay), exact, days)
                  : ""
          }
        />
      </dl>

      <section className="flex flex-col gap-[var(--space-sm)]">
        {milestone ? (
          <>
            <p className={BODY}>{M.check.howItWorks(condition.source, target, settlingTimeInWords(nowMs))}</p>
            <p className={BODY}>{M.check.whyCeiling(target)}</p>
          </>
        ) : certificate ? (
          <>
            {/* What the certificate has to show, and what happens if none arrives: both said before anything is paid. */}
            <p className={BODY}>{certificate.words.mustShow(subject, target)}</p>
            <p className={BODY}>{certificate.words.ifNot}</p>
          </>
        ) : (
          <p className={BODY}>{W.check.missed(settlingTimeInWords(nowMs))}</p>
        )}
        {/* The one sentence that changes what a person does next stays in the body: a link opens for whoever opens
            it first. What only some readers need goes behind a disclosure (GOV.UK Details). */}
        <p className="font-medium">{W.check.linkRisk(recipient)}</p>
        <details>
          <summary className="cursor-pointer font-medium">{W.check.elseTitle}</summary>
          <p className={BODY}>{W.check.namesSeen(recipient, funder)}</p>
          <p className={BODY}>{milestone ? M.check.fourteenDays : W.check.fourteenDays}</p>
        </details>
      </section>

      {short
        ? waysIn.map((way: WayIn, index: number) => {
            const { euros, arrives, stays } = payingOn(way);
            return (
              <section key={way.name} className={CARD}>
                <h2 className={TITLE}>{W.check.payingWith(way.name)}</h2>
                <dl className="flex flex-col gap-[var(--space-sm)]">
                  <Line label={W.check.youPay} value={euros === undefined ? W.check.byCardUnknown : W.check.byCard(euros)} />
                  {held > 0n ? <Line label={W.check.alreadyHeld} value={formatAusd(held)} /> : null}
                  {arrives !== undefined ? <Line label={W.check.arrives} value={W.check.aboutDollars(Math.floor(arrives))} /> : null}
                  <Line label={W.check.rows.goes} value={gift} />
                  {stays !== undefined && stays > 0 ? <Line label={W.check.staysYours} value={W.check.aboutDollars(stays)} /> : null}
                </dl>
                <p className={HELP}>{feeSentence(way)}.</p>
                <details>
                  <summary className={`${HELP} cursor-pointer`}>{W.check.feeTitle(way.name)}</summary>
                  <p className={HELP}>{way.arrives === "gift" ? W.check.nothingToSwap : W.check.swapAfter}</p>
                  <p className={HELP}>{W.check.smallest(way.name, way.smallestEur)}</p>
                  <p className={HELP}>{CASH_OUT.sourceLine(way.source, way.read)}</p>
                </details>
                {/* The same rule as the way out (R1): what that service says about this country today, read live,
                    and nothing said at all about one that could not be read. */}
                {railIn.country && railIn.waysIn[way.name] === "does-not" ? (
                  <p className={HELP}>{CASH_OUT.noPayInThere(way.name, countryInWords(railIn.country) ?? railIn.country.toUpperCase())}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void commit(false, false, way)}
                  disabled={Boolean(address) && balance === null}
                  className={index === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON}
                >
                  {euros === undefined ? W.check.payWith(way.name) : W.check.payWithFor(way.name, euros)}
                </button>
              </section>
            );
          })
        : null}
      {arrived ? (
        <section className={CARD}>
          <h2 className={TITLE}>{W.check.paying}</h2>
          <p className={BODY}>{arrivedWorth && arrivedWorth !== "unknown" ? W.check.arrivedWorth(arrivedWorth) : W.check.arrivedLater}</p>
          <p className={HELP}>{W.check.arrivedUse(gift, recipient)}</p>
        </section>
      ) : null}
      {enough ? <p className={HELP}>{W.check.fromAccount(formatAusd(held))}</p> : null}

      <div className="flex flex-col gap-[var(--tap-gap)]">
        {/* Money already there, or a payment that landed, is one action; paying is on the card of the way in. */}
        {!address || enough || arrived ? (
          <button type="button" onClick={() => void commit(enough, arrived)} disabled={Boolean(address) && balance === null} className={PRIMARY_BUTTON}>
            {!address ? W.continue : enough ? W.check.putIt(gift, recipient) : W.check.useArrived}
          </button>
        ) : null}
        <Link href="/" className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.notNow}
        </Link>
      </div>
      {problem ? <FieldRefusal id="check-refused">{problem}</FieldRefusal> : null}
    </Shell>
  );
}
