/**
 * The account's door asked for by the page that was just left (the founder, 4 Oct 2026): asking for another account
 * leads straight to the door, the panel where an account is signed in to or made. It used to leave the person on
 * "You, not signed in on this device", a page with nothing to do but press "Sign in" again. Signing out does not ask
 * for it (9 Oct 2026): it closes the session and arrives on the landing, with nothing opened.
 *
 * Kept for the visit and read once: the landing that arrives opens the door, and a later visit to it does not.
 */
const KEY = "viky.door.asked";

export function askForTheDoor(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // A browser that keeps nothing lands on the page for nobody with its door shut, one press away.
  }
}

/** Whether the door was asked for, forgotten as it is read. */
export function doorWasAskedFor(): boolean {
  try {
    const asked = window.sessionStorage.getItem(KEY) === "1";
    if (asked) window.sessionStorage.removeItem(KEY);
    return asked;
  } catch {
    return false;
  }
}
