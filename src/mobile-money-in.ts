/**
 * The mobile money way in (the founder, 8 Oct 2026): a payer's mobile money becomes a dollar on their own account,
 * through Switch, and the converter of card payments changes it into what a gift holds. Browser safe, pure.
 *
 * It is open wherever Switch can open a collection (the founder: "it opens to everybody at deployment, wherever
 * /coverage returns it"): no setting is needed to open it, only the service key. One setting closes it without a
 * deployment, `MOBILE_MONEY_IN=off`, for the day Switch must be stopped at once.
 *
 * Nobody has paid this way, and on 8 Oct 2026 nobody could: Switch's coverage lists eighteen countries and prices
 * them, and refuses to open a collection in any of them, in its sandbox, for want of requirements it has not
 * published (src/switch.ts). So the offer asks for those requirements as well as the coverage, offers nothing today,
 * and opens by itself the day Switch publishes them. No screen offers it, and no collection has been opened by Viky.
 */
export function mobileMoneyInOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.MOBILE_MONEY_IN?.trim().toLowerCase() !== "off" && Boolean(env.SWITCH_SERVICE_KEY?.trim());
}
