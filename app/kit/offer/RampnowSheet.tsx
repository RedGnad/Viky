"use client";
import { useEffect, useRef, useState } from "react";
import { getJson } from "@/src/client/api";
import { FRAME_HEIGHT, frameHeightFor, RAMPNOW_FRAME_ALLOW, rampnowEventOf, rampnowOutcome } from "@/src/rampnow-frame";
import { WAY_IN_USDC, rampnowPage } from "@/src/rails";
import { PAY as W } from "@/src/sentences";
import { HELP, SMALL_BUTTON } from "../../components/ui";
import { Sheet } from "../Sheet";
import { CardTermsLine } from "./CardTerms";

/** How long the frame has to say it is ready before its page is offered beside it. */
const READY_WITHIN_MS = 15_000;

/**
 * Paying by card through Rampnow inside Viky (the founder, 3 Oct 2026): its widget in a frame of a sheet of our own,
 * filled in and locked with the amount, the euro, the card, USDC on Monad and the payer's own account
 * (src/rampnow-frame.ts). The camera and the payment are allowed in the frame, for its identity check and the card.
 *
 * Back in Viky at the end: the screen that waits under this sheet reads the account itself, and the money arriving
 * there is what closes the sheet and makes the gift (app/components/PayGift.tsx). The frame saying the order is
 * completed closes it too, but nothing counts on it: without a partner's key its messages may never come.
 *
 * The page beside stays the fallback: it is offered when the frame has not said it is ready within fifteen seconds,
 * which without a key is every time, when its address cannot be had, and when it says the payment failed.
 *
 * The frame is held to what the sheet has left, so that it and the link under it stand whole inside the sheet whatever
 * the window; on a window too short even for the frame's least height, the sheet scrolls by what is beside and under
 * the frame.
 */
export function RampnowSheet({
  open,
  account,
  euros,
  onArrived,
  onClose,
}: Readonly<{ open: boolean; account: string | undefined; euros?: number; onArrived: () => void; onClose: () => void }>) {
  const [address, setAddress] = useState<string | null>(null);
  const [fallback, setFallback] = useState<"slow" | "failed" | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(FRAME_HEIGHT.most);
  // The two handlers as they stand now, without listening anew each time the screen under it is drawn.
  const arrived = useRef(onArrived);
  const closed = useRef(onClose);
  useEffect(() => {
    arrived.current = onArrived;
    closed.current = onClose;
  });

  // The frame's address, asked of the server, which puts in the session's own account and the public key when it has one.
  useEffect(() => {
    if (!open || !account) return;
    let live = true;
    getJson<{ url: string }>(`/api/fund/rampnow-frame${euros && euros > 0 ? `?euros=${encodeURIComponent(String(euros))}` : ""}`).then(
      (answer) => live && setAddress(answer.url),
      () => live && setFallback("failed"),
    );
    return () => {
      live = false;
    };
  }, [open, account, euros]);

  // What the frame says, believed only from Rampnow's own origin and in the SDK's own shape.
  useEffect(() => {
    if (!open) return;
    let ready = false;
    const slow = setTimeout(() => {
      if (!ready) setFallback((was) => was ?? "slow");
    }, READY_WITHIN_MS);
    const listen = (message: MessageEvent) => {
      const event = rampnowEventOf(message);
      if (!event) return;
      if (event.type === "WIDGET_READY") ready = true;
      const outcome = rampnowOutcome(event);
      if (outcome === "arrived") arrived.current();
      if (outcome === "closed") closed.current();
      if (outcome === "failed") setFallback("failed");
    };
    window.addEventListener("message", listen);
    return () => {
      clearTimeout(slow);
      window.removeEventListener("message", listen);
    };
  }, [open]);

  // The frame's height, read from the sheet itself: its cap in pixels, its head, the air of its body, and the block
  // under the frame once it is there. Read again when the window changes and when that block comes or changes.
  useEffect(() => {
    if (!open || !address) return;
    const fit = () => {
      const dialog = frame.current?.closest("dialog");
      const body = frame.current?.closest(".sheet-body");
      if (!dialog || !body) return;
      const cap = parseFloat(getComputedStyle(dialog).maxHeight);
      const air = getComputedStyle(body);
      const below = under.current;
      setHeight(
        frameHeightFor({
          cap: Number.isFinite(cap) ? cap : window.innerHeight,
          head: dialog.querySelector("header")?.offsetHeight ?? 0,
          padding: parseFloat(air.paddingTop) + parseFloat(air.paddingBottom),
          // The block under the frame and the air between the two, measured as drawn rather than read from a rule.
          under: below && frame.current ? below.getBoundingClientRect().bottom - frame.current.getBoundingClientRect().bottom : 0,
        }),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    const watch = new ResizeObserver(fit);
    if (under.current) watch.observe(under.current);
    return () => {
      window.removeEventListener("resize", fit);
      watch.disconnect();
    };
  }, [open, address, fallback]);

  return (
    <Sheet open={open} title={W.card.title} onClose={onClose} tall>
      {/* Drawn only while the sheet is open: closed, the frame and whatever Rampnow was showing go with it. */}
      {open && address ? <iframe src={address} title={W.card.frame} allow={RAMPNOW_FRAME_ALLOW} ref={frame} style={{ height }} className="block w-full rounded-[var(--radius-control)] border-0" data-rampnow-frame="" /> : null}
      {open && fallback ? (
        <div ref={under} className="flex flex-col gap-[var(--space-xs)]" data-rampnow-beside="">
          <p className={HELP} role="status">
            {fallback === "failed" ? W.rampnow.failed : W.rampnow.notShowing}
          </p>
          <a href={rampnowPage({ account, euros })} target="_blank" rel="noopener noreferrer" className={`${SMALL_BUTTON} self-start`}>
            {W.rampnow.openPage}
          </a>
          <CardTermsLine way={WAY_IN_USDC} />
        </div>
      ) : null}
    </Sheet>
  );
}
