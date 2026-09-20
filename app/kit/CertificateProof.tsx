"use client";
import { useState } from "react";
import { proveCertificateGift, readCertificate } from "@/src/client/certificate-gift";
import { ApiError } from "@/src/client/api";
import { certificateById, type CertificateCondition } from "@/src/milestone-conditions";
import { CARD, FIELD, HELP, PRIMARY_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

/**
 * The recipient's half of a gift on a supervised result (U3, C3): they paste the link of their own certificate.
 *
 * Three things it has to say, and it says them in the register's words. Where the link is found, because it does not
 * exist until its holder presses a button on their own certificate. What Viky reads and what it does not keep. And why
 * a link does not pay when it does not: taken private again, past its two years, another name, under the score, or
 * outside the days of the gift. Every one of those is a typed answer from the server, never a refusal from a contract.
 *
 * It is self-contained: one line puts it on a page, and it asks the server for everything it shows.
 */

type State =
  | { at: "asking" }
  | { at: "reading" }
  | { at: "refused"; message: string }
  | { at: "proving" }
  | { at: "done"; score: number };

export function CertificateProof({
  giftId,
  conditionId,
  yours,
  onProved,
}: {
  giftId: string;
  conditionId: string;
  /** Only the person the gift is for pastes a certificate: it is theirs to share, and the gift settles into their account. */
  yours: boolean;
  onProved: () => Promise<void> | void;
}) {
  const certificate: CertificateCondition | undefined = certificateById(conditionId);
  const [link, setLink] = useState("");
  const [state, setState] = useState<State>({ at: "asking" });

  if (!yours || !certificate) return null;
  const words = certificate.words;
  const busy = state.at === "reading" || state.at === "proving";

  const send = async () => {
    const typed = link.trim();
    if (!certificate.validLink(typed)) {
      setState({ at: "refused", message: words.refusals.linkShape });
      return;
    }
    // Read plainly first, so a link that is not public, expired or in another name is answered without touching money.
    setState({ at: "reading" });
    try {
      await readCertificate(certificate.readPath, typed);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      const said: Record<string, string> = {
        CERTIFICATE_PRIVATE: words.refusals.notPublic,
        CERTIFICATE_EXPIRED: words.refusals.expired,
        NO_CERTIFICATE: words.refusals.notFound,
        INVALID_LINK: words.refusals.linkShape,
        // Credly's own two: no badge answers to that link, and a real badge for something else entirely.
        NO_BADGE: words.refusals.notFound,
        NOT_LISTED: words.refusals.anotherName,
      };
      setState({ at: "refused", message: said[code] ?? words.refusals.unavailable });
      return;
    }
    setState({ at: "proving" });
    const outcome = await proveCertificateGift(giftId, typed).catch(() => null);
    if (!outcome) {
      setState({ at: "refused", message: words.refusals.unavailable });
      return;
    }
    if (outcome.kind === "reached") {
      setState({ at: "done", score: outcome.score });
      await onProved();
      return;
    }
    setState({ at: "refused", message: outcome.kind === "refused" ? outcome.message : words.refusals.unavailable });
  };

  if (state.at === "done") {
    return (
      <section className={CARD} role="status">
        <p className="font-medium">{words.whenReached}</p>
        <p className={HELP}>{certificate.target.inWords(state.score)}</p>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <form
        className="flex flex-col gap-[var(--space-md)]"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="flex flex-col gap-[var(--space-xs)]" htmlFor="certificate-link">
          <span className="font-medium">{words.linkLabel}</span>
          <span className={HELP}>{words.linkHelp}</span>
        </label>
        <input
          id="certificate-link"
          className={FIELD}
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            if (state.at === "refused") setState({ at: "asking" });
          }}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
        />
        <FieldRefusal id="certificate-refusal">{state.at === "refused" ? state.message : undefined}</FieldRefusal>
        {/* What is read, and what is not kept: said before the link is pasted, not after. */}
        <p className={HELP}>{words.whatIsRead}</p>
        <button type="submit" disabled={busy || link.trim() === ""} className={PRIMARY_BUTTON}>
          {state.at === "reading" || state.at === "proving" ? words.checking : words.check}
        </button>
      </form>
    </section>
  );
}
