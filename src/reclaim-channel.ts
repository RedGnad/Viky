/**
 * Which Reclaim delivery channel carries a verification. Ported from Lock-in, where it was written but
 * never wired; Viky's session route passes both option sets to the SDK, so the channel is a setting.
 *
 * This is a product decision, not a technical detail, so it is a setting rather than a hardcoded call:
 *
 * - `portal` (the SDK default) runs the verification in a REMOTE browser. The user's own Duolingo or
 *   Strava session is never used, so they authenticate again inside that remote browser on every
 *   check-in.
 * - `app` hands the flow to the Reclaim Verifier on the user's device, where a session can persist
 *   between check-ins.
 *
 * Nothing here asserts that either channel persists a login: that is exactly what has to be measured
 * before the product opens to users (spike S1). Cookie-retention policy (`isRecurring`,
 * `canClearWebStorage`) lives in the Reclaim application configuration and the InApp SDK, not in this
 * web SDK, so it cannot be set from here and must be confirmed on the Reclaim dashboard.
 */
export type ReclaimChannel = "portal" | "app";

export const DEFAULT_RECLAIM_CHANNEL: ReclaimChannel = "portal";

export class ReclaimChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReclaimChannelError";
  }
}

/** Reads the configured channel. Unknown values fail closed rather than silently falling back. */
export function resolveReclaimChannel(value = process.env.RECLAIM_VERIFICATION_MODE): ReclaimChannel {
  const raw = value?.trim().toLowerCase();
  if (!raw) return DEFAULT_RECLAIM_CHANNEL;
  if (raw === "portal" || raw === "app") return raw;
  throw new ReclaimChannelError(`RECLAIM_VERIFICATION_MODE must be "portal" or "app", received "${value}"`);
}

/**
 * The channel one session runs on. A university's portal, read through a provider Reclaim's agent wrote, runs on the
 * portal whatever the setting says (7 Oct 2026, the first real university proof): in `app` mode the agent did nothing
 * for the Université de Toulouse, and in `portal` mode the proof was made from the phone alone. The setting still
 * decides for every other source, and production keeps it on `portal`.
 */
export function channelFor(source: Readonly<{ witness: boolean }>, value = process.env.RECLAIM_VERIFICATION_MODE): ReclaimChannel {
  return source.witness ? "portal" : resolveReclaimChannel(value);
}

/**
 * Init options for the channel. `useAppClip` belongs to ProofRequestOptions; the deferred deep link does
 * NOT, it lives in the launch options below.
 */
export function reclaimChannelInitOptions(channel: ReclaimChannel): { useAppClip?: boolean } {
  return channel === "app" ? { useAppClip: true } : {};
}

/**
 * Launch options for `getRequestUrl`, typed as the SDK's ReclaimFlowInitOptions. In app mode the deferred
 * deep link means a user without the Verifier installed still lands back in the flow after installing,
 * instead of hitting a dead end.
 */
export function reclaimChannelLaunchOptions(channel: ReclaimChannel): {
  verificationMode: ReclaimChannel;
  canUseDeferredDeepLinksFlow?: boolean;
} {
  return channel === "app" ? { verificationMode: "app", canUseDeferredDeepLinksFlow: true } : { verificationMode: "portal" };
}
