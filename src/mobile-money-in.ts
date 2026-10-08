/**
 * The mobile money way in (the founder, 8 Oct 2026): a payer's mobile money becomes a dollar on their own account,
 * through Switch, and the converter of card payments changes it into what a gift holds. Browser safe, pure.
 *
 * It is open wherever Switch collects (the founder: "it opens to everybody at deployment, wherever /coverage returns
 * it"): no setting is needed to open it, only the service key. One setting closes it without a deployment,
 * `MOBILE_MONEY_IN=off`, for the day Switch must be stopped at once.
 *
 * Nobody has paid this way yet, and no collection has been opened: what the payer does on their phone after the
 * opening is documented nowhere (src/switch.ts), so no screen offers it until that has been seen.
 */
export function mobileMoneyInOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.MOBILE_MONEY_IN?.trim().toLowerCase() !== "off" && Boolean(env.SWITCH_SERVICE_KEY?.trim());
}
