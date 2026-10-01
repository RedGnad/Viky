import { operatorAccounts } from "@/src/dev-access";
import { exampleForJudges } from "@/src/proof-journal";
import { JUDGES as J } from "@/src/sentences";
import { CopyLine } from "../kit/CopyLine";
import { TITLE } from "../components/ui";
import { dateOfDay } from "@/src/day-record";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/**
 * Verify it yourself (U2, point 2): one credited day anybody can re-verify, in one command, with nothing from us taken
 * on trust.
 *
 * The example is always one of Viky's own gifts. Its account holder agreed on 18 Sep 2026 that this one proof may be
 * public, which matters because a Duolingo proof carries the account's name, its display name and its points. Nobody
 * else's proof is ever published: the two people a gift is between can download their own from the gift's page, and
 * everybody else sees the journal, which says what settled and against which claim, and names nobody.
 */
export async function JudgesVerify() {
  const accounts = [...operatorAccounts()];
  // The one reading of the database on this page that was not guarded (the audit of 1 Oct 2026): a database that does
  // not answer leaves the page without its example, never without the page.
  const example = accounts.length === 0 ? null : await exampleForJudges(accounts).catch(() => null);
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className={TITLE}>Verify a credited day yourself</h2>
      {/* The founder's note, written as dictated (18 Sep 2026). It says what is true today and promises nothing about
          where the key is held: an enclave was costed on 18 Sep and set aside, and no sentence here implies one. */}
      <p className="font-medium">{J.ourKey}</p>
      <p className={HELP}>{J.andSo}</p>
      <p className={HELP}>
        Every settled day of every gift is published: what happened, the transaction that settled it, and the
        fingerprint of the claim it was settled against, at <code>/api/gift/&lt;number&gt;/journal</code>. That fingerprint
        is the one the contract keeps so the same claim can never be used twice, so anybody can ask the chain whether it
        accepted exactly that claim. The proof itself is never published: it carries the account&apos;s own name and its
        points, and Privacy promises the public sees only a pseudonym.
      </p>
      {example ? (
        <>
          <p className={HELP}>
            One example is public in full, from a gift of Viky&apos;s own, published with the account holder&apos;s
            agreement: gift {example.giftId}, the day of {dateOfDay(example.day)}. Take it and check it, from a clone
            of this repository, with no key and no account:
          </p>
          <CopyLine
            label={J.fromNothing}
            command={"git clone https://github.com/RedGnad/Viky.git\ncd Viky\npnpm install\npnpm verify:day"}
          />
          <p className={MUTED}>
            It reads {`/api/judges/example`} from this site, recomputes the claim&apos;s identifier from the signed
            claim, recovers the attestor that signed it, recomputes the fingerprint{" "}
            <span className="[overflow-wrap:anywhere]">{example.fingerprint}</span>, asks the gift contract whether that
            fingerprint is recorded, and reads transaction{" "}
            <a className="underline [overflow-wrap:anywhere]" href={`https://monadvision.com/tx/${example.txHash}`}>
              {example.txHash}
            </a>{" "}
            back to see it credit that day. Each answer is printed with what it was compared against.
          </p>
        </>
      ) : (
        <p className={HELP}>
          No example is published at the moment: it is only ever taken from a credited day of Viky&apos;s own gifts whose
          proof is still kept, and there is none right now. The command below works on any proof its owner downloads, and
          this page will carry an example again as soon as one exists. Nothing here is a stand-in for it.
        </p>
      )}
      <p className={HELP}>
        The two people a gift is between can do the same with their own day: the gift&apos;s page offers &quot;Check this
        day yourself&quot;, which hands over the proof of that day, and then:
      </p>
      <CopyLine command="pnpm verify:day --file day.json --gift <number> --day <day>" />
      <p className={HELP}>
        A milestone gift settles on a reading rather than on a day, so its journal lists readings, its page offers
        &quot;Check this reading yourself&quot;, and the same command takes{" "}
        <code>--reading &lt;number&gt;</code> instead of <code>--day</code>. It asks the milestone contract the same
        question: is this claim&apos;s fingerprint the one it recorded?
      </p>
      <p className={HELP}>
        What a pass proves: Duolingo&apos;s own servers answered that, and the contract credited that day against that one
        answer, which can never be replayed. What it does not prove: that the account belongs to the person the gift is
        for, or that a human rather than a script did the lesson. The account is tied to the person once, separately, by
        a code placed in its display name or by the funder naming it, and a session proof says nothing about whose hands
        were on the phone. Reclaim writes the same thing about its attestor: a third party must trust that it did not
        collude with the user.
      </p>
    </section>
  );
}
