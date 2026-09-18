"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { checkSourceName, prepareGift, submitGift, type CreatedGift } from "@/src/client/gift";
import { prepareCertificateGift, submitCertificateGift } from "@/src/client/certificate-gift";
import { loadOfferedConditions, prepareMilestoneGift, readStanding, submitMilestoneGift } from "@/src/client/milestone";
import { isValidDetScore, normaliseCertificateName } from "@/src/duolingo-english-test";
import { attemptFor, forgetsAttempt, GIFT_ATTEMPT_KEY, isCertificateRequest, isMilestoneRequest } from "@/src/gift-attempt";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { chooserSections, conditionById, liveConditions, type Condition } from "@/src/conditions";
import { GOAL_TYPE_DUOLINGO_COURSE_XP } from "@/src/gift-terms";
import { cadenceOf, certificateOf, milestoneOf, type MilestoneCondition } from "@/src/milestone-conditions";
import { checkTarget, inPlainWords, MilestoneTermsError, smallestTarget } from "@/src/milestone-terms";
import { whenInWords } from "@/src/display-currency";
import { twoDecimalsDown } from "@/src/exit-steps";
import { CONVERSION_RESERVE, nextFundingStep, paymentArrived } from "@/src/funding-step";
import { arrivesInDollars, eurosToBuyOn, SUGGESTED_GIFT_DOLLARS } from "@/src/gift-amount";
import { giftNameProblem, tidyGiftName, type GiftNameProblem } from "@/src/gift-names";
import { rememberGiftLink } from "@/src/gift-link-memory";
import { formatAusd } from "@/src/gift-reader";
import { AmountError, dollarsToUnits } from "@/src/money";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { forgetPendingGift, loadPendingGift, peekPendingGift, savePendingGift, type PendingGift } from "@/src/pending-gift";
import { whereTheRailsServe } from "@/src/client/rails";
import { countryInWords, orderRails, type RailReach } from "@/src/rail-country";
import { feeSentence, WAYS_IN, type WayIn } from "@/src/rails";
import { CASH_OUT, FUND as W, MILESTONE_FUND as M } from "@/src/sentences";
import { ChoiceList } from "../kit/ChoiceList";
import { FieldRefusal } from "../kit/FieldRefusal";
import { Shell } from "../kit/Shell";
import { AccountPanel } from "./AccountPanel";
import { BODY, CARD, FIELD, HELP, MONEY, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "./ui";

/**
 * Offering a gift, flows F1 to F11 on the product structure of 17 Sep 2026 (section 5).
 *
 * One question per page, each with its own address (`?step=`), so the phone's own back gesture goes one step back and
 * the shell's back link sits at the same place on every step: who it is for, what they will do, the condition's own
 * detail, how much and for how long, then the check. What was typed is kept for the tab (sessionStorage), so a reload
 * loses nothing and a step reached without what it needs sends the person to the first question it lacks.
 *
 * Then the money. Someone pays by card and never sees what carries it. Which company takes the card is one object,
 * `WAY_IN` (D42), and its page ignores anything we could pass (D32), so the person sets it by hand from a list in its
 * own words. The terms are written to the device before its page opens (D74): a card payment can outlast the session,
 * and the gift is picked up again when the same account signs in. The page watches the account, turns what arrived
 * into what a gift holds, and makes the gift with one signature (D33).
 *
 * Nothing on these screens names a source: what a condition is called, what its name field asks, what counts as a
 * day, all come from the register (src/conditions.ts). The words are in src/sentences.ts, `FUND`.
 */

const POLL_MS = 8_000;
const DRAFT_KEY = "viky.giftDraft";
const MADE_KEY = "viky.giftMade";

type Step = "who" | "what" | "detail" | "amount" | "check" | "account" | "paying" | "done";
const ALL_STEPS: readonly Step[] = ["who", "what", "detail", "amount", "check", "account", "paying", "done"];

type Draft = Readonly<{
  recipientName: string;
  funderName: string;
  conditionId: string | null;
  username: string;
  dollars: string;
  days: string;
  target: string;
  /** The one course a day is counted on, and the title its source gives it, when the source holds several (U1). */
  course: string;
  courseTitle: string;
  /** A milestone's cadence, and where the person stood in it, read for exactly this name and cadence (C2). */
  cadence: string;
  standing: number | null;
  standingReadAt: string;
  standingFor: string;
  /** Whether that reading had settled (D90); an unsettled one only ever reaches an operator's rehearsal gift. */
  standingSettled?: boolean;
  /** The best that account ever held in the cadence read, when the source gives one: shown, never judged (D91). */
  standingBest?: number | null;
}>;

const EMPTY_DRAFT: Draft = {
  recipientName: "",
  funderName: "",
  conditionId: null,
  username: "",
  dollars: String(SUGGESTED_GIFT_DOLLARS),
  days: "7",
  target: "",
  course: "",
  courseTitle: "",
  cadence: "",
  standing: null,
  standingReadAt: "",
  standingFor: "",
};

/** The name and the cadence a reading of where someone stands was taken for: a reading of anything else is no reading. */
const standingKey = (username: string, cadence: string) => `${username.trim().toLowerCase()}|${cadence}`;

/** The gift once made, kept for the tab: the link exists nowhere else, and a reload must not lose it. */
type Made = Readonly<{
  giftId: string;
  claimUrl: string;
  atMs: number;
  recipientName: string;
  conditionId: string;
  amount: string;
  days: number;
  /** A milestone's goal in words and its target, for the confirmation (C2). */
  goal?: string;
  target?: number;
}>;

type Phase = "waiting" | "converting" | "giving" | "short" | "failed";

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
    // A tab that refuses storage keeps the draft in memory for as long as it stays open.
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

function nameRefusal(problem: GiftNameProblem | undefined, empty: string): string | undefined {
  if (problem === "empty") return empty;
  if (problem === "tooLong") return W.who.refusals.tooLong;
  if (problem === "notText") return W.who.refusals.notText;
  return undefined;
}

function unitsOf(dollars: string): { units: bigint | null; refusal: string | undefined } {
  try {
    return { units: dollarsToUnits(dollars), refusal: undefined };
  } catch (error) {
    return { units: null, refusal: error instanceof AmountError ? error.message : W.failures.other };
  }
}

function daysOf(days: string, bounded?: { duration: { min: number; max: number }; words: { durationShape: (min: number, max: number) => string } }): { days: number | null; refusal: string | undefined } {
  if (bounded) {
    const { min, max } = bounded.duration;
    const value = Number(days.trim());
    return /^\d{1,3}$/.test(days.trim()) && value >= min && value <= max ? { days: value, refusal: undefined } : { days: null, refusal: bounded.words.durationShape(min, max) };
  }
  if (!/^\d{1,3}$/.test(days.trim())) return { days: null, refusal: W.amount.refusals.daysShape };
  const value = Number(days.trim());
  if (value < 7) return { days: null, refusal: W.amount.refusals.daysLow };
  if (value > 90) return { days: null, refusal: W.amount.refusals.daysHigh };
  return { days: value, refusal: undefined };
}

function targetOf(condition: Condition | undefined, target: string): { target: number | null; refusal: string | undefined } {
  if (!condition?.target) return { target: 1, refusal: undefined };
  if (!/^\d{1,5}$/.test(target.trim())) return { target: null, refusal: W.amount.refusals.targetShape };
  const value = Number(target.trim());
  if (value < condition.target.min) return { target: null, refusal: condition.target.tooLow };
  return { target: value, refusal: undefined };
}

/** A milestone's target, refused under its field when it is not a climb from where they stand today (D45). */
function climbOf(milestone: MilestoneCondition | undefined, standing: number | null, target: string): { target: number | null; refusal: string | undefined } {
  if (!milestone || standing === null) return { target: null, refusal: undefined };
  if (!/^\d{1,5}$/.test(target.trim())) return { target: null, refusal: milestone.words.refusals.targetShape };
  const value = Number(target.trim());
  try {
    checkTarget(milestone.shape, standing, value);
    return { target: value, refusal: undefined };
  } catch (error) {
    return { target: null, refusal: error instanceof MilestoneTermsError ? error.message : milestone.words.refusals.targetShape };
  }
}

/** A route's own typed sentence when it gave one; one plain line otherwise, never a library's words. */
function readable(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof AmountError) return error.message;
  return W.failures.other;
}

export function FundGift() {
  const { address, signIn, ensureSigner, status: accountStatus } = useAccount();
  // Money moves on this screen, so the session stays open thirty minutes rather than ten (decision 2, 17 Sep 2026).
  useMoneySession();
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const sharing = useSyncExternalStore(never, canShare, onServer);
  const params = useSearchParams();
  const asked = params.get("step");
  const step: Step = ALL_STEPS.includes(asked as Step) ? (asked as Step) : "who";

  const [draft, setDraft] = useState<Draft>(() => (typeof window === "undefined" ? EMPTY_DRAFT : { ...EMPTY_DRAFT, ...(readSession<Draft>(DRAFT_KEY) ?? {}) }));
  const [made, setMade] = useState<Made | null>(() => (typeof window === "undefined" ? null : readSession<Made>(MADE_KEY)));
  const [kept, setKept] = useState<PendingGift | undefined>(() => (typeof window === "undefined" ? undefined : peekPendingGift()));
  const [touched, setTouched] = useState<Readonly<Record<string, boolean>>>({});
  const [nameCheck, setNameCheck] = useState<{ checking: boolean; refusal?: string; checked?: string }>({ checking: false });
  /** What the source answered about that name: its courses, and the one it says is current (U1). */
  const [courses, setCourses] = useState<{ forName: string; list: readonly { id: string; title: string; xp: number }[] }>({ forName: "", list: [] });
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState<bigint | null>(null);
  const [arrivedWorth, setArrivedWorth] = useState<string | null | "unknown">(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [arrivedFigure, setArrivedFigure] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemCode, setProblemCode] = useState<string | null>(null);
  const [reading, setReading] = useState<{ busy: boolean; nameRefusal?: string; cadenceRefusal?: string }>({ busy: false });
  // What this viewer may offer beyond the live register: nothing, unless the account runs Viky (src/client/milestone.ts).
  const [preview, setPreview] = useState<{ ids: readonly string[]; loaded: boolean }>({ ids: [], loaded: false });
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [copyRefused, setCopyRefused] = useState<"code" | "link" | null>(null);
  const [keptOnDevice, setKeptOnDevice] = useState(true);
  const working = useRef(false);
  // Whether an account was signed in on this page before it went: then the session closed while paying (F8), rather
  // than a page opened again with nobody signed in (F9). Stored the way React stores what an earlier render saw.
  const [hadAccount, setHadAccount] = useState(false);
  /** What each rail that adds money says about this person's country, read live (R1). Never hides one. */
  const [railIn, setRailIn] = useState<{ country: string | null; waysIn: Readonly<Record<string, RailReach>> }>({ country: null, waysIn: {} });
  /** The way in the funder pressed, so the wait tells them what to set on the page they actually opened (D101). */
  const [wayIn, setWayIn] = useState<WayIn>(WAYS_IN[0]);
  if (address && !hadAccount) setHadAccount(true);
  // The reader's clock, read once a minute: the settling hour is said in it.
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);

  const money = useDisplayCurrency(address);
  const offered: readonly Condition[] = [...liveConditions(), ...preview.ids.map((id) => conditionById(id)).filter((entry): entry is Condition => entry !== undefined)];
  const condition = draft.conditionId ? offered.find((entry) => entry.id === draft.conditionId) : undefined;
  // Null while the list is short enough to stay one list; the register decides, not this screen.
  const sections = chooserSections(offered);
  const nameLink = condition?.link.kind === "username" ? condition.link : undefined;
  const milestone = milestoneOf(condition);
  // The other shape of milestone: something granted once, with a day on it. It asks for a name and a score, and
  // nothing about where anybody stands, because no page says "not yet obtained" (D47).
  const certificate = certificateOf(condition);
  const bounded = milestone ?? certificate;
  const cadence = milestone ? cadenceOf(milestone, draft.cadence) : undefined;
  // The condition's own detail: the name a source reads, and what counts as a day or the rating to reach (structure,
  // section 5, step 3).
  const hasDetail = Boolean(nameLink || condition?.target || milestone || certificate);
  const numbered: Step[] = ["who", "what", ...(hasDetail || !condition ? (["detail"] as Step[]) : []), "amount", "check"];

  const recipientRefusal = nameRefusal(giftNameProblem(draft.recipientName), W.who.refusals.recipientEmpty);
  const funderRefusal = nameRefusal(giftNameProblem(draft.funderName), W.who.refusals.funderEmpty);
  const namesReady = !recipientRefusal && !funderRefusal;
  const shapeRefusal = nameLink?.check && draft.username.trim() !== "" && !nameLink.check.valid(draft.username.trim()) ? nameLink.check.refusals.shape : undefined;
  const amount = unitsOf(draft.dollars);
  const length = daysOf(draft.days, bounded);
  const daily = targetOf(condition, draft.target);
  // A reading counts only for the name and the cadence it was taken for.
  const standingFresh = milestone !== undefined && draft.standing !== null && draft.standingFor === standingKey(draft.username, draft.cadence);
  const climb = climbOf(milestone, standingFresh ? draft.standing : null, draft.target);
  const personName = draft.username.trim();
  const certificateName = certificate && normaliseCertificateName(personName).split(" ").filter(Boolean).length >= 2;
  const certificateTarget = certificate && isValidDetScore(Number(draft.target));
  const detailReady = milestone
    ? standingFresh && climb.target !== null && cadence !== undefined
    : certificate
      ? Boolean(certificateName && certificateTarget)
      : daily.target !== null;
  const amountReady = amount.units !== null && length.days !== null;
  const termsReady = amountReady && detailReady;
  const perDay = amount.units !== null && length.days !== null ? amount.units / BigInt(length.days) : null;
  const exact = perDay !== null && length.days !== null && amount.units !== null && perDay * BigInt(length.days) === amount.units;
  const recipient = tidyGiftName(draft.recipientName);
  const funder = tidyGiftName(draft.funderName);

  const update = (change: Partial<Draft>) => {
    setDraft((current) => {
      const next = { ...current, ...change };
      writeSession(DRAFT_KEY, next);
      return next;
    });
  };
  const go = (next: Step) => {
    setProblem(null);
    setProblemCode(null);
    window.history.pushState(null, "", `?step=${next}`);
    window.scrollTo(0, 0);
  };
  const replace = (next: Step) => window.history.replaceState(null, "", `?step=${next}`);

  const refresh = useCallback(async () => {
    if (!address) return;
    const [held, arriving] = await Promise.all([readAusdBalance(address), readMonBalance(address)]);
    setBalance(held);
    setPending(arriving);
    return { held, arriving };
  }, [address]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  // Asked once a screen exists: what the rail that adds money says about the country the connection and the device
  // agree on. Nothing read is nothing said (R1).
  useEffect(() => {
    let live = true;
    whereTheRailsServe()
      .then((answer) => {
        if (live) setRailIn({ country: answer.country, waysIn: answer.waysIn });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Asked again when the account changes: signing in as an account that runs Viky is what shows a condition before it is live.
  useEffect(() => {
    let live = true;
    loadOfferedConditions().then(
      (result) => {
        if (live) setPreview({ ids: result.preview, loaded: true });
      },
      () => {
        if (live) setPreview({ ids: [], loaded: true });
      },
    );
    return () => {
      live = false;
    };
  }, [address]);

  // A step reached without what it needs goes to the first question it lacks; a gift kept on this device for this
  // account is picked up where it stopped (D74); the account step has nothing to offer once there is an account.
  useEffect(() => {
    if (!browser) return;
    if (step === "done") {
      if (!made) replace("who");
      return;
    }
    const complete = namesReady && condition !== undefined && termsReady;
    if (address && (step === "who" || step === "paying")) {
      const saved = loadPendingGift(address);
      // Picked up on the first step, or on the paying step of a tab that has not got the terms (another tab, a new
      // window): the device's copy is the one that counts.
      if (saved && (step === "who" || !complete)) {
        void Promise.resolve().then(() => {
          const next: Draft = {
            recipientName: saved.recipientName,
            funderName: saved.funderName,
            conditionId: saved.conditionId,
            username: saved.username,
            dollars: saved.dollars,
            days: saved.days,
            target: saved.target,
            course: saved.course ?? "",
            courseTitle: saved.courseTitle ?? "",
            cadence: saved.cadence ?? "",
            standing: saved.standing ?? null,
            standingReadAt: saved.standingReadAt ?? "",
            standingFor: saved.cadence ? standingKey(saved.username, saved.cadence) : "",
          };
          writeSession(DRAFT_KEY, next);
          setDraft(next);
          replace("paying");
        });
        return;
      }
    }
    if (step === "account" && address) {
      replace("check");
      return;
    }
    if (step === "paying") {
      // Paying needs the terms, from this tab or from the device; without either there is nothing to pay for.
      if (address ? !loadPendingGift(address) && !complete : !hadAccount && !kept) replace(complete ? "check" : "who");
      return;
    }
    if (step === "who") return;
    // A condition this account may offer before it is live is only known once the server has said so.
    if (draft.conditionId && !condition && !preview.loaded) return;
    if (!namesReady) replace("who");
    else if (!condition) replace("what");
    else if (step !== "detail" && !detailReady) replace("detail");
    else if ((step === "check" || step === "account") && !amountReady) replace("amount");
    // `replace` and the values it reads change on every render; the step and the account are what decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browser, step, address, made, preview.loaded]);

  // On the check, a card payment sitting in the account is valued before it is used (audit C, 9.1).
  useEffect(() => {
    if (step !== "check" || !address || pending === null || !paymentArrived(pending)) return;
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
    if (!condition || amount.units === null || length.days === null) throw new Error(W.failures.other);
    // Signed once for these terms and sent again as it is on every retry, so the server finds the same creation and
    // never pays for the gift twice (D87). A milestone's target and starting reading are part of its terms.
    const terms = {
      account: account.address,
      username: draft.username.trim(),
      recipientName: recipient,
      funderName: funder,
      // A gift counted on one course is its own goal on the contract (U1), so the course is part of the terms signed.
      goalType: milestone ? (cadence?.goalType ?? 0) : draft.course ? GOAL_TYPE_DUOLINGO_COURSE_XP : (condition.goalType ?? 0),
      course: milestone ? "" : draft.course,
      dailyTarget: milestone ? 0 : (daily.target ?? 0),
      durationDays: length.days,
      amount: amount.units.toString(),
      ...(milestone ? { target: climb.target ?? 0, standing: draft.standing ?? 0 } : {}),
    };
    let request = attemptFor(readSession(GIFT_ATTEMPT_KEY), terms);
    if (!request && certificate) {
      request = await prepareCertificateGift({
        account,
        certificate,
        personName,
        target: Number(draft.target),
        durationDays: length.days,
        amount: amount.units,
        recipientName: recipient,
        funderName: funder,
      });
    }
    if (!request && milestone) {
      if (!cadence || draft.standing === null || climb.target === null) throw new Error(W.failures.other);
      request = await prepareMilestoneGift({
        account,
        milestone,
        cadenceGoalType: cadence.goalType,
        cadence: cadence.id,
        username: terms.username,
        standing: draft.standing,
        standingReadAt: draft.standingReadAt,
        target: climb.target,
        durationDays: length.days,
        amount: amount.units,
        recipientName: recipient,
        funderName: funder,
      });
    }
    if (!request) {
      if (daily.target === null || terms.goalType === 0) throw new Error(W.failures.other);
      request = await prepareGift({
        account,
        duolingoUsername: terms.username || undefined,
        course: terms.course || undefined,
        recipientName: recipient,
        funderName: funder,
        goalType: terms.goalType,
        dailyTarget: daily.target,
        durationDays: length.days,
        amount: amount.units,
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
      amount: amount.units.toString(),
      days: length.days,
      ...(milestone && cadence && climb.target !== null ? { goal: milestone.words.goal(climb.target, cadence.label), target: climb.target } : {}),
      ...(certificate && certificateTarget ? { goal: certificate.words.goal(Number(draft.target)), target: Number(draft.target) } : {}),
    };
    writeSession(MADE_KEY, record);
    // This device keeps the link, so the gift's page can offer it again long after this screen is gone.
    rememberGiftLink(result.giftId, result.claimUrl);
    writeSession(DRAFT_KEY, null);
    // Made, so nothing is left to pick up again on this device (D74).
    forgetPendingGift();
    setKept(undefined);
    setMade(record);
    setDraft(EMPTY_DRAFT);
    replace("done");
    window.scrollTo(0, 0);
  }, [ensureSigner, condition, milestone, certificate, certificateTarget, draft.target, personName, cadence, climb.target, draft.standing, draft.standingReadAt, draft.course, amount.units, length.days, daily.target, draft.username, recipient, funder]);

  // While paying: watch the account, turn what arrived into what a gift holds, then make the gift.
  useEffect(() => {
    if (step !== "paying" || !address || amount.units === null || phase === "short" || phase === "failed") return;
    const wanted = amount.units;
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
  }, [step, address, amount.units, phase, refresh, give, ensureSigner]);

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

  const keepOnDevice = (dollars = draft.dollars, way: WayIn = wayIn) => {
    if (!address) return;
    setKeptOnDevice(
      savePendingGift({
        account: address,
        recipientName: recipient,
        funderName: funder,
        conditionId: condition?.id ?? "",
        username: draft.username.trim(),
        dollars,
        days: draft.days,
        target: draft.target,
        ...(draft.course ? { course: draft.course, courseTitle: draft.courseTitle } : {}),
        wayIn: way.name,
        ...(milestone && draft.standing !== null ? { cadence: draft.cadence, standing: draft.standing, standingReadAt: draft.standingReadAt } : {}),
      }),
    );
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
    // Written down before anything else, so a payment that outlasts the session does not lose the gift (D74).
    setWayIn(way);
    keepOnDevice(undefined, way);
    setPhase("waiting");
    // The card service's page opens inside the tap, or the browser blocks it.
    if (!arrived) window.open(way.page, "_blank", "noopener,noreferrer");
    go("paying");
  };

  const differentGift = () => {
    forgetPendingGift();
    setKept(undefined);
    writeSession(DRAFT_KEY, null);
    setDraft(EMPTY_DRAFT);
    setPhase("waiting");
    setProblem(null);
    replace("who");
  };

  if (!browser) {
    return (
      <Shell kind="task">
        <p className={HELP}>One moment</p>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // F10. It is in their name.
  if (step === "done" && made) {
    const madeCondition = conditionById(made.conditionId);
    const madeMilestone = made.goal !== undefined && made.target !== undefined;
    const units = BigInt(made.amount);
    const day = units / BigInt(made.days);
    const about = money.about(units);
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.made.title(formatAusd(units), made.recipientName)}>
        <section className="flex flex-col gap-[var(--space-sm)]">
          {about ? <p className={HELP}>{about}</p> : null}
          <p className={BODY}>
            {madeMilestone
              ? M.made.terms(formatAusd(units), made.goal ?? "", made.days, madeCondition?.source ?? "")
              : W.made.terms(formatAusd(units), made.days, formatAusd(day), day * BigInt(made.days) === units, madeCondition?.source ?? "")}
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
        </section>
        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{W.made.nextTitle}</h2>
          <ol className={`flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)] ${BODY}`}>
            {(madeMilestone
              ? M.made.next(made.recipientName, madeCondition?.source ?? "", made.target ?? 0, made.days, settlingTimeInWords(made.atMs))
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
  // F9. A gift waiting on this device, and nobody signed in: one path.
  if (!address && kept && step !== "account" && !hadAccount) {
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

  // ---------------------------------------------------------------------------------------------------------------
  // F8. The session closed while paying.
  if (!address && step === "paying") {
    const units = amount.units ?? 0n;
    return (
      <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.closed.title}>
        <p className={BODY}>{keptOnDevice ? W.closed.kept(formatAusd(units), recipient) : W.closed.keptWhileOpen(formatAusd(units), recipient)}</p>
        <p className={HELP}>{W.closed.signInAgain}</p>
        <AccountPanel returning signInOnly />
      </Shell>
    );
  }

  const caption = (current: Step) => W.step(numbered.indexOf(current) + 1, numbered.length);

  // ---------------------------------------------------------------------------------------------------------------
  // F2. Who is it for?
  if (step === "who") {
    return (
      <Shell kind="task" back="/" caption={caption("who")} step={W.who.title}>
        <form
          className="flex flex-col gap-[var(--space-xl)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (namesReady) go("what");
            else setTouched({ recipient: true, funder: true });
          }}
        >
          <Field
            id="recipient-name"
            label={W.who.recipientLabel}
            value={draft.recipientName}
            onChange={(value) => update({ recipientName: value })}
            onBlur={() => setTouched((current) => ({ ...current, recipient: true }))}
            refusal={touched.recipient || giftNameProblem(draft.recipientName) !== "empty" ? recipientRefusal : undefined}
            autoComplete="off"
          />
          <Field
            id="funder-name"
            label={W.who.funderLabel}
            help={W.who.funderHelp}
            value={draft.funderName}
            onChange={(value) => update({ funderName: value })}
            onBlur={() => setTouched((current) => ({ ...current, funder: true }))}
            refusal={touched.funder || giftNameProblem(draft.funderName) !== "empty" ? funderRefusal : undefined}
            autoComplete="nickname"
          />
          <div className="flex flex-col gap-[var(--space-sm)]">
            <p className={HELP}>{W.who.seen}</p>
            <p className={HELP}>{W.who.neverWrites}</p>
          </div>
          <button type="submit" disabled={!namesReady} className={PRIMARY_BUTTON}>
            {W.continue}
          </button>
        </form>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // What will they do? Only what works from end to end, nothing chosen for them (structure, section 5).
  if (step === "what") {
    // liveConditions() is what everybody is offered; `offered` adds, for an account that runs Viky only, a condition
    // wired from end to end whose first real gift has not run yet, and says so under it.
    //
    // One line under each condition, from the register: what the source reads and what that is worth. It carried what
    // U2's own line said, which sat under it and repeated it (founder, 18 Sep 2026).
    const optionOf = (entry: Condition) => ({
      value: entry.id,
      label: entry.name,
      help: entry.live ? entry.help : `${entry.help} ${M.operatorOnly}`,
    });
    const chooseCondition = (id: string) => {
      const chosen = offered.find((entry) => entry.id === id);
      if (!chosen) return;
      const chosenCertificate = certificateOf(chosen);
      const chosenBounded = milestoneOf(chosen) ?? chosenCertificate;
      // Three shapes, three meanings for the same three fields: a daily target is not a rating to reach and not a
      // score on an exam, a name is a username on one source or a person's legal name on a certificate, and the days
      // are bounded differently. Anything carried over from another shape would be wrong, so nothing is.
      const shapeOf = (entry: Condition | undefined) => (!entry ? "none" : certificateOf(entry) ? "certificate" : milestoneOf(entry) ? "climb" : "daily");
      const sameShape = shapeOf(condition) === shapeOf(chosen);
      update({
        conditionId: id,
        target: sameShape ? draft.target : String(chosenCertificate?.target.suggested ?? chosen.target?.suggested ?? ""),
        days: sameShape ? draft.days : String(chosenBounded ? chosenBounded.duration.suggested : 7),
        username: sameShape ? draft.username : "",
      });
    };
    return (
      <Shell kind="task" back="/" caption={caption("what")} step={W.what.title}>
        {/* One list while there are few, one section per family from six on: the register decides which, and both are
            the same radio group, so the choice stays single either way (design audit, section 3). */}
        {sections === null ? (
          <ChoiceList name="condition" legend={W.what.title} legendHidden options={offered.map(optionOf)} value={condition?.id ?? null} onChange={chooseCondition} />
        ) : (
          sections.map((section) => (
            <ChoiceList
              key={section.family}
              name="condition"
              legend={section.title}
              options={section.conditions.map(optionOf)}
              value={condition?.id ?? null}
              onChange={chooseCondition}
            />
          ))
        )}
        <button type="button" disabled={!condition} onClick={() => go(hasDetail ? "detail" : "amount")} className={PRIMARY_BUTTON}>
          {W.continue}
        </button>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // A milestone's detail (C2): whose rating, which one, and the rating to reach, with where they stand today read
  // before anything is chosen, because the target is only a climb from there (D45).
  if (step === "detail" && condition && milestone && nameLink) {
    const typed = draft.username.trim();
    const nameShape = typed !== "" && !milestone.validName(typed) ? milestone.words.refusals.nameShape : undefined;
    const readNow = async () => {
      if (!milestone.validName(typed)) {
        setReading({ busy: false, nameRefusal: milestone.words.refusals.nameShape });
        return;
      }
      if (!cadence) {
        setReading({ busy: false, cadenceRefusal: milestone.words.refusals.noCadence });
        return;
      }
      setReading({ busy: true });
      try {
        const found = await readStanding(milestone.standingPath, typed, cadence.id);
        // A rating still settling moves far more than a climb can measure (D90): refused, except to an account that runs
        // Viky offering a condition that is not live yet, which is how the rehearsal gift is made, and it is told so.
        if (!found.settled && condition.live) {
          update({ standing: null, standingFor: "" });
          setReading({ busy: false, cadenceRefusal: milestone.words.refusals.settling });
          return;
        }
        update({
          username: found.username,
          standing: found.rating,
          standingReadAt: found.readAt,
          standingFor: standingKey(found.username, cadence.id),
          standingSettled: found.settled,
          standingBest: found.best,
          target: String(smallestTarget(milestone.shape, found.rating)),
        });
        setReading({ busy: false });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "";
        if (code === "NO_RATING") setReading({ busy: false, cadenceRefusal: milestone.words.refusals.noRating(cadence.label) });
        else if (code === "NO_SUCH_PROFILE") setReading({ busy: false, nameRefusal: milestone.words.refusals.notFound });
        // The source has closed the account: the name is the thing to change, so the refusal sits under the name (U1).
        else if (code === "ACCOUNT_CLOSED") setReading({ busy: false, nameRefusal: milestone.words.refusals.closed });
        else if (code === "INVALID_USERNAME") setReading({ busy: false, nameRefusal: milestone.words.refusals.nameShape });
        else setReading({ busy: false, nameRefusal: milestone.words.refusals.unavailable });
      }
    };
    const standing = standingFresh ? draft.standing : null;
    return (
      <Shell kind="task" back="/" caption={caption("detail")} step={condition.detailTitle}>
        <form
          className="flex flex-col gap-[var(--space-xl)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!standingFresh) void readNow();
            else if (climb.target !== null) go("amount");
            else setTouched((current) => ({ ...current, target: true }));
          }}
        >
          <div className="flex flex-col gap-[var(--space-sm)]">
            <Field
              id="source-name"
              label={nameLink.label}
              help={nameLink.help}
              value={draft.username}
              onChange={(value) => {
                update({ username: value });
                setReading({ busy: false });
              }}
              refusal={nameShape ?? reading.nameRefusal}
              autoComplete="off"
              spellCheck={false}
            />
            {nameLink.why ? <p className={HELP}>{nameLink.why}</p> : null}
          </div>
          <div className="flex flex-col gap-[var(--space-xs)]">
            <ChoiceList
              name="cadence"
              legend={milestone.words.cadenceQuestion}
              options={milestone.cadences.map((entry) => ({ value: entry.id, label: entry.label, help: entry.help }))}
              value={cadence?.id ?? null}
              onChange={(id) => {
                update({ cadence: id });
                setReading({ busy: false });
              }}
            />
            <FieldRefusal id="cadence-refusal">{reading.cadenceRefusal}</FieldRefusal>
          </div>
          {standing !== null && cadence ? (
            <div className="flex flex-col gap-[var(--space-sm)]">
              <Field
                id="gift-target"
                label={milestone.words.targetLabel}
                help={`${milestone.words.today(standing, cadence.label)} ${M.detail.smallest(smallestTarget(milestone.shape, standing))}`}
                value={draft.target}
                onChange={(value) => update({ target: value })}
                refusal={draft.target.trim() === "" && !touched.target ? undefined : climb.refusal}
                onBlur={() => setTouched((current) => ({ ...current, target: true }))}
                inputMode="numeric"
              />
              {climb.target !== null ? <p className={BODY}>{inPlainWords(milestone.shape, standing, climb.target)}</p> : null}
              {draft.standingBest !== null && draft.standingBest !== undefined ? <p className={HELP}>{milestone.words.best(draft.standingBest)}</p> : null}
              {draft.standingSettled === false ? <p className="font-medium">{M.detail.settlingRehearsal}</p> : null}
            </div>
          ) : null}
          <button type="submit" disabled={reading.busy || nameShape !== undefined || (standingFresh && climb.target === null)} className={PRIMARY_BUTTON}>
            {reading.busy ? M.detail.reading : standingFresh ? W.continue : M.detail.read}
          </button>
        </form>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The condition's own detail: for a source read by name, that name, checked before any money moves (decision 10);
  // for a daily condition, what counts as a day.
  // A certificate's detail (U3): the name the certificate will carry, and the score to reach. Nothing is read here,
  // because the page a certificate has does not exist until the test has been sat.
  if (step === "detail" && condition && certificate) {
    const nameRefusal = personName !== "" && !certificateName ? certificate.words.refusals.nameShape : undefined;
    const targetRefusal = draft.target.trim() !== "" && !certificateTarget ? certificate.words.refusals.targetShape : undefined;
    return (
      <Shell kind="task" back="/" caption={caption("detail")} step={certificate.words.detailQuestion}>
        <form
          className="flex flex-col gap-[var(--space-xl)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (detailReady) go("amount");
            else setTouched((current) => ({ ...current, target: true }));
          }}
        >
          <Field
            id="person-name"
            label={certificate.words.nameLabel}
            help={certificate.words.nameHelp}
            value={draft.username}
            onChange={(value) => update({ username: value })}
            refusal={touched.target || personName !== "" ? nameRefusal : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Field
            id="certificate-target"
            label={certificate.target.label}
            help={certificate.target.help}
            value={draft.target}
            onChange={(value) => update({ target: value })}
            refusal={targetRefusal}
            onBlur={() => setTouched((current) => ({ ...current, target: true }))}
            inputMode="numeric"
          />
          <button type="submit" disabled={!detailReady} className={PRIMARY_BUTTON}>
            {W.continue}
          </button>
        </form>
      </Shell>
    );
  }

  if (step === "detail" && condition && hasDetail) {
    const typed = draft.username.trim();
    const refusal = shapeRefusal ?? (nameCheck.checked === undefined && nameCheck.refusal ? nameCheck.refusal : undefined);
    // The courses of the name that was checked, and nothing else: a name typed again asks the source again.
    const theirCourses = courses.forName === typed.toLowerCase() ? courses.list : [];
    const asksCourse = condition.course !== undefined && theirCourses.length > 0;
    const next = async () => {
      if (daily.target === null) return;
      if (!nameLink || typed === "" || !nameLink.check || nameCheck.checked === typed) {
        go("amount");
        return;
      }
      setNameCheck({ checking: true });
      try {
        const found = await checkSourceName(nameLink.check.path, typed);
        update({ username: found.username });
        setNameCheck({ checking: false, checked: found.username });
        const list = found.courses ?? [];
        setCourses({ forName: found.username.toLowerCase(), list });
        // A source that holds several courses asks which one counts before the gift goes on (U1): the one it says is
        // current is proposed, and the step stays open so the funder sees the question rather than passing it.
        if (condition.course && list.length > 0) {
          const chosen = list.find((one) => one.id === found.currentCourseId) ?? list[0];
          update({ username: found.username, course: chosen.id, courseTitle: chosen.title });
          return;
        }
        update({ course: "", courseTitle: "" });
        go("amount");
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "";
        const refusals = nameLink.check.refusals;
        setNameCheck({ checking: false, refusal: code === "NO_SUCH_PROFILE" ? refusals.notFound : code === "INVALID_USERNAME" ? refusals.shape : refusals.unavailable });
      }
    };
    return (
      <Shell kind="task" back="/" caption={caption("detail")} step={condition.detailTitle ?? nameLink?.label}>
        <form
          className="flex flex-col gap-[var(--space-xl)]"
          onSubmit={(event) => {
            event.preventDefault();
            void next();
          }}
        >
          {nameLink ? (
            <div className="flex flex-col gap-[var(--space-sm)]">
              <Field
                id="source-name"
                label={nameLink.label}
                labelHidden={!condition.detailTitle}
                help={nameLink.help}
                value={draft.username}
                onChange={(value) => {
                  update({ username: value });
                  setNameCheck({ checking: false });
                }}
                refusal={refusal}
                autoComplete="off"
                spellCheck={false}
              />
              {nameLink.why ? <p className={HELP}>{nameLink.why}</p> : null}
            </div>
          ) : null}
          {asksCourse && condition.course ? (
            <div className="flex flex-col gap-[var(--space-xs)]">
              <ChoiceList
                name="course"
                legend={condition.course.label}
                options={theirCourses.map((one) => ({ value: one.id, label: one.title }))}
                value={draft.course || null}
                onChange={(id) => {
                  const chosen = theirCourses.find((one) => one.id === id);
                  update({ course: id, courseTitle: chosen?.title ?? "" });
                }}
              />
              <p className={HELP}>{condition.course.help}</p>
            </div>
          ) : null}
          {condition.target ? (
            <Field
              id="gift-target"
              label={condition.target.label}
              value={draft.target}
              onChange={(value) => update({ target: value })}
              refusal={draft.target.trim() === "" && !touched.target ? undefined : daily.refusal}
              onBlur={() => setTouched((current) => ({ ...current, target: true }))}
              inputMode="numeric"
            />
          ) : null}
          <button type="submit" disabled={shapeRefusal !== undefined || daily.target === null || nameCheck.checking} className={PRIMARY_BUTTON}>
            {nameCheck.checking ? W.detail.checking : W.continue}
          </button>
        </form>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // F3. How much, and for how long?
  if (step === "amount" && condition) {
    const about = amount.units !== null ? money.about(amount.units) : undefined;
    return (
      <Shell kind="task" back="/" caption={caption("amount")} step={bounded ? M.amount.title : W.amount.title}>
        <form
          className="flex flex-col gap-[var(--space-xl)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (amountReady) go("check");
          }}
        >
          <Field
            id="gift-dollars"
            label={W.amount.dollarsLabel}
            help={`${W.amount.dollarsHelp(about)} ${W.amount.pilotCap}`}
            value={draft.dollars}
            onChange={(value) => update({ dollars: value })}
            refusal={draft.dollars.trim() === "" && !touched.dollars ? undefined : amount.refusal}
            onBlur={() => setTouched((current) => ({ ...current, dollars: true }))}
            inputMode="decimal"
          />
          <Field
            id="gift-days"
            label={bounded ? bounded.words.durationLabel : W.amount.daysLabel}
            help={bounded ? bounded.words.durationHelp : W.amount.daysHelp}
            value={draft.days}
            onChange={(value) => update({ days: value })}
            refusal={draft.days.trim() === "" && !touched.days ? undefined : length.refusal}
            onBlur={() => setTouched((current) => ({ ...current, days: true }))}
            inputMode="numeric"
          />
          {/* What one day is worth, live, computed from what they typed and never stored, so it cannot disagree. A milestone
              has no days to share it over: all of it, when they reach it. */}
          {bounded ? (
            <section className={CARD} aria-live="polite">
              <p className={HELP}>{condition.words.earnedDay}</p>
              <p className={MONEY}>{amount.units === null ? "…" : formatAusd(amount.units)}</p>
              <p className={HELP}>{bounded.words.ifNot}</p>
            </section>
          ) : (
            <section className={CARD} aria-live="polite">
              <p className={HELP}>{condition.words.earnedDay}</p>
              <p className={MONEY}>{perDay === null ? "…" : `${exact ? "" : "about "}${formatAusd(perDay)}`}</p>
              <p className={HELP}>{W.amount.missed}</p>
            </section>
          )}
          <button type="submit" disabled={!amountReady} className={PRIMARY_BUTTON}>
            {W.continue}
          </button>
        </form>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // F4. Check this over, and F5, one account first.
  if ((step === "check" || step === "account") && condition && amount.units !== null && length.days !== null && perDay !== null) {
    const units = amount.units;
    const gift = formatAusd(units);
    if (step === "account") {
      return (
        <Shell kind="task" back="/" backLabel={W.backToCheck} step={W.account.title}>
          <p className={BODY}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, length.days)}</p>
          <p className={HELP}>{W.account.why}</p>
          <AccountPanel />
        </Shell>
      );
    }
    const enough = balance !== null && balance >= units;
    const arrived = !enough && pending !== null && paymentArrived(pending);
    const short = !enough && !arrived && address !== undefined;
    const held = balance ?? 0n;
    // The two ways in, in the order the country puts them (R1), each with its own floor, its own fee and what it
    // delivers. Nothing is hidden: a rail that says nothing about this country keeps its place (D101).
    const waysIn = orderRails(WAYS_IN, railIn.waysIn);
    const payingOn = (way: WayIn) => {
      const euros = eurosToBuyOn(units - held, way, money.rates?.usdPerEur);
      const arrives = euros === undefined ? undefined : arrivesInDollars(euros, way, money.rates?.usdPerEur);
      const stays = arrives === undefined ? undefined : Math.floor(Number(held) / 1_000_000 + arrives - Number(units) / 1_000_000);
      return { euros, arrives, stays };
    };
    const about = money.about(units);
    // Every term the funder chose has a way back to its question; the first day is not a choice, so it has none.
    const days = length.days;
    const climbRows: Array<{ label: string; value: string; note?: string; change?: Step }> =
      milestone && cadence && standingFresh && draft.standing !== null && climb.target !== null
        ? [
            { label: W.check.rows.for, value: recipient, change: "who" },
            { label: W.check.rows.from, value: funder, change: "who" },
            { label: W.check.rows.what, value: condition.name, change: "what" },
            { label: nameLink?.row ?? M.check.rows.name, value: draft.username.trim(), change: "detail" },
            { label: M.check.rows.cadence, value: cadence.label, change: "detail" },
            {
              label: M.check.rows.today,
              value: milestone.words.todayRow(draft.standing, cadence.label),
              note: M.detail.readAt(new Date(draft.standingReadAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })),
            },
            { label: M.check.rows.reach, value: String(climb.target), change: "detail" },
            { label: M.check.rows.goes, value: gift, note: about, change: "amount" },
            { label: M.check.rows.long, value: milestone.words.durationInWords(days), change: "amount" },
            { label: M.check.rows.ifNot, value: M.check.allBack },
          ]
        : [];
    const certificateRows: Array<{ label: string; value: string; note?: string; change?: Step }> =
      certificate && certificateName && certificateTarget
        ? [
            { label: W.check.rows.for, value: recipient, change: "who" },
            { label: W.check.rows.from, value: funder, change: "who" },
            { label: W.check.rows.what, value: condition.name, change: "what" },
            { label: certificate.words.nameLabel, value: personName, change: "detail" },
            { label: M.check.rows.reach, value: certificate.target.inWords(Number(draft.target)), change: "detail" },
            { label: M.check.rows.goes, value: gift, note: about, change: "amount" },
            { label: M.check.rows.long, value: certificate.words.durationInWords(days), change: "amount" },
            { label: M.check.rows.ifNot, value: M.check.allBack },
          ]
        : [];
    const rows: Array<{ label: string; value: string; note?: string; change?: Step }> = milestone ? climbRows : certificate ? certificateRows : [
      { label: W.check.rows.for, value: recipient, change: "who" },
      { label: W.check.rows.from, value: funder, change: "who" },
      { label: W.check.rows.what, value: condition.name, change: "what" },
      ...(nameLink ? [{ label: nameLink.row, value: draft.username.trim() || nameLink.noneGiven, change: "detail" as Step }] : []),
      // Which course counts is part of what the funder is paying for, so it has a line of its own (U1).
      ...(condition.course ? [{ label: condition.course.row, value: draft.courseTitle || condition.course.wholeProfile, change: "detail" as Step }] : []),
      { label: W.check.rows.goes, value: gift, note: about, change: "amount" },
      { label: W.check.rows.dayEarned, value: W.check.dayEarned(formatAusd(perDay), exact, length.days), change: "amount" },
      ...(condition.target && daily.target !== null ? [{ label: W.check.rows.dayCounts, value: condition.target.inWords(daily.target), change: "detail" as Step }] : []),
      { label: W.check.rows.firstDay, value: W.check.firstDay(condition.source) },
      { label: W.check.rows.ends, value: W.check.ends(length.days), change: "amount" },
    ];
    return (
      <Shell kind="task" back="/" caption={caption("check")} step={W.check.title}>
        <dl className="flex flex-col divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-[var(--space-md)] py-[var(--space-md)]">
              <div className="flex min-w-0 flex-col gap-[var(--space-xs)]">
                <dt className={HELP}>{row.label}</dt>
                <dd className={`${BODY} break-words`}>{row.value}</dd>
                {row.note ? <dd className={HELP}>{row.note}</dd> : null}
              </div>
              {row.change ? (
                <button type="button" onClick={() => go(row.change as Step)} className="inline-flex min-h-[var(--tap-target)] shrink-0 items-center text-[length:var(--type-help)] text-[var(--accent-text)] underline">
                  {W.change}
                  <span className="sr-only"> {row.label.toLowerCase()}</span>
                </button>
              ) : null}
            </div>
          ))}
        </dl>

        <section className="flex flex-col gap-[var(--space-sm)]">
          {milestone && climb.target !== null ? (
            <>
              <p className={BODY}>{M.check.howItWorks(condition.source, climb.target, settlingTimeInWords(nowMs))}</p>
              <p className={BODY}>{M.check.whyCeiling(climb.target)}</p>
            </>
          ) : certificate && certificateTarget ? (
            <>
              {/* What the certificate has to show, and what happens if none arrives: both said before anything is paid. */}
              <p className={BODY}>{certificate.words.mustShow(personName, Number(draft.target))}</p>
              <p className={BODY}>{certificate.words.ifNot}</p>
            </>
          ) : (
            <p className={BODY}>{W.check.missed(settlingTimeInWords(nowMs))}</p>
          )}
          <p className={BODY}>{W.check.namesSeen(recipient, funder)}</p>
          <p className="font-medium">{W.check.linkRisk(recipient)}</p>
          <p className={BODY}>{milestone ? M.check.fourteenDays : W.check.fourteenDays}</p>
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
                  <p className={HELP}>{way.arrives === "gift" ? W.check.nothingToSwap : W.check.swapAfter}</p>
                  <p className={HELP}>{W.check.smallest(way.name, way.smallestEur)}</p>
                  <p className={HELP}>{CASH_OUT.sourceLine(way.source, way.read)}</p>
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

  // ---------------------------------------------------------------------------------------------------------------
  // F6 and F7. Paying: the wait, the payment arriving, the gift being made.
  if (step === "paying" && address && amount.units !== null && condition) {
    const units = amount.units;
    const gift = formatAusd(units);
    const held = balance ?? 0n;
    if (phase === "converting" || phase === "giving") {
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <p className={BODY} aria-live="polite">
            {phase === "converting" ? W.arrived.gettingReady : W.arrived.putting(arrivedFigure, gift, recipient)}
          </p>
          {/* The gift stays in sight while it is being made (audit C, 10.3). */}
          <p className={HELP}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, length.days ?? 0)}</p>
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
                update({ dollars: makeIt });
                keepOnDevice(makeIt);
                setPhase("waiting");
                go("check");
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
            // refused again, so the way on is to read where they stand and choose again. The payment stays in the account.
            <button
              type="button"
              onClick={() => {
                update({ standing: null, standingFor: "" });
                setPhase("waiting");
                go("detail");
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
          <p className={BODY}>{milestone ? M.account.yourGift(gift, recipient) : W.account.yourGift(gift, recipient, length.days ?? 0)}</p>
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

  // Between two states while the page corrects its address.
  return (
    <Shell kind="task">
      <p className={HELP}>One moment</p>
    </Shell>
  );
}

/** A labelled line of text, its help under the label, its refusal under the field it is about. */
function Field({
  id,
  label,
  labelHidden = false,
  help,
  value,
  onChange,
  onBlur,
  refusal,
  inputMode,
  autoComplete,
  spellCheck,
}: Readonly<{
  id: string;
  label: string;
  labelHidden?: boolean;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  refusal?: string;
  inputMode?: "decimal" | "numeric";
  autoComplete?: string;
  spellCheck?: boolean;
}>) {
  const described = [help ? `${id}-help` : "", refusal ? `${id}-refusal` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "font-medium"}>
        {label}
      </label>
      {help ? (
        <p id={`${id}-help`} className={HELP}>
          {help}
        </p>
      ) : null}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        aria-invalid={refusal ? true : undefined}
        aria-describedby={described}
        className={`${FIELD} ${refusal ? "border-[3px]" : ""}`}
      />
      {/* Under the field in cause (rule F of the specification). */}
      <FieldRefusal id={`${id}-refusal`}>{refusal}</FieldRefusal>
    </div>
  );
}

function Line({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--space-md)]">
      <dt className={HELP}>{label}</dt>
      <dd className={`${BODY} text-right tabular-nums`}>{value}</dd>
    </div>
  );
}
