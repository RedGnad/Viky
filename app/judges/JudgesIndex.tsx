import { followsThirdDailyContract, heldPerContract, type IndexRead } from "@/src/envio-index";
import { formatAusd, formatAusdExact } from "@/src/gift-reader";
import { INDEX_PLAN } from "@/src/index-kept";
import { momentInWords } from "@/src/judges-first-use";
import { AUSD_ADDRESS, createMonadPublicClient } from "@/src/monad/chain";
import { dateInWords } from "@/src/moments";
import { giftEscrowV3Address } from "@/src/v2";
import { Fold, Row, Rows } from "./Fold";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const BALANCE_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

/** What the chain itself says, beside the index: its head, and what each indexed contract holds. Nothing when it cannot be read. */
async function chainBeside(index: IndexRead): Promise<{ head: number; balances: ReadonlyMap<string, bigint> } | null> {
  try {
    const client = createMonadPublicClient();
    const contracts = [...heldPerContract(index.gifts).keys()];
    const [head, ...balances] = await Promise.all([
      client.getBlockNumber(),
      ...contracts.map((contract) => client.readContract({ address: AUSD_ADDRESS, abi: BALANCE_ABI, functionName: "balanceOf", args: [contract as `0x${string}`] })),
    ]);
    return { head: Number(head), balances: new Map(contracts.map((contract, position) => [contract, balances[position] as bigint])) };
  } catch {
    return null;
  }
}

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-4)}`;
/** The day a gift was created, in UTC, as every other date on this page is written. */
const dayOf = (iso: string) => dateInWords(new Date(iso).getTime(), "UTC");

/**
 * Viky's index, read as this page is served (the audit of 1 Oct 2026, D-14): the contracts' own events, indexed with
 * Envio HyperIndex in the Viky-index repository. The totals, every gift with the transaction that created it, the
 * block the index has reached beside the chain's head, and, for each contract, what the index's events say it holds
 * beside what the token says it holds. The last one is the check a stranger can make without reading an event.
 *
 * No movement of money depends on the index, and the app reads it on this page only (once, in page.tsx, for this
 * block and for "Who has used Viky"). When it does not answer, the block shows the last answer the page kept, and
 * says so with the block it had reached and the moment it was read (the founder, 12 Oct 2026; src/index-kept.ts).
 * When none is kept, or no endpoint is set for this deployment, the block says so in a sentence and shows no figure:
 * the reading answers nothing rather than an error (src/envio-index.ts).
 */

/** The plan the hosted index runs on, and what this page does when it does not answer: one line, in the open. */
function Plan() {
  return (
    <p className={HELP} data-index="plan">
      The index runs on Envio&apos;s hosted service, on its {INDEX_PLAN.free ? "free " : ""}
      {INDEX_PLAN.name} plan: {INDEX_PLAN.indexingHoursAMonth} indexing hours a month. When it does not answer, this page shows the last
      figures it read, with their block and their date.
    </p>
  );
}

export async function JudgesIndex({ index }: Readonly<{ index: IndexRead | null }>) {
  if (!index) {
    return (
      <Fold id="index" title="The index of the contracts' events">
        <p className={HELP} data-index="unread">
          The contracts&apos; events are indexed with Envio HyperIndex, in the repository RedGnad/Viky-index. The index could
          not be read just now and no earlier reading of it is kept, or no endpoint is set for this deployment, so no
          figure of it is shown here. No movement of money depends on it: every figure elsewhere on this page comes from
          the contracts themselves.
        </p>
        <Plan />
      </Fold>
    );
  }
  const chain = await chainBeside(index);
  const held = heldPerContract(index.gifts);
  // Which contracts the deployment read follows is said from what it holds, never from a number written here.
  const third = followsThirdDailyContract(index);
  const thirdMissing = !third && giftEscrowV3Address() !== null;
  // How many contracts the index and the token agree on, said on the line a judge reads before opening it.
  const agreeing = [...held.entries()].filter(([contract, indexed]) => chain?.balances.get(contract) === indexed).length;
  // The figures are the index's answer of now, or the last one kept when it does not answer: said first, with its moment.
  const kept = index.keptFrom ?? null;
  return (
    <Fold id="index" title="The index of the contracts' events">
      {kept ? (
        <p className={HELP} data-index="kept">
          <strong>The index did not answer just now.</strong> What follows is the last answer this page kept of it: block{" "}
          {index.block.toLocaleString("en-US")}, read on {momentInWords(kept)}.
        </p>
      ) : null}
      <Plan />
      <Rows>
        <Row title="What the index is, where it runs, and what it is not">
          <p className={HELP}>
            The contracts&apos; events are indexed with Envio HyperIndex, in the repository RedGnad/Viky-index, and read here
            as this page is served. No movement of money depends on it: it is a second reading of the same events, set
            beside the chain so that anybody can see whether the two agree. It follows the two gift contracts of each of
            the first two versions, the earlier gift contract, {third ? "the daily contract of the third version, " : ""}the way out and
            the anchor of agreements.
            {thirdMissing ? (
              <span data-index="third-missing">
                {" "}
                The deployment read here was made before the third daily contract and does not follow it: a daily gift made
                since 3 Oct 2026 is not in it.
              </span>
            ) : null}
          </p>
        </Row>
      </Rows>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
        <dt className={MUTED}>Where the index stands</dt>
        <dd className={HELP} data-index="block">
          Block {index.block.toLocaleString("en-US")}
          {kept
            ? `, where the index stood on ${momentInWords(kept)}${chain ? `; the chain's head is now ${chain.head.toLocaleString("en-US")}` : ""}.`
            : chain
              ? `, and the chain's head is ${chain.head.toLocaleString("en-US")}: ${Math.max(0, chain.head - index.block).toLocaleString("en-US")} ${chain.head - index.block === 1 ? "block" : "blocks"} behind.`
              : ". The chain's head could not be read just now."}{" "}
          {index.totals.eventsIndexed.toLocaleString("en-US")} events indexed.
        </dd>
        <dt className={MUTED}>In all</dt>
        <dd className={HELP}>
          {index.totals.giftsCreated} {index.totals.giftsCreated === 1 ? "gift" : "gifts"} created, {index.totals.giftsClaimed} opened.{" "}
          {index.totals.daysEarned} {index.totals.daysEarned === 1 ? "day" : "days"} earned, {index.totals.daysReturned} gone back,{" "}
          {index.totals.milestonesReached} {index.totals.milestonesReached === 1 ? "milestone" : "milestones"} reached. {formatAusd(index.totals.amountEarned)} earned,{" "}
          {formatAusd(index.totals.amountWithdrawn)} taken out by the people the gifts were for.
        </dd>
        <dt className={MUTED}>The anchor of agreements</dt>
        <dd className={HELP} data-index="anchor">
          {index.totals.consentKeysBound} {index.totals.consentKeysBound === 1 ? "account has" : "accounts have"} bound an agreement key,{" "}
          {index.totals.yesAnchored} yes and {index.totals.stopsAnchored} {index.totals.stopsAnchored === 1 ? "stop" : "stops"} are written down.
        </dd>
      </dl>
      <Rows>
        {/* Contract by contract: what the index says it holds beside what the token says, and how many agree. */}
        <Row title="The index beside the token, contract by contract" meta={<span data-index="agree">{chain ? `${agreeing} of ${held.size} the same` : "the token not read"}</span>}>
          <p className={HELP}>
            {[...held.entries()].map(([contract, indexed]) => {
              const onChain = chain?.balances.get(contract);
              return (
                <span key={contract} className="block [overflow-wrap:anywhere]" data-index-contract={contract}>
                  <a className="underline" href={`https://monadvision.com/address/${contract}`}>
                    {contract}
                  </a>
                  : the index&apos;s events {kept ? "added" : "add"} up to {formatAusdExact(indexed)} still held{kept ? " at that reading" : ""}
                  {onChain === undefined
                    ? ", and what the token says it holds could not be read just now."
                    : `, and the token says it holds ${formatAusdExact(onChain)}${kept ? " now" : ""}: ${onChain === indexed ? "the same" : "they differ"}.`}
                </span>
              );
            })}
            What a contract holds is what was put into its gifts, less what was taken out and what was sent back; the token&apos;s
            figure is AUSD&apos;s own <code>balanceOf</code>.
            {kept ? " A gift made, paid or sent back since that reading is in the token's figure and not in the index's." : ""}
          </p>
        </Row>
        <Row title="Every gift, and the transaction that created it" meta={<span>{index.gifts.length} {index.gifts.length === 1 ? "gift" : "gifts"}</span>}>
          <p className={HELP}>
            {index.gifts.map((gift) => (
              <span key={`${gift.contract}-${gift.giftId}`} className="block">
                Gift {gift.giftId}, {gift.kind}, {formatAusd(gift.amount)}, {gift.status}, made {dayOf(gift.createdAt)}:{" "}
                <a className="underline" href={`https://monadvision.com/tx/${gift.createdInTransaction}`}>
                  {short(gift.createdInTransaction)}
                </a>
              </span>
            ))}
          </p>
        </Row>
      </Rows>
    </Fold>
  );
}
