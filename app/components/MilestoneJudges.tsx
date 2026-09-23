import { CHESS_MODES, chessGoalType, chessProviderId } from "@/src/chess-com";
import { MILESTONE_EVIDENCE as E } from "@/src/milestone-evidence";
import { PUBLIC_RPC_URL } from "@/src/monad/chain";
import { PINNED_RECLAIM_WITNESS } from "@/src/reclaim-proof-set";
import { TITLE } from "./ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";
const CODE = "block [overflow-wrap:anywhere] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--surface)] p-[var(--space-sm)] text-[length:var(--type-help)]";

function Explorer({ tx }: Readonly<{ tx: string }>) {
  return (
    <a className="underline [overflow-wrap:anywhere]" href={`https://monadvision.com/tx/${tx}`}>
      {tx}
    </a>
  );
}

/**
 * The milestone contract on the judges page (C2): where it is, one call anybody can make, one refusal anybody can
 * reproduce, and what is not proven, written as it is. Only facts recorded in src/milestone-evidence.ts are printed.
 */
export function MilestoneJudges() {
  const address = process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS?.trim();
  if (!address) return null;
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className={TITLE}>A milestone: a Chess.com rating</h2>
      <p className={HELP}>
        MilestoneGift holds a gift for one thing rather than a habit: the whole amount becomes the recipient&apos;s the first time an
        attested reading shows the rating reached, or all of it goes back when the time runs out. Contract{" "}
        <a className="underline [overflow-wrap:anywhere]" href={`https://monadvision.com/address/${address}`}>
          {address}
        </a>
        {E.sourcifyMatch ? `, source verified through Sourcify (match ${E.sourcifyMatch})` : ""}
        {E.deployTx ? (
          <>
            , deployed in <Explorer tx={E.deployTx} />
          </>
        ) : null}
        . Owned by the same Safe as the other three contracts, two signatures of three, read from the chain at the head of this page
        and in the contracts section, and never by the key that deployed it. Gift numbers start at 1,000,000, so no number can mean a daily gift
        and a milestone gift at once.
      </p>
      <p className={HELP}>
        The rule it rests on (DECISIONS.md D44): the funder signs the target and the highest start they pay a climb from; the first reading
        is recorded as the start whatever it says, so a recipient cannot retry until a reading suits them, and a start above what the funder
        accepted can never pay. Each cadence is its own goal with its own provider id, so a blitz rating can never settle a rapid gift:
      </p>
      <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
        {CHESS_MODES.map((mode) => (
          <li key={mode} className="[overflow-wrap:anywhere]">
            goal {chessGoalType(mode)}, {mode}: {chessProviderId(mode)}
          </li>
        ))}
      </ul>
      <p className={HELP}>
        How a reading is made: two attested reads through Reclaim zkFetch and Reclaim&apos;s TEE client, api.chess.com/pub/player/&lt;name&gt; for
        the player id (the identity a gift is bound to, which survives a change of name) and /stats for the cadence&apos;s rating. Viky verifies
        the attestor&apos;s signature, pins its address, and checks each proof is about exactly that page and exactly those patterns; the
        evidence signer then signs an EIP-712 Proof under the domain &quot;Viky Milestone&quot;, and the contract accepts or refuses it. The first
        reading also reads the profile&apos;s name, where the recipient puts a one-hour code to prove the account is theirs.
      </p>
      {E.giftId ? (
        <>
          <p className={HELP}>
            The first real milestone gift is gift {E.giftId}.
            {E.createTx ? (
              <>
                {" "}
                Funded in <Explorer tx={E.createTx} />.
              </>
            ) : null}
            {E.claimTx ? (
              <>
                {" "}
                Opened in <Explorer tx={E.claimTx} />.
              </>
            ) : null}
            {E.startTx ? (
              <>
                {" "}
                Started by its first attested reading in <Explorer tx={E.startTx} />.
              </>
            ) : null}{" "}
            Its state, as anyone can read it:
          </p>
          <code className={CODE}>{`cast call ${address} "getGift(uint256)" ${E.giftId} --rpc-url ${PUBLIC_RPC_URL}`}</code>
        </>
      ) : null}
      {E.refusal ? (
        <>
          <p className={HELP}>
            A refusal anyone can reproduce: the contract answers {E.refusal.error} ({E.refusal.selector}).
          </p>
          <code className={CODE}>{E.refusal.command}</code>
        </>
      ) : null}
      <p className={HELP}>What the owner can do, and what it cannot, read from the contract:</p>
      <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
        <li>Pause and reopen new gifts, and pause and reopen readings. While readings are paused nothing can be taken back, and every window a pause ran across (the grace after a deadline, the wait for a first reading) counts again from the moment readings reopen.</li>
        <li>Replace the evidence signer, and register a goal or change the provider id its readings must carry, which applies to gifts already made on that goal.</li>
        <li>Hand the ownership over, or renounce it; renounced while readings are paused, the gifts under way could never settle.</li>
        <li>
          Move money: no. No function lets the owner send AUSD anywhere. Money leaves only to a gift&apos;s recipient, from what was earned and at
          their signed request, or to the refund address the funder signed, from what was not earned. The terms a funder signed cannot be changed.
        </li>
        <li>
          What that does not cover: the evidence signer attests who opened a gift and what a reading said, so whoever holds its key, which the
          owner can replace, could open a gift nobody has opened yet and attest a reading for it.
        </li>
      </ul>
      <p className={HELP}>What was hardened against cheating, with the source read and the day it was read:</p>
      <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
        <li>
          18 Sep 2026, Chess.com&apos;s published data API and its Fair Play policy: an account Chess.com has closed can neither be connected to
          a gift nor reach a target, and the whole amount goes back to the funder at the deadline, exactly as for a target not reached. The
          standing is on the same public profile, in the documented field &quot;status&quot; (closed, closed:fair_play_violations, basic, premium,
          mod, staff), and the policy says Chess.com &quot;may close your account and label it publicly closed for Fair Play violations&quot;. It is
          read on every reading, plain and attested. Measured that day: hikaru premium, erik staff, SevyB basic, dubov closed. A profile whose
          status cannot be read is a reading that failed on our side: nothing is paid and nothing is taken back that day.
        </li>
      </ul>
      <p className={HELP}>
        Whom a settlement trusts, exactly: each reading is a claim signed by Reclaim&apos;s attestor ({PINNED_RECLAIM_WITNESS}), whose TEE mode
        Reclaim labels beta, and Viky&apos;s own evidence signer then signs it as an EIP-712 Proof the contract accepts. We trust those two keys,
        and we say so: Reclaim writes that a third party must trust that the attestor did not collude with the user.
      </p>
      <p className={HELP}>What is not proven, written as it is:</p>
      <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
        <li>The attestor&apos;s own TEE attestation is not in the proof zk-fetch returns, so it is not verified; its signature and address are.</li>
        <li>The evidence signer is a key Viky holds. The contract trusts its signature, and anyone holding that key could sign a reading.</li>
        <li>
          The contract judges when a reading was taken, not when the rated game was played. Viky reads twice a day, and the recipient can ask
          for a reading at any time; a rating reached and then lost again between two readings, or reached in the last hours and first read
          after the deadline, does not pay (DECISIONS.md D48).
        </li>
        <li>
          Below the target, a day&apos;s reading is a plain read of the public page and carries no proof, because the contract refuses a reading
          short of the target and records nothing. Only a reading at or past the target is attested and sent.
        </li>
        <li>Where the person stood when the funder chose is a plain read too: it sets what the funder signs, with their own eyes, and moves nothing.</li>
        <li>
          A gift whose target was already reached when the recipient connected pays nothing: the first reading is the start, a start at or
          past the target can never settle, and the whole amount goes back at the deadline. The screens say so before and after; nobody else
          keeps any of it.
        </li>
        <li>
          The climb is measured from the rating on the day the funder paid, read again just before the money moves. A rating that happened to
          be low that day, after a bad session, makes the climb easier than it looks, and nothing here corrects for that.
        </li>
        <li>Chess.com publishes no rule for what its name field accepts; the code is six letters so that any name field takes it.</li>
      </ul>
    </section>
  );
}
