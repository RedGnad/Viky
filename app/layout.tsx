import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { Address } from "viem";
import { ACCOUNT_AUTH_COOKIE_NAME, normalizedOrigin, readAccountAuthSessionFrom } from "@/src/account-auth-server";
import { APPEARANCE_COOKIE } from "@/src/theme";
import { loadPreferences } from "@/src/preferences-store";
import type { ReactNode } from "react";
import "./globals.css";
import { dmSans, fredoka } from "./fonts";
import { AccountProvider } from "@/src/account/provider";
import { MONEY_BOOT_SCRIPT } from "@/src/money-boot";
import { THEME_BOOT_SCRIPT } from "@/src/theme";
import { Pressed } from "./kit/Pressed";
import { Register } from "./serwist/Register";

const APP_NAME = "Viky";
const APP_DEFAULT_TITLE = "Viky";
const APP_TITLE_TEMPLATE = "%s, Viky";
const APP_DESCRIPTION =
  "The money is already in their name. Every day they miss, a piece comes back to you.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

/**
 * The viewport, exactly as web.dev recommends it, plus the one addition a phone-shaped app needs.
 *
 * `width=device-width, initial-scale=1` and nothing else: `maximum-scale` and `user-scalable` are left unset
 * because they "can prevent the user from zooming the viewport, potentially causing accessibility issues",
 * and an audit fails a page that sets them. `viewport-fit=cover` is what makes `env(safe-area-inset-*)` work
 * at all, and without it the insets in globals.css would be padding nothing. It also means the page now
 * renders behind rounded corners and notches, which is why those insets exist.
 */
/**
 * The colour the browser paints its own bar with (D159). One colour, not one per appearance: the two the page used
 * to declare followed the device rather than the choice, so somebody reading by day on a phone set to night had a
 * black bar over a lavender page, and a reload brought it back because the metas are rendered again at hydration.
 * It is decided here, where the choice is known, and it is the ground the screen actually stands on.
 */
const GROUNDS = { light: "#DDD6EB", dark: "#151026" } as const;

export async function generateViewport(): Promise<Viewport> {
  const chosen = await chosenAppearance();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: chosen
      ? GROUNDS[chosen]
      : [
          // Nobody has chosen, so the device decides, and the bar decides with it.
          { media: "(prefers-color-scheme: light)", color: GROUNDS.light },
          { media: "(prefers-color-scheme: dark)", color: GROUNDS.dark },
        ],
  };
}

/**
 * Who this page is for, read where the server has it: the session cookie and the host it was served on (D156). A
 * cookie that is missing, expired, or from another origin means nobody, which is what it meant before. Reading the
 * request here makes every screen render on request rather than at build time, and that is the point: a screen for
 * a person cannot be drawn before the person is known.
 */
/**
 * Day or night as it was chosen, for this device or for this account, or nothing while the device still decides.
 *
 * The device's own cookie answers first: it is the last press on the phone in your hand, it costs no database, and
 * it is there for somebody with no account at all. The account answers for a device that has never been told, which
 * is a new phone, a browser that forgot, or the installed app beside the browser the choice was made in.
 */
async function chosenAppearance(): Promise<"light" | "dark" | null> {
  const onTheDevice = (await cookies()).get(APPEARANCE_COOKIE)?.value;
  if (onTheDevice === "light" || onTheDevice === "dark") return onTheDevice;
  const account = await whoIsSignedIn();
  if (!account) return null;
  try {
    return (await loadPreferences(account)).appearance;
  } catch {
    // A database that cannot be reached is a device that decides for itself, which is what it did before.
    return null;
  }
}

async function whoIsSignedIn(): Promise<Address | undefined> {
  try {
    const [store, sent] = await Promise.all([cookies(), headers()]);
    const host = sent.get("x-forwarded-host") ?? sent.get("host");
    if (!host) return undefined;
    const proto = sent.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    return readAccountAuthSessionFrom(store.get(ACCOUNT_AUTH_COOKIE_NAME)?.value ?? null, normalizedOrigin(`${proto}://${host}`)).account;
  } catch {
    return undefined;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const signedIn = await whoIsSignedIn();
  /**
   * Day or night as this account chose it, written on the document itself (D159). The device answers first, before
   * anything is painted, and this is what carries the choice to a device that has never been told: a new phone, a
   * browser that forgot, the installed app beside the browser it was chosen in.
   */
  const chosen = await chosenAppearance();
  return (
    // The look's font variables sit on the document itself, because app/globals.css reads them from :root.
    // Signed in, the card's figures wait for the account's money and the rate (D157): the server knows the person,
    // so the server says the figures are about to change, as the boot script does for a device that kept a card.
    <html
      lang="en"
      dir="ltr"
      className={`${fredoka.variable} ${dmSans.variable}`}
      {...(chosen ? { "data-theme": chosen } : {})}
      {...(signedIn ? { "data-money-settling": "" } : {})}
    >
      <body className="antialiased">
        {/* Before anything is painted, so a chosen appearance never flashes the other one first (D97), and so a card
            whose figures are about to change shows none until they have (D155). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT + MONEY_BOOT_SCRIPT }} />
        {/* The worker is registered by `Register`, not by the provider, so a browser that refuses one is refused
            quietly rather than throwing on every screen (D150).
            `reloadOnOnline` is off (D153): the library reloads the whole page on every `online` event, which a phone
            fires when it finishes connecting, wakes, or changes network. That is the second load of the landing the
            founder kept seeing on his phone and never on a desktop. A page does not restart itself under somebody. */}
        <SerwistProvider swUrl="/serwist/sw.js" register={false} reloadOnOnline={false}>
          <Register />
          {/* A press a finger can see, on every control, once (D154). */}
          <Pressed />
          <AccountProvider initialAccount={signedIn}>{children}</AccountProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
