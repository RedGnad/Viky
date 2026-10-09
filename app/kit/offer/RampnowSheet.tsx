"use client";
import { useEffect, useRef, useState } from "react";
import { getJson } from "@/src/client/api";
import { noteInRampnowJournal, noteRampnowMessage } from "@/src/client/rampnow-journal";
import { FRAME_HEIGHT, frameHeightFor, LATE_WAY_OUT_AFTER_MS, orderUidOf, PAYMENT_POSSIBLE_AFTER_MS, RAMPNOW_FRAME_ALLOW, rampnowEventOf, rampnowFinishPage, rampnowSays } from "@/src/rampnow-frame";
import { WAY_IN_USDC, rampnowPage, type CardAsked } from "@/src/rails";
import { PAY as W } from "@/src/sentences";
import { BODY, HELP, SMALL_BUTTON } from "../../components/ui";
import { Sheet } from "../Sheet";
import { CardTermsLine } from "./CardTerms";

const nothing = () => undefined;

/**
 * Paying by card through Rampnow inside Viky (the founder, 3 Oct 2026): its page in a frame of a sheet of our own,
 * filled in and locked with the amount, the euro, the card, USDC on Monad and the payer's own account
 * (src/rampnow-frame.ts). The camera and the payment are allowed in the frame, for its identity check and the card.
 *
 * One gift, one payment. Rampnow finishes an order from its own page, so a frame closed before the end leaves the
 * money waiting there, and a frame opened anew starts a second order. So this sheet is held: no cross, no handle, and
 * Escape, the backdrop and a pull do nothing. What stands under the frame is the way out, and it depends on what is
 * known of a payment:
 *   - none known: one way out, "Go back without paying", which forgets everything and leads back to paying; and the
 *     page beside, for somebody whose sign-in the frame does not keep (Rampnow's session in a frame lives in cookies
 *     set "Partitioned", which Safari reads only in 18.4 and from 26.2; not measured on the versions between);
 *   - a payment known, by a message of the frame: no way out, and "Keep this window open";
 *   - five minutes on without the money, in either case: a way out to the screen that waits, which then leads back
 *     to this payment and never to a new one.
 * The money arriving in the account, seen by the screen that waits under this sheet, is what closes it and makes the
 * gift (app/components/PayGift.tsx). Nothing counts on the frame's messages for that: without a partner's key its
 * order messages have never been seen.
 *
 * With `finish` the frame opens on a payment already started: the order Rampnow named, or the person's list of orders,
 * in the frame, where they are still signed in. It starts no new payment, and its way out is "Go back", to the screen
 * that waits, which keeps the payment.
 *
 * A button says what its press does and never declares a state (the founder, 4 Oct 2026).
 *
 * The frame is held to what the sheet has left, so that it and what stands under it are whole inside the sheet
 * whatever the window; on a window too short even for the frame's least height, the sheet scrolls by what is under
 * the frame.
 */
export function RampnowSheet({
  open,
  account,
  ask,
  asking = false,
  finish = null,
  known,
  started,
  onSaid,
  onBack,
  onFailed,
  onLate,
  onBeside,
}: Readonly<{
  open: boolean;
  account: string | undefined;
  /** What the card is asked: how much, and in which currency (src/card-ask.ts). */
  ask?: CardAsked;
  /** That amount is still being asked of Rampnow: the frame waits for it rather than open on no amount. */
  asking?: boolean;
  /** A payment already started, to finish: the order Rampnow named when it named one. No new payment is started. */
  finish?: Readonly<{ orderUid: string | null }> | null;
  /** Whether a payment is known, by a message of the frame, now or on an earlier visit. */
  known: boolean;
  /**
   * Whether a payment was started, as far as this device keeps it (src/client/rampnow-pending.ts): the frame has been
   * open long enough for one, an order was named, or a payment is known.
   */
  started: boolean;
  /**
   * What is learnt of a payment while the frame is open: it is possible (the frame has been open long enough for
   * one), an order exists, or a payment is under way or made; with the order Rampnow named, when it named one.
   */
  onSaid: (what: "possible" | "ordered" | "paying", orderUid: string | null) => void;
  /** The way out under the frame was taken: the sheet closes. What is still waited for is the screen's to decide. */
  onBack: () => void;
  /** The frame said the payment failed and nothing left. */
  onFailed: () => void;
  /** The late way out was taken: the sheet closes and the payment is still waited for. */
  onLate: () => void;
  /** Rampnow's page was opened beside, in a tab of its own: the payment goes on there. */
  onBeside: () => void;
}>) {
  const [address, setAddress] = useState<string | null>(null);
  /** The frame's address could not be had: its page beside is then the way. */
  const [unreachable, setUnreachable] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>(FRAME_HEIGHT.most);
  /** Which wait the late way out is for: it starts again when a payment becomes known. */
  const [lateFor, setLateFor] = useState<string | null>(null);
  // The handlers and what is known as they stand now, without listening anew each time the screen under it is drawn.
  const now = useRef({ onSaid, onFailed, known });
  useEffect(() => {
    now.current = { onSaid, onFailed, known };
  });
  const finishing = finish !== null;
  const orderUid = finish?.orderUid ?? null;
  /** What the frame shows: the payment to finish, or the new payment the server addressed. */
  const shown = finishing ? rampnowFinishPage(orderUid) : address;
  const waitKey = known ? "known" : "none";
  // A payment already started and not known has its way back from the first second: the late one would be the same.
  const late = open && lateFor === waitKey && !(finishing && !known);
  /** How many pages the frame has loaded since it opened: their times are all that can be read of what it shows. */
  const loads = useRef(0);

  // A sheet opened again starts clean: no address from the visit before, nothing unreachable, no late way out.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAddress(null);
      setUnreachable(false);
      setLateFor(null);
    }
  }

  // The frame's address for a new payment, asked of the server, which puts in the session's own account and the public
  // key when it has one. A payment to finish needs none: its page is Rampnow's own.
  const amountAsked = ask && ask.amount > 0 ? `?currency=${encodeURIComponent(ask.currency)}&amount=${encodeURIComponent(String(ask.amount))}` : "";
  useEffect(() => {
    if (!open || !account || finishing || asking) return;
    let live = true;
    getJson<{ url: string }>(`/api/fund/rampnow-frame${amountAsked}`).then(
      (answer) => live && setAddress(answer.url),
      () => live && setUnreachable(true),
    );
    return () => {
      live = false;
    };
  }, [open, account, amountAsked, finishing, asking]);

  // Written down once per opening, with what it opens on and in which browser: the times of a real payment, and what
  // one browser does that another does not, are read from these lines. And once more if the page is left with it open.
  useEffect(() => {
    if (!open) return;
    loads.current = 0;
    noteInRampnowJournal(finishing ? "Viky: the frame opens on a payment already started" : "Viky: the frame opens on a new payment", { orderUid, carried: { browser: navigator.userAgent } });
    const left = () => noteInRampnowJournal("Viky: the page was left with the frame open");
    window.addEventListener("pagehide", left);
    return () => window.removeEventListener("pagehide", left);
  }, [open, finishing, orderUid]);

  // Long enough in front of the person for a payment to have left: said to the screen under it, with no order named.
  useEffect(() => {
    if (!open || !shown || finishing) return;
    const timer = setTimeout(() => now.current.onSaid("possible", null), PAYMENT_POSSIBLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open, shown, finishing]);

  // Five minutes without the money, counted again from the moment a payment becomes known: the late way out.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setLateFor(waitKey), LATE_WAY_OUT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open, waitKey]);

  // What the frame says: everything from Rampnow's own origin is written down, and what is believed is only what its
  // SDK would accept. None of it closes the sheet.
  useEffect(() => {
    if (!open) return;
    const listen = (message: MessageEvent) => {
      noteRampnowMessage(message);
      const event = rampnowEventOf(message);
      if (!event) return;
      const said = rampnowSays(event, now.current.known);
      if (said === "failed") return now.current.onFailed();
      if (said) now.current.onSaid(said, orderUidOf(event));
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [open]);

  // The frame's height, read from the sheet itself: its cap in pixels, its head, the air of its body, and everything
  // that stands under the frame. Read again when the window changes and when what is under it comes or changes.
  useEffect(() => {
    if (!open || !shown) return;
    const fit = () => {
      const dialog = frame.current?.closest("dialog");
      const body = frame.current?.closest(".sheet-body");
      const around = frame.current?.parentElement;
      if (!dialog || !body || !around || !frame.current) return;
      const cap = parseFloat(getComputedStyle(dialog).maxHeight);
      const air = getComputedStyle(body);
      setHeight(
        frameHeightFor({
          cap: Number.isFinite(cap) ? cap : window.innerHeight,
          head: dialog.querySelector("header")?.offsetHeight ?? 0,
          padding: parseFloat(air.paddingTop) + parseFloat(air.paddingBottom),
          // What stands under the frame, and the air between them, measured as drawn.
          under: around.getBoundingClientRect().height - frame.current.getBoundingClientRect().height,
        }),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    const watch = new ResizeObserver(fit);
    if (frame.current?.parentElement) watch.observe(frame.current.parentElement);
    return () => {
      window.removeEventListener("resize", fit);
      watch.disconnect();
    };
  }, [open, shown, known, started, late, unreachable]);

  return (
    // Held: the screen under it closes it, and so does a way out under the frame. Nothing else does.
    <Sheet open={open} title={W.card.title} onClose={nothing} tall held>
      {/* Drawn only while the sheet is open: closed, the frame and whatever Rampnow was showing go with it. */}
      {open && shown ? (
        <iframe
          src={shown}
          title={W.card.frame}
          allow={RAMPNOW_FRAME_ALLOW}
          ref={frame}
          style={{ height }}
          className="block w-full rounded-[var(--radius-control)] border-0"
          data-rampnow-frame=""
          // Each page the frame loads, numbered: what it shows cannot be read from here, when it changes can.
          onLoad={() => noteInRampnowJournal(`Viky: the frame loaded a page (${(loads.current += 1)})`)}
        />
      ) : null}
      {open ? (
        <div className="flex flex-col gap-[var(--space-sm)]" data-rampnow-under={known ? "known" : "none"}>
          {/* Rampnow's page shows "Something went wrong!" of its own at a step it does not know (read in its scripts,
              5 Oct 2026). From the moment a payment was started, what stands under the frame says where that payment
              is found again, whatever the frame shows. */}
          {started ? (
            <p className={HELP} data-rampnow-found-again="">
              {W.rampnow.foundAgain}
            </p>
          ) : null}
          {known ? (
            <p className={`${BODY} font-medium`} role="status" data-rampnow-keep-open="">
              {W.rampnow.keepOpen}
            </p>
          ) : (
            // While no payment is known: the one way out, and beside it the page beside, for a sign-in the frame does
            // not keep and for a frame whose address could not be had. Never a new payment in the place of one already
            // started. One row where the sheet is wide enough, two on a phone: every line here is taken from the frame.
            <div className="flex flex-wrap items-center justify-between gap-x-[var(--space-md)] gap-y-[var(--space-sm)]">
              <button
                type="button"
                className={SMALL_BUTTON}
                data-rampnow-back=""
                onClick={() => {
                  noteInRampnowJournal(finishing ? "Viky: went back from a payment already started" : "Viky: went back without paying");
                  onBack();
                }}
              >
                {finishing ? W.rampnow.goBack : W.rampnow.goBackWithoutPaying}
              </button>
              <div className="flex flex-wrap items-center gap-[var(--space-sm)]" data-rampnow-beside="">
                <p className={HELP}>{unreachable ? W.rampnow.notShowing : W.rampnow.cantSignIn}</p>
                <a
                  href={finishing ? rampnowFinishPage(orderUid) : rampnowPage({ account, ask })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SMALL_BUTTON}
                  onClick={() => {
                    noteInRampnowJournal("Viky: the page beside was opened");
                    onBeside();
                  }}
                >
                  {W.rampnow.openPage}
                </a>
              </div>
            </div>
          )}
          {late ? (
            <div className="flex flex-wrap items-center justify-between gap-[var(--space-sm)]" data-rampnow-late="">
              <p className={HELP}>{W.rampnow.late}</p>
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() => {
                  noteInRampnowJournal("Viky: the late way out was taken");
                  onLate();
                }}
              >
                {W.rampnow.lateOut}
              </button>
            </div>
          ) : null}
          {known ? null : <CardTermsLine way={WAY_IN_USDC} />}
        </div>
      ) : null}
    </Sheet>
  );
}
