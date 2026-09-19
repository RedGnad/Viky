"use client";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { durationBounds, type GiftDraft } from "@/src/gift-draft";
import { FUND, OFFER as W } from "@/src/sentences";
import { HELP, INLINE_BUTTON, SECONDARY_BUTTON } from "../../components/ui";
import { Field } from "../Field";
import { Sheet } from "../Sheet";

/**
 * The last case: how long the gift runs, or how long they have to reach it (the vision of 19 Sep 2026, section 6).
 *
 * The length is not a free question: the register gives each condition its own bounds, and the create routes refuse
 * anything outside them. So the sheet offers the three that need no thought, the shortest, the one we suggest and
 * the longest, and a field for anybody who wants another number. The words are the condition's own, which is why a
 * certificate says "how long they have" where a habit says "for how many days".
 */
export function HowLongSheet({
  open,
  draft,
  onChange,
  onClose,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void }>) {
  const bounds = durationBounds(draft.conditionId);
  const bounded = milestoneById(draft.conditionId) ?? certificateById(draft.conditionId);
  const days = Number(draft.days);
  const typedSomething = draft.days.trim().length > 0;
  const refusal = !typedSomething
    ? undefined
    : !Number.isInteger(days)
      ? FUND.amount.refusals.daysShape
      : days < bounds.min || days > bounds.max
        ? (bounded?.words.durationShape(bounds.min, bounds.max) ?? (days < bounds.min ? FUND.amount.refusals.daysLow : FUND.amount.refusals.daysHigh))
        : undefined;
  const ready = typedSomething && refusal === undefined;
  const quick = [...new Set([bounds.min, bounds.suggested, bounds.max])];

  return (
    <Sheet
      open={open}
      title={bounded?.words.durationLabel ?? W.sheets.howLong}
      help={bounded?.words.durationHelp ?? FUND.amount.daysHelp}
      onClose={onClose}
      footer={
        <button type="button" className={SECONDARY_BUTTON} disabled={!ready} onClick={onClose}>
          {W.done}
        </button>
      }
    >
      <div className="flex flex-wrap gap-[var(--tap-gap)]">
        {quick.map((count) => (
          <button
            key={count}
            type="button"
            aria-pressed={days === count}
            onClick={() => onChange({ ...draft, days: String(count) })}
            className={`${INLINE_BUTTON} ${days === count ? "bg-[var(--accent)] text-[var(--on-accent)]" : ""}`}
          >
            {W.howLongSheet.quick(count)}
          </button>
        ))}
      </div>
      <Field
        id="gift-days"
        label={W.howLongSheet.label}
        value={draft.days}
        onChange={(value) => onChange({ ...draft, days: value })}
        refusal={refusal}
        inputMode="numeric"
      />
      <p className={HELP}>{bounded ? bounded.words.ifNot : FUND.amount.missed}</p>
    </Sheet>
  );
}
