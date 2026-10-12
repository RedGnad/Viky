import { TOULOUSE_PASSES } from "@/src/judges-first-use";
import { countInWords } from "@/src/university-choice";
import { UniversityPath } from "../kit/UniversityPath";
import { META } from "../components/ui";
import { Fold } from "./Fold";

const HELP = "text-[length:var(--type-help)]";

/**
 * The universities (the founder's mockup of 11 Oct 2026), a fold of their own since 12 Oct 2026: the path of a first
 * gift and the path of every gift after it, the drawing a gift's own card carries (app/kit/UniversityPath.tsx), each
 * over the real pass that ran it; then what is ready on a check of Reclaim's alone, and how many more.
 */
export function JudgesUniversities({ moreUniversities, readyOnReclaim }: Readonly<{ moreUniversities: number | null; readyOnReclaim: readonly string[] }>) {
  return (
    <Fold id="universities" title="Universities: set up once, then paid on sign-in">
      <div className={HELP} data-minute="universities">
        <span className="block">A university is set up once, by its first gift.</span>
        <span className="block">Its first proof is read by hand. Viky then fixes the rule that reads its page, and every later proof is paid on sign-in.</span>
        <div className="judges-paths">
          <div data-toulouse="first">
            <p className={META}>The first gift</p>
            <UniversityPath provider="none" results={false} yours={false} label="The first gift at a university, stop by stop" />
            <p>
              Toulouse, {TOULOUSE_PASSES.first.day}: a real student showed their enrolment, and{" "}
              <a className="underline" href={`https://monadvision.com/tx/${TOULOUSE_PASSES.first.paidTx}`}>
                the gift paid
              </a>{" "}
              once the proof had been read by hand.
            </p>
          </div>
          <div data-toulouse="on-the-fixed-rule">
            <p className={META}>Every gift after</p>
            <UniversityPath provider="seconds" results={false} yours={false} label="Every gift after at that university, stop by stop" />
            <p>
              Toulouse, {TOULOUSE_PASSES.onTheFixedRule.day}: a student showed their enrolment, and{" "}
              <a className="underline" href={`https://monadvision.com/tx/${TOULOUSE_PASSES.onTheFixedRule.paidTx}`}>
                the gift paid
              </a>{" "}
              {TOULOUSE_PASSES.onTheFixedRule.secondsFromSignIn} seconds after they signed in to their university&apos;s portal, with no review.
            </p>
          </div>
        </div>
        {/* Nothing where neither could be read: no empty line is left under the paths. */}
        {readyOnReclaim.length > 0 || (moreUniversities !== null && moreUniversities > 0) ? (
          <p>
            {/* A university ready on Reclaim's own check, from its row as it stands (src/university-ready.ts). */}
            {readyOnReclaim.map((name) => (
              <span key={name} data-ready-on-reclaim="">
                {name}: ready today, on a check approved by Reclaim.{" "}
              </span>
            ))}
            {moreUniversities !== null && moreUniversities > 0 ? <span>{countInWords(moreUniversities)} more: each set up within two days of a first gift.</span> : null}
          </p>
        ) : null}
      </div>
    </Fold>
  );
}
