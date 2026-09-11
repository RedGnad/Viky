import Link from "next/link";

/**
 * The one footer of the product. It exists as a component so the links stay the same everywhere and so
 * their tap targets stay big enough for a thumb: a browser test measures them, and inline text links were
 * sixteen pixels tall before this. The link to the page you are on is left out.
 */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/privacy", label: "Privacy" },
  { href: "/legal", label: "Legal" },
  { href: "/judges", label: "For judges" },
] as const;

export function Footer({ current }: { current?: string }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-5" style={{ color: "var(--muted)" }}>
      {LINKS.filter((link) => link.href !== current).map((link) => (
        <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-xs underline">
          {link.label}
        </Link>
      ))}
    </footer>
  );
}
