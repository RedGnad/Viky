import { contractFacts } from "@/src/judges-chain";
import { giftEscrowV2Address } from "@/src/v2";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";
const CODE = "block [overflow-wrap:anywhere] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-sm)] text-[length:var(--type-help)]";

/**
 * The contracts, read from the chain while this page is being served (U2, S5): who owns each one, what it is pausing
 * right now, one call anybody can repeat, and one refusal in the contract's own words.
 *
 * Nothing is copied from the repository: if the owner changed an hour ago, this page says so an hour later, and if the
 * chain cannot be read, it says that instead of showing an old answer.
 *
 * What the owner can do is said per version (the reviews of 1 and 2 Oct 2026): the second version bounds its owner
 * where the first did not, and one list for both said of each what is true of the other only.
 */
export async function JudgesContracts() {
  let facts;
  try {
    facts = await contractFacts();
  } catch (error) {
    return (
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>The contracts, as the chain answers now</h2>
        <p className={HELP}>
          The chain could not be read just now ({error instanceof Error ? error.message.split("\n")[0] : "no answer"}), so
          nothing is shown here rather than something out of date.
        </p>
      </section>
    );
  }
  if (facts.length === 0) return null;
  const secondVersion = giftEscrowV2Address() !== null;
  return (
    <section className="space-y-[var(--space-md)]">
      <h2 className={TITLE}>The contracts, as the chain answers now</h2>
      <p className={HELP}>
        Read while this page was served, never copied from the repository. Every command below is one you can run with
        the same public endpoint, and the refusal is a real one: asking for a gift number nobody has created.
      </p>
      {facts.map((contract) => (
        <div key={contract.address} className="space-y-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
          <h3 className="font-medium">{contract.label}</h3>
          <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[10rem_1fr]">
            <dt className={MUTED}>Where</dt>
            <dd className="[overflow-wrap:anywhere] text-[length:var(--type-help)]">
              <a className="underline" href={`https://monadvision.com/address/${contract.address}`}>
                {contract.address}
              </a>
            </dd>
            <dt className={MUTED}>Owner, right now</dt>
            <dd className="[overflow-wrap:anywhere] text-[length:var(--type-help)]">{contract.owner ?? "could not be read just now"}</dd>
            {contract.pauses.map((pause) => (
              <div key={pause.what} className="contents">
                <dt className={MUTED}>Paused: {pause.what}</dt>
                <dd className={HELP}>{pause.paused ? "yes, paused" : "no, running"}</dd>
              </div>
            ))}
            {contract.keys.map((key) => (
              <div key={key.what} className="contents">
                <dt className={MUTED}>{key.what}</dt>
                <dd className="[overflow-wrap:anywhere] text-[length:var(--type-help)]">{key.address}</dd>
              </div>
            ))}
          </dl>
          <p className={MUTED}>A call you can repeat, and what it answered:</p>
          <code className={CODE}>{contract.call.command}</code>
          <p className={MUTED}>{contract.call.answer}</p>
          {contract.refusal ? (
            <>
              <p className={MUTED}>A refusal you can repeat, in the contract&apos;s own words ({contract.refusal.error}):</p>
              <code className={CODE}>{contract.refusal.command}</code>
            </>
          ) : contract.holdsGifts ? (
            <p className={MUTED}>No refusal could be shown just now.</p>
          ) : null}
          {contract.unread ? <p className={MUTED}>Could not be read: {contract.unread}.</p> : null}
        </div>
      ))}
      {secondVersion ? (
        <>
          <p className={HELP}>What the owner of a second-version gift contract can do, read from the contract:</p>
          <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
            <li>Pause and reopen new gifts.</li>
            <li>
              Pause readings, which pauses openings too. A pause ends by itself after seven days, and cannot be sent again
              while it runs nor for seven days after it ended. On the daily contract it holds every open day: no day is
              settled as missed from the start of a pause until one catch-up window, 30 hours, after its end. On the
              milestone contract a window that was open when the pause began keeps afterwards the time it had left, seven
              days at most, and a climb whose deadline fell inside the pause is judged on a reading taken until the pause
              ended. So a pause sent across a climb&apos;s deadline gives that climb up to seven days more than its funder
              signed: the owner can lengthen a climb that way, never shorten one.
            </li>
            <li>
              Announce a new key for the readings, which stands 24 hours later and not before: the key announced is read
              above the day it is announced. Add a goal; a goal once added is never changed.
            </li>
            <li>Hand ownership over, in two steps: the new owner must accept it. Giving ownership up is refused by the contract.</li>
          </ul>
          <p className={HELP}>
            What the owner of a first-version contract can do. No gift is made on them any more: their owner closed new
            gifts on the three on 2 Oct 2026, and the contract would let that owner reopen them.
          </p>
          <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
            <li>
              Pause and reopen readings, for as long as it likes. On the milestone contract nothing can be taken back
              while readings are paused. On the daily contracts a pause stops check-ins only: once a day&apos;s catch-up
              window has passed, the contract lets anybody send that day back to the funder, pause or not.
            </li>
            <li>Replace the key whose signature the contract accepts for a reading, at once, and register or change what a goal reads.</li>
            <li>Hand ownership over, or renounce it. Renounced while readings are paused, the gifts under way could never settle.</li>
          </ul>
          <p className={HELP}>On every one of them, both versions:</p>
        </>
      ) : (
        <p className={HELP}>What the owner of a gift contract can do, and what it cannot:</p>
      )}
      <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
        {secondVersion ? null : (
          <>
            <li>
              Pause and reopen new gifts, and pause and reopen readings. On the milestone contract nothing can be taken
              back while readings are paused. On the daily contract a pause stops check-ins only: once a day&apos;s
              catch-up window has passed, the contract lets anybody send that day back to the funder.
            </li>
            <li>Replace the key whose signature the contract accepts for a reading, and register or change what a goal reads.</li>
            <li>Hand ownership over, or renounce it. Renounced while readings are paused, the gifts under way could never settle.</li>
          </>
        )}
        <li>
          Move money: no. No function lets the owner send anything anywhere. What was earned leaves only to the person
          the gift is for, at their own signed request, and what was not earned goes back to the funder&apos;s own
          address, which they signed when they made the gift. The terms of a gift cannot be changed after it is made.
        </li>
        <li>
          What that does not cover, and it is the sharpest thing on this page: a reading counts because our key signed
          it. Whoever holds that key, and the owner can replace it, could sign a reading that no source ever answered.
          The published journal is what makes that detectable, because a signed reading with no attestor claim behind it
          cannot be re-verified by anybody.
        </li>
      </ul>
    </section>
  );
}
