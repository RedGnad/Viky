import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Character } from "@/app/kit/Character";
import { AMOUNT_IN_TITLE, DISPLAY, MARK } from "@/app/components/ui";
import { LINK_PREVIEW, NAV } from "@/src/sentences";
import { PREVIEW_EXAMPLE } from "../../example";
import { requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { lookById } from "../../look-css";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory, link preview (dev)" };

/**
 * The image a messaging app shows under a gift's link (brief, section 7 bis), in one look, at the 1200 by 630 of a
 * link preview: the gift character, and who put how much in the person's name. Where Viky is met most, since the
 * person opens the app as little as possible. Drawn by day: a preview image has no night.
 */
export default async function Page({ params }: Readonly<{ params: Promise<{ look: string }> }>) {
  await requireLab();
  const look = lookById((await params).look);
  if (!look) notFound();
  // The product's own sentence (src/sentences.ts), with the amount handed to the text face.
  const [before, after] = LINK_PREVIEW.named(PREVIEW_EXAMPLE.funder, PREVIEW_EXAMPLE.amount).split(PREVIEW_EXAMPLE.amount);
  const type = { "--type-display": "80px", "--type-display-leading": "84px", "--type-mark": "40px", "--type-mark-leading": "44px" } as CSSProperties;
  return (
    <LabFrame look={look} appearance="day">
      <div data-preview className="flex h-[630px] w-[1200px] items-center gap-[64px] overflow-hidden bg-[var(--background)] px-[96px]" style={type}>
        <Character state="gift" className="h-auto w-[340px] shrink-0" />
        <div className="flex flex-col gap-[28px]">
          <span className={MARK}>{NAV.mark}</span>
          <p className={DISPLAY}>
            {before}
            <span className={AMOUNT_IN_TITLE}>{PREVIEW_EXAMPLE.amount}</span>
            {after}
          </p>
        </div>
      </div>
    </LabFrame>
  );
}
