import type { Metadata } from "next";
import { JudgesAccount } from "../components/JudgesAccount";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadRpcUrl } from "@/src/monad/chain";

export const metadata: Metadata = {
  title: "For judges",
};

// The only page where contract addresses appear. Consumer screens never show them.
export default function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
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
        </dl>
      </section>

      <JudgesAccount />
    </main>
  );
}
