"use client";
import { useState } from "react";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

/**
 * Connecting the source a gift counts: the one gesture of the one moment where a person has something to do
 * (document J, the row "opened, not connected").
 *
 * One flow for both shapes of gift, because it is one flow, in five states: the funder named the account and the
 * reading starts; nobody named it and they give the name; the name is known and a code is asked for; the code is
 * waiting to be put in their own name; the code expired. It was written twice, once per shape, and the second copy
 * had lost the way out for somebody who is not that account.
 *
 * A code is asked for only where the recipient named the account themselves (D27, D104 bis): an account the funder
 * named needs nothing proved about it, because the funder is the one who would be fooled.
 *
 * What differs between the two shapes is the words and the two routes, and both arrive as props: the register keeps
 * its own voice, and this component knows nothing about either.
 */
export type ConnectWords = Readonly<{
  /** Said when the funder named the account: whose account it is and that nothing is asked of their own. */
  named: string | null;
  /** The line above whatever is asked, from the register: what the gift still needs before it can count. */
  stillNeeds: string;
  /** The field, when the account is not known yet. Absent on a shape whose account is always named at the start. */
  nameField?: Readonly<{ label: string; help: string; typeToContinue: string; noPassword: string; notYet: string }>;
  /** The way out for somebody who is not that account. */
  notMine?: string;
  proveTitle: string;
  proveSteps: string;
  slowToShow?: string;
  /**
   * What is true of connecting itself, said on every way in rather than on one of them: only what comes after
   * connecting counts, and how long they then have. A climb also says what a start already at the target costs,
   * which is the one thing that cannot be undone afterwards.
   */
  connectNow?: string;
  firstReading?: string;
  /** What to do about it, a line of its own: the two were one sentence, too long to stand in the open. */
  firstReadingThen?: string;
  /**
   * The label of the gesture that takes the first reading, and they are not the same gesture in words: where the
   * funder named the account nothing was asked of the person, so it starts; where a code is waiting in their own
   * name, what they did is add it, and the button says that back to them.
   */
  start: string;
  added: string;
  /** The label that asks for a code: "Get my code", and "Get a new code" once one has expired. */
  getCode: string;
  newCode: string;
}>;

export function ConnectTheSource({
  words,
  account,
  funderName,
  busy,
  working,
  refusal,
  validUntil,
  onName,
  onAskCode,
  onStart,
}: Readonly<{
  words: ConnectWords;
  account: Readonly<{ username: string | null; code: string | null; namedByFunder: boolean; codeExpired: boolean }>;
  funderName: string | null;
  /** Which gesture is running, so its own label says so and nothing else moves. */
  busy: "naming" | "starting" | null;
  working: boolean;
  /** The refusal of the gesture that failed, under the element in cause. */
  refusal: Readonly<{ where: "name" | "start"; text: string }> | null;
  /** How long the code lasts, in the reader's own clock. */
  validUntil: string | null;
  /** Naming the account. Absent on a shape whose account is named when the gift is made. */
  onName?: (username: string) => void;
  onAskCode: () => void;
  onStart: () => void;
}>) {
  const [typed, setTyped] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [notMineOpen, setNotMineOpen] = useState(false);
  const [notYetOpen, setNotYetOpen] = useState(false);
  const [copied, setCopied] = useState<"yes" | "refused" | null>(null);
  const refusalAt = (where: "name" | "start") =>
    refusal && refusal.where === where ? <FieldRefusal id={`gift-${where}-refused`}>{refusal.text}</FieldRefusal> : null;
  const naming = onName !== undefined && (account.username === null || renaming);

  // The funder named it: one gesture, and a way out for somebody who is not that account.
  if (account.namedByFunder && account.username && !renaming) {
    return (
      <div className="flex flex-col gap-[var(--space-md)]">
        {words.named ? <p className={BODY}>{words.named}</p> : null}
        {words.connectNow ? <p className="font-medium">{words.connectNow}</p> : null}
        {words.firstReading ? <p className={HELP}>{words.firstReading}</p> : null}
            {words.firstReadingThen ? <p className={HELP}>{words.firstReadingThen}</p> : null}
        <button type="button" onClick={onStart} disabled={working} className={PRIMARY_BUTTON}>
          {busy === "starting" ? W.reading : words.start}
        </button>
        {refusalAt("start")}
        {words.notMine ? (
          <>
            {/* A second pill under the one action, never a link in the text (the founder's rule 1 of 1 Oct 2026). */}
            <button type="button" onClick={() => setNotMineOpen((isOpen) => !isOpen)} aria-expanded={notMineOpen} className={SECONDARY_BUTTON}>
              {words.notMine}
            </button>
            {notMineOpen ? <p className={HELP}>{W.namedWrong(funderName)}</p> : null}
          </>
        ) : null}
      </div>
    );
  }

  if (!naming && account.username) {
    const username = account.username;
    return (
      <div className="flex flex-col gap-[var(--space-md)]">
        <p className="font-medium">{words.proveTitle}</p>
        {/* No code yet, or the one they had ran out: asking for one is the gesture, and it is the same route twice. */}
        {account.code === null || account.codeExpired ? (
          <>
            {account.codeExpired ? <p className={BODY}>{W.expired}</p> : null}
            {words.connectNow ? <p className="font-medium">{words.connectNow}</p> : null}
            {words.firstReading ? <p className={HELP}>{words.firstReading}</p> : null}
            {words.firstReadingThen ? <p className={HELP}>{words.firstReadingThen}</p> : null}
            <button type="button" onClick={onAskCode} disabled={working} className={PRIMARY_BUTTON}>
              {busy === "naming" ? W.checking : account.codeExpired ? words.newCode : words.getCode}
            </button>
            {refusalAt("name")}
          </>
        ) : (
          <>
            <p className={BODY}>{words.proveSteps}</p>
            <p className="text-center text-[length:var(--type-money)] font-semibold tracking-widest tabular-nums">{account.code}</p>
            <button
              type="button"
              onClick={() => {
                const code = account.code;
                if (code === null) return;
                void navigator.clipboard
                  .writeText(code)
                  .then(() => setCopied("yes"))
                  .catch(() => setCopied("refused"));
              }}
              className={SECONDARY_BUTTON}
            >
              {copied === "yes" ? W.copied : W.copyCode}
            </button>
            {copied === "refused" ? <FieldRefusal id="code-copy-refused">{W.copyRefused}</FieldRefusal> : null}
            {validUntil ? <p className={HELP}>{W.validUntil(validUntil)}</p> : null}
            {words.connectNow ? <p className="font-medium">{words.connectNow}</p> : null}
            {words.firstReading ? <p className={HELP}>{words.firstReading}</p> : null}
            {words.firstReadingThen ? <p className={HELP}>{words.firstReadingThen}</p> : null}
            <button type="button" onClick={onStart} disabled={working} className={PRIMARY_BUTTON}>
              {busy === "starting" ? W.reading : words.added}
            </button>
            {refusalAt("start")}
            {words.slowToShow ? <p className={HELP}>{words.slowToShow}</p> : null}
            <p className={HELP}>{W.removeAfter}</p>
          </>
        )}
        {onName && words.notMine ? (
          <button type="button" onClick={() => setRenaming(true)} className={SECONDARY_BUTTON}>
            {words.notMine}
          </button>
        ) : null}
        {/* Whose account it is, said under the code rather than above it: the code is what they came here to use. */}
        <p className={HELP}>{username}</p>
      </div>
    );
  }

  // Nobody has named the account yet, or they are changing a name that was not theirs.
  const field = words.nameField;
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <p className="font-medium">{words.stillNeeds}</p>
      {field ? (
        <>
          <form
            className="flex flex-col gap-[var(--space-md)]"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) onName?.(typed.trim());
            }}
          >
            <div className="flex flex-col gap-[var(--space-xs)]">
              <label htmlFor="source-username" className="font-medium">
                {field.label}
              </label>
              <p id="source-username-help" className={HELP}>
                {field.help}
              </p>
              <input
                id="source-username"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="source-username-help"
                aria-invalid={refusal?.where === "name" ? true : undefined}
                disabled={working}
                className={FIELD}
              />
              {refusal?.where === "name" ? refusalAt("name") : typed.trim() === "" ? <p className={HELP}>{field.typeToContinue}</p> : null}
            </div>
            <button type="submit" disabled={working || typed.trim() === ""} className={PRIMARY_BUTTON}>
              {busy === "naming" ? W.checking : W.continue}
            </button>
          </form>
          <p className={HELP}>{field.noPassword}</p>
          {renaming ? (
            <button type="button" onClick={() => setRenaming(false)} className={SECONDARY_BUTTON}>
              {W.keepMyName}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setNotYetOpen((isOpen) => !isOpen)} aria-expanded={notYetOpen} className={`${SMALL_BUTTON} self-start`}>
                {field.notYet}
              </button>
              {notYetOpen ? <p className={HELP}>{W.notYetBody(funderName)}</p> : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
