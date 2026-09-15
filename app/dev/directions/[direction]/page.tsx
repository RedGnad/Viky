import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { galleryOpen } from "@/src/dev-access";
import { DIRECTIONS } from "../directions";

export const metadata: Metadata = { title: "Direction preview", robots: { index: false, follow: false } };

/** Read at request time, for the reason app/dev/screens/page.tsx gives: a prerendered page keeps the door it was built with. */
export const dynamic = "force-dynamic";

/**
 * One of four throwaway directions for the top of the signed-out home, at /dev/directions/1 to /4. It is not the
 * product: the real home is untouched, the button does nothing, and the page answers 404 unless VIKY_DESIGN_GALLERY
 * is switched on, the same switch as the design gallery.
 */
export default async function Page({ params }: Readonly<{ params: Promise<{ direction: string }> }>) {
  if (!galleryOpen()) notFound();
  const { direction } = await params;
  if (!Object.hasOwn(DIRECTIONS, direction)) notFound();
  const Preview = DIRECTIONS[direction];
  return <Preview />;
}
