import "../src/load-env";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { createPublicClient, createTestClient, encodeFunctionData, getAddress, http, keccak256, parseEther, toHex, type Abi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as endRoute } from "../app/api/gift/[id]/end/route";
import { POST as linkRoute } from "../app/api/gift/[id]/link/route";
import { GET as statusRoute } from "../app/api/gift/[id]/route";
import { POST as claimRoute } from "../app/api/gift/claim/route";
import { POST as createRoute } from "../app/api/gift/create/route";
import { POST as milestoneCreateRoute } from "../app/api/gift/milestone/create/route";
import { POST as withdrawRoute } from "../app/api/gift/withdraw/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { CHESS_SETTLED_RD_BELOW, chessGoalType, chessProviderId, type ChessMode } from "../src/chess-com";
import { readChessStanding } from "../src/chess-reading";
import { linkOfMade, prepareGift } from "../src/client/gift";
import { prepareMilestoneGift } from "../src/client/milestone";
import { giftLinkOf } from "../src/client/v2";
import { DUOLINGO_PUBLIC_PROVIDER_ID } from "../src/duolingo-public-terms";
import { signCheckIn } from "../src/gift-attestation";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { readGift } from "../src/gift-reader";
import { relayOpen } from "../src/gift-relay";
import { configureGiftStore, ensureGiftSchema } from "../src/gift-store";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import { CHESS_MILESTONE } from "../src/milestone-conditions";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { readMilestoneGift } from "../src/milestone-reader";
import { relayProve } from "../src/milestone-relay";
import { configureMilestoneStore, ensureMilestoneSchema } from "../src/milestone-store";
import { monadChain } from "../src/monad/chain";
import type { SqlExecutor } from "../src/proof-session-store";
import { relay, RelayerError } from "../src/relayer";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { endTypedData, openingAccount, openTypedData, withdrawTypedDataV2 } from "../src/v2-protocol";
import { EARLIER_GIFT_ESCROW, GIFT_ESCROW, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * The second version of the gift contracts, rehearsed from end to end on a local fork of Monad mainnet before anything
 * is sent to mainnet itself (the audit of 1 Oct 2026). Everything runs as production would run it, the routes and the
 * browser's own signing code included, except: the chain is a local fork, the database is PGlite in memory (never the
 * production one), every key is made here and thrown away, and the readings are fed, because nobody learns a lesson or
 * climbs a rating on demand.
 *
 * What it walks, in order:
 *   1. the owner closes creation on the three contracts in service (the Safe, impersonated on the fork);
 *   2. `scripts/deploy-v2.ts` deploys the three new contracts, registers every goal, opens them and hands them over;
 *   3. the owner accepts the three;
 *   4. a daily gift: made with a link the funder's code makes, found again as on another device, refused to the
 *      evidence key, opened with the link's key, read, paid out, then ended by the person it is for;
 *   5. a milestone gift: made, opened with the link's key, started, then ended; and a second one reached and paid.
 *
 * No key of production is used: the relayer, the evidence signer, the deployer, the funder and the recipient are all
 * made here. It refuses any node but the local fork.
 *
 * Usage:
 *   anvil --fork-url https://rpc.monad.xyz --network monad --port 8547 --block-time 0.1
 *   forge build && SESSION_SIGNING_SECRET=<32 bytes or more> pnpm rehearse:v2
 */

const RPC = "http://127.0.0.1:8547";
const ORIGIN = "https://viky.test";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const;
const POOL = "0x942644106B073E30D72c2C5D7529D5C296ea91ab" as const;
const SAFE = "0xE08D926c148A5065F4Df2892702785a183de86F9" as const;
const DAY = 86_400;
type Account = ReturnType<typeof privateKeyToAccount>;

const erc20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const ownable = [
  { type: "function", name: "acceptOwnership", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

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

function expect(condition: unknown, what: string): void {
  if (!condition) throw new Error(`EXPECTED: ${what}`);
  console.log(`  ok   ${what}`);
}

async function main() {
  // Every key is made here. Nothing of production signs anything, whatever .env.local holds: the server's own code
  // reads these names when it is first asked, which is after this line.
  const relayerKey = generatePrivateKey();
  const evidenceKey = generatePrivateKey();
  const deployerKey = generatePrivateKey();
  const relayer = privateKeyToAccount(relayerKey);
  const evidence = privateKeyToAccount(evidenceKey);
  const deployer = privateKeyToAccount(deployerKey);
  process.env.MONAD_RPC_URL = RPC;
  process.env.NEXT_PUBLIC_MONAD_RPC_URL = RPC;
  process.env.RELAYER_PRIVATE_KEY = relayerKey;
  process.env.EVIDENCE_SIGNER_PRIVATE_KEY = evidenceKey;
  delete process.env.DATABASE_URL;
  delete process.env.ZKFETCH_WORKER_URL;
  delete process.env.RESEND_API_KEY;
  // The address a link is built on, where a browser would read its own.
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
  if (!process.env.SESSION_SIGNING_SECRET) throw new Error("Set SESSION_SIGNING_SECRET to any 32 bytes or more");

  const publicClient = createPublicClient({ chain: monadChain, transport: http(RPC) });
  const test = createTestClient({ chain: monadChain, mode: "anvil", transport: http(RPC) });
  if ((await publicClient.getChainId()) !== 143) throw new Error("Refusing: the local node is not a fork of Monad mainnet");
  const chainNow = async () => Number((await publicClient.getBlock()).timestamp);
  const warpTo = async (timestamp: number) => {
    await test.setNextBlockTimestamp({ timestamp: BigInt(timestamp) });
    await test.mine({ blocks: 1 });
  };
  /** One call from an account the fork lets us speak as: the Safe and the pool that lends the test its AUSD. */
  const as = async (from: Hex, to: Hex, data: Hex) => {
    await test.impersonateAccount({ address: from });
    await test.setBalance({ address: from, value: parseEther("100") });
    const hash = await test.sendUnsignedTransaction({ from, to, data });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`the call from ${from} to ${to} reverted`);
    await test.stopImpersonatingAccount({ address: from });
  };
  const ausdOf = (who: Hex) => publicClient.readContract({ address: AUSD, abi: erc20, functionName: "balanceOf", args: [who] });
  for (const account of [relayer, deployer]) await test.setBalance({ address: account.address, value: parseEther("100") });

  console.log("STEP 1: the owner closes creation on the three contracts in service");
  for (const [address, abi] of [[GIFT_ESCROW, giftEscrowAbi], [EARLIER_GIFT_ESCROW, giftEscrowAbi], [MILESTONE_GIFT, milestoneGiftAbi]] as const) {
    await as(SAFE, address, encodeFunctionData({ abi: abi as unknown as Abi, functionName: "setCreationPaused", args: [true] }));
  }
  expect(await publicClient.readContract({ address: GIFT_ESCROW, abi: giftEscrowAbi as unknown as Abi, functionName: "creationPaused" }), "creation is closed on the daily contract in service");

  console.log("STEP 2: deploy the second version (scripts/deploy-v2.ts, REHEARSAL)");
  const deployed = execSync("npx tsx scripts/deploy-v2.ts", {
    env: {
      ...process.env,
      REHEARSAL: "1",
      DRY_RUN: "",
      DEPLOYER_PRIVATE_KEY: deployerKey,
      OWNER_ADDRESS: SAFE,
      EVIDENCE_SIGNER_ADDRESS: evidence.address,
      EVIDENCE_SIGNER_PRIVATE_KEY: evidenceKey,
      RELAYER_ADDRESS: relayer.address,
      MONAD_RPC_URL: RPC,
      NEXT_PUBLIC_MONAD_RPC_URL: RPC,
    },
    encoding: "utf8",
    maxBuffer: 16 * 1_024 * 1_024,
  });
  const addressOf = (name: string) => getAddress(String(new RegExp(`${name}=(0x[0-9a-fA-F]{40})`).exec(deployed)?.[1]));
  const daily = addressOf("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS");
  const milestone = addressOf("NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS");
  const anchor = addressOf("NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS");
  console.log(`  deployed: daily ${daily}, milestone ${milestone}, anchor ${anchor}`);
  expect((deployed.match(/"step":"(daily|milestone): register goal/g) ?? []).length === 37, "37 goals were registered: 4 daily and 33 milestone");

  console.log("STEP 3: the owner accepts the three");
  for (const address of [daily, milestone, anchor]) {
    await as(SAFE, address, encodeFunctionData({ abi: ownable, functionName: "acceptOwnership" }));
    expect(getAddress(String(await publicClient.readContract({ address, abi: ownable, functionName: "owner" }))) === SAFE, `${address} is owned by the Safe`);
  }

  // From here the app is told where the second version is, as the three settings will tell it.
  process.env.NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS = daily;
  process.env.NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS = milestone;
  process.env.NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS = anchor;

  const db = new PGlite();
  const exec: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(exec);
  configureMilestoneStore(exec);
  configureRelayCeilingStore(exec);
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  await ensureRelayCeilingSchema();

  const funder = privateKeyToAccount(generatePrivateKey());
  const recipient = privateKeyToAccount(generatePrivateKey());
  const thief = privateKeyToAccount(generatePrivateKey());
  await as(POOL, AUSD, encodeFunctionData({ abi: erc20, functionName: "transfer", args: [funder.address, 40_000_000n] }));
  const funderCookie = await cookieFor(funder);
  const recipientCookie = await cookieFor(recipient);
  const post = (route: (request: Request) => Promise<Response>, path: string, cookie: string, body: unknown) =>
    route(new Request(`${ORIGIN}${path}`, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) }));
  const postFor = (route: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>, id: string, path: string, cookie: string, body: unknown) =>
    route(new Request(`${ORIGIN}${path}`, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  const statusOf = async (id: string, cookie: string) =>
    (await (await statusRoute(new Request(`${ORIGIN}/api/gift/${id}`, { headers: headers(cookie) }), { params: Promise.resolve({ id }) })).json()) as Record<string, unknown>;
  /** The opening as the recipient's browser makes it: the link's own key signs which account the gift opens for. */
  const opening = async (kind: "daily" | "milestone", contract: Hex, id: string, who: Hex, secret: string) => {
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + 600);
    return { deadline: deadline.toString(), signature: await openingAccount(secret).signTypedData(openTypedData(kind, contract, { giftId: BigInt(id), recipient: who, deadline })) };
  };

  console.log("STEP 4: a daily gift on the second version");
  const request = await prepareGift({ account: funder, goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_004n });
  expect(request.openingKey && request.linkFingerprint && !("linkSecret" in request), "the request carries the opening key's address and the link's fingerprint, and no secret");
  let response = await post(createRoute, "/api/gift/create", funderCookie, request);
  const made = (await response.json()) as { giftId: string; claimUrl: string | null; funded: boolean; error?: string };
  expect(response.status === 200 && made.claimUrl === null, `the gift is made (${made.giftId}) and the server answers no link: it never held one${made.error ? ` (${made.error})` : ""}`);
  const giftId = made.giftId;
  const link = await linkOfMade(funder, made, request.salt);
  const secret = String(new URL(link).searchParams.get("t"));
  const state = await readGift(daily, giftId);
  expect(state.version === 2 && state.openingKey?.toLowerCase() === openingAccount(secret).address.toLowerCase(), "the contract holds the address of the key the link makes");
  expect((await ausdOf(daily)) === 7_000_004n, "the real AUSD arrived on the second version's contract");

  response = await postFor(linkRoute, giftId, `/api/gift/${giftId}/link`, funderCookie, { find: true });
  const found = (await response.json()) as { salt?: Hex };
  expect(response.status === 200 && found.salt === request.salt, "on another device, the server answers the gift's salt, which is public");
  expect((await giftLinkOf(funder, found.salt as Hex, giftId)) === link, "and the funder's account makes the same link from it");

  // The theft the audit proved on the first version: the evidence key signs the opening for an account of its own.
  const stolen = await opening("daily", daily, giftId, thief.address, "not-the-link-key-0123456789");
  response = await post(claimRoute, "/api/gift/claim", await cookieFor(thief), { giftId, opening: stolen });
  expect(response.status === 404, "an opening signed by another key is refused by the route");
  const deadline = BigInt((await chainNow()) + 600);
  const byEvidence = await evidence.signTypedData(openTypedData("daily", daily, { giftId: BigInt(giftId), recipient: thief.address, deadline }));
  const refusal = await relayOpen({ giftId, escrow: daily, recipient: thief.address, deadline, signature: byEvidence }).then(() => null, (error: unknown) => error);
  expect(refusal instanceof RelayerError && refusal.contractError === "InvalidOpeningSignature", "and the contract refuses the evidence key's own signature: InvalidOpeningSignature");

  response = await post(claimRoute, "/api/gift/claim", recipientCookie, { giftId, opening: await opening("daily", daily, giftId, recipient.address, secret) });
  expect(response.status === 200 && (await readGift(daily, giftId)).recipient?.toLowerCase() === recipient.address.toLowerCase(), "the link's key opens the gift for the person who holds the link");
  let status = await statusOf(giftId, recipientCookie);
  expect(status.version === 2 && (status.end as { keep: string; giveBack: string }).giveBack === "7000004", "its status offers the ending: nothing kept yet, 7.000004 would go back");

  console.log("STEP 4b: two milestone gifts made and opened on the second version");
  const player = process.env.REHEARSAL_PLAYER?.trim() || "magnuscarlsen";
  const cadence = (process.env.REHEARSAL_CADENCE?.trim() || "bullet") as ChessMode;
  const standing = await readChessStanding(player, cadence);
  if (standing.rating === null || standing.rd === null || standing.rd >= CHESS_SETTLED_RD_BELOW) {
    throw new Error(`${player}'s ${cadence} rating is not settled (RD ${standing.rd}); set REHEARSAL_PLAYER and REHEARSAL_CADENCE to another public account`);
  }
  const target = standing.rating + CHESS_MILESTONE.shape.minimumClimb;
  const climb = async (amount: bigint) => {
    const prepared = await prepareMilestoneGift({ account: funder, milestone: CHESS_MILESTONE, cadenceGoalType: chessGoalType(cadence), cadence, username: player, standing: standing.rating as number, standingReadAt: new Date().toISOString(), target, durationDays: 30, amount });
    const answer = await post(milestoneCreateRoute, "/api/gift/milestone/create", funderCookie, prepared);
    const body = (await answer.json()) as { giftId: string; claimUrl: string | null; funded: boolean; error?: string };
    if (answer.status !== 200) throw new Error(`the milestone gift was not made: ${body.error}`);
    const itsLink = await linkOfMade(funder, body, prepared.salt);
    const itsSecret = String(new URL(itsLink).searchParams.get("t"));
    const opened = await post(claimRoute, "/api/gift/claim", recipientCookie, { giftId: body.giftId, opening: await opening("milestone", milestone, body.giftId, recipient.address, itsSecret) });
    if (opened.status !== 200) throw new Error(`the milestone gift was not opened: ${await opened.text()}`);
    return body.giftId;
  };
  // Made and opened now, before the fork's clock is moved: what a funder signs is good for minutes of real time.
  const ended = await climb(5_000_000n);
  const reached = await climb(3_000_000n);
  expect((await readMilestoneGift(milestone, ended)).version === 2 && (await ausdOf(milestone)) === 8_000_000n, "two milestone gifts are made and opened on the second version");

  /** A reading, attested by the evidence signer under the second version's domain, at the fork's own time. */
  const read = async (metric: bigint) => {
    const now = await chainNow();
    const message = {
      giftId: BigInt(giftId),
      recipient: recipient.address,
      identityHash: keccak256(toHex("rehearsal identity")),
      providerId: DUOLINGO_PUBLIC_PROVIDER_ID,
      metricValue: metric,
      observedAt: BigInt(now),
      nullifier: keccak256(toHex(`rehearsal ${now} ${metric}`)),
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + 300),
    };
    return relay("checkIn", [giftId, { ...message, signature: await signCheckIn(message, daily) }], daily);
  };
  await read(1_000n);
  const day0 = Math.floor((await chainNow()) / DAY);
  // Two days done, read by the pass of the third morning.
  await warpTo((day0 + 3) * DAY + 30 * 60);
  await read(1_020n);
  expect((await readGift(daily, giftId)).creditedDays === 2, "two days are counted");

  const earned = (await readGift(daily, giftId)).earnedBalance;
  let intentDeadline = BigInt((await chainNow()) + 600);
  let nonce = (await readGift(daily, giftId)).withdrawNonce;
  response = await post(withdrawRoute, "/api/gift/withdraw", recipientCookie, {
    giftId,
    to: recipient.address,
    amount: "1000000",
    nonce: nonce.toString(),
    deadline: intentDeadline.toString(),
    signature: await recipient.signTypedData(withdrawTypedDataV2("daily", daily, { giftId: BigInt(giftId), to: recipient.address, amount: 1_000_000n, nonce, deadline: intentDeadline })),
  });
  expect(response.status === 200 && earned === 2_000_000n && (await ausdOf(recipient.address)) === 1_000_000n, "one day is paid out on the recipient's signed intent");

  status = await statusOf(giftId, recipientCookie);
  const offer = status.end as { keep: string; giveBack: string; nonce: string };
  expect(offer.keep === "2000000" && offer.giveBack === "5000004", "the ending now says: keep 2.00, 5.000004 goes back");
  const funderBefore = await ausdOf(funder.address);
  intentDeadline = BigInt((await chainNow()) + 600);
  const endMessage = { giftId: BigInt(giftId), keep: BigInt(offer.keep), giveBack: BigInt(offer.giveBack), nonce: BigInt(offer.nonce), deadline: intentDeadline };
  response = await postFor(endRoute, giftId, `/api/gift/${giftId}/end`, await cookieFor(thief), { ...stringsOf(endMessage), signature: await thief.signTypedData(endTypedData("daily", daily, endMessage)) });
  expect(response.status === 403, "nobody but the person it is for can end it");
  response = await postFor(endRoute, giftId, `/api/gift/${giftId}/end`, recipientCookie, { ...stringsOf(endMessage), signature: await recipient.signTypedData(endTypedData("daily", daily, endMessage)) });
  expect(response.status === 200 && (await ausdOf(funder.address)) === funderBefore + 5_000_004n, "the person it is for ends it: 5.000004 came back to the funder in that transaction");
  status = await statusOf(giftId, recipientCookie);
  expect(status.finished === true && status.ended !== null && status.end === null, "the gift says it was ended, and offers no ending any more");
  const afterEnd = await read(1_040n).then(() => null, (error: unknown) => error);
  expect(afterEnd instanceof RelayerError && afterEnd.contractError === "AlreadyFinalised", "nothing is read for it any more: AlreadyFinalised");
  expect((await ausdOf(daily)) === 1_000_000n, "the contract holds exactly the day that is still theirs to take");

  console.log("STEP 5: the two milestone gifts, started, ended and reached");
  const prove = async (id: string, rating: number) => {
    const now = await chainNow();
    return relayProve({
      contract: milestone,
      message: { giftId: BigInt(id), recipient: recipient.address, identityHash: keccak256(toHex("rehearsal player")), providerId: chessProviderId(cadence), metricValue: BigInt(rating), eventAt: 0n, observedAt: BigInt(now), nullifier: keccak256(toHex(`proof ${id} ${now} ${rating}`)), issuedAt: BigInt(now), expiresAt: BigInt(now + 300) },
    });
  };
  expect((await prove(ended, standing.rating)).happened === "started", "a first reading starts the climb");

  const before = await ausdOf(funder.address);
  nonce = (await readMilestoneGift(milestone, ended)).withdrawNonce;
  intentDeadline = BigInt((await chainNow()) + 600);
  const endOfClimb = { giftId: BigInt(ended), keep: 0n, giveBack: 5_000_000n, nonce, deadline: intentDeadline };
  response = await postFor(endRoute, ended, `/api/gift/${ended}/end`, recipientCookie, { ...stringsOf(endOfClimb), signature: await recipient.signTypedData(endTypedData("milestone", milestone, endOfClimb)) });
  expect(response.status === 200 && (await ausdOf(funder.address)) === before + 5_000_000n, "ended by the person it is for: the whole 5.00 came back at once");
  expect((await statusOf(ended, recipientCookie)).ended !== null, "and its status says it was ended");

  await prove(reached, standing.rating);
  expect((await prove(reached, target + 6)).happened === "reached", "the other one is reached");
  nonce = (await readMilestoneGift(milestone, reached)).withdrawNonce;
  intentDeadline = BigInt((await chainNow()) + 600);
  const balanceBefore = await ausdOf(recipient.address);
  response = await post(withdrawRoute, "/api/gift/withdraw", recipientCookie, {
    giftId: reached,
    to: recipient.address,
    amount: "3000000",
    nonce: nonce.toString(),
    deadline: intentDeadline.toString(),
    signature: await recipient.signTypedData(withdrawTypedDataV2("milestone", milestone, { giftId: BigInt(reached), to: recipient.address, amount: 3_000_000n, nonce, deadline: intentDeadline })),
  });
  expect(response.status === 200 && (await ausdOf(recipient.address)) === balanceBefore + 3_000_000n, "and its whole 3.00 is paid out on the recipient's signed intent");
  const notEndable = { giftId: BigInt(reached), keep: 0n, giveBack: 3_000_000n, nonce: nonce + 1n, deadline: intentDeadline };
  response = await postFor(endRoute, reached, `/api/gift/${reached}/end`, recipientCookie, { ...stringsOf(notEndable), signature: await recipient.signTypedData(endTypedData("milestone", milestone, notEndable)) });
  expect(response.status === 409, "a gift already reached cannot be ended: it is theirs");
  expect((await ausdOf(milestone)) === 0n, "the milestone contract holds nothing of either gift");

  await db.close();
  console.log("\nREHEARSAL PASSED: every step above ran on the fork, with the real AUSD.");
}

function stringsOf(message: { keep: bigint; giveBack: bigint; nonce: bigint; deadline: bigint }) {
  return { keep: message.keep.toString(), giveBack: message.giveBack.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() };
}

main().catch((error) => {
  console.error("REHEARSAL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
