"use client";
import { useEffect, useRef, useState } from "react";
import { agreeFirst } from "@/src/client/consent";
import { ApiError } from "@/src/client/api";
import { awaitShownProof, openShownProof, openShownSessionOf, type OpenShown } from "@/src/client/gift";
import { verdictOnly } from "@/src/condition-privacy";
import { conditionById } from "@/src/conditions";
import { SHOW_PROOF as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { Said } from "./Said";

/**
 * The one gesture of a shown condition (D162): the person the gift is for presses "Show it", signs in to the source on
 * a verification page, and the proof comes back to Viky's server, which checks it and relays it. The funder has no
 * gesture here, and a reader who is neither has none anywhere.
 *
 * In two steps (the audit of 1 Oct 2026). The press signs the yes and opens the session, and those take a moment: a
 * window opened after them is no longer the press's own, and Safari blocks it. So the press prepares, and the
 * verification page is then a real link, named after where the person signs in, that they press themselves. It stays
 * on the screen to be opened again, with the wait under it and a way to stop waiting.
 *
 * The wait outlives the page (7 Oct 2026). The first two real proofs of a university were made and never asked for:
 * the person came back from nine minutes on the verification page, the phone had let go of this one and loaded it
 * again, and the session, kept in this component's memory alone, was gone, so the page offered "Show it". The server
 * holds the session, so the page asks it when it loads: one still open is waited for again, looked at at once, with
 * its link back in its place. A press made before that answer takes the open one up and never opens a second.
 *
 * The character at the head of the page answers a proof shown as it answers a day earned: once, from the button,
 * the happy face (app/kit/mood.ts), and back to rest by itself.
 */
type State = { at: "asking" } | { at: "preparing" } | { at: "waiting"; requestUrl: string } | { at: "done"; score: string } | { at: "held" } | { at: "refused"; message: string };

const CARD = "on-paper flex flex-col gap-[var(--space-md)] rounded-[var(--radius-card)] p-[var(--space-lg)]";
/** Why a wait was stopped when it was the page being left and not the person's own press. */
const LEFT = "left";

export function ShowProof({
  giftId,
  conditionId,
  yours,
  review = null,
  reviewMessage = null,
  limitReached = false,
  onShown,
}: Readonly<{ giftId: string; conditionId: string; yours: boolean; /** A first proof under review, or refused by it (D312). */ review?: "building" | "pending" | "refused" | null; /** A refusal in its own words, where it has them. */ reviewMessage?: string | null; /** The month's limit of proofs is reached: said before the person starts (the founder, 3 Oct 2026). */ limitReached?: boolean; onShown: () => Promise<void> | void }>) {
  const condition = conditionById(conditionId);
  const [state, setState] = useState<State>({ at: "asking" });
  const waiting = useRef<AbortController | null>(null);
  /** The session the server says is open for this gift, asked once when the page loads; taken up once and no more. */
  const found = useRef<Promise<OpenShown | null> | null>(null);
  const shows = yours && condition?.nature === "shown" && !review;
  const reload = useRef(onShown);
  useEffect(() => {
    reload.current = onShown;
  });

  /** Waits for one session's proof and says how it ended. A wait stopped by the page being left says nothing. */
  const waitFor = useRef(async (session: OpenShown, stop: AbortController, resumed: boolean) => {
    try {
      setState({ at: "waiting", requestUrl: session.requestUrl });
      const outcome = await awaitShownProof({ sessionId: session.sessionId, signal: stop.signal, secondsLeft: session.secondsLeft, resumed });
      if (outcome.kind === "reached") {
        setState({ at: "done", score: outcome.shown });
        await reload.current();
        return;
      }
      if (outcome.kind === "held") {
        setState({ at: "held" });
        await reload.current();
        return;
      }
      setState({ at: "refused", message: W.refusals.unavailable });
    } catch (error) {
      if (stop.signal.reason === LEFT) return;
      const code = error instanceof ApiError ? error.code : "";
      // Answered from another page of this gift, or aged out: what the gift says now is read again either way.
      if (code === "UNKNOWN_SESSION") await reload.current();
      const said: Record<string, string> = {
        NOT_CONFIGURED: W.refusals.notConfigured,
        PROOF_TOO_OLD: W.refusals.tooOld,
        TIMED_OUT: W.refusals.tooOld,
        UNKNOWN_SESSION: W.refusals.tooOld,
        // Stopped by the person: the button is back, and the page says nothing was changed.
        CANCELLED: W.refusals.cancelled,
      };
      setState({ at: "refused", message: said[code] ?? (error instanceof ApiError && error.message ? error.message : W.refusals.unavailable) });
    }
  });

  useEffect(() => {
    if (!shows) return;
    const stop = new AbortController();
    // A lookup that fails is a page with nothing open, as before: the button opens a session.
    const asked = openShownSessionOf(giftId).catch(() => null);
    found.current = asked;
    void asked.then((open) => {
      // Taken up by a press made meanwhile, or the page was left.
      if (!open || stop.signal.aborted || found.current !== asked) return;
      found.current = null;
      waiting.current = stop;
      void waitFor.current(open, stop, true);
    });
    // A wait still running when the page is left asks nothing more.
    return () => {
      stop.abort(LEFT);
      waiting.current?.abort(LEFT);
    };
  }, [giftId, shows]);
  if (!yours || !condition || condition.nature !== "shown") return null;

  const show = async () => {
    setState({ at: "preparing" });
    const stop = new AbortController();
    waiting.current = stop;
    try {
      // A press before the page knew of a session already open takes that one up, and opens no second beside it.
      const asked = found.current;
      found.current = null;
      const open = asked ? await asked : null;
      if (stop.signal.aborted) return;
      if (open) return await waitFor.current(open, stop, true);
      // Opening the portal is the yes, signed before anything is shown (the founder, 29 Sep 2026).
      await agreeFirst(giftId);
      const session = await openShownProof({ giftId, conditionId, phase: "reach" });
      if (stop.signal.aborted) return;
      await waitFor.current(session, stop, false);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setState({ at: "refused", message: code === "NOT_CONFIGURED" ? W.refusals.notConfigured : error instanceof ApiError && error.message ? error.message : W.refusals.unavailable });
    }
  };

  // Held for review, or refused by it (D312): said in the button's place, since showing it again changes nothing.
  if (state.at === "held" || review) {
    return (
      <section className={CARD} role="status">
        <Said className="font-medium" text={state.at === "held" ? W.held : review === "refused" ? (reviewMessage ?? W.reviewRefused) : review === "building" ? W.building : W.held} />
      </section>
    );
  }

  if (state.at === "done") {
    return (
      <section className={CARD} role="status">
        <p className="font-medium">{W.shown(state.score)}</p>
      </section>
    );
  }

  // The month's reserve of proofs is used up: the card says so above, quietly, with what the person can do (the
  // founder, 3 Oct 2026). Nothing is offered here, so nothing is opened or asked of them.
  if (limitReached && state.at !== "waiting") return null;

  return (
    <section className={CARD}>
      <p className="font-medium">{W.title(condition.source)}</p>
      {/* One sentence in the open, what opens; where the person signs in and what Viky keeps are folded (rule 4). */}
      <Said className={HELP} text={`${W.whatHappens(condition.source)} ${W.kept[conditionId] ?? (verdictOnly(conditionId) ? W.keptVerdict : W.keptNumber)}`} />
      {state.at === "waiting" ? (
        <>
          <a href={state.requestUrl} target="_blank" rel="noopener" className={`${PRIMARY_BUTTON} block text-center no-underline`}>
            {W.signInTo(condition.source)}
          </a>
          <p className={HELP} role="status">
            {W.waiting}
          </p>
          <button type="button" onClick={() => waiting.current?.abort()} className={`${SMALL_BUTTON} self-start`}>
            {W.stopWaiting}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => void show()} disabled={state.at === "preparing"} className={PRIMARY_BUTTON}>
          {state.at === "preparing" ? W.preparing : W.button}
        </button>
      )}
      {state.at === "refused" ? (
        <p className={BODY} role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
