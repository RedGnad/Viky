import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { getAddress, keccak256, parseUnits, stringToHex, type Hex } from "viem";
import { databaseUrl } from "./database-guard";
import { GiftApiError } from "./gift-api";
import { refundAusd, TreasuryError } from "./phone-treasury";
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
 * - one line per credit in `viky_judge_credits`, which the operator reads with `pnpm judge:credits`.
 *
 * The money moves as a refund of the phone way does (`refundAusd`): the treasury signs an AUSD transfer authorization
 * and the relayer carries it, so the treasury needs no MON.
 */

export const JUDGE_CREDIT_ENDS = Date.UTC(2026, 9, 28);
export const JUDGE_WRONG_CODES = 5;

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
  capReached: "The judge credits are all given.",
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

type Send = (input: Readonly<{ to: Hex; ausdUnits: bigint; nonce: Hex }>) => Promise<{ hash: Hex }>;

/**
 * Gives the account its judge credit, or says why not. Every refusal is typed. The row is written before the money
 * moves ("sending"), counted against the ceiling from then on, and marked "sent" with its hash once final; a send that
 * failed is marked "failed" and may be tried again, with the same nonce, so it can never arrive twice.
 */
export async function giveJudgeCredit(
  input: Readonly<{ account: string; code: string }>,
  deps: Readonly<{ config?: JudgeCreditConfig | null; nowMs?: number; send?: Send }> = {},
): Promise<{ units: string; hash: Hex }> {
  const config = deps.config === undefined ? judgeCreditConfig() : deps.config;
  if (!config) throw new GiftApiError("JUDGE_CREDIT_CLOSED", JUDGE_REFUSALS.notOpen, 503);
  if ((deps.nowMs ?? Date.now()) >= JUDGE_CREDIT_ENDS) throw new GiftApiError("JUDGE_CREDIT_ENDED", JUDGE_REFUSALS.ended, 403);
  const account = getAddress(input.account).toLowerCase();
  await ensureJudgeCreditSchema();

  const existing = (await sql()`SELECT state, wrong_codes FROM viky_judge_credits WHERE account = ${account}`)[0];
  if (existing && Number(existing.wrong_codes) >= JUDGE_WRONG_CODES) throw new GiftApiError("JUDGE_CODE_LOCKED", JUDGE_REFUSALS.tooManyTries, 429);
  if (!sameCode(input.code, config.code)) {
    await sql()`
      INSERT INTO viky_judge_credits (account, units, state, wrong_codes) VALUES (${account}, 0, 'refused', 1)
      ON CONFLICT (account) DO UPDATE SET wrong_codes = viky_judge_credits.wrong_codes + 1, updated_at = now()`;
    throw new GiftApiError("JUDGE_CODE_WRONG", JUDGE_REFUSALS.wrongCode, 403);
  }
  if (existing && (existing.state === "sent" || existing.state === "sending")) throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);

  // Claimed in one statement: only while what is given or on its way, this credit included, stays under the ceiling.
  const units = config.units.toString();
  const claimed = await sql()`
    INSERT INTO viky_judge_credits (account, units, state)
    SELECT ${account}, ${units}, 'sending'
    WHERE (SELECT COALESCE(SUM(units), 0) FROM viky_judge_credits WHERE state IN ('sending', 'sent') AND account <> ${account}) + ${units} <= ${config.capUnits.toString()}
    ON CONFLICT (account) DO UPDATE SET units = EXCLUDED.units, state = 'sending', updated_at = now()
      WHERE viky_judge_credits.state IN ('refused', 'failed')
    RETURNING account`;
  if (claimed.length === 0) {
    const again = (await sql()`SELECT state FROM viky_judge_credits WHERE account = ${account}`)[0];
    if (again && (again.state === "sent" || again.state === "sending")) throw new GiftApiError("JUDGE_ALREADY_CREDITED", JUDGE_REFUSALS.already, 409);
    throw new GiftApiError("JUDGE_CREDIT_CAP", JUDGE_REFUSALS.capReached, 409);
  }

  const send = deps.send ?? ((args) => refundAusd(args));
  try {
    const { hash } = await send({ to: getAddress(account), ausdUnits: config.units, nonce: judgeCreditNonce(account) });
    await sql()`UPDATE viky_judge_credits SET state = 'sent', tx_hash = ${hash}, updated_at = now() WHERE account = ${account}`;
    return { units, hash };
  } catch (error) {
    await sql()`UPDATE viky_judge_credits SET state = 'failed', updated_at = now() WHERE account = ${account}`;
    if (error instanceof TreasuryError && error.code === "NOT_CONFIGURED") throw new GiftApiError("JUDGE_CREDIT_CLOSED", JUDGE_REFUSALS.notOpen, 503);
    throw new GiftApiError("JUDGE_CREDIT_NOT_SENT", JUDGE_REFUSALS.notSent, 503);
  }
}
