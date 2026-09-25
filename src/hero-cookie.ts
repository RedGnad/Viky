/**
 * Whether the landing's hero moment has played in this browser session (D214).
 *
 * The character rises from behind the card once per visit, the first time the landing is drawn in a tab. Every load
 * after that, in the same session, draws it standing and still, because a moment that replayed on every reload was
 * the same screen going out and coming back (D198). A session cookie, no age: the browser forgets it when the session
 * ends, and the next visit plays the moment again. The server reads it while it draws the page, so the first image is
 * already the right one and hydration agrees.
 */
export const HERO_COOKIE = "viky.hero";

export const heroPlayedFromCookie = (value: string | undefined | null): boolean => value === "1";

/** The cookie gone: a sign-out is a new visit, and the landing it arrives on plays its moment again (D258). */
export function heroCookieCleared(secure: boolean): string {
  return `${HERO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The cookie as the browser writes it once the moment has played: for the session, this site only. */
export function heroCookieText(secure: boolean): string {
  return `${HERO_COOKIE}=1; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
