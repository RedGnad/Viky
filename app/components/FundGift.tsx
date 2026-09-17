"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import * as mera from "@/src/account/mera";
import { useMoneySession } from "@/src/account/money-session";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { checkSourceName, prepareGift, submitGift, type CreatedGift } from "@/src/client/gift";
import { createMilestoneGift, loadOfferedConditions, readStanding } from "@/src/client/milestone";
import { attemptFor, forgetsAttempt, GIFT_ATTEMPT_KEY } from "@/src/gift-attempt";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { conditionById, liveConditions, type Condition } from "@/src/conditions";
import { cadenceOf, milestoneOf, type MilestoneCondition } from "@/src/milestone-conditions";
import { checkTarget, inPlainWords, MilestoneTermsError, smallestTarget, startingCeiling } from "@/src/milestone-terms";
import { whenInWords } from "@/src/display-currency";
import { twoDecimalsDown } from "@/src/exit-steps";
import { CONVERSION_RESERVE, nextFundingStep, paymentArrived } from "@/src/funding-step";
import { eurosToBuy, roughlyInDollars, SUGGESTED_GIFT_DOLLARS } from "@/src/gift-amount";
import { giftNameProblem, tidyGiftName, type GiftNameProblem } from "@/src/gift-names";
import { formatAusd } from "@/src/gift-reader";
import { AmountError, dollarsToUnits } from "@/src/money";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { forgetPendingGift, loadPendingGift, peekPendingGift, savePendingGift, type PendingGift } from "@/src/pending-gift";
import { WAY_IN } from "@/src/rails";
import { FUND as W, MILESTONE_FUND as M } from "@/src/sentences";
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
  /** A milestone's cadence, and where the person stood in it, read for exactly this name and cadence (C2). */
  cadence: string;
  standing: number | null;
  standingReadAt: string;
  standingFor: string;
  /** Whether that reading had settled (D89); an unsettled one only ever reaches an operator's rehearsal gift. */
  standingSettled?: boolean;
}>;

const EMPTY_DRAFT: Draft = {
  recipientName: "",
  funderName: "",
  conditionId: null,
  username: "",
  dollars: String(SUGGESTED_GIFT_DOLLARS),
  days: "7",
  target: "",
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

function daysOf(days: string, milestone?: MilestoneCondition): { days: number | null; refusal: string | undefined } {
  if (milestone) {
    const { min, max } = milestone.duration;
    const value = Number(days.trim());
    return /^\d{1,3}$/.test(days.trim()) && value >= min && value <= max ? { days: value, refusal: undefined } : { days: null, refusal: milestone.words.durationShape(min, max) };
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
  const { address, signIn, status: accountStatus } = useAccount();
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
  if (address && !hadAccount) setHadAccount(true);
  // The reader's clock, read once a minute: the settling hour is said in it.
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);

  const money = useDisplayCurrency(address);
  const offered: readonly Condition[] = [...liveConditions(), ...preview.ids.map((id) => conditionById(id)).filter((entry): entry is Condition => entry !== undefined)];
  const condition = draft.conditionId ? offered.find((entry) => entry.id === draft.conditionId) : undefined;
  const nameLink = condition?.link.kind === "username" ? condition.link : undefined;
  const milestone = milestoneOf(condition);
  const cadence = milestone ? cadenceOf(milestone, draft.cadence) : undefined;
  // The condition's own detail: the name a source reads, and what counts as a day or the rating to reach (structure,
  // section 5, step 3).
  const hasDetail = Boolean(nameLink || condition?.target || milestone);
  const numbered: Step[] = ["who", "what", ...(hasDetail || !condition ? (["detail"] as Step[]) : []), "amount", "check"];

  const recipientRefusal = nameRefusal(giftNameProblem(draft.recipientName), W.who.refusals.recipientEmpty);
  const funderRefusal = nameRefusal(giftNameProblem(draft.funderName), W.who.refusals.funderEmpty);
  const namesReady = !recipientRefusal && !funderRefusal;
  const shapeRefusal = nameLink?.check && draft.username.trim() !== "" && !nameLink.check.valid(draft.username.trim()) ? nameLink.check.refusals.shape : undefined;
  const amount = unitsOf(draft.dollars);
  const length = daysOf(draft.days, milestone);
  const daily = targetOf(condition, draft.target);
  // A reading counts only for the name and the cadence it was taken for.
  const standingFresh = milestone !== undefined && draft.standing !== null && draft.standingFor === standingKey(draft.username, draft.cadence);
  const climb = climbOf(milestone, standingFresh ? draft.standing : null, draft.target);
  const detailReady = milestone ? standingFresh && climb.target !== null && cadence !== undefined : daily.target !== null;
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
    const account = mera.currentAccount();
    if (!account) throw new Error(W.failures.signInFirst);
    if (!condition || amount.units === null || length.days === null) throw new Error(W.failures.other);
    let result: CreatedGift;
    if (milestone) {
      if (!cadence || draft.standing === null || climb.target === null) throw new Error(W.failures.other);
      result = await createMilestoneGift({
        account,
        milestone,
        cadenceGoalType: cadence.goalType,
        cadence: cadence.id,
        username: draft.username.trim(),
        standing: draft.standing,
        standingReadAt: draft.standingReadAt,
        target: climb.target,
        durationDays: length.days,
        amount: amount.units,
        recipientName: recipient,
        funderName: funder,
      });
    } else {
    if (daily.target === null || condition.goalType === null) throw new Error(W.failures.other);
    // Signed once for these terms and sent again as it is on every retry, so the server finds the same creation and
    // never pays for the gift twice (D87).
    const terms = {
      account: account.address,
      username: draft.username.trim(),
      recipientName: recipient,
      funderName: funder,
      goalType: condition.goalType,
      dailyTarget: daily.target,
      durationDays: length.days,
      amount: amount.units.toString(),
    };
    const request =
      attemptFor(readSession(GIFT_ATTEMPT_KEY), terms) ??
      (await prepareGift({
        account,
        duolingoUsername: terms.username || undefined,
        recipientName: recipient,
        funderName: funder,
        goalType: condition.goalType,
        dailyTarget: daily.target,
        durationDays: length.days,
        amount: amount.units,
      }));
    writeSession(GIFT_ATTEMPT_KEY, { terms, request });
    try {
      result = await submitGift(request);
    } catch (error) {
      if (error instanceof ApiError && forgetsAttempt(error.code)) writeSession(GIFT_ATTEMPT_KEY, null);
      throw error;
    }
    writeSession(GIFT_ATTEMPT_KEY, null);
    }
    const record: Made = {
      giftId: result.giftId,
      claimUrl: result.claimUrl,
      atMs: Date.now(),
      recipientName: recipient,
      conditionId: condition.id,
      amount: amount.units.toString(),
      days: length.days,
      ...(milestone && cadence && climb.target !== null ? { goal: milestone.words.goal(climb.target, cadence.label), target: climb.target } : {}),
    };
    writeSession(MADE_KEY, record);
    writeSession(DRAFT_KEY, null);
    // Made, so nothing is left to pick up again on this device (D74).
    forgetPendingGift();
    setKept(undefined);
    setMade(record);
    setDraft(EMPTY_DRAFT);
    replace("done");
    window.scrollTo(0, 0);
  }, [condition, milestone, cadence, climb.target, draft.standing, draft.standingReadAt, amount.units, length.days, daily.target, draft.username, recipient, funder]);

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
          const account = mera.currentAccount();
          if (!account) {
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
  }, [step, address, amount.units, phase, refresh, give]);

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

  const keepOnDevice = (dollars = draft.dollars) => {
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
        ...(milestone && draft.standing !== null ? { cadence: draft.cadence, standing: draft.standing, standingReadAt: draft.standingReadAt } : {}),
      }),
    );
  };

  const commit = async (enough: boolean, arrived: boolean) => {
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
    keepOnDevice();
    setPhase("waiting");
    // The card service's page opens inside the tap, or the browser blocks it.
    if (!arrived) window.open(WAY_IN.page, "_blank", "noopener,noreferrer");
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
    return (
      <Shell kind="task" back="/" caption={caption("what")} step={W.what.title}>
        <ChoiceList
          name="condition"
          legend={W.what.title}
          legendHidden
          options={offered.map((entry) => ({ value: entry.id, label: entry.name, help: entry.live ? entry.help : `${entry.help} ${M.operatorOnly}` }))}
          value={condition?.id ?? null}
          onChange={(id) => {
            const chosen = offered.find((entry) => entry.id === id);
            if (!chosen) return;
            const chosenMilestone = milestoneOf(chosen);
            // Moving between a daily condition and a milestone changes what the target and the days mean.
            const sameKind = condition?.kind === chosen.kind;
            update({
              conditionId: id,
              target: sameKind ? draft.target : chosen.target ? String(chosen.target.suggested) : "",
              days: sameKind ? draft.days : String(chosenMilestone ? chosenMilestone.duration.suggested : 7),
            });
          }}
        />
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
        // A rating still settling moves far more than a climb can measure (D89): refused, except to an account that runs
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
          target: String(smallestTarget(milestone.shape, found.rating)),
        });
        setReading({ busy: false });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "";
        if (code === "NO_RATING") setReading({ busy: false, cadenceRefusal: milestone.words.refusals.noRating(cadence.label) });
        else if (code === "NO_SUCH_PROFILE") setReading({ busy: false, nameRefusal: milestone.words.refusals.notFound });
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
  if (step === "detail" && condition && hasDetail) {
    const typed = draft.username.trim();
    const refusal = shapeRefusal ?? (nameCheck.checked === undefined && nameCheck.refusal ? nameCheck.refusal : undefined);
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
      <Shell kind="task" back="/" caption={caption("amount")} step={milestone ? M.amount.title : W.amount.title}>
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
            help={W.amount.dollarsHelp(about)}
            value={draft.dollars}
            onChange={(value) => update({ dollars: value })}
            refusal={draft.dollars.trim() === "" && !touched.dollars ? undefined : amount.refusal}
            onBlur={() => setTouched((current) => ({ ...current, dollars: true }))}
            inputMode="decimal"
          />
          <Field
            id="gift-days"
            label={milestone ? milestone.words.durationLabel : W.amount.daysLabel}
            help={milestone ? milestone.words.durationHelp : W.amount.daysHelp}
            value={draft.days}
            onChange={(value) => update({ days: value })}
            refusal={draft.days.trim() === "" && !touched.days ? undefined : length.refusal}
            onBlur={() => setTouched((current) => ({ ...current, days: true }))}
            inputMode="numeric"
          />
          {/* What one day is worth, live, computed from what they typed and never stored, so it cannot disagree. A milestone
              has no days to share it over: all of it, when they reach it. */}
          {milestone ? (
            <section className={CARD} aria-live="polite">
              <p className={HELP}>{condition.words.earnedDay}</p>
              <p className={MONEY}>{amount.units === null ? "…" : formatAusd(amount.units)}</p>
              <p className={HELP}>{milestone.words.ifNot}</p>
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
    const euros = eurosToBuy(units - held);
    const arrives = roughlyInDollars(euros);
    const stays = Math.floor(Number(held) / 1_000_000 + arrives - Number(units) / 1_000_000);
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
            { label: M.check.rows.from, value: M.check.orUnder(startingCeiling(milestone.shape, draft.standing, climb.target)) },
            { label: M.check.rows.goes, value: gift, note: about, change: "amount" },
            { label: M.check.rows.long, value: milestone.words.durationInWords(days), change: "amount" },
            { label: M.check.rows.ifNot, value: M.check.allBack },
          ]
        : [];
    const rows: Array<{ label: string; value: string; note?: string; change?: Step }> = milestone ? climbRows : [
      { label: W.check.rows.for, value: recipient, change: "who" },
      { label: W.check.rows.from, value: funder, change: "who" },
      { label: W.check.rows.what, value: condition.name, change: "what" },
      ...(nameLink ? [{ label: nameLink.row, value: draft.username.trim() || nameLink.noneGiven, change: "detail" as Step }] : []),
      { label: W.check.rows.goes, value: gift, note: about, change: "amount" },
      { label: W.check.rows.dayEarned, value: W.check.dayEarned(formatAusd(perDay), exact, length.days), change: "amount" },
      ...(condition.target && daily.target !== null ? [{ label: W.check.rows.dayCounts, value: condition.target.inWords(daily.target), change: "detail" as Step }] : []),
      { label: W.check.rows.firstDay, value: W.check.firstDay(condition.source) },
      { label: W.check.rows.ends, value: W.check.ends(length.days), change: "amount" },
    ];
    const ceiling = milestone && draft.standing !== null && climb.target !== null ? startingCeiling(milestone.shape, draft.standing, climb.target) : null;
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
          {milestone && climb.target !== null && ceiling !== null ? (
            <>
              <p className={BODY}>{M.check.howItWorks(condition.source, climb.target, settlingTimeInWords(nowMs))}</p>
              <p className={BODY}>{M.check.whyCeiling(ceiling)}</p>
            </>
          ) : (
            <p className={BODY}>{W.check.missed(settlingTimeInWords(nowMs))}</p>
          )}
          <p className={BODY}>{W.check.namesSeen(recipient, funder)}</p>
          <p className="font-medium">{W.check.linkRisk(recipient)}</p>
          <p className={BODY}>{milestone ? M.check.fourteenDays : W.check.fourteenDays}</p>
        </section>

        {short ? (
          <section className={CARD}>
            <h2 className={TITLE}>{W.check.paying}</h2>
            <dl className="flex flex-col gap-[var(--space-sm)]">
              <Line label={W.check.youPay} value={W.check.byCard(euros)} />
              {held > 0n ? <Line label={W.check.alreadyHeld} value={formatAusd(held)} /> : null}
              <Line label={W.check.arrives} value={W.check.aboutDollars(Math.floor(arrives))} />
              <Line label={W.check.rows.goes} value={gift} />
              {stays > 0 ? <Line label={W.check.staysYours} value={W.check.aboutDollars(stays)} /> : null}
            </dl>
            <p className={HELP}>{W.check.fee(WAY_IN.name, WAY_IN.fee)}</p>
            <p className={HELP}>{W.check.delay(WAY_IN.name)}</p>
          </section>
        ) : null}
        {arrived ? (
          <section className={CARD}>
            <h2 className={TITLE}>{W.check.paying}</h2>
            <p className={BODY}>{arrivedWorth && arrivedWorth !== "unknown" ? W.check.arrivedWorth(arrivedWorth) : W.check.arrivedLater}</p>
            <p className={HELP}>{W.check.arrivedUse(gift, recipient)}</p>
          </section>
        ) : null}
        {enough ? <p className={HELP}>{W.check.fromAccount(formatAusd(held))}</p> : null}

        <div className="flex flex-col gap-[var(--tap-gap)]">
          <button type="button" onClick={() => void commit(enough, arrived)} disabled={Boolean(address) && balance === null} className={PRIMARY_BUTTON}>
            {!address ? W.continue : enough ? W.check.putIt(gift, recipient) : arrived ? W.check.useArrived : W.check.pay(euros)}
          </button>
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
      const more = eurosToBuy(units - held);
      const makeIt = twoDecimalsDown(held, 6);
      return (
        <Shell kind="task" back="/gifts" backLabel={W.backToGifts} backFollows step={W.arrived.title}>
          <p className={BODY}>{W.arrived.short(arrivedFigure, gift, more, `$${makeIt}`)}</p>
          <button
            type="button"
            onClick={() => {
              window.open(WAY_IN.page, "_blank", "noopener,noreferrer");
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
    const toBuy = balance === null ? undefined : eurosToBuy(units - held);
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
          <p className="font-medium">{W.waiting.setThese(WAY_IN.name)}</p>
          <ul className={`flex flex-col gap-[var(--space-xs)] ${BODY}`}>
            {W.waiting.settings(toBuy).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={HELP}>{W.waiting.theirWords(WAY_IN.name)}</p>
          <p className="font-medium">{W.waiting.codeLabel(WAY_IN.name)}</p>
          <p className="select-all break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
          <button type="button" onClick={() => copy("code", address)} className={SECONDARY_BUTTON}>
            {copied === "code" ? W.waiting.copied : W.waiting.copy}
          </button>
          {copyRefused === "code" ? <FieldRefusal id="code-refused">{W.waiting.copyRefused}</FieldRefusal> : null}
          <p className={HELP}>{W.waiting.startsEnds(start, end)}</p>
        </section>
        <p className={BODY}>
          {W.check.delay(WAY_IN.name)} {keptOnDevice ? W.waiting.leave : W.waiting.stay}
        </p>
        <a href={WAY_IN.page} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
          {W.waiting.openAgain(WAY_IN.name)}
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
