import {
  AGORA_TESTNET,
  AGORA_TESTNET_RUN,
  lostToTheMarket,
  MAINNET_EXIT_ROUTER,
  MARKET_PATH_MEASURE,
  testnetAddressUrl,
  testnetSourceRecordUrl,
  testnetTransactionUrl,
  type AgoraTestnetRun,
} from "@/src/agora-testnet";
import { AUSD, exactly, USDC, type Coin } from "@/src/coins";
import { SubFold } from "./Fold";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/** The two test coins, written as counts of a coin and never as dollars: neither is money. */
const TEST_AUSD: Coin = { symbol: "test AUSD", address: AGORA_TESTNET.ausd, decimals: 6, dollars: false };
const OTHER_COIN: Coin = { symbol: "CTK", address: AGORA_TESTNET.otherCoin, decimals: 18, dollars: false };
/** The measure of mainnet, to the last unit each coin has. */
const AS_COUNTED = { usdc: { ...USDC, dollars: false }, ausd: { ...AUSD, dollars: false } } as const;

function short(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/**
 * Agora's Instant Settlement, for the judges of Agora's bounty (the founder, 8 Oct 2026): what a conversion through a
 * market cost the day it was measured, the way out through Agora's fixed-price pair on Monad testnet with its
 * transaction, and why none of it runs on mainnet.
 *
 * Nothing is drawn while no run is recorded (src/agora-testnet.ts): no line says a transaction happened before one
 * did. Every figure of the second line is the run's own, and `pnpm agora:testnet check` reads it back from the chain.
 */
export function JudgesInstantSettlement({ run = AGORA_TESTNET_RUN }: Readonly<{ run?: AgoraTestnetRun | null }>) {
  if (!run) return null;
  return (
    <SubFold title="Agora's Instant Settlement: a fixed price, walked on Monad testnet">
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
        <dt className={MUTED}>Through a market, on mainnet</dt>
        <dd className={HELP} data-settlement="market">
          Measured once with real amounts, on {MARKET_PATH_MEASURE.day}: a card payment of {exactly(MARKET_PATH_MEASURE.usdcIn, AS_COUNTED.usdc)} came back
          as {exactly(MARKET_PATH_MEASURE.ausdOut, AS_COUNTED.ausd)}, {lostToTheMarket()} % less (
          <a className="underline" href={`https://monadvision.com/tx/${MARKET_PATH_MEASURE.transaction}`}>
            {short(MARKET_PATH_MEASURE.transaction)}
          </a>
          ). The contract is ExitRouter set on USDC, and the exchange it calls has a price that moves: it refuses, with nothing
          taken, when less than the floor the person signed would come back.
        </dd>
        <dt className={MUTED}>Through Agora&apos;s pair, on testnet</dt>
        <dd className={HELP} data-settlement="testnet">
          On {run.day}, on Monad testnet, the same ExitRouter set on Agora&apos;s test AUSD (
          <a className="underline [overflow-wrap:anywhere]" href={testnetAddressUrl(run.router)}>
            {run.router}
          </a>
          ) sent {exactly(run.ausdIn, TEST_AUSD)} through Agora&apos;s Instant Settlement pair and handed back {exactly(run.otherCoinOut, OTHER_COIN)}, the
          pair&apos;s other test coin: one for one, nothing taken (
          <a className="underline" href={testnetTransactionUrl(run.exit)}>
            {short(run.exit)}
          </a>
          ). One signature, from an account that holds none of the chain&apos;s coin, as on mainnet. The copy&apos;s code is the code of the way out
          on mainnet (<span className="[overflow-wrap:anywhere]">{MAINNET_EXIT_ROUTER}</span>) byte for byte, but for the coin&apos;s address, its source is in the explorer&apos;s registry as an{" "}
          <a className="underline" href={testnetSourceRecordUrl(run.router)}>exact match</a>, and <code>pnpm agora:testnet check</code> reads all of it
          back with no key. It is the way out and not the conversion above: the
          pair&apos;s other test coin takes no signed transfer, so only the direction that starts from AUSD has a path there.
        </dd>
        <dt className={MUTED}>Why not on mainnet</dt>
        <dd className={HELP} data-settlement="mainnet">
          Agora opens this contract only to users it has verified (
          <a className="underline" href="https://docs.agora.finance/instant-settlement">Instant Settlement</a>, read 8 Oct 2026): on mainnet the pair
          swaps only for an address Agora approved, and none of Viky&apos;s is. On testnet a contract of Agora&apos;s gives that approval to any address, which is how the run above was made. No money
          of a gift has gone through Instant Settlement: every conversion on mainnet takes the market path above.
        </dd>
      </dl>
    </SubFold>
  );
}
