"use client";
import { useCallback, useEffect, useState } from "react";
import { isAccountError } from "@/src/account/errors";
import { postJson } from "@/src/client/api";
import { loadConsent, signConsent, type GiftConsentAnswer } from "@/src/client/consent";
import { conditionById } from "@/src/conditions";
import { dateInWords } from "@/src/moments";
import { CONSENT as C, YOU_DECIDE as Y } from "@/src/sentences";
import { BODY, CARD, HELP, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";
import { Sheet } from "./Sheet";

/**
 * The recipient's yes and stop, where the gift is (the founder, 29 Sep 2026, the mockup consent.html; redrawn on
 * 1 Oct 2026 from you-decide.html).
 *
 * The stop is one of the standing controls under the card (app/kit/YouDecide.tsx): "Stop", then "Take a break", which
 * says what it costs and is signed by the key the passkey made for agreements alone. What Viky reads and since when is
 * one sentence in "How this is checked", for the person it is for as for the funder. The one thing left in the open
 * is a gift that is not read and waits for its person: a line and a small button, "Agree" or "Start again". A
 * connected source is started again by connecting again, in its own block. Me keeps its own list, with the first sheet.
 */

/**
 * The gift's agreement as the server holds it, for either of its two people, and a way to read it again. Reading it
 * again answers when it is read: the page reads the agreement and then the gift after a gesture that signed the yes,
 * so it never says "reads nothing" over a gift it has just begun to read (the audit of 1 Oct 2026).
 */
export function useGiftConsent(giftId: string, enabled: boolean): { answer: GiftConsentAnswer | null; reload: () => Promise<void> } {
  const [answer, setAnswer] = useState<GiftConsentAnswer | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadConsent(giftId).then(
      (loaded) => {
        if (live) setAnswer(loaded);
      },
      () => {
        // A gift the account is not one of the two people of says nothing here; neither does a failed read.
        if (live) setAnswer(null);
      },
    );
    return () => {
      live = false;
    };
  }, [giftId, enabled]);
  const reload = useCallback(
    () =>
      loadConsent(giftId).then(
        (loaded) => setAnswer(loaded),
        () => setAnswer(null),
      ),
    [giftId],
  );
  return { answer: enabled ? answer : null, reload };
}

export const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Whether a condition's stop is its own "Disconnect and erase". */
export function connectsItsSource(conditionId: string): boolean {
  return conditionById(conditionId)?.link.kind === "connect";
}

/** What stopping costs, in the sheet: a milestone's whole amount by its deadline, or a daily gift's unread days. */
export type StopCost = Readonly<{ kind: "milestone"; target: string | null; by: string; amount: string; funder: string }> | Readonly<{ kind: "daily"; funder: string }>;

export function StopSheet({
  open,
  what,
  cost,
  busy,
  problem,
  onStop,
  onClose,
}: Readonly<{ open: boolean; what: string; cost: StopCost; busy: boolean; problem: string | null; onStop: () => void; onClose: () => void }>) {
  return (
    <Sheet
      open={open}
      title={C.sheetTitle(what)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={onStop}>
            {busy ? C.working : C.stopReading}
          </button>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={onClose}>
            {C.keepGoing}
          </button>
          {problem ? <FieldRefusal id="consent-stop-refused">{problem}</FieldRefusal> : null}
        </>
      }
    >
      <p className={BODY}>
        {C.sheetNow} <strong>{cost.kind === "milestone" ? C.sheetMilestone(cost.target, cost.by, cost.amount, cost.funder) : C.sheetDaily(cost.funder)}</strong>{" "}
        {cost.kind === "milestone" ? C.sheetAgainBefore : C.sheetAgainAnyTime}
      </p>
    </Sheet>
  );
}

/** Signs a stop, and for a connected source erases the connection too, as its own "Disconnect and erase" does. */
export async function stopReading(giftId: string, conditionId: string, loaded?: GiftConsentAnswer): Promise<void> {
  await signConsent(giftId, "stop", loaded);
  const condition = conditionById(conditionId);
  if (condition?.link.kind === "connect") await postJson(`/api/connect/${condition.source.toLowerCase()}/disconnect`, { giftId });
}

/**
 * A gift that is not read and waits for its person, under the card: stopped, never agreed to, or begun before
 * agreements existed. One line and one small button. Nothing while a yes stands (the stop is a standing control, in
 * "You decide"), nothing while the gift waits for its first gesture (that gesture is the yes), nothing once it is over.
 */
export function ConsentLine({
  giftId,
  conditionId,
  answer,
  underWay,
  zone,
  onChanged,
}: Readonly<{
  giftId: string;
  conditionId: string;
  answer: GiftConsentAnswer | null;
  /** Whether the gift is being read without a gesture now: counting or climbing. */
  underWay: boolean;
  zone: string;
  onChanged: () => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!answer || !answer.texts || answer.finished) return null;
  const what = answer.terms.what;
  const state = answer.state;

  const agree = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await signConsent(giftId, "yes", answer);
      onChanged();
    } catch (error) {
      setProblem(isAccountError(error) && error.code === "OTHER_ACCOUNT" ? error.guidance : C.failed);
    } finally {
      setBusy(false);
    }
  };

  let line: string;
  let label: string;
  if (state?.kind === "stop") {
    // A connected source is agreed again by connecting again, in its own block.
    if (connectsItsSource(conditionId)) return null;
    line = C.stoppedLine(what, dateInWords(Date.parse(state.signedAt), zone));
    label = Y.startAgain;
  } else if (state === null && underWay && answer.reading === "before_agreements") {
    line = C.askLine(what);
    label = C.agree;
  } else if (state === null && underWay) {
    line = C.nothingRead;
    label = C.agree;
  } else {
    return null;
  }

  return (
    <div className="gift-card-width flex flex-col gap-[var(--space-xs)]" data-consent-line>
      <div className="flex items-center justify-between gap-[var(--space-md)]">
        <p className={HELP}>{line}</p>
        <button type="button" onClick={() => void agree()} disabled={busy} className={SMALL_BUTTON}>
          {busy ? C.working : label}
        </button>
      </div>
      {problem ? <p className={HELP}>{problem}</p> : null}
    </div>
  );
}

/** The recipient's one sentence, in "How this is checked": what Viky reads for this gift, and the day they agreed. */
export function RecipientConsent({ answer, zone }: Readonly<{ answer: GiftConsentAnswer | null; zone: string }>) {
  if (!answer || answer.finished || answer.state?.kind !== "yes") return null;
  return <p className={HELP}>{C.line(answer.terms.what, dateInWords(Date.parse(answer.state.signedAt), zone))}</p>;
}

/** The funder's one sentence, in "How this is checked" (the mockup, screen 2): agreed on, stopped on, or not yet. */
export function FunderConsent({ answer, recipientName, rest, zone }: Readonly<{ answer: GiftConsentAnswer | null; recipientName: string | null; rest: string; zone: string }>) {
  if (!answer || !answer.opened || answer.finished) return null;
  const name = recipientName?.trim() || C.someone;
  const state = answer.state;
  const what = answer.terms.what;
  const said =
    state?.kind === "yes"
      ? `${C.funderAgreed(name, dateInWords(Date.parse(state.signedAt), zone), what)} ${rest}`
      : state?.kind === "stop"
        ? `${C.funderStopped(name, dateInWords(Date.parse(state.signedAt), zone))} ${rest}`
        : answer.reading === "before_agreements"
          ? `${C.funderBefore(name, what)} ${rest}`
          : C.funderWaiting(name);
  return <p className={HELP}>{said}</p>;
}

/** One gift of the account's, as Me lists it: what Viky reads for it, and the stop (the founder, 29 Sep 2026). */
export type ReadForYou = Readonly<{ giftId: string; conditionId: string; funderName: string | null; cost: StopCost }>;

/**
 * Me's "What Viky reads": every gift the account is the person of, still running, with what is read for it and a
 * "Stop" that opens the same sheet as the gift's own line. Nothing is drawn for an account that is nobody's recipient.
 */
export function WhatVikyReads({ gifts, zone }: Readonly<{ gifts: readonly ReadForYou[]; zone: string }>) {
  const [answers, setAnswers] = useState<Record<string, GiftConsentAnswer | null>>({});
  const [asked, setAsked] = useState(0);
  const [stopping, setStopping] = useState<ReadForYou | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ids = gifts.map((gift) => gift.giftId).join(",");

  useEffect(() => {
    if (!ids) return;
    let live = true;
    void Promise.all(ids.split(",").map((giftId) => loadConsent(giftId).then((answer) => [giftId, answer] as const, () => [giftId, null] as const))).then((pairs) => {
      if (live) setAnswers(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [ids, asked]);

  const rows = gifts.flatMap((gift) => {
    const answer = answers[gift.giftId];
    return answer && answer.texts && !answer.finished ? [{ gift, answer }] : [];
  });
  if (rows.length === 0) return null;

  const stop = async () => {
    if (!stopping) return;
    setBusy(true);
    setProblem(null);
    try {
      await stopReading(stopping.giftId, stopping.conditionId, answers[stopping.giftId] ?? undefined);
      setStopping(null);
      setAsked((count) => count + 1);
    } catch {
      setProblem(C.stopFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={CARD}>
      <p className="font-medium">{C.meTitle}</p>
      {rows.map(({ gift, answer }) => {
        const reading = answer.state?.kind !== "stop" && answer.reading !== "no_agreement";
        return (
          <div key={gift.giftId} className="flex items-center justify-between gap-[var(--space-md)]">
            <p className={HELP}>
              {C.meLine(capitalised(answer.terms.what), C.meGift(gift.funderName))}
              {answer.state?.kind === "stop" ? ` ${C.meStopped(dateInWords(Date.parse(answer.state.signedAt), zone))}` : ""}
            </p>
            {reading ? (
              <button type="button" onClick={() => setStopping(gift)} disabled={busy} className={`${INLINE_BUTTON} shrink-0`}>
                {C.stop}
              </button>
            ) : null}
          </div>
        );
      })}
      {stopping ? (
        <StopSheet
          open
          what={answers[stopping.giftId]?.terms.what ?? ""}
          cost={stopping.cost}
          busy={busy}
          problem={problem}
          onStop={() => void stop()}
          onClose={() => {
            setStopping(null);
            setProblem(null);
          }}
        />
      ) : null}
    </section>
  );
}
