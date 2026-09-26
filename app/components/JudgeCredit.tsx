"use client";
import { useState } from "react";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { formatAusd } from "@/src/gift-reader";
import { Field } from "../kit/Field";
import { FieldRefusal } from "../kit/FieldRefusal";
import { HELP, SECONDARY_BUTTON } from "./ui";

/**
 * The judge code field (D291), on the judges page only: the signed-in account asks for its credit from Viky's treasury.
 * The server decides everything (the account, the amount, the bounds); this sends the code and says the answer.
 */
export function JudgeCredit({ open }: Readonly<{ open: boolean }>) {
  const { address } = useAccount();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ units: string; hash: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (!open) return <p className={HELP}>Judge credits are not open on this deployment yet.</p>;
  if (!address) return <p className={HELP}>Sign in first: create your account on the home page, then come back here through You, For judges.</p>;
  if (sent) {
    return (
      <p className={HELP} role="status">
        {formatAusd(BigInt(sent.units))} sent to your account from Viky&apos;s treasury (
        <a className="underline" href={`https://monadvision.com/tx/${sent.hash}`}>
          MonadVision
        </a>
        ). It is yours: offer a gift with it, or use it.
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-[var(--space-sm)]"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setProblem(null);
        postJson<{ units: string; hash: string }>("/api/judge/credit", { code })
          .then(setSent, (error: unknown) => setProblem(error instanceof ApiError ? error.message : "The credit could not be asked just now."))
          .finally(() => setBusy(false));
      }}
    >
      <Field id="judge-code" label="Judge code" help="From the submission portal's instructions." value={code} onChange={setCode} autoComplete="off" spellCheck={false} />
      {problem ? <FieldRefusal id="judge-code-refused">{problem}</FieldRefusal> : null}
      <button type="submit" disabled={busy || code.trim().length === 0} className={SECONDARY_BUTTON}>
        {busy ? "Asking the treasury" : "Credit my account"}
      </button>
    </form>
  );
}
