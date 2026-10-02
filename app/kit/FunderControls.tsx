"use client";
import { useState } from "react";
import { whenInWords } from "@/src/display-currency";
import { GIFT_PAGE as W, YOU_DECIDE as Y } from "@/src/sentences";
import { CARD, HELP } from "../components/ui";
import { MessagesSheet, useTold, type ToldAbout } from "./MorningMessage";
import { Act, BellMark, RoundControls } from "./RoundControls";
import { TakeItBackSheet, type TakenBack } from "./TakeItBack";

/**
 * The standing controls of the person who offered a gift, under its card and under the link they were just given (the
 * founder's rule 6 of 1 Oct 2026): being told how it goes, and taking back a gift nobody has opened. The same round
 * buttons as the person it is for has, and the same sheets after the press. They replace a wide button or a line with
 * a small button under the card, and an underlined "Take this gift back".
 *
 * Nothing is drawn where there is nothing to decide: a gift that is over, a browser that cannot be told.
 */
export function FunderControls({
  giftId,
  about,
  takeBack,
  onTakenBack,
}: Readonly<{
  giftId: string;
  /** What this gift's messages are about, or nothing at a moment that has none to send. */
  about: ToldAbout | null;
  /** The gift nobody has opened, which only its funder may take back; nothing once it is opened. */
  takeBack: Readonly<{ amountDisplay: string; recipientName: string | null }> | null;
  onTakenBack?: () => void | Promise<void>;
}>) {
  const [open, setOpen] = useState<"messages" | "back" | null>(null);
  const [done, setDone] = useState<TakenBack | null>(null);
  const told = useTold(giftId, about !== null);
  const tells = about !== null && told.step !== "unsupported";

  if (done) {
    return (
      <section className={CARD} role="status">
        <p className="font-medium">{W.takenBack(done.amount, whenInWords(done.atMs))}</p>
        <p className={HELP}>{W.takenBackLink}</p>
      </section>
    );
  }
  if (!tells && !takeBack) return null;

  return (
    <>
      <RoundControls label={Y.title}>
        {tells ? (
          <Act name={Y.messages} state={told.step === "on" ? Y.on : Y.off} onPress={() => setOpen("messages")} data-decide="messages">
            <BellMark />
          </Act>
        ) : null}
        {takeBack ? (
          <Act name={Y.takeBack} state={Y.unopened} onPress={() => setOpen("back")} data-decide="back">
            <svg aria-hidden focusable="false" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </Act>
        ) : null}
      </RoundControls>
      {about ? <MessagesSheet open={open === "messages"} onClose={() => setOpen(null)} told={told} about={about} yours={false} /> : null}
      {takeBack ? (
        <TakeItBackSheet
          open={open === "back"}
          giftId={giftId}
          amountDisplay={takeBack.amountDisplay}
          recipientName={takeBack.recipientName}
          onClose={() => setOpen(null)}
          onTakenBack={async (taken) => {
            setOpen(null);
            setDone(taken);
            await onTakenBack?.();
          }}
        />
      ) : null}
    </>
  );
}
