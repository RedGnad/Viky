"use client";
import { useEffect, useRef } from "react";
import { AUSD_ADDRESS, MONAD_CHAIN_ID } from "@/src/monad/chain";
import { swapperIntegratorId } from "@/src/rails";
import { PAY as W } from "@/src/sentences";
import { Sheet } from "../Sheet";

/** A colour of the sheet the widget stands in, as the page resolved it, or nothing when it has none. */
function colourOf(element: HTMLElement, name: string): string | undefined {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined;
}

/**
 * Paying by card inside Viky (the founder, 1 Oct 2026): Swapper's widget in a sheet of its own, over the one that pays.
 * It is told what to deliver and where, what a gift holds, on the chain gifts live on, to the payer's own account, so
 * the person chooses no coin and pastes no code; and it is shown the card alone (`depositWithCash`).
 *
 * The widget is an iframe on Swapper's own host (`@swapper-finance/deposit-sdk`, which checks the origin of every
 * message it reads). The card itself is typed on the card service's page, in a window the widget opens: neither Viky
 * nor this frame ever sees it. Nothing is drawn without the integrator id (`NEXT_PUBLIC_SWAPPER_INTEGRATOR_ID`).
 *
 * The amount is typed in the widget, which takes none from us. Its `minDepositUsd` is not used: a card payment under
 * it went on to the card service all the same (20 EUR against 30 USD, read 1 Oct 2026), so a payment that falls short
 * is met where every short payment is, on the screen that waits. `onArrived` is told when the widget says the money was
 * delivered; that screen reads the account itself all the same, and that reading is what makes the gift.
 */
export function SwapperSheet({
  open,
  account,
  onArrived,
  onClose,
}: Readonly<{ open: boolean; account: string | undefined; onArrived: () => void; onClose: () => void }>) {
  const frame = useRef<HTMLDivElement>(null);
  // The two handlers as they stand now, without building the widget anew each time the screen under it is drawn.
  const arrived = useRef(onArrived);
  const closed = useRef(onClose);
  useEffect(() => {
    arrived.current = onArrived;
    closed.current = onClose;
  });

  useEffect(() => {
    const container = frame.current;
    const integratorId = swapperIntegratorId();
    if (!open || !account || !container || !integratorId) return;
    let live = true;
    let widget: { destroy: () => void } | undefined;
    void import("@swapper-finance/deposit-sdk").then(({ SwapperIframe, WidgetEventName }) => {
      if (!live) return;
      const night = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      widget = new SwapperIframe({
        container,
        integratorId,
        dstChainId: String(MONAD_CHAIN_ID),
        dstTokenAddr: AUSD_ADDRESS,
        depositWalletAddress: account,
        supportedDepositOptions: ["depositWithCash"],
        styles: {
          themeMode: night ? "dark" : "light",
          componentStyles: {
            width: "100%",
            primaryColor: colourOf(container, "--accent"),
            primaryButtonTextColor: colourOf(container, "--on-accent"),
            backgroundColor: colourOf(container, "--paper"),
            surfaceColor: colourOf(container, "--paper-field"),
            textColor: colourOf(container, "--on-surface"),
          },
        },
        iframeAttributes: { width: "100%", height: "560px", title: W.card.frame },
        onEvent: (event) => {
          if (event.type === WidgetEventName.TRANSACTION_SUCCESS) arrived.current();
          if (event.type === WidgetEventName.CLOSE_REQUEST) closed.current();
        },
      });
    });
    return () => {
      live = false;
      widget?.destroy();
    };
  }, [open, account]);

  return (
    <Sheet open={open} title={W.card.title} onClose={onClose} tall>
      <div ref={frame} data-card-widget="" className="min-h-[560px] w-full" />
    </Sheet>
  );
}
