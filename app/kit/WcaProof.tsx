"use client";
import { useState } from "react";
import { agreeFirst } from "@/src/client/consent";
import { CONSENT } from "@/src/sentences";
import { ApiError } from "@/src/client/api";
import { checkRegistration, proveWca, readWcaLine } from "@/src/client/wca";
import type { MilestoneStatus } from "@/src/milestone-view";
import { WCA_PROOF as W } from "@/src/sentences";
import { WCA_MILESTONE } from "@/src/milestone-conditions";
import { wcaResultInWords } from "@/src/wca";
import { BODY, CARD, FIELD, HELP, PRIMARY_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

/**
 * The competitor's half of "Set a time at a WCA competition" (the founder, 27 Sep 2026), in two moments on the gift's
 * page, the motif of the marathon's. Before the competition: their WCA id or their name as on the competitors list,
 * checked once against that public list. After it: one press reads their result plainly so a miss is said in words,
 * then attested, and the row read (the name, the event, the best single) is what the page shows.
 */

type State = { at: "asking" } | { at: "checking" } | { at: "reading" } | { at: "proving" } | { at: "refused"; message: string } | { at: "done"; line: { name: string; best: number } | null };

export function WcaProof({ giftId, status, yours, onChanged }: Readonly<{ giftId: string; status: MilestoneStatus; yours: boolean; onChanged: () => Promise<void> | void }>) {
  const wca = status.wca;
  const [who, setWho] = useState("");
  const [state, setState] = useState<State>({ at: "asking" });
  if (!wca) return null;
  const busy = state.at === "checking" || state.at === "reading" || state.at === "proving";
  const refusal = (error: unknown, fallback: string) => setState({ at: "refused", message: error instanceof ApiError ? error.message : fallback });

  const check = async () => {
    const typed = who.trim();
    if (!WCA_MILESTONE.validLink(typed)) {
      setState({ at: "refused", message: W.whoShape });
      return;
    }
    setState({ at: "checking" });
    // Naming the competition or the race is the yes, signed before anything is read (the founder, 29 Sep 2026).
    if (!(await agreeFirst(giftId).then(() => true, () => false))) {
      setState({ at: "refused", message: CONSENT.failed });
      return;
    }
    try {
      await checkRegistration(giftId, typed);
      setState({ at: "asking" });
      await onChanged();
    } catch (error) {
      refusal(error, W.failed);
    }
  };

  const read = async () => {
    setState({ at: "reading" });
    try {
      await readWcaLine(giftId);
    } catch (error) {
      refusal(error, W.failed);
      return;
    }
    setState({ at: "proving" });
    try {
      const outcome = await proveWca(giftId);
      if (outcome.kind === "reached") {
        setState({ at: "done", line: outcome.line ? { name: outcome.line.runner, best: outcome.line.finishSeconds } : null });
        await onChanged();
      } else setState({ at: "refused", message: outcome.kind === "refused" ? outcome.message : W.failed });
    } catch (error) {
      refusal(error, W.failed);
    }
  };

  if (state.at === "done") {
    return (
      <section className={CARD} role="status">
        {state.line ? <p className={BODY}>{W.line(state.line.name, wca.eventLabel, wcaResultInWords(state.line.best, wca.eventId))}</p> : null}
      </section>
    );
  }
  if (!yours) return null;

  if (!wca.registered) {
    return (
      <section className={CARD}>
        <form className="flex flex-col gap-[var(--space-md)]" onSubmit={(event) => { event.preventDefault(); void check(); }}>
          <label className="flex flex-col gap-[var(--space-xs)]" htmlFor="wca-who">
            <span className="font-medium">{W.whoLabel}</span>
            <span className={HELP}>{W.whoHelp(wca.title)}</span>
          </label>
          <input id="wca-who" className={FIELD} value={who} onChange={(event) => { setWho(event.target.value); if (state.at === "refused") setState({ at: "asking" }); }} autoComplete="off" />
          <FieldRefusal id="wca-who-refusal">{state.at === "refused" ? state.message : undefined}</FieldRefusal>
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy || who.trim() === ""}>
            {state.at === "checking" ? W.checking : W.checkRegistration}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <p className="font-medium">{W.registered(wca.registered.who, wca.title)}</p>
      <p className={HELP}>{W.beforeTheDay}</p>
      <button type="button" onClick={() => void read()} disabled={busy} className={PRIMARY_BUTTON}>
        {state.at === "reading" || state.at === "proving" ? W.reading : W.readMyResult}
      </button>
      <FieldRefusal id="wca-read-refusal">{state.at === "refused" ? state.message : undefined}</FieldRefusal>
    </section>
  );
}

/** Where the competition stands, for whoever reads the page outside the competitor's own moment: the registration once checked, and the result once read. */
export function WcaStanding({ wca }: Readonly<{ wca: NonNullable<MilestoneStatus["wca"]> }>) {
  return (
    <>
      <p className={BODY}>{wca.registered ? W.registered(wca.registered.who, wca.title) : W.notRegisteredYet(wca.title)}</p>
      {wca.result ? <p className={BODY}>{W.line(wca.result.name, wca.eventLabel, wca.result.inWords)}</p> : null}
    </>
  );
}
