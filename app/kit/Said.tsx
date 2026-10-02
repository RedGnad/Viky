import { helpLine, OPEN_LINE_MAX } from "@/src/help-line";
import { KIT } from "@/src/sentences";
import { BODY, HELP } from "../components/ui";
import { FoldChevron } from "./GiftLive";

/**
 * What a block says: its first sentence in the open, and the rest folded under a name (the founder's rule 4 of
 * 1 Oct 2026: one line, the rest in a fold; nothing is deleted).
 *
 * The words are the ones the screen had, cut where the first sentence ends and never inside one. A first sentence
 * longer than the line allowed goes down whole, so what stays in the open is always one whole short sentence, or
 * nothing but the fold's name. Under a field the line is 60 characters at most (`under`); elsewhere it is 90.
 */
export function Said({
  text,
  className = BODY,
  fold = KIT.how,
  under = false,
  whole = false,
}: Readonly<{
  text: string;
  /** The voice of the sentence left in the open. */
  className?: string;
  /** The name the rest is folded under: what a person presses to read it. */
  fold?: string;
  /** Whether it stands under a field, where one line is 60 characters at most. */
  under?: boolean;
  /** Folded whole: the line in the open is said by something else on the screen. */
  whole?: boolean;
}>) {
  const { line, rest } = whole ? { line: null, rest: text } : helpLine(text, under ? undefined : OPEN_LINE_MAX);
  return (
    <>
      {line ? <p className={className}>{line}</p> : null}
      {rest ? (
        <details className="said-fold">
          <summary className="said-fold-name">
            {fold}
            <FoldChevron />
          </summary>
          <p className={`${HELP} said-fold-body`}>{rest}</p>
        </details>
      ) : null}
    </>
  );
}
