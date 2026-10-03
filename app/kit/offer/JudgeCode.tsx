"use client";
import { useEffect, useState } from "react";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { formatAusd } from "@/src/gift-reader";
import { PAY as W } from "@/src/sentences";
import { HELP, SMALL_BUTTON } from "../../components/ui";
import { FoldChevron } from "../GiftLive";
import { Field } from "../Field";
import { FieldRefusal } from "../FieldRefusal";
import { ButtonWords, StepInProgress } from "../Waiting";
import { WAITS } from "@/src/sentences";

/** A balance as whole cents, rounded down, as the card's amount field takes it: 25.004999 is "25.00". */
export function centsDown(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/**
 * The judge code, asked as a checkout asks one (D297), wherever a signed-in person is about to pay: the pay sheet, and
 * the waiting screen a first funder lands on once pay has made their account (D299). Folded behind a small key while
 * credits are open and the account has not had its credit; the server credits the session's account and no other.
 * Once it is sent, `onCredited` reads the balance again, and when the gift is more than the account holds, the gift is
 * brought to what it holds, rounded down to the cent, and a line says so (choice B, D300).
 */
export function JudgeCode({
  needed,
  held,
  onCredited,
  onMakeIt,
  folded = false,
}: Readonly<{
  needed: bigint | null;
  held: bigint | null;
  onCredited: () => void;
  onMakeIt: (dollars: string) => void;
  /** Closed as a fold under its own title, last on the pay sheet (the mockup of 3 Oct 2026), rather than behind a small key. */
  folded?: boolean;
}>) {
  const covered = needed !== null && held !== null && held >= needed;
  const [open, setOpen] = useState(false);
  const [credited, setCredited] = useState(false);
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [given, setGiven] = useState<bigint | null>(null);
  const [adjustedTo, setAdjustedTo] = useState<bigint | null>(null);

  useEffect(() => {
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
  }, []);

  const redeem = async () => {
    setBusy(true);
    setProblem(null);
    try {
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
      setProblem(error instanceof ApiError ? error.message : W.code.failed);
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
  if (covered || !open || credited) return null;
  const field = (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <Field id="gift-code" label={W.code.label} value={code} onChange={setCode} autoComplete="off" spellCheck={false} />
      {problem ? <FieldRefusal id="gift-code-refused">{problem}</FieldRefusal> : null}
      <button type="button" className={`${SMALL_BUTTON} self-start`} disabled={busy || code.trim().length === 0} onClick={() => void redeem()}>
        <ButtonWords busy={busy} doing={W.code.using}>
          {W.code.use}
        </ButtonWords>
      </button>
      <StepInProgress busy={busy} step={WAITS.code} />
    </div>
  );
  if (folded) {
    return (
      <details className="said-fold" data-have-a-code="">
        <summary className="said-fold-name">
          {W.code.have}
          <FoldChevron />
        </summary>
        <div className="said-fold-body">{field}</div>
      </details>
    );
  }
  if (!shown) {
    return (
      <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setShown(true)}>
        {W.code.have}
      </button>
    );
  }
  return field;
}
