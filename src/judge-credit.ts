import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { getAddress, keccak256, parseUnits, stringToHex, type Abi, type Hex } from "viem";
import { AUTHORIZATION_VALIDITY_SECONDS } from "./ausd-authorization";
import { databaseUrl } from "./database-guard";
import { GiftApiError } from "./gift-api";
import { AUSD_ADDRESS, createMonadPublicClient } from "./monad/chain";
import { refundAusd, treasuryAddress, TreasuryError } from "./phone-treasury";
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
)
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
    const strings = Object.assign([JUDGE_CREDIT_SCHEMA], { raw: [JUDGE_CREDIT_SCHEMA] }) as unknown as TemplateStringsArray;
    await sql()(strings);
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
  deps: Readonly<{ config?: JudgeCreditConfig | null; nowMs?: number; send?: Send; authorizationUsed?: AuthorizationUsed }> = {},
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

  // Claimed in one statement: only while what is given, on its way, or on a failed line (which may have landed, and
  // stays its judge's to try again), this credit included, stays under the ceiling. A "sending" line is taken back only
  // once its authorization can no longer land, and by one request alone.
  const units = config.units.toString();
  const claimed = await sql()`
    INSERT INTO viky_judge_credits (account, units, state)
    SELECT ${account}, ${units}, 'sending'
    WHERE (SELECT COALESCE(SUM(units), 0) FROM viky_judge_credits WHERE state IN ('sending', 'sent', 'failed') AND account <> ${account}) + ${units} <= ${config.capUnits.toString()}
    ON CONFLICT (account) DO UPDATE SET units = EXCLUDED.units, state = 'sending', updated_at = now()
      WHERE viky_judge_credits.state IN ('refused', 'failed')
        OR (viky_judge_credits.state = 'sending' AND viky_judge_credits.updated_at < now() - ${SENDING_SETTLED}::interval)
    RETURNING account`;
  if (claimed.length === 0) {
    const again = (await sql()`SELECT state, updated_at < now() - ${SENDING_SETTLED}::interval AS settled FROM viky_judge_credits WHERE account = ${account}`)[0];
    if (again?.state === "sent") throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);
    if (again?.state === "sending" && again.settled !== true) throw new GiftApiError("JUDGE_CREDIT_SENDING", JUDGE_REFUSALS.sending, 409);
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
  return { units, hash };
}
