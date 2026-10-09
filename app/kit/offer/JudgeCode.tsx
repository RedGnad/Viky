"use client";
import { useEffect, useState } from "react";
import { refusalAfterPaying } from "@/src/after-paying";
import { getJson, postJson } from "@/src/client/api";
import { formatAusd } from "@/src/gift-reader";
import { PAY as W } from "@/src/sentences";
import { HELP, SMALL_BUTTON } from "../../components/ui";
import { Button } from "../Button";
import { Field } from "../Field";
import { WAITS } from "@/src/sentences";

/** A balance as whole cents, rounded down, as the card's amount field takes it: 25.004999 is "25.00". */
export function centsDown(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/**
 * The judge code, asked as a checkout asks one (D297), wherever a person is about to pay: the pay sheet, and the
 * waiting screen a first funder lands on once pay has made their account (D299). Offered while credits are open and
 * the account has not had its credit; the server credits the session's account and no other. Once it is sent,
 * `onCredited` reads the balance again, and when the gift is more than the account holds, the gift is brought to what
 * it holds, rounded down to the cent, and a line says so (choice B, D300).
 *
 * Always small beside what pays (the founder, 9 Oct 2026: a code is visible, never put forward in the place of the
 * card): a small key that opens a field and a small button. On the pay sheet, when the link carried a code, the field
 * is shown from the start with that code in it, under the question as its name. The sheet says when it is drawn
 * (`offered`), having asked the server itself, and makes the account of somebody who has none before the code is sent
 * (`before`).
 */
export function JudgeCode({
  needed,
  held,
  onCredited,
  onMakeIt,
  shownFromTheStart = false,
  label = W.code.label,
  offered,
  startWith = "",
  before,
}: Readonly<{
  needed: bigint | null;
  held: bigint | null;
  onCredited: () => void;
  onMakeIt: (dollars: string) => void;
  /** The field shown from the start, rather than behind the small key: the link carried a code. */
  shownFromTheStart?: boolean;
  /** The field's own name: "Code" unless said. */
  label?: string;
  /** Whether a code can be used here now, when whoever draws this has asked the server already; asked here otherwise. */
  offered?: boolean;
  /** The code the link carried: the field starts on it. */
  startWith?: string;
  /** Done before the code is sent. False stops there, and whoever gave it has said why. */
  before?: () => Promise<boolean>;
}>) {
  const covered = needed !== null && held !== null && held >= needed;
  const [open, setOpen] = useState(false);
  const [credited, setCredited] = useState(false);
  const [shown, setShown] = useState(shownFromTheStart);
  const [code, setCode] = useState(startWith);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [given, setGiven] = useState<bigint | null>(null);
  const [adjustedTo, setAdjustedTo] = useState<bigint | null>(null);

  useEffect(() => {
    // The pay sheet has asked already, and says what it was told.
    if (offered !== undefined) return;
    let live = true;
    getJson<{ open?: boolean; credited?: boolean }>("/api/judge/credit").then(
      (answer) => {
        if (!live) return;
        setOpen(answer.open === true);
        setCredited(answer.credited === true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [offered]);

  const redeem = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (before && !(await before())) return;
      const answer = await postJson<{ units: string }>("/api/judge/credit", { code });
      const credit = BigInt(answer.units);
      setGiven(credit);
      setCredited(true);
      onCredited();
      // Choice B (D300): the treasury answers once its transfer is final, so the account now holds what it held plus
      // the credit. A gift above that is brought to it, to the cent below, with nothing more for a judge to understand.
      const holds = (held ?? 0n) + credit;
      if (needed !== null && needed > holds) {
        const dollars = centsDown(holds);
        const units = BigInt(dollars.replace(".", "")) * 10_000n;
        if (units > 0n) {
          setAdjustedTo(units);
          onMakeIt(dollars);
        }
      }
    } catch (error) {
      // On a screen that pays by card, a call that answered nothing says the code's own sentence (src/after-paying.ts).
      setProblem(refusalAfterPaying(error, W.code.failed));
    } finally {
      setBusy(false);
    }
  };

  if (given !== null) {
    return (
      <div className="flex flex-col gap-[var(--space-xs)]">
        <p className={HELP} role="status">
          {W.code.given(formatAusd(given))}
        </p>
        {adjustedTo !== null ? <p className={HELP}>{W.code.adjusted(formatAusd(adjustedTo))}</p> : null}
      </div>
    );
  }
  if (covered || !(offered ?? (open && !credited))) return null;
  const field = (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <Field id="gift-code" label={label} value={code} onChange={setCode} autoComplete="off" spellCheck={false} />
      <Button look="small" className="self-start" doing={busy ? W.code.using : null} step={WAITS.code} waiting={code.trim().length === 0} failed={problem} failedId="gift-code-refused" onPress={() => void redeem()}>
        {W.code.use}
      </Button>
    </div>
  );
  if (!shown) {
    return (
      <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setShown(true)} data-have-a-code="">
        {W.code.have}
      </button>
    );
  }
  return field;
}
