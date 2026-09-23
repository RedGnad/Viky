import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GiftPage } from "@/app/components/GiftPage";
import { forcedAppearance, requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { exampleById } from "../examples";

export const metadata: Metadata = { ...LAB_METADATA, title: "A gift's page, one moment (dev)" };

type Props = Readonly<{ params: Promise<{ example: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * One moment of a gift's page for one reader (V4), drawn by the production page from example data. The funder and
 * the person it is for are signed in with the laboratory's account, which exists only on screen; the outsider is that
 * same account reading a gift that is not theirs; and the reader without an account is drawn with nobody signed in.
 */
export default async function Page({ params, searchParams }: Props) {
  await requireLab();
  // Dated from the request's own moment, so the days and the next reading are today's (the examples' default clock).
  const example = exampleById((await params).example);
  if (!example) notFound();
  const appearance = forcedAppearance((await searchParams).appearance);
  return (
    <LabFrame appearance={appearance} signedIn={example.reader !== "signedOut"}>
      <p className="bg-[var(--accent)] px-[var(--page-margin)] py-[var(--space-xs)] text-center text-[length:var(--type-help)] text-[var(--on-accent)]">
        Example data. Nothing here is anybody&apos;s gift: {example.shape}, {example.moment}, {example.reader}.
      </p>
      <GiftPage giftId={example.status.giftId} linkKey={example.moment === "unopened" && example.reader !== "funder" ? "example-link-key-0000" : null} initialStatus={example.status} />
    </LabFrame>
  );
}
