import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import { JudgesAccount } from "../components/JudgesAccount";
import { DISPLAY, TITLE } from "../components/ui";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadRpcUrl } from "@/src/monad/chain";
import { MilestoneJudges } from "../components/MilestoneJudges";

export const metadata: Metadata = {
  title: "For judges",
};

// The only page where contract addresses appear. Consumer screens never show them. They are set in the text face
// like every other word: a monospace face would be the system's, and hex has no letter a text face confuses.
export default function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  // Gifts created before the D30 corrections keep running on the contract that holds them, and every
  // gift record names its own contract, so both are listed here for as long as the older one holds one.
  const earlierEscrow = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>For judges</h1>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Everything verifiable about Viky in one screen. Nothing here is shown to funders or
          recipients.
        </p>
      </header>

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>Network</h2>
        {/* On a phone each label sits above its value: two columns there left a value 198 pixels, and breaking
            anywhere to fit an address broke every sentence beside it mid-word. Only an unbreakable string breaks now. */}
        <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] text-[length:var(--type-help)] [@media(min-width:600px)]:grid-cols-[10rem_1fr]">
          <dt className="text-[var(--muted)]">Chain</dt>
          <dd>Monad mainnet, chain id {MONAD_CHAIN_ID}</dd>
          <dt className="text-[var(--muted)]">RPC</dt>
          <dd className="[overflow-wrap:anywhere]">{monadRpcUrl()}</dd>
          <dt className="text-[var(--muted)]">AUSD</dt>
          <dd className="[overflow-wrap:anywhere]">{AUSD_ADDRESS}</dd>
          <dt className="text-[var(--muted)]">Gift contract</dt>
          <dd className="[overflow-wrap:anywhere]">
            {escrow ? (
              <>
                {escrow}{" "}
                (<a className="underline" href={`https://monadvision.com/address/${escrow}`}>MonadVision</a>, source verified through Sourcify)
              </>
            ) : (
              "Not deployed yet."
            )}{" "}
            Nothing is claimed as working until the first gift has run end to end on mainnet; the record is in
            docs/spikes/KT1.md.
          </dd>
          {earlierEscrow ? (
            <>
              <dt className="text-[var(--muted)]">Earlier gift contract</dt>
              <dd className="[overflow-wrap:anywhere]">
                {earlierEscrow}{" "}
                (<a className="underline" href={`https://monadvision.com/address/${earlierEscrow}`}>MonadVision</a>, source verified through Sourcify).
                It holds the gifts created before the day-counting corrections of DECISIONS.md D30 and keeps running
                them to the end. Gift ids never restart: the newer contract continues the sequence, and every gift
                record names the contract that holds it.
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>How progress is verified</h2>
        <p className="text-[length:var(--type-help)]">
          Duolingo runs in public mode: once a day, Viky&apos;s keeper reads the recipient&apos;s public profile
          through an attested fetch (Reclaim zkFetch through Reclaim&apos;s TEE client). The attestor signs
          Duolingo&apos;s response; Viky verifies that signature, pins the attestor&apos;s address (the same one the
          on-chain Duolingo verifier pins) and checks the proof is about the right URL and username; the evidence
          signer then turns the signed reading into an EIP-712 check-in, and the contract credits or refuses it.
          What is not verified: the attestor&apos;s own TEE attestation, which zk-fetch 1.1.0 does not put in the
          proof. The person signs in to nothing and installs nothing; account ownership is proved once, either by the
          funder naming the account or by a short code the recipient places in their Duolingo display name.
        </p>
        <p className="text-[length:var(--type-help)]">
          Two accepted risks, written here on purpose: the profile endpoint is unofficial (the same risk class as a
          provider schema drift, watched by the same tests), and each attested read costs money on Reclaim&apos;s side
          (their public price starts at $0.10 per verification; one read per recipient per day, never per gift).
          Private sources keep the user-proof path through the Reclaim verifier app.
        </p>
      </section>

      <MilestoneJudges />

      <JudgesAccount />
    </Shell>
  );
}
