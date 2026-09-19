"use client";
import { useState } from "react";
import { tidyGiftName } from "@/src/gift-names";
import type { GiftDraft } from "@/src/gift-draft";
import { FUND, OFFER as W } from "@/src/sentences";
import { HELP, SECONDARY_BUTTON } from "../../components/ui";
import { Field } from "../Field";
import { Sheet } from "../Sheet";

/**
 * The For case: the two names the gift carries (the vision of 19 Sep 2026, section 6, "une feuille : deux champs").
 *
 * The questions and every refusal are the ones the old first step asked, word for word, because they were right: the
 * names are what both people read on the gift, and Viky writes to nobody.
 */
export function WhoSheet({
  open,
  draft,
  onChange,
  onClose,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void }>) {
  const [touched, setTouched] = useState<{ recipient?: boolean; funder?: boolean }>({});
  const refusalFor = (value: string, empty: string): string | undefined => {
    const name = value.trim();
    if (name.length === 0) return empty;
    if (name.length > 40) return FUND.who.refusals.tooLong;
    if (tidyGiftName(name).length === 0) return FUND.who.refusals.notText;
    return undefined;
  };
  const recipientRefusal = refusalFor(draft.recipientName, FUND.who.refusals.recipientEmpty);
  const funderRefusal = refusalFor(draft.funderName, FUND.who.refusals.funderEmpty);
  const ready = !recipientRefusal && !funderRefusal;

  const done = (
    <button
      type="button"
      className={SECONDARY_BUTTON}
      disabled={!ready}
      onClick={() => {
        setTouched({ recipient: true, funder: true });
        if (ready) onClose();
      }}
    >
      {W.done}
    </button>
  );

  return (
    <Sheet open={open} title={W.sheets.who} onClose={onClose} footer={done}>
      <Field
        id="recipient-name"
        label={FUND.who.recipientLabel}
        value={draft.recipientName}
        onChange={(value) => onChange({ ...draft, recipientName: value })}
        onBlur={() => setTouched((was) => ({ ...was, recipient: true }))}
        refusal={touched.recipient ? recipientRefusal : undefined}
        autoComplete="off"
      />
      <Field
        id="funder-name"
        label={FUND.who.funderLabel}
        help={FUND.who.funderHelp}
        value={draft.funderName}
        onChange={(value) => onChange({ ...draft, funderName: value })}
        onBlur={() => setTouched((was) => ({ ...was, funder: true }))}
        refusal={touched.funder ? funderRefusal : undefined}
        autoComplete="off"
      />
      <p className={HELP}>{FUND.who.seen}</p>
      <p className={HELP}>{FUND.who.neverWrites}</p>
    </Sheet>
  );
}
