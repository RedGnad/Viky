import "../src/load-env";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { createEd25519SigningSession } from "@category-labs/mera";
import { createPublicClient, createTestClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, padHex, parseEther, toHex, type Abi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as bindRoute } from "../app/api/gift/[id]/bind/route";
import { GET as consentRoute, POST as consentPostRoute } from "../app/api/gift/[id]/consent/route";
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
import { consentBytes, toHex as bytesToHex } from "../src/consent";
import { consentAnchorAbi } from "../src/consent-anchor-abi";
import { configureConsentStore, consentHistory } from "../src/consent-store";
import { logsBetween, readingsIn, verdictOf } from "../src/consent-verify";
import { DUOLINGO_PUBLIC_PROVIDER_ID } from "../src/duolingo-public-terms";
import { signCheckIn } from "../src/gift-attestation";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { readGift } from "../src/gift-reader";
import { relayOpen } from "../src/gift-relay";
import { configureGiftStore, ensureGiftSchema } from "../src/gift-store";
import { holdTheStart } from "../src/held-start";
import { configureHeldStartStore } from "../src/held-start-store";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import { CHESS_MILESTONE } from "../src/milestone-conditions";
import { DAILY_GOALS } from "../src/daily-goals";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { readMilestoneGift } from "../src/milestone-reader";
import { relayProve } from "../src/milestone-relay";
import { configureMilestoneStore, ensureMilestoneSchema } from "../src/milestone-store";
import { monadChain } from "../src/monad/chain";
import type { SqlExecutor } from "../src/proof-session-store";
import { relay, RelayerError } from "../src/relayer";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { consentAnchorMessage, consentKeyTypedData, consentTextDigest, endTypedData, openingAccount, openingSecretOf, openTypedData, previewTokenOf, startTypedData, withdrawTypedDataV2 } from "../src/v2-protocol";
import { StartNotSigned } from "../src/v2-start";
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
 *   2. `scripts/deploy-v2.ts` deploys the three new contracts, registers every goal, opens them and hands them over,
 *      with no private key of the evidence signer: its address is checked against the contracts in service;
 *   3. the Safe accepts the three through `scripts/safe-action.ts` itself, built, signed by two keys and sent, and
 *      `scripts/check-v2-handover.ts` says the three are the Safe's before the app is told where they are;
 *   4. a daily gift: made with a link the funder's code makes, found again as on another device, refused to the
 *      evidence key, opened with the link's key, its first reading refused to the evidence key alone and taken with
 *      the recipient's own signature, read, paid out, then ended by the person it is for;
 *   5. a milestone gift: made, opened with the link's key, its start read, held, signed by the recipient's account
 *      and sent by the route, then ended; and a second one reached and paid;
 *   5b. the owner's pause on the second version, through `scripts/safe-action.ts`: sent once, and a second one
 *      refused by the tool before anybody signs it, while it runs and in the week that follows its end;
 *   6. the recipient's yes and stop, written on the anchor by the consent route with no step of its own, and then
 *      `pnpm verify:consent`'s own check over the whole fork: the gift read under a yes passes, and a gift read with
 *      no yes anchored before it is named, even once a yes is anchored after the fact;
 *   7. last, a goal registered outside the register, which the hand-over check names among the 255 numbers it reads.
 *
 * No key of production is used: the relayer, the evidence signer, the deployer, the funder and the recipient are all
 * made here. So are the two keys that sign for the Safe: on the fork, and nowhere else, the Safe's own list of owners
 * is rewritten to those two, so the tool that signs for it can be run for real. The evidence signer of the three
 * contracts in service is set to the one made here, as the Safe would, so the deployment's own check of it is walked.
 * It refuses any node but the local fork.
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
/** Lock-In's Safe, which lives on Monad mainnet too: a real Safe that owns nothing of Viky's and is offered nothing. */
const SAFE_OF_ANOTHER = "0xf1be884698B9Ba4438f529699eC92320427b4dA1" as const;
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
  // The contracts in service, which the fork holds as mainnet does: named here, from the repository's own list, and
  // never left to whatever .env.local holds. Without them the opening route answers "not configured", and the
  // rehearsal passed only on a machine whose own file named them (the delta re-read of 2 Oct 2026).
  process.env.GIFT_ESCROW_ADDRESS = GIFT_ESCROW;
  process.env.MILESTONE_GIFT_ADDRESS = MILESTONE_GIFT;
  delete process.env.DATABASE_URL;
  delete process.env.ZKFETCH_WORKER_URL;
  delete process.env.RESEND_API_KEY;
  // The address a link is built on, where a browser would read its own.
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
  if (!process.env.SESSION_SIGNING_SECRET) throw new Error("Set SESSION_SIGNING_SECRET to any 32 bytes or more");

  const publicClient = createPublicClient({ chain: monadChain, transport: http(RPC) });
  const test = createTestClient({ chain: monadChain, mode: "anvil", transport: http(RPC) });
  if ((await publicClient.getChainId()) !== 143) throw new Error("Refusing: the local node is not a fork of Monad mainnet");
  // Where the fork begins: the public check of step 6 reads every log from here.
  const firstBlock = await publicClient.getBlockNumber();
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

  // The Safe of the fork answers to two keys made here: its owners are a linked list in its own storage (slot 2, from
  // the sentinel 0x1), with their number in slot 3 and the threshold in slot 4 (Safe 1.4.1).
  /** An address nobody here answers to: named where an owner or a signer that is not the right one is tried. */
  const thiefOfOwnership = privateKeyToAccount(generatePrivateKey()).address;
  const safeKeys = [generatePrivateKey(), generatePrivateKey()] as const;
  const [safeOne, safeTwo] = safeKeys.map((key) => privateKeyToAccount(key));
  const ownerSlot = (owner: Hex) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, 2n]));
  const word = (value: Hex | bigint) => padHex(typeof value === "bigint" ? toHex(value) : value, { size: 32 });
  const SENTINEL = "0x0000000000000000000000000000000000000001" as const;
  for (const [index, value] of [
    [ownerSlot(SENTINEL), word(safeOne.address)],
    [ownerSlot(safeOne.address), word(safeTwo.address)],
    [ownerSlot(safeTwo.address), word(SENTINEL)],
    [word(3n), word(2n)],
    [word(4n), word(2n)],
  ] as const) {
    await test.setStorageAt({ address: SAFE, index, value });
  }
  await test.setBalance({ address: safeOne.address, value: parseEther("100") });
  /** One action of the Safe through the tool itself: built, signed by each key where it lives, then sent. */
  const safeAction = (env: Record<string, string>, more: Record<string, string> = {}) => {
    try {
      return { ok: true, out: execSync("npx tsx scripts/safe-action.ts", { env: { ...process.env, REHEARSAL: "1", SAFE_ADDRESS: SAFE, MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC, SIGN: "", SEND: "", SIGNATURES: "", SIGNER_PRIVATE_KEY: "", NONCE: "", ...env, ...more }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { ok: false, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  const bySafe = (env: Record<string, string>) => {
    const built = safeAction(env);
    if (!built.ok) return built;
    const nonce = String(/"nonce": "(\d+)"/.exec(built.out)?.[1]);
    const signatures = safeKeys.map((key) => String(/"signature": "(0x[0-9a-f]+)"/.exec(safeAction(env, { SIGN: "1", SIGNER_PRIVATE_KEY: key, NONCE: nonce }).out)?.[1]));
    return safeAction(env, { SIGNATURES: signatures.join(","), SEND: "1", EXECUTOR_PRIVATE_KEY: safeKeys[0], NONCE: nonce });
  };

  console.log("STEP 1: the owner closes creation on the three contracts in service");
  for (const [address, abi] of [[GIFT_ESCROW, giftEscrowAbi], [EARLIER_GIFT_ESCROW, giftEscrowAbi], [MILESTONE_GIFT, milestoneGiftAbi]] as const) {
    await as(SAFE, address, encodeFunctionData({ abi: abi as unknown as Abi, functionName: "setCreationPaused", args: [true] }));
  }
  expect(await publicClient.readContract({ address: GIFT_ESCROW, abi: giftEscrowAbi as unknown as Abi, functionName: "creationPaused" }), "creation is closed on the daily contract in service");
  // The deployment reads the evidence signer on the contracts in service and takes nobody's word for it. The one made
  // here is not theirs, so it is refused; then the fork's contracts are given it, as the Safe would, and it passes.
  const deployEnv = { ...process.env, REHEARSAL: "1", DRY_RUN: "", DEPLOYER_PRIVATE_KEY: deployerKey, OWNER_ADDRESS: SAFE, EVIDENCE_SIGNER_ADDRESS: evidence.address, EVIDENCE_SIGNER_PRIVATE_KEY: "", RELAYER_ADDRESS: relayer.address, MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC };
  const deploy = (env: NodeJS.ProcessEnv) => {
    try {
      return { ok: true, out: execSync("npx tsx scripts/deploy-v2.ts", { env, encoding: "utf8", maxBuffer: 16 * 1_024 * 1_024, stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { ok: false, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  const otherSigner = deploy(deployEnv);
  expect(!otherSigner.ok && otherSigner.out.includes("takes its readings from"), "the deployment refuses a signer that is not the one the contracts in service hold, read on the chain");
  for (const [address, abi] of [[GIFT_ESCROW, giftEscrowAbi], [EARLIER_GIFT_ESCROW, giftEscrowAbi], [MILESTONE_GIFT, milestoneGiftAbi]] as const) {
    await as(SAFE, address, encodeFunctionData({ abi: abi as unknown as Abi, functionName: "setEvidenceSigner", args: [evidence.address] }));
  }
  const otherOwner = deploy({ ...deployEnv, OWNER_ADDRESS: thiefOfOwnership });
  expect(!otherOwner.ok && otherOwner.out.includes("is owned by"), "and an owner that is not the one they answer to");
  const notRehearsal = deploy({ ...deployEnv, REHEARSAL: "" });
  expect(!notRehearsal.ok && notRehearsal.out.includes("is a local node, and this is not a rehearsal"), "and a local node when it is not told this is a rehearsal");

  console.log("STEP 2: deploy the second version (scripts/deploy-v2.ts, REHEARSAL)");
  const ran = deploy(deployEnv);
  if (!ran.ok) throw new Error(`the deployment failed: ${ran.out.slice(-600)}`);
  const deployed = ran.out;
  const addressOf = (name: string) => getAddress(String(new RegExp(`${name}=(0x[0-9a-fA-F]{40})`).exec(deployed)?.[1]));
  const daily = addressOf("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS");
  const milestone = addressOf("NEXT_PUBLIC_MILESTONE_GIFT_V2_ADDRESS");
  const anchor = addressOf("NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS");
  console.log(`  deployed: daily ${daily}, milestone ${milestone}, anchor ${anchor}`);
  expect((deployed.match(/"step":"(daily|milestone): register goal/g) ?? []).length === 37, "37 goals were registered: 4 daily and 33 milestone");
  expect((deployed.match(/WRITE DOWN: (GiftEscrowV2|MilestoneGiftV2|ConsentAnchor) is at 0x[0-9a-fA-F]{40}/g) ?? []).length === 3, "each address was printed the moment it existed");
  expect(!/open (check-ins|proofs)/.test(deployed), "no pause was spent at deployment: readings need no opening");

  console.log("STEP 3: the Safe accepts the three, with its own tool, and the hand-over is read before the app is told");
  const handover = (said: Record<string, string> = {}) => {
    try {
      return { ok: true, out: execSync("npx tsx scripts/check-v2-handover.ts", { env: { ...process.env, REHEARSAL: "1", MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC, DAILY_V2: daily, MILESTONE_V2: milestone, ANCHOR: anchor, OWNER_ADDRESS: SAFE, EVIDENCE_SIGNER_ADDRESS: evidence.address, RELAYER_ADDRESS: relayer.address, ...said }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { ok: false, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  const early = handover();
  expect(!early.ok && early.out.includes("The Safe has not accepted it yet") && !early.out.includes("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS="), "before the Safe accepts, the hand-over check prints no setting");
  // The review of 2 Oct 2026, R-05: the deploying key is still the owner here. A signer it announces now is called off
  // by the acceptance itself.
  const announce = [{ type: "function", name: "setEvidenceSigner", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }] as const;
  await test.impersonateAccount({ address: deployer.address });
  await publicClient.waitForTransactionReceipt({ hash: await test.sendUnsignedTransaction({ from: deployer.address, to: daily, data: encodeFunctionData({ abi: announce, functionName: "setEvidenceSigner", args: [thiefOfOwnership] }) }) });
  await test.stopImpersonatingAccount({ address: deployer.address });
  const offeredElsewhere = safeAction({ ACTION: "accept-ownership", TARGET: "escrow-v2", TARGET_ADDRESS: daily }, { SAFE_ADDRESS: SAFE_OF_ANOTHER });
  expect(!offeredElsewhere.ok, "the tool builds no acceptance for a Safe the ownership was not offered to");
  for (const [target, address] of [["escrow-v2", daily], ["milestone-v2", milestone], ["anchor", anchor]] as const) {
    const accepted = bySafe({ ACTION: "accept-ownership", TARGET: target, TARGET_ADDRESS: address });
    expect(accepted.ok && accepted.out.includes('"step": "read back"') && getAddress(String(await publicClient.readContract({ address, abi: ownable, functionName: "owner" }))) === SAFE, `${target}: accepted by the Safe through pnpm safe:action, signed by its two keys`);
  }
  const twice = safeAction({ ACTION: "accept-ownership", TARGET: "anchor", TARGET_ADDRESS: anchor });
  expect(!twice.ok && twice.out.includes("Nothing to accept"), "and an ownership already accepted is not asked for again");
  const handed = handover();
  expect(handed.ok && handed.out.includes(`NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS=${daily}`) && handed.out.includes(`NEXT_PUBLIC_CONSENT_ANCHOR_ADDRESS=${anchor}`), "the hand-over check passes: the Safe owns the three, no signer is waiting, and only now are the three settings printed");
  expect(handed.out.includes("no pause was sent, the anchor names the relayer, and every goal is the register's"), "and it read that no pause was sent, that the anchor names the relayer, and that each of the 255 goal numbers is the register's");
  expect(handed.out.includes(`"goals":"${DAILY_GOALS.length} registered of 255 numbers read"`) && handed.out.includes(`"goals":"${MILESTONE_GOALS.length} registered of 255 numbers read"`), `${DAILY_GOALS.length} daily goals and ${MILESTONE_GOALS.length} milestone goals were found among the 255 numbers of each contract`);
  // The relayer's address is the one thing the deployment takes on somebody's word: the check holds it to the anchor.
  const otherRelayer = handover({ RELAYER_ADDRESS: thiefOfOwnership });
  expect(!otherRelayer.ok && otherRelayer.out.includes(`ConsentAnchor: its anchorer is ${relayer.address}, not the relayer ${thiefOfOwnership}`) && !otherRelayer.out.includes("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS="), "an anchor that names another address than the relayer is said, and no setting is printed");

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
  configureConsentStore(exec);
  configureHeldStartStore(exec);
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

  /**
   * The recipient's yes or stop as their browser makes it (src/client/consent.ts): the consent key signs the text the
   * server wrote and the short message for the anchor, and, the first time, the account signs for the consent key.
   */
  const consentKey = createEd25519SigningSession({ privateKey: crypto.getRandomValues(new Uint8Array(32)) });
  const consentKeyHex = bytesToHex(consentKey.publicKey) as Hex;
  const say = async (kind: "yes" | "stop", id: string) => {
    const asked = await consentRoute(new Request(`${ORIGIN}/api/gift/${id}/consent`, { headers: headers(recipientCookie) }), { params: Promise.resolve({ id }) });
    const answer = (await asked.json()) as { texts?: { yes: string; stop: string }; anchor?: { contract: Hex; account: Hex; bound: boolean; sequence: number }; error?: string };
    if (asked.status !== 200 || !answer.texts || !answer.anchor) throw new Error(`the agreement of gift ${id} could not be read: ${answer.error ?? asked.status}`);
    const text = answer.texts[kind];
    const offered = answer.anchor;
    const message = consentAnchorMessage({ anchor: offered.contract, account: offered.account, giftId: id, kind, sequence: offered.sequence, digest: consentTextDigest(text) });
    const sent = await postFor(consentPostRoute, id, `/api/gift/${id}/consent`, recipientCookie, {
      kind,
      publicKey: consentKeyHex,
      signature: bytesToHex(await consentKey.signMessage(consentBytes(text))),
      anchor: {
        sequence: offered.sequence,
        signature: bytesToHex(await consentKey.signMessage(new TextEncoder().encode(message))),
        ...(offered.bound ? {} : { binding: await recipient.signTypedData(consentKeyTypedData(offered.contract, recipient.address, consentKeyHex)) }),
      },
    });
    if (sent.status !== 200) throw new Error(`the ${kind} of gift ${id} was not kept: ${await sent.text()}`);
    return offered;
  };
  const anchored = (id: string) => publicClient.readContract({ address: anchor, abi: consentAnchorAbi as unknown as Abi, functionName: "entryCount", args: [recipient.address, BigInt(id)] }) as Promise<bigint>;

  console.log("STEP 4: a daily gift on the second version");
  const request = await prepareGift({ account: funder, goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_004n });
  expect(request.openingKey && request.linkFingerprint && !("linkSecret" in request), "the request carries the opening key's address and the link's fingerprint, and no secret");
  let response = await post(createRoute, "/api/gift/create", funderCookie, request);
  const made = (await response.json()) as { giftId: string; claimUrl: string | null; funded: boolean; error?: string };
  expect(response.status === 200 && made.claimUrl === null, `the gift is made (${made.giftId}) and the server answers no link: it never held one${made.error ? ` (${made.error})` : ""}`);
  const giftId = made.giftId;
  const link = await linkOfMade(funder, made, request.salt);
  // The secret is what follows the link's `#`, which no server is sent. `?t=` carries the preview token made from it.
  const secret = String(openingSecretOf(new URL(link).hash));
  const token = String(new URL(link).searchParams.get("t"));
  expect(token === previewTokenOf(secret) && !`${new URL(link).pathname}${new URL(link).search}`.includes(secret), "the link carries its secret after the #, and a preview token in ?t=");
  const readAs = async (t: string) => statusRoute(new Request(`${ORIGIN}/api/gift/${giftId}?t=${t}`, { headers: headers() }), { params: Promise.resolve({ id: giftId }) });
  expect(((await (await readAs(token)).json()) as { names: unknown }).names !== null, "the preview token names the reader as holding the link");
  const refusedSecret = await readAs(secret);
  expect(refusedSecret.status === 400 && ((await refusedSecret.json()) as { code?: string }).code === "LINK_OUT_OF_DATE", "the secret itself, sent in ?t=, is refused: LINK_OUT_OF_DATE");
  expect(openingAccount(token).address.toLowerCase() !== openingAccount(secret).address.toLowerCase(), "and the key the preview token makes is not the gift's");
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

  // The recipient's yes, before anything is read: the route keeps it and writes it on the anchor, key first.
  const firstOffer = await say("yes", giftId);
  expect(firstOffer.bound === false && firstOffer.sequence === 0, "the first yes is offered the anchor: no key bound yet, place 0");
  expect(String(await publicClient.readContract({ address: anchor, abi: consentAnchorAbi as unknown as Abi, functionName: "consentKeyOf", args: [recipient.address] })).toLowerCase() === consentKeyHex.toLowerCase(), "the anchor holds the consent key, bound by the account's own signature");
  expect((await anchored(giftId)) === 1n && /^0x[0-9a-f]{64}$/.test((await consentHistory(giftId))[0].anchorTx ?? ""), "the yes is on the anchor, and its row names the transaction");

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
    const itsSecret = String(openingSecretOf(new URL(itsLink).hash));
    const opened = await post(claimRoute, "/api/gift/claim", recipientCookie, { giftId: body.giftId, opening: await opening("milestone", milestone, body.giftId, recipient.address, itsSecret) });
    if (opened.status !== 200) throw new Error(`the milestone gift was not opened: ${await opened.text()}`);
    return body.giftId;
  };
  // Made and opened now, before the fork's clock is moved: what a funder signs is good for minutes of real time.
  const ended = await climb(5_000_000n);
  const reached = await climb(3_000_000n);
  // A yes for the first of the two. The second is read with none, on purpose: step 6 must name it.
  expect((await say("yes", ended)).bound === true && (await anchored(ended)) === 1n, "a second gift's yes is anchored with the key already bound");
  expect((await readMilestoneGift(milestone, ended)).version === 2 && (await ausdOf(milestone)) === 8_000_000n, "two milestone gifts are made and opened on the second version");

  // The first reading as the app makes it (the review of 2 Oct 2026, R-15), before the fork's clock is moved: the
  // server reads and the relay will not send it, it is held, the recipient's account signs it as their browser would,
  // and the route sends what is held with that signature.
  const startedAt = await chainNow();
  const startOfEnded = { giftId: BigInt(ended), recipient: recipient.address, identityHash: keccak256(toHex("rehearsal player")), providerId: chessProviderId(cadence), metricValue: BigInt(standing.rating), eventAt: 0n, observedAt: BigInt(startedAt), nullifier: keccak256(toHex(`start ${ended}`)), issuedAt: BigInt(startedAt), expiresAt: BigInt(startedAt + 300) };
  const waiting = await relayProve({ contract: milestone, message: startOfEnded }).then(() => null, (error: unknown) => error);
  expect(waiting instanceof StartNotSigned && waiting.start.metricValue === BigInt(standing.rating), "the start of a climb is not sent without the recipient's signature: the relay says what is to be signed");
  const askedStart = await holdTheStart(waiting as StartNotSigned, {
    account: recipient.address,
    message: Object.fromEntries(Object.entries(startOfEnded).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])),
    after: { bindTo: "rehearsal-player", maximumStart: String(target) },
  });
  const signStart = (who: Account) =>
    who.signTypedData(startTypedData(askedStart.start.of, askedStart.start.contract, { giftId: BigInt(ended), identityHash: askedStart.start.identityHash, metricValue: BigInt(askedStart.start.metricValue), observedAt: BigInt(askedStart.start.observedAt) }));
  response = await postFor(bindRoute, ended, `/api/gift/${ended}/bind`, await cookieFor(thief), { startSignature: await signStart(thief) });
  expect(response.status === 403, "the route takes that signature from the person the gift is for, and from nobody else");
  response = await postFor(bindRoute, ended, `/api/gift/${ended}/bind`, recipientCookie, { startSignature: await signStart(thief) });
  expect(((await response.json()) as { kind?: string; code?: string }).code === "NOT_SIGNED_BY_YOU" && /^0x0{64}$/.test((await readMilestoneGift(milestone, ended)).identityHash), "a signature that is not theirs sends nothing");
  response = await postFor(bindRoute, ended, `/api/gift/${ended}/bind`, recipientCookie, { startSignature: await signStart(recipient) });
  const startedOutcome = (await response.json()) as { kind?: string; rating?: number; code?: string; message?: string };
  expect(response.status === 200 && startedOutcome.kind === "started" && startedOutcome.rating === standing.rating, `signed by the recipient's account, the held reading is sent and the climb starts${startedOutcome.message ? ` (${startedOutcome.code}: ${startedOutcome.message})` : ""}`);
  expect((await readMilestoneGift(milestone, ended)).startingValue === BigInt(standing.rating), "the contract holds the start they signed");
  response = await postFor(bindRoute, ended, `/api/gift/${ended}/bind`, recipientCookie, { startSignature: await signStart(recipient) });
  expect(((await response.json()) as { code?: string }).code === "NOTHING_HELD", "and nothing is held any more");

  /**
   * A reading, attested by the evidence signer under the second version's domain, at the fork's own time. `signedBy`
   * is who signs it beside the evidence signer: the recipient's account on the first reading, nobody on the others.
   */
  const read = async (metric: bigint, signedBy?: Account) => {
    const now = await chainNow();
    const message = {
      giftId: BigInt(giftId),
      recipient: recipient.address,
      identityHash: keccak256(toHex("rehearsal identity")),
      providerId: DUOLINGO_PUBLIC_PROVIDER_ID,
      metricValue: metric,
      observedAt: BigInt(now),
      nullifier: keccak256(toHex(`rehearsal ${now} ${metric} ${signedBy?.address ?? ""}`)),
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + 300),
    };
    const start = { giftId: message.giftId, identityHash: message.identityHash, metricValue: message.metricValue, observedAt: message.observedAt };
    const recipientSignature = signedBy ? await signedBy.signTypedData(startTypedData("daily", daily, start)) : "0x";
    return relay("checkIn", [giftId, { ...message, signature: await signCheckIn(message, daily), recipientSignature }], daily);
  };
  // The review of 2 Oct 2026, R-15: the evidence key alone, or with any account but the recipient's, binds nothing.
  for (const [who, signer] of [["alone", undefined], ["with its own signature in the recipient's place", evidence], ["with a stranger's", thief]] as const) {
    const refused = await read(1_000n, signer).then(() => null, (error: unknown) => error);
    expect(refused instanceof RelayerError && refused.contractError === "InvalidRecipientSignature", `the first reading is refused to the evidence key ${who}: InvalidRecipientSignature`);
  }
  await read(1_000n, recipient);
  expect((await readGift(daily, giftId)).startDay !== 0, "and taken with the recipient's own signature beside it");
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

  // The review of 2 Oct 2026, R-16: a request is counted against everybody's day only once what costs nothing has been
  // checked. The reviewer's flood, withdrawals for a gift that does not exist, and two more that the contract would
  // refuse, leave the count where it was.
  const countedForEverybody = async () => Number((await db.query<{ count: number }>("SELECT count FROM viky_relay_counts WHERE scope = 'relay:day:all'")).rows[0]?.count ?? 0);
  const countedBefore = await countedForEverybody();
  const freshNonce = (await readGift(daily, giftId)).withdrawNonce;
  const again = { giftId: BigInt(giftId), to: recipient.address, amount: 1_000_000n, nonce: freshNonce, deadline: BigInt((await chainNow()) + 600) };
  const withdrawal = (id: string, message: typeof again, signature: Hex, cookie = recipientCookie) =>
    post(withdrawRoute, "/api/gift/withdraw", cookie, { giftId: id, to: message.to, amount: message.amount.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString(), signature });
  response = await withdrawal("999", { ...again, giftId: 999n }, await recipient.signTypedData(withdrawTypedDataV2("daily", daily, { ...again, giftId: 999n })));
  expect(response.status === 404, "a withdrawal for a gift that does not exist is refused");
  response = await withdrawal(giftId, again, await thief.signTypedData(withdrawTypedDataV2("daily", daily, again)));
  expect(response.status === 400 && ((await response.json()) as { code?: string }).code === "INVALID_SIGNATURE", "so is one the recipient did not sign");
  const stale = { ...again, nonce: freshNonce - 1n };
  response = await withdrawal(giftId, stale, await recipient.signTypedData(withdrawTypedDataV2("daily", daily, stale)));
  expect(response.status === 409 && ((await response.json()) as { code?: string }).code === "STALE_REQUEST", "and one signed for a nonce the gift has left behind");
  expect((await countedForEverybody()) === countedBefore, "and none of the three was counted against anybody's day");

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
  /** A proof as the server sends it. `signedBy` signs the start beside the evidence signer: the recipient, on the first. */
  const prove = async (id: string, rating: number, signedBy?: Account) => {
    const now = await chainNow();
    const message = { giftId: BigInt(id), recipient: recipient.address, identityHash: keccak256(toHex("rehearsal player")), providerId: chessProviderId(cadence), metricValue: BigInt(rating), eventAt: 0n, observedAt: BigInt(now), nullifier: keccak256(toHex(`proof ${id} ${now} ${rating} ${signedBy?.address ?? ""}`)), issuedAt: BigInt(now), expiresAt: BigInt(now + 300) };
    const start = { giftId: message.giftId, identityHash: message.identityHash, metricValue: message.metricValue, observedAt: message.observedAt };
    return relayProve({ contract: milestone, message, startSignature: signedBy ? await signedBy.signTypedData(startTypedData("milestone", milestone, start)) : undefined });
  };
  const notTheirs = await prove(reached, standing.rating, thief).then(() => null, (error: unknown) => error);
  expect(notTheirs instanceof RelayerError && notTheirs.contractError === "InvalidRecipientSignature", "a start signed by anybody else is refused before a transaction is paid for");

  const before = await ausdOf(funder.address);
  nonce = (await readMilestoneGift(milestone, ended)).withdrawNonce;
  intentDeadline = BigInt((await chainNow()) + 600);
  const endOfClimb = { giftId: BigInt(ended), keep: 0n, giveBack: 5_000_000n, nonce, deadline: intentDeadline };
  response = await postFor(endRoute, ended, `/api/gift/${ended}/end`, recipientCookie, { ...stringsOf(endOfClimb), signature: await recipient.signTypedData(endTypedData("milestone", milestone, endOfClimb)) });
  expect(response.status === 200 && (await ausdOf(funder.address)) === before + 5_000_000n, "ended by the person it is for: the whole 5.00 came back at once");
  expect((await statusOf(ended, recipientCookie)).ended !== null, "and its status says it was ended");

  expect((await prove(reached, standing.rating, recipient)).happened === "started", "a first reading the recipient signed starts the other climb");
  expect((await prove(reached, target + 6)).happened === "reached", "and it is reached, on the evidence signer's reading alone");
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

  console.log("STEP 5b: the owner's pause on the second version");
  const pauseAbi = [
    { type: "function", name: "setCheckInPaused", stateMutability: "nonpayable", inputs: [{ type: "bool" }], outputs: [] },
    { type: "function", name: "setProofPaused", stateMutability: "nonpayable", inputs: [{ type: "bool" }], outputs: [] },
    { type: "function", name: "checkInPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
    { type: "function", name: "proofPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
    { type: "function", name: "pendingEvidenceSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  ] as const;
  for (const [name, address, target, action, paused] of [["daily", daily, "escrow-v2", "checkin-paused", "checkInPaused"], ["milestone", milestone, "milestone-v2", "proof-paused", "proofPaused"]] as const) {
    expect(/^0x0{40}$/.test(String(await publicClient.readContract({ address, abi: pauseAbi, functionName: "pendingEvidenceSigner" }))), `${name}: no signer is waiting after the hand-over`);
    expect(!(await publicClient.readContract({ address, abi: pauseAbi, functionName: paused })), `${name}: a new contract is not paused, so its pause is unspent`);
    // The emergency brake, as the Safe would pull it: the tool knows the contract by its name, and the app's setting.
    const pause = bySafe({ ACTION: action, TARGET: target, PAUSED: "true" });
    expect(pause.ok && (await publicClient.readContract({ address, abi: pauseAbi, functionName: paused })), `${name}: the Safe pauses it through pnpm safe:action`);
    const again = safeAction({ ACTION: action, TARGET: target, PAUSED: "true" });
    expect(!again.ok && again.out.includes("PauseTooSoon"), `${name}: a second pause while it runs is refused by the tool before anybody signs: PauseTooSoon`);
    expect(bySafe({ ACTION: action, TARGET: target, PAUSED: "false" }).ok && !(await publicClient.readContract({ address, abi: pauseAbi, functionName: paused })), `${name}: the Safe reopens it`);
    const soon = safeAction({ ACTION: action, TARGET: target, PAUSED: "true" });
    expect(!soon.ok && soon.out.includes("PauseTooSoon"), `${name}: and a pause in the week that follows its end is refused the same way`);
  }
  // A pause sent before the app is told leaves the owner without its brake for the week that follows: the hand-over
  // check reads it, which is how one sent by the deploying key would be seen (the delta re-read of 2 Oct 2026).
  const spent = handover();
  expect(
    !spent.ok && ["GiftEscrowV2", "MilestoneGiftV2"].every((name) => spent.out.includes(`${name}: a pause of its readings was sent`)) && spent.out.includes("the Safe cannot pause this contract before") && !spent.out.includes("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS="),
    "once a pause was sent, the hand-over check says the contract has no brake until its rest is over, and prints no setting",
  );

  console.log("STEP 6: the yes and the stop on the anchor, checked from the chain alone");
  expect((await say("stop", giftId)).sequence === 1 && (await anchored(giftId)) === 2n, "a stop takes the next place of its gift");
  const contracts = { daily: [daily], milestone, anchor };
  const check = async () => {
    const readings = await readingsIn(publicClient, contracts, await logsBetween(publicClient, contracts, firstBlock, await publicClient.getBlockNumber(), 500n));
    const verdict = (kind: "daily" | "milestone", id: string, counted: number) => verdictOf(publicClient, anchor, { kind, giftId: id, recipient: recipient.address, counted }, readings);
    return { daily: await verdict("daily", giftId, (await readGift(daily, giftId)).creditedDays), ended: await verdict("milestone", ended, 0), reached: await verdict("milestone", reached, 1) };
  };
  let checked = await check();
  expect(checked.daily.problems.length === 0 && checked.daily.found === 2 && checked.daily.readings.every((reading) => reading.held === "yes"), "the daily gift passes: its two counted days were read under a yes anchored before them");
  expect(checked.daily.entries.map((entry) => `${entry.kind}:${entry.stands}`).join() === "yes:true,stop:true", "its yes and its stop are both signed by the bound key");
  expect(checked.ended.problems.length === 0 && checked.ended.readings.length === 0, "the gift that was ended passes: nothing read for it moved money");
  expect(checked.reached.problems.some((problem) => problem.includes("no yes anchored before it")), "the gift reached with no yes is named: a reading moved money with no yes anchored before it");
  await say("yes", reached);
  checked = await check();
  expect(checked.reached.entries.length === 1 && checked.reached.problems.some((problem) => problem.includes("no yes anchored before it")), "and a yes anchored after the reading does not cover it");

  // The command itself, as anybody runs it, reading the chain alone.
  const command = (more: string) => {
    try {
      return { code: 0, out: execSync(`npx tsx scripts/verify-consent.ts --from-block ${firstBlock} --piece 500 --daily ${daily} --milestone ${milestone} --anchor ${anchor} ${more}`, { env: { ...process.env, MONAD_RPC_URL: RPC }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      const failed = error as { status?: number; stdout?: string; stderr?: string };
      return { code: failed.status ?? 1, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  const one = command(`--gift ${giftId}`);
  expect(one.code === 0 && one.out.includes("PASSED: 1 gift"), "pnpm verify:consent passes the daily gift, from the chain alone");
  const all = command("");
  expect(all.code === 1 && all.out.includes(`FAIL gift ${reached} (milestone)`) && all.out.includes(`ok   gift ${giftId} (daily)`) && all.out.includes("VERIFY_FAILED: 1 of 3 gifts did not pass"), "and over every gift it fails, naming the one read with no yes");

  console.log("STEP 7: a goal the register does not hold, and the hand-over check");
  // Last, because it cannot be undone: a goal is added and never changed. A number the register leaves free is
  // registered in the shape of a certificate, as a deploying key could have before the Safe accepted, and the check
  // names it among the 255 it reads (the reviewer's delta re-read of 2 Oct 2026).
  const freeGoal = Array.from({ length: 255 }, (_unused, index) => index + 1).find((goalType) => !MILESTONE_GOALS.some((goal) => goal.goalType === goalType)) as number;
  const rogueProvider = keccak256(toHex("a provider nobody chose"));
  const register = [{ type: "function", name: "registerGoal", stateMutability: "nonpayable", inputs: [{ type: "uint8" }, { type: "bytes32" }, { type: "uint8" }], outputs: [] }] as const;
  await as(SAFE, milestone, encodeFunctionData({ abi: register, functionName: "registerGoal", args: [freeGoal, rogueProvider, 1] }));
  const rogue = handover();
  expect(
    !rogue.ok && rogue.out.includes(`MilestoneGiftV2: goal ${freeGoal} is registered (${rogueProvider}, having it or not) and the register holds no goal ${freeGoal}`) && rogue.out.includes("this contract cannot be put right") && !rogue.out.includes("NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS="),
    `a goal registered outside the register (number ${freeGoal}) is named by the hand-over check, and no setting is printed`,
  );

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
