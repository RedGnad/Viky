"use client";
import { useState } from "react";
import { agreeFirst } from "@/src/client/consent";
import { CONSENT } from "@/src/sentences";
import { ApiError } from "@/src/client/api";
import { proveMarathon, readMarathonLine, saveBib, type MarathonLine } from "@/src/client/marathon";
import { finishInWords, isValidBib } from "@/src/marathon";
import type { MilestoneStatus } from "@/src/milestone-view";
import { MARATHON_PROOF as W } from "@/src/sentences";
import { BODY, CARD, FIELD, HELP, PRIMARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { Said } from "./Said";
import { FieldRefusal } from "./FieldRefusal";
import { ButtonWords, StepInProgress } from "./Waiting";
import { WAITS } from "@/src/sentences";

/**
 * The recipient's half of "Finish a marathon" (D273), in two moments on the gift's page. Before the start: the bib,
 * entered once, the motif of the account named on a gift's page. After the finish: one press reads their line on the timing
 * company's page, plainly first so a miss is said in words, then attested, and the line read (the name, the bib, the
 * time) is what the page shows, nothing else.
 */

type State = { at: "asking" } | { at: "saving" } | { at: "reading" } | { at: "proving" } | { at: "refused"; message: string } | { at: "done"; line: MarathonLine | null };

export function MarathonProof({ giftId, status, yours, onChanged }: Readonly<{ giftId: string; status: MilestoneStatus; yours: boolean; onChanged: () => Promise<void> | void }>) {
  const marathon = status.marathon;
  const [bib, setBib] = useState("");
  const [state, setState] = useState<State>({ at: "asking" });
  // The field again, for a bib already entered, until the race starts (the audit of 1 Oct 2026).
  const [changing, setChanging] = useState(false);
  if (!marathon) return null;
  const busy = state.at === "saving" || state.at === "reading" || state.at === "proving";
  const refusal = (error: unknown, fallback: string) => setState({ at: "refused", message: error instanceof ApiError ? error.message : fallback });

  const save = async () => {
    const typed = bib.trim();
    if (!isValidBib(typed)) {
      setState({ at: "refused", message: W.bibShape });
      return;
    }
    setState({ at: "saving" });
    // Naming the competition or the race is the yes, signed before anything is read (the founder, 29 Sep 2026).
    if (!(await agreeFirst(giftId).then(() => true, () => false))) {
      setState({ at: "refused", message: CONSENT.failed });
      return;
    }
    try {
      await saveBib(giftId, typed);
      setState({ at: "asking" });
      setChanging(false);
      setBib("");
      await onChanged();
    } catch (error) {
      refusal(error, W.failed);
    }
  };

  const read = async () => {
    setState({ at: "reading" });
    try {
      await readMarathonLine(giftId);
    } catch (error) {
      refusal(error, W.failed);
      return;
    }
    setState({ at: "proving" });
    try {
      const outcome = await proveMarathon(giftId);
      if (outcome.kind === "reached") {
        setState({ at: "done", line: outcome.line ?? null });
        await onChanged();
      } else setState({ at: "refused", message: outcome.kind === "refused" ? outcome.message : W.failed });
    } catch (error) {
      refusal(error, W.failed);
    }
  };

  // The line just read, until the page reads the gift again: the name, the bib and the time, and nothing else.
  if (state.at === "done") {
    return (
      <section className={CARD} role="status">
        {state.line ? <p className={BODY}>{W.line(state.line.runner, state.line.bib, finishInWords(state.line.finishSeconds))}</p> : null}
      </section>
    );
  }
  if (!yours) return null;

  if (!marathon.bib || (changing && marathon.bibOpen)) {
    return (
      <section className={CARD}>
        <form className="flex flex-col gap-[var(--space-md)]" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="font-medium" htmlFor="marathon-bib">
            {W.bibLabel}
          </label>
          {/* One line of help, the rest folded (the founder's rule 4 of 1 Oct 2026). */}
          <Said under className={HELP} text={!marathon.bibOpen ? W.bibClosed(marathon.raceName) : marathon.bib ? W.bibChangeHelp(marathon.raceName) : W.bibHelp(marathon.raceName)} />
          {marathon.bibOpen ? (
            <>
              <input id="marathon-bib" className={FIELD} value={bib} onChange={(event) => { setBib(event.target.value); if (state.at === "refused") setState({ at: "asking" }); }} inputMode="numeric" autoComplete="off" />
              <FieldRefusal id="marathon-bib-refusal">{state.at === "refused" ? state.message : undefined}</FieldRefusal>
              <button type="submit" className={PRIMARY_BUTTON} disabled={busy || bib.trim() === ""}>
                {state.at === "saving" ? W.saving : W.saveBib}
              </button>
            </>
          ) : null}
        </form>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <p className="font-medium">{W.bibSet(marathon.bib, marathon.raceName, marathon.distance)}</p>
      <p className={HELP}>{marathon.bibOpen ? W.beforeTheRace : W.afterTheRace}</p>
      {marathon.bibOpen ? (
        <button type="button" onClick={() => setChanging(true)} className={SMALL_BUTTON}>
          {W.changeBib}
        </button>
      ) : null}
      {!marathon.bibOpen ? (
        <>
          <button type="button" onClick={() => void read()} disabled={busy} className={PRIMARY_BUTTON}>
            <ButtonWords busy={state.at === "reading" || state.at === "proving"} doing={W.reading}>
              {W.readMyResult}
            </ButtonWords>
          </button>
          <StepInProgress busy={state.at === "reading" || state.at === "proving"} step={WAITS.proof} />
          <FieldRefusal id="marathon-read-refusal">{state.at === "refused" ? state.message : undefined}</FieldRefusal>
        </>
      ) : null}
    </section>
  );
}

/**
 * Where the marathon stands, for whoever reads the page outside the recipient's own moment (the funder, the person
 * after the finish, a reader with the link): the race and the bib once entered, and the line read once it is.
 */
export function MarathonStanding({ marathon }: Readonly<{ marathon: NonNullable<MilestoneStatus["marathon"]> }>) {
  return (
    <>
      <p className={BODY}>{marathon.bib ? W.bibSet(marathon.bib, marathon.raceName, marathon.distance) : W.noBibYet(marathon.raceName)}</p>
      {marathon.result ? <p className={BODY}>{W.line(marathon.result.runner, marathon.result.bib, finishInWords(marathon.result.finishSeconds))}</p> : null}
    </>
  );
}
