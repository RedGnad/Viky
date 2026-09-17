import "../src/load-env";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { getAddress, keccak256, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as accountRoute } from "../app/api/gift/[id]/account/route";
import { GET as statusRoute } from "../app/api/gift/[id]/route";
import { POST as claimRoute } from "../app/api/gift/claim/route";
import { POST as createRoute } from "../app/api/gift/milestone/create/route";
import { POST as withdrawRoute } from "../app/api/gift/withdraw/route";
import { GET as mineRoute } from "../app/api/gifts/mine/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } from "../src/ausd-authorization";
import { CHESS_SETTLED_RD_BELOW, chessGoalType, type ChessMode } from "../src/chess-com";
import { attestChessRating, readChessStanding } from "../src/chess-reading";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { configureGiftStore, ensureGiftSchema } from "../src/gift-store";
import { CHESS_MILESTONE } from "../src/milestone-conditions";
import { liveMilestonePassDeps, milestonePass } from "../src/milestone-pass";
import { milestoneFundingNonce, milestoneWithdrawTypedData, ZERO_SUBJECT } from "../src/milestone-protocol";
import { readMilestoneGift } from "../src/milestone-reader";
import { liveMilestoneReadingDeps, runMilestoneReading } from "../src/milestone-reading";
import { configureMilestoneStore, ensureMilestoneSchema } from "../src/milestone-store";
import { startingCeiling } from "../src/milestone-terms";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The milestone gift's server path, rehearsed from end to end on a local fork of Monad mainnet before anything is sent
 * to mainnet itself (C2). Everything runs as production runs it, the routes included, except three things: the chain is
 * a local fork, the database is PGlite in memory (never the production one), and the recipient's name check is fed the
 * code, because the Chess.com account read is not ours to edit. The start is a real attested reading of a public
 * account; the reading at the target is fed, because nobody's rating climbs on demand.
 *
 * Usage (it refuses any node but the local fork, and never reads the production database):
 *   anvil --fork-url https://rpc.monad.xyz --network monad --port 8547 --block-time 0.1
 *   NEXT_PUBLIC_MONAD_RPC_URL=http://127.0.0.1:8547 REHEARSAL=1 pnpm deploy:milestone-gift
 *   cast rpc anvil_impersonateAccount 0x942644106B073E30D72c2C5D7529D5C296ea91ab --rpc-url http://127.0.0.1:8547
 *   NEXT_PUBLIC_MONAD_RPC_URL=http://127.0.0.1:8547 SESSION_SIGNING_SECRET=<32 bytes or more> MILESTONE_GIFT_ADDRESS=<printed above> npx tsx scripts/rehearse-milestone-fork.ts
 */

const RPC = "http://127.0.0.1:8547";
const ORIGIN = "https://viky.test";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const POOL = "0x942644106B073E30D72c2C5D7529D5C296ea91ab";
type Account = ReturnType<typeof privateKeyToAccount>;

function headers(cookie?: string): Record<string, string> {
  return { origin: ORIGIN, host: "viky.test", "content-type": "application/json", ...(cookie ? { cookie } : {}) };
}

async function cookieFor(account: Account): Promise<string> {
  const environment = { SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET };
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

async function main() {
  if (process.env.NEXT_PUBLIC_MONAD_RPC_URL !== RPC) throw new Error(`Refusing: this rehearsal runs only against ${RPC}`);
  // Never the production database, whatever .env.local holds.
  delete process.env.DATABASE_URL;
  delete process.env.ZKFETCH_WORKER_URL;
  const db = new PGlite();
  const exec: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(exec);
  configureMilestoneStore(exec);
  await ensureGiftSchema();
  await ensureMilestoneSchema();

  const funder = privateKeyToAccount(generatePrivateKey());
  const recipient = privateKeyToAccount(generatePrivateKey());
  process.env.VIKY_OPERATOR_ACCOUNTS = funder.address;
  execSync(`cast send ${AUSD} "transfer(address,uint256)" ${funder.address} 20000000 --from ${POOL} --unlocked --rpc-url ${RPC}`, { stdio: "ignore" });
  console.log("STEP funder funded with 20 AUSD", funder.address);

  // A settled rating (its RD under the threshold of D90), so the ordinary path runs and not an operator's exception. Any
  // public account with one will do: Chess.com's ratings page of a single player can fail for a while (D90).
  const player = process.env.REHEARSAL_PLAYER?.trim() || "magnuscarlsen";
  const cadence = (process.env.REHEARSAL_CADENCE?.trim() || "bullet") as ChessMode;
  const standing = await readChessStanding(player, cadence);
  if (standing.rating === null || standing.rd === null || standing.rd >= CHESS_SETTLED_RD_BELOW) {
    throw new Error(`${player}'s ${cadence} rating is not settled (RD ${standing.rd}); set REHEARSAL_PLAYER and REHEARSAL_CADENCE to another public account`);
  }
  const target = standing.rating + CHESS_MILESTONE.shape.minimumClimb;
  const contract = getAddress(process.env.MILESTONE_GIFT_ADDRESS ?? "");
  const cookie = await cookieFor(funder);
  const terms = async (amount: bigint, days: number) => {
    const params = {
      funder: funder.address,
      refundTo: funder.address,
      recipientContactHash: NO_CONTACT_HASH,
      goalType: chessGoalType(cadence),
      shape: 0,
      target: BigInt(target),
      maximumStart: BigInt(startingCeiling(CHESS_MILESTONE.shape, target)),
      subject: ZERO_SUBJECT,
      durationDays: days,
      amount,
      salt: keccak256(toHex(`salt-${Math.random()}`)),
    };
    const message = receiveAuthorizationMessage({ funder: funder.address, escrow: contract, amount, nonce: milestoneFundingNonce(params) });
    const a = toContractAuthorization(message, await funder.signTypedData(receiveAuthorizationTypedData(message)));
    return {
      conditionId: "chess-rating",
      username: player,
      cadence,
      target,
      standing: standing.rating,
      standingReadAt: new Date().toISOString(),
      durationDays: days,
      amount: amount.toString(),
      refundTo: funder.address,
      salt: params.salt,
      recipientName: "Magnus",
      funderName: "Sam",
      authorization: { validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce, v: a.v, r: a.r, s: a.s },
    };
  };
  const create = async (body: unknown) => createRoute(new Request(`${ORIGIN}/api/gift/milestone/create`, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) }));

  let response = await create(await terms(5_000_000n, 30));
  const made = (await response.json()) as { giftId: string; claimUrl: string };
  console.log("STEP create route", response.status, JSON.stringify(made));
  const giftId = made.giftId;
  const token = new URL(made.claimUrl).searchParams.get("t") ?? "";

  const recipientCookie = await cookieFor(recipient);
  response = await claimRoute(new Request(`${ORIGIN}/api/gift/claim`, { method: "POST", headers: headers(recipientCookie), body: JSON.stringify({ giftId, token }) }));
  console.log("STEP claim route", response.status, await response.text());

  response = await accountRoute(new Request(`${ORIGIN}/api/gift/${giftId}/account`, { method: "POST", headers: headers(recipientCookie), body: "{}" }), { params: Promise.resolve({ id: giftId }) });
  const coded = (await response.json()) as { code: string };
  console.log("STEP code", response.status, JSON.stringify(coded));

  const live = liveMilestoneReadingDeps();
  const started = await runMilestoneReading({ giftId, purpose: "start" }, { ...live, attest: async (input) => ({ ...(await attestChessRating(input)), name: `Rehearsal ${coded.code}` }) });
  console.log("STEP start (real proofs)", JSON.stringify(started));

  response = await statusRoute(new Request(`${ORIGIN}/api/gift/${giftId}`, { headers: headers(recipientCookie) }), { params: Promise.resolve({ id: giftId }) });
  const view = (await response.json()) as Record<string, unknown>;
  console.log("STEP status", response.status, JSON.stringify({ phase: view.phase, startReading: view.startReading, target: view.target, maximumStart: view.maximumStart, deadlineMs: view.deadlineMs, todayReading: view.todayReading }));

  console.log("STEP reach below", JSON.stringify(await runMilestoneReading({ giftId, purpose: "reach", force: true }, live)));
  const now = Math.floor(Date.now() / 1_000);
  const reached = await runMilestoneReading(
    { giftId, purpose: "reach", force: true },
    {
      ...live,
      plain: async () => ({ username: standing.username, playerId: standing.playerId, rating: target + 6, ratedAt: now, rd: 42, best: target + 6 }),
      attest: async () => ({ username: standing.username, playerId: standing.playerId, name: null, mode: cadence, rating: target + 6, ratedAt: now, rd: 42, observedAt: now + 5, nullifier: keccak256(toHex("fed reading")), proofs: [] }),
    },
  );
  console.log("STEP reach at target (fed reading)", JSON.stringify(reached));

  const state = await readMilestoneGift(contract, giftId);
  const deadline = BigInt(now + 600);
  const intent = { giftId: BigInt(giftId), to: recipient.address, amount: state.earnedBalance, nonce: state.withdrawNonce, deadline };
  const signature: Hex = await recipient.signTypedData(milestoneWithdrawTypedData(contract, intent));
  response = await withdrawRoute(
    new Request(`${ORIGIN}/api/gift/withdraw`, {
      method: "POST",
      headers: headers(recipientCookie),
      body: JSON.stringify({ giftId, to: recipient.address, amount: intent.amount.toString(), nonce: intent.nonce.toString(), deadline: deadline.toString(), signature }),
    }),
  );
  console.log("STEP withdraw route", response.status, await response.text());
  console.log("STEP recipient AUSD", execSync(`cast call ${AUSD} "balanceOf(address)(uint256)" ${recipient.address} --rpc-url ${RPC}`).toString().trim());

  response = await mineRoute(new Request(`${ORIGIN}/api/gifts/mine`, { headers: headers(cookie) }));
  console.log("STEP mine", response.status, JSON.stringify(((await response.json()) as { gifts: Array<{ milestone?: { phase: string } }> }).gifts.map((gift) => gift.milestone?.phase)));

  response = await create(await terms(3_000_000n, 1));
  const second = (await response.json()) as { giftId: string };
  console.log("STEP second gift", response.status, second.giftId);
  execSync(`cast rpc evm_increaseTime ${14 * 86_400 + 6 * 3_600 + 60} --rpc-url ${RPC}`, { stdio: "ignore" });
  execSync(`cast rpc evm_mine --rpc-url ${RPC}`, { stdio: "ignore" });
  const chainNow = Number(execSync(`cast block latest -f timestamp --rpc-url ${RPC}`).toString().trim());
  console.log("STEP settling pass", JSON.stringify(await milestonePass(true, { ...liveMilestonePassDeps(), now: () => chainNow })));
  console.log("STEP funder AUSD after refund", execSync(`cast call ${AUSD} "balanceOf(address)(uint256)" ${funder.address} --rpc-url ${RPC}`).toString().trim());
  await db.close();
}

main().catch((error) => {
  console.error("REHEARSAL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
