import { heldPerContract, type IndexRead } from "@/src/envio-index";
import { formatAusd, formatAusdExact } from "@/src/gift-reader";
import { AUSD_ADDRESS, createMonadPublicClient } from "@/src/monad/chain";
import { dateInWords } from "@/src/moments";
import { Fold } from "./Fold";

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
 * block and for "Who has used Viky"). When it cannot be read, or no endpoint is set for this deployment, the block
 * says so in a sentence and shows no figure: the reading answers nothing rather than an error (src/envio-index.ts).
 */
export async function JudgesIndex({ index }: Readonly<{ index: IndexRead | null }>) {
  if (!index) {
    return (
      <Fold id="index" title="The index of the contracts' events">
        <p className={HELP} data-index="unread">
          The contracts&apos; events are indexed with Envio HyperIndex, in the repository RedGnad/Viky-index. The index could
          not be read just now, or no endpoint is set for this deployment, so no figure of it is shown here rather than
          an old one. No movement of money depends on it: every figure elsewhere on this page comes from the contracts
          themselves.
        </p>
      </Fold>
    );
  }
  const chain = await chainBeside(index);
  const held = heldPerContract(index.gifts);
  return (
    <Fold id="index" title="The index of the contracts' events">
      <p className={HELP}>
        The contracts&apos; events are indexed with Envio HyperIndex, in the repository RedGnad/Viky-index, and read here
        as this page is served. No movement of money depends on it: it is a second reading of the same events, set
        beside the chain so that anybody can see whether the two agree. It follows seven contracts: the two gift
        contracts of each version, the earlier gift contract, the way out and the anchor of agreements.
      </p>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
        <dt className={MUTED}>Where the index stands</dt>
        <dd className={HELP} data-index="block">
          Block {index.block.toLocaleString("en-US")}
          {chain ? `, and the chain's head is ${chain.head.toLocaleString("en-US")}: ${Math.max(0, chain.head - index.block).toLocaleString("en-US")} ${chain.head - index.block === 1 ? "block" : "blocks"} behind.` : ". The chain's head could not be read just now."}{" "}
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
        <dt className={MUTED}>The index beside the token</dt>
        <dd className={HELP}>
          {[...held.entries()].map(([contract, indexed]) => {
            const onChain = chain?.balances.get(contract);
            return (
              <span key={contract} className="block [overflow-wrap:anywhere]" data-index-contract={contract}>
                <a className="underline" href={`https://monadvision.com/address/${contract}`}>
                  {contract}
                </a>
                : the index&apos;s events add up to {formatAusdExact(indexed)} still held
                {onChain === undefined ? ", and what the token says it holds could not be read just now." : onChain === indexed ? `, and the token says it holds ${formatAusdExact(onChain)}: the same.` : `, and the token says it holds ${formatAusdExact(onChain)}: they differ.`}
              </span>
            );
          })}
          What a contract holds is what was put into its gifts, less what was taken out and what was sent back; the token&apos;s
          figure is AUSD&apos;s own <code>balanceOf</code>.
        </dd>
        <dt className={MUTED}>Every gift, and the transaction that created it</dt>
        <dd className={HELP}>
          {index.gifts.map((gift) => (
            <span key={`${gift.contract}-${gift.giftId}`} className="block">
              Gift {gift.giftId}, {gift.kind}, {formatAusd(gift.amount)}, {gift.status}, {dayOf(gift.createdAt)}:{" "}
              <a className="underline" href={`https://monadvision.com/tx/${gift.createdInTransaction}`}>
                {short(gift.createdInTransaction)}
              </a>
            </span>
          ))}
        </dd>
      </dl>
    </Fold>
  );
}
