import "../src/load-env";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { createEd25519SigningSession } from "@category-labs/mera";
import { createPublicClient, createTestClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, padHex, parseEther, toHex, type Abi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { GET as consentRoute, POST as consentPostRoute } from "../app/api/gift/[id]/consent/route";
import { POST as countRoute } from "../app/api/gift/[id]/count/route";
import { POST as endRoute } from "../app/api/gift/[id]/end/route";
import { GET as statusRoute } from "../app/api/gift/[id]/route";
import { POST as claimRoute } from "../app/api/gift/claim/route";
import { POST as createRoute } from "../app/api/gift/create/route";
import { POST as withdrawRoute } from "../app/api/gift/withdraw/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { linkOfMade, prepareGift } from "../src/client/gift";
import { consentBytes, toHex as bytesToHex } from "../src/consent";
import { configureAttestedCalls } from "../src/attested-calls";
import { consentAnchorAbi } from "../src/consent-anchor-abi";
import { configureConsentStore } from "../src/consent-store";
import { DAILY_GOALS } from "../src/daily-goals";
import { readAsTheDayGoes } from "../src/daily-count";
import { resolvePublicDuolingoProfile } from "../src/duolingo-profile";
import { DUOLINGO_PUBLIC_PROVIDER_ID } from "../src/duolingo-public-terms";
import { frequentDailyPass } from "../src/frequent-pass";
import { signCheckIn } from "../src/gift-attestation";
import { giftEscrowV2Abi } from "../src/gift-escrow-v2-abi";
import { giftEscrowV3Abi } from "../src/gift-escrow-v3-abi";
import { readGift } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, loadGift, markBound } from "../src/gift-store";
import { configureHeldStartStore } from "../src/held-start-store";
import { GOAL_TYPE_DUOLINGO_XP } from "../src/gift-terms";
import { monadChain } from "../src/monad/chain";
import { configurePassGuard } from "../src/pass-guard";
import type { SqlExecutor } from "../src/proof-session-store";
import { relay, RelayerError } from "../src/relayer";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { SECOND_VERSION_SETTINGS, THIRD_VERSION_SETTING } from "../src/v2";
import { consentAnchorMessage, consentKeyTypedData, consentTextDigest, endTypedData, fundingNonceV2, fundingNonceV3, GIFT_V2_DOMAIN, GIFT_V3_DOMAIN, openingAccount, openingSecretOf, openTypedData, startTypedData, withdrawTypedDataV2 } from "../src/v2-protocol";
import { GIFT_ESCROW, MILESTONE_GIFT } from "../src/viky-contracts";

/**
 * The third daily contract, rehearsed from end to end on a local fork of Monad mainnet before anything is sent to
 * mainnet itself (3 Oct 2026). Everything runs as production would run it, the routes and the browser's own signing
 * code included, except: the chain is a local fork, the database is PGlite in memory (never the production one), every
 * key is made here and thrown away, and the readings are fed, because nobody does a lesson on demand.
 *
 * It starts from mainnet as it is: the second version in service, with its gifts. What it walks, in order:
 *   1. a gift made and started on the second version, as today, to be read again once the third is in service;
 *   2. what `scripts/deploy-v3.ts` refuses: another signer, another owner, a local node that is not a rehearsal, and a
 *      numbering that would meet the second version's;
 *   3. the deployment, by one of the two numberings: continued, once the Safe has closed creation on the second
 *      version with its own tool; or, with REHEARSE_FIRST_GIFT_ID, started further on with the second left open;
 *   4. the Safe accepts it through `scripts/safe-action.ts`, signed by two keys, and `scripts/check-v3-handover.ts`
 *      says it is the Safe's before the app is told where it is;
 *   5. a daily gift on the third contract: made with the third's own nonce, opened with its link's key, started with
 *      the recipient's signature under the third's domain, and then the rule: the first day is the day of the
 *      connection, a lesson read that day pays that day, the same figure pays nothing twice, a second lesson that day
 *      is counted by the first reading of the next day, a missed day is paid first by the next lesson;
 *   6. the same gift as the app reads it: its status, the look its page asks for, by each of its two people and by
 *      nobody else, with the real public profile and no proof paid for, and the pass of every quarter of an hour;
 *   7. the gift of step 1, read the next day by the second version's rule and under the second version's domain;
 *   8. the money: a day taken out on the recipient's signed intent, the gift ended by the person it is for, and the
 *      Safe's brake pulled on the third contract through its own tool.
 *
 * No key of production is used. On the fork, and nowhere else, the Safe's own list of owners is rewritten to two keys
 * made here, the second version's daily contract is given the evidence signer made here (written straight into its
 * storage: on mainnet the Safe announces one and it stands a day later, which no rehearsal can wait for without the
 * signatures made in real time going stale), and the anchor of agreements is given the relayer made here.
 * It refuses any node but the local fork.
 *
 * Usage:
 *   anvil --fork-url https://rpc.monad.xyz --network monad --port 8547 --block-time 0.1
 *   forge build && SESSION_SIGNING_SECRET=<32 bytes or more> pnpm rehearse:v3
 *   (the three settings of the second version are read as the app reads them: from .env.local, or given here)
 */

const RPC = "http://127.0.0.1:8547";
const ORIGIN = "https://viky.test";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const;
const POOL = "0x942644106B073E30D72c2C5D7529D5C296ea91ab" as const;
const SAFE = "0xE08D926c148A5065F4Df2892702785a183de86F9" as const;
const DAY = 86_400;
/** A public profile the look can read for real: the one `pnpm check:sources` already asks. */
const PROFILE = "Luis";
type Account = ReturnType<typeof privateKeyToAccount>;

const erc20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
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

function setting(name: string): Hex {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} is not set: the rehearsal starts from the second version in service, as the app knows it`);
  return getAddress(value);
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
  process.env.GIFT_ESCROW_ADDRESS = GIFT_ESCROW;
  process.env.MILESTONE_GIFT_ADDRESS = MILESTONE_GIFT;
  delete process.env.DATABASE_URL;
  delete process.env.ZKFETCH_WORKER_URL;
  delete process.env.RECLAIM_ZKFETCH_APP_ID;
  delete process.env.RESEND_API_KEY;
  delete process.env[THIRD_VERSION_SETTING];
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
  if (!process.env.SESSION_SIGNING_SECRET) throw new Error("Set SESSION_SIGNING_SECRET to any 32 bytes or more");
  const second = { daily: setting(SECOND_VERSION_SETTINGS[0]), milestone: setting(SECOND_VERSION_SETTINGS[1]), anchor: setting(SECOND_VERSION_SETTINGS[2]) };
  const apart = process.env.REHEARSE_FIRST_GIFT_ID?.trim() || "";

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
  const secondAbi = giftEscrowV2Abi as unknown as Abi;
  const thirdAbi = giftEscrowV3Abi as unknown as Abi;
  const word = (value: Hex | bigint) => padHex(typeof value === "bigint" ? toHex(value) : value, { size: 32 });

  // The Safe of the fork answers to two keys made here (Safe 1.4.1: its owners are a linked list in slot 2, from the
  // sentinel 0x1, their number in slot 3 and the threshold in slot 4).
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const safeKeys = [generatePrivateKey(), generatePrivateKey()] as const;
  const [safeOne, safeTwo] = safeKeys.map((key) => privateKeyToAccount(key));
  const ownerSlot = (owner: Hex) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, 2n]));
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
  const run = (script: string, env: NodeJS.ProcessEnv) => {
    try {
      return { ok: true, out: execSync(`npx tsx scripts/${script}`, { env, encoding: "utf8", maxBuffer: 16 * 1_024 * 1_024, stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { ok: false, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
    }
  };
  /** One action of the Safe through the tool itself: built, signed by each key where it lives, then sent. */
  const safeAction = (env: Record<string, string>, more: Record<string, string> = {}) =>
    run("safe-action.ts", { ...process.env, REHEARSAL: "1", SAFE_ADDRESS: SAFE, MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC, SIGN: "", SEND: "", SIGNATURES: "", SIGNER_PRIVATE_KEY: "", NONCE: "", ...env, ...more });
  const bySafe = (env: Record<string, string>) => {
    const built = safeAction(env);
    if (!built.ok) return built;
    const nonce = String(/"nonce": "(\d+)"/.exec(built.out)?.[1]);
    const signatures = safeKeys.map((key) => String(/"signature": "(0x[0-9a-f]+)"/.exec(safeAction(env, { SIGN: "1", SIGNER_PRIVATE_KEY: key, NONCE: nonce }).out)?.[1]));
    return safeAction(env, { SIGNATURES: signatures.join(","), SEND: "1", EXECUTOR_PRIVATE_KEY: safeKeys[0], NONCE: nonce });
  };

  // The fork alone: the second version's daily contract takes the evidence signer made here (its slot 5), and the
  // anchor of agreements names the relayer made here, so the rehearsal's own keys read and write as production's do.
  const realSigner = getAddress(String(await publicClient.readContract({ address: second.daily, abi: secondAbi, functionName: "evidenceSigner" })));
  await test.setStorageAt({ address: second.daily, index: word(5n), value: word(evidence.address) });
  expect(getAddress(String(await publicClient.readContract({ address: second.daily, abi: secondAbi, functionName: "evidenceSigner" }))) === evidence.address, "on the fork, the second version's daily contract takes the rehearsal's evidence signer");
  await as(SAFE, second.anchor, encodeFunctionData({ abi: consentAnchorAbi as unknown as Abi, functionName: "setAnchorer", args: [relayer.address] }));

  const db = new PGlite();
  const exec: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(exec);
  configureRelayCeilingStore(exec);
  configureConsentStore(exec);
  configurePassGuard(exec);
  configureAttestedCalls(exec);
  configureHeldStartStore(exec);
  await ensureGiftSchema();
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

  /** A gift made through the routes, on whichever daily contract the app's settings name, and opened with its link's key. */
  const madeAndOpened = async (amount: bigint) => {
    const request = await prepareGift({ account: funder, goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount, duolingoUsername: PROFILE });
    const answer = await post(createRoute, "/api/gift/create", funderCookie, request);
    const made = (await answer.json()) as { giftId: string; claimUrl: string | null; funded: boolean; error?: string };
    if (answer.status !== 200) throw new Error(`the gift was not made: ${made.error}`);
    const contract = getAddress(String((await statusOf(made.giftId, funderCookie)).escrow));
    const secret = String(openingSecretOf(new URL(await linkOfMade(funder, made, request.salt)).hash));
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + 600);
    const opening = { deadline: deadline.toString(), signature: await openingAccount(secret).signTypedData(openTypedData("daily", contract, { giftId: BigInt(made.giftId), recipient: recipient.address, deadline })) };
    const opened = await post(claimRoute, "/api/gift/claim", recipientCookie, { giftId: made.giftId, opening });
    if (opened.status !== 200) throw new Error(`the gift was not opened: ${await opened.text()}`);
    return { giftId: made.giftId, contract, request };
  };
  /**
   * A reading, attested by the evidence signer under the domain of the contract the gift is on, at the fork's own
   * time. `signedBy` is who signs it beside the evidence signer: the recipient's account on the first reading.
   */
  const read = async (contract: Hex, giftId: string, metric: bigint, signedBy?: Account) => {
    const now = await chainNow();
    const message = {
      giftId: BigInt(giftId),
      recipient: recipient.address,
      identityHash: keccak256(toHex(`rehearsal identity ${giftId}`)),
      providerId: DUOLINGO_PUBLIC_PROVIDER_ID,
      metricValue: metric,
      observedAt: BigInt(now),
      nullifier: keccak256(toHex(`rehearsal ${giftId} ${now} ${metric} ${signedBy?.address ?? ""}`)),
      issuedAt: BigInt(now),
      expiresAt: BigInt(now + 300),
    };
    const start = { giftId: message.giftId, identityHash: message.identityHash, metricValue: message.metricValue, observedAt: message.observedAt };
    const recipientSignature = signedBy ? await signedBy.signTypedData(startTypedData("daily", contract, start)) : "0x";
    return relay("checkIn", [giftId, { ...message, signature: await signCheckIn(message, contract), recipientSignature }], contract);
  };
  const refusedWith = async (attempt: Promise<unknown>) => {
    const error = await attempt.then(() => null, (thrown: unknown) => thrown);
    return error instanceof RelayerError ? error.contractError : error === null ? "accepted" : String(error);
  };

  /** The recipient's yes as their browser makes it (src/client/consent.ts), written on the anchor by the route. */
  const consentKey = createEd25519SigningSession({ privateKey: crypto.getRandomValues(new Uint8Array(32)) });
  const consentKeyHex = bytesToHex(consentKey.publicKey) as Hex;
  const sayYes = async (id: string) => {
    const asked = await consentRoute(new Request(`${ORIGIN}/api/gift/${id}/consent`, { headers: headers(recipientCookie) }), { params: Promise.resolve({ id }) });
    const answer = (await asked.json()) as { texts?: { yes: string; stop: string }; anchor?: { contract: Hex; account: Hex; bound: boolean; sequence: number }; error?: string };
    if (asked.status !== 200 || !answer.texts || !answer.anchor) throw new Error(`the agreement of gift ${id} could not be read: ${answer.error ?? asked.status}`);
    const offered = answer.anchor;
    const message = consentAnchorMessage({ anchor: offered.contract, account: offered.account, giftId: id, kind: "yes", sequence: offered.sequence, digest: consentTextDigest(answer.texts.yes) });
    const sent = await postFor(consentPostRoute, id, `/api/gift/${id}/consent`, recipientCookie, {
      kind: "yes",
      publicKey: consentKeyHex,
      signature: bytesToHex(await consentKey.signMessage(consentBytes(answer.texts.yes))),
      anchor: {
        sequence: offered.sequence,
        signature: bytesToHex(await consentKey.signMessage(new TextEncoder().encode(message))),
        ...(offered.bound ? {} : { binding: await recipient.signTypedData(consentKeyTypedData(offered.contract, recipient.address, consentKeyHex)) }),
      },
    });
    if (sent.status !== 200) throw new Error(`the yes of gift ${id} was not kept: ${await sent.text()}`);
  };

  console.log("STEP 1: a gift on the second version, as today, to be read again once the third is in service");
  const before = await madeAndOpened(7_000_000n);
  expect(before.contract === second.daily && (await readGift(second.daily, before.giftId)).version === 2, `a gift is made on the second version (${before.giftId}): the third is not set`);
  expect(before.request.authorization.nonce === fundingNonceV2({ funder: funder.address, refundTo: funder.address, openingKey: before.request.openingKey as Hex, goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_000n, salt: before.request.salt }), "its terms were signed with the second version's own nonce");
  await read(second.daily, before.giftId, 5_000n, recipient);
  const day0 = Math.floor((await chainNow()) / DAY);
  expect((await readGift(second.daily, before.giftId)).startDay === day0 + 1, "started on the second version, its first day is the day after the connection");

  console.log("STEP 2: what the deployment refuses");
  const deployEnv = { ...process.env, REHEARSAL: "1", DRY_RUN: "", FIRST_GIFT_ID: "", DEPLOYER_PRIVATE_KEY: deployerKey, OWNER_ADDRESS: SAFE, EVIDENCE_SIGNER_ADDRESS: evidence.address, EVIDENCE_SIGNER_PRIVATE_KEY: "", MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC };
  const deploy = (env: NodeJS.ProcessEnv) => run("deploy-v3.ts", env);
  const otherSigner = deploy({ ...deployEnv, EVIDENCE_SIGNER_ADDRESS: realSigner });
  expect(!otherSigner.ok && otherSigner.out.includes("takes its readings from"), "a signer that is not the one the second version's daily contract holds, read on the chain");
  const otherOwner = deploy({ ...deployEnv, OWNER_ADDRESS: stranger });
  expect(!otherOwner.ok && otherOwner.out.includes("is owned by"), "an owner that is not the one it answers to");
  const notRehearsal = deploy({ ...deployEnv, REHEARSAL: "" });
  expect(!notRehearsal.ok && notRehearsal.out.includes("is a local node, and this is not a rehearsal"), "a local node when it is not told this is a rehearsal");
  const meets = deploy(deployEnv);
  expect(!meets.ok && meets.out.includes("creation is open on the second version's daily contract") && meets.out.includes("a number this contract gives out too"), "a numbering continued while the second version still makes gifts: two gifts would carry one number");
  const behind = deploy({ ...deployEnv, FIRST_GIFT_ID: "1" });
  expect(!behind.ok && behind.out.includes("two gifts would carry one number"), "and a first gift whose number an earlier contract already gave out");

  console.log(`STEP 3: the deployment (scripts/deploy-v3.ts, REHEARSAL), its numbering ${apart ? `started at ${apart}, the second version left open` : "continued, the second version closed first"}`);
  if (!apart) {
    const closed = bySafe({ ACTION: "creation-paused", TARGET: "escrow-v2", PAUSED: "true" });
    expect(closed.ok && (await publicClient.readContract({ address: second.daily, abi: secondAbi, functionName: "creationPaused" })) === true, "the Safe closes creation on the second version's daily contract, through pnpm safe:action, signed by its two keys");
  }
  const secondNext = (await publicClient.readContract({ address: second.daily, abi: secondAbi, functionName: "nextGiftId" })) as bigint;
  const ran = deploy({ ...deployEnv, FIRST_GIFT_ID: apart });
  if (!ran.ok) throw new Error(`the deployment failed: ${ran.out.slice(-800)}`);
  const third = getAddress(String(new RegExp(`${THIRD_VERSION_SETTING}=(0x[0-9a-fA-F]{40})`).exec(ran.out)?.[1]));
  console.log(`  deployed: ${third}`);
  expect((ran.out.match(/"step":"register goal/g) ?? []).length === DAILY_GOALS.length, `${DAILY_GOALS.length} daily goals were registered`);
  expect(/WRITE DOWN: GiftEscrowV3 is at 0x[0-9a-fA-F]{40}/.test(ran.out), "its address was printed the moment it existed");
  const firstId = (await publicClient.readContract({ address: third, abi: thirdAbi, functionName: "nextGiftId" })) as bigint;
  expect(firstId === (apart ? BigInt(apart) : secondNext), `its first gift takes number ${firstId}`);

  console.log("STEP 4: the Safe accepts it, with its own tool, and the hand-over is read before the app is told");
  const handover = (said: Record<string, string> = {}) =>
    run("check-v3-handover.ts", { ...process.env, REHEARSAL: "1", MONAD_RPC_URL: RPC, NEXT_PUBLIC_MONAD_RPC_URL: RPC, DAILY_V3: third, OWNER_ADDRESS: SAFE, EVIDENCE_SIGNER_ADDRESS: evidence.address, ...said });
  const early = handover();
  expect(!early.ok && early.out.includes("The Safe has not accepted it yet") && !early.out.includes(`${THIRD_VERSION_SETTING}=`), "before the Safe accepts, the hand-over check prints no setting");
  const accepted = bySafe({ ACTION: "accept-ownership", TARGET: "escrow-v3", TARGET_ADDRESS: third });
  expect(accepted.ok && getAddress(String(await publicClient.readContract({ address: third, abi: thirdAbi, functionName: "owner" }))) === SAFE, "escrow-v3: accepted by the Safe through pnpm safe:action, signed by its two keys");
  const handed = handover();
  expect(handed.ok && handed.out.includes(`${THIRD_VERSION_SETTING}=${third}`) && handed.out.includes(`"goals":"${DAILY_GOALS.length} registered of 255 numbers read"`), "the hand-over check passes, each of the 255 goal numbers read, and only now is the setting printed");
  if (apart) expect(handed.out.includes("still makes gifts") && handed.out.includes(`at gift ${apart}`), "and it says how many numbers the second version has left before the third's");
  const otherSafe = handover({ OWNER_ADDRESS: stranger });
  expect(!otherSafe.ok && !otherSafe.out.includes(`${THIRD_VERSION_SETTING}=`), "an owner that is not the Safe named is said, and no setting is printed");

  // From here the app is told where the third daily contract is, as its one setting will tell it.
  process.env[THIRD_VERSION_SETTING] = third;

  console.log("STEP 5: a daily gift on the third contract, and its rule");
  const profile = await resolvePublicDuolingoProfile(PROFILE);
  if (profile.totalXp === null) throw new Error(`the public profile ${PROFILE} carries no experience total: the look of step 6 has nothing to read`);
  const base = BigInt(profile.totalXp);
  const gift = await madeAndOpened(7_000_000n);
  const giftId = gift.giftId;
  expect(gift.contract === third && BigInt(giftId) === firstId && (await readGift(third, giftId)).version === 3, `a gift is made on the third contract (${giftId}), and the real AUSD arrived there`);
  expect((await ausdOf(third)) === 7_000_000n, "7.00 is held by the third contract");
  const terms = { funder: funder.address, refundTo: funder.address, openingKey: gift.request.openingKey as Hex, goalType: GOAL_TYPE_DUOLINGO_XP, dailyTarget: 10, durationDays: 7, amount: 7_000_000n, salt: gift.request.salt };
  expect(gift.request.authorization.nonce === fundingNonceV3(terms) && gift.request.authorization.nonce !== fundingNonceV2(terms), "its terms were signed with the third contract's own nonce, which the second would refuse");
  await sayYes(giftId);
  // The first reading: refused to the evidence key alone, and to a signature made under the second version's domain.
  expect((await refusedWith(read(third, giftId, base))) === "InvalidRecipientSignature", "the first reading is refused to the evidence key alone: InvalidRecipientSignature");
  const now0 = await chainNow();
  const startMessage = { giftId: BigInt(giftId), recipient: recipient.address, identityHash: keccak256(toHex(`rehearsal identity ${giftId}`)), providerId: DUOLINGO_PUBLIC_PROVIDER_ID, metricValue: base, observedAt: BigInt(now0), nullifier: keccak256(toHex(`other domain ${giftId}`)), issuedAt: BigInt(now0), expiresAt: BigInt(now0 + 300) };
  const underTheSecond = await recipient.signTypedData({ domain: { ...GIFT_V2_DOMAIN, verifyingContract: third }, types: { Start: [{ name: "giftId", type: "uint256" }, { name: "identityHash", type: "bytes32" }, { name: "metricValue", type: "uint64" }, { name: "observedAt", type: "uint64" }] }, primaryType: "Start", message: { giftId: startMessage.giftId, identityHash: startMessage.identityHash, metricValue: base, observedAt: startMessage.observedAt } });
  expect((await refusedWith(relay("checkIn", [giftId, { ...startMessage, signature: await signCheckIn(startMessage, third), recipientSignature: underTheSecond }], third))) === "InvalidRecipientSignature", "and to the recipient's signature made under the second version's domain");
  expect(GIFT_V3_DOMAIN.version === "3", "everything for it is signed under version 3");
  await read(third, giftId, base, recipient);
  await markBound(giftId, profile.id);
  const day1 = Math.floor((await chainNow()) / DAY);
  let state = await readGift(third, giftId);
  expect(state.startDay === day1 && state.endDay === day1 + 6 && state.creditedDays === 0, "the first day is the day of the connection, the block's own, and the first reading credits nothing");
  // The look its page asks for as it opens, by the route itself and on the real public profile: nothing new since the
  // connection, so no proof is taken. (Asked here, before the fork's clock is moved: the server reads its own clock.)
  const look = async (id: string, cookie: string) => {
    const answer = await countRoute(new Request(`${ORIGIN}/api/gift/${id}/count?look=1`, { method: "POST", headers: headers(cookie), body: "{}" }), { params: Promise.resolve({ id }) });
    return { status: answer.status, body: (await answer.json()) as { kind?: string; code?: string; looked?: boolean } };
  };
  const firstLook = await look(giftId, recipientCookie);
  expect(firstLook.status === 200 && (firstLook.body.kind === "seen" || (firstLook.body.code === "NOT_ENOUGH_PROGRESS" && firstLook.body.looked === true)), `the look asked as the page opens reads the real public profile and takes no proof (${firstLook.body.code ?? firstLook.body.kind})`);
  expect((await refusedWith(read(third, giftId, base + 9n))) === "InsufficientProgress", "nine points of ten are not a day: InsufficientProgress");
  await read(third, giftId, base + 10n);
  state = await readGift(third, giftId);
  expect(state.creditedDays === 1 && state.settledThroughDay === day1 && state.earnedBalance === 1_000_000n, "a lesson read the same day pays that day: 1.00 is theirs, the day of the connection");
  expect((await refusedWith(read(third, giftId, base + 10n))) === "NothingToCredit", "the same figure pays nothing twice: NothingToCredit");
  expect((await refusedWith(read(third, giftId, base + 25n))) === "NothingToCredit", "and a second lesson that day pays nothing that day");

  console.log("STEP 6: the same gift as the app reads it");
  let status = await statusOf(giftId, recipientCookie);
  expect(status.version === 3 && status.creditedDays === 1 && status.startDay === day1, "its status says the third version, the first day and today counted");
  expect(readAsTheDayGoes((await loadGift(giftId))!) === true, "it is read as the day goes: by its page as it opens, and by the pass of every quarter of an hour");
  expect(readAsTheDayGoes((await loadGift(before.giftId))!) === false, "and the gift on the second version is not: it is read each morning");
  for (const [who, cookie] of [["the person it is for", recipientCookie], ["the person who offered it", funderCookie]] as const) {
    const looked = await look(giftId, cookie);
    expect(looked.status === 200 && looked.body.kind === "refused" && looked.body.code === "NOTHING_TO_CREDIT" && looked.body.looked === true, `the look asked by ${who}: today is counted, so nothing is asked of the source and no proof is taken`);
  }
  expect((await look(giftId, await cookieFor(thief))).status === 403, "nobody else may ask for it");
  expect((await look(before.giftId, recipientCookie)).body.code === "NOT_READ_LIVE", "and a gift on the second version has no look to ask for");
  const passed = await frequentDailyPass();
  expect(passed.length === 1 && passed[0].giftId === giftId && passed[0].result === "looked: NOTHING_TO_CREDIT", "the pass of every quarter of an hour reads that gift alone, and takes no proof for a day already counted");

  console.log("STEP 7: the next day, on both contracts");
  await warpTo((day1 + 1) * DAY + 20 * 60);
  // The case written as it is on the judges page: the second lesson of yesterday, done after yesterday was counted, is
  // above the baseline, so the first reading of today finds one target of progress and pays today.
  await read(third, giftId, base + 25n);
  state = await readGift(third, giftId);
  expect(state.creditedDays === 2 && state.settledThroughDay === day1 + 1, "a second lesson done yesterday, after yesterday was counted, is counted by the first reading of today");
  // The gift on the second version, read the same morning: its first day is today, and there a reading never pays its
  // own day. It is refused by the second version's own rule, under a reading signed for the second version's domain.
  expect((await refusedWith(read(second.daily, before.giftId, 5_010n))) === "OutsideWindow", "the gift on the second version is read by the second version's rule: its first day is not over, so nothing is paid yet");

  // A day missed, then caught up: the next lesson pays the oldest open day, one more pays today.
  await warpTo((day1 + 3) * DAY + 3_600);
  await read(third, giftId, base + 35n);
  state = await readGift(third, giftId);
  expect(state.creditedDays === 3 && state.settledThroughDay === day1 + 2, "after a day with no lesson, the next lesson pays that day first, and today stays open");
  await read(third, giftId, base + 45n);
  state = await readGift(third, giftId);
  expect(state.creditedDays === 4 && state.settledThroughDay === day1 + 3, "one more pays today");
  // The same morning on the second version: its two days that are over are paid, and the day itself is not.
  await read(second.daily, before.giftId, 5_020n);
  const earlier = await readGift(second.daily, before.giftId);
  expect(earlier.creditedDays === 2 && earlier.settledThroughDay === day0 + 2, "on the second version the two days that are over are paid by a reading of the morning after");
  expect((await refusedWith(read(second.daily, before.giftId, 5_040n))) === "NothingToCredit", "and its own day is not open to a reading, however many lessons");

  console.log("STEP 8: the money, and the Safe's brake");
  const nonce = state.withdrawNonce;
  let deadline = BigInt((await chainNow()) + 600);
  let response = await post(withdrawRoute, "/api/gift/withdraw", recipientCookie, {
    giftId,
    to: recipient.address,
    amount: "1000000",
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature: await recipient.signTypedData(withdrawTypedDataV2("daily", third, { giftId: BigInt(giftId), to: recipient.address, amount: 1_000_000n, nonce, deadline })),
  });
  expect(response.status === 200 && (await ausdOf(recipient.address)) === 1_000_000n, "one day is taken out on the recipient's signed intent, under the third contract's domain");
  status = await statusOf(giftId, recipientCookie);
  const offer = status.end as { keep: string; giveBack: string; nonce: string };
  expect(offer.keep === "4000000" && offer.giveBack === "3000000", "the ending says: keep 4.00, 3.00 goes back");
  const funderBefore = await ausdOf(funder.address);
  deadline = BigInt((await chainNow()) + 600);
  const endMessage = { giftId: BigInt(giftId), keep: BigInt(offer.keep), giveBack: BigInt(offer.giveBack), nonce: BigInt(offer.nonce), deadline };
  response = await postFor(endRoute, giftId, `/api/gift/${giftId}/end`, recipientCookie, { keep: offer.keep, giveBack: offer.giveBack, nonce: offer.nonce, deadline: deadline.toString(), signature: await recipient.signTypedData(endTypedData("daily", third, endMessage)) });
  expect(response.status === 200 && (await ausdOf(funder.address)) === funderBefore + 3_000_000n, "the person it is for ends it: 3.00 came back to the funder in that transaction");
  expect((await ausdOf(third)) === 3_000_000n, "the third contract holds exactly the three days still theirs to take");
  const pause = bySafe({ ACTION: "checkin-paused", TARGET: "escrow-v3", PAUSED: "true" });
  expect(pause.ok && (await publicClient.readContract({ address: third, abi: thirdAbi, functionName: "checkInPaused" })) === true, "the Safe pauses readings on the third contract through pnpm safe:action, by its own setting");
  expect(bySafe({ ACTION: "checkin-paused", TARGET: "escrow-v3", PAUSED: "false" }).ok && (await publicClient.readContract({ address: third, abi: thirdAbi, functionName: "checkInPaused" })) === false, "and reopens them");

  await db.close();
  console.log("\nREHEARSAL PASSED: every step above ran on the fork, with the real AUSD.");
}

main().catch((error) => {
  console.error("REHEARSAL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
