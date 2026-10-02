import type { IndexRead } from "@/src/envio-index";
import { ARRIVAL } from "@/src/measured";
import { consentAnchorAddress } from "@/src/v2";
import { CopyLine } from "../kit/CopyLine";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";

const seconds = (value: number) => `${value.toFixed(1)} s`;

/**
 * For the judges of Mera's bounties (the founder, 2 Oct 2026): how many gestures and how many seconds separate a
 * person who receives a gift's link from their first transaction, as the capture tool measured them, and what the
 * second key their passkey makes does, where it is tied to their account on Monad, and the command that checks it.
 *
 * What the anchor is not is said with it (the review of 2 Oct 2026, R-07): a public record written after the fact,
 * never what a reading is decided on.
 */
export function JudgesMera({ index }: Readonly<{ index: IndexRead | null }>) {
  const anchor = consentAnchorAddress();
  const { linkShown, accountMade, giftOpened } = ARRIVAL.seconds;
  return (
    <section className="space-y-[var(--space-sm)]" id="mera">
      <h2 className={TITLE}>Mera: from a link to a first transaction, and one passkey with two keys</h2>
      <h3 className="font-medium">From the link to the first transaction</h3>
      <p className={HELP} data-arrival="gestures">
        A person receives a gift&apos;s link and has no account. {ARRIVAL.gestures.length} gestures take them to their first
        transaction, the opening of the gift: {ARRIVAL.gestures.map((gesture, position) => `${position + 1}. ${gesture}`).join(". ")}. No
        field to fill, no password, no code to copy and nothing to install; they hold no MON, the relayer sends the opening
        for them. On the second version of the contracts the opening is signed in the browser by the key the link carries,
        with no gesture more.
      </p>
      <p className={HELP} data-arrival="seconds">
        Counted and timed on {ARRIVAL.measuredOn} by the capture tool (<code>test/browser/arrival-measure.spec.ts</code>), at 390 by
        844, {ARRIVAL.runs.length} runs: {ARRIVAL.runs.map(seconds).join(", ")} in all. The slowest, moment by moment:{" "}
        {seconds(linkShown)} for the link to show the gift, {seconds(accountMade - linkShown)} from the first press to the
        account made, {seconds(giftOpened - accountMade)} from the second press to the gift opened.
        What those seconds are, exactly: the screens of a production build served on the measuring machine, with a virtual
        passkey that answers at once and the gift&apos;s answers stood in. So neither a person&apos;s own time nor Monad&apos;s is
        in them: on Monad the opening is one relayed transaction, final one or two blocks after the block that carries it (the
        AUSD section above). Not measured: a real phone on a real network.
      </p>
      <h3 className="font-medium">One passkey, two keys</h3>
      <p className={HELP}>
        One prompt asks the passkey&apos;s PRF for two salts. The first makes the account&apos;s key, which signs everything
        that moves money. The second, sha256(&quot;viky:consent:v1&quot;), makes an Ed25519 key that signs the recipient&apos;s
        yes to what a gift reads of them, and their stop, and nothing else: it cannot move money, and the six gestures at the
        head of this page show it is the same on every device that holds the passkey.
      </p>
      {anchor ? (
        <>
          <p className={HELP}>
            Where that key is tied to the account on Monad: the anchor of agreements,{" "}
            <a className="underline [overflow-wrap:anywhere]" href={`https://monadvision.com/address/${anchor}`}>
              {anchor}
            </a>
            . The account itself signs the tie, once (EIP-712 <code>ConsentKey</code>), and the contract keeps the first one
            for ever: nobody else can name a key for an account, and nobody can replace one (event <code>ConsentKeyBound</code>).
            Each yes and each stop is then written there in order, with the key&apos;s signature and the digest of the text
            signed (event <code>ConsentAnchored</code>).{" "}
            <span data-anchor-count>
              {index
                ? `As this page is served the index counts ${index.totals.consentKeysBound} ${index.totals.consentKeysBound === 1 ? "key" : "keys"} bound, ${index.totals.yesAnchored} yes and ${index.totals.stopsAnchored} ${index.totals.stopsAnchored === 1 ? "stop" : "stops"} written down.`
                : "How many are written there could not be read from the index just now."}
            </span>
          </p>
          <p className={HELP}>
            What the anchor is, and what it is not. It is a public record, written after the fact by Viky&apos;s relayer, the
            one account allowed to write entries. It is not what a reading is decided on: that is still the signed row in
            Viky&apos;s database, which applies at once, a stop above all. An entry that could not be written is tried again
            each time the gift is asked whether it may be read, a yes and a stop alike; a yes or a stop signed while the
            anchor could not be read carries no signature for it and is never written there. So the anchor does not prevent a
            reading without a yes: it lets anybody see one. The command reads, for every gift of the second version, the key
            the account bound and every yes and stop anchored, checks each Ed25519 signature itself, and checks that every
            reading that moved money came after a yes and before any stop:
          </p>
          <CopyLine command="pnpm verify:consent" />
        </>
      ) : (
        <p className={HELP}>
          Where that key is tied to the account: on this deployment, in Viky&apos;s database alone. The anchor of agreements,
          which writes the tie and every yes and stop on Monad, is not set here.
        </p>
      )}
    </section>
  );
}
