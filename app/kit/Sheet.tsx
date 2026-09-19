"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { HELP, TITLE } from "../components/ui";

/**
 * A sheet: where a case of the card is filled in (the product vision of 19 Sep 2026, sections 4 and 6).
 *
 * The rule it exists for: a case opens in a sheet at the bottom of the screen, never on another page. The card stays
 * where it is, the sheet comes up over it, and closing it puts the person back in front of the object they are
 * building rather than at the top of a new screen.
 *
 * It is a native `<dialog>` opened with `showModal`, so the browser gives what would otherwise be written by hand and
 * written badly: the focus stays inside, Escape closes it, everything behind it is inert, and a screen reader
 * announces a dialog. The backdrop closes it too, because a sheet is a place a person can leave by tapping away.
 */
export function Sheet({
  open,
  title,
  help,
  onClose,
  children,
  footer,
}: Readonly<{
  open: boolean;
  title: string;
  /** One line under the title, when the sheet needs to say what it is for. */
  help?: string;
  onClose: () => void;
  children: ReactNode;
  /** The action that ends the sheet, kept at the bottom where the thumb is. */
  footer?: ReactNode;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={labelId}
      // Escape, the close button and the backdrop all end in the same place: the dialog's own close event.
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-[var(--space-md)] px-[var(--space-lg)] pt-[var(--space-lg)]">
          <div className="space-y-[var(--space-xs)]">
            <h2 id={labelId} className={TITLE}>
              {title}
            </h2>
            {help ? <p className={HELP}>{help}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="-mr-[var(--space-sm)] -mt-[var(--space-sm)] inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center justify-center rounded-full text-[length:var(--type-title)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div className="flex-1 space-y-[var(--space-md)] overflow-y-auto px-[var(--space-lg)] py-[var(--space-md)]">{children}</div>
        {footer ? (
          <div className="flex flex-col gap-[var(--tap-gap)] border-t border-[var(--divider)] px-[var(--space-lg)] pt-[var(--space-md)] pb-[calc(var(--space-lg)+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
