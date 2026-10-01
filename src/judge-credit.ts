import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { getAddress, keccak256, parseUnits, stringToHex, type Abi, type Hex } from "viem";
import { AUTHORIZATION_VALIDITY_SECONDS } from "./ausd-authorization";
import { databaseUrl } from "./database-guard";
import { GiftApiError } from "./gift-api";
import { AUSD_ADDRESS, createMonadPublicClient } from "./monad/chain";
import { unsettledOrders } from "./phone-order-store";
import { refundAusd, treasuryAddress, TreasuryError } from "./phone-treasury";
import { sendAlert } from "./provider-alert";
import { bucketOf } from "./relay-ceiling";
import { countKey, countRelays } from "./relay-ceiling-store";
import type { SqlExecutor } from "./proof-session-store";

/**
 * The judge credit (D291, the founder's decision of 28 Sep 2026): a judge, once their own passkey has made their
 * account, types a code, and the treasury sends a fixed amount of AUSD to that account. No account is kept by Viky;
 * the judge keeps their passkey. After it, the pay sheet takes its "the account already holds enough" path.
 *
 * Bounds, all on the server:
 * - the code lives in a Vercel variable (`JUDGE_CODE`, at least 12 characters), never in the repository, which will be
 *   public at submission, and is compared in constant time;
 * - once per account: the row's key is the account, and the treasury's transfer authorization carries a nonce made
 *   from the account, so even a second row could not move money twice;
 * - the amount (`JUDGE_CREDIT_AUSD`) and a ceiling on all credits together (`JUDGE_CREDIT_CAP_AUSD`), both variables;
 *   the ceiling is held by one counter row, raised in the same statement that writes the account's line, so two
 *   requests at once cannot both pass under it (the audit of 1 Oct 2026);
 * - ten tries a day from one connection, whatever the account (`admitJudgeTry`, src/relay-admission.ts);
 * - an email to the operator at each credit, and once a day when a judge is refused at the ceiling;
 * - nothing after the end of 27 Oct 2026, UTC;
 * - five wrong codes and the account can no longer try;
 * - one line per credit in `viky_judge_credits`, which the operator reads with `pnpm judge:credits`, read back from the
 *   token wherever it could disagree with the chain (`giveJudgeCredit`).
 *
 * The money moves as a refund of the phone way does (`refundAusd`): the treasury signs an AUSD transfer authorization
 * and the relayer carries it, so the treasury needs no MON.
 */

export const JUDGE_CREDIT_ENDS = Date.UTC(2026, 9, 28);
export const JUDGE_WRONG_CODES = 5;

/**
 * How long a "sending" line may still become a transfer: the authorization is signed as soon as the line is written,
 * within the route's 60 seconds, and the token accepts it for `AUTHORIZATION_VALIDITY_SECONDS` after that; five minutes
 * more cover the function's time and the clocks. After it, a token that shows the nonce unused means nothing went out.
 */
const JUDGE_SENDING_SETTLED_MINUTES = AUTHORIZATION_VALIDITY_SECONDS / 60 + 5;
const SENDING_SETTLED = `${JUDGE_SENDING_SETTLED_MINUTES} minutes`;

export const JUDGE_CREDIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS viky_judge_credits (
  account text PRIMARY KEY,
  units numeric NOT NULL,
  state text NOT NULL,
  tx_hash text,
  wrong_codes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS viky_judge_credit_total (
  id integer PRIMARY KEY CHECK (id = 1),
  units numeric NOT NULL
);
INSERT INTO viky_judge_credit_total (id, units)
SELECT 1, COALESCE(SUM(units), 0) FROM viky_judge_credits WHERE state IN ('sending', 'sent', 'failed')
ON CONFLICT (id) DO NOTHING
`;

export const JUDGE_REFUSALS = {
  notOpen: "Judge credits are not open on this deployment.",
  ended: "Judge credits ended on 27 Oct 2026.",
  wrongCode: "That is not the judge code.",
  tooManyTries: "Too many wrong codes on this account.",
  already: "This account already received its judge credit.",
  sending: `Your credit is on its way. If it has not arrived in ${JUDGE_SENDING_SETTLED_MINUTES} minutes, type the code again: it can only ever arrive once.`,
  capReached: "No judge credit is left.",
  notSent: "The credit could not be sent just now. Try again in a moment: it can only ever arrive once.",
  treasuryHeld: "Judge credits cannot be sent right now. Try again later: it can only ever arrive once.",
} as const;

export type JudgeCreditConfig = Readonly<{ code: string; units: bigint; capUnits: bigint }>;

/** The three variables, or nothing when any is missing or wrong: then no credit is given at all. */
export function judgeCreditConfig(env: NodeJS.ProcessEnv = process.env): JudgeCreditConfig | null {
  const code = env.JUDGE_CODE?.trim() ?? "";
  const amount = env.JUDGE_CREDIT_AUSD?.trim() ?? "";
  const cap = env.JUDGE_CREDIT_CAP_AUSD?.trim() ?? "";
  if (code.length < 12 || !/^\d+(\.\d{1,6})?$/.test(amount) || !/^\d+(\.\d{1,6})?$/.test(cap)) return null;
  const units = parseUnits(amount, 6);
  const capUnits = parseUnits(cap, 6);
  if (units <= 0n || capUnits < units) return null;
  return { code, units, capUnits };
}

/** Whether a judge may ask for a credit now: configured, and before the end. */
export function judgeCreditOpen(nowMs: number = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  return judgeCreditConfig(env) !== null && nowMs < JUDGE_CREDIT_ENDS;
}

/** The same code, compared in constant time. */
export function sameCode(typed: string, expected: string): boolean {
  const a = Buffer.from(typed.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The transfer authorization's nonce for this account's credit: one account, one nonce, one transfer ever. */
export function judgeCreditNonce(account: string): Hex {
  return keccak256(stringToHex(`viky:judge-credit:v1:${getAddress(account).toLowerCase()}`));
}

let executor: SqlExecutor | undefined;
export function configureJudgeCreditStore(custom: SqlExecutor | undefined): void {
  executor = custom;
  schema = undefined;
}
function sql(): SqlExecutor {
  if (executor) return executor;
  return neon(databaseUrl()) as unknown as SqlExecutor;
}

let schema: Promise<void> | undefined;
/** Made on first use, so a deployment never serves the route before its table exists. Once per instance. */
export function ensureJudgeCreditSchema(): Promise<void> {
  schema ??= (async () => {
    // One statement at a time: the journal, then the one counter row the ceiling is held by, started from the journal.
    for (const statement of JUDGE_CREDIT_SCHEMA.split(";")) {
      const text = statement.trim();
      if (!text) continue;
      const strings = Object.assign([text], { raw: [text] }) as unknown as TemplateStringsArray;
      await sql()(strings);
    }
  })().catch((error: unknown) => {
    schema = undefined;
    throw error;
  });
  return schema;
}

/** `txHash` is the transfer's hash, or, for a credit only the token showed went out, a sentence saying it is unknown. */
export type JudgeCreditRow = Readonly<{ account: string; units: string; state: string; txHash: string | null; wrongCodes: number; createdAt: string }>;

export async function loadJudgeCredits(): Promise<readonly JudgeCreditRow[]> {
  await ensureJudgeCreditSchema();
  const rows = await sql()`SELECT account, units, state, tx_hash, wrong_codes, created_at FROM viky_judge_credits ORDER BY created_at`;
  return rows.map((row) => ({
    account: String(row.account),
    units: String(row.units),
    state: String(row.state),
    txHash: row.tx_hash ? String(row.tx_hash) : null,
    wrongCodes: Number(row.wrong_codes),
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

/** Whether this account received its judge credit: a "sent" line in the journal (D295). */
export async function isJudgeCredited(account: string): Promise<boolean> {
  await ensureJudgeCreditSchema();
  const rows = await sql()`SELECT 1 FROM viky_judge_credits WHERE account = ${getAddress(account).toLowerCase()} AND state = 'sent'`;
  return rows.length > 0;
}

type Send = (input: Readonly<{ to: Hex; ausdUnits: bigint; nonce: Hex }>) => Promise<{ hash: Hex }>;
/** What the treasury may give: its AUSD on Monad, less what it holds for people's phone and gift card orders. */
type Spendable = () => Promise<bigint>;

const BALANCE_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const satisfies Abi;

/**
 * The treasury's AUSD that belongs to nobody else (the money path audit of 27 Sep 2026): the same key receives people's
 * AUSD for their Bitrefill orders and refunds it when an order fails, so a credit is never paid out of that money.
 */
async function treasurySpendable(): Promise<bigint> {
  const [held, orders] = await Promise.all([
    createMonadPublicClient().readContract({ address: AUSD_ADDRESS, abi: BALANCE_ABI, functionName: "balanceOf", args: [treasuryAddress()] }) as Promise<bigint>,
    unsettledOrders(),
  ]);
  return held - orders.reduce((sum, order) => sum + order.ausdUnits, 0n);
}
/** Whether the token has consumed the treasury's authorization with this nonce. */
type AuthorizationUsed = (nonce: Hex) => Promise<boolean>;

const AUTHORIZATION_STATE_ABI = [
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const satisfies Abi;

/**
 * The token's own record, at the finalized block. Only the treasury signs under its name, it signs this nonce for this
 * account's credit alone and never cancels one, so a used nonce means the credit went out, whatever our line says.
 */
async function treasuryAuthorizationUsed(nonce: Hex): Promise<boolean> {
  const treasury = treasuryAddress();
  return (await createMonadPublicClient().readContract({ address: AUSD_ADDRESS, abi: AUTHORIZATION_STATE_ABI, functionName: "authorizationState", args: [treasury, nonce], blockTag: "finalized" })) as boolean;
}

/**
 * A failure's reason for the log: each error's name, code and message down its causes, stopping at the first error of
 * the chain library, whose short message says what failed without the provider's URL or the request's body (which holds
 * the signed authorization).
 */
function why(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth++) {
    if (!(current instanceof Error)) {
      parts.push(String(current).slice(0, 200));
      break;
    }
    const known = current as Error & { code?: unknown; shortMessage?: unknown };
    const code = typeof known.code === "string" || typeof known.code === "number" ? ` ${known.code}` : "";
    const short = typeof known.shortMessage === "string" ? known.shortMessage : undefined;
    parts.push(`${known.name}${code}: ${(short ?? known.message).slice(0, 200)}`);
    if (short !== undefined) break;
    current = known.cause;
  }
  return parts.join(" <- ");
}

/**
 * Gives the account its judge credit, or says why not. Every refusal is typed. The row is written before the money
 * moves ("sending"), counted against the ceiling from then on, and marked "sent" once final. Wherever the line and the
 * chain could disagree, the token is read (`authorizationState` of the treasury and the account's nonce): after a send
 * that failed, since a transfer can land and its wait still fail; before signing again on a "failed" line; and for a
 * "sending" line, which is "sent" once the token shows it, "on its way" while its authorization may still land, and
 * tried again once it no longer can. A send the token shows went nowhere is "failed", may be tried again with the same
 * nonce, so it can never arrive twice, and stays counted against the ceiling meanwhile. Every failure is logged with
 * the account.
 */
export async function giveJudgeCredit(
  input: Readonly<{ account: string; code: string }>,
  deps: Readonly<{ config?: JudgeCreditConfig | null; nowMs?: number; send?: Send; authorizationUsed?: AuthorizationUsed; spendable?: Spendable; tell?: (news: JudgeNews) => Promise<void> }> = {},
): Promise<{ units: string; hash: Hex | null }> {
  const config = deps.config === undefined ? judgeCreditConfig() : deps.config;
  if (!config) throw new GiftApiError("JUDGE_CREDIT_CLOSED", JUDGE_REFUSALS.notOpen, 503);
  if ((deps.nowMs ?? Date.now()) >= JUDGE_CREDIT_ENDS) throw new GiftApiError("JUDGE_CREDIT_ENDED", JUDGE_REFUSALS.ended, 403);
  const account = getAddress(input.account).toLowerCase();
  const nonce = judgeCreditNonce(account);
  await ensureJudgeCreditSchema();

  // The token's answer, or null when it could not be read: a read that failed is never taken for "sent".
  const read = deps.authorizationUsed ?? treasuryAuthorizationUsed;
  const tokenShowsSent = async (): Promise<boolean | null> => {
    try {
      return await read(nonce);
    } catch (error) {
      console.error(`judge credit: the token could not be read for ${account}: ${why(error)}`);
      return null;
    }
  };
  // "sent", with the transfer's hash, or saying it is unknown when only the token showed the credit went out.
  const markSent = (hash: Hex | null) =>
    sql()`UPDATE viky_judge_credits SET state = 'sent', tx_hash = COALESCE(${hash}, tx_hash, ${`unknown: the token shows authorization ${nonce} used`}), updated_at = now() WHERE account = ${account}`;

  const existing = (await sql()`SELECT state, wrong_codes, updated_at < now() - ${SENDING_SETTLED}::interval AS settled FROM viky_judge_credits WHERE account = ${account}`)[0];
  if (existing && Number(existing.wrong_codes) >= JUDGE_WRONG_CODES) throw new GiftApiError("JUDGE_CODE_LOCKED", JUDGE_REFUSALS.tooManyTries, 429);
  if (!sameCode(input.code, config.code)) {
    await sql()`
      INSERT INTO viky_judge_credits (account, units, state, wrong_codes) VALUES (${account}, 0, 'refused', 1)
      ON CONFLICT (account) DO UPDATE SET wrong_codes = viky_judge_credits.wrong_codes + 1, updated_at = now()`;
    throw new GiftApiError("JUDGE_CODE_WRONG", JUDGE_REFUSALS.wrongCode, 403);
  }
  if (existing?.state === "sent") throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);
  if (existing?.state === "sending" || existing?.state === "failed") {
    // Before signing again: the token, not our line, says whether this credit already went out.
    if ((await tokenShowsSent()) === true) {
      await markSent(null);
      throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);
    }
    // While its authorization may still land, nothing is signed again.
    if (existing.state === "sending" && existing.settled !== true) throw new GiftApiError("JUDGE_CREDIT_SENDING", JUDGE_REFUSALS.sending, 409);
  }

  // Never out of money the treasury holds for somebody's order. A reading that fails refuses too: it claims nothing.
  let spendable: bigint | null;
  try {
    spendable = await (deps.spendable ?? treasurySpendable)();
  } catch (error) {
    console.error(`judge credit: what the treasury may give could not be read for ${account}: ${why(error)}`);
    spendable = null;
  }
  if (spendable === null || spendable < config.units) throw new GiftApiError("JUDGE_CREDIT_TREASURY", JUDGE_REFUSALS.treasuryHeld, 503);

  // Claimed in one statement, the counter first and the account's line after it (the audit of 1 Oct 2026). The
  // ceiling used to be a sum read in the statement that inserted the line: two requests at once each read the sum
  // before the other's line existed, and both passed. One row is now raised and compared in place, and a row is
  // changed by one request at a time, the second seeing what the first left. What is counted is everything given, on
  // its way, or on a failed line (which may have landed, and stays its judge's to try again); a line already counted
  // adds nothing. And never more than what the treasury has given plus what it may still give, which a send leaves
  // unchanged. A "sending" line is taken back only once its authorization can no longer land, and by one request alone.
  const units = config.units.toString();
  const add = existing?.state === "sending" || existing?.state === "failed" ? "0" : units;
  const given = BigInt(String((await sql()`SELECT COALESCE(SUM(units), 0) AS units FROM viky_judge_credits WHERE state = 'sent'`)[0]?.units ?? "0").split(".")[0]);
  const within = (given + spendable).toString();
  const claim = (
    await sql()`
      WITH counted AS (
        UPDATE viky_judge_credit_total SET units = units + ${add}::numeric
         WHERE id = 1 AND units + ${add}::numeric <= LEAST(${config.capUnits.toString()}::numeric, ${within}::numeric)
        RETURNING units
      ), written AS (
        INSERT INTO viky_judge_credits (account, units, state)
        SELECT ${account}, ${units}::numeric, 'sending' FROM counted
        ON CONFLICT (account) DO UPDATE SET units = EXCLUDED.units, state = 'sending', updated_at = now()
          WHERE viky_judge_credits.state IN ('refused', 'failed')
            OR (viky_judge_credits.state = 'sending' AND viky_judge_credits.updated_at < now() - ${SENDING_SETTLED}::interval)
        RETURNING account
      )
      SELECT (SELECT count(*) FROM counted)::int AS counted, (SELECT count(*) FROM written)::int AS written`
  )[0];
  if (Number(claim?.written ?? 0) === 0) {
    // Counted and not written: another request holds this account's line. What this one added is taken back out.
    if (Number(claim?.counted ?? 0) === 1 && add !== "0") await sql()`UPDATE viky_judge_credit_total SET units = units - ${add}::numeric WHERE id = 1`;
    const again = (await sql()`SELECT state, updated_at < now() - ${SENDING_SETTLED}::interval AS settled FROM viky_judge_credits WHERE account = ${account}`)[0];
    if (again?.state === "sent") throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);
    if (again?.state === "sending" && again.settled !== true) throw new GiftApiError("JUDGE_CREDIT_SENDING", JUDGE_REFUSALS.sending, 409);
    // Told once a day, so the operator knows the day a judge was turned away.
    await (deps.tell ?? tellOperator)({ kind: "ceiling", account });
    throw new GiftApiError("JUDGE_CREDIT_CAP", JUDGE_REFUSALS.capReached, 409);
  }

  const send = deps.send ?? ((args) => refundAusd(args));
  let hash: Hex | null = null;
  try {
    ({ hash } = await send({ to: getAddress(account), ausdUnits: config.units, nonce }));
  } catch (error) {
    console.error(`judge credit: the send failed for ${account}: ${why(error)}`);
    const closed = error instanceof TreasuryError && error.code === "NOT_CONFIGURED";
    // Nothing was signed without a treasury. Otherwise the transfer may have landed before its wait failed.
    if (closed || (await tokenShowsSent()) !== true) {
      try {
        await sql()`UPDATE viky_judge_credits SET state = 'failed', updated_at = now() WHERE account = ${account} AND state = 'sending'`;
      } catch (journal) {
        console.error(`judge credit: its "failed" line was not written for ${account}: ${why(journal)}`);
      }
      if (closed) throw new GiftApiError("JUDGE_CREDIT_CLOSED", JUDGE_REFUSALS.notOpen, 503);
      throw new GiftApiError("JUDGE_CREDIT_NOT_SENT", JUDGE_REFUSALS.notSent, 503);
    }
    console.error(`judge credit: the token shows ${account}'s credit went out all the same, its hash unknown`);
  }
  // The credit went out. A journal write that fails now leaves the line "sending", counted, and read back from the token
  // on the account's next try; it never makes the line "failed".
  try {
    await markSent(hash);
  } catch (error) {
    console.error(`judge credit sent, its line not written: ${account} ${hash ?? "hash unknown"}: ${why(error)}`);
  }
  await (deps.tell ?? tellOperator)({ kind: "given", account, units: config.units, hash, standing: await judgeCreditsStanding(config).catch(() => null) });
  return { units, hash };
}

export type JudgeStanding = Readonly<{ given: number; left: number }>;

/**
 * How many credits were given and how many are left under the ceiling, counted and never typed: the lines marked
 * sent, and what the counter row leaves. Nothing when judge credits are not open on this deployment.
 */
export async function judgeCreditsStanding(config: JudgeCreditConfig | null = judgeCreditConfig()): Promise<JudgeStanding | null> {
  if (!config) return null;
  await ensureJudgeCreditSchema();
  const row = (await sql()`SELECT (SELECT count(*) FROM viky_judge_credits WHERE state = 'sent')::int AS given, (SELECT units FROM viky_judge_credit_total WHERE id = 1) AS counted`)[0];
  const counted = BigInt(String(row?.counted ?? "0").split(".")[0]);
  const left = counted >= config.capUnits ? 0n : (config.capUnits - counted) / config.units;
  return { given: Number(row?.given ?? 0), left: Number(left) };
}

/** The standing as the judges page says it, or that it could not be read: never a number nobody counted. */
export function standingInWords(standing: JudgeStanding | null): string {
  if (!standing) return "How many credits are left could not be read right now.";
  const given = standing.given === 1 ? "1 credit has been given so far" : `${standing.given} credits have been given so far`;
  return `${given}, ${standing.left} ${standing.left === 1 ? "is" : "are"} left under the ceiling.`;
}

export type JudgeNews = Readonly<{ kind: "given"; account: string; units: bigint; hash: Hex | null; standing: JudgeStanding | null }> | Readonly<{ kind: "ceiling"; account: string }>;

const short = (account: string) => `${account.slice(0, 6)}…${account.slice(-4)}`;

/** The email for each credit, and for a judge refused at the ceiling. The code is never in it. */
export function judgeAlert(news: JudgeNews): { subject: string; text: string } {
  if (news.kind === "ceiling") {
    return {
      subject: "Judge credits: the ceiling is reached",
      text: [`A judge (${short(news.account)}) typed the right code and was told that no credit is left.`, "", "Raise JUDGE_CREDIT_CAP_AUSD if more are meant to be given. The journal: pnpm judge:credits"].join("\n"),
    };
  }
  const amount = `$${(Number(news.units) / 1_000_000).toFixed(2)}`;
  return {
    subject: `Judge credit given: ${amount} to ${short(news.account)}`,
    text: [
      `A judge credit of ${amount} went to ${news.account}.`,
      news.hash ? `Transfer: ${news.hash}` : "Its transfer's hash is unknown: the token shows it went out.",
      news.standing ? `Given so far: ${news.standing.given}. Left under the ceiling: ${news.standing.left}.` : "",
      "",
      "The journal: pnpm judge:credits",
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  };
}

/**
 * Tells the operator, and never fails the credit: at each credit, and once a day when a judge is refused at the
 * ceiling, however many are (one row of the relayer's counts marks the day it was said).
 */
async function tellOperator(news: JudgeNews): Promise<void> {
  try {
    if (news.kind === "ceiling") {
      const row = { scope: "judge:ceiling-told", bucket: bucketOf("day", Date.now()) };
      if (((await countRelays([row])).get(countKey(row)) ?? 0) > 1) return;
    }
    await sendAlert(judgeAlert(news));
  } catch (error) {
    console.error(`judge credit: the operator could not be told: ${why(error)}`);
  }
}
