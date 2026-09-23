import { getAddress, type Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { attestedSource, GOOGLE_HEALTH_ACTIVE_MINUTES, STRAVA_DAY_ACTIVITIES } from "./attested-sources";
import { conditionOfGoal } from "./conditions";
import { openSecret, sealSecret, vaultConfigured } from "./connect-vault";
import { eraseConnection, loadConnection, saveRefreshedTokens, type Connection } from "./connection-store";
import type { PublicCheckInOutcome, PublicCheckInPurpose } from "./duolingo-public-checkin";
import { activeMinutesOf, fitbitConfigured, fitbitDateOfUtcDay, fitbitDayMet, FITBIT_PROVIDER_LABEL, FitbitError, refreshFitbitTokens } from "./fitbit";
import { contractRefusal } from "./gift-api";
import { ATTESTATION_TTL_SECONDS, FITBIT_CONNECTED_PROVIDER_ID, identityPseudonym, serialiseMessage, signCheckIn, STRAVA_CONNECTED_PROVIDER_ID, type CheckInMessage } from "./gift-attestation";
import { checkInDayIndex, readGift, utcDayOf, type GiftState } from "./gift-reader";
import { relayCheckIn } from "./gift-relay";
import { loadGift, loadRelayed, markBound, type GiftRecord } from "./gift-store";
import { consumeAndSaveVerification, saveProofSession } from "./proof-session-store";
import { escrowOf, RelayerError } from "./relayer";
import { distanceOfDay, refreshStravaTokens, stravaConfigured, stravaDayMet, STRAVA_PROVIDER_LABEL, StravaError } from "./strava";

/**
 * The morning reading of a connected source (D188, and Strava beside Fitbit in D191): the third nature, beside the
 * public read (D27) and the shown proof (D162). The person connected once; each morning the keeper opens their sealed
 * key, hands it to the attested fetch as a secret, reads yesterday's page, judges it against the target, and drops
 * it. What is signed for the contract is the verdict, encoded the way the daily contract counts: the metric it
 * carries is the contract's own baseline plus the target when the day was won, and the baseline alone when it was
 * not, so the chain and the journal ever hold a yes or a no and never a number of the person's (rule 2). `bind` is
 * the first reading, right after the connection: it proves the key opens the source's page, binds the account's
 * pseudonym, and opens the window at zero; `count` is every morning after.
 *
 * Each source is one line below: what it is called, which page, how a day is judged, how a key is refreshed. The
 * reading itself is the same for all of them. Every refusal is typed. Ours to fix (the worker, the attestor, a
 * configuration) hold the day open, as for every daily gift; the person's to fix (no connection, a key the source no
 * longer honours) do not, and the screen says so.
 */

/** The keys of a connection, opened for one reading, whichever source they are from. */
export type ConnectedTokens = Readonly<{ accessToken: string; refreshToken: string; expiresAt: number; externalId: string; scope: string }>;

export type ConnectedLine = Readonly<{
  conditionId: string;
  service: "fitbit" | "strava";
  /** The source's name in a sentence. */
  name: string;
  providerLabel: string;
  providerId: Hex;
  sourceId: string;
  /** The application's variables are set where this runs. */
  configured(): boolean;
  refresh(tokens: ConnectedTokens, nowSeconds: number): Promise<ConnectedTokens>;
  /** Whether a refresh refusal is the source no longer honouring the key. */
  keyRefused(error: unknown): boolean;
  /** Yesterday's page, judged: the day met or not, or why it could not be judged. */
  judge(values: Readonly<Record<string, string>>, day: string, dailyTarget: number): Readonly<{ met: boolean }> | Readonly<{ missing: { code: string; message: string } }>;
}>;

const FITBIT_LINE: ConnectedLine = {
  conditionId: "fitbit-daily",
  service: "fitbit",
  name: "Fitbit",
  providerLabel: FITBIT_PROVIDER_LABEL,
  providerId: FITBIT_CONNECTED_PROVIDER_ID,
  sourceId: GOOGLE_HEALTH_ACTIVE_MINUTES.id,
  configured: () => fitbitConfigured(),
  refresh: async (tokens, nowSeconds) => {
    const fresh = await refreshFitbitTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, userId: tokens.externalId, scope: tokens.scope }, nowSeconds);
    return { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, expiresAt: fresh.expiresAt, externalId: fresh.userId, scope: fresh.scope };
  },
  keyRefused: (error) => error instanceof FitbitError && error.code === "REFRESH_REFUSED",
  judge: (values, _day, dailyTarget) => {
    const minutes = activeMinutesOf(values);
    if (minutes === undefined) return { missing: { code: "NO_MINUTES", message: "Fitbit's page carried no active minutes for that day." } };
    return { met: fitbitDayMet(minutes, dailyTarget) };
  },
};

const STRAVA_LINE: ConnectedLine = {
  conditionId: "strava-daily",
  service: "strava",
  name: "Strava",
  providerLabel: STRAVA_PROVIDER_LABEL,
  providerId: STRAVA_CONNECTED_PROVIDER_ID,
  sourceId: STRAVA_DAY_ACTIVITIES.id,
  configured: () => stravaConfigured(),
  refresh: async (tokens, nowSeconds) => {
    const fresh = await refreshStravaTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, athleteId: tokens.externalId, scope: tokens.scope }, nowSeconds);
    return { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, expiresAt: fresh.expiresAt, externalId: fresh.athleteId, scope: fresh.scope };
  },
  keyRefused: (error) => error instanceof StravaError && error.code === "REFRESH_REFUSED",
  judge: (values, day, dailyTarget) => {
    const metres = distanceOfDay(values.activities, day);
    if (metres === undefined) return { missing: { code: "NO_ACTIVITIES", message: "Strava's page carried no list of activities for that day." } };
    return { met: stravaDayMet(metres, dailyTarget) };
  },
};

export const CONNECTED_LINES: readonly ConnectedLine[] = [FITBIT_LINE, STRAVA_LINE];

/** The line a daily gift's goal is on, or nothing when its condition is not a connected one. */
export function connectedLineOf(goalType: number): ConnectedLine | undefined {
  const id = conditionOfGoal(goalType)?.id;
  return CONNECTED_LINES.find((line) => line.conditionId === id);
}

export type ConnectedCheckInDeps = {
  now: () => number;
  read: () => Promise<AttestedReadDeps>;
  refresh: (line: ConnectedLine, tokens: ConnectedTokens, nowSeconds: number) => Promise<ConnectedTokens>;
  configured: (line: ConnectedLine) => boolean;
};

const defaultDeps: ConnectedCheckInDeps = {
  now: () => Math.floor(Date.now() / 1_000),
  read: async () => reclaimAttestedReadDeps(),
  refresh: (line, tokens, nowSeconds) => line.refresh(tokens, nowSeconds),
  // The source must be in the shared list the reading service runs (the founder's redeploy, OPERATIONS step 3):
  // until then the app knows it and the service does not, and nothing is asked of the service.
  configured: (line) => line.configured() && vaultConfigured() && attestedSource(line.sourceId) !== undefined,
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
async function openedTokens(line: ConnectedLine, connection: Connection, nowSeconds: number, deps: ConnectedCheckInDeps): Promise<ConnectedTokens> {
  const tokens: ConnectedTokens = {
    accessToken: openSecret(connection.accessToken),
    refreshToken: openSecret(connection.refreshToken),
    expiresAt: Math.floor(connection.expiresAt.getTime() / 1_000),
    externalId: connection.externalId,
    scope: connection.scope,
  };
  if (tokens.expiresAt > nowSeconds + 60) return tokens;
  const fresh = await deps.refresh(line, tokens, nowSeconds);
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
  const line = connectedLineOf(record.goalType);
  if (!line) return refusal(giftId, "NOT_CONFIGURED", "This gift is not on a connected source.");
  if (!deps.configured(line)) return refusal(giftId, "NOT_CONFIGURED", "Counting is not switched on yet.");
  const connection = await loadConnection(giftId);
  if (!connection || connection.source !== line.service) return { kind: "already", giftId, reason: "no_account" };
  const escrow = escrowOf(record);
  const onChain = await readGift(escrow, giftId);
  if (onChain.cancelled) return { kind: "already", giftId, reason: "cancelled" };
  if (onChain.finalised) return { kind: "already", giftId, reason: "finished" };
  const now = deps.now();
  if (purpose === "count" && !input.force && (await countedToday(giftId, now))) return { kind: "already", giftId, reason: "counted_today" };

  let tokens: ConnectedTokens;
  try {
    tokens = await openedTokens(line, connection, now, deps);
  } catch (error) {
    if (line.keyRefused(error)) {
      // The source no longer honours the key: nothing of it is worth keeping, and the person connects again (rule 3).
      await eraseConnection(giftId);
      return refusal(giftId, "KEY_REFUSED", `${line.name} no longer accepts the connection. Connect ${line.name} again from your gift's page.`);
    }
    if ((error instanceof FitbitError || error instanceof StravaError) && error.code === "NOT_CONFIGURED") return refusal(giftId, "NOT_CONFIGURED", "Counting is not switched on yet.");
    throw error;
  }

  // The day judged: yesterday for a count (the pass runs after midnight UTC), today for the first reading, which
  // proves the key opens the page and counts nothing.
  const day = purpose === "bind" ? utcDayOf(now) : utcDayOf(now) - 1;
  const dayName = fitbitDateOfUtcDay(day);
  const messages: Record<string, string> = {
    FETCH_FAILED: `${line.name} could not be read just now.`,
    PROOF_INVALID: "The reading could not be verified.",
    PROOF_MISMATCH: "The reading could not be verified.",
    NOT_CONFIGURED: "Counting is not switched on yet.",
    WORKER_OUT_OF_DATE: "The reading service is being updated.",
    NOT_FOUND: `${line.name} answered that there is no such day.`,
  };
  let reading: Awaited<ReturnType<typeof attestedRead>>;
  try {
    reading = await attestedRead(line.sourceId, dayName, await deps.read(), tokens.accessToken);
  } catch (error) {
    if (error instanceof AttestedReadError) return refusal(giftId, error.code, messages[error.code] ?? error.message);
    throw error;
  }
  const judged = line.judge(reading.values, dayName, record.dailyTarget);
  if ("missing" in judged) return refusal(giftId, judged.missing.code, judged.missing.message);
  const met = judged.met;

  const recipient = getAddress(record.recipient);
  const message: CheckInMessage = {
    giftId: BigInt(giftId),
    recipient,
    identityHash: identityPseudonym(line.providerLabel, tokens.externalId),
    providerId: line.providerId,
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
    conditionId: line.conditionId,
    account: recipient.toLowerCase(),
    giftId,
    goalType: record.goalType,
    phase: purpose === "bind" ? "baseline" : "check-in",
    dayIndex: checkInDayIndex(onChain, now),
  });
  // The verdict and the day, and nothing of the page: not the numbers, not the proof that carries them (rule 2).
  await consumeAndSaveVerification({
    sessionId,
    evidence: { source: "connected", service: line.service, day: dayName, met, observedAt: reading.observedAt },
    attestation: { message: serialiseMessage(message), signature },
    proofs: null,
  });

  try {
    const relayed = await relayCheckIn(sessionId, escrow);
    if (purpose === "bind") {
      await markBound(giftId, tokens.externalId);
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
