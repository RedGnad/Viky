"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { clearRampnowJournal, rampnowJournalAsKept, readRampnowJournal, subscribeToRampnowJournal } from "@/src/client/rampnow-journal";

const noneOnTheServer = () => "[]";
const clock = (atMs: number) => new Date(atMs).toISOString().slice(11, 19);
const day = (atMs: number) => new Date(atMs).toISOString().slice(0, 10);

/** The journal of Rampnow's frame as this device keeps it: one line per message or per thing a screen did, times in UTC. */
export function RampnowJournal() {
  const kept = useSyncExternalStore(subscribeToRampnowJournal, rampnowJournalAsKept, noneOnTheServer);
  // Read again whenever what is kept changes: the text itself is only what says that it did.
  const lines = useMemo(() => (kept === "[]" ? [] : readRampnowJournal()), [kept]);
  const [copied, setCopied] = useState(false);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rampnow&apos;s frame, on this device</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Everything Rampnow&apos;s page posted to Viky from the frame, and what the screens did, as this browser wrote it down. Times are UTC. It is kept on
          this device for a week, sent nowhere, and read here alone.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(JSON.stringify(lines, null, 2))
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            {copied ? "Copied" : "Copy all of it"}
          </button>
          <button
            type="button"
            className="rounded-full border px-4 py-2 text-sm"
            onClick={() => {
              clearRampnowJournal();
              setCopied(false);
            }}
          >
            Forget all of it
          </button>
        </div>
      </header>
      {lines.length === 0 ? (
        <p className="text-sm">Nothing written down on this device.</p>
      ) : (
        <ol className="space-y-2 text-sm" data-rampnow-journal="">
          {lines.map((line, index) => {
            const before = lines[index - 1];
            const sinceBefore = before ? Math.round((line.atMs - (before.lastMs ?? before.atMs)) / 1000) : null;
            return (
              <li key={`${line.atMs}-${index}`} className="rounded border p-2">
                <p className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  {day(line.atMs)} {clock(line.atMs)}
                  {sinceBefore === null ? "" : ` (+${sinceBefore} s)`}
                  {line.times && line.times > 1 ? `, ${line.times} times, last at ${clock(line.lastMs ?? line.atMs)}` : ""}
                </p>
                <p className="font-medium">{line.what}</p>
                {line.orderUid ? <p className="font-mono text-xs">order {line.orderUid}</p> : null}
                {line.carried ? <p className="font-mono text-xs break-all">{line.carried}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
