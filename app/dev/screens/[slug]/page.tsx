import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EXAMPLE_SCREENS } from "@/app/components/gallery/screens";
import { Screen } from "@/app/components/Screen";
import { galleryOpen } from "@/src/dev-access";
import { HELP } from "@/app/components/ui";

export const metadata: Metadata = { title: "Example screen" };

/** Read at request time: prerendering would bake in whether the switch was on the day the site was built. */
export const dynamic = "force-dynamic";

/** One example screen, alone, at the width of whatever is looking at it, so a capture is the screen itself. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  if (!galleryOpen()) notFound();
  const { slug } = await params;
  const screen = EXAMPLE_SCREENS.find((candidate) => candidate.slug === slug);
  if (!screen) notFound();
  return (
    <Screen>
      <p className={`${HELP} rounded-full border border-[var(--control-border)] px-[var(--space-md)] py-[var(--space-xs)] text-center`}>
        Example data{screen.builtFrom ? "" : ", and this screen is not built yet"}
      </p>
      {screen.render()}
    </Screen>
  );
}
