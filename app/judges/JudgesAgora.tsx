import { ausdFacts } from "@/src/judges-ausd";
import { BLOCK_TIME, creditedDayMon, dailyGiftMon, dollarsOf, FINALITY_GAP, missedDayMon, MON_PRICE, monWords, RELAYER_FEES } from "@/src/measured";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { feeSentence, waysIn } from "@/src/rails";
import { giftEscrowV2Address, giftEscrowV3Address, milestoneGiftV2Address } from "@/src/v2";
import { Fold, SubFold } from "./Fold";
import { JudgesInstantSettlement } from "./JudgesInstantSettlement";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/** Every contract that holds gifts' money on this deployment, by the name the page gives it. */
function holders(): ReadonlyArray<{ label: string; address: string }> {
  const named: Array<{ label: string; address: string | null | undefined }> = [
    { label: "third-version daily gifts", address: giftEscrowV3Address() },
    { label: "second-version gifts", address: giftEscrowV2Address() },
    { label: "second-version milestone gifts", address: milestoneGiftV2Address() },
    { label: "first-version gifts", address: process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim() },
    { label: "the earlier gift contract", address: process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim() },
    { label: "first-version milestone gifts", address: process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS?.trim() },
  ];
  return named.flatMap((one) => (one.address && /^0x[0-9a-fA-F]{40}$/.test(one.address) ? [{ label: one.label, address: one.address }] : []));
}

/**
 * The dollar a gift is in, for the judges of Agora's bounty (the review of 2 Oct 2026, R-12; the founder, 2 Oct 2026):
 * who issues AUSD and what its issuer can do to a gift, the plain send from one account to another, what a gift costs
 * and who pays it, and how long a settlement takes.
 *
 * Every figure is measured and dated (src/measured.ts), or published by the service that takes it (src/rails.ts, with
 * its source and the day it was read). What the token is doing right now, suspended or not, frozen or not, is asked of
 * the token as the page is served.
 */
export async function JudgesAgora() {
  const held = holders();
  const facts = await ausdFacts(held.map((one) => one.address));
  const frozen = facts ? facts.holders.filter((one) => one.frozen) : [];
  const sends = RELAYER_FEES.steps.find((one) => one.step === "transferWithAuthorization");
  return (
    <Fold id="agora" title="AUSD, Agora's dollar: who issues it, what a gift costs, how fast it settles">
      <p className={HELP}>
        Every gift is held and paid in AUSD (<span className="[overflow-wrap:anywhere]">{AUSD_ADDRESS}</span>) and in nothing else. AUSD is issued by
        Agora Bermuda Limited, which Agora&apos;s site says is licensed by the Bermuda Monetary Authority (
        <a className="underline" href="https://www.agora.finance/">agora.finance</a>, read 2 Oct 2026). Viky is not affiliated with Agora.
      </p>
      <p className={HELP} data-ausd={facts ? "read" : "unread"}>
        {facts
          ? `Asked of the token as this page is served: transfers are ${facts.transfersPaused ? "suspended" : "not suspended"}, signed transfers are ${facts.signedTransfersPaused ? "suspended" : "not suspended"}, the account that can replace its code is ${facts.proxyAdmin}, and of the ${held.length} contracts that hold gifts ${frozen.length === 0 ? "none is frozen" : `${frozen.map((one) => one.address).join(", ")} ${frozen.length === 1 ? "is" : "are"} frozen`}.`
          : "Whether transfers are suspended, and whether a contract that holds gifts is frozen, could not be asked of the token just now, so nothing is said of it here rather than something out of date."}
      </p>
      <SubFold title="What its issuer can do to a gift">
      <p className={HELP}>
        What its issuer can do is in the token&apos;s own source, verified on Monad through Sourcify, and in Agora&apos;s
        documentation (<a className="underline" href="https://docs.agora.finance/developer/rbac">Role Based Access Control</a>), both read 2 Oct
        2026. A freezer role can freeze an account, which can then neither send nor receive AUSD. A pauser role can suspend
        every transfer, or the signed transfers alone, which is how a gift is funded and how a send is relayed. A burner role
        can burn AUSD from an account. The contract&apos;s admin can replace its code. None of this is Viky&apos;s to prevent.
        What it would do to a gift: a frozen refund account blocks the return of what was not earned, and with it the
        cancelling and the ending of that gift, but not the recipient&apos;s withdrawal; a frozen recipient cannot take their
        money out; and a gift contract frozen, or transfers suspended, stops everything in and out of it until Agora lifts
        it. Nobody else gains by any of these: the money stays where it is.
      </p>
      </SubFold>
      <SubFold title="A plain send, with no gift">
      <p className={HELP}>
        From Me, &quot;Spend or withdraw&quot;, then &quot;Send to another Viky account of mine&quot;: AUSD goes from one
        account to another in one transaction. The person pastes the other account&apos;s code, types the amount and presses
        Send; their account signs an EIP-3009 authorization, Viky&apos;s relayer submits it and pays the network fee, and the
        AUSD moves from the one account to the other with no contract of Viky&apos;s in between (
        <code>app/api/send/route.ts</code>). The screen names it for the person&apos;s own second account; the transaction is
        the same to any account, and the only codes it refuses are this account&apos;s own and Viky&apos;s contracts.
        {sends ? ` ${sends.sent} such sends had been relayed when the fees below were read.` : ""}
      </p>
      </SubFold>
      <SubFold title="What a gift costs, who pays it, and how fast it settles">
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
        <dt className={MUTED}>The network, paid by Viky</dt>
        <dd className={HELP} data-cost="network">
          Every step of a gift is sent and paid for by Viky&apos;s relayer (<span className="[overflow-wrap:anywhere]">{RELAYER_FEES.account}</span>):
          neither person ever holds MON. Read from the chain on {RELAYER_FEES.readAt} with <code>{RELAYER_FEES.command}</code>, as the limit
          each transaction declared times the price it paid, which is what Monad charges: {RELAYER_FEES.transactions} transactions,{" "}
          {RELAYER_FEES.totalMon} MON in all. By step, on average:{" "}
          {RELAYER_FEES.steps.map((step) => `${step.says}, ${step.averageMon} MON (${step.sent} sent)`).join("; ")}. All of them on the
          first version of the contracts: no gift had run on the second when this was read.
        </dd>
        <dt className={MUTED}>The same, in dollars</dt>
        <dd className={HELP} data-cost="dollars">
          At the price of MON on {MON_PRICE.source}, ${MON_PRICE.usd.toFixed(4)} at {MON_PRICE.readAt}: a credited day costs Viky{" "}
          {monWords(creditedDayMon())}, about {dollarsOf(creditedDayMon())}; a missed day, settled and sent back, {monWords(missedDayMon())}, about{" "}
          {dollarsOf(missedDayMon())}; and a seven-day gift whose every day is credited, from its making to its closing (made, opened, seven
          days, one withdrawal, closed), {monWords(dailyGiftMon(7))}, about {dollarsOf(dailyGiftMon(7))}.
        </dd>
        <dt className={MUTED}>The card service, paid by the funder</dt>
        <dd className={HELP} data-cost="card">
          {waysIn().map((way) => (
            <span key={way.name} className="block">
              {feeSentence(way)} ({way.source}, read {way.read}).
            </span>
          ))}
          That is the service&apos;s own fee, taken on its own page. Viky adds nothing to it.
        </dd>
        <dt className={MUTED}>What Viky takes</dt>
        <dd className={HELP} data-cost="viky">
          Nothing today. The gift contracts take no fee, in any version: every unit a funder puts into a gift goes to its
          recipient or back to its funder, and no function sends AUSD anywhere else. Viky pays the network fees above from
          its own account.
        </dd>
        <dt className={MUTED}>How long a settlement takes</dt>
        <dd className={HELP} data-cost="time">
          A block every {BLOCK_TIME.seconds} s, measured over {BLOCK_TIME.blocks.toLocaleString("en-US")} blocks ({BLOCK_TIME.from.toLocaleString("en-US")} to{" "}
          {BLOCK_TIME.to.toLocaleString("en-US")}) on {BLOCK_TIME.readOn}; in {FINALITY_GAP.readings} readings that day the block the public
          RPC calls final trailed the latest by {FINALITY_GAP.fewestBlocks} or {FINALITY_GAP.mostBlocks} blocks. Viky says a step is done
          once the node reports its block final (<code>src/monad/chain.ts</code>): on the network that is one or two blocks after
          the block that carries the step, under a second at that pace. What the person waits also includes Viky&apos;s
          server and their own connection, which is not measured here.
        </dd>
      </dl>
      </SubFold>
      <JudgesInstantSettlement />
    </Fold>
  );
}
