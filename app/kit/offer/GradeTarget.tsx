"use client";
import type { GiftDraft } from "@/src/gift-draft";
import { GRADE_SCALE as W } from "@/src/sentences";
import { gradeScaleInWords, gradeTargetProblem, LETTER_GRADES, letterRank, SCALE_CHOICES, scaleOfKey } from "@/src/university-shown";
import { CHIP, HELP } from "../../components/ui";
import { Field } from "../Field";

/** Where a target starts on each scale the funder can choose: a passing grade, and B in letters. */
const SUGGESTED: Readonly<Record<string, string>> = { "20": "12", "4": "3", "100": "60", letters: String(letterRank("B")) };

/**
 * "Reached a grade" once the university is chosen (the founder, 28 Sep 2026): the grade is typed on a scale. The
 * university's own when its first results page has been reviewed, said in one line; before, the funder chooses it
 * among four, and the first results page shown confirms it or refuses the gift. A letter is chosen, a number typed.
 */
export function GradeTarget({
  draft,
  label,
  help,
  refusal,
  onChange,
}: Readonly<{ draft: GiftDraft; label: string; help: string; refusal: string; onChange: (draft: GiftDraft) => void }>) {
  const scale = scaleOfKey(draft.scale);
  const target = Number(draft.target);
  const onScale = scale !== undefined && draft.target.trim().length > 0 && gradeTargetProblem(scale, target) === undefined;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      {draft.scaleFixed && scale ? (
        <p className={HELP}>{W.fixed(gradeScaleInWords(scale))}</p>
      ) : (
        <>
          <p className="font-medium">{W.question}</p>
          <div className="flex flex-wrap gap-[var(--space-sm)]">
            {SCALE_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={draft.scale === choice}
                onClick={() => onChange({ ...draft, scale: choice, scaleFixed: false, target: SUGGESTED[choice] })}
                className={`${CHIP} ${draft.scale === choice ? "bg-[var(--chosen)] font-bold" : ""}`}
              >
                {W.choices[choice]}
              </button>
            ))}
          </div>
          <p className={HELP}>{W.help}</p>
        </>
      )}
      {scale?.kind === "letters" ? (
        <>
          <p className="font-medium">{W.letter}</p>
          <div className="flex flex-wrap gap-[var(--space-sm)]">
            {LETTER_GRADES.filter((letter) => letter !== "F").map((letter) => {
              const rank = String(letterRank(letter));
              return (
                <button
                  key={letter}
                  type="button"
                  aria-pressed={draft.target === rank}
                  onClick={() => onChange({ ...draft, target: rank })}
                  className={`${CHIP} ${draft.target === rank ? "bg-[var(--chosen)] font-bold" : ""}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          <p className={HELP}>{W.letterHelp}</p>
        </>
      ) : scale ? (
        <Field
          id="grade-target"
          label={label}
          help={help}
          value={draft.target}
          onChange={(value) => onChange({ ...draft, target: value })}
          refusal={draft.target.trim().length === 0 || onScale ? undefined : refusal}
          inputMode="decimal"
        />
      ) : null}
    </div>
  );
}
