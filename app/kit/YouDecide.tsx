"use client";
import { useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { isAccountError } from "@/src/account/errors";
import { signConsent, type GiftConsentAnswer } from "@/src/client/consent";
import { conditionById } from "@/src/conditions";
import type { EndOffer } from "@/src/gift-ending";
import { dateInWords } from "@/src/moments";
import { CONSENT as C, END_GIFT as E, YOU_DECIDE as Y } from "@/src/sentences";
import { BODY, CARD_LABEL, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { Character, type CharacterState } from "./Character";
import { connectsItsSource, stopReading, type StopCost } from "./Consent";
import { EndFigures, useEnding } from "./EndGift";
import { FieldRefusal } from "./FieldRefusal";
import { MessagesSheet, useTold, type ToldAbout } from "./MorningMessage";
import { Act, BellMark, RoundControls } from "./RoundControls";
import { Sheet } from "./Sheet";

/**
 * "You decide": the standing controls of the person a gift is for, under the card (the founder, 1 Oct 2026, the
 * mockup you-decide.html and rule 6 of kit-rules.html).
 *
 * Three round buttons with two words each, and no sentence on the page: being told ("Notifications"), what the person who
 * offered the gift sees of it, and "Stop". Each opens a sheet, and what there is to say is said there, after the
 * press. They replace three things that stood in three places and three manners: a wide button under the card ("Tell
 * me each morning"), a line of help with a small "Stop" beside it, and an underlined "End this gift" at the foot of
 * the agreement.
 *
 * "Stop" opens two choices of the same weight, the one that can be undone first: a break, which is the stop the
 * agreement key signs (Viky reads nothing until the person starts again), and the ending, which only a gift of the
 * second version of the contracts has. Each is confirmed before anything is signed, with what it costs: the break in
 * the founder's own three sentences, the ending in the two figures the contract moves.
 *
 * What the funder sees is shown rather than described: their page, small, as they read it now, then the agreement's
 * own words for it (src/consent-terms.ts), which are the ones the person signed.
 */

/** What the person who offered the gift reads on their page now: its days, its state and its figure. */
export type TheirView = Readonly<{ shape: ReactNode; headline: string; figure: string | null }>;

type Open = "messages" | "sees" | "stop" | null;
type StopStep = "choose" | "break" | "end";

export function YouDecide({
  giftId,
  conditionId,
  funderName,
  answer,
  underWay,
  cost,
  zone,
  about,
  end,
  theirView,
  onChanged,
}: Readonly<{
  giftId: string;
  conditionId: string;
  funderName: string | null;
  answer: GiftConsentAnswer | null;
  /** Whether the gift is being read without a gesture now: counting or climbing. */
  underWay: boolean;
  cost: StopCost;
  zone: string;
  /** What this gift's messages are about, or nothing at a moment that has none to send. */
  about: ToldAbout | null;
  /** What ending the gift now would move, on the contract it is on; nothing for a gift that has no ending. */
  end: Readonly<{ contract: Hex; offer: EndOffer }> | null;
  theirView: TheirView;
  onChanged: () => void | Promise<void>;
}>) {
  const [open, setOpen] = useState<Open>(null);
  const [step, setStep] = useState<StopStep>("choose");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const told = useTold(giftId, about !== null);
  const ending = useEnding({ giftId, contract: end?.contract ?? null, offer: end?.offer ?? null, onEnded: onChanged });

  const signs = Boolean(answer?.texts) && !answer?.finished;
  const state = answer?.state ?? null;
  const connected = connectsItsSource(conditionId);
  // Something is read, so there is something to pause: the yes stands, or the gift began before agreements existed.
  const reading = signs && (state?.kind === "yes" || (state === null && underWay && answer?.reading === "before_agreements"));
  // A connected source is started again by connecting again, in its own block, never from here.
  const stopped = signs && state?.kind === "stop";
  const terms = answer?.terms;
  const things: 1 | 2 = terms?.things === 2 ? 2 : 1;

  const tells = about !== null && told.step !== "unsupported";
  const shows = Boolean(terms?.funderSees);
  const stops = reading || (stopped && !connected) || end !== null;
  if (!tells && !shows && !stops) return null;

  const close = () => {
    if (busy || ending.busy) return;
    setOpen(null);
    setStep("choose");
    setProblem(null);
    ending.forget();
  };

  const takeABreak = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await stopReading(giftId, conditionId, answer ?? undefined);
      setOpen(null);
      setStep("choose");
      await onChanged();
    } catch (error) {
      setProblem(isAccountError(error) && error.code === "OTHER_ACCOUNT" ? error.guidance : C.stopFailed);
    } finally {
      setBusy(false);
    }
  };

  const startAgain = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await signConsent(giftId, "yes", answer ?? undefined);
      setOpen(null);
      await onChanged();
    } catch (error) {
      setProblem(isAccountError(error) && error.code === "OTHER_ACCOUNT" ? error.guidance : C.failed);
    } finally {
      setBusy(false);
    }
  };

  const endIt = async () => {
    if (await ending.end()) {
      setOpen(null);
      setStep("choose");
    }
  };

  const what = terms?.what ?? "";
  const erase = connected ? conditionById(conditionId)?.link : null;
  const nothingKept = end ? BigInt(end.offer.keep) === 0n : true;

  return (
    <>
      <RoundControls label={Y.title}>
        {tells ? (
          <Act name={Y.notifications} state={told.step === "on" ? Y.on : Y.off} onPress={() => setOpen("messages")} data-decide="messages">
            <BellMark />
          </Act>
        ) : null}
        {shows ? (
          <Act name={Y.sees(funderName)} state={Y.things[things]} onPress={() => setOpen("sees")} data-decide="sees">
            <svg aria-hidden focusable="false" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.8" />
            </svg>
          </Act>
        ) : null}
        {stops ? (
          <Act name={Y.stop} state={stopped ? Y.onABreak : Y.anytime} onPress={() => setOpen("stop")} data-decide="stop">
            <svg aria-hidden focusable="false" width="26" height="26" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="3.5" fill="currentColor" />
            </svg>
          </Act>
        ) : null}
      </RoundControls>

      {about ? <MessagesSheet open={open === "messages"} onClose={close} told={told} about={about} yours /> : null}

      {shows && terms ? (
        <Sheet
          open={open === "sees"}
          title={Y.seesTitle(funderName, things)}
          onClose={close}
          footer={
            <button type="button" className={SECONDARY_BUTTON} onClick={close}>
              {Y.gotIt}
            </button>
          }
        >
          {/* Drawn only while it is read: the row of days is measured as it appears. */}
          {open === "sees" ? (
            <>
              <div className="decide-view" data-their-view>
                <p className={CARD_LABEL}>{Y.theirPage(funderName)}</p>
                {theirView.shape ? <div className="decide-view-shape">{theirView.shape}</div> : null}
                <p className="decide-view-state">{theirView.headline}</p>
                {theirView.figure ? <p className={CARD_LABEL}>{theirView.figure}</p> : null}
              </div>
              {/* A connected source's own words are a whole sentence already; every other is what the yes names. */}
              <p className={BODY}>{/[.!?]$/.test(terms.funderSees) ? terms.funderSees : Y.seesLine(funderName, terms.funderSees)}</p>
            </>
          ) : null}
        </Sheet>
      ) : null}

      {stops ? (
        <Sheet
          open={open === "stop"}
          title={step === "break" ? Y.breakTitle : step === "end" ? Y.endTitle : Y.yourCall}
          view={step}
          onClose={close}
          footer={
            step === "break" ? (
              <>
                <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void takeABreak()}>
                  {busy ? C.working : Y.takeABreak}
                </button>
                <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={close}>
                  {Y.notNow}
                </button>
                {problem ? <FieldRefusal id={`decide-break-${giftId}`}>{problem}</FieldRefusal> : null}
              </>
            ) : step === "end" ? (
              <>
                <button type="button" className={PRIMARY_BUTTON} disabled={ending.busy} onClick={() => void endIt()}>
                  {ending.busy ? E.working : Y.endTheGift}
                </button>
                <button type="button" className={SECONDARY_BUTTON} disabled={ending.busy} onClick={close}>
                  {Y.notNow}
                </button>
                {ending.problem ? <FieldRefusal id={`end-gift-${giftId}`}>{ending.problem}</FieldRefusal> : null}
              </>
            ) : (
              <>
                <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={close}>
                  {Y.keepGoing}
                </button>
                {problem ? <FieldRefusal id={`decide-again-${giftId}`}>{problem}</FieldRefusal> : null}
              </>
            )
          }
        >
          {/* Drawn only while it is read, so no sentence of it stands twice in the page behind. */}
          {open !== "stop" ? null : step === "break" ? (
            <div className="flex flex-col gap-[var(--space-sm)]" data-stop-step="break">
              <p className={BODY}>
                {C.sheetNow} <strong>{cost.kind === "milestone" ? C.sheetMilestone(cost.target, cost.by, cost.amount, cost.funder) : C.sheetDaily(cost.funder)}</strong>{" "}
                {cost.kind === "milestone" ? C.sheetAgainBefore : C.sheetAgainAnyTime}
              </p>
              {erase?.kind === "connect" ? <p className={HELP}>{erase.consent.erase}</p> : null}
            </div>
          ) : step === "end" && end ? (
            <div className="flex flex-col gap-[var(--space-md)]" data-stop-step="end">
              <EndFigures offer={end.offer} funderName={funderName} />
              <p className={`${CARD_LABEL} decide-warning`}>{Y.cannotBeUndone}</p>
            </div>
          ) : (
            <div data-stop-step="choose">
              {reading ? (
                <Option character="toCome" name={Y.takeABreak} onPress={() => setStep("break")} data-option="break">
                  <span className="decide-option-help">{connected ? Y.breakHelp.connected : cost.kind === "milestone" ? Y.breakHelp.milestone : Y.breakHelp.daily}</span>
                </Option>
              ) : null}
              {stopped && !connected && state ? (
                <Option character="today" name={busy ? C.working : Y.startAgain} disabled={busy} onPress={() => void startAgain()} data-option="again">
                  <span className="decide-option-help">{C.stoppedLine(what, dateInWords(Date.parse(state.signedAt), zone))}</span>
                </Option>
              ) : null}
              {end ? (
                <Option character="returned" name={Y.endTheGift} disabled={busy} onPress={() => setStep("end")} data-option="end">
                  <span className="decide-chips">
                    {nothingKept ? null : <span className="decide-chip">{Y.chipYours(end.offer.keepDisplay)}</span>}
                    <span className="decide-chip">{Y.chipBack(end.offer.giveBackDisplay, funderName)}</span>
                  </span>
                </Option>
              ) : null}
            </div>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

/** One choice of the sheet: a key with a character, its name in the title face, and one line or two figures under it. */
function Option({
  character,
  name,
  onPress,
  disabled = false,
  children,
  ...rest
}: Readonly<{ character: CharacterState; name: string; onPress: () => void; disabled?: boolean; children: ReactNode; "data-option": string }>) {
  return (
    <button type="button" className="decide-option control-relief" onClick={onPress} disabled={disabled} {...rest}>
      <span className="decide-option-character">
        <Character state={character} standing={false} className="h-auto w-full" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="decide-option-name">{name}</span>
        {children}
      </span>
      <svg aria-hidden focusable="false" width="14" height="14" viewBox="0 0 14 14" className="decide-option-go">
        <path d="M5.5 3 L9.5 7 L5.5 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
