import { getAddress } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { attestedSource } from "./attested-sources";
import { FITBIT_DAILY_SUMMARY } from "./fitbit-source";
import { openSecret, sealSecret, vaultConfigured } from "./connect-vault";
import { eraseConnection, loadConnection, saveRefreshedTokens, type Connection } from "./connection-store";
import type { PublicCheckInOutcome, PublicCheckInPurpose } from "./duolingo-public-checkin";
import { activeMinutesOf, fitbitConfigured, fitbitDateOfUtcDay, fitbitDayMet, FITBIT_PROVIDER_LABEL, FitbitError, refreshFitbitTokens, type FitbitTokens } from "./fitbit";
import { contractRefusal } from "./gift-api";
import { ATTESTATION_TTL_SECONDS, FITBIT_CONNECTED_PROVIDER_ID, identityPseudonym, serialiseMessage, signCheckIn, type CheckInMessage } from "./gift-attestation";
import { checkInDayIndex, readGift, utcDayOf, type GiftState } from "./gift-reader";
import { relayCheckIn } from "./gift-relay";
import { loadGift, loadRelayed, markBound, type GiftRecord } from "./gift-store";
import { consumeAndSaveVerification, saveProofSession } from "./proof-session-store";
import { escrowOf, RelayerError } from "./relayer";

/**
 * The morning reading of a connected source (D188): the third nature, beside the public read (D27) and the shown
 * proof (D162). The person connected once; each morning the keeper opens their sealed key, hands it to the attested
 * fetch as a secret, reads yesterday's summary, judges it against the target, and drops it. What is signed for the
 * contract is the verdict, encoded the way the daily contract counts: the metric it carries is the contract's own
 * baseline plus the target when the day was won, and the baseline alone when it was not, so the chain and the
 * journal ever hold a yes or a no and never a number of the person's (rule 2). `bind` is the first reading, right
 * after the connection: it proves the key opens Fitbit's page, binds the account's pseudonym, and opens the window
 * at zero; `count` is every morning after.
 *
 * Every refusal is typed. Ours to fix (the worker, the attestor, a configuration) hold the day open, as for every
 * daily gift; the person's to fix (no connection, a key Fitbit no longer honours) do not, and the screen says so.
 */

export type ConnectedCheckInDeps = {
  now: () => number;
  read: () => Promise<AttestedReadDeps>;
  refresh: (tokens: FitbitTokens, nowSeconds: number) => Promise<FitbitTokens>;
  configured: () => boolean;
};

const defaultDeps: ConnectedCheckInDeps = {
  now: () => Math.floor(Date.now() / 1_000),
  read: async () => reclaimAttestedReadDeps(),
  refresh: (tokens, nowSeconds) => refreshFitbitTokens(tokens, nowSeconds),
  // The source must be in the shared list the reading service runs (the founder's redeploy, OPERATIONS step 3):
  // until then the app knows it and the service does not, and nothing is asked of the service.
  configured: () => fitbitConfigured() && vaultConfigured() && attestedSource(FITBIT_DAILY_SUMMARY.id) !== undefined,
};

function refusal(giftId: string, code: string, message: string): PublicCheckInOutcome {
  return { kind: "refused", giftId, code, message };
}

async function countedToday(giftId: string, nowSeconds: number): Promise<boolean> {
  const today = utcDayOf(nowSeconds);
  const relayed = await loadRelayed(giftId);
  return relayed.some((entry) => entry.kind === "check-in" && entry.sessionId?.startsWith(`connected:${giftId}:count:${today}:`));
}

/** The keys, opened for this reading alone, refreshed when the access key has run out, and sealed again if so. */
async function openedTokens(connection: Connection, nowSeconds: number, deps: ConnectedCheckInDeps): Promise<FitbitTokens> {
  const tokens: FitbitTokens = {
    accessToken: openSecret(connection.accessToken),
    refreshToken: openSecret(connection.refreshToken),
    expiresAt: Math.floor(connection.expiresAt.getTime() / 1_000),
    userId: connection.externalId,
    scope: connection.scope,
  };
  if (tokens.expiresAt > nowSeconds + 60) return tokens;
  const fresh = await deps.refresh(tokens, nowSeconds);
  await saveRefreshedTokens(connection.giftId, { accessToken: sealSecret(fresh.accessToken), refreshToken: sealSecret(fresh.refreshToken), expiresAt: new Date(fresh.expiresAt * 1_000) });
  return fresh;
}

/** The metric the contract counts from: its own baseline, plus the target when the day was won (rule 2). */
export function verdictMetric(onChain: Pick<GiftState, "baselineValue" | "dailyTarget">, purpose: PublicCheckInPurpose, met: boolean): bigint {
  if (purpose === "bind") return 0n;
  return onChain.baselineValue + (met ? BigInt(onChain.dailyTarget) : 0n);
}

export async function runConnectedCheckIn(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean }, deps: ConnectedCheckInDeps = defaultDeps): Promise<PublicCheckInOutcome> {
  const { giftId, purpose } = input;
  const record: GiftRecord | null = await loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  if (purpose === "bind" && record.boundAt) return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "count" && !record.boundAt) return { kind: "already", giftId, reason: "not_bound" };
  if (!deps.configured()) return refusal(giftId, "NOT_CONFIGURED", "Counting is not switched on yet.");
  const connection = await loadConnection(giftId);
  if (!connection) return { kind: "already", giftId, reason: "no_account" };

  const escrow = escrowOf(record);
  const onChain = await readGift(escrow, giftId);
  if (onChain.cancelled) return { kind: "already", giftId, reason: "cancelled" };
  if (onChain.finalised) return { kind: "already", giftId, reason: "finished" };
  const now = deps.now();
  if (purpose === "count" && !input.force && (await countedToday(giftId, now))) return { kind: "already", giftId, reason: "counted_today" };

  let tokens: FitbitTokens;
  try {
    tokens = await openedTokens(connection, now, deps);
  } catch (error) {
    if (error instanceof FitbitError && error.code === "REFRESH_REFUSED") {
      // Fitbit no longer honours the key: nothing of it is worth keeping, and the person connects again (rule 3).
      await eraseConnection(giftId);
      return refusal(giftId, "KEY_REFUSED", "Fitbit no longer accepts the connection. Connect Fitbit again from your gift's page.");
    }
    if (error instanceof FitbitError && error.code === "NOT_CONFIGURED") return refusal(giftId, "NOT_CONFIGURED", "Counting is not switched on yet.");
    throw error;
  }

  // The day judged: yesterday for a count (the pass runs after midnight UTC), today for the first reading, which
  // proves the key opens the page and counts nothing.
  const day = purpose === "bind" ? utcDayOf(now) : utcDayOf(now) - 1;
  const messages: Record<string, string> = {
    FETCH_FAILED: "Fitbit could not be read just now.",
    PROOF_INVALID: "The reading could not be verified.",
    PROOF_MISMATCH: "The reading could not be verified.",
    NOT_CONFIGURED: "Counting is not switched on yet.",
    WORKER_OUT_OF_DATE: "The reading service is being updated.",
    NOT_FOUND: "Fitbit answered that there is no such day.",
  };
  let reading: Awaited<ReturnType<typeof attestedRead>>;
  try {
    reading = await attestedRead(FITBIT_DAILY_SUMMARY.id, fitbitDateOfUtcDay(day), await deps.read(), tokens.accessToken);
  } catch (error) {
    if (error instanceof AttestedReadError) return refusal(giftId, error.code, messages[error.code] ?? error.message);
    throw error;
  }
  const minutes = activeMinutesOf(reading.values);
  if (minutes === undefined) return refusal(giftId, "NO_MINUTES", "Fitbit's page carried no active minutes for that day.");
  const met = fitbitDayMet(minutes, record.dailyTarget);

  const recipient = getAddress(record.recipient);
  const message: CheckInMessage = {
    giftId: BigInt(giftId),
    recipient,
    identityHash: identityPseudonym(FITBIT_PROVIDER_LABEL, tokens.userId),
    providerId: FITBIT_CONNECTED_PROVIDER_ID,
    metricValue: verdictMetric(onChain, purpose, met),
    observedAt: BigInt(reading.observedAt),
    nullifier: reading.nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  const signature = await signCheckIn(message, escrow);
  const sessionId = `connected:${giftId}:${purpose}:${utcDayOf(now)}:${reading.nullifier.slice(2, 18)}`;
  await saveProofSession({
    sessionId,
    conditionId: "fitbit-daily",
    account: recipient.toLowerCase(),
    giftId,
    goalType: record.goalType,
    phase: purpose === "bind" ? "baseline" : "check-in",
    dayIndex: checkInDayIndex(onChain, now),
  });
  // The verdict and the day, and nothing of the summary: not the minutes, not the proof that carries them (rule 2).
  await consumeAndSaveVerification({
    sessionId,
    evidence: { source: "connected", service: "fitbit", day: fitbitDateOfUtcDay(day), met, observedAt: reading.observedAt },
    attestation: { message: serialiseMessage(message), signature },
    proofs: null,
  });

  try {
    const relayed = await relayCheckIn(sessionId, escrow);
    if (purpose === "bind") {
      await markBound(giftId, tokens.userId);
      return { kind: "bound", giftId, xp: 0, hash: relayed.hash, unit: "verdicts" };
    }
    return { kind: "counted", giftId, xp: met ? 1 : 0, creditedDays: relayed.creditedDays, hash: relayed.hash, unit: "verdicts" };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const mapped = contractRefusal(error.contractError);
      return refusal(giftId, mapped?.code ?? error.contractError ?? "REFUSED", mapped?.message ?? "The contract refused this reading.");
    }
    throw error;
  }
}
