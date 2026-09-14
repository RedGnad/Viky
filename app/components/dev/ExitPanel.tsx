"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, isAddress, type Hex } from "viem";
import { useAccount } from "@/src/account/provider";
import * as mera from "@/src/account/mera";
import { postJson } from "@/src/client/api";
import { approveAusd, readAusdBalance, readMonBalance, sendAllMon, sendWithExplicitGas, transferAusd } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { AccountPanel } from "../AccountPanel";

// Dev page: the exit of KT1, for whichever account is signed in (recipient or funder). Either AUSD to MON
// through Kuru (the account's own transactions, gas topped up by the relayer) then Mercuryo Sell in the
// person's own hands, or everything sent back to a wallet the person controls (the crypto-native exit,
// used while the fiat rail is not the intended one). Plumbing is visible here on purpose.

const NATIVE_MON = "0x0000000000000000000000000000000000000000";
const MERCURYO_SELL = "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD";

type Quote = { output: string; minOut: string; to: Hex; data: Hex; value: string };

export function ExitPanel() {
  const { address } = useAccount();
  const [mon, setMon] = useState<bigint | null>(null);
  const [ausd, setAusd] = useState<bigint | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState("");
  const destinationOk = isAddress(destination);

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

  const sendBackAusd = async () => {
    const account = mera.currentAccount();
    if (!account || !destinationOk || ausd === null || ausd === 0n) return;
    // Pay for it first. Letting the send run against an empty account produced a forty line trace saying
    // "insufficient balance", which is true and useless: the account cannot pay for its own transaction and
    // only we can fix that. A contract call cannot use Monad's emptying exception, so the balance has to be
    // there before, not after.
    try {
      const topped = await postJson<{ toppedUp: boolean; reason?: string }>("/api/dev/gas-top-up", {});
      say(topped.toppedUp ? "topped up first" : `no top-up needed (${topped.reason})`);
      await refresh();
    } catch (error) {
      say(`could not top up: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    setBusy(true);
    try {
      say(`send ${formatAusd(ausd)} to ${destination}`);
      const hash = await transferAusd(account, destination, ausd);
      say(`AUSD sent, finalised: ${hash}`);
      await refresh();
    } catch (error) {
      say(`AUSD send failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const sendBackMon = async () => {
    const account = mera.currentAccount();
    if (!account || !destinationOk || mon === null || mon === 0n) return;
    setBusy(true);
    try {
      say(`send all MON to ${destination}`);
      const sent = await sendAllMon(account, destination);
      say(`${formatEther(sent.amount)} MON sent, finalised: ${sent.hash}`);
      await refresh();
    } catch (error) {
      say(`MON send failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">Exit (dev)</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The exit of the first mainnet chain, for the signed-in account: AUSD to MON with the account&apos;s own transactions then Mercuryo Sell, or everything sent back to a wallet you control.
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

      {address ? (
        <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <h2 className="font-medium">Send back to a wallet you control</h2>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value.trim())}
            placeholder="0x… a Monad account you control"
            className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-gray-700"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sendBackAusd} disabled={busy || !destinationOk || !ausd} className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
              Send all AUSD
            </button>
            <button type="button" onClick={sendBackMon} disabled={busy || !destinationOk || !mon} className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
              Send all MON (keeps only the transfer&apos;s gas)
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Sending AUSD needs a little MON for gas: use the top-up button above first if MON is 0.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 p-5 font-mono text-xs dark:border-gray-800">
        {log.length === 0 ? <p style={{ color: "var(--muted)" }}>log</p> : log.map((line, index) => <p key={index}>{line}</p>)}
      </section>
    </main>
  );
}
