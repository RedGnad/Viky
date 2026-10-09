/**
 * The name a passkey carries in the device's own list (iCloud Keychain, Google Password Manager, Windows Hello). It
 * lives there and nowhere else: it is never sent to Viky's server, never stored by the app, never written on chain.
 *
 * No screen asks for it (the UI pass of 8 Oct 2026: the device names the key itself). So that two accounts made on
 * one device can be told apart in that list, the name ends with the day and the hour the account was made, on the
 * device's own clock (the audit of that day: both were "Viky account", and a judge who made two could not tell which
 * was which). Pure and browser safe.
 */
export const DEFAULT_PASSKEY_LABEL = "Viky account";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Viky account, 8 Oct 14:32": the label, then when it was made. */
export function defaultPasskeyLabel(now: Date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${DEFAULT_PASSKEY_LABEL}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${two(now.getHours())}:${two(now.getMinutes())}`;
}
