"use client";
import { useEffect, useState } from "react";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { formatAusd } from "@/src/gift-reader";
import { PAY as W } from "@/src/sentences";
import { HELP, INLINE_BUTTON } from "../../components/ui";
import { Field } from "../Field";
import { FieldRefusal } from "../FieldRefusal";

/** A balance as whole cents, rounded down, as the card's amount field takes it: 25.004999 is "25.00". */
export function centsDown(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/**
 * The judge code, asked as a checkout asks one (D297), wherever a signed-in person is about to pay: the pay sheet, and
 * the waiting screen a first funder lands on once pay has made their account (D299). Folded behind a small key while
 * credits are open and the account has not had its credit; the server credits the session's account and no other.
 * Once it is sent, `onCredited` reads the balance again, and when the gift is more than the account holds, "Make the
 * gift" offers what it holds, rounded down to the cent.
 */
export function JudgeCode({
  covered,
  held,
  onCredited,
  onMakeIt,
}: Readonly<{ covered: boolean; held: bigint | null; onCredited: () => void; onMakeIt: (dollars: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [credited, setCredited] = useState(false);
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [given, setGiven] = useState<bigint | null>(null);

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
      setGiven(BigInt(answer.units));
      setCredited(true);
      onCredited();
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
        {!covered && held !== null && held > 0n ? (
          <>
            <p className={HELP}>{W.code.short(formatAusd(held))}</p>
            <button type="button" className={`${INLINE_BUTTON} self-start`} onClick={() => onMakeIt(centsDown(held))}>
              {W.code.makeIt(formatAusd(BigInt(centsDown(held).replace(".", "")) * 10_000n))}
            </button>
          </>
        ) : null}
      </div>
    );
  }
  if (covered || !open || credited) return null;
  if (!shown) {
    return (
      <button type="button" className={`${INLINE_BUTTON} self-start`} onClick={() => setShown(true)}>
        {W.code.have}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <Field id="gift-code" label={W.code.label} value={code} onChange={setCode} autoComplete="off" spellCheck={false} />
      {problem ? <FieldRefusal id="gift-code-refused">{problem}</FieldRefusal> : null}
      <button type="button" className={`${INLINE_BUTTON} self-start`} disabled={busy || code.trim().length === 0} onClick={() => void redeem()}>
        {busy ? W.code.using : W.code.use}
      </button>
    </div>
  );
}
