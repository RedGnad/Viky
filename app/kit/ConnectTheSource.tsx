"use client";
import { useState } from "react";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, FIELD, HELP, MONEY, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";
import { FoldChevron } from "./GiftLive";
import { Step, Steps } from "./Steps";
import { Button } from "./Button";

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
  nameField?: Readonly<{ label: string; help: string; typeToContinue: string; noPassword: string; notYet: string; notYetHow: Readonly<{ says: string; open: string; href: string }> }>;
  /** Under the code, where the person typed the name themselves: the button that opens the name's field again. */
  anotherUsername?: string;
  /** The name of the fold that says what to do when the account the funder named is not theirs. */
  notYours?: string;
  proveTitle: string;
  /** The second of the three steps: where the code goes at the source, in a few words. */
  codeStep: string;
  /** Said after a check that did not see the code, and only then. */
  slowToShow?: string;
  /**
   * What is true of connecting itself, said on every way in rather than on one of them: only what comes after
   * connecting counts, and how long they then have. A climb also says what a start already at the target costs,
   * which is the one thing that cannot be undone afterwards.
   */
  connectNow?: string;
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
  step,
  working,
  refusal,
  onName,
  onAskCode,
  onStart,
}: Readonly<{
  words: ConnectWords;
  account: Readonly<{ username: string | null; code: string | null; namedByFunder: boolean; codeExpired: boolean }>;
  funderName: string | null;
  /** Which gesture is running, so its own label says so and nothing else moves. */
  busy: "naming" | "starting" | null;
  /** The step the running gesture is on, named under its button once the wait is long (app/kit/Waiting.tsx). */
  step?: string | null;
  working: boolean;
  /** The refusal of the gesture that failed, under the element in cause. */
  refusal: Readonly<{ where: "name" | "start"; text: string }> | null;
  /** Naming the account. Absent on a shape whose account is named when the gift is made. */
  onName?: (username: string) => void;
  onAskCode: () => void;
  onStart: () => void;
}>) {
  const [typed, setTyped] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState<"yes" | "refused" | null>(null);
  const refusalAt = (where: "name" | "start") =>
    refusal && refusal.where === where ? <FieldRefusal id={`gift-${where}-refused`}>{refusal.text}</FieldRefusal> : null;
  const naming = onName !== undefined && (account.username === null || renaming);

  // The funder named it: one gesture, and a way out for somebody who is not that account.
  if (account.namedByFunder && account.username && !renaming) {
    return (
      <div className="flex flex-col gap-[var(--space-md)]">
        {words.named ? <p className={BODY}>{words.named}</p> : null}
        {/* One line where there were three: what connecting costs is said once, before the gesture (4 Oct 2026). */}
        {words.connectNow ? <p className={HELP}>{words.connectNow}</p> : null}
        <Button doing={busy === "starting" ? W.reading : null} step={step} waiting={working && busy !== "starting"} onPress={onStart}>
          {words.start}
        </Button>
        {refusalAt("start")}
        {words.notYours ? (
          // A fold, not a button (the founder, 4 Oct 2026): pressing it does nothing but open a sentence, so it is named
          // by a question and drawn as the fold of "Have a code?" is. It was a second pill, "Not my name".
          <details className="said-fold" data-not-your-name="">
            <summary className="said-fold-name">
              {words.notYours}
              <FoldChevron />
            </summary>
            <div className="said-fold-body">
              <p className={HELP}>{W.namedWrong(funderName)}</p>
            </div>
          </details>
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
            {/* The code's validity is said when it runs out, and not before: that is when it serves. */}
            {account.codeExpired ? <p className={BODY}>{W.expired}</p> : null}
            {words.connectNow ? <p className={HELP}>{words.connectNow}</p> : null}
            <Button doing={busy === "naming" ? W.checking : null} step={step} waiting={working && busy !== "naming"} onPress={onAskCode}>
              {account.codeExpired ? words.newCode : words.getCode}
            </Button>
            {refusalAt("name")}
          </>
        ) : (
          <>
            {/* Three short steps, numbered (the founder, 4 Oct 2026): it was a paragraph, a code, and four sentences
                of help said all at once. Each help now comes when it serves: the validity when the code has run out
                (above), "it can take a minute" after a check that did not see the code, and "you can take the code
                out" at the success, where the page says it. */}
            <Steps>
              <Step says={W.steps.copy}>
                <p className={`${MONEY} text-center tracking-widest`}>{account.code}</p>
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
              </Step>
              <Step says={words.codeStep} />
              <Step says={W.steps.back}>
                {words.connectNow ? <p className={HELP}>{words.connectNow}</p> : null}
                <Button doing={busy === "starting" ? W.reading : null} step={step} waiting={working && busy !== "starting"} onPress={onStart}>
                  {words.added}
                </Button>
                {refusalAt("start")}
                {refusal?.where === "start" && words.slowToShow ? <p className={HELP}>{words.slowToShow}</p> : null}
              </Step>
            </Steps>
          </>
        )}
        {onName && words.anotherUsername ? (
          <button type="button" onClick={() => setRenaming(true)} className={SECONDARY_BUTTON}>
            {words.anotherUsername}
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
            <Button submits doing={busy === "naming" ? W.checking : null} step={step} waiting={(working && busy !== "naming") || typed.trim() === ""}>
              {W.continue}
            </Button>
          </form>
          <p className={HELP}>{field.noPassword}</p>
          {renaming ? (
            <button type="button" onClick={() => setRenaming(false)} className={SECONDARY_BUTTON}>
              {W.keepMyName}
            </button>
          ) : (
            // A fold, not a button: pressing it opens a sentence and does nothing else (the founder, 4 Oct 2026).
            <details className="said-fold" data-no-source-yet="">
              <summary className="said-fold-name">
                {field.notYet}
                <FoldChevron />
              </summary>
              {/* The button that opens the source's own site, and one line (the founder, 4 Oct 2026). */}
              <div className="said-fold-body flex flex-col gap-[var(--space-sm)]">
                <a href={field.notYetHow.href} target="_blank" rel="noopener noreferrer" className={`${SMALL_BUTTON} self-start`} data-open-the-source="">
                  {field.notYetHow.open}
                </a>
                <p className={HELP} data-how-to-get-it="">
                  {field.notYetHow.says}
                </p>
              </div>
            </details>
          )}
        </>
      ) : null}
    </div>
  );
}
