import Link from "next/link";
import { conditionsWithProof } from "@/src/condition-proof";
import { CONDITIONS, FAMILIES, stateOf } from "@/src/conditions";
import { TOULOUSE_PASSES } from "@/src/judges-first-use";
import { saidOfAWay, waysOfReading, type WayOfReading } from "@/src/judges-ways";
import { realProofCounts } from "@/src/proof-counts";
import { CATALOGUE } from "@/src/sentences";
import { Fold, Row, Rows } from "./Fold";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const count = (number: number, one: string, many: string) => `${number} ${number === 1 ? one : many}`;

/**
 * One way of reading, as a card: its name, how many lines it holds, what they are, then what was paid with real money
 * and why the rest waits, which src/judges-ways.ts says from the count of real proofs as the page is served.
 */
function Stand({ way, counts }: Readonly<{ way: WayOfReading; counts: ReadonlyMap<string, number> | null }>) {
  const lines = CONDITIONS.filter((condition) => condition.nature === way.nature);
  const said = saidOfAWay(way, lines, counts, { firstDay: TOULOUSE_PASSES.first.day, nextDay: TOULOUSE_PASSES.onTheFixedRule.day, secondsFromSignIn: TOULOUSE_PASSES.onTheFixedRule.secondsFromSignIn });
  return (
    <div className="judges-stand" data-way-of-reading={way.nature}>
      <p className="font-semibold">
        {way.title} <span className="block font-normal text-[var(--muted)]">{count(said.conditions, "condition", "conditions")}</span>
      </p>
      <p className="text-[var(--muted)]">{way.what}</p>
      <p>
        {said.lead ? <strong>{said.lead}</strong> : null} {said.said}
      </p>
    </div>
  );
}

/**
 * What each condition proves (U2), as the founder's preview of 12 Oct 2026 draws it: three cards, one for each way a
 * condition is read (a public page, an account shown, an account connected), each saying what was paid with real
 * money, what was read, and why the rest waits; then one line a condition, which opens on the same four questions
 * asked of every one of them. The answers come from the register (src/condition-proof.ts), which is also what the
 * funder reads when choosing, so a judge and a funder are told the same thing in the same words.
 *
 * The fourth question is where the conditions differ most, and the rows exist to make that visible rather than to
 * claim that all four are equally hard to cheat.
 */
export async function JudgesConditions() {
  const rows = conditionsWithProof();
  // By the register's four families, as the public page and the chooser draw them (D220).
  const families = FAMILIES.map((family) => ({ ...family, rows: rows.filter(({ condition }) => condition.family === family.id) })).filter((family) => family.rows.length > 0);
  // The count of real proofs per condition (D184): a number read from the rows when the page is served, or nothing.
  const counts = await realProofCounts();
  return (
    <Fold id="conditions" title="What each condition proves" space="md">
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
      <div className="space-y-[var(--space-sm)]">
        <p className={HELP}>
          A condition is proven the day the thing happens: a lesson is daily, a race has a date, a university year ends in
          June. Where each one stands today:
        </p>
        <div className="judges-stands">
          {waysOfReading().map((way) => (
            <Stand key={way.nature} way={way} counts={counts} />
          ))}
        </div>
        <p className={MUTED}>Condition by condition, four questions each:</p>
      </div>
      {families.map((family) => (
        <div key={family.id} className="space-y-[var(--space-xs)]">
          <h3 className="font-semibold">{family.title}</h3>
          <Rows>
            {family.rows.map(({ condition, proof }) => (
              <Row
                key={condition.id}
                title={condition.name}
                // The state is the register's own, in the words the public page prints, and a line its source closed
                // says why (12 Oct 2026); then the count of real proofs, read as the page is served.
                meta={
                  <span>
                    {condition.source}, {stateOf(condition).title.toLowerCase()}
                    {condition.state === "closed" && condition.beforeItOpens ? `: ${condition.beforeItOpens.replace(/\.$/, "")}` : ""}, {CATALOGUE.realProofs(counts ? (counts.get(condition.id) ?? 0) : null)}
                  </span>
                }
              >
                {/* What the gift waits for, where the thing to show comes at a set time: a year's results (10 Oct 2026). */}
                {proof.waits ? (
                  <p className={HELP} data-condition-waits="">
                    {proof.waits}
                  </p>
                ) : null}
                <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
                  <dt>Does the data come from the source&apos;s own servers?</dt>
                  <dd>{proof.data}</dd>
                  <dt>Is the account theirs?</dt>
                  <dd>{proof.account}</dd>
                  <dt>Who acted on the account?</dt>
                  <dd>{proof.whoActed}</dd>
                  <dt>What does the source do against cheating?</dt>
                  <dd>{proof.sourcePolicing}</dd>
                </dl>
              </Row>
            ))}
          </Rows>
        </div>
      ))}
    </Fold>
  );
}
