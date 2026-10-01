import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What did not leave while a pass ran (the audit of 1 Oct 2026): a morning message a push service refused, an alert
 * Resend refused. Each was already a line in the logs, or was nothing at all, and the pass's own report said nothing of
 * them, so a morning where three phones were told nothing read as a clean morning.
 *
 * The notes are gathered for the run that is under way and for no other: a request served by the same instance while a
 * pass runs writes into no list, because the list travels with the pass's own calls and not with the process.
 */

const gathered = new AsyncLocalStorage<string[]>();

/** Runs something, and returns it with every note written while it ran. */
export async function gatheringNotes<T>(run: () => Promise<T>): Promise<{ value: T; notes: string[] }> {
  const notes: string[] = [];
  const value = await gathered.run(notes, run);
  return { value, notes };
}

/** Writes a note into the pass under way, if there is one. Outside a pass it does nothing: the log line is the trace. */
export function passNote(line: string): void {
  gathered.getStore()?.push(line);
}
