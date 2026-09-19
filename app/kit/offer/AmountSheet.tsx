"use client";
import { AmountError, dollarsToUnits, PILOT_CAP_SENTENCE } from "@/src/money";
import type { GiftDraft } from "@/src/gift-draft";
import { FUND, OFFER as W } from "@/src/sentences";
import { HELP, MONEY, PRIMARY_BUTTON } from "../../components/ui";
import { FieldRefusal } from "../FieldRefusal";
import { Sheet } from "../Sheet";

/**
 * The worth case: a keypad, and the amount at the size of the thing it is (the vision of 19 Sep 2026, section 6).
 *
 * The keypad comes first because that is what the money applications our references measured do, and because a
 * thumb on a phone types a price faster on twelve large keys than into a line. What it produces is the same string
 * the old field produced, refused by the same `dollarsToUnits`, so the pilot's ceiling is one rule in one place.
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** What a key does to what is typed: two decimals at most, one dot, and nothing that is not a number. */
export function typed(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : current === "" ? "0." : `${current}.`;
  const next = `${current}${key}`;
  const [whole, decimals] = next.split(".");
  if (whole.length > 7) return current;
  if (decimals !== undefined && decimals.length > 2) return current;
  // A leading zero is only ever the start of "0.", never of "07".
  if (whole.length > 1 && whole.startsWith("0") && decimals === undefined) return current;
  return next;
}

export function AmountSheet({
  open,
  draft,
  onChange,
  onClose,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void }>) {
  let refusal: string | undefined;
  if (draft.dollars.trim().length > 0) {
    try {
      dollarsToUnits(draft.dollars);
    } catch (error) {
      refusal = error instanceof AmountError ? error.message : undefined;
    }
  }
  const ready = draft.dollars.trim().length > 0 && refusal === undefined;

  return (
    <Sheet
      open={open}
      title={W.sheets.amount}
      help={PILOT_CAP_SENTENCE}
      onClose={onClose}
      footer={
        <button type="button" className={PRIMARY_BUTTON} disabled={!ready} onClick={onClose}>
          {W.done}
        </button>
      }
    >
      <p className={`${MONEY} text-center`} aria-live="polite">
        ${draft.dollars.length > 0 ? draft.dollars : "0"}
      </p>
      <FieldRefusal id="gift-dollars-refusal">{refusal}</FieldRefusal>
      <div className="grid grid-cols-3 gap-[var(--tap-gap)]">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key === "back" ? W.amountSheet.backspace : undefined}
            onClick={() => onChange({ ...draft, dollars: typed(draft.dollars, key) })}
            className="control-relief inline-flex min-h-[calc(var(--tap-target)+var(--space-sm))] items-center justify-center rounded-[var(--radius-control)] border-[length:var(--control-border-width)] border-[var(--control-border)] text-[length:var(--type-title)] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
          >
            <span aria-hidden={key === "back"}>{key === "back" ? "⌫" : key}</span>
          </button>
        ))}
      </div>
      <p className={HELP}>{FUND.amount.dollarsHelp(undefined)}</p>
    </Sheet>
  );
}
