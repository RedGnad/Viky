import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorCanSeeDevPages } from "@/src/dev-access";
import { CARD } from "../components/ui";

export const metadata: Metadata = {
  title: "Operator (dev)",
};

/**
 * The way in to the operator's own pages.
 *
 * It exists because there was none: every dev page had to be reached by typing its path, which on a phone
 * meant it could not really be reached at all, and a page that cannot be opened is a page that does not
 * work. No consumer screen links here, and nobody but the operator's signed-in browser is served it.
 */
const PAGES: ReadonlyArray<{ href: string; name: string; what: string }> = [
  { href: "/dev/states", name: "Every state, both journeys", what: "all the states on one page, with the words each one shows today and the ones with no words yet" },
  { href: "/dev/fund", name: "Make a gift", what: "the funder journey, driven by hand" },
  { href: "/dev/exit", name: "Take money out", what: "the way out, by hand" },
  { href: "/dev/check", name: "Check the deployment", what: "what the contract and the relayer say about themselves right now" },
];

export default async function Page() {
  if (!(await operatorCanSeeDevPages())) notFound();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Operator</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          These pages are yours alone. They are served only to a signed-in account named as an operator, and nothing
          on the product links to them.
        </p>
      </header>
      <ul className="space-y-3">
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className={`${CARD} block`}>
              <span className="font-medium">{page.name}</span>
              <span className="block text-sm text-gray-600 dark:text-gray-400">{page.what}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
