"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Hex } from "viem";
import { useAccount } from "@/src/account/provider";
import * as mera from "@/src/account/mera";
import { postJson } from "@/src/client/api";
import { approveAusd, readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { AccountPanel } from "../AccountPanel";

// Dev page: the recipient's exit for KT1. AUSD to MON through Kuru (the recipient's own transactions,
// gas topped up by the relayer), then Mercuryo Sell in the person's own hands. Plumbing is visible here
// on purpose; the productised exit is a later task.

const NATIVE_MON = "0x0000000000000000000000000000000000000000";
const MERCURYO_SELL = "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD";

type Quote = { output: string; minOut: string; to: Hex; data: Hex; value: string };

export function ExitPanel() {
  const { address } = useAccount();
  const [mon, setMon] = useState<bigint | null>(null);
  const [ausd, setAusd] = useState<bigint | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const say = (line: string) => setLog((lines) => [...lines, `${new Date().toISOString().slice(11, 19)} ${line}`]);

  const refresh = useCallback(() => {
    if (!address) return Promise.resolve();
    return Promise.all([readMonBalance(address), readAusdBalance(address)]).then(([m, a]) => {
      setMon(m);
      setAusd(a);
    });
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const topUp = async () => {
    setBusy(true);
    try {
      const result = await postJson<{ toppedUp: boolean; hash?: string; reason?: string }>("/api/dev/gas-top-up", {});
      say(result.toppedUp ? `topped up: ${result.hash}` : `no top-up needed (${result.reason})`);
      await refresh();
    } catch (error) {
      say(`top-up failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const swapAll = async () => {
    const account = mera.currentAccount();
    if (!account || ausd === null || ausd === 0n) return;
    setBusy(true);
    try {
      say(`quote ${formatAusd(ausd)} -> MON`);
      const quote = await postJson<Quote>("/api/dev/kuru-quote", { tokenIn: AUSD_ADDRESS, tokenOut: NATIVE_MON, amount: ausd.toString() });
      say(`expected ${formatEther(BigInt(quote.output))} MON, router ${quote.to}`);
      const approval = await approveAusd(account, quote.to, ausd);
      say(`approved: ${approval}`);
      const sent = await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
      say(`swap finalised: ${sent.hash}`);
      await refresh();
    } catch (error) {
      say(`swap failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">Exit (dev)</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The recipient side of the first mainnet chain: AUSD to MON with the recipient&apos;s own transactions, then Mercuryo Sell.
        </p>
      </header>

      {!address ? (
        <AccountPanel />
      ) : (
        <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <p className="font-mono text-sm break-all">{address}</p>
          <p className="text-sm">
            MON: {mon === null ? "…" : formatEther(mon)} · AUSD: {ausd === null ? "…" : formatAusd(ausd)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-lg border px-3 py-1 text-sm">
              Refresh
            </button>
            <button type="button" onClick={topUp} disabled={busy} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50">
              Get 0.05 MON for the swap
            </button>
            <button type="button" onClick={swapAll} disabled={busy || !ausd} className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
              Approve and swap all AUSD to MON (Kuru)
            </button>
            <a href={MERCURYO_SELL} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1 text-sm">
              Sell MON on Mercuryo
            </a>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 p-5 font-mono text-xs dark:border-gray-800">
        {log.length === 0 ? <p style={{ color: "var(--muted)" }}>log</p> : log.map((line, index) => <p key={index}>{line}</p>)}
      </section>
    </main>
  );
}
