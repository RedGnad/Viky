"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { NAV } from "@/src/sentences";

/**
 * The three destinations: a bar at the bottom below 840 pixels, a rail on the left from 840 (Material: "Don't use
 * navigation bars for desktop layouts. Instead, use a navigation rail"; Apple: "switch from a tab bar to a
 * sidebar"). Three, because Viky has an account, a balance and gifts that last weeks: an app of money, and every
 * reference has a bar. Offering and taking out are actions, so they are tasks that open over these, never
 * destinations (Apple: "Use a tab bar to support navigation, not to provide actions").
 *
 * Nothing is drawn without an account: with none there is nowhere to go. The active destination is the second
 * and last use of the accent on a screen, after the primary button (structure of 17 Sep, section 12, item 5).
 * Labels are always visible, and the bar sits above the device's bottom inset by its own offset rather than by
 * padding, which is the pattern Chrome watches for.
 */

export type Destination = "home" | "gifts" | "me";

const DESTINATIONS: ReadonlyArray<{ id: Destination; href: string; label: string; icon: (active: boolean) => React.ReactNode }> = [
  { id: "home", href: "/", label: NAV.home, icon: (active) => <HomeIcon active={active} /> },
  { id: "gifts", href: "/gifts", label: NAV.gifts, icon: (active) => <GiftIcon active={active} /> },
  { id: "me", href: "/me", label: NAV.me, icon: (active) => <MeIcon active={active} /> },
];

export function Nav({ active }: Readonly<{ active: Destination }>) {
  const { address } = useAccount();
  if (!address) return null;
  const items = DESTINATIONS.map((destination) => {
    const current = destination.id === active;
    return (
      <li key={destination.id} className="flex flex-1">
        <Link
          href={destination.href}
          aria-current={current ? "page" : undefined}
          className={`flex min-h-[var(--tap-target)] flex-1 flex-col items-center justify-center gap-[2px] text-[length:var(--type-help)] leading-[var(--type-help-leading)] ${current ? "font-medium" : ""} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-text)]`}
        >
          {/* The pill behind the icon is the accent, on the active destination only. */}
          <span className={`inline-flex h-[28px] w-[52px] items-center justify-center rounded-full ${current ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--text)]"}`}>
            {destination.icon(current)}
          </span>
          <span>{destination.label}</span>
        </Link>
      </li>
    );
  });
  return (
    <nav aria-label="Viky">
      <ul
        className="fixed inset-x-0 z-40 flex h-[var(--nav-bar-height)] items-stretch border-t border-[var(--divider)] bg-[var(--surface)] [@media(min-width:840px)]:hidden"
        style={{ bottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {items}
      </ul>
      <ul className="fixed inset-y-0 left-0 z-40 hidden w-[var(--nav-rail-width)] flex-col items-stretch gap-[var(--space-sm)] border-r border-[var(--divider)] bg-[var(--surface)] pt-[var(--space-xxxl)] [@media(min-width:840px)]:flex [&>li]:flex-none [&>li]:min-h-[64px]">
        {items}
      </ul>
    </nav>
  );
}

/** Three line drawings, 24 by 24, in the current colour, so they take the pill's ink when active. */
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" />
    </svg>
  );
}

function GiftIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M3 9h18M12 9v11M12 9c-3 0-5-1.5-5-3.2S9 3 10.5 4.2 12 9 12 9Zm0 0c3 0 5-1.5 5-3.2S15 3 13.5 4.2 12 9 12 9Z" stroke={active ? "var(--on-accent)" : "currentColor"} />
    </svg>
  );
}

function MeIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  );
}
