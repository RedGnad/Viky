import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EXAMPLE_SCREENS } from "@/app/components/gallery/screens";
import { galleryOpen } from "@/src/dev-access";
import { CARD, HELP, TITLE } from "@/app/components/ui";

export const metadata: Metadata = { title: "Example screens" };

/**
 * Read at request time, not at build time. Prerendering baked the closed door into the page: the switch was
 * off while the site was being built, so every one of these answered 404 for ever afterwards, whatever the
 * environment said later.
 */
export const dynamic = "force-dynamic";

/**
 * Every screen that matters, from example data, so a design pass can be looked at.
 *
 * Open on a switch of its own rather than behind the operator lock, and the reason is worth stating: the
 * operator pages move money, so they are locked to a signed-in operator, which also means no script can ever
 * photograph one. This page moves nothing, reads nothing and has no working control on it. It is off unless
 * VIKY_DESIGN_GALLERY says otherwise, and that is never set in production.
 */
export default async function Page() {
  if (!galleryOpen()) notFound();
  return (
    <main className="mx-auto flex w-full max-w-[var(--app-column-max)] flex-col gap-[var(--space-lg)] px-[var(--page-margin)] py-[var(--space-xl)]">
      <h1 className={TITLE}>Example screens</h1>
      <p className={HELP}>
        Example data. No amount here is anybody&apos;s, and nothing on these pages does anything.
      </p>
      {EXAMPLE_SCREENS.map((screen) => (
        <Link key={screen.slug} href={`/dev/screens/${screen.slug}`} className={`${CARD} block`}>
          <span className="font-medium">{screen.title}</span>
          <span className={`block ${HELP}`}>
            {screen.who === "funder" ? "The person who gives" : "The person the gift is for"}
            {screen.builtFrom ? "" : " \u00b7 not built yet"}
          </span>
        </Link>
      ))}
    </main>
  );
}
