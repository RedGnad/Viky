import Link from "next/link";

/**
 * One link out of every screen, to the one place that holds everything which is not a gift and not money.
 *
 * It used to be four links (home, privacy, legal, judges) at the bottom of every page. That is a navigation
 * bar by another name, and the structure does not have one: GOV.UK asks for no navigation links when a
 * service has a clear end-to-end path, and the pages those links pointed at are read once, if ever. They live
 * on the Account screen now.
 */
export function Footer({ current }: { current?: string }) {
  if (current === "/account") return null;
  return (
    <footer className="flex">
      <Link
        href="/account"
        className="inline-flex min-h-[var(--tap-target)] items-center text-[length:var(--type-help)] text-[var(--muted)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
      >
        Account, help and legal
      </Link>
    </footer>
  );
}
