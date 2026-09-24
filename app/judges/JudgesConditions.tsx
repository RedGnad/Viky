import Link from "next/link";
import { conditionsWithProof } from "@/src/condition-proof";
import { FAMILIES, stateOf } from "@/src/conditions";
import { realProofCounts } from "@/src/proof-counts";
import { CATALOGUE } from "@/src/sentences";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/**
 * What each condition proves, condition by condition, with the same four questions asked of every one of them (U2).
 * The answers come from the register (src/condition-proof.ts), which is also what the funder reads when choosing, so
 * a judge and a funder are told the same thing in the same words.
 *
 * The fourth question is where the conditions differ most, and the table exists to make that visible rather than to
 * claim that all four are equally hard to cheat.
 */
export async function JudgesConditions() {
  const rows = conditionsWithProof();
  // By the register's four families, as the public page and the chooser draw them (D220).
  const families = FAMILIES.map((family) => ({ ...family, rows: rows.filter(({ condition }) => condition.family === family.id) })).filter((family) => family.rows.length > 0);
  // The count of real proofs per condition (D184): a number read from the rows when the page is served, or nothing.
  const counts = await realProofCounts();
  return (
    <section className="space-y-[var(--space-md)]">
      <h2 className={TITLE}>What each condition proves</h2>
      <p className={HELP}>
        Four questions, asked of every condition, answered in the register the product itself reads. Where something is
        not known, the answer says so: none of these proves who did the activity, and that is written here rather than
        left to be discovered. Where each condition stands, and what no source lets anybody check at all, is the public
        page{" "}
        <Link href="/what-viky-can-check" className="underline">
          {CATALOGUE.title}
        </Link>
        .
      </p>
      {families.map((family) => (
        <div key={family.id} className="space-y-[var(--space-md)]">
          <h3 className="font-semibold">{family.title}</h3>
          {family.rows.map(({ condition, proof }) => (
            <div key={condition.id} className="space-y-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
              <h4 className="font-medium">
                {condition.name}{" "}
                {/* The state is the register's own, in the words the public page prints: "not open yet, so no gift runs on
                    it" stopped being true the day the first real Chess.com gift was funded, on 18 Sep 2026. */}
                <span className={MUTED}>
                  {condition.source}, {stateOf(condition).title.toLowerCase()}, {CATALOGUE.realProofs(counts ? (counts.get(condition.id) ?? 0) : null)}
                </span>
              </h4>
              <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
                <dt className={MUTED}>Does the data come from the source&apos;s own servers?</dt>
                <dd className={HELP}>{proof.data}</dd>
                <dt className={MUTED}>Is the account theirs?</dt>
                <dd className={HELP}>{proof.account}</dd>
                <dt className={MUTED}>Who acted on the account?</dt>
                <dd className={HELP}>{proof.whoActed}</dd>
                <dt className={MUTED}>What does the source do against cheating?</dt>
                <dd className={HELP}>{proof.sourcePolicing}</dd>
              </dl>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
