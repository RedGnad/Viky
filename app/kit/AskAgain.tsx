"use client";
import { useState } from "react";
import { GIFT_LIVE as L } from "@/src/sentences";
import { HELP, PRIMARY_BUTTON } from "../components/ui";

/**
 * "Départ trop haut", the person's one action (document J): asking the funder for a new gift. Viky has no way to send
 * a message for them, and must not invent one, so the words are handed to them: the phone's own share sheet where
 * there is one, the clipboard otherwise, and a sentence either way saying what happened.
 */
export function AskAgain({ funderName }: Readonly<{ funderName: string | null }>) {
  const [answer, setAnswer] = useState<"copied" | "refused" | null>(null);
  const message = L.startTooHigh.askMessage(funderName);
  const ask = () => {
    if (typeof navigator.share === "function") {
      void navigator.share({ text: message }).catch(() => undefined);
      return;
    }
    navigator.clipboard.writeText(message).then(
      () => setAnswer("copied"),
      () => setAnswer("refused"),
    );
  };
  return (
    <>
      <button type="button" onClick={ask} className={PRIMARY_BUTTON}>
        {L.startTooHigh.ask(funderName)}
      </button>
      {answer === "copied" ? (
        <p role="status" className={HELP}>
          {L.startTooHigh.asked}
        </p>
      ) : null}
      {answer === "refused" ? <p className={`${HELP} select-all`}>{message}</p> : null}
    </>
  );
}
