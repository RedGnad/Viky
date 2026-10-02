"use client";
import { useState } from "react";
import { JUDGES } from "@/src/sentences";
import { SMALL_BUTTON } from "../components/ui";

/**
 * A command somebody is meant to run, with a button that copies it.
 *
 * It exists because a command nobody can copy is a command nobody runs: the verification on the judges page is the one
 * thing on this site a stranger is invited to do themselves, and it has to survive a phone, where selecting three
 * lines of text by hand is the reason people give up.
 *
 * The clipboard can refuse, in a browser that blocks it or without the gesture it wants, so both branches say
 * something. Nothing here is state the page needs: it is one line of text and a button.
 */
export function CopyLine({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      {label ? <p className="text-[length:var(--type-help)] text-[var(--muted)]">{label}</p> : null}
      <div className="flex items-start gap-[var(--space-sm)]">
        <code className="block min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-pre-wrap rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-sm)] text-[length:var(--type-help)]">
          {command}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(command).then(
              () => setCopied("yes"),
              () => setCopied("refused"),
            );
          }}
          className={SMALL_BUTTON}
        >
          {JUDGES.copy}
        </button>
      </div>
      {copied === "yes" ? (
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" role="status">
          {JUDGES.copied}
        </p>
      ) : null}
      {copied === "refused" ? (
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" role="status">
          {JUDGES.copyRefused}
        </p>
      ) : null}
    </div>
  );
}
