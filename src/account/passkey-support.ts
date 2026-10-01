import { embeddedIn, handsetOf, iosVersionOf, passkeyEnvironmentProblem, type EmbeddedApp, type Handset } from "./errors";

/**
 * The door to an account, as this browser stands before anybody presses anything (the founder, 1 Oct 2026).
 *
 * A first outside tester was stopped here: an iPhone, a gift's link opened from an Instagram message, a grey button
 * and "This computer has no Face ID". Two things were wrong. The page sat inside Instagram's own page, where no
 * passkey can be made, and nothing said so; and the one question asked of the device, whether it has a platform
 * authenticator, is answered "no" by phones that have one: iOS 26.2 answers no in every browser but Safari, and no in
 * Safari itself while no password manager is turned on.
 *
 * So the door is read in this order. First what cannot be helped here: an iPhone below iOS 18, where the passkey Viky
 * derives an account from does not exist (Mera's authenticator table: Safari with iCloud Keychain, iOS 18 and later).
 * Then where the page is: inside another app's page, or in a browser known never to answer the passkey prompt, the
 * account is made elsewhere, and the door says where. Then what the device says of itself, by
 * `getClientCapabilities()` where the browser has it and by the older question otherwise; a "no" there closes
 * nothing: the button stays, the gesture decides, and what to do is said if it fails.
 *
 * What none of this can tell is whether the PRF extension works, which is what Viky derives the account from: that
 * is only knowable by trying, and the typed `PRF_UNAVAILABLE` failure still carries it.
 */
export type Door =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "ready" }>
  /** An iPhone whose system is older than the passkey an account is made from. */
  | Readonly<{ kind: "outdated" }>
  /** The account cannot be made on this page: `app` is the app the page is inside, or null for a browser that cannot. */
  | Readonly<{ kind: "elsewhere"; handset: Handset; app: EmbeddedApp | null }>
  /** The device did not say it can make a passkey. The button stays, and the gesture decides. */
  | Readonly<{ kind: "unsure"; handset: Handset }>;

/** The first iOS whose passkeys carry what an account is derived from. */
export const FIRST_IOS = 18;

/**
 * The door from what is known, with no browser around it. `platformAuthenticator` is null when the device would not
 * say; `standalone` is null where it cannot be known whether the page is Viky's own installed app (the server).
 */
export function doorOf(input: Readonly<{ userAgent: string; hasWebAuthn: boolean; platformAuthenticator: boolean | null; standalone?: boolean | null }>): Door {
  const handset = handsetOf(input.userAgent);
  const ios = iosVersionOf(input.userAgent);
  if (ios !== null && ios < FIRST_IOS) return { kind: "outdated" };
  const standalone = input.standalone ?? null;
  if (passkeyEnvironmentProblem(input.userAgent, input.hasWebAuthn, standalone)) return { kind: "elsewhere", handset, app: embeddedIn(input.userAgent, standalone) };
  return input.platformAuthenticator === true ? { kind: "ready" } : { kind: "unsure", handset };
}

type Capabilities = Readonly<Record<string, boolean | undefined>>;

/** What the device says of itself: the newer answer where the browser has it (true on iOS 26.2 where the older one is false). */
async function platformAuthenticator(): Promise<boolean | null> {
  const credentials = window.PublicKeyCredential as typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Capabilities> };
  try {
    if (typeof credentials.getClientCapabilities === "function") {
      const told = (await credentials.getClientCapabilities()).userVerifyingPlatformAuthenticator;
      if (typeof told === "boolean") return told;
    }
  } catch {
    // A browser that has the question and refuses to answer it is asked the older one.
  }
  try {
    return await credentials.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return null;
  }
}

/** The door of this browser. Where the page is comes first, and settles it alone when the account is made elsewhere. */
export async function readDoor(standalone: boolean): Promise<Door> {
  if (typeof window === "undefined") return { kind: "checking" };
  const userAgent = window.navigator.userAgent;
  const hasWebAuthn = typeof window.PublicKeyCredential !== "undefined";
  const before = doorOf({ userAgent, hasWebAuthn, platformAuthenticator: null, standalone });
  if (before.kind === "elsewhere" || before.kind === "outdated") return before;
  return doorOf({ userAgent, hasWebAuthn, platformAuthenticator: await platformAuthenticator(), standalone });
}

/** The browser a page is sent to, by the name its owner knows it by: Safari, Chrome, or the phone's own. */
export type OwnBrowser = "safari" | "chrome" | "browser";

/**
 * The same page, opened in the phone's own browser: the address a press goes to, or nothing where no such address
 * exists and the link is copied instead. Always a real link the person presses, never a jump the page makes by itself.
 *
 * None of these is proven by us (reports gathered on 1 Oct 2026, to be tried on real phones). On Android, an intent
 * with no application named is handed to the phone's own browser: reported working inside Instagram, Facebook,
 * Messenger and Telegram, and not inside TikTok. On an iPhone, Instagram hands a page to Safari on its own
 * `instagram://extbrowser/`, and every other app is asked with `x-safari-https`, on which two sources disagree. A
 * browser that is no app's page and cannot make a passkey is sent to Chrome by name, since the phone's own browser
 * may be that very one. Where the press opens nothing, the page stays and says where the app's own menu is.
 */
export function wayOut(href: string, handset: Handset, app: EmbeddedApp | null): Readonly<{ browser: OwnBrowser; href: string }> | null {
  let page: URL;
  try {
    page = new URL(href);
  } catch {
    return null;
  }
  if (page.protocol !== "https:" && page.protocol !== "http:") return null;
  if (handset === "iphone") {
    if (app?.key === "instagram") return { browser: "safari", href: `instagram://extbrowser/?url=${encodeURIComponent(page.href)}` };
    return { browser: "safari", href: `x-safari-${page.href}` };
  }
  if (handset === "android") {
    const intent = `intent://${page.host}${page.pathname}${page.search}#Intent;scheme=${page.protocol.slice(0, -1)}`;
    return app ? { browser: "browser", href: `${intent};end` } : { browser: "chrome", href: `${intent};package=com.android.chrome;end` };
  }
  return null;
}
