"use client";
import { useRef, useState } from "react";
import { ApiError } from "@/src/client/api";
import { runShownProof } from "@/src/client/gift";
import { conditionById } from "@/src/conditions";
import { SHOW_PROOF as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON } from "../components/ui";

/**
 * The one gesture of a shown condition (D162): the person the gift is for presses "Show it", a verification tab
 * opens on the source's own sign-in, and the proof comes back to Viky's server, which checks it and relays it. The
 * funder has no gesture here, and a reader who is neither has none anywhere.
 *
 * The character at the head of the page answers a proof shown as it answers a day earned: once, from the button,
 * the happy face (app/kit/mood.ts), and back to rest by itself.
 */
type State = { at: "asking" } | { at: "opening" } | { at: "waiting"; attempt: number } | { at: "done"; score: string } | { at: "held" } | { at: "refused"; message: string };

const CARD = "on-paper flex flex-col gap-[var(--space-md)] rounded-[var(--radius-card)] p-[var(--space-lg)]";

export function ShowProof({
  giftId,
  conditionId,
  yours,
  review = null,
  onShown,
}: Readonly<{ giftId: string; conditionId: string; yours: boolean; /** A first proof under review, or refused by it (D312). */ review?: "building" | "pending" | "refused" | null; onShown: () => Promise<void> | void }>) {
  const condition = conditionById(conditionId);
  const [state, setState] = useState<State>({ at: "asking" });
  const button = useRef<HTMLButtonElement>(null);
  if (!yours || !condition || condition.nature !== "shown") return null;
  const busy = state.at === "opening" || state.at === "waiting";

  const show = async () => {
    setState({ at: "opening" });
    try {
      const outcome = await runShownProof({
        giftId,
        conditionId,
        phase: "reach",
        openUrl: (url) => window.open(url, "_blank", "noopener"),
        onWaiting: (attempt) => setState({ at: "waiting", attempt }),
      });
      if (outcome.kind === "reached") {
        setState({ at: "done", score: outcome.shown });
        await onShown();
        return;
      }
      if (outcome.kind === "held") {
        setState({ at: "held" });
        await onShown();
        return;
      }
      setState({ at: "refused", message: W.refusals.unavailable });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      const said: Record<string, string> = {
        NOT_CONFIGURED: W.refusals.notConfigured,
        PROOF_TOO_OLD: W.refusals.tooOld,
        TIMED_OUT: W.refusals.tooOld,
        CANCELLED: W.refusals.cancelled,
      };
      setState({ at: "refused", message: said[code] ?? (error instanceof ApiError && error.message ? error.message : W.refusals.unavailable) });
    }
  };

  // Held for review, or refused by it (D312): said in the button's place, since showing it again changes nothing.
  if (state.at === "held" || review) {
    return (
      <section className={CARD} role="status">
        <p className="font-medium">{state.at === "held" ? W.held : review === "refused" ? W.reviewRefused : review === "building" ? W.building : W.held}</p>
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

  return (
    <section className={CARD}>
      <p className="font-medium">{W.title(condition.source)}</p>
      <p className={HELP}>{W.whatHappens(condition.source)}</p>
      <button ref={button} type="button" onClick={() => void show()} disabled={busy} className={PRIMARY_BUTTON}>
        {state.at === "opening" ? W.opening : state.at === "waiting" ? W.waiting : W.button}
      </button>
      {state.at === "refused" ? (
        <p className={BODY} role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
