import type { Metadata } from "next";
import { JudgesAccount } from "../components/JudgesAccount";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadRpcUrl } from "@/src/monad/chain";

export const metadata: Metadata = {
  title: "For judges",
};

// The only page where contract addresses appear. Consumer screens never show them.
export default function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  // Gifts created before the D30 corrections keep running on the contract that holds them, and every
  // gift record names its own contract, so both are listed here for as long as the older one holds one.
  const earlierEscrow = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">For judges</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Everything verifiable about Viky in one screen. Nothing here is shown to funders or
          recipients.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-medium">Network</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt style={{ color: "var(--muted)" }}>Chain</dt>
          <dd>Monad mainnet, chain id {MONAD_CHAIN_ID}</dd>
          <dt style={{ color: "var(--muted)" }}>RPC</dt>
          <dd className="break-all font-mono">{monadRpcUrl()}</dd>
          <dt style={{ color: "var(--muted)" }}>AUSD</dt>
          <dd className="break-all font-mono">{AUSD_ADDRESS}</dd>
          <dt style={{ color: "var(--muted)" }}>Gift contract</dt>
          <dd className="break-all">
            {escrow ? (
              <>
                <span className="font-mono">{escrow}</span>{" "}
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
              <dt style={{ color: "var(--muted)" }}>Earlier gift contract</dt>
              <dd className="break-all">
                <span className="font-mono">{earlierEscrow}</span>{" "}
                (<a className="underline" href={`https://monadvision.com/address/${earlierEscrow}`}>MonadVision</a>, source verified through Sourcify).
                It holds the gifts created before the day-counting corrections of DECISIONS.md D30 and keeps running
                them to the end. Gift ids never restart: the newer contract continues the sequence, and every gift
                record names the contract that holds it.
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">How progress is verified</h2>
        <p className="text-sm">
          Duolingo runs in public mode: once a day, Viky&apos;s keeper reads the recipient&apos;s public profile
          through an attested fetch (Reclaim zkFetch through Reclaim&apos;s TEE client). The attestor signs
          Duolingo&apos;s response; Viky verifies that signature, pins the attestor&apos;s address (the same one the
          on-chain Duolingo verifier pins) and checks the proof is about the right URL and username; the evidence
          signer then turns the signed reading into an EIP-712 check-in, and the contract credits or refuses it.
          What is not verified: the attestor&apos;s own TEE attestation, which zk-fetch 1.1.0 does not put in the
          proof. The person signs in to nothing and installs nothing; account ownership is proved once, either by the
          funder naming the account or by a short code the recipient places in their Duolingo display name.
        </p>
        <p className="text-sm">
          Two accepted risks, written here on purpose: the profile endpoint is unofficial (the same risk class as a
          provider schema drift, watched by the same tests), and each attested read costs money on Reclaim&apos;s side
          (their public price starts at $0.10 per verification; one read per recipient per day, never per gift).
          Private sources keep the user-proof path through the Reclaim verifier app.
        </p>
      </section>

      <JudgesAccount />
    </main>
  );
}
