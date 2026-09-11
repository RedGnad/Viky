"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Hex } from "viem";
import { useAccount } from "@/src/account/provider";
import * as mera from "@/src/account/mera";
import { postJson } from "@/src/client/api";
import { createGift, type CreatedGift } from "@/src/client/gift";
import { readAusdBalance, readMonBalance, sendWithExplicitGas } from "@/src/client/onchain";
import { formatAusd } from "@/src/gift-reader";
import { GOAL_TYPE_DUOLINGO_XP } from "@/src/gift-terms";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { AccountPanel } from "../AccountPanel";

// Dev page: addresses and plumbing are shown on purpose. This is the funder side of KT1, not a product screen.

const NATIVE_MON = "0x0000000000000000000000000000000000000000";
const GAS_RESERVE_WEI = 200_000_000_000_000_000n; // 0.2 MON kept for the swap's own gas

type Quote = { output: string; minOut: string; to: Hex; data: Hex; value: string };

export function FundPanel() {
  const { address } = useAccount();
  const [mon, setMon] = useState<bigint | null>(null);
  const [ausd, setAusd] = useState<bigint | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState("");
  const [duolingoUsername, setDuolingoUsername] = useState("");
  const [dollars, setDollars] = useState("5");
  const [target, setTarget] = useState("10");
  const [days, setDays] = useState("7");
  const [created, setCreated] = useState<CreatedGift | null>(null);

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

  const swapAll = async () => {
    const account = mera.currentAccount();
    if (!account || mon === null) return;
    setBusy(true);
    try {
      const amount = mon - GAS_RESERVE_WEI;
      if (amount <= 0n) throw new Error("Not enough MON to swap after the gas reserve");
      say(`quote ${formatEther(amount)} MON -> AUSD`);
      const quote = await postJson<Quote>("/api/dev/kuru-quote", { tokenIn: NATIVE_MON, tokenOut: AUSD_ADDRESS, amount: amount.toString() });
      say(`expected ${formatAusd(BigInt(quote.output))}, minimum ${formatAusd(BigInt(quote.minOut))}, router ${quote.to}`);
      const sent = await sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) });
      say(`swap finalised: ${sent.hash} (gas used ${sent.gasUsed})`);
      await refresh();
    } catch (error) {
      say(`swap failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const fund = async () => {
    const account = mera.currentAccount();
    if (!account) return;
    setBusy(true);
    try {
      const units = BigInt(Math.round(Number(dollars) * 100)) * 10_000n;
      say(`create gift: ${formatAusd(units)} to ${contact}, ${target} XP/day, ${days} days`);
      const result = await createGift({
        account,
        contact,
        duolingoUsername: duolingoUsername.trim() || undefined,
        goalType: GOAL_TYPE_DUOLINGO_XP,
        dailyTarget: Number(target),
        durationDays: Number(days),
        amount: units,
      });
      setCreated(result);
      say(`funded gift ${result.giftId}`);
      await refresh();
    } catch (error) {
      say(`create failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">Fund a gift (dev)</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The funder side of the first mainnet chain. Send MON to the address below from a wallet you control (or buy it there on Mercuryo), swap it to AUSD, fund a gift with one signature.
        </p>
      </header>

      {!address ? (
        <AccountPanel />
      ) : (
        <>
          <section className="space-y-2 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <p className="font-mono text-sm break-all">{address}</p>
            <p className="text-sm">
              MON: {mon === null ? "…" : formatEther(mon)} · AUSD: {ausd === null ? "…" : formatAusd(ausd)}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void refresh()} className="rounded-lg border px-3 py-1 text-sm">
                Refresh
              </button>
              <button type="button" onClick={swapAll} disabled={busy || mon === null || mon <= GAS_RESERVE_WEI} className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                Swap all MON to AUSD (Kuru)
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h2 className="font-medium">Create and fund</h2>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="recipient email or +phone" className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
            <input value={duolingoUsername} onChange={(e) => setDuolingoUsername(e.target.value)} placeholder="their Duolingo username, if you know it (optional)" className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
            <div className="grid grid-cols-3 gap-2">
              <input value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="dollars" className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="XP per day" className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
              <input value={days} onChange={(e) => setDays(e.target.value)} placeholder="days" className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
            </div>
            <button type="button" onClick={fund} disabled={busy || !contact} className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
              Sign once and fund
            </button>
            {created ? (
              <div className="space-y-1 text-sm">
                <p>Gift {created.giftId} funded. Send this link to the recipient:</p>
                <p className="font-mono break-all">{created.claimUrl}</p>
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-gray-200 p-5 font-mono text-xs dark:border-gray-800">
        {log.length === 0 ? <p style={{ color: "var(--muted)" }}>log</p> : log.map((line, index) => <p key={index}>{line}</p>)}
      </section>
    </main>
  );
}
