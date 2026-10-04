"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { clearRampnowJournal, rampnowJournalAsKept, readRampnowJournal, subscribeToRampnowJournal } from "@/src/client/rampnow-journal";

const noneOnTheServer = () => "[]";
const clock = (atMs: number) => new Date(atMs).toISOString().slice(11, 19);
const day = (atMs: number) => new Date(atMs).toISOString().slice(0, 10);

const count = (lines: number) => (lines === 1 ? "1 line" : `${lines} lines`);

/**
 * The journal of Rampnow's frame as this device keeps it: one line per message or per thing a screen did, times in UTC.
 *
 * Every press answers (the founder, 4 Oct 2026): he pressed both buttons and saw nothing. A copy the browser refused
 * showed nothing, and neither did forgetting a list already empty. The answer to the last press stands under the
 * buttons, with its time, so two presses in a row are told apart; and a copy that is refused puts the text itself
 * on the page, to be selected by hand. A button says what its press does and never declares a state: "Copy all of it"
 * used to turn into "Copied".
 */
export function RampnowJournal() {
  const kept = useSyncExternalStore(subscribeToRampnowJournal, rampnowJournalAsKept, noneOnTheServer);
  // Read again whenever what is kept changes: the text itself is only what says that it did.
  const lines = useMemo(() => (kept === "[]" ? [] : readRampnowJournal()), [kept]);
  /** What the last press did, in words, with the time of the press. */
  const [answer, setAnswer] = useState<string | null>(null);
  const say = (what: string) => setAnswer(`${what} At ${clock(Date.now())} UTC.`);
  /** The browser refused to copy: the text is shown, to be copied by hand. */
  const [byHand, setByHand] = useState(false);
  const text = JSON.stringify(lines, null, 2);

  const copy = () => {
    if (lines.length === 0) return say("Nothing to copy: no line is written down on this device.");
    const refused = () => {
      setByHand(true);
      say("This browser refused to copy. The text is under the buttons: select it and copy it by hand.");
    };
    try {
      navigator.clipboard.writeText(text).then(() => {
        setByHand(false);
        say(`Copied ${count(lines.length)}.`);
      }, refused);
    } catch {
      // A browser that gives a page no clipboard at all.
      refused();
    }
  };
  const forget = () => {
    const had = lines.length;
    clearRampnowJournal();
    setByHand(false);
    say(had === 0 ? "Nothing to forget: no line is written down on this device." : `Forgot ${count(had)}.`);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rampnow&apos;s frame, on this device</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Everything Rampnow&apos;s page posted to Viky from the frame, and what the screens did, as this browser wrote it down. Times are UTC. It is kept on
          this device for a week, sent nowhere, and read here alone.
        </p>
        <div className="flex gap-3">
          <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={copy}>
            Copy all of it
          </button>
          <button type="button" className="rounded-full border px-4 py-2 text-sm" onClick={forget}>
            Forget all of it
          </button>
        </div>
        {/* The answer to the last press: always one, whatever the press found. */}
        <p className="min-h-5 text-sm font-medium" role="status" data-rampnow-journal-answer="">
          {answer}
        </p>
        {byHand && lines.length > 0 ? (
          <textarea
            readOnly
            value={text}
            aria-label="The journal, to copy by hand"
            className="h-64 w-full rounded border p-2 font-mono text-xs"
            data-rampnow-journal-by-hand=""
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}
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
