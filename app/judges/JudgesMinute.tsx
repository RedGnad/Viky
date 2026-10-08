import { operatorAccounts } from "@/src/dev-access";
import type { IndexRead } from "@/src/envio-index";
import { formatAusd } from "@/src/gift-reader";
import { BLOCK_TIME, creditedDayMon, dollarsOf, FINALITY_GAP, monWords, RELAYER_FEES } from "@/src/measured";
import { PUBLIC_RPC_URL } from "@/src/monad/chain";
import { founderAccounts, usageOf } from "@/src/pilot-accounts";
import { countInWords } from "@/src/university-choice";
import { CopyLine } from "../kit/CopyLine";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const count = (number: number, one: string, many: string) => `${number} ${number === 1 ? one : many}`;

function Address({ address }: Readonly<{ address: string }>) {
  return (
    <a className="underline [overflow-wrap:anywhere]" href={`https://monadvision.com/address/${address}`}>
      {address}
    </a>
  );
}

/**
 * The judges page in one minute (the audit of 1 Oct 2026, D-11; the founder, 2 Oct 2026): what Viky is, who it is
 * for, who has used it in one line, where it runs, why Monad in three lines, and one command. Everything here is said
 * again, at length and with its source, in a section below; this block adds no claim of its own.
 *
 * The universities are three lines: the one a student has shown from, with the gift it paid (its transactions are in
 * the README), how many more are listed, counted from the list as the page is served, and what happens to a first
 * proof. What a first proof meets exactly, held and read or paid on a rule fixed ahead, is said under "Providers read
 * through a witness".
 *
 * The figures of use are counted from the index as the page is served, the same count as "Who has used Viky"; when
 * the index does not answer the line says so and gives no figure. The figures of "Why Monad" are the measured ones
 * (src/measured.ts), each with its date in the section that states it in full.
 */
export function JudgesMinute({
  index,
  contracts,
  moreUniversities,
}: Readonly<{
  index: IndexRead | null;
  contracts: Readonly<{ daily: string | null; milestone: string | null; anchor: string | null; version: 1 | 2 | 3 }>;
  /** How many universities are listed beyond the ones a student can show from today, or nothing when not counted. */
  moreUniversities: number | null;
}>) {
  const usage = index ? usageOf(index.gifts, founderAccounts(operatorAccounts())) : null;
  return (
    <section className="space-y-[var(--space-sm)]" id="minute">
      <h2 className={TITLE}>In one minute</h2>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[10rem_1fr]">
        <dt className={MUTED}>What it is</dt>
        <dd className={HELP}>
          A conditional gift on Monad. Someone puts money behind another person&apos;s goal: it is allocated in that
          person&apos;s name from the first day, becomes theirs as a source that is not Viky says the thing was done, and
          what is not earned goes back to the funder by itself. Nobody profits from a missed day.
        </dd>
        <dt className={MUTED}>Who it is for</dt>
        <dd className={HELP}>
          The person who pays for somebody else&apos;s effort from a distance and cannot check it themselves: a parent
          paying for a year of studies in another city or another country, a relative backing a language, a certificate, a
          race.
        </dd>
        <dt className={MUTED}>Who has used it</dt>
        <dd className={HELP} data-minute="use">
          {usage ? (
            <>
              {count(usage.gifts, "gift", "gifts")} made, {formatAusd(usage.funded)} put into them: funded by{" "}
              {count(usage.funders.all, "account", "accounts")} and opened by {usage.recipients.all}, of which{" "}
              {usage.funders.all - usage.funders.founders} and {usage.recipients.all - usage.recipients.founders} are not the
              founder&apos;s own test accounts. {formatAusd(usage.earned)} earned, {formatAusd(usage.sentBack)} gone back. Counted
              from the index as this page is served:{" "}
            </>
          ) : (
            "The index of the contracts' events could not be read just now, so no count is given here: "
          )}
          <a className="underline" href="#who">
            who has used Viky
          </a>
          .
        </dd>
        {/* The universities in lines (the UI pass of 8 Oct 2026): what has run, how many more, and what happens to a
            first proof. A university ready on a check of Reclaim's alone gets its line when that check passes. */}
        <dt className={MUTED}>Universities</dt>
        <dd className={HELP} data-minute="universities">
          <span className="block">Toulouse: a real student showed their enrolment, and the gift paid.</span>
          {moreUniversities !== null && moreUniversities > 0 ? <span className="block">{countInWords(moreUniversities)} more: each set up within two days of a first gift.</span> : null}
          <span className="block">A first proof that fits a rule set ahead for its university is paid at once.</span>
          <span className="block">Any other first proof is reviewed by hand, within the hour.</span>
        </dd>
        <dt className={MUTED}>Where it runs</dt>
        <dd className={HELP} data-minute="addresses">
          Monad mainnet.{" "}
          {contracts.daily ? (
            <>
              A habit, day by day: <Address address={contracts.daily} />.{" "}
            </>
          ) : null}
          {contracts.milestone ? (
            <>
              One thing reached: <Address address={contracts.milestone} />.{" "}
            </>
          ) : null}
          {contracts.anchor ? (
            <>
              The recipient&apos;s yes and stop: <Address address={contracts.anchor} />.{" "}
            </>
          ) : null}
          {contracts.version === 3
            ? "A gift is made on these today: the daily one is the third version of its contract, the two others the second; the earlier contracts are under "
            : contracts.version === 2
              ? "These are the second version, where a gift is made today; the first version's contracts are under "
              : "The other contracts are under "}
          <a className="underline" href="#network">
            Network
          </a>
          .
        </dd>
        <dt className={MUTED}>Why Monad</dt>
        <dd className={HELP} data-minute="monad">
          <span className="block">
            Neither person holds MON or reads a fee: Viky&apos;s relayer pays every step, {monWords(creditedDayMon())} for a
            credited day, about {dollarsOf(creditedDayMon())} ({RELAYER_FEES.readAt}).
          </span>
          <span className="block">
            A step is final {FINALITY_GAP.fewestBlocks} or {FINALITY_GAP.mostBlocks} blocks after its own, at a block every{" "}
            {BLOCK_TIME.seconds} s (measured {BLOCK_TIME.readOn}).
          </span>
          <span className="block">
            One signature funds a gift: AUSD is on Monad with EIP-3009, so the funder&apos;s signature is both the payment
            and the acceptance of the gift&apos;s exact terms.
          </span>
          <span className="block">
            In full, with what a gift costs:{" "}
            <a className="underline" href="#agora">
              AUSD, Agora&apos;s dollar
            </a>
            .
          </span>
        </dd>
        <dt className={MUTED}>One command</dt>
        <dd className={HELP} data-minute="command">
          {contracts.daily ? (
            <>
              <CopyLine command={`cast call ${contracts.daily} "owner()(address)" --rpc-url ${PUBLIC_RPC_URL}`} />
              <span className="mt-[var(--space-xs)] block">
                It asks the gift contract who owns it, with no account and no key, and answers the Safe that owns every
                contract here. To check a credited day against its source:{" "}
              </span>
            </>
          ) : (
            "No gift contract is set on this deployment, so there is no call to show. To check a credited day against its source: "
          )}
          <a className="underline" href="#verify">
            verify a credited day yourself
          </a>
          .
        </dd>
      </dl>
    </section>
  );
}
