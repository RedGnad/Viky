import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { anton, dmSans } from "./fonts";
import { AccountProvider } from "@/src/account/provider";
import { THEME_BOOT_SCRIPT } from "@/src/theme";

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
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    // The poster look's grounds, so the browser's own bar matches the page it sits on.
    { media: "(prefers-color-scheme: light)", color: "#FFF3D9" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1035" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The poster look's font variables sit on the document itself, because app/globals.css reads them from :root.
    <html lang="en" dir="ltr" className={`${anton.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        {/* Before anything is painted, so a chosen appearance never flashes the other one first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <SerwistProvider swUrl="/serwist/sw.js">
          <AccountProvider>{children}</AccountProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
